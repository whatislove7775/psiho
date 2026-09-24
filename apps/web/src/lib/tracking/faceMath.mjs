// Pure, dependency-free face-tracking math (plain ESM so `node --test` can run
// it without a TS toolchain). Types live in faceMath.d.mts; the stateful
// wrapper used by the app is FaceTracker.ts.
//
// Conventions
//  - Landmarks: MediaPipe FaceLandmarker output (478 points: 468 face mesh +
//    10 iris), normalised image coords of the *unmirrored* camera frame.
//    measureFace() turns them into an isotropic 3D space (x·W, y·H, z·W).
//  - "R"/"L" below are ANATOMICAL (the subject's right/left). Landmark 33 is
//    the subject's right-eye outer corner. Mapping to the model's blendshape
//    labels is done by FaceTracker (it auto-detects the model's side
//    convention from gaze correlation).
//  - Distances are normalised by the eye span (outer corner 33 ↔ 263), so the
//    metrics don't depend on distance to the camera; positional metrics are
//    projected onto a face-aligned frame (x: right→left eye, y: chin→forehead)
//    so moderate head rotation doesn't read as expression.

// ── Canonical MediaPipe face-mesh landmark indices ─────────────────────────
export const LM = Object.freeze({
  // Eyes — corners
  R_EYE_OUTER: 33,
  R_EYE_INNER: 133,
  L_EYE_OUTER: 263,
  L_EYE_INNER: 362,
  // Eyelid pairs (upper, lower), outer-mid → centre → inner-mid, for EAR
  R_LID_PAIRS: [[160, 144], [159, 145], [158, 153]],
  L_LID_PAIRS: [[387, 373], [386, 374], [385, 380]],
  // Iris centres (refined landmarks 468–477; 469–472 / 474–477 are the rims)
  R_IRIS: 468,
  L_IRIS: 473,
  // Brows (upper contour): inner, middle, outer
  R_BROW_INNER: 107,
  R_BROW_MID: 105,
  R_BROW_OUTER: 70,
  L_BROW_INNER: 336,
  L_BROW_MID: 334,
  L_BROW_OUTER: 300,
  // Mouth
  MOUTH_R: 61, // right corner
  MOUTH_L: 291, // left corner
  LIP_INNER_UP: 13,
  LIP_INNER_LOW: 14,
  // Face axis
  FOREHEAD: 10,
  CHIN: 152,
});

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── Small vector helpers (arrays [x, y, z]) ───────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => {
  const l = len(a) || 1;
  return scale(a, 1 / l);
};
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mid = (a, b) => lerp3(a, b, 0.5);

// ── One-Euro filter (Casiez et al., CHI 2012) ─────────────────────────────
// Adaptive low-pass: cutoff = minCutoff + beta·|dx/dt|. At rest the cutoff is
// low (jitter vanishes); fast motion raises it (blinks/speech stay snappy).
function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroFilter {
  /**
   * @param {number} minCutoff Hz
   * @param {number} beta       speed coefficient
   * @param {number} dCutoff    Hz, derivative low-pass
   */
  constructor(minCutoff = 1.2, beta = 1, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  /** @param {number} x value, @param {number} t timestamp in seconds */
  filter(x, t) {
    if (this.x === null || this.t === null) {
      this.x = x;
      this.dx = 0;
      this.t = t;
      return x;
    }
    let dt = t - this.t;
    if (!(dt > 0)) dt = 1 / 60; // duplicate/non-monotonic timestamp
    if (dt > 0.5) {
      // long gap (face lost / tab hidden): restart instead of smearing
      this.x = x;
      this.dx = 0;
      this.t = t;
      return x;
    }
    this.t = t;
    const rawDx = (x - this.x) / dt;
    this.dx = this.dx + alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x = this.x + alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
}

/** Unwrap angle `a` to be continuous with `prev` (radians). */
export function unwrapAngle(a, prev) {
  if (prev === null || prev === undefined) return a;
  let d = a - prev;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return prev + d;
}

// ── Neutral calibration ───────────────────────────────────────────────────
export function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Map a blendshape weight so the user's resting value becomes 0:
 *   w' = clamp((w − rest) / (1 − rest)), then a small dead-zone.
 * `rest` is capped so a channel that is high at rest can't blow up.
 */
export function remapFromRest(w, rest, deadZone = 0.03, maxRest = 0.6) {
  const r = Math.min(Math.max(rest, 0), maxRest);
  const v = clamp01((w - r) / (1 - r));
  if (v <= deadZone) return 0;
  return (v - deadZone) / (1 - deadZone);
}

/** Apply a dead-zone to a signed/unsigned 0..1 value. */
export function deadZone(v, dz) {
  if (v <= dz) return 0;
  return clamp01((v - dz) / (1 - dz));
}

/**
 * Collects per-channel samples while the face is still and facing the camera
 * and returns per-channel medians (robust to a blink during calibration).
 */
export class NeutralCalibrator {
  /**
   * @param {{ duration?: number, minSamples?: number, giveUpAfter?: number }} [opts]
   *   duration: seconds of continuous stable detection needed (default 1.5)
   *   giveUpAfter: seconds after which stability is no longer required (default 6)
   */
  constructor(opts = {}) {
    this.duration = opts.duration ?? 1.5;
    this.minSamples = opts.minSamples ?? 12;
    this.giveUpAfter = opts.giveUpAfter ?? 6;
    this.reset();
  }

  reset() {
    this.samples = new Map();
    this.windowStart = null;
    this.firstSeen = null;
    this.count = 0;
    this.rest = null;
  }

  get done() {
    return this.rest !== null;
  }

  /** 0..1 progress of the current window. */
  progress(t) {
    if (this.done) return 1;
    if (this.windowStart === null) return 0;
    return clamp01((t - this.windowStart) / this.duration);
  }

  /**
   * @param {Record<string, number>} values channel → value for this frame
   * @param {number} t seconds
   * @param {boolean} stable whether the head is still & frontal this frame
   * @returns {boolean} true once calibration has completed
   */
  add(values, t, stable) {
    if (this.done) return true;
    if (this.firstSeen === null) this.firstSeen = t;
    const relaxed = t - this.firstSeen > this.giveUpAfter;
    if (!stable && !relaxed) {
      this.samples = new Map();
      this.windowStart = null;
      this.count = 0;
      return false;
    }
    if (this.windowStart === null) this.windowStart = t;
    for (const k in values) {
      const v = values[k];
      if (!Number.isFinite(v)) continue;
      let arr = this.samples.get(k);
      if (!arr) this.samples.set(k, (arr = []));
      arr.push(v);
    }
    this.count++;
    if (t - this.windowStart >= this.duration && this.count >= this.minSamples) {
      const rest = {};
      for (const [k, arr] of this.samples) rest[k] = median(arr);
      this.rest = rest;
      this.samples = new Map();
      return true;
    }
    return false;
  }
}

// ── Landmark measurements ─────────────────────────────────────────────────
/**
 * Geometric measurements from one face's landmarks, normalised by eye span.
 * @param {{x:number,y:number,z:number}[]} lm 478 landmarks (normalised coords)
 * @param {number} [aspect] video width / height (default 4/3)
 */
export function measureFace(lm, aspect = 4 / 3) {
  // isotropic space: x·W, y·H, z·W with W = aspect, H = 1
  const P = (i) => {
    const p = lm[i];
    return [p.x * aspect, p.y, (p.z ?? 0) * aspect];
  };
  const rOut = P(LM.R_EYE_OUTER);
  const rIn = P(LM.R_EYE_INNER);
  const lOut = P(LM.L_EYE_OUTER);
  const lIn = P(LM.L_EYE_INNER);
  const span = len(sub(lOut, rOut)) || 1e-6;

  // Face frame: X from right eye to left eye, Y from chin to forehead (⊥ X)
  const X = norm(sub(lOut, rOut));
  const upRaw = sub(P(LM.FOREHEAD), P(LM.CHIN));
  const Y = norm(sub(upRaw, scale(X, dot(upRaw, X))));
  const along = (v, axis) => dot(v, axis) / span;

  // Eye aspect ratio (mean lid gap / eye width), 3D
  const ear = (pairs, outer, inner) => {
    const w = len(sub(outer, inner)) || 1e-6;
    let g = 0;
    for (const [u, d] of pairs) g += len(sub(P(u), P(d)));
    return g / pairs.length / w;
  };
  const earR = ear(LM.R_LID_PAIRS, rOut, rIn);
  const earL = ear(LM.L_LID_PAIRS, lOut, lIn);

  // Iris position within the eye: h = 0 at inner corner, 1 at outer corner;
  // v = height above the corner line, in eye widths.
  const iris = (c, outer, inner) => {
    const axis = sub(outer, inner);
    const w2 = dot(axis, axis) || 1e-6;
    const rel = sub(c, inner);
    const w = Math.sqrt(w2);
    return { h: dot(rel, axis) / w2, v: dot(sub(c, mid(outer, inner)), Y) / w };
  };
  const hasIris = lm.length > LM.L_IRIS;
  const ir = hasIris ? iris(P(LM.R_IRIS), rOut, rIn) : { h: 0.5, v: 0 };
  const il = hasIris ? iris(P(LM.L_IRIS), lOut, lIn) : { h: 0.5, v: 0 };

  // Mouth. Lip centre sits 40 % of the way from upper to lower inner lip —
  // roughly where the corners ride when the jaw drops, so opening the mouth
  // doesn't read as a smile/frown.
  const up = P(LM.LIP_INNER_UP);
  const low = P(LM.LIP_INNER_LOW);
  const lipGap = len(sub(up, low)) / span;
  const centre = lerp3(up, low, 0.4);
  const cR = sub(P(LM.MOUTH_R), centre);
  const cL = sub(P(LM.MOUTH_L), centre);

  // Brows: height above the (stable) eye-corner midpoint
  const rEyeMid = mid(rOut, rIn);
  const lEyeMid = mid(lOut, lIn);
  const bh = (i, eyeMid) => along(sub(P(i), eyeMid), Y);

  return {
    span,
    earR,
    earL,
    lipGap,
    mouthLatR: Math.abs(along(cR, X)),
    mouthLatL: Math.abs(along(cL, X)),
    mouthVertR: along(cR, Y),
    mouthVertL: along(cL, Y),
    browInR: bh(LM.R_BROW_INNER, rEyeMid),
    browInL: bh(LM.L_BROW_INNER, lEyeMid),
    browMidR: bh(LM.R_BROW_MID, rEyeMid),
    browMidL: bh(LM.L_BROW_MID, lEyeMid),
    browOutR: bh(LM.R_BROW_OUTER, rEyeMid),
    browOutL: bh(LM.L_BROW_OUTER, lEyeMid),
    irisHR: ir.h,
    irisHL: il.h,
    irisVR: ir.v,
    irisVL: il.v,
  };
}

// Full-scale deltas (in eye-span units unless noted) — the change from the
// user's neutral that maps to a blendshape weight of 1.
export const RANGES = Object.freeze({
  blinkOpenRatio: 0.92, // EAR/EAR_rest above this → 0 blink
  blinkClosedRatio: 0.25, // … at or below this → 1 blink
  wideRatio: 0.3, // EAR/EAR_rest − 1.06 over this → 1 wide
  jaw: 0.42, // inner-lip gap
  smile: 0.07, // corner rise
  frown: 0.05, // corner drop
  stretch: 0.08, // corner moves outward
  browUp: 0.09,
  browDown: 0.05,
  gazeH: 0.17, // iris offset, fraction of eye width
  gazeV: 0.09,
});

/**
 * Landmark-derived ARKit weights relative to the user's neutral metrics.
 * Names use ANATOMICAL sides (Right = subject's right). Gaze is conjugate
 * (both eyes averaged) for noise robustness.
 * @param {ReturnType<typeof measureFace>} m
 * @param {ReturnType<typeof measureFace>} rest
 */
export function landmarkWeights(m, rest) {
  const R = RANGES;
  const blink = (ear, earRest) => {
    const r = ear / (earRest || 1e-6);
    return clamp01((R.blinkOpenRatio - r) / (R.blinkOpenRatio - R.blinkClosedRatio));
  };
  const wide = (ear, earRest) => clamp01((ear / (earRest || 1e-6) - 1.06) / R.wideRatio);

  const out = {};
  out.eyeBlinkRight = blink(m.earR, rest.earR);
  out.eyeBlinkLeft = blink(m.earL, rest.earL);
  out.eyeWideRight = wide(m.earR, rest.earR);
  out.eyeWideLeft = wide(m.earL, rest.earL);

  out.jawOpen = clamp01((m.lipGap - rest.lipGap - 0.01) / R.jaw);

  for (const s of ["Right", "Left"]) {
    const k = s === "Right" ? "R" : "L";
    const dv = m[`mouthVert${k}`] - rest[`mouthVert${k}`];
    const dl = m[`mouthLat${k}`] - rest[`mouthLat${k}`];
    const smile = clamp01(dv / R.smile);
    out[`mouthSmile${s}`] = smile;
    out[`mouthFrown${s}`] = clamp01(-dv / R.frown);
    out[`mouthStretch${s}`] = clamp01(dl / R.stretch) * (1 - smile);

    const dIn = m[`browIn${k}`] - rest[`browIn${k}`];
    const dMid = m[`browMid${k}`] - rest[`browMid${k}`];
    const dOut = m[`browOut${k}`] - rest[`browOut${k}`];
    out[`browOuterUp${s}`] = clamp01((0.7 * dOut + 0.3 * dMid) / R.browUp);
    out[`browDown${s}`] = clamp01(-(0.5 * dIn + 0.3 * dMid + 0.2 * dOut) / R.browDown);
  }
  const dInR = m.browInR - rest.browInR;
  const dInL = m.browInL - rest.browInL;
  out.browInnerUp = clamp01((dInR + dInL) / 2 / R.browUp);

  // Gaze. For each eye, "out" = toward its outer corner. Looking toward the
  // subject's LEFT moves the left iris out and the right iris in.
  const outR = m.irisHR - rest.irisHR;
  const outL = m.irisHL - rest.irisHL;
  const towardLeft = (outL - outR) / 2; // + = subject looks to their left
  const v = (m.irisVR - rest.irisVR + m.irisVL - rest.irisVL) / 2; // + = up
  const gx = towardLeft / R.gazeH;
  const gy = v / R.gazeV;
  out.eyeLookOutLeft = clamp01(gx);
  out.eyeLookInRight = clamp01(gx);
  out.eyeLookInLeft = clamp01(-gx);
  out.eyeLookOutRight = clamp01(-gx);
  out.eyeLookUpLeft = out.eyeLookUpRight = clamp01(gy);
  out.eyeLookDownLeft = out.eyeLookDownRight = clamp01(-gy);
  return out;
}

/** Signed horizontal gaze (+ = subject's left) implied by ARKit-labelled look weights. */
export function modelGazeTowardLeft(w) {
  return (w.eyeLookOutLeft ?? 0) + (w.eyeLookInRight ?? 0) - (w.eyeLookInLeft ?? 0) - (w.eyeLookOutRight ?? 0);
}

/** Landmark-measured signed horizontal gaze (+ = subject's left), in eye widths. */
export function measuredGazeTowardLeft(m, rest) {
  return (m.irisHL - rest.irisHL - (m.irisHR - rest.irisHR)) / 2;
}

/** Swap Left↔Right in an ARKit channel name. */
export function swapSide(name) {
  if (name.endsWith("Left")) return name.slice(0, -4) + "Right";
  if (name.endsWith("Right")) return name.slice(0, -5) + "Left";
  return name;
}

// Share of the landmark estimate when blending with the model's blendshape.
export const LANDMARK_BLEND = Object.freeze({
  eyeBlink: 0.6,
  eyeWide: 0.5,
  jawOpen: 0.5,
  mouthSmile: 0.4,
  mouthFrown: 0.4,
  mouthStretch: 0.3,
  browInnerUp: 0.5,
  browOuterUp: 0.5,
  browDown: 0.5,
  eyeLook: 0.7,
});

/** Blend share for a channel name (0 = model only). */
export function landmarkShare(name) {
  for (const key in LANDMARK_BLEND) if (name.startsWith(key)) return LANDMARK_BLEND[key];
  return 0;
}

// ── Head pose: column-major 4×4 ↔ Euler (YXZ, same as three.js) ──────────
/** @param {ArrayLike<number>} m column-major 4×4 */
export function matrixToPose(m) {
  const sx = Math.hypot(m[0], m[1], m[2]) || 1;
  const sy = Math.hypot(m[4], m[5], m[6]) || 1;
  const sz = Math.hypot(m[8], m[9], m[10]) || 1;
  const m11 = m[0] / sx, m12 = m[4] / sy, m13 = m[8] / sz;
  const m21 = m[1] / sx, m22 = m[5] / sy, m23 = m[9] / sz;
  const m31 = m[2] / sx, m33 = m[10] / sz;
  const x = Math.asin(-Math.max(-1, Math.min(1, m23)));
  let y, z;
  if (Math.abs(m23) < 0.9999999) {
    y = Math.atan2(m13, m33);
    z = Math.atan2(m21, m22);
  } else {
    y = Math.atan2(-m31, m11);
    z = 0;
  }
  return { x, y, z, sx, sy, sz, tx: m[12], ty: m[13], tz: m[14] };
}

/** Inverse of matrixToPose → column-major 4×4 (Float32Array-compatible array). */
export function poseToMatrix(p) {
  const a = Math.cos(p.x), b = Math.sin(p.x);
  const c = Math.cos(p.y), d = Math.sin(p.y);
  const e = Math.cos(p.z), f = Math.sin(p.z);
  const ce = c * e, cf = c * f, de = d * e, df = d * f;
  const m = new Array(16).fill(0);
  m[0] = (ce + df * b) * p.sx; m[4] = (de * b - cf) * p.sy; m[8] = a * d * p.sz;
  m[1] = a * f * p.sx;         m[5] = a * e * p.sy;         m[9] = -b * p.sz;
  m[2] = (cf * b - de) * p.sx; m[6] = (df + ce * b) * p.sy; m[10] = a * c * p.sz;
  m[12] = p.tx; m[13] = p.ty; m[14] = p.tz; m[15] = 1;
  return m;
}
