/**
 * HeadzStage — many live HEADZ heads through ONE WebGL canvas / context.
 *
 * The stage owns one transparent canvas laid over a block of the page (e.g. the
 * landing's ring of ten heads). Every head is a HeadzRenderer sharing the stage's
 * THREE.WebGLRenderer, environment map, compiled shader programs and GLB caches,
 * and is drawn into its own viewport: the on-screen rectangle of a "slot" element
 * (so layout, CSS transforms and hover effects of the slot move / scale the head).
 * No per-head canvases, no copies between canvases.
 *
 *  - the loop runs only while the stage is on screen and the tab is visible;
 *  - fps cap: 30 on phones / coarse pointers, 60 otherwise; DPR capped; adaptive
 *    quality (fewer pixels, then fewer frames) when a weak GPU can't keep up;
 *  - `still` stages (prefers-reduced-motion) draw once when every head is loaded.
 */
import * as THREE from "three";
import type { AvatarConfig } from "../schema";
import type { Framing } from "../kit/types";
import { HeadzRenderer, configureRenderer, makeEnvironment } from "./HeadzRenderer";

export interface StageHeadOptions {
  framing?: Framing;
  /** breathing bob amplitude (head units) */
  bob?: number;
  /** head turn speed toward lookAt (1/s) */
  turnRate?: number;
  /** per-frame hook: drive expression / gaze (t = seconds since the head was added) */
  onFrame?: (r: HeadzRenderer, t: number, dt: number) => void;
}

export interface StageHead {
  readonly renderer: HeadzRenderer;
  /** resolves once the head's parts are loaded */
  readonly ready: Promise<void>;
  remove(): void;
}

interface Head {
  r: HeadzRenderer;
  slot: HTMLElement;
  opts: StageHeadOptions;
  loaded: boolean;
  t: number;
}

/** the viewport continues this far (× slot height) below the slot: long hair isn't cut off */
const BELOW = 0.8;
/** …and this far (× slot width) left and right: big hair isn't cut at the sides */
const SIDE = 0.3;

export class HeadzStage {
  readonly canvas: HTMLCanvasElement;
  private gl: THREE.WebGLRenderer;
  private env: THREE.Texture;
  private heads = new Set<Head>();
  private raf = 0;
  private last = 0;
  private visible = false;
  private drawnStill = false;
  private still: boolean;
  private io: IntersectionObserver;
  private onVis = () => this.wake();
  fps: number;
  dpr: number;
  /** CPU time (ms) of the last ~120 frames — QA / perf sampling */
  readonly frames: number[] = [];
  /** frames drawn since creation — QA fps sampling */
  drawn = 0;

  constructor(canvas: HTMLCanvasElement, opts: { still?: boolean } = {}) {
    this.canvas = canvas;
    this.still = !!opts.still;
    const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760;
    this.fps = mobile ? 30 : 60;
    this.dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2);
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "default" });
    this.gl.setPixelRatio(1);
    configureRenderer(this.gl);
    this.gl.setClearColor(0x000000, 0);
    this.gl.autoClear = false;
    this.env = makeEnvironment(this.gl);
    this.io = new IntersectionObserver(
      (es) => {
        this.visible = es.some((e) => e.isIntersecting);
        this.wake();
      },
      { rootMargin: "100px" },
    );
    this.io.observe(canvas);
    document.addEventListener("visibilitychange", this.onVis);
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __headzStages?: Set<HeadzStage> };
      (w.__headzStages ??= new Set()).add(this);
    }
  }

  add(slot: HTMLElement, cfg: AvatarConfig, opts: StageHeadOptions = {}): StageHead {
    const r = new HeadzRenderer(null, {
      gl: this.gl,
      env: this.env,
      background: null,
      framing: opts.framing ?? "face",
      idle: true,
      mirror: false,
      bob: opts.bob ?? 0.012,
      turnRate: opts.turnRate ?? 5,
    });
    const h: Head = { r, slot, opts, loaded: false, t: 0 };
    r.setConfig(cfg);
    const ready = r.whenReady().then(() => {
      h.loaded = true;
      this.drawnStill = false;
      this.wake();
    });
    this.heads.add(h);
    return {
      renderer: r,
      ready,
      remove: () => {
        this.heads.delete(h);
        r.dispose();
        this.drawnStill = false;
        this.wake();
      },
    };
  }

  /** WebGL memory in use (QA). */
  info() {
    const m = this.gl.info.memory;
    return { geometries: m.geometries, textures: m.textures, programs: this.gl.info.programs?.length ?? 0, heads: this.heads.size, size: [this.canvas.width, this.canvas.height], dpr: this.dpr, fps: this.fps };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.io.disconnect();
    document.removeEventListener("visibilitychange", this.onVis);
    for (const h of this.heads) h.r.dispose();
    this.heads.clear();
    this.env.dispose();
    this.gl.dispose();
    this.gl.forceContextLoss();
    (window as unknown as { __headzStages?: Set<HeadzStage> }).__headzStages?.delete(this);
  }

  private wake() {
    if (this.raf || !this.visible || document.visibilityState !== "visible") return;
    if (this.still && this.drawnStill) return;
    // waking from sleep: don't count the pause as slow frames
    this.last = 0;
    this.slow.start = 0;
    this.slow.count = 0;
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (now: number) => {
    this.raf = 0;
    if (!this.visible || document.visibilityState !== "visible" || !this.heads.size) return;
    if (this.still) {
      // reduced motion: one settled frame once everything is loaded
      if ([...this.heads].every((h) => h.loaded)) {
        this.frame(now, 1 / 30, 45);
        this.drawnStill = true;
        return;
      }
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
    if (now - this.last < 1000 / this.fps - 3) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / this.fps;
    this.last = now;
    this.frame(now, dt, 1);
    this.adapt(now);
  };

  private frame(now: number, dt: number, steps: number) {
    const t0 = performance.now();
    const box = this.canvas.getBoundingClientRect();
    const W = Math.max(1, Math.round(box.width * this.dpr)), H = Math.max(1, Math.round(box.height * this.dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) this.gl.setSize(W, H, false);
    const gl = this.gl;
    gl.setScissorTest(false);
    gl.clear();
    gl.setScissorTest(true);
    for (const h of this.heads) {
      if (!h.loaded) continue;
      const r = h.slot.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const k = this.dpr;
      const x = Math.round((r.left - r.width * SIDE - box.left) * k);
      const w0 = r.width * k;
      const w = Math.round(w0 * (1 + 2 * SIDE));
      const hh = Math.round(r.height * k);
      const vh = Math.round(r.height * (1 + BELOW) * k);
      // three's viewport origin is the bottom-left corner
      const y = H - Math.round((r.top - box.top) * k) - vh;
      if (x + w < 0 || x > W || y + vh < 0 || y > H) continue;
      gl.setViewport(x, y, w, vh);
      gl.setScissor(x, y, w, vh);
      // viewports of neighbours may overlap: each head starts with a fresh depth buffer (colour stays)
      gl.clearDepth();
      for (let i = 0; i < steps; i++) {
        h.t += dt;
        h.opts.onFrame?.(h.r, h.t, dt);
        h.r.tick(dt);
      }
      h.r.setView(w0 / hh, BELOW, SIDE);
      h.r.draw();
    }
    gl.setScissorTest(false);
    this.drawn++;
    this.frames.push(performance.now() - t0);
    if (this.frames.length > 120) this.frames.shift();
    void now;
  }

  /**
   * Adaptive quality: when the achieved frame rate stays well under the target for ~2 s
   * (weak GPU, many heads), render fewer pixels first, then fewer frames.
   */
  private slow = { count: 0, start: 0 };
  private adapt(now: number) {
    const S = this.slow;
    if (!S.start) S.start = now;
    S.count++;
    if (now - S.start < 2000) return;
    const fps = (S.count * 1000) / (now - S.start);
    S.start = now;
    S.count = 0;
    if (fps > this.fps * 0.7) return;
    if (this.dpr > 1) this.dpr = Math.max(1, this.dpr * 0.8);
    else if (this.fps > 30) this.fps = 30;
  }
}
