/**
 * Head shape model.
 *
 * Everything on the face is placed relative to a *unit-sphere direction* d
 * (x right, y up, z towards the camera). restPoint(d) maps that direction to
 * the sculpted head surface (ellipsoid + jaw taper + nose/cheek/brow bumps).
 * morphDisplacement(d, p, weights) returns how the skin moves under the
 * ARKit expressions we model as morph targets — lips, beard and the head
 * mesh all use the same function, so they stay glued together.
 */
import * as THREE from "three";
import type { AvatarConfig, ChinShape, NoseShape } from "../schema";
import { gauss, smooth } from "./math";

export interface NoseParams {
  y: number; // tip centre (unit-sphere y)
  h: number; // tip protrusion
  rx: number;
  ry: number;
  bridge: number; // bridge ridge height
  bridgeW: number;
  wing: number; // nostril wing bump
  wingX: number;
  hook: number; // bump on the bridge
}

export interface HeadParams {
  sx: number;
  sy: number;
  sz: number;
  taper: number;
  chin: ChinShape;
  cheeks: number;
  nose: NoseParams;
  /** mature/senior faces get slightly softer, lower cheeks */
  sag: number;
}

const SHAPES: Record<AvatarConfig["head"]["shape"], [number, number, number, number]> = {
  //          sx    sy    sz    taper
  round: [1.0, 1.0, 0.97, 0.14],
  oval: [0.94, 1.06, 0.96, 0.24],
  square: [1.0, 1.0, 0.96, 0.06],
  heart: [0.99, 1.04, 0.96, 0.34],
  long: [0.9, 1.12, 0.95, 0.22],
  wide: [1.08, 0.97, 0.97, 0.12],
};

const NOSES: Record<NoseShape, Omit<NoseParams, "y"> & { y: number }> = {
  button: { y: -0.2, h: 0.1, rx: 0.085, ry: 0.07, bridge: 0.018, bridgeW: 0.05, wing: 0.035, wingX: 0.075, hook: 0 },
  straight: { y: -0.21, h: 0.105, rx: 0.075, ry: 0.07, bridge: 0.05, bridgeW: 0.045, wing: 0.03, wingX: 0.075, hook: 0 },
  wide: { y: -0.21, h: 0.095, rx: 0.1, ry: 0.07, bridge: 0.03, bridgeW: 0.06, wing: 0.05, wingX: 0.1, hook: 0 },
  pointed: { y: -0.2, h: 0.13, rx: 0.06, ry: 0.065, bridge: 0.05, bridgeW: 0.04, wing: 0.025, wingX: 0.065, hook: 0 },
  round: { y: -0.21, h: 0.12, rx: 0.1, ry: 0.085, bridge: 0.025, bridgeW: 0.05, wing: 0.035, wingX: 0.085, hook: 0 },
  long: { y: -0.24, h: 0.11, rx: 0.075, ry: 0.09, bridge: 0.055, bridgeW: 0.045, wing: 0.03, wingX: 0.075, hook: 0 },
  hooked: { y: -0.24, h: 0.1, rx: 0.075, ry: 0.075, bridge: 0.05, bridgeW: 0.045, wing: 0.03, wingX: 0.075, hook: 0.035 },
};

export function headParams(cfg: AvatarConfig): HeadParams {
  const [sx, sy, sz, taper] = SHAPES[cfg.head.shape];
  const n = NOSES[cfg.nose.shape];
  const k = 0.72 + cfg.nose.size * 0.56;
  return {
    sx,
    sy,
    sz,
    taper: cfg.head.chin === "pointed" ? taper + 0.06 : cfg.head.chin === "square" ? taper * 0.5 : taper,
    chin: cfg.head.chin,
    cheeks: cfg.head.cheeks,
    sag: cfg.skin.age === "senior" ? 1 : cfg.skin.age === "mature" ? 0.5 : 0,
    nose: { ...n, h: n.h * k, rx: n.rx * (0.85 + cfg.nose.size * 0.3), ry: n.ry * k, bridge: n.bridge * k, wing: n.wing * k },
  };
}

// Feature anchors in unit-sphere space (before sculpting).
export const EYE_X = 0.335;
export const EYE_Y = 0.02;
export const MOUTH_Y = -0.475;
export const BROW_Y = 0.25;

/** Radial feature relief (nose, cheeks, muzzle, brow ridge, sockets, chin). */
function relief(P: HeadParams, x: number, y: number, z: number): number {
  const front = smooth(0.15, 0.6, z);
  if (front <= 0) return 0;
  const ax = Math.abs(x);
  const n = P.nose;
  let h = 0;

  // Nose: tip ball + bridge ridge + nostril wings + optional hook
  h += n.h * gauss(x, y, 0, n.y, n.rx, n.ry);
  const bridgeT = smooth(0.12, n.y, y) * smooth(n.y - 0.05, n.y + 0.04, y);
  h += n.bridge * bridgeT * Math.exp(-((x / n.bridgeW) ** 2)) * (y > n.y ? 1 : 0.4);
  h += n.hook * gauss(x, y, 0, n.y + 0.13, 0.05, 0.06);
  h += n.wing * gauss(ax, y, n.wingX, n.y - 0.035, 0.045, 0.04);
  h -= 0.018 * gauss(ax, y, n.wingX * 0.55, n.y - n.ry * 0.95, 0.025, 0.018); // nostrils

  // Muzzle — the gently protruding mouth area typical of the style
  h += 0.05 * gauss(x, y, 0, MOUTH_Y - 0.02, 0.36, 0.2);
  h -= 0.012 * gauss(x, y, 0, (n.y + MOUTH_Y) / 2 - 0.01, 0.04, 0.05); // philtrum

  // Cheeks (fullness) and age sag
  const cy = -0.26 - P.sag * 0.06;
  h += (0.018 + 0.055 * P.cheeks) * gauss(ax, y, 0.47, cy, 0.22, 0.2);
  // Brow ridge and eye sockets
  h += 0.022 * gauss(ax, y, EYE_X, BROW_Y - 0.02, 0.24, 0.07);
  h -= 0.06 * gauss(ax, y, EYE_X, EYE_Y, 0.15, 0.12);

  // Chin
  if (P.chin === "pointed") h += 0.045 * gauss(x, y, 0, -0.84, 0.12, 0.12);
  else if (P.chin === "square") h += 0.03 * gauss(x, y, 0, -0.84, 0.3, 0.1);
  else h += 0.03 * gauss(x, y, 0, -0.84, 0.2, 0.12);
  if (P.chin === "cleft") h -= 0.02 * gauss(x, y, 0, -0.84, 0.025, 0.07);

  return h * front;
}

/** Map a unit direction to the rest (neutral) head surface. out = [x, y, z]. */
export function restPoint(P: HeadParams, x: number, y: number, z: number, out: number[]): number[] {
  let X = x * P.sx;
  let Y = y * P.sy;
  let Z = z * P.sz;

  // Memoji faces are flatter in front, fuller at the back of the skull.
  const faceBand = smooth(0.4, 0.95, z) * smooth(-0.95, -0.3, y) * (1 - smooth(0.45, 0.9, y));
  Z -= 0.075 * faceBand;

  // Jaw taper towards the chin
  if (y < 0) {
    const t = Math.pow(smooth(0.05, -1, y), 1.35);
    X *= 1 - P.taper * t;
    if (z > 0) Z *= 1 - P.taper * 0.25 * t;
    if (P.chin === "square") {
      const b = smooth(-0.7, -1, y);
      Y = Y * (1 - 0.06 * b);
    } else if (P.chin === "pointed") {
      X *= 1 - 0.12 * smooth(-0.6, -1, y);
    }
  }
  // Slightly narrower temples, broader cheekbones
  X *= 1 + 0.035 * gauss(0, y, 0, -0.15, 1, 0.35) - 0.03 * smooth(0.5, 0.95, y);

  const h = relief(P, x, y, z);
  out[0] = X + x * h;
  out[1] = Y + y * h;
  out[2] = Z + z * h;
  return out;
}

const _a = [0, 0, 0];
const _b = [0, 0, 0];
const _c = [0, 0, 0];

/** Unit direction from 2D face coords (x, y on the unit sphere's front). */
export function dirFrom2D(x: number, y: number, out: number[]): number[] {
  const zz = 1 - x * x - y * y;
  const z = Math.sqrt(Math.max(0.02, zz));
  const l = Math.hypot(x, y, z);
  out[0] = x / l;
  out[1] = y / l;
  out[2] = z / l;
  return out;
}

/** Surface point + outward normal at direction d (finite differences). */
export function surfaceFrame(P: HeadParams, d: number[]) {
  const p = restPoint(P, d[0], d[1], d[2], [0, 0, 0]);
  const e = 0.004;
  // tangent-ish offsets
  const tx = [d[0] + e, d[1], d[2]];
  const ty = [d[0], d[1] + e, d[2]];
  const nx = Math.hypot(tx[0], tx[1], tx[2]);
  const ny = Math.hypot(ty[0], ty[1], ty[2]);
  restPoint(P, tx[0] / nx, tx[1] / nx, tx[2] / nx, _a);
  restPoint(P, ty[0] / ny, ty[1] / ny, ty[2] / ny, _b);
  const ux = _a[0] - p[0], uy = _a[1] - p[1], uz = _a[2] - p[2];
  const vx = _b[0] - p[0], vy = _b[1] - p[1], vz = _b[2] - p[2];
  let n0 = uy * vz - uz * vy;
  let n1 = uz * vx - ux * vz;
  let n2 = ux * vy - uy * vx;
  // make it point outward
  if (n0 * d[0] + n1 * d[1] + n2 * d[2] < 0) {
    n0 = -n0;
    n1 = -n1;
    n2 = -n2;
  }
  const nl = Math.hypot(n0, n1, n2) || 1;
  return { p, n: [n0 / nl, n1 / nl, n2 / nl] };
}

// ── Expression morphs ────────────────────────────────────────────────────────

/** Morph targets baked into the head (and beard) geometry, in this order. */
export const HEAD_MORPHS = [
  "jawOpen",
  "mouthSmileLeft",
  "mouthSmileRight",
  "cheekPuff",
  "mouthPucker",
  "mouthLeft",
  "mouthRight",
  "noseSneer",
] as const;
export type HeadMorph = (typeof HEAD_MORPHS)[number];

const JAW_PIVOT = [0, -0.1, -0.8];
const JAW_ANGLE = 0.22;

/** Weight of the jaw for a skin point (0 = upper face, 1 = moves with the chin). */
export function jawWeight(x: number, y: number, z: number): number {
  return smooth(MOUTH_Y + 0.035, MOUTH_Y - 0.08, y) * smooth(-0.45, 0.2, z);
}

/** Rotate point p around the jaw pivot by angle a (radians) — writes into out. */
export function jawRotate(p: number[], a: number, out: number[]): number[] {
  const c = Math.cos(a), s = Math.sin(a);
  const ry = p[1] - JAW_PIVOT[1];
  const rz = p[2] - JAW_PIVOT[2];
  out[0] = p[0];
  out[1] = JAW_PIVOT[1] + ry * c - rz * s;
  out[2] = JAW_PIVOT[2] + ry * s + rz * c;
  return out;
}

/**
 * Displacement of a skin point (unit dir d, rest position p) for ONE morph at
 * full weight. Side-specific morphs use the avatar's own left (= +x as seen by
 * the viewer, the renderer mirrors tracking so this matches a selfie).
 */
export function morphDisplacement(m: HeadMorph, d: number[], p: number[], out: number[]): number[] {
  const [x, y, z] = d;
  out[0] = out[1] = out[2] = 0;
  const front = smooth(0.1, 0.55, z);
  switch (m) {
    case "jawOpen": {
      const w = jawWeight(x, y, z);
      if (w > 0) {
        jawRotate(p, JAW_ANGLE * w, _c);
        out[0] = _c[0] - p[0];
        out[1] = _c[1] - p[1];
        out[2] = _c[2] - p[2];
      }
      break;
    }
    case "mouthSmileLeft":
    case "mouthSmileRight": {
      const side = m === "mouthSmileLeft" ? 1 : -1;
      const w1 = gauss(x, y, side * 0.3, MOUTH_Y + 0.02, 0.16, 0.12) * front;
      const w2 = gauss(x, y, side * 0.42, -0.24, 0.16, 0.14) * front;
      out[0] = side * 0.03 * w1;
      out[1] = 0.06 * w1 + 0.035 * w2;
      out[2] = -0.01 * w1 + 0.02 * w2;
      break;
    }
    case "cheekPuff": {
      const w = (gauss(x, y, 0.42, -0.36, 0.2, 0.2) + gauss(x, y, -0.42, -0.36, 0.2, 0.2)) * front;
      out[0] = Math.sign(x) * 0.06 * w;
      out[2] = 0.05 * w;
      break;
    }
    case "mouthPucker": {
      const w = gauss(x, y, 0, MOUTH_Y, 0.22, 0.13) * front;
      out[2] = 0.07 * w;
      out[0] = -x * 0.25 * w;
      break;
    }
    case "mouthLeft":
    case "mouthRight": {
      const side = m === "mouthLeft" ? 1 : -1;
      const w = gauss(x, y, 0, MOUTH_Y - 0.03, 0.3, 0.2) * front;
      out[0] = side * 0.07 * w;
      break;
    }
    case "noseSneer": {
      const w = gauss(x, y, 0, -0.14, 0.14, 0.12) * front;
      out[1] = 0.025 * w;
      out[2] = 0.01 * w;
      break;
    }
  }
  return out;
}

export type MorphWeights = Partial<Record<HeadMorph, number>>;

/** Sum of all morph displacements at the given weights (for lips/cavity/teeth). */
export function totalDisplacement(
  d: number[],
  p: number[],
  w: MorphWeights,
  out: number[],
  jawOverride?: number,
): number[] {
  out[0] = out[1] = out[2] = 0;
  const tmp = [0, 0, 0];
  for (const m of HEAD_MORPHS) {
    let k = w[m] ?? 0;
    if (m === "jawOpen") {
      if (jawOverride !== undefined) {
        // explicit jaw weight (lower lip = 1, upper lip = 0)
        if (k > 0 && jawOverride > 0) {
          jawRotate(p, JAW_ANGLE * k * jawOverride, _c);
          out[0] += _c[0] - p[0];
          out[1] += _c[1] - p[1];
          out[2] += _c[2] - p[2];
        }
        continue;
      }
    }
    if (k <= 0.001) continue;
    if (m === "jawOpen") {
      // jaw is a rotation — scale the angle, not the vector
      const jw = jawWeight(d[0], d[1], d[2]);
      if (jw > 0) {
        jawRotate(p, JAW_ANGLE * k * jw, _c);
        out[0] += _c[0] - p[0];
        out[1] += _c[1] - p[1];
        out[2] += _c[2] - p[2];
      }
      continue;
    }
    morphDisplacement(m, d, p, tmp);
    out[0] += tmp[0] * k;
    out[1] += tmp[1] * k;
    out[2] += tmp[2] * k;
  }
  return out;
}

// ── Head mesh ────────────────────────────────────────────────────────────────

/**
 * Sculpted head as a UV sphere (UVs are used by the skin-detail texture)
 * with HEAD_MORPHS baked as morph targets (positions + normals).
 */
export function buildHeadGeometry(P: HeadParams, widthSeg = 200, heightSeg = 150): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, widthSeg, heightSeg);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;
  const dirs = new Float32Array(count * 3);
  const p = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    dirs[i * 3] = x / l;
    dirs[i * 3 + 1] = y / l;
    dirs[i * 3 + 2] = z / l;
    restPoint(P, x / l, y / l, z / l, p);
    pos.setXYZ(i, p[0], p[1], p[2]);
  }
  geo.computeVertexNormals();
  const baseNormals = (geo.attributes.normal as THREE.BufferAttribute).array.slice() as Float32Array;
  const basePos = pos.array.slice() as Float32Array;

  const morphPos: THREE.BufferAttribute[] = [];
  const morphNor: THREE.BufferAttribute[] = [];
  const tmpGeo = new THREE.BufferGeometry();
  tmpGeo.setIndex(geo.getIndex());
  const d = [0, 0, 0];
  const disp = [0, 0, 0];

  for (const m of HEAD_MORPHS) {
    const delta = new Float32Array(count * 3);
    const moved = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      d[0] = dirs[i * 3];
      d[1] = dirs[i * 3 + 1];
      d[2] = dirs[i * 3 + 2];
      p[0] = basePos[i * 3];
      p[1] = basePos[i * 3 + 1];
      p[2] = basePos[i * 3 + 2];
      morphDisplacement(m, d, p, disp);
      delta[i * 3] = disp[0];
      delta[i * 3 + 1] = disp[1];
      delta[i * 3 + 2] = disp[2];
      moved[i * 3] = p[0] + disp[0];
      moved[i * 3 + 1] = p[1] + disp[1];
      moved[i * 3 + 2] = p[2] + disp[2];
    }
    tmpGeo.setAttribute("position", new THREE.BufferAttribute(moved, 3));
    tmpGeo.computeVertexNormals();
    const mn = (tmpGeo.attributes.normal as THREE.BufferAttribute).array as Float32Array;
    const ndelta = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) ndelta[i] = mn[i] - baseNormals[i];
    const pa = new THREE.BufferAttribute(delta, 3);
    pa.name = m;
    morphPos.push(pa);
    morphNor.push(new THREE.BufferAttribute(ndelta, 3));
  }
  tmpGeo.dispose();
  geo.morphAttributes.position = morphPos;
  geo.morphAttributes.normal = morphNor;
  geo.morphTargetsRelative = true;
  geo.userData.dirs = dirs;
  return geo;
}

/** Convert a unit direction to the head texture's UV (matches SphereGeometry). */
export function dirToUV(x: number, y: number, z: number): [number, number] {
  let phi = Math.atan2(z, -x);
  if (phi < 0) phi += Math.PI * 2;
  const theta = Math.acos(Math.max(-1, Math.min(1, y)));
  return [phi / (Math.PI * 2), theta / Math.PI];
}
