import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_SCRIPT } from "@/components/shell/ThemeToggle";
import { STEALTH_SCRIPT } from "@/lib/privacy/stealth";
import { ldJson, ORG_ID, organizationLd, websiteLd } from "@/lib/seo";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_HEADER, LOCALE_META, LOCALES, getLocale, isLocale, msg, t } from "@/lib/i18n";

const SITE_URL = "https://aprosop.ru";
const SITE_NAME = "Aprosop";
const DESCRIPTION = msg(
  "Анонимные диалоги и\u00a0видеозвонки с\u00a0психологом: без\u00a0почты и\u00a0телефона, вместо лица\u00a0— 3D-аватар. Видео идёт напрямую и\u00a0не\u00a0записывается.",
);

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t("Aprosop\u00a0— анонимная психологическая помощь онлайн"),
      template: "%s | Aprosop",
    },
    description: t(DESCRIPTION),
    keywords: [
      t("анонимный психолог"),
      t("психолог онлайн"),
      t("анонимная консультация психолога"),
      t("психолог без\u00a0регистрации"),
      t("видеосозвон с\u00a0психологом"),
      t("психологическая помощь онлайн"),
      t("конфиденциальная консультация"),
    ],
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "health",
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: LOCALE_META[getLocale()].og,
      url: SITE_URL,
      siteName: SITE_NAME,
      title: t("Психолог онлайн, и\u00a0никто не\u00a0узнает, кто вы"),
      description: t("Без\u00a0почты, телефона и\u00a0лица."),
      // images: file-based opengraph-image.tsx per section (lib/og)
    },
    twitter: {
      card: "summary_large_image",
      title: t("Психолог онлайн, и\u00a0никто не\u00a0узнает, кто вы"),
      description: t("Без\u00a0почты, телефона и\u00a0лица."),
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "48x48" },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      ],
      apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
    },
    manifest: "/manifest.json",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a10" },
    { media: "(prefers-color-scheme: light)", color: "#f2f2f5" },
  ],
};

function StructuredData() {
  // Site-wide entities only; page-specific data (FAQPage, Article, HowTo, BreadcrumbList) lives on its page.
  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: t("Анонимная психологическая консультация онлайн"),
    serviceType: t("Онлайн-консультация психолога"),
    provider: { "@id": ORG_ID },
    availableLanguage: [...LOCALES],
    description: t(DESCRIPTION),
  };
  return (
    <>
      {[organizationLd(), websiteLd(), service].map((schema, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(schema) }} />
      ))}
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // headers() also makes every route dynamic, so no page is cached in the wrong language.
  const requested = headers().get(LOCALE_HEADER);
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  return (
    <html lang={locale} dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* «Незаметный режим»: нейтральная вкладка и выход по двойному Esc — до загрузки React */}
        <script dangerouslySetInnerHTML={{ __html: STEALTH_SCRIPT }} />
        <link rel="preload" href="/fonts/onest-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/onest-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <StructuredData />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
