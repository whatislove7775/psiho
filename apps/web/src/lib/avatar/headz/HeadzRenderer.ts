/**
 * HeadzRenderer — renders an AvatarConfig (v4) with the HEADZ 2.0 characters
 * (public/avatar/headz/*, built by tools/headz from the purchased sources).
 * Drop-in replacement for the older KitRenderer: same public API
 * (setConfig / applyFaceResult / setExpression / lookAt / renderNow …).
 *
 * Face GLB: one mesh per part (skin, eyes, brows, lashes, teeth, tongue, ears)
 * with ARKit-named morph targets; MediaPipe blendshape names map 1:1.
 * Parts (hair, beard, eyewear, headwear, earrings, mask) are separate GLBs in
 * the same normalised head space (chin ≈ −1, crown ≈ +1, +Z front).
 *
 * On top of the GLBs, at runtime (see deform.ts / shaders.ts / gaze.ts):
 *  - parts made for another base are re-seated on this head (radius maps);
 *  - beards / moustaches / masks / piercings get the face's jaw + mouth morphs;
 *  - face-shape sliders deform face + parts; brow style / lash length;
 *  - procedural eyes (iris colour + style for every base, wet cornea);
 *  - skin details and make-up; fitted hair rims; two-tone hair;
 *  - floating head, no neck (WITH_NECK=false);
 *  - conjugate gaze, lids following the gaze, micro-saccades, natural blinks.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { normalizeAvatar, type AvatarConfig, type BrowStyle } from "../schema";
import type { AvatarRendererApi, FaceResult, Framing, RendererOptions } from "../kit/types";
import { headzBase, resolvePart } from "./catalog";
import type { HeadzBase, HeadzSlot } from "./types";
import { deformFace, deformedEye, frameOf, placePart, radiusAt, radiusMap, transferMorphs, type RadiusMap } from "./deform";
import { SkinIndex, footprint, taperHair, type HairSurface } from "./scalp";
import { headwearEnvelope, tuckHair } from "./headwearFit";
import { GazeTracker, LID_GAIN, applyLids, combineEyes, gazeOf, gazeWeights, type LidGain, type Weights } from "./gaze";
import { eyeUniforms, hairUniforms, patchEye, patchFade, patchFabric, patchHair, patchSkin, skinUniforms } from "./shaders";
import { EyeRig, irisUniforms, makeCorneaMaterial, makeIrisMaterial, makeScleraMaterial, springStep, MAX_YAW, MAX_PITCH, type EyeSpec } from "./eyes";
import { nextSeed, rng, smoothNoise } from "./idleNoise";
import { hairFlow } from "./hairFlow";

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
const mapCache = new Map<string, Promise<RadiusMap | null>>();
function loadMap(b: HeadzBase): Promise<RadiusMap | null> {
  if (!b.fit) return Promise.resolve(null);
  let p = mapCache.get(b.id);
  if (!p) {
    p = fetch(b.fit)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => radiusMap(buf))
      .catch(() => {
        mapCache.delete(b.id);
        return null;
      });
    mapCache.set(b.id, p);
  }
  return p;
}

/** Follow rate (1/s) for tracked input — see KitRenderer: ~86 % of a new value is reached on the next 30 fps frame. */
const TRACK_RATE = 60;

const FRAMING: Record<Framing, { top: number; bottom: number; fov: number; width: number }> = {
  face: { top: 1.62, bottom: -1.38, fov: 22, width: 2.75 },
  portrait: { top: 2.0, bottom: -1.75, fov: 24, width: 3.3 },
};

export const SHAPES = [
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "cheekPuff",
  "cheekSquintLeft", "cheekSquintRight", "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight",
  "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight",
  "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight", "jawForward", "jawLeft", "jawOpen", "jawRight",
  "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight", "mouthFunnel", "mouthLeft",
  "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker", "mouthRight",
  "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight",
  "mouthStretchLeft", "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight", "noseSneerLeft", "noseSneerRight",
  "tongueOut",
] as const;
type Shape = (typeof SHAPES)[number];

/** A mesh we drive: its morph slots resolved once to shape indices. */
interface Driven {
  mesh: THREE.Mesh;
  /** [influence index, shape index] */
  slots: [number, number][];
}

/** A mesh whose geometry we own: head-space rest positions + its node transform. */
interface Owned {
  mesh: THREE.Mesh;
  role: string;
  /** rest positions in head space (after any cross-base fit, before the shape sliders) */
  rest: Float32Array;
  toLocal: THREE.Matrix4;
}

interface PartState {
  key: string;
  group: THREE.Group | null;
  owned: Owned[];
  driven: Driven[];
}

const SHAPE_INDEX = new Map<string, number>(SHAPES.map((s, i) => [s, i]));
const SLOTS: HeadzSlot[] = ["hair", "beard", "eyewear", "headwear", "earrings", "mask"];
/** face morphs worth giving to things worn on the lower face */
const LOWER_FACE = /^(jaw|mouth|cheek|noseSneer)/;
const FOLLOW_SLOTS = new Set<string>(["beard", "mask"]);

const BROW_SHAPES: Record<BrowStyle, { arch: number; tilt: number; lift: number }> = {
  natural: { arch: 0, tilt: 0, lift: 0 },
  straight: { arch: -0.9, tilt: 0, lift: -0.2 },
  arched: { arch: 1, tilt: -0.2, lift: 0.2 },
  angled: { arch: 0.5, tilt: 0.8, lift: 0 },
  soft: { arch: 0.35, tilt: -0.5, lift: 0 },
  raised: { arch: 0.4, tilt: 0.3, lift: 1 },
};

const srgb = (hex: string) => new THREE.Color(hex);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const WITH_NECK = false;
/** eye mesh roles of the sources — replaced by the rigid EyeRig */
const EYE_ROLES = new Set(["iris", "pupil", "eyeWhite"]);


/** Extra options for heads drawn by a shared HeadzStage (one WebGL context for many heads). */
export interface SharedOptions {
  /** light static face (thumbnails) */
  lod?: boolean;
  /** draw with this renderer (owned by the stage) instead of creating one on `canvas` */
  gl?: THREE.WebGLRenderer;
  /** environment map shared by the stage's heads */
  env?: THREE.Texture;
  /** idle: breathing bob of the head (head units), 0 = none */
  bob?: number;
  /** how fast the head turns toward lookAt() (1/s, default 12) */
  turnRate?: number;
  /** idle: slow 3D float of the whole head (head units; replaces CSS float animations of stage slots), 0 = none */
  float?: number;
  /** fixed per-head seed of the idle motion (sway, blinks, glances) — deterministic, heads on one stage differ */
  seed?: number;
}

export class HeadzRenderer implements AvatarRendererApi {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
  private root = new THREE.Group();
  private headPivot = new THREE.Group();
  private head = new THREE.Group();
  private opts: Required<Omit<RendererOptions, "background">> & { background: string | null };
  /** use the light static face (thumbnails: no expressions, a fraction of the download) */
  private lod: boolean;
  /** how far the lids follow the gaze for the current base (calibrated per character group) */
  private lidGain: LidGain = LID_GAIN;

  private cfg: AvatarConfig | null = null;
  private faceKey = "";
  private base: HeadzBase | null = null;
  private map: RadiusMap | null = null;
  private faceGroup: THREE.Group | null = null;
  private driven: Driven[] = [];
  private owned: Owned[] = [];
  private parts: Partial<Record<HeadzSlot, PartState>> = {};
  private extras: PartState = { key: "", group: null, owned: [], driven: [] };
  private neck: THREE.Mesh | null = null;
  private shapeKey = "";
  private accessoryBounds = { top: 0, width: 0, front: 0 };
  private loading: Promise<void> = Promise.resolve();

  private eyeU = eyeUniforms();
  private irisU = irisUniforms();
  private eyeMats = { sclera: makeScleraMaterial(), iris: makeIrisMaterial(this.irisU), cornea: makeCorneaMaterial() };
  private eyeRig = new EyeRig(this.eyeMats);
  /** source eye meshes hidden in favour of the rig (per-side bounds for the socket fit) */
  private eyeBounds: [THREE.Box3, THREE.Box3] | null = null;
  /** tracked gaze: filtered, held only through a blink, relaxes to the centre when input is missing (gaze.ts) */
  private trackGaze = new GazeTracker();
  private skinU = skinUniforms();
  private hairU = hairUniforms();
  private beardU = hairUniforms();
  // restylable materials
  private mats = {
    // double-sided: some sources ship eyeballs with inverted normals (their front would be culled)
    eye: new THREE.MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.025, ior: 1.38, specularIntensity: 0.7, side: THREE.DoubleSide }),
    brows: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    lashes: new THREE.MeshStandardMaterial({ color: "#2a1f1b", roughness: 0.75, side: THREE.DoubleSide }),
    mouthInterior: new THREE.MeshBasicMaterial({ color: "#38131b" }),
    teeth: new THREE.MeshPhysicalMaterial({ color: "#f5f0e6", roughness: 0.35, clearcoat: 0.5 }),
    gums: new THREE.MeshStandardMaterial({ color: "#d9636a", roughness: 0.55 }),
    hair: new THREE.MeshPhysicalMaterial({ roughness: 0.62, sheen: 0.3, sheenRoughness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    beard: new THREE.MeshPhysicalMaterial({ roughness: 0.68, sheen: 0.25, sheenRoughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    metal: new THREE.MeshPhysicalMaterial({ color: "#d9d9de", metalness: 1, roughness: 0.22, clearcoat: 0.6 }),
    neck: new THREE.MeshPhysicalMaterial({ roughness: 0.55, sheen: 0.4, sheenRoughness: 0.55, transparent: true }),
  };
  /** per-face materials that depend on the source (skin, mouth) — rebuilt for every base */
  private faceMats: { mat: THREE.MeshPhysicalMaterial; role: string; src: THREE.Color; mapped: boolean }[] = [];
  /** materials cloned from part GLBs (frames, hats…) — disposed with the part */
  private partMats = new Set<THREE.Material>();

  private raf = 0;
  private running = false;
  private lastFrame = 0;
  private clock = new THREE.Clock();
  private targets: Partial<Record<Shape, number>> = {};
  private manual: Partial<Record<Shape, number>> = {};
  private current = new Float32Array(SHAPES.length);
  private headTarget = new THREE.Quaternion();
  private headCurrent = new THREE.Quaternion();
  private lastTrack = -1e9;
  private look = { yaw: 0, pitch: 0 };
  private idle = { nextBlink: 1.5, blinkT: -1, double: false, blinkDuration: 0.22, glanceAt: 2, gx: 0, gy: 0, gvx: 0, gvy: 0, tx: 0, ty: 0 };
  /** idle head orientation (yaw / pitch / roll + velocities): critically damped springs toward the target */
  private headSpring = { live: false, x: [0, 0], y: [0, 0], z: [0, 0] };
  /** the stage owns the WebGL renderer + environment (don't dispose them) */
  private sharedGl: boolean;
  private bob: number;
  private turnRate: number;
  private float: number;
  /** per-head seed / phase so heads on one stage don't sway / blink in sync (all idle motion derives from it) */
  private seed: number;
  private phase: number;
  private idleTime = 0;
  private rand: () => number;

  constructor(canvas: HTMLCanvasElement | null, opts: RendererOptions & SharedOptions = {}) {
    this.lod = !!opts.lod;
    this.sharedGl = !!opts.gl;
    this.bob = opts.bob ?? 0;
    this.turnRate = opts.turnRate ?? 12;
    this.float = opts.float ?? 0;
    this.seed = opts.seed ?? nextSeed();
    this.rand = rng(this.seed);
    this.phase = this.rand() * 100;
    this.idle.nextBlink = this.phase + 0.5 + this.rand() * 3;
    this.idle.glanceAt = this.phase + 0.8 + this.rand() * 2;
    this.opts = {
      background: opts.background ?? null,
      framing: opts.framing ?? "portrait",
      maxPixelRatio: opts.maxPixelRatio ?? 2,
      idle: opts.idle ?? true,
      mirror: opts.mirror ?? true,
      fps: opts.fps ?? 30,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    };
    this.renderer =
      opts.gl ??
      new THREE.WebGLRenderer({
        canvas: canvas ?? undefined,
        antialias: true,
        alpha: this.opts.background === null,
        preserveDrawingBuffer: this.opts.preserveDrawingBuffer,
        powerPreference: "high-performance",
      });
    this.canvas = this.renderer.domElement;
    if (!opts.gl) {
      this.renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, this.opts.maxPixelRatio));
      configureRenderer(this.renderer);
    }
    if (this.opts.background) this.scene.background = new THREE.Color(this.opts.background);
    this.scene.environment = opts.env ?? makeEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.65;
    // Soft studio light, Memoji-like: warm key high left-front, cool fill, bright rim behind.
    const key = new THREE.DirectionalLight("#fff3e8", 2.0);
    key.position.set(-1.8, 3, 4.2);
    const fill = new THREE.DirectionalLight("#e9efff", 0.9);
    fill.position.set(4, 0.4, 3.2);
    const rim = new THREE.DirectionalLight("#ffffff", 1.6);
    rim.position.set(0.8, 3.2, -5);
    const hemi = new THREE.HemisphereLight("#ffffff", "#7d6f6a", 0.7);
    this.scene.add(key, fill, rim, hemi);
    // Rotate around a point just below the head's centre: the head turns in
    // place instead of swinging across the frame.
    this.headPivot.position.y = -0.3;
    this.head.position.y = 0.3;
    this.headPivot.add(this.head);
    this.root.add(this.headPivot);
    this.scene.add(this.root);
    this.head.add(this.eyeRig.group);
    patchEye(this.mats.eye, this.eyeU);
    patchHair(this.mats.hair, this.hairU);
    patchHair(this.mats.beard, this.beardU);
    patchFade(this.mats.neck, -1.08, -1.5);
    this.fitCamera();
    // QA hook (dev builds only): lets tests read morph influences of the live avatar
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      (window as unknown as { __avatarRenderer?: HeadzRenderer }).__avatarRenderer = this;
    }
  }

  /** Resolves when all parts for the current config are loaded. */
  whenReady(): Promise<void> {
    return this.loading;
  }

  setConfig(cfg: AvatarConfig) {
    const c = normalizeAvatar(cfg);
    this.cfg = c;
    this.loading = this.ensure(c).then(() => {
      if (this.cfg !== c) return;
      this.applyShape(c);
      this.applyColors(c);
    });
  }

  // ── loading ────────────────────────────────────────────────────────────────

  private async ensure(c: AvatarConfig) {
    const base = headzBase(c.base);
    const faceUrl = (this.lod && base.lod) || base.face;
    if (this.faceKey !== faceUrl) {
      this.faceKey = faceUrl;
      const [gltf, map] = await Promise.all([loadGLTF(faceUrl), loadMap(base)]);
      if (this.faceKey !== faceUrl) return; // superseded
      const g = new THREE.Group();
      const driven: Driven[] = [];
      const owned: Owned[] = [];
      const faceMats: HeadzRenderer["faceMats"] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const src = o as THREE.Mesh;
        if (!src.isMesh) return;
        const mesh = this.adopt(src, "face", faceMats);
        if (!mesh) return;
        g.add(mesh);
        const d = this.drive(mesh);
        if (d) driven.push(d);
        owned.push(this.own(mesh, roleOf(src)));
      });
      if (this.faceGroup) this.dropFace(this.faceGroup);
      this.faceMats.forEach((f) => f.mat.dispose());
      this.faceMats = faceMats;
      this.faceGroup = g;
      this.driven = driven;
      this.owned = owned;
      this.base = base;
      this.map = map;
      this.head.add(g);
      for (const o of owned) if (isSkin(o)) this.skinFx(o);
      this.buildMouthInterior(base, g);
      this.adoptEyes(base);
      this.buildNeck(base);
      this.shapeKey = "";
      // parts belong to a base: drop them so they reload for the new one
      for (const s of SLOTS) await this.setPart(s, null);
      this.setExtras("");
    }
    await Promise.all(SLOTS.map((s) => this.setPart(s, c[s] === "none" ? null : c[s])));
    this.setExtras(this.lod ? "" : c.acc.piercings.join(","));
    this.applyRig();
  }

  /**
   * Replace the source eyes (shape-key driven, asymmetric) by the rigid EyeRig:
   * hide them, stop driving them, and remember their per-side bounds to fit the socket.
   */
  private adoptEyes(base: HeadzBase) {
    const src = this.owned.filter((o) => EYE_ROLES.has(o.mesh.userData.role as string));
    if (this.lod || !base.eyes?.L || !base.eyes?.R || !src.length) {
      this.eyeBounds = null;
      this.eyeRig.group.visible = false;
      return;
    }
    const boxes: [THREE.Box3, THREE.Box3] = [new THREE.Box3(), new THREE.Box3()];
    const v = new THREE.Vector3();
    for (const o of src) {
      for (let i = 0; i < o.rest.length; i += 3) {
        v.set(o.rest[i], o.rest[i + 1], o.rest[i + 2]);
        boxes[v.x > 0 ? 0 : 1].expandByPoint(v);
      }
      o.mesh.visible = false;
    }
    this.driven = this.driven.filter((d) => !EYE_ROLES.has(d.mesh.userData.role as string));
    this.eyeBounds = boxes;
  }

  /** Build our own mesh (own geometry wrapper, own morph influences, restyled material) from a loaded mesh. */
  private adopt(src: THREE.Mesh, kind: "face" | HeadzSlot, faceMats?: HeadzRenderer["faceMats"]): THREE.Mesh | null {
    const srcMat = (Array.isArray(src.material) ? src.material[0] : src.material) as THREE.MeshStandardMaterial;
    const role = (srcMat?.name || "").replace(/\.\d+$/, "");
    if (role === "cloth" || role === "eyeLens") return null;
    let mat: THREE.Material;
    switch (role) {
      case "skin":
      case "skinDetail":
      case "mouth": {
        // "mouth" in the sources is the lip/mouth-corner skin (+ the cavity): it gets the face's skin
        // colour too — lips and the dark mouth interior are painted by the skin shader (no muzzle patch)
        const m = new THREE.MeshPhysicalMaterial({
          color: srcMat.map ? 0xffffff : srcMat.color,
          map: srcMat.map ?? null,
          roughness: 0.62,
          specularIntensity: 0.45,
          sheen: 0.12,
          sheenRoughness: 0.7,
          clearcoat: role === "mouth" ? 0.1 : 0.02,
          clearcoatRoughness: 0.6,
        });
        m.name = role;
        m.userData.map = srcMat.map ?? null;
        patchSkin(m, this.skinU);
        faceMats?.push({ mat: m, role, src: srcMat.color.clone(), mapped: !!srcMat.map });
        mat = m;
        break;
      }
      case "iris":
      case "pupil":
      case "eyeWhite":
        mat = this.mats.eye;
        break;
      case "brows":
      case "lashes":
      case "teeth":
      case "gums":
        mat = this.mats[role];
        break;
      case "hair":
        mat = kind === "beard" ? this.mats.beard : this.mats.hair;
        break;
      default: {
        // frames, lenses, hats, earrings, masks: keep the authored look (recoloured on request)
        const m = new THREE.MeshPhysicalMaterial({
          color: srcMat.color,
          map: srcMat.map ?? null,
          roughness: srcMat.roughness,
          roughnessMap: srcMat.roughnessMap,
          normalMap: srcMat.normalMap,
          normalScale: srcMat.normalScale.clone(),
          bumpMap: srcMat.bumpMap,
          bumpScale: srcMat.bumpScale,
          metalness: srcMat.metalness,
          metalnessMap: srcMat.metalnessMap,
          aoMap: srcMat.aoMap,
          aoMapIntensity: srcMat.aoMapIntensity,
          transparent: srcMat.transparent,
          opacity: srcMat.opacity,
          side: kind === "face" ? THREE.FrontSide : THREE.DoubleSide,
          clearcoat: role === "glassLens" ? 1 : role.startsWith("frame") ? 0.5 : 0,
          clearcoatRoughness: 0.1,
          sheen: role.startsWith("headwear") || role.startsWith("mask") ? 0.6 : 0,
          sheenRoughness: 0.5,
        });
        if ((kind === "headwear" || kind === "mask") && srcMat.metalness < 0.3 && !srcMat.transparent) {
          m.roughness = Math.max(m.roughness, 0.8);
          m.sheen = 0.2;
          m.sheenRoughness = 0.75;
          patchFabric(m);
        }
        if (role === "glassLens") {
          m.transparent = true;
          m.opacity = Math.min(m.opacity, 0.35);
          m.depthWrite = false;
        }
        m.name = role;
        m.userData.src = srcMat.color.clone();
        m.userData.srcOpacity = m.opacity;
        if (kind !== "face") this.partMats.add(m);
        else faceMats?.push({ mat: m, role, src: srcMat.color.clone(), mapped: !!srcMat.map });
        mat = m;
      }
    }
    // Own geometry wrapper: shares index/normals/uv/morphs with the cached GLB, owns its positions
    const sg = src.geometry;
    const geo = new THREE.BufferGeometry();
    geo.setIndex(sg.index);
    for (const [k, a] of Object.entries(sg.attributes)) geo.setAttribute(k, a);
    geo.morphAttributes = sg.morphAttributes;
    geo.morphTargetsRelative = sg.morphTargetsRelative;
    for (const gr of sg.groups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
    const p = sg.attributes.position;
    const pos = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      pos[i * 3] = p.getX(i);
      pos[i * 3 + 1] = p.getY(i);
      pos[i * 3 + 2] = p.getZ(i);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = src.name;
    mesh.userData.role = role;
    // gltfpack stores dequantisation in the node transform — keep it
    mesh.applyMatrix4(src.matrixWorld);
    if (sg.morphAttributes.position?.length) {
      mesh.updateMorphTargets();
      mesh.morphTargetDictionary = { ...(src.morphTargetDictionary ?? {}) };
    }
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Head-space rest positions of a mesh (its node matrix applied) and the matrix back. */
  private own(mesh: THREE.Mesh, role: string): Owned {
    mesh.updateMatrix();
    const pos = mesh.geometry.attributes.position.array as Float32Array;
    const rest = new Float32Array(pos.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(mesh.matrix);
      rest[i] = v.x;
      rest[i + 1] = v.y;
      rest[i + 2] = v.z;
    }
    mesh.geometry.setAttribute("aHead", new THREE.BufferAttribute(rest.slice(), 3));
    if (mesh.material === this.mats.hair || mesh.material === this.mats.beard) {
      const normals = new Float32Array(rest.length);
      const na = mesh.geometry.attributes.normal;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrix);
      for (let i = 0; i < na.count; i++) {
        v.fromBufferAttribute(na, i).applyMatrix3(normalMatrix).normalize();
        normals.set([v.x, v.y, v.z], i * 3);
      }
      mesh.geometry.setAttribute("aHairFlow", new THREE.BufferAttribute(hairFlow(rest, normals, mesh.geometry.index?.array ?? null), 4));
    }
    return { mesh, role, rest, toLocal: mesh.matrix.clone().invert() };
  }

  private drive(mesh: THREE.Mesh): Driven | null {
    const dict = mesh.morphTargetDictionary;
    if (!dict || !mesh.morphTargetInfluences) return null;
    const slots: [number, number][] = [];
    for (const [name, idx] of Object.entries(dict)) {
      const s = SHAPE_INDEX.get(name);
      if (s !== undefined) slots.push([idx, s]);
    }
    return slots.length ? { mesh, slots } : null;
  }

  /** Swap the part in a slot; missing files are ignored. */
  private async setPart(slot: HeadzSlot, qid: string | null) {
    const base = this.base;
    if (!base) return;
    const res = qid ? resolvePart(base.id, slot, qid) : null;
    const key = res ? `${res.url}@${base.id}` : "";
    if ((this.parts[slot]?.key ?? "") === key) return;
    const prev = this.parts[slot]?.group;
    this.parts[slot] = { key, group: null, owned: [], driven: [] };
    let group: THREE.Group | null = null;
    const owned: Owned[] = [];
    const driven: Driven[] = [];
    if (res) {
      try {
        const srcBase = headzBase(res.src);
        const [gltf, srcMap] = await Promise.all([loadGLTF(res.url), res.src !== base.id ? loadMap(srcBase) : Promise.resolve(null)]);
        if (this.parts[slot]?.key !== key) return; // superseded
        gltf.scene.updateMatrixWorld(true);
        group = new THREE.Group();
        const g = group;
        gltf.scene.traverse((o) => {
          const src = o as THREE.Mesh;
          if (!src.isMesh) return;
          const m = this.adopt(src, slot);
          if (!m) return;
          g.add(m);
          const ow = this.own(m, slot);
          // made for another head: re-seat it (coarse radius maps) + snap its skin-side layer to our skin; lift hair
          placePart(ow.rest, slot, srcMap, this.map, () => this.skinSurface());
          owned.push(ow);
        });
        if (FOLLOW_SLOTS.has(slot) && !this.lod)
          for (const ow of owned) {
            const d = this.follow(ow);
            if (d) driven.push(d);
          }
        if (slot === "hair") for (const ow of owned) this.hairTips(ow);
      } catch {
        group = null;
      }
    }
    if (prev) this.dropGroup(prev);
    if (group) this.head.add(group);
    this.parts[slot] = { key, group, owned, driven };
    this.shapeKey = "";
    if (slot === "hair") this.seatHair();
  }

  private dropGroup(g: THREE.Group) {
    this.head.remove(g);
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const m = mesh.material as THREE.Material | undefined;
      if (m && this.partMats.has(m)) {
        m.dispose();
        this.partMats.delete(m);
      }
      if (mesh.isMesh) disposeOwnGeometry(mesh.geometry);
    });
  }

  private dropFace(g: THREE.Group) {
    this.head.remove(g);
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) disposeOwnGeometry(mesh.geometry);
    });
  }

  // ── runtime geometry ─────────────────────────────────────────────────────

  /** Skin morph deltas in head space (for morph transfer onto parts). */
  private skinSource() {
    const skin = this.owned.filter(isSkin);
    let n = 0;
    for (const o of skin) n += o.rest.length;
    const pos = new Float32Array(n);
    const deltas = new Map<string, Float32Array>();
    let off = 0;
    const m3 = new THREE.Matrix3();
    const v = new THREE.Vector3();
    for (const o of skin) {
      pos.set(o.rest, off);
      m3.setFromMatrix4(o.mesh.matrix);
      const dict = o.mesh.morphTargetDictionary ?? {};
      const attrs = o.mesh.geometry.morphAttributes.position ?? [];
      for (const [name, idx] of Object.entries(dict)) {
        const a = attrs[idx];
        if (!a || !LOWER_FACE.test(name)) continue;
        let d = deltas.get(name);
        if (!d) deltas.set(name, (d = new Float32Array(n)));
        for (let i = 0; i < a.count; i++) {
          v.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix3(m3);
          d[off + i * 3] = v.x;
          d[off + i * 3 + 1] = v.y;
          d[off + i * 3 + 2] = v.z;
        }
      }
      off += o.rest.length;
    }
    return { pos, deltas };
  }

  /** Give a part (beard, mask, piercing) the face's lower-face morphs so it moves with the jaw and lips. */
  private follow(ow: Owned): Driven | null {
    const src = this.skinSource();
    if (!src.pos.length) return null;
    const moved = transferMorphs(ow.rest, src, (n) => SHAPE_INDEX.has(n));
    if (!moved.size) return null;
    const geo = ow.mesh.geometry;
    const m3 = new THREE.Matrix3().setFromMatrix4(ow.toLocal);
    const v = new THREE.Vector3();
    const attrs: THREE.BufferAttribute[] = [];
    const dict: Record<string, number> = {};
    for (const [name, d] of moved) {
      const local = new Float32Array(d.length);
      for (let i = 0; i < d.length; i += 3) {
        v.set(d[i], d[i + 1], d[i + 2]).applyMatrix3(m3);
        local[i] = v.x;
        local[i + 1] = v.y;
        local[i + 2] = v.z;
      }
      dict[name] = attrs.length;
      attrs.push(new THREE.BufferAttribute(local, 3));
    }
    geo.morphAttributes = { position: attrs };
    geo.morphTargetsRelative = true;
    geo.userData.ownMorphs = true;
    ow.mesh.updateMorphTargets();
    ow.mesh.morphTargetDictionary = dict;
    ow.mesh.morphTargetInfluences = new Array(attrs.length).fill(0);
    return this.drive(ow.mesh);
  }

  /** Close the open rear of the authored oral cavity. Some bases have lips and
   * teeth but no back wall: from below, the hair/background is visible through
   * the head. This inset volume stays behind the teeth and follows mouth morphs. */
  private buildMouthInterior(base: HeadzBase, group: THREE.Group) {
    const f = frameOf(base);
    const geo = new THREE.SphereGeometry(1, 24, 16);
    geo.scale(f.mouthHalf * 1.3, 0.28, 0.12);
    geo.translate(f.mouth[0], f.mouth[1] - 0.035, f.mouth[2] - 0.46);
    const mesh = new THREE.Mesh(geo, this.mats.mouthInterior);
    mesh.name = "mouthInterior";
    mesh.frustumCulled = false;
    const owned = this.own(mesh, "mouthInterior");
    const driven = this.follow(owned);
    if (driven) this.driven.push(driven);
    this.owned.push(owned);
    group.add(mesh);
  }

  /** Per-vertex make-up / blush regions from the face's own morphs: x lips, y upper lid, z cheeks. */
  private skinFx(o: Owned) {
    const geo = o.mesh.geometry;
    const n = geo.attributes.position.count;
    const fx = new Float32Array(n * 4);
    const dict = o.mesh.morphTargetDictionary ?? {};
    const attrs = geo.morphAttributes.position ?? [];
    const mag = (names: string[], ch: number, downOnly = false) => {
      const acc = new Float32Array(n);
      for (const name of names) {
        const a = attrs[dict[name] ?? -1];
        if (!a) continue;
        let max = 1e-9;
        const m = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const dy = a.getY(i);
          m[i] = downOnly && dy > 0 ? 0 : Math.hypot(a.getX(i), dy, a.getZ(i));
          max = Math.max(max, m[i]);
        }
        for (let i = 0; i < n; i++) acc[i] = Math.max(acc[i], m[i] / max);
      }
      for (let i = 0; i < n; i++) fx[i * 4 + ch] = acc[i];
    };
    mag(["mouthRollLower", "mouthRollUpper"], 0);
    mag(["eyeBlinkLeft", "eyeBlinkRight"], 1, true);
    mag(["cheekPuff"], 2);
    geo.setAttribute("aFx", new THREE.BufferAttribute(fx, 4));
    geo.setAttribute("aCover", new THREE.BufferAttribute(new Float32Array(n), 1));
  }

  /** Seat the hair rim on the scalp geometrically, without painting hair colour onto skin. */
  private seatHair() {
    const hair = this.parts.hair?.owned ?? [];
    const skinOwned = this.owned.filter(isSkin);
    if (!skinOwned.length) return;
    // only hair that is actually on the head: some sources keep stray interior geometry (mirror seams)
    const map = this.map;
    const surface = (o: Owned): HairSurface => {
      const p = o.rest;
      let ok: Uint8Array | undefined;
      if (map) {
        ok = new Uint8Array(p.length / 3);
        for (let i = 0, k = 0; i < p.length; i += 3, k++) ok[k] = Math.hypot(p[i], p[i + 1], p[i + 2]) >= 0.85 * radiusAt(map, p[i], p[i + 1], p[i + 2]) ? 1 : 0;
      }
      return { pos: p, index: o.mesh.geometry.index?.array ?? null, ok };
    };
    const fp = hair.length ? footprint(hair.map(surface)) : null;
    if (fp) {
      const sk = this.skinSurface();
      const idx = new SkinIndex(sk.pos, sk.nrm);
      for (const o of hair) taperHair(o.rest, fp, idx);
    }
    this.shapeKey = "";
  }

  /** Height of each hair vertex above the scalp (0 at the roots → 1 at the tips), for two-tone hair. */
  private hairTips(o: Owned) {
    const p = o.rest;
    const t = new Float32Array(p.length / 3);
    for (let i = 0, j = 0; i < p.length; i += 3, j++) {
      const above = this.map ? Math.hypot(p[i], p[i + 1], p[i + 2]) - radiusAt(this.map, p[i], p[i + 1], p[i + 2]) : 0.1;
      t[j] = Math.max(smooth(0.05, 0.3, above), smooth(-0.1, -0.9, p[i + 1]));
    }
    o.mesh.geometry.setAttribute("aTip", new THREE.BufferAttribute(t, 1));
  }

  /** A short neck under the head that fades out (Memoji-style) — hides the head's underside. */
  private buildNeck(b: HeadzBase) {
    if (this.neck) {
      this.root.remove(this.neck);
      this.neck.geometry.dispose();
      this.neck = null;
    }
    // Owner: avatars are floating heads — no neck anywhere.
    if (this.lod || !WITH_NECK) return;
    const lm = b.lm ?? {};
    const jaw = lm.jaw ?? 0.55;
    const chinZ = lm.chin?.[2] ?? 0.48;
    const rx = jaw * 0.64;
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(rx * (1 + 0.12 * t * t), lerp(-0.25, -1.75, t)));
    }
    const geo = new THREE.LatheGeometry(pts, 40);
    geo.scale(1, 1, 0.92);
    geo.translate(0, 0, chinZ - 0.62);
    geo.setAttribute("aHead", geo.attributes.position.clone());
    const neck = new THREE.Mesh(geo, this.mats.neck);
    neck.renderOrder = 2;
    neck.frustumCulled = false;
    this.neck = neck;
    this.root.add(neck);
  }

  /** Piercings: small metal studs placed on the skin; they follow the lips / nose. */
  private setExtras(key: string) {
    const base = this.base;
    if (!base || this.extras.key === key) return;
    if (this.extras.group) this.dropGroup(this.extras.group);
    this.extras = { key, group: null, owned: [], driven: [] };
    if (!key) return;
    const f = frameOf(base);
    const skin = this.skinPoints();
    const snap = (x: number, y: number, z: number) => nearest(skin, x, y, z);
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, p: [number, number, number], out = 0.012) => {
      const len = Math.hypot(...p) || 1;
      geo.translate(p[0] + (p[0] / len) * out, p[1] + (p[1] / len) * out, p[2] + (p[2] / len) * out);
      const m = new THREE.Mesh(geo, this.mats.metal);
      m.frustumCulled = false;
      g.add(m);
      const ow = this.own(m, "piercing");
      this.extras.owned.push(ow);
      const d = this.follow(ow);
      if (d) this.extras.driven.push(d);
    };
    const [nx, ny, nz] = f.nose;
    for (const k of key.split(",")) {
      if (k === "nose") add(new THREE.SphereGeometry(0.022, 12, 8), snap(nx + 0.1, ny + 0.02, nz - 0.12));
      if (k === "septum") {
        const ring = new THREE.TorusGeometry(0.04, 0.008, 8, 20);
        ring.rotateX(Math.PI / 2 - 0.4);
        add(ring, [nx, ny - 0.1, nz - 0.07], 0);
      }
      if (k === "lip") add(new THREE.SphereGeometry(0.02, 12, 8), snap(f.mouth[0] + f.mouthHalf * 0.45, f.mouth[1] - 0.07, f.mouth[2]));
      if (k === "brow") {
        const e = f.eyes[0];
        add(new THREE.SphereGeometry(0.02, 12, 8), snap(e.c[0] + e.r * 1.1, e.c[1] + e.r * 1.65, e.c[2]));
        add(new THREE.SphereGeometry(0.02, 12, 8), snap(e.c[0] + e.r * 1.25, e.c[1] + e.r * 1.25, e.c[2] - 0.02));
      }
    }
    this.extras.group = g;
    this.head.add(g);
    this.shapeKey = "";
  }

  /** Skin points + normals in head space (rest pose). */
  private skinSurface(): { pos: Float32Array; nrm: Float32Array } {
    const skin = this.owned.filter(isSkin);
    const n = skin.reduce((s, o) => s + o.rest.length, 0);
    const pos = new Float32Array(n), nrm = new Float32Array(n);
    let off = 0;
    const m3 = new THREE.Matrix3();
    const v = new THREE.Vector3();
    for (const o of skin) {
      pos.set(o.rest, off);
      m3.getNormalMatrix(o.mesh.matrix);
      const a = o.mesh.geometry.getAttribute("normal");
      for (let i = 0; a && i < a.count; i++) {
        v.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix3(m3).normalize();
        nrm[off + i * 3] = v.x;
        nrm[off + i * 3 + 1] = v.y;
        nrm[off + i * 3 + 2] = v.z;
      }
      off += o.rest.length;
    }
    return { pos, nrm };
  }

  private skinPoints(attr: "rest" | "aHead" = "rest"): Float32Array {
    const skin = this.owned.filter(isSkin);
    const out = new Float32Array(skin.reduce((s, o) => s + o.rest.length, 0));
    let off = 0;
    for (const o of skin) {
      out.set(attr === "rest" ? o.rest : ((o.mesh.geometry.getAttribute("aHead") as THREE.BufferAttribute).array as Float32Array), off);
      off += o.rest.length;
    }
    return out;
  }

  /** Face-shape sliders, brow style, lash length → positions of the face and every part. */
  private applyShape(c: AvatarConfig) {
    const base = this.base;
    if (!base) return;
    const key = JSON.stringify([c.face, c.brows.style, c.brows.thickness, c.eyes.lashes, this.faceKey, SLOTS.map((s) => this.parts[s]?.key), this.extras.key]);
    if (key === this.shapeKey) return;
    this.shapeKey = key;
    const f = frameOf(base);
    const all = [...this.owned, ...SLOTS.flatMap((s) => this.parts[s]?.owned ?? []), ...this.extras.owned];
    const hats = (this.parts.headwear?.owned ?? []).map((o) => {
      const pos = o.rest.slice();
      deformFace(pos, c.face, f);
      return { pos, index: o.mesh.geometry.index?.array ?? null };
    });
    const envelope = hats.length ? headwearEnvelope(hats) : null;
    const bounds = { top: 0, width: 0, front: 0 };
    const v = new THREE.Vector3();
    for (const o of all) {
      const p = o.rest.slice();
      if (o.role === "brows") browStyle(p, BROW_SHAPES[c.brows.style], c.brows.thickness);
      if (o.role === "lashes") lashLength(p, f, c.eyes.lashes);
      deformFace(p, c.face, f, { brows: o.role === "brows" });
      if (o.role === "hair" && envelope) tuckHair(p, envelope);
      if (o.role === "hair" || o.role === "headwear") for (let i = 0; i < p.length; i += 3) {
        // Long tails are intentionally faded; only the head-level silhouette affects framing.
        if (p[i + 1] < -1) continue;
        bounds.top = Math.max(bounds.top, p[i + 1] + 0.15);
        bounds.width = Math.max(bounds.width, Math.abs(p[i]) * 2 + 0.25);
        bounds.front = Math.max(bounds.front, p[i + 2]);
      }
      const head = o.mesh.geometry.getAttribute("aHead") as THREE.BufferAttribute;
      (head.array as Float32Array).set(p);
      head.needsUpdate = true;
      const pos = o.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < p.length; i += 3) {
        v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(o.toLocal);
        arr[i] = v.x;
        arr[i + 1] = v.y;
        arr[i + 2] = v.z;
      }
      pos.needsUpdate = true;
    }
    this.accessoryBounds = bounds;
    this.fitCamera();
    // eye shader + skin details follow the reshaped face
    (["L", "R"] as const).forEach((k, i) => {
      const e = base.eyes?.[k];
      if (!e) return;
      const d = deformedEye(e, c.face, f);
      this.eyeU.uEyeC.value[i].set(...d.c);
      this.skinU.uEyeC.value[i].set(...d.c);
      this.eyeU.uEyeAxis.value[i].set(...e.axis);
      // small authored irises (kids, elders) are opened up a little: reads livelier, like Memoji
      const iris = Math.max(e.iris, 29);
      this.eyeU.uEyeAng.value[i].set(THREE.MathUtils.degToRad(iris), THREE.MathUtils.degToRad(Math.max(e.pupil, iris * 0.4)));
    });
    this.placeEyes(base, c, f);
    const pts = new Float32Array([...f.nose, ...f.mouth]);
    deformFace(pts, c.face, f);
    this.skinU.uNose.value.set(pts[0], pts[1], pts[2]);
    this.skinU.uMouth.value.set(pts[3], pts[4], pts[5], f.mouthHalf * (1 + 0.2 * (c.face.mouthWidth ?? 0)));
    this.placeMoles(c, f);
  }

  private placeEyes(base: HeadzBase, c: AvatarConfig, f: ReturnType<typeof frameOf>) {
    const bounds = this.eyeBounds;
    if (!bounds || !base.eyes?.L || !base.eyes?.R) return;
    const specs = (["L", "R"] as const).map((k, i) => {
      const e = base.eyes![k]!;
      const d = deformedEye(e, c.face, f);
      const size = bounds[i].getSize(new THREE.Vector3());
      // sockets of stylised eyes are a little oval: stretch the sphere to the authored eyeball, within reason
      const fit = (half: number) => Math.min(1.2, Math.max(0.85, half / e.r));
      const k0 = d.r / e.r;
      // small authored irises (kids, elders) are opened up a little: reads livelier, like Memoji
      const iris = THREE.MathUtils.degToRad(Math.min(38, Math.max(e.iris, 29)));
      // depth: how far the authored eyeball reaches in front of its centre (flattened cartoon eyes)
      const sz = Math.min(1.05, Math.max(0.6, (bounds[i].max.z - e.c[2]) / e.r));
      return { c: d.c, r: e.r * k0, sx: fit(size.x / 2), sy: fit(size.y / 2), sz, iris } satisfies EyeSpec;
    }) as [EyeSpec, EyeSpec];
    // both eyes identical in size and iris (only mirrored in place): no lopsided look
    const avg = (k: "sx" | "sy" | "sz" | "r") => (specs[0][k] + specs[1][k]) / 2;
    const same = { sx: avg("sx"), sy: avg("sy"), sz: avg("sz"), r: avg("r"), iris: specs[0].iris };
    for (const sp of specs) Object.assign(sp, same);
    this.eyeRig.place(specs);
    this.irisU.uAngle.value = specs[0].iris;
    const e0 = base.eyes.L;
    this.irisU.uPupil.value = Math.min(0.5, Math.max(0.36, e0.pupil / Math.max(e0.iris, 1)));
  }

  private placeMoles(c: AvatarConfig, f: ReturnType<typeof frameOf>) {
    const pts = this.skinPoints("aHead");
    const e = this.skinU.uEyeC.value[0];
    const m = this.skinU.uMouth.value;
    const spots: [number, number, number][] = [
      [e.x + 0.06, e.y - 0.3, e.z + 0.05],
      [m.x - m.w * 0.75, m.y + 0.09, m.z - 0.02],
      [-0.28, f.chin[1] + 0.22, f.chin[2] - 0.1],
    ];
    this.skinU.uMoles.value.forEach((v, i) => {
      if (i < c.skinFx.moles && pts.length) v.set(...nearest(pts, ...spots[i]), 0.02);
      else v.set(0, 0, 0, 0);
    });
  }

  // ── colours ────────────────────────────────────────────────────────────────

  private applyColors(c: AvatarConfig) {
    const base = headzBase(c.base);
    const baseSkin = srgb(base.skin);
    const skin = c.skin ? srgb(c.skin) : baseSkin;
    const sheen = skin.clone().lerp(new THREE.Color("#ffd9cf"), 0.5);
    for (const f of this.faceMats) {
      if (f.role === "skin" || f.role === "skinDetail" || f.role === "mouth") {
        // painted skin textures only fit their own tone: a chosen tone uses the flat colour
        const map = c.skin || f.role === "mouth" ? null : ((f.mat.userData.map as THREE.Texture | null) ?? null);
        if (f.mat.map !== map) {
          f.mat.map = map;
          f.mat.needsUpdate = true;
        }
        if (map) {
          // texture carries the authored tone; tint by the ratio to reach the chosen one
          f.mat.color.setRGB(
            Math.min(2, skin.r / Math.max(0.02, baseSkin.r)),
            Math.min(2, skin.g / Math.max(0.02, baseSkin.g)),
            Math.min(2, skin.b / Math.max(0.02, baseSkin.b)),
          );
        } else {
          f.mat.color.copy(skin);
        }
        f.mat.sheenColor.copy(sheen);
      }
    }
    this.mats.neck.color.copy(skin);
    this.mats.neck.sheenColor.copy(sheen);
    const hair = srgb(c.hairColor ?? base.hair);
    this.mats.hair.color.copy(hair);
    this.mats.hair.sheenColor.copy(hair).lerp(new THREE.Color("#ffffff"), 0.35);
    const tip = c.hairTip ? srgb(c.hairTip) : null;
    this.hairU.uTip.value.set(tip?.r ?? 1, tip?.g ?? 1, tip?.b ?? 1, tip ? 1 : 0);
    this.hairU.uStreak.value = c.hairTipStyle === "streaks" ? 1 : 0;
    const beard = srgb(c.beardColor ?? c.hairColor ?? base.hair);
    this.mats.beard.color.copy(beard);
    this.mats.beard.sheenColor.copy(beard).lerp(new THREE.Color("#ffffff"), 0.3);
    this.beardU.uTip.value.w = 0;
    const brows = c.brows.color ? srgb(c.brows.color) : hair.clone().multiplyScalar(0.75);
    this.mats.brows.color.copy(brows);
    this.mats.lashes.color.copy(brows).multiplyScalar(0.45).lerp(new THREE.Color("#1d1512"), 0.6);
    // eyes
    this.eyeU.uIrisColor.value.copy(srgb(c.eyeColor ?? irisDefault(base)));
    this.eyeU.uIrisStyle.value = ["natural", "ring", "cartoon", "bright"].indexOf(c.eyes.style);
    this.irisU.uIrisColor.value.copy(this.eyeU.uIrisColor.value);
    this.irisU.uIrisStyle.value = this.eyeU.uIrisStyle.value;
    // skin details + make-up
    const S = this.skinU;
    S.uBlush.value.set(1, 0.62, 0.62, c.skinFx.blush);
    S.uFreckles.value = c.skinFx.freckles;
    S.uAge.value = c.skinFx.age;
    const lip = c.makeup.lip ? srgb(c.makeup.lip) : null;
    S.uLip.value.set(lip?.r ?? 0, lip?.g ?? 0, lip?.b ?? 0, lip ? c.makeup.lipAmount * 0.9 : 0);
    const sh = c.makeup.shadow ? srgb(c.makeup.shadow) : null;
    S.uShadow.value.set(sh?.r ?? 0, sh?.g ?? 0, sh?.b ?? 0, sh ? c.makeup.shadowAmount * 0.75 : 0);
    // a subtle lash line for everyone; eyeliner makes it bolder
    const liner = new THREE.Color("#1d1512").lerp(skin, 0.35 - 0.35 * c.makeup.liner);
    S.uLiner.value.set(liner.r, liner.g, liner.b, 0.28 + 0.62 * c.makeup.liner);
    // accessory colours
    for (const m of this.partMats) {
      const pm = m as THREE.MeshPhysicalMaterial;
      const src = pm.userData.src as THREE.Color | undefined;
      if (!src) continue;
      if (pm.name.startsWith("frame")) pm.color.copy(c.acc.frame ? srgb(c.acc.frame) : src);
      else if (pm.name === "glassLens") {
        pm.color.copy(c.acc.lens ? srgb(c.acc.lens) : src);
        pm.opacity = c.acc.lens ? 0.55 : pm.userData.srcOpacity;
      } else if (pm.name.startsWith("headwear")) {
        // tint the hat's main colour; dark trims stay dark
        const l = src.getHSL({ h: 0, s: 0, l: 0 }).l;
        pm.color.copy(c.acc.hat && l > 0.08 ? srgb(c.acc.hat) : src);
      }
    }
  }

  // ── tracking & animation ────────────────────────────────────────────────

  applyFaceResult(result: FaceResult | null | undefined) {
    if (!result) return;
    const cats = result.faceBlendshapes?.[0]?.categories;
    if (cats?.length) {
      const raw: Weights = {};
      for (const { categoryName, score } of cats) {
        let n = categoryName;
        if (this.opts.mirror) {
          if (n.includes("Left")) n = n.replace("Left", "Right");
          else if (n.includes("Right")) n = n.replace("Right", "Left");
        }
        raw[n] = score;
      }
      // both eyes share one gaze; lids agree unless it's a real wink
      this.targets = combineEyes(raw, false) as Partial<Record<Shape, number>>;
      const now = performance.now();
      this.trackGaze.update(raw, now / 1000);
      this.lastTrack = now;
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
    const top = Math.max(f.top, this.accessoryBounds.top);
    const width = Math.max(f.width, this.accessoryBounds.width);
    const hatDepth = this.parts.headwear?.owned.length ? this.accessoryBounds.front : 0;
    const d = Math.max((top - f.bottom) / 2 / half, width / 2 / (half * aspect)) + hatDepth;
    const cy = (top + f.bottom) / 2;
    this.camera.position.set(0, cy + 0.08, d);
    this.camera.lookAt(0, cy, 0);
    this.camera.updateProjectionMatrix();
  }

  /** Called after every rendered frame (e.g. to push it to a captureStream(0) track). */
  onRender: (() => void) | null = null;

  // ── Add-on hook (floating hands: lib/avatar/headz/hands/HandsController) ──
  // Add-ons get the scene + camera and a tick on every animated frame; the renderer knows nothing else about them.
  readonly addons = new Set<{ tick(dt: number): void }>();
  get stage() {
    return { scene: this.scene, camera: this.camera };
  }

  // ── shared stage (HeadzStage) ─────────────────────────────────────────────

  /** Advance the animation by dt seconds without drawing (the stage draws). */
  tick(dt: number) {
    this.clock.elapsedTime += dt;
    this.animate(Math.min(0.1, dt));
  }
  /** Draw into the renderer's current viewport (set by the stage). */
  draw() {
    this.renderer.render(this.scene, this.camera);
  }
  /**
   * Camera for a stage viewport, given as a window onto the head's slot box: the head is framed in a
   * box of `fw` × `fh` pixels, and the (integer) viewport of `vw` × `vh` pixels starts at (`ox`, `oy`)
   * relative to the box's top-left corner — sub-pixel, negative = left of / above the box. The framing
   * depends only on the box's aspect; moving the box by a fraction of a pixel just shifts the window,
   * so heads glide instead of snapping to whole device pixels.
   */
  setViewWindow(fw: number, fh: number, ox: number, oy: number, vw: number, vh: number) {
    const aspect = fw / fh;
    if (Math.abs(aspect - this.viewAspect) > 1e-5) {
      this.viewAspect = aspect;
      this.camera.clearViewOffset();
      this.camera.aspect = aspect;
      this.fitCamera();
    }
    this.camera.setViewOffset(fw, fh, ox, oy, vw, vh);
  }
  private viewAspect = 0;

  /** Render right now (face tracking calls this as soon as a camera frame is processed). */
  renderNow() {
    if (!this.running) return;
    this.lastFrame = performance.now();
    this.animate(Math.min(0.1, this.clock.getDelta()));
    this.renderer.render(this.scene, this.camera);
    this.onRender?.();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      // While tracking drives renderNow() the loop only fills gaps; otherwise it animates the idle avatar at `fps`.
      const driven = performance.now() - this.lastTrack < 150;
      const gap = driven ? 1000 / 12 : 1000 / this.opts.fps - 2;
      if (performance.now() - this.lastFrame < gap) return;
      this.lastFrame = performance.now();
      this.animate(Math.min(0.1, this.clock.getDelta()));
      this.renderer.render(this.scene, this.camera);
      this.onRender?.();
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  async renderOnceAsync(yaw = 0, pitch = 0) {
    await this.loading;
    this.current.fill(0);
    const w: Weights = { ...this.manual };
    // still frames: the same conjugate gaze + lid follow as live
    const g = gazeOf(w);
    this.eyeRig.snap(g.h, g.v);
    if (this.eyeRig.group.visible) applyLids(w, g.h, g.v, this.lidGain);
    else Object.assign(w, gazeWeights(g.h, g.v));
    for (const [k, v] of Object.entries(w)) {
      const i = SHAPE_INDEX.get(k);
      if (i !== undefined) this.current[i] = v ?? 0;
    }
    this.headPivot.quaternion.identity();
    this.root.rotation.set(pitch, yaw, 0, "YXZ");
    this.applyRig();
    this.renderer.render(this.scene, this.camera);
    this.root.rotation.set(0, 0, 0);
  }
  renderOnce(yaw = 0) {
    void this.renderOnceAsync(yaw);
  }

  captureStream(fps = 30) {
    return this.canvas.captureStream(fps);
  }

  private bgTexture: THREE.Texture | null = null;

  /** Replace the scene background: a CSS colour, a painted canvas (stretched to the view) or null. */
  setBackground(bg: string | HTMLCanvasElement | null) {
    this.bgTexture?.dispose();
    this.bgTexture = null;
    if (bg === null) {
      this.scene.background = null;
    } else if (typeof bg === "string") {
      this.scene.background = new THREE.Color(bg);
    } else {
      const tex = new THREE.CanvasTexture(bg);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.bgTexture = tex;
      this.scene.background = tex;
    }
  }

  /** Current influence of one ARKit shape (debug / tests). */
  shape(name: string): number {
    const i = SHAPE_INDEX.get(name);
    return i === undefined ? 0 : this.current[i];
  }

  /** Morph influences actually applied to the face meshes and parts (debug: proves the name mapping). */
  debugMorphs(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const d of this.allDriven()) {
      const dict = d.mesh.morphTargetDictionary!;
      const inf = d.mesh.morphTargetInfluences!;
      const row: Record<string, number> = {};
      for (const [n, i] of Object.entries(dict)) if (inf[i] > 0.01) row[n] = Math.round(inf[i] * 100) / 100;
      out[d.mesh.name] = row;
    }
    return out;
  }

  dispose() {
    this.stop();
    this.bgTexture?.dispose();
    Object.values(this.mats).forEach((m) => m.dispose());
    this.faceMats.forEach((f) => f.mat.dispose());
    this.partMats.forEach((m) => m.dispose());
    Object.values(this.eyeMats).forEach((m) => m.dispose());
    this.eyeRig.dispose();
    this.neck?.geometry.dispose();
    for (const g of [this.faceGroup, ...SLOTS.map((sl) => this.parts[sl]?.group), this.extras.group]) if (g) g.traverse((o) => (o as THREE.Mesh).isMesh && disposeOwnGeometry((o as THREE.Mesh).geometry));
    if (this.sharedGl) return;
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  private animate(dt: number) {
    const now = performance.now();
    const tracking = now - this.lastTrack < 800;
    if (!tracking && this.opts.idle) this.idleTime += dt;
    const t = (tracking ? this.clock.elapsedTime : this.idleTime) + this.phase;
    const I = this.idle;
    const S = this.seed;
    const target: Weights = tracking ? { ...this.targets } : { ...this.manual };
    // fixational drift of both eyes: smooth low-frequency noise (random jumps every few hundred ms
    // read as trembling eyes, especially on many small heads at once)
    const drifting = tracking || this.opts.idle;
    const sx = drifting ? smoothNoise(t, S + 1, 0.23) * (tracking ? 0.022 : 0.012) : 0, sy = drifting ? smoothNoise(t, S + 2, 0.19) * (tracking ? 0.014 : 0.008) : 0;
    if (tracking) this.trackGaze.tick(now / 1000);
    let gaze = tracking ? { h: this.trackGaze.h, v: this.trackGaze.v } : gazeOf(target);
    if (!tracking && this.opts.idle) {
      // natural blinks: every 2–6 s, sometimes a double blink
      if (I.blinkT < 0 && t > I.nextBlink) {
        I.blinkT = 0;
        I.double = this.rand() < 0.1;
        I.blinkDuration = 0.18 + this.rand() * 0.09;
        I.nextBlink = t + 2 + this.rand() * 4;
      }
      if (I.blinkT >= 0) {
        I.blinkT += dt;
        const bt = I.blinkT;
        const one = (x: number) => {
          const u = x / I.blinkDuration;
          if (u < 0 || u > 1) return 0;
          // Fast closure, slower reopening, with eased endpoints.
          const a = u < 0.28 ? u / 0.28 : (1 - u) / 0.72;
          return a * a * (3 - 2 * a);
        };
        const b = Math.max(one(bt), I.double ? one(bt - 0.3) : 0);
        if (bt > I.blinkDuration + (I.double ? 0.3 : 0)) I.blinkT = -1;
        target.eyeBlinkLeft = Math.max(target.eyeBlinkLeft ?? 0, b);
        target.eyeBlinkRight = Math.max(target.eyeBlinkRight ?? 0, b);
      }
      if (t > I.glanceAt) {
        I.glanceAt = t + 0.8 + this.rand() * 2.7;
        // Mostly maintain attention, with brief small shifts even when looking at a partner.
        const following = Math.abs(this.look.yaw) + Math.abs(this.look.pitch) > 0.02;
        const resting = this.rand() < 0.65;
        I.tx = resting ? 0 : (this.rand() * 2 - 1) * (following ? 0.1 : 0.24);
        I.ty = resting ? 0 : (this.rand() * 2 - 1) * (following ? 0.07 : 0.13);
      }
      // A fixation holds still; a short, critically damped saccade moves to the next one.
      [I.gx, I.gvx] = springStep(I.gx, I.gvx, I.tx, 32, dt);
      [I.gy, I.gvy] = springStep(I.gy, I.gvy, I.ty, 32, dt);
      // Head: +yaw turns toward screen right; pitch < 0 (pointer above) must tilt the face UP, i.e. a
      // negative rotation about X (a positive one would swing the face down toward the floor).
      // Gaze: +gx = toward screen right = the avatar's own left (+X): left eye looks out, right eye in.
      // Eyes acquire the target first; their rotation relaxes as the slower head catches up.
      const head = new THREE.Euler().setFromQuaternion(this.headCurrent, "YXZ");
      gaze = {
        h: gaze.h + I.gx + this.look.yaw * 0.75 + (this.look.yaw - head.y) / MAX_YAW,
        v: gaze.v + I.gy - this.look.pitch * 0.75 - (this.look.pitch - head.x) / MAX_PITCH,
      };
      // idle sway (+ the slow roll of the 3D float): smooth seeded noise, no per-frame randomness
      const roll = smoothNoise(t, S + 5, 0.035) * 0.025 + (this.float ? smoothNoise(t, S + 7, 0.1) * 0.03 : 0);
      this.headTarget.setFromEuler(
        new THREE.Euler(smoothNoise(t, S + 3, 0.045) * 0.035 + this.look.pitch, smoothNoise(t, S + 4, 0.055) * 0.06 + this.look.yaw, roll, "YXZ"),
      );
    }
    // one gaze for both eyes (+ micro-saccades); lids follow it (tracked lids already include it)
    const h = Math.max(-1, Math.min(1, gaze.h + sx)), v = Math.max(-1, Math.min(1, gaze.v + sy));
    // the eyeballs rotate rigidly (critically damped); the face only follows with the lids
    this.eyeRig.update(h, v, dt);
    const eg = this.eyeRig.group.visible ? this.eyeRig.gaze : { h, v };
    // lids: a pure function of the (eased) shared gaze, closed from there by any blink
    if (this.eyeRig.group.visible) applyLids(target, eg.h, eg.v, this.lidGain);
    else Object.assign(target, gazeWeights(eg.h, eg.v));
    // pupils breathe a little and widen when the eyes open wide
    this.eyeU.uDilate.value = 0.06 * Math.sin(t * 0.37) + 0.04 * Math.sin(t * 1.13) + 0.25 * ((this.current[20] + this.current[21]) / 2);
    this.irisU.uDilate.value = this.eyeU.uDilate.value;
    // Tracked input is already One-Euro filtered (FaceTracker), so it is followed almost directly.
    const k = 1 - Math.exp(-dt * (tracking ? TRACK_RATE : 6));
    const kb = 1 - Math.exp(-dt * (tracking ? TRACK_RATE : 40));
    const ke = 1 - Math.exp(-dt * 30); // eyes: fast, saccade-like
    for (let i = 0; i < SHAPES.length; i++) {
      const s = SHAPES[i];
      const cur = this.current[i];
      const rate = i === 8 || i === 9 ? kb : i >= 10 && i <= 17 ? Math.max(k, ke) : k;
      this.current[i] = cur + ((target[s] ?? 0) - cur) * rate;
    }
    const H = this.headSpring;
    if (tracking) {
      // tracked input is already filtered: follow it almost directly (latency matters more here)
      H.live = false;
      this.headCurrent.slerp(this.headTarget, 1 - Math.exp(-dt * TRACK_RATE));
    } else {
      // idle / lookAt: time-based critically damped springs per angle — no overshoot, and no velocity
      // jump when the target switches (e.g. everyone in the circle turning to the next speaker)
      if (!H.live) {
        const c = new THREE.Euler().setFromQuaternion(this.headCurrent, "YXZ");
        H.x = [c.x, 0];
        H.y = [c.y, 0];
        H.z = [c.z, 0];
        H.live = true;
      }
      const e = new THREE.Euler().setFromQuaternion(this.headTarget, "YXZ");
      const w = this.turnRate;
      H.x = springStep(H.x[0], H.x[1], e.x, w, dt);
      H.y = springStep(H.y[0], H.y[1], e.y, w, dt);
      H.z = springStep(H.z[0], H.z[1], e.z, w, dt);
      this.headCurrent.setFromEuler(new THREE.Euler(H.x[0], H.y[0], H.z[0], "YXZ"));
    }
    this.headPivot.quaternion.copy(this.headCurrent);
    // breathing: a slow, slightly uneven rise and fall of the whole head; float: a slow smooth drift
    if ((this.bob || this.float) && !tracking && this.opts.idle)
      this.root.position.y = this.bob * (Math.sin(t * 1.25) + 0.25 * Math.sin(t * 0.53 + 1)) + this.float * smoothNoise(t, S + 6, 0.13);
    this.applyRig();
    for (const a of this.addons) a.tick(dt); // add-on hook (hands)
  }

  private *allDriven(): Generator<Driven> {
    yield* this.driven;
    for (const s of SLOTS) yield* this.parts[s]?.driven ?? [];
    yield* this.extras.driven;
  }

  private applyRig() {

    for (const d of this.allDriven()) {
      const inf = d.mesh.morphTargetInfluences!;
      for (const [idx, s] of d.slots) inf[idx] = this.current[s];
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Colour pipeline of every avatar renderer (own or a stage's shared one). */
export function configureRenderer(r: THREE.WebGLRenderer) {
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 1.0;
  r.localClippingEnabled = true;
}

/** Soft studio reflections (a stage makes this once for all its heads). */
export function makeEnvironment(r: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(r);
  const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return tex;
}

function scaled(w: Weights, k: number): Weights {
  for (const key of Object.keys(w)) w[key] = (w[key] ?? 0) * k;
  return w;
}

function smooth(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function roleOf(src: THREE.Mesh): string {
  return (src.name || "").split(/[._]/)[0].toLowerCase();
}

function isSkin(o: Owned): boolean {
  const r = o.mesh.userData.role as string;
  return r === "skin" || r === "skinDetail" || r === "mouth";
}

/** Free the GPU buffers we created for a mesh (shared GLB attributes stay with the cache). */
function disposeOwnGeometry(g: THREE.BufferGeometry) {
  g.dispose();
}

/** Default iris colour: the authored one, unless it's so dark the iris would read as a black disc. */
function irisDefault(b: HeadzBase): string {
  const { h, s, l } = srgb(b.iris).getHSL({ h: 0, s: 0, l: 0 });
  // near-black discs and the pale pinkish-grey baked averages of some sources read as "no colour"
  return l < 0.06 || ((h < 0.1 || h > 0.9) && s < 0.4 && l > 0.4) ? "#5C3B22" : b.iris;
}

function nearest(pts: Float32Array, x: number, y: number, z: number): [number, number, number] {
  let best = Infinity, bi = 0;
  for (let i = 0; i < pts.length; i += 3) {
    const d = (pts[i] - x) ** 2 + (pts[i + 1] - y) ** 2 + (pts[i + 2] - z) ** 2;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  return [pts[bi], pts[bi + 1], pts[bi + 2]];
}

/** Brow style on the brow mesh: arch the middle, tilt the tails, lift, thicken/thin around the centre line. */
function browStyle(p: Float32Array, s: { arch: number; tilt: number; lift: number }, thickness: number) {
  if (!s.arch && !s.tilt && !s.lift && !thickness) return;
  for (const side of [1, -1]) {
    const idx: number[] = [];
    for (let i = 0; i < p.length; i += 3) if (p[i] * side > 0) idx.push(i);
    if (!idx.length) continue;
    let lo = Infinity, hi = -Infinity;
    for (const i of idx) {
      lo = Math.min(lo, p[i] * side);
      hi = Math.max(hi, p[i] * side);
    }
    const cx = (lo + hi) / 2, hw = Math.max(1e-3, (hi - lo) / 2);
    // centre line: mean height of the brow in thin vertical slices
    const B = 16;
    const sum = new Float32Array(B), cnt = new Float32Array(B);
    const slice = (i: number) => Math.min(B - 1, Math.max(0, Math.floor(((p[i] * side - lo) / (hi - lo + 1e-6)) * B)));
    for (const i of idx) {
      sum[slice(i)] += p[i + 1];
      cnt[slice(i)]++;
    }
    for (const i of idx) {
      const u = (p[i] * side - cx) / hw; // −1 inner … +1 outer
      const b = slice(i);
      const mid = cnt[b] ? sum[b] / cnt[b] : p[i + 1];
      let y = mid + (p[i + 1] - mid) * (1 + 0.55 * thickness);
      y += 0.04 * s.arch * (1 - u * u) + 0.035 * s.tilt * u + 0.03 * s.lift;
      p[i + 1] = y;
    }
  }
}

/** Lash length: stretch the lashes away from the eyeball (0 = as authored). */
function lashLength(p: Float32Array, f: ReturnType<typeof frameOf>, len: number) {
  if (!len) return;
  const k = 1 + 0.7 * len;
  for (let i = 0; i < p.length; i += 3) {
    const e = f.eyes.find((x) => x.c[0] * p[i] > 0) ?? f.eyes[0];
    const dx = p[i] - e.c[0], dy = p[i + 1] - e.c[1], dz = p[i + 2] - e.c[2];
    const r = Math.hypot(dx, dy, dz);
    const r0 = e.r * 1.02;
    if (r <= r0) continue;
    const nr = r0 + (r - r0) * k;
    p[i] = e.c[0] + (dx / r) * nr;
    p[i + 1] = e.c[1] + (dy / r) * nr;
    p[i + 2] = e.c[2] + (dz / r) * nr;
  }
}
