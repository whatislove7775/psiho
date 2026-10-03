"use client";

/**
 * Live, animated HEADZ heads on a page block through ONE WebGL canvas:
 *
 *   <HeadStage className=…>            one transparent canvas over the block (HeadzStage)
 *     … <LiveHead cfg onFrame />        an empty "slot" element: the head is drawn in its rectangle
 *   </HeadStage>
 *
 * three.js is imported only when the block comes near the viewport; the stage pauses
 * off-screen and in hidden tabs. Heads are transparent (no disc behind them). The caller
 * drives expression / gaze per frame through `onFrame`.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { AvatarConfig } from "@/lib/avatar/schema";
import type { HeadzRenderer } from "@/lib/avatar/headz/HeadzRenderer";
import type { HeadzStage } from "@/lib/avatar/headz/HeadzStage";

export type HeadFrame = (r: HeadzRenderer, t: number, dt: number) => void;

const StageCtx = createContext<HeadzStage | null>(null);

export function HeadStage({
  children,
  still = false,
  className,
  canvasClassName,
}: {
  children: React.ReactNode;
  /** prefers-reduced-motion: one still frame */
  still?: boolean;
  className?: string;
  /** positions the canvas (absolute, may overhang the block so heads can float / hair can fall) */
  canvasClassName?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState<HeadzStage | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    let st: HeadzStage | null = null;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting) || st) return;
        io.disconnect();
        void import("@/lib/avatar/headz/HeadzStage").then(({ HeadzStage }) => {
          if (!alive) return;
          st = new HeadzStage(el, { still });
          setStage(st);
        });
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
      st?.dispose();
      setStage(null);
    };
  }, [still]);
  return (
    <div className={className}>
      <canvas ref={ref} aria-hidden className={canvasClassName} style={{ position: "absolute", pointerEvents: "none", maxWidth: "none" }} />
      <StageCtx.Provider value={stage}>{children}</StageCtx.Provider>
    </div>
  );
}

/** A head slot: the stage draws the head into this element's rectangle (fades in when loaded). */
export function LiveHead({
  cfg,
  onFrame,
  bob,
  turnRate,
  float,
  seed,
  className,
  style,
}: {
  cfg: AvatarConfig;
  /** per-frame driver (expression, lookAt); read through a ref so it may change every render */
  onFrame?: HeadFrame;
  bob?: number;
  turnRate?: number;
  /** slow 3D float of the head (head units) — never animate the slot itself with CSS (it would jitter) */
  float?: number;
  /** fixed seed of the idle motion */
  seed?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const stage = useContext(StageCtx);
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(onFrame);
  frame.current = onFrame;
  useEffect(() => {
    const el = ref.current;
    if (!stage || !el) return;
    const head = stage.add(el, cfg, { bob, turnRate, float, seed, onFrame: (r, t, dt) => frame.current?.(r, t, dt) });
    return () => head.remove();
    // configs here are fixed per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, cfg]);
  return <div ref={ref} aria-hidden className={className} style={{ width: "100%", height: "100%", ...style }} />;
}
