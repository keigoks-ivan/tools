#!/usr/bin/env python3
"""Terrain-clearance check for the sightseeing tours (tour.mjs).

Reads the ring lists from tour.mjs (through node), decodes the baked DEMs exactly the way geoscenery.js does
(8-bit RGB PNG, height = (R*256+G)*stepM+offsetM, bilinear, near grid eased into the far grid at its edge) and
samples the terrain under every leg every 200 m. If data/lszh/tours.json and its tour DEMs exist they are used
in place of the base DEM inside their own box (they are the sharper data, so a miss there is a real miss).

Writes dev/tour_clearance.json. tour.test.mjs refuses to pass when that file does not match the current ring
list, so editing a ring without re-running this script fails the test suite.

Limits (the game's own rules, see tour.test.mjs): >= 1000 ft over the terrain at every ring, >= 800 ft along every leg.
A second figure, "wide", is the clearance against the highest terrain within 300 m either side of the path.

Usage: python3 games/flight/dev/check_tours.py            (exit 1 on a violation)
"""
import hashlib, json, math, os, subprocess, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, 'data', 'lszh')
FT = 3.28084
EARTH = 6378137.0
SAMPLE_M = 200
RING_MIN_FT, LEG_MIN_FT, WIDE_M = 1000, 800, 300

# ---- local frame <-> lat/lon (same maths as geoscenery.js) ------------------------------------------------------
LAT0, LON0, BEARING, FIELD_M = 47.4722, 8.5496, 137.3, 427.0
_b = math.radians(BEARING)
_ox = EARTH * math.radians(LON0)
_oy = EARTH * math.log(math.tan(math.pi / 4 + math.radians(LAT0) / 2))
_gs = math.cos(math.radians(LAT0))


def merc(lat, lon):
    return EARTH * math.radians(lon), EARTH * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def local_to_merc(x, z):
    return (_ox + (math.cos(_b) * x - math.sin(_b) * z) / _gs, _oy + (-math.sin(_b) * x - math.cos(_b) * z) / _gs)


def latlon_to_local(lat, lon):
    mx, my = merc(lat, lon)
    e, n = (mx - _ox) * _gs, (my - _oy) * _gs
    return math.cos(_b) * e - math.sin(_b) * n, -math.sin(_b) * e - math.cos(_b) * n


def local_to_latlon(x, z):
    mx, my = local_to_merc(x, z)
    return math.degrees(2 * math.atan(math.exp(my / EARTH)) - math.pi / 2), math.degrees(mx / EARTH)


# ---- DEM ---------------------------------------------------------------------------------------------------------
class Dem:
    def __init__(self, meta, base=DATA):
        img = np.asarray(Image.open(os.path.join(base, meta['file'])).convert('RGB')).astype(np.float64)
        self.h = (img[..., 0] * 256 + img[..., 1]) * meta['stepM'] + meta['offsetM']
        self.n = img.shape[0]
        self.minX, self.maxX, self.minY, self.maxY = meta['minX'], meta['maxX'], meta['minY'], meta['maxY']

    def sample(self, mx, my):
        n = self.n
        px = (mx - self.minX) / (self.maxX - self.minX) * n - 0.5
        py = (self.maxY - my) / (self.maxY - self.minY) * n - 0.5
        x, y = min(max(px, 0), n - 1.001), min(max(py, 0), n - 1.001)
        l, t = int(x), int(y)
        fx, fy = x - l, y - t
        h = self.h
        return (h[t, l] * (1 - fx) + h[t, l + 1] * fx) * (1 - fy) + (h[t + 1, l] * (1 - fx) + h[t + 1, l + 1] * fx) * fy

    def contains(self, mx, my, margin=0.0):
        return self.minX + margin <= mx <= self.maxX - margin and self.minY + margin <= my <= self.maxY - margin


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


class Terrain:
    """Metres above sea level at a local-frame point. Uses the tour DEMs where present, the base DEM elsewhere."""

    def __init__(self):
        manifest = json.load(open(os.path.join(DATA, 'scenery.json')))
        self.near, self.far = Dem(manifest['dem']['near']), Dem(manifest['dem']['far'])
        self.tour_dems, self.tour_note = [], 'base DEM only (data/lszh/tours.json not present)'
        path = os.path.join(DATA, 'tours.json')
        if os.path.exists(path):
            try:
                self.tour_dems = self._load_tours(json.load(open(path)))
                self.tour_note = f'tour DEMs used: {len(self.tour_dems)} ({", ".join(n for n, _ in self.tour_dems)})'
            except Exception as error:  # the manifest format is owned by another agent: never fail the base check over it
                self.tour_note = f'data/lszh/tours.json present but not readable ({error!r}); base DEM only'

    @staticmethod
    def _load_tours(manifest):
        found = []

        def walk(node, name):
            if isinstance(node, dict):
                dem = node.get('dem')
                if isinstance(dem, dict) and 'file' in dem and 'minX' in dem:
                    found.append((name, dem))
                for k, v in node.items():
                    walk(v, f'{name}.{k}' if name else k)
            elif isinstance(node, list):
                for i, v in enumerate(node):
                    walk(v, f'{name}[{i}]')
        walk(manifest, '')
        out = []
        for name, meta in found:
            meta = dict(meta)
            meta.setdefault('stepM', 0.25); meta.setdefault('offsetM', 0)
            out.append((name, Dem(meta)))
        return out

    def msl_merc(self, mx, my):
        for _, d in self.tour_dems:
            if d.contains(mx, my, 40):
                return d.sample(mx, my)
        f = self.far.sample(mx, my)
        d = self.near
        u = min(mx - d.minX, d.maxX - mx) / (d.maxX - d.minX)
        v = min(my - d.minY, d.maxY - my) / (d.maxY - d.minY)
        w = smooth(min(u, v) / 0.06)
        return f if w <= 0 else d.sample(mx, my) if w >= 1 else f + (d.sample(mx, my) - f) * w

    def msl(self, x, z):
        return self.msl_merc(*local_to_merc(x, z))

    def wide_max(self, x, z, r=WIDE_M):
        best = self.msl(x, z)
        for k in range(8):
            a = k * math.pi / 4
            best = max(best, self.msl(x + r * math.cos(a), z + r * math.sin(a)))
        return best


# ---- tours -------------------------------------------------------------------------------------------------------
def load_tours():
    js = "import {TOURS} from './tour.mjs'; process.stdout.write(JSON.stringify(TOURS))"
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def rings_hash(tours):
    flat = [[t['id'], [t['start']['x'], t['start']['z'], t['start']['altFt']]] + [[r['x'], r['z'], r['altFt']] for r in t['rings']] for t in tours]
    return hashlib.sha256(json.dumps(flat, separators=(',', ':')).encode()).hexdigest()[:16]


def check(tours, terrain):
    report = {'note': terrain.tour_note, 'ringsHash': rings_hash(tours), 'tours': {}}
    ok = True
    for t in tours:
        pts = [t['start']] + t['rings']
        legs, ring_clear = [], []
        for i, r in enumerate(t['rings']):
            ground = terrain.msl(r['x'], r['z'])
            ring_clear.append(round(r['altFt'] - ground * FT))
        for i in range(1, len(pts)):
            a, b = pts[i - 1], pts[i]
            length = math.hypot(b['x'] - a['x'], b['z'] - a['z'])
            steps = max(1, math.ceil(length / SAMPLE_M))
            best, bestw, at = 1e9, 1e9, 0
            for s in range(steps + 1):
                f = s / steps
                x, z = a['x'] + (b['x'] - a['x']) * f, a['z'] + (b['z'] - a['z']) * f
                alt = a['altFt'] + (b['altFt'] - a['altFt']) * f
                c = alt - terrain.msl(x, z) * FT
                w = alt - terrain.wide_max(x, z) * FT
                if c < best:
                    best, at = c, f
                bestw = min(bestw, w)
            legs.append({'to': i, 'lengthM': round(length), 'minClearFt': round(best), 'atFraction': round(at, 2), 'minWideClearFt': round(bestw)})
        tour_ok = all(c >= RING_MIN_FT for c in ring_clear) and all(l['minClearFt'] >= LEG_MIN_FT for l in legs)
        ok &= tour_ok
        report['tours'][t['id']] = {'ringClearFt': ring_clear, 'legs': legs, 'minRingFt': min(ring_clear), 'minLegFt': min(l['minClearFt'] for l in legs),
                                    'minWideLegFt': min(l['minWideClearFt'] for l in legs), 'ok': tour_ok}
    report['ok'] = ok
    return report


def main():
    tours = load_tours()
    terrain = Terrain()
    report = check(tours, terrain)
    print(report['note'])
    for tid, r in report['tours'].items():
        print(f'\n{tid}: ring clearance (ft) {r["ringClearFt"]}  min {r["minRingFt"]} (limit {RING_MIN_FT})')
        for l in r['legs']:
            print(f'  leg -> ring {l["to"]}: {l["lengthM"]:6d} m  min clearance {l["minClearFt"]:6d} ft at {l["atFraction"]:.2f}  (within {WIDE_M} m: {l["minWideClearFt"]} ft)')
        print(f'  {"PASS" if r["ok"] else "FAIL"}: worst leg {r["minLegFt"]} ft (limit {LEG_MIN_FT})')
    json.dump(report, open(os.path.join(HERE, 'tour_clearance.json'), 'w'), indent=1)
    print('\nwrote dev/tour_clearance.json')
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
