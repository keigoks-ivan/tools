"""Retarget the 13 Mixamo clips onto the costumed VRoid project, lock a sword grip, bake hair springs.

Retarget math is the calibrated world-rotation-delta transfer from retarget_vroid.py (reused as a module).
"""
import sys, os, math, bpy
from mathutils import Matrix, Quaternion, Vector

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _SCRIPT_DIR)
HERE = os.environ.get('VROID_V4_WORK', os.path.join(os.path.dirname(_SCRIPT_DIR), 'work')) + '/'
os.makedirs(HERE, exist_ok=True)
import retarget_vroid as R
import swordlib as SW
import springbake as SB

SRC = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else HERE + 'v4_project.blend'
OUT = HERE + 'v4_animated.blend'
CLIPS = R.CLIP_NAMES

bpy.ops.wm.open_mainfile(filepath=SRC)
scene = bpy.context.scene
scene.render.fps = 24
tgt = bpy.data.objects['Armature']

# ---- grip pose (local rotations) captured from the design helper, then reset
for pb in tgt.pose.bones:
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = Quaternion(); pb.location = Vector()
bpy.context.view_layer.update()
SW.grip_right_hand(tgt)
GRIP_BONES = [f'J_Bip_R_{f}{i}' for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Little') for i in (1, 2, 3)]
grip = {b: tgt.pose.bones[b].matrix_basis.to_quaternion() for b in GRIP_BONES}
for pb in tgt.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()

# ---- source rig
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=R.SOURCE_GLB)
new = [o for o in bpy.data.objects if o not in before]
src = next(o for o in new if o.type == 'ARMATURE')
for clip in CLIPS:
    a = bpy.data.actions.get(clip)
    if a:
        a.name = f'SRC_{clip}'

source_rest = R.get_all_rest_data(src)
target_rest = R.get_all_rest_data(tgt)
rest_local = R.precompute_target_rest_locals(target_rest)
calib = R.compute_calibration(source_rest, target_rest)
cal_rest = {n: (calib[n] @ d['rot']) if n in calib else d['rot'] for n, d in target_rest.items()}
src_g = R.ground_z(src, 'mixamorigLeftToeBase', 'mixamorigRightToeBase')
tgt_g = R.ground_z(tgt, 'J_Bip_L_ToeBase', 'J_Bip_R_ToeBase')
hip_ratio = (tgt.data.bones[R.TGT_HIPS].head_local.z - tgt_g) / (src.data.bones[R.SRC_HIPS].head_local.z - src_g)
print('HIP_RATIO', hip_ratio)
src_hips_rest = source_rest[R.SRC_HIPS]['loc'].copy()
tgt_hips_rest = target_rest[R.TGT_HIPS]['loc'].copy()
hp = target_rest[R.TGT_HIPS]['parent']
Wp_hips = target_rest[hp]['matrix']
rl_hips = Wp_hips.inverted() @ target_rest[R.TGT_HIPS]['matrix']
for _, t in R.MAPPING:
    tgt.pose.bones[t].rotation_mode = 'QUATERNION'
if tgt.animation_data is None:
    tgt.animation_data_create()
if src.animation_data is None:
    src.animation_data_create()


def key_frame(f, prev):
    world = {}
    for sn, tn in R.MAPPING:
        wl, wr, _ = src.pose.bones[sn].matrix.decompose()
        tw = (wr @ source_rest[sn]['rot'].inverted()) @ cal_rest[tn]
        tw.normalize(); world[tn] = tw
        par = target_rest[tn]['parent']
        wp = Quaternion() if par is None else world.get(par, target_rest[par]['rot'])
        mb = rest_local[tn].inverted() @ wp.inverted() @ tw
        mb.normalize()
        pb = tgt.pose.bones[tn]
        if tn in grip:
            mb = grip[tn].copy()
        if prev.get(tn) is not None and prev[tn].dot(mb) < 0:
            mb = -mb
        prev[tn] = mb.copy()
        if tn == R.TGT_HIPS:
            W = Matrix.Translation(tgt_hips_rest + (wl - src_hips_rest) * hip_ratio) @ tw.to_matrix().to_4x4()
            loc, rot, _ = (rl_hips.inverted() @ Wp_hips.inverted() @ W).decompose()
            if prev.get('hipfull') is not None and prev['hipfull'].dot(rot) < 0:
                rot = -rot
            prev['hipfull'] = rot.copy()
            pb.rotation_quaternion = rot; pb.location = loc
            pb.keyframe_insert('location', frame=f, group=tn)
        else:
            pb.rotation_quaternion = mb
        pb.keyframe_insert('rotation_quaternion', frame=f, group=tn)


# sword axis check: source blade tip direction vs ours, both in world space
src_sword = next(o for o in new if o.type == 'MESH' and 'sword' in o.name.lower())
blade = bpy.data.objects.get('Hero_sword blade')


def blade_dir_src():
    dg = bpy.context.evaluated_depsgraph_get()
    e = src_sword.evaluated_get(dg); me = e.to_mesh()
    pts = [src_sword.matrix_world @ v.co for v in me.vertices]
    e.to_mesh_clear()
    hand = src.matrix_world @ src.pose.bones['mixamorigRightHand'].head
    far = max(pts, key=lambda p: (p - hand).length)
    near = min(pts, key=lambda p: (p - hand).length)
    return (far - near).normalized()


def blade_dir_ours():
    dg = bpy.context.evaluated_depsgraph_get()
    e = blade.evaluated_get(dg); me = e.to_mesh()
    pts = [blade.matrix_world @ v.co for v in me.vertices]
    e.to_mesh_clear()
    hand = tgt.matrix_world @ tgt.pose.bones['J_Bip_R_Hand'].head
    far = max(pts, key=lambda p: (p - hand).length)
    near = min(pts, key=lambda p: (p - hand).length)
    return (far - near).normalized()


report = []
for clip in CLIPS:
    sa = bpy.data.actions[f'SRC_{clip}']
    src.animation_data.action = sa
    s, e = sa.frame_range
    frames = [s + i for i in range(int(math.floor(e - s + 1e-6)) + 1)]
    if abs(frames[-1] - e) > 1e-4:
        frames.append(e)
    act = bpy.data.actions.new(clip); act.use_fake_user = True
    tgt.animation_data.action = act
    prev = {}
    errs = []
    for f in frames:
        i = int(math.floor(f)); scene.frame_set(i, subframe=f - i); bpy.context.view_layer.update()
        key_frame(f, prev)
    for f in frames[::max(1, len(frames) // 6)]:
        i = int(math.floor(f)); scene.frame_set(i, subframe=f - i); bpy.context.view_layer.update()
        errs.append(math.degrees(blade_dir_src().angle(blade_dir_ours())))
    report.append((clip, len(frames), round(max(errs), 1), round(sum(errs) / len(errs), 1)))
    print('CLIP', clip, len(frames), 'sword angle err max/mean', report[-1][2:])

# drop the source rig before spring baking so its colliders/actions cannot leak into export
for o in new:
    bpy.data.objects.remove(o, do_unlink=True)
for a in [a for a in bpy.data.actions if a.name.startswith('SRC_')]:
    bpy.data.actions.remove(a)

if '--nospring' not in sys.argv:
    for clip in CLIPS:
        n = SB.bake(tgt, bpy.data.actions[clip])
        print('SPRING', clip, n)

tgt.animation_data.action = bpy.data.actions['idle']
scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('ANIM_SAVED', OUT, report)
