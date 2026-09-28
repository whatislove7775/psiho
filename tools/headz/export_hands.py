"""
HEADZ 2.0 floating hands → web runtime GLBs (bpy 4.2).

The purchased characters carry Memoji-style floating hands (islands of the body
mesh, skinned to the Rigify DEF- finger bones). This script exports them as a
small skinned GLB per character group with a MINIMAL skeleton that maps 1:1 to
MediaPipe's 21 hand landmarks:

    wrist
    thumb0 thumb1 thumb2 thumb3 [thumbTip]      (0 → 1 → 2 → 3 → 4)
    index0 index1 index2 index3 [indexTip]      (0 → 5 → 6 → 7 → 8)
    middle… ring… pinky…                        (0 → 9…12, 13…16, 17…20)

  * bone k of a finger starts at landmark k−1 of that finger (bone 0 at the wrist);
    `…Tip` bones carry no weights, they only mark the finger tips;
  * deform weights come from the Rigify DEF bones (palm.0N → <finger>0,
    f_<finger>.01‥03 → <finger>1‥3, thumb.01‥03 → thumb1‥3, hand/forearm → wrist),
    re-normalised to ≤ 4 influences;
  * evaluated in the rig's REST pose with one level of subdivision, decimated to
    a web budget; wrist at the origin, wrist → middle-finger tip = 1 unit;
  * one material named "skin" (white — the runtime tints it with the avatar's skin tone).

Only derived, optimised GLBs are written (never the sources — see README.md):

    HEADZ_SRC=/path/to/ПапкаСМоделями  python export_hands.py [group ...]
      → apps/web/public/avatar/hands/<group>.glb   (+ de-duplicated across groups)
      → apps/web/src/lib/avatar/headz/hands/manifest.gen.ts
"""
import bpy
import bmesh
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
SRC = os.environ.get("HEADZ_SRC") or "/tmp/claude-0/-home-user-whatislove/5ecfcc5f-fb33-51a1-8b00-0476ed2fac75/scratchpad/headz2/ПапкаСМоделями"
OUT = os.path.join(ROOT, "apps/web/public/avatar/hands")
GEN = os.path.join(ROOT, "apps/web/src/lib/avatar/headz/hands/manifest.gen.ts")
TRIS = int(os.environ.get("HANDS_TRIS", "3200"))  # per hand

# one representative source per group (the hands are the same across skin tones; tint at runtime)
GROUPS = {
    "man": "male/Source files/White.blend",
    "woman": "female/Female - Source files/White.blend",
    "boy": "kids/Kids - Blender source files/White_Boy.blend",
    "oldman": "elders/Elderz - Blender Source files/White Older Male.blend",
    "oldwoman": "elders/Elderz - Blender Source files/White Older Female.blend",
}

# White_Girl's body has arms attached (no floating hand islands) → the girl uses the boy's (kid) hands
ALIASES = {"girl": "boy"}

FINGERS = ["thumb", "index", "middle", "ring", "pinky"]


def log(*a):
    print("[hands]", *a, flush=True)


def open_blend(path):
    bpy.ops.wm.open_mainfile(filepath=path)
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
    bpy.context.view_layer.update()


def source_bones(side):
    """Rigify DEF bones → (our bone, head, tail) in world space."""
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE" and "DEF-hand." + side in o.data.bones)
    mw = rig.matrix_world
    B = rig.data.bones

    def ht(name):
        b = B[name]
        return mw @ b.head_local, mw @ b.tail_local

    joints = {}  # our bone → (head, tail)
    w_head, _ = ht(f"DEF-hand.{side}")
    t1h, t1t = ht(f"DEF-thumb.01.{side}")
    joints["thumb0"] = (w_head, t1h)
    for k in (1, 2, 3):
        joints[f"thumb{k}"] = ht(f"DEF-thumb.0{k}.{side}")
    for i, f in enumerate(["index", "middle", "ring", "pinky"]):
        joints[f"{f}0"] = ht(f"DEF-palm.0{i + 1}.{side}")
        for k in (1, 2, 3):
            joints[f"{f}{k}"] = ht(f"DEF-f_{f}.0{k}.{side}")
    # palm bones start slightly off the wrist: start them at the wrist (landmark 0)
    for f in ["index", "middle", "ring", "pinky"]:
        joints[f"{f}0"] = (w_head, joints[f"{f}0"][1])
    joints["wrist"] = (w_head, joints["middle0"][1])
    # weights: source vertex group → our bone
    vmap = {f"DEF-hand.{side}": "wrist", f"DEF-forearm.{side}": "wrist", f"DEF-forearm.{side}.001": "wrist"}
    for k in (1, 2, 3):
        vmap[f"DEF-thumb.0{k}.{side}"] = f"thumb{k}"
    for i, f in enumerate(["index", "middle", "ring", "pinky"]):
        vmap[f"DEF-palm.0{i + 1}.{side}"] = f"{f}0"
        for k in (1, 2, 3):
            vmap[f"DEF-f_{f}.0{k}.{side}"] = f"{f}{k}"
    return rig, joints, vmap


def body_object():
    best, n = None, 0
    for o in bpy.data.objects:
        if o.type != "MESH" or "DEF-f_index.01.L" not in o.vertex_groups or "DEF-f_index.01.R" not in o.vertex_groups:
            continue
        gi = {o.vertex_groups[f"DEF-f_index.01.{s}"].index for s in "LR"}
        c = sum(1 for v in o.data.vertices if any(g.group in gi and g.weight > 0.2 for g in v.groups))
        if c > n:
            best, n = o, c
    return best


def islands(bm):
    seen, out = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        st, comp = [v], []
        seen.add(v.index)
        while st:
            x = st.pop()
            comp.append(x.index)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen:
                    seen.add(y.index)
                    st.append(y)
        out.append(comp)
    return out


def hand_mesh(body, side, vmap):
    """A standalone object with only the `side` hand island, subdivided once, weights remapped."""
    ob = body.copy()
    ob.data = body.data.copy()
    ob.name = f"hand.{side}"
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = None
    ob.matrix_world = body.matrix_world
    if ob.data.shape_keys:
        ob.shape_key_clear()
    for m in list(ob.modifiers):
        if m.type != "SUBSURF":
            ob.modifiers.remove(m)
    names = {g.index: g.name for g in ob.vertex_groups}
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    keep = set()
    hand_groups = {g.index for g in ob.vertex_groups if g.name in vmap and g.name not in (f"DEF-forearm.{side}", f"DEF-forearm.{side}.001")}
    for comp in islands(bm):
        score = sum(1 for i in comp for g in me.vertices[i].groups if g.group in hand_groups and g.weight > 0.2)
        if score > 0.3 * len(comp):
            keep.update(comp)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in range(len(bm.verts)) if i not in keep], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    # remap weights (sum groups that land on the same bone), before subdivision
    new_w = []
    for v in me.vertices:
        acc = {}
        for g in v.groups:
            t = vmap.get(names.get(g.group, ""))
            if t and g.weight > 0:
                acc[t] = acc.get(t, 0) + g.weight
        if not acc:
            acc = {"wrist": 1.0}
        top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
        s = sum(w for _, w in top)
        new_w.append([(n, w / s) for n, w in top])
    ob.vertex_groups.clear()
    for v, ws in zip(me.vertices, new_w):
        for n, w in ws:
            g = ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)
            g.add([v.index], w, "REPLACE")
    # subdivide once (weights are interpolated by the modifier)
    for m in ob.modifiers:
        m.levels = 1
        m.render_levels = 1
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    if len(ob.data.polygons) and sum(len(p.vertices) - 2 for p in ob.data.polygons) == 0:
        return None
    return ob


def decimate(ob, target):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris <= target:
        return tris
    m = ob.modifiers.new("dec", "DECIMATE")
    m.ratio = target / tris
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def build_hand(side, joints, vmap, body, xf):
    ob = hand_mesh(body, side, vmap)
    if ob is None:
        return None, None, 0
    ob.data.transform(xf @ ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    tris = decimate(ob, TRIS)
    me = ob.data
    for name in ("sharp_edge", "sharp_face"):
        if name in me.attributes:
            me.attributes.remove(me.attributes[name])
    me.shade_smooth()
    # one material, named by role
    mat = bpy.data.materials.new("skin")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 0.5
    me.materials.clear()
    me.materials.append(mat)
    # minimal armature
    arm = bpy.data.armatures.new(f"hand{side}")
    rig = bpy.data.objects.new(f"hand{side}", arm)
    bpy.context.scene.collection.objects.link(rig)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    P = lambda v: xf @ v  # noqa: E731
    w = eb.new("wrist")
    w.head, w.tail = P(joints["wrist"][0]), P(joints["wrist"][1])
    for f in FINGERS:
        parent = w
        for k in range(4):
            h, t = joints[f"{f}{k}"]
            b = eb.new(f"{f}{k}")
            b.head, b.tail = P(h), P(t)
            b.parent = parent
            b.use_connect = False
            parent = b
        tip = eb.new(f"{f}Tip")
        d = (parent.tail - parent.head)
        tip.head, tip.tail = parent.tail.copy(), parent.tail + d * 0.5
        tip.parent = parent
    bpy.ops.object.mode_set(mode="OBJECT")
    ob.parent = rig
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    ob.name = f"hand{side}Mesh"
    return rig, ob, tris


def geo_hash(obs):
    h = hashlib.sha1()
    for ob in obs:
        for v in ob.data.vertices:
            h.update(("%.3f,%.3f,%.3f;" % tuple(v.co)).encode())
    return h.hexdigest()


def export_group(group, rel, tmp):
    path = os.path.join(SRC, rel)
    log("==", group, path)
    open_blend(path)
    body = body_object()
    _, jl, vl = source_bones("L")
    _, jr, vr = source_bones("R")
    # hand space: wrist of the LEFT hand at the origin, wrist → middle tip = 1 unit; each hand then
    # re-centred on its own wrist. Blender Z-up → glTF Y-up is done by the exporter.
    length = (jl["middle3"][1] - jl["wrist"][0]).length
    s = 1.0 / length
    out = []
    info = {}
    for side, J, V in (("L", jl, vl), ("R", jr, vr)):
        xf = Matrix.Scale(s, 4) @ Matrix.Translation(-J["wrist"][0])
        rig, ob, tris = build_hand(side, J, V, body, xf)
        if rig is None:
            raise RuntimeError(f"{group}: no {side} hand island")
        out += [rig, ob]
        info[side] = dict(tris=tris, verts=len(ob.data.vertices))
        log(f"  {side}: {len(ob.data.vertices)} verts, {tris} tris")
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in out:
        o.select_set(True)
    bpy.context.view_layer.objects.active = out[0]
    raw = os.path.join(tmp, f"{group}.glb")
    bpy.ops.export_scene.gltf(
        filepath=raw, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
        export_texcoords=False, export_normals=True, export_materials="EXPORT", export_morph=False,
        export_skins=True, export_all_influences=False, export_def_bones=False, export_animations=False,
        export_cameras=False, export_lights=False, export_extras=False, export_attributes=False,
    )
    return raw, geo_hash([o for o in out if o.type == "MESH"]), info


def pack(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    args = ["-i", src, "-o", dst, "-cc", "-kn", "-noq"] if os.environ.get("HANDS_NOQ") else ["-i", src, "-o", dst, "-cc", "-kn"]
    gp = shutil.which(os.environ.get("GLTFPACK", "gltfpack"))
    cmd = [gp, *args] if gp else ["npx", "--yes", "gltfpack@0.22.0", *args]
    subprocess.run(cmd, check=True, capture_output=True)
    return os.path.getsize(dst)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    only = set(argv)
    tmp = tempfile.mkdtemp(prefix="hands-")
    manifest = {}
    files = {}
    for group, rel in GROUPS.items():
        if only and group not in only:
            continue
        raw, h, info = export_group(group, rel, tmp)
        if min(v["tris"] for v in info.values()) == 0:
            raise RuntimeError(f"{group}: empty hand mesh")
        if h in files:
            manifest[group] = files[h]
            log(f"  same hands as {files[h]}")
            continue
        dst = os.path.join(OUT, f"{group}.glb")
        size = pack(raw, dst)
        url = "/" + os.path.relpath(dst, os.path.join(ROOT, "apps/web/public")).replace(os.sep, "/")
        files[h] = url
        manifest[group] = url
        log(f"  → {url} {size / 1024:.0f} KB {json.dumps(info)}")
    for a, g in ALIASES.items():
        if g in manifest:
            manifest[a] = manifest[g]
    if not only:
        os.makedirs(os.path.dirname(GEN), exist_ok=True)
        with open(GEN, "w") as f:
            f.write("/* eslint-disable */\n// Generated by tools/headz/export_hands.py — do not edit.\n\n")
            f.write("/** character group → floating-hands GLB (both hands, minimal 21+5-bone skeleton each) */\n")
            f.write("export const HANDS_BY_GROUP: Record<string, string> = " + json.dumps(manifest, indent=1) + ";\n")
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
