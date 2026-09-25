/** Weekly schedule helpers shared by /pro and /pro/schedule. */
import type { ScheduleRule } from "@/lib/api/types";
import type { TimeRange, WeeklyTemplate } from "@/lib/api/availability";

export interface Range {
  from: string; // "HH:MM" (end may be "24:00")
  to: string;
}
export interface DayPlan {
  on: boolean;
  ranges: Range[];
}

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** 00:00 … 24:00 every 30 minutes. */
export const TIME_OPTIONS = Array.from({ length: 49 }, (_, i) => toHHMM(i * 30));

/** Legacy metric for the overview: one 50-minute session per full hour. */
export const slotsInRange = (r: Range) => Math.max(0, Math.floor((toMin(r.to) - toMin(r.from)) / 60));

export const slotsInDay = (d: DayPlan) => (d.on ? d.ranges.reduce((n, r) => n + slotsInRange(r), 0) : 0);

export const slotsInWeek = (week: DayPlan[]) => week.reduce((n, d) => n + slotsInDay(d), 0);

/** Working minutes in a day / week (only valid ranges). */
export const minutesInDay = (d: DayPlan) =>
  d.on ? d.ranges.reduce((n, r) => n + Math.max(0, toMin(r.to) - toMin(r.from)), 0) : 0;
export const minutesInWeek = (week: DayPlan[]) => week.reduce((n, d) => n + minutesInDay(d), 0);

/** How many sessions of `duration` (+ buffer between them) fit into one day's ranges. */
export function sessionsInDay(d: DayPlan, duration: number, buffer: number): number {
  if (!d.on) return 0;
  return d.ranges.reduce((n, r) => {
    const len = toMin(r.to) - toMin(r.from);
    return len < duration ? n : n + 1 + Math.floor((len - duration) / (duration + buffer));
  }, 0);
}

export const emptyWeek = (): DayPlan[] => Array.from({ length: 7 }, () => ({ on: false, ranges: [] }));

export function rulesToWeek(rules: ScheduleRule[]): DayPlan[] {
  const week = emptyWeek();
  for (const r of rules) {
    const d = week[r.weekday];
    if (!d) continue;
    d.on = true;
    d.ranges.push({ from: r.start_time.slice(0, 5), to: r.end_time.slice(0, 5) });
  }
  for (const d of week) d.ranges.sort((a, b) => toMin(a.from) - toMin(b.from));
  return week;
}

export function weekToRules(week: DayPlan[]): ScheduleRule[] {
  const out: ScheduleRule[] = [];
  week.forEach((d, weekday) => {
    if (!d.on) return;
    for (const r of d.ranges) out.push({ weekday, start_time: r.from, end_time: r.to });
  });
  return out;
}

export function templateToWeek(t: WeeklyTemplate): DayPlan[] {
  return Array.from({ length: 7 }, (_, i) => {
    const ranges = (t.days[i] ?? []).map((r) => ({ from: r.start, to: r.end }));
    ranges.sort((a, b) => toMin(a.from) - toMin(b.from));
    return { on: ranges.length > 0, ranges };
  });
}

export function weekToDays(week: DayPlan[]): TimeRange[][] {
  return week.map((d) =>
    d.on ? [...d.ranges].sort((a, b) => toMin(a.from) - toMin(b.from)).map((r) => ({ start: r.from, end: r.to })) : [],
  );
}

/** Per-range error text (or null) for one day. `minDuration` — the shortest session the specialist offers. */
export function dayErrors(d: DayPlan, minDuration = 50): (string | null)[] {
  return d.ranges.map((r, i) => {
    if (toMin(r.to) <= toMin(r.from)) return "Конец должен быть позже начала";
    for (let j = 0; j < d.ranges.length; j++) {
      if (j === i) continue;
      const o = d.ranges[j];
      if (toMin(r.from) < toMin(o.to) && toMin(o.from) < toMin(r.to)) {
        return `Пересекается с интервалом ${o.from}–${o.to}. Сдвиньте время или удалите один из них`;
      }
    }
    if (toMin(r.to) - toMin(r.from) < minDuration) return `Короче самой короткой сессии (${minDuration} мин), запись сюда не попадёт`;
    return null;
  });
}

/** Errors that block saving (short ranges are only a warning). */
export const isBlocking = (err: string | null) => !!err && !err.startsWith("Короче");

/** Merge overlapping or touching ranges (used by the visual editor). */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].filter((r) => toMin(r.to) > toMin(r.from)).sort((a, b) => toMin(a.from) - toMin(b.from));
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && toMin(r.from) <= toMin(last.to)) {
      if (toMin(r.to) > toMin(last.to)) last.to = r.to;
    } else out.push({ ...r });
  }
  return out;
}

/** Monday-based weekday index for a date (0 = понедельник). */
export const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;
