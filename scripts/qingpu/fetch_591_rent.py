# -*- coding: utf-8 -*-
"""
591 租屋（rent.591.com.tw）輕量交叉核對：只算物件數跟粗略中位開租金，不做去重／
扣車位等深度處理（那些交給實價登錄租賃 C 檔，見 data/rental.json + compute_demand.py）。
寫進 data/meta.json 的 house591_rent 區塊。591 端點如果打不到，這個區塊留空、
status 標成失敗，不擋掉其他計算。

注意：591 租屋 API 是 /v3/web/rent/list，跟售屋的 /v1/web/sale/list 不是同一版。

用法：
    python3 fetch_591_rent.py
"""
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import config

TIMEOUT = 30
RETRIES = 3
MAX_PAGES = 100


def log(msg):
    print(f"[fetch_591_rent] {msg}", file=sys.stderr)


def fetch_page(keyword: str, first_row: int) -> dict:
    qs = urllib.parse.urlencode({
        "type": 1,
        "shType": "list",
        "regionid": config.RENT_591_REGION_ID,
        "keywords": keyword,
        "firstRow": first_row,
    })
    url = f"{config.RENT_591_BASE_URL}?{qs}"
    req = urllib.request.Request(url, headers={
        "User-Agent": config.HOUSE_591_USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://rent.591.com.tw/",
    })
    last_err = None
    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last_err = e
            log(f"fetch attempt {attempt}/{RETRIES} failed ({keyword}, firstRow={first_row}): {e}")
            time.sleep(2 * attempt)
    raise RuntimeError(f"591 rent fetch failed after {RETRIES} attempts: {last_err}")


def fetch_all_for_keyword(keyword: str):
    items = []
    total = None
    first_row = 0
    pages = 0
    while pages < MAX_PAGES:
        data = fetch_page(keyword, first_row)
        d = data.get("data") or {}
        page_items = (d.get("items") or []) + (d.get("topData") or [])
        if total is None:
            try:
                total = int(d.get("total") or 0)
            except (TypeError, ValueError):
                total = 0
        if not page_items:
            break
        items.extend(page_items)
        pages += 1
        first_row += config.RENT_591_PAGE_SIZE
        if total and first_row >= total:
            break
        time.sleep(config.RENT_591_SLEEP_SEC)
    return items, (total or 0)


def _parse_price(item):
    raw = item.get("price")
    if raw is None:
        return None
    try:
        return int(str(raw).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _item_id(item):
    return item.get("id") or item.get("houseid") or item.get("houseId")


def is_yuanxiong(item):
    community = item.get("community_name") or ""
    title = item.get("title") or ""
    return config.YUANXIONG_COMMUNITY_KEYWORD_591 in community or config.YUANXIONG_COMMUNITY_KEYWORD_591 in title


def update_meta(section: dict):
    meta = {}
    if os.path.exists(config.META_JSON):
        try:
            with open(config.META_JSON, encoding="utf-8") as f:
                meta = json.load(f)
        except (json.JSONDecodeError, OSError):
            meta = {}
    meta["house591_rent"] = section
    os.makedirs(config.DATA_DIR, exist_ok=True)
    with open(config.META_JSON, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)


def main():
    all_by_id = {}
    keyword_totals = {}
    errors = []
    ok_keywords = 0
    for kw in config.RENT_591_KEYWORDS:
        try:
            items, total = fetch_all_for_keyword(kw)
            keyword_totals[kw] = total
            for it in items:
                iid = _item_id(it)
                if iid is None:
                    continue
                all_by_id[str(iid)] = it
            ok_keywords += 1
            log(f"keyword={kw!r} total={total} fetched={len(items)}")
        except Exception as e:  # noqa: BLE001
            errors.append(f"{kw}: {e}")
            log(f"keyword={kw!r} FAILED: {e}")

    if ok_keywords == 0:
        update_meta({
            "last_run": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "status": "fail",
            "message": "; ".join(errors),
            "keyword_totals": {},
            "active_listings": 0,
            "active_yuanxiong": 0,
            "sample_median_rent": None,
            "endpoint_note": "591 v3 租屋 API 交叉核對用途，只算物件數與粗略中位開租金，不做去重／扣車位等深度處理",
        })
        log("done. status=fail（兩個關鍵字都抓不到）")
        return 0

    status = "ok" if not errors else "partial"
    prices = [p for p in (_parse_price(it) for it in all_by_id.values()) if p is not None]
    yx_n = sum(1 for it in all_by_id.values() if is_yuanxiong(it))

    update_meta({
        "last_run": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": status,
        "message": "; ".join(errors),
        "keyword_totals": keyword_totals,
        "active_listings": len(all_by_id),
        "active_yuanxiong": yx_n,
        "sample_median_rent": round(statistics.median(prices)) if prices else None,
        "endpoint_note": "591 v3 租屋 API 交叉核對用途，只算物件數與粗略中位開租金，不做去重／扣車位等深度處理",
    })
    log(f"done. status={status} active={len(all_by_id)} yuanxiong={yx_n} median_rent={round(statistics.median(prices)) if prices else None}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
