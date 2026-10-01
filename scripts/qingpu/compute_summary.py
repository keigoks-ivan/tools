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
    compare = load_json(config.COMPARE_JSON, None)

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
    # 首頁（結論、卡片、關鍵圖）的一年轉手量統一用「桃園各區比較」的官方口徑（所有屋齡、
    # 只排除預售交屋登記與親友/員工交易），跟行政區比較同一個數字，避免同一頁出現兩個轉手量。
    _qd_resale = ((compare or {}).get("qingpu_district_row") or {}).get("resale_1y")
    if _qd_resale:
        trailing_absorb = float(_qd_resale)
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

    # -- 結論與各章一句話結論：規則式，先下判斷、再用數字撐；每月跟著資料重寫 --------
    def fi(x):
        return f"{int(round(x)):,}" if x is not None else "--"

    def f1(x):
        return f"{x:.1f}" if x is not None else "--"

    cmp_ = compare or {}
    zones = cmp_.get("zones") or []
    qz = next((z for z in zones if z.get("id") == "qingpu"), {})
    qvd = cmp_.get("qingpu_vs_taoyuan_districts") or {}
    city = cmp_.get("city") or {}
    dist_rows = cmp_.get("districts") or []
    # 青埔在行政區口徑下的轉手/換手率（所有屋齡）
    q_turn = None
    for b in ((cmp_.get("report") or {}).get("arguments") or []):
        if b.get("key") == "liquidity":
            for r in b.get("table") or []:
                if r.get("is_qingpu"):
                    q_turn = r.get("turnover_pct")
    city_turn = city.get("turnover_pct")
    def zn(z):
        return (z.get("name") or "").replace("（龜山）", "")

    ranked_zones = [z for z in zones if not z.get("small_sample") and z.get("id") != "qingpu"]

    pop = demand.get("population") or {}
    hg = pop.get("household_growth_yoy") or {}
    latest_pop = pop.get("latest") or {}
    tv = demand.get("transaction_volume") or {}
    yoy = tv.get("yoy") or {}
    aff = demand.get("affordability") or {}
    aff_rows = {r.get("size_bucket"): r for r in (aff.get("rows") or [])}

    sup = supply_demand.get("supply") or {}
    unsold = sup.get("unsold") or {}
    rel = sup.get("release_rate") or {}
    fq4 = (rel.get("future_quarters") or [])[:4]
    handover_4q = sum((q.get("units_handover") or 0) for q in fq4)

    facts = outlook.get("premium_index_facts") or {}
    last4 = facts.get("last4_complete") or {}
    low = facts.get("lowest_n_ge_min") or {}
    peak = facts.get("peak") or {}

    sentences = []
    # 1. 現在的問題：供給多，不是沒人買（主要指標：前後兩年完工壓力＝（近兩年已完工＋
    #    未來兩年預計完工）÷兩年轉手量的4年份，見「怎麼算的」；近兩年完工÷兩年轉手、
    #    未完工消化年數兩個舊指標降為次要欄位，留在 zone_card 給收合區塊用）
    qd = cmp_.get("qingpu_district_row") or {}
    qc, cc = qz.get("ratio_completed_to_resale"), city.get("ratio_completed_to_resale")
    qdc = qd.get("ratio_completed_to_resale")
    qw, city_w4y = qz.get("ratio_window4y"), city.get("ratio_window4y")
    qdw = qd.get("ratio_window4y")
    if qdw is not None and city_w4y is not None:
        lead = (
            "青埔現在的問題是要賣的房子太多，不是沒人買"
            if (qvd.get("rank_window4y") == 1 and q_turn is not None and city_turn is not None and q_turn >= city_turn)
            else ("青埔的供給壓力高於全市，成交量能也偏弱" if (q_turn is not None and city_turn is not None and q_turn < city_turn)
                  else "青埔的供給壓力高於全市")
        )
        rank_note = "，全桃園最高" if qvd.get("rank_window4y") == 1 else ""
        resale2y = qd.get("resale_2y")
        resale4y = resale2y * 2 if resale2y is not None else None
        s1 = (f"{lead}：近兩年完工 {fi(qd.get('completed_2y_units'))} 戶加上未來兩年預計完工 {fi(qd.get('expected_next_2y_units_total'))} 戶，"
              f"是兩年轉手量4年份（{fi(resale4y)} 戶）的 {f1(qdw)} 倍（全市 {f1(city_w4y)} 倍{rank_note}）")
        if q_turn is not None and city_turn is not None:
            s1 += f"；但換手率 {q_turn:.2f}% 也高於全市 {city_turn:.2f}%"
        sentences.append(s1 + "。")
    # 2. 未來：預計完工還有一波，但不是重劃區裡壓力最大的（同一個前後兩年完工壓力指標，
    #    改用重劃區口徑比）
    qzw = qz.get("ratio_window4y")
    if qzw is not None and qdw is not None:
        heavier = sorted([z for z in ranked_zones if (z.get("ratio_window4y") or 0) > qzw],
                         key=lambda z: -z["ratio_window4y"])
        lighter = sorted([z for z in ranked_zones if z.get("ratio_window4y") is not None and z["ratio_window4y"] < qzw],
                         key=lambda z: z["ratio_window4y"])
        overdue = qd.get("expected_next_2y_overdue_units") or 0
        s2 = (f"未來兩年預計完工 {fi(qd.get('expected_next_2y_units_total'))} 戶"
              + (f"（含官方還沒登記、推算已逾期的 {fi(overdue)} 戶）" if overdue else "")
              + f"，前後兩年完工壓力在全桃園排第 {qvd.get('rank_window4y')}（全市 {f1(city_w4y)} 倍）")
        if heavier:
            s2 += "；重劃區裡 " + "、".join(f"{zn(z)} {f1(z['ratio_window4y'])} 倍" for z in heavier[:2]) + f"比青埔（{f1(qzw)} 倍）壓力更高"
        if lighter:
            s2 += f"，{zn(lighter[0])}（{f1(lighter[0]['ratio_window4y'])} 倍）較低"
        sentences.append(s2 + "。")
    # 3. 需求：人在進來
    if hg.get("growth_rate") is not None:
        s3 = f"需求在長：青埔村里戶數一年增加 {fi(hg.get('new_households'))} 戶（+{hg['growth_rate']*100:.1f}%）"
        if yoy.get("change_pct") is not None:
            s3 += f"，{yoy.get('latest_quarter')} 成交 {fi(yoy.get('latest_total'))} 件、比去年同季{'多' if yoy['change_pct']>=0 else '少'} {abs(yoy['change_pct'])*100:.0f}%"
        sentences.append(s3 + "。")
    # 4. 價格：撐住，但上檔被壓
    if uplift_out["median"] is not None and last4.get("median") is not None:
        s4 = (f"價格撐住但往上的空間被供給壓著：同建案轉手比預售貴 {fmt_pct0(uplift_out['median'])}（{uplift_out['n_projects']} 案）；"
              f"轉手價是預售價的 {last4['median']:.2f} 倍（近四季），")
        if peak.get("median") is not None:
            s4 += f"低於 2024 高點的 {peak['median']:.2f} 倍"
        sentences.append(s4 + "。")
    # 5. 對賣方
    if total_to_sell is not None and one_year_sold is not None:
        sentences.append(
            f"對賣方來說，開價決定要排多久：現在在售（591 去重後）加上未來一年新增約 {fi(total_to_sell)} 戶，"
            f"近一年轉手約 {fi(one_year_sold)} 戶，照這個速度一年後約 {fi(gap)} 戶還沒賣掉。"
        )

    chapter = {}
    s_sup = f"未來一年供給集中：未來 4 季預計交屋約 {fi(handover_4q)} 戶（逾期未完工的案子平均攤入）"
    if unsold.get("total_unsold") is not None:
        s_sup += f"；還沒完工的案子裡，建商手上還沒賣掉約 {fi(unsold['total_unsold'])} 戶（{unsold.get('n_selling', 0)} 個案子近 6 個月仍在簽約）"
    if rel.get("median") is not None:
        s_sup += f"；已賣掉的交屋後約 {rel['median']*100:.1f}% 會拿出來賣"
    if cw.get("future_4q_new_supply_total") is not None:
        s_sup += f"，合計推估未來 4 季新增待售約 {fi(cw['future_4q_new_supply_total'])} 戶"
    chapter["supply"] = s_sup + "。"

    s_dem = ""
    if hg.get("growth_rate") is not None:
        s_dem = f"需求在長，但買得起的門檻高：戶數一年 +{hg['growth_rate']*100:.1f}%（{fi(hg.get('new_households'))} 戶）"
        if latest_pop.get("age_25_44_share") is not None:
            s_dem += f"，25–44 歲占 {latest_pop['age_25_44_share']*100:.0f}%"
    small = aff_rows.get("small") or {}
    if small.get("median_total_price_wan") is not None and small.get("pir") is not None:
        s_dem += (f"；小坪（2 房）總價中位 {fi(small['median_total_price_wan'])} 萬，是桃園家庭一年可支配所得的 {small['pir']:.1f} 倍"
                  f"，房貸月付約 {small.get('mortgage_monthly', 0)/10000:.1f} 萬")
    chapter["demand"] = (s_dem or "需求資料不足") + "。"

    if last4.get("median") is not None:
        chapter["price"] = (
            f"同建案轉手價近四季是預售價的 {last4['median']:.2f} 倍"
            + (f"（2024 高點 {peak['median']:.2f} 倍、{low.get('quarter')} 低點 {low['value']:.2f} 倍）" if peak.get("median") and low.get("value") else "")
            + "；過去資料裡供給多寡和後續價格沒有穩定關係，所以只給三種情況、不給漲跌幅。"
        )
    zone_card = None
    if qdw is not None:
        zone_card = {
            # 主要指標：前後兩年完工壓力（行政區口徑，所有屋齡，跟全市數字可以直接比）
            "ratio_window4y": qdw,
            "ratio_window4y_zone": qzw,  # 重劃區口徑（只算2010年後完工的房子）
            "completed_2y": qd.get("completed_2y_units"),
            "expected_next_2y": qd.get("expected_next_2y_units"),
            "expected_next_2y_overdue": qd.get("expected_next_2y_overdue_units"),
            "expected_next_2y_total": qd.get("expected_next_2y_units_total"),
            "resale_2y": qd.get("resale_2y"),
            "resale_4y_equivalent": qd.get("resale_4y_equivalent"),
            "rank_window4y_taoyuan": qvd.get("rank_window4y"),
            "n_taoyuan": qvd.get("n"),
            "rank_window4y_zones": qz.get("rank_window4y"),
            "n_zones": cmp_.get("n_zones"),
            "city_ratio_window4y": city_w4y,
            # 次要欄位（舊指標，兩年窗口）
            "ratio_completed": qdc,
            "ratio_completed_new_only": qc,
            "rank_completed_taoyuan": qvd.get("rank_completed"),
            "rank_completed_zones": qz.get("rank_completed"),
            "city_ratio_completed": cc,
        }

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
        "chapter_conclusions": chapter,
        "zone_card": zone_card,
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
