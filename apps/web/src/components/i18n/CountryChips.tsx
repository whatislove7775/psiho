"use client";

import { t } from "@/lib/i18n";
import { COUNTRIES, countryName } from "@/lib/i18n/countries";
import s from "./i18n.module.css";

/** Multi-select of countries as quiet toggle chips (specialist profile: «Клиенты из каких стран»). */
export function CountryChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  return (
    <div className={s.chips} role="group" aria-label={t("Страны клиентов")}>
      {COUNTRIES.filter((c) => c.code !== "XX").map((c) => (
        <button key={c.code} type="button" className={s.chip} aria-pressed={value.includes(c.code)} onClick={() => toggle(c.code)}>
          {countryName(c)}
        </button>
      ))}
    </div>
  );
}

/** «Россия, Казахстан» from codes, in the page language. */
export function countryList(codes: string[] | undefined): string {
  return (codes ?? [])
    .map((code) => COUNTRIES.find((c) => c.code === code))
    .filter(Boolean)
    .map((c) => countryName(c!))
    .join(", ");
}
