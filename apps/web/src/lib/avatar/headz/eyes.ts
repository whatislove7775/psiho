/**
 * Rigid eyes for the HEADZ avatars — how real eyes (and Memoji) work.
 *
 * The purchased eye meshes are driven by eyeLook* shape keys that are neither
 * symmetric nor linear: they smear the iris across the sclera and the two eyes
 * disagree. We hide them and build our own eyeballs: per eye a container at the
 * fitted eyeball centre (scaled to the socket), a pivot that ROTATES, and on it
 *   - the sclera (sphere with a hole where the iris sits),
 *   - the iris: a slightly concave disc recessed into the sphere,
 *   - the cornea: a bulging clear cap, rendered additively — only its specular
 *     reflections show, so the catch-light stays put relative to the lights
 *     while the eye turns under it.
 * Gaze = ONE yaw/pitch for both pivots (+ ≤1° vergence), eased by a critically
 * damped spring (no overshoot). Nothing on the eyes is a shape key.
 */
import * as THREE from "three";

export const MAX_YAW = THREE.MathUtils.degToRad(30);
export const MAX_PITCH = THREE.MathUtils.degToRad(20);
/**
 * Per-eye inward rotation. The HEADZ irises are authored slightly toward the nose
 * relative to the lid opening, which reads as a squint on camera; a tiny outward
 * set (−1.5°, within the ±2° physiological vergence) centres them in the opening.
 */
export const VERGENCE = THREE.MathUtils.degToRad(-1.5);

/** Rotations of the left (+X) and right eye pivots for a shared gaze vector h, v ∈ [−1, 1]. */
export function eyeRotations(h: number, v: number, vergence = VERGENCE): { L: THREE.Euler; R: THREE.Euler } {
  const yaw = Math.max(-1, Math.min(1, h)) * MAX_YAW;
  const pitch = -Math.max(-1, Math.min(1, v)) * MAX_PITCH; // +v = up = negative rotation about X
  // +yaw about Y turns +Z toward +X (the avatar's left); converging = left eye toward −X, right eye toward +X
  return { L: new THREE.Euler(pitch, yaw - vergence, 0, "YXZ"), R: new THREE.Euler(pitch, yaw + vergence, 0, "YXZ") };
}

/** Critically damped spring: exact step (stable for any dt), never overshoots a fixed target. */
export function springStep(x: number, vel: number, target: number, omega: number, dt: number): [number, number] {
  const d = x - target;
  const e = Math.exp(-omega * dt);
  const c = vel + omega * d;
  return [target + (d + c * dt) * e, (vel - omega * c * dt) * e];
}

/** One-Euro filter (Casiez et al.) — smooths jitter, keeps fast saccades. */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  constructor(minCutoff = 2.5, beta = 0.6, dCutoff = 1.5) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }
  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(v: number, dt: number): number {
    if (this.x === null || dt <= 0) return (this.x = v);
    const dv = (v - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dv - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
  get value() {
    return this.x ?? 0;
  }
}

// ── materials ─────────────────────────────────────────────────────────────

export interface IrisUniforms {
  uIrisColor: { value: THREE.Color };
  uIrisStyle: { value: number };
  /** pupil radius as a fraction of the iris radius */
  uPupil: { value: number };
  uDilate: { value: number };
  /** iris angular radius (radians) — the iris is a cap on the eyeball, measured from the gaze axis */
  uAngle: { value: number };
}

export function irisUniforms(): IrisUniforms {
  return { uIrisColor: { value: new THREE.Color("#5C3B22") }, uIrisStyle: { value: 0 }, uPupil: { value: 0.4 }, uDilate: { value: 0 }, uAngle: { value: 0.55 } };
}

const IRIS_FRAG = /* glsl */ `
uniform vec3 uIrisColor;
uniform float uIrisStyle;
uniform float uPupil;
uniform float uDilate;
uniform float uAngle;
varying vec3 vIrisP;
float irHash(float n) { return fract(sin(n) * 43758.5453); }
vec3 irisColor() {
  float t = acos(clamp(vIrisP.z / max(1e-5, length(vIrisP)), -1.0, 1.0)) / uAngle; // 0 centre … 1 iris rim
  float phi = atan(vIrisP.y, vIrisP.x);
  float tp = clamp(uPupil * (1.0 + uDilate), 0.18, 0.62);
  vec3 base = uIrisColor;
  vec3 warm = mix(base, vec3(1.0, 0.84, 0.52), 0.38) * 1.3;
  float f1 = 0.5 + 0.5 * sin(phi * 31.0 + sin(phi * 7.0) * 2.1 + t * 4.0);
  float f2 = 0.5 + 0.5 * sin(phi * 67.0 + irHash(floor(phi * 11.0)) * 6.0);
  float fib = mix(f1, f2, 0.45);
  vec3 c;
  if (uIrisStyle < 0.5) {            // natural: fibres, warm collarette
    c = base * (0.6 + 0.65 * fib * (0.5 + 0.5 * t));
    c = mix(c, warm, smoothstep(tp + 0.3, tp, t) * 0.5);
  } else if (uIrisStyle < 1.5) {     // ring: smooth, bold limbal ring
    c = mix(base * 1.3, base * 0.75, smoothstep(tp, 0.95, t));
  } else if (uIrisStyle < 2.5) {     // cartoon: flat colour, big pupil
    c = base * mix(1.12, 0.85, t);
    tp = max(tp, 0.5);
  } else {                           // bright: starburst
    float star = 0.5 + 0.5 * sin(phi * 18.0);
    c = mix(base * 0.72, mix(base, vec3(1.0), 0.45), star * smoothstep(1.0, 0.2, t));
  }
  // limbal ring (darker edge) — stronger for "ring"
  c *= mix(1.0, uIrisStyle > 0.5 && uIrisStyle < 1.5 ? 0.2 : 0.4, smoothstep(0.78, 0.98, t));
  // round pupil, soft edge
  c = mix(c, vec3(0.01), smoothstep(tp + 0.025, tp - 0.025, t));
  return c;
}
`;

/**
 * Lid shadow: the eyeball is darker under the upper lid (and a touch under the lower one), measured from
 * the eyeball centre in view space — so it reads as sitting INSIDE the lids, not pasted over them.
 */
const LID_SHADOW_VERT = /* glsl */ `
varying float vLidY;
`;
const LID_SHADOW_VERT_MAIN = /* glsl */ `
 { vec4 c0 = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
   vec4 p0 = modelViewMatrix * vec4(position, 1.0);
   vLidY = (p0.y - c0.y) / max(1e-5, length(modelViewMatrix[1].xyz)); }
`;
const LID_SHADOW_FRAG = /* glsl */ `
varying float vLidY;
float lidShade() { return mix(1.0, 0.5, smoothstep(0.3, 0.92, vLidY)) * mix(1.0, 0.82, smoothstep(-0.45, -0.9, vLidY)); }
`;

export function makeIrisMaterial(u: IrisUniforms) {
  const m = new THREE.MeshPhysicalMaterial({
    roughness: 0.55, specularIntensity: 0.25,
    // laid over the sclera: wins the depth test by a bias, fades out at its edge
    transparent: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vIrisP;${LID_SHADOW_VERT}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n vIrisP = position;${LID_SHADOW_VERT_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${IRIS_FRAG}${LID_SHADOW_FRAG}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
 diffuseColor.rgb = irisColor() * lidShade();
 { float tr = acos(clamp(vIrisP.z / max(1e-5, length(vIrisP)), -1.0, 1.0)) / uAngle;
   diffuseColor.a = 1.0 - smoothstep(0.985, 1.045, tr); }`,
      );
  };
  m.customProgramCacheKey = () => "headz-iris2";
  return m;
}

/** Sclera: warm white, a touch pink toward the back, soft darkening where it curves away under the lids. */
export function makeScleraMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: "#f1ece6", roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.12,
    // pushed back in depth: where the ball meets the lid skin the skin always wins (no dotted z-fight line)
    polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vEyeLocal;${LID_SHADOW_VERT}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n vEyeLocal = position;${LID_SHADOW_VERT_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vEyeLocal;${LID_SHADOW_FRAG}`)
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.78, 0.76), smoothstep(0.55, -0.2, vEyeLocal.z)) * lidShade();",
      )
      .replace(
        "#include <normal_fragment_maps>",
        // ambient occlusion where the lids meet the eye: surfaces turning away from the viewer
        "#include <normal_fragment_maps>\n diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.05, 0.6, dot(normal, normalize(vViewPosition))));",
      );
  };
  m.customProgramCacheKey = () => "headz-sclera";
  return m;
}

/** Cornea: black + additive, so only the (light-fixed) reflections add on top of iris and sclera. */
export function makeCorneaMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    envMapIntensity: 1.4,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

// ── geometry ──────────────────────────────────────────────────────────────

/** Unit eyeball looking along +Z: sclera with an iris hole, concave iris disc, bulging cornea cap. */
export function eyeGeometries(irisAngle: number) {
  const toZ = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2); // +Y pole → +Z
  // sclera: a COMPLETE sphere — the iris is laid over it, so there is no hole whose polygon edge could show
  const sclera = toZ(new THREE.SphereGeometry(1, 72, 44));
  // iris: a cap hugging the sphere, a hair above it, extending a little past the rim; its edge is faded
  // in the shader (smooth limbus instead of a polygon edge, and no z-fight with the sclera: it wins by offset)
  const iris = toZ(new THREE.SphereGeometry(1.004, 96, 24, 0, Math.PI * 2, 0, irisAngle * 1.05));
  // cornea: a clear cap a little larger than the iris; the bulge fades smoothly to nothing at its rim
  const capAngle = irisAngle * 1.25;
  const cornea = toZ(new THREE.SphereGeometry(1, 64, 20, 0, Math.PI * 2, 0, capAngle));
  const c = cornea.attributes.position;
  const zEdge = Math.cos(capAngle);
  for (let i = 0; i < c.count; i++) {
    const t = (c.getZ(i) - zEdge) / (1 - zEdge + 1e-6); // 0 at the rim … 1 at the pole
    const s = t * t * (3 - 2 * t);
    c.setXYZ(i, c.getX(i) * (1 + 0.012 * s), c.getY(i) * (1 + 0.012 * s), c.getZ(i) + 0.035 * s);
  }
  cornea.computeVertexNormals();
  return { sclera, iris, cornea };
}

export interface EyeSpec {
  /** centre in head space */
  c: [number, number, number];
  /** radius */
  r: number;
  /** socket stretch (x, y, depth) relative to a sphere of radius r — stylised eyeballs are often flattened */
  sx: number;
  sy: number;
  sz: number;
  /** iris angular radius (radians) */
  iris: number;
}

/** Eyeball radius relative to the fitted socket sphere (keeps it under the lid line at extreme gaze). */
export const INSET = 0.95;

/** The two eyes: containers placed in the head, pivots rotated by the gaze. */
export class EyeRig {
  readonly group = new THREE.Group();
  readonly pivots: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  private containers: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  private meshes: THREE.Mesh[] = [];
  private irisKey = -1;
  /** spring state: [yaw, yawVel, pitch, pitchVel] in the h/v units (−1..1) */
  private s = [0, 0, 0, 0];

  private mats: { sclera: THREE.Material; iris: THREE.Material; cornea: THREE.Material };

  constructor(mats: { sclera: THREE.Material; iris: THREE.Material; cornea: THREE.Material }) {
    this.mats = mats;
    this.containers.forEach((c, i) => {
      c.add(this.pivots[i]);
      this.group.add(c);
    });
    this.group.visible = false;
  }

  /** Place (and size) both eyes. `specs[0]` is the left eye (+X). */
  place(specs: [EyeSpec, EyeSpec]) {
    const ang = specs[0].iris;
    if (Math.abs(ang - this.irisKey) > 1e-4) {
      this.irisKey = ang;
      this.meshes.forEach((m) => {
        m.parent?.remove(m);
        m.geometry.dispose();
      });
      this.meshes = [];
      for (const pv of this.pivots) {
        const g = eyeGeometries(ang);
        const sclera = new THREE.Mesh(g.sclera, this.mats.sclera);
        const iris = new THREE.Mesh(g.iris, this.mats.iris);
        const cornea = new THREE.Mesh(g.cornea, this.mats.cornea);
        iris.renderOrder = 2;
        cornea.renderOrder = 3;
        for (const m of [sclera, iris, cornea]) {
          m.frustumCulled = false;
          pv.add(m);
          this.meshes.push(m);
        }
      }
    }
    specs.forEach((e, i) => {
      const c = this.containers[i];
      c.position.set(...e.c);
      // inset: the eyeball sits a little inside the socket so the lids/skin always win the depth test
      c.scale.set(e.r * e.sx * INSET, e.r * e.sy * INSET, e.r * e.sz * INSET);
    });
    this.group.visible = true;
  }

  /** Jump straight to a gaze (still frames). */
  snap(h: number, v: number) {
    this.s = [h, 0, v, 0];
    this.apply();
  }

  /** Ease toward a gaze with a critically damped spring (ω ≈ 38/s: a saccade settles in ~0.12 s). */
  update(h: number, v: number, dt: number, omega = 38) {
    const [y, yv] = springStep(this.s[0], this.s[1], h, omega, dt);
    const [p, pv] = springStep(this.s[2], this.s[3], v, omega, dt);
    this.s = [y, yv, p, pv];
    this.apply();
  }

  /** Current (eased) gaze. */
  get gaze() {
    return { h: this.s[0], v: this.s[2] };
  }

  private apply() {
    const r = eyeRotations(this.s[0], this.s[2]);
    this.pivots[0].rotation.copy(r.L);
    this.pivots[1].rotation.copy(r.R);
  }

  dispose() {
    this.meshes.forEach((m) => m.geometry.dispose());
  }
}
