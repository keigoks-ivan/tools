"""Bake shared color and packed roughness/metalness without extra render batches."""
import math
import bpy
from geometry import OUT

def bake(builder, meshes):
 armor=[o for o in meshes if o.name.endswith('_armor')]
 originals=[o for parts in builder.parts.values() for o,_ in parts]
 for o in originals:o.hide_render=True
 bpy.ops.object.select_all(action='DESELECT')
 for o in armor:
  o.select_set(True);o.data.uv_layers.new(name='Atlas');o.data.uv_layers.active_index=2
 bpy.context.view_layer.objects.active=armor[0]
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
 bpy.ops.uv.smart_project(angle_limit=math.radians(78),island_margin=.001,correct_aspect=True,scale_to_bounds=False)
 bpy.ops.uv.average_islands_scale()
 bpy.ops.uv.pack_islands(rotate=True,margin=.001,shape_method='CONVEX')
 bpy.ops.object.mode_set(mode='OBJECT')
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12
 scene.cycles.use_denoising=False;scene.render.bake.use_clear=True;scene.render.bake.margin=3
 mats=set(m for o in armor for m in o.data.materials)
 saved={};targets={};emissions={};temporary=[]
 for m in mats:
  n=m.node_tree.nodes;l=m.node_tree.links
  out=next(x for x in n if x.type=='OUTPUT_MATERIAL');p=n.get('Principled BSDF')
  saved[m]=out.inputs['Surface'].links[0].from_socket
  e=n.new('ShaderNodeEmission');e.inputs['Strength'].default_value=1;emissions[m]=e
  l.new(e.outputs[0],out.inputs['Surface'])
  tex=n.new('ShaderNodeTexImage');targets[m]=tex;n.active=tex
 images=[]
 try:
  for kind,size in (('Color',1024),('Finish',512)):
   image=bpy.data.images.new('M07_'+kind,width=size,height=size,alpha=False)
   image.colorspace_settings.name='sRGB' if kind=='Color' else 'Non-Color'
   for m in mats:
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');e=emissions[m]
    for link in list(e.inputs['Color'].links):l.remove(link)
    def wire(src,dst):
     if src.is_linked:l.new(src.links[0].from_socket,dst)
     else:dst.default_value=src.default_value
    if kind=='Color':wire(p.inputs['Base Color'],e.inputs['Color'])
    else:
     combine=n.new('ShaderNodeCombineColor');temporary.append((n,combine));combine.mode='RGB';combine.inputs[0].default_value=1
     wire(p.inputs['Roughness'],combine.inputs[1]);wire(p.inputs['Metallic'],combine.inputs[2]);l.new(combine.outputs[0],e.inputs['Color'])
    targets[m].image=image;n.active=targets[m]
   print('BAKING',kind,size,flush=True)
   bpy.ops.object.bake(type='EMIT')
   image.file_format='JPEG' if kind=='Color' else 'PNG';image.filepath_raw=str(OUT/('m07-color.jpg' if kind=='Color' else 'm07-finish.png'))
   image.save();image.pack();images.append(image)
 finally:
  for m in mats:
   n=m.node_tree.nodes;l=m.node_tree.links;out=next(x for x in n if x.type=='OUTPUT_MATERIAL')
   l.new(saved[m],out.inputs['Surface']);n.remove(emissions[m]);n.remove(targets[m])
  for n,obj in temporary:n.remove(obj)
  for o in originals:o.hide_render=False
 mat=bpy.data.materials.new('M07_ArmorAtlas');mat.use_nodes=True
 n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=1;p.inputs['Metallic'].default_value=1
 uv=n.new('ShaderNodeUVMap');uv.uv_map='Atlas'
 color=n.new('ShaderNodeTexImage');color.image=images[0];l.new(uv.outputs[0],color.inputs[0]);l.new(color.outputs['Color'],p.inputs['Base Color'])
 finish=n.new('ShaderNodeTexImage');finish.image=images[1];l.new(uv.outputs[0],finish.inputs[0])
 sep=n.new('ShaderNodeSeparateColor');l.new(finish.outputs['Color'],sep.inputs[0]);l.new(sep.outputs[1],p.inputs['Roughness']);l.new(sep.outputs[2],p.inputs['Metallic'])
 for o in armor:
  o.data.materials.clear();o.data.materials.append(mat)
  for face in o.data.polygons:face.material_index=0
  o.data.uv_layers.active_index=0;o.data.uv_layers[0].active_render=True
 print('BAKED_ATLAS',[(im.name,tuple(im.size)) for im in images],flush=True)
 return images
