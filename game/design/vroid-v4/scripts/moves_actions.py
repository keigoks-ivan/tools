"""Add the jump / air / musou-leap / musou-flurry moveset on top of v4_musou.blend and write v4_moves.blend.

Same approach as musou_actions.py (sample retargeted candidates, key every non-hair bone, spring-bake the
hair), plus three things the new moves need:
  * time warps: each source is resampled through (game time -> source time) knots, so strikes land where
    the game expects them; the clip is then time-scaled by the game to the listed duration;
  * segment joins: the flurry is several source windows joined by short smoothstep crossfades;
  * Hips clean-up: horizontal Hips translation is removed (the game moves the hero), and for jump / airSlash /
    plunge the upward jump height is soft-clamped (the game lifts the whole hero on its own arc).

Game durations (s) and native frames at the scene's 24 fps are in CLIPS. Native frames are denser than
game-duration x 24 for the fast clips so the blade arc keeps enough keys after the game speeds it up.
"""
import sys, os, math, bpy  # noqa
from mathutils import Quaternion, Vector, Matrix
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _SCRIPT_DIR)
HERE = os.environ.get('VROID_V4_WORK', os.path.join(os.path.dirname(_SCRIPT_DIR), 'work')) + '/'
os.makedirs(HERE, exist_ok=True)
import springbake as SB

SRC_FPS = 30                      # candidate actions were retargeted at 30 fps
HIPS = 'J_Bip_C_Hips'
STAND_Z = 0.96                    # standing Hips height of the Mixamo great-sword clips (armature space)
LEGS = [f'J_Bip_{s}_{b}' for s in 'LR' for b in ('UpperLeg', 'LowerLeg', 'Foot', 'ToeBase')]

bpy.ops.wm.open_mainfile(filepath=HERE + 'v4_musou.blend')
scene = bpy.context.scene
FPS = scene.render.fps
rig = bpy.data.objects['Armature']
LOADS = {'v4_candidates.blend': ['sns_combo', 'gs_slash2', 'gs_highspin', 'gs_powerup', 'outward', 'gs_jumpattack', 'spin360'],
         'v4_cand3.blend': ['gs_jump2', 'gs_casting']}   # v4_cand3 = retargets of great sword jump (2) / casting
loaded = []
for fn, names in LOADS.items():
    with bpy.data.libraries.load(HERE + fn, link=False) as (src, dst):
        dst.actions = names
    loaded += list(dst.actions)
RAW = {a.name: a for a in loaded}

chain_bones = {b for c in SB.CHAINS for b in c}
BONES = [pb.name for pb in rig.pose.bones if pb.name not in chain_bones]
hb = rig.data.bones[HIPS]
H_REST = hb.matrix_local.copy()             # Hips parent (Root) is never posed: armature matrix = rest @ basis
H_R = H_REST.to_3x3(); H_Q = H_R.to_quaternion(); H_T = H_REST.translation.copy()

_cache = {}
def sample(act, t):
    """Pose of `act` at source time t (s): {bone: (quat, loc)} in pose-bone basis space."""
    key = (act, round(t * SRC_FPS * 8) / 8)
    if key in _cache:
        return _cache[key]
    a = RAW[act]
    f0, f1 = a.frame_range
    fr = min(max(key[1], f0), f1)
    rig.animation_data.action = a
    if hasattr(rig.animation_data, 'action_slot') and a.slots:
        rig.animation_data.action_slot = a.slots[0]
    scene.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
    pose = {n: (rig.pose.bones[n].rotation_quaternion.copy(), rig.pose.bones[n].location.copy()) for n in BONES}
    _cache[key] = pose
    return pose


def facing(pose):
    q, _ = pose[HIPS]
    fw = (H_Q @ q) @ Vector((0, 0, 1))
    return math.degrees(math.atan2(fw.y, fw.x))


def warp(seg, t):
    """Game time -> source time through the segment's knots; linear extrapolation with the end slopes."""
    k = seg['knots']
    if len(k) == 1:
        r = seg.get('rate', 1.3)
        return k[0][1] + (t - k[0][0]) * r
    if t <= k[0][0]:
        r = seg.get('rate_in', (k[1][1] - k[0][1]) / (k[1][0] - k[0][0]))
        return k[0][1] + (t - k[0][0]) * r
    for (a0, s0), (a1, s1) in zip(k, k[1:]):
        if t <= a1:
            return s0 + (s1 - s0) * (t - a0) / (a1 - a0)
    r = seg.get('rate_out', (k[-1][1] - k[-2][1]) / (k[-1][0] - k[-2][0]))
    return k[-1][1] + (t - k[-1][0]) * r


def yaw_q(deg):
    return Quaternion((0, 0, 1), math.radians(deg))


def seg_pose(seg, t, yaw):
    p = sample(seg['act'], warp(seg, t))
    if seg.get('legs'):                                   # airborne legs from another source
        lp = sample(seg['legs'][0], seg['legs'][1])
        p = dict(p)
        for n in LEGS:
            p[n] = lp[n]
        if seg.get('legs_hips_z'):
            p['_hz'] = lp[HIPS]
    q, loc = p[HIPS]
    # rotate the whole body about world up: basis' = R_rest^-1 Rz R_rest basis
    q2 = (H_Q.inverted() @ yaw_q(yaw) @ H_Q @ q).normalized()
    out = dict(p)
    out[HIPS] = (q2, loc)
    return out


def blend(pa, pb, w):
    out = {}
    for n in BONES:
        qa, la = pa[n]; qb, lb = pb[n]
        if qa.dot(qb) < 0:
            qb = -qb
        out[n] = (qa.slerp(qb, w), la.lerp(lb, w))
    if '_hz' in pa or '_hz' in pb:
        out['_hz'] = pa.get('_hz') or pb.get('_hz')
    return out


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def wrap(d):
    return (d + 180) % 360 - 180


class Timeline:
    """Segments on a game-time axis, joined at `joins` with crossfades of width `xf`."""
    def __init__(self, segs, joins, xf=0.1, yaw0=0.0, yaw_end=None, ramp=None):
        self.segs, self.joins, self.xf = segs, joins, xf
        # per-segment body yaw so that facing is continuous across each join
        yaws = [yaw0 if segs[0].get('yaw') is None else segs[0]['yaw']]
        for i, J in enumerate(joins):
            fa = facing(sample(segs[i]['act'], warp(segs[i], J))) + yaws[i]
            fb = facing(sample(segs[i + 1]['act'], warp(segs[i + 1], J)))
            yaws.append(segs[i + 1]['yaw'] if segs[i + 1].get('yaw') is not None else fa - fb)
        # unwrap so consecutive yaws differ by < 180
        for i in range(1, len(yaws)):
            yaws[i] = yaws[i - 1] + wrap(yaws[i] - yaws[i - 1])
        self.ramp = None
        if yaw_end is not None:                            # spread the residual over [ramp0, ramp1]
            resid = wrap(yaw_end - yaws[-1])
            self.ramp = (ramp[0], ramp[1], resid)
        self.yaws = yaws

    def yaw_at(self, i, t):
        y = self.yaws[i]
        if self.ramp:
            r0, r1, resid = self.ramp
            y += resid * min(max((t - r0) / (r1 - r0), 0), 1)
        return y

    def pose(self, t):
        J = self.joins
        i = sum(1 for j in J if t >= j)
        p = seg_pose(self.segs[i], t, self.yaw_at(i, t))
        # crossfade with a neighbour when inside a join window
        for k, j in enumerate(J):
            if abs(t - j) < self.xf / 2:
                w = smooth((t - (j - self.xf / 2)) / self.xf)
                pa = seg_pose(self.segs[k], t, self.yaw_at(k, t))
                pb = seg_pose(self.segs[k + 1], t, self.yaw_at(k + 1, t))
                p = blend(pa, pb, w)
        return p


def hips_fix(pose, clamp_up):
    """Remove horizontal Hips travel; optionally soft-clamp the upward jump height."""
    q, loc = pose[HIPS]
    if '_hz' in pose:
        loc = pose['_hz'][1]
    d = H_R @ loc                                          # armature-space offset from the rest head
    z = H_T.z + d.z
    if clamp_up and z > STAND_Z:
        z = STAND_Z + 0.13 * math.tanh((z - STAND_Z) / 0.13)
    d = Vector((0.0, 0.0, z - H_T.z))
    return q, H_R.inverted() @ d


def write(name, tl, t0, t1, frames, clamp_up):
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    # sample every pose first: sampling switches the rig to the source actions
    poses = [tl.pose(t0 + (t1 - t0) * k / frames) for k in range(frames + 1)]
    out = bpy.data.actions.new(name)
    out.use_fake_user = True
    rig.animation_data.action = out
    prev = {}
    for k, pose in enumerate(poses):
        q_h, loc_h = hips_fix(pose, clamp_up)
        for n in BONES:
            pb = rig.pose.bones[n]
            pb.rotation_mode = 'QUATERNION'
            q = q_h if n == HIPS else pose[n][0]
            if n in prev and prev[n].dot(q) < 0:
                q = -q
            prev[n] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=k, group=n)
            if n == HIPS:
                pb.location = loc_h
                pb.keyframe_insert('location', frame=k, group=n)
    n = SB.bake(rig, out, loop=False)
    print('MOVE', name, 'game', round(t1 - t0, 3), 's native', frames, 'frames', round(frames / FPS, 3), 's spring', n)
    return out


# ---------------------------------------------------------------- clips (all times in game seconds)
# jump (0.8 s): gs_jump2 (vertical great-sword jump). Push-off in the first 0.07 s (the game lifts at once),
# tuck peak at 0.40, legs reach for the ground at 0.74, touch-down absorb at 0.80.
JUMP = Timeline([dict(act='gs_jump2', knots=[(0.0, 0.03), (0.07, 0.13), (0.40, 0.40), (0.74, 0.67), (0.80, 0.76)])], [])

# airSlash (0.32 s, hit at 0.10): outward horizontal cut, right-behind -> front -> left, legs held in the
# jump tuck (gs_jump2 at 0.40 s) and Hips height from that tuck.
AIR = Timeline([dict(act='outward', knots=[(0.0, 0.74), (0.10, 0.90), (0.32, 1.14)],
                     legs=('gs_jump2', 0.40), legs_hips_z=True)], [])

# plunge (0.5 s): sns_combo's jump-slam. 0-0.18 the body comes down from the air with the blade over the head
# and slams it into the ground in front, impact (kneel, blade on the ground) at 0.18, hold to 0.28, rise to guard.
PLUNGE = Timeline([dict(act='sns_combo', knots=[(0.0, 2.33), (0.18, 2.57), (0.28, 2.75), (0.50, 3.35)])], [], yaw0=20.0)

# gs_jumpattack (2.17 s @ 30 fps, source frames 0-65): crouch 0-0.23, corkscrew launch/spin to ~1.03,
# lunge-and-connect at 1.23 (deepest/fastest downward reach, measured on the sword hand), then a second
# wind-up and a solid two-footed landing with the blade held high by 2.17. gs_jumpattack's own native body
# facing sits ~20 deg off this rig's "straight ahead" (same offset sns_combo needed for PLUNGE's slam).
GS_JUMPATTACK_YAW = 20.0

# musouLeap (0.3 s game time): takeoff + the corkscrew airborne spin, ending just before the lunge that
# connects (source frame 31, i.e. before the deepest reach at frame 37). Runs during the game's 0.3x slow-mo,
# so it's authored native-dense (32 native frames covering all 32 source frames 1:1) rather than at 1x pace
# like the other moves -- game duration alone would make it a blur.
LEAP = Timeline([dict(act='gs_jumpattack', knots=[(0.0, 0.0), (0.3, 31 / 30)])], [], yaw0=GS_JUMPATTACK_YAW)

# musouFinish (0.6 s): picks up gs_jumpattack just before the lunge (frame 35) so the blade connects almost
# immediately (frame 37 at game t=0.03), lands into the wide-stance blade-raised pose by 0.25 (frame 50),
# then only settles slightly (frame 50 -> 53) through to t=0.6 -- it holds that strong landed pose instead
# of relaxing all the way to gs_jumpattack's own calm ending (frame 65). Distinct from PLUNGE's kneel-slam.
FINISH = Timeline([dict(act='gs_jumpattack', knots=[(0.0, 35 / 30), (0.03, 37 / 30), (0.25, 50 / 30), (0.6, 53 / 30)])], [],
                  yaw0=GS_JUMPATTACK_YAW)

# musouFlurry (3.6 s): wind-up 0-0.55, strikes at 0.55 + 0.3k (k = 0..9), then a crouch-and-anticipate tail
# 3.37-3.60 (gs_jumpattack's own pre-launch crouch) instead of running into the old slam finisher.
H = [0.55 + 0.3 * k for k in range(10)]
MUSOU_SEGS = [
    dict(act='gs_powerup', knots=[(0.0, 0.10), (0.40, 0.55)]),                          # power-up raise
    dict(act='sns_combo', knots=[(H[0], 0.67), (H[1], 0.90), (H[2], 1.23)]),           # strikes 1-3
    dict(act='gs_highspin', knots=[(H[3], 0.43)], rate=1.4),                            # spin strike 4
    dict(act='gs_highspin', knots=[(H[4], 1.07)], rate=1.4),                            # overhead strike 5
    dict(act='gs_slash2', knots=[(H[5], 1.70)]),                                        # strike 6
    dict(act='gs_slash2', knots=[(H[6], 2.60)]),                                        # strike 7
    dict(act='outward', knots=[(H[7], 0.88)]),                                          # strike 8
    dict(act='spin360', knots=[(H[8], 32 / 30)], rate=1.4),                             # strike 9: spin360's fastest burst
    dict(act='gs_highspin', knots=[(H[9], 0.43)]),                                      # strike 10
    dict(act='gs_jumpattack', knots=[(3.37, 0.03), (3.60, 0.23)]),                      # crouch, about to leap
]
MUSOU_JOINS = [0.38, 1.30, 1.60, 1.90, 2.20, 2.50, 2.80, 3.10, 3.37]

if __name__ == '__main__':
    tl = Timeline(MUSOU_SEGS, MUSOU_JOINS, xf=0.16, yaw0=0.0)
    # facing is chained across joins; the residual to gs_jumpattack's own +20 deg correction (see
    # GS_JUMPATTACK_YAW) is spread across the flurry so the crouch tail settles facing forward, not slam-yaw
    resid = wrap(GS_JUMPATTACK_YAW - tl.yaws[-1])
    tl.ramp = (0.40, 3.60, resid)
    print('MUSOU yaws', [round(y) for y in tl.yaws], 'resid', round(resid))
    MUSOU = tl

    write('jump', JUMP, 0.0, 0.80, 19, clamp_up=True)
    write('airSlash', AIR, 0.0, 0.32, 16, clamp_up=True)
    write('plunge', PLUNGE, 0.0, 0.50, 18, clamp_up=True)
    write('musouLeap', LEAP, 0.0, 0.3, 32, clamp_up=False)
    write('musouFinish', FINISH, 0.0, 0.6, 20, clamp_up=False)
    write('musouFlurry', MUSOU, 0.0, 3.60, 130, clamp_up=False)

    for a in loaded:
        bpy.data.actions.remove(a)
    rig.animation_data.action = bpy.data.actions['idle']
    scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=HERE + 'v4_moves.blend')
    print('MOVES_SAVED', sorted(a.name for a in bpy.data.actions))
