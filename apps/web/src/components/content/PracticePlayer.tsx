"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import type { BreathPattern, Practice } from "@/lib/api/content";
import { Button } from "@/ui";
import { plural } from "@/lib/format";
import s from "./practice.module.css";

interface Phase {
  label: string;
  seconds: number;
  /** circle scale at the END of the phase */
  scale: number;
}

function phasesOf(p: BreathPattern): Phase[] {
  const out: Phase[] = [{ label: "Вдох", seconds: p.inhale, scale: 0.84 }];
  if (p.hold) out.push({ label: "Пауза", seconds: p.hold, scale: 0.84 });
  out.push({ label: "Выдох", seconds: p.exhale, scale: 0.46 });
  if (p.hold_after) out.push({ label: "Пауза", seconds: p.hold_after, scale: 0.46 });
  return out;
}

interface Run {
  running: boolean;
  done: boolean;
  phase: number;
  cycle: number;
  left: number;
}

/** Pure timer step: one second passes. */
function tick(r: Run, phases: Phase[], cycles: number): Run {
  if (!r.running) return r;
  if (r.left > 1) return { ...r, left: r.left - 1 };
  const next = r.phase + 1;
  if (next < phases.length) return { ...r, phase: next, left: phases[next].seconds };
  if (r.cycle >= cycles) return { ...r, running: false, done: true };
  return { ...r, phase: 0, cycle: r.cycle + 1, left: phases[0].seconds };
}

/** Animated breathing circle driven by a pattern (seconds per phase). */
export function BreathingCircle({ pattern, tone }: { pattern: BreathPattern; tone: string }) {
  const phases = useMemo(() => phasesOf(pattern), [pattern]);
  const init = (): Run => ({ running: false, done: false, phase: 0, cycle: 1, left: phases[0].seconds });
  const [st, setSt] = useState<Run>(init);
  const { running, done, phase, cycle, left } = st;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSt((r) => tick(r, phases, pattern.cycles)), 1000);
    return () => clearInterval(t);
  }, [running, phases, pattern.cycles]);

  const reset = () => setSt(init());
  const setRunning = (f: (r: boolean) => boolean) => setSt((r) => ({ ...r, running: f(r.running) }));

  const cur = phases[phase];
  const idle = !running && !done && phase === 0 && cycle === 1 && left === phases[0].seconds;
  // While running, the circle transitions toward the phase's end scale over its duration
  const scale = idle || done ? 0.6 : cur.scale;
  const duration = running ? cur.seconds : 0.6;

  return (
    <div className={s.breath}>
      <div className={s.stage} aria-hidden>
        <span className={s.halo} data-tone={tone} style={{ transform: `scale(${scale * 1.18})`, transitionDuration: `${duration}s` }} />
        <span className={s.circle} data-tone={tone} style={{ transform: `scale(${scale})`, transitionDuration: `${duration}s` }} />
        <span className={s.stageText}>
          {done ? (
            <>
              <strong>Готово</strong>
              <span>Как вы сейчас?</span>
            </>
          ) : idle ? (
            <>
              <strong>{pattern.cycles} {plural(pattern.cycles, "цикл", "цикла", "циклов")}</strong>
              <span>
                {phases.map((p) => p.seconds).join(" · ")} сек
              </span>
            </>
          ) : (
            <>
              <strong>{cur.label}</strong>
              <span className={s.count}>{left}</span>
            </>
          )}
        </span>
      </div>
      <p className={s.srOnly} aria-live="polite">
        {running ? `${cur.label}, ${cur.seconds} секунд` : done ? "Практика завершена" : ""}
      </p>
      <div className={s.controls}>
        {!done && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => setRunning((r) => !r)}
            icon={running ? <Pause size={18} strokeWidth={2} /> : <Play size={18} strokeWidth={2} />}
          >
            {running ? "Пауза" : idle ? "Начать" : "Продолжить"}
          </Button>
        )}
        {!idle && (
          <Button variant="secondary" size="lg" onClick={reset} icon={<RotateCcw size={18} strokeWidth={1.8} />}>
            {done ? "Ещё раз" : "Сначала"}
          </Button>
        )}
      </div>
      {!idle && !done && (
        <div className={s.cycles}>
          Цикл {cycle} из {pattern.cycles}
        </div>
      )}
    </div>
  );
}

/** Step-by-step walkthrough; steps with `seconds` get a gentle timer. */
export function StepPlayer({ practice }: { practice: Practice }) {
  const steps = practice.steps;
  const [i, setI] = useState(-1); // -1 = intro
  const [left, setLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const done = i >= steps.length;
  const step = i >= 0 && !done ? steps[i] : null;

  useEffect(() => {
    setLeft(step?.seconds ?? 0);
    setPaused(false);
    if (i >= 0) cardRef.current?.focus({ preventScroll: true });
  }, [i, step?.seconds]);

  useEffect(() => {
    if (!step?.seconds || paused || left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, paused, step?.seconds]);

  if (!steps.length) return null;

  if (i < 0) {
    return (
      <div className={s.player}>
        <ol className={s.outline}>
          {steps.map((st, k) => (
            <li key={k}>
              <span className={s.outlineNum}>{k + 1}</span>
              <span>
                <strong>{st.title || `Шаг ${k + 1}`}</strong>
                <span>{st.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className={s.controls} style={{ justifyContent: "flex-start" }}>
          <Button variant="primary" size="lg" onClick={() => setI(0)} icon={<Play size={18} strokeWidth={2} />}>
            Пройти по шагам
          </Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={s.player}>
        <div className={s.stepCard} ref={cardRef} tabIndex={-1}>
          <span className={s.doneIcon} data-tone={practice.cover} aria-hidden>
            <Check size={28} strokeWidth={2.4} />
          </span>
          <h2 className={s.stepTitle}>Вы прошли практику</h2>
          <p className={s.stepText}>
            Отметьте, как вы себя чувствуете сейчас. Даже небольшое изменение — уже результат. Практики работают лучше, если
            возвращаться к ним регулярно.
          </p>
        </div>
        <div className={s.controls} style={{ justifyContent: "flex-start" }}>
          <Button variant="secondary" size="lg" onClick={() => setI(0)} icon={<RotateCcw size={18} strokeWidth={1.8} />}>
            Пройти ещё раз
          </Button>
        </div>
      </div>
    );
  }

  const total = step!.seconds ?? 0;
  const pct = total ? ((total - left) / total) * 100 : 0;

  return (
    <div className={s.player}>
      <div className={s.progress} aria-hidden>
        {steps.map((_, k) => (
          <span key={k} data-state={k < i ? "done" : k === i ? "current" : undefined} />
        ))}
      </div>
      <div className={s.stepCard} ref={cardRef} tabIndex={-1} aria-live="polite">
        <span className={s.stepNum}>
          Шаг {i + 1} из {steps.length}
        </span>
        <h2 className={s.stepTitle}>{step!.title || `Шаг ${i + 1}`}</h2>
        <p className={s.stepText}>{step!.text}</p>
        {total > 0 && (
          <div className={s.timer}>
            <div className={s.timerBar}>
              <span style={{ width: `${pct}%` }} data-tone={practice.cover} />
            </div>
            <span className={s.timerText}>
              {left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Можно дальше"}
            </span>
            {left > 0 && (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={paused ? "Продолжить таймер" : "Пауза таймера"}
                onClick={() => setPaused((p) => !p)}
                icon={paused ? <Play size={16} /> : <Pause size={16} />}
              />
            )}
          </div>
        )}
      </div>
      <div className={s.controls} style={{ justifyContent: "space-between" }}>
        <Button variant="secondary" size="lg" onClick={() => setI(i - 1)} icon={<ChevronLeft size={18} strokeWidth={1.8} />}>
          Назад
        </Button>
        <Button variant="primary" size="lg" onClick={() => setI(i + 1)}>
          {i === steps.length - 1 ? "Завершить" : "Дальше"}
          <ChevronRight size={18} strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}
