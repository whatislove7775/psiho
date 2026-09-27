"""
HEADZ 2.0 → web runtime assets (bpy 4.2).

Reads the purchased Blender sources from an EXTERNAL folder (never from the
repo — the licence forbids redistributing them) and writes derived, optimised
runtime GLBs:  <out>/<baseId>/face.glb  +  <out>/<baseId>/<slot>-<name>.glb

    HEADZ_SRC=/path/to/ПапкаСМоделями  python export.py <out_dir> [baseId ...]

Per base:
  * the shape-keyed face (skin mesh cut at the neck, eyes, brows, lashes, teeth,
    tongue, ears) is evaluated with all modifiers in the rig's REST pose; every
    ARKit key is re-sampled as (evaluated with key=1) − (evaluated basis), so
    keys living on meshes with subsurf/mask modifiers survive; zero keys are
    dropped per mesh, names are canonicalised to the exact ARKit names;
  * hair / beards / eyewear / headwear / earrings are evaluated in rest pose,
    decimated and exported one GLB each;
  * everything is moved into one normalised head space (Blender Z-up):
    head centre at the origin, neck→crown = 2 units (glTF: +Y up, +Z front);
  * materials are rebuilt as plain Principled BSDF (constant colours; image
    textures downscaled to ≤512 px WEBP) and named "<role>" so the runtime can
    restyle them (skin, hair, iris, …).
A sidecar <baseId>/info.json describes what was exported (tri counts, parts,
material colours, geometry hashes for de-duplication by build.mjs).
"""
import bpy
import bmesh
import hashlib
import json
import math
import os
import re
import sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
# The purchased sources never live in the repo (licence: no redistribution of source files).
SRC = os.environ.get("HEADZ_SRC") or "/tmp/claude-0/-home-user-whatislove/5ecfcc5f-fb33-51a1-8b00-0476ed2fac75/scratchpad/headz2/ПапкаСМоделями"

ARKIT = """browDownLeft browDownRight browInnerUp browOuterUpLeft browOuterUpRight cheekPuff cheekSquintLeft
cheekSquintRight eyeBlinkLeft eyeBlinkRight eyeLookDownLeft eyeLookDownRight eyeLookInLeft eyeLookInRight
eyeLookOutLeft eyeLookOutRight eyeLookUpLeft eyeLookUpRight eyeSquintLeft eyeSquintRight eyeWideLeft eyeWideRight
jawForward jawLeft jawOpen jawRight mouthClose mouthDimpleLeft mouthDimpleRight mouthFrownLeft mouthFrownRight
mouthFunnel mouthLeft mouthLowerDownLeft mouthLowerDownRight mouthPressLeft mouthPressRight mouthPucker mouthRight
mouthRollLower mouthRollUpper mouthShrugLower mouthShrugUpper mouthSmileLeft mouthSmileRight mouthStretchLeft
mouthStretchRight mouthUpperUpLeft mouthUpperUpRight noseSneerLeft noseSneerRight tongueOut""".split()
ARKIT_LC = {k.lower(): k for k in ARKIT}
ARKIT_LC["eyelooksquintleft"] = "eyeSquintLeft"  # typo in the source files
ARKIT_LC["eyelooksquintright"] = "eyeSquintRight"
# expression-ish keys that are NOT identity: forced to 0 in the neutral basis
EXPR_RE = re.compile(r"^(viseme_|mouthopen|mouthsmile|eyeclosed|eyelookup$|eyelookdown$|[AEIOU]$|Fff$|Lntd$|Key \d+)", re.I)

TONES = {"white": "light", "brown": "medium", "black": "dark"}

BASES = []
for tone in ("White", "Brown", "Black"):
    BASES.append(dict(id=f"man-{TONES[tone.lower()]}", group="man", file=f"male/Source files/{tone}.blend"))
    BASES.append(dict(id=f"woman-{TONES[tone.lower()]}", group="woman", file=f"female/Female - Source files/{tone}.blend"))
    for kid, g in (("Boy", "boy"), ("Girl", "girl")):
        BASES.append(dict(id=f"{g}-{TONES[tone.lower()]}", group=g, file=f"kids/Kids - Blender source files/{tone}_{kid}.blend"))
    for old, g in (("Male", "oldman"), ("Female", "oldwoman")):
        BASES.append(dict(id=f"{g}-{TONES[tone.lower()]}", group=g, file=f"elders/Elderz - Blender Source files/{tone} Older {old}.blend"))

SKIP_OBJ = ("WGT", "cs-", "cs_", "Light", "Background", "TEARS", "Plane", "MSDF", "Generator")
HAIR_TRIS = 8000
ACC_TRIS = 5000
FACE_TRIS = 16000


def log(*a):
    print("[headz]", *a, flush=True)


# ── scene prep ────────────────────────────────────────────────────────────────

AUTHORED_VISIBLE = set()


def open_blend(path):
    bpy.ops.wm.open_mainfile(filepath=path)
    AUTHORED_VISIBLE.clear()
    for o in bpy.data.objects:
        try:
            if not o.hide_render and not o.hide_viewport and o.visible_get():
                AUTHORED_VISIBLE.add(o.name)
        except Exception:
            pass
    for o in bpy.data.objects:
        for dp in ("hide_viewport", "hide_render"):
            try:
                o.driver_remove(dp)
            except Exception:
                pass
        o.hide_viewport = False
        o.hide_render = False
        try:
            o.hide_set(False)
        except Exception:
            pass
    for c in bpy.data.collections:
        for dp in ("hide_viewport", "hide_render"):
            try:
                c.driver_remove(dp)
            except Exception:
                pass
        c.hide_viewport = False
        c.hide_render = False

    def walk(lc):
        lc.exclude = False
        lc.hide_viewport = False
        for ch in lc.children:
            walk(ch)

    for vl in bpy.context.scene.view_layers:
        walk(vl.layer_collection)
    for o in bpy.data.objects:
        if o.type == "ARMATURE":
            o.data.pose_position = "REST"
    for me in bpy.data.meshes:
        if me.shape_keys:
            me.shape_keys.animation_data_clear()
    bpy.context.view_layer.update()


def dg():
    bpy.context.view_layer.update()
    return bpy.context.evaluated_depsgraph_get()


def eval_positions(o):
    d = dg()
    ev = o.evaluated_get(d)
    me = ev.to_mesh()
    mw = ev.matrix_world.copy()
    pts = [mw @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts


def eval_mesh_copy(o, name):
    """A standalone mesh (world space) of the evaluated object, with materials + UVs."""
    d = dg()
    ev = o.evaluated_get(d)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=d)
    me.transform(ev.matrix_world)
    me.name = name
    if me.shape_keys:
        pass
    return me


def canon(name):
    return ARKIT_LC.get(name.strip().lower())


# ── face ──────────────────────────────────────────────────────────────────────

def face_collection():
    best, score = None, 0
    for c in bpy.data.collections:
        n = sum(1 for o in c.objects if o.type == "MESH" and o.data.shape_keys and len(o.data.shape_keys.key_blocks) > 40)
        if n > score:
            best, score = c, n
    return best


def face_role(o):
    n = o.name.lower()
    mats = " ".join((s.material.name.lower() if s.material else "") for s in o.material_slots)
    if "tongue" in n:
        return "tongue"
    if "teeth" in n:
        return "teeth"
    if "brow" in n:
        return "brows"
    if "lash" in n or (o.name.endswith("Body.002") and "hair" in mats and len(o.data.vertices) < 2000):
        return "lashes"
    if "eye" in n:
        return "eyes"
    if "ears" in n and len(o.data.vertices) < 5000:
        return "ears"
    return "skin"


def find_face_objects():
    coll = face_collection()
    obs = []
    for o in coll.objects:
        if o.type != "MESH" or "backup" in o.name.lower() or o.name.startswith(SKIP_OBJ):
            continue
        if not eval_positions(o):
            continue
        obs.append(o)
    return coll, obs


def neutralise_keys(o):
    """Set expression keys to 0, keep identity keys (e.g. 'Head Shape') as authored."""
    sk = o.data.shape_keys
    if not sk:
        return []
    keys = []
    for kb in sk.key_blocks[1:]:
        kb.mute = False
        c = canon(kb.name)
        if c or EXPR_RE.match(kb.name.strip()):
            kb.value = 0.0
        if c:
            keys.append((kb, c))
    return keys


def sample_keys(o, keys):
    base = eval_positions(o)
    out = {}
    for kb, c in keys:
        if c in out:
            continue
        kb.slider_max = max(kb.slider_max, 1.0)
        kb.value = 1.0
        pos = eval_positions(o)
        kb.value = 0.0
        if len(pos) != len(base):
            log("  topology changes with key", kb.name, "on", o.name, "— skipped")
            continue
        out[c] = pos
    return base, out


def neck_plane(skin_pts, eye_z, top_z):
    """z of the narrowest horizontal slice between the chin and the shoulders."""
    span = top_z - eye_z
    lo, hi = eye_z - 2.6 * span, eye_z - 0.6 * span
    step = span / 40
    best, best_w = None, 1e9
    z = hi
    while z > lo:
        xs = [p.x for p in skin_pts if abs(p.z - z) < step]
        if len(xs) > 8:
            w = max(xs) - min(xs)
            if w < best_w:
                best, best_w = z, w
        z -= step
    return best if best is not None else eye_z - 1.5 * span


def cut_below(obj, z_cut, fill=True):
    """Bisect at z_cut, delete everything below, cap the hole. Shape keys are interpolated by bmesh."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z_cut), plane_no=(0, 0, 1), clear_inner=True)
    if fill:
        cut_edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and e.is_boundary]
        if cut_edges:
            try:
                bmesh.ops.holes_fill(bm, edges=cut_edges, sides=0)
            except Exception as ex:  # noqa
                log("  hole fill failed", ex)
    bm.to_mesh(me)
    bm.free()
    me.update()


def world_to_head(center, scale):
    return Matrix.Scale(scale, 4) @ Matrix.Translation(-center)


def islands(me):
    """Connected vertex islands of a mesh (lists of vertex indices)."""
    adj = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        adj[a].append(b)
        adj[b].append(a)
    seen = [False] * len(me.vertices)
    out = []
    for s in range(len(me.vertices)):
        if seen[s]:
            continue
        stack, comp = [s], []
        seen[s] = True
        while stack:
            v = stack.pop()
            comp.append(v)
            for w in adj[v]:
                if not seen[w]:
                    seen[w] = True
                    stack.append(w)
        out.append(comp)
    return out


def delete_verts(ob, idx):
    if not idx:
        return
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in idx], context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def keep_head_islands(ob, eye_c, top_z):
    """Drop floating hands / body shells: keep the crown's island and islands inside its box."""
    me = ob.data
    comps = islands(me)
    co = [v.co for v in me.vertices]
    crown = max(range(len(co)), key=lambda i: co[i].z)
    head = next(c for c in comps if crown in c)
    hx = [co[i].x for i in head]
    hy = [co[i].y for i in head]
    hz = [co[i].z for i in head]
    span = top_z - eye_c.z
    connected_body = min(hz) < eye_c.z - 3.2 * span
    lo = [min(hx), min(hy), min(hz)]
    hi = [max(hx), max(hy), max(hz)]
    pad = [0.1 * (hi[k] - lo[k]) for k in range(3)]
    drop = []
    for c in comps:
        if c is head:
            continue
        cen = sum((co[i] for i in c), Vector()) / len(c)
        inside = all(lo[k] - pad[k] <= cen[k] <= hi[k] + pad[k] for k in range(3))
        if not inside:
            drop.extend(c)
    delete_verts(ob, drop)
    return connected_body


FACE_BUDGET = {"skin": 70000, "eyes": 4200, "teeth": 3000, "tongue": 800, "lashes": 1800, "brows": 2400, "ears": 5000}


def cap_subdivision(o, role):
    """Lower subsurf/multires levels until the evaluated mesh fits the role's triangle budget."""
    budget = FACE_BUDGET.get(role, 4000)
    for _ in range(4):
        d = dg()
        ev = o.evaluated_get(d)
        me = ev.to_mesh()
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        ev.to_mesh_clear()
        if tris <= budget:
            return tris
        mods = [m for m in o.modifiers if m.type in ("SUBSURF", "MULTIRES") and m.show_viewport]
        lowered = False
        for m in mods:
            if m.type == "SUBSURF" and m.levels > 0:
                m.levels -= 1
                lowered = True
                break
            if m.type == "MULTIRES" and m.levels > 0:
                m.levels -= 1
                lowered = True
                break
        if not lowered:
            return tris
    return tris


def mirror_eye_keys(out):
    """Eyes whose look keys are missing on one side get the other side's keys, mirrored."""
    from mathutils.kdtree import KDTree
    eyes = [o for o in out if o.name.startswith("eyes")]
    if not eyes:
        return
    skin = max((o for o in out if o.name.startswith("skin")), key=lambda o: len(o.data.vertices))
    xs = [v.co.x for v in skin.data.vertices]
    cx = (min(xs) + max(xs)) / 2
    have = {}
    for o in eyes:
        if o.data.shape_keys:
            for kb in o.data.shape_keys.key_blocks[1:]:
                have.setdefault(kb.name, o)
    for o in eyes:
        mean_x = sum(v.co.x for v in o.data.vertices) / len(o.data.vertices) - cx
        side = "Left" if mean_x > 0 else "Right"
        other = "Right" if side == "Left" else "Left"
        if abs(mean_x) < 1e-4:
            continue  # both eyes in one mesh
        for d in ("In", "Out", "Up", "Down"):
            want = f"eyeLook{d}{side}"
            src_name = f"eyeLook{d}{other}"
            if o.data.shape_keys and want in o.data.shape_keys.key_blocks:
                continue
            src = have.get(src_name)
            if src is None:
                continue
            kd = KDTree(len(src.data.vertices))
            for i, v in enumerate(src.data.vertices):
                kd.insert(v.co, i)
            kd.balance()
            basis = src.data.shape_keys.key_blocks[0].data
            key = src.data.shape_keys.key_blocks[src_name].data
            if not o.data.shape_keys:
                o.shape_key_add(name="Basis", from_mix=False)
            kb = o.shape_key_add(name=want, from_mix=False)
            worst = 0.0
            for i, v in enumerate(o.data.vertices):
                m = Vector((2 * cx - v.co.x, v.co.y, v.co.z))
                co, j, dist = kd.find(m)
                worst = max(worst, dist)
                dlt = key[j].co - basis[j].co
                kb.data[i].co = v.co + Vector((-dlt.x, dlt.y, dlt.z))
            log(f"  mirrored {src_name} → {want} on {o.name} (max match dist {worst:.4f})")


def build_face(face_obs):
    """Returns (objects, transform, meta) — objects live in normalised head space."""
    roles = {o.name: face_role(o) for o in face_obs}
    out = []
    for o in face_obs:
        role = roles[o.name]
        cap_subdivision(o, role)
        keys = neutralise_keys(o)
        base, shapes = sample_keys(o, keys)
        me = eval_mesh_copy(o, role)
        if len(me.vertices) != len(base):
            log("  vertex mismatch", o.name, len(me.vertices), len(base))
            continue
        ob = bpy.data.objects.new(role, me)
        bpy.context.scene.collection.objects.link(ob)
        kept = 0
        eps = 2e-5
        if shapes:
            ob.shape_key_add(name="Basis", from_mix=False)
            for c, pos in shapes.items():
                if max((pos[i] - base[i]).length for i in range(len(base))) < eps:
                    continue
                kb = ob.shape_key_add(name=c, from_mix=False)
                for i, p in enumerate(pos):
                    kb.data[i].co = p
                kept += 1
            if kept == 0:
                ob.shape_key_clear()
        out.append(ob)
        log(f"  {role:7} {o.name[:36]:36} verts {len(me.vertices):6d} keys {kept}")
    mirror_eye_keys(out)
    # measure the neutral head (world space)
    skin = max((o for o in out if o.name.startswith("skin")), key=lambda o: len(o.data.vertices))
    eye_pts = [v.co for o in out if o.name.startswith("eyes") for v in o.data.vertices]
    eye_c = sum(eye_pts, Vector()) / len(eye_pts)
    top_z = max(v.co.z for v in skin.data.vertices)
    connected = keep_head_islands(skin, eye_c, top_z)
    pts = [v.co.copy() for v in skin.data.vertices]
    if connected:
        # a head on a neck/body: cut through the neck below the chin
        neck_z = neck_plane(pts, eye_c.z, top_z)
        H = top_z - neck_z
        cut = neck_z - 0.25 * H
        for ob in out:
            if min(v.co.z for v in ob.data.vertices) < cut:
                cut_below(ob, cut)
        bottom = neck_z
    else:
        bottom = min(p.z for p in pts)
        cut = None
    H = top_z - bottom
    head_pts = [p for p in pts if p.z > bottom]
    xs = [p.x for p in head_pts]
    ys = [p.y for p in head_pts]
    center = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, bottom + H / 2))
    scale = 2.0 / H
    T = world_to_head(center, scale)
    for ob in out:
        ob.data.transform(T, shape_keys=True)
        ob.data.update()
    log(f"  eye z {eye_c.z:.3f} top {top_z:.3f} bottom {bottom:.3f} H {H:.3f} neck-cut {cut} connected {connected}")
    return out, T, dict(center=list(center), scale=scale, H=H, bottom=bottom, cut=cut, eye=list((T @ eye_c)))


# ── parts ─────────────────────────────────────────────────────────────────────

def part_slot(o, coll_name):
    n = o.name.lower()
    c = coll_name.lower()
    if "earring" in n:
        return "earrings"
    if "helmet" in n or n.endswith("_ring") or "scarf" in n or "collar" in n or "mask" in n or "masker" in n:
        return None
    if "beard" in n or "moustache" in n or "mustache" in n or c == "beard":
        return "beard"
    if "glass" in n:
        return "eyewear"
    if "earring" in n:
        return "earrings"
    if any(k in n for k in ("hat", "cap", "beanie")):
        return "headwear"
    if c == "hair" or "hair" in n:
        return "hair"
    return None


def part_objects(face_names):
    parts = []
    for o in bpy.data.objects:
        if o.type != "MESH" or o.name in face_names or o.name.startswith(SKIP_OBJ):
            continue
        coll = o.users_collection[0].name if o.users_collection else ""
        slot = part_slot(o, coll)
        if not slot:
            continue
        parts.append((slot, o))
    return parts


def tri_count(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def decimate(ob, target):
    tris = tri_count(ob.data)
    if tris <= target:
        return tris
    m = ob.modifiers.new("dec", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = max(0.02, target / tris)
    m.use_collapse_triangulate = True
    d = dg()
    ev = ob.evaluated_get(d)
    me = bpy.data.meshes.new_from_object(ev, depsgraph=d)
    old = ob.data
    ob.modifiers.remove(m)
    ob.data = me
    bpy.data.meshes.remove(old)
    return tri_count(me)


def geo_hash(ob):
    h = hashlib.sha1()
    for v in ob.data.vertices:
        h.update(("%.3f,%.3f,%.3f;" % tuple(v.co)).encode())
    return h.hexdigest()[:16]


# ── materials ─────────────────────────────────────────────────────────────────

def principled_of(mat):
    if not mat or not mat.use_nodes:
        return None
    out = next((n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
    if out and out.inputs["Surface"].is_linked:
        n = out.inputs["Surface"].links[0].from_node
        for _ in range(4):
            if n.type == "BSDF_PRINCIPLED":
                return n
            if n.type == "GROUP" and n.node_tree:
                go = next((x for x in n.node_tree.nodes if x.type == "GROUP_OUTPUT"), None)
                if go and go.inputs and go.inputs[0].is_linked:
                    n = go.inputs[0].links[0].from_node
                    continue
            break
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            return n
    return None


def image_mean(img):
    import numpy as np
    w, h = img.size
    if not w:
        return None
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    return tuple(float(x) for x in px[:, :3].mean(0))


def const_color(sock, depth=0):
    """A representative constant colour for a (possibly linked) colour socket, or None if it is a real pattern."""
    if not sock.is_linked:
        v = sock.default_value
        try:
            return (v[0], v[1], v[2])
        except TypeError:
            return (v, v, v)
    if depth > 6:
        return None
    n = sock.links[0].from_node
    if n.type == "VALTORGB":
        fac = n.inputs["Fac"]
        if not fac.is_linked:
            c = n.color_ramp.evaluate(min(1.0, max(0.0, fac.default_value)))
            return (c[0], c[1], c[2])
        return None
    if n.type == "RGB":
        c = n.outputs[0].default_value
        return (c[0], c[1], c[2])
    if n.type in ("MIX", "MIX_RGB"):
        f = n.inputs[0]
        ins = [i for i in n.inputs if i.type == "RGBA" and i.enabled]
        if f.is_linked or len(ins) < 2:
            return None
        a, b = const_color(ins[0], depth + 1), const_color(ins[1], depth + 1)
        if a is None or b is None:
            return None
        t = f.default_value
        return tuple(a[k] * (1 - t) + b[k] * t for k in range(3))
    if n.type == "GROUP" and n.node_tree:
        go = next((x for x in n.node_tree.nodes if x.type == "GROUP_OUTPUT"), None)
        if go and go.inputs[0].is_linked:
            return const_color(go.inputs[0], depth + 1)
    return None


def base_color_source(mat):
    """('const', rgb) | ('image', img) | ('bake', None)."""
    p = principled_of(mat)
    if p is None:
        return ("const", tuple(mat.diffuse_color)[:3]) if mat else ("const", (0.8, 0.8, 0.8))
    bc = p.inputs["Base Color"]
    if bc.is_linked and bc.links[0].from_node.type == "TEX_IMAGE" and bc.links[0].from_node.image:
        return ("image", bc.links[0].from_node.image)
    c = const_color(bc)
    if c is not None:
        return ("const", c)
    return ("bake", None)


def mat_info(mat, baked=None):
    """(rgba linear, roughness, metallic, transmission, image|None) of a source material."""
    if baked is not None:
        img, mean = baked
        p = principled_of(mat)
        r = p.inputs["Roughness"].default_value if p and not p.inputs["Roughness"].is_linked else 0.5
        return (mean[0], mean[1], mean[2], 1.0), r, 0.0, 0.0, img
    p = principled_of(mat)
    if p is None:
        c = tuple(mat.diffuse_color) if mat else (0.8, 0.8, 0.8, 1)
        tw = 1.0 if mat and any(n.type in ("BSDF_GLASS", "BSDF_TRANSPARENT") for n in mat.node_tree.nodes) else 0.0
        return c, 0.6, 0.0, tw, None
    kind, v = base_color_source(mat)
    img = v if kind == "image" else None
    col = v if kind == "const" else (image_mean(img) if img is not None else tuple(mat.diffuse_color)[:3])
    r = p.inputs["Roughness"].default_value if not p.inputs["Roughness"].is_linked else 0.6
    m = p.inputs["Metallic"].default_value if not p.inputs["Metallic"].is_linked else 0.0
    tw = p.inputs["Transmission Weight"].default_value if "Transmission Weight" in p.inputs else 0.0
    a = p.inputs["Alpha"].default_value if not p.inputs["Alpha"].is_linked else 1.0
    return (col[0], col[1], col[2], a), r, m, tw, img


def bake_patterns(ob, size=256):
    """Bake procedural base colours (iris shaders, noisy skin) of an object's materials to images.

    Returns {slot_index: (image, mean_rgb)}. Needs UVs; materials with constant or
    image colours are left alone."""
    todo = [i for i, s in enumerate(ob.material_slots) if s.material and base_color_source(s.material)[0] == "bake"]
    if not todo or not ob.data.uv_layers:
        return {}
    import numpy as np
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 4
    sc.render.bake.use_pass_direct = False
    sc.render.bake.use_pass_indirect = False
    sc.render.bake.use_pass_color = True
    sc.render.bake.margin = 4
    # every material of the object needs an active image node — the unused ones bake into a scratch image
    scratch = bpy.data.images.new("scratch", 8, 8)
    added = []
    imgs = {}
    for i, s in enumerate(ob.material_slots):
        m = s.material
        if not m or not m.use_nodes:
            continue
        m = m.copy()  # never touch shared source materials
        s.material = m
        node = m.node_tree.nodes.new("ShaderNodeTexImage")
        if i in todo:
            im = bpy.data.images.new(f"bake_{ob.name}_{i}", size, size)
            imgs[i] = im
            node.image = im
        else:
            node.image = scratch
        m.node_tree.nodes.active = node
        added.append((m, node))
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    try:
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=4, use_clear=True)
    except Exception as ex:  # noqa
        log("  bake failed", ob.name, ex)
        return {}
    out = {}
    uv = ob.data.uv_layers.active.data
    for i, im in imgs.items():
        w, h = im.size
        px = np.empty(w * h * 4, np.float32)
        im.pixels.foreach_get(px)
        px = px.reshape(h, w, 4)
        # mean colour over the texels this material actually uses
        samp = []
        for poly in ob.data.polygons:
            if poly.material_index != i:
                continue
            for li in poly.loop_indices:
                u, v = uv[li].uv
                samp.append(px[min(h - 1, max(0, int(v * h))), min(w - 1, max(0, int(u * w))), :3])
        mean = tuple(float(x) for x in (np.mean(samp, 0) if samp else px[..., :3].reshape(-1, 3).mean(0)))
        out[i] = (im, mean)
    for m, node in added:
        m.node_tree.nodes.remove(node)
    return out


def to_gray(img):
    """Iris textures are recoloured at runtime: keep luminance only, normalised to a bright ring."""
    import numpy as np
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    lum = px[:, 0] * 0.2126 + px[:, 1] * 0.7152 + px[:, 2] * 0.0722
    hi = float(np.percentile(lum, 99)) or 1.0
    lum = np.clip(lum / hi, 0, 1)
    px[:, 0] = px[:, 1] = px[:, 2] = lum
    img.pixels.foreach_set(px.ravel())
    img.update()


def saturated_mean(img):
    import numpy as np
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    rgb = px.reshape(-1, 4)[:, :3]
    sat = rgb.max(1) - rgb.min(1)
    sel = rgb[sat > np.percentile(sat, 90)]
    return tuple(float(x) for x in (sel.mean(0) if len(sel) else rgb.mean(0)))


def mat_role(obj_role, src_name, info, slot_index, n_slots):
    n = (src_name or "").lower()
    col, r, m, tw, img = info
    if obj_role in ("skin", "ears"):
        if "mouth" in n or "inner" in n:
            return "mouth"
        if "underwear" in n or "shoe" in n:
            return "cloth"
        if "hair" in n:
            return "lashes"
        return "skin"
    if obj_role == "eyes":
        if "lens" in n or tw > 0.5:
            return "eyeLens"
        if "iris" in n or img is not None:
            return "iris"
        if "pupil" in n or "black" in n:
            return "pupil"
        if "white" in n or (col[0] > 0.5 and col[1] > 0.5 and col[2] > 0.5):
            return "eyeWhite"
        return "iris" if max(col[:3]) > 0.02 else "pupil"
    if obj_role in ("teeth", "tongue"):
        if "gum" in n:
            return "gums"
        if "teeth" in n or "tooth" in n:
            return "teeth"
        return "gums" if col[0] > col[2] * 1.5 else "teeth"
    if obj_role in ("brows", "lashes"):
        return obj_role
    if obj_role in ("hair", "beard"):
        return "hair"
    if obj_role == "eyewear":
        if "lens" in n or tw > 0.5 or info[0][3] < 0.9:
            return "glassLens"
        return f"frame{slot_index}" if n_slots > 2 else "frame"
    return f"{obj_role}{slot_index}"


def rebuild_materials(ob, obj_role, report, bake=True):
    baked = bake_patterns(ob, 256) if bake and obj_role in ("skin", "eyes", "ears") else {}
    area = {}
    for poly in ob.data.polygons:
        area[poly.material_index] = area.get(poly.material_index, 0.0) + poly.area
    principal = max(area, key=area.get) if area else 0
    new = []
    drop = []
    for i, slot in enumerate(ob.material_slots):
        src = slot.material
        info = mat_info(src, baked.get(i)) if src else ((0.8, 0.8, 0.8, 1), 0.6, 0, 0, None)
        role = mat_role(obj_role, src.name if src else "", info, i, len(ob.material_slots))
        if role == "eyeLens":
            drop.append(i)
        col, r, m, tw, img = info
        if role == "skin" and obj_role == "skin" and i != principal:
            role = "skinDetail"
        if role in ("skin", "skinDetail") and i in baked:
            img = None  # procedural skin → its average colour (flat, like the other bases)
        if role == "iris" and img is not None:
            if i in baked:
                col = saturated_mean(img)
                to_gray(img)
            else:
                img = None
        mat = bpy.data.materials.new(role)
        mat.use_nodes = True
        p = principled_of(mat)
        p.inputs["Base Color"].default_value = (col[0], col[1], col[2], 1)
        p.inputs["Roughness"].default_value = max(0.05, min(1, r))
        p.inputs["Metallic"].default_value = m
        if role == "glassLens":
            p.inputs["Alpha"].default_value = 0.3
            mat.blend_method = "BLEND"
        if img is not None and role in ("skin", "skinDetail", "mouth", "iris") or (img is not None and obj_role in ("eyewear", "headwear", "earrings")):
            tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = img if i in baked else shrink_image(img)
            mat.node_tree.links.new(tex.outputs["Color"], p.inputs["Base Color"])
        new.append(mat)
        report.append(dict(obj=obj_role, role=role, src=src.name if src else None,
                           color=[round(x, 4) for x in col[:3]], rough=round(r, 3), metal=round(m, 3), tex=bool(img)))
    for i, mat in enumerate(new):
        ob.material_slots[i].material = mat
    if drop:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        dead = [f for f in bm.faces if f.material_index in drop]
        bmesh.ops.delete(bm, geom=dead, context="FACES")
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bm.to_mesh(ob.data)
        bm.free()


_shrunk = {}


def shrink_image(img, limit=512):
    if img.name in _shrunk:
        return _shrunk[img.name]
    im = img.copy()
    w, h = im.size
    if max(w, h) > limit and w > 0:
        k = limit / max(w, h)
        im.scale(max(1, int(w * k)), max(1, int(h * k)))
    im.name = "tex_" + re.sub(r"[^a-z0-9]+", "_", img.name.lower())[:24]
    _shrunk[img.name] = im
    return im


# ── export ────────────────────────────────────────────────────────────────────

def export_glb(obs, path, morph=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_morph=morph,
        export_morph_normal=morph,
        export_skins=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_attributes=False,
    )


def smooth(ob, angle=None):
    """Smooth shading without authored sharp edges / custom normals (they made decimated hair look faceted).
    With `angle`, edges sharper than it stay hard (glasses frames, hat brims)."""
    me = ob.data
    for name in ("sharp_edge", "sharp_face"):
        if name in me.attributes:
            me.attributes.remove(me.attributes[name])
    if me.has_custom_normals:
        for o in bpy.context.scene.objects:
            o.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    if angle is None:
        me.shade_smooth()
    else:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=angle)


def export_base(b, out_root):
    path = os.path.join(SRC, b["file"])
    log("==", b["id"], path)
    open_blend(path)
    coll, face_src = find_face_objects()
    log("  face collection", coll.name, [o.name for o in face_src])
    face_names = {o.name for o in face_src}
    parts_src = part_objects(face_names)
    face_obs, T, meta = build_face(face_src)
    report = []
    tris = 0
    for ob in face_obs:
        smooth(ob)
        rebuild_materials(ob, ob.name.split(".")[0], report)
        tris += tri_count(ob.data)
    out_dir = os.path.join(out_root, b["id"])
    export_glb(face_obs, os.path.join(out_dir, "face.glb"))
    info = dict(id=b["id"], group=b["group"], source=os.path.basename(b["file"]), face=dict(tris=tris, meshes=[
        dict(role=o.name.split(".")[0], verts=len(o.data.vertices), tris=tri_count(o.data),
             keys=[k.name for k in o.data.shape_keys.key_blocks[1:]] if o.data.shape_keys else [])
        for o in face_obs]), materials=report, transform=meta, parts=[])
    # static LOD for list thumbnails: neutral pose, no morph targets, ~6k triangles
    lod = []
    for ob in face_obs:
        c = ob.copy()
        c.data = ob.data.copy()
        bpy.context.scene.collection.objects.link(c)
        if c.data.shape_keys:
            c.shape_key_clear()
        decimate(c, max(300, int(tri_count(c.data) * 6000 / max(1, tris))))
        lod.append(c)
    export_glb(lod, os.path.join(out_dir, "face-lod.glb"), morph=False)
    info["face"]["lodTris"] = sum(tri_count(c.data) for c in lod)
    for c in lod:
        bpy.data.objects.remove(c)
    # parts
    used = {}
    for slot, o in parts_src:
        for m in o.modifiers:
            # parts are evaluated at render quality, then decimated to the web budget
            if m.type == "SUBSURF":
                m.levels = min(2, max(m.levels, m.render_levels))
        try:
            me = eval_mesh_copy(o, o.name)
        except Exception as ex:  # noqa
            log("  skip", o.name, ex)
            continue
        if len(me.vertices) == 0:
            continue
        me.transform(T)
        lo = [min(v.co[i] for v in me.vertices) for i in range(3)]
        hi = [max(v.co[i] for v in me.vertices) for i in range(3)]
        cen = Vector([(lo[i] + hi[i]) / 2 for i in range(3)])
        if cen.length > 2.2 or max(hi[i] - lo[i] for i in range(3)) > 7.5:
            log(f"  skip {o.name}: not on the head (centre {tuple(round(c, 2) for c in cen)})")
            bpy.data.meshes.remove(me)
            continue
        ob = bpy.data.objects.new(o.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.shape_key_clear() if ob.data.shape_keys else None
        t = decimate(ob, HAIR_TRIS if slot in ("hair", "beard") else ACC_TRIS)
        smooth(ob, None if slot in ("hair", "beard") else math.radians(50))
        rep = []
        rebuild_materials(ob, slot, rep)
        name = re.sub(r"[^a-z0-9]+", "-", o.name.lower()).strip("-")
        name = re.sub(r"^(geo-)?(female|male|white|black|brown|older|old|boy|girl|-)+", "", name).strip("-") or slot
        key = f"{slot}-{name}"
        used[key] = used.get(key, 0) + 1
        if used[key] > 1:
            key += f"-{used[key]}"
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        export_glb([ob], os.path.join(out_dir, key + ".glb"), morph=False)
        extra = {}
        if slot == "headwear":
            vs = [v.co for v in ob.data.vertices]
            fr = [v.z for v in vs if v.y < -0.3 and abs(v.x) < 0.35]
            bk = [v.z for v in vs if v.y > 0.3 and abs(v.x) < 0.35]
            if fr and bk:
                extra["rim"] = [round(min(fr), 3), round(min(bk), 3)]
        info["parts"].append(dict(key=key, slot=slot, src=o.name, tris=t, hash=geo_hash(ob), materials=rep,
                                  visible=o.name in AUTHORED_VISIBLE, **extra,
                                  bbox=[[round(min(v[i] for v in bb), 3) for i in range(3)], [round(max(v[i] for v in bb), 3) for i in range(3)]]))
        log(f"  part {key:34} tris {t}")
        bpy.data.objects.remove(ob)
    with open(os.path.join(out_dir, "info.json"), "w") as f:
        json.dump(info, f, indent=1, ensure_ascii=False)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    out_root = argv[0]
    only = set(argv[1:])
    for b in BASES:
        if only and b["id"] not in only and b["group"] not in only:
            continue
        export_base(b, out_root)


if __name__ == "__main__":
    main()
