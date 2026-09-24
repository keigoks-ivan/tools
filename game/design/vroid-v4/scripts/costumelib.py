"""Costume construction on the VRoid body: conformal garments, belts, panels, armour pieces."""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

W = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'textures') + '/'


class Ctx:
    def __init__(self):
        self.rig = bpy.data.objects['Armature']
        self.body = bpy.data.objects['Body']
        me = self.body.data
        self.bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
        self.polys = [(tuple(p.vertices), p.material_index) for p in me.polygons]
        self.vgroups = {g.index: g.name for g in self.body.vertex_groups}
        self.vweights = [{self.vgroups[g.group]: g.weight for g in v.groups if g.weight > 1e-4} for v in me.vertices]
        self.co = [v.co.copy() for v in me.vertices]

    # ---- skin weight transfer: barycentric blend over the nearest body face
    def weights_at(self, p, allow=None):
        loc, nrm, idx, dist = self.bvh.find_nearest(p)
        vids = self.polys[idx][0]
        ws = []
        for vi in vids:
            d = (self.co[vi] - loc).length
            ws.append(1 / (d + 1e-5))
        acc = {}
        tot = sum(ws)
        for vi, w in zip(vids, ws):
            for g, gw in self.vweights[vi].items():
                if allow and not allow(g):
                    continue
                acc[g] = acc.get(g, 0) + gw * w / tot
        s = sum(acc.values()) or 1
        # keep 4 strongest for glTF
        best = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
        s = sum(w for _, w in best) or 1
        return {g: w / s for g, w in best}

    def surface(self, center, direction, rmax=0.3, first=False):
        """Outer (or innermost when first=True) body surface along a ray from center."""
        d = direction.normalized()
        hits = []
        o = center.copy()
        travelled = 0
        for _ in range(12):
            loc, nrm, idx, dist = self.bvh.ray_cast(o, d, rmax - travelled)
            if loc is None:
                break
            hits.append((loc, nrm))
            if first:
                break
            travelled += dist + 1e-4
            o = loc + d * 1e-4
        if not hits:
            return None, None
        loc, nrm = hits[-1]
        if nrm.dot(d) < 0:
            nrm = -nrm
        return loc, nrm


def mat_tex(name, img, scale=(1, 1), color=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links
    out = N.new('ShaderNodeOutputMaterial')
    em = N.new('ShaderNodeEmission')
    L.new(em.outputs[0], out.inputs[0])
    if img:
        uv = N.new('ShaderNodeUVMap')
        mp = N.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (scale[0], scale[1], 1)
        tx = N.new('ShaderNodeTexImage')
        tx.image = bpy.data.images.load(W + img) if isinstance(img, str) else img
        tx.image.pack()
        L.new(uv.outputs[0], mp.inputs[0])
        L.new(mp.outputs[0], tx.inputs[0])
        src = tx.outputs['Color']
        if color:
            mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
            mul.inputs['Factor'].default_value = 1
            L.new(src, mul.inputs['A']); mul.inputs['B'].default_value = (*color, 1)
            src = mul.outputs['Result']
        L.new(src, em.inputs['Color'])
    else:
        em.inputs['Color'].default_value = (*color, 1)
    return m


def make_obj(ctx, name, verts, faces, mats, uvs=None, face_mats=None, weights=None, bone=None, smooth=True,
             allow=None, solidify=0.0, recalc=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    if recalc:
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free(); me.update()
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
        me.materials.append(m)
    if face_mats:
        for p, mi in zip(me.polygons, face_mats):
            p.material_index = mi
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        for p in me.polygons:
            for li in p.loop_indices:
                uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = ctx.rig
    groups = {}
    def grp(n):
        if n not in groups:
            groups[n] = ob.vertex_groups.new(name=n)
        return groups[n]
    if bone:
        grp(bone).add(list(range(len(verts))), 1.0, 'REPLACE')
    else:
        for i, v in enumerate(verts):
            w = weights[i] if weights is not None else ctx.weights_at(Vector(v), allow)
            for g, gw in w.items():
                grp(g).add([i], gw, 'REPLACE')
    if solidify:
        s = ob.modifiers.new('Cloth thickness', 'SOLIDIFY')
        s.thickness = solidify; s.offset = 1; s.use_even_offset = False
    a = ob.modifiers.new('Armature', 'ARMATURE')
    a.object = ctx.rig
    return ob


def cyl_uv(p, scale=0.14):
    ang = math.atan2(p.x, -p.y)
    return (ang * 0.17 / scale, p.z / scale)


# ------------------------------------------------------------------ conformal garments
def conformal(ctx, name, pred, mat, offset=0.004, mats=(0,), relax=8, uvfun=cyl_uv, allow=None,
              solidify=0.0015, offset_fn=None, post=None):
    src = ctx.body.data
    chosen = [p for p in src.polygons if p.material_index in mats and pred(p.center)]
    bm = bmesh.new()
    vmap = {}
    for p in chosen:
        vs = []
        for vi in p.vertices:
            if vi not in vmap:
                vmap[vi] = bm.verts.new(src.vertices[vi].co.copy())
            vs.append(vmap[vi])
        try:
            bm.faces.new(vs)
        except ValueError:
            pass
    bm.verts.ensure_lookup_table()
    # merge coincident seam verts so the garment is watertight across UV seams
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    # relax boundary to remove the polygon stair-steps
    bnd = [v for v in bm.verts if v.is_boundary]
    for _ in range(relax):
        new = {}
        for v in bnd:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                new[v] = v.co * 0.4 + (nb[0].co + nb[1].co) * 0.3
        for v, c in new.items():
            loc, n, i, d = ctx.bvh.find_nearest(c)
            v.co = loc
    bm.normal_update()
    verts, faces, uvs, weights = [], [], [], []
    idx = {}
    for v in bm.verts:
        loc, n, i, d = ctx.bvh.find_nearest(v.co)
        n = v.normal if v.normal.length > 0.5 else n
        off = offset_fn(v.co) if offset_fn else offset
        idx[v] = len(verts)
        verts.append(v.co + n * off)
        uvs.append(uvfun(v.co))
        weights.append(ctx.weights_at(v.co, allow))
    for f in bm.faces:
        faces.append([idx[v] for v in f.verts])
    loops = boundary_loops(bm, idx)
    bm.free()
    if post:
        verts = [post(v) for v in verts]
    ob = make_obj(ctx, name, verts, faces, mat, uvs=uvs, weights=weights, solidify=solidify)
    return ob, verts, loops, weights


def boundary_loops(bm, idx):
    edges = [e for e in bm.edges if e.is_boundary]
    adj = {}
    for e in edges:
        a, b = idx[e.verts[0]], idx[e.verts[1]]
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    seen = set()
    loops = []
    for start in adj:
        if start in seen:
            continue
        loop = [start]; seen.add(start); prev = None; cur = start
        while True:
            nxt = [n for n in adj[cur] if n != prev and n not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            loop.append(cur); seen.add(cur)
        if len(loop) > 4:
            loops.append(loop)
    return loops


def tube(ctx, name, pts, radius, mat, weights=None, sides=6, closed=False, flat=1.0, bone=None, normals=None):
    verts, faces, uvs, ws = [], [], [], []
    n = len(pts)
    for i, p in enumerate(pts):
        a = pts[(i - 1) % n] if (closed or i > 0) else pts[i]
        b = pts[(i + 1) % n] if (closed or i < n - 1) else pts[i]
        t = (b - a).normalized()
        up = normals[i] if normals else (Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0)))
        s1 = t.cross(up).normalized(); s2 = t.cross(s1).normalized()
        for j in range(sides):
            ang = 2 * math.pi * j / sides
            verts.append(p + s1 * math.cos(ang) * radius + s2 * math.sin(ang) * radius * flat)
            uvs.append((j / sides, i * 0.1))
            if weights is not None:
                ws.append(weights[i])
    segs = n if closed else n - 1
    for i in range(segs):
        for j in range(sides):
            a = i * sides + j; b = i * sides + (j + 1) % sides
            c = ((i + 1) % n) * sides + (j + 1) % sides; d = ((i + 1) % n) * sides + j
            faces.append((a, b, c, d))
    return make_obj(ctx, name, verts, faces, mat, uvs=uvs, weights=ws if weights is not None else None, bone=bone)


def piping(ctx, name, garment_verts, garment_weights, loops, mat, radius=0.0028, min_len=6):
    out = []
    for k, loop in enumerate(loops):
        if len(loop) < min_len:
            continue
        loop = loop[::2] if len(loop) > 24 else loop
        pts = [garment_verts[i] for i in loop]
        # smooth the path
        for _ in range(3):
            pts = [pts[0]] + [(pts[i - 1] + pts[i] * 2 + pts[i + 1]) / 4 for i in range(1, len(pts) - 1)] + [pts[-1]]
        closed = (pts[0] - pts[-1]).length < 0.03
        out.append(tube(ctx, f'{name} {k}', pts, radius, mat, weights=[garment_weights[i] for i in loop], closed=closed, sides=5))
    return out


# ------------------------------------------------------------------ surface rings
def ring(ctx, z_of, center, n=48, offset=0.006, rmax=0.3, angles=None, first=False):
    """Points around the body at height z_of(theta); theta=0 faces front (-Y), +90deg = her left (+X)."""
    pts, nrms = [], []
    angs = angles if angles is not None else [2 * math.pi * i / n for i in range(n)]
    for a in angs:
        z = z_of(a)
        d = Vector((math.sin(a), -math.cos(a), 0))
        c = Vector((center[0], center[1], z))
        loc, nrm = ctx.surface(c, d, rmax, first=first)
        if loc is None:
            loc, nrm = c + d * 0.1, d
        nrm = Vector((nrm.x, nrm.y, nrm.z * 0.3)).normalized()
        pts.append(loc + nrm * offset)
        nrms.append(nrm)
    return pts, nrms, angs


def band(ctx, name, z_of, height, mat, center=(0, 0.0), offset=0.008, angles=None, n=48, closed=True,
         thickness=0.003, allow=None, rmax=0.3, uv_scale=0.05, first=False):
    lo, nl, angs = ring(ctx, lambda a: z_of(a) - height / 2, center, n, offset, rmax, angles, first=first)
    hi, nh, _ = ring(ctx, lambda a: z_of(a) + height / 2, center, n, offset, rmax, angles, first=first)
    verts = lo + hi
    m = len(lo)
    faces = []
    for i in range(m if closed else m - 1):
        j = (i + 1) % m
        faces.append((i, j, m + j, m + i))
    uvs = []
    L = 0
    for i in range(m):
        if i:
            L += (lo[i] - lo[i - 1]).length
        uvs.append((L / uv_scale, 0))
    uvs += [(u, height / uv_scale) for u, _ in uvs]
    ob = make_obj(ctx, name, verts, faces, mat, uvs=uvs, solidify=thickness, allow=allow)
    return ob, lo, hi, nl


def oriented_box(ctx, name, center, normal, up, size, mat, bone=None, weights=None, bevel=0.0015):
    n = normal.normalized(); u = (up - n * up.dot(n)).normalized(); s = u.cross(n)
    w, h, d = size
    corners = []
    for sz in (-1, 1):
        for sy in (-1, 1):
            for sx in (-1, 1):
                corners.append(center + s * sx * w / 2 + u * sy * h / 2 + n * sz * d / 2)
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    ws = [weights] * 8 if weights else None
    ob = make_obj(ctx, name, corners, faces, mat, uvs=[(0, 0)] * 8, weights=ws, bone=bone, smooth=False)
    if bevel:
        b = ob.modifiers.new('Bevel', 'BEVEL'); b.width = bevel; b.segments = 1
        ob.modifiers.move(len(ob.modifiers) - 1, 0)
    return ob


def buckle(ctx, name, center, normal, up, w, h, mat, weights):
    """Open rectangular frame + tongue."""
    n = normal.normalized(); u = (up - n * up.dot(n)).normalized(); s = u.cross(n)
    t = min(w, h) * 0.22
    parts = []
    parts.append(oriented_box(ctx, name + ' top', center + u * (h / 2 - t / 2), n, u, (w, t, 0.004), mat, weights=weights))
    parts.append(oriented_box(ctx, name + ' bottom', center - u * (h / 2 - t / 2), n, u, (w, t, 0.004), mat, weights=weights))
    parts.append(oriented_box(ctx, name + ' left', center - s * (w / 2 - t / 2), n, u, (t, h, 0.004), mat, weights=weights))
    parts.append(oriented_box(ctx, name + ' right', center + s * (w / 2 - t / 2), n, u, (t, h, 0.004), mat, weights=weights))
    parts.append(oriented_box(ctx, name + ' prong', center + n * 0.001, n, u, (w * 0.8, t * 0.45, 0.003), mat, weights=weights))
    return parts


# ------------------------------------------------------------------ skirt panels
def panel(ctx, name, mat, a0, a1, top_z, hem, flare, offset, rows=16, cols=None, center=(0, 0.0),
          edge_mat=None, leg_follow=0.8, layer_push=0.0):
    """Cloth panel hanging from the hip ring between angles a0..a1 (radians). hem(u) returns hem z."""
    cols = cols or max(4, int(abs(a1 - a0) / math.radians(7)))
    top, tn, angs = ring(ctx, lambda a: top_z, center, offset=offset, angles=[a0 + (a1 - a0) * i / cols for i in range(cols + 1)])
    verts, uvs, ws = [], [], []
    hip_r = []
    for c in range(cols + 1):
        # widest body radius over the hips for this column; below the crotch the cloth just hangs
        nrm = tn[c]; out = Vector((nrm.x, nrm.y, 0)).normalized(); best = 0
        for zz in [0.78 + 0.02 * k for k in range(10)]:
            probe, pn = ctx.surface(Vector((center[0], center[1], zz)), out, 0.35)
            if probe is not None:
                best = max(best, (Vector((probe.x, probe.y, 0)) - Vector((center[0], center[1], 0))).length)
        hip_r.append(best + offset)
    for r in range(rows + 1):
        t = r / rows
        for c in range(cols + 1):
            u = c / cols
            p0 = top[c]; nrm = tn[c]
            hz = hem(u)
            z = top_z + (hz - top_z) * t
            out = Vector((nrm.x, nrm.y, 0)).normalized()
            top_r = (Vector((p0.x, p0.y, 0)) - Vector((center[0], center[1], 0))).length
            reach = min(1, (top_z - z) / max(1e-3, top_z - 0.86))
            base_r = max(top_r, top_r + (hip_r[c] - top_r) * (reach ** 0.7))
            rad = base_r + flare * (t ** 1.25) + layer_push
            pos = Vector((center[0], center[1], z)) + out * rad
            # soft vertical folds
            pos += out * 0.003 * math.sin(u * math.pi * (cols / 3.0)) * t
            verts.append(pos)
            uvs.append((u * abs(a1 - a0) * 0.25 / 0.14, z / 0.14))
            # weights: hips at the top; toward the hem follow the nearest body surface (thigh) so legs cannot
            # push through, but never fully, so the cloth still spans the gap between the legs
            a = min(0.92, 0.25 + 0.75 * t) * leg_follow / 0.8
            near = ctx.weights_at(pos, allow=lambda g: g.startswith(('J_Bip_C_Hips', 'J_Bip_L_UpperLeg', 'J_Bip_R_UpperLeg', 'J_Bip_L_LowerLeg', 'J_Bip_R_LowerLeg')))
            w = {'J_Bip_C_Hips': 1 - a}
            for g, gw in near.items():
                w[g] = w.get(g, 0) + a * gw
            best = sorted(w.items(), key=lambda kv: -kv[1])[:4]; s = sum(v for _, v in best)
            ws.append({k: v / s for k, v in best if v > 1e-4})
    faces = []
    for r in range(rows):
        for c in range(cols):
            a = r * (cols + 1) + c
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    ob = make_obj(ctx, name, verts, faces, mat, uvs=uvs, weights=ws, solidify=0.0025)
    if edge_mat:
        # binding on the two sides and the hem
        ring_idx = [r * (cols + 1) for r in range(rows + 1)] + [rows * (cols + 1) + c for c in range(1, cols + 1)] + \
                   [r * (cols + 1) + cols for r in range(rows - 1, -1, -1)]
        pts = [verts[i] for i in ring_idx]
        tube(ctx, name + ' binding', pts, 0.0026, edge_mat, weights=[ws[i] for i in ring_idx], sides=5)
    return ob


def boot_foot(ctx, sx, mat, heel_mat):
    """Lofted boot foot with a block heel and a tapered toe; replaces the VRoid sneaker."""
    cx = sx * 0.079
    side = 'L' if sx > 0 else 'R'
    ys = [0.086, 0.075, 0.05, 0.03, 0.01, -0.01, -0.03, -0.05, -0.07, -0.09, -0.11, -0.125, -0.137, -0.145]
    def width(y):
        if y > 0.03: return 0.058 - 0.25 * max(0, y - 0.07)
        if y > -0.04: return 0.056 + (0.03 - y) * 0.06
        if y > -0.10: return 0.06
        return 0.06 * max(0.22, (y + 0.15) / 0.05) ** 0.8
    def top(y):
        if y > -0.02: return 0.135
        t = min(1, (-0.02 - y) / 0.125)
        return 0.028 + 0.107 * math.cos(t * math.pi / 2) ** 0.9
    def bottom(y):
        if y > 0.03: return 0.024       # heel block carries the foot here
        if y > -0.055: return 0.024 * (y + 0.055) / 0.085 + 0.004
        return 0.004
    n = 16
    verts, uvs, ws = [], [], []
    for i, y in enumerate(ys):
        w, t, b = width(y), top(y), bottom(y)
        for j in range(n):
            a = 2 * math.pi * j / n
            ca, sa = math.cos(a), math.sin(a)
            x = cx + (w / 2) * (abs(ca) ** 0.6) * (1 if ca >= 0 else -1)
            zc = (t + b) / 2; hz = (t - b) / 2
            z = zc + hz * (abs(sa) ** 0.55) * (1 if sa >= 0 else -1)
            if sa < 0: z = max(b, z)   # flat sole
            verts.append(Vector((x, y, z)))
            uvs.append((((j / n) + 0.25 * sx) % 1.0, i / len(ys) * 0.4))
            tw = min(1, max(0, (-0.045 - y) / 0.045))
            ws.append({f'J_Bip_{side}_Foot': 1 - tw, f'J_Bip_{side}_ToeBase': tw} if tw > 0 else {f'J_Bip_{side}_Foot': 1.0})
    faces = []
    for i in range(len(ys) - 1):
        for j in range(n):
            a = i * n + j; b2 = i * n + (j + 1) % n
            faces.append((a, b2, b2 + n, a + n))
    faces.append(tuple(range(n)))
    last = (len(ys) - 1) * n
    faces.append(tuple(range(last, last + n))[::-1])
    foot = make_obj(ctx, f'{side} boot foot', verts, faces, mat, uvs=uvs, weights=ws)
    # block heel under the rear of the foot
    hv = []
    for z in (0.0, 0.026):
        for (yy, xx) in ((0.078, -0.021), (0.078, 0.021), (0.03, 0.023), (0.03, -0.023)):
            hv.append(Vector((cx + xx * (0.92 if z == 0 else 1), yy - (0.004 if z == 0 and yy < 0.05 else 0), z)))
    hf = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    heel = make_obj(ctx, f'{side} boot heel', hv, hf, heel_mat, uvs=[(0, 0)] * 8, weights=[{f'J_Bip_{side}_Foot': 1.0}] * 8, smooth=False)
    b = heel.modifiers.new('Bevel', 'BEVEL'); b.width = 0.002; b.segments = 2
    heel.modifiers.move(len(heel.modifiers) - 1, 0)
    return foot, heel


def delete_body_faces(ctx, pred):
    import bmesh as _bm
    me = ctx.body.data
    bm = _bm.new(); bm.from_mesh(me)
    kill = [f for f in bm.faces if pred(f.calc_center_median(), f.material_index)]
    _bm.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(me); bm.free(); me.update()
    return len(kill)
