"""Procedural 1024^2 atlas for the oni (numpy only, runs inside Blender).
Produces base colour (sRGB) and an emissive mask image with the same layout (see onilib.REG / CELLS)."""
import numpy as np, math
from onilib import REG, CELLS, ATLAS

RNG = np.random.default_rng(7)


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


# palette -------------------------------------------------------------------------
BODY = hexc('1c1820')      # charcoal-violet hide/carapace
BODY_HI = hexc('3b3444')   # segment rim highlight
BODY_LO = hexc('0c0a0f')   # grooves
SEAM = hexc('b27dff')      # violet energy seam (base colour)
SEAM_E = hexc('9446ff')    # violet emission
PALE = hexc('a09ea6')      # pale armour plates (bone-steel)
PALE_HI = hexc('dcdae1')
PALE_LO = hexc('55535c')
HOLE = hexc('1b1720')
BONE = hexc('f6f1e6')      # mask
BONE_LO = hexc('c4bbad')
DARKPL = hexc('2f2937')
DARKPL_HI = hexc('7a6f87')


def vnoise(h, w, cells, seed=0, stretch=(1, 1)):
    r = np.random.default_rng(seed)
    gy, gx = max(2, int(cells * stretch[1]) + 2), max(2, int(cells * stretch[0]) + 2)
    g = r.random((gy, gx)).astype(np.float32)
    ys = np.linspace(0, gy - 1.001, h); xs = np.linspace(0, gx - 1.001, w)
    y0 = ys.astype(int); x0 = xs.astype(int); fy = (ys - y0)[:, None]; fx = (xs - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(h, w, cells, seed=0, octaves=4, stretch=(1, 1)):
    out = np.zeros((h, w), np.float32); amp = 1; tot = 0
    for o in range(octaves):
        out += vnoise(h, w, cells * 2 ** o, seed + o * 17, stretch) * amp
        tot += amp; amp *= 0.5
    return out / tot


class Atlas:
    def __init__(self, size=ATLAS):
        self.S = size
        self.col = np.zeros((size, size, 3), np.float32)
        self.col[:] = BODY
        self.em = np.zeros((size, size, 3), np.float32)

    # region helpers --------------------------------------------------------------
    def region(self, rect):
        x0, y0, x1, y1 = rect
        h, w = y1 - y0, x1 - x0
        X, Y = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
        return (slice(y0, y1), slice(x0, x1)), X, Y, w, h

    def put(self, sl, color, mask=None, em=None):
        c = self.col[sl]
        if mask is None:
            c[:] = color
        else:
            m = mask[..., None]
            c[:] = c * (1 - m) + (color if np.ndim(color) == 3 else np.asarray(color)[None, None, :]) * m
        if em is not None:
            e = self.em[sl]
            m = (mask if mask is not None else np.ones(c.shape[:2], np.float32))[..., None]
            e[:] = np.maximum(e, em[None, None, :] * m if np.ndim(em) == 1 else em * m)


def seg_dist(X, Y, pts, closed=False):
    """Min distance from pixel grid to a polyline (pts in pixel coords)."""
    d = np.full(X.shape, 1e9, np.float32)
    n = len(pts)
    rng_ = range(n if closed else n - 1)
    for i in rng_:
        ax, ay = pts[i]; bx, by = pts[(i + 1) % n]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy + 1e-9
        t = np.clip(((X - ax) * dx + (Y - ay) * dy) / L, 0, 1)
        d = np.minimum(d, np.hypot(X - ax - t * dx, Y - ay - t * dy))
    return d


def inside(X, Y, pts):
    res = np.zeros(X.shape, bool)
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % n]
        cond = ((y1 > Y) != (y2 > Y))
        xin = (x2 - x1) * (Y - y1) / (y2 - y1 + 1e-12) + x1
        res ^= cond & (X < xin)
    return res


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return a * (1 - t) + b * t


# ------------------------------------------------------------------ body surfaces
def carapace(A, rect, cells_uv, seams_uv=(), seed=1, fiber=True, wrap=True, base=None, seam_w=1.6,
             glow_seams=()):
    """Dark segmented hide: fibre striation + raised cells with light rims + grooves + violet seams.
    cells_uv: list of polygons in region-normalised (u,v). seams_uv: polylines (u,v) painted as grooves;
    glow_seams: polylines painted as violet emissive seams."""
    sl, X, Y, w, h = A.region(rect)
    b = BODY if base is None else base
    n = fbm(h, w, 6, seed, 4)
    col = np.broadcast_to(b, (h, w, 3)).copy()
    col *= (0.82 + 0.3 * n)[..., None]
    if fiber:
        f = fbm(h, w, 3, seed + 5, 3, stretch=(6, 0.25))
        col *= (0.86 + 0.28 * f)[..., None]
    for poly in cells_uv:
        P = [(u * w, v * h) for u, v in poly]
        m = inside(X, Y, P)
        if not m.any():
            continue
        d = seg_dist(X, Y, P, closed=True)
        ys = np.array([p[1] for p in P]); yspan = max(ys.max() - ys.min(), 1)
        top = np.clip((Y - ys.min()) / yspan, 0, 1)   # 1 at top
        shade = 0.9 + 0.35 * top
        cell = b * 1.18 * shade[..., None] * (0.85 + 0.3 * n[..., None])
        rim = sstep(3.5, 0.8, d)
        cell = mix(cell, BODY_HI * (0.9 + 0.3 * top[..., None]), rim * 0.85)
        mm = m.astype(np.float32)
        col = col * (1 - mm[..., None]) + cell * mm[..., None]
        groove = sstep(1.6, 0.0, d) * (~m)
        col = mix(col, BODY_LO, groove)
    for pl in seams_uv:
        P = [(u * w, v * h) for u, v in pl]
        d = seg_dist(X, Y, P)
        col = mix(col, BODY_LO, sstep(2.2, 0.3, d))
    em = np.zeros((h, w, 3), np.float32)
    base_w = seam_w
    for pl in glow_seams:
        seam_w = base_w
        if isinstance(pl, tuple) and len(pl) == 2 and isinstance(pl[0], (int, float)):
            seam_w, pl = pl
        P = [(u * w, v * h) for u, v in pl]
        d = seg_dist(X, Y, P)
        core = sstep(seam_w, seam_w * 0.35, d)
        halo = sstep(seam_w * 3.0, 0, d) * 0.45
        col = mix(col, SEAM * 0.55, halo)
        col = mix(col, SEAM, core)
        em = np.maximum(em, SEAM_E[None, None] * np.maximum(core, halo * 0.6)[..., None])
    A.col[sl] = col
    A.em[sl] = np.maximum(A.em[sl], em)


def rect_cells(u0, u1, v0, v1, nu, nv, gap=0.012, jitter=0.0, seed=0, bevel=0.3):
    """Grid of rounded-ish quads (as 6-gons) inside a (u,v) box."""
    r = np.random.default_rng(seed)
    out = []
    du, dv = (u1 - u0) / nu, (v1 - v0) / nv
    for i in range(nu):
        for j in range(nv):
            a, b = u0 + i * du + gap, u0 + (i + 1) * du - gap
            c, d = v0 + j * dv + gap, v0 + (j + 1) * dv - gap
            if jitter:
                a += r.uniform(-jitter, jitter); b += r.uniform(-jitter, jitter)
            k = min(b - a, d - c) * bevel
            out.append([(a + k, c), (b - k, c), (b, c + k), (b, d - k), (b - k, d), (a + k, d), (a, d - k), (a, c + k)])
    return out


def paint_torso(A, boss=False):
    """Torso region: u around (0=char right side, .25 front, .5 left side, .75 back), v = z 0.95..1.70."""
    z0, z1 = 0.95, 1.70
    vz = lambda z: (z - z0) / (z1 - z0)
    cells = []
    for s in (-1, 1):
        cu = 0.25 + s * 0.012
        o = s * 0.1
        # pectoral plates
        cells.append([(cu, vz(1.64)), (cu + o * 0.55, vz(1.65)), (cu + o, vz(1.615)), (cu + o * 1.02, vz(1.55)),
                      (cu + o * 0.6, vz(1.51)), (cu + o * 0.08, vz(1.495)), (cu, vz(1.525))])
        # ab plates, three rows
        for zt, zb, wid in ((1.48, 1.42, 0.056), (1.41, 1.35, 0.052), (1.34, 1.28, 0.048)):
            cells.append([(cu, vz(zt)), (cu + s * wid, vz(zt - 0.006)), (cu + s * (wid + 0.006), vz(zb + 0.006)),
                          (cu + s * wid * 0.5, vz(zb)), (cu, vz(zb + 0.004))])
        # serratus / rib plates on the flanks
        for k in range(4):
            zt = 1.50 - k * 0.05
            cells.append([(cu + s * 0.07, vz(zt)), (cu + s * 0.135, vz(zt + 0.022)), (cu + s * 0.14, vz(zt - 0.022)),
                          (cu + s * 0.075, vz(zt - 0.038))])
        # lats, scapulae, lower back, glutes
        bu = 0.75 - s * 0.012
        cells.append([(bu, vz(1.67)), (bu - s * 0.1, vz(1.66)), (bu - s * 0.14, vz(1.56)), (bu - s * 0.05, vz(1.52)), (bu, vz(1.55))])
        cells.append([(bu, vz(1.50)), (bu - s * 0.075, vz(1.49)), (bu - s * 0.13, vz(1.40)), (bu - s * 0.03, vz(1.34)), (bu, vz(1.35))])
        for k in range(3):
            zt = 1.32 - k * 0.05
            cells.append([(bu, vz(zt)), (bu - s * 0.05, vz(zt)), (bu - s * 0.055, vz(zt - 0.04)), (bu, vz(zt - 0.04))])
        cells.append([(bu, vz(1.12)), (bu - s * 0.11, vz(1.11)), (bu - s * 0.12, vz(1.0)), (bu - s * 0.02, vz(0.98))])
    glow = [[(0.25, vz(1.665)), (0.25, vz(1.585)), (0.25, vz(1.50))],          # sternum
            [(0.25, vz(1.455)), (0.25, vz(1.34)), (0.25, vz(1.22))],            # linea alba
            [(0.75, vz(1.69)), (0.75, vz(1.45)), (0.75, vz(1.2)), (0.75, vz(1.06))]]   # spine
    for s in (-1, 1):
        f = lambda du, z: (0.25 + s * du, vz(z))
        b = lambda du, z: (0.75 + s * du, vz(z))
        glow += [
            [f(0.0, 1.50), f(0.05, 1.515), f(0.095, 1.545), f(0.125, 1.60)],        # pectoral underline -> armpit
            [f(0.015, 1.455), f(0.055, 1.425), f(0.095, 1.39), f(0.13, 1.35)],      # costal arch
            [f(0.125, 1.43), f(0.115, 1.35), f(0.09, 1.27), f(0.05, 1.20)],         # oblique sweep toward the groin
            (1.5, [f(0.0, 1.393), f(0.03, 1.388), f(0.05, 1.40)]),                         # ab crossings
            (1.5, [f(0.0, 1.325), f(0.03, 1.32), f(0.048, 1.33)]),
            (1.5, [b(0.0, 1.53), b(0.05, 1.515), b(0.09, 1.49), b(0.12, 1.45)]),           # rib arcs off the spine
            (1.5, [b(0.0, 1.43), b(0.05, 1.415), b(0.085, 1.39), b(0.11, 1.35)]),
            (1.5, [b(0.0, 1.33), b(0.04, 1.32), b(0.07, 1.29)]),
            (1.5, [b(0.03, 1.66), b(0.08, 1.645), b(0.12, 1.61), b(0.14, 1.55)]),          # scapula edge
        ]
    carapace(A, REG['torso'], cells, glow_seams=glow, seed=3, seam_w=2.6)


def paint_limb(A, name, n_rows, seams, glow, seed, base=None, u_cells=(0.12, 0.38), extra_cells=(), seam_w=1.9):
    cells = []
    for k in range(n_rows):
        v0 = 0.08 + k * (0.84 / n_rows); v1 = v0 + 0.84 / n_rows - 0.02
        cells.append([(u_cells[0], v0), (u_cells[1], v0 + 0.01), (u_cells[1] + 0.02, v1 - 0.02), (u_cells[0] + 0.03, v1)])
        cells.append([(u_cells[0] + 0.5, v0 + 0.02), (u_cells[1] + 0.5, v0), (u_cells[1] + 0.47, v1), (u_cells[0] + 0.52, v1 - 0.01)])
    cells += list(extra_cells)
    carapace(A, REG[name], cells, seams_uv=seams, glow_seams=glow, seed=seed, base=base, seam_w=seam_w)


def gradient_region(A, name, c0, c1, along='v', stripe=None, em0=None, em1=None, power=1.0, rings=0, ring_col=None):
    sl, X, Y, w, h = A.region(REG[name])
    t = (Y / h if along == 'v' else X / w) ** power
    n = fbm(h, w, 4, hash(name) % 1000, 3)
    col = mix(np.broadcast_to(c0, (h, w, 3)), np.broadcast_to(c1, (h, w, 3)), t) * (0.9 + 0.2 * n)[..., None]
    if rings:
        r = np.abs(np.sin((Y / h) * math.pi * rings))
        col = mix(col, ring_col, sstep(0.25, 0.0, r) * 0.7 * (1 - t))
    if stripe is not None:
        d = np.abs(X / w - stripe)
        col = mix(col, np.minimum(c1 * 1.25, 1), sstep(0.08, 0.0, d) * 0.6)
    A.col[sl] = col
    if em0 is not None:
        A.em[sl] = mix(np.broadcast_to(em0, (h, w, 3)), np.broadcast_to(em1, (h, w, 3)), t)


def paint_mask(A):
    """Mask loft region: u around (0 = bottom centre, 0.5 = top keel), v = back(0) -> snout tip(1)."""
    sl, X, Y, w, h = A.region(REG['mask'])
    U, Vv = X / w, Y / h
    n = fbm(h, w, 8, 21, 4)
    top = 1 - np.abs(U - 0.5) * 2          # 1 on the keel, 0 underneath
    col = mix(np.broadcast_to(BONE_LO, (h, w, 3)), np.broadcast_to(BONE, (h, w, 3)), np.clip(0.25 + top * 1.1, 0, 1))
    col = col * (0.9 + 0.16 * n)[..., None]
    col = mix(col, BONE_LO * 0.8, sstep(0.25, 0.0, Vv) * 0.7)      # back edge darker
    # keel highlight + plate grooves
    col = mix(col, np.array([1.0, 0.99, 0.97]), sstep(0.02, 0.0, np.abs(U - 0.5)) * 0.6)
    groove_lines = [
        [(0.30, 0.25), (0.33, 0.55), (0.38, 0.95)], [(0.70, 0.25), (0.67, 0.55), (0.62, 0.95)],
        [(0.18, 0.30), (0.24, 0.62)], [(0.82, 0.30), (0.76, 0.62)],
        [(0.40, 0.18), (0.5, 0.12), (0.60, 0.18)],
    ]
    for pl in groove_lines:
        P = [(u * w, v * h) for u, v in pl]
        d = seg_dist(X, Y, P)
        col = mix(col, BONE_LO * 0.55, sstep(1.4, 0.2, d) * 0.9)
        col = mix(col, np.array([0.98, 0.96, 0.93]), (sstep(3.0, 1.6, d) * (d > 1.4)) * 0.35)
    # cracks
    r = np.random.default_rng(5)
    for k in range(9):
        p = np.array([r.uniform(0.1, 0.9) * w, r.uniform(0.1, 0.9) * h]); pts = [tuple(p)]
        ang = r.uniform(0, 2 * math.pi)
        for s in range(4):
            ang += r.uniform(-0.8, 0.8); p = p + np.array([math.cos(ang), math.sin(ang)]) * r.uniform(5, 12)
            pts.append(tuple(p))
        d = seg_dist(X, Y, pts)
        col = mix(col, BONE_LO * 0.5, sstep(0.9, 0.1, d) * 0.8)
    # nostril slits near the snout tip, top sides
    for s in (-1, 1):
        cu = 0.5 + s * 0.09
        d = seg_dist(X, Y, [(cu * w, 0.80 * h), ((cu + s * 0.02) * w, 0.9 * h)])
        col = mix(col, HOLE, sstep(1.5, 0.3, d))
    A.col[sl] = col


def paint_plate_cell(A, spec):
    """Pale or dark plate front face: outline-following rim light, keel line, holes, scratches."""
    rect = CELLS[spec['cell']] if isinstance(spec['cell'], int) else REG[spec['cell']]
    sl, X, Y, w, h = A.region(rect)
    style = spec.get('style', 'pale')
    P = [(u * w, v * h) for u, v in spec['outline']]
    m = inside(X, Y, P)
    d = seg_dist(X, Y, P, closed=True)
    n = fbm(h, w, 5, spec['cell'] * 13 + 1, 4)
    ys = np.array([p[1] for p in P]); top = np.clip((Y - ys.min()) / max(np.ptp(ys), 1), 0, 1)
    if style == 'pale':
        base, hi, lo = PALE, PALE_HI, PALE_LO
    elif style == 'bone':
        base, hi, lo = BONE * 0.93, np.array([1.0, 0.99, 0.96], np.float32), BONE_LO * 0.8
    else:
        base, hi, lo = DARKPL, DARKPL_HI, BODY_LO
    col = base * (0.86 + 0.22 * n)[..., None] * (0.88 + 0.2 * top)[..., None]
    # interior depth: darker toward the centre for pale plates (reads as a concave shell)
    inner = sstep(4, 26 * w / 128, d)
    col = mix(col, col * (0.82 if style == 'pale' else 0.9), inner * m)
    col = mix(col, hi, sstep(4.5, 1.0, d) * 0.9)       # rim highlight
    col = mix(col, lo, sstep(1.2, 0.0, d) * 0.6)
    cx, cy = spec['center'][0] * w, spec['center'][1] * h
    em = np.zeros((h, w, 3), np.float32)
    if spec.get('keel'):
        # centre ridge line (light) with a darker groove beside it
        kd = np.abs(X - cx) if spec.get('keel_axis', 'v') == 'v' else np.abs(Y - cy)
        col = mix(col, hi, sstep(1.4, 0.0, kd) * 0.7 * m)
        col = mix(col, lo, (sstep(3.5, 2.0, kd) * (kd > 1.4)) * 0.5 * m)
    for hx, hy, hr, hr2, ha in spec.get('holes', ()):
        # hole = dark rounded slot with light lip
        c, s_ = math.cos(ha), math.sin(ha)
        dx, dy = X - hx * w, Y - hy * h
        rx = (dx * c + dy * s_) / (hr * w); ry = (-dx * s_ + dy * c) / (hr2 * w)
        rr = np.sqrt(rx * rx + ry * ry)
        col = mix(col, hi, sstep(1.35, 1.05, rr) * (rr > 1.0) * 0.6 * m)
        col = mix(col, HOLE, sstep(1.02, 0.9, rr) * m)
    for gl in spec.get('grooves', ()):
        G = [(u * w, v * h) for u, v in gl]
        gd = seg_dist(X, Y, G)
        col = mix(col, lo * 0.7, sstep(1.3, 0.2, gd) * m)
    for gl in spec.get('glow', ()):
        G = [(u * w, v * h) for u, v in gl]
        gd = seg_dist(X, Y, G)
        core = sstep(1.8, 0.4, gd) * m; halo = sstep(5, 0, gd) * 0.4 * m
        col = mix(col, SEAM * 0.6, halo); col = mix(col, SEAM, core)
        em = np.maximum(em, SEAM_E[None, None] * np.maximum(core, halo * 0.5)[..., None])
    # scratches
    r = np.random.default_rng(spec['cell'] + 99)
    for k in range(10):
        x0, y0 = r.uniform(0, w), r.uniform(0, h); a = r.uniform(0, math.pi); L = r.uniform(4, 14)
        sd = seg_dist(X, Y, [(x0, y0), (x0 + math.cos(a) * L, y0 + math.sin(a) * L)])
        col = mix(col, hi if r.random() < 0.5 else lo, sstep(0.8, 0.0, sd) * 0.5 * m)
    # bleed outside with the rim colour so mip levels do not pick up background
    col = np.where(m[..., None], col, np.broadcast_to(hi * 0.8, col.shape))
    A.col[sl] = col
    A.em[sl] = em


def build_atlas(plate_specs):
    A = Atlas()
    paint_torso(A)
    # limbs: u .25 = front (legs) / dorsal (arms); v along the bone chain
    # limbs: curved seams along muscle splits (u .25 = front/dorsal, .75 = back/underside)
    paint_limb(A, 'upperarm', 3, [], [[(0.5, 0.18), (0.46, 0.5), (0.5, 0.86)], [(0.03, 0.18), (0.07, 0.5), (0.03, 0.86)]], 11, seam_w=1.5)
    paint_limb(A, 'forearm', 4, [], [[(0.75, 0.06), (0.69, 0.4), (0.63, 0.7), (0.6, 0.92)],
                                     [(0.75, 0.06), (0.81, 0.4), (0.87, 0.7), (0.9, 0.92)]], 12)
    paint_limb(A, 'thigh', 3, [], [[(0.22, 0.1), (0.16, 0.32), (0.17, 0.55)],
                                   [(0.28, 0.1), (0.34, 0.32), (0.33, 0.55)]], 13, seam_w=1.4)
    paint_limb(A, 'shin', 4, [], [[(0.6, 0.08), (0.63, 0.3), (0.7, 0.44), (0.75, 0.47), (0.8, 0.44), (0.87, 0.3), (0.9, 0.08)]], 14, seam_w=1.5)
    paint_limb(A, 'meta', 3, [], [], 15)
    paint_limb(A, 'neck', 3, [], [[(0.75, 0.0), (0.75, 0.7)], [(0.35, 0.1), (0.3, 0.8)], [(0.15, 0.1), (0.2, 0.8)]], 16)
    gradient_region(A, 'hand', BODY * 1.1, BODY * 0.9, rings=3, ring_col=BODY_HI)
    gradient_region(A, 'digit', BODY * 1.2, BODY * 0.9, rings=4, ring_col=BODY_HI)
    gradient_region(A, 'toe', BODY * 1.2, BODY * 0.9, rings=3, ring_col=BODY_HI)
    gradient_region(A, 'claw', hexc('2a2530'), hexc('b4acbd'), power=1.6, stripe=0.25)
    gradient_region(A, 'horn', hexc('a39884'), hexc('f3eee3'), power=0.6, stripe=0.25)
    gradient_region(A, 'steel', hexc('4c4a52'), hexc('c9c7ce'), power=0.9, stripe=0.25)
    gradient_region(A, 'spike', hexc('221d28'), hexc('7d7288'), power=1.3, stripe=0.25)
    gradient_region(A, 'mane', hexc('1e1a24'), hexc('5d5468'), power=1.2, stripe=0.25)
    gradient_region(A, 'teeth', hexc('3a2432'), hexc('f4efe6'), power=0.5)
    paint_mask(A)
    sl, X, Y, w, h = A.region(REG['jaw'])
    A.col[sl] = mix(np.broadcast_to(BONE_LO, (h, w, 3)), np.broadcast_to(BONE, (h, w, 3)),
                    np.clip(1 - np.abs(X / w - 0.5) * 2 + 0.2, 0, 1)) * (0.9 + 0.15 * fbm(h, w, 6, 4))[..., None]
    sl, X, Y, w, h = A.region(REG['mouth'])
    A.col[sl] = hexc('241533'); A.em[sl] = hexc('3a1666')
    sl, X, Y, w, h = A.region(REG['glow'])
    g = sstep(0.0, 1.0, 1 - np.abs(Y / h - 0.5) * 2)
    A.col[sl] = mix(np.broadcast_to(hexc('7a2cff'), (h, w, 3)), np.broadcast_to(hexc('d9bdff'), (h, w, 3)), g)
    A.em[sl] = mix(np.broadcast_to(hexc('7a24ff'), (h, w, 3)), np.broadcast_to(hexc('c08cff'), (h, w, 3)), g)
    sl, X, Y, w, h = A.region(REG['socket'])
    A.col[sl] = hexc('120e17')
    sl, X, Y, w, h = A.region(REG['edge_pale'])
    A.col[sl] = mix(np.broadcast_to(PALE_HI, (h, w, 3)), np.broadcast_to(PALE * 0.8, (h, w, 3)), np.abs(Y / h - 0.5) * 2)
    sl, X, Y, w, h = A.region(REG['edge_bone'])
    A.col[sl] = mix(np.broadcast_to(np.array([1.0, 0.99, 0.96], np.float32), (h, w, 3)), np.broadcast_to(BONE_LO, (h, w, 3)), np.abs(Y / h - 0.5) * 2)
    sl, X, Y, w, h = A.region(REG['edge_dark'])
    A.col[sl] = mix(np.broadcast_to(DARKPL_HI, (h, w, 3)), np.broadcast_to(DARKPL, (h, w, 3)), np.abs(Y / h - 0.5) * 2)
    # cloth: vertical folds, frayed darker bottom, faint violet hem
    sl, X, Y, w, h = A.region(REG['cloth'])
    folds = 0.5 + 0.5 * np.sin(X / w * math.pi * 10 + 2 * fbm(h, w, 3, 8))
    c = hexc('2a2233') * (0.75 + 0.35 * folds)[..., None] * (0.85 + 0.2 * fbm(h, w, 8, 9, 3, stretch=(3, 0.3)))[..., None]
    c = mix(c, hexc('5b3a86'), sstep(0.12, 0.02, Y / h) * 0.8)
    A.col[sl] = c
    A.em[sl] = hexc('3c1a70')[None, None] * sstep(0.08, 0.0, Y / h)[..., None]
    for spec in plate_specs:
        paint_plate_cell(A, spec)
    return A


def to_image(bpy, arr, name, path):
    S = arr.shape[0]
    img = bpy.data.images.get(name) or bpy.data.images.new(name, S, S, alpha=False)
    rgba = np.ones((S, S, 4), np.float32)
    rgba[..., :3] = np.clip(arr, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img
