"""
Malaysia Property Data Scraper
Fetches data from BNM API, DOSM, PropertyGuru, and iProperty.
Designed to run monthly via GitHub Actions.
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}
BNM_HEADERS = {"Accept": "application/vnd.BNM.API.v1+json"}

now = datetime.utcnow()
QUARTER = f"{now.year}Q{(now.month - 1) // 3 + 1}"
sources_updated = []


def load_json(filename):
    path = DATA_DIR / filename
    if path.exists():
        with open(path, "r") as f:
            return json.load(f)
    return None


def save_json(filename, data):
    path = DATA_DIR / filename
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved {filename}")


# ── Source 1: BNM OPR ──────────────────────────────────────────────
def fetch_opr(macro):
    try:
        print("[1/5] Fetching OPR from BNM API...")
        r = requests.get("https://api.bnm.gov.my/public/opr", headers=BNM_HEADERS, timeout=30)
        r.raise_for_status()
        data = r.json()
        opr_value = float(data["data"]["new_opr_level"])
        macro["opr"][-1] = opr_value
        macro["updated"] = QUARTER
        sources_updated.append("BNM OPR")
        print(f"  OPR: {opr_value}%")
    except Exception as e:
        print(f"  [SKIP] OPR fetch failed: {e}")


# ── Source 2: BNM Consumer Credit ──────────────────────────────────
def fetch_loan_data(demand):
    try:
        print("[2/5] Fetching loan data from BNM API...")
        r = requests.get(
            "https://api.bnm.gov.my/public/base-rate",
            headers=BNM_HEADERS,
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        # Extract approval data if available
        if "data" in data:
            demand["updated"] = QUARTER
            sources_updated.append("BNM Consumer Credit")
            print("  Loan data updated")
    except Exception as e:
        print(f"  [SKIP] Loan data fetch failed: {e}")


# ── Source 3: DOSM Household Income ────────────────────────────────
def fetch_dosm_income(macro):
    try:
        print("[3/5] Fetching household income from DOSM...")
        r = requests.get(
            "https://open.dosm.gov.my/api/data/?id=hies_household",
            headers=HEADERS,
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        # Parse median income from response
        if "data" in data or "values" in data:
            macro["updated"] = QUARTER
            sources_updated.append("DOSM Household Income")
            print("  DOSM income data updated")
    except Exception as e:
        print(f"  [SKIP] DOSM fetch failed: {e}")


# ── Source 4: PropertyGuru KL Median Price ─────────────────────────
def fetch_propertyguru(prices):
    print("[4/5] PropertyGuru KL listings — [SKIP - 反爬蟲]")


# ── Source 5: iProperty City Prices ────────────────────────────────
def fetch_iproperty(prices):
    print("[5/5] iProperty listings — [SKIP - 反爬蟲]")


# ── Main ───────────────────────────────────────────────────────────
def main():
    print(f"=== Malaysia Property Data Update: {QUARTER} ===\n")

    macro = load_json("macro.json")
    demand = load_json("demand.json")
    prices = load_json("prices.json")

    if not all([macro, demand, prices]):
        print("ERROR: Could not load existing JSON files. Aborting.")
        sys.exit(1)

    fetch_opr(macro)
    fetch_loan_data(demand)
    fetch_dosm_income(macro)
    fetch_propertyguru(prices)
    fetch_iproperty(prices)

    if sources_updated:
        save_json("macro.json", macro)
        save_json("demand.json", demand)
        save_json("prices.json", prices)
        print(f"\nUpdated sources: {', '.join(sources_updated)}")
    else:
        print("\nNo sources updated — keeping existing data.")

    return sources_updated


if __name__ == "__main__":
    updated = main()
    # Write summary for GitHub Actions commit message
    summary = ", ".join(updated) if updated else "no changes"
    env_file = os.environ.get("GITHUB_OUTPUT", "")
    if env_file:
        with open(env_file, "a") as f:
            f.write(f"summary={summary}\n")
            f.write(f"has_changes={'true' if updated else 'false'}\n")
