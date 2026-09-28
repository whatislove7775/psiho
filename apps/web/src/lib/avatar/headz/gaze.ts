/**
 * Conjugate gaze: real eyes move together. Tracking reports eyeLook* per eye
 * and those scores are noisy and often disagree (one eye "looks in" while the
 * other stays put), which made the avatar go cross-eyed. We collapse them into
 * ONE gaze vector and drive both eyes (and the lids) from it.
 *
 * Conventions (avatar space, after any mirror L/R swap):
 *   h > 0 — looking toward the avatar's own left (+X): left eye looks OUT, right eye looks IN
 *   v > 0 — looking up
 */
export type Weights = Record<string, number | undefined>;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** One shared gaze vector from per-eye scores. */
export function gazeOf(w: Weights): { h: number; v: number } {
  const g = (k: string) => w[k] ?? 0;
  const h = (g("eyeLookOutLeft") - g("eyeLookInLeft") + g("eyeLookInRight") - g("eyeLookOutRight")) / 2;
  const v = (g("eyeLookUpLeft") + g("eyeLookUpRight") - g("eyeLookDownLeft") - g("eyeLookDownRight")) / 2;
  return { h: clamp(h, -1, 1), v: clamp(v, -1, 1) };
}

/** Per-eye eyeLook* morph weights for a shared gaze vector (identical rotation for both eyes). */
export function gazeWeights(h: number, v: number): Weights {
  const r = Math.max(0, h), l = Math.max(0, -h), u = Math.max(0, v), d = Math.max(0, -v);
  return {
    eyeLookOutLeft: r, eyeLookInRight: r,
    eyeLookInLeft: l, eyeLookOutRight: l,
    eyeLookUpLeft: u, eyeLookUpRight: u,
    eyeLookDownLeft: d, eyeLookDownRight: d,
  };
}

/** Pairs whose small L/R differences are tracking noise, not expression (winks stay: they differ a lot). */
const PAIRS: [string, string][] = [
  ["eyeBlinkLeft", "eyeBlinkRight"],
  ["eyeSquintLeft", "eyeSquintRight"],
  ["eyeWideLeft", "eyeWideRight"],
];
const SYMMETRY = 0.25;

/**
 * Rewrites tracked weights in place-safe copy: shared gaze for both eyes,
 * near-equal lid values averaged, and the upper lids following the gaze
 * (lower when looking down, lifted a little when looking up).
 */
export function combineEyes(w: Weights): Weights {
  const out: Weights = { ...w };
  const { h, v } = gazeOf(w);
  Object.assign(out, gazeWeights(h, v));
  for (const [a, b] of PAIRS) {
    const x = w[a] ?? 0, y = w[b] ?? 0;
    if (Math.abs(x - y) < SYMMETRY) out[a] = out[b] = (x + y) / 2;
  }
  return withLidFollow(out, v);
}

/** Upper lids track the vertical gaze (as in real faces): down → lids lower, up → lids lift. */
export function withLidFollow(w: Weights, v: number): Weights {
  const down = Math.max(0, -v), up = Math.max(0, v);
  for (const s of ["Left", "Right"]) {
    w[`eyeBlink${s}`] = clamp((w[`eyeBlink${s}`] ?? 0) + 0.32 * down * (1 - (w[`eyeBlink${s}`] ?? 0)), 0, 1);
    w[`eyeWide${s}`] = clamp((w[`eyeWide${s}`] ?? 0) + 0.18 * up, 0, 1);
  }
  return w;
}
