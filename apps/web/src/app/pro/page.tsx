"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Camera,
  Check,
  Hourglass,
  PauseCircle,
  ImageUp,
  UserRound,
  Video,
  Wallet,
  CircleAlert,
} from "lucide-react";
import { Button, Card, CardHead, EmptyState, QuickAction, Skeleton, Stat } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { LoadError } from "@/components/pro/controls";
import { rulesToWeek, slotsInWeek, weekdayOf } from "@/components/pro/schedule";
import { useAuth } from "@/lib/auth/store";
import { cabinetApi, psychologistsApi, sessionsApi } from "@/lib/api/endpoints";
import type { PsychologistPrivate, PsychologistStats, ScheduleRule, Session, Slot } from "@/lib/api/types";
import { isoDate, plural, rub, SESSION_STATUS, time, untilLabel, WEEKDAYS_SHORT, dayLabel } from "@/lib/format";
import s from "@/components/pro/pro.module.css";
import p from "./overview.module.css";

interface Data {
  stats: PsychologistStats | null;
  sessions: Session[];
  schedule: ScheduleRule[];
  profile: PsychologistPrivate | null;
  slots: Slot[] | null;
}

const ACTIVE = new Set(["awaiting_payment", "paid", "in_progress"]);
const monthName = () => new Date().toLocaleDateString("ru-RU", { month: "long" });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export default function ProOverview() {
  const user = useAuth((st) => st.user);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [stats, sessions, schedule, profile] = await Promise.allSettled([
      cabinetApi.stats(),
      sessionsApi.list(),
      cabinetApi.schedule(),
      cabinetApi.profile(),
    ]);
    const prof = profile.status === "fulfilled" ? profile.value : null;
    let slots: Slot[] | null = null;
    if (prof?.verification_status === "approved") {
      slots = await psychologistsApi.slots(prof.id, isoDate(new Date()), 7).catch(() => null);
    }
    if ([stats, sessions, schedule, profile].every((r) => r.status === "rejected")) {
      setError("Не получилось загрузить сводку. Проверьте соединение и попробуйте ещё раз.");
    }
    setData({
      stats: stats.status === "fulfilled" ? stats.value : null,
      sessions: sessions.status === "fulfilled" ? sessions.value : [],
      schedule: schedule.status === "fulfilled" ? schedule.value : [],
      profile: prof,
      slots,
    });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // keep «Войти» in sync with can_join
    return () => clearInterval(t);
  }, [load]);

  const profile = data?.profile ?? user?.psychologist ?? null;
  const name = profile?.display_name || user?.alias || "";
  const now = new Date();

  const { today, upcoming, next } = useMemo(() => {
    const list = (data?.sessions ?? []).filter((x) => ACTIVE.has(x.status));
    const end = (x: Session) => new Date(x.scheduled_at).getTime() + x.duration_minutes * 60000;
    const live = list.filter((x) => end(x) > Date.now()).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return {
      today: live.filter((x) => sameDay(new Date(x.scheduled_at), new Date())),
      upcoming: live.filter((x) => !sameDay(new Date(x.scheduled_at), new Date())).slice(0, 5),
      next: live[0] ?? null,
    };
  }, [data?.sessions]);

  const steps = useMemo(() => {
    const pr = data?.profile;
    return [
      {
        label: "Заполнить профиль",
        hint: "Описание, подход и хотя бы одна специализация",
        done: !!(pr?.bio?.trim() && pr?.approach?.trim() && pr?.specializations?.length),
        href: "/pro/profile",
      },
      { label: "Настроить расписание", hint: "Клиенты записываются только в эти часы", done: (data?.schedule.length ?? 0) > 0, href: "/pro/schedule" },
      { label: "Загрузить фото", hint: "Настоящее фото в карточке специалиста и на сессии", done: !!pr?.photo_url, href: "/pro/profile" },
      {
        label: "Пройти проверку",
        hint: "Администратор проверяет анкету вручную",
        done: pr?.verification_status === "approved",
        href: undefined,
      },
    ];
  }, [data]);
  const doneCount = steps.filter((x) => x.done).length;

  const weekSlots = data?.slots ? data.slots.length : slotsInWeek(rulesToWeek(data?.schedule ?? []));
  const status = profile?.verification_status;

  const subtitle = data
    ? `${name}. ${today.length ? `Сегодня ${today.length} ${plural(today.length, "сессия", "сессии", "сессий")}` : "Сегодня сессий нет"}${
        next ? `, ближайшая ${untilLabel(next.scheduled_at)}` : ""
      }.`
    : name;

  return (
    <>
      <PageHeader
        title={`Сводка за ${monthName()}`}
        sub={subtitle}
        action={
          <Button variant="primary" href="/pro/sessions" icon={<Video size={18} />}>
            Все сессии
          </Button>
        }
      />
      <WithRail
        rail={
          <div className={p.railDesktop}>
            <RailCard data={data} next={next} weekSlots={weekSlots} />
          </div>
        }
      >
        {error && <LoadError text={error} onRetry={load} />}
        <div className={p.railMobile}>
          <RailCard data={data} next={next} weekSlots={weekSlots} />
        </div>
        {status && status !== "approved" && <StatusCard status={status} />}

        {data && doneCount < steps.length && (
          <Card as="section">
            <CardHead
              title="Первые шаги"
              sub="Когда всё будет готово, вы появитесь в каталоге специалистов"
              action={
                <span className={p.progress} aria-label={`Готово ${doneCount} из ${steps.length}`}>
                  {doneCount} из {steps.length}
                </span>
              }
            />
            <ul className={p.steps}>
              {steps.map((st) => {
                const inner = (
                  <>
                    <span className={p.tick} data-done={st.done || undefined} aria-hidden>
                      {st.done && <Check size={14} strokeWidth={2.6} />}
                    </span>
                    <span className={p.stepText}>
                      <span className={p.stepLabel}>{st.label}</span>
                      {!st.done && <span className={p.stepHint}>{st.hint}</span>}
                    </span>
                  </>
                );
                return (
                  <li key={st.label} data-done={st.done || undefined}>
                    {st.href && !st.done ? (
                      <Link href={st.href} className={p.step}>
                        {inner}
                      </Link>
                    ) : (
                      <div className={p.step}>
                        {inner}
                        {st.done && <span className={p.srOnly}>, готово</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card as="section">
          <CardHead title="Быстрые инструменты" />
          <div className={p.quick}>
            <QuickAction tone="sky" icon={<CalendarClock size={24} strokeWidth={1.8} />} label="Расписание" href="/pro/schedule" />
            <QuickAction tone="mint" icon={<Video size={24} strokeWidth={1.8} />} label="Сессии сегодня" href="/pro/sessions?tab=today" />
            <QuickAction tone="peach" icon={<UserRound size={24} strokeWidth={1.8} />} label="Профиль" href="/pro/profile" />
            <QuickAction tone="lilac" icon={<ImageUp size={24} strokeWidth={1.8} />} label="Фото профиля" href="/pro/profile#photo" />
            <QuickAction tone="butter" icon={<Camera size={24} strokeWidth={1.8} />} label="Проверить камеру" href="/pro/check" />
            <QuickAction tone="lime" icon={<Wallet size={24} strokeWidth={1.8} />} label="Доход" href="/pro/sessions?tab=past" />
          </div>
        </Card>

        <div className={s.stats}>
          {data?.stats ? (
            <>
              <Stat label="Предстоящие" value={data.stats.upcoming} note={data.stats.upcoming ? "Оплачены и ждут вас" : "Пока никто не записался"} />
              <Stat label={`Сессий в ${monthIn()}`} value={data.stats.sessions_month} note={`Всего ${data.stats.sessions_total}`} />
              <Stat label={`Доход за ${monthName()}`} value={rub(data.stats.earnings_month_rub)} note={`Всего ${rub(data.stats.earnings_total_rub)}`} />
              <Stat label="Клиентов" value={data.stats.clients_total} note="За всё время, анонимно" />
            </>
          ) : data ? (
            <div className={p.statsGap}>Статистика сейчас недоступна. Обновите страницу чуть позже.</div>
          ) : (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} height={116} radius={22} />)
          )}
        </div>

        <div className={s.grid2}>
          <Card as="section">
            <CardHead title="Сегодня" sub={now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })} />
            {!data ? (
              <Skeleton height={60} />
            ) : today.length ? (
              <MiniList sessions={today} showDay={false} />
            ) : (
              <p className={s.muted}>Сегодня свободный день. Если хотите принять клиентов, добавьте часы в расписание.</p>
            )}
          </Card>
          <Card as="section">
            <CardHead
              title="Ближайшие"
              sub="Следующие записи после сегодняшнего дня"
              action={
                upcoming.length ? (
                  <Button size="sm" variant="ghost" href="/pro/sessions?tab=upcoming">
                    Все
                  </Button>
                ) : undefined
              }
            />
            {!data ? (
              <Skeleton height={60} />
            ) : upcoming.length ? (
              <MiniList sessions={upcoming} showDay />
            ) : (
              <p className={s.muted}>
                {weekSlots > 0
                  ? "Новых записей пока нет. Клиенты видят ваши свободные часы в каталоге."
                  : "Записей нет: в расписании не отмечено ни одного часа."}
              </p>
            )}
          </Card>
        </div>
      </WithRail>
    </>
  );
}

/** «в сентябре» */
function monthIn() {
  const m = new Date().getMonth();
  return ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"][m];
}

function MiniList({ sessions, showDay }: { sessions: Session[]; showDay: boolean }) {
  return (
    <div className={s.mini}>
      {sessions.map((x) => (
        <div key={x.id} className={s.miniRow}>
          <AvatarThumb config={x.client.avatar_config} seed={x.client.alias} size={36} />
          <div style={{ minWidth: 0 }}>
            <div className={s.rowTitle}>{x.client.alias}</div>
            <div className={s.miniSub}>
              {x.duration_minutes} минут, {SESSION_STATUS[x.status]?.label.toLowerCase()}
            </div>
          </div>
          <div className={s.miniTime}>
            {showDay && <div className={s.miniSub}>{dayLabel(x.scheduled_at)}</div>}
            {time(x.scheduled_at)}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusCard({ status }: { status: "pending" | "rejected" | "suspended" }) {
  const cfg = {
    pending: {
      icon: <Hourglass size={22} strokeWidth={1.8} />,
      tone: p.statusPending,
      title: "Профиль на проверке",
      text: "Обычно это занимает до 2 рабочих дней. Пока заполните расписание и профиль: как только проверка пройдёт, клиенты сразу увидят вашу карточку и свободные часы.",
    },
    rejected: {
      icon: <CircleAlert size={22} strokeWidth={1.8} />,
      tone: p.statusRejected,
      title: "Проверка не пройдена",
      text: "Клиенты пока не видят вашу карточку. Дополните в профиле описание, подход и специализации, затем ответьте на письмо администратора, чтобы заявку посмотрели ещё раз.",
    },
    suspended: {
      icon: <PauseCircle size={22} strokeWidth={1.8} />,
      tone: p.statusRejected,
      title: "Профиль приостановлен",
      text: "Новые клиенты не могут записаться к вам. Чтобы узнать причину и вернуть профиль в каталог, ответьте на письмо администратора.",
    },
  }[status];
  return (
    <section className={`${p.status} ${cfg.tone}`} aria-live="polite">
      <span className={p.statusIcon} aria-hidden>
        {cfg.icon}
      </span>
      <div className={p.statusBody}>
        <h2 className={p.statusTitle}>{cfg.title}</h2>
        <p className={p.statusText}>{cfg.text}</p>
        <div className={p.statusActions}>
          <Button size="sm" variant="secondary" href="/pro/profile">
            Заполнить профиль
          </Button>
          <Button size="sm" variant="ghost" href="/pro/schedule">
            Настроить расписание
          </Button>
        </div>
      </div>
    </section>
  );
}

function RailCard({ data, next, weekSlots }: { data: Data | null; next: Session | null; weekSlots: number }) {
  if (!data) return <Skeleton height={380} radius={22} />;

  if (next) {
    const live = next.status === "in_progress";
    return (
      <section className={s.accent} aria-label="Следующая сессия">
        <div className={s.accentKicker}>{live ? "Сессия идёт сейчас" : `Следующая сессия ${untilLabel(next.scheduled_at)}`}</div>
        <div className={s.accentPerson}>
          <span className={s.accentAvatar}>
            <AvatarThumb config={next.client.avatar_config} seed={next.client.alias} size={64} background="rgba(255,255,255,.18)" />
          </span>
          <div style={{ minWidth: 0 }}>
            <strong>{next.client.alias}</strong>
            <span>Анонимный клиент</span>
          </div>
        </div>
        <ul className={s.accentList}>
          <li className={s.accentRow}>
            <span>Начало</span>
            <span>
              {dayLabel(next.scheduled_at)}, {time(next.scheduled_at)}
            </span>
          </li>
          <li className={s.accentRow}>
            <span>Длительность</span>
            <span>{next.duration_minutes} минут</span>
          </li>
          <li className={s.accentRow}>
            <span>Оплата</span>
            <span>{next.status === "awaiting_payment" ? "Ждёт оплаты" : rub(next.amount_rub)}</span>
          </li>
        </ul>
        <Button variant="white" size="lg" block disabled={!next.can_join} href={next.can_join ? `/room/${next.id}` : undefined}>
          Войти в сессию
        </Button>
        {!next.can_join && <p className={s.accentText}>Кнопка станет активной за 10 минут до начала.</p>}
        <Link href="/pro/check" className={s.accentLink}>
          Проверить камеру и микрофон
        </Link>
      </section>
    );
  }

  const week = rulesToWeek(data.schedule);
  const today = weekdayOf(new Date());
  const order = Array.from({ length: 7 }, (_, i) => (today + i) % 7);
  return (
    <section className={s.accent} aria-label="Свободное время на неделе">
      <div className={s.accentKicker}>Ближайших записей нет</div>
      <div>
        <div className={s.accentBig}>{weekSlots}</div>
        <div className={s.accentText} style={{ marginTop: 6 }}>
          {plural(weekSlots, "свободный слот", "свободных слота", "свободных слотов")} на неделе
        </div>
      </div>
      <ul className={s.accentList}>
        {order
          .filter((d) => week[d].on)
          .slice(0, 4)
          .map((d) => (
            <li key={d} className={s.accentRow}>
              <span>{d === today ? "Сегодня" : WEEKDAYS_SHORT[d]}</span>
              <span>{week[d].ranges.map((r) => `${r.from}–${r.to}`).join(", ")}</span>
            </li>
          ))}
        {!week.some((d) => d.on) && (
          <li className={s.accentRow}>
            <span>Расписание пустое</span>
            <span>0 часов</span>
          </li>
        )}
      </ul>
      <Button variant="white" size="lg" block href="/pro/schedule">
        {weekSlots ? "Изменить расписание" : "Настроить расписание"}
      </Button>
    </section>
  );
}
