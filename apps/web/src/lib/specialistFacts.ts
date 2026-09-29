import { plural, yearsLabel } from "@/lib/format";

/** «32 года» — only when the specialist set a birth year. */
export function ageLabel(age?: number | null): string | null {
  if (!age || age < 18) return null;
  return `${age} ${plural(age, "год", "года", "лет")}`;
}

/** «3 мес.» / «2 года» / «меньше месяца» since the given ISO date. */
export function tenureShort(since?: string | null, now = new Date()): string | null {
  if (!since) return null;
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return null;
  const months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth() - (now.getDate() < d.getDate() ? 1 : 0);
  if (months < 1) return "меньше месяца";
  if (months < 12) return `${months}\u00a0мес.`;
  const years = Math.floor(months / 12);
  return yearsLabel(years);
}

/** «На Aprosop 3 мес.» / «На Aprosop 2 года» / «Новый на Aprosop». */
export function tenureLabel(since?: string | null, now = new Date()): string | null {
  const t = tenureShort(since, now);
  if (!t) return null;
  return t === "меньше месяца" ? "Новый на\u00a0Aprosop" : `На\u00a0Aprosop ${t}`;
}

/** Age and time on the service, for the quiet line next to a specialist's photo. */
export function specialistFacts(p: { age?: number | null; on_service_since?: string | null }): string[] {
  return [ageLabel(p.age), tenureLabel(p.on_service_since)].filter((x): x is string => !!x);
}
