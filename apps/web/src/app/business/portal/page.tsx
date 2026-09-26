"use client";

import { AlertTriangle, BarChart3, CalendarRange, EyeOff, KeyRound, ShieldCheck, Smile, Wallet } from "lucide-react";
import { Button, Card, CardHead, EmptyState, Skeleton } from "@/ui";
import { PageHeader, Stack } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { EmptyArt } from "@/components/illustrations";
import { usePortal } from "@/components/business/PortalGate";
import { Hidden, MonthlyTable } from "@/components/business/Aggregates";
import { businessApi, dateRu, PERIOD_LABEL, SERVICE_LABEL, type Dashboard } from "@/lib/api/business";
import { rubK } from "@/lib/api/billing";
import { plural } from "@/lib/format";
import s from "@/components/business/business.module.css";

export default function PortalDashboard() {
  const me = usePortal();
  const d = useLoad(() => businessApi.dashboard(), []);
  return (
    <>
      <PageHeader
        title={me.company.name}
        sub="Сводка программы заботы о сотрудниках. Только общие цифры: кто пользуется программой, не видит никто."
        action={
          <Button href="/business/portal/codes" variant="primary" icon={<KeyRound size={18} />}>
            Выпустить коды
          </Button>
        }
      />
      {d.error ? <ErrorBlock message={d.error} onRetry={d.reload} /> : !d.data ? <Loading /> : <Body d={d.data} />}
    </>
  );
}

function Loading() {
  return (
    <Stack>
      <div className={s.grid}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={132} radius={22} />
        ))}
      </div>
      <Skeleton height={260} radius={22} />
    </Stack>
  );
}

function Body({ d }: { d: Dashboard }) {
  const k = d.k_min;
  const p = d.program;
  const limits: string[] = [];
  if (p?.amount_kopecks) limits.push(rubK(p.amount_kopecks));
  if (p?.calls_limit) limits.push(`${p.calls_limit} ${plural(p.calls_limit, "созвон", "созвона", "созвонов")}`);
  return (
    <Stack>
      <div className={s.privacyBanner}>
        <EyeOff size={22} aria-hidden />
        <span>
          <strong>Сотрудники анонимны</strong>
          Мы показываем цифры, только когда программой воспользовались не меньше {k} человек за период, и не раньше, чем месяц
          закончится. В отчётах нет имён, дат и специалистов по отдельным людям.
        </span>
      </div>

      <div className={s.grid}>
        <div className={`${s.kpi} ${s.kpiAccent}`}>
          <span className={s.kpiLabel}>
            <Wallet size={16} aria-hidden /> Бюджет на {dateRu(d.budget.as_of)}
          </span>
          <span className={s.kpiValue}>{rubK(d.budget.available_kopecks)}</span>
          <span className={s.kpiSub}>
            {d.budget.topups_this_month_kopecks > 0
              ? `включая пополнение ${rubK(d.budget.topups_this_month_kopecks)} в этом месяце`
              : "остаток на начало месяца"}
          </span>
          {d.budget.low && (
            <span className={s.warn}>
              <AlertTriangle size={14} aria-hidden /> Бюджет заканчивается
            </span>
          )}
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>
            <BarChart3 size={16} aria-hidden /> Потрачено
          </span>
          <span className={s.kpiValue}>{rubK(d.totals.spent_kopecks)}</span>
          <span className={s.kpiSub}>за закрытые месяцы</span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>
            <KeyRound size={16} aria-hidden /> Коды
          </span>
          <span className={s.kpiValue}>{d.codes.issued}</span>
          <span className={s.kpiSub}>
            выпущено, активировано на {dateRu(d.codes.as_of)}: <Hidden value={d.codes.activated} k={k} />
          </span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>
            <Smile size={16} aria-hidden /> Оценка специалистов
          </span>
          {d.satisfaction.average !== null ? (
            <>
              <span className={s.kpiValue}>{d.satisfaction.average.toFixed(1)} из 5</span>
              <span className={s.kpiSub}>
                {d.satisfaction.count} {plural(d.satisfaction.count ?? 0, "оценка", "оценки", "оценок")} участников
              </span>
            </>
          ) : (
            <>
              <span className={s.kpiHidden}>Пока скрыто</span>
              <span className={s.kpiSub}>появится, когда оценят не меньше {k} человек</span>
            </>
          )}
        </div>
      </div>

      <Card as="section">
        <CardHead title="По месяцам" icon={<CalendarRange size={18} />} sub="Текущий месяц появится, когда закончится" />
        {d.monthly.length === 0 ? (
          <EmptyState
            art={<EmptyArt scene="sparkles" />}
            title="Пока нечего показать"
            text="Раздайте коды сотрудникам. Первые цифры появятся после окончания месяца, в котором ими воспользовались."
            action={
              <Button href="/business/portal/codes" variant="soft">
                К кодам
              </Button>
            }
          />
        ) : (
          <MonthlyTable rows={d.monthly} k={k} />
        )}
      </Card>

      <Card as="section">
        <CardHead title="С чем приходят" icon={<BarChart3 size={18} />} sub="Доля созвонов по направлению специалиста за 12 месяцев" />
        {!d.topics.visible ? (
          <p className={s.muted}>
            Скрыто: программой воспользовались меньше {k} человек. Так никто не сможет догадаться, с чем пришёл конкретный
            сотрудник.
          </p>
        ) : (
          <div className={s.bars} role="list">
            {d.topics.rows.map((r) => (
              <TopicBar key={r.topic} label={r.label} share={r.share} />
            ))}
            {!!d.topics.other_share && <TopicBar label="Другие темы" share={d.topics.other_share} muted />}
            <p className={s.muted}>Тема показывается отдельно, только если к ней обращались не меньше {k} человек.</p>
          </div>
        )}
      </Card>

      {p && (
        <Card as="section">
          <CardHead
            title="Программа"
            icon={<ShieldCheck size={18} />}
            action={
              <Button href="/business/portal/program" variant="ghost" size="sm">
                Настроить
              </Button>
            }
          />
          <p className={s.muted}>
            {p.name}: {limits.join(" и ") || "без лимита"} на сотрудника в {PERIOD_LABEL[p.period]}.{" "}
            {p.services.map((x) => SERVICE_LABEL[x]).join(", ")}.
            {p.expires_on ? ` Действует до ${dateRu(p.expires_on, { day: "numeric", month: "long", year: "numeric" })}.` : ""}
          </p>
        </Card>
      )}
    </Stack>
  );
}

function TopicBar({ label, share, muted }: { label: string; share: number; muted?: boolean }) {
  const pct = Math.round(share * 100);
  return (
    <div className={s.barRow} role="listitem" title={`${label}: ${pct}% созвонов`}>
      <span>{label}</span>
      <span className={s.barTrack}>
        <span className={s.barFill} style={{ width: `${Math.max(2, pct)}%`, background: muted ? "var(--c-faint)" : "var(--c-primary)" }} />
      </span>
      <span className={s.barPct}>{pct}%</span>
    </div>
  );
}
