/**
 * Scalp under the hair. Short styles are caps that sit on the top of the skull; the sides, the area
 * around the ears and the nape are meant to read as hair-coloured stubble (the sources rely on a painted
 * scalp zone that we replace by a flat skin colour). So, per base + hair pair we build a smooth mask on the
 * head's skin from the hair's own footprint:
 *
 *  - under the hair: full;
 *  - around it: a feathered fall-off into the skin tone (≈ 15–25 mm at the sides and back, short at the
 *    forehead so the forehead stays skin right up to the hairline);
 *  - for hair that covers the top of the head: the sideburns, the area behind the ear and the nape
 *    (cropped sides) — only where hair exists; no hair, no mask.
 *
 * Also tapers the hair's lower rim onto the skin so the cap doesn't float with a thick lip.
 * Everything is in normalised head space (+Y up, +Z front, chin ≈ −1, crown ≈ +1; 1 unit ≈ 11 cm).
 */

export const EL = 128;
export const AZ = 256;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function cellOf(x: number, y: number, z: number): [number, number] {
  const r = Math.hypot(x, y, z) || 1e-6;
  const e = Math.min(EL - 1, Math.max(0, Math.floor((Math.asin(Math.max(-1, Math.min(1, y / r))) / Math.PI + 0.5) * EL)));
  const a = Math.min(AZ - 1, Math.max(0, Math.floor((Math.atan2(x, z) / (2 * Math.PI) + 0.5) * AZ)));
  return [e, a];
}

/** Angular size of one grid cell on the unit sphere (≈ head units). */
const CELL = Math.PI / EL;

export interface Footprint {
  /** 1 where hair covers the direction */
  cover: Uint8Array;
  /** distance (head units) from an uncovered cell to the nearest covered one; 0 inside */
  outside: Float32Array;
  /** distance (head units) from a covered cell to the nearest uncovered one; 0 outside */
  inside: Float32Array;
  /** share of the crown (above 60° elevation) the hair covers, 0..1 */
  topCover: number;
}

/** Chamfer distance transform over the (el, az) grid, wrapping in azimuth. `src` cells are the zero set. */
function distance(zero: Uint8Array): Float32Array {
  const d = new Float32Array(EL * AZ).fill(1e9);
  for (let i = 0; i < d.length; i++) if (zero[i]) d[i] = 0;
  const at = (e: number, a: number) => e * AZ + ((a + AZ) % AZ);
  const D1 = CELL, D2 = CELL * Math.SQRT2;
  const relax = (e: number, a: number, ne: number, na: number, w: number) => {
    if (ne < 0 || ne >= EL) return;
    const v = d[at(ne, na)] + w;
    if (v < d[at(e, a)]) d[at(e, a)] = v;
  };
  for (let e = 0; e < EL; e++)
    for (let a = 0; a < AZ; a++) {
      relax(e, a, e - 1, a - 1, D2); relax(e, a, e - 1, a, D1); relax(e, a, e - 1, a + 1, D2); relax(e, a, e, a - 1, D1);
    }
  for (let e = EL - 1; e >= 0; e--)
    for (let a = AZ - 1; a >= 0; a--) {
      relax(e, a, e + 1, a + 1, D2); relax(e, a, e + 1, a, D1); relax(e, a, e + 1, a - 1, D2); relax(e, a, e, a + 1, D1);
    }
  return d;
}

/** A hair mesh as the footprint sees it: positions, triangles, and which vertices are really on the head. */
export interface HairSurface {
  pos: Float32Array;
  index: ArrayLike<number> | null;
  /** 1 for vertices on the head (stray interior geometry is 0); omitted = all */
  ok?: Uint8Array;
}

/** Where the hair is, seen from the head centre (triangles are rasterised, not just their vertices). */
export function footprint(hair: HairSurface[]): Footprint {
  let raw = new Uint8Array(EL * AZ);
  const mark = (x: number, y: number, z: number) => {
    const [e, a] = cellOf(x, y, z);
    raw[e * AZ + a] = 1;
  };
  for (const h of hair) {
    const p = h.pos;
    const idx = h.index;
    if (!idx) {
      for (let i = 0; i < p.length; i += 3) if (!h.ok || h.ok[i / 3]) mark(p[i], p[i + 1], p[i + 2]);
      continue;
    }
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (h.ok && !(h.ok[a] && h.ok[b] && h.ok[c])) continue;
      const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
      const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2];
      const cx = p[c * 3], cy = p[c * 3 + 1], cz = p[c * 3 + 2];
      const len = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - ax, cy - ay, cz - az), Math.hypot(cx - bx, cy - by, cz - bz));
      const n = Math.min(48, Math.max(1, Math.ceil(len / 0.015)));
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n - i; j++) {
          const u = i / n, v = j / n, w = 1 - u - v;
          mark(ax * w + bx * u + cx * v, ay * w + by * u + cy * v, az * w + bz * u + cz * v);
        }
    }
  }
  // close pinholes between sparse vertices: dilate then erode by one cell
  const morph = (src: Uint8Array, grow: boolean) => {
    const out = new Uint8Array(src.length);
    for (let e = 0; e < EL; e++)
      for (let a = 0; a < AZ; a++) {
        let any = 0, all = 1;
        for (let de = -1; de <= 1; de++)
          for (let da = -1; da <= 1; da++) {
            // The poles have no uncovered row beyond them. Treating that row as
            // empty creates a false rim at the crown and pulls the hair inward.
            const ee = Math.max(0, Math.min(EL - 1, e + de));
            const v = src[ee * AZ + ((a + da + AZ) % AZ)];
            any |= v;
            all &= v;
          }
        out[e * AZ + a] = grow ? any : all;
      }
    return out;
  };
  const cover = morph(morph(raw, true), false);
  const outside = distance(cover);
  const notCover = new Uint8Array(cover.length);
  for (let i = 0; i < cover.length; i++) notCover[i] = cover[i] ? 0 : 1;
  const inside = distance(notCover);
  for (let i = 0; i < cover.length; i++) {
    if (!cover[i]) inside[i] = 0;
    else outside[i] = 0;
  }
  // the crown: directions above ~60° elevation (hair that covers it is a full head of hair, not a tuft or a bun)
  let tot = 0, cov = 0;
  for (let e = Math.floor(EL * (0.5 + 60 / 180)); e < EL; e++)
    for (let a = 0; a < AZ; a++) {
      tot++;
      cov += cover[e * AZ + a];
    }
  return { cover, outside, inside, topCover: tot ? cov / tot : 0 };
}

export interface ScalpFrame {
  /** eye line height */
  eyeY: number;
}

/** Mask (0..1) for skin points: hair footprint + feather, plus cropped sides / nape for hair that covers the top. */
export function scalpMask(skin: Float32Array, fp: Footprint, frame: ScalpFrame, out: Float32Array = new Float32Array(skin.length / 3)): Float32Array {
  const top = smooth(0.3, 0.7, fp.topCover);
  for (let i = 0, j = 0; i < skin.length; i += 3, j++) {
    const x = skin[i], y = skin[i + 1], z = skin[i + 2];
    const [e, a] = cellOf(x, y, z);
    const k = e * AZ + a;
    // feather: long at the sides and back, short in front (forehead stays skin up to the hairline)
    const F = 0.012 + 0.16 * (1 - smooth(0.12, 0.42, z));
    const foot = fp.cover[k] ? 1 : smooth(F, 0, fp.outside[k]);
    // cropped sides: sideburns, behind the ear, nape — never the face
    const back = smooth(0.32, 0.1, z);
    const nape = smooth(frame.eyeY - 0.78, frame.eyeY - 0.5, y);
    // above the temple line the footprint decides; the extension is for the low sides and back
    const ext = back * nape * top;
    // ears are skin, not scalp
    const ear = smooth(0.74, 0.82, Math.abs(x)) * smooth(0.2, 0.0, z) * smooth(frame.eyeY - 0.55, frame.eyeY - 0.35, y) * smooth(frame.eyeY + 0.3, frame.eyeY + 0.1, y);
    out[j] = Math.max(foot, ext) * (1 - ear);
  }
  return out;
}

/** Nearest-skin lookup (uniform grid). */
export class SkinIndex {
  private grid = new Map<string, number[]>();
  private pos: Float32Array;
  private nrm: Float32Array;
  private cell = 0.06;
  constructor(pos: Float32Array, nrm: Float32Array) {
    this.pos = pos;
    this.nrm = nrm;
    for (let i = 0; i < pos.length / 3; i++) {
      const k = this.key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(i);
    }
  }
  private key(x: number, y: number, z: number) {
    const c = this.cell;
    return `${Math.floor(x / c)},${Math.floor(y / c)},${Math.floor(z / c)}`;
  }
  /** index of the nearest skin point within ~4 cells, or −1 */
  nearest(x: number, y: number, z: number): number {
    const c = this.cell;
    const gx = Math.floor(x / c), gy = Math.floor(y / c), gz = Math.floor(z / c);
    let best = Infinity, bi = -1;
    // Keep the small, common lookup fast; widen only for rims that stand off the scalp.
    for (const reach of [2, 4]) {
      for (let dx = -reach; dx <= reach; dx++)
        for (let dy = -reach; dy <= reach; dy++)
          for (let dz = -reach; dz <= reach; dz++) {
            const a = this.grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
            if (!a) continue;
            for (const i of a) {
              const d = (this.pos[i * 3] - x) ** 2 + (this.pos[i * 3 + 1] - y) ** 2 + (this.pos[i * 3 + 2] - z) ** 2;
              if (d < best) {
                best = d;
                bi = i;
              }
            }
          }
      if (bi >= 0) break;
    }
    return bi;
  }
  /** signed height of a point above its nearest skin point along the skin normal (NaN if none near) */
  height(x: number, y: number, z: number): { along: number; n: [number, number, number] } | null {
    const i = this.nearest(x, y, z);
    if (i < 0) return null;
    const nx = this.nrm[i * 3], ny = this.nrm[i * 3 + 1], nz = this.nrm[i * 3 + 2];
    return { along: (x - this.pos[i * 3]) * nx + (y - this.pos[i * 3 + 1]) * ny + (z - this.pos[i * 3 + 2]) * nz, n: [nx, ny, nz] };
  }
}

/**
 * In place: lay the hair's lower rim (the thick lip of a cap) onto the skin. Within ~14 mm of the footprint's
 * boundary, vertices that are close above the skin sink to a hair's breadth above it.
 */
export function taperHair(hair: Float32Array, fp: Footprint, skin: SkinIndex, band = 0.24, rim = 0.14, clearance = 0.004) {
  for (let i = 0; i < hair.length; i += 3) {
    const x = hair[i], y = hair[i + 1], z = hair[i + 2];
    const [e, a] = cellOf(x, y, z);
    const dep = fp.inside[e * AZ + a];
    const edge = smooth(rim, 0.0, dep);
    if (edge <= 0) continue;
    const h = skin.height(x, y, z);
    if (!h || h.along < 0.002 || h.along > band) continue;
    const near = smooth(band, band * 0.6, h.along); // strands that stand off the head are left alone
    // The authored cap rim can sit ~0.16 units off the skull. Seat its edge fully;
    // leaving a fixed 10% gap still makes a visible floating lip in profile.
    const to = h.along + (clearance - h.along) * edge * near;
    const d = to - h.along;
    hair[i] = x + h.n[0] * d;
    hair[i + 1] = y + h.n[1] * d;
    hair[i + 2] = z + h.n[2] * d;
  }
}

/** Total range of the signed distance the shader texture can express (head units). */
export const FOOT_RANGE = 0.8;

/**
 * The footprint as bytes for a texture (rows = elevation, columns = azimuth): a SIGNED distance to the hair's
 * boundary — negative under the hair, positive outside — so bilinear filtering gives a smooth, sub-cell
 * boundary (no staircase). 128 = on the boundary; range ±FOOT_RANGE/2.
 */
export function footprintBytes(fp: Footprint | null): Uint8Array {
  const out = new Uint8Array(EL * AZ);
  for (let i = 0; i < out.length; i++) {
    const sd = fp ? fp.outside[i] - fp.inside[i] : FOOT_RANGE / 2;
    out[i] = Math.round(Math.max(0, Math.min(1, sd / FOOT_RANGE + 0.5)) * 255);
  }
  return out;
}

/** Share of the upper skull the hair covers, smoothed: how much the extension (cropped sides, nape) applies. */
export function topWeight(fp: Footprint | null): number {
  return fp ? smooth(0.35, 0.8, fp.topCover) : 0;
}
