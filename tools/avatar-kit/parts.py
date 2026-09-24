"""Face-attached parts: eyebrows and lashes (SDF), laid on the head surface."""
from __future__ import annotations

import math

import numpy as np

import sdf as S
from head import DEFAULT, eye_centres, head_sdf


def surface_point(x: float, y: float, z_hint: float = 0.9, lift: float = 0.0):
    """Point on the neutral head surface in front view (x, y), plus normal."""
    o = np.array([0.0, 0.05, 0.0], np.float32)
    d = np.array([x, y - 0.05, z_hint], np.float32)
    d /= np.linalg.norm(d)
    lo, hi = 0.2, 1.8
    for _ in range(40):
        mid = (lo + hi) / 2
        if head_sdf((o + d * mid)[None])[0] > 0:
            hi = mid
        else:
            lo = mid
    p = o + d * lo
    e = 1e-3
    g = np.array([
        head_sdf((p + [e, 0, 0])[None])[0] - head_sdf((p - [e, 0, 0])[None])[0],
        head_sdf((p + [0, e, 0])[None])[0] - head_sdf((p - [0, e, 0])[None])[0],
        head_sdf((p + [0, 0, e])[None])[0] - head_sdf((p - [0, 0, e])[None])[0],
    ], np.float32)
    n = g / (np.linalg.norm(g) + 1e-9)
    return p + n * lift, n


# ── Eyebrows ──────────────────────────────────────────────────────────────────

BROWS = {
    #            len   arch  peak  t_in   t_out  drop
    "natural": (0.36, 0.05, 0.6, 0.075, 0.042, 0.03),
    "thin": (0.35, 0.055, 0.62, 0.042, 0.026, 0.03),
    "thick": (0.37, 0.04, 0.6, 0.105, 0.065, 0.025),
    "arched": (0.34, 0.09, 0.52, 0.07, 0.034, 0.05),
    "straight": (0.36, 0.012, 0.6, 0.078, 0.058, 0.008),
    "bushy": (0.38, 0.035, 0.6, 0.12, 0.085, 0.03),
    "angled": (0.35, 0.08, 0.7, 0.08, 0.036, 0.07),
}
BROW_BOUNDS = ((-0.72, 0.72), (0.12, 0.62), (0.35, 1.08))


def brow_sdf(style: str):
    L, arch, peak, t_in, t_out, drop = BROWS[style]
    n = 9
    pts, rad = [], []
    for i in range(n):
        t = i / (n - 1)
        x = 0.1 + L * t
        y = 0.34 + arch * math.sin(math.pi * min(1.0, t / (peak * 2))) - drop * t * t
        p, _ = surface_point(x, y, lift=0.012)
        pts.append(p)
        taper = min(1.0, (t / 0.12) ** 0.5) * (1 - t) ** 0.35
        rad.append(max(0.006, (t_in + (t_out - t_in) * t) * 0.5 * (0.35 + 0.65 * taper)))
    pts = np.array(pts, np.float32)

    def fn(p):
        pm = np.concatenate([np.abs(p[:, :1]), p[:, 1:]], axis=1)
        tube = S.curve_tube(pm, pts, rad, samples=40)
        # flatten onto the skin: keep a thin band just above the surface
        band = np.abs(head_sdf(p) - 0.016) - 0.014
        return S.smax(tube, band, 0.008)

    return fn


# ── Lashes ────────────────────────────────────────────────────────────────────

LASHES = ("natural", "long", "dramatic", "winged", "none")
LASH_BOUNDS = ((-0.75, 0.75), (-0.2, 0.42), (0.5, 1.15))


def lid_edge(c, er, phi):
    """Point on the upper lid opening edge (see head.py lid fold)."""
    R = er * 1.08
    y = er * 0.56
    rr = math.sqrt(max(1e-6, R * R - y * y))
    return c + np.array([rr * math.sin(phi), y, rr * math.cos(phi)], np.float32)


def lash_sdf(style: str):
    (cL, _), er = eye_centres(DEFAULT)
    liner = {"natural": 0.014, "long": 0.014, "dramatic": 0.02, "winged": 0.02, "none": 0.009}[style]
    count = {"natural": 7, "long": 9, "dramatic": 12, "winged": 8, "none": 0}[style]
    length = {"natural": 0.035, "long": 0.06, "dramatic": 0.075, "winged": 0.05, "none": 0}[style]
    phis = np.linspace(-1.15, 1.15, 17)
    edge = [lid_edge(cL, er, p) + np.array([0, 0.004, 0.006], np.float32) for p in phis]
    radii = [liner * (0.55 + 0.45 * math.cos(p * 1.2)) for p in phis]
    flicks = []
    for i in range(count):
        ph = -1.0 + 2.0 * (i + 0.5) / count
        b = lid_edge(cL, er, ph)
        out = np.array([math.sin(ph), 0, math.cos(ph)], np.float32)
        outer = (ph + 1) / 2  # +x side is the outer corner for the left eye
        ln = length * (0.7 + 0.6 * outer)
        d = out * 0.55 + np.array([0, 0.85, 0], np.float32)
        d /= np.linalg.norm(d)
        tip = b + d * ln + np.array([0.0, -0.005, 0.01], np.float32)
        flicks.append((b, tip))
    wing = None
    if style == "winged":
        s = lid_edge(cL, er, 1.15)
        wing = [s, s + np.array([0.05, 0.025, -0.02], np.float32), s + np.array([0.1, 0.06, -0.045], np.float32)]

    def fn(p):
        pm = np.concatenate([np.abs(p[:, :1]), p[:, 1:]], axis=1)
        d = S.curve_tube(pm, edge, radii, samples=48)
        for a, b in flicks:
            d = S.smin(d, S.capsule(pm, a, b, lambda h: 0.0065 * (1 - h) + 0.0015), 0.004)
        if wing:
            d = S.smin(d, S.curve_tube(pm, wing, [liner * 0.8, liner * 0.6, 0.003], samples=12), 0.006)
        return d

    return fn


__all__ = ["BROWS", "BROW_BOUNDS", "brow_sdf", "LASHES", "LASH_BOUNDS", "lash_sdf", "surface_point"]
