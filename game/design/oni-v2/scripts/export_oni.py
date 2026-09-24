"""Export oni_project.blend -> oni.glb, then re-import it and print a verification summary.

  Blender -b --python export_oni.py [-- --no-anim]

Layout of oni.glb: ONE armature node "OniRig" (Mixamo bone names, T-pose rest) with TWO skinned meshes,
"oni_grunt" and "oni_boss", sharing ONE material "OniAtlas" (1024^2 base colour + 1024^2 emissive, WebP).
The boss is modelled on the same skeleton; the game scales the boss instance (recommended x1.35).
Per enemy: SkeletonUtils.clone(gltf.scene), then remove the mesh of the other role.
Clips: 15 Mixamo clips retargeted by retarget_oni.retarget_fbx (idle, idle2, walk, run, attack, attack2, hit, hitbig,
knockdown, getup, death, death2, roar, bossAttack, bossDeath), 30 fps, fingers held in an open claw.
"""
import bpy, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get('ONI_V2_WORK', os.path.join(os.path.dirname(HERE), 'work'))
os.makedirs(WORK, exist_ok=True)
BLEND = os.path.join(WORK, 'oni_project.blend')
GLB = os.path.join(WORK, 'oni.glb')
NO_ANIM = '--no-anim' in sys.argv


def export():
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    rig = bpy.data.objects['OniRig']
    for a in list(bpy.data.actions):
        if a.name.startswith('rumiTest_') or a.name.startswith('SRC_'):
            bpy.data.actions.remove(a)
    if rig.animation_data:
        rig.animation_data.action = None
    # rest pose for the bind: clear any pose left on the rig
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
    bpy.ops.object.select_all(action='DESELECT')
    for o in (rig, bpy.data.objects['oni_grunt'], bpy.data.objects['oni_boss']):
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=GLB, use_selection=True, export_format='GLB',
        export_image_format='WEBP', export_image_quality=90,
        export_animations=not NO_ANIM, export_animation_mode='ACTIONS',
        export_apply=False, export_yup=True, export_skins=True, export_all_influences=False,
        export_optimize_animation_size=True, export_materials='EXPORT', export_frame_step=2,
        export_optimize_animation_keep_anim_armature=False, export_optimize_animation_keep_anim_object=False)
    print('exported', GLB, os.path.getsize(GLB) // 1024, 'KiB')


def verify():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)
    for o in bpy.data.objects:
        if o.type == 'MESH':
            me = o.data
            tris = sum(len(p.vertices) - 2 for p in me.polygons)
            mats = [m.name for m in me.materials]
            maxinf = max((len([g for g in v.groups if g.weight > 0]) for v in me.vertices), default=0)
            print(f'MESH {o.name}: {tris} tris, {len(me.vertices)} verts, mats={mats}, groups={len(o.vertex_groups)}, max influences={maxinf}')
        elif o.type == 'ARMATURE':
            names = [b.name for b in o.data.bones]
            print(f'ARMATURE {o.name}: {len(names)} bones; first: {names[:8]}')
    for im in bpy.data.images:
        print('IMAGE', im.name, tuple(im.size), im.file_format)
    for a in bpy.data.actions:
        print('ANIM', a.name, tuple(round(x, 1) for x in a.frame_range))


if __name__ == '__main__':
    export()
    verify()
