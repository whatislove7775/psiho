import * as THREE from "three";

/** Infer strand axes from the sculpted locks, in rest-pose head space.
 * A lock bends much more across its width than along its length. Fit the local
 * symmetric shape operator to edge/normal differences, then take its least
 * curved principal direction. No global spherical projection or hairstyle ID.
 * w is confidence: flat/spherical patches must not invent a strong direction.
 */
export function hairFlow(pos: Float32Array, normals: Float32Array, index: ArrayLike<number> | null): Float32Array {
  const count = pos.length / 3;
  const adjacent = Array.from({ length: count }, () => new Set<number>());
  const triangles = index?.length ?? count;
  for (let k = 0; k + 2 < triangles; k += 3) {
    const a = index ? index[k] : k, b = index ? index[k + 1] : k + 1, c = index ? index[k + 2] : k + 2;
    adjacent[a].add(b).add(c); adjacent[b].add(a).add(c); adjacent[c].add(a).add(b);
  }
  const out = new Float32Array(count * 4);
  const n = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
  const e = new THREE.Vector3(), dn = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    n.fromArray(normals, i * 3).normalize();
    u.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0).cross(n).normalize();
    v.crossVectors(n, u);
    // Unknowns are Sxx, Sxy, Syy. Solve a 3x3 normal equation.
    const m = new Float64Array(12);
    for (const j of adjacent[i]) {
      e.fromArray(pos, j * 3).sub(t.fromArray(pos, i * 3));
      dn.fromArray(normals, j * 3).sub(n);
      const x = e.dot(u), y = e.dot(v), len = x * x + y * y;
      if (len < 1e-12) continue;
      const dx = dn.dot(u), dy = dn.dot(v), w = 1 / len;
      const rows = [[x, y, 0, dx], [0, x, y, dy]];
      for (const r of rows) for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) m[a * 4 + b] += r[a] * r[b] * w;
        m[a * 4 + 3] += r[a] * r[3] * w;
      }
    }
    for (let a = 0; a < 3; a++) m[a * 4 + a] += 1e-6;
    for (let a = 0; a < 3; a++) {
      let pivot = a;
      for (let b = a + 1; b < 3; b++) if (Math.abs(m[b * 4 + a]) > Math.abs(m[pivot * 4 + a])) pivot = b;
      for (let b = 0; b < 4; b++) [m[a * 4 + b], m[pivot * 4 + b]] = [m[pivot * 4 + b], m[a * 4 + b]];
      const scale = m[a * 4 + a];
      for (let b = a; b < 4; b++) m[a * 4 + b] /= scale;
      for (let row = 0; row < 3; row++) if (row !== a) {
        const f = m[row * 4 + a];
        for (let b = a; b < 4; b++) m[row * 4 + b] -= f * m[a * 4 + b];
      }
    }
    const a = m[3], b = m[7], c = m[11];
    const mid = (a + c) / 2, spread = Math.hypot((a - c) / 2, b);
    const hi = mid + spread, lo = mid - spread;
    let angle = 0.5 * Math.atan2(2 * b, a - c);
    if (Math.abs(lo) < Math.abs(hi)) angle += Math.PI / 2;
    t.copy(u).multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle)).normalize();
    out.set([t.x, t.y, t.z, Math.max(0, (Math.abs(Math.abs(hi) - Math.abs(lo)) / (Math.abs(hi) + Math.abs(lo) + 0.1) - 0.15) / 0.85)], i * 4);
  }
  // Consistent signs for interpolation; the texture itself is sign-invariant.
  const visited = new Uint8Array(count);
  for (let root = 0; root < count; root++) if (!visited[root]) {
    const queue = [root]; visited[root] = 1;
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      for (const j of adjacent[i]) if (!visited[j]) {
        const dot = out[i * 4] * out[j * 4] + out[i * 4 + 1] * out[j * 4 + 1] + out[i * 4 + 2] * out[j * 4 + 2];
        if (dot < 0) for (let a = 0; a < 3; a++) out[j * 4 + a] *= -1;
        visited[j] = 1; queue.push(j);
      }
    }
  }
  // Suppress triangulation noise without crossing disconnected locks. Averaging
  // line directions is sign-invariant and projected back onto the local surface.
  for (let pass = 0; pass < 6; pass++) {
    const previous = out.slice();
    for (let i = 0; i < count; i++) {
      t.fromArray(previous, i * 4);
      e.copy(t).multiplyScalar(0.2 + 2 * previous[i * 4 + 3]);
      let confidence = previous[i * 4 + 3];
      for (const j of adjacent[i]) {
        dn.fromArray(previous, j * 4);
        e.addScaledVector(dn, (t.dot(dn) < 0 ? -1 : 1) * previous[j * 4 + 3]);
        confidence = Math.max(confidence, previous[j * 4 + 3] * 0.9);
      }
      n.fromArray(normals, i * 3).normalize();
      e.addScaledVector(n, -e.dot(n)).normalize();
      out.set([e.x, e.y, e.z, confidence], i * 4);
    }
  }
  return out;
}
