/**
 * Fit check of a part (hair, beard, glasses, hat) on a HEADZ base — pure geometry,
 * shared by the offline compatibility pass (scripts/headz-fit.mjs → compat.gen.ts)
 * and its test. Works on head-space positions AFTER the runtime placement
 * (placePart in deform.ts: cross-base re-seat + hair lift), so it measures exactly
 * what the renderer shows.
 *
 * Small orthographic depth rasters of the skin and of the part, from a few views:
 *  - eye   share of the visible eye opening hidden behind the part (front and
 *          ±25° views, the worse one) — a bob on an elder man's face, a brim
 *          sunk over the eyes;
 *  - brow  share of the visible eyebrows buried under the part (a fringe may touch them);
 *  - face  share of the central face (nose → mouth) covered by the part;
 *  - poke  where the part lies on the head (within a thin layer), the share of it
 *          the skin pokes through — scalp through hair, a head through a hat;
 *  - lens  (glasses) offset of each lens centre from its eye, in eye radii.
 */
import type { HeadzEye } from "./types";

export type FitSlot = "hair" | "beard" | "eyewear" | "headwear" | "earrings" | "mask";

export interface FitMesh {
  pos: Float32Array;
  index: ArrayLike<number> | null;
}

export interface FitFace {
  skin: FitMesh[];
  /** eyebrow meshes (a fringe may touch the brows, not bury them) */
  brows: FitMesh[];
  eyes: HeadzEye[];
  /** mouth centre (head space) and chin height, for the face region */
  mouth: [number, number, number];
  chinY: number;
}

export interface FitMetrics {
  eye: number;
  brow: number;
  face: number;
  poke: number;
  lens: number;
}

/**
 * Limits per slot. Parts are compared with how they sit on the base they were made
 * for (`ref`): a part may not hide the eyes (absolute, or no more than on its own base),
 * nor let the skin poke through / sit off the eyes noticeably more than on its own base.
 */
export const FIT_LIMITS: Record<FitSlot, { eye: number; brow: number; face: number; poke: number; lens: number }> = {
  hair: { eye: 0.035, brow: 0.3, face: 0.03, poke: 0.06, lens: Infinity },
  beard: { eye: 0.01, brow: 0.05, face: 0.08, poke: 0.08, lens: Infinity },
  eyewear: { eye: Infinity, brow: Infinity, face: 0.08, poke: 0.08, lens: 0.3 },
  headwear: { eye: 0.035, brow: 0.3, face: 0.03, poke: 0.06, lens: Infinity },
  earrings: { eye: Infinity, brow: Infinity, face: Infinity, poke: Infinity, lens: Infinity },
  mask: { eye: Infinity, brow: Infinity, face: Infinity, poke: Infinity, lens: Infinity },
};

const ZERO: FitMetrics = { eye: 0, brow: 0, face: 0, poke: 0, lens: 0 };

/** eye / face: absolute limit (or the authored amount, whichever is larger); poke / lens: worsening over the authored fit. */
function limitsOf(slot: FitSlot, ref: FitMetrics = ZERO) {
  const L = FIT_LIMITS[slot];
  return { eye: Math.max(L.eye, ref.eye + 0.01), brow: Math.max(L.brow, ref.brow + 0.1), face: Math.max(L.face, ref.face + 0.01), poke: ref.poke + L.poke, lens: ref.lens + L.lens };
}

export function fitOk(slot: FitSlot, m: FitMetrics, ref?: FitMetrics): boolean {
  return fitWhy(slot, m, ref).length === 0;
}

/** Which limits a metric set breaks (for logs). */
export function fitWhy(slot: FitSlot, m: FitMetrics, ref?: FitMetrics): string[] {
  const L = limitsOf(slot, ref);
  return (["eye", "brow", "face", "poke", "lens"] as const).filter((k) => m[k] > L[k] + 1e-6).map((k) => `${k} ${m[k].toFixed(3)} > ${L[k].toFixed(3)}`);
}

// ── raster ──────────────────────────────────────────────────────────────────

const R = 128;
const X0 = -1.6, Y0 = -1.5, SPAN = 3.2;
const PX = R / SPAN;

type Rot = [number, number, number, number, number, number, number, number, number];

function yawRot(a: number): Rot {
  const c = Math.cos(a), s = Math.sin(a);
  // camera on +Z; turning the head by `a` about +Y
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
/** looking straight down (top view): screen y = −z, depth = y */
const TOP: Rot = [1, 0, 0, 0, 0, -1, 0, 1, 0];

function project(pos: Float32Array, m: Rot): Float32Array {
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    out[i] = ((m[0] * x + m[1] * y + m[2] * z - X0) * PX);
    out[i + 1] = ((m[3] * x + m[4] * y + m[5] * z - Y0) * PX);
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z;
  }
  return out;
}

const skinCache = new WeakMap<FitMesh[], Map<string, Float32Array>>();
/** Depth raster of the (fixed) skin of a base per view, computed once. */
function skinDepth(skin: FitMesh[], m: Rot): Float32Array {
  let c = skinCache.get(skin);
  if (!c) skinCache.set(skin, (c = new Map()));
  const key = m.map((x) => x.toFixed(4)).join(",");
  let d = c.get(key);
  if (!d) c.set(key, (d = depthOf(skin, m)));
  return d;
}

/** Max depth (nearest to the camera) per pixel of a set of meshes seen through `m`. */
function depthOf(meshes: FitMesh[], m: Rot): Float32Array {
  const d = new Float32Array(R * R).fill(-Infinity);
  for (const mesh of meshes) {
    const p = project(mesh.pos, m);
    const n = mesh.index ? mesh.index.length : p.length / 3;
    for (let t = 0; t + 2 < n; t += 3) {
      const a = (mesh.index ? mesh.index[t] : t) * 3;
      const b = (mesh.index ? mesh.index[t + 1] : t + 1) * 3;
      const c = (mesh.index ? mesh.index[t + 2] : t + 2) * 3;
      tri(d, p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]);
    }
  }
  return d;
}

function tri(d: Float32Array, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(R - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(R - 1, Math.ceil(Math.max(ay, by, cy)));
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const z = w0 * az + w1 * bz + w2 * cz;
      const k = y * R + x;
      if (z > d[k]) d[k] = z;
    }
}

// ── metrics ─────────────────────────────────────────────────────────────────

/** Share of the visible eye openings hidden by the part, worst of the front and ±25° views. */
function eyeCover(face: FitFace, part: PartDepth): number {
  let worst = 0;
  for (const a of [0, 0.45, -0.45]) {
    const m = yawRot(a);
    const skin = skinDepth(face.skin, m);
    const pd = part(m);
    let vis = 0, hid = 0;
    for (const e of face.eyes) {
      const c = project(new Float32Array(e.c), m);
      const rp = e.r * PX;
      for (let y = Math.floor(c[1] - rp); y <= Math.ceil(c[1] + rp); y++)
        for (let x = Math.floor(c[0] - rp); x <= Math.ceil(c[0] + rp); x++) {
          if (x < 0 || y < 0 || x >= R || y >= R) continue;
          const dx = (x + 0.5 - c[0]) / PX, dy = (y + 0.5 - c[1]) / PX;
          const h2 = e.r * e.r - dx * dx - dy * dy;
          if (h2 <= 0) continue;
          const ez = c[2] + Math.sqrt(h2);
          const k = y * R + x;
          if (ez <= skin[k] + 0.004) continue; // under the lids / behind the nose
          vis++;
          if (pd[k] > ez) hid++;
        }
    }
    if (vis > 20) worst = Math.max(worst, hid / vis);
  }
  return worst;
}

/** Share of the visible eyebrows (front view) hidden by the part. */
function browCover(face: FitFace, part: PartDepth): number {
  if (!face.brows.length) return 0;
  const m = yawRot(0);
  const skin = skinDepth(face.skin, m);
  const brows = skinDepth(face.brows, m);
  const pd = part(m);
  let vis = 0, hid = 0;
  for (let k = 0; k < R * R; k++) {
    if (!Number.isFinite(brows[k]) || brows[k] < skin[k] - 0.004) continue;
    vis++;
    if (pd[k] > brows[k]) hid++;
  }
  return vis > 10 ? hid / vis : 0;
}

/** Share of the central face (between the eyes' inner halves, below them down to the mouth) the part covers. */
function faceCover(face: FitFace, part: PartDepth): number {
  const m = yawRot(0);
  const skin = skinDepth(face.skin, m);
  const pd = part(m);
  const eyeY = face.eyes.reduce((s, e) => s + e.c[1], 0) / Math.max(1, face.eyes.length);
  const eyeR = face.eyes[0]?.r ?? 0.18;
  const halfX = Math.min(...face.eyes.map((e) => Math.abs(e.c[0]))) * 0.9;
  const top = eyeY - eyeR * 0.9, bottom = face.mouth[1] - 0.05;
  let all = 0, hid = 0;
  for (let y = 0; y < R; y++) {
    const hy = (y + 0.5) / PX + Y0;
    if (hy > top || hy < bottom) continue;
    for (let x = 0; x < R; x++) {
      const hx = (x + 0.5) / PX + X0;
      if (Math.abs(hx) > halfX) continue;
      const k = y * R + x;
      if (!Number.isFinite(skin[k])) continue;
      all++;
      if (pd[k] > skin[k] + 0.004) hid++;
    }
  }
  return all ? hid / all : 0;
}

/**
 * Where the part lies ON the head (its surface within `band` of the skin), the share of it
 * the skin pokes through — front, sides, back and top views together.
 */
function pokeThrough(face: FitFace, part: PartDepth, band = 0.08): number {
  let near = 0, poke = 0;
  for (const m of [yawRot(0), yawRot(Math.PI / 2), yawRot(-Math.PI / 2), yawRot(Math.PI), TOP]) {
    const skin = skinDepth(face.skin, m);
    const pd = part(m);
    for (let k = 0; k < R * R; k++) {
      if (!Number.isFinite(pd[k]) || !Number.isFinite(skin[k])) continue;
      const d = pd[k] - skin[k];
      if (d < -band || d > band) continue;
      near++;
      if (d < -0.004) poke++;
    }
  }
  return near > 30 ? poke / near : 0;
}

/** Glasses: mean offset of each lens (front frame, per side) from its eye centre, in eye radii. */
function lensOffset(face: FitFace, part: FitMesh[]): number {
  let worst = 0;
  for (const e of face.eyes) {
    const side = Math.sign(e.c[0]);
    let n = 0, sx = 0, sy = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const mesh of part)
      for (let i = 0; i < mesh.pos.length; i += 3) {
        const x = mesh.pos[i], y = mesh.pos[i + 1], z = mesh.pos[i + 2];
        // the front of the frame around this eye (not the temples, not the bridge)
        if (x * side < Math.abs(e.c[0]) * 0.35 || z < e.c[2] - e.r * 0.2) continue;
        if (Math.abs(y - e.c[1]) > e.r * 2.2 || Math.abs(x - e.c[0]) > e.r * 2.4) continue;
        n++;
        sx += x;
        sy += y;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    if (!n) return Infinity;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    worst = Math.max(worst, Math.hypot(cx - e.c[0], cy - e.c[1]) / e.r);
  }
  return worst;
}

type PartDepth = (m: Rot) => Float32Array;

export function measureFit(slot: FitSlot, face: FitFace, meshes: FitMesh[]): FitMetrics {
  const L = FIT_LIMITS[slot];
  const views = new Map<string, Float32Array>();
  const part: PartDepth = (m) => {
    const key = m.map((x) => x.toFixed(4)).join(",");
    let d = views.get(key);
    if (!d) views.set(key, (d = depthOf(meshes, m)));
    return d;
  };
  return {
    eye: Number.isFinite(L.eye) ? eyeCover(face, part) : 0,
    brow: Number.isFinite(L.brow) ? browCover(face, part) : 0,
    face: Number.isFinite(L.face) ? faceCover(face, part) : 0,
    poke: Number.isFinite(L.poke) ? pokeThrough(face, part) : 0,
    lens: Number.isFinite(L.lens) ? lensOffset(face, meshes) : 0,
  };
}
