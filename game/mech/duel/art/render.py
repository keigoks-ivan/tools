from pathlib import Path
import sys, math
import bpy
from mathutils import Vector
WORK=Path(__file__).resolve().parent
sys.path.insert(0,str(WORK))
from geometry import OUT
bpy.ops.wm.open_mainfile(filepath=str(OUT/'M-07-蒼焰-v7.blend'))
scene=bpy.context.scene
quick='--quick' in sys.argv
views=['hero','front','side','rear','head']
requested=next((v for v in views if '--'+v in sys.argv),None)
if requested:views=[requested]

def aim(o,pt):o.rotation_euler=(Vector(pt)-o.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,at,power,color,size,size_y):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='RECTANGLE';d.size=size;d.size_y=size_y
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;aim(o,at)
scene.world=bpy.data.worlds.new('中性工業攝影棚');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.20,.23,.27,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.30
area('柔和主光',(-12,-16,23),(0,0,9),6500,(1,.90,.79),11,15)
area('前側反射板',(13,-9,15),(0,0,8),2600,(.76,.85,1),6,13)
area('背面輪廓光',(-10,9,18),(0,0,10),8000,(1,.73,.52),8,12)
area('右後方反射板',(11,8,16),(0,0,9),3500,(.62,.79,1),5,13)
area('上方反射板',(0,2,25),(0,0,9),2200,(.88,.93,1),11,9)
bpy.ops.mesh.primitive_plane_add(size=2000,location=(0,0,-.012))
floor=bpy.context.object;floor.name='展示地面'
m=bpy.data.materials.new('攝影棚石墨地面');m.use_nodes=True
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.034,.038,.042,1)
m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.6
floor.data.materials.append(m)
d=bpy.data.cameras.new('真實模型檢視');camera=bpy.data.objects.new('真實模型檢視',d);scene.collection.objects.link(camera);scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=12 if quick else 40
scene.cycles.use_denoising=True;scene.cycles.adaptive_threshold=.05 if quick else .025
scene.cycles.max_bounces=5;scene.cycles.diffuse_bounces=2;scene.cycles.glossy_bounces=3
scene.render.threads_mode='FIXED';scene.render.threads=6
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=0
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
# Hand, forearm and rifle move as one at their elbow.
bpy.data.objects['M07_Rifle'].rotation_euler.x=.98
for view in views:
 d.type='ORTHO';d.sensor_fit='HORIZONTAL'
 if view=='hero':camera.location=(22,-43,16);target=(0,0,8.1);d.ortho_scale=14.0;size=(900,1150)
 elif view=='front':camera.location=(0,-50,8.2);target=(0,0,8.2);d.ortho_scale=12.5;size=(780,1150)
 elif view=='side':camera.location=(50,0,8.2);target=(0,0,8.2);d.ortho_scale=10;size=(640,1150)
 elif view=='rear':camera.location=(-20,43,14);target=(0,0,8.1);d.ortho_scale=13.5;size=(850,1150)
 elif view=='head':camera.location=(7,-16,15.6);target=(0,-.45,14.8);d.ortho_scale=4.4;size=(1000,850)
 aim(camera,target)
 scene.render.resolution_x,scene.render.resolution_y=[int(n*(.65 if quick else 1)) for n in size]
 scene.render.filepath=str(OUT/(view+('-quick' if quick else '')+'.png'))
 bpy.ops.render.render(write_still=True)
 print('RENDERED',scene.render.filepath,flush=True)
