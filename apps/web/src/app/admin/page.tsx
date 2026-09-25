"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, BadgeCheck, Flag, Headset, ScrollText } from "lucide-react";
import { Button, Card, CardHead, EmptyState, Skeleton, Stat } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { useStaff } from "@/components/admin/AdminShell";
import { ago, actionLabel, HealthDot } from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { staffApi, type Dashboard } from "@/lib/api/staff";
import { plural, rub } from "@/lib/format";
import pro from "@/components/pro/pro.module.css";
import ad from "@/components/admin/admin.module.css";
import s from "@/components/admin/staff.module.css";
import { EmptyArt } from "@/components/illustrations";

export default function AdminDashboard() {
  const { me, can } = useStaff();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    staffApi
      .dashboard()
      .then(setData)
      .catch((e) => setError(`${(e as Error).message} Попробуйте обновить сводку.`));
  }, []);
  useEffect(load, [load]);

  const today = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  const queue = !data ? (
    <Skeleton height={300} radius={28} />
  ) : (
    <AttentionCard data={data} can={can} />
  );

  return (
    <>
      <PageHeader title="Сводка" sub={`${today.charAt(0).toUpperCase() + today.slice(1)}. Вы вошли как ${me.role_label.toLowerCase()}.`} />
      {!me.totp_enabled && (me.role === "owner" || me.role === "admin") && (
        <div className={s.notice}>
          <span>
            <strong>Включите двухфакторную защиту.</strong> У вашей роли доступ к деньгам и аккаунтам команды: одного пароля мало.
          </span>
          <Button size="sm" variant="primary" href="/admin/account">
            Настроить
          </Button>
        </div>
      )}
      <WithRail rail={<div className={ad.railDesktop}>{queue}</div>}>
        <div className={ad.railMobile}>{queue}</div>
        {error && <LoadError text={error} onRetry={load} />}
        <div className={pro.stats}>
          {data ? (
            <>
              <Stat label="Клиентов" value={data.users.clients} note={`+${data.users.new_week} за неделю`} />
              <Stat
                label="Специалистов в каталоге"
                value={data.specialists.active}
                note={data.specialists.suspended ? `${data.specialists.suspended} приостановлено` : "Все активны"}
              />
              <Stat label="Сессий сегодня" value={data.sessions.today} note={`${data.sessions.week} за 7 дней`} />
              {data.revenue ? (
                <Stat label="Оборот за месяц, ₽" value={new Intl.NumberFormat("ru-RU").format(data.revenue.month_rub)} note={`Комиссия ${rub(data.revenue.month_fee_rub)}`} />
              ) : (
                <Stat label="Впереди" value={data.sessions.upcoming} note="Оплаченных сессий" />
              )}
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} height={116} radius={22} />)
          )}
        </div>

        <Card as="section">
          <CardHead title="Сессии по дням" sub="Последние 14 дней, без черновиков" />
          {data ? <SessionsChart series={data.series} /> : <Skeleton height={160} />}
        </Card>

        {data?.system && (
          <Card as="section">
            <CardHead
              icon={<Activity size={20} />}
              title="Система"
              sub={data.system.status === "ok" ? "Все сервисы отвечают" : "Есть проблемы, проверьте раздел «Система»"}
              action={
                <Button size="sm" variant="ghost" href="/admin/system">
                  Подробнее
                </Button>
              }
            />
            <div className={s.healthRow}>
              <HealthDot ok={data.system.db.status === "ok"} label="База данных" />
              <HealthDot ok={data.system.cache.status === "ok"} label={data.system.cache.redis ? "Redis" : "Кэш"} />
              <HealthDot ok={data.system.channels.status === "ok"} label="Видеосигналинг" />
              <HealthDot
                ok={data.system.errors_24h === 0}
                label={`${data.system.errors_24h} ${plural(data.system.errors_24h, "ошибка", "ошибки", "ошибок")} за сутки`}
              />
            </div>
          </Card>
        )}

        {data?.recent_audit && (
          <Card as="section">
            <CardHead
              icon={<ScrollText size={20} />}
              title="Действия команды"
              action={
                <Button size="sm" variant="ghost" href="/admin/audit">
                  Весь журнал
                </Button>
              }
            />
            {data.recent_audit.length ? (
              <ul className={s.feed}>
                {data.recent_audit.map((e) => (
                  <li key={e.id}>
                    <span>
                      <strong>{e.actor.alias || "система"}</strong> {actionLabel(e.action).toLowerCase()}
                      {e.target.label ? <span className={s.muted}>: {e.target.label}</span> : null}
                    </span>
                    <time className={s.muted}>{ago(e.at)}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState art={<EmptyArt scene="moon" />} title="Журнал пуст" text="Здесь появятся блокировки, решения по заявкам и другие действия сотрудников." />
            )}
          </Card>
        )}
      </WithRail>
    </>
  );
}

function AttentionCard({ data, can }: { data: Dashboard; can: ReturnType<typeof useStaff>["can"] }) {
  const rows: { icon: React.ReactNode; label: string; n: number; href: string }[] = [];
  if (can("specialists.view"))
    rows.push({ icon: <BadgeCheck size={18} />, label: "Заявки специалистов", n: data.specialists.pending, href: "/admin/specialists?status=pending" });
  if (can("reports.view")) rows.push({ icon: <Flag size={18} />, label: "Новые жалобы", n: data.reports.open, href: "/admin/moderation" });
  if (can("support.inbox") && data.support)
    rows.push({ icon: <Headset size={18} />, label: "Непрочитанные обращения", n: data.support.unread, href: "/admin/support" });
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <section className={pro.accent} aria-label="Требует внимания">
      <div className={pro.accentKicker}>Требует внимания</div>
      <div>
        <div className={pro.accentBig}>{total}</div>
        <div className={pro.accentText} style={{ marginTop: 6 }}>
          {total ? "Очереди, которые ждут решения команды." : "Все очереди разобраны. Хорошая работа."}
        </div>
      </div>
      {rows.length > 0 && (
        <ul className={s.attention}>
          {rows.map((r) => (
            <li key={r.href}>
              <Link href={r.href}>
                {r.icon}
                <span>{r.label}</span>
                <strong>{r.n}</strong>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionsChart({ series }: { series: Dashboard["series"] }) {
  const max = Math.max(1, ...series.map((d) => d.sessions));
  const total = series.reduce((a, d) => a + d.sessions, 0);
  if (!total) return <EmptyState art={<EmptyArt scene="calendar" />} title="Сессий не было" text="Как только клиенты начнут записываться, здесь появится динамика." />;
  const label = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return (
    <figure className={s.chart} aria-label={`Сессии по дням, всего ${total}`}>
      <div className={s.bars}>
        {series.map((d) => (
          <div key={d.date} className={s.barCol} tabIndex={0} aria-label={`${label(d.date)}: ${d.sessions}`}>
            <span className={s.barTip}>
              {label(d.date)}: <strong>{d.sessions}</strong>
            </span>
            <span className={s.bar} style={{ height: `${Math.max(d.sessions ? 6 : 0, (d.sessions / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <figcaption className={s.axis}>
        <span>{label(series[0].date)}</span>
        <span>
          Максимум {max} в день, всего {total}
        </span>
        <span>{label(series[series.length - 1].date)}</span>
      </figcaption>
      <table className="visually-hidden">
        <tbody>
          {series.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.sessions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
