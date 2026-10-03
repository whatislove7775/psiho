"use client";

import { t } from "@/lib/i18n";
import { useCountry } from "@/lib/i18n/client";
import type { Country } from "@/lib/i18n/countries";
import s from "./helpLine.module.css";

/**
 * The one quiet crisis line used where it is genuinely needed (booking confirmation,
 * end of a call, Тиша intro). Words are the links; numbers stay out of the way.
 * Lines follow the visitor's country (settings → «Страна»), see lib/i18n/countries.ts.
 */
export function HelpLine({ className, lead }: { className?: string; lead?: string }) {
  const country = useCountry();
  return (
    <p className={className ? `${s.line} ${className}` : s.line}>
      {lead ?? t("Если очень тяжело прямо сейчас:")} <CrisisLinks country={country} />.
    </p>
  );
}

/** «телефон доверия или 112» / «112 или службы помощи в вашей стране» */
export function CrisisLinks({ country }: { country: Country }) {
  const first = country.lines[0];
  const emergency = (
    <a href={`tel:${country.emergency}`} title={country.emergency}>
      {country.emergency}
    </a>
  );
  if (first) {
    const title = [first.phone, first.note && t(first.note)].filter(Boolean).join(", ");
    return (
      <>
        <a href={`tel:${first.tel}`} title={title}>
          {t(first.label)}
        </a>{" "}
        {t("или")} {emergency}
      </>
    );
  }
  return (
    <>
      {emergency} {t("или")}{" "}
      <a href={country.helplines} target="_blank" rel="noopener noreferrer">
        {t("службы помощи в вашей стране")}
      </a>
    </>
  );
}
