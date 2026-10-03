/**
 * Browser-side language & country helpers: the switcher, the country setting and localized links.
 */
import { useEffect, useState } from "react";
import { requestAsyncStorage } from "next/dist/client/components/request-async-storage.external";
import { LOCALE_COOKIE, SCROLL_KEY, localePath, splitLocale, type Locale } from "./config";
import { getLocale } from "./locale";
import { COUNTRY_COOKIE, COUNTRY_KEY, countryBy, guessCountry, type Country, type CountryCode } from "./countries";

const YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`;
}
function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    try {
      return requestAsyncStorage.getStore()?.cookies.get(name)?.value ?? null;
    } catch {
      return null;
    }
  }
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Switch the site language: remember it (cookie first, so the middleware never bounces us back), then load
 * the same page in the new language. `replace` — the old-language URL must not stay in history: going Back to
 * it would only redirect forward again (the cookie wins). The scroll position is carried over (LOCALE_SYNC_SCRIPT).
 */
export function switchLocale(next: Locale) {
  setCookie(LOCALE_COOKIE, next);
  const { path } = splitLocale(window.location.pathname);
  const target = localePath(path, next);
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ path: target, y: Math.round(window.scrollY) }));
  } catch {
    /* private mode */
  }
  const url = target + window.location.search + window.location.hash;
  if (target === window.location.pathname) window.location.reload();
  else window.location.replace(url);
}

/** Re-exported for older imports; lives in ./index (usable in server components). */
export { lp } from "./index";

const listeners = new Set<() => void>();

/** The chosen country (cookie), or a default that server and browser agree on. */
export function readCountry(): CountryCode {
  const c = readCookie(COUNTRY_COOKIE);
  if (countryBy(c)) return c as CountryCode;
  return getLocale() === "ru" ? "RU" : "XX";
}

export function setCountry(code: CountryCode) {
  setCookie(COUNTRY_COOKIE, code);
  try {
    localStorage.setItem(COUNTRY_KEY, code);
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}

/** Current country; on the first visit it is guessed from the time zone once and remembered. */
export function useCountry(): Country {
  const [code, setCode] = useState<CountryCode>(readCountry);
  useEffect(() => {
    if (!countryBy(readCookie(COUNTRY_COOKIE))) {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(COUNTRY_KEY);
      } catch {
        /* ignore */
      }
      setCountry(countryBy(saved) ? (saved as CountryCode) : guessCountry(getLocale()));
    }
    const on = () => setCode(readCountry());
    on();
    listeners.add(on);
    return () => {
      listeners.delete(on);
    };
  }, []);
  return countryBy(code)!;
}
