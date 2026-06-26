#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
setup_fonts.py — 在新機器上重建 EPUB pipeline 需要的字型 master。
dist/ 已 gitignore，所以字型不會隨 repo 帶過來；在新電腦跑這支即可。

  pip3 install --user fonttools brotli pillow
  python3 scripts/setup_fonts.py

會下載 Noto Serif TC 變體字型，實例化成 Regular(400) 與 Bold(700) 兩個 master，
存到 dist/fonts/，供 epub_build.py(subset 內嵌) 與 cover_styles.py(畫封面) 使用。
"""
import os, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "dist", "fonts")
VF = os.path.join(FONTS, "NotoSerifTC-VF.ttf")
URL = "https://github.com/google/fonts/raw/main/ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf"

def main():
    os.makedirs(FONTS, exist_ok=True)
    if not os.path.exists(VF):
        print("下載 Noto Serif TC 變體字型…")
        urllib.request.urlretrieve(URL, VF)
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    for w, name in [(400, "Regular"), (700, "Bold")]:
        f = TTFont(VF)
        instantiateVariableFont(f, {"wght": w}, inplace=True)
        out = os.path.join(FONTS, f"NotoSerifTC-{name}.ttf")
        f.save(out)
        print(f"✓ {name} ({w}) → {out}  {os.path.getsize(out)//1024//1024} MB")
    print("字型就緒。接著可跑：python3 scripts/epub_build.py --all --embed")

if __name__ == "__main__":
    main()
