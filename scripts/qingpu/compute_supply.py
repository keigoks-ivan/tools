# -*- coding: utf-8 -*-
"""
「青埔未來供給」：官方登記為準的建案總表（層棟戶數、已售/未售、建照/登記日期、
坪數結構、預售單價、銷售狀態）、交屋時間表（含依坪數帶拆分）、建商餘屋（銷售中/
停售）、591在售存量矩陣（社區×屋齡×坪數）、交屋後釋出率（全部建案）、新推案、
591新案清單對照。全部在這裡算好寫進 data/supply_demand.json，網頁只負責顯示、
不現場算。

依賴 data/deals.json（fetch_lvr.py）、data/units.json（fetch_591.py）、
data/buildcase.json（fetch_buildcase.py），三支都要先跑過。591新案清單是額外
對外呼叫，來源失敗不擋掉其他區塊。

用法：
    python3 compute_supply.py
"""
import datetime
import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

import config
from fetch_buildcase import normalize_project_name as _normalize_for_match

TIMEOUT = 30


def log(msg):
    print(f"[compute_supply] {msg}", file=sys.stderr)


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default if default is not None else {}


def percentile(sorted_vals, p):
    if not sorted_vals:
        return None
    idx = (len(sorted_vals) - 1) * p
    lo = int(idx)
    hi = min(lo + 1, len(sorted_vals) - 1)
    if lo == hi:
        return sorted_vals[lo]
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (idx - lo)


def quarter_index(date_iso):
    """把日期轉成「季別線性索引」，方便quarter之間做加減法。"""
    y, m, _ = date_iso.split("-")
    y, m = int(y), int(m)
    q = (m - 1) // 3
    return y * 4 + q


def quarter_label(qidx):
    y, q = divmod(qidx, 4)
    return f"{y}Q{q + 1}"


def roc_to_iso(s):
    """ROC 7碼日期字串（yyyMMDD）轉 ISO 日期字串，抓不到回傳 None。"""
    if not s or len(s) != 7 or not s.isdigit():
        return None
    y, m, d = int(s[:3]) + 1911, int(s[3:5]), int(s[5:7])
    try:
        return datetime.date(y, m, d).isoformat()
    except ValueError:
        return None


def earliest_roc_date(text):
    """從備查「銷售期間」文字抓最早的民國日期（1100419、110.08.13、110年10月13日、110/07/01 等寫法），回傳 7 碼整數。"""
    if not text:
        return None
    found = [int(m) for m in re.findall(r"(?<!\d)(1\d{6})(?!\d)", text)]
    for y, mth, d in re.findall(r"(?<!\d)(1\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})", text):
        found.append(int(y) * 10000 + int(mth) * 100 + int(d))
    return min(found) if found else None


def median_date(date_strs):
    if not date_strs:
        return None
    s = sorted(date_strs)
    return s[len(s) // 2]


# ---------------------------------------------------------------------------
# 591 新案清單（只是對照用，不深度整合）
# ---------------------------------------------------------------------------
def fetch_591_newhouse(keyword="青埔"):
    items = []
    page = 1
    while page <= 20:
        qs = urllib.parse.urlencode({"rid": 6, "keyword": keyword, "page": page})
        url = f"https://newhouse.591.com.tw/home/housing/search?{qs}"
        req = urllib.request.Request(url, headers={"User-Agent": config.HOUSE_591_USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            log(f"591 newhouse page {page} 失敗，停止：{e}")
            break
        d = data.get("data") or {}
        page_items = d.get("items") or []
        if not page_items:
            break
        for it in page_items:
            items.append({
                "build_name": it.get("build_name"),
                "addr_number": it.get("addr_number"),
                "status": it.get("status"),
                "price": it.get("price"),
                "open_sell_year_month": it.get("open_sell_year_month"),
                "sale_status": it.get("sale_status"),
            })
        total_page = int(d.get("total_page") or 1)
        if page >= total_page:
            break
        page += 1
        time.sleep(0.5)
    return items


def match_project_name(build_name, project_names):
    if not build_name:
        return None
    bn = re.sub(r"\s+", "", build_name)
    for p in project_names:
        pn = re.sub(r"\s+", "", p)
        if pn and (pn in bn or bn in pn):
            return p
    return None


# ---------------------------------------------------------------------------
# 月度快照（跟 compute_price_outlook.py 的 listing_history.jsonl 用同一種寫法，
# 但這裡是「同一個月重跑覆蓋，不是同一天」——CI 改成每月一次之後，用日期當 key
# 沒有意義，同一個月內不管跑幾次都只留最後一筆）。
# ---------------------------------------------------------------------------
def append_monthly_snapshot(path, month_key, row):
    history = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if r.get("month") != month_key:
                    history.append(r)
    except OSError:
        pass
    history.append(row)
    history.sort(key=lambda r: r["month"])
    with open(path, "w", encoding="utf-8") as f:
        for r in history:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return history


def load_monthly_history(path):
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        pass
    rows.sort(key=lambda r: r["month"])
    return rows


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    today = datetime.date.today()
    this_month = today.strftime("%Y-%m")
    current_qidx = quarter_index(today.isoformat())

    deals = load_json(config.DEALS_JSON, {}).get("deals", [])
    units = load_json(config.UNITS_JSON, {}).get("units", [])
    buildcase = load_json(config.BUILDCASE_JSON, {}).get("cases", [])
    if not deals:
        log("讀不到 data/deals.json，中止")
        return 1
    if not buildcase:
        log("讀不到 data/buildcase.json，建案總表/交屋時間表無法用官方登記資料，先跳過本次供給計算")
        return 1

    # -----------------------------------------------------------------
    # 坪數結構（青埔全區備援用）：所有預售筆數的坪數分佈，供樣本不足10筆的建案退回用。
    # -----------------------------------------------------------------
    SIZE_KEYS = ["small", "mid", "large"]
    presale_all = [d for d in deals if d.get("deal_kind") == "presale" and d.get("project_name")]
    by_project = defaultdict(list)
    for d in presale_all:
        by_project[d["project_name"]].append(d)

    qingpu_size_counts = Counter(config.size_bucket(d["area_ping"]) for d in presale_all if d.get("area_ping") is not None)
    qingpu_size_total = sum(qingpu_size_counts.values())
    qingpu_size_mix_fallback = {
        k: round(qingpu_size_counts.get(k, 0) / qingpu_size_total, 4) if qingpu_size_total else None for k in SIZE_KEYS
    }

    def size_mix_for(rows):
        n = len(rows)
        if n < config.OUTLOOK_PARAMS["area_mix_min_n"]:
            return {**qingpu_size_mix_fallback, "n": n, "source": "qingpu_fallback"}
        counts = Counter(config.size_bucket(d["area_ping"]) for d in rows if d.get("area_ping") is not None)
        total = sum(counts.values()) or 1
        mix = {k: round(counts.get(k, 0) / total, 4) for k in SIZE_KEYS}
        mix["n"] = n
        mix["source"] = "project"
        return mix

    # 同一建案在實價登錄可能有好幾種寫法（例如「禾林 RICH ONE 3」「禾林RICH ONE3」只差空格），
    # 正規化後相同的合併成一個建案、成交筆數加總；代表名稱取筆數最多的寫法（同數取字典序），
    # 結果不受集合走訪順序影響。
    variants = defaultdict(list)
    for name in by_project:
        variants[_normalize_for_match(name)].append(name)
    merged = {}
    b_name_by_norm = {}
    for norm, names in variants.items():
        canonical = sorted(names, key=lambda n: (-len(by_project[n]), n))[0]
        merged[canonical] = [d for n in sorted(names) for d in by_project[n]]
        b_name_by_norm[norm] = canonical
    by_project = merged
    b_project_names = set(by_project.keys())

    # 官方登記日期→建照核發日期的中位落後天數，只用「已完成」的備查案例算，
    # 用來推估還沒登記的建案何時會交屋。
    lags = []
    for c in buildcase:
        if c["is_completed"] and c.get("permit_date_roc") and c.get("first_registration_date_roc"):
            p = roc_to_iso(c["permit_date_roc"])
            r = roc_to_iso(c["first_registration_date_roc"])
            if p and r:
                lags.append((datetime.date.fromisoformat(r) - datetime.date.fromisoformat(p)).days)
    lag_median_days = statistics.median(lags) if lags else None
    lag_n = len(lags)
    log(f"buildcase permit->registration lag: n={lag_n} median_days={lag_median_days}")

    # -----------------------------------------------------------------
    # (a) 建案總表：官方登記資料為主（層棟戶數，不是只算賣掉的戶數），加上坪數結構、
    # 預售單價分布、樓層數（取B檔多數決）、還在銷售中/停售（c）。
    # -----------------------------------------------------------------
    HANDOVER_SIGNAL_THRESHOLD = 20  # 備查說沒登記，但已經看到這麼多筆過戶訊號，視為「可能已交屋、備查資料沒更新」
    still_selling_cutoff = (today - datetime.timedelta(days=30 * config.STILL_SELLING_WINDOW_MONTHS)).isoformat()

    projects = {}
    for c in buildcase:
        matched_b = b_name_by_norm.get(c["project_name_norm"])
        b_rows = by_project.get(matched_b, []) if matched_b else []
        sold = len(b_rows)
        households = c["households"] if c["households"] is not None else (sold or None)
        unsold = max(households - sold, 0) if households is not None else None
        # 實價登錄預售檔（B）2021-07 才開始，更早開賣的建案「已售」會少算、「未售」會高估，
        # 這種建案未售戶數標為不明（None），不進餘屋合計與未售釋出。
        sales_start_roc = earliest_roc_date(c.get("selling_period"))
        presale_before_b = sales_start_roc is not None and sales_start_roc < 1100701
        if presale_before_b:
            unsold = None

        handover_sig_dates = sorted(
            sig["completion_date"] for r in b_rows for sig in (r.get("handover_signals") or []) if sig.get("completion_date")
        )

        conflict = None
        if c["is_completed"]:
            handover_date = roc_to_iso(c["first_registration_date_roc"])
            status = "actual"
        elif len(handover_sig_dates) >= HANDOVER_SIGNAL_THRESHOLD:
            handover_date = median_date(handover_sig_dates)
            status = "actual_probable"
            conflict = f"備查資料顯示尚未辦第1次登記，但已有 {len(handover_sig_dates)} 筆過戶訊號，備查資料可能沒更新"
        elif c.get("permit_date_roc") and lag_median_days is not None:
            permit_iso = roc_to_iso(c["permit_date_roc"])
            est = datetime.date.fromisoformat(permit_iso) + datetime.timedelta(days=lag_median_days)
            handover_date = est.isoformat()
            status = "estimated"
            if est < today:
                status = "estimated_overdue"
        else:
            handover_date = None
            status = "unknown"

        # 逾期還沒交屋的（推算交屋時間已過、官方仍未登記第1次登記），交屋時間點本來就
        # 不確定，不能全部疊到單一一季：戶數平均攤到「下一季」起連續 OVERDUE_SPREAD_QUARTERS
        # 季，每季 1/N。其餘狀態維持單一交屋季（權重 1.0）。
        handover_schedule = []
        handover_month = None
        if handover_date:
            hd_qidx = quarter_index(handover_date)
            if status == "estimated_overdue":
                spread_n = config.OVERDUE_SPREAD_QUARTERS
                start_qidx = current_qidx + 1
                handover_schedule = [{"qidx": start_qidx + k, "weight": 1.0 / spread_n} for k in range(spread_n)]
                handover_month = f"{quarter_label(start_qidx)}~{quarter_label(start_qidx + spread_n - 1)}"
            else:
                handover_schedule = [{"qidx": hd_qidx, "weight": 1.0}]
                handover_month = quarter_label(hd_qidx)

        roads = Counter(r["road"] for r in b_rows if r.get("road"))
        floors_ct = Counter(r["total_floors"] for r in b_rows if r.get("total_floors"))
        total_floors = floors_ct.most_common(1)[0][0] if floors_ct else None

        prices = sorted(
            r["unit_price_wan_ping_precise"] for r in b_rows
            if r.get("unit_price_wan_ping_precise") is not None and not r.get("special") and not r.get("car_lumped")
        )
        first_contract = min((r["date"] for r in b_rows), default=None)
        last_contract = max((r["date"] for r in b_rows), default=None)

        if unsold is None:
            sell_status = "unknown"
        elif unsold <= 0:
            sell_status = "sold_out"
        elif last_contract is not None and last_contract >= still_selling_cutoff:
            sell_status = "selling"
        else:
            sell_status = "stalled"

        # 備查資料的「編號」欄大量空白（51 筆裡 36 筆是空的），不能當 key 用，
        # 會把不相關的建案疊在一起。project_name_norm 在青埔篩選後的案例裡確認是唯一值，改用它。
        projects[c["project_name_norm"]] = {
            "project_name": matched_b or c["project_name"],
            "buildcase_name": c["project_name"],
            "matched_b_project": matched_b,
            "builder": c.get("builder") or None,
            "households": households,
            "units_sold": sold,
            "units_unsold": unsold,
            "total_floors": total_floors,
            "size_mix": size_mix_for(b_rows),
            "presale_price": {
                "n": len(prices),
                "median": round(statistics.median(prices), 2) if prices else None,
                "p25": round(percentile(prices, 0.25), 2) if prices else None,
                "p75": round(percentile(prices, 0.75), 2) if prices else None,
            },
            "declare_date_roc": c.get("declare_date_roc"),
            "selling_period": c.get("selling_period"),
            "permit_date_roc": c.get("permit_date_roc"),
            "first_registration_date_roc": c.get("first_registration_date_roc"),
            "sell_status": sell_status,  # selling | stalled | sold_out
            "handover_status": status,  # actual | actual_probable | estimated | estimated_overdue | unknown
            "handover_date": handover_date,
            "handover_quarter": handover_month,
            "handover_schedule": handover_schedule,  # [{"qidx":, "weight":}, ...]，逾期案件平均攤到未來4季
            "conflict_note": conflict,
            "road": (roads.most_common(1)[0][0] if roads else None) or c.get("location"),
            "first_contract": first_contract,
            "last_contract": last_contract,
        }

    matched_n = sum(1 for p in projects.values() if p["matched_b_project"])
    log(f"buildcase n={len(buildcase)}，對到實價登錄B檔建案 {matched_n} 個")

    # -----------------------------------------------------------------
    # (b) 未來供給按季 × 坪數帶：已售戶×交屋後釋出率（一次性，在交屋季）＋
    # 未售戶×(1/UNSOLD_RELEASE_QUARTERS)（分4季線性釋出），各自再乘上該建案自己的
    # 坪數結構（樣本不足退回青埔全區）。逾期建案（estimated_overdue）影響到的季別
    # 額外標記，供前端網格圖加陰影。
    # -----------------------------------------------------------------
    cutoff_12mo = (today - datetime.timedelta(days=365)).isoformat()
    units_by_community = defaultdict(list)
    for u in units:
        if u.get("community_name"):
            units_by_community[u["community_name"]].append(u)

    release_rows_12mo = []
    release_rows_all = []
    for p in projects.values():
        if p["handover_status"] in ("actual", "actual_probable") and p["handover_date"] and p["units_sold"]:
            active_591 = len(units_by_community.get(p["project_name"], []))
            rate = active_591 / p["units_sold"] if p["units_sold"] else None
            row = {
                "project_name": p["project_name"],
                "units_sold": p["units_sold"],
                "active_591_units": active_591,
                "release_rate": round(rate, 4) if rate is not None else None,
                "handover_date": p["handover_date"],
            }
            release_rows_all.append(row)
            if p["handover_date"] >= cutoff_12mo:
                release_rows_12mo.append(row)
    release_rates_sorted = sorted(r["release_rate"] for r in release_rows_12mo if r["release_rate"] is not None)
    release_rate_median = statistics.median(release_rates_sorted) if release_rates_sorted else None
    release_rate_p25 = percentile(release_rates_sorted, 0.25) if release_rates_sorted else None
    release_rate_p75 = percentile(release_rates_sorted, 0.75) if release_rates_sorted else None
    log(
        f"release rate (近12個月交屋建案): n={len(release_rates_sorted)} median={release_rate_median} "
        f"p25={release_rate_p25} p75={release_rate_p75}；全部有交屋日的建案共 {len(release_rows_all)} 個"
    )

    unsold_q = config.UNSOLD_RELEASE_QUARTERS
    overdue_qidx_set = set()
    quarter_new_supply = defaultdict(lambda: {"sold_release_mid": 0.0, "sold_release_lo": 0.0, "sold_release_hi": 0.0, "unsold_release": 0.0})
    quarter_supply_by_size = defaultdict(lambda: {k: {"sold": 0.0, "unsold": 0.0} for k in SIZE_KEYS})
    for p in projects.values():
        mix = {k: (p["size_mix"].get(k) or 0.0) for k in SIZE_KEYS}
        for entry in p.get("handover_schedule") or []:
            hd_qidx = entry["qidx"]
            w = entry["weight"]
            if p["handover_status"] == "estimated_overdue":
                overdue_qidx_set.add(hd_qidx)
            sold_w = (p["units_sold"] or 0) * w
            unsold_w = (p["units_unsold"] or 0) * w
            if sold_w and release_rate_median is not None:
                quarter_new_supply[hd_qidx]["sold_release_mid"] += sold_w * release_rate_median
                quarter_new_supply[hd_qidx]["sold_release_lo"] += sold_w * (release_rate_p25 or 0)
                quarter_new_supply[hd_qidx]["sold_release_hi"] += sold_w * (release_rate_p75 or 0)
                for k in SIZE_KEYS:
                    quarter_supply_by_size[hd_qidx][k]["sold"] += sold_w * mix[k] * release_rate_median
            if unsold_w:
                per_q = unsold_w / unsold_q
                for k in range(unsold_q):
                    quarter_new_supply[hd_qidx + k]["unsold_release"] += per_q
                    for sk in SIZE_KEYS:
                        quarter_supply_by_size[hd_qidx + k][sk]["unsold"] += (per_q * mix[sk])

    handover_chart = []
    handover_chart_by_size = []
    for offset in range(-8, 8):
        qidx = current_qidx + offset
        actual_hh = sum(
            (p["households"] or 0) * entry["weight"]
            for p in projects.values()
            if p["handover_status"] in ("actual", "actual_probable")
            for entry in p.get("handover_schedule") or []
            if entry["qidx"] == qidx
        )
        est_hh = sum(
            (p["households"] or 0) * entry["weight"]
            for p in projects.values()
            if p["handover_status"] in ("estimated", "estimated_overdue")
            for entry in p.get("handover_schedule") or []
            if entry["qidx"] == qidx
        )
        handover_chart.append({"quarter": quarter_label(qidx), "actual": round(actual_hh, 1), "estimated": round(est_hh, 1)})
        by_size_entry = {"quarter": quarter_label(qidx), "is_overdue_spread": qidx in overdue_qidx_set}
        for k in SIZE_KEYS:
            by_size_entry[f"{k}_sold"] = round(quarter_supply_by_size[qidx][k]["sold"], 2)
            by_size_entry[f"{k}_unsold"] = round(quarter_supply_by_size[qidx][k]["unsold"], 2)
        handover_chart_by_size.append(by_size_entry)

    project_table = sorted(
        (
            {
                "project_name": p["project_name"],
                "builder": p["builder"],
                "households": p["households"],
                "units_sold": p["units_sold"],
                "units_unsold": p["units_unsold"],
                "total_floors": p["total_floors"],
                "size_mix": p["size_mix"],
                "presale_price": p["presale_price"],
                "permit_date_roc": p["permit_date_roc"],
                "first_registration_date_roc": p["first_registration_date_roc"],
                "handover_quarter": p["handover_quarter"],
                "handover_status": p["handover_status"],
                "handover_schedule": [{"quarter": quarter_label(e["qidx"]), "weight": e["weight"]} for e in (p.get("handover_schedule") or [])],
                "conflict_note": p["conflict_note"],
                "road": p["road"],
                "first_contract": p["first_contract"],
                "last_contract": p["last_contract"],
                "sell_status": p["sell_status"],
            }
            for p in projects.values()
        ),
        key=lambda x: (x["handover_quarter"] or "9999"),
    )

    log("抓 591 新案清單（對照用）")
    newhouse_items = fetch_591_newhouse("青埔")
    project_names_list = list(b_project_names)
    for it in newhouse_items:
        it["matched_b_project"] = match_project_name(it.get("build_name"), project_names_list)
    log(f"591 新案清單 n={len(newhouse_items)}")

    future_release = []
    for offset in range(0, 8):
        qidx = current_qidx + offset
        ns = quarter_new_supply[qidx]
        mid = ns["sold_release_mid"] + ns["unsold_release"]
        lo = ns["sold_release_lo"] + ns["unsold_release"]
        hi = ns["sold_release_hi"] + ns["unsold_release"]
        units_handover = sum(
            (p["households"] or 0) * entry["weight"]
            for p in projects.values()
            for entry in p.get("handover_schedule") or []
            if entry["qidx"] == qidx
        )
        by_size = {
            k: round(quarter_supply_by_size[qidx][k]["sold"] + quarter_supply_by_size[qidx][k]["unsold"], 2)
            for k in SIZE_KEYS
        }
        future_release.append({
            "quarter": quarter_label(qidx),
            "units_handover": round(units_handover, 1),
            "new_listings_mid": round(mid, 1),
            "new_listings_lo": round(lo, 1),
            "new_listings_hi": round(hi, 1),
            "new_listings_by_size": by_size,
        })

    # -----------------------------------------------------------------
    # (c) 建商餘屋：未售戶數合計、依專案分列、銷售中(selling) vs 停售(stalled)。
    # -----------------------------------------------------------------
    # 只算還沒完工的建案：已完工建案完工後建商改用成屋賣（進買賣檔、不進預售檔），
    # 用「總戶數－預售已售」會把完工後賣掉的也算成餘屋。
    pending = [p for p in projects.values() if p["handover_status"] not in ("actual", "actual_probable")]
    unsold_total = sum(p["units_unsold"] or 0 for p in pending)
    unsold_by_project = sorted(
        (
            {"project_name": p["project_name"], "units_unsold": p["units_unsold"], "sell_status": p["sell_status"], "last_contract": p["last_contract"], "road": p["road"]}
            for p in pending
            if (p["units_unsold"] or 0) > 0
        ),
        key=lambda x: -(x["units_unsold"] or 0),
    )
    unsold_summary = {
        "total_unsold": unsold_total,
        "still_selling_window_months": config.STILL_SELLING_WINDOW_MONTHS,
        "rows": unsold_by_project,
        "n_selling": sum(1 for r in unsold_by_project if r["sell_status"] == "selling"),
        "n_stalled": sum(1 for r in unsold_by_project if r["sell_status"] == "stalled"),
    }

    # -----------------------------------------------------------------
    # (d) 591 在售存量矩陣：依社區（已去重的「戶」）、依屋齡×坪數（中位開價，扣車位）。
    # 每月存一筆快照到 inventory_history.jsonl（同一個月重跑覆蓋）。
    # -----------------------------------------------------------------
    by_community_rows = []
    for name, us in units_by_community.items():
        prices = sorted(u["adj_unitprice"] for u in us if u.get("adj_unitprice") is not None)
        by_community_rows.append({
            "community_name": name,
            "n": len(us),
            "median_adj_unitprice": round(statistics.median(prices), 2) if prices else None,
        })
    by_community_rows.sort(key=lambda r: -r["n"])

    AGE_KEYS = ["presale", "new", "mid_age", "old", "unknown"]
    matrix = []
    for age_k in AGE_KEYS:
        for size_k in SIZE_KEYS:
            cell_units = [u for u in units if u.get("age_bucket") == age_k and u.get("adj_size_bucket") == size_k]
            prices = sorted(u["adj_unitprice"] for u in cell_units if u.get("adj_unitprice") is not None)
            matrix.append({
                "age_bucket": age_k,
                "size_bucket": size_k,
                "n": len(cell_units),
                "median_adj_unitprice": round(statistics.median(prices), 2) if prices else None,
            })

    all_prices = sorted(u["adj_unitprice"] for u in units if u.get("adj_unitprice") is not None)
    size_counts_now = Counter(u.get("adj_size_bucket") for u in units)
    snapshot = {
        "month": this_month,
        "total_units": len(units),
        "by_size": {k: size_counts_now.get(k, 0) for k in SIZE_KEYS},
        "median_adj_unitprice": round(statistics.median(all_prices), 2) if all_prices else None,
    }
    inventory_history = append_monthly_snapshot(config.INVENTORY_HISTORY_JSONL, this_month, snapshot)
    log(f"inventory_history.jsonl 累積 {len(inventory_history)} 個月快照（本月：{snapshot}）")

    inventory = {
        "by_community": by_community_rows,
        "by_age_size": matrix,
        "history": inventory_history,
        "history_note": "每月存一筆快照（同一個月重跑覆蓋，不會累積重複列），累積月數還少，趨勢要等後續每月執行才會看出來。",
    }

    # -----------------------------------------------------------------
    # (e) 新推案（近12個月首次簽約）——沿用既有邏輯。
    # -----------------------------------------------------------------
    new_launch_cutoff = (today - datetime.timedelta(days=365)).isoformat()
    new_launches = []
    for name, rows in by_project.items():
        first_contract = min(r["date"] for r in rows)
        if first_contract >= new_launch_cutoff:
            prices = sorted(
                r["unit_price_wan_ping_precise"]
                for r in rows
                if r.get("unit_price_wan_ping_precise") is not None and not r["special"] and not r["car_lumped"]
            )
            roads = Counter(r["road"] for r in rows if r.get("road"))
            new_launches.append({
                "project_name": name,
                "units_sold": len(rows),
                "first_contract": first_contract,
                "median_unit_price": round(statistics.median(prices), 2) if prices else None,
                "n_priced": len(prices),
                "road": roads.most_common(1)[0][0] if roads else None,
            })
    new_launches.sort(key=lambda x: x["first_contract"], reverse=True)

    result = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "supply": {
            "handover": {
                "lag_median_days": lag_median_days,
                "lag_n": lag_n,
                "chart_quarters": handover_chart,
                "chart_quarters_by_size": handover_chart_by_size,
                "projects": project_table,
                "total_projects": len(projects),
                "qingpu_size_mix_fallback": qingpu_size_mix_fallback,
            },
            "newhouse_591_crosscheck": newhouse_items,
            "unsold": unsold_summary,
            "release_rate": {
                "rows": release_rows_12mo,
                "all_rows": release_rows_all,
                "median": round(release_rate_median, 4) if release_rate_median is not None else None,
                "p25": round(release_rate_p25, 4) if release_rate_p25 is not None else None,
                "p75": round(release_rate_p75, 4) if release_rate_p75 is not None else None,
                "n": len(release_rates_sorted),
                "future_quarters": future_release,
            },
            "inventory": inventory,
            "new_launches": new_launches,
        },
    }

    with open(config.SUPPLY_DEMAND_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)

    log(
        f"done. projects={len(projects)} lag_median={lag_median_days}d(n={lag_n}) "
        f"release_rate_median={release_rate_median} new_launches={len(new_launches)} "
        f"unsold_total={unsold_total} inventory_units={len(units)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
