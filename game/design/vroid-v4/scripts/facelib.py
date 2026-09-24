import os
import bpy
from mathutils import Vector
_HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(os.path.dirname(_HERE), 'textures') + '/'
W = os.environ.get('VROID_V4_WORK', os.path.join(os.path.dirname(_HERE), 'work')) + '/'
os.makedirs(W, exist_ok=True)
def swap_image(old_name, path):
    img=bpy.data.images.get(old_name)
    new=bpy.data.images.load(path); new.pack()
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        for n in m.node_tree.nodes:
            if n.type=='TEX_IMAGE' and n.image==img: n.image=new
    return new
def scale_iris(face, factor=1.14):
    me=face.data
    idx=[i for i,m in enumerate(me.materials) if m and 'EyeIris' in m.name][0]
    verts=set()
    for p in me.polygons:
        if p.material_index==idx: verts.update(p.vertices)
    for side in (-1,1):
        vs=[v for v in verts if me.vertices[v].co.x*side>0]
        c=sum((me.vertices[v].co for v in vs),Vector())/len(vs)
        for v in vs:
            co=me.vertices[v].co; d=co-c
            co.x=c.x+d.x*factor; co.z=c.z+d.z*factor
        # shape keys too (all keys store absolute coords)
        for kb in me.shape_keys.key_blocks:
            ck=sum((kb.data[v].co for v in vs),Vector())/len(vs)
            for v in vs:
                co=kb.data[v].co; d=co-ck; co.x=ck.x+d.x*factor; co.z=ck.z+d.z*factor
    return len(verts)
def expression(face, values):
    kb=face.data.shape_keys.key_blocks
    for k in kb: k.value=0
    for k,v in values.items(): kb[k].value=v
