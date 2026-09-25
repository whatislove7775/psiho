"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Mic, MonitorSpeaker, Play, RefreshCw, Square, Volume2 } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/ui";
import { Meter, StatGrid, StreamVideo, Switch } from "./shared";
import s from "./lab.module.css";

type Info = Record<string, string>;

function trackInfo(t: MediaStreamTrack | undefined): Info {
  if (!t) return {};
  const st = t.getSettings() as MediaTrackSettings & Record<string, unknown>;
  const out: Info = {};
  if (t.kind === "video") {
    if (st.width) out["Разрешение"] = `${st.width}×${st.height}`;
    if (st.frameRate) out["Кадров в секунду"] = String(Math.round(Number(st.frameRate)));
    if (st.facingMode) out["Направление"] = st.facingMode === "user" ? "фронтальная" : String(st.facingMode);
    const caps = (t as MediaStreamTrack & { getCapabilities?: () => MediaTrackCapabilities }).getCapabilities?.();
    if (caps?.width?.max) out["Максимум камеры"] = `${caps.width.max}×${caps.height?.max ?? "?"}`;
  } else {
    if (st.sampleRate) out["Частота"] = `${st.sampleRate} Гц`;
    if (st.channelCount) out["Каналы"] = String(st.channelCount);
    out["Эхоподавление"] = st.echoCancellation ? "вкл" : "выкл";
    out["Шумоподавление"] = st.noiseSuppression ? "вкл" : "выкл";
    out["Автоусиление"] = st.autoGainControl ? "вкл" : "выкл";
  }
  return out;
}

export function DevicesPanel() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState("");
  const [micId, setMicId] = useState("");
  const [outId, setOutId] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [hd, setHd] = useState(false);
  const [info, setInfo] = useState<{ v: Info; a: Info }>({ v: {}, a: {} });
  const ctxRef = useRef<AudioContext | null>(null);

  const list = useCallback(async () => {
    try {
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    list();
    navigator.mediaDevices?.addEventListener?.("devicechange", list);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", list);
  }, [list]);

  const stop = useCallback(() => {
    setStream((cur) => {
      cur?.getTracks().forEach((t) => t.stop());
      return null;
    });
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setLevel(0);
  }, []);
  useEffect(() => stop, [stop]);

  const start = async () => {
    stop();
    setError(null);
    setPeak(0);
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(camId ? { deviceId: { exact: camId } } : { facingMode: "user" }),
          width: { ideal: hd ? 1280 : 640 },
          height: { ideal: hd ? 720 : 480 },
          frameRate: { ideal: 30 },
        },
        audio: { ...(micId ? { deviceId: { exact: micId } } : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setStream(ms);
      setInfo({ v: trackInfo(ms.getVideoTracks()[0]), a: trackInfo(ms.getAudioTracks()[0]) });
      list();
      if (ms.getAudioTracks().length) {
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(ms).connect(an);
        const buf = new Float32Array(an.fftSize);
        const tick = () => {
          if (ctxRef.current !== ctx) return;
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          const l = Math.min(1, Math.sqrt(sum / buf.length) * 5);
          setLevel(l);
          setPeak((p) => Math.max(p, l));
          requestAnimationFrame(tick);
        };
        tick();
      }
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "Браузер запретил доступ к камере и микрофону. Разрешите их в настройках сайта."
          : name === "NotReadableError"
            ? "Устройство занято другой программой или вкладкой."
            : name === "OverconstrainedError"
              ? "Выбранное устройство не поддерживает такие параметры. Выберите другое."
              : `Не получилось включить устройства (${name || "ошибка"}).`,
      );
    }
  };

  const beep = async () => {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 523;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc.connect(gain).connect(dest);
    const a = new Audio() as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    a.srcObject = dest.stream;
    if (outId && a.setSinkId) await a.setSinkId(outId).catch(() => {});
    await a.play().catch(() => {});
    osc.start();
    osc.stop(ctx.currentTime + 1);
    setTimeout(() => ctx.close().catch(() => {}), 1300);
  };

  const cams = devices.filter((d) => d.kind === "videoinput");
  const mics = devices.filter((d) => d.kind === "audioinput");
  const outs = devices.filter((d) => d.kind === "audiooutput");
  const named = devices.some((d) => d.label);
  const canPickOutput = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  const select = (label: string, value: string, onChange: (v: string) => void, items: MediaDeviceInfo[], def: string) => (
    <label className={s.selectLabel}>
      <span className={s.label}>{label}</span>
      <select className={s.select} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{def}</option>
        {items.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className={s.devicesGrid}>
      <Card as="section">
        <CardHead
          icon={<Camera size={20} />}
          title="Камера и микрофон"
          sub={named ? `Найдено: камер ${cams.length}, микрофонов ${mics.length}, динамиков ${outs.length}.` : "Названия устройств появятся после разрешения доступа."}
          action={
            stream ? (
              <Button variant="secondary" icon={<Square size={16} />} onClick={stop}>
                Выключить
              </Button>
            ) : (
              <Button variant="primary" icon={<Play size={16} />} onClick={start}>
                Проверить
              </Button>
            )
          }
        />
        <div className={s.stackSm}>
          {select("Камера", camId, setCamId, cams, "По умолчанию")}
          {select("Микрофон", micId, setMicId, mics, "По умолчанию")}
          <Switch checked={hd} onChange={setHd} label="Запросить 1280×720" hint="По умолчанию звонок просит 640×480: для аватара этого достаточно." />
          {stream && (
            <Button variant="ghost" size="sm" icon={<RefreshCw size={16} />} onClick={start}>
              Применить выбор
            </Button>
          )}
        </div>
        {error && <p className={s.errorText}>{error}</p>}
      </Card>

      <Card as="section">
        <CardHead icon={<Mic size={20} />} title="Уровень звука" action={stream ? <Badge tone={peak > 0.15 ? "success" : "warning"}>{peak > 0.15 ? "Слышно" : "Скажите что-нибудь"}</Badge> : undefined} />
        <Meter value={level} tone={level > 0.8 ? "warning" : "success"} />
        <p className={s.muted} style={{ marginTop: 8 }}>
          Пик: <span className="num">{Math.round(peak * 100)}%</span>. Нормальная речь — 20–70%.
        </p>
        <StatGrid items={Object.entries(info.a)} />
      </Card>

      <Card as="section">
        <CardHead icon={<Camera size={20} />} title="Картинка" sub="Реальные параметры, которые отдал браузер." />
        <StatGrid items={Object.entries(info.v)} />
        <Switch checked={showVideo} onChange={setShowVideo} label="Показать изображение (только в лаборатории)" />
        {showVideo && stream && (
          <div className={s.devicePreview}>
            <StreamVideo stream={stream} mirror label="Изображение с камеры" />
          </div>
        )}
      </Card>

      <Card as="section">
        <CardHead icon={<MonitorSpeaker size={20} />} title="Динамики" sub="Короткий сигнал в выбранное устройство." />
        <div className={s.stackSm}>
          {canPickOutput && outs.length > 0 && select("Динамик", outId, setOutId, outs, "По умолчанию")}
          <Button variant="secondary" icon={<Volume2 size={16} />} onClick={beep}>
            Проиграть сигнал
          </Button>
          {!canPickOutput && <p className={s.muted}>Этот браузер не умеет выбирать динамик, звук пойдёт в системный.</p>}
        </div>
      </Card>
    </div>
  );
}
