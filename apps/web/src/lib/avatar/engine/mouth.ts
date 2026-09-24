/**
 * Mouth rig. Lips, mouth cavity, teeth and tongue are regenerated from a 2D
 * mouth model every time expression weights change, then mapped onto the
 * sculpted head surface — including the same skin morph displacement as the
 * head mesh, so lips stay glued to the skin. Teeth/tongue are clipped to the
 * cavity with the stencil buffer.
 */
import * as THREE from "three";
import type { AvatarConfig, MouthShape } from "../schema";
import { MOUTH_Y, dirFrom2D, restPoint, surfaceFrame, totalDisplacement, type HeadParams, type MorphWeights } from "./head";
import { clamp } from "./math";

const SHAPES: Record<MouthShape, { W: number; tu: number; tl: number; bow: number; bulge: number }> = {
  full: { W: 0.27, tu: 0.05, tl: 0.07, bow: 0.35, bulge: 0.03 },
  thin: { W: 0.26, tu: 0.028, tl: 0.04, bow: 0.2, bulge: 0.02 },
  wide: { W: 0.32, tu: 0.042, tl: 0.058, bow: 0.25, bulge: 0.026 },
  heart: { W: 0.24, tu: 0.06, tl: 0.062, bow: 0.65, bulge: 0.03 },
  small: { W: 0.21, tu: 0.042, tl: 0.056, bow: 0.35, bulge: 0.026 },
  bow: { W: 0.25, tu: 0.05, tl: 0.055, bow: 0.8, bulge: 0.028 },
};

export type MouthWeights = Record<
  | "jawOpen"
  | "mouthClose"
  | "mouthFunnel"
  | "mouthPucker"
  | "mouthLeft"
  | "mouthRight"
  | "mouthSmileLeft"
  | "mouthSmileRight"
  | "mouthFrownLeft"
  | "mouthFrownRight"
  | "mouthStretchLeft"
  | "mouthStretchRight"
  | "mouthRollLower"
  | "mouthRollUpper"
  | "mouthPressLeft"
  | "mouthPressRight"
  | "mouthLowerDownLeft"
  | "mouthLowerDownRight"
  | "mouthUpperUpLeft"
  | "mouthUpperUpRight"
  | "mouthShrugLower"
  | "mouthShrugUpper"
  | "mouthDimpleLeft"
  | "mouthDimpleRight",
  number
>;

const U = 29; // samples across the mouth
const LIP_ROWS = 7;
const CAV_ROWS = 6;

function gridGeometry(cols: number, rows: number, flip = false): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cols * rows * 3), 3));
  const uv = new Float32Array(cols * rows * 2);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    uv[(r * cols + c) * 2] = c / (cols - 1);
    uv[(r * cols + c) * 2 + 1] = 1 - r / (rows - 1);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    if (flip) idx.push(a, b, d, b, e, d);
    else idx.push(a, d, b, b, d, e);
  }
  g.setIndex(idx);
  return g;
}

export class MouthRig {
  readonly group = new THREE.Group();
  private upperLip: THREE.Mesh;
  private lowerLip: THREE.Mesh;
  private cavity: THREE.Mesh;
  private teethUp: THREE.Mesh;
  private teethLow: THREE.Mesh;
  private tongue: THREE.Mesh;
  private seam: THREE.Mesh;
  private shape: (typeof SHAPES)[MouthShape];
  private key = "";
  private d = [0, 0, 0];
  private p = [0, 0, 0];
  private disp = [0, 0, 0];

  constructor(
    cfg: AvatarConfig,
    private P: HeadParams,
    mats: { lip: THREE.Material; cavity: THREE.Material; teeth: THREE.Material; tongue: THREE.Material; seam: THREE.Material },
  ) {
    this.shape = SHAPES[cfg.mouth.shape];
    this.upperLip = new THREE.Mesh(gridGeometry(U, LIP_ROWS, true), mats.lip);
    this.lowerLip = new THREE.Mesh(gridGeometry(U, LIP_ROWS), mats.lip);
    this.cavity = new THREE.Mesh(gridGeometry(U, CAV_ROWS), mats.cavity);
    this.teethUp = new THREE.Mesh(gridGeometry(U, 3), mats.teeth);
    this.teethLow = new THREE.Mesh(gridGeometry(U, 3), mats.teeth);
    this.tongue = new THREE.Mesh(gridGeometry(U, 4), mats.tongue);
    this.seam = new THREE.Mesh(gridGeometry(U, 2), mats.seam);
    this.seam.renderOrder = 14;
    this.seam.frustumCulled = false;
    this.group.add(this.seam);
    this.cavity.renderOrder = 10;
    this.tongue.renderOrder = 11;
    this.teethUp.renderOrder = 12;
    this.teethLow.renderOrder = 12;
    this.upperLip.renderOrder = 13;
    this.lowerLip.renderOrder = 13;
    for (const m of [this.cavity, this.tongue, this.teethUp, this.teethLow, this.upperLip, this.lowerLip]) m.frustumCulled = false;
    this.group.add(this.cavity, this.tongue, this.teethUp, this.teethLow, this.upperLip, this.lowerLip);
  }

  /** Map a 2D mouth point to 3D: rest surface + skin morph + offset along normal. */
  private map(x: number, y: number, jawW: number, offset: number, head: MorphWeights, out: Float32Array, k: number) {
    const d = dirFrom2D(x, y, this.d);
    const p = restPoint(this.P, d[0], d[1], d[2], this.p);
    totalDisplacement(d, p, head, this.disp, jawW);
    let nx = d[0], ny = d[1], nz = d[2];
    if (offset !== 0) {
      const f = surfaceFrame(this.P, d);
      nx = f.n[0];
      ny = f.n[1];
      nz = f.n[2];
    }
    out[k] = p[0] + this.disp[0] + nx * offset;
    out[k + 1] = p[1] + this.disp[1] + ny * offset;
    out[k + 2] = p[2] + this.disp[2] + nz * offset;
  }

  update(w: MouthWeights, head: MorphWeights) {
    const key = Object.values(w).map((v) => v.toFixed(2)).join(",") + "|" + Object.values(head).map((v) => (v ?? 0).toFixed(2)).join(",");
    if (key === this.key) return;
    this.key = key;

    const S = this.shape;
    const jaw = clamp(w.jawOpen);
    const close = clamp(w.mouthClose);
    const pucker = clamp(w.mouthPucker);
    const funnel = clamp(w.mouthFunnel);
    const press = (w.mouthPressLeft + w.mouthPressRight) / 2;
    const upUp = (w.mouthUpperUpLeft + w.mouthUpperUpRight) / 2;
    const lowDown = (w.mouthLowerDownLeft + w.mouthLowerDownRight) / 2;
    const shift = (w.mouthLeft - w.mouthRight) * 0.07;
    const tu = S.tu * (1 - 0.7 * w.mouthRollUpper - 0.35 * press + 0.35 * pucker);
    const tl = S.tl * (1 - 0.7 * w.mouthRollLower - 0.35 * press + 0.35 * pucker) * (1 + 0.2 * w.mouthShrugLower);
    const bulge = S.bulge * (1 + 1.2 * pucker + 0.5 * funnel);
    const lowerJaw = 1 - 0.85 * close;

    const jawT = new Float32Array(U);
    for (let i = 0; i < U; i++) {
      const u = (i / (U - 1)) * 2 - 1;
      jawT[i] = lowerJaw * Math.pow(Math.max(0, 1 - u * u), 0.45);
    }
    const xs = new Float32Array(U);
    const seamU = new Float32Array(U);
    const seamL = new Float32Array(U);
    const outU = new Float32Array(U);
    const outL = new Float32Array(U);
    const taper = new Float32Array(U);

    for (let i = 0; i < U; i++) {
      const u = (i / (U - 1)) * 2 - 1;
      const side = u >= 0 ? 1 : -1; // +x = avatar's left
      const smile = Math.min(1, (side > 0 ? w.mouthSmileLeft : w.mouthSmileRight) + 0.22);
      const frown = side > 0 ? w.mouthFrownLeft : w.mouthFrownRight;
      const stretch = side > 0 ? w.mouthStretchLeft : w.mouthStretchRight;
      const dimple = side > 0 ? w.mouthDimpleLeft : w.mouthDimpleRight;
      const width = S.W * (1 + 0.14 * smile + 0.2 * stretch + 0.06 * dimple - 0.38 * pucker - 0.26 * funnel);
      const au = Math.abs(u);
      const t = Math.pow(Math.max(0, 1 - u * u), 0.55);
      taper[i] = t;
      xs[i] = u * width + shift;
      const lift = (0.1 * smile - 0.075 * frown + 0.03) * Math.pow(au, 1.8) + 0.012 * w.mouthShrugUpper;
      const seam = MOUTH_Y + lift;
      const open = Math.pow(Math.max(0, 1 - u * u), 0.8);
      seamU[i] = seam + (0.045 * upUp + 0.022 * funnel) * open;
      seamL[i] = seam - (0.016 * jaw * lowerJaw + 0.045 * lowDown + 0.05 * funnel) * open;
      const cupid = 0.35 * Math.exp(-((au - 0.28) ** 2) / 0.02) - 0.5 * Math.exp(-(u * u) / 0.006);
      outU[i] = seamU[i] + tu * t * (1 + S.bow * cupid);
      outL[i] = seamL[i] - tl * Math.pow(Math.max(0, 1 - u * u), 0.5);
    }

    const forward = 0.004;
    // Lips: rows go from inner (curled into the mouth) to outer edge
    const lipFill = (mesh: THREE.Mesh, upper: boolean) => {
      const arr = (mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let r = 0; r < LIP_ROWS; r++) {
        const tt = r / (LIP_ROWS - 1); // 0 = seam side, 1 = outer
        const s = -0.18 + tt * 1.18; // start slightly inside the seam
        for (let i = 0; i < U; i++) {
          const seam = upper ? seamU[i] : seamL[i];
          const edge = upper ? outU[i] : outL[i];
          const y = seam + (edge - seam) * Math.max(0, s) + (s < 0 ? (upper ? -1 : 1) * s * 0.01 : 0);
          const prof = s < 0 ? 0.35 : Math.pow(1 - tt, 0.4) * (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, s)));
          const off = forward + bulge * taper[i] * prof * (upper ? 1 : 1.12) - (s < 0 ? 0.006 : 0);
          this.map(xs[i], y, upper ? 0 : jawT[i], off, head, arr, (r * U + i) * 3);
        }
      }
      mesh.geometry.attributes.position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    };
    lipFill(this.upperLip, true);
    lipFill(this.lowerLip, false);

    // Cavity between the seams (jaw weight interpolates upper→lower)
    {
      const arr = (this.cavity.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let r = 0; r < CAV_ROWS; r++) {
        const s = r / (CAV_ROWS - 1);
        for (let i = 0; i < U; i++) {
          const y = seamU[i] + (seamL[i] - seamU[i]) * s;
          const ov = Math.min(0.012, (jaw * lowerJaw + funnel + upUp + lowDown) * 0.03);
          this.map(xs[i] * 0.985, y + (r === 0 ? ov : r === CAV_ROWS - 1 ? -ov : 0), s * jawT[i], forward + 0.004, head, arr, (r * U + i) * 3);
        }
      }
      this.cavity.geometry.attributes.position.needsUpdate = true;
      this.cavity.geometry.computeVertexNormals();
    }

    // Teeth: upper row hangs from under the upper lip; lower row sits on the jaw
    const teeth = (mesh: THREE.Mesh, upper: boolean) => {
      const arr = (mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let r = 0; r < 3; r++) {
        const s = r / 2;
        for (let i = 0; i < U; i++) {
          const u = (i / (U - 1)) * 2 - 1;
          const x = xs[i] * 0.56;
          const top = upper ? seamU[i] + 0.012 : seamL[i] + 0.05 * Math.pow(Math.max(0, 1 - u * u), 0.5);
          const h = upper ? 0.068 : 0.06;
          const y = top - h * s;
          this.map(x, y, upper ? 0 : jawT[i], forward + 0.006, head, arr, (r * U + i) * 3);
        }
      }
      mesh.geometry.attributes.position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    };
    teeth(this.teethUp, true);
    teeth(this.teethLow, false);

    {
      const arr = (this.tongue.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let r = 0; r < 4; r++) {
        const s = r / 3;
        for (let i = 0; i < U; i++) {
          const u = (i / (U - 1)) * 2 - 1;
          const x = xs[i] * 0.55;
          const y = seamL[i] + 0.03 - s * 0.07 + 0.02 * (1 - u * u);
          this.map(x, y, jawT[i], forward + 0.005, head, arr, (r * U + i) * 3);
        }
      }
      this.tongue.geometry.attributes.position.needsUpdate = true;
      this.tongue.geometry.computeVertexNormals();
    }
    {
      // closed-mouth line: a thin dark ribbon along the seam, fading at the corners
      const arr = (this.seam.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < U; i++) {
          const mid = (seamU[i] + seamL[i]) / 2;
          const h = 0.006 * taper[i] + 0.002;
          this.map(xs[i] * 1.01, mid + (r === 0 ? h : -h), jawT[i] * 0.5, forward + bulge * taper[i] * 0.62 + 0.001, head, arr, (r * U + i) * 3);
        }
      this.seam.geometry.attributes.position.needsUpdate = true;
      this.seam.visible = jaw < 0.12;
    }
    for (const m of [this.upperLip, this.lowerLip, this.cavity, this.teethUp, this.teethLow, this.tongue, this.seam]) m.geometry.computeBoundingSphere();
  }
}

/** Materials for cavity/teeth/tongue with stencil clipping set up. */
export function mouthMaterials(teethMap: THREE.Texture) {
  const cavity = new THREE.MeshStandardMaterial({ color: "#5a1a22", roughness: 1, metalness: 0 });
  cavity.polygonOffset = true;
  cavity.polygonOffsetFactor = -2;
  cavity.polygonOffsetUnits = -2;
  cavity.stencilWrite = true;
  cavity.stencilRef = 1;
  cavity.stencilFunc = THREE.AlwaysStencilFunc;
  cavity.stencilZPass = THREE.ReplaceStencilOp;
  cavity.side = THREE.DoubleSide;

  const clip = <M extends THREE.Material>(m: M): M => {
    m.stencilWrite = true;
    m.stencilRef = 1;
    m.stencilFunc = THREE.EqualStencilFunc;
    m.stencilFail = THREE.KeepStencilOp;
    m.stencilZFail = THREE.KeepStencilOp;
    m.stencilZPass = THREE.KeepStencilOp;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -3;
    m.polygonOffsetUnits = -3;
    m.side = THREE.DoubleSide;
    return m;
  };
  const teeth = clip(new THREE.MeshStandardMaterial({ map: teethMap, roughness: 0.35, metalness: 0 }));
  const tongue = clip(new THREE.MeshStandardMaterial({ color: "#c65b66", roughness: 0.55 }));
  const seam = new THREE.MeshBasicMaterial({ color: "#5a2a2a", transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  return { cavity, teeth, tongue, seam };
}
