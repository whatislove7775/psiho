"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const JITSI_DOMAIN = "meet.jit.si";

export type CallStatus = "idle" | "loading" | "connected" | "reconnecting" | "failed";

interface UseCallSessionOptions {
  roomId:      string;
  displayName: string;
  onEnd?:      () => void;
}

let _scriptPromise: Promise<void> | null = null;
function loadJitsiScript(): Promise<void> {
  if (typeof (window as any).JitsiMeetExternalAPI !== "undefined") return Promise.resolve();
  if (_scriptPromise) return _scriptPromise;
  _scriptPromise = new Promise((resolve, reject) => {
    const s  = document.createElement("script");
    s.src    = `https://${JITSI_DOMAIN}/external_api.js`;
    s.async  = true;
    s.onload = () => resolve();
    s.onerror = () => { _scriptPromise = null; reject(new Error("Jitsi script load failed")); };
    document.head.appendChild(s);
  });
  return _scriptPromise;
}

export function useCallSession({ roomId, displayName, onEnd }: UseCallSessionOptions) {
  const [status,      setStatus]      = useState<CallStatus>("idle");
  const [isMuted,     setIsMuted]     = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasRemote,   setHasRemote]   = useState(false);
  const [elapsed,     setElapsed]     = useState(0);

  const apiRef           = useRef<any>(null);
  const containerRef     = useRef<HTMLDivElement | null>(null);
  const cancelRef        = useRef(false);
  const retryCount       = useRef(0);
  const retryTimer       = useRef<ReturnType<typeof setTimeout>>();
  const participantCount = useRef(0);
  const elapsedTimer     = useRef<ReturnType<typeof setInterval>>();
  const onEndRef         = useRef(onEnd);

  useEffect(() => { onEndRef.current = onEnd; });

  const stopElapsed = useCallback(() => {
    clearInterval(elapsedTimer.current);
    setElapsed(0);
  }, []);

  const startElapsed = useCallback(() => {
    stopElapsed();
    elapsedTimer.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }, [stopElapsed]);

  const dispose = useCallback(() => {
    clearTimeout(retryTimer.current);
    stopElapsed();
    if (apiRef.current) {
      if (apiRef.current._netCleanup) apiRef.current._netCleanup();
      try { apiRef.current.dispose(); } catch { /* ignore */ }
      apiRef.current = null;
    }
  }, [stopElapsed]);

  const connect = useCallback(async (container: HTMLDivElement) => {
    if (cancelRef.current) return;
    setStatus("loading");

    try {
      await loadJitsiScript();
      if (cancelRef.current) return;

      dispose();

      const roomName = `aprosop-${roomId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;

      const api = new (window as any).JitsiMeetExternalAPI(JITSI_DOMAIN, {
        roomName,
        width:      "100%",
        height:     "100%",
        parentNode: container,
        userInfo:   { displayName },

        configOverwrite: {
          startWithAudioMuted:    false,
          startWithVideoMuted:    false,
          enableWelcomePage:      false,
          prejoinPageEnabled:     false,
          disableDeepLinking:     true,
          p2p:                    { enabled: false },
          enableLayerSuspension:  true,
          channelLastN:           2,
          resolution:             720,
          constraints: {
            video: { height: { ideal: 720, max: 720, min: 180 } },
          },
        },

        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS:                    [],
          HIDE_INVITE_MORE_HEADER:            true,
          SHOW_JITSI_WATERMARK:               false,
          SHOW_WATERMARK_FOR_GUESTS:          false,
          SHOW_CHROME_EXTENSION_BANNER:       false,
          MOBILE_APP_PROMO:                   false,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS:   true,
          CLOSE_PAGE_GUEST_HINT:              false,
          DEFAULT_REMOTE_DISPLAY_NAME:        "Участник",
          DISABLE_VIDEO_BACKGROUND:           true,
          DISABLE_FOCUS_INDICATOR:            true,
        },
      });

      apiRef.current = api;

      api.addEventListener("videoConferenceJoined", () => {
        retryCount.current = 0;
        participantCount.current = 0;
        setHasRemote(false);
        setStatus("connected");
      });

      api.addEventListener("participantJoined", () => {
        participantCount.current += 1;
        setHasRemote(true);
        startElapsed();
      });

      api.addEventListener("participantLeft", () => {
        participantCount.current = Math.max(0, participantCount.current - 1);
        if (participantCount.current === 0) {
          setHasRemote(false);
          stopElapsed();
        }
      });

      api.addEventListener("readyToClose", () => {
        if (!cancelRef.current) onEndRef.current?.();
      });

      api.addEventListener("audioMuteStatusChanged", ({ muted }: { muted: boolean }) => {
        setIsMuted(muted);
      });

      api.addEventListener("videoMuteStatusChanged", ({ muted }: { muted: boolean }) => {
        setIsCameraOff(muted);
      });

      api.addEventListener("connectionFailed", () => {
        if (cancelRef.current) return;
        const delay = Math.min(1000 * 2 ** retryCount.current, 30_000);
        retryCount.current += 1;
        setStatus("reconnecting");
        dispose();
        retryTimer.current = setTimeout(() => {
          if (!cancelRef.current && containerRef.current) {
            connect(containerRef.current);
          }
        }, delay);
      });

    } catch {
      if (!cancelRef.current) setStatus("failed");
    }
  }, [roomId, displayName, dispose, startElapsed, stopElapsed]);

  const initContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    if (el && !cancelRef.current) connect(el);
  }, [connect]);

  const toggleMute   = useCallback(() => apiRef.current?.executeCommand("toggleAudio"),    []);
  const toggleCamera = useCallback(() => apiRef.current?.executeCommand("toggleVideo"),    []);
  const hangUp       = useCallback(() => {
    cancelRef.current = true;
    dispose();
    onEndRef.current?.();
  }, [dispose]);

  const retryNow = useCallback(() => {
    cancelRef.current = false;
    retryCount.current = 0;
    dispose();
    if (containerRef.current) connect(containerRef.current);
  }, [connect, dispose]);

  useEffect(() => {
    cancelRef.current  = false;
    retryCount.current = 0;
    participantCount.current = 0;
    return () => {
      cancelRef.current = true;
      dispose();
    };
  }, [dispose]);

  return {
    status, isMuted, isCameraOff, hasRemote, elapsed,
    initContainer, toggleMute, toggleCamera, hangUp, retryNow,
  };
}
