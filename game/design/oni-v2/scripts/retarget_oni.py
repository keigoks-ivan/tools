"""Bake test clips from the heroine's Mixamo rig (rumi-v2.glb) onto the oni rig.

World-space rotation-delta transfer (same method as retarget/retarget_vroid.py): for every bone that
exists in both rigs, delta = src_world @ src_rest^-1 is applied to the target's own rest, processed
parent-before-child. No calibration on legs/spine on purpose: the oni's hunched spine and digitigrade
rest pose are preserved and only the *motion* is transferred. Hips translation is scaled by hip height.
"""
import os as _os
_REPO = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..', '..', '..', '..'))  # repo root
import bpy, math, os
from mathutils import Matrix, Quaternion, Vector

SOURCE_GLB = _os.path.join(_REPO, 'game/assets/heroes/rumi-v2.glb')
CLIPS = ['idle', 'run', 'slash1', 'slash2', 'heavy', 'hurt', 'death']


def _rest(arm):
    d = {}
    for b in arm.data.bones:
        loc, rot, _ = b.matrix_local.decompose()
        d[b.name] = dict(m=b.matrix_local.copy(), rot=rot, loc=loc, parent=b.parent.name if b.parent else None)
    return d


def _order(arm):
    out = []
    def walk(b):
        out.append(b.name)
        for c in b.children:
            walk(c)
    for b in arm.data.bones:
        if b.parent is None:
            walk(b)
    return out


def claw_pose(n):
    """Local finger rotations for an open, hooked claw: spread + moderate curl (flex = local +X, toward the palm)."""
    s = 1 if 'Left' in n else -1
    seg = int(n[-1]) if n[-1].isdigit() else 4
    if 'Thumb' in n:
        return Quaternion((1, 0, 0), math.radians((10, 18, 18, 0)[seg - 1]))
    curl = (18, 26, 24, 0)[seg - 1]
    spread = {'Index': 12, 'Middle': 0, 'Ring': -12}.get(next(f for f in ('Index', 'Middle', 'Ring') if f in n), 0) if seg == 1 else 0
    return Quaternion((0, 0, 1), math.radians(spread * s)) @ Quaternion((1, 0, 0), math.radians(curl))


def retarget(tgt, clips=CLIPS, keep_source=False):
    before = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=SOURCE_GLB)
    new_objs = [o for o in bpy.data.objects if o not in before]
    src = [o for o in new_objs if o.type == 'ARMATURE'][0]
    src_actions = {a.name: a for a in bpy.data.actions if a not in before_actions}
    for a in src_actions.values():
        a.name = 'SRC_' + a.name
    sr, tr = _rest(src), _rest(tgt)
    FINGERS = ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')
    is_finger = lambda n: any(f'Hand{f}' in n for f in FINGERS)
    names = [n for n in _order(tgt) if n in sr and not is_finger(n)]
    finger_bones = [n for n in _order(tgt) if is_finger(n)]
    tr_local = {}
    for n, d in tr.items():
        pm = tr[d['parent']]['m'] if d['parent'] else Matrix.Identity(4)
        tr_local[n] = (pm.inverted() @ d['m']).to_quaternion()
    hips = 'mixamorigHips'
    src_ground = min(sr['mixamorigLeftToeBase']['loc'].z, sr['mixamorigRightToeBase']['loc'].z)
    tgt_ground = 0.0
    ratio = (tr[hips]['loc'].z - tgt_ground) / (sr[hips]['loc'].z - src_ground)
    print(f'retarget: {len(names)} shared bones, hip ratio {ratio:.5f}')
    for n in names:
        tgt.pose.bones[n].rotation_mode = 'QUATERNION'
    if tgt.animation_data is None:
        tgt.animation_data_create()
    if src.animation_data is None:
        src.animation_data_create()
    scene = bpy.context.scene
    scene.render.fps = 24
    made = []
    for clip in clips:
        sa = bpy.data.actions.get('SRC_' + clip)
        if sa is None:
            print('missing clip', clip); continue
        src.animation_data.action = sa
        f0, f1 = sa.frame_range
        frames = [f0 + i for i in range(int(math.floor(f1 - f0 + 1e-6)) + 1)]
        ta = bpy.data.actions.new(clip); ta.use_fake_user = True
        tgt.animation_data.action = ta
        prev = {}
        for f in frames:
            scene.frame_set(int(f)); bpy.context.view_layer.update()
            wr = {}
            for n in names:
                spb = src.pose.bones[n]
                wloc, wrot, _ = spb.matrix.decompose()
                delta = wrot @ sr[n]['rot'].inverted()
                tw = (delta @ tr[n]['rot']).normalized()
                wr[n] = tw
                par = tr[n]['parent']
                pw = wr.get(par, tr[par]['rot'] if par else Quaternion())
                q = (tr_local[n].inverted() @ pw.inverted() @ tw).normalized()
                if n in prev and prev[n].dot(q) < 0:
                    q = -q
                prev[n] = q
                pb = tgt.pose.bones[n]
                pb.rotation_quaternion = q
                pb.keyframe_insert('rotation_quaternion', frame=f)
                if n == hips:
                    disp = (wloc - sr[hips]['loc']) * ratio
                    # rest bone space: location is expressed in the bone's rest frame
                    R = tr[hips]['m'].to_3x3().inverted()
                    pb.location = R @ disp
                    pb.keyframe_insert('location', frame=f)
        # open, curved claw pose on the fingers (replaces the heroine's sword grip)
        for n in finger_bones:
            pb = tgt.pose.bones[n]; pb.rotation_mode = 'QUATERNION'
            q = claw_pose(n)
            pb.rotation_quaternion = q
            for f in (frames[0], frames[-1]):
                pb.keyframe_insert('rotation_quaternion', frame=f)
        made.append((clip, len(frames)))
    tgt.animation_data.action = bpy.data.actions.get('idle')
    if not keep_source:
        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)
        for a in list(bpy.data.actions):
            if a.name.startswith('SRC_'):
                bpy.data.actions.remove(a)
        for arm in list(bpy.data.armatures):
            if arm.users == 0:
                bpy.data.armatures.remove(arm)
        for me in list(bpy.data.meshes):
            if me.users == 0:
                bpy.data.meshes.remove(me)
        for m in list(bpy.data.materials):
            if m.users == 0:
                bpy.data.materials.remove(m)
        for im in list(bpy.data.images):
            if im.users == 0:
                bpy.data.images.remove(im)
    print('baked', made)
    return made


# ============================================================================ Mixamo FBX clips (pass 3)
MIXAMO_DIR = os.path.join(os.environ.get('ONI_V2_WORK', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work')), 'mixamo') + '/'
# game clip name -> (file role prefix, root-motion policy, ground mesh)
FBX_CLIPS = [
    ('idle', 'idle', 'strip', 'oni_grunt'), ('idle2', 'idle2', 'strip', 'oni_grunt'),
    ('walk', 'walk', 'strip', 'oni_grunt'), ('run', 'run', 'strip', 'oni_grunt'),
    ('attack', 'attack', 'strip', 'oni_grunt'), ('attack2', 'attack2', 'strip', 'oni_grunt'),
    ('hit', 'hit', 'strip', 'oni_grunt'), ('hitbig', 'hitbig', 'strip', 'oni_grunt'),
    ('knockdown', 'knockdown', 'strip', 'oni_grunt'), ('getup', 'getup', 'strip', 'oni_grunt'),
    ('death', 'death', 'keep', 'oni_grunt'), ('death2', 'death2', 'keep', 'oni_grunt'),
    ('roar', 'boss_roar', 'strip', 'oni_boss'), ('bossAttack', 'boss_attack', 'strip', 'oni_boss'),
    ('bossDeath', 'boss_death', 'keep', 'oni_boss'),
]
FOOT_KEYS = ('Foot', 'ToeBase', 'Toe_End')
# per-clip fixes: 'end' trims the clip (knockdown ends on its back so getup can follow), 'jump' scales airborne height
CLIP_OPTS = {'knockdown': {'end': 44}, 'bossAttack': {'jump': 0.4}}


def _fbx_path(prefix):
    import glob, os
    hits = [p for p in glob.glob(MIXAMO_DIR + '*.fbx') if os.path.basename(p).split('__')[0] == prefix]
    return hits[0]


def _import_fbx(path):
    before = set(bpy.data.objects); acts = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=True)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    for b in arm.data.bones:
        if ':' in b.name:
            b.name = 'mixamorig' + b.name.split(':', 1)[1]
    new_acts = [a for a in bpy.data.actions if a not in acts]
    return arm, new_acts[0], new, new_acts


def _mesh_min_z(ob):
    import numpy as np
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get('co', co)
    ev.to_mesh_clear()
    return float(co[2::3].min())


def retarget_fbx(tgt, clips=FBX_CLIPS, fps=30):
    scene = bpy.context.scene
    scene.render.fps = fps
    tr = _rest(tgt)
    tr_local = {}
    for n, d in tr.items():
        pm = tr[d['parent']]['m'] if d['parent'] else Matrix.Identity(4)
        tr_local[n] = (pm.inverted() @ d['m']).to_quaternion()
    FINGERS = ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')
    is_finger = lambda n: any(f'Hand{f}' in n for f in FINGERS)
    hips = 'mixamorigHips'
    Rh = tr[hips]['m'].to_3x3().inverted()
    if tgt.animation_data is None:
        tgt.animation_data_create()
    for pb in tgt.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    report = []
    for name, prefix, policy, ground_name in clips:
        ground = bpy.data.objects[ground_name]
        others = [o for o in tgt.children if o.type == 'MESH' and o is not ground]
        src, act, new_objs, new_acts = _import_fbx(_fbx_path(prefix))
        src.animation_data.action = act
        Ms = src.matrix_world
        sr = {}
        for b in src.data.bones:
            loc, rot, _ = (Ms @ b.matrix_local).decompose()
            sr[b.name] = {'loc': loc, 'rot': rot.normalized()}
        names = [n for n in _order(tgt) if n in sr and not is_finger(n)]
        fingers = [n for n in _order(tgt) if is_finger(n)]
        s_toe = min(sr['mixamorigLeftToeBase']['loc'].z, sr['mixamorigRightToeBase']['loc'].z)
        ratio = tr[hips]['loc'].z / (sr[hips]['loc'].z - s_toe + 0.02)
        foot_src = [n for n in sr if any(n.endswith(k) for k in FOOT_KEYS)]
        f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
        opts = CLIP_OPTS.get(name, {})
        if 'end' in opts:
            f1 = min(f1, f0 + opts['end'])
        jump = opts.get('jump', 1.0)
        ta = bpy.data.actions.get(name)
        if ta:
            bpy.data.actions.remove(ta)
        ta = bpy.data.actions.new(name); ta.use_fake_user = True
        tgt.animation_data.action = ta
        if hasattr(tgt.animation_data, 'action_slot') and ta.slots:
            tgt.animation_data.action_slot = ta.slots[0]
        prev = {}
        disp0 = None
        contact = []
        # pass 1: rotations + hips translation, record source contact height per frame
        for f in range(f0, f1 + 1):
            scene.frame_set(f)
            k = f - f0
            wr = {}
            for n in names:
                wl, wrot, _ = (Ms @ src.pose.bones[n].matrix).decompose()
                tw = (wrot @ sr[n]['rot'].inverted() @ tr[n]['rot']).normalized()
                wr[n] = tw
                par = tr[n]['parent']
                pw = wr.get(par, tr[par]['rot'] if par else Quaternion())
                q = (tr_local[n].inverted() @ pw.inverted() @ tw).normalized()
                if n in prev and prev[n].dot(q) < 0:
                    q = -q
                prev[n] = q
                pb = tgt.pose.bones[n]
                pb.rotation_quaternion = q
                pb.keyframe_insert('rotation_quaternion', frame=k)
                if n == hips:
                    disp = (wl - sr[hips]['loc']) * ratio
                    if disp0 is None:
                        disp0 = disp.copy()
                    if policy == 'strip':
                        disp.x, disp.y = disp0.x, disp0.y
                    if jump != 1.0 and disp.z > disp0.z:
                        disp.z = disp0.z + (disp.z - disp0.z) * jump
                    else:
                        disp.x, disp.y = disp.x * 0.6, disp.y * 0.6
                    pb.location = Rh @ disp
                    pb.keyframe_insert('location', frame=k)
            zs_foot = min((Ms @ src.pose.bones[n].head).z for n in foot_src)
            zs_all = min((Ms @ src.pose.bones[n].head).z for n in sr)
            contact.append((zs_foot - s_toe, zs_all - s_toe, zs_all < zs_foot - 0.03))
        for n in fingers:
            pb = tgt.pose.bones[n]
            pb.rotation_quaternion = claw_pose(n)
            for f in (0, f1 - f0):
                pb.keyframe_insert('rotation_quaternion', frame=f)
        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)
        for a in new_acts:
            bpy.data.actions.remove(a)
        # pass 2: ground correction from the evaluated mesh (feet planted, bodies on the floor, jumps kept)
        for o in others:
            o.hide_viewport = True
        dz = []
        for k in range(f1 - f0 + 1):
            scene.frame_set(k)
            zmin = _mesh_min_z(ground)
            hf, ha, body = contact[k]
            if body and ha < 0.25:
                desired = -0.06          # lying / kneeling: let spikes sink a little into the floor
            else:
                desired = max(0.0, hf - 0.03) * ratio * jump
            dz.append(desired - zmin)
        for o in others:
            o.hide_viewport = False
        sm = [0.25 * dz[max(0, i - 1)] + 0.5 * dz[i] + 0.25 * dz[min(len(dz) - 1, i + 1)] for i in range(len(dz))]
        pb = tgt.pose.bones[hips]
        for k, d in enumerate(sm):
            scene.frame_set(k)
            pb.location = pb.location + Rh @ Vector((0, 0, d))
            pb.keyframe_insert('location', frame=k)
        report.append((name, f1 - f0 + 1, round((f1 - f0) / fps, 2), round(min(dz), 3), round(max(dz), 3)))
        print('FBX', name, f1 - f0 + 1, 'frames', round((f1 - f0) / fps, 2), 's  ground dz', round(min(dz), 3), round(max(dz), 3))
    tgt.animation_data.action = bpy.data.actions.get('idle')
    scene.frame_set(0)
    return report
