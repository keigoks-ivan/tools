import sys, math, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import toonlib as T, toonpatch as P, facelib as F, hairlib as H, costumelib as C
W=F.W
STAGE=sys.argv[-1] if '--' in sys.argv else 'all'
T.load_base()
F.swap_image('_09',F.TEX+'eyeline.png'); F.swap_image('_14',F.TEX+'hairback.png'); F.swap_image('_04',F.TEX+'faceskin.png')
rig=bpy.data.objects['Armature']; hair=bpy.data.objects['Hair']; face=bpy.data.objects['Face']; body=bpy.data.objects['Body']
F.scale_iris(face,1.14)
F.expression(face,{'Fcl_EYE_Close':.1,'Fcl_EYE_Angry':.25,'Fcl_BRW_Angry':.35,'Fcl_MTH_Fun':.3,'Fcl_MTH_Up':.2})
H.taper_ponytail(hair); names=H.chain_bones(rig)
band_mat=C.mat_tex('Dark leather ties','leather.png',(6,6))
H.build_braid(rig,hair.data.materials[0],band_mat,names)

ctx=C.Ctx()
charcoal=C.mat_tex('Charcoal pinstripe wool','fab_charcoal.png',(1,1))
plum=C.mat_tex('Plum damask','fab_plum.png',(1.8,1.8))
leather=C.mat_tex('Black leather','leather.png',(1,1))
strap=C.mat_tex('Strap leather','leather.png',(2,2),color=(0.85,0.8,0.9))
brass=C.mat_tex('Brushed brass','brass.png',(1,1))
lav=C.mat_tex('Lavender binding',None,color=(0.42,0.27,0.45))
pipe=C.mat_tex('Black piping',None,color=(0.035,0.03,0.04))

# ---------------- tunic
def arm_w(z):
    if z<1.16: return 0.2
    t=min(1,(z-1.16)/(1.335-1.16)); return 0.2-0.13*(t**0.75)
def tunic_pred(c): return 0.955<c.z<1.335 and abs(c.x)<arm_w(c.z)
tun,tv,tl,tw=C.conformal(ctx,'Tunic',tunic_pred,charcoal,offset_fn=lambda p:0.0045 if p.z>1.0 else 0.009,mats=(0,1),solidify=0)
C.piping(ctx,'Tunic edge',tv,tw,tl,pipe,radius=0.003)
# princess seams on the front and back
for sx in (-1,1):
    for front in (True,False):
        pts=[]
        for i in range(14):
            z=0.98+i*0.021
            x=sx*(0.062+0.018*math.sin((z-0.98)/0.3*math.pi))
            d=Vector((0,-1 if front else 1,0))
            loc,n=ctx.surface(Vector((x,0.0,z)),d,0.3)
            if loc is not None: pts.append(loc+n*0.006)
        if len(pts)>3: C.tube(ctx,'Seam',pts,0.0014,pipe,weights=[ctx.weights_at(p) for p in pts])

# ---------------- stand collar
rows=[];NR=5; angs=[math.radians(18)+i*(math.radians(324))/40 for i in range(41)]
for r in range(NR):
    zf=lambda a,r=r:1.318+r*0.0135*(0.62+0.38*(1-math.cos(a))/2)   # lower at the chin, taller at the nape
    pts,nr,_=C.ring(ctx,zf,(0,0.03),offset=0.0,angles=angs,first=True,rmax=0.2)
    flare=0.008+0.006*(r/(NR-1))
    rows.append([p+Vector((n.x,n.y,0)).normalized()*flare for p,n in zip(pts,nr)])
verts=[p for row in rows for p in row]; m=len(angs); faces=[]
for r in range(NR-1):
    for i in range(m-1): faces.append((r*m+i,r*m+i+1,(r+1)*m+i+1,(r+1)*m+i))
ws=[]
for r in range(NR):
    t=r/(NR-1)
    for i in range(m): ws.append({'J_Bip_C_UpperChest':1-0.8*t,'J_Bip_C_Neck':0.8*t})
uvs=[(i/m*3,r/NR*0.6) for r in range(NR) for i in range(m)]
C.make_obj(ctx,'Stand collar',verts,faces,charcoal,uvs=uvs,weights=ws,solidify=0.0045)
C.tube(ctx,'Collar rim',rows[-1],0.003,pipe,weights=[ws[-m+i] for i in range(m)])
# collar clasp on her left front
cp=rows[2][2]; cn=(cp-Vector((0,0.03,cp.z))).normalized()
C.oriented_box(ctx,'Collar clasp',cp+cn*0.004,cn,Vector((0,0,1)),(0.016,0.022,0.005),brass,weights=ws[2*m+2])

# ---------------- torso straps with buckles
front=[math.radians(-110)+i*math.radians(220)/30 for i in range(31)]
for k,z in enumerate((1.125,1.055)):
    ob,lo,hi,nl=C.band(ctx,f'Chest strap {k}',lambda a,z=z:z,0.016,strap,angles=front,closed=False,offset=0.012)
    i=18; c=(lo[i]+hi[i])/2
    C.buckle(ctx,f'Chest buckle {k}',c+nl[i]*0.004,nl[i],Vector((0,0,1)),0.024,0.022,brass,ctx.weights_at(c))
# hip belts: one level, one slung diagonally
b1=C.band(ctx,'Waist belt',lambda a:0.985,0.026,strap,offset=0.014)
b2=C.band(ctx,'Sword belt',lambda a:0.945+0.02*math.sin(a),0.022,strap,offset=0.02)
for nm,(ob,lo,hi,nl),i,sz in (('Waist buckle',b1,2,(0.034,0.03)),('Sword belt buckle',b2,44,(0.028,0.026))):
    c=(lo[i]+hi[i])/2; C.buckle(ctx,nm,c+nl[i]*0.005,nl[i],Vector((0,0,1)),sz[0],sz[1],brass,ctx.weights_at(c))

# ---------------- waist panels (split, narrow; legs show between them as in the design)
d=math.radians
pt=lambda u,hi,lo,p=1.6: hi-(hi-lo)*(u**p)          # hem falls toward u=1 into a point
C.panel(ctx,'Front flap',charcoal,d(-28),d(6),0.975,lambda u:0.53-0.07*u,0.015,0.022,edge_mat=pipe,layer_push=0.008,leg_follow=0.55)
C.panel(ctx,'Left front plum',plum,d(20),d(96),0.975,lambda u:pt(u,0.62,0.34),0.075,0.018,edge_mat=lav)
C.panel(ctx,'Right front plum',plum,d(-96),d(-34),0.975,lambda u:pt(1-u,0.64,0.37),0.07,0.018,edge_mat=lav)
C.panel(ctx,'Left back plum',plum,d(102),d(174),0.975,lambda u:pt(u,0.60,0.35,1.3),0.07,0.02,edge_mat=lav,layer_push=0.004)
C.panel(ctx,'Right back plum',plum,d(-174),d(-102),0.975,lambda u:pt(1-u,0.60,0.35,1.3),0.07,0.02,edge_mat=lav,layer_push=0.004)
C.panel(ctx,'Back center flap',charcoal,d(166),d(194),0.975,lambda u:0.60-0.06*(1-abs(2*u-1)),0.02,0.022,edge_mat=pipe,layer_push=0.012)


# ---------------- boots: shaft over the trouser leg, flared cuff, straps, dark leather foot
bootleather=C.mat_tex('Boot leather','boot.png',(1,1))
for sx,side in ((1,'L'),(-1,'R')):
    pred=lambda c,sx=sx: c.x*sx>0 and 0.075<c.z<0.50
    def taper(v,sx=sx):
        # trouser hems flare; the boot hugs the ankle and calf instead
        t=min(1,max(0,(v.z-0.1)/0.22)); s=0.78+0.22*t
        ax=Vector((sx*0.077,0.032+(0.007-0.032)*min(1,(v.z-0.1)/0.41),v.z))
        return ax+(v-ax)*s
    ob,bv,bl,bw=C.conformal(ctx,f'{side} boot shaft',pred,bootleather,offset_fn=lambda p:0.006+0.01*max(0,(p.z-0.42)/0.08),mats=(1,),solidify=0,relax=4,post=taper,uvfun=lambda p,sx=sx:(((math.atan2((p.x-sx*0.077)*sx,-(p.y-0.02))/(2*math.pi))+0.5)%1.0,p.z/0.5))
    C.piping(ctx,f'{side} boot rim',bv,bw,bl,pipe,radius=0.0035)
    cx=sx*0.077
    for z,h,nm in ((0.455,0.018,'knee strap'),(0.16,0.014,'ankle strap')):
        o,lo,hi,nl=C.band(ctx,f'{side} boot {nm}',lambda a,z=z:z,h,strap,center=(cx,0.02),offset=0.013,rmax=0.12,n=28,first=True)
        i=7 if sx>0 else 21
        c=(lo[i]+hi[i])/2; C.buckle(ctx,f'{side} boot {nm} buckle',c+nl[i]*0.004,nl[i],Vector((0,0,1)),0.02,0.018,brass,ctx.weights_at(c))
heelmat=C.mat_tex('Heel stack',None,color=(0.018,0.014,0.016))
for sx in (1,-1): C.boot_foot(ctx,sx,bootleather,heelmat)
print('HIDDEN FACES REMOVED',C.delete_body_faces(ctx,lambda c,mi: mi==2 or (mi==0 and c.z<0.13) or (mi==1 and c.z<0.44)))
# sneakers -> plain dark leather with a darker sole
shoe_img=[n.image for n in body.data.materials[2].node_tree.nodes if n.type=='TEX_IMAGE'][0]
import numpy as np
px=np.array(shoe_img.pixels[:]).reshape(-1,4)
lum=px[:,:3].mean(1)
leather_c=np.array([0.028,0.022,0.03]); sole_c=np.array([0.012,0.01,0.012])
px[:,:3]=np.where((lum>0.55)[:,None],sole_c,leather_c)+ (lum[:,None]-0.3)*0.01
shoe_img.pixels[:]=px.ravel(); shoe_img.pack()

# ---------------- bracers and fingerless gloves
for sx,side in ((1,'L'),(-1,'R')):
    hx=sx*0.543
    def glove_pred(c,sx=sx): return c.x*sx>0.525 and c.x*sx<0.628 and 1.2<c.z<1.34
    def bracer_pred(c,sx=sx): return c.x*sx>0.405 and c.x*sx<=0.53 and 1.2<c.z<1.34
    g,gv,gl,gw=C.conformal(ctx,f'{side} fingerless glove',glove_pred,leather,offset=0.0022,solidify=0,relax=4)
    C.piping(ctx,f'{side} glove edge',gv,gw,gl,pipe,radius=0.0018)
    br,bv,bl,bw=C.conformal(ctx,f'{side} bracer',bracer_pred,leather,offset_fn=lambda p,sx=sx:0.005+0.004*max(0,(0.43-p.x*sx)/0.025),solidify=0,relax=4)
    C.piping(ctx,f'{side} bracer rim',bv,bw,bl,pipe,radius=0.0028)
    # two straps around the forearm (ring around the X axis)
    for k,x in enumerate((0.455,0.505)):
        pts=[];nrm=[]
        for i in range(24):
            a=2*math.pi*i/24; dvec=Vector((0,math.cos(a),math.sin(a)))
            loc,n=ctx.surface(Vector((sx*x,0.025,1.274)),dvec,0.1,first=True)
            pts.append(loc+n*0.011); nrm.append(n)
        C.tube(ctx,f'{side} bracer strap {k}',pts,0.0055,strap,weights=[ctx.weights_at(p) for p in pts],closed=True,flat=0.35,sides=8)
        top=6  # upper side (+Z)
        C.oriented_box(ctx,f'{side} bracer buckle {k}',pts[top]+nrm[top]*0.003,nrm[top],Vector((1,0,0)),(0.014,0.013,0.004),brass,weights=ctx.weights_at(pts[top]))
# arm band on the sword arm (her right upper arm)
pts=[]
for i in range(24):
    a=2*math.pi*i/24; dvec=Vector((0,math.cos(a),math.sin(a)))
    loc,n=ctx.surface(Vector((-0.22,0.025,1.274)),dvec,0.1,first=True)
    pts.append(loc+n*0.006)
C.tube(ctx,'Right arm band',pts,0.009,strap,weights=[ctx.weights_at(p) for p in pts],closed=True,flat=0.3,sides=8)


# ---------------- sword in the right hand
import swordlib as SW
steel=C.mat_tex('Dark steel violet edge','blade.png',(1,1))
gripm=C.mat_tex('Violet cord grip','grip.png',(1,1))
SW.build_sword(ctx,steel,brass,gripm)

import proportion as PR
PR.lengthen_legs(1.12,0.868)

bpy.ops.wm.save_as_mainfile(filepath=W+'v4_project.blend')
print('PROJECT_SAVED')
import lookdev as LD
LD.apply()
cam=T.setup_render((800,1000))
for nm,loc in (('front',(0,-4,0.95)),('side',(4,0,0.95)),('back',(0,4,0.95))):
    T.aim(cam,loc,(0,0,0.95),ortho=2.0); T.render(W+f'v4_{nm}.png')
bpy.ops.wm.save_as_mainfile(filepath=W+'v4_wip.blend')
