"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CalendarDays } from "lucide-react";
import { Button, Modal, Skeleton } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { dialogsApi, type DialogStarts, type DurationOption } from "@/lib/api/dialogs";
import { durationLabel } from "@/lib/api/availability";
import { WEEKDAYS_SHORT, dayLabel, isoDate, plural, rub, time } from "@/lib/format";
import b from "@/components/booking/booking.module.css";
import s from "./dialogs.module.css";

/**
 * Duration + day + time from the specialist's availability.
 * Used to book a call (client), propose a time (specialist) and reschedule (both).
 */
export function CallPicker({
  open,
  onClose,
  dialogId,
  title,
  durations,
  fixedMinutes,
  submitLabel,
  note,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  dialogId: string;
  title: string;
  durations: DurationOption[];
  /** reschedule keeps the duration (and the price) */
  fixedMinutes?: number;
  submitLabel: (priceRub: number, minutes: number) => string;
  note?: ReactNode;
  onSubmit: (startIso: string, minutes: number) => Promise<string | void>;
}) {
  const options = durations.length ? durations : [{ minutes: 50, price_rub: 0 }];
  const [minutes, setMinutes] = useState<number>(fixedMinutes ?? options[0].minutes);
  const [data, setData] = useState<DialogStarts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (open) {
      setMinutes(fixedMinutes ?? options[0].minutes);
      setChosen(null);
      setDayKey(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedMinutes]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setData(null);
    dialogsApi
      .starts(dialogId, minutes)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Не получилось загрузить свободное время"));
    return () => {
      alive = false;
    };
  }, [open, dialogId, minutes, reload]);

  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const st of data?.starts ?? []) {
      const k = isoDate(new Date(st));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(st);
    }
    return m;
  }, [data]);
  const days = useMemo(() => Array.from(byDay.keys()).slice(0, 60), [byDay]);
  const activeDay = dayKey && byDay.has(dayKey) ? dayKey : days[0] ?? null;
  const times = activeDay ? byDay.get(activeDay) ?? [] : [];
  const price = data?.price_rub ?? options.find((o) => o.minutes === minutes)?.price_rub ?? 0;

  const submit = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const err = await onSubmit(chosen, minutes);
      if (err) {
        setError(err);
        setChosen(null);
        setReload((x) => x + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title} width={520}>
      <div className={s.picker}>
        {!fixedMinutes && options.length > 1 && (
          <div className={b.block}>
            <div className={b.label}>Длительность</div>
            <div className={b.durs} role="group" aria-label="Длительность созвона">
              {options.map((o) => (
                <button
                  key={o.minutes}
                  type="button"
                  className={b.durOpt}
                  aria-pressed={o.minutes === minutes}
                  onClick={() => {
                    setMinutes(o.minutes);
                    setChosen(null);
                  }}
                >
                  <span>{durationLabel(o.minutes)}</span>
                  <small>{rub(o.price_rub)}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className={b.notice} role="alert">
            <AlertCircle size={18} strokeWidth={1.8} aria-hidden />
            <span>{error}</span>
          </div>
        )}

        {!data && !error ? (
          <div className={b.skel}>
            <Skeleton height={68} radius={16} />
            <Skeleton height={120} radius={16} />
          </div>
        ) : data && days.length === 0 ? (
          <div className={b.none}>
            <CalendarDays size={22} strokeWidth={1.8} aria-hidden />
            <strong>Нет свободного времени</strong>
            <span>
              {options.length > 1 && !fixedMinutes
                ? "Попробуйте другую длительность или напишите в диалоге, какое время вам удобно."
                : "Напишите в диалоге, какое время вам удобно, — специалист может открыть дополнительные часы."}
            </span>
          </div>
        ) : data ? (
          <>
            <div className={b.block}>
              <div className={b.label}>День</div>
              <div className={b.days} role="group" aria-label="День">
                {days.map((k) => {
                  const d = new Date(`${k}T12:00:00`);
                  const n = byDay.get(k)?.length ?? 0;
                  return (
                    <button
                      key={k}
                      type="button"
                      className={b.day}
                      aria-pressed={k === activeDay}
                      onClick={() => {
                        setDayKey(k);
                        setChosen(null);
                      }}
                      aria-label={`${dayLabel(d)}, ${n} ${plural(n, "окно", "окна", "окон")}`}
                    >
                      <span className={b.wd}>{WEEKDAYS_SHORT[(d.getDay() + 6) % 7]}</span>
                      <span className={b.dn}>{d.getDate()}</span>
                      <span className={b.dot} aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={b.block}>
              <div className={b.label}>
                {activeDay && dayLabel(new Date(`${activeDay}T12:00:00`))}, {times.length}{" "}
                {plural(times.length, "окно", "окна", "окон")}
              </div>
              <div className={b.times} role="group" aria-label="Время">
                {times.map((t) => (
                  <button key={t} type="button" className={b.time} aria-pressed={chosen === t} onClick={() => setChosen(t)}>
                    {time(t)}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {note && <p className={s.muted}>{note}</p>}

        <div className={s.pickerFoot}>
          <div className={s.pickerTotal}>
            <span>{chosen ? `${dayLabel(chosen)} в ${time(chosen)}, ${durationLabel(minutes)}` : "Выберите время"}</span>
            <strong>{rub(price)}</strong>
          </div>
          <Button variant="primary" onClick={submit} disabled={!chosen} loading={busy}>
            {submitLabel(price, minutes)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
