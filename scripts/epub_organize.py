#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
epub_organize.py — 依 catalog.json 把 Kobo Drive 匯入資料夾的 EPUB 分到分類子資料夾。
分類為單一真實來源（epub_deploy.py 也 import 這裡的 classify），確保派送與整理一致、idempotent。

  1_國家 Nations / 2_城市 Cities / 3_經濟金融 Economy & Finance
  4_文明主題 Civilization & Themes / 5_運動 Sports
"""
import os, json, shutil

ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRIVE = ("/Users/ivanchang/Library/CloudStorage/GoogleDrive-keigoks@gmail.com/"
         "我的雲端硬碟/Rakuten Kobo/html匯入")

F_NATION = "1_國家 Nations"
F_CITY   = "2_城市 Cities"
F_FIN    = "3_經濟金融 Economy & Finance"
F_CIV    = "4_文明主題 Civilization & Themes"
F_SPORT  = "5_運動 Sports"
F_OTHER  = "0_其他 Other"
ALL_FOLDERS = [F_NATION, F_CITY, F_FIN, F_CIV, F_SPORT, F_OTHER]

# theme 再細分：經濟金融 vs 文明主題
FINANCE = {
    "banking", "bond-market", "business-cycle", "gambling", "gold-epic",
    "inflation", "insurance", "land-property", "middleman-minorities",
    "money-trust", "oil-epic", "semiconductor-epic", "sovereign-default",
    "stock-market", "taxation", "the-economists", "the-investors", "war-business",
}
# catalog 沒列、但實際是城市的 EPUB
EXTRA_CITY = {"dubai", "istanbul", "mumbai", "shanghai", "venice"}

def load_items():
    c = json.load(open(os.path.join(ROOT, "history", "catalog.json"), encoding="utf-8"))
    return {i["slug"]: i for i in c["items"]}

def classify(slug, items):
    if slug in EXTRA_CITY:
        return F_CITY
    it = items.get(slug)
    if not it:
        return F_OTHER
    cat = it["cat"]
    if cat == "nation": return F_NATION
    if cat == "city":   return F_CITY
    if cat == "sport":  return F_SPORT
    if cat == "theme":  return F_FIN if slug in FINANCE else F_CIV
    return F_OTHER

def organize(base=DRIVE, verbose=True):
    if not os.path.isdir(base):
        print(f"⚠ 找不到資料夾：{base}"); return
    items = load_items()
    for f in ALL_FOLDERS:
        os.makedirs(os.path.join(base, f), exist_ok=True)
    # 收集 base 底下任何位置的 .epub
    found = []
    for dirpath, _dirs, files in os.walk(base):
        for fn in files:
            if fn.endswith(".epub"):
                found.append(os.path.join(dirpath, fn))
    from collections import Counter
    counts = Counter()
    for src in found:
        slug = os.path.splitext(os.path.basename(src))[0]
        folder = classify(slug, items)
        dst = os.path.join(base, folder, slug + ".epub")
        if os.path.abspath(src) != os.path.abspath(dst):
            shutil.move(src, dst)
        counts[folder] += 1
    # 移除空的 Other
    other = os.path.join(base, F_OTHER)
    if os.path.isdir(other) and not os.listdir(other):
        os.rmdir(other)
    if verbose:
        for f in ALL_FOLDERS:
            if counts.get(f):
                print(f"  {f}: {counts[f]}")
        print(f"✓ 共整理 {sum(counts.values())} 個 EPUB → {base}")

if __name__ == "__main__":
    organize()
