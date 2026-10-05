// Run: node --import ./src/lib/avatar/__tests__/register.mjs --test src/lib/avatar/__tests__/scalp.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { footprint, footprintBytes, topWeight, SkinIndex, taperHair, EL, AZ } from "../headz/scalp.ts";

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

test("the shipped short cap's raised rim sits on the scalp", async () => {
  const { headzPart } = await import("../headz/catalog.ts");
  const { placePart, radiusAt } = await import("../headz/deform.ts");
  const { faceOf, loadMeshes } = await import("../../../../scripts/headz-fit.mjs");
  const face = await faceOf("man-dark");
  const skin = new SkinIndex(face.surface.pos, face.surface.nrm);
  const [mesh] = await loadMeshes(headzPart("man-dark", "hair", "003-002"));
  const pos = mesh.pos.slice();
  placePart(pos, "hair", null, face.map, () => face.surface);
  const ok = Uint8Array.from({ length: pos.length / 3 }, (_, i) => {
    const p = pos.subarray(i * 3, i * 3 + 3);
    return Math.hypot(...p) >= 0.85 * radiusAt(face.map, ...p) ? 1 : 0;
  });
  const fp = footprint([{ pos, index: mesh.index, ok }]);
  const seated = pos.slice();
  taperHair(seated, fp, skin);
  let checked = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const [x, y, z] = pos.subarray(i, i + 3);
    const r = Math.hypot(x, y, z);
    const e = Math.min(EL - 1, Math.floor((Math.asin(y / r) / Math.PI + 0.5) * EL));
    const a = Math.min(AZ - 1, Math.floor((Math.atan2(x, z) / (2 * Math.PI) + 0.5) * AZ));
    if (fp.inside[e * AZ + a] > 0.03) continue;
    const before = skin.height(x, y, z);
    if (!before || before.along <= 0.12 || before.along >= 0.18) continue;
    const after = skin.height(...seated.subarray(i, i + 3));
    assert.ok(after && after.along < 0.04, `rim gap ${before.along} → ${after?.along}`);
    checked++;
  }
  assert.ok(checked > 50, "check the cap rim, not an empty sample");
});

test("tapering leaves distant strands and the crown alone", () => {
  const fp = footprint([{ pos: cap(30), index: null }]);
  const hair = new Float32Array([0, 0.55, 0.953, 0, 0.8, 1.386, 0, 1.1, 0]);
  const before = hair.slice();
  const skin = new SkinIndex(new Float32Array([0, 0.5, 0.866, 0, 1, 0]), new Float32Array([0, 0.5, 0.866, 0, 1, 0]));
  taperHair(hair, fp, skin);
  assert.deepEqual(hair.slice(3), before.slice(3));
});
