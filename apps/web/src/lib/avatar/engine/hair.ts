/**
 * 32 sculpted hairstyles in the stylised Memoji spirit: smooth chunky volumes
 * with lock grooves (shell), hanging sheets (curtain), and tubes for
 * ponytails / braids / locs. Colour is baked into vertex colours so a single
 * material can do roots → tips and highlights.
 */
import * as THREE from "three";
import type { AvatarConfig, HairStyle, Headwear } from "../schema";
import type { HeadParams } from "./head";
import { fbm3, gauss, mulberry, noise3, smooth } from "./math";
import { curtain, merge, shell, tube } from "./shells";

interface Look {
  hairline: number;
  temple: number;
  nape: number;
  sideburn: number;
  ears: boolean;
  base: number;
  top: number;
  front: number;
  frontY: number;
  back: number;
  sides: number;
  part?: number;
  partDepth?: number;
  sweep?: number;
  clump: number;
  clumpN: number;
  curl: number;
  curlFreq: number;
  spiky?: number;
  fringe?: { cx: number; width: number; bottom: number; slant: number; thick: number; jag?: number; split?: boolean };
  band?: number;
  rows?: number;
}

const L = (o: Partial<Look>): Look => ({
  hairline: 0.47,
  temple: 0.84,
  nape: -0.56,
  sideburn: -0.26,
  ears: false,
  base: 0.07,
  top: 0.05,
  front: 0,
  frontY: 0.72,
  back: 0.02,
  sides: 0.8,
  clump: 0.03,
  clumpN: 9,
  curl: 0,
  curlFreq: 8,
  ...o,
});

type Extra =
  | { kind: "curtain"; bottom: number; flare?: number; wave?: number; curl?: number; layered?: boolean; thetaTop?: number; thetaBottom?: number; curlIn?: boolean }
  | { kind: "ponytail"; high?: boolean }
  | { kind: "bun"; at: [number, number, number]; r: number }
  | { kind: "braids" }
  | { kind: "strands"; count: number; r: number; bottom: number; bumpy?: boolean };

const STYLES: Record<Exclude<HairStyle, "bald">, { look: Look; extras?: Extra[] }> = {
  buzz: { look: L({ base: 0.016, top: 0.006, clump: 0, back: 0, sides: 1, hairline: 0.58, nape: -0.5 }) },
  crew: { look: L({ base: 0.04, top: 0.05, front: 0.03, sides: 0.7, clump: 0.012, hairline: 0.57 }) },
  "side-part": { look: L({ base: 0.07, top: 0.07, front: 0.05, part: 0.33, partDepth: 0.03, sweep: -0.18, clump: 0.02, sides: 0.65 }) },
  quiff: { look: L({ base: 0.05, top: 0.06, front: 0.24, frontY: 0.7, sides: 0.45, clump: 0.03, clumpN: 12 }) },
  pompadour: { look: L({ base: 0.07, top: 0.1, front: 0.3, frontY: 0.66, back: 0.04, sides: 0.55, clump: 0.03, clumpN: 10, hairline: 0.58 }) },
  "slick-back": { look: L({ base: 0.06, top: 0.05, front: 0.05, frontY: 0.8, sides: 0.7, clump: 0.012, clumpN: 22, hairline: 0.6 }) },
  undercut: { look: L({ base: 0.07, top: 0.12, front: 0.12, part: 0.42, partDepth: 0.025, sweep: -0.25, sides: 0.12, clump: 0.03 }) },
  messy: { look: L({ base: 0.09, top: 0.07, front: 0.06, sides: 0.7, clump: 0.03, spiky: 0.14, curl: 0.02, curlFreq: 6 }) },
  mohawk: { look: L({ base: 0.05, top: 0.28, front: 0.1, frontY: 0.7, band: 0.2, sides: 1, clump: 0.02, spiky: 0.2 }) },
  "curly-short": { look: L({ base: 0.1, top: 0.06, sides: 0.8, clump: 0, curl: 0.06, curlFreq: 11, hairline: 0.55 }) },
  "fade-curls": { look: L({ base: 0.07, top: 0.14, sides: 0.15, clump: 0, curl: 0.07, curlFreq: 11 }) },
  afro: { look: L({ base: 0.3, top: 0.24, back: 0.12, sides: 1, clump: 0, curl: 0.05, curlFreq: 9, ears: true, nape: -0.5, hairline: 0.5 }) },
  pixie: {
    look: L({
      base: 0.07, top: 0.06, sides: 0.75, clump: 0.025, nape: -0.46, part: -0.35, partDepth: 0.02,
      fringe: { cx: 0.12, width: 0.55, bottom: 0.3, slant: -0.28, thick: 0.05, jag: 0.03 },
    }),
  },
  bob: { look: L({ base: 0.08, top: 0.05, sides: 1, ears: true, clump: 0.02, part: 0.22, partDepth: 0.025 }), extras: [{ kind: "curtain", bottom: -0.98, curlIn: true, thetaTop: 1.95, thetaBottom: 1.95 }] },
  lob: { look: L({ base: 0.08, top: 0.05, sides: 1, ears: true, clump: 0.02, part: -0.22, partDepth: 0.025 }), extras: [{ kind: "curtain", bottom: -1.35, flare: 0.1, thetaTop: 1.95, thetaBottom: 1.7 }] },
  shag: {
    look: L({ base: 0.1, top: 0.07, sides: 1, ears: true, clump: 0.03, spiky: 0.06, fringe: { cx: 0, width: 0.62, bottom: 0.34, slant: 0, thick: 0.05, jag: 0.05, split: true } }),
    extras: [{ kind: "curtain", bottom: -1.3, flare: 0.18, layered: true, wave: 0.03, thetaTop: 1.95, thetaBottom: 1.6 }],
  },
  "bangs-long": {
    look: L({ base: 0.08, top: 0.05, sides: 1, ears: true, clump: 0.018, fringe: { cx: 0, width: 0.6, bottom: 0.33, slant: 0, thick: 0.055, jag: 0.012 } }),
    extras: [{ kind: "curtain", bottom: -2.2, flare: 0.12, thetaTop: 1.95, thetaBottom: 1.35 }],
  },
  "long-straight": { look: L({ base: 0.07, top: 0.04, sides: 1, ears: true, part: 0, partDepth: 0.03, clump: 0.015 }), extras: [{ kind: "curtain", bottom: -2.3, flare: 0.1, thetaTop: 1.95, thetaBottom: 1.35 }] },
  "long-wavy": { look: L({ base: 0.08, top: 0.05, sides: 1, ears: true, part: 0.26, partDepth: 0.03, clump: 0.025 }), extras: [{ kind: "curtain", bottom: -2.25, flare: 0.2, wave: 0.07, thetaTop: 1.95, thetaBottom: 1.35 }] },
  "long-curly": { look: L({ base: 0.14, top: 0.08, sides: 1, ears: true, clump: 0, curl: 0.06, curlFreq: 9 }), extras: [{ kind: "curtain", bottom: -2.0, flare: 0.35, curl: 0.08, thetaTop: 2.0, thetaBottom: 1.45 }] },
  "side-swept": {
    look: L({ base: 0.08, top: 0.05, sides: 1, ears: true, part: 0.36, partDepth: 0.03, clump: 0.02, fringe: { cx: -0.08, width: 0.55, bottom: 0.36, slant: 0.38, thick: 0.055 } }),
    extras: [{ kind: "curtain", bottom: -1.95, flare: 0.14, wave: 0.03, thetaTop: 1.95, thetaBottom: 1.4 }],
  },
  ponytail: { look: L({ base: 0.06, top: 0.03, sides: 0.9, clump: 0.02, clumpN: 20, hairline: 0.58 }), extras: [{ kind: "ponytail" }] },
  "high-ponytail": { look: L({ base: 0.06, top: 0.03, sides: 0.9, clump: 0.02, clumpN: 20, hairline: 0.6 }), extras: [{ kind: "ponytail", high: true }] },
  bun: { look: L({ base: 0.06, top: 0.03, sides: 0.9, clump: 0.02, clumpN: 20, hairline: 0.58 }), extras: [{ kind: "bun", at: [0, 1.2, -0.36], r: 0.34 }] },
  "double-buns": {
    look: L({ base: 0.06, top: 0.03, sides: 0.9, clump: 0.02, part: 0, partDepth: 0.03 }),
    extras: [{ kind: "bun", at: [0.56, 1.02, -0.18], r: 0.27 }, { kind: "bun", at: [-0.56, 1.02, -0.18], r: 0.27 }],
  },
  "man-bun": { look: L({ base: 0.06, top: 0.04, sides: 0.55, clump: 0.02, clumpN: 20 }), extras: [{ kind: "bun", at: [0, 0.98, -0.8], r: 0.24 }] },
  braids: { look: L({ base: 0.06, top: 0.03, sides: 0.9, part: 0, partDepth: 0.03, clump: 0.02 }), extras: [{ kind: "braids" }] },
  "box-braids": { look: L({ base: 0.04, top: 0.02, sides: 1, clump: 0, rows: 7, ears: true }), extras: [{ kind: "strands", count: 46, r: 0.036, bottom: -2.1 }] },
  dreads: { look: L({ base: 0.05, top: 0.03, sides: 1, clump: 0, ears: true, curl: 0.03, curlFreq: 12 }), extras: [{ kind: "strands", count: 30, r: 0.058, bottom: -1.75, bumpy: true }] },
  cornrows: { look: L({ base: 0.03, top: 0.0, sides: 1, clump: 0, rows: 6, hairline: 0.6 }) },
  mullet: { look: L({ base: 0.08, top: 0.07, front: 0.05, sides: 0.7, clump: 0.03, spiky: 0.05 }), extras: [{ kind: "curtain", bottom: -1.55, flare: 0.1, thetaTop: 1.05, thetaBottom: 1.0, layered: true }] },
};

/** Headwear that flattens hair underneath and hides top volume. */
const CAPPING: Headwear[] = ["beanie", "cap", "bucket", "fedora", "turban", "hijab", "bandana"];

export function hairIsHidden(cfg: AvatarConfig): boolean {
  return cfg.hair.style === "bald" || cfg.headwear.style === "hijab";
}

function linear(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function thicknessFn(look: Look, capped: boolean) {
  const hl = look.hairline;
  const yc = (hl - 1.02) / 2;
  const ry = (hl + 1.02) / 2;
  return (d: number[]): number => {
    const [x, y, z] = d;
    const ax = Math.abs(x);
    // outside the face ellipse (only matters on the front half)
    const f = Math.hypot(x / look.temple, (y - yc) / ry);
    let cov = z > -0.05 ? smooth(0.98, 1.13, f) : 1;
    // lower limit: nape at the back, sideburns at the sides
    const side = smooth(-0.35, 0.05, z);
    const sideburnStrip = Math.exp(-(((z - 0.12) / 0.12) ** 2));
    const yMin = look.nape + (0.02 - look.nape) * side + (look.sideburn - 0.02) * sideburnStrip * smooth(0.7, 0.9, ax);
    cov *= smooth(yMin - 0.04, yMin + 0.05, y);
    if (!look.ears && ax > 0.6) {
      const e = Math.hypot((y + 0.03) / 0.27, (z + 0.07) / 0.27);
      cov *= smooth(0.95, 1.12, e);
    }
    if (look.band) cov *= Math.exp(-Math.pow(x / look.band, 8));

    const ramp = z > 0 ? 0.3 + 0.7 * smooth(1.0, 1.32, f) : 1;
    let t = look.base;
    t += look.top * smooth(0.1, 0.9, y);
    t += look.front * Math.exp(-((x / 0.46) ** 2) - ((y - look.frontY) / 0.28) ** 2) * smooth(0, 0.5, z);
    t += look.back * smooth(0.1, -0.8, z) * smooth(-0.6, 0.3, y);
    if (look.sides < 1) t *= 1 + (look.sides - 1) * smooth(0.42, 0.75, ax) * smooth(0.55, 0.15, y);
    if (look.part !== undefined && look.partDepth) {
      t -= look.partDepth * Math.exp(-(((x - look.part) / 0.035) ** 2)) * smooth(0.2, 0.55, y) * smooth(-0.7, 0.1, z);
    }
    if (look.sweep) t *= 1 + look.sweep * x;
    if (look.clump) {
      const phi = Math.atan2(z, x);
      const n = fbm3(x * 3, y * 3, z * 3);
      t += look.clump * (Math.pow(Math.abs(Math.sin(phi * look.clumpN + n * 1.2)), 0.55) - 0.6) * smooth(-0.3, 0.6, y) * 1.6;
    }
    if (look.curl) t += look.curl * (fbm3(x * look.curlFreq, y * look.curlFreq, z * look.curlFreq) * 1.4 + 0.4);
    if (look.spiky) t += look.spiky * Math.pow(Math.max(0, noise3(x * 5, y * 5 + 2, z * 5)), 2) * smooth(0.2, 0.8, y) * 3;
    if (look.rows) t += 0.03 * Math.pow(Math.abs(Math.cos(x * Math.PI * look.rows * 0.5)), 5) * smooth(-0.3, 0.3, y);
    t *= ramp;

    if (look.fringe) {
      const F = look.fringe;
      const off = look.fringe.split ? Math.abs(x) - 0.05 : x - F.cx;
      const bottom = F.bottom + F.slant * (x - F.cx) + (F.jag ? F.jag * noise3(x * 30, 1, 0) : 0);
      const fm = smooth(F.width, F.width - 0.12, Math.abs(off)) * smooth(bottom - 0.03, bottom + 0.035, y) * smooth(0.15, 0.4, z) * (y < hl + 0.1 ? 1 : 0);
      if (fm > 0) {
        const ft = F.thick * (1.1 - 0.3 * smooth(bottom + 0.04, bottom + 0.2, y)) + 0.02 * Math.abs(Math.sin(x * 14));
        t = Math.max(t, ft);
        cov = Math.max(cov, fm);
      }
    }

    if (capped) t = Math.min(t, 0.02 + 0.05 * smooth(0.35, -0.2, y));
    return -0.025 + (t + 0.025) * cov;
  };
}

/**
 * Vertex colour encodes (r = shade 0..1, g = highlight mask 0..1); the hair
 * material multiplies its colour by r and mixes toward the highlight colour
 * by g (see AvatarRenderer's shader patch). Geometry is colour-independent.
 */
function colorFn(_cfg: AvatarConfig) {
  return (x: number, y: number, z: number, depth: number, tipness: number, out: THREE.Color) => {
    const shade = 0.74 + 0.26 * depth;
    const streak = smooth(0.2, 0.6, Math.sin(Math.atan2(z, x) * 11 + fbm3(x * 2, y * 2, z * 2) * 5));
    out.setRGB(shade, Math.min(1, streak * 0.55 + tipness * 0.6), 0);
  };
}

function paint(geo: THREE.BufferGeometry, shade: number, mask = 0) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = shade;
    c[i * 3 + 1] = mask;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return geo;
}

function headRadiusAt(P: HeadParams, y: number, th: number): number {
  const s = Math.sin(th);
  const k = Math.sqrt(P.sx * P.sx * s * s + P.sz * P.sz * (1 - s * s));
  const yy = Math.max(-0.55, Math.min(0.99, y / P.sy));
  return k * Math.sqrt(Math.max(0.12, 1 - yy * yy));
}

/**
 * Long hair as a fan of thick, rounded locks (the sculpted Memoji look):
 * each lock is a flattened tube hanging from under the scalp shell, following
 * the head outline, flaring below the jaw, with waves/curls and tapered tips.
 */
function locks(P: HeadParams, ex: Extract<Extra, { kind: "curtain" }>, rnd: () => number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const thTop = ex.thetaTop ?? 1.95;
  const thBot = ex.thetaBottom ?? 1.4;
  const flare = ex.flare ?? 0.1;
  const wave = ex.wave ?? 0;
  const curl = ex.curl ?? 0;
  const n = curl ? 15 : 11;
  const top = 0.62;
  const ROWS = 44;
  const RING = 16;
  for (let i = 0; i < n; i++) {
    const q = (i + 0.5) / n;
    const th0 = (q * 2 - 1) * thTop + (rnd() - 0.5) * 0.08;
    const layer = i % 2 ? 0.045 : 0;
    const bottom = ex.bottom + (ex.layered ? 0.14 * Math.abs(Math.sin(i * 2.3)) : 0) + (rnd() - 0.5) * 0.1 + (Math.abs(th0) > 1.5 ? 0.12 : 0);
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    for (let r = 0; r <= ROWS; r++) {
      const sv = r / ROWS;
      const y = top + (bottom - top) * sv;
      const th = th0 * (1 + (thBot / thTop - 1) * sv);
      const neckY = -0.5;
      // emerge from under the scalp shell: tucked in at the top, full volume below the temples
      let rad = headRadiusAt(P, Math.max(y, neckY), th) + 0.02 + (0.08 + layer) * smooth(0.55, 0.15, y) + 0.05 * smooth(1.2, 1.8, Math.abs(th));
      rad += flare * Math.max(0, neckY - y) * 0.7;
      rad += wave * Math.sin(y * 5 + i * 1.1);
      if (curl) rad += curl * Math.sin(sv * 16 + i * 1.7);
      if (ex.curlIn) rad -= 0.14 * smooth(bottom + 0.35, bottom, y);
      const zs = -0.06 * smooth(-0.5, -1.6, y);
      const cx = Math.sin(th) * rad, cz = -Math.cos(th) * rad + zs;
      // lock cross-section: wide around the head, thinner radially; tapered tip
      const tip = sv > 0.8 ? 1 - ((sv - 0.8) / 0.2) * 0.85 : 1;
      const halfW = ((2 * thTop) / n) * Math.max(0.8, rad) * 0.62 * tip * (1 + 0.15 * Math.sin(sv * 3 + i));
      const halfT = (curl ? 0.1 : 0.07) * tip * (0.35 + 0.65 * smooth(0.6, 0.2, y));
      const sx = Math.cos(th), sz = Math.sin(th); // around the head
      const nx = Math.sin(th), nz = -Math.cos(th); // outward
      for (let k = 0; k <= RING; k++) {
        const a = (k / RING) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const px = cx + sx * halfW * ca + nx * halfT * sa;
        const pz = cz + sz * halfW * ca + nz * halfT * sa;
        pos.push(px, y + (curl ? 0.02 * Math.sin(a * 2 + sv * 9) : 0), pz);
        uv.push(k / RING, sv * 3);
        col.push(0.8 + 0.2 * (sa > 0 ? 1 : 0.6) * (1 - sv * 0.3), Math.min(1, smooth(0.45, 1, sv) * 0.8), 0);
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < ROWS; r++)
      for (let k = 0; k < RING; k++) {
        const a = r * (RING + 1) + k, b = a + RING + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

/** Build all hair geometry for the config (null when bald/hidden). */
export function buildHair(cfg: AvatarConfig, P: HeadParams): THREE.BufferGeometry | null {
  if (hairIsHidden(cfg)) return null;
  const spec = STYLES[cfg.hair.style as Exclude<HairStyle, "bald">];
  const capped = CAPPING.includes(cfg.headwear.style);
  const col = colorFn(cfg);
  const parts: THREE.BufferGeometry[] = [];
  const tFn = thicknessFn(spec.look, capped);

  // Main scalp shell (only the upper ~70% of the sphere is ever hair)
  parts.push(
    shell(P, tFn, {
      widthSeg: 150,
      heightSeg: 96,
      thetaLength: Math.PI * 0.8,
      uRepeat: 14,
      color: (d, t, out) => col(d[0], d[1], d[2], smooth(-0.02, 0.1, t), 0, out),
    }),
  );
  // Mohawk: shaved sides underneath the band
  if (cfg.hair.style === "mohawk") {
    const buzz = thicknessFn(L({ base: 0.012, top: 0, clump: 0, sides: 1 }), capped);
    parts.push(paint(shell(P, buzz, { widthSeg: 110, heightSeg: 72, thetaLength: Math.PI * 0.8 }), 0.6));
  }

  const rnd = mulberry(cfg.hair.style.length * 97 + 13);
  for (const ex of spec.extras ?? []) {
    if (ex.kind === "curtain") {
      parts.push(...locks(P, ex, rnd));
    } else if (ex.kind === "ponytail") {
      const high = !!ex.high;
      const pts = high
        ? [new THREE.Vector3(0, 0.98, -0.55), new THREE.Vector3(0, 1.15, -0.95), new THREE.Vector3(0, 0.55, -1.35), new THREE.Vector3(0, -0.4, -1.3), new THREE.Vector3(0.05, -1.05, -1.2)]
        : [new THREE.Vector3(0, 0.32, -0.98), new THREE.Vector3(0, 0.12, -1.3), new THREE.Vector3(0, -0.6, -1.32), new THREE.Vector3(0.04, -1.45, -1.12)];
      const path = new THREE.CatmullRomCurve3(pts);
      const g = tube(path, (t, a) => {
        const r = t < 0.12 ? 0.11 + t * 0.6 : 0.2 * Math.pow(1 - (t - 0.12) / 0.88, 0.7) + 0.02;
        return r * (1 + 0.1 * Math.abs(Math.sin(a * 5 + t * 9)));
      }, 70, 18);
      parts.push(paint(g, 0.95));
      const tie = new THREE.TorusGeometry(0.12, 0.035, 10, 24);
      tie.lookAt(path.getTangentAt(0.06));
      tie.translate(...(path.getPointAt(0.06).toArray() as [number, number, number]));
      parts.push(paint(tie, 0.45));
    } else if (ex.kind === "bun") {
      if (capped && ex.at[1] > 0.7) continue;
      const g = new THREE.SphereGeometry(ex.r, 40, 28);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const a = Math.atan2(z, x) + y * 9;
        const k = 1 + 0.07 * Math.abs(Math.sin(a * 3));
        pos.setXYZ(i, x * k, y * k * 0.85, z * k);
      }
      g.computeVertexNormals();
      g.translate(ex.at[0], ex.at[1], ex.at[2]);
      parts.push(paint(g, 0.95));
    } else if (ex.kind === "braids") {
      for (const s of [-1, 1]) {
        const path = new THREE.CatmullRomCurve3([
          new THREE.Vector3(s * 0.88, 0.0, -0.35),
          new THREE.Vector3(s * 1.05, -0.6, -0.15),
          new THREE.Vector3(s * 1.0, -1.25, 0.25),
          new THREE.Vector3(s * 0.9, -1.95, 0.42),
        ]);
        const g = tube(path, (t, a) => (0.085 * (1 + 0.38 * Math.abs(Math.sin(t * Math.PI * 20 + (a > Math.PI ? 1.4 : 0))))) * (t > 0.9 ? 1 - (t - 0.9) * 5 : 1) + 0.012, 110, 14);
        parts.push(paint(g, 0.95));
      }
    } else if (ex.kind === "strands") {
      for (let k = 0; k < ex.count; k++) {
        const row = k % 2;
        const a = -2.25 + (4.5 * (k + rnd() * 0.5)) / ex.count;
        if (Math.abs(a) > 2.05 && row === 1) continue;
        const y0 = (row ? 0.25 : 0.55) + 0.1 * Math.cos(a) - 0.1;
        const r0 = headRadiusAt(P, y0, a) + 0.04;
        const start = new THREE.Vector3(Math.sin(a) * r0, y0, -Math.cos(a) * r0);
        const out = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
        const front = Math.abs(a) > 1.6;
        const len = front ? ex.bottom * 0.62 : ex.bottom + rnd() * 0.2;
        const r1 = headRadiusAt(P, -0.4, a) + 0.14 + rnd() * 0.05;
        const path = new THREE.CatmullRomCurve3([
          start,
          start.clone().addScaledVector(out, 0.12).add(new THREE.Vector3(0, -0.12, 0)),
          new THREE.Vector3(Math.sin(a) * r1, -0.5, -Math.cos(a) * r1 - 0.05),
          new THREE.Vector3(Math.sin(a) * (r1 + 0.12), len, -Math.cos(a) * (r1 + 0.1) - 0.15 + (front ? 0.2 : 0)),
        ]);
        const bumpy = ex.bumpy;
        const g = tube(path, (t) => ex.r * (bumpy ? 1 + 0.25 * noise3(k, t * 14, 0) : 1) * (t > 0.92 ? 1 - (t - 0.92) * 6 : 1), 40, 7);
        parts.push(paint(g, 0.84 + rnd() * 0.16, rnd() * 0.3));
      }
    }
  }
  return merge(parts);
}

/** Build a hair material (vertex colours carry the colour). */
export function hairMaterial(normalMap: THREE.Texture, color: string): THREE.MeshPhysicalMaterial {
  const sheen = new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.45);
  return new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.55,
    sheenRoughness: 0.35,
    sheenColor: sheen,
    clearcoat: 0.05,
    clearcoatRoughness: 0.6,
    normalMap,
    normalScale: new THREE.Vector2(0.08, 0.08),
    side: THREE.DoubleSide,
  });
}

// ── Facial hair ──────────────────────────────────────────────────────────────

export function buildBeard(cfg: AvatarConfig, P: HeadParams): THREE.BufferGeometry | null {
  const st = cfg.facialHair.style;
  if (st === "none" || st === "stubble") return null;
  const MY = -0.475;
  const inFace = (x: number, y: number) => Math.hypot(x / 0.8, (y + 0.23) / 0.79);
  const thick = { mustache: 0.035, handlebar: 0.035, goatee: 0.05, chinstrap: 0.03, "short-beard": 0.05, "full-beard": 0.1, "long-beard": 0.12 }[st];
  const mouthHole = (x: number, y: number) => smooth(0.85, 1.05, Math.hypot(x / 0.3, (y - MY + 0.01) / 0.075));

  const region = (d: number[]): number => {
    const [x, y, z] = d;
    if (z < -0.25) return 0;
    const ax = Math.abs(x);
    const mustache = gauss(x, y, 0, MY + 0.085, 0.27, 0.045) > 0.35 ? 1 : smooth(0.2, 0.35, gauss(x, y, 0, MY + 0.085, 0.27, 0.045));
    switch (st) {
      case "mustache":
        return mustache;
      case "handlebar":
        return Math.max(mustache, smooth(0.25, 0.4, gauss(ax, y, 0.3, MY + 0.06, 0.08, 0.05)));
      case "goatee": {
        const chin = smooth(0.25, 0.4, gauss(x, y, 0, -0.72, 0.17, 0.16));
        return Math.max(mustache * 0.9, chin) * mouthHole(x, y);
      }
      case "chinstrap": {
        const f = inFace(x, y);
        const band = smooth(0.84, 0.9, f) * smooth(1.08, 1.0, f) * smooth(0.0, -0.3, y);
        return band;
      }
      default: {
        // beards: everything below the cheekbones inside the jaw, around the mouth
        const f = inFace(x, y);
        const lower = y < MY + 0.12 ? 1 : smooth(-0.08, -0.22, y) * smooth(0.4, 0.58, ax);
        const area = lower * smooth(1.0, 0.93, f) * smooth(0.0, 0.25, z);
        return Math.max(area * mouthHole(x, y), mustache);
      }
    }
  };
  const geo = shell(
    P,
    (d) => {
      const r = region(d);
      const curl = st === "full-beard" || st === "long-beard" ? 0.015 * fbm3(d[0] * 9, d[1] * 9, d[2] * 9) : 0;
      return -0.03 + (thick + 0.03 + curl) * r;
    },
    {
      widthSeg: 110,
      heightSeg: 70,
      phiStart: Math.PI / 2 - 1.9,
      phiLength: 3.8,
      thetaStart: Math.PI / 2 - 0.25,
      thetaLength: Math.PI / 2 + 0.25,
      morphs: true,
      uRepeat: 8,
      extra:
        st === "full-beard" || st === "long-beard"
          ? (d, out) => {
              const drop = st === "long-beard" ? 0.45 : 0.14;
              const w = region(d) * smooth(-0.6, -0.95, d[1]) * smooth(-0.1, 0.4, d[2]);
              out[1] = -drop * w;
              out[2] = 0.05 * w;
            }
          : undefined,
    },
  );
  if (st === "handlebar") {
    // curled tips — separate small tubes, no morphs (tiny)
  }
  return geo;
}
