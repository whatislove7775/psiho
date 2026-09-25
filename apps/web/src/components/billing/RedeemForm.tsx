"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { Button, Input, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { billingApi, notifyBalanceChanged, rubK } from "@/lib/api/billing";
import s from "./billing.module.css";

/** Redeem a prepaid gift code (APR-XXXX-XXXX-XXXX). */
export function RedeemForm({ onRedeemed }: { onRedeemed?: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await billingApi.redeem(code);
      toast(`Код активирован: +${rubK(r.amount_kopecks)}`);
      setCode("");
      notifyBalanceChanged();
      onRedeemed?.();
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? "Слишком много попыток. Подождите минуту." : err.message) : "Не получилось проверить код.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={s.stack} onSubmit={submit}>
      <Input
        className={s.codeInput}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="APR-XXXX-XXXX-XXXX"
        aria-label="Подарочный код"
        autoComplete="off"
        spellCheck={false}
        maxLength={24}
        error={error ?? undefined}
      />
      <Button type="submit" variant="soft" icon={<Gift size={18} />} loading={busy} disabled={!code.trim()}>
        Активировать код
      </Button>
      <div className={s.hint}>Код может купить для вас кто угодно — так оплата совсем не связана с вами.</div>
    </form>
  );
}
