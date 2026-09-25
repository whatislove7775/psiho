"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  EyeOff,
  Gift,
  Plus,
  ShieldCheck,
  Snowflake,
  Undo2,
  UserX,
  Wallet,
} from "lucide-react";
import { Badge, Card, CardHead, EmptyState, Modal, Skeleton, useToast, Button } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { TopUpForm } from "@/components/billing/TopUpForm";
import { RedeemForm } from "@/components/billing/RedeemForm";
import { EmptyArt, Spot } from "@/components/illustrations";
import { billingApi, notifyBalanceChanged, rubK, type HistoryItem } from "@/lib/api/billing";
import { dayShort, time } from "@/lib/format";
import s from "@/components/billing/billing.module.css";

const HOLD_LABEL: Record<string, string> = {
  active: "Заморожено",
  captured: "Списано",
  partial: "Частичный возврат",
  released: "Возвращено",
  refunded: "Возвращено",
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
          toast(`Баланс пополнен на ${rubK(t.amount_kopecks)}`);
        } else if (t.status === "canceled") {
          toast("Оплата не прошла. Деньги не списаны.", { error: true });
        } else if (++tries < 10) {
          setTimeout(poll, 2500);
          return;
        } else {
          toast("Платёж ещё обрабатывается. Баланс обновится сам.");
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
      <PageHeader title="Баланс" sub="Анонимный кошелёк: пополняете, а созвоны оплачиваются с него. К балансу привязан только ваш псевдоним." />
      {summary.error ? (
        <ErrorBlock message={summary.error} onRetry={summary.reload} />
      ) : (
        <WithRail
          rail={
            <>
              <Card as="section">
                <CardHead title="Подарочный код" icon={<Gift size={18} />} sub="Подарок или предоплата от близкого человека" />
                <RedeemForm onRedeemed={refresh} />
              </Card>
              {sm && (
                <Card as="section">
                  <CardHead title="Как возвращаются деньги" icon={<Undo2 size={18} />} />
                  <ul className={s.rules}>
                    <li>Отмена не позже чем за {sm.cancel_rules.free_cancel_hours} ч до созвона — вся сумма на баланс.</li>
                    {sm.cancel_rules.late_cancel_penalty_percent > 0 && (
                      <li>
                        Отмена позже — возвращается {100 - sm.cancel_rules.late_cancel_penalty_percent}%, остальное получает
                        специалист за забронированное время.
                      </li>
                    )}
                    <li>Специалист отменил или не пришёл — возвращаем всё.</li>
                    <li>Неиспользованный остаток можно вернуть на карту через поддержку.</li>
                  </ul>
                </Card>
              )}
            </>
          }
        >
          <section className={s.hero} aria-label="Баланс">
            <div>
              <div className={s.heroLabel}>
                <Wallet size={18} aria-hidden /> На балансе
              </div>
              <div className={s.heroAmount}>{sm ? rubK(sm.balance_kopecks) : "…"}</div>
              <div className={s.heroMeta}>
                {sm && sm.held_kopecks > 0 && (
                  <span className={s.heroPill}>
                    <Snowflake size={14} aria-hidden /> {rubK(sm.held_kopecks)} заморожено под созвоны
                  </span>
                )}
                {sm?.topup.test_mode && <span className={s.heroPill}>Тестовый режим</span>}
              </div>
            </div>
            <div className={s.heroActions}>
              <Button variant="white" size="lg" icon={<Plus size={18} />} onClick={() => setTopupOpen(true)} disabled={!sm}>
                Пополнить
              </Button>
            </div>
          </section>

          <div className={s.privacyRow}>
            <div className={s.privacyItem}>
              <span className={`${s.privacyIcon} ${s["tone-mint"]}`}>
                <EyeOff size={18} />
              </span>
              <span>
                <strong>Без имени</strong>
                Мы не храним ни карту, ни имя плательщика — только сумму.
              </span>
            </div>
            <div className={s.privacyItem}>
              <span className={`${s.privacyIcon} ${s["tone-lilac"]}`}>
                <UserX size={18} />
              </span>
              <span>
                <strong>Специалист не видит</strong>
                Кто и как платил — специалисту это неизвестно.
              </span>
            </div>
            <div className={s.privacyItem}>
              <span className={`${s.privacyIcon} ${s["tone-sun"]}`}>
                <ShieldCheck size={18} />
              </span>
              <span>
                <strong>Деньги в заморозке</strong>
                Специалист получает оплату только после созвона.
              </span>
            </div>
          </div>

          {hs && hs.holds.length > 0 && (
            <Card as="section">
              <CardHead title="Оплаченные созвоны" sub="Деньги заморожены до окончания созвона" icon={<Snowflake size={18} />} />
              <div className={s.list}>
                {hs.holds.map((h) => (
                  <div key={h.id} className={s.item}>
                    <span className={`${s.itemIcon} ${s["tone-lilac"]}`}>
                      <CalendarClock size={18} />
                    </span>
                    <span className={s.itemMain}>
                      <span className={s.itemTitle}>{h.specialist?.name ?? "Созвон"}</span>
                      <span className={s.itemSub}>
                        {h.scheduled_at ? `${dayShort(h.scheduled_at)}, ${time(h.scheduled_at)}` : ""}, {h.duration_minutes} мин
                      </span>
                    </span>
                    <span className={s.itemAmount}>{rubK(h.amount_kopecks)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card as="section">
            <CardHead title="История" icon={<ArrowDownLeft size={18} />} />
            {!hs ? (
              <div className={s.stack}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={52} radius={14} />
                ))}
              </div>
            ) : hs.items.length === 0 ? (
              <EmptyState
                art={<EmptyArt scene="sparkles" />}
                title="Операций пока нет"
                text="Пополните баланс картой или по СБП, или активируйте подарочный код."
                action={
                  <Button variant="primary" icon={<Plus size={18} />} onClick={() => setTopupOpen(true)}>
                    Пополнить баланс
                  </Button>
                }
              />
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
                          {x.label} {x.test && <Badge tone="sun">тест</Badge>}{" "}
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

      <Modal open={topupOpen && !!sm} onClose={() => setTopupOpen(false)} title="Пополнить баланс" width={520}>
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
