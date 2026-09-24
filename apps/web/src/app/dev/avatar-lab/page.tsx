"use client";

/** Internal visual QA page for the avatar engine (not linked; 404 in production). */
import { notFound, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DEFAULT_AVATAR, HAIR_STYLES, normalizeAvatar, randomAvatar, type AvatarConfig } from "@/lib/avatar/schema";

function Lab() {
  const sp = useSearchParams();
  const mode = sp.get("mode") ?? "grid";
  const size = Number(sp.get("size") ?? 220);
  const [imgs, setImgs] = useState<{ label: string; src: string }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { renderAvatarSnapshot } = await import("@/lib/avatar/engine/snapshot");
      const list: { label: string; cfg: AvatarConfig; expr?: Record<string, number>; framing?: "face" | "portrait" }[] = [];
      if (mode === "hair") {
        for (const h of HAIR_STYLES) list.push({ label: h, cfg: normalizeAvatar({ ...DEFAULT_AVATAR, hair: { ...DEFAULT_AVATAR.hair, style: h } }) });
      } else if (mode === "expr") {
        const E: [string, Record<string, number>][] = [
          ["neutral", {}],
          ["smile", { mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.4, cheekSquintRight: 0.4 }],
          ["open", { jawOpen: 0.75 }],
          ["surprise", { jawOpen: 0.45, browInnerUp: 1, browOuterUpLeft: 0.8, browOuterUpRight: 0.8, eyeWideLeft: 0.8, eyeWideRight: 0.8 }],
          ["blink", { eyeBlinkLeft: 1, eyeBlinkRight: 1 }],
          ["wink", { eyeBlinkLeft: 1, mouthSmileLeft: 0.6 }],
          ["pucker", { mouthPucker: 0.9 }],
          ["frown", { mouthFrownLeft: 0.8, mouthFrownRight: 0.8, browDownLeft: 0.8, browDownRight: 0.8 }],
          ["funnel", { mouthFunnel: 0.8, jawOpen: 0.3 }],
          ["teeth", { mouthSmileLeft: 1, mouthSmileRight: 1, mouthUpperUpLeft: 0.6, mouthUpperUpRight: 0.6, jawOpen: 0.15 }],
          ["look", { eyeLookOutLeft: 0.8, eyeLookInRight: 0.8 }],
          ["puff", { cheekPuff: 0.9, mouthClose: 0.5 }],
        ];
        for (const [l, e] of E) list.push({ label: l, cfg: DEFAULT_AVATAR, expr: e });
      } else if (mode === "one") {
        const raw = sp.get("cfg");
        list.push({ label: "cfg", cfg: normalizeAvatar(raw ? JSON.parse(raw) : DEFAULT_AVATAR), framing: (sp.get("framing") as "face" | "portrait") ?? "portrait" });
      } else {
        list.push({ label: "default", cfg: DEFAULT_AVATAR });
        for (let i = 1; i < 12; i++) list.push({ label: `seed ${i}`, cfg: randomAvatar(i * 7919) });
      }
      const out: { label: string; src: string }[] = [];
      for (const it of list) {
        const t0 = performance.now();
        const src = await renderAvatarSnapshot(it.cfg, { size, framing: it.framing ?? (mode === "one" ? "portrait" : "face"), expression: it.expr, yaw: Number(sp.get("yaw") ?? 0) });
        out.push({ label: `${it.label} ${Math.round(performance.now() - t0)}ms`, src });
        if (alive) setImgs([...out]);
      }
      (window as unknown as { __labDone: boolean }).__labDone = true;
    })();
    return () => {
      alive = false;
    };
  }, [mode, size, sp]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 8, background: "#1b1b1f" }}>
      {imgs.map((i) => (
        <figure key={i.label} style={{ margin: 0, color: "#aaa", fontSize: 11, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={i.src} width={size} height={size} alt="" style={{ background: "#2a2a30", borderRadius: 12 }} />
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
