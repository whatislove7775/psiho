/**
 * Link-preview texts per section: one place for the card title (≤ 5 words),
 * the one-line subtitle, the illustration and the alt text.
 * Pages keep their <title>/description in their own `metadata`.
 */
import { t } from "@/lib/i18n";
import type { OgCardProps } from "./card";
import { LOCALES, LOCALE_META, getLocale, localePath } from "@/lib/i18n";

export type OgSection = OgCardProps & { alt: string };

export const OG: Record<string, OgSection> = {
  home: {
    get title() { return t("Психолог онлайн, и\u00a0никто не\u00a0узнает, кто вы"); },
    subtitle: "",
    lines: [{ get text() { return t("Психолог онлайн,"); } }, { get text() { return t("и\u00a0никто не\u00a0узнает,"); }, accent: true }, { get text() { return t("кто вы"); }, accent: true }],
    art: "bubble",
    get alt() { return t("Aprosop\u00a0— психолог онлайн, и\u00a0никто не\u00a0узнает, кто вы"); },
  },
  start: {
    get title() { return t("Начать анонимно"); },
    get subtitle() { return t("Нужен только пароль, имя создаётся само"); },
    art: "key",
    get alt() { return t("Анонимная регистрация в\u00a0Aprosop"); },
  },
  login: {
    get title() { return t("Вход в\u00a0Aprosop"); },
    get subtitle() { return t("По\u00a0имени вроде «тихий-кит-4821»"); },
    art: "key",
    get alt() { return t("Вход в\u00a0Aprosop"); },
  },
  recover: {
    get title() { return t("Восстановить доступ"); },
    get subtitle() { return t("По\u00a0имени и\u00a0ключу восстановления"); },
    art: "key",
    get alt() { return t("Восстановление доступа в\u00a0Aprosop"); },
  },
  join: {
    get title() { return t("Для\u00a0психологов"); },
    get subtitle() { return t("Анонимные клиенты, ручная проверка анкеты"); },
    art: "badge",
    get alt() { return t("Aprosop для\u00a0психологов"); },
  },
  privacy: {
    get title() { return t("Конфиденциальность"); },
    get subtitle() { return t("Что\u00a0храним, чего не\u00a0храним и\u00a0как\u00a0удалить"); },
    art: "doc",
    get alt() { return t("Политика конфиденциальности Aprosop"); },
  },
  terms: {
    get title() { return t("Условия использования"); },
    get subtitle() { return t("Правила сервиса простым языком"); },
    art: "doc",
    get alt() { return t("Условия использования Aprosop"); },
  },
  legal: {
    get title() { return t("Документы сервиса"); },
    get subtitle() { return t("Правила и\u00a0приватность простым языком"); },
    art: "doc",
    get alt() { return t("Документы Aprosop"); },
  },
  articles: {
    get title() { return t("Статьи о\u00a0психике"); },
    get subtitle() { return t("Коротко и\u00a0со\u00a0ссылками на\u00a0исследования"); },
    art: "book",
    get alt() { return t("Статьи Aprosop"); },
  },
  article: {
    get kicker() { return t("Статья"); },
    get title() { return t("Полезное чтение"); },
    get subtitle() { return t("Коротко и\u00a0со\u00a0ссылками на\u00a0исследования"); },
    art: "book",
    get alt() { return t("Статья Aprosop"); },
  },
  practices: {
    get title() { return t("Практики для\u00a0себя"); },
    get subtitle() { return t("Дыхание и\u00a0заземление за\u00a0пять минут"); },
    art: "breath",
    get alt() { return t("Практики Aprosop"); },
  },
  practice: {
    get kicker() { return t("Практика"); },
    get title() { return t("Пять минут для\u00a0себя"); },
    get subtitle() { return t("Простое упражнение с\u00a0понятными шагами"); },
    art: "breath",
    get alt() { return t("Практика Aprosop"); },
  },
  specialists: {
    get title() { return t("Проверенные психологи"); },
    get subtitle() { return t("Диалог и\u00a0звонки без\u00a0раскрытия личности"); },
    art: "chat",
    get alt() { return t("Психологи Aprosop"); },
  },
  business: {
    get kicker() { return t("Для\u00a0компаний"); },
    get title() { return t("Психолог для\u00a0сотрудников"); },
    get subtitle() { return t("Анонимно для\u00a0людей, прозрачно для\u00a0бюджета"); },
    art: "lock",
    get alt() { return t("Aprosop для\u00a0компаний\u00a0— анонимная психологическая помощь сотрудникам"); },
  },
  /** private areas (cabinets, calls, staff): noindex, generic card */
  private: {
    get title() { return t("Анонимная помощь психолога"); },
    get subtitle() { return t("Эта страница открывается после входа"); },
    art: "lock",
    get alt() { return t("Aprosop\u00a0— анонимная психологическая помощь"); },
  },
};

/** Titles longer than this are replaced by the section title on detail cards. */
export const OG_MAX_TITLE = 60;

/**
 * Per-page Open Graph / Twitter texts. A page's `openGraph` replaces the root
 * one entirely, so this repeats siteName/locale; images come from the nearest
 * opengraph-image.tsx / twitter-image.tsx.
 */
export function ogMeta(path: string, title: string, description: string) {
  const locale = getLocale();
  const url = localePath(path, locale);
  // Other languages: the file-based image URL is shared by all languages, so point to the translated card.
  const section = locale === "ru" ? null : sectionOf(path);
  const images = section
    ? [{ url: `/og-image/${section}?lang=${locale}`, width: 1200, height: 630, alt: OG[section].alt }]
    : undefined;
  return {
    openGraph: {
      type: "website" as const,
      locale: LOCALE_META[locale].og,
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => LOCALE_META[l].og),
      siteName: "Aprosop",
      url,
      title,
      description,
      ...(images ? { images } : {}),
    },
    twitter: { card: "summary_large_image" as const, title, description, ...(images ? { images: images.map((i) => i.url) } : {}) },
  };
}

/** Which OG section a public path belongs to. */
function sectionOf(path: string): string {
  if (path === "/") return "home";
  if (path.startsWith("/legal/privacy")) return "privacy";
  if (path.startsWith("/legal/terms")) return "terms";
  if (path.startsWith("/legal")) return "legal";
  const first = path.split("/")[1];
  return first in OG ? first : "home";
}
