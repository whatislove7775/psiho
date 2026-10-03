"use client";

import { t as tt } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui";

const CYCLE = [
  { get label() { return tt("Вдох"); }, dur: 4000, from: 1, to: 1.55 },
  { get label() { return tt("Задержка"); }, dur: 4000, from: 1.55, to: 1.55 },
  { get label() { return tt("Выдох"); }, dur: 6000, from: 1.55, to: 1 },
] as const;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

/** Paced breathing 4–4–6: a growing/shrinking circle with the phase label. */
export function BreathingSync() {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState(0);
  const [scale, setScale] = useState(1);
  const raf = useRef(0);

  useEffect(() => {
    if (!active) {
      setScale(1);
      setPhase(0);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let idx = 0;
    let start = performance.now();
    const step = (now: number) => {
      const cur = CYCLE[idx];
      const p = Math.min(1, (now - start) / cur.dur);
      if (!reduce) setScale(cur.from + (cur.to - cur.from) * ease(p));
      if (p >= 1) {
        idx = (idx + 1) % CYCLE.length;
        start = now;
        setPhase(idx);
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [active]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, padding: "12px 0" }}>
      <div style={{ width: 200, height: 200, display: "grid", placeItems: "center" }}>
        <div
          aria-hidden
          style={{
            width: 110,
            height: 110,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(122,140,255,0.6), rgba(106,79,232,0.14) 70%)",
            boxShadow: "0 0 0 1px rgba(122,140,255,0.5)",
            transform: `scale(${scale})`,
          }}
        />
      </div>
      <div style={{ textAlign: "center" }} aria-live="polite">
        <div style={{ fontSize: "var(--t-24)", fontWeight: 650 }}>{active ? CYCLE[phase].label : tt("Дыхательная пауза")}</div>
        <div style={{ fontSize: "var(--t-13)", color: "var(--c-muted)", marginTop: 4 }}>
          {tt("Вдох на\u00a04\u00a0счёта, задержка на\u00a04, выдох на\u00a06. Помогает снизить тревогу.")}
        </div>
      </div>
      <Button variant={active ? "secondary" : "primary"} onClick={() => setActive((a) => !a)}>
        {active ? tt("Остановить") : tt("Начать")}
      </Button>
    </div>
  );
}
