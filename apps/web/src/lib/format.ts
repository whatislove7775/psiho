import { t, intlLocale, getLocale, lookup, pluralForm, translatedList } from "@/lib/i18n";
/** Formatting helpers shared by all pages, in the page's language. Times shown in the user's local zone. */

const MSK = undefined; // use the browser's zone

/**
 * Russian plural forms: plural(n, "год", "года", "лет"). Other languages take their forms from the dictionary
 * entry "год|года|лет" → "year|years" and pick one with Intl.PluralRules.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  if (getLocale() !== "ru") {
    const forms = lookup(`${one}|${few}|${many}`);
    if (forms) return pluralForm(n, forms.split("|"));
  }
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** «1 год» / «4 года» / «11 лет» (non-breaking space). */
export function yearsLabel(n: number): string {
  return `${n} ${plural(n, "год", "года", "лет")}`;
}

/** «Опыт 4 года» — the one way to show a specialist's experience. */
export function experienceLabel(n: number, prefix = t("Опыт")): string {
  return `${prefix} ${yearsLabel(n)}`;
}

/** Genitive after «от»: «от 1 года», «от 3 лет», «от 21 года». */
export function fromYearsLabel(n: number): string {
  return t(`от {n} {plural}`, { n, plural: plural(n, "года", "лет", "лет") });
}

/** Prices are always in roubles (payments go through YooKassa): «3 400 ₽», in English «₽3,400». */
export function rub(n: number): string {
  if (getLocale() === "ru") return `${new Intl.NumberFormat("ru-RU").format(Math.round(n))} ₽`;
  return new Intl.NumberFormat(intlLocale(), { style: "currency", currency: "RUB", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(Math.round(n));
}

export function time(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(intlLocale(), { hour: "2-digit", minute: "2-digit", timeZone: MSK });
}

/** "24 сентября" */
export function day(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(intlLocale(), { day: "numeric", month: "long", timeZone: MSK });
}

/** "чт, 24 сент." */
export function dayShort(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(intlLocale(), { weekday: "short", day: "numeric", month: "short", timeZone: MSK });
}

/** "Сегодня", "Завтра", "Вчера" or "24 сентября" */
export function dayLabel(iso: string | Date): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((startOf(d) - startOf(today)) / 86400000);
  if (diff === 0) return t("Сегодня");
  if (diff === 1) return t("Завтра");
  if (diff === -1) return t("Вчера");
  return day(d);
}

/** "Сегодня в 18:00" */
export function when(iso: string | Date): string {
  return t(`{dayLabel} в\u00a0{time}`, { dayLabel: dayLabel(iso), time: time(iso) });
}

/** "через 2 часа", "через 5 минут", "началась" */
export function untilLabel(iso: string | Date): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t("уже началась");
  const min = Math.round(ms / 60000);
  if (min < 60) return t(`через {min} {plural}`, { min, plural: plural(min, "минуту", "минуты", "минут") });
  const h = Math.round(min / 60);
  if (h < 24) return t(`через {h} {plural}`, { h, plural: plural(h, "час", "часа", "часов") });
  const d = Math.round(h / 24);
  return t(`через {d} {plural}`, { d, plural: plural(d, "день", "дня", "дней") });
}

export function monthYear(d: Date = new Date()): string {
  const s = d.toLocaleDateString(intlLocale(), { month: "long", year: "numeric" }).replace(" г.", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "YYYY-MM-DD" in local time */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function startOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export const WEEKDAYS = translatedList(["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]);
export const WEEKDAYS_SHORT = translatedList(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]);

export const SESSION_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "primary" }> = {
  awaiting_payment: { get label() { return t("Ждёт оплаты"); }, tone: "warning" },
  paid: { get label() { return t("Назначен"); }, tone: "primary" },
  in_progress: { get label() { return t("Идёт сейчас"); }, tone: "success" },
  completed: { get label() { return t("Состоялся"); }, tone: "neutral" },
  cancelled: { get label() { return t("Отменён"); }, tone: "danger" },
  refunded: { get label() { return t("Возврат"); }, tone: "neutral" },
};
