/**
 * AvatarRenderer — stylised Memoji-like avatar built procedurally from an
 * AvatarConfig and animated by MediaPipe ARKit blendshapes (or an idle loop).
 *
 * Scene graph:
 *   root
 *   ├─ body            neck, shoulders, outfit (fixed; breathes)
 *   └─ headPivot       at the neck — tracking rotation is applied here
 *      └─ head         skin mesh (morph targets), eyes, brows, mouth, ears,
 *                      hair, beard, eyewear, headwear
 *
 * Parts are rebuilt only when the config fields they depend on change;
 * colours update materials in place, so the studio stays responsive.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { normalizeAvatar, type AvatarConfig } from "../schema";
import { buildEars, buildEyewear, buildHeadwear, buildNosePiercing } from "./accessories";
import { buildBody, NECK_TOP } from "./body";
import { BrowRig } from "./brows";
import { EyeRig } from "./eyes";
import { buildBeard, buildHair, hairMaterial } from "./hair";
import { HEAD_MORPHS, buildHeadGeometry, headParams, type HeadParams, type MorphWeights } from "./head";
import { clamp, lerp } from "./math";
import { MouthRig, mouthMaterials, type MouthWeights } from "./mouth";
import { hairNormalTexture, irisTexture, skinDetailTexture, teethTexture } from "./textures";
import type { AvatarRendererApi, FaceResult, Framing, RendererOptions } from "./types";

// ── Geometry caches (shared across renderer instances) ────────────────────────

class LRU<V extends { dispose?: () => void } | null> {
  private m = new Map<string, V>();
  constructor(private max: number) {}
  get(k: string, make: () => V): V {
    if (this.m.has(k)) {
      const v = this.m.get(k)!;
      this.m.delete(k);
      this.m.set(k, v);
      return v;
    }
    const v = make();
    this.m.set(k, v);
    if (this.m.size > this.max) {
      const [ok, ov] = this.m.entries().next().value as [string, V];
      this.m.delete(ok);
      ov?.dispose?.();
    }
    return v;
  }
}
const headCache = new LRU<THREE.BufferGeometry>(4);
const hairCache = new LRU<THREE.BufferGeometry | null>(40);
const beardCache = new LRU<THREE.BufferGeometry | null>(12);

const ALL_SHAPES = [
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
  "cheekPuff", "cheekSquintLeft", "cheekSquintRight",
  "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight",
  "eyeLookOutLeft", "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight",
  "eyeWideLeft", "eyeWideRight",
  "jawForward", "jawLeft", "jawOpen", "jawRight",
  "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight", "mouthFunnel",
  "mouthLeft", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker",
  "mouthRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft",
  "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight",
  "noseSneerLeft", "noseSneerRight",
] as const;
type Shape = (typeof ALL_SHAPES)[number];

const FRAMING: Record<Framing, { top: number; bottom: number; fov: number; width: number }> = {
  face: { top: 1.38, bottom: -1.02, fov: 22, width: 2.6 },
  portrait: { top: 1.5, bottom: -1.3, fov: 24, width: 2.9 },
};

export class AvatarRenderer implements AvatarRendererApi {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
  private root = new THREE.Group();
  private bodyGroup = new THREE.Group();
  private headPivot = new THREE.Group();
  private head = new THREE.Group();
  private opts: Required<Omit<RendererOptions, "background">> & { background: string | null };

  // current config & per-part build keys
  private cfg: AvatarConfig | null = null;
  private pending: AvatarConfig | null = null;
  private keys: Record<string, string> = {};
  private P: HeadParams | null = null;

  // parts
  private headMesh: THREE.Mesh | null = null;
  private eyes: EyeRig[] = [];
  private brows: BrowRig[] = [];
  private mouth: MouthRig | null = null;
  private ears: THREE.Group | null = null;
  private piercing: THREE.Object3D | null = null;
  private hairMesh: THREE.Mesh | null = null;
  private beardMesh: THREE.Mesh | null = null;
  private eyewear: THREE.Group | null = null;
  private headwear: THREE.Group | null = null;
  private body: THREE.Group | null = null;
  private partMaterials: Record<string, THREE.Material[]> = {};

  // materials that persist and get recoloured
  private m = {
    skin: new THREE.MeshPhysicalMaterial({ roughness: 0.52, sheen: 0.7, sheenRoughness: 0.45, clearcoat: 0.12, clearcoatRoughness: 0.45 }),
    bodySkin: new THREE.MeshPhysicalMaterial({ roughness: 0.62, sheen: 0.35, sheenRoughness: 0.6 }),
    lid: new THREE.MeshPhysicalMaterial({ roughness: 0.55, sheen: 0.4, sheenRoughness: 0.5 }),
    lash: new THREE.MeshStandardMaterial({ color: "#17110f", roughness: 0.6 }),
    crease: new THREE.MeshStandardMaterial({ roughness: 0.8, transparent: true, opacity: 0.22 }),
    eye: new THREE.MeshPhysicalMaterial({ roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.03 }),
    highlight: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.92, toneMapped: false, depthWrite: false }),
    brow: new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }),
    lip: new THREE.MeshPhysicalMaterial({ roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.3 }),
    metal: new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.22, clearcoat: 0.4 }),
    hair: hairMaterial(hairNormalTexture(), "#5A3B28"),
    beard: hairMaterial(hairNormalTexture(), "#3A2A20"),
    mouth: mouthMaterials(teethTexture("normal")),
  };
  private hairUniforms = { uHighlight: { value: new THREE.Color("#ffffff") }, uHighlightOn: { value: 0 } };

  // animation state
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
      stencil: true,
      preserveDrawingBuffer: this.opts.preserveDrawingBuffer,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, this.opts.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    if (this.opts.background) this.scene.background = new THREE.Color(this.opts.background);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.75;

    // Soft, bright studio lighting (Memoji renders have almost no hard shadows)
    const key = new THREE.DirectionalLight("#fff6ee", 1.55);
    key.position.set(1.6, 3.6, 3.8);
    const fill = new THREE.DirectionalLight("#eef2ff", 1.1);
    fill.position.set(-4, 0.8, 4);
    const rim = new THREE.DirectionalLight("#ffffff", 1.0);
    rim.position.set(0.5, 3, -5);
    const hemi = new THREE.HemisphereLight("#ffffff", "#8a7c78", 0.9);
    this.scene.add(key, fill, rim, hemi);

    this.headPivot.position.y = NECK_TOP + 0.05;
    this.head.position.y = -(NECK_TOP + 0.05);
    this.headPivot.add(this.head);
    this.root.add(this.bodyGroup, this.headPivot);
    this.scene.add(this.root);

    // Hair highlight via shader patch: vertex colour r = shade, g = highlight mask
    for (const mat of [this.m.hair]) {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uHighlight = this.hairUniforms.uHighlight;
        shader.uniforms.uHighlightOn = this.hairUniforms.uHighlightOn;
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform vec3 uHighlight;\nuniform float uHighlightOn;")
          .replace(
            "#include <color_fragment>",
            "#if defined( USE_COLOR )\n diffuseColor.rgb = mix(diffuseColor.rgb * vColor.r, uHighlight * vColor.r, clamp(vColor.g, 0.0, 1.0) * uHighlightOn);\n#endif",
          );
      };
    }
    this.setFraming(this.opts.framing);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setConfig(cfg: AvatarConfig) {
    this.pending = normalizeAvatar(cfg);
    if (!this.running) this.flush();
  }

  applyFaceResult(result: FaceResult | null | undefined) {
    if (!result) return;
    const cats = result.faceBlendshapes?.[0]?.categories;
    if (cats && cats.length) {
      for (const { categoryName, score } of cats) {
        let name = categoryName;
        if (this.opts.mirror) {
          if (name.includes("Left")) name = name.replace("Left", "Right");
          else if (name.includes("Right")) name = name.replace("Right", "Left");
        }
        this.targets[name as Shape] = score;
      }
      this.lastTrack = performance.now();
    }
    const mtx = result.facialTransformationMatrixes?.[0]?.data;
    if (mtx && mtx.length >= 16) {
      const m4 = new THREE.Matrix4().fromArray(Array.from(mtx));
      const q = new THREE.Quaternion();
      m4.decompose(new THREE.Vector3(), q, new THREE.Vector3());
      if (this.opts.mirror) {
        q.y *= -1;
        q.z *= -1;
      }
      const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
      e.x = clamp(e.x, -0.55, 0.5);
      e.y = clamp(e.y, -0.75, 0.75);
      e.z = clamp(e.z, -0.5, 0.5);
      this.headTarget.setFromEuler(e);
    }
  }

  setExpression(weights: Record<string, number>) {
    this.manual = { ...weights } as Partial<Record<Shape, number>>;
  }

  setIdle(enabled: boolean) {
    this.opts.idle = enabled;
  }

  setFraming(framing: Framing) {
    this.opts.framing = framing;
    this.fitCamera();
  }

  lookAt(yaw: number, pitch: number) {
    this.look.yaw = clamp(yaw, -1, 1) * 0.6;
    this.look.pitch = clamp(pitch, -1, 1) * 0.45;
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.fitCamera();
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
      this.flush();
      this.animate(Math.min(0.1, this.clock.getDelta()));
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Render a single frame immediately (snapshots). Expression applied without smoothing. */
  renderOnce(yaw = 0) {
    this.flush();
    this.root.rotation.y = yaw;
    this.current = {};
    for (const k of ALL_SHAPES) this.current[k] = this.manual[k] ?? 0;
    this.headCurrent.identity();
    this.headPivot.quaternion.identity();
    this.applyRig();
    this.renderer.render(this.scene, this.camera);
    this.root.rotation.y = 0;
  }

  captureStream(fps = 30): MediaStream {
    return this.canvas.captureStream(fps);
  }

  dispose() {
    this.stop();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const cached = mesh === this.headMesh || mesh === this.hairMesh || mesh === this.beardMesh;
      if (!cached) mesh.geometry?.dispose();
    });
    for (const mat of Object.values(this.m)) if (mat instanceof THREE.Material) mat.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  // ── Building ────────────────────────────────────────────────────────────────

  private flush() {
    if (!this.pending) return;
    const cfg = this.pending;
    this.pending = null;
    this.build(cfg);
  }

  private changed(part: string, dep: unknown): boolean {
    const k = JSON.stringify(dep);
    if (this.keys[part] === k) return false;
    this.keys[part] = k;
    return true;
  }

  private remove(obj: THREE.Object3D | null, part?: string) {
    if (!obj) return;
    obj.parent?.remove(obj);
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh !== this.headMesh && mesh !== this.hairMesh && mesh !== this.beardMesh) mesh.geometry?.dispose();
    });
    if (part) {
      for (const mat of this.partMaterials[part] ?? []) mat.dispose();
      delete this.partMaterials[part];
    }
  }

  private build(cfg: AvatarConfig) {
    this.cfg = cfg;
    const P = headParams(cfg);
    const pKey = JSON.stringify(P);
    const headChanged = this.changed("head", pKey);
    this.P = P;
    const m = this.m;

    // Skin colour & detail
    m.skin.color.set(cfg.skin.tone);
    m.bodySkin.color.set(cfg.skin.tone);
    m.skin.sheenColor.set(cfg.skin.tone).lerp(new THREE.Color("#ffd9cf"), 0.5);
    m.bodySkin.sheenColor.copy(m.skin.sheenColor);
    const lid = new THREE.Color(cfg.skin.tone);
    if (cfg.eyes.shadow) lid.lerp(new THREE.Color(cfg.eyes.shadow), 0.55);
    m.lid.color.copy(lid);
    m.crease.color.set(cfg.skin.tone).multiplyScalar(0.62);
    m.lid.sheenColor.copy(m.skin.sheenColor);
    if (this.changed("skinTex", [cfg.skin, cfg.facialHair.style === "stubble" ? cfg.facialHair.color : 0, pKey])) {
      m.skin.map?.dispose();
      m.skin.map = skinDetailTexture(cfg, P);
      m.skin.needsUpdate = true;
    }

    if (headChanged) {
      const geo = headCache.get(pKey, () => buildHeadGeometry(P));
      if (!this.headMesh) {
        this.headMesh = new THREE.Mesh(geo, m.skin);
        this.head.add(this.headMesh);
      } else this.headMesh.geometry = geo;
      this.headMesh.updateMorphTargets();
    }

    // Eyes
    if (this.changed("eyeColor", cfg.eyes.color)) {
      m.eye.map?.dispose();
      m.eye.map = irisTexture(cfg.eyes.color);
      m.eye.needsUpdate = true;
    }
    if (this.changed("eyes", [pKey, cfg.eyes.shape, cfg.eyes.size, cfg.eyes.lashes])) {
      for (const e of this.eyes) this.remove(e.group);
      this.eyes = ([1, -1] as const).map((s) => new EyeRig(s, cfg, P, { eye: m.eye, lid: m.lid, lash: m.lash, highlight: m.highlight, crease: m.crease }));
      for (const e of this.eyes) this.head.add(e.group);
    }

    // Brows
    m.brow.color.set(cfg.brows.color);
    if (this.changed("brows", [pKey, cfg.brows.style, cfg.brows.weight])) {
      for (const b of this.brows) this.remove(b.mesh);
      this.brows = ([1, -1] as const).map((s) => new BrowRig(s, cfg, P, m.brow));
      for (const b of this.brows) this.head.add(b.mesh);
    }

    // Mouth
    m.lip.color.set(cfg.mouth.lipColor).lerp(new THREE.Color(cfg.skin.tone), 0.25);
    m.mouth.seam.color.set(cfg.mouth.lipColor).multiplyScalar(0.45);
    if (this.changed("teeth", cfg.mouth.teeth)) {
      m.mouth.teeth.map?.dispose();
      m.mouth.teeth.map = teethTexture(cfg.mouth.teeth);
      m.mouth.teeth.needsUpdate = true;
    }
    if (this.changed("mouth", [pKey, cfg.mouth.shape])) {
      if (this.mouth) this.remove(this.mouth.group);
      this.mouth = new MouthRig(cfg, P, { lip: m.lip, cavity: m.mouth.cavity, teeth: m.mouth.teeth, tongue: m.mouth.tongue, seam: m.mouth.seam });
      this.head.add(this.mouth.group);
    }

    // Ears, piercing
    m.metal.color.set(cfg.ears.earringColor);
    if (this.changed("ears", [pKey, cfg.ears.size, cfg.ears.earrings])) {
      this.remove(this.ears);
      this.ears = buildEars(cfg, P, m.skin, m.metal);
      this.head.add(this.ears);
    }
    if (this.changed("piercing", [pKey, cfg.nose.piercing])) {
      this.remove(this.piercing);
      this.piercing = buildNosePiercing(cfg, P, m.metal);
      if (this.piercing) this.head.add(this.piercing);
    }

    // Hair
    m.hair.color.set(cfg.hair.color);
    m.hair.sheenColor.set(cfg.hair.color).lerp(new THREE.Color("#ffffff"), 0.45);
    this.hairUniforms.uHighlightOn.value = cfg.hair.highlight ? 1 : 0;
    if (cfg.hair.highlight) this.hairUniforms.uHighlight.value.set(cfg.hair.highlight);
    const capped = ["beanie", "cap", "bucket", "fedora", "turban", "hijab", "bandana"].includes(cfg.headwear.style);
    const hairKey = JSON.stringify([pKey, cfg.hair.style, capped, cfg.headwear.style === "hijab"]);
    if (this.changed("hair", hairKey)) {
      const geo = hairCache.get(hairKey, () => buildHair(cfg, P));
      if (this.hairMesh) this.head.remove(this.hairMesh);
      this.hairMesh = geo ? new THREE.Mesh(geo, m.hair) : null;
      if (this.hairMesh) this.head.add(this.hairMesh);
    }

    // Beard
    m.beard.color.set(cfg.facialHair.color);
    m.beard.vertexColors = false;
    const beardKey = JSON.stringify([pKey, cfg.facialHair.style]);
    if (this.changed("beard", beardKey)) {
      const geo = beardCache.get(beardKey, () => buildBeard(cfg, P));
      if (this.beardMesh) this.head.remove(this.beardMesh);
      this.beardMesh = geo ? new THREE.Mesh(geo, m.beard) : null;
      if (this.beardMesh) {
        this.beardMesh.updateMorphTargets();
        this.head.add(this.beardMesh);
      }
    }

    // Eyewear
    if (this.changed("eyewear", [pKey, cfg.eyewear, cfg.eyes.size, cfg.eyes.shape])) {
      this.remove(this.eyewear, "eyewear");
      const ew = buildEyewear(cfg, P, this.eyes.map((e) => e.center), this.eyes[0]?.radius ?? 0.15);
      this.eyewear = ew?.group ?? null;
      if (ew) {
        this.partMaterials.eyewear = ew.materials;
        this.head.add(ew.group);
      }
    }

    // Headwear
    if (this.changed("headwear", [pKey, cfg.headwear])) {
      this.remove(this.headwear, "headwear");
      const hw = buildHeadwear(cfg, P);
      this.headwear = hw?.group ?? null;
      if (hw) {
        this.partMaterials.headwear = hw.materials;
        this.head.add(hw.group);
      }
    }

    // Body
    if (this.changed("body", cfg.outfit)) {
      this.remove(this.body, "body");
      const b = buildBody(cfg, m.bodySkin);
      this.body = b.group;
      this.partMaterials.body = b.materials;
      this.bodyGroup.add(b.group);
    }
    this.applyRig();
  }

  private fitCamera() {
    const f = FRAMING[this.opts.framing];
    const aspect = this.camera.aspect || 1;
    this.camera.fov = f.fov;
    const halfV = Math.tan(THREE.MathUtils.degToRad(f.fov / 2));
    const h = f.top - f.bottom;
    const dV = h / 2 / halfV;
    const dH = f.width / 2 / (halfV * aspect);
    const d = Math.max(dV, dH);
    const cy = (f.top + f.bottom) / 2;
    this.camera.position.set(0, cy + 0.08, d);
    this.camera.lookAt(0, cy, 0);
    this.camera.updateProjectionMatrix();
  }

  // ── Animation ───────────────────────────────────────────────────────────────

  private animate(dt: number) {
    const now = performance.now();
    const tracking = now - this.lastTrack < 800;
    const t = this.clock.elapsedTime;

    // Target weights: tracking > manual expression > idle
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
      const idleYaw = Math.sin(t * 0.35) * 0.06 + this.look.yaw;
      const idlePitch = Math.sin(t * 0.27 + 1) * 0.035 - this.look.pitch;
      this.headTarget.setFromEuler(new THREE.Euler(idlePitch, idleYaw, Math.sin(t * 0.22) * 0.025, "YXZ"));
    }

    const k = 1 - Math.exp(-dt * (tracking ? 22 : 14));
    const kBlink = 1 - Math.exp(-dt * 40);
    for (const s of ALL_SHAPES) {
      const cur = this.current[s] ?? 0;
      const tg = target[s] ?? 0;
      const kk = s.startsWith("eyeBlink") ? kBlink : k;
      this.current[s] = cur + (tg - cur) * kk;
    }
    this.headCurrent.slerp(this.headTarget, 1 - Math.exp(-dt * 12));
    this.headPivot.quaternion.copy(this.headCurrent);
    // body follows a little; breathing
    const e = new THREE.Euler().setFromQuaternion(this.headCurrent, "YXZ");
    this.bodyGroup.rotation.y = e.y * 0.18;
    this.bodyGroup.position.y = Math.sin(t * 1.4) * 0.008;
    this.applyRig();
  }

  private applyRig() {
    const c = this.current;
    const g = (s: Shape) => c[s] ?? 0;
    const head: MorphWeights = {
      jawOpen: g("jawOpen"),
      mouthSmileLeft: g("mouthSmileLeft"),
      mouthSmileRight: g("mouthSmileRight"),
      cheekPuff: g("cheekPuff"),
      mouthPucker: Math.max(g("mouthPucker"), g("mouthFunnel") * 0.6),
      mouthLeft: g("mouthLeft"),
      mouthRight: g("mouthRight"),
      noseSneer: (g("noseSneerLeft") + g("noseSneerRight")) / 2,
    };
    for (const mesh of [this.headMesh, this.beardMesh]) {
      if (!mesh?.morphTargetInfluences) continue;
      HEAD_MORPHS.forEach((name, i) => (mesh.morphTargetInfluences![i] = head[name] ?? 0));
    }
    if (this.eyes.length === 2) {
      const [L, R] = this.eyes; // side +1 = avatar's left
      L.update({
        blink: g("eyeBlinkLeft"),
        wide: g("eyeWideLeft"),
        squint: Math.max(g("eyeSquintLeft"), g("cheekSquintLeft") * 0.8),
        lookIn: g("eyeLookInLeft"),
        lookOut: g("eyeLookOutLeft"),
        lookUp: g("eyeLookUpLeft"),
        lookDown: g("eyeLookDownLeft"),
      });
      R.update({
        blink: g("eyeBlinkRight"),
        wide: g("eyeWideRight"),
        squint: Math.max(g("eyeSquintRight"), g("cheekSquintRight") * 0.8),
        lookIn: g("eyeLookInRight"),
        lookOut: g("eyeLookOutRight"),
        lookUp: g("eyeLookUpRight"),
        lookDown: g("eyeLookDownRight"),
      });
    }
    if (this.brows.length === 2) {
      this.brows[0].update({ innerUp: g("browInnerUp"), down: g("browDownLeft"), outerUp: g("browOuterUpLeft") });
      this.brows[1].update({ innerUp: g("browInnerUp"), down: g("browDownRight"), outerUp: g("browOuterUpRight") });
    }
    if (this.mouth) {
      const mw = {} as MouthWeights;
      for (const s of [
        "jawOpen", "mouthClose", "mouthFunnel", "mouthPucker", "mouthLeft", "mouthRight", "mouthSmileLeft", "mouthSmileRight",
        "mouthFrownLeft", "mouthFrownRight", "mouthStretchLeft", "mouthStretchRight", "mouthRollLower", "mouthRollUpper",
        "mouthPressLeft", "mouthPressRight", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthUpperUpLeft", "mouthUpperUpRight",
        "mouthShrugLower", "mouthShrugUpper", "mouthDimpleLeft", "mouthDimpleRight",
      ] as const) mw[s] = g(s);
      this.mouth.update(mw, head);
    }
    void lerp;
  }
}
