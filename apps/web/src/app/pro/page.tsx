"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleAlert, Hourglass, PauseCircle, Video } from "lucide-react";
import { Button, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { LoadError } from "@/components/pro/controls";
import { rulesToWeek, slotsInWeek } from "@/components/pro/schedule";
import { useAuth } from "@/lib/auth/store";
import { cabinetApi, psychologistsApi, sessionsApi } from "@/lib/api/endpoints";
import type { PsychologistPrivate, PsychologistStats, ScheduleRule, Session, Slot } from "@/lib/api/types";
import { isoDate, plural, rub, SESSION_STATUS, time, dayLabel } from "@/lib/format";
import { NextCallStrip, useDialogsSummary } from "@/components/dialogs/HomeWidgets";
import { ConvAvatar } from "@/components/chat/ConvAvatar";
import { dialogHref } from "@/lib/api/dialogs";
import h from "@/app/app/home.module.css";
import r from "@/components/client/rail.module.css";
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
  const dialogs = useDialogsSummary();
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

  const { today, next } = useMemo(() => {
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
      { label: "Загрузить фото", hint: "Настоящее фото в карточке специалиста и на созвоне", done: !!pr?.photo_url, href: "/pro/profile" },
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
    ? today.length
      ? `Сегодня ${today.length} ${plural(today.length, "созвон", "созвона", "созвонов")}`
      : "Сегодня созвонов нет"
    : "";
  const undone = steps.filter((x) => !x.done && x.href);

  return (
    <div className={h.home}>
      <PageHeader title={name ? `Здравствуйте, ${name.split(" ")[0]}` : "Сводка"} sub={subtitle} />
      {error && <LoadError text={error} onRetry={load} />}
      {status && status !== "approved" && <StatusCard status={status} />}

      {data && undone.length > 0 && (
        <div className={h.actions} aria-label={`Первые шаги: готово ${doneCount} из ${steps.length}`}>
          <span className={p.stepsLabel}>
            Первые шаги {doneCount}/{steps.length}
          </span>
          {undone.map((st) => (
            <Link key={st.label} href={st.href!} className={h.chip}>
              {st.label}
            </Link>
          ))}
        </div>
      )}

      {dialogs.next ? (
        <NextCallStrip item={dialogs.next} role="specialist" />
      ) : next ? (
        <NextSessionStrip next={next} />
      ) : null}

      <dl className={p.nums}>
        {data?.stats ? (
          <>
            <div>
              <dt>Предстоящие</dt>
              <dd>{data.stats.upcoming}</dd>
            </div>
            <div>
              <dt>Созвонов, {monthShort()}</dt>
              <dd>{data.stats.sessions_month}</dd>
            </div>
            <div>
              <dt>Доход, {monthShort()}</dt>
              <dd>{rub(data.stats.earnings_month_rub)}</dd>
            </div>
            <div>
              <dt>Клиентов</dt>
              <dd>{data.stats.clients_total}</dd>
            </div>
            <div>
              <dt>Окон, 7 дней</dt>
              <dd>
                <Link href="/pro/schedule">{weekSlots}</Link>
              </dd>
            </div>
          </>
        ) : data ? null : (
          <Skeleton height={52} radius={14} />
        )}
      </dl>

      {today.length > 0 && (
        <section className={h.section}>
          <div className={h.sectionHead}>
            <h2 className={h.sectionTitle}>Сегодня</h2>
          </div>
          <MiniList sessions={today} showDay={false} />
        </section>
      )}

      {dialogs.recent.length > 0 && (
        <section className={h.section}>
          <div className={h.sectionHead}>
            <h2 className={h.sectionTitle}>Диалоги</h2>
            <Link href="/pro/dialogs" className={h.seeAll}>
              Все
              <ChevronRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          </div>
          <div className={h.dialogs}>
            {dialogs.recent.slice(0, 4).map((d) => (
              <Link key={d.id} href={dialogHref("specialist", d.id)} className={h.dialog}>
                <ConvAvatar who={d.counterpart} size={36} />
                <span className={h.dialogText}>
                  <strong>{d.counterpart.name}</strong>
                  <span>
                    {d.next_call ? `Созвон ${dayLabel(d.next_call.scheduled_at).toLowerCase()} в ${time(d.next_call.scheduled_at)}` : d.last_message?.text || "Нет сообщений"}
                  </span>
                </span>
                {d.unread > 0 && <span className={h.unread}>{d.unread}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NextSessionStrip({ next }: { next: Session }) {
  return (
    <section className={r.strip} aria-label="Следующий созвон">
      <span className={r.stripFace} aria-hidden>
        <AvatarThumb config={next.client.avatar_config} seed={next.client.alias} size={40} background="rgba(255,255,255,.18)" />
      </span>
      <span className={r.stripText}>
        <strong>{next.client.alias}</strong>
        <span>
          {dayLabel(next.scheduled_at)}, {time(next.scheduled_at)} · {next.duration_minutes} мин
        </span>
      </span>
      {next.can_join && (
        <Button variant="white" size="sm" href={`/room/${next.id}`} icon={<Video size={16} strokeWidth={1.8} />}>
          Войти
        </Button>
      )}
    </section>
  );
}

/** «сент.» */
function monthShort() {
  return new Date().toLocaleDateString("ru-RU", { month: "short" });
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
      text: "Обычно до 2 рабочих дней.",
    },
    rejected: {
      icon: <CircleAlert size={22} strokeWidth={1.8} />,
      tone: p.statusRejected,
      title: "Проверка не пройдена",
      text: "Дополните профиль и ответьте на письмо администратора.",
    },
    suspended: {
      icon: <PauseCircle size={22} strokeWidth={1.8} />,
      tone: p.statusRejected,
      title: "Профиль приостановлен",
      text: "Новые клиенты не могут записаться. Ответьте на письмо администратора.",
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
