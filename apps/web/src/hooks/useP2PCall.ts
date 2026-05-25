"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { SignalingClient } from "@/lib/webrtc/signalingClient";

// ── TURN credentials — must match coturn in docker-compose.yml ───
const TURN_USER = "aprosop";
const TURN_CRED = "aprosopsecretturn";

function getIceServers(): RTCIceServer[] {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: `turn:${host}:3478`,               username: TURN_USER, credential: TURN_CRED },
    { urls: `turn:${host}:3478?transport=tcp`,  username: TURN_USER, credential: TURN_CRED },
    // TLS relay — пробивает корпоративные файрволы и VPN-окружения
    { urls: `turns:${host}:5349`,              username: TURN_USER, credential: TURN_CRED },
  ];
}

const ICE_DISCONNECT_GRACE_MS = 3_000;
const ICE_RESTART_TIMEOUT_MS  = 10_000;

// Exponential backoff для полного пересборки PC.
const RETRY_DELAYS = [2_000, 4_000, 8_000, 16_000, 30_000];
const MAX_RETRIES  = RETRY_DELAYS.length;

// ── Типы ─────────────────────────────────────────────────────────
export type P2PStatus =
  | "idle"
  | "connecting"
  | "waiting"
  | "connected"
  | "reconnecting"   // временный разрыв, идёт восстановление
  | "failed";

interface UseP2PCallOptions {
  roomId: string;
  localStream: MediaStream | null;
  onEnd?: () => void;
}

export function useP2PCall({ roomId, localStream, onEnd }: UseP2PCallOptions) {
  const [status,      setStatus]      = useState<P2PStatus>("idle");
  const [isMuted,     setIsMuted]     = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasRemote,   setHasRemote]   = useState(false);
  const [elapsed,     setElapsed]     = useState(0);
  const [retryKey,    setRetryKey]    = useState(0);

  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const sigRef         = useRef<SignalingClient | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const cancelRef      = useRef(false);
  const offerMadeRef   = useRef(false);
  const hasRemoteRef   = useRef(false);
  const pendingIceRef  = useRef<RTCIceCandidateInit[]>([]);
  const elapsedTimer   = useRef<ReturnType<typeof setInterval>>();

  const stopElapsed = useCallback(() => {
    clearInterval(elapsedTimer.current);
    setElapsed(0);
  }, []);

  const startElapsed = useCallback(() => {
    stopElapsed();
    elapsedTimer.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }, [stopElapsed]);

  // ── Main effect ───────────────────────────────────────────────
  useEffect(() => {
    if (!localStream) return;
    const stream = localStream; // narrow: TypeScript не сужает через замыкания

    cancelRef.current     = false;
    hasRemoteRef.current  = false;
    pendingIceRef.current = [];

    const sig = new SignalingClient(roomId);
    sigRef.current = sig;

    // Счётчик попыток реконнекта живёт внутри эффекта — сбрасывается
    // при каждом новом вызове (смена комнаты / нового стрима).
    let reconnectCount = 0;
    let iceGraceTimer:   ReturnType<typeof setTimeout> | undefined;
    let iceRestartTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer:  ReturnType<typeof setTimeout> | undefined;

    // ── Flush очереди ICE-кандидатов ──────────────────────────
    async function flushPending(pc: RTCPeerConnection) {
      const q = pendingIceRef.current.splice(0);
      for (const c of q) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* ignore */ }
      }
    }

    // ── Создать offer (с опциональным ICE restart) ─────────────
    async function doMakeOffer(pc: RTCPeerConnection, iceRestart = false) {
      if (offerMadeRef.current) return;
      offerMadeRef.current = true;
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
          iceRestart,
        });
        await pc.setLocalDescription(offer);
        sig.send({ type: "offer", sdp: offer });
      } catch (e) {
        console.error("[P2P] createOffer failed:", e);
        offerMadeRef.current = false;
      }
    }

    async function doIceRestart(pc: RTCPeerConnection) {
      if (cancelRef.current) return;
      offerMadeRef.current = false;

      if (typeof pc.restartIce === "function") pc.restartIce();
      await doMakeOffer(pc, true);

      clearTimeout(iceRestartTimer);
      iceRestartTimer = setTimeout(() => {
        const s = pc.iceConnectionState;
        if (s !== "connected" && s !== "completed") {
          doFullReconnect();
        }
      }, ICE_RESTART_TIMEOUT_MS);
    }

    // ── Полный реконнект: пересобрать RTCPeerConnection ──────────
    function doFullReconnect() {
      if (cancelRef.current) return;

      if (reconnectCount >= MAX_RETRIES) {
        setStatus("failed");
        return;
      }

      const delay = RETRY_DELAYS[reconnectCount++];
      setStatus("reconnecting");

      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(async () => {
        if (cancelRef.current) return;

        // Сбросить состояние видео
        hasRemoteRef.current = false;
        setHasRemote(false);
        stopElapsed();
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

        // Пересоздаём PC с новыми ICE credentials
        setupPC();

        // Сообщаем собеседнику что мы готовы к новому handshake
        sig.send({ type: "ready" });
      }, delay);
    }

    // ── Создать и настроить RTCPeerConnection ─────────────────────
    function setupPC(): RTCPeerConnection {
      // Закрываем старый PC если есть
      if (pcRef.current) {
        const old = pcRef.current;
        old.ontrack                    = null;
        old.onicecandidate             = null;
        old.oniceconnectionstatechange = null;
        old.onconnectionstatechange    = null;
        old.close();
        pcRef.current = null;
      }

      offerMadeRef.current  = false;
      pendingIceRef.current = [];

      const pc = new RTCPeerConnection({
        iceServers: getIceServers(),
        iceCandidatePoolSize: 1,
      });
      pcRef.current = pc;

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // ICE кандидаты → сигналинг
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) sig.send({ type: "ice-candidate", candidate: candidate.toJSON() });
      };

      // Удалённый трек появился
      pc.ontrack = ({ streams }) => {
        const stream = streams[0];
        if (stream && remoteVideoRef.current) {
          const vid = remoteVideoRef.current;
          vid.srcObject = stream;
          vid.muted = false;
          vid.play().catch(() => {
            const resume = () => { vid.play().catch(() => {}); document.removeEventListener("click", resume); };
            document.addEventListener("click", resume, { once: true });
          });
        }
        if (!hasRemoteRef.current) {
          hasRemoteRef.current = true;
          setHasRemote(true);
          setStatus("connected");
          startElapsed();
        }
      };

      // ICE state machine
      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;

        if (s === "connected" || s === "completed") {
          // Успешное (вос)соединение — сбрасываем все таймеры и счётчик
          clearTimeout(iceGraceTimer);
          clearTimeout(iceRestartTimer);
          clearTimeout(reconnectTimer);
          reconnectCount = 0;
          if (hasRemoteRef.current) setStatus("connected");
        }

        else if (s === "disconnected") {
          // Не паникуем сразу — браузер может сам восстановить путь
          // (обновление STUN consent, временные потери пакетов).
          // Ждём ICE_DISCONNECT_GRACE_MS, потом ICE restart.
          setStatus("reconnecting");
          clearTimeout(iceGraceTimer);
          iceGraceTimer = setTimeout(() => {
            const cur = pc.iceConnectionState;
            if (cur !== "connected" && cur !== "completed") {
              doIceRestart(pc);
            }
          }, ICE_DISCONNECT_GRACE_MS);
        }

        else if (s === "failed") {
          // ICE упал окончательно — полный реконнект
          clearTimeout(iceGraceTimer);
          clearTimeout(iceRestartTimer);
          doFullReconnect();
        }
      };

      // connectionState fires faster than iceConnectionState === "failed" in Chrome
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          clearTimeout(iceGraceTimer);
          clearTimeout(iceRestartTimer);
          doFullReconnect();
        }
      };

      return pc;
    }

    setupPC();

    // ── Обработка сигналинг-сообщений ────────────────────────────
    const unsubscribe = sig.onMessage(async (msg) => {
      if (cancelRef.current) return;
      const currentPc = pcRef.current;
      if (!currentPc) return;

      try {
        switch (msg.type) {
          case "peer-joined":
          case "ready":
            await doMakeOffer(currentPc);
            break;

          case "offer":
            // Glare resolution: оба одновременно послали offer — откатываем свой
            if (currentPc.signalingState === "have-local-offer") {
              await (currentPc as any).setLocalDescription({ type: "rollback" });
              offerMadeRef.current = false;
            }
            await currentPc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            await flushPending(currentPc);
            {
              const answer = await currentPc.createAnswer();
              await currentPc.setLocalDescription(answer);
              sig.send({ type: "answer", sdp: answer });
            }
            break;

          case "answer":
            if (currentPc.signalingState === "have-local-offer") {
              await currentPc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              await flushPending(currentPc);
            }
            break;

          case "ice-candidate":
            if (currentPc.remoteDescription) {
              await currentPc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } else {
              // Кандидат пришёл раньше remoteDescription — ставим в очередь
              pendingIceRef.current.push(msg.candidate);
            }
            break;

          case "peer-left":
          case "bye":
            hasRemoteRef.current = false;
            setHasRemote(false);
            setStatus("waiting");
            stopElapsed();
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
            offerMadeRef.current  = false;
            pendingIceRef.current = [];
            break;
        }
      } catch (e) {
        console.warn("[P2P] signal handling error:", e);
      }
    });

    // Сигналинг переподключился после обрыва — заново анонсируемся
    const unsubReconnect = sig.onReconnect(() => {
      if (cancelRef.current) return;
      offerMadeRef.current  = false;
      pendingIceRef.current = [];
      sig.send({ type: "ready" });
    });

    const nav = navigator as any;
    const onNetChange = () => {
      if (!hasRemoteRef.current || cancelRef.current) return;
      const cur = pcRef.current;
      if (!cur) return;

      clearTimeout(iceGraceTimer);
      clearTimeout(iceRestartTimer);
      setStatus("reconnecting");
      doIceRestart(cur);
    };
    nav.connection?.addEventListener("change", onNetChange);

    const onOnline = () => {
      if (!hasRemoteRef.current || cancelRef.current) return;
      const cur = pcRef.current;
      if (!cur) return;
      const s = cur.iceConnectionState;
      if (s === "connected" || s === "completed") return;
      clearTimeout(iceGraceTimer);
      clearTimeout(iceRestartTimer);
      doIceRestart(cur);
    };
    window.addEventListener("online", onOnline);

    // ── Инициализация ─────────────────────────────────────────────
    setStatus("connecting");

    sig.connect()
      .then(() => {
        if (cancelRef.current) return;
        sig.send({ type: "ready" });
        setStatus("waiting");
      })
      .catch(() => {
        if (!cancelRef.current) setStatus("failed");
      });

    // ── Cleanup ───────────────────────────────────────────────────
    return () => {
      cancelRef.current = true;
      clearTimeout(iceGraceTimer);
      clearTimeout(iceRestartTimer);
      clearTimeout(reconnectTimer);
      nav.connection?.removeEventListener("change", onNetChange);
      window.removeEventListener("online", onOnline);
      unsubscribe();
      unsubReconnect();
      sig.disconnect();
      const oldPc = pcRef.current;
      if (oldPc) {
        oldPc.ontrack                    = null;
        oldPc.onicecandidate             = null;
        oldPc.oniceconnectionstatechange = null;
        oldPc.onconnectionstatechange    = null;
        oldPc.close();
        pcRef.current = null;
      }
      stopElapsed();
      setStatus("idle");
      setHasRemote(false);
      hasRemoteRef.current = false;
    };
  }, [roomId, localStream, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls ──────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "audio");
    if (sender?.track) {
      const next = !sender.track.enabled;
      sender.track.enabled = next;
      setIsMuted(!next);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "video");
    if (sender?.track) {
      const next = !sender.track.enabled;
      sender.track.enabled = next;
      setIsCameraOff(!next);
    }
  }, []);

  const hangUp = useCallback(() => {
    cancelRef.current = true;
    sigRef.current?.disconnect();
    sigRef.current = null;
    const pc = pcRef.current;
    if (pc) {
      pc.ontrack                    = null;
      pc.onicecandidate             = null;
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange    = null;
      pc.close();
      pcRef.current = null;
    }
    stopElapsed();
    setStatus("idle");
    setHasRemote(false);
    onEnd?.();
  }, [stopElapsed, onEnd]);

  // Перезапускает соединение с нуля (сбрасывает счётчик попыток)
  const retryNow = useCallback(() => setRetryKey(k => k + 1), []);

  return {
    status, isMuted, isCameraOff, hasRemote, elapsed,
    remoteVideoRef, toggleMute, toggleCamera, hangUp, retryNow,
  };
}
