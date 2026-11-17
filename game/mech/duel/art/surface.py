"""Painted alloy finishes baked once into a shared game atlas."""
import bpy
from geometry import PALETTE, material

def install():
 for key in PALETTE:
  if key in ('cyan','amber'):continue
  mat=material(key);nodes=mat.node_tree.nodes;links=mat.node_tree.links;p=nodes.get('Principled BSDF')
  if key=='visor':
   p.inputs['Coat Weight'].default_value=.65;p.inputs['Coat Roughness'].default_value=.11
   continue
  if key in ('rubber','recess'):continue
  def node(typ):return nodes.new(typ)
  def math(op,a,b=0,c=0):
   n=node('ShaderNodeMath');n.operation=op
   for i,v in enumerate((a,b,c)):
    if i>=len(n.inputs):break
    if isinstance(v,(int,float)):n.inputs[i].default_value=v
    else:links.new(v,n.inputs[i])
   return n.outputs[0]
  def mix(a,b,f,mode='MIX'):
   n=node('ShaderNodeMixRGB');n.blend_type=mode
   for i,v in enumerate((f,a,b)):
    if isinstance(v,(int,float)):n.inputs[i].default_value=v
    elif isinstance(v,tuple):n.inputs[i].default_value=v
    else:links.new(v,n.inputs[i])
   return n.outputs[0]
  def ramp(value,stops):
   n=node('ShaderNodeValToRGB');r=n.color_ramp
   while len(r.elements)>2:r.elements.remove(r.elements[-1])
   r.elements[0].position=stops[0][0];r.elements[0].color=(stops[0][1],)*3+(1,)
   r.elements[1].position=stops[-1][0];r.elements[1].color=(stops[-1][1],)*3+(1,)
   for pos,c in stops[1:-1]:e=r.elements.new(pos);e.color=(c,c,c,1)
   links.new(value,n.inputs[0]);return n.outputs[0]
  geo=node('ShaderNodeNewGeometry')
  def noise(scale,detail=3,rough=.65):
   n=node('ShaderNodeTexNoise');n.inputs['Scale'].default_value=scale;n.inputs['Detail'].default_value=detail;n.inputs['Roughness'].default_value=rough
   links.new(geo.outputs['Position'],n.inputs['Vector']);return n.outputs['Fac']
  broad=noise(3.4,3);fine=noise(62,3);micro=noise(220,2)
  # Broken chips follow convex machined edges; broad faces keep their pigment.
  bevel=node('ShaderNodeBevel');bevel.inputs['Radius'].default_value=.035;bevel.samples=4
  dot=node('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';links.new(geo.outputs['Normal'],dot.inputs[0]);links.new(bevel.outputs['Normal'],dot.inputs[1])
  edge=ramp(math('SUBTRACT',1,dot.outputs['Value']),[(.001,0),(.065,1)])
  breakup=ramp(fine,[(.47,0),(.67,1)])
  wear=math('MULTIPLY',edge,breakup)
  paint=p.inputs['Base Color'].default_value[:]
  variation=math('MULTIPLY_ADD',broad,.32,.82)
  base=mix(paint,variation,1,'MULTIPLY')
  is_paint=key in ('blue','blue2','navy','armor','armor2','orange','orange2','bone')
  if is_paint:
   # A dark primer halo sits just inside chipped, exposed steel.
   halo=math('MULTIPLY',edge,.36)
   base=mix(base,(.025,.029,.032,1),halo)
   base=mix(base,(.19,.205,.21,1),math('MULTIPLY',wear,.88))
  ao=node('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=.38;ao.samples=8
  base=mix(base,ao.outputs['Color'],.62,'MULTIPLY')
  links.new(base,p.inputs['Base Color'])
  rough=math('MULTIPLY_ADD',fine,.18,PALETTE[key][1]-.06)
  if is_paint:rough=math('SUBTRACT',rough,math('MULTIPLY',wear,.13))
  links.new(rough,p.inputs['Roughness'])
  metal=math('MULTIPLY_ADD',wear,.86 if is_paint else .06,PALETTE[key][2])
  links.new(metal,p.inputs['Metallic'])
  p.inputs['Coat Weight'].default_value=.13 if is_paint else .0
  p.inputs['Coat Roughness'].default_value=.32
  bump=node('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.004
  links.new(math('ADD',math('MULTIPLY',fine,.65),math('MULTIPLY',micro,.35)),bump.inputs['Height'])
  links.new(bump.outputs[0],p.inputs['Normal'])
