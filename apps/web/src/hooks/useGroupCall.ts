"use client";

/**
 * Group call for «Круги»: a WebRTC MESH — one RTCPeerConnection per pair of peers,
 * up to 14 peers (host + co-therapist + 12). Signaling: /ws/circle/<room>/ (apps/signaling/group.py).
 *
 *  - Breakout rooms: the meeting is split into "main" + sub-rooms; every peer is in exactly one and
 *    connections exist ONLY between peers of the same room (the server also refuses to relay SDP/ICE
 *    across rooms). On a move we close pcs to peers who are now elsewhere and open pcs to the new
 *    room-mates (the smaller id initiates; perfect negotiation covers glare).
 *  - Video budget: we RECEIVE at most MAX_VIDEO video streams — the specialists + the active speaker +
 *    the most recent speakers. Everyone else gets a signaling hint {video:false} and stops sending us
 *    video (replaceTrack(null), no renegotiation); audio always flows.
 *
 *  - Perfect negotiation per pair: the peer with the larger id is "polite"
 *    (rolls back on glare), the other one ignores colliding offers.
 *  - The newcomer (the one who got "welcome") opens connections to everyone already
 *    in the room with two sendrecv transceivers (audio + video). Others create their
 *    side lazily on the first offer and attach local tracks to those transceivers,
 *    so tracks never need a second negotiation round; track changes use replaceTrack.
 *  - Adaptive quality: participants' avatar video is capped at 240p/12 fps (~160 kbps),
 *    the specialists' camera at 480p/20 fps (~600 kbps); caps shrink with the number of peers that
 *    actually want our video (the uplink carries one copy per such peer). A stats loop steps down to "low" on bandwidth
 *    limitation/loss and to "audio" (audio-only, also asks peers to stop sending video
 *    to us) when the link is really bad. Opus: mono, FEC, 32 kbps.
 *  - Active speaker: WebAudio analysers on every remote audio track + our own mic.
 *
 * Peers are identified only by their per-circle handle (or "host" / "cohost") and pseudonym —
 * never by account ids. See docs/CIRCLES.md for limits and the SFU path.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getIceServers, tuneSdp } from "./useP2PCall";
import { CAPTION_CHANNEL } from "@/lib/captions/protocol";

export type GroupStatus = "idle" | "connecting" | "live" | "reconnecting" | "removed" | "ended" | "full" | "denied" | "failed";
export type Tier = "high" | "low" | "audio";

export interface PeerState {
  muted?: boolean;
  video?: boolean;
  hand?: boolean;
  face?: "avatar" | "real";
  audio_only?: boolean;
}

export type PeerRole = "host" | "cohost" | "member";

export interface RoomsState {
  rooms: { id: string; name: string }[];
  assign: Record<string, string>;
  /** unix seconds (server clock) or null */
  ends_at: number | null;
  free: boolean;
  /** server clock at the moment of the update, for skew-free countdowns */
  now: number;
}
export const MAIN_ROOM = "main";
export const NO_ROOMS: RoomsState = { rooms: [], assign: {}, ends_at: null, free: false, now: 0 };
export function roomOf(rs: RoomsState, peer: string | null): string {
  const r = peer ? rs.assign[peer] : undefined;
  return r && rs.rooms.some((x) => x.id === r) ? r : MAIN_ROOM;
}

export interface PeerView {
  id: string;
  name: string;
  role: PeerRole;
  tone: string;
  state: PeerState;
  stream: MediaStream;
  hasVideo: boolean;
  connection: RTCPeerConnectionState | "new";
  room: string;
  /** we asked this peer for video (within the MAX_VIDEO budget) */
  videoWanted: boolean;
  /** live-captions data channel (lib/captions/useCaptions) */
  captionDc: RTCDataChannel | null;
}

interface Peer {
  id: string;
  name: string;
  role: PeerRole;
  tone: string;
  state: PeerState;
  /** the peer asked us (hint) not to send video */
  noVideo: boolean;
  /** last hint we sent to this peer */
  hinted: boolean | null;
  pc: RTCPeerConnection | null;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  srdAnswerPending: boolean;
  stream: MediaStream;
  /** live-captions channel with this peer (lib/captions) */
  dc?: RTCDataChannel | null;
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
  /** a moderator moved us (room = new room id) */
  onMoved?: (room: string, by: string, rs: RoomsState) => void;
  /** a moderator broadcast a message to all rooms */
  onBroadcast?: (text: string, from: string) => void;
  /** a room-mate sent a 👍/👎 reaction (components/reactions) */
  onReaction?: (peer: string, kind: "up" | "down") => void;
}

const MAX_PEERS = 14;
/** at most this many incoming video streams (the rest: audio + avatar picture) */
export const MAX_VIDEO = 6;

function wsBase(): string {
  const dev = process.env.NEXT_PUBLIC_WS_DEV_URL;
  if (dev) return dev;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}`;
}

/** Encoder caps for our video: depends on role, tier and how many peers we upload to. */
export function videoCaps(isHost: boolean, tier: Tier, peers: number) {
  const n = Math.max(1, peers);
  // uplink budget ~2.4 Mbps for a specialist, ~1.2 Mbps for participants, split between the peers we send video to
  const budget = isHost ? 2_400_000 : 1_200_000;
  const top = isHost ? 600_000 : 160_000;
  let bitrate = Math.min(top, Math.floor(budget / n));
  let fps = isHost ? 20 : 12;
  let height = isHost ? 480 : 240;
  if (tier === "low") {
    bitrate = Math.floor(bitrate / 2);
    fps = isHost ? 15 : 10;
    height = isHost ? 360 : 180;
  }
  return { bitrate: Math.max(isHost ? 150_000 : 60_000, bitrate), fps, height };
}

export function useGroupCall({ roomId, wsToken, isHost, audioTrack, videoTrack, onMuteRequest, onHandLowered, onMoved, onBroadcast, onReaction }: Options) {
  const [status, setStatus] = useState<GroupStatus>("idle");
  const [selfId, setSelfId] = useState<string | null>(null);
  const [allowRealFaces, setAllowRealFaces] = useState(false);
  const [version, setVersion] = useState(0);
  const [tier, setTierState] = useState<Tier>("high");
  const [autoTier, setAutoTier] = useState(false);
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  const [rooms, setRooms] = useState<RoomsState>(NO_ROOMS);
  const roomsRef = useRef<RoomsState>(NO_ROOMS);
  /** when each peer last spoke (performance.now) — "recent speakers" for the video budget */
  const lastSpoke = useRef(new Map<string, number>());
  const [wanted, setWanted] = useState<Set<string>>(new Set());

  const peers = useRef(new Map<string, Peer>());
  const ws = useRef<WebSocket | null>(null);
  const selfRef = useRef<string | null>(null);
  const tracks = useRef({ audio: audioTrack, video: videoTrack });
  tracks.current = { audio: audioTrack, video: videoTrack };
  const tierRef = useRef<Tier>("high");
  const myState = useRef<PeerState>({ muted: false, video: true, hand: false, face: "avatar", audio_only: false });
  const cbs = useRef({ onMuteRequest, onHandLowered, onMoved, onBroadcast, onReaction });
  cbs.current = { onMuteRequest, onHandLowered, onMoved, onBroadcast, onReaction };
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
      const n = Math.max(1, [...peers.current.values()].filter((p) => p.pc && !p.noVideo && !p.state.audio_only).length);
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
    const sendVideo =
      !peer.state.audio_only && !peer.noVideo && tierRef.current !== "audio" && myState.current.video !== false ? video : null;
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
      // captions: pre-negotiated channel on both sides, rides the regular offer/answer
      try {
        peer.dc = pc.createDataChannel(CAPTION_CHANNEL.label, { negotiated: true, id: CAPTION_CHANNEL.id, ordered: true });
      } catch {
        peer.dc = null;
      }
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
        if (pc.connectionState === "connected") {
          applyCaps(peer);
          peer.hinted = null; // re-send our video wish on every fresh connection
          setWanted((w) => new Set(w));
        }
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
    (info: { id: string; name?: string; role?: PeerRole; tone?: string; state?: PeerState }) => {
      let p = peers.current.get(info.id);
      if (!p) {
        p = {
          id: info.id,
          name: info.name ?? "Участник",
          role: info.role ?? "member",
          tone: info.tone ?? "lilac",
          state: info.state ?? {},
          noVideo: false,
          hinted: null,
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
    async (from: string, data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; hint?: { video: boolean } }) => {
      const peer = ensurePeer({ id: from });
      if (data.hint) {
        const off = !data.hint.video;
        if (peer.noVideo !== off) {
          peer.noVideo = off;
          attachLocal(peer);
          applyCaps(peer);
          for (const p of peers.current.values()) if (p !== peer && p.pc?.connectionState === "connected") applyCaps(p);
        }
        if (!data.description && !data.candidate) return;
      }
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
    [applyCaps, attachLocal, ensurePeer, makePc, send],
  );

  /** Apply a rooms state: drop connections to peers now elsewhere, connect to new room-mates. */
  const applyRooms = useCallback(
    (rs: RoomsState) => {
      roomsRef.current = rs;
      setRooms(rs);
      const me = selfRef.current;
      const mine = roomOf(rs, me);
      for (const p of peers.current.values()) {
        const same = roomOf(rs, p.id) === mine;
        if (!same && p.pc) {
          p.pc.close();
          p.pc = null;
          p.stream = new MediaStream();
          p.hinted = null;
          p.noVideo = false;
        } else if (same && !p.pc && me && me < p.id) {
          p.polite = me > p.id;
          makePc(p, true);
        }
      }
      bump();
    },
    [bump, makePc],
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
            // fresh start: drop old connections, connect to everyone present in OUR room
            [...peerMap.keys()].forEach((id) => closePeer(id));
            const rs = (msg.rooms as RoomsState) ?? NO_ROOMS;
            roomsRef.current = rs;
            setRooms(rs);
            const mine = roomOf(rs, msg.self as string);
            for (const info of msg.peers as { id: string; name: string; role: PeerRole; tone: string; state: PeerState }[]) {
              const p = ensurePeer(info);
              p.polite = (msg.self as string) > info.id;
              if (roomOf(rs, info.id) === mine) makePc(p, true);
            }
            setStatus("live");
            send({ type: "state", ...myState.current });
            break;
          }
          case "peer-joined": {
            const info = msg.peer as { id: string; name: string; role: PeerRole; tone: string; state: PeerState };
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
            onSignal(msg.from as string, msg.data as { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; hint?: { video: boolean } });
            break;
          case "mute-request":
            cbs.current.onMuteRequest?.();
            break;
          case "rooms": {
            const rs = msg as unknown as RoomsState & { moved: boolean; by: string; note: string };
            const next: RoomsState = { rooms: rs.rooms, assign: rs.assign, ends_at: rs.ends_at, free: rs.free, now: rs.now };
            applyRooms(next);
            if (rs.moved) cbs.current.onMoved?.(roomOf(next, selfRef.current), rs.by, next);
            break;
          }
          case "broadcast":
            cbs.current.onBroadcast?.(String(msg.text ?? ""), String(msg.from ?? ""));
            break;
          case "reaction":
            if (msg.kind === "up" || msg.kind === "down") cbs.current.onReaction?.(String(msg.id ?? ""), msg.kind);
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
  }, [roomId, wsToken, applyRooms, attachLocal, bump, closePeer, ensurePeer, makePc, onSignal, send]);

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

  /** Moderators: breakout rooms. */
  const roomsAction = useCallback(
    (
      action:
        | { type: "rooms-open"; rooms: string[]; assign: Record<string, string>; minutes?: number | null; free?: boolean }
        | { type: "move"; peers: string[]; room: string }
        | { type: "rooms-close" }
        | { type: "rooms-timer"; minutes: number | null }
        | { type: "broadcast"; text: string },
    ) => send(action),
    [send],
  );
  const moveSelf = useCallback((room: string) => send({ type: "move-self", room }), [send]);
  /** 👍/👎 to the room-mates (the server rate-limits and relays only the kind) */
  const sendReaction = useCallback((kind: "up" | "down") => send({ type: "reaction", kind }), [send]);

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

  // ── video budget: which room-mates we want video from ───────────────
  const pickWanted = useCallback(() => {
    const mine = roomOf(roomsRef.current, selfRef.current);
    const mates = [...peers.current.values()].filter((p) => roomOf(roomsRef.current, p.id) === mine);
    const rank = (p: Peer) => (p.role !== "member" ? 1e15 : 0) + (lastSpoke.current.get(p.id) ?? 0);
    const chosen = mates
      .slice()
      .sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id))
      .slice(0, MAX_VIDEO)
      .map((p) => p.id);
    const next = new Set(chosen);
    setWanted((prev) => (prev.size === next.size && [...next].every((x) => prev.has(x)) ? prev : next));
  }, []);

  useEffect(() => {
    if (status !== "live") return;
    pickWanted();
    const t = setInterval(pickWanted, 2500);
    return () => clearInterval(t);
  }, [status, pickWanted, version]);

  // tell every connected room-mate whether we want their video (only on change)
  useEffect(() => {
    for (const p of peers.current.values()) {
      if (!p.pc || p.pc.connectionState !== "connected") continue;
      const want = wanted.has(p.id);
      if (p.hinted === want) continue;
      p.hinted = want;
      send({ type: "signal", to: p.id, data: { hint: { video: want } } });
    }
  }, [wanted, version, send]);

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
          room: roomOf(rooms, p.id),
          videoWanted: wanted.has(p.id),
          captionDc: p.dc ?? null,
        }))
        .sort((a, b) => {
          const ra = a.role === "host" ? 0 : a.role === "cohost" ? 1 : 2;
          const rb = b.role === "host" ? 0 : b.role === "cohost" ? 1 : 2;
          return ra - rb || a.name.localeCompare(b.name, "ru");
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, rooms, wanted],
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
      if (best) lastSpoke.current.set(best, now);
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
    rooms,
    myRoom: roomOf(rooms, selfId),
    roomsAction,
    moveSelf,
    sendReaction,
    /** ids of peers whose video we currently receive (≤ MAX_VIDEO) */
    wanted,
    lastSpoke: lastSpoke.current,
  };
}
