/**
 * FaceDetector — runs MediaPipe FaceLandmarker on camera frames, preferably in
 * a Web Worker (landmarker.worker.ts) so the ~5–30 ms of model time never
 * blocks rendering, the UI or WebRTC. Falls back to the main thread when
 * workers / OffscreenCanvas / createImageBitmap are unavailable or the worker
 * fails to start.
 *
 * Only one frame is in flight at a time: when the detector is busy, a new
 * camera frame is dropped instead of queued, so results are never stale.
 */
import type { LandmarkerResult } from "./FaceTracker";
import type { Landmark } from "./faceMath.mjs";
import { avatarPerf } from "./perf";
import { HAND_INTERVAL_MS, type HandDetection, type HandsCallback } from "./handTypes";

const MP_VERSION = "0.10.14"; // must match package.json exactly
// Served from our own origin first (see scripts/copy-mediapipe.mjs); CDN as a fallback.
export const MP_SOURCES = [
  { wasm: "/mediapipe/wasm", model: "/mediapipe/face_landmarker.task", hand: "/mediapipe/hand_landmarker.task" },
  {
    wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
    model: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  },
];

/** raw: null when no face; `since` is when the camera frame became available (performance.now()) */
export type DetectCallback = (raw: LandmarkerResult | null, since: number) => void;

export interface FaceDetector {
  readonly backend: string;
  /** Offer a camera frame. Returns false if the detector is busy (frame dropped). */
  push(video: HTMLVideoElement, tsMs: number, since: number): boolean;
  /** Hand tracking on/off (results go to `onHands` of createFaceDetector); loads the model on first use. */
  setHands?(on: boolean): void;
  close(): void;
}

type MainLandmarker = { detectForVideo: (v: HTMLVideoElement, t: number) => unknown; close: () => void };

function absolute(u: string) {
  return new URL(u, window.location.href).href;
}

function softwareGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
  } catch {
    return true;
  }
}

/** Worker-backed detector; resolves null if the worker can't start within `timeoutMs`. */
async function createWorkerDetector(onResult: DetectCallback, onHands?: HandsCallback, timeoutMs = 30000): Promise<FaceDetector | null> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL("./landmarker.worker.ts", import.meta.url));
  } catch {
    return null;
  }
  const ready = await new Promise<string | null>((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    worker.onmessage = (e) => {
      if (e.data?.type === "ready") {
        clearTimeout(t);
        resolve(e.data.delegate as string);
      } else if (e.data?.type === "error") {
        clearTimeout(t);
        resolve(null);
      }
    };
    worker.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
    worker.postMessage({ type: "init", sources: MP_SOURCES.map((s) => ({ wasm: absolute(s.wasm), model: absolute(s.model), hand: absolute(s.hand) })) });
  });
  if (!ready) {
    worker.terminate();
    return null;
  }

  let names: string[] = [];
  let inFlight = false;
  let nextId = 0;
  const since = new Map<number, number>();
  const handSince = new Map<number, number>();
  let closed = false;
  const det: FaceDetector = {
    backend: `worker/${ready}`,
    push(video, tsMs, t0) {
      if (closed) return false;
      if (inFlight) {
        avatarPerf.dropped++;
        return false;
      }
      inFlight = true;
      const id = ++nextId;
      since.set(id, t0);
      createImageBitmap(video)
        .then((bitmap) => {
          if (closed) {
            bitmap.close();
            return;
          }
          worker.postMessage({ type: "frame", bitmap, ts: tsMs, id }, [bitmap]);
        })
        .catch(() => {
          inFlight = false;
          since.delete(id);
        });
      return true;
    },
    setHands(on) {
      if (!closed) worker.postMessage({ type: "hands", on });
    },
    close() {
      closed = true;
      worker.postMessage({ type: "close" });
      setTimeout(() => worker.terminate(), 500);
    },
  };
  worker.onmessage = (e) => {
    const m = e.data;
    if (!m || closed) return;
    if (m.type === "skip") {
      inFlight = false;
      since.delete(m.id);
      return;
    }
    if (m.type === "hands") {
      avatarPerf.handDetected(m.ms);
      onHands?.({ hands: m.hands as HandDetection[] }, handSince.get(m.id) ?? performance.now());
      handSince.delete(m.id);
      return;
    }
    if (m.type === "hands-error") {
      avatarPerf.log("hand model unavailable → hands off");
      avatarPerf.hands = "unavailable";
      return;
    }
    if (m.type !== "result") return;
    inFlight = false;
    const t0 = since.get(m.id) ?? performance.now();
    since.delete(m.id);
    // the worker may still post hands for this frame
    handSince.set(m.id, t0);
    if (handSince.size > 8) handSince.delete(handSince.keys().next().value as number);
    (det as { backend: string }).backend = `worker/${m.delegate}`;
    avatarPerf.backend = det.backend;
    avatarPerf.detected(m.ms);
    if (!m.face) {
      onResult(null, t0);
      return;
    }
    if (m.names) names = m.names;
    const scores = m.scores as Float32Array;
    const pts = m.pts as Float32Array;
    const categories = new Array(scores.length);
    for (let i = 0; i < scores.length; i++) categories[i] = { categoryName: names[i], score: scores[i] };
    const lm: Landmark[] = new Array(pts.length / 3);
    for (let i = 0; i < lm.length; i++) lm[i] = { x: pts[i * 3], y: pts[i * 3 + 1], z: pts[i * 3 + 2] };
    const raw: LandmarkerResult = {
      faceBlendshapes: [{ categories }],
      faceLandmarks: lm.length ? [lm] : [],
      facialTransformationMatrixes: m.matrix ? [{ data: m.matrix as Float32Array }] : [],
    };
    onResult(raw, t0);
  };
  worker.onerror = () => {
    inFlight = false;
  };
  return det;
}

/** Same thing on the main thread (older Safari, no OffscreenCanvas, worker failure). */
async function createMainDetector(onResult: DetectCallback, isCancelled: () => boolean, onHands?: HandsCallback): Promise<FaceDetector | null> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  let fs: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
  let handSrc = "";
  const order = softwareGL() ? (["CPU", "GPU"] as const) : (["GPU", "CPU"] as const);
  let lm: MainLandmarker | null = null;
  let delegate: string = order[0];
  outer: for (const src of MP_SOURCES) {
    let fileset;
    try {
      fileset = await FilesetResolver.forVisionTasks(src.wasm);
    } catch {
      continue;
    }
    for (const d of order) {
      if (isCancelled()) return null;
      try {
        lm = (await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: src.model, delegate: d },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        })) as unknown as MainLandmarker;
        delegate = d;
        fs = fileset;
        handSrc = src.hand;
        break outer;
      } catch {
        /* next */
      }
    }
  }
  if (!lm) return null;
  let lastTs = -1;
  const inst = lm;
  // hands on the main thread: same model, lower rate (the page's own thread pays for it)
  const H = {
    on: false,
    lm: null as MainLandmarker | null,
    pack: null as null | ((r: never) => ReturnType<typeof import("./handLandmarker").packHands>),
    loading: false,
    failed: false,
    last: -1e9,
    lastTs: -1,
  };
  const ensureHands = async () => {
    if (H.lm || H.loading || H.failed || !fs) return;
    H.loading = true;
    const { createHandLandmarker, packHands } = await import("./handLandmarker");
    H.pack = packHands as (r: never) => ReturnType<typeof packHands>;
    const r = await createHandLandmarker(fs, handSrc, delegate === "GPU" ? ["GPU", "CPU"] : ["CPU", "GPU"]).catch(() => null);
    H.loading = false;
    if (!r) {
      H.failed = true;
      avatarPerf.hands = "unavailable";
      return;
    }
    if (!H.on) r.lm.close();
    else H.lm = r.lm as unknown as MainLandmarker;
  };
  return {
    backend: `main/${delegate}`,
    push(video, tsMs, t0) {
      const ts = Math.max(Math.round(tsMs), lastTs + 1);
      lastTs = ts;
      const s = performance.now();
      let raw: LandmarkerResult | null = null;
      try {
        raw = inst.detectForVideo(video, ts) as LandmarkerResult;
      } catch {
        raw = null;
      }
      avatarPerf.detected(performance.now() - s);
      onResult(raw?.faceBlendshapes?.[0]?.categories?.length ? raw : null, t0);
      if (H.on && H.lm && H.pack && ts - H.last >= HAND_INTERVAL_MS * 1.5) {
        H.last = ts;
        const hts = Math.max(ts, H.lastTs + 1);
        H.lastTs = hts;
        const h0 = performance.now();
        let hr: unknown = null;
        try {
          hr = H.lm.detectForVideo(video, hts);
        } catch {
          hr = null;
        }
        avatarPerf.handDetected(performance.now() - h0);
        onHands?.(H.pack(hr as never), t0);
      }
      return true;
    },
    setHands(on) {
      H.on = on;
      if (on) void ensureHands();
      else {
        H.lm?.close();
        H.lm = null;
      }
    },
    close() {
      H.lm?.close();
      inst.close();
    },
  };
}

function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : 0;
}

/** Frames measured per candidate before the worker/main decision. */
const PROBE_FRAMES = 30;
/** A worker slower than this (camera frame → result, median) is always challenged. */
const WORKER_BUDGET_MS = 60;

/**
 * Worker first, with a safety net: after ~30 frames, if the worker's median
 * detection time (frame handed over → result back) is above 60 ms, the same
 * model is started on the main thread and measured; whichever is faster wins.
 * So the worker can never make tracking slower than the old main-thread path.
 * The decision is logged in `window.__avatarPerf.decision`.
 */
export async function createFaceDetector(
  onResult: DetectCallback,
  opts: { isCancelled: () => boolean; worker?: boolean; onHands?: HandsCallback },
): Promise<FaceDetector | null> {
  const mainOnly = async (why: string) => {
    const m = await createMainDetector(onResult, opts.isCancelled, opts.onHands).catch(() => null);
    if (m) {
      avatarPerf.backend = m.backend;
      avatarPerf.log(`main thread: ${why}`);
    }
    return m;
  };
  if (opts.worker === false) return mainOnly("forced (?detector=main)");

  // Timing wrapper: measures push → result for whichever detector is active.
  const pushedAt = new Map<string, number>();
  const samples: Record<"worker" | "main", number[]> = { worker: [], main: [] };
  let active: "worker" | "main" = "worker";
  let decided = false;
  let worker: FaceDetector | null = null;
  let main: FaceDetector | null = null;
  let challenging = false;

  const wrap = (who: "worker" | "main"): DetectCallback => (raw, since) => {
    const t0 = pushedAt.get(who);
    if (t0 !== undefined && !decided) samples[who].push(performance.now() - t0);
    pushedAt.delete(who);
    if (who === active) onResult(raw, since);
    evaluate();
  };

  function evaluate() {
    if (decided || challenging) return;
    if (active === "worker" && samples.worker.length >= PROBE_FRAMES) {
      const w = median(samples.worker);
      if (w <= WORKER_BUDGET_MS) {
        decided = true;
        avatarPerf.log(`worker kept: median ${w.toFixed(1)} ms ≤ ${WORKER_BUDGET_MS} ms`);
        return;
      }
      challenging = true;
      avatarPerf.log(`worker slow (median ${w.toFixed(1)} ms) → measuring main thread`);
      createMainDetector(wrap("main"), opts.isCancelled, handsFrom("main"))
        .catch(() => null)
        .then((m) => {
          challenging = false;
          if (!m || opts.isCancelled()) {
            decided = true;
            m?.close();
            avatarPerf.log("main thread unavailable → worker kept");
            return;
          }
          main = m;
          m.setHands?.(handsOn);
          active = "main";
          avatarPerf.backend = m.backend;
        });
    } else if (active === "main" && samples.main.length >= Math.round(PROBE_FRAMES / 2)) {
      decided = true;
      const w = median(samples.worker);
      const m = median(samples.main.slice(3));
      if (m < w) {
        avatarPerf.log(`main thread wins: ${m.toFixed(1)} ms vs worker ${w.toFixed(1)} ms`);
        worker?.close();
        worker = null;
      } else {
        avatarPerf.log(`worker wins: ${w.toFixed(1)} ms vs main ${m.toFixed(1)} ms`);
        main?.close();
        main = null;
        active = "worker";
        avatarPerf.backend = composite.backend;
      }
    }
  }

  let handsOn = false;
  const handsFrom = (who: "worker" | "main"): HandsCallback => (raw, since) => {
    if (who === active) opts.onHands?.(raw, since);
  };
  worker = await createWorkerDetector(wrap("worker"), handsFrom("worker")).catch(() => null);
  if (!worker) {
    if (opts.isCancelled()) return null;
    return mainOnly("worker unavailable");
  }
  avatarPerf.backend = worker.backend;
  avatarPerf.log(`worker started (${worker.backend})`);

  const composite: FaceDetector = {
    get backend() {
      return (active === "main" ? main?.backend : worker?.backend) ?? "—";
    },
    push(video, tsMs, since) {
      const d = active === "main" ? main : worker;
      if (!d) return false;
      if (pushedAt.has(active)) return d.push(video, tsMs, since); // busy → the detector drops it
      pushedAt.set(active, performance.now());
      const ok = d.push(video, tsMs, since);
      if (!ok) pushedAt.delete(active);
      return ok;
    },
    setHands(on) {
      handsOn = on;
      worker?.setHands?.(on);
      main?.setHands?.(on);
    },
    close() {
      worker?.close();
      main?.close();
    },
  };
  return composite;
}
