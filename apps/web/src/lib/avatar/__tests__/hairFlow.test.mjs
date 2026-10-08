import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { hairFlow } from "../headz/hairFlow.ts";

const flow = (g) => hairFlow(g.attributes.position.array, g.attributes.normal.array, g.index?.array ?? null);

test("straight locks follow their length, rather than the circumference", () => {
  const g = new THREE.CylinderGeometry(0.08, 0.08, 1, 32, 24, true);
  const f = flow(g);
  for (let i = 0; i < f.length; i += 4) {
    assert.ok(Math.abs(f[i + 1]) > 0.98, "flow must follow the cylinder axis");
    assert.ok(f[i + 3] > 0.8);
  }
});

test("strand direction rotates with the hairstyle, not a fixed head axis", () => {
  const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.6, 0.9, 1.1));
  const g = new THREE.CylinderGeometry(0.08, 0.08, 1, 32, 24, true).applyMatrix4(rotation);
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(rotation);
  const f = flow(g);
  for (let i = 0; i < f.length; i += 4) {
    assert.ok(Math.abs(new THREE.Vector3(f[i], f[i + 1], f[i + 2]).dot(axis)) > 0.98);
  }
});

test("curved locks follow a changing tangent, including horizontal sections", () => {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.6, 0, 0), new THREE.Vector3(-0.3, 0.3, 0.1),
    new THREE.Vector3(0, 0.45, 0.15), new THREE.Vector3(0.4, 0.25, 0),
  ]);
  const segments = 64, radial = 24;
  const g = new THREE.TubeGeometry(path, segments, 0.035, radial, false);
  const f = flow(g);
  for (let ring = 2; ring < segments - 2; ring++) {
    const tangent = path.getTangentAt(ring / segments);
    let alignment = 0;
    for (let j = 1; j < radial; j++) {
      const i = (ring * (radial + 1) + j) * 4;
      alignment += Math.abs(new THREE.Vector3(f[i], f[i + 1], f[i + 2]).dot(tangent));
    }
    assert.ok(alignment / (radial - 1) > 0.95, `curve ring ${ring}`);
  }
});

test("flat or degenerate patches stay finite and do not invent visible fibres", () => {
  for (const g of [new THREE.PlaneGeometry(1, 1, 10, 10), new THREE.BufferGeometry()]) {
    if (!g.attributes.position) {
      g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    }
    const f = flow(g);
    assert.ok([...f].every(Number.isFinite));
    for (let i = 3; i < f.length; i += 4) assert.equal(f[i], 0);
  }
});
