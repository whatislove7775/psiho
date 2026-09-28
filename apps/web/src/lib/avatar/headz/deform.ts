/**
 * Geometry helpers for the HEADZ runtime, all in normalised head space
 * (+Y up, +Z front, chin ≈ −1, crown ≈ +1). Pure functions on flat xyz arrays.
 *
 *  - fitRadial: moves a part made for one base onto another base's head, keeping
 *    each vertex's height above the skin (spherical radius maps from tools/headz).
 *  - deformFace: the face-shape sliders — smooth analytic displacement fields
 *    placed by the base's landmarks, applied to the face AND to every part so
 *    hair, beards and glasses stay on the reshaped head.
 *  - transferMorphs: gives beards / moustaches / masks the face's ARKit morphs
 *    (nearest skin vertices), so they open with the jaw instead of staying rigid.
 */
import type { HeadzEye, HeadzLandmarks } from "./types";

export const FACE_SHAPES = [
  "headWidth", "faceLength", "jaw", "chin", "cheeks", "noseSize", "noseWidth", "noseLength",
  "eyeSize", "eyeSpacing", "browHeight", "lips", "mouthWidth", "ears",
] as const;
export type FaceShape = (typeof FACE_SHAPES)[number];
export type ShapeValues = Partial<Record<FaceShape, number>>;

export interface FaceRig {
  eyes?: Partial<Record<"L" | "R", HeadzEye>>;
  lm?: HeadzLandmarks;
}

// ── radial fit ──────────────────────────────────────────────────────────────

export interface RadiusMap {
  el: number;
  az: number;
  data: Uint8Array;
}

export function radiusMap(bytes: ArrayBuffer, el = 32, az = 64): RadiusMap {
  return { el, az, data: new Uint8Array(bytes) };
}

/** Skin radius of the head in the direction of (x, y, z). */
export function radiusAt(m: RadiusMap, x: number, y: number, z: number): number {
  const r = Math.hypot(x, y, z) || 1e-6;
  const fe = (Math.asin(Math.max(-1, Math.min(1, y / r))) / Math.PI + 0.5) * m.el - 0.5;
  const fa = (Math.atan2(x, z) / (2 * Math.PI) + 0.5) * m.az - 0.5;
  const e0 = Math.max(0, Math.min(m.el - 1, Math.floor(fe)));
  const e1 = Math.min(m.el - 1, e0 + 1);
  const te = Math.max(0, Math.min(1, fe - e0));
  const a0 = ((Math.floor(fa) % m.az) + m.az) % m.az;
  const a1 = (a0 + 1) % m.az;
  const ta = fa - Math.floor(fa);
  const v = (e: number, a: number) => 0.2 + (m.data[e * m.az + a] / 255) * 1.4;
  return (v(e0, a0) * (1 - ta) + v(e0, a1) * ta) * (1 - te) + (v(e1, a0) * (1 - ta) + v(e1, a1) * ta) * te;
}

/**
 * In place: re-seat points made for the `src` head onto the `dst` head.
 * Returns each point's height above the source skin (for seatOnSkin).
 */
export function fitRadial(pos: Float32Array, src: RadiusMap, dst: RadiusMap): Float32Array {
  const h = new Float32Array(pos.length / 3);
  for (let i = 0, j = 0; i < pos.length; i += 3, j++) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const r = Math.hypot(x, y, z);
    if (r < 1e-4) continue;
    const rs = radiusAt(src, x, y, z);
    h[j] = r - rs;
    const k = (r + radiusAt(dst, x, y, z) - rs) / r;
    pos[i] = x * k;
    pos[i + 1] = y * k;
    pos[i + 2] = z * k;
  }
  return h;
}

/**
 * In place: the radius maps are coarse (≈0.1 head units per cell), so after a
 * cross-base fit the layer of a part that lay ON the source skin (beard roots,
 * hair caps, mask) can float or sink. Snap those points (source height < band)
 * to the real target skin along its normal: height kept, never less than `clearance`.
 */
export function seatOnSkin(pos: Float32Array, heights: Float32Array, skin: Float32Array, normals: Float32Array, clearance = 0.012, band = 0.09) {
  const cell = 0.06;
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < skin.length / 3; i++) {
    const k = key(skin[i * 3], skin[i * 3 + 1], skin[i * 3 + 2]);
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(i);
  }
  for (let p = 0; p < heights.length; p++) {
    const h0 = heights[p];
    if (h0 > band) continue;
    const x = pos[p * 3], y = pos[p * 3 + 1], z = pos[p * 3 + 2];
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell), gz = Math.floor(z / cell);
    let best = Infinity, bi = -1;
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -2; dz <= 2; dz++) {
          const a = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
          if (!a) continue;
          for (const i of a) {
            const d = (skin[i * 3] - x) ** 2 + (skin[i * 3 + 1] - y) ** 2 + (skin[i * 3 + 2] - z) ** 2;
            if (d < best) {
              best = d;
              bi = i;
            }
          }
        }
    if (bi < 0) continue;
    const nx = normals[bi * 3], ny = normals[bi * 3 + 1], nz = normals[bi * 3 + 2];
    const along = (x - skin[bi * 3]) * nx + (y - skin[bi * 3 + 1]) * ny + (z - skin[bi * 3 + 2]) * nz;
    const want = Math.max(clearance, h0);
    // blend out toward the top of the band so thick parts keep their shape
    const w = 1 - Math.max(0, (h0 - band * 0.6) / (band * 0.4));
    const d = (want - along) * w;
    pos[p * 3] += nx * d;
    pos[p * 3 + 1] += ny * d;
    pos[p * 3 + 2] += nz * d;
  }
}

// ── face shape ──────────────────────────────────────────────────────────────

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (d2: number, r: number) => Math.exp(-d2 / (r * r));

interface Frame {
  eyes: { c: [number, number, number]; r: number }[];
  eyeY: number;
  nose: [number, number, number];
  mouth: [number, number, number];
  mouthHalf: number;
  chin: [number, number, number];
  temple: number;
  ear: number;
}

export function frameOf(rig: FaceRig): Frame {
  const lm = rig.lm ?? {};
  const eyes = (["L", "R"] as const).map((k) => rig.eyes?.[k]).filter(Boolean) as HeadzEye[];
  const eyeList = eyes.length ? eyes.map((e) => ({ c: e.c, r: e.r })) : [{ c: [0.29, -0.09, 0.4] as [number, number, number], r: 0.18 }, { c: [-0.29, -0.09, 0.4] as [number, number, number], r: 0.18 }];
  const eyeY = eyeList.reduce((s, e) => s + e.c[1], 0) / eyeList.length;
  const ml = lm.mouthL ?? [0.26, -0.64, 0.57];
  const mr = lm.mouthR ?? [-0.26, -0.64, 0.57];
  return {
    eyes: eyeList,
    eyeY,
    nose: lm.nose ?? [0, -0.42, 0.89],
    mouth: [(ml[0] + mr[0]) / 2, (ml[1] + mr[1]) / 2, (ml[2] + mr[2]) / 2 + 0.06],
    mouthHalf: Math.abs(ml[0] - mr[0]) / 2 || 0.25,
    chin: lm.chin ?? [0, -1, 0.48],
    temple: lm.temple ?? 0.7,
    ear: lm.ear ?? 0.9,
  };
}

export function hasShape(s: ShapeValues | undefined): boolean {
  return !!s && FACE_SHAPES.some((k) => Math.abs(s[k] ?? 0) > 1e-3);
}

/**
 * In place: apply the face-shape sliders to head-space points.
 * `brows` marks the eyebrow mesh (moves as a whole with «brow height»).
 */
export function deformFace(pos: Float32Array, s: ShapeValues, f: Frame, opts: { brows?: boolean } = {}) {
  const v = (k: FaceShape) => Math.max(-1, Math.min(1, s[k] ?? 0));
  const S = {
    headWidth: v("headWidth"), faceLength: v("faceLength"), jaw: v("jaw"), chin: v("chin"), cheeks: v("cheeks"),
    noseSize: v("noseSize"), noseWidth: v("noseWidth"), noseLength: v("noseLength"), eyeSize: v("eyeSize"),
    eyeSpacing: v("eyeSpacing"), browHeight: v("browHeight"), lips: v("lips"), mouthWidth: v("mouthWidth"), ears: v("ears"),
  };
  const [nx, ny, nz] = f.nose;
  const nb = [nx, ny + 0.04, nz - 0.26];
  const [mx, my, mz] = f.mouth;
  const [cx, cy, cz] = f.chin;
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const front = smooth(-0.1, 0.25, z);
    // eyes (size, spacing) — the eyeball moves as a whole, the lids follow softly
    for (const e of f.eyes) {
      if (e.c[0] * x < 0) continue;
      const d = Math.hypot(x - e.c[0], y - e.c[1], z - e.c[2]);
      const w = smooth(e.r * 2.1, e.r * 1.05, d);
      if (w <= 0) continue;
      const k = 1 + 0.16 * S.eyeSize * w;
      x = e.c[0] + (x - e.c[0]) * k + Math.sign(e.c[0]) * 0.055 * S.eyeSpacing * w;
      y = e.c[1] + (y - e.c[1]) * k;
      z = e.c[2] + (z - e.c[2]) * k;
    }
    // brows
    if (S.browHeight) {
      const wb = opts.brows ? 1 : front * gauss((y - (f.eyeY + 0.3)) ** 2, 0.16) * smooth(0.05, 0.2, Math.abs(x)) * smooth(0.75, 0.45, Math.abs(x));
      y += 0.06 * S.browHeight * wb;
    }
    // nose
    if (S.noseSize || S.noseWidth || S.noseLength) {
      const wn = gauss((x - nx) ** 2 / 1.1 + (y - (ny + 0.06)) ** 2 + (z - (nz - 0.12)) ** 2 * 0.8, 0.2) * smooth(0.35, 0.6, z);
      if (wn > 1e-3) {
        const k = 1 + 0.25 * S.noseSize * wn;
        x = nb[0] + (x - nb[0]) * k * (1 + 0.32 * S.noseWidth * wn);
        y = nb[1] + (y - nb[1]) * k;
        z = nb[2] + (z - nb[2]) * k + 0.09 * S.noseLength * wn * smooth(nb[2], nz, z);
      }
    }
    // mouth width + lips
    if (S.mouthWidth || S.lips) {
      const wm = gauss(((x - mx) / (f.mouthHalf * 1.5)) ** 2 + ((y - my) / 0.22) ** 2 + ((z - mz) / 0.3) ** 2, 1) * front;
      x = mx + (x - mx) * (1 + 0.2 * S.mouthWidth * wm);
      const wl = gauss(((x - mx) / (f.mouthHalf * 1.1)) ** 2 + ((y - my) / 0.13) ** 2 + ((z - mz) / 0.2) ** 2, 1) * front;
      y = my + (y - my) * (1 + 0.38 * S.lips * wl);
      z += 0.035 * S.lips * wl;
    }
    // chin
    if (S.chin) {
      const wc = gauss((x - cx) ** 2 * 0.7 + (y - (cy + 0.14)) ** 2 + (z - (cz - 0.08)) ** 2, 0.3);
      y -= 0.1 * S.chin * wc;
      z += 0.06 * S.chin * wc;
    }
    // cheeks: push out sideways/forward
    if (S.cheeks) {
      for (const sx of [1, -1]) {
        const w = gauss((x - sx * 0.46) ** 2 + (y - (my + 0.2)) ** 2 + (z - 0.3) ** 2, 0.28) * (x * sx > 0 ? 1 : 0);
        if (w < 1e-3) continue;
        const h = Math.hypot(x, z) || 1;
        x += (x / h) * 0.075 * S.cheeks * w;
        z += (z / h) * 0.075 * S.cheeks * w;
      }
    }
    // ears
    if (S.ears) {
      const sx = Math.sign(x);
      const rootX = sx * f.temple * 0.93;
      const w = smooth(f.temple * 0.9, f.temple * 1.05, Math.abs(x)) * gauss((y - (f.eyeY - 0.12)) ** 2 + (z + 0.12) ** 2, 0.42);
      if (w > 1e-3) {
        const k = 1 + 0.3 * S.ears * w;
        x = rootX + (x - rootX) * k;
        y = f.eyeY - 0.12 + (y - (f.eyeY - 0.12)) * k;
        z = -0.12 + (z + 0.12) * k;
      }
    }
    // jaw width (below the cheekbones), face length (below the eyes), head width
    if (S.jaw) x *= 1 + 0.17 * S.jaw * smooth(f.eyeY - 0.15, my - 0.05, y) * smooth(-0.6, 0.1, z);
    if (S.faceLength && y < f.eyeY) y = f.eyeY + (y - f.eyeY) * (1 + 0.11 * S.faceLength);
    if (S.headWidth) x *= 1 + 0.1 * S.headWidth;
    pos[i] = x;
    pos[i + 1] = y;
    pos[i + 2] = z;
  }
}

/** Eye centre / radius after the shape sliders (for the eye shader). */
export function deformedEye(e: HeadzEye, s: ShapeValues, f: Frame): { c: [number, number, number]; r: number } {
  const p = new Float32Array(e.c);
  deformFace(p, s, f);
  return { c: [p[0], p[1], p[2]], r: e.r * (1 + 0.16 * Math.max(-1, Math.min(1, s.eyeSize ?? 0))) };
}

// ── morph transfer ──────────────────────────────────────────────────────────

export interface MorphSource {
  pos: Float32Array;
  /** name → head-space deltas (same length as pos) */
  deltas: Map<string, Float32Array>;
}

/**
 * For every part point, blend the deltas of the k nearest source points
 * (inverse-distance weights). Only keys that actually move the part are kept.
 */
export function transferMorphs(part: Float32Array, src: MorphSource, keys: (name: string) => boolean, k = 4): Map<string, Float32Array> {
  const cell = 0.06;
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const sp = src.pos;
  for (let i = 0; i < sp.length / 3; i++) {
    const kk = key(sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]);
    let a = grid.get(kk);
    if (!a) grid.set(kk, (a = []));
    a.push(i);
  }
  const n = part.length / 3;
  const idx = new Int32Array(n * k).fill(-1);
  const wts = new Float32Array(n * k);
  const bi = new Int32Array(k), bd = new Float64Array(k);
  for (let p = 0; p < n; p++) {
    const x = part[p * 3], y = part[p * 3 + 1], z = part[p * 3 + 2];
    bd.fill(Infinity);
    bi.fill(-1);
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell), gz = Math.floor(z / cell);
    for (let ring = 1; ring <= 8; ring++) {
      for (let dx = -ring; dx <= ring; dx++)
        for (let dy = -ring; dy <= ring; dy++)
          for (let dz = -ring; dz <= ring; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== ring && ring > 1) continue;
            const a = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
            if (!a) continue;
            for (const i of a) {
              const d = (sp[i * 3] - x) ** 2 + (sp[i * 3 + 1] - y) ** 2 + (sp[i * 3 + 2] - z) ** 2;
              if (d >= bd[k - 1]) continue;
              let j = k - 1;
              while (j > 0 && bd[j - 1] > d) {
                bd[j] = bd[j - 1];
                bi[j] = bi[j - 1];
                j--;
              }
              bd[j] = d;
              bi[j] = i;
            }
          }
      // found k points closer than the searched shell → done
      if (bi[k - 1] >= 0 && Math.sqrt(bd[k - 1]) < (ring - 0.5) * cell) break;
    }
    let sum = 0;
    for (let j = 0; j < k; j++) if (bi[j] >= 0) sum += 1 / (bd[j] + 1e-5);
    for (let j = 0; j < k; j++) {
      idx[p * k + j] = bi[j];
      wts[p * k + j] = bi[j] >= 0 ? 1 / (bd[j] + 1e-5) / sum : 0;
    }
  }
  const out = new Map<string, Float32Array>();
  for (const [name, d] of src.deltas) {
    if (!keys(name)) continue;
    const o = new Float32Array(part.length);
    let max = 0;
    for (let p = 0; p < n; p++) {
      let ax = 0, ay = 0, az = 0;
      for (let j = 0; j < k; j++) {
        const i = idx[p * k + j];
        if (i < 0) continue;
        const w = wts[p * k + j];
        ax += d[i * 3] * w;
        ay += d[i * 3 + 1] * w;
        az += d[i * 3 + 2] * w;
      }
      o[p * 3] = ax;
      o[p * 3 + 1] = ay;
      o[p * 3 + 2] = az;
      max = Math.max(max, Math.abs(ax), Math.abs(ay), Math.abs(az));
    }
    if (max > 1e-4) out.set(name, o);
  }
  return out;
}
