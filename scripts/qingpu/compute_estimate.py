# -*- coding: utf-8 -*-
"""
算「戶別試算」通用工具要用的係數，寫進 data/estimate.json。這裡不指定任何特定
戶別——網頁上viewer 選（或點銷控表格子）任何一戶，前端用這裡輸出的通用係數幫
該戶試算：同建案漲幅（現在市價的依據）、樓層調整斜率（把591開價換算到選定樓層
的對照用）、開價溢價（建議開價的依據）、去化速度（要多久排隊）。所有門檻/範圍
都在 config.py 的 ESTIMATE_PARAMS，要調整就改那邊。

核心規則（跟原版一致）：不要拿青埔全區跨屋齡的中位數互相比較，只比同一個建案，
或同一個屋齡區間。同建案漲幅法為主，青埔全區只在同一個屋齡區間內比、且只在同
建案樣本不夠（<3個建案）時當備援。

依賴 data/deals.json（fetch_lvr.py，含 project_name_inferred）與
data/units.json（fetch_591.py），要在兩者都跑完之後執行。

用法：
    python3 compute_estimate.py
"""
import datetime
import json
import re
import statistics
import sys
from collections import defaultdict

import config


def log(msg):
    print(f"[compute_estimate] {msg}", file=sys.stderr)


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def linreg(xs, ys):
    """簡單最小平方法，回傳 (slope, intercept)。n<2 回傳斜率 0。"""
    n = len(xs)
    if n < 2:
        return 0.0, (ys[0] if ys else 0.0)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den = sum((x - mean_x) ** 2 for x in xs)
    slope = num / den if den else 0.0
    intercept = mean_y - slope * mean_x
    return slope, intercept


def percentile(sorted_vals, p):
    if not sorted_vals:
        return None
    idx = (len(sorted_vals) - 1) * p
    lo = int(idx)
    hi = min(lo + 1, len(sorted_vals) - 1)
    if lo == hi:
        return sorted_vals[lo]
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (idx - lo)


def parse_591_floor(floor_str):
    """591 樓層字串像「15F/24F」，取前面那個樓層數字，抓不到回傳 None。"""
    if not floor_str:
        return None
    m = re.match(r"(\d+)\s*F", floor_str, re.IGNORECASE)
    return int(m.group(1)) if m else None


def month_key(date_str):
    return date_str[:7]


def median_date(date_strs):
    """一組 ISO 日期字串的「中位日期」：排序後取中間那個（偶數取中間偏後那個，
    不做日期內插，內插出來的日期沒有實質意義）。"""
    if not date_strs:
        return None
    s = sorted(date_strs)
    return s[len(s) // 2]


def main():
    params = config.ESTIMATE_PARAMS
    today = datetime.date.today()

    try:
        deals = load_json(config.DEALS_JSON).get("deals", [])
        units = load_json(config.UNITS_JSON).get("units", [])
    except (OSError, json.JSONDecodeError) as e:
        log(f"讀不到 deals.json / units.json，先跳過：{e}")
        return 1

    # -----------------------------------------------------------------
    # 1) 樓層調整迴歸：仰森每個戶別代碼（如 A1/B3/C8）自己的預售資料各做一次迴歸
    #    （單價 ~ 樓層），斜率代表「這個戶型每差一樓、單價差多少」。樣本不足
    #    （floor_fit_min_n_unit_code）就退回同棟（A/B/C）迴歸，再不足退回全案迴歸。
    #    這是通用係數，不綁定任何特定戶別——選哪一戶，前端就用哪一戶對應的斜率。
    # -----------------------------------------------------------------
    fit_rows = [
        d
        for d in deals
        if d.get("is_yuanxiong")
        and d.get("deal_kind") == "presale"
        and d.get("unit_code")
        and d.get("unit_price_wan_ping_precise") is not None
        and d.get("floor_num") is not None
    ]
    xs_all = [d["floor_num"] for d in fit_rows]
    ys_all = [d["unit_price_wan_ping_precise"] for d in fit_rows]
    pooled_slope, pooled_intercept = linreg(xs_all, ys_all)

    by_building = {}
    for bcode in sorted({d["unit_code"][:1] for d in fit_rows}):
        sub = [d for d in fit_rows if d["unit_code"].startswith(bcode)]
        if len(sub) >= params["floor_fit_min_n_building"]:
            s, i = linreg([d["floor_num"] for d in sub], [d["unit_price_wan_ping_precise"] for d in sub])
            by_building[bcode] = {"slope": round(s, 4), "intercept": round(i, 2), "n": len(sub)}

    by_unit_code = {}
    for ucode in sorted({d["unit_code"] for d in fit_rows}):
        sub = [d for d in fit_rows if d["unit_code"] == ucode]
        areas = [d["area_ping"] for d in sub if d.get("area_ping") is not None]
        entry = {"n": len(sub), "area_ping": round(statistics.median(areas), 2) if areas else None}
        if len(sub) >= params["floor_fit_min_n_unit_code"]:
            s, i = linreg([d["floor_num"] for d in sub], [d["unit_price_wan_ping_precise"] for d in sub])
            entry.update({"slope": round(s, 4), "intercept": round(i, 2), "source": "unit_code"})
        else:
            bcode = ucode[:1]
            if bcode in by_building:
                entry.update({"slope": by_building[bcode]["slope"], "intercept": by_building[bcode]["intercept"], "source": "building_fallback"})
            else:
                entry.update({"slope": round(pooled_slope, 4), "intercept": round(pooled_intercept, 2), "source": "pooled_fallback"})
        by_unit_code[ucode] = entry
    log(f"floor fit: n={len(fit_rows)} pooled_slope={pooled_slope:.4f} unit_codes={len(by_unit_code)} buildings={list(by_building.keys())}")

    # -----------------------------------------------------------------
    # 2) 同建案漲幅法：同一個建案的預售單價中位數 vs 中古單價中位數，只比同建案，
    #    不跨建案、不跨屋齡。>=3 筆中古成交的建案才算。（通用，跟選哪一戶無關）
    # -----------------------------------------------------------------
    presale_by_project = {}
    for d in deals:
        if d.get("deal_kind") == "presale" and d.get("project_name") and d.get("unit_price_wan_ping_precise") is not None and not d.get("special") and not d.get("car_lumped"):
            presale_by_project.setdefault(d["project_name"], []).append(d)

    resale_by_project = {}
    for d in deals:
        if (
            d.get("deal_kind") == "resale"
            and d.get("project_name_inferred")
            and d.get("unit_price_wan_ping_precise") is not None
            and not d.get("special")
            and not d.get("car_lumped")
        ):
            resale_by_project.setdefault(d["project_name_inferred"], []).append(d)

    uplift_rows = []
    for project, resale_rows in resale_by_project.items():
        if len(resale_rows) < 3 or project not in presale_by_project:
            continue
        presale_rows = presale_by_project[project]
        presale_prices = sorted(r["unit_price_wan_ping_precise"] for r in presale_rows)
        resale_prices = sorted(r["unit_price_wan_ping_precise"] for r in resale_rows)
        presale_median = statistics.median(presale_prices)
        resale_median = statistics.median(resale_prices)
        uplift = resale_median / presale_median - 1

        # 同樓層帶：只比兩邊都有資料的樓層，避免「中古剛好都是低樓層」這種組成差異。
        presale_by_floor = {}
        for r in presale_rows:
            if r.get("floor_num") is not None:
                presale_by_floor.setdefault(r["floor_num"], []).append(r["unit_price_wan_ping_precise"])
        resale_by_floor = {}
        for r in resale_rows:
            if r.get("floor_num") is not None:
                resale_by_floor.setdefault(r["floor_num"], []).append(r["unit_price_wan_ping_precise"])
        shared_floors = sorted(set(presale_by_floor) & set(resale_by_floor))
        floor_uplifts = []
        for fl_num in shared_floors:
            p_med = statistics.median(presale_by_floor[fl_num])
            r_med = statistics.median(resale_by_floor[fl_num])
            if p_med:
                floor_uplifts.append(r_med / p_med - 1)
        floor_matched_uplift = statistics.median(floor_uplifts) if floor_uplifts else None

        # 年化：預售中位日期到中古中位日期經過幾年，漲幅換算成年化報酬（複合）。
        presale_mid_date = median_date([r["date"] for r in presale_rows])
        resale_mid_date = median_date([r["date"] for r in resale_rows])
        years_between = (datetime.date.fromisoformat(resale_mid_date) - datetime.date.fromisoformat(presale_mid_date)).days / 365.25
        annualized_uplift = (1 + uplift) ** (1 / years_between) - 1 if years_between > 0 else None

        uplift_rows.append({
            "project_name": project,
            "presale_n": len(presale_prices),
            "presale_median": round(presale_median, 2),
            "presale_date_range": [presale_rows and min(r["date"] for r in presale_rows), presale_rows and max(r["date"] for r in presale_rows)],
            "resale_n": len(resale_prices),
            "resale_median": round(resale_median, 2),
            "resale_date_range": [min(r["date"] for r in resale_rows), max(r["date"] for r in resale_rows)],
            "uplift": round(uplift, 4),
            "floor_matched_uplift": round(floor_matched_uplift, 4) if floor_matched_uplift is not None else None,
            "floor_matched_n_floors": len(shared_floors),
            "annualized_uplift": round(annualized_uplift, 4) if annualized_uplift is not None else None,
            "years_between": round(years_between, 2),
        })

    uplift_rows.sort(key=lambda r: r["uplift"])
    uplift_values = sorted(r["uplift"] for r in uplift_rows)
    uplift_median = statistics.median(uplift_values) if uplift_values else None
    uplift_p25 = percentile(uplift_values, 0.25) if uplift_values else None
    uplift_p75 = percentile(uplift_values, 0.75) if uplift_values else None
    log(f"same-project uplift: n_projects={len(uplift_rows)} median={uplift_median} p25={uplift_p25} p75={uplift_p75}")

    # -----------------------------------------------------------------
    # 3) 建議開價的「開價溢價」：優先用「同時有591在售、又有中古成交、且屋齡0-3年」
    #    的建案，把這些建案的開價/成交各自合併算中位數；不足3個建案就退回屋齡0-3年、
    #    青埔全區（不分建案）的開價/成交比，並註記。（通用，跟選哪一戶無關）
    # -----------------------------------------------------------------
    units_by_community = {}
    for u in units:
        if u.get("community_name"):
            units_by_community.setdefault(u["community_name"], []).append(u)

    same_project_ask_deal_projects = []
    for project, resale_rows in resale_by_project.items():
        young_resale = [r for r in resale_rows if r.get("age_years") is not None and 0 <= r["age_years"] < 3]
        young_ask = [u for u in units_by_community.get(project, []) if u.get("age_years") is not None and 0 <= u["age_years"] < 3 and u.get("adj_unitprice") is not None]
        if young_resale and young_ask:
            same_project_ask_deal_projects.append({"project_name": project, "ask": young_ask, "deal": young_resale})

    ask_premium = None
    ask_premium_source = None
    ask_premium_detail = {}
    if len(same_project_ask_deal_projects) >= 3:
        pooled_ask = sorted(u["adj_unitprice"] for p in same_project_ask_deal_projects for u in p["ask"])
        pooled_deal = sorted(r["unit_price_wan_ping_precise"] for p in same_project_ask_deal_projects for r in p["deal"])
        ask_med = statistics.median(pooled_ask)
        deal_med = statistics.median(pooled_deal)
        ask_premium = ask_med / deal_med - 1
        ask_premium_source = "same_project"
        ask_premium_detail = {
            "n_projects": len(same_project_ask_deal_projects),
            "projects": [p["project_name"] for p in same_project_ask_deal_projects],
            "ask_median": round(ask_med, 2),
            "ask_n": len(pooled_ask),
            "deal_median": round(deal_med, 2),
            "deal_n": len(pooled_deal),
        }
    else:
        area_lo, area_hi = params["similar_product_area_range"]
        fallback_ask = sorted(
            u["adj_unitprice"]
            for u in units
            if u.get("age_years") is not None and 0 <= u["age_years"] < 3 and u.get("adj_area") is not None and area_lo <= u["adj_area"] <= area_hi and u.get("adj_unitprice") is not None
        )
        fallback_deal = sorted(
            d["unit_price_wan_ping_precise"]
            for d in deals
            if d.get("deal_kind") == "resale"
            and not d.get("special")
            and not d.get("car_lumped")
            and d.get("age_years") is not None
            and 0 <= d["age_years"] < 3
            and d.get("area_ping") is not None
            and area_lo <= d["area_ping"] <= area_hi
            and d.get("unit_price_wan_ping_precise") is not None
        )
        if fallback_ask and fallback_deal:
            ask_med = statistics.median(fallback_ask)
            deal_med = statistics.median(fallback_deal)
            ask_premium = ask_med / deal_med - 1
            ask_premium_source = "age_bucket_fallback"
            ask_premium_detail = {
                "n_projects": len(same_project_ask_deal_projects),
                "note": f"同建案樣本只有 {len(same_project_ask_deal_projects)} 個（不足3個），退回用屋齡0-3年、24-35坪、青埔全區（不分建案）的開價/成交中位數比。",
                "ask_median": round(ask_med, 2),
                "ask_n": len(fallback_ask),
                "deal_median": round(deal_med, 2),
                "deal_n": len(fallback_deal),
            }
    log(f"ask premium: source={ask_premium_source} value={ask_premium} detail={ask_premium_detail}")

    # -----------------------------------------------------------------
    # 4) 去化速度：屋齡0-3年、24-35坪（扣車位）的青埔中古成交月均去化，供任何一戶
    #    試算「要多久」時當分母（分子＝排隊戶數，前端用選定戶的建議開價跟591開價
    #    換算後的清單比對，這裡只算分母）。
    # -----------------------------------------------------------------
    area_lo, area_hi = params["similar_product_area_range"]
    lag = params["absorption_lag_months"]
    months_window = params["similar_product_months"]

    similar_deal_young = [
        d
        for d in deals
        if d.get("deal_kind") == "resale"
        and not d.get("special")
        and not d.get("car_lumped")
        and d.get("age_years") is not None
        and 0 <= d["age_years"] < 3
        and d.get("area_ping") is not None
        and area_lo <= d["area_ping"] <= area_hi
        and d.get("unit_price_wan_ping_precise") is not None
    ]

    current_month_start = today.replace(day=1)
    month_buckets = []
    m = current_month_start
    for _ in range(months_window):
        month_buckets.append(m.strftime("%Y-%m"))
        m = (m - datetime.timedelta(days=1)).replace(day=1)
    month_buckets.sort()

    counts_by_month = {}
    for d in similar_deal_young:
        mk = month_key(d["date"])
        if mk in month_buckets:
            counts_by_month[mk] = counts_by_month.get(mk, 0) + 1
    monthly_series = [{"month": mb, "n": counts_by_month.get(mb, 0)} for mb in month_buckets]
    usable_months = month_buckets[:-lag] if lag > 0 else month_buckets
    usable_counts = [counts_by_month.get(mb, 0) for mb in usable_months]
    absorption = (sum(usable_counts) / len(usable_months)) if usable_months else None
    log(f"absorption (屋齡0-3年、{area_lo}-{area_hi}坪，通用分母): avg_per_month={absorption}")

    # -----------------------------------------------------------------
    # 5) 仰森591開價換算對照池：所有仰森591在售戶（含樓層、扣車位後單價、坪數），
    #    前端會依「選定戶自己的預售坪數」篩出同型戶，再用 floor_fit 換算到選定樓層。
    #    這裡只整理原始池，不預先篩選、不預先換算到任何特定樓層。
    # -----------------------------------------------------------------
    yx_ask_pool = [
        {
            "unit_id": u.get("unit_id"),
            "floor": parse_591_floor(u.get("floor")),
            "adj_unitprice": u.get("adj_unitprice"),
            "adj_area": u.get("adj_area"),
            "raw_area": u.get("raw_area"),
            "has_carport": u.get("has_carport"),
        }
        for u in units
        if u.get("is_yuanxiong") and u.get("adj_unitprice") is not None and parse_591_floor(u.get("floor")) is not None
    ]

    result = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "floor_fit": {
            "n": len(fit_rows),
            "pooled_slope": round(pooled_slope, 4),
            "pooled_intercept": round(pooled_intercept, 2),
            "by_building": by_building,
            "by_unit_code": by_unit_code,
            "min_n_unit_code": params["floor_fit_min_n_unit_code"],
            "min_n_building": params["floor_fit_min_n_building"],
        },
        "same_project_uplift": {
            "rows": uplift_rows,
            "n_projects": len(uplift_rows),
            "median": round(uplift_median, 4) if uplift_median is not None else None,
            "p25": round(uplift_p25, 4) if uplift_p25 is not None else None,
            "p75": round(uplift_p75, 4) if uplift_p75 is not None else None,
        },
        "ask_premium": {
            "value": round(ask_premium, 4) if ask_premium is not None else None,
            "source": ask_premium_source,
            "detail": ask_premium_detail,
        },
        "absorption": {
            "monthly_series": monthly_series,
            "window_months": months_window,
            "lag_months": lag,
            "usable_months": usable_months,
            "avg_per_month": round(absorption, 2) if absorption is not None else None,
            "filter": "屋齡0-3年、24-35坪（扣車位）、真中古成交",
        },
        "cross_check_ask_pool": {
            "units": yx_ask_pool,
            "n": len(yx_ask_pool),
            "adj_area_tolerance": params["cross_check_adj_area_tolerance"],
            "raw_area_tolerance": params["cross_check_raw_area_tolerance"],
            "note": "仰森591在售戶原始池，前端依選定戶自己的預售坪數±容許值篩出同型戶，再用 floor_fit 的斜率換算到選定樓層，當作對照（不是主方法）。",
        },
        "capital_gains_tax_note": params["capital_gains_tax_note"],
    }

    with open(config.ESTIMATE_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    log(
        f"done. floor_fit_unit_codes={len(by_unit_code)} uplift_median={uplift_median} "
        f"ask_premium={ask_premium} absorption={absorption}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
