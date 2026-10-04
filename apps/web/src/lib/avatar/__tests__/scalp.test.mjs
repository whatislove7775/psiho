// Run: node --import ./src/lib/avatar/__tests__/register.mjs --test src/lib/avatar/__tests__/scalp.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { footprint, footprintBytes, topWeight, EL, AZ } from "../headz/scalp.ts";

// a cap: a ring of points on the unit sphere above 30° elevation, all around
function cap(minElDeg, r = 1) {
  const p = [];
  for (let e = minElDeg; e <= 90; e += 1) for (let a = 0; a < 360; a += 2) {
    const el = (e * Math.PI) / 180, az = (a * Math.PI) / 180;
    p.push(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az));
  }
  return new Float32Array(p);
}

test("no hair → no footprint and no top weight", () => {
  const fp = footprint([]);
  assert.equal(fp.cover.reduce((s, x) => s + x, 0), 0);
  assert.equal(topWeight(fp), 0);
  assert.equal(topWeight(null), 0);
});

test("a cap covers the upper sphere; the signed distance is negative under it, positive outside", () => {
  const fp = footprint([{ pos: cap(30), index: null }]);
  const at = (elDeg, azDeg) => Math.floor((elDeg / 180 + 0.5) * EL) * AZ + Math.floor((azDeg / 360 + 0.5) * AZ);
  assert.equal(fp.cover[at(60, 10)], 1);
  assert.equal(fp.cover[at(0, 10)], 0);
  assert.ok(fp.outside[at(0, 10)] > 0.3 && fp.inside[at(60, 10)] > 0);
  const bytes = footprintBytes(fp);
  assert.ok(bytes[at(80, 10)] < 128 && bytes[at(-20, 10)] > 128);
  assert.ok(topWeight(fp) > 0.9);
});

test("a tuft on one side is not a full head of hair", () => {
  const small = [];
  for (let e = 70; e <= 90; e++) for (let a = 0; a < 40; a += 2) {
    const el = (e * Math.PI) / 180, az = (a * Math.PI) / 180;
    small.push(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  }
  const fp = footprint([{ pos: new Float32Array(small), index: null }]);
  assert.ok(topWeight(fp) < 0.5);
});

test("stray interior vertices (ok = 0) don't count", () => {
  const pos = cap(30, 0.2);
  const ok = new Uint8Array(pos.length / 3); // all interior
  assert.equal(footprint([{ pos, index: null, ok }]).cover.reduce((s, x) => s + x, 0), 0);
});
