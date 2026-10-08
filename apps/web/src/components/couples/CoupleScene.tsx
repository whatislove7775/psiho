"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { t } from "@/lib/i18n";
import { AvatarView } from "@/components/avatar/AvatarView";
import { randomAvatar } from "@/lib/avatar/schema";
import type { AvatarRendererApi } from "@/lib/avatar/kit/types";
import s from "./couples.module.css";
const faces = [randomAvatar("couple-b"), randomAvatar("couple-c")];
const lines = [
  "Ты меня не слышишь…",
  "Мне тоже непросто…",
  "Давай поговорим?",
  "Я хочу тебя понять.",
  "Мы рядом.",
];
const durations = [2600, 2600, 2800, 2800, 4200];
export function CoupleScene() {
  const host = useRef<HTMLElement>(null);
  const renderers = useRef<(AvatarRendererApi | null)[]>([null, null]);
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const moving = visible && !paused && !reduced;
  const current = reduced ? 4 : stage;
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (host.current) observer.observe(host.current);
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!moving) return;
    const timer = setTimeout(
      () => setStage((n) => (n + 1) % lines.length),
      durations[stage],
    );
    return () => clearTimeout(timer);
  }, [moving, stage]);
  useEffect(() => {
    renderers.current.forEach((renderer, i) => {
      renderer?.setIdle(moving);
      renderer?.lookAt(
        current < 2 ? (i === 0 ? -0.16 : 0.16) : i === 0 ? 0.2 : -0.2,
        0,
      );
      renderer?.setExpression(
        current < 2
          ? {
              browDownLeft: 0.45,
              browDownRight: 0.45,
              mouthFrownLeft: 0.3,
              mouthFrownRight: 0.3,
            }
          : { mouthSmileLeft: 0.6, mouthSmileRight: 0.6 },
      );
    });
  }, [current, moving]);
  return (
    <figure
      ref={host}
      className={s.scene}
      data-stage={current}
      data-moving={moving}
      aria-label={t("Два аватара: от ссоры к разговору и примирению")}
    >
      <div className={s.sceneFaces} aria-hidden="true">
        {faces.map((config, i) => (
          <div key={i} className={s.sceneOrb}>
            <AvatarView
              config={config}
              framing="face"
              interactive={false}
              deferLoad
              onReady={(renderer) => {
                renderers.current[i] = renderer;
                renderer.setIdle(moving);
                renderer.setExpression(
                  current < 2
                    ? { browDownLeft: 0.45, browDownRight: 0.45 }
                    : { mouthSmileLeft: 0.6, mouthSmileRight: 0.6 },
                );
              }}
              className={s.sceneAvatar}
            />
          </div>
        ))}
      </div>
      <div
        key={current}
        className={`${s.dialogue} ${current % 2 === 0 ? s.dialogueLeft : s.dialogueRight}`}
        aria-hidden="true"
      >
        {t(lines[current])}
      </div>
      {current === 4 && (
        <div className={s.hearts} aria-hidden="true">
          <span>💜</span>
          <span>💕</span>
          <span>💜</span>
        </div>
      )}
      {!reduced && (
        <button
          className={s.sceneControl}
          onClick={() => setPaused((v) => !v)}
          aria-label={t(
            paused ? "Продолжить анимацию" : "Приостановить анимацию",
          )}
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
      )}
    </figure>
  );
}
