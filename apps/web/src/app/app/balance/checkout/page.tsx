"use client";

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
      setError("Платёж не найден.");
      return;
    }
    billingApi
      .topUp(id)
      .then(setT)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Платёж не найден."));
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
      toast(e instanceof ApiError ? e.message : "Не получилось завершить оплату.", { error: true });
      setBusy(null);
    }
  };

  return (
    <div className={s.checkoutWrap}>
      <PageHeader title="Тестовая оплата" sub="Так будет выглядеть переход на страницу ЮKassa. Деньги не списываются." />
      {error ? (
        <Card>
          <p>{error}</p>
          <Button href="/app/balance">К балансу</Button>
        </Card>
      ) : !t ? (
        <Skeleton height={280} radius={22} />
      ) : (
        <>
          <div className={s.fakeCard} aria-hidden>
            <div className={s.fakeRow}>
              <span>aprosop test</span>
              <span>МИР</span>
            </div>
            <div className={s.fakeChip} />
            <div className={s.fakeNumber}>2200 •••• •••• 0000</div>
            <div className={s.fakeRow}>
              <span>ТЕСТОВАЯ КАРТА</span>
              <span>12/30</span>
            </div>
          </div>
          <Card>
            <div className={s.stack}>
              <dl className={s.sum}>
                <div>
                  <dt>К оплате</dt>
                  <dd>{rubK(t.amount_kopecks)}</dd>
                </div>
                <div>
                  <dt>Получатель</dt>
                  <dd>aprosop</dd>
                </div>
              </dl>
              {t.status !== "pending" ? (
                <>
                  <p className={s.hint}>Этот платёж уже завершён.</p>
                  <Button href={params?.back ?? "/app/balance"}>Вернуться</Button>
                </>
              ) : (
                <>
                  <div className={s.testNote}>
                    <FlaskConical size={16} aria-hidden />
                    <span>Тестовая касса работает, пока не подключена ЮKassa. Выберите, чем закончится оплата.</span>
                  </div>
                  <div className={s.actions}>
                    <Button variant="secondary" loading={busy === "canceled"} disabled={!!busy} onClick={() => finish("canceled")}>
                      Отказаться
                    </Button>
                    <Button variant="primary" icon={<Lock size={16} />} loading={busy === "succeeded"} disabled={!!busy} onClick={() => finish("succeeded")}>
                      Оплатить {rubK(t.amount_kopecks)}
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
