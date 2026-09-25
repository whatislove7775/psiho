"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { BALANCE_EVENT, billingApi, rubK } from "@/lib/api/billing";
import s from "./billing.module.css";

/** Keeps the client's balance fresh: on mount, on focus and on BALANCE_EVENT. */
export function useBalance(enabled = true) {
  const [kopecks, setKopecks] = useState<number | null>(null);
  const refresh = useCallback(() => {
    if (!enabled) return;
    billingApi
      .summary()
      .then((r) => setKopecks(r.balance_kopecks))
      .catch(() => undefined);
  }, [enabled]);
  useEffect(() => {
    refresh();
    if (!enabled) return;
    window.addEventListener(BALANCE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(BALANCE_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, enabled]);
  return kopecks;
}

/** Header/sidebar chip with the anonymous balance; leads to /app/balance. */
export function BalanceChip({ compact, block }: { compact?: boolean; block?: boolean }) {
  const kopecks = useBalance();
  const low = kopecks !== null && kopecks < 100_00;
  const cls = [s.chip, compact && s.chipCompact, block && s.chipBlock, low && s.chipLow].filter(Boolean).join(" ");
  return (
    <Link href="/app/balance" className={cls} aria-label={`Баланс: ${kopecks === null ? "загрузка" : rubK(kopecks)}. Открыть`}>
      <span className={s.chipIcon} aria-hidden>
        <Wallet size={compact ? 15 : 17} strokeWidth={2} />
      </span>
      {block && <span className={s.chipLabel}>Баланс</span>}
      <span>{kopecks === null ? "…" : rubK(kopecks)}</span>
    </Link>
  );
}
