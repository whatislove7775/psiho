// Hand solver: MediaPipe HandLandmarker landmarks → bone rotations of the
// minimal 21-bone hand skeleton exported by tools/headz/export_hands.py, and
// the placement of a floating (Memoji-style) hand next to the avatar's head.
//
// Dependency-free (plain arrays, own vector/quaternion helpers) so it runs in
// node tests:  node --test src/lib/avatar/headz/hands/__tests__/
//
// Coordinate spaces
//   MediaPipe world landmarks: metres, x → image right, y → image down, z → away
//   from the camera (smaller = closer), origin near the hand centre. The camera
//   frame is NOT mirrored.
//   Avatar space (three.js): x → screen right, y → up, z → toward the viewer.
//   The avatar mirrors the user (like a mirror), so x is flipped, which also
//   flips chirality: the user's right hand becomes the avatar's LEFT hand mesh.

/** MediaPipe hand landmark indices */
export const LM = { wrist: 0, thumb: 1, index: 5, middle: 9, ring: 13, pinky: 17 };
export const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];

/**
 * The 21 driven bones in hierarchy order. Bone k (0‥3) of a finger runs from
 * landmark `from` to landmark `to`; bone 0 starts at the wrist.
 */
export const BONES = (() => {
  const out = [{ name: "wrist", parent: -1, from: 0, to: 9 }];
  for (const f of FINGERS) {
    const base = LM[f];
    let parent = 0;
    for (let k = 0; k < 4; k++) {
      out.push({ name: `${f}${k}`, parent, from: k === 0 ? 0 : base + k - 1, to: base + k });
      parent = out.length - 1;
    }
  }
  return out;
})();

// ── tiny vector / quaternion kit ([x,y,z], [x,y,z,w]) ─────────────────────
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b)))));

export const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qrot(q, v) {
  const u = [q[0], q[1], q[2]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[3])), cross(u, t));
}
/** shortest rotation taking unit vector a onto unit vector b */
export function qFromTo(a, b) {
  const d = dot(a, b);
  if (d < -0.999999) {
    let axis = cross([1, 0, 0], a);
    if (len(axis) < 1e-6) axis = cross([0, 1, 0], a);
    axis = norm(axis);
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = cross(a, b);
  const q = [c[0], c[1], c[2], 1 + d];
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
/** rotation matrix (columns x, y, z) → quaternion */
export function qFromBasis(x, y, z) {
  const m00 = x[0], m10 = x[1], m20 = x[2];
  const m01 = y[0], m11 = y[1], m21 = y[2];
  const m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
export function qslerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) {
    d = -d;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (d > 0.9995) {
    const q = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t];
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}

/**
 * Palm frame from wrist / index MCP / pinky MCP / middle MCP:
 * y → middle knuckle, z = palm normal (index × pinky), x completes it.
 * Chirality-sensitive on purpose: the same formula on a left hand and on a
 * right hand gives opposite normals relative to the palm.
 */
export function palmBasis(p0, p5, p17, p9) {
  const y = norm(sub(p9, p0));
  let z = norm(cross(sub(p5, p0), sub(p17, p0)));
  const x = norm(cross(y, z));
  z = cross(x, y);
  return [x, y, z];
}

// ── conversion ────────────────────────────────────────────────────────────

/** MediaPipe world landmarks (flat xyz × 21) → avatar-space points (metres). */
export function toAvatarPoints(world, mirror = true) {
  const sx = mirror ? -1 : 1;
  const out = new Array(21);
  for (let i = 0; i < 21; i++) out[i] = [sx * world[i * 3], -world[i * 3 + 1], -world[i * 3 + 2]];
  return out;
}

/**
 * Which avatar hand mesh a detection drives. MediaPipe labels handedness as if
 * the picture were mirrored (selfie); our frames are not, so "Left" is the
 * user's right hand. In a mirrored avatar the user's right hand is shown as
 * the avatar's left hand → "Left" → L. Without mirroring the labels swap.
 */
export function sideFor(label, mirror = true) {
  const left = label === "Left";
  return (mirror ? left : !left) ? "L" : "R";
}

// ── rest skeleton + solver ────────────────────────────────────────────────

/**
 * Rest data of one hand skeleton, all in the hand root's space.
 * @param {{name:string, pos:number[], quat:number[], localQuat:number[], tip?:number[]}[]} joints
 *   one entry per bone of BONES (same order): head position, world (root-space)
 *   and local rest rotation; `tip` = head of the child that defines the bone's
 *   axis (next bone or the …Tip marker; for the wrist, middle1's head).
 */
export function buildRest(joints) {
  const axis = joints.map((j) => norm(qrot(qinv(j.quat), sub(j.tip, j.pos))));
  const P = (n) => joints[BONES.findIndex((b) => b.name === n)].pos;
  const basis = palmBasis(P("wrist"), P("index1"), P("pinky1"), P("middle1"));
  return {
    joints,
    axis,
    basis,
    basisQ: qFromBasis(...basis),
    /** wrist → middle-finger tip length of the model (root-space units) */
    length: len(sub(joints[BONES.findIndex((b) => b.name === "middle3")].tip, P("wrist"))),
  };
}

/**
 * Rest data from the skeleton's local bind transforms (glTF node TRS, scale ≈ 1).
 * @param {Record<string, {t:number[], r:number[]}>} nodes  the 21 bones + the five
 *   "<finger>Tip" markers; the wrist's transform is relative to the hand root.
 */
export function restFromLocal(nodes) {
  const W = {};
  const walk = (name, parentName) => {
    const n = nodes[name];
    if (!n) throw new Error(`hand skeleton: missing bone ${name}`);
    const P = parentName ? W[parentName] : { pos: [0, 0, 0], quat: [0, 0, 0, 1] };
    W[name] = { pos: add(P.pos, qrot(P.quat, n.t)), quat: qmul(P.quat, n.r), localQuat: n.r };
  };
  walk("wrist", null);
  for (const f of FINGERS) {
    let parent = "wrist";
    for (let k = 0; k < 4; k++) {
      walk(`${f}${k}`, parent);
      parent = `${f}${k}`;
    }
    walk(`${f}Tip`, parent);
  }
  const joints = BONES.map((b, i) => {
    const next = b.name === "wrist" ? "middle1" : b.name.endsWith("3") ? b.name.slice(0, -1) + "Tip" : BONES[i + 1].name;
    return { name: b.name, pos: W[b.name].pos, quat: W[b.name].quat, localQuat: W[b.name].localQuat, tip: W[next].pos };
  });
  return buildRest(joints);
}

/** Joint limits: max angle (rad) between a bone and its parent's axis. */
const MAX_BEND = { 0: 0.9, 1: 1.75, 2: 1.9, 3: 1.6 };
const MAX_BEND_THUMB = { 0: 1.3, 1: 1.3, 2: 1.4, 3: 1.6 };

/**
 * Solve local bone rotations for avatar-space points (any uniform scale).
 * Wrist: full orientation from the palm frame. Fingers: each bone is swung
 * (minimal rotation from its rest pose relative to its parent) to point along
 * its landmark segment, within joint limits. Returns 21 local quaternions.
 */
export function solveHand(rest, pts) {
  const n = BONES.length;
  const world = new Array(n);
  const local = new Array(n);
  // wrist
  const tb = palmBasis(pts[0], pts[5], pts[17], pts[9]);
  const R = qmul(qFromBasis(...tb), qinv(rest.basisQ));
  world[0] = qmul(R, rest.joints[0].quat);
  local[0] = world[0];
  for (let i = 1; i < n; i++) {
    const b = BONES[i];
    const pw = world[b.parent];
    const w0 = qmul(pw, rest.joints[i].localQuat);
    const a = qrot(w0, rest.axis[i]);
    let d = norm(sub(pts[b.to], pts[b.from]));
    // joint limit relative to the parent's current axis
    const k = Number(b.name.slice(-1));
    const lim = (b.name.startsWith("thumb") ? MAX_BEND_THUMB : MAX_BEND)[k];
    if (b.parent !== 0) {
      const pa = qrot(pw, rest.axis[b.parent]);
      const ang = angle(pa, d);
      if (ang > lim) {
        const q = qFromTo(pa, d);
        d = norm(qrot(qslerp([0, 0, 0, 1], q, lim / ang), pa));
      }
    }
    const w = qmul(qFromTo(a, d), w0);
    world[i] = w;
    local[i] = qmul(qinv(pw), w);
  }
  return local;
}

/** Forward kinematics (tests / debug): local rotations → world axis of every bone. */
export function boneAxes(rest, local) {
  const world = new Array(BONES.length);
  return BONES.map((b, i) => {
    world[i] = b.parent < 0 ? local[i] : qmul(world[b.parent], local[i]);
    return qrot(world[i], rest.axis[i]);
  });
}

// ── placement next to the head ────────────────────────────────────────────

/** Avatar head-space constants (normalised head: chin → crown = 2 units, centre at the origin). */
export const PLACE = {
  /** forehead-top (lm 10) → chin (lm 152) of MediaPipe's face mesh, in avatar units */
  faceUnits: 1.55,
  /** avatar y of the face-landmark midpoint (between lm 10 and 152) */
  faceY: -0.12,
  /** how far a hand moves in z per unit of relative depth change */
  depthGain: 2.2,
  zMin: -0.7,
  zMax: 1.8,
  /** typical metres of face height 10→152 (only the ratio to the hand matters) */
  faceMetres: 0.18,
};

/**
 * Where the hand's palm centre goes in avatar space.
 * @param img   image landmarks (flat xyz × 21, normalised 0‥1)
 * @param world world landmarks (flat xyz × 21, metres)
 * @param face  {cx, cy, h} face centre + height in image units (x in image-height units, i.e. ×aspect)
 * @param aspect camera width / height
 * @param camDist avatar camera distance to the head centre (for perspective)
 */
export function placeHand(img, world, face, aspect, mirror = true, camDist = 9) {
  const u = (i) => [img[i * 3] * aspect, img[i * 3 + 1]];
  const pairs = [[0, 5], [0, 17], [5, 17], [0, 9], [9, 12], [5, 8]];
  let pi = 0, pw = 0;
  for (const [a, b] of pairs) {
    const A = u(a), B = u(b);
    pi += Math.hypot(A[0] - B[0], A[1] - B[1]);
    pw += Math.hypot(world[a * 3] - world[b * 3], world[a * 3 + 1] - world[b * 3 + 1]);
  }
  const handPxPerM = pw > 1e-4 ? pi / pw : 0;
  const facePxPerM = face.h / PLACE.faceMetres;
  // > 1: hand closer to the camera than the face
  const ratio = handPxPerM > 0 && facePxPerM > 0 ? handPxPerM / facePxPerM : 1;
  const z = Math.max(PLACE.zMin, Math.min(PLACE.zMax, PLACE.depthGain * (1 - 1 / Math.max(0.3, ratio))));
  // palm centre (image) relative to the face, in avatar units at the face plane
  const c = [0, 5, 9, 17].map(u).reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
  const k = PLACE.faceUnits / Math.max(1e-3, face.h);
  const persp = (camDist - z) / camDist;
  const x = (mirror ? -1 : 1) * (c[0] - face.cx) * k * persp;
  const y = PLACE.faceY - (c[1] - face.cy) * k * persp;
  return { pos: [x, y, z], ratio };
}

/** Face reference for placeHand from FaceLandmarker landmarks ({x,y}[] normalised). */
export function faceRef(lm, aspect) {
  const t = lm[10], b = lm[152];
  if (!t || !b) return null;
  return { cx: ((t.x + b.x) / 2) * aspect, cy: (t.y + b.y) / 2, h: Math.hypot((t.x - b.x) * aspect, t.y - b.y) };
}
