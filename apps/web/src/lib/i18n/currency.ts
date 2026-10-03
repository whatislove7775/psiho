/**
 * «≈ $38» next to a rouble price for visitors from other countries. Only a hint: every payment is in roubles
 * (YooKassa), the bank converts at its own rate. Rates: Bank of Russia via GET /api/v1/intl/rates/ (apps.intl.rates).
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { intlLocale } from "./index";
import { useCountry } from "./client";
import type { CountryCode } from "./countries";

const CURRENCY: Partial<Record<CountryCode, string>> = {
  US: "USD", CA: "CAD", GB: "GBP", IE: "EUR", DE: "EUR", EU: "EUR", XX: "USD",
  KZ: "KZT", BY: "BYN", UZ: "UZS", KG: "KGS", AM: "AMD", AZ: "AZN", GE: "GEL", MD: "MDL", UA: "UAH",
};

type Rates = { date: string; rub_per: Record<string, number> };
let pending: Promise<Rates | null> | null = null;

function loadRates(): Promise<Rates | null> {
  pending ??= api<Rates>("/intl/rates/", { auth: false }).catch(() => null);
  return pending;
}

/** Returns a formatter rub → «≈ $38» for the visitor's country, or null (Russia, no rates yet). */
export function useApprox(): ((rub: number) => string | null) | null {
  const country = useCountry();
  const currency = CURRENCY[country.code];
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    if (!currency) return;
    let alive = true;
    loadRates().then((r) => alive && setRates(r));
    return () => {
      alive = false;
    };
  }, [currency]);
  const per = currency ? rates?.rub_per[currency] : undefined;
  if (!currency || !per) return null;
  return (rub: number) => {
    const value = rub / per;
    if (!Number.isFinite(value) || value <= 0) return null;
    const fmt = new Intl.NumberFormat(intlLocale(), {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: value >= 100 ? 0 : 1,
    });
    return `≈ ${fmt.format(value)}`;
  };
}
