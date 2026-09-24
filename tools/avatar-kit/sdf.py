"""Tiny numpy SDF modelling kit (signed distance fields, smooth booleans).

Stylised characters get their soft, "clay" look from smooth unions of simple
volumes. Every function takes an (N, 3) array of points and returns (N,)
signed distances (negative inside).
"""
from __future__ import annotations

import numpy as np

Arr = np.ndarray


def sphere(p: Arr, c, r: float) -> Arr:
    return np.linalg.norm(p - np.asarray(c, dtype=np.float32), axis=1) - r


def ellipsoid(p: Arr, c, radii) -> Arr:
    """Approximate ellipsoid distance (Inigo Quilez)."""
    q = (p - np.asarray(c, dtype=np.float32)) / np.asarray(radii, dtype=np.float32)
    k0 = np.linalg.norm(q, axis=1)
    k1 = np.linalg.norm(q / np.asarray(radii, dtype=np.float32), axis=1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)


def capsule(p: Arr, a, b, r: float | Arr) -> Arr:
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    pa = p - a
    ba = b - a
    h = np.clip((pa @ ba) / (ba @ ba), 0.0, 1.0)
    rr = r(h) if callable(r) else r
    return np.linalg.norm(pa - h[:, None] * ba, axis=1) - rr


def torus(p: Arr, c, R: float, r: float, axis: str = "y") -> Arr:
    q = p - np.asarray(c, dtype=np.float32)
    if axis == "y":
        x, y, z = q[:, 0], q[:, 1], q[:, 2]
    elif axis == "z":
        x, y, z = q[:, 0], q[:, 2], q[:, 1]
    else:
        x, y, z = q[:, 1], q[:, 0], q[:, 2]
    return np.sqrt((np.sqrt(x * x + z * z) - R) ** 2 + y * y) - r


def curve_tube(p: Arr, pts, radii, samples: int = 24) -> Arr:
    """Tube along a polyline (Catmull-Rom sampled) with per-point radius.

    Only points inside the tube's bounding box (+ margin) are evaluated;
    everything else gets a conservative large distance.
    """
    pts = np.asarray(pts, dtype=np.float32)
    radii = np.asarray(radii, dtype=np.float32)
    t = np.linspace(0, len(pts) - 1, samples)
    i = np.clip(t.astype(int), 0, len(pts) - 2)
    f = (t - i)[:, None]
    p0 = pts[np.clip(i - 1, 0, len(pts) - 1)]
    p1 = pts[i]
    p2 = pts[i + 1]
    p3 = pts[np.clip(i + 2, 0, len(pts) - 1)]
    s = 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f**2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f**3)
    rs = np.interp(t, np.arange(len(radii)), radii)
    margin = float(rs.max()) + 0.25
    lo = s.min(axis=0) - margin
    hi = s.max(axis=0) + margin
    inside = np.all((p >= lo) & (p <= hi), axis=1)
    d = np.full(len(p), 1.0, dtype=np.float32)
    q = p[inside]
    if len(q):
        dq = np.full(len(q), 1e9, dtype=np.float32)
        for k in range(len(s) - 1):
            dq = np.minimum(dq, capsule(q, s[k], s[k + 1], lambda h, a=rs[k], b=rs[k + 1]: a + (b - a) * h))
        d[inside] = dq
    return d


def smin(a: Arr, b: Arr, k: float) -> Arr:
    """Polynomial smooth minimum — smooth union with blend radius k."""
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a: Arr, b: Arr, k: float) -> Arr:
    return -smin(-a, -b, k)


def ssub(a: Arr, b: Arr, k: float) -> Arr:
    """Smooth subtraction a − b."""
    return smax(a, -b, k)


def half_space(p: Arr, n, d: float = 0.0) -> Arr:
    """Signed distance to plane n·p = d (negative on the n side's opposite)."""
    n = np.asarray(n, dtype=np.float32)
    n = n / np.linalg.norm(n)
    return p @ n - d
