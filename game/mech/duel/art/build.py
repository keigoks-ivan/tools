"""Build the editable Blender model and the raw glTF from the same geometry.

Set M07_ART_OUTPUT to an output directory, then run Blender in background with
--python build.py, followed by Python pack.py. Outputs are not source files.
"""
from pathlib import Path
import sys
import bpy
from mathutils import Vector
WORK=Path(__file__).resolve().parent
sys.path.insert(0,str(WORK))
from geometry import Builder, OUT
bpy.ops.wm.read_factory_settings(use_empty=True)
b=Builder()
for module in ('chassis','legs','arms','head'):
 __import__(module).build(b)
__import__('surface').install()
bpy.context.scene.unit_settings.system='METRIC'
b.export(OUT/'m07-cangyan.raw.glb')
b.rig['M07_Rifle'].rotation_euler.x=.98
bpy.ops.object.select_all(action='DESELECT')
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   s=area.spaces.active;s.region_3d.view_location=(0,0,8);s.region_3d.view_distance=30
   s.region_3d.view_rotation=Vector((-19,34,-12)).to_track_quat('-Z','Y');s.clip_end=500
   s.shading.color_type='MATERIAL';s.overlay.show_extras=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'M-07-蒼焰-v7.blend'),compress=True)
