"use client";

import { SessionTimer } from "./SessionTimer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CameraOff,
  Check,
  Lock,
  Mic,
  MicOff,
  NotebookPen,
  PhoneOff,
  RefreshCw,
  Waves,
  Wind,
  X,
} from "lucide-react";
import { Badge, Button, Card, Segmented, Spinner } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { sessionsApi } from "@/lib/api/endpoints";
import type { JoinResponse, Session } from "@/lib/api/types";
import { useAuth, homeFor } from "@/lib/auth/store";
import { normalizeAvatar, randomAvatar } from "@/lib/avatar/schema";
import { when, untilLabel } from "@/lib/format";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { BackdropPicker } from "@/components/avatar/BackdropPicker";
import { loadBackdrop, saveBackdrop, type BackdropId } from "@/lib/avatar/backdrops";
import { useAvatarCamera } from "@/hooks/useAvatarCamera";
import { useRealCamera } from "@/hooks/useRealCamera";
import { useP2PCall } from "@/hooks/useP2PCall";
import { useVoiceTransform, type VoicePreset } from "@/hooks/useVoiceTransform";
import { SessionNotepad } from "@/components/session/SessionNotepad";
import { BreathingSync } from "@/components/session/BreathingSync";
import s from "./Room.module.css";

const VOICES: { value: VoicePreset; label: string }[] = [
  { value: "off", label: "Мой голос" },
  { value: "lower", label: "Ниже" },
  { value: "higher", label: "Выше" },
];

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

/** Mounts an existing canvas element (the live avatar) into a React tree. */
function CanvasSlot({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !canvas) return;
    host.appendChild(canvas);
    return () => {
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, [canvas]);
  return <div ref={ref} style={{ position: "absolute", inset: 0 }} />;
}

/** Specialist's own camera self-view (mirrored). Never used for clients. */
function SelfVideo({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) v.play().catch(() => undefined);
  }, [stream]);
  return <video ref={ref} className={s.selfVideo} muted playsInline autoPlay aria-label="Ваша камера" />;
}

export function Room({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { user, status: authStatus, bootstrap } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"lobby" | "call" | "ended">("lobby");
  const [join, setJoin] = useState<JoinResponse | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoicePreset>("off");
  const [panel, setPanel] = useState<null | "notes" | "breath" | "voice">(null);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);
  useEffect(() => {
    if (authStatus === "guest") router.replace(`/login?next=${encodeURIComponent(`/room/${sessionId}`)}`);
  }, [authStatus, router, sessionId]);

  useEffect(() => {
    if (authStatus !== "authed") return;
    sessionsApi
      .get(sessionId)
      .then(setSession)
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Не получилось загрузить сессию."));
  }, [authStatus, sessionId]);

  // Clients are only ever seen as their avatar; specialists use their real camera.
  const role = user?.role === "psychologist" ? "psychologist" : "client";
  const isPro = role === "psychologist";

  const myAvatar = useMemo(
    () => (user?.avatar_config ? normalizeAvatar(user.avatar_config) : randomAvatar(user?.id ?? "me")),
    [user],
  );
  const [backdrop, setBackdropState] = useState<BackdropId>("dusk");
  useEffect(() => setBackdropState(loadBackdrop()), []);
  const setBackdrop = (id: BackdropId) => {
    setBackdropState(id);
    saveBackdrop(id);
  };
  const avatarCam = useAvatarCamera(myAvatar, { backdrop });
  const realCam = useRealCamera();
  const cam = isPro
    ? { ...realCam, faceLost: false, tracking: false, calibrating: false, recalibrate: () => undefined }
    : avatarCam;
  const { transformedStream } = useVoiceTransform({ inputStream: isPro ? null : avatarCam.audioStream, preset: voice });

  const localStream = useMemo(() => {
    if (phase !== "call") return null;
    if (isPro) return realCam.stream;
    if (!avatarCam.videoStream) return null;
    const audio = transformedStream?.getAudioTracks() ?? avatarCam.audioStream?.getAudioTracks() ?? [];
    return new MediaStream([...avatarCam.videoStream.getVideoTracks(), ...audio]);
  }, [isPro, realCam.stream, avatarCam.videoStream, avatarCam.audioStream, transformedStream, phase]);

  const onEnd = useCallback(() => setPhase("ended"), []);
  const call = useP2PCall({
    roomId: join?.room_id ?? "",
    wsToken: join?.ws_token ?? "",
    localStream,
    onEnd,
    videoMaxBitrate: isPro ? 1_500_000 : 900_000,
  });

  // Keep the session's can_join fresh while waiting in the lobby
  useEffect(() => {
    if (phase !== "lobby" || !session || session.can_join) return;
    const t = setInterval(() => sessionsApi.get(sessionId).then(setSession).catch(() => undefined), 30000);
    return () => clearInterval(t);
  }, [phase, session, sessionId]);

  const peer = session
    ? role === "psychologist"
      ? { name: session.client.alias, avatar: session.client.avatar_config, seed: session.client.alias }
      : { name: session.psychologist.display_name, avatar: session.psychologist.avatar_config, seed: String(session.psychologist.id) }
    : null;
  const peerName = join?.peer.name ?? peer?.name ?? "";
  const peerAvatar = join?.peer.avatar_config ?? peer?.avatar ?? null;
  const peerPhoto = isPro ? null : (join?.peer.photo_url ?? session?.psychologist.photo_url ?? null);
  /** The other party: a client is shown as their avatar, a specialist as their real photo. */
  const peerPic = (size: number) =>
    isPro ? (
      <AvatarThumb config={peerAvatar} seed={peer?.seed} size={size} />
    ) : (
      <SpecialistPhoto url={peerPhoto} name={peerName} size={size} />
    );

  const enter = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const res = await sessionsApi.join(sessionId);
      setJoin(res);
      setPhase("call");
    } catch (e) {
      setJoinError(e instanceof ApiError ? e.message : "Не получилось войти. Попробуйте ещё раз.");
    } finally {
      setJoining(false);
    }
  };

  const leave = () => {
    call.hangUp();
    cam.stop();
    setPhase("ended");
  };

  const complete = async () => {
    setCompleting(true);
    try {
      await sessionsApi.complete(sessionId);
      setCompleted(true);
    } catch {
      /* already completed or not allowed — ignore */
      setCompleted(true);
    } finally {
      setCompleting(false);
    }
  };

  useEffect(() => {
    if (phase === "ended") cam.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className={s.room}>
        <div className={s.ended}>
          <div className={s.endedCard}>
            <h2>Сессия недоступна</h2>
            <p className={s.note}>{loadError}</p>
            <Button variant="primary" href={homeFor(user?.role)}>
              Вернуться в кабинет
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!session || !user) {
    return (
      <div className={s.room}>
        <div className={s.ended}>
          <Spinner />
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className={s.room}>
        <div className={s.ended}>
          <div className={s.endedCard}>
            {peerPic(112)}
            <h2>Вы вышли из сессии</h2>
            <p className={s.note}>
              Видео и звук не записывались. Заметки остались только в этом браузере и удалятся сами через 24 часа.
            </p>
            {role === "psychologist" && !completed && (
              <Button variant="soft" loading={completing} onClick={complete} icon={<Check size={18} />}>
                Отметить сессию проведённой
              </Button>
            )}
            {completed && <Badge tone="success">Сессия отмечена проведённой</Badge>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <Button variant="secondary" onClick={() => setPhase("lobby")} icon={<RefreshCw size={18} />}>
                Вернуться в комнату
              </Button>
              <Button variant="primary" href={role === "psychologist" ? "/pro/sessions" : "/app/sessions"}>
                В кабинет
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "lobby") {
    const canJoin = session.can_join;
    const camReady = cam.state === "ready";
    return (
      <div className={s.room}>
        <div className={s.lobby}>
          <div className={`${s.stage} ${isPro ? s.stageWide : ""}`}>
            <div className={s.stageInner}>
              {isPro ? <SelfVideo stream={realCam.videoStream} /> : <CanvasSlot canvas={avatarCam.canvas} />}
            </div>
            {!camReady && (
              <div className={s.stagePlaceholder}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                  {isPro ? (
                    <Camera size={40} strokeWidth={1.6} />
                  ) : (
                    <AvatarThumb config={myAvatar} size={180} framing="portrait" background="transparent" />
                  )}
                  {cam.state === "starting" ? (
                    <Spinner label="Включаем камеру" />
                  ) : isPro ? (
                    <p style={{ maxWidth: 320 }}>Клиент увидит ваше настоящее видео с камеры. Проверьте свет и кадр перед входом.</p>
                  ) : (
                    <p style={{ maxWidth: 320 }}>
                      Камера нужна, чтобы аватар повторял вашу мимику. Собеседник видит только аватар, изображение с камеры остаётся на этом устройстве.
                    </p>
                  )}
                  {cam.error && <p className={s.errorText}>{cam.error}</p>}
                </div>
              </div>
            )}
            {camReady && (
              <div className={s.stageTag}>
                <span className={`${s.dot} ${cam.faceLost ? s.dotWarn : ""}`} />
                {isPro
                  ? "Так вас увидит клиент"
                  : cam.faceLost
                    ? "Лицо не видно. Сядьте ближе к свету"
                    : !cam.tracking
                      ? "Подключаем распознавание мимики"
                      : cam.calibrating
                        ? "Запоминаем ваше спокойное лицо. Расслабьтесь и смотрите в камеру"
                        : "Так вас увидит собеседник"}
              </div>
            )}
          </div>

          <div className={s.side}>
            <Card>
              <div className={s.peer}>
                {peerPic(64)}
                <div style={{ minWidth: 0 }}>
                  <div className={s.peerName}>{peerName}</div>
                  <div className={s.meta}>
                    {when(session.scheduled_at)}, {session.duration_minutes} минут
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className={s.label}>Перед входом</div>
              <ul className={s.checks}>
                <li className={s.check}>
                  <span className={`${s.checkIcon} ${camReady ? s.checkOk : ""}`}>
                    <Camera size={16} />
                  </span>
                  {isPro ? "Камера включена" : "Камера включена и аватар повторяет мимику"}
                </li>
                <li className={s.check}>
                  <span className={`${s.checkIcon} ${cam.audioStream ? s.checkOk : ""}`}>
                    <Mic size={16} />
                  </span>
                  Микрофон работает
                </li>
                <li className={s.check}>
                  <span className={`${s.checkIcon} ${s.checkOk}`}>
                    <Lock size={16} />
                  </span>
                  Видео идёт напрямую и зашифровано
                </li>
              </ul>
              {cam.tracking && (
                <Button variant="ghost" size="sm" onClick={cam.recalibrate} disabled={cam.calibrating} icon={<RefreshCw size={16} />}>
                  {cam.calibrating ? "Калибруем мимику…" : "Откалибровать мимику"}
                </Button>
              )}
            </Card>

            {!isPro && (
              <Card>
                <div className={s.label}>Фон за аватаром</div>
                <BackdropPicker value={backdrop} onChange={setBackdrop} size="sm" />
                <div className={s.label} style={{ marginTop: 16 }}>
                  Голос
                </div>
                <Segmented value={voice} onChange={setVoice} options={VOICES} ariaLabel="Фильтр голоса" />
                <p className={s.note} style={{ marginTop: 10 }}>
                  Фильтр меняет тембр, чтобы голос было сложнее узнать. Его можно переключить и во время сессии.
                </p>
              </Card>
            )}

            {!camReady ? (
              <Button variant="primary" size="lg" block loading={cam.state === "starting"} onClick={cam.start} icon={<Camera size={20} />}>
                Включить камеру
              </Button>
            ) : (
              <Button variant="primary" size="lg" block disabled={!canJoin} loading={joining} onClick={enter}>
                Войти в сессию
              </Button>
            )}
            {!canJoin && <p className={s.note}>Вход откроется за 10 минут до начала. Сессия начнётся {untilLabel(session.scheduled_at)}.</p>}
            {joinError && <p className={s.errorText}>{joinError}</p>}
            <Button variant="ghost" href={homeFor(user.role)}>
              Вернуться в кабинет
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── In call ────────────────────────────────────────────────────────────────
  const statusText =
    call.status === "connected" && call.hasRemote
      ? mmss(call.elapsed)
      : call.status === "reconnecting"
        ? "Восстанавливаем связь"
        : call.status === "failed"
          ? "Связь прервалась"
          : "Подключаемся";
  const videoOff = call.isCameraOff;

  return (
    <div className={s.room}>
      <div className={s.call}>
        <video ref={call.remoteVideoRef} className={s.remote} autoPlay playsInline />
        {!call.hasRemote && (
          <div className={s.waiting}>
            <div className={s.waitingAvatar}>
              {peerPic(148)}
            </div>
            <h3>{call.status === "failed" ? "Не удалось соединиться" : `Ждём, когда ${role === "client" ? "специалист" : "клиент"} войдёт`}</h3>
            <p className={s.note} style={{ maxWidth: 380 }}>
              {call.status === "failed"
                ? "Проверьте интернет и попробуйте переподключиться."
                : isPro
                  ? "Как только клиент подключится, вы увидите его аватар."
                  : "Как только специалист подключится, вы увидите его. Можно пока сделать пару спокойных вдохов."}
            </p>
            {call.status === "failed" && (
              <Button variant="primary" onClick={call.retryNow} icon={<RefreshCw size={18} />}>
                Переподключиться
              </Button>
            )}
          </div>
        )}

        <div className={s.topbar}>
          <div className={s.topPeer}>
            {peerPic(40)}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{peerName}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <SessionTimer className={s.pill} start={session.scheduled_at} minutes={session.duration_minutes} />
            <span className={s.pill}>
              <span className={`${s.dot} ${call.status === "connected" && call.hasRemote ? "" : s.dotWarn}`} />
              <span className="num">{statusText}</span>
            </span>
            <span className={s.pill}>
              <Lock size={14} /> Зашифровано
            </span>
          </div>
        </div>

        {!isPro && cam.faceLost && !videoOff && <div className={s.toast}>Лицо не видно, аватар замер. Сядьте ближе к свету</div>}

        <div className={`${s.pip} ${isPro ? s.pipWide : ""}`} aria-label={isPro ? "Ваша камера" : "Ваш аватар"}>
          {isPro ? <SelfVideo stream={realCam.videoStream} /> : <CanvasSlot canvas={avatarCam.canvas} />}
          {videoOff && <div className={s.pipOff}>{isPro ? "Камера выключена" : "Аватар скрыт от собеседника"}</div>}
        </div>

        {panel && (
          <div className={s.panel}>
            <div className={s.panelHead}>
              {panel === "notes" ? "Заметки" : panel === "breath" ? "Дыхание" : "Голос"}
              <Button variant="ghost" size="sm" iconOnly aria-label="Закрыть" onClick={() => setPanel(null)} icon={<X size={18} />} />
            </div>
            {panel === "notes" && <SessionNotepad roomId={sessionId} />}
            {panel === "breath" && <BreathingSync />}
            {panel === "voice" && (
              <>
                <Segmented value={voice} onChange={setVoice} options={VOICES} ariaLabel="Фильтр голоса" />
                <p className={s.note}>Собеседник услышит изменённый голос сразу после переключения.</p>
              </>
            )}
          </div>
        )}

        <div className={s.controls} role="toolbar" aria-label="Управление сессией">
          <button className={`${s.ctrl} ${call.isMuted ? s.ctrlOff : ""}`} onClick={call.toggleMute} aria-label={call.isMuted ? "Включить микрофон" : "Выключить микрофон"} aria-pressed={call.isMuted}>
            {call.isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          <button
            className={`${s.ctrl} ${videoOff ? s.ctrlOff : ""}`}
            onClick={call.toggleCamera}
            aria-label={isPro ? (videoOff ? "Включить камеру" : "Выключить камеру") : videoOff ? "Показать аватар" : "Скрыть аватар"}
            aria-pressed={videoOff}
          >
            {videoOff ? <CameraOff size={22} /> : <Camera size={22} />}
          </button>
          {!isPro && (
            <button className={`${s.ctrl} ${panel === "voice" ? s.ctrlOff : ""}`} onClick={() => setPanel(panel === "voice" ? null : "voice")} aria-label="Фильтр голоса">
              <Waves size={22} />
            </button>
          )}
          <button className={`${s.ctrl} ${panel === "breath" ? s.ctrlOff : ""}`} onClick={() => setPanel(panel === "breath" ? null : "breath")} aria-label="Дыхательная пауза">
            <Wind size={22} />
          </button>
          <button className={`${s.ctrl} ${panel === "notes" ? s.ctrlOff : ""}`} onClick={() => setPanel(panel === "notes" ? null : "notes")} aria-label="Заметки">
            <NotebookPen size={22} />
          </button>
          <button className={`${s.ctrl} ${s.ctrlEnd}`} onClick={leave} aria-label="Выйти из сессии">
            <PhoneOff size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
