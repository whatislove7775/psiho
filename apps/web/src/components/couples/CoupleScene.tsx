"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { t } from "@/lib/i18n";
import { AvatarView } from "@/components/avatar/AvatarView";
import { randomAvatar } from "@/lib/avatar/schema";
import type { AvatarRendererApi } from "@/lib/avatar/kit/types";
import { smoothNoise } from "@/lib/avatar/headz/idleNoise";
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
  // Keep choreography outside React's render loop. Each partner has a distinct rhythm;
  // expressions ease in the renderer, while the timeline stays still during a pause.
  const sceneTime = useRef(0);
  const pose = useRef({ current, moving });
  pose.current = { current, moving };
  const applyPose = (renderer: AvatarRendererApi, i: number) => {
    const { current, moving } = pose.current;
    const time = sceneTime.current;
    const speaker = current < 4 && current % 2 === i;
    const seed = 19 + i * 31;
    const inward = i === 0 ? 1 : -1;
    const warmth = [0, 0.04, 0.2, 0.38, 0.55][current];
    const tension = [0.28, 0.2, 0.08, 0, 0][current];
    // Short listening nods, separated by a quiet interval; no metronomic bobbing.
    const beat = (time + i * 1.7) % 5.3;
    const nod =
      !speaker && moving
        ? Math.exp(-Math.pow((beat - 2.1) / 0.23, 2)) * 0.035
        : 0;
    const speech =
      speaker && moving ? Math.max(0, smoothNoise(time, seed, 1.4)) * 0.1 : 0;
    renderer.setIdle(moving);
    renderer.lookAt(
      inward * (current < 2 ? -0.1 : 0.24) +
        (moving ? smoothNoise(time, seed, 0.09) * 0.035 : 0),
      nod + (moving ? smoothNoise(time, seed + 4, 0.12) * 0.018 : 0),
    );
    renderer.setExpression({
      browDownLeft: tension * (speaker ? 1 : 0.65),
      browDownRight: tension * (speaker ? 0.85 : 0.7),
      browInnerUp: current === 2 && speaker ? 0.16 : 0.04,
      mouthFrownLeft: tension * 0.4,
      mouthFrownRight: tension * 0.35,
      mouthSmileLeft: warmth,
      mouthSmileRight: warmth * 0.93,
      cheekSquintLeft: warmth * 0.18,
      cheekSquintRight: warmth * 0.18,
      jawOpen: speech,
    });
  };
  const applyPoseRef = useRef(applyPose);
  applyPoseRef.current = applyPose;
  useEffect(() => {
    renderers.current.forEach((renderer, i) => {
      if (renderer) applyPoseRef.current(renderer, i);
    });
    if (!moving) return;
    let frame = 0;
    let previous = performance.now();
    const animate = (now: number) => {
      sceneTime.current += Math.min((now - previous) / 1000, 0.05);
      previous = now;
      renderers.current.forEach((renderer, i) => {
        if (renderer) applyPoseRef.current(renderer, i);
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
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
                applyPoseRef.current(renderer, i);
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
