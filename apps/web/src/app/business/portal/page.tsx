"use client";

import { t, tj } from "@/lib/i18n";
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
        sub={t("Сводка программы заботы о\u00a0сотрудниках. Только общие цифры: кто пользуется программой, не\u00a0видит никто.")}
        action={
          <Button href="/business/portal/codes" variant="primary" icon={<KeyRound size={18} />}>
            {t("Выпустить коды")}
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
          <strong>{t("Сотрудники анонимны")}</strong>
          {t("Мы\u00a0показываем цифры, только когда программой воспользовались не\u00a0меньше")}{" "}{k}{" "}{t("человек за\u00a0период, и\u00a0не\u00a0раньше, чем\u00a0месяц закончится. В\u00a0отчётах нет имён, дат и\u00a0специалистов по\u00a0отдельным людям.")}
        </span>
      </div>

      <div className={s.grid}>
        <div className={`${s.kpi} ${s.kpiAccent}`}>
          <span className={s.kpiLabel}>
            <Wallet size={16} aria-hidden />{" "}{t("Бюджет на")}{" "}{dateRu(d.budget.as_of)}
          </span>
          <span className={s.kpiValue}>{rubK(d.budget.available_kopecks)}</span>
          <span className={s.kpiSub}>
            {d.budget.topups_this_month_kopecks > 0
              ? t(`включая пополнение {rubK} в\u00a0этом месяце`, { rubK: rubK(d.budget.topups_this_month_kopecks) })
              : t("остаток на\u00a0начало месяца")}
          </span>
          {d.budget.low && (
            <span className={s.warn}>
              <AlertTriangle size={14} aria-hidden />{" "}{t("Бюджет заканчивается")}
            </span>
          )}
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>
            <BarChart3 size={16} aria-hidden />{" "}{t("Потрачено")}
          </span>
          <span className={s.kpiValue}>{rubK(d.totals.spent_kopecks)}</span>
          <span className={s.kpiSub}>{t("за\u00a0закрытые месяцы")}</span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>
            <KeyRound size={16} aria-hidden />{" "}{t("Коды")}
          </span>
          <span className={s.kpiValue}>{d.codes.issued}</span>
          <span className={s.kpiSub}>
            {t("выпущено, активировано на")}{" "}{dateRu(d.codes.as_of)}: <Hidden value={d.codes.activated} k={k} />
          </span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>
            <Smile size={16} aria-hidden />{" "}{t("Оценка специалистов")}
          </span>
          {d.satisfaction.average !== null ? (
            <>
              <span className={s.kpiValue}>{tj("{v} из\u00a05", { v: d.satisfaction.average.toFixed(1) })}</span>
              <span className={s.kpiSub}>
                {d.satisfaction.count} {plural(d.satisfaction.count ?? 0, "оценка", "оценки", "оценок")}{" "}{t("участников")}
              </span>
            </>
          ) : (
            <>
              <span className={s.kpiHidden}>{t("Пока скрыто")}</span>
              <span className={s.kpiSub}>{tj("появится, когда оценят не\u00a0меньше {k} человек", { k })}</span>
            </>
          )}
        </div>
      </div>

      <Card as="section">
        <CardHead title={t("По\u00a0месяцам")} icon={<CalendarRange size={18} />} sub={t("Текущий месяц появится, когда закончится")} />
        {d.monthly.length === 0 ? (
          <EmptyState
            art={<EmptyArt scene="sparkles" />}
            title={t("Пока нечего показать")}
            text={t("Раздайте коды сотрудникам. Первые цифры появятся после окончания месяца, в\u00a0котором ими воспользовались.")}
            action={
              <Button href="/business/portal/codes" variant="soft">
                {t("К\u00a0кодам")}
              </Button>
            }
          />
        ) : (
          <MonthlyTable rows={d.monthly} k={k} />
        )}
      </Card>

      <Card as="section">
        <CardHead title={t("С\u00a0чем\u00a0приходят")} icon={<BarChart3 size={18} />} sub={t("Доля созвонов по\u00a0направлению специалиста за\u00a012\u00a0месяцев")} />
        {!d.topics.visible ? (
          <p className={s.muted}>
            {tj("Скрыто: программой воспользовались меньше {k} человек. Так никто не\u00a0сможет догадаться, с\u00a0чем\u00a0пришёл конкретный сотрудник.", { k })}
          </p>
        ) : (
          <div className={s.bars} role="list">
            {d.topics.rows.map((r) => (
              <TopicBar key={r.topic} label={r.label} share={r.share} />
            ))}
            {!!d.topics.other_share && <TopicBar label={t("Другие темы")} share={d.topics.other_share} muted />}
            <p className={s.muted}>{tj("Тема показывается отдельно, только если к\u00a0ней обращались не\u00a0меньше {k} человек.", { k })}</p>
          </div>
        )}
      </Card>

      {p && (
        <Card as="section">
          <CardHead
            title={t("Программа")}
            icon={<ShieldCheck size={18} />}
            action={
              <Button href="/business/portal/program" variant="ghost" size="sm">
                {t("Настроить")}
              </Button>
            }
          />
          <p className={s.muted}>
            {p.name}: {limits.join(t(" и ")) || t("без\u00a0лимита")}{" "}{t("на\u00a0сотрудника в")}{" "}{PERIOD_LABEL[p.period]}.{" "}
            {p.services.map((x) => SERVICE_LABEL[x]).join(", ")}.
            {p.expires_on ? t(` Действует до\u00a0{dateRu}.`, { dateRu: dateRu(p.expires_on, { day: "numeric", month: "long", year: "numeric" }) }) : ""}
          </p>
        </Card>
      )}
    </Stack>
  );
}

function TopicBar({ label, share, muted }: { label: string; share: number; muted?: boolean }) {
  const pct = Math.round(share * 100);
  return (
    <div className={s.barRow} role="listitem" title={t(`{label}: {pct}% созвонов`, { label, pct })}>
      <span>{label}</span>
      <span className={s.barTrack}>
        <span className={s.barFill} style={{ width: `${Math.max(2, pct)}%`, background: muted ? "var(--c-faint)" : "var(--c-primary)" }} />
      </span>
      <span className={s.barPct}>{pct}%</span>
    </div>
  );
}
