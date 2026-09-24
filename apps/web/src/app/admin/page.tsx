"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button, Card, CardHead, EmptyState, Skeleton, Stat } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { SessionsTable } from "@/components/admin/SessionsTable";
import { LoadError } from "@/components/pro/controls";
import { adminApi } from "@/lib/api/endpoints";
import type { AdminStats, PsychologistPrivate, Session } from "@/lib/api/types";
import { plural, rub } from "@/lib/format";
import s from "@/components/pro/pro.module.css";
import ad from "@/components/admin/admin.module.css";

const monthName = () =>
  new Date().toLocaleDateString("ru-RU", { month: "long" });

export default function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [pending, setPending] = useState<PsychologistPrivate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [a, b, c] = await Promise.allSettled([
      adminApi.stats(),
      adminApi.sessions(),
      adminApi.psychologists("pending"),
    ]);
    if (a.status === "fulfilled") setStats(a.value);
    setSessions(b.status === "fulfilled" ? b.value : []);
    setPending(c.status === "fulfilled" ? c.value : []);
    if (a.status === "rejected")
      setError(`${(a.reason as Error).message} Попробуйте обновить сводку.`);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const n = stats?.pending ?? pending?.length ?? 0;
  const queue =
    !stats && !pending ? (
      <Skeleton height={320} radius={22} />
    ) : (
      <section className={s.accent} aria-label="Заявки на проверку">
        <div className={s.accentKicker}>Заявки на проверку</div>
        <div>
          <div className={s.accentBig}>{n}</div>
          <div className={s.accentText} style={{ marginTop: 6 }}>
            {n
              ? `${plural(n, "специалист ждёт", "специалиста ждут", "специалистов ждут")} решения. Специалистам обещан ответ в течение 2 рабочих дней.`
              : "Новых заявок нет. Когда специалист зарегистрируется, он появится здесь."}
          </div>
        </div>
        {pending && pending.length > 0 && (
          <ul className={s.accentList}>
            {pending.slice(0, 4).map((p) => (
              <li key={p.id} className={s.accentRow}>
                <span>{p.display_name}</span>
                <span>{p.created_at ? waited(p.created_at) : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <Button variant="white" size="lg" block href="/admin/psychologists">
          {n ? "Проверить заявки" : "Открыть специалистов"}
        </Button>
      </section>
    );

  return (
    <>
      <PageHeader
        title={`Сводка за ${monthName()}`}
        sub="Заявки специалистов, сессии и оборот платформы в этом месяце."
        action={
          <Button
            variant="primary"
            href="/admin/sessions"
            icon={<CalendarDays size={18} />}
          >
            Все сессии
          </Button>
        }
      />
      <WithRail rail={<div className={ad.railDesktop}>{queue}</div>}>
        <div className={ad.railMobile}>{queue}</div>
        {error && <LoadError text={error} onRetry={load} />}
        <div className={s.stats}>
          {stats ? (
            <>
              <Stat
                label="Клиентов"
                value={stats.clients}
                note="Анонимные аккаунты"
              />
              <Stat
                label="Специалистов"
                value={stats.psychologists}
                note="Все статусы"
              />
              <Stat
                label="Ждут проверки"
                value={stats.pending}
                tone={stats.pending > 0 ? "warning" : undefined}
                note={
                  stats.pending > 0 ? "Нужно ваше решение" : "Очередь пуста"
                }
              />
              <Stat
                label="Сессий сегодня"
                value={stats.sessions_today}
                note={`${stats.sessions_month} за ${monthName()}`}
              />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={116} radius={22} />
            ))
          )}
        </div>
        {stats && (
          <Card as="section">
            <CardHead
              title={`Оборот за ${monthName()}`}
              sub="Сумма оплаченных клиентами сессий, до комиссии и выплат специалистам"
            />
            <div
              style={{
                fontSize: "var(--t-44)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}
            >
              {rub(stats.revenue_month_rub)}
            </div>
            <p
              className={s.muted}
              style={{ marginTop: 10, fontSize: "var(--t-13)" }}
            >
              Комиссия платформы 20%, это примерно{" "}
              {rub(stats.revenue_month_rub * 0.2)}
            </p>
          </Card>
        )}
        <Card as="section">
          <CardHead
            title="Последние сессии"
            action={
              sessions && sessions.length > 6 ? (
                <Button size="sm" variant="ghost" href="/admin/sessions">
                  Все {sessions.length}
                </Button>
              ) : undefined
            }
          />
          {!sessions ? (
            <Skeleton height={160} />
          ) : sessions.length ? (
            <SessionsTable sessions={sessions.slice(0, 6)} compact />
          ) : (
            <EmptyState
              icon={<CalendarDays size={22} />}
              title="Сессий пока нет"
              text="Первая запись клиента появится здесь сразу после оплаты."
            />
          )}
        </Card>
      </WithRail>
    </>
  );
}

function waited(iso: string) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return "только что";
  if (h < 24) return `${h} ${plural(h, "час", "часа", "часов")}`;
  const d = Math.floor(h / 24);
  return `${d} ${plural(d, "день", "дня", "дней")}`;
}
