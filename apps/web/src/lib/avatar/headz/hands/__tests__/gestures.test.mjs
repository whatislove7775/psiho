// Run: node --test src/lib/avatar/headz/hands/__tests__/*.test.mjs   (from apps/web; node ≥ 22.18 strips TS types)
import assert from "node:assert/strict";
import { test } from "node:test";
import { GESTURE, GestureDetector, classifyFrame, classifyHand } from "../gestures.ts";
import { synthDetection } from "../synthHands.mjs";

const FACE = { cx: 0.5 * (4 / 3), cy: 0.4, h: 0.3 };
const ROT180 = [0, 0, 1, 0]; // turn the hand upside down (about the camera axis)
const tilt = (deg) => [0, 0, Math.sin((deg * Math.PI) / 360), Math.cos((deg * Math.PI) / 360)];
const det = (o) => synthDetection({ at: { x: 0.3, y: 0.75 }, ...o });

test("thumbs up / down (either hand, small tilts)", () => {
  for (const hand of ["right", "left"]) {
    assert.equal(classifyHand(det({ gesture: "thumbsUp", hand }), FACE), "up", hand);
    assert.equal(classifyHand(det({ gesture: "thumbsUp", hand, rot: ROT180 }), FACE), "down", hand);
    assert.equal(classifyHand(det({ gesture: "thumbsUp", hand, rot: tilt(20) }), FACE), "up", `${hand} tilted`);
  }
});

test("a sideways thumb is neither up nor down", () => {
  assert.equal(classifyHand(det({ gesture: "thumbsUp", rot: tilt(90) }), FACE), null);
});

test("other poses are not gestures", () => {
  for (const g of ["fist", "peace", "point"]) assert.equal(classifyHand(det({ gesture: g }), FACE), null, g);
  // open palm held low (in front of the chest) is not a raised hand
  assert.equal(classifyHand(det({ gesture: "open", at: { x: 0.25, y: 0.9 } }), FACE), null);
});

test("raised open hand above the chin → raise; in front of the face → nothing", () => {
  assert.equal(classifyHand(det({ gesture: "open", at: { x: 0.15, y: 0.42 } }), FACE), "raise");
  assert.equal(classifyHand(det({ gesture: "open", at: { x: 0.5, y: 0.5 } }), FACE), null);
  // upside-down open hand is not a raise
  assert.equal(classifyHand(det({ gesture: "open", at: { x: 0.15, y: 0.2 }, rot: ROT180 }), FACE), null);
  // no face: upper part of the frame
  assert.equal(classifyHand(det({ gesture: "open", at: { x: 0.15, y: 0.35 } }), null), "raise");
});

test("low-confidence detections are ignored", () => {
  const d = det({ gesture: "thumbsUp" });
  d.score = GESTURE.minScore - 0.1;
  assert.equal(classifyHand(d, FACE), null);
});

test("frame: thumbs beat raise, conflicting thumbs cancel", () => {
  const up = det({ gesture: "thumbsUp" });
  const down = det({ gesture: "thumbsUp", hand: "left", rot: ROT180 });
  const raise = det({ gesture: "open", hand: "left", at: { x: 0.8, y: 0.35 } });
  assert.equal(classifyFrame([up, raise], FACE), "up");
  assert.equal(classifyFrame([up, down], FACE), null);
  assert.equal(classifyFrame([raise], FACE), "raise");
  assert.equal(classifyFrame([], FACE), null);
});

/** feed `g` at 15 fps from t0 for `ms`; returns fired gestures with times */
function run(d, seq) {
  const out = [];
  for (const [g, from, to] of seq) {
    for (let t = from; t < to; t += 66) {
      const f = d.update(g, t);
      if (f) out.push([f, t]);
    }
  }
  return out;
}

test("debounce: must be held ≥ 0.5 s (raise ≥ 0.8 s), fires once per hold", () => {
  assert.deepEqual(run(new GestureDetector(), [["up", 0, 400]]), []);
  const a = run(new GestureDetector(), [["up", 0, 2000]]);
  assert.equal(a.length, 1);
  assert.ok(a[0][1] >= 500 && a[0][1] < 600);
  assert.deepEqual(run(new GestureDetector(), [["raise", 0, 700]]), []);
  const r = run(new GestureDetector(), [["raise", 0, 1200]]);
  assert.equal(r.length, 1);
  assert.ok(r[0][1] >= 800);
});

test("debounce: short dropouts don't break a hold, long ones do", () => {
  const d = new GestureDetector();
  const a = run(d, [["up", 0, 300], [null, 300, 500], ["up", 500, 700]]);
  assert.equal(a.length, 1, "200 ms gap tolerated");
  const d2 = new GestureDetector();
  const b = run(d2, [["up", 0, 400], [null, 400, 1000], ["up", 1000, 1300]]);
  assert.equal(b.length, 0, "long gap resets the hold");
});

test("cooldown: nothing fires for 3 s after a gesture, then a new hold fires again", () => {
  const d = new GestureDetector();
  const a = run(d, [["up", 0, 800], [null, 800, 1300], ["down", 1300, 2400], [null, 2400, 3000], ["down", 3700, 4600]]);
  assert.deepEqual(a.map((x) => x[0]), ["up", "down"]);
  assert.ok(a[1][1] >= a[0][1] + GESTURE.cooldownMs);
});

test("a flicker of a different gesture doesn't fire", () => {
  const d = new GestureDetector();
  const a = run(d, [["up", 0, 200], ["down", 200, 270], ["up", 270, 460]]);
  assert.equal(a.length, 0);
});
