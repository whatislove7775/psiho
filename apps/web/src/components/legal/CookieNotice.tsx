"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getLocale, t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import s from "./cookieNotice.module.css";

const KEY = "aprosop.cookieNotice";

/**
 * One quiet line about browser storage, shown once. The site uses only strictly necessary storage
 * (login tokens) and preferences the visitor set themselves (language, country, theme) — no analytics or ads —
 * so no consent is needed (ePrivacy Art. 5(3) exemption); this is a transparency notice, not a consent banner.
 * Shown to visitors of non-Russian pages (EU/UK/US audiences); if analytics are ever added, replace it with
 * a real opt-in banner (docs/INTERNATIONAL.md).
 */
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (getLocale() === "ru") return;
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* storage blocked: nothing is stored either */
    }
  }, []);
  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className={s.notice} role="region" aria-label={t("Cookie")}>
      <p>
        {t("Только необходимые cookie: вход, язык, страна и тема. Без рекламы и аналитики.")}{" "}
        <Link href={lp("/legal/cookies")}>{t("Подробнее")}</Link>
      </p>
      <button type="button" onClick={close} className={s.ok}>
        {t("Понятно")}
      </button>
    </div>
  );
}
