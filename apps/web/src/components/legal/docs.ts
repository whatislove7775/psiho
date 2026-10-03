import { t, msg } from "@/lib/i18n";
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
    get title() { return t("Политика конфиденциальности"); },
    get short() { return t("Конфиденциальность"); },
    get description() { return t("Какие данные обрабатывает Aprosop, зачем, как\u00a0долго хранит и\u00a0как\u00a0их\u00a0удалить."); },
    audience: "all",
  },
  {
    slug: "terms",
    get title() { return t("Пользовательское соглашение"); },
    get short() { return t("Пользовательское соглашение"); },
    get description() { return t("Правила использования сервиса Aprosop для\u00a0клиентов и\u00a0специалистов."); },
    audience: "all",
  },
  {
    slug: "offer",
    get title() { return t("Публичная оферта"); },
    get short() { return t("Публичная оферта"); },
    get description() { return t("Условия оказания платных услуг: пополнение баланса и\u00a0оплата созвонов со\u00a0специалистами."); },
    audience: "clients",
  },
  {
    slug: "personal-data",
    get title() { return t("Согласие на\u00a0обработку персональных данных"); },
    get short() { return t("Согласие на\u00a0обработку данных"); },
    get description() { return t("Текст согласия на\u00a0обработку персональных данных, которое даётся при\u00a0регистрации."); },
    audience: "all",
  },
  {
    slug: "cookies",
    get title() { return t("Политика использования cookie"); },
    short: "Cookie",
    get description() { return t("Какие cookie и\u00a0хранилища браузера использует Aprosop и\u00a0зачем."); },
    audience: "all",
  },
  {
    slug: "refunds",
    get title() { return t("Правила возврата"); },
    get short() { return t("Правила возврата"); },
    get description() { return t("Как\u00a0вернуть деньги с\u00a0баланса и\u00a0что\u00a0происходит с\u00a0оплатой при\u00a0отмене созвона."); },
    audience: "clients",
  },
  {
    slug: "specialist-agreement",
    get title() { return t("Договор со\u00a0специалистом"); },
    get short() { return t("Договор со\u00a0специалистом"); },
    get description() { return t("Условия сотрудничества психологов с\u00a0сервисом Aprosop: проверка, выплаты, обязанности сторон."); },
    audience: "specialists",
  },
  {
    slug: "requisites",
    get title() { return t("Реквизиты"); },
    get short() { return t("Реквизиты"); },
    get description() { return t("Сведения об\u00a0операторе сервиса Aprosop и\u00a0контакты для\u00a0обращений."); },
    audience: "all",
  },
];

export function legalDoc(slug: string): LegalDocMeta {
  const d = LEGAL_DOCS.find((x) => x.slug === slug);
  if (!d) throw new Error(`Unknown legal doc ${slug}`);
  return d;
}

/** Marker for text that the lawyers have not written yet. */
export const TBD = msg("[будет заполнено]");
