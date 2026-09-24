/**
 * Eyebrows: a lofted, flattened tube following a style curve on the forehead
 * surface. Rebuilt when expression weights change (cheap: ~250 vertices).
 */
import * as THREE from "three";
import type { AvatarConfig, BrowStyle } from "../schema";
import { BROW_Y, dirFrom2D, surfaceFrame, type HeadParams } from "./head";
import { gauss, lerp, noise3 } from "./math";

const STYLES: Record<Exclude<BrowStyle, "none">, { len: number; arch: number; peak: number; tIn: number; tOut: number; drop: number; ragged: number }> = {
  natural: { len: 0.36, arch: 0.045, peak: 0.6, tIn: 0.056, tOut: 0.03, drop: 0.02, ragged: 0 },
  thin: { len: 0.34, arch: 0.05, peak: 0.62, tIn: 0.03, tOut: 0.018, drop: 0.02, ragged: 0 },
  thick: { len: 0.37, arch: 0.035, peak: 0.6, tIn: 0.082, tOut: 0.05, drop: 0.015, ragged: 0 },
  arched: { len: 0.34, arch: 0.085, peak: 0.55, tIn: 0.05, tOut: 0.024, drop: 0.035, ragged: 0 },
  straight: { len: 0.36, arch: 0.008, peak: 0.6, tIn: 0.056, tOut: 0.042, drop: 0.005, ragged: 0 },
  bushy: { len: 0.38, arch: 0.03, peak: 0.6, tIn: 0.092, tOut: 0.066, drop: 0.02, ragged: 1 },
  angled: { len: 0.35, arch: 0.07, peak: 0.72, tIn: 0.06, tOut: 0.026, drop: 0.05, ragged: 0 },
};

export interface BrowWeights {
  innerUp: number;
  down: number;
  outerUp: number;
}

const N = 26;
const RING = 8;

export class BrowRig {
  readonly mesh: THREE.Mesh;
  private style: (typeof STYLES)[keyof typeof STYLES] | null;
  private weight: number;
  private key = "";

  constructor(private side: 1 | -1, cfg: AvatarConfig, private P: HeadParams, mat: THREE.Material) {
    this.style = cfg.brows.style === "none" ? null : STYLES[cfg.brows.style];
    this.weight = 0.6 + cfg.brows.weight * 0.8;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * RING * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++)
      for (let j = 0; j < RING; j++) {
        const a = i * RING + j, b = i * RING + ((j + 1) % RING), c = (i + 1) * RING + j, d = (i + 1) * RING + ((j + 1) % RING);
        idx.push(a, c, b, b, c, d);
      }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = !!this.style;
    this.update({ innerUp: 0, down: 0, outerUp: 0 });
  }

  update(w: BrowWeights) {
    if (!this.style) return;
    const key = `${w.innerUp.toFixed(2)}|${w.down.toFixed(2)}|${w.outerUp.toFixed(2)}`;
    if (key === this.key) return;
    this.key = key;
    const st = this.style;
    const s = this.side;
    const pos = (this.mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const d = [0, 0, 0];
    const T = new THREE.Vector3();
    let prev: THREE.Vector3 | null = null;
    const pts: { c: THREE.Vector3; n: THREE.Vector3; h: number }[] = [];

    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const inner = 0.12 - w.down * 0.02;
      const x = s * (inner + st.len * t);
      let y = BROW_Y + 0.015;
      y += st.arch * Math.sin(Math.PI * Math.min(1, t / (st.peak * 2))) - st.drop * t * t;
      y += 0.075 * w.innerUp * Math.pow(1 - t, 1.6);
      y -= 0.05 * w.down * (0.6 + 0.4 * (1 - t));
      y += 0.06 * w.outerUp * Math.pow(t, 1.5);
      const taper = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.5 + 0.02 + (t > 0.5 ? (t - 0.5) : 0))), 0.5);
      let h = lerp(st.tIn, st.tOut, t) * this.weight * Math.min(1, Math.pow(t / 0.08, 0.5)) * Math.pow(1 - t, 0.45) * 1.25;
      if (st.ragged) h *= 1 + 0.25 * noise3(x * 20, y * 20, s);
      h = Math.max(0.002, h * (0.85 + 0.15 * taper));
      dirFrom2D(x, y, d);
      const { p, n } = surfaceFrame(this.P, d);
      const c = new THREE.Vector3(p[0], p[1], p[2]);
      const nn = new THREE.Vector3(n[0], n[1], n[2]);
      c.addScaledVector(nn, 0.012 + 0.01 * gauss(t, 0, 0.3, 0, 0.4, 1));
      pts.push({ c, n: nn, h });
      prev = c;
    }
    void prev;

    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)].c, b = pts[Math.min(N - 1, i + 1)].c;
      T.subVectors(b, a).normalize();
      const { c, n, h } = pts[i];
      const U = new THREE.Vector3().crossVectors(n, T).normalize().multiplyScalar(s);
      const depth = 0.016 + h * 0.18;
      for (let j = 0; j < RING; j++) {
        const phi = (j / RING) * Math.PI * 2;
        const k = (i * RING + j) * 3;
        const v = c.clone().addScaledVector(U, Math.cos(phi) * h * 0.5).addScaledVector(n, Math.sin(phi) * depth);
        pos[k] = v.x;
        pos[k + 1] = v.y;
        pos[k + 2] = v.z;
      }
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
}
