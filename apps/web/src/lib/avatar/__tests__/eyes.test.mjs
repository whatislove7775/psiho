// Run: node --import ./src/lib/avatar/__tests__/register.mjs --test src/lib/avatar/__tests__/eyes.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { EyeRig, MAX_PITCH, MAX_YAW, OneEuro, VERGENCE, eyeRotations, springStep } from "../headz/eyes.ts";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("both eye pivots receive identical rotations (vergence only, ≤ 2°)", () => {
  const mat = {};
  const rig = new EyeRig({ sclera: mat, iris: mat, cornea: mat });
  for (const [h, v] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.6, -0.4], [-0.3, 0.8], [3, -3]]) {
    rig.snap(h, v);
    const [L, R] = rig.pivots.map((p) => p.rotation);
    close(L.x, R.x);
    close(L.z, R.z);
    close(R.y - L.y, 2 * VERGENCE);
    assert.ok(Math.abs(VERGENCE) <= (2 * Math.PI) / 180);
    // physiological range
    assert.ok(Math.abs(L.x) <= MAX_PITCH + 1e-9 && Math.abs((L.y + R.y) / 2) <= MAX_YAW + 1e-9);
  }
  // with no vergence the rotations are exactly equal
  const r = eyeRotations(0.4, -0.2, 0);
  assert.deepEqual([r.L.x, r.L.y, r.L.z], [r.R.x, r.R.y, r.R.z]);
});

test("gaze directions: +h turns toward the avatar's left (+X), +v looks up", () => {
  const r = eyeRotations(1, 0, 0);
  assert.ok(r.L.y > 0);
  const u = eyeRotations(0, 1, 0);
  assert.ok(u.L.x < 0); // negative rotation about X lifts +Z
});

test("critically damped spring converges without overshoot", () => {
  let x = 0, v = 0, max = 0;
  for (let i = 0; i < 120; i++) {
    [x, v] = springStep(x, v, 1, 38, 1 / 60);
    max = Math.max(max, x);
  }
  close(x, 1, 1e-6);
  assert.ok(max <= 1 + 1e-9);
  // stable for a huge step too
  [x, v] = springStep(0, 0, 1, 38, 0.5);
  assert.ok(x > 0.9 && x <= 1);
});

test("One-Euro smooths jitter but follows a jump", () => {
  const f = new OneEuro(2.5, 0.6);
  let out = 0;
  for (let i = 0; i < 60; i++) out = f.filter(0.3 + (i % 2 ? 0.05 : -0.05), 1 / 30);
  assert.ok(Math.abs(out - 0.3) < 0.04);
  for (let i = 0; i < 10; i++) out = f.filter(0.9, 1 / 30);
  assert.ok(out > 0.8);
});

import { INSET } from "../headz/eyes.ts";

test("the eyeball sits inside the socket so lids and skin win the depth test", () => {
  assert.ok(INSET < 1 && INSET > 0.85);
});
