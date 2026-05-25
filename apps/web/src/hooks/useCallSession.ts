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
    const api = apiRef.current;
    apiRef.current = null;
    if (api) {
      if (api._netCleanup) api._netCleanup();
      try { api.dispose(); } catch { /* ignore */ }
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
        },

        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS:                [],
          HIDE_INVITE_MORE_HEADER:        true,
          SHOW_JITSI_WATERMARK:           false,
          SHOW_WATERMARK_FOR_GUESTS:      false,
          SHOW_CHROME_EXTENSION_BANNER:   false,
          MOBILE_APP_PROMO:               false,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
          CLOSE_PAGE_GUEST_HINT:          false,
          DEFAULT_REMOTE_DISPLAY_NAME:    "Участник",
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
        setHasRemote(participantCount.current > 0);
        if (participantCount.current === 1) startElapsed();
      });

      api.addEventListener("participantLeft", () => {
        participantCount.current = Math.max(0, participantCount.current - 1);
        setHasRemote(participantCount.current > 0);
        if (participantCount.current === 0) stopElapsed();
      });

      api.addEventListener("readyToClose", () => {
        if (!cancelRef.current && apiRef.current === api) {
          onEndRef.current?.();
        }
      });

      api.addEventListener("audioMuteStatusChanged", ({ muted }: { muted: boolean }) => {
        setIsMuted(muted);
      });

      api.addEventListener("videoMuteStatusChanged", ({ muted }: { muted: boolean }) => {
        setIsCameraOff(muted);
      });

      api.addEventListener("connectionFailed", () => {
        if (cancelRef.current) return;
        if (retryCount.current >= 5) {
          setStatus("failed");
          return;
        }
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

      const nav = navigator as any;
      if (nav.connection) {
        const onNetworkChange = () => {
          if (!apiRef.current) return;
          const type = nav.connection.effectiveType;
          if (type === "2g" || type === "slow-2g") {
            apiRef.current.executeCommand("toggleVideo");
          }
        };
        nav.connection.addEventListener("change", onNetworkChange);
        (api as any)._netCleanup = () =>
          nav.connection.removeEventListener("change", onNetworkChange);
      }

    } catch {
      if (!cancelRef.current) setStatus("failed");
    }
  }, [roomId, displayName, dispose, startElapsed, stopElapsed]);

  const initContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    if (el && !cancelRef.current) connect(el);
  }, [connect]);

  const toggleMute   = useCallback(() => apiRef.current?.executeCommand("toggleAudio"), []);
  const toggleCamera = useCallback(() => apiRef.current?.executeCommand("toggleVideo"), []);

  const hangUp = useCallback(() => {
    cancelRef.current = true;
    dispose();
    onEndRef.current?.();
  }, [dispose]);

  const retryNow = useCallback(() => {
    cancelRef.current  = false;
    retryCount.current = 0;
    dispose();
    if (containerRef.current) connect(containerRef.current);
  }, [connect, dispose]);

  useEffect(() => {
    cancelRef.current        = false;
    retryCount.current       = 0;
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
