"use client";

import { CreditCard } from "lucide-react";
import { Button } from "@/ui";
import { rub } from "@/lib/format";
import { PayForCall } from "@/components/billing/PayForCall";
import s from "./dialogs.module.css";

/**
 * Paying for a call booked in a dialogue. With the anonymous balance (apps.billing)
 * this is C3's PayForCall (balance, «Оплатить с баланса», top-up); a call created by
 * the legacy flow still carries a YooKassa confirmation link.
 */
export function PayCall({
  sessionId,
  amountRub,
  paymentUrl,
  onPaid,
  tone = "default",
}: {
  sessionId: string;
  amountRub: number;
  paymentUrl?: string | null;
  onPaid: () => void;
  tone?: "default" | "white";
}) {
  if (paymentUrl) {
    return (
      <div className={s.pay}>
        <Button
          variant={tone === "white" ? "white" : "primary"}
          block
          icon={<CreditCard size={18} strokeWidth={1.8} />}
          onClick={() => {
            window.location.href = paymentUrl;
          }}
        >
          Оплатить {rub(amountRub)}
        </Button>
        <span className={s.payHint}>Откроется защищённая страница оплаты. Мы не видим данные карты.</span>
      </div>
    );
  }
  return <PayForCall sessionId={sessionId} amountRub={amountRub} onPaid={onPaid} />;
}
