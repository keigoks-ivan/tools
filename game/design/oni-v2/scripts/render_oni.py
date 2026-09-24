"""Review renders for the oni (toon two-band + ink outline, dark slate background).

  Blender -b --python render_oni.py -- <job> [args]
jobs: turn  (grunt+boss front/side/back A-pose), head, poses, game, all
"""
import os as _os
_REPO = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..', '..', '..', '..'))  # repo root
import bpy, sys, os, math
from mathutils import Vector, Quaternion, Matrix, Euler
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
WORK = os.environ.get('ONI_V2_WORK', os.path.join(os.path.dirname(HERE), 'work'))
BLEND = os.path.join(WORK, 'oni_project.blend')
OUT = os.path.join(WORK, 'renders')
os.makedirs(OUT, exist_ok=True)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['all']
BOSS_SCALE = 1.35


# ------------------------------------------------------------------ look
def toon_material(src):
    """Two-band toon + rim + emissive from the same atlas (review look approximating the game shader)."""
    m = bpy.data.materials.new('OniToon')
    m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links; N.clear()
    base = src.node_tree.nodes['BaseTex'].image; emit = src.node_tree.nodes['EmitTex'].image
    out = N.new('ShaderNodeOutputMaterial')
    t1 = N.new('ShaderNodeTexImage'); t1.image = base
    t2 = N.new('ShaderNodeTexImage'); t2.image = emit
    diff = N.new('ShaderNodeBsdfDiffuse'); diff.inputs['Color'].default_value = (1, 1, 1, 1); s2r = N.new('ShaderNodeShaderToRGB'); L.new(diff.outputs[0], s2r.inputs[0])
    bw = N.new('ShaderNodeRGBToBW'); L.new(s2r.outputs[0], bw.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    e = ramp.color_ramp.elements
    e[0].position = 0; e[0].color = (0.56, 0.52, 0.68, 1)
    e[1].position = 0.36; e[1].color = (1, 1, 1, 1)
    L.new(bw.outputs[0], ramp.inputs[0])
    mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
    L.new(t1.outputs['Color'], mul.inputs['A']); L.new(ramp.outputs['Color'], mul.inputs['B'])
    # rim light (cool violet), scaled by surface brightness a little so dark hide keeps its value
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    rr = N.new('ShaderNodeMapRange'); rr.inputs['From Min'].default_value = 0.74; rr.inputs['From Max'].default_value = 0.8
    rr.inputs['To Max'].default_value = 0.07
    L.new(lw.outputs['Facing'], rr.inputs['Value'])
    add = N.new('ShaderNodeMix'); add.data_type = 'RGBA'; add.blend_type = 'ADD'
    L.new(rr.outputs['Result'], add.inputs['Factor']); L.new(mul.outputs['Result'], add.inputs['A'])
    add.inputs['B'].default_value = (0.55, 0.45, 0.85, 1)
    em = N.new('ShaderNodeMix'); em.data_type = 'RGBA'; em.blend_type = 'ADD'; em.inputs['Factor'].default_value = 1.2
    L.new(add.outputs['Result'], em.inputs['A']); L.new(t2.outputs['Color'], em.inputs['B'])
    sh = N.new('ShaderNodeEmission'); L.new(em.outputs['Result'], sh.inputs[0])
    L.new(sh.outputs[0], out.inputs[0])
    m.use_backface_culling = True
    return m


def outline_mat():
    m = bpy.data.materials.get('Ink') or bpy.data.materials.new('Ink')
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission')
    e.inputs[0].default_value = (0.03, 0.02, 0.05, 1); nt.links.new(e.outputs[0], o.inputs[0])
    m.use_backface_culling = True
    return m


def apply_look(ob, thick=0.008):
    src = ob.data.materials[0]
    tm = bpy.data.materials.get('OniToon') or toon_material(src)
    ob.data.materials[0] = tm
    if 'Ink' not in [m.name for m in ob.data.materials if m]:
        ob.data.materials.append(outline_mat())
    mod = ob.modifiers.get('Ink outline') or ob.modifiers.new('Ink outline', 'SOLIDIFY')
    mod.thickness = -thick; mod.offset = 1; mod.use_flip_normals = True; mod.use_rim = False
    mod.material_offset = len(ob.data.materials) - 1; mod.use_quality_normals = True


def setup_scene(res, bg=(0.055, 0.052, 0.07)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.get('slate') or bpy.data.worlds.new('slate'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (*bg, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    sc.world = w
    if 'key' not in bpy.data.objects:
        sun = bpy.data.lights.new('key', 'SUN'); sun.energy = 3.2
        so = bpy.data.objects.new('key', sun); sc.collection.objects.link(so)
        so.rotation_euler = (math.radians(45), 0, math.radians(-32))
    cam = bpy.data.objects.get('cam')
    if cam is None:
        cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def aim(cam, loc, target, ortho=None, lens=None):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else:
        cam.data.type = 'PERSP'; cam.data.lens = lens or 50
    cam.data.clip_end = 200


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('wrote', path)


# ------------------------------------------------------------------ rig helpers
def pose_world(rig, deltas):
    """deltas: {bone: Quaternion world-space delta}; unspecified bones follow their parent."""
    tot = {}
    for b in rig.data.bones:  # parents come first in creation order
        pass
    order = []
    def walk(b):
        order.append(b); [walk(c) for c in b.children]
    for b in rig.data.bones:
        if b.parent is None:
            walk(b)
    for b in order:
        pb = rig.pose.bones[b.name]; pb.rotation_mode = 'QUATERNION'
        R = b.matrix_local.to_quaternion()
        par = tot.get(b.parent.name, Quaternion()) if b.parent else Quaternion()
        D = deltas.get(b.name, par)
        tot[b.name] = D
        pb.rotation_quaternion = (R.inverted() @ par.inverted() @ D @ R).normalized()
        pb.location = (0, 0, 0)


def apose(rig, down=58):
    Q = lambda ax, deg: Quaternion(ax, math.radians(deg))
    d = {}
    for side, s in (('Left', 1), ('Right', -1)):
        arm = Q((0, 1, 0), s * down) @ Q((0, 0, 1), s * 4)
        d[f'mixamorig{side}Arm'] = arm
        d[f'mixamorig{side}ForeArm'] = Q((0, 1, 0), s * (down + 6)) @ Q((0, 0, 1), s * 12)
        hand = Q((0, 1, 0), s * (down + 10)) @ Q((0, 0, 1), s * 12)
        d[f'mixamorig{side}Hand'] = hand
    pose_world(rig, d)
    import retarget_oni
    for pb in rig.pose.bones:
        if any(f'Hand{f}' in pb.name for f in ('Index', 'Middle', 'Ring', 'Thumb')):
            pb.rotation_quaternion = retarget_oni.claw_pose(pb.name)


def clear_anim(rig):
    if rig.animation_data:
        rig.animation_data.action = None


def get_objs():
    rig = bpy.data.objects['OniRig']
    g = bpy.data.objects['oni_grunt']; b = bpy.data.objects['oni_boss']
    return rig, g, b


def make_instance(rig, mesh_ob, name, loc=(0, 0, 0), rot_z=0.0, scale=1.0):
    """Duplicate rig + one mesh so several enemies can hold different poses."""
    r2 = rig.copy(); r2.data = rig.data; r2.name = name + '_rig'
    if rig.animation_data and rig.animation_data.action:
        r2.animation_data.action = rig.animation_data.action
    bpy.context.scene.collection.objects.link(r2)
    m2 = mesh_ob.copy(); m2.name = name; m2.parent = r2
    bpy.context.scene.collection.objects.link(m2)
    m2.modifiers['Armature'].object = r2
    r2.location = loc; r2.rotation_euler = (0, 0, rot_z); r2.scale = (scale,) * 3
    return r2, m2


def set_action(rig, name, frame):
    if rig.animation_data is None:
        rig.animation_data_create()
    act = bpy.data.actions[name]
    rig.animation_data.action = act
    if hasattr(rig.animation_data, 'action_slot') and act.slots:
        rig.animation_data.action_slot = act.slots[0]
    rig['_frame'] = frame


def eval_frame(frame):
    bpy.context.scene.frame_set(int(frame), subframe=frame - int(frame))
    bpy.context.view_layer.update()


# ------------------------------------------------------------------ jobs
def job_turn():
    rig, g, b = get_objs()
    clear_anim(rig)
    apose(rig)
    for o in (g, b):
        apply_look(o)
    cam = setup_scene((560, 1024))
    paths = {}
    for who, ob, sc in (('grunt', g, 1.0), ('boss', b, BOSS_SCALE)):
        g.hide_render = who != 'grunt'; b.hide_render = who != 'boss'
        rig.scale = (sc,) * 3
        H = 2.3 * sc
        for view, loc in (('front', (0, -10, H / 2)), ('side', (10, 0, H / 2)), ('back', (0, 10, H / 2))):
            aim(cam, loc, (0, 0, H / 2), ortho=H * 1.02)
            p = os.path.join(OUT, f'turn_{who}_{view}.png'); render(p); paths[(who, view)] = p
    rig.scale = (1, 1, 1)
    g.hide_render = b.hide_render = False


def job_head():
    rig, g, b = get_objs()
    clear_anim(rig); apose(rig)
    apply_look(g, 0.0025); apply_look(b, 0.0025)
    cam = setup_scene((1024, 1024))
    b.hide_render = True
    aim(cam, (-0.95, -1.45, 2.05), (0, -0.13, 1.83), lens=85)
    render(os.path.join(OUT, 'head_34_grunt.png'))
    aim(cam, (0.0, -1.75, 1.86), (0, -0.13, 1.83), lens=85)
    render(os.path.join(OUT, 'head_front_grunt.png'))
    aim(cam, (1.7, -0.08, 1.86), (0, -0.08, 1.83), lens=85)
    render(os.path.join(OUT, 'head_side_grunt.png'))
    b.hide_render = False; g.hide_render = True
    rig.scale = (BOSS_SCALE,) * 3
    c = Vector((0, -0.12, 1.86)) * BOSS_SCALE
    aim(cam, c + Vector((-1.25, -1.9, 0.25)), c + Vector((0, 0, 0.06)), lens=85)
    render(os.path.join(OUT, 'head_34_boss.png'))
    rig.scale = (1, 1, 1); g.hide_render = False


POSES = [  # (label, action, frame) -- 30 fps Mixamo clips
    ('windup', 'attack', 30), ('strike', 'attack', 40), ('hit', 'hit', 9), ('knockback', 'hitbig', 14), ('run', 'run', 6),
    ('death', 'death', 60),
]


def job_poses(poses=None):
    rig, g, b = get_objs()
    apply_look(g); b.hide_render = True
    cam = setup_scene((820, 1024))
    for label, act, fr in (poses or POSES):
        set_action(rig, act, fr); eval_frame(fr)
        # frame the posed character (hips may have moved)
        hip = rig.matrix_world @ rig.pose.bones['mixamorigHips'].head
        tgt = Vector((hip.x, hip.y, 1.0))
        aim(cam, tgt + Vector((-1.75, -2.45, 0.45)), tgt, lens=40)
        render(os.path.join(OUT, f'pose_{label}.png'))
        for view, off in (('side', Vector((3.1, 0, 0.3))),):
            aim(cam, tgt + off, tgt, lens=40)
            render(os.path.join(OUT, f'pose_{label}_{view}.png'))


def job_detail():
    """Deformation close-ups: shoulder in the wind-up, knee/hock in the run, hips in the strike."""
    rig, g, b = get_objs()
    apply_look(g, 0.004); b.hide_render = True
    cam = setup_scene((900, 900))
    def wp(bn, tail=False):
        pb = rig.pose.bones[bn]
        return rig.matrix_world @ (pb.tail if tail else pb.head)
    for label, act, fr, bone, off in (
            ('shoulder_windup', 'slash1', 10, 'mixamorigRightArm', Vector((-0.9, -1.0, 0.25))),
            ('shoulder_windup_back', 'slash1', 10, 'mixamorigRightArm', Vector((-0.6, 1.2, 0.3))),
            ('knee_run', 'run', 3, 'mixamorigLeftLeg', Vector((1.3, -0.7, 0.1))),
            ('hips_strike', 'slash1', 16, 'mixamorigHips', Vector((-0.8, -1.4, 0.2))),
            ('hand_strike', 'slash1', 16, 'mixamorigRightHand', Vector((-0.5, -0.8, 0.2)))):
        set_action(rig, act, fr); eval_frame(fr)
        t = wp(bone)
        aim(cam, t + off, t, lens=50)
        render(os.path.join(OUT, f'detail_{label}.png'))


CLIP_NAMES = ['idle', 'idle2', 'walk', 'run', 'attack', 'attack2', 'hit', 'hitbig', 'knockdown', 'getup',
              'death', 'death2', 'roar', 'bossAttack', 'bossDeath']
BOSS_CLIPS = {'roar', 'bossAttack', 'bossDeath'}


def job_clips(names=None):
    """Contact sheet per clip: 5 evenly spaced samples, toon look, floor plane to expose penetration."""
    rig, g, b = get_objs()
    apply_look(g, 0.005); apply_look(b, 0.005)
    cam = setup_scene((380, 520))
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
    fl = bpy.context.active_object
    fm = bpy.data.materials.new('floorc'); fm.use_nodes = True; nt = fm.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    ck = nt.nodes.new('ShaderNodeTexChecker'); ck.inputs['Scale'].default_value = 24
    ck.inputs['Color1'].default_value = (0.03, 0.03, 0.06, 1); ck.inputs['Color2'].default_value = (0.05, 0.05, 0.09, 1)
    nt.links.new(ck.outputs['Color'], em.inputs[0]); nt.links.new(em.outputs[0], o.inputs[0]); fl.data.materials.append(fm)
    os.makedirs(os.path.join(OUT, 'clips'), exist_ok=True)
    for name in (names or CLIP_NAMES):
        boss = name in BOSS_CLIPS
        g.hide_render = boss; b.hide_render = not boss
        rig.scale = (BOSS_SCALE if boss else 1.0,) * 3
        act = bpy.data.actions[name]
        f0, f1 = act.frame_range
        for i in range(5):
            fr = f0 + (f1 - f0) * i / 4
            set_action(rig, name, fr); eval_frame(fr)
            hip = rig.matrix_world @ rig.pose.bones['mixamorigHips'].head
            s = rig.scale.x
            tgt = Vector((hip.x, hip.y, 0.9 * s))
            aim(cam, tgt + Vector((-2.3, -2.9, 0.35)) * s, tgt, lens=38)
            render(os.path.join(OUT, 'clips', f'{name}_{i}.png'))
            low = Vector((hip.x, hip.y, 0.75 * s))
            aim(cam, Vector((hip.x + 4.2 * s, hip.y, 0.12)), low, lens=38)
            render(os.path.join(OUT, 'clips', f'{name}_{i}_side.png'))
    rig.scale = (1, 1, 1)


def job_sheet(act, frames, tag):
    """Contact sheet renders of a clip (used to choose frames)."""
    rig, g, b = get_objs()
    apply_look(g); b.hide_render = True
    cam = setup_scene((360, 480))
    for fr in frames:
        set_action(rig, act, fr); eval_frame(fr)
        hip = rig.matrix_world @ rig.pose.bones['mixamorigHips'].head
        tgt = Vector((hip.x, hip.y, 1.0))
        aim(cam, tgt + Vector((-2.6, -3.6, 0.55)), tgt, lens=45)
        render(os.path.join(OUT, 'sheet', f'{tag}_{act}_{fr:03d}.png'))


def job_game():
    """Game camera: 3.7 m behind, 2.45 m up from a heroine-sized placeholder, 5-8 grunts + boss ahead."""
    rig, g, b = get_objs()
    apply_look(g, 0.004); apply_look(b, 0.004)
    g.hide_render = True; b.hide_render = True; g.hide_viewport = True; b.hide_viewport = True
    cam = setup_scene((1600, 900), bg=(0.006, 0.007, 0.02))
    sc = bpy.context.scene
    # floor: dark navy/violet wet stone with a faint paving grid
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    fl = bpy.context.active_object
    fm = bpy.data.materials.new('floor'); fm.use_nodes = True; nt = fm.node_tree; N = nt.nodes; L = nt.links; N.clear()
    o = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission')
    tc = N.new('ShaderNodeTexCoord'); br = N.new('ShaderNodeTexBrick')
    br.inputs['Color1'].default_value = (0.034, 0.034, 0.068, 1); br.inputs['Color2'].default_value = (0.028, 0.026, 0.058, 1)
    br.inputs['Mortar'].default_value = (0.014, 0.014, 0.03, 1); br.inputs['Scale'].default_value = 0.65
    br.inputs['Mortar Size'].default_value = 0.01
    L.new(tc.outputs['Object'], br.inputs['Vector']); L.new(br.outputs['Color'], em.inputs[0]); L.new(em.outputs[0], o.inputs[0])
    # distance fade to the fog colour
    fl.data.materials.append(fm)
    # fog via world volume-less trick: mist pass is overkill; rely on dark bg.
    # heroine placeholder: the real heroine glb scaled to 1.78 m
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=_os.path.join(_REPO, 'game/assets/heroes/rumi-v2.glb'))
    new = [ob for ob in bpy.data.objects if ob not in before]
    harm = [ob for ob in new if ob.type == 'ARMATURE'][0]
    for ob in new:
        if ob.type == 'MESH':
            for i, m in enumerate(ob.data.materials):
                pass
    hs = 1.78 / 160.0
    root = harm
    while root.parent:
        root = root.parent
    root.scale = (hs,) * 3 if root is harm else root.scale
    if root is not harm:
        harm.scale = (hs,) * 3
    root.rotation_mode = 'XYZ'
    root.rotation_euler = (root.rotation_euler.x, root.rotation_euler.y, root.rotation_euler.z + math.pi)
    print('HERO ROOT', root.name, root.type, tuple(root.rotation_euler), harm.parent)
    if harm.animation_data and bpy.data.actions.get('run'):
        pass
    hero = Vector((0, 0, 0))
    fwd = Vector((0, 1, 0))
    camloc = hero - fwd * 3.7 + Vector((0, 0, 2.45))
    focus = hero + fwd * 1.7 + Vector((0, 0, 0.84))
    aim(cam, camloc, focus, lens=None)
    cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(50)
    # enemies: a loose crescent 3-8 m ahead, facing the heroine
    placements = [(-1.4, 2.6, 'idle', 20), (1.1, 2.9, 'attack', 34), (-2.9, 4.1, 'walk', 8), (2.8, 4.3, 'idle2', 50),
                  (0.2, 4.9, 'hit', 9), (-1.3, 6.2, 'run', 10), (1.9, 6.6, 'attack2', 40)]
    for i, (x, y, act, fr) in enumerate(placements):
        r2, m2 = make_instance(rig, g, f'grunt{i}', (x, y, 0), rot_z=math.atan2(-x, y), scale=1.0)
        m2.hide_render = False; m2.hide_viewport = False
        set_action(r2, act, fr)
    rb, mb = make_instance(rig, b, 'boss', (0.3, 8.6, 0), rot_z=math.atan2(-0.3, 8.6), scale=BOSS_SCALE)
    mb.hide_render = False; mb.hide_viewport = False
    set_action(rb, 'roar', 60)
    # evaluate each rig at its own frame by baking the pose into the rig (per-instance frames)
    for ob in list(bpy.data.objects):
        if ob.type == 'ARMATURE' and ob.name.endswith('_rig'):
            fr = ob.get('_frame', 1)
            act = ob.animation_data.action
            sc.frame_set(int(fr)); bpy.context.view_layer.update()
            # copy evaluated pose to static rotations
            for pb in ob.pose.bones:
                pb.matrix_basis = pb.matrix_basis.copy()
            vals = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in ob.pose.bones}
            ob.animation_data.action = None
            for pb in ob.pose.bones:
                pb.location, pb.rotation_quaternion = vals[pb.name]
    render(os.path.join(OUT, 'game_view.png'))
    # a tighter crop view with the same camera but narrower lens to inspect silhouettes
    cam.data.angle_y = math.radians(28)
    aim(cam, camloc, hero + fwd * 4.5 + Vector((0, 0, 0.9)))
    render(os.path.join(OUT, 'game_view_zoom.png'))


if __name__ == '__main__':
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    job = ARGS[0]
    if job in ('turn', 'all'):
        job_turn()
    if job in ('head', 'all'):
        bpy.ops.wm.open_mainfile(filepath=BLEND); job_head()
    if job in ('poses', 'all'):
        bpy.ops.wm.open_mainfile(filepath=BLEND); job_poses()
    if job in ('game', 'all'):
        bpy.ops.wm.open_mainfile(filepath=BLEND); job_game()
    if job == 'detail':
        bpy.ops.wm.open_mainfile(filepath=BLEND); job_detail()
    if job == 'clips':
        bpy.ops.wm.open_mainfile(filepath=BLEND); job_clips(ARGS[1].split(',') if len(ARGS) > 1 else None)
    if job == 'sheet':
        os.makedirs(os.path.join(OUT, 'sheet'), exist_ok=True)
        job_sheet(ARGS[1], [int(x) for x in ARGS[2].split(',')], ARGS[3] if len(ARGS) > 3 else 's')
