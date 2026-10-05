#!/usr/bin/env python3
"""Bake the all-Switzerland "country" layer (imagery + DEM) used by Skybound's geoscenery.js.

usage:  python3 dev/bake_country.py [--cache DIR] [--out DIR]
output: data/lszh/country/country.json, country_4096.webp, country_2048.webp, dem.png
requires: python3, numpy, scipy, Pillow (WebP); network only on a cold cache (<=10 parallel requests).
Run after dev/bake_lszh.py (the colour match reads the baked data/lszh/far_2048.webp and scenery.json).

Sources and terms
  imagery  EOX Sentinel-2 cloudless 2016 (s2cloudless_3857), CC BY 4.0 -- 2016 only; later editions are non-commercial.
           "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)"
  DEM      AWS Open Data "Terrain Tiles" (Mapzen/tilezen, Terrarium encoding), z10, area-averaged to ~200 m cells.
All coordinates are absolute Web Mercator (EPSG:3857) metres, like scenery.json. DEM encoding as the other DEMs:
8-bit RGB PNG, height_m = (R*256 + G) * stepM + offsetM. Unlike them the country DEM is not square (nx x ny).
"""
import argparse, json, math, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bake_lszh as B  # noqa: E402  (tile download, mosaic, colour LUT helpers -- reused unchanged)

LON0, LON1, LAT0, LAT1 = 5.8, 10.7, 45.7, 47.95
IMG_ZOOM, DEM_ZOOM, DEM_CELL_M = 11, 10, 200.0
SIZES = [4096, 2048]  # longest side in px
WEBP_Q = 80


def merc(lat, lon):
    return B.R * math.radians(lon), B.R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.environ.get('LSZH_CACHE') or os.path.expanduser('~/.cache/skybound-lszh'))
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'data', 'lszh', 'country'))
    a = ap.parse_args()
    out, cache = os.path.abspath(a.out), os.path.abspath(a.cache)
    base = os.path.abspath(os.path.join(HERE, '..', 'data', 'lszh'))
    os.makedirs(out, exist_ok=True); os.makedirs(cache, exist_ok=True)
    B.OUT, B.CACHE = out, cache
    x0, y0 = merc(LAT0, LON0); x1, y1 = merc(LAT1, LON1)
    W, H = x1 - x0, y1 - y0
    gs = B.GS
    print(f'box {W * gs / 1000:.0f} x {H * gs / 1000:.0f} km ground')

    # --- imagery
    mos, mx0, my1, pxm = B.mosaic(x0, x1, y0, y1, IMG_ZOOM, 'eox', 'eox_')
    box = ((x0 - mx0) / pxm, (my1 - y1) / pxm, (x1 - mx0) / pxm, (my1 - y0) / pxm)
    scen = json.load(open(f'{base}/scenery.json'))
    far = scen['layers']['far']
    # colour: histogram-match (strength 1) the country imagery to the already colour-matched far layer over the far box,
    # so the far -> country edge carries the same tones the far layer was given against SWISSIMAGE.
    ox0, ox1, oy0, oy1 = max(x0, far['minX']), min(x1, far['maxX']), max(y0, far['minY']), min(y1, far['maxY'])  # overlap of the two boxes
    fb = ((ox0 - mx0) / pxm, (my1 - oy1) / pxm, (ox1 - mx0) / pxm, (my1 - oy0) / pxm)
    fw, fh = far['maxX'] - far['minX'], far['maxY'] - far['minY']
    fi = Image.open(f'{base}/{far["files"]["2048"]}').convert('RGB')
    rb = ((ox0 - far['minX']) / fw * fi.size[0], (far['maxY'] - oy1) / fh * fi.size[1], (ox1 - far['minX']) / fw * fi.size[0], (far['maxY'] - oy0) / fh * fi.size[1])
    probe = np.asarray(mos.resize((1024, 1024), Image.LANCZOS, box=fb).convert('RGB'))
    ref = np.asarray(fi.resize((1024, 1024), Image.LANCZOS, box=rb))
    lut = B.match_lut(probe, ref, 1.0)
    after = np.stack([lut[c][probe[..., c]] for c in range(3)], -1)
    print('far-box mean RGB  country raw', probe.reshape(-1, 3).mean(0).round(1), ' matched', after.reshape(-1, 3).mean(0).round(1), ' far layer', ref.reshape(-1, 3).mean(0).round(1))
    meta = {'minX': x0, 'maxX': x1, 'minY': y0, 'maxY': y1, 'lonRange': [LON0, LON1], 'latRange': [LAT0, LAT1], 'source': 'eox', 'srcZoom': IMG_ZOOM,
            'colorMatch': {'to': 'far layer', 'strength': 1.0}, 'files': {}, 'webpQuality': WEBP_Q, 'generator': 'dev/bake_country.py'}
    for px in SIZES:
        w, h = px, round(px * H / W)
        img = B.apply_lut(mos.resize((w, h), Image.LANCZOS, box=box), lut)
        fn = f'country_{px}.webp'
        img.save(f'{out}/{fn}', 'WEBP', quality=WEBP_Q, method=6)
        meta['files'][str(px)] = fn
        print(f'  {fn} {w}x{h}: {os.path.getsize(f"{out}/{fn}") / 1e6:.2f} MB  ({W * gs / w:.0f} m/px)')

    # --- DEM: Terrarium z10 area-averaged (2x2 samples per cell) onto an nx x ny grid of ~200 m ground cells
    nx, ny = round(W * gs / DEM_CELL_M), round(H * gs / DEM_CELL_M)
    tm, tx0, ty1, tpx = B.mosaic(x0, x1, y0, y1, DEM_ZOOM, 'terrarium', 'terr_', 'RGB')
    t = np.asarray(tm, np.float32)
    ht = t[..., 0] * 256 + t[..., 1] + t[..., 2] / 256 - 32768
    acc = np.zeros((ny, nx), np.float32)
    for oy in (0.25, 0.75):
        for ox in (0.25, 0.75):
            xs = x0 + (np.arange(nx) + ox) * (W / nx); ys = y1 - (np.arange(ny) + oy) * (H / ny)
            XX, YY = np.meshgrid(xs, ys)
            acc += ndimage.map_coordinates(ht, [(ty1 - YY) / tpx - 0.5, (XX - tx0) / tpx - 0.5], order=1, mode='nearest')
    hgt = np.clip(acc / 4, 0, 16383)
    step = 0.25
    v = np.round(hgt / step).astype(np.uint32)
    rgb = np.zeros((ny, nx, 3), np.uint8); rgb[..., 0] = v >> 8; rgb[..., 1] = v & 255
    Image.fromarray(rgb).save(f'{out}/dem.png', optimize=True)
    print(f'  dem.png {nx}x{ny} ({W * gs / nx:.0f} x {H * gs / ny:.0f} m): {os.path.getsize(f"{out}/dem.png") / 1e6:.2f} MB  range {hgt.min():.0f}..{hgt.max():.0f} m')
    meta['dem'] = {'file': 'dem.png', 'minX': x0, 'maxX': x1, 'minY': y0, 'maxY': y1, 'nx': nx, 'ny': ny, 'cellGroundM': DEM_CELL_M, 'stepM': step,
                   'offsetM': 0, 'minM': float(hgt.min()), 'maxM': float(hgt.max()), 'source': f'Terrarium z{DEM_ZOOM}'}
    json.dump(meta, open(f'{out}/country.json', 'w'), indent=1)
    print('done; total', sum(os.path.getsize(f'{out}/{f}') for f in os.listdir(out)) / 1e6, 'MB')


if __name__ == '__main__':
    main()
