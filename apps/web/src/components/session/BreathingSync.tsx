"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui";

const CYCLE = [
  { label: "Вдох", dur: 4000, from: 1, to: 1.55 },
  { label: "Задержка", dur: 4000, from: 1.55, to: 1.55 },
  { label: "Выдох", dur: 6000, from: 1.55, to: 1 },
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
            background: "radial-gradient(circle, rgba(58,109,240,0.55), rgba(58,109,240,0.12) 70%)",
            boxShadow: "0 0 0 1px rgba(58,109,240,0.5)",
            transform: `scale(${scale})`,
          }}
        />
      </div>
      <div style={{ textAlign: "center" }} aria-live="polite">
        <div style={{ fontSize: "var(--t-24)", fontWeight: 650 }}>{active ? CYCLE[phase].label : "Дыхательная пауза"}</div>
        <div style={{ fontSize: "var(--t-13)", color: "var(--c-muted)", marginTop: 4 }}>
          Вдох на 4 счёта, задержка на 4, выдох на 6. Помогает снизить тревогу.
        </div>
      </div>
      <Button variant={active ? "secondary" : "primary"} onClick={() => setActive((a) => !a)}>
        {active ? "Остановить" : "Начать"}
      </Button>
    </div>
  );
}
