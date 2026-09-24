"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Headphones,
  Lamp,
  Lock,
  Mic,
  MicOff,
  ScanFace,
  VideoOff,
} from "lucide-react";
import { Button, Card, CardHead } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { checkDone } from "@/components/client/sessions";
import s from "./check.module.css";

type Status = "idle" | "asking" | "live" | "denied" | "missing" | "error";

const TIPS = [
  {
    key: "light",
    icon: Lamp,
    title: "Свет спереди",
    text: "Лампа или окно перед вами, а не за спиной",
  },
  {
    key: "face",
    icon: ScanFace,
    title: "Лицо в кадре",
    text: "Голова по центру, камера примерно на уровне глаз",
  },
  {
    key: "phones",
    icon: Headphones,
    title: "Наушники",
    text: "Так вас не услышат соседи, а звук не даст эха",
  },
] as const;

export default function CheckPage() {
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef<number>(0);
  const lightTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [hasMic, setHasMic] = useState(false);
  const [heard, setHeard] = useState(false);
  const [light, setLight] = useState<number | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    if (lightTimer.current) clearInterval(lightTimer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    stop();
    setStatus("asking");
    setHeard(false);
    setLight(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      return;
    }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      const name = (e as DOMException).name;
      // No microphone? Try the camera alone so the user still sees the picture.
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        try {
          media = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (e2) {
          setStatus(
            (e2 as DOMException).name === "NotAllowedError"
              ? "denied"
              : "missing",
          );
          return;
        }
      } else {
        setStatus(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : "error",
        );
        return;
      }
    }

    stream.current = media;
    setStatus("live");
    checkDone.set();
    if (video.current) {
      video.current.srcObject = media;
      video.current.play().catch(() => {});
    }

    // Microphone level
    const track = media.getAudioTracks()[0];
    setHasMic(!!track);
    if (track) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(media).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let smooth = 0;
      let heardOnce = false;
      const loop = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const lvl = Math.min(1, rms * 6);
        smooth = Math.max(lvl, smooth * 0.9);
        if (bar.current)
          bar.current.style.transform = `scaleX(${smooth.toFixed(3)})`;
        if (!heardOnce && lvl > 0.12) {
          heardOnce = true;
          setHeard(true);
        }
        raf.current = requestAnimationFrame(loop);
      };
      loop();
    }

    // Rough light estimate: average brightness of a tiny frame
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const c2d = canvas.getContext("2d", { willReadFrequently: true });
    lightTimer.current = setInterval(() => {
      const v = video.current;
      if (!c2d || !v || v.readyState < 2) return;
      c2d.drawImage(v, 0, 0, 32, 18);
      const px = c2d.getImageData(0, 0, 32, 18).data;
      let l = 0;
      for (let i = 0; i < px.length; i += 4)
        l += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      setLight(l / (px.length / 4));
    }, 800);
  };

  const lightOk = light !== null && light >= 70;
  const lightNote =
    light === null
      ? null
      : light < 70
        ? "Темновато. Включите свет перед собой"
        : light > 215
          ? "Очень ярко. Отодвиньтесь от лампы"
          : "Света достаточно";
  const done = TIPS.filter(
    (t) => ticks[t.key] || (t.key === "light" && lightOk),
  ).length;

  return (
    <>
      <PageHeader
        title="Проверка камеры и света"
        sub="Во время сессии камера нужна, чтобы аватар повторял вашу мимику. Специалист видит только аватар."
      />
      <WithRail
        rail={
          <Card as="section">
            <CardHead
              title="Перед сессией"
              sub={`Готово ${done} из ${TIPS.length}`}
            />
            <ul className={s.tips}>
              {TIPS.map((t) => {
                const auto = t.key === "light" && lightOk;
                const on = !!ticks[t.key] || auto;
                const Icon = t.icon;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      className={s.tip}
                      aria-pressed={on}
                      onClick={() =>
                        setTicks((x) => ({ ...x, [t.key]: !x[t.key] }))
                      }
                    >
                      <span className={s.tipIcon} aria-hidden>
                        {on ? (
                          <Check size={18} strokeWidth={2.4} />
                        ) : (
                          <Icon size={18} strokeWidth={1.8} />
                        )}
                      </span>
                      <span className={s.tipText}>
                        <strong>{t.title}</strong>
                        <span>
                          {t.key === "light" && lightNote ? lightNote : t.text}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className={s.tipHint}>
              Отмечайте пункты, когда всё готово. Свет мы оценим сами по
              картинке.
            </p>
          </Card>
        }
      >
        <Card as="section" className={s.stageCard}>
          <div className={s.stage} data-live={status === "live" || undefined}>
            <video
              ref={video}
              className={s.video}
              muted
              playsInline
              autoPlay
              aria-label="Изображение с вашей камеры"
            />
            {status === "live" ? (
              <span className={s.private}>
                <Lock size={14} strokeWidth={2} aria-hidden />
                Видите только вы, никуда не передаётся
              </span>
            ) : (
              <div className={s.placeholder}>
                <span className={s.placeholderIcon}>
                  {status === "denied" ||
                  status === "missing" ||
                  status === "error" ? (
                    <VideoOff size={28} strokeWidth={1.8} />
                  ) : (
                    <Camera size={28} strokeWidth={1.8} />
                  )}
                </span>
                {status === "idle" && (
                  <>
                    <strong>Посмотрим, как вас видит камера</strong>
                    <span>
                      Изображение останется на этом устройстве. Мы его не
                      записываем и никуда не отправляем.
                    </span>
                    <Button variant="primary" size="lg" onClick={start}>
                      Включить камеру
                    </Button>
                  </>
                )}
                {status === "asking" && (
                  <>
                    <strong>Разрешите доступ в окне браузера</strong>
                    <span>
                      Браузер спросит про камеру и микрофон. Нажмите
                      «Разрешить».
                    </span>
                  </>
                )}
                {status === "denied" && (
                  <>
                    <strong>Браузер не дал доступ к камере</strong>
                    <span>
                      Нажмите на значок камеры или замка в адресной строке,
                      разрешите камеру и микрофон, затем попробуйте снова.
                    </span>
                    <Button variant="primary" onClick={start}>
                      Попробовать снова
                    </Button>
                  </>
                )}
                {status === "missing" && (
                  <>
                    <strong>Камера не найдена</strong>
                    <span>
                      Подключите камеру или закройте программы, которые могут её
                      занимать, например другой видеозвонок.
                    </span>
                    <Button variant="primary" onClick={start}>
                      Проверить снова
                    </Button>
                  </>
                )}
                {status === "error" && (
                  <>
                    <strong>Не получилось включить камеру</strong>
                    <span>
                      Откройте страницу в свежей версии Chrome, Safari или
                      Firefox. Сайт должен работать по защищённому адресу https.
                    </span>
                    <Button variant="primary" onClick={start}>
                      Попробовать снова
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className={s.mic}>
            <span
              className={s.micIcon}
              data-ok={heard || undefined}
              aria-hidden
            >
              {status === "live" && !hasMic ? (
                <MicOff size={18} strokeWidth={1.8} />
              ) : (
                <Mic size={18} strokeWidth={1.8} />
              )}
            </span>
            <div className={s.micBody}>
              <div className={s.micHead}>
                <strong>Микрофон</strong>
                <span>
                  {status !== "live"
                    ? "Проверим вместе с камерой"
                    : !hasMic
                      ? "Микрофон не найден. Подключите гарнитуру"
                      : heard
                        ? "Слышим вас хорошо"
                        : "Скажите пару слов"}
                </span>
              </div>
              <div className={s.meter} role="presentation">
                <span ref={bar} />
              </div>
            </div>
            {status === "live" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  stop();
                  setStatus("idle");
                }}
              >
                Выключить камеру
              </Button>
            )}
          </div>
        </Card>
      </WithRail>
    </>
  );
}
