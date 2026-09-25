"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarOff, ChevronLeft, ChevronRight, Palmtree, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHead, Input, Modal, Skeleton, useToast } from "@/ui";
import { LoadError, Switch } from "@/components/pro/controls";
import { dayErrors, isBlocking, type Range } from "@/components/pro/schedule";
import { availabilityApi, type CalendarDay, type TimeOff } from "@/lib/api/availability";
import { plural, WEEKDAYS, WEEKDAYS_SHORT } from "@/lib/format";
import { RangesEditor } from "./RangesEditor";
import c from "./availability.module.css";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monthTitle = (d: Date) => {
  const s = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const dayTitle = (s: string) => {
  const d = parse(s);
  return `${WEEKDAYS[(d.getDay() + 6) % 7]}, ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`;
};
const short = (t: string) => t.replace(/^0/, "").replace(/:00$/, "");
const periodLabel = (a: string, b: string) => {
  const fa = parse(a).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const fb = parse(b).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return a === b ? fa : `${fa} – ${fb}`;
};

/** Month calendar of real days: tap a day to change its hours or close it; vacations below. */
export function OverridesCalendar({
  minDuration,
  stale,
  reloadKey,
}: {
  minDuration: number;
  /** the weekly template has unsaved edits — the calendar shows the saved one */
  stale: boolean;
  reloadKey: number;
}) {
  const toast = useToast();
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [today, setToday] = useState<string>(iso(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<CalendarDay | null>(null);
  const [timeOff, setTimeOff] = useState<TimeOff[] | null>(null);

  const gridStart = useMemo(() => addDays(month, -((month.getDay() + 6) % 7)), [month]);

  const load = useCallback(() => {
    setError(null);
    availabilityApi
      .calendar(iso(gridStart), iso(addDays(gridStart, 41)))
      .then((r) => {
        setDays(r.days);
        setToday(r.today);
      })
      .catch((e) => setError((e as Error).message));
    availabilityApi
      .timeOff()
      .then(setTimeOff)
      .catch(() => setTimeOff([]));
  }, [gridStart]);
  useEffect(load, [load, reloadKey]);

  const now = new Date();
  const minMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const maxMonth = new Date(now.getFullYear(), now.getMonth() + 12, 1);

  return (
    <Card as="section">
      <CardHead
        title="Особые дни и отпуск"
        sub="Нажмите на день, чтобы изменить часы только в эту дату или сделать его выходным"
      />
      {stale && (
        <div className={c.staleNote} role="status">
          Недельное расписание изменено, но не сохранено. Календарь покажет его после сохранения
        </div>
      )}
      <div className={c.calHead}>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label="Предыдущий месяц"
          icon={<ChevronLeft size={18} />}
          disabled={month <= minMonth}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        />
        <h3 className={c.calTitle} aria-live="polite">
          {monthTitle(month)}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label="Следующий месяц"
          icon={<ChevronRight size={18} />}
          disabled={month >= maxMonth}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        />
      </div>
      {error && <LoadError text={error} onRetry={load} />}
      <div className={c.cal} role="grid" aria-label={`Календарь, ${monthTitle(month)}`}>
        {WEEKDAYS_SHORT.map((w) => (
          <div key={w} className={c.calWd} role="columnheader">
            {w}
          </div>
        ))}
        {!days
          ? Array.from({ length: 42 }, (_, i) => <Skeleton key={i} height={64} radius={14} />)
          : days.map((d) => {
              const date = parse(d.date);
              const out = date.getMonth() !== month.getMonth();
              const past = d.date < today;
              const state = d.source === "time_off" ? "vacation" : d.ranges.length ? "work" : "off";
              const summary =
                state === "vacation"
                  ? "Отпуск"
                  : state === "off"
                    ? "Выходной"
                    : `${short(d.ranges[0].start)}–${short(d.ranges[0].end)}${d.ranges.length > 1 ? ` +${d.ranges.length - 1}` : ""}`;
              return (
                <button
                  key={d.date}
                  type="button"
                  role="gridcell"
                  className={c.calDay}
                  data-state={state}
                  data-out={out || undefined}
                  data-today={d.date === today || undefined}
                  disabled={past}
                  onClick={() => setOpen(d)}
                  aria-label={`${dayTitle(d.date)}: ${summary}${d.has_override ? ", изменён вручную" : ""}${
                    d.sessions.length ? `, ${d.sessions.length} ${plural(d.sessions.length, "созвон", "созвона", "созвонов")}` : ""
                  }`}
                >
                  <span className={c.calNum}>{date.getDate()}</span>
                  <span className={c.calSum}>{summary}</span>
                  <span className={c.calMarks} aria-hidden>
                    {d.has_override && <span className={c.markEdit} />}
                    {d.sessions.length > 0 && <span className={c.markBooked}>{d.sessions.length}</span>}
                  </span>
                </button>
              );
            })}
      </div>
      <div className={c.legend} aria-hidden>
        <span data-k="work">Приём</span>
        <span data-k="off">Выходной</span>
        <span data-k="vacation">Отпуск</span>
        <span data-k="edit">Изменён вручную</span>
        <span data-k="booked">Есть записи</span>
      </div>

      <TimeOffList
        items={timeOff}
        today={today}
        onChanged={() => {
          load();
        }}
      />

      <DayModal
        day={open}
        minDuration={minDuration}
        timeOff={timeOff ?? []}
        onClose={() => setOpen(null)}
        onSaved={(msg) => {
          setOpen(null);
          toast(msg);
          load();
        }}
      />
    </Card>
  );
}

function DayModal({
  day,
  minDuration,
  timeOff,
  onClose,
  onSaved,
}: {
  day: CalendarDay | null;
  minDuration: number;
  timeOff: TimeOff[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!day) return;
    const r = day.ranges.map((x) => ({ from: x.start, to: x.end }));
    setRanges(r.length ? r : [{ from: "10:00", to: "18:00" }]);
    setOn(day.source !== "time_off" && r.length > 0);
  }, [day]);

  if (!day) return null;
  const vacation = timeOff.find((t) => t.id === day.time_off_id);
  const errors = dayErrors({ on, ranges }, minDuration);
  const blocking = on && errors.some(isBlocking);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      onSaved(msg);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () => availabilityApi.setDay(day.date, on ? ranges.map((r) => ({ start: r.from, end: r.to })) : []),
      on ? "Часы на этот день сохранены" : "День закрыт для записи",
    );

  return (
    <Modal open onClose={() => !busy && onClose()} title={dayTitle(day.date)} width={520}>
      <div className={c.dayModal}>
        <div className={c.dayBadges}>
          {day.source === "time_off" ? (
            <Badge tone="warning">Отпуск</Badge>
          ) : day.has_override ? (
            <Badge tone="primary">Изменён вручную</Badge>
          ) : (
            <Badge>Как в недельном расписании</Badge>
          )}
          {day.sessions.length > 0 && (
            <Badge tone="success">
              {day.sessions.length} {plural(day.sessions.length, "запись", "записи", "записей")}
            </Badge>
          )}
        </div>

        {vacation ? (
          <>
            <p className={c.modalText}>
              День входит в отпуск {periodLabel(vacation.start_date, vacation.end_date)}
              {vacation.note ? ` («${vacation.note}»)` : ""}. Клиенты не видят свободного времени в эти дни.
            </p>
            <div className={c.modalActions}>
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Закрыть
              </Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={() => run(() => availabilityApi.removeTimeOff(vacation.id), "Отпуск отменён")}
              >
                Отменить отпуск
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={c.dayToggle}>
              <Switch checked={on} label={on ? "Принимаю в этот день" : "Выходной"} onChange={setOn} />
              <div>
                <strong>{on ? "Принимаю в этот день" : "Выходной"}</strong>
                <span>{on ? "Часы действуют только в эту дату" : "Запись на этот день закрыта"}</span>
              </div>
            </div>
            {on && <RangesEditor ranges={ranges} errors={errors} label={dayTitle(day.date)} onChange={setRanges} />}
            {day.sessions.length > 0 && (
              <div className={c.booked}>
                <span>Уже записаны</span>
                <div>
                  {day.sessions.map((x) => (
                    <Badge key={x.start}>
                      {x.start}–{x.end}
                    </Badge>
                  ))}
                </div>
                <small>Изменение часов не отменяет эти созвоны.</small>
              </div>
            )}
            <div className={c.modalActions}>
              {day.has_override && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(() => availabilityApi.resetDay(day.date), "День снова идёт по недельному расписанию")}
                >
                  Как в расписании
                </Button>
              )}
              <Button variant="primary" loading={busy} disabled={blocking || (on && !ranges.length)} onClick={save}>
                Сохранить день
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function TimeOffList({ items, today, onChanged }: { items: TimeOff[] | null; today: string; onChanged: () => void }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<number | "add" | null>(null);
  const invalid = !start || !end || end < start || start < today;

  const add = async () => {
    if (invalid) return;
    setBusy("add");
    try {
      await availabilityApi.addTimeOff({ start_date: start, end_date: end, note: note.trim() });
      toast("Отпуск добавлен, запись на эти дни закрыта");
      setAdding(false);
      setStart("");
      setEnd("");
      setNote("");
      onChanged();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: number) => {
    setBusy(id);
    try {
      await availabilityApi.removeTimeOff(id);
      toast("Отпуск отменён");
      onChanged();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={c.vacations}>
      <div className={c.vacHead}>
        <div>
          <h3>Отпуск и перерывы</h3>
          <p>Целые дни без приёма. Уже оплаченные созвоны в эти дни остаются в силе</p>
        </div>
        {!adding && (
          <Button size="sm" variant="secondary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
            Добавить отпуск
          </Button>
        )}
      </div>
      {adding && (
        <div className={c.vacForm}>
          <Input type="date" label="Первый день" value={start} min={today} onChange={(e) => {
            setStart(e.target.value);
            if (!end || end < e.target.value) setEnd(e.target.value);
          }} />
          <Input type="date" label="Последний день" value={end} min={start || today} onChange={(e) => setEnd(e.target.value)} />
          <Input label="Заметка для себя" placeholder="Например, отпуск" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className={c.vacFormActions}>
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={busy === "add"}>
              Отмена
            </Button>
            <Button variant="primary" onClick={add} loading={busy === "add"} disabled={invalid}>
              Закрыть запись на эти дни
            </Button>
          </div>
        </div>
      )}
      {items === null ? (
        <Skeleton height={48} radius={14} />
      ) : items.length === 0 ? (
        !adding && (
          <div className={c.vacEmpty}>
            <Palmtree size={18} strokeWidth={1.8} aria-hidden />
            Отпусков не запланировано
          </div>
        )
      ) : (
        <ul className={c.vacList}>
          {items.map((t) => {
            const n = Math.round((parse(t.end_date).getTime() - parse(t.start_date).getTime()) / 86400000) + 1;
            return (
              <li key={t.id}>
                <CalendarOff size={18} strokeWidth={1.8} aria-hidden />
                <div>
                  <strong>{periodLabel(t.start_date, t.end_date)}</strong>
                  <span>
                    {n} {plural(n, "день", "дня", "дней")}
                    {t.note ? `, ${t.note}` : ""}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={`Отменить отпуск ${periodLabel(t.start_date, t.end_date)}`}
                  icon={<Trash2 size={16} />}
                  loading={busy === t.id}
                  onClick={() => remove(t.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
