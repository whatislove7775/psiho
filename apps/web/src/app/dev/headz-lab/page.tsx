"use client";

/**
 * Internal QA page for the HEADZ avatars (404 in production).
 *   ?mode=expr&base=woman-light&hair=…   expressions of one config
 *   ?mode=bases                          every base, neutral
 *   ?mode=parts&base=…&slot=hair         every option of a slot on a base
 *   ?mode=fit&base=…&slot=hair[&all=1]   every option the studio offers on a base (all=1: also the rejected ones, marked ✕)
 *   ?mode=random                         seeded random configs
 *   ?mode=gaze                           lookAt left/centre/right/up/down
 *   ?mode=hands&base=…                   «synthetic hands»: floating hands posed from synthetic landmarks
 *                                        (open, fist, thumbs-up, peace, pointing) — lib/avatar/headz/hands
 */
import { notFound, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DEFAULT_AVATAR, normalizeAvatar, randomAvatar, type AvatarConfig } from "@/lib/avatar/schema";
import { CATALOG, fitGate, fitsBase, headzOptions, headzOptionsAll } from "@/lib/avatar/headz/catalog";
import type { HeadzSlot } from "@/lib/avatar/headz/types";

const EXPR: [string, Record<string, number>][] = [
  ["neutral", {}],
  ["smile", { mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.5, cheekSquintRight: 0.5 }],
  ["open", { jawOpen: 0.8 }],
  ["surprise", { jawOpen: 0.5, browInnerUp: 1, browOuterUpLeft: 0.8, browOuterUpRight: 0.8, eyeWideLeft: 0.8, eyeWideRight: 0.8 }],
  ["blink", { eyeBlinkLeft: 1, eyeBlinkRight: 1 }],
  ["wink L", { eyeBlinkLeft: 1, mouthSmileLeft: 0.7 }],
  ["pucker", { mouthPucker: 1 }],
  ["frown", { mouthFrownLeft: 0.9, mouthFrownRight: 0.9, browDownLeft: 0.9, browDownRight: 0.9 }],
  ["funnel", { mouthFunnel: 0.9, jawOpen: 0.3 }],
  ["laugh", { mouthSmileLeft: 1, mouthSmileRight: 1, jawOpen: 0.45, mouthUpperUpLeft: 0.5, mouthUpperUpRight: 0.5, eyeSquintLeft: 0.6, eyeSquintRight: 0.6 }],
  ["puff", { cheekPuff: 1, mouthClose: 0.3 }],
  ["tongue", { jawOpen: 0.5, tongueOut: 1 }],
  ["look L(avatar)", { eyeLookOutLeft: 1, eyeLookInRight: 1 }],
  ["look up", { eyeLookUpLeft: 1, eyeLookUpRight: 1 }],
];

function Lab() {
  const sp = useSearchParams();
  const mode = sp.get("mode") ?? "expr";
  const size = Number(sp.get("size") ?? 240);
  const yaw = Number(sp.get("yaw") ?? 0);
  const pitch = Number(sp.get("pitch") ?? 0);
  const bg = sp.get("bg") ?? "#e9e4f0";
  const [imgs, setImgs] = useState<{ label: string; src: string }[]>([]);
  // &crop=2.4 → close-up of the eye region (scaled around the eyes, half-height tiles)
  const crop = Number(sp.get("crop") ?? 0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { HeadzRenderer } = await import("@/lib/avatar/headz/HeadzRenderer");
      const canvas = document.createElement("canvas");
      const r = new HeadzRenderer(canvas, { background: bg, preserveDrawingBuffer: true, maxPixelRatio: 1, idle: false });
      r.resize(size, size);
      r.setFraming((sp.get("framing") as "face" | "portrait") ?? (mode === "hands" ? "portrait" : "face"));
      const q = Object.fromEntries(sp.entries());
      let extra: Record<string, unknown> = {};
      try {
        extra = q.cfg ? JSON.parse(q.cfg) : {};
      } catch {
        /* ignore */
      }
      const one = normalizeAvatar({ ...DEFAULT_AVATAR, ...q, ...extra, version: 4 });
      const jobs: { label: string; cfg: AvatarConfig; expr: Record<string, number>; look?: [number, number]; hands?: number; track?: Record<string, number> }[] = [];
      if (mode === "bases") {
        for (const b of CATALOG.bases) jobs.push({ label: b.id, cfg: normalizeAvatar({ ...q, ...extra, version: 4, base: b.id }), expr: q.jaw ? { jawOpen: Number(q.jaw) } : {} });
      } else if (mode === "parts") {
        const slot = (sp.get("slot") ?? "hair") as HeadzSlot;
        jobs.push({ label: "none", cfg: { ...one, [slot]: "none" }, expr: {} });
        for (const o of headzOptions(one.base, slot)) jobs.push({ label: `${slot} ${o.id}`, cfg: { ...one, [slot]: o.id }, expr: {} });
      } else if (mode === "fit") {
        const slot = (sp.get("slot") ?? "hair") as HeadzSlot;
        const all = sp.get("all") === "1";
        const base = sp.get("base") ?? one.base;
        const plain = normalizeAvatar({ version: 4, base, hair: slot === "hair" ? "none" : undefined });
        fitGate.on = true; // (effects run twice in dev)
        const opts = headzOptionsAll(base, slot, all).map((o) => ({ ...o, ok: fitsBase(base, slot, o.qid) }));
        fitGate.on = !all;
        for (const o of opts) jobs.push({ label: `${o.ok ? "" : "✕ "}${o.qid}`, cfg: { ...plain, [slot]: o.qid }, expr: {} });
      } else if (mode === "random") {
        for (let i = 1; i <= 16; i++) {
          const cfg = randomAvatar(i * 7919);
          jobs.push({ label: `${i} ${cfg.base} ${cfg.hair}`, cfg, expr: {} });
        }
      } else if (mode === "hands") {
        const { LAB_HAND_SCENES } = await import("@/lib/avatar/headz/hands/labSynth");
        LAB_HAND_SCENES.forEach((h, i) => jobs.push({ label: h.label, cfg: one, expr: {}, hands: i }));
      } else if (mode === "gazegrid") {
        // 9 gaze directions × several bases: both irises must point the same way, on the sphere
        const { gazeWeights } = await import("@/lib/avatar/headz/gaze");
        const dirs: [string, number, number][] = [["↖", -0.8, 0.8], ["↑", 0, 1], ["↗", 0.8, 0.8], ["←", -1, 0], ["•", 0, 0], ["→", 1, 0], ["↙", -0.8, -0.8], ["↓", 0, -1], ["↘", 0.8, -0.8]];
        const bases = (sp.get("bases") ?? "woman-light,man-medium,girl-dark,oldman-light").split(",");
        for (const b of bases)
          for (const [l, h, v] of dirs)
            jobs.push({
              label: `${b} ${l}`,
              cfg: normalizeAvatar({ ...one, base: b, hair: q.hair ?? "none", beard: "none" }),
              // &blink=0.6 → eyes closing while looking there (lids must close from their followed position)
              expr: { ...(gazeWeights(h, v) as Record<string, number>), ...(q.blink ? { eyeBlinkLeft: Number(q.blink), eyeBlinkRight: Number(q.blink) } : {}) },
            });
      } else if (mode === "track") {
        const T: [string, Record<string, number>][] = [
          ["raw: L out .8, R still", { eyeLookOutLeft: 0.8, eyeLookInRight: 0.05 }],
          ["raw: L up, R down", { eyeLookUpLeft: 0.6, eyeLookDownRight: 0.3 }],
          ["raw: blink .35/.15", { eyeBlinkLeft: 0.35, eyeBlinkRight: 0.15 }],
          ["raw: wink", { eyeBlinkLeft: 0.95, eyeBlinkRight: 0.05, mouthSmileLeft: 0.6 }],
          ["raw: look down", { eyeLookDownLeft: 0.8, eyeLookDownRight: 0.7 }],
          ["raw: jaw open", { jawOpen: 0.8 }],
        ];
        for (const [l, t] of T) jobs.push({ label: l, cfg: one, expr: {}, track: t });
      } else if (mode === "gaze") {
        const pts: [string, number, number][] = [["left", -1, 0], ["centre", 0, 0], ["right", 1, 0], ["up", 0, -1], ["down", 0, 1]];
        for (const [l, x, y] of pts) jobs.push({ label: `cursor ${l}`, cfg: one, expr: {}, look: [x, y] });
      } else {
        const only = sp.get("only")?.split(",");
        for (const [l, e] of EXPR) if (!only || only.includes(l)) jobs.push({ label: l, cfg: one, expr: e });
      }
      const out: { label: string; src: string }[] = [];
      for (const j of jobs) {
        r.setConfig(j.cfg);
        if (j.hands !== undefined) {
          const { LAB_HAND_SCENES, poseSyntheticHands } = await import("@/lib/avatar/headz/hands/labSynth");
          await poseSyntheticHands(r, j.cfg, LAB_HAND_SCENES[j.hands]);
        } else if (j.track) {
          // the live path: tracked blendshapes (MediaPipe names, un-mirrored) → applyFaceResult
          r.setIdle(false);
          r.start();
          await r.whenReady();
          const cats = Object.entries(j.track).map(([k, v]) => ({
            categoryName: k.includes("Left") ? k.replace("Left", "Right") : k.replace("Right", "Left"),
            score: v,
          }));
          for (let f = 0; f < 20; f++) {
            r.applyFaceResult({ faceBlendshapes: [{ categories: cats }] } as never);
            r.renderNow();
            await new Promise((res) => setTimeout(res, 30));
          }
          r.stop();
          r.start();
          r.applyFaceResult({ faceBlendshapes: [{ categories: cats }] } as never);
          r.renderNow();
        } else if (j.look) {
          // same path as the landing: lookAt → idle animation turns head and eyes
          r.setExpression({});
          r.setIdle(true);
          r.lookAt(j.look[0], j.look[1]);
          r.start();
          await r.whenReady();
          await new Promise((res) => setTimeout(res, 1200));
        } else {
          r.stop();
          r.setExpression(j.expr);
          await r.renderOnceAsync(yaw, pitch);
        }
        out.push({ label: j.label, src: canvas.toDataURL("image/png") });
        if (alive) setImgs([...out]);
      }
      (window as unknown as { __labDone: boolean }).__labDone = true;
    })().catch((e) => {
      console.error(e);
      (window as unknown as { __labDone: boolean }).__labDone = true;
    });
    return () => {
      alive = false;
    };
  }, [mode, size, yaw, pitch, sp, bg]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 6, background: "#1b1b1f" }}>
      {imgs.map((i) => (
        <figure key={i.label} style={{ margin: 0, color: "#aaa", fontSize: 11, textAlign: "center" }}>
          <div style={crop ? { width: size, height: size * 0.5, overflow: "hidden", borderRadius: 10 } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={i.src}
              width={size}
              height={size}
              alt=""
              style={
                crop
                  ? { transform: `scale(${crop})`, transformOrigin: `50% ${sp.get("cy") ?? 50}%`, marginTop: -size * (Number(sp.get("cy") ?? 50) / 100) + size * 0.25 }
                  : { borderRadius: 10 }
              }
            />
          </div>
          <figcaption>{i.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <Lab />
    </Suspense>
  );
}
