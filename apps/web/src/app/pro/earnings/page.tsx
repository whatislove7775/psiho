"use client";

import { useState } from "react";
import { Banknote, CreditCard, Info, Landmark, Receipt, Send, Smartphone, Wallet } from "lucide-react";
import { Badge, Button, Card, CardHead, EmptyState, Input, Modal, Segmented, Skeleton, Stat, useToast } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { EmptyArt } from "@/components/illustrations";
import { ApiError } from "@/lib/api/client";
import { billingApi, rubK, type Earnings, type PayoutKind, type TaxStatus } from "@/lib/api/billing";
import { dayShort, time } from "@/lib/format";
import s from "@/components/billing/billing.module.css";

const CALL_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "primary" | "lilac" }> = {
  active: { label: "Впереди", tone: "primary" },
  captured: { label: "Состоялся", tone: "success" },
  partial: { label: "Поздняя отмена", tone: "warning" },
  refunded: { label: "Возврат клиенту", tone: "neutral" },
};

const PAYOUT_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "primary" }> = {
  requested: { label: "Запрошена", tone: "primary" },
  processing: { label: "Отправляется", tone: "warning" },
  paid: { label: "Выплачена", tone: "success" },
  rejected: { label: "Отклонена", tone: "danger" },
  failed: { label: "Не прошла", tone: "danger" },
};

export default function EarningsPage() {
  const toast = useToast();
  const data = useLoad(() => billingApi.earnings(), []);
  const [methodOpen, setMethodOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const e = data.data;

  return (
    <>
      <PageHeader
        title="Доходы"
        sub="Деньги за созвоны, комиссия сервиса и выплаты. Клиенты видны только по псевдониму."
      />
      {data.error ? (
        <ErrorBlock message={data.error} onRetry={data.reload} />
      ) : !e ? (
        <Skeleton height={420} radius={22} />
      ) : (
        <WithRail
          rail={
            <>
              <Card as="section">
                <CardHead title="Реквизиты для выплат" icon={<Landmark size={18} />} />
                {e.method ? (
                  <div className={s.stack}>
                    <div className={s.item} style={{ padding: 0 }}>
                      <span className={`${s.itemIcon} ${s["tone-cyan"]}`}>
                        {e.method.kind === "sbp" ? <Smartphone size={18} /> : e.method.kind === "card_token" ? <CreditCard size={18} /> : <Landmark size={18} />}
                      </span>
                      <span className={s.itemMain}>
                        <span className={s.itemTitle} style={{ whiteSpace: "normal" }}>{e.method.masked}</span>
                        <span className={s.itemSub}>{e.method.tax_status === "ip" ? "ИП" : "Самозанятый (НПД)"}</span>
                      </span>
                    </div>
                    <Button variant="secondary" onClick={() => setMethodOpen(true)}>
                      Изменить
                    </Button>
                  </div>
                ) : (
                  <div className={s.stack}>
                    <p className={s.hint}>Укажите, куда переводить деньги. Реквизиты хранятся зашифрованными и видны только бухгалтерии при выплате.</p>
                    <Button variant="primary" onClick={() => setMethodOpen(true)}>
                      Добавить реквизиты
                    </Button>
                  </div>
                )}
              </Card>
              <Card as="section">
                <CardHead title="Налоги" icon={<Receipt size={18} />} />
                <ul className={s.rules}>
                  <li>Самозанятым: после каждой выплаты сформируйте чек в приложении «Мой налог» (доход от юрлица/ИП).</li>
                  <li>Когда включатся выплаты через ЮKassa, чек можно будет формировать автоматически.</li>
                  <li>Комиссия сервиса — {e.fee_percent}% от стоимости созвона, она уже вычтена.</li>
                </ul>
              </Card>
            </>
          }
        >
          <Card as="section">
            <div className={s.stack}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 40%), 1fr))", gap: 12 }}>
                <Stat label="Доступно к выплате" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(e.available_kopecks)}</span>} tone="success" />
                <Stat label="Ожидает" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(e.pending_kopecks)}</span>} note={`${e.hold_hours} ч после созвона`} />
                <Stat label="В выплате" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(e.in_payout_kopecks)}</span>} />
                <Stat label="Выплачено всего" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(e.paid_kopecks)}</span>} />
              </div>
              {e.upcoming_kopecks > 0 && (
                <div className={s.hint} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <Info size={14} aria-hidden style={{ flex: "none", marginTop: 2 }} /> Ещё {rubK(e.upcoming_kopecks)} — за оплаченные созвоны впереди. Деньги заморожены у клиента и
                  придут после созвона.
                </div>
              )}
              <div className={s.actions}>
                <Button
                  variant="primary"
                  size="lg"
                  icon={<Send size={18} />}
                  disabled={e.available_kopecks < e.payout_min_kopecks || e.payouts.some((p) => p.status === "requested" || p.status === "processing")}
                  onClick={() => (e.method ? setPayoutOpen(true) : setMethodOpen(true))}
                >
                  Запросить выплату
                </Button>
              </div>
              <div className={s.hint}>
                Минимальная выплата — {rubK(e.payout_min_kopecks)}.{" "}
                {e.payout_rail === "manual"
                  ? "Пока выплаты делает бухгалтерия вручную, обычно в течение 3 рабочих дней."
                  : "Выплата уходит через ЮKassa, обычно в течение часа."}
              </div>
            </div>
          </Card>

          <Card as="section">
            <CardHead title="По созвонам" icon={<Wallet size={18} />} sub="Сумма клиента, комиссия и ваша часть" />
            {e.calls.length === 0 ? (
              <EmptyState art={<EmptyArt scene="calendar" />} title="Пока нет оплаченных созвонов" text="Когда клиент оплатит созвон, он появится здесь." />
            ) : (
              <div className={s.list}>
                {e.calls.map((c) => {
                  const st = CALL_STATUS[c.status] ?? { label: c.status, tone: "neutral" as const };
                  return (
                    <div key={c.id} className={s.item}>
                      <span className={s.itemMain}>
                        <span className={s.itemTitle}>
                          {c.client_alias} <Badge tone={st.tone}>{st.label}</Badge>{" "}
                          {c.available && c.status !== "refunded" ? <Badge tone="success">доступно</Badge> : null}
                        </span>
                        <span className={s.itemSub}>
                          {c.scheduled_at ? `${dayShort(c.scheduled_at)}, ${time(c.scheduled_at)}` : ""}, {c.duration_minutes} мин ·
                          {" "}{rubK(c.gross_kopecks)} − комиссия {rubK(c.fee_kopecks)}
                        </span>
                      </span>
                      <span className={`${s.itemAmount} ${c.status === "refunded" ? s.minus : s.plus}`}>
                        {c.status === "refunded" ? rubK(0) : rubK(c.net_kopecks)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card as="section">
            <CardHead title="Выплаты" icon={<Banknote size={18} />} />
            {e.payouts.length === 0 ? (
              <p className={s.hint}>Выплат ещё не было.</p>
            ) : (
              <div className={s.list}>
                {e.payouts.map((p) => {
                  const st = PAYOUT_STATUS[p.status];
                  return (
                    <div key={p.id} className={s.item}>
                      <span className={`${s.itemIcon} ${s["tone-mint"]}`}>
                        <Banknote size={18} />
                      </span>
                      <span className={s.itemMain}>
                        <span className={s.itemTitle}>
                          {rubK(p.amount_kopecks)} <Badge tone={st.tone}>{st.label}</Badge>
                        </span>
                        <span className={s.itemSub}>
                          {dayShort(p.created_at)}, {p.destination}
                          {p.note ? `, ${p.note}` : ""}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </WithRail>
      )}

      <MethodModal
        open={methodOpen}
        current={e}
        onClose={() => setMethodOpen(false)}
        onSaved={() => {
          setMethodOpen(false);
          toast("Реквизиты сохранены");
          data.reload();
        }}
      />
      {e && (
        <PayoutModal
          open={payoutOpen}
          e={e}
          onClose={() => setPayoutOpen(false)}
          onDone={() => {
            setPayoutOpen(false);
            toast("Выплата запрошена");
            data.reload();
          }}
        />
      )}
    </>
  );
}

function MethodModal({ open, current, onClose, onSaved }: { open: boolean; current: Earnings | null; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<Exclude<PayoutKind, "card_token">>(current?.method?.kind === "bank_account" ? "bank_account" : "sbp");
  const [tax, setTax] = useState<TaxStatus>(current?.method?.tax_status ?? "self_employed");
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (ev: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: ev.target.value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await billingApi.setPayoutMethod({ kind, tax_status: tax, ...f });
      setF({});
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не получилось сохранить.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Реквизиты для выплат" width={520}>
      <div className={s.stack}>
        <Segmented<TaxStatus>
          ariaLabel="Налоговый статус"
          value={tax}
          onChange={setTax}
          options={[
            { value: "self_employed", label: "Самозанятый" },
            { value: "ip", label: "ИП" },
          ]}
        />
        <Segmented<"sbp" | "bank_account">
          ariaLabel="Куда платить"
          value={kind}
          onChange={setKind}
          options={[
            { value: "sbp", label: "СБП по телефону" },
            { value: "bank_account", label: "Счёт в банке" },
          ]}
        />
        {kind === "sbp" ? (
          <>
            <Input label="Телефон, привязанный к СБП" type="tel" value={f.phone ?? ""} onChange={set("phone")} placeholder="+7 900 000-00-00" autoComplete="off" />
            <Input label="Банк" value={f.bank_name ?? ""} onChange={set("bank_name")} placeholder="Например, Т-Банк" autoComplete="off" />
          </>
        ) : (
          <>
            <Input label="Получатель, как в банке" value={f.recipient ?? ""} onChange={set("recipient")} autoComplete="off" />
            <Input label="Номер счёта" inputMode="numeric" value={f.account ?? ""} onChange={set("account")} placeholder="20 цифр" autoComplete="off" />
            <Input label="БИК" inputMode="numeric" value={f.bik ?? ""} onChange={set("bik")} placeholder="9 цифр" autoComplete="off" />
          </>
        )}
        <Input label="ИНН (необязательно)" inputMode="numeric" value={f.inn ?? ""} onChange={set("inn")} placeholder="12 цифр" autoComplete="off" hint="Нужен для чеков самозанятого и отчётности." />
        {error && <div className={s.error} role="alert">{error}</div>}
        <div className={s.hint}>Реквизиты шифруются. Сотрудник видит их целиком только при ручной выплате, и это записывается в журнал.</div>
        <Button variant="primary" size="lg" block loading={busy} onClick={save}>
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}

function PayoutModal({ open, e, onClose, onDone }: { open: boolean; e: Earnings; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(Math.floor(e.available_kopecks / 100)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const v = Number(amount.replace(/\s/g, "").replace(",", "."));
      await billingApi.requestPayout(v * 100 >= e.available_kopecks ? undefined : v);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось запросить выплату.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Запросить выплату" width={460}>
      <div className={s.stack}>
        <label className={s.amountField}>
          <input inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value.replace(/[^\d\s,.]/g, ""))} aria-label="Сумма выплаты, рублей" />
          <span aria-hidden>₽</span>
        </label>
        <div className={s.hint}>
          Доступно {rubK(e.available_kopecks)}. Деньги придут на {e.method?.masked}.
        </div>
        {error && <div className={s.error} role="alert">{error}</div>}
        <Button variant="primary" size="lg" block loading={busy} onClick={submit} icon={<Send size={18} />}>
          Запросить
        </Button>
      </div>
    </Modal>
  );
}
