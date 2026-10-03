"use client";

import { t, tj } from "@/lib/i18n";
import { useState } from "react";
import { Download, FileSignature, FileText, Receipt, Wallet } from "lucide-react";
import { Badge, Button, Card, CardHead, EmptyState, Input, Modal, Skeleton, useToast } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { EmptyArt } from "@/components/illustrations";
import { Hidden } from "@/components/business/Aggregates";
import { ApiError } from "@/lib/api/client";
import { businessApi, dateRu } from "@/lib/api/business";
import { rubK } from "@/lib/api/billing";
import s from "@/components/business/business.module.css";

const TONE = { issued: "sun", paid: "success", canceled: "neutral" } as const;

export default function DocumentsPage() {
  const toast = useToast();
  const docs = useLoad(() => businessApi.documents(), []);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("100000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await businessApi.requestInvoice(Number(amount.replace(/\s/g, "")));
      toast(t(`Счёт {number} выставлен`, { number: r.invoice.number }));
      setOpen(false);
      docs.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Не\u00a0получилось выставить счёт."));
    } finally {
      setBusy(false);
    }
  };

  const d = docs.data;
  return (
    <>
      <PageHeader
        title={t("Документы")}
        sub={t("Договор, счета на\u00a0пополнение бюджета и\u00a0акты по\u00a0месяцам.")}
        action={
          <Button variant="primary" icon={<Wallet size={18} />} onClick={() => setOpen(true)}>
            {t("Пополнить бюджет")}
          </Button>
        }
      />
      {docs.error ? (
        <ErrorBlock message={docs.error} onRetry={docs.reload} />
      ) : (
        <WithRail
          rail={
            <Card as="section">
              <CardHead title={t("Договор")} icon={<FileSignature size={18} />} />
              {!d ? (
                <Skeleton height={80} radius={14} />
              ) : (
                <div className={s.form}>
                  <p className={s.muted}>{d.contract.number ? t(`Договор № {number}. `, { number: d.contract.number }) : ""}{d.contract.note}</p>
                  <p className={s.muted}>
                    {t("Оплата\u00a0— по\u00a0безналичному расчёту по\u00a0счёту. Онлайн-оплата картой компании появится позже.")}
                  </p>
                </div>
              )}
            </Card>
          }
        >
          <Card as="section">
            <CardHead title={t("Счета")} icon={<Receipt size={18} />} />
            {!d ? (
              <Skeleton height={120} radius={14} />
            ) : d.invoices.length === 0 ? (
              <EmptyState art={<EmptyArt scene="sparkles" />} title={t("Счетов пока нет")} text={t("Выставьте счёт на\u00a0пополнение бюджета\u00a0— после оплаты деньги появятся в\u00a0сводке.")} />
            ) : (
              <div className={s.list}>
                {d.invoices.map((i) => (
                  <div key={i.id} className={s.item}>
                    <span className={s.itemIcon}>
                      <Receipt size={18} />
                    </span>
                    <span className={s.itemMain}>
                      <span className={s.itemTitle}>
                        {t("Счёт №")}{" "}{i.number} <Badge tone={TONE[i.status]}>{i.status_label}</Badge>
                      </span>
                      <span className={s.itemSub}>
                        {t("от")}{" "}{dateRu(i.created_at, { day: "numeric", month: "long", year: "numeric" })}
                        {i.paid_at ? t(`, оплачен {dateRu}`, { dateRu: dateRu(i.paid_at) }) : ""}
                      </span>
                    </span>
                    <strong style={{ fontVariantNumeric: "tabular-nums" }}>{rubK(i.amount_kopecks)}</strong>
                    <Button variant="ghost" size="sm" href={`/business/portal/documents/invoice/${i.id}`}>
                      {t("Открыть")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card as="section">
            <CardHead
              title={t("Акты")}
              icon={<FileText size={18} />}
              sub={t("По\u00a0закрытым месяцам")}
              action={
                d && d.acts.length > 0 ? (
                  <Button variant="ghost" size="sm" icon={<Download size={16} />} onClick={() => businessApi.actsCsv().catch(() => toast(t("Не\u00a0получилось скачать."), { error: true }))}>
                    CSV
                  </Button>
                ) : undefined
              }
            />
            {!d ? (
              <Skeleton height={120} radius={14} />
            ) : d.acts.length === 0 ? (
              <p className={s.muted}>{t("Акт появится после первого месяца, в\u00a0котором сотрудники воспользовались программой.")}</p>
            ) : (
              <div className={s.list}>
                {d.acts.map((a) => (
                  <div key={a.month} className={s.item}>
                    <span className={s.itemIcon}>
                      <FileText size={18} />
                    </span>
                    <span className={s.itemMain}>
                      <span className={s.itemTitle}>{tj("Акт за {label}", { label: a.label })}</span>
                      <span className={s.itemSub}>
                        {t("Созвонов:")}{" "}<Hidden value={a.calls} k={d.k_min} />
                      </span>
                    </span>
                    <strong style={{ fontVariantNumeric: "tabular-nums" }}>{rubK(a.amount_kopecks)}</strong>
                    <Button variant="ghost" size="sm" href={`/business/portal/documents/act/${a.month}`}>
                      {t("Открыть")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </WithRail>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t("Пополнить бюджет")} width={460}>
        <form className={s.form} onSubmit={request}>
          <p className={s.muted}>{t("Выставим счёт на\u00a0реквизиты компании. Когда оплата придёт, менеджер отметит её, и\u00a0бюджет пополнится.")}</p>
          <Input
            label={t("Сумма, ₽")}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))}
            hint={t("От\u00a010\u00a0000\u00a0₽")}
            error={error ?? undefined}
          />
          <Button type="submit" variant="primary" loading={busy}>
            {t("Выставить счёт")}
          </Button>
        </form>
      </Modal>
    </>
  );
}
