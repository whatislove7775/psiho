/** Shared SEO constants and JSON-LD builders (schema.org). Safe for server and client. */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://aprosop.ru").replace(/\/$/, "");
export const SITE_NAME = "aprosop";
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SITE_DESCRIPTION =
  "Анонимные диалоги и видеосозвоны с психологом. Регистрация без почты и телефона, вместо лица — ваш 3D-аватар, который повторяет мимику. Видео идёт напрямую между вами и специалистом в зашифрованном виде.";

export function abs(path: string): string {
  return path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** hreflang + canonical for a Russian-only page. */
export function alternates(path: string) {
  return { canonical: path, languages: { ru: path, "x-default": path } };
}

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
    description: SITE_DESCRIPTION,
    email: "support@aprosop.ru",
    areaServed: "RU",
    knowsLanguage: "ru",
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    inLanguage: "ru-RU",
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
