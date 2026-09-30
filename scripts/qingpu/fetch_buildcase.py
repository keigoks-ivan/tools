# -*- coding: utf-8 -*-
"""
抓內政部「預售屋備查建案」資料（實價登錄的建案基本資料，跟成交無關：層棟戶數、
建照核發日期、第1次登記日期），寫入 data/buildcase.json。這個資料源給
compute_supply.py 用來算「建案總表」「交屋時間表」（用官方第一次登記日期，
不是用交易資料反推）、跟總戶數（不是只算賣掉的戶數）。

用法：
    python3 fetch_buildcase.py
"""
import csv
import datetime
import io
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict

import config

TIMEOUT = 60
RETRIES = 3


def log(msg):
    print(f"[fetch_buildcase] {msg}", file=sys.stderr)


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
    raise RuntimeError(f"download failed after {RETRIES} attempts: {last_err}")


def _parse_csv(raw: bytes):
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
        next(reader)  # 英文表頭
    except StopIteration:
        return []
    return [dict(zip(header, row)) for row in reader if row]


def normalize_project_name(name: str) -> str:
    """拿掉空白和常見的分隔符號（‧．·全形/半形句點、問號等編碼雜訊），
    兩邊名稱正規化後再比對，比對不到再查人工別名表。"""
    if not name:
        return ""
    n = unicodedata.normalize("NFKC", name).strip()
    # NFKC 會把全形句點．轉成半形句點，所以半形的也要拿掉，不能只拿全形的
    for ch in (" ", "　", "．", "‧", "·", ".", "?", "？", "-", "－"):
        n = n.replace(ch, "")
    return n


def match_to_alias(name: str) -> str:
    """先正規化，再查人工別名表（別名表的 key/value 都用原始寫法，這裡也正規化比對）。"""
    norm = normalize_project_name(name)
    for raw_key, raw_val in config.PROJECT_NAME_ALIASES.items():
        if normalize_project_name(raw_key) == norm:
            return normalize_project_name(raw_val)
    return norm


def _road_whitelist_for_buildcase(district: str):
    return config.road_whitelist_for(district) + config.BUILDCASE_ROAD_WHITELIST_EXTRA


def is_qingpu_buildcase(district: str, location: str) -> bool:
    if district not in config.DISTRICTS:
        return False
    if not location:
        return False
    return any(road in location for road in _road_whitelist_for_buildcase(district))


def main():
    status = "ok"
    message = ""
    cases = []
    try:
        buildcase_rows = _parse_csv(_download(config.LVR_BUILDCASE_URL))
        permit_rows = _parse_csv(_download(config.LVR_BUILDINGPERMIT_URL))
    except Exception as e:  # noqa: BLE001
        status = "fail"
        message = str(e)
        log(f"FAILED: {e}")
        buildcase_rows = []
        permit_rows = []

    permits_by_case = defaultdict(list)
    for row in permit_rows:
        rid = (row.get("編號") or "").strip()
        date = (row.get("建照核發日期") or "").strip()
        if rid and date:
            permits_by_case[rid].append(date)

    for row in buildcase_rows:
        district = (row.get("鄉鎮市區") or "").strip()
        location = (row.get("坐落街道") or "").strip()
        if not is_qingpu_buildcase(district, location):
            continue
        rid = (row.get("編號") or "").strip()
        name = (row.get("建案名稱") or "").strip()
        households_raw = (row.get("層棟戶數") or "").strip()
        try:
            households = int(households_raw)
        except ValueError:
            households = None

        permit_dates = sorted(permits_by_case.get(rid, []))
        own_permit_date = (row.get("建照核發日期") or "").strip()
        if own_permit_date:
            permit_dates = sorted(set(permit_dates + [own_permit_date]))
        first_permit_date = permit_dates[0] if permit_dates else None

        first_registration = (row.get("第1次登記日期") or "").strip() or None

        cases.append({
            "id": rid,
            "district": district,
            "project_name": name,
            "project_name_norm": match_to_alias(name),
            "location": location,
            "builder": (row.get("起造人") or "").strip(),
            "households": households,
            "declare_date_roc": (row.get("申報備查日期") or "").strip() or None,
            "selling_period": (row.get("銷售期間") or "").strip() or None,
            "permit_date_roc": first_permit_date,
            "permit_dates_all_roc": permit_dates,
            "first_registration_date_roc": first_registration,
            "is_completed": first_registration is not None,
        })

    payload = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "status": status,
        "message": message,
        "count": len(cases),
        "completed_count": sum(1 for c in cases if c["is_completed"]),
        "not_completed_count": sum(1 for c in cases if not c["is_completed"]),
        "cases": cases,
    }
    with open(config.BUILDCASE_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    log(f"done. n={len(cases)} completed={payload['completed_count']} not_completed={payload['not_completed_count']} status={status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
