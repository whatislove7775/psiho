"use client";

/**
 * Internal QA page for the HEADZ avatars (404 in production).
 *   ?mode=expr&base=woman-light&hair=…   expressions of one config
 *   ?mode=bases                          every base, neutral
 *   ?mode=parts&base=…&slot=hair         every option of a slot on a base
 *   ?mode=random                         seeded random configs
 *   ?mode=gaze                           lookAt left/centre/right/up/down
 */
import { notFound, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DEFAULT_AVATAR, normalizeAvatar, randomAvatar, type AvatarConfig } from "@/lib/avatar/schema";
import { CATALOG, headzOptions } from "@/lib/avatar/headz/catalog";
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
  const bg = sp.get("bg") ?? "#e9e4f0";
  const [imgs, setImgs] = useState<{ label: string; src: string }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { HeadzRenderer } = await import("@/lib/avatar/headz/HeadzRenderer");
      const canvas = document.createElement("canvas");
      const r = new HeadzRenderer(canvas, { background: bg, preserveDrawingBuffer: true, maxPixelRatio: 1, idle: false });
      r.resize(size, size);
      r.setFraming((sp.get("framing") as "face" | "portrait") ?? "face");
      const q = Object.fromEntries(sp.entries());
      const one = normalizeAvatar({ ...DEFAULT_AVATAR, ...q, version: 3 });
      const jobs: { label: string; cfg: AvatarConfig; expr: Record<string, number>; look?: [number, number] }[] = [];
      if (mode === "bases") {
        for (const b of CATALOG.bases) jobs.push({ label: b.id, cfg: normalizeAvatar({ base: b.id }), expr: {} });
      } else if (mode === "parts") {
        const slot = (sp.get("slot") ?? "hair") as HeadzSlot;
        jobs.push({ label: "none", cfg: { ...one, [slot]: "none" }, expr: {} });
        for (const o of headzOptions(one.base, slot)) jobs.push({ label: `${slot} ${o.id}`, cfg: { ...one, [slot]: o.id }, expr: {} });
      } else if (mode === "random") {
        for (let i = 1; i <= 16; i++) {
          const cfg = randomAvatar(i * 7919);
          jobs.push({ label: `${i} ${cfg.base} ${cfg.hair}`, cfg, expr: {} });
        }
      } else if (mode === "gaze") {
        const pts: [string, number, number][] = [["left", -1, 0], ["centre", 0, 0], ["right", 1, 0], ["up", 0, -1], ["down", 0, 1]];
        for (const [l, x, y] of pts) jobs.push({ label: `cursor ${l}`, cfg: one, expr: {}, look: [x, y] });
      } else {
        for (const [l, e] of EXPR) jobs.push({ label: l, cfg: one, expr: e });
      }
      const out: { label: string; src: string }[] = [];
      for (const j of jobs) {
        r.setConfig(j.cfg);
        if (j.look) {
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
          await r.renderOnceAsync(yaw);
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
  }, [mode, size, yaw, sp, bg]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 6, background: "#1b1b1f" }}>
      {imgs.map((i) => (
        <figure key={i.label} style={{ margin: 0, color: "#aaa", fontSize: 11, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={i.src} width={size} height={size} alt="" style={{ borderRadius: 10 }} />
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
