"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { SignalingClient } from "@/lib/webrtc/signalingClient";

// ── TURN credentials — must match coturn in docker-compose.yml ───
const TURN_USER = process.env.NEXT_PUBLIC_TURN_USER || "aprosop";
const TURN_CRED = process.env.NEXT_PUBLIC_TURN_PASSWORD || "aprosopsecretturn";

function getIceServers(): RTCIceServer[] {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return [
    // Public STUN — несколько провайдеров для надёжности
    { urls: "stun:stun.l.google.com:19302"  },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    // Own TURN — UDP быстрее, TCP пробивает NAT
    { urls: `turn:${host}:3478`,               username: TURN_USER, credential: TURN_CRED },
    { urls: `turn:${host}:3478?transport=tcp`,  username: TURN_USER, credential: TURN_CRED },
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
  /** signed token from POST /sessions/{id}/join/ — required by the signaling server */
  wsToken: string;
  localStream: MediaStream | null;
  onEnd?: () => void;
  /** Video encoder cap, bps. Default 900 kbps (avatar); a real camera wants more. */
  videoMaxBitrate?: number;
}

/** Random id for one RTCPeerConnection instance (tags every signal we send). */
function newPcId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * P2P call over the Django signaling relay, using the W3C "perfect
 * negotiation" pattern:
 *
 *  - Both peers may offer (on "ready" / "peer-joined"). When offers collide
 *    (glare), the peer whose pcId sorts lower is *polite*: it rolls back and
 *    answers; the other one ignores the incoming offer. Before this, both
 *    sides rolled back and answered each other's offer, leaving two
 *    half-negotiations with mismatched ICE credentials — ICE sat in
 *    "checking" forever and the remote <video> never got a frame.
 *  - Every message carries `from` (the sender's pcId). A "ready"/"offer" from
 *    a pcId we have not negotiated with means the peer rebuilt its PC (full
 *    reconnect, page reload, re-join) → we rebuild ours too instead of
 *    renegotiating a dead session.
 *  - Local track changes (voice filter on/off → new MediaStream) are applied
 *    with RTCRtpSender.replaceTrack(): no teardown, no renegotiation.
 */
export function useP2PCall({ roomId, wsToken, localStream, onEnd, videoMaxBitrate = 900_000 }: UseP2PCallOptions) {
  const [status,      setStatus]      = useState<P2PStatus>("idle");
  const [isMuted,     setIsMuted]     = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasRemote,   setHasRemote]   = useState(false);
  const [elapsed,     setElapsed]     = useState(0);
  const [retryKey,    setRetryKey]    = useState(0);

  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const sigRef         = useRef<SignalingClient | null>(null);
  const videoElRef     = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(localStream);
  localStreamRef.current = localStream;
  const maxBitrateRef  = useRef(videoMaxBitrate);
  maxBitrateRef.current = videoMaxBitrate;
  const cancelRef      = useRef(false);
  const hasRemoteRef   = useRef(false);
  const elapsedTimer   = useRef<ReturnType<typeof setInterval>>();

  const stopElapsed = useCallback(() => {
    clearInterval(elapsedTimer.current);
    elapsedTimer.current = undefined;
    setElapsed(0);
  }, []);

  const startElapsed = useCallback(() => {
    stopElapsed();
    elapsedTimer.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }, [stopElapsed]);

  /** Attach (or detach) the remote stream to the current <video>, if mounted. */
  const attachRemote = useCallback((stream: MediaStream | null) => {
    remoteStreamRef.current = stream;
    const vid = videoElRef.current;
    if (!vid) return;
    if (vid.srcObject !== stream) vid.srcObject = stream;
    if (!stream) return;
    vid.muted = false;
    vid.play().catch(() => {
      const resume = () => { vid.play().catch(() => {}); };
      document.addEventListener("click", resume, { once: true });
    });
  }, []);

  /**
   * Callback ref for the remote <video>. Works even if the element mounts
   * (or remounts) after `ontrack` fired — the stream is kept and re-attached.
   */
  const remoteVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    if (el && remoteStreamRef.current) attachRemote(remoteStreamRef.current);
  }, [attachRemote]);

  const hasLocal = !!localStream;

  // ── Main effect ───────────────────────────────────────────────
  useEffect(() => {
    if (!hasLocal || !wsToken) return;

    cancelRef.current    = false;
    hasRemoteRef.current = false;

    const sig = new SignalingClient(roomId, wsToken);
    sigRef.current = sig;

    // Per-PC negotiation state (reset by setupPC)
    let myId = newPcId();
    let remoteId: string | null = null;     // peer pcId we are negotiating with
    let offeringPc: RTCPeerConnection | null = null; // PC with createOffer() in flight
    let ignoreOffer = false;
    let pendingIce: { from?: string; c: RTCIceCandidateInit }[] = [];

    let reconnectCount = 0;
    let iceGraceTimer:   ReturnType<typeof setTimeout> | undefined;
    let iceRestartTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer:  ReturnType<typeof setTimeout> | undefined;

    const send = (msg: Parameters<SignalingClient["send"]>[0]) => sig.send({ ...msg, from: myId });

    function markConnected() {
      if (hasRemoteRef.current) {
        setStatus("connected");
        return;
      }
      hasRemoteRef.current = true;
      setHasRemote(true);
      setStatus("connected");
      startElapsed();
    }

    function markDisconnected() {
      hasRemoteRef.current = false;
      setHasRemote(false);
      stopElapsed();
      attachRemote(null);
    }

    async function flushPending(pc: RTCPeerConnection) {
      const q = pendingIce;
      pendingIce = [];
      for (const { from, c } of q) {
        if (from && remoteId && from !== remoteId) continue; // stale peer
        try { await pc.addIceCandidate(c); } catch { /* ignore */ }
      }
    }

    async function makeOffer(pc: RTCPeerConnection, iceRestart = false) {
      if (offeringPc === pc || pc.signalingState !== "stable" || pc !== pcRef.current) return;
      try {
        offeringPc = pc;
        const before = pc.remoteDescription?.sdp;
        const offer = await pc.createOffer({ iceRestart });
        // Lost a race: the peer's offer was accepted meanwhile, or the PC was replaced.
        if (pc.signalingState !== "stable" || pc !== pcRef.current || pc.remoteDescription?.sdp !== before) return;
        await pc.setLocalDescription(offer);
        send({ type: "offer", sdp: pc.localDescription!.toJSON() });
      } catch (e) {
        console.error("[P2P] createOffer failed:", e);
      } finally {
        if (offeringPc === pc) offeringPc = null;
      }
    }

    function doIceRestart(pc: RTCPeerConnection) {
      if (cancelRef.current) return;
      void makeOffer(pc, true);
      clearTimeout(iceRestartTimer);
      iceRestartTimer = setTimeout(() => {
        const s = pc.iceConnectionState;
        if (s !== "connected" && s !== "completed") doFullReconnect();
      }, ICE_RESTART_TIMEOUT_MS);
    }

    // ── Full reconnect: rebuild RTCPeerConnection ────────────────
    function doFullReconnect() {
      if (cancelRef.current) return;
      if (reconnectCount >= MAX_RETRIES) {
        setStatus("failed");
        return;
      }
      const delay = RETRY_DELAYS[reconnectCount++];
      setStatus("reconnecting");
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        if (cancelRef.current) return;
        markDisconnected();
        setupPC();
        send({ type: "ready" }); // peer sees a new pcId → rebuilds and offers
      }, delay);
    }

    function closePC() {
      const old = pcRef.current;
      if (!old) return;
      old.ontrack                    = null;
      old.onicecandidate             = null;
      old.oniceconnectionstatechange = null;
      old.onconnectionstatechange    = null;
      old.close();
      pcRef.current = null;
    }

    // ── Create and configure an RTCPeerConnection ───────────────
    function setupPC(): RTCPeerConnection {
      closePC();
      clearTimeout(iceGraceTimer);
      clearTimeout(iceRestartTimer);
      myId = newPcId();
      remoteId = null;
      offeringPc = null;
      ignoreOffer = false;
      pendingIce = [];

      const pc = new RTCPeerConnection({
        iceServers: getIceServers(),
        iceCandidatePoolSize: 1,
      });
      pcRef.current = pc;

      // Always one audio + one video transceiver, even if a track is missing
      // right now, so later replaceTrack() never needs renegotiation.
      const stream = localStreamRef.current;
      for (const kind of ["audio", "video"] as const) {
        const track = stream?.getTracks().find(t => t.kind === kind);
        if (track && stream) pc.addTrack(track, stream);
        else pc.addTransceiver(kind, { direction: "sendrecv" });
      }

      // ── Tune the video encoder for low latency ──────────────────
      // The avatar is light, predictable motion (a specialist's real camera
      // gets a higher cap). Cap bitrate/fps and prefer keeping framerate over
      // resolution when CPU is tight.
      const vSender = pc.getSenders().find(s => s.track?.kind === "video");
      if (vSender) {
        const params = vSender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0].maxBitrate   = maxBitrateRef.current;
        params.encodings[0].maxFramerate = 30;
        (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = "maintain-framerate";
        vSender.setParameters(params).catch(() => { /* not all browsers allow this pre-negotiation */ });
      }

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) send({ type: "ice-candidate", candidate: candidate.toJSON() });
      };

      pc.ontrack = ({ track, streams }) => {
        // One MediaStream per remote peer; build our own if the sender didn't associate one.
        let remote = streams[0] ?? remoteStreamRef.current;
        if (!remote) remote = new MediaStream();
        if (!remote.getTracks().includes(track)) remote.addTrack(track);
        attachRemote(remote);
        const s = pc.connectionState;
        if (s === "connected") markConnected();
      };

      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        if (s === "connected" || s === "completed") {
          clearTimeout(iceGraceTimer);
          clearTimeout(iceRestartTimer);
          clearTimeout(reconnectTimer);
          reconnectCount = 0;
        } else if (s === "disconnected") {
          // Give the browser a moment to recover the path on its own.
          setStatus("reconnecting");
          clearTimeout(iceGraceTimer);
          iceGraceTimer = setTimeout(() => {
            const cur = pc.iceConnectionState;
            if (cur !== "connected" && cur !== "completed") doIceRestart(pc);
          }, ICE_DISCONNECT_GRACE_MS);
        } else if (s === "failed") {
          clearTimeout(iceGraceTimer);
          clearTimeout(iceRestartTimer);
          doFullReconnect();
        }
      };

      // Media is only flowing once DTLS is up — that (not ontrack, which
      // fires at setRemoteDescription) is when the call counts as connected.
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") {
          if (remoteStreamRef.current) attachRemote(remoteStreamRef.current);
          markConnected();
        } else if (s === "failed") {
          clearTimeout(iceGraceTimer);
          clearTimeout(iceRestartTimer);
          doFullReconnect();
        }
      };

      return pc;
    }

    /** The peer announced a (possibly new) PC; make sure ours is fresh for it. */
    function pcFor(from: string | undefined): RTCPeerConnection {
      let pc = pcRef.current!;
      if (from && remoteId && from !== remoteId) {
        // Peer rebuilt its RTCPeerConnection → ours is negotiated with a ghost.
        markDisconnected();
        pc = setupPC();
      }
      return pc;
    }

    setupPC();

    // ── Signaling messages ───────────────────────────────────────
    const unsubscribe = sig.onMessage(async (msg) => {
      if (cancelRef.current || !pcRef.current) return;
      const from = "from" in msg ? msg.from : undefined;
      try {
        switch (msg.type) {
          case "peer-joined":
            // A new signaling connection of the peer. If our PC was negotiated
            // with an earlier instance, drop it; the peer's "ready" (sent on
            // open) then triggers the offer.
            if (pcRef.current.remoteDescription) {
              markDisconnected();
              setupPC();
            }
            break;

          case "ready": {
            if (from && from === remoteId) {
              // Same peer PC, its signaling socket just reconnected: only
              // kick ICE if media isn't flowing.
              const cur = pcRef.current;
              if (cur.iceConnectionState !== "connected" && cur.iceConnectionState !== "completed") doIceRestart(cur);
              break;
            }
            const pc = pcFor(from);
            if (pc.signalingState === "have-local-offer" && offeringPc !== pc && pc.localDescription) {
              // Our offer went out before this peer instance was listening — resend it.
              send({ type: "offer", sdp: pc.localDescription.toJSON() });
            } else {
              await makeOffer(pc);
            }
            break;
          }

          case "offer": {
            const pc = pcFor(from);
            const collision = offeringPc === pc || pc.signalingState !== "stable";
            // Deterministic tie-break: lower pcId is polite (yields).
            const polite = !from || myId < from;
            ignoreOffer = !polite && collision;
            if (ignoreOffer) break;
            if (pc.signalingState === "have-local-offer") await pc.setLocalDescription({ type: "rollback" });
            if (from) remoteId = from;
            await pc.setRemoteDescription(msg.sdp);
            await flushPending(pc);
            await pc.setLocalDescription(await pc.createAnswer());
            send({ type: "answer", sdp: pc.localDescription!.toJSON() });
            break;
          }

          case "answer": {
            const pc = pcRef.current;
            if (pc.signalingState !== "have-local-offer") break;
            if (from) remoteId = from;
            await pc.setRemoteDescription(msg.sdp);
            await flushPending(pc);
            break;
          }

          case "ice-candidate": {
            const pc = pcRef.current;
            if (from && remoteId && from !== remoteId) break; // stale peer PC
            if (pc.remoteDescription && (!from || from === remoteId)) {
              try {
                await pc.addIceCandidate(msg.candidate);
              } catch (e) {
                if (!ignoreOffer) throw e;
              }
            } else {
              pendingIce.push({ from, c: msg.candidate });
            }
            break;
          }

          case "peer-left":
          case "bye":
            // Start over with a clean PC so the next join negotiates from scratch.
            markDisconnected();
            setStatus("waiting");
            setupPC();
            break;
        }
      } catch (e) {
        console.warn("[P2P] signal handling error:", e);
      }
    });

    // Signaling socket came back after a drop — re-announce ourselves.
    const unsubReconnect = sig.onReconnect(() => {
      if (!cancelRef.current) send({ type: "ready" });
    });

    const nav = navigator as Navigator & { connection?: EventTarget };
    const onNetChange = () => {
      if (!hasRemoteRef.current || cancelRef.current || !pcRef.current) return;
      clearTimeout(iceGraceTimer);
      clearTimeout(iceRestartTimer);
      setStatus("reconnecting");
      doIceRestart(pcRef.current);
    };
    nav.connection?.addEventListener("change", onNetChange);

    const onOnline = () => {
      const cur = pcRef.current;
      if (!hasRemoteRef.current || cancelRef.current || !cur) return;
      const s = cur.iceConnectionState;
      if (s === "connected" || s === "completed") return;
      clearTimeout(iceGraceTimer);
      clearTimeout(iceRestartTimer);
      doIceRestart(cur);
    };
    window.addEventListener("online", onOnline);

    // ── Init ─────────────────────────────────────────────────────
    setStatus("connecting");
    sig.connect()
      .then(() => {
        if (cancelRef.current) return;
        send({ type: "ready" });
        if (!hasRemoteRef.current) setStatus("waiting");
      })
      .catch(() => {
        if (!cancelRef.current) setStatus("failed");
      });

    // ── Cleanup ──────────────────────────────────────────────────
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
      closePC();
      stopElapsed();
      attachRemote(null);
      setStatus("idle");
      setHasRemote(false);
      hasRemoteRef.current = false;
    };
  }, [roomId, wsToken, hasLocal, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local tracks changed (voice filter toggled, camera restarted): swap them
  // into the existing senders — no teardown, no renegotiation.
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || !localStream) return;
    for (const tr of pc.getTransceivers()) {
      const kind = tr.receiver.track.kind;
      const next = localStream.getTracks().find(t => t.kind === kind) ?? null;
      if (tr.sender.track === next) continue;
      if (next && tr.sender.track) next.enabled = tr.sender.track.enabled; // keep mute/camera-off
      tr.sender.replaceTrack(next).catch(e => console.warn("[P2P] replaceTrack failed:", e));
      try { tr.sender.setStreams?.(localStream); } catch { /* optional API */ }
    }
  }, [localStream]);

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
