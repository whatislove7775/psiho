"use client";

/**
 * The call screen (/room/[id]): lobby → call → end, for both sides.
 *
 *  - A client is seen as their avatar (useAvatarCamera) with an optional
 *    voice filter; their camera picture never leaves the device — unless they
 *    deliberately opt in to «Показать настоящее лицо» (RealFace.tsx): then the
 *    outgoing video track is swapped to the camera with replaceTrack (no
 *    renegotiation), a badge stays on screen, and one tap switches back.
 *  - A specialist sends real camera video (useRealCamera).
 *  - The in-call chat is the dialogue's thread (C1's <DialogThread compact />).
 *
 * With `labToken` (a signed invite from /admin/lab) it opens a staff test
 * room instead: no login, no booking, the side comes from the token.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Eye,
  FlaskConical,
  Lock,
  MessageCircle,
  MoreHorizontal,
  PhoneOff,
  RefreshCw,
  Star,
  Users,
  Waves,
  WifiOff,
  X,
} from "lucide-react";
import { Button, Modal, Spinner, useToast } from "@/ui";
import { MI, Morph } from "@/components/ui/Morph";
import { ApiError } from "@/lib/api/client";
import { sessionsApi } from "@/lib/api/endpoints";
import { labApi, type LabJoinResponse } from "@/lib/api/lab";
import { callsApi, type CallIssue, type CallTech } from "@/lib/api/calls";
import type { JoinResponse, Session } from "@/lib/api/types";
import { useAuth, homeFor } from "@/lib/auth/store";
import { normalizeAvatar, randomAvatar } from "@/lib/avatar/schema";
import { when } from "@/lib/format";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { BackdropPicker } from "@/components/avatar/BackdropPicker";
import { getBackdrop, loadAmbient, loadBackdrop, saveAmbient, saveBackdrop, type BackdropId } from "@/lib/avatar/backdrops";
import { useAvatarCamera } from "@/hooks/useAvatarCamera";
import { useRealCamera } from "@/hooks/useRealCamera";
import { useP2PCall } from "@/hooks/useP2PCall";
import { useVoiceTransform, VOICE_PRESETS, type VoicePreset } from "@/hooks/useVoiceTransform";
import { avatarPerf } from "@/lib/tracking/perf";
import { SessionNotepad } from "@/components/session/SessionNotepad";
import { BreathingSync } from "@/components/session/BreathingSync";
import { DialogThread } from "@/components/dialogs/DialogThread";
import { TeaWait } from "@/components/illustrations";
import { CanvasSlot, DraggablePip, MicMeter, QualityBars, QUALITY_LABEL, SelfVideo, mmss, useRemaining } from "./parts";
import { CallMore, canPickSpeaker, useDevices, type DeviceChoice } from "./CallMore";
import { VoicePicker, loadVoice, saveVoice } from "./VoicePicker";
import { IssueChips, ReportProblem } from "./ReportProblem";
import { DebugOverlay } from "./DebugOverlay";
import { FaceBadge, FaceChoice, RealFaceConfirm, loadRealFacePref, saveRealFacePref } from "./RealFace";
import art from "./art.module.css";
import s from "./Room.module.css";
import { PanicButton } from "@/components/privacy/PanicButton";
import { ReviewPrompt } from "@/components/reviews/ReviewPrompt";

type Panel = null | "chat" | "voice" | "more" | "notes" | "breath";

/** A test room from the staff lab, shaped like a Session so the normal room UI works unchanged. */
function labSession(res: LabJoinResponse): Session {
  const t = res.test_room;
  return {
    id: t.id,
    status: "in_progress",
    scheduled_at: t.created_at,
    duration_minutes: Math.max(1, Math.round((Date.parse(t.expires_at) - Date.parse(t.created_at)) / 60000)),
    amount_rub: 0,
    room_id: res.room_id,
    can_join: true,
    psychologist: { id: 0, display_name: res.role === "client" ? res.peer.name : "Тестовый специалист", avatar_config: null, photo_url: null },
    // no avatar chosen in the lab → the same seeded random avatar on both sides
    client: { alias: res.role === "psychologist" ? res.peer.name : "Тестовый клиент", avatar_config: t.client_avatar ?? randomAvatar(t.id) },
    payment_url: null,
  };
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function minutesText(sec: number) {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

function browserName() {
  const ua = navigator.userAgent;
  return /edg\//i.test(ua) ? "Edge" : /firefox/i.test(ua) ? "Firefox" : /chrome|crios/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "other";
}

export function Room({ sessionId, labToken }: { sessionId: string; labToken?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { user, status: authStatus, bootstrap } = useAuth();
  const isLab = !!labToken;
  const [labJoin, setLabJoin] = useState<LabJoinResponse | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"lobby" | "call" | "ended">("lobby");
  const [join, setJoin] = useState<JoinResponse | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [voice, setVoiceState] = useState<VoicePreset>("off");
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [spent, setSpent] = useState(0);
  const [peerHere, setPeerHere] = useState<boolean | null>(null);
  const [debug, setDebug] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sink, setSink] = useState<string | null>(null);
  const [idle, setIdle] = useState(false);
  const [reconnects, setReconnects] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const remoteEl = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    bootstrap();
    setDebug(/[?&]debug=1\b/.test(window.location.search));
    setVoiceState(loadVoice());
  }, [bootstrap]);
  // the specialist never uses the avatar pipeline, so this only matters for clients
  const isProUser = user?.role === "psychologist";
  useEffect(() => {
    if (!isProUser && !labToken && loadRealFacePref()) setRealFace(true);
  }, [isProUser, labToken]);
  useEffect(() => {
    if (authStatus === "guest" && !isLab) router.replace(`/login?next=${encodeURIComponent(`/room/${sessionId}`)}`);
  }, [authStatus, router, sessionId, isLab]);

  // Lab test room: the invite token is the credential (works on a phone that isn't logged in).
  useEffect(() => {
    if (!labToken) return;
    labApi
      .join(labToken)
      .then((res) => {
        setLabJoin(res);
        setSession(labSession(res));
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Не получилось открыть тестовую комнату."));
  }, [labToken]);

  useEffect(() => {
    if (authStatus !== "authed" || isLab) return;
    sessionsApi
      .get(sessionId)
      .then(setSession)
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Не получилось загрузить звонок."));
  }, [authStatus, sessionId, isLab]);

  // Clients are only ever seen as their avatar; specialists use their real camera.
  const role = isLab ? (labJoin?.role ?? "client") : user?.role === "psychologist" ? "psychologist" : "client";
  const isPro = role === "psychologist";

  const labAvatar = labJoin?.test_room.client_avatar ?? null;
  const myAvatar = useMemo(
    () =>
      labAvatar
        ? normalizeAvatar(labAvatar)
        : isLab
          ? randomAvatar(labJoin?.test_room.id ?? "lab")
          : user?.avatar_config
            ? normalizeAvatar(user.avatar_config)
            : randomAvatar(user?.id ?? labJoin?.test_room.id ?? "me"),
    [user, labAvatar, labJoin?.test_room.id, isLab],
  );
  const [backdrop, setBackdropState] = useState<BackdropId>("dusk");
  useEffect(() => setBackdropState(loadBackdrop()), []);
  const setBackdrop = (id: BackdropId) => {
    setBackdropState(id);
    saveBackdrop(id);
  };
  const setVoice = (v: VoicePreset) => {
    setVoiceState(v);
    saveVoice(v);
  };
  // Blurred landscape behind the call screen (per-device setting).
  const [ambient, setAmbientState] = useState(true);
  useEffect(() => setAmbientState(loadAmbient()), []);
  const toggleAmbient = () =>
    setAmbientState((on) => {
      saveAmbient(!on);
      return !on;
    });
  // Opt-in real camera (clients only). Never on by default; the only memory is
  // an explicit "remember on this device" choice in localStorage.
  const [realFace, setRealFace] = useState(false);
  const [faceAsk, setFaceAsk] = useState(false);
  const avatarCam = useAvatarCamera(myAvatar, { backdrop, realFace: !isPro && realFace });
  const showingFace = realFace && !!avatarCam.faceStream;
  const confirmRealFace = (remember: boolean) => {
    setFaceAsk(false);
    setRealFace(true);
    if (remember) saveRealFacePref(true);
  };
  const backToAvatar = () => {
    setRealFace(false);
    saveRealFacePref(false);
  };
  const realCam = useRealCamera();
  const cam = isPro ? realCam : avatarCam;
  const camState = cam.state;
  const camError = cam.error;
  const micStream = isPro ? realCam.audioStream : avatarCam.audioStream;
  const { transformedStream } = useVoiceTransform({
    inputStream: isPro ? null : avatarCam.audioStream,
    preset: isPro ? "off" : voice,
    preload: !isPro,
  });

  // Start the camera straight away if the browser already allows it (no extra click).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !session || phase !== "lobby") return;
    autoStarted.current = true;
    const perms = navigator.permissions as Permissions | undefined;
    perms
      ?.query({ name: "camera" as PermissionName })
      .then((p) => {
        if (p.state === "granted") cam.start();
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, phase]);

  const localStream = useMemo(() => {
    if (phase !== "call") return null;
    if (isPro) return realCam.stream;
    if (!avatarCam.videoStream) return null;
    // With a filter chosen, never fall back to the raw voice (not even while the filter starts up).
    const audio = voice === "off" ? (avatarCam.audioStream?.getAudioTracks() ?? []) : (transformedStream?.getAudioTracks() ?? []);
    // The real camera only after the explicit opt-in; the avatar otherwise (and while it starts).
    const video = realFace && avatarCam.faceStream ? avatarCam.faceStream : avatarCam.videoStream;
    return new MediaStream([...video.getVideoTracks(), ...audio]);
  }, [isPro, realCam.stream, avatarCam.videoStream, avatarCam.faceStream, realFace, avatarCam.audioStream, transformedStream, voice, phase]);

  const onEnd = useCallback(() => setPhase("ended"), []);
  const call = useP2PCall({
    roomId: join?.room_id ?? "",
    wsToken: join?.ws_token ?? "",
    localStream,
    onEnd,
    videoMaxBitrate: isPro ? 1_500_000 : 900_000,
    faceMode: isPro ? undefined : showingFace ? "real" : "avatar",
  });

  useEffect(() => {
    if (call.status === "reconnecting") setReconnects((n) => n + 1);
  }, [call.status]);

  // Specialist: a short, quiet note when the client switches between avatar and real camera.
  const [faceNote, setFaceNote] = useState<string | null>(null);
  const prevRemoteFace = useRef(call.remoteFace);
  useEffect(() => {
    if (prevRemoteFace.current === call.remoteFace) return;
    prevRemoteFace.current = call.remoteFace;
    if (!isPro) return;
    setFaceNote(call.remoteFace === "real" ? "Клиент включил настоящую камеру" : "Клиент вернулся к аватару");
    const t = setTimeout(() => setFaceNote(null), 5000);
    return () => clearTimeout(t);
  }, [call.remoteFace, isPro]);

  // Lobby: keep can_join fresh and show whether the other side is already in the room.
  useEffect(() => {
    if (isLab || phase !== "lobby" || !session) return;
    let alive = true;
    const poll = () => {
      callsApi
        .presence(sessionId)
        .then((r) => alive && setPeerHere(r.peer_in_room))
        .catch(() => undefined);
      if (!session.can_join) sessionsApi.get(sessionId).then((x) => alive && setSession(x)).catch(() => undefined);
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [phase, session, sessionId, isLab]);

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
    isPro ? <AvatarThumb config={peerAvatar} seed={peer?.seed} size={size} /> : <SpecialistPhoto url={peerPhoto} name={peerName} size={size} />;
  const peerWord = isPro ? "Клиент" : "Специалист";

  const conversationId = join?.conversation_id ?? session?.conversation_id ?? null;
  const dialogueId = join?.dialogue_id ?? session?.dialogue_id ?? conversationId;
  const dialogueHref = isLab ? "/admin/lab" : `${isPro ? "/pro" : "/app"}/dialogs${dialogueId ? `?d=${encodeURIComponent(dialogueId)}` : ""}`;

  const remaining = useRemaining(session?.scheduled_at ?? null, isLab ? null : (session?.duration_minutes ?? null));

  const enter = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const res = labToken ? await labApi.join(labToken) : await sessionsApi.join(sessionId);
      setJoin(res);
      setPhase("call");
    } catch (e) {
      setJoinError(e instanceof ApiError ? e.message : "Не получилось войти. Попробуйте ещё раз.");
    } finally {
      setJoining(false);
    }
  };

  const leave = () => {
    setSpent(call.elapsed);
    call.hangUp();
    cam.stop();
    setConfirmEnd(false);
    setPanel(null);
    setPhase("ended");
  };

  useEffect(() => {
    if (phase === "ended") {
      cam.stop();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Devices, speaker, fullscreen ──────────────────────────────────────
  const devices = useDevices(camState === "ready");
  const choice: DeviceChoice = { videoinput: cam.devices.videoinput, audioinput: cam.devices.audioinput, audiooutput: sink };
  const onDevice = (kind: MediaDeviceKind, id: string) => {
    if (kind === "audiooutput") {
      const v = remoteEl.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
      v?.setSinkId?.(id)
        .then(() => setSink(id))
        .catch(() => toast("Не получилось переключить динамик.", { error: true }));
      return;
    }
    cam.switchDevice(kind, id).catch(() => toast("Не получилось переключить устройство. Возможно, оно занято другой программой.", { error: true }));
  };
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else rootRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  // Hide the controls after a few seconds without pointer movement (only while connected, no panel open).
  useEffect(() => {
    if (phase !== "call") return;
    let t: ReturnType<typeof setTimeout>;
    let px = -1, py = -1;
    // keep the controls while the pointer rests on them or a control has keyboard focus
    const hide = () => {
      const over = px >= 0 && document.elementFromPoint(px, py)?.closest("nav, header, aside");
      if (over || document.activeElement?.closest("nav, header, aside")) t = setTimeout(hide, 1500);
      else setIdle(true);
    };
    const wake = (e?: Event) => {
      if (e && "clientX" in e) {
        px = (e as PointerEvent).clientX;
        py = (e as PointerEvent).clientY;
      }
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(hide, 4500);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [phase]);

  // Keyboard: M — microphone, V — camera/avatar (not while typing).
  useEffect(() => {
    if (phase !== "call") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      if (e.key === "m" || e.key === "ь") call.toggleMute();
      else if (e.key === "v" || e.key === "м") call.toggleCamera();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, call]);

  const tech = useCallback((): CallTech => {
    const p = avatarPerf.snapshot();
    const st = call.stats;
    return {
      ...(st ?? {}),
      status: call.status,
      browser: browserName(),
      voice: isPro ? "off" : voice,
      durationSec: call.elapsed,
      reconnects,
      ...(isPro ? {} : { backend: p.backend, detectFps: p.detectFps, detectMs: p.detectMs, latencyMs: p.latencyMs }),
    };
  }, [call.stats, call.status, call.elapsed, isPro, voice, reconnects]);

  // ── Render ────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className={s.room}>
        <div className={s.center}>
          <div className={s.card}>
            <span className={s.bigIcon}>
              <WifiOff size={28} />
            </span>
            <h2 className={s.h2}>Звонок недоступен</h2>
            <p className={s.note}>{loadError}</p>
            <Button variant="primary" href={isLab ? "/admin/lab" : homeFor(user?.role)}>
              {isLab ? "В лабораторию" : "На главную"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!session || (!user && !isLab)) {
    return (
      <div className={s.room}>
        <div className={s.center}>
          <Spinner label="Открываем звонок" />
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className={s.room}>
        <EndScreen
          peerPic={peerPic(96)}
          peerName={peerName}
          spent={spent}
          sessionId={sessionId}
          isPro={isPro}
          isLab={isLab}
          dialogueHref={dialogueHref}
          canRejoin={!remaining || remaining.left > 0}
          onRejoin={() => {
            setJoin(null);
            setPhase("lobby");
            cam.start();
          }}
          tech={tech}
          reviewFor={!isPro && !isLab && session.psychologist.id ? { id: session.psychologist.id, name: session.psychologist.display_name } : null}
        />
      </div>
    );
  }

  if (phase === "lobby") {
    const canJoin = session.can_join;
    const camReady = camState === "ready";
    const statusLine = isLab
      ? `Тестовый звонок, ссылка действует до ${clock(labJoin?.test_room.expires_at ?? session.scheduled_at)}`
      : `${when(session.scheduled_at)}, ${session.duration_minutes} мин`;
    const tag = !camReady
      ? null
      : isPro
        ? "Так вас увидит клиент"
        : avatarCam.faceLost
          ? "Лицо не видно. Сядьте ближе к свету"
          : !avatarCam.tracking
            ? "Подключаем распознавание мимики"
            : showingFace
              ? "Специалист увидит ваше настоящее лицо"
              : avatarCam.calibrating
                ? "Запоминаем спокойное лицо. Расслабьтесь и смотрите в камеру"
                : "Так вас увидит специалист";
    return (
      <div className={s.room} ref={rootRef}>
        <PanicButton />
        <header className={s.lobbyHead}>
          <Button variant="ghost" size="sm" href={dialogueHref} icon={<ArrowLeft size={18} />}>
            {isLab ? "В лабораторию" : "К диалогу"}
          </Button>
          <span className={s.secure}>
            <Lock size={14} /> Зашифровано, без записи
          </span>
        </header>
        <div className={s.lobby}>
          <div className={`${s.preview} ${isPro ? s.previewWide : ""}`}>
            <div className={s.fill}>
              {isPro ? (
                <SelfVideo stream={realCam.videoStream} />
              ) : showingFace ? (
                <SelfVideo stream={avatarCam.faceStream} />
              ) : (
                <CanvasSlot canvas={avatarCam.canvas} />
              )}
            </div>
            {!isPro && showingFace && <FaceBadge className={s.previewFace} onBack={backToAvatar} />}
            {!camReady && (
              <div className={s.previewEmpty}>
                {isPro ? (
                  <span className={s.bigIcon}>
                    <Morph icon={MI.Camera} size={28} />
                  </span>
                ) : (
                  <AvatarThumb config={myAvatar} size={168} framing="portrait" background="transparent" />
                )}
                {camState === "starting" ? (
                  <Spinner label="Включаем камеру" />
                ) : (
                  <p className={s.previewText}>
                    {isPro
                      ? "Клиент увидит ваше настоящее видео. Проверьте свет и кадр перед входом."
                      : "Камера нужна, чтобы аватар повторял вашу мимику. Собеседник видит только аватар, картинка с камеры остаётся на этом устройстве."}
                  </p>
                )}
                {camError && <p className={s.errorText}>{camError}</p>}
                {camState !== "starting" && (
                  <Button variant="primary" onClick={cam.start} icon={<Morph icon={MI.Camera} size={18} />}>
                    Включить камеру
                  </Button>
                )}
              </div>
            )}
            {tag && (
              <div className={s.previewTag}>
                <span className={`${s.dot} ${!isPro && avatarCam.faceLost ? s.dotWarn : ""}`} />
                {tag}
              </div>
            )}
            {camReady && (
              <div className={s.previewMic} title="Уровень микрофона">
                <Morph icon={MI.Mic} size={16} />
                <MicMeter stream={micStream} />
              </div>
            )}
          </div>

          <div className={s.side}>
            <div className={s.peerCard}>
              {peerPic(56)}
              <div className={s.peerText}>
                <div className={s.peerName}>{peerName}</div>
                <div className={s.meta}>{statusLine}</div>
              </div>
            </div>
            {!isLab && (
              <div className={`${s.presence} ${peerHere ? s.presenceOn : ""}`} aria-live="polite">
                <span className={s.presenceDot} />
                {peerHere ? `${peerWord} уже в звонке и ждёт вас` : `${peerWord} ещё не подключился`}
              </div>
            )}

            {!isPro && (
              <section className={s.block}>
                <div className={s.label}>Как вас увидит специалист</div>
                <FaceChoice real={realFace} onAsk={() => setFaceAsk(true)} onAvatar={backToAvatar} />
                <p className={s.note}>
                  {realFace
                    ? "Специалист увидит ваше лицо с камеры. Вернуться к аватару можно в любой момент."
                    : "По умолчанию только аватар. Лицо можно показать, если захотите."}
                </p>
              </section>
            )}
            {!isPro && (
              <section className={s.block}>
                <div className={s.label}>Фон за аватаром</div>
                <BackdropPicker value={backdrop} onChange={setBackdrop} size="sm" />
              </section>
            )}
            {!isPro && (
              <section className={s.block}>
                <div className={s.label}>Голос</div>
                <VoicePicker value={voice} onChange={setVoice} compact />
                <p className={s.note}>{VOICE_PRESETS.find((p) => p.value === voice)?.hint}. Можно поменять во время звонка.</p>
              </section>
            )}
            {!isPro && avatarCam.tracking && (
              <Button variant="ghost" size="sm" onClick={avatarCam.recalibrate} disabled={avatarCam.calibrating} icon={<RefreshCw size={16} />}>
                {avatarCam.calibrating ? "Калибруем мимику…" : "Откалибровать мимику"}
              </Button>
            )}

            <Button variant="primary" size="lg" block disabled={!canJoin || !camReady} loading={joining} onClick={enter}>
              {peerHere ? "Присоединиться" : "Войти в звонок"}
            </Button>
            {!canJoin && <p className={s.note}>Вход откроется за 10 минут до начала.</p>}
            {canJoin && !camReady && camState !== "starting" && <p className={s.note}>Сначала включите камеру: без неё {isPro ? "клиент вас не увидит" : "аватар не оживёт"}.</p>}
            {joinError && <p className={s.errorText}>{joinError}</p>}
            {isLab && (
              <p className={s.note} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <FlaskConical size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                Тестовая комната из лаборатории: без записи, оплаты и статистики. Вы входите как{" "}
                {isPro ? "специалист (настоящая камера)" : "клиент (аватар и фильтр голоса)"}.
              </p>
            )}
          </div>
        </div>
        <RealFaceConfirm open={faceAsk} onClose={() => setFaceAsk(false)} onConfirm={confirmRealFace} />
      </div>
    );
  }

  // ── In call ────────────────────────────────────────────────────────────
  const connected = call.status === "connected" && call.hasRemote;
  const videoOff = call.isCameraOff;
  const panelTitle: Record<Exclude<Panel, null>, string> = {
    chat: "Чат диалога",
    voice: "Фильтр голоса",
    more: "Настройки звонка",
    notes: "Заметки",
    breath: "Дыхательная пауза",
  };
  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const showChrome = !idle || !connected || panel !== null;

  return (
    <div className={`${s.room} ${s.dark}`} ref={rootRef}>
      {/* «Незаметный режим»: быстрый выход на телефоне (двойной Esc работает везде) */}
      <PanicButton />
      <div className={`${s.call} ${panel ? s.callWithPanel : ""}`}>
        <div className={s.stage}>
          {ambient && !isPro && <div className={s.ambient} style={{ background: getBackdrop(backdrop).ambient }} aria-hidden />}
          <RemoteVideo
            blur={isPro && ambient}
            attach={(el) => {
              remoteEl.current = el;
              call.remoteVideoRef(el);
              if (el && sink) (el as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(sink).catch(() => undefined);
            }}
            portrait={isPro}
          />

          {!call.hasRemote && call.status !== "failed" && call.status !== "reconnecting" && (
            <div className={s.waiting}>
              {isPro ? <div className={s.waitingPic}>{peerPic(132)}</div> : <TeaWait className={art.waitArt} />}
              <h3 className={s.h3}>{call.status === "connecting" ? "Подключаемся" : `Ждём, когда ${isPro ? "клиент" : "специалист"} войдёт`}</h3>
              <p className={s.note}>
                {isPro ? "Как только клиент подключится, вы увидите его аватар." : "Специалист скоро подключится. Можно пока сделать пару спокойных вдохов."}
              </p>
            </div>
          )}

          {call.status === "reconnecting" && (
            <div className={s.reconnect} role="status" aria-live="polite">
              <span className={s.spinDot} />
              Переподключаемся…
            </div>
          )}
          {call.status === "failed" && (
            <div className={s.failed}>
              <div className={s.card}>
                <span className={s.bigIcon}>
                  <WifiOff size={28} />
                </span>
                <h3 className={s.h3}>Связь прервалась</h3>
                <p className={s.note}>Проверьте интернет. Мы попробуем соединиться заново, как только вы нажмёте кнопку.</p>
                <div className={s.row}>
                  <Button variant="primary" onClick={call.retryNow} icon={<RefreshCw size={18} />}>
                    Переподключиться
                  </Button>
                  <Button variant="ghost" onClick={leave}>
                    Завершить
                  </Button>
                </div>
              </div>
            </div>
          )}

          <header className={`${s.topbar} ${showChrome ? "" : s.hidden}`}>
            <div className={s.topPeer}>
              {peerPic(40)}
              <span className={s.topText}>
                <span className={s.topName}>{peerName}</span>
                <span className={s.topSub}>
                  {connected ? (
                    <>
                      <span className="num">{mmss(call.elapsed)}</span>
                      {remaining && <span className={remaining.left <= 5 ? s.warnText : ""}>{remaining.text}</span>}
                    </>
                  ) : call.status === "reconnecting" ? (
                    "Переподключаемся"
                  ) : (
                    "Подключаемся"
                  )}
                </span>
              </span>
            </div>
            <div className={s.topRight}>
              {isLab && (
                <span className={s.pill}>
                  <FlaskConical size={14} /> Тест
                </span>
              )}
              {isPro && connected && call.remoteFace === "real" && (
                <span className={s.pill} title="Клиент сам решил показать лицо вместо аватара">
                  <Eye size={14} />
                  <span className={s.pillText}>Камера клиента</span>
                </span>
              )}
              {connected && (
                <span className={s.pill} title={QUALITY_LABEL[call.quality]}>
                  <QualityBars quality={call.quality} />
                  <span className={s.pillText}>{call.quality === "poor" ? "Слабая связь" : call.quality === "fair" ? "Средняя связь" : "Связь"}</span>
                </span>
              )}
              <span className={s.pill} title="Звук и видео идут напрямую и зашифрованы, ничего не записывается">
                <Lock size={14} />
                <span className={s.pillText}>Зашифровано</span>
              </span>
            </div>
          </header>

          {!isPro && showingFace && <FaceBadge className={s.callFace} onBack={backToAvatar} />}
          {!isPro && avatarCam.faceLost && !videoOff && !showingFace && <div className={s.toast}>Лицо не видно, аватар замер. Сядьте ближе к свету</div>}
          {remaining && remaining.left === 5 && connected && <div className={`${s.toast} ${showingFace ? s.toastLow : ""}`}>До конца звонка 5 минут</div>}
          {isPro && faceNote && (
            <div className={s.toast} role="status">
              {faceNote}
            </div>
          )}

          <DraggablePip label={isPro || showingFace ? "Ваша камера" : "Ваш аватар"} wide={false}>
            {isPro ? (
              <SelfVideo stream={realCam.videoStream} />
            ) : showingFace ? (
              <SelfVideo stream={avatarCam.faceStream} />
            ) : (
              <CanvasSlot canvas={avatarCam.canvas} />
            )}
            {!isPro && showingFace && <span className={s.pipFace} aria-hidden />}
            {videoOff && <div className={s.pipOff}>{isPro || showingFace ? "Камера выключена" : "Аватар скрыт"}</div>}
            {call.isMuted && (
              <span className={s.pipMuted} aria-label="Микрофон выключен">
                <Morph icon={MI.MicOff} size={14} />
              </span>
            )}
          </DraggablePip>

          {debug && <DebugOverlay stats={call.stats} status={call.status} avatar={!isPro} />}

          <nav className={`${s.controls} ${showChrome ? "" : s.hidden}`} aria-label="Управление звонком">
            <CtrlButton label={call.isMuted ? "Включить микрофон" : "Выключить микрофон"} caption="Микрофон" off={call.isMuted} onClick={call.toggleMute}>
              <Morph icon={call.isMuted ? MI.MicOff : MI.Mic} size={22} />
            </CtrlButton>
            <CtrlButton
              label={
                isPro || showingFace ? (videoOff ? "Включить камеру" : "Выключить камеру") : videoOff ? "Показать аватар" : "Скрыть аватар"
              }
              caption={isPro || showingFace ? "Камера" : "Аватар"}
              off={videoOff}
              onClick={call.toggleCamera}
            >
              <Morph icon={videoOff ? MI.VideoOff : MI.Video} size={22} />
            </CtrlButton>
            {!isPro && (
              <CtrlButton label="Фильтр голоса" caption="Голос" active={panel === "voice"} dot={voice !== "off"} onClick={() => toggle("voice")}>
                <Waves size={22} />
              </CtrlButton>
            )}
            <CtrlButton label={panel === "chat" ? "Закрыть чат" : "Открыть чат"} caption="Чат" active={panel === "chat"} onClick={() => toggle("chat")}>
              <Morph icon={panel === "chat" ? MI.X : CHAT_ICON} size={22} />
            </CtrlButton>
            <CtrlButton label="Ещё" caption="Ещё" active={panel === "more" || panel === "notes" || panel === "breath"} onClick={() => toggle("more")}>
              <MoreHorizontal size={22} />
            </CtrlButton>
            <CtrlButton label="Завершить звонок" caption="Завершить" end onClick={() => setConfirmEnd(true)}>
              <PhoneOff size={22} />
            </CtrlButton>
          </nav>
        </div>

        {panel && <div className={s.scrim} onClick={() => setPanel(null)} aria-hidden />}
        {panel && (
          <aside className={s.panel} aria-label={panelTitle[panel]}>
            <div className={s.panelHead}>
              <span className={s.panelTitle}>
                {panel === "chat" && <MessageCircle size={18} />}
                {panelTitle[panel]}
              </span>
              <button type="button" className={s.iconBtn} aria-label="Закрыть" onClick={() => setPanel(null)}>
                <X size={18} />
              </button>
            </div>
            <div className={`${s.panelBody} ${panel === "chat" ? s.panelChat : ""}`}>
              {panel === "chat" &&
                (conversationId ? (
                  <DialogThread conversationId={conversationId} compact />
                ) : (
                  <div className={s.panelEmpty}>
                    <Users size={28} />
                    <p className={s.note}>{isLab ? "В тестовой комнате нет чата диалога." : "Чат диалога появится здесь, как только загрузится."}</p>
                  </div>
                ))}
              {panel === "voice" && (
                <>
                  <VoicePicker value={voice} onChange={setVoice} />
                  <p className={s.note}>Специалист услышит новый голос сразу после переключения. Фильтр работает на вашем устройстве.</p>
                </>
              )}
              {panel === "more" && (
                <CallMore
                  devices={devices}
                  choice={choice}
                  onDevice={onDevice}
                  isPro={isPro}
                  fullscreen={fullscreen}
                  onFullscreen={toggleFullscreen}
                  onRecalibrate={isPro ? undefined : avatarCam.recalibrate}
                  recalibrating={!isPro && avatarCam.calibrating}
                  onBreath={() => setPanel("breath")}
                  ambient={ambient}
                  onAmbient={toggleAmbient}
                  realFace={isPro ? undefined : realFace}
                  onRealFace={isPro ? undefined : () => (realFace ? backToAvatar() : setFaceAsk(true))}
                  onNotes={isPro ? () => setPanel("notes") : undefined}
                  onReport={() => setReportOpen(true)}
                />
              )}
              {panel === "notes" && <SessionNotepad roomId={sessionId} />}
              {panel === "breath" && <BreathingSync />}
            </div>
          </aside>
        )}
      </div>

      <Modal open={confirmEnd} onClose={() => setConfirmEnd(false)} title="Завершить звонок?" width={420}>
        <p className={s.note}>
          {remaining && remaining.left > 0
            ? `До конца забронированного времени ${remaining.text.replace("ещё ", "")}. Вернуться можно, пока оно не закончилось.`
            : "Звонок закончится для вас. Собеседник увидит, что вы вышли."}
        </p>
        <div className={s.modalActions}>
          <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
            Остаться
          </Button>
          <Button variant="danger" onClick={leave} icon={<PhoneOff size={18} />}>
            Завершить
          </Button>
        </div>
      </Modal>
      <RealFaceConfirm
        open={faceAsk}
        onClose={() => setFaceAsk(false)}
        onConfirm={(remember) => {
          confirmRealFace(remember);
          setPanel(null);
        }}
      />
      <ReportProblem open={reportOpen} onClose={() => setReportOpen(false)} sessionId={sessionId} isClient={!isPro} tech={tech} disabled={isLab} />
    </div>
  );
}

/** lucide "message-circle" as morphicons data (so the chat button morphs into ×). */
const CHAT_ICON = "M7.9 20A9 9 0 1 0 4 16.1L2 22Z";

function CtrlButton({
  children,
  label,
  caption,
  off,
  active,
  end,
  dot,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  caption: string;
  off?: boolean;
  active?: boolean;
  end?: boolean;
  dot?: boolean;
  onClick: () => void;
}) {
  return (
    <span className={s.ctrlWrap}>
      <button
        type="button"
        className={`${s.ctrl} ${off ? s.ctrlOff : ""} ${active ? s.ctrlActive : ""} ${end ? s.ctrlEnd : ""}`}
        onClick={onClick}
        aria-label={label}
        aria-pressed={end ? undefined : !!(off || active)}
        title={label}
      >
        {children}
        {dot && <span className={s.ctrlDot} />}
      </button>
      <span className={s.ctrlCaption} aria-hidden>
        {caption}
      </span>
    </span>
  );
}

/** Remote video with a blurred copy behind when its shape doesn't match the screen. */
function RemoteVideo({ attach, portrait, blur = true }: { attach: (el: HTMLVideoElement | null) => void; portrait: boolean; blur?: boolean }) {
  const back = useRef<HTMLVideoElement>(null);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const main = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = main.current;
    if (!v) return;
    const check = () => {
      const host = v.parentElement;
      if (!host || !v.videoWidth) return;
      const va = v.videoWidth / v.videoHeight;
      const ha = host.clientWidth / host.clientHeight;
      // crop at most ~25 % of the picture; otherwise letterbox over a blurred copy
      setFit(Math.max(va / ha, ha / va) > 1.33 ? "contain" : "cover");
      if (back.current && back.current.srcObject !== v.srcObject) {
        back.current.srcObject = v.srcObject;
        back.current.play().catch(() => undefined);
      }
    };
    v.addEventListener("resize", check);
    v.addEventListener("loadedmetadata", check);
    window.addEventListener("resize", check);
    const t = setInterval(check, 2000);
    return () => {
      v.removeEventListener("resize", check);
      v.removeEventListener("loadedmetadata", check);
      window.removeEventListener("resize", check);
      clearInterval(t);
    };
  }, []);
  return (
    <>
      {fit === "contain" && blur && <video ref={back} className={s.remoteBlur} muted playsInline autoPlay aria-hidden />}
      <video
        ref={(el) => {
          main.current = el;
          attach(el);
        }}
        className={s.remote}
        style={{ objectFit: fit }}
        data-portrait={portrait ? "1" : "0"}
        autoPlay
        playsInline
        aria-label="Собеседник"
      />
    </>
  );
}

const RATING_WORDS = ["", "Очень плохо", "Плохо", "Нормально", "Хорошо", "Отлично"];

function EndScreen({
  peerPic,
  peerName,
  spent,
  sessionId,
  isPro,
  isLab,
  dialogueHref,
  canRejoin,
  onRejoin,
  tech,
  reviewFor,
}: {
  peerPic: React.ReactNode;
  peerName: string;
  spent: number;
  sessionId: string;
  isPro: boolean;
  isLab: boolean;
  dialogueHref: string;
  canRejoin: boolean;
  onRejoin: () => void;
  tech: () => CallTech;
  /** G2: client's end-of-call prompt to review the specialist */
  reviewFor?: { id: number; name: string } | null;
}) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [issues, setIssues] = useState<CallIssue[]>([]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const techRef = useRef<CallTech>({});
  useEffect(() => {
    techRef.current = tech(); // snapshot the numbers of the call that just ended
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    if (isLab) {
      setSent(true);
      return;
    }
    setBusy(true);
    try {
      await callsApi.feedback(sessionId, { kind: "rating", rating, issues, tech: techRef.current });
      setSent(true);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось отправить оценку.", { error: true });
    } finally {
      setBusy(false);
    }
  };
  const complete = async () => {
    setCompleting(true);
    try {
      await sessionsApi.complete(sessionId);
    } catch {
      /* already completed or not allowed */
    } finally {
      setCompleted(true);
      setCompleting(false);
    }
  };
  const shown = hover || rating;
  return (
    <div className={s.center}>
      <div className={`${s.card} ${s.endCard}`}>
        <div className={s.endPic}>
          {peerPic}
          <span className={s.endBadge}>
            <PhoneOff size={14} />
          </span>
        </div>
        <h2 className={s.h2}>Звонок завершён</h2>
        <p className={s.meta}>
          {peerName}
          {spent > 0 ? `, ${minutesText(spent)}` : ""}
        </p>

        {!sent ? (
          <section className={s.rate}>
            <div className={s.label}>Как прошла связь?</div>
            <div className={s.stars} role="radiogroup" aria-label="Оценка связи" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={RATING_WORDS[n]}
                  className={s.star}
                  data-on={n <= shown ? "1" : "0"}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setRating(n)}
                >
                  <Star size={30} />
                </button>
              ))}
            </div>
            <div className={s.rateWord}>{shown ? RATING_WORDS[shown] : "Оценка поможет нам улучшить звонки"}</div>
            {rating > 0 && rating <= 3 && <IssueChips value={issues} onChange={setIssues} isClient={!isPro} />}
            {rating > 0 && (
              <Button variant="soft" size="sm" loading={busy} onClick={send}>
                Отправить оценку
              </Button>
            )}
          </section>
        ) : (
          <p className={s.thanks}>
            <Check size={18} /> Спасибо за оценку
          </p>
        )}

        {reviewFor && <ReviewPrompt psychologistId={reviewFor.id} name={reviewFor.name} />}

        <div className={s.endActions}>
          <Button variant="primary" block href={dialogueHref}>
            {isLab ? "В лабораторию" : "Вернуться в диалог"}
          </Button>
          {canRejoin && (
            <Button variant="ghost" block onClick={onRejoin} icon={<RefreshCw size={18} />}>
              Вернуться в звонок
            </Button>
          )}
          {isPro && !isLab && !completed && (
            <Button variant="ghost" block loading={completing} onClick={complete} icon={<Check size={18} />}>
              Отметить звонок проведённым
            </Button>
          )}
          {completed && <p className={s.thanks}>Звонок отмечен проведённым</p>}
        </div>
        <p className={s.note}>Видео и звук не записывались. Заметки хранятся только в этом браузере и удалятся сами через 24 часа.</p>
      </div>
    </div>
  );
}
