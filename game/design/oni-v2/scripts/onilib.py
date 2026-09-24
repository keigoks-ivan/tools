"""Geometry, rig and weighting helpers for the oni build (Blender 5.2, run inside Blender).

Conventions: Blender Z-up, character faces -Y, character's left = +X.
All parts are accumulated in a MeshBuilder with per-corner UVs (atlas regions) and
per-vertex skin weights computed from the rest-pose bone segments.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix

ATLAS = 1024

# ----------------------------------------------------------------- atlas regions (pixels x0,y0,x1,y1; y up)
REG = {
    'torso': (0, 512, 512, 1024),
    'neck': (512, 896, 576, 1024),
    'upperarm': (576, 768, 704, 1024),
    'forearm': (704, 768, 832, 1024),
    'thigh': (832, 768, 960, 1024),
    'shin': (960, 768, 1024, 1024),
    'meta': (512, 768, 576, 896),
    'hand': (576, 704, 704, 768),
    'digit': (704, 704, 768, 768),
    'toe': (768, 704, 832, 768),
    'claw': (832, 704, 896, 768),
    'horn': (896, 704, 960, 768),
    'spike': (960, 704, 1024, 768),
    'mask': (512, 448, 768, 704),
    'jaw': (768, 576, 896, 704),
    'teeth': (896, 640, 960, 704),
    'mouth': (896, 576, 960, 640),
    'glow': (960, 640, 1024, 704),
    'socket': (960, 576, 1024, 640),
    'edge_pale': (768, 512, 832, 576),
    'edge_dark': (832, 512, 896, 576),
    'cloth': (896, 448, 1024, 576),
    'mane': (768, 448, 832, 512),
    'edge_bone': (832, 448, 896, 512),
    'steel': (512, 704, 576, 768),
}
# 128px plate cells: 4x4 in the lower-left quadrant, plus 4x3 in the lower-right
CELLS = [(cx * 128, cy * 128, cx * 128 + 128, cy * 128 + 128) for cy in range(4) for cx in range(4)]
CELLS += [(512 + cx * 128, cy * 128, 512 + cx * 128 + 128, cy * 128 + 128) for cy in range(3) for cx in range(4)]
# 64px cells 28..35 for the small layered lames (strip y 384..448)
CELLS += [(512 + i * 64, 384, 576 + i * 64, 448) for i in range(8)]


def reg_uv(rect, u, v, pad=2):
    x0, y0, x1, y1 = rect
    x0 += pad; y0 += pad; x1 -= pad; y1 -= pad
    return ((x0 + (x1 - x0) * u) / ATLAS, (y0 + (y1 - y0) * v) / ATLAS)


def V(*a):
    return Vector(a if len(a) == 3 else a[0])


# ----------------------------------------------------------------- skeleton
L_R = (('Left', 1), ('Right', -1))


def skeleton():
    """Mixamo-named bones (head, tail, parent, roll_z_axis). Meters, T-pose, digitigrade legs."""
    S = {}
    def b(name, h, t, parent, z):
        S[name] = (V(h), V(t), parent, V(z))
    fwd = (0, -1, 0)
    b('mixamorigHips', (0, 0.03, 1.06), (0, 0.03, 1.17), None, fwd)
    b('mixamorigSpine', (0, 0.03, 1.17), (0, 0.035, 1.31), 'mixamorigHips', fwd)
    b('mixamorigSpine1', (0, 0.035, 1.31), (0, 0.025, 1.45), 'mixamorigSpine', fwd)
    b('mixamorigSpine2', (0, 0.025, 1.45), (0, 0.0, 1.62), 'mixamorigSpine1', fwd)
    b('mixamorigNeck', (0, -0.02, 1.625), (0, -0.12, 1.69), 'mixamorigSpine2', fwd)
    b('mixamorigHead', (0, -0.12, 1.69), (0, -0.15, 1.87), 'mixamorigNeck', fwd)
    b('mixamorigHeadTop_End', (0, -0.15, 1.87), (0, -0.15, 1.97), 'mixamorigHead', fwd)
    SH = 1.665
    for side, s in L_R:
        p = 'mixamorig' + side
        b(p + 'Shoulder', (s * 0.045, 0.0, 1.60), (s * 0.19, 0.01, SH), 'mixamorigSpine2', (0, 0, -1))
        b(p + 'Arm', (s * 0.19, 0.01, SH), (s * 0.545, 0.01, SH), p + 'Shoulder', (0, 0, -1))
        b(p + 'ForeArm', (s * 0.545, 0.01, SH), (s * 0.935, 0.01, SH), p + 'Arm', (0, 0, -1))
        b(p + 'Hand', (s * 0.935, 0.01, SH), (s * 1.02, 0.01, SH - 0.002), p + 'ForeArm', (0, 0, -1))
        for fname, dy, lens in (('Index', -0.03, (0.07, 0.055, 0.045)), ('Middle', 0.0, (0.075, 0.06, 0.045)),
                                ('Ring', 0.03, (0.065, 0.05, 0.04))):
            x = 1.02; z = SH - 0.002
            par = p + 'Hand'
            ang = 0.0
            for i, ln in enumerate(lens + (0.05,)):
                ang += math.radians(9)
                x2 = x + ln * math.cos(ang); z2 = z - ln * math.sin(ang)
                nm = f'{p}Hand{fname}{i + 1}'
                b(nm, (s * x, 0.01 + dy, z), (s * x2, 0.01 + dy, z2), par, (0, 0, -1))
                par = nm; x, z = x2, z2
        # thumb: forward-out-down
        pts = [V(s * 0.955, -0.035, SH - 0.012)]
        d = V(s * 0.45, -0.85, -0.28).normalized()
        par = p + 'Hand'
        for i, ln in enumerate((0.04, 0.035, 0.03, 0.04)):
            d = (d + V(0, 0, -0.12)).normalized()
            q = pts[-1] + d * ln
            nm = f'{p}HandThumb{i + 1}'
            b(nm, pts[-1], q, par, (s * 0.37, 0.25, -0.89))
            par = nm; pts.append(q)
        # digitigrade leg: thigh forward-down, shin back-down, long metatarsal, toes
        b(p + 'UpLeg', (s * 0.10, 0.02, 1.02), (s * 0.115, -0.10, 0.66), 'mixamorigHips', fwd)
        b(p + 'Leg', (s * 0.115, -0.10, 0.66), (s * 0.12, 0.13, 0.28), p + 'UpLeg', fwd)
        b(p + 'Foot', (s * 0.12, 0.13, 0.28), (s * 0.125, -0.035, 0.045), p + 'Leg', fwd)
        b(p + 'ToeBase', (s * 0.125, -0.035, 0.045), (s * 0.13, -0.15, 0.02), p + 'Foot', (0, 0, 1))
        b(p + 'Toe_End', (s * 0.13, -0.15, 0.02), (s * 0.13, -0.21, 0.02), p + 'ToeBase', (0, 0, 1))
    return S


ORDER = None


def build_armature(name='OniRig'):
    S = skeleton()
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    todo = list(S.keys())
    while todo:
        for n in list(todo):
            h, t, par, z = S[n]
            if par and par not in eb:
                continue
            e = arm.edit_bones.new(n)
            e.head, e.tail = h, t
            e.align_roll(z)
            if par:
                e.parent = eb[par]
                e.use_connect = (par and (S[par][1] - h).length < 1e-5)
            eb[n] = e
            todo.remove(n)
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.display_type = 'STICK'
    return ob, S


# ----------------------------------------------------------------- weights
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length, t


class Weigher:
    def __init__(self, S):
        self.S = S

    def rigid(self, bone):
        return lambda p: {bone: 1.0}

    def chain(self, bones, sigma=0.03, bias=None):
        S = self.S
        def f(p):
            ds = []
            for bn in bones:
                h, t = S[bn][0], S[bn][1]
                d, _ = seg_dist(p, h, t)
                if bias and bn in bias:
                    d += bias[bn]
                ds.append((d, bn))
            dmin = min(d for d, _ in ds)
            w = {bn: math.exp(-(d - dmin) / sigma) for d, bn in ds}
            best = sorted(w.items(), key=lambda kv: -kv[1])[:4]
            best = [(k, v) for k, v in best if v > 0.02]
            s = sum(v for _, v in best)
            return {k: v / s for k, v in best}
        return f

    def blend(self, f1, f2, tfun):
        """Blend two weight functions: tfun(p) in [0,1] -> weight of f2."""
        def f(p):
            t = max(0.0, min(1.0, tfun(p)))
            a, b = f1(p), f2(p)
            out = {}
            for k, v in a.items():
                out[k] = out.get(k, 0) + v * (1 - t)
            for k, v in b.items():
                out[k] = out.get(k, 0) + v * t
            best = sorted(out.items(), key=lambda kv: -kv[1])[:4]
            s = sum(v for _, v in best)
            return {k: v / s for k, v in best if v / s > 0.01}
        return f


# ----------------------------------------------------------------- mesh builder
class MeshBuilder:
    def __init__(self):
        self.co, self.w, self.faces, self.uvs, self.smooth = [], [], [], [], []

    def v(self, p, w):
        self.co.append(Vector(p)); self.w.append(w)
        return len(self.co) - 1

    def f(self, ids, uvs, smooth=True):
        self.faces.append(list(ids)); self.uvs.append(list(uvs)); self.smooth.append(smooth)

    def tri_count(self):
        return sum(len(f) - 2 for f in self.faces)

    def to_object(self, name, rig):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(c) for c in self.co], [], self.faces)
        uvl = me.uv_layers.new(name='UVMap')
        k = 0
        for poly, uvs, sm in zip(me.polygons, self.uvs, self.smooth):
            for li, uv in zip(poly.loop_indices, uvs):
                uvl.data[li].uv = uv
            poly.use_smooth = sm
        me.validate(clean_customdata=False)
        me.update()
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        groups = {}
        for i, w in enumerate(self.w):
            for g, gw in w.items():
                if g not in groups:
                    groups[g] = ob.vertex_groups.new(name=g)
                groups[g].add([i], gw, 'REPLACE')
        ob.parent = rig
        mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
        return ob


# ----------------------------------------------------------------- primitives
def frame_from(T, ref):
    T = T.normalized()
    Y = ref - T * ref.dot(T)
    if Y.length < 1e-6:
        Y = Vector((0, 0, 1)) - T * T.z
    Y.normalize()
    X = Y.cross(T).normalized()
    return X, Y, T


def ellipse4(n, xp, xn, yp, yn, sq=2.0, phase=0.0):
    """Closed 2D ring. x radius xp (+x) / xn (-x), y radius yp (+y, 'front') / yn. sq>2 boxier."""
    pts = []
    for j in range(n):
        a = 2 * math.pi * j / n + phase
        c, s = math.cos(a), math.sin(a)
        cx = math.copysign(abs(c) ** (2 / sq), c)
        sy = math.copysign(abs(s) ** (2 / sq), s)
        pts.append(((xp if cx >= 0 else xn) * cx, (yp if sy >= 0 else yn) * sy))
    return pts


def loft(B, rings, region, wfn, cap0=True, cap1=True, smooth=True, vcoords=None, u_scale=1.0, cap_uv=None):
    """rings: list of lists of 3D Vectors (same count). Returns ids grid."""
    n = len(rings[0]); m = len(rings)
    if vcoords is None:
        acc = [0.0]
        for i in range(1, m):
            c0 = sum(rings[i - 1], Vector()) / n; c1 = sum(rings[i], Vector()) / n
            acc.append(acc[-1] + (c1 - c0).length + 1e-6)
        vcoords = [a / acc[-1] for a in acc]
    ids = [[B.v(p, wfn(p)) for p in ring] for ring in rings]
    rect = REG[region] if isinstance(region, str) else region
    for i in range(m - 1):
        for j in range(n):
            j2 = (j + 1) % n
            u0, u1 = j / n * u_scale, (j + 1) / n * u_scale
            B.f((ids[i][j], ids[i][j2], ids[i + 1][j2], ids[i + 1][j]),
                (reg_uv(rect, u0, vcoords[i]), reg_uv(rect, u1, vcoords[i]),
                 reg_uv(rect, u1, vcoords[i + 1]), reg_uv(rect, u0, vcoords[i + 1])), smooth)
    for cap, i, vv in ((cap0, 0, vcoords[0]), (cap1, m - 1, vcoords[-1])):
        if not cap:
            continue
        c = sum(rings[i], Vector()) / n
        ci = B.v(c, wfn(c))
        cu = cap_uv if cap_uv else (0.5, vv)
        for j in range(n):
            j2 = (j + 1) % n
            B.f((ids[i][j], ids[i][j2], ci), (reg_uv(rect, j / n, vv), reg_uv(rect, (j + 1) / n, vv), reg_uv(rect, *cu)), smooth)
    return ids


def tube(B, path, profiles, ref, region, wfn, n=8, cap0=True, cap1=True, smooth=True, twist=0.0, vcoords=None):
    """path: list of points; profiles: list (same length) of (xp,xn,yp,yn[,sq]) or 2D point lists."""
    rings = []
    for i, p in enumerate(path):
        if i == 0:
            T = path[1] - path[0]
        elif i == len(path) - 1:
            T = path[-1] - path[-2]
        else:
            T = (path[i + 1] - path[i - 1])
        X, Y, T = frame_from(T, ref)
        pr = profiles[i]
        if isinstance(pr, tuple) and not isinstance(pr[0], tuple):
            pts = ellipse4(n, *pr) if len(pr) >= 4 else ellipse4(n, pr[0], pr[0], pr[1], pr[1])
        else:
            pts = pr
        rings.append([p + X * x + Y * y for x, y in pts])
    return loft(B, rings, region, wfn, cap0, cap1, smooth, vcoords)


def bezier(p0, p1, p2, k):
    out = []
    for i in range(k + 1):
        t = i / k
        out.append(p0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + p2 * t * t)
    return out


def horn(B, p0, p1, p2, r0, ref, region, wfn, k=6, n=6, flat=1.0, tip=0.0, smooth=True, power=1.0):
    """Tapered curved cone (quadratic bezier). flat<1 flattens across ref -> blade."""
    path = bezier(V(p0), V(p1), V(p2), k)
    profs = []
    for i in range(len(path)):
        t = i / k
        r = r0 * (1 - t) ** power + tip * t
        r = max(r, 0.0015)
        profs.append((r, r, r * flat, r * flat, 2.0))
    ids = tube(B, path, profs, V(ref), region, wfn, n=n, cap0=True, cap1=False, smooth=smooth)
    return ids


def blade(B, p0, p1, p2, width, thick, ref, region, wfn, k=4, smooth=False):
    """Diamond-section blade/spike: width across `ref`-perp axis, thin along ref."""
    path = bezier(V(p0), V(p1), V(p2), k)
    profs = []
    for i in range(len(path)):
        t = i / k
        w = max(width * (1 - t) ** 0.9, 0.001); th = max(thick * (1 - t), 0.001)
        profs.append([(w, 0), (0, th), (-w, 0), (0, -th)])
    return tube(B, path, profs, V(ref), region, wfn, n=4, cap0=True, cap1=False, smooth=smooth)


# ----------------------------------------------------------------- plates
def star_outline(tips, inner=0.45, sharp=None):
    """tips: list of (angle_deg, radius). Returns closed polygon with concave midpoints."""
    tips = sorted(tips)
    out = []
    for i, (a, r) in enumerate(tips):
        a2, r2 = tips[(i + 1) % len(tips)]
        if a2 <= a:
            a2 += 360
        out.append((r * math.cos(math.radians(a)), r * math.sin(math.radians(a))))
        am = math.radians((a + a2) / 2)
        rm = min(r, r2) * (inner if not sharp else sharp[i])
        out.append((rm * math.cos(am), rm * math.sin(am)))
    return out


def poly_offset(pts, d):
    """Inset (d>0) a CCW polygon along vertex normals (clamped)."""
    n = len(pts); out = []
    for i in range(n):
        p0 = Vector((*pts[i - 1], 0)); p1 = Vector((*pts[i], 0)); p2 = Vector((*pts[(i + 1) % n], 0))
        e1 = (p1 - p0).normalized(); e2 = (p2 - p1).normalized()
        n1 = Vector((-e1.y, e1.x, 0)); n2 = Vector((-e2.y, e2.x, 0))
        nb = (n1 + n2)
        if nb.length < 1e-6:
            nb = n1
        nb.normalize()
        cosh = max(nb.dot(n1), 0.35)
        q = p1 + nb * (d / cosh)
        out.append((q.x, q.y))
    return out


def signed_area(pts):
    return 0.5 * sum(pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1] for i in range(len(pts)))


def plate(B, outline, cell, M, wfn, thick=0.012, bevel=0.006, bend=(0.0, 0.0), keel=0.0, keel_axis='v',
          center=(0.0, 0.0), rings=(0.55,), edge='edge_pale', smooth=False, twist=None, back_region=None):
    """Extruded, bevelled, bent plate. outline in local metres (u,v) around `center`; M = 4x4 local->rig.
    Local w (+Z) is the outward face. Front face UV = local coords mapped into atlas `cell` (keeps aspect).
    Returns the dict used to paint the cell (outline in cell-normalised coords)."""
    pts = list(outline)
    if signed_area(pts) < 0:
        pts.reverse()
    c = Vector((*center, 0))
    inset = poly_offset(pts, bevel)
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    span = max(maxx - minx, maxy - miny) * 1.04
    cx0 = (minx + maxx) / 2 - span / 2; cy0 = (miny + maxy) / 2 - span / 2
    def cuv(x, y):
        return ((x - cx0) / span, (y - cy0) / span)
    rect = CELLS[cell] if isinstance(cell, int) else REG[cell]
    umax = max(abs(maxx - c.x), abs(minx - c.x)) or 1; vmax = max(abs(maxy - c.y), abs(miny - c.y)) or 1
    def deform(x, y, z):
        du, dv = x - c.x, y - c.y
        z2 = z - bend[0] * du * du - bend[1] * dv * dv
        if keel:
            if keel_axis == 'v':
                z2 += keel * max(0.0, 1 - abs(du) / umax)
            else:
                z2 += keel * max(0.0, 1 - abs(dv) / vmax)
        if twist:
            z2 += twist * du * dv
        return M @ Vector((x, y, z2))
    n = len(pts)
    ht = thick / 2
    # rings for the front face: inset outline scaled toward center
    front_rings = [[(c.x + (px - c.x) * s, c.y + (py - c.y) * s) for px, py in inset] for s in rings] + [inset]
    fids = []
    for ring in front_rings:
        fids.append([B.v(deform(x, y, ht), wfn(deform(x, y, ht))) for x, y in ring])
    cid = B.v(deform(c.x, c.y, ht), wfn(deform(c.x, c.y, ht)))
    mid = [B.v(deform(x, y, 0), wfn(deform(x, y, 0))) for x, y in pts]
    back = [B.v(deform(x, y, -ht), wfn(deform(x, y, -ht))) for x, y in inset]
    bcid = B.v(deform(c.x, c.y, -ht), wfn(deform(c.x, c.y, -ht)))
    U = lambda x, y: reg_uv(rect, *cuv(x, y), pad=1)
    # center fan
    r0 = front_rings[0]
    for j in range(n):
        j2 = (j + 1) % n
        B.f((cid, fids[0][j], fids[0][j2]), (U(c.x, c.y), U(*r0[j]), U(*r0[j2])), smooth)
    for k in range(len(front_rings) - 1):
        ra, rb = front_rings[k], front_rings[k + 1]
        for j in range(n):
            j2 = (j + 1) % n
            B.f((fids[k][j], fids[k + 1][j], fids[k + 1][j2], fids[k][j2]),
                (U(*ra[j]), U(*rb[j]), U(*rb[j2]), U(*ra[j2])), smooth)
    # bevel front -> mid -> back (edge strip region)
    er = REG[edge]
    per = [0.0]
    for j in range(1, n + 1):
        a = pts[j - 1]; b = pts[j % n]
        per.append(per[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    for j in range(n):
        j2 = (j + 1) % n
        u0, u1 = per[j] / per[-1] * 4 % 1.0, per[j + 1] / per[-1] * 4 % 1.0
        if u1 < u0:
            u1 = 1.0
        B.f((fids[-1][j], mid[j], mid[j2], fids[-1][j2]),
            (reg_uv(er, u0, 1), reg_uv(er, u0, 0.5), reg_uv(er, u1, 0.5), reg_uv(er, u1, 1)), False)
        B.f((mid[j], back[j], back[j2], mid[j2]),
            (reg_uv(er, u0, 0.5), reg_uv(er, u0, 0), reg_uv(er, u1, 0), reg_uv(er, u1, 0.5)), False)
    # back face: plain fan, mapped to the same cell (mirrored) or a dark region
    brect = REG[back_region] if back_region else rect
    BU = (lambda x, y: reg_uv(brect, *cuv(x, y), pad=1))
    for j in range(n):
        j2 = (j + 1) % n
        B.f((bcid, back[j2], back[j]), (BU(c.x, c.y), BU(*inset[j2]), BU(*inset[j])), smooth)
    return {'cell': cell, 'outline': [cuv(x, y) for x, y in pts], 'center': cuv(c.x, c.y)}


def basis(origin, w, v_hint):
    """4x4 with local Z=w (outward), local Y ~ v_hint, local X = Y x Z."""
    w = V(w).normalized(); vh = V(v_hint)
    Y = (vh - w * vh.dot(w)).normalized()
    X = Y.cross(w).normalized()
    M = Matrix.Identity(4)
    for i in range(3):
        M[i][0], M[i][1], M[i][2], M[i][3] = X[i], Y[i], w[i], V(origin)[i]
    return M


def smooth_path(pts, k=3):
    """Catmull-Rom resample of a polyline -> k sub-steps per segment (keeps end points)."""
    P = [V(p) for p in pts]
    out = []
    for i in range(len(P) - 1):
        p0 = P[i - 1] if i > 0 else P[i] * 2 - P[i + 1]
        p1, p2 = P[i], P[i + 1]
        p3 = P[i + 2] if i + 2 < len(P) else P[i + 1] * 2 - P[i]
        for j in range(k):
            t = j / k
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return out


def muscle_tube(B, path, radius, bumps, ref, region, wfn, n=12, rings=10, cap0=True, cap1=True, flat=None):
    """Shaped limb: path (polyline, resampled to `rings` rings), radius(t)->(rx, ry) base ellipse,
    bumps: list of (world_dir, t_centre, t_halfwidth, amp, ang_width_rad) muscle lobes added radially.
    Directions are in world space so left/right sides stay symmetric regardless of the ring frame."""
    P = smooth_path(path, 6)
    L = [0.0]
    for a, b in zip(P, P[1:]):
        L.append(L[-1] + (b - a).length)
    tot = L[-1]
    def at(t):
        s = t * tot
        for i in range(len(P) - 1):
            if L[i + 1] >= s:
                u = (s - L[i]) / max(L[i + 1] - L[i], 1e-9)
                return P[i].lerp(P[i + 1], u), (P[i + 1] - P[i]).normalized()
        return P[-1], (P[-1] - P[-2]).normalized()
    rs = []
    ts = [i / (rings - 1) for i in range(rings)]
    for t in ts:
        c, T = at(t)
        X, Y, T = frame_from(T, ref)
        rx, ry = radius(t)
        ring = []
        for j in range(n):
            a = 2 * math.pi * j / n
            radial = (X * math.cos(a) * rx + Y * math.sin(a) * ry)
            dirn = radial.normalized()
            r = radial.length
            for d, tc, tw, amp, aw in bumps:
                d = V(d) - T * V(d).dot(T)
                if d.length < 1e-6:
                    continue
                ang = dirn.angle(d.normalized())
                r += amp * math.exp(-((t - tc) / tw) ** 2) * math.exp(-(ang / aw) ** 2)
            if flat:
                r *= flat(t, dirn)
            ring.append(c + dirn * r)
        rs.append(ring)
    return loft(B, rs, region, wfn, cap0, cap1, True, vcoords=ts)
