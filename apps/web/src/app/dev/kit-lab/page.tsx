"use client";

/** Internal QA page for the sculpted avatar kit (404 in production). */
import { notFound, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DEFAULT_AVATAR, normalizeAvatar, randomAvatar, type AvatarConfig } from "@/lib/avatar/schema";

const EXPR: [string, Record<string, number>][] = [
  ["neutral", {}],
  ["smile", { mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.5, cheekSquintRight: 0.5 }],
  ["open", { jawOpen: 0.8 }],
  ["surprise", { jawOpen: 0.5, browInnerUp: 1, browOuterUpLeft: 0.8, browOuterUpRight: 0.8, eyeWideLeft: 0.8, eyeWideRight: 0.8 }],
  ["blink", { eyeBlinkLeft: 1, eyeBlinkRight: 1 }],
  ["wink", { eyeBlinkLeft: 1, mouthSmileLeft: 0.7 }],
  ["pucker", { mouthPucker: 1 }],
  ["frown", { mouthFrownLeft: 0.9, mouthFrownRight: 0.9, browDownLeft: 0.9, browDownRight: 0.9 }],
  ["funnel", { mouthFunnel: 0.9, jawOpen: 0.3 }],
  ["laugh", { mouthSmileLeft: 1, mouthSmileRight: 1, jawOpen: 0.45, mouthUpperUpLeft: 0.5, mouthUpperUpRight: 0.5, eyeSquintLeft: 0.6, eyeSquintRight: 0.6 }],
  ["puff", { cheekPuff: 1, mouthClose: 0.3 }],
  ["sneer", { noseSneerLeft: 1, noseSneerRight: 1, mouthUpperUpLeft: 0.4 }],
];

function Lab() {
  const sp = useSearchParams();
  const mode = sp.get("mode") ?? "expr";
  const size = Number(sp.get("size") ?? 260);
  const yaw = Number(sp.get("yaw") ?? 0);
  const [imgs, setImgs] = useState<{ label: string; src: string }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { KitRenderer } = await import("@/lib/avatar/kit/KitRenderer");
      const canvas = document.createElement("canvas");
      const r = new KitRenderer(canvas, { background: "#e9e4f0", preserveDrawingBuffer: true, maxPixelRatio: 1, idle: false });
      r.resize(size, size);
      r.setFraming((sp.get("framing") as "face" | "portrait") ?? "face");
      const jobs: { label: string; cfg: AvatarConfig; expr: Record<string, number> }[] = [];
      if (mode === "shapes") {
        const shapes = ["round", "oval", "square", "heart", "long", "wide"] as const;
        for (const s of shapes) jobs.push({ label: s, cfg: normalizeAvatar({ ...DEFAULT_AVATAR, head: { ...DEFAULT_AVATAR.head, shape: s } }), expr: {} });
        const noses = ["button", "straight", "wide", "pointed", "round", "long", "hooked"] as const;
        for (const n of noses) jobs.push({ label: `nose ${n}`, cfg: normalizeAvatar({ ...DEFAULT_AVATAR, nose: { ...DEFAULT_AVATAR.nose, shape: n } }), expr: {} });
      } else if (mode === "random") {
        for (let i = 1; i <= 12; i++) { const cfg = randomAvatar(i * 7919); jobs.push({ label: `${i} ${cfg.hair.style}`, cfg, expr: {} }); }
      } else {
        const base = normalizeAvatar({ ...DEFAULT_AVATAR, hair: { ...DEFAULT_AVATAR.hair, style: (sp.get("hair") as never) ?? "bob" } });
        for (const [l, e] of EXPR) jobs.push({ label: l, cfg: base, expr: e });
      }
      const out: { label: string; src: string }[] = [];
      for (const j of jobs) {
        r.setConfig(j.cfg);
        r.setExpression(j.expr);
        await r.renderOnceAsync(yaw);
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
  }, [mode, size, yaw, sp]);

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
