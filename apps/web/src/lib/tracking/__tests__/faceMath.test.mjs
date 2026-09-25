// Run: node --test src/lib/tracking/__tests__/   (from apps/web; no dependencies)
import assert from "node:assert/strict";
import { test } from "node:test";
import { FILTERS } from "../FaceTracker.ts";
import {
  LM,
  NeutralCalibrator,
  OneEuroFilter,
  landmarkWeights,
  matrixToPose,
  measureFace,
  median,
  poseToMatrix,
  remapFromRest,
  swapSide,
} from "../faceMath.mjs";

import { edit, neutralFace, toLandmarks } from "./synthFace.mjs";

const REST = measureFace(toLandmarks(neutralFace()));
const weights = (face, pose) => landmarkWeights(measureFace(toLandmarks(face, pose)), REST);
const maxOf = (w) => Math.max(...Object.values(w));

// ── Calibration remap ──────────────────────────────────────────────────────
test("remapFromRest: rest maps to 0, 1 stays 1, monotonic in between", () => {
  assert.equal(remapFromRest(0.25, 0.25), 0);
  assert.equal(remapFromRest(0.2, 0.25), 0);
  assert.equal(remapFromRest(1, 0.25), 1);
  assert.ok(remapFromRest(0.3, 0.25) < remapFromRest(0.6, 0.25));
  // (0.625 − 0.25) / 0.75 = 0.5 → dead-zone 0.03 → (0.5 − 0.03)/0.97
  assert.ok(Math.abs(remapFromRest(0.625, 0.25) - 0.47 / 0.97) < 1e-9);
});

test("remapFromRest: dead-zone swallows noise just above rest; rest is capped", () => {
  assert.equal(remapFromRest(0.26, 0.25), 0);
  assert.equal(remapFromRest(0.9, 0.95), remapFromRest(0.9, 0.6));
});

test("NeutralCalibrator: median rest after 1.5 s of stable frames, robust to a blink", () => {
  const c = new NeutralCalibrator({ duration: 1.5 });
  let t = 0;
  let done = false;
  for (let i = 0; i < 60 && !done; i++, t += 1 / 30) {
    const blink = i === 10 || i === 11 ? 0.95 : 0.2;
    done = c.add({ eyeBlinkLeft: blink, browInnerUp: 0.15 }, t, true);
  }
  assert.ok(done);
  assert.ok(t >= 1.5 && t < 1.7, `took ${t}s`);
  assert.equal(c.rest.eyeBlinkLeft, 0.2);
  assert.equal(c.rest.browInnerUp, 0.15);
});

test("NeutralCalibrator: movement restarts the window; gives up waiting after 6 s", () => {
  const c = new NeutralCalibrator({ duration: 1.5, giveUpAfter: 6 });
  let t = 0;
  for (; t < 1.4; t += 1 / 30) c.add({ a: 1 }, t, true);
  c.add({ a: 1 }, t, false); // head moved
  assert.equal(c.done, false);
  assert.equal(c.progress(t), 0);
  // user keeps moving: after giveUpAfter stability is no longer required
  let done = false;
  for (; t < 9 && !done; t += 1 / 30) done = c.add({ a: 0.5 }, t, false);
  assert.ok(done && t > 6 && t < 8);
  assert.equal(c.rest.a, 0.5);
});

test("median", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

// ── One-Euro ───────────────────────────────────────────────────────────────
function noise(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
}
const std = (a) => {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
};

// Parameter sets used by FaceTracker.FILTERS (eyeBlink, mouth/jaw, eyeLook, brow, head)
const P = (k) => [FILTERS[k].minCutoff, FILTERS[k].beta, FILTERS[k].dCutoff];
const EYE = P("eyeBlink");
const MOUTH = P("jaw");
const LOOK = P("eyeLook");
const BROW = P("brow");
const HEAD = P("headRot");

// Tuned for latency: the filter alone cuts resting jitter ≥ 1.8×; the renderer's
// short follow (KitRenderer TRACK_RATE) brings the total to ≥ 2.5×.
test("OneEuro: resting jitter (±0.03 white noise @30 fps) is cut ≥ 1.8×", () => {
  const rnd = noise(7);
  for (const [minCutoff, beta, dCutoff] of [EYE, MOUTH, LOOK, BROW]) {
    const f = new OneEuroFilter(minCutoff, beta, dCutoff);
    const raw = [];
    const out = [];
    for (let i = 0; i < 300; i++) {
      const x = 0.1 + rnd() * 0.03;
      raw.push(x);
      out.push(f.filter(x, i / 30));
    }
    const ratio = std(raw.slice(60)) / std(out.slice(60));
    assert.ok(ratio > 1.8, `jitter reduction only ${ratio.toFixed(2)}× for ${minCutoff}/${beta}`);
  }
});

test("OneEuro: a blink (eye params) is followed within ~2 frames", () => {
  const f = new OneEuroFilter(...EYE);
  let t = 0;
  for (let i = 0; i < 30; i++, t += 1 / 30) f.filter(0, t);
  // blink: 0 → 1 over 2 frames, held 3 frames, reopen
  const seq = [0.5, 1, 1, 1, 1, 0.5, 0, 0, 0];
  const out = seq.map((x) => {
    const y = f.filter(x, t);
    t += 1 / 30;
    return y;
  });
  assert.ok(out[2] > 0.85, `after 3 frames: ${out[2].toFixed(2)}`);
  assert.ok(Math.max(...out) > 0.9, `peak ${Math.max(...out).toFixed(2)}`);
  assert.ok(out[8] < 0.1, `reopened: ${out[8].toFixed(2)}`);
});

test("OneEuro: speech-rate jaw motion (4 Hz, 0..0.6) keeps most of its amplitude", () => {
  const f = new OneEuroFilter(...MOUTH);
  const out = [];
  for (let i = 0; i < 120; i++) {
    const t = i / 30;
    out.push(f.filter(0.3 + 0.3 * Math.sin(2 * Math.PI * 4 * t), t));
  }
  const amp = (Math.max(...out.slice(30)) - Math.min(...out.slice(30))) / 2;
  assert.ok(amp > 0.2, `amplitude ${amp.toFixed(3)} of 0.3`);
});

/** 50 %-crossing lag (ms) of a ramp 0 → amp over rampMs, sampled at 30 fps with white noise. */
function rampLag([minCutoff, beta, dCutoff], amp, rampMs, noiseSd) {
  const f = new OneEuroFilter(minCutoff, beta, dCutoff);
  const rnd = noise(3);
  const sig = (t) => (t < 1 ? 0 : t < 1 + rampMs / 1000 ? ((t - 1) / (rampMs / 1000)) * amp : amp);
  for (let i = 0; i < 90; i++) {
    const t = i / 30;
    const y = f.filter(sig(t) + (rnd() - 0.5) * 2 * noiseSd, t);
    if (y >= amp / 2) return (t - (1 + rampMs / 2000)) * 1000;
  }
  return Infinity;
}

test("OneEuro: fast motion passes with little lag (mouth, brows, head)", () => {
  const jaw = rampLag(MOUTH, 0.6, 80, 0.02);
  const brow = rampLag(BROW, 0.4, 150, 0.02);
  const head = rampLag(HEAD, 0.3, 200, 0.004);
  const nod = rampLag(HEAD, 0.12, 120, 0.004);
  assert.ok(jaw <= 40, `jaw lag ${jaw.toFixed(0)} ms`);
  assert.ok(brow <= 60, `brow lag ${brow.toFixed(0)} ms`);
  assert.ok(head <= 50, `head turn lag ${head.toFixed(0)} ms`);
  assert.ok(nod <= 60, `nod lag ${nod.toFixed(0)} ms`);
});

test("OneEuro: resting head stays still (0.25° noise cut ≥ 2×)", () => {
  const f = new OneEuroFilter(...HEAD);
  const rnd = noise(11);
  const raw = [];
  const out = [];
  for (let i = 0; i < 300; i++) {
    const x = 0.05 + (rnd() - 0.5) * 0.008;
    raw.push(x);
    out.push(f.filter(x, i / 30));
  }
  const ratio = std(raw.slice(60)) / std(out.slice(60));
  assert.ok(ratio > 2, `head jitter reduction only ${ratio.toFixed(2)}×`);
});

test("OneEuro: long gap restarts instead of smearing", () => {
  const f = new OneEuroFilter();
  f.filter(0, 0);
  f.filter(0, 0.033);
  assert.equal(f.filter(1, 2), 1);
});

// ── Landmark metrics ───────────────────────────────────────────────────────
test("neutral face → all landmark weights ≈ 0 (also with head rotation)", () => {
  assert.ok(maxOf(weights(neutralFace())) < 1e-9);
  const rotated = weights(neutralFace(), { yaw: 0.3, pitch: -0.2, roll: 0.25 });
  assert.ok(maxOf(rotated) < 0.1, JSON.stringify(rotated));
  // distance to camera doesn't matter
  assert.ok(maxOf(weights(neutralFace(), { size: 0.12 })) < 1e-6);
});

test("measureFace: EAR and inter-ocular normalisation", () => {
  assert.ok(Math.abs(REST.earR - REST.earL) < 1e-9);
  assert.ok(REST.earR > 0.2 && REST.earR < 0.4, `EAR ${REST.earR}`);
  assert.ok(Math.abs(REST.irisHR - 0.5) < 0.01 && Math.abs(REST.irisHL - 0.5) < 0.01);
});

const lidChanges = (pairs, k) => pairs.flatMap(([u, d]) => [[u, 0, -k], [d, 0, k * 0.8]]);

test("closing one eye → blink on that (anatomical) side only", () => {
  const w = weights(edit(neutralFace(), lidChanges(LM.R_LID_PAIRS, 0.048)));
  assert.ok(w.eyeBlinkRight > 0.9, `R ${w.eyeBlinkRight}`);
  assert.equal(w.eyeBlinkLeft, 0);
  const half = weights(edit(neutralFace(), lidChanges(LM.L_LID_PAIRS, 0.022)));
  assert.ok(half.eyeBlinkLeft > 0.3 && half.eyeBlinkLeft < 0.8, `half ${half.eyeBlinkLeft}`);
});

test("widening eyes → eyeWide, no blink", () => {
  const w = weights(edit(neutralFace(), [...lidChanges(LM.R_LID_PAIRS, -0.03), ...lidChanges(LM.L_LID_PAIRS, -0.03)]));
  assert.ok(w.eyeWideLeft > 0.5 && w.eyeWideRight > 0.5, JSON.stringify(w));
  assert.equal(w.eyeBlinkLeft, 0);
});

test("opening the mouth → jawOpen, but no smile/frown", () => {
  const w = weights(edit(neutralFace(), [[LM.LIP_INNER_LOW, 0, -0.3], [LM.MOUTH_R, 0, -0.12], [LM.MOUTH_L, 0, -0.12]]));
  assert.ok(w.jawOpen > 0.6, `jaw ${w.jawOpen}`);
  assert.ok(w.mouthSmileLeft < 0.1 && w.mouthFrownLeft < 0.1, JSON.stringify(w));
});

test("smile: corners up & out → mouthSmile both sides; one-sided smirk stays one-sided", () => {
  const w = weights(edit(neutralFace(), [[LM.MOUTH_R, -0.04, 0.06], [LM.MOUTH_L, 0.04, 0.06]]));
  assert.ok(w.mouthSmileLeft > 0.8 && w.mouthSmileRight > 0.8, JSON.stringify(w));
  assert.equal(w.mouthFrownLeft, 0);
  const smirk = weights(edit(neutralFace(), [[LM.MOUTH_L, 0.02, 0.05]]));
  assert.ok(smirk.mouthSmileLeft > 0.6 && smirk.mouthSmileRight < 0.05, JSON.stringify(smirk));
});

test("frown and stretch", () => {
  const frown = weights(edit(neutralFace(), [[LM.MOUTH_R, 0, -0.04], [LM.MOUTH_L, 0, -0.04]]));
  assert.ok(frown.mouthFrownLeft > 0.6 && frown.mouthSmileLeft === 0, JSON.stringify(frown));
  const stretch = weights(edit(neutralFace(), [[LM.MOUTH_R, -0.07, 0], [LM.MOUTH_L, 0.07, 0]]));
  assert.ok(stretch.mouthStretchLeft > 0.7 && stretch.mouthSmileLeft < 0.05, JSON.stringify(stretch));
});

test("brows: raise inner → browInnerUp; lower all → browDown; outer raise one side", () => {
  const inner = weights(edit(neutralFace(), [[LM.R_BROW_INNER, 0, 0.08], [LM.L_BROW_INNER, 0, 0.08]]));
  assert.ok(inner.browInnerUp > 0.8 && inner.browDownLeft === 0, JSON.stringify(inner));
  const down = weights(
    edit(neutralFace(), [LM.R_BROW_INNER, LM.R_BROW_MID, LM.R_BROW_OUTER, LM.L_BROW_INNER, LM.L_BROW_MID, LM.L_BROW_OUTER].map((i) => [i, 0, -0.04])),
  );
  assert.ok(down.browDownLeft > 0.7 && down.browDownRight > 0.7 && down.browInnerUp === 0, JSON.stringify(down));
  const outer = weights(edit(neutralFace(), [[LM.L_BROW_OUTER, 0, 0.09], [LM.L_BROW_MID, 0, 0.06]]));
  assert.ok(outer.browOuterUpLeft > 0.8 && outer.browOuterUpRight === 0, JSON.stringify(outer));
});

test("gaze: irises toward subject's left → eyeLookOutLeft + eyeLookInRight", () => {
  const w = weights(edit(neutralFace(), [[LM.R_IRIS, 0.05, 0], [LM.L_IRIS, 0.05, 0]]));
  assert.ok(w.eyeLookOutLeft > 0.8 && w.eyeLookInRight > 0.8, JSON.stringify(w));
  assert.equal(w.eyeLookInLeft, 0);
  assert.equal(w.eyeLookOutRight, 0);
  const up = weights(edit(neutralFace(), [[LM.R_IRIS, 0, 0.03], [LM.L_IRIS, 0, 0.03]]));
  assert.ok(up.eyeLookUpLeft > 0.8 && up.eyeLookDownLeft === 0, JSON.stringify(up));
});

// ── Pose / helpers ─────────────────────────────────────────────────────────
test("matrixToPose ∘ poseToMatrix round-trips (with scale and translation)", () => {
  const p = { x: 0.2, y: -0.4, z: 0.1, sx: 1.1, sy: 1.1, sz: 1.1, tx: 1, ty: -2, tz: -40 };
  const m = poseToMatrix(p);
  const q = matrixToPose(m);
  for (const k of Object.keys(p)) assert.ok(Math.abs(p[k] - q[k]) < 1e-9, `${k}: ${p[k]} vs ${q[k]}`);
});

test("swapSide", () => {
  assert.equal(swapSide("eyeBlinkLeft"), "eyeBlinkRight");
  assert.equal(swapSide("mouthSmileRight"), "mouthSmileLeft");
  assert.equal(swapSide("jawOpen"), "jawOpen");
});
