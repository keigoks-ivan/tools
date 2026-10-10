#!/usr/bin/env python3
"""Merge camps/research/<batch>.json into camps/data/*.json.

Research batches are written by agents; this script is the only place that
reconciles them. Every manual decision lives in ALIASES / DROPS / PATCHES
below with its reason, so a re-run reproduces the same dataset.
"""
import json
from urllib.parse import urlparse
import glob
import os
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESEARCH = os.path.join(ROOT, "research")
OUT = os.path.join(ROOT, "data")
TODAY = "2026-10-10"

SKIP_FILES = {"holidays.json", "chrome-verify.json"}
# reviews-locations carries the most complete location records
LOCATION_PRIORITY = ["reviews-locations"]

ALIASES = {
    # same campus, two ids (intl-kl vs specialty)
    "loc-epsom-college-enstek": "loc-epsom",
}

# conflicts filed against ids that never became entities
CONFLICT_ENTITY = {
    "loc-epsom／loc-epsom-college-enstek": "loc-epsom",
    "loc-direct-english-kl": "loc-directenglish-kl",
    "alice-smith-camp-beaumont": "camp-beaumont-active",
    "camp-beaumont-active-iskl": "camp-beaumont-active",
}
# conflicts about leads that are not in the dataset (Little Steps article, Red Rescue)
CONFLICT_DROP = {"little-steps-year-end", "red-rescue-lifesaving-camp"}

DROPS = {
    "kensington-camps-holiday-tbd-2027s":
        "summer-existing 依官網 kensington-cc.com 建了 kensington-camps-sports-activities 的 2026 實際梯次與 2027 推估，取代 brands-1 這筆 unknown",
}

# Seed facts the agents did not carry over (KLIK). The user supplied them
# without a URL, so the source is marked as the seed itself.
SEED_SOURCE = "seed://user-2026-10-10"
SEED_ADDITIONS = {
    "providers": [{
        "id": "klik", "name_en": "KLIK (KL International Kids Club)", "name_zh": None,
        "type": "other", "country": "MY", "website": None,
        "contact": {"email": None, "phone": None, "whatsapp": None},
        "accreditation": [], "founded_year": None,
        "notes": "種子資料；brands-2 查不到官網或第二來源。",
        "sources": [{"url": SEED_SOURCE, "tier": 4, "accessed": TODAY, "fields": ["age_min", "age_max", "dates"],
                     "quote": "KLIK（KL International Kids Club）：3–7 歲，2026-01-05~30；2027 未知"}],
    }],
    "programs": [{
        "id": "klik-holiday", "provider_id": "klik", "name": "KLIK Holiday Programme",
        "category": ["multi_activity"], "language_of_instruction": [],
        "age_min": 3, "age_max": 7, "age_rule": None, "format": "day",
        "hours": {"start": None, "end": None, "days": None},
        "class_size_max": None, "class_size_avg": None, "staff_ratio": None,
        "includes": {k: None for k in ("lunch", "snacks", "materials", "accommodation", "airport_transfer", "insurance", "tshirt")},
        "excludes": [], "requirements": [],
        "booking": {k: None for k in ("url", "deadline", "payment_terms", "refund_policy", "flex_ticket", "sibling_discount")},
        "location_ids": [], "safety": {"first_aid": None, "cctv": None, "insurance": None, "notes": None},
        "notes": "地點未知。", "sources": [{"url": SEED_SOURCE, "tier": 4, "accessed": TODAY, "fields": ["age_min", "age_max"], "quote": "3–7 歲"}],
    }],
    "sessions": [
        {"id": "klik-holiday-unknown-20260105", "program_id": "klik-holiday", "location_id": None,
         "start_date": "2026-01-05", "end_date": "2026-01-30", "weekday_pattern": "Mon-Fri",
         "date_status": "confirmed_other_year", "year": 2026, "season": "other",
         "price": {"amount": None, "currency": "MYR", "basis": None, "tax_included": None, "tax_note": None, "source_url": None,
                   "early_bird": {"amount": None, "deadline": None, "condition": None}},
         "min_duration_weeks": None, "flexible_start": None, "spots_status": None,
         "source_url": SEED_SOURCE, "verified_at": TODAY, "evidence_quote": "2026-01-05~30",
         "confidence": "low", "estimate_basis": None, "notes": "種子資料，未附網址；無第二來源。"},
        {"id": "klik-holiday-unknown-tbd-2027w", "program_id": "klik-holiday", "location_id": None,
         "start_date": None, "end_date": None, "weekday_pattern": None,
         "date_status": "pattern_estimated", "year": 2027, "season": "winter_2026_27",
         "price": {"amount": None, "currency": "MYR", "basis": None, "tax_included": None, "tax_note": None, "source_url": None,
                   "early_bird": {"amount": None, "deadline": None, "condition": None}},
         "min_duration_weeks": None, "flexible_start": None, "spots_status": None,
         "source_url": SEED_SOURCE, "verified_at": TODAY, "evidence_quote": "",
         "confidence": "low", "estimate_basis": "2026-01-05~30 曾開（種子）", "notes": "僅一年歷史。"},
    ],
}


def patch_erican(db):
    """Chrome 2026-10-10：languagecourse.net 計價器彈出最少 2 週。"""
    url = "https://www.languagecourse.net/school-erican-language-centre-kuala-lumpur.php3"
    quote = "The school requires a minimum duration of 2 weeks for this course."
    # chrome-verify-2 records the conflict at program level; just apply the value
    for s in db["sessions"].values():
        if s["program_id"] == "erican-yl-general":
            s["min_duration_weeks"] = 2
    p = db["programs"].get("erican-yl-general")
    if p and "最少報 2 週" not in p["requirements"]:
        p["requirements"].append("最少報 2 週")
        p["sources"].append({"url": url, "tier": 4, "accessed": TODAY, "fields": ["min_duration_weeks"], "quote": quote})
    db["reviews"].append({"id": "rev-erican-languagecourse_net", "entity_type": "provider", "entity_id": "erican",
                          "platform": "languagecourse_net", "rating": 5.0, "scale": 5, "count": 1, "about_kids_program": None,
                          "url": url, "accessed": TODAY, "evidence_quote": "1 authentic rating from a student who booked with us",
                          "highlights_pos": [], "highlights_neg": [], "confidence": "low", "notes": "僅 1 則，樣本小。", "_batch": "chrome-verify"})


def patch_embassy(db):
    """Chrome 2026-10-10：冬季營細節頁。"""
    url = "https://embassy.camp/travel-and-english-holiday-camp-in-malaysia-winter/"
    p = db["programs"].get("embassy-camps-malaysia-langkawi-winter")
    if not p:
        return
    inc = p["includes"]
    for k in ("accommodation", "lunch", "airport_transfer", "tshirt"):
        if inc.get(k) is None:
            inc[k] = True
    if not p["excludes"]:
        p["excludes"].append("吉隆坡—浮羅交怡來回機票（$150 起）")
    if not p["staff_ratio"]:
        p["staff_ratio"] = "每 16 名學員 1 位領隊＋1 位助理"
    p["sources"].append({"url": url, "tier": 1, "accessed": TODAY, "fields": ["includes", "excludes", "price"],
                         "quote": "Accommodation in 4* hotel / Meals (three times a day) / Transfers: Airport – Hotel – Airport"})


def patch_raffles_2027(db):
    """2026-10-10 讀 COEI 宣傳冊原檔（韓文）：2027 冬季四梯價格。只有代理商來源，維持 low。"""
    url = "https://www.coei.com/include/program/camp/brochure/49_my_jhr_raffles.pdf"
    deadlines = {"2027-01-11": "2026-12-11", "2027-01-25": "2026-12-28", "2027-02-01": "2027-01-01", "2027-02-08": "2027-01-08"}
    for s in db["sessions"].values():
        if s["program_id"] != "raffles-winter-camp" or s["start_date"] not in deadlines or s["price"]["amount"] is not None:
            continue
        s["price"].update({"amount": 8400, "currency": "MYR", "basis": "per_2weeks", "source_url": url,
                           "early_bird": {"amount": 7400, "deadline": deadlines[s["start_date"]],
                                          "condition": "開營前至少 1 個月全額付清，減 MYR 1,000"}})
        s["notes"] = (s["notes"].replace("價格未公布。", "")
                      .replace("只有代理商 raffles-iao.com（tier 5）寫日期", "日期只見於代理商 raffles-iao.com 和 COEI（都是 tier 5）")
                      + " 價格只見於韓國代理商 COEI 的 2027 宣傳冊："
                      "走讀 MYR 8,400／兩週，含午餐和 T 恤，週末活動不含；住宿 MYR 10,000／兩週，限 8 歲以上。"
                      "宣傳冊同樣列出四梯，第 2、3 梯課程主題不同，重疊一週應是刻意安排。").strip()
    p = db["programs"].get("raffles-winter-camp")
    if p:
        p["sources"].append({"url": url, "tier": 5, "accessed": TODAY, "fields": ["price", "dates", "age_min", "age_max"],
                             "quote": "NON-BOARDING 8,400 MYR / 2주 세션 기준"})
    for c in db["conflicts"]:
        if c["entity_id"] == "raffles-winter-camp-ras-20270125" and c["field"] == "dates":
            c["values"].append({"value": "同樣是 Camp 2 1/25～2/5、Camp 3 2/1～2/12，兩梯課程主題不同", "source_url": url, "tier": 5})
            c["note"] = "兩個代理商來源日期一致，重疊應是刻意安排；學校官網仍未公布，需向學校確認。"


def patch_official_pages(db):
    """Chrome 2026-10-10：Erican 官網冬令營頁、EMS 官網。"""
    p = db["programs"].get("erican-yl-general")
    if p:
        p["sources"].append({"url": "https://www.erican.edu.my/winter-camp/", "tier": 1, "accessed": TODAY, "fields": [],
                             "quote": "WINTER CAMP - 2027"})
        p["notes"] = (p["notes"] + " 官網有「Winter Camp – 2027」頁，但只有標題和付款說明，沒寫日期、年齡、價格（2026-10-10 讀）。").strip()
    e = db["providers"].get("ems")
    if e:
        e["notes"] = (e["notes"] + " 2026-10-10 官網只顯示 WordPress 錯誤頁，讀不到內容。").strip()


def patch_stem_academy(db):
    """Chrome 2026-10-10：Bookwhen 活動頁（PJ 校區）的時間、價格、含午餐；海報讀圖。"""
    url = "https://bookwhen.com/stemacademymy"
    camps = {
        "stem-academy-winter-science-engineering": ("2026-12-18", 880, 580, None,
            "Bookwhen 票種標 Early Bird RM580，截止日沒寫；海報只寫 RM880",
            "Winter Science & Engineering December STEM Camp 2026 (Early Bird) RM580.00"),
        "stem-academy-christmas-slime": ("2026-12-23", 600, 580, "2026-11-15",
            "海報寫 11 月 15 日前報名", "Register by 15th November to get early bird price"),
    }
    for pid, (end, amt, eb, eb_dl, eb_cond, quote) in camps.items():
        p = db["programs"].get(pid)
        if not p:
            continue
        p["hours"].update({"start": "10:00", "end": "16:00"})
        p["includes"].update({"lunch": True, "materials": True, "snacks": False})
        p["booking"]["sibling_discount"] = "手足價 RM560／人"
        p["sources"].append({"url": url, "tier": 1, "accessed": TODAY, "fields": ["price", "hours", "includes"], "quote": quote})
        for s in db["sessions"].values():
            if s["program_id"] == pid and s["location_id"] == "loc-stem-academy-pj" and s["price"]["amount"] is None:
                s["end_date"] = end
                s["price"].update({"amount": amt, "currency": "MYR", "basis": "per_camp", "source_url": url,
                                   "early_bird": {"amount": eb, "deadline": eb_dl, "condition": eb_cond}})
                s["notes"] = ("10:00～16:00，含午餐和教材，點心自備。年齡沒寫；同機構 10 月萬聖節營海報寫 6～12 歲。"
                              "新山 Sunway Iskandar 校區同日也開。")
    s = db["sessions"].get("stem-academy-winter-science-engineering-stem-academy-pj-20261214")
    if s:
        s["confidence"] = "low"
        s["notes"] += " 價格有矛盾：海報 RM880，Bookwhen 早鳥票 RM580，報名前要問清楚。"
        db["conflicts"].append({"entity_id": s["id"], "field": "price",
                                "values": [{"value": "RM880／人（活動頁海報）", "source_url": url, "tier": 1},
                                           {"value": "Early Bird RM580／人（Bookwhen 票種）", "source_url": url, "tier": 1}],
                                "note": "5 天營的早鳥票跟 3 天營同價，可能是票種沿用；需向機構確認。", "_batch": "chrome-verify-3"})


def patch_klik(db):
    """Chrome 2026-10-10：KLIK 官網 Winter Schooling 頁與聯絡頁。"""
    url = "https://www.klkidsclub.com.my/winter-schooling/"
    contact = "https://www.klkidsclub.com.my/contact/"
    pv, p = db["providers"].get("klik"), db["programs"].get("klik-holiday")
    if not (pv and p):
        return
    pv["website"] = "https://www.klkidsclub.com.my"
    pv["contact"].update({"email": "info.klkidsclub@gmail.com", "phone": "+603-2141 2153"})
    pv["notes"] = "幼兒園，在大使館區 Jalan U Thant。官網 2026-10-10 用 Chrome 讀到。"
    pv["sources"].append({"url": contact, "tier": 1, "accessed": TODAY, "fields": ["address", "phone"],
                          "quote": "Address: 16A, Jalan U thant, 55000, Kuala Lumpur"})
    db["locations"]["loc-klik-u-thant"] = {
        "id": "loc-klik-u-thant", "name": "KL International Kidsclub", "address": "16A, Jalan U Thant, 55000 Kuala Lumpur",
        "city": "Kuala Lumpur", "state": "Kuala Lumpur", "country": "MY", "lat": None, "lng": None, "venue_type": "school",
        "transport_notes": None, "notes": "", "verified_at": TODAY,
        "sources": [{"url": contact, "tier": 1, "accessed": TODAY, "fields": ["address"], "quote": "16A, Jalan U thant, 55000"}]}
    p["name"] = "KLIK Winter Schooling Program"
    p["category"] = ["short_term_enrolment"]
    p["language_of_instruction"] = ["English"]
    p["hours"].update({"start": "08:45", "end": "15:00"})
    p["location_ids"] = ["loc-klik-u-thant"]
    p["booking"]["url"] = url
    p["notes"] = ("這是到學校跟班上課，不是假期營。官網寫 1～2 月開放，可報 1～4 週，全天跟著幼兒園課表上課，"
                  "英語輔導課可選。官網列的最近一期是 2025-01-02～01-24；2027 年日期和學費沒寫。")
    p["sources"].append({"url": url, "tier": 1, "accessed": TODAY, "fields": ["age_min", "age_max", "hours", "dates"],
                         "quote": "1 ~ 4 weeks Program for children / Age: 3~7 years / Available during Jan/Feb"})
    for s in db["sessions"].values():
        if s["program_id"] == "klik-holiday":
            s["location_id"] = "loc-klik-u-thant"
            s["min_duration_weeks"] = 1
    w = db["sessions"].get("klik-holiday-unknown-tbd-2027w")
    if w:
        w["notes"] = "官網寫每年 1～2 月開放、可報 1～4 週；2027 年日期沒公布。"
    db["sessions"]["klik-holiday-klik-u-thant-20250102"] = {
        "id": "klik-holiday-klik-u-thant-20250102", "program_id": "klik-holiday", "location_id": "loc-klik-u-thant",
        "start_date": "2025-01-02", "end_date": "2025-01-24", "weekday_pattern": "Mon-Fri",
        "date_status": "confirmed_other_year", "year": 2025, "season": "other",
        "price": {"amount": None, "currency": "MYR", "basis": None, "tax_included": None, "tax_note": None, "source_url": None,
                  "early_bird": {"amount": None, "deadline": None, "condition": None}},
        "min_duration_weeks": 1, "flexible_start": None, "spots_status": None,
        "source_url": url, "verified_at": TODAY, "evidence_quote": "Jan 2 , 2025 – Jan 24, 2025 , 8.45 am ~ 3.00 pm",
        "confidence": "medium", "estimate_basis": None, "notes": "官網列的最近一期，學費沒寫。", "_batches": ["chrome-verify-3"]}


FROM_PRICES = [  # source says "from" / "starting from": the amount is the lowest option, not the usual price
    "aquabubs-holiday-swim-camp-united-point-tbd-2027w",
    "camp-beaumont-active-alice-smith-primary-20260324",
    "camp-beaumont-english-in-action-day-bskl-20260720", "camp-beaumont-english-in-action-day-mcm-20260727",
    "camp-beaumont-parkour-alice-smith-primary-20261214", "camp-beaumont-parkour-alice-smith-primary-20261221",
    "camp-beaumont-parkour-alice-smith-primary-20261228",
    "camp-beaumont-steam-alice-smith-primary-20260706-magic", "camp-beaumont-steam-alice-smith-primary-20260720-active",
    "camp-beaumont-steam-alice-smith-primary-20260803-magic",
    "laliga-professional-camp-enstek-20260628", "laliga-professional-camp-enstek-20261019",
    "laliga-professional-camp-enstek-20261213", "laliga-showcase-camp-enstek-20260706",
    "laliga-taster-camp-enstek-20260505", "laliga-taster-camp-enstek-20260609",
    "mouratoglou-junior-tennis-camps-enstek-tbd-2027w",
    "newtonshow-winter-bangsar-20261123", "newtonshow-winter-bukit-bintang-20261123",
    "newtonshow-winter-jb-20261123", "newtonshow-winter-penang-20261123",
]


def patch_from_prices(db):
    """起價標記；Newtonshow 冬季營附往年分區價（Chrome 2026-10-10 讀官網 2026 農曆年營存檔）。"""
    for s in db["sessions"].values():
        if s["id"] in FROM_PRICES and s["price"]["amount"] is not None:
            s["price"]["from"] = True
    url = "https://web.archive.org/web/20260411104300/https://www.newtonshow.my/cny-holiday-camp/"
    p = db["programs"].get("newtonshow-winter")
    if p:
        p["sources"].append({"url": url, "tier": 1, "accessed": TODAY, "fields": [],
                             "quote": "5 days Mon-Fri 9am – 4pm MYR 1199 (Kuala Lumpur)* 750 (Penang, Johor)*"})
    past = {"bangsar": "吉隆坡 RM1,199", "bukit-bintang": "吉隆坡 RM1,199", "jb": "新山 RM750", "penang": "檳城 RM750"}
    for loc, txt in past.items():
        s = db["sessions"].get(f"newtonshow-winter-{loc}-20261123")
        if s:
            s["price"]["tax_note"] = (f"官網只寫起價，沒說 600 是哪個地點、全日或半日，也沒說含稅與否。"
                                      f"2026 農曆年營（同為 9:00～16:00）{txt}／週，只供參考，沒拿來算。")


PATCHES = [patch_erican, patch_embassy, patch_raffles_2027, patch_official_pages, patch_stem_academy, patch_klik,
           patch_from_prices]

# Brief rule: tier 4-5 only -> confidence low. These domains are aggregators.
PLATFORM_HOSTS = {
    "trustpilot.com": "trustpilot", "edarabia.com": "edarabia", "languagecourse.net": "languagecourse_net",
    "facebook.com": "facebook", "tripadvisor.com": "tripadvisor", "tripadvisor.com.my": "tripadvisor",
    "reddit.com": "reddit", "lowyat.net": "lowyat", "littlestepsasia.com": "little_steps",
    "pixnet.net": "pixnet", "mobile01.com": "mobile01", "dcard.tw": "dcard", "backpackers.com.tw": "backpackers",
}

# reviews that are about the brand elsewhere, not the Malaysian camp (per batch notes)
REVIEW_SCOPE = {
    "rev-camp-beaumont-trustpilot": "英國營的評價，不是馬來西亞營",
    "rev-embassy-camps-trustpilot": "全球品牌頁，評論沒提到馬來西亞",
}

AGGREGATOR_DOMAINS = ("languagecourse.net", "littlestepsasia.com")


# Agents used free-form category / language tags; the site filters on these sets.
CATEGORY_MAP = {
    "english": "english", "english_language": "english", "language": "english",
    "sport": "sport", "sports": "sport", "football": "sport", "tennis": "sport",
    "stem": "stem", "science": "stem", "coding": "stem", "lego": "stem",
    "arts": "arts", "art": "arts", "craft": "arts", "drama": "arts",
    "multi_activity": "multi_activity", "multi-activity": "multi_activity", "general": "multi_activity",
    "enrichment": "multi_activity", "themed": "multi_activity",
    "outdoor": "outdoor", "adventure": "outdoor", "river": "outdoor",
    "residential": "residential", "overnight": "residential", "residential_option": "residential",
    "leadership": "leadership", "public_speaking": "leadership",
    "family": "family", "travel": "travel", "agent_package": "travel",
    "short_term_enrolment": "short_term_enrolment", "short_term_enrollment": "short_term_enrolment",
    "schooling": "short_term_enrolment",
    "swimming": "sport", "safety": "sport", "sailing": "sport", "outdoor_adventure": "outdoor",
    "engineering": "stem", "cultural": "travel",
    "french": "other_language", "other_language": "other_language",
}
LANGUAGE_MAP = {"en": "English", "English": "English", "Mandarin": "Mandarin", "zh": "Mandarin"}


def normalize_program(p, log):
    cats = []
    for c in p.get("category") or []:
        n = CATEGORY_MAP.get(c)
        if n is None:
            log["unmapped_category:" + c] += 1
            n = c
        if n not in cats:
            cats.append(n)
    p["category"] = cats
    p["language_of_instruction"] = sorted({LANGUAGE_MAP.get(l, l) for l in p.get("language_of_instruction") or []})


def canonical_session_id(x):
    """Brief rule is <program>-<location short>-<date>; some batches kept the loc- prefix."""
    head = x["program_id"] + "-loc-"
    return x["program_id"] + "-" + x["id"][len(head):] if x["id"].startswith(head) else x["id"]


def fill(base, other):
    """Fill null fields of base from other (shallow + one nested level)."""
    for k, v in other.items():
        if k.startswith("_"):
            continue
        if base.get(k) is None or base.get(k) == "" or base.get(k) == []:
            base[k] = v
        elif isinstance(base.get(k), dict) and isinstance(v, dict):
            for kk, vv in v.items():
                if base[k].get(kk) is None:
                    base[k][kk] = vv


def merge_sources(a, b):
    seen = {(s.get("url"), tuple(s.get("fields") or [])) for s in a}
    for s in b:
        key = (s.get("url"), tuple(s.get("fields") or []))
        if key not in seen:
            a.append(s)
            seen.add(key)


def main():
    batches = {}
    for f in sorted(glob.glob(os.path.join(RESEARCH, "*.json"))):
        name = os.path.basename(f)
        if name in SKIP_FILES:
            continue
        batches[name[:-5]] = json.load(open(f))
    order = sorted(batches, key=lambda b: (b not in LOCATION_PRIORITY, b))

    db = {"providers": {}, "programs": {}, "locations": {}, "sessions": {},
          "reviews": [], "conflicts": [], "gaps": [], "links": []}
    log = Counter()

    def alias(loc_id):
        return ALIASES.get(loc_id, loc_id)

    for b in order:
        d = batches[b]
        for kind in ("providers", "programs", "locations", "sessions"):
            for x in d.get(kind, []):
                x = json.loads(json.dumps(x))
                if kind == "locations":
                    x["id"] = alias(x["id"])
                if kind == "sessions":
                    if x["id"] in DROPS:
                        log["dropped"] += 1
                        continue
                    x["location_id"] = alias(x.get("location_id"))
                    cid = canonical_session_id(x)
                    if cid != x["id"]:
                        x["id"] = cid
                        log["session_id_canonicalized"] += 1
                if kind == "programs":
                    x["location_ids"] = sorted({alias(i) for i in x.get("location_ids") or []})
                cur = db[kind].get(x["id"])
                if cur is None:
                    x["_batches"] = [b]
                    db[kind][x["id"]] = x
                else:
                    # a later batch with a stronger source (e.g. the official brochure) takes over the evidence
                    rank = {"low": 0, "medium": 1, "high": 2}
                    if kind == "sessions" and rank.get(x.get("confidence"), 0) > rank.get(cur.get("confidence"), 0):
                        if (cur.get("price") or {}).get("amount") is not None and not cur["price"].get("source_url"):
                            cur["price"]["source_url"] = cur["source_url"]  # the price still comes from the old source
                        for k in ("source_url", "evidence_quote", "confidence", "verified_at"):
                            cur[k] = x[k]
                        log["session_upgraded"] += 1
                    fill(cur, x)
                    merge_sources(cur.setdefault("sources", []), x.get("sources") or [])
                    cur["_batches"].append(b)
                    log[f"merged_{kind}"] += 1
        for r in d.get("reviews", []):
            db["reviews"].append({**r, "_batch": b})
        for c in d.get("conflicts", []):
            db["conflicts"].append({**c, "_batch": b})
        for g in d.get("not_found", []):
            db["gaps"].append({**g, "kind": "not_found", "_batch": b})
        for g in d.get("leads", []):
            db["gaps"].append({**g, "kind_lead": g.get("kind"), "kind": "lead", "_batch": b})
        for l in d.get("program_location_links", []):
            db["links"].append({**l, "location_id": alias(l["location_id"]), "_batch": b})

    for kind, items in SEED_ADDITIONS.items():
        for x in items:
            if x["id"] not in db[kind]:
                db[kind][x["id"]] = {**x, "_batches": ["seed"]}
                log[f"seed_{kind}"] += 1

    for l in db["links"]:
        p = db["programs"].get(l["program_id"])
        if p and l["location_id"] not in p["location_ids"]:
            p["location_ids"].append(l["location_id"])
            log["links_applied"] += 1

    for fn in PATCHES:
        fn(db)
        log[f"patch_{fn.__name__}"] += 1

    # one review per entity + platform (reviews are never averaged across platforms):
    # keep the one with a rating / higher confidence, fold the others' highlights in
    conf_rank = {"high": 3, "medium": 2, "low": 1}
    def review_weight(r):
        return (r.get("rating") is not None, conf_rank.get(r.get("confidence"), 0),
                len(r.get("highlights_pos") or []) + len(r.get("highlights_neg") or []))
    # platform from the url when the batch said "other"; operator-hosted ratings are self-published
    def host(u):
        return urlparse(u or "").netloc.lower().removeprefix("www.")
    prov_of = {pid: pid for pid in db["providers"]}
    for g in db["programs"].values():
        prov_of[g["id"]] = g["provider_id"]
        for lid in g.get("location_ids") or []:
            prov_of.setdefault(lid, g["provider_id"])
    for r in db["reviews"]:
        h = host(r.get("url"))
        if r["platform"].startswith("blog_"):  # e.g. blog_kl_with_kids: one platform, the page shows the host
            r["platform"] = "blog"
        if r["platform"] == "other":
            for dom, plat in PLATFORM_HOSTS.items():
                if h == dom or h.endswith("." + dom):
                    r["platform"] = plat
                    log["review_platform_from_url"] += 1
        site = host((db["providers"].get(prov_of.get(r["entity_id"])) or {}).get("website"))
        if site and h and (h == site or h.endswith("." + site)):
            r["scope_note"] = "業者官網自己刊登的評價"
            r["confidence"] = "low"
            for hl in (r.get("highlights_pos") or []) + (r.get("highlights_neg") or []):
                hl["author_type"] = "staff"
            log["review_operator_hosted"] += 1

    # reviews of places that are only leads (not in the dataset) stay in the research file
    known = set(db["providers"]) | set(db["programs"]) | set(db["locations"]) | set(db["sessions"])
    for r in [r for r in db["reviews"] if r["entity_id"] not in known]:
        log["reviews_for_leads_skipped"] += 1
        print("  review skipped (entity is a lead):", r["id"])
    db["reviews"] = [r for r in db["reviews"] if r["entity_id"] in known]

    groups = {}
    for r in db["reviews"]:
        groups.setdefault((r["entity_id"], r["platform"], r["url"] if r["platform"] in ("other", "blog") else ""), []).append(r)
    merged = []
    for rs in groups.values():
        rs.sort(key=review_weight, reverse=True)
        top = dict(rs[0])
        for other in rs[1:]:
            for k in ("highlights_pos", "highlights_neg"):
                have = {h.get("text") for h in top.get(k) or []}
                extra = [h for h in other.get(k) or [] if h.get("text") not in have]
                if extra:
                    top[k] = (top.get(k) or []) + extra
            log["reviews_deduped"] += 1
        merged.append(top)
    db["reviews"] = merged
    for r in db["reviews"]:
        if r["id"] in REVIEW_SCOPE:
            r["scope_note"] = REVIEW_SCOPE[r["id"]]

    kept = []
    for c in db["conflicts"]:
        c["entity_id"] = CONFLICT_ENTITY.get(c["entity_id"], c["entity_id"])
        if c["entity_id"] in CONFLICT_DROP:
            log["conflicts_dropped_lead"] += 1
            continue
        kept.append(c)
    db["conflicts"] = kept

    # a past year known only by month ("July 2026, weekly intakes") is not a dated session
    for x in db["sessions"].values():
        if x["date_status"].startswith("confirmed") and not x.get("start_date"):
            x["date_status"] = "unknown"
            x["notes"] = ((x.get("notes") or "") + " 往年只知月份，沒有具體日期，列為查不到日期。").strip()
            log["confirmed_without_date_to_unknown"] += 1

    for p in db["programs"].values():
        normalize_program(p, log)

    # a dated target-year session supersedes the tbd placeholder for the same program/location/season
    dated = {(s["program_id"], s.get("location_id"), s["season"]) for s in db["sessions"].values()
             if s["date_status"] == "confirmed_target_year"}
    for sid in [k for k, s in db["sessions"].items()
                if "-tbd-" in k and s["date_status"] in ("pattern_estimated", "unknown")
                and (s["program_id"], s.get("location_id"), s["season"]) in dated]:
        del db["sessions"][sid]
        log["tbd_superseded"] += 1

    for s in db["sessions"].values():
        if s["confidence"] != "low" and any(dm in s["source_url"] for dm in AGGREGATOR_DOMAINS):
            s["confidence"] = "low"
            log["aggregator_capped_low"] += 1

    # referential checks (report only; validation script enforces)
    for s in db["sessions"].values():
        if s["program_id"] not in db["programs"]:
            log["orphan_session_program"] += 1
        if s.get("location_id") and s["location_id"] not in db["locations"]:
            log["orphan_session_location"] += 1
    for p in db["programs"].values():
        if p["provider_id"] not in db["providers"]:
            log["orphan_program_provider"] += 1

    os.makedirs(OUT, exist_ok=True)
    for kind in ("providers", "programs", "locations", "sessions"):
        rows = sorted(db[kind].values(), key=lambda x: x["id"])
        json.dump(rows, open(os.path.join(OUT, f"{kind}.json"), "w"), ensure_ascii=False, indent=1)
    for kind in ("reviews", "conflicts", "gaps"):
        json.dump(db[kind], open(os.path.join(OUT, f"{kind}.json"), "w"), ensure_ascii=False, indent=1)
    hol = json.load(open(os.path.join(RESEARCH, "holidays.json")))
    json.dump({k: hol[k] for k in ("accessed", "holidays", "conflicts", "not_found") if k in hol},
              open(os.path.join(OUT, "holidays.json"), "w"), ensure_ascii=False, indent=1)

    print({k: len(db[k]) for k in db})
    print(dict(log))
    print("date_status", dict(Counter(s["date_status"] for s in db["sessions"].values())))


if __name__ == "__main__":
    main()
