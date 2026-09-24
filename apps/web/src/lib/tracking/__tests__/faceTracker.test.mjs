// End-to-end FaceTracker checks on synthetic frames. Imports the .ts file
// directly (Node ≥ 22.18 strips types natively; no dependencies needed).
import assert from "node:assert/strict";
import { test } from "node:test";
import { FaceTracker } from "../FaceTracker.ts";
import { LM, poseToMatrix } from "../faceMath.mjs";
import { edit, neutralFace, toLandmarks } from "./synthFace.mjs";

const NAMES = ("_neutral browDownLeft browDownRight browInnerUp browOuterUpLeft browOuterUpRight cheekPuff " +
  "cheekSquintLeft cheekSquintRight eyeBlinkLeft eyeBlinkRight eyeLookDownLeft eyeLookDownRight eyeLookInLeft " +
  "eyeLookInRight eyeLookOutLeft eyeLookOutRight eyeLookUpLeft eyeLookUpRight eyeSquintLeft eyeSquintRight " +
  "eyeWideLeft eyeWideRight jawForward jawLeft jawOpen jawRight mouthClose mouthDimpleLeft mouthDimpleRight " +
  "mouthFrownLeft mouthFrownRight mouthFunnel mouthLeft mouthLowerDownLeft mouthLowerDownRight mouthPressLeft " +
  "mouthPressRight mouthPucker mouthRight mouthRollLower mouthRollUpper mouthShrugLower mouthShrugUpper " +
  "mouthSmileLeft mouthSmileRight mouthStretchLeft mouthStretchRight mouthUpperDownLeft mouthUpperDownRight " +
  "noseSneerLeft noseSneerRight").split(" ");
assert.equal(NAMES.length, 52);

// This user's resting face reads as slightly raised brows / smiling.
const REST_BS = { browInnerUp: 0.25, mouthSmileLeft: 0.15, mouthSmileRight: 0.18, eyeBlinkLeft: 0.1, eyeBlinkRight: 0.12, jawOpen: 0.04 };

function frame(face, bs = {}, pose = { x: 0, y: 0, z: 0 }) {
  return {
    faceLandmarks: [toLandmarks(face)],
    faceBlendshapes: [{ categories: NAMES.map((n) => ({ categoryName: n, score: bs[n] ?? REST_BS[n] ?? 0.01 })) }],
    facialTransformationMatrixes: [{ data: poseToMatrix({ ...pose, sx: 1, sy: 1, sz: 1, tx: 0, ty: 0, tz: -45 }) }],
  };
}

const score = (res, name) => res.faceBlendshapes[0].categories.find((c) => c.categoryName === name).score;

function calibrated() {
  const tr = new FaceTracker();
  let t = 0;
  let res;
  for (let i = 0; i < 60; i++, t += 33.3) res = tr.process(frame(neutralFace()), t);
  return { tr, t, res };
}

test("no face → null", () => {
  assert.equal(new FaceTracker().process({ faceBlendshapes: [] }, 0), null);
  assert.equal(new FaceTracker().process(null, 0), null);
});

test("output keeps MediaPipe FaceResult shape and category order", () => {
  const { res } = calibrated();
  assert.deepEqual(res.faceBlendshapes[0].categories.map((c) => c.categoryName), NAMES);
  assert.equal(res.facialTransformationMatrixes[0].data.length, 16);
});

test("calibrates in ~1.5 s; afterwards the user's resting face maps to neutral", () => {
  const tr = new FaceTracker();
  let t = 0;
  while (tr.calibrating && t < 3000) {
    tr.process(frame(neutralFace()), t);
    t += 33.3;
  }
  assert.ok(t >= 1500 && t < 1800, `calibrated after ${t} ms`);
  let res;
  for (let i = 0; i < 20; i++, t += 33.3) res = tr.process(frame(neutralFace()), t);
  for (const c of res.faceBlendshapes[0].categories) {
    if (c.categoryName === "_neutral") continue;
    assert.ok(c.score < 0.02, `${c.categoryName} = ${c.score}`);
  }
});

test("recalibrate() adopts a new neutral", () => {
  const { tr } = calibrated();
  let t = 5000;
  tr.recalibrate();
  assert.equal(tr.calibrating, true);
  const newRest = { ...REST_BS, browInnerUp: 0.4 };
  let res;
  for (let i = 0; i < 80; i++, t += 33.3) res = tr.process(frame(neutralFace(), newRest), t);
  assert.equal(tr.calibrating, false);
  assert.ok(score(res, "browInnerUp") < 0.02);
});

test("smile: model + landmarks agree → strong, calibrated smile", () => {
  let { tr, t } = calibrated();
  const face = edit(neutralFace(), [[LM.MOUTH_R, -0.04, 0.06], [LM.MOUTH_L, 0.04, 0.06]]);
  let res;
  for (let i = 0; i < 15; i++, t += 33.3) res = tr.process(frame(face, { ...REST_BS, mouthSmileLeft: 0.8, mouthSmileRight: 0.82 }), t);
  assert.ok(score(res, "mouthSmileLeft") > 0.75, `${score(res, "mouthSmileLeft")}`);
  assert.ok(score(res, "mouthFrownLeft") < 0.02);
});

test("wink: landmarks sharpen a weak model blink on one side only", () => {
  let { tr, t } = calibrated();
  const lids = LM.L_LID_PAIRS.flatMap(([u, d]) => [[u, 0, -0.048], [d, 0, 0.038]]);
  let res;
  for (let i = 0; i < 4; i++, t += 33.3) res = tr.process(frame(edit(neutralFace(), lids), { ...REST_BS, eyeBlinkLeft: 0.5 }), t);
  assert.ok(score(res, "eyeBlinkLeft") > 0.7, `L ${score(res, "eyeBlinkLeft")}`);
  assert.ok(score(res, "eyeBlinkRight") < 0.05, `R ${score(res, "eyeBlinkRight")}`);
});

test("side convention auto-detects a model that labels sides mirrored", () => {
  let { tr, t } = calibrated();
  assert.equal(tr.sidesSwapped, false);
  // subject looks to their left; a mirrored model reports it as In-Left/Out-Right
  const face = edit(neutralFace(), [[LM.R_IRIS, 0.05, 0], [LM.L_IRIS, 0.05, 0]]);
  const mirrored = { ...REST_BS, eyeLookInLeft: 0.7, eyeLookOutRight: 0.7 };
  let res;
  for (let i = 0; i < 20; i++, t += 33.3) res = tr.process(frame(face, mirrored), t);
  assert.equal(tr.sidesSwapped, true);
  assert.ok(score(res, "eyeLookInLeft") > 0.6 && score(res, "eyeLookOutLeft") < 0.05);

  // an anatomical model keeps the default
  ({ tr, t } = calibrated());
  const anatomical = { ...REST_BS, eyeLookOutLeft: 0.7, eyeLookInRight: 0.7 };
  for (let i = 0; i < 20; i++, t += 33.3) res = tr.process(frame(face, anatomical), t);
  assert.equal(tr.sidesSwapped, false);
  assert.ok(score(res, "eyeLookOutLeft") > 0.6);
});

test("head rotation: jitter removed, real turns followed", () => {
  let { tr, t } = calibrated();
  let s = 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const yaws = [];
  for (let i = 0; i < 60; i++, t += 33.3) {
    const res = tr.process(frame(neutralFace(), {}, { x: 0, y: 0.01 * rnd(), z: 0 }), t);
    const m = res.facialTransformationMatrixes[0].data;
    yaws.push(Math.atan2(m[8], m[10]));
  }
  const spread = Math.max(...yaws.slice(20)) - Math.min(...yaws.slice(20));
  assert.ok(spread < 0.01, `filtered yaw spread ${spread}`); // raw spread ≈ 0.02
  let res;
  for (let i = 0; i < 10; i++, t += 33.3) res = tr.process(frame(neutralFace(), {}, { x: 0, y: 0.5, z: 0 }), t);
  const m = res.facialTransformationMatrixes[0].data;
  assert.ok(Math.atan2(m[8], m[10]) > 0.45, "turn reached within 1/3 s");
});
