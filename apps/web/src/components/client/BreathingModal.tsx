"use client";

import { useEffect, useState } from "react";
import { Button, Modal, Segmented } from "@/ui";
import { plural } from "@/lib/format";
import s from "./client.module.css";

type Pattern = "box" | "478";

interface Phase {
  label: string;
  seconds: number;
  /** orb scale at the END of the phase */
  scale: number;
}

const PATTERNS: Record<
  Pattern,
  { phases: Phase[]; rounds: number; note: string }
> = {
  box: {
    phases: [
      { label: "Вдох", seconds: 4, scale: 1 },
      { label: "Пауза", seconds: 4, scale: 1 },
      { label: "Выдох", seconds: 4, scale: 0.45 },
      { label: "Пауза", seconds: 4, scale: 0.45 },
    ],
    rounds: 5,
    note: "Дышите носом, плечи опущены. Если задержка даётся тяжело, просто дышите в своём ритме.",
  },
  "478": {
    phases: [
      { label: "Вдох носом", seconds: 4, scale: 1 },
      { label: "Задержка", seconds: 7, scale: 1 },
      { label: "Выдох ртом", seconds: 8, scale: 0.45 },
    ],
    rounds: 4,
    note: "Выдыхайте медленно, будто через трубочку. Четырёх кругов достаточно, при головокружении остановитесь.",
  },
};

interface Run {
  running: boolean;
  done: boolean;
  phase: number;
  left: number;
  round: number;
}
const IDLE: Run = { running: false, done: false, phase: 0, left: 0, round: 1 };

/** Pure step of the timer: one second passes. */
function tick(r: Run, cfg: { phases: Phase[]; rounds: number }): Run {
  if (!r.running) return r;
  if (r.left > 1) return { ...r, left: r.left - 1 };
  const next = r.phase + 1;
  if (next < cfg.phases.length)
    return { ...r, phase: next, left: cfg.phases[next].seconds };
  if (r.round >= cfg.rounds) return { ...IDLE, done: true };
  return { ...r, phase: 0, round: r.round + 1, left: cfg.phases[0].seconds };
}

/** Calm, self-paced breathing guide. Motion is off when the OS asks for reduced motion. */
export function BreathingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [pattern, setPattern] = useState<Pattern>("box");
  const [st, setSt] = useState<Run>(IDLE);
  const cfg = PATTERNS[pattern];
  const { running, done, phase, left, round } = st;
  const cur = cfg.phases[phase];

  const reset = () => setSt(IDLE);

  useEffect(() => {
    if (!open) setSt(IDLE);
  }, [open]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSt((prev) => tick(prev, cfg)), 1000);
    return () => clearInterval(t);
  }, [running, cfg]);

  const start = () =>
    setSt({
      running: true,
      done: false,
      phase: 0,
      round: 1,
      left: cfg.phases[0].seconds,
    });

  const scale = running ? cur.scale : 0.45;
  const duration = running ? cur.seconds : 0.6;
  const totalSec = cfg.rounds * cfg.phases.reduce((a, p) => a + p.seconds, 0);
  const minutes = Math.max(1, Math.round(totalSec / 60));

  return (
    <Modal open={open} onClose={onClose} title="Дыхательная пауза" width={460}>
      <div className={s.breathe}>
        <Segmented<Pattern>
          ariaLabel="Техника дыхания"
          value={pattern}
          onChange={(p) => {
            reset();
            setPattern(p);
          }}
          options={[
            { value: "box", label: "Квадрат 4-4-4-4" },
            { value: "478", label: "Техника 4-7-8" },
          ]}
        />

        <div className={s.stage} aria-live="polite">
          <span className={s.halo} aria-hidden />
          <span
            className={s.orb}
            aria-hidden
            style={{
              transform: `scale(${scale})`,
              transitionDuration: `${duration}s`,
            }}
          />
          <div className={s.orbText}>
            {running ? (
              <>
                <span className={s.phase}>{cur.label}</span>
                <span className={s.count}>{left}</span>
              </>
            ) : done ? (
              <span className={s.phase}>Хорошо</span>
            ) : (
              <span className={s.phase}>Готовы?</span>
            )}
          </div>
        </div>

        <div className={s.rounds}>
          {running
            ? `Круг ${round} из ${cfg.rounds}`
            : done
              ? "Вы сделали паузу. Возвращайтесь, когда захочется."
              : `${cfg.rounds} ${plural(cfg.rounds, "круг", "круга", "кругов")}, около ${minutes} ${plural(minutes, "минуты", "минут", "минут")}`}
        </div>

        <p className={s.breatheNote}>{cfg.note}</p>

        {running ? (
          <Button variant="secondary" size="lg" block onClick={reset}>
            Остановить
          </Button>
        ) : (
          <Button variant="primary" size="lg" block onClick={start}>
            {done ? "Ещё раз" : "Начать"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
