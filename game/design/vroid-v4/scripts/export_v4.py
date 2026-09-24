"""Export the editable swordswoman project to a Three.js GLB.

Keeps: skinned meshes on the VRoid rig, a single skinned `Hero_sword`, the expression shape keys the
game needs, base-colour textures (WebP), and every Action on the armature as a glTF animation.
"""
import sys, os, bpy, bmesh
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_TEX = _HERE.parent / 'textures'
_WORK = Path(os.environ.get('VROID_V4_WORK', _HERE.parent / 'work'))
_WORK.mkdir(parents=True, exist_ok=True)
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = Path(args[0]) if args else _WORK / 'v4_project.blend'
OUT = Path(args[1]) if len(args) > 1 else _WORK / 'v4_test.glb'
KEEP_KEYS = {'Fcl_EYE_Close', 'Fcl_EYE_Angry', 'Fcl_BRW_Angry', 'Fcl_MTH_Fun', 'Fcl_MTH_Up',
             'Fcl_MTH_A', 'Fcl_EYE_Sorrow', 'Fcl_BRW_Sorrow', 'Fcl_MTH_Angry'}

bpy.ops.wm.open_mainfile(filepath=str(SRC))
scene = bpy.context.scene
rig = bpy.data.objects['Armature']

# 1. review-only modifiers never ship (the game draws its own outline)
for o in scene.objects:
    for m in list(o.modifiers):
        if m.name == 'Ink outline':
            o.modifiers.remove(m)
    if o.type == 'MESH':
        mats = o.data.materials
        for i in range(len(mats) - 1, -1, -1):
            if mats[i] and mats[i].name.startswith('Ink outline'):
                mats.pop(index=i)

# 2. costume materials: emission graphs -> Principled base colour (unlit VRoid graphs already export as unlit)
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    N = m.node_tree.nodes
    em = next((n for n in N if n.type == 'EMISSION'), None)
    if em is None or any(n.type == 'LIGHT_PATH' for n in N):
        continue
    src = em.inputs['Color'].links[0].from_socket if em.inputs['Color'].links else None
    col = tuple(em.inputs['Color'].default_value)
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
    p = N.new('ShaderNodeBsdfPrincipled')
    p.inputs['Roughness'].default_value = 0.85
    if src is not None:
        # drop the multiply-tint node if present: bake the tint into the base colour factor instead
        if src.node.type == 'MIX' and src.node.blend_type == 'MULTIPLY' and src.node.inputs['A'].links:
            tint = tuple(src.node.inputs['B'].default_value)
            m.node_tree.links.new(src.node.inputs['A'].links[0].from_socket, p.inputs['Base Color'])
            p.inputs['Base Color'].default_value = tint
        else:
            m.node_tree.links.new(src, p.inputs['Base Color'])
    else:
        p.inputs['Base Color'].default_value = col
    m.node_tree.links.new(p.outputs[0], out.inputs[0])
    N.remove(em)

# 3. apply solidify on costume pieces so export matches the review renders
bpy.context.view_layer.objects.active = None
for o in list(scene.objects):
    if o.type != 'MESH' or o.data.shape_keys:
        continue
    for m in list(o.modifiers):
        if m.type in ('SOLIDIFY', 'BEVEL'):
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=m.name)

# 4. join the sword into one skinned mesh named Hero_sword; join the costume per object group
def join(objs, name):
    objs = [o for o in objs if o]
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]

# one material for the whole sword so the game receives a single skinned Hero_sword mesh
atlas_img = bpy.data.images.load(str(_TEX / 'sword_atlas.png')); atlas_img.pack()
atlas = bpy.data.materials.new('Sword atlas'); atlas.use_nodes = True
an = atlas.node_tree.nodes; ap = an['Principled BSDF']; ap.inputs['Roughness'].default_value = 0.6
at = an.new('ShaderNodeTexImage'); at.image = atlas_img
atlas.node_tree.links.new(at.outputs['Color'], ap.inputs['Base Color'])
REGION = {'blade': (0.0, 0.5, 1.0, 1.0), 'grip': (0.5, 0.25, 0.5, 1 / 3.2), 'guard': (0.75, 0.25, 0, 0),
          'pommel': (0.75, 0.25, 0, 0), 'collar': (0.75, 0.25, 0, 0)}
for o in [o for o in scene.objects if o.type == 'MESH' and o.name.startswith('Hero_sword')]:
    part = o.name.split(' ')[-1]
    u0, w, su, sv = REGION[part]
    uvl = o.data.uv_layers.active
    for d in uvl.data:
        u, v = d.uv
        if part == 'blade':
            d.uv = (u0 + min(max(u, 0), 1) * w, v)
        elif part == 'grip':
            d.uv = (u0 + (u / 2.0) * w, (v / 3.2))
        else:
            d.uv = (u0 + 0.5 * w, 0.5)
    o.data.materials.clear(); o.data.materials.append(atlas)

sword = join([o for o in scene.objects if o.type == 'MESH' and o.name.startswith('Hero_sword')], 'Hero_sword')
costume = join([o for o in scene.objects if o.type == 'MESH' and o.name not in ('Body', 'Face', 'Hair', 'Hero_sword')
                and not o.name.startswith('Braid')], 'Costume')
braid = join([o for o in scene.objects if o.type == 'MESH' and o.name.startswith('Braid')], 'Braid')

# 5. keep only the shape keys the game drives; bake the resting expression as default weights
face = bpy.data.objects['Face']
for kb in list(face.data.shape_keys.key_blocks):
    if kb.name != 'Basis' and kb.name not in KEEP_KEYS:
        face.shape_key_remove(kb)

# 6. textures: body sheet 2048 -> 1024, everything shipped as WebP
for img in bpy.data.images:
    if img.size[0] >= 2048:
        img.scale(img.size[0] // 2, img.size[1] // 2)

for o in scene.objects:
    if o.type == 'EMPTY' and o.parent == rig:
        o.hide_set(False)

bpy.ops.export_scene.gltf(
    filepath=str(OUT), export_format='GLB', use_selection=False,
    export_apply=True, export_animations=True, export_animation_mode='ACTIONS',
    export_morph=True, export_morph_normal=False, export_skins=True, export_all_influences=False,
    export_image_format='WEBP', export_image_quality=88, export_texcoords=True, export_normals=True,
    export_extras=False, export_yup=True, export_def_bones=False,
)
print('EXPORT_OK', OUT, OUT.stat().st_size)
