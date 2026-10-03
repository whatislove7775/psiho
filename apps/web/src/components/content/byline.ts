import { t, intlLocale } from "@/lib/i18n";
/** Article byline: «25 сент. 2026 · ред. Анна Соколова» (either part may be missing). */

// Fixed zone so the server render and hydration agree on the calendar day.
const DATE = { format: (d: Date) => new Intl.DateTimeFormat(intlLocale(), { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Moscow" }).format(d) };

export function pubDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return DATE.format(d).replace(/\s?г\.$/, "").replace(/\s/g, "\u00a0");
}

export function editorLabel(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  return /^редакц/i.test(n) ? n : t(`ред.\u00a0{n}`, { n });
}

export function byline(a: {
  published_at?: string | null;
  author_name?: string | null;
  specialist?: { name: string } | null;
}): string[] {
  // A specialist is the author, not an editor: plain name, no «ред.»
  const who = a.specialist ? a.specialist.name.replace(/\s/g, "\u00a0") : editorLabel(a.author_name);
  return [pubDate(a.published_at), who].filter(Boolean);
}
