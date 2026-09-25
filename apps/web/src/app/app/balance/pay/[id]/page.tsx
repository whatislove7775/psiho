"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, MessagesSquare } from "lucide-react";
import { Button, Card, CardHead, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { PayForCall } from "@/components/billing/PayForCall";
import { billingApi } from "@/lib/api/billing";
import { dayLabel, time } from "@/lib/format";
import s from "@/components/billing/billing.module.css";

/** Payment page for a booked call (payment_url of an awaiting_payment call leads here). */
export default function PayCallPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const call = useLoad(() => billingApi.call(id), [id]);
  const [paid, setPaid] = useState(false);
  const [key, setKey] = useState(0);
  const c = call.data;

  // Back from the payment page (?topup=…): ask the provider, then refresh the balance.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("topup");
    if (!t) return;
    window.history.replaceState(null, "", window.location.pathname);
    let n = 0;
    const poll = () =>
      billingApi
        .topUp(t)
        .then((x) => {
          if (x.status === "pending" && ++n < 8) setTimeout(poll, 2500);
          else setKey((k) => k + 1);
        })
        .catch(() => undefined);
    poll();
  }, []);

  return (
    <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button variant="ghost" size="sm" href="/app/dialogs" icon={<ArrowLeft size={16} />}>
          К диалогам
        </Button>
      </div>
      <PageHeader title={paid || c?.paid ? "Созвон оплачен" : "Оплата созвона"} />
      {call.error ? (
        <ErrorBlock message={call.error} onRetry={call.reload} />
      ) : !c ? (
        <Skeleton height={320} radius={22} />
      ) : (
        <Card as="section">
          <CardHead
            icon={<SpecialistPhoto url={c.specialist.photo_url} name={c.specialist.name} size={44} alt="" />}
            title={c.specialist.name}
            sub="Видеосозвон с аватаром"
          />
          <div className={s.stack}>
            <div className={s.methods}>
              <span className={s.method} aria-pressed="true" style={{ cursor: "default" }}>
                <CalendarDays size={14} aria-hidden /> {dayLabel(c.scheduled_at)}
              </span>
              <span className={s.method} aria-pressed="true" style={{ cursor: "default" }}>
                <Clock size={14} aria-hidden /> {time(c.scheduled_at)}, {c.duration_minutes} мин
              </span>
            </div>
            <PayForCall key={key} sessionId={id} amountRub={c.amount_kopecks / 100} onPaid={() => setPaid(true)} />
            {(paid || c.paid) && (
              <Button variant="secondary" block href="/app/dialogs" icon={<MessagesSquare size={18} />}>
                Вернуться в диалог
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
