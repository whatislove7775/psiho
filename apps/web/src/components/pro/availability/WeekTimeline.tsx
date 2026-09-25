"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { WEEKDAYS, WEEKDAYS_SHORT } from "@/lib/format";
import { mergeRanges, toHHMM, toMin, type DayPlan, type Range } from "@/components/pro/schedule";
import c from "./availability.module.css";

const SNAP = 30;
const EDGE_PX = 10;

type Mode = "create" | "move" | "start" | "end";
interface Drag {
  day: number;
  mode: Mode;
  index: number;
  anchor: number; // minute where the pointer went down
  orig: Range;
  moved: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const snap = (m: number) => Math.round(m / SNAP) * SNAP;

/**
 * Visual weekly editor: drag on a free part of a day to add hours, drag a block to move it,
 * drag its edges to resize, × removes it. Overlapping blocks merge. The list editor below
 * edits the same data and is the keyboard-friendly alternative.
 */
export function WeekTimeline({
  week,
  onChange,
  minDuration,
}: {
  week: DayPlan[];
  onChange: (next: DayPlan[]) => void;
  minDuration: number;
}) {
  const earliest = Math.min(
    6 * 60,
    ...week.flatMap((d) => (d.on ? d.ranges.map((r) => Math.floor(toMin(r.from) / 60) * 60) : [])),
  );
  const from = clamp(earliest, 0, 6 * 60);
  const to = 24 * 60;
  const span = to - from;
  const hours = span / 60;

  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<{ day: number; index: number; range: Range } | null>(null);
  const tracks = useRef<(HTMLDivElement | null)[]>([]);

  const minuteAt = (day: number, clientX: number) => {
    const el = tracks.current[day];
    if (!el) return from;
    const rect = el.getBoundingClientRect();
    return clamp(from + ((clientX - rect.left) / rect.width) * span, from, to);
  };
  const pct = (m: number) => ((m - from) / span) * 100;

  const commit = (day: number, ranges: Range[]) => {
    const next = week.map((d) => ({ on: d.on, ranges: d.ranges.map((r) => ({ ...r })) }));
    next[day] = { on: ranges.length > 0, ranges: mergeRanges(ranges) };
    onChange(next);
  };

  const onDown = (day: number, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const m = minuteAt(day, e.clientX);
    const d = week[day];
    const ranges = d.on ? d.ranges : [];
    const barEl = (e.target as HTMLElement).closest<HTMLElement>("[data-bar]");
    let mode: Mode = "create";
    let index = -1;
    if (barEl) {
      index = Number(barEl.dataset.bar);
      const rect = barEl.getBoundingClientRect();
      mode = e.clientX - rect.left < EDGE_PX ? "start" : rect.right - e.clientX < EDGE_PX ? "end" : "move";
    }
    const orig = index >= 0 ? ranges[index] : { from: toHHMM(snap(m)), to: toHHMM(snap(m)) };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ day, mode, index, anchor: m, orig, moved: false });
    setPreview(null);
  };

  const rangeFor = (dr: Drag, m: number): Range => {
    const a = toMin(dr.orig.from);
    const b = toMin(dr.orig.to);
    if (dr.mode === "create") {
      const lo = snap(Math.min(dr.anchor, m));
      const hi = snap(Math.max(dr.anchor, m));
      return { from: toHHMM(lo), to: toHHMM(Math.max(hi, lo + SNAP)) };
    }
    if (dr.mode === "start") return { from: toHHMM(clamp(snap(m), 0, b - SNAP)), to: dr.orig.to };
    if (dr.mode === "end") return { from: dr.orig.from, to: toHHMM(clamp(snap(m), a + SNAP, 24 * 60)) };
    const delta = snap(m - dr.anchor);
    const shift = clamp(delta, -a, 24 * 60 - b);
    return { from: toHHMM(a + shift), to: toHHMM(b + shift) };
  };

  const onMove = (day: number, e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || drag.day !== day) return;
    const m = minuteAt(day, e.clientX);
    const moved = drag.moved || Math.abs(m - drag.anchor) >= SNAP / 2;
    if (moved !== drag.moved) setDrag({ ...drag, moved });
    if (moved) setPreview({ day, index: drag.index, range: rangeFor(drag, m) });
  };

  const onUp = (day: number, e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || drag.day !== day) return;
    const ranges = week[day].on ? week[day].ranges.map((r) => ({ ...r })) : [];
    if (drag.moved && preview) {
      if (drag.index >= 0) ranges[drag.index] = preview.range;
      else ranges.push(preview.range);
      commit(day, ranges);
    } else if (drag.mode === "create") {
      // a click adds a block long enough for the shortest session
      const len = Math.max(60, Math.ceil(minDuration / SNAP) * SNAP);
      const start = clamp(Math.floor(drag.anchor / SNAP) * SNAP, 0, 24 * 60 - len);
      ranges.push({ from: toHHMM(start), to: toHHMM(start + len) });
      commit(day, ranges);
    }
    setDrag(null);
    setPreview(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const cancel = () => {
    setDrag(null);
    setPreview(null);
  };

  const remove = (day: number, index: number) => {
    const ranges = week[day].ranges.filter((_, i) => i !== index);
    commit(day, ranges);
  };

  const ticks = [];
  for (let h = Math.ceil(from / 60); h <= 24; h += from <= 120 ? 4 : 3) ticks.push(h);

  return (
    <div className={c.tl}>
      <div className={c.tlHint}>Проведите по дню, чтобы добавить часы. Блок можно двигать и растягивать за края</div>
      <div className={c.tlGrid}>
        {week.map((d, day) => {
          const ranges = d.on ? d.ranges : [];
          const shown = ranges
            .map((r, i) => (preview && preview.day === day && preview.index === i ? preview.range : r))
            .map((r, i) => ({ r, i }));
          const creating = preview && preview.day === day && preview.index < 0 ? preview.range : null;
          return (
            <div key={day} className={c.tlRow}>
              <span className={c.tlDay} title={WEEKDAYS[day]}>
                {WEEKDAYS_SHORT[day]}
              </span>
              <div
                ref={(el) => {
                  tracks.current[day] = el;
                }}
                className={c.tlTrack}
                data-dragging={drag?.day === day || undefined}
                style={{ backgroundSize: `${100 / hours}% 100%` }}
                onPointerDown={(e) => onDown(day, e)}
                onPointerMove={(e) => onMove(day, e)}
                onPointerUp={(e) => onUp(day, e)}
                onPointerCancel={cancel}
                aria-label={`${WEEKDAYS[day]}: ${ranges.length ? ranges.map((r) => `${r.from}–${r.to}`).join(", ") : "выходной"}`}
                role="group"
              >
                {shown.map(({ r, i }) => {
                  const a = Math.max(toMin(r.from), from);
                  const b = toMin(r.to);
                  if (b <= a) return null;
                  const width = pct(b) - pct(a);
                  return (
                    <div
                      key={i}
                      data-bar={i}
                      className={c.tlBar}
                      data-short={b - a < minDuration || undefined}
                      style={{ left: `${pct(a)}%`, width: `${width}%` }}
                      title={`${r.from}–${r.to}`}
                    >
                      <span className={c.tlLabel} data-narrow={width < 16 || undefined}>
                        {r.from.replace(/^0/, "")}–{r.to.replace(/^0/, "")}
                      </span>
                      <button
                        type="button"
                        className={c.tlRemove}
                        aria-label={`Убрать ${WEEKDAYS[day].toLowerCase()} ${r.from}–${r.to}`}
                        onClick={() => remove(day, i)}
                      >
                        <X size={12} strokeWidth={2.4} />
                      </button>
                    </div>
                  );
                })}
                {creating && (
                  <div
                    className={c.tlBar}
                    data-ghost
                    style={{ left: `${pct(toMin(creating.from))}%`, width: `${pct(toMin(creating.to)) - pct(toMin(creating.from))}%` }}
                  >
                    <span className={c.tlLabel}>
                      {creating.from.replace(/^0/, "")}–{creating.to.replace(/^0/, "")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className={c.tlRow} aria-hidden>
          <span />
          <div className={c.tlAxis}>
            {ticks.map((h, i) => (
              <span key={h} data-minor={i % 2 === 1 || undefined} style={{ left: `${pct(h * 60)}%` }}>
                {h}:00
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
