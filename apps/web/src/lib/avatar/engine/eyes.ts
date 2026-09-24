/**
 * Eye rig: glossy eyeball (planar iris), skin eyelids that rotate to blink,
 * lash line + lashes by style, eye-shape dependent opening and tilt.
 */
import * as THREE from "three";
import type { AvatarConfig, EyeShape } from "../schema";
import { EYE_X, EYE_Y, dirFrom2D, surfaceFrame, type HeadParams } from "./head";
import { lerp } from "./math";

const SHAPES: Record<EyeShape, { up: number; low: number; tilt: number }> = {
  round: { up: 0.82, low: 0.86, tilt: 0 },
  almond: { up: 0.68, low: 0.74, tilt: 0.05 },
  hooded: { up: 0.5, low: 0.76, tilt: 0 },
  upturned: { up: 0.68, low: 0.66, tilt: 0.18 },
  downturned: { up: 0.64, low: 0.8, tilt: -0.15 },
  monolid: { up: 0.5, low: 0.7, tilt: 0.05 },
};

export interface EyeWeights {
  blink: number;
  wide: number;
  squint: number;
  lookIn: number;
  lookOut: number;
  lookUp: number;
  lookDown: number;
}

function planarEyeGeometry(r: number): THREE.SphereGeometry {
  const g = new THREE.SphereGeometry(r, 48, 36);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const k = 1.18;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / r, y = pos.getY(i) / r, z = pos.getZ(i) / r;
    if (z > 0) uv.setXY(i, (x / k) * 0.5 + 0.5, (y / k) * 0.5 + 0.5);
    else uv.setXY(i, 0.02, 0.02);
  }
  uv.needsUpdate = true;
  return g;
}

export class EyeRig {
  readonly group = new THREE.Group();
  private ball: THREE.Mesh;
  private lids = new THREE.Group();
  private upper = new THREE.Group();
  private lower = new THREE.Group();
  private shape: { up: number; low: number; tilt: number };
  private side: number;
  readonly radius: number;
  readonly center = new THREE.Vector3();

  constructor(
    side: 1 | -1,
    cfg: AvatarConfig,
    P: HeadParams,
    mats: { eye: THREE.Material; lid: THREE.Material; lash: THREE.Material; highlight: THREE.Material; crease: THREE.Material },
  ) {
    this.side = side;
    this.shape = SHAPES[cfg.eyes.shape];
    const re = 0.2 * (0.86 + cfg.eyes.size * 0.3);
    this.radius = re;

    const d = dirFrom2D(side * EYE_X, EYE_Y, [0, 0, 0]);
    const { p, n } = surfaceFrame(P, d);
    const N = new THREE.Vector3(n[0], n[1], n[2]);
    this.center.set(p[0], p[1], p[2]).addScaledVector(N, -re * 0.12);
    this.group.position.copy(this.center);
    // Face mostly forward with a hint of the surface normal
    const fwd = N.clone().lerp(new THREE.Vector3(0, 0, 1), 0.85).normalize();
    this.group.lookAt(this.center.clone().add(fwd));

    this.ball = new THREE.Mesh(planarEyeGeometry(re), mats.eye);
    this.group.add(this.ball);

    // Catch-light fixed in eye space (doesn't follow gaze) — the Memoji sparkle
    const hl = new THREE.Mesh(new THREE.CircleGeometry(re * 0.15, 20), mats.highlight);
    hl.position.set(-re * 0.3 * side * -1, re * 0.34, re * 0.965);
    hl.lookAt(hl.position.clone().multiplyScalar(2));
    hl.renderOrder = 3;
    this.group.add(hl);

    const rl = re * 1.045;
    const upperLid = new THREE.Mesh(new THREE.SphereGeometry(rl, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), mats.lid);
    const lowerLid = new THREE.Mesh(
      new THREE.SphereGeometry(re * 1.012, 48, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      mats.lid,
    );
    // Lid rims give the lids some thickness at the opening
    const rimU = new THREE.Mesh(new THREE.TorusGeometry(rl, re * 0.045, 10, 64), mats.lid);
    rimU.rotation.x = Math.PI / 2;
    const rimL = new THREE.Mesh(new THREE.TorusGeometry(re * 1.02, re * 0.03, 10, 64), mats.lid);
    rimL.rotation.x = Math.PI / 2;
    this.upper.add(upperLid);
    void rimU;
    this.lower.add(lowerLid);
    void rimL;
    this.addLashes(cfg, rl, mats.lash);
    const crease = new THREE.Mesh(new THREE.TorusGeometry(rl * 1.02, re * 0.035, 8, 40, Math.PI * 0.8), mats.crease);
    crease.rotation.set(-0.95, 0, Math.PI * 0.1);
    crease.position.set(0, re * 0.05, 0);
    this.lids.add(this.upper, this.lower, crease);
    this.lids.rotation.z = this.shape.tilt * side;
    this.group.add(this.lids);
    this.update({ blink: 0, wide: 0, squint: 0, lookIn: 0, lookOut: 0, lookUp: 0, lookDown: 0 });
  }

  private addLashes(cfg: AvatarConfig, rl: number, mat: THREE.Material) {
    const style = cfg.eyes.lashes;
    const arc = (a0: number, a1: number, y = 0, r = rl * 1.02) =>
      new THREE.CatmullRomCurve3(
        Array.from({ length: 13 }, (_, i) => {
          const a = lerp(a0, a1, i / 12);
          return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
        }),
      );
    const liner = style === "none" ? 0.008 : style === "dramatic" || style === "winged" ? 0.02 : 0.015;
    if (liner > 0) {
      const line = new THREE.Mesh(new THREE.TubeGeometry(arc(-1.25, 1.25), 40, liner, 6), mat);
      this.upper.add(line);
    }
    if (style === "winged") {
      // outer corner is at +x for side=+1 in eye space after lookAt? keep symmetric: extend toward outer side
      const s = this.side;
      const a = 1.2 * s;
      const start = new THREE.Vector3(Math.sin(a) * rl * 1.02, 0, Math.cos(a) * rl * 1.02);
      const wing = new THREE.CatmullRomCurve3([
        start,
        start.clone().add(new THREE.Vector3(0.05 * s, 0.025, -0.01)),
        start.clone().add(new THREE.Vector3(0.095 * s, 0.06, -0.025)),
      ]);
      const g = new THREE.TubeGeometry(wing, 12, 0.012, 6);
      this.upper.add(new THREE.Mesh(g, mat));
    }
    const count = { none: 0, natural: 7, long: 9, dramatic: 12, winged: 8 }[style];
    const len = { none: 0, natural: 0.032, long: 0.055, dramatic: 0.07, winged: 0.045 }[style];
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const a = lerp(-1.1, 1.1, t);
      const base = new THREE.Vector3(Math.sin(a) * rl * 1.03, 0.004, Math.cos(a) * rl * 1.03);
      const outward = base.clone().setY(0).normalize();
      // longer towards the outer corner
      const outerBias = this.side > 0 ? t : 1 - t;
      const l = len * (0.7 + 0.6 * outerBias);
      const dir = outward.multiplyScalar(0.55).add(new THREE.Vector3(0, 0.85, 0)).normalize();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.0065, l, 5), mat);
      cone.position.copy(base).addScaledVector(dir, l / 2);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.upper.add(cone);
    }
    if (style === "dramatic") {
      for (let i = 0; i < 5; i++) {
        const a = lerp(-0.8, 0.8, (i + 0.5) / 5);
        const base = new THREE.Vector3(Math.sin(a) * rl * 1.02, 0, Math.cos(a) * rl * 1.02);
        const dir = base.clone().setY(0).normalize().multiplyScalar(0.6).add(new THREE.Vector3(0, -0.8, 0)).normalize();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.03, 5), mat);
        cone.position.copy(base).addScaledVector(dir, 0.015);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        this.lower.add(cone);
      }
    }
  }

  update(w: EyeWeights) {
    const s = this.shape;
    const lowerAngle = s.low - w.squint * 0.32 - w.lookUp * 0.05 + w.lookDown * 0.08;
    const openUpper = -s.up - w.wide * 0.3 + w.squint * 0.12 + w.lookDown * 0.22 - w.lookUp * 0.12;
    const upperAngle = lerp(openUpper, lowerAngle + 0.02, Math.min(1, w.blink));
    this.upper.rotation.x = upperAngle;
    this.lower.rotation.x = lowerAngle;
    // gaze: "in" = towards the nose
    const yaw = (w.lookOut - w.lookIn) * 0.45 * this.side;
    const pitch = (w.lookUp - w.lookDown) * 0.35;
    this.ball.rotation.set(-pitch, yaw, 0);
  }
}
