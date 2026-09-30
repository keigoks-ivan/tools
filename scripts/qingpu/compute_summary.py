# -*- coding: utf-8 -*-
"""
「一頁看懂」用的小檔：把 units.json / deals.json（仰森現況、最近一筆成交）、
estimate.json（同建案漲幅）、demand.json（供需對照）、outlook.json（三個情境倍數、
未來8季存量/成交推算）已經算好的數字，抓出總覽頁需要的最小集合，寫成
data/summary.json。目的是讓網頁第一次載入只抓這一個小檔就能畫出「總覽」分頁，
不用等 deals.json（11MB，CDN 剛部署時常常是冷的，抓很慢）。

這支不重新計算任何統計量，只組裝其他幾支已經算好的數字；三句話結論的文字也在
這裡寫好（跟其他 compute_*.py 一樣，網頁只負責顯示、不現場組句子）。

依賴 data/units.json、data/deals.json、data/estimate.json、data/demand.json、
data/outlook.json、data/meta.json，全部都要先跑完（run.sh 裡排在
compute_price_outlook.py 之後）。任一來源缺就把對應欄位留 null，不讓整支腳本掛掉。

用法：
    python3 compute_summary.py
"""
import datetime
import json
import sys

import config


def log(msg):
    print(f"[compute_summary] {msg}", file=sys.stderr)


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default if default is not None else {}


def median(values):
    vals = sorted(v for v in values if v is not None)
    n = len(vals)
    if not n:
        return None
    mid = n // 2
    return vals[mid] if n % 2 else (vals[mid - 1] + vals[mid]) / 2


def fmt_pct0(x):
    return f"{round(x * 100)}%" if x is not None else "--"


def fmt1(x):
    return f"{x:.1f}" if x is not None else "--"


def main():
    units = load_json(config.UNITS_JSON, {}).get("units", [])
    deals = load_json(config.DEALS_JSON, {}).get("deals", [])
    estimate = load_json(config.ESTIMATE_JSON, {})
    demand = load_json(config.DEMAND_JSON, {})
    outlook = load_json(config.OUTLOOK_JSON, {})
    meta = load_json(config.META_JSON, {})
    supply_demand = load_json(config.SUPPLY_DEMAND_JSON, {})

    # -- 仰森現在開價：每坪中位數（扣車位）+ 約N戶在賣 -----------------------
    yx_units = [u for u in units if u.get("is_yuanxiong")]
    yx_median_ask = median([u.get("adj_unitprice") for u in yx_units])
    n_onsale = len(yx_units)

    yx_deals = sorted(
        (d for d in deals if d.get("is_yuanxiong")),
        key=lambda d: d.get("date") or "",
        reverse=True,
    )
    last_deal = None
    if yx_deals:
        d0 = yx_deals[0]
        last_deal = {
            "date": d0.get("date"),
            "unit_price_wan_ping": d0.get("unit_price_wan_ping"),
            "floor_label": d0.get("floor_label"),
            "deal_kind": d0.get("deal_kind"),
        }

    # -- 轉手價比預售價：同建案中位漲幅（n個建案） ---------------------------
    uplift = estimate.get("same_project_uplift", {}) or {}
    uplift_out = {
        "median": uplift.get("median"),
        "p25": uplift.get("p25"),
        "p75": uplift.get("p75"),
        "n_projects": uplift.get("n_projects"),
    }

    # -- 一年要賣 vs 賣得掉 --------------------------------------------------
    cw = demand.get("crosswalk", {}) or {}
    current_stock = cw.get("current_onsale_stock")
    future_new = cw.get("future_4q_new_supply_total")
    trailing_absorb = cw.get("trailing_4q_absorption_total")
    total_to_sell = (
        round(current_stock + future_new)
        if current_stock is not None and future_new is not None
        else None
    )
    one_year_sold = round(trailing_absorb) if trailing_absorb is not None else None
    gap = (
        total_to_sell - one_year_sold
        if total_to_sell is not None and one_year_sold is not None
        else None
    )
    supply_vs_sales = {
        "current_onsale_stock": current_stock,
        "future_4q_new_supply_total": future_new,
        "trailing_4q_absorption_total": trailing_absorb,
        "total_to_sell": total_to_sell,
        "one_year_sold": one_year_sold,
        "gap": gap,
    }

    # -- 價格三種情況：收斂/維持/回升倍數 ------------------------------------
    scenarios_src = outlook.get("scenarios", {}) or {}
    scenarios = {}
    for name, s in scenarios_src.items():
        mult = s.get("multiplier", s.get("index"))
        scenarios[name] = {"multiplier": mult, "basis": s.get("basis")}

    # -- 首屏關鍵圖：青埔全區（跟卡片同一個範圍），未來8季每季「上季留下沒賣掉的＋本季新增」
    #    vs「本季賣掉」。賣掉速度＝近4季轉手成交季均，新增＝交屋後拿出來賣＋建商未售。
    fq = ((supply_demand.get("supply") or {}).get("release_rate") or {}).get("future_quarters") or []
    per_q_sold = (trailing_absorb / 4) if trailing_absorb is not None else None
    kc_quarters, kc_carry, kc_new, kc_sold, kc_left = [], [], [], [], []
    stock = float(current_stock) if current_stock is not None else None
    for r in fq[:8]:
        if stock is None or per_q_sold is None:
            break
        new_q = float(r.get("new_listings_mid") or 0)
        available = stock + new_q
        sold = min(available, per_q_sold)
        kc_quarters.append(r.get("quarter"))
        kc_carry.append(round(stock))
        kc_new.append(round(new_q))
        kc_sold.append(round(sold))
        stock = available - sold
        kc_left.append(round(stock))
    key_chart = {
        "quarters": kc_quarters,
        "carry_over": kc_carry,
        "new_supply": kc_new,
        "sold": kc_sold,
        "left_after": kc_left,
        "scope_note": "青埔全區、所有屋齡坪數；賣掉速度用近4季轉手成交季均，未來各季不變",
    }

    # -- 三句話結論（白話、結論先行，跟其他 compute 腳本一樣文字寫在這裡） ----
    sentences = []
    if yx_median_ask is not None:
        sentences.append(
            f"仰森591去重後在售約 {n_onsale} 戶，開價中位數 {fmt1(yx_median_ask)} 萬/坪（已扣車位）。"
        )
    if uplift_out["median"] is not None:
        sentences.append(
            f"同建案轉手成交比預售價中位數貴 {fmt_pct0(uplift_out['median'])}，"
            f"樣本是 {uplift_out['n_projects']} 個建案。"
        )
    if total_to_sell is not None and one_year_sold is not None:
        left_clause = f"，照這個速度一年後約有 {gap} 戶還沒賣掉" if gap is not None and gap > 0 else ""
        sentences.append(
            f"青埔現在在售加上未來一年新增，要賣的約 {total_to_sell} 戶；"
            f"近一年轉手成交約 {one_year_sold} 戶{left_clause}。"
        )

    result = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "updated_at": {
            "lvr": (meta.get("lvr") or {}).get("last_run"),
            "house591": (meta.get("house591") or {}).get("last_run"),
            "house591_rent": (meta.get("house591_rent") or {}).get("last_run"),
        },
        "yx_current": {
            "median_ask_per_ping": round(yx_median_ask, 1) if yx_median_ask is not None else None,
            "n_onsale": n_onsale,
            "last_deal": last_deal,
        },
        "uplift": uplift_out,
        "supply_vs_sales": supply_vs_sales,
        "scenarios": scenarios,
        "key_chart": key_chart,
        "sentences": sentences,
    }

    with open(config.SUMMARY_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)

    log(
        f"done. n_onsale={n_onsale} median_ask={yx_median_ask} uplift_median={uplift_out['median']} "
        f"total_to_sell={total_to_sell} one_year_sold={one_year_sold}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
