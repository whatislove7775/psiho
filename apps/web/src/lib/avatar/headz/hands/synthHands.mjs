// Synthetic MediaPipe-like hand landmarks for tests and the «synthetic hands»
// mode of /dev/headz-lab. No camera, no images — just the 21 points of a hand
// in a few canonical gestures, in the same format HandLandmarker returns for an
// UNMIRRORED camera frame (including its mirrored handedness label).
import { add, norm, qFromTo, qmul, qrot, scale, sub } from "./handMath.mjs";

export const GESTURES = ["open", "fist", "thumbsUp", "peace", "point"];

// user's RIGHT hand, palm toward the camera, fingers up (MediaPipe world axes:
// x → image right, y → down, z → away from the camera). Seen by the camera the
// thumb is on the image right.
const UP = [0, -1, 0];
const PALM = [0, 0, -1]; // palm normal, toward the camera
const FINGER = {
  index: { mcp: [0.022, -0.085, 0], len: [0.04, 0.024, 0.02], splay: 0.12 },
  middle: { mcp: [0.0, -0.088, 0], len: [0.045, 0.028, 0.022], splay: 0 },
  ring: { mcp: [-0.02, -0.083, 0], len: [0.042, 0.026, 0.021], splay: -0.12 },
  pinky: { mcp: [-0.038, -0.074, 0], len: [0.032, 0.019, 0.018], splay: -0.26 },
};
const THUMB = { cmc: [0.022, -0.025, -0.006], len: [0.036, 0.03, 0.025], dir: norm([0.75, -0.6, -0.25]), fold: norm([-1, -0.35, -0.55]) };

const CURLED = [1.45, 1.75, 1.05];
const STRAIGHT = [0.05, 0.05, 0.03];
const POSES = {
  open: { index: STRAIGHT, middle: STRAIGHT, ring: STRAIGHT, pinky: STRAIGHT, thumb: [0.05, 0.05, 0.05] },
  fist: { index: CURLED, middle: CURLED, ring: CURLED, pinky: CURLED, thumb: [0.5, 0.75, 0.55] },
  thumbsUp: { index: CURLED, middle: CURLED, ring: CURLED, pinky: CURLED, thumb: [0, 0, 0], thumbUp: true },
  peace: { index: STRAIGHT, middle: STRAIGHT, ring: CURLED, pinky: CURLED, thumb: [0.55, 0.8, 0.6], spread: { index: 0.3, middle: -0.2 } },
  point: { index: STRAIGHT, middle: CURLED, ring: CURLED, pinky: CURLED, thumb: [0.55, 0.8, 0.6] },
};

function axisAngle(axis, a) {
  const s = Math.sin(a / 2);
  const n = norm(axis);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)];
}

/** 21 points (metres, hand frame above) of a right hand in `gesture`. */
export function handPoints(gesture = "open") {
  const P = POSES[gesture] ?? POSES.open;
  const pts = new Array(21);
  pts[0] = [0, 0, 0];
  // thumb
  let p = THUMB.cmc;
  pts[1] = p;
  let bend = 0;
  for (let k = 0; k < 3; k++) {
    bend += P.thumb[k];
    const d = norm(add(scale(THUMB.dir, Math.cos(bend)), scale(THUMB.fold, Math.sin(bend))));
    p = add(p, scale(d, THUMB.len[k]));
    pts[2 + k] = p;
  }
  let base = 5;
  for (const f of ["index", "middle", "ring", "pinky"]) {
    const F = FINGER[f];
    const splay = F.splay + (P.spread?.[f] ?? 0);
    const s = [Math.sin(splay), -Math.cos(splay), 0];
    p = F.mcp;
    pts[base] = p;
    let th = 0;
    for (let k = 0; k < 3; k++) {
      th += P[f][k];
      const d = add(scale(s, Math.cos(th)), scale(PALM, Math.sin(th)));
      p = add(p, scale(d, F.len[k]));
      pts[base + 1 + k] = p;
    }
    base += 4;
  }
  if (P.thumbUp) {
    // thumbs-up: turn the fist so the thumb points straight up and the palm faces the body's midline
    // (image +x for the right hand), knuckles toward the camera
    const q1 = qFromTo(norm(sub(pts[4], pts[1])), UP);
    const n = qrot(q1, PALM);
    const tw = Math.atan2(n[0], -n[2]) - Math.PI / 2; // angle of the palm normal in the xz plane, relative to +x
    const q = qmul(axisAngle(UP, -tw), q1);
    for (let i = 0; i < 21; i++) pts[i] = qrot(q, pts[i]);
  }
  return pts;
}

/**
 * A HandLandmarker-like detection.
 * @param {object} o
 *   gesture, hand ("right" | "left" — the user's own hand), at {x, y} image position of the
 *   wrist (0‥1), pxPerM (image heights per metre at the hand), aspect, rot: extra quaternion
 * @returns {{label: "Left"|"Right", score: number, image: Float32Array, world: Float32Array}}
 */
export function synthDetection({ gesture = "open", hand = "right", at = { x: 0.3, y: 0.7 }, pxPerM = 2.2, aspect = 4 / 3, rot = null } = {}) {
  let pts = handPoints(gesture);
  if (hand === "left") pts = pts.map((q) => [-q[0], q[1], q[2]]);
  if (rot) pts = pts.map((q) => qrot(rot, q));
  const c = pts.reduce((s, q) => add(s, scale(q, 1 / 21)), [0, 0, 0]);
  const world = new Float32Array(63);
  const image = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    const w = [pts[i][0] - c[0], pts[i][1] - c[1], pts[i][2] - c[2]];
    world.set(w, i * 3);
    image[i * 3] = at.x + (pts[i][0] * pxPerM) / aspect;
    image[i * 3 + 1] = at.y + pts[i][1] * pxPerM;
    image[i * 3 + 2] = pts[i][2] * pxPerM;
  }
  // HandLandmarker assumes a mirrored (selfie) picture: on our raw frames the labels are swapped
  return { label: hand === "right" ? "Left" : "Right", score: 0.98, image, world };
}

