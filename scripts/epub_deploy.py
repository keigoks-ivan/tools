#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
epub_deploy.py — 把建好的 EPUB 派送到三處：
  1) history/epub/<slug>.epub      ← 網站對外服務（Cloudflare Pages）
  2) history/epub/index.json       ← 總覽頁 index.html 用來判斷哪些篇有 EPUB
  3) Kobo Google Drive 匯入資料夾   ← 直接同步到 Kobo
驗證每個 EPUB 為合規 XML 後才派送。
"""
import os, sys, json, shutil, zipfile
import xml.dom.minidom as M

ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EPUB  = os.path.join(ROOT, "dist", "epub")
SITE  = os.path.join(ROOT, "history", "epub")
DRIVE = ("/Users/ivanchang/Library/CloudStorage/GoogleDrive-keigoks@gmail.com/"
         "我的雲端硬碟/Rakuten Kobo/html匯入")

def validate(path):
    z = zipfile.ZipFile(path)
    names = z.namelist()
    if names[0] != "mimetype" or z.getinfo("mimetype").compress_type != 0:
        return "mimetype 不在首位或被壓縮"
    for n in names:
        if n.endswith((".xhtml", ".opf", ".xml")):
            try:
                M.parseString(z.read(n))
            except Exception as e:
                return f"{n}: {e}"
    return None

def main():
    slugs = sorted(os.path.splitext(f)[0] for f in os.listdir(EPUB) if f.endswith(".epub"))
    bad = []
    for s in slugs:
        err = validate(os.path.join(EPUB, s + ".epub"))
        if err:
            bad.append((s, err))
    if bad:
        print("✗ 有不合規 EPUB，停止派送：")
        for s, e in bad:
            print("  ", s, "::", e)
        sys.exit(1)
    print(f"✓ {len(slugs)} 個 EPUB 全部通過 XML 驗證")

    # 1) 網站
    os.makedirs(SITE, exist_ok=True)
    for s in slugs:
        shutil.copy2(os.path.join(EPUB, s + ".epub"), os.path.join(SITE, s + ".epub"))
    # 2) index.json
    with open(os.path.join(SITE, "index.json"), "w", encoding="utf-8") as f:
        json.dump(slugs, f, ensure_ascii=False, separators=(",", ":"))
    print(f"✓ 派送到網站 {SITE}（含 index.json，{len(slugs)} 篇）")

    # 3) Kobo Drive（直接放進分類子資料夾，分類邏輯與 epub_organize 共用）
    if os.path.isdir(DRIVE):
        import epub_organize as org
        items = org.load_items()
        for f in org.ALL_FOLDERS:
            os.makedirs(os.path.join(DRIVE, f), exist_ok=True)
        for s in slugs:
            folder = org.classify(s, items)
            shutil.copy2(os.path.join(EPUB, s + ".epub"),
                         os.path.join(DRIVE, folder, s + ".epub"))
        org.organize(DRIVE, verbose=False)   # 收尾：清掉任何位置不對的殘留
        print(f"✓ 同步到 Kobo Drive（已分類）：{DRIVE}（{len(slugs)} 篇）")
    else:
        print(f"⚠ 找不到 Kobo Drive 資料夾，略過：{DRIVE}")

if __name__ == "__main__":
    main()
