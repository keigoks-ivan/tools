"""The same outward stance used by the game, posed on the editable source rig."""
from math import pi
import bpy
from mathutils import Quaternion

def stand(rig):
 body=rig['M07_Body'];stance=body['idleStance'];basis=Quaternion((1,0,0),pi/2)
 for s,label in ((-1,'L'),(1,'R')):
  thigh=rig['M07_Thigh_'+label];shin=rig['M07_Shin_'+label];foot=rig['M07_Foot_'+label]
  hip=Quaternion((0,1,0),s*stance['turn']) @ Quaternion((0,0,1),s*stance['spread'])
  sole=hip.inverted() @ Quaternion((0,1,0),s*stance['toe'])
  for obj,rotation in ((thigh,hip),(shin,Quaternion()),(foot,sole)):
   obj.rotation_mode='QUATERNION';obj.rotation_quaternion=basis @ rotation @ basis.conjugated()
 bpy.context.view_layer.update()
 floor=min((obj.matrix_world @ v.co).z for side in 'LR'
           for obj in rig['M07_Foot_'+side].children if obj.type=='MESH' for v in obj.data.vertices)
 body.location.z-=floor
 bpy.context.view_layer.update()
