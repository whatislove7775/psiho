// Run: node --import ./src/lib/avatar/__tests__/register.mjs --test src/lib/avatar/__tests__/gaze.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { combineEyes, gazeOf, gazeWeights } from "../headz/gaze.ts";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("asymmetric eye scores become one shared (conjugate) gaze", () => {
  // tracker noise: the left eye "looks out" a lot, the right eye barely moves, one eye up, one down
  const w = combineEyes({
    eyeLookOutLeft: 0.8, eyeLookInLeft: 0, eyeLookInRight: 0.1, eyeLookOutRight: 0.05,
    eyeLookUpLeft: 0.3, eyeLookDownRight: 0.1,
  });
  // both eyes turn the same way by the same amount
  close(w.eyeLookOutLeft, w.eyeLookInRight);
  close(w.eyeLookInLeft, w.eyeLookOutRight);
  close(w.eyeLookUpLeft, w.eyeLookUpRight);
  close(w.eyeLookDownLeft, w.eyeLookDownRight);
  close(w.eyeLookOutLeft, (0.8 - 0 + 0.1 - 0.05) / 2);
  close(w.eyeLookUpLeft, (0.3 - 0.1) / 2);
  assert.equal(w.eyeLookInLeft, 0);
  assert.equal(w.eyeLookDownLeft, 0);
});

test("gaze vector round-trips through per-eye weights", () => {
  for (const [h, v] of [[0.4, -0.2], [-0.7, 0.5], [0, 0]]) {
    const g = gazeOf(gazeWeights(h, v));
    close(g.h, h);
    close(g.v, v);
  }
});

test("small lid asymmetry is averaged, a real wink is kept", () => {
  const a = combineEyes({ eyeBlinkLeft: 0.3, eyeBlinkRight: 0.1 });
  close(a.eyeBlinkLeft, a.eyeBlinkRight);
  const wink = combineEyes({ eyeBlinkLeft: 0.95, eyeBlinkRight: 0.05 });
  assert.ok(wink.eyeBlinkLeft > 0.9 && wink.eyeBlinkRight < 0.1);
});

test("upper lids follow a downward gaze", () => {
  const w = combineEyes({ eyeLookDownLeft: 0.8, eyeLookDownRight: 0.8 });
  assert.ok(w.eyeBlinkLeft > 0.2 && w.eyeBlinkLeft < 0.4);
  close(w.eyeBlinkLeft, w.eyeBlinkRight);
});

// ── tracked gaze never latches (owner bug: eyes stuck looking to one side) ──
import { GazeTracker, gazeWeights as gw } from "../headz/gaze.ts";

/** Tracked weights for a gaze (raw tracker units) with a given blink. */
const frame = (h, v, blink = 0) => ({ ...gw(h, v), eyeBlinkLeft: blink, eyeBlinkRight: blink });

function feed(g, t0, secs, fn, fps = 30) {
  let t = t0;
  for (; t < t0 + secs; t += 1 / fps) g.update(fn(t), t), g.tick(t);
  return t;
}

test("gaze returns to centre after a side look, a blink and a low-confidence gap", () => {
  const g = new GazeTracker();
  let t = feed(g, 0, 1, () => frame(0.6, 0)); // look hard to one side
  assert.ok(g.h > 0.6, `side look reached (${g.h})`);
  // a blink: eyes close for 0.2 s while the tracker reports garbage gaze
  t = feed(g, t, 0.2, () => frame(-0.9, -0.8, 0.95));
  assert.ok(g.h > 0.5, "held through the blink (no jump to garbage)");
  // low confidence: no samples at all for 0.6 s (only render ticks)
  for (const end = t + 0.6; t < end; t += 1 / 60) g.tick(t);
  assert.ok(Math.abs(g.h) < 0.05, `relaxed toward the centre during the gap (${g.h})`);
  // centred input: must be exactly centred within ~100 ms
  t = feed(g, t, 0.1, () => frame(0.02, -0.01));
  assert.ok(Math.abs(g.h) < 0.02 && Math.abs(g.v) < 0.02, `centred in 100 ms (${g.h}, ${g.v})`);
  t = feed(g, t, 0.5, () => frame(0.02, -0.01));
  assert.equal(g.h, 0);
  assert.equal(g.v, 0);
});

test("a long squint / smile (eyes half-closed) doesn't freeze the gaze to the side", () => {
  const g = new GazeTracker();
  let t = feed(g, 0, 0.6, () => frame(-0.7, 0.2));
  assert.ok(g.h < -0.6);
  t = feed(g, t, 1.2, () => frame(0, 0, 0.7)); // eyes narrowed for >1 s, looking at the camera
  assert.ok(Math.abs(g.h) < 0.05 && Math.abs(g.v) < 0.05, `released (${g.h}, ${g.v})`);
  t = feed(g, t, 0.1, () => frame(0, 0, 0.3)); // eyes open again
  assert.ok(Math.abs(g.h) < 0.01);
});

test("reacts to a new look within ~100 ms", () => {
  const g = new GazeTracker();
  let t = feed(g, 0, 0.5, () => frame(0, 0));
  t = feed(g, t, 0.1, () => frame(0.5, 0));
  assert.ok(g.h > 0.45, `followed quickly (${g.h})`);
});

test("looking back at the camera from a side look centres within ~100 ms", () => {
  const g = new GazeTracker();
  let t = feed(g, 0, 0.6, () => frame(0.6, -0.3));
  t = feed(g, t, 0.1, () => frame(0, 0));
  assert.ok(Math.abs(g.h) < 0.08 && Math.abs(g.v) < 0.08, `(${g.h}, ${g.v})`);
  feed(g, t, 0.4, () => frame(0, 0));
  assert.equal(g.h, 0);
});
