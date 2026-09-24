import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_SCRIPT } from "@/components/shell/ThemeToggle";

const SITE_URL = "https://aprosop.ru";
const SITE_NAME = "aprosop";
const DESCRIPTION =
  "Анонимные видеосессии с психологом. Регистрация без почты и телефона, вместо лица — ваш 3D-аватар, который повторяет мимику. Видео идёт напрямую между вами и специалистом в зашифрованном виде.";

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
    "видеосессия с психологом",
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
    title: "aprosop — говорите свободно. Ваше лицо остаётся при вас",
    description: DESCRIPTION,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "aprosop — анонимная психологическая помощь" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "aprosop — анонимная психологическая помощь",
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  alternates: { canonical: SITE_URL },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#f2f2f5" },
  ],
};

function StructuredData() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.svg`,
    description: DESCRIPTION,
  };
  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Анонимная психологическая консультация онлайн",
    provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    areaServed: "RU",
    availableLanguage: "ru",
    description: DESCRIPTION,
  };
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Нужны ли почта или телефон для регистрации?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Нет. Вы придумываете только пароль, а имя-псевдоним и ключ восстановления создаются автоматически.",
        },
      },
      {
        "@type": "Question",
        name: "Увидит ли психолог моё лицо?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Нет. Камера распознаёт мимику прямо на вашем устройстве, а специалист видит только ваш 3D-аватар. Голос можно изменить фильтром.",
        },
      },
      {
        "@type": "Question",
        name: "Записываются ли сессии?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Нет. Видео передаётся напрямую между вами и специалистом в зашифрованном виде и нигде не сохраняется.",
        },
      },
    ],
  };
  return (
    <>
      {[organization, service, faq].map((schema, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      ))}
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <StructuredData />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
