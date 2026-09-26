"use client";

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
      toast(`Счёт ${r.invoice.number} выставлен`);
      setOpen(false);
      docs.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось выставить счёт.");
    } finally {
      setBusy(false);
    }
  };

  const d = docs.data;
  return (
    <>
      <PageHeader
        title="Документы"
        sub="Договор, счета на пополнение бюджета и акты по месяцам."
        action={
          <Button variant="primary" icon={<Wallet size={18} />} onClick={() => setOpen(true)}>
            Пополнить бюджет
          </Button>
        }
      />
      {docs.error ? (
        <ErrorBlock message={docs.error} onRetry={docs.reload} />
      ) : (
        <WithRail
          rail={
            <Card as="section">
              <CardHead title="Договор" icon={<FileSignature size={18} />} />
              {!d ? (
                <Skeleton height={80} radius={14} />
              ) : (
                <div className={s.form}>
                  <p className={s.muted}>{d.contract.number ? `Договор № ${d.contract.number}. ` : ""}{d.contract.note}</p>
                  <p className={s.muted}>
                    Оплата — по безналичному расчёту по счёту. Онлайн-оплата картой компании появится позже.
                  </p>
                </div>
              )}
            </Card>
          }
        >
          <Card as="section">
            <CardHead title="Счета" icon={<Receipt size={18} />} />
            {!d ? (
              <Skeleton height={120} radius={14} />
            ) : d.invoices.length === 0 ? (
              <EmptyState art={<EmptyArt scene="sparkles" />} title="Счетов пока нет" text="Выставьте счёт на пополнение бюджета — после оплаты деньги появятся в сводке." />
            ) : (
              <div className={s.list}>
                {d.invoices.map((i) => (
                  <div key={i.id} className={s.item}>
                    <span className={s.itemIcon}>
                      <Receipt size={18} />
                    </span>
                    <span className={s.itemMain}>
                      <span className={s.itemTitle}>
                        Счёт № {i.number} <Badge tone={TONE[i.status]}>{i.status_label}</Badge>
                      </span>
                      <span className={s.itemSub}>
                        от {dateRu(i.created_at, { day: "numeric", month: "long", year: "numeric" })}
                        {i.paid_at ? `, оплачен ${dateRu(i.paid_at)}` : ""}
                      </span>
                    </span>
                    <strong style={{ fontVariantNumeric: "tabular-nums" }}>{rubK(i.amount_kopecks)}</strong>
                    <Button variant="ghost" size="sm" href={`/business/portal/documents/invoice/${i.id}`}>
                      Открыть
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card as="section">
            <CardHead
              title="Акты"
              icon={<FileText size={18} />}
              sub="По закрытым месяцам"
              action={
                d && d.acts.length > 0 ? (
                  <Button variant="ghost" size="sm" icon={<Download size={16} />} onClick={() => businessApi.actsCsv().catch(() => toast("Не получилось скачать.", { error: true }))}>
                    CSV
                  </Button>
                ) : undefined
              }
            />
            {!d ? (
              <Skeleton height={120} radius={14} />
            ) : d.acts.length === 0 ? (
              <p className={s.muted}>Акт появится после первого месяца, в котором сотрудники воспользовались программой.</p>
            ) : (
              <div className={s.list}>
                {d.acts.map((a) => (
                  <div key={a.month} className={s.item}>
                    <span className={s.itemIcon}>
                      <FileText size={18} />
                    </span>
                    <span className={s.itemMain}>
                      <span className={s.itemTitle}>Акт за {a.label}</span>
                      <span className={s.itemSub}>
                        Созвонов: <Hidden value={a.calls} k={d.k_min} />
                      </span>
                    </span>
                    <strong style={{ fontVariantNumeric: "tabular-nums" }}>{rubK(a.amount_kopecks)}</strong>
                    <Button variant="ghost" size="sm" href={`/business/portal/documents/act/${a.month}`}>
                      Открыть
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </WithRail>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Пополнить бюджет" width={460}>
        <form className={s.form} onSubmit={request}>
          <p className={s.muted}>Выставим счёт на реквизиты компании. Когда оплата придёт, менеджер отметит её, и бюджет пополнится.</p>
          <Input
            label="Сумма, ₽"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))}
            hint="От 10 000 ₽"
            error={error ?? undefined}
          />
          <Button type="submit" variant="primary" loading={busy}>
            Выставить счёт
          </Button>
        </form>
      </Modal>
    </>
  );
}
