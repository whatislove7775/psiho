"use client";

/**
 * Plain camera + microphone for SPECIALISTS. Specialists are not anonymous:
 * clients see their real face, so no avatar and no voice filter here.
 * Never use this hook for a client — clients only ever send useAvatarCamera().
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MIC_CONSTRAINTS, type CameraState } from "./useAvatarCamera";

export interface RealCamera {
  state: CameraState;
  error: string | null;
  /** camera video + mic audio */
  stream: MediaStream | null;
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  /** switch camera or microphone while running */
  switchDevice: (kind: "videoinput" | "audioinput", deviceId: string) => Promise<void>;
  devices: { videoinput: string | null; audioinput: string | null };
  start: () => void;
  stop: () => void;
}

/** Specialist camera: 720p30, the call encodes it at up to 1.5 Mbps. */
const VIDEO_720: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };

export function explainMediaError(e: unknown): { state: CameraState; message: string } {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return {
      state: "denied",
      message: "Доступ к камере запрещён. Разрешите камеру и микрофон в настройках браузера и попробуйте ещё раз.",
    };
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return { state: "error", message: "Камера или микрофон не найдены. Подключите устройство и попробуйте ещё раз." };
  if (name === "NotReadableError" || name === "AbortError")
    return {
      state: "error",
      message: "Камера занята другой программой. Закройте другие звонки и вкладки с камерой и попробуйте ещё раз.",
    };
  return {
    state: "error",
    message: "Не получилось включить камеру. Откройте страницу в свежей версии Chrome, Safari или Firefox и попробуйте ещё раз.",
  };
}

export function useRealCamera(): RealCamera {
  const [state, setState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (runId === 0) return;
    let cancelled = false;
    let ms: MediaStream | null = null;
    (async () => {
      setState("starting");
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        ms = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", ...VIDEO_720 },
          audio: MIC_CONSTRAINTS,
        });
      } catch (e) {
        if (cancelled) return;
        const x = explainMediaError(e);
        setState(x.state);
        setError(x.message);
        return;
      }
      if (cancelled) {
        ms.getTracks().forEach((t) => t.stop());
        return;
      }
      ms.getVideoTracks().forEach((t) => {
        try {
          (t as MediaStreamTrack & { contentHint: string }).contentHint = "motion";
        } catch {
          /* ignore */
        }
      });
      setStream(ms);
      setState("ready");
    })();
    return () => {
      cancelled = true;
      ms?.getTracks().forEach((t) => t.stop());
      streamRef.current?.getTracks().forEach((t) => t.stop()); // incl. switched devices
      setStream(null);
    };
  }, [runId]);

  const start = useCallback(() => setRunId((n) => n + 1), []);
  const stop = useCallback(() => {
    setRunId(0);
    setState("idle");
  }, []);

  const streamRef = useRef<MediaStream | null>(null);
  streamRef.current = stream;
  const switchDevice = useCallback(async (kind: "videoinput" | "audioinput", deviceId: string) => {
    const cur = streamRef.current;
    if (!cur) return;
    const ms = await navigator.mediaDevices.getUserMedia(
      kind === "videoinput"
        ? { video: { deviceId: { exact: deviceId }, ...VIDEO_720 } }
        : { audio: { ...MIC_CONSTRAINTS, deviceId: { exact: deviceId } } },
    );
    const next = ms.getTracks()[0];
    const trackKind = kind === "videoinput" ? "video" : "audio";
    const old = cur.getTracks().filter((t) => t.kind === trackKind);
    next.enabled = old[0]?.enabled ?? true;
    if (trackKind === "video") {
      try {
        (next as MediaStreamTrack & { contentHint: string }).contentHint = "motion";
      } catch {
        /* ignore */
      }
    }
    old.forEach((t) => t.stop());
    setStream(new MediaStream([...cur.getTracks().filter((t) => t.kind !== trackKind), next]));
  }, []);
  const devices = useMemo(
    () => ({
      videoinput: stream?.getVideoTracks()[0]?.getSettings().deviceId ?? null,
      audioinput: stream?.getAudioTracks()[0]?.getSettings().deviceId ?? null,
    }),
    [stream],
  );

  const videoStream = useMemo(() => (stream?.getVideoTracks().length ? new MediaStream(stream.getVideoTracks()) : null), [stream]);
  const audioStream = useMemo(() => (stream?.getAudioTracks().length ? new MediaStream(stream.getAudioTracks()) : null), [stream]);

  return { state, error, stream, videoStream, audioStream, switchDevice, devices, start, stop };
}
