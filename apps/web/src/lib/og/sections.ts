/**
 * Link-preview texts per section: one place for the card title (≤ 5 words),
 * the one-line subtitle, the illustration and the alt text.
 * Pages keep their <title>/description in their own `metadata`.
 */
import type { OgCardProps } from "./card";

export type OgSection = OgCardProps & { alt: string };

export const OG: Record<string, OgSection> = {
  home: {
    title: "Анонимный психолог онлайн",
    subtitle: "Без почты и телефона, вместо лица аватар",
    art: "bubble",
    alt: "aprosop — анонимный психолог онлайн",
  },
  start: {
    title: "Начать анонимно",
    subtitle: "Нужен только пароль, имя создаётся само",
    art: "key",
    alt: "Анонимная регистрация в aprosop",
  },
  login: {
    title: "Вход в aprosop",
    subtitle: "По имени вроде «тихий-кит-4821»",
    art: "key",
    alt: "Вход в aprosop",
  },
  recover: {
    title: "Восстановить доступ",
    subtitle: "По имени и ключу восстановления",
    art: "key",
    alt: "Восстановление доступа в aprosop",
  },
  join: {
    title: "Для психологов",
    subtitle: "Анонимные клиенты, ручная проверка анкеты",
    art: "badge",
    alt: "aprosop для психологов",
  },
  privacy: {
    title: "Конфиденциальность",
    subtitle: "Что храним, чего не храним и как удалить",
    art: "doc",
    alt: "Политика конфиденциальности aprosop",
  },
  terms: {
    title: "Условия использования",
    subtitle: "Правила сервиса простым языком",
    art: "doc",
    alt: "Условия использования aprosop",
  },
  legal: {
    title: "Документы сервиса",
    subtitle: "Правила и приватность простым языком",
    art: "doc",
    alt: "Документы aprosop",
  },
  articles: {
    title: "Статьи о психике",
    subtitle: "Коротко и со ссылками на исследования",
    art: "book",
    alt: "Статьи aprosop",
  },
  article: {
    kicker: "Статья",
    title: "Полезное чтение",
    subtitle: "Коротко и со ссылками на исследования",
    art: "book",
    alt: "Статья aprosop",
  },
  practices: {
    title: "Практики для себя",
    subtitle: "Дыхание и заземление за пять минут",
    art: "breath",
    alt: "Практики aprosop",
  },
  practice: {
    kicker: "Практика",
    title: "Пять минут для себя",
    subtitle: "Простое упражнение с понятными шагами",
    art: "breath",
    alt: "Практика aprosop",
  },
  specialists: {
    title: "Проверенные психологи",
    subtitle: "Диалог и звонки без раскрытия личности",
    art: "chat",
    alt: "Психологи aprosop",
  },
  business: {
    kicker: "Для компаний",
    title: "Психолог для сотрудников",
    subtitle: "Анонимно для людей, прозрачно для бюджета",
    art: "lock",
    alt: "aprosop для компаний — анонимная психологическая помощь сотрудникам",
  },
  /** private areas (cabinets, calls, staff): noindex, generic card */
  private: {
    title: "Анонимная помощь психолога",
    subtitle: "Эта страница открывается после входа",
    art: "lock",
    alt: "aprosop — анонимная психологическая помощь",
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
  return {
    openGraph: { type: "website" as const, locale: "ru_RU", siteName: "aprosop", url: path, title, description },
    twitter: { card: "summary_large_image" as const, title, description },
  };
}
