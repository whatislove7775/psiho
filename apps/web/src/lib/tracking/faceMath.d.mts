// Type declarations for faceMath.mjs (kept as plain JS so node --test can run it).

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export declare const LM: Readonly<{
  R_EYE_OUTER: number;
  R_EYE_INNER: number;
  L_EYE_OUTER: number;
  L_EYE_INNER: number;
  R_LID_PAIRS: readonly (readonly [number, number])[];
  L_LID_PAIRS: readonly (readonly [number, number])[];
  R_IRIS: number;
  L_IRIS: number;
  R_BROW_INNER: number;
  R_BROW_MID: number;
  R_BROW_OUTER: number;
  L_BROW_INNER: number;
  L_BROW_MID: number;
  L_BROW_OUTER: number;
  MOUTH_R: number;
  MOUTH_L: number;
  LIP_INNER_UP: number;
  LIP_INNER_LOW: number;
  FOREHEAD: number;
  CHIN: number;
}>;

export declare function clamp01(v: number): number;

export declare class OneEuroFilter {
  constructor(minCutoff?: number, beta?: number, dCutoff?: number);
  minCutoff: number;
  beta: number;
  dCutoff: number;
  reset(): void;
  /** @param t timestamp in seconds */
  filter(x: number, t: number): number;
}

export declare function unwrapAngle(a: number, prev: number | null | undefined): number;
export declare function median(values: number[]): number;
export declare function remapFromRest(w: number, rest: number, deadZone?: number, maxRest?: number): number;
export declare function deadZone(v: number, dz: number): number;

export declare class NeutralCalibrator {
  constructor(opts?: { duration?: number; minSamples?: number; giveUpAfter?: number });
  readonly done: boolean;
  rest: Record<string, number> | null;
  count: number;
  reset(): void;
  progress(t: number): number;
  add(values: Record<string, number>, t: number, stable: boolean): boolean;
}

export interface FaceMetrics {
  span: number;
  earR: number;
  earL: number;
  lipGap: number;
  mouthLatR: number;
  mouthLatL: number;
  mouthVertR: number;
  mouthVertL: number;
  browInR: number;
  browInL: number;
  browMidR: number;
  browMidL: number;
  browOutR: number;
  browOutL: number;
  irisHR: number;
  irisHL: number;
  irisVR: number;
  irisVL: number;
}

export declare function measureFace(lm: ArrayLike<Landmark>, aspect?: number): FaceMetrics;
export declare const RANGES: Readonly<Record<string, number>>;
export declare function landmarkWeights(m: FaceMetrics, rest: FaceMetrics): Record<string, number>;
export declare function modelGazeTowardLeft(w: Record<string, number>): number;
export declare function measuredGazeTowardLeft(m: FaceMetrics, rest: FaceMetrics): number;
export declare function swapSide(name: string): string;
export declare const LANDMARK_BLEND: Readonly<Record<string, number>>;
export declare function landmarkShare(name: string): number;

export interface HeadPose {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
}
export declare function matrixToPose(m: ArrayLike<number>): HeadPose;
export declare function poseToMatrix(p: HeadPose): number[];
