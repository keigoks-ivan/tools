"""Build Rumi's Blender modeling workspace from the approved turnaround sheet.

Run with Blender: blender --background --python game/design/create-rumi-blend.py
The reference planes are guides only and are excluded from GLB export.
"""

from pathlib import Path

import bpy
from mathutils import Vector


DESIGN_DIR = Path(__file__).resolve().parent
IMAGE = DESIGN_DIR / "rumi-3d-turnaround-v1.png"
OUTPUT = DESIGN_DIR / "rumi-modeling.blend"
HEIGHT = 2.05
SHEET_WIDTH = 1536
SHEET_HEIGHT = 1024


def collection(name):
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def reference_plane(name, x_start, x_end, center, rotation, target):
    width = HEIGHT * (x_end - x_start) / SHEET_HEIGHT
    vertices = [
        (-width / 2, 0, 0),
        (width / 2, 0, 0),
        (width / 2, 0, HEIGHT),
        (-width / 2, 0, HEIGHT),
    ]
    mesh = bpy.data.meshes.new(f"{name} Reference Mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.update()
    uv = mesh.uv_layers.new(name="Sheet crop")
    u0, u1 = x_start / SHEET_WIDTH, x_end / SHEET_WIDTH
    corners = [(u0, 0), (u1, 0), (u1, 1), (u0, 1)]
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            uv.data[loop_index].uv = corners[mesh.loops[loop_index].vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    obj.location = center
    obj.rotation_euler[2] = rotation
    obj.hide_render = True
    obj.hide_select = True
    obj.color = (0.75, 0.65, 1.0, 0.5)
    obj.data.materials.append(material)


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for existing in list(bpy.data.collections):
    if existing.name == "Collection":
        bpy.data.collections.remove(existing)

refs = collection("00 REFERENCES - do not export")
collection("01 RUMI MESH")
collection("02 RUMI RIG AND ACTIONS")

image = bpy.data.images.load(str(IMAGE), check_existing=True)
image.filepath = "//rumi-3d-turnaround-v1.png"
material = bpy.data.materials.new("Turnaround image - guide only")
material.use_nodes = True
nodes = material.node_tree.nodes
nodes.clear()
texture = nodes.new("ShaderNodeTexImage")
texture.image = image
shader = nodes.new("ShaderNodeEmission")
shader.inputs["Strength"].default_value = 1.0
output = nodes.new("ShaderNodeOutputMaterial")
material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Color"])
material.node_tree.links.new(shader.outputs["Emission"], output.inputs["Surface"])
material.use_backface_culling = False

# Approximate sheet crops. Inspect against the primary art before sculpting:
# these generated views do not agree perfectly on every costume detail.
reference_plane("FRONT", 0, 575, Vector((0, 0.35, 0)), 0, refs)
reference_plane("RIGHT SIDE", 575, 960, Vector((0.9, 0, 0)), 1.57079632679, refs)
reference_plane("BACK", 960, 1536, Vector((0, -0.35, 0)), 3.14159265359, refs)

for area in bpy.context.screen.areas:
    if area.type == "VIEW_3D":
        area.spaces.active.region_3d.view_location = (0, 0, HEIGHT / 2)
        area.spaces.active.region_3d.view_distance = 3.2
        area.spaces.active.shading.type = "MATERIAL"
        area.spaces.active.overlay.show_floor = False

bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.render.fps = 30
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
print(f"Saved {OUTPUT}")
