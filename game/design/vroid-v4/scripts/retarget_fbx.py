"""Retarget Mixamo FBX clips (downloaded without skin) onto the costumed VRoid project.

Same calibrated world-rotation-delta transfer as animate_v4.py, but the source rig is read in world space
because Mixamo FBX armatures import with an axis-conversion rotation and a 0.01 object scale.
Usage: blender -b --python retarget_fbx.py -- project.blend out.blend name=path.fbx [name=path.fbx ...]
"""
import sys, os, math, bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import retarget_vroid as R
import swordlib as SW

args = sys.argv[sys.argv.index('--') + 1:]
SRC_BLEND, OUT_BLEND = args[0], args[1]
JOBS = [a.split('=', 1) for a in args[2:] if '=' in a and not a.startswith('--')]
FPS = 30

bpy.ops.wm.open_mainfile(filepath=SRC_BLEND)
scene = bpy.context.scene
scene.render.fps = FPS
tgt = bpy.data.objects['Armature']
if tgt.animation_data is None:
    tgt.animation_data_create()

# grip pose for the sword hand, captured once
for pb in tgt.pose.bones:
    pb.rotation_mode = 'QUATERNION'; pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
SW.grip_right_hand(tgt)
GRIP = {f'J_Bip_R_{f}{i}': tgt.pose.bones[f'J_Bip_R_{f}{i}'].matrix_basis.to_quaternion()
        for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Little') for i in (1, 2, 3)}
for pb in tgt.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()

target_rest = R.get_all_rest_data(tgt)
rest_local = R.precompute_target_rest_locals(target_rest)
CAL = R.CALIBRATION_REFS + [
    ('J_Bip_L_UpperArm', 'J_Bip_L_LowerArm', 'mixamorigLeftArm', 'mixamorigLeftForeArm'),
    ('J_Bip_L_LowerArm', 'J_Bip_L_Hand', 'mixamorigLeftForeArm', 'mixamorigLeftHand'),
    ('J_Bip_R_UpperArm', 'J_Bip_R_LowerArm', 'mixamorigRightArm', 'mixamorigRightForeArm'),
    ('J_Bip_R_LowerArm', 'J_Bip_R_Hand', 'mixamorigRightForeArm', 'mixamorigRightHand'),
]


def world_rest(arm):
    M = arm.matrix_world
    out = {}
    for b in arm.data.bones:
        loc, rot, _ = (M @ b.matrix_local).decompose()
        out[b.name] = {'loc': loc, 'rot': rot.normalized(), 'parent': b.parent.name if b.parent else None}
    return out


def import_source(path):
    before = set(bpy.data.objects)
    acts_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=True)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    for b in arm.data.bones:
        if ':' in b.name:
            b.name = 'mixamorig' + b.name.split(':', 1)[1]
    act = next(a for a in bpy.data.actions if a not in acts_before)
    return arm, act, new, [a for a in bpy.data.actions if a not in acts_before]


def retarget(name, path):
    src, act, new, new_actions = import_source(path)
    src.animation_data.action = act
    s_rest = world_rest(src)
    mapping = [(s, t) for s, t in R.MAPPING if s in s_rest]
    calib = {}
    for tb, tc, sb, sc in CAL:
        if sb in s_rest and sc in s_rest:
            td = (target_rest[tc]['loc'] - target_rest[tb]['loc']).normalized()
            sd = (s_rest[sc]['loc'] - s_rest[sb]['loc']).normalized()
            calib[tb] = td.rotation_difference(sd)
    cal_rest = {n: (calib[n] @ d['rot']) if n in calib else d['rot'] for n, d in target_rest.items()}
    sg = min(s_rest['mixamorigLeftToeBase']['loc'].z, s_rest['mixamorigRightToeBase']['loc'].z)
    tg = min(target_rest['J_Bip_L_ToeBase']['loc'].z, target_rest['J_Bip_R_ToeBase']['loc'].z)
    ratio = (target_rest[R.TGT_HIPS]['loc'].z - tg) / (s_rest[R.SRC_HIPS]['loc'].z - sg)
    hp = target_rest[R.TGT_HIPS]['parent']
    Wp = target_rest[hp]['matrix'] if 'matrix' in target_rest[hp] else Matrix.Identity(4)
    rl_hips = Wp.inverted() @ target_rest[R.TGT_HIPS]['matrix']
    out = bpy.data.actions.new(name); out.use_fake_user = True
    tgt.animation_data.action = out
    for _, t in mapping:
        tgt.pose.bones[t].rotation_mode = 'QUATERNION'
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    prev = {}
    Ms = src.matrix_world
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        world = {}
        for sn, tn in mapping:
            wl, wr, _ = (Ms @ src.pose.bones[sn].matrix).decompose()
            tw = (wr @ s_rest[sn]['rot'].inverted()) @ cal_rest[tn]
            tw.normalize(); world[tn] = tw
            par = target_rest[tn]['parent']
            wp = Quaternion() if par is None else world.get(par, target_rest[par]['rot'])
            mb = (rest_local[tn].inverted() @ wp.inverted() @ tw).normalized()
            if tn in GRIP:
                mb = GRIP[tn].copy()
            if tn in prev and prev[tn].dot(mb) < 0:
                mb = -mb
            prev[tn] = mb.copy()
            pb = tgt.pose.bones[tn]
            k = f - f0
            if tn == R.TGT_HIPS:
                W = Matrix.Translation(target_rest[tn]['loc'] + (wl - s_rest[sn]['loc']) * ratio) @ tw.to_matrix().to_4x4()
                loc, rot, _ = (rl_hips.inverted() @ Wp.inverted() @ W).decompose()
                if 'hip' in prev and prev['hip'].dot(rot) < 0:
                    rot = -rot
                prev['hip'] = rot.copy()
                pb.rotation_quaternion = rot; pb.location = loc
                pb.keyframe_insert('location', frame=k, group=tn)
            else:
                pb.rotation_quaternion = mb
            pb.keyframe_insert('rotation_quaternion', frame=k, group=tn)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in new_actions:
        bpy.data.actions.remove(a)
    print('RETARGET', name, f1 - f0 + 1, 'frames', round((f1 - f0) / FPS, 2), 's')


for name, path in JOBS:
    retarget(name, path)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('SAVED', OUT_BLEND)
