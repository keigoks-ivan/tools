#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
add_epub_buttons.py — 在每篇 /history/<slug>.html 的 backbar 插入「下載 EPUB」鈕。
只改有 EPUB 產物的篇章；idempotent（已插過就跳過）。連結指向 /history/epub/<slug>.epub。
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIST = os.path.join(ROOT, "history")
EPUB = os.path.join(ROOT, "dist", "epub")

MARK = "imq-epub-dl"
# EN/中 按鈕那行是插入錨點
ANCHOR = re.compile(r'(\n\s*)<button onclick="\(function\(\)\{var z=document\.documentElement')

def link_html(slug):
    return (
        f'<a href="/history/epub/{slug}.epub" download class="{MARK}" '
        'style="margin-left:auto;color:#cda551;text-decoration:none;display:inline-flex;'
        'align-items:center;gap:5px;border:1px solid #665a45;border-radius:4px;'
        'padding:3px 10px;font-size:11px">'
        '<span style="font-size:13px">⬇</span>'
        '<span data-imq-zh>下載 EPUB</span>'
        '<span data-imq-en style="display:none">Download EPUB</span></a>'
    )

def main():
    slugs = sorted(os.path.splitext(f)[0] for f in os.listdir(EPUB) if f.endswith(".epub"))
    done = skip = miss = 0
    for slug in slugs:
        path = os.path.join(HIST, slug + ".html")
        if not os.path.exists(path):
            miss += 1; continue
        with open(path, encoding="utf-8") as f:
            html = f.read()
        if MARK in html:
            skip += 1; continue
        if "imq-history-backbar" not in html or not ANCHOR.search(html):
            print(f"  ! {slug}: 無 backbar 錨點，跳過"); miss += 1; continue
        # EN 按鈕原本有 margin-left:auto，下載鈕也設了 → 第一個 auto 吃掉空間，兩鈕並靠右
        new = ANCHOR.sub(lambda m: m.group(1) + link_html(slug) + m.group(1)
                         + '<button onclick="(function(){var z=document.documentElement',
                         html, count=1)
        with open(path, "w", encoding="utf-8") as f:
            f.write(new)
        done += 1
    print(f"\n插入 {done}，已存在跳過 {skip}，缺檔/無錨點 {miss}")

if __name__ == "__main__":
    main()
