/**
 * Locales of the site. Russian is the source language: UI strings are written in Russian right in the code
 * and wrapped in t("…"); other languages are dictionaries keyed by that Russian text (see ./index.ts).
 *
 * Adding a language: add it to LOCALES + LOCALE_META, create ./dict/<code>.ts with the same keys as en.ts,
 * register it in DICTS (./index.ts), run `node scripts/i18n-check.mjs <code>` until it reports 0 missing keys.
 */

export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ru";

/** Cookie with the visitor's explicit choice (set by the language switcher and by /en/* visits). */
export const LOCALE_COOKIE = "lang";
/** Request header the middleware passes to the renderer. */
export const LOCALE_HEADER = "x-locale";

export const LOCALE_META: Record<Locale, { label: string; short: string; intl: string; og: string }> = {
  ru: { label: "Русский", short: "RU", intl: "ru-RU", og: "ru_RU" },
  en: { label: "English", short: "EN", intl: "en-US", og: "en_US" },
};

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

/**
 * Public pages (SEO) carry the language in the URL: /en/articles. Russian keeps the old URLs without a prefix.
 * Cabinets (/app, /pro, /room, /admin…) have no prefix — their language comes from the cookie.
 */
const PUBLIC_RE = /^\/(?:$|articles(?:\/|$)|practices(?:\/|$)|legal(?:\/|$)|business\/?$|start\/?$|login\/?$|recover\/?$|join\/?$|match\/?$)/;

export function isPublicPath(path: string): boolean {
  return PUBLIC_RE.test(path);
}

/** Splits "/en/articles/x" → { locale: "en", path: "/articles/x" }; unprefixed paths → { locale: null }. */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const m = /^\/([a-z]{2})(?=\/|$)(.*)$/.exec(pathname);
  if (m && isLocale(m[1])) return { locale: m[1], path: m[2] || "/" };
  return { locale: null, path: pathname };
}

/** The URL of `path` in `locale`: public pages get a prefix for non-default locales, cabinets never do. */
export function localePath(path: string, locale: Locale): string {
  const { path: bare } = splitLocale(path);
  if (locale === DEFAULT_LOCALE || !isPublicPath(bare.split(/[?#]/)[0])) return bare;
  return bare === "/" ? `/${locale}` : `/${locale}${bare}`;
}

/** Languages whose speakers in the CIS usually read Russian: default them to ru, everyone else to en. */
const RU_READERS = ["ru", "uk", "be", "kk", "ky", "uz", "tg", "tk", "hy", "az", "ka", "mo"];

/** Best locale for an Accept-Language header. */
export function pickFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const tags = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { base: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q) || 0 : 1 };
    })
    .filter((x) => x.base && x.base !== "*")
    .sort((a, b) => b.q - a.q);
  for (const { base } of tags) if (isLocale(base)) return base;
  if (tags.some(({ base }) => RU_READERS.includes(base))) return "ru";
  return tags.length ? "en" : DEFAULT_LOCALE;
}
