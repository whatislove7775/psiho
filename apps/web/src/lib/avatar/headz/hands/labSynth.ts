/**
 * «Synthetic hands» for the labs (/dev/headz-lab?mode=hands, admin lab):
 * poses the floating hands of a live HeadzRenderer from synthetic landmark sets
 * (synthHands.mjs) through the exact runtime path (HandTracker → solver → rig),
 * without a camera.
 */
import type { AvatarConfig } from "../../schema";
import { HandsController, type HandsHost } from "./HandsController";
import { synthDetection } from "./synthHands.mjs";

export const LAB_HAND_SCENES: { label: string; right: string; left: string; rightAt?: [number, number]; leftAt?: [number, number]; near?: number }[] = [
  { label: "open palms", right: "open", left: "open" },
  { label: "fists", right: "fist", left: "fist" },
  { label: "thumbs up", right: "thumbsUp", left: "thumbsUp" },
  { label: "peace", right: "peace", left: "peace" },
  { label: "pointing", right: "point", left: "point" },
  { label: "wave near face", right: "open", left: "point", rightAt: [0.43, 0.5], near: 1.5 },
];

const controllers = new WeakMap<object, HandsController>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Face at the frame centre: forehead (lm 10) y 0.25, chin (lm 152) y 0.55 → face height 0.3. */
const FACE = (() => {
  const lm = Array.from({ length: 153 }, () => ({ x: 0.5, y: 0.4 }));
  lm[10] = { x: 0.5, y: 0.25 };
  lm[152] = { x: 0.5, y: 0.55 };
  return lm;
})();

interface Renderer extends HandsHost {
  setExpression(w: Record<string, number>): void;
  setIdle(on: boolean): void;
  start(): void;
  whenReady(): Promise<void>;
}

/**
 * Pose both hands for one scene and let them settle (≥ `ms`). The renderer keeps running.
 * `ctl`: an existing controller of that renderer (live labs); otherwise one is made for it.
 */
export async function poseSyntheticHands(
  r: Renderer,
  cfg: AvatarConfig,
  scene: (typeof LAB_HAND_SCENES)[number],
  aspect = 4 / 3,
  opts: { ctl?: HandsController; ms?: number; live?: boolean } = {},
) {
  let ctl = opts.ctl ?? controllers.get(r);
  if (!ctl) {
    ctl = new HandsController(r);
    controllers.set(r, ctl);
  }
  if (!opts.live) {
    ctl.setConfig(cfg);
    ctl.setEnabled(true);
  }
  await ctl.ready();
  if (!opts.live) {
    r.setExpression({});
    r.setIdle(false);
    r.start();
    await r.whenReady();
  }
  const pxPerM = (0.3 / 0.18) * (scene.near ?? 1.12);
  const t0 = performance.now();
  // feed ~20 fps for 0.8 s, then until the hands are fully faded in (slow software GL in CI)
  const ms = opts.ms ?? 800;
  while (performance.now() - t0 < ms || (ctl.rig.minOpacity() < 1 && performance.now() - t0 < 30000)) {
    const now = performance.now();
    if (!ctl.on) break;
    if (!opts.live) ctl.onFace(FACE, aspect, now);
    ctl.onHands(
      {
        hands: [
          synthDetection({ gesture: scene.right, hand: "right", at: { x: scene.rightAt?.[0] ?? 0.27, y: scene.rightAt?.[1] ?? 0.8 }, pxPerM, aspect }),
          synthDetection({ gesture: scene.left, hand: "left", at: { x: scene.leftAt?.[0] ?? 0.73, y: scene.leftAt?.[1] ?? 0.8 }, pxPerM, aspect }),
        ],
      },
      now,
      aspect,
    );
    await sleep(50);
  }
}

export function disposeSyntheticHands(r: object) {
  controllers.get(r)?.dispose();
  controllers.delete(r);
}
