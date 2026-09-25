"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardHead, Input, Segmented, Skeleton, useToast } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { LoadError, Switch } from "@/components/pro/controls";
import {
  dayErrors,
  emptyWeek,
  isBlocking,
  minutesInDay,
  minutesInWeek,
  sessionsInDay,
  templateToWeek,
  toMin,
  weekToDays,
  type DayPlan,
} from "@/components/pro/schedule";
import { WeekTimeline } from "@/components/pro/availability/WeekTimeline";
import { RangesEditor } from "@/components/pro/availability/RangesEditor";
import { OverridesCalendar } from "@/components/pro/availability/OverridesCalendar";
import { PriceCard, SessionRules, utcOffset, zoneName, type RulesDraft } from "@/components/pro/availability/BookingRules";
import { availabilityApi, durationLabel, type AvailabilitySettings } from "@/lib/api/availability";
import { plural, WEEKDAYS, WEEKDAYS_SHORT } from "@/lib/format";
import s from "@/components/pro/pro.module.css";
import c from "./schedule.module.css";
import { CalendarSparkle, illSize } from "@/components/illustrations";

interface TemplateDraft {
  valid_from: string | null;
  valid_until: string | null;
  week: DayPlan[];
}
interface Draft {
  rules: RulesDraft;
  templates: TemplateDraft[];
}
type Tab = "week" | "days" | "rules";

const cloneWeek = (w: DayPlan[]) => w.map((d) => ({ on: d.on, ranges: d.ranges.map((r) => ({ ...r })) }));
const cloneDraft = (d: Draft): Draft => ({
  rules: { ...d.rules, durations: [...d.rules.durations] },
  templates: d.templates.map((t) => ({ ...t, week: cloneWeek(t.week) })),
});

function fromServer(a: AvailabilitySettings): Draft {
  const templates = a.templates.length
    ? a.templates.map((t) => ({ valid_from: t.valid_from, valid_until: t.valid_until, week: templateToWeek(t) }))
    : [{ valid_from: null, valid_until: null, week: emptyWeek() }];
  // постоянное расписание (без дат) — первым
  templates.sort((x, y) => (x.valid_from ?? "").localeCompare(y.valid_from ?? ""));
  return {
    rules: {
      time_zone: a.time_zone,
      min_duration: a.min_duration,
      max_duration: a.max_duration,
      durations: [...a.durations],
      buffer_minutes: a.buffer_minutes,
      min_notice_minutes: a.min_notice_minutes,
      horizon_days: a.horizon_days,
      start_step_minutes: a.start_step_minutes,
      hourly_rate_rub: a.hourly_rate_rub,
    },
    templates,
  };
}

const keyOf = (d: Draft) =>
  JSON.stringify({
    r: { ...d.rules, durations: [...d.rules.durations].sort((a, b) => a - b) },
    t: d.templates.map((t) => [t.valid_from || null, t.valid_until || null, weekToDays(t.week)]),
  });

const QUICK: { label: string; make: () => DayPlan[] }[] = [
  {
    label: "Будни 10–19",
    make: () => Array.from({ length: 7 }, (_, i) => ({ on: i < 5, ranges: i < 5 ? [{ from: "10:00", to: "19:00" }] : [] })),
  },
  {
    label: "Будни 10–14 и 16–20",
    make: () =>
      Array.from({ length: 7 }, (_, i) => ({
        on: i < 5,
        ranges: i < 5 ? [{ from: "10:00", to: "14:00" }, { from: "16:00", to: "20:00" }] : [],
      })),
  },
  {
    label: "Вечера 18–22",
    make: () => Array.from({ length: 7 }, (_, i) => ({ on: i < 5, ranges: i < 5 ? [{ from: "18:00", to: "22:00" }] : [] })),
  },
];

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
};
function templateLabel(t: TemplateDraft): string {
  if (!t.valid_from && !t.valid_until) return "Постоянное";
  if (t.valid_from && t.valid_until) return `${fmtDate(t.valid_from)} – ${fmtDate(t.valid_until)}`;
  if (t.valid_from) return `С ${fmtDate(t.valid_from)}`;
  return `До ${fmtDate(t.valid_until!)}`;
}
function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function SchedulePage() {
  const toast = useToast();
  const [server, setServer] = useState<AvailabilitySettings | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState<Tab>("week");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const apply = (a: AvailabilitySettings) => {
    const d = fromServer(a);
    setServer(a);
    setSaved(d);
    setDraft(cloneDraft(d));
    setActive((i) => Math.min(i, d.templates.length - 1));
  };

  const load = useCallback(() => {
    setError(null);
    availabilityApi
      .get()
      .then(apply)
      .catch((e) => setError(`${(e as Error).message} Обновите страницу, чтобы загрузить расписание.`));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "days" || t === "rules" || t === "week") setTab(t);
  }, []);

  const minDuration = draft
    ? Math.min(...draft.rules.durations.filter((d) => d >= draft.rules.min_duration && d <= draft.rules.max_duration), draft.rules.max_duration)
    : 50;
  const template = draft?.templates[Math.min(active, (draft?.templates.length ?? 1) - 1)];
  const week = template?.week ?? null;

  const errors = useMemo(
    () => (week ? week.map((d) => (d.on ? dayErrors(d, minDuration) : d.ranges.map(() => null))) : []),
    [week, minDuration],
  );
  const allErrors = useMemo(
    () =>
      draft
        ? draft.templates.some((t) => t.week.some((d) => d.on && dayErrors(d, minDuration).some(isBlocking)))
        : false,
    [draft, minDuration],
  );
  const periodError =
    template && template.valid_from && template.valid_until && template.valid_until < template.valid_from
      ? "Дата окончания раньше даты начала"
      : null;
  const priceError =
    draft && (draft.rules.hourly_rate_rub < 500 || draft.rules.hourly_rate_rub > 200000) ? "От 500 до 200 000 ₽ за час" : null;
  const hasErrors =
    allErrors ||
    !!priceError ||
    (draft?.templates.some((t) => t.valid_from && t.valid_until && t.valid_until < t.valid_from) ?? false);
  const dirty = !!draft && !!saved && keyOf(draft) !== keyOf(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (fn: (d: Draft) => void) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneDraft(prev);
      fn(next);
      return next;
    });
  const setWeek = (w: DayPlan[]) => edit((d) => (d.templates[active].week = cloneWeek(w)));
  const updateDay = (i: number, fn: (x: DayPlan) => void) => edit((d) => fn(d.templates[active].week[i]));

  const save = async () => {
    if (!draft || hasErrors) return;
    setSaving(true);
    try {
      const res = await availabilityApi.save({
        ...draft.rules,
        templates: draft.templates.map((t) => ({
          valid_from: t.valid_from || null,
          valid_until: t.valid_until || null,
          days: weekToDays(t.week),
        })),
      });
      apply(res);
      setReloadKey((k) => k + 1);
      toast("Расписание сохранено");
    } catch (e) {
      toast(`${(e as Error).message} Изменения не потеряны, попробуйте сохранить ещё раз.`, { error: true });
    } finally {
      setSaving(false);
    }
  };

  const saveButton = (variant: "primary" | "white", block = false, className?: string) => (
    <Button
      className={className}
      variant={variant}
      size={block ? "lg" : "md"}
      block={block}
      loading={saving}
      disabled={!dirty || hasErrors}
      onClick={save}
    >
      Сохранить расписание
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Расписание"
        sub="Задайте постоянные часы приёма, меняйте отдельные дни вручную и выбирайте, сколько может длиться созвон. Клиенты увидят только то время, куда помещается выбранная длительность."
        action={dirty || saving ? saveButton("primary", false, c.headSave) : undefined}
      />
      <WithRail
        rail={
          <WeekRail
            draft={draft}
            week={week}
            minDuration={minDuration}
            dirty={dirty}
            hasErrors={hasErrors}
            save={saveButton("white", true)}
          />
        }
      >
        {error && <LoadError text={error} onRetry={load} />}
        <div className={c.tabs}>
          <Segmented<Tab>
            ariaLabel="Раздел расписания"
            value={tab}
            onChange={setTab}
            options={[
              { value: "week", label: "Неделя" },
              { value: "days", label: "Календарь" },
              { value: "rules", label: "Длительность и цена" },
            ]}
          />
        </div>

        {tab === "week" && (
          <Card as="section">
            <CardHead
              title="Недельное расписание"
              sub="Повторяется каждую неделю. Уже оплаченные созвоны остаются в силе"
            />
            {!draft || !week || !template ? (
              <div className={c.days}>
                {WEEKDAYS.map((d) => (
                  <Skeleton key={d} height={64} radius={18} />
                ))}
              </div>
            ) : (
              <>
                <div className={c.periods} role="group" aria-label="Расписания по периодам">
                  {draft.templates.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      className={c.period}
                      aria-pressed={i === active}
                      onClick={() => setActive(i)}
                    >
                      <CalendarRange size={15} aria-hidden />
                      {templateLabel(t)}
                    </button>
                  ))}
                  {draft.templates.length < 12 && (
                    <button
                      type="button"
                      className={c.periodAdd}
                      onClick={() => {
                        edit((d) =>
                          d.templates.push({ valid_from: nextMonday(), valid_until: null, week: cloneWeek(week) }),
                        );
                        setActive(draft.templates.length);
                      }}
                    >
                      <Plus size={15} aria-hidden />
                      Расписание на период
                    </button>
                  )}
                </div>

                {(draft.templates.length > 1 || template.valid_from || template.valid_until) && (
                  <div className={c.periodEdit}>
                    <Input
                      type="date"
                      label="Действует с"
                      value={template.valid_from ?? ""}
                      onChange={(e) => edit((d) => (d.templates[active].valid_from = e.target.value || null))}
                      hint="Пусто — без начала"
                    />
                    <Input
                      type="date"
                      label="По"
                      value={template.valid_until ?? ""}
                      min={template.valid_from ?? undefined}
                      onChange={(e) => edit((d) => (d.templates[active].valid_until = e.target.value || null))}
                      error={periodError ?? undefined}
                      hint="Пусто — бессрочно"
                    />
                    {draft.templates.length > 1 && (
                      <Button
                        variant="ghost"
                        icon={<Trash2 size={16} />}
                        onClick={() => {
                          edit((d) => d.templates.splice(active, 1));
                          setActive(0);
                        }}
                      >
                        Удалить
                      </Button>
                    )}
                    <p className={c.periodNote}>
                      Если периоды пересекаются, действует расписание, которое начинается позже. Так летнее расписание с 1 июня
                      временно заменит постоянное
                    </p>
                  </div>
                )}

                <div className={c.templates}>
                  <span className={c.templatesLabel}>Заполнить по шаблону</span>
                  {QUICK.map((t) => (
                    <Button key={t.label} size="sm" variant="secondary" onClick={() => setWeek(t.make())}>
                      {t.label}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setWeek(emptyWeek())}>
                    Очистить
                  </Button>
                </div>

                <WeekTimeline week={week} onChange={setWeek} minDuration={minDuration} />

                <div className={c.days}>
                  {week.map((d, i) => {
                    const n = sessionsInDay(d, minDuration, draft.rules.buffer_minutes);
                    const mins = minutesInDay(d);
                    return (
                      <div key={i} className={c.day} data-off={!d.on || undefined}>
                        <div className={c.dayHead}>
                          <Switch
                            checked={d.on}
                            label={`${WEEKDAYS[i]}: ${d.on ? "рабочий день" : "выходной"}`}
                            onChange={(on) =>
                              updateDay(i, (x) => {
                                x.on = on;
                                if (on && !x.ranges.length) x.ranges.push({ from: "10:00", to: "19:00" });
                              })
                            }
                          />
                          <div className={c.dayName}>
                            <span className={c.full}>{WEEKDAYS[i]}</span>
                            <span className={c.short}>{WEEKDAYS_SHORT[i]}</span>
                            <span className={c.daySlots}>
                              {d.on
                                ? `${hoursLabel(mins)}, до ${n} ${plural(n, "созвона", "созвонов", "созвонов")}`
                                : "Выходной"}
                            </span>
                          </div>
                        </div>
                        {d.on && (
                          <RangesEditor
                            ranges={d.ranges}
                            errors={errors[i] ?? []}
                            label={WEEKDAYS[i]}
                            onChange={(ranges) =>
                              updateDay(i, (x) => {
                                x.ranges = ranges;
                                if (!ranges.length) x.on = false;
                              })
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        )}

        {tab === "days" && <OverridesCalendar minDuration={minDuration} stale={dirty} reloadKey={reloadKey} />}

        {tab === "rules" &&
          (!draft || !server ? (
            <Skeleton height={420} radius={22} />
          ) : (
            <>
              <SessionRules draft={draft.rules} options={server.options} onChange={(p) => edit((d) => Object.assign(d.rules, p))} />
              <PriceCard
                draft={draft.rules}
                feePercent={server.platform_fee_percent}
                error={priceError}
                onChange={(p) => edit((d) => Object.assign(d.rules, p))}
              />
            </>
          ))}
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

function hoursLabel(min: number): string {
  const h = min / 60;
  const text = Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", ",");
  return `${text} ${plural(Math.ceil(h), "час", "часа", "часов")}`;
}

const HOURS_FROM = 6;
const HOURS_TO = 24;

function WeekRail({
  draft,
  week,
  minDuration,
  dirty,
  hasErrors,
  save,
}: {
  draft: Draft | null;
  week: DayPlan[] | null;
  minDuration: number;
  dirty: boolean;
  hasErrors: boolean;
  save: React.ReactNode;
}) {
  if (!draft || !week) return <Skeleton height={420} radius={22} />;
  const span = (HOURS_TO - HOURS_FROM) * 60;
  const pos = (t: string) => Math.min(100, Math.max(0, ((toMin(t) - HOURS_FROM * 60) / span) * 100));
  const minutes = minutesInWeek(week);
  const sessions = week.reduce((n, d) => n + sessionsInDay(d, minDuration, draft.rules.buffer_minutes), 0);
  const r = draft.rules;
  const offered = r.durations.filter((d) => d >= r.min_duration && d <= r.max_duration);
  return (
    <section className={s.accent} aria-label="Итог недели">
      <div className={s.accentKicker}>Часов приёма в неделю</div>
      <div>
        <div className={s.accentBig}>{hoursLabel(minutes).split(" ")[0]}</div>
        <div className={s.accentText} style={{ marginTop: 6 }}>
          {minutes
            ? `До ${sessions} ${plural(sessions, "созвона", "созвонов", "созвонов")} по ${durationLabel(minDuration)}${
                r.buffer_minutes ? ` с перерывом ${r.buffer_minutes} мин` : ""
              }, если всё займут`
            : "Клиенты не смогут записаться, пока в неделе нет ни одного рабочего часа"}
        </div>
      </div>
      {!minutes && <CalendarSparkle className={illSize.sm} />}
      <div className={c.chart} aria-hidden>
        {week.map((d, i) => (
          <div key={i} className={c.chartRow}>
            <span className={c.chartDay}>{WEEKDAYS_SHORT[i]}</span>
            <span className={c.track}>
              {d.on &&
                d.ranges
                  .filter((x) => toMin(x.to) > toMin(x.from))
                  .map((x, j) => (
                    <span key={j} className={c.bar} style={{ left: `${pos(x.from)}%`, width: `${Math.max(0, pos(x.to) - pos(x.from))}%` }} />
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
      <ul className={s.accentList}>
        <li className={s.accentRow}>
          <span>Длительность</span>
          <span>
            {offered.length > 1
              ? `${durationLabel(offered[0])} – ${durationLabel(offered[offered.length - 1])}`
              : durationLabel(offered[0] ?? r.min_duration)}
          </span>
        </li>
        <li className={s.accentRow}>
          <span>Час работы</span>
          <span>{new Intl.NumberFormat("ru-RU").format(r.hourly_rate_rub || 0)} ₽</span>
        </li>
        <li className={s.accentRow}>
          <span>Время</span>
          <span>
            {zoneName(r.time_zone)}, {utcOffset(r.time_zone)}
          </span>
        </li>
      </ul>
      <div className={c.saveState} data-dirty={dirty || undefined}>
        {hasErrors ? "Исправьте ошибки, чтобы сохранить" : dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}
      </div>
      {(dirty || hasErrors) && save}
    </section>
  );
}
