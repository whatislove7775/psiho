/**
 * HEADZ catalogue accessors (data in catalog.gen.ts, built by tools/headz).
 */
import { CATALOG } from "./catalog.gen";
import { COMPAT } from "./compat.gen";
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

/** QA only (/dev/headz-lab?mode=fit&all=1): render parts that don't fit too. */
export const fitGate = { on: true };

/**
 * Does a part fit this base? Cross-group parts are measured offline (scripts/headz-fit.mjs:
 * eyes / face covered, skin poking through, lens offset) and only the ones that sit well
 * are listed in compat.gen.ts; slots without a list accept everything.
 */
export function fitsBase(baseId: string, slot: HeadzSlot, qid: string): boolean {
  if (!fitGate.on) return true;
  const list = COMPAT[headzBase(baseId).id]?.[slot];
  return !list || list.includes(qid);
}

/** Options of a slot the base can wear: its own group first, then the compatible parts of the other groups (`all`: unchecked). */
export function headzOptionsAll(baseId: string, slot: HeadzSlot, all = false): QualifiedOption[] {
  const own = headzBase(baseId).group;
  const groups = [own, ...GROUP_ORDER.filter((g) => g !== own)];
  const out: QualifiedOption[] = [];
  for (const g of groups)
    for (const o of CATALOG.options[g]?.[slot] ?? []) {
      const qid = g === own ? o.id : `${g}.${o.id}`;
      if (all || fitsBase(baseId, slot, qid)) out.push({ qid, group: g, option: o });
    }
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

/** A known option that fits the base (saved configs with a part that doesn't fit fall back to the default). */
export function hasOption(baseId: string, slot: HeadzSlot, qid: unknown): qid is string {
  return typeof qid === "string" && qid !== "none" && !!lookup(baseId, slot, qid) && fitsBase(baseId, slot, qid);
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
