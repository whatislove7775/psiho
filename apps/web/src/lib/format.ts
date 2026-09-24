/** Russian formatting helpers shared by all pages. Times shown in the user's local zone. */

const MSK = undefined; // use the browser's zone

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function rub(n: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(n))} ₽`;
}

export function time(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: MSK });
}

/** "24 сентября" */
export function day(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: MSK });
}

/** "чт, 24 сент." */
export function dayShort(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short", timeZone: MSK });
}

/** "Сегодня", "Завтра", "Вчера" or "24 сентября" */
export function dayLabel(iso: string | Date): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((startOf(d) - startOf(today)) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Завтра";
  if (diff === -1) return "Вчера";
  return day(d);
}

/** "Сегодня в 18:00" */
export function when(iso: string | Date): string {
  return `${dayLabel(iso)} в ${time(iso)}`;
}

/** "через 2 часа", "через 5 минут", "началась" */
export function untilLabel(iso: string | Date): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "уже началась";
  const min = Math.round(ms / 60000);
  if (min < 60) return `через ${min} ${plural(min, "минуту", "минуты", "минут")}`;
  const h = Math.round(min / 60);
  if (h < 24) return `через ${h} ${plural(h, "час", "часа", "часов")}`;
  const d = Math.round(h / 24);
  return `через ${d} ${plural(d, "день", "дня", "дней")}`;
}

export function monthYear(d: Date = new Date()): string {
  const s = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");
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

export const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export const SESSION_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "primary" }> = {
  awaiting_payment: { label: "Ждёт оплаты", tone: "warning" },
  paid: { label: "Запланирована", tone: "primary" },
  in_progress: { label: "Идёт сейчас", tone: "success" },
  completed: { label: "Завершена", tone: "neutral" },
  cancelled: { label: "Отменена", tone: "danger" },
  refunded: { label: "Возврат", tone: "neutral" },
};
