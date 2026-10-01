# -*- coding: utf-8 -*-
"""
「桃園各區比較」／「重劃區比較」／「跟六都比較」：拿桃園市13個行政區＋新北市林口區＋
幾個桃園市內的重劃區（A7、小檜溪、中路、經國、藝文特區）＋台北市/台中市/高雄市/
新北市（全市），跟青埔特區比同一組供給/流動性指標，全部是官方資料，不用591
（591開價/在售筆數重複刊登、屋主試探開價都會失真，見使用者要求）。

2026-10 改版：原本「完工÷轉手」「未完工÷轉手」都用一年窗口，但完工戶數到貨很不
均勻（單一建案可能一次登記1,000戶以上），一年窗口的倍數在連續幾季裡可以從不到1倍
衝到6倍以上再掉回來，噪音很大。改成兩年窗口（主要欄位），一年窗口留做次要欄位，
並且每一列都多存一組「最近12季、兩種窗口」的逐季走勢（ratio_series），讓頁面畫
趨勢圖而不是只看單一季的倍數。

四個主要指標，每個區/重劃區/城市都算：
    1. 兩年轉手量（resale_2y）：實價登錄A檔（買賣），近8個完整季，交易標的含
       「建物」、備註不含預售屋/親友/特殊關係/員工、且不是交屋後150天內的預售
       交屋登記。一年轉手量（resale_1y，近4個完整季）保留做次要欄位。
    2. 未完工戶數（unfinished_units）：預售屋備查（B檔備查建案），層棟戶數加總，
       第1次登記日期空白，是「現在」的snapshot，不隨窗口變動。
    3. 近兩年完工戶數（completed_2y_units）：同上，第1次登記日期在近24個月內。
       近一年完工戶數（completed_1y_units，近12個月）保留做次要欄位。
    4. 總戶數（households）：內政部戶政司村里資料（ODRP014），行政區/城市或指定
       村里加總。

比值：
    - ratio_completed_to_resale（主要）＝近兩年完工÷兩年轉手；
      ratio_completed_to_resale_1y（次要）＝近一年完工÷一年轉手（舊定義）。
    - ratio_unfinished_to_resale（主要，單位＝年）＝未完工戶÷（兩年轉手/2），
      意思是「照現在兩年平均的轉手速度，還沒蓋好的要幾年才能被市場吸收」；
      ratio_unfinished_to_resale_1y（次要，單位＝倍，舊定義）＝未完工÷一年轉手。
    - turnover_pct（換手率，只給行政區/城市/青埔district口徑）＝年均轉手
      （兩年轉手/2）÷總戶數。

另外算六都比較（台北市/台中市/高雄市/新北市，加桃園全市、青埔參照）：同一組兩年
比值＋轉手/預售中位單價（萬/坪，拆全部屋齡 vs 屋齡5年內），讓青埔跟六都的供給
壓力、價格水位放在同一張表/圖上看。

輸出 data/compare.json：13個行政區＋桃園全市＋青埔＋6個重劃區＋6都比較的數字、
排名、逐季走勢，和用規則式模板產生的白話報告文字（結論／論證／各區逐一說明／
什麼情況下結論會錯／限制），給頁面「青埔在哪個位置」章節直接顯示，不在前端重組
句子。

用法：
    python3 compute_compare.py
"""
import bisect
import calendar
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

SERIES_N = 12           # 逐季走勢要存最近幾季
SERIES_WINDOW_2Y_Q = 8  # 兩年窗口＝幾個完整季
EARLY_UNDERCOUNT_BEFORE_SEASON = "113S1"  # 2024Q1；buildcase只從110S3(2021-07)開始
                                           # 登記，這之前的季別完工戶數會偏少，見下方說明


def log(msg):
    print(f"[compute_compare] {msg}", file=sys.stderr)


# ---------------------------------------------------------------------------
# 期間：近N個完整季，資料公告落後至少2個月（今天所在季別公告還沒公布完整），
# 所以從「今天往前推2個月」所在的那一季開始算起。
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


def _quarter_label(season):
    """ROC季別字串（如「113S1」）轉西元季標籤（如「2024Q1」），給頁面逐季走勢圖用。"""
    y, q = fetch_lvr._parse_season(season)
    return f"{y + 1911}Q{q}"


def trailing_seasons(end_season, n=4):
    seasons = [end_season]
    for _ in range(n - 1):
        seasons.append(fetch_lvr.previous_season(seasons[-1]))
    return list(reversed(seasons))


def months_before(d, n):
    """回傳 d 往前推 n 個月的日期（日取 min(原日, 當月天數)，避免月底溢位）。"""
    total = d.year * 12 + (d.month - 1) - n
    y, m = divmod(total, 12)
    m += 1
    day = min(d.day, calendar.monthrange(y, m)[1])
    return datetime.date(y, m, day)


# ---------------------------------------------------------------------------
# 實價登錄A檔（買賣）：轉手量＋逐季走勢。桃園市(h_)、新北市(f_)、台北市(a_)、
# 台中市(b_)、高雄市(e_) 同一個季別zip裡都有，一季一個zip只下載一次，同時讀出
# 全部需要的城市檔案（manifest.csv驗證過：a=臺北市 b=臺中市 e=高雄市 f=新北市
# h=桃園市，跟 config.CITIES / ZONES 的 file_prefix 對得上）。
# ---------------------------------------------------------------------------
def _merge_rows(zip_bytes, filename, dest_by_id):
    for row in fetch_lvr._read_csv_from_zip(zip_bytes, filename):
        rid = (row.get("編號") or "").strip()
        if rid:
            dest_by_id[rid] = row


def load_resale_rows_multi(seasons, prefix_start_season):
    """橫跨 seasons（由遠到近）載入多個城市的買賣(A檔)原始列，用編號去重。
    prefix_start_season={prefix: 該prefix最早需要的季別}：桃園市/新北市要給
    逐季走勢用（最近12季＋每季的兩年窗口，共需要19季歷史），台北/台中/高雄只
    給現在的兩年比較用（8季就夠），不用的季別就不解析那個城市的檔案，省記憶體。
    季別檔抓不到（還沒公布）就退回歷史批次(1/11/21)＋最新一批補該季，跟
    fetch_lvr.py 抓最新資料用同一組端點/快取。回傳 {prefix: {id: row}}。"""
    by_prefix = {p: {} for p in prefix_start_season}
    filenames = {p: f"{p}_lvr_land_a.csv" for p in prefix_start_season}

    def active_prefixes(season):
        sv = fetch_lvr._parse_season(season)
        return [p for p, start in prefix_start_season.items() if fetch_lvr._parse_season(start) <= sv]

    for i, season in enumerate(seasons):
        prefixes = active_prefixes(season)
        if not prefixes:
            continue
        season_ok = False
        try:
            zip_bytes = fetch_lvr.download_season_zip(season)
            for p in prefixes:
                _merge_rows(zip_bytes, filenames[p], by_prefix[p])
            season_ok = True
            log(f"season {season}：季別檔OK（{prefixes}）")
        except Exception as e:  # noqa: BLE001
            log(f"season {season}：季別檔抓不到（{e}），改用歷史批次補")
        is_last = i == len(seasons) - 1
        if (not season_ok) or is_last:
            start = fetch_lvr.quarter_start_date(season)
            end = _quarter_end_date(season)
            for date_str in fetch_lvr.history_dates_from(start, min(end, datetime.date.today())):
                try:
                    zb = fetch_lvr.download_history_zip(date_str)
                    for p in prefixes:
                        _merge_rows(zb, filenames[p], by_prefix[p])
                except Exception:  # noqa: BLE001
                    continue
            if is_last:
                try:
                    zb = fetch_lvr.download_latest_zip()
                    for p in prefixes:
                        _merge_rows(zb, filenames[p], by_prefix[p])
                except Exception:  # noqa: BLE001
                    pass
    return by_prefix


def load_qingpu_presale_rows(seasons):
    """青埔預售屋成交（h_lvr_land_b.csv），只用來算兩年期預售中位單價（跟六都
    比較用）；跟主要買賣(A檔)下載共用同一批 zip 本機快取，不會多花網路請求。"""
    b_by_id = {}
    for i, season in enumerate(seasons):
        season_ok = False
        try:
            zip_bytes = fetch_lvr.download_season_zip(season)
            _merge_rows(zip_bytes, "h_lvr_land_b.csv", b_by_id)
            season_ok = True
        except Exception:  # noqa: BLE001
            pass
        is_last = i == len(seasons) - 1
        if (not season_ok) or is_last:
            start = fetch_lvr.quarter_start_date(season)
            end = _quarter_end_date(season)
            for date_str in fetch_lvr.history_dates_from(start, min(end, datetime.date.today())):
                try:
                    zb = fetch_lvr.download_history_zip(date_str)
                    _merge_rows(zb, "h_lvr_land_b.csv", b_by_id)
                except Exception:  # noqa: BLE001
                    continue
            if is_last:
                try:
                    zb = fetch_lvr.download_latest_zip()
                    _merge_rows(zb, "h_lvr_land_b.csv", b_by_id)
                except Exception:  # noqa: BLE001
                    pass
    return b_by_id


RESIDENTIAL_TYPES = ("住宅大樓", "華廈", "公寓", "透天厝")


def resale_qualifies_base(row):
    """跟 resale_qualifies 一樣的住宅/排除條件，但不檢查交易日期落在哪個期間——
    供逐季走勢（要用同一組候選列、對不同期間各查一次）跟六都比較（整個城市不分
    期間先篩一次）重複使用，避免同一個條件寫兩份。"""
    if "建物" not in (row.get("交易標的") or ""):
        return False
    if "住" not in (row.get("主要用途") or "") and not any(t in (row.get("建物型態") or "") for t in RESIDENTIAL_TYPES):
        return False
    note = (row.get("備註") or "").strip()
    if EXCLUDE_NOTE_RE.search(note):
        return False
    trans_date = fetch_lvr._roc_to_date(row.get("交易年月日"))
    if not trans_date:
        return False
    completion_date = fetch_lvr._roc_to_date(row.get("建築完成年月"))
    if completion_date is not None:
        days_since = (trans_date - completion_date).days
        if 0 <= days_since <= config.PRESALE_HANDOVER_GRACE_DAYS:
            return False  # 交屋後150天內的登記，算預售交屋登記，不算轉手
    return True


def resale_qualifies(row, period_start, period_end):
    if not resale_qualifies_base(row):
        return False
    trans_date = fetch_lvr._roc_to_date(row.get("交易年月日"))
    return trans_date is not None and period_start <= trans_date <= period_end


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
# 逐季走勢用：先把候選列的交易日期排好序，之後用 bisect 查任意期間的筆數，
# 不用每一季重新掃一次全部列（最近12季×兩種窗口×約20個區域=好幾百次查詢）。
# ---------------------------------------------------------------------------
def _sorted_dates_district(h_by_id, district):
    out = []
    for row in h_by_id.values():
        if not resale_qualifies_base(row):
            continue
        if (row.get("鄉鎮市區") or "").strip() != district:
            continue
        d = fetch_lvr._roc_to_date(row.get("交易年月日"))
        if d is not None:
            out.append(d)
    out.sort()
    return out


def _sorted_dates_qingpu(h_by_id, min_year=None):
    out = []
    for row in h_by_id.values():
        if not resale_qualifies_base(row):
            continue
        if min_year and not _is_new_building(row, min_year):
            continue
        dist = (row.get("鄉鎮市區") or "").strip()
        addr = (row.get("土地位置建物門牌") or "").strip()
        if not config.is_qingpu_address(dist, addr):
            continue
        d = fetch_lvr._roc_to_date(row.get("交易年月日"))
        if d is not None:
            out.append(d)
    out.sort()
    return out


def _sorted_dates_zone(rows_by_id, zone, min_year=None):
    district = zone["district"]
    roads = zone.get("roads")
    out = []
    for row in rows_by_id.values():
        if not resale_qualifies_base(row):
            continue
        if min_year and not _is_new_building(row, min_year):
            continue
        if (row.get("鄉鎮市區") or "").strip() != district:
            continue
        if roads is not None:
            addr = (row.get("土地位置建物門牌") or "").strip()
            if not any(r in addr for r in roads):
                continue
        d = fetch_lvr._roc_to_date(row.get("交易年月日"))
        if d is not None:
            out.append(d)
    out.sort()
    return out


def _sorted_dates_all(rows_by_id):
    """不篩行政區，整個城市（六都比較用）。"""
    out = []
    for row in rows_by_id.values():
        if not resale_qualifies_base(row):
            continue
        d = fetch_lvr._roc_to_date(row.get("交易年月日"))
        if d is not None:
            out.append(d)
    out.sort()
    return out


def window_count(sorted_dates, start, end):
    lo = bisect.bisect_left(sorted_dates, start)
    hi = bisect.bisect_right(sorted_dates, end)
    return hi - lo


def window_sum(sorted_items, start, end):
    dates = [d for d, _ in sorted_items]
    lo = bisect.bisect_left(dates, start)
    hi = bisect.bisect_right(dates, end)
    return sum(v for _, v in sorted_items[lo:hi])


# ---------------------------------------------------------------------------
# 預售屋備查（B檔備查建案）：未完工戶數／近兩年完工戶數。用 index-based 解析
# （不是 dict(zip(header,row))），格式跟 fetch_buildcase.py 的來源一樣，
# 但這裡要「全部鄉鎮市區」而不是只留青埔範圍，且要保留少數欄位不齊的列讓
# 呼叫端自行判斷（len<14 skip）。欄位（0-index）：
#   0鄉鎮市區 1建案名稱 2坐落街道 4層棟戶數 13第1次登記日期
# 五個城市（a台北/b台中/e高雄/f新北/h桃園）的備查CSV是同一套schema，欄位位置
# 相同（實測a_lvr_buildcase.csv表頭跟h_一致）。
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


def _district_match(district):
    return lambda r: r["district"] == district


def _qingpu_bc_match():
    return lambda r: (
        config.is_qingpu_address(r["district"], r["road"])
        or r["project_name"] in config.PRESALE_PROJECT_NAME_ALLOWLIST_EXTRA
    )


def _zone_bc_match(zone):
    district = zone["district"]
    roads = zone.get("roads")
    if roads is None:
        return lambda r: r["district"] == district
    return lambda r: r["district"] == district and any(road in r["road"] for road in roads)


def _all_match():
    return lambda r: True


def buildcase_unfinished(rows, match_fn):
    """未完工戶數：第1次登記日期空白，是「現在」的snapshot，不隨窗口變動。"""
    total = 0
    for r in rows:
        if not match_fn(r):
            continue
        hh = r["households"]
        if hh is None or r["first_registration_roc"]:
            continue
        total += hh
    return total


def buildcase_completed_window(rows, match_fn, window_start, window_end):
    total = 0
    for r in rows:
        if not match_fn(r):
            continue
        hh = r["households"]
        reg_roc = r["first_registration_roc"]
        if hh is None or not reg_roc:
            continue
        d = fetch_lvr._roc_to_date(reg_roc)
        if d is not None and window_start <= d <= window_end:
            total += hh
    return total


def _sorted_completions(rows, match_fn):
    out = []
    for r in rows:
        if not match_fn(r):
            continue
        hh = r["households"]
        reg_roc = r["first_registration_roc"]
        if hh is None or not reg_roc:
            continue
        d = fetch_lvr._roc_to_date(reg_roc)
        if d is not None:
            out.append((d, hh))
    out.sort(key=lambda t: t[0])
    return out


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


def households_city_total(pop_rows, city_name):
    """整個城市（不分行政區）總戶數，跟六都比較用。ODRP014實測一律用「臺」
    （臺北市/臺中市），這裡仍兩種字型都比對一次，避免未來資料來源改字型。"""
    aliases = {city_name}
    if city_name.startswith("臺"):
        aliases.add("台" + city_name[1:])
    elif city_name.startswith("台"):
        aliases.add("臺" + city_name[1:])
    total = 0
    for row in pop_rows:
        site_id = row.get("site_id") or ""
        if any(site_id.startswith(a) for a in aliases):
            try:
                total += int(row.get("household_no") or 0)
            except (TypeError, ValueError):
                pass
    return total


# ---------------------------------------------------------------------------
# 比值、排名、中位數
# ---------------------------------------------------------------------------
def safe_div(a, b):
    if a is None or b is None or b == 0:
        return None
    return a / b


def median(values):
    vals = sorted(v for v in values if v is not None)
    n = len(vals)
    if not n:
        return None
    mid = n // 2
    return vals[mid] if n % 2 else (vals[mid - 1] + vals[mid]) / 2


def rank_desc(rows, key):
    """rows 是 list[dict]，依 key 由大到小排名（1=最高），None 值排最後、不給名次。
    回傳 {row_index: rank}。"""
    valid = [(i, r[key]) for i, r in enumerate(rows) if r.get(key) is not None and not r.get("small_sample")]
    valid.sort(key=lambda t: t[1], reverse=True)
    ranks = {}
    for pos, (i, _v) in enumerate(valid, start=1):
        ranks[i] = pos
    return ranks


def build_row(name, resale_1y, resale_2y, unfinished, completed_1y, completed_2y, households, extra=None):
    avg_annual_resale_2y = safe_div(resale_2y, 2)
    ratio_unfinished_1y = safe_div(unfinished, resale_1y)  # 舊定義（倍），次要欄位
    ratio_unfinished_2y = safe_div(unfinished, avg_annual_resale_2y)  # 新定義（年）
    ratio_completed_1y = safe_div(completed_1y, resale_1y)  # 次要欄位
    ratio_completed_2y = safe_div(completed_2y, resale_2y)  # 主要欄位
    turnover_pct = safe_div(avg_annual_resale_2y, households) * 100 if households else None
    row = {
        "name": name,
        "resale_1y": resale_1y,
        "resale_2y": resale_2y,
        "unfinished_units": unfinished,
        "completed_1y_units": completed_1y,
        "completed_2y_units": completed_2y,
        "households": households,
        "ratio_unfinished_to_resale": round(ratio_unfinished_2y, 2) if ratio_unfinished_2y is not None else None,
        "ratio_unfinished_to_resale_1y": round(ratio_unfinished_1y, 2) if ratio_unfinished_1y is not None else None,
        "ratio_completed_to_resale": round(ratio_completed_2y, 2) if ratio_completed_2y is not None else None,
        "ratio_completed_to_resale_1y": round(ratio_completed_1y, 2) if ratio_completed_1y is not None else None,
        "turnover_pct": round(turnover_pct, 2) if turnover_pct is not None else None,
    }
    # 兩年轉手太少，比值會被分母放大，列出數字但不參加排名
    row["small_sample"] = resale_2y is not None and resale_2y < config.COMPARE_MIN_RESALE_FOR_RANK_2Y
    if extra:
        row.update(extra)
    return row


def build_ratio_series(resale_dates, completions_sorted, end_season, n=SERIES_N):
    """每一列的逐季走勢：從 end_season 往前數 n 季（含本身），每一季都用「截止到
    該季底」的一年窗口跟兩年窗口各算一次完工÷轉手。resale_dates/completions_sorted
    已經是排好序的候選列表（不分期間），用 bisect 查任意區間，一次建好可以查
    n*2 次視窗，不用每一季重新掃一次全部資料。"""
    seasons_desc = [end_season]
    for _ in range(n - 1):
        seasons_desc.append(fetch_lvr.previous_season(seasons_desc[-1]))
    out = []
    for s in reversed(seasons_desc):
        qe = _quarter_end_date(s)
        start_1y = fetch_lvr.quarter_start_date(trailing_seasons(s, 4)[0])
        start_2y = fetch_lvr.quarter_start_date(trailing_seasons(s, SERIES_WINDOW_2Y_Q)[0])
        resale_1y = window_count(resale_dates, start_1y, qe)
        resale_2y = window_count(resale_dates, start_2y, qe)
        completed_1y = window_sum(completions_sorted, qe - datetime.timedelta(days=365), qe)
        completed_2y = window_sum(completions_sorted, months_before(qe, 24), qe)
        r1 = safe_div(completed_1y, resale_1y)
        r2 = safe_div(completed_2y, resale_2y)
        out.append({
            "quarter": _quarter_label(s),
            "quarter_end": qe.isoformat(),
            "resale_1y": resale_1y,
            "resale_2y": resale_2y,
            "completed_1y": completed_1y,
            "completed_2y": completed_2y,
            "ratio_1y": round(r1, 2) if r1 is not None else None,
            "ratio_2y": round(r2, 2) if r2 is not None else None,
            "early_undercount": fetch_lvr._parse_season(s) < fetch_lvr._parse_season(EARLY_UNDERCOUNT_BEFORE_SEASON),
        })
    return out


def _sum_series(series_list):
    """把多個區域（例如13個行政區）的逐季走勢逐季加總，變成「桃園全市」的走勢，
    跟 city_row 本身「completed/resale 加總後再算比值」的聚合方式一致。"""
    if not series_list:
        return []
    out = []
    for i in range(len(series_list[0])):
        base = series_list[0][i]
        resale_1y = sum(s[i]["resale_1y"] for s in series_list)
        resale_2y = sum(s[i]["resale_2y"] for s in series_list)
        completed_1y = sum(s[i]["completed_1y"] for s in series_list)
        completed_2y = sum(s[i]["completed_2y"] for s in series_list)
        r1 = safe_div(completed_1y, resale_1y)
        r2 = safe_div(completed_2y, resale_2y)
        out.append({
            "quarter": base["quarter"],
            "quarter_end": base["quarter_end"],
            "resale_1y": resale_1y,
            "resale_2y": resale_2y,
            "completed_1y": completed_1y,
            "completed_2y": completed_2y,
            "ratio_1y": round(r1, 2) if r1 is not None else None,
            "ratio_2y": round(r2, 2) if r2 is not None else None,
            "early_undercount": base["early_undercount"],
        })
    return out


# ---------------------------------------------------------------------------
# 轉手/預售中位單價（六都比較用）：萬/坪，扣車位，排除車位疑似灌入總價的列
# （有車位但車位總價=0，價格會失真）。拆「全部屋齡」「屋齡5年內」兩組。
# ---------------------------------------------------------------------------
def resale_price_stats(rows_by_id, period_start, period_end, match_fn=None):
    prices_all, prices_new = [], []
    for row in rows_by_id.values():
        if not resale_qualifies_base(row):
            continue
        if match_fn is not None and not match_fn(row):
            continue
        trans_date = fetch_lvr._roc_to_date(row.get("交易年月日"))
        if trans_date is None or not (period_start <= trans_date <= period_end):
            continue
        parking_n = fetch_lvr._parking_count(row.get("交易筆棟數"))
        car_price = fetch_lvr._to_float(row.get("車位總價元"))
        if parking_n >= 1 and car_price == 0:
            continue  # 車位疑似灌入總價，單價會失真，排除
        total_price = fetch_lvr._to_float(row.get("總價元"))
        car_area_sqm = fetch_lvr._to_float(row.get("車位移轉總面積平方公尺"))
        build_area_sqm = fetch_lvr._to_float(row.get("建物移轉總面積平方公尺"))
        net_area_ping = (build_area_sqm - car_area_sqm) * config.SQM_TO_PING
        if net_area_ping <= 0:
            continue
        unit_price = ((total_price - car_price) / net_area_ping) / 10000
        prices_all.append(unit_price)
        completion_date = fetch_lvr._roc_to_date(row.get("建築完成年月"))
        if completion_date is not None:
            age_years = (trans_date - completion_date).days / 365.25
            if age_years <= config.CITY_PRICE_AGE_MAX_YEARS:
                prices_new.append(unit_price)
    return median(prices_all), median(prices_new), len(prices_all), len(prices_new)


def presale_price_stats(rows_by_id, period_start, period_end):
    """青埔預售（B檔）兩年期中位單價，跟六都比較的轉手單價放在一起看。"""
    prices = []
    for row in rows_by_id.values():
        if (row.get("解約情形") or "").strip():
            continue
        district = (row.get("鄉鎮市區") or "").strip()
        address = (row.get("土地位置建物門牌") or "").strip()
        project_name = (row.get("建案名稱") or "").strip()
        if not config.is_qingpu_address(district, address) and project_name not in config.PRESALE_PROJECT_NAME_ALLOWLIST_EXTRA:
            continue
        trans_date = fetch_lvr._roc_to_date(row.get("交易年月日"))
        if not trans_date or not (period_start <= trans_date <= period_end):
            continue
        total_price = fetch_lvr._to_float(row.get("總價元"))
        car_price = fetch_lvr._to_float(row.get("車位總價元"))
        build_area_sqm = fetch_lvr._to_float(row.get("建物移轉總面積平方公尺"))
        car_area_sqm = fetch_lvr._to_float(row.get("車位移轉總面積平方公尺"))
        net_area_ping = (build_area_sqm - car_area_sqm) * config.SQM_TO_PING
        if net_area_ping <= 0:
            continue
        unit_price = ((total_price - car_price) / net_area_ping) / 10000
        prices.append(unit_price)
    return prices


def build_city_compare_conclusion(qingpu_row, city_rows, qingpu_price):
    """六都比較的一句話結論，資料生成，不是手寫文案。"""
    qc = qingpu_row.get("ratio_completed_to_resale")
    others = [r for r in city_rows if r.get("id") != "qingpu" and r.get("ratio_completed_to_resale") is not None]
    price_all = qingpu_price.get("resale_all_wan_ping")
    parts = []
    if qc is not None and others:
        higher = sorted([r for r in others if r["ratio_completed_to_resale"] > qc],
                         key=lambda r: -r["ratio_completed_to_resale"])
        if higher:
            names = "、".join(f"{r['name']}（{r['ratio_completed_to_resale']:.1f}倍）" for r in higher)
            parts.append(f"青埔近兩年完工÷兩年轉手 {qc:.1f} 倍，比較對象裡只有{names}更高")
        else:
            parts.append(f"青埔近兩年完工÷兩年轉手 {qc:.1f} 倍，是這幾個比較對象裡最高")
    if price_all is not None:
        cheaper_than = [r for r in others if r.get("price_all_wan_ping") is not None and r["price_all_wan_ping"] > price_all]
        if cheaper_than:
            names = "、".join(r["name"] for r in sorted(cheaper_than, key=lambda r: -r["price_all_wan_ping"]))
            parts.append(f"轉手中位價 {price_all:.1f} 萬/坪，只比{names}便宜" if len(cheaper_than) <= 2
                         else f"轉手中位價 {price_all:.1f} 萬/坪，比{names}便宜")
        else:
            parts.append(f"轉手中位價 {price_all:.1f} 萬/坪，是這幾個比較對象裡最貴")
    return "；".join(parts) + "。" if parts else ""


def main():
    today = datetime.date.today()
    q_end = last_complete_quarter_end(today)
    end_season = _season_of_date(q_end)
    seasons_1y = trailing_seasons(end_season, 4)
    seasons_2y = trailing_seasons(end_season, SERIES_WINDOW_2Y_Q)
    seasons_series = trailing_seasons(end_season, SERIES_N + SERIES_WINDOW_2Y_Q - 1)
    period_start_1y = fetch_lvr.quarter_start_date(seasons_1y[0])
    period_start_2y = fetch_lvr.quarter_start_date(seasons_2y[0])
    period_end = q_end
    log(f"期間（兩年，主要）：{period_start_2y} ~ {period_end}（季別 {seasons_2y}）；"
        f"一年期間（次要）：{period_start_1y} ~ {period_end}")

    status = "ok"
    message = ""

    # 實價登錄是「依公布時間」分檔，不是依成交日：成交後 30 天內申報、再過約一個月公布，
    # 期間最後一季的成交大多落在下一季（甚至下下季）才公布。所以要從期間第一季一路讀到
    # 今天所在的公布季，只讀到期間最後一季會把最後一季少算一大截。
    pub_seasons = list(seasons_series)
    today_season = _season_of_date(today)
    while pub_seasons[-1] != today_season:
        pub_seasons.append(_next_season(pub_seasons[-1]))
    log(f"讀取公布季別：{pub_seasons}")

    # 桃園市(h)/新北市(f)：逐季走勢要最近12季、每季再往前推8季的歷史，所以從
    # seasons_series[0]開始讀；台北(a)/台中(b)/高雄(e)：只給現在兩年比較用，從
    # seasons_2y[0]開始讀就夠，省記憶體。
    prefix_start_season = {
        "h": seasons_series[0],
        "f": seasons_series[0],
        "a": seasons_2y[0],
        "b": seasons_2y[0],
        "e": seasons_2y[0],
    }
    try:
        by_prefix = load_resale_rows_multi(pub_seasons, prefix_start_season)
        h_by_id, f_by_id = by_prefix["h"], by_prefix["f"]
        a_by_id, b_by_id, e_by_id = by_prefix["a"], by_prefix["b"], by_prefix["e"]
        log(f"買賣(A檔，去重後)：桃園市 {len(h_by_id)}、新北市 {len(f_by_id)}、"
            f"台北市 {len(a_by_id)}、台中市 {len(b_by_id)}、高雄市 {len(e_by_id)} 筆")
    except Exception as e:  # noqa: BLE001
        status, message = "fail", f"load_resale_rows_multi: {e}"
        log(f"FAILED: {message}")
        h_by_id, f_by_id, a_by_id, b_by_id, e_by_id = {}, {}, {}, {}, {}

    resale_district_1y = count_resale_by_district(h_by_id, period_start_1y, period_end)
    resale_district_2y = count_resale_by_district(h_by_id, period_start_2y, period_end)
    resale_qingpu_1y = count_resale_qingpu(h_by_id, period_start_1y, period_end)
    resale_qingpu_2y = count_resale_qingpu(h_by_id, period_start_2y, period_end)
    resale_city_total_1y = sum(resale_district_1y.values())
    resale_city_total_2y = sum(resale_district_2y.values())

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

    buildcase_by_prefix = {"h": buildcase_h, "f": buildcase_f}
    for ccfg in config.CITIES:
        p = ccfg["file_prefix"]
        if p in buildcase_by_prefix:
            continue
        try:
            rows = load_buildcase_rows(p)
            buildcase_by_prefix[p] = rows
            log(f"預售屋備查（{ccfg['name']}）：{len(rows)} 筆")
        except Exception as e:  # noqa: BLE001
            buildcase_by_prefix[p] = []
            log(f"預售屋備查（{ccfg['name']}）抓取失敗：{e}")

    pop_month, pop_rows = pick_population_month(today)
    log(f"戶政人口月份：{pop_month}（{len(pop_rows)} 筆村里資料）")
    hh_district = households_by_district(pop_rows)
    hh_qingpu = households_qingpu(pop_rows)
    hh_city_total = sum(hh_district.values())

    cutoff_1y_start, cutoff_1y_end = today - datetime.timedelta(days=365), today
    cutoff_2y_start, cutoff_2y_end = months_before(today, 24), today

    # -- 13個行政區 -----------------------------------------------------------
    district_rows = []
    for d in config.TAOYUAN_DISTRICTS:
        mfn = _district_match(d)
        unfinished = buildcase_unfinished(buildcase_h, mfn)
        completed_1y = buildcase_completed_window(buildcase_h, mfn, cutoff_1y_start, cutoff_1y_end)
        completed_2y = buildcase_completed_window(buildcase_h, mfn, cutoff_2y_start, cutoff_2y_end)
        row = build_row(d, resale_district_1y.get(d, 0), resale_district_2y.get(d, 0),
                         unfinished, completed_1y, completed_2y, hh_district.get(d))
        resale_dates = _sorted_dates_district(h_by_id, d)
        completions_sorted = _sorted_completions(buildcase_h, mfn)
        row["ratio_series"] = build_ratio_series(resale_dates, completions_sorted, end_season)
        district_rows.append(row)
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
    city_completed_2y = sum(r["completed_2y_units"] for r in district_rows)
    city_row = build_row("桃園全市", resale_city_total_1y, resale_city_total_2y,
                          city_unfinished, city_completed_1y, city_completed_2y, hh_city_total)
    city_row["ratio_series"] = _sum_series([r["ratio_series"] for r in district_rows])

    # -- 青埔＋重劃區 -----------------------------------------------------------
    MIN_YEAR = config.ZONE_RESALE_MIN_COMPLETION_YEAR
    zone_rows = []
    sanity_top_projects = {}
    qingpu_bc_match = _qingpu_bc_match()
    qingpu_completions_sorted = _sorted_completions(buildcase_h, qingpu_bc_match)
    for zone in config.ZONES:
        zid = zone["id"]
        if zone.get("is_qingpu"):
            unfinished = buildcase_unfinished(buildcase_h, qingpu_bc_match)
            completed_1y = buildcase_completed_window(buildcase_h, qingpu_bc_match, cutoff_1y_start, cutoff_1y_end)
            completed_2y = buildcase_completed_window(buildcase_h, qingpu_bc_match, cutoff_2y_start, cutoff_2y_end)
            resale_1y = count_resale_qingpu(h_by_id, period_start_1y, period_end, min_year=MIN_YEAR)
            resale_2y = count_resale_qingpu(h_by_id, period_start_2y, period_end, min_year=MIN_YEAR)
            households = None  # 重劃區表不算換手率：里界跟路名框出來的範圍對不齊
            top5 = sorted(
                [r for r in buildcase_h if config.is_qingpu_address(r["district"], r["road"]) and r["households"]],
                key=lambda r: r["households"], reverse=True,
            )[:5]
            resale_dates = _sorted_dates_qingpu(h_by_id, min_year=MIN_YEAR)
            completions_sorted = qingpu_completions_sorted
        else:
            city_prefix = zone.get("file_prefix", "h")
            rows_by_id = f_by_id if city_prefix == "f" else h_by_id
            resale_1y = count_resale_zone(rows_by_id, zone, period_start_1y, period_end, min_year=MIN_YEAR)
            resale_2y = count_resale_zone(rows_by_id, zone, period_start_2y, period_end, min_year=MIN_YEAR)
            bc_rows = buildcase_f if city_prefix == "f" else buildcase_h
            roads = zone.get("roads")
            mfn = _zone_bc_match(zone)
            unfinished = buildcase_unfinished(bc_rows, mfn)
            completed_1y = buildcase_completed_window(bc_rows, mfn, cutoff_1y_start, cutoff_1y_end)
            completed_2y = buildcase_completed_window(bc_rows, mfn, cutoff_2y_start, cutoff_2y_end)
            households = None  # 同上
            top5 = top_projects_by_households(bc_rows, district=zone["district"], roads=roads, n=5)
            resale_dates = _sorted_dates_zone(rows_by_id, zone, min_year=MIN_YEAR)
            completions_sorted = _sorted_completions(bc_rows, mfn)

        row = build_row(zone["name"], resale_1y, resale_2y, unfinished, completed_1y, completed_2y, households,
                         extra={"id": zid})
        row["ratio_series"] = build_ratio_series(resale_dates, completions_sorted, end_season)
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
    qingpu_dist_resale_dates = _sorted_dates_qingpu(h_by_id, min_year=None)
    qingpu_dist_row = build_row("青埔", resale_qingpu_1y, resale_qingpu_2y, qingpu_row["unfinished_units"],
                                 qingpu_row["completed_1y_units"], qingpu_row["completed_2y_units"], hh_qingpu,
                                 extra={"id": "qingpu"})
    qingpu_dist_row["ratio_series"] = build_ratio_series(qingpu_dist_resale_dates, qingpu_completions_sorted, end_season)
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

    # -- 跟六都比較：台北/台中/高雄（新抓取）＋新北（沿用f_by_id/buildcase_f，整個
    #    行政區，不限林口）；桃園全市沿用上面已經算好的 city_row。每個都另外算
    #    轉手中位單價（全部屋齡/屋齡5年內）------------------------------------
    city_rows_by_prefix = {"a": a_by_id, "b": b_by_id, "e": e_by_id, "f": f_by_id}
    all_mfn = _all_match()
    cities_out = []
    for ccfg in config.CITIES:
        prefix = ccfg["file_prefix"]
        rows_by_id = city_rows_by_prefix[prefix]
        bc_rows = buildcase_by_prefix.get(prefix, [])
        resale_dates = _sorted_dates_all(rows_by_id)
        resale_1y = window_count(resale_dates, period_start_1y, period_end)
        resale_2y = window_count(resale_dates, period_start_2y, period_end)
        unfinished = buildcase_unfinished(bc_rows, all_mfn)
        completed_1y = buildcase_completed_window(bc_rows, all_mfn, cutoff_1y_start, cutoff_1y_end)
        completed_2y = buildcase_completed_window(bc_rows, all_mfn, cutoff_2y_start, cutoff_2y_end)
        households = households_city_total(pop_rows, ccfg["pop_site_id"])
        row = build_row(ccfg["name"], resale_1y, resale_2y, unfinished, completed_1y, completed_2y, households,
                         extra={"id": ccfg["id"]})
        price_all, price_new, n_all, n_new = resale_price_stats(rows_by_id, period_start_2y, period_end)
        row["price_all_wan_ping"] = round(price_all, 1) if price_all is not None else None
        row["price_new_wan_ping"] = round(price_new, 1) if price_new is not None else None
        row["n_price_all"] = n_all
        row["n_price_new"] = n_new
        cities_out.append(row)
        log(f"六都比較－{ccfg['name']}：resale_2y={resale_2y} unfinished={unfinished} completed_2y={completed_2y} "
            f"households={households} price_all={row['price_all_wan_ping']}(n={n_all}) price_new={row['price_new_wan_ping']}(n={n_new})")

    tao_price_all, tao_price_new, tao_n_all, tao_n_new = resale_price_stats(h_by_id, period_start_2y, period_end)
    tao_entry = dict(city_row)
    tao_entry.pop("ratio_series", None)
    tao_entry["id"] = "taoyuan"
    tao_entry["price_all_wan_ping"] = round(tao_price_all, 1) if tao_price_all is not None else None
    tao_entry["price_new_wan_ping"] = round(tao_price_new, 1) if tao_price_new is not None else None
    tao_entry["n_price_all"] = tao_n_all
    tao_entry["n_price_new"] = tao_n_new

    qingpu_price_match = lambda row: (  # noqa: E731
        _is_new_building(row, MIN_YEAR)
        and config.is_qingpu_address((row.get("鄉鎮市區") or "").strip(), (row.get("土地位置建物門牌") or "").strip())
    )
    qp_all, qp_new, qp_n_all, qp_n_new = resale_price_stats(h_by_id, period_start_2y, period_end, match_fn=qingpu_price_match)
    presale_seasons = [s for s in pub_seasons if fetch_lvr._parse_season(s) >= fetch_lvr._parse_season(seasons_2y[0])]
    try:
        qingpu_presale_by_id = load_qingpu_presale_rows(presale_seasons)
        log(f"桃園市預售（B檔，兩年窗口季別，尚未篩青埔）：{len(qingpu_presale_by_id)} 筆")
    except Exception as e:  # noqa: BLE001
        qingpu_presale_by_id = {}
        log(f"青埔預售（B檔）抓取失敗：{e}")
    qp_presale_prices = presale_price_stats(qingpu_presale_by_id, period_start_2y, period_end)
    qp_presale_median = median(qp_presale_prices)

    # 跟六都比：六都是全部屋齡，青埔也要用全部屋齡的行政區口徑（不是只算 2010 年後的重劃區口徑）
    qingpu_entry = {k: v for k, v in qingpu_dist_row.items() if k != "ratio_series"}
    qingpu_entry["id"] = "qingpu"
    qingpu_entry["price_all_wan_ping"] = round(qp_all, 1) if qp_all is not None else None
    qingpu_entry["price_new_wan_ping"] = round(qp_new, 1) if qp_new is not None else None
    qingpu_entry["n_price_all"] = qp_n_all
    qingpu_entry["n_price_new"] = qp_n_new
    qingpu_entry["presale_wan_ping"] = round(qp_presale_median, 1) if qp_presale_median is not None else None
    qingpu_entry["n_presale"] = len(qp_presale_prices)

    city_compare = cities_out + [tao_entry, qingpu_entry]
    qingpu_price = {
        "resale_all_wan_ping": qingpu_entry["price_all_wan_ping"],
        "resale_new_wan_ping": qingpu_entry["price_new_wan_ping"],
        "n_resale_all": qp_n_all,
        "n_resale_new": qp_n_new,
        "presale_wan_ping": qingpu_entry["presale_wan_ping"],
        "n_presale": qingpu_entry["n_presale"],
        "age_max_years": config.CITY_PRICE_AGE_MAX_YEARS,
    }

    report = build_report(qingpu_row, qingpu_dist_row, zone_rows, district_rows, city_row, qingpu_vs_districts,
                           n_districts, n_zones, sanity_top_projects, period_start_1y, period_start_2y, period_end,
                           city_compare, qingpu_price)

    payload = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "qingpu_district_row": qingpu_dist_row,
        "status": status,
        "message": message,
        "period": {
            "resale_seasons_1y": seasons_1y,
            "resale_seasons_2y": seasons_2y,
            "resale_start_1y": period_start_1y.isoformat(),
            "resale_start_2y": period_start_2y.isoformat(),
            "resale_end": period_end.isoformat(),
            "completed_1y_since": cutoff_1y_start.isoformat(),
            "completed_2y_since": cutoff_2y_start.isoformat(),
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
        "cities": city_compare,
        "qingpu_price": qingpu_price,
        "report": report,
    }

    os.makedirs(config.DATA_DIR, exist_ok=True)
    with open(config.COMPARE_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    log(
        f"done. 青埔(zone,2y): resale_2y={qingpu_row['resale_2y']} unfinished={qingpu_row['unfinished_units']} "
        f"completed_2y={qingpu_row['completed_2y_units']} ratio_completed={qingpu_row['ratio_completed_to_resale']} "
        f"ratio_unfinished(年)={qingpu_row['ratio_unfinished_to_resale']} | 青埔(district口徑): households={hh_qingpu} "
        f"turnover={qingpu_dist_row['turnover_pct']} | 桃園全市(2y): resale_2y={resale_city_total_2y} "
        f"completed_2y={city_completed_2y} ratio_completed={city_row['ratio_completed_to_resale']} status={status}"
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
                  sanity_top_projects, period_start_1y, period_start_2y, period_end, city_compare, qingpu_price):
    period_label_2y = f"{period_start_2y.isoformat()}~{period_end.isoformat()}"
    period_label_1y = f"{period_start_1y.isoformat()}~{period_end.isoformat()}"
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
            f"跟桃園各行政區比（所有屋齡）：青埔近兩年完工戶數是兩年轉手量的 {qdc:.1f} 倍，"
            f"{_rank_phrase(qvd.get('rank_completed'), qvd.get('n'), '候選（13個行政區＋青埔）')}，全市 {cc:.1f} 倍；"
            f"還沒蓋好的要用現在的轉手速度消化 {qdu:.1f} 年，{_rank_phrase(qvd.get('rank_unfinished'), qvd.get('n'), '候選')}，全市 {cu:.1f} 年。"
        )
    if qc is not None:
        bullets.append(
            f"跟其他重劃區比（只算 {config.ZONE_RESALE_MIN_COMPLETION_YEAR} 年後完工的房子）：青埔近兩年完工是兩年轉手的 {qc:.1f} 倍，"
            f"{_rank_phrase(qingpu_row.get('rank_completed'), n_zones, '重劃區（含青埔本身）')}；"
            f"還沒蓋好的要用現在的轉手速度消化 {qu:.1f} 年，{_rank_phrase(qingpu_row.get('rank_unfinished'), n_zones, '重劃區')}。"
        )
    if qt is not None:
        turnover_bullet = (
            f"青埔換手率 {qt:.2f}%（年均轉手÷總戶數，轉手量取兩年平均），"
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
         "ratio_completed": r.get("ratio_completed_to_resale"), "resale_2y": r.get("resale_2y"),
         "is_qingpu": r["id"] == "qingpu"}
        for r in zone_rows
    ]
    reasoning = (
        f"青埔近兩年完工÷轉手＝{qc:.1f}倍，" if qc is not None else "青埔近兩年完工÷轉手資料不足，"
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
        "claim": f"青埔的完工壓力（近兩年完工÷兩年轉手）在{_rank_phrase(qingpu_row.get('rank_completed'), n_zones, '重劃區（含青埔本身）')}。",
        "table": supply_table,
        "reasoning": reasoning,
    })

    volume_table = [
        {"name": r["name"], "resale_2y": r.get("resale_2y"), "households": r.get("households"),
         "is_qingpu": r["id"] == "qingpu"}
        for r in zone_rows
    ]
    other_volumes = [r["resale_2y"] for r in zone_rows if r["id"] != "qingpu" and r.get("resale_2y") is not None]
    vol_reasoning = f"青埔兩年轉手量 {qingpu_row.get('resale_2y')} 戶"
    if other_volumes:
        med_other = sorted(other_volumes)[len(other_volumes) // 2]
        if qingpu_row.get("resale_2y") is not None and qingpu_row["resale_2y"] < med_other:
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
        "claim": f"青埔的換手率（年均轉手÷總戶數）在{_rank_phrase(qvd.get('rank_turnover'), qvd.get('n'), '候選（13個行政區＋青埔）')}。",
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
        parts = [f"{r['name']}兩年轉手 {r.get('resale_2y', 0)} 戶（{config.ZONE_RESALE_MIN_COMPLETION_YEAR}年後完工的房子）、未完工 {r.get('unfinished_units', 0)} 戶、近兩年完工 {r.get('completed_2y_units', 0)} 戶。"]
        if r.get("small_sample"):
            parts.append(f"兩年轉手不到 {config.COMPARE_MIN_RESALE_FOR_RANK_2Y} 戶，比值會被分母放大，不參加排名。")
        if r.get("ratio_completed_to_resale") is not None:
            parts.append(f"完工÷轉手 {r['ratio_completed_to_resale']:.1f} 倍" + (f"，高於青埔（{qc:.1f}倍）。" if qc is not None and r["ratio_completed_to_resale"] > qc else f"，低於青埔（{qc:.1f}倍）。" if qc is not None else "。"))
        if names:
            parts.append(f"未完工/近兩年完工戶數裡，戶數較大的建案包含{names}。")
        zone_notes[r["id"]] = " ".join(parts)

    # -- 什麼情況下結論會錯（falsifiers，都帶門檻數字）--------------------------
    falsifiers = []
    if qingpu_row.get("completed_2y_units") and qc is not None and qc > 3:
        resale_needed = round(qingpu_row["completed_2y_units"] / 3)
        falsifiers.append(
            f"若青埔兩年轉手量從 {qingpu_row.get('resale_2y')} 戶回升到 {resale_needed} 戶以上"
            f"（近兩年完工戶數的三分之一），完工÷轉手的倍數會降到3倍以下，「青埔完工壓力偏高」的結論就站不住。"
        )
    falsifiers.append(
        "未完工戶數只看官方「第1次登記日期」是否空白，不是實際完工進度；"
        "若有建案已經實際交屋但還沒完成官方登記，未完工戶數會被高估、完工÷轉手的倍數也會被低估。"
    )
    falsifiers.append(
        "近兩年完工戶數如果有很大比例是建商餘屋（已完工但一直沒賣），不會真的變成轉手市場的供給；"
        "近兩年完工÷轉手的倍數會高估「即將進入市場搶買方」的壓力。"
    )
    if qingpu_dist_row.get("households"):
        falsifiers.append(
            "青埔總戶數用「中壢區青埔/青航/青園里＋大園區青山/青峰里」加總，跟特區實際邊界不是100%對齊；"
            "若村里戶數的成長主要來自特區外緣、不算青埔核心區的樓盤，換手率會被低估。"
        )
    series = qingpu_row.get("ratio_series") or []
    r1_points = [(s["quarter"], s["ratio_1y"]) for s in series if s.get("ratio_1y") is not None]
    if r1_points:
        lo = min(r1_points, key=lambda t: t[1])
        hi = max(r1_points, key=lambda t: t[1])
        falsifiers.append(
            f"改成兩年窗口是因為完工戶數到貨很不均勻（單一建案可能一次登記1,000戶以上）：一年窗口的倍數在"
            f"最近{len(series)}季裡，{lo[0]} 最低到 {lo[1]:.1f} 倍、{hi[0]} 最高到 {hi[1]:.1f} 倍（見「怎麼算的」逐季走勢圖）；"
            f"兩年窗口把單季噪音攤平，但如果未來連續多季都是巨量交屋，兩年窗口一樣會上升，不是永遠不動的門檻。"
        )

    # -- 限制（短，完整定義在「怎麼算的」）--------------------------------------
    limits = [
        "所有數字只看官方資料（實價登錄、預售屋備查、戶政司村里），不用591開價或在售筆數。",
        f"兩年轉手量（主要欄位）的期間是 {period_label_2y}（近8個完整季）；一年轉手量（次要欄位）的期間是 {period_label_1y}，都配合資料公告落後至少2個月。",
        "實價登錄依公布時間分檔，轉手量讀到今天為止公布的全部資料；期間最後一季的成交仍可能有少數尚未公布，每個區/重劃區用同一方法，相對排名不受影響。",
        "重劃區（林口/A7/小檜溪/中路/經國/藝文特區）的範圍用路名框，是交叉核對新聞報導跟實價登錄地址聚類出來的，不是官方地籍圖，邊界有誤收/漏收風險，細節見「怎麼算的」。",
        f"重劃區表的轉手只算 {config.ZONE_RESALE_MIN_COMPLETION_YEAR} 年以後完工的房子（青埔、林口也一樣），避免長馬路上的舊公寓被算進重劃區；行政區表則是所有屋齡。",
    ]

    city_compare_conclusion = build_city_compare_conclusion(qingpu_dist_row, city_compare, qingpu_price)

    return {
        "conclusion_bullets": bullets,
        "arguments": arguments,
        "zone_notes": zone_notes,
        "falsifiers": falsifiers,
        "limits": limits,
        "city_compare_conclusion": city_compare_conclusion,
    }


if __name__ == "__main__":
    sys.exit(main())
