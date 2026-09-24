"""Avatar kit builder (Blender, headless).

  python build.py head             -> public/avatar-kit/head.glb + head.json
  python build.py hair <style>     -> public/avatar-kit/hair/<style>.glb

Pipeline for every part: SDF -> marching cubes -> Blender decimate -> morph
targets (identity from SDF re-projection, ARKit from deformation fields)
-> vertex masks + baked ambient occlusion -> glTF (y-up) export.
"""
from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict, replace

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sdf as S  # noqa: E402
from fields import ARKIT, Face, field  # noqa: E402
from head import DEFAULT, HEAD_BOUNDS, eye_centres, head_sdf, mesh_from_sdf  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, "../../apps/web/public/avatar-kit"))
CACHE = os.path.join(HERE, ".cache")

# Identity morphs: name -> HeadShape with one parameter pushed to an extreme.
IDENTITY = {
    "idHeadWide": replace(DEFAULT, width=1.12),
    "idHeadNarrow": replace(DEFAULT, width=0.9),
    "idFaceLong": replace(DEFAULT, length=1.12),
    "idFaceShort": replace(DEFAULT, length=0.9),
    "idJawWide": replace(DEFAULT, jaw=1.12),
    "idJawNarrow": replace(DEFAULT, jaw=0.88),
    "idChinPointed": replace(DEFAULT, chin=1.0),
    "idChinRound": replace(DEFAULT, chin=-1.0),
    "idChinSquare": replace(DEFAULT, chin_square=1.0),
    "idCheeksFull": replace(DEFAULT, cheeks=1.0),
    "idCheeksThin": replace(DEFAULT, cheeks=0.0),
    "idNoseBig": replace(DEFAULT, nose_size=1.0),
    "idNoseSmall": replace(DEFAULT, nose_size=0.0),
    "idNoseWide": replace(DEFAULT, nose_width=1.0),
    "idNoseNarrow": replace(DEFAULT, nose_width=0.0),
    "idNoseBridge": replace(DEFAULT, nose_bridge=1.0),
    "idNoseUp": replace(DEFAULT, nose_tip_up=1.0),
    "idNoseDown": replace(DEFAULT, nose_tip_up=0.0),
    "idNoseHook": replace(DEFAULT, nose_hook=1.0),
    "idLipUpperFull": replace(DEFAULT, lips_upper=1.0),
    "idLipUpperThin": replace(DEFAULT, lips_upper=0.0),
    "idLipLowerFull": replace(DEFAULT, lips_lower=1.0),
    "idLipLowerThin": replace(DEFAULT, lips_lower=0.0),
    "idMouthWide": replace(DEFAULT, mouth_width=1.0),
    "idMouthNarrow": replace(DEFAULT, mouth_width=0.0),
    "idEarsBig": replace(DEFAULT, ears=1.0),
    "idEarsSmall": replace(DEFAULT, ears=0.0),
    "idEyesBig": replace(DEFAULT, eye_size=1.0),
    "idEyesSmall": replace(DEFAULT, eye_size=0.0),
}


# ── Blender helpers ───────────────────────────────────────────────────────────


def to_blender(v: np.ndarray) -> np.ndarray:
    """Our y-up coords -> Blender z-up (the glTF exporter converts back)."""
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], axis=1)


def from_blender(v: np.ndarray) -> np.ndarray:
    return np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 64


def make_object(name: str, verts: np.ndarray, faces: np.ndarray):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(to_blender(verts).tolist(), [], faces.tolist())
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def select_only(ob):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def decimate(ob, target_faces: int):
    select_only(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    n = len(ob.data.polygons)
    if n > target_faces:
        m = ob.modifiers.new("dec", "DECIMATE")
        m.ratio = target_faces / n
        bpy.ops.object.modifier_apply(modifier=m.name)
    # one pass of gentle smoothing keeps the clay look after decimation
    sm = ob.modifiers.new("smooth", "SMOOTH")
    sm.factor = 0.35
    sm.iterations = 2
    bpy.ops.object.modifier_apply(modifier=sm.name)
    bpy.ops.object.shade_smooth()


def mesh_arrays(ob):
    me = ob.data
    v = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", v)
    n = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("normal", n)
    return from_blender(v.reshape(-1, 3)), from_blender(n.reshape(-1, 3))


def add_shape_keys(ob, base: np.ndarray, deltas: dict[str, np.ndarray], eps=1e-5):
    if ob.data.shape_keys is None:
        ob.shape_key_add(name="Basis")
    for name, d in deltas.items():
        if np.abs(d).max() < eps:
            continue
        k = ob.shape_key_add(name=name, from_mix=False)
        k.data.foreach_set("co", to_blender(base + d).ravel())


def set_point_attr(ob, name: str, values: np.ndarray):
    """values: (N,) float or (N,4) colour -> point-domain attribute."""
    me = ob.data
    if values.ndim == 1:
        a = me.attributes.new(name, "FLOAT", "POINT")
        a.data.foreach_set("value", values.astype(np.float32))
    else:
        a = me.attributes.new(name, "FLOAT_COLOR", "POINT")
        a.data.foreach_set("color", values.astype(np.float32).ravel())


def set_packed(ob, color4: np.ndarray, uv2: np.ndarray):
    """Pack per-vertex data into standard glTF channels that survive gltfpack:
    COLOR_0 (RGBA) and TEXCOORD_0 (vec2)."""
    me = ob.data
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    ca.data.foreach_set("color", color4.astype(np.float32).ravel())
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    uvl = me.uv_layers.new(name="UVMap")
    loop_v = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", loop_v)
    uvl.data.foreach_set("uv", uv2[loop_v].astype(np.float32).ravel())


def bake_ao(ob, occluders=()):
    """Bake ambient occlusion into a point colour attribute; returns (N,) AO."""
    me = ob.data
    ca = me.color_attributes.new("AO", "FLOAT_COLOR", "POINT")
    me.color_attributes.active_color = ca
    mat = bpy.data.materials.new("bake")
    mat.use_nodes = True
    me.materials.append(mat)
    scene = bpy.context.scene
    scene.cycles.samples = 96
    scene.render.bake.target = "VERTEX_COLORS"
    select_only(ob)
    for o in occluders:
        o.hide_render = False
    bpy.ops.object.bake(type="AO")
    c = np.empty(len(me.vertices) * 4, np.float32)
    ca.data.foreach_get("color", c)
    ao = c.reshape(-1, 4)[:, 0]
    me.color_attributes.remove(ca)
    me.materials.clear()
    return ao


def compress(path: str):
    """Meshopt-compress in place with gltfpack (keeps morph target names)."""
    import subprocess

    tmp = path + ".tmp.glb"
    subprocess.run(["npx", "--yes", "gltfpack@0.22.0", "-i", path, "-o", tmp, "-cc", "-kv", "-kn"], check=True, cwd=HERE,
                   stdout=subprocess.DEVNULL)
    os.replace(tmp, path)


def export_glb(obs, path: str):
    for o in bpy.context.scene.objects:
        o.select_set(o in obs)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_morph=True,
        export_morph_normal=True,
        export_attributes=False,
        export_materials="NONE",
        export_texcoords=True,
        export_normals=True,
        export_vertex_color="ACTIVE",
        export_active_vertex_color_when_no_material=True,
    )


# ── Head ──────────────────────────────────────────────────────────────────────


def project_to(fn, v: np.ndarray, n: np.ndarray, iters=8, max_step=0.05) -> np.ndarray:
    out = v.copy()
    for _ in range(iters):
        step = np.clip(fn(out), -max_step, max_step)
        out = out - n * step[:, None]
    return out


def head_masks(v: np.ndarray, F: Face) -> np.ndarray:
    x, y, z = v[:, 0], v[:, 1], v[:, 2]
    # lips: distance to the lip volumes
    lip_up = S.ellipsoid(np.stack([np.abs(x), y, z], 1), (F.mw * 0.42, F.my + 0.038, 0.915), (F.mw * 0.66, 0.08, 0.1))
    lip_lo = S.ellipsoid(v, (0, F.my - 0.05, 0.895), (F.mw * 0.9, 0.1, 0.11))
    lips = np.clip(1 - np.minimum(lip_up, lip_lo) / 0.02, 0, 1) * (z > 0.72)
    blush = np.exp(-(((np.abs(x) - 0.47) / 0.2) ** 2 + ((y + 0.3) / 0.16) ** 2)) * (z > 0.2)
    lid = np.zeros_like(x)
    for c in (F.eyeL, F.eyeR):
        q = v - c
        r = np.linalg.norm(q, axis=1)
        lid = np.maximum(lid, np.clip((F.er * 1.45 - r) / (F.er * 0.35), 0, 1) * (q[:, 1] > F.er * 0.2) * (q[:, 2] > 0))
    bag = S.ellipsoid(v, (0, F.my - 0.02, 0.62), (F.mw * 0.95 + 0.02, 0.17, 0.28))
    channel = (np.abs(y - F.my) < 0.03) & (np.abs(x) < F.mw * 1.05) & (z < 0.935) & (z > 0.6)
    interior = (((bag < 0.03) & (z < 0.88)) | channel).astype(np.float32)
    return np.stack([lips, blush, lid, interior], 1).astype(np.float32)


def mouth_part_sdfs(F: Face):
    """Teeth rows and tongue sitting just behind the lips."""
    my, mw = F.my, F.mw

    def arch(y, z0, r, half):
        xs = np.linspace(-half, half, 9)
        return [(float(x), y, z0 - 1.35 * x * x) for x in xs], [r * (0.75 if abs(x) > half * 0.8 else 1) for x in xs]

    up_pts, up_r = arch(my + 0.03, 0.815, 0.026, mw * 0.72)
    lo_pts, lo_r = arch(my - 0.045, 0.795, 0.022, mw * 0.62)
    return {
        "teethUpper": lambda p: S.curve_tube(p, up_pts, up_r, samples=40),
        "teethLower": lambda p: S.curve_tube(p, lo_pts, lo_r, samples=40),
        "tongue": lambda p: S.ellipsoid(p, (0, my - 0.075, 0.72), (mw * 0.62, 0.055, 0.17)),
    }


def build_mouth_parts(F: Face):
    obs = []
    b = ((-0.4, 0.4), (F.my - 0.2, F.my + 0.12), (0.45, 1.0))
    for name, fn in mouth_part_sdfs(F).items():
        v, f = mesh_from_sdf(fn, b, 0.006)
        ob = make_object(name, v, f)
        decimate(ob, 2500)
        base, _ = mesh_arrays(ob)
        white = np.ones(len(base), np.float32)
        set_packed(ob, np.stack([0 * white, 0 * white, 0 * white, white], 1), np.stack([0 * white, 0 * white], 1))
        keys = {n: field(n, base, F) for n in ("jawOpen", "jawForward", "jawLeft", "jawRight", "mouthClose")} if name != "teethUpper" else {}
        if name == "tongue":
            keys["tongueOut"] = field("tongueOut", base, F)
        if keys:
            add_shape_keys(ob, base, keys)
        obs.append(ob)
    return obs


def build_head():
    reset()
    step = float(os.environ.get("KIT_STEP", "0.012"))
    v, f = mesh_from_sdf(head_sdf, HEAD_BOUNDS, step)
    ob = make_object("head", v, f)
    decimate(ob, int(os.environ.get("KIT_FACES", "26000")))
    base, nrm = mesh_arrays(ob)
    print("head verts", len(base))

    # eyes as bake occluders
    (cL, cR), er = eye_centres(DEFAULT)
    eyes = []
    for c in (cL, cR):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=float(er), location=tuple(to_blender(c[None])[0]))
        eyes.append(bpy.context.active_object)
    ao = bake_ao(ob, eyes)
    for e in eyes:
        bpy.data.objects.remove(e)

    F = Face(DEFAULT)
    m = head_masks(base, F)
    # mouth interior is encoded as lips = blush = 1 (never overlap on the face)
    inside = m[:, 3] > 0.5
    lips = np.where(inside, 1.0, m[:, 0])
    blush = np.where(inside, 1.0, np.minimum(m[:, 1], 0.45 + 0.5 * (1 - m[:, 0])))
    set_packed(ob, np.stack([lips, blush, m[:, 2], ao], 1), np.zeros((len(base), 2), np.float32))

    deltas: dict[str, np.ndarray] = {}
    from fields import IDENTITY_NAMES, identity_field

    for name in IDENTITY_NAMES:
        deltas[name] = identity_field(name, base, F)
    for name in ARKIT:
        deltas[name] = field(name, base, F)
    add_shape_keys(ob, base, deltas)
    # cache neutral head + identity deltas so parts can inherit the face shape
    os.makedirs(CACHE, exist_ok=True)
    np.savez_compressed(os.path.join(CACHE, "head.npz"), base=base, normals=nrm,
                        **{k: deltas[k] for k in IDENTITY})

    parts = [ob] + build_mouth_parts(F)
    export_glb(parts, os.path.join(OUT, "head.glb"))
    compress(os.path.join(OUT, "head.glb"))
    meta = {
        "eyeCenters": [cL.tolist(), cR.tolist()],
        "eyeRadius": float(er),
        "identity": list(IDENTITY.keys()),
        "identityEyes": {"idEyesBig": {"eyeRadius": float(er) * 1.12}, "idEyesSmall": {"eyeRadius": float(er) * 0.9}},
        # how far each identity warp moves the eye centres (eyes are runtime spheres)
        "identityEyeOffsets": {n: identity_field(n, np.stack([cL, cR]), F).tolist() for n in IDENTITY_NAMES},
        "mouth": {"y": F.my, "width": F.mw, "z": F.mz},
        "shape": asdict(DEFAULT),
    }
    with open(os.path.join(OUT, "head.json"), "w") as fh:
        json.dump(meta, fh, indent=1)
    print("exported head", len(base), "verts,", len(deltas), "morphs")


# ── Parts (hair, brows, lashes, beards, headwear…) ──────────────────────────


class HeadRef:
    """Neutral head vertices + identity deltas, for transferring face shape."""

    def __init__(self):
        z = np.load(os.path.join(CACHE, "head.npz"))
        self.base = z["base"]
        self.normals = z["normals"]
        self.identity = {k: z[k] for k in IDENTITY}
        from scipy.spatial import cKDTree

        self.tree = cKDTree(self.base)

    def transfer(self, v: np.ndarray, k: int = 6, falloff: float = 0.35) -> dict[str, np.ndarray]:
        """Identity deltas for arbitrary points: inverse-distance blend of the k
        nearest head vertices, fading with distance from the skin."""
        dist, idx = self.tree.query(v, k=k)
        w = 1.0 / np.maximum(dist, 1e-4)
        w /= w.sum(axis=1, keepdims=True)
        fade = np.clip(1.0 - dist[:, 0] / falloff, 0.25, 1.0)[:, None]
        return {name: (d[idx] * w[:, :, None]).sum(axis=1) * fade for name, d in self.identity.items()}


def build_part(
    out_path: str,
    fn,
    bounds,
    step: float,
    faces: int,
    arkit: tuple[str, ...] = (),
    color=None,
    bake_occluder: bool = True,
):
    """SDF -> mesh -> identity (+ARKit) morphs -> colour (shade/mask/.., AO) -> GLB."""
    reset()
    ref = HeadRef()
    v, f = mesh_from_sdf(fn, bounds, step)
    ob = make_object("part", v, f)
    decimate(ob, faces)
    base, nrm = mesh_arrays(ob)
    ao = np.ones(len(base), np.float32)
    if bake_occluder:
        occ = make_object("occ_head", ref.base, np.zeros((0, 3), np.int32))
        # rebuild head surface as occluder from the SDF (fast, coarse)
        bpy.data.objects.remove(occ)
        hv, hf = mesh_from_sdf(head_sdf, HEAD_BOUNDS, 0.025)
        occ = make_object("occ_head", hv, hf)
        ao = bake_ao(ob, [occ])
        bpy.data.objects.remove(occ)
    col = color(base, nrm) if color else np.ones((len(base), 3), np.float32)
    set_packed(ob, np.concatenate([col, ao[:, None]], 1), np.zeros((len(base), 2), np.float32))
    from fields import IDENTITY_NAMES, identity_field

    F = Face(DEFAULT)
    deltas = {name: identity_field(name, base, F) for name in IDENTITY_NAMES}
    del ref
    for n in arkit:
        deltas[n] = field(n, base, F)
    add_shape_keys(ob, base, deltas)
    export_glb([ob], out_path)
    compress(out_path)
    print("exported", os.path.relpath(out_path, OUT), len(base), "verts")


BROW_KEYS = ("browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
             "eyeSquintLeft", "eyeSquintRight", "noseSneerLeft", "noseSneerRight")
LASH_KEYS = ("eyeBlinkLeft", "eyeBlinkRight", "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight",
             "eyeLookDownLeft", "eyeLookDownRight", "eyeLookUpLeft", "eyeLookUpRight")


def build_brows(style: str):
    from parts import BROW_BOUNDS, brow_sdf

    build_part(os.path.join(OUT, "brows", f"{style}.glb"), brow_sdf(style), BROW_BOUNDS, 0.006, 2600,
               arkit=BROW_KEYS, bake_occluder=False)


def build_lashes(style: str):
    from parts import LASH_BOUNDS, lash_sdf

    build_part(os.path.join(OUT, "lashes", f"{style}.glb"), lash_sdf(style), LASH_BOUNDS, 0.004, 3000,
               arkit=LASH_KEYS, bake_occluder=False)


def hair_color(v, n):
    """(shade, highlight mask, 0): tips and streaks get the highlight."""
    y = v[:, 1]
    ang = np.arctan2(v[:, 2], v[:, 0])
    streak = np.clip(np.sin(ang * 9 + np.sin(y * 4) * 2) * 1.6 - 0.6, 0, 1)
    tips = np.clip((0.2 - y) / 1.2, 0, 1)
    mask = np.clip(streak * 0.6 + tips * 0.8, 0, 1)
    return np.stack([np.ones_like(y), mask, np.zeros_like(y)], 1).astype(np.float32)


def build_hair(style: str):
    from hair import STYLES

    fn, ymin = STYLES[style]
    build_part(os.path.join(OUT, "hair", f"{style}.glb"), fn, ((-1.5, 1.5), (ymin, 1.6), (-1.5, 1.5)),
               float(os.environ.get("KIT_HAIR_STEP", "0.016")), int(os.environ.get("KIT_HAIR_FACES", "14000")),
               color=hair_color)


BEARD_KEYS = ("jawOpen", "jawForward", "jawLeft", "jawRight", "mouthClose", "mouthFunnel", "mouthPucker",
              "mouthLeft", "mouthRight", "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight",
              "mouthDimpleLeft", "mouthDimpleRight", "mouthStretchLeft", "mouthStretchRight", "mouthRollLower",
              "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthPressLeft", "mouthPressRight",
              "mouthLowerDownLeft", "mouthLowerDownRight", "mouthUpperUpLeft", "mouthUpperUpRight", "cheekPuff",
              "cheekSquintLeft", "cheekSquintRight")


def build_accessory(kind: str, style: str):
    import accessories as A

    if kind == "beard":
        build_part(os.path.join(OUT, "beard", f"{style}.glb"), A.beard_sdf(style), A.BEARD_BOUNDS,
                   0.006 if style == "stubble" else 0.01, 9000, arkit=BEARD_KEYS)
    elif kind == "headwear":
        build_part(os.path.join(OUT, "headwear", f"{style}.glb"), A.headwear_sdf(style), A.HEADWEAR_BOUNDS, 0.018, 12000)
    elif kind == "eyewear":
        build_part(os.path.join(OUT, "eyewear", f"{style}.glb"), A.eyewear_sdf(style, "frame"), A.EYEWEAR_BOUNDS,
                   0.006, 9000, bake_occluder=False)
        build_part(os.path.join(OUT, "eyewear", f"{style}-lens.glb"), A.eyewear_sdf(style, "lens"), A.EYEWEAR_BOUNDS,
                   0.006, 3000, bake_occluder=False)
    elif kind == "earrings":
        build_part(os.path.join(OUT, "earrings", f"{style}.glb"), A.earring_sdf(style), A.EARRING_BOUNDS, 0.005,
                   3000, bake_occluder=False)
    elif kind == "piercing":
        build_part(os.path.join(OUT, "piercing", f"{style}.glb"), A.piercing_sdf(style), A.PIERCING_BOUNDS, 0.004,
                   1500, bake_occluder=False, arkit=("noseSneerLeft", "noseSneerRight"))


ACCESSORY_LISTS = {"beard": "BEARDS", "headwear": "HEADWEAR", "eyewear": "EYEWEAR", "earrings": "EARRINGS",
                   "piercing": "PIERCINGS"}


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "head"
    if what in ACCESSORY_LISTS:
        import accessories as A

        arg = sys.argv[2] if len(sys.argv) > 2 else "all"
        for st in (getattr(A, ACCESSORY_LISTS[what]) if arg == "all" else [arg]):
            build_accessory(what, st)
        sys.exit(0)
    arg = sys.argv[2] if len(sys.argv) > 2 else "all"
    if what == "head":
        build_head()
    elif what == "brows":
        from parts import BROWS

        for st in (BROWS if arg == "all" else [arg]):
            build_brows(st)
    elif what == "lashes":
        from parts import LASHES

        for st in (LASHES if arg == "all" else [arg]):
            build_lashes(st)
    elif what == "hair":
        from hair import STYLES

        for st in (STYLES if arg == "all" else [arg]):
            build_hair(st)
