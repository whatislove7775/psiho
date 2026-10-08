/** Radial envelope of the actual, fitted headwear. Hair is tucked into this volume,
 * rather than sliced by a plane that leaves open strands and misses curved brims. */
export interface Surface {
  pos: Float32Array;
  index: ArrayLike<number> | null;
}
export const HAT_EL = 96,
  HAT_AZ = 192;
const EL = HAT_EL,
  AZ = HAT_AZ;
function cell(x: number, y: number, z: number) {
  const r = Math.hypot(x, y, z) || 1e-6;
  const e = Math.max(
    0,
    Math.min(
      EL - 1,
      Math.floor(
        (Math.asin(Math.max(-1, Math.min(1, y / r))) / Math.PI + 0.5) * EL,
      ),
    ),
  );
  const a = Math.max(
    0,
    Math.min(AZ - 1, Math.floor((Math.atan2(x, z) / (2 * Math.PI) + 0.5) * AZ)),
  );
  return e * AZ + a;
}
export function headwearEnvelope(parts: Surface[]): Float32Array {
  const radii = new Float32Array(EL * AZ).fill(Infinity);
  const mark = (x: number, y: number, z: number) => {
    const k = cell(x, y, z),
      r = Math.hypot(x, y, z);
    if (r > 0.3) radii[k] = Math.min(radii[k], r);
  };
  for (const { pos: p, index } of parts) {
    const count = index?.length ?? p.length / 3;
    for (let t = 0; t + 2 < count; t += 3) {
      const a = (index?.[t] ?? t) * 3,
        b = (index?.[t + 1] ?? t + 1) * 3,
        c = (index?.[t + 2] ?? t + 2) * 3;
      const len = Math.max(
        Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]),
        Math.hypot(p[a] - p[c], p[a + 1] - p[c + 1], p[a + 2] - p[c + 2]),
        Math.hypot(p[c] - p[b], p[c + 1] - p[b + 1], p[c + 2] - p[b + 2]),
      );
      const n = Math.min(40, Math.max(1, Math.ceil(len / 0.018)));
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n - i; j++) {
          const u = i / n,
            v = j / n,
            w = 1 - u - v;
          mark(
            p[a] * w + p[b] * u + p[c] * v,
            p[a + 1] * w + p[b + 1] * u + p[c + 1] * v,
            p[a + 2] * w + p[b + 2] * u + p[c + 2] * v,
          );
        }
    }
  }
  // Conservative padding closes sampling holes, including the azimuth singularity
  // at the crown. A small overlap at the rim keeps adjacent hair triangles inside.
  for (let pass = 0; pass < 4; pass++) {
    const next = radii.slice();
    for (let e = 0; e < EL; e++)
      for (let a = 0; a < AZ; a++) {
        const k = e * AZ + a;
        if (Number.isFinite(radii[k])) continue;
        let n = 0,
          min = Infinity;
        for (let de = -1; de <= 1; de++)
          for (let da = -1; da <= 1; da++) {
            const ee = Math.max(0, Math.min(EL - 1, e + de));
            const v = radii[ee * AZ + ((a + da + AZ) % AZ)];
            if (Number.isFinite(v)) {
              n++;
              min = Math.min(min, v);
            }
          }
        if (n >= 1) next[k] = min;
      }
    radii.set(next);
  }
  // Closed hats cover complete rings above their opening; triangle samples at
  // high elevation must not leave isolated directions uncovered.
  for (let e = EL / 2; e < EL; e++) {
    let min = Infinity,
      count = 0;
    for (let a = 0; a < AZ; a++) {
      const r = radii[e * AZ + a];
      if (Number.isFinite(r)) {
        min = Math.min(min, r);
        count++;
      }
    }
    if (count > AZ / 2)
      for (let a = 0; a < AZ; a++) {
        if (!Number.isFinite(radii[e * AZ + a])) radii[e * AZ + a] = min;
      }
  }
  return radii;
}
function radiusInCell(envelope: Float32Array, k: number) {
  const e = Math.floor(k / AZ),
    a = k % AZ;
  let h = Infinity;
  for (let de = -2; de <= 2; de++)
    for (let da = -2; da <= 2; da++) {
      const ee = Math.max(0, Math.min(EL - 1, e + de));
      h = Math.min(h, envelope[ee * AZ + ((a + da + AZ) % AZ)]);
    }
  return h;
}
/** Same conservative envelope for the pixel guard; zero means no headwear. */
export function headwearBytes(envelope: Float32Array) {
  return Uint8Array.from(envelope, (_, k) => {
    const r = radiusInCell(envelope, k);
    return Number.isFinite(r)
      ? Math.max(1, Math.min(255, Math.floor((r / 4) * 255)))
      : 0;
  });
}
const envelopeCache = new WeakMap<
  Float32Array,
  { radius: Float32Array; blend: Float32Array }
>();
function smoothEnvelope(envelope: Float32Array) {
  let value = envelopeCache.get(envelope);
  if (!value) {
    value = {
      radius: new Float32Array(EL * AZ).fill(NaN),
      blend: new Float32Array(EL * AZ),
    };
    envelopeCache.set(envelope, value);
  }
  return value;
}
/** In place, preserves hair below/outside the hat and the closed mesh topology. */
export function tuckHair(
  pos: Float32Array,
  envelope: Float32Array,
  clearance = 0.045,
) {
  const { radius, blend } = smoothEnvelope(envelope);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i],
      y = pos[i + 1],
      z = pos[i + 2];
    const kCell = cell(x, y, z);
    const r = Math.hypot(x, y, z);
    if (Number.isNaN(radius[kCell])) {
      let h = radiusInCell(envelope, kCell),
        influence = 1;
      // Blend compression into exposed hair below the rim. An abrupt finite →
      // infinite envelope makes a shelf in a wide lock, even with closed topology.
      if (!Number.isFinite(h)) {
        const el = Math.floor(kCell / AZ),
          az = kCell % AZ;
        let distance = Infinity;
        for (let de = -10; de <= 10; de++)
          for (let da = -10; da <= 10; da++) {
            const ee = el + de,
              d = Math.hypot(de, da);
            if (ee < 0 || ee >= EL || d >= distance || d > 10) continue;
            const radius = envelope[ee * AZ + ((az + da + AZ) % AZ)];
            if (Number.isFinite(radius)) {
              distance = d;
              h = radius;
            }
          }
        const t = Math.max(0, Math.min(1, (distance - 2) / 8));
        influence = 1 - t * t * (3 - 2 * t);
      }
      radius[kCell] = h;
      blend[kCell] = influence;
    }
    const h = radius[kCell],
      influence = blend[kCell];
    if (!Number.isFinite(h) || r <= h - clearance || r < 1e-6) continue;
    const k = 1 + (Math.max(0.01, h - clearance) / r - 1) * influence;
    pos[i] *= k;
    pos[i + 1] *= k;
    pos[i + 2] *= k;
  }
}
