/**
 * KitRenderer — renders an AvatarConfig using the sculpted avatar kit
 * (public/avatar-kit/*.glb, built by tools/avatar-kit). Same public API as
 * the procedural renderer: setConfig / applyFaceResult / setExpression …
 *
 * Head: one mesh with identity morphs (face shape sliders) + 52 ARKit morphs.
 * Vertex colour RGBA = (lips, blush, eyelid, baked AO); uv.x = mouth interior.
 * Parts (hair, brows, beards, hats, glasses…) are separate GLBs that carry
 * the same identity morphs, so they follow the face shape.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { normalizeAvatar, type AvatarConfig } from "../schema";
import type { AvatarRendererApi, FaceResult, Framing, RendererOptions } from "./types";
import { irisTexture } from "./iris";
import { identityWeights } from "./identity";

export const KIT_BASE = "/avatar-kit";

interface HeadMeta {
  eyeCenters: [number, number, number][];
  eyeRadius: number;
  identityEyes: Record<string, { eyeRadius: number }>;
  identityEyeOffsets?: Record<string, [number, number, number][]>;
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const gltfCache = new Map<string, Promise<GLTF>>();
function loadGLTF(url: string): Promise<GLTF> {
  let p = gltfCache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    gltfCache.set(url, p);
    p.catch(() => gltfCache.delete(url));
  }
  return p;
}
let metaPromise: Promise<HeadMeta> | null = null;
function loadMeta(): Promise<HeadMeta> {
  return (metaPromise ??= fetch(`${KIT_BASE}/head.json`).then((r) => r.json()));
}

const FRAMING: Record<Framing, { top: number; bottom: number; fov: number; width: number }> = {
  face: { top: 1.6, bottom: -1.1, fov: 22, width: 2.9 },
  portrait: { top: 1.8, bottom: -1.35, fov: 24, width: 3.3 },
};

const SHAPES = [
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "cheekPuff",
  "cheekSquintLeft", "cheekSquintRight", "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight",
  "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight",
  "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight", "jawForward", "jawLeft", "jawOpen", "jawRight",
  "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight", "mouthFunnel", "mouthLeft",
  "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker", "mouthRight",
  "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight",
  "mouthStretchLeft", "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight", "noseSneerLeft", "noseSneerRight",
] as const;
type Shape = (typeof SHAPES)[number];

function planarEyeGeometry(r: number): THREE.SphereGeometry {
  const g = new THREE.SphereGeometry(r, 48, 36);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const k = 1.12;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / r, y = pos.getY(i) / r, z = pos.getZ(i) / r;
    if (z > 0) uv.setXY(i, (x / k) * 0.5 + 0.5, (y / k) * 0.5 + 0.5);
    else uv.setXY(i, 0.02, 0.02);
  }
  return g;
}

/** Skin material: colour zones from vertex masks + baked AO (see header). */
function skinMaterial() {
  const u = {
    uLip: { value: new THREE.Color("#c9887a") },
    uBlush: { value: 0.35 },
    uBlushTint: { value: new THREE.Color("#ff7a7a") },
    uShadow: { value: new THREE.Color("#c08a7a") },
    uShadowAmount: { value: 0 },
    uMouth: { value: new THREE.Color("#5b1e26") },
    uAO: { value: 0.85 },
    uFreckles: { value: 0 },
    uMole: { value: new THREE.Vector4(0, 0, 0, 0) },
    uAge: { value: 0 },
  };
  const m = new THREE.MeshPhysicalMaterial({
    color: "#edb98d",
    roughness: 0.55,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#ffd9cf"),
    clearcoat: 0.06,
    clearcoatRoughness: 0.5,
    vertexColors: true,
  });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vKitPos;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvKitPos = transformed;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uLip; uniform float uBlush; uniform vec3 uBlushTint; uniform vec3 uShadow; uniform float uShadowAmount;
uniform vec3 uMouth; uniform float uAO; uniform float uFreckles; uniform vec4 uMole; uniform float uAge;
varying vec3 vKitPos;
float kitHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float kitSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#if defined( USE_COLOR_ALPHA )
          vec4 mk = vColor;
          float inside = smoothstep(0.85, 0.97, min(mk.r, mk.g));
          vec3 c = diffuseColor.rgb;
          c = mix(c, uLip, smoothstep(0.15, 0.85, mk.r) * (1.0 - inside));
          c = mix(c, c * uBlushTint, mk.g * uBlush * 0.55 * (1.0 - inside));
          c = mix(c, uShadow, mk.b * uShadowAmount);
          c = mix(c, uMouth, inside);
          vec3 kp = vKitPos;
          float front = smoothstep(0.35, 0.6, kp.z);
          // freckles: sparse soft dots over the cheeks and nose
          float frRegion = smoothstep(0.7, 0.4, abs(kp.x)) * smoothstep(-0.5, -0.32, kp.y) * smoothstep(0.08, -0.1, kp.y) * front;
          vec3 cell = floor(kp * 40.0);
          vec3 fr = fract(kp * 40.0);
          float hh = kitHash(cell);
          vec3 cp = vec3(fract(hh * 13.1), fract(hh * 7.7), fract(hh * 3.3)) * 0.6 + 0.2;
          float fd = step(hh, uFreckles) * smoothstep(0.3, 0.12, length(fr - cp)) * frRegion;
          c = mix(c, c * vec3(0.66, 0.48, 0.36), fd * 0.85);
          // mole
          c = mix(c, vec3(0.27, 0.16, 0.11), uMole.w * front * smoothstep(0.022, 0.012, length(kp.xy - uMole.xy)));
          // age lines (nasolabial folds, forehead, crow's feet)
          vec2 ax = vec2(abs(kp.x), kp.y);
          float lines = smoothstep(0.018, 0.0, kitSeg(ax, vec2(0.13, -0.24), vec2(0.27, -0.56)));
          lines += smoothstep(0.012, 0.0, kitSeg(ax, vec2(0.0, 0.56), vec2(0.3, 0.54))) * 0.8;
          lines += smoothstep(0.012, 0.0, kitSeg(ax, vec2(0.0, 0.64), vec2(0.26, 0.63))) * step(0.6, uAge) * 0.7;
          lines += smoothstep(0.01, 0.0, kitSeg(ax, vec2(0.6, 0.02), vec2(0.7, 0.06))) * step(0.6, uAge);
          c *= 1.0 - clamp(lines, 0.0, 1.0) * uAge * 0.18 * front;
          c *= mix(1.0, pow(clamp(mk.a, 0.0, 1.0), 1.25), uAO);
          diffuseColor.rgb = c;
        #endif`,
      );
  };
  return { m, u };
}

/** Material for kit parts: vertex colour = (shade, highlight mask, -, AO). */
function partMaterial(opts: { roughness: number; sheen?: number; highlight?: boolean }) {
  const u = { uHighlight: { value: new THREE.Color("#ffffff") }, uHighlightOn: { value: 0 }, uAO: { value: 0.9 } };
  const m = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: opts.roughness,
    sheen: opts.sheen ?? 0,
    sheenRoughness: 0.45,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uHighlight; uniform float uHighlightOn; uniform float uAO;")
      .replace(
        "#include <color_fragment>",
        `#if defined( USE_COLOR_ALPHA )
          vec3 base = diffuseColor.rgb * vColor.r;
          base = mix(base, uHighlight * vColor.r, clamp(vColor.g, 0.0, 1.0) * uHighlightOn);
          base *= mix(1.0, pow(clamp(vColor.a, 0.0, 1.0), 1.3), uAO);
          diffuseColor.rgb = base;
        #endif`,
      );
  };
  return { m, u };
}

type Slot = "hair" | "brows" | "lashes" | "beard" | "headwear" | "eyewear" | "lens" | "earrings" | "piercing";

/** Hat rim (front y, back y) in head space — hair above it is clipped. */
const HAT_CLIP: Record<string, [number, number]> = {
  beanie: [0.42, 0.05], cap: [0.5, 0.12], bucket: [0.42, 0.25], fedora: [0.42, 0.25],
  bandana: [0.45, 0.05], turban: [0.38, -0.05],
};

export class KitRenderer implements AvatarRendererApi {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
  private root = new THREE.Group();
  private headPivot = new THREE.Group();
  private head = new THREE.Group();
  private opts: Required<Omit<RendererOptions, "background">> & { background: string | null };

  private cfg: AvatarConfig | null = null;
  private meta: HeadMeta | null = null;
  private headMesh: THREE.Mesh | null = null;
  private faceMeshes: THREE.Mesh[] = [];
  private teethStyle = { value: 0 };
  private teethMat = (() => {
    const m = new THREE.MeshStandardMaterial({ color: "#f2eee6", roughness: 0.42, envMapIntensity: 0.4 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTeeth = this.teethStyle;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vTPos;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvTPos = transformed;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uTeeth; varying vec3 vTPos;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          // subtle separations between teeth
          float sep = smoothstep(0.004, 0.0, abs(fract(vTPos.x * 22.0 + 0.5) - 0.5) / 22.0);
          diffuseColor.rgb *= 1.0 - sep * 0.18;
          if (uTeeth > 0.5 && uTeeth < 1.5) diffuseColor.rgb *= 1.0 - smoothstep(0.014, 0.008, abs(vTPos.x)) * 0.85;
          if (uTeeth > 1.5) {
            float wire = smoothstep(0.006, 0.0, abs(vTPos.y - (-0.5 + 0.03)) - 0.004);
            float bracket = step(abs(fract(vTPos.x * 22.0 + 0.5) - 0.5), 0.14);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.75, 0.8), clamp(wire + bracket * wire * 2.0, 0.0, 1.0));
          }`,
        );
    };
    return m;
  })();
  private tongueMat = new THREE.MeshPhysicalMaterial({ color: "#d46a72", roughness: 0.45, sheen: 0.3 });
  private eyes: THREE.Group[] = [];
  private eyeBalls: THREE.Mesh[] = [];
  private skin = skinMaterial();
  private eyeMat = new THREE.MeshPhysicalMaterial({ roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 });
  private hlMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  private identity: Record<string, number> = {};
  private parts: Partial<Record<Slot, { key: string; mesh: THREE.Mesh | null }>> = {};
  private hairMat = partMaterial({ roughness: 0.5, sheen: 0.6, highlight: true });
  private browMat = partMaterial({ roughness: 0.85 });
  private lashMat = new THREE.MeshStandardMaterial({ color: "#16110f", roughness: 0.5, side: THREE.DoubleSide });
  private beardMat = partMaterial({ roughness: 0.7, sheen: 0.5 });
  private hatMat = partMaterial({ roughness: 0.85, sheen: 0.7 });
  private frameMat = new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide });
  private lensMat = new THREE.MeshPhysicalMaterial({ roughness: 0.05, clearcoat: 1, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  private metalMat = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.22, clearcoat: 0.4 });
  private hatPlane = new THREE.Plane();
  private hatPlaneLocal: THREE.Plane | null = null;
  private loading: Promise<void> = Promise.resolve();

  private raf = 0;
  private running = false;
  private lastFrame = 0;
  private clock = new THREE.Clock();
  private targets: Partial<Record<Shape, number>> = {};
  private manual: Partial<Record<Shape, number>> = {};
  private current: Partial<Record<Shape, number>> = {};
  private headTarget = new THREE.Quaternion();
  private headCurrent = new THREE.Quaternion();
  private lastTrack = -1e9;
  private look = { yaw: 0, pitch: 0 };
  private idle = { nextBlink: 1.5, blinkT: -1, glanceAt: 2, gx: 0, gy: 0 };

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
    this.canvas = canvas;
    this.opts = {
      background: opts.background ?? null,
      framing: opts.framing ?? "portrait",
      maxPixelRatio: opts.maxPixelRatio ?? 2,
      idle: opts.idle ?? true,
      mirror: opts.mirror ?? true,
      fps: opts.fps ?? 30,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    };
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: this.opts.background === null,
      preserveDrawingBuffer: this.opts.preserveDrawingBuffer,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, this.opts.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.localClippingEnabled = true;
    if (this.opts.background) this.scene.background = new THREE.Color(this.opts.background);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.7;
    const key = new THREE.DirectionalLight("#fff5ec", 1.7);
    key.position.set(1.6, 3.2, 4.2);
    const fill = new THREE.DirectionalLight("#eef2ff", 1.0);
    fill.position.set(-4, 0.6, 3.5);
    const rim = new THREE.DirectionalLight("#ffffff", 1.1);
    rim.position.set(0.5, 3, -5);
    const hemi = new THREE.HemisphereLight("#ffffff", "#8a7c78", 0.8);
    this.scene.add(key, fill, rim, hemi);
    this.headPivot.position.y = -0.55;
    this.head.position.y = 0.55;
    this.headPivot.add(this.head);
    this.root.add(this.headPivot);
    this.scene.add(this.root);
    this.fitCamera();
  }

  /** Resolves when all parts for the current config are loaded. */
  whenReady(): Promise<void> {
    return this.loading;
  }

  setConfig(cfg: AvatarConfig) {
    const c = normalizeAvatar(cfg);
    this.cfg = c;
    this.applyColors(c);
    this.identity = identityWeights(c);
    this.loading = this.ensureParts(c).then(() => this.applyRig());
  }

  private async ensureParts(c: AvatarConfig) {
    if (!this.headMesh) {
      const [gltf, meta] = await Promise.all([loadGLTF(`${KIT_BASE}/head.glb`), loadMeta()]);
      this.meta = meta;
      gltf.scene.updateMatrixWorld(true);
      const sources: THREE.Mesh[] = [];
      gltf.scene.traverse((o) => (o as THREE.Mesh).isMesh && sources.push(o as THREE.Mesh));
      for (const src of sources) {
        // identify parts by content (node names may be dropped by the optimiser)
        const dict = src.morphTargetDictionary ?? {};
        const nMorph = Object.keys(dict).length;
        const name = nMorph > 40 ? "head" : dict.tongueOut !== undefined ? "tongue" : nMorph > 0 ? "teethLower" : "teethUpper";
        const mat = name.startsWith("teeth") ? this.teethMat : name === "tongue" ? this.tongueMat : this.skin.m;
        const mesh = new THREE.Mesh(src.geometry, mat);
        mesh.name = name;
        // gltfpack stores dequantisation in the node transform — keep it
        mesh.applyMatrix4(src.matrixWorld);
        if (src.geometry.morphAttributes.position?.length) {
          mesh.updateMorphTargets();
          mesh.morphTargetDictionary = { ...src.morphTargetDictionary };
        }
        mesh.frustumCulled = false;
        this.faceMeshes.push(mesh);
        this.head.add(mesh);
        if (name === "head") this.headMesh = mesh;
      }
      if (!this.headMesh) throw new Error("kit head has no head mesh");
      this.buildEyes(meta);
    }
    const hairHidden = c.hair.style === "bald" || c.headwear.style === "hijab";
    const ew = c.eyewear.style;
    await Promise.all([
      this.setPart("hair", hairHidden ? null : `hair/${c.hair.style}.glb`, this.hairMat.m),
      this.setPart("brows", c.brows.style === "none" ? null : `brows/${c.brows.style}.glb`, this.browMat.m),
      this.setPart("lashes", `lashes/${c.eyes.lashes}.glb`, this.lashMat),
      this.setPart("beard", c.facialHair.style === "none" ? null : `beard/${c.facialHair.style}.glb`, this.beardMat.m),
      this.setPart("headwear", c.headwear.style === "none" ? null : `headwear/${c.headwear.style}.glb`, this.hatMat.m),
      this.setPart("eyewear", ew === "none" ? null : `eyewear/${ew}.glb`, this.frameMat),
      this.setPart("lens", ew === "none" ? null : `eyewear/${ew}-lens.glb`, this.lensMat),
      this.setPart("earrings", c.ears.earrings === "none" ? null : `earrings/${c.ears.earrings}.glb`, this.metalMat),
      this.setPart("piercing", c.nose.piercing === "none" ? null : `piercing/${c.nose.piercing}.glb`, this.metalMat),
    ]);
    const rim = HAT_CLIP[c.headwear.style];
    if (rim) {
      // keep hair below the rim: a + b·z − y ≥ 0, rim(z) interpolates front (z=0.6) → back (z=−0.6)
      const b = -(rim[1] - rim[0]) / 1.2;
      const a = rim[0] - b * 0.6;
      const n = new THREE.Vector3(0, -1, b);
      const len = n.length();
      this.hatPlaneLocal = new THREE.Plane(n.divideScalar(len), a / len);
      this.hairMat.m.clippingPlanes = [this.hatPlane];
    } else {
      this.hatPlaneLocal = null;
      this.hairMat.m.clippingPlanes = [];
    }
    this.hairMat.m.needsUpdate = true;
    void c;
  }

  /** Swap the mesh in a slot; missing files are ignored (part not built yet). */
  private async setPart(slot: Slot, file: string | null, mat: THREE.Material) {
    const key = file ?? "";
    if (this.parts[slot]?.key === key) return;
    const prev = this.parts[slot]?.mesh;
    this.parts[slot] = { key, mesh: null };
    let mesh: THREE.Mesh | null = null;
    if (file) {
      try {
        const gltf = await loadGLTF(`${KIT_BASE}/${file}`);
        if (this.parts[slot]?.key !== key) return; // superseded
        gltf.scene.updateMatrixWorld(true);
        let src: THREE.Mesh | null = null;
        gltf.scene.traverse((o) => {
          if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
        });
        if (src) {
          const s0 = src as THREE.Mesh;
          mesh = new THREE.Mesh(s0.geometry, mat);
          mesh.applyMatrix4(s0.matrixWorld);
          if (s0.geometry.morphAttributes.position?.length) {
            mesh.updateMorphTargets();
            mesh.morphTargetDictionary = { ...s0.morphTargetDictionary };
          }
          mesh.frustumCulled = false;
        }
      } catch {
        mesh = null;
      }
    }
    if (prev) this.head.remove(prev);
    if (mesh) this.head.add(mesh);
    this.parts[slot] = { key, mesh };
  }

  private buildEyes(meta: HeadMeta) {
    for (let i = 0; i < meta.eyeCenters.length; i++) {
      const c = meta.eyeCenters[i];
      const g = new THREE.Group();
      g.position.set(c[0], c[1], c[2]);
      const ball = new THREE.Mesh(planarEyeGeometry(meta.eyeRadius), this.eyeMat);
      g.add(ball);
      const hl = new THREE.Mesh(new THREE.CircleGeometry(meta.eyeRadius * 0.14, 20), this.hlMat);
      hl.position.set(-meta.eyeRadius * 0.28, meta.eyeRadius * 0.34, meta.eyeRadius * 0.955);
      hl.lookAt(hl.position.clone().multiplyScalar(2));
      g.add(hl);
      this.head.add(g);
      this.eyes[i] = g;
      this.eyeBalls[i] = ball;
    }
  }

  private applyColors(c: AvatarConfig) {
    this.skin.m.color.set(c.skin.tone);
    this.skin.m.sheenColor.set(c.skin.tone).lerp(new THREE.Color("#ffd9cf"), 0.5);
    this.skin.u.uLip.value.set(c.mouth.lipColor).lerp(new THREE.Color(c.skin.tone), 0.2);
    this.teethStyle.value = c.mouth.teeth === "gap" ? 1 : c.mouth.teeth === "braces" ? 2 : 0;
    this.skin.u.uBlush.value = c.skin.blush;
    this.skin.u.uFreckles.value = { none: 0, light: 0.22, medium: 0.42, heavy: 0.68 }[c.skin.freckles];
    const mole = { none: null, cheek: [0.42, -0.32], lip: [0.15, -0.42], eye: [0.52, -0.05] }[c.skin.mole];
    this.skin.u.uMole.value.set(mole ? mole[0] : 0, mole ? mole[1] : 0, 0, mole ? 1 : 0);
    this.skin.u.uAge.value = { young: 0, adult: 0, mature: 0.55, senior: 1 }[c.skin.age];
    const shadow = c.eyes.shadow;
    this.skin.u.uShadowAmount.value = shadow ? 0.6 : 0;
    if (shadow) this.skin.u.uShadow.value.set(shadow);
    this.hairMat.m.color.set(c.hair.color);
    this.hairMat.u.uHighlightOn.value = c.hair.highlight ? 1 : 0;
    if (c.hair.highlight) this.hairMat.u.uHighlight.value.set(c.hair.highlight);
    this.browMat.m.color.set(c.brows.color);
    this.beardMat.m.color.set(c.facialHair.color);
    this.hatMat.m.color.set(c.headwear.color);
    this.frameMat.color.set(c.eyewear.frameColor);
    const metal = c.eyewear.style === "aviator" || c.eyewear.style === "rimless";
    this.frameMat.metalness = metal ? 0.85 : 0;
    this.lensMat.color.set(c.eyewear.lensColor);
    this.lensMat.opacity = 0.12 + 0.78 * c.eyewear.tint;
    this.metalMat.color.set(c.ears.earringColor);
    this.eyeMat.map?.dispose();
    this.eyeMat.map = irisTexture(c.eyes.color);
    this.eyeMat.needsUpdate = true;
  }

  applyFaceResult(result: FaceResult | null | undefined) {
    if (!result) return;
    const cats = result.faceBlendshapes?.[0]?.categories;
    if (cats?.length) {
      for (const { categoryName, score } of cats) {
        let n = categoryName;
        if (this.opts.mirror) {
          if (n.includes("Left")) n = n.replace("Left", "Right");
          else if (n.includes("Right")) n = n.replace("Right", "Left");
        }
        this.targets[n as Shape] = score;
      }
      this.lastTrack = performance.now();
    }
    const mtx = result.facialTransformationMatrixes?.[0]?.data;
    if (mtx && mtx.length >= 16) {
      const q = new THREE.Quaternion();
      new THREE.Matrix4().fromArray(Array.from(mtx)).decompose(new THREE.Vector3(), q, new THREE.Vector3());
      if (this.opts.mirror) {
        q.y *= -1;
        q.z *= -1;
      }
      const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
      e.x = Math.max(-0.55, Math.min(0.5, e.x));
      e.y = Math.max(-0.75, Math.min(0.75, e.y));
      e.z = Math.max(-0.5, Math.min(0.5, e.z));
      this.headTarget.setFromEuler(e);
    }
  }

  setExpression(w: Record<string, number>) {
    this.manual = { ...w } as Partial<Record<Shape, number>>;
  }
  setIdle(e: boolean) {
    this.opts.idle = e;
  }
  setFraming(f: Framing) {
    this.opts.framing = f;
    this.fitCamera();
  }
  lookAt(yaw: number, pitch: number) {
    this.look.yaw = Math.max(-1, Math.min(1, yaw)) * 0.6;
    this.look.pitch = Math.max(-1, Math.min(1, pitch)) * 0.45;
  }
  resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fitCamera();
  }

  private fitCamera() {
    const f = FRAMING[this.opts.framing];
    const aspect = this.camera.aspect || 1;
    this.camera.fov = f.fov;
    const half = Math.tan(THREE.MathUtils.degToRad(f.fov / 2));
    const d = Math.max((f.top - f.bottom) / 2 / half, f.width / 2 / (half * aspect));
    const cy = (f.top + f.bottom) / 2;
    this.camera.position.set(0, cy + 0.06, d);
    this.camera.lookAt(0, cy, 0);
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (t - this.lastFrame < 1000 / this.opts.fps - 2) return;
      this.lastFrame = t;
      this.animate(Math.min(0.1, this.clock.getDelta()));
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  async renderOnceAsync(yaw = 0) {
    await this.loading;
    this.current = { ...this.manual };
    this.headPivot.quaternion.identity();
    this.root.rotation.y = yaw;
    this.applyRig();
    this.renderer.render(this.scene, this.camera);
    this.root.rotation.y = 0;
  }
  renderOnce(yaw = 0) {
    void this.renderOnceAsync(yaw);
  }

  captureStream(fps = 30) {
    return this.canvas.captureStream(fps);
  }

  dispose() {
    this.stop();
    this.eyeBalls.forEach((b) => b.geometry.dispose());
    this.skin.m.dispose();
    this.eyeMat.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  private animate(dt: number) {
    const now = performance.now();
    const tracking = now - this.lastTrack < 800;
    const t = this.clock.elapsedTime;
    const target: Partial<Record<Shape, number>> = tracking ? { ...this.targets } : { ...this.manual };
    if (!tracking && this.opts.idle) {
      const I = this.idle;
      if (I.blinkT < 0 && t > I.nextBlink) {
        I.blinkT = 0;
        I.nextBlink = t + 2.4 + Math.random() * 3.6;
      }
      if (I.blinkT >= 0) {
        I.blinkT += dt;
        const b = I.blinkT < 0.08 ? I.blinkT / 0.08 : I.blinkT < 0.2 ? 1 - (I.blinkT - 0.08) / 0.12 : 0;
        if (I.blinkT > 0.2) I.blinkT = -1;
        target.eyeBlinkLeft = Math.max(target.eyeBlinkLeft ?? 0, b);
        target.eyeBlinkRight = Math.max(target.eyeBlinkRight ?? 0, b);
      }
      if (t > I.glanceAt) {
        I.glanceAt = t + 1.8 + Math.random() * 3;
        I.gx = (Math.random() * 2 - 1) * 0.35;
        I.gy = (Math.random() * 2 - 1) * 0.2;
      }
      const gx = I.gx + this.look.yaw * 0.8, gy = I.gy - this.look.pitch * 0.8;
      target.eyeLookOutLeft = Math.max(0, gx);
      target.eyeLookInRight = Math.max(0, gx);
      target.eyeLookInLeft = Math.max(0, -gx);
      target.eyeLookOutRight = Math.max(0, -gx);
      target.eyeLookUpLeft = target.eyeLookUpRight = Math.max(0, gy);
      target.eyeLookDownLeft = target.eyeLookDownRight = Math.max(0, -gy);
      this.headTarget.setFromEuler(new THREE.Euler(Math.sin(t * 0.27 + 1) * 0.035 - this.look.pitch, Math.sin(t * 0.35) * 0.06 + this.look.yaw, Math.sin(t * 0.22) * 0.025, "YXZ"));
    }
    const k = 1 - Math.exp(-dt * (tracking ? 24 : 14));
    const kb = 1 - Math.exp(-dt * 40);
    for (const s of SHAPES) {
      const cur = this.current[s] ?? 0;
      this.current[s] = cur + ((target[s] ?? 0) - cur) * (s.startsWith("eyeBlink") ? kb : k);
    }
    this.headCurrent.slerp(this.headTarget, 1 - Math.exp(-dt * 12));
    this.headPivot.quaternion.copy(this.headCurrent);
    this.applyRig();
  }

  private applyRig() {
    if (this.hatPlaneLocal) {
      this.head.updateMatrixWorld(true);
      this.hatPlane.copy(this.hatPlaneLocal).applyMatrix4(this.head.matrixWorld);
    }
    const partMeshes = Object.values(this.parts).map((p) => p?.mesh).filter(Boolean) as THREE.Mesh[];
    for (const mesh of [...this.faceMeshes, ...partMeshes]) {
      const inf = mesh.morphTargetInfluences;
      const dict = mesh.morphTargetDictionary;
      if (!inf || !dict) continue;
      inf.fill(0);
      for (const [k, v] of Object.entries(this.identity)) if (dict[k] !== undefined) inf[dict[k]] = v;
      for (const s of SHAPES) if (dict[s] !== undefined) inf[dict[s]] = this.current[s] ?? 0;
      if (dict.tongueOut !== undefined) inf[dict.tongueOut] = (this.current as Record<string, number>).tongueOut ?? 0;
    }
    // eyes: size from identity, gaze from look shapes
    if (this.meta) {
      const big = this.identity.idEyesBig ?? 0, small = this.identity.idEyesSmall ?? 0;
      const rBig = this.meta.identityEyes.idEyesBig?.eyeRadius ?? this.meta.eyeRadius;
      const rSmall = this.meta.identityEyes.idEyesSmall?.eyeRadius ?? this.meta.eyeRadius;
      const r = this.meta.eyeRadius + (rBig - this.meta.eyeRadius) * big + (rSmall - this.meta.eyeRadius) * small;
      const g = (s: Shape) => this.current[s] ?? 0;
      const offs = this.meta.identityEyeOffsets ?? {};
      this.eyes.forEach((e, i) => {
        e.scale.setScalar(r / this.meta!.eyeRadius);
        const c = this.meta!.eyeCenters[i];
        let x = c[0], y = c[1], z = c[2];
        for (const n in offs) {
          const w = this.identity[n] ?? 0;
          if (!w) continue;
          x += offs[n][i][0] * w;
          y += offs[n][i][1] * w;
          z += offs[n][i][2] * w;
        }
        e.position.set(x, y, z);
        const L = i === 0; // eyeCenters[0] is +x = avatar's left
        const yaw = L ? g("eyeLookOutLeft") - g("eyeLookInLeft") : g("eyeLookInRight") - g("eyeLookOutRight");
        const pitch = L ? g("eyeLookUpLeft") - g("eyeLookDownLeft") : g("eyeLookUpRight") - g("eyeLookDownRight");
        this.eyeBalls[i].rotation.set(-pitch * 0.35, yaw * 0.45, 0);
      });
    }
  }
}
