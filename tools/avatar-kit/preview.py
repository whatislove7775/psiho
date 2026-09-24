"""Blender Cycles preview of kit meshes: python preview.py out_prefix mesh.ply [hair.ply ...]

Renders front and 3/4 views with a Memoji-like look (soft SSS skin, glossy
eyes) so sculpting changes can be judged visually.
"""
import math
import sys

import bpy
import numpy as np

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from head import DEFAULT, eye_centres  # noqa: E402

out = sys.argv[1]
meshes = sys.argv[2:]
size = 520

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = size
scene.render.resolution_y = size
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Base Contrast"

world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.93, 0.9, 0.96, 1)
bg.inputs[1].default_value = 0.9


def mat_skin():
    m = bpy.data.materials.new("skin")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.87, 0.6, 0.47, 1)
    b.inputs["Roughness"].default_value = 0.5
    b.inputs["Subsurface Weight"].default_value = 0.35
    b.inputs["Subsurface Radius"].default_value = (0.35, 0.15, 0.08)
    b.inputs["Subsurface Scale"].default_value = 0.12
    b.inputs["Coat Weight"].default_value = 0.08
    return m


def mat(name, rgb, rough=0.5, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat
    return m


def mat_eye():
    m = bpy.data.materials.new("eye")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.1
    b.inputs["Coat Weight"].default_value = 1.0
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    # radius from the eye's forward axis (object local z)
    mathx = nt.nodes.new("ShaderNodeMath"); mathx.operation = "MULTIPLY"
    nt.links.new(sep.outputs["X"], mathx.inputs[0]); nt.links.new(sep.outputs["X"], mathx.inputs[1])
    mathy = nt.nodes.new("ShaderNodeMath"); mathy.operation = "MULTIPLY"
    nt.links.new(sep.outputs["Y"], mathy.inputs[0]); nt.links.new(sep.outputs["Y"], mathy.inputs[1])
    add = nt.nodes.new("ShaderNodeMath"); add.operation = "ADD"
    nt.links.new(mathx.outputs[0], add.inputs[0]); nt.links.new(mathy.outputs[0], add.inputs[1])
    sq = nt.nodes.new("ShaderNodeMath"); sq.operation = "SQRT"
    nt.links.new(add.outputs[0], sq.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = "EASE"
    cr.elements[0].position = 0.0; cr.elements[0].color = (0.01, 0.01, 0.01, 1)
    cr.elements[1].position = 0.26; cr.elements[1].color = (0.01, 0.01, 0.01, 1)
    e = cr.elements.new(0.3); e.color = (0.18, 0.09, 0.04, 1)
    e = cr.elements.new(0.52); e.color = (0.32, 0.18, 0.08, 1)
    e = cr.elements.new(0.6); e.color = (0.05, 0.03, 0.02, 1)
    e = cr.elements.new(0.64); e.color = (0.95, 0.93, 0.9, 1)
    cr.elements[-1].position = 1.0; cr.elements[-1].color = (0.9, 0.86, 0.84, 1)
    # scale so radius 1 (sphere) maps to ramp range
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "DIVIDE"; mul.inputs[1].default_value = er
    nt.links.new(sq.outputs[0], mul.inputs[0])
    nt.links.new(mul.outputs[0], ramp.inputs[0])
    # back hemisphere stays white
    gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = 0.0
    nt.links.new(sep.outputs["Z"], gt.inputs[0])
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (0.9, 0.86, 0.84, 1)
    nt.links.new(gt.outputs[0], mix.inputs["Factor"])
    nt.links.new(ramp.outputs[0], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    return m


def import_ply(path, material):
    bpy.ops.wm.ply_import(filepath=path)
    ob = bpy.context.selected_objects[0]
    ob.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return ob


(cr, cl), er = eye_centres(DEFAULT)
skin = mat_skin()
hair_mat = mat("hair", (0.12, 0.07, 0.05), 0.45, 0.2)
for i, path in enumerate(meshes):
    import_ply(path, skin if i == 0 else hair_mat)

# eyes
(cr, cl), er = eye_centres(DEFAULT)
eye_m = mat_eye()
for c in (cr, cl):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=er, location=(float(c[0]), float(-c[2]), float(c[1])), segments=48, ring_count=32)
    ob = bpy.context.active_object
    # Blender is z-up: our (x, y, z) -> (x, -z, y); eye forward (+z ours) = -y blender
    ob.rotation_euler = (math.radians(90), 0, 0)
    ob.data.materials.append(eye_m)
    bpy.ops.object.shade_smooth()

# our meshes are y-up: rotate imported meshes into Blender z-up
for ob in bpy.data.objects:
    if ob.type == "MESH" and ob.data.materials and ob.data.materials[0].name != "eye":
        ob.rotation_euler = (math.radians(90), 0, 0)

# lights
def light(name, kind, energy, loc, rot, size=2.0, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == "AREA":
        ld.size = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = rot
    scene.collection.objects.link(ob)

light("key", "AREA", 700, (2.5, -4.5, 3.5), (math.radians(55), 0, math.radians(28)), 4, (1, 0.96, 0.92))
light("fill", "AREA", 350, (-4, -3.5, 1.0), (math.radians(75), 0, math.radians(-50)), 5, (0.92, 0.95, 1))
light("rim", "AREA", 400, (0, 4, 3), (math.radians(-50), 0, math.radians(180)), 3)

cam_d = bpy.data.cameras.new("cam")
cam_d.lens = 85
cam = bpy.data.objects.new("cam", cam_d)
scene.collection.objects.link(cam)
scene.camera = cam

for label, yaw in (("front", 0.0), ("34", 0.6)):
    dist = 9.2
    cam.location = (math.sin(yaw) * dist, -math.cos(yaw) * dist, 0.15)
    cam.rotation_euler = (math.radians(90), 0, yaw)
    scene.render.filepath = f"{out}-{label}.png"
    bpy.ops.render.render(write_still=True)
print("rendered", out)
