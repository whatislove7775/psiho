"""ARKit blendshapes as deformation fields.

Each field maps neutral points (N, 3) to displacements (N, 3) at weight 1.
The same fields are applied to the head and to everything attached to the
face (brows, lashes, beards), so they deform together. Convention: "Left"
is the avatar's own left = +x (the runtime mirrors the user's camera).
"""
from __future__ import annotations

import numpy as np

from head import DEFAULT, EYE, HeadShape, eye_centres

ARKIT = [
    "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
    "cheekPuff", "cheekSquintLeft", "cheekSquintRight",
    "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight",
    "eyeLookOutLeft", "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight",
    "eyeWideLeft", "eyeWideRight",
    "jawForward", "jawLeft", "jawOpen", "jawRight",
    "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight", "mouthFunnel",
    "mouthLeft", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker",
    "mouthRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft",
    "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight",
    "noseSneerLeft", "noseSneerRight", "tongueOut",
]


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def gauss(p, c, r):
    q = (p - np.asarray(c, np.float32)) / np.asarray(r, np.float32)
    return np.exp(-np.sum(q * q, axis=1))


def rot_x(q, ang):
    """Rotate points q (N,3) about the x axis by per-point angle ang (N,)."""
    c, s = np.cos(ang), np.sin(ang)
    y = q[:, 1] * c - q[:, 2] * s
    z = q[:, 1] * s + q[:, 2] * c
    return np.stack([q[:, 0], y, z], axis=1)


class Face:
    """Landmarks of the neutral head used by the fields."""

    def __init__(self, h: HeadShape = DEFAULT):
        (self.eyeL, self.eyeR), self.er = eye_centres(h)  # eyeL at +x
        self.my = -0.5 * h.length
        self.mw = 0.22 + 0.08 * h.mouth_width
        self.mz = 0.9


def _side(p, side):
    """1 for points on the given side (+1 = +x), fading across the midline."""
    return smooth(-0.05, 0.08, p[:, 0] * side)


def eyelids(p, F: Face, side: int, upper_deg: float, lower_deg: float, reach=1.7):
    c = F.eyeL if side > 0 else F.eyeR
    q = p - c
    r = np.linalg.norm(q, axis=1)
    near = smooth(F.er * reach, F.er * 1.02, r) * smooth(-0.3 * F.er, 0.3 * F.er, q[:, 2])
    elev = np.arctan2(q[:, 1], np.maximum(q[:, 2], 1e-3))
    up_w = near * smooth(0.25, 0.5, elev / 1.0 + 0.0)   # above the opening
    lo_w = near * smooth(-0.35, -0.65, elev)             # below the opening
    ang = np.radians(upper_deg) * up_w + np.radians(-lower_deg) * lo_w
    return rot_x(q, ang) - q


def jaw_weight(p, F: Face):
    below = smooth(F.my + 0.012, F.my - 0.012, p[:, 1])
    return below * smooth(-0.5, 0.1, p[:, 2])


def field(name: str, p: np.ndarray, F: Face) -> np.ndarray:
    d = np.zeros_like(p)
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    front = smooth(0.2, 0.6, z)
    lips = gauss(p, (0, F.my, F.mz), (F.mw * 1.25, 0.13, 0.25)) * front
    upper_lip = lips * smooth(F.my - 0.005, F.my + 0.02, y)
    lower_lip = lips * smooth(F.my + 0.005, F.my - 0.02, y)

    def side_of(n):
        return 1 if n.endswith("Left") else -1

    if name.startswith("eyeBlink"):
        s = side_of(name)
        d = eyelids(p, F, s, 82, 12)
    elif name.startswith("eyeSquint"):
        s = side_of(name)
        d = eyelids(p, F, s, 10, 22)
        d[:, 1] += 0.025 * gauss(p, (s * 0.45, -0.25, 0.7), (0.2, 0.12, 0.3))
    elif name.startswith("eyeWide"):
        d = eyelids(p, F, side_of(name), -14, -6)
    elif name.startswith("eyeLookDown"):
        d = eyelids(p, F, side_of(name), 18, -8)
    elif name.startswith("eyeLookUp"):
        d = eyelids(p, F, side_of(name), -9, -5)
    elif name.startswith("eyeLookIn") or name.startswith("eyeLookOut"):
        pass  # eyeball rotation only (runtime)
    elif name.startswith("browDown"):
        s = side_of(name)
        w = gauss(p, (s * 0.33, 0.36, 0.78), (0.3, 0.14, 0.3))
        d[:, 1] = -0.07 * w
        d[:, 0] = -s * 0.03 * w * smooth(0.45, 0.1, np.abs(x))
    elif name == "browInnerUp":
        w = gauss(p, (0, 0.38, 0.8), (0.28, 0.16, 0.3)) * smooth(0.55, 0.05, np.abs(x))
        d[:, 1] = 0.09 * w
    elif name.startswith("browOuterUp"):
        s = side_of(name)
        d[:, 1] = 0.08 * gauss(p, (s * 0.52, 0.36, 0.62), (0.2, 0.14, 0.3))
    elif name == "cheekPuff":
        w = gauss(p, (0.44, -0.4, 0.62), (0.2, 0.18, 0.3)) + gauss(p, (-0.44, -0.4, 0.62), (0.2, 0.18, 0.3))
        d[:, 0] = np.sign(x) * 0.07 * w
        d[:, 2] = 0.05 * w
    elif name.startswith("cheekSquint"):
        s = side_of(name)
        d[:, 1] = 0.035 * gauss(p, (s * 0.46, -0.22, 0.65), (0.18, 0.12, 0.3))
    elif name.startswith("noseSneer"):
        s = side_of(name)
        w = gauss(p, (s * 0.1, -0.2, 0.95), (0.1, 0.1, 0.2))
        d[:, 1] = 0.035 * w
        d[:, 0] = s * 0.01 * w
    elif name == "jawOpen":
        w = jaw_weight(p, F)
        piv = np.array([0, -0.12, -0.55], np.float32)
        q = p - piv
        d = (rot_x(q, 0.3 * w) - q)
        # upper lip lifts a touch so the mouth reads open
        d[:, 1] += 0.01 * upper_lip
    elif name == "jawForward":
        d[:, 2] = 0.07 * jaw_weight(p, F)
    elif name in ("jawLeft", "jawRight"):
        d[:, 0] = (0.07 if name == "jawLeft" else -0.07) * jaw_weight(p, F)
    elif name == "mouthClose":
        d[:, 1] = 0.08 * lower_lip * smooth(F.my - 0.12, F.my - 0.02, y)
    elif name in ("mouthFunnel", "mouthPucker"):
        k = 1.0 if name == "mouthPucker" else 0.7
        d[:, 2] = 0.07 * k * lips
        d[:, 0] = -x * 0.32 * lips
        if name == "mouthFunnel":
            d[:, 1] += 0.025 * upper_lip - 0.03 * lower_lip
    elif name in ("mouthLeft", "mouthRight"):
        d[:, 0] = (0.08 if name == "mouthLeft" else -0.08) * gauss(p, (0, F.my, F.mz), (F.mw * 1.4, 0.18, 0.3)) * front
    elif name.startswith("mouthSmile"):
        s = side_of(name)
        corner = gauss(p, (s * F.mw, F.my, F.mz - 0.04), (0.14, 0.1, 0.25)) * front
        d[:, 1] = 0.11 * corner + 0.045 * gauss(p, (s * 0.44, -0.28, 0.65), (0.2, 0.15, 0.3))
        d[:, 0] = s * 0.055 * corner
        d[:, 2] = -0.04 * corner
    elif name.startswith("mouthFrown"):
        s = side_of(name)
        corner = gauss(p, (s * F.mw, F.my, F.mz - 0.04), (0.13, 0.1, 0.25)) * front
        d[:, 1] = -0.055 * corner
    elif name.startswith("mouthDimple"):
        s = side_of(name)
        corner = gauss(p, (s * F.mw, F.my, F.mz - 0.04), (0.1, 0.08, 0.25)) * front
        d[:, 0] = s * 0.02 * corner
        d[:, 2] = -0.03 * corner
    elif name.startswith("mouthStretch"):
        s = side_of(name)
        corner = gauss(p, (s * F.mw, F.my, F.mz - 0.04), (0.16, 0.12, 0.25)) * front
        d[:, 0] = s * 0.05 * corner
        d[:, 1] = -0.02 * corner
    elif name == "mouthRollLower":
        d[:, 2] = -0.035 * lower_lip
        d[:, 1] = 0.02 * lower_lip
    elif name == "mouthRollUpper":
        d[:, 2] = -0.03 * upper_lip
        d[:, 1] = -0.018 * upper_lip
    elif name == "mouthShrugLower":
        w = lower_lip + 0.6 * gauss(p, (0, F.my - 0.2, 0.75), (0.25, 0.15, 0.3)) * front
        d[:, 1] = 0.03 * w
        d[:, 2] = 0.02 * w
    elif name == "mouthShrugUpper":
        d[:, 1] = 0.025 * upper_lip
    elif name.startswith("mouthPress"):
        s = side_of(name)
        w = _side(p, s)
        d[:, 1] = (-0.012 * upper_lip + 0.012 * lower_lip) * w
        d[:, 2] = -0.01 * lips * w
    elif name.startswith("mouthLowerDown"):
        s = side_of(name)
        d[:, 1] = -0.045 * lower_lip * (0.35 + 0.65 * _side(p, s))
    elif name.startswith("mouthUpperUp"):
        s = side_of(name)
        d[:, 1] = 0.04 * upper_lip * (0.35 + 0.65 * _side(p, s))
    elif name == "tongueOut":
        # only meaningful on the tongue mesh (tagged by the builder)
        d[:, 2] = 0.22 * smooth(0.55, 0.8, z) * (np.abs(x) < 0.2)
        d[:, 1] = -0.03 * smooth(0.55, 0.8, z) * (np.abs(x) < 0.2)
    return d.astype(np.float32)


def all_fields(p: np.ndarray, h: HeadShape = DEFAULT) -> dict[str, np.ndarray]:
    F = Face(h)
    return {n: field(n, p, F) for n in ARKIT}


__all__ = ["ARKIT", "Face", "field", "all_fields", "EYE"]


# ── Identity (face shape) warps ──────────────────────────────────────────────
# Smooth space deformations; applied identically to the head and to every part
# so hair, hats and glasses follow the face shape.

IDENTITY_NAMES = [
    "idHeadWide", "idHeadNarrow", "idFaceLong", "idFaceShort", "idJawWide", "idJawNarrow", "idChinPointed",
    "idChinRound", "idChinSquare", "idCheeksFull", "idCheeksThin", "idNoseBig", "idNoseSmall", "idNoseWide",
    "idNoseNarrow", "idNoseBridge", "idNoseUp", "idNoseDown", "idNoseHook", "idLipUpperFull", "idLipUpperThin",
    "idLipLowerFull", "idLipLowerThin", "idMouthWide", "idMouthNarrow", "idEarsBig", "idEarsSmall", "idEyesBig",
    "idEyesSmall",
]

NOSE_C = np.array([0.0, -0.21, 0.98], np.float32)


def _scale_about(p, c, s, w):
    """Displacement scaling p about c by factor s (vec3) with weight w."""
    c = np.asarray(c, np.float32)
    s = np.asarray(s, np.float32)
    return (p - c) * (s - 1.0) * w[:, None]


def identity_field(name: str, p: np.ndarray, F: Face) -> np.ndarray:
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    d = np.zeros_like(p)
    front = smooth(0.1, 0.5, z)
    lower = smooth(-0.1, -0.5, y)  # below the eyes
    chin_w = gauss(p, (0, -0.86, 0.45), (0.3, 0.2, 0.4))
    nose_w = gauss(p, NOSE_C, (0.16, 0.2, 0.2)) * front
    lips_w = gauss(p, (0, F.my, F.mz), (F.mw * 1.3, 0.12, 0.2)) * front
    if name == "idHeadWide":
        d[:, 0] = x * 0.12
    elif name == "idHeadNarrow":
        d[:, 0] = -x * 0.1
    elif name == "idFaceLong":
        d[:, 1] = (y - 0.0) * 0.14 * lower
    elif name == "idFaceShort":
        d[:, 1] = -(y - 0.0) * 0.1 * lower
    elif name == "idJawWide":
        d[:, 0] = x * 0.14 * lower * smooth(-0.3, 0.2, z)
    elif name == "idJawNarrow":
        d[:, 0] = -x * 0.14 * smooth(-0.25, -0.8, y) * smooth(-0.3, 0.2, z)
    elif name == "idChinPointed":
        d[:, 0] = -x * 0.35 * chin_w
        d[:, 1] = -0.06 * chin_w
        d[:, 2] = 0.03 * chin_w
    elif name == "idChinRound":
        d[:, 0] = x * 0.15 * chin_w
        d[:, 1] = 0.02 * chin_w
    elif name == "idChinSquare":
        sq = gauss(p, (0, -0.82, 0.4), (0.45, 0.2, 0.4))
        d[:, 0] = x * 0.22 * sq
        d[:, 1] = -0.03 * sq
    elif name == "idCheeksFull":
        w = gauss(p, (0.48, -0.32, 0.5), (0.25, 0.22, 0.4)) + gauss(p, (-0.48, -0.32, 0.5), (0.25, 0.22, 0.4))
        d[:, 0] = np.sign(x) * 0.06 * w
        d[:, 2] = 0.03 * w
    elif name == "idCheeksThin":
        w = gauss(p, (0.48, -0.32, 0.5), (0.25, 0.22, 0.4)) + gauss(p, (-0.48, -0.32, 0.5), (0.25, 0.22, 0.4))
        d[:, 0] = -np.sign(x) * 0.05 * w
    elif name == "idNoseBig":
        d = _scale_about(p, NOSE_C - [0, 0, 0.12], (1.3, 1.25, 1.3), nose_w)
    elif name == "idNoseSmall":
        d = _scale_about(p, NOSE_C - [0, 0, 0.12], (0.8, 0.85, 0.8), nose_w)
    elif name == "idNoseWide":
        d[:, 0] = x * 0.35 * nose_w
    elif name == "idNoseNarrow":
        d[:, 0] = -x * 0.3 * nose_w
    elif name == "idNoseBridge":
        w = gauss(p, (0, -0.02, 0.92), (0.07, 0.14, 0.2)) * front
        d[:, 2] = 0.05 * w
    elif name == "idNoseUp":
        w = gauss(p, NOSE_C, (0.12, 0.08, 0.12)) * front
        d[:, 1] = 0.035 * w
        d[:, 2] = -0.01 * w
    elif name == "idNoseDown":
        w = gauss(p, NOSE_C, (0.12, 0.08, 0.12)) * front
        d[:, 1] = -0.04 * w
        d[:, 2] = 0.015 * w
    elif name == "idNoseHook":
        w = gauss(p, (0, -0.08, 0.95), (0.06, 0.08, 0.15)) * front
        d[:, 2] = 0.045 * w
        wt = gauss(p, NOSE_C, (0.1, 0.07, 0.12)) * front
        d[:, 1] -= 0.035 * wt
    elif name == "idLipUpperFull":
        w = lips_w * smooth(F.my - 0.005, F.my + 0.03, y)
        d[:, 1] = 0.03 * w
        d[:, 2] = 0.02 * w
    elif name == "idLipUpperThin":
        w = lips_w * smooth(F.my - 0.005, F.my + 0.03, y)
        d[:, 1] = -0.02 * w
        d[:, 2] = -0.015 * w
    elif name == "idLipLowerFull":
        w = lips_w * smooth(F.my + 0.005, F.my - 0.03, y)
        d[:, 1] = -0.035 * w
        d[:, 2] = 0.025 * w
    elif name == "idLipLowerThin":
        w = lips_w * smooth(F.my + 0.005, F.my - 0.03, y)
        d[:, 1] = 0.02 * w
        d[:, 2] = -0.015 * w
    elif name == "idMouthWide":
        d[:, 0] = x * 0.22 * lips_w
    elif name == "idMouthNarrow":
        d[:, 0] = -x * 0.2 * lips_w
    elif name in ("idEarsBig", "idEarsSmall"):
        k = 1.3 if name == "idEarsBig" else 0.78
        for s in (-1, 1):
            c = np.array([s * 0.97, -0.04, -0.06], np.float32)
            w = gauss(p, c, (0.2, 0.34, 0.26)) * smooth(0.6, 0.85, x * s)
            d += _scale_about(p, c - [s * 0.08, 0, 0], (k, k, k), w)
    elif name in ("idEyesBig", "idEyesSmall"):
        k = 1.12 if name == "idEyesBig" else 0.9
        for c in (F.eyeL, F.eyeR):
            w = gauss(p, c, (F.er * 1.9, F.er * 1.7, F.er * 2.0))
            d += _scale_about(p, c, (k, k, k), w)
    return d.astype(np.float32)
