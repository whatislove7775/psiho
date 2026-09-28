"use client";

/**
 * Generator of the decorative avatar pictures in public/decor/ (404 in production).
 * Renders happy HEADZ characters with floating hands in friendly gestures on a
 * transparent background and exposes them as WebP data URLs in window.__decor —
 * scripts/render-decor.mjs saves them to public/decor/<id>.webp.
 *   /dev/avatar-decor            all pictures
 *   /dev/avatar-decor?only=wave  one of them
 */
import { notFound, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DEFAULT_AVATAR, normalizeAvatar, type AvatarConfig } from "@/lib/avatar/schema";
import { headzBase } from "@/lib/avatar/headz/catalog";

type Scene = { label: string; right: string; left: string; rightAt?: [number, number]; leftAt?: [number, number]; near?: number };
interface Job {
  id: string;
  cfg: Partial<AvatarConfig>;
  /** synthetic hand scene; `hide` removes one hand after posing */
  scene: Scene;
  hide?: "L" | "R";
  expr: Record<string, number>;
  /** head turn / nod / tilt (radians) */
  yaw: number;
  pitch: number;
  roll: number;
}

/** warm open smile (cheeks up, smiling eyes) */
const SMILE = { mouthSmileLeft: 1, mouthSmileRight: 1, jawOpen: 0.28, mouthUpperUpLeft: 0.35, mouthUpperUpRight: 0.35, cheekSquintLeft: 0.6, cheekSquintRight: 0.6, eyeSquintLeft: 0.4, eyeSquintRight: 0.4 };
/** open joyful laugh (teeth showing) */
const GRIN = { mouthSmileLeft: 1, mouthSmileRight: 1, jawOpen: 0.45, mouthUpperUpLeft: 0.5, mouthUpperUpRight: 0.5, cheekSquintLeft: 0.5, cheekSquintRight: 0.5, eyeSquintLeft: 0.55, eyeSquintRight: 0.55 };

const hair = (base: string) => headzBase(base).defaults.hair ?? "none";

const DECOR_JOBS: Job[] = [
  {
    id: "wave",
    cfg: { base: "woman-dark", hair: hair("woman-dark") },
    scene: { label: "wave", right: "open", left: "open", rightAt: [0.2, 0.4], near: 1.25 },
    // note: the hands controller mirrors (selfie view) — holder "L" is the scene's right hand
    hide: "R",
    expr: GRIN,
    yaw: -0.08,
    pitch: -0.04,
    roll: 0.1,
  },
  {
    id: "thumbs",
    cfg: { base: "man-light", hair: hair("man-light") },
    scene: { label: "thumbs", right: "thumbsUp", left: "thumbsUp", rightAt: [0.24, 0.72], leftAt: [0.76, 0.72] },
    expr: SMILE,
    yaw: 0.06,
    pitch: -0.02,
    roll: -0.08,
  },
  {
    id: "peace",
    cfg: { base: "girl-medium", hair: hair("girl-medium") },
    scene: { label: "peace", right: "peace", left: "open", rightAt: [0.8, 0.5], near: 1.2 },
    hide: "R",
    expr: { ...GRIN, eyeBlinkLeft: 0 },
    yaw: 0.09,
    pitch: -0.05,
    roll: -0.12,
  },
  {
    id: "hello",
    cfg: { base: "oldwoman-light", hair: hair("oldwoman-light") },
    scene: { label: "hello", right: "open", left: "open", rightAt: [0.2, 0.55], leftAt: [0.8, 0.55] },
    expr: SMILE,
    yaw: 0,
    pitch: -0.06,
    roll: 0.07,
  },
  {
    id: "yay",
    cfg: { base: "man-dark", hair: hair("man-dark") },
    scene: { label: "yay", right: "peace", left: "thumbsUp", rightAt: [0.2, 0.5], leftAt: [0.8, 0.72] },
    expr: GRIN,
    yaw: -0.07,
    pitch: -0.03,
    roll: 0.09,
  },
];

interface Internals {
  loading: Promise<void>;
  current: Float32Array;
  manual: Record<string, number>;
  headPivot: { quaternion: { identity(): void } };
  root: { rotation: { set(x: number, y: number, z: number, o?: string): void } };
  applyRig(): void;
  renderer: { render(s: unknown, c: unknown): void };
  scene: unknown;
  camera: unknown;
}

function Gen() {
  const sp = useSearchParams();
  const size = Number(sp.get("size") ?? 520);
  const quality = Number(sp.get("q") ?? 0.82);
  const [imgs, setImgs] = useState<{ id: string; src: string }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { HeadzRenderer, SHAPES } = await import("@/lib/avatar/headz/HeadzRenderer");
      const { poseSyntheticHands, disposeSyntheticHands } = await import("@/lib/avatar/headz/hands/labSynth");
      const only = sp.get("only")?.split(",");
      const out: { id: string; src: string }[] = [];
      const store: Record<string, string> = {};
      for (const j of DECOR_JOBS) {
        if (only && !only.includes(j.id)) continue;
        // a fresh renderer per picture: hands controllers are bound to one renderer
        const canvas = document.createElement("canvas");
        const r = new HeadzRenderer(canvas, { background: null, preserveDrawingBuffer: true, maxPixelRatio: 1, idle: false });
        r.resize(size, size);
        r.setFraming("portrait");
        const cfg = normalizeAvatar({ ...DEFAULT_AVATAR, ...j.cfg, version: 4 });
        r.setConfig(cfg);
        await r.whenReady();
        await poseSyntheticHands(r, cfg, j.scene, 1, { ms: 1200 });
        r.stop();
        // hide one hand (single-hand gestures)
        if (j.hide) {
          const scene = r.stage.scene;
          const holder = scene.getObjectByName(`hand${j.hide}Holder`);
          if (holder) holder.visible = false;
        }
        // still frame with the happy expression and a head tilt
        const I = r as unknown as Internals;
        await I.loading;
        I.current.fill(0);
        for (const [k, v] of Object.entries(j.expr)) {
          const i = (SHAPES as readonly string[]).indexOf(k);
          if (i >= 0) I.current[i] = v;
        }
        I.headPivot.quaternion.identity();
        I.root.rotation.set(j.pitch, j.yaw, j.roll, "YXZ");
        I.applyRig();
        I.renderer.render(I.scene, I.camera);
        const src = canvas.toDataURL("image/webp", quality);
        store[j.id] = src;
        out.push({ id: j.id, src });
        if (alive) setImgs([...out]);
        disposeSyntheticHands(r);
        r.dispose();
      }
      (window as unknown as { __decor: Record<string, string> }).__decor = store;
    })().catch((e) => {
      console.error(e);
      (window as unknown as { __decor: Record<string, string> }).__decor = {};
    });
    return () => {
      alive = false;
    };
  }, [size, quality, sp]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 8, background: "repeating-conic-gradient(#2a2a30 0 25%, #1f1f24 0 50%) 0 0 / 24px 24px" }}>
      {imgs.map((i) => (
        <figure key={i.id} style={{ margin: 0, color: "#aaa", fontSize: 11, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={i.src} width={size / 2} height={size / 2} alt="" />
          <figcaption>
            {i.id} · {Math.round((i.src.length * 3) / 4 / 1024)} KB
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <Gen />
    </Suspense>
  );
}
