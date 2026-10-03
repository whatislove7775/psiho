"use client";

import { t as tt } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RotateCcw } from "lucide-react";
import { Button } from "@/ui";
import s from "./media.module.css";

export interface CaptureStep {
  /** Short instruction shown over the preview */
  hint: string;
  /** Auto-capture after N seconds (a countdown is shown); otherwise the shutter button */
  countdown?: number;
}

type Phase = "starting" | "live" | "denied" | "error";

/**
 * Specialist camera (getUserMedia): mirrored live preview with a round/oval guide, one or several
 * captured frames (JPEG, un-mirrored). Never used for clients — their camera only drives the avatar.
 */
export function CameraCapture({
  mask,
  steps,
  onDone,
  onCancel,
}: {
  mask: "circle" | "oval";
  steps: CaptureStep[];
  onDone: (frames: Blob[]) => void;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [step, setStep] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const frames = useRef<Blob[]>([]);

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((ms) => {
        if (cancelled) return ms.getTracks().forEach((t) => t.stop());
        stream.current = ms;
        if (video.current) {
          video.current.srcObject = ms;
          void video.current.play().catch(() => {});
        }
        setPhase("live");
      })
      .catch((e: DOMException) => setPhase(e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "denied" : "error"));
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const grab = useCallback((): Promise<Blob | null> => {
    const v = video.current;
    if (!v || !v.videoWidth) return Promise.resolve(null);
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.92));
  }, []);

  const shoot = useCallback(async () => {
    const b = await grab();
    if (!b) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    frames.current = [...frames.current, b];
    if (frames.current.length >= steps.length) {
      stop();
      onDone(frames.current);
    } else setStep((x) => x + 1);
  }, [grab, onDone, steps.length]);

  const shootRef = useRef(shoot);
  shootRef.current = shoot;

  // Countdown steps capture themselves
  const cur = steps[step];
  const countdown = cur?.countdown ?? 0;
  useEffect(() => {
    if (phase !== "live" || !countdown) return;
    setCount(countdown);
    let n = countdown;
    const t = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        clearInterval(t);
        setCount(null);
        void shootRef.current();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [phase, step, countdown]);

  if (phase === "denied" || phase === "error") {
    return (
      <div className={s.camMsg} role="alert">
        <Camera size={28} strokeWidth={1.6} aria-hidden />
        <p>
          {phase === "denied"
            ? tt("Нет доступа к\u00a0камере. Разрешите его в\u00a0настройках браузера для\u00a0этого сайта и\u00a0попробуйте снова.")
            : tt("Камера не\u00a0найдена или\u00a0занята другим приложением.")}
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {tt("Закрыть")}
        </Button>
      </div>
    );
  }

  // Guide geometry (viewBox 300×400, same 3:4 as the view): centred, with margins so the face and the
  // bottom countdown never touch the edges.
  const guide = mask === "circle" ? { cx: 150, cy: 190, rx: 112, ry: 112 } : { cx: 150, cy: 184, rx: 94, ry: 126 };

  return (
    <div className={s.cam}>
      {cur && (
        <div className={s.camHead} aria-live="polite">
          {steps.length > 1 && (
            <span className={s.camStep}>
              <span className={s.camDots} aria-hidden>
                {steps.map((_, i) => (
                  <i key={i} data-on={i <= step || undefined} />
                ))}
              </span>
              {tt("Шаг")}{" "}{step + 1}{" "}{tt("из")}{" "}{steps.length}
            </span>
          )}
          <p className={s.camHint}>{phase === "live" ? cur.hint : tt("Включаем камеру…")}</p>
        </div>
      )}
      <div className={s.camView} data-mask={mask} data-flash={flash || undefined}>
        <video ref={video} playsInline muted autoPlay aria-label={tt("Камера")} />
        <svg className={s.camGuide} viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <mask id={`cam-${mask}`}>
              <rect width="300" height="400" fill="white" />
              <ellipse {...guide} fill="black" />
            </mask>
          </defs>
          <rect width="300" height="400" fill="rgba(8,10,20,0.55)" mask={`url(#cam-${mask})`} />
          <ellipse {...guide} fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="2" strokeDasharray={mask === "oval" ? "6 6" : undefined} />
        </svg>
        {count !== null && count > 0 && (
          <span key={count} className={s.camCount} role="timer" aria-label={tt(`Снимок через {count}`, { count })}>
            {count}
          </span>
        )}
      </div>
      <div className={s.camActions}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tt("Отмена")}
        </Button>
        {steps.length > 1 && step > 0 && (
          <Button type="button"
            variant="ghost"
            icon={<RotateCcw size={16} />}
            onClick={() => {
              frames.current = [];
              setStep(0);
            }}
          >
            {tt("Сначала")}
          </Button>
        )}
        {!cur?.countdown && (
          <Button type="button" variant="primary" icon={<Camera size={18} />} onClick={shoot} disabled={phase !== "live"}>
            {tt("Снять")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Blob → File (for the existing crop/upload step). */
export function blobToFile(b: Blob, name = "camera.jpg"): File {
  return new File([b], name, { type: b.type || "image/jpeg" });
}
