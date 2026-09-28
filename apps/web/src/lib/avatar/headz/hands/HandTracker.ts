/**
 * HandTracker — raw HandLandmarker detections → per-avatar-hand, jitter-free
 * input for the floating hands: which avatar hand (L/R) each detection drives,
 * its 21 points in avatar space (One-Euro filtered) and where its palm goes
 * next to the head (relative to the face in the picture, depth from hand size).
 * Pure numbers; no pixels, nothing leaves the device.
 */
import { OneEuroFilter } from "../../../tracking/faceMath.mjs";
import type { HandDetection, HandsRaw } from "../../../tracking/handTypes";
import { faceRef, placeHand, sideFor, toAvatarPoints, type FaceRef } from "./handMath.mjs";

export type HandSide = "L" | "R";

export interface HandPose {
  side: HandSide;
  /** 21 points, avatar space (x right on screen, y up, z to the viewer), metres */
  points: number[][];
  /** palm centre in avatar/head space (units: normalised head, chin → crown = 2) */
  anchor: number[];
  /** hand size relative to the face (> 1: closer to the camera than the face) */
  ratio: number;
}

/** points in metres: calm at rest, fast moves (≈0.5 m/s) open the filter to ~10 Hz */
const PTS = { minCutoff: 2.2, beta: 18, dCutoff: 1 };
/** palm position in head units */
const POS = { minCutoff: 1.4, beta: 0.7, dCutoff: 1 };
/** a detection needs this handedness score */
const MIN_SCORE = 0.6;
/** filters restart after this long without the hand */
const REACQUIRE_MS = 300;

class SideState {
  pts = Array.from({ length: 63 }, () => new OneEuroFilter(PTS.minCutoff, PTS.beta, PTS.dCutoff));
  pos = Array.from({ length: 3 }, () => new OneEuroFilter(POS.minCutoff, POS.beta, POS.dCutoff));
  last = -1e9;
  reset() {
    this.pts.forEach((f) => f.reset());
    this.pos.forEach((f) => f.reset());
  }
}

const DEFAULT_FACE = (aspect: number): FaceRef => ({ cx: 0.5 * aspect, cy: 0.42, h: 0.3 });

export class HandTracker {
  /** the avatar mirrors the user (default, like every renderer here) */
  mirror = true;
  /** avatar camera distance (perspective correction of the placement) */
  camDist = 9;
  private face: { ref: FaceRef; t: number } | null = null;
  private sides: Record<HandSide, SideState> = { L: new SideState(), R: new SideState() };

  /** Latest face landmarks (normalised image coords) — the hands are placed relative to the face. */
  setFace(lm: { x: number; y: number }[] | null | undefined, aspect: number, tMs: number) {
    const ref = lm ? faceRef(lm, aspect) : null;
    if (!ref || !(ref.h > 0.02)) return;
    // light smoothing: the face reference must not make the hands shake
    if (this.face && tMs - this.face.t < 500) {
      const k = 0.35;
      const f = this.face.ref;
      this.face = { ref: { cx: f.cx + (ref.cx - f.cx) * k, cy: f.cy + (ref.cy - f.cy) * k, h: f.h + (ref.h - f.h) * k }, t: tMs };
    } else this.face = { ref, t: tMs };
  }

  /** current face reference (null when the face hasn't been seen for 3 s) */
  faceRef(tMs: number): FaceRef | null {
    return this.face && tMs - this.face.t < 3000 ? this.face.ref : null;
  }

  reset() {
    this.sides.L.reset();
    this.sides.R.reset();
    this.face = null;
  }

  /** Assign detections to the avatar's hands (by handedness; by screen position if both claim the same side). */
  assign(hands: HandDetection[]): Partial<Record<HandSide, HandDetection>> {
    const ok = hands.filter((h) => h.score >= MIN_SCORE).slice(0, 2);
    const out: Partial<Record<HandSide, HandDetection>> = {};
    if (ok.length === 2 && sideFor(ok[0].label, this.mirror) === sideFor(ok[1].label, this.mirror)) {
      // the avatar's left hand is on the screen's right
      const sx = (h: HandDetection) => (this.mirror ? 1 - h.image[27] : h.image[27]); // lm 9 (middle MCP)
      const [a, b] = sx(ok[0]) > sx(ok[1]) ? [ok[0], ok[1]] : [ok[1], ok[0]];
      out.L = a;
      out.R = b;
      return out;
    }
    for (const h of ok) out[sideFor(h.label, this.mirror)] = h;
    return out;
  }

  /** @param tMs frame time (performance.now() clock) */
  process(raw: HandsRaw, aspect: number, tMs: number): Partial<Record<HandSide, HandPose>> {
    const t = tMs / 1000;
    const face = this.face && tMs - this.face.t < 3000 ? this.face.ref : DEFAULT_FACE(aspect);
    const res: Partial<Record<HandSide, HandPose>> = {};
    const found = this.assign(raw.hands);
    for (const side of ["L", "R"] as HandSide[]) {
      const det = found[side];
      if (!det) continue;
      const st = this.sides[side];
      if (tMs - st.last > REACQUIRE_MS) st.reset();
      st.last = tMs;
      const pts = toAvatarPoints(det.world, this.mirror);
      const fp = pts.map((p, i) => [st.pts[i * 3].filter(p[0], t), st.pts[i * 3 + 1].filter(p[1], t), st.pts[i * 3 + 2].filter(p[2], t)]);
      const pl = placeHand(det.image, det.world, face, aspect, this.mirror, this.camDist);
      const anchor = pl.pos.map((v, i) => st.pos[i].filter(v, t));
      res[side] = { side, points: fp, anchor, ratio: pl.ratio };
    }
    return res;
  }
}
