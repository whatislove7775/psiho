"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, CardHead, Skeleton, useToast } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { LoadError, Switch } from "@/components/pro/controls";
import {
  dayErrors,
  rulesToWeek,
  slotsInDay,
  slotsInWeek,
  TIME_OPTIONS,
  toHHMM,
  toMin,
  weekToRules,
  type DayPlan,
  type Range,
} from "@/components/pro/schedule";
import { cabinetApi } from "@/lib/api/endpoints";
import { plural, WEEKDAYS, WEEKDAYS_SHORT } from "@/lib/format";
import s from "@/components/pro/pro.module.css";
import c from "./schedule.module.css";

const LAST = toMin(TIME_OPTIONS[TIME_OPTIONS.length - 1]);
const key = (w: DayPlan[]) => JSON.stringify(weekToRules(w).map((r) => [r.weekday, r.start_time, r.end_time]).sort());
const clone = (w: DayPlan[]) => w.map((d) => ({ on: d.on, ranges: d.ranges.map((r) => ({ ...r })) }));

const TEMPLATES: { label: string; make: () => DayPlan[] }[] = [
  {
    label: "Будни 10–19",
    make: () => Array.from({ length: 7 }, (_, i) => ({ on: i < 5, ranges: i < 5 ? [{ from: "10:00", to: "19:00" }] : [] })),
  },
  {
    label: "Вечера 18–22",
    make: () => Array.from({ length: 7 }, (_, i) => ({ on: i < 5, ranges: i < 5 ? [{ from: "18:00", to: "22:00" }] : [] })),
  },
  { label: "Очистить", make: () => Array.from({ length: 7 }, () => ({ on: false, ranges: [] })) },
];

function nextRange(d: DayPlan): Range {
  if (!d.ranges.length) return { from: "10:00", to: "19:00" };
  const end = Math.max(...d.ranges.map((r) => toMin(r.to)));
  const from = Math.min(end + 60, LAST - 60);
  return { from: toHHMM(from), to: toHHMM(Math.min(from + 180, LAST)) };
}

export default function SchedulePage() {
  const toast = useToast();
  const [saved, setSaved] = useState<DayPlan[] | null>(null);
  const [week, setWeek] = useState<DayPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    cabinetApi
      .schedule()
      .then((rules) => {
        const w = rulesToWeek(rules);
        setSaved(w);
        setWeek(clone(w));
      })
      .catch((e) => setError(`${(e as Error).message} Обновите страницу, чтобы загрузить расписание.`));
  }, []);
  useEffect(load, [load]);

  const errors = useMemo(() => (week ? week.map((d) => (d.on ? dayErrors(d) : d.ranges.map(() => null))) : []), [week]);
  const hasErrors = errors.some((d) => d.some(Boolean));
  const dirty = !!week && !!saved && key(week) !== key(saved);
  const total = week ? slotsInWeek(week) : 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (i: number, fn: (d: DayPlan) => void) =>
    setWeek((w) => {
      if (!w) return w;
      const next = clone(w);
      fn(next[i]);
      return next;
    });

  const save = async () => {
    if (!week || hasErrors) return;
    setSaving(true);
    try {
      const rules = await cabinetApi.saveSchedule(weekToRules(week));
      const w = rulesToWeek(rules);
      setSaved(w);
      setWeek(clone(w));
      toast("Расписание сохранено");
    } catch (e) {
      toast(`${(e as Error).message} Изменения не потеряны, попробуйте сохранить ещё раз.`, { error: true });
    } finally {
      setSaving(false);
    }
  };

  const saveButton = (variant: "primary" | "white", block = false, className?: string) => (
    <Button className={className} variant={variant} size={block ? "lg" : "md"} block={block} loading={saving} disabled={!dirty || hasErrors} onClick={save}>
      Сохранить расписание
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Расписание"
        sub="Отметьте часы, когда готовы принимать. Каждый полный час в интервале станет слотом на 50 минут, ещё 10 минут остаются на перерыв."
        action={dirty || saving ? saveButton("primary", false, c.headSave) : undefined}
      />
      <WithRail rail={<WeekRail week={week} total={total} dirty={dirty} hasErrors={hasErrors} save={saveButton("white", true)} />}>
        {error && <LoadError text={error} onRetry={load} />}
        <Card as="section">
          <CardHead title="Неделя" sub="Повторяется каждую неделю. Уже оплаченные сессии остаются в силе" />
          <div className={c.templates}>
            <span className={c.templatesLabel}>Заполнить по шаблону</span>
            {TEMPLATES.map((t) => (
              <Button key={t.label} size="sm" variant={t.label === "Очистить" ? "ghost" : "secondary"} disabled={!week} onClick={() => setWeek(t.make())}>
                {t.label}
              </Button>
            ))}
          </div>
          {!week ? (
            <div className={c.days}>
              {WEEKDAYS.map((d) => (
                <Skeleton key={d} height={64} radius={18} />
              ))}
            </div>
          ) : (
            <div className={c.days}>
              {week.map((d, i) => {
                const n = slotsInDay(d);
                return (
                  <div key={i} className={c.day} data-off={!d.on || undefined}>
                    <div className={c.dayHead}>
                      <Switch
                        checked={d.on}
                        label={`${WEEKDAYS[i]}: ${d.on ? "рабочий день" : "выходной"}`}
                        onChange={(on) =>
                          update(i, (x) => {
                            x.on = on;
                            if (on && !x.ranges.length) x.ranges.push({ from: "10:00", to: "19:00" });
                          })
                        }
                      />
                      <div className={c.dayName}>
                        <span className={c.full}>{WEEKDAYS[i]}</span>
                        <span className={c.short}>{WEEKDAYS_SHORT[i]}</span>
                        <span className={c.daySlots}>{d.on ? `${n} ${plural(n, "слот", "слота", "слотов")}` : "Выходной"}</span>
                      </div>
                    </div>
                    {d.on && (
                      <div className={c.ranges}>
                        {d.ranges.map((r, j) => {
                          const err = errors[i]?.[j];
                          return (
                            <div key={j} className={c.rangeWrap}>
                              <div className={c.range} data-invalid={err ? true : undefined}>
                                <TimeSelect
                                  label={`${WEEKDAYS[i]}, интервал ${j + 1}, начало`}
                                  value={r.from}
                                  onChange={(v) => update(i, (x) => (x.ranges[j].from = v))}
                                />
                                <span className={c.dash} aria-hidden>
                                  –
                                </span>
                                <TimeSelect
                                  label={`${WEEKDAYS[i]}, интервал ${j + 1}, конец`}
                                  value={r.to}
                                  onChange={(v) => update(i, (x) => (x.ranges[j].to = v))}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  iconOnly
                                  aria-label={`Удалить интервал ${r.from}–${r.to}`}
                                  icon={<Trash2 size={16} />}
                                  onClick={() =>
                                    update(i, (x) => {
                                      x.ranges.splice(j, 1);
                                      if (!x.ranges.length) x.on = false;
                                    })
                                  }
                                />
                              </div>
                              {err && (
                                <div className={c.err} role="alert">
                                  {err}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button type="button" className={c.add} onClick={() => update(i, (x) => x.ranges.push(nextRange(x)))}>
                          <Plus size={16} aria-hidden />
                          Добавить интервал
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </WithRail>
      {(dirty || saving) && (
        <div className={c.sticky} role="region" aria-label="Несохранённые изменения">
          <span>{hasErrors ? "Есть ошибки" : "Не сохранено"}</span>
          {saveButton("primary")}
        </div>
      )}
    </>
  );
}

function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const opts = TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [...TIME_OPTIONS, value].sort();
  return (
    <select className={c.select} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {opts.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

const HOURS_FROM = 6;
const HOURS_TO = 24;

function WeekRail({
  week,
  total,
  dirty,
  hasErrors,
  save,
}: {
  week: DayPlan[] | null;
  total: number;
  dirty: boolean;
  hasErrors: boolean;
  save: React.ReactNode;
}) {
  if (!week) return <Skeleton height={420} radius={22} />;
  const span = (HOURS_TO - HOURS_FROM) * 60;
  const pos = (t: string) => Math.min(100, Math.max(0, ((toMin(t) - HOURS_FROM * 60) / span) * 100));
  const hours = total; // one slot per full hour
  return (
    <section className={s.accent} aria-label="Итог недели">
      <div className={s.accentKicker}>Слотов в неделю</div>
      <div>
        <div className={s.accentBig}>{total}</div>
        <div className={s.accentText} style={{ marginTop: 6 }}>
          {total
            ? `До ${hours} ${plural(hours, "сессии", "сессий", "сессий")} по 50 минут, если все слоты займут`
            : "Клиенты не смогут записаться, пока в неделе нет ни одного рабочего часа"}
        </div>
      </div>
      <div className={c.chart} aria-hidden>
        {week.map((d, i) => (
          <div key={i} className={c.chartRow}>
            <span className={c.chartDay}>{WEEKDAYS_SHORT[i]}</span>
            <span className={c.track}>
              {d.on &&
                d.ranges
                  .filter((r) => toMin(r.to) > toMin(r.from))
                  .map((r, j) => (
                    <span key={j} className={c.bar} style={{ left: `${pos(r.from)}%`, width: `${Math.max(0, pos(r.to) - pos(r.from))}%` }} />
                  ))}
            </span>
          </div>
        ))}
        <div className={c.chartRow}>
          <span />
          <span className={c.axis}>
            <span>6:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </span>
        </div>
      </div>
      <div className={c.saveState} data-dirty={dirty || undefined}>
        {hasErrors ? "Исправьте интервалы с ошибками, чтобы сохранить" : dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}
      </div>
      {(dirty || hasErrors) && save}
    </section>
  );
}
