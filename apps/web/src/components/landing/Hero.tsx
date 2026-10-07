"use client";

import { getLocale, t as tt } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { AvatarView, type AvatarViewHandle } from "@/components/avatar/AvatarView";
import { randomAvatar } from "@/lib/avatar/schema";
import { hasLongHair } from "@/lib/avatar/headz/hairReach";
import { randomAlias, randomSeed } from "@/lib/avatar/randomIdentity";
import { Button } from "@/ui";
import s from "./landing.module.css";

/** What the server renders (and the first client render, so hydration matches); a random identity replaces it on mount. */
const DEFAULT_IDENTITY = { seed: "aprosop-kit", get alias() { return tt("тихий-кит-4821"); } };

/** A truly random face and alias. Faces with a very long hanging tail make the head look small, so re-roll most of those. */
function randomIdentity(): { seed: string; alias: string } {
  let seed = randomSeed();
  for (let i = 0; i < 3 && hasLongHair(randomAvatar(seed)); i++) seed = randomSeed();
  return { seed, alias: randomAlias(getLocale()) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

type LookApi = { lookAt(yaw: number, pitch: number): void; setExpression(w: Record<string, number>): void };

/**
 * Scripted "alive" motion for touch screens: the head glides between points of interest
 * (eased, with holds and a slight drift), often returns to eye contact, and smiles now and then.
 * Blinks come from the renderer's own idle loop. Returns a cleanup function.
 */
function scriptedIdle(get: () => LookApi | null) {
  let raf = 0;
  let from = { x: 0, y: 0 };
  let to = { x: 0, y: 0 };
  let moveStart = 0;
  let moveDur = 1;
  let holdUntil = 0;
  let smileAt = performance.now() + rand(2500, 4500);
  let smileEnd = 0;
  const pick = (now: number, cur: { x: number; y: number }) => {
    from = cur;
    // ~40%: back to the viewer; otherwise glance somewhere (more sideways than up/down)
    to = Math.random() < 0.4 ? { x: rand(-0.08, 0.08), y: rand(-0.05, 0.05) } : { x: rand(-0.85, 0.85), y: rand(-0.35, 0.45) };
    moveStart = now;
    moveDur = rand(900, 1700);
    holdUntil = now + moveDur + rand(900, 2600);
  };
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const r = get();
    if (!r) return;
    const p = clamp((now - moveStart) / moveDur, 0, 1);
    const e = ease(p);
    const drift = now / 1000;
    const x = from.x + (to.x - from.x) * e + Math.sin(drift * 0.9) * 0.04;
    const y = from.y + (to.y - from.y) * e + Math.sin(drift * 0.7 + 1.3) * 0.03;
    r.lookAt(x, y);
    if (now > holdUntil) pick(now, { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
    // a soft smile: ramp in, hold, ramp out
    if (now > smileAt && !smileEnd) smileEnd = now + rand(1400, 2400);
    if (smileEnd) {
      const len = smileEnd - smileAt;
      const t = clamp((now - smileAt) / len, 0, 1);
      const w = Math.sin(Math.PI * t) ** 0.6 * 0.55;
      r.setExpression({ mouthSmileLeft: w, mouthSmileRight: w, cheekSquintLeft: w * 0.35, cheekSquintRight: w * 0.35 });
      if (now > smileEnd) {
        r.setExpression({});
        smileEnd = 0;
        smileAt = now + rand(4500, 9000);
      }
    }
  };
  pick(performance.now(), { x: 0, y: 0 });
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    get()?.setExpression({});
  };
}

export function Hero() {
  const [identity, setIdentity] = useState<{ seed: string; alias: string }>(DEFAULT_IDENTITY);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<AvatarViewHandle>(null);

  const current = identity;
  const config = useMemo(() => randomAvatar(current.seed), [current.seed]);

  // Every visit starts with a different face (random, not a fixed script).
  useEffect(() => {
    setIdentity(randomIdentity());
  }, []);

  // Desktop (fine pointer with hover): the head follows the cursor anywhere on the page.
  // Touch devices: the canvas ignores touches entirely (so scrolling is never hijacked) and the
  // head drifts along gentle scripted trajectories instead: looks around, back at you, smiles.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!finePointer) return scriptedIdle(() => viewRef.current?.renderer ?? null);
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const el = stageRef.current;
      const r = viewRef.current?.renderer;
      if (!el || !r || !last) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.4;
      const nx = clamp((last.clientX - cx) / (window.innerWidth / 2), -1, 1);
      const ny = clamp((last.clientY - cy) / (window.innerHeight / 2), -1, 1);
      r.lookAt(nx * 0.95, ny * 0.7);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => viewRef.current?.renderer?.lookAt(0, 0);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const shuffle = () => setIdentity(randomIdentity());

  return (
    <section className={`${s.wrap} ${s.hero}`} aria-labelledby="hero-title">
      <div className={s.heroText}>
        <h1 id="hero-title" className={s.heroTitle}>
          {/* three fixed lines; spaces between the line spans keep the text readable for bots/copy */}
          <span className={s.heroLine}>{tt("Психолог онлайн,")}</span>{" "}
          <span className={s.heroAccent}>
            <span className={`${s.heroLine} ${s.heroLineWrap}`}>{tt("сохраняя лицо")}</span>{" "}
            <span className={s.heroLine}>{tt("и имя в тайне")}</span>
          </span>
        </h1>
        <p className={s.heroLead}>{tt("Без\u00a0почты и\u00a0телефона. Вместо имени псевдоним, вместо лица 3D-аватар с\u00a0вашей мимикой.")}</p>
        <div className={s.heroActions}>
          <Button href={lp("/match")} variant="primary" size="lg">
            {tt("Подобрать психолога")}
          </Button>
          <Button href={lp("/specialists")} variant="ghost" size="lg" className={s.heroSecondary}>
            {tt("Посмотреть специалистов")}
          </Button>
        </div>
        {/* H1: public matching quiz, works without login */}
        <Link href={lp("/couples")} className={s.heroQuiz}>
          {tt("Хотите прийти вдвоём?")}{" "}<span>{tt("Консультация для пары")}</span>
          <ArrowRight size={15} strokeWidth={2} aria-hidden />
        </Link>
      </div>

      <figure className={s.heroFigure}>
        <div ref={stageRef} className={s.stage} data-fade={hasLongHair(config) || undefined}>
          <div className={s.stageCanvas}>
            <AvatarView ref={viewRef} config={config} framing="portrait" interactive={false} deferLoad />
          </div>
        </div>
        <figcaption className={s.heroTag}>
          <span aria-live="polite">{current.alias}</span>
          <button type="button" className={s.shuffle} aria-label={tt("Показать другой аватар")} title={tt("Другой аватар")} onClick={shuffle}>
            <RefreshCw size={14} strokeWidth={2} aria-hidden />
          </button>
        </figcaption>
      </figure>
    </section>
  );
}
