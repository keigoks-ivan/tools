#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
epub_cover.py — 用 Pillow 為每本史詩 EPUB 畫一張有圖案的封面（JPEG）。
羊皮紙底 + 金色雙框 + 角飾 + 羅盤/同心圓徽記 + 中文書名（依各書色票），e-ink 也清楚。
"""
import os, re, html, math
from io import BytesIO

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_BOLD = os.path.join(ROOT, "dist", "fonts", "NotoSerifTC-Bold.ttf")
FONT_REG  = os.path.join(ROOT, "dist", "fonts", "NotoSerifTC-Regular.ttf")

W, H = 1200, 1800
_font_cache = {}

def _font(path, size):
    key = (path, size)
    if key not in _font_cache:
        from PIL import ImageFont
        _font_cache[key] = ImageFont.truetype(path, size)
    return _font_cache[key]

def _rgb(h, default="#000000"):
    h = (h or default).lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def _wrap(text, font, max_w, draw):
    lines, cur = [], ""
    for ch in text:
        if ch == "\n":
            lines.append(cur); cur = ""; continue
        if draw.textlength(cur + ch, font=font) <= max_w or not cur:
            cur += ch
        else:
            lines.append(cur); cur = ch
    if cur:
        lines.append(cur)
    return lines

def _title_lines(h1):
    t = re.sub(r"<br\s*/?>", "\n", h1 or "")
    t = re.sub(r"<[^>]+>", "", t)
    return [l.strip() for l in html.unescape(t).strip().split("\n") if l.strip()]

def make_cover(vars_, h1, kicker, sub, cat_label):
    from PIL import Image, ImageDraw
    parch = _rgb(vars_.get("parchment"), "#f4ecdc")
    ink   = _rgb(vars_.get("ink"), "#1a1410")
    seaD  = _rgb(vars_.get("sea-deep"), "#0f2330")
    gold  = _rgb(vars_.get("gold"), "#b08d34")
    goldB = _rgb(vars_.get("gold-bright"), "#d4af5a")
    rust  = _rgb(vars_.get("rust"), "#8c3a21")
    faint = _rgb(vars_.get("faint"), "#6b5d48")
    line  = _rgb(vars_.get("line"), "#c9b893")

    img = Image.new("RGB", (W, H), parch)
    d = ImageDraw.Draw(img, "RGBA")

    # 角落淡淡的暈影，讓羊皮紙有層次
    for i in range(80):
        a = int(10 * (1 - i / 80))
        d.rectangle([i, i, W - i, H - i], outline=(seaD[0], seaD[1], seaD[2], a))

    # 雙框
    d.rectangle([46, 46, W - 46, H - 46], outline=gold, width=4)
    d.rectangle([66, 66, W - 66, H - 66], outline=gold + (150,), width=1)
    # 角飾菱形
    for cx, cy in [(46, 46), (W - 46, 46), (46, H - 46), (W - 46, H - 46)]:
        d.polygon([(cx, cy - 13), (cx + 13, cy), (cx, cy + 13), (cx - 13, cy)], fill=gold)

    # 羅盤 / 同心圓徽記（主圖案）
    ex, ey = W // 2, int(H * 0.30)
    for r in (250, 190, 120):
        d.ellipse([ex - r, ey - r, ex + r, ey + r], outline=goldB + (90,), width=3)
    for ang in range(0, 360, 30):
        a = math.radians(ang)
        d.line([ex + math.cos(a) * 120, ey + math.sin(a) * 120,
                ex + math.cos(a) * 250, ey + math.sin(a) * 250],
               fill=goldB + (60,), width=2)
    # 長軸十字 + 中央菱形
    d.line([ex, ey - 270, ex, ey + 270], fill=goldB + (45,), width=1)
    d.line([ex - 270, ey, ex + 270, ey], fill=goldB + (45,), width=1)
    d.polygon([(ex, ey - 60), (ex + 16, ey), (ex, ey + 60), (ex - 16, ey)], fill=rust + (180,))

    margin = 150
    usable = W - 2 * margin

    # kicker（英文書系名，置中，必要時縮小）
    if kicker:
        ks = 34
        kf = _font(FONT_REG, ks)
        kt = re.sub(r"<[^>]+>", "", kicker)
        kt = html.unescape(kt).strip().upper()
        while d.textlength(kt, font=kf) > usable and ks > 18:
            ks -= 2; kf = _font(FONT_REG, ks)
        w = d.textlength(kt, font=kf)
        d.text(((W - w) / 2, H * 0.135), kt, font=kf, fill=gold)

    # 標題（用 h1 的換行；過寬再自動斷行；行數多就縮字級）
    pref = _title_lines(h1)
    for size in range(96, 50, -4):
        tf = _font(FONT_BOLD, size)
        lines = []
        for pl in pref:
            lines += _wrap(pl, tf, usable, d)
        if len(lines) <= 5 and all(d.textlength(l, font=tf) <= usable for l in lines):
            break
    lh = int(size * 1.32)
    block_h = lh * len(lines)
    ty = int(H * 0.60) - block_h // 2
    for l in lines:
        w = d.textlength(l, font=tf)
        d.text(((W - w) / 2, ty), l, font=tf, fill=seaD)
        ty += lh

    # 標題下短線
    ry = ty + 18
    d.line([W // 2 - 70, ry, W // 2 + 70, ry], fill=gold, width=3)

    # 副標（中文，去標籤、取前段、最多兩行）
    if sub:
        st = re.sub(r"<br\s*/?>", " ", sub)
        st = html.unescape(re.sub(r"<[^>]+>", "", st)).strip()
        sf = _font(FONT_REG, 32)
        alll = _wrap(st, sf, usable, d)
        slines = alll[:2]
        if len(alll) > 2 and slines:        # 被截斷 → 收尾標點換成刪節號
            slines[-1] = slines[-1].rstrip("，、：；。 —-") + "…"
        sy = ry + 40
        for l in slines:
            w = d.textlength(l, font=sf)
            d.text(((W - w) / 2, sy), l, font=sf, fill=faint)
            sy += 46

    # 底部分類標 + 品牌
    if cat_label:
        cf = _font(FONT_REG, 28)
        cl = cat_label.upper()
        w = d.textlength(cl, font=cf)
        d.line([W // 2 - w / 2 - 40, H * 0.885, W // 2 - w / 2 - 16, H * 0.885], fill=gold, width=2)
        d.line([W // 2 + w / 2 + 16, H * 0.885, W // 2 + w / 2 + 40, H * 0.885], fill=gold, width=2)
        d.text(((W - w) / 2, H * 0.885 - 18), cl, font=cf, fill=gold)
    bf = _font(FONT_REG, 24)
    bt = "投資 · 歷史長卷 · INVESTMQUEST"
    w = d.textlength(bt, font=bf)
    d.text(((W - w) / 2, H * 0.915), bt, font=bf, fill=faint)

    buf = BytesIO()
    img.save(buf, "JPEG", quality=86, optimize=True)
    return buf.getvalue()

# 分類標籤（給封面用）
_CAT_LABEL = {
    "nation": "國家史詩 · Nations",
    "city":   "城市史詩 · Cities",
    "theme":  "主題史詩 · Themes",
    "sport":  "運動史 · Sports",
}
def cat_label_for(slug, items):
    it = items.get(slug)
    if it:
        return _CAT_LABEL.get(it["cat"], "歷史長卷")
    return "城市史詩 · Cities"   # catalog 未列的城市

_ITEMS = None
def _items():
    global _ITEMS
    if _ITEMS is None:
        import json
        path = os.path.join(ROOT, "history", "catalog.json")
        _ITEMS = {i["slug"]: i for i in json.load(open(path, encoding="utf-8"))["items"]}
    return _ITEMS

def cover_for(slug, vars_, h1, kicker, sub):
    """回傳該書封面 JPEG bytes（Pillow 不可用時回 None，呼叫端可優雅略過）。"""
    try:
        return make_cover(vars_, h1, kicker, sub, cat_label_for(slug, _items()))
    except Exception:
        return None
