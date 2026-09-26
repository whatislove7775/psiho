import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_SCRIPT } from "@/components/shell/ThemeToggle";
import { STEALTH_SCRIPT } from "@/lib/privacy/stealth";
import { ldJson, ORG_ID, organizationLd, websiteLd } from "@/lib/seo";

const SITE_URL = "https://aprosop.ru";
const SITE_NAME = "aprosop";
const DESCRIPTION =
  "Анонимные диалоги и видеозвонки с психологом: без почты и телефона, вместо лица — 3D-аватар. Видео идёт напрямую и не записывается.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "aprosop — анонимная психологическая помощь онлайн",
    template: "%s | aprosop",
  },
  description: DESCRIPTION,
  keywords: [
    "анонимный психолог",
    "психолог онлайн",
    "анонимная консультация психолога",
    "психолог без регистрации",
    "видеосозвон с психологом",
    "психологическая помощь онлайн",
    "конфиденциальная консультация",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "health",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Анонимный психолог онлайн",
    description: "Без почты и телефона. Вместо лица — 3D-аватар, видео не записывается.",
    // images: file-based opengraph-image.tsx per section (lib/og)
  },
  twitter: {
    card: "summary_large_image",
    title: "Анонимный психолог онлайн",
    description: "Без почты и телефона. Вместо лица — 3D-аватар, видео не записывается.",
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f1027" },
    { media: "(prefers-color-scheme: light)", color: "#f2f2f5" },
  ],
};

function StructuredData() {
  // Site-wide entities only; page-specific data (FAQPage, Article, HowTo, BreadcrumbList) lives on its page.
  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Анонимная психологическая консультация онлайн",
    serviceType: "Онлайн-консультация психолога",
    provider: { "@id": ORG_ID },
    areaServed: "RU",
    availableLanguage: "ru",
    description: DESCRIPTION,
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
  return (
    <html lang="ru" dir="ltr" suppressHydrationWarning>
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
