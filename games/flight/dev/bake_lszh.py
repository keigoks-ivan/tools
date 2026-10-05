#!/usr/bin/env python3
"""Bake the Zurich (LSZH) scenery used by Skybound into static files, so the game makes
no third-party imagery/elevation requests at runtime.

usage:
  python3 dev/bake_lszh.py imagery [--only far|wide|mid|detail]
  python3 dev/bake_lszh.py dem
  python3 dev/bake_lszh.py all
options:
  --cache DIR   raw tile cache (default: $LSZH_CACHE or ~/.cache/skybound-lszh). Never commit it.
  --out DIR     output directory (default: games/flight/data/lszh next to this script)
requires: python3, numpy, scipy, Pillow (with WebP). Network only on a cold cache, <=10 parallel requests.

Sources and terms
  detail / mid imagery  SWISSIMAGE (c) swisstopo, WMTS 3857 (OGD: use, process, redistribute, commercial OK, credit required)
  wide / far imagery    EOX Sentinel-2 cloudless 2016 (layer s2cloudless_3857), CC BY 4.0,
                        "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)"
  dem_near (inside CH)  swissALTI3D 2 m (c) swisstopo, averaged to a 40 m grid
  dem_near (outside CH) and dem_far: AWS Open Data "Terrain Tiles" (Mapzen/tilezen, Terrarium encoding);
                        in Europe derived from Copernicus EU-DEM, see https://github.com/tilezen/joerd/blob/master/docs/attribution.md

All layers share one Web Mercator (EPSG:3857) frame centred on CENTER; bounds are written to scenery.json.
DEM files are lossless 8-bit RGB PNG: height_m = (R*256 + G) * stepM + offsetM, B unused.
"""
import argparse, concurrent.futures as cf, io, json, math, os, sys, urllib.request
import numpy as np
from PIL import Image
from scipy import ndimage

R = 6378137.0
MS = 2 * math.pi * R
CENTER = (47.4720, 8.5496)  # (lat, lon) middle of the area; layers are square, axis-aligned in Web Mercator
GS = math.cos(math.radians(CENTER[0]))  # ground metres per Mercator metre
cx = R * math.radians(CENTER[1])
cy = R * math.log(math.tan(math.pi / 4 + math.radians(CENTER[0]) / 2))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = CACHE = None

# name: (half size in ground metres, source zoom, source, output px list)
LAYERS = {
    'far': (80000, 11, 'eox', [2048]),
    'wide': (22000, 13, 'eox', [2048]),
    'mid': (8000, 15, 'swiss', [3072, 4096]),
    'detail': (1800, 17, 'swiss', [3072, 4096]),
}
URL = {
    'swiss': 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
    'eox': 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
    'terrarium': 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
}
WEBP_Q = 80


def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    err = None
    for _ in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'skybound-bake/1.0 (offline bake; contact via repo)'})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            with open(path, 'wb') as f:
                f.write(data)
            return path
        except Exception as e:  # noqa
            err = e
    raise err


def tile_range(x0, x1, y0, y1, z):
    ts = MS / 2 ** z
    return ts, int((x0 + MS / 2) // ts), int((x1 + MS / 2) // ts), int((MS / 2 - y1) // ts), int((MS / 2 - y0) // ts)


def mosaic(x0, x1, y0, y1, z, src, prefix, mode='RGB'):
    """Download (cached) every tile touching the bounds and paste them into one image."""
    ts, tx0, tx1, ty0, ty1 = tile_range(x0, x1, y0, y1, z)
    n = (tx1 - tx0 + 1, ty1 - ty0 + 1)
    print(f'  {src} z{z}: {n[0]}x{n[1]} = {n[0] * n[1]} tiles')
    ext = 'png' if src == 'terrarium' else 'jpg'
    jobs = {}
    with cf.ThreadPoolExecutor(10) as ex:
        for tx in range(tx0, tx1 + 1):
            for ty in range(ty0, ty1 + 1):
                jobs[(tx, ty)] = ex.submit(get, URL[src].format(z=z, x=tx, y=ty), f'{CACHE}/{prefix}{z}_{tx}_{ty}.{ext}')
        mos = Image.new(mode, (n[0] * 256, n[1] * 256))
        for (tx, ty), f in jobs.items():
            mos.paste(Image.open(f.result()).convert(mode), ((tx - tx0) * 256, (ty - ty0) * 256))
    pxm = ts / 256
    mx0 = -MS / 2 + tx0 * ts
    my1 = MS / 2 - ty0 * ts
    return mos, mx0, my1, pxm


MATCH_STRENGTH = 0.75  # how far the Sentinel-2 layers are pulled toward the SWISSIMAGE colour balance
MATCH_HALF = 7000      # ground metres around the airport where both sources overlap and colours are compared


def central(img, half_src, half_dst, px=1024):
    n = img.size[0]
    a, b = (half_src - half_dst) / (2 * half_src) * n, (half_src + half_dst) / (2 * half_src) * n
    return np.asarray(img.crop((int(a), int(a), int(b), int(b))).resize((px, px), Image.LANCZOS))


def match_lut(src_rgb, ref_rgb, strength):
    """Per-channel histogram match of src to ref, blended with the identity by `strength`."""
    lut = np.zeros((3, 256), np.float32)
    for c in range(3):
        s_hist = np.bincount(src_rgb[..., c].ravel(), minlength=256).astype(np.float64)
        r_hist = np.bincount(ref_rgb[..., c].ravel(), minlength=256).astype(np.float64)
        s_cdf, r_cdf = np.cumsum(s_hist) / s_hist.sum(), np.cumsum(r_hist) / r_hist.sum()
        matched = np.interp(s_cdf, r_cdf, np.arange(256))
        lut[c] = np.arange(256) * (1 - strength) + matched * strength
    return np.clip(np.round(lut), 0, 255).astype(np.uint8)


def apply_lut(img, lut):
    a = np.asarray(img)
    return Image.fromarray(np.stack([lut[c][a[..., c]] for c in range(3)], -1))


def imagery(name):
    half, z, src, sizes = LAYERS[name]
    hm = half / GS
    x0, x1, y0, y1 = cx - hm, cx + hm, cy - hm, cy + hm
    mos, mx0, my1, pxm = mosaic(x0, x1, y0, y1, z, src, '' if src == 'swiss' else 'eox_')
    box = ((x0 - mx0) / pxm, (my1 - y1) / pxm, (x1 - mx0) / pxm, (my1 - y0) / pxm)
    meta = {'minX': x0, 'maxX': x1, 'minY': y0, 'maxY': y1, 'groundHalfM': half, 'srcZoom': z, 'source': src, 'files': {}}
    lut = None
    if src == 'eox':  # Sentinel-2 summer tones are much darker than the SWISSIMAGE spring flight; compare in the overlap and pull them closer
        ref = central(Image.open(f'{OUT}/mid_3072.webp').convert('RGB'), LAYERS['mid'][0], MATCH_HALF)
        probe = mos.resize((2048, 2048), Image.LANCZOS, box=box)
        lut = match_lut(central(probe, half, MATCH_HALF), ref, MATCH_STRENGTH)
        meta['colorMatch'] = {'strength': MATCH_STRENGTH, 'referenceHalfM': MATCH_HALF}
    for px in sizes:
        img = mos.resize((px, px), Image.LANCZOS, box=box)
        if lut is not None:
            img = apply_lut(img, lut)
        fn = f'{name}_{px}.webp'
        img.save(f'{OUT}/{fn}', 'WEBP', quality=WEBP_Q, method=6)
        meta['files'][str(px)] = fn
        print(f'  {fn}: {os.path.getsize(f"{OUT}/{fn}") / 1e6:.2f} MB')
    return meta


# --- swissALTI3D (LV95 <-> WGS84 approximate swisstopo formulas, ~1 m)
def wgs_to_lv95(lat, lon):
    p = (lat * 3600 - 169028.66) / 10000
    l = (lon * 3600 - 26782.5) / 10000
    E = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    N = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3
    return E, N


def swiss_tile(t):
    e, nn = t
    cache = f'{CACHE}/alti_{e}_{nn}.npy'
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
            q = json.load(urllib.request.urlopen(
                f'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d/items?limit=20&bbox={bbox}', timeout=40))
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
    p = get(href, f'{CACHE}/alti_{e}_{nn}.tif')
    arr = np.asarray(Image.open(p), np.float32)
    if arr.shape == (500, 500):
        arr = arr.reshape(25, 20, 25, 20).mean(axis=(1, 3))  # 2 m -> 40 m
    np.save(cache, arr)
    os.remove(p)
    return t, arr


def grid_coords(half, n):
    hm = half / GS
    xs = cx - hm + (np.arange(n) + .5) * (2 * hm / n)
    ys = cy + hm - (np.arange(n) + .5) * (2 * hm / n)
    return hm, xs, ys


def terrarium_height(half, n, z):
    """Resample Terrarium tiles onto the n x n Mercator grid (bilinear)."""
    hm, xs, ys = grid_coords(half, n)
    mos, mx0, my1, pxm = mosaic(cx - hm, cx + hm, cy - hm, cy + hm, z, 'terrarium', 'terr_', 'RGB')
    a = np.asarray(mos, np.float32)
    h = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    XX, YY = np.meshgrid(xs, ys)
    cols = (XX - mx0) / pxm - 0.5
    rows = (my1 - YY) / pxm - 0.5
    return ndimage.map_coordinates(h, [rows, cols], order=1, mode='nearest').astype(np.float32)


def swiss_height(half, n):
    """swissALTI3D (40 m) on the grid, plus metres to the nearest no-data cell."""
    hm, xs, ys = grid_coords(half, n)
    XX, YY = np.meshgrid(xs, ys)
    lon = np.degrees(XX / R)
    lat = np.degrees(2 * np.arctan(np.exp(YY / R)) - math.pi / 2)
    E, N = wgs_to_lv95(lat, lon)
    tiles = sorted({(int(e // 1000), int(nn // 1000)) for e, nn in zip(E.ravel(), N.ravel())})
    print(f'  swissALTI3D km tiles needed: {len(tiles)}')
    got = {}
    with cf.ThreadPoolExecutor(10) as ex:
        for t, a in ex.map(swiss_tile, tiles):
            got[t] = a
    print('  tiles outside Switzerland:', sum(a is None for a in got.values()))
    # LV95 mosaic, 40 m cells, north up
    e0 = min(t[0] for t in tiles); e1 = max(t[0] for t in tiles); n0 = min(t[1] for t in tiles); n1 = max(t[1] for t in tiles)
    mos = np.full(((n1 - n0 + 1) * 25, (e1 - e0 + 1) * 25), np.nan, np.float32)
    for (e, nn), a in got.items():
        if a is not None:
            r0 = (n1 - nn) * 25
            c0 = (e - e0) * 25
            mos[r0:r0 + 25, c0:c0 + 25] = a
    valid = ~np.isnan(mos)
    dist = ndimage.distance_transform_edt(valid) * 40.0  # metres inside the valid area
    filled = np.where(valid, mos, 0).astype(np.float32)
    cols = (E - e0 * 1000) / 40 - 0.5
    rows = ((n1 + 1) * 1000 - N) / 40 - 0.5
    h = ndimage.map_coordinates(filled, [rows, cols], order=1, mode='constant', cval=0)
    ok = ndimage.map_coordinates(valid.astype(np.float32), [rows, cols], order=1, mode='constant', cval=0) > 0.999
    d = ndimage.map_coordinates(dist, [rows, cols], order=1, mode='constant', cval=0)
    return np.where(ok, h, np.nan).astype(np.float32), np.where(ok, d, 0).astype(np.float32)


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def save_dem(name, h, half, n, cell):
    step = 0.25
    h = np.clip(h, 0, 16383)
    v = np.round(h / step).astype(np.uint32)
    rgb = np.zeros((n, n, 3), np.uint8)
    rgb[..., 0] = v >> 8
    rgb[..., 1] = v & 255
    Image.fromarray(rgb).save(f'{OUT}/{name}.png', optimize=True)
    hm = half / GS
    meta = {'file': f'{name}.png', 'minX': cx - hm, 'maxX': cx + hm, 'minY': cy - hm, 'maxY': cy + hm, 'n': n, 'cellGroundM': cell,
            'stepM': step, 'offsetM': 0, 'minM': float(h.min()), 'maxM': float(h.max())}
    print(f'  {name}.png {os.path.getsize(f"{OUT}/{name}.png") / 1e6:.2f} MB  range {h.min():.0f}..{h.max():.0f} m')
    return meta


def dem():
    out = {}
    # near: +-22 km at 40 m. swissALTI3D inside Switzerland, Terrarium z11 outside, blended over 1.5 km at the border.
    half, n = 22000, 1100
    print('dem_near')
    terr = terrarium_height(half, n, 11)
    swiss, dist = swiss_height(half, n)
    w = smoothstep(dist / 1500.0)
    blended = np.where(np.isnan(swiss), terr, w * np.nan_to_num(swiss) + (1 - w) * terr)
    out['near'] = save_dem('dem_near', blended, half, n, 40)
    out['near']['swissFraction'] = float((~np.isnan(swiss)).mean())
    # far: +-80 km at 160 m, Terrarium z10 only
    half, n = 80000, 1000
    print('dem_far')
    out['far'] = save_dem('dem_far', terrarium_height(half, n, 10), half, n, 160)
    return out


def main():
    global OUT, CACHE
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['imagery', 'dem', 'all'])
    ap.add_argument('--only', choices=list(LAYERS))
    ap.add_argument('--cache', default=os.environ.get('LSZH_CACHE') or os.path.expanduser('~/.cache/skybound-lszh'))
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'data', 'lszh'))
    a = ap.parse_args()
    OUT, CACHE = os.path.abspath(a.out), os.path.abspath(a.cache)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    manifest_path = f'{OUT}/scenery.json'
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    manifest.update({'center': {'lat': CENTER[0], 'lon': CENTER[1]}, 'webpQuality': WEBP_Q, 'generator': 'dev/bake_lszh.py'})
    if a.cmd in ('imagery', 'all'):
        manifest.setdefault('layers', {})
        for k in ([a.only] if a.only else LAYERS):
            print('layer', k)
            manifest['layers'][k] = imagery(k)
    if a.cmd in ('dem', 'all'):
        manifest['dem'] = dem()
    json.dump(manifest, open(manifest_path, 'w'), indent=1)


if __name__ == '__main__':
    main()
