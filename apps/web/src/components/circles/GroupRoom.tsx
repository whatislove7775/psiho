"use client";

/**
 * A meeting of a circle (/circle-room/[meetingId]): lobby → group call → end.
 *
 *  - Participants are ALWAYS seen as a 3D avatar (useAvatarCamera): by default a fresh
 *    avatar made for this circle (seeded by the circle handle), so nobody can match them
 *    with their usual avatar; they may pick their own avatar instead. The raw camera
 *    never leaves the device — unless the host enabled real faces for this circle AND
 *    the participant explicitly confirms «Показать лицо».
 *  - The voice mask (useVoiceTransform) is on by default in circles («Нейтральный»).
 *  - The host sends real camera video (useRealCamera), 540p.
 *  - Two specialists: the host and an optional co-therapist (camera + photo). Both moderate; only the
 *    host ends the meeting.
 *  - Breakout rooms (BreakoutPanel): you see and hear only your current room.
 *  - Video budget: big tiles only for the peers whose video we receive (specialists + active/recent
 *    speakers, ≤ MAX_VIDEO); the rest sit in an audio strip with their circle avatar.
 *  - Mesh transport: useGroupCall (docs/CIRCLES.md).
 */
import { t as tt, tj, tc } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Captions,
  CameraOff,
  Eye,
  Hand,
  LayoutGrid,
  LogOut,
  MessagesSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  PhoneOff,
  Shield,
  Users,
  Volume2,
  VolumeX,
  Waves,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Badge, Button, Modal, Segmented, Spinner, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { circlesApi, type MeetingJoin } from "@/lib/api/circles";
import { useAuth } from "@/lib/auth/store";
import { normalizeAvatar, randomAvatar } from "@/lib/avatar/schema";
import { useAvatarCamera } from "@/hooks/useAvatarCamera";
import { ReactionArt, ReactionLayer, REACTION_LABEL, useKeyedBursts, useReactionThrottle, reactionStyles, type Burst } from "@/components/reactions/Reactions";
import { useSlowNetReporter } from "@/lib/avatar/headz/hands/netGuard";
import { useRealCamera } from "@/hooks/useRealCamera";
import { useVoiceTransform, VOICE_PRESETS, type VoicePreset } from "@/hooks/useVoiceTransform";
import { useGroupCall, type PeerView, type RoomsState } from "@/hooks/useGroupCall";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { CanvasSlot, SelfVideo, mmss } from "@/components/room/parts";
import { VoicePicker } from "@/components/room/VoicePicker";
import { PanicButton } from "@/components/privacy/PanicButton";
import { Together, TeaWait } from "@/components/illustrations";
import { GroupChat } from "./GroupChat";
import { useCaptions } from "@/lib/captions/useCaptions";
import { CaptionOverlay, CaptionsPanel } from "@/components/captions/Captions";
import { BreakoutPanel, roomName, useRoomsCountdown } from "./BreakoutPanel";
import { cx, toneClass } from "./bits";
import s from "./groupRoom.module.css";

type Side = null | "chat" | "people" | "voice" | "rooms" | "captions";

const VOICE_KEY = "aprosop.circleVoice";
function loadCircleVoice(): VoicePreset {
  try {
    const v = localStorage.getItem(VOICE_KEY) as VoicePreset | null;
    return v && VOICE_PRESETS.some((p) => p.value === v) ? v : "neutral";
  } catch {
    return "neutral";
  }
}

function useElapsed(since: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

function gridShape(n: number, narrow: boolean) {
  if (narrow) return { cols: n <= 1 ? 1 : 2, rows: Math.ceil(n / 2) };
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  return { cols, rows: Math.ceil(n / cols) };
}

export function GroupRoom({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { user, status: authStatus, bootstrap } = useAuth();
  const [info, setInfo] = useState<MeetingJoin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"lobby" | "call" | "left">("lobby");
  const [voice, setVoiceState] = useState<VoicePreset>("neutral");
  const [ownAvatar, setOwnAvatar] = useState(false);
  const [audioOnlyStart, setAudioOnlyStart] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [hand, setHand] = useState(false);
  const [side, setSide] = useState<Side>(null);
  const [realFace, setRealFace] = useState(false);
  const [askFace, setAskFace] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "remove" | "end" | "leave"; peer?: PeerView }>(null);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    bootstrap();
    setVoiceState(loadCircleVoice());
    const mq = window.matchMedia("(max-width: 760px)");
    const f = () => setNarrow(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [bootstrap]);
  useEffect(() => {
    if (authStatus === "guest") router.replace(`/login?next=${encodeURIComponent(`/circle-room/${meetingId}`)}`);
  }, [authStatus, router, meetingId]);

  const load = useCallback(() => {
    setError(null);
    circlesApi
      .joinMeeting(meetingId)
      .then(setInfo)
      .catch((e) => setError(e instanceof ApiError ? e.message : tt("Не\u00a0получилось открыть встречу.")));
  }, [meetingId]);
  useEffect(() => {
    if (authStatus === "authed") load();
  }, [authStatus, load]);

  // "isHost" = a specialist (host or co-therapist): real camera + photo, moderation. Only the lead ends the meeting.
  const isHost = info?.role === "host" || info?.role === "cohost";
  const isLead = info?.role === "host";
  const myPhoto = info?.role === "cohost" ? info.cohost?.photo_url ?? null : info?.host.photo_url ?? null;
  const photoOf = (role: PeerView["role"]) => (role === "cohost" ? info?.cohost?.photo_url ?? null : info?.host.photo_url ?? null);
  const setVoice = (v: VoicePreset) => {
    setVoiceState(v);
    try {
      localStorage.setItem(VOICE_KEY, v);
    } catch {
      /* ignore */
    }
  };

  // ── media ────────────────────────────────────────────────────────
  const circleAvatar = useMemo(() => randomAvatar(`circle-${info?.self.id ?? meetingId}`), [info?.self.id, meetingId]);
  const avatarCfg = useMemo(
    () => (ownAvatar && user?.avatar_config ? normalizeAvatar(user.avatar_config) : circleAvatar),
    [ownAvatar, user?.avatar_config, circleAvatar],
  );
  const allowReal = !!info?.circle.allow_real_faces;
  // 👍/👎 reactions (buttons or hand gestures) pop over the sender's tile for everyone in the room;
  // an open hand raised above the head for ~0.8 s raises the hand («поднять руку»)
  const [bursts, pushBurst] = useKeyedBursts();
  const reactionOut = useRef<(k: "up" | "down") => void>(() => {});
  const react = useReactionThrottle((k) => {
    pushBurst(ME, k);
    reactionOut.current(k);
  });
  const avatarCam = useAvatarCamera(avatarCfg, {
    backdrop: "dusk",
    realFace: allowReal && realFace,
    onGesture: (g) => phase === "call" && (g === "raise" ? !isHost && setHand(true) : react(g)),
  });
  const realCam = useRealCamera();
  const startAvatar = avatarCam.start;
  const startReal = realCam.start;
  useEffect(() => {
    if (!info) return;
    if (info.role === "host" || info.role === "cohost") startReal();
    else startAvatar();
  }, [info, startAvatar, startReal]);

  const micStream = isHost ? realCam.audioStream : avatarCam.audioStream;
  const { transformedStream } = useVoiceTransform({ inputStream: isHost ? null : micStream, preset: isHost ? "off" : voice, preload: true });
  const outAudio = isHost ? micStream : transformedStream;
  const audioTrack = outAudio?.getAudioTracks()[0] ?? null;
  const faceTrack = avatarCam.faceStream?.getVideoTracks()[0] ?? null;
  const videoTrack = isHost
    ? realCam.videoStream?.getVideoTracks()[0] ?? null
    : allowReal && realFace && faceTrack
      ? faceTrack
      : avatarCam.videoStream?.getVideoTracks()[0] ?? null;

  useEffect(() => {
    if (audioTrack) audioTrack.enabled = !muted;
  }, [audioTrack, muted]);

  const call = useGroupCall({
    roomId: phase === "call" ? info?.room_id ?? null : null,
    wsToken: phase === "call" ? info?.ws_token ?? null : null,
    isHost,
    audioTrack,
    videoTrack,
    onMuteRequest: () => {
      setMuted(true);
      toast(tt("Ведущий выключил микрофоны. Включите свой, когда захотите сказать."));
    },
    onHandLowered: () => setHand(false),
    onReaction: pushBurst,
    onMoved: (room, by, rs) => {
      const where = roomName(rs, room);
      toast(rs.rooms.length ? tt(`{v}: вы в «{where}»`, { v: by || tt("Ведущий"), where }) : tt("Все вернулись в общий зал"));
    },
    onBroadcast: (text, from) => {
      setNotice(`${from}: ${text}`);
      toast(`${from}: ${text}`);
    },
  });
  reactionOut.current = call.sendReaction;

  // Live captions (lib/captions): per-peer data channels, only with people in our (breakout) room
  const ccLinks = useMemo(
    () => call.peers.filter((p) => p.room === call.myRoom).map((p) => ({ id: p.id, dc: p.captionDc })),
    [call.peers, call.myRoom],
  );
  const cc = useCaptions({ links: ccLinks, micTrack: micStream?.getAudioTracks()[0] ?? null, micOn: phase === "call" && !muted, textOnly: false });
  const ccLabel = (who: string) => (who === "me" ? tt("Вы") : call.peers.find((p) => p.id === who)?.name ?? tt("Участник"));

  // rooms timer ran out → the lead (or the co-therapist when the lead is away) brings everyone back
  const { rooms: roomsState, roomsAction, peers: allPeers } = call;
  const leadAway = !allPeers.some((p) => p.role === "host");
  useEffect(() => {
    if (!isHost || !roomsState.ends_at || !roomsState.rooms.length || (!isLead && !leadAway)) return;
    const ms = (roomsState.ends_at - roomsState.now) * 1000;
    const t = setTimeout(() => roomsAction({ type: "rooms-close" }), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [roomsState, roomsAction, isHost, isLead, leadAway]);
  // the call itself had to step down in quality → floating hands switch off (participants)
  useSlowNetReporter(isHost ? null : call.autoTier && call.tier !== "high", call.tier, 0);

  const { setMyState, setTier } = call;
  useEffect(() => {
    if (phase !== "call") return;
    setMyState({ muted });
  }, [muted, phase, setMyState]);
  useEffect(() => {
    if (phase !== "call") return;
    setMyState({ video: !camOff, face: allowReal && realFace ? "real" : "avatar" });
  }, [camOff, realFace, allowReal, phase, setMyState]);
  useEffect(() => {
    if (phase !== "call") return;
    setMyState({ hand });
  }, [hand, phase, setMyState]);

  const enter = () => {
    setPhase("call");
    setJoinedAt(Date.now());
    if (audioOnlyStart) setTimeout(() => setTier("audio"), 800);
  };

  // leaving the page: stop the camera
  const stopAvatar = avatarCam.stop;
  const stopReal = realCam.stop;
  useEffect(() => () => {
    stopAvatar();
    stopReal();
  }, [stopAvatar, stopReal]);

  useEffect(() => {
    if (call.status === "removed" || call.status === "ended") {
      stopAvatar();
      stopReal();
    }
  }, [call.status, stopAvatar, stopReal]);

  const elapsed = useElapsed(joinedAt);
  const backHref = info?.circle.kind === "couple" ? `${isHost ? "/pro" : "/app"}/couples/${info.circle.id}` : info ? (isHost ? `/pro/circles/${info.circle.id}` : `/app/circles/${info.circle.id}`) : "/app/circles";

  // ── screens ──────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={s.root}>
        <div className={s.center}>
          <div className={s.centerBox}>
            <TeaWait className={s.centerArt} />
            <h1>{tt("Встреча пока недоступна")}</h1>
            <p>{error}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" onClick={() => router.back()} icon={<ArrowLeft size={16} />}>
                {tt("Назад")}
              </Button>
              <Button variant="primary" onClick={load}>
                {tt("Проверить ещё раз")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!info) {
    return (
      <div className={s.root}>
        <div className={s.center}>
          <Spinner label={tt("Открываем комнату")} />
        </div>
      </div>
    );
  }

  if (phase === "left" || call.status === "removed" || call.status === "ended") {
    const removed = call.status === "removed";
    return (
      <div className={s.root}>
        <div className={s.center}>
          <div className={s.centerBox}>
            <Together className={s.centerArt} />
            <h1>{removed ? tt("Ведущий попросил вас покинуть круг") : call.status === "ended" ? tt("Встреча закончилась") : tt("Вы\u00a0вышли из\u00a0встречи")}</h1>
            <p>
              {removed
                ? tt("Деньги за\u00a0будущие встречи вернулись на\u00a0баланс. Если что-то пошло не\u00a0так, напишите в\u00a0поддержку.")
                : tt("Спасибо, что\u00a0были в\u00a0круге. Поделиться мыслями после встречи можно в\u00a0чате круга.")}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {phase === "left" && call.status !== "ended" && !removed && (
                <Button variant="secondary" onClick={() => setPhase("call")}>
                  {tt("Вернуться")}
                </Button>
              )}
              <Button variant="primary" href={backHref}>
                {isHost ? tt("К\u00a0управлению кругом") : tt("К\u00a0странице круга")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const camState = isHost ? realCam.state : avatarCam.state;
  const camError = isHost ? realCam.error : avatarCam.error;

  if (phase === "lobby") {
    return (
      <div className={s.root}>
        <header className={s.top}>
          <Button variant="ghost" iconOnly aria-label={tt("Назад")} href={backHref} icon={<ArrowLeft size={20} />} />
          <div className={s.topTitle}>
            <b>{info.circle.kind === "couple" ? tt("Консультация для пары") : info.circle.title}</b>
            <small>
              {tj("Встреча {index}, {v}", { index: info.meeting.index, v: info.circle.topic_label.toLowerCase() })}
            </small>
          </div>
          <PanicButton />
        </header>
        <div className={s.lobby}>
          <div className={s.preview}>
            {isHost ? <SelfVideo stream={realCam.videoStream} /> : <CanvasSlot canvas={avatarCam.canvas} />}
            {camState !== "ready" && (
              <div className={s.placeholder}>
                {camError ? <p style={{ maxWidth: 360, padding: 16, color: "var(--c-muted)" }}>{camError}</p> : <Spinner label={tt("Включаем камеру")} />}
              </div>
            )}
            <div className={s.previewNote}>
              {!isHost && (
                <Badge tone="success">
                  <Shield size={12} />{" "}{tt("Все видят только аватар")}
                </Badge>
              )}
              {!isHost && voice !== "off" && (
                <Badge tone="lilac">
                  <Waves size={12} />{" "}{tt("Маска голоса включена")}
                </Badge>
              )}
            </div>
          </div>
          <div className={s.lobbyPanel}>
            <h1>{isHost ? tt("Вы\u00a0ведёте встречу") : tt("Перед входом")}</h1>
            <div className={s.me}>
              {isHost ? (
                <SpecialistPhoto url={info.host.photo_url} name={info.host.name} size={46} />
              ) : (
                <AvatarThumb config={avatarCfg} size={46} />
              )}
              <div>
                <b>{info.self.name}</b>
                <small>{isHost ? tt("Участники видят ваше лицо и\u00a0имя") : tt("Так вас увидят и\u00a0услышат в\u00a0круге")}</small>
              </div>
            </div>
            {!isHost && (
              <>
                <div>
                  <div className={s.label}>{tt("Аватар")}</div>
                  <Segmented
                    ariaLabel={tt("Какой аватар показать")}
                    value={ownAvatar ? "own" : "circle"}
                    onChange={(v) => setOwnAvatar(v === "own")}
                    options={[
                      { value: "circle", label: tt("Новый для\u00a0круга") },
                      { value: "own", label: tt("Мой аватар") },
                    ]}
                  />
                  <p style={{ marginTop: 6 }}>
                    {ownAvatar ? tt("Ваш обычный аватар: его может узнать специалист, с\u00a0которым вы\u00a0общаетесь в\u00a0диалогах.") : tt("Отдельный аватар только для\u00a0этого круга\u00a0— так вас точно не\u00a0узнать.")}
                  </p>
                </div>
                <div>
                  <div className={s.label}>{tt("Голос")}</div>
                  <VoicePicker value={voice} onChange={setVoice} compact />
                </div>
              </>
            )}
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: "var(--t-13)", cursor: "pointer" }}>
              <input type="checkbox" checked={audioOnlyStart} onChange={(e) => setAudioOnlyStart(e.target.checked)} style={{ marginTop: 3, accentColor: "var(--c-primary)" }} />
              <span>
                {tt("Только звук")}
                <br />
                <span style={{ color: "var(--c-muted)" }}>{tt("Для\u00a0слабого интернета: видео не\u00a0отправляется и\u00a0не\u00a0принимается.")}</span>
              </span>
            </label>
            <Button variant="primary" size="lg" block onClick={enter} disabled={camState !== "ready" || !audioTrack}>
              {tt("Войти во\u00a0встречу")}
            </Button>
            <p>{tt("Встречу не\u00a0записываем. Звук и\u00a0видео идут напрямую между участниками и\u00a0не\u00a0проходят через наш сервер.")}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── call ─────────────────────────────────────────────────────────
  const here = call.peers.filter((p) => p.room === call.myRoom);
  const bigPeers = here.filter((p) => p.videoWanted || p.role !== "member");
  const smallPeers = here.filter((p) => !bigPeers.includes(p));
  const tiles = 1 + bigPeers.length;
  const shape = gridShape(tiles, narrow);
  const hands = here.filter((p) => p.state.hand);
  const inRoom = 1 + here.length;
  const statusPill =
    call.status === "live" ? (
      <span className={cx(s.pill, s.pillLive)}>{mmss(elapsed)}</span>
    ) : (
      <span className={cx(s.pill, s.pillWarn)}>
        <WifiOff size={14} /> {call.status === "failed" ? tt("Нет связи") : tt("Подключаемся")}
      </span>
    );

  return (
    <div className={s.root}>
      <header className={s.top}>
        <div className={s.topTitle}>
          <b>{info.circle.kind === "couple" ? tt("Консультация для пары") : info.circle.title}</b>
          <small>
            {inRoom} {inRoom === 1 ? tt("участник") : inRoom < 5 ? tt("участника") : tt("участников")}
            {call.rooms.rooms.length ? tt(` в «{roomName}»`, { roomName: roomName(call.rooms, call.myRoom) }) : tt(" в комнате")}
            {hands.length > 0 && isHost ? tt(`, руку подняли: {length}`, { length: hands.length }) : ""}
          </small>
        </div>
        {call.tier !== "high" && (
          <span className={cx(s.pill, s.pillWarn)} title={tt("Качество подстроено под\u00a0интернет")}>
            <Wifi size={14} /> {call.tier === "audio" ? tt("Только звук") : tt("Экономим трафик")}
          </span>
        )}
        {statusPill}
        <PanicButton />
      </header>
      <div className={s.stage}>
        <div className={s.gridWrap} style={{ position: "relative" }}>
          <CaptionOverlay log={cc.log} version={cc.version} label={ccLabel} include={(who) => who !== "me" && cc.show} />
          <RoomBanner rooms={call.rooms} myRoom={call.myRoom} notice={notice} onClose={() => setNotice(null)} />
          <div className={s.grid} style={{ ["--cols" as string]: shape.cols, ["--rows" as string]: shape.rows } as React.CSSProperties}>
            <div className={cx(s.tile, !isHost && !realFace && s.tileAvatar, toneClass(isHost ? "primary" : info.self.tone), call.selfSpeaking && s.tileSpeaking)}>
              {camOff || call.tier === "audio" ? (
                <div className={s.placeholder}>
                  <span className={s.placeholderInner}>
                    {isHost ? <SpecialistPhoto url={myPhoto} name={info.self.name} size={72} /> : <AvatarThumb config={avatarCfg} size={72} />}
                  </span>
                </div>
              ) : isHost ? (
                <div className={s.mirror}>
                  <SelfVideo stream={realCam.videoStream} />
                </div>
              ) : allowReal && realFace && avatarCam.faceStream ? (
                <div className={s.mirror}>
                  <SelfVideo stream={avatarCam.faceStream} />
                </div>
              ) : (
                <CanvasSlot canvas={avatarCam.canvas} />
              )}
              {hand && (
                <span className={s.hand}>
                  <Hand size={13} />{" "}{tt("Рука поднята")}
                </span>
              )}
              <ReactionLayer items={bursts[ME] ?? []} />
              <div className={s.tileLabel}>
                <span className={s.name}>
                  {muted ? <MicOff size={13} className={s.mutedIcon} /> : <Mic size={13} />}
                  {tt("Вы,")}{" "}{info.self.name}
                </span>
              </div>
            </div>
            {bigPeers.map((p) => (
              <PeerTile
                key={p.id}
                peer={p}
                speaking={call.speaker === p.id}
                speakerOn={speakerOn}
                audioOnly={call.tier === "audio"}
                hostControls={isHost}
                hostPhoto={photoOf(p.role)}
                onMute={() => call.hostAction("mute", p.id)}
                onLowerHand={() => call.hostAction("lower-hand", p.id)}
                onRemove={() => setConfirm({ kind: "remove", peer: p })}
                reactions={bursts[p.id]}
              />
            ))}
          </div>
          {smallPeers.length > 0 && (
            <div className={s.strip} aria-label={tt("Остальные участники (только звук)")}>
              {smallPeers.map((p) => (
                <MiniPeer key={p.id} peer={p} speaking={call.speaker === p.id} speakerOn={speakerOn} />
              ))}
            </div>
          )}
        </div>
        {side && (
          <aside className={s.side} aria-label={side === "chat" ? tt("Чат круга") : side === "people" ? tt("Участники") : side === "rooms" ? tt("Комнаты") : side === "captions" ? tt("Субтитры") : tt("Голос")}>
            <div className={s.sideHead}>
              <h2>{side === "chat" ? tt("Чат круга") : side === "people" ? tt("В\u00a0комнате") : side === "rooms" ? tt("Комнаты") : side === "captions" ? tt("Субтитры") : tt("Маска голоса")}</h2>
              <Button variant="ghost" size="sm" iconOnly aria-label={tt("Закрыть")} onClick={() => setSide(null)} icon={<X size={18} />} />
            </div>
            <div className={s.sideBody}>
              {side === "chat" && <GroupChat circleId={info.circle.id} hostPhoto={info.host.photo_url} cohostPhoto={info.cohost?.photo_url} compact />}
              {side === "rooms" && (
                <BreakoutPanel
                  peers={call.peers}
                  selfId={call.selfId}
                  selfName={info.self.name}
                  rooms={call.rooms}
                  isMod={isHost}
                  onAction={call.roomsAction}
                  onMoveSelf={call.moveSelf}
                />
              )}
              {side === "voice" && <VoicePicker value={voice} onChange={setVoice} />}
              {side === "captions" && (
                <CaptionsPanel show={cc.show} onShow={cc.setShow} load={cc.load} log={cc.log} version={cc.version} label={ccLabel} onCopy={() => cc.copy(ccLabel)} />
              )}
              {side === "people" && (
                <ul className={s.people}>
                  <li>
                    {isHost ? <SpecialistPhoto url={myPhoto} name={info.self.name} size={34} /> : <AvatarThumb config={avatarCfg} size={34} />}
                    <span>
                      {info.self.name}
                      <small>{tt("Это\u00a0вы")}</small>
                    </span>
                  </li>
                  {here.map((p) => (
                    <li key={p.id}>
                      {p.role !== "member" ? <SpecialistPhoto url={photoOf(p.role)} name={p.name} size={34} /> : <AvatarThumb config={null} seed={`circle-${p.id}`} size={34} />}
                      <span>
                        {p.name}
                        <small>
                          {p.role === "host" ? tt("Ведущий") : p.role === "cohost" ? tt("Ко-терапевт") : p.state.hand ? tt("Рука поднята") : p.state.muted ? tt("Микрофон выключен") : tt("Слушает")}
                        </small>
                      </span>
                      {isHost && p.role === "member" && (
                        <>
                          {p.state.hand && (
                            <Button size="sm" variant="ghost" onClick={() => call.hostAction("lower-hand", p.id)}>
                              {tt("Опустить руку")}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" iconOnly aria-label={tt(`Выключить микрофон: {name}`, { name: p.name })} onClick={() => call.hostAction("mute", p.id)} icon={<MicOff size={16} />} />
                          <Button size="sm" variant="ghost" iconOnly aria-label={tt(`Удалить из\u00a0круга: {name}`, { name: p.name })} onClick={() => setConfirm({ kind: "remove", peer: p })} icon={<LogOut size={16} />} />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        )}
      </div>
      <nav className={s.bar} aria-label={tt("Управление встречей")}>
        <Ctl label={muted ? tt("Включить") : tt("Микрофон")} off={muted} onClick={() => setMuted((m) => !m)} icon={muted ? <MicOff size={22} /> : <Mic size={22} />} />
        <Ctl
          label={call.tier === "audio" ? tt("Видео") : camOff ? tt("Видео") : tt("Видео")}
          off={camOff || call.tier === "audio"}
          onClick={() => {
            if (call.tier === "audio") setTier("high");
            else setCamOff((c) => !c);
          }}
          icon={camOff || call.tier === "audio" ? <CameraOff size={22} /> : <Camera size={22} />}
        />
        {!isHost && <Ctl label={tt("Рука")} on={hand} onClick={() => setHand((h) => !h)} icon={<Hand size={22} />} />}
        {(["up", "down"] as const).map((k) => (
          <Ctl key={k} label={REACTION_LABEL[k]} onClick={() => react(k)} icon={<ReactionArt kind={k} className={reactionStyles.btnArt} />} />
        ))}
        {!isHost && <Ctl label={tt("Голос")} active={side === "voice"} onClick={() => setSide(side === "voice" ? null : "voice")} icon={<Waves size={22} />} />}
        {cc.available && (
          <Ctl label={tt("Субтитры")} active={side === "captions"} onClick={() => setSide(side === "captions" ? null : "captions")} icon={<Captions size={22} />} />
        )}
        <Ctl label={tt("Чат")} active={side === "chat"} onClick={() => setSide(side === "chat" ? null : "chat")} icon={<MessagesSquare size={22} />} />
        <Ctl label={tt("Люди")} active={side === "people"} onClick={() => setSide(side === "people" ? null : "people")} icon={<Users size={22} />} />
        {(isHost || call.rooms.rooms.length > 0) && (
          <Ctl label={tt("Комнаты")} active={side === "rooms"} onClick={() => setSide(side === "rooms" ? null : "rooms")} icon={<LayoutGrid size={22} />} />
        )}
        <Ctl label={speakerOn ? tt("Звук") : tt("Звук выкл")} off={!speakerOn} onClick={() => setSpeakerOn((v) => !v)} icon={speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />} />
        {!isHost && allowReal && (
          <Ctl label={realFace ? tt("Аватар") : tt("Лицо")} active={realFace} onClick={() => (realFace ? setRealFace(false) : setAskFace(true))} icon={<Eye size={22} />} />
        )}
        {isHost && <Ctl label={tt("Выкл. всем")} onClick={() => call.hostAction("mute-all")} icon={<MicOff size={22} />} />}
        <span className={s.sep} aria-hidden />
        {isLead ? (
          <Ctl label={tt("Завершить")} end onClick={() => setConfirm({ kind: "end" })} icon={<PhoneOff size={22} />} />
        ) : (
          <Ctl label={tc("круг", "Выйти")} end onClick={() => setConfirm({ kind: "leave" })} icon={<PhoneOff size={22} />} />
        )}
        {isLead && <Ctl label={tc("круг", "Выйти")} onClick={() => setPhase("left")} icon={<LogOut size={22} />} />}
      </nav>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === "remove" ? tt("Удалить участника?") : confirm?.kind === "end" ? tt("Завершить встречу для\u00a0всех?") : tt("Выйти из\u00a0встречи?")}>
        <p style={{ margin: "0 0 16px", color: "var(--c-muted)", lineHeight: 1.55 }}>
          {confirm?.kind === "remove"
            ? tt(`{name} покинет круг и\u00a0больше не\u00a0сможет заходить на\u00a0встречи и\u00a0писать в\u00a0чат. Деньги за\u00a0будущие встречи вернутся ему полностью.`, { name: confirm.peer?.name })
            : confirm?.kind === "end"
              ? tt("Комната закроется у\u00a0всех участников, а\u00a0оплата за\u00a0эту встречу спишется. Используйте, когда встреча действительно закончилась.")
              : tt("Вы\u00a0сможете вернуться, пока встреча идёт.")}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            {tt("Отмена")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm?.kind === "remove" && confirm.peer) call.hostAction("remove", confirm.peer.id);
              else if (confirm?.kind === "end") call.hostAction("end");
              else setPhase("left");
              setConfirm(null);
            }}
          >
            {confirm?.kind === "remove" ? tt("Удалить") : confirm?.kind === "end" ? tt("Завершить") : tc("круг", "Выйти")}
          </Button>
        </div>
      </Modal>
      <Modal open={askFace} onClose={() => setAskFace(false)} title={tt("Показать настоящее лицо?")}>
        <p style={{ margin: "0 0 16px", color: "var(--c-muted)", lineHeight: 1.55 }}>
          {tt("Все участники круга и\u00a0ведущий увидят изображение с\u00a0вашей камеры вместо аватара. Встречи не\u00a0записываются, но\u00a0скриншот сделать может любой. Вернуться к\u00a0аватару можно одной кнопкой.")}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setAskFace(false)}>
            {tt("Остаться в\u00a0аватаре")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setRealFace(true);
              setAskFace(false);
            }}
          >
            {tt("Показать лицо")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/** key of our own tile in the reaction bursts */
const ME = "__me__";

/** Which room you're in, the rooms timer and the last message to all rooms. */
function RoomBanner({ rooms, myRoom, notice, onClose }: { rooms: RoomsState; myRoom: string; notice: string | null; onClose: () => void }) {
  const left = useRoomsCountdown(rooms);
  if (!rooms.rooms.length && !notice) return null;
  return (
    <div className={s.roomBanner} role="status">
      {rooms.rooms.length > 0 && (
        <span>
          {roomName(rooms, myRoom)}
          {left !== null ? `, ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : ""}
        </span>
      )}
      {notice && (
        <>
          <span style={{ fontWeight: 500 }}>{notice}</span>
          <button type="button" onClick={onClose} aria-label={tt("Скрыть")} style={{ all: "unset", cursor: "pointer", display: "inline-flex" }}>
            <X size={14} />
          </button>
        </>
      )}
    </div>
  );
}

/** A peer beyond the video budget: audio only + their circle avatar. */
function MiniPeer({ peer, speaking, speakerOn }: { peer: PeerView; speaking: boolean; speakerOn: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const aTrack = peer.stream.getAudioTracks()[0];
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.srcObject = aTrack ? new MediaStream([aTrack]) : null;
    if (aTrack) a.play().catch(() => undefined);
  }, [aTrack]);
  return (
    <div className={cx(s.mini, toneClass(peer.tone), speaking && s.miniSpeaking)} data-peer={peer.id} data-mini>
      <AvatarThumb config={null} seed={`circle-${peer.id}`} size={52} />
      <audio ref={audioRef} autoPlay muted={!speakerOn} />
      {peer.state.hand && (
        <span className={s.miniHand}>
          <Hand size={11} />
        </span>
      )}
      <b>
        {peer.state.muted && <MicOff size={10} />} {peer.name}
      </b>
    </div>
  );
}

function Ctl({
  label,
  icon,
  onClick,
  off,
  on,
  active,
  end,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  off?: boolean;
  on?: boolean;
  active?: boolean;
  end?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx(s.ctl, off && s.ctlOff, on && s.ctlOn, active && s.ctlActive, end && s.ctlEnd)}
      onClick={onClick}
      aria-label={label}
      aria-pressed={on || active || undefined}
    >
      <span>{icon}</span>
      <span className={s.ctlLabel}>{label}</span>
    </button>
  );
}

function PeerTile({
  peer,
  speaking,
  speakerOn,
  audioOnly,
  hostControls,
  hostPhoto,
  onMute,
  onLowerHand,
  onRemove,
  reactions,
}: {
  peer: PeerView;
  speaking: boolean;
  speakerOn: boolean;
  audioOnly: boolean;
  hostControls: boolean;
  hostPhoto: string | null;
  onMute: () => void;
  onLowerHand: () => void;
  onRemove: () => void;
  reactions?: Burst[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const vTrack = peer.stream.getVideoTracks()[0];
  const aTrack = peer.stream.getAudioTracks()[0];
  // "has picture" = the element actually decoded frames (remote tracks may report muted between sparse frames)
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setPlaying(false);
    v.srcObject = vTrack ? new MediaStream([vTrack]) : null;
    if (vTrack) v.play().catch(() => undefined);
    const on = () => setPlaying(v.videoWidth > 0);
    v.addEventListener("loadeddata", on);
    v.addEventListener("resize", on);
    return () => {
      v.removeEventListener("loadeddata", on);
      v.removeEventListener("resize", on);
    };
  }, [vTrack]);
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.srcObject = aTrack ? new MediaStream([aTrack]) : null;
    if (aTrack) a.play().catch(() => undefined);
  }, [aTrack]);
  const showVideo = (playing || peer.hasVideo) && !!vTrack && vTrack.readyState === "live" && peer.state.video !== false && !peer.state.audio_only && !audioOnly;
  const host = peer.role !== "member";
  const [menu, setMenu] = useState(false);
  return (
    <div
      className={cx(s.tile, !host && peer.state.face !== "real" && s.tileAvatar, toneClass(host ? "primary" : peer.tone), speaking && s.tileSpeaking)}
      data-peer={peer.id}
    >
      <video ref={videoRef} muted playsInline autoPlay aria-label={peer.name} style={{ opacity: showVideo ? 1 : 0 }} />
      <audio ref={audioRef} autoPlay muted={!speakerOn} />
      {!showVideo && (
        <div className={s.placeholder}>
          <span className={s.placeholderInner}>
            {host ? <SpecialistPhoto url={hostPhoto} name={peer.name} size={72} /> : <AvatarThumb config={null} seed={`circle-${peer.id}`} size={72} />}
            <span>{peer.connection === "connected" ? tt("Без\u00a0видео") : tt("Подключается")}</span>
          </span>
        </div>
      )}
      {peer.state.hand && (
        <span className={s.hand}>
          <Hand size={13} />{" "}{tt("Рука")}
        </span>
      )}
      <ReactionLayer items={reactions ?? []} />
      {host && !hostControls && <span className={s.hostBadge}>{peer.role === "cohost" ? tt("Ко-терапевт") : tt("Ведущий")}</span>}
      {hostControls && !host && (
        <div className={s.tileMenu}>
          <Button size="sm" variant="secondary" iconOnly aria-label={tt(`Действия: {name}`, { name: peer.name })} onClick={() => setMenu((m) => !m)} icon={<MoreHorizontal size={16} />} />
          {menu && (
            <div className={s.menu} role="menu">
              <Button size="sm" variant="ghost" onClick={() => { onMute(); setMenu(false); }} icon={<MicOff size={15} />}>
                {tt("Выключить микрофон")}
              </Button>
              {peer.state.hand && (
                <Button size="sm" variant="ghost" onClick={() => { onLowerHand(); setMenu(false); }} icon={<Hand size={15} />}>
                  {tt("Опустить руку")}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => { onRemove(); setMenu(false); }} icon={<LogOut size={15} />}>
                {tt("Удалить из\u00a0круга")}
              </Button>
            </div>
          )}
        </div>
      )}
      <div className={s.tileLabel}>
        <span className={s.name}>
          {peer.state.muted ? <MicOff size={13} className={s.mutedIcon} /> : <Mic size={13} />}
          {peer.name}
          {peer.state.face === "real" && !host && tt(" (лицо)")}
        </span>
      </div>
    </div>
  );
}
