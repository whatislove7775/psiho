/**
 * HandsRig — the two floating (Memoji-style, no arms) hands in the avatar
 * scene. Loads the per-group hand GLB (tools/headz/export_hands.py), tints it
 * with the avatar's skin tone, poses the 21-bone skeletons from HandTracker
 * output (handMath.solveHand) and places them next to the head:
 *   • position from the hand's place in the picture relative to the face,
 *     depth from its size; clamped to the frame and pushed in front of the
 *     face instead of clipping through it;
 *   • fades in when a hand appears, out ~300 ms after it's gone;
 *   • eased toward every new detection (~15 fps) so motion stays smooth at 30–60 fps.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { BONES, PLACE, qinv, qmul, qrot, restFromLocal, solveHand, type HandRest } from "./handMath.mjs";
import type { HandPose, HandSide } from "./HandTracker";

/** hand length (wrist → middle fingertip) in head units (chin → crown = 2) */
export const HAND_SCALE = 1.05;
const FADE_IN_S = 0.16;
const FADE_OUT_S = 0.24;
/** fade a hand out this long after the detector stopped finding it */
export const HAND_HOLD_MS = 300;
/** …or when no hand results arrive at all for this long (detector stalled / slow device) */
const STALL_MS = 1000;
const POS_RATE = 16;
const ROT_RATE = 20;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

interface HandView {
  holder: THREE.Group;
  bones: THREE.Object3D[];
  rest: HandRest;
  mat: THREE.MeshPhysicalMaterial;
  target: THREE.Quaternion[];
  pos: THREE.Vector3;
  opacity: number;
  lastSeen: number;
  /** first detection result without this hand (null while it is being found) */
  missSince: number | null;
  /** palm centre relative to the wrist in the rest pose (hand root space, model units) */
  palm: number[];
}

export interface HandsStage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class HandsRig {
  readonly group = new THREE.Group();
  private views: Partial<Record<HandSide, HandView>> = {};
  private url = "";
  private skin = new THREE.Color("#e0ac8a");
  private visible = true;
  private disposed = false;

  constructor(private stage: HandsStage) {
    this.group.name = "hands";
    stage.scene.add(this.group);
  }

  private pending: Promise<void> = Promise.resolve();

  /** Load the hands of a character group (same promise while that model is loading / loaded). */
  load(url: string): Promise<void> {
    if (url === this.url) return this.pending;
    this.url = url;
    this.pending = this.doLoad(url);
    return this.pending;
  }

  private async doLoad(url: string) {
    const gltf = await loader.loadAsync(url);
    if (this.disposed || url !== this.url) return;
    this.clear();
    for (const side of ["L", "R"] as HandSide[]) {
      const node = gltf.scene.getObjectByName(`hand${side}`);
      if (!node) continue;
      const nodes: Record<string, { t: number[]; r: number[] }> = {};
      const byName = new Map<string, THREE.Object3D>();
      node.traverse((o) => {
        // GLTFLoader makes duplicate names unique ("wrist_1" in the second hand)
        const name = o.name.replace(/_\d+$/, "");
        if (/^(wrist|thumb|index|middle|ring|pinky)/.test(name)) {
          nodes[name] = { t: o.position.toArray(), r: o.quaternion.toArray() as number[] };
          byName.set(name, o);
        }
      });
      let rest: HandRest;
      try {
        rest = restFromLocal(nodes);
      } catch (e) {
        console.warn("[hands]", e);
        continue;
      }
      const bones = BONES.map((b) => byName.get(b.name)!);
      const mat = new THREE.MeshPhysicalMaterial({
        color: this.skin,
        roughness: 0.5,
        sheen: 0.45,
        sheenRoughness: 0.55,
        sheenColor: this.skin.clone().lerp(new THREE.Color("#ffd9cf"), 0.5),
        clearcoat: 0.04,
        clearcoatRoughness: 0.6,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      node.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (m.isMesh) {
          m.material = mat;
          m.frustumCulled = false;
        }
      });
      const holder = new THREE.Group();
      holder.name = `hand${side}Holder`;
      holder.add(node);
      holder.visible = false;
      holder.scale.setScalar(HAND_SCALE / rest.length);
      this.group.add(holder);
      const J = (n: string) => rest.joints[BONES.findIndex((b) => b.name === n)].pos;
      const palm = [0, 1, 2].map((i) => (J("index1")[i] + J("middle1")[i] + J("pinky1")[i] + J("wrist")[i]) / 4 - J("wrist")[i]);
      this.views[side] = {
        holder,
        bones,
        rest,
        mat,
        target: bones.map((b) => b.quaternion.clone()),
        pos: new THREE.Vector3(),
        opacity: 0,
        lastSeen: -1e9,
        missSince: null,
        palm,
      };
    }
  }

  /** Skin tone (sRGB hex) — the hands always match the avatar's face. */
  setSkin(hex: string) {
    this.skin.set(hex);
    for (const v of Object.values(this.views)) {
      v!.mat.color.copy(this.skin);
      v!.mat.sheenColor.copy(this.skin).lerp(new THREE.Color("#ffd9cf"), 0.5);
    }
  }

  /** Show/hide both hands (fades). */
  setVisible(on: boolean) {
    this.visible = on;
    if (!on) for (const v of Object.values(this.views)) v!.lastSeen = -1e9;
  }

  /** A detection result came without this hand. */
  setMissing(side: HandSide, now = performance.now()) {
    const v = this.views[side];
    if (v && v.missSince === null) v.missSince = now;
  }

  /** Lowest opacity of the hands being shown (labs wait for 1 before a screenshot). */
  minOpacity() {
    return Math.min(1, ...Object.values(this.views).map((v) => (v!.missSince === null && v!.lastSeen > 0 ? v!.opacity : 1)));
  }

  get loaded() {
    return !!(this.views.L || this.views.R);
  }

  /** A new filtered pose for one hand (from HandTracker). */
  setPose(side: HandSide, pose: HandPose, now = performance.now()) {
    const v = this.views[side];
    if (!v || !this.visible) return;
    const local = solveHand(v.rest, pose.points);
    local.forEach((q, i) => v.target[i].set(q[0], q[1], q[2], q[3]));
    // place: palm centre → clamped anchor; the wrist (hand root origin) follows from the wrist rotation
    const anchor = this.clampAnchor(pose.anchor);
    const delta = qmul(local[0], qinv(v.rest.joints[0].quat));
    const off = qrot(delta, v.palm);
    const s = HAND_SCALE / v.rest.length;
    const root = new THREE.Vector3(anchor[0] - off[0] * s, anchor[1] - off[1] * s, anchor[2] - off[2] * s);
    const fresh = v.opacity <= 0.001;
    v.lastSeen = now;
    v.missSince = null;
    v.pos.copy(root);
    if (fresh) {
      // appearing: start in place, no fly-in from the old position
      v.holder.position.copy(root);
      v.bones.forEach((b, i) => b.quaternion.copy(v.target[i]));
    }
  }

  /** Keep the palm inside the frame, and in front of the face where it overlaps the head. */
  clampAnchor(a: number[]): number[] {
    let [x, y, z] = a;
    const cam = this.stage.camera;
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // not through the head: inside the head's silhouette the hand comes in front of the face
    const rx = 1.0 + 0.25 * HAND_SCALE;
    const ry = 1.15 + 0.25 * HAND_SCALE;
    const e = (x / rx) ** 2 + (y / ry) ** 2;
    const zFront = 1.2;
    z = Math.max(z, zFront + (PLACE.zMin - zFront) * smooth(1, 1.6, e));
    const halfH = Math.max(0.3, (cam.position.z - z) * tanH);
    const halfW = halfH * cam.aspect;
    const mx = Math.max(0, halfW - 0.5 * HAND_SCALE);
    const cy = cam.position.y - 0.08;
    x = Math.max(-mx, Math.min(mx, x));
    y = Math.max(cy - halfH + 0.45 * HAND_SCALE, Math.min(cy + halfH - 0.45 * HAND_SCALE, y));
    return [x, y, z];
  }

  /** Per animated frame (HeadzRenderer add-on tick). */
  tick(dt: number, now = performance.now()) {
    const kp = 1 - Math.exp(-dt * POS_RATE);
    const kr = 1 - Math.exp(-dt * ROT_RATE);
    for (const v of Object.values(this.views)) {
      if (!v) continue;
      const gone = v.missSince !== null ? now - v.missSince > HAND_HOLD_MS : now - v.lastSeen > STALL_MS;
      const want = this.visible && !gone ? 1 : 0;
      v.opacity = want ? Math.min(1, v.opacity + dt / FADE_IN_S) : Math.max(0, v.opacity - dt / FADE_OUT_S);
      v.holder.visible = v.opacity > 0.001;
      if (!v.holder.visible) continue;
      v.mat.opacity = v.opacity;
      v.mat.transparent = v.opacity < 0.999;
      v.mat.depthWrite = true;
      const base = HAND_SCALE / v.rest.length;
      v.holder.scale.setScalar(base * (0.88 + 0.12 * v.opacity));
      v.holder.position.lerp(v.pos, kp);
      v.bones.forEach((b, i) => b.quaternion.slerp(v.target[i], kr));
    }
  }

  private clear() {
    for (const v of Object.values(this.views)) {
      if (!v) continue;
      this.group.remove(v.holder);
      v.mat.dispose();
      v.holder.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.views = {};
  }

  dispose() {
    this.disposed = true;
    this.clear();
    this.stage.scene.remove(this.group);
  }
}

