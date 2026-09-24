"""Render one arm-lowered rig check; this is not a combat animation."""
import math
from pathlib import Path
import bpy
from mathutils import Matrix,Vector

here=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(here/'vroid-swordswoman-costume-prototype-v3.blend'))
rig=bpy.data.objects['Armature']
scene=bpy.context.scene

def rotate_from_rest(name,axis,degrees):
    pb=rig.pose.bones[name]
    head=pb.bone.head_local
    R=Matrix.Translation(head) @ Matrix.Rotation(math.radians(degrees),4,axis) @ Matrix.Translation(-head)
    pb.matrix=R @ pb.bone.matrix_local

rotate_from_rest('J_Bip_R_UpperArm','Y',-55)
rotate_from_rest('J_Bip_L_UpperArm','Y',55)
bpy.context.view_layer.update()

camera=scene.camera
camera.location=(-2.6,-3.2,1.2)
camera.rotation_euler=(Vector((0,0,.84))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(here/'vroid-swordswoman-costume-v3-pose.png')
bpy.ops.render.render(write_still=True)
print('POSE_REVIEW_OK')
