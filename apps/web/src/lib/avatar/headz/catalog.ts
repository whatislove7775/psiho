/**
 * HEADZ catalogue accessors (data in catalog.gen.ts, built by tools/headz).
 */
import { CATALOG } from "./catalog.gen";
import type { HeadzBase, HeadzGroup, HeadzPartOption, HeadzSlot } from "./types";

export { CATALOG };
export const HEADZ_SLOTS: HeadzSlot[] = ["hair", "beard", "eyewear", "headwear", "earrings"];

const byId = new Map(CATALOG.bases.map((b) => [b.id, b]));

export function headzBase(id: string): HeadzBase {
  return byId.get(id) ?? CATALOG.bases[0];
}

export function hasBase(id: unknown): id is string {
  return typeof id === "string" && byId.has(id);
}

/** Options of a slot that exist for this base. */
export function headzOptions(baseId: string, slot: HeadzSlot): HeadzPartOption[] {
  const b = headzBase(baseId);
  return (CATALOG.options[b.group]?.[slot] ?? []).filter((o) => o.files[b.id]);
}

/** File of a part for a base, or null ("none" / unknown / not available for this base). */
export function headzPart(baseId: string, slot: HeadzSlot, optionId: string | null | undefined): string | null {
  if (!optionId || optionId === "none") return null;
  const b = headzBase(baseId);
  return CATALOG.options[b.group]?.[slot]?.find((o) => o.id === optionId)?.files[b.id] ?? null;
}

export function basesOf(group: HeadzGroup): HeadzBase[] {
  return CATALOG.bases.filter((b) => b.group === group);
}

/** Hat rim [front, back] heights (head space) of a headwear option on a base, if known. */
export function headzRim(baseId: string, optionId: string | null | undefined): [number, number] | null {
  if (!optionId || optionId === "none") return null;
  const b = headzBase(baseId);
  return CATALOG.options[b.group]?.headwear?.find((o) => o.id === optionId)?.rims?.[b.id] ?? null;
}
