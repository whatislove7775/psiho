/**
 * Face detection off the main thread.
 *
 * The page posts one camera frame at a time as an ImageBitmap (transferred,
 * never copied or stored); this worker runs MediaPipe FaceLandmarker on it and
 * posts back only numbers: 52 blendshape scores, 478 landmarks and the head
 * matrix. The picture itself is closed right after detection.
 *
 * Delegate choice: the GPU delegate is fastest on real graphics hardware but
 * is 10–50× slower than the CPU (XNNPACK) one on software GL (SwiftShader,
 * llvmpipe, blocklisted drivers). We start with GPU unless the GL renderer is
 * obviously software, then keep measuring for the first frames and switch to
 * CPU if GPU turns out slow.
 */
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

type Src = { wasm: string; model: string };
type Delegate = "GPU" | "CPU";

interface Scope {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
  close(): void;
}
const ctx = self as unknown as Scope;

let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
let source: Src | null = null;
let landmarker: FaceLandmarker | null = null;
let delegate: Delegate = "GPU";
let names: string[] | null = null;
let lastTs = -1;
/** per-delegate detect times for the auto-switch */
const probe: Record<Delegate, number[]> = { GPU: [], CPU: [] };
let settled = false;

function softwareGL(): boolean {
  try {
    const c = new OffscreenCanvas(1, 1);
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
  } catch {
    return true;
  }
}

async function create(d: Delegate): Promise<FaceLandmarker> {
  return FaceLandmarker.createFromOptions(fileset!, {
    baseOptions: { modelAssetPath: source!.model, delegate: d },
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    runningMode: "VIDEO",
    numFaces: 1,
  });
}

async function init(sources: Src[]) {
  const order: Delegate[] = typeof OffscreenCanvas !== "undefined" && !softwareGL() ? ["GPU", "CPU"] : ["CPU", "GPU"];
  for (const src of sources) {
    try {
      fileset = await FilesetResolver.forVisionTasks(src.wasm);
    } catch {
      continue;
    }
    source = src;
    for (const d of order) {
      try {
        landmarker = await create(d);
        delegate = d;
        settled = d === "CPU" && order[0] === "CPU";
        return true;
      } catch {
        /* next delegate */
      }
    }
  }
  return false;
}

/** After ~20 frames on GPU: if it is slow, measure CPU and keep the faster one. */
let switching = false;
async function maybeSwitch() {
  if (settled || switching || !landmarker) return;
  switching = true;
  try {
    await doSwitch();
  } finally {
    switching = false;
  }
}

async function doSwitch() {
  if (!landmarker) return;
  const g = probe.GPU;
  if (delegate === "GPU" && g.length >= 20) {
    const mean = g.slice(5).reduce((a, b) => a + b, 0) / (g.length - 5);
    if (mean < 30) {
      settled = true;
      return;
    }
    try {
      const cpu = await create("CPU");
      landmarker.close();
      landmarker = cpu;
      delegate = "CPU";
      lastTs = -1;
    } catch {
      settled = true;
    }
  } else if (delegate === "CPU" && probe.CPU.length >= 15) {
    settled = true;
    const c = probe.CPU.slice(3);
    const cpuMean = c.reduce((a, b) => a + b, 0) / c.length;
    const gpuMean = g.slice(5).reduce((a, b) => a + b, 0) / Math.max(1, g.length - 5);
    if (gpuMean < cpuMean * 0.8) {
      try {
        const gpu = await create("GPU");
        landmarker.close();
        landmarker = gpu;
        delegate = "GPU";
      } catch {
        /* keep CPU */
      }
    }
  }
}

let busy = false;

ctx.onmessage = async (e: MessageEvent) => {
  const m = e.data as
    | { type: "init"; sources: Src[] }
    | { type: "frame"; bitmap: ImageBitmap; ts: number; id: number }
    | { type: "close" };
  if (m.type === "init") {
    const ok = await init(m.sources).catch(() => false);
    ctx.postMessage(ok ? { type: "ready", delegate } : { type: "error" });
    return;
  }
  if (m.type === "close") {
    landmarker?.close();
    landmarker = null;
    ctx.close();
    return;
  }
  if (m.type !== "frame") return;
  const bitmap = m.bitmap;
  if (!landmarker || busy) {
    bitmap.close();
    ctx.postMessage({ type: "skip", id: m.id });
    return;
  }
  busy = true;
  const ts = Math.max(Math.round(m.ts), lastTs + 1); // VIDEO mode needs increasing timestamps
  lastTs = ts;
  const t0 = performance.now();
  let res: ReturnType<FaceLandmarker["detectForVideo"]> | null = null;
  try {
    res = landmarker.detectForVideo(bitmap, ts);
  } catch {
    res = null;
  } finally {
    bitmap.close();
  }
  const ms = performance.now() - t0;
  if (!settled) probe[delegate].push(ms);

  const cats = res?.faceBlendshapes?.[0]?.categories;
  const lm = res?.faceLandmarks?.[0];
  const mtx = res?.facialTransformationMatrixes?.[0]?.data;
  if (!cats?.length) {
    ctx.postMessage({ type: "result", id: m.id, ms, delegate, face: false });
  } else {
    let sendNames: string[] | undefined;
    if (!names || names.length !== cats.length) {
      names = cats.map((c) => c.categoryName);
      sendNames = names;
    }
    const scores = new Float32Array(cats.length);
    for (let i = 0; i < cats.length; i++) scores[i] = cats[i].score;
    const pts = new Float32Array((lm?.length ?? 0) * 3);
    if (lm) for (let i = 0; i < lm.length; i++) {
      pts[i * 3] = lm[i].x;
      pts[i * 3 + 1] = lm[i].y;
      pts[i * 3 + 2] = lm[i].z;
    }
    const matrix = mtx ? Float32Array.from(mtx) : null;
    const transfer: Transferable[] = [scores.buffer, pts.buffer];
    if (matrix) transfer.push(matrix.buffer);
    ctx.postMessage({ type: "result", id: m.id, ms, delegate, face: true, names: sendNames, scores, pts, matrix }, transfer);
  }
  busy = false;
  void maybeSwitch();
};
