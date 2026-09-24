#!/usr/bin/env python3
"""Paints the texture set for the night-market march level (march-art.js).

Outputs (game/assets/march/):
  march-props.webp  2048x2048 RGBA  facades, roofs, lanterns, neon, banners, props, glows, blossoms
  march-stone.webp  1024x1024 RGBA  top half: wet flagstones (4 m x 2 m tile, alpha = wetness)
                                     bottom half: ashlar wall blocks (4 m x 2 m tile, alpha = grime)
  march-sky.webp    2048x512  RGB   skyline band cropped from assets/gen/sky.jpg (mirror-tiled in the shader)
  atlas.json                        named pixel rects inside march-props.webp

Sources: the existing painted storefront atlas (assets/art/storefront-atlas.webp) and sky
(assets/gen/sky.jpg) are reused; everything else is painted here with PIL + numpy.
Run:  python3 game/scripts/march-art/paint_atlas.py
"""
import json
import math
import os
import random

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'march')
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
os.makedirs(OUT, exist_ok=True)
rng = random.Random(1117)
np.random.seed(1117)

W = 2048
atlas = Image.new('RGBA', (W, W), (0, 0, 0, 0))
rects = {}


def font(size, weight='bold'):
    index = {'regular': 0, 'medium': 2, 'semibold': 4, 'bold': 6, 'light': 8}[weight]
    return ImageFont.truetype(FONT, size, index=index)


def place(name, img, x, y):
    atlas.paste(img, (x, y))
    rects[name] = [x, y, img.width, img.height]


# ---------------------------------------------------------------- helpers
def noise(w, h, scale, octaves=4, seed=0, tile=True):
    """fbm value noise in [0,1], tileable when tile=True."""
    r = np.random.RandomState(seed)
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cw = max(2, int(w / scale * 2 ** o)); ch = max(2, int(h / scale * 2 ** o))
        grid = r.rand(ch, cw).astype(np.float32)
        if tile:
            grid = np.concatenate([grid, grid[:, :1]], 1)
            grid = np.concatenate([grid, grid[:1, :]], 0)
            img = Image.fromarray((grid * 255).astype(np.uint8)).resize((w + int(w / cw), h + int(h / ch)), Image.BICUBIC)
            img = img.crop((0, 0, w, h))
        else:
            img = Image.fromarray((grid * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += np.asarray(img, np.float32) / 255 * amp
        total += amp
        amp *= 0.5
    return out / total


def to_img(arr, mode='RGB'):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode)


def lerp(a, b, t):
    return a + (b - a) * t


def col(hexstr):
    hexstr = hexstr.lstrip('#')
    return np.array([int(hexstr[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def fill(w, h, c):
    return np.ones((h, w, 3), np.float32) * col(c)


def glow_layer(size, draw_fn, blur):
    layer = Image.new('RGB', size, (0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def add(img, layer, k=1.0):
    a = np.asarray(img.convert('RGB'), np.float32) + np.asarray(layer, np.float32) * k
    return to_img(a)


def brush_texture(w, h, seed, strength=10, horizontal=True):
    """Directional painterly streak noise, centred on 0."""
    n = noise(w, h, 6, 3, seed)
    img = Image.fromarray((n * 255).astype(np.uint8))
    img = img.filter(ImageFilter.BoxBlur(1))
    arr = np.asarray(img, np.float32) / 255 - 0.5
    if horizontal:
        arr = np.asarray(Image.fromarray(((arr + 0.5) * 255).astype(np.uint8)).resize((w // 4, h)).resize((w, h), Image.BICUBIC), np.float32) / 255 - 0.5
    return arr[..., None] * strength


# ---------------------------------------------------------------- 1. storefront facades (reuse)
store = Image.open(os.path.join(ROOT, 'assets', 'art', 'storefront-atlas.webp')).convert('RGB').resize((1024, 1024), Image.LANCZOS)
sa = np.asarray(store, np.float32)
# Slight contact darkening at each panel's pavement edge and a cooler top edge.
for row in range(4):
    y0 = row * 256
    grad = np.linspace(0, 1, 256)[:, None, None]
    shade = 1 - 0.28 * np.clip((grad - 0.86) / 0.14, 0, 1) - 0.12 * np.clip((0.08 - grad) / 0.08, 0, 1)
    sa[y0:y0 + 256] *= shade
place('facades', to_img(sa).convert('RGBA'), 0, 0)


# ---------------------------------------------------------------- 2. upper floors (2 x 512x512)
def window(d, arr, x, y, w, h, lit, seed):
    r = random.Random(seed)
    if lit:
        top, bot = col(r.choice(['#ffd9a0', '#ffc27a', '#ffe4b8', '#f7b0d8'])), col(r.choice(['#c8662c', '#b85a36', '#a0503a']))
        t = np.linspace(0, 1, h)[:, None, None]
        arr[y:y + h, x:x + w] = lerp(top, bot, t) * 0.92
        # curtains / blinds silhouettes
        if r.random() < 0.5:
            for k in range(0, h, 6):
                arr[y + k:y + k + 2, x:x + w] *= 0.8
        else:
            cw = int(w * r.uniform(0.2, 0.35))
            arr[y:y + h, x:x + cw] *= 0.55
            arr[y:y + h, x + w - cw:x + w] *= 0.6
        if r.random() < 0.5:  # plant / shelf silhouette
            px = x + r.randint(4, w - 20)
            arr[y + h - 22:y + h, px:px + 14] *= 0.35
    else:
        t = np.linspace(0, 1, h)[:, None, None]
        arr[y:y + h, x:x + w] = lerp(col('#2c3656'), col('#141a2c'), t)
        # faint sky reflection diagonal
        for k in range(w):
            yy = int(k * 0.6)
            if yy < h - 6:
                arr[y + yy:y + yy + 5, x + k] += 10
    # frame
    arr[y - 4:y, x - 4:x + w + 4] = col('#10131f')
    arr[y + h:y + h + 6, x - 6:x + w + 6] = col('#3a3f55')  # sill
    arr[y:y + h, x - 4:x] = col('#10131f')
    arr[y:y + h, x + w:x + w + 4] = col('#10131f')
    arr[y:y + h, x + w // 2 - 2:x + w // 2 + 2] = col('#141826')


def upper_modern(seed):
    w = h = 512
    base = fill(w, h, '#262b3d')
    base += (noise(w, h, 64, 5, seed)[..., None] - 0.5) * 26
    base += brush_texture(w, h, seed + 3, 8, horizontal=False)
    # floor band ledges
    for y in (0, 250):
        base[y:y + 14] = col('#1a1e2c')
        base[y + 14:y + 18] = col('#3b4058')
    d = None
    r = random.Random(seed)
    for floor_y in (40, 290):
        n = 3
        for i in range(n):
            x = 40 + i * 160
            lit = r.random() < 0.62
            window(d, base, x, floor_y, 118, 150, lit, seed * 10 + i + floor_y)
            if r.random() < 0.45:  # AC unit under window
                ax, ay = x + r.randint(0, 50), floor_y + 162
                base[ay:ay + 40, ax:ax + 64] = col('#5a6078')
                base[ay:ay + 40, ax:ax + 64] += (noise(64, 40, 8, 2, seed + i)[..., None] - 0.5) * 20
                for k in range(4, 36, 5):
                    base[ay + k:ay + k + 2, ax + 6:ax + 58] = col('#3a3f52')
                base[ay + 40:ay + 44, ax:ax + 64] = col('#171a26')
    # drain pipe
    px = r.choice([8, 494])
    base[:, px:px + 10] = col('#1b1f2c')
    base[:, px + 2:px + 4] += 25
    # grime streaks under sills
    streak = noise(w, h, 20, 3, seed + 9)
    base *= (0.88 + 0.12 * streak)[..., None]
    return to_img(base)


def upper_hanok(seed):
    w = h = 512
    base = fill(w, h, '#3a3040')
    base += (noise(w, h, 48, 4, seed)[..., None] - 0.5) * 20
    wood = col('#2a1c1a')
    r = random.Random(seed)
    # plaster panels lit from inside with lattice
    for floor_y, fh in ((30, 200), (282, 200)):
        for i in range(3):
            x = 24 + i * 164
            pw = 140
            t = np.linspace(0, 1, fh)[:, None, None]
            lit = r.random() < 0.75
            if lit:
                panel = lerp(col('#ffd89a'), col('#e0883e'), t) * r.uniform(0.75, 0.95)
            else:
                panel = lerp(col('#4a4058'), col('#2c2638'), t)
            base[floor_y:floor_y + fh, x:x + pw] = panel
            # changsal lattice
            step = 20
            for k in range(0, pw, step):
                base[floor_y:floor_y + fh, x + k:x + k + 3] = wood
            for k in range(0, fh, step + 6):
                base[floor_y + k:floor_y + k + 3, x:x + pw] = wood
            base[floor_y - 8:floor_y, x - 8:x + pw + 8] = wood
            base[floor_y + fh:floor_y + fh + 8, x - 8:x + pw + 8] = wood
            base[floor_y:floor_y + fh, x - 8:x] = wood
            base[floor_y:floor_y + fh, x + pw:x + pw + 8] = wood
    # posts and beams
    for x in (0, 168, 334, 500):
        base[:, x:x + 12] = wood * 1.1
        base[:, x + 2:x + 4] += 18
    for y in (0, 250, 500):
        base[y:y + 12] = wood
        base[y + 12:y + 14] = col('#6b3a2a')
    base *= (0.9 + 0.1 * noise(w, h, 16, 3, seed + 2))[..., None]
    return to_img(base)


place('upper_modern', upper_modern(3).convert('RGBA'), 1024, 0)
place('upper_hanok', upper_hanok(5).convert('RGBA'), 1536, 0)


# ---------------------------------------------------------------- 3. roofs, eaves, dancheong
def roof_tiles():
    """Giwa: convex cap rows (sukgiwa) over concave channel tiles (amgiwa); v runs down the slope."""
    w, h = 512, 256
    arr = np.zeros((h, w, 3), np.float32)
    cw, cap = 32, 13
    seg = 42
    xs = np.arange(w) % cw
    ys = np.arange(h)
    base = col('#262c3c'); lite = col('#6c7594'); dark = col('#0b0d15')
    for y in range(h):
        t = (y % seg) / seg  # position within a tile course (0 = top of course)
        for x in range(w):
            u = xs[x]
            if u < cap:  # convex cap: cylinder shading, lit from upper-left
                c = u / cap
                prof = math.sin(c * math.pi)
                shade = 0.35 + 0.75 * prof * (1.0 - 0.35 * c) - 0.25 * t
                v = base + (lite - base) * max(0.0, min(1.0, shade))
                if t > 0.9:
                    v = v * 0.55  # lip shadow of the next cap course
            else:  # concave channel between caps
                c = (u - cap) / (cw - cap)
                prof = 1 - math.sin(c * math.pi)
                shade = 0.12 + 0.3 * (1 - prof) - 0.18 * t
                v = base * (0.55 + shade)
                if c < 0.12 or c > 0.88:
                    v = dark
            arr[y, x] = v
    arr += (noise(w, h, 24, 4, 21)[..., None] - 0.5) * 18
    arr *= (0.85 + 0.25 * noise(w, h, 90, 3, 25))[..., None]
    arr[..., 2] += 5
    return to_img(arr)


def eave_strip():
    w, h = 512, 128
    arr = fill(w, h, '#161a26')
    # rafter ends (painted dancheong: green ring, red centre)
    for i in range(16):
        cx = 16 + i * 32
        for rr, c in ((13, '#2f7a6a'), (10, '#e8e0c8'), (6, '#b8323a')):
            yy, xx = np.ogrid[:h, :w]
            m = (xx - cx) ** 2 + (yy - 92) ** 2 <= rr * rr
            arr[m] = col(c)
    # round end tiles row (sumaksae)
    for i in range(16):
        cx = 16 + i * 32
        yy, xx = np.ogrid[:h, :w]
        m = (xx - cx) ** 2 + (yy - 40) ** 2 <= 14 * 14
        arr[m] = col('#3c4560')
        m2 = (xx - cx) ** 2 + (yy - 40) ** 2 <= 8 * 8
        arr[m2] = col('#58637f')
        m3 = (xx - cx) ** 2 + (yy - 40) ** 2 <= 3 * 3
        arr[m3] = col('#2a3044')
    arr[56:62] = col('#0d0f18')
    arr[:18] = col('#2b3248')
    arr[120:] = col('#0b0c14')
    arr += (noise(w, h, 16, 3, 22)[..., None] - 0.5) * 14
    return to_img(arr)


def dancheong():
    w, h = 512, 128
    arr = fill(w, h, '#1f5c56')
    arr[:10] = col('#e4d8b0'); arr[10:16] = col('#9b2c32')
    arr[-10:] = col('#e4d8b0'); arr[-16:-10] = col('#9b2c32')
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    for i in range(4):
        cx = 64 + i * 128
        for r, c in ((44, '#d8b25a'), (38, '#b8323a'), (28, '#e9dfc0'), (20, '#2f6fa0'), (10, '#e8c46a')):
            d.ellipse((cx - r, 64 - r, cx + r, 64 + r), fill=c)
        for k in range(8):
            a = k / 8 * math.pi * 2
            px, py = cx + math.cos(a) * 33, 64 + math.sin(a) * 33
            d.ellipse((px - 6, py - 6, px + 6, py + 6), fill='#f0e6c8')
        # connecting lozenges
        mx = cx + 64
        d.polygon([(mx - 16, 64), (mx, 40), (mx + 16, 64), (mx, 88)], fill='#3c8a78', outline='#e4d8b0')
    arr = np.asarray(img, np.float32) * 0.82
    arr += (noise(w, h, 12, 3, 23)[..., None] - 0.5) * 16
    return to_img(arr)


place('roof', roof_tiles().convert('RGBA'), 1024, 512)
place('eave', eave_strip().convert('RGBA'), 1024, 768)
place('dancheong', dancheong().convert('RGBA'), 1024, 896)


# ---------------------------------------------------------------- 4. wood, lacquer, stone, balustrade
def wood(w=256, h=256, seed=31, base='#3a2620'):
    arr = fill(w, h, base)
    g = noise(w, h, 8, 4, seed)
    streak = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, 8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    arr *= (0.7 + 0.5 * streak)[..., None]
    for x in range(0, w, 64):  # plank seams (vertical planks)
        arr[:, x:x + 2] *= 0.35
        arr[:, x + 2:x + 3] *= 1.25
    arr += (noise(w, h, 32, 3, seed + 1)[..., None] - 0.5) * 18
    return to_img(arr)


def lacquer(w=256, h=256):
    arr = fill(w, h, '#7a1f24')
    g = noise(w, h, 8, 4, 41)
    streak = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, 6)).resize((w, h), Image.BICUBIC), np.float32) / 255
    arr *= (0.75 + 0.4 * streak)[..., None]
    # cylindrical shading across u (pillar unwrap is tiled 4x around, so shade softly)
    u = np.linspace(0, 1, w)
    arr *= (0.8 + 0.3 * np.sin(u * math.pi * 2) ** 2)[None, :, None]
    arr[:12] = col('#c9a04a'); arr[12:16] = col('#3a1a14')
    arr[-12:] = col('#c9a04a'); arr[-16:-12] = col('#3a1a14')
    arr += (noise(w, h, 40, 3, 42)[..., None] - 0.5) * 12
    return to_img(arr)


def carved_stone(w=256, h=256, seed=51):
    arr = fill(w, h, '#57566a')
    arr += (noise(w, h, 24, 5, seed)[..., None] - 0.5) * 40
    arr *= (0.85 + 0.2 * noise(w, h, 64, 2, seed + 1))[..., None]
    return arr


def stone_plain():
    """Weathered granite: grain speckle, two soft block seams, darker toward the bottom."""
    w = h = 256
    arr = carved_stone(w, h, 51) * 0.82
    grain = np.random.RandomState(52).rand(h, w)
    arr[grain > 0.93] *= 1.25
    arr[grain < 0.06] *= 0.7
    arr = np.asarray(to_img(arr).filter(ImageFilter.GaussianBlur(0.6)), np.float32)
    for y in (0, 128):
        arr[y:y + 3] *= 0.45
        arr[y + 3:y + 6] *= 1.15
    arr[:, 0:3] *= 0.5
    v = np.linspace(0, 1, h)[:, None, None]
    arr *= 1.05 - 0.25 * v
    arr *= (0.85 + 0.3 * noise(w, h, 40, 3, 53))[..., None]
    return to_img(arr)


def emboss(height, base, strength=1.0, light=(-0.6, -0.8)):
    """Relief shading from a height map (0..1) over a base colour array."""
    hmap = np.asarray(Image.fromarray((np.clip(height, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6)), np.float32) / 255
    gy, gx = np.gradient(hmap)
    shade = (gx * light[0] + gy * light[1]) * 9 * strength
    out = base * (1 + np.clip(shade, -0.6, 0.8))[..., None]
    out *= (0.82 + 0.25 * hmap)[..., None]   # raised parts catch more light, recesses hold grime
    return out


def cloud_scroll(d, cx, cy, r, turns=1.6, width=5, flip=1):
    pts = []
    for i in range(60):
        t = i / 59
        a = flip * t * turns * math.tau
        rr = r * (1 - t * 0.8)
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    d.line(pts, fill=255, width=width, joint='curve')


def balustrade():
    w, h = 256, 256
    base = carved_stone(w, h, 61) * 0.85
    hm = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(hm)
    d.rectangle((0, 0, w - 1, 24), fill=230)
    d.rectangle((0, h - 28, w - 1, h - 1), fill=200)
    d.rectangle((8, 34, w - 9, h - 38), fill=40)
    d.rounded_rectangle((18, 44, w - 19, h - 48), 14, outline=210, width=6)
    # lotus in the centre, cloud scrolls either side
    cx, cy = w / 2, h / 2 + 4
    for k, (ang, ln) in enumerate(((0, 46), (-0.55, 40), (0.55, 40), (-1.05, 30), (1.05, 30))):
        px, py = cx + math.sin(ang) * 10, cy + 20
        tip = (cx + math.sin(ang) * ln, cy + 20 - math.cos(ang) * ln)
        d.polygon([(px - 9, py), tip, (px + 9, py)], fill=170 + k * 8)
    d.ellipse((cx - 26, cy + 14, cx + 26, cy + 30), fill=190)
    cloud_scroll(d, 62, cy - 4, 24, flip=1)
    cloud_scroll(d, w - 62, cy - 4, 24, flip=-1)
    d.arc((30, cy + 2, 110, cy + 44), 190, 350, fill=200, width=5)
    d.arc((w - 110, cy + 2, w - 30, cy + 44), 190, 350, fill=200, width=5)
    arr = emboss(np.asarray(hm, np.float32) / 255, base, 1.0)
    arr += (noise(w, h, 16, 4, 62)[..., None] - 0.5) * 14
    return to_img(arr)


def dapdo():
    """Carved centre slab of the palace stairs: two 256x128 panels (long axis = up the slope)."""
    w, h = 512, 128
    base = carved_stone(w, h, 71) * 0.9
    hm = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(hm)
    for p0 in (0, 256):
        d.rectangle((p0 + 3, 3, p0 + 252, h - 4), outline=220, width=7)
        # sinuous dragon-like cloud band with scrolls along the panel
        pts = [(p0 + 16 + t * 224, 64 + math.sin(t * math.tau * 1.5) * 26) for t in np.linspace(0, 1, 80)]
        d.line(pts, fill=230, width=12, joint='curve')
        for k, t in enumerate((0.12, 0.45, 0.78)):
            x = p0 + 16 + t * 224
            y = 64 + math.sin(t * math.tau * 1.5) * 26
            cloud_scroll(d, x, y + (-26 if k % 2 else 26), 16, flip=1 if k % 2 else -1, width=5)
        for k in range(10):  # scales along the band
            t = 0.05 + k * 0.095
            x = p0 + 16 + t * 224
            y = 64 + math.sin(t * math.tau * 1.5) * 26
            d.arc((x - 7, y - 7, x + 7, y + 7), 200, 340, fill=140, width=3)
    arr = emboss(np.asarray(hm, np.float32) / 255, base, 1.1)
    arr += (noise(w, h, 16, 4, 72)[..., None] - 0.5) * 12
    return to_img(arr)


place('wood', wood().convert('RGBA'), 1536, 512)
place('lacquer', lacquer().convert('RGBA'), 1792, 512)
place('stone', stone_plain().convert('RGBA'), 1536, 768)
place('balustrade', balustrade().convert('RGBA'), 1792, 768)


# ---------------------------------------------------------------- 5. paper lanterns (4 x 128x256) + demon lantern
def lantern(base_hex, glow_hex, glyph, seed):
    w, h = 128, 256
    u = np.linspace(-1, 1, w)[None, :]
    v = np.linspace(-1, 1, h)[:, None]
    core = np.clip(1 - (u ** 2) * 0.55 - (v ** 2) * 0.7, 0, 1)
    arr = lerp(col(base_hex), col(glow_hex), core[..., None] ** 1.4)
    for y in range(18, h - 18, 14):  # ribs
        arr[y:y + 2] *= 0.72
    arr += (noise(w, h, 20, 3, seed)[..., None] - 0.5) * 14
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    f = font(78, 'bold')
    bb = d.textbbox((0, 0), glyph, font=f)
    d.text(((w - (bb[2] - bb[0])) / 2 - bb[0], (h - (bb[3] - bb[1])) / 2 - bb[1]), glyph, font=f, fill=(58, 14, 12))
    arr = np.asarray(img, np.float32)
    arr[:16] = col('#1a1210'); arr[16:20] = col('#c29a4a')
    arr[-16:] = col('#1a1210'); arr[-20:-16] = col('#c29a4a')
    return to_img(arr)


for i, (b, g, t) in enumerate((('#b8261e', '#ffcf7a', '복'), ('#d0741e', '#fff0b0', '맛'), ('#c8b08a', '#fff6de', '술'), ('#a0306a', '#ffc0e8', '밤'))):
    place(f'lantern{i}', lantern(b, g, t, 70 + i).convert('RGBA'), i * 128, 1024)


def demon_lantern():
    w, h = 256, 256
    u = np.linspace(-1, 1, w)[None, :]
    v = np.linspace(-1, 1, h)[:, None]
    uu = np.abs(((u + 1) * 2) % 2 - 1)  # face repeats twice around
    core = np.clip(1 - (1 - uu) ** 2 * 0.2 - v ** 2 * 0.8, 0, 1)
    arr = lerp(col('#5a0a14'), col('#ff5a3a'), core[..., None] ** 1.2)
    for y in range(20, h - 20, 16):
        arr[y:y + 2] *= 0.7
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    for cx in (64, 192):
        ink = (20, 4, 8)
        # horns
        d.polygon([(cx - 40, 70), (cx - 50, 26), (cx - 22, 62)], fill=ink)
        d.polygon([(cx + 40, 70), (cx + 50, 26), (cx + 22, 62)], fill=ink)
        # brows + glowing eyes
        d.polygon([(cx - 44, 96), (cx - 8, 110), (cx - 12, 120), (cx - 44, 108)], fill=ink)
        d.polygon([(cx + 44, 96), (cx + 8, 110), (cx + 12, 120), (cx + 44, 108)], fill=ink)
        d.ellipse((cx - 36, 112, cx - 14, 128), fill=(255, 236, 150))
        d.ellipse((cx + 14, 112, cx + 36, 128), fill=(255, 236, 150))
        # mouth with fangs
        d.chord((cx - 40, 130, cx + 40, 196), 0, 180, fill=ink)
        for k in (-26, -10, 10, 26):
            d.polygon([(cx + k - 6, 162), (cx + k + 6, 162), (cx + k, 178 if abs(k) > 12 else 172)], fill=(240, 220, 200))
    arr = np.asarray(img, np.float32)
    arr[:18] = col('#140a0a'); arr[18:22] = col('#d0a050')
    arr[-18:] = col('#140a0a'); arr[-22:-18] = col('#d0a050')
    arr += (noise(w, h, 24, 3, 88)[..., None] - 0.5) * 14
    return to_img(arr)


place('demon_lantern', demon_lantern().convert('RGBA'), 512, 1024)


# ---------------------------------------------------------------- 6. props: crate, barrel, jar
def crate():
    img = wood(256, 256, 91, '#6a4a30')
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 255, 255), outline=(40, 26, 18), width=18)
    d.line((18, 18, 238, 238), fill=(52, 34, 22), width=26)
    d.line((18, 20, 238, 240), fill=(120, 88, 58), width=4)
    arr = np.asarray(img, np.float32)
    # stencil glyph
    tmp = Image.new('L', (256, 256), 0)
    ImageDraw.Draw(tmp).text((150, 150), '酒', font=font(64), fill=255)
    arr[np.asarray(tmp) > 128] *= 0.45
    return to_img(arr)


def barrel():
    arr = np.asarray(wood(256, 256, 93, '#5a3c2a'), np.float32).copy()
    u = np.linspace(0, 1, 256)
    arr *= (0.75 + 0.35 * np.sin(u * math.pi * 4) ** 2)[None, :, None] * 0.9 + 0.1
    for y in (30, 110, 146, 226):
        arr[y:y + 16] = col('#2a2a32')
        arr[y + 2:y + 4] = col('#6a6a78')
    return to_img(arr)


def jar():
    arr = fill(256, 256, '#4a2a1c')
    v = np.linspace(0, 1, 256)[:, None, None]
    arr *= 0.7 + 0.5 * np.exp(-((v - 0.35) / 0.2) ** 2)
    arr += (noise(256, 256, 20, 4, 95)[..., None] - 0.5) * 30
    arr[60:66] *= 0.6
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    for cx in (64, 192):  # glaze brush patterns (onggi)
        d.arc((cx - 40, 110, cx + 40, 170), 200, 340, fill=(120, 80, 50), width=6)
        d.arc((cx - 30, 124, cx + 30, 164), 200, 340, fill=(120, 80, 50), width=4)
    return img


place('crate', crate().convert('RGBA'), 768, 1024)
place('barrel', barrel().convert('RGBA'), 1024, 1024)
place('jar', jar().convert('RGBA'), 1280, 1024)


# ---------------------------------------------------------------- 7. glow sprites
def radial(size, power=2.0):
    yy, xx = np.mgrid[:size, :size]
    r = np.sqrt((xx - size / 2 + 0.5) ** 2 + (yy - size / 2 + 0.5) ** 2) / (size / 2)
    a = np.clip(1 - r, 0, 1) ** power
    return a


g = radial(256, 2.2)
glow = np.dstack([g * 255] * 3 + [np.ones_like(g) * 255])
place('glow', Image.fromarray(glow.astype(np.uint8), 'RGBA'), 1536, 1024)


def flame():
    size = 256
    yy, xx = np.mgrid[:size, :size] / size
    cx = 0.5
    # teardrop: wide at bottom, pointed at top
    y = 1 - yy
    width = np.where(y < 0.35, np.sqrt(np.clip(1 - ((y - 0.35) / 0.3) ** 2, 0, 1)) * 0.26, 0.26 * np.clip(1 - (y - 0.35) / 0.6, 0, 1) ** 1.3)
    d = np.abs(xx - cx) / np.maximum(width, 1e-3)
    a = np.clip(1 - d, 0, 1) ** 0.8 * np.clip((y - 0.04) / 0.1, 0, 1)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), np.float32) / 255
    core = np.clip(a * 1.6 - 0.6, 0, 1)
    rgb = np.dstack([a * 0.55 + core * 0.45, a * 0.75 + core * 0.25, a]) * 255  # white-core flame, tinted by vertex colour
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), np.ones_like(a) * 255]).astype(np.uint8), 'RGBA')


place('flame', flame(), 1792, 1024)


# ---------------------------------------------------------------- 8. neon signs (6 x 128x512)
NEON = [('떡볶이', '#ff4fb4', 'box'), ('포장마차', '#46e6e0', 'box'), ('국수', '#ffb34a', 'light'),
        ('노래방', '#b86bff', 'box'), ('호떡', '#ff6a7a', 'light'), ('야시장', '#5fd8ff', 'box')]


def neon_sign(text, hexc, style, seed):
    w, h = 128, 512
    c = col(hexc)
    if style == 'light':  # backlit cream lightbox with coloured letters
        arr = lerp(col('#fff4dc'), col('#f0d8b0'), np.linspace(0, 1, h)[:, None, None]) * np.ones((h, w, 3))
        img = to_img(arr)
    else:
        arr = fill(w, h, '#12101e')
        arr += (noise(w, h, 20, 3, seed)[..., None] - 0.5) * 10
        img = to_img(arr)
    d = ImageDraw.Draw(img)
    n = len(text)
    size = min(100, int((h - 60) / n * 0.92))
    f = font(size, 'bold')
    tube = Image.new('RGB', (w, h), (0, 0, 0))
    td = ImageDraw.Draw(tube)
    y0 = (h - n * size * 1.04) / 2
    for i, ch in enumerate(text):
        bb = td.textbbox((0, 0), ch, font=f)
        pos = ((w - (bb[2] - bb[0])) / 2 - bb[0], y0 + i * size * 1.04 - bb[1] + (size - (bb[3] - bb[1])) / 2)
        if style == 'light':
            d.text(pos, ch, font=f, fill=tuple(int(v) for v in c * 0.8))
        else:
            td.text(pos, ch, font=f, fill=(255, 255, 255))
    if style != 'light':
        m = np.asarray(tube, np.float32)[..., :1] / 255
        halo = np.asarray(tube.filter(ImageFilter.GaussianBlur(9)), np.float32)[..., :1] / 255
        base = np.asarray(img, np.float32)
        base = base * (1 - m) + (c * 0.35 + 255 * 0.65) * m  # white-hot tube core
        base += c * halo * 1.4
        img = to_img(base)
        # outer neon frame
        fr = Image.new('RGB', (w, h), (0, 0, 0))
        ImageDraw.Draw(fr).rounded_rectangle((10, 10, w - 11, h - 11), 12, outline=(255, 255, 255), width=3)
        fm = np.asarray(fr, np.float32)[..., :1] / 255
        fh = np.asarray(fr.filter(ImageFilter.GaussianBlur(6)), np.float32)[..., :1] / 255
        base = np.asarray(img, np.float32) * (1 - fm) + (c * 0.5 + 127) * fm + c * fh * 0.9
        img = to_img(base)
    arr = np.asarray(img, np.float32)
    arr[:6] = col('#0a0a10'); arr[-6:] = col('#0a0a10'); arr[:, :5] = col('#0a0a10'); arr[:, -5:] = col('#0a0a10')
    return to_img(arr)


for i, (t, c, s) in enumerate(NEON):
    place(f'sign{i}', neon_sign(t, c, s, 200 + i).convert('RGBA'), i * 128, 1280)


# ---------------------------------------------------------------- 9. banners (3 x 128x512, swallowtail alpha)
def banner(base_hex, seed):
    w, h = 128, 512
    arr = fill(w, h, base_hex)
    arr *= (0.8 + 0.3 * np.sin(np.linspace(0, math.pi * 3, w)) ** 2)[None, :, None]  # cloth folds
    arr += (noise(w, h, 24, 3, seed)[..., None] - 0.5) * 14
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    gold = (214, 178, 96)
    d.rectangle((6, 6, w - 7, h - 40), outline=gold, width=3)
    cx, cy = w / 2, 180
    # abstract sigil: diamond, crescent, three strokes
    d.polygon([(cx, cy - 58), (cx + 34, cy), (cx, cy + 58), (cx - 34, cy)], outline=gold, width=4)
    d.arc((cx - 26, cy - 26, cx + 26, cy + 26), 30, 330, fill=gold, width=4)
    d.line((cx, cy - 90, cx, cy - 64), fill=gold, width=3)
    d.line((cx, cy + 64, cx, cy + 120), fill=gold, width=3)
    for k in range(3):
        d.line((cx - 20, 330 + k * 28, cx + 20, 330 + k * 28), fill=gold, width=3)
    alpha = Image.new('L', (w, h), 255)
    ad = ImageDraw.Draw(alpha)
    ad.polygon([(0, h), (w / 2, h - 44), (w, h)], fill=0)  # swallowtail
    img = img.convert('RGBA')
    img.putalpha(alpha)
    return img


for i, c in enumerate(('#2c1d58', '#3a1850', '#1d2450')):
    place(f'banner{i}', banner(c, 300 + i), 768 + i * 128, 1280)


# ---------------------------------------------------------------- 10. tarps / awnings (256x256 x 2)
def tarp():
    w = h = 256
    t = np.linspace(0, 1, h)[:, None, None]
    arr = lerp(col('#ff9a3c'), col('#c8461e'), t) * np.ones((h, w, 3))
    for x in range(0, w, 64):
        arr[:, x:x + 3] *= 0.7
    arr += (noise(w, h, 20, 3, 401)[..., None] - 0.5) * 20
    arr[-14:] = col('#8a2a14')
    return to_img(arr)


def stripe_awning():
    w = h = 256
    arr = np.zeros((h, w, 3), np.float32)
    for x in range(w):
        arr[:, x] = col('#1f6f78') if (x // 32) % 2 == 0 else col('#d8d0c0')
    arr *= np.linspace(1.0, 0.7, h)[:, None, None]
    arr += (noise(w, h, 20, 3, 402)[..., None] - 0.5) * 16
    # scalloped valance
    arr[-24:] *= 0.8
    return to_img(arr)


place('tarp', tarp().convert('RGBA'), 1152, 1280)
place('awning', stripe_awning().convert('RGBA'), 1152, 1536)


# ---------------------------------------------------------------- 11. cherry blossom clusters (2 x 256x256 alpha)
def blossom(seed):
    r = random.Random(seed)
    size = 256
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # a few dark twigs
    for _ in range(4):
        x0, y0 = r.uniform(60, 200), r.uniform(150, 250)
        d.line((x0, y0, x0 + r.uniform(-60, 60), y0 - r.uniform(40, 110)), fill=(40, 24, 40, 255), width=3)
    blobs = []
    for _ in range(26):  # sub-clusters inside an ellipse
        a, rr = r.uniform(0, math.tau), math.sqrt(r.random())
        blobs.append((128 + math.cos(a) * rr * 92, 128 + math.sin(a) * rr * 80, r.uniform(16, 30)))
    for bx, by, br in sorted(blobs, key=lambda b: b[1]):
        for _ in range(int(br * 1.6)):
            a, rr = r.uniform(0, math.tau), r.uniform(0, br)
            px, py = bx + math.cos(a) * rr, by + math.sin(a) * rr
            shade = 0.55 + 0.45 * (1 - (py - by + br) / (2 * br))  # lit from above
            base = r.choice([(246, 170, 214), (232, 140, 200), (255, 196, 228), (214, 120, 190)])
            c = tuple(int(v * shade) for v in base)
            pr = r.uniform(3.2, 5.8)
            for k in range(5):  # five petals
                pa = k / 5 * math.tau + r.random()
                qx, qy = px + math.cos(pa) * pr * 0.8, py + math.sin(pa) * pr * 0.8
                d.ellipse((qx - pr * 0.7, qy - pr * 0.7, qx + pr * 0.7, qy + pr * 0.7), fill=c + (255,))
            d.ellipse((px - 1.2, py - 1.2, px + 1.2, py + 1.2), fill=(150, 40, 90, 255))
    return img


place('blossom0', blossom(501), 1408, 1280)
place('blossom1', blossom(502), 1664, 1280)
# fallen petals decal (scatter, used flat on the floor)
pet = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
pd = ImageDraw.Draw(pet)
for _ in range(110):
    x, y = rng.uniform(8, 248), rng.uniform(8, 248)
    c = rng.choice([(240, 160, 206), (220, 130, 190), (255, 190, 225)])
    pd.ellipse((x - 3.5, y - 2, x + 3.5, y + 2), fill=c + (255,))
place('petals', pet, 1408, 1536)


# ---------------------------------------------------------------- 12. medallion (quadrant of a 512 disc; mirrored in UV)
def medallion():
    size = 512
    img = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(img)
    c = size / 2
    for r, wdt in ((250, 6), (236, 2), (190, 4), (120, 3), (108, 2), (60, 3)):
        d.ellipse((c - r, c - r, c + r, c + r), outline=255, width=wdt)
    f = font(26, 'bold')
    glyphs = '천지현황우주홍황일월영측진수열장'
    for i, gl in enumerate(glyphs):
        a = (i + 0.5) / len(glyphs) * math.tau
        x, y = c + math.cos(a) * 213, c + math.sin(a) * 213
        tmp = Image.new('L', (40, 40), 0)
        ImageDraw.Draw(tmp).text((6, 2), gl, font=f, fill=255)
        tmp = tmp.rotate(-math.degrees(a) - 90, resample=Image.BICUBIC)
        img.paste(255, (int(x - 20), int(y - 20)), tmp)
    for k in range(24):
        a = (k + 0.5) / 24 * math.tau
        d.line((c + math.cos(a) * 124, c + math.sin(a) * 124, c + math.cos(a) * 184, c + math.sin(a) * 184), fill=180, width=2)
    for k in range(8):
        a = (k + 0.5) / 8 * math.tau
        d.polygon([(c + math.cos(a) * 64, c + math.sin(a) * 64), (c + math.cos(a + 0.2) * 104, c + math.sin(a + 0.2) * 104),
                   (c + math.cos(a) * 118, c + math.sin(a) * 118), (c + math.cos(a - 0.2) * 104, c + math.sin(a - 0.2) * 104)], outline=255)
    glowl = img.filter(ImageFilter.GaussianBlur(3))
    a = np.maximum(np.asarray(img, np.float32), np.asarray(glowl, np.float32) * 1.4)
    a = a[256:, 256:]  # bottom-right quadrant, disc centre at the crop's top-left corner
    return Image.fromarray(np.dstack([a, a, a, np.full_like(a, 255)]).clip(0, 255).astype(np.uint8), 'RGBA')


place('medallion', medallion(), 1664, 1536)


# ---------------------------------------------------------------- 13. horizontal signboards (3 x 512x128) + rune strip
def signboard(text, style, seed):
    w, h = 512, 128
    if style == 'wood':
        img = wood(w, h, seed, '#2a1a14')
        d = ImageDraw.Draw(img)
        d.rectangle((0, 0, w - 1, h - 1), outline=(150, 110, 60), width=8)
        f = font(76, 'bold')
        bb = d.textbbox((0, 0), text, font=f)
        d.text(((w - bb[2] + bb[0]) / 2 - bb[0], (h - bb[3] + bb[1]) / 2 - bb[1]), text, font=f, fill=(236, 196, 110))
        return img
    arr = lerp(col('#fff2d8'), col('#f2d6a8'), np.linspace(0, 1, h)[:, None, None]) * np.ones((h, w, 3))
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w - 1, h - 1), outline=(30, 26, 40), width=10)
    f = font(70, 'bold')
    bb = d.textbbox((0, 0), text, font=f)
    d.text(((w - bb[2] + bb[0]) / 2 - bb[0], (h - bb[3] + bb[1]) / 2 - bb[1]), text, font=f, fill=(170, 30, 60))
    return img


for i, (t, s) in enumerate((('달빛시장', 'wood'), ('분식 · 오뎅', 'light'), ('밤의 골목', 'wood'))):
    place(f'board{i}', signboard(t, s, 600 + i).convert('RGBA'), i * 512, 1792)


def runes():
    w, h = 256, 128
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    r = random.Random(77)
    x = 8
    while x < w - 40:
        cx = x + 20
        for _ in range(r.randint(2, 4)):
            kind = r.random()
            if kind < 0.35:
                d.line((cx + r.randint(-14, 14), r.randint(24, 50), cx + r.randint(-14, 14), r.randint(70, 104)), fill=255, width=4)
            elif kind < 0.7:
                rr = r.randint(8, 16)
                d.arc((cx - rr, 64 - rr, cx + rr, 64 + rr), r.randint(0, 180), r.randint(200, 360), fill=255, width=4)
            else:
                d.polygon([(cx, 30), (cx + 14, 64), (cx, 98), (cx - 14, 64)], outline=255)
        x += 44
    g = img.filter(ImageFilter.GaussianBlur(2.5))
    a = np.maximum(np.asarray(img, np.float32), np.asarray(g, np.float32) * 1.3)
    return Image.fromarray(np.dstack([a, a, a, np.full_like(a, 255)]).clip(0, 255).astype(np.uint8), 'RGBA')


place('runes', runes(), 0, 1920)


def talisman():
    """부적-style yellow paper talisman with original red brush glyphs (no real text). 64x128, painted at 4x."""
    S = 4
    w, h = 64 * S, 128 * S
    r = random.Random(4242)
    paper = lerp(col('#f6dc6a'), col('#e8b83c'), np.linspace(0, 1, h)[:, None, None]) * np.ones((h, w, 3))
    fib = noise(w, h, 6, 3, 4243)
    paper *= (0.9 + 0.16 * fib)[..., None]
    edge = np.minimum(np.minimum(np.arange(w)[None, :], w - 1 - np.arange(w)[None, :]), np.minimum(np.arange(h)[:, None], h - 1 - np.arange(h)[:, None]))
    paper *= (0.82 + 0.18 * np.clip(edge / 18, 0, 1))[..., None]
    img = to_img(paper)
    d = ImageDraw.Draw(img)
    red = (178, 22, 20)
    d.rectangle((10, 10, w - 11, h - 11), outline=red, width=6)
    d.rectangle((22, 22, w - 23, h - 23), outline=red, width=2)
    cx = w // 2
    # crown: circle with three rays
    d.ellipse((cx - 44, 44, cx + 44, 132), outline=red, width=10)
    for dx in (-26, 0, 26):
        d.line((cx + dx, 60, cx + dx * 0.6, 116), fill=red, width=9)
    # spine with hooked brush strokes and a spiral
    d.line((cx, 150, cx, 400), fill=red, width=13)
    for k, y in enumerate(range(170, 380, 42)):
        s2 = 1 if k % 2 else -1
        d.line((cx, y, cx + s2 * 70, y + 18), fill=red, width=10)
        d.line((cx + s2 * 70, y + 18, cx + s2 * 60, y + 34), fill=red, width=8)
    pts = [(cx + math.cos(t) * (8 + t * 5), 300 + math.sin(t) * (8 + t * 5)) for t in np.linspace(0, 9, 60)]
    d.line(pts, fill=red, width=6)
    # seal stamp at the bottom
    d.rectangle((cx - 36, 420, cx + 36, 488), fill=red)
    d.rectangle((cx - 26, 430, cx + 26, 478), outline=(246, 214, 110), width=5)
    d.line((cx - 16, 454, cx + 16, 454), fill=(246, 214, 110), width=5)
    d.line((cx, 438, cx, 470), fill=(246, 214, 110), width=5)
    img = img.filter(ImageFilter.GaussianBlur(1.2)).resize((64, 128), Image.LANCZOS)
    return img


def spirit_lantern():
    """Unwrapped small paper lantern (128x128): warm core, ribs, abstract red sigil twice around."""
    w, h = 128, 128
    u = np.linspace(-1, 1, w)[None, :]
    v = np.linspace(-1, 1, h)[:, None]
    uu = np.abs(((u + 1) * 2) % 2 - 1)
    core = np.clip(1 - (1 - uu) ** 2 * 0.25 - v ** 2 * 0.75, 0, 1)
    arr = lerp(col('#c4521c'), col('#ffe2a0'), core[..., None] ** 1.3)
    for y in range(12, h - 12, 12):
        arr[y:y + 1] *= 0.78
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    for cx in (32, 96):
        c = (150, 28, 22)
        d.polygon([(cx, 30), (cx + 14, 52), (cx, 74), (cx - 14, 52)], outline=c, width=3)
        d.ellipse((cx - 3, 49, cx + 3, 55), fill=c)
        d.arc((cx - 24, 70, cx - 2, 92), 270, 90, fill=c, width=3)
        d.arc((cx + 2, 70, cx + 24, 92), 90, 270, fill=c, width=3)
        d.line((cx, 74, cx, 100), fill=c, width=3)
    arr = np.asarray(img, np.float32)
    arr[:10] = col('#1a1210'); arr[10:13] = col('#c9a04a')
    arr[-10:] = col('#1a1210'); arr[-13:-10] = col('#c9a04a')
    return to_img(arr)


def spark():
    size = 64
    yy, xx = np.mgrid[:size, :size]
    dx, dy = (xx - 31.5) / 32, (yy - 31.5) / 32
    r = np.sqrt(dx * dx + dy * dy)
    star = np.exp(-np.abs(dx) * 14) * np.exp(-np.abs(dy) * 2.2) + np.exp(-np.abs(dy) * 14) * np.exp(-np.abs(dx) * 2.2)
    a = np.clip(star * 0.9 + np.exp(-(r / 0.18) ** 2), 0, 1) * np.clip(1 - r, 0, 1) * 255
    return Image.fromarray(np.dstack([a, a, a, np.full_like(a, 255)]).astype(np.uint8), 'RGBA')


place('talisman', talisman().convert('RGBA'), 256, 1920)
place('spirit_lantern', spirit_lantern().convert('RGBA'), 320, 1920)
place('spark', spark(), 448, 1920)


def ring_sprite():
    size = 256
    yy, xx = np.mgrid[:size, :size]
    r = np.sqrt((xx - 127.5) ** 2 + (yy - 127.5) ** 2) / 128
    a = np.exp(-((r - 0.9) / 0.035) ** 2) + 0.35 * np.exp(-((r - 0.9) / 0.12) ** 2)
    a = np.clip(a, 0, 1) * 255
    return Image.fromarray(np.dstack([a, a, a, np.full_like(a, 255)]).astype(np.uint8), 'RGBA')


def swirl():
    size = 256
    yy, xx = np.mgrid[:size, :size]
    dx, dy = (xx - 127.5) / 128, (yy - 127.5) / 128
    r = np.sqrt(dx * dx + dy * dy)
    ang = np.arctan2(dy, dx)
    n = noise(size, size, 32, 4, 909)
    s = 0.5 + 0.5 * np.sin(ang * 3 + r * 9 + n * 5)
    a = s ** 2 * np.clip(1 - r, 0, 1) ** 0.6 + np.clip(1 - r * 1.6, 0, 1) ** 2 * 0.6
    a = np.clip(a, 0, 1) * 255
    return Image.fromarray(np.dstack([a, a, a, np.full_like(a, 255)]).astype(np.uint8), 'RGBA')


place('ring', ring_sprite(), 1536, 1792)


def streaks():
    w, h = 256, 128
    a = np.zeros((h, w), np.float32)
    r = random.Random(606)
    for _ in range(70):
        x = r.uniform(0, w); wd = r.uniform(1.5, 5); b = r.uniform(0.3, 1)
        xs = np.arange(w)
        a += np.exp(-((xs - x) / wd) ** 2)[None, :] * b * (0.6 + 0.4 * np.sin(np.linspace(0, r.uniform(3, 9), h) + r.random() * 6))[:, None]
    a = np.clip(a / 2.2, 0, 1) * 255
    return Image.fromarray(np.dstack([a, a, a, np.full_like(a, 255)]).astype(np.uint8), 'RGBA')


def plaque():
    w, h = 256, 128
    img = wood(w, h, 610, '#1a1016')
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w - 1, h - 1), outline=(190, 150, 70), width=7)
    d.rectangle((10, 10, w - 11, h - 11), outline=(90, 60, 30), width=2)
    f = ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc', 84) if os.path.exists('/System/Library/Fonts/Hiragino Sans GB.ttc') else font(84)
    t = '魂門'
    bb = d.textbbox((0, 0), t, font=f)
    d.text(((w - bb[2] + bb[0]) / 2 - bb[0], (h - bb[3] + bb[1]) / 2 - bb[1]), t, font=f, fill=(236, 200, 120))
    return img


place('streaks', streaks(), 512, 1920)
place('plaque', plaque().convert('RGBA'), 768, 1920)
place('dapdo', dapdo().convert('RGBA'), 1024, 1920)
place('swirl', swirl(), 1792, 1792)

# ---------------------------------------------------------------- 14. solid swatches, bark, distant tower windows
swatches = {'white': '#ffffff', 'black': '#0c0c12', 'metal': '#3a3e4c', 'cable': '#08080c', 'bark': '#2e2230', 'gold': '#c9a04a', 'water': '#2a7fa8', 'paper': '#f4e6c4'}
for i, (k, v) in enumerate(swatches.items()):
    place(f'sw_{k}', Image.new('RGBA', (32, 32), tuple(int(c) for c in col(v)) + (255,)), 1920 + (i % 4) * 32, 1536 + (i // 4) * 32)
place('bark', wood(128, 96, 701, '#34263a').convert('RGBA'), 1920, 1600)


def tower():
    w, h = 128, 256
    arr = fill(w, h, '#161a2a')
    r = random.Random(808)
    for y in range(6, h - 6, 12):
        for x in range(6, w - 6, 10):
            if r.random() < 0.34:
                arr[y:y + 7, x:x + 6] = col(r.choice(['#ffcf8a', '#ffb870', '#f4e0b0', '#9ad0ff', '#ff9ad0'])) * r.uniform(0.5, 1.0)
            else:
                arr[y:y + 7, x:x + 6] = col('#232a40')
    return to_img(arr)


place('tower', tower().convert('RGBA'), 1920, 1280)

# ---------------------------------------------------------------- overlap check + write props atlas
names = list(rects)
for i in range(len(names)):
    ax, ay, aw, ah = rects[names[i]]
    for j in range(i + 1, len(names)):
        bx, by, bw, bh = rects[names[j]]
        if ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah:
            raise SystemExit(f'atlas overlap: {names[i]} {names[j]}')
    if ax + aw > W or ay + ah > W:
        raise SystemExit(f'atlas out of bounds: {names[i]}')
atlas.save(os.path.join(OUT, 'march-props.webp'), 'WEBP', quality=88, method=6, alpha_quality=90)
atlas.save(os.path.join(os.environ.get('MARCH_SCRATCH', OUT), 'march-props-preview.png')) if os.environ.get('MARCH_SCRATCH') else None


# ================================================================ stone texture (1024x1024)
def flagstones():
    """Large worn slabs, 4 m x 2 m tile (256 px / m). Alpha = wetness (puddles, grout, low slabs)."""
    w, h = 1024, 512
    arr = np.zeros((h, w, 3), np.float32)
    slab_id = np.zeros((h, w), np.int32)
    r = random.Random(1201)
    rows = [0, 170, 330, 512]
    tones = []
    sid = 0
    for ri in range(len(rows) - 1):
        y0, y1 = rows[ri], rows[ri + 1]
        x = r.randint(0, 260)
        start = x
        while x < start + w:
            sw = r.randint(200, 330)
            if start + w - (x + sw) < 150:
                sw = start + w - x
            hue = r.choice([col('#34354a'), col('#3a3848'), col('#303548'), col('#3b3a4c'), col('#2e3042'), col('#3d3a46')])
            tone = r.uniform(0.72, 1.22)
            tones.append(hue * tone)
            for xx in range(x, x + sw):
                slab_id[y0:y1, xx % w] = sid
            x += sw
            sid += 1
    tones = np.array(tones)
    arr = tones[slab_id]
    # edges from the id map
    up = np.roll(slab_id, 1, 0) != slab_id
    down = np.roll(slab_id, -1, 0) != slab_id
    left = np.roll(slab_id, 1, 1) != slab_id
    right = np.roll(slab_id, -1, 1) != slab_id
    edge = (up | down | left | right).astype(np.float32)
    grout = np.asarray(Image.fromarray((edge * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)), np.float32) / 255
    near = np.asarray(Image.fromarray((edge * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
    # bevel: light on the top/left side of each slab, dark at bottom/right (distance via shifted masks)
    hi = np.zeros((h, w), np.float32); lo = np.zeros((h, w), np.float32)
    for k in range(3, 10):
        hi += (np.roll(slab_id, k, 0) != slab_id) * (1 - k / 10) + (np.roll(slab_id, k, 1) != slab_id) * (1 - k / 10) * 0.6
        lo += (np.roll(slab_id, -k, 0) != slab_id) * (1 - k / 10) + (np.roll(slab_id, -k, 1) != slab_id) * (1 - k / 10) * 0.6
    arr *= (1 + 0.2 * np.clip(hi, 0, 1.5) - 0.3 * np.clip(lo, 0, 1.5))[..., None]
    # surface: mottling, speckle, worn centre
    arr *= (0.8 + 0.4 * noise(w, h, 70, 5, 1202))[..., None]
    arr += (noise(w, h, 7, 3, 1203)[..., None] - 0.5) * 22
    sp = np.random.RandomState(1204).rand(h, w)
    arr[sp > 0.995] *= 0.6
    arr[sp < 0.003] *= 1.3
    # hairline cracks in some slabs
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    for _ in range(14):
        x, y = r.uniform(0, w), r.uniform(0, h)
        a = r.uniform(0, math.tau)
        pts = [(x, y)]
        for _ in range(r.randint(4, 9)):
            a += r.uniform(-0.7, 0.7)
            x += math.cos(a) * r.uniform(8, 22); y += math.sin(a) * r.uniform(8, 22)
            pts.append((x, y))
        d.line(pts, fill=(34, 33, 44), width=2)
    arr = np.asarray(img, np.float32)
    arr = arr * (1 - grout[..., None]) + col('#121119') * grout[..., None]
    arr *= (1 - 0.25 * near * (1 - grout))[..., None]  # grime in the joints
    # wetness: broadly damp, with soft puddles, wet joints and some wetter slabs
    puddle = noise(w, h, 150, 4, 1205)
    wet = 0.42 + 0.3 * np.clip((puddle - 0.4) / 0.25, 0, 1)
    slab_wet = np.array([r.uniform(0.0, 0.2) for _ in range(sid)])[slab_id]
    wet = np.clip(wet + slab_wet, 0, 1)
    wet = np.maximum(wet, grout * 0.95)
    wet = np.maximum(wet, near * 0.75)
    arr *= (1 - 0.22 * wet)[..., None]
    arr[..., 2] += wet * 5
    return arr, wet


def ashlar():
    w, h = 1024, 512
    arr = np.zeros((h, w, 3), np.float32)
    r = random.Random(1301)
    bh = 112  # ~0.44 m courses
    tone_noise = noise(w, h, 80, 5, 1302)
    for yi, y0 in enumerate(range(0, h, bh + 16)):
        y1 = min(h, y0 + bh + 16)
        x = (yi % 2) * 110 + r.randint(0, 40)
        start = x
        while x < start + w:
            bw = r.randint(200, 300)
            c = r.choice([col('#4c4a5e'), col('#524e64'), col('#46475a')]) * r.uniform(0.85, 1.12)
            for xx in range(x, x + bw):
                arr[y0:y1, xx % w] = c
                arr[y0:y0 + 6, xx % w] *= 1.25
                arr[y1 - 8:y1, xx % w] *= 0.6
            arr[y0:y1, (x + bw - 4) % w:((x + bw - 4) % w) + 5] = col('#181824')
            x += bw
        arr[max(0, y1 - 3):y1] = col('#181824')
    arr *= (0.75 + 0.45 * tone_noise)[..., None]
    arr += (noise(w, h, 8, 3, 1303)[..., None] - 0.5) * 30
    # grime darkening toward the bottom of the tile (tile bottom meets ground when mapped with y=0 at v=0)
    grime = noise(w, h, 40, 4, 1304)
    arr *= (0.85 + 0.15 * grime)[..., None]
    return arr, grime


fa, fw = flagstones()
aa, ag = ashlar()
stone = np.zeros((1024, 1024, 4), np.float32)
stone[:512, :, :3] = fa
stone[:512, :, 3] = fw * 255
stone[512:, :, :3] = aa
stone[512:, :, 3] = ag * 255
Image.fromarray(np.clip(stone, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'march-stone.webp'), 'WEBP', quality=86, method=6, alpha_quality=80)

# ================================================================ sky band (2048x512)
sky = Image.open(os.path.join(ROOT, 'assets', 'gen', 'sky.jpg')).convert('RGB')
# keep the horizon glow + skyline; drop the moon (top) and the generator sparkle (bottom-right corner)
band = sky.crop((0, 470, 1790, 1012)).resize((2048, 512), Image.LANCZOS)
b = np.asarray(band, np.float32)
# mirror-tiling seam: fade both ends a little toward their mean so the mirrored join is soft
band = to_img(b)
band.save(os.path.join(OUT, 'march-sky.webp'), 'WEBP', quality=84, method=6)

with open(os.path.join(OUT, 'atlas.json'), 'w') as fjson:
    json.dump({'size': [W, W], 'rects': rects}, fjson, indent=0)
print('rects:', len(rects))
for fn in ('march-props.webp', 'march-stone.webp', 'march-sky.webp', 'atlas.json'):
    print(fn, os.path.getsize(os.path.join(OUT, fn)))
