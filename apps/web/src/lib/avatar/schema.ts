/**
 * AvatarConfig — the serialisable description of a user's 3D avatar.
 *
 * This file is the contract between:
 *   - the avatar engine  (src/lib/avatar/headz/*) which renders a config,
 *   - the avatar studio  (src/components/avatar-studio/*) which edits it,
 *   - the backend        (User.avatar_config JSON) which stores it as-is.
 *
 * v4: a HEADZ character ("base") + parts (any part fits any base) + colours
 * + face-shape sliders, skin details, eyes, brows, make-up and accessory colours.
 * Older configs (v3, and v1 — the procedural kit) are migrated on read by
 * normalizeAvatar(), so stored values keep working. Colours are "#RRGGBB";
 * null means "as authored". Numbers are clamped; unknown keys are dropped.
 */
import { CATALOG, hasBase, hasOption, headzBase, headzOptions } from "./headz/catalog";
import { FACE_SHAPES, type FaceShape, type ShapeValues } from "./headz/deform";
import type { HeadzGroup, HeadzSlot, HeadzTone } from "./headz/types";

export const AVATAR_SCHEMA_VERSION = 4;

export const IRIS_STYLES = ["natural", "ring", "cartoon", "bright"] as const;
export type IrisStyle = (typeof IRIS_STYLES)[number];
export const BROW_STYLES = ["natural", "straight", "arched", "angled", "soft", "raised"] as const;
export type BrowStyle = (typeof BROW_STYLES)[number];
export const PIERCINGS = ["nose", "brow", "lip", "septum"] as const;
export type Piercing = (typeof PIERCINGS)[number];
export const HAIR_TIP_STYLES = ["tips", "streaks"] as const;
export type HairTipStyle = (typeof HAIR_TIP_STYLES)[number];

export interface AvatarConfig {
  version: 4;
  /** HEADZ base character id, e.g. "woman-medium" */
  base: string;
  /** option ids ("<group>.<id>" for another group's option), or "none" */
  hair: string;
  beard: string;
  eyewear: string;
  headwear: string;
  earrings: string;
  mask: string;
  hairColor: string | null;
  /** second hair colour: dyed tips or streaks */
  hairTip: string | null;
  hairTipStyle: HairTipStyle;
  beardColor: string | null;
  eyeColor: string | null;
  /** skin colour override (any tone on any base) */
  skin: string | null;
  /** face-shape sliders −1..1 (only non-zero values are stored) */
  face: ShapeValues;
  skinFx: { blush: number; freckles: number; moles: number; age: number };
  eyes: { style: IrisStyle; lashes: number };
  brows: { style: BrowStyle; thickness: number; color: string | null };
  makeup: { lip: string | null; lipAmount: number; shadow: string | null; shadowAmount: number; liner: number };
  acc: { frame: string | null; lens: string | null; hat: string | null; piercings: Piercing[] };
}

export type { HeadzGroup, HeadzSlot, HeadzTone, FaceShape, ShapeValues };
export const SLOTS: HeadzSlot[] = ["hair", "beard", "eyewear", "headwear", "earrings", "mask"];
export { FACE_SHAPES };

// ── Colour palettes shown as swatches in the studio ─────────────────────────

export const SKIN_TONES = [
  "#FBE3D2", "#F3CFB3", "#EBBE9C", "#E0AC86", "#D29A73", "#C08560",
  "#A96F4E", "#935B3C", "#7A4830", "#633A27", "#4E2D1F", "#3B2219",
];

export const HAIR_COLORS = [
  "#1B1512", "#3A2A20", "#5A3B28", "#7A4E30", "#9C6B43", "#C38B55",
  "#E0B77B", "#F2D9A0", "#B5462E", "#D9683B", "#8C8C8C", "#E6E6E6",
  "#3D5AFE", "#8E5BE8", "#E85BA8", "#2FB57C",
];

export const EYE_COLORS = [
  "#3B2A1E", "#5C3B22", "#7A5230", "#8A6A3A", "#4E7A3A", "#3D8C6E",
  "#3E6FA6", "#6A9BD1", "#7C8A96", "#2B2B2B",
];

export const LIP_COLORS = ["#C2555E", "#A8323E", "#D9727A", "#E08A8F", "#B0485F", "#8C2F4A", "#CF6A4C", "#7A3B35"];
export const SHADOW_COLORS = ["#B08A7A", "#8C6A5C", "#6E5A7E", "#8FA3C8", "#6F8A5E", "#C9A36B", "#B5708A", "#3E3A40"];
export const ACC_COLORS = ["#1B1B1F", "#F2F2F2", "#8C8C8C", "#C8A165", "#B5462E", "#3A6DF0", "#2FB57C", "#E85BA8", "#6A4FE8", "#F2C94C"];

// ── Defaults & helpers ────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_BASE = CATALOG.bases.find((b) => b.id === "woman-light")?.id ?? CATALOG.bases[0].id;

export const DEFAULT_SKIN_FX: AvatarConfig["skinFx"] = { blush: 0, freckles: 0, moles: 0, age: 0 };
export const DEFAULT_EYES: AvatarConfig["eyes"] = { style: "natural", lashes: 0 };
export const DEFAULT_BROWS: AvatarConfig["brows"] = { style: "natural", thickness: 0, color: null };
export const DEFAULT_MAKEUP: AvatarConfig["makeup"] = { lip: null, lipAmount: 0.6, shadow: null, shadowAmount: 0.5, liner: 0 };
export const DEFAULT_ACC: AvatarConfig["acc"] = { frame: null, lens: null, hat: null, piercings: [] };

/**
 * The neutral default for anyone without a saved avatar: a plain, gender-neutral
 * head — soft adult face, short neutral hair, mid skin tone, softened brows,
 * no beard, make-up or accessories.
 */
const NEUTRAL_BASE = CATALOG.bases.find((b) => b.id === "man-light")?.id ?? DEFAULT_BASE;
export const DEFAULT_AVATAR: AvatarConfig = {
  version: 4,
  base: NEUTRAL_BASE,
  hair: headzOptions(NEUTRAL_BASE, "hair").some((o) => o.id === "007") ? "007" : headzBase(NEUTRAL_BASE).defaults.hair ?? "none",
  beard: "none",
  eyewear: "none",
  headwear: "none",
  earrings: "none",
  mask: "none",
  hairColor: "#5A3B28",
  hairTip: null,
  hairTipStyle: "tips",
  beardColor: null,
  eyeColor: "#5C3B22",
  skin: "#D29A73",
  face: {},
  skinFx: DEFAULT_SKIN_FX,
  eyes: DEFAULT_EYES,
  brows: { style: "natural", thickness: -0.35, color: null },
  makeup: DEFAULT_MAKEUP,
  acc: DEFAULT_ACC,
};

/** Plain look of a base on its own (its sold hair, authored colours) — for picking a character. */
export function baseDefault(baseId: string): AvatarConfig {
  return normalizeAvatar({ version: 4, base: baseId });
}

function colorOrNull(v: unknown): string | null {
  return typeof v === "string" && HEX.test(v) ? v.toUpperCase() : null;
}

function num(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100;
}

function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function option(base: string, slot: HeadzSlot, v: unknown, fallback = "none"): string {
  if (v === "none") return "none";
  if (hasOption(base, slot, v)) return v;
  return fallback;
}

export function normalizeFace(v: unknown): ShapeValues {
  const r = obj(v);
  const out: ShapeValues = {};
  for (const k of FACE_SHAPES) {
    const x = num(r[k], -1, 1, 0);
    if (x !== 0) out[k] = x;
  }
  return out;
}

/** Repair any stored/partial value (any version) into a complete, valid AvatarConfig. */
export function normalizeAvatar(raw: unknown): AvatarConfig {
  const r = obj(raw);
  if (!hasBase(r.base)) return migrateLegacy(r);
  const base = r.base;
  const b = headzBase(base);
  const fx = obj(r.skinFx), eyes = obj(r.eyes), brows = obj(r.brows), mk = obj(r.makeup), acc = obj(r.acc);
  return {
    version: 4,
    base,
    hair: option(base, "hair", r.hair, b.defaults.hair ?? "none"),
    beard: option(base, "beard", r.beard),
    eyewear: option(base, "eyewear", r.eyewear),
    headwear: option(base, "headwear", r.headwear),
    earrings: option(base, "earrings", r.earrings),
    mask: option(base, "mask", r.mask),
    hairColor: colorOrNull(r.hairColor),
    hairTip: colorOrNull(r.hairTip),
    hairTipStyle: oneOf(HAIR_TIP_STYLES, r.hairTipStyle, "tips"),
    beardColor: colorOrNull(r.beardColor),
    eyeColor: colorOrNull(r.eyeColor),
    skin: colorOrNull(r.skin),
    face: normalizeFace(r.face),
    skinFx: {
      blush: num(fx.blush, 0, 1, 0),
      freckles: num(fx.freckles, 0, 1, 0),
      moles: Math.round(num(fx.moles, 0, 3, 0)),
      age: num(fx.age, 0, 1, 0),
    },
    eyes: { style: oneOf(IRIS_STYLES, eyes.style, "natural"), lashes: num(eyes.lashes, -1, 1, 0) },
    brows: { style: oneOf(BROW_STYLES, brows.style, "natural"), thickness: num(brows.thickness, -1, 1, 0), color: colorOrNull(brows.color) },
    makeup: {
      lip: colorOrNull(mk.lip),
      lipAmount: num(mk.lipAmount, 0, 1, DEFAULT_MAKEUP.lipAmount),
      shadow: colorOrNull(mk.shadow),
      shadowAmount: num(mk.shadowAmount, 0, 1, DEFAULT_MAKEUP.shadowAmount),
      liner: num(mk.liner, 0, 1, 0),
    },
    acc: {
      frame: colorOrNull(acc.frame),
      lens: colorOrNull(acc.lens),
      hat: colorOrNull(acc.hat),
      piercings: Array.isArray(acc.piercings) ? PIERCINGS.filter((p) => (acc.piercings as unknown[]).includes(p)) : [],
    },
  };
}

// ── v1 → v4 migration ─────────────────────────────────────────────────────────

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
  if (!Object.keys(skin).length && !Object.keys(hair).length) return DEFAULT_AVATAR;
  const tone: HeadzTone = typeof skin.tone === "string" && HEX.test(skin.tone) ? toneOf(skin.tone) : "light";
  const bearded = typeof fh.style === "string" && fh.style !== "none";
  const feminine = !bearded && typeof hair.style === "string" && LONG_HAIR.has(hair.style);
  const senior = skin.age === "senior";
  const group: HeadzGroup = senior ? (feminine ? "oldwoman" : "oldman") : feminine ? "woman" : "man";
  const base = CATALOG.bases.find((b) => b.group === group && b.tone === tone) ?? CATALOG.bases.find((b) => b.group === group) ?? CATALOG.bases[0];
  const first = (slot: HeadzSlot) => headzOptions(base.id, slot)[0]?.id ?? "none";
  return normalizeAvatar({
    version: 4,
    base: base.id,
    hair: hair.style === "bald" ? "none" : base.defaults.hair ?? first("hair"),
    beard: bearded ? first("beard") : "none",
    eyewear: typeof ew.style === "string" && ew.style !== "none" ? first("eyewear") : "none",
    headwear: typeof hw.style === "string" && hw.style !== "none" && hw.style !== "headphones" ? first("headwear") : "none",
    earrings: "none",
    hairColor: colorOrNull(hair.color),
    eyeColor: colorOrNull(eyes.color),
    skinFx: { blush: typeof skin.blush === "number" ? skin.blush : 0, freckles: skin.freckles && skin.freckles !== "none" ? 0.6 : 0 },
  });
}

// ── Random & keys ─────────────────────────────────────────────────────────────

/** Deterministic pseudo-random avatar (seeded) — used for «Случайный» and for
 *  users who haven't built one yet, so everyone has a stable face.
 *  `rich` also varies the v4 details (face shape, skin tone, brows, make-up…). */
export function randomAvatar(seed: string | number = Math.random(), rich = false): AvatarConfig {
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
  // (the order of these draws keeps the faces of earlier versions stable)
  const cfg: Record<string, unknown> = {
    version: 4,
    base: base.id,
    hair: opts("hair").length ? one(opts("hair")) : "none",
    beard: pick("beard", 0.3),
    eyewear: pick("eyewear", 0.25),
    headwear: pick("headwear", 0.08),
    earrings: pick("earrings", 0.3),
    hairColor: chance(0.5) ? one(HAIR_COLORS.slice(0, 10)) : null,
    eyeColor: chance(0.4) ? one(EYE_COLORS) : null,
    skin: null,
  };
  // Oversized wide-brim women's hats overwhelm the face in automatic previews.
  // Keep the draw above so excluding them does not change the seeded identity.
  if ((group === "woman" && cfg.headwear === "hat") ||
      (group === "oldwoman" && String(cfg.headwear).startsWith("hat-"))) {
    cfg.headwear = "none";
  }
  if (rich) {
    const r = (a: number) => Math.round((rnd() * 2 - 1) * a * 100) / 100;
    const feminine = group === "woman" || group === "oldwoman";
    const tone = SKIN_TONES.indexOf(nearestTone(base.skin));
    cfg.skin = SKIN_TONES[Math.max(0, Math.min(SKIN_TONES.length - 1, tone + Math.round(rnd() * 4 - 2)))];
    cfg.face = Object.fromEntries(FACE_SHAPES.map((k) => [k, chance(0.5) ? r(0.6) : 0]));
    cfg.skinFx = { blush: chance(0.4) ? r(0.8) + 0.2 : 0, freckles: chance(0.2) ? 0.5 + r(0.4) : 0, moles: chance(0.15) ? 1 : 0, age: 0 };
    cfg.eyes = { style: chance(0.8) ? "natural" : one(IRIS_STYLES), lashes: feminine ? 0.3 + r(0.3) : r(0.3) };
    cfg.brows = { style: one(BROW_STYLES), thickness: r(0.6), color: null };
    cfg.makeup = feminine && chance(0.5) ? { lip: one(LIP_COLORS), lipAmount: 0.4 + rnd() * 0.4, shadow: chance(0.4) ? one(SHADOW_COLORS) : null, shadowAmount: 0.4, liner: chance(0.5) ? 0.5 : 0 } : undefined;
    cfg.hairTip = chance(0.15) ? one(HAIR_COLORS) : null;
    cfg.hairTipStyle = chance(0.5) ? "tips" : "streaks";
    cfg.acc = { frame: chance(0.3) ? one(ACC_COLORS) : null, lens: null, hat: chance(0.3) ? one(ACC_COLORS) : null, piercings: chance(0.1) ? [one(PIERCINGS)] : [] };
  }
  return normalizeAvatar(cfg);
}

/** The palette tone closest to a colour (by luminance). */
export function nearestTone(hex: string): string {
  const l = luminance(hex);
  return SKIN_TONES.reduce((a, b) => (Math.abs(luminance(b) - l) < Math.abs(luminance(a) - l) ? b : a));
}

/** Stable key for caching snapshots/thumbnails of a config. */
export function avatarKey(cfg: AvatarConfig): string {
  return JSON.stringify(cfg);
}
