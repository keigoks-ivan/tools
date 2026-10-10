#!/usr/bin/env python3
"""Coverage report from camps/data/*.json -> camps/reports/coverage-<date>.md.

Counts are of dated sessions only. A week counts as covered for a city when a
confirmed_target_year session with confidence high/medium overlaps it; low
confidence (aggregator/agent only) sessions are shown separately and do not
close a gap.
"""
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
TODAY = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()

CITIES = ["Kuala Lumpur", "Petaling Jaya", "Subang Jaya", "Puchong", "Shah Alam", "Selangor-other",
          "Negeri Sembilan", "Penang", "Johor Bahru", "Kota Kinabalu", "Perak", "Melaka",
          "Langkawi", "Kuching", "Bangkok", "Chiang Mai", "other", "unknown"]
KL_METRO = {"Kuala Lumpur", "Petaling Jaya", "Subang Jaya", "Puchong", "Shah Alam", "Selangor-other"}
WINDOWS = {
    "寒假 2026/27": (date(2026, 11, 23), date(2027, 2, 28)),
    "暑假 2027": (date(2027, 6, 7), date(2027, 8, 29)),
}
ACCEPT = {"start": date(2027, 1, 17), "end": date(2027, 2, 8), "ages": (6, 10),
          "areas": [("大吉隆坡", KL_METRO), ("曼谷", {"Bangkok"}), ("清邁", {"Chiang Mai"})]}


def load(name):
    return json.load(open(os.path.join(DATA, f"{name}.json")))


def d(s):
    return date.fromisoformat(s) if s else None


def mondays(a, b):
    m = a - timedelta(days=a.weekday())
    while m <= b:
        yield m
        m += timedelta(days=7)


def main():
    providers = {p["id"]: p for p in load("providers")}
    programs = {p["id"]: p for p in load("programs")}
    locations = {l["id"]: l for l in load("locations")}
    sessions = load("sessions")
    conflicts = load("conflicts")
    gaps = load("gaps")

    def cities_of(s):
        ids = [s["location_id"]] if s.get("location_id") else programs[s["program_id"]]["location_ids"]
        out = {locations[i]["city"] for i in ids if i in locations}
        return out or {"unknown"}

    def overlaps(s, a, b):
        # start-only sessions (rolling weekly starts) count for their start week only
        sa = d(s["start_date"])
        sb = d(s["end_date"]) or (sa + timedelta(days=4) if sa else None)
        return sa and sb and sa <= b and sb >= a

    out = [f"# 營隊資料覆蓋率報告（{TODAY}）", ""]

    # --- totals
    ds = Counter(s["date_status"] for s in sessions)
    cf = Counter(s["confidence"] for s in sessions)
    out += ["## 總數", "",
            f"- 機構 {len(providers)} 家、營隊課程 {len(programs)} 個、上課地點 {len(locations)} 處、梯次 {len(sessions)} 筆。",
            f"- 梯次日期狀態：目標年已公布 {ds['confirmed_target_year']}、別的年份 {ds['confirmed_other_year']}、"
            f"依往年推估 {ds['pattern_estimated']}、查不到 {ds['unknown']}。",
            f"- 可信度：高 {cf['high']}、中 {cf['medium']}、低 {cf['low']}。",
            "- 下表只算有具體日期、且屬目標年的梯次。格子寫「a」＝官方或中信心以上的梯次數；"
            "「a＋b」的 b ＝只有聚合站或代理商來源的梯次，不算數。大吉隆坡區某週 a 為 0 時標「空窗」。", ""]

    # --- city x week
    for title, (a, b) in WINDOWS.items():
        weeks = list(mondays(a, b))
        grid = defaultdict(lambda: [0, 0])
        for s in sessions:
            if s["date_status"] != "confirmed_target_year":
                continue
            for w in weeks:
                if overlaps(s, w, w + timedelta(days=4)):
                    for c in cities_of(s):
                        grid[(c, w)][0 if s["confidence"] in ("high", "medium") else 1] += 1
        used = [c for c in CITIES if any(grid[(c, w)] != [0, 0] for w in weeks)] or ["Kuala Lumpur"]
        if "Kuala Lumpur" not in used:
            used.insert(0, "Kuala Lumpur")
        out += [f"## {title}：城市 × 週（週一起算）", "",
                "| 週 | " + " | ".join(used) + " |", "|---|" + "---|" * len(used)]
        for w in weeks:
            cells = []
            for c in used:
                hi, lo = grid[(c, w)]
                cell = f"{hi}＋{lo}" if lo else (str(hi) if hi else "·")
                if c in KL_METRO and c == "Kuala Lumpur":
                    metro_hi = sum(grid[(m, w)][0] for m in KL_METRO)
                    if metro_hi == 0:
                        cell += " 空窗"
                cells.append(cell)
            out.append(f"| {w:%m/%d} | " + " | ".join(cells) + " |")
        out.append("")

    # --- reference and estimates by city
    ref = defaultdict(Counter)
    for s in sessions:
        sa = d(s["start_date"])
        for c in cities_of(s):
            if s["date_status"] == "confirmed_other_year" and sa and sa.year == 2026:
                if sa.month in (1, 2):
                    ref[c]["2026 年 1–2 月實際"] += 1
                elif sa.month in (6, 7, 8):
                    ref[c]["2026 年 6–8 月實際"] += 1
            if s["date_status"] == "pattern_estimated":
                ref[c]["推估：" + {"winter_2026_27": "寒假", "summer_2027": "暑假"}.get(s["season"], "其他")] += 1
        if s["date_status"] == "unknown":
            for c in cities_of(s):
                ref[c]["查不到"] += 1
    cols = ["2026 年 1–2 月實際", "2026 年 6–8 月實際", "推估：寒假", "推估：暑假", "查不到"]
    out += ["## 參考梯次與推估（依城市）", "",
            "2026 年辦過的梯次是推估 2027 的依據；推估梯次沒有日期，所以不進上面的週表。", "",
            "| 城市 | " + " | ".join(cols) + " |", "|---|" + "---|" * len(cols)]
    for c in CITIES:
        if ref[c]:
            out.append(f"| {c} | " + " | ".join(str(ref[c][k] or "·") for k in cols) + " |")
    out.append("")

    # --- acceptance case, once per area
    lo_age, hi_age = ACCEPT["ages"]
    for area_zh, area in ACCEPT["areas"]:
        out += [f"## 驗收案例：{area_zh}，{ACCEPT['start']} 至 {ACCEPT['end']}，{lo_age} 歲＋{hi_age} 歲", ""]
        for w in mondays(ACCEPT["start"], ACCEPT["end"]):
            we = w + timedelta(days=4)
            if we < ACCEPT["start"]:
                continue
            rows = []
            for s in sessions:
                if s["date_status"] not in ("confirmed_target_year", "confirmed_other_year"):
                    continue
                if not (cities_of(s) & area):
                    continue
                p = programs[s["program_id"]]
                fits = [k for k in ACCEPT["ages"]
                        if (p["age_min"] is None or p["age_min"] <= k) and (p["age_max"] is None or k <= p["age_max"])]
                if not fits:
                    continue
                if s["date_status"] == "confirmed_target_year" and overlaps(s, w, we):
                    loc = locations.get(s.get("location_id") or "", {}).get("name", "地點未定")
                    rows.append(f"  - {p['name']} @ {loc}（{s['start_date']}～{s['end_date'] or '滾動開課'}，可信度 {s['confidence']}，"
                                f"適合 {'、'.join(map(str, fits))} 歲）")
            official = [r for r in rows if "可信度 low" not in r]
            out.append(f"- {w:%m/%d} 那週：" + ("**空窗**（沒有官方或中信心以上的梯次）" if not official else f"{len(official)} 個官方梯次"))
            out += rows
        est = sorted({programs[s["program_id"]]["name"] for s in sessions
                      if s["date_status"] == "pattern_estimated" and s["season"] == "winter_2026_27"
                      and cities_of(s) & area})
        out += [f"- 同區間還有 {len(est)} 個課程只有推估（日期未公布）：" + "、".join(est), ""]

    # --- providers without 2027 dates
    has_target = {programs[s["program_id"]]["provider_id"] for s in sessions if s["date_status"] == "confirmed_target_year"}
    latest = defaultdict(str)
    for s in sessions:
        pid = programs[s["program_id"]]["provider_id"]
        if s["start_date"] and s["start_date"] > latest[pid]:
            latest[pid] = s["start_date"]
    missing = sorted(set(providers) - has_target)
    out += [f"## 查不到 2026/27 寒假或 2027 日期的機構（{len(missing)} 家）", "",
            "| 機構 | 最近一次有日期的梯次 |", "|---|---|"]
    for pid in missing:
        out.append(f"| {providers[pid]['name_en']} | {latest[pid] or '無'} |")
    out.append("")

    # --- conflicts
    out += [f"## 互相矛盾的資料（{len(conflicts)} 筆）", "", "| 對象 | 欄位 | 說明 |", "|---|---|---|"]
    for c in conflicts:
        note = (c.get("note") or "").replace("|", "／").replace("\n", " ")
        out.append(f"| {c['entity_id']} | {c['field']} | {note[:80]} |")
    out.append("")

    # --- gaps
    nf = [g for g in gaps if g["kind"] == "not_found"]
    leads = [g for g in gaps if g["kind"] == "lead"]
    out += ["## 查不到的頁面與未追的線索", "",
            f"- 查不到：{len(nf)} 筆（官網被擋、JavaScript 頁面讀不到、或沒公布）。",
            f"- 線索：{len(leads)} 筆（聚合站或學校頁看到、尚未回官方確認）。", "",
            "| 名稱 | 缺什麼 |", "|---|---|"]
    for g in nf:
        out.append(f"| {g.get('name', '')} | {(g.get('what_missing') or '').replace('|', '／')[:80]} |")
    out.append("")

    os.makedirs(os.path.join(ROOT, "reports"), exist_ok=True)
    path = os.path.join(ROOT, "reports", f"coverage-{TODAY}.md")
    open(path, "w").write("\n".join(out))
    print(path)


if __name__ == "__main__":
    main()
