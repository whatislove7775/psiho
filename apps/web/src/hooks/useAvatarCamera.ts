"use client";

/**
 * Camera → on-device face tracking → live 3D avatar → MediaStream.
 *
 *   getUserMedia ─► hidden <video> ─► (requestVideoFrameCallback, one call per
 *   camera frame) ─► FaceDetector: MediaPipe FaceLandmarker in a Web Worker
 *   (main-thread fallback) ─► FaceTracker (neutral calibration, landmark-refined
 *   expressions, One-Euro filtering) ─► KitRenderer.renderNow() ─►
 *   canvas.captureStream(0) + requestFrame()
 *
 * Latency budget: the avatar is rendered as soon as a camera frame has been
 * processed (no waiting for the next animation tick) and that exact frame is
 * pushed to the encoder. Detection never blocks the page; a frame that arrives
 * while the detector is busy is dropped rather than queued.
 *
 * The real camera image never leaves this hook: only the rendered avatar video
 * and the microphone audio are exposed. Frames go to the worker as transferred
 * ImageBitmaps and are closed right after detection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarConfig } from "@/lib/avatar/schema";
import type { AvatarRendererApi } from "@/lib/avatar/kit/types";
import { FaceTracker, type LandmarkerResult } from "@/lib/tracking/FaceTracker";
import { createFaceDetector, type FaceDetector } from "@/lib/tracking/FaceDetector";
import { avatarPerf } from "@/lib/tracking/perf";
import { paintBackdrop, type BackdropId } from "@/lib/avatar/backdrops";

export type CameraState = "idle" | "starting" | "ready" | "denied" | "error";

/** Microphone processing used by every call and voice message. */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

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
  /** switch the camera or microphone while running (keeps the avatar and the call) */
  switchDevice: (kind: "videoinput" | "audioinput", deviceId: string) => Promise<void>;
  /** deviceIds currently in use */
  devices: { videoinput: string | null; audioinput: string | null };
  start: () => void;
  stop: () => void;
}

export interface AvatarCameraOptions {
  /** background painted behind the avatar (part of the outgoing video) */
  backdrop?: BackdropId;
}

type RequestFrameTrack = MediaStreamTrack & { requestFrame?: () => void };

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
  const [devices, setDevices] = useState<{ videoinput: string | null; audioinput: string | null }>({ videoinput: null, audioinput: null });

  const rendererRef = useRef<AvatarRendererApi | null>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const camRef = useRef<{ video: HTMLVideoElement; cam: MediaStream } | null>(null);
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
    let detector: FaceDetector | null = null;
    let cam: MediaStream | null = null;
    let lightTimer: ReturnType<typeof setInterval> | undefined;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    avatarPerf.reset();

    (async () => {
      setState("starting");
      setError(null);
      try {
        cam = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
          audio: MIC_CONSTRAINTS,
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
      camRef.current = { video, cam };
      setDevices({
        videoinput: cam.getVideoTracks()[0]?.getSettings().deviceId ?? null,
        audioinput: cam.getAudioTracks()[0]?.getSettings().deviceId ?? null,
      });

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
        // Push exactly the frames we render (captureStream(0) + requestFrame):
        // no timer sampling in between, nothing sent while nothing changes.
        stream = c.captureStream(0);
        const vt = stream.getVideoTracks()[0] as RequestFrameTrack | undefined;
        if (vt && typeof vt.requestFrame === "function") {
          let last = 0;
          r.onRender = () => {
            const now = performance.now();
            avatarPerf.rendered(now);
            // the encoder never needs more than ~30 fps
            if (now - last < 30) return;
            last = now;
            vt.requestFrame!();
            avatarPerf.sent(now);
          };
        } else {
          vt?.stop();
          stream = c.captureStream(30);
          r.onRender = () => avatarPerf.rendered();
        }
      } catch (e) {
        console.warn("[avatar] renderer unavailable:", e);
        cam.getTracks().forEach((t) => t.stop());
        cam = null;
        camRef.current = null;
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
        const v = camRef.current?.video;
        if (cancelled || !p2d || !v || v.readyState < 2) return;
        try {
          p2d.drawImage(v, 0, 0, 16, 12);
          const px = p2d.getImageData(0, 0, 16, 12).data;
          let l = 0;
          for (let i = 0; i < px.length; i += 4) l += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
          setLight(Math.round(l / (px.length / 4)));
        } catch {
          /* ignore */
        }
      }, 1000);

      // ── Face tracking ─────────────────────────────────────────────────
      const tracker = new FaceTracker();
      let lastFace = performance.now();
      let lost = false;
      let visible = false;
      let lastSeen = -1e9;
      let calib = true;
      let frames = 0;

      const onResult = (raw: LandmarkerResult | null, since: number) => {
        if (cancelled) return;
        const now = performance.now();
        const tsMs = since; // FaceTracker filters run on the frame's own timeline
        let out = null;
        try {
          out = raw ? tracker.process(raw, tsMs, video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3) : null;
        } catch {
          out = null;
        }
        if (out) {
          if (now - lastFace > 500) tracker.resetFilters(); // re-acquired: don't smear from stale state
          lastFace = now;
          lastSeen = now;
          avatarPerf.faces++;
          r.applyFaceResult(out);
          const r0 = performance.now();
          r.renderNow();
          avatarPerf.renderCost(performance.now() - r0);
          avatarPerf.latency(since);
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

      const debugMain = typeof window !== "undefined" && /[?&]detector=main\b/.test(window.location.search);
      detector = await createFaceDetector(
        (raw, since) => {
          onResult(raw, since);
        },
        { isCancelled: () => cancelled, worker: !debugMain },
      );
      if (cancelled) {
        detector?.close();
        return;
      }
      if (!detector) return; // tracking unavailable — avatar keeps its idle animation
      trackerRef.current = tracker;
      setTracking(true);
      setCalibrating(true);

      let lastMediaTime = -1;
      /** One camera frame. `mediaTime` is its video time (s); `since` when it became available. */
      const onFrame = (mediaTime: number, since: number) => {
        const v = camRef.current?.video ?? video;
        if (cancelled || v.readyState < 2 || mediaTime === lastMediaTime) return;
        lastMediaTime = mediaTime;
        frames++;
        avatarPerf.camFrame(since);
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as { __faceTrack?: object }).__faceTrack = { frames, loop: raf ? "raf" : "rvfc", mediaTime };
        }
        // VIDEO-mode timestamps: performance-clock ms (monotonic across camera switches)
        const ts = since;
        detector!.push(v, ts, since);
      };

      // Prefer requestVideoFrameCallback: exactly one callback per decoded
      // camera frame. Fall back to rAF (and to rAF as well if rVFC stays
      // silent, e.g. for a detached <video> on some engines).
      type RVFC = (cb: (now: number, meta: { mediaTime: number }) => void) => number;
      type VEl = HTMLVideoElement & { requestVideoFrameCallback?: RVFC; cancelVideoFrameCallback?: (h: number) => void };
      let handle = 0;
      let raf = 0;
      let rvfcVideo: VEl | null = null;
      const rafLoop = () => {
        if (cancelled) return;
        raf = requestAnimationFrame(rafLoop);
        const v = camRef.current?.video ?? video;
        onFrame(v.currentTime, performance.now());
      };
      const useRvfc = typeof (video as VEl).requestVideoFrameCallback === "function";
      if (useRvfc) {
        const arm = () => {
          const v = (camRef.current?.video ?? video) as VEl;
          rvfcVideo = v;
          handle = v.requestVideoFrameCallback!(vfc);
        };
        const vfc = (now: number, meta: { mediaTime: number }) => {
          if (cancelled) return;
          arm();
          onFrame(meta.mediaTime, now);
        };
        arm();
        const watchdog = window.setTimeout(() => {
          if (!cancelled && frames === 0) {
            rvfcVideo?.cancelVideoFrameCallback?.(handle);
            rafLoop();
          }
        }, 1500);
        stopLoop = () => {
          clearTimeout(watchdog);
          rvfcVideo?.cancelVideoFrameCallback?.(handle);
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
      detector?.close();
      camRef.current?.cam.getTracks().forEach((t) => t.stop());
      cam?.getTracks().forEach((t) => t.stop());
      camRef.current = null;
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

  const switchDevice = useCallback(async (kind: "videoinput" | "audioinput", deviceId: string) => {
    const cur = camRef.current;
    if (!cur) return;
    if (kind === "videoinput") {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      });
      const next = ms.getVideoTracks()[0];
      cur.cam.getVideoTracks().forEach((t) => {
        t.stop();
        cur.cam.removeTrack(t);
      });
      cur.cam.addTrack(next);
      cur.video.srcObject = new MediaStream([next]);
      await cur.video.play().catch(() => undefined);
      trackerRef.current?.resetFilters();
      setDevices((d) => ({ ...d, videoinput: next.getSettings().deviceId ?? deviceId }));
    } else {
      const ms = await navigator.mediaDevices.getUserMedia({ audio: { ...MIC_CONSTRAINTS, deviceId: { exact: deviceId } } });
      const next = ms.getAudioTracks()[0];
      const wasEnabled = cur.cam.getAudioTracks()[0]?.enabled ?? true;
      next.enabled = wasEnabled;
      cur.cam.getAudioTracks().forEach((t) => {
        t.stop();
        cur.cam.removeTrack(t);
      });
      cur.cam.addTrack(next);
      setAudioStream(new MediaStream([next]));
      setDevices((d) => ({ ...d, audioinput: next.getSettings().deviceId ?? deviceId }));
    }
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
    switchDevice,
    devices,
    start,
    stop,
  };
}
