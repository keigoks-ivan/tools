"""Offline secondary motion: simulate hair/braid bone chains as damped springs and bake them into actions.

Each chain is a list of bone names root->tip. Every frame the chain root follows its parent; each joint
tail is integrated with verlet (gravity, drag, stiffness toward the animated rest direction) and kept at
bone length, with a simple sphere collider around the torso and hips so the braid cannot pass through.
"""
import bpy, math
from mathutils import Vector, Matrix, Quaternion

CHAINS = [
    ['J_Sec_Hair1_07', 'J_Sec_Hair2_07', 'J_Sec_Hair3_07', 'J_Sec_Hair4_07', 'J_Sec_Hair5_07',
     'J_Sec_Hair6_07', 'J_Sec_Hair7_07', 'J_Sec_Hair8_07'],
    ['J_Sec_Hair1_08', 'J_Sec_Hair2_08', 'J_Sec_Hair3_08', 'J_Sec_Hair4_08', 'J_Sec_Hair5_08'],
    ['J_Sec_Hair1_09', 'J_Sec_Hair2_09', 'J_Sec_Hair3_09', 'J_Sec_Hair4_09', 'J_Sec_Hair5_09'],
    ['J_Sec_Hair1_10', 'J_Sec_Hair2_10', 'J_Sec_Hair3_10', 'J_Sec_Hair4_10'],
    ['J_Sec_Hair1_11', 'J_Sec_Hair2_11', 'J_Sec_Hair3_11', 'J_Sec_Hair4_11'],
]
# (bone, local offset along bone 0..1, radius) — collision spheres in the character's own pose
COLLIDERS = [('J_Bip_C_Hips', 0.5, 0.15), ('J_Bip_C_Spine', 0.5, 0.13), ('J_Bip_C_Chest', 0.5, 0.13),
             ('J_Bip_C_UpperChest', 0.4, 0.12), ('J_Bip_C_Head', 0.6, 0.11),
             ('J_Bip_L_UpperLeg', 0.3, 0.09), ('J_Bip_R_UpperLeg', 0.3, 0.09)]


def bake(rig, action, stiffness=0.06, drag=0.35, gravity=0.4, warmup=None, loop=True):
    rig.animation_data.action = action
    f0, f1 = int(action.frame_range[0]), int(action.frame_range[1])
    scene = bpy.context.scene
    Mw = rig.matrix_world
    pbs = rig.pose.bones
    # remove any previous keys on chain bones
    chain_bones = {b for c in CHAINS for b in c if b in pbs}
    for fc in list(action.fcurves) if hasattr(action, 'fcurves') else []:
        if any(f'"{b}"' in fc.data_path for b in chain_bones):
            action.fcurves.remove(fc)
    state = {}
    frames = list(range(f0, f1 + 1))
    results = {b: {} for b in chain_bones}
    for b in chain_bones:
        pbs[b].rotation_mode = 'QUATERNION'
        pbs[b].scale = (1, 1, 1); pbs[b].location = (0, 0, 0)
    # simulate one full pass first so looping clips start from a settled, periodic state
    warmup = len(frames) if warmup is None else warmup
    seq = [frames[0]] * 12 + frames + frames
    warmup = 12 + len(frames)
    if not loop:   # one-shot clips: settle on the first pose instead of wrapping the last frame into the first
        seq = [frames[0]] * 40 + frames
        warmup = 40
    Y = Vector((0, 1, 0))
    for step, f in enumerate(seq):
        scene.frame_set(f)
        for b in chain_bones:
            pbs[b].rotation_quaternion = Quaternion()
        bpy.context.view_layer.update()
        cols = []
        for bn, t, r in COLLIDERS:
            pb = pbs.get(bn)
            if pb:
                cols.append((pb.head.lerp(pb.tail, t), r))
        for chain in CHAINS:
            for ci, bn in enumerate([b for b in chain if b in pbs]):
                k_stiff = 0.3 if ci < 3 else 0.02    # stiff where the tie holds the ponytail, loose along the braid
                pb = pbs[bn]
                pb.rotation_quaternion = Quaternion()
                bpy.context.view_layer.update()
                M0 = pb.matrix.copy()                     # pose with identity basis (parent already solved)
                head = M0.translation.copy()
                q0 = M0.to_quaternion().normalized()
                d_cur = (q0 @ Y).normalized()
                L = pb.bone.length
                target = head + d_cur * L
                cur, prev = state.get(bn, (target, target))
                vel = (cur - prev) * (1 - drag)
                new = cur + vel + Vector((0, 0, -gravity * L)) + (target - cur) * k_stiff
                for c, rad in cols:
                    dv = new - c
                    if 1e-6 < dv.length < rad:
                        new = c + dv.normalized() * rad
                # floor: the character's feet define ground level in its own space
                floor = min(pbs['J_Bip_L_ToeBase'].head.z, pbs['J_Bip_R_ToeBase'].head.z, pbs['J_Bip_L_Foot'].head.z, pbs['J_Bip_R_Foot'].head.z) - 0.02
                if new.z < floor + 0.015:
                    new.z = floor + 0.015
                want = new - head
                if want.length < 1e-6 or L < 1e-6:
                    state[bn] = (target, target)
                    continue
                want.normalize()
                # limit swing so a single frame cannot fold the strand back on itself
                ang = d_cur.angle(want)
                if ang > math.radians(75):
                    want = d_cur.slerp(want, math.radians(75) / ang) if hasattr(d_cur, 'slerp') else want
                state[bn] = (head + want * L, cur)
                qw = d_cur.rotation_difference(want)
                basis = (q0.inverted() @ qw @ q0).normalized()
                pb.rotation_quaternion = basis
                bpy.context.view_layer.update()
                if step >= warmup:
                    results[bn][f] = basis.copy()
    # write keys
    for bn, keys in results.items():
        pb = pbs[bn]
        prevq = None
        for f, q in sorted(keys.items()):
            if prevq is not None and prevq.dot(q) < 0:
                q = -q
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=f, group=bn)
            prevq = q
    return len(frames)
