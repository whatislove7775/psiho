"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CalendarDays,
  Clock,
  Headphones,
  Wallet,
} from "lucide-react";
import { Button, Modal, Skeleton, useToast } from "@/ui";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { ApiError } from "@/lib/api/client";
import { sessionsApi } from "@/lib/api/endpoints";
import { availabilityApi, durationLabel } from "@/lib/api/availability";
import type { PsychologistPublic, Slot } from "@/lib/api/types";
import {
  WEEKDAYS_SHORT,
  day,
  dayLabel,
  isoDate,
  plural,
  rub,
  time,
} from "@/lib/format";
import { useLoad, errorText } from "@/components/client/useLoad";
import s from "./booking.module.css";

const TZ_LOCAL = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
})();

function offsetLabel() {
  const m = -new Date().getTimezoneOffset();
  const sign = m >= 0 ? "+" : "−";
  const h = Math.floor(Math.abs(m) / 60);
  const mm = Math.abs(m) % 60;
  return `UTC${sign}${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}`;
}

/** Choose duration, day and time, then confirm. Lives in the right rail of a profile. */
export function BookingPanel({ psy }: { psy: PsychologistPublic }) {
  const router = useRouter();
  const toast = useToast();
  const options = psy.booking?.durations?.length
    ? psy.booking.durations
    : [{ minutes: 50, price_rub: psy.session_rate_rub }];
  const [minutes, setMinutes] = useState<number>(options[0].minutes);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const res = useLoad(() => availabilityApi.starts(psy.id, minutes), [psy.id, minutes]);

  const price = res.data?.duration_minutes === minutes ? res.data.price_rub : (options.find((o) => o.minutes === minutes)?.price_rub ?? 0);

  const usable: Slot[] = useMemo(
    () =>
      res.data?.duration_minutes === minutes
        ? res.data.starts.map((st) => ({ start: st, end: new Date(new Date(st).getTime() + minutes * 60000).toISOString() }))
        : [],
    [res.data, minutes],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const x of usable) {
      const k = isoDate(new Date(x.start));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(x);
    }
    return m;
  }, [usable]);

  const days = useMemo(() => {
    const until = res.data?.horizon_until ? new Date(`${res.data.horizon_until}T23:59:59`) : null;
    const lastFree = usable.length ? new Date(usable[usable.length - 1].start) : null;
    const end = [until, lastFree].filter(Boolean).reduce<Date | null>((a, b) => (!a || b! > a ? b : a), null);
    const count = end ? Math.min(92, Math.max(14, Math.ceil((end.getTime() - today.getTime()) / 86400000) + 2)) : 14;
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      return { key: isoDate(d), date: d };
    });
  }, [today, res.data, usable]);

  const firstFree = days.find((d) => byDay.has(d.key))?.key ?? null;
  const activeDay = dayKey && byDay.has(dayKey) ? dayKey : firstFree;
  const times = activeDay ? (byDay.get(activeDay) ?? []) : [];
  const chosen = slot && times.some((t) => t.start === slot.start) ? slot : null;
  const loading = res.loading && (!res.data || res.data.duration_minutes !== minutes);

  const book = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const r = await sessionsApi.book(psy.id, chosen.start, minutes);
      if (r.payment_url) {
        window.location.href = r.payment_url;
        return;
      }
      toast("Сессия запланирована");
      router.push("/app/sessions");
    } catch (e) {
      setConfirm(false);
      setSlot(null);
      if (e instanceof ApiError && e.status === 400) {
        setNotice(`${e.message} Свободное время обновлено.`);
        res.reload();
      } else {
        setNotice(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={s.panel} id="booking" aria-labelledby="booking-title">
      <div className={s.head}>
        <h2 id="booking-title" className={s.title}>
          Запись на сессию
        </h2>
        <p className={s.sub}>
          Время по вашему часовому поясу, {offsetLabel()}{TZ_LOCAL && TZ_LOCAL.includes("/") ? ` (${TZ_LOCAL.split("/").pop()?.replace(/_/g, " ")})` : ""}
        </p>
      </div>

      <div className={s.block}>
        <div className={s.label}>Длительность</div>
        <div className={s.durs} role="group" aria-label="Длительность сессии">
          {options.map((o) => (
            <button
              key={o.minutes}
              type="button"
              className={s.durOpt}
              aria-pressed={o.minutes === minutes}
              onClick={() => {
                setMinutes(o.minutes);
                setSlot(null);
                setNotice(null);
              }}
            >
              <span>{durationLabel(o.minutes)}</span>
              <small>{rub(o.price_rub)}</small>
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className={s.notice} role="alert">
          <AlertCircle size={18} strokeWidth={1.8} aria-hidden />
          <span>{notice}</span>
        </div>
      )}

      {res.error ? (
        <div className={s.notice} role="alert">
          <AlertCircle size={18} strokeWidth={1.8} aria-hidden />
          <span>
            {res.error}{" "}
            <button
              type="button"
              className={s.inlineBtn}
              onClick={res.reload}
            >
              Загрузить снова
            </button>
          </span>
        </div>
      ) : loading ? (
        <div className={s.skel}>
          <Skeleton height={68} radius={16} />
          <Skeleton height={120} radius={16} />
        </div>
      ) : usable.length === 0 ? (
        <div className={s.none}>
          <CalendarDays size={22} strokeWidth={1.8} aria-hidden />
          <strong>Нет свободного времени</strong>
          <span>
            {options.length > 1 && minutes !== options[0].minutes
              ? `Для ${durationLabel(minutes)} окон не нашлось. Попробуйте сессию короче или другого специалиста.`
              : "Загляните через пару дней или выберите другого специалиста."}
          </span>
          <Button size="sm" variant="secondary" href="/app/specialists">
            Другие специалисты
          </Button>
        </div>
      ) : (
        <>
          <div className={s.block}>
            <div className={s.label}>
              {activeDay ? monthOf(activeDay) : "День"}
            </div>
            <div className={s.days} role="group" aria-label="День">
              {days.map((d) => {
                const n = byDay.get(d.key)?.length ?? 0;
                return (
                  <button
                    key={d.key}
                    type="button"
                    className={s.day}
                    aria-pressed={d.key === activeDay}
                    disabled={!n}
                    onClick={() => {
                      setDayKey(d.key);
                      setSlot(null);
                    }}
                    aria-label={`${day(d.date)}, ${n ? `${n} ${plural(n, "окно", "окна", "окон")}` : "нет окон"}`}
                  >
                    <span className={s.wd}>
                      {WEEKDAYS_SHORT[(d.date.getDay() + 6) % 7]}
                    </span>
                    <span className={s.dn}>{d.date.getDate()}</span>
                    <span className={s.dot} aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>

          <div className={s.block}>
            <div className={s.label}>
              {activeDay && dayLabel(new Date(`${activeDay}T12:00:00`))},{" "}
              {times.length} {plural(times.length, "окно", "окна", "окон")}
            </div>
            <div className={s.times} role="group" aria-label="Время">
              {times.map((t) => (
                <button
                  key={t.start}
                  type="button"
                  className={s.time}
                  aria-pressed={chosen?.start === t.start}
                  onClick={() => setSlot(t)}
                >
                  {time(t.start)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className={s.footer}>
        <div className={s.total}>
          <span>
            {chosen
              ? `${dayLabel(chosen.start)} в ${time(chosen.start)}`
              : "Выберите время"}
          </span>
          <strong>{rub(price)}</strong>
        </div>
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!chosen}
          onClick={() => setConfirm(true)}
        >
          Записаться
        </Button>
      </div>

      <Modal
        open={confirm && !!chosen}
        onClose={() => !busy && setConfirm(false)}
        title="Проверьте запись"
        width={480}
      >
        {chosen && (
          <div className={s.confirm}>
            <div className={s.who}>
              <SpecialistPhoto url={psy.photo_url} name={psy.display_name} size={56} />
              <div>
                <strong>{psy.display_name}</strong>
                <span>Видеосессия с аватаром</span>
              </div>
            </div>
            <dl className={s.summary}>
              <div>
                <dt>
                  <CalendarDays size={16} strokeWidth={1.8} aria-hidden /> День
                </dt>
                <dd>
                  {capital(
                    `${dayLabel(chosen.start)}${isNear(chosen.start) ? `, ${day(chosen.start)}` : ""}`,
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <Clock size={16} strokeWidth={1.8} aria-hidden /> Время
                </dt>
                <dd>
                  {time(chosen.start)} –{" "}
                  {time(
                    new Date(
                      new Date(chosen.start).getTime() + minutes * 60000,
                    ),
                  )}
                  , {durationLabel(minutes)}
                </dd>
              </div>
              <div>
                <dt>
                  <Wallet size={16} strokeWidth={1.8} aria-hidden /> Стоимость
                </dt>
                <dd>{rub(price)}</dd>
              </div>
            </dl>
            <p className={s.note}>
              Деньги спишутся только после подтверждения записи. Отменить сессию
              можно до её начала.
            </p>
            <div className={s.need}>
              <span>
                <Camera size={16} strokeWidth={1.8} aria-hidden /> Камера, чтобы
                аватар повторял мимику
              </span>
              <span>
                <Headphones size={16} strokeWidth={1.8} aria-hidden /> Тихое
                место и наушники
              </span>
            </div>
            <div className={s.actions}>
              <Button
                variant="secondary"
                onClick={() => setConfirm(false)}
                disabled={busy}
              >
                Изменить
              </Button>
              <Button variant="primary" onClick={book} loading={busy}>
                Записаться за {rub(price)}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

function isNear(iso: string) {
  const l = dayLabel(iso);
  return l === "Сегодня" || l === "Завтра";
}
function capital(x: string) {
  return x.charAt(0).toUpperCase() + x.slice(1);
}
function monthOf(key: string) {
  return capital(
    new Date(`${key}T12:00:00`).toLocaleDateString("ru-RU", { month: "long" }),
  );
}
