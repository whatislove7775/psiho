"use client";

/**
 * Solo loopback: one device, two RTCPeerConnections. The page shows exactly
 * what the other side of a call would receive — the same production hooks
 * (useAvatarCamera + useVoiceTransform for a client, useRealCamera for a
 * specialist), the same encoder caps as useP2PCall, and live WebRTC stats.
 * "Только через TURN" forces relay candidates, so media really goes through coturn.
 * Production-safe successor of the dev-only /dev/rtc-test page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Repeat, Square } from "lucide-react";
import { Badge, Button, Card, CardHead, Segmented } from "@/ui";
import { useAuth } from "@/lib/auth/store";
import { normalizeAvatar, randomAvatar } from "@/lib/avatar/schema";
import { useAvatarCamera } from "@/hooks/useAvatarCamera";
import { useRealCamera } from "@/hooks/useRealCamera";
import { getIceServers } from "@/hooks/useP2PCall";
import { useVoiceTransform, type VoicePreset } from "@/hooks/useVoiceTransform";
import { BACKDROPS, type BackdropId } from "@/lib/avatar/backdrops";
import { BackdropPicker } from "@/components/avatar/BackdropPicker";
import { CanvasSlot, kbps, loadLabAvatar, StatGrid, StreamVideo, Switch } from "./shared";
import s from "./lab.module.css";

type Side = "client" | "psychologist";

interface Stats {
  sendBitrate: number | null;
  sendFps: number | null;
  sendRes: string;
  limit: string;
  recvBitrate: number | null;
  recvFps: number | null;
  recvRes: string;
  audioBitrate: number | null;
  rtt: number | null;
  jitter: number | null;
  lost: number;
  dropped: number;
  codec: string;
  path: string;
  ice: string;
}

const EMPTY: Stats = {
  sendBitrate: null, sendFps: null, sendRes: "—", limit: "—", recvBitrate: null, recvFps: null, recvRes: "—",
  audioBitrate: null, rtt: null, jitter: null, lost: 0, dropped: 0, codec: "—", path: "—", ice: "new",
};

const LIMIT_LABEL: Record<string, string> = { none: "нет", cpu: "процессор", bandwidth: "канал", other: "другое" };
const CAND_LABEL: Record<string, string> = { host: "локальная сеть", srflx: "через STUN", prflx: "через STUN", relay: "через TURN" };

const VOICES: { value: VoicePreset; label: string }[] = [
  { value: "off", label: "Свой голос" },
  { value: "lower", label: "Ниже" },
  { value: "higher", label: "Выше" },
];

export function LoopbackPanel() {
  const { user } = useAuth();
  const [side, setSide] = useState<Side>("client");
  const [running, setRunning] = useState(false);
  const [relayOnly, setRelayOnly] = useState(false);
  const [listen, setListen] = useState(false);
  const [voice, setVoice] = useState<VoicePreset>("lower");
  const [backdrop, setBackdrop] = useState<BackdropId>(BACKDROPS[0].id);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const avatar = useMemo(() => {
    const lab = loadLabAvatar();
    return lab ? normalizeAvatar(lab) : user?.avatar_config ? normalizeAvatar(user.avatar_config) : randomAvatar(user?.id ?? "lab");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, running]);

  const avatarCam = useAvatarCamera(avatar, { backdrop });
  const realCam = useRealCamera();
  const isPro = side === "psychologist";
  const { transformedStream } = useVoiceTransform({ inputStream: running && !isPro ? avatarCam.audioStream : null, preset: voice });

  const videoTrack = isPro ? realCam.videoStream?.getVideoTracks()[0] : avatarCam.videoStream?.getVideoTracks()[0];
  const audioTrack = isPro
    ? realCam.audioStream?.getAudioTracks()[0]
    : (transformedStream?.getAudioTracks()[0] ?? avatarCam.audioStream?.getAudioTracks()[0]);

  const audioSenderRef = useRef<RTCRtpSender | null>(null);

  const start = () => {
    setError(null);
    setStats(EMPTY);
    setRunning(true);
    if (isPro) realCam.start();
    else avatarCam.start();
  };
  const stop = () => {
    setRunning(false);
    avatarCam.stop();
    realCam.stop();
    setRemote(null);
    setListen(false);
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build the loopback once the video track exists (rebuilds when the path policy changes).
  useEffect(() => {
    if (!running || !videoTrack) return;
    let alive = true;
    const cfg: RTCConfiguration = { iceServers: getIceServers(), iceTransportPolicy: relayOnly ? "relay" : "all" };
    const a = new RTCPeerConnection(cfg);
    const b = new RTCPeerConnection(cfg);
    const out = new MediaStream([videoTrack]);
    a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate).catch(() => {});
    b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate).catch(() => {});
    const inbound = new MediaStream();
    b.ontrack = (e) => {
      inbound.addTrack(e.track);
      setRemote(new MediaStream(inbound.getTracks()));
    };
    const vSender = a.addTrack(videoTrack, out);
    audioSenderRef.current = a.addTransceiver("audio", { direction: "sendonly", streams: [out] }).sender;
    if (audioTrack) audioSenderRef.current.replaceTrack(audioTrack).catch(() => {});

    (async () => {
      try {
        const params = vSender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0].maxBitrate = isPro ? 1_500_000 : 900_000;
        params.encodings[0].maxFramerate = 30;
        (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = "maintain-framerate";
        await vSender.setParameters(params).catch(() => {});
        const offer = await a.createOffer();
        await a.setLocalDescription(offer);
        await b.setRemoteDescription(offer);
        const answer = await b.createAnswer();
        await b.setLocalDescription(answer);
        await a.setRemoteDescription(answer);
      } catch (e) {
        if (alive) setError(`Не получилось согласовать соединение: ${(e as Error).message}`);
      }
    })();

    let prev: { t: number; sent: number; recv: number; audio: number } | null = null;
    const iv = setInterval(async () => {
      if (!alive) return;
      const next: Stats = { ...EMPTY, ice: b.iceConnectionState };
      let sent = 0;
      let recv = 0;
      let audio = 0;
      const ra = await a.getStats();
      const rb = await b.getStats();
      let pairId = "";
      ra.forEach((r) => {
        if (r.type === "outbound-rtp" && r.kind === "video") {
          sent = r.bytesSent ?? 0;
          next.sendFps = r.framesPerSecond ?? null;
          if (r.frameWidth) next.sendRes = `${r.frameWidth}×${r.frameHeight}`;
          next.limit = LIMIT_LABEL[r.qualityLimitationReason as string] ?? r.qualityLimitationReason ?? "—";
          const codec = r.codecId ? ra.get(r.codecId) : null;
          if (codec?.mimeType) next.codec = String(codec.mimeType).replace("video/", "");
        }
        if (r.type === "outbound-rtp" && r.kind === "audio") audio = r.bytesSent ?? 0;
        if (r.type === "transport" && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId;
      });
      ra.forEach((r) => {
        if (r.type === "candidate-pair" && (r.id === pairId || (!pairId && r.nominated && r.state === "succeeded"))) {
          next.rtt = r.currentRoundTripTime != null ? r.currentRoundTripTime * 1000 : null;
          const loc = ra.get(r.localCandidateId);
          const rem = ra.get(r.remoteCandidateId);
          if (loc) next.path = `${CAND_LABEL[loc.candidateType] ?? loc.candidateType}${loc.protocol ? `, ${loc.protocol.toUpperCase()}` : ""}${rem && rem.candidateType !== loc.candidateType ? ` ↔ ${CAND_LABEL[rem.candidateType] ?? rem.candidateType}` : ""}`;
        }
      });
      rb.forEach((r) => {
        if (r.type === "inbound-rtp" && r.kind === "video") {
          recv = r.bytesReceived ?? 0;
          next.recvFps = r.framesPerSecond ?? null;
          if (r.frameWidth) next.recvRes = `${r.frameWidth}×${r.frameHeight}`;
          next.jitter = r.jitter != null ? r.jitter * 1000 : null;
          next.lost = r.packetsLost ?? 0;
          next.dropped = r.framesDropped ?? 0;
        }
      });
      const t = performance.now();
      if (prev) {
        const dt = (t - prev.t) / 1000;
        next.sendBitrate = ((sent - prev.sent) * 8) / dt;
        next.recvBitrate = ((recv - prev.recv) * 8) / dt;
        next.audioBitrate = ((audio - prev.audio) * 8) / dt;
      }
      prev = { t, sent, recv, audio };
      if (alive) setStats(next);
    }, 1000);

    return () => {
      alive = false;
      clearInterval(iv);
      a.close();
      b.close();
      audioSenderRef.current = null;
      setRemote(null);
    };
    // audioTrack is swapped in without renegotiation below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, videoTrack, relayOnly, isPro]);

  // Voice filter switch → replaceTrack, exactly like the real call.
  useEffect(() => {
    audioSenderRef.current?.replaceTrack(audioTrack ?? null).catch(() => {});
  }, [audioTrack]);

  const camState = isPro ? realCam.state : avatarCam.state;
  const camError = isPro ? realCam.error : avatarCam.error;
  const ok = stats.ice === "connected" || stats.ice === "completed";

  return (
    <Card as="section">
      <CardHead
        icon={<Repeat size={20} />}
        title="Проверка на одном устройстве"
        sub="Звонок самому себе: слева то, что уходит в сеть, справа то, что получит собеседник, со статистикой соединения."
        action={
          running ? (
            <Button variant="secondary" icon={<Square size={16} />} onClick={stop}>
              Остановить
            </Button>
          ) : (
            <Button variant="primary" icon={<Play size={16} />} onClick={start}>
              Запустить
            </Button>
          )
        }
      />
      <div className={s.controlsRow}>
        <div>
          <div className={s.label}>Сторона</div>
          <Segmented
            value={side}
            onChange={(v) => {
              if (running) stop();
              setSide(v);
            }}
            options={[
              { value: "client", label: "Клиент (аватар)" },
              { value: "psychologist", label: "Специалист (камера)" },
            ]}
            ariaLabel="Чью сторону проверить"
          />
        </div>
        {!isPro && (
          <div>
            <div className={s.label}>Фильтр голоса</div>
            <Segmented value={voice} onChange={setVoice} options={VOICES} ariaLabel="Фильтр голоса" />
          </div>
        )}
      </div>
      <div className={s.controlsRow}>
        <Switch checked={relayOnly} onChange={setRelayOnly} label="Только через TURN" hint="Медиа пойдёт через наш coturn. Если видео не появилось, TURN не работает." />
        <Switch checked={listen} onChange={setListen} label="Слушать, что слышит собеседник" hint="Лучше в наушниках, иначе будет эхо." />
      </div>
      {!isPro && (
        <div className={s.controlsRow}>
          <div>
            <div className={s.label}>Фон за аватаром</div>
            <BackdropPicker value={backdrop} onChange={setBackdrop} size="sm" />
          </div>
        </div>
      )}

      <div className={s.loopGrid}>
        <figure className={s.loopTile}>
          <div className={s.tileStage} data-wide={isPro || undefined}>
            {running && !isPro && <CanvasSlot canvas={avatarCam.canvas} />}
            {running && isPro && <StreamVideo stream={realCam.videoStream} mirror label="Ваша камера" />}
            {(!running || camState !== "ready") && (
              <div className={s.tilePlaceholder}>{camState === "starting" ? "Включаем камеру" : camError ?? "Нажмите «Запустить»"}</div>
            )}
          </div>
          <figcaption>Уходит в сеть</figcaption>
        </figure>
        <figure className={s.loopTile}>
          <div className={s.tileStage} data-wide={isPro || undefined}>
            <StreamVideo stream={remote} muted={!listen} label="Что получает собеседник" />
            {!remote && (
              <div className={s.tilePlaceholder}>{!running ? "Здесь появится видео собеседника" : relayOnly ? "Соединяемся через TURN" : "Соединяемся"}</div>
            )}
          </div>
          <figcaption>
            Получает собеседник {running && <Badge tone={ok ? "success" : stats.ice === "failed" ? "danger" : "warning"}>{ok ? "соединено" : stats.ice}</Badge>}
          </figcaption>
        </figure>
      </div>
      {error && <p className={s.errorText}>{error}</p>}
      {running && stats.ice === "failed" && relayOnly && (
        <p className={s.errorText}>Соединение через TURN не установилось. Проверьте вкладку «Сеть»: там видно, выдаёт ли coturn relay-кандидаты.</p>
      )}
      <StatGrid
        items={[
          ["Отправка видео", kbps(stats.sendBitrate)],
          ["Приём видео", kbps(stats.recvBitrate)],
          ["Кадров в секунду", `${stats.sendFps ?? "—"} → ${stats.recvFps ?? "—"}`],
          ["Разрешение", `${stats.sendRes} → ${stats.recvRes}`],
          ["Задержка (RTT)", stats.rtt != null ? `${Math.round(stats.rtt)} мс` : "—"],
          ["Джиттер", stats.jitter != null ? `${Math.round(stats.jitter)} мс` : "—"],
          ["Потери, пропуски кадров", `${stats.lost} / ${stats.dropped}`],
          ["Звук", kbps(stats.audioBitrate)],
          ["Кодек", stats.codec],
          ["Ограничение качества", stats.limit],
          ["Путь", stats.path],
          ["Лимит кодера", isPro ? "1,5 Мбит/с" : "900 кбит/с"],
        ]}
      />
    </Card>
  );
}
