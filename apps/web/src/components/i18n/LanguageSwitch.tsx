"use client";

import { usePathname } from "next/navigation";
import { LOCALES, LOCALE_META, getLocale, localePath, splitLocale, t, type Locale } from "@/lib/i18n";
import { setCountry, switchLocale, useCountry } from "@/lib/i18n/client";
import { COUNTRIES, countryName, type CountryCode } from "@/lib/i18n/countries";
import { Select } from "@/ui";
import s from "./i18n.module.css";

/**
 * Header/footer: a compact segmented pill «RU | EN», the current language highlighted.
 * Real links (hreflang) to the same page in each language; the click remembers the choice first
 * (switchLocale), so the middleware serves that language from now on, cabinets included.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const current = getLocale();
  const { path } = splitLocale(usePathname() || "/");
  return (
    <div role="group" aria-label={t("Язык")} className={className ? `${s.seg} ${className}` : s.seg}>
      {LOCALES.map((l) => {
        const active = l === current;
        return (
          <a
            key={l}
            href={localePath(path, l)}
            hrefLang={l}
            lang={l}
            className={s.segItem}
            aria-current={active ? "true" : undefined}
            aria-label={LOCALE_META[l].label}
            title={LOCALE_META[l].label}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              if (!active) switchLocale(l);
            }}
          >
            {LOCALE_META[l].short}
          </a>
        );
      })}
    </div>
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
