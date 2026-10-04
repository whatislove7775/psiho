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
export function combineEyes(w: Weights, lids = true): Weights {
  const out: Weights = { ...w };
  const { h, v } = gazeOf(w);
  Object.assign(out, gazeWeights(h, v));
  for (const [a, b] of PAIRS) {
    const x = w[a] ?? 0, y = w[b] ?? 0;
    if (Math.abs(x - y) < SYMMETRY) out[a] = out[b] = (x + y) / 2;
  }
  return lids ? withLidFollow(out, v) : out;
}

// ── eyelids follow the gaze ─────────────────────────────────────────────────

/**
 * How far the eyelids follow the eyeball. The eyeballs are rigid and rotate on their own;
 * the lids are the FACE mesh, driven by its authored eyeLook* morphs (they lift/lower the lid
 * skin and stretch it toward the gaze). Everything is a pure function of the shared gaze.
 */
export interface LidGain {
  /** eyeLookUp/Down weight per unit of vertical gaze */
  vertical: number;
  /** eyeLookIn/Out weight per unit of horizontal gaze */
  horizontal: number;
  /** extra upper-lid close on downward gaze (0..1 at v = −1) */
  downClose: number;
  /** extra upper-lid lift (eyeWide) on upward gaze (0..1 at v = +1) */
  upLift: number;
}
export const LID_GAIN: LidGain = { vertical: 1, horizontal: 0.6, downClose: 0.18, upLift: 0.1 };

/** The lids' share of a shared gaze: eyeLook* lid morphs + upper-lid close / lift. Bounded in [0, 1]. */
export function lidWeights(h: number, v: number, gain: LidGain = LID_GAIN): Weights {
  const hh = clamp(h, -1, 1), vv = clamp(v, -1, 1);
  const r = Math.max(0, hh) * gain.horizontal, l = Math.max(0, -hh) * gain.horizontal;
  const u = Math.max(0, vv) * gain.vertical, d = Math.max(0, -vv) * gain.vertical;
  const c = (x: number) => clamp(x, 0, 1);
  return {
    eyeLookOutLeft: c(r), eyeLookInRight: c(r),
    eyeLookInLeft: c(l), eyeLookOutRight: c(l),
    eyeLookUpLeft: c(u), eyeLookUpRight: c(u),
    eyeLookDownLeft: c(d), eyeLookDownRight: c(d),
    // consumed by applyLids (not morph names)
    lidClose: c(Math.max(0, -vv) * gain.downClose),
    lidLift: c(Math.max(0, vv) * gain.upLift),
  };
}

/**
 * In place: sets the lid-follow morphs for the shared gaze and merges them with the blink / wide
 * the expression asks for — a blink closes the lid FROM its followed position (never opens it).
 */
export function applyLids(w: Weights, h: number, v: number, gain: LidGain = LID_GAIN): Weights {
  const f = lidWeights(h, v, gain);
  const close = f.lidClose ?? 0, lift = f.lidLift ?? 0;
  delete f.lidClose;
  delete f.lidLift;
  Object.assign(w, f);
  for (const s of ["Left", "Right"]) {
    const b = clamp(w[`eyeBlink${s}`] ?? 0, 0, 1);
    const blink = 1 - (1 - b) * (1 - close); // follow first, the blink closes the rest
    w[`eyeBlink${s}`] = blink;
    w[`eyeWide${s}`] = clamp((w[`eyeWide${s}`] ?? 0) + lift * (1 - blink), 0, 1);
    // a closing lid takes the look-up lift with it, or the opened skin would fight the blink
    for (const k of ["Up", "Down"]) w[`eyeLook${k}${s}`] = (w[`eyeLook${k}${s}`] ?? 0) * (1 - 0.6 * blink);
  }
  return w;
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

// ── tracked gaze ────────────────────────────────────────────────────────────

/** Minimal One-Euro filter (Casiez et al.) with a reset — smooths jitter, keeps saccades. */
class Euro {
  private x: number | null = null;
  private dx = 0;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  constructor(minCutoff: number, beta: number, dCutoff = 1.5) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }
  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  reset(v: number | null = null) {
    this.x = v;
    this.dx = 0;
  }
  filter(v: number, dt: number): number {
    if (this.x === null || dt <= 0) return (this.x = v);
    const dv = (v - this.x) / dt;
    this.dx += Euro.alpha(this.dCutoff, dt) * (dv - this.dx);
    this.x += Euro.alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
}

/** Blink hysteresis: eyes count as closed above CLOSE, open again below OPEN. */
const CLOSE = 0.6, OPEN = 0.45;
/** A closed-eye hold longer than this is not a blink (squint, smile, looking down): let the gaze go. */
const MAX_HOLD = 0.3;
/** Without usable samples for this long the gaze relaxes to the centre. */
const STALE = 0.15;
/** Returning to the centre: ~90 % in 0.25 s. */
const RELAX = 9;
/** Tiny offsets around the centre are tracker noise: looking at the camera reads as exactly 0. */
const DEAD = 0.06;
/** MediaPipe's eyeLook scores rarely exceed ~0.7: scale to the full physiological range. */
export const GAZE_GAIN = 1.35;

/**
 * The avatar's tracked gaze. Tracked eyeLook* weights → one gaze vector, One-Euro
 * filtered (reacts in well under 100 ms), held only through a real blink (≤ 0.3 s),
 * and relaxed back to the centre whenever input is closed-eyed for longer or missing
 * (low confidence / lost face). It never latches: every path either follows fresh
 * input or decays to 0. Times are in seconds.
 */
export class GazeTracker {
  h = 0;
  v = 0;
  private fh = new Euro(3, 0.8);
  private fv = new Euro(3, 0.8);
  private last = -1;
  private closed = false;
  private closedAt = 0;

  /** A tracked frame (weights already mirrored to avatar space). */
  update(w: Weights, now: number) {
    const blink = ((w.eyeBlinkLeft ?? 0) + (w.eyeBlinkRight ?? 0)) / 2;
    if (!this.closed && blink > CLOSE) {
      this.closed = true;
      this.closedAt = now;
    } else if (this.closed && blink < OPEN) this.closed = false;
    if (this.closed) {
      // lids closing report garbage gaze: hold briefly, then relax toward the centre
      if (now - this.closedAt > MAX_HOLD) this.relax(now);
      else this.relaxedAt = -1;
      this.last = now; // a closed-eye frame is still a live sample (not a gap)
      return;
    }
    const gap = this.last < 0 ? Infinity : now - this.last;
    if (gap > STALE) {
      // after a gap start from the current (relaxed) gaze, not from stale filter state
      this.fh.reset(this.h);
      this.fv.reset(this.v);
    }
    const dt = Math.min(0.1, Math.max(1 / 120, Number.isFinite(gap) ? gap : 1 / 30));
    const g = gazeOf(w);
    const dz = (x: number) => (Math.abs(x) < DEAD ? 0 : x - Math.sign(x) * DEAD);
    const snap = (x: number) => (Math.abs(x) < 1e-3 ? 0 : x);
    this.h = snap(this.fh.filter(clamp(dz(g.h * GAZE_GAIN), -1, 1), dt));
    this.v = snap(this.fv.filter(clamp(dz(g.v * GAZE_GAIN), -1, 1), dt));
    this.last = now;
  }

  /** Every rendered frame: relaxes the gaze when input is stale (no face / low confidence). */
  tick(now: number) {
    if (this.last >= 0 && now - this.last > STALE) this.relax(now);
    else if (this.closed && now - this.closedAt > MAX_HOLD) this.relax(now);
  }

  private relaxedAt = -1;
  private relax(now: number) {
    const dt = this.relaxedAt < 0 ? 1 / 30 : Math.min(0.1, Math.max(0, now - this.relaxedAt));
    this.relaxedAt = now;
    const k = Math.exp(-RELAX * dt);
    this.h *= k;
    this.v *= k;
    if (Math.abs(this.h) < 1e-3) this.h = 0;
    if (Math.abs(this.v) < 1e-3) this.v = 0;
    // the filters continue from the relaxed gaze, never from a stale side look
    this.fh.reset(this.h);
    this.fv.reset(this.v);
  }
}
