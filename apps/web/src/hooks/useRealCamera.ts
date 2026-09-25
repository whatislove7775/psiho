"use client";

/**
 * Plain camera + microphone for SPECIALISTS. Specialists are not anonymous:
 * clients see their real face, so no avatar and no voice filter here.
 * Never use this hook for a client — clients only ever send useAvatarCamera().
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CameraState } from "./useAvatarCamera";

export interface RealCamera {
  state: CameraState;
  error: string | null;
  /** camera video + mic audio */
  stream: MediaStream | null;
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  start: () => void;
  stop: () => void;
}

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
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
      setStream(null);
    };
  }, [runId]);

  const start = useCallback(() => setRunId((n) => n + 1), []);
  const stop = useCallback(() => {
    setRunId(0);
    setState("idle");
  }, []);

  const videoStream = useMemo(() => (stream?.getVideoTracks().length ? new MediaStream(stream.getVideoTracks()) : null), [stream]);
  const audioStream = useMemo(() => (stream?.getAudioTracks().length ? new MediaStream(stream.getAudioTracks()) : null), [stream]);

  return { state, error, stream, videoStream, audioStream, start, stop };
}
