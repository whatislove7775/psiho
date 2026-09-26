"use client";

/**
 * Group call for «Круги»: a WebRTC MESH — one RTCPeerConnection per pair of peers,
 * up to 9 peers (host + 8). Signaling: /ws/circle/<room>/ (apps/signaling/group.py).
 *
 *  - Perfect negotiation per pair: the peer with the larger id is "polite"
 *    (rolls back on glare), the other one ignores colliding offers.
 *  - The newcomer (the one who got "welcome") opens connections to everyone already
 *    in the room with two sendrecv transceivers (audio + video). Others create their
 *    side lazily on the first offer and attach local tracks to those transceivers,
 *    so tracks never need a second negotiation round; track changes use replaceTrack.
 *  - Adaptive quality: participants' avatar video is capped at 360p/15 fps (~220 kbps),
 *    the host camera at 540p/24 fps (~700 kbps); caps shrink as the room grows (the
 *    uplink carries one copy per peer). A stats loop steps down to "low" on bandwidth
 *    limitation/loss and to "audio" (audio-only, also asks peers to stop sending video
 *    to us) when the link is really bad. Opus: mono, FEC, 32 kbps.
 *  - Active speaker: WebAudio analysers on every remote audio track + our own mic.
 *
 * Peers are identified only by their per-circle handle (or "host") and pseudonym —
 * never by account ids. See docs/CIRCLES.md for limits and the SFU path.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getIceServers, tuneSdp } from "./useP2PCall";

export type GroupStatus = "idle" | "connecting" | "live" | "reconnecting" | "removed" | "ended" | "full" | "denied" | "failed";
export type Tier = "high" | "low" | "audio";

export interface PeerState {
  muted?: boolean;
  video?: boolean;
  hand?: boolean;
  face?: "avatar" | "real";
  audio_only?: boolean;
}

export interface PeerView {
  id: string;
  name: string;
  role: "host" | "member";
  tone: string;
  state: PeerState;
  stream: MediaStream;
  hasVideo: boolean;
  connection: RTCPeerConnectionState | "new";
}

interface Peer {
  id: string;
  name: string;
  role: "host" | "member";
  tone: string;
  state: PeerState;
  pc: RTCPeerConnection | null;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  srdAnswerPending: boolean;
  stream: MediaStream;
}

interface Options {
  roomId: string | null;
  wsToken: string | null;
  isHost: boolean;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
  /** called when the host asks everyone to mute */
  onMuteRequest?: () => void;
  onHandLowered?: () => void;
}

const MAX_PEERS = 9;

function wsBase(): string {
  const dev = process.env.NEXT_PUBLIC_WS_DEV_URL;
  if (dev) return dev;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}`;
}

/** Encoder caps for our video: depends on role, tier and how many peers we upload to. */
export function videoCaps(isHost: boolean, tier: Tier, peers: number) {
  const n = Math.max(1, peers);
  // uplink budget ~2.4 Mbps for the host, ~1.4 Mbps for participants, split between peers
  const budget = isHost ? 2_400_000 : 1_400_000;
  const top = isHost ? 700_000 : 220_000;
  let bitrate = Math.min(top, Math.floor(budget / n));
  let fps = isHost ? 24 : 15;
  let height = isHost ? 540 : 360;
  if (tier === "low") {
    bitrate = Math.floor(bitrate / 2);
    fps = isHost ? 15 : 10;
    height = isHost ? 360 : 240;
  }
  return { bitrate: Math.max(isHost ? 150_000 : 80_000, bitrate), fps, height };
}

export function useGroupCall({ roomId, wsToken, isHost, audioTrack, videoTrack, onMuteRequest, onHandLowered }: Options) {
  const [status, setStatus] = useState<GroupStatus>("idle");
  const [selfId, setSelfId] = useState<string | null>(null);
  const [allowRealFaces, setAllowRealFaces] = useState(false);
  const [version, setVersion] = useState(0);
  const [tier, setTierState] = useState<Tier>("high");
  const [autoTier, setAutoTier] = useState(false);
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [selfSpeaking, setSelfSpeaking] = useState(false);

  const peers = useRef(new Map<string, Peer>());
  const ws = useRef<WebSocket | null>(null);
  const selfRef = useRef<string | null>(null);
  const tracks = useRef({ audio: audioTrack, video: videoTrack });
  tracks.current = { audio: audioTrack, video: videoTrack };
  const tierRef = useRef<Tier>("high");
  const myState = useRef<PeerState>({ muted: false, video: true, hand: false, face: "avatar", audio_only: false });
  const cbs = useRef({ onMuteRequest, onHandLowered });
  cbs.current = { onMuteRequest, onHandLowered };
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const send = useCallback((msg: object) => {
    const s = ws.current;
    if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(msg));
  }, []);

  // ── per-pair connection ────────────────────────────────────────────
  const applyCaps = useCallback(
    async (peer: Peer) => {
      const pc = peer.pc;
      if (!pc) return;
      const n = Math.max(1, [...peers.current.values()].filter((p) => p.pc).length);
      const caps = videoCaps(isHost, tierRef.current, n);
      for (const sender of pc.getSenders()) {
        const kind = sender.track?.kind;
        if (!kind) continue;
        const p = sender.getParameters();
        if (!p.encodings || !p.encodings.length) continue;
        if (kind === "video") {
          const h = sender.track?.getSettings().height ?? caps.height;
          p.encodings[0].maxBitrate = caps.bitrate;
          p.encodings[0].maxFramerate = caps.fps;
          p.encodings[0].scaleResolutionDownBy = Math.max(1, h / caps.height);
          (p as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = isHost
            ? "balanced"
            : "maintain-framerate";
        } else {
          p.encodings[0].maxBitrate = 40_000;
          p.encodings[0].priority = "high";
          p.encodings[0].networkPriority = "high";
        }
        try {
          await sender.setParameters(p);
        } catch {
          /* not negotiated yet — applied again on connect */
        }
      }
    },
    [isHost],
  );

  /** Put our current tracks on the pc's transceivers (by the kind of their receiver). */
  const attachLocal = useCallback((peer: Peer) => {
    const pc = peer.pc;
    if (!pc) return;
    const { audio, video } = tracks.current;
    // Peer asked for audio only → don't send them video.
    const sendVideo = !peer.state.audio_only && tierRef.current !== "audio" && myState.current.video !== false ? video : null;
    for (const tr of pc.getTransceivers()) {
      const kind = tr.receiver.track?.kind;
      if (tr.currentDirection === "stopped" || !kind) continue;
      const want = kind === "audio" ? audio : sendVideo;
      if (tr.sender.track !== want) tr.sender.replaceTrack(want).catch(() => undefined);
      if (tr.direction !== "sendrecv") tr.direction = "sendrecv";
    }
  }, []);

  const closePeer = useCallback(
    (id: string) => {
      const p = peers.current.get(id);
      if (!p) return;
      p.pc?.close();
      p.pc = null;
      peers.current.delete(id);
      bump();
    },
    [bump],
  );

  const makePc = useCallback(
    (peer: Peer, initiator: boolean) => {
      const pc = new RTCPeerConnection({ iceServers: getIceServers(), bundlePolicy: "max-bundle" });
      peer.pc = pc;
      peer.makingOffer = false;
      peer.ignoreOffer = false;
      peer.srdAnswerPending = false;
      peer.stream = new MediaStream();
      pc.ontrack = (ev) => {
        const s = peer.stream;
        s.getTracks().filter((t) => t.kind === ev.track.kind && t !== ev.track).forEach((t) => s.removeTrack(t));
        if (!s.getTracks().includes(ev.track)) s.addTrack(ev.track);
        ev.track.onunmute = bump;
        ev.track.onmute = bump;
        bump();
      };
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) send({ type: "signal", to: peer.id, data: { candidate: candidate.toJSON() } });
      };
      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          const d = pc.localDescription!;
          send({ type: "signal", to: peer.id, data: { description: { type: d.type, sdp: tuneSdp(d.sdp) } } });
        } catch (e) {
          console.warn("[circle] negotiation failed", e);
        } finally {
          peer.makingOffer = false;
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") applyCaps(peer);
        if (pc.connectionState === "failed") pc.restartIce();
        bump();
      };
      if (initiator) {
        const { audio, video } = tracks.current;
        pc.addTransceiver(audio ?? "audio", { direction: "sendrecv" });
        pc.addTransceiver(video ?? "video", { direction: "sendrecv" });
        // receiver kinds are known right away → attachLocal handles audio-only etc.
        attachLocal(peer);
      }
      bump();
      return pc;
    },
    [applyCaps, attachLocal, bump, send],
  );

  const ensurePeer = useCallback(
    (info: { id: string; name?: string; role?: "host" | "member"; tone?: string; state?: PeerState }) => {
      let p = peers.current.get(info.id);
      if (!p) {
        p = {
          id: info.id,
          name: info.name ?? "Участник",
          role: info.role ?? "member",
          tone: info.tone ?? "lilac",
          state: info.state ?? {},
          pc: null,
          polite: (selfRef.current ?? "") > info.id,
          makingOffer: false,
          ignoreOffer: false,
          srdAnswerPending: false,
          stream: new MediaStream(),
        };
        peers.current.set(info.id, p);
      } else {
        if (info.name) p.name = info.name;
        if (info.state) p.state = info.state;
      }
      return p;
    },
    [],
  );

  const onSignal = useCallback(
    async (from: string, data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => {
      const peer = ensurePeer({ id: from });
      const pc = peer.pc ?? makePc(peer, false);
      try {
        if (data.description) {
          const desc = data.description;
          const readyForOffer = !peer.makingOffer && (pc.signalingState === "stable" || peer.srdAnswerPending);
          const collision = desc.type === "offer" && !readyForOffer;
          peer.ignoreOffer = !peer.polite && collision;
          if (peer.ignoreOffer) return;
          peer.srdAnswerPending = desc.type === "answer";
          await pc.setRemoteDescription(desc);
          peer.srdAnswerPending = false;
          if (desc.type === "offer") {
            attachLocal(peer);
            await pc.setLocalDescription();
            const d = pc.localDescription!;
            send({ type: "signal", to: from, data: { description: { type: d.type, sdp: tuneSdp(d.sdp) } } });
          }
        } else if (data.candidate) {
          try {
            await pc.addIceCandidate(data.candidate);
          } catch (e) {
            if (!peer.ignoreOffer) throw e;
          }
        }
      } catch (e) {
        console.warn("[circle] signal error", e);
      }
    },
    [attachLocal, ensurePeer, makePc, send],
  );

  // ── socket ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !wsToken) return;
    let closed = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const peerMap = peers.current;

    const open = () => {
      setStatus((s) => (s === "live" ? "reconnecting" : "connecting"));
      const sock = new WebSocket(`${wsBase()}/ws/circle/${roomId}/?token=${encodeURIComponent(wsToken)}`);
      ws.current = sock;
      sock.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "welcome": {
            attempts = 0;
            selfRef.current = msg.self as string;
            setSelfId(msg.self as string);
            setAllowRealFaces(!!msg.allow_real_faces);
            // fresh start: drop old connections, connect to everyone present
            [...peerMap.keys()].forEach((id) => closePeer(id));
            for (const info of msg.peers as { id: string; name: string; role: "host" | "member"; tone: string; state: PeerState }[]) {
              const p = ensurePeer(info);
              p.polite = (msg.self as string) > info.id;
              makePc(p, true);
            }
            setStatus("live");
            send({ type: "state", ...myState.current });
            break;
          }
          case "peer-joined": {
            const info = msg.peer as { id: string; name: string; role: "host" | "member"; tone: string; state: PeerState };
            const old = peerMap.get(info.id);
            if (old?.pc) {
              // they reconnected: their old connection is gone
              old.pc.close();
              old.pc = null;
            }
            ensurePeer(info);
            bump();
            break;
          }
          case "peer-left":
            closePeer(msg.id as string);
            break;
          case "peer-state": {
            const p = peerMap.get(msg.id as string);
            if (p) {
              const wasAudioOnly = !!p.state.audio_only;
              p.state = msg.state as PeerState;
              if (!!p.state.audio_only !== wasAudioOnly) attachLocal(p);
              bump();
            }
            break;
          }
          case "signal":
            onSignal(msg.from as string, msg.data as { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit });
            break;
          case "mute-request":
            cbs.current.onMuteRequest?.();
            break;
          case "hand-lowered":
            myState.current.hand = false;
            cbs.current.onHandLowered?.();
            bump();
            break;
          case "removed":
            closed = true;
            setStatus("removed");
            break;
          case "ended":
            closed = true;
            setStatus("ended");
            break;
        }
      };
      sock.onclose = (ev) => {
        if (ws.current === sock) ws.current = null;
        if (closed) return;
        if (ev.code === 4004) return setStatus("removed");
        if (ev.code === 4005) return setStatus("ended");
        if (ev.code === 4003) return setStatus("full");
        if (ev.code === 4001) return setStatus("denied");
        if (ev.code === 4000) return; // replaced by another tab
        if (attempts >= 6) return setStatus("failed");
        setStatus("reconnecting");
        timer = setTimeout(open, Math.min(15000, 1000 * 2 ** attempts++));
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(timer);
      try {
        ws.current?.send(JSON.stringify({ type: "bye" }));
      } catch {
        /* ignore */
      }
      ws.current?.close();
      ws.current = null;
      [...peerMap.keys()].forEach((id) => {
        peerMap.get(id)?.pc?.close();
      });
      peerMap.clear();
    };
  }, [roomId, wsToken, attachLocal, bump, closePeer, ensurePeer, makePc, onSignal, send]);

  // local tracks changed (voice filter, real face, device switch) → replaceTrack everywhere
  useEffect(() => {
    for (const p of peers.current.values()) if (p.pc) attachLocal(p);
    for (const p of peers.current.values()) if (p.pc?.connectionState === "connected") applyCaps(p);
  }, [audioTrack, videoTrack, attachLocal, applyCaps]);

  // ── state ─────────────────────────────────────────────────────────
  const setMyState = useCallback(
    (patch: PeerState) => {
      myState.current = { ...myState.current, ...patch };
      if (patch.video !== undefined) for (const p of peers.current.values()) attachLocal(p);
      send({ type: "state", ...patch });
      bump();
    },
    [attachLocal, bump, send],
  );

  const setTier = useCallback(
    (t: Tier, auto = false) => {
      tierRef.current = t;
      setTierState(t);
      setAutoTier(auto);
      myState.current.audio_only = t === "audio";
      send({ type: "state", audio_only: t === "audio", video: t !== "audio" && myState.current.video !== false });
      for (const p of peers.current.values()) {
        attachLocal(p);
        applyCaps(p);
      }
    },
    [applyCaps, attachLocal, send],
  );

  const hostAction = useCallback(
    (type: "mute-all" | "mute" | "lower-hand" | "remove" | "end", peer?: string) => send({ type, peer }),
    [send],
  );

  // peers count changed → re-split the uplink budget
  const connectedCount = [...peers.current.values()].filter((p) => p.pc).length;
  useEffect(() => {
    for (const p of peers.current.values()) if (p.pc?.connectionState === "connected") applyCaps(p);
  }, [connectedCount, applyCaps]);

  // ── adaptive quality loop ─────────────────────────────────────────
  const autoTierRef = useRef(autoTier);
  autoTierRef.current = autoTier;
  useEffect(() => {
    if (status !== "live") return;
    let bad = 0;
    let terrible = 0;
    let good = 0;
    const prev = new Map<string, { lost: number; recv: number }>();
    const t = setInterval(async () => {
      let limited = false;
      let lossMax = 0;
      let rttMax = 0;
      for (const p of peers.current.values()) {
        const pc = p.pc;
        if (!pc || pc.connectionState !== "connected") continue;
        const stats = await pc.getStats().catch(() => null);
        stats?.forEach((s) => {
          if (s.type === "outbound-rtp" && s.kind === "video" && s.qualityLimitationReason === "bandwidth") limited = true;
          if (s.type === "candidate-pair" && s.nominated && s.currentRoundTripTime) rttMax = Math.max(rttMax, s.currentRoundTripTime * 1000);
          if (s.type === "inbound-rtp" && s.kind === "audio") {
            const key = `${p.id}:${s.id}`;
            const was = prev.get(key);
            const lost = s.packetsLost ?? 0;
            const recv = s.packetsReceived ?? 0;
            if (was) {
              const dl = lost - was.lost;
              const dr = recv - was.recv;
              if (dl + dr > 20) lossMax = Math.max(lossMax, dl / (dl + dr));
            }
            prev.set(key, { lost, recv });
          }
        });
      }
      const cur = tierRef.current;
      if (lossMax > 0.15 || rttMax > 900) terrible++;
      else terrible = 0;
      if (limited || lossMax > 0.05 || rttMax > 450) {
        bad++;
        good = 0;
      } else {
        good++;
        bad = 0;
      }
      if (cur === "high" && bad >= 3) {
        setTier("low", true);
        bad = 0;
      } else if (cur === "low" && terrible >= 3) {
        setTier("audio", true);
        terrible = 0;
      } else if (cur === "low" && good >= 10 && autoTierRef.current) {
        setTier("high", true);
        good = 0;
      }
    }, 3000);
    return () => clearInterval(t);
  }, [status, setTier]);

  // ── active speaker ────────────────────────────────────────────────
  const peerList = useMemo<PeerView[]>(
    () =>
      [...peers.current.values()]
        .map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          tone: p.tone,
          state: p.state,
          stream: p.stream,
          hasVideo: p.stream.getVideoTracks().some((t) => t.readyState === "live" && !t.muted),
          connection: p.pc?.connectionState ?? "new",
        }))
        .sort((a, b) => (a.role === "host" ? -1 : b.role === "host" ? 1 : a.name.localeCompare(b.name, "ru"))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const audioKey = peerList.map((p) => `${p.id}:${p.stream.getAudioTracks()[0]?.id ?? ""}`).join("|") + `|me:${audioTrack?.id ?? ""}`;
  useEffect(() => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const meters: { id: string; an: AnalyserNode; buf: Float32Array<ArrayBuffer> }[] = [];
    const add = (id: string, track: MediaStreamTrack | undefined) => {
      if (!track) return;
      try {
        const src = ctx.createMediaStreamSource(new MediaStream([track]));
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        meters.push({ id, an, buf: new Float32Array(an.fftSize) });
      } catch {
        /* ignore */
      }
    };
    for (const p of peers.current.values()) add(p.id, p.stream.getAudioTracks()[0]);
    add("__me__", tracks.current.audio ?? undefined);
    let current: string | null = null;
    let since = 0;
    const t = setInterval(() => {
      if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
      let best: string | null = null;
      let bestLvl = 0.018;
      let me = 0;
      for (const m of meters) {
        m.an.getFloatTimeDomainData(m.buf);
        let sum = 0;
        for (let i = 0; i < m.buf.length; i++) sum += m.buf[i] * m.buf[i];
        const rms = Math.sqrt(sum / m.buf.length);
        if (m.id === "__me__") {
          me = rms;
          continue;
        }
        const st = peers.current.get(m.id)?.state;
        if (!st?.muted && rms > bestLvl) {
          bestLvl = rms;
          best = m.id;
        }
      }
      setSelfSpeaking(!myState.current.muted && me > 0.02);
      const now = performance.now();
      if (best !== current && (best !== null || now - since > 900)) {
        current = best ?? current;
        if (best !== null) since = now;
        setSpeaker(best ?? (now - since > 1500 ? null : current));
      } else if (best !== null) since = now;
    }, 150);
    return () => {
      clearInterval(t);
      ctx.close().catch(() => undefined);
    };
  }, [audioKey]);

  return {
    status,
    selfId,
    peers: peerList,
    myState: myState.current,
    setMyState,
    tier,
    autoTier,
    setTier,
    hostAction,
    speaker,
    selfSpeaking,
    allowRealFaces,
    maxPeers: MAX_PEERS,
  };
}
