#!/usr/bin/env python3
"""Bake the high-resolution "tour scenery patches" (data/lszh/tours/<tour>/ + data/lszh/tours.json).

Each tour has a tour-mid imagery patch (SWISSIMAGE), a tour-detail imagery patch (SWISSIMAGE) and a DEM patch
(swissALTI3D), all in the same EPSG:3857 conventions as scenery.json (minX/maxX/minY/maxY in Web Mercator metres,
groundHalfM = half edge in ground metres). Re-uses the tile download / mosaic / LUT / DEM-encoding helpers of
bake_lszh.py (which is not modified).

usage:
  python3 dev/bake_tours.py imagery [--tour alps|city] [--only mid|detail]
  python3 dev/bake_tours.py dem     [--tour alps|city]
  python3 dev/bake_tours.py all
options:
  --cache DIR   raw tile cache (default: $LSZH_CACHE or ~/.cache/skybound-lszh). Never commit it.
  --out DIR     output directory (default: games/flight/data/lszh next to this script)
Network only on a cold cache, <=10 parallel requests.

Sources and terms: SWISSIMAGE and swissALTI3D (c) swisstopo (OGD, credit required). The tour-mid imagery is
colour-matched (per-channel histogram LUT, plus a separate water LUT) toward the Sentinel-2 cloudless 2016 layers
(EOX, CC BY 4.0) that surround the patch (far_2048 for the Alps, wide_2048 for the city), so the patch edge blends in.
tour-detail gets the same LUT as the tour-mid of its tour.
"""
import argparse, concurrent.futures as cf, json, math, os, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from PIL import Image
from scipy import ndimage
import bake_lszh as B

WEBP_Q = 80
# tour: centre (lat, lon), imagery layers (half size in ground m, source zoom, px list), DEM (half, cell in ground m)
TOURS = {
    'alps': {
        'mid': dict(center=(47.080, 9.130), half=15000, z=15, px=[3072, 4096]),
        'detail': dict(center=(47.140, 9.220), half=6000, z=16, px=[3072, 4096]),
        'dem': dict(center=(47.080, 9.130), half=15000, cell=40, meshCellM=60),
        'ref': 'far_2048.webp', 'refHalf': 80000, 'refCenter': (47.4720, 8.5496),
    },
    'city': {
        'mid': dict(center=(47.345, 8.545), half=8000, z=15, px=[3072, 4096]),
        'detail': dict(center=(47.3695, 8.5440), half=2200, z=17, px=[3072, 4096]),
        'dem': dict(center=(47.345, 8.545), half=8000, cell=30, meshCellM=40),
        'ref': 'wide_2048.webp', 'refHalf': 22000, 'refCenter': (47.4720, 8.5496),
    },
}
MATCH_STRENGTH = {'alps': 0.8, 'city': 0.65}  # how far tour-mid is pulled toward the surrounding EOX layer


def setc(lat, lon):
    B.CENTER = (lat, lon)
    B.GS = math.cos(math.radians(lat))
    B.cx = B.R * math.radians(lon)
    B.cy = B.R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def merc(lat, lon):
    return B.R * math.radians(lon), B.R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


# ---------------------------------------------------------------------------------------------- colour matching
def water_mask(a):
    """Soft water mask: lakes are blue-dominant. a: uint8 HxWx3."""
    f = a.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    m = ((b - np.maximum(r, g * 0.85) > 12) & (b > 40)).astype(np.float32)
    m = ndimage.binary_opening(m > 0.5, iterations=2).astype(np.float32)
    return ndimage.gaussian_filter(m, 2.0)


def hist_lut(src, ref, strength, wsrc=None, wref=None):
    lut = np.zeros((3, 256), np.float32)
    for c in range(3):
        s = np.bincount(src[..., c].ravel(), weights=None if wsrc is None else wsrc.ravel(), minlength=256).astype(np.float64)
        r = np.bincount(ref[..., c].ravel(), weights=None if wref is None else wref.ravel(), minlength=256).astype(np.float64)
        sc, rc = np.cumsum(s) / s.sum(), np.cumsum(r) / r.sum()
        lut[c] = np.arange(256) * (1 - strength) + np.interp(sc, rc, np.arange(256)) * strength
    return np.clip(np.round(lut), 0, 255).astype(np.uint8)


class Match:
    """Global LUT + water LUT, blended per pixel with a soft water mask computed on the source image."""
    def __init__(self, src_rgb, ref_rgb, strength):
        ws, wr = water_mask(src_rgb), water_mask(ref_rgb)
        self.water_px = float(ws.mean())
        self.glut = hist_lut(src_rgb, ref_rgb, strength, 1 - ws, 1 - wr)
        self.wlut = hist_lut(src_rgb, ref_rgb, 0.95, ws + 1e-6, wr + 1e-6) if min(ws.mean(), wr.mean()) > 5e-4 else self.glut
        self.ref_water = float(wr.mean())

    def apply(self, img):
        a = np.asarray(img)
        # mask computed at reduced size (cheap) and resampled up
        small = np.asarray(img.resize((1024, 1024), Image.BILINEAR))
        m = Image.fromarray((water_mask(small) * 255).astype(np.uint8)).resize(img.size, Image.BILINEAR)
        m = np.asarray(m, np.float32)[..., None] / 255
        g = np.stack([self.glut[c][a[..., c]] for c in range(3)], -1).astype(np.float32)
        w = np.stack([self.wlut[c][a[..., c]] for c in range(3)], -1).astype(np.float32)
        return Image.fromarray(np.clip(np.round(g * (1 - m) + w * m), 0, 255).astype(np.uint8))


def reference_crop(spec, tour):
    """The baked EOX layer (as displayed) resampled over the tour-mid box."""
    t = TOURS[tour]
    ref = Image.open(f'{B.OUT}/{t["ref"]}').convert('RGB')
    rx, ry = merc(*t['refCenter'])
    gs_r = math.cos(math.radians(t['refCenter'][0]))
    hm_r = t['refHalf'] / gs_r
    setc(*spec['center'])
    hm = spec['half'] / B.GS
    n = ref.size[0]
    sx = n / (2 * hm_r)
    box = ((B.cx - hm - (rx - hm_r)) * sx, ((ry + hm_r) - (B.cy + hm)) * sx, (B.cx + hm - (rx - hm_r)) * sx, ((ry + hm_r) - (B.cy - hm)) * sx)
    return np.asarray(ref.crop(tuple(int(round(v)) for v in box)).resize((512, 512), Image.BILINEAR))


# ---------------------------------------------------------------------------------------------------- imagery
def mosaic_img(spec):
    setc(*spec['center'])
    hm = spec['half'] / B.GS
    x0, x1, y0, y1 = B.cx - hm, B.cx + hm, B.cy - hm, B.cy + hm
    mos, mx0, my1, pxm = B.mosaic(x0, x1, y0, y1, spec['z'], 'swiss', '')
    box = ((x0 - mx0) / pxm, (my1 - y1) / pxm, (x1 - mx0) / pxm, (my1 - y0) / pxm)
    meta = {'minX': x0, 'maxX': x1, 'minY': y0, 'maxY': y1, 'groundHalfM': spec['half'], 'srcZoom': spec['z'], 'source': 'swiss', 'files': {}}
    return mos, box, meta


def imagery(tour, only=None):
    t = TOURS[tour]
    out = {}
    os.makedirs(f'{B.OUT}/tours/{tour}', exist_ok=True)
    match = None
    for name in ('mid', 'detail'):
        if only and name != only:
            continue
        spec = t[name]
        print(f'tour {tour} {name}')
        mos, box, meta = mosaic_img(spec)
        if name == 'mid':
            probe = np.asarray(mos.resize((1024, 1024), Image.LANCZOS, box=box))
            match = Match(probe, reference_crop(spec, tour), MATCH_STRENGTH[tour])
            meta['colorMatch'] = {'reference': t['ref'], 'strength': MATCH_STRENGTH[tour], 'waterLut': True,
                                  'sourceWaterFraction': round(match.water_px, 4), 'referenceWaterFraction': round(match.ref_water, 4)}
        else:
            if match is None:  # detail alone: recompute the mid LUT (cheap relative to the download)
                ms, mb, _ = mosaic_img(t['mid'])
                match = Match(np.asarray(ms.resize((1024, 1024), Image.LANCZOS, box=mb)), reference_crop(t['mid'], tour), MATCH_STRENGTH[tour])
            meta['colorMatch'] = {'sameAs': 'mid'}
        for px in spec['px']:
            img = mos.resize((px, px), Image.LANCZOS, box=box)
            img = match.apply(img)
            fn = f'{name}_{px}.webp'
            img.save(f'{B.OUT}/tours/{tour}/{fn}', 'WEBP', quality=WEBP_Q, method=6)
            meta['files'][str(px)] = f'tours/{tour}/{fn}'
            print(f'  {fn}: {os.path.getsize(f"{B.OUT}/tours/{tour}/{fn}") / 1e6:.2f} MB, {2 * spec["half"] / px:.2f} m/px')
        out[name] = meta
    return out


# ------------------------------------------------------------------------------------------------------- DEM
def swiss_tile_10m(t):
    """Like bake_lszh.swiss_tile but caches the 1 km tile at 10 m cells (100x100), so any multiple of 10 m can be built."""
    e, nn = t
    cache = f'{B.CACHE}/alti10_{e}_{nn}.npy'
    if os.path.exists(cache):
        return t, np.load(cache)
    E = (e * 1000 + 500 - 2600000) / 1e6
    N = (nn * 1000 + 500 - 1200000) / 1e6
    lon = (2.6779094 + 4.728982 * E + 0.791484 * E * N + 0.1306 * E * N * N - 0.0436 * E ** 3) * 100 / 36
    lat = (16.9023892 + 3.238272 * N - 0.270978 * E * E - 0.002528 * N * N - 0.0447 * E * E * N - 0.0140 * N ** 3) * 100 / 36
    bbox = f'{lon - .0005},{lat - .0005},{lon + .0005},{lat + .0005}'
    q = None
    for _ in range(3):
        try:
            q = json.load(B.urllib.request.urlopen(f'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d/items?limit=20&bbox={bbox}', timeout=40))
            break
        except Exception:  # noqa
            q = None
    if not q:
        return t, None
    ids = sorted(f['id'] for f in q['features'] if f['id'].endswith(f'_{e}-{nn}'))
    if not ids:
        return t, None
    it = [f for f in q['features'] if f['id'] == ids[-1]][0]
    href = [a['href'] for k, a in it['assets'].items() if '_2_2056_' in k and k.endswith('.tif')][0]
    p = B.get(href, f'{B.CACHE}/alti10_{e}_{nn}.tif')
    arr = np.asarray(Image.open(p), np.float32)
    if arr.shape == (500, 500):
        arr = arr.reshape(100, 5, 100, 5).mean(axis=(1, 3))  # 2 m -> 10 m
    np.save(cache, arr)
    os.remove(p)
    return t, arr


def swiss_height_cell(half, n, cell):
    """swissALTI3D on the n x n Mercator grid with `cell`-metre averaging. 40 m reuses bake_lszh's tile cache."""
    hm, xs, ys = B.grid_coords(half, n)
    XX, YY = np.meshgrid(xs, ys)
    lon = np.degrees(XX / B.R)
    lat = np.degrees(2 * np.arctan(np.exp(YY / B.R)) - math.pi / 2)
    E, N = B.wgs_to_lv95(lat, lon)
    tiles = sorted({(int(e // 1000), int(nn // 1000)) for e, nn in zip(E.ravel(), N.ravel())})
    print(f'  swissALTI3D km tiles needed: {len(tiles)} (cell {cell} m)')
    fn = B.swiss_tile if cell == 40 else swiss_tile_10m
    per = 25 if cell == 40 else 100      # samples per km tile
    mp = 1000 / per                        # metres per mosaic sample
    got = {}
    with cf.ThreadPoolExecutor(10) as ex:
        for t, a in ex.map(fn, tiles):
            got[t] = a
    miss = sum(a is None for a in got.values())
    print('  tiles missing:', miss)
    e0 = min(t[0] for t in tiles); e1 = max(t[0] for t in tiles); n0 = min(t[1] for t in tiles); n1 = max(t[1] for t in tiles)
    mos = np.full(((n1 - n0 + 1) * per, (e1 - e0 + 1) * per), np.nan, np.float32)
    for (e, nn), a in got.items():
        if a is not None:
            mos[(n1 - nn) * per:(n1 - nn) * per + per, (e - e0) * per:(e - e0) * per + per] = a
    valid = ~np.isnan(mos)
    filled = np.where(valid, mos, 0).astype(np.float32)
    if cell not in (40,):
        k = int(round(cell / mp))  # box-average over the cell footprint
        filled = ndimage.uniform_filter(filled, size=k, mode='nearest')
    cols = (E - e0 * 1000) / mp - 0.5
    rows = ((n1 + 1) * 1000 - N) / mp - 0.5
    h = ndimage.map_coordinates(filled, [rows, cols], order=1, mode='nearest')
    ok = ndimage.map_coordinates(valid.astype(np.float32), [rows, cols], order=1, mode='nearest') > 0.999
    return np.where(ok, h, np.nan).astype(np.float32)


def dem(tour):
    s = TOURS[tour]['dem']
    setc(*s['center'])
    n = int(round(2 * s['half'] / s['cell']))
    print(f'tour {tour} dem n={n}')
    h = swiss_height_cell(s['half'], n, s['cell'])
    nan = float(np.isnan(h).mean())
    print('  nan fraction', nan)
    if nan:
        tr = B.terrarium_height(s['half'], n, 12)
        h = np.where(np.isnan(h), tr, h)
    os.makedirs(f'{B.OUT}/tours/{tour}', exist_ok=True)
    meta = B.save_dem(f'tours/{tour}/dem', h, s['half'], n, 2 * s['half'] / n)
    meta['file'] = f'tours/{tour}/dem.png'
    meta.update({'groundHalfM': s['half'], 'meshCellM': s['meshCellM'], 'source': 'swissALTI3D' + (' + Terrarium z12 fill' if nan else ''), 'fallbackFraction': nan})
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['imagery', 'dem', 'all'])
    ap.add_argument('--tour', choices=list(TOURS))
    ap.add_argument('--only', choices=['mid', 'detail'])
    ap.add_argument('--cache', default=os.environ.get('LSZH_CACHE') or os.path.expanduser('~/.cache/skybound-lszh'))
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'data', 'lszh'))
    a = ap.parse_args()
    B.OUT, B.CACHE = os.path.abspath(a.out), os.path.abspath(a.cache)
    os.makedirs(B.CACHE, exist_ok=True)
    path = f'{B.OUT}/tours.json'
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    manifest.update({'webpQuality': WEBP_Q, 'generator': 'dev/bake_tours.py', 'tours': manifest.get('tours', {})})
    for tour in ([a.tour] if a.tour else list(TOURS)):
        entry = manifest['tours'].setdefault(tour, {})
        if a.cmd in ('imagery', 'all'):
            entry.setdefault('layers', {}).update(imagery(tour, a.only))
        if a.cmd in ('dem', 'all'):
            entry['dem'] = dem(tour)
        json.dump(manifest, open(path, 'w'), indent=1)  # after every tour: a crash loses at most one


if __name__ == '__main__':
    main()
