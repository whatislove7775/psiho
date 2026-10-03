"use client";

import { t, tj } from "@/lib/i18n";
import { useState } from "react";
import { Banknote, CreditCard, Info, Landmark, Receipt, Send, Smartphone, Wallet } from "lucide-react";
import { Badge, Button, Card, CardHead, CollapsibleCard, Input, Modal, Segmented, Select, Skeleton, useToast } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { ApiError } from "@/lib/api/client";
import { billingApi, rubK, type Earnings, type PayoutKind, type TaxStatus } from "@/lib/api/billing";
import { dayShort, time } from "@/lib/format";
import { BANKS, OTHER_BANK } from "@/lib/banks";
import s from "@/components/billing/billing.module.css";
import ov from "@/app/pro/overview.module.css";

const CALL_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "primary" | "lilac" }> = {
  active: { get label() { return t("Впереди"); }, tone: "primary" },
  captured: { get label() { return t("Состоялся"); }, tone: "success" },
  partial: { get label() { return t("Поздняя отмена"); }, tone: "warning" },
  refunded: { get label() { return t("Возврат клиенту"); }, tone: "neutral" },
};

const PAYOUT_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "primary" }> = {
  requested: { get label() { return t("Запрошена"); }, tone: "primary" },
  processing: { get label() { return t("Отправляется"); }, tone: "warning" },
  paid: { get label() { return t("Выплачена"); }, tone: "success" },
  rejected: { get label() { return t("Отклонена"); }, tone: "danger" },
  failed: { get label() { return t("Не\u00a0прошла"); }, tone: "danger" },
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
        title={t("Доходы")}
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
                <CardHead title={t("Реквизиты для\u00a0выплат")} icon={<Landmark size={18} />} />
                {e.method ? (
                  <div className={s.stack}>
                    <div className={s.item} style={{ padding: 0 }}>
                      <span className={`${s.itemIcon} ${s["tone-cyan"]}`}>
                        {e.method.kind === "sbp" ? <Smartphone size={18} /> : e.method.kind === "card_token" ? <CreditCard size={18} /> : <Landmark size={18} />}
                      </span>
                      <span className={s.itemMain}>
                        <span className={s.itemTitle} style={{ whiteSpace: "normal" }}>{e.method.masked}</span>
                        <span className={s.itemSub}>{e.method.tax_status === "ip" ? t("ИП") : t("Самозанятый (НПД)")}</span>
                      </span>
                    </div>
                    <Button variant="secondary" onClick={() => setMethodOpen(true)}>
                      {t("Изменить")}
                    </Button>
                  </div>
                ) : (
                  <div className={s.stack}>
                    <p className={s.hint}>{t("Куда переводить деньги. Хранятся зашифрованными.")}</p>
                    <Button variant="primary" onClick={() => setMethodOpen(true)}>
                      {t("Добавить реквизиты")}
                    </Button>
                  </div>
                )}
              </Card>
              <CollapsibleCard title={t("Налоги")} icon={<Receipt size={18} />} defaultOpen={false}>
                <ul className={s.rules}>
                  <li>{t("Самозанятым: после выплаты сформируйте чек в\u00a0«Мой налог».")}</li>
                  <li>{tj("Комиссия сервиса {fee_percent}% уже вычтена.", { fee_percent: e.fee_percent })}</li>
                </ul>
              </CollapsibleCard>
            </>
          }
        >
          <Card as="section">
            <div className={s.stack}>
              <dl className={ov.nums}>
                <div>
                  <dt>{t("Доступно")}</dt>
                  <dd style={{ color: "var(--c-success)" }}>{rubK(e.available_kopecks)}</dd>
                </div>
                <div>
                  <dt>{tj("Ожидает, {hold_hours} ч", { hold_hours: e.hold_hours })}</dt>
                  <dd>{rubK(e.pending_kopecks)}</dd>
                </div>
                <div>
                  <dt>{t("В\u00a0выплате")}</dt>
                  <dd>{rubK(e.in_payout_kopecks)}</dd>
                </div>
                <div>
                  <dt>{t("Выплачено")}</dt>
                  <dd>{rubK(e.paid_kopecks)}</dd>
                </div>
              </dl>
              {e.upcoming_kopecks > 0 && (
                <div className={s.hint} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <Info size={14} aria-hidden style={{ flex: "none", marginTop: 2 }} />{" "}{t("Ещё")}{" "}{rubK(e.upcoming_kopecks)}{" "}{t("придут после оплаченных созвонов.")}
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
                  {t("Запросить выплату")}
                </Button>
              </div>
              <div className={s.hint}>
                {t("От")}{" "}{rubK(e.payout_min_kopecks)}, {e.payout_rail === "manual" ? t("до\u00a03\u00a0рабочих дней") : t("обычно в\u00a0течение часа")}.
              </div>
            </div>
          </Card>

          <Card as="section">
            <CardHead title={t("По\u00a0созвонам")} icon={<Wallet size={18} />} />
            {e.calls.length === 0 ? (
              <p className={s.hint}>{t("Пока нет оплаченных созвонов.")}</p>
            ) : (
              <div className={s.list}>
                {e.calls.map((c) => {
                  const st = CALL_STATUS[c.status] ?? { label: c.status, tone: "neutral" as const };
                  return (
                    <div key={c.id} className={s.item}>
                      <span className={s.itemMain}>
                        <span className={s.itemTitle}>
                          {c.client_alias} <Badge tone={st.tone}>{st.label}</Badge>{" "}
                          {c.available && c.status !== "refunded" ? <Badge tone="success">{t("доступно")}</Badge> : null}
                        </span>
                        <span className={s.itemSub}>
                          {tj("{v}, {duration_minutes} мин · {rubK} − комиссия {rubK2}", { v: c.scheduled_at ? `${dayShort(c.scheduled_at)}, ${time(c.scheduled_at)}` : "", duration_minutes: c.duration_minutes, rubK: rubK(c.gross_kopecks), rubK2: rubK(c.fee_kopecks) })}
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
            <CardHead title={t("Выплаты")} icon={<Banknote size={18} />} />
            {e.payouts.length === 0 ? (
              <p className={s.hint}>{t("Выплат ещё не\u00a0было.")}</p>
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
          toast(t("Реквизиты сохранены"));
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
            toast(t("Выплата запрошена"));
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
  const [bank, setBank] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (ev: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: ev.target.value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const bank_name = kind === "sbp" ? (bank === OTHER_BANK ? (f.bank_name ?? "").trim() : bank) : undefined;
      await billingApi.setPayoutMethod({ kind, tax_status: tax, ...f, ...(bank_name !== undefined ? { bank_name } : {}) });
      setF({});
      setBank("");
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("Не\u00a0получилось сохранить."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("Реквизиты для\u00a0выплат")} width={520}>
      <div className={s.stack}>
        <Segmented<TaxStatus>
          ariaLabel={t("Налоговый статус")}
          value={tax}
          onChange={setTax}
          options={[
            { value: "self_employed", label: t("Самозанятый") },
            { value: "ip", label: t("ИП") },
          ]}
        />
        <Segmented<"sbp" | "bank_account">
          ariaLabel={t("Куда платить")}
          value={kind}
          onChange={setKind}
          options={[
            { value: "sbp", label: t("СБП по\u00a0телефону") },
            { value: "bank_account", label: t("Счёт в\u00a0банке") },
          ]}
        />
        {kind === "sbp" ? (
          <>
            <Input label={t("Телефон, привязанный к\u00a0СБП")} type="tel" value={f.phone ?? ""} onChange={set("phone")} placeholder="+7 900 000-00-00" autoComplete="off" />
            <Select
              label={t("Банк")}
              value={bank}
              onChange={setBank}
              placeholder={t("Выберите банк")}
              options={[...BANKS.map((b) => ({ value: b, label: b })), { value: OTHER_BANK, label: t("Другой банк") }]}
            />
            {bank === OTHER_BANK && (
              <Input label={t("Название банка")} value={f.bank_name ?? ""} onChange={set("bank_name")} autoComplete="off" autoFocus />
            )}
          </>
        ) : (
          <>
            <Input label={t("Получатель, как\u00a0в\u00a0банке")} value={f.recipient ?? ""} onChange={set("recipient")} autoComplete="off" />
            <Input label={t("Номер счёта")} inputMode="numeric" value={f.account ?? ""} onChange={set("account")} placeholder={t("20\u00a0цифр")} autoComplete="off" />
            <Input label={t("БИК")} inputMode="numeric" value={f.bik ?? ""} onChange={set("bik")} placeholder={t("9\u00a0цифр")} autoComplete="off" />
          </>
        )}
        <Input label={t("ИНН (необязательно)")} inputMode="numeric" value={f.inn ?? ""} onChange={set("inn")} placeholder={t("12\u00a0цифр")} autoComplete="off" hint={t("Нужен для\u00a0чеков самозанятого и\u00a0отчётности.")} />
        {error && <div className={s.error} role="alert">{error}</div>}
        <div className={s.hint}>{t("Реквизиты шифруются, доступ к\u00a0ним записывается в\u00a0журнал.")}</div>
        <Button variant="primary" size="lg" block loading={busy} onClick={save}>
          {t("Сохранить")}
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
      setError(err instanceof ApiError ? err.message : t("Не\u00a0получилось запросить выплату."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t("Запросить выплату")} width={460}>
      <div className={s.stack}>
        <label className={s.amountField}>
          <input inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value.replace(/[^\d\s,.]/g, ""))} aria-label={t("Сумма выплаты, рублей")} />
          <span aria-hidden>₽</span>
        </label>
        <div className={s.hint}>
          {tj("Доступно {rubK}. Деньги придут на {masked}.", { rubK: rubK(e.available_kopecks), masked: e.method?.masked })}
        </div>
        {error && <div className={s.error} role="alert">{error}</div>}
        <Button variant="primary" size="lg" block loading={busy} onClick={submit} icon={<Send size={18} />}>
          {t("Запросить")}
        </Button>
      </div>
    </Modal>
  );
}
