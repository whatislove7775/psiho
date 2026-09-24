/**
 * Ears (+ earrings), nose piercings, eyewear and headwear. All attach to the
 * head group, so they follow head tracking but not skin morphs.
 */
import * as THREE from "three";
import type { AvatarConfig } from "../schema";
import { dirFrom2D, restPoint, surfaceFrame, type HeadParams } from "./head";
import { smooth } from "./math";
import { curtain, shell, tube } from "./shells";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ── Ears ─────────────────────────────────────────────────────────────────────

export function buildEars(cfg: AvatarConfig, P: HeadParams, skin: THREE.Material, metal: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const k = { small: 1.0, medium: 1.2, large: 1.4 }[cfg.ears.size];
  for (const s of [-1, 1]) {
    const geo = new THREE.SphereGeometry(1, 36, 28);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // concha: dent on the outer face
      const dent = x > 0 ? 0.55 * Math.exp(-((y + 0.05) ** 2) / 0.18 - (z ** 2) / 0.22) : 0;
      x = x * (0.5 - dent * 0.4);
      // helix rim slightly thicker at the top/back
      pos.setXYZ(i, x * 0.07, y * 0.2 * (y > 0 ? 1 : 0.92), z * 0.14 * (1 - 0.15 * y));
    }
    geo.computeVertexNormals();
    const ear = new THREE.Mesh(geo, skin);
    const d = new THREE.Vector3(s * 0.99, -0.06, -0.1).normalize();
    const p = restPoint(P, d.x, d.y, d.z, [0, 0, 0]);
    ear.position.set(p[0] + s * 0.005, p[1], p[2]);
    ear.scale.setScalar(k);
    ear.rotation.set(0, s > 0 ? -0.25 : Math.PI + 0.25, s * 0.06);
    g.add(ear);

    const lobe = ear.position.clone().add(V(s * 0.03 * k, -0.17 * k, 0.015));
    const e = cfg.ears.earrings;
    if (e !== "none") {
      let m: THREE.Object3D;
      if (e === "studs" || e === "pearls") {
        m = new THREE.Mesh(new THREE.SphereGeometry(e === "pearls" ? 0.034 : 0.022, 16, 12), e === "pearls" ? pearlMat() : metal);
        m.position.copy(lobe);
      } else if (e === "hoops" || e === "small-hoops") {
        const r = e === "hoops" ? 0.1 : 0.05;
        m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.011, 10, 36), metal);
        m.position.copy(lobe).add(V(0, -r + 0.01, 0));
        m.rotation.y = Math.PI / 2 + s * 0.3;
      } else if (e === "drops") {
        const grp = new THREE.Group();
        const stud = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), metal);
        const drop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 14), metal);
        drop.scale.set(0.8, 1.3, 0.8);
        drop.position.set(0, -0.09, 0);
        const link = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.06, 6), metal);
        link.position.set(0, -0.04, 0);
        grp.add(stud, link, drop);
        grp.position.copy(lobe);
        m = grp;
      } else {
        // cuff on the helix
        m = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 20, Math.PI * 1.4), metal);
        m.position.copy(ear.position).add(V(s * 0.03 * k, 0.12 * k, -0.04));
        m.rotation.y = Math.PI / 2;
      }
      g.add(m);
    }
  }
  return g;
}

let _pearl: THREE.Material | null = null;
function pearlMat() {
  return (_pearl ??= new THREE.MeshPhysicalMaterial({ color: "#f8f4ee", roughness: 0.2, clearcoat: 1, sheen: 1, sheenColor: new THREE.Color("#ffe9f2") }));
}

export function buildNosePiercing(cfg: AvatarConfig, P: HeadParams, metal: THREE.Material): THREE.Object3D | null {
  const t = cfg.nose.piercing;
  if (t === "none") return null;
  const n = P.nose;
  if (t === "stud") {
    const { p, n: nn } = surfaceFrame(P, dirFrom2D(n.wingX * 0.95, n.y - 0.03, [0, 0, 0]));
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), metal);
    m.position.set(p[0] + nn[0] * 0.006, p[1] + nn[1] * 0.006, p[2] + nn[2] * 0.006);
    return m;
  }
  const side = t === "ring" ? 1 : 0;
  const { p } = surfaceFrame(P, dirFrom2D(side * n.wingX * 0.9, n.y - n.ry * 0.9, [0, 0, 0]));
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 8, 24), metal);
  m.position.set(p[0], p[1] - 0.02, p[2] + 0.01);
  m.rotation.y = side ? Math.PI / 2 - 0.4 : 0;
  if (!side) m.rotation.x = Math.PI / 2 - 0.3;
  return m;
}

// ── Eyewear ──────────────────────────────────────────────────────────────────

function outline(style: AvatarConfig["eyewear"]["style"], side: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const N = 48;
  const rr = (w: number, h: number, r: number) => {
    // rounded rectangle via superellipse
    const e = 2 / (r * 10 + 0.001) + 2;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      pts.push(new THREE.Vector2(Math.sign(c) * Math.pow(Math.abs(c), 2 / e) * w, Math.sign(s) * Math.pow(Math.abs(s), 2 / e) * h));
    }
  };
  switch (style) {
    case "round":
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        pts.push(new THREE.Vector2(Math.cos(a) * 0.19, Math.sin(a) * 0.19));
      }
      break;
    case "square":
      rr(0.22, 0.16, 0.25);
      break;
    case "oversized":
      rr(0.27, 0.22, 0.45);
      break;
    case "rimless":
      rr(0.21, 0.15, 0.5);
      break;
    case "aviator":
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        const y = s > 0 ? s * 0.15 : s * 0.22;
        const x = c * 0.22 + (s < 0 ? side * 0.03 * -s : 0);
        pts.push(new THREE.Vector2(x, y + 0.01));
      }
      break;
    case "cat-eye":
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        const outer = c * side > 0 ? 1 : 0;
        const lift = outer * Math.max(0, s) * Math.abs(c) * 0.16;
        pts.push(new THREE.Vector2(c * 0.22, s * (s > 0 ? 0.15 : 0.13) + lift));
      }
      break;
    default:
      rr(0.2, 0.15, 0.3);
  }
  return pts;
}

export function buildEyewear(
  cfg: AvatarConfig,
  P: HeadParams,
  eyeCenters: THREE.Vector3[],
  eyeRadius: number,
): { group: THREE.Group; materials: THREE.Material[] } | null {
  const style = cfg.eyewear.style;
  if (style === "none") return null;
  const g = new THREE.Group();
  const metal = style === "aviator" || style === "rimless";
  const frameMat = new THREE.MeshPhysicalMaterial({
    color: cfg.eyewear.frameColor,
    roughness: metal ? 0.25 : 0.35,
    metalness: metal ? 0.8 : 0,
    clearcoat: 0.6,
  });
  const tint = cfg.eyewear.tint;
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: cfg.eyewear.lensColor,
    transparent: true,
    opacity: 0.1 + 0.78 * tint,
    roughness: 0.05,
    metalness: 0,
    clearcoat: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const frameR = style === "oversized" ? 0.024 : style === "rimless" ? 0.006 : 0.017;
  const zFront = Math.max(...eyeCenters.map((c) => c.z)) + eyeRadius * 1.2 + 0.06;
  const lensCenters: THREE.Vector3[] = [];

  const bend = (x: number) => -0.28 * x * x;
  if (style === "sport") {
    // single wrap-around shield
    const w = 0.66, h = 0.2;
    const shape = new THREE.Shape();
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, x = -w + 2 * w * t;
      pts.push(new THREE.Vector2(x, h - 0.03 * Math.cos(t * Math.PI * 2)));
    }
    for (let i = 40; i >= 0; i--) {
      const t = i / 40, x = -w + 2 * w * t;
      const nose = Math.exp(-(x * x) / 0.006) * 0.1;
      pts.push(new THREE.Vector2(x, -h + nose + 0.04 * Math.abs(x)));
    }
    shape.setFromPoints(pts);
    const geo = new THREE.ShapeGeometry(shape, 24);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, zFront + bend(pos.getX(i)) * 1.6);
    geo.computeVertexNormals();
    const cy = eyeCenters[0].y + 0.02;
    geo.translate(0, cy, 0);
    const lens = new THREE.Mesh(geo, lensMat);
    lens.renderOrder = 20;
    g.add(lens);
    const top = new THREE.CatmullRomCurve3(pts.slice(0, 41).map((p) => V(p.x, p.y + cy, zFront + bend(p.x) * 1.6)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(top, 60, 0.02, 8), frameMat));
    lensCenters.push(V(-w, cy, zFront + bend(w) * 1.6), V(w, cy, zFront + bend(w) * 1.6));
  } else {
    for (let i = 0; i < eyeCenters.length; i++) {
      const c = eyeCenters[i];
      const side = c.x > 0 ? 1 : -1;
      const pts = outline(style, side);
      const cx = c.x + side * 0.015, cy = c.y + 0.01;
      lensCenters.push(V(cx, cy, zFront + bend(cx)));
      const shape = new THREE.Shape(pts);
      const lg = new THREE.ShapeGeometry(shape, 24);
      const lp = lg.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j < lp.count; j++) {
        const x = lp.getX(j) + cx;
        lp.setXYZ(j, x, lp.getY(j) + cy, zFront + bend(x) + 0.004);
      }
      lg.computeVertexNormals();
      const lens = new THREE.Mesh(lg, lensMat);
      lens.renderOrder = 20;
      g.add(lens);
      if (style !== "rimless" || true) {
        const curve = new THREE.CatmullRomCurve3(
          pts.map((p) => V(p.x + cx, p.y + cy, zFront + bend(p.x + cx))),
          true,
        );
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, frameR, 8, true), frameMat));
      }
      void i;
    }
    // bridge
    const [a, b] = lensCenters[0].x < lensCenters[1].x ? lensCenters : [lensCenters[1], lensCenters[0]];
    const bw = style === "oversized" ? 0.27 : style === "round" ? 0.19 : 0.22;
    const bridge = new THREE.CatmullRomCurve3([
      V(a.x + bw * 0.95, a.y + 0.04, a.z + 0.005),
      V(0, a.y + 0.075, zFront + 0.02),
      V(b.x - bw * 0.95, b.y + 0.04, b.z + 0.005),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(bridge, 20, frameR * 0.9, 8), frameMat));
    if (style === "aviator") {
      const top = new THREE.CatmullRomCurve3([V(a.x + 0.12, a.y + 0.17, a.z), V(0, a.y + 0.16, zFront + 0.015), V(b.x - 0.12, b.y + 0.17, b.z)]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(top, 20, 0.009, 6), frameMat));
    }
  }
  // temples to the ears
  for (const s of [-1, 1]) {
    const lc = lensCenters.find((c) => Math.sign(c.x) === s) ?? lensCenters[0];
    const hw = style === "sport" ? 0.02 : style === "oversized" ? 0.26 : 0.22;
    const start = V(lc.x + s * hw, lc.y + 0.05, lc.z - 0.02);
    const ear = restPoint(P, s * 0.99, 0.06, -0.08, [0, 0, 0]);
    const temple = new THREE.CatmullRomCurve3([start, V(s * (Math.abs(ear[0]) + 0.05), ear[1] + 0.06, start.z - 0.45), V(s * (Math.abs(ear[0]) + 0.05), ear[1] + 0.03, ear[2] - 0.05)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(temple, 24, frameR * 0.8 + 0.004, 6), frameMat));
  }
  return { group: g, materials: [frameMat, lensMat] };
}

// ── Headwear ─────────────────────────────────────────────────────────────────

export function buildHeadwear(cfg: AvatarConfig, P: HeadParams): { group: THREE.Group; materials: THREE.Material[] } | null {
  const style = cfg.headwear.style;
  if (style === "none") return null;
  const g = new THREE.Group();
  const color = new THREE.Color(cfg.headwear.color);
  const fabric = new THREE.MeshPhysicalMaterial({ color, roughness: 0.82, sheen: 0.6, sheenRoughness: 0.6, sheenColor: color.clone().lerp(new THREE.Color("#fff"), 0.4), side: THREE.DoubleSide });
  const dark = new THREE.MeshPhysicalMaterial({ color: color.clone().multiplyScalar(0.55), roughness: 0.7 });
  const mats: THREE.Material[] = [fabric, dark];
  const lift = 0.07; // sits on flattened hair

  const crown = (yFront: number, yBack: number, t: number, bump = 0) =>
    shell(
      P,
      (d) => {
        const edge = yFront + (yBack - yFront) * smooth(0.6, -0.6, d[2]);
        return d[1] > edge ? t + bump * smooth(edge, 1, d[1]) : -0.1;
      },
      { widthSeg: 96, heightSeg: 48, thetaLength: Math.PI * 0.62 },
    );

  const rimLoop = (yFront: number, yBack: number, out: number, n = 72) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      const y = yFront + (yBack - yFront) * smooth(0.6, -0.6, dz);
      const r = Math.sqrt(Math.max(0.05, 1 - y * y));
      const d = new THREE.Vector3(dx * r, y, dz * r).normalize();
      const p = restPoint(P, d.x, d.y, d.z, [0, 0, 0]);
      pts.push(V(p[0], p[1], p[2]).addScaledVector(d, out));
    }
    return new THREE.CatmullRomCurve3(pts, true);
  };

  switch (style) {
    case "beanie": {
      g.add(new THREE.Mesh(crown(0.5, 0.05, lift + 0.03, 0.22), fabric));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(rimLoop(0.5, 0.05, lift + 0.05), 120, 0.075, 12, true), dark));
      break;
    }
    case "cap": {
      g.add(new THREE.Mesh(crown(0.52, 0.12, lift + 0.02, 0.1), fabric));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(rimLoop(0.52, 0.12, lift + 0.03), 100, 0.02, 8, true), fabric));
      // brim
      const brim = new THREE.Shape();
      brim.absellipse(0, 0, 0.62, 0.55, Math.PI, Math.PI * 2, false, 0);
      const bg = new THREE.ExtrudeGeometry(brim, { depth: 0.025, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, curveSegments: 32 });
      bg.rotateX(Math.PI / 2);
      const top = restPoint(P, 0, 0.55, 0.84, [0, 0, 0]);
      bg.translate(0, top[1] + 0.02, top[2] - 0.08);
      const bp = bg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < bp.count; i++) bp.setY(i, bp.getY(i) - 0.12 * (bp.getX(i) ** 2) - 0.05 * Math.max(0, bp.getZ(i) - top[2]));
      bg.computeVertexNormals();
      g.add(new THREE.Mesh(bg, fabric));
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), fabric);
      const tp = restPoint(P, 0, 1, 0, [0, 0, 0]);
      btn.position.set(0, tp[1] + lift + 0.12, 0);
      g.add(btn);
      break;
    }
    case "bucket":
    case "fedora": {
      const fed = style === "fedora";
      g.add(new THREE.Mesh(crown(0.42, 0.2, lift + 0.05, fed ? 0.2 : 0.14), fabric));
      const profile = fed
        ? [new THREE.Vector2(1.02, 0), new THREE.Vector2(1.55, -0.02), new THREE.Vector2(1.62, 0.04)]
        : [new THREE.Vector2(1.02, 0), new THREE.Vector2(1.38, -0.2), new THREE.Vector2(1.45, -0.26)];
      const brim = new THREE.LatheGeometry(profile, 64);
      const y0 = restPoint(P, 0, 0.4, 0.9, [0, 0, 0])[1];
      brim.scale(P.sx * 1.05, 1, P.sz * 1.05);
      brim.translate(0, y0 + 0.02, -0.03);
      g.add(new THREE.Mesh(brim, fabric));
      if (fed) g.add(new THREE.Mesh(new THREE.TubeGeometry(rimLoop(0.47, 0.25, lift + 0.07), 100, 0.045, 8, true), dark));
      break;
    }
    case "beret": {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), fabric);
      const tp = restPoint(P, 0, 1, 0, [0, 0, 0]);
      b.scale.set(1.08, 0.3, 1.02);
      b.position.set(0.18, tp[1] - 0.05, -0.05);
      b.rotation.z = -0.28;
      g.add(b);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.07, 8), dark);
      stem.position.set(0.1, tp[1] + 0.26, -0.05);
      g.add(stem);
      break;
    }
    case "headband": {
      g.add(new THREE.Mesh(new THREE.TubeGeometry(rimLoop(0.62, 0.3, lift + 0.04), 110, 0.05, 10, true), fabric));
      break;
    }
    case "bandana": {
      g.add(new THREE.Mesh(crown(0.48, 0.05, lift + 0.035, 0.03), fabric));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(rimLoop(0.48, 0.05, lift + 0.05), 110, 0.035, 8, true), fabric));
      const knot = restPoint(P, 0, 0.1, -1, [0, 0, 0]);
      for (const s of [-1, 1]) {
        const tail = new THREE.CatmullRomCurve3([V(0, knot[1], knot[2] - 0.08), V(s * 0.12, knot[1] - 0.25, knot[2] - 0.15), V(s * 0.18, knot[1] - 0.5, knot[2] - 0.12)]);
        g.add(new THREE.Mesh(tube(tail, (t) => 0.06 * (1 - t * 0.5), 20, 8), fabric));
      }
      break;
    }
    case "turban": {
      g.add(new THREE.Mesh(crown(0.35, -0.1, lift + 0.1, 0.35), fabric));
      for (let i = 0; i < 4; i++) {
        const y = 0.38 + i * 0.13;
        g.add(new THREE.Mesh(new THREE.TubeGeometry(rimLoop(y, y - 0.35, lift + 0.12 + 0.03 * Math.sin(i), 64), 100, 0.08, 10, true), i % 2 ? dark : fabric));
      }
      break;
    }
    case "hijab": {
      // wraps the whole head except the face, drapes to the shoulders
      const faceHole = (d: number[]) => {
        const [x, y, z] = d;
        const f = Math.hypot(x / 0.72, (y + 0.2) / 0.78);
        return z > 0.05 ? smooth(0.98, 1.05, f) : 1;
      };
      g.add(new THREE.Mesh(shell(P, (d) => -0.1 + (lift + 0.2) * faceHole(d), { widthSeg: 120, heightSeg: 90 }), fabric));
      g.add(
        new THREE.Mesh(
          curtain({
            thetaTop: 2.55,
            thetaBottom: 3.14,
            yTop: -0.3,
            yBottom: -2.3,
            radius: (y) => 1.1 + 0.35 * smooth(-0.6, -2.0, y),
            ripple: (th, y) => 0.02 * Math.sin(th * 6 + y * 2),
            zShift: (y) => 0.05 * smooth(-0.8, -1.8, y),
            cols: 90,
            rows: 40,
          }),
          fabric,
        ),
      );
      break;
    }
    case "headphones": {
      const band = new THREE.CatmullRomCurve3(
        Array.from({ length: 21 }, (_, i) => {
          const a = Math.PI * (i / 20);
          const d = new THREE.Vector3(Math.cos(a), Math.sin(a), -0.05).normalize();
          const p = restPoint(P, d.x, d.y, d.z, [0, 0, 0]);
          return V(p[0], p[1], p[2]).addScaledVector(d, 0.13);
        }),
      );
      g.add(new THREE.Mesh(new THREE.TubeGeometry(band, 60, 0.045, 10), fabric));
      for (const s of [-1, 1]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 32), fabric);
        const p = restPoint(P, s, 0, -0.05, [0, 0, 0]);
        cup.position.set(p[0] + s * 0.12, p[1], p[2]);
        cup.rotation.z = Math.PI / 2;
        const pad = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 10, 32), dark);
        pad.position.set(p[0] + s * 0.04, p[1], p[2]);
        pad.rotation.y = Math.PI / 2;
        g.add(cup, pad);
      }
      break;
    }
  }
  return { group: g, materials: mats };
}
