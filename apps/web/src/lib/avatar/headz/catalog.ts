/**
 * HEADZ catalogue accessors (data in catalog.gen.ts, built by tools/headz).
 */
import { CATALOG } from "./catalog.gen";
import type { HeadzBase, HeadzGroup, HeadzPartOption, HeadzSlot } from "./types";

export { CATALOG };
export const HEADZ_SLOTS: HeadzSlot[] = ["hair", "beard", "eyewear", "headwear", "earrings", "mask"];

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

// ── cross-base parts ─────────────────────────────────────────────────────────
// Any part can be worn by any base: the runtime re-seats it on the new head
// (radius maps, see deform.ts). Options of another group are addressed as
// "<group>.<id>", options of the base's own group by their plain id.

export interface QualifiedOption {
  /** id stored in the config: plain for the base's group, "<group>.<id>" otherwise */
  qid: string;
  group: HeadzGroup;
  option: HeadzPartOption;
}

const GROUP_ORDER: HeadzGroup[] = ["woman", "man", "girl", "boy", "oldwoman", "oldman"];

/** Every option of a slot: the base's own group first, then the other groups. */
export function headzOptionsAll(baseId: string, slot: HeadzSlot): QualifiedOption[] {
  const own = headzBase(baseId).group;
  const groups = [own, ...GROUP_ORDER.filter((g) => g !== own)];
  const out: QualifiedOption[] = [];
  for (const g of groups)
    for (const o of CATALOG.options[g]?.[slot] ?? []) out.push({ qid: g === own ? o.id : `${g}.${o.id}`, group: g, option: o });
  return out;
}

function lookup(baseId: string, slot: HeadzSlot, qid: string): { group: HeadzGroup; option: HeadzPartOption } | null {
  const b = headzBase(baseId);
  const dot = qid.indexOf(".");
  const group = (dot > 0 ? qid.slice(0, dot) : b.group) as HeadzGroup;
  const id = dot > 0 ? qid.slice(dot + 1) : qid;
  const option = CATALOG.options[group]?.[slot]?.find((o) => o.id === id);
  return option ? { group, option } : null;
}

export function hasOption(baseId: string, slot: HeadzSlot, qid: unknown): qid is string {
  return typeof qid === "string" && qid !== "none" && !!lookup(baseId, slot, qid);
}

/**
 * The file to load for a part on a base and the base it was made for
 * (`src !== baseId` ⇒ the renderer fits it onto the new head).
 */
export function resolvePart(baseId: string, slot: HeadzSlot, qid: string | null | undefined): { url: string; src: string } | null {
  if (!qid || qid === "none") return null;
  const hit = lookup(baseId, slot, qid);
  if (!hit) return null;
  const files = hit.option.files;
  if (files[baseId]) return { url: files[baseId], src: baseId };
  const b = headzBase(baseId);
  const cands = Object.keys(files).map((id) => headzBase(id));
  const src = cands.find((c) => c.group === b.group && c.tone === b.tone) ?? cands.find((c) => c.group === b.group) ?? cands.find((c) => c.tone === b.tone) ?? cands[0];
  return src ? { url: files[src.id], src: src.id } : null;
}

/** Hat rim of a (possibly cross-group) headwear option, measured on the base it was made for. */
export function headzRimQ(baseId: string, qid: string | null | undefined): [number, number] | null {
  const r = resolvePart(baseId, "headwear", qid);
  if (!r) return null;
  const hit = lookup(baseId, "headwear", qid!);
  return hit?.option.rims?.[r.src] ?? null;
}

/** Re-address an option id when the base changes group ("005" of woman → "woman.005" on a man, and back). */
export function requalify(fromBase: string, toBase: string, slot: HeadzSlot, qid: string): string {
  if (!qid || qid === "none") return "none";
  const hit = lookup(fromBase, slot, qid);
  if (!hit) return "none";
  const to = headzBase(toBase).group;
  return hit.group === to ? hit.option.id : `${hit.group}.${hit.option.id}`;
}
