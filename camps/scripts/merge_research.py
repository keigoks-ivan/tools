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


PATCHES = [patch_erican, patch_embassy]

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
