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
CONFLICT_DROP = {"little-steps-year-end", "red-rescue-lifesaving-camp",
                 # th-aggregators: 2026 vs 2027 dates of Regent's, which its own note says is not a conflict
                 "regents-international-school-bangkok-th-winter-camp-2027",
                 # th-study-tour: IH Bangkok price (2025 vs 2026 is a price rise) and Saturday classes vs
                 # holiday camps (two products on one page); the official page read in Chrome settles both
                 "ih-bangkok-kids-camp"}

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


def patch_staffing_facilities(db):
    """Chrome 2026-10-10：Arrowhead GIS 2027-02 訂位頁、Newtonshow 冬季營頁與 FAQ 的場地、分組、師資、安全。"""
    url = "https://arrowheadskills.com/booking/gis-camp-2027-02-08/"
    for pid in ("arrowhead-multi-activity", "arrowhead-multi-sport"):
        p = db["programs"].get(pid)
        if not p:
            continue
        p["facilities"] = "用 Garden International School 的校園設施：運動場地、創作空間，有泳池時會用。"
        p["staffing"] = "受過訓練的 Arrowhead 指導員帶，依年齡分小組；每組人數和師生比沒寫。"
        p["sources"].append({"url": url, "tier": 1, "accessed": TODAY, "fields": ["facilities", "staffing", "safety"],
                             "quote": "Use of school facilities (sports areas, creative spaces, pools where available)"})
    p = db["programs"].get("newtonshow-winter")
    if p:
        p["facilities"] = "官網沒寫教室設備。吉隆坡兩處都在大樓裡的單位：Menara Mutiara Bangsar 16 樓、Wisma Chuang 1205 室。"
        p["staffing"] = "官網寫依年齡分組、小組上課，沒有人數；FAQ 的「每組幾個孩子」「老師經驗」兩題，答案是空白（2026-10-10 讀）。"
        p["safety"]["notes"] = "FAQ 的「營隊安全嗎」一題，答案是空白（2026-10-10 讀）。"
        p["sources"].append({"url": "https://newtonshow.my/faq", "tier": 1, "accessed": TODAY, "fields": ["staffing", "safety"],
                             "quote": "How many children are in each group?（答案空白）"})
        p["sources"].append({"url": "https://newtonshow.my/winter-camp", "tier": 1, "accessed": TODAY, "fields": ["staffing"],
                             "quote": "Children join in age groups"})


REGENTS_PRICE_IMG = "https://www.nordangliaeducation.com/risb-bangkok/-/media/risb-bangkok/outstanding-experience/p2-768x768.png"


def drop_entities(db, providers=(), programs=(), sessions=()):
    programs = set(programs) | {g for g, x in db["programs"].items() if x["provider_id"] in providers}
    for pid in providers:
        db["providers"].pop(pid, None)
    for g in programs:
        db["programs"].pop(g, None)
    for s in [s for s, x in db["sessions"].items() if s in sessions or x["program_id"] in programs]:
        db["sessions"].pop(s)


def patch_thailand(db):
    # The same camp built twice under different ids. Keep the batch the camp was assigned to,
    # except Let's Asia: th-aggregators read the years on the page ("Xmas 2026", "New Year Camp 2026"),
    # th-bkk-camps did not.
    drop_entities(db, providers=["international-house-bangkok-th"],  # th-study-tour's ih-bangkok-th has the official page
                  programs=["green-group-agency-th-new-year-festive-week",  # th-bkk-camps has it as a 12/28 session
                            "green-group-agency-th-winter-english-camp-boarding", "lets-asia-th-fun-camp"],
                  sessions=["green-group-agency-th-winter-day-camp-played-20261207",
                            "green-group-agency-th-winter-english-school-played-20270111",
                            "bangkok-dolphins-th-holiday-camp-racquet-club-20270215"])
    for c in db["conflicts"]:
        if c["entity_id"] == "lets-asia-th-fun-camp":
            c["entity_id"] = "lets-asia-th-holiday-camp"
    # the 9,500 vs 8,500 one is last year's price on Edarabia, not a conflict
    db["conflicts"] = [c for c in db["conflicts"] if not (c["entity_id"] == "lets-asia-th-holiday-camp" and c["field"] == "price")]
    g = db["programs"].get("lets-asia-th-holiday-camp")
    if g:
        g["notes"] = (g.get("notes") or "") + "校車另付：素坤逸區每週 1,750、每日 400 泰銖，其他地區更貴（官網）。"

    # Thailand Climbing: the booking pages read in Chrome 2026-10-10
    db["gaps"].append({
        "name": "Thailand Climbing（Chiang Mai Rock Climbing Adventures）兒童攀岩營", "url": "https://thailandclimbing.rezdy.com/catalog/520610/camps",
        "what_missing": "三個 5 天營都在訂位系統上，但都顯示「no availability」，沒有梯次日期：室內攀岩半日 9:00～12:00 ฿6,995、"
                        "戶外攀岩全日 8:30～17:00 ฿19,995、冒險技能營 ฿24,995（8～12、13～18 歲）。介紹寫的是暑假。",
        "kind": "not_found", "_batch": "main-chrome"})

    # th-bkk-schools and th-aggregators both built Regent's; keep th-bkk-schools (its assigned batch,
    # plus the 2026 reference session and the 1 teacher + 1 TA detail)
    dup = "regents-international-school-bangkok-th"
    drop_programs = {g for g, x in db["programs"].items() if x["provider_id"] == dup}
    db["providers"].pop(dup, None)
    for g in drop_programs:
        db["programs"].pop(g)
    for s in [s for s, x in db["sessions"].items() if x["program_id"] in drop_programs]:
        db["sessions"].pop(s)

    # Thai literacy: the agent tagged it "language" too, which maps to English
    g = db["programs"].get("bangkok-prep-thai-literacy")
    if g:
        g["category"] = ["other_language"]

    # Regent's Winter Camp 2027 prices: only in the pricing image, read in Chrome 2026-10-10
    s = db["sessions"].get("regents-english-winter-camp-regents-boarding-20270111")
    if s:
        s["price"].update({
            "amount": 29900, "currency": "THB", "basis": "per_week", "source_url": REGENTS_PRICE_IMG,
            "tax_note": "官網價格圖：1 週 29,900、2 週 49,900、3 週 69,900、4 週 89,900、5 週 109,900、6 週 129,900 泰銖。"
                        "報多週比較便宜，用 1 週單價估多週會偏高。校車另列一行：1～2 週 8,000、3 週 10,000、4 週 16,000、"
                        "5～6 週 18,000，頁面沒說是否必選。",
        })
        s["min_duration_weeks"] = 1
        s["notes"] = ("價格表有 1 到 6 週的選項，可以只報 1 週；哪幾週可以選，頁面沒寫。9/30 前付款 8 折的早鳥已截止。"
                      "每日上課時間沒寫（10 月營是 9:00～14:30，不能直接套用）。")
        s.setdefault("sources", []).append({
            "url": REGENTS_PRICE_IMG, "tier": 1, "accessed": TODAY, "fields": ["price"],
            "quote": "Winter Camp 2027 … 1 WEEK Tuition fees 29,900 THB … 3 WEEKS 69,900 THB"})
        prog = db["programs"]["regents-english-winter-camp"]
        prog["notes"] = ("2027 年寒假營 1/11～2/19，共六週，涵蓋 1/17～2/8 全段。對外開放，非本校生可報。"
                         "價格在官網的價格圖裡（Chrome 讀圖，2026-10-10）。")
        prog["class_size_max"] = 25

    # IH Bangkok immersion camps: the official kids page read in Chrome 2026-10-10
    ih = "https://ihbangkok.com/english-courses/english-for-kids/"
    ih_quote = "Immersion Camps … 19 Jan 2026 to 27 Feb 2026 … Start any Monday … 1 WEEK 1 child 16,950 THB"
    ih_tiers = ("官網價：1 週 16,950、2 週 32,000，之後每加 1 週 15,950 泰銖；兄弟姊妹或團體報名每人每週少 500。"
                "用 1 週單價估多週會略高。")
    g = db["programs"].get("ih-bangkok-kids-camp")
    if g:
        g["name"] = "IH Bangkok Immersion Camps（兒童英語營）"
        g["hours"] = {"start": "09:00", "end": "15:15", "days": "Mon-Fri"}
        g["class_size_max"] = 12
        g["notes"] = ("給外國孩子的語言學校營隊，依劍橋兒童英語分級（Starters、Movers、Flyers），任何程度都收。"
                      "寒假、暑假開營，每週一都能開始，可報 1～10 週。週六另有常態班，是另一個課程。官網沒寫含不含午餐。")
        for sid in ("ih-bangkok-kids-camp-ihbangkok-20260119", "ih-bangkok-kids-camp-ihbangkok-20260615",
                    "ih-bangkok-kids-camp-ihbangkok-tbd-2027w"):
            s = db["sessions"].get(sid)
            if not s:
                continue
            s["price"].update({"amount": 16950, "currency": "THB", "basis": "per_week", "source_url": ih, "tax_note": ih_tiers})
            s.update({"source_url": ih, "verified_at": TODAY, "flexible_start": True, "min_duration_weeks": 1})
            if s["date_status"] == "confirmed_other_year":
                s["confidence"] = "high"
                s["evidence_quote"] = ih_quote if sid.endswith("0119") else "15 Jun 2026 to 21 Aug 2026 … Start any Monday"
            else:
                # official page, dates still estimated: the date status already says so
                s["confidence"] = "medium"
                s["estimate_basis"] = ("官網：2026 年寒假 1/19～2/27、暑假 6/15～8/21；2025 年寒假 1/20～2/21（languagecourse.net 簡章）。"
                                       "2027 年寒假日期未公布。")
            s.setdefault("sources", []).append({"url": ih, "tier": 1, "accessed": TODAY, "fields": ["dates", "price"], "quote": ih_quote})


OIS_PAGE = "https://ois.ac.jp/short-term-program/"
OIS_IMG = "https://ois.ac.jp/wp-content/uploads/2026/"
OIS_PRICE_IMG = OIS_IMG + "04/スクリーンショット-2026-04-14-150819.png"
OIS_CAL_K_IMG = OIS_IMG + "09/スクリーンショット-2026-09-18-120042.png"
OIS_CAL_E_IMG = OIS_IMG + "09/スクリーンショット-2026-09-18-120110.png"
ELEV8 = "https://www.elev8.co.jp/winter-camp"
LTL = "https://wintercampjapan.com/"


ENGLISH_CLASS = ["english"]  # notes: an English class or English-themed camp
JP_SCHOOL_CATEGORIES = {
    "kis-jp-saturday-school": ENGLISH_CLASS, "oyis-jp-saturday-school": ENGLISH_CLASS,
    "oyis-jp-spring-intensive": ENGLISH_CLASS, "oyis-jp-summer-intensive": ENGLISH_CLASS, "oyis-jp-winter-intensive": ENGLISH_CLASS,
    "smis-jp-english-kids-summer": ENGLISH_CLASS, "sis-summer-school": ENGLISH_CLASS,
    "st-marys-summer-adventure": ["english", "multi_activity"],  # games, sport, crafts and cooking in English
    "canacad-jp-summer-experience": ["multi_activity", "stem"],  # robotics, woodwork, Japan discovery
    "giis-tokyo-winter-bootcamp": ["arts"],  # art and storytelling groups
    "aoba-summer-school": ["multi_activity"], "asij-summer-day-camp": ["multi_activity"], "asij-summer-passport": ["multi_activity"],
    "canacad-jp-summer-discovery": ["multi_activity"], "cis-tokyo-summer-school": ["multi_activity"],
    "horizon-summer-school": ["multi_activity"], "issh-summer-wonder": ["multi_activity"], "kis-jp-summer-camp": ["multi_activity"],
    "laurus-winter-camp": ["multi_activity"], "nishimachi-summer-care": ["multi_activity"], "owis-jp-summer-camp": ["multi_activity"],
    "owis-jp-winter-camp": ["multi_activity"], "saint-maur-summer-school": ["multi_activity"],
    "smis-jp-summer-school": ["multi_activity"], "tis-seasonal-school": ["multi_activity"],
    "tokyo-west-winter-school": ["multi_activity"], "yis-summer-school": ["multi_activity"],
}


def week_session(sid,program_id, location_id, mon, fri, season, price, source_url, quote, notes):
    return {"id": sid, "program_id": program_id, "location_id": location_id, "start_date": mon, "end_date": fri,
            "weekday_pattern": "Mon-Fri", "date_status": "confirmed_target_year", "year": int(mon[:4]), "season": season,
            "price": price, "min_duration_weeks": 1, "flexible_start": False, "spots_status": None,
            "source_url": source_url, "verified_at": TODAY, "evidence_quote": quote, "confidence": "high",
            "estimate_basis": None, "notes": notes, "_batches": ["main-chrome"]}


def patch_japan(db):
    # The same camp built by two or three batches. Keep the version from the batch that had the most detail,
    # then write in what was read in Chrome on 2026-10-10.
    drop_entities(db, providers=["ltl-japanese-school-jp"],  # same school as ltl-school-jp; its only session was USD
                  programs=["ayla-camp-ayla", "ayla-camp", "ust-summer-school", "ois-short-term-program"])
    coto_old = "coto-academy-kids-winter-japanese"
    past = db["sessions"].pop("coto-academy-kids-winter-japanese-azabujuban-20260126", None)
    drop_entities(db, programs=[coto_old])
    if past:  # last winter's run stays as evidence on the kept program
        past.update({"id": "coto-academy-jp-kids-winter-20260126", "program_id": "coto-academy-jp-kids-winter",
                     "location_id": "loc-jp-coto-minato"})
        db["sessions"][past["id"]] = past
    for s in [s for s, x in db["sessions"].items() if x.get("location_id") == "loc-jp-fukuoka-board-of-education"]:
        db["sessions"].pop(s)  # the jp-fukuoka batch has the same rolling 仮入学 with the city page
    for lid in ("loc-jp-coto-azabujuban", "loc-jp-fukuoka-board-of-education"):
        db["locations"].pop(lid, None)
        for g in db["programs"].values():
            if lid in g.get("location_ids", []):
                g["location_ids"].remove(lid)
    for r in db["reviews"]:
        if r["entity_id"] == "ltl-japanese-school-jp":
            r["entity_id"] = "ltl-school-jp"

    # conflicts: Ayla's age one was filed twice; Coto's price and dates ones were old-page leftovers
    # (the 45,000 price was only a search snippet); Elev8's 5:1 vs 3:1 are both on the official page
    db["conflicts"] = [c for c in db["conflicts"] if not (
        c["entity_id"] in ("ayla-camp", "coto-academy-kids-winter-japanese-azabujuban-20270118")
        or (c["entity_id"] == "coto-academy-jp-kids-winter" and c["field"] in ("price_per_week_1w", "dates"))
        or (c["entity_id"] == "elev8-holiday-camp" and c["field"] == "staff_ratio"))]
    for c in db["conflicts"]:
        if c["entity_id"] == "ayla-camp-ayla":
            c["entity_id"] = "ayla-international-school-jp-seasonal-camp"

    # school-run holiday programs the batches tagged only as "school_own_camp" / "summer_camp": the topic from their notes
    for pid, cats in JP_SCHOOL_CATEGORIES.items():
        if pid in db["programs"]:
            db["programs"][pid]["category"] = cats

    g = db["programs"].get("ayla-international-school-jp-seasonal-camp")
    if g:
        g["category"] = ["multi_activity"]
        g["notes"] = g["notes"].replace("這是課後托育或幼兒園的短期利用，不是假期營。", "白金台的國際幼兒園自辦的季節營，按日或按週報名。")

    # Elev8: the official page title carries the year
    elev8_quote = "Tokyo Autumn & Winter Camps for Kids 2026/27"
    g = db["programs"].get("elev8-holiday-camp")
    if g:
        g["staffing"] = "官網寫每位老師最多帶 5 名學生，通常大約 3 名。"
        g["notes"] = ("全日營，每天自己選模組：程式、數學（以英語授課）、英語、日語（給非母語學生）。孩子要聽得懂基本英語。"
                      "每週三是全天校外教學。費用含課程、校外教學、午餐、點心和飲料。"
                      "有人帶隊的接送從廣尾、澀谷、橫濱、港未來、人形町、銀座、新宿、東京車站出發（07:45～08:30），不另收費。"
                      "早上 7:30 起、晚上到 19:00 的延托每小時 2,000 日圓。官網頁面標題寫 2026/27。")
        g.setdefault("sources", []).append({"url": ELEV8, "tier": 1, "accessed": TODAY, "fields": ["dates", "price", "staffing"],
                                            "quote": elev8_quote})
    elev8 = [x for x in db["sessions"].values() if x["program_id"] == "elev8-holiday-camp"]
    for x in elev8:
        x["notes"] = x["notes"].replace("年份是依 Edarabia 的 2026/27 標示推定，官網表格沒標年份。", "")
        x.update({"confidence": "high", "source_url": ELEV8, "evidence_quote": elev8_quote, "verified_at": TODAY})
    if elev8:
        for mon, fri, note in (("2026-11-09", "2026-11-13", "秋季營週。"),
                               ("2026-11-23", "2026-11-27", "秋季營週。11/23 是日本國定假日（勤労感謝の日），官網照樣列這一週，當天有沒有開要問。")):
            sid = f"elev8-holiday-camp-roppongi-{mon.replace('-', '')}"
            db["sessions"][sid] = week_session(
                sid, "elev8-holiday-camp", "loc-jp-elev8-roppongi", mon, fri, "winter_2026_27", dict(elev8[0]["price"]),
                ELEV8, elev8_quote, note + "每天 23,000 日圓，訂滿 5 天九五折（皆未含稅）。可以只報單日。")
            db["sessions"][sid]["flexible_start"] = True
            db["sessions"][sid]["min_duration_weeks"] = None

    # Coto: the winter page read in Chrome; the old-page conflicts are gone
    coto = "https://cotoacademy.com/kids-winter-course-landing-page/"
    s = next((x for x in db["sessions"].values()
              if x["program_id"] == "coto-academy-jp-kids-winter" and x.get("start_date") == "2027-01-18"), None)
    if s:
        s["price"]["tax_note"] = "稅別沒寫。官網：1 週 52,800、2 週 102,000、3 週 144,000 日圓，報多週比較便宜，用 1 週單價估多週會偏高。"
        s.update({"confidence": "high", "verified_at": TODAY,
                  "notes": "三週 2027-01-18 至 02-05，每週一到週五 13:10～16:00，每週可單獨報名。初級、進階分班，每班最多 8 人。"
                           "8 歲以上才收，10 歲的孩子可報，6 歲的不能。"})
        s.setdefault("sources", []).append({"url": coto, "tier": 1, "accessed": TODAY, "fields": ["dates", "price"],
                                            "quote": "January 18 - February 5, 2027 … 1 WEEK ¥52,800"})

    # LTL: start dates and the JPY price list are in pop-ups on the official site, read in Chrome
    ltl_quote = "Kids Day Camp … 1 week ¥161,700"
    g = db["programs"].get("ltl-school-jp-kids-day-camp")
    if g:
        g["class_size_max"] = 12
        g["notes"] = ("日語授課。早上 09:00～13:00 上日語課，午餐後 14:00～18:00 是活動，每週 20 小時日語課。平均每班 5～8 人，最多 12 人。"
                      "同一頁還有半日營（7～17 歲）、青少年日間營、寄宿家庭、宿舍等營型，是不同方案。")
        g.setdefault("sources", []).append({"url": LTL, "tier": 1, "accessed": TODAY, "fields": ["dates", "price", "class_size"],
                                            "quote": ltl_quote})
    s = next((x for x in db["sessions"].values() if x["program_id"] == "ltl-school-jp-kids-day-camp"), None)
    if s:
        s["price"].update({"amount": 161700, "currency": "JPY", "basis": "per_week", "from": None, "tax_included": None,
                           "source_url": LTL,
                           "tax_note": "稅別沒寫。官網日圓價：1 週 161,700、2 週 314,600、3 週 458,700、4 週 595,100 日圓，"
                                       "報多週比較便宜，用 1 週單價估多週會偏高。"})
        s.update({"start_date": "2026-12-07", "end_date": "2027-01-22", "confidence": "high", "source_url": LTL,
                  "verified_at": TODAY, "flexible_start": True, "min_duration_weeks": 1,
                  "evidence_quote": "START DATES：2026 年 12/7、12/14、12/21、12/28，2027 年 1/4、1/11、1/18（官網彈出視窗）",
                  "notes": "每週一開課，最後一梯 1/18 開始、1/22 結束。完全沒學過日語的孩子只能在 12/7 或 1/4 開始，"
                           "1/18 那週只收已經有日語程度的孩子。官網的美元價註明只供參考，這裡用日圓價。"
                           "同頁其他營型 1 週：半日營 82,800、青少年日間營 140,800、寄宿家庭 230,500、宿舍 250,800 日圓。"})
        s.setdefault("sources", []).append({"url": LTL, "tier": 1, "accessed": TODAY, "fields": ["dates", "price"], "quote": ltl_quote})

    # OIS short-term enrolment: the weeks and prices are images on the official page, read in Chrome.
    # Kindergarten (Naha) and elementary (Nanjo) take visitors in different weeks, so they are two programs.
    ois_src = [{"url": OIS_PAGE, "tier": 1, "accessed": TODAY, "fields": ["age", "requirements", "booking"],
                "quote": "黄色で色付けされた週が受け入れ可能な週"},
               {"url": OIS_PRICE_IMG, "tier": 1, "accessed": TODAY, "fields": ["price"], "quote": "表示価格は全て税込価格"}]
    common = ("這是到學校跟班上課，不是假期營。直接進一般班級，學校沒有另設給外語生的英語班。"
              "孩子要已經在用英語學習，能用英語或日語溝通。學校沒有宿舍，家長要同住，或在沖繩有監護人。"
              "流程是線上面談、錄取、付款、說明會。報名費 30,000 日圓不退，餐費和校車另計。開課後不退費。")
    base = {"provider_id": "ois-okinawa-jp", "category": ["short_term_enrolment"], "language_of_instruction": ["English", "Japanese"],
            "age_rule": None, "format": "day", "hours": {"start": None, "end": None, "days": "Mon-Fri"},
            "class_size_max": None, "class_size_avg": None, "staff_ratio": None, "staffing": None, "facilities": None,
            "includes": {"lunch": False, "snacks": None, "materials": None, "accommodation": False, "airport_transfer": None,
                         "insurance": None, "tshirt": None},
            "excludes": ["報名費 30,000 日圓（不退）", "餐費、校車另計", "沒有宿舍"],
            "booking": {"url": OIS_PAGE, "deadline": None, "payment_terms": "銀行轉帳或信用卡", "refund_policy": "開課後不退費",
                        "flex_ticket": None, "sibling_discount": None},
            "safety": {"first_aid": None, "cctv": None, "insurance": None, "notes": None}, "_batches": ["main-chrome"]}
    kinder = dict(base, id="ois-short-term-kindergarten", name="OIS 短期體驗入學（幼稚部，那霸校區）",
                  age_min=5, age_max=6, location_ids=["loc-jp-ois-naha"],
                  requirements=["幼稚部收 5、6 歲", "能用英語或日語溝通", "線上面談錄取後才付款"],
                  sources=ois_src + [{"url": OIS_CAL_K_IMG, "tier": 1, "accessed": TODAY, "fields": ["dates"], "quote": "Pre-K 2026-27 calendar"}],
                  notes=common + "幼稚部在那霸校區（098-835-1851）。2026-27 學年可收的週只有 2026 年 10/19、10/26、11/9、11/16、11/30 "
                                 "開始的五週，2027 年 1～2 月沒有。日曆上 1/25～29 那週標成綠色，頁面沒有圖例，要問學校。")
    elem = dict(base, id="ois-short-term-elementary", name="OIS 短期體驗入學（初等部，南城校區）",
                age_min=7, age_max=10, location_ids=["loc-jp-ois-nanjo"],
                requirements=["初等部收 2～4 年級，1 年級和 5 年級要先問", "能用英語或日語溝通", "線上面談錄取後才付款"],
                sources=ois_src + [{"url": OIS_CAL_E_IMG, "tier": 1, "accessed": TODAY, "fields": ["dates"], "quote": "Elementary G1-5 2026-27 calendar"}],
                notes=common + "初等部在南城校區（098-948-7711）。2026-27 學年可收的週：2026 年 10/19、10/26、11/9、11/16 開始的四週，"
                               "2027 年 2/1～5 和 3/8～12。頁面寫「2～4 年生」，沒說用日本還是美國學制：2016 年 5 月生的孩子"
                               "依日本學制是小 4，可以收；依美國學制是 G5，要先問。2020 年 5 月生的孩子依美國學制算 G1，也要先問。")
    for g in (kinder, elem):
        db["programs"][g["id"]] = g

    def ois_price(amount, tiers):
        return {"amount": amount, "currency": "JPY", "basis": "per_week", "tax_included": True,
                "tax_note": f"税込。{tiers}多週的每週價比 1 週高，用 1 週單價估多週會偏低。", "source_url": OIS_PRICE_IMG,
                "from": None, "early_bird": {"amount": None, "deadline": None, "condition": None}}
    weeks = {
        kinder["id"]: ("loc-jp-ois-naha", "naha", OIS_CAL_K_IMG, ois_price(28000, "1 週 28,000、2 週 69,000、3 週 109,000、1 個月 140,000 日圓。"),
                       [("2026-11-09", "2026-11-13"), ("2026-11-16", "2026-11-20"), ("2026-11-30", "2026-12-04")]),
        elem["id"]: ("loc-jp-ois-nanjo", "nanjo", OIS_CAL_E_IMG, ois_price(44000, "1 週 44,000、2 週 96,000、3 週 147,000、1 個月 186,000 日圓。"),
                     [("2026-11-09", "2026-11-13"), ("2026-11-16", "2026-11-20"), ("2027-02-01", "2027-02-05"), ("2027-03-08", "2027-03-12")]),
    }
    for pid, (lid, tag, cal, price, spans) in weeks.items():
        for mon, fri in spans:
            sid = f"{pid}-{tag}-{mon.replace('-', '')}"
            s = week_session(sid, pid, lid, mon, fri, "spring_2027" if mon >= "2027-03" else "winter_2026_27", dict(price),
                             OIS_PAGE, "黄色で色付けされた週が受け入れ可能な週",
                             "官網日曆圖的黃色週（可收的週）。1 週是週一到週五，不足 1 週不按日折算。")
            s["sources"] = [{"url": cal, "tier": 1, "accessed": TODAY, "fields": ["dates"], "quote": "黄色で色付けされた週"},
                            {"url": OIS_PRICE_IMG, "tier": 1, "accessed": TODAY, "fields": ["price"], "quote": "表示価格は全て税込価格"}]
            db["sessions"][sid] = s


PATCHES = [patch_erican, patch_embassy, patch_raffles_2027, patch_official_pages, patch_stem_academy, patch_klik,
           patch_from_prices, patch_staffing_facilities, patch_thailand, patch_japan]

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
    "french": "other_language", "other_language": "other_language", "nature": "outdoor",
    "robotics": "stem", "design": "arts", "multi_sport": "sport", "family_camp": "family", "thai": "other_language",
    "basketball": "sport", "after_school": "multi_activity",
    "japanese_language": "other_language", "language_japanese": "other_language", "language_english": "english",
    "english_immersion": "english", "english_after_school": "english", "bilingual": "english", "language_camp": "english",
    "writing": "english", "seasonal_camp": "multi_activity", "summer_school": "multi_activity", "overnight_nature": "outdoor",
    "family_program": "family",
}
# format or provider type, not what the camp teaches (format and provider.type already carry these)
DROP_CATEGORIES = {"day_camp", "school_own_camp", "academic", "weekend", "language_class",
                   "weekend_club", "school_holiday", "public_school", "day", "short_term_course",
                   "winter_camp", "spring_camp", "summer_camp", "weekday_class", "weekend_class"}
LANGUAGE_MAP = {"en": "English", "English": "English", "Mandarin": "Mandarin", "zh": "Mandarin"}


def normalize_program(p, log):
    cats = []
    raw = p.get("category") or []
    # bare "language" means English, unless the program is tagged with another language (Japanese, Thai, French)
    other = any(CATEGORY_MAP.get(c) == "other_language" for c in raw)
    for c in raw:
        if c in DROP_CATEGORIES:
            continue
        n = "other_language" if c == "language" and other else CATEGORY_MAP.get(c)
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
