"use client";

import { t as tt, tj, intlLocale } from "@/lib/i18n";
import { HelpLine } from "@/components/client/HelpLine";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
  Clock,
  Handshake,
  Wallet,
} from "lucide-react";
import { Button, Modal, Skeleton, useToast } from "@/ui";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { ApiError } from "@/lib/api/client";
import { dialogsApi } from "@/lib/api/dialogs";
import {
  availabilityApi,
  durationLabel,
  INTRO_MINUTES,
} from "@/lib/api/availability";
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
import { useAuth } from "@/lib/auth/store";
import { couplesApi } from "@/lib/api/couples";
import { lp } from "@/lib/i18n";

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
  const user = useAuth((st) => st.user);
  const toast = useToast();
  const couple = psy.booking?.couples;
  const [pair, setPair] = useState(false);
  const individualOptions = psy.booking?.durations?.length
    ? psy.booking.durations
    : [{ minutes: 50, price_rub: psy.session_rate_rub }];
  const options =
    pair && couple
      ? [{ minutes: couple.minutes, price_rub: couple.price_rub }]
      : individualOptions;
  // H1: «Сначала познакомиться» — a short first call, once per specialist
  const intro = psy.booking?.intro;
  const canIntro = !pair && !!intro?.enabled && !intro.used;
  const [minutes, setMinutes] = useState<number>(options[0].minutes);
  const isIntro = minutes === INTRO_MINUTES;
  useEffect(() => {
    if (
      couple?.enabled &&
      new URLSearchParams(window.location.search).get("session_format") ===
        "couple"
    ) {
      setPair(true);
      setMinutes(couple.minutes);
    }
  }, [couple?.enabled, couple?.minutes]);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const res = useLoad(
    () =>
      availabilityApi.starts(
        psy.id,
        minutes,
        undefined,
        undefined,
        pair ? "couple" : undefined,
      ),
    [psy.id, minutes, pair],
  );

  const price =
    res.data?.duration_minutes === minutes &&
    (res.data?.format ?? "individual") === (pair ? "couple" : "individual")
      ? res.data.price_rub
      : isIntro
        ? (intro?.price_rub ?? 0)
        : (options.find((o) => o.minutes === minutes)?.price_rub ?? 0);

  const usable: Slot[] = useMemo(
    () =>
      res.data?.duration_minutes === minutes &&
      (res.data?.format ?? "individual") === (pair ? "couple" : "individual")
        ? res.data.starts.map((st) => ({
            start: st,
            end: new Date(
              new Date(st).getTime() + minutes * 60000,
            ).toISOString(),
          }))
        : [],
    [res.data, minutes, pair],
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
    const until = res.data?.horizon_until
      ? new Date(`${res.data.horizon_until}T23:59:59`)
      : null;
    const lastFree = usable.length
      ? new Date(usable[usable.length - 1].start)
      : null;
    const end = [until, lastFree]
      .filter(Boolean)
      .reduce<Date | null>((a, b) => (!a || b! > a ? b : a), null);
    const count = end
      ? Math.min(
          92,
          Math.max(
            14,
            Math.ceil((end.getTime() - today.getTime()) / 86400000) + 2,
          ),
        )
      : 14;
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + i,
      );
      return { key: isoDate(d), date: d };
    });
  }, [today, res.data, usable]);

  const firstFree = days.find((d) => byDay.has(d.key))?.key ?? null;
  const activeDay = dayKey && byDay.has(dayKey) ? dayKey : firstFree;
  const times = activeDay ? (byDay.get(activeDay) ?? []) : [];
  const chosen =
    slot && times.some((t) => t.start === slot.start) ? slot : null;
  const loading =
    res.loading && (!res.data || res.data.duration_minutes !== minutes);

  const book = async () => {
    if (!chosen) return;
    if (!user) {
      router.push(
        `${lp("/start")}?next=${encodeURIComponent(`/app/specialists/${psy.id}${pair ? "?session_format=couple" : ""}#booking`)}`,
      );
      return;
    }
    setBusy(true);
    try {
      if (pair) {
        const c = await couplesApi.book(psy.id, chosen.start, price, minutes);
        void useAuth.getState().refreshUser();
        router.push(`/app/couples/${c.id}`);
        return;
      }
      // The call lives inside the dialogue with this specialist
      const r = await dialogsApi.bookWith(psy.id, chosen.start, minutes);
      if (r.payment_url) {
        window.location.href = r.payment_url;
        return;
      }
      toast(
        r.status === "awaiting_payment"
          ? tt("Время за\u00a0вами\u00a0— осталось оплатить созвон")
          : isIntro
            ? tt("Знакомство назначено")
            : tt("Созвон назначен"),
      );
      router.push(`/app/dialogs?d=${encodeURIComponent(r.dialogue_id)}`);
    } catch (e) {
      setConfirm(false);
      setSlot(null);
      if (e instanceof ApiError && e.status === 400) {
        setNotice(
          tt(`{message} Свободное время обновлено.`, { message: e.message }),
        );
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
          {tt("Назначить созвон")}
        </h2>
        <p className={s.sub}>
          {tj("Время по\u00a0вашему часовому поясу, {offsetLabel}{v}", {
            offsetLabel: offsetLabel(),
            v:
              TZ_LOCAL && TZ_LOCAL.includes("/")
                ? ` (${TZ_LOCAL.split("/").pop()?.replace(/_/g, " ")})`
                : "",
          })}
        </p>
      </div>

      {couple?.enabled && (
        <div className={s.block}>
          <div className={s.label}>{tt("Формат встречи")}</div>
          <div
            className={s.formats}
            role="group"
            aria-label={tt("Формат встречи")}
          >
            {[false, true].map((v) => (
              <button
                key={String(v)}
                type="button"
                className={s.durOpt}
                aria-pressed={pair === v}
                onClick={() => {
                  setPair(v);
                  setMinutes(v ? couple.minutes : individualOptions[0].minutes);
                  setSlot(null);
                  setNotice(null);
                }}
              >
                {v ? tt("Вдвоём с партнёром") : tt("Индивидуально")}
              </button>
            ))}
          </div>
          {pair && (
            <p className={s.note}>
              {tt(
                "Цена за всю встречу. Вы оплачиваете её с баланса и приглашаете партнёра. У каждого свой аккаунт и аватар.",
              )}
            </p>
          )}
        </div>
      )}
      <div className={s.block}>
        <div className={s.label}>{tt("Длительность")}</div>
        <div
          className={s.durs}
          role="group"
          aria-label={tt("Длительность созвона")}
        >
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
        {canIntro && (
          <button
            type="button"
            className={s.introOpt}
            aria-pressed={isIntro}
            onClick={() => {
              setMinutes(isIntro ? options[0].minutes : INTRO_MINUTES);
              setSlot(null);
              setNotice(null);
            }}
          >
            <Handshake size={16} strokeWidth={1.8} aria-hidden />
            <span>
              {tt("Сначала познакомиться\u00a0—")} {INTRO_MINUTES} {tt("мин")}{" "}
              {intro!.price_rub
                ? tt(`за\u00a0{rub}`, { rub: rub(intro!.price_rub) })
                : tt("бесплатно")}
            </span>
          </button>
        )}
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
            <button type="button" className={s.inlineBtn} onClick={res.reload}>
              {tt("Загрузить снова")}
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
          <strong>{tt("Нет свободного времени")}</strong>
          <span>
            {options.length > 1 && minutes !== options[0].minutes
              ? tt(
                  `Для\u00a0{durationLabel} окон не\u00a0нашлось. Попробуйте созвон короче или\u00a0другого специалиста.`,
                  { durationLabel: durationLabel(minutes) },
                )
              : tt(
                  "Загляните через пару дней или\u00a0выберите другого специалиста.",
                )}
          </span>
          <Button size="sm" variant="secondary" href="/app/specialists">
            {tt("Другие специалисты")}
          </Button>
        </div>
      ) : (
        <>
          <div className={s.block}>
            <div className={s.label}>
              {activeDay ? monthOf(activeDay) : tt("День")}
            </div>
            <div className={s.days} role="group" aria-label={tt("День")}>
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
                    aria-label={`${day(d.date)}, ${n ? `${n} ${plural(n, "окно", "окна", "окон")}` : tt("нет окон")}`}
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
            <div className={s.times} role="group" aria-label={tt("Время")}>
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
              ? tt(`{dayLabel} в\u00a0{time}`, {
                  dayLabel: dayLabel(chosen.start),
                  time: time(chosen.start),
                })
              : tt("Выберите время")}
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
          {tt("Назначить созвон")}
        </Button>
      </div>

      <Modal
        open={confirm && !!chosen}
        onClose={() => !busy && setConfirm(false)}
        title={tt("Проверьте запись")}
        width={480}
      >
        {chosen && (
          <div className={s.confirm}>
            <div className={s.who}>
              <SpecialistPhoto
                url={psy.photo_url}
                name={psy.display_name}
                size={56}
              />
              <div>
                <strong>{psy.display_name}</strong>
                <span>
                  {pair
                    ? tt("Консультация для пары")
                    : isIntro
                      ? tt("Знакомство, 15\u00a0минут")
                      : tt("Видеосозвон с\u00a0аватаром")}
                </span>
              </div>
            </div>
            <dl className={s.summary}>
              <div>
                <dt>
                  <CalendarDays size={16} strokeWidth={1.8} aria-hidden />{" "}
                  {tt("День")}
                </dt>
                <dd>
                  {capital(
                    `${dayLabel(chosen.start)}${isNear(chosen.start) ? `, ${day(chosen.start)}` : ""}`,
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <Clock size={16} strokeWidth={1.8} aria-hidden />{" "}
                  {tt("Время")}
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
                  <Wallet size={16} strokeWidth={1.8} aria-hidden />{" "}
                  {tt("Стоимость")}
                </dt>
                <dd>{rub(price)}</dd>
              </div>
            </dl>
            <p className={s.note}>
              {isIntro
                ? tt("Знакомство бывает одно на\u00a0специалиста. ")
                : ""}
              {pair
                ? tt(
                    "Бесплатная отмена за {hours} ч до встречи. Позже удерживается {percent}% стоимости. Перенос согласуйте с психологом.",
                    {
                      hours: couple?.free_cancel_hours ?? 24,
                      percent: couple?.late_cancel_penalty_percent ?? 50,
                    },
                  )
                : tt(
                    "Отменить или\u00a0перенести бесплатно можно за\u00a024\u00a0часа.",
                  )}
            </p>
            <HelpLine />
            <div className={s.actions}>
              <Button
                variant="secondary"
                onClick={() => setConfirm(false)}
                disabled={busy}
              >
                {tt("Изменить")}
              </Button>
              <Button variant="primary" onClick={book} loading={busy}>
                {price
                  ? tt(`Назначить за\u00a0{rub}`, { rub: rub(price) })
                  : tt("Назначить бесплатно")}
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
    new Date(`${key}T12:00:00`).toLocaleDateString(intlLocale(), {
      month: "long",
    }),
  );
}
