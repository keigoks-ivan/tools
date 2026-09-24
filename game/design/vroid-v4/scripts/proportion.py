import bpy
from mathutils import Vector
def zmap(z, k, pivot):
    return z*k if z < pivot else z + pivot*(k-1)
def lengthen_legs(k=1.12, pivot=0.868):
    """Stretch everything below the hip joints by k; shift everything above up to stay attached."""
    rig=bpy.data.objects['Armature']
    def mapw(v):
        return Vector((v.x, v.y, zmap(v.z, k, pivot)))
    for o in bpy.context.scene.objects:
        if o.type!='MESH': continue
        M=o.matrix_world; Mi=M.inverted()
        me=o.data
        if me.shape_keys:
            for kb in me.shape_keys.key_blocks:
                for d in kb.data: d.co=Mi@mapw(M@d.co)
            basis=me.shape_keys.reference_key
            for v,d in zip(me.vertices,basis.data): v.co=d.co
        else:
            for v in me.vertices: v.co=Mi@mapw(M@v.co)
        me.update()
    bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    M=rig.matrix_world; Mi=M.inverted()
    for b in rig.data.edit_bones:
        roll=b.roll
        b.head=Mi@mapw(M@b.head); b.tail=Mi@mapw(M@b.tail); b.roll=roll
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.scene.objects:
        if o.type=='EMPTY' and o.parent==rig: pass
