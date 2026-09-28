/**
 * HandsController — glue between the detector (HandLandmarker in the tracking
 * worker), HandTracker (filtering/placement) and HandsRig (the floating hands
 * in the HEADZ scene). One per live avatar; created by useAvatarCamera, or
 * fed synthetic landmarks by the labs.
 *
 * Perf safety net: while hands are on, the controller watches avatarPerf; if
 * the hand model is slow here (> 45 ms per run) or face tracking starves
 * (< 12 detections/s at ≥ 20 camera fps) hands are switched off for the rest
 * of this camera session (`avatarPerf.hands = "auto-off"`), so the face never
 * suffers for them.
 */
import { normalizeAvatar, type AvatarConfig } from "../../schema";
import { headzBase } from "../catalog";
import { avatarPerf } from "../../../tracking/perf";
import type { HandsRaw } from "../../../tracking/handTypes";
import { HandTracker, type HandSide } from "./HandTracker";
import { HandsRig, type HandsStage } from "./HandsRig";
import { GestureDetector, classifyFrame, type Gesture } from "./gestures";
import { HANDS_BY_GROUP } from "./manifest.gen";

/** What HeadzRenderer exposes for add-ons (see its "add-on hook"). */
export interface HandsHost {
  readonly stage: HandsStage;
  readonly addons: Set<{ tick(dt: number): void }>;
}

const SLOW_MS = 45;
const STARVED_FPS = 12;

export class HandsController {
  readonly tracker = new HandTracker();
  readonly rig: HandsRig;
  private enabled = false;
  private auto = false;
  private url = "";
  private detector: { setHands?(on: boolean): void } | null = null;
  private addon = { tick: (dt: number) => this.rig.tick(dt) };
  private watch: ReturnType<typeof setInterval> | undefined;
  private since = 0;
  private gestures = new GestureDetector();
  /** Recognised gestures (debounced), while hands run; null = gesture recognition off. */
  onGesture: ((g: Gesture) => void) | null = null;

  constructor(private host: HandsHost, opts: { mirror?: boolean } = {}) {
    this.tracker.mirror = opts.mirror ?? true;
    this.rig = new HandsRig(host.stage);
    host.addons.add(this.addon);
  }

  /** Character group → hand model; skin tone → tint. */
  setConfig(cfg: AvatarConfig) {
    const c = normalizeAvatar(cfg);
    const base = headzBase(c.base);
    this.url = HANDS_BY_GROUP[base.group] ?? HANDS_BY_GROUP.man ?? "";
    this.rig.setSkin(c.skin ?? base.skin);
    if (this.enabled) void this.rig.load(this.url).catch(() => undefined);
  }

  attachDetector(det: { setHands?(on: boolean): void } | null) {
    this.detector = det;
    this.apply();
  }

  get on() {
    return this.enabled && !this.auto;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.apply();
  }

  private apply() {
    const on = this.on;
    this.rig.setVisible(on);
    this.detector?.setHands?.(on);
    avatarPerf.hands = this.auto ? "auto-off" : on ? "on" : "off";
    if (on && this.url) void this.rig.load(this.url).catch(() => undefined);
    clearInterval(this.watch);
    this.watch = undefined;
    if (on && this.detector) {
      this.since = performance.now();
      this.watch = setInterval(() => this.check(), 2000);
    } else if (!on) {
      this.tracker.reset();
    }
  }

  private check() {
    if (!this.on) return;
    const cost = avatarPerf.handCost();
    const snap = avatarPerf.snapshot();
    const slow = cost.n >= 15 && cost.ms > SLOW_MS;
    const starved = performance.now() - this.since > 6000 && snap.camFps >= 20 && snap.detectFps > 0 && snap.detectFps < STARVED_FPS;
    if (slow || starved) {
      this.auto = true;
      avatarPerf.log(`hands auto-off: ${slow ? `hand model ${cost.ms.toFixed(1)} ms` : `face ${snap.detectFps} fps`}`);
      this.apply();
    }
  }

  /** Face landmarks of the latest frame (hands are placed relative to the face). */
  onFace(lm: { x: number; y: number }[] | null | undefined, aspect: number, tMs: number) {
    if (this.on) this.tracker.setFace(lm, aspect, tMs);
  }

  /** Hand landmarks of a frame (from the detector, or synthetic). */
  onHands(raw: HandsRaw, since: number, aspect: number) {
    if (!this.on) return;
    this.tracker.camDist = this.host.stage.camera.position.length();
    const poses = this.tracker.process(raw, aspect, since);
    if (this.onGesture) {
      const g = this.gestures.update(classifyFrame(raw.hands, this.tracker.faceRef(since), aspect), since);
      if (g) this.onGesture(g);
    }
    const now = performance.now();
    for (const side of ["L", "R"] as HandSide[]) {
      const p = poses[side];
      if (p) this.rig.setPose(side, p, now);
      else this.rig.setMissing(side, now);
    }
  }

  /** Lab: wait until the hand model is in the scene. */
  async ready() {
    if (this.url) await this.rig.load(this.url).catch(() => undefined);
  }

  dispose() {
    clearInterval(this.watch);
    this.detector?.setHands?.(false);
    this.host.addons.delete(this.addon);
    this.rig.dispose();
  }
}
