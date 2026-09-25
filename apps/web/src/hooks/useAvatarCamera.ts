"use client";

/**
 * Camera → on-device face tracking → live 3D avatar → MediaStream.
 *
 *   getUserMedia ─► hidden <video> ─► MediaPipe FaceLandmarker (52 ARKit
 *   blendshapes + 478 landmarks + head pose), run on EVERY camera frame
 *   (requestVideoFrameCallback) ─► FaceTracker (neutral calibration,
 *   landmark-refined expressions, One-Euro filtering) ─► KitRenderer
 *   ─► canvas.captureStream()
 *
 * The real camera image never leaves this hook: only the rendered avatar
 * video and the microphone audio are exposed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarConfig } from "@/lib/avatar/schema";
import type { AvatarRendererApi } from "@/lib/avatar/kit/types";
import { FaceTracker, type LandmarkerResult } from "@/lib/tracking/FaceTracker";
import { paintBackdrop, type BackdropId } from "@/lib/avatar/backdrops";

const MP_VERSION = "0.10.14"; // must match package.json exactly
// Served from our own origin first (see scripts/copy-mediapipe.mjs); CDN as a fallback.
const SOURCES = [
  { wasm: "/mediapipe/wasm", model: "/mediapipe/face_landmarker.task" },
  {
    wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
    model: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  },
];

export type CameraState = "idle" | "starting" | "ready" | "denied" | "error";

export interface AvatarCamera {
  state: CameraState;
  error: string | null;
  /** avatar video + mic audio, ready to hand to RTCPeerConnection */
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  /** the live avatar canvas (mount it anywhere for a local preview) */
  canvas: HTMLCanvasElement | null;
  renderer: AvatarRendererApi | null;
  /** true while the face hasn't been detected for a few seconds */
  faceLost: boolean;
  /** true while a face is detected right now (reacts within ~0.7 s) */
  faceVisible: boolean;
  /** average brightness of the camera picture, 0…255 (null until measured). Only this number leaves the hook. */
  light: number | null;
  tracking: boolean;
  /** true while the user's neutral face is being captured (~1.5 s of a still face) */
  calibrating: boolean;
  /** capture the neutral face again (ask the user to relax and look at the camera) */
  recalibrate: () => void;
  start: () => void;
  stop: () => void;
}

export interface AvatarCameraOptions {
  /** background painted behind the avatar (part of the outgoing video) */
  backdrop?: BackdropId;
}

export function useAvatarCamera(config: AvatarConfig, options: AvatarCameraOptions = {}): AvatarCamera {
  const [state, setState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [faceLost, setFaceLost] = useState(false);
  const [faceVisible, setFaceVisible] = useState(false);
  const [light, setLight] = useState<number | null>(null);
  const [tracking, setTracking] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [runId, setRunId] = useState(0);

  const rendererRef = useRef<AvatarRendererApi | null>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  const backdropRef = useRef(options.backdrop);
  backdropRef.current = options.backdrop;

  useEffect(() => {
    rendererRef.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    const r = rendererRef.current;
    if (r && options.backdrop) r.setBackground?.(paintBackdrop(options.backdrop));
  }, [options.backdrop, canvas]);

  useEffect(() => {
    if (runId === 0) return;
    let cancelled = false;
    let stopLoop = () => {};
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => unknown; close: () => void } | null = null;
    let cam: MediaStream | null = null;
    let lightTimer: ReturnType<typeof setInterval> | undefined;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    (async () => {
      setState("starting");
      setError(null);
      try {
        cam = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (e) {
        if (cancelled) return;
        const name = (e as DOMException)?.name;
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
        setError(
          name === "NotAllowedError"
            ? "Доступ к камере запрещён. Разрешите камеру и микрофон в настройках браузера и попробуйте ещё раз."
            : name === "NotFoundError"
              ? "Камера или микрофон не найдены. Подключите устройство и попробуйте ещё раз."
              : "Не получилось включить камеру. Закройте другие приложения, которые её используют, и попробуйте ещё раз.",
        );
        return;
      }
      if (cancelled) {
        cam.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = new MediaStream(cam.getVideoTracks());
      await video.play().catch(() => undefined);

      // The avatar is the only picture that may ever be shown. If it can't be
      // rendered (no WebGL, driver crash) we stop the camera and explain —
      // never fall back to the raw video.
      let r: InstanceType<typeof import("@/lib/avatar/kit/KitRenderer").KitRenderer>;
      let stream: MediaStream;
      const c = document.createElement("canvas");
      try {
        const { KitRenderer } = await import("@/lib/avatar/kit/KitRenderer");
        if (cancelled) return;
        c.width = 540;
        c.height = 720;
        c.style.width = "100%";
        c.style.height = "100%";
        c.style.display = "block";
        c.style.objectFit = "cover";
        r = new KitRenderer(c, { framing: "portrait", background: "#1d1d22", idle: true, preserveDrawingBuffer: true, maxPixelRatio: 1, fps: 30 });
        r.resize(540, 720);
        r.setConfig(cfgRef.current);
        if (backdropRef.current) r.setBackground(paintBackdrop(backdropRef.current));
        r.start();
        stream = r.captureStream(30);
      } catch (e) {
        console.warn("[avatar] renderer unavailable:", e);
        cam.getTracks().forEach((t) => t.stop());
        cam = null;
        if (cancelled) return;
        setState("error");
        setError(
          "Не получилось показать аватар: браузер не поддерживает 3D-графику или она выключена. Откройте страницу в свежей версии Chrome, Safari или Firefox и включите аппаратное ускорение.",
        );
        return;
      }
      rendererRef.current = r;
      stream.getVideoTracks().forEach((t) => {
        try {
          (t as MediaStreamTrack & { contentHint: string }).contentHint = "motion";
        } catch {
          /* ignore */
        }
      });
      setCanvas(c);
      setVideoStream(stream);
      setAudioStream(cam.getAudioTracks().length ? new MediaStream(cam.getAudioTracks()) : null);
      setState("ready");

      // Rough light estimate from a tiny 16×12 sample of the hidden camera frame.
      const probe = document.createElement("canvas");
      probe.width = 16;
      probe.height = 12;
      const p2d = probe.getContext("2d", { willReadFrequently: true });
      lightTimer = setInterval(() => {
        if (cancelled || !p2d || video.readyState < 2) return;
        try {
          p2d.drawImage(video, 0, 0, 16, 12);
          const px = p2d.getImageData(0, 0, 16, 12).data;
          let l = 0;
          for (let i = 0; i < px.length; i += 4) l += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
          setLight(Math.round(l / (px.length / 4)));
        } catch {
          /* ignore */
        }
      }, 1000);

      // Face tracking (GPU first, CPU fallback)
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
                // 478 landmarks (incl. irises) are always returned in 0.10.14 —
                // there is no outputFaceLandmarks switch in this version.
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                runningMode: "VIDEO",
                numFaces: 1,
              })) as unknown as typeof landmarker;
              break outer;
            } catch {
              /* try next delegate / source */
            }
          }
        }
      } catch {
        /* tracking unavailable — avatar keeps its idle animation */
      }
      if (cancelled || !landmarker) return;
      setTracking(true);

      const tracker = new FaceTracker();
      trackerRef.current = tracker;
      setCalibrating(true);

      let lastTs = -1;
      let lastMediaTime = -1;
      let lastFace = performance.now();
      let lost = false;
      let visible = false;
      let lastSeen = -1e9;
      let calib = true;
      let frames = 0;

      /** Run detection on one camera frame. `mediaTime` is the frame's video time (s). */
      const onFrame = (mediaTime: number) => {
        if (cancelled || video.readyState < 2 || mediaTime === lastMediaTime) return;
        lastMediaTime = mediaTime;
        frames++;
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as { __faceTrack?: object }).__faceTrack = { frames, loop: raf ? "raf" : "rvfc", mediaTime };
        }
        // MediaPipe VIDEO mode needs strictly increasing timestamps (ms)
        const ts = Math.max(Math.round(mediaTime * 1000), lastTs + 1);
        lastTs = ts;
        const now = performance.now();
        try {
          const raw = landmarker!.detectForVideo(video, ts) as LandmarkerResult;
          const out = tracker.process(raw, ts, video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3);
          if (out) {
            if (now - lastFace > 500) tracker.resetFilters(); // re-acquired: don't smear from stale state
            lastFace = now;
            lastSeen = now;
            r.applyFaceResult(out);
          }
        } catch {
          /* transient */
        }
        if (tracker.calibrating !== calib) {
          calib = tracker.calibrating;
          setCalibrating(calib);
        }
        const isVisible = now - lastSeen < 700;
        if (isVisible !== visible) {
          visible = isVisible;
          setFaceVisible(isVisible);
        }
        const isLost = now - lastFace > 3000;
        if (isLost !== lost) {
          lost = isLost;
          setFaceLost(isLost);
        }
      };

      // Prefer requestVideoFrameCallback: exactly one callback per decoded
      // camera frame, with the frame's own timestamp. Fall back to rAF (and
      // to rAF as well if rVFC stays silent, e.g. for a detached <video> on
      // some engines).
      type RVFC = (cb: (now: number, meta: { mediaTime: number }) => void) => number;
      const v = video as HTMLVideoElement & { requestVideoFrameCallback?: RVFC; cancelVideoFrameCallback?: (h: number) => void };
      let handle = 0;
      let raf = 0;
      const rafLoop = () => {
        if (cancelled) return;
        raf = requestAnimationFrame(rafLoop);
        onFrame(video.currentTime);
      };
      if (typeof v.requestVideoFrameCallback === "function") {
        const vfc = (_now: number, meta: { mediaTime: number }) => {
          if (cancelled) return;
          handle = v.requestVideoFrameCallback!(vfc);
          onFrame(meta.mediaTime);
        };
        handle = v.requestVideoFrameCallback(vfc);
        const watchdog = window.setTimeout(() => {
          if (!cancelled && frames === 0) {
            v.cancelVideoFrameCallback?.(handle);
            rafLoop();
          }
        }, 1500);
        stopLoop = () => {
          clearTimeout(watchdog);
          v.cancelVideoFrameCallback?.(handle);
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
      clearInterval(lightTimer);
      trackerRef.current = null;
      landmarker?.close();
      cam?.getTracks().forEach((t) => t.stop());
      rendererRef.current?.dispose();
      rendererRef.current = null;
      setCanvas(null);
      setVideoStream(null);
      setAudioStream(null);
      setTracking(false);
      setCalibrating(false);
      setFaceLost(false);
      setFaceVisible(false);
      setLight(null);
    };
  }, [runId]);

  const start = useCallback(() => setRunId((n) => n + 1), []);
  const stop = useCallback(() => {
    setRunId(0);
    setState("idle");
  }, []);

  const recalibrate = useCallback(() => {
    const t = trackerRef.current;
    if (!t) return;
    t.recalibrate();
    setCalibrating(true);
  }, []);

  return {
    state,
    error,
    videoStream,
    audioStream,
    canvas,
    renderer: rendererRef.current,
    faceLost,
    faceVisible,
    light,
    tracking,
    calibrating,
    recalibrate,
    start,
    stop,
  };
}
