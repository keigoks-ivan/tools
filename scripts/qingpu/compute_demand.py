# -*- coding: utf-8 -*-
"""
「青埔需求」：成交量（依交易性質/坪數帶/總價帶拆分＋年增率）、租賃需求（實價登錄
租賃C檔＋591在租物件數＋毛租金收益率）、人口與家戶（月度戶數/人口＋年齡結構＋
戶量，取代舊版只有戶數/人口的季度序列）、購屋負擔（房貸月付、房價所得比）、
供需對照（未來4季新增待售 vs 近4季去化 vs 家戶成長推算需求，都按坪數帶拆分）。

全部在這裡算好寫進 data/demand.json，網頁只負責顯示、不現場算。人口/所得資料是
額外對外呼叫，任一失敗都不擋掉其他區塊（那個子區塊留空、status 標記失敗）。

依賴 data/deals.json（fetch_lvr.py）、data/rental.json（fetch_lvr.py）、
data/supply_demand.json（compute_supply.py，要先跑過，j 對照表要用它的未來供給
數字）、data/meta.json 的 house591_rent 區塊（fetch_591_rent.py，non-blocking）。

用法：
    python3 compute_demand.py
"""
import csv
import datetime
import io
import json
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

import config
from compute_supply import quarter_index, quarter_label, percentile


def log(msg):
    print(f"[compute_demand] {msg}", file=sys.stderr)


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default if default is not None else {}


SIZE_KEYS = ["small", "mid", "large"]
BAND_KEYS = ["lt1500", "1500_2000", "2000_2500", "gte2500"]
AGE_KEYS = ["new", "mid_age", "old"]  # 租賃毛收益率比較用，presale/unknown 樣本意義不大


# ===========================================================================
# F. 成交量：依交易性質(預售/預售過戶/真中古)、坪數帶、總價帶拆分，年增率
# ===========================================================================
def compute_transaction_volume(deals, today):
    monthly_by_kind = defaultdict(lambda: {"presale": 0, "presale_transfer": 0, "resale": 0})
    for d in deals:
        kind = d.get("deal_kind")
        if kind not in ("presale", "presale_transfer", "resale"):
            continue
        monthly_by_kind[d["date"][:7]][kind] += 1

    start_month = "2021-07"
    months_sorted = sorted(m for m in monthly_by_kind if m >= start_month)
    monthly_series = [
        {"month": m, **monthly_by_kind[m], "total": sum(monthly_by_kind[m].values())} for m in months_sorted
    ]
    incomplete_months = months_sorted[-2:] if len(months_sorted) >= 2 else list(months_sorted)

    quarterly_by_kind = defaultdict(lambda: {"presale": 0, "presale_transfer": 0, "resale": 0})
    quarterly_by_size = defaultdict(lambda: {k: 0 for k in SIZE_KEYS})
    quarterly_by_band = defaultdict(lambda: {k: 0 for k in BAND_KEYS})
    quarterly_resale_by_size = defaultdict(lambda: {k: 0 for k in SIZE_KEYS})
    for d in deals:
        kind = d.get("deal_kind")
        if kind not in ("presale", "presale_transfer", "resale"):
            continue
        qidx = quarter_index(d["date"])
        quarterly_by_kind[qidx][kind] += 1
        sb = d.get("size_bucket")
        if sb in SIZE_KEYS:
            quarterly_by_size[qidx][sb] += 1
            if kind == "resale":
                quarterly_resale_by_size[qidx][sb] += 1
        pb = d.get("price_band")
        if pb in BAND_KEYS:
            quarterly_by_band[qidx][pb] += 1

    all_qidx = sorted(set(quarterly_by_kind) | set(quarterly_by_size) | set(quarterly_by_band))
    quarterly_series = [
        {
            "quarter": quarter_label(q),
            **quarterly_by_kind[q],
            "total": sum(quarterly_by_kind[q].values()),
            "by_size": dict(quarterly_by_size[q]),
            "by_price_band": dict(quarterly_by_band[q]),
        }
        for q in all_qidx
    ]

    current_qidx = quarter_index(today.isoformat())
    complete_qidx = [q for q in all_qidx if q < current_qidx]
    yoy = None
    if complete_qidx:
        latest_q = complete_qidx[-1]
        prior_q = latest_q - 4
        latest_total = sum(quarterly_by_kind[latest_q].values())
        prior_total = sum(quarterly_by_kind.get(prior_q, {}).values()) if prior_q in quarterly_by_kind else None
        if prior_total:
            yoy = {
                "latest_quarter": quarter_label(latest_q),
                "latest_total": latest_total,
                "prior_year_quarter": quarter_label(prior_q),
                "prior_year_total": prior_total,
                "change_pct": round(latest_total / prior_total - 1, 4),
            }

    last4_resale_by_size = {}
    last4_idx = [q for q in complete_qidx if q >= current_qidx - 4][-4:] if complete_qidx else []
    for k in SIZE_KEYS:
        vals = [quarterly_resale_by_size[q][k] for q in last4_idx] if last4_idx else []
        last4_resale_by_size[k] = round(statistics.mean(vals), 1) if vals else None

    return {
        "monthly": monthly_series,
        "quarterly": quarterly_series,
        "incomplete_months": incomplete_months,
        "yoy": yoy,
        "resale_absorption_last4q_avg_by_size": last4_resale_by_size,
        "note": "月/季計數依「實際交易性質」分：presale=B檔預售簽約、presale_transfer=A檔配對不到B檔的預售過戶（多為110S3前的舊約）、resale=真正中古/新成屋轉手。坪數帶／總價帶統計不分交易性質、三種都算在一起，反映整體市場成交組成。",
    }


# ===========================================================================
# G. 租賃需求：實價登錄租賃(C檔)＋591在租物件數(交叉核對)＋毛租金收益率
# ===========================================================================
def compute_rental_section(rentals, deals, meta):
    market_rentals = [r for r in rentals if r.get("is_market_rate") and r.get("is_whole_unit")]
    monthly_counts = defaultdict(int)
    for r in rentals:
        monthly_counts[r["date"][:7]] += 1
    months_sorted = sorted(monthly_counts)
    monthly_series = [{"month": m, "n": monthly_counts[m]} for m in months_sorted]

    by_size_rent = {}
    for sk in SIZE_KEYS:
        vals = sorted(r["rent_per_ping"] for r in market_rentals if r.get("size_bucket") == sk and r.get("rent_per_ping"))
        by_size_rent[sk] = {"n": len(vals), "median_rent_per_ping": round(statistics.median(vals)) if vals else None}

    # 毛租金收益率：同「屋齡×坪數」cell 的租金中位數(年化，×12) ÷ 中古成交單價中位數(萬/坪→元/坪)。
    # 只用整棟(戶)出租、非社會住宅代管/包租轉租的市場行情租金；中古成交側同樣排除特殊交易/車位灌入。
    resale_by_cell = defaultdict(list)
    for d in deals:
        if d.get("deal_kind") == "resale" and not d.get("special") and not d.get("car_lumped") and d.get("unit_price_wan_ping_precise") is not None:
            resale_by_cell[(d.get("age_bucket"), d.get("size_bucket"))].append(d["unit_price_wan_ping_precise"])

    rent_by_cell = defaultdict(list)
    for r in market_rentals:
        if r.get("rent_per_ping"):
            rent_by_cell[(r.get("age_bucket"), r.get("size_bucket"))].append(r["rent_per_ping"])

    yield_rows = []
    for age_k in AGE_KEYS:
        for size_k in SIZE_KEYS:
            key = (age_k, size_k)
            rents = sorted(rent_by_cell.get(key, []))
            prices = sorted(resale_by_cell.get(key, []))
            row = {
                "age_bucket": age_k,
                "size_bucket": size_k,
                "rent_n": len(rents),
                "resale_n": len(prices),
                "median_rent_per_ping_month": round(statistics.median(rents)) if rents else None,
                "median_resale_price_per_ping": round(statistics.median(prices), 2) if prices else None,
                "gross_yield": None,
            }
            if rents and prices and len(rents) >= 3 and len(prices) >= 3:
                annual_rent = statistics.median(rents) * 12
                price_per_ping_twd = statistics.median(prices) * 10000
                if price_per_ping_twd:
                    row["gross_yield"] = round(annual_rent / price_per_ping_twd, 4)
            yield_rows.append(row)

    h591 = (meta or {}).get("house591_rent") or {}

    return {
        "monthly_count": monthly_series,
        "by_size_rent": by_size_rent,
        "gross_yield_by_age_size": yield_rows,
        "sample_total_n": len(rentals),
        "market_rate_whole_unit_n": len(market_rentals),
        "rent_591_crosscheck": h591,
        "note": "租金來源：內政部實價登錄租賃(C檔)，只算「整棟(戶)出租」且非社會住宅代管/包租轉租的市場行情租金（獨立套房/分租套房坪效不同，不併入單價比較）。毛租金收益率＝（月租金中位數×12）÷ 中古成交單價中位數，同一屋齡×坪數 cell 至少各3筆才計算，未達門檻留空；是稅前、未扣管理費/折舊/空置期的粗略毛收益率，不是實際報酬率。591在租物件數是即時在架物件的交叉核對，不做去重/扣車位等深度處理，方法跟實價登錄成交量不是同一個口徑，不能直接相減。",
    }


# ===========================================================================
# H. 人口與家戶：月度戶數/人口＋年齡結構(25-44歲/0-14歲佔比)＋戶量，ODRP014
# ===========================================================================
def roc_month_range(start_yyymm, end_yyymm):
    """列出 start 到 end（含，5碼民國年月字串，如 "11007"）之間所有月份字串。"""
    y, m = int(start_yyymm[:3]), int(start_yyymm[3:])
    ey, em = int(end_yyymm[:3]), int(end_yyymm[3:])
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y}{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def fetch_population_month(yyymm, timeout=30):
    rows = []
    page = 1
    while page <= 10:
        url = f"https://www.ris.gov.tw/rs-opendata/api/v1/datastore/ODRP014/{yyymm}?page={page}"
        req = urllib.request.Request(url, headers={"User-Agent": config.LVR_USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            log(f"population {yyymm} page {page} 失敗，跳過這個月：{e}")
            return []
        page_rows = data.get("responseData") or []
        if not page_rows:
            break
        rows.extend(page_rows)
        try:
            total_page = int(data.get("totalPage") or 1)
        except (TypeError, ValueError):
            total_page = 1
        if page >= total_page:
            break
        page += 1
    return rows


_AGE_FIELD_RANGE_CACHE = {}


def _age_field_names(lo, hi):
    """回傳 people_age_0XX_m/f 欄位名稱清單，lo/hi 為年齡（含頭尾）。100+另外處理。"""
    key = (lo, hi)
    if key in _AGE_FIELD_RANGE_CACHE:
        return _AGE_FIELD_RANGE_CACHE[key]
    names = []
    for age in range(lo, min(hi, 99) + 1):
        names.append(f"people_age_{age:03d}_m")
        names.append(f"people_age_{age:03d}_f")
    if hi >= 100:
        names += ["people_age_100up_m", "people_age_100up_f"]
    _AGE_FIELD_RANGE_CACHE[key] = names
    return names


def _sum_age_range(row, lo, hi):
    total = 0
    for name in _age_field_names(lo, hi):
        try:
            total += int(row.get(name) or 0)
        except (TypeError, ValueError):
            pass
    return total


def roc_yyymm_to_iso_month(yyymm):
    y = int(yyymm[:3]) + 1911
    m = int(yyymm[3:])
    return f"{y:04d}-{m:02d}"


def fetch_population_series(today):
    """月度抓取（ODRP014 支援每月，不是只有季底）。從 config.LVR_SEED_START_SEASON
    對應的月份開始（110S3＝2021年7月＝"11007"）到本月，每個納入的村里都存
    household/people/age_25_44/age_0_14/age_65up，供年齡結構、戶量、YoY 使用。"""
    end_yyymm = f"{today.year - 1911}{today.month:02d}"
    yyymms = roc_month_range("11007", end_yyymm)

    series = {}  # month_iso -> {label: {...}}
    fetched_months = []
    for yyymm in yyymms:
        rows = fetch_population_month(yyymm)
        if not rows:
            continue
        fetched_months.append(yyymm)
        month_iso = roc_yyymm_to_iso_month(yyymm)
        month_data = {}

        hh, ppl, a2544, a014, a65up, n = 0, 0, 0, 0, 0, 0
        for row in rows:
            if row.get("site_id") == "桃園市中壢區" and row.get("village") in ("青埔里", "青航里", "青園里"):
                hh += int(row.get("household_no") or 0)
                ppl += int(row.get("people_total") or 0)
                a2544 += _sum_age_range(row, 25, 44)
                a014 += _sum_age_range(row, 0, 14)
                a65up += _sum_age_range(row, 65, 120)
                n += 1
        month_data["青埔里(含分割)"] = {"household": hh, "people": ppl, "age_25_44": a2544, "age_0_14": a014, "age_65up": a65up, "n_villages": n}

        for site_id, vname in (("桃園市大園區", "青山里"), ("桃園市大園區", "青峰里")):
            for row in rows:
                if row.get("site_id") == site_id and row.get("village") == vname:
                    month_data[vname] = {
                        "household": int(row.get("household_no") or 0),
                        "people": int(row.get("people_total") or 0),
                        "age_25_44": _sum_age_range(row, 25, 44),
                        "age_0_14": _sum_age_range(row, 0, 14),
                        "age_65up": _sum_age_range(row, 65, 120),
                    }
                    break
        series[month_iso] = month_data
        log(f"population {yyymm} ({month_iso}) 抓到 {len(rows)} 個村里資料")
    return series, fetched_months


def compute_population_section(today):
    try:
        series, fetched_months = fetch_population_series(today)
    except Exception as e:  # noqa: BLE001
        log(f"population 整體失敗：{e}")
        return {"status": "fail", "message": str(e), "series": {}, "months_fetched": []}, None

    if not series:
        return {"status": "fail", "message": "沒有任何月份抓到資料", "series": {}, "months_fetched": []}, None

    months_sorted = sorted(series.keys())
    agg = {}
    for m in months_sorted:
        hh = sum(v.get("household", 0) for v in series[m].values())
        ppl = sum(v.get("people", 0) for v in series[m].values())
        a2544 = sum(v.get("age_25_44", 0) for v in series[m].values())
        a014 = sum(v.get("age_0_14", 0) for v in series[m].values())
        a65 = sum(v.get("age_65up", 0) for v in series[m].values())
        agg[m] = {
            "household": hh,
            "people": ppl,
            "household_size": round(ppl / hh, 2) if hh else None,
            "age_25_44_share": round(a2544 / ppl, 4) if ppl else None,
            "age_0_14_share": round(a014 / ppl, 4) if ppl else None,
            "age_65up_share": round(a65 / ppl, 4) if ppl else None,
        }

    latest = months_sorted[-1]
    yoy_key = f"{int(latest[:4]) - 1}-{latest[5:7]}"
    household_growth_yoy = None
    if yoy_key in agg and agg[yoy_key]["household"]:
        hh_latest, hh_prev = agg[latest]["household"], agg[yoy_key]["household"]
        household_growth_yoy = {
            "latest_month": latest,
            "prev_month": yoy_key,
            "household_latest": hh_latest,
            "household_prev": hh_prev,
            "new_households": hh_latest - hh_prev,
            "growth_rate": round((hh_latest - hh_prev) / hh_prev, 4),
        }

    result = {
        "status": "ok",
        "series": series,
        "aggregate_monthly": [{"month": m, **agg[m]} for m in months_sorted],
        "months_fetched": fetched_months,
        "included_villages": [
            {"site_id": s, "villages": v, "label": l} for s, v, l in config.POP_INCLUDED
        ],
        "excluded_candidates": [
            {"site_id": s, "village": v, "reason": "沒有可查驗的青埔特區界圖資，無法確認面積70%以上落在特區內，先排除"}
            for s, v in config.POP_EXCLUDED_CANDIDATES
        ],
        "household_growth_yoy": household_growth_yoy,
        "latest": {"month": latest, **agg[latest]},
        "note": "資料來源：內政部戶政司村里戶數、單一年齡人口（ODRP014），逐月抓取（該 API 本身即為月資料，2021年7月起，同時含逐歲年齡結構，可直接算年齡佔比與戶量，不需要另一個資料集）。中壢區青埔里在2024年前後分割為青埔/青航/青園三里，三里加總視為一條線。",
    }
    return result, household_growth_yoy


# ===========================================================================
# I. 購屋負擔：典型2房/3房總價 vs 桃園市家戶可支配所得、房貸月付
# ===========================================================================
DGBAS_INCOME_URL = "https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/232214/006-平均每戶可支配所得按區域別分.csv"


def fetch_taoyuan_disposable_income():
    """行政院主計總處家庭收支調查「平均每戶可支配所得按區域別分」，抓桃園市最新一年。
    純 HTTP GET＋UA，是政府公開資料，年度更新，URL 若明年跟著改版要重找。
    URL 路徑含中文檔名，urllib 的 http.client 組 request line 時只接受 ASCII，
    要先用 quote() 把中文百分號編碼過再送出，不然會炸 UnicodeEncodeError。"""
    safe_url = urllib.parse.quote(DGBAS_INCOME_URL, safe=":/?&=")
    req = urllib.request.Request(safe_url, headers={"User-Agent": config.HOUSE_591_USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    header = rows[0]
    col_idx = None
    for i, h in enumerate(header):
        if "桃園" in h:
            col_idx = i
            break
    if col_idx is None:
        raise RuntimeError("找不到桃園市欄位")
    latest_year, latest_value = None, None
    for row in rows[1:]:
        if not row or not row[0].strip():
            continue
        try:
            year = int(row[0].strip()[:4])
            value = float(row[col_idx].replace(",", ""))
        except (ValueError, IndexError):
            continue
        if latest_year is None or year > latest_year:
            latest_year, latest_value = year, value
    if latest_value is None:
        raise RuntimeError("解析不到任何一年的數值")
    return latest_year, latest_value


def mortgage_monthly_payment(total_price_twd, params):
    principal = total_price_twd * params["ltv"]
    r = params["rate_annual"] / 12
    n = params["years"] * 12
    if r == 0:
        return round(principal / n)
    payment = principal * r / (1 - (1 + r) ** (-n))
    return round(payment)


def compute_affordability_section(deals, today):
    cutoff_12mo = (today - datetime.timedelta(days=365)).isoformat()
    recent = [
        d for d in deals
        if d.get("deal_kind") in ("presale", "resale") and not d.get("special") and not d.get("car_lumped")
        and d.get("date", "") >= cutoff_12mo and d.get("total_price_wan") is not None
    ]
    typical = {}
    # small(<30坪) 近似 2房、mid(30-45坪) 近似 3房；粗略對應，見網頁註記。
    for key, label in (("small", "2房 (<30坪)"), ("mid", "3房 (30-45坪)")):
        prices = sorted(d["total_price_wan"] for d in recent if d.get("size_bucket") == key)
        typical[key] = {"label": label, "n": len(prices), "median_total_price_wan": round(statistics.median(prices)) if prices else None}

    income_year = income_value = None
    income_status = "ok"
    income_message = ""
    try:
        income_year, income_value = fetch_taoyuan_disposable_income()
    except Exception as e:  # noqa: BLE001
        income_status = "fail"
        income_message = str(e)
        log(f"DGBAS 所得資料抓取失敗：{e}")

    rows = []
    for key, t in typical.items():
        row = {
            "size_bucket": key,
            "label": t["label"],
            "n": t["n"],
            "median_total_price_wan": t["median_total_price_wan"],
            "pir": None,
            "mortgage_monthly": None,
            "payment_to_income_ratio": None,
        }
        if t["median_total_price_wan"] is not None and income_value:
            total_twd = t["median_total_price_wan"] * 10000
            row["pir"] = round(total_twd / income_value, 2)
            monthly = mortgage_monthly_payment(total_twd, config.MORTGAGE_PARAMS)
            row["mortgage_monthly"] = monthly
            row["payment_to_income_ratio"] = round(monthly * 12 / income_value, 4)
        rows.append(row)

    return {
        "status": income_status,
        "message": income_message,
        "income_year": income_year,
        "income_annual_twd": income_value,
        "income_source": "行政院主計總處家庭收支調查，平均每戶可支配所得，按區域別（桃園市），非青埔特區專屬數字",
        "mortgage_assumption": config.MORTGAGE_PARAMS,
        "rows": rows,
        "note": "典型2房/3房用坪數帶(小<30坪／中30-45坪)近似對應房型，不是嚴格的房型統計；總價取近12個月預售+中古成交中位數。房貸月付為假設情境（利率/年期/成數見 mortgage_assumption），不是特定銀行核貸條件。可支配所得是桃園市全市數字，不是青埔特區居民的所得。",
    }


# ===========================================================================
# J. 供需對照：未來4季新增待售(按坪數帶) vs 近4季去化(按坪數帶) vs 家戶成長推算需求
# ===========================================================================
def compute_crosswalk(supply_demand, transaction_volume, population, current_units_count):
    future_q = ((supply_demand.get("supply") or {}).get("release_rate") or {}).get("future_quarters") or []
    future_4q = future_q[:4]
    supply_4q_by_size = {k: round(sum((q.get("new_listings_by_size") or {}).get(k, 0) for q in future_4q), 1) for k in SIZE_KEYS}
    supply_4q_total = round(sum(supply_4q_by_size.values()), 1)

    absorption_by_size = transaction_volume.get("resale_absorption_last4q_avg_by_size") or {}
    absorption_4q_by_size = {k: round((absorption_by_size.get(k) or 0) * 4, 1) for k in SIZE_KEYS}
    absorption_4q_total = round(sum(absorption_4q_by_size.values()), 1)

    hh_growth = (population or {}).get("household_growth_yoy") or {}
    new_households = hh_growth.get("new_households")
    implied_demand = None
    if new_households is not None:
        implied_demand = round(new_households * config.HOUSEHOLD_TO_DEMAND_OWNERSHIP_SHARE, 1)

    rows = [
        {
            "size_bucket": k,
            "future_4q_new_supply": supply_4q_by_size.get(k),
            "trailing_4q_absorption": absorption_4q_by_size.get(k),
            "gap": round((supply_4q_by_size.get(k) or 0) - (absorption_4q_by_size.get(k) or 0), 1),
        }
        for k in SIZE_KEYS
    ]

    return {
        "rows": rows,
        "future_4q_new_supply_total": supply_4q_total,
        "trailing_4q_absorption_total": absorption_4q_total,
        "current_onsale_stock": current_units_count,
        "household_growth_implied_demand": {
            "new_households_yoy": new_households,
            "ownership_share_assumption": config.HOUSEHOLD_TO_DEMAND_OWNERSHIP_SHARE,
            "implied_new_ownership_demand": implied_demand,
            "note": "新增家戶數(YoY) × 假設的自住購屋轉化比例，這個比例是明確標註的假設值（不是實測），且沒有拆坪數帶，只能跟上面按坪數帶拆分的供給/去化總量對照，不能逐格比。",
        },
        "note": "trailing_4q_absorption 只用「真中古」成交（真正的市場轉手，不含預售簽約），近4個完整季平均×4；future_4q_new_supply 是 compute_supply.py 已經按建案坪數結構、釋出率算好的新增待售，不是新增交屋戶數本身。gap>0 代表未來供給快於近期去化速度，gap<0 反過來，這是速度比較不是存量比較。",
    }


def main():
    today = datetime.date.today()

    deals = load_json(config.DEALS_JSON, {}).get("deals", [])
    rentals = load_json(config.RENTAL_JSON, {}).get("rentals", [])
    units = load_json(config.UNITS_JSON, {}).get("units", [])
    supply_demand = load_json(config.SUPPLY_DEMAND_JSON, {})
    meta = load_json(config.META_JSON, {})
    if not deals:
        log("讀不到 data/deals.json，中止")
        return 1
    if not supply_demand:
        log("讀不到 data/supply_demand.json（compute_supply.py 要先跑過），供需對照(J)會缺未來供給數字")

    transaction_volume = compute_transaction_volume(deals, today)
    log(f"transaction_volume: months={len(transaction_volume['monthly'])} quarters={len(transaction_volume['quarterly'])} yoy={transaction_volume['yoy']}")

    rental_section = compute_rental_section(rentals, deals, meta)
    log(f"rental: n_rentals={rental_section['sample_total_n']} market_whole_unit_n={rental_section['market_rate_whole_unit_n']}")

    population_section, household_growth_yoy = compute_population_section(today)
    log(f"population: status={population_section.get('status')} months={len(population_section.get('months_fetched') or [])} yoy={household_growth_yoy}")

    affordability_section = compute_affordability_section(deals, today)
    log(f"affordability: income_status={affordability_section['status']} income_year={affordability_section['income_year']}")

    crosswalk = compute_crosswalk(supply_demand, transaction_volume, population_section, len(units))
    log(f"crosswalk: supply_4q_total={crosswalk['future_4q_new_supply_total']} absorption_4q_total={crosswalk['trailing_4q_absorption_total']}")

    result = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "transaction_volume": transaction_volume,
        "rental": rental_section,
        "population": population_section,
        "affordability": affordability_section,
        "crosswalk": crosswalk,
    }

    with open(config.DEMAND_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)

    log("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
