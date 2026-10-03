"use client";

import { t, tj } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertCircle, CheckCircle2, Wallet } from "lucide-react";
import { Button, Skeleton, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import {
  billingApi,
  isInsufficient,
  notifyBalanceChanged,
  rubK,
  type BalanceSummary,
  type CallPayment,
} from "@/lib/api/billing";
import { TopUpForm } from "./TopUpForm";
import s from "./billing.module.css";

/**
 * Pay for a booked call from the anonymous balance (contract with C1).
 * Shows the balance, «Оплатить с баланса» when there is enough, otherwise
 * the top-up flow (returns to the current page after paying).
 */
export function PayForCall({
  sessionId,
  amountRub,
  onPaid,
}: {
  sessionId: string;
  amountRub: number;
  onPaid(): void;
}) {
  const toast = useToast();
  const pathname = usePathname() ?? "/app/balance";
  const [call, setCall] = useState<CallPayment | null>(null);
  const [summary, setSummary] = useState<BalanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [topup, setTopup] = useState(false);

  const load = useCallback(() => {
    setError(null);
    Promise.all([billingApi.call(sessionId), billingApi.summary()])
      .then(([c, sm]) => {
        setCall(c);
        setSummary(sm);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : t("Не\u00a0получилось загрузить баланс.")));
  }, [sessionId]);
  useEffect(load, [load]);

  const amount = call?.amount_kopecks ?? Math.round(amountRub * 100);
  const balance = call?.balance_kopecks ?? summary?.balance_kopecks ?? 0;
  const company = call?.company_kopecks ?? 0;
  const personal = amount - company;
  const shortfall = Math.max(0, personal - balance);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await billingApi.payCall(sessionId);
      setCall(c);
      notifyBalanceChanged();
      toast(t("Созвон оплачен"));
      onPaid();
    } catch (e) {
      if (isInsufficient(e)) {
        load();
        setTopup(true);
      } else setError(e instanceof ApiError ? e.message : t("Не\u00a0получилось оплатить. Попробуйте ещё раз."));
    } finally {
      setBusy(false);
    }
  };

  if (!call || !summary) {
    return error ? (
      <div className={s.error} role="alert">
        <AlertCircle size={16} aria-hidden /> <span>{error}</span>{" "}
        <button type="button" onClick={load} style={{ background: "none", border: 0, color: "inherit", textDecoration: "underline", cursor: "pointer" }}>
          {t("Повторить")}
        </button>
      </div>
    ) : (
      <div className={s.pay}>
        <Skeleton height={132} radius={14} />
        <Skeleton height={52} radius={14} />
      </div>
    );
  }

  if (call.paid) {
    return (
      <div className={s.paidState}>
        <CheckCircle2 size={22} aria-hidden />
        <span>{tj("Оплачено с\u00a0баланса: {rubK}", { rubK: rubK(call.hold?.amount_kopecks ?? amount) })}</span>
      </div>
    );
  }

  if (!call.payable) {
    return (
      <div className={s.error} role="status">
        <AlertCircle size={16} aria-hidden />
        <span>{t("Эту запись уже нельзя оплатить: время освободилось или\u00a0созвон отменён. Выберите время заново.")}</span>
      </div>
    );
  }

  const rules = summary.cancel_rules;
  return (
    <div className={s.pay}>
      <dl className={s.sum}>
        <div>
          <dt>{t("Стоимость созвона")}</dt>
          <dd>{rubK(amount)}</dd>
        </div>
        {company > 0 && (
          <div className={s.ok}>
            <dt>{t("Оплатит программа компании")}</dt>
            <dd>{rubK(company)}</dd>
          </div>
        )}
        <div>
          <dt>{t("На\u00a0балансе")}</dt>
          <dd>{rubK(balance)}</dd>
        </div>
        {shortfall > 0 ? (
          <div className={s.short}>
            <dt>{t("Не\u00a0хватает")}</dt>
            <dd>{rubK(shortfall)}</dd>
          </div>
        ) : (
          <div className={s.ok}>
            <dt>{t("Останется после оплаты")}</dt>
            <dd>{rubK(balance - personal)}</dd>
          </div>
        )}
      </dl>

      {error && (
        <div className={s.error} role="alert">
          <AlertCircle size={16} aria-hidden /> <span>{error}</span>
        </div>
      )}

      {shortfall > 0 ? (
        topup ? (
          <TopUpForm settings={summary.topup} suggestRub={shortfall / 100} returnTo={pathname} />
        ) : (
          <Button variant="primary" size="lg" block icon={<Wallet size={18} />} onClick={() => setTopup(true)}>
            {tj("Пополнить на {rubK}", { rubK: rubK(Math.max(summary.topup.min_kopecks, Math.ceil(shortfall / 10000) * 10000)) })}
          </Button>
        )
      ) : (
        <Button variant="primary" size="lg" block loading={busy} icon={<Wallet size={18} />} onClick={pay}>
          {personal <= 0 ? t("Оплатить по\u00a0программе компании") : t("Оплатить с\u00a0баланса")}
        </Button>
      )}

      <div className={s.hint}>
        {t("Деньги замораживаются на\u00a0балансе и\u00a0уходят специалисту только после созвона. Отмена не\u00a0позже чем\u00a0за")}{" "}
        {rules.free_cancel_hours}{" "}{t("ч\u00a0— полный возврат на\u00a0баланс")}
        {rules.late_cancel_penalty_percent
          ? t(`, позже\u00a0— возвращается {v}%.`, { v: 100 - rules.late_cancel_penalty_percent })
          : "."}{" "}
        {t("Если специалист не\u00a0пришёл\u00a0— вернём всё.")}
      </div>
    </div>
  );
}
