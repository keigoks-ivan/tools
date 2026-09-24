import os as _os
_REPO = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..', '..', '..', '..'))  # repo root
import bpy, math
from mathutils import Vector
def load_base(path=_os.path.join(_REPO, 'game/design/vroid-swordswoman-base-v3.vrm')):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in list(bpy.context.scene.objects):
        if o.type=='MESH' and o.name=='Icosphere': bpy.data.objects.remove(o,do_unlink=True)
def base_tex(mat):
    if not mat.use_nodes: return None
    p=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if not p: return None
    l=p.inputs['Base Color'].links
    if l and l[0].from_node.type=='TEX_IMAGE': return l[0].from_node.image
    return None
def toon(mat, shade=(0.62,0.55,0.72), steps=((0.0,0.0),(0.42,1.0)), color=None, tex=None, rim=0.15, alpha_tex=True):
    """Rebuild material as 2-band toon: lit colour vs tinted shade colour."""
    image = tex if tex is not None else base_tex(mat)
    old=mat.node_tree.nodes if mat.use_nodes else None
    p=next((n for n in old if n.type=='BSDF_PRINCIPLED'),None) if old else None
    base_rgba = tuple(p.inputs['Base Color'].default_value) if p else (1,1,1,1)
    mat.use_nodes=True
    nt=mat.node_tree; nt.nodes.clear(); N=nt.nodes; L=nt.links
    out=N.new('ShaderNodeOutputMaterial')
    diff=N.new('ShaderNodeBsdfDiffuse')
    s2r=N.new('ShaderNodeShaderToRGB'); L.new(diff.outputs[0],s2r.inputs[0])
    ramp=N.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation='CONSTANT'
    L.new(s2r.outputs['Color'],ramp.inputs['Fac'])
    e=ramp.color_ramp.elements
    e[0].position=0; e[0].color=(0,0,0,1); e[1].position=steps[1][0]; e[1].color=(1,1,1,1)
    if color is not None: col=N.new('ShaderNodeRGB'); col.outputs[0].default_value=color; colout=col.outputs[0]; aout=None
    elif image is not None:
        t=N.new('ShaderNodeTexImage'); t.image=image; colout=t.outputs['Color']; aout=t.outputs['Alpha']
        if p and p.inputs['Base Color'].default_value[:3]!=(1,1,1):
            mul=N.new('ShaderNodeMix'); mul.data_type='RGBA'; mul.blend_type='MULTIPLY'; mul.inputs['Factor'].default_value=1
            L.new(colout,mul.inputs['A']); mul.inputs['B'].default_value=base_rgba; colout=mul.outputs['Result']
    else:
        col=N.new('ShaderNodeRGB'); col.outputs[0].default_value=base_rgba; colout=col.outputs[0]; aout=None
    shade_mix=N.new('ShaderNodeMix'); shade_mix.data_type='RGBA'; shade_mix.blend_type='MULTIPLY'; shade_mix.inputs['Factor'].default_value=1
    L.new(colout,shade_mix.inputs['A']); shade_mix.inputs['B'].default_value=(*shade,1)
    mix=N.new('ShaderNodeMix'); mix.data_type='RGBA'
    L.new(ramp.outputs['Color'],mix.inputs['Factor']); L.new(shade_mix.outputs['Result'],mix.inputs['A']); L.new(colout,mix.inputs['B'])
    final=mix.outputs['Result']
    if rim:
        lw=N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value=0.25
        rr=N.new('ShaderNodeValToRGB'); rr.color_ramp.interpolation='CONSTANT'; rr.color_ramp.elements[1].position=0.78
        L.new(lw.outputs['Facing'],rr.inputs['Fac'])
        mr=N.new('ShaderNodeMath'); mr.operation='MULTIPLY'; mr.inputs[1].default_value=rim
        L.new(rr.outputs['Color'],mr.inputs[0])
        mr2=N.new('ShaderNodeMath'); mr2.operation='MULTIPLY'; L.new(mr.outputs[0],mr2.inputs[0]); L.new(ramp.outputs['Color'],mr2.inputs[1])
        add=N.new('ShaderNodeMix'); add.data_type='RGBA'; add.blend_type='ADD'
        L.new(mr2.outputs[0],add.inputs['Factor']); L.new(final,add.inputs['A']); add.inputs['B'].default_value=(0.75,0.7,1,1)
        final=add.outputs['Result']
    em=N.new('ShaderNodeEmission'); L.new(final,em.inputs[0])
    if aout is not None and alpha_tex and image is not None and mat.blend_method!='OPAQUE' or (aout is not None and mat.name.find('Eye')>=0 or aout is not None and 'HAIR' in mat.name or aout is not None and 'FACE' in mat.name):
        tr=N.new('ShaderNodeBsdfTransparent'); ms=N.new('ShaderNodeMixShader')
        L.new(aout,ms.inputs[0]); L.new(tr.outputs[0],ms.inputs[1]); L.new(em.outputs[0],ms.inputs[2]); L.new(ms.outputs[0],out.inputs[0])
    else:
        L.new(em.outputs[0],out.inputs[0])
    return mat
def outline_mat(name='Ink outline',col=(0.05,0.03,0.08,1)):
    m=bpy.data.materials.get(name)
    if m: return m
    m=bpy.data.materials.new(name); m.use_nodes=True; nt=m.node_tree; nt.nodes.clear()
    out=nt.nodes.new('ShaderNodeOutputMaterial'); em=nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value=col
    nt.links.new(em.outputs[0],out.inputs[0]); m.use_backface_culling=True
    return m
def add_outline(obj,thick=0.0022):
    om=outline_mat(); obj.data.materials.append(om); idx=len(obj.data.materials)-1
    mod=obj.modifiers.new('Ink outline','SOLIDIFY'); mod.thickness=-thick; mod.offset=1; mod.use_flip_normals=True
    mod.material_offset=idx; mod.use_rim=False; mod.use_quality_normals=True
    for m in obj.data.materials:
        if m: m.use_backface_culling=True
def setup_render(res=(900,1125)):
    sc=bpy.context.scene; sc.render.engine='BLENDER_EEVEE'
    sc.render.resolution_x,sc.render.resolution_y=res; sc.render.film_transparent=False
    sc.view_settings.view_transform='Standard'
    w=bpy.data.worlds.new('slate'); w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.055,0.052,0.07,1); sc.world=w
    sun=bpy.data.lights.new('key','SUN'); sun.energy=3.0; so=bpy.data.objects.new('key',sun); sc.collection.objects.link(so)
    so.rotation_euler=(math.radians(50),0,math.radians(-35))
    cam=bpy.data.cameras.new('cam'); co=bpy.data.objects.new('cam',cam); sc.collection.objects.link(co); sc.camera=co
    return co
def aim(cam,loc,target,ortho=None,lens=None):
    cam.location=loc; cam.rotation_euler=(Vector(target)-Vector(loc)).to_track_quat('-Z','Y').to_euler()
    if ortho: cam.data.type='ORTHO'; cam.data.ortho_scale=ortho
    else: cam.data.type='PERSP'; cam.data.lens=lens or 50
def render(path):
    bpy.context.scene.render.filepath=path; bpy.ops.render.render(write_still=True)
