import bpy
def toon_inplace(mat, shade=(0.66,0.58,0.76), threshold=0.42, rim=0, rim_col=(0.8,0.72,1.0)):
    """Keep VRoid's unlit graph (UV transforms, alpha); multiply its colour by a 2-band light term."""
    nt=mat.node_tree; N=nt.nodes; L=nt.links
    em=next((n for n in N if n.type=='EMISSION'),None)
    if em is None or not em.inputs['Color'].links: return False
    src=em.inputs['Color'].links[0].from_socket
    diff=N.new('ShaderNodeBsdfDiffuse'); s2r=N.new('ShaderNodeShaderToRGB'); L.new(diff.outputs[0],s2r.inputs[0])
    ramp=N.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation='CONSTANT'
    ramp.color_ramp.elements[0].color=(*shade,1); ramp.color_ramp.elements[1].position=threshold
    L.new(s2r.outputs['Color'],ramp.inputs['Fac'])
    mul=N.new('ShaderNodeMix'); mul.data_type='RGBA'; mul.blend_type='MULTIPLY'; mul.inputs['Factor'].default_value=1
    L.new(src,mul.inputs['A']); L.new(ramp.outputs['Color'],mul.inputs['B']); out=mul.outputs['Result']
    if rim:
        lw=N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value=0.3
        rr=N.new('ShaderNodeMapRange'); rr.inputs['From Min'].default_value=0.72; rr.inputs['From Max'].default_value=0.8
        rr.inputs['To Max'].default_value=rim; L.new(lw.outputs['Facing'],rr.inputs['Value'])
        # rim light scales with the surface colour so dark cloth stays dark
        tint=N.new('ShaderNodeMix'); tint.data_type='RGBA'; tint.blend_type='MULTIPLY'; tint.inputs['Factor'].default_value=1
        L.new(src,tint.inputs['A']); tint.inputs['B'].default_value=(*rim_col,1)
        boost=N.new('ShaderNodeMix'); boost.data_type='RGBA'; boost.blend_type='ADD'; boost.inputs['Factor'].default_value=1
        L.new(tint.outputs['Result'],boost.inputs['A']); boost.inputs['B'].default_value=(0.03,0.025,0.045,1)
        add=N.new('ShaderNodeMix'); add.data_type='RGBA'; add.blend_type='ADD'
        L.new(rr.outputs['Result'],add.inputs['Factor']); L.new(out,add.inputs['A']); L.new(boost.outputs['Result'],add.inputs['B']); out=add.outputs['Result']
    L.new(out,em.inputs['Color'])
    return True
