# -*- coding: utf-8 -*-
"""
抓 591 售屋網「青埔」「仰森」關鍵字的在售物件（開價），寫入 data/listings.json
與去重後的「戶」data/units.json。不用任何金鑰，純打公開的 JSON API + 瀏覽器 UA。

公開版重點：不寫出賣方/仲介個資（暱稱、頭像）——只保留 houseid 跟公開刊登連結、
價格、坪數、樓層、房型、社區、道路、日期這些跟「開價」本身有關的欄位。

用法：
    python3 fetch_591.py
"""
import datetime
import hashlib
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

import config

TIMEOUT = 30
RETRIES = 3
MAX_PAGES = 400  # 安全上限，避免 total 欄位異常時無限迴圈


def log(msg):
    print(f"[fetch_591] {msg}", file=sys.stderr)


# ---------------------------------------------------------------------------
# 抓取
# ---------------------------------------------------------------------------
def fetch_page(keyword: str, first_row: int) -> dict:
    qs = urllib.parse.urlencode({
        "type": 2,
        "shType": "list",
        "regionid": config.HOUSE_591_REGION_ID,
        "keywords": keyword,
        "firstRow": first_row,
    })
    url = f"{config.HOUSE_591_BASE_URL}?{qs}"
    req = urllib.request.Request(url, headers={
        "User-Agent": config.HOUSE_591_USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://sale.591.com.tw/",
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
    raise RuntimeError(f"591 fetch failed after {RETRIES} attempts: {last_err}")


def fetch_all_for_keyword(keyword: str):
    """回傳 (items, total)。若中途出錯會直接把例外往外拋，讓呼叫端知道這個關鍵字沒抓完。"""
    items = []
    total = None
    first_row = 0
    pages = 0
    while pages < MAX_PAGES:
        data = fetch_page(keyword, first_row)
        d = data.get("data") or {}
        house_list = d.get("house_list") or []
        if total is None:
            try:
                total = int(d.get("total") or 0)
            except (TypeError, ValueError):
                total = 0
        if not house_list:
            break
        items.extend(house_list)
        pages += 1
        first_row += config.HOUSE_591_PAGE_SIZE
        if total and first_row >= total:
            break
        time.sleep(config.HOUSE_591_SLEEP_SEC)
    return items, (total or 0)


# ---------------------------------------------------------------------------
# 過濾 / 欄位轉換
# ---------------------------------------------------------------------------
def keep_item(item: dict) -> bool:
    if item.get("is_newhouse") == 1:
        return False
    if "kind" not in item:
        return False
    section = (item.get("section_name") or "").strip()
    address = (item.get("address") or "").strip()
    community = (item.get("community_name") or "").strip()
    if config.is_qingpu_address(section, address):
        return True
    if config.YUANXIONG_COMMUNITY_KEYWORD_591 in community:
        return True
    return False


def _591_total_floor(floor_str):
    """591 樓層字串「7F/24F」取後面那個總樓層數，抓不到回傳 None。"""
    if not floor_str:
        return None
    m = re.search(r"/(\d+)\s*F", floor_str, re.IGNORECASE)
    return int(m.group(1)) if m else None


def is_yuanxiong_item(item: dict) -> bool:
    community = item.get("community_name") or ""
    title = item.get("title") or ""
    kw = config.YUANXIONG_COMMUNITY_KEYWORD_591
    if kw not in community and kw not in title:
        return False
    # 標題/社區名稱含「仰森」但總樓層不是 24 層的，是別的建案被誤標（例如「近仰森」），
    # 仰森本身是 24 層。樓層欄位缺資料就先放行，不要用不確定的資訊誤刪。
    total_floor = _591_total_floor(item.get("floor"))
    if total_floor is not None and total_floor != 24:
        return False
    return True


def _to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _parse_age_years(showhouseage, houseage):
    if houseage == 0:
        return 0.0
    s = (showhouseage or "").strip()
    if not s:
        return float(houseage) if isinstance(houseage, (int, float)) else None
    y = re.search(r"(\d+(?:\.\d+)?)\s*年", s)
    m = re.search(r"(\d+)\s*個?月", s)
    if not y and not m:
        return float(houseage) if isinstance(houseage, (int, float)) else None
    years = float(y.group(1)) if y else 0.0
    months = float(m.group(1)) if m else 0.0
    return round(years + months / 12, 2)


def normalize_item(item: dict, today_iso: str) -> dict:
    """公開版：不寫 nick_name/photo_url 等賣方個資欄位，只留跟「開價」本身有關的資訊。"""
    area = _to_float(item.get("area"))
    unitprice = _to_float(item.get("unitprice"))
    price = _to_float(item.get("price"))
    section = (item.get("section_name") or "").strip()
    address = (item.get("address") or "").strip()
    age_years = _parse_age_years(item.get("showhouseage"), item.get("houseage"))
    posttime = item.get("posttime")
    post_date = None
    if isinstance(posttime, (int, float)) and posttime > 0:
        try:
            post_date = datetime.date.fromtimestamp(posttime).isoformat()
        except (OSError, OverflowError, ValueError):
            post_date = None
    return {
        "houseid": item.get("houseid"),
        "title": (item.get("title") or "").strip(),
        "section_name": section,
        "address": address,
        "road": config.matched_road(section, address),
        "community_name": (item.get("community_name") or "").strip(),
        "community_link": item.get("community_link") or "",
        "is_yuanxiong": is_yuanxiong_item(item),
        "price": price,
        "unitprice": unitprice,
        "area": area,
        "size_bucket": config.size_bucket(area),
        "room": item.get("room") or "",
        "floor": item.get("floor") or "",
        "shape_name": item.get("shape_name") or "",
        "kind_name": item.get("kind_name") or "",
        "houseage": item.get("houseage"),
        "showhouseage": item.get("showhouseage") or "",
        "age_years": age_years,
        "age_bucket": config.age_bucket_from_years(age_years) if age_years is not None else "unknown",
        "has_carport": bool(item.get("has_carport")),
        "is_down_price": bool(item.get("is_down_price")),
        "post_date": post_date,
        "detail_url": config.HOUSE_591_DETAIL_URL_TMPL.format(houseid=item.get("houseid")),
        "last_seen": today_iso,
    }


# ---------------------------------------------------------------------------
# 591 開價扣車位：跟前端 JS 的邏輯是同一套，算在這裡（而不是前端 JS）是因為
# compute_estimate.py 也要用調整後的 adj_unitprice/adj_area，寫進 units.json
# 讓 python 端跟網頁端讀同一份數字，不要兩邊各算一次、容易兜不起來。
# ---------------------------------------------------------------------------
def _size_bucket_from_area(area):
    if area is None:
        return None
    if area < 30:
        return "small"
    if area < 45:
        return "mid"
    return "large"


def load_deals_for_parking_stats():
    if not os.path.exists(config.DEALS_JSON):
        return []
    try:
        with open(config.DEALS_JSON, encoding="utf-8") as f:
            return json.load(f).get("deals", [])
    except (OSError, json.JSONDecodeError):
        return []


def compute_parking_stats(deals):
    """回傳 (by_project, fallback)。by_project: {建案名稱: {"P":..,"A":..}}（車位總價/坪數
    中位數，>=5筆車位樣本才採用）；fallback: 青埔近24個月預售車位中位數。"""
    by_project_raw = defaultdict(lambda: {"car_prices": [], "car_areas": []})
    for d in deals:
        if d.get("deal_kind") != "presale" or not (d.get("car_price_wan") or 0) > 0:
            continue
        key = d.get("project_name")
        if not key:
            continue
        by_project_raw[key]["car_prices"].append(d["car_price_wan"])
        if (d.get("car_area_ping") or 0) > 0:
            by_project_raw[key]["car_areas"].append(d["car_area_ping"])

    by_project = {}
    for key, rec in by_project_raw.items():
        if len(rec["car_prices"]) >= 5:
            by_project[key] = {
                "P": statistics.median(rec["car_prices"]),
                "A": statistics.median(rec["car_areas"]) if rec["car_areas"] else None,
                "n": len(rec["car_prices"]),
            }

    cutoff = (datetime.date.today() - datetime.timedelta(days=730)).isoformat()
    fallback_rows = [
        d for d in deals if d.get("deal_kind") == "presale" and (d.get("car_price_wan") or 0) > 0 and d.get("date", "") >= cutoff
    ]
    fallback = {
        "P": statistics.median([d["car_price_wan"] for d in fallback_rows]) if fallback_rows else None,
        "A": statistics.median([d["car_area_ping"] for d in fallback_rows if (d.get("car_area_ping") or 0) > 0]) or None,
    }
    return by_project, fallback


def adjust_unit_price(rec, by_project, fallback):
    """幫一筆 591 紀錄（去重後的 unit）算 adj_unitprice/adj_area/adj_estimated/
    adj_size_bucket，規則：有車位、且 591 單價跟「總價/坪數」差距 <0.6，代表 591 沒扣車位，
    改用同社區（或青埔近24個月）車位總價/坪數中位數扣一次。
    判斷式一定要用「raw_area」（591 原始坪數，未取到0.5坪）算 naive，不能用去重分組用的
    「area」（取到0.5坪的分組 key）：取整之後的坪數拿去算 price/area，跟 591 原始 unitprice
    的差距會被取整誤差放大，導致本來沒扣車位的物件被誤判成「591 已經扣過」而漏掉調整。"""
    raw_area = rec.get("raw_area") if rec.get("raw_area") is not None else rec.get("area")
    rec["adj_unitprice"] = rec.get("unitprice")
    rec["adj_area"] = raw_area
    rec["adj_estimated"] = False
    price = rec.get("price")
    unitprice = rec.get("unitprice")
    if price is not None and raw_area:
        naive = price / raw_area
        looks_included = rec.get("has_carport") and unitprice is not None and abs(unitprice - naive) < 0.6
        stats = by_project.get(rec.get("community_name")) or fallback
        p, a = stats.get("P"), stats.get("A")
        if looks_included:
            if p is not None and a is not None and raw_area > a:
                adj_area = round(raw_area - a, 2)
                rec["adj_area"] = adj_area
                rec["adj_unitprice"] = round((price - p) / adj_area, 1)
                rec["adj_estimated"] = True
        elif rec.get("has_carport") and a is not None and raw_area > a:
            # 591 坪數含車位；賣家已自行扣車位算單價時，單價照用，坪數仍要扣車位坪數
            rec["adj_area"] = round(raw_area - a, 2)
    rec["adj_size_bucket"] = _size_bucket_from_area(rec["adj_area"])


# ---------------------------------------------------------------------------
# 讀寫 data/listings.json
# ---------------------------------------------------------------------------
def load_listings():
    if not os.path.exists(config.LISTINGS_JSON):
        return {}
    with open(config.LISTINGS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("listings", {})


def save_listings(listings: dict):
    os.makedirs(config.DATA_DIR, exist_ok=True)
    payload = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "count": len(listings),
        "active_count": sum(1 for v in listings.values() if v.get("active")),
        "listings": listings,
    }
    with open(config.LISTINGS_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)


# ---------------------------------------------------------------------------
# 重複刊登去重：同一戶常被好幾個仲介分別刊登，591 筆數會虛報在售量。
# ---------------------------------------------------------------------------
def _cluster_by_price(items, tolerance):
    """items 依 price 由低到高排序，price 在目前這組最低價 tolerance 比例內的併進同一組，
    超過就另開一組（新的一戶）。"""
    items = sorted(items, key=lambda x: x["price"] if x["price"] is not None else float("inf"))
    clusters = []
    for it in items:
        placed = False
        if it["price"] is not None:
            for c in clusters:
                ref = c["ref_price"]
                if ref is not None and ref > 0 and abs(it["price"] - ref) / ref <= tolerance:
                    c["items"].append(it)
                    placed = True
                    break
        if not placed:
            clusters.append({"ref_price": it["price"], "items": [it]})
    return clusters


def build_units(listings: dict):
    """把在售物件依（社區或道路、樓層字串、坪數取到0.5坪）分組，組內價格差在容忍值以內
    的當成同一戶被重複刊登，回傳「戶」為單位的清單（每戶取最低價那筆物件的欄位代表）。
    公開版：不保留單則刊登裡的賣方個資，只留 houseid + 公開刊登連結。"""
    active = [v for v in listings.values() if v.get("active")]
    groups = defaultdict(list)
    for l in active:
        key_name = l.get("community_name") or l.get("road") or ""
        floor = l.get("floor") or ""
        area = l.get("area")
        area_key = round(area * 2) / 2 if area is not None else None
        groups[(key_name, floor, area_key)].append(l)

    units = []
    for (key_name, floor, area_key), items in groups.items():
        for cluster in _cluster_by_price(items, config.UNIT_DEDUPE_PRICE_TOLERANCE):
            members = cluster["items"]
            prices = sorted(x["price"] for x in members if x["price"] is not None)
            rep = min(members, key=lambda x: (x["price"] if x["price"] is not None else float("inf")))
            unit_id = hashlib.sha1(f"{key_name}|{floor}|{area_key}|{cluster['ref_price']}".encode("utf-8")).hexdigest()[:12]
            first_seens = [x.get("first_seen") for x in members if x.get("first_seen")]
            post_dates = [x.get("post_date") for x in members if x.get("post_date")]
            units.append({
                "unit_id": unit_id,
                "community_name": rep.get("community_name"),
                "road": rep.get("road"),
                "section_name": rep.get("section_name"),
                "is_yuanxiong": rep.get("is_yuanxiong"),
                "floor": floor,
                "area": area_key,
                "raw_area": rep.get("area"),  # 591 原始坪數（未取到0.5坪），扣車位判斷要用這個，不要用分組用的 area_key
                "n_postings": len(members),
                "min_price": prices[0] if prices else None,
                "median_price": statistics.median(prices) if prices else None,
                "houseids": [x.get("houseid") for x in members],
                "links": [x.get("detail_url") for x in members],
                "first_seen": min(first_seens) if first_seens else None,
                "post_date": min(post_dates) if post_dates else None,
                # 用最低價那筆代表這戶的其他欄位（591 原始 unitprice/has_carport/房型...）
                "price": rep.get("price"),
                "unitprice": rep.get("unitprice"),
                "has_carport": rep.get("has_carport"),
                "room": rep.get("room"),
                "showhouseage": rep.get("showhouseage"),
                "houseage": rep.get("houseage"),
                "age_years": rep.get("age_years"),
                "age_bucket": rep.get("age_bucket"),
                "kind_name": rep.get("kind_name"),
                "shape_name": rep.get("shape_name"),
            })
    return units


def save_units(units: list):
    os.makedirs(config.DATA_DIR, exist_ok=True)
    payload = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "count": len(units),
        "units": units,
    }
    with open(config.UNITS_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)


def update_meta(section: dict):
    meta = {}
    if os.path.exists(config.META_JSON):
        try:
            with open(config.META_JSON, encoding="utf-8") as f:
                meta = json.load(f)
        except (json.JSONDecodeError, OSError):
            meta = {}
    meta["house591"] = section
    os.makedirs(config.DATA_DIR, exist_ok=True)
    with open(config.META_JSON, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)


def merge_into(listings: dict, fresh_items: dict, today_iso: str):
    """fresh_items: {houseid_str: normalized_item}"""
    new_n, updated_n, price_change_n = 0, 0, 0
    for hid, item in fresh_items.items():
        existing = listings.get(hid)
        if existing is None:
            item["first_seen"] = today_iso
            item["active"] = True
            item["removed_at"] = None
            item["miss_streak"] = 0
            item["prices"] = [[today_iso, item["price"]]]
            listings[hid] = item
            new_n += 1
            continue

        prices = existing.get("prices") or []
        last_price = prices[-1][1] if prices else None
        if item["price"] is not None and item["price"] != last_price:
            prices.append([today_iso, item["price"]])
            price_change_n += 1
        item["prices"] = prices
        item["first_seen"] = existing.get("first_seen", today_iso)
        item["active"] = True
        item["removed_at"] = None
        item["miss_streak"] = 0
        listings[hid] = item
        updated_n += 1
    return new_n, updated_n, price_change_n


def mark_missing_inactive(listings: dict, seen_ids: set, today_iso: str):
    """只有在這一輪把所有關鍵字都完整抓完（all_keywords_ok）才會呼叫這個函式——
    partial crawl（有關鍵字沒抓完）完全不判斷下架，這個保護不因排程頻率改變而拿掉。
    HOUSE_591_MISS_THRESHOLD 目前是 1（配合排程改成每月一次，見 config.py 註解），
    只要這一輪完整、且這次沒看到，直接判定下架，不用等第二輪確認。"""
    removed_n = 0
    for hid, item in listings.items():
        if hid in seen_ids:
            continue
        item["miss_streak"] = item.get("miss_streak", 0) + 1
        if item.get("active", True) and item["miss_streak"] >= config.HOUSE_591_MISS_THRESHOLD:
            item["active"] = False
            item["removed_at"] = today_iso
            removed_n += 1
    return removed_n


def main():
    today_iso = datetime.date.today().isoformat()
    listings = load_listings()
    before = len(listings)

    raw_by_id = {}
    all_keywords_ok = True
    errors = []
    totals = {}
    for kw in config.HOUSE_591_KEYWORDS:
        try:
            items, total = fetch_all_for_keyword(kw)
            totals[kw] = total
            kept = 0
            for it in items:
                if not keep_item(it):
                    continue
                hid = str(it.get("houseid"))
                if not hid or hid == "None":
                    continue
                raw_by_id[hid] = normalize_item(it, today_iso)
                kept += 1
            log(f"keyword={kw!r} total={total} fetched={len(items)} kept={kept}")
        except Exception as e:  # noqa: BLE001
            all_keywords_ok = False
            errors.append(f"{kw}: {e}")
            log(f"keyword={kw!r} FAILED: {e}")

    new_n, updated_n, price_change_n = merge_into(listings, raw_by_id, today_iso)

    removed_n = 0
    if all_keywords_ok:
        removed_n = mark_missing_inactive(listings, set(raw_by_id.keys()), today_iso)
    else:
        log("有關鍵字沒抓完整，這次不判斷下架，只合併有抓到的資料")

    save_listings(listings)

    active = [v for v in listings.values() if v.get("active")]
    active_yx = [v for v in active if v.get("is_yuanxiong")]
    active_qingpu = active  # 已經在 keep_item 篩過，全部都算青埔（含仰森）

    units = build_units(listings)
    parking_by_project, parking_fallback = compute_parking_stats(load_deals_for_parking_stats())
    for u in units:
        adjust_unit_price(u, parking_by_project, parking_fallback)
    save_units(units)
    units_yx = [u for u in units if u.get("is_yuanxiong")]
    yx_parking = parking_by_project.get(config.YUANXIONG_PROJECT_NAME, parking_fallback)

    status = "ok" if all_keywords_ok else ("partial" if raw_by_id else "fail")
    update_meta({
        "last_run": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "status": status,
        "message": "; ".join(errors),
        "keyword_totals": totals,
        "total_listings_tracked": len(listings),
        "active_listings": len(active),
        "active_qingpu": len(active_qingpu),
        "active_yuanxiong": len(active_yx),
        "units_total": len(units),
        "units_yuanxiong": len(units_yx),
        "yuanxiong_parking_stats": yx_parking,
        "miss_threshold_used": config.HOUSE_591_MISS_THRESHOLD,
        "new_this_run": new_n,
        "updated_this_run": updated_n,
        "price_changes_this_run": price_change_n,
        "removed_this_run": removed_n,
        "net_change": len(listings) - before,
    })

    log(
        f"done. tracked={len(listings)} active={len(active)} yuanxiong_active={len(active_yx)} "
        f"units={len(units)} units_yuanxiong={len(units_yx)} "
        f"new={new_n} price_changes={price_change_n} removed={removed_n} status={status}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
