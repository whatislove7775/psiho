/**
 * HeadzRenderer — renders an AvatarConfig (v3) with the HEADZ 2.0 characters
 * (public/avatar/headz/*, built by tools/headz from the purchased sources).
 * Drop-in replacement for the older KitRenderer: same public API
 * (setConfig / applyFaceResult / setExpression / lookAt / renderNow …).
 *
 * Face GLB: one mesh per part (skin, eyes, brows, lashes, teeth, tongue, ears)
 * with ARKit-named morph targets; MediaPipe blendshape names map 1:1.
 * Parts (hair, beard, eyewear, headwear, earrings) are separate GLBs in the
 * same normalised head space (neck ≈ −1, crown ≈ +1, +Z front).
 * Materials are named by role in the GLB and restyled here.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { normalizeAvatar, type AvatarConfig } from "../schema";
import type { AvatarRendererApi, FaceResult, Framing, RendererOptions } from "../kit/types";
import { headzBase, headzPart, headzRim } from "./catalog";
import type { HeadzSlot } from "./types";

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

const SHAPE_INDEX = new Map<string, number>(SHAPES.map((s, i) => [s, i]));
const SLOTS: HeadzSlot[] = ["hair", "beard", "eyewear", "headwear", "earrings"];

const srgb = (hex: string) => new THREE.Color(hex);

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

  private cfg: AvatarConfig | null = null;
  private faceKey = "";
  private faceGroup: THREE.Group | null = null;
  private driven: Driven[] = [];
  private parts: Partial<Record<HeadzSlot, { key: string; group: THREE.Group | null }>> = {};
  private loading: Promise<void> = Promise.resolve();
  /** hair is clipped above the hat rim (plane in head space, copied to world space every frame) */
  private hatPlaneLocal: THREE.Plane | null = null;
  private hatPlane = new THREE.Plane();

  // restylable materials; skin and iris are per source material (some bases carry textures)
  private mats = {
    eyeWhite: new THREE.MeshPhysicalMaterial({ color: "#f3efea", roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: "#050505", roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 }),
    brows: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    lashes: new THREE.MeshStandardMaterial({ color: "#1a1412", roughness: 0.7, side: THREE.DoubleSide }),
    teeth: new THREE.MeshPhysicalMaterial({ color: "#f5f0e6", roughness: 0.35, clearcoat: 0.5 }),
    gums: new THREE.MeshStandardMaterial({ color: "#d9636a", roughness: 0.55 }),
    hair: new THREE.MeshPhysicalMaterial({ roughness: 0.55, sheen: 0.7, sheenRoughness: 0.4, side: THREE.DoubleSide }),
  };
  /** per-face materials that depend on the source (skin, iris, mouth) — rebuilt for every base */
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
  private idle = { nextBlink: 1.5, blinkT: -1, glanceAt: 2, gx: 0, gy: 0 };

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions & { lod?: boolean } = {}) {
    this.canvas = canvas;
    this.lod = !!opts.lod;
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
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.localClippingEnabled = true;
    if (this.opts.background) this.scene.background = new THREE.Color(this.opts.background);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
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
    this.loading = this.ensure(c).then(() => this.applyColors(c));
  }

  private async ensure(c: AvatarConfig) {
    const base = headzBase(c.base);
    const faceUrl = (this.lod && base.lod) || base.face;
    if (this.faceKey !== faceUrl) {
      this.faceKey = faceUrl;
      const gltf = await loadGLTF(faceUrl);
      if (this.faceKey !== faceUrl) return; // superseded
      const g = new THREE.Group();
      const driven: Driven[] = [];
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
      });
      if (this.faceGroup) this.head.remove(this.faceGroup);
      this.faceMats.forEach((f) => f.mat.dispose());
      this.faceMats = faceMats;
      this.faceGroup = g;
      this.driven = driven;
      this.head.add(g);
      // parts belong to a base: drop them so they reload for the new one
      for (const s of SLOTS) this.setPart(s, null);
    }
    await Promise.all(SLOTS.map((s) => this.setPart(s, headzPart(c.base, s, c[s]))));
    const rim = headzRim(c.base, c.headwear);
    if (rim) {
      // keep hair where y ≤ rim(z) + margin; rim(z) runs from the front (z = +0.7) to the back (z = −0.7)
      const [yf, yb] = rim;
      const b = (yf - yb) / 1.4;
      const a = (yf + yb) / 2 + 0.06;
      const n = new THREE.Vector3(0, -1, b);
      const len = n.length();
      this.hatPlaneLocal = new THREE.Plane(n.divideScalar(len), a / len);
      this.mats.hair.clippingPlanes = [this.hatPlane];
    } else {
      this.hatPlaneLocal = null;
      this.mats.hair.clippingPlanes = [];
    }
    this.mats.hair.needsUpdate = true;
    this.applyRig();
  }

  /** Build our own mesh (own morph influences, restyled material) from a loaded mesh. */
  private adopt(src: THREE.Mesh, kind: "face" | HeadzSlot, faceMats?: HeadzRenderer["faceMats"]): THREE.Mesh | null {
    const srcMat = (Array.isArray(src.material) ? src.material[0] : src.material) as THREE.MeshStandardMaterial;
    const role = (srcMat?.name || "").replace(/\.\d+$/, "");
    if (role === "cloth" || role === "eyeLens") return null;
    let mat: THREE.Material;
    switch (role) {
      case "skin":
      case "iris":
      case "mouth": {
        const m = new THREE.MeshPhysicalMaterial({
          color: srcMat.map ? 0xffffff : srcMat.color,
          map: srcMat.map ?? null,
          roughness: role === "skin" ? 0.5 : 0.3,
          sheen: role === "skin" ? 0.45 : 0,
          sheenRoughness: 0.55,
          clearcoat: role === "iris" ? 1 : role === "skin" ? 0.04 : 0.2,
          clearcoatRoughness: role === "iris" ? 0.03 : 0.6,
        });
        m.name = role;
        faceMats?.push({ mat: m, role, src: srcMat.color.clone(), mapped: !!srcMat.map });
        mat = m;
        break;
      }
      case "eyeWhite":
      case "pupil":
      case "brows":
      case "lashes":
      case "teeth":
      case "gums":
        mat = this.mats[role];
        break;
      case "hair":
        mat = this.mats.hair;
        break;
      default: {
        // frames, lenses, hats, earrings: keep the authored look
        const m = new THREE.MeshPhysicalMaterial({
          color: srcMat.color,
          map: srcMat.map ?? null,
          roughness: srcMat.roughness,
          metalness: srcMat.metalness,
          transparent: srcMat.transparent,
          opacity: srcMat.opacity,
          side: kind === "face" ? THREE.FrontSide : THREE.DoubleSide,
          clearcoat: role === "glassLens" ? 1 : role.startsWith("frame") ? 0.5 : 0,
          clearcoatRoughness: 0.1,
          sheen: role.startsWith("headwear") ? 0.6 : 0,
          sheenRoughness: 0.5,
        });
        if (role === "glassLens") {
          m.transparent = true;
          m.opacity = Math.min(m.opacity, 0.35);
          m.depthWrite = false;
        }
        m.name = role;
        if (kind !== "face") this.partMats.add(m);
        else faceMats?.push({ mat: m, role, src: srcMat.color.clone(), mapped: !!srcMat.map });
        mat = m;
      }
    }
    const mesh = new THREE.Mesh(src.geometry, mat);
    mesh.name = src.name;
    // gltfpack stores dequantisation in the node transform — keep it
    mesh.applyMatrix4(src.matrixWorld);
    if (src.geometry.morphAttributes.position?.length) {
      mesh.updateMorphTargets();
      mesh.morphTargetDictionary = { ...(src.morphTargetDictionary ?? {}) };
    }
    mesh.frustumCulled = false;
    return mesh;
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
  private async setPart(slot: HeadzSlot, file: string | null) {
    const key = file ?? "";
    if (this.parts[slot]?.key === key) return;
    const prev = this.parts[slot]?.group;
    this.parts[slot] = { key, group: null };
    let group: THREE.Group | null = null;
    if (file) {
      try {
        const gltf = await loadGLTF(file);
        if (this.parts[slot]?.key !== key) return; // superseded
        gltf.scene.updateMatrixWorld(true);
        group = new THREE.Group();
        const g = group;
        gltf.scene.traverse((o) => {
          const src = o as THREE.Mesh;
          if (!src.isMesh) return;
          const m = this.adopt(src, slot);
          if (m) g.add(m);
        });
      } catch {
        group = null;
      }
    }
    if (prev) {
      this.head.remove(prev);
      prev.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && this.partMats.has(m)) {
          m.dispose();
          this.partMats.delete(m);
        }
      });
    }
    if (group) this.head.add(group);
    this.parts[slot] = { key, group };
  }

  private applyColors(c: AvatarConfig) {
    const base = headzBase(c.base);
    const skinOverride = c.skin ? srgb(c.skin) : null;
    const baseSkin = srgb(base.skin);
    const eye = c.eyeColor ? srgb(c.eyeColor) : null;
    for (const f of this.faceMats) {
      if (f.role === "skin") {
        if (f.mapped) {
          // texture carries the authored tone; tint by the ratio to reach the chosen one
          f.mat.color.setRGB(1, 1, 1);
          if (skinOverride) f.mat.color.setRGB(
            Math.min(2, skinOverride.r / Math.max(0.02, baseSkin.r)),
            Math.min(2, skinOverride.g / Math.max(0.02, baseSkin.g)),
            Math.min(2, skinOverride.b / Math.max(0.02, baseSkin.b)),
          );
        } else {
          f.mat.color.copy(skinOverride ?? f.src);
        }
        f.mat.sheenColor.copy(skinOverride ?? (f.mapped ? baseSkin : f.src)).lerp(new THREE.Color("#ffd9cf"), 0.5);
      } else if (f.role === "iris") {
        f.mat.color.copy(eye ?? (f.mapped ? srgb(base.iris) : f.src));
      }
    }
    const hair = srgb(c.hairColor ?? base.hair);
    this.mats.hair.color.copy(hair);
    this.mats.hair.sheenColor.copy(hair).lerp(new THREE.Color("#ffffff"), 0.35);
    this.mats.brows.color.copy(hair).multiplyScalar(0.75);
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
    this.camera.position.set(0, cy + 0.08, d);
    this.camera.lookAt(0, cy, 0);
    this.camera.updateProjectionMatrix();
  }

  /** Called after every rendered frame (e.g. to push it to a captureStream(0) track). */
  onRender: (() => void) | null = null;

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

  async renderOnceAsync(yaw = 0) {
    await this.loading;
    this.current.fill(0);
    for (const [k, v] of Object.entries(this.manual)) {
      const i = SHAPE_INDEX.get(k);
      if (i !== undefined) this.current[i] = v ?? 0;
    }
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

  /** Morph influences actually applied to the face meshes (debug: proves the name mapping). */
  debugMorphs(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const d of this.driven) {
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
        // no random glances while following a pointer — keep eye contact with it
        const following = Math.abs(this.look.yaw) + Math.abs(this.look.pitch) > 0.02;
        I.gx = following ? 0 : (Math.random() * 2 - 1) * 0.35;
        I.gy = following ? 0 : (Math.random() * 2 - 1) * 0.2;
      }
      // Head: +yaw turns toward screen right; pitch < 0 (pointer above) must tilt the face UP, i.e. a
      // negative rotation about X (a positive one would swing the face down toward the floor).
      // Gaze: +gx = toward screen right = the avatar's own left (+X): left eye looks out, right eye in.
      const gx = I.gx + this.look.yaw * 1.5, gy = I.gy - this.look.pitch * 1.5;
      target.eyeLookOutLeft = Math.max(0, gx);
      target.eyeLookInRight = Math.max(0, gx);
      target.eyeLookInLeft = Math.max(0, -gx);
      target.eyeLookOutRight = Math.max(0, -gx);
      target.eyeLookUpLeft = target.eyeLookUpRight = Math.max(0, gy);
      target.eyeLookDownLeft = target.eyeLookDownRight = Math.max(0, -gy);
      this.headTarget.setFromEuler(
        new THREE.Euler(Math.sin(t * 0.27 + 1) * 0.035 + this.look.pitch, Math.sin(t * 0.35) * 0.06 + this.look.yaw, Math.sin(t * 0.22) * 0.025, "YXZ"),
      );
    }
    // Tracked input is already One-Euro filtered (FaceTracker), so it is followed almost directly.
    const k = 1 - Math.exp(-dt * (tracking ? TRACK_RATE : 14));
    const kb = 1 - Math.exp(-dt * (tracking ? TRACK_RATE : 40));
    for (let i = 0; i < SHAPES.length; i++) {
      const s = SHAPES[i];
      const cur = this.current[i];
      this.current[i] = cur + ((target[s] ?? 0) - cur) * (i === 8 || i === 9 ? kb : k);
    }
    this.headCurrent.slerp(this.headTarget, 1 - Math.exp(-dt * (tracking ? TRACK_RATE : 12)));
    this.headPivot.quaternion.copy(this.headCurrent);
    this.applyRig();
  }

  private applyRig() {
    if (this.hatPlaneLocal) {
      this.head.updateMatrixWorld(true);
      this.hatPlane.copy(this.hatPlaneLocal).applyMatrix4(this.head.matrixWorld);
    }
    for (const d of this.driven) {
      const inf = d.mesh.morphTargetInfluences!;
      for (const [idx, s] of d.slots) inf[idx] = this.current[s];
    }
  }
}
