"use client";

/**
 * Background decoration for genuinely empty spots: 1–3 friendly live HEADZ heads
 * (no hands, no backgrounds) drawn by one HeadzStage — a single canvas / WebGL
 * context for the block's heads.
 *
 * Each head has a soft closed-mouth smile and gently squinted eyes, breathes and
 * floats, blinks on its own rhythm, subtly follows the cursor (slowly looks around
 * when the cursor rests), and now and then smiles wider, winks or raises its brows.
 *
 * Purely decorative: aria-hidden, no pointer events, absolutely positioned by the
 * caller's `className` (the parent must be position: relative), fixed size (no layout
 * shift). Rendered only at viewport widths ≥ `from` — below that nothing mounts, so
 * phones never load three.js; lazy (loads when scrolled near), paused off-screen;
 * prefers-reduced-motion → one still frame.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeAvatar, type AvatarConfig } from "@/lib/avatar/schema";
import { headzBase } from "@/lib/avatar/headz/catalog";
import type { HeadzRenderer } from "@/lib/avatar/headz/HeadzRenderer";
import { rng } from "@/lib/avatar/headz/idleNoise";
import { HeadStage, LiveHead } from "@/components/avatar/LiveHead";
import s from "./decor.module.css";

const CHARACTERS = {
  mila: { base: "woman-dark" },
  lev: { base: "man-light" },
  sonya: { base: "girl-medium" },
  vera: { base: "oldwoman-light" },
  timur: { base: "man-dark" },
} as const;
export type DecorHead = keyof typeof CHARACTERS;
export const DECOR_HEADS = Object.keys(CHARACTERS) as DecorHead[];

function cfgOf(id: DecorHead): AvatarConfig {
  const base = CHARACTERS[id].base;
  return normalizeAvatar({ version: 4, base, hair: headzBase(base).defaults.hair });
}

/** Last pointer position on the page (one listener for all decor heads). */
const pointer = { x: 0, y: 0, at: -1e9, on: false };
function trackPointer() {
  if (pointer.on) return;
  pointer.on = true;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.at = performance.now();
    },
    { passive: true },
  );
}

const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));
const bump = (x: number, len: number) => (x < 0 || x > len ? 0 : Math.sin((x / len) * Math.PI));

type Event = { kind: "smile" | "wink" | "brows"; at: number; len: number };

/** Per-frame driver of one decor head. */
function driver(el: () => HTMLElement | null, seed: number) {
  const rand = rng(seed);
  let next = 2.5 + (seed % 3) * 1.7;
  let ev: Event | null = null;
  let look = { yaw: 0, pitch: 0 };
  return (r: HeadzRenderer, t: number, dt: number) => {
    // where to look: the cursor (subtly) while it moves, otherwise a slow look-around
    let yaw = Math.sin(t * 0.21 + seed) * 0.4 + Math.sin(t * 0.07 + seed * 3) * 0.2;
    let pitch = Math.sin(t * 0.13 + seed * 2) * 0.15 - 0.05;
    const box = el()?.getBoundingClientRect();
    if (box && performance.now() - pointer.at < 3500) {
      const cx = box.left + box.width / 2, cy = box.top + box.height * 0.45;
      yaw = clamp((pointer.x - cx) / (window.innerWidth * 0.45)) * 0.55;
      pitch = clamp((pointer.y - cy) / (window.innerHeight * 0.5)) * 0.4;
    }
    const k = 1 - Math.exp(-dt * 2.5); // unhurried
    look = { yaw: look.yaw + (yaw - look.yaw) * k, pitch: look.pitch + (pitch - look.pitch) * k };
    r.lookAt(look.yaw, look.pitch);

    // now and then: a wider smile, a wink, playful brows
    if (!ev && t > next) {
      const kinds: Event["kind"][] = ["smile", "smile", "wink", "brows"];
      const kind = kinds[Math.floor(rand() * kinds.length)];
      ev = { kind, at: t, len: kind === "wink" ? 0.55 : kind === "brows" ? 1.1 : 2.4 };
    }
    const e = ev ? bump(t - ev.at, ev.len) : 0;
    if (ev && t - ev.at > ev.len) {
      ev = null;
      next = t + 4 + rand() * 6;
    }
    // soft closed-mouth smile, gentle squint
    const smile = 0.55 + (ev?.kind === "smile" ? 0.35 * e : 0) + (ev?.kind === "wink" ? 0.2 * e : 0);
    const w: Record<string, number> = {
      mouthSmileLeft: smile,
      mouthSmileRight: smile,
      cheekSquintLeft: 0.25 + 0.25 * (smile - 0.55),
      cheekSquintRight: 0.25 + 0.25 * (smile - 0.55),
      eyeSquintLeft: 0.22,
      eyeSquintRight: 0.22,
      mouthClose: 0.05,
      mouthPressLeft: 0.1,
      mouthPressRight: 0.1,
    };
    if (ev?.kind === "wink") w.eyeBlinkLeft = Math.min(1, e * 1.6);
    if (ev?.kind === "brows") {
      w.browInnerUp = 0.6 * e;
      w.browOuterUpLeft = w.browOuterUpRight = 0.5 * e;
    }
    r.setExpression(w);
  };
}

function Head({ id, px, seed, order }: { id: DecorHead; px: number; seed: number; order: number }) {
  const box = useRef<HTMLDivElement>(null);
  const cfg = useMemo(() => cfgOf(id), [id]);
  const onFrame = useMemo(() => driver(() => box.current, seed), [seed]);
  return (
    <div ref={box} className={s.pic} style={{ width: px, height: px, order }}>
      {/* the float is done in 3D by the renderer: a CSS float on the slot made the head jitter */}
      <LiveHead cfg={cfg} onFrame={onFrame} bob={0.015} float={0.07} seed={seed} turnRate={3} />
    </div>
  );
}

export function AvatarDecor({
  heads,
  size = 200,
  from = 1024,
  className,
}: {
  /** first is the main one; the others are smaller companions to its left */
  heads: DecorHead[];
  /** CSS px of the main head (square) */
  size?: number;
  /** shown only at viewport widths ≥ this */
  from?: 1024 | 1200;
  className?: string;
}) {
  const [on, setOn] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${from}px)`);
    const upd = () => setOn(mq.matches);
    upd();
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    trackPointer();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, [from]);
  const list = heads.slice(0, 3);
  return (
    <div aria-hidden className={`${s.decor} ${from === 1200 ? s.from1200 : s.from1024} ${className ?? ""}`}>
      {on && (
        <HeadStage still={still} className={s.row} canvasClassName={s.canvas}>
          {list.map((id, i) => (
            <Head key={id + i} id={id} px={Math.round(size * (i === 0 ? 1 : 0.72))} seed={i * 1.9 + id.length} order={-i} />
          ))}
        </HeadStage>
      )}
    </div>
  );
}
