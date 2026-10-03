"use client";

import { t as tt, tj } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { FlaskConical, Lock } from "lucide-react";
import { Button, Card, Skeleton, useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { ApiError } from "@/lib/api/client";
import { billingApi, notifyBalanceChanged, rubK, type TopUp } from "@/lib/api/billing";
import s from "@/components/billing/billing.module.css";

/**
 * Test checkout of the mock provider: stands in for the YooKassa page until
 * the shop is connected. Nothing is charged; the result goes through the same
 * server path as a verified YooKassa webhook.
 */
export default function MockCheckoutPage() {
  const toast = useToast();
  const [t, setT] = useState<TopUp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"succeeded" | "canceled" | null>(null);
  const [params, setParams] = useState<{ id: string; back: string } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const back = q.get("return") || "/app/balance";
    const id = q.get("topup") || "";
    setParams({ id, back: back.startsWith("/app/") && !back.startsWith("//") ? back : "/app/balance" });
    if (!id) {
      setError(tt("Платёж не\u00a0найден."));
      return;
    }
    billingApi
      .topUp(id)
      .then(setT)
      .catch((e) => setError(e instanceof ApiError ? e.message : tt("Платёж не\u00a0найден.")));
  }, []);

  const finish = async (outcome: "succeeded" | "canceled") => {
    if (!params) return;
    setBusy(outcome);
    try {
      await billingApi.mockCheckout(params.id, outcome);
      notifyBalanceChanged();
      const sep = params.back.includes("?") ? "&" : "?";
      window.location.href = `${params.back}${sep}topup=${params.id}`;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : tt("Не\u00a0получилось завершить оплату."), { error: true });
      setBusy(null);
    }
  };

  return (
    <div className={s.checkoutWrap}>
      <PageHeader title={tt("Тестовая оплата")} sub={tt("Так будет выглядеть переход на\u00a0страницу ЮKassa. Деньги не\u00a0списываются.")} />
      {error ? (
        <Card>
          <p>{error}</p>
          <Button href="/app/balance">{tt("К\u00a0балансу")}</Button>
        </Card>
      ) : !t ? (
        <Skeleton height={280} radius={22} />
      ) : (
        <>
          <div className={s.fakeCard} aria-hidden>
            <div className={s.fakeRow}>
              <span>Aprosop test</span>
              <span>{tt("МИР")}</span>
            </div>
            <div className={s.fakeChip} />
            <div className={s.fakeNumber}>2200 •••• •••• 0000</div>
            <div className={s.fakeRow}>
              <span>{tt("ТЕСТОВАЯ КАРТА")}</span>
              <span>12/30</span>
            </div>
          </div>
          <Card>
            <div className={s.stack}>
              <dl className={s.sum}>
                <div>
                  <dt>{tt("К\u00a0оплате")}</dt>
                  <dd>{rubK(t.amount_kopecks)}</dd>
                </div>
                <div>
                  <dt>{tt("Получатель")}</dt>
                  <dd>Aprosop</dd>
                </div>
              </dl>
              {t.status !== "pending" ? (
                <>
                  <p className={s.hint}>{tt("Этот платёж уже завершён.")}</p>
                  <Button href={params?.back ?? "/app/balance"}>{tt("Вернуться")}</Button>
                </>
              ) : (
                <>
                  <div className={s.testNote}>
                    <FlaskConical size={16} aria-hidden />
                    <span>{tt("Тестовая касса работает, пока не\u00a0подключена ЮKassa. Выберите, чем\u00a0закончится оплата.")}</span>
                  </div>
                  <div className={s.actions}>
                    <Button variant="secondary" loading={busy === "canceled"} disabled={!!busy} onClick={() => finish("canceled")}>
                      {tt("Отказаться")}
                    </Button>
                    <Button variant="primary" icon={<Lock size={16} />} loading={busy === "succeeded"} disabled={!!busy} onClick={() => finish("succeeded")}>
                      {tj("Оплатить {rubK}", { rubK: rubK(t.amount_kopecks) })}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
