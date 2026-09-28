/**
 * Hand gestures from HandLandmarker landmarks (numbers only, on this device):
 *   "up"    — thumbs up        → a 👍 reaction in the call
 *   "down"  — thumbs down      → a 👎 reaction
 *   "raise" — open hand raised above the chin/shoulders → «поднять руку» (circles only)
 *
 * classifyHand() looks at one detection; GestureDetector debounces the stream:
 * a gesture must be held (≥ 0.5 s, raise ≥ 0.8 s, tolerating short dropouts),
 * then fires once; after that nothing fires for 3 s and the same gesture has
 * to be released before it can fire again. Low-confidence detections are ignored.
 *
 * Pure TS (erasable syntax only) so node tests import it directly.
 */
import type { HandDetection } from "../../../tracking/handTypes";

export type Gesture = "up" | "down" | "raise";

/** Face reference in image units (x already multiplied by the aspect), as in handMath.faceRef. */
export interface GestureFace {
  cx: number;
  cy: number;
  h: number;
}

export const GESTURE = {
  /** handedness/presence score a detection needs */
  minScore: 0.75,
  hold: { up: 500, down: 500, raise: 800 } as Record<Gesture, number>,
  /** gaps shorter than this (missed frames) don't break a hold */
  gapMs: 260,
  cooldownMs: 3000,
};

type P = [number, number, number];
const pt = (a: ArrayLike<number>, i: number): P => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: P) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: P): P => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const ang = (a: P, b: P) => {
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / ((len(a) || 1) * (len(b) || 1));
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
};

const BASE = { index: 5, middle: 9, ring: 13, pinky: 17 } as const;

/** total flexion of a finger (degrees): 0 straight, ~250 tight fist */
export function fingerCurl(w: ArrayLike<number>, base: number): number {
  const W = pt(w, 0);
  const j = [0, 1, 2, 3].map((k) => pt(w, base + k));
  return ang(sub(j[0], W), sub(j[1], j[0])) + ang(sub(j[1], j[0]), sub(j[2], j[1])) + ang(sub(j[2], j[1]), sub(j[3], j[2]));
}

/** thumb: how bent its last two joints are (degrees) and where it points (unit vector, MediaPipe axes: +y = down) */
export function thumbShape(w: ArrayLike<number>): { bend: number; dir: P } {
  const [a, b, c, d] = [1, 2, 3, 4].map((i) => pt(w, i));
  return { bend: ang(sub(b, a), sub(c, b)) + ang(sub(c, b), sub(d, c)), dir: norm(sub(d, b)) };
}

/** One detection → a gesture candidate (or null). `face` may be null when the face is not tracked. */
export function classifyHand(h: HandDetection, face: GestureFace | null, aspect = 4 / 3): Gesture | null {
  if (!(h.score >= GESTURE.minScore)) return null;
  const w = h.world;
  const curls = (Object.values(BASE) as number[]).map((b) => fingerCurl(w, b));
  const thumb = thumbShape(w);
  const thumbStraight = thumb.bend < 55;
  const fist = curls.every((c) => c > 140);
  if (fist && thumbStraight) {
    // the thumb must stick out of the fist, not rest on it
    const out = len(sub(pt(w, 4), pt(w, 5))) > 0.6 * len(sub(pt(w, 5), pt(w, 0)));
    if (out && thumb.dir[1] < -0.72) return "up";
    if (out && thumb.dir[1] > 0.72) return "down";
    return null;
  }
  const open = curls.every((c) => c < 55) && thumb.bend < 70;
  if (open) {
    const up = norm(sub(pt(w, 9), pt(w, 0)));
    if (up[1] > -0.6) return null; // fingers must point up
    const img = h.image;
    const cy = (img[1] + img[5 * 3 + 1] + img[9 * 3 + 1] + img[17 * 3 + 1]) / 4; // palm centre, image y
    const cx = ((img[0] + img[5 * 3] + img[9 * 3] + img[17 * 3]) / 4) * aspect;
    // above the chin (≈ above the shoulders); without a face: upper part of the frame
    const chin = face ? face.cy + face.h * 0.5 : 0.45;
    if (cy > chin) return null;
    // not a hand simply held in front of the face
    if (face && Math.abs(cx - face.cx) < face.h * 0.35 && cy > face.cy - face.h * 0.5) return null;
    return "raise";
  }
  return null;
}

/** Candidate of a whole frame (both hands): thumbs win over raise; conflicting thumbs cancel out. */
export function classifyFrame(hands: HandDetection[], face: GestureFace | null, aspect = 4 / 3): Gesture | null {
  const c = hands.map((h) => classifyHand(h, face, aspect)).filter(Boolean) as Gesture[];
  const up = c.includes("up"), down = c.includes("down");
  if (up && down) return null;
  if (up) return "up";
  if (down) return "down";
  return c.includes("raise") ? "raise" : null;
}

export class GestureDetector {
  private cand: Gesture | null = null;
  private since = 0;
  private lastSeen = -1e9;
  private fired = false;
  private cooldownUntil = -1e9;

  reset() {
    this.cand = null;
    this.fired = false;
  }

  /** Feed one hand-detection frame's candidate. Returns the gesture when it fires. */
  update(g: Gesture | null, tMs: number): Gesture | null {
    if (g === null) {
      if (this.cand && tMs - this.lastSeen > GESTURE.gapMs) this.reset();
      return null;
    }
    if (g !== this.cand) {
      this.cand = g;
      this.since = tMs;
      this.fired = false;
    }
    this.lastSeen = tMs;
    if (this.fired || tMs < this.cooldownUntil) return null;
    if (tMs - this.since >= GESTURE.hold[g]) {
      this.fired = true;
      this.cooldownUntil = tMs + GESTURE.cooldownMs;
      return g;
    }
    return null;
  }
}
