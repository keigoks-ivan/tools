import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, toonlib as T, swordlib as SW
W = os.environ.get('VROID_V4_WORK', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work')) + '/'
bpy.ops.wm.open_mainfile(filepath=W+'v4_wip.blend')
dg=bpy.context.evaluated_depsgraph_get(); tris=0
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        # count without the review-only ink outline shell
        mods=[m for m in o.modifiers if m.name=='Ink outline']
        for m in mods: m.show_viewport=False
bpy.context.view_layer.update(); dg=bpy.context.evaluated_depsgraph_get()
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        e=o.evaluated_get(dg); me=e.to_mesh(); tris+=sum(len(p.vertices)-2 for p in me.polygons); e.to_mesh_clear()
print('TRIS',tris)
for o in bpy.context.scene.objects:
    for m in o.modifiers:
        if m.name=='Ink outline': m.show_viewport=True
rig=bpy.data.objects['Armature']; SW.pose_design(rig)
sc=bpy.context.scene; sc.render.resolution_x=700; sc.render.resolution_y=1000; cam=sc.camera
for nm,loc in (('front',(-1.2,-3.6,1.0)),('side',(3.8,-0.3,0.9)),('back',(0.6,3.8,1.0))):
    T.aim(cam,loc,(0,0,0.94),ortho=2.0); T.render(W+f'r_{nm}.png')
sc.render.resolution_x=700; sc.render.resolution_y=700
T.aim(cam,(-0.35,-1.05,1.55),(0,0,1.52),lens=95); T.render(W+'r_face.png')
