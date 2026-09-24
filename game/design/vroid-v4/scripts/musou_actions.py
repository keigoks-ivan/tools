"""Add the musou moveset to the animated project: trimmed Mixamo swings named for the game, spring-baked.

Windows (seconds at 30 fps) keep only the swing: a short wind-up before the first blade-speed peak and
the follow-through after the last one. The game plays each clip over the duration in MUSOU_CHAIN.
"""
import sys, os, bpy
from mathutils import Quaternion, Vector
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _SCRIPT_DIR)
HERE = os.environ.get('VROID_V4_WORK', os.path.join(os.path.dirname(_SCRIPT_DIR), 'work')) + '/'
os.makedirs(HERE, exist_ok=True)
import springbake as SB

MOVES = {  # game clip: (candidate action, start s, end s)
    'combo1': ('gs_slash1', 0.40, 1.00),
    'combo2': ('inward', 0.95, 1.50),
    'combo3': ('gs_slash4', 0.50, 1.50),
    'combo4': ('gs_highspin', 0.15, 1.25),
    'combo5': ('sns_combo', 0.45, 2.55),
    'charge': ('gs_jumpattack', 0.35, 1.60),
    'musou': ('gs_slash2', 0.50, 2.90),
}
FPS = 30

bpy.ops.wm.open_mainfile(filepath=HERE + 'v4_animated.blend')
scene = bpy.context.scene
rig = bpy.data.objects['Armature']
with bpy.data.libraries.load(HERE + 'v4_candidates.blend', link=False) as (src, dst):
    dst.actions = sorted({m[0] for m in MOVES.values()})
raw = {a.name: a for a in dst.actions}

chain_bones = {b for c in SB.CHAINS for b in c}
for game, (cand, t0, t1) in MOVES.items():
    source = raw[cand]
    rig.animation_data.action = source
    if hasattr(rig.animation_data, 'action_slot') and source.slots:
        rig.animation_data.action_slot = source.slots[0]
    f0, f1 = round(t0 * FPS), round(t1 * FPS)
    samples = []
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        bpy.context.view_layer.update()
        samples.append({pb.name: (pb.rotation_quaternion.copy(), pb.location.copy())
                        for pb in rig.pose.bones if pb.name not in chain_bones})
    out = bpy.data.actions.get(game) or bpy.data.actions.new(game)
    out.use_fake_user = True
    rig.animation_data.action = out
    prev = {}
    for k, pose in enumerate(samples):
        for name, (q, loc) in pose.items():
            pb = rig.pose.bones[name]
            pb.rotation_mode = 'QUATERNION'
            if name in prev and prev[name].dot(q) < 0:
                q = -q
            prev[name] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=k, group=name)
            if name == 'J_Bip_C_Hips':
                pb.location = loc
                pb.keyframe_insert('location', frame=k, group=name)
    n = SB.bake(rig, out)
    print('MOVE', game, cand, len(samples), 'frames', 'spring', n)

for a in dst.actions:
    bpy.data.actions.remove(a)
rig.animation_data.action = bpy.data.actions['idle']
scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=HERE + 'v4_musou.blend')
print('MUSOU_SAVED', sorted(a.name for a in bpy.data.actions))
