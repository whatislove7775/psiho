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
 *  - Mesh transport: useGroupCall (docs/CIRCLES.md).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Eye,
  Hand,
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
import { useRealCamera } from "@/hooks/useRealCamera";
import { useVoiceTransform, VOICE_PRESETS, type VoicePreset } from "@/hooks/useVoiceTransform";
import { useGroupCall, type PeerView } from "@/hooks/useGroupCall";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { CanvasSlot, SelfVideo, mmss } from "@/components/room/parts";
import { VoicePicker } from "@/components/room/VoicePicker";
import { PanicButton } from "@/components/privacy/PanicButton";
import { Together, TeaWait } from "@/components/illustrations";
import { GroupChat } from "./GroupChat";
import { cx, toneClass } from "./bits";
import s from "./groupRoom.module.css";

type Side = null | "chat" | "people" | "voice";

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
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не получилось открыть встречу."));
  }, [meetingId]);
  useEffect(() => {
    if (authStatus === "authed") load();
  }, [authStatus, load]);

  const isHost = info?.role === "host";
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
  const avatarCam = useAvatarCamera(avatarCfg, { backdrop: "dusk", realFace: allowReal && realFace });
  const realCam = useRealCamera();
  const startAvatar = avatarCam.start;
  const startReal = realCam.start;
  useEffect(() => {
    if (!info) return;
    if (info.role === "host") startReal();
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
      toast("Ведущий выключил микрофоны. Включите свой, когда захотите сказать.");
    },
    onHandLowered: () => setHand(false),
  });

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
  const backHref = info ? (isHost ? `/pro/circles/${info.circle.id}` : `/app/circles/${info.circle.id}`) : "/app/circles";

  // ── screens ──────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={s.root}>
        <div className={s.center}>
          <div className={s.centerBox}>
            <TeaWait className={s.centerArt} />
            <h1>Встреча пока недоступна</h1>
            <p>{error}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" onClick={() => router.back()} icon={<ArrowLeft size={16} />}>
                Назад
              </Button>
              <Button variant="primary" onClick={load}>
                Проверить ещё раз
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
          <Spinner label="Открываем комнату" />
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
            <h1>{removed ? "Ведущий попросил вас покинуть круг" : call.status === "ended" ? "Встреча закончилась" : "Вы вышли из встречи"}</h1>
            <p>
              {removed
                ? "Деньги за будущие встречи вернулись на баланс. Если что-то пошло не так, напишите в поддержку."
                : "Спасибо, что были в круге. Поделиться мыслями после встречи можно в чате круга."}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {phase === "left" && call.status !== "ended" && !removed && (
                <Button variant="secondary" onClick={() => setPhase("call")}>
                  Вернуться
                </Button>
              )}
              <Button variant="primary" href={backHref}>
                {isHost ? "К управлению кругом" : "К странице круга"}
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
          <Button variant="ghost" iconOnly aria-label="Назад" href={backHref} icon={<ArrowLeft size={20} />} />
          <div className={s.topTitle}>
            <b>{info.circle.title}</b>
            <small>
              Встреча {info.meeting.index}, {info.circle.topic_label.toLowerCase()}
            </small>
          </div>
          <PanicButton />
        </header>
        <div className={s.lobby}>
          <div className={s.preview}>
            {isHost ? <SelfVideo stream={realCam.videoStream} /> : <CanvasSlot canvas={avatarCam.canvas} />}
            {camState !== "ready" && (
              <div className={s.placeholder}>
                {camError ? <p style={{ maxWidth: 360, padding: 16, color: "var(--c-muted)" }}>{camError}</p> : <Spinner label="Включаем камеру" />}
              </div>
            )}
            <div className={s.previewNote}>
              {!isHost && (
                <Badge tone="success">
                  <Shield size={12} /> Все видят только аватар
                </Badge>
              )}
              {!isHost && voice !== "off" && (
                <Badge tone="lilac">
                  <Waves size={12} /> Маска голоса включена
                </Badge>
              )}
            </div>
          </div>
          <div className={s.lobbyPanel}>
            <h1>{isHost ? "Вы ведёте встречу" : "Перед входом"}</h1>
            <div className={s.me}>
              {isHost ? (
                <SpecialistPhoto url={info.host.photo_url} name={info.host.name} size={46} />
              ) : (
                <AvatarThumb config={avatarCfg} size={46} />
              )}
              <div>
                <b>{info.self.name}</b>
                <small>{isHost ? "Участники видят ваше лицо и имя" : "Так вас увидят и услышат в круге"}</small>
              </div>
            </div>
            {!isHost && (
              <>
                <div>
                  <div className={s.label}>Аватар</div>
                  <Segmented
                    ariaLabel="Какой аватар показать"
                    value={ownAvatar ? "own" : "circle"}
                    onChange={(v) => setOwnAvatar(v === "own")}
                    options={[
                      { value: "circle", label: "Новый для круга" },
                      { value: "own", label: "Мой аватар" },
                    ]}
                  />
                  <p style={{ marginTop: 6 }}>
                    {ownAvatar ? "Ваш обычный аватар: его может узнать специалист, с которым вы общаетесь в диалогах." : "Отдельный аватар только для этого круга — так вас точно не узнать."}
                  </p>
                </div>
                <div>
                  <div className={s.label}>Голос</div>
                  <VoicePicker value={voice} onChange={setVoice} compact />
                </div>
              </>
            )}
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: "var(--t-13)", cursor: "pointer" }}>
              <input type="checkbox" checked={audioOnlyStart} onChange={(e) => setAudioOnlyStart(e.target.checked)} style={{ marginTop: 3, accentColor: "var(--c-primary)" }} />
              <span>
                Только звук
                <br />
                <span style={{ color: "var(--c-muted)" }}>Для слабого интернета: видео не отправляется и не принимается.</span>
              </span>
            </label>
            <Button variant="primary" size="lg" block onClick={enter} disabled={camState !== "ready" || !audioTrack}>
              Войти во встречу
            </Button>
            <p>Встречу не записываем. Звук и видео идут напрямую между участниками и не проходят через наш сервер.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── call ─────────────────────────────────────────────────────────
  const tiles = 1 + call.peers.length;
  const shape = gridShape(tiles, narrow);
  const hands = call.peers.filter((p) => p.state.hand);
  const statusPill =
    call.status === "live" ? (
      <span className={cx(s.pill, s.pillLive)}>{mmss(elapsed)}</span>
    ) : (
      <span className={cx(s.pill, s.pillWarn)}>
        <WifiOff size={14} /> {call.status === "failed" ? "Нет связи" : "Подключаемся"}
      </span>
    );

  return (
    <div className={s.root}>
      <header className={s.top}>
        <div className={s.topTitle}>
          <b>{info.circle.title}</b>
          <small>
            {tiles} {tiles === 1 ? "участник" : tiles < 5 ? "участника" : "участников"} в комнате
            {hands.length > 0 && isHost ? `, руку подняли: ${hands.length}` : ""}
          </small>
        </div>
        {call.tier !== "high" && (
          <span className={cx(s.pill, s.pillWarn)} title="Качество подстроено под интернет">
            <Wifi size={14} /> {call.tier === "audio" ? "Только звук" : "Экономим трафик"}
          </span>
        )}
        {statusPill}
        <PanicButton />
      </header>
      <div className={s.stage}>
        <div className={s.gridWrap}>
          <div className={s.grid} style={{ ["--cols" as string]: shape.cols, ["--rows" as string]: shape.rows } as React.CSSProperties}>
            <div className={cx(s.tile, !isHost && !realFace && s.tileAvatar, toneClass(isHost ? "primary" : info.self.tone), call.selfSpeaking && s.tileSpeaking)}>
              {camOff || call.tier === "audio" ? (
                <div className={s.placeholder}>
                  <span className={s.placeholderInner}>
                    {isHost ? <SpecialistPhoto url={info.host.photo_url} name={info.self.name} size={72} /> : <AvatarThumb config={avatarCfg} size={72} />}
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
                  <Hand size={13} /> Рука поднята
                </span>
              )}
              <div className={s.tileLabel}>
                <span className={s.name}>
                  {muted ? <MicOff size={13} className={s.mutedIcon} /> : <Mic size={13} />}
                  Вы, {info.self.name}
                </span>
              </div>
            </div>
            {call.peers.map((p) => (
              <PeerTile
                key={p.id}
                peer={p}
                speaking={call.speaker === p.id}
                speakerOn={speakerOn}
                audioOnly={call.tier === "audio"}
                hostControls={isHost}
                hostPhoto={info.host.photo_url}
                onMute={() => call.hostAction("mute", p.id)}
                onLowerHand={() => call.hostAction("lower-hand", p.id)}
                onRemove={() => setConfirm({ kind: "remove", peer: p })}
              />
            ))}
          </div>
        </div>
        {side && (
          <aside className={s.side} aria-label={side === "chat" ? "Чат круга" : side === "people" ? "Участники" : "Голос"}>
            <div className={s.sideHead}>
              <h2>{side === "chat" ? "Чат круга" : side === "people" ? "В комнате" : "Маска голоса"}</h2>
              <Button variant="ghost" size="sm" iconOnly aria-label="Закрыть" onClick={() => setSide(null)} icon={<X size={18} />} />
            </div>
            <div className={s.sideBody}>
              {side === "chat" && <GroupChat circleId={info.circle.id} hostPhoto={info.host.photo_url} compact />}
              {side === "voice" && <VoicePicker value={voice} onChange={setVoice} />}
              {side === "people" && (
                <ul className={s.people}>
                  <li>
                    {isHost ? <SpecialistPhoto url={info.host.photo_url} name={info.self.name} size={34} /> : <AvatarThumb config={avatarCfg} size={34} />}
                    <span>
                      {info.self.name}
                      <small>Это вы</small>
                    </span>
                  </li>
                  {call.peers.map((p) => (
                    <li key={p.id}>
                      {p.role === "host" ? <SpecialistPhoto url={info.host.photo_url} name={p.name} size={34} /> : <AvatarThumb config={null} seed={`circle-${p.id}`} size={34} />}
                      <span>
                        {p.name}
                        <small>
                          {p.role === "host" ? "Ведущий" : p.state.hand ? "Рука поднята" : p.state.muted ? "Микрофон выключен" : "Слушает"}
                        </small>
                      </span>
                      {isHost && p.role !== "host" && (
                        <>
                          {p.state.hand && (
                            <Button size="sm" variant="ghost" onClick={() => call.hostAction("lower-hand", p.id)}>
                              Опустить руку
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" iconOnly aria-label={`Выключить микрофон: ${p.name}`} onClick={() => call.hostAction("mute", p.id)} icon={<MicOff size={16} />} />
                          <Button size="sm" variant="ghost" iconOnly aria-label={`Удалить из круга: ${p.name}`} onClick={() => setConfirm({ kind: "remove", peer: p })} icon={<LogOut size={16} />} />
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
      <nav className={s.bar} aria-label="Управление встречей">
        <Ctl label={muted ? "Включить" : "Микрофон"} off={muted} onClick={() => setMuted((m) => !m)} icon={muted ? <MicOff size={22} /> : <Mic size={22} />} />
        <Ctl
          label={call.tier === "audio" ? "Видео" : camOff ? "Видео" : "Видео"}
          off={camOff || call.tier === "audio"}
          onClick={() => {
            if (call.tier === "audio") setTier("high");
            else setCamOff((c) => !c);
          }}
          icon={camOff || call.tier === "audio" ? <CameraOff size={22} /> : <Camera size={22} />}
        />
        {!isHost && <Ctl label="Рука" on={hand} onClick={() => setHand((h) => !h)} icon={<Hand size={22} />} />}
        {!isHost && <Ctl label="Голос" active={side === "voice"} onClick={() => setSide(side === "voice" ? null : "voice")} icon={<Waves size={22} />} />}
        <Ctl label="Чат" active={side === "chat"} onClick={() => setSide(side === "chat" ? null : "chat")} icon={<MessagesSquare size={22} />} />
        <Ctl label="Люди" active={side === "people"} onClick={() => setSide(side === "people" ? null : "people")} icon={<Users size={22} />} />
        <Ctl label={speakerOn ? "Звук" : "Звук выкл"} off={!speakerOn} onClick={() => setSpeakerOn((v) => !v)} icon={speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />} />
        {!isHost && allowReal && (
          <Ctl label={realFace ? "Аватар" : "Лицо"} active={realFace} onClick={() => (realFace ? setRealFace(false) : setAskFace(true))} icon={<Eye size={22} />} />
        )}
        {isHost && <Ctl label="Выкл. всем" onClick={() => call.hostAction("mute-all")} icon={<MicOff size={22} />} />}
        <span className={s.sep} aria-hidden />
        {isHost ? (
          <Ctl label="Завершить" end onClick={() => setConfirm({ kind: "end" })} icon={<PhoneOff size={22} />} />
        ) : (
          <Ctl label="Выйти" end onClick={() => setConfirm({ kind: "leave" })} icon={<PhoneOff size={22} />} />
        )}
        {isHost && <Ctl label="Выйти" onClick={() => setPhase("left")} icon={<LogOut size={22} />} />}
      </nav>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === "remove" ? "Удалить участника?" : confirm?.kind === "end" ? "Завершить встречу для всех?" : "Выйти из встречи?"}>
        <p style={{ margin: "0 0 16px", color: "var(--c-muted)", lineHeight: 1.55 }}>
          {confirm?.kind === "remove"
            ? `${confirm.peer?.name} покинет круг и больше не сможет заходить на встречи и писать в чат. Деньги за будущие встречи вернутся ему полностью.`
            : confirm?.kind === "end"
              ? "Комната закроется у всех участников, а оплата за эту встречу спишется. Используйте, когда встреча действительно закончилась."
              : "Вы сможете вернуться, пока встреча идёт."}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Отмена
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
            {confirm?.kind === "remove" ? "Удалить" : confirm?.kind === "end" ? "Завершить" : "Выйти"}
          </Button>
        </div>
      </Modal>
      <Modal open={askFace} onClose={() => setAskFace(false)} title="Показать настоящее лицо?">
        <p style={{ margin: "0 0 16px", color: "var(--c-muted)", lineHeight: 1.55 }}>
          Все участники круга и ведущий увидят изображение с вашей камеры вместо аватара. Встречи не записываются, но скриншот сделать может любой. Вернуться к аватару можно одной кнопкой.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setAskFace(false)}>
            Остаться в аватаре
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setRealFace(true);
              setAskFace(false);
            }}
          >
            Показать лицо
          </Button>
        </div>
      </Modal>
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
  const host = peer.role === "host";
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
            <span>{peer.connection === "connected" ? "Без видео" : "Подключается"}</span>
          </span>
        </div>
      )}
      {peer.state.hand && (
        <span className={s.hand}>
          <Hand size={13} /> Рука
        </span>
      )}
      {host && !hostControls && <span className={s.hostBadge}>Ведущий</span>}
      {hostControls && !host && (
        <div className={s.tileMenu}>
          <Button size="sm" variant="secondary" iconOnly aria-label={`Действия: ${peer.name}`} onClick={() => setMenu((m) => !m)} icon={<MoreHorizontal size={16} />} />
          {menu && (
            <div className={s.menu} role="menu">
              <Button size="sm" variant="ghost" onClick={() => { onMute(); setMenu(false); }} icon={<MicOff size={15} />}>
                Выключить микрофон
              </Button>
              {peer.state.hand && (
                <Button size="sm" variant="ghost" onClick={() => { onLowerHand(); setMenu(false); }} icon={<Hand size={15} />}>
                  Опустить руку
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => { onRemove(); setMenu(false); }} icon={<LogOut size={15} />}>
                Удалить из круга
              </Button>
            </div>
          )}
        </div>
      )}
      <div className={s.tileLabel}>
        <span className={s.name}>
          {peer.state.muted ? <MicOff size={13} className={s.mutedIcon} /> : <Mic size={13} />}
          {peer.name}
          {peer.state.face === "real" && !host && " (лицо)"}
        </span>
      </div>
    </div>
  );
}
