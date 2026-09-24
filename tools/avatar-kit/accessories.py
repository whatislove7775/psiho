"""Beards, headwear, eyewear, earrings, nose piercings — all as SDFs."""
from __future__ import annotations

import math

import numpy as np

import sdf as S
from hair import CRANIUM_C, CRANIUM_R, cranium_offset, face_hole, scalp, sdir
from head import DEFAULT, eye_centres, head_sdf

PI = math.pi
MY = -0.5
MW = 0.26


def mirrored(p):
    return np.concatenate([np.abs(p[:, :1]), p[:, 1:]], axis=1)


# ── Facial hair ──────────────────────────────────────────────────────────────


def _layer(p, t, inset=0.01):
    """Shell from just under the skin to `t` above it."""
    h = head_sdf(p)
    return np.maximum(h - t, -(h + inset))


def _mouth_hole(p, grow=0.0):
    return S.ellipsoid(p, (0, MY, 0.92), (MW + 0.05 + grow, 0.085 + grow, 0.25))


def _mustache_region(p, w=1.0):
    return S.ellipsoid(p, (0, MY + 0.075, 0.9), ((MW + 0.05) * w, 0.05, 0.2))


def _beard_region(p, reach=0.0):
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    jaw = S.ellipsoid(p, (0, -0.55, 0.35), (0.92 + reach, 0.55 + reach, 0.8))
    upper = y - (-0.12 + 0.18 * np.clip((np.abs(x) - 0.55) / 0.35, 0, 1))  # sideburns rise at the sides
    back = -(z + 0.15)
    return np.maximum(np.maximum(jaw, upper), back)


def beard_sdf(style: str):
    def fn(p):
        grooves = 0.006 * np.abs(np.sin(p[:, 0] * 38 + p[:, 1] * 12))
        if style == "stubble":
            return S.smax(_layer(p, 0.006), _beard_region(p), 0.02)
        if style in ("mustache", "handlebar"):
            d = S.smax(_layer(p, 0.045), _mustache_region(p), 0.015) + grooves * 0.5
            if style == "handlebar":
                for s in (-1, 1):
                    curl = S.curve_tube(p, [(s * (MW + 0.02), MY + 0.06, 0.88), (s * (MW + 0.1), MY + 0.02, 0.84), (s * (MW + 0.14), MY + 0.1, 0.8), (s * (MW + 0.1), MY + 0.14, 0.8)], [0.035, 0.03, 0.02, 0.012], samples=20)
                    d = S.smin(d, curl, 0.02)
            return d
        if style == "goatee":
            chin = S.smax(_layer(p, 0.07), S.ellipsoid(p, (0, -0.8, 0.6), (0.22, 0.2, 0.35)), 0.02)
            chin = S.ssub(chin, _mouth_hole(p), 0.02)
            must = S.smax(_layer(p, 0.035), _mustache_region(p, 0.85), 0.015)
            return S.smin(chin, must, 0.02) + grooves * 0.5
        if style == "chinstrap":
            inner = _beard_region(p, -0.08)
            band = S.smax(_beard_region(p), -inner, 0.02)
            return S.smax(_layer(p, 0.035), band, 0.015)
        t = {"short-beard": 0.06, "full-beard": 0.1, "long-beard": 0.12}[style]
        d = S.smax(_layer(p, t), _beard_region(p), 0.03)
        d = S.smin(d, S.smax(_layer(p, t * 0.6), _mustache_region(p), 0.015), 0.02)
        if style in ("full-beard", "long-beard"):
            d = S.smin(d, S.ellipsoid(p, (0, -0.98, 0.42), (0.5, 0.2 + (0.25 if style == "long-beard" else 0), 0.32)), 0.12)
        if style == "long-beard":
            d = S.smin(d, S.ellipsoid(p, (0, -1.35, 0.4), (0.34, 0.4, 0.25)), 0.12)
        d = S.ssub(d, _mouth_hole(p), 0.03)
        return d + grooves

    return fn


BEARDS = ("stubble", "mustache", "handlebar", "goatee", "chinstrap", "short-beard", "full-beard", "long-beard")
BEARD_BOUNDS = ((-1.15, 1.15), (-1.9, 0.25), (-0.3, 1.2))


# ── Headwear ─────────────────────────────────────────────────────────────────


def _crown(p, lift, rim_front, rim_back, top_bulge=0.0):
    d = cranium_offset(p, lift) - top_bulge * np.clip(p[:, 1], 0, 1)
    rim = rim_front + (rim_back - rim_front) * np.clip((0.6 - p[:, 2]) / 1.2, 0, 1)
    return S.smax(d, -(p[:, 1] - rim), 0.03), rim


def _shell(d, t=0.03):
    return np.abs(d) - t


def headwear_sdf(style: str):
    def fn(p):
        x, y, z = p[:, 0], p[:, 1], p[:, 2]
        if style == "beanie":
            d, _ = _crown(p, 0.2, 0.42, 0.05, top_bulge=0.12)
            d = d - 0.006 * np.abs(np.sin(np.arctan2(z, x) * 30))
            cuff = S.smax(cranium_offset(p, 0.24), -(y - 0.42 + 0.37 * np.clip((0.6 - z) / 1.2, 0, 1)), 0.02)
            cuff = S.smax(cuff, (y - 0.62 + 0.37 * np.clip((0.6 - z) / 1.2, 0, 1)), 0.02)
            return S.smin(d, cuff, 0.02)
        if style == "cap":
            d, _ = _crown(p, 0.16, 0.5, 0.12, top_bulge=0.06)
            brim = S.ellipsoid(p, (0, 0.52, 0.95), (0.72, 0.035, 0.55))
            brim = S.smax(brim, -(z - 0.7), 0.02)
            btn = S.sphere(p, (0, 1.2, -0.05), 0.05)
            return S.smin(S.smin(d, brim, 0.03), btn, 0.02)
        if style in ("bucket", "fedora"):
            fed = style == "fedora"
            d, _ = _crown(p, 0.18, 0.42, 0.25, top_bulge=0.2 if fed else 0.1)
            if fed:
                d = S.smax(d, -(S.ellipsoid(p, (0, 1.35, 0), (0.25, 0.2, 0.6))), 0.05)  # crease on top
            r = np.sqrt(x * x + (z + 0.05) ** 2)
            ybr = 0.4 - (0.0 if fed else 0.22) * np.clip(r - 1.0, 0, 1)
            brim = np.maximum(np.abs(y - ybr) - 0.022, r - (1.62 if fed else 1.45))
            brim = S.smax(brim, 1.0 - r, 0.02)
            d = S.smin(d, brim, 0.03)
            if fed:
                band = S.smax(_shell(cranium_offset(p, 0.2), 0.02), np.abs(y - 0.5) - 0.06, 0.01)
                d = S.smin(d, band, 0.01)
            return d
        if style == "beret":
            return S.ellipsoid(p - np.array([0.15, 0, 0], np.float32), (0, 1.08, -0.05), (1.08, 0.3, 1.02))
        if style == "headband":
            band = S.smax(_shell(cranium_offset(p, 0.16), 0.03), np.abs(y - (0.62 - 0.3 * np.clip((0.6 - z) / 1.2, 0, 1))) - 0.07, 0.01)
            return band
        if style == "bandana":
            d, _ = _crown(p, 0.15, 0.45, 0.05, top_bulge=0.02)
            tails = S.curve_tube(p, [(0, 0.1, -1.05), (0.12, -0.2, -1.12), (0.18, -0.45, -1.05)], [0.08, 0.06, 0.03], samples=12)
            tails = S.smin(tails, S.curve_tube(p, [(0, 0.1, -1.05), (-0.12, -0.2, -1.12), (-0.18, -0.45, -1.05)], [0.08, 0.06, 0.03], samples=12), 0.02)
            knot = S.sphere(p, (0, 0.12, -1.08), 0.09)
            return S.smin(S.smin(d, knot, 0.03), tails, 0.03)
        if style == "turban":
            d, _ = _crown(p, 0.24, 0.38, -0.05, top_bulge=0.35)
            wraps = np.full(len(p), 1e9, np.float32)
            for i in range(4):
                yy = 0.42 + i * 0.16
                wraps = S.smin(wraps, S.smax(_shell(cranium_offset(p, 0.3 - i * 0.02), 0.05), np.abs(y - yy + 0.35 * np.clip((0.6 - z) / 1.2, 0, 1) - 0.05 * np.sin(np.arctan2(z, x) * 2 + i)) - 0.07, 0.03), 0.03)
            return S.smin(d, wraps, 0.04)
        if style == "hijab":
            wrap = cranium_offset(p, 0.2)
            wrap = S.smin(wrap, S.ellipsoid(p, (0, -0.55, -0.05), (1.12, 0.9, 1.05)), 0.2)
            drape = S.ellipsoid(p, (0, -1.35, -0.1), (1.45, 0.75, 1.25))
            d = S.smin(wrap, drape, 0.25)
            d = S.ssub(d, S.ellipsoid(p, (0, -0.2, 1.0), (0.74, 0.85, 0.75)), 0.08)
            return S.smax(d, -(y + 1.9), 0.05)
        if style == "headphones":
            pts = [scalp(a, PI / 2, 0.14) for a in np.linspace(1.5, 0.0, 6)] + [scalp(a, -PI / 2, 0.14) for a in np.linspace(0.3, 1.5, 5)]
            band = S.curve_tube(p, pts, [0.05] * len(pts), samples=40)
            cups = np.full(len(p), 1e9, np.float32)
            for s in (-1, 1):
                q = p - np.array([s * 1.08, -0.02, -0.06], np.float32)
                cyl = np.maximum(np.sqrt(q[:, 1] ** 2 + q[:, 2] ** 2) - 0.27, np.abs(q[:, 0]) - 0.09)
                cups = S.smin(cups, cyl - 0.03, 0.02)
            return S.smin(band, cups, 0.04)
        raise ValueError(style)

    return fn


HEADWEAR = ("beanie", "cap", "bucket", "fedora", "beret", "headband", "bandana", "turban", "hijab", "headphones")
HEADWEAR_BOUNDS = ((-1.75, 1.75), (-2.0, 1.75), (-1.75, 1.75))
# hair below this plane (per style) stays visible; above is clipped at runtime
HAT_CLIP = {"beanie": (0.42, 0.05), "cap": (0.5, 0.12), "bucket": (0.42, 0.25), "fedora": (0.42, 0.25),
            "bandana": (0.45, 0.05), "turban": (0.38, -0.05), "hijab": (-3.0, -3.0)}


# ── Eyewear ──────────────────────────────────────────────────────────────────


def _box2(x, y, w, h, r):
    qx = np.abs(x) - w + r
    qy = np.abs(y) - h + r
    return np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - r


def _lens2d(style, x, y, side):
    if style == "round":
        return np.sqrt(x * x + y * y) - 0.2
    if style == "square":
        return _box2(x, y, 0.23, 0.17, 0.06)
    if style == "oversized":
        return _box2(x, y, 0.28, 0.23, 0.11)
    if style == "rimless":
        return _box2(x, y, 0.22, 0.16, 0.08)
    if style == "aviator":
        a = np.sqrt(x * x + (y - 0.02) ** 2) - 0.21
        b = np.sqrt((x + side * 0.03) ** 2 + (y + 0.06) ** 2) - 0.19
        return np.maximum(np.minimum(a, b), y - 0.16)
    if style == "cat-eye":
        lift = np.clip(x * side / 0.22, 0, 1) ** 2 * 0.09
        return _box2(x, y - lift * np.clip(y / 0.15, 0, 1), 0.23, 0.15, 0.08)
    return _box2(x, y, 0.22, 0.16, 0.07)


def eyewear_sdf(style: str, part: str = "frame"):
    (cL, cR), er = eye_centres(DEFAULT)
    z0 = cL[2] + er + 0.1
    bend = 0.25

    def fn(p):
        x, y, z = p[:, 0], p[:, 1], p[:, 2]
        zc = z0 - bend * x * x
        dz = np.abs(z - zc) - (0.018 if part == "frame" else 0.006)
        if style == "sport":
            shape = _box2(x, y - cL[1] - 0.02, 0.7, 0.19, 0.12)
            if part == "lens":
                return np.maximum(shape, dz)
            ring = np.abs(shape) - 0.02
            d = np.maximum(ring, np.abs(z - zc) - 0.02)
            d = np.maximum(d, -(y - cL[1] - 0.0))  # frame only on top
        else:
            side = np.sign(x)
            lx = np.abs(x) - (cL[0] + 0.02)
            shape = _lens2d(style, lx, y - cL[1] - 0.01, 1.0)
            if part == "lens":
                return np.maximum(shape, dz)
            w = 0.006 if style == "rimless" else (0.028 if style == "oversized" else 0.02)
            d = np.maximum(np.abs(shape) - w, np.abs(z - zc) - 0.02)
            if style == "rimless":
                d = np.maximum(d, -(y - cL[1] - 0.1))
            bridge = S.capsule(p, (-0.13, cL[1] + 0.06, z0 + 0.01), (0.13, cL[1] + 0.06, z0 + 0.01), 0.018)
            d = S.smin(d, bridge, 0.01)
            del side
        for s in (-1, 1):
            hx = cL[0] + (0.27 if style != "sport" else 0.4)
            temple = S.curve_tube(p, [(s * hx, cL[1] + 0.07, z0 - bend * hx * hx - 0.02), (s * 1.0, cL[1] + 0.08, 0.2), (s * 1.02, cL[1] + 0.02, -0.15)], [0.018, 0.016, 0.014], samples=16)
            d = S.smin(d, temple, 0.01)
        return d

    return fn


EYEWEAR = ("round", "square", "aviator", "cat-eye", "oversized", "rimless", "sport")
EYEWEAR_BOUNDS = ((-1.15, 1.15), (-0.35, 0.45), (-0.3, 1.25))


# ── Earrings & piercings ─────────────────────────────────────────────────────


def earring_sdf(style: str):
    es = 1.05 + 0.4 * DEFAULT.ears
    lobe = np.array([0.97 + 0.04, -0.04 - 0.21 * es, -0.03], np.float32)

    def fn(p):
        pm = mirrored(p)
        if style == "studs":
            return S.sphere(pm, lobe + [0.02, 0, 0], 0.03)
        if style == "pearls":
            return S.sphere(pm, lobe + [0.02, -0.02, 0], 0.045)
        if style in ("hoops", "small-hoops"):
            R = 0.13 if style == "hoops" else 0.065
            c = lobe + np.array([0.03, -R + 0.02, 0], np.float32)
            return S.torus(pm, c, R, 0.013, axis="x")
        if style == "drops":
            d = S.sphere(pm, lobe + [0.02, 0, 0], 0.025)
            d = S.smin(d, S.capsule(pm, lobe + [0.02, 0, 0], lobe + [0.02, -0.09, 0], 0.008), 0.01)
            return S.smin(d, S.ellipsoid(pm, lobe + [0.02, -0.14, 0], (0.04, 0.06, 0.04)), 0.02)
        if style == "cuff":
            c = lobe + np.array([0.02, 0.33 * es, -0.04], np.float32)
            return S.torus(pm, c, 0.04, 0.011, axis="x")
        raise ValueError(style)

    return fn


EARRINGS = ("studs", "hoops", "small-hoops", "drops", "pearls", "cuff")
EARRING_BOUNDS = ((-1.3, 1.3), (-0.65, 0.45), (-0.4, 0.3))

PIERCINGS = ("stud", "ring", "septum")
PIERCING_BOUNDS = ((-0.3, 0.3), (-0.5, -0.05), (0.7, 1.25))


def piercing_sdf(style: str):
    def fn(p):
        if style == "stud":
            return S.sphere(p, (0.13, -0.27, 1.02), 0.02)
        if style == "ring":
            return S.torus(p, (0.14, -0.31, 1.0), 0.04, 0.009, axis="x")
        return S.torus(p, (0.0, -0.35, 1.02), 0.045, 0.009, axis="z")

    return fn
