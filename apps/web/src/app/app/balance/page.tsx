"use client";

import { t as tt, tj } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Gift,
  Plus,
  Snowflake,
  Undo2,
  Wallet,
} from "lucide-react";
import { Badge, Card, CardHead, CollapsibleCard, Modal, Skeleton, useToast, Button } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { TopUpForm } from "@/components/billing/TopUpForm";
import { RedeemForm } from "@/components/billing/RedeemForm";
import { CompanyAllowance } from "@/components/business/CompanyAllowance";
import { Spot } from "@/components/illustrations";
import { billingApi, notifyBalanceChanged, rubK, type HistoryItem } from "@/lib/api/billing";
import { dayShort, time } from "@/lib/format";
import s from "@/components/billing/billing.module.css";

const HOLD_LABEL: Record<string, string> = {
  get active() { return tt("Заморожено"); },
  get captured() { return tt("Списано"); },
  get partial() { return tt("Частичный возврат"); },
  get released() { return tt("Возвращено"); },
  get refunded() { return tt("Возвращено"); },
};

function itemIcon(x: HistoryItem) {
  if (x.kind === "topup") return { icon: <ArrowDownLeft size={18} />, tone: "tone-mint" };
  if (x.kind === "gift_redeem") return { icon: <Gift size={18} />, tone: "tone-coral" };
  if (x.kind === "hold") return { icon: <CalendarClock size={18} />, tone: "tone-lilac" };
  if (x.kind === "topup_refund") return { icon: <ArrowUpRight size={18} />, tone: "tone-sun" };
  if (x.amount_kopecks > 0) return { icon: <Undo2 size={18} />, tone: "tone-cyan" };
  return { icon: <Wallet size={18} />, tone: "tone-brand" };
}

export default function BalancePage() {
  const toast = useToast();
  const summary = useLoad(() => billingApi.summary(), []);
  const history = useLoad(() => billingApi.history(60), []);
  const [topupOpen, setTopupOpen] = useState(false);
  const checked = useRef(false);

  // Came back from the payment page: ?topup=<id> → wait for the provider's confirmation.
  useEffect(() => {
    if (checked.current || typeof window === "undefined") return;
    checked.current = true;
    const id = new URLSearchParams(window.location.search).get("topup");
    if (!id) return;
    window.history.replaceState(null, "", "/app/balance");
    let tries = 0;
    const poll = async () => {
      try {
        const t = await billingApi.topUp(id);
        if (t.status === "succeeded") {
          toast(tt(`Баланс пополнен на\u00a0{rubK}`, { rubK: rubK(t.amount_kopecks) }));
        } else if (t.status === "canceled") {
          toast(tt("Оплата не\u00a0прошла. Деньги не\u00a0списаны."), { error: true });
        } else if (++tries < 10) {
          setTimeout(poll, 2500);
          return;
        } else {
          toast(tt("Платёж ещё обрабатывается. Баланс обновится сам."));
        }
      } catch {
        /* ignore */
      }
      summary.reload();
      history.reload();
      notifyBalanceChanged();
    };
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => {
    summary.reload();
    history.reload();
  };

  const sm = summary.data;
  const hs = history.data;

  return (
    <>
      <PageHeader title={tt("Баланс")} />
      {summary.error ? (
        <ErrorBlock message={summary.error} onRetry={summary.reload} />
      ) : (
        <WithRail
          rail={
            <>
              <CompanyAllowance onChanged={refresh} />
              <CollapsibleCard title={tt("Подарочный код")} icon={<Gift size={18} />} defaultOpen={false}>
                <RedeemForm onRedeemed={refresh} />
              </CollapsibleCard>
              {sm && (
                <CollapsibleCard title={tt("Как\u00a0возвращаются деньги")} icon={<Undo2 size={18} />} defaultOpen={false}>
                  <ul className={s.rules}>
                    <li>{tj("Отмена за {free_cancel_hours} ч\u00a0и\u00a0раньше\u00a0— вся сумма на\u00a0баланс.", { free_cancel_hours: sm.cancel_rules.free_cancel_hours })}</li>
                    {sm.cancel_rules.late_cancel_penalty_percent > 0 && (
                      <li>{tj("Отмена позже\u00a0— возвращается {v}%.", { v: 100 - sm.cancel_rules.late_cancel_penalty_percent })}</li>
                    )}
                    <li>{tt("Специалист отменил или\u00a0не\u00a0пришёл\u00a0— возвращаем всё.")}</li>
                    <li>{tt("Остаток можно вернуть на\u00a0карту через поддержку.")}</li>
                  </ul>
                </CollapsibleCard>
              )}
            </>
          }
        >
          <section className={s.hero} aria-label={tt("Баланс")}>
            <div>
              <div className={s.heroLabel}>
                <Wallet size={18} aria-hidden />{" "}{tt("На\u00a0балансе")}
              </div>
              <div className={s.heroAmount}>{sm ? rubK(sm.balance_kopecks) : "…"}</div>
              <div className={s.heroMeta}>
                {sm && sm.held_kopecks > 0 && (
                  <span className={s.heroPill}>
                    <Snowflake size={14} aria-hidden /> {rubK(sm.held_kopecks)}{" "}{tt("заморожено под\u00a0созвоны")}
                  </span>
                )}
                {sm?.topup.test_mode && <span className={s.heroPill}>{tt("Тестовый режим")}</span>}
              </div>
            </div>
            <div className={s.heroActions}>
              <Button variant="white" size="lg" icon={<Plus size={18} />} onClick={() => setTopupOpen(true)} disabled={!sm}>
                {tt("Пополнить")}
              </Button>
            </div>
          </section>

          <p className={s.quiet}>{tt("Мы\u00a0храним только сумму\u00a0— без\u00a0имени и\u00a0карты. Специалист получает оплату после созвона.")}</p>

          {hs && hs.holds.length > 0 && (
            <Card as="section">
              <CardHead title={tt("Оплаченные созвоны")} icon={<Snowflake size={18} />} />
              <div className={s.list}>
                {hs.holds.map((h) => (
                  <div key={h.id} className={s.item}>
                    <span className={`${s.itemIcon} ${s["tone-lilac"]}`}>
                      <CalendarClock size={18} />
                    </span>
                    <span className={s.itemMain}>
                      <span className={s.itemTitle}>{h.specialist?.name ?? tt("Созвон")}</span>
                      <span className={s.itemSub}>
                        {tj("{v}, {duration_minutes} мин", { v: h.scheduled_at ? `${dayShort(h.scheduled_at)}, ${time(h.scheduled_at)}` : "", duration_minutes: h.duration_minutes })}
                      </span>
                    </span>
                    <span className={s.itemAmount}>{rubK(h.amount_kopecks)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card as="section">
            <CardHead title={tt("История")} icon={<ArrowDownLeft size={18} />} />
            {!hs ? (
              <div className={s.stack}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={52} radius={14} />
                ))}
              </div>
            ) : hs.items.length === 0 ? (
              <p className={s.quiet}>{tt("Операций пока нет.")}</p>
            ) : (
              <div className={s.list}>
                {hs.items.map((x) => {
                  const ic = itemIcon(x);
                  const sub = [
                    `${dayShort(x.created_at)}, ${time(x.created_at)}`,
                    x.call?.specialist?.name,
                    x.note,
                  ]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <div key={`${x.id}-${x.amount_kopecks}`} className={s.item}>
                      <span className={`${s.itemIcon} ${s[ic.tone]}`}>{ic.icon}</span>
                      <span className={s.itemMain}>
                        <span className={s.itemTitle}>
                          {x.label} {x.test && <Badge tone="sun">{tt("тест")}</Badge>}{" "}
                          {x.kind === "hold" && x.call && x.call.status !== "active" && (
                            <Badge tone={x.call.status === "captured" ? "neutral" : "success"}>{HOLD_LABEL[x.call.status]}</Badge>
                          )}
                        </span>
                        <span className={s.itemSub}>{sub}</span>
                      </span>
                      <span className={`${s.itemAmount} ${x.amount_kopecks > 0 ? s.plus : s.minus}`}>
                        {rubK(x.amount_kopecks, { sign: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </WithRail>
      )}

      <Modal open={topupOpen && !!sm} onClose={() => setTopupOpen(false)} title={tt("Пополнить баланс")} width={520}>
        {sm && (
          <div className={s.stack}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Spot name="card" size={64} />
            </div>
            <TopUpForm settings={sm.topup} />
          </div>
        )}
      </Modal>
    </>
  );
}
