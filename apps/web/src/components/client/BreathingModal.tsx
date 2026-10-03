"use client";

import { t as tt } from "@/lib/i18n";
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
      { get label() { return tt("Вдох"); }, seconds: 4, scale: 1 },
      { get label() { return tt("Пауза"); }, seconds: 4, scale: 1 },
      { get label() { return tt("Выдох"); }, seconds: 4, scale: 0.45 },
      { get label() { return tt("Пауза"); }, seconds: 4, scale: 0.45 },
    ],
    rounds: 5,
    get note() { return tt("Дышите носом, плечи опущены. Если задержка даётся тяжело, просто дышите в\u00a0своём ритме."); },
  },
  "478": {
    phases: [
      { get label() { return tt("Вдох носом"); }, seconds: 4, scale: 1 },
      { get label() { return tt("Задержка"); }, seconds: 7, scale: 1 },
      { get label() { return tt("Выдох ртом"); }, seconds: 8, scale: 0.45 },
    ],
    rounds: 4,
    get note() { return tt("Выдыхайте медленно, будто через трубочку. Четырёх кругов достаточно, при\u00a0головокружении остановитесь."); },
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
    <Modal open={open} onClose={onClose} title={tt("Дыхательная пауза")} width={460}>
      <div className={s.breathe}>
        <Segmented<Pattern>
          ariaLabel={tt("Техника дыхания")}
          value={pattern}
          onChange={(p) => {
            reset();
            setPattern(p);
          }}
          options={[
            { value: "box", label: tt("Квадрат 4-4-4-4") },
            { value: "478", label: tt("Техника 4-7-8") },
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
              <span className={s.phase}>{tt("Хорошо")}</span>
            ) : (
              <span className={s.phase}>{tt("Готовы?")}</span>
            )}
          </div>
        </div>

        <div className={s.rounds}>
          {running
            ? tt(`Круг {round} из\u00a0{rounds}`, { round, rounds: cfg.rounds })
            : done
              ? tt("Вы\u00a0сделали паузу. Возвращайтесь, когда захочется.")
              : tt(`{rounds} {plural}, около {minutes} {plural2}`, { rounds: cfg.rounds, plural: plural(cfg.rounds, "круг", "круга", "кругов"), minutes, plural2: plural(minutes, "минуты", "минут", "минут") })}
        </div>

        <p className={s.breatheNote}>{cfg.note}</p>

        {running ? (
          <Button variant="secondary" size="lg" block onClick={reset}>
            {tt("Остановить")}
          </Button>
        ) : (
          <Button variant="primary" size="lg" block onClick={start}>
            {done ? tt("Ещё раз") : tt("Начать")}
          </Button>
        )}
      </div>
    </Modal>
  );
}
