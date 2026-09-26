"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, Select } from "@/ui";
import { TIME_OPTIONS, toHHMM, toMin, type Range } from "@/components/pro/schedule";
import c from "./availability.module.css";

export function nextRange(ranges: Range[]): Range {
  if (!ranges.length) return { from: "10:00", to: "19:00" };
  const end = Math.max(...ranges.map((r) => toMin(r.to)));
  const from = Math.min(end + 60, 24 * 60 - 60);
  return { from: toHHMM(from), to: toHHMM(Math.min(from + 180, 24 * 60)) };
}

/** List of "10:00 – 14:00" pickers for one day with delete and "add interval". */
export function RangesEditor({
  ranges,
  errors,
  label,
  onChange,
}: {
  ranges: Range[];
  errors: (string | null)[];
  label: string;
  onChange: (next: Range[]) => void;
}) {
  const set = (j: number, patch: Partial<Range>) => onChange(ranges.map((r, i) => (i === j ? { ...r, ...patch } : r)));
  return (
    <div className={c.ranges}>
      {ranges.map((r, j) => {
        const err = errors[j];
        const warn = err?.startsWith("Короче");
        return (
          <div key={j} className={c.rangeWrap}>
            <div className={c.range} data-invalid={err && !warn ? true : undefined} data-warn={warn || undefined}>
              <TimeSelect label={`${label}, интервал ${j + 1}, начало`} value={r.from} onChange={(v) => set(j, { from: v })} />
              <span className={c.dash} aria-hidden>
                –
              </span>
              <TimeSelect label={`${label}, интервал ${j + 1}, конец`} value={r.to} onChange={(v) => set(j, { to: v })} />
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                aria-label={`Удалить интервал ${r.from}–${r.to}`}
                icon={<Trash2 size={16} />}
                onClick={() => onChange(ranges.filter((_, i) => i !== j))}
              />
            </div>
            {err && (
              <div className={warn ? c.warn : c.err} role={warn ? undefined : "alert"}>
                {err}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className={c.add} onClick={() => onChange([...ranges, nextRange(ranges)])}>
        <Plus size={16} aria-hidden />
        Добавить интервал
      </button>
    </div>
  );
}

export function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const opts = TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [...TIME_OPTIONS, value].sort();
  return (
    <Select size="sm" className={c.select} value={value} aria-label={label} onChange={onChange} options={opts.map((t) => ({ value: t, label: t }))} />
  );
}
