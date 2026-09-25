"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Headphones, Lamp, Lock, Mic, MicOff, Play, RefreshCw, ScanFace, Square, VideoOff, Camera } from "lucide-react";
import { Button, Card, CardHead, Segmented, Spinner } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { checkDone } from "@/components/client/sessions";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { BackdropPicker } from "@/components/avatar/BackdropPicker";
import { useAuth } from "@/lib/auth/store";
import { normalizeAvatar, randomAvatar } from "@/lib/avatar/schema";
import { getBackdrop, loadBackdrop, saveBackdrop, type BackdropId } from "@/lib/avatar/backdrops";
import { useAvatarCamera } from "@/hooks/useAvatarCamera";
import { useVoiceTransform, type VoicePreset } from "@/hooks/useVoiceTransform";
import s from "./check.module.css";

const VOICES: { value: VoicePreset; label: string }[] = [
  { value: "off", label: "Мой голос" },
  { value: "lower", label: "Ниже" },
  { value: "higher", label: "Выше" },
];

/** Mounts the live avatar canvas. The camera picture itself is never put on the page. */
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
  return <div ref={ref} className={s.canvasHost} />;
}

/** Live microphone level (0…1) of a stream, written straight into a bar's transform. */
function useMicMeter(stream: MediaStream | null, bar: React.RefObject<HTMLSpanElement>) {
  const [heard, setHeard] = useState(false);
  useEffect(() => {
    setHeard(false);
    if (!stream || !stream.getAudioTracks().length) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    let smooth = 0;
    let once = false;
    let raf = 0;
    const loop = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 6);
      smooth = Math.max(lvl, smooth * 0.9);
      if (bar.current) bar.current.style.transform = `scaleX(${smooth.toFixed(3)})`;
      if (!once && lvl > 0.12) {
        once = true;
        setHeard(true);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ctx.close().catch(() => {});
      if (bar.current) bar.current.style.transform = "scaleX(0)";
    };
  }, [stream, bar]);
  return heard;
}

/** Record a few seconds of (filtered) voice and play it back — safe without headphones. */
function VoicePreview({ stream }: { stream: MediaStream | null }) {
  const [state, setState] = useState<"idle" | "rec" | "play">("idle");
  const [left, setLeft] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const supported = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";

  useEffect(
    () => () => {
      rec.current?.state === "recording" && rec.current.stop();
      audio.current?.pause();
    },
    [],
  );
  useEffect(() => {
    if (state !== "rec") return;
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [state]);

  if (!supported) return null;

  const record = () => {
    if (!stream || !stream.getAudioTracks().length) return;
    audio.current?.pause();
    const chunks: Blob[] = [];
    const r = new MediaRecorder(new MediaStream(stream.getAudioTracks()));
    rec.current = r;
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
      const a = new Audio(url);
      audio.current = a;
      setState("play");
      a.onended = a.onerror = () => {
        URL.revokeObjectURL(url);
        setState("idle");
      };
      a.play().catch(() => setState("idle"));
    };
    r.start();
    setLeft(4);
    setState("rec");
    setTimeout(() => r.state === "recording" && r.stop(), 4000);
  };
  const stop = () => {
    if (rec.current?.state === "recording") rec.current.stop();
    audio.current?.pause();
    setState("idle");
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={!stream}
      onClick={state === "idle" ? record : stop}
      icon={state === "idle" ? <Play size={16} /> : <Square size={14} />}
    >
      {state === "rec" ? `Говорите… ${left}` : state === "play" ? "Слушаем запись" : "Записать и послушать"}
    </Button>
  );
}

export default function CheckPage() {
  const user = useAuth((x) => x.user);
  const avatar = useMemo(
    () => (user?.avatar_config ? normalizeAvatar(user.avatar_config) : randomAvatar(user?.id ?? "me")),
    [user],
  );
  const [backdrop, setBackdropState] = useState<BackdropId>("dusk");
  useEffect(() => setBackdropState(loadBackdrop()), []);
  const setBackdrop = (id: BackdropId) => {
    setBackdropState(id);
    saveBackdrop(id);
  };
  const [voice, setVoice] = useState<VoicePreset>("off");
  const [ticks, setTicks] = useState<Record<string, boolean>>({});

  const cam = useAvatarCamera(avatar, { backdrop });
  const { transformedStream } = useVoiceTransform({ inputStream: cam.audioStream, preset: voice });
  const bar = useRef<HTMLSpanElement>(null);
  const heard = useMicMeter(cam.audioStream, bar);

  const live = cam.state === "ready";
  useEffect(() => {
    if (live) checkDone.set();
  }, [live]);

  const light = cam.light;
  const lightOk = light !== null && light >= 70 && light <= 215;
  const lightNote =
    light === null ? null : light < 70 ? "Темновато. Включите свет перед собой" : light > 215 ? "Очень ярко. Отодвиньтесь от лампы" : "Света достаточно";
  const faceOk = live && cam.tracking && cam.faceVisible;

  const TIPS = [
    { key: "light", icon: Lamp, title: "Свет спереди", text: lightNote ?? "Лампа или окно перед вами, а не за спиной", auto: lightOk },
    { key: "face", icon: ScanFace, title: "Лицо в кадре", text: "Голова по центру, камера примерно на уровне глаз", auto: faceOk },
    { key: "phones", icon: Headphones, title: "Наушники", text: "Так вас не услышат соседи, а звук не даст эха", auto: false },
  ];
  const done = TIPS.filter((t) => ticks[t.key] || t.auto).length;

  const status = !live
    ? null
    : !cam.tracking
      ? { tone: "wait", text: "Подключаем распознавание мимики" }
      : cam.calibrating
        ? { tone: "wait", text: "Запоминаем спокойное лицо. Смотрите в камеру" }
        : cam.faceVisible
          ? { tone: "ok", text: "Лицо найдено, аватар повторяет мимику" }
          : { tone: "warn", text: "Лицо не видно. Сядьте ближе и включите свет" };

  const failed = cam.state === "denied" || cam.state === "error";

  return (
    <>
      <PageHeader
        title="Зеркало"
        sub="Так вас увидит специалист: только аватар на выбранном фоне. Изображение с камеры не показывается на экране и никуда не отправляется."
      />
      <WithRail
        rail={
          <Card as="section">
            <CardHead title="Перед сессией" sub={`Готово ${done} из ${TIPS.length}`} />
            <ul className={s.tips}>
              {TIPS.map((t) => {
                const on = !!ticks[t.key] || t.auto;
                const Icon = t.icon;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      className={s.tip}
                      aria-pressed={on}
                      onClick={() => setTicks((x) => ({ ...x, [t.key]: !x[t.key] }))}
                    >
                      <span className={s.tipIcon} aria-hidden>
                        {on ? <Check size={18} strokeWidth={2.4} /> : <Icon size={18} strokeWidth={1.8} />}
                      </span>
                      <span className={s.tipText}>
                        <strong>{t.title}</strong>
                        <span>{t.text}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className={s.tipHint}>Свет и лицо мы проверим сами, остальное отметьте, когда будет готово.</p>
          </Card>
        }
      >
        <Card as="section" className={s.stageCard}>
          <div className={s.layout}>
            <div className={s.stage} style={{ background: getBackdrop(backdrop).css }}>
              {live && <CanvasSlot canvas={cam.canvas} />}
              {live && status && (
                <span className={s.status} data-tone={status.tone}>
                  <span className={s.dot} aria-hidden />
                  {status.text}
                </span>
              )}
              {live && (
                <span className={s.private}>
                  <Lock size={13} strokeWidth={2.2} aria-hidden />
                  Только аватар
                </span>
              )}
              {!live && (
                <div className={s.placeholder}>
                  {cam.state === "starting" ? (
                    <>
                      <AvatarThumb config={avatar} size={140} framing="portrait" background="transparent" />
                      <Spinner label="Включаем камеру" />
                    </>
                  ) : failed ? (
                    <>
                      <span className={s.placeholderIcon}>
                        <VideoOff size={26} strokeWidth={1.8} />
                      </span>
                      <strong>Камера не включилась</strong>
                      <span>{cam.error}</span>
                      <Button variant="primary" onClick={cam.start}>
                        Попробовать снова
                      </Button>
                    </>
                  ) : (
                    <>
                      <AvatarThumb config={avatar} size={140} framing="portrait" background="transparent" />
                      <strong>Посмотрите на себя глазами специалиста</strong>
                      <span>Камера нужна, чтобы аватар повторял вашу мимику. Её изображение обрабатывается только на этом устройстве.</span>
                      <Button variant="primary" size="lg" onClick={cam.start} icon={<Camera size={18} />}>
                        Включить камеру
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className={s.controls}>
              <div className={s.group}>
                <div className={s.groupHead}>Фон</div>
                <BackdropPicker value={backdrop} onChange={setBackdrop} />
                <p className={s.hint}>Этот фон увидит специалист во время сессии.</p>
              </div>

              <div className={s.group}>
                <div className={s.groupHead}>Мимика</div>
                <p className={s.hint}>
                  Если аватар хмурится или улыбается, когда вы спокойны, расслабьте лицо, смотрите в камеру и откалибруйте заново.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={cam.recalibrate}
                  disabled={!live || !cam.tracking || cam.calibrating}
                  icon={<RefreshCw size={16} />}
                >
                  {cam.calibrating ? "Калибруем…" : "Откалибровать"}
                </Button>
                <Link href="/app/avatar" className={s.link}>
                  Изменить аватар
                </Link>
              </div>

              <div className={s.group}>
                <div className={s.mic}>
                  <span className={s.micIcon} data-ok={heard || undefined} aria-hidden>
                    {live && !cam.audioStream ? <MicOff size={18} strokeWidth={1.8} /> : <Mic size={18} strokeWidth={1.8} />}
                  </span>
                  <div className={s.micBody}>
                    <div className={s.micHead}>
                      <strong>Микрофон</strong>
                      <span>
                        {!live ? "Проверим вместе с камерой" : !cam.audioStream ? "Микрофон не найден" : heard ? "Слышим вас хорошо" : "Скажите пару слов"}
                      </span>
                    </div>
                    <div className={s.meter} role="presentation">
                      <span ref={bar} />
                    </div>
                  </div>
                </div>
              </div>

              <div className={s.group}>
                <div className={s.groupHead}>Голос</div>
                <Segmented value={voice} onChange={setVoice} options={VOICES} ariaLabel="Фильтр голоса" />
                <VoicePreview stream={live ? transformedStream : null} />
              </div>

              {live && (
                <Button variant="ghost" size="sm" onClick={cam.stop}>
                  Выключить камеру
                </Button>
              )}
            </div>
          </div>
        </Card>
      </WithRail>
    </>
  );
}
