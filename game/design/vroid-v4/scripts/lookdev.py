"""Review-only look: two-band toon light like the game plus an inverted-hull ink line."""
import bpy, toonlib as T, toonpatch as P
def apply():
    for m in bpy.data.materials:
        if m.users and m.use_nodes and not any(k in m.name for k in ('Eye','Brow','Eyeline','Mouth','outline')):
            P.toon_inplace(m, shade=(0.93,0.76,0.78) if 'SKIN' in m.name else (0.62,0.55,0.74))
    for o in list(bpy.context.scene.objects):
        if o.type=='MESH' and not o.name.startswith(('Seam','Collar clasp')) and 'buckle' not in o.name.lower():
            T.add_outline(o,0.0018)
