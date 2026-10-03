"use client";

import { Globe } from "lucide-react";
import { LOCALES, LOCALE_META, getLocale, t, type Locale } from "@/lib/i18n";
import { setCountry, switchLocale, useCountry } from "@/lib/i18n/client";
import { COUNTRIES, countryName, type CountryCode } from "@/lib/i18n/countries";
import { Select } from "@/ui";
import s from "./i18n.module.css";

/** Header/footer: one quiet button that switches to the other language («EN» on Russian pages, «RU» on English). */
export function LanguageToggle({ className }: { className?: string }) {
  const current = getLocale();
  const next = LOCALES.find((l) => l !== current) ?? current;
  return (
    <button
      type="button"
      className={className ? `${s.toggle} ${className}` : s.toggle}
      onClick={() => switchLocale(next)}
      lang={next}
      aria-label={LOCALE_META[next].label}
      title={LOCALE_META[next].label}
    >
      <Globe size={16} strokeWidth={1.8} aria-hidden />
      {LOCALE_META[next].short}
    </button>
  );
}

/** Settings: language of the interface. */
export function LanguageSelect() {
  const current = getLocale();
  return (
    <Select<Locale>
      label={t("Язык")}
      value={current}
      onChange={(l) => l !== current && switchLocale(l)}
      options={LOCALES.map((l) => ({ value: l, label: LOCALE_META[l].label }))}
    />
  );
}

/** Settings: country — crisis lines, currency hint and which legal documents apply. */
export function CountrySelect() {
  const country = useCountry();
  return (
    <Select<CountryCode>
      label={t("Страна")}
      hint={t("Для телефонов помощи и документов. Храним только в этом браузере.")}
      value={country.code}
      onChange={setCountry}
      options={COUNTRIES.map((c) => ({ value: c.code, label: countryName(c) }))}
    />
  );
}
