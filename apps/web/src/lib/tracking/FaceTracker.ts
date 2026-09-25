/**
 * FaceTracker — turns raw MediaPipe FaceLandmarker results into precise,
 * per-user-calibrated, jitter-free avatar input.
 *
 *   landmarker result ─┬─ 52 blendshapes ── neutral remap ──┐
 *                      ├─ 478 landmarks ─── geometric metrics (EAR, lip gap,
 *                      │                    corners, brows, iris) vs neutral ─┤ blend
 *                      └─ head matrix ───── Euler YXZ ──────────────────────┐ │
 *                                                                          One-Euro per channel
 *                                                                           ▼
 *                                          FaceResult (same shape as MediaPipe's)
 *
 * Output keeps MediaPipe's shape so `renderer.applyFaceResult()` works as-is.
 * No mirroring here — the renderer mirrors.
 */
import type { FaceResult } from "@/lib/avatar/kit/types";
import {
  NeutralCalibrator,
  OneEuroFilter,
  landmarkShare,
  landmarkWeights,
  matrixToPose,
  measureFace,
  measuredGazeTowardLeft,
  modelGazeTowardLeft,
  poseToMatrix,
  remapFromRest,
  swapSide,
  unwrapAngle,
  type FaceMetrics,
  type HeadPose,
  type Landmark,
} from "./faceMath.mjs";

/** The subset of @mediapipe/tasks-vision FaceLandmarkerResult we read. */
export interface LandmarkerResult {
  faceLandmarks?: Landmark[][];
  faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
  facialTransformationMatrixes?: { data: ArrayLike<number> }[];
}

interface FilterParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

/**
 * One-Euro parameters per channel group. minCutoff (Hz) sets how still a
 * resting face stays; beta opens the filter while the value moves, so fast
 * motion (blinks, syllables, head turns) passes with little lag.
 *
 * Retuned for latency (bounds checked in __tests__/faceMath.test.mjs).
 * 50 %-crossing lag of a fast move through tracker + renderer at 30 fps,
 * old → new: jaw 60 → 38 ms, smile 58 → 37 ms, brows 92 → 58 ms,
 * head turn 133 → 46 ms, nod 140 → 53 ms; resting jitter still cut
 * ≥ 2.5× overall. (The renderer's own smoothing, which used to add
 * 40–80 ms, now follows at 60/s — see KitRenderer TRACK_RATE.)
 */
export const FILTERS: Record<string, FilterParams> = {
  eyeBlink: { minCutoff: 1.2, beta: 2, dCutoff: 3 },
  eyeWide: { minCutoff: 1.2, beta: 2.5, dCutoff: 3 },
  eyeLook: { minCutoff: 1.2, beta: 2.5, dCutoff: 3 },
  jaw: { minCutoff: 1.2, beta: 5, dCutoff: 2.5 },
  mouth: { minCutoff: 1.2, beta: 4, dCutoff: 2.5 },
  // brows: still slightly favour stillness
  brow: { minCutoff: 1.2, beta: 3, dCutoff: 2 },
  default: { minCutoff: 1.2, beta: 3, dCutoff: 2.5 },
  /** head rotation, radians (Euler YXZ) */
  headRot: { minCutoff: 1.2, beta: 6, dCutoff: 2 },
  /** head translation, MediaPipe canonical units (cm) */
  headPos: { minCutoff: 1.5, beta: 0.3, dCutoff: 2 },
};

function filterParams(name: string): FilterParams {
  for (const key of ["eyeBlink", "eyeWide", "eyeLook", "jaw", "mouth", "brow"]) {
    if (name.startsWith(key)) return FILTERS[key];
  }
  return FILTERS.default;
}

const makeFilter = (p: FilterParams) => new OneEuroFilter(p.minCutoff, p.beta, p.dCutoff);

/** Head counts as "still & frontal" for calibration below these limits. */
const CALIB_MAX_ANGLE = 0.35; // rad
const CALIB_MAX_SPEED = 0.6; // rad/s

export interface FaceTrackerOptions {
  /** Seconds of stable detection used for the neutral pose (default 1.5). */
  calibrationSeconds?: number;
}

export class FaceTracker {
  private calibrator: NeutralCalibrator;
  private restBs: Record<string, number> | null = null;
  private restLm: FaceMetrics | null = null;
  private filters = new Map<string, OneEuroFilter>();
  private rotFilters = [makeFilter(FILTERS.headRot), makeFilter(FILTERS.headRot), makeFilter(FILTERS.headRot)];
  private posFilters = [makeFilter(FILTERS.headPos), makeFilter(FILTERS.headPos), makeFilter(FILTERS.headPos)];
  private lastPose: HeadPose | null = null;
  private lastT: number | null = null;
  private prevEuler: [number, number, number] | null = null;
  /** evidence that the model labels sides opposite to anatomical (see sideConvention) */
  private sideEvidence = 0;
  private swapLR = false;

  constructor(opts: FaceTrackerOptions = {}) {
    this.calibrator = new NeutralCalibrator({ duration: opts.calibrationSeconds ?? 1.5 });
  }

  /** True until the user's neutral face has been captured. */
  get calibrating(): boolean {
    return !this.calibrator.done;
  }

  /** Forget the neutral pose and capture a new one from the next stable frames. */
  recalibrate() {
    this.calibrator.reset();
    this.restBs = null;
    this.restLm = null;
  }

  /** Drop filter state (call after the face was lost for a while). */
  resetFilters() {
    this.filters.forEach((f) => f.reset());
    this.rotFilters.forEach((f) => f.reset());
    this.posFilters.forEach((f) => f.reset());
    this.prevEuler = null;
    this.lastPose = null;
    this.lastT = null;
  }

  /**
   * @param res  FaceLandmarker result for one frame
   * @param tMs  frame timestamp in ms (video time)
   * @param aspect video width / height, to make landmark space isotropic
   * @returns FaceResult for the renderer, or null when no face is present
   */
  process(res: LandmarkerResult | null | undefined, tMs: number, aspect = 4 / 3): FaceResult | null {
    const cats = res?.faceBlendshapes?.[0]?.categories;
    if (!cats || !cats.length) return null;
    const t = tMs / 1000;
    const lm = res?.faceLandmarks?.[0];
    const mtx = res?.facialTransformationMatrixes?.[0]?.data;

    const raw: Record<string, number> = {};
    for (const c of cats) raw[c.categoryName] = c.score;
    const pose = mtx && mtx.length >= 16 ? matrixToPose(mtx) : null;
    const metrics = lm && lm.length >= 468 ? measureFace(lm, aspect) : null;

    // ── Calibration ────────────────────────────────────────────────────
    if (!this.calibrator.done) {
      const sample: Record<string, number> = {};
      for (const k in raw) sample[`bs:${k}`] = raw[k];
      if (metrics) for (const k in metrics) sample[`lm:${k}`] = metrics[k as keyof FaceMetrics];
      if (this.calibrator.add(sample, t, this.isStable(pose, t))) {
        const rest = this.calibrator.rest!;
        const bs: Record<string, number> = {};
        const lmRest: Record<string, number> = {};
        for (const k in rest) {
          if (k.startsWith("bs:")) bs[k.slice(3)] = rest[k];
          else if (k.startsWith("lm:")) lmRest[k.slice(3)] = rest[k];
        }
        this.restBs = bs;
        this.restLm = metrics ? (lmRest as unknown as FaceMetrics) : null;
      }
    }
    this.trackPose(pose, t);

    // ── Per-channel weights ───────────────────────────────────────────
    const out: Record<string, number> = {};
    if (!this.restBs) {
      // not calibrated yet: model output as-is (still filtered below)
      Object.assign(out, raw);
    } else {
      for (const k in raw) out[k] = k === "_neutral" ? raw[k] : remapFromRest(raw[k], this.restBs[k] ?? 0);
      if (metrics && this.restLm) {
        this.updateSideConvention(metrics, this.restLm, raw);
        const lmW = landmarkWeights(metrics, this.restLm);
        const blink = Math.max(lmW.eyeBlinkLeft ?? 0, lmW.eyeBlinkRight ?? 0);
        for (const anat in lmW) {
          const name = this.swapLR ? swapSide(anat) : anat;
          if (!(name in out)) continue;
          let share = landmarkShare(name);
          // Iris is unreliable while the lids are closing.
          if (name.startsWith("eyeLook")) share *= 1 - blink;
          out[name] = share * lmW[anat] + (1 - share) * out[name];
        }
      }
    }

    // ── One-Euro per channel ──────────────────────────────────────────
    const categories = cats.map(({ categoryName }) => {
      let f = this.filters.get(categoryName);
      if (!f) this.filters.set(categoryName, (f = makeFilter(filterParams(categoryName))));
      const v = f.filter(out[categoryName] ?? 0, t);
      return { categoryName, score: v < 0 ? 0 : v > 1 ? 1 : v };
    });

    const result: FaceResult = { faceBlendshapes: [{ categories }] };
    if (pose) result.facialTransformationMatrixes = [{ data: poseToMatrix(this.filterPose(pose, t)) }];
    return result;
  }

  /** Whether the model's Left/Right labels are opposite to anatomical sides. */
  get sidesSwapped(): boolean {
    return this.swapLR;
  }

  // ── internals ───────────────────────────────────────────────────────

  private isStable(pose: HeadPose | null, t: number): boolean {
    if (!pose) return true;
    if (Math.abs(pose.x) > CALIB_MAX_ANGLE || Math.abs(pose.y) > CALIB_MAX_ANGLE) return false;
    if (!this.lastPose || this.lastT === null || t <= this.lastT) return true;
    const dt = t - this.lastT;
    const speed = Math.max(Math.abs(pose.x - this.lastPose.x), Math.abs(pose.y - this.lastPose.y), Math.abs(pose.z - this.lastPose.z)) / dt;
    return speed < CALIB_MAX_SPEED;
  }

  private trackPose(pose: HeadPose | null, t: number) {
    if (pose) this.lastPose = pose;
    this.lastT = t;
  }

  /**
   * Model side convention, detected from data: when the user looks sideways,
   * the landmark-measured gaze and the model's eyeLook* labels must agree.
   * Default is anatomical (ARKit) labels; flips only on consistent evidence.
   */
  private updateSideConvention(m: FaceMetrics, rest: FaceMetrics, raw: Record<string, number>) {
    const meas = measuredGazeTowardLeft(m, rest);
    const model = modelGazeTowardLeft(raw);
    if (Math.abs(meas) < 0.04 || Math.abs(model) < 0.25) return;
    this.sideEvidence = Math.max(-40, Math.min(40, this.sideEvidence + (meas * model > 0 ? 1 : -1)));
    if (!this.swapLR && this.sideEvidence <= -8) this.swapLR = true;
    else if (this.swapLR && this.sideEvidence >= 8) this.swapLR = false;
  }

  private filterPose(p: HeadPose, t: number): HeadPose {
    const prev = this.prevEuler;
    const e: [number, number, number] = [
      unwrapAngle(p.x, prev?.[0]),
      unwrapAngle(p.y, prev?.[1]),
      unwrapAngle(p.z, prev?.[2]),
    ];
    this.prevEuler = e;
    return {
      ...p,
      x: this.rotFilters[0].filter(e[0], t),
      y: this.rotFilters[1].filter(e[1], t),
      z: this.rotFilters[2].filter(e[2], t),
      tx: this.posFilters[0].filter(p.tx, t),
      ty: this.posFilters[1].filter(p.ty, t),
      tz: this.posFilters[2].filter(p.tz, t),
    };
  }
}
