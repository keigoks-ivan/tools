"""Blender 5.x VRM -> GLB round-trip prototype; intentionally does not retarget.

Run with Blender's Python, for example:
  blender --background --python vroid_offline_roundtrip.py -- source.vrm out.glb

This imports the VRM as glTF and exports the imported character to GLB. The
Mixamo action GLB is deliberately not merged: see the companion notes for the
rig/rest-pose and sword-skinning blockers that need an explicit retarget pass.
"""
import sys
from pathlib import Path
import bpy


def arguments():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(args) != 2:
        raise SystemExit("Usage: -- source.vrm output.glb")
    return Path(args[0]).expanduser(), Path(args[1]).expanduser()


source, output = arguments()
if not source.is_file():
    raise SystemExit(f"VRM not found: {source}")
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
for obj in list(bpy.context.scene.objects):
    if obj.type == "MESH" and obj.name == "Icosphere" and not obj.data.materials and not obj.find_armature():
        bpy.data.objects.remove(obj, do_unlink=True)
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
if not meshes or not rigs:
    raise RuntimeError(f"VRM import incomplete: {len(meshes)} meshes, {len(rigs)} armatures")
bpy.ops.export_scene.gltf(
    filepath=str(output),
    export_format="GLB",
    use_selection=False,
    export_animations=True,
)
print(f"VRM_ROUNDTRIP_OK meshes={len(meshes)} armatures={len(rigs)} output={output}")
