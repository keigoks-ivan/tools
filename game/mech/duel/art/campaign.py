"""Export the same Cangyan geometry with separate joints for campaign interactions.

The duel keeps its merged upper body. Campaigns download only Cangyan and expose
head, elbow and hatch pivots for the existing aim, saber and boarding animation.
"""
import bpy

def export(b,path):
 heads=set(b.heads['cangyan'])
 for name in ('Head','Arm_L','Arm_R','Forearm_L','Hatch'):
  joint='M07_'+name
  o=bpy.data.objects.new(joint,None);b.col.objects.link(o)
  o.parent=b.rig['M07_Upper'];b.rig[joint]=o;b.parts[joint]=[]
 for joint,parts in list(b.parts.items()):
  retained=[]
  for obj,glow in list(parts):
   if obj['mechVariant'] not in ('common','cangyan'):
    bpy.data.objects.remove(obj,do_unlink=True);continue
   role='Head' if obj in heads else obj.get('campaignRole')
   target='M07_'+role if role in ('Head','Arm_L','Arm_R','Forearm_L','Hatch') else joint
   if target!=joint:
    obj.parent=b.rig[target];b.parts[target].append((obj,glow))
   else:retained.append((obj,glow))
   obj.hide_render=obj.hide_viewport=False
  # Newly populated partitions are visited later; retain their own contents.
  b.parts[joint]=retained
 b.rig['M07_Rifle'].rotation_euler.x=0
 b.rig['M07_Upper']['campaignRig']=1
 b.export(path)
