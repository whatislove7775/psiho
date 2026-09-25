"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, GitCommit, RefreshCw, Radio, Server, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge, Button, Card, CardHead, Skeleton, Stat } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { RequirePerm } from "@/components/admin/AdminShell";
import { dateTime, KV } from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { staffApi, type HealthCheck, type SystemStatus } from "@/lib/api/staff";
import { plural } from "@/lib/format";
import pro from "@/components/pro/pro.module.css";
import s from "@/components/admin/staff.module.css";

export default function Page_() {
  return (
    <RequirePerm perm="system.view">
      <SystemPage />
    </RequirePerm>
  );
}

function uptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

function SystemPage() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    setError(null);
    staffApi
      .system()
      .then(setData)
      .catch((e) => setError(`${(e as Error).message} Попробуйте ещё раз.`))
      .finally(() => setBusy(false));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <PageHeader
        title="Система"
        sub="Проверки выполняются при открытии страницы. Счётчик ошибок хранит только адрес и тип ошибки, без данных запросов."
        action={
          <Button variant="secondary" icon={<RefreshCw size={18} />} loading={busy} onClick={load}>
            Проверить снова
          </Button>
        }
      />
      {error && <LoadError text={error} onRetry={load} />}
      {!data ? (
        <div className={s.grid2}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={180} radius={22} />
          ))}
        </div>
      ) : (
        <div className={s.stack}>
          <div className={pro.stats}>
            <Stat
              label="Общее состояние"
              value={data.health.status === "ok" ? "В порядке" : "Есть сбои"}
              tone={data.health.status === "ok" ? "success" : "danger"}
              note={`Работает ${uptime(data.version.uptime_seconds)}`}
            />
            <Stat
              label="Ошибок сервера за сутки"
              value={data.errors.total}
              tone={data.errors.total ? "warning" : "success"}
              note="Ответы с кодом 5xx"
            />
            <Stat
              label="Миграции"
              value={data.migrations.pending_count ? `${data.migrations.pending_count} не применено` : "Применены"}
              tone={data.migrations.pending_count ? "danger" : "success"}
              note={data.migrations.applied_count ? `${data.migrations.applied_count} в базе` : undefined}
            />
            <Stat label="Записей в журнале" value={data.counts.audit_entries} note={`${data.counts.users} аккаунтов, ${data.counts.sessions} созвонов`} />
          </div>

          <div className={s.grid2}>
            <Card as="section">
              <CardHead icon={<Server size={20} />} title="Сервисы" />
              <ul className={s.checks}>
                <Check icon={<Database size={18} />} name="База данных" c={data.health.db} extra={data.health.db.engine} />
                <Check
                  icon={<Server size={18} />}
                  name={data.health.cache.redis ? "Redis (кэш)" : "Кэш"}
                  c={data.health.cache}
                  extra={data.health.cache.backend}
                />
                <Check icon={<Radio size={18} />} name="Channel layer (видеосигналинг, чаты)" c={data.health.channels} extra={data.health.channels.backend} />
                <li>
                  <span className={s.checkName}>
                    <ShieldCheck size={18} /> ЮKassa
                  </span>
                  {data.integrations.yookassa ? <Badge tone="success">Подключена</Badge> : <Badge tone="warning">Не настроена, тестовый режим</Badge>}
                </li>
              </ul>
            </Card>

            <Card as="section">
              <CardHead icon={<GitCommit size={20} />} title="Версия" />
              <KV
                items={[
                  ["Коммит", data.version.commit_short ? <code key="c" className={s.code} title={data.version.commit ?? ""}>{data.version.commit_short}</code> : "Не передан при сборке (GIT_COMMIT)"],
                  ...(data.version.version ? ([["Версия", data.version.version]] as [string, string][]) : []),
                  ...(data.version.built_at ? ([["Сборка", data.version.built_at]] as [string, string][]) : []),
                  ["Запущен", dateTime(data.version.started_at)],
                  ["Python и Django", `${data.version.python}, Django ${data.version.django}`],
                  ["Режим", data.version.debug ? <Badge key="d" tone="warning">DEBUG включён</Badge> : "Продакшен"],
                ]}
              />
            </Card>
          </div>

          <div className={s.grid2}>
            <Card as="section">
              <CardHead
                icon={<TriangleAlert size={20} />}
                title="Ошибки сервера"
                sub={data.errors.total ? `${data.errors.total} ${plural(data.errors.total, "ошибка", "ошибки", "ошибок")} за 24 часа` : "За сутки ошибок не было"}
              />
              <ErrorBars hourly={data.errors.hourly} />
              {data.errors.recent.length > 0 && (
                <ul className={s.miniList}>
                  {data.errors.recent.slice(0, 5).map((e, i) => (
                    <li key={i}>
                      <span>{dateTime(e.at)}</span>
                      <code className={s.code}>{e.path || "без адреса"}</code>
                      <span className={s.muted}>{e.error || e.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card as="section">
              <CardHead icon={<Database size={20} />} title="Миграции базы" />
              {data.migrations.pending_count ? (
                <>
                  <p className={s.errorText}>Не применены миграции. Выполните migrate при следующем деплое.</p>
                  <ul className={s.miniList}>
                    {data.migrations.pending.map((m) => (
                      <li key={m}>
                        <code className={s.code}>{m}</code>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className={s.muted}>Схема базы соответствует коду.</p>
              )}
              <h4 className={s.subhead}>Безопасность команды</h4>
              <KV
                items={[
                  ["2FA для владельца и админов", data.security.staff_2fa_required ? "Обязательна" : "По желанию (STAFF_REQUIRE_2FA выключен)"],
                  ["Сотрудников без 2FA", data.security.staff_without_2fa],
                ]}
              />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Check({ icon, name, c, extra }: { icon: React.ReactNode; name: string; c: HealthCheck; extra?: string }) {
  return (
    <li>
      <span className={s.checkName}>
        {icon} {name}
      </span>
      <span className={s.checkState}>
        <span className={s.muted}>
          {extra ? `${extra}, ` : ""}
          {c.latency_ms} мс
        </span>
        {c.status === "ok" ? <Badge tone="success">Работает</Badge> : <Badge tone="danger">{c.error || "Сбой"}</Badge>}
      </span>
    </li>
  );
}

function ErrorBars({ hourly }: { hourly: number[] }) {
  const max = Math.max(1, ...hourly);
  const now = new Date().getHours();
  return (
    <figure className={s.chart} aria-label="Ошибки по часам за сутки">
      <div className={`${s.bars} ${s.barsSmall}`}>
        {hourly.map((n, i) => {
          const hour = (now - (hourly.length - 1 - i) + 24) % 24;
          return (
            <div key={i} className={s.barCol} tabIndex={0} aria-label={`${hour}:00: ${n}`}>
              <span className={s.barTip}>
                {String(hour).padStart(2, "0")}:00: <strong>{n}</strong>
              </span>
              <span className={`${s.bar} ${s.barDanger}`} style={{ height: `${n ? Math.max(6, (n / max) * 100) : 0}%` }} />
            </div>
          );
        })}
      </div>
      <figcaption className={s.axis}>
        <span>24 часа назад</span>
        <span>Сейчас</span>
      </figcaption>
    </figure>
  );
}
