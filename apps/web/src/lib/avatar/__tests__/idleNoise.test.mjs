// Run: node --import ./src/lib/avatar/__tests__/register.mjs --test src/lib/avatar/__tests__/idleNoise.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { NOISE_CURVE, NOISE_SLOPE, hash01, rng, smoothNoise } from "../headz/idleNoise.ts";
import { springStep } from "../headz/eyes.ts";

const FPS = 60;
const sample = (seed, hz, secs = 30, fps = FPS) => Array.from({ length: secs * fps }, (_, i) => smoothNoise(i / fps, seed, hz));
const diff = (xs) => xs.slice(1).map((x, i) => x - xs[i]);

test("smoothNoise is bounded and deterministic per seed, different across seeds", () => {
  for (const seed of [0, 1.37, 7, 101, 5 + 13.7 * 9]) {
    const a = sample(seed, 0.2), b = sample(seed, 0.2);
    assert.deepEqual(a, b);
    assert.ok(a.every((v) => v >= -1 && v <= 1));
    // it actually moves (not a constant) and uses most of its range over 30 s
    assert.ok(Math.max(...a) - Math.min(...a) > 0.8);
  }
  const a = sample(1, 0.2), b = sample(2, 0.2);
  assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 0.2), "seeds decorrelate heads");
});

test("smoothNoise is smooth at 60 fps: tiny frame-to-frame steps, no jitter in the 2nd derivative", () => {
  for (const hz of [0.045, 0.1, 0.23]) {
    for (const seed of [0, 3.3, 42]) {
      const x = sample(seed, hz);
      const d1 = diff(x), d2 = diff(d1), d3 = diff(d2);
      const dt = 1 / FPS;
      // |Δx| per frame is bounded by the analytic slope (no steps, no randomness per frame)
      assert.ok(Math.max(...d1.map(Math.abs)) <= NOISE_SLOPE * hz * dt + 1e-12);
      assert.ok(Math.max(...d2.map(Math.abs)) <= NOISE_CURVE * hz * hz * dt * dt + 1e-12);
      // the acceleration changes sign only at its (rare) zero crossings — a jittery signal flips it
      // almost every frame. A band-limited signal's 2nd derivative has ≤ 2 × (highest freq) × T crossings.
      let flips = 0;
      for (let i = 1; i < d2.length; i++) if (d2[i] * d2[i - 1] < 0) flips++;
      const maxCross = 2 * 2.103 * hz * 30 + 2;
      assert.ok(flips <= maxCross, `hz=${hz} seed=${seed}: ${flips} sign flips of the 2nd derivative > ${maxCross}`);
      // and the jerk is tiny relative to the acceleration scale (C∞ smooth, not piecewise)
      assert.ok(Math.max(...d3.map(Math.abs)) < NOISE_CURVE * hz * hz * dt * dt * 0.2);
    }
  }
});

test("frame-rate independence: 30 / 60 / 144 fps sample the same curve", () => {
  for (const fps of [30, 144]) {
    const lo = sample(9, 0.1, 10, fps);
    for (let i = 0; i < lo.length; i += 7) {
      const t = i / fps;
      assert.ok(Math.abs(lo[i] - smoothNoise(t, 9, 0.1)) < 1e-12);
    }
  }
});

test("seeded rng is deterministic and uniform-ish; hash01 in [0, 1)", () => {
  const a = rng(5), b = rng(5);
  const xs = Array.from({ length: 2000 }, () => a());
  assert.deepEqual(xs.slice(0, 20), Array.from({ length: 20 }, () => b()));
  assert.ok(xs.every((v) => v >= 0 && v < 1));
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05);
  for (let k = 0; k < 50; k++) {
    const h = hash01(k * 1.37, k);
    assert.ok(h >= 0 && h < 1);
  }
});

test("critically damped head spring: a target step starts smoothly (no velocity jump), no overshoot, dt-independent", () => {
  const run = (fps, secs = 2) => {
    let x = 0, v = 0;
    const out = [];
    for (let i = 0; i < secs * fps; i++) {
      [x, v] = springStep(x, v, 1, 6, 1 / fps);
      out.push(x);
    }
    return out;
  };
  const x60 = run(60), x30 = run(30), x144 = run(144);
  // no overshoot
  assert.ok(x60.every((v) => v <= 1 + 1e-12));
  // gentle start: the first frame moves far less than a first-order lerp with the same settle time would
  assert.ok(x60[0] < 0.01);
  // the per-frame step is bounded and changes smoothly (no sign-flipping acceleration)
  const d2 = diff(diff(x60));
  let flips = 0;
  for (let i = 1; i < d2.length; i++) if (d2[i] * d2[i - 1] < 0 && Math.abs(d2[i]) > 1e-9) flips++;
  assert.ok(flips <= 1);
  // exact integration: the same time gives the same position whatever the frame rate
  assert.ok(Math.abs(x60[59] - x30[29]) < 1e-9);
  assert.ok(Math.abs(x60[59] - x144[143]) < 1e-9);
});
