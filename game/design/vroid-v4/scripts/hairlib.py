import bpy, math
from mathutils import Vector, Matrix
# Braid axis in rest pose (x, y, z). Top sits inside the gathered ponytail.
AXIS=[Vector(p) for p in [(0.004,0.205,1.235),(0.007,0.196,1.12),(0.009,0.19,1.0),(0.011,0.19,0.88),(0.012,0.192,0.78)]]
def axis_at(z):
    pts=AXIS
    if z>=pts[0].z: return pts[0].copy()
    for a,b in zip(pts,pts[1:]):
        if b.z<=z<=a.z:
            t=(a.z-z)/(a.z-b.z); return a.lerp(b,t)
    return pts[-1].copy()
def taper_ponytail(hair):
    n=0
    for v in hair.data.vertices:
        c=v.co
        if c.y<0.11 or c.z>1.34: continue
        z=c.z
        s=1.0 if z>=1.34 else max(0.28, 0.28+0.72*(z-1.20)/(1.34-1.20)) if z>1.20 else 0.28
        a=axis_at(max(z,1.2))
        d=Vector((c.x-a.x,c.y-a.y,0))
        # gather strands into an oval bundle slightly wider than deep
        nz=max(z,1.17+0.03*(z-0.9)) if z<1.2 else z
        c.x=a.x+d.x*s; c.y=a.y+d.y*s*0.9; c.z=nz; n+=1
    return n
def chain_bones(rig):
    """Re-seat the long ponytail chain on the braid axis and extend it to the braid tip."""
    bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb=rig.data.edit_bones
    pts=[eb['J_Sec_Hair3_07'].tail.copy()]
    zs=[1.16,1.04,0.92,0.80,0.68]
    pts+= [axis_at(z) if z>=0.78 else AXIS[-1]+Vector((0.001,0.004,z-0.78)) for z in zs]
    names=['J_Sec_Hair4_07','J_Sec_Hair5_07','J_Sec_Hair6_07','J_Sec_Hair7_07','J_Sec_Hair8_07']
    parent=eb['J_Sec_Hair3_07']
    for i,nm in enumerate(names):
        b=eb.get(nm) or eb.new(nm)
        b.head=pts[i]; b.tail=pts[i+1]; b.parent=parent; b.use_connect=False; b.roll=0
        parent=b
    bpy.ops.object.mode_set(mode='OBJECT')
    return names
def lobe(center, up, side, length, width, depth, tilt, segs=10, rings=7):
    """Ellipsoid lobe; returns verts and faces (quad rings) plus v-coordinates for UV."""
    fwd=up.cross(side).normalized()
    R=Matrix.Rotation(tilt,3,fwd)
    u=(R@up).normalized(); s=(R@side).normalized()
    verts=[];uvs=[]
    for i in range(rings+1):
        t=i/rings; a=math.pi*t
        h=-math.cos(a)*length/2; r=math.sin(a)
        r=r**0.8
        for j in range(segs):
            b=2*math.pi*j/segs
            p=center+u*h+s*(math.cos(b)*width/2*r)+fwd*(math.sin(b)*depth/2*r)
            verts.append(p); uvs.append((j/segs,t))
    faces=[]
    for i in range(rings):
        for j in range(segs):
            a=i*segs+j; b=i*segs+(j+1)%segs
            faces.append((a,b,b+segs,a+segs))
    # caps: collapse by adding poles
    return verts,faces,uvs
def build_braid(rig, hair_mat, band_mat, bone_names):
    verts=[];faces=[];uvs=[];zs=[]
    top=1.215; bottom=0.80; n=13
    step=(top-bottom)/n
    for i in range(n):
        z=top-step*(i+0.5)
        c=axis_at(z)
        taper=1-0.35*(i/(n-1))
        w=0.056*taper; d=0.040*taper
        side_sign=1 if i%2==0 else -1
        side=Vector((1,0,0)); up=Vector((0,0,1))
        off=side*side_sign*w*0.24
        v,f,uv=lobe(c+off, up, side, step*2.25, w*0.95, d, side_sign*math.radians(34))
        base=len(verts); verts+=v; faces+=[tuple(x+base for x in q) for q in f]; uvs+=[(a,0.42+0.22*b) for a,b in uv]
    # central spine strand between lobes (hides gaps from side views)
    v,f,uv=lobe(axis_at((top+bottom)/2)+Vector((0,0.004,0)), Vector((0,0,1)).lerp((AXIS[0]-AXIS[-1]).normalized(),1), Vector((1,0,0)), top-bottom+0.05, 0.036, 0.036, 0, segs=10, rings=16)
    base=len(verts); verts+=v; faces+=[tuple(x+base for x in q) for q in f]; uvs+=[(a,0.5+0.1*b) for a,b in uv]
    braid=_mk('Braid plait',verts,faces,uvs,hair_mat,rig,bone_names)
    # hair tie at braid end + loose tuft
    tv=[];tf=[];tuv=[]
    c=axis_at(0.795)
    for i,(z0,r) in enumerate([(0.808,0.021),(0.786,0.021)]):
        pass
    ring_v,ring_f,ring_uv=lobe(c,Vector((0,0,1)),Vector((1,0,0)),0.026,0.05,0.044,0,segs=12,rings=6)
    tie=_mk('Braid tie',ring_v,ring_f,ring_uv,band_mat,rig,bone_names)
    # tuft: several tapered strands fanning slightly
    tv=[];tf=[];tuv=[]
    for k in range(9):
        f=(k-4)/4.0
        root=c+Vector((f*0.014,0.004*math.cos(f*2),-0.008))
        tip=root+Vector((f*0.024+0.004*math.sin(k*1.7),0.012*math.cos(k*2.1),-0.085-0.025*(1-abs(f))))
        segs=6;rings=7;base=len(tv)
        for i in range(rings+1):
            t=i/rings; p=root.lerp(tip,t)+Vector((0.006*math.sin(t*3+k),0,0)); r=0.0115*(1-t)**1.1+0.0004
            for j in range(segs):
                b=2*math.pi*j/segs; tv.append(p+Vector((math.cos(b)*r,math.sin(b)*r*0.55,0))); tuv.append((j/segs,0.45+0.2*t))
        for i in range(rings):
            for j in range(segs):
                a=base+i*segs+j; b2=base+i*segs+(j+1)%segs; tf.append((a,b2,b2+segs,a+segs))
    tuft=_mk('Braid tuft',tv,tf,tuv,hair_mat,rig,bone_names)
    return braid,tie,tuft
def _mk(name,verts,faces,uvs,mat,rig,bone_names):
    me=bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts],[],faces); me.update()
    uvl=me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        p.use_smooth=True
        for li in p.loop_indices: uvl.data[li].uv=uvs[me.loops[li].vertex_index]
    ob=bpy.data.objects.new(name,me); bpy.context.scene.collection.objects.link(ob); me.materials.append(mat)
    ob.parent=rig
    bones=[rig.data.bones[n] for n in ['J_Sec_Hair3_07']+bone_names]
    groups={b.name:ob.vertex_groups.new(name=b.name) for b in bones}
    for i,v in enumerate(me.vertices):
        # weight by projection onto chain segments (smooth 2-bone blend)
        best=[]
        for b in bones:
            h=b.head_local; t=b.tail_local; seg=t-h; L=seg.length
            k=max(0,min(1,(v.co-h).dot(seg)/(L*L))); d=(h+seg*k-v.co).length
            best.append((d,b.name))
        best.sort(); d0,n0=best[0]; d1,n1=best[1]
        w0=1/(d0+1e-4); w1=1/(d1+1e-4); w1*=0.35
        s=w0+w1; groups[n0].add([i],w0/s,'REPLACE'); groups[n1].add([i],w1/s,'ADD')
    m=ob.modifiers.new('Armature','ARMATURE'); m.object=rig
    return ob
