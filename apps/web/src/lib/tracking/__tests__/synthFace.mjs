// Synthetic MediaPipe-style landmarks for tests (only the indices the tracker reads).
import { LM } from "../faceMath.mjs";

// ── Synthetic face ──────────────────────────────────────────────────────────
// Face-local coords: X = toward subject's left (image right in an unmirrored
// frame), Y = up, Z = toward camera; eye span (33↔263) = 1.
export function neutralFace() {
  const f = new Map();
  const set = (i, x, y, z = 0) => f.set(i, [x, y, z]);
  // right eye (X < 0)
  set(LM.R_EYE_OUTER, -0.5, 0);
  set(LM.R_EYE_INNER, -0.17, 0);
  set(160, -0.39, 0.05); set(144, -0.39, -0.04);
  set(159, -0.335, 0.06); set(145, -0.335, -0.05);
  set(158, -0.28, 0.05); set(153, -0.28, -0.04);
  set(LM.R_IRIS, -0.335, 0.005);
  // left eye (mirror)
  set(LM.L_EYE_OUTER, 0.5, 0);
  set(LM.L_EYE_INNER, 0.17, 0);
  set(387, 0.39, 0.05); set(373, 0.39, -0.04);
  set(386, 0.335, 0.06); set(374, 0.335, -0.05);
  set(385, 0.28, 0.05); set(380, 0.28, -0.04);
  set(LM.L_IRIS, 0.335, 0.005);
  // brows
  set(LM.R_BROW_INNER, -0.2, 0.2); set(LM.R_BROW_MID, -0.36, 0.24); set(LM.R_BROW_OUTER, -0.55, 0.17);
  set(LM.L_BROW_INNER, 0.2, 0.2); set(LM.L_BROW_MID, 0.36, 0.24); set(LM.L_BROW_OUTER, 0.55, 0.17);
  // mouth
  set(LM.MOUTH_R, -0.25, -0.75, -0.05); set(LM.MOUTH_L, 0.25, -0.75, -0.05);
  set(LM.LIP_INNER_UP, 0, -0.745, 0.02); set(LM.LIP_INNER_LOW, 0, -0.755, 0.02);
  // axis
  set(LM.FOREHEAD, 0, 0.6, 0.05); set(LM.CHIN, 0, -1.1, 0);
  return f;
}

/** Face-local → MediaPipe normalised landmarks (478), with optional yaw/pitch/roll. */
export function toLandmarks(face, { yaw = 0, pitch = 0, roll = 0, aspect = 4 / 3, size = 0.25 } = {}) {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll)];
  for (const [i, [x0, y0, z0]] of face) {
    // roll (Z), pitch (X), yaw (Y)
    let x = x0 * cr - y0 * sr, y = x0 * sr + y0 * cr, z = z0;
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    // image: x right, y down, z negative toward camera; isotropic via aspect
    lm[i] = { x: 0.5 + (x * size) / aspect, y: 0.5 - y * size, z: (-z * size) / aspect };
  }
  return lm;
}

export const edit = (face, changes) => {
  const f = new Map(face);
  for (const [i, dx, dy] of changes) {
    const [x, y, z] = f.get(i);
    f.set(i, [x + dx, y + dy, z]);
  }
  return f;
};

