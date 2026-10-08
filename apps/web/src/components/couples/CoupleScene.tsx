"use client";
import { useEffect, useRef, useState } from "react";
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
const durations = [3800, 4400, 4200, 4800];
export function CoupleScene() {
  const host = useRef<HTMLElement>(null);
  const renderers = useRef<(AvatarRendererApi | null)[]>([null, null]);
  const [stage, setStage] = useState(0);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const moving = visible && !reduced;
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
    if (!moving || stage >= 4) return;
    const timer = setTimeout(
      () => setStage((n) => Math.min(4, n + 1)),
      durations[stage],
    );
    return () => clearTimeout(timer);
  }, [moving, stage]);
  // Keep choreography outside React's render loop. Each partner has a distinct rhythm;
  // expressions ease in the renderer, while the timeline stops when hidden or reduced motion is enabled.
  const sceneTime = useRef(0);
  const stageStart = useRef(0);
  const lastStage = useRef(current);
  if (lastStage.current !== current) {
    stageStart.current = sceneTime.current;
    lastStage.current = current;
  }
  const pose = useRef({ current, moving });
  pose.current = { current, moving };
  const applyPose = (renderer: AvatarRendererApi, i: number) => {
    const { current, moving } = pose.current;
    const time = sceneTime.current;
    const speaker = current < 4 && current % 2 === i;
    const seed = 19 + i * 31;
    const inward = i === 0 ? 1 : -1;
    const age = time - stageStart.current;
    const pulse = (at: number, width: number) =>
      Math.exp(-Math.pow((age - at) / width, 2));
    const warmth = [0.01, 0.02, 0.08, 0.14, 0.24][current];
    const tension = [0.12, 0.09, 0.03, 0, 0][current];
    // One short utterance, then silence. Uneven syllables, not continuous chewing.
    const speech =
      speaker && moving
        ? 0.04 *
          (pulse(0.65, 0.06) +
            0.7 * pulse(0.88, 0.08) +
            pulse(1.17, 0.07) +
            0.5 * pulse(1.49, 0.1) +
            0.7 * pulse(1.82, 0.065))
        : 0;
    const nod =
      !speaker && moving && current >= 2
        ? pulse(2.35 + i * 0.23, 0.3) * 0.025
        : 0;
    // Keep attention on the partner. A brief downward thinking glance precedes
    // speaking; gaze then settles rather than wandering every frame.
    const thought = moving && current < 2 ? pulse(0.3 + i * 0.2, 0.45) : 0;
    renderer.setIdle(moving);
    renderer.lookAt(
      inward * (0.38 - thought * 0.24) +
        (moving ? smoothNoise(time, seed, 0.035) * 0.012 : 0),
      thought * 0.075 +
        nod +
        (moving ? smoothNoise(time, seed + 4, 0.05) * 0.008 : 0),
    );
    renderer.setExpression({
      browDownLeft: tension * (speaker ? 1 : 0.65),
      browDownRight: tension * (speaker ? 0.85 : 0.7),
      browInnerUp: current === 2 && speaker ? 0.06 : 0.015,
      mouthFrownLeft: tension * 0.4,
      mouthFrownRight: tension * 0.35,
      mouthSmileLeft: warmth,
      mouthSmileRight: warmth * 0.93,
      cheekSquintLeft: warmth * 0.12,
      cheekSquintRight: warmth * 0.12,
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
    </figure>
  );
}
