"""Sculpted hairstyles as SDFs: a hair cap over the cranium plus chunky locks.

Locks are tubes laid over the skull; smooth-unioned with a small blend they
fuse into one mass with soft valleys between strands — the Memoji look.
Run via build.py (hair <style|all>) or: python hair.py <style> <out.ply> [step]
"""
from __future__ import annotations

import math

import numpy as np

import sdf as S

CRANIUM_C = np.array([0.0, 0.12, -0.08], np.float32)
CRANIUM_R = np.array([1.0, 0.96, 1.0], np.float32)
PI = math.pi


def sdir(theta: float, phi: float) -> np.ndarray:
    """Unit direction: theta from +y (0 = crown), phi around y (0 = front/+z)."""
    return np.array([math.sin(theta) * math.sin(phi), math.cos(theta), math.sin(theta) * math.cos(phi)], np.float32)


def scalp(theta: float, phi: float, lift: float = 0.0) -> np.ndarray:
    d = sdir(theta, phi)
    t = 1.0 / np.linalg.norm(d / CRANIUM_R)
    return CRANIUM_C + d * (t + lift)


def P(*xyz):
    return ("xyz", *xyz)


def path(keys):
    return [np.array(k[1:], np.float32) if k[0] == "xyz" else scalp(*k) for k in keys]


def cranium_offset(p, t):
    return S.ellipsoid(p, CRANIUM_C, CRANIUM_R + t)


def face_hole(p, hairline=0.45, temple=0.82):
    cy = (hairline - 1.2) / 2
    ry = (hairline + 1.2) / 2
    return S.ellipsoid(p, (0, cy, 0.9), (temple, ry, 0.95))


def ear_hole(p):
    pm = np.concatenate([np.abs(p[:, :1]), p[:, 1:]], axis=1)
    return S.ellipsoid(pm, (1.0, -0.05, -0.06), (0.3, 0.32, 0.26))


def cap(p, thick=0.1, hairline=0.45, nape=-0.45, sideburn=-0.1, ears=True, temple=0.82, side_thin=0.0):
    d = cranium_offset(p, thick)
    if side_thin:
        # thinner at the sides (fades/undercuts)
        side = np.clip((np.abs(p[:, 0]) - 0.55) / 0.35, 0, 1) * np.clip((0.45 - p[:, 1]) / 0.4, 0, 1)
        d = d + side * thick * side_thin
    d = S.ssub(d, face_hole(p, hairline, temple), 0.06)
    lower = nape + (sideburn - nape) * np.clip((p[:, 2] + 0.3) / 0.6, 0, 1)
    d = S.smax(d, -(p[:, 1] - lower), 0.05)
    if ears:
        d = S.ssub(d, ear_hole(p), 0.05)
    return d


def locks_sdf(p, locks, k=0.035):
    d = np.full(len(p), 1e9, np.float32)
    for keys, radii in locks:
        d = S.smin(d, S.curve_tube(p, path(keys), radii, samples=max(10, len(keys) * 6)), k)
    return d


# ── Lock generators ──────────────────────────────────────────────────────────


def swept(n, part_phi, to_phi_a, to_phi_b, th_end=1.35, lift=0.1, r=0.12, th_start=0.25, rng=None):
    """Locks from a part line (near the crown) sweeping down to the hairline."""
    out = []
    for i in range(n):
        f = i / max(1, n - 1)
        end_phi = to_phi_a + (to_phi_b - to_phi_a) * f
        start_phi = part_phi + (end_phi - part_phi) * 0.15
        j = rng.uniform(-0.05, 0.05) if rng is not None else 0
        mid_phi = (start_phi + end_phi) / 2
        out.append((
            [(th_start + j, start_phi, lift * 0.5), ((th_start + th_end) / 2, mid_phi, lift * 1.2), (th_end, end_phi, lift * 0.6), (th_end + 0.18, end_phi, 0.02)],
            [r * 0.8, r * 1.1, r * 0.9, r * 0.4],
        ))
    return out


def hanging(n, phi_a, phi_b, bottom, flare=0.12, r=0.16, curl_in=0.0, wave=0.0, top_theta=0.35, rng=None, jag=0.0):
    """Long locks from the crown over the skull, then hanging to `bottom` (y)."""
    out = []
    for i in range(n):
        f = (i + 0.5) / n
        phi = phi_a + (phi_b - phi_a) * f
        out_dir = sdir(PI / 2, phi)
        base = scalp(1.55, phi, 0.13)
        b = bottom + (rng.uniform(-jag, jag) if rng is not None and jag else 0)
        keys = [(top_theta, phi, 0.07), (0.95, phi, 0.15), P(*base)]
        steps = 3
        for k in range(1, steps + 1):
            t = k / steps
            y = base[1] + (b - base[1]) * t
            o = flare * t + (wave * math.sin(t * PI * 2 + i) if wave else 0)
            pt = base + out_dir * o
            pt = np.array([pt[0], y, pt[2]], np.float32)
            if curl_in and k == steps:
                pt = pt - out_dir * curl_in
            keys.append(P(*pt))
        radii = [r * 0.6, r * 0.95, r, r * 0.95, r * 0.85, r * 0.45]
        out.append((keys, radii))
    return out


def curls_on_scalp(p, n, r, lift, rng, theta_max=1.65, skip_face=True, jitter=0.03):
    d = np.full(len(p), 1e9, np.float32)
    for _ in range(n):
        th = math.acos(1 - rng.uniform(0, 1) * (1 - math.cos(theta_max)))
        ph = rng.uniform(-PI, PI)
        c = scalp(th, ph, lift + rng.uniform(-jitter, jitter))
        if skip_face and c[2] > 0.35 and c[1] < 0.5:
            continue
        d = S.smin(d, S.sphere(p, c, r * rng.uniform(0.8, 1.2)), 0.02)
    return d


def bun(p, c, r):
    d = S.sphere(p, c, r)
    # wrap grooves
    q = p - np.asarray(c, np.float32)
    ang = np.arctan2(q[:, 2], q[:, 0]) + q[:, 1] * 9
    return d + 0.012 * np.abs(np.sin(ang * 2))


def braid(p, pts, r):
    """Braid: tube with periodic bulges along its length."""
    pts = np.asarray(pts, np.float32)
    n = 22
    seg = []
    for i in range(n):
        t = i / (n - 1) * (len(pts) - 1)
        k = min(int(t), len(pts) - 2)
        f = t - k
        seg.append(pts[k] * (1 - f) + pts[k + 1] * f)
    d = np.full(len(p), 1e9, np.float32)
    for i, c in enumerate(seg):
        rr = r * (1.0 - 0.45 * (i / n) ** 2)
        off = np.array([0.025 * (1 if i % 2 else -1), 0, 0], np.float32)
        d = S.smin(d, S.ellipsoid(p, c + off, (rr, rr * 1.2, rr)), 0.03)
    return d


# ── Styles ────────────────────────────────────────────────────────────────────


def st_buzz(p):
    return cap(p, thick=0.03, hairline=0.52, nape=-0.4)


def st_crew(p):
    rng = np.random.default_rng(1)
    d = cap(p, thick=0.05, hairline=0.52, side_thin=0.5)
    locks = swept(12, 0.0, -1.0, 1.0, th_end=0.85, lift=0.08, r=0.09, th_start=0.15, rng=rng)
    return S.smin(d, locks_sdf(p, locks), 0.05)


def st_side_part(p):
    rng = np.random.default_rng(2)
    d = cap(p, thick=0.07, hairline=0.5, side_thin=0.35)
    locks = swept(10, 0.55, -0.4, -2.5, lift=0.14, r=0.12, rng=rng) + swept(5, 0.7, 1.1, 2.2, lift=0.08, r=0.1, rng=rng)
    locks.append(([(0.25, 0.5, 0.1), (0.62, 0.05, 0.2), (0.85, -0.55, 0.14), (1.0, -1.0, 0.05)], [0.1, 0.15, 0.12, 0.06]))
    return S.smin(d, locks_sdf(p, locks), 0.05)


def st_quiff(p):
    rng = np.random.default_rng(3)
    d = cap(p, thick=0.05, hairline=0.52, side_thin=0.6)
    locks = []
    for i in range(7):
        ph = -0.45 + 0.9 * i / 6
        locks.append(([(1.05, ph, 0.02), (0.72, ph, 0.25), (0.5, ph * 0.7, 0.3), (0.3, ph * 0.5, 0.18)], [0.08, 0.13, 0.12, 0.07]))
    locks += swept(8, 0.0, -2.2, 2.2, th_end=1.1, lift=0.06, r=0.08, th_start=0.5, rng=rng)
    return S.smin(d, locks_sdf(p, locks), 0.05)


def st_pompadour(p):
    rng = np.random.default_rng(4)
    d = cap(p, thick=0.07, hairline=0.52, side_thin=0.45)
    locks = []
    for i in range(8):
        ph = -0.5 + i / 7
        locks.append(([(1.0, ph, 0.02), (0.72, ph, 0.33), (0.35, ph * 0.8, 0.35), (0.25, ph * 0.6 + PI, 0.1)], [0.1, 0.16, 0.14, 0.08]))
    locks += swept(10, 0.0, -2.3, 2.3, th_end=1.25, lift=0.07, r=0.09, th_start=0.6, rng=rng)
    return S.smin(d, locks_sdf(p, locks), 0.05)


def st_slick_back(p):
    d = cap(p, thick=0.06, hairline=0.55)
    locks = []
    for i in range(11):
        ph = -1.3 + 2.6 * i / 10
        locks.append(([(0.95, ph * 0.6, 0.04), (0.5, ph * 0.6 + PI * 0.05, 0.1), (0.4, PI + ph * 0.3, 0.08), (1.3, PI + ph * 0.4, 0.04)], [0.08, 0.11, 0.1, 0.06]))
    return S.smin(d, locks_sdf(p, locks), 0.04)


def st_undercut(p):
    rng = np.random.default_rng(5)
    d = cap(p, thick=0.07, hairline=0.52, side_thin=0.9)
    locks = swept(9, 0.5, -0.2, -1.8, th_end=0.95, lift=0.2, r=0.13, th_start=0.2, rng=rng)
    return S.smin(d, locks_sdf(p, locks), 0.05)


def st_messy(p):
    rng = np.random.default_rng(6)
    d = cap(p, thick=0.08, hairline=0.5)
    locks = []
    for _ in range(18):
        th = rng.uniform(0.1, 1.2)
        ph = rng.uniform(-PI, PI)
        a = scalp(th, ph, 0.08)
        b = scalp(min(1.5, th + rng.uniform(0.2, 0.5)), ph + rng.uniform(-0.6, 0.6), 0.2 + rng.uniform(0, 0.12))
        locks.append(([P(*a), P(*b)], [0.1, 0.04]))
    return S.smin(d, locks_sdf(p, locks, k=0.05), 0.05)


def st_mohawk(p):
    d = cap(p, thick=0.018, hairline=0.52)
    locks = []
    for i in range(7):
        th = -0.9 + 1.9 * i / 6
        base = scalp(abs(th), 0 if th < 0 else PI, 0.02)
        tip = base + sdir(abs(th), 0 if th < 0 else PI) * 0.38 + np.array([0, 0, -0.1], np.float32)
        locks.append(([P(*base), P(*tip)], [0.13, 0.03]))
    return S.smin(d, locks_sdf(p, locks, k=0.06), 0.04)


def st_curly_short(p):
    rng = np.random.default_rng(7)
    d = cap(p, thick=0.12, hairline=0.5)
    return S.smin(d, curls_on_scalp(p, 150, 0.11, 0.14, rng), 0.03)


def st_fade_curls(p):
    rng = np.random.default_rng(8)
    d = cap(p, thick=0.03, hairline=0.52)
    return S.smin(d, curls_on_scalp(p, 90, 0.11, 0.12, rng, theta_max=1.05), 0.03)


def st_afro(p):
    rng = np.random.default_rng(9)
    big = S.ellipsoid(p, (0, 0.35, -0.12), (1.42, 1.25, 1.35))
    big = S.ssub(big, face_hole(p, 0.5, 0.8), 0.1)
    big = S.smax(big, -(p[:, 1] + 0.35), 0.1)
    bumps = np.full(len(p), 1e9, np.float32)
    for _ in range(140):
        d = sdir(rng.uniform(0, 1.9), rng.uniform(-PI, PI))
        c = np.array([0, 0.35, -0.12], np.float32) + d * np.array([1.4, 1.22, 1.32], np.float32)
        if c[2] > 0.6 and c[1] < 0.55:
            continue
        bumps = S.smin(bumps, S.sphere(p, c, 0.16), 0.03)
    bumps = S.smax(bumps, -(p[:, 1] + 0.3), 0.08)
    return S.smin(big, bumps, 0.08)


def st_pixie(p):
    rng = np.random.default_rng(10)
    d = cap(p, thick=0.07, hairline=0.5, nape=-0.4)
    locks = swept(9, -0.4, 0.3, 2.4, th_end=1.3, lift=0.12, r=0.11, rng=rng) + swept(5, -0.4, -1.4, -2.4, lift=0.08, r=0.1, rng=rng)
    locks.append(([(0.25, -0.35, 0.1), (0.62, 0.1, 0.18), (0.95, 0.55, 0.12), (1.15, 0.85, 0.05)], [0.1, 0.15, 0.12, 0.06]))
    return S.smin(d, locks_sdf(p, locks), 0.05)


def _long_base(p, hairline=0.48, bottom=-0.6):
    return cap(p, thick=0.1, hairline=hairline, nape=bottom, sideburn=-0.2, ears=False)


def st_bob(p):
    rng = np.random.default_rng(11)
    d = _long_base(p)
    locks = hanging(11, PI * 0.38, PI * 1.62, -0.92, flare=0.1, r=0.16, curl_in=0.1, rng=rng)
    for s in (-1, 1):
        locks += hanging(1, s * 1.42, s * 1.48, -0.95, flare=0.08, r=0.15, curl_in=0.09, rng=rng)
    locks.append(([(0.2, 0.6, 0.06), (0.62, 0.3, 0.14), (0.9, -0.25, 0.14), (1.15, -0.85, 0.12)], [0.1, 0.15, 0.14, 0.09]))
    return S.smin(d, locks_sdf(p, locks), 0.05)


def st_lob(p):
    rng = np.random.default_rng(12)
    d = _long_base(p)
    locks = hanging(12, PI * 0.36, PI * 1.64, -1.35, flare=0.16, r=0.16, curl_in=0.05, rng=rng)
    for s in (-1, 1):
        locks += hanging(1, s * 1.4, s * 1.46, -1.3, flare=0.12, r=0.15, rng=rng)
    return S.smin(d, locks_sdf(p, locks), 0.05)


def st_shag(p):
    rng = np.random.default_rng(13)
    d = _long_base(p)
    locks = hanging(14, PI * 0.36, PI * 1.64, -1.25, flare=0.22, r=0.14, wave=0.05, rng=rng, jag=0.2)
    for s in (-1, 1):
        locks.append(([(0.3, s * 0.15, 0.1), (0.7, s * 0.35, 0.15), (1.0, s * 0.6, 0.12), (1.25, s * 0.85, 0.06)], [0.09, 0.13, 0.11, 0.05]))
    return S.smin(d, locks_sdf(p, locks), 0.05)


def st_bangs_long(p):
    rng = np.random.default_rng(14)
    d = _long_base(p, hairline=0.5)
    locks = hanging(12, PI * 0.36, PI * 1.64, -2.1, flare=0.14, r=0.16, rng=rng)
    for s in (-1, 1):
        locks += hanging(1, s * 1.42, s * 1.48, -2.0, flare=0.1, r=0.15, rng=rng)
    for i in range(7):
        ph = -0.6 + 1.2 * i / 6
        locks.append(([(0.3, ph * 0.4, 0.1), (0.75, ph, 0.16), (1.02, ph, 0.13)], [0.09, 0.12, 0.09]))
    return S.smin(d, locks_sdf(p, locks), 0.05)


def st_long_straight(p):
    rng = np.random.default_rng(15)
    d = _long_base(p)
    locks = hanging(12, PI * 0.36, PI * 1.64, -2.2, flare=0.14, r=0.16, rng=rng)
    for s in (-1, 1):
        locks += hanging(2, s * 1.2, s * 1.5, -2.1, flare=0.1, r=0.15, rng=rng, top_theta=0.12)
    return S.smin(d, locks_sdf(p, locks), 0.05)


def st_long_wavy(p):
    rng = np.random.default_rng(16)
    d = _long_base(p)
    locks = hanging(12, PI * 0.36, PI * 1.64, -2.1, flare=0.22, r=0.16, wave=0.09, rng=rng)
    for s in (-1, 1):
        locks += hanging(2, s * 1.2, s * 1.5, -2.0, flare=0.16, r=0.15, wave=0.09, rng=rng)
    locks.append(([(0.2, 0.55, 0.06), (0.6, 0.35, 0.14), (0.95, -0.2, 0.13), (1.2, -0.8, 0.08)], [0.1, 0.15, 0.13, 0.07]))
    return S.smin(d, locks_sdf(p, locks), 0.05)


def st_long_curly(p):
    rng = np.random.default_rng(17)
    d = _long_base(p)
    locks = hanging(14, PI * 0.3, PI * 1.7, -1.8, flare=0.3, r=0.17, wave=0.12, rng=rng, jag=0.15)
    d = S.smin(d, locks_sdf(p, locks), 0.05)
    return S.smin(d, curls_on_scalp(p, 70, 0.12, 0.16, rng, theta_max=1.3), 0.03)


def st_side_swept(p):
    rng = np.random.default_rng(18)
    d = _long_base(p)
    locks = hanging(12, PI * 0.36, PI * 1.64, -1.85, flare=0.14, r=0.16, rng=rng)
    for s in (-1, 1):
        locks += hanging(1, s * 1.42, s * 1.48, -1.8, flare=0.1, r=0.15, rng=rng)
    locks.append(([(0.2, 0.7, 0.06), (0.55, 0.5, 0.14), (0.9, -0.05, 0.16), (1.2, -0.75, 0.13), (1.5, -1.1, 0.08)], [0.1, 0.16, 0.16, 0.12, 0.07]))
    return S.smin(d, locks_sdf(p, locks), 0.05)


def _tied_base(p, hairline=0.5):
    d = cap(p, thick=0.06, hairline=hairline, nape=-0.45)
    locks = []
    for i in range(12):
        ph = -2.6 + 5.2 * i / 11
        locks.append(([(1.2, ph, 0.03), (0.75, ph * 0.9, 0.08), (0.55, PI - ph * 0.12, 0.05)], [0.07, 0.09, 0.05]))
    return S.smin(d, locks_sdf(p, locks, k=0.03), 0.04)


def st_ponytail(p):
    d = _tied_base(p)
    tail = S.curve_tube(p, [scalp(1.9, PI, 0.0), (0, 0.2, -1.28), (0, -0.4, -1.32), (0.03, -1.25, -1.15)], [0.12, 0.2, 0.18, 0.05], samples=40)
    return S.smin(d, tail, 0.06)


def st_high_ponytail(p):
    d = _tied_base(p, hairline=0.52)
    tail = S.curve_tube(p, [scalp(0.7, PI, 0.0), (0, 1.2, -0.95), (0, 0.6, -1.35), (0, -0.3, -1.3), (0.03, -0.95, -1.15)], [0.12, 0.2, 0.19, 0.15, 0.05], samples=40)
    return S.smin(d, tail, 0.06)


def st_bun(p):
    return S.smin(_tied_base(p), bun(p, (0, 1.2, -0.3), 0.33), 0.08)


def st_double_buns(p):
    d = _tied_base(p)
    d = S.smin(d, bun(p, (0.58, 1.0, -0.15), 0.27), 0.08)
    return S.smin(d, bun(p, (-0.58, 1.0, -0.15), 0.27), 0.08)


def st_man_bun(p):
    return S.smin(_tied_base(p, 0.54), bun(p, (0, 0.95, -0.82), 0.24), 0.07)


def st_braids(p):
    d = _tied_base(p)
    for s in (-1, 1):
        d = S.smin(d, braid(p, [(s * 0.86, 0.0, -0.4), (s * 1.02, -0.6, -0.2), (s * 0.95, -1.3, 0.15), (s * 0.85, -1.9, 0.3)], 0.1), 0.06)
    return d


def st_box_braids(p):
    rng = np.random.default_rng(19)
    d = cap(p, thick=0.05, hairline=0.52, ears=False)
    locks = []
    for i in range(34):
        ph = 1.0 + (2 * PI - 2.0) * (i + rng.uniform(0, 0.5)) / 34  # sides + back, face stays clear
        th = 1.1 + 0.3 * rng.uniform(0, 1)
        base = scalp(th, ph, 0.05)
        out = sdir(PI / 2, ph)
        end = base + out * 0.25 + np.array([0, -1.8 - rng.uniform(0, 0.3), 0], np.float32)
        locks.append(([(0.3, ph, 0.05), P(*base), P(*(base + out * 0.12 + np.array([0, -0.5, 0], np.float32))), P(*end)], [0.05, 0.05, 0.045, 0.035]))
    return S.smin(d, locks_sdf(p, locks, k=0.015), 0.03)


def st_dreads(p):
    rng = np.random.default_rng(20)
    d = cap(p, thick=0.06, hairline=0.5, ears=False)
    locks = []
    for i in range(24):
        ph = 1.0 + (2 * PI - 2.0) * (i + rng.uniform(0, 0.5)) / 24
        base = scalp(1.1 + 0.3 * rng.uniform(0, 1), ph, 0.06)
        out = sdir(PI / 2, ph)
        end = base + out * 0.3 + np.array([0, -1.45 - rng.uniform(0, 0.3), 0], np.float32)
        locks.append(([(0.3, ph, 0.06), P(*base), P(*(base + out * 0.15 + np.array([0, -0.6, 0], np.float32))), P(*end)], [0.07, 0.075, 0.07, 0.05]))
    return S.smin(d, locks_sdf(p, locks, k=0.02), 0.03)


def st_cornrows(p):
    d = cap(p, thick=0.025, hairline=0.52)
    rows = []
    for i in range(9):
        ph = -0.55 + 1.1 * i / 8
        rows.append(([(1.05, ph, 0.03), (0.6, ph, 0.05), (0.3, ph + PI * 0.02, 0.05), (0.7, PI - ph, 0.04), (1.35, PI - ph, 0.02)], [0.04, 0.045, 0.045, 0.045, 0.035]))
    return S.smin(d, locks_sdf(p, rows, k=0.01), 0.02)


def st_mullet(p):
    rng = np.random.default_rng(21)
    d = cap(p, thick=0.08, hairline=0.5, nape=-0.6)
    locks = swept(9, 0.0, -1.3, 1.3, th_end=1.0, lift=0.12, r=0.1, th_start=0.2, rng=rng)
    locks += hanging(7, PI * 0.7, PI * 1.3, -1.45, flare=0.1, r=0.15, rng=rng, jag=0.1)
    return S.smin(d, locks_sdf(p, locks), 0.05)


# style -> (sdf, lowest y for the grid)
STYLES = {
    "buzz": (st_buzz, -0.6), "crew": (st_crew, -0.6), "side-part": (st_side_part, -0.7), "quiff": (st_quiff, -0.6),
    "pompadour": (st_pompadour, -0.6), "slick-back": (st_slick_back, -0.7), "undercut": (st_undercut, -0.6),
    "messy": (st_messy, -0.7), "mohawk": (st_mohawk, -0.6), "curly-short": (st_curly_short, -0.7),
    "fade-curls": (st_fade_curls, -0.6), "afro": (st_afro, -0.7), "pixie": (st_pixie, -0.7),
    "bob": (st_bob, -1.2), "lob": (st_lob, -1.6), "shag": (st_shag, -1.6), "bangs-long": (st_bangs_long, -2.4),
    "long-straight": (st_long_straight, -2.5), "long-wavy": (st_long_wavy, -2.4), "long-curly": (st_long_curly, -2.2),
    "side-swept": (st_side_swept, -2.1), "ponytail": (st_ponytail, -1.5), "high-ponytail": (st_high_ponytail, -1.2),
    "bun": (st_bun, -0.7), "double-buns": (st_double_buns, -0.7), "man-bun": (st_man_bun, -0.7),
    "braids": (st_braids, -2.2), "box-braids": (st_box_braids, -2.3), "dreads": (st_dreads, -2.0),
    "cornrows": (st_cornrows, -0.6), "mullet": (st_mullet, -1.7),
}


if __name__ == "__main__":
    import sys
    import time

    import trimesh

    from head import mesh_from_sdf

    style = sys.argv[1]
    fn, ymin = STYLES[style]
    t = time.time()
    v, f = mesh_from_sdf(fn, ((-1.5, 1.5), (ymin, 1.55), (-1.5, 1.5)), float(sys.argv[3]) if len(sys.argv) > 3 else 0.018)
    m = trimesh.Trimesh(v, f, process=True)
    m.export(sys.argv[2])
    print(f"{style}: {len(m.vertices)} verts in {time.time() - t:.1f}s")
