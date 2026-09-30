# -*- coding: utf-8 -*-
"""
抓內政部「不動產成交案件實際資訊資料庫」（實價登錄）開放資料，
篩出青埔特區（含遠雄仰森）的住宅買賣、預售、租賃交易，寫入
data/deals.json（買賣+預售）與 data/rental.json（租賃）。

用法：
    python3 fetch_lvr.py           # 預設：只抓「最新一批」zip，合併進既有資料
    python3 fetch_lvr.py --seed    # 回補：從 config.LVR_SEED_START_SEASON 抓到目前季別
"""
import argparse
import csv
import datetime
import io
import json
import os
import glob
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import zipfile
from collections import Counter, defaultdict

import config

# 從地址抓「門牌」：行政區＋路街＋（段）＋（巷）＋門牌號（含之N，不含樓層/之N後綴）
_DOOR_RE = re.compile(r"(.{2,3}區)(.*?[路街])(.{0,2}段)?(\d+巷)?(\d+(?:之\d+)?號)")

TIMEOUT = 60
RETRIES = 3


def log(msg):
    print(f"[fetch_lvr] {msg}", file=sys.stderr)


# ---------------------------------------------------------------------------
# 下載
# ---------------------------------------------------------------------------
def _download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": config.LVR_USER_AGENT})
    last_err = None
    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            log(f"download attempt {attempt}/{RETRIES} failed for {url}: {e}")
            time.sleep(2 * attempt)
    raise RuntimeError(f"download failed after {RETRIES} attempts: {last_err}")


def download_latest_zip() -> bytes:
    return _download(config.LVR_LATEST_URL)


def _cached_download(cache_key: str, url: str) -> bytes:
    """季別/歷史批次公布後內容不會變，快取到本機，重跑不用重抓。
    只快取真的是 zip 的內容；日期還沒公布時伺服器回 200 + 一小段 HTML，
    這種不能快取，不然之後真的公布了也讀不到，會被快取的舊回應卡住。"""
    os.makedirs(config.LVR_CACHE_DIR, exist_ok=True)
    path = os.path.join(config.LVR_CACHE_DIR, f"{cache_key}.zip")
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()
    data = _download(url)
    if zipfile.is_zipfile(io.BytesIO(data)):
        with open(path, "wb") as f:
            f.write(data)
    return data


def download_season_zip(season: str) -> bytes:
    return _cached_download(f"season_{season}", config.LVR_SEASON_URL_TMPL.format(season=season))


def download_history_zip(date_str: str) -> bytes:
    return _cached_download(f"history_{date_str}", config.LVR_HISTORY_URL_TMPL.format(date=date_str))


# ---------------------------------------------------------------------------
# 季別 / 日期工具（供 --seed 與日常補空窗用）
# ---------------------------------------------------------------------------
def current_roc_season() -> str:
    today = datetime.date.today()
    roc_year = today.year - 1911
    season = (today.month - 1) // 3 + 1
    return f"{roc_year}S{season}"


def _parse_season(s: str):
    year, q = s.split("S")
    return int(year), int(q)


def previous_season(season: str) -> str:
    y, q = _parse_season(season)
    q -= 1
    if q < 1:
        q = 4
        y -= 1
    return f"{y}S{q}"


def season_range(start: str, end: str):
    """列出從 start 到 end（含）的所有季別字串，例如 112S1..115S3。"""

    def bump(year, q):
        q += 1
        if q > 4:
            q = 1
            year += 1
        return year, q

    y, q = _parse_season(start)
    ey, eq = _parse_season(end)
    out = []
    while (y, q) <= (ey, eq):
        out.append(f"{y}S{q}")
        y, q = bump(y, q)
    return out


def quarter_start_date(season: str) -> datetime.date:
    """季別字串（民國年+S+季別）轉成該季第一天的西元日期。"""
    year, q = _parse_season(season)
    month = (q - 1) * 3 + 1
    return datetime.date(year + 1911, month, 1)


def history_dates_from(start: datetime.date, end: datetime.date):
    """列出 start 到 end（含）之間，日期為每月 1/11/21 號的 YYYYMMDD 字串。
    每月只跑一次排程，這裡會把「上次執行到今天」之間所有還沒抓過的 1/11/21
    批次都列出來（見 bridge_recent_history 用 history_ok 快取跳過已抓過的），
    不會因為排程頻率變低就漏掉中間的批次。"""
    out = []
    cur = datetime.date(start.year, start.month, 1)
    while cur <= end:
        for day in (1, 11, 21):
            try:
                dt = datetime.date(cur.year, cur.month, day)
            except ValueError:
                continue
            if start <= dt <= end:
                out.append(dt.strftime("%Y%m%d"))
        cur = datetime.date(cur.year + 1, 1, 1) if cur.month == 12 else datetime.date(cur.year, cur.month + 1, 1)
    return out


# ---------------------------------------------------------------------------
# CSV 解析
# ---------------------------------------------------------------------------
def _read_csv_from_zip(zip_bytes: bytes, filename: str):
    """從 zip bytes 取出指定檔名的 CSV，回傳 list[dict]（用中文表頭當 key）。
    找不到該檔名回傳 []（有些早期季別可能沒有某個檔案）。"""
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        if filename not in zf.namelist():
            return []
        raw = zf.read(filename)
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
        next(reader)  # 第二列是英文表頭，跳過
    except StopIteration:
        return []
    rows = []
    for row in reader:
        if not row or len(row) < len(header):
            continue
        rows.append(dict(zip(header, row)))
    return rows


def _roc_to_date(s: str):
    s = (s or "").strip()
    if len(s) != 7 or not s.isdigit():
        return None
    roc_year, mm, dd = int(s[:3]), int(s[3:5]), int(s[5:7])
    if mm == 0 or dd == 0:
        return None
    try:
        return datetime.date(roc_year + 1911, mm, dd)
    except ValueError:
        return None


def _roc_to_iso(s: str):
    d = _roc_to_date(s)
    return d.isoformat() if d else None


def _to_float(s, default=0.0):
    try:
        return float(s)
    except (TypeError, ValueError):
        return default


def _parking_count(trade_pen: str) -> int:
    """從「交易筆棟數」/「租賃筆棟數」欄位（如「土地1建物1車位1」）取出車位數。"""
    m = re.search(r"車位(\d+)", trade_pen or "")
    return int(m.group(1)) if m else 0


_CN_DIGIT = {"零": 0, "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5,
             "六": 6, "七": 7, "八": 8, "九": 9}


def _cn_floor_to_int(s: str):
    """把「總樓層數」/「移轉層次」/「租賃層次」欄位轉成整數樓層數。
    買賣（A檔）/租賃（C檔）用中文數字（如「十五層」「二十四層」），預售（B檔）用阿拉伯
    數字（如「24」），兩種格式都要能解析，供仰森判斷式與畫面顯示共用。"""
    s = (s or "").strip()
    if not s:
        return None
    s = s.split("，")[0].split(",")[0].split("、")[0]
    s = s.replace("層", "").replace("樓", "").strip()
    if not s:
        return None
    if s.isdigit():
        return int(s)
    if "十" in s:
        tens_ch, _, ones_ch = s.partition("十")
        tens = _CN_DIGIT.get(tens_ch, 1) if tens_ch else 1
        ones = _CN_DIGIT.get(ones_ch, 0) if ones_ch else 0
        return tens * 10 + ones
    return _CN_DIGIT.get(s)


def _floor_disp(s: str) -> str:
    """樓層顯示用：能轉成數字就轉，轉不了保留原文字（如「地下一層」）。"""
    n = _cn_floor_to_int(s)
    return str(n) if n is not None else (s or "").strip()


def _b_floor_num(bldg_no: str):
    """從 B 檔「棟及號」（如「A1-13F號」）取樓層數字，抓不到回傳 None。"""
    s = bldg_no or ""
    m = re.search(r"-(\d+)\s*F", s, re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*F", s, re.IGNORECASE)
    return int(m.group(1)) if m else None


def _b_unit_code(bldg_no: str):
    """從 B 檔「棟及號」（如「A棟A1-13F號」或「A1-13F號」）取戶別代碼（如「A1」），抓不到回傳 None。"""
    s = bldg_no or ""
    m = re.search(r"([A-Za-z]+\d+)-\d+\s*F", s, re.IGNORECASE)
    return m.group(1) if m else None


def _a_unit_suffix(address: str):
    """從 A/C 檔地址「之N」取同一樓層裡的戶號（如「六樓之２」→ 2），抓不到回傳 None。"""
    addr = config.normalize_digits(address or "")
    m = re.search(r"之(\d+)", addr)
    return int(m.group(1)) if m else None


def _is_residential(row) -> bool:
    if row.get("交易標的") in config.DROP_TRADE_TARGETS:
        return False
    building_type = row.get("建物型態", "")
    main_use = row.get("主要用途", "")
    if any(t in building_type for t in config.RESIDENTIAL_BUILDING_TYPES):
        return True
    if "住" in main_use:
        return True
    return False


def _floor_label(row, source):
    if source == "presale":
        return (row.get("棟及號") or "").strip()
    level_key = "租賃層次" if source == "rental" else "移轉層次"
    level = _floor_disp(row.get(level_key))
    total = _floor_disp(row.get("總樓層數"))
    if level and total:
        return f"{level}/{total}樓"
    return level or (f"{total}樓" if total else "")


def _rooms_label(row):
    r, l, w = row.get("建物現況格局-房"), row.get("建物現況格局-廳"), row.get("建物現況格局-衛")
    if not (r or l or w):
        return ""
    return f"{r or 0}房{l or 0}廳{w or 0}衛"


def process_rows(rows, source):
    """把一個 CSV（h_lvr_land_a/b/c.csv）的原始列，過濾成青埔特區住宅交易，
    並算好單價/旗標，回傳 list[dict]。source: presale(B) / resale(A) / rental(C)。"""
    out = []
    for row in rows:
        if source == "presale" and (row.get("解約情形") or "").strip():
            continue  # 已解約，不列入

        district = (row.get("鄉鎮市區") or "").strip()
        address = (row.get("土地位置建物門牌") or "").strip()
        project_name_raw = (row.get("建案名稱") or "").strip() if source == "presale" else ""
        if not config.is_qingpu_address(district, address) and project_name_raw not in config.PRESALE_PROJECT_NAME_ALLOWLIST_EXTRA:
            continue
        if not _is_residential(row):
            continue

        date_key = "租賃年月日" if source == "rental" else "交易年月日"
        date_roc = (row.get(date_key) or "").strip()
        trans_date = _roc_to_date(date_roc)
        if not trans_date:
            continue
        date_iso = trans_date.isoformat()

        build_area_sqm = _to_float(row.get("建物移轉總面積平方公尺") if source != "rental" else row.get("建物總面積平方公尺"))
        car_area_sqm = _to_float(row.get("車位移轉總面積平方公尺") if source != "rental" else row.get("車位面積平方公尺"))
        net_area_ping = (build_area_sqm - car_area_sqm) * config.SQM_TO_PING

        note = (row.get("備註") or "").strip()
        size_key = config.size_bucket(round(net_area_ping, 1) if net_area_ping > 0 else None)
        parking_key = "租賃筆棟數" if source == "rental" else "交易筆棟數"
        parking_n = _parking_count(row.get(parking_key))

        if source == "rental":
            total_rent = _to_float(row.get("總額元"))
            car_rent = _to_float(row.get("車位總額元"))
            net_rent = total_rent - car_rent
            rent_per_ping = round(net_rent / net_area_ping, 0) if net_area_ping > 0 else None
            raw_id = (row.get("編號") or "").strip()
            deal_id = f"rental:{raw_id}" if raw_id else f"rental:{date_roc}:{address}:{total_rent}"
            completion_date = _roc_to_date(row.get("建築完成年月"))
            age_years = round((trans_date - completion_date).days / 365.25, 1) if completion_date else None
            age_key = config.age_bucket_from_years(age_years)
            out.append({
                "id": deal_id,
                "source": "rental",
                "district": district,
                "address": address,
                "road": config.matched_road(district, address),
                "date": date_iso,
                "date_roc": date_roc,
                "total_rent": round(total_rent) if total_rent else None,
                "car_rent": round(car_rent) if car_rent else 0,
                "net_rent": round(net_rent) if net_rent else None,
                "area_ping": round(net_area_ping, 1) if net_area_ping > 0 else None,
                "rent_per_ping": rent_per_ping,
                "rooms": _rooms_label(row),
                "floor_label": _floor_label(row, source),
                "floor_num": _cn_floor_to_int(row.get("租賃層次")),
                "building_type": (row.get("建物型態") or "").strip(),
                "rent_kind": (row.get("出租型態") or "").strip(),  # 整棟(戶)出租 / 獨立套房 / 分租套房
                "rent_service": (row.get("租賃住宅服務") or "").strip(),  # 社會住宅代管/包租轉租 標記，市場行情要排除
                "is_market_rate": (row.get("租賃住宅服務") or "").strip() not in ("社會住宅代管", "社會住宅包租轉租"),
                "is_whole_unit": (row.get("出租型態") or "").strip() == "整棟(戶)出租",
                "size_bucket": size_key,
                "has_parking": parking_n >= 1,
                "completion_date": completion_date.isoformat() if completion_date else None,
                "age_years": age_years,
                "age_bucket": age_key,
                "note": note,
            })
            continue

        total_price = _to_float(row.get("總價元"))
        car_price = _to_float(row.get("車位總價元"))
        net_price = total_price - car_price
        unit_price_wan_ping = None
        unit_price_wan_ping_precise = None
        if net_area_ping > 0:
            precise = (net_price / net_area_ping) / 10000
            unit_price_wan_ping = round(precise, 1)
            # 銷控表要跟外部資料對得起來（2 位小數），仰森成交列表用 1 位小數就好，
            # 兩邊都留著，不要互相取代。
            unit_price_wan_ping_precise = round(precise, 2)

        car_lumped = parking_n >= 1 and car_price == 0

        special = any(k in note for k in config.SPECIAL_NOTE_KEYWORDS)

        project_name = (row.get("建案名稱") or "").strip() if source == "presale" else ""

        raw_id = (row.get("編號") or "").strip()
        deal_id = f"{source}:{raw_id}" if raw_id else f"{source}:{date_roc}:{address}:{total_price}"

        completion_date_iso = None
        if source == "presale":
            deal_kind = "presale"
            presale_via_transfer = False
            age_key = "presale"
            age_years = None
            floor_num = _b_floor_num(row.get("棟及號"))
            unit_code = _b_unit_code(row.get("棟及號"))
            unit_suffix = None
            is_yuanxiong = project_name == config.YUANXIONG_PROJECT_NAME
            is_inferred = False
        else:
            floor_num = _cn_floor_to_int(row.get("移轉層次"))
            unit_code = None  # A 檔沒有棟別戶別，不要用門牌之N亂猜戶別代碼
            unit_suffix = _a_unit_suffix(address)
            completion_date = _roc_to_date(row.get("建築完成年月"))
            completion_date_iso = completion_date.isoformat() if completion_date else None
            # 青埔很多預售交易的「過戶登記」被記在買賣（A）檔，備註會寫「預售屋、或
            # 土地及建物分件登記案件」，交易日期通常早於建築完成年月。這種列其實是
            # B 檔預售資料的重複登記，不是真的中古屋轉手，要歸類成預售、之後再跟 B
            # 檔做一次去重（見 dedupe_presale_transfers）。
            # 第三種情況：備註沒寫「預售屋」、交易日期也晚於建築完成年月，但只晚一點點
            # （PRESALE_HANDOVER_GRACE_DAYS 天內）——這種多半是預售合約交屋時最終過戶
            # 登記，不是真的第三方中古轉手（真正的中古轉手不可能交屋後一兩個月內就成交），
            # 也歸類成預售，不然會拉低「中古/新成屋」中位數。
            days_since_completion = (trans_date - completion_date).days if completion_date is not None else None
            is_transfer_candidate = (
                "預售屋" in note
                or (completion_date is not None and trans_date < completion_date)
                or (days_since_completion is not None and 0 <= days_since_completion <= config.PRESALE_HANDOVER_GRACE_DAYS)
            )
            if is_transfer_candidate:
                deal_kind = "presale_transfer"
                presale_via_transfer = True
                age_key = "presale"
                age_years = None
            else:
                deal_kind = "resale"
                presale_via_transfer = False
                if completion_date:
                    age_years = round((trans_date - completion_date).days / 365.25, 1)
                else:
                    age_years = None
                age_key = config.age_bucket_from_years(age_years)
            is_yuanxiong = config.is_yuanxiong_address(district, address)
            is_inferred = is_yuanxiong  # A 檔的仰森列都是用地址規則推定，不是建案名稱直接對到的

        out.append({
            "id": deal_id,
            "source": source,  # presale | resale：CSV 檔案來源
            "deal_kind": deal_kind,  # presale｜presale_transfer｜resale：實際交易性質
            "presale_via_transfer": presale_via_transfer,
            "district": district,
            "address": address,
            "road": config.matched_road(district, address),
            "date": date_iso,
            "date_roc": date_roc,
            "total_price_wan": round(total_price / 10000, 1),
            "area_ping": round(net_area_ping, 1) if net_area_ping > 0 else None,
            "unit_price_wan_ping": unit_price_wan_ping,
            "completion_date": completion_date_iso,  # 只有 A 檔（買賣）才有值，供交屋時間表使用
            "unit_price_wan_ping_precise": unit_price_wan_ping_precise,
            "car_price_wan": round(car_price / 10000, 1) if car_price > 0 else 0.0,
            "car_area_ping": round(car_area_sqm * config.SQM_TO_PING, 2) if car_area_sqm > 0 else 0.0,
            "rooms": _rooms_label(row),
            "floor_label": _floor_label(row, source),
            "floor_num": floor_num,
            "unit_code": unit_code,
            "unit_suffix": unit_suffix,
            "total_floors": _floor_disp(row.get("總樓層數")),
            "building_type": (row.get("建物型態") or "").strip(),
            "project_name": project_name,
            "is_yuanxiong": is_yuanxiong,
            "is_inferred": is_inferred,
            "car_lumped": car_lumped,
            "special": special,
            "note": note,
            "size_bucket": size_key,
            "age_bucket": age_key,
            "age_years": age_years,
            "price_band": config.price_band(round(total_price / 10000, 1)),
        })
    return out


def _door_key(address: str):
    """把地址正規化成「門牌」key（行政區+路街+段+巷+號，NFKC 正規化、去「桃園市」），
    同一個門牌底下不同樓層/之N 的交易都會算同一個 key，用來把買賣（A檔，沒有建案名稱）
    的物件對應回預售（B檔）建案名稱。抓不到回傳 None。"""
    a = unicodedata.normalize("NFKC", address or "").replace("桃園市", "")
    m = _DOOR_RE.match(a)
    return "".join(g or "" for g in m.groups()) if m else None


def dedupe_presale_transfers(deals_by_id: dict) -> int:
    """A 檔裡歸類成 presale_transfer 的列，很多是 B 檔預售資料的『過戶登記』重複列：
    同一筆交易簽約時登記一次（B檔，有建案名稱），交屋前過戶又登記一次（A檔，沒有建案
    名稱、備註常寫「預售屋」）。用（行政區、交易日期、總價整數萬）當 key 去配對 B 檔，
    兩邊都有樓層資料的話樓層也要對得上，配對成功就把 A 的那筆刪掉（保留有建案名稱的
    B）。一個 B 只會吸收一個 A（multiset）。配不到的維持在資料裡、標成 presale_transfer，
    通常是 2021 年 7 月 B 檔開始登記之前簽的預售約。"""
    b_by_key = defaultdict(list)
    for d in deals_by_id.values():
        if d["source"] == "presale":
            key = (d["district"], d["date"], round(d["total_price_wan"]))
            b_by_key[key].append(d)

    used_b_ids = set()
    drop_ids = []
    for d in deals_by_id.values():
        if d.get("deal_kind") != "presale_transfer":
            continue
        key = (d["district"], d["date"], round(d["total_price_wan"]))
        for b in b_by_key.get(key, []):
            if b["id"] in used_b_ids:
                continue
            if d["floor_num"] is not None and b["floor_num"] is not None and d["floor_num"] != b["floor_num"]:
                continue
            used_b_ids.add(b["id"])
            drop_ids.append(d["id"])
            # A 那筆要被刪掉了，交屋訊號（建築完成年月）記在存活的 B 那筆上，供
            # compute_supply.py 算「實際交屋月」用，不然這個訊號會隨 A 列一起消失。
            if d.get("completion_date"):
                b.setdefault("handover_signals", []).append({"completion_date": d["completion_date"], "transfer_date": d["date"]})
            break

    for did in drop_ids:
        del deals_by_id[did]
    return len(drop_ids)


def build_door_project_map() -> dict:
    """掃 .cache/lvr/ 底下所有季別/歷史批次 zip（中壢區+大園區全區，不限青埔道路
    白名單——這一步要看整個行政區才找得到夠多建案，同一個門牌底下只要有任何一筆
    買賣配對到預售就能推回建案名稱，不需要買賣那筆本身也在道路白名單內），把備註
    寫「預售屋」的買賣（A檔）列配對回預售（B檔）建案名稱，依門牌多數決。
    回傳 {門牌: {"project": 建案名稱, "votes": 得票數, "total": 該門牌總票數}}。
    只看本機已快取的 zip（跟 --seed 用的是同一批檔案），不會另外發線上請求。

    重點：要先把所有 zip 的 A/B 列（用編號去重）都收集完，再一起建索引、一起配對——
    不能一個 zip 一個 zip 分開做，因為同一筆交易的預售簽約可能在很舊的季別檔、
    過戶登記卻在最近的歷史批次檔，兩邊要放在同一個索引裡才配得到。"""
    zip_paths = sorted(glob.glob(os.path.join(config.LVR_CACHE_DIR, "*.zip")))
    a_index = {}
    b_index = {}
    for path in zip_paths:
        try:
            with open(path, "rb") as f:
                zip_bytes = f.read()
            for row in _read_csv_from_zip(zip_bytes, config.LVR_TAOYUAN_FILES["resale"]):
                if row.get("鄉鎮市區", "").strip() in ("中壢區", "大園區"):
                    rid = row.get("編號", "").strip()
                    if rid:
                        a_index[rid] = row
            for row in _read_csv_from_zip(zip_bytes, config.LVR_TAOYUAN_FILES["presale"]):
                if row.get("鄉鎮市區", "").strip() in ("中壢區", "大園區") and not (row.get("解約情形") or "").strip():
                    rid = row.get("編號", "").strip()
                    if rid:
                        b_index[rid] = row
        except Exception as e:  # noqa: BLE001
            log(f"door mapping: 讀 {path} 失敗，跳過：{e}")
    log(f"door mapping: 掃了 {len(zip_paths)} 個快取 zip，中壢區/大園區買賣 {len(a_index)} 筆、預售 {len(b_index)} 筆（都已用編號去重）")

    b_by_key = defaultdict(list)
    for row in b_index.values():
        key = (row.get("鄉鎮市區", "").strip(), row.get("交易年月日", "").strip(), row.get("總價元", "").strip())
        b_by_key[key].append(row)

    door_votes = defaultdict(Counter)
    for row in a_index.values():
        note = row.get("備註", "").strip()
        if "預售屋" not in note:
            continue
        key = (row.get("鄉鎮市區", "").strip(), row.get("交易年月日", "").strip(), row.get("總價元", "").strip())
        candidates = b_by_key.get(key, [])
        if not candidates:
            continue
        door = _door_key(row.get("土地位置建物門牌"))
        if not door:
            continue
        a_floor = _cn_floor_to_int(row.get("移轉層次"))
        for b in candidates:
            b_floor = _b_floor_num(b.get("棟及號"))
            if a_floor is None or b_floor is None or a_floor == b_floor:
                proj = (b.get("建案名稱") or "").strip()
                if proj:
                    door_votes[door][proj] += 1

    result = {}
    for door, counter in door_votes.items():
        if not counter:
            continue
        project, votes = counter.most_common(1)[0]
        result[door] = {"project": project, "votes": votes, "total": sum(counter.values())}
    return result


def load_door_project_map() -> dict:
    try:
        with open(config.DOOR_PROJECT_JSON, encoding="utf-8") as f:
            return json.load(f).get("doors", {}) or {}
    except (OSError, json.JSONDecodeError):
        return {}


def merge_door_project_maps(old: dict, new: dict) -> dict:
    merged = dict(old)
    for door, v in new.items():
        prev = merged.get(door)
        if prev is None or prev["project"] == v["project"] or v["votes"] >= prev["votes"]:
            if prev is not None and prev["project"] == v["project"]:
                v = {**v, "votes": max(v["votes"], prev["votes"]), "total": max(v["total"], prev["total"])}
            merged[door] = v
    return merged


def save_door_project_map(door_project: dict):
    os.makedirs(config.DATA_DIR, exist_ok=True)
    payload = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "door_count": len(door_project),
        "project_count": len({v["project"] for v in door_project.values()}),
        "doors": door_project,
    }
    with open(config.DOOR_PROJECT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)


def tag_project_name_inferred(deals_by_id: dict, door_project: dict):
    """幫每一筆交易補上 project_name_inferred：B 檔（預售）直接用自己的建案名稱；
    A 檔（買賣）用地址的門牌去查 door_project 對照表，查不到就是 None。"""
    for d in deals_by_id.values():
        if d["source"] == "presale":
            d["project_name_inferred"] = d.get("project_name") or None
        else:
            door = _door_key(d.get("address"))
            hit = door_project.get(door) if door else None
            d["project_name_inferred"] = hit["project"] if hit else None


def tag_rental_project(rentals_by_id: dict, door_project: dict):
    """租賃（C檔）也沒有建案名稱，一樣用門牌對照表歸戶，供租金/售價比（毛租金收益率）
    可以在同建案內比較用；查不到就是 None（仍保留列，只是不能歸戶）。"""
    for d in rentals_by_id.values():
        door = _door_key(d.get("address"))
        hit = door_project.get(door) if door else None
        d["project_name_inferred"] = hit["project"] if hit else None


# ---------------------------------------------------------------------------
# 讀寫 data/deals.json、data/rental.json
# ---------------------------------------------------------------------------
def load_deals():
    if not os.path.exists(config.DEALS_JSON):
        return {}
    with open(config.DEALS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    return {d["id"]: d for d in data.get("deals", [])}


# deals.json 是全站最大的資料檔（中壢區+大園區5年全部交易，不只仰森），這幾個欄位
# 前端網頁不顯示、後面的 compute_*.py 也不會從存檔的 deals.json 讀回來用（門牌對照/
# 去重都是在同一次執行、寫檔之前就做完了），只在序列化這一步濾掉減少檔案大小；
# in-memory 的 deals_by_id 本身不動，同一次執行裡其他函式要用還是拿得到。
_DROP_FIELDS_ON_SAVE = ("date_roc", "unit_suffix", "is_inferred", "presale_via_transfer", "completion_date", "building_type", "note")


def save_deals(deals_by_id):
    os.makedirs(config.DATA_DIR, exist_ok=True)
    deals = sorted(deals_by_id.values(), key=lambda d: (d["date"], d["id"]))
    slim_deals = [{k: v for k, v in d.items() if k not in _DROP_FIELDS_ON_SAVE} for d in deals]
    payload = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "count": len(slim_deals),
        "deals": slim_deals,
    }
    # 這支檔案筆數多（青埔全區5年+），indent=1 會讓檔案大小接近翻倍，公開 repo 裡
    # 不需要人工逐行看 diff，改用無縮排（但保留 key: value 之間的空白，肉眼還讀得懂）。
    with open(config.DEALS_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)


def load_rentals():
    if not os.path.exists(config.RENTAL_JSON):
        return {}
    with open(config.RENTAL_JSON, encoding="utf-8") as f:
        data = json.load(f)
    return {d["id"]: d for d in data.get("rentals", [])}


def save_rentals(rentals_by_id):
    os.makedirs(config.DATA_DIR, exist_ok=True)
    rentals = sorted(rentals_by_id.values(), key=lambda d: (d["date"], d["id"]))
    payload = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "count": len(rentals),
        "rentals": rentals,
    }
    with open(config.RENTAL_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)


def config_snapshot():
    """把 config.py 目前的青埔範圍/仰森規則/坪數屋齡分類寫進 meta.json，
    讓網頁的「資料說明」直接讀這裡，不用在網頁裡手動抄一份，改 config.py 就會同步。"""
    return {
        "districts": config.DISTRICTS,
        "road_whitelist_common": config.ROAD_WHITELIST_COMMON,
        "road_whitelist_dayuan_only": config.ROAD_WHITELIST_DAYUAN_ONLY,
        "size_buckets": [
            {"key": k, "label": l, "min": lo, "max": hi}
            for k, l, lo, hi in config.SIZE_BUCKETS
        ],
        "age_bucket_labels": config.AGE_BUCKET_LABELS,
        "yuanxiong_rule": {
            "project_name": config.YUANXIONG_PROJECT_NAME,
            "district": config.YUANXIONG_DISTRICT,
            "address_keyword": config.YUANXIONG_ADDRESS_KEYWORD,
            "door_numbers": sorted(config.YUANXIONG_DOOR_NUMBERS),
        },
        "leju_reference": config.LEJU_REFERENCE,
    }


def update_meta(section: dict, fetch_state: dict = None):
    meta = {}
    if os.path.exists(config.META_JSON):
        try:
            with open(config.META_JSON, encoding="utf-8") as f:
                meta = json.load(f)
        except (json.JSONDecodeError, OSError):
            meta = {}
    meta["lvr"] = section
    meta["config"] = config_snapshot()
    if fetch_state is not None:
        meta["lvr_fetch_state"] = fetch_state
    os.makedirs(config.DATA_DIR, exist_ok=True)
    with open(config.META_JSON, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)


def merge_zip_into(zip_bytes, deals_by_id, rentals_by_id):
    added, updated = 0, 0
    for source, filename in config.LVR_TAOYUAN_FILES.items():
        rows = _read_csv_from_zip(zip_bytes, filename)
        processed = process_rows(rows, source)
        target = rentals_by_id if source == "rental" else deals_by_id
        for d in processed:
            if d["id"] in target:
                if target[d["id"]] != d:
                    updated += 1
            else:
                added += 1
            target[d["id"]] = d
    return added, updated


def load_fetch_state() -> dict:
    if not os.path.exists(config.META_JSON):
        return {"seasons_ok": [], "history_ok": []}
    try:
        with open(config.META_JSON, encoding="utf-8") as f:
            meta = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"seasons_ok": [], "history_ok": []}
    state = meta.get("lvr_fetch_state") or {}
    return {"seasons_ok": list(state.get("seasons_ok", [])), "history_ok": list(state.get("history_ok", []))}


def bridge_recent_history(deals_by_id: dict, rentals_by_id: dict, fetch_state: dict):
    """單靠「最新一批」zip 只涵蓋近約 10 天，最新一季公布前會有一大段空窗。這裡固定
    嘗試前一季＋目前這一季（一旦公布，之後每次執行都會跳過，不重抓），再用每月 1/11/21
    號的歷史批次 zip 補目前這一季開始到今天的空窗——history_ok 是用「已抓過的日期」
    當快取 key（不是用「上次執行日期」），所以無論排程多久跑一次，這裡都會把「目前
    這一季開始以來所有還沒抓過的 1/11/21 批次」一次補齊，不會因為排程頻率變低（例如
    改成每月一次）而漏掉中間的批次。歷史批次抓過且是有效 zip 的日期記在 fetch_state
    裡，之後只抓沒抓過的新日期。"""
    seasons_ok = set(fetch_state.get("seasons_ok", []))
    history_ok = set(fetch_state.get("history_ok", []))
    new_seasons, new_history = [], []

    current_season = current_roc_season()
    for season in (previous_season(current_season), current_season):
        if season in seasons_ok:
            continue
        try:
            zip_bytes = download_season_zip(season)
            merge_zip_into(zip_bytes, deals_by_id, rentals_by_id)
            seasons_ok.add(season)
            new_seasons.append(season)
            log(f"bridge: season {season} now available, merged")
        except Exception as e:  # noqa: BLE001
            log(f"bridge: season {season} still unavailable, skip: {e}")

    start = quarter_start_date(current_season)
    today = datetime.date.today()
    for date_str in history_dates_from(start, today):
        if date_str in history_ok:
            continue
        try:
            zip_bytes = download_history_zip(date_str)
            merge_zip_into(zip_bytes, deals_by_id, rentals_by_id)
            history_ok.add(date_str)
            new_history.append(date_str)
            log(f"bridge: history {date_str} merged")
        except Exception as e:  # noqa: BLE001
            log(f"bridge: history {date_str} unavailable, skip: {e}")

    fetch_state["seasons_ok"] = sorted(seasons_ok)
    fetch_state["history_ok"] = sorted(history_ok)

    # 最新一批（近約10天，不快取，每次都重抓）永遠補到最後，涵蓋歷史批次還沒收錄的最新資料。
    latest_ok = True
    latest_error = ""
    try:
        zip_bytes = download_latest_zip()
        merge_zip_into(zip_bytes, deals_by_id, rentals_by_id)
        log("bridge: latest batch merged")
    except Exception as e:  # noqa: BLE001
        latest_ok = False
        latest_error = str(e)
        log(f"bridge: latest batch FAILED: {e}")

    return new_seasons, new_history, latest_ok, latest_error


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", action="store_true", help="回補 LVR_SEED_START_SEASON 到目前季別的歷史資料")
    args = parser.parse_args()

    deals_by_id = load_deals()
    rentals_by_id = load_rentals()
    before = len(deals_by_id)
    fetch_state = load_fetch_state()
    if before == 0 and (fetch_state.get("seasons_ok") or fetch_state.get("history_ok")):
        # deals.json 是空的（第一次跑，或被刪掉重建），但 meta.json 裡還留著舊的
        # fetch_state，會讓 bridge 誤以為季別/歷史批次都抓過了而整批跳過，資料會
        # 悄悄缺一大塊。deals.json 都空了，快取狀態就不可信，重置。
        log("data/deals.json 是空的但 lvr_fetch_state 不是空的，重置快取狀態重新抓")
        fetch_state = {"seasons_ok": [], "history_ok": []}
    status = "ok"
    message = ""
    seasons_done = []

    if args.seed:
        seasons = season_range(config.LVR_SEED_START_SEASON, current_roc_season())
        seasons_ok = set(fetch_state.get("seasons_ok", []))
        for season in seasons:
            try:
                zip_bytes = download_season_zip(season)
                added, updated = merge_zip_into(zip_bytes, deals_by_id, rentals_by_id)
            except Exception as e:  # noqa: BLE001
                # 最新一季可能還沒公布（伺服器回傳錯誤頁而不是 zip），跳過就好，
                # 不要讓還沒公布的季別擋掉前面已經抓到的資料。
                log(f"season {season} unavailable, skip: {e}")
                continue
            seasons_done.append(season)
            seasons_ok.add(season)
            log(f"season {season}: +{added} new, {updated} updated (running total deals={len(deals_by_id)} rentals={len(rentals_by_id)})")
        fetch_state["seasons_ok"] = sorted(seasons_ok)

    # --seed 或平日的預設模式都走這裡：固定嘗試前一季/目前這一季的季別檔、目前這一季
    # 開始到今天的每月1/11/21歷史批次、以及最新一批，把最新一季公布前的空窗補起來。
    bridge_seasons, bridge_history, latest_ok, latest_error = bridge_recent_history(deals_by_id, rentals_by_id, fetch_state)
    if not args.seed and not latest_ok:
        status = "fail"
        message = latest_error

    dropped = dedupe_presale_transfers(deals_by_id)
    log(f"dedupe_presale_transfers: dropped {dropped} A-file rows that duplicate a B-file presale row")

    # 每月排程沒有 .cache（zip 快取不進版控），只看得到這次下載的批次，配出來的門牌很少。
    # 所以要跟上次存的對照表合併，不能直接覆蓋；同一門牌兩邊建案不同時取票數多的。
    door_project = merge_door_project_maps(load_door_project_map(), build_door_project_map())
    save_door_project_map(door_project)
    tag_project_name_inferred(deals_by_id, door_project)
    tag_rental_project(rentals_by_id, door_project)
    log(f"door_project: {len(door_project)} 個門牌對應到 {len({v['project'] for v in door_project.values()})} 個建案")

    save_deals(deals_by_id)
    save_rentals(rentals_by_id)

    presale_n = sum(1 for d in deals_by_id.values() if d["deal_kind"] == "presale")
    presale_transfer_n = sum(1 for d in deals_by_id.values() if d["deal_kind"] == "presale_transfer")
    resale_n = sum(1 for d in deals_by_id.values() if d["deal_kind"] == "resale")
    resale_age_dist = {}
    for d in deals_by_id.values():
        if d["deal_kind"] == "resale":
            resale_age_dist[d["age_bucket"]] = resale_age_dist.get(d["age_bucket"], 0) + 1

    yuanxiong_presale = sum(1 for d in deals_by_id.values() if d["is_yuanxiong"] and d["deal_kind"] == "presale")
    yuanxiong_presale_transfer = sum(1 for d in deals_by_id.values() if d["is_yuanxiong"] and d["deal_kind"] == "presale_transfer")
    yuanxiong_resale = sum(1 for d in deals_by_id.values() if d["is_yuanxiong"] and d["deal_kind"] == "resale")

    update_meta({
        "last_run": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "mode": "seed" if args.seed else "latest",
        "status": status,
        "message": message,
        "seasons_seeded": seasons_done,
        "total_deals": len(deals_by_id),
        "total_rentals": len(rentals_by_id),
        "presale_deals": presale_n,
        "presale_transfer_deals": presale_transfer_n,
        "resale_deals": resale_n,
        "resale_age_dist": resale_age_dist,
        "dedup_dropped_this_run": dropped,
        "yuanxiong_presale": yuanxiong_presale,
        "yuanxiong_presale_transfer": yuanxiong_presale_transfer,
        "yuanxiong_resale": yuanxiong_resale,
        "new_this_run": len(deals_by_id) - before,
        "bridge_new_seasons": bridge_seasons,
        "bridge_new_history_dates": bridge_history,
    }, fetch_state=fetch_state)

    log(
        f"done. total={len(deals_by_id)} rentals={len(rentals_by_id)} presale(B)={presale_n} "
        f"presale_transfer(A)={presale_transfer_n} resale={resale_n} {resale_age_dist} "
        f"yuanxiong: presale={yuanxiong_presale} presale_transfer={yuanxiong_presale_transfer} "
        f"resale(交屋後轉手)={yuanxiong_resale} status={status} "
        f"bridge_seasons={bridge_seasons} bridge_history_new={len(bridge_history)}"
    )
    # 單一來源失敗不視為整體失敗中斷，讓 run.sh 可以繼續跑下一支
    return 0


if __name__ == "__main__":
    sys.exit(main())
