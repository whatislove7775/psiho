/**
 * AvatarConfig — the serialisable description of a user's stylised 3D avatar.
 *
 * This file is the contract between:
 *   - the avatar engine  (src/lib/avatar/kit/*) which renders a config,
 *   - the avatar studio  (src/components/avatar-studio/*) which edits it,
 *   - the backend        (User.avatar_config JSON) which stores it as-is.
 *
 * Rules: every field has a default (see DEFAULT_AVATAR), unknown/missing fields
 * are repaired by normalizeAvatar(), colours are "#rrggbb" strings. Bump
 * AVATAR_SCHEMA_VERSION and extend normalizeAvatar() for breaking changes.
 */

export const AVATAR_SCHEMA_VERSION = 1;

// ── Option catalogues ─────────────────────────────────────────────────────────

export const HEAD_SHAPES = ["round", "oval", "square", "heart", "long", "wide"] as const;
export const CHIN_SHAPES = ["soft", "pointed", "square", "cleft"] as const;
export const AGE_LOOKS = ["young", "adult", "mature", "senior"] as const;
export const FRECKLES = ["none", "light", "medium", "heavy"] as const;
export const MOLES = ["none", "cheek", "lip", "eye"] as const;

export const HAIR_STYLES = [
  "bald",
  "buzz",
  "crew",
  "side-part",
  "quiff",
  "pompadour",
  "slick-back",
  "undercut",
  "messy",
  "mohawk",
  "curly-short",
  "fade-curls",
  "afro",
  "pixie",
  "bob",
  "lob",
  "shag",
  "bangs-long",
  "long-straight",
  "long-wavy",
  "long-curly",
  "side-swept",
  "ponytail",
  "high-ponytail",
  "bun",
  "double-buns",
  "man-bun",
  "braids",
  "box-braids",
  "dreads",
  "cornrows",
  "mullet",
] as const;

export const BROW_STYLES = ["natural", "thin", "thick", "arched", "straight", "bushy", "angled", "none"] as const;
export const EYE_SHAPES = ["round", "almond", "hooded", "upturned", "downturned", "monolid"] as const;
export const LASH_STYLES = ["none", "natural", "long", "dramatic", "winged"] as const;
export const NOSE_SHAPES = ["button", "straight", "wide", "pointed", "round", "long", "hooked"] as const;
export const NOSE_PIERCINGS = ["none", "stud", "ring", "septum"] as const;
export const MOUTH_SHAPES = ["full", "thin", "wide", "heart", "small", "bow"] as const;
export const TEETH_STYLES = ["normal", "gap", "braces"] as const;
export const EAR_SIZES = ["small", "medium", "large"] as const;
export const EARRING_STYLES = ["none", "studs", "hoops", "small-hoops", "drops", "pearls", "cuff"] as const;
export const FACIAL_HAIR = [
  "none",
  "stubble",
  "mustache",
  "handlebar",
  "goatee",
  "chinstrap",
  "short-beard",
  "full-beard",
  "long-beard",
] as const;
export const EYEWEAR = ["none", "round", "square", "aviator", "cat-eye", "oversized", "rimless", "sport"] as const;
export const HEADWEAR = [
  "none",
  "beanie",
  "cap",
  "bucket",
  "fedora",
  "beret",
  "headband",
  "bandana",
  "turban",
  "hijab",
  "headphones",
] as const;
export const OUTFITS = ["crew", "vneck", "hoodie", "collar", "turtleneck", "sweater"] as const;

export type HeadShape = (typeof HEAD_SHAPES)[number];
export type ChinShape = (typeof CHIN_SHAPES)[number];
export type AgeLook = (typeof AGE_LOOKS)[number];
export type Freckles = (typeof FRECKLES)[number];
export type Mole = (typeof MOLES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type BrowStyle = (typeof BROW_STYLES)[number];
export type EyeShape = (typeof EYE_SHAPES)[number];
export type LashStyle = (typeof LASH_STYLES)[number];
export type NoseShape = (typeof NOSE_SHAPES)[number];
export type NosePiercing = (typeof NOSE_PIERCINGS)[number];
export type MouthShape = (typeof MOUTH_SHAPES)[number];
export type TeethStyle = (typeof TEETH_STYLES)[number];
export type EarSize = (typeof EAR_SIZES)[number];
export type EarringStyle = (typeof EARRING_STYLES)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type Eyewear = (typeof EYEWEAR)[number];
export type Headwear = (typeof HEADWEAR)[number];
export type Outfit = (typeof OUTFITS)[number];

// ── Config shape ──────────────────────────────────────────────────────────────

export interface AvatarConfig {
  version: number;
  skin: {
    tone: string;
    /** 0..1 rosy cheeks */
    blush: number;
    freckles: Freckles;
    mole: Mole;
    age: AgeLook;
  };
  head: {
    shape: HeadShape;
    chin: ChinShape;
    /** 0..1 fuller cheeks */
    cheeks: number;
  };
  hair: {
    style: HairStyle;
    color: string;
    /** optional second colour for tips/streaks */
    highlight: string | null;
  };
  brows: {
    style: BrowStyle;
    color: string;
    /** 0..1 thickness multiplier around the style's default */
    weight: number;
  };
  eyes: {
    shape: EyeShape;
    color: string;
    lashes: LashStyle;
    /** eyeshadow colour or null */
    shadow: string | null;
    /** 0..1 eye size */
    size: number;
  };
  nose: {
    shape: NoseShape;
    /** 0..1 */
    size: number;
    piercing: NosePiercing;
  };
  mouth: {
    shape: MouthShape;
    lipColor: string;
    teeth: TeethStyle;
  };
  ears: {
    size: EarSize;
    earrings: EarringStyle;
    earringColor: string;
  };
  facialHair: {
    style: FacialHair;
    color: string;
  };
  eyewear: {
    style: Eyewear;
    frameColor: string;
    lensColor: string;
    /** 0 = clear, 1 = fully tinted */
    tint: number;
  };
  headwear: {
    style: Headwear;
    color: string;
  };
  outfit: {
    style: Outfit;
    color: string;
  };
}

// ── Colour palettes shown as swatches in the studio (custom colours allowed) ──

export const SKIN_TONES = [
  "#FDE7D6", "#F9D9C1", "#F3C9A6", "#EDB98D", "#E0A77A", "#D19466",
  "#BF8055", "#A96D46", "#8F5A3A", "#764730", "#5E3826", "#452A1D",
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

export const LIP_COLORS = [
  "#C9887A", "#B8736A", "#D98B8B", "#E6708A", "#C94D6A", "#A8324A",
  "#8C4A6E", "#B06A4A", "#E07A5A", "#9C6B5A",
];

export const ACCENT_COLORS = [
  "#111114", "#F4F4F6", "#3A6DF0", "#2FB57C", "#F4C542", "#FF7A45",
  "#FF5A4E", "#E85BA8", "#8E5BE8", "#A8D4FF", "#DCF280", "#8B6B4A",
];

export const METAL_COLORS = ["#D4AF37", "#C0C0C0", "#E8C39E", "#2B2B2B", "#F4F4F6"];

// ── Defaults & helpers ────────────────────────────────────────────────────────

export const DEFAULT_AVATAR: AvatarConfig = {
  version: AVATAR_SCHEMA_VERSION,
  skin: { tone: "#EDB98D", blush: 0.35, freckles: "none", mole: "none", age: "adult" },
  head: { shape: "oval", chin: "soft", cheeks: 0.45 },
  hair: { style: "side-swept", color: "#5A3B28", highlight: null },
  brows: { style: "natural", color: "#3A2A20", weight: 0.5 },
  eyes: { shape: "almond", color: "#5C3B22", lashes: "natural", shadow: null, size: 0.5 },
  nose: { shape: "button", size: 0.45, piercing: "none" },
  mouth: { shape: "full", lipColor: "#C9887A", teeth: "normal" },
  ears: { size: "medium", earrings: "none", earringColor: "#D4AF37" },
  facialHair: { style: "none", color: "#3A2A20" },
  eyewear: { style: "none", frameColor: "#111114", lensColor: "#3A6DF0", tint: 0 },
  headwear: { style: "none", color: "#3A6DF0" },
  outfit: { style: "crew", color: "#3A6DF0" },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function pick<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}
function color(v: unknown, fallback: string): string {
  return typeof v === "string" && HEX.test(v) ? v.toUpperCase() : fallback;
}
function colorOrNull(v: unknown, fallback: string | null): string | null {
  if (v === null) return null;
  return typeof v === "string" && HEX.test(v) ? v.toUpperCase() : fallback;
}
function unit(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

/** Repair any stored/partial value into a complete, valid AvatarConfig. */
export function normalizeAvatar(raw: unknown): AvatarConfig {
  const d = DEFAULT_AVATAR;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const g = (k: string) => (r[k] && typeof r[k] === "object" ? r[k] : {}) as Record<string, unknown>;
  const skin = g("skin"), head = g("head"), hair = g("hair"), brows = g("brows"), eyes = g("eyes");
  const nose = g("nose"), mouth = g("mouth"), ears = g("ears"), fh = g("facialHair");
  const ew = g("eyewear"), hw = g("headwear"), of = g("outfit");
  return {
    version: AVATAR_SCHEMA_VERSION,
    skin: {
      tone: color(skin.tone, d.skin.tone),
      blush: unit(skin.blush, d.skin.blush),
      freckles: pick(FRECKLES, skin.freckles, d.skin.freckles),
      mole: pick(MOLES, skin.mole, d.skin.mole),
      age: pick(AGE_LOOKS, skin.age, d.skin.age),
    },
    head: {
      shape: pick(HEAD_SHAPES, head.shape, d.head.shape),
      chin: pick(CHIN_SHAPES, head.chin, d.head.chin),
      cheeks: unit(head.cheeks, d.head.cheeks),
    },
    hair: {
      style: pick(HAIR_STYLES, hair.style, d.hair.style),
      color: color(hair.color, d.hair.color),
      highlight: colorOrNull(hair.highlight, d.hair.highlight),
    },
    brows: {
      style: pick(BROW_STYLES, brows.style, d.brows.style),
      color: color(brows.color, d.brows.color),
      weight: unit(brows.weight, d.brows.weight),
    },
    eyes: {
      shape: pick(EYE_SHAPES, eyes.shape, d.eyes.shape),
      color: color(eyes.color, d.eyes.color),
      lashes: pick(LASH_STYLES, eyes.lashes, d.eyes.lashes),
      shadow: colorOrNull(eyes.shadow, d.eyes.shadow),
      size: unit(eyes.size, d.eyes.size),
    },
    nose: {
      shape: pick(NOSE_SHAPES, nose.shape, d.nose.shape),
      size: unit(nose.size, d.nose.size),
      piercing: pick(NOSE_PIERCINGS, nose.piercing, d.nose.piercing),
    },
    mouth: {
      shape: pick(MOUTH_SHAPES, mouth.shape, d.mouth.shape),
      lipColor: color(mouth.lipColor, d.mouth.lipColor),
      teeth: pick(TEETH_STYLES, mouth.teeth, d.mouth.teeth),
    },
    ears: {
      size: pick(EAR_SIZES, ears.size, d.ears.size),
      earrings: pick(EARRING_STYLES, ears.earrings, d.ears.earrings),
      earringColor: color(ears.earringColor, d.ears.earringColor),
    },
    facialHair: {
      style: pick(FACIAL_HAIR, fh.style, d.facialHair.style),
      color: color(fh.color, d.facialHair.color),
    },
    eyewear: {
      style: pick(EYEWEAR, ew.style, d.eyewear.style),
      frameColor: color(ew.frameColor, d.eyewear.frameColor),
      lensColor: color(ew.lensColor, d.eyewear.lensColor),
      tint: unit(ew.tint, d.eyewear.tint),
    },
    headwear: {
      style: pick(HEADWEAR, hw.style, d.headwear.style),
      color: color(hw.color, d.headwear.color),
    },
    outfit: {
      style: pick(OUTFITS, of.style, d.outfit.style),
      color: color(of.color, d.outfit.color),
    },
  };
}

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
  const hairColor = one(HAIR_COLORS.slice(0, 12));
  const bearded = chance(0.25);
  return normalizeAvatar({
    skin: { tone: one(SKIN_TONES), blush: rnd() * 0.6, freckles: chance(0.2) ? one(FRECKLES) : "none", mole: "none", age: one(["young", "adult", "adult", "mature"]) },
    head: { shape: one(HEAD_SHAPES), chin: one(CHIN_SHAPES), cheeks: 0.3 + rnd() * 0.4 },
    hair: { style: one(HAIR_STYLES.filter((x) => x !== "bald")), color: hairColor, highlight: null },
    brows: { style: one(BROW_STYLES.filter((x) => x !== "none")), color: hairColor, weight: 0.3 + rnd() * 0.5 },
    eyes: { shape: one(EYE_SHAPES), color: one(EYE_COLORS), lashes: one(LASH_STYLES), shadow: null, size: 0.35 + rnd() * 0.35 },
    nose: { shape: one(NOSE_SHAPES), size: 0.3 + rnd() * 0.4, piercing: "none" },
    mouth: { shape: one(MOUTH_SHAPES), lipColor: one(LIP_COLORS), teeth: "normal" },
    ears: { size: one(EAR_SIZES), earrings: chance(0.3) ? one(EARRING_STYLES) : "none", earringColor: one(METAL_COLORS) },
    facialHair: { style: bearded ? one(FACIAL_HAIR.filter((x) => x !== "none")) : "none", color: hairColor },
    eyewear: { style: chance(0.3) ? one(EYEWEAR) : "none", frameColor: one(ACCENT_COLORS), lensColor: one(ACCENT_COLORS), tint: chance(0.3) ? 0.6 : 0 },
    headwear: { style: chance(0.15) ? one(HEADWEAR) : "none", color: one(ACCENT_COLORS) },
    outfit: { style: one(OUTFITS), color: one(ACCENT_COLORS) },
  });
}

/** Stable key for caching snapshots/thumbnails of a config. */
export function avatarKey(cfg: AvatarConfig): string {
  return JSON.stringify(cfg);
}
