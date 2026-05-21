"""
Weekly auto-updater for reits.html
Fetches live data from Yahoo Finance via yfinance.
Runs every Saturday 08:00 Taiwan time (00:00 UTC) via GitHub Actions.

Updates: dividend yields, market caps
Does NOT update: PE, PB, P/NAV, gearing, payout, outlook
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    print("Installing yfinance...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "yfinance", "-q"])
    import yfinance as yf

import re

ROOT = Path(__file__).resolve().parent.parent

# ── REIT tickers ────────────────────────────────────────────────────────
REIT_TICKERS = {
    'PLD': 'PLD', 'EQIX': 'EQIX', 'AMT': 'AMT', 'O': 'O',
    'SPG': 'SPG', 'PSA': 'PSA', 'DLR': 'DLR', 'WELL': 'WELL',
    'VICI': 'VICI', 'AVB': 'AVB', 'IRM': 'IRM', 'CCI': 'CCI',
    'EXR': 'EXR', 'ARE': 'ARE', 'INVH': 'INVH',
    # Singapore (SGX)
    'CICT': 'C38U.SI', 'MLT': 'M44U.SI', 'MINT': 'ME8U.SI',
    'CLAR': 'A17U.SI', 'KREIT': 'K71U.SI', 'FLT': 'BUOU.SI',
    'PREIT': 'C2PU.SI', 'MPACT': 'N2IU.SI',
    # Japan (TSE)
    'NBF': '8951.T', 'JRE': '8952.T', 'GLP': '3281.T',
    'NPR': '3283.T', 'JHR': '8985.T', 'ADR': '3269.T',
    'IIF': '3249.T', 'INV': '8963.T',
    # Australia (ASX)
    'GMG': 'GMG.AX', 'SCG': 'SCG.AX', 'SGP': 'SGP.AX',
    'DXS': 'DXS.AX', 'MGR': 'MGR.AX', 'CHC': 'CHC.AX',
    'GPT': 'GPT.AX', 'INA': 'INA.AX', 'LIC': 'LIC.AX',
    # Malaysia (KLSE)
    'KLCCSS': '5235SS.KL', 'IGBREIT': '5227.KL',
    'PAVREIT': '5212.KL', 'SUNREIT': '5176.KL',
    'AXREIT': '5106.KL', 'YTLREIT': '5109.KL',
    # Europe
    'VNA.DE': 'VNA.DE', 'SGRO.L': 'SGRO.L', 'URW.AS': 'URW.AS',
    'LAND.L': 'LAND.L', 'BLND.L': 'BLND.L', 'GFC.PA': 'GFC.PA',
    'LEG.DE': 'LEG.DE', 'CTPNV.AS': 'CTPNV.AS',
}


def fetch_quote(ticker_symbol):
    """Fetch current price and basic info from yfinance."""
    try:
        t = yf.Ticker(ticker_symbol)
        info = t.info
        return info
    except Exception as e:
        print(f"  ⚠ Failed to fetch {ticker_symbol}: {e}")
        return None


def update_reit_field(html, ticker_key, field, value):
    """Update a specific field for a REIT entry."""
    if value is None:
        return html
    pattern = rf"(ticker:'{re.escape(ticker_key)}'[^}}]*?{re.escape(field)}:)(-?[\d.]+)"
    new_html, count = re.subn(pattern, rf'\g<1>{value}', html)
    if count > 0:
        print(f"  ✓ {ticker_key}.{field} → {value}")
    return new_html


def main():
    changes = False
    now = datetime.now(timezone.utc)
    print(f"=== REIT Data Update: {now.strftime('%Y-%m-%d %H:%M UTC')} ===\n")

    # ── Update reits.html ───────────────────────────────────────────────
    reits_path = ROOT / 'reits.html'
    reits_html = reits_path.read_text(encoding='utf-8')
    original_reits = reits_html

    print("── Fetching REIT data ──")
    for reit_key, ticker in REIT_TICKERS.items():
        print(f"  Fetching {reit_key} ({ticker})...")
        info = fetch_quote(ticker)
        if not info:
            continue

        # Update dividend yield
        div_yield = info.get('dividendYield')
        if div_yield is None:
            div_yield_raw = info.get('trailingAnnualDividendYield')
            if div_yield_raw and div_yield_raw > 0:
                div_yield = round(div_yield_raw * 100, 1)
        if div_yield and div_yield > 0:
            yield_pct = round(div_yield, 1)
            reits_html = update_reit_field(reits_html, reit_key, 'divYield', yield_pct)

        # Update market cap (USD billions)
        mkt_cap = info.get('marketCap')
        if mkt_cap:
            mkt_cap_b = round(mkt_cap / 1e9, 1)
            reits_html = update_reit_field(reits_html, reit_key, 'mktCapUSD', mkt_cap_b)

    if reits_html != original_reits:
        reits_path.write_text(reits_html, encoding='utf-8')
        changes = True
        print("\n✓ reits.html updated")
    else:
        print("\n– reits.html: no changes")

    # ── Output for GitHub Actions ───────────────────────────────────────
    import os
    gh_output = os.environ.get('GITHUB_OUTPUT')
    if changes:
        print(f"\n{'='*50}")
        print(f"✓ Data updated on {now.strftime('%Y-%m-%d')}")
        if gh_output:
            with open(gh_output, 'a') as f:
                f.write("has_changes=true\n")
                f.write(f"summary=REITs data {now.strftime('%Y-%m-%d')}\n")
    else:
        print("\nNo changes detected.")
        if gh_output:
            with open(gh_output, 'a') as f:
                f.write("has_changes=false\n")


if __name__ == '__main__':
    main()
