// Lowest point of each hair part in head space (the chin is -1, the crown +1), read from the part's GLB
// POSITION bounds. Regenerate when hair parts change (see git history of this file for the one-liner).
import { headzBase } from "./catalog";
import type { AvatarConfig } from "../schema";

const HAIR_MIN_Y: Record<string, number> = {
  "boy/1": -0.56,
  "boy/10": -0.56,
  "boy/2": -0.54,
  "boy/3": -0.56,
  "boy/4": -0.55,
  "boy/5": -0.69,
  "boy/6": -0.73,
  "boy/7": -0.56,
  "boy/8": -0.73,
  "boy/9": -0.55,
  "girl/1": -2.06,
  "girl/10": -1.22,
  "girl/2": -1.15,
  "girl/3": -1.0,
  "girl/4": -2.24,
  "girl/5": -0.66,
  "girl/6": -0.67,
  "girl/7": -0.61,
  "girl/8": -1.1,
  "girl/9": -1.24,
  "man/001": -0.49,
  "man/002": -0.5,
  "man/003": -0.51,
  "man/003-001": -0.49,
  "man/003-002": 0.23,
  "man/004": -0.49,
  "man/005": -0.49,
  "man/006": 0.22,
  "man/007": -0.03,
  "man/008": -0.48,
  "man/009": -1.18,
  "man/hair011": -0.36,
  "man/hair012": -0.45,
  "oldman/1": -0.47,
  "oldman/2": -0.59,
  "oldman/3": -0.54,
  "oldman/4": -0.63,
  "oldman/5": -0.57,
  "oldman/6": -0.48,
  "oldman/7": -0.58,
  "oldman/8": -0.43,
  "oldwoman/1": -0.4,
  "oldwoman/10": -0.78,
  "oldwoman/11": -0.87,
  "oldwoman/2": -0.47,
  "oldwoman/3": -0.57,
  "oldwoman/4": -0.65,
  "oldwoman/5": -0.78,
  "oldwoman/6": -0.74,
  "oldwoman/7": -1.16,
  "oldwoman/8": -0.69,
  "oldwoman/9": -1.81,
  "woman/001": -3.77,
  "woman/002": -2.75,
  "woman/003": -0.64,
  "woman/004": -1.13,
  "woman/005": -0.68,
  "woman/006": -3.02,
  "woman/007": -1.28,
  "woman/008": -1.31,
  "woman/009": -1.32,
  "woman/010": -1.32,
};

/** Hair that hangs further than this (head heights x 2 below the chin line) is "long": the view fades it out. */
const LONG_BELOW_Y = -1.4;

/** Lowest point of the avatar's hair, head space (null: no hair / unknown part). */
export function hairLowestY(cfg: Pick<AvatarConfig, "base" | "hair">): number | null {
  if (!cfg.hair || cfg.hair === "none") return null;
  try {
    return HAIR_MIN_Y[`${headzBase(cfg.base).group}/${cfg.hair}`] ?? null;
  } catch {
    return null;
  }
}

/** True when the hair has a long hanging tail (past the shoulders): the tail is faded out softly, never cut. */
export function hasLongHair(cfg: Pick<AvatarConfig, "base" | "hair">): boolean {
  const y = hairLowestY(cfg);
  return y !== null && y < LONG_BELOW_Y;
}
