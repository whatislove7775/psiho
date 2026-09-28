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
