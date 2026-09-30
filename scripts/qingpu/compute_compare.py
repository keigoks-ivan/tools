# -*- coding: utf-8 -*-
"""
「桃園各區比較」／「重劃區比較」：拿桃園市13個行政區＋新北市林口區＋幾個桃園市內
的重劃區（A7、小檜溪、中路、經國、藝文特區），跟青埔特區比同一組供給/流動性
指標，全部是官方資料，不用591（591開價/在售筆數重複刊登、屋主試探開價都會失真，
見使用者要求）。

四個指標，每個區/重劃區都算：
    1. 一年轉手量：實價登錄A檔（買賣），近4個完整季，交易標的含「建物」、
       備註不含預售屋/親友/特殊關係/員工、且不是交屋後150天內的預售交屋登記。
    2. 未完工戶數：預售屋備查（B檔備查建案），層棟戶數加總，第1次登記日期空白。
    3. 近一年完工戶數：同上，第1次登記日期在近12個月內。
    4. 總戶數：內政部戶政司村里資料（ODRP014），行政區或指定村里加總。
比值：未完工÷一年轉手、近一年完工÷一年轉手、換手率=一年轉手÷總戶數。

輸出 data/compare.json：13個行政區＋桃園全市＋青埔＋6個重劃區的數字、排名，
和用規則式模板產生的白話報告文字（結論／論證／各區逐一說明／什麼情況下結論
會錯／限制），給頁面「青埔在哪個位置」章節直接顯示，不在前端重組句子。

用法：
    python3 compute_compare.py
"""
import datetime
import json
import os
import re
import sys
from collections import Counter

import config
import fetch_lvr
from fetch_buildcase import _download as download_buildcase_csv
from compute_demand import fetch_population_month

EXCLUDE_NOTE_RE = re.compile(r"預售屋|親友|特殊關係|員工")


def log(msg):
    print(f"[compute_compare] {msg}", file=sys.stderr)


# ---------------------------------------------------------------------------
# 期間：近4個完整季，資料公告落後至少2個月（今天所在季別公告還沒公布完整），
# 所以從「今天往前推2個月」所在的那一季開始，往前抓4個完整季。
# ---------------------------------------------------------------------------
def last_complete_quarter_end(today, lag_months=2):
    cutoff_month = today.month - lag_months
    cutoff_year = today.year
    while cutoff_month <= 0:
        cutoff_month += 12
        cutoff_year -= 1
    cutoff = datetime.date(cutoff_year, cutoff_month, min(today.day, 28))
    q_end_month = ((cutoff.month - 1) // 3 + 1) * 3
    q_end = _month_end(cutoff.year, q_end_month)
    if q_end > cutoff:
        q_end_month -= 3
        year = cutoff.year
        if q_end_month <= 0:
            q_end_month += 12
            year -= 1
        q_end = _month_end(year, q_end_month)
    return q_end


def _month_end(year, month):
    if month == 12:
        return datetime.date(year, 12, 31)
    return datetime.date(year, month + 1, 1) - datetime.timedelta(days=1)


def _season_of_date(d):
    roc_year = d.year - 1911
    q = (d.month - 1) // 3 + 1
    return f"{roc_year}S{q}"


def _next_season(season):
    y, q = fetch_lvr._parse_season(season)
    q += 1
    if q > 4:
        q = 1
        y += 1
    return f"{y}S{q}"


def _quarter_end_date(season):
    return fetch_lvr.quarter_start_date(_next_season(season)) - datetime.timedelta(days=1)


def trailing_seasons(end_season, n=4):
    seasons = [end_season]
    for _ in range(n - 1):
        seasons.append(fetch_lvr.previous_season(seasons[-1]))
    return list(reversed(seasons))


# ---------------------------------------------------------------------------
# 實價登錄A檔（買賣）：一年轉手量。桃園市(h_)、新北市林口區(f_)同一個季別zip裡
# 都有，一季只抓一次zip，兩個檔案一起讀。
# ---------------------------------------------------------------------------
def _merge_rows(zip_bytes, filename, dest_by_id):
    for row in fetch_lvr._read_csv_from_zip(zip_bytes, filename):
        rid = (row.get("編號") or "").strip()
        if rid:
            dest_by_id[rid] = row


def load_resale_rows(seasons):
    """回傳 (h_by_id, f_by_id)：桃園市／新北市林口區買賣(A檔)原始列，用編號去重，
    橫跨 seasons 全部季別。季別檔抓不到（還沒公布）就退回歷史批次(1/11/21)＋最新
    一批補該季，跟 fetch_lvr.py 抓最新資料用同一組端點/快取。

    seasons 是「公布季別」，要涵蓋到今天（見 main 的說明）；最後一季（今天所在季）
    還沒有季別檔，改用歷史批次＋最新一批。"""
    h_by_id, f_by_id = {}, {}
    for i, season in enumerate(seasons):
        season_ok = False
        try:
            zip_bytes = fetch_lvr.download_season_zip(season)
            _merge_rows(zip_bytes, "h_lvr_land_a.csv", h_by_id)
            _merge_rows(zip_bytes, "f_lvr_land_a.csv", f_by_id)
            season_ok = True
            log(f"season {season}：季別檔OK")
        except Exception as e:  # noqa: BLE001
            log(f"season {season}：季別檔抓不到（{e}），改用歷史批次補")
        is_last = i == len(seasons) - 1
        if (not season_ok) or is_last:
            start = fetch_lvr.quarter_start_date(season)
            end = _quarter_end_date(season)
            for date_str in fetch_lvr.history_dates_from(start, min(end, datetime.date.today())):
                try:
                    zb = fetch_lvr.download_history_zip(date_str)
                    _merge_rows(zb, "h_lvr_land_a.csv", h_by_id)
                    _merge_rows(zb, "f_lvr_land_a.csv", f_by_id)
                except Exception:  # noqa: BLE001
                    continue
            if is_last:
                try:
                    zb = fetch_lvr.download_latest_zip()
                    _merge_rows(zb, "h_lvr_land_a.csv", h_by_id)
                    _merge_rows(zb, "f_lvr_land_a.csv", f_by_id)
                except Exception:  # noqa: BLE001
                    pass
    return h_by_id, f_by_id


RESIDENTIAL_TYPES = ("住宅大樓", "華廈", "公寓", "透天厝")


def resale_qualifies(row, period_start, period_end):
    if "建物" not in (row.get("交易標的") or ""):
        return False
    # 只算住宅（跟本站其他章節一致），店面、辦公、廠辦不算
    if "住" not in (row.get("主要用途") or "") and not any(t in (row.get("建物型態") or "") for t in RESIDENTIAL_TYPES):
        return False
    note = (row.get("備註") or "").strip()
    if EXCLUDE_NOTE_RE.search(note):
        return False
    trans_date = fetch_lvr._roc_to_date(row.get("交易年月日"))
    if not trans_date or not (period_start <= trans_date <= period_end):
        return False
    completion_date = fetch_lvr._roc_to_date(row.get("建築完成年月"))
    if completion_date is not None:
        days_since = (trans_date - completion_date).days
        if 0 <= days_since <= config.PRESALE_HANDOVER_GRACE_DAYS:
            return False  # 交屋後150天內的登記，算預售交屋登記，不算轉手
    return True


def _is_new_building(row, min_year):
    if not min_year:
        return True
    c = fetch_lvr._roc_to_date(row.get("建築完成年月"))
    if c is None:
        raw = (row.get("建築完成年月") or "").strip()
        if len(raw) >= 3 and raw[:3].isdigit():
            return int(raw[:3]) + 1911 >= min_year
        return False
    return c.year >= min_year


def count_resale_by_district(h_by_id, period_start, period_end):
    counts = Counter()
    for row in h_by_id.values():
        if not resale_qualifies(row, period_start, period_end):
            continue
        d = (row.get("鄉鎮市區") or "").strip()
        if d in config.TAOYUAN_DISTRICTS:
            counts[d] += 1
    return counts


def count_resale_qingpu(h_by_id, period_start, period_end, min_year=None):
    n = 0
    for row in h_by_id.values():
        if not resale_qualifies(row, period_start, period_end):
            continue
        if not _is_new_building(row, min_year):
            continue
        d = (row.get("鄉鎮市區") or "").strip()
        addr = (row.get("土地位置建物門牌") or "").strip()
        if config.is_qingpu_address(d, addr):
            n += 1
    return n


def count_resale_zone(rows_by_id, zone, period_start, period_end, min_year=None):
    district = zone["district"]
    roads = zone.get("roads")
    n = 0
    for row in rows_by_id.values():
        if not resale_qualifies(row, period_start, period_end):
            continue
        if not _is_new_building(row, min_year):
            continue
        d = (row.get("鄉鎮市區") or "").strip()
        if d != district:
            continue
        if roads is not None:
            addr = (row.get("土地位置建物門牌") or "").strip()
            if not any(r in addr for r in roads):
                continue
        n += 1
    return n


# ---------------------------------------------------------------------------
# 預售屋備查（B檔備查建案）：未完工戶數／近一年完工戶數。用 index-based 解析
# （不是 dict(zip(header,row))），格式跟 fetch_buildcase.py 的來源一樣，
# 但這裡要「全部鄉鎮市區」而不是只留青埔範圍，且要保留少數欄位不齊的列讓
# 呼叫端自行判斷（len<14 skip）。欄位（0-index）：
#   0鄉鎮市區 1建案名稱 2坐落街道 4層棟戶數 13第1次登記日期
# ---------------------------------------------------------------------------
def parse_buildcase_csv(raw_bytes):
    import csv
    import io
    text = raw_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    try:
        next(reader)  # 中文表頭
        next(reader)  # 英文表頭
    except StopIteration:
        return []
    rows = []
    for cols in reader:
        if len(cols) < 14:  # 少數列欄位不齊（格式雜訊），跳過
            continue
        try:
            households = int(cols[4])
        except (ValueError, IndexError):
            households = None
        rows.append({
            "district": cols[0].strip(),
            "project_name": cols[1].strip(),
            "road": cols[2].strip(),
            "households": households,
            "first_registration_roc": cols[13].strip() or None,
        })
    return rows


def load_buildcase_rows(city_prefix):
    filename = f"{city_prefix}_lvr_buildcase.csv"
    url = f"https://plvr.land.moi.gov.tw/Download?PayType=saleremark&fileName={filename}"
    raw = download_buildcase_csv(url)
    return parse_buildcase_csv(raw)


def buildcase_supply(rows, today, district=None, roads=None):
    """回傳 (未完工戶數, 近一年完工戶數)，district/roads 為 None 代表不篩選
    （呼叫端已經先篩過）。"""
    cutoff = today - datetime.timedelta(days=365)
    unfinished, completed_1y = 0, 0
    for r in rows:
        if district is not None and r["district"] != district:
            continue
        if roads is not None and not any(road in r["road"] for road in roads):
            continue
        hh = r["households"]
        if hh is None:
            continue
        reg_roc = r["first_registration_roc"]
        if not reg_roc:
            unfinished += hh
            continue
        reg_date = fetch_lvr._roc_to_date(reg_roc)
        if reg_date is not None and cutoff <= reg_date <= today:
            completed_1y += hh
    return unfinished, completed_1y


def top_projects_by_households(rows, district=None, roads=None, n=5, only_unfinished=False):
    matched = []
    for r in rows:
        if district is not None and r["district"] != district:
            continue
        if roads is not None and not any(road in r["road"] for road in roads):
            continue
        if r["households"] is None:
            continue
        if only_unfinished and r["first_registration_roc"]:
            continue
        matched.append(r)
    matched.sort(key=lambda r: r["households"], reverse=True)
    return [
        {"project_name": r["project_name"], "households": r["households"], "road": r["road"],
         "is_completed": bool(r["first_registration_roc"])}
        for r in matched[:n]
    ]


# ---------------------------------------------------------------------------
# 戶政司村里資料（ODRP014）：總戶數。
# ---------------------------------------------------------------------------
def pick_population_month(today):
    for back in range(0, 4):
        y, m = today.year, today.month - back
        while m <= 0:
            m += 12
            y -= 1
        yyymm = f"{y - 1911}{m:02d}"
        rows = fetch_population_month(yyymm)
        if rows:
            return yyymm, rows
    return None, []


def households_by_district(pop_rows):
    counts = Counter()
    for row in pop_rows:
        site_id = row.get("site_id") or ""
        if site_id.startswith("桃園市"):
            d = site_id[len("桃園市"):]
            if d in config.TAOYUAN_DISTRICTS:
                try:
                    counts[d] += int(row.get("household_no") or 0)
                except (TypeError, ValueError):
                    pass
    return counts


def households_qingpu(pop_rows):
    total = 0
    for site_id, villages, _label in config.POP_INCLUDED:
        for row in pop_rows:
            if row.get("site_id") == site_id and row.get("village") in villages:
                try:
                    total += int(row.get("household_no") or 0)
                except (TypeError, ValueError):
                    pass
    return total


def households_zone(pop_rows, zone):
    villages = zone.get("villages")
    if villages is None:
        if zone.get("roads") is None:  # 整個行政區（林口）
            site_id = zone["city"] + zone["district"]
            total = 0
            for row in pop_rows:
                if row.get("site_id") == site_id:
                    try:
                        total += int(row.get("household_no") or 0)
                    except (TypeError, ValueError):
                        pass
            return total
        return None  # 查不到可靠村里對應（例如經國重劃區）
    total = 0
    for site_id, village_list in villages:
        for row in pop_rows:
            if row.get("site_id") == site_id and row.get("village") in village_list:
                try:
                    total += int(row.get("household_no") or 0)
                except (TypeError, ValueError):
                    pass
    return total


# ---------------------------------------------------------------------------
# 比值與排名
# ---------------------------------------------------------------------------
def safe_div(a, b):
    if a is None or b is None or b == 0:
        return None
    return a / b


def rank_desc(rows, key):
    """rows 是 list[dict]，依 key 由大到小排名（1=最高），None 值排最後、不給名次。
    回傳 {row_index: rank}。"""
    valid = [(i, r[key]) for i, r in enumerate(rows) if r.get(key) is not None and not r.get("small_sample")]
    valid.sort(key=lambda t: t[1], reverse=True)
    ranks = {}
    for pos, (i, _v) in enumerate(valid, start=1):
        ranks[i] = pos
    return ranks


def build_row(name, resale_1y, unfinished, completed_1y, households, extra=None):
    ratio_unfinished = safe_div(unfinished, resale_1y)
    ratio_completed = safe_div(completed_1y, resale_1y)
    turnover_pct = safe_div(resale_1y, households) * 100 if households else None
    row = {
        "name": name,
        "resale_1y": resale_1y,
        "unfinished_units": unfinished,
        "completed_1y_units": completed_1y,
        "households": households,
        "ratio_unfinished_to_resale": round(ratio_unfinished, 2) if ratio_unfinished is not None else None,
        "ratio_completed_to_resale": round(ratio_completed, 2) if ratio_completed is not None else None,
        "turnover_pct": round(turnover_pct, 2) if turnover_pct is not None else None,
    }
    # 一年轉手太少，比值會被分母放大，列出數字但不參加排名
    row["small_sample"] = resale_1y is not None and resale_1y < config.COMPARE_MIN_RESALE_FOR_RANK
    if extra:
        row.update(extra)
    return row


def main():
    today = datetime.date.today()
    q_end = last_complete_quarter_end(today)
    end_season = _season_of_date(q_end)
    seasons = trailing_seasons(end_season, 4)
    period_start = fetch_lvr.quarter_start_date(seasons[0])
    period_end = q_end
    log(f"期間：{period_start} ~ {period_end}（季別 {seasons}）")

    status = "ok"
    message = ""

    # 實價登錄是「依公布時間」分檔，不是依成交日：成交後 30 天內申報、再過約一個月公布，
    # 期間最後一季的成交大多落在下一季（甚至下下季）才公布。所以要從期間第一季一路讀到
    # 今天所在的公布季，只讀到期間最後一季會把最後一季少算一大截。
    pub_seasons = list(seasons)
    today_season = _season_of_date(today)
    while pub_seasons[-1] != today_season:
        pub_seasons.append(_next_season(pub_seasons[-1]))
    log(f"讀取公布季別：{pub_seasons}")
    try:
        h_by_id, f_by_id = load_resale_rows(pub_seasons)
        log(f"買賣(A檔)：桃園市原始 {len(h_by_id)} 筆、新北市 {len(f_by_id)} 筆（去重後，未套用期間/條件篩選）")
    except Exception as e:  # noqa: BLE001
        status, message = "fail", f"load_resale_rows: {e}"
        log(f"FAILED: {message}")
        h_by_id, f_by_id = {}, {}

    resale_district = count_resale_by_district(h_by_id, period_start, period_end)
    resale_qingpu = count_resale_qingpu(h_by_id, period_start, period_end)
    resale_city_total = sum(resale_district.values())

    try:
        buildcase_h = load_buildcase_rows("h")
        log(f"預售屋備查（桃園市 h_lvr_buildcase.csv）：{len(buildcase_h)} 筆")
    except Exception as e:  # noqa: BLE001
        buildcase_h = []
        log(f"預售屋備查（桃園市）抓取失敗：{e}")
    try:
        buildcase_f = load_buildcase_rows("f")
        log(f"預售屋備查（新北市 f_lvr_buildcase.csv）：{len(buildcase_f)} 筆")
    except Exception as e:  # noqa: BLE001
        buildcase_f = []
        log(f"預售屋備查（新北市）抓取失敗：{e}")

    pop_month, pop_rows = pick_population_month(today)
    log(f"戶政人口月份：{pop_month}（{len(pop_rows)} 筆村里資料）")
    hh_district = households_by_district(pop_rows)
    hh_qingpu = households_qingpu(pop_rows)
    hh_city_total = sum(hh_district.values())

    # -- 13個行政區 -----------------------------------------------------------
    district_rows = []
    for d in config.TAOYUAN_DISTRICTS:
        unfinished, completed_1y = buildcase_supply(buildcase_h, today, district=d)
        district_rows.append(build_row(d, resale_district.get(d, 0), unfinished, completed_1y, hh_district.get(d)))
    ru = rank_desc(district_rows, "ratio_unfinished_to_resale")
    rc = rank_desc(district_rows, "ratio_completed_to_resale")
    rt = rank_desc(district_rows, "turnover_pct")
    for i, row in enumerate(district_rows):
        row["rank_unfinished"] = ru.get(i)
        row["rank_completed"] = rc.get(i)
        row["rank_turnover"] = rt.get(i)
    n_districts = len(district_rows)

    city_unfinished = sum(r["unfinished_units"] for r in district_rows)
    city_completed_1y = sum(r["completed_1y_units"] for r in district_rows)
    city_row = build_row("桃園全市", resale_city_total, city_unfinished, city_completed_1y, hh_city_total)

    # -- 青埔＋重劃區 -----------------------------------------------------------
    MIN_YEAR = config.ZONE_RESALE_MIN_COMPLETION_YEAR
    zone_rows = []
    sanity_top_projects = {}
    for zone in config.ZONES:
        zid = zone["id"]
        if zone.get("is_qingpu"):
            unfinished, completed_1y = 0, 0
            for r in buildcase_h:
                if config.is_qingpu_address(r["district"], r["road"]) or r["project_name"] in config.PRESALE_PROJECT_NAME_ALLOWLIST_EXTRA:
                    hh = r["households"]
                    if hh is None:
                        continue
                    reg_roc = r["first_registration_roc"]
                    if not reg_roc:
                        unfinished += hh
                    else:
                        reg_date = fetch_lvr._roc_to_date(reg_roc)
                        if reg_date is not None and (today - datetime.timedelta(days=365)) <= reg_date <= today:
                            completed_1y += hh
            resale_1y = count_resale_qingpu(h_by_id, period_start, period_end, min_year=MIN_YEAR)
            households = None  # 重劃區表不算換手率：里界跟路名框出來的範圍對不齊
            top5 = sorted(
                [r for r in buildcase_h if config.is_qingpu_address(r["district"], r["road"]) and r["households"]],
                key=lambda r: r["households"], reverse=True,
            )[:5]
        else:
            city_prefix = zone.get("file_prefix", "h")
            rows_by_id = f_by_id if city_prefix == "f" else h_by_id
            resale_1y = count_resale_zone(rows_by_id, zone, period_start, period_end, min_year=MIN_YEAR)
            bc_rows = buildcase_f if city_prefix == "f" else buildcase_h
            roads = zone.get("roads")
            unfinished, completed_1y = buildcase_supply(bc_rows, today, district=zone["district"], roads=roads)
            households = None  # 同上
            top5 = top_projects_by_households(bc_rows, district=zone["district"], roads=roads, n=5)

        row = build_row(zone["name"], resale_1y, unfinished, completed_1y, households, extra={"id": zid})
        zone_rows.append(row)
        sanity_top_projects[zid] = top5

    rzu = rank_desc(zone_rows, "ratio_unfinished_to_resale")
    rzc = rank_desc(zone_rows, "ratio_completed_to_resale")
    rzt = rank_desc(zone_rows, "turnover_pct")
    for i, row in enumerate(zone_rows):
        row["rank_unfinished"] = rzu.get(i)
        row["rank_completed"] = rzc.get(i)
        row["rank_turnover"] = rzt.get(i)
    n_zones = len([r for r in zone_rows if not r.get("small_sample")])  # 參加排名的重劃區數

    qingpu_row = next(r for r in zone_rows if r["id"] == "qingpu")
    # 跟13個行政區比時，青埔要用跟行政區一樣的口徑（所有屋齡的轉手、村里總戶數）
    qingpu_dist_row = build_row("青埔", resale_qingpu, qingpu_row["unfinished_units"], qingpu_row["completed_1y_units"],
                                hh_qingpu, extra={"id": "qingpu"})
    combined_for_rank = district_rows + [qingpu_dist_row]
    cru = rank_desc(combined_for_rank, "ratio_unfinished_to_resale")
    crc = rank_desc(combined_for_rank, "ratio_completed_to_resale")
    crt = rank_desc(combined_for_rank, "turnover_pct")
    qingpu_vs_districts = {
        "rank_unfinished": cru.get(len(district_rows)),
        "rank_completed": crc.get(len(district_rows)),
        "rank_turnover": crt.get(len(district_rows)),
        "n": len(combined_for_rank),
    }

    zone_defs = {
        z["id"]: {
            "name": z["name"],
            "district": z.get("district"),
            "city": z.get("city"),
            "roads": z.get("roads"),
            "village_note": z.get("village_note"),
        }
        for z in config.ZONES
    }

    report = build_report(qingpu_row, qingpu_dist_row, zone_rows, district_rows, city_row, qingpu_vs_districts,
                           n_districts, n_zones, sanity_top_projects, period_start, period_end)

    payload = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "qingpu_district_row": qingpu_dist_row,
        "status": status,
        "message": message,
        "period": {
            "resale_seasons": seasons,
            "resale_start": period_start.isoformat(),
            "resale_end": period_end.isoformat(),
            "completed_since": (today - datetime.timedelta(days=365)).isoformat(),
            "population_month": pop_month,
        },
        "n_districts": n_districts,
        "n_zones": n_zones,
        "districts": district_rows,
        "city": city_row,
        "zones": zone_rows,
        "qingpu_vs_taoyuan_districts": qingpu_vs_districts,
        "zone_defs": zone_defs,
        "sanity_top_projects": sanity_top_projects,
        "report": report,
    }

    os.makedirs(config.DATA_DIR, exist_ok=True)
    with open(config.COMPARE_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    log(
        f"done. 青埔: resale={resale_qingpu} unfinished={qingpu_row['unfinished_units']} "
        f"completed_1y={qingpu_row['completed_1y_units']} households={hh_qingpu} "
        f"ratio_unfinished={qingpu_row['ratio_unfinished_to_resale']} ratio_completed={qingpu_row['ratio_completed_to_resale']} "
        f"turnover={qingpu_row['turnover_pct']} | 桃園全市: resale={resale_city_total} "
        f"unfinished={city_unfinished} completed_1y={city_completed_1y} households={hh_city_total} status={status}"
    )
    return 0


# ---------------------------------------------------------------------------
# 白話報告文字（規則式模板，不是自由生成；每次跑都用當月數字重寫，月月更新一致）
# ---------------------------------------------------------------------------
def _rank_phrase(rank, total, unit_label):
    """total 一定是實際排名用的候選數（含青埔本身），不能跟前後文講的候選數不一樣，
    避免「六個重劃區裡...共7個」這種自相矛盾的句子。"""
    if rank is None or not total:
        return f"{unit_label}資料不足，無法排名"
    if rank == 1:
        return f"{total}個{unit_label}裡最高"
    if rank == total:
        return f"{total}個{unit_label}裡最低"
    if rank > (total + 1) / 2:
        return f"{total}個{unit_label}裡第{total - rank + 1}低"
    return f"{total}個{unit_label}裡第{rank}高"


def _closest_peer(qingpu_row, zone_rows, key):
    others = [r for r in zone_rows if r["id"] != "qingpu" and not r.get("small_sample") and r.get(key) is not None]
    if not others or qingpu_row.get(key) is None:
        return None
    others.sort(key=lambda r: abs(r[key] - qingpu_row[key]))
    return others[0]


def _higher_than_qingpu(zone_rows, qingpu_row, key):
    """回傳比青埔高的其他重劃區，依該指標由高到低排序，供論證段落指名。"""
    q = qingpu_row.get(key)
    if q is None:
        return []
    out = [r for r in zone_rows if r["id"] != "qingpu" and not r.get("small_sample") and r.get(key) is not None and r[key] > q]
    out.sort(key=lambda r: r[key], reverse=True)
    return out


def build_report(qingpu_row, qingpu_dist_row, zone_rows, district_rows, city_row, qvd, n_districts, n_zones,
                  sanity_top_projects, period_start, period_end):
    period_label = f"{period_start.isoformat()}~{period_end.isoformat()}"
    qc = qingpu_row.get("ratio_completed_to_resale")
    qu = qingpu_row.get("ratio_unfinished_to_resale")
    qt = qingpu_dist_row.get("turnover_pct")
    cc = city_row.get("ratio_completed_to_resale")
    ct = city_row.get("turnover_pct")

    # -- 結論（3-5句，每句一個數字）------------------------------------------
    bullets = []
    qdc = qingpu_dist_row.get("ratio_completed_to_resale")
    qdu = qingpu_dist_row.get("ratio_unfinished_to_resale")
    cu = city_row.get("ratio_unfinished_to_resale")
    if qdc is not None:
        bullets.append(
            f"跟桃園各行政區比（所有屋齡）：青埔近一年完工戶數是一年轉手量的 {qdc:.1f} 倍，"
            f"{_rank_phrase(qvd.get('rank_completed'), qvd.get('n'), '候選（13個行政區＋青埔）')}，全市 {cc:.1f} 倍；"
            f"還沒蓋好的是 {qdu:.1f} 倍，{_rank_phrase(qvd.get('rank_unfinished'), qvd.get('n'), '候選')}，全市 {cu:.1f} 倍。"
        )
    if qc is not None:
        bullets.append(
            f"跟其他重劃區比（只算 {config.ZONE_RESALE_MIN_COMPLETION_YEAR} 年後完工的房子）：青埔近一年完工是一年轉手的 {qc:.1f} 倍，"
            f"{_rank_phrase(qingpu_row.get('rank_completed'), n_zones, '重劃區（含青埔本身）')}；"
            f"還沒蓋好的是 {qu:.1f} 倍，{_rank_phrase(qingpu_row.get('rank_unfinished'), n_zones, '重劃區')}。"
        )
    if qt is not None:
        turnover_bullet = (
            f"青埔換手率 {qt:.2f}%（一年轉手量÷總戶數），"
            f"放進桃園13個行政區一起比，{_rank_phrase(qvd.get('rank_turnover'), qvd.get('n'), '候選（13個行政區＋青埔）')}"
        )
        turnover_bullet += f"，高於桃園全市平均 {ct:.2f}%。" if (ct is not None and qt >= ct) else (
            f"，低於桃園全市平均 {ct:.2f}%。" if ct is not None else "。"
        )
        bullets.append(turnover_bullet)
    pressure_desc = (
        f"在全桃園（13個行政區＋青埔）{_rank_phrase(qvd.get('rank_completed'), qvd.get('n'), '候選')}"
        f"、重劃區裡{_rank_phrase(qingpu_row.get('rank_completed'), n_zones, '重劃區').split('裡', 1)[-1]}"
    )
    if qc is not None and qt is not None and ct is not None:
        if qt >= ct:
            bullets.append(
                f"青埔完工壓力{pressure_desc}，但換手率（{qt:.2f}%）不比桃園全市平均（{ct:.2f}%）差，"
                f"目前的量沒有明顯萎縮；壓力先反映在「賣多久」，還沒反映在「有沒有人買」。"
            )
        else:
            bullets.append(
                f"青埔完工壓力{pressure_desc}、換手率（{qt:.2f}%）又低於桃園全市平均（{ct:.2f}%），"
                f"供給壓力跟成交量能同時偏弱。"
            )

    # -- 論證：三個小節 --------------------------------------------------------
    arguments = []

    peer_c = _closest_peer(qingpu_row, zone_rows, "ratio_completed_to_resale")
    higher_c = _higher_than_qingpu(zone_rows, qingpu_row, "ratio_completed_to_resale")
    supply_table = [
        {"name": r["name"], "ratio_unfinished": r.get("ratio_unfinished_to_resale"),
         "ratio_completed": r.get("ratio_completed_to_resale"), "resale_1y": r.get("resale_1y"),
         "is_qingpu": r["id"] == "qingpu"}
        for r in zone_rows
    ]
    reasoning = (
        f"青埔近一年完工÷轉手＝{qc:.1f}倍，" if qc is not None else "青埔近一年完工÷轉手資料不足，"
    )
    if higher_c:
        names = "、".join(f"{r['name']}（{r['ratio_completed_to_resale']:.1f}倍）" for r in higher_c)
        reasoning += f"比青埔更高的只有{names}，其他重劃區都低於青埔。"
    elif peer_c is not None:
        reasoning += (
            f"其他重劃區裡沒有更高的，跟青埔最接近的是{peer_c['name']}"
            f"（{peer_c['ratio_completed_to_resale']:.1f}倍），代表青埔目前在「蓋好的速度」上"
            f"是同類重劃區裡壓力最集中的一個。"
        )
    arguments.append({
        "key": "supply_pressure",
        "claim": f"青埔的完工壓力（近一年完工÷一年轉手）在{_rank_phrase(qingpu_row.get('rank_completed'), n_zones, '重劃區（含青埔本身）')}。",
        "table": supply_table,
        "reasoning": reasoning,
    })

    volume_table = [
        {"name": r["name"], "resale_1y": r.get("resale_1y"), "households": r.get("households"),
         "is_qingpu": r["id"] == "qingpu"}
        for r in zone_rows
    ]
    other_volumes = [r["resale_1y"] for r in zone_rows if r["id"] != "qingpu" and r.get("resale_1y") is not None]
    vol_reasoning = f"青埔一年轉手量 {qingpu_row.get('resale_1y')} 戶"
    if other_volumes:
        med_other = sorted(other_volumes)[len(other_volumes) // 2]
        if qingpu_row.get("resale_1y") is not None and qingpu_row["resale_1y"] < med_other:
            vol_reasoning += f"，低於其他重劃區的中位數（約 {med_other} 戶），完工÷轉手的高倍數有一部分是分母（轉手量）本身偏薄，不是分子（完工戶）特別誇張。"
        else:
            vol_reasoning += f"，不低於其他重劃區的中位數（約 {med_other} 戶），完工÷轉手偏高不是分母偏薄造成的假象。"
    arguments.append({
        "key": "volume_context",
        "claim": "完工÷轉手的倍數要對照轉手量本身的大小才看得出是分子（完工戶多）還是分母（轉手量薄）驅動的。",
        "table": volume_table,
        "reasoning": vol_reasoning,
    })

    turnover_table = [
        {"name": r["name"], "turnover_pct": r.get("turnover_pct"), "is_qingpu": False}
        for r in district_rows
    ] + [{"name": "青埔", "turnover_pct": qt, "is_qingpu": True},
         {"name": "桃園全市", "turnover_pct": city_row.get("turnover_pct"), "is_qingpu": False}]
    turnover_reasoning = f"青埔換手率 {qt:.2f}%" if qt is not None else "青埔換手率資料不足"
    if qt is not None and ct is not None:
        turnover_reasoning += f"，桃園全市 {ct:.2f}%。" + (
            "換手率沒有跟著完工壓力一起惡化，代表目前供給壓力還沒壓到成交量，是「賣得比較久」而不是「賣不掉」。"
            if qt >= ct else
            "換手率也低於全市平均，供給壓力跟成交量能同時走弱，比單純「賣得比較久」更值得留意。"
        )
    turnover_reasoning += "換手率只跟行政區比：重劃區的邊界用路名框、村里戶數對不齊，算出來的換手率不可信，所以重劃區表不列。"
    arguments.append({
        "key": "liquidity",
        "claim": f"青埔的換手率（一年轉手÷總戶數）在{_rank_phrase(qvd.get('rank_turnover'), qvd.get('n'), '候選（13個行政區＋青埔）')}。",
        "table": turnover_table,
        "reasoning": turnover_reasoning,
    })

    # -- 各區逐一說明 -----------------------------------------------------------
    zone_notes = {}
    for r in zone_rows:
        if r["id"] == "qingpu":
            continue
        top5 = sanity_top_projects.get(r["id"], [])
        names = "、".join(p["project_name"] for p in top5[:3] if p.get("project_name"))
        parts = [f"{r['name']}一年轉手 {r.get('resale_1y', 0)} 戶（{config.ZONE_RESALE_MIN_COMPLETION_YEAR}年後完工的房子）、未完工 {r.get('unfinished_units', 0)} 戶、近一年完工 {r.get('completed_1y_units', 0)} 戶。"]
        if r.get("small_sample"):
            parts.append(f"一年轉手不到 {config.COMPARE_MIN_RESALE_FOR_RANK} 戶，比值會被分母放大，不參加排名。")
        if r.get("ratio_completed_to_resale") is not None:
            parts.append(f"完工÷轉手 {r['ratio_completed_to_resale']:.1f} 倍" + (f"，高於青埔（{qc:.1f}倍）。" if qc is not None and r["ratio_completed_to_resale"] > qc else f"，低於青埔（{qc:.1f}倍）。" if qc is not None else "。"))
        if names:
            parts.append(f"未完工/近一年完工戶數裡，戶數較大的建案包含{names}。")
        zone_notes[r["id"]] = " ".join(parts)

    # -- 什麼情況下結論會錯（falsifiers，都帶門檻數字）--------------------------
    falsifiers = []
    if qingpu_row.get("completed_1y_units") and qc is not None and qc > 3:
        resale_needed = round(qingpu_row["completed_1y_units"] / 3)
        falsifiers.append(
            f"若青埔近一年轉手量從 {qingpu_row.get('resale_1y')} 戶回升到 {resale_needed} 戶以上"
            f"（近一年完工戶數的三分之一），完工÷轉手的倍數會降到3倍以下，「青埔完工壓力偏高」的結論就站不住。"
        )
    falsifiers.append(
        "未完工戶數只看官方「第1次登記日期」是否空白，不是實際完工進度；"
        "若有建案已經實際交屋但還沒完成官方登記，未完工戶數會被高估、完工÷轉手的倍數也會被低估。"
    )
    falsifiers.append(
        "近一年完工戶數如果有很大比例是建商餘屋（已完工但一直沒賣），不會真的變成轉手市場的供給；"
        "近一年完工÷轉手的倍數會高估「即將進入市場搶買方」的壓力。"
    )
    if qingpu_dist_row.get("households"):
        falsifiers.append(
            "青埔總戶數用「中壢區青埔/青航/青園里＋大園區青山/青峰里」加總，跟特區實際邊界不是100%對齊；"
            "若村里戶數的成長主要來自特區外緣、不算青埔核心區的樓盤，換手率會被低估。"
        )

    # -- 限制（短，完整定義在「怎麼算的」）--------------------------------------
    limits = [
        "所有數字只看官方資料（實價登錄、預售屋備查、戶政司村里），不用591開價或在售筆數。",
        f"一年轉手量的期間是 {period_label}（近4個完整季，配合資料公告落後至少2個月）。",
        "實價登錄依公布時間分檔，一年轉手量讀到今天為止公布的全部資料；期間最後一季的成交仍可能有少數尚未公布，每個區/重劃區用同一方法，相對排名不受影響。",
        "重劃區（林口/A7/小檜溪/中路/經國/藝文特區）的範圍用路名框，是交叉核對新聞報導跟實價登錄地址聚類出來的，不是官方地籍圖，邊界有誤收/漏收風險，細節見「怎麼算的」。",
        f"重劃區表的一年轉手只算 {config.ZONE_RESALE_MIN_COMPLETION_YEAR} 年以後完工的房子（青埔、林口也一樣），避免長馬路上的舊公寓被算進重劃區；行政區表則是所有屋齡。",
    ]

    return {
        "conclusion_bullets": bullets,
        "arguments": arguments,
        "zone_notes": zone_notes,
        "falsifiers": falsifiers,
        "limits": limits,
    }


if __name__ == "__main__":
    sys.exit(main())
