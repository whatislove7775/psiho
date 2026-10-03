/**
 * The current request's locale, readable from ANY code (server components, client components during SSR,
 * the browser) without hooks — so plain helpers like lib/format.ts can translate too.
 *
 * - Browser: <html lang> (the whole page is rendered in one language; the switcher reloads the page).
 * - Server: the `x-locale` request header set by src/middleware.ts, read from Next's request store.
 *   The root layout calls headers(), which makes every route dynamic, so no page is cached in the wrong language.
 */
import { requestAsyncStorage } from "next/dist/client/components/request-async-storage.external";
import { DEFAULT_LOCALE, LOCALE_HEADER, isLocale, type Locale } from "./config";

let browserLocale: Locale | null = null;

export function getLocale(): Locale {
  if (typeof window !== "undefined") {
    if (!browserLocale) {
      const lang = document.documentElement.lang;
      browserLocale = isLocale(lang) ? lang : DEFAULT_LOCALE;
    }
    return browserLocale;
  }
  try {
    const value = requestAsyncStorage.getStore()?.headers.get(LOCALE_HEADER);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}
