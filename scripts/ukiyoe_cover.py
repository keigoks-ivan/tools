#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ukiyoe_cover.py — 浮世繪風格的程序化封面（Pillow 向量繪製，非 AI 圖）。
元素：漸層天空(bokashi)、日輪、富士/山、青海波(seigaiha)、霞雲帶、和柄、直書右起標題。
主題母題依文章內容選用（海/山/城/鳥居/錢/運動…），故每本不同。
"""
import os, re, html, math
from io import BytesIO

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_BOLD = os.path.join(ROOT, "dist", "fonts", "NotoSerifTC-Bold.ttf")
FONT_REG  = os.path.join(ROOT, "dist", "fonts", "NotoSerifTC-Regular.ttf")
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

def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

def _mix(c, d, t):   # 往 d 靠 t
    return _lerp(c, d, t)

# ---- 基礎繪製 ----

def graded_sky(px, c_top, c_bot, y0, y1):
    """y0→y1 垂直漸層（bokashi）。"""
    for y in range(y0, y1):
        t = (y - y0) / max(1, (y1 - y0))
        px_color = _lerp(c_top, c_bot, t)
        for x in range(W):
            px[x, y] = px_color

def sun_disc(d, cx, cy, r, color, halo=None):
    if halo:
        d.ellipse([cx-r*1.5, cy-r*1.5, cx+r*1.5, cy+r*1.5], fill=halo)
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=color)

def seigaiha(d, y0, y1, base, arc, step=78):
    """青海波：一排排同心半弧。"""
    rows = []
    y = y0
    rad = step * 1.15
    d.rectangle([0, y0, W, y1], fill=base)
    row = 0
    while y < y1 + rad:
        offset = 0 if row % 2 == 0 else step
        x = -step
        while x < W + step:
            cx = x + offset
            for k, rr in enumerate((rad, rad*0.72, rad*0.44, rad*0.2)):
                col = arc if k % 2 == 0 else base
                d.arc([cx-rr, y-rr, cx+rr, y+rr], 180, 360, fill=col, width=max(2, int(step*0.10)))
            x += step*2
        y += int(step*0.62)
        row += 1

def mountain(d, base_y, peak_y, color, snow, line_col):
    """對稱山（富士感），含雪冠與兩道稜線。"""
    cx = W//2
    half = int(W*0.40)
    d.polygon([(cx-half, base_y), (cx, peak_y), (cx+half, base_y)], fill=color)
    # 雪冠
    sh = (base_y - peak_y)
    snow_y = peak_y + int(sh*0.26)
    sw = int(half * 0.26)
    # 鋸齒狀雪線
    pts = [(cx, peak_y)]
    n = 7
    for i in range(n+1):
        xx = cx - sw + (2*sw)*i/n
        yy = snow_y + (12 if i % 2 else -6)
        pts.append((xx, yy))
    pts += [(cx+sw, snow_y), (cx, peak_y)]
    d.polygon(pts, fill=snow)
    # 稜線
    d.line([(cx, peak_y), (cx-half, base_y)], fill=line_col, width=3)
    d.line([(cx, peak_y), (cx+half, base_y)], fill=line_col, width=3)

def kasumi(d, bands, color):
    """霞雲帶：幾條圓角橫帶。"""
    for (y, x0, x1, h) in bands:
        d.rounded_rectangle([x0, y, x1, y+h], radius=h//2, fill=color)

def wagara_asanoha(d, y0, y1, color):
    """麻葉紋背景（非海洋主題用）。"""
    s = 120
    for gy in range(y0, y1, s):
        for gx in range(-s, W+s, s):
            cx, cy = gx, gy
            for ang in range(0, 360, 60):
                a = math.radians(ang)
                d.line([cx, cy, cx+math.cos(a)*s//2, cy+math.sin(a)*s//2], fill=color, width=2)

# ---- 母題（前景剪影）----

def m_boat(d, y, color):
    cx = int(W*0.5)
    d.polygon([(cx-90, y), (cx+90, y), (cx+60, y+34), (cx-60, y+34)], fill=color)
    d.line([(cx, y), (cx, y-90)], fill=color, width=5)
    d.polygon([(cx, y-88), (cx+54, y-30), (cx, y-30)], fill=color)

def m_torii(d, base_y, color):
    cx = W//2; w = 210; h = 260
    top = base_y - h
    d.rectangle([cx-w, top, cx+w, top+30], fill=color)            # 笠木
    d.rectangle([cx-w+28, top+52, cx+w-28, top+78], fill=color)   # 貫
    d.rectangle([cx-w+44, top, cx-w+80, base_y], fill=color)      # 左柱
    d.rectangle([cx+w-80, top, cx+w-44, base_y], fill=color)      # 右柱

def m_pagoda(d, base_y, color):
    cx = W//2
    w = 150; y = base_y
    for i in range(4):
        ww = w - i*26
        roof = 30
        d.polygon([(cx-ww-16, y), (cx+ww+16, y), (cx+ww-10, y-roof), (cx-ww+10, y-roof)], fill=color)
        d.rectangle([cx-ww+18, y-roof-46, cx+ww-18, y-roof], fill=color)
        y -= roof+46
    d.rectangle([cx-6, y-40, cx+6, y], fill=color)

def m_city(d, base_y, color):
    import random
    x = 60; rng = [137, 211, 89, 173, 251, 47, 199]; i = 0
    while x < W-60:
        bw = 70 + (rng[i % len(rng)] % 60)
        bh = 120 + (rng[(i+3) % len(rng)] * 7 % 280)
        d.rectangle([x, base_y-bh, x+bw, base_y], fill=color)
        i += 1; x += bw + 24

def m_coin(d, cx, cy, r, color, hole):
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=color)
    s = int(r*0.34)
    d.rectangle([cx-s, cy-s, cx+s, cy+s], fill=hole)

def m_crane(d, cx, cy, color):
    # 簡化飛鶴：身體 + 雙翼 + 長頸
    d.line([(cx-120, cy+20), (cx, cy-30), (cx+120, cy+20)], fill=color, width=8, joint="curve")
    d.line([(cx, cy-30), (cx+70, cy-90)], fill=color, width=7)
    d.ellipse([cx+64, cy-100, cx+84, cy-80], fill=color)

def m_pyramid(d, base_y, color, snow=None):
    cx = int(W*0.40)
    for off, w, h in [(0, 230, 240), (250, 150, 160)]:
        x = cx + off
        d.polygon([(x-w, base_y), (x, base_y-h), (x+w, base_y)], fill=color)
        d.line([(x, base_y-h), (x-w*0.35, base_y-h*0.0)], fill=_mix(color,(0,0,0),0.2), width=3)

def m_dunes(d, y0, y1, c1, c2):
    d.rectangle([0, y0, W, y1], fill=c1)
    y = y0
    toggle = True
    while y < y1:
        col = c2 if toggle else c1
        d.chord([-200, y, W+200, y+460], 180, 360, fill=col)
        toggle = not toggle
        y += 150

def m_ship(d, y, color, sail):
    cx = int(W*0.5)
    d.polygon([(cx-150, y), (cx+150, y), (cx+108, y+52), (cx-108, y+52)], fill=color)  # 船身
    d.rectangle([cx-6, y-220, cx+6, y], fill=color)                                     # 主桅
    for sy, sw in [(y-210, 70), (y-150, 100), (y-86, 130)]:
        d.polygon([(cx-sw, sy), (cx+sw, sy), (cx+sw-10, sy+44), (cx-sw+10, sy+44)], fill=sail)
    d.polygon([(cx, y-220), (cx+30, y-208), (cx, y-196)], fill=color)                   # 旗

def m_sword(d, cx, cy, color, guard):
    d.polygon([(cx-10, cy-260), (cx+10, cy-260), (cx+12, cy+150), (cx, cy+170), (cx-12, cy+150)], fill=color)  # 刀身
    d.rectangle([cx-60, cy+150, cx+60, cy+166], fill=guard)        # 鍔
    d.rectangle([cx-9, cy+166, cx+9, cy+250], fill=_mix(color,(0,0,0),0.3))  # 柄

def m_stadium(d, base_y, color, ball):
    cx = W//2
    d.ellipse([cx-280, base_y-150, cx+280, base_y+40], outline=color, width=18)
    d.ellipse([cx-180, base_y-110, cx+180, base_y], outline=color, width=8)
    # 火炬/球
    d.ellipse([cx-44, base_y-260, cx+44, base_y-172], fill=ball)

def m_castle(d, base_y, color):
    cx = W//2; y = base_y
    for i, w in enumerate((190, 150, 110)):
        roof = 34
        d.polygon([(cx-w-18, y), (cx+w+18, y), (cx+w-14, y-roof), (cx-w+14, y-roof)], fill=color)
        d.rectangle([cx-w+22, y-roof-58, cx+w-22, y-roof], fill=_mix(color,(255,255,255),0.12))
        y -= roof+58
    d.polygon([(cx-70, y), (cx+70, y), (cx+50, y-40), (cx-50, y-40)], fill=color)

# ---- 母題選擇 ----

DESERT_KW = ("沙","漠","desert","saudi","uae","qatar","kuwait","egypt","yemen","jordan",
             "iran","iraq","arab","oman","sahara","gulf","dubai","mecca","波斯","阿拉伯","埃及","沙烏地")
SHIP_KW = ("航海","帆","大航海","age-of-sail","viking","portugal","explor","trade","荷蘭",
           "netherlands","amsterdam? no","商船","東印度")
SWORD_KW = ("戰","war","軍","武士","sword","samurai","military","征服","帝國","revolution","拿破","mongol","蒙古")
COIN_KW = ("銀行","錢","金","貨幣","債","股","稅","保險","泡沫","通膨","gold","bank","bond","stock",
           "money","oil","tax","inflation","insurance","economist","investor","sovereign",
           "semiconductor","business-cycle","gambling","land-property","middleman","石油")
TEMPLE_KW = ("佛","禪","寺","僧","buddhist","hindu","islamic","christian","jewish","religion","temple","silk-road","教")
SEA_KW = ("海","島","航","浪","船","港","sea","island","ocean","sail","navy","pirate")
MTN_KW = ("山","峰","嶽","alps","mountain","himalaya","nepal","bhutan","tibet","switzerland","andes","austria")
CASTLE_KW = ("城","castle","palace","王朝","kingdom","empire","堡")

def pick_motif(slug, title, cat):
    s = (slug + " " + title).lower()
    def has(kws): return any(k.lower() in s for k in kws)
    if cat == "sport": return "sport"
    if has(DESERT_KW): return "desert"
    if has(COIN_KW): return "coin"
    if has(SHIP_KW): return "ship"
    if has(SWORD_KW): return "sword"
    if has(TEMPLE_KW): return "temple"
    if cat == "city": return "city"
    if has(SEA_KW): return "sea"
    if has(MTN_KW): return "mountain"
    if has(CASTLE_KW): return "castle"
    return "mountain"   # 預設：富士山＋海

# ---- 直書標題 ----

def vtext_cols(d, lines, font, fill, x_right, y_top, col_gap, line_h):
    """每個 line 一直書欄，由右往左排。回傳最左 x。"""
    x = x_right
    for col in lines:
        y = y_top
        for ch in col:
            w = d.textlength(ch, font=font)
            d.text((x - w/2, y), ch, font=font, fill=fill)
            y += line_h
        x -= col_gap
    return x

def _title_lines(h1):
    t = re.sub(r"<br\s*/?>", "\n", h1 or "")
    t = re.sub(r"<[^>]+>", "", t)
    return [l.strip() for l in html.unescape(t).strip().split("\n") if l.strip()]

# ---- 主圖 ----

def make_cover(slug, vars_, h1, kicker, sub, cat):
    from PIL import Image, ImageDraw
    parch = _rgb(vars_.get("parchment"), "#f4ecdc")
    ink   = _rgb(vars_.get("ink"), "#1a1410")
    indigo= _rgb(vars_.get("sea-deep"), "#0f2330")
    sea   = _rgb(vars_.get("sea"), "#1e3a4c")
    gold  = _rgb(vars_.get("gold"), "#b08d34")
    rust  = _rgb(vars_.get("rust"), "#8c3a21")
    faint = _rgb(vars_.get("faint"), "#6b5d48")
    snow  = _mix(parch, (255,255,255), 0.5)
    cream = _mix(parch, (255,255,255), 0.15)

    img = Image.new("RGB", (W, H), parch)
    px = img.load()
    horizon = int(H*0.62)
    # 天空 bokashi：上深藍 → 地平線淡米
    graded_sky(px, indigo, _mix(parch,(255,240,210),0.3), 0, horizon)
    d = ImageDraw.Draw(img, "RGBA")

    motif = pick_motif(slug, re.sub("<[^>]+>","",h1 or ""), cat)

    # 日輪（左上，避開右上的標題籤）
    sun_disc(d, int(W*0.30), int(H*0.17), 140, rust, halo=rust+(40,))

    # 霞雲
    kasumi(d, [(int(H*0.13), 60, 520, 30), (int(H*0.27), 380, 1040, 26),
               (int(H*0.40), 120, 760, 24)], cream+(150,))

    seafg = _mix(indigo,parch,0.12)         # 海/前景底色
    arc   = _mix(parch,(255,255,255),0.4)
    sand  = _mix(parch,(214,180,120),0.55)

    # 中景母題
    if motif == "sea":
        mountain(d, horizon, int(H*0.34), _mix(indigo,parch,0.25), snow, indigo)
        fg = "wave"
    elif motif == "mountain":
        mountain(d, horizon, int(H*0.30), _mix(indigo,parch,0.2), snow, indigo)
        fg = "wave"
    elif motif == "temple":
        mountain(d, horizon, int(H*0.40), _mix(indigo,parch,0.35), snow, indigo)
        m_torii(d, horizon, rust); fg = "wave"
    elif motif == "city":
        m_city(d, horizon, _mix(indigo,parch,0.15)); fg = "asanoha"
    elif motif == "coin":
        mountain(d, horizon, int(H*0.42), _mix(indigo,parch,0.4), snow, indigo)
        m_coin(d, int(W*0.32), int(H*0.42), 110, gold, parch); fg = "wave"
    elif motif == "sword":
        mountain(d, horizon, int(H*0.42), _mix(indigo,parch,0.35), snow, indigo)
        m_sword(d, int(W*0.32), int(H*0.36), _mix(parch,(255,255,255),0.3), gold); fg = "wave"
    elif motif == "ship":
        mountain(d, horizon, int(H*0.40), _mix(indigo,parch,0.3), snow, indigo); fg = "wave"
    elif motif == "castle":
        m_castle(d, horizon, _mix(indigo,parch,0.18)); fg = "asanoha"
    elif motif == "desert":
        m_pyramid(d, horizon, _mix(sand,(0,0,0),0.25)); fg = "dunes"
    elif motif == "sport":
        m_stadium(d, int(H*0.50), _mix(indigo,parch,0.3), rust); fg = "wave"
    else:
        mountain(d, horizon, int(H*0.34), _mix(indigo,parch,0.25), snow, indigo); fg = "wave"

    # 前景
    if fg == "wave":
        seigaiha(d, horizon, H, seafg, arc)
    elif fg == "dunes":
        m_dunes(d, horizon, H, _mix(sand,(0,0,0),0.05), _mix(sand,(0,0,0),0.16))
    else:
        d.rectangle([0, horizon, W, H], fill=seafg)
        wagara_asanoha(d, horizon, H, _mix(parch,(255,255,255),0.25)+(120,))
    if motif == "ship":
        m_ship(d, int(H*0.70), ink, _mix(parch,(255,255,255),0.3))
    elif motif == "sea":
        m_boat(d, int(H*0.72), ink)

    # 外框
    d.rectangle([40, 40, W-40, H-40], outline=gold, width=4)
    d.rectangle([58, 58, W-58, H-58], outline=gold+(140,), width=1)

    # 標題直書（右起），置於右上角的題籤；過長的行自動拆成多欄
    lines = _title_lines(h1)
    cols = []
    for l in lines:
        if len(l) <= 9:
            cols.append(l)
        else:
            for i in range(0, len(l), 9):
                cols.append(l[i:i+9])
    maxlen = max((len(c) for c in cols), default=1)
    ncol = len(cols)
    # 字級同時受高度(欄長)與寬度(欄數)限制，題籤不超過約半幅
    size = min(94,
               int(0.52*H/(maxlen*1.06)),
               int(0.46*W/(((ncol-1)*1.16)+1)))
    size = max(46, size)
    tf = _font(FONT_BOLD, size)
    line_h = int(size*1.06)
    col_gap = int(size*1.16)
    block_w = col_gap*(ncol-1) + size
    y_top = int(H*0.085)
    x_right = W - 92 - size//2          # 靠右框內
    pad = 24
    d.rounded_rectangle([x_right - block_w + size//2 - pad, y_top - pad,
                         x_right + size//2 + pad, y_top + line_h*maxlen + pad],
                        radius=16, fill=cream+(210,), outline=rust, width=3)
    vtext_cols(d, cols, tf, ink, x_right, y_top, col_gap, line_h)

    # 英文書系名（底部小字）
    if kicker:
        kf = _font(FONT_REG, 28)
        kt = html.unescape(re.sub("<[^>]+>","",kicker)).strip().upper()
        while d.textlength(kt, font=kf) > W-200 and kf.size > 16:
            kf = _font(FONT_REG, kf.size-2)
        w = d.textlength(kt, font=kf)
        d.text(((W-w)/2, H-150), kt, font=kf, fill=gold)
    bf = _font(FONT_REG, 24)
    bt = "歷史長卷 · INVESTMQUEST"
    w = d.textlength(bt, font=bf)
    d.text(((W-w)/2, H-104), bt, font=bf, fill=faint)

    buf = BytesIO()
    img.save(buf, "JPEG", quality=86, optimize=True)
    return buf.getvalue()

_ITEMS = None
def _items():
    global _ITEMS
    if _ITEMS is None:
        import json
        _ITEMS = {i["slug"]: i for i in json.load(open(os.path.join(ROOT,"history","catalog.json"), encoding="utf-8"))["items"]}
    return _ITEMS

def cover_for(slug, vars_, h1, kicker, sub):
    try:
        it = _items().get(slug)
        cat = it["cat"] if it else "city"
        return make_cover(slug, vars_, h1, kicker, sub, cat)
    except Exception:
        return None
