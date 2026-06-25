#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
epub_patch_css.py — 只重寫每個 dist/epub/*.epub 內的 OEBPS/style.css，
不重新 subset 字型（沿用既有 @font-face 區塊）。用於只改 CSS 的快速更新。
CSS 由 epub_build.build_css(該檔色票) 重建，與正式建置保持一致。
"""
import os, zipfile
import epub_build as eb

OUT = eb.OUT
HIST = eb.HIST

def patch(path):
    slug = os.path.splitext(os.path.basename(path))[0]
    vars_ = eb.parse_root_vars(eb.read(os.path.join(HIST, slug + ".html")))
    zin = zipfile.ZipFile(path)
    old_css = zin.read("OEBPS/style.css").decode()
    # 既有 css = [@font-face 區塊] + build_css(...) ，後者一定從 ":root{" 開始
    i = old_css.find(":root{")
    font_face = old_css[:i] if i > 0 else ""
    new_css = font_face + eb.build_css(vars_)
    if new_css == old_css:
        zin.close(); return False
    tmp = path + ".tmp"
    with zipfile.ZipFile(tmp, "w") as zout:
        zout.writestr("mimetype", "application/epub+zip", zipfile.ZIP_STORED)
        for it in zin.infolist():
            if it.filename == "mimetype":
                continue
            data = new_css.encode() if it.filename == "OEBPS/style.css" else zin.read(it.filename)
            ct = zipfile.ZIP_STORED if it.filename.startswith("OEBPS/fonts/") else zipfile.ZIP_DEFLATED
            zout.writestr(it.filename, data, ct)
    zin.close()
    os.replace(tmp, path)
    return True

def main():
    files = sorted(f for f in os.listdir(OUT) if f.endswith(".epub"))
    n = 0
    for f in files:
        if patch(os.path.join(OUT, f)):
            n += 1
    print(f"✓ 重寫 CSS：{n}/{len(files)} 個 EPUB")

if __name__ == "__main__":
    main()
