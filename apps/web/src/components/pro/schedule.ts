/** Weekly schedule helpers shared by /pro and /pro/schedule. */
import type { ScheduleRule } from "@/lib/api/types";

export interface Range {
  from: string; // "HH:MM"
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

/** 00:00 … 23:30 every 30 minutes (end of day is "23:30" — the backend stores times, not 24:00). */
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => toHHMM(i * 30));

/** Each full hour within a range is one 50-minute slot (plus a 10-minute break). */
export const slotsInRange = (r: Range) => Math.max(0, Math.floor((toMin(r.to) - toMin(r.from)) / 60));

export const slotsInDay = (d: DayPlan) => (d.on ? d.ranges.reduce((n, r) => n + slotsInRange(r), 0) : 0);

export const slotsInWeek = (week: DayPlan[]) => week.reduce((n, d) => n + slotsInDay(d), 0);

export function rulesToWeek(rules: ScheduleRule[]): DayPlan[] {
  const week: DayPlan[] = Array.from({ length: 7 }, () => ({ on: false, ranges: [] }));
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

/** Per-range error text (or null) for one day. */
export function dayErrors(d: DayPlan): (string | null)[] {
  return d.ranges.map((r, i) => {
    if (toMin(r.to) <= toMin(r.from)) return "Конец должен быть позже начала";
    if (toMin(r.to) - toMin(r.from) < 60) return "Слишком коротко: нужен хотя бы час на одну сессию";
    for (let j = 0; j < d.ranges.length; j++) {
      if (j === i) continue;
      const o = d.ranges[j];
      if (toMin(r.from) < toMin(o.to) && toMin(o.from) < toMin(r.to)) {
        return `Пересекается с интервалом ${o.from}–${o.to}. Сдвиньте время или удалите один из них`;
      }
    }
    return null;
  });
}

/** Monday-based weekday index for a date (0 = понедельник). */
export const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;
