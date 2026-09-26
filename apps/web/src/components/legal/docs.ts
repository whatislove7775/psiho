/** Registry of legal documents: footer, /legal index, sitemap and consent links read from here. */
export interface LegalDocMeta {
  slug: string;
  title: string;
  /** Short label for the footer */
  short: string;
  description: string;
  audience: "all" | "clients" | "specialists";
}

export const LEGAL_DOCS: LegalDocMeta[] = [
  {
    slug: "privacy",
    title: "Политика конфиденциальности",
    short: "Конфиденциальность",
    description: "Какие данные обрабатывает aprosop, зачем, как долго хранит и как их удалить.",
    audience: "all",
  },
  {
    slug: "terms",
    title: "Пользовательское соглашение",
    short: "Пользовательское соглашение",
    description: "Правила использования сервиса aprosop для клиентов и специалистов.",
    audience: "all",
  },
  {
    slug: "offer",
    title: "Публичная оферта",
    short: "Публичная оферта",
    description: "Условия оказания платных услуг: пополнение баланса и оплата созвонов со специалистами.",
    audience: "clients",
  },
  {
    slug: "personal-data",
    title: "Согласие на обработку персональных данных",
    short: "Согласие на обработку данных",
    description: "Текст согласия на обработку персональных данных, которое даётся при регистрации.",
    audience: "all",
  },
  {
    slug: "cookies",
    title: "Политика использования cookie",
    short: "Cookie",
    description: "Какие cookie и хранилища браузера использует aprosop и зачем.",
    audience: "all",
  },
  {
    slug: "refunds",
    title: "Правила возврата",
    short: "Правила возврата",
    description: "Как вернуть деньги с баланса и что происходит с оплатой при отмене созвона.",
    audience: "clients",
  },
  {
    slug: "specialist-agreement",
    title: "Договор со специалистом",
    short: "Договор со специалистом",
    description: "Условия сотрудничества психологов с сервисом aprosop: проверка, выплаты, обязанности сторон.",
    audience: "specialists",
  },
  {
    slug: "requisites",
    title: "Реквизиты",
    short: "Реквизиты",
    description: "Сведения об операторе сервиса aprosop и контакты для обращений.",
    audience: "all",
  },
];

export function legalDoc(slug: string): LegalDocMeta {
  const d = LEGAL_DOCS.find((x) => x.slug === slug);
  if (!d) throw new Error(`Unknown legal doc ${slug}`);
  return d;
}

/** Marker for text that the lawyers have not written yet. */
export const TBD = "[будет заполнено]";
