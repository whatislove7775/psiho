"use client";

import { useEffect, useRef } from "react";
import s from "./livingBg.module.css";

/**
 * Public pages' living background: soft brand glows that drift with scroll at different (parallax) speeds and
 * slowly shift hue (periwinkle → violet → cyan → peach), plus grain that slides at its own pace.
 *
 * Cheap by design: the glows are drawn into a tiny canvas (1/6 of the viewport) that the GPU stretches
 * smoothly — soft gradients need no resolution, there are no CSS blur filters — and the grain is one tiled
 * layer moved with transform only. One rAF-throttled scroll handler; nothing in the content repaints.
 * Static under prefers-reduced-motion. Cabinets keep the calm static glow (body::before in globals.css).
 */

type RGB = [number, number, number];
const PERI: RGB = [122, 165, 255];
const VIOLET: RGB = [106, 79, 232];
const CYAN: RGB = [111, 216, 242];
const PEACH: RGB = [255, 159, 133];
const CYCLE = [PERI, VIOLET, CYAN, PEACH];

/** Blob: home position (viewport fractions), drift amplitude, scroll wavelength (px), phase, radius, colour offset. */
const BLOBS = [
  { x: 0.12, y: 0.06, ax: 0.08, ay: 0.16, len: 1500, ph: 0, r: 0.62, c: 0 },
  { x: 0.92, y: 0.14, ax: 0.07, ay: 0.2, len: 1100, ph: 1.7, r: 0.56, c: 1 },
  { x: 0.7, y: 0.96, ax: 0.12, ay: 0.14, len: 1900, ph: 3.1, r: 0.5, c: 2 },
  { x: 0.18, y: 0.78, ax: 0.1, ay: 0.18, len: 1300, ph: 4.4, r: 0.42, c: 3 },
];

const SCALE = 6;
const GRAIN_TILE = 160;

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Smooth trip around the palette: u in [0, 4) → colour (cosine-eased between neighbours). */
function cycle(u: number): RGB {
  const n = CYCLE.length;
  const w = ((u % n) + n) % n;
  const i = Math.floor(w);
  const f = 0.5 - 0.5 * Math.cos(Math.PI * (w - i));
  return mix(CYCLE[i], CYCLE[(i + 1) % n], f);
}

const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function LivingBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const canvas = canvasRef.current!;
    const grain = grainRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    const fit = () => {
      const w = Math.max(32, Math.ceil(root.clientWidth / SCALE));
      const h = Math.max(32, Math.ceil(root.clientHeight / SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const draw = () => {
      raf = 0;
      const y = still ? 0 : window.scrollY;
      const light = document.documentElement.dataset.theme === "light";
      const { width: W, height: H } = canvas;
      const big = Math.max(W, H);
      ctx.clearRect(0, 0, W, H);

      // a faint diagonal wash whose angle and colours turn slowly with the scroll
      const ang = ((120 + 35 * Math.sin(y / 1700)) * Math.PI) / 180;
      const dx = Math.cos(ang) * big * 0.6;
      const dy = Math.sin(ang) * big * 0.6;
      const wash = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
      const wa = 0.05;
      wash.addColorStop(0, rgba(cycle(y / 2400), wa));
      wash.addColorStop(0.5, rgba(cycle(y / 2400 + 1), 0));
      wash.addColorStop(1, rgba(cycle(y / 2400 + 2), wa));
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, W, H);

      for (const b of BLOBS) {
        const t = y / b.len + b.ph;
        const x = (b.x + Math.sin(t * 0.8) * b.ax) * W;
        const cy = (b.y + Math.sin(t) * b.ay) * H;
        const r = b.r * big * (1 + 0.08 * Math.sin(t * 1.3));
        const c = cycle(b.c + y / 3000);
        const a = light ? 0.2 : 0.17;
        const g = ctx.createRadialGradient(x, cy, 0, x, cy, r);
        g.addColorStop(0, rgba(c, a));
        g.addColorStop(0.45, rgba(c, a * 0.45));
        g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // grain slides a little slower than the page (seamless: the tile stitches)
      grain.style.transform = `translate3d(0, ${-((y * 0.4) % GRAIN_TILE)}px, 0)`;
      root.dataset.ready = "";
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const onResize = () => {
      fit();
      schedule();
    };

    fit();
    draw();
    const ro = new ResizeObserver(onResize);
    ro.observe(root);
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (!still) window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("scroll", schedule);
    };
  }, []);

  return (
    <div ref={rootRef} className={s.root} aria-hidden data-live-bg="">
      <canvas ref={canvasRef} className={s.glow} />
      <div ref={grainRef} className={s.grain} />
    </div>
  );
}
