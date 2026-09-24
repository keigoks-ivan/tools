"""Reproducible build of the oni foot-soldier + boss (one Mixamo-named rig, two skinned meshes,
one shared 1024^2 atlas + emissive map). Writes oni_project.blend.

  /Applications/Blender.app/Contents/MacOS/Blender -b --python build_oni.py

Order: rig -> grunt mesh -> boss mesh -> atlas painting -> material -> retarget test clips -> save.
"""
import bpy, sys, os, math, importlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import onilib, atlas
importlib.reload(onilib); importlib.reload(atlas)
from onilib import (V, MeshBuilder, Weigher, tube, horn, blade, plate, star_outline, basis, loft, frame_from,
                    ellipse4, REG, bezier, muscle_tube)
from mathutils import Vector, Matrix

WORK = os.environ.get('ONI_V2_WORK', os.path.join(os.path.dirname(HERE), 'work'))
os.makedirs(WORK, exist_ok=True)
OUT_BLEND = os.path.join(WORK, 'oni_project.blend')
TEX_BASE = os.path.join(WORK, 'oni_atlas.png')
TEX_EMIT = os.path.join(WORK, 'oni_emissive.png')

LR = (('Left', 1), ('Right', -1))


def mir(s):
    return Matrix.Diagonal((s, 1, 1, 1))


def lerp_table(tab, z):
    """tab rows: (z, *vals) sorted by z. Smooth (cosine) interpolation."""
    if z <= tab[0][0]:
        return tab[0][1:]
    for a, b in zip(tab, tab[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0]); t = t * t * (3 - 2 * t)
            return tuple(x * (1 - t) + y * t for x, y in zip(a[1:], b[1:]))
    return tab[-1][1:]


class Oni:
    """Pass 2: shaped muscle lofts, ribcage/abdominal torso forms, thick layered plates, fewer & bigger spikes."""
    def __init__(self, S, boss=False):
        self.S = S; self.boss = boss
        self.B = MeshBuilder(); self.W = Weigher(S)
        self.specs = []
        self.k = 1.22 if boss else 1.0          # limb bulk
        self.kw = 1.12 if boss else 1.0         # torso width
        self.budget = {}

    def bone(self, n):
        return 'mixamorig' + n

    BOSS_CELLS = {9: 20, 10: 21, 15: 22, 11: 23, 14: 24, 1: 25, 4: 26, 6: 27, 7: 16}

    def cell(self, n):
        return self.BOSS_CELLS.get(n, n) if self.boss else n

    def seg(self, n):
        h, t = self.S['mixamorig' + n][:2]
        return h, t

    def add_spec(self, spec, **kw):
        if isinstance(spec['cell'], int) and spec['cell'] not in {s['cell'] for s in self.specs}:
            spec.update(kw); self.specs.append(spec)

    # ------------------------------------------------------------------ torso
    TORSO = [  # z, halfW, front, back, y-centre, squareness
        (0.95, 0.05, 0.045, 0.05, 0.035, 2.0),
        (0.99, 0.125, 0.08, 0.095, 0.035, 2.1),
        (1.04, 0.155, 0.09, 0.11, 0.035, 2.2),
        (1.09, 0.150, 0.085, 0.10, 0.035, 2.2),
        (1.15, 0.126, 0.074, 0.08, 0.035, 2.1),
        (1.22, 0.100, 0.066, 0.064, 0.035, 2.0),
        (1.28, 0.094, 0.07, 0.064, 0.033, 2.0),
        (1.34, 0.114, 0.086, 0.075, 0.028, 2.05),
        (1.41, 0.156, 0.112, 0.095, 0.02, 2.1),
        (1.48, 0.192, 0.134, 0.115, 0.01, 2.1),
        (1.55, 0.206, 0.14, 0.132, 0.0, 2.1),
        (1.61, 0.196, 0.128, 0.145, -0.008, 2.05),
        (1.66, 0.165, 0.10, 0.14, -0.014, 2.0),
        (1.70, 0.095, 0.07, 0.10, -0.025, 2.0),
    ]
    Z0, Z1 = 0.95, 1.70

    def torso(self):
        kw, B, W = self.kw, self.B, self.W
        chest = 1.08 if self.boss else 1.0
        T = [(z, hw * (chest if z > 1.38 else 1), fr * (chest if z > 1.38 else 1), bk, yc, sq)
             for z, hw, fr, bk, yc, sq in self.TORSO]
        self.T = T
        n = 20; m = 31
        g = lambda v, c, w: math.exp(-((v - c) / w) ** 2)
        rings = []
        for i in range(m):
            z = self.Z0 + (self.Z1 - self.Z0) * i / (m - 1)
            hw, fr, bk, yc, sq = lerp_table(T, z)
            hw *= kw; fr *= (kw * 0.5 + 0.5); bk *= (kw * 0.5 + 0.5)
            pts = []
            for j in range(n):
                a = 2 * math.pi * j / n
                c, s = math.cos(a), math.sin(a)
                x = -hw * math.copysign(abs(c) ** (2 / sq), c)     # u=0 -> char right (-x), matches atlas
                yy = math.copysign(abs(s) ** (2 / sq), s)
                ax = abs(x) / kw
                if yy > 0:
                    y = -fr * yy
                    # pectoral slabs, lower edge sharp
                    y -= 0.02 * g(ax, 0.085, 0.05) * g(z, 1.575, 0.045) * yy
                    # costal arch: chevron ridge running down-out from the sternum
                    y -= 0.011 * g(z, 1.445 - 0.55 * max(0.0, ax - 0.02), 0.022) * g(ax, 0.08, 0.06) * yy
                    # abdominal plates: two soft rows either side of the midline
                    y -= 0.008 * (g(z, 1.395, 0.02) + g(z, 1.325, 0.02) + 0.7 * g(z, 1.26, 0.02)) * g(ax, 0.04, 0.03) * yy
                    # external obliques flare above the belt
                    y -= 0.006 * g(z, 1.20, 0.04) * g(ax, 0.085, 0.03)
                else:
                    y = -bk * yy
                    y += 0.014 * g(x, 0, 0.022) * min(1, abs(yy))                 # spine groove
                    y += 0.016 * g(ax, 0.085, 0.045) * g(z, 1.57, 0.06) * -yy      # scapula slabs
                    y += 0.012 * g(ax, 0.13, 0.05) * g(z, 1.45, 0.07) * -yy        # lats
                # serratus / rib ridges on the flanks (three staggered lobes)
                side = abs(c) ** 1.5
                ribs = sum(g(z, zc, 0.018) for zc in (1.40, 1.45, 1.50))
                xs = math.copysign(0.007 * ribs * side * g(yy, 0.25, 0.45), x)
                pts.append(Vector((x + xs, yc + y, z)))
            rings.append(pts)
        bias = {self.bone('LeftUpLeg'): 0.07, self.bone('RightUpLeg'): 0.07,
                self.bone('LeftShoulder'): 0.015, self.bone('RightShoulder'): 0.015}
        wf = W.chain([self.bone(b) for b in ('Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'LeftShoulder',
                                              'RightShoulder', 'LeftUpLeg', 'RightUpLeg')], sigma=0.035, bias=bias)
        loft(B, rings, 'torso', wf, vcoords=[i / (m - 1) for i in range(m)])
        # neck: thick trapezius base, jutting forward, sternomastoid cords
        k = self.k
        path = [V(0, 0.01, 1.60), V(0, -0.03, 1.66), V(0, -0.08, 1.695), V(0, -0.12, 1.72), V(0, -0.15, 1.745)]
        rad = lambda t: (0.085 * k * (1 - t) + 0.042 * t, 0.08 * k * (1 - t) + 0.04 * t)
        bumps = [((1, 0.3, 0), 0.35, 0.3, 0.01, 0.6), ((-1, 0.3, 0), 0.35, 0.3, 0.01, 0.6), ((0, 1, 0.3), 0.1, 0.25, 0.018, 1.0)]
        muscle_tube(B, path, rad, bumps, V(0, 0, -1), 'neck',
                    W.chain([self.bone(b) for b in ('Spine2', 'Neck', 'Head')], 0.03), n=10, rings=6)
        # dark belt band
        zc, hgt = 1.17, 0.05
        n = 16
        ring_pts = [(math.cos(2 * math.pi * j / n), math.sin(2 * math.pi * j / n)) for j in range(n)]
        rings = []
        for dz, grow in ((-hgt / 2, 1.0), (-hgt / 2, 1.1), (hgt / 2, 1.1), (hgt / 2, 1.0)):
            hw, fr, bk, yc, sq = lerp_table(T, zc + dz)
            hw = hw * kw * grow + 0.006; fr = fr * grow + 0.006; bk = bk * grow + 0.006
            rings.append([Vector((-hw * c, yc + (-fr * s if s > 0 else -bk * s), zc + dz)) for c, s in ring_pts])
        ids = loft(B, rings, 'edge_dark', W.rigid(self.bone('Hips')), cap0=False, cap1=False, smooth=False)
        for j in range(n):
            j2 = (j + 1) % n
            B.f((ids[3][j], ids[3][j2], ids[0][j2], ids[0][j]), [onilib.reg_uv(REG['edge_dark'], 0.5, 0.5)] * 4, False)
        S2 = W.chain(['mixamorigSpine2', 'mixamorigSpine1'], 0.03)
        if not self.boss:   # steel sternum V
            M = basis(V(0, -0.152, 1.535), V(0, -1, 0.18), V(0, 0, 1))
            out = [(0, -0.1), (0.025, -0.04), (0.06, 0.03), (0.075, 0.06), (0.03, 0.045), (0, 0.07), (-0.03, 0.045),
                   (-0.075, 0.06), (-0.06, 0.03), (-0.025, -0.04)]
            sp = plate(B, out, 13, M, S2, thick=0.02, bevel=0.007, bend=(7.0, 0.0), keel=0.016, center=(0, 0.0))
            self.add_spec(sp, style='pale', keel=True, glow=[[(0.5, 0.2), (0.5, 0.45)]])

    # ------------------------------------------------------------------ head
    def head(self):
        B, W = self.B, self.W
        hs = 1.1 if self.boss else 1.0
        H = W.rigid(self.bone('Head'))
        dy, dz = -0.03, -0.045
        o = V(0, -0.11 + dy, 1.79 + dz)
        def P(x, y, z):
            p = V(x, y + dy, z + dz)
            return o + (p - o) * hs
        half = [(0, -0.55), (0.55, -0.62), (0.95, -0.3), (1.0, 0.05), (0.8, 0.45), (0.45, 0.78), (0.12, 0.97)]
        shape = half + [(0, 1.04)] + [(-x, y) for x, y in reversed(half[1:])]
        secs = [(0.025, 1.825, 0.045, 0.055), (-0.02, 1.83, 0.074, 0.084), (-0.07, 1.82, 0.088, 0.09),
                (-0.12, 1.797, 0.07, 0.072), (-0.17, 1.77, 0.05, 0.054), (-0.215, 1.745, 0.032, 0.038), (-0.25, 1.726, 0.013, 0.02)]
        loft(B, [[P(x * hw, y, zc + z * hh) for x, z in shape] for y, zc, hw, hh in secs], 'mask', H)
        jaw_half = [(0, -1.0), (0.6, -0.8), (1.0, -0.1), (0.7, 0.35)]
        jshape = jaw_half + [(0, 0.3)] + [(-x, z) for x, z in reversed(jaw_half[1:])]
        jsecs = [(-0.06, 1.748, 0.058, 0.032), (-0.11, 1.718, 0.047, 0.027), (-0.16, 1.688, 0.034, 0.021),
                 (-0.2, 1.664, 0.02, 0.015), (-0.222, 1.652, 0.007, 0.008)]
        loft(B, [[P(x * hw, y, zc + z * hh) for x, z in jshape] for y, zc, hw, hh in jsecs], 'jaw', H)
        msecs = [(-0.07, 1.768, 0.052, 0.03), (-0.13, 1.74, 0.04, 0.03), (-0.19, 1.71, 0.022, 0.022)]
        loft(B, [[P(x * hw, y, zc + z * hh) for x, z in ellipse4(6, 1, 1, 1, 1)] for y, zc, hw, hh in msecs], 'mouth', H)
        for s in (1, -1):
            for i, t in enumerate((0.0, 0.25, 0.5, 0.75, 1.0)):
                y = -0.085 - t * 0.14
                hw = 0.072 - t * 0.046
                zt = 1.797 - 0.07 * 0.55 - t * 0.055 + 0.004
                ln = 0.028 + (0.024 if i in (1, 3) else 0.0)
                base = P(s * hw * 0.62, y, zt)
                horn(B, base, base + V(0, -0.002, -ln * 0.5), base + V(-s * 0.004, -0.007, -ln), 0.01 * hs, V(0, -1, 0),
                     'teeth', H, k=1, n=4, smooth=False)
            for i, t in enumerate((0.15, 0.45, 0.75)):
                y = -0.075 - t * 0.13
                hw = 0.052 - t * 0.036
                zt = 1.748 - t * 0.09 + 0.008
                ln = 0.03 if i == 1 else 0.022
                base = P(s * hw * 0.7, y, zt)
                horn(B, base, base + V(0, 0, ln * 0.5), base + V(-s * 0.003, -0.004, ln), 0.009 * hs, V(0, -1, 0),
                     'teeth', H, k=1, n=4, smooth=False)
        # big slanted eyes in deep sockets (sized to carry at game distance)
        for s in (1, -1):
            c = P(s * 0.061, -0.112, 1.815)
            M = mir(s) @ basis(V(abs(c.x), c.y, c.z), V(0.75, -0.55, 0.35), V(0, 0.35, 1))
            sock = [(-0.05, -0.008), (-0.018, -0.03), (0.034, -0.024), (0.056, 0.02), (0.016, 0.03), (-0.036, 0.02)]
            plate(B, [(x * hs, y * hs) for x, y in sock], 'socket', M, H, thick=0.006, bevel=0.002, rings=(), edge='edge_dark')
            M2 = M @ Matrix.Translation((0.004, 0.0, 0.004))
            eye = [(-0.04, -0.004), (-0.014, -0.019), (0.034, -0.014), (0.05, 0.017), (0.008, 0.019), (-0.028, 0.012)]
            plate(B, [(x * hs, y * hs) for x, y in eye], 'glow', M2, H, thick=0.006, bevel=0.002, rings=(), edge='glow')
        for s in (1, -1):   # heavy brow blades
            blade(B, P(s * 0.028, -0.15, 1.85), P(s * 0.08, -0.095, 1.88), P(s * 0.125, -0.03, 1.93),
                  0.026 * hs, 0.011 * hs, V(0, 0, 1), 'horn', H, k=3)
        big = 1.3 if self.boss else 1.0
        for s in (1, -1):   # main horn V
            horn(B, P(s * 0.06, -0.05, 1.87), P(s * 0.14 * big, -0.04, 2.0 + 0.04 * (big - 1)),
                 P(s * 0.17 * big, 0.04, 2.14 + 0.14 * (big - 1)), 0.038 * hs * (1.15 if self.boss else 1), V(0, -1, 0),
                 'horn', H, k=7, n=6, power=0.9)
        c = P(0, -0.085, 1.905)   # trident crest
        M = basis(c, V(0, -0.75, 0.66), V(0, 0.66, 0.75))
        tall = 1.25 if self.boss else 1.0
        out = [(0, 0.2 * tall), (0.022, 0.07), (0.05, 0.13 * tall), (0.058, 0.04), (0.062, -0.02), (0.035, -0.05), (0, -0.07),
               (-0.035, -0.05), (-0.062, -0.02), (-0.058, 0.04), (-0.05, 0.13 * tall), (-0.022, 0.07)]
        sp = plate(B, [(x * hs, y * hs) for x, y in out], self.cell(14), M, H, thick=0.018, bevel=0.006, bend=(9.0, -0.5),
                   keel=0.014, rings=(0.5,), edge='edge_bone')
        self.add_spec(sp, style='bone', keel=True)
        # mane: three big dark blades sweeping back from the skull
        for a, b, c2, w, ref in (((0, 0.02, 1.86), (0, 0.12, 1.87), (0, 0.23, 1.78), 0.045, V(1, 0, 0)),
                                 ((0.045, 0.015, 1.83), (0.1, 0.1, 1.82), (0.15, 0.17, 1.72), 0.04, V(1, 0, 0.8)),
                                 ((-0.045, 0.015, 1.83), (-0.1, 0.1, 1.82), (-0.15, 0.17, 1.72), 0.04, V(-1, 0, 0.8))):
            blade(B, P(*a), P(*b), P(*c2), w * hs, 0.012, ref, 'mane', H, k=3)
        NS = W.chain([self.bone(b) for b in ('Neck', 'Spine2', 'Spine1')], 0.02)
        # three big spine blades down the hunched back
        for z, y, ln, w in ((1.64, 0.115, 0.15, 0.045), (1.53, 0.145, 0.14, 0.042), (1.42, 0.13, 0.1, 0.034)):
            yb = y * (1.12 if self.boss else 1.0)
            ln *= (1.45 if self.boss else 1.0)
            blade(B, V(0, yb - 0.035, z), V(0, yb + ln * 0.5, z + ln * 0.3), V(0, yb + ln, z + ln * 0.2),
                  w, 0.012, V(1, 0, 0), 'mane', NS, k=3)

    # ------------------------------------------------------------------ arms
    def arms(self):
        B, W, k = self.B, self.W, self.k
        SH = self.S['mixamorigLeftArm'][0].z
        for side, s in LR:
            b = lambda n: 'mixamorig' + side + n
            X = lambda x, y, z: V(s * x, y, z)
            # upper arm: deltoid cap, biceps / triceps split, narrow elbow
            path = [X(0.11, 0.01, SH), X(0.33, 0.01, SH), X(0.575, 0.01, SH)]
            rad = lambda t: ((0.058 - 0.02 * t) * k, (0.058 - 0.02 * t) * k)
            bumps = [((0, 0, 1), 0.2, 0.16, 0.028 * k, 1.1), ((0, -1, 0.4), 0.22, 0.14, 0.016 * k, 0.8),
                     ((0, 1, 0.4), 0.2, 0.14, 0.014 * k, 0.8),
                     ((0, -1, -0.2), 0.55, 0.2, 0.018 * k, 0.75), ((0, 1, -0.3), 0.48, 0.24, 0.02 * k, 0.9),
                     ((s, 0, 0), 0.95, 0.1, -0.006, 3.0)]
            muscle_tube(B, path, rad, bumps, V(0, 0, 1), 'upperarm',
                        W.chain([b('Shoulder'), b('Arm'), b('ForeArm'), 'mixamorigSpine2'], 0.03, bias={'mixamorigSpine2': 0.03}),
                        n=12, rings=9)
            # forearm: extensor/brachioradialis swell high on the dorsal side, flexors below, long wrist taper
            path = [X(0.525, 0.01, SH), X(0.74, 0.01, SH), X(0.955, 0.01, SH)]
            rad = lambda t: ((0.046 - 0.016 * t) * k, (0.044 - 0.02 * t) * k)
            bumps = [((0, 0, 1), 0.24, 0.18, 0.026 * k, 0.95), ((0, -1, 0.5), 0.2, 0.16, 0.016 * k, 0.7),
                     ((0, 0, -1), 0.28, 0.2, 0.018 * k, 0.9), ((0, 1, 0), 0.22, 0.2, 0.01 * k, 0.8)]
            muscle_tube(B, path, rad, bumps, V(0, 0, 1), 'forearm', W.chain([b('Arm'), b('ForeArm'), b('Hand')], 0.025),
                        n=12, rings=10)
            hk = 1.15 if self.boss else 1.0
            palm = [X(0.93, 0.01, SH), X(0.975, 0.008, SH - 0.001), X(1.025, 0.005, SH - 0.003)]
            tube(B, palm, [(0.045 * hk, 0.045 * hk, 0.027 * hk, 0.021 * hk), (0.062 * hk, 0.062 * hk, 0.027 * hk, 0.02 * hk),
                           (0.06 * hk, 0.06 * hk, 0.023 * hk, 0.018 * hk)], V(0, 0, 1), 'hand',
                 W.chain([b('ForeArm'), b('Hand'), b('HandIndex1'), b('HandMiddle1'), b('HandRing1')], 0.02), n=8)
            for fn in ('Index', 'Middle', 'Ring', 'Thumb'):
                chain = [b(f'Hand{fn}{i}') for i in (1, 2, 3)]
                pts = [self.S[chain[0]][0]] + [self.S[c][1] for c in chain]
                r0 = (0.02 if fn != 'Thumb' else 0.022) * hk
                profs = [(r0, r0, r0 * 0.95, r0 * 0.85), (r0 * 1.05, r0 * 1.05, r0 * 1.05, r0 * 0.9), (r0 * 0.85,) * 4, (r0 * 0.78,) * 4]
                tube(B, pts, profs, V(0, 0, 1), 'digit', W.chain([b('Hand')] + chain, 0.012), n=5)
                tip = pts[-1]; d = (pts[-1] - pts[-2]).normalized()
                cl = (0.105 if fn != 'Thumb' else 0.07) * hk * (1.1 if self.boss else 1)
                horn(B, tip - d * 0.012, tip + d * cl * 0.55, tip + d * cl * 0.75 + V(0, 0, -cl * 0.6),
                     r0 * 1.05, V(0, 0, 1), 'claw', W.rigid(chain[-1]), k=5, n=5, power=1.1)
            # layered forearm guard: three overlapping thick lames (elbow lame on top), plus the elbow blade
            FA = W.rigid(b('ForeArm'))
            lames = [(0.62, 0.066, 0.13, 1.0, 1), (0.735, 0.058, 0.12, 0.92, 28), (0.845, 0.048, 0.1, 0.82, 29)]
            for idx, (x0, lift, ln, wsc, cell) in enumerate(lames):
                M = mir(s) @ basis(V(x0, 0.01, SH + lift * k), V(0.35, 0, 1), V(1, 0, 0))
                out = [(0, -ln * 0.62), (0.05 * wsc, -ln * 0.5), (0.085 * wsc, -ln * 0.38), (0.07 * wsc, ln * 0.2), (0.05 * wsc, ln * 0.5),
                       (0, ln * 0.55), (-0.05 * wsc, ln * 0.5), (-0.07 * wsc, ln * 0.2), (-0.085 * wsc, -ln * 0.38), (-0.05 * wsc, -ln * 0.5)]
                out = [(x * k, y) for x, y in out]
                sp = plate(B, out, self.cell(1) if idx == 0 else cell, M, FA, thick=0.022, bevel=0.008,
                           bend=(9.0 / k, 0.0), keel=0.012, rings=(0.5,))
                self.add_spec(sp, style='pale', keel=True, holes=[(0.5, 0.5, 0.05, 0.018, 1.57)] if idx == 0 else [])
            blade(B, X(0.575, 0.01, SH + 0.04 * k), X(0.49, 0.015, SH + 0.1 * k), X(0.36, 0.02, SH + 0.155 * k),
                  0.05 * k, 0.014, V(0, 1, 0), 'steel', FA, k=4)

    # ------------------------------------------------------------------ shoulders
    def pauldrons(self):
        B, W = self.B, self.W
        sc = 1.3 if self.boss else 1.0
        SH = self.S['mixamorigLeftArm'][0].z
        for side, s in LR:
            b = lambda n: 'mixamorig' + side + n
            wf = (lambda sh, am: (lambda p: {sh: 0.45, am: 0.55}))(b('Shoulder'), b('Arm'))
            AR = (lambda sh, am: (lambda p: {sh: 0.2, am: 0.8}))(b('Shoulder'), b('Arm'))
            # main shield: fewer, broader points; thick with a deep bevel
            tips = [(95, 0.25), (35, 0.15), (-5, 0.2), (-60, 0.14), (-110, 0.15), (175, 0.14), (140, 0.15)]
            out = star_outline(tips, inner=0.8)
            out = [(x * sc, y * sc) for x, y in out]
            M = mir(s) @ basis(V(0.24 + 0.03 * (sc - 1), -0.05, SH + 0.075 + 0.03 * (sc - 1)), V(0.62, -0.68, 0.4), V(-0.3, 0.1, 1))
            sp = plate(B, out, 0, M, wf, thick=0.03, bevel=0.011, bend=(1.6 / sc, 1.6 / sc), keel=0.026, rings=(0.45,))
            self.add_spec(sp, style='pale', keel=True,
                          holes=[(0.5, 0.64, 0.05, 0.03, 1.5), (0.34, 0.44, 0.032, 0.02, 0.5)],
                          grooves=[[(0.5, 0.5), (0.5, 0.88)], [(0.5, 0.5), (0.82, 0.5)]])
            # two overlapping lames stepping down the upper arm
            for i, (dx, dz, w_, h_) in enumerate(((0.07, -0.075, 0.13, 0.075), (0.125, -0.12, 0.11, 0.065))):
                M2 = mir(s) @ basis(V(0.25 + dx, 0.0, SH + 0.04 + dz * 0.4), V(0.75, -0.25, 0.6), V(0.6, 0, -0.75))
                lout = [(0, -h_), (w_ * 0.6, -h_ * 0.85), (w_, -h_ * 0.2), (w_ * 0.8, h_ * 0.6), (0, h_), (-w_ * 0.8, h_ * 0.6),
                        (-w_, -h_ * 0.2), (-w_ * 0.6, -h_ * 0.85)]
                sp = plate(B, [(x * sc, y * sc) for x, y in lout], 30 + i, M2, AR, thick=0.022, bevel=0.008,
                           bend=(5.0 / sc, 2.0), keel=0.01, rings=(0.5,))
                self.add_spec(sp, style='pale', keel=True)
            if self.boss:
                base = V(s * 0.27, -0.02, SH + 0.14)
                horn(B, base, base + V(s * 0.05, 0.0, 0.1), base + V(s * 0.13, 0.03, 0.22), 0.045,
                     V(0, -1, 0), 'horn', wf, k=5, n=6)

    # ------------------------------------------------------------------ legs
    def legs(self):
        B, W, k = self.B, self.W, self.k
        for side, s in LR:
            b = lambda n: 'mixamorig' + side + n
            h0, kn = self.seg(side + 'UpLeg')
            _, hock = self.seg(side + 'Leg')
            _, ball = self.seg(side + 'Foot')
            d = (kn - h0).normalized()
            # thigh: quad mass in front, vastus lateralis sweep, teardrop above the knee, hamstrings behind
            path = [h0 - d * 0.08, h0 + (kn - h0) * 0.5, kn + d * 0.035]
            rad = lambda t: ((0.092 - 0.05 * t) * k, (0.09 - 0.048 * t) * k)
            bumps = [((0, -1, 0.2), 0.45, 0.24, 0.032 * k, 0.9), ((s, -0.3, 0), 0.5, 0.24, 0.024 * k, 0.7),
                     ((-s, -0.7, 0), 0.8, 0.1, 0.018 * k, 0.6), ((0, 1, 0), 0.38, 0.26, 0.026 * k, 1.0),
                     ((0, 1, 0.2), 0.05, 0.12, 0.02 * k, 1.0)]
            muscle_tube(B, path, rad, bumps, V(0, -1, 0), 'thigh',
                        W.chain(['mixamorigHips', b('UpLeg'), b('Leg')], 0.03, bias={'mixamorigHips': 0.02}), n=12, rings=11)
            d2 = (hock - kn).normalized()
            # shin: lean muscular calf high on the posterior (up-back) side, tibialis ridge, long achilles taper
            back = V(0, 0.85, 0.52)
            path = [kn - d2 * 0.04, kn + (hock - kn) * 0.5, hock + d2 * 0.025]
            rad = lambda t: ((0.046 - 0.02 * t) * k, (0.044 - 0.018 * t) * k)
            bumps = [(back, 0.22, 0.15, 0.052 * k, 0.9), (back + V(s * 0.9, 0, 0), 0.2, 0.14, 0.03 * k, 0.6),
                     (back + V(-s * 0.9, 0, 0), 0.26, 0.14, 0.024 * k, 0.6), (-back, 0.3, 0.3, 0.01 * k, 0.5),
                     (V(s, 0, 0), 0.16, 0.16, 0.014 * k, 1.0), (V(-s, 0, 0), 0.2, 0.16, 0.01 * k, 1.0)]
            muscle_tube(B, path, rad, bumps, V(0, -1, 0), 'shin', W.chain([b('UpLeg'), b('Leg'), b('Foot')], 0.025),
                        n=12, rings=10)
            d3 = (ball - hock).normalized()
            path = [hock - d3 * 0.03, hock + (ball - hock) * 0.5, ball + d3 * 0.01]
            rad = lambda t: (0.033 * k - 0.006 * math.sin(math.pi * t), 0.034 * k - 0.007 * math.sin(math.pi * t))
            bumps = [(V(0, -1, 0.3), 0.5, 0.35, 0.005, 0.5), (V(0, 1, 0), 0.05, 0.15, 0.012, 0.9)]
            muscle_tube(B, path, rad, bumps, V(0, -1, 0), 'meta', W.chain([b('Leg'), b('Foot'), b('ToeBase')], 0.02), n=8, rings=6)
            fk = 1.12 if self.boss else 1.0
            for ang in (-28, 0, 28):
                a = math.radians(ang) * s
                dirv = V(math.sin(a), -math.cos(a), 0)
                base = ball + V(0, 0, -0.005) + dirv * 0.01
                mid = base + dirv * 0.05 * fk + V(0, 0, 0.004)
                tip = base + dirv * 0.09 * fk + V(0, 0, -0.012)
                tube(B, [base, mid, tip], [(0.021 * fk,) * 4, (0.018 * fk,) * 4, (0.013 * fk,) * 4], V(0, 0, 1), 'toe',
                     W.chain([b('Foot'), b('ToeBase')], 0.015), n=6)
                horn(B, tip - dirv * 0.008, tip + dirv * 0.04 * fk, tip + dirv * 0.058 * fk + V(0, 0, -0.03),
                     0.013 * fk, V(0, 0, 1), 'claw', W.rigid(b('ToeBase')), k=4, n=5)
            horn(B, ball + V(0, 0.02, 0.01), ball + V(0, 0.07, 0.01), ball + V(0, 0.095, -0.03), 0.013, V(0, 0, 1),
                 'claw', W.rigid(b('Foot')), k=3, n=5)
            # layered knee: thick cap + a smaller lame above it on the thigh, and the forward knee spike
            kfront = kn + V(0, -0.058 * k, 0.012)
            M = mir(s) @ basis(V(abs(kfront.x), kfront.y, kfront.z), V(0, -1, 0.2), V(0, 0.15, 1))
            out = star_outline([(90, 0.12), (20, 0.07), (-35, 0.08), (-90, 0.1), (-145, 0.08), (160, 0.07)], inner=0.78)
            out = [(x * k, y * k) for x, y in out]
            sp = plate(B, out, 2, M, W.rigid(b('Leg')), thick=0.026, bevel=0.009, bend=(8.0 / k, 2.0), keel=0.016)
            self.add_spec(sp, style='pale', keel=True, holes=[(0.5, 0.42, 0.045, 0.024, 1.57)])
            top = kn + (h0 - kn) * 0.16 + V(0, -0.072 * k, 0)
            M = mir(s) @ basis(V(abs(top.x), top.y, top.z), V(0, -1, -0.15), -d)
            lout = [(0, -0.06), (0.06, -0.04), (0.07, 0.03), (0.035, 0.06), (0, 0.065), (-0.035, 0.06), (-0.07, 0.03), (-0.06, -0.04)]
            sp = plate(B, [(x * k, y) for x, y in lout], 32, M, W.chain([b('UpLeg'), b('Leg')], 0.03), thick=0.02,
                       bevel=0.007, bend=(9.0 / k, 1.0), keel=0.01, rings=(0.5,))
            self.add_spec(sp, style='pale', keel=True)
            blade(B, kfront + V(0, 0.0, 0.03), kfront + V(0, -0.07, 0.085), kfront + V(0, -0.11, 0.18),
                  0.036, 0.013, V(1, 0, 0), 'steel', W.rigid(b('Leg')), k=3)
            # hock guard + one spur
            hb = hock + V(0, 0.038 * k, 0.01)
            M = mir(s) @ basis(V(abs(hb.x), hb.y, hb.z), V(0.3, 1, 0.35), V(0, -0.3, 1))
            out = star_outline([(90, 0.1), (0, 0.06), (-90, 0.095), (180, 0.06)], inner=0.8)
            sp = plate(B, [(x * k, y * k) for x, y in out], 3, M, W.rigid(b('Foot')), thick=0.02, bevel=0.007,
                       bend=(9.0 / k, 1.0), keel=0.012)
            self.add_spec(sp, style='pale', keel=True, holes=[(0.5, 0.5, 0.035, 0.022, 1.57)])
            blade(B, hock + V(0, 0.03, 0.0), hock + V(0, 0.1, 0.0), hock + V(0, 0.17, 0.04), 0.032, 0.012,
                  V(1, 0, 0), 'steel', W.rigid(b('Foot')), k=3)
            # dark shin plate
            mid = kn + (hock - kn) * 0.5
            nrm = V(0, -1, 0) - d2 * V(0, -1, 0).dot(d2)
            c = mid + nrm.normalized() * 0.042 * k
            M = mir(s) @ basis(V(abs(c.x), c.y, c.z), nrm, -d2)
            out = [(0, 0.1), (0.032, 0.07), (0.036, -0.05), (0.018, -0.12), (0, -0.14), (-0.018, -0.12), (-0.036, -0.05), (-0.032, 0.07)]
            sp = plate(B, [(x * k, y) for x, y in out], self.cell(4), M, W.rigid(b('Leg')), thick=0.014, bevel=0.005,
                       bend=(12.0 / k, 0.0), keel=0.008, edge='edge_dark')
            self.add_spec(sp, style='dark', glow=[[(0.5, 0.58), (0.52, 0.76)]], grooves=[[(0.5, 0.2), (0.5, 0.52)]])
            # steel instep plate
            mid = hock + (ball - hock) * 0.62
            nrm = V(0, -1, 0.2) - d3 * V(0, -1, 0.2).dot(d3)
            c = mid + nrm.normalized() * 0.032 * k
            M = mir(s) @ basis(V(abs(c.x), c.y, c.z), nrm, -d3)
            out = star_outline([(90, 0.08), (0, 0.035), (-90, 0.07), (180, 0.035)], inner=0.8)
            sp = plate(B, out, 5, M, W.rigid(b('Foot')), thick=0.014, bevel=0.005, bend=(13.0, 0.0), keel=0.008)
            self.add_spec(sp, style='pale', keel=True)

    # ------------------------------------------------------------------ waist
    def waist(self):
        B, W = self.B, self.W
        kw = self.kw
        H = W.rigid('mixamorigHips')
        both = lambda p: {'mixamorigLeftUpLeg': 0.5, 'mixamorigRightUpLeg': 0.5}
        M = basis(V(0, -0.085 * (kw * 0.5 + 0.5) - 0.01, 1.17), V(0, -1, 0.08), V(0, 0, 1))
        out = [(0, -0.11), (0.035, -0.055), (0.08, 0.0), (0.12, 0.035), (0.07, 0.045), (0.0, 0.035), (-0.07, 0.045),
               (-0.12, 0.035), (-0.08, 0.0), (-0.035, -0.055)]
        sp = plate(B, [(x * kw, y) for x, y in out], self.cell(7), M, H, thick=0.022, bevel=0.008, bend=(5.0 / kw, 0.0),
                   keel=0.016, center=(0, -0.01))
        self.add_spec(sp, style='pale', keel=True, holes=[(0.5, 0.55, 0.05, 0.022, 0.0)], glow=[[(0.5, 0.33), (0.5, 0.2)]])
        for side, s in LR:
            wf = W.blend(H, W.rigid(f'mixamorig{side}UpLeg'), lambda p: (1.14 - p.z) / 0.25)
            M = mir(s) @ basis(V(0.158 * kw, -0.005, 1.11), V(1, -0.15, 0.15), V(0, 0, 1))
            out = star_outline([(90, 0.07), (0, 0.08), (-70, 0.1), (180, 0.06)], inner=0.8)
            sp = plate(B, out, 8, M, wf, thick=0.018, bevel=0.007, bend=(6.0, 3.0), keel=0.012)
            self.add_spec(sp, style='pale', keel=True, holes=[(0.5, 0.5, 0.03, 0.02, 0.7)])
        L = 1.3 if self.boss else 1.0
        fz = 1.15
        tfront = W.blend(H, both, lambda p: (fz - p.z) / 0.4)
        M = basis(V(0, -0.118, 0.98), V(0, -0.94, 0.32), V(0, 0, 1))
        out = [(0, -0.25 * L), (0.035, -0.16 * L), (0.07, -0.02), (0.09, 0.15), (0.0, 0.17), (-0.09, 0.15), (-0.07, -0.02), (-0.035, -0.16 * L)]
        sp = plate(B, [(x * kw, y) for x, y in out], self.cell(9), M, tfront, thick=0.014, bevel=0.005, bend=(4.0, 0.0), keel=0.01,
                   edge='edge_dark', rings=(0.5,))
        self.add_spec(sp, style='dark', glow=[[(0.5, 0.78), (0.52, 0.55), (0.5, 0.3)]], grooves=[[(0.3, 0.82), (0.5, 0.6), (0.7, 0.82)]])
        for side, s in LR:
            wf = W.blend(H, W.rigid(f'mixamorig{side}UpLeg'), lambda p: (fz - p.z) / 0.3)
            for (cx, cy, cz, nx, ny, cell, sc2) in ((0.16, -0.06, 0.98, 1, -0.7, 10, 1.0), (0.17, 0.05, 0.98, 1, 0.4, 15, 0.85)):
                M = mir(s) @ basis(V(cx * kw, cy, cz), V(nx, ny, 0.22), V(0.12, 0, 1))
                out = [(0, -0.22 * L), (0.045, -0.13 * L), (0.07, 0.03), (0.065, 0.14), (-0.02, 0.16), (-0.075, 0.1), (-0.06, -0.02), (-0.03, -0.12 * L)]
                sp = plate(B, [(x * sc2, y * sc2) for x, y in out], self.cell(cell), M, wf, thick=0.013, bevel=0.005, bend=(4.0, 0.0),
                           keel=0.009, edge='edge_dark')
                self.add_spec(sp, style='dark', grooves=[[(0.5, 0.2), (0.5, 0.8)]], glow=[[(0.46, 0.62), (0.5, 0.74)]])
        tback = W.blend(H, both, lambda p: (fz - p.z) / 0.4)
        M = basis(V(0, 0.13 * (kw * 0.5 + 0.5), 0.99), V(0, 1, 0.3), V(0, 0, 1))
        out = [(0, -0.24 * L), (0.04, -0.15 * L), (0.08, 0.0), (0.095, 0.14), (0, 0.16), (-0.095, 0.14), (-0.08, 0.0), (-0.04, -0.15 * L)]
        sp = plate(B, [(x * kw, y) for x, y in out], self.cell(11), M, tback, thick=0.014, bevel=0.005, bend=(4.0, 0.0), keel=0.01,
                   edge='edge_dark')
        self.add_spec(sp, style='dark', glow=[[(0.5, 0.8), (0.5, 0.35)]])

    # ------------------------------------------------------------------ boss extras
    def boss_extras(self):
        B, W = self.B, self.W
        S2 = W.chain(['mixamorigSpine2', 'mixamorigSpine1'], 0.03)
        M = basis(V(0, -0.188, 1.53), V(0, -1, 0.2), V(0, 0, 1))
        out = [(0, -0.17), (0.07, -0.11), (0.13, -0.03), (0.21, 0.06), (0.22, 0.11), (0.13, 0.1), (0.05, 0.13),
               (0, 0.09), (-0.05, 0.13), (-0.13, 0.1), (-0.22, 0.11), (-0.21, 0.06), (-0.13, -0.03), (-0.07, -0.11)]
        sp = plate(B, out, self.cell(12), M, S2, thick=0.03, bevel=0.011, bend=(3.0, 1.2), keel=0.026, rings=(0.35, 0.7))
        self.add_spec(sp, style='pale', keel=True,
                      holes=[(0.3, 0.62, 0.05, 0.025, 0.4), (0.7, 0.62, 0.05, 0.025, -0.4)],
                      glow=[[(0.5, 0.45), (0.5, 0.2)], [(0.38, 0.5), (0.5, 0.42), (0.62, 0.5)]])
        # lower breastplate lame (layered)
        M3 = basis(V(0, -0.16, 1.40), V(0, -1, 0.05), V(0, 0, 1))
        lout = [(0, -0.06), (0.08, -0.04), (0.13, 0.02), (0.1, 0.05), (0, 0.04), (-0.1, 0.05), (-0.13, 0.02), (-0.08, -0.04)]
        sp = plate(B, lout, 33, M3, W.chain(['mixamorigSpine1', 'mixamorigSpine'], 0.03), thick=0.022, bevel=0.008,
                   bend=(5.0, 0.0), keel=0.012, rings=(0.5,))
        self.add_spec(sp, style='pale', keel=True)
        M2 = M @ Matrix.Translation((0, -0.03, 0.045))
        gem = star_outline([(90, 0.05), (0, 0.03), (-90, 0.06), (180, 0.03)], inner=0.7)
        plate(B, gem, 'glow', M2, S2, thick=0.018, bevel=0.006, rings=(), edge='glow', keel=0.016)
        H = W.rigid('mixamorigHead')
        for a in (-30, 30):   # two extra crown horns
            r = math.radians(a)
            base = V(math.sin(r) * 0.07, -0.03, 1.845)
            horn(B, base, base + V(math.sin(r) * 0.04, 0.03, 0.12), base + V(math.sin(r) * 0.09, 0.09, 0.2),
                 0.03, V(0, -1, 0), 'horn', H, k=5, n=6)
        tb = W.blend(W.rigid('mixamorigSpine1'), W.rigid('mixamorigHips'), lambda p: (1.4 - p.z) / 0.4)
        for s in (1, -1):
            M = basis(V(s * 0.08, 0.15, 1.1), V(s * 0.3, 1, 0.1), V(0, 0, 1))
            out = [(0, -0.4), (0.035, -0.33), (0.055, -0.2), (0.06, 0.22), (0.0, 0.24), (-0.06, 0.22), (-0.055, -0.22), (-0.03, -0.31)]
            sp = plate(B, out, self.cell(19), M, tb, thick=0.01, bevel=0.004, bend=(3.0, 0.0), keel=0.004, edge='edge_dark')
            self.add_spec(sp, style='dark', grooves=[[(0.5, 0.9), (0.5, 0.15)]], glow=[[(0.42, 0.14), (0.5, 0.06), (0.58, 0.14)]])

    def build(self):
        for name in ('torso', 'head', 'arms', 'pauldrons', 'legs', 'waist') + (('boss_extras',) if self.boss else ()):
            t0 = self.B.tri_count()
            getattr(self, name)()
            self.budget[name] = self.B.tri_count() - t0
        print('BUDGET', 'boss' if self.boss else 'grunt', self.budget)
        return self


# ---------------------------------------------------------------------- material
def make_material(base_img, emit_img):
    m = bpy.data.materials.new('OniAtlas')
    m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links
    p = N.get('Principled BSDF')
    t1 = N.new('ShaderNodeTexImage'); t1.image = base_img; t1.name = 'BaseTex'
    t2 = N.new('ShaderNodeTexImage'); t2.image = emit_img; t2.name = 'EmitTex'
    L.new(t1.outputs['Color'], p.inputs['Base Color'])
    L.new(t2.outputs['Color'], p.inputs['Emission Color'])
    p.inputs['Emission Strength'].default_value = 1.6
    p.inputs['Roughness'].default_value = 0.72
    p.inputs['Metallic'].default_value = 0.0
    return m


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig, S = onilib.build_armature('OniRig')
    grunt = Oni(S).build()
    boss = Oni(S, boss=True).build()
    specs = {}
    for sp in grunt.specs + boss.specs:
        specs.setdefault(sp['cell'], sp)
    A = atlas.build_atlas(list(specs.values()))
    base = atlas.to_image(bpy, A.col, 'oni_atlas', TEX_BASE)
    emit = atlas.to_image(bpy, A.em, 'oni_emissive', TEX_EMIT)
    base.pack(); emit.pack()
    mat = make_material(base, emit)
    for o, name in ((grunt, 'oni_grunt'), (boss, 'oni_boss')):
        ob = o.B.to_object(name, rig)
        ob.data.materials.append(mat)
        # smooth shading with sharp edges only where faces break > 38 deg: plates/blades stay crisp,
        # but flat faces no longer split every vertex on export (smaller GLB, fewer GPU verts)
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38), keep_sharp_edges=False)
        print(f'{name}: {len(ob.data.vertices)} verts, {sum(len(p.vertices) - 2 for p in ob.data.polygons)} tris')
    # test clips retargeted from the heroine's Mixamo rig (no downloads)
    if '--no-anim' not in sys.argv:
        import retarget_oni
        importlib.reload(retarget_oni)
        retarget_oni.retarget_fbx(rig)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print('saved', OUT_BLEND)


if __name__ == '__main__':
    main()
