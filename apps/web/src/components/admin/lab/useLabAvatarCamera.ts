"use client";

/**
 * Staff-lab twin of hooks/useAvatarCamera: the same pipeline
 * (camera → MediaPipe FaceLandmarker → FaceTracker → KitRenderer → captureStream)
 * plus debug taps the production hook deliberately doesn't have:
 *
 *  - live raw and processed blendshapes, 478 landmarks, head pose
 *  - tracking FPS and detection time
 *  - the hidden camera <video> element, so the lab can optionally show the
 *    staff member's OWN picture ("показать исходное видео"). It is never sent
 *    anywhere and is off by default.
 *  - camera choice, calibration length.
 *
 * Only used under /admin/lab (staff permission "lab.use").
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarConfig } from "@/lib/avatar/schema";
import type { Framing } from "@/lib/avatar/kit/types";
import { FaceTracker, type LandmarkerResult } from "@/lib/tracking/FaceTracker";
import { backdropCanvas, paintBackdrop, type BackdropId } from "@/lib/avatar/backdrops";

const MP_VERSION = "0.10.14";
const SOURCES = [
  { wasm: "/mediapipe/wasm", model: "/mediapipe/face_landmarker.task" },
  {
    wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
    model: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  },
];

type KitRendererT = InstanceType<typeof import("@/lib/avatar/kit/KitRenderer").KitRenderer>;

export interface LabDebug {
  /** model output, name → 0…1 */
  raw: Record<string, number>;
  /** after neutral calibration, landmark refinement and One-Euro filtering */
  processed: Record<string, number>;
  /** normalized 0…1 image coordinates */
  landmarks: { x: number; y: number }[];
  /** head yaw/pitch/roll, degrees (from the transformation matrix) */
  pose: { yaw: number; pitch: number; roll: number } | null;
  trackFps: number;
  detectMs: number;
  frames: number;
  faceVisible: boolean;
  videoWidth: number;
  videoHeight: number;
  delegate: string;
}

export interface LabCameraOptions {
  backdrop?: BackdropId;
  framing?: Framing;
  calibrationSeconds?: number;
  deviceId?: string;
  idle?: boolean;
}

export type LabCamState = "idle" | "starting" | "ready" | "error";

function poseFromMatrix(m: ArrayLike<number>): { yaw: number; pitch: number; roll: number } {
  // column-major 4×4, rotation part → Euler YXZ (degrees)
  const pitch = Math.asin(-Math.max(-1, Math.min(1, m[6])));
  const yaw = Math.atan2(m[2], m[10]);
  const roll = Math.atan2(m[4], m[5]);
  const d = 180 / Math.PI;
  return { yaw: yaw * d, pitch: pitch * d, roll: roll * d };
}

export function useLabAvatarCamera(config: AvatarConfig, options: LabCameraOptions = {}) {
  const [state, setState] = useState<LabCamState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [tracking, setTracking] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [runId, setRunId] = useState(0);

  const debugRef = useRef<LabDebug>({
    raw: {},
    processed: {},
    landmarks: [],
    pose: null,
    trackFps: 0,
    detectMs: 0,
    frames: 0,
    faceVisible: false,
    videoWidth: 0,
    videoHeight: 0,
    delegate: "",
  });
  const rendererRef = useRef<KitRendererT | null>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const cfgRef = useRef(config);
  cfgRef.current = config;
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    rendererRef.current?.setConfig(config);
  }, [config]);
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !options.backdrop) return;
    return backdropCanvas(options.backdrop, (c) => r.setBackground(c));
  }, [options.backdrop, canvas]);
  useEffect(() => {
    if (options.framing) rendererRef.current?.setFraming(options.framing);
  }, [options.framing, canvas]);
  useEffect(() => {
    rendererRef.current?.setIdle(options.idle ?? true);
  }, [options.idle, canvas]);

  useEffect(() => {
    if (runId === 0) return;
    let cancelled = false;
    let stopLoop = () => {};
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => unknown; close: () => void } | null = null;
    let cam: MediaStream | null = null;
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;

    (async () => {
      setState("starting");
      setError(null);
      const deviceId = optsRef.current.deviceId;
      try {
        cam = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }),
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (e) {
        if (cancelled) return;
        setState("error");
        setError(`Камера не включилась: ${(e as DOMException)?.name || "ошибка"}. Разрешите доступ к камере и микрофону.`);
        return;
      }
      if (cancelled) {
        cam.getTracks().forEach((t) => t.stop());
        return;
      }
      v.srcObject = new MediaStream(cam.getVideoTracks());
      await v.play().catch(() => undefined);

      let r: KitRendererT;
      const c = document.createElement("canvas");
      try {
        const { KitRenderer } = await import("@/lib/avatar/kit/KitRenderer");
        if (cancelled) return;
        c.width = 540;
        c.height = 720;
        Object.assign(c.style, { width: "100%", height: "100%", display: "block", objectFit: "cover" });
        r = new KitRenderer(c, {
          framing: optsRef.current.framing ?? "portrait",
          background: "#1d1d22",
          idle: optsRef.current.idle ?? true,
          preserveDrawingBuffer: true,
          maxPixelRatio: 1,
          fps: 30,
        });
        r.resize(540, 720);
        r.setConfig(cfgRef.current);
        if (optsRef.current.backdrop) r.setBackground(paintBackdrop(optsRef.current.backdrop));
        r.start();
      } catch (e) {
        cam.getTracks().forEach((t) => t.stop());
        if (cancelled) return;
        setState("error");
        setError(`3D-рендер недоступен: ${(e as Error)?.message ?? e}`);
        return;
      }
      rendererRef.current = r;
      const out = r.captureStream(30);
      setCanvas(c);
      setVideo(v);
      setVideoStream(out);
      setAudioStream(cam.getAudioTracks().length ? new MediaStream(cam.getAudioTracks()) : null);
      setState("ready");

      let delegateUsed = "";
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        outer: for (const src of SOURCES) {
          let fileset;
          try {
            fileset = await FilesetResolver.forVisionTasks(src.wasm);
          } catch {
            continue;
          }
          for (const delegate of ["GPU", "CPU"] as const) {
            if (cancelled) return;
            try {
              landmarker = (await FaceLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: src.model, delegate },
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                runningMode: "VIDEO",
                numFaces: 1,
              })) as unknown as typeof landmarker;
              delegateUsed = `${delegate}${src.wasm.startsWith("/") ? "" : " (CDN)"}`;
              break outer;
            } catch {
              /* next */
            }
          }
        }
      } catch {
        /* tracking unavailable */
      }
      if (cancelled || !landmarker) return;
      setTracking(true);
      debugRef.current.delegate = delegateUsed;

      const tracker = new FaceTracker({ calibrationSeconds: optsRef.current.calibrationSeconds ?? 1.5 });
      trackerRef.current = tracker;
      setCalibrating(true);

      let lastTs = -1;
      let lastMediaTime = -1;
      let lastFace = performance.now();
      let calib = true;
      const stamps: number[] = [];

      const onFrame = (mediaTime: number) => {
        if (cancelled || v.readyState < 2 || mediaTime === lastMediaTime) return;
        lastMediaTime = mediaTime;
        const ts = Math.max(Math.round(mediaTime * 1000), lastTs + 1);
        lastTs = ts;
        const now = performance.now();
        const dbg = debugRef.current;
        try {
          const t0 = performance.now();
          const raw = landmarker!.detectForVideo(v, ts) as LandmarkerResult;
          dbg.detectMs = dbg.detectMs * 0.8 + (performance.now() - t0) * 0.2;
          const res = tracker.process(raw, ts, v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 4 / 3);
          const cats = raw?.faceBlendshapes?.[0]?.categories;
          if (cats) {
            const rawMap: Record<string, number> = {};
            for (const x of cats) rawMap[x.categoryName] = x.score;
            dbg.raw = rawMap;
          }
          dbg.landmarks = (raw?.faceLandmarks?.[0] ?? []) as { x: number; y: number }[];
          const mtx = raw?.facialTransformationMatrixes?.[0]?.data;
          dbg.pose = mtx && mtx.length >= 16 ? poseFromMatrix(mtx) : null;
          if (res) {
            if (now - lastFace > 500) tracker.resetFilters();
            lastFace = now;
            const pm: Record<string, number> = {};
            for (const x of res.faceBlendshapes?.[0]?.categories ?? []) pm[x.categoryName] = x.score;
            dbg.processed = pm;
            r.applyFaceResult(res);
          }
        } catch {
          /* transient */
        }
        stamps.push(now);
        while (stamps.length && now - stamps[0] > 1000) stamps.shift();
        dbg.trackFps = stamps.length;
        dbg.frames++;
        dbg.faceVisible = now - lastFace < 700;
        dbg.videoWidth = v.videoWidth;
        dbg.videoHeight = v.videoHeight;
        if (tracker.calibrating !== calib) {
          calib = tracker.calibrating;
          setCalibrating(calib);
        }
      };

      type RVFC = (cb: (now: number, meta: { mediaTime: number }) => void) => number;
      const vv = v as HTMLVideoElement & { requestVideoFrameCallback?: RVFC; cancelVideoFrameCallback?: (h: number) => void };
      let handle = 0;
      let raf = 0;
      let got = 0;
      const rafLoop = () => {
        if (cancelled) return;
        raf = requestAnimationFrame(rafLoop);
        onFrame(v.currentTime);
      };
      if (typeof vv.requestVideoFrameCallback === "function") {
        const vfc = (_n: number, meta: { mediaTime: number }) => {
          if (cancelled) return;
          got++;
          handle = vv.requestVideoFrameCallback!(vfc);
          onFrame(meta.mediaTime);
        };
        handle = vv.requestVideoFrameCallback(vfc);
        const watchdog = window.setTimeout(() => {
          if (!cancelled && got === 0) {
            vv.cancelVideoFrameCallback?.(handle);
            rafLoop();
          }
        }, 1500);
        stopLoop = () => {
          clearTimeout(watchdog);
          vv.cancelVideoFrameCallback?.(handle);
          cancelAnimationFrame(raf);
        };
      } else {
        rafLoop();
        stopLoop = () => cancelAnimationFrame(raf);
      }
    })();

    return () => {
      cancelled = true;
      stopLoop();
      trackerRef.current = null;
      landmarker?.close();
      cam?.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      setCanvas(null);
      setVideo(null);
      setVideoStream(null);
      setAudioStream(null);
      setTracking(false);
      setCalibrating(false);
      debugRef.current = { ...debugRef.current, raw: {}, processed: {}, landmarks: [], pose: null, trackFps: 0, frames: 0, faceVisible: false };
    };
  }, [runId]);

  const start = useCallback(() => setRunId((n) => n + 1), []);
  const stop = useCallback(() => {
    setRunId(0);
    setState("idle");
  }, []);
  const recalibrate = useCallback(() => {
    trackerRef.current?.recalibrate();
    if (trackerRef.current) setCalibrating(true);
  }, []);

  return { state, error, canvas, video, videoStream, audioStream, tracking, calibrating, debugRef, recalibrate, start, stop };
}
