// Run: node --test src/lib/avatar/headz/hands/__tests__/*.test.mjs   (from apps/web; no dependencies)
// Drives the hand solver with synthetic landmark sets (open palm, fist,
// thumbs-up, peace, pointing) against the REAL exported skeleton
// (public/avatar/hands/*.glb — only its node transforms are read).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BONES,
  angle,
  boneAxes,
  dot,
  norm,
  palmBasis,
  placeHand,
  qrot,
  restFromLocal,
  sideFor,
  solveHand,
  sub,
  toAvatarPoints,
} from "../handMath.mjs";
import { GESTURES, handPoints, synthDetection } from "../synthHands.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, "../../../../../../public");
const deg = (r) => (r * 180) / Math.PI;

function glbSkeleton(file, rootName) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + n).toString("utf8"));
  const root = j.nodes.find((x) => x.name === rootName);
  const out = {};
  const walk = (idx) => {
    const node = j.nodes[idx];
    if (node.name && !node.mesh) out[node.name] = { t: node.translation ?? [0, 0, 0], r: node.rotation ?? [0, 0, 0, 1] };
    (node.children ?? []).forEach(walk);
  };
  (root.children ?? []).forEach(walk);
  return out;
}

const groups = fs.readdirSync(path.join(PUBLIC, "avatar/hands")).filter((f) => f.endsWith(".glb"));
const REST = {
  L: restFromLocal(glbSkeleton(path.join(PUBLIC, "avatar/hands/man.glb"), "handL")),
  R: restFromLocal(glbSkeleton(path.join(PUBLIC, "avatar/hands/man.glb"), "handR")),
};

function solveDetection(det, mirror = true) {
  const side = sideFor(det.label, mirror);
  const pts = toAvatarPoints(det.world, mirror);
  const rest = REST[side];
  const local = solveHand(rest, pts);
  return { side, pts, rest, local, axes: boneAxes(rest, local) };
}

/** flexion of a finger: sum of angles between consecutive target segments */
const curl = (pts, base) => {
  let a = 0;
  let prev = sub(pts[base], pts[0]);
  for (let k = 0; k < 3; k++) {
    const seg = sub(pts[base + k + 1], pts[base + k]);
    a += angle(prev, seg);
    prev = seg;
  }
  return deg(a);
};

test("every exported hand GLB has the full 21-bone skeleton (+5 tips) for both hands", () => {
  assert.ok(groups.length >= 4, "hand GLBs exported");
  for (const g of groups) {
    for (const side of ["handL", "handR"]) {
      const sk = glbSkeleton(path.join(PUBLIC, "avatar/hands", g), side);
      for (const b of BONES) assert.ok(sk[b.name], `${g} ${side} ${b.name}`);
      assert.doesNotThrow(() => restFromLocal(sk));
    }
  }
});

test("handedness: the user's right hand drives the avatar's LEFT hand when mirrored", () => {
  assert.equal(solveDetection(synthDetection({ hand: "right" })).side, "L");
  assert.equal(solveDetection(synthDetection({ hand: "left" })).side, "R");
  assert.equal(solveDetection(synthDetection({ hand: "right" }), false).side, "R");
});

test("chirality: mirrored landmarks of a right hand have the palm frame of a LEFT hand model", () => {
  // In the model, fingers flex toward the palm normal of palmBasis() with a fixed sign per hand;
  // a fist must curl toward the same side as the model's own (slightly curled) rest fingers.
  for (const [hand, side] of [["right", "L"], ["left", "R"]]) {
    const rest = REST[side];
    const J = (n) => rest.joints[BONES.findIndex((b) => b.name === n)];
    const [, , zr] = rest.basis;
    const restCurl = dot(sub(J("middle3").tip, J("middle1").pos), zr);
    const det = solveDetection(synthDetection({ hand, gesture: "fist" }));
    const [, , zt] = palmBasis(det.pts[0], det.pts[5], det.pts[17], det.pts[9]);
    const fistCurl = dot(sub(det.pts[12], det.pts[9]), zt);
    assert.equal(Math.sign(fistCurl), Math.sign(restCurl), `${hand} hand → ${side} model curls toward the palm`);
  }
});

for (const gesture of GESTURES) {
  test(`solver reproduces every finger segment of «${gesture}» (both hands) within 1°`, () => {
    for (const hand of ["right", "left"]) {
      const { pts, axes } = solveDetection(synthDetection({ hand, gesture }));
      BONES.forEach((b, i) => {
        if (i === 0) return;
        const err = deg(angle(axes[i], sub(pts[b.to], pts[b.from])));
        assert.ok(err < 1, `${hand} ${gesture} ${b.name}: ${err.toFixed(2)}°`);
      });
    }
  });
}

test("gestures: curls match the pose (open straight, fist curled, pointing = index only, peace = V)", () => {
  const C = (g) => {
    const { pts } = solveDetection(synthDetection({ gesture: g }));
    return { index: curl(pts, 5), middle: curl(pts, 9), ring: curl(pts, 13), pinky: curl(pts, 17) };
  };
  const open = C("open"), fist = C("fist"), point = C("point"), peace = C("peace");
  for (const f of ["index", "middle", "ring", "pinky"]) {
    assert.ok(open[f] < 25, `open ${f} ${open[f]}`);
    assert.ok(fist[f] > 180, `fist ${f} ${fist[f]}`);
  }
  assert.ok(point.index < 25 && point.middle > 180 && point.ring > 180, "pointing");
  assert.ok(peace.index < 25 && peace.middle < 25 && peace.ring > 180 && peace.pinky > 180, "peace");
});

test("thumbs-up: the solved model thumb points up (screen), the fingers don't", () => {
  const { axes } = solveDetection(synthDetection({ gesture: "thumbsUp" }));
  const thumbTip = axes[BONES.findIndex((b) => b.name === "thumb3")];
  assert.ok(norm(thumbTip)[1] > 0.6, `thumb axis y ${thumbTip[1].toFixed(2)}`);
  const idx = axes[BONES.findIndex((b) => b.name === "index2")];
  assert.ok(norm(idx)[1] < 0.3, "index curled");
});

test("wrist: rotating the whole hand rotates only the wrist (fingers keep their local pose)", () => {
  const a = solveDetection(synthDetection({ gesture: "peace" }));
  const s = Math.sin(0.4), c = Math.cos(0.4);
  const b = solveDetection(synthDetection({ gesture: "peace", rot: [0, 0, s, c] }));
  for (let i = 1; i < BONES.length; i++) {
    const d = Math.abs(a.local[i][0] * b.local[i][0] + a.local[i][1] * b.local[i][1] + a.local[i][2] * b.local[i][2] + a.local[i][3] * b.local[i][3]);
    assert.ok(d > 0.999, `${BONES[i].name} local changed (${d.toFixed(4)})`);
  }
  const wa = qrot(a.local[0], [0, 1, 0]), wb = qrot(b.local[0], [0, 1, 0]);
  assert.ok(deg(angle(wa, wb)) > 20, "wrist rotated");
});

test("joint limits keep a noisy, impossible bend inside the finger's range", () => {
  const det = synthDetection({ gesture: "open" });
  // fold the index tip straight back onto the hand (impossible hyper-extension)
  const w = det.world;
  w[8 * 3 + 2] += 0.12;
  w[8 * 3 + 1] += 0.05;
  const { axes, local } = solveDetection(det);
  const i3 = BONES.findIndex((b) => b.name === "index3");
  const bend = deg(angle(axes[i3], axes[i3 - 1]));
  assert.ok(bend <= 92, `index DIP bend ${bend.toFixed(1)}°`);
  assert.ok(local.every((q) => q.every(Number.isFinite)));
});

test("placement: right of the face in the picture → left on the mirrored avatar; bigger hand → closer", () => {
  const face = { cx: 0.5 * (4 / 3), cy: 0.4, h: 0.3 };
  const far = synthDetection({ at: { x: 0.25, y: 0.75 }, pxPerM: 0.3 / 0.18 });
  const near = synthDetection({ at: { x: 0.25, y: 0.75 }, pxPerM: (0.3 / 0.18) * 1.6 });
  const pf = placeHand(far.image, far.world, face, 4 / 3, true);
  const pn = placeHand(near.image, near.world, face, 4 / 3, true);
  assert.ok(Math.abs(pf.ratio - 1) < 0.05, `same depth as the face → ratio ${pf.ratio.toFixed(3)}`);
  assert.ok(Math.abs(pf.pos[2]) < 0.1, "z ≈ face plane");
  assert.ok(pf.pos[0] > 0.5, "image left (x 0.25) → screen right on the mirrored avatar");
  assert.ok(pf.pos[1] < -0.5, "below the face");
  assert.ok(pn.pos[2] > 0.5, `closer hand → z ${pn.pos[2].toFixed(2)}`);
  const unm = placeHand(far.image, far.world, face, 4 / 3, false);
  assert.ok(unm.pos[0] < -0.5, "unmirrored: stays on the image side");
});

test("open palm of the user facing the camera shows the model's palm to the viewer", () => {
  // palm normal (palmBasis z, pointing to the palm side for the rest model) must face +z (the viewer)
  const { side, rest, local } = solveDetection(synthDetection({ gesture: "open" }));
  const J = (n) => rest.joints[BONES.findIndex((b) => b.name === n)];
  const restCurl = Math.sign(dot(sub(J("middle3").tip, J("middle1").pos), rest.basis[2]));
  const palmSide = qrot(local[0], qrot([-rest.joints[0].quat[0], -rest.joints[0].quat[1], -rest.joints[0].quat[2], rest.joints[0].quat[3]], rest.basis[2]));
  assert.ok(palmSide[2] * restCurl > 0.8, `${side}: palm faces the viewer (${palmSide[2].toFixed(2)})`);
});

test("synthetic poses are well-formed", () => {
  for (const g of GESTURES) {
    const p = handPoints(g);
    assert.equal(p.length, 21);
    assert.ok(p.every((q) => q.length === 3 && q.every(Number.isFinite)), g);
  }
});
