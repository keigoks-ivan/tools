"""Export retargeted Mixamo actions from a retarget_fbx.py output as an armature-only GLB.

No meshes, textures or the sword ship; game/scripts/import_mocap.mjs turns the GLB into 3d-next/mocap-data.js.
Usage: blender -b out.blend --python export_mocap_actions.py -- out.glb action [action ...]
"""
import sys, bpy

args = sys.argv[sys.argv.index('--') + 1:]
OUT, KEEP = args[0], set(args[1:])
missing = KEEP - {a.name for a in bpy.data.actions}
if missing:
    raise SystemExit(f'missing actions: {sorted(missing)}')
for a in list(bpy.data.actions):
    if a.name not in KEEP:
        bpy.data.actions.remove(a)
for o in list(bpy.data.objects):
    if o.name != 'Armature':
        bpy.data.objects.remove(o, do_unlink=True)
rig = bpy.data.objects['Armature']
rig.animation_data.action = None
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
                          export_force_sampling=True, export_skins=False, export_def_bones=False, export_yup=True)
print('MOCAP_EXPORT_OK', OUT, sorted(KEEP))
