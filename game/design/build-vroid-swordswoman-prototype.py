"""Build a local VRoid costume study; the result is not a game-ready hero.

Run with Blender 5.x: blender -b --python build-vroid-swordswoman-prototype.py
No animation clips are generated or retargeted by this script.
"""
import math
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'vroid-swordswoman-base-v3.vrm'
OUT = HERE / 'vroid-swordswoman-costume-prototype-v3.blend'
if not SOURCE.is_file():
    raise SystemExit(f'Missing editable base VRM: {SOURCE}')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
scene = bpy.context.scene
rig = bpy.data.objects['Armature']
body = bpy.data.objects['Body']
for obj in list(scene.objects):
    if obj.type == 'MESH' and obj.name == 'Icosphere' and not obj.data.materials:
        bpy.data.objects.remove(obj, do_unlink=True)

def rgba(hexcode):
    s = hexcode.lstrip('#')
    return tuple(int(s[i:i+2],16)/255 for i in (0,2,4)) + (1,)

def material(name, color, metal=0.0, rough=.72):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba(color)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = rgba(color)
    node.inputs['Metallic'].default_value = metal
    node.inputs['Roughness'].default_value = rough
    return mat

charcoal = material('Worn charcoal woven leather', '#17151C', rough=.74)
nearblack = material('Near black dyed leather', '#0E0C12', rough=.42)
plum = material('Split plum dyed cloth', '#352037', rough=.85)
plum_edge = material('Muted lavender binding', '#875987', rough=.64)
brass = material('Brushed warm brass', '#B28B56', metal=.72, rough=.42)
steel = material('Dark tempered steel', '#262630', metal=.8, rough=.48)
blade_edge = material('Violet blade glint', '#603D75', metal=.38, rough=.48)
hair_braid = material('Braided plum-violet hair', '#362048', rough=.72)
body.data.materials[2] = nearblack

for textured in (charcoal,nearblack):
    nodes=textured.node_tree.nodes; links=textured.node_tree.links
    noise=nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=165
    bump=nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.055
    bump.inputs['Distance'].default_value=.0006
    links.new(noise.outputs['Fac'],bump.inputs['Height'])
    links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])

cloth_nodes=plum.node_tree.nodes
cloth_links=plum.node_tree.links
cloth_noise=cloth_nodes.new('ShaderNodeTexNoise'); cloth_noise.inputs['Scale'].default_value=115
cloth_noise.inputs['Detail'].default_value=2.4
cloth_bump=cloth_nodes.new('ShaderNodeBump'); cloth_bump.inputs['Strength'].default_value=.045
cloth_bump.inputs['Distance'].default_value=.0009
cloth_links.new(cloth_noise.outputs['Fac'],cloth_bump.inputs['Height'])
cloth_links.new(cloth_bump.outputs['Normal'],cloth_nodes.get('Principled BSDF').inputs['Normal'])

def new_mesh(name, verts, faces, mat, *, bone=None, weights=None, solidify=0):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if solidify:
        mod = obj.modifiers.new('Tailored thickness', 'SOLIDIFY')
        mod.thickness = solidify
        mod.offset = 0
    if bone or weights:
        obj.parent = rig
        if bone:
            group = obj.vertex_groups.new(name=bone)
            group.add(list(range(len(verts))), 1, 'REPLACE')
        else:
            groups = {}
            for vi, table in enumerate(weights):
                for name2, weight in table.items():
                    if weight <= 0: continue
                    if name2 not in groups:
                        groups[name2] = obj.vertex_groups.new(name=name2)
                    groups[name2].add([vi], weight, 'REPLACE')
        arm = obj.modifiers.new('VRoid humanoid skin', 'ARMATURE')
        arm.object = rig
    return obj

def transfer_weights(vi):
    result = {}
    for group in body.data.vertices[vi].groups:
        result[body.vertex_groups[group.group].name] = group.weight
    return result

def conformal(name, predicate, mat, offset=.003, source_mat=0):
    source = body.data
    chosen = []
    for p in source.polygons:
        if p.material_index != source_mat: continue
        c = p.center
        if predicate(c):
            chosen.append(p)
    old_to_new = {}
    verts = []
    weights = []
    faces = []
    for p in chosen:
        face = []
        for old in p.vertices:
            if old not in old_to_new:
                new = len(verts)
                old_to_new[old] = new
                vertex = source.vertices[old]
                verts.append(tuple(vertex.co + vertex.normal * offset))
                weights.append(transfer_weights(old))
            face.append(old_to_new[old])
        faces.append(face)
    print('CONFORMAL',name,len(verts),len(faces))
    if verts:
        obj = new_mesh(name,verts,faces,mat,weights=weights,solidify=.0015)
        for poly in obj.data.polygons: poly.use_smooth = True
        return obj

# Use the VRoid skin itself as the pattern so the garment follows the body and rig.
conformal('Tailored charcoal wrap vest', lambda c: .995<c.z<1.320 and abs(c.x)<(.115 if c.z>1.28 else .148), charcoal)
conformal('Left forearm leather', lambda c: c.x < -.38 and c.x > -.57 and 1.16<c.z<1.38, nearblack)
conformal('Right forearm leather', lambda c: c.x > .38 and c.x < .57 and 1.16<c.z<1.38, nearblack)
conformal('Left fingerless glove', lambda c: -.72<c.x<-.55 and 1.12<c.z<1.31, nearblack)
conformal('Right fingerless glove', lambda c: .55<c.x<.72 and 1.12<c.z<1.31, nearblack)
conformal('Left leather boot', lambda c: c.x < 0 and .105<c.z<.55, nearblack, source_mat=1)
conformal('Right leather boot', lambda c: c.x > 0 and .105<c.z<.55, nearblack, source_mat=1)

def ring(name, center, radii, z0, z1, mat, bone, segments=20):
    cx,cy=center; rx,ry=radii
    verts=[]
    for z in (z0,z1):
        for i in range(segments):
            a=math.tau*i/segments
            verts.append((cx+rx*math.cos(a),cy+ry*math.sin(a),z))
    faces=[]
    for i in range(segments):
        j=(i+1)%segments
        faces.append((i,j,segments+j,segments+i))
    return new_mesh(name,verts,faces,mat,bone=bone,solidify=.002)

ring('Short raised collar', (0,-.002),(.066,.059),1.325,1.374,charcoal,'J_Bip_C_Neck',24)
ring('Waist sword belt', (0,0),(.153,.106),.985,1.025,nearblack,'J_Bip_C_Hips',32)

def panel(name, side, front=True):
    sign=1 if side=='R' else -1
    ytop=-.106 if front else .106
    ybottom=-.163 if front else .154
    # A lightly folded five-wide fabric surface gives the waist split actual depth.
    along=12; across=7; verts=[]; faces=[]
    for j in range(along+1):
        v=j/along
        xinner=.028+.026*v
        xouter=.160+.080*v-.018*v*v
        for k in range(across+1):
            u=k/across
            x=sign*(xinner+(xouter-xinner)*u)
            y=ytop+(ybottom-ytop)*v + (.024 if front else -.017)*math.sin(math.tau*1.4*u)*(v**1.3)
            if front: y-=.006*v*u
            hem=.528-.082*u + .012*math.sin(math.pi*u)
            z=.991+(hem-.991)*v + .004*math.sin(math.pi*v)*math.sin(math.tau*2*u)
            verts.append((x,y,z))
    width=across+1
    for j in range(along):
        for k in range(across):
            a=j*width+k;b=a+1
            faces.append((a,b,b+width,a+width))
    obj=new_mesh(name,verts,faces,plum,bone='J_Bip_C_Hips',solidify=.004)
    bev=obj.modifiers.new('Soft textile edge','BEVEL'); bev.width=.003; bev.segments=2
    for poly in obj.data.polygons: poly.use_smooth=True
    return obj

for side in ('L','R'):
    panel(f'{side} front split waist cloth',side,True)
    panel(f'{side} rear split waist cloth',side,False)

def box(name, center, size, mat, bone):
    x,y,z=center; dx,dy,dz=[s/2 for s in size]
    v=[(x+sx*dx,y+sy*dy,z+sz*dz) for sx,sy,sz in ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))]
    f=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
    ob=new_mesh(name,v,f,mat,bone=bone)
    bevel=ob.modifiers.new('Light edge bevel','BEVEL'); bevel.width=.003; bevel.segments=2
    return ob

def tailored_strip(name, points, width, mat, bone, depth=0):
    verts=[]
    for x,y,z in points:
        verts.extend(((x-width/2,y-depth,z),(x+width/2,y-depth,z)))
    faces=[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(points)-1)]
    obj=new_mesh(name,verts,faces,mat,bone=bone,solidify=.002)
    for poly in obj.data.polygons: poly.use_smooth=True
    return obj

# An off-center layered front tab and diagonal leather belts break the tube silhouette.
new_mesh('Tailored central black skirt flap',
    [(-.081,-.128,.991),(.071,-.128,.991),(.094,-.183,.539),(-.110,-.183,.624)],
    [(0,1,2,3)],charcoal,bone='J_Bip_C_Hips',solidify=.004)
tailored_strip('Front flap edge',[(.071,-.131,.991),(.078,-.156,.76),(.094,-.187,.539)],.004,brass,'J_Bip_C_Hips')
for sign,label in ((-1,'left'),(1,'right')):
    tailored_strip(f'{label} plum outside piping',
        [(sign*.160,-.111,.989),(sign*.202,-.147,.775),(sign*.222,-.169,.446)],
        .006,plum_edge,'J_Bip_C_Hips')
    tailored_strip(f'{label} plum inner piping',
        [(sign*.028,-.112,.988),(sign*.040,-.141,.75),(sign*.054,-.164,.528)],
        .005,plum_edge,'J_Bip_C_Hips')
    tailored_strip(f'{label} coat fold',
        [(sign*.098,-.112,.981),(sign*.114,-.155,.745),(sign*.141,-.18,.495)],
        .003,nearblack,'J_Bip_C_Hips')
tailored_strip('Diagonal left sword belt',
    [(-.144,-.119,1.018),(-.060,-.130,.990),(.039,-.123,.964),(.138,-.110,.942)],
    .023,nearblack,'J_Bip_C_Hips')
tailored_strip('Diagonal right sword belt',
    [(-.146,-.113,.949),(-.036,-.128,.972),(.050,-.130,.999),(.146,-.112,1.016)],
    .018,nearblack,'J_Bip_C_Hips')
box('Main waist buckle',(-.021,-.144,.994),(.038,.008,.029),brass,'J_Bip_C_Hips')
box('Main waist buckle center',(-.021,-.150,.994),(.023,.009,.016),nearblack,'J_Bip_C_Hips')
tailored_strip('Asymmetric shoulder harness',
    [(-.069,-.048,1.313),(-.055,-.104,1.272),(.024,-.134,1.205),(.074,-.128,1.126)],
    .018,nearblack,'J_Bip_C_Chest')
box('Shoulder harness clasp',(-.057,-.108,1.269),(.025,.011,.022),brass,'J_Bip_C_Chest')

# Hierarchical hardware creates a deliberate focal line rather than scattered dots.
for i,z in enumerate((1.020,1.104,1.185)):
    box(f'Vest strap {i}',(-.032,-.113,z),(.105,.008,.009),nearblack,'J_Bip_C_Chest')
    box(f'Brass buckle {i}',(.016,-.120,z),(.020,.007,.016),brass,'J_Bip_C_Chest')

# Flat footwear texture becomes a boot silhouette with tapered cuffs.
for side in (-1,1):
    x=side*.102
    ring(f'{side} boot upper cuff',(x,0),(.051,.051),.492,.509,charcoal,'J_Bip_C_Hips',18)
    box(f'{side} boot top buckle',(x+side*.047,-.033,.500),(.012,.010,.017),brass,'J_Bip_C_Hips')

# Dark, restrained one-handed blade; every part is bound to the dominant hand.
hand='J_Bip_R_Hand'
box('Sword wrapped grip',(-.650,-.012,1.221),(.023,.022,.165),nearblack,hand)
box('Sword slim crossguard',(-.650,-.012,1.123),(.088,.023,.012),brass,hand)
box('Sword dark blade',(-.650,-.012,.829),(.024,.010,.57),steel,hand)
new_mesh('Sword tapered point',[(-.662,-.018,.544),(-.638,-.018,.544),(-.650,-.012,.414)],[(0,1,2)],steel,bone=hand,solidify=.006)
box('Sword violet edge glint',(-.638,-.019,.829),(.002,.003,.55),blade_edge,hand)

# Three interwoven, tapered strands emerge from the natural ponytail.
for strand in range(3):
    verts=[];faces=[]
    steps=60; sides=8
    for j in range(steps+1):
        t=j/steps
        a=math.tau*(1.95*t+strand/3)
        center_x=.023*math.cos(a)
        center_y=.173+.029*t+.020*math.sin(a)
        center_z=1.278-.248*t
        radius=.016*(1-.30*t)
        for k in range(sides):
            b=math.tau*k/sides
            verts.append((center_x+radius*math.cos(b),center_y+radius*math.sin(b),center_z))
    for j in range(steps):
        for k in range(sides):
            a=j*sides+k;b=j*sides+(k+1)%sides
            faces.append((a,b,b+sides,a+sides))
    obj=new_mesh(f'Interwoven braid strand {strand+1}',verts,faces,hair_braid,bone='J_Bip_C_Head')
    for poly in obj.data.polygons: poly.use_smooth=True

scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=720; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world=bpy.data.worlds.new('Slate review world'); scene.world.color=(.07,.065,.10)
scene.view_settings.view_transform='Standard'
def light(name,loc,energy):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.size=2
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((0,0,.85))-obj.location).to_track_quat('-Z','Y').to_euler()
light('soft key',(2,-3,3),210);light('cool rim',(-2,2,2),120)
camdata=bpy.data.cameras.new('Review camera');camera=bpy.data.objects.new('Review camera',camdata)
scene.collection.objects.link(camera);scene.camera=camera;camdata.type='ORTHO';camdata.ortho_scale=1.96
for name,loc in [('front',(0,-4,.84)),('side',(4,0,.84)),('back',(0,4,.84))]:
    camera.location=loc;camera.rotation_euler=(Vector((0,0,.84))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(HERE / f'vroid-swordswoman-costume-v3-{name}.png')
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
print('COSTUME_STUDY_OK',OUT)
