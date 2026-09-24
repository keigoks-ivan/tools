import bpy, math
from mathutils import Vector, Matrix
import costumelib as C
def build_sword(ctx, steel_mat, brass_mat, grip_mat, hand='J_Bip_R_Hand', grip_center=Vector((-0.588,0.022,1.262)), direction=Vector((0,-1,0))):
    """Blade along +Y in local space; returned objects are rigid on the hand bone."""
    d=direction.normalized(); up=Vector((0,0,1)); side=d.cross(up).normalized(); up=side.cross(d).normalized()
    M=Matrix((-up,d,side)).transposed()  # width along -Z so the edge faces the curled fingers
    def P(x,y,z): return grip_center+M@Vector((x,y,z))
    parts=[]
    # grip: 8-sided, slightly oval, 0.2 m, centred on the fist
    verts=[];faces=[];uvs=[]
    GL=0.21; gy0=-0.165; sides=10; rings=8
    for i in range(rings+1):
        t=i/rings; y=gy0+GL*t; r=0.0135*(1-0.08*math.sin(math.pi*t))+0.001*(t)
        for j in range(sides):
            a=2*math.pi*j/sides
            verts.append(P(math.cos(a)*r*0.85,y,math.sin(a)*r)); uvs.append((j/sides*2,t*3.2))
    for i in range(rings):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides; faces.append((a,b,b+sides,a+sides))
    parts.append(C.make_obj(ctx,'Hero_sword grip',verts,faces,grip_mat,uvs=uvs,bone=hand))
    # pommel cap and habaki collar
    for nm,y0,y1,r0,r1 in (('pommel',gy0-0.012,gy0+0.004,0.013,0.0155),('collar',gy0+GL-0.002,gy0+GL+0.028,0.0175,0.0125)):
        vv=[];ff=[]
        for i,(y,r) in enumerate(((y0,r0*0.7),(y0+0.003,r0),(y1,r1),(y1+0.001,r1*0.6))):
            for j in range(sides):
                a=2*math.pi*j/sides; vv.append(P(math.cos(a)*r*0.85,y,math.sin(a)*r))
        for i in range(3):
            for j in range(sides):
                a=i*sides+j;b=i*sides+(j+1)%sides; ff.append((a,b,b+sides,a+sides))
        ff.append(tuple(range(sides))[::-1]); ff.append(tuple(range(3*sides,4*sides)))
        parts.append(C.make_obj(ctx,'Hero_sword '+nm,vv,ff,brass_mat,uvs=[(0,0)]*len(vv),bone=hand))
    # guard: oval disc with raised rim
    gy=gy0+GL+0.002; vv=[];ff=[]; n=24
    for k,(dy,s) in enumerate(((0,0.0),(0,1),(0.009,1),(0.009,0.0))):
        for j in range(n):
            a=2*math.pi*j/n; vv.append(P(math.cos(a)*0.027*s,gy+dy,math.sin(a)*0.023*s))
    for k in range(3):
        for j in range(n):
            a=k*n+j;b=k*n+(j+1)%n; ff.append((a,b,b+n,a+n))
    parts.append(C.make_obj(ctx,'Hero_sword guard',vv,ff,brass_mat,uvs=[(0,0)]*len(vv),bone=hand,smooth=False))
    # blade: straight single edge, back ridge (shinogi), chisel point
    by=gy+0.009; BL=0.74; vv=[];uvs=[]
    prof=[(-0.0175,0.0,0.0),(-0.0155,0.0034,0.08),(0.005,0.0028,0.55),(0.0175,0.0,1.0)]  # (x across, half-thickness, u)
    rows=24
    for i in range(rows+1):
        t=i/rows; y=by+BL*t
        w=1-0.08*t
        tipcut = 0 if t<0.9 else (t-0.9)/0.1
        for x,h,u in prof:
            xx=x*w
            if tipcut>0:  # edge sweeps up to meet the back at the point
                xx=-0.0175*w+(xx+0.0175*w)*(1-tipcut)
            verts_=(xx,y,h*(1-0.6*tipcut))
            vv.append(P(*verts_)); uvs.append((u,t))
        for x,h,u in reversed(prof[1:-1]):
            xx=x*w
            if tipcut>0: xx=-0.0175*w+(xx+0.0175*w)*(1-tipcut)
            vv.append(P(xx,y,-h*(1-0.6*tipcut))); uvs.append((u,t))
    m=len(prof)+len(prof)-2; ff=[]
    for i in range(rows):
        for j in range(m):
            a=i*m+j;b=i*m+(j+1)%m; ff.append((a,b,b+m,a+m))
    tip=len(vv); vv.append(P(-0.0175*0.92,by+BL+0.035,0)); uvs.append((0.5,1))
    for j in range(m): ff.append((rows*m+j,rows*m+(j+1)%m,tip))
    parts.append(C.make_obj(ctx,'Hero_sword blade',vv,ff,steel_mat,uvs=uvs,bone=hand,smooth=True))
    return parts
def pose_rot(rig, bone, axis, deg):
    pb=rig.pose.bones[bone]
    bpy.context.view_layer.update()
    mw=pb.matrix.copy(); head=mw.translation.copy()
    R=Matrix.Translation(head)@Matrix.Rotation(math.radians(deg),4,Vector(axis))@Matrix.Translation(-head)
    pb.matrix=R@mw
    bpy.context.view_layer.update()
def grip_right_hand(rig):
    for f,(a1,a2,a3) in (('Index',(58,72,45)),('Middle',(64,74,45)),('Ring',(68,74,45)),('Little',(72,70,45))):
        for k,a in enumerate((a1,a2,a3)):
            # curl tips downward (palm side, -Z) about world Y; each joint adds to its parent
            pose_rot(rig,f'J_Bip_R_{f}{k+1}',(0,1,0),-a)
    pose_rot(rig,'J_Bip_R_Thumb1',(1,0,0),28)
    pose_rot(rig,'J_Bip_R_Thumb1',(0,0,1),-18)
    pose_rot(rig,'J_Bip_R_Thumb2',(0,1,0),-25)
    pose_rot(rig,'J_Bip_R_Thumb3',(0,1,0),-30)

def relax_left_hand(rig):
    for f in ('Index','Middle','Ring','Little'):
        for k,a in enumerate((18,22,15)):
            pose_rot(rig,f'J_Bip_L_{f}{k+1}',(0,1,0),a)
def pose_design(rig):
    """Standing hero pose of the design sheet: arms lowered, sword angled down and forward."""
    grip_right_hand(rig); relax_left_hand(rig)
    pose_rot(rig,'J_Bip_R_UpperArm',(0,1,0),-70)
    pose_rot(rig,'J_Bip_R_UpperArm',(1,0,0),-10)
    pose_rot(rig,'J_Bip_R_LowerArm',(1,0,0),-28)
    aim_sword(rig,Vector((-0.28,-0.38,-0.88)))
    pose_rot(rig,'J_Bip_L_UpperArm',(0,1,0),72)
    pose_rot(rig,'J_Bip_L_LowerArm',(1,0,0),-12)
    pose_rot(rig,'J_Bip_L_UpperLeg',(0,1,0),9)
    pose_rot(rig,'J_Bip_R_UpperLeg',(0,1,0),-7)
    pose_rot(rig,'J_Bip_L_Foot',(0,1,0),-9)
    pose_rot(rig,'J_Bip_R_Foot',(0,1,0),7)
    pose_rot(rig,'J_Bip_C_Spine',(0,0,1),6)
    pose_rot(rig,'J_Bip_C_Head',(0,0,1),-8)
    pose_rot(rig,'J_Bip_C_Head',(1,0,0),4)

def aim_sword(rig,target,rest_dir=Vector((0,-1,0))):
    """Rotate the right wrist so the blade (rest direction -Y) points along target."""
    pb=rig.pose.bones['J_Bip_R_Hand']; bpy.context.view_layer.update()
    delta=pb.matrix@pb.bone.matrix_local.inverted()
    cur=(delta.to_3x3()@rest_dir).normalized()
    q=cur.rotation_difference(target.normalized())
    head=pb.matrix.translation.copy()
    pb.matrix=Matrix.Translation(head)@q.to_matrix().to_4x4()@Matrix.Translation(-head)@pb.matrix
    bpy.context.view_layer.update()
