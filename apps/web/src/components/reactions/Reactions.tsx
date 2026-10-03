"use client";

/**
 * Call reactions (👍 / 👎) drawn in the site's illustration style (flat shapes,
 * soft logo gradients, a yellow sparkle) — never an OS emoji. A reaction pops
 * over the sender's tile for ~2 s on both sides of the call.
 */
import { t as tt } from "@/lib/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import s from "./reactions.module.css";

export type ReactionKind = "up" | "down";
export const REACTION_MS = 2000;
export const REACTION_LABEL: Record<ReactionKind, string> = { get up() { return tt("Нравится"); }, get down() { return tt("Не нравится"); } };

const BG: Record<ReactionKind, [string, string]> = {
  up: ["#7AA5FF", "#6A4FE8"],
  down: ["#FFB199", "#F0705B"],
};

/** The drawn badge. */
export function ReactionArt({ kind, className, animated = false }: { kind: ReactionKind; className?: string; animated?: boolean }) {
  const p = useId().replace(/:/g, "");
  const [a, b] = BG[kind];
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={REACTION_LABEL[kind]}>
      <defs>
        <linearGradient id={`${p}bg`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
        <linearGradient id={`${p}sk`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#FFE3CC" />
          <stop offset="1" stopColor="#F3BB93" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill={`url(#${p}bg)`} />
      <path d="M13 22c4-9 13-14 22-13" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" />
      <g transform={kind === "down" ? "rotate(180 32 33)" : undefined} strokeLinejoin="round" strokeLinecap="round">
        {/* sleeve */}
        <rect x="14" y="30" width="8" height="22" rx="3" fill="#fff" />
        {/* fist */}
        <path
          d="M22 31h17.5a4.5 4.5 0 0 1 0.6 9 4.3 4.3 0 0 1-0.8 6.4 3.8 3.8 0 0 1-2.6 6H25a3 3 0 0 1-3-3Z"
          fill={`url(#${p}sk)`}
          stroke="#E3A27A"
          strokeWidth="1.6"
        />
        {/* thumb */}
        <path d="M24.5 31.5c0-6 1.5-12 4.6-16.5 1.7-2.4 5.3-1.4 5 1.7-.4 4.4-1.6 9-1.3 14.8Z" fill={`url(#${p}sk)`} stroke="#E3A27A" strokeWidth="1.6" />
        <path d="M33 40h6.5M33 46.2h5" fill="none" stroke="#E3A27A" strokeWidth="1.6" />
        <ellipse cx="27" cy="44" rx="2.6" ry="1.7" fill="#FFA784" opacity=".55" />
      </g>
      <path
        className={animated ? s.spark : undefined}
        d="M50 7.5l1.6 4.9 4.9 1.6-4.9 1.6-1.6 4.9-1.6-4.9-4.9-1.6 4.9-1.6Z"
        fill="#FFD84A"
        stroke="#D99A22"
        strokeWidth=".8"
      />
    </svg>
  );
}

export interface Burst {
  id: number;
  kind: ReactionKind;
}

/** Reactions currently shown over one tile; `push` adds one for REACTION_MS. */
export function useReactionBursts(): [Burst[], (kind: ReactionKind) => void] {
  const [items, setItems] = useState<Burst[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const push = useCallback((kind: ReactionKind) => {
    const id = ++seq.current;
    setItems((x) => [...x.slice(-2), { id, kind }]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      setItems((x) => x.filter((b) => b.id !== id));
    }, REACTION_MS + 80);
    timers.current.add(t);
  }, []);
  return [items, push];
}

/** Overlay for a tile (the tile must be position: relative). */
export function ReactionLayer({ items, small }: { items: Burst[]; small?: boolean }) {
  if (!items.length) return null;
  return (
    <div className={s.layer} aria-live="polite">
      {items.map((b) => (
        <span key={b.id} className={s.burst} data-small={small || undefined}>
          <ReactionArt kind={b.kind} animated />
        </span>
      ))}
    </div>
  );
}

/** Keyed bursts for many tiles (group calls): [bursts by key, push(key, kind)]. */
export function useKeyedBursts(): [Record<string, Burst[]>, (key: string, kind: ReactionKind) => void] {
  const [map, setMap] = useState<Record<string, Burst[]>>({});
  const seq = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const push = useCallback((key: string, kind: ReactionKind) => {
    const id = ++seq.current;
    setMap((m) => ({ ...m, [key]: [...(m[key] ?? []).slice(-2), { id, kind }] }));
    const t = setTimeout(() => {
      timers.current.delete(t);
      setMap((m) => {
        const left = (m[key] ?? []).filter((b) => b.id !== id);
        const next = { ...m };
        if (left.length) next[key] = left;
        else delete next[key];
        return next;
      });
    }, REACTION_MS + 80);
    timers.current.add(t);
  }, []);
  return [map, push];
}

/** Client-side throttle for sending (≤ 1 reaction per second). */
export function useReactionThrottle(send: (kind: ReactionKind) => void, gapMs = 1000) {
  const last = useRef(0);
  const ref = useRef(send);
  ref.current = send;
  return useCallback(
    (kind: ReactionKind) => {
      const now = Date.now();
      if (now - last.current < gapMs) return false;
      last.current = now;
      ref.current(kind);
      return true;
    },
    [gapMs],
  );
}

export { s as reactionStyles };
