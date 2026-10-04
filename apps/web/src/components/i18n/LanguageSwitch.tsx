"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Portal } from "@/ui/Portal";
import { LOCALES, LOCALE_META, getLocale, t, type Locale } from "@/lib/i18n";
import { setCountry, switchLocale, useCountry } from "@/lib/i18n/client";
import { COUNTRIES, countryName, type CountryCode } from "@/lib/i18n/countries";
import { Select } from "@/ui";
import s from "./i18n.module.css";

/** Monoline globe; the meridians are their own paths so they can turn while the planet spins. */
function Globe({ spin }: { spin: boolean }) {
  return (
    <svg className={s.globe} data-spin={spin || undefined} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h19" className={s.equator} />
      <ellipse cx="12" cy="12" rx="4.3" ry="9.5" className={s.meridian} />
    </svg>
  );
}

/**
 * Header / menu / footer: a globe icon that opens a small floating list of languages (Русский, English …),
 * the current one checked. Built from LOCALES, so a new language is just one more row. Picking one remembers
 * the choice first (switchLocale: cookie, then replace the history entry, keep scroll), so the middleware
 * serves that language from now on, cabinets included.
 */
export function LanguageToggle({ className, placement = "auto" }: { className?: string; placement?: "auto" | "up" }) {
  const current = getLocale();
  const [open, setOpen] = useState(false);
  const [spin, setSpin] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const up = placement === "up" || (window.innerHeight - r.bottom < 150 && r.top > 150);
    const right = Math.max(8, window.innerWidth - r.right);
    setPos(up ? { bottom: window.innerHeight - r.top + 8, right, up } : { top: r.bottom + 8, right, up });
  }, [placement]);

  useEffect(() => {
    if (!open) return;
    place();
    const items = () => Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    requestAnimationFrame(() => (items().find((el) => el.getAttribute("aria-checked") === "true") ?? items()[0])?.focus());
    const down = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!list.current?.contains(n) && !btn.current?.contains(n)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const els = items();
        const i = els.indexOf(document.activeElement as HTMLElement);
        const n = e.key === "Home" ? 0 : e.key === "End" ? els.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length;
        els[n]?.focus();
      } else if (e.key === "Tab") setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, [open, place]);

  const pick = (l: Locale) => {
    setOpen(false);
    if (l !== current) switchLocale(l);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={className ? `${s.globeBtn} ${className}` : s.globeBtn}
        aria-label={t("Язык")}
        title={t("Язык")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setSpin(true);
          setOpen((v) => !v);
        }}
        onAnimationEnd={() => setSpin(false)}
      >
        <Globe spin={spin} />
      </button>
      {open && (
        <Portal>
          <div
            ref={list}
            id={id}
            role="menu"
            aria-label={t("Язык")}
            className={s.pop}
            data-up={pos?.up || undefined}
            style={pos ? { top: pos.top, bottom: pos.bottom, right: pos.right } : { visibility: "hidden" }}
          >
            {LOCALES.map((l) => (
              <button key={l} type="button" role="menuitemradio" aria-checked={l === current} lang={l} className={s.popItem} onClick={() => pick(l)}>
                {LOCALE_META[l].label}
                {l === current && <Check size={16} strokeWidth={2.2} aria-hidden />}
              </button>
            ))}
          </div>
        </Portal>
      )}
    </>
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
