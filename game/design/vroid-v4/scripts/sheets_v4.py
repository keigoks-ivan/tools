import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, math, toonlib as T, lookdev as LD
from mathutils import Vector
W = os.environ.get('VROID_V4_WORK', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work')) + '/'
os.makedirs(W + 'sheets', exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=W+'v4_animated.blend')
LD.apply()
cam=T.setup_render((420,520))
rig=bpy.data.objects['Armature']; sc=bpy.context.scene
clips=sys.argv[sys.argv.index('--')+1].split(',')
for clip in clips:
    a=bpy.data.actions[clip]; rig.animation_data.action=a
    s,e=a.frame_range
    for k,t in enumerate((0,.25,.5,.75,.98)):
        f=s+(e-s)*t; sc.frame_set(int(f),subframe=f-int(f)); bpy.context.view_layer.update()
        hp=rig.matrix_world@rig.pose.bones['J_Bip_C_Hips'].head
        tgt=Vector((hp.x,hp.y,max(0.55,hp.z)))
        T.aim(cam,tgt+Vector((-1.9,-3.1,0.9)),tgt,ortho=2.3); T.render(W+f'sheets/{clip}_{k}.png')
