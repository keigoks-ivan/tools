"""M-07: explicit hard-surface geometry in game coordinates (Y up, +Z forward)."""
from pathlib import Path
from math import sin, cos, pi, tau, atan2
import random
import os
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

OUT = Path(os.environ.get('M07_ART_OUTPUT', str(Path(__file__).resolve().parent/'output')))
OUT.mkdir(parents=True, exist_ok=True)
# Pigmented armor, phosphate chassis and exposed machined surfaces remain distinct.
PALETTE = {
    'blue': (0x344853, .39, .06, 1),
    'blue2': (0x425661, .43, .08, 1),
    'navy': (0x293840, .37, .05, 1),
    'armor': (0x343b42, .42, .14, 0),
    'armor2': (0x474e52, .44, .12, 0),
    'edge': (0x6b7071, .34, .76, 0),
    'steel': (0x717b7f, .30, .82, 0),
    'chrome': (0xadb7b7, .23, .91, 0),
    'dark': (0x20262a, .45, .58, 0),
    'rubber': (0x101417, .79, .04, 0),
    'recess': (0x10171b, .64, .24, 0),
    'orange': (0xbc592d, .56, .18, 0),
    'orange2': (0x9a4425, .60, .13, 0),
    'visor': (0x07151c, .10, .0, 0),
    'edge_dark': (0x4b5358, .32, .74, 0),
    'bone': (0xb1ae99, .63, .12, 0),
    'cyan': (0x61d7e9, .24, .08, 1),
    'amber': (0xffb149, .25, .13, 0),
}
PIVOTS = {
 'M07_Body':(0,0,0), 'M07_Upper':(0,0,0), 'M07_Rifle':(4.46,11.26,.05),
 'M07_Thigh_L':(-1.70,10.12,-.08), 'M07_Shin_L':(-2.14,6.42,.40), 'M07_Foot_L':(-2.72,1.20,-.10),
 'M07_Thigh_R':(1.70,10.12,-.08), 'M07_Shin_R':(2.14,6.42,.40), 'M07_Foot_R':(2.72,1.20,-.10),
}
PARENTS = {'M07_Upper':'M07_Body','M07_Rifle':'M07_Upper'}
for s in 'LR':
 PARENTS['M07_Thigh_'+s]='M07_Body'
 PARENTS['M07_Shin_'+s]='M07_Thigh_'+s
 PARENTS['M07_Foot_'+s]='M07_Shin_'+s

def proportion(p,waist=False):
 # Lengthen the actual leg assemblies while retaining the common combat height.
 # The same mapping moves armor, bearings and rig pivots, so joints stay seated.
 x,y,z=p
 width=.88-.04*min(1,max(0,(y-10.12)/1.4))
 if waist:
  taper=max(0,min(1,(y-7.1)/1.3,(12.4-y)/1.3))
  width*=1-.14*taper*taper*(3-2*taper)
 if y<1.20:height=y*.94
 elif y<6.42:height=1.128+(y-1.20)*(5.832/5.22)
 elif y<10.12:height=6.96+(y-6.42)*(4.02/3.70)
 else:height=10.98+(y-10.12)*.91
 return Vector((x*width,height,z*.94))

def convert(p): return Vector((p[0],-p[2],p[1]))
def linear(v): return v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4
def rgb(code): return tuple(linear((code>>i&255)/255) for i in (16,8,0))
def section(y,x,z,halfwidth,halfdepth,chamfer=.2):
 w,d,c=halfwidth,halfdepth,chamfer
 return [(x-w+c,y,z+d),(x+w-c,y,z+d),(x+w,y,z+d-c),(x+w,y,z-d+c),
         (x+w-c,y,z-d),(x-w+c,y,z-d),(x-w,y,z-d+c),(x-w,y,z+d-c)]
def lerp(a,b,t): return tuple(x+(y-x)*t for x,y in zip(a,b))

def material(key,glow=False):
 name=key+(' emission' if glow else '')
 if name in bpy.data.materials: return bpy.data.materials[name]
 c,r,m,t=PALETTE[key]
 mat=bpy.data.materials.new(name); mat.use_nodes=True
 mat.diffuse_color=(*rgb(c),1)
 p=mat.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=mat.diffuse_color
 p.inputs['Metallic'].default_value=m; p.inputs['Roughness'].default_value=r
 if glow:
  p.inputs['Emission Color'].default_value=mat.diffuse_color
  p.inputs['Emission Strength'].default_value=2.0
 return mat

class Builder:
 def __init__(self):
  self.col=bpy.data.collections.new('蒼焰｜原創重裝機體');bpy.context.scene.collection.children.link(self.col)
  self.variant='common';self.waist=False;self.parts={p:[] for p in PIVOTS};self.rig={};self.heads={};self.rng=random.Random(7017)
  for name,pos in PIVOTS.items():
   o=bpy.data.objects.new(name,None);self.col.objects.link(o)
   parent=PARENTS.get(name)
   if parent:o.parent=self.rig[parent]
   o.location=convert(proportion(pos,name.startswith('M07_Thigh'))-proportion(PIVOTS[parent] if parent else (0,0,0),bool(parent and parent.startswith('M07_Thigh'))))
   o.empty_display_size=.15;self.rig[name]=o
  self.rig['M07_Body']['idleStance']={'spread':.11,'turn':.12,'toe':.21}
  upper=self.rig['M07_Upper']
  upper['exhaustOrigins']=[list(proportion((side*1.78,9.540,-4.722))) for side in (-1,1)]
  direction=proportion((1.78,9.540-.56,-4.722-.83))-proportion((1.78,9.540,-4.722))
  upper['exhaustPitch']=atan2(direction.z,direction.y)

 def mesh(self,j,name,verts,faces,key='armor',bevel=0,smooth=False,glow=False,face_keys=None):
  if getattr(self,'transform',None):verts=[self.transform(p) for p in verts]
  me=bpy.data.meshes.new(name)
  me.from_pydata([convert(proportion(p,self.waist)-proportion(PIVOTS[j],j.startswith('M07_Thigh'))) for p in verts],[],faces);me.validate();me.update()
  bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
  obj=bpy.data.objects.new(name,me);self.col.objects.link(obj);obj.parent=self.rig[j]
  keys=list(dict.fromkeys(face_keys if face_keys else [key]))
  for k in keys: me.materials.append(material(k,glow))
  if face_keys:
   for f,k in zip(me.polygons,face_keys): f.material_index=keys.index(k)
  for f in me.polygons:f.use_smooth=smooth
  if smooth: me.set_sharp_from_angle(angle=.60)
  if bevel:
   bpy.context.view_layer.objects.active=obj
   mod=obj.modifiers.new('微小切削倒角','BEVEL');mod.width=bevel;mod.segments=1;mod.limit_method='ANGLE';mod.angle_limit=.27
   mod.harden_normals=True
   bpy.ops.object.modifier_apply(modifier=mod.name)
   for f in me.polygons:f.use_smooth=False
   me.set_sharp_from_angle(angle=.52)
   wn=obj.modifiers.new('平面加權法線','WEIGHTED_NORMAL');wn.keep_sharp=True;wn.weight=50
   bpy.ops.object.modifier_apply(modifier=wn.name)
  obj['mechVariant']=self.variant
  if getattr(self,'role',None):obj['campaignRole']=self.role
  obj['surfaceKind']='optics' if glow else 'glass' if key=='visor' else 'armor'
  self.parts[j].append((obj,glow));return obj

 def loft(self,j,name,rings,key='armor',bevel=.0,smooth=False):
  n=len(rings[0]);assert all(len(r)==n for r in rings)
  faces=[tuple(reversed(range(n))),tuple(range((len(rings)-1)*n,len(rings)*n))]
  for k in range(len(rings)-1):
   faces += [(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for i in range(n)]
  return self.mesh(j,name,[v for r in rings for v in r],faces,key,bevel,smooth)

 def panel(self,j,name,pts,depth=(0,0,-.16),key='blue',bevel=.025,wear=True):
  # Independent outer slab, tiny bevel, deep opaque side walls. No inflated smooth plate faces.
  pts=[Vector(p) for p in pts];cent=sum(pts,Vector())/len(pts);offset=Vector(depth)
  # A stamped plate is a plane. Project the outline before beveling so glTF
  # triangulation cannot introduce unintended diagonal shading across its face.
  _,_,sv=np.linalg.svd(np.array([p-cent for p in pts]))
  plane=Vector(sv[-1]);plane*=1 if plane.dot(-offset)>=0 else -1
  pts=[p-plane*(p-cent).dot(plane) for p in pts]
  cent=sum(pts,Vector())/len(pts);normal=plane
  front=[p+(cent-p).normalized()*min(bevel,(cent-p).length*.15) for p in pts]
  rings=[[p+offset for p in pts],[p-normal*bevel for p in pts],front]
  n=len(pts);faces=[tuple(reversed(range(n))),tuple(range(2*n,3*n))]
  keys=['dark',key]
  for k in range(2):
   for i in range(n):
    faces.append((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i));keys.append(key if k==1 else 'dark')
  obj=self.mesh(j,name,[p for r in rings for p in r],faces,key,face_keys=keys)
  if wear and key not in ('recess','rubber','dark','cyan','amber'):
   self.wear(j,name,front,normal,key)
  return obj

 def wear(self,j,name,pts,normal,key):
  # Sparse, short chips at exposed edges; never a uniform bright outline.
  verts=[];faces=[]
  for a,b in zip(pts,pts[1:]+pts[:1]):
   edge=b-a; length=edge.length
   count=int(length*1.6)+int(self.rng.random()<.45)
   for k in range(count):
    t=self.rng.uniform(.08,.90); span=min(.17/ max(length,.01),self.rng.uniform(.018,.07))
    p=a+edge*t+normal*.0035;q=a+edge*min(t+span,.98)+normal*.004
    inside=(sum(pts,Vector())/len(pts)-(p+q)*.5).normalized()
    width=self.rng.uniform(.006,.022)
    idx=len(verts);verts.extend([p,q,q+inside*width,p+inside*width*.4]);faces.append((idx,idx+1,idx+2,idx+3))
  if faces:self.mesh(j,name+'｜邊緣磨耗',verts,faces,'edge')

 def box(self,j,name,center,size,key='armor',bevel=.025,rot=(0,0,0)):
  x,y,z=[s*.5 for s in size];R=Euler(rot).to_matrix();C=Vector(center)
  vs=[C+R@Vector(p) for p in [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]]
  return self.mesh(j,name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],key,bevel)

 def basis(self,d):
  axis=Vector(d).normalized();u=axis.cross(Vector((0,0,1) if abs(axis.z)<.9 else (0,1,0))).normalized()
  return axis,u,axis.cross(u).normalized()

 def cyl(self,j,name,a,b,r,key='steel',n=12,r2=None,bevel=0,glow=False):
  a,b=Vector(a),Vector(b);axis,u,v=self.basis(b-a);r2=r if r2 is None else r2
  verts=[p+(u*cos(i*tau/n)+v*sin(i*tau/n))*radius for p,radius in ((a,r),(b,r2)) for i in range(n)]
  faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
  return self.mesh(j,name,verts,faces,key,bevel,True,glow)

 def ring(self,j,name,c,axis,outer,inner,key='steel',depth=.08,n=16,glow=False):
  axis,u,v=self.basis(axis);c=Vector(c)
  verts=[c+axis*h+(u*cos(i*tau/n)+v*sin(i*tau/n))*r for h,r in ((-depth/2,outer),(depth/2,outer),(depth/2,inner),(-depth/2,inner)) for i in range(n)]
  faces=[(k*n+i,k*n+(i+1)%n,((k+1)%4)*n+(i+1)%n,((k+1)%4)*n+i) for k in range(4) for i in range(n)]
  return self.mesh(j,name,verts,faces,key,smooth=True,glow=glow)

 def bolt(self,j,p,axis=(0,0,1),r=.048):
  p=Vector(p);a=Vector(axis).normalized()
  self.cyl(j,'埋頭緊固件',p-a*.006,p+a*.018,r,'dark',6)
  self.cyl(j,'內六角螺孔',p+a*.019,p+a*.021,r*.40,'recess',6)

 def piston(self,j,name,a,b,r=.19):
  a,b=Vector(a),Vector(b);axis=(b-a).normalized()
  self.cyl(j,name+'｜油壓缸筒',a,lerp(a,b,.60),r,'dark',12)
  self.cyl(j,name+'｜拋光活塞桿',lerp(a,b,.51),b,r*.56,'chrome',12)
  for t in (.08,.53,.60):
   c=Vector(lerp(a,b,t));self.ring(j,name+'｜壓力密封',c,axis,r*1.07,r*.73,'steel',.075,12)
  for p in (a,b):
   self.cyl(j,name+'｜軸頭',p+Vector((-.13,0,0)),p+Vector((.13,0,0)),r*1.18,'steel',10)

 def tube(self,j,name,points,r=.055,key='rubber',n=8):
  for a,b in zip(points,points[1:]):self.cyl(j,name,a,b,r,key,n)

 def fit_heads(self):
  # Nine head lengths, measured from helmet crown to soles in the grounded pose.
  # Neck bearings, antennas above the crown and propulsion packs are not body height.
  crown=16.70;standing_height=crown+self.rig['M07_Body'].location.z
  height=standing_height/9;measurements={}
  for variant,objects in self.heads.items():
   assert not any('肩' in obj.name or '推進' in obj.name for obj in objects),variant
   points=[v.co for obj in objects for v in obj.data.vertices]
   low=min(p.z for p in points);high=max(p.z for p in points)
   depth=(min(p.y for p in points)+max(p.y for p in points))*.5
   vertical=height/(high-low);horizontal=min(1,vertical)
   for obj in objects:
    obj['headVariant']=variant
    mesh=obj.data;normals=[n.vector.copy() for n in mesh.corner_normals]
    for v in mesh.vertices:
     v.co.x*=horizontal;v.co.y=depth+(v.co.y-depth)*horizontal
     v.co.z=crown-(high-v.co.z)*vertical
    mesh.update()
    mesh.normals_split_custom_set([Vector((n.x/horizontal,n.y/horizontal,n.z/vertical)).normalized() for n in normals])
   measurements[variant]={'headHeight':height,'standingHeight':standing_height,'heads':9}
  self.rig['M07_Upper']['headProportions']=measurements

 def export(self,path):
  bpy.context.view_layer.update()
  temps=[]
  for j,parts in self.parts.items():
   for variant,kind in [(v,k) for v in ('common','cangyan','bailu','tiechao') for k in ('armor','optics','glass')]:
    glow=kind=='optics'
    objs=[obj for obj,g in parts if obj['mechVariant']==variant and obj['surfaceKind']==kind]
    if not objs:continue
    def detail(obj):
     return any(k in obj.name for k in ('緊固件','螺孔','磨耗','嵌環','密封','指節','散熱縫','刻線','銘牌','排線扣','散熱口','冷卻槽','止滑齒','扣件','卡榫','護環','內環','外蓋')) or max(obj.dimensions)<.30
    if not glow:objs.sort(key=detail)
    low_indices=sum((len(face.vertices)-2)*3 for obj in objs if glow or not detail(obj) for face in obj.data.polygons)
    vs=[];fs=[];colors=[];finishes=[];teams=[];ns=[];source_mats=[];face_mats=[]
    for o in objs:
     mesh=o.data;mesh.calc_loop_triangles()
     offset=len(vs);vs.extend(v.co[:] for v in mesh.vertices)
     normals=mesh.corner_normals
     for face in mesh.polygons:
      fs.append(tuple(offset+i for i in face.vertices))
      mat=mesh.materials[face.material_index];p=mat.node_tree.nodes.get('Principled BSDF')
      if mat not in source_mats:source_mats.append(mat)
      face_mats.append(source_mats.index(mat))
      color=p.inputs['Base Color'].default_value[:]
      key=mat.name.replace(' emission','').split('.')[0]
      mask=PALETTE[key][3]
      # Non-emissive finishes vary mildly between separate armor components.
      rough=p.inputs['Roughness'].default_value;metal=p.inputs['Metallic'].default_value
      for loop in face.loop_indices:
       normal=normals[loop].vector
       colors.append(color);finishes.append((rough,1-metal));teams.append((mask,0));ns.append(normal[:])
    me=bpy.data.meshes.new(j+' merged');me.from_pydata(vs,[],fs);me.update()
    for p in me.polygons:p.use_smooth=True
    me.normals_split_custom_set(ns)
    attr=me.color_attributes.new(name='SurfaceColor',type='BYTE_COLOR',domain='CORNER');me.color_attributes.active_color=attr
    uv=me.uv_layers.new(name='Finish');team=me.uv_layers.new(name='Team')
    for i,(col,fin,mask) in enumerate(zip(colors,finishes,teams)):
     attr.data[i].color=col;uv.data[i].uv=fin;team.data[i].uv=mask
    m=bpy.data.materials.get('M07_Optics' if glow else 'M07_Armor')
    if m is None:
     m=bpy.data.materials.new('M07_Optics' if glow else 'M07_Armor');m.use_nodes=True
     a=m.node_tree.nodes.new('ShaderNodeVertexColor');a.layer_name='SurfaceColor'
     m.node_tree.links.new(a.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    if kind!='armor':me.materials.append(m)
    else:
     for src in source_mats:me.materials.append(src)
     for face,index in zip(me.polygons,face_mats):face.material_index=index
    o=bpy.data.objects.new(j+('' if variant=='common' else '_'+variant)+'_'+kind,me);self.col.objects.link(o);o.parent=self.rig[j];o['lowDetailIndexCount']=low_indices;o['mechVariant']=variant;temps.append(o)
  __import__('atlas').bake(self,temps)
  bpy.ops.object.select_all(action='DESELECT')
  for obj in [*self.rig.values(),*temps]:obj.select_set(True)
  bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_vertex_color='ACTIVE',export_materials='EXPORT',export_animations=False,export_extras=True)
  tris=sum(len(o.data.loop_triangles) if o.data.loop_triangles else sum(len(f.vertices)-2 for f in o.data.polygons) for o in temps)
  print('M07_GEOMETRY',sum(len(p) for p in self.parts.values()),'editable parts;',len(temps),'batches;',tris,'triangles')
  for obj in temps:bpy.data.objects.remove(obj,do_unlink=True)
