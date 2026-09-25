"use client";

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
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не получилось загрузить баланс."));
  }, [sessionId]);
  useEffect(load, [load]);

  const amount = call?.amount_kopecks ?? Math.round(amountRub * 100);
  const balance = call?.balance_kopecks ?? summary?.balance_kopecks ?? 0;
  const shortfall = Math.max(0, amount - balance);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await billingApi.payCall(sessionId);
      setCall(c);
      notifyBalanceChanged();
      toast("Созвон оплачен");
      onPaid();
    } catch (e) {
      if (isInsufficient(e)) {
        load();
        setTopup(true);
      } else setError(e instanceof ApiError ? e.message : "Не получилось оплатить. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  if (!call || !summary) {
    return error ? (
      <div className={s.error} role="alert">
        <AlertCircle size={16} aria-hidden /> <span>{error}</span>{" "}
        <button type="button" onClick={load} style={{ background: "none", border: 0, color: "inherit", textDecoration: "underline", cursor: "pointer" }}>
          Повторить
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
        <span>Оплачено с баланса: {rubK(call.hold?.amount_kopecks ?? amount)}</span>
      </div>
    );
  }

  if (!call.payable) {
    return (
      <div className={s.error} role="status">
        <AlertCircle size={16} aria-hidden />
        <span>Эту запись уже нельзя оплатить: время освободилось или созвон отменён. Выберите время заново.</span>
      </div>
    );
  }

  const rules = summary.cancel_rules;
  return (
    <div className={s.pay}>
      <dl className={s.sum}>
        <div>
          <dt>Стоимость созвона</dt>
          <dd>{rubK(amount)}</dd>
        </div>
        <div>
          <dt>На балансе</dt>
          <dd>{rubK(balance)}</dd>
        </div>
        {shortfall > 0 ? (
          <div className={s.short}>
            <dt>Не хватает</dt>
            <dd>{rubK(shortfall)}</dd>
          </div>
        ) : (
          <div className={s.ok}>
            <dt>Останется после оплаты</dt>
            <dd>{rubK(balance - amount)}</dd>
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
            Пополнить на {rubK(Math.max(summary.topup.min_kopecks, Math.ceil(shortfall / 10000) * 10000))}
          </Button>
        )
      ) : (
        <Button variant="primary" size="lg" block loading={busy} icon={<Wallet size={18} />} onClick={pay}>
          Оплатить с баланса
        </Button>
      )}

      <div className={s.hint}>
        Деньги замораживаются на балансе и уходят специалисту только после созвона. Отмена не позже чем за{" "}
        {rules.free_cancel_hours} ч — полный возврат на баланс
        {rules.late_cancel_penalty_percent
          ? `, позже — возвращается ${100 - rules.late_cancel_penalty_percent}%.`
          : "."}{" "}
        Если специалист не пришёл — вернём всё.
      </div>
    </div>
  );
}
