# -*- coding: utf-8 -*-
"""
「價格走向」：只看同類型產品（屋齡0-3年、24-35坪、不含車位、青埔全區，不分建案，
這是仰森銷售主力戶型的代表範圍），算現況存貨月數（MOI，只當自己隨時間變化的
參考、不套用門檻判斷）、未來8季存貨/去化推算、歷史校準回歸（有沒有解釋力就照實
講：R²太小/樣本太少就是沒有解釋力，不拿來配價格）。價格情境輸出跨建案中性季價
指數本身（近4完整季中位數/區間、n夠大的季別裡的最低點、2024年高點區間）三個
乘數（維持/收斂/回升），不綁定任何特定戶別——網頁上「戶別試算」用哪一戶的預售
單價，就乘上這三個乘數當三個情境，只講數字，不給買賣建議。全部算好寫進
data/outlook.json，網頁只負責顯示、不現場算。

每次執行也會往 data/listing_history.jsonl 多寫一筆這個月的存貨快照（同一個月
重跑覆蓋，不會累積重複列——CI 改成每月排程後，用「月」當去重 key 才有意義），
這是「現況存貨月數」時間序列的起點。

依賴 data/deals.json、data/units.json（跟 compute_estimate.py 同一套同類型篩選
邏輯）、data/supply_demand.json（交屋時間表/釋出率，compute_supply.py）、
data/demand.json（成交量/人口，compute_demand.py）。要在這幾支都跑完之後執行。

用法：
    python3 compute_price_outlook.py
"""
import datetime
import json
import statistics
import sys
from collections import defaultdict

import config
from compute_supply import quarter_index, quarter_label


def log(msg):
    print(f"[compute_price_outlook] {msg}", file=sys.stderr)


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


def label_to_qidx(label):
    """quarter_label() 的反函式：'2026Q3' -> qidx。"""
    y = int(label[:4])
    q = int(label[5])
    return y * 4 + (q - 1)


def linreg_r2(xs, ys):
    """簡單最小平方法，回傳 (slope, intercept, r2)。n<2 全部回傳 0/None。"""
    n = len(xs)
    if n < 2:
        return 0.0, (ys[0] if ys else 0.0), None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den = sum((x - mean_x) ** 2 for x in xs)
    slope = num / den if den else 0.0
    intercept = mean_y - slope * mean_x
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    if ss_tot == 0 or den == 0:
        return round(slope, 6), round(intercept, 6), None
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - ss_res / ss_tot
    return round(slope, 6), round(intercept, 6), round(r2, 4)


def in_scope_deal(d, area_lo, area_hi, age_max):
    # 只用來「數成交件數」：車位灌進總價的成交單價算不準，但仍是一筆真實成交，
    # 數件數時要算進來（之前排除掉會把去化速度少算好幾倍）。
    return (
        d.get("deal_kind") == "resale"
        and not d.get("special")
        and d.get("age_years") is not None
        and 0 <= d["age_years"] < age_max
        and d.get("area_ping") is not None
        and area_lo <= d["area_ping"] <= area_hi
    )


def in_scope_unit(u, area_lo, area_hi, age_max):
    return (
        u.get("age_years") is not None
        and 0 <= u["age_years"] < age_max
        and u.get("adj_area") is not None
        and area_lo <= u["adj_area"] <= area_hi
        and u.get("adj_unitprice") is not None
    )


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


def main():
    params = config.OUTLOOK_PARAMS
    area_lo, area_hi = params["scope_area_range"]
    age_max = params["scope_age_max_years"]
    today = datetime.date.today()
    this_month = today.strftime("%Y-%m")

    deals = load_json(config.DEALS_JSON, {}).get("deals", [])
    units = load_json(config.UNITS_JSON, {}).get("units", [])
    supply_demand = load_json(config.SUPPLY_DEMAND_JSON, {})
    demand = load_json(config.DEMAND_JSON, {})
    if not deals or not units:
        log("讀不到 deals.json / units.json，中止")
        return 1
    if not supply_demand:
        log("讀不到 supply_demand.json，未來8季推算需要交屋時間表資料，中止")
        return 1

    scope_note = f"同類型產品：屋齡0-{age_max}年、{area_lo:.0f}-{area_hi:.0f}坪（不含車位）、青埔全區，不分建案"

    # -----------------------------------------------------------------
    # 1) 現況存貨月數（MOI）：591去重後同類型在售戶數 ÷ 同類型真中古月均去化
    #    （近12個月，扣最後2個月落後月），並寫一筆這個月的存貨快照。
    # -----------------------------------------------------------------
    in_scope_units = [u for u in units if in_scope_unit(u, area_lo, area_hi, age_max)]
    n_listings = len(in_scope_units)
    asks_sorted = sorted(u["adj_unitprice"] for u in in_scope_units)
    median_ask = statistics.median(asks_sorted) if asks_sorted else None

    in_scope_deals = [d for d in deals if in_scope_deal(d, area_lo, area_hi, age_max)]

    window_months = params["absorption_window_months"]
    lag = params["absorption_lag_months"]
    current_month_start = today.replace(day=1)
    month_buckets = []
    m = current_month_start
    for _ in range(window_months):
        month_buckets.append(m.strftime("%Y-%m"))
        m = (m - datetime.timedelta(days=1)).replace(day=1)
    month_buckets.sort()
    counts_by_month = {}
    for d in in_scope_deals:
        mk = d["date"][:7]
        if mk in month_buckets:
            counts_by_month[mk] = counts_by_month.get(mk, 0) + 1
    monthly_series = [{"month": mb, "n": counts_by_month.get(mb, 0)} for mb in month_buckets]
    usable_months = month_buckets[:-lag] if lag > 0 else month_buckets
    usable_counts = [counts_by_month.get(mb, 0) for mb in usable_months]
    monthly_absorption = (sum(usable_counts) / len(usable_months)) if usable_months else None
    moi_current = round(n_listings / monthly_absorption, 1) if monthly_absorption else None
    log(
        f"MOI 現況: n_listings={n_listings} median_ask={median_ask} "
        f"monthly_absorption={monthly_absorption} moi={moi_current}"
    )

    snapshot = {
        "month": this_month,
        "n_listings": n_listings,
        "median_adj_ask": round(median_ask, 2) if median_ask is not None else None,
    }
    history = append_monthly_snapshot(config.LISTING_HISTORY_JSONL, this_month, snapshot)
    log(f"listing_history.jsonl 累積 {len(history)} 個月快照（本月：{snapshot}）")

    # -----------------------------------------------------------------
    # 2) 未來8季存貨/去化推算：範圍縮到 24-35坪。新增供給＝已售戶×釋出率（一次性，
    #    在交屋季）＋未售戶×(1/UNSOLD_RELEASE_QUARTERS)（分4季線性釋出），
    #    再乘上每個建案自己的坪數結構（24-35坪佔該建案預售筆數的比例，樣本不足
    #    退回青埔全區比例）。去化＝近4個完整季同類型中古成交季均，用青埔戶數
    #    YoY成長率逐季放大。
    # -----------------------------------------------------------------
    handover_projects = (supply_demand.get("supply", {}).get("handover", {}) or {}).get("projects", [])
    release_rate_stats = supply_demand.get("supply", {}).get("release_rate", {}) or {}
    release_median = release_rate_stats.get("median")
    unsold_q = config.UNSOLD_RELEASE_QUARTERS

    presale_areas_by_project = defaultdict(list)
    for d in deals:
        if d.get("deal_kind") == "presale" and d.get("project_name") and d.get("area_ping") is not None:
            presale_areas_by_project[d["project_name"]].append(d["area_ping"])
    qingpu_all_areas = [a for areas in presale_areas_by_project.values() for a in areas]
    qingpu_area_share = (
        sum(1 for a in qingpu_all_areas if area_lo <= a <= area_hi) / len(qingpu_all_areas)
        if qingpu_all_areas
        else None
    )
    area_mix_min_n = params["area_mix_min_n"]

    def area_mix_share(project_name):
        areas = presale_areas_by_project.get(project_name)
        if areas and len(areas) >= area_mix_min_n:
            return sum(1 for a in areas if area_lo <= a <= area_hi) / len(areas), "project"
        return qingpu_area_share, "qingpu_fallback"

    current_qidx = quarter_index(today.isoformat())
    # 「完整季」要扣實價登錄公布落後：季末早於今天兩個月以上才算完整
    complete_before_qidx = quarter_index((today - datetime.timedelta(days=62)).isoformat())
    n_proj_quarters = params["projection_quarters"]

    quarter_new_supply_scoped = defaultdict(float)
    scoped_detail = []
    all_handover_by_qidx = defaultdict(float)  # 不縮範圍，全戶數，給校準的供給壓力代理變數用
    for p in handover_projects:
        schedule = p.get("handover_schedule") or []
        if not schedule:
            continue
        share, share_source = area_mix_share(p["project_name"])
        for entry in schedule:
            hd_qidx = label_to_qidx(entry["quarter"])
            w = entry["weight"]
            all_handover_by_qidx[hd_qidx] += (p.get("households") or 0) * w
            if share is None:
                continue
            sold_scoped = (p.get("units_sold") or 0) * w * share
            unsold_scoped = (p.get("units_unsold") or 0) * w * share
            if sold_scoped and release_median is not None:
                quarter_new_supply_scoped[hd_qidx] += sold_scoped * release_median
            if unsold_scoped:
                per_q = unsold_scoped / unsold_q
                for k in range(unsold_q):
                    quarter_new_supply_scoped[hd_qidx + k] += per_q
        scoped_detail.append({
            "project_name": p["project_name"],
            "handover_quarter": p["handover_quarter"],
            "units_sold": p["units_sold"],
            "units_unsold": p["units_unsold"],
            "area_mix_share": round(share, 4) if share is not None else None,
            "area_mix_source": share_source,
        })

    # 去化基準：近4個完整季同類型（24-35坪、0-3年）中古成交季均
    quarterly_scoped_deals = defaultdict(int)
    for d in in_scope_deals:
        quarterly_scoped_deals[quarter_index(d["date"])] += 1
    complete_q_idx = sorted(q for q in quarterly_scoped_deals if q < complete_before_qidx)
    last4_idx = complete_q_idx[-4:] if len(complete_q_idx) >= 4 else complete_q_idx
    base_absorption_q = statistics.mean([quarterly_scoped_deals[q] for q in last4_idx]) if last4_idx else None

    household_growth = (demand.get("population", {}) or {}).get("household_growth_yoy")
    growth_rate = household_growth.get("growth_rate") if household_growth else None
    per_q_growth = (1 + growth_rate) ** 0.25 if growth_rate is not None else 1.0

    # 全青埔（不縮範圍）中古成交季均，給校準的供給壓力代理變數分母、也給未來季的分母預估用
    tv_quarterly = (demand.get("transaction_volume", {}) or {}).get("quarterly", [])
    all_resale_by_label = {row["quarter"]: row["resale"] for row in tv_quarterly}
    all_resale_idx = sorted(all_resale_by_label)
    all_resale_complete_idx = [label_to_qidx(lb) for lb in all_resale_idx if label_to_qidx(lb) < complete_before_qidx]
    all_resale_complete_idx.sort()
    last4_all_idx = all_resale_complete_idx[-4:] if len(all_resale_complete_idx) >= 4 else all_resale_complete_idx
    base_all_resale_q = (
        statistics.mean([all_resale_by_label[quarter_label(q)] for q in last4_all_idx]) if last4_all_idx else None
    )

    projection_rows = []
    stock = float(n_listings)
    absorption_q = base_absorption_q
    all_resale_forecast_q = base_all_resale_q
    for offset in range(0, n_proj_quarters):
        qidx = current_qidx + offset
        if offset > 0:
            if absorption_q is not None:
                absorption_q = absorption_q * per_q_growth
            if all_resale_forecast_q is not None:
                all_resale_forecast_q = all_resale_forecast_q * per_q_growth
        new_supply = quarter_new_supply_scoped.get(qidx, 0.0)
        available = stock + new_supply
        absorption_use = absorption_q or 0.0
        closing = max(available - absorption_use, 0.0)
        moi = round(available / absorption_use, 1) if absorption_use else None
        all_handover_qtr = all_handover_by_qidx.get(qidx, 0)
        proxy = (all_handover_qtr / all_resale_forecast_q) if all_resale_forecast_q else None
        projection_rows.append({
            "quarter": quarter_label(qidx),
            "opening_stock": round(stock, 1),
            "new_supply": round(new_supply, 1),
            "available": round(available, 1),
            "absorption": round(absorption_use, 1),
            "moi": moi,
            "closing_stock": round(closing, 1),
            "supply_pressure_proxy": round(proxy, 3) if proxy is not None else None,
        })
        stock = closing
    log(
        f"8季推算: current_stock={n_listings} base_absorption_q={base_absorption_q} "
        f"growth_rate={growth_rate} rows={len(projection_rows)}"
    )

    # -----------------------------------------------------------------
    # 3) 歷史校準：跨建案中性季價指數（每筆中古成交單價 ÷ 該建案預售中位數，
    #    取季中位數，自2021Q3起）＋ 供給壓力代理變數（該季全戶數交屋 ÷ 該季
    #    全部中古成交筆數），回歸「未來4季指數變化」對「當季代理變數」。
    #    n太小或R2太小就老實說是沒有解釋力，不拿來配價格。
    # -----------------------------------------------------------------
    presale_prices_by_project = defaultdict(list)
    for d in deals:
        if (
            d.get("deal_kind") == "presale"
            and d.get("project_name")
            and d.get("unit_price_wan_ping_precise") is not None
            and not d.get("special")
            and not d.get("car_lumped")
        ):
            presale_prices_by_project[d["project_name"]].append(d["unit_price_wan_ping_precise"])
    presale_median_by_project = {k: statistics.median(v) for k, v in presale_prices_by_project.items()}

    resale_all = [
        d
        for d in deals
        if d.get("deal_kind") == "resale"
        and d.get("project_name_inferred")
        and d.get("unit_price_wan_ping_precise") is not None
        and not d.get("special")
        and not d.get("car_lumped")
    ]
    start_qidx = label_to_qidx(params["calibration_start_quarter"])
    quarterly_ratios = defaultdict(list)
    for d in resale_all:
        pm = presale_median_by_project.get(d["project_name_inferred"])
        if not pm:
            continue
        qidx = quarter_index(d["date"])
        if qidx >= start_qidx:
            quarterly_ratios[qidx].append(d["unit_price_wan_ping_precise"] / pm)
    index_series = {q: round(statistics.median(v), 4) for q, v in quarterly_ratios.items() if v}
    index_n_series = {q: len(v) for q, v in quarterly_ratios.items() if v}
    log(f"季價指數（同案基準中性化）: n_quarters={len(index_series)}")

    proxy_hist_by_qidx = {}
    for lb, resale_n in all_resale_by_label.items():
        qidx = label_to_qidx(lb)
        if qidx >= start_qidx and resale_n:
            proxy_hist_by_qidx[qidx] = all_handover_by_qidx.get(qidx, 0) / resale_n

    calib_rows = []
    for qidx in sorted(index_series):
        q4 = qidx + 4
        if q4 not in index_series or qidx not in proxy_hist_by_qidx:
            continue
        change_4q = index_series[q4] / index_series[qidx] - 1
        calib_rows.append({
            "quarter": quarter_label(qidx),
            "index": index_series[qidx],
            "index_n": index_n_series.get(qidx),
            "proxy": round(proxy_hist_by_qidx[qidx], 3),
            "future_quarter": quarter_label(q4),
            "future_index": index_series[q4],
            "change_4q": round(change_4q, 4),
        })

    xs = [r["proxy"] for r in calib_rows]
    ys = [r["change_4q"] for r in calib_rows]
    slope, intercept, r2 = linreg_r2(xs, ys)
    n_calib = len(calib_rows)
    calib_usable = n_calib >= params["calibration_min_n"] and r2 is not None and r2 >= params["calibration_min_r2"]
    log(f"歷史校準回歸: n={n_calib} slope={slope} intercept={intercept} r2={r2} usable={calib_usable}")

    # -----------------------------------------------------------------
    # 4) 不用迴歸配價格（R²太小/樣本太少就是沒有解釋力，見上）。改用跨建案中性
    #    季價指數本身：近4個完整季的中位數/區間、n≥5季別裡的最低點、2024年高點
    #    區間，組成三個「情境乘數」（維持/收斂/回升）——這裡只輸出乘數本身跟
    #    依據，不套用到任何特定戶別；「戶別試算」頁面選哪一戶，就在前端把這三個
    #    乘數乘上該戶的預售單價。
    # -----------------------------------------------------------------
    complete_index_qidx = sorted(q for q in index_series if q < complete_before_qidx)
    last4_complete_qidx = complete_index_qidx[-4:] if len(complete_index_qidx) >= 4 else complete_index_qidx
    last4_values = [index_series[q] for q in last4_complete_qidx]
    last4_median = statistics.median(last4_values) if last4_values else None
    last4_range = [min(last4_values), max(last4_values)] if last4_values else None

    min_n = params["premium_index_min_n"]
    n5_qualifying = {q: v for q, v in index_series.items() if (index_n_series.get(q) or 0) >= min_n}
    lowest_n5_qidx = min(n5_qualifying, key=lambda q: n5_qualifying[q]) if n5_qualifying else None
    lowest_n5_value = n5_qualifying.get(lowest_n5_qidx)
    lowest_n5_n = index_n_series.get(lowest_n5_qidx) if lowest_n5_qidx is not None else None

    peak_labels = params["premium_index_peak_quarters"]
    peak_points = [
        {"quarter": lb, "index": index_series.get(label_to_qidx(lb)), "n": index_n_series.get(label_to_qidx(lb))}
        for lb in peak_labels
    ]
    peak_values = [p["index"] for p in peak_points if p["index"] is not None]
    peak_median = statistics.median(peak_values) if peak_values else None

    premium_index_facts = {
        "last4_complete": {
            "quarters": [quarter_label(q) for q in last4_complete_qidx],
            "values": last4_values,
            "range": last4_range,
            "median": round(last4_median, 4) if last4_median is not None else None,
        },
        "lowest_n_ge_min": {
            "quarter": quarter_label(lowest_n5_qidx) if lowest_n5_qidx is not None else None,
            "value": lowest_n5_value,
            "n": lowest_n5_n,
            "min_n_required": min_n,
        },
        "peak": {
            "quarters": peak_labels,
            "points": peak_points,
            "median": round(peak_median, 4) if peak_median is not None else None,
        },
    }
    log(
        f"季價指數事實：近4完整季 {premium_index_facts['last4_complete']['quarters']} "
        f"range={last4_range} median={premium_index_facts['last4_complete']['median']}；"
        f"n≥{min_n}最低點={premium_index_facts['lowest_n_ge_min']['quarter']}"
        f"({lowest_n5_value}, n={lowest_n5_n})；高點區間中位數={premium_index_facts['peak']['median']}"
    )

    def multiplier_entry(value, basis):
        return {"multiplier": round(value, 4) if value is not None else None, "basis": basis}

    scenarios = {
        "維持": multiplier_entry(last4_median, f"近4個完整季（{'、'.join(premium_index_facts['last4_complete']['quarters'])}）季價指數中位數"),
        "收斂": multiplier_entry(
            lowest_n5_value,
            f"{premium_index_facts['lowest_n_ge_min']['quarter']}（n={lowest_n5_n}）＝樣本數≥{min_n}的季別中最低點"
            if lowest_n5_qidx is not None
            else f"沒有樣本數≥{min_n}的季別，無法算",
        ),
        "回升": multiplier_entry(peak_median, f"2024年高點區間（{'、'.join(peak_labels)}）季價指數中位數"),
    }
    log(f"情境乘數（套用到任何一戶的預售單價，由前端「戶別試算」計算）：{scenarios}")

    # -----------------------------------------------------------------
    # 5) 供給端對照：未來4季新增待售 vs 去化（修正後的供需模型數字，見
    #    data/supply_demand.json），以及「量縮先於價跌」的觀察——只是陳述已經
    #    發生的事實，不是預測。
    # -----------------------------------------------------------------
    release_future = release_rate_stats.get("future_quarters", []) or []
    supply_4q_total = round(sum(r.get("new_listings_mid") or 0 for r in release_future[:4]), 1) if release_future else None
    absorption_4q_total = round(base_absorption_q * 4, 1) if base_absorption_q is not None else None

    presale_by_label = {row["quarter"]: row.get("presale", 0) for row in tv_quarterly}
    baseline_year = params["premium_index_2023_baseline_year"]
    baseline_vals = [v for lb, v in presale_by_label.items() if lb.startswith(baseline_year)]
    baseline_avg = statistics.mean(baseline_vals) if baseline_vals else None

    shrink_since_qidx = label_to_qidx(params["premium_index_shrink_since_quarter"])
    recent_vals = [v for lb, v in presale_by_label.items() if shrink_since_qidx <= label_to_qidx(lb) < complete_before_qidx]
    recent_avg = statistics.mean(recent_vals) if recent_vals else None
    presale_volume_change = (recent_avg / baseline_avg - 1) if (baseline_avg and recent_avg is not None) else None

    index_at_shrink_start = index_series.get(shrink_since_qidx)
    last_complete_qidx_overall = max((q for q in index_series if q < complete_before_qidx), default=None)
    index_latest_complete = index_series.get(last_complete_qidx_overall) if last_complete_qidx_overall is not None else None

    supply_context = {
        "future_4q_new_supply": supply_4q_total,
        "future_4q_absorption": absorption_4q_total,
        "current_onsale_stock": n_listings,
        "presale_volume": {
            "baseline_year": baseline_year,
            "baseline_avg_per_quarter": round(baseline_avg, 1) if baseline_avg is not None else None,
            "baseline_n_quarters": len(baseline_vals),
            "since_quarter": params["premium_index_shrink_since_quarter"],
            "recent_avg_per_quarter": round(recent_avg, 1) if recent_avg is not None else None,
            "recent_n_quarters": len(recent_vals),
            "change_pct": round(presale_volume_change, 4) if presale_volume_change is not None else None,
        },
        "premium_index_at_shrink_start": index_at_shrink_start,
        "premium_index_latest_complete_quarter": quarter_label(last_complete_qidx_overall) if last_complete_qidx_overall is not None else None,
        "premium_index_latest_complete_value": index_latest_complete,
        "observation_note": "以下是已經發生的事實，不是預測：預售簽約量在青埔全區從2023年季均水準到2024Q3之後大幅下滑，同一段期間跨建案季價指數只小幅回落，量縮走在價跌前面（或者說，價格目前還沒跟上量縮的幅度）。",
    }
    log(
        f"供給對照：未來4季新增待售={supply_4q_total} vs 去化={absorption_4q_total}；"
        f"預售量 {baseline_year}季均={baseline_avg} (n={len(baseline_vals)}) -> "
        f"{params['premium_index_shrink_since_quarter']}起季均={recent_avg} (n={len(recent_vals)})，"
        f"變化={presale_volume_change}；指數 {params['premium_index_shrink_since_quarter']}={index_at_shrink_start} -> "
        f"{quarter_label(last_complete_qidx_overall) if last_complete_qidx_overall is not None else None}={index_latest_complete}"
    )

    recalc_note = (
        "以下情況出現任一個，這頁的數字就該重算，不是自動判斷："
        "房貸利率轉向（升息/降息循環改變）、"
        "貸款信用管制放寬或加嚴、"
        "現有交屋時間表出現大量延後或提前、"
        "591同類型在售量連續3個月變動超過20%。"
    )

    result = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "scope_note": scope_note,
        "current_moi": {
            "n_listings": n_listings,
            "median_ask": round(median_ask, 2) if median_ask is not None else None,
            "monthly_absorption": round(monthly_absorption, 2) if monthly_absorption is not None else None,
            "monthly_series": monthly_series,
            "window_months": window_months,
            "lag_months": lag,
            "moi": moi_current,
            "caveat": "591在售筆數常包含屋主開高的試探性開價、不會真的用這個價成交，跟成交端的「存貨」不是同一個基礎，不能套用美國房市常見的MOI門檻（例如<6個月=賣方市場）。這個數字只拿來看自己隨時間怎麼變化，不是跟外部標準比。",
        },
        "listing_history": history,
        "projection": {
            "quarters": n_proj_quarters,
            "area_mix_detail": scoped_detail,
            "qingpu_area_share_fallback": round(qingpu_area_share, 4) if qingpu_area_share is not None else None,
            "release_rate_median_used": release_median,
            "base_absorption_per_quarter": round(base_absorption_q, 1) if base_absorption_q is not None else None,
            "household_growth_yoy_used": growth_rate,
            "rows": projection_rows,
        },
        "calibration": {
            "start_quarter": params["calibration_start_quarter"],
            "index_series": [{"quarter": quarter_label(q), "index": v, "n": index_n_series.get(q)} for q, v in sorted(index_series.items())],
            "rows": calib_rows,
            "n": n_calib,
            "slope": slope,
            "intercept": intercept,
            "r2": r2,
            "usable": calib_usable,
            "min_n_required": params["calibration_min_n"],
            "min_r2_required": params["calibration_min_r2"],
            "note": "n或R²沒有過門檻：這條迴歸線只是記錄「查過供給壓力對未來價格變化的解釋力，沒查到關係」，不拿來配價格路徑或方向。",
        },
        "premium_index_facts": premium_index_facts,
        "scenarios": scenarios,
        "supply_context": supply_context,
        "recalc_note": recalc_note,
    }

    with open(config.OUTLOOK_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)

    log(
        f"done. moi_current={moi_current} calib_n={n_calib} calib_r2={r2} usable={calib_usable} "
        f"scenarios={ {k: v.get('multiplier') for k, v in scenarios.items()} }"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
