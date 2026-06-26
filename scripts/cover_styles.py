#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cover_styles.py — 多種「每本都不一樣」的程序化封面風格（Pillow，非 AI）。
每個風格都用 slug 當亂數種子，故同風格下每本構圖/配色皆獨一無二。
風格：strata 地層 / contour 等高線 / deco 裝飾藝術 / constellation 星圖。
"""
import os, re, html, math, hashlib
from random import Random
from io import BytesIO

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FB = os.path.join(ROOT, "dist", "fonts", "NotoSerifTC-Bold.ttf")
FR = os.path.join(ROOT, "dist", "fonts", "NotoSerifTC-Regular.ttf")
W, H = 1200, 1800
_fc = {}

def _font(p, s):
    if (p, s) not in _fc:
        from PIL import ImageFont
        _fc[(p, s)] = ImageFont.truetype(p, s)
    return _fc[(p, s)]

def _rgb(h, d="#000000"):
    h = (h or d).lstrip("#")
    if len(h) == 3: h = "".join(c*2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def _lerp(a, b, t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
def _seed(slug): return int(hashlib.md5(slug.encode()).hexdigest()[:8], 16)

def _pal(vars_):
    return dict(
        ink=_rgb(vars_.get("ink"), "#1a1410"),
        parch=_rgb(vars_.get("parchment"), "#f4ecdc"),
        seaD=_rgb(vars_.get("sea-deep"), "#0f2330"),
        sea=_rgb(vars_.get("sea"), "#1e3a4c"),
        gold=_rgb(vars_.get("gold"), "#b08d34"),
        goldB=_rgb(vars_.get("gold-bright"), "#d4af5a"),
        rust=_rgb(vars_.get("rust"), "#8c3a21"),
        faint=_rgb(vars_.get("faint"), "#6b5d48"),
        line=_rgb(vars_.get("line"), "#c9b893"),
    )

def _title_lines(h1):
    t = re.sub(r"<br\s*/?>", "\n", h1 or "")
    t = re.sub(r"<[^>]+>", "", t)
    return [l.strip() for l in html.unescape(t).strip().split("\n") if l.strip()]

_CLOSE = "，、。．！？：；）」』】〉》”’%·…"
def _wrap(s, font, mw, d):
    out, cur = [], ""
    for ch in s:
        if d.textlength(cur+ch, font=font) <= mw or not cur:
            cur += ch
        elif ch in _CLOSE:          # 收尾標點懸掛，不另起一行造成孤標點
            cur += ch
        else:
            out.append(cur); cur = ch
    if cur: out.append(cur)
    return out

def _measure_title(d, h1, max_w, max_lines=5, hi=92, lo=44):
    for size in range(hi, lo-1, -4):
        f = _font(FB, size)
        lines = []
        for pl in _title_lines(h1):
            lines += _wrap(pl, f, max_w, d)
        if len(lines) <= max_lines:
            return f, size, lines
    return _font(FB, lo), lo, lines

def _draw_title(d, lines, f, size, cx, cy, color):
    lh = int(size*1.28); y = cy - lh*len(lines)//2
    for l in lines:
        w = d.textlength(l, font=f)
        d.text((cx - w/2, y), l, font=f, fill=color); y += lh
    return lh

def _kicker(d, kicker, cx, y, max_w, accent):
    if not kicker: return
    kf = _font(FR, 28); kt = html.unescape(re.sub("<[^>]+>","",kicker)).strip().upper()
    while d.textlength(kt, font=kf) > max_w and kf.size > 16: kf = _font(FR, kf.size-2)
    w = d.textlength(kt, font=kf)
    d.text((cx - w/2, y), kt, font=kf, fill=accent)

def _brand(d, color):
    bf = _font(FR, 24); bt = "歷史長卷 · INVESTMQUEST"
    w = d.textlength(bt, font=bf)
    d.text(((W-w)/2, H-96), bt, font=bf, fill=color)

def _put_title(d, h1, kicker, max_w, color, accent, cx, cy, brand_color):
    f, size, lines = _measure_title(d, h1, max_w, max_lines=4)
    lh = _draw_title(d, lines, f, size, cx, cy, color)
    _kicker(d, kicker, cx, cy - lh*len(lines)//2 - 60, max_w, accent)
    _brand(d, brand_color)

def _save(img):
    buf = BytesIO(); img.save(buf, "JPEG", quality=86, optimize=True); return buf.getvalue()

# ---------- 風格 1：地層 strata ----------
def style_strata(slug, vars_, h1, kicker, sub):
    from PIL import Image, ImageDraw
    p = _pal(vars_); rng = Random(_seed(slug))
    img = Image.new("RGB", (W, H), p["parch"]); d = ImageDraw.Draw(img, "RGBA")
    a, b = p["seaD"], p["parch"]
    accents = [p["rust"], p["gold"], p["sea"]]
    n = rng.randint(9, 14)
    cuts = sorted(rng.uniform(0.04, 0.96) for _ in range(n-1))
    ys = [0] + [int(H*c) for c in cuts] + [H]
    for i in range(len(ys)-1):
        t = i/(len(ys)-1)
        col = _lerp(a, b, t)
        if rng.random() < 0.16: col = rng.choice(accents)
        d.rectangle([0, ys[i], W, ys[i+1]], fill=col)
        if rng.random() < 0.3:
            d.rectangle([0, ys[i], W, ys[i]+rng.randint(3, 8)], fill=p["gold"]+(170,))
    # 標題卡
    py0, py1 = int(H*0.40), int(H*0.66)
    d.rectangle([70, py0, W-70, py1], fill=p["parch"]+(232,), outline=p["rust"], width=4)
    _put_title(d, h1, kicker, W-220, p["ink"], p["rust"], W//2, (py0+py1)//2, p["faint"])
    return _save(img)

# ---------- 風格 2：等高線 contour ----------
def style_contour(slug, vars_, h1, kicker, sub):
    from PIL import Image, ImageDraw
    p = _pal(vars_); rng = Random(_seed(slug))
    img = Image.new("RGB", (W, H), p["parch"]); d = ImageDraw.Draw(img, "RGBA")
    centers = [(rng.randint(150, W-150), rng.randint(150, H-150)) for _ in range(rng.randint(2, 4))]
    phases = [[rng.uniform(0, 6.28) for _ in range(4)] for _ in centers]
    col = _lerp(p["sea"], p["parch"], 0.15)
    for lvl in range(1, 17):
        r = 60 + lvl*62
        for (cx, cy), ph in zip(centers, phases):
            pts = []
            for ang in range(0, 360, 10):
                a = math.radians(ang)
                rr = r * (1 + 0.16*math.sin(a*3+ph[0]) + 0.10*math.sin(a*5+ph[1]) + 0.06*math.sin(a*2+ph[2]))
                pts.append((cx+math.cos(a)*rr, cy+math.sin(a)*rr*1.18))
            d.line(pts+[pts[0]], fill=col+(150,), width=2)
    # 中央標題卡
    cy = int(H*0.56)
    d.rectangle([80, cy-260, W-80, cy+260], fill=p["parch"]+(225,), outline=p["gold"], width=3)
    _put_title(d, h1, kicker, W-240, p["seaD"], p["gold"], W//2, cy, p["faint"])
    d.rectangle([40, 40, W-40, H-40], outline=p["gold"], width=3)
    return _save(img)

# ---------- 風格 3：裝飾藝術 deco ----------
def style_deco(slug, vars_, h1, kicker, sub):
    from PIL import Image, ImageDraw
    p = _pal(vars_); rng = Random(_seed(slug))
    img = Image.new("RGB", (W, H), p["seaD"]); d = ImageDraw.Draw(img, "RGBA")
    ox, oy = W//2, int(H*0.5)
    rays = rng.choice([24, 30, 36, 48])
    for i in range(rays):
        a = math.pi*i/rays
        d.line([ox-math.cos(a)*1600, oy-math.sin(a)*1600, ox+math.cos(a)*1600, oy+math.sin(a)*1600],
               fill=p["gold"]+(38,), width=2)
    for r in range(180, 1000, rng.choice([90, 120, 150])):
        d.ellipse([ox-r, oy-r, ox+r, oy+r], outline=p["goldB"]+(45,), width=2)
    # 上下扇形
    for yy, d0 in [(int(H*0.13), 0), (int(H*0.87), 180)]:
        for k in range(11):
            a = math.radians(d0 + 18*k - 90)
            d.line([W//2, yy, W//2+math.cos(a)*200, yy+math.sin(a)*200], fill=p["goldB"]+(70,), width=3)
    # 標題卡（金框，高度依標題行數自適應）
    cy = int(H*0.5); maxw = W-280
    f, size, lines = _measure_title(d, h1, maxw, max_lines=5)
    lh = int(size*1.28)
    half = max(230, lh*len(lines)//2 + 96)
    # 卡片底色：比深藍再深一階，讓金字題更立體
    d.rectangle([90, cy-half, W-90, cy+half], fill=_lerp(p["seaD"], (0,0,0), 0.28))
    d.rectangle([90, cy-half, W-90, cy+half], outline=p["goldB"], width=4)
    d.rectangle([108, cy-half+18, W-108, cy+half-18], outline=p["gold"]+(120,), width=1)
    _kicker(d, kicker, W//2, cy - lh*len(lines)//2 - 58, maxw, p["goldB"])
    _draw_title(d, lines, f, size, W//2, cy, p["parch"])
    _brand(d, p["line"])
    for cxy in [(90, cy-half), (W-90, cy-half), (90, cy+half), (W-90, cy+half)]:
        d.polygon([(cxy[0], cxy[1]-12), (cxy[0]+12, cxy[1]), (cxy[0], cxy[1]+12), (cxy[0]-12, cxy[1])], fill=p["goldB"])
    return _save(img)

# ---------- 風格 4：星圖 constellation ----------
def style_constellation(slug, vars_, h1, kicker, sub):
    from PIL import Image, ImageDraw
    p = _pal(vars_); rng = Random(_seed(slug))
    img = Image.new("RGB", (W, H), p["seaD"]); px = img.load()
    top = (8, 10, 24)
    bot = _lerp(p["seaD"], (40, 30, 18), 0.5)
    for y in range(H):
        c = _lerp(top, bot, y/H)
        for x in range(W): px[x, y] = c
    d = ImageDraw.Draw(img, "RGBA")
    for _ in range(260):
        x, y = rng.randint(0, W), rng.randint(0, H)
        r = rng.choice([1, 1, 1, 2, 2, 3])
        b = rng.randint(120, 255)
        d.ellipse([x-r, y-r, x+r, y+r], fill=(245, 238, 210, b))
    # 星座連線
    nodes = [(rng.randint(180, W-180), rng.randint(160, H-420)) for _ in range(rng.randint(5, 8))]
    for i in range(len(nodes)-1):
        d.line([nodes[i], nodes[i+1]], fill=p["goldB"]+(160,), width=2)
    for (x, y) in nodes:
        d.ellipse([x-9, y-9, x+9, y+9], fill=p["goldB"]+(60,))
        d.ellipse([x-4, y-4, x+4, y+4], fill=(255, 248, 224))
    cy = int(H*0.66)
    _put_title(d, h1, kicker, W-200, p["parch"], p["goldB"], W//2, cy, p["line"])
    d.rectangle([42, 42, W-42, H-42], outline=p["gold"]+(150,), width=2)
    return _save(img)

STYLES = {
    "strata": style_strata, "contour": style_contour,
    "deco": style_deco, "constellation": style_constellation,
}

# build_epub 用的進入點：預設採用 deco 風格
DEFAULT_STYLE = "deco"
def cover_for(slug, vars_, h1, kicker, sub):
    try:
        return STYLES[DEFAULT_STYLE](slug, vars_, h1, kicker, sub)
    except Exception:
        return None
