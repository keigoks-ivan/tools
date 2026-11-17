"""Deterministic small, tiling finish map; mirrored in the browser's shared surface."""
import math, random
from pathlib import Path
import bpy
from geometry import PALETTE, material, OUT

SIZE=256

def generate():
 def h(x,y):
  n=((int(x)+29)*0x21f0aaad)^((int(y)+47)*0x735a2d97)
  n&=0xffffffff
  return ((((n^(n>>14))*0x9e3779b9)&0xffffffff)>>24)/255
 def noise(x,y,span):
  gx=x/span;gy=y/span;ix=math.floor(gx);iy=math.floor(gy);fx=gx-ix;fy=gy-iy
  fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
  a=h(ix,iy)*(1-fx)+h(ix+1,iy)*fx;b=h(ix,iy+1)*(1-fx)+h(ix+1,iy+1)*fx
  return a*(1-fy)+b*fy
 data=[]
 for y in range(SIZE):
  for x in range(SIZE):
   patch=noise(x,y,32)-.5; grain=h(x,y)-.5;brush=h(x,1)-.5
   data.extend([.50+.32*patch+.10*grain,.50+.34*patch+.10*brush,.50+.10*grain+.10*brush,1.])
 for k in range(320):
  x=int(h(k,13)*255);y=int(h(k,17)*255);length=2+int(h(k,21)*37)
  dark=h(k,41)<.62
  for i in range(length):
   pos=(((y+i)%SIZE)*SIZE+(x+int(i*.06))%SIZE)*4
   fade=math.sin(math.pi*(i+1)/(length+1));amount=(-.24 if dark else .22)*fade
   data[pos]+=amount;data[pos+1]+=(.21 if dark else -.19)*fade;data[pos+2]-=.20*fade
 image=bpy.data.images.new('合金表面微紋',width=SIZE,height=SIZE,alpha=True)
 image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(data)
 image.file_format='PNG';image.filepath_raw=str(OUT/'surface.png');image.save();image.pack()
 return image

def install():
 image=generate()
 for key in PALETTE:
  if key in ('cyan','amber','recess','rubber'):continue
  mat=material(key);nodes=mat.node_tree.nodes;links=mat.node_tree.links;p=nodes.get('Principled BSDF')
  coord=nodes.new('ShaderNodeTexCoord');scale=nodes.new('ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs[3].default_value=1/2.6
  links.new(coord.outputs['Object'],scale.inputs[0])
  tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.projection='BOX';tex.projection_blend=.08;tex.extension='REPEAT'
  links.new(scale.outputs[0],tex.inputs[0]);sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs[0])
  mul=nodes.new('ShaderNodeMath');mul.operation='MULTIPLY_ADD';mul.inputs[1].default_value=.64;mul.inputs[2].default_value=.68;links.new(sep.outputs[0],mul.inputs[0])
  rgb=nodes.new('ShaderNodeRGB');rgb.outputs[0].default_value=p.inputs['Base Color'].default_value
  tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
  links.new(rgb.outputs[0],tint.inputs[1]);links.new(mul.outputs[0],tint.inputs[2]);links.new(tint.outputs[0],p.inputs['Base Color'])
  rough=nodes.new('ShaderNodeMath');rough.operation='MULTIPLY_ADD';rough.inputs[1].default_value=.36;rough.inputs[2].default_value=PALETTE[key][1]-.18
  links.new(sep.outputs[1],rough.inputs[0]);links.new(rough.outputs[0],p.inputs['Roughness'])
  bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.40;bump.inputs['Distance'].default_value=.0025
  links.new(sep.outputs[2],bump.inputs['Height']);links.new(bump.outputs[0],p.inputs['Normal'])
