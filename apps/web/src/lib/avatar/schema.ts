/**
 * AvatarConfig — the serialisable description of a user's 3D avatar.
 *
 * This file is the contract between:
 *   - the avatar engine  (src/lib/avatar/headz/*) which renders a config,
 *   - the avatar studio  (src/components/avatar-studio/*) which edits it,
 *   - the backend        (User.avatar_config JSON) which stores it as-is.
 *
 * v3: a HEADZ character ("base") + optional parts fitted to it + colours.
 * Older configs (v1, the procedural kit: skin/head/hair/… groups) are
 * migrated on read by normalizeAvatar(), so stored values keep working.
 * Colours are "#RRGGBB"; null means "as authored".
 */
import { CATALOG, hasBase, headzBase, headzOptions } from "./headz/catalog";
import type { HeadzGroup, HeadzSlot, HeadzTone } from "./headz/types";

export const AVATAR_SCHEMA_VERSION = 3;

export interface AvatarConfig {
  version: 3;
  /** HEADZ base character id, e.g. "woman-medium" */
  base: string;
  /** option ids of the base's group, or "none" */
  hair: string;
  beard: string;
  eyewear: string;
  headwear: string;
  earrings: string;
  hairColor: string | null;
  eyeColor: string | null;
  /** skin colour override (kept close to the base's tone in the studio) */
  skin: string | null;
}

export type { HeadzGroup, HeadzSlot, HeadzTone };
export const SLOTS: HeadzSlot[] = ["hair", "beard", "eyewear", "headwear", "earrings"];

// ── Colour palettes shown as swatches in the studio ─────────────────────────

export const HAIR_COLORS = [
  "#1B1512", "#3A2A20", "#5A3B28", "#7A4E30", "#9C6B43", "#C38B55",
  "#E0B77B", "#F2D9A0", "#B5462E", "#D9683B", "#8C8C8C", "#E6E6E6",
  "#3D5AFE", "#8E5BE8", "#E85BA8", "#2FB57C",
];

export const EYE_COLORS = [
  "#3B2A1E", "#5C3B22", "#7A5230", "#8A6A3A", "#4E7A3A", "#3D8C6E",
  "#3E6FA6", "#6A9BD1", "#7C8A96", "#2B2B2B",
];

// ── Defaults & helpers ────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_BASE = CATALOG.bases.find((b) => b.id === "woman-light")?.id ?? CATALOG.bases[0].id;

export const DEFAULT_AVATAR: AvatarConfig = {
  version: 3,
  base: DEFAULT_BASE,
  hair: headzBase(DEFAULT_BASE).defaults.hair ?? "none",
  beard: "none",
  eyewear: "none",
  headwear: "none",
  earrings: "none",
  hairColor: null,
  eyeColor: null,
  skin: null,
};

function colorOrNull(v: unknown): string | null {
  return typeof v === "string" && HEX.test(v) ? v.toUpperCase() : null;
}

function option(base: string, slot: HeadzSlot, v: unknown, fallback = "none"): string {
  if (v === "none") return "none";
  if (typeof v === "string" && headzOptions(base, slot).some((o) => o.id === v)) return v;
  return fallback;
}

/** Repair any stored/partial value (any version) into a complete, valid AvatarConfig. */
export function normalizeAvatar(raw: unknown): AvatarConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!hasBase(r.base)) return migrateLegacy(r);
  const base = r.base;
  const b = headzBase(base);
  return {
    version: 3,
    base,
    hair: option(base, "hair", r.hair, b.defaults.hair ?? "none"),
    beard: option(base, "beard", r.beard),
    eyewear: option(base, "eyewear", r.eyewear),
    headwear: option(base, "headwear", r.headwear),
    earrings: option(base, "earrings", r.earrings),
    hairColor: colorOrNull(r.hairColor),
    eyeColor: colorOrNull(r.eyeColor),
    skin: colorOrNull(r.skin),
  };
}

// ── v1 → v3 migration ─────────────────────────────────────────────────────────

const LONG_HAIR = new Set([
  "pixie", "bob", "lob", "shag", "bangs-long", "long-straight", "long-wavy", "long-curly", "ponytail",
  "high-ponytail", "bun", "double-buns", "braids", "box-braids",
]);

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function toneOf(hex: string): HeadzTone {
  const l = luminance(hex);
  return l > 0.66 ? "light" : l > 0.45 ? "medium" : "dark";
}

/** Map an old procedural-kit config (v1) to the closest HEADZ character. */
export function migrateLegacy(r: Record<string, unknown>): AvatarConfig {
  const g = (k: string) => (r[k] && typeof r[k] === "object" ? (r[k] as Record<string, unknown>) : {});
  const skin = g("skin"), hair = g("hair"), fh = g("facialHair"), ew = g("eyewear"), hw = g("headwear"), eyes = g("eyes");
  if (!Object.keys(skin).length && !Object.keys(hair).length) return { ...DEFAULT_AVATAR };
  const tone: HeadzTone = typeof skin.tone === "string" && HEX.test(skin.tone) ? toneOf(skin.tone) : "light";
  const bearded = typeof fh.style === "string" && fh.style !== "none";
  const feminine = !bearded && typeof hair.style === "string" && LONG_HAIR.has(hair.style);
  const senior = skin.age === "senior";
  const group: HeadzGroup = senior ? (feminine ? "oldwoman" : "oldman") : feminine ? "woman" : "man";
  const base = CATALOG.bases.find((b) => b.group === group && b.tone === tone) ?? CATALOG.bases.find((b) => b.group === group) ?? CATALOG.bases[0];
  const first = (slot: HeadzSlot) => headzOptions(base.id, slot)[0]?.id ?? "none";
  const cfg: AvatarConfig = {
    version: 3,
    base: base.id,
    hair: hair.style === "bald" ? "none" : base.defaults.hair ?? first("hair"),
    beard: bearded ? first("beard") : "none",
    eyewear: typeof ew.style === "string" && ew.style !== "none" ? first("eyewear") : "none",
    headwear: typeof hw.style === "string" && hw.style !== "none" && hw.style !== "headphones" ? first("headwear") : "none",
    earrings: "none",
    hairColor: colorOrNull(hair.color),
    eyeColor: colorOrNull(eyes.color),
    skin: null,
  };
  return cfg;
}

// ── Random & keys ─────────────────────────────────────────────────────────────

/** Deterministic pseudo-random avatar (seeded) — used for "Shuffle" and for
 *  users who haven't built one yet, so everyone has a stable face. */
export function randomAvatar(seed: string | number = Math.random()): AvatarConfig {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const one = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
  const chance = (p: number) => rnd() < p;
  // adults mostly; elders sometimes; kids are for the studio only
  const groups: HeadzGroup[] = ["woman", "man", "woman", "man", "woman", "man", "oldwoman", "oldman"];
  const avail = groups.filter((gr) => CATALOG.bases.some((b) => b.group === gr));
  const group = one(avail.length ? avail : [CATALOG.bases[0].group]);
  const base = one(CATALOG.bases.filter((b) => b.group === group));
  const opts = (slot: HeadzSlot) => headzOptions(base.id, slot).map((o) => o.id);
  const pick = (slot: HeadzSlot, p: number) => (opts(slot).length && chance(p) ? one(opts(slot)) : "none");
  return normalizeAvatar({
    version: 3,
    base: base.id,
    hair: opts("hair").length ? one(opts("hair")) : "none",
    beard: pick("beard", 0.3),
    eyewear: pick("eyewear", 0.25),
    headwear: pick("headwear", 0.08),
    earrings: pick("earrings", 0.3),
    hairColor: chance(0.5) ? one(HAIR_COLORS.slice(0, 10)) : null,
    eyeColor: chance(0.4) ? one(EYE_COLORS) : null,
    skin: null,
  });
}

/** Stable key for caching snapshots/thumbnails of a config. */
export function avatarKey(cfg: AvatarConfig): string {
  return JSON.stringify(cfg);
}
