/**
 * Smooth, deterministic idle motion for HEADZ heads.
 *
 * Idle motion (sway, float, breathing, gaze drift) must never be random per frame — that reads as
 * trembling. Everything here is a pure function of time and a fixed per-head seed:
 *  - `smoothNoise(t, seed, hz)`: a sum of three sines with incommensurate frequencies and seeded
 *    phases — C∞-smooth, bounded to [-1, 1], never repeats visibly, band-limited (its highest
 *    component is 2.1 × hz), so its derivatives are bounded too (see `NOISE_SLOPE`).
 *  - `rng(seed)`: a seeded PRNG for discrete choices (when to blink, where to glance next); its
 *    values only ever pick TARGETS that are then followed by a critically damped spring.
 */

/** frequency multipliers and amplitudes of the three components (incommensurate: 1, φ, 1 + √2 − …) */
const PARTS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1.618034, 0.55],
  [2.103, 0.3],
];
const AMP = PARTS.reduce((a, [, w]) => a + w, 0);
/** max |d/dt smoothNoise| per unit `hz` (= 2π Σ f·w / Σ w): the slope bound used by the tests */
export const NOISE_SLOPE = (2 * Math.PI * PARTS.reduce((a, [f, w]) => a + f * w, 0)) / AMP;
/** max |d²/dt² smoothNoise| per unit `hz²` */
export const NOISE_CURVE = (4 * Math.PI * Math.PI * PARTS.reduce((a, [f, w]) => a + f * f * w, 0)) / AMP;

/** deterministic hash of (seed, k) → [0, 1) */
export function hash01(seed: number, k = 0): number {
  let h = Math.imul((seed * 1000003) ^ (k * 0x9e3779b1), 0x85ebca6b) ^ 0x5bd1e995;
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** smooth low-frequency noise in [-1, 1]; `hz` = base frequency (cycles per second) */
export function smoothNoise(t: number, seed: number, hz = 0.1): number {
  let v = 0;
  for (let i = 0; i < PARTS.length; i++) {
    const [f, w] = PARTS[i];
    v += w * Math.sin(2 * Math.PI * hz * f * t + hash01(seed, i + 1) * 2 * Math.PI);
  }
  return v / AMP;
}

/** seeded PRNG (mulberry32) → [0, 1) */
export function rng(seed: number): () => number {
  let a = Math.floor(hash01(seed, 99) * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** a fresh per-head seed when the caller doesn't give one (stable for the head's lifetime) */
let counter = 0;
export function nextSeed(): number {
  counter = (counter + 1) % 1e6;
  return counter * 7.31 + (typeof performance !== "undefined" ? Math.floor(performance.timeOrigin % 997) : 0);
}
