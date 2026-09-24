/**
 * Geometry helpers for sculpted hair-like surfaces:
 *  - shell():   a surface floating above the head, thickness(d) per direction,
 *               dipping under the skin where thickness < 0 (clean hairlines)
 *  - curtain(): a hanging sheet around the head for long hair / drapes
 *  - tube():    a tapered tube along a path (ponytails, braids, locs, strings)
 */
import * as THREE from "three";
import { HEAD_MORPHS, morphDisplacement, restPoint, type HeadParams } from "./head";

export interface ShellOptions {
  widthSeg?: number;
  heightSeg?: number;
  phiStart?: number;
  phiLength?: number;
  thetaStart?: number;
  thetaLength?: number;
  /** also bake head expression morphs (beards) */
  morphs?: boolean;
  /** extra non-radial offset per direction (e.g. beard hanging below the chin) */
  extra?: (d: number[], out: number[]) => void;
  /** vertex colour (linear) per direction */
  color?: (d: number[], t: number, out: THREE.Color) => void;
  /** UV repeat along u (around the head) for the strand normal map */
  uRepeat?: number;
}

export function shell(P: HeadParams, thickness: (d: number[]) => number, opts: ShellOptions = {}): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(
    1,
    opts.widthSeg ?? 132,
    opts.heightSeg ?? 100,
    opts.phiStart ?? 0,
    opts.phiLength ?? Math.PI * 2,
    opts.thetaStart ?? 0,
    opts.thetaLength ?? Math.PI,
  );
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const n = pos.count;
  const dirs = new Float32Array(n * 3);
  const colors = opts.color ? new Float32Array(n * 3) : null;
  const d = [0, 0, 0];
  const p = [0, 0, 0];
  const e = [0, 0, 0];
  const c = new THREE.Color();
  const rep = opts.uRepeat ?? 10;
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)) || 1;
    d[0] = pos.getX(i) / l;
    d[1] = pos.getY(i) / l;
    d[2] = pos.getZ(i) / l;
    dirs.set(d, i * 3);
    const t = thickness(d);
    restPoint(P, d[0], d[1], d[2], p);
    let x = p[0] + d[0] * t, y = p[1] + d[1] * t, z = p[2] + d[2] * t;
    if (opts.extra) {
      e[0] = e[1] = e[2] = 0;
      opts.extra(d, e);
      x += e[0];
      y += e[1];
      z += e[2];
    }
    pos.setXYZ(i, x, y, z);
    uv.setX(i, uv.getX(i) * rep);
    if (colors && opts.color) {
      opts.color(d, t, c);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }
  if (colors) geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  if (opts.morphs) {
    const base = pos.array as Float32Array;
    const morphPos: THREE.BufferAttribute[] = [];
    const disp = [0, 0, 0];
    for (const m of HEAD_MORPHS) {
      const delta = new Float32Array(n * 3);
      let any = false;
      for (let i = 0; i < n; i++) {
        d[0] = dirs[i * 3];
        d[1] = dirs[i * 3 + 1];
        d[2] = dirs[i * 3 + 2];
        p[0] = base[i * 3];
        p[1] = base[i * 3 + 1];
        p[2] = base[i * 3 + 2];
        morphDisplacement(m, d, p, disp);
        delta[i * 3] = disp[0];
        delta[i * 3 + 1] = disp[1];
        delta[i * 3 + 2] = disp[2];
        if (disp[0] || disp[1] || disp[2]) any = true;
      }
      void any;
      morphPos.push(new THREE.BufferAttribute(delta, 3));
    }
    geo.morphAttributes.position = morphPos;
    geo.morphTargetsRelative = true;
  }
  return geo;
}

export interface CurtainOptions {
  /** half-angle of the sheet around the head (0 = back of head), at top and bottom */
  thetaTop: number;
  thetaBottom: number;
  yTop: number;
  yBottom: number | ((theta: number) => number);
  /** radius at a given height (distance from the y axis), before ripples */
  radius: (y: number, theta: number) => number;
  /** radial offset for waves/curls/locks */
  ripple?: (theta: number, y: number) => number;
  /** centre offset in z (hair falls a bit behind the head) */
  zShift?: (y: number) => number;
  cols?: number;
  rows?: number;
  color?: (theta: number, y: number, out: THREE.Color) => void;
}

/** Hanging hair sheet: rows go top→bottom, columns sweep around the back. */
export function curtain(o: CurtainOptions): THREE.BufferGeometry {
  const cols = o.cols ?? 96;
  const rows = o.rows ?? 64;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const col = o.color ? new Float32Array(cols * rows * 3) : null;
  const c = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    const s = r / (rows - 1);
    for (let k = 0; k < cols; k++) {
      const q = (k / (cols - 1)) * 2 - 1;
      const thMax = o.thetaTop + (o.thetaBottom - o.thetaTop) * s;
      const th = q * thMax;
      const yb = typeof o.yBottom === "function" ? o.yBottom(th) : o.yBottom;
      const y = o.yTop + (yb - o.yTop) * s;
      const rad = o.radius(y, th) + (o.ripple ? o.ripple(th, y) : 0);
      const i = r * cols + k;
      pos[i * 3] = Math.sin(th) * rad;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = -Math.cos(th) * rad + (o.zShift ? o.zShift(y) : 0);
      uv[i * 2] = (k / (cols - 1)) * 8;
      uv[i * 2 + 1] = 1 - s * 3;
      if (col && o.color) {
        o.color(th, y, c);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++)
    for (let k = 0; k < cols - 1; k++) {
      const a = r * cols + k, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Tapered tube along a curve; radius(t, angle) lets you add grooves/braids. */
export function tube(
  path: THREE.Curve<THREE.Vector3>,
  radius: (t: number, a: number) => number,
  segs = 64,
  radial = 14,
  closeEnds = true,
): THREE.BufferGeometry {
  const frames = path.computeFrenetFrames(segs, false);
  const verts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    path.getPointAt(t, P);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const r = radius(t, a);
      verts.push(P.x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x), P.y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y), P.z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z));
      uvs.push((j / radial) * 2, t * 6);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  if (closeEnds) {
    for (const [end, sign] of [[0, 1], [segs, -1]] as const) {
      path.getPointAt(end / segs, P);
      const ci = verts.length / 3;
      verts.push(P.x, P.y, P.z);
      uvs.push(0.5, end ? 6 : 0);
      for (let j = 0; j < radial; j++) {
        const a = end * (radial + 1) + j;
        if (sign > 0) idx.push(ci, a + 1, a);
        else idx.push(ci, a, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Merge geometries that share the same attribute set (position/normal/uv[/color]). */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const withColor = geos.every((g) => g.attributes.color);
  let vCount = 0, iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const col = withColor ? new Float32Array(vCount * 3) : null;
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, vo * 3);
    nor.set(g.attributes.normal.array as Float32Array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array as Float32Array, vo * 2);
    if (col) col.set(g.attributes.color.array as Float32Array, vo * 3);
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
      io += a.length;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = vo + i;
      io += n;
    }
    vo += n;
    g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  m.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  m.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  if (col) m.setAttribute("color", new THREE.BufferAttribute(col, 3));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}
