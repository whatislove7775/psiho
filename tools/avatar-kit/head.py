"""Memoji-style head sculpted as a smooth-union SDF.

Units: head is ~2 tall, face looks toward +z, y up. `HeadShape` holds the
identity parameters; the neutral kit mesh is built from DEFAULT and every
other shape becomes a morph target by re-projecting the neutral vertices
onto the SDF evaluated with different parameters (same topology).
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace

import numpy as np

import sdf as S

EYE = np.array([0.335, 0.0, 0.76], dtype=np.float32)  # right-side eye centre (x mirrored)
EYE_R = 0.235


@dataclass(frozen=True)
class HeadShape:
    width: float = 1.0          # overall skull width
    length: float = 1.0         # face length (chin distance)
    jaw: float = 1.0            # jaw width at the cheeks
    chin: float = 0.0           # -1 soft/round … +1 pointed
    chin_square: float = 0.0    # 0..1
    cheeks: float = 0.5         # fullness 0..1
    nose_size: float = 0.5      # 0..1
    nose_width: float = 0.5     # 0..1
    nose_bridge: float = 0.4    # 0..1 bridge height
    nose_tip_up: float = 0.5    # 0..1 (button = up)
    nose_hook: float = 0.0      # 0..1
    lips_upper: float = 0.5     # 0..1 fullness
    lips_lower: float = 0.5
    mouth_width: float = 0.5
    ears: float = 0.5           # size
    eye_size: float = 0.5
    brow_ridge: float = 0.4


DEFAULT = HeadShape()


def eye_centres(h: HeadShape):
    r = EYE_R * (0.9 + 0.2 * h.eye_size)
    c = EYE.copy()
    return [np.array([c[0], c[1], c[2]], np.float32), np.array([-c[0], c[1], c[2]], np.float32)], r


def head_sdf(p: np.ndarray, h: HeadShape = DEFAULT) -> np.ndarray:
    ax = np.abs(p[:, 0])[:, None]
    pm = np.concatenate([ax, p[:, 1:]], axis=1)  # mirrored (x ≥ 0) for symmetric parts

    L = h.length
    # Cranium + face volume
    d = S.ellipsoid(p, (0, 0.12, -0.08), (1.0 * h.width, 0.96, 1.0))
    d = S.smin(d, S.ellipsoid(p, (0, -0.34 * L, 0.06), (0.84 * h.jaw * h.width, 0.72 * L, 0.84)), 0.55)
    # Full cheeks (the Memoji signature)
    ck = 0.3 + 0.1 * h.cheeks
    d = S.smin(d, S.sphere(pm, (0.5 * h.jaw, -0.34 * L, 0.42), ck), 0.22)
    # Jaw & chin
    chin_r = 0.2 - 0.05 * h.chin
    d = S.smin(d, S.ellipsoid(p, (0, -0.86 * L, 0.43), (chin_r * (1 + h.chin_square * 0.8), chin_r, chin_r * 0.95)), 0.16)
    # Muzzle
    d = S.smin(d, S.ellipsoid(p, (0, -0.5 * L, 0.66), (0.37, 0.24, 0.26)), 0.16)
    # Brow ridge
    br = 0.04 * h.brow_ridge
    d = S.smin(d, S.sphere(pm, (0.33, 0.27, 0.46 + br), 0.36), 0.25)

    # Eye sockets: carve a hole for each eyeball, then add soft lid folds
    (cr, _), er = eye_centres(h)
    d = S.ssub(d, S.sphere(pm, cr, er * 1.02), 0.05)
    q = pm - cr
    # Upper lid: a soft fold over the top of the eyeball, opening above the iris
    shell = np.abs(S.sphere(pm, cr, er * 1.055)) - 0.026
    upper_lid = S.smax(shell, -(q[:, 1] - er * 0.56), 0.03)
    upper_lid = S.smax(upper_lid, -(q[:, 2] - er * 0.4), 0.06)  # only the front of the eye
    d = S.smin(d, upper_lid, 0.05)
    # Lower lid: thin rim below the iris
    lshell = np.abs(S.sphere(pm, cr, er * 1.03)) - 0.016
    lower_lid = S.smax(lshell, -(-q[:, 1] - er * 0.78), 0.025)
    lower_lid = S.smax(lower_lid, -(q[:, 2] + er * 0.1), 0.05)
    d = S.smin(d, lower_lid, 0.05)

    # Nose: bulb + bridge + wings, nostrils carved
    ns = 0.8 + 0.45 * h.nose_size
    nw = 0.8 + 0.5 * h.nose_width
    tip_y = -0.2 - 0.04 * (1 - h.nose_tip_up) - 0.03 * h.nose_hook
    tip = (0, tip_y * L, 0.97 + 0.04 * ns)
    d = S.smin(d, S.ellipsoid(p, tip, (0.13 * ns * nw, 0.115 * ns, 0.11 * ns)), 0.07)
    bridge_top = (0, 0.12, 0.86)
    d = S.smin(d, S.capsule(p, bridge_top, (0, tip[1] + 0.07, tip[2] - 0.03), 0.035 + 0.04 * h.nose_bridge * ns), 0.08)
    if h.nose_hook > 0:
        d = S.smin(d, S.sphere(p, (0, tip[1] + 0.14, tip[2] - 0.02), 0.05 * h.nose_hook + 0.02), 0.06)
    d = S.smin(d, S.sphere(pm, (0.1 * nw * ns, tip[1] - 0.045, tip[2] - 0.1), 0.075 * ns), 0.06)
    d = S.ssub(d, S.ellipsoid(pm, (0.05 * nw * ns, tip[1] - 0.085 * ns, tip[2] - 0.04), (0.03 * nw, 0.02, 0.035)), 0.02)

    # Lips with a closed mouth line
    mw = 0.22 + 0.08 * h.mouth_width
    my = -0.5 * L
    up_t = 0.045 + 0.03 * h.lips_upper
    lo_t = 0.055 + 0.035 * h.lips_lower
    # upper lip with a cupid's bow (two lobes), lower lip one fuller lobe
    for sx in (-1, 1):
        d = S.smin(d, S.ellipsoid(p, (sx * mw * 0.42, my + 0.038, 0.915), (mw * 0.62, up_t, 0.08)), 0.04)
    d = S.smin(d, S.ellipsoid(p, (0, my - 0.05, 0.895), (mw * 0.86, lo_t, 0.09)), 0.045)
    # slight upward corners (friendly resting face)
    d = S.smin(d, S.sphere(pm, (mw * 0.98, my + 0.02, 0.8), 0.035), 0.05)
    # Mouth: a real opening (slit) into a hollow mouth bag, so jawOpen reveals
    # the inside, teeth and tongue.
    bag = S.ellipsoid(p, (0, my - 0.02, 0.62), (mw * 0.95, 0.15, 0.26))
    slit = S.ellipsoid(p, (0, my, 0.9), (mw * 1.02, 0.011, 0.2))
    d = S.smax(d, -S.smin(bag, slit, 0.02), 0.012)

    # Ears
    es = 1.05 + 0.4 * h.ears
    ear_c = (0.97 * h.width, -0.04, -0.06)
    ear = S.ellipsoid(pm, ear_c, (0.09 * es, 0.23 * es, 0.16 * es))
    ear = S.ssub(ear, S.ellipsoid(pm, (ear_c[0] + 0.07 * es, ear_c[1] - 0.01, ear_c[2] + 0.01), (0.05 * es, 0.15 * es, 0.1 * es)), 0.04)
    d = S.smin(d, ear, 0.06)

    # Neck
    d = S.smin(d, S.capsule(p, (0, -0.6, -0.16), (0, -1.35, -0.2), 0.36), 0.18)
    return d


def grid_points(bounds, step):
    (x0, x1), (y0, y1), (z0, z1) = bounds
    xs = np.arange(x0, x1, step, dtype=np.float32)
    ys = np.arange(y0, y1, step, dtype=np.float32)
    zs = np.arange(z0, z1, step, dtype=np.float32)
    return xs, ys, zs


def evaluate_grid(fn, bounds, step, chunk=2_000_000):
    xs, ys, zs = grid_points(bounds, step)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")
    pts = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)
    out = np.empty(len(pts), dtype=np.float32)
    for i in range(0, len(pts), chunk):
        out[i : i + chunk] = fn(pts[i : i + chunk])
    return out.reshape(X.shape), (xs[0], ys[0], zs[0])


def mesh_from_sdf(fn, bounds, step):
    from skimage.measure import marching_cubes

    vol, origin = evaluate_grid(fn, bounds, step)
    verts, faces, _, _ = marching_cubes(vol, level=0.0, spacing=(step, step, step))
    verts += np.asarray(origin, dtype=np.float32)
    return verts.astype(np.float32), faces.astype(np.int32)


def project(verts: np.ndarray, normals: np.ndarray, fn, iters: int = 6) -> np.ndarray:
    """Move vertices onto the zero set of fn along their normals (Newton-ish)."""
    v = verts.copy()
    for _ in range(iters):
        v = v - normals * fn(v)[:, None]
    return v


HEAD_BOUNDS = ((-1.3, 1.3), (-1.45, 1.3), (-1.25, 1.35))


if __name__ == "__main__":
    import sys
    import time

    import trimesh

    t = time.time()
    v, f = mesh_from_sdf(head_sdf, HEAD_BOUNDS, float(sys.argv[2]) if len(sys.argv) > 2 else 0.014)
    m = trimesh.Trimesh(v, f[:, ::-1], process=True)
    m.export(sys.argv[1] if len(sys.argv) > 1 else "head.ply")
    print(f"head: {len(m.vertices)} verts, {len(m.faces)} faces in {time.time() - t:.1f}s")
