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
import { Button, Modal, Segmented, Skeleton, useToast } from "@/ui";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { ApiError } from "@/lib/api/client";
import { psychologistsApi, sessionsApi } from "@/lib/api/endpoints";
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

type Dur = "50" | "80";
const HOUR = 3600000;

export function priceFor(rate: number, minutes: 50 | 80) {
  return minutes === 80 ? Math.round(rate * 1.5) : rate;
}

/** Choose duration, day and time, then confirm. Lives in the right rail of a profile. */
export function BookingPanel({ psy }: { psy: PsychologistPublic }) {
  const router = useRouter();
  const toast = useToast();
  const [dur, setDur] = useState<Dur>("50");
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const slots = useLoad(
    () => psychologistsApi.slots(psy.id, isoDate(today), 14),
    [psy.id],
  );

  const minutes = Number(dur) as 50 | 80;
  const price = priceFor(psy.session_rate_rub, minutes);

  // 80-minute sessions run into the next hourly slot, so it must be free too.
  const usable = useMemo(() => {
    const list = slots.data ?? [];
    if (minutes === 50) return list;
    const starts = new Set(list.map((x) => new Date(x.start).getTime()));
    return list.filter((x) => starts.has(new Date(x.start).getTime() + HOUR));
  }, [slots.data, minutes]);

  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const x of usable) {
      const k = isoDate(new Date(x.start));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(x);
    }
    return m;
  }, [usable]);

  const days = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + i,
        );
        return { key: isoDate(d), date: d };
      }),
    [today],
  );

  const firstFree = days.find((d) => byDay.has(d.key))?.key ?? null;
  const activeDay = dayKey && byDay.has(dayKey) ? dayKey : firstFree;
  const times = activeDay ? (byDay.get(activeDay) ?? []) : [];
  const chosen =
    slot && times.some((t) => t.start === slot.start) ? slot : null;

  const book = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const res = await sessionsApi.book(psy.id, chosen.start, minutes);
      if (res.payment_url) {
        window.location.href = res.payment_url;
        return;
      }
      toast("Сессия запланирована");
      router.push("/app/sessions");
    } catch (e) {
      setConfirm(false);
      setSlot(null);
      if (e instanceof ApiError && e.status === 400) {
        setNotice(
          `${e.message} Свободное время обновлено.`,
        );
        slots.reload();
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
        <p className={s.sub}>Время показано по вашему часовому поясу</p>
      </div>

      <div className={s.dur}>
        <Segmented<Dur>
          ariaLabel="Длительность"
          value={dur}
          onChange={(v) => {
            setDur(v);
            setNotice(null);
          }}
          options={[
            { value: "50", label: `50 мин, ${rub(psy.session_rate_rub)}` },
            {
              value: "80",
              label: `80 мин, ${rub(priceFor(psy.session_rate_rub, 80))}`,
            },
          ]}
        />
      </div>

      {notice && (
        <div className={s.notice} role="alert">
          <AlertCircle size={18} strokeWidth={1.8} aria-hidden />
          <span>{notice}</span>
        </div>
      )}

      {slots.error ? (
        <div className={s.notice} role="alert">
          <AlertCircle size={18} strokeWidth={1.8} aria-hidden />
          <span>
            {slots.error}{" "}
            <button
              type="button"
              className={s.inlineBtn}
              onClick={slots.reload}
            >
              Загрузить снова
            </button>
          </span>
        </div>
      ) : slots.loading && !slots.data ? (
        <div className={s.skel}>
          <Skeleton height={68} radius={16} />
          <Skeleton height={120} radius={16} />
        </div>
      ) : usable.length === 0 ? (
        <div className={s.none}>
          <CalendarDays size={22} strokeWidth={1.8} aria-hidden />
          <strong>Нет свободного времени на две недели</strong>
          <span>
            {minutes === 80
              ? "Для 80 минут окон не нашлось. Попробуйте 50 минут или другого специалиста."
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
              <AvatarThumb
                config={psy.avatar_config}
                seed={`psy-${psy.id}`}
                size={56}
              />
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
                  , {minutes} минут
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
