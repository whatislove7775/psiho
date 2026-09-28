export type V3 = [number, number, number] | number[];
export type Q = [number, number, number, number] | number[];

export declare const LM: { wrist: 0; thumb: 1; index: 5; middle: 9; ring: 13; pinky: 17 };
export declare const FINGERS: string[];
export declare const BONES: { name: string; parent: number; from: number; to: number }[];

export declare function sub(a: V3, b: V3): number[];
export declare function add(a: V3, b: V3): number[];
export declare function scale(a: V3, s: number): number[];
export declare function dot(a: V3, b: V3): number;
export declare function cross(a: V3, b: V3): number[];
export declare function len(a: V3): number;
export declare function norm(a: V3): number[];
export declare function angle(a: V3, b: V3): number;
export declare function qmul(a: Q, b: Q): number[];
export declare function qinv(q: Q): number[];
export declare function qrot(q: Q, v: V3): number[];
export declare function qFromTo(a: V3, b: V3): number[];
export declare function qFromBasis(x: V3, y: V3, z: V3): number[];
export declare function qslerp(a: Q, b: Q, t: number): number[];
export declare function palmBasis(p0: V3, p5: V3, p17: V3, p9: V3): number[][];

export declare function toAvatarPoints(world: ArrayLike<number>, mirror?: boolean): number[][];
export declare function sideFor(label: string, mirror?: boolean): "L" | "R";

export interface HandJoint {
  name: string;
  pos: number[];
  quat: number[];
  localQuat: number[];
  tip: number[];
}
export interface HandRest {
  joints: HandJoint[];
  axis: number[][];
  basis: number[][];
  basisQ: number[];
  length: number;
}
export declare function buildRest(joints: HandJoint[]): HandRest;
export declare function restFromLocal(nodes: Record<string, { t: ArrayLike<number>; r: ArrayLike<number> }>): HandRest;
export declare function solveHand(rest: HandRest, pts: number[][]): number[][];
export declare function boneAxes(rest: HandRest, local: number[][]): number[][];

export declare const PLACE: {
  faceUnits: number;
  faceY: number;
  depthGain: number;
  zMin: number;
  zMax: number;
  faceMetres: number;
};
export interface FaceRef {
  cx: number;
  cy: number;
  h: number;
}
export declare function placeHand(
  img: ArrayLike<number>,
  world: ArrayLike<number>,
  face: FaceRef,
  aspect: number,
  mirror?: boolean,
  camDist?: number,
): { pos: number[]; ratio: number };
export declare function faceRef(lm: { x: number; y: number }[], aspect: number): FaceRef | null;
