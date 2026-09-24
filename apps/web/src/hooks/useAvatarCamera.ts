"use client";

/**
 * Camera → on-device face tracking → live 3D avatar → MediaStream.
 *
 *   getUserMedia ─► hidden <video> ─► MediaPipe FaceLandmarker (52 ARKit
 *   blendshapes + head pose) ─► AvatarRenderer ─► canvas.captureStream()
 *
 * The real camera image never leaves this hook: only the rendered avatar
 * video and the microphone audio are exposed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarConfig } from "@/lib/avatar/schema";
import type { AvatarRendererApi } from "@/lib/avatar/engine/types";

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
  tracking: boolean;
  start: () => void;
  stop: () => void;
}

export function useAvatarCamera(config: AvatarConfig): AvatarCamera {
  const [state, setState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [faceLost, setFaceLost] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [runId, setRunId] = useState(0);

  const rendererRef = useRef<AvatarRendererApi | null>(null);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  useEffect(() => {
    rendererRef.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    if (runId === 0) return;
    let cancelled = false;
    let raf = 0;
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => unknown; close: () => void } | null = null;
    let cam: MediaStream | null = null;
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

      const { AvatarRenderer } = await import("@/lib/avatar/engine/AvatarRenderer");
      if (cancelled) return;
      const c = document.createElement("canvas");
      c.width = 540;
      c.height = 720;
      c.style.width = "100%";
      c.style.height = "100%";
      c.style.display = "block";
      c.style.objectFit = "cover";
      const r = new AvatarRenderer(c, { framing: "portrait", background: "#1d1d22", idle: true, preserveDrawingBuffer: true, maxPixelRatio: 1, fps: 30 });
      r.resize(540, 720);
      r.setConfig(cfgRef.current);
      r.start();
      rendererRef.current = r;
      const stream = r.captureStream(30);
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

      let last = 0;
      let lastFace = performance.now();
      let lost = false;
      const loop = () => {
        if (cancelled) return;
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        if (video.readyState < 2 || now - last < 1000 / 30) return;
        last = now;
        try {
          const res = landmarker!.detectForVideo(video, now) as Parameters<AvatarRendererApi["applyFaceResult"]>[0] & {
            faceBlendshapes?: unknown[];
          };
          if (res?.faceBlendshapes?.length) {
            lastFace = now;
            r.applyFaceResult(res);
          }
        } catch {
          /* transient */
        }
        const isLost = now - lastFace > 3000;
        if (isLost !== lost) {
          lost = isLost;
          setFaceLost(isLost);
        }
      };
      loop();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      landmarker?.close();
      cam?.getTracks().forEach((t) => t.stop());
      rendererRef.current?.dispose();
      rendererRef.current = null;
      setCanvas(null);
      setVideoStream(null);
      setAudioStream(null);
      setTracking(false);
      setFaceLost(false);
    };
  }, [runId]);

  const start = useCallback(() => setRunId((n) => n + 1), []);
  const stop = useCallback(() => {
    setRunId(0);
    setState("idle");
  }, []);

  return { state, error, videoStream, audioStream, canvas, renderer: rendererRef.current, faceLost, tracking, start, stop };
}
