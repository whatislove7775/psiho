/** Shared SEO constants and JSON-LD builders (schema.org). Safe for server and client. */
import { DEFAULT_LOCALE, LOCALES, LOCALE_META, getLocale, localePath, msg, t } from "@/lib/i18n";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://aprosop.ru").replace(/\/$/, "");
export const SITE_NAME = "Aprosop";
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SITE_DESCRIPTION = msg(
  "Анонимные диалоги и\u00a0видеосозвоны с\u00a0психологом. Регистрация без\u00a0почты и\u00a0телефона, вместо лица\u00a0— ваш 3D-аватар, который повторяет мимику. Видео идёт напрямую между вами и\u00a0специалистом в\u00a0зашифрованном виде.",
);

export function abs(path: string): string {
  return path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** hreflang + canonical: the page in the current language is canonical, every language version is an alternate. */
export function alternates(path: string) {
  const languages: Record<string, string> = { "x-default": localePath(path, DEFAULT_LOCALE) };
  for (const l of LOCALES) languages[l] = localePath(path, l);
  return { canonical: localePath(path, getLocale()), languages };
}

/**
 * hreflang for a material written in one language: it has no translations, so the canonical URL is the page in
 * the material's own language (/articles/x for Russian, /en/articles/x for English) and there are no alternates.
 * The same article opened under the other prefix gets the other chrome but points search engines to the original.
 */
export function contentAlternates(path: string, language: string | null | undefined) {
  const lang = language === "en" ? "en" : "ru";
  const url = localePath(path, lang);
  return { canonical: url, languages: { [lang]: url } };
}

/** BCP 47 tag of a material's language for JSON-LD. */
export function contentLanguageTag(language: string | null | undefined): string {
  const l = language || "ru";
  return l === "ru" ? "ru-RU" : l === "en" ? "en" : l;
}

/** BCP 47 language of the current page for JSON-LD inLanguage ("ru-RU", "en-US"). */
export function inLanguage(): string {
  return LOCALE_META[getLocale()].intl;
}

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
    description: t(SITE_DESCRIPTION),
    email: "support@aprosop.ru",
    areaServed: "RU",
    knowsLanguage: [...LOCALES],
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    inLanguage: inLanguage(),
    publisher: { "@id": ORG_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/articles?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbLd(items: { name: string; href: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.href) })),
  };
}

/** Serialises JSON-LD safely for a <script> tag. */
export function ldJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
