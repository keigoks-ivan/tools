#!/usr/bin/env python3
"""
Fetch fundamental data for TW screener stocks.
Run manually each quarter: python3 scripts/fundamentals_tw.py

Metrics: Fwd 2Y Revenue CAGR, Fwd 2Y EPS CAGR, ROIC, FCF Margin
"""
import json, time, sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import yfinance as yf

SCREENER_PATH = Path(__file__).parent.parent / "docs" / "screener"
INPUT = SCREENER_PATH / "tw_latest.json"
OUTPUT = SCREENER_PATH / "tw_fundamentals.json"

def safe_get(df, labels, col=0):
    if df is None or len(df.columns) == 0 or col >= len(df.columns):
        return None
    for lbl in (labels if isinstance(labels, list) else [labels]):
        if lbl in df.index:
            v = df.loc[lbl].iloc[col]
            if v is not None and str(v) != 'nan':
                return float(v)
    return None

def sum_ttm(df, labels, quarters=4):
    if df is None or len(df.columns) < quarters:
        return None
    for lbl in (labels if isinstance(labels, list) else [labels]):
        if lbl in df.index:
            vals = [df.loc[lbl].iloc[i] for i in range(quarters)]
            if all(v is not None and str(v) != 'nan' for v in vals):
                return sum(float(v) for v in vals)
    return None

def find_valid_col(df, labels):
    if df is None:
        return None
    for i in range(len(df.columns)):
        v = safe_get(df, labels, i)
        if v is not None and v != 0:
            return i
    return None

def fetch_one(ticker_str, retry=2):
    for attempt in range(retry + 1):
        try:
            tk = yf.Ticker(ticker_str)
            result = {"ticker": ticker_str}

            # === Forward estimates ===
            ge = tk.growth_estimates
            re = tk.revenue_estimate

            # --- Fwd Revenue CAGR 2Y ---
            result["rev_cagr"] = None
            if re is not None and '0y' in re.index and '+1y' in re.index:
                try:
                    rev_1y = float(re.loc['+1y', 'avg'])
                    rev_ago = float(re.loc['0y', 'yearAgoRevenue'])
                    if rev_ago > 0 and rev_1y > 0:
                        result["rev_cagr"] = (rev_1y / rev_ago) ** 0.5 - 1
                except:
                    pass

            # --- Fwd EPS CAGR 2Y ---
            result["eps_cagr"] = None
            if ge is not None and '0y' in ge.index and '+1y' in ge.index:
                try:
                    g0 = float(ge.loc['0y', 'stockTrend'])
                    g1 = float(ge.loc['+1y', 'stockTrend'])
                    if str(g0) != 'nan' and str(g1) != 'nan':
                        product = (1 + g0) * (1 + g1)
                        if product > 0:
                            result["eps_cagr"] = product ** 0.5 - 1
                        else:
                            result["eps_cagr"] = (g0 + g1) / 2
                except:
                    pass

            # === TTM data from quarterly financials for ROIC + FCF ===
            qfins = tk.quarterly_financials
            qbs = tk.quarterly_balance_sheet
            qcf = tk.quarterly_cashflow

            has_qfins = qfins is not None and len(qfins.columns) >= 4 and len(qfins.index) > 5
            has_qbs = qbs is not None and len(qbs.columns) >= 1 and len(qbs.index) > 3
            has_qcf = qcf is not None and len(qcf.columns) >= 4 and len(qcf.index) > 3

            if not has_qfins and attempt < retry:
                time.sleep(1)
                continue

            # --- FCF Margin (TTM) ---
            result["fcf_margin"] = None
            if has_qfins and has_qcf:
                rev_ttm = sum_ttm(qfins, "Total Revenue")
                fcf_ttm = sum_ttm(qcf, "Free Cash Flow")
                if fcf_ttm is None:
                    ocf_ttm = sum_ttm(qcf, "Operating Cash Flow")
                    capex_ttm = sum_ttm(qcf, "Capital Expenditure")
                    if ocf_ttm is not None and capex_ttm is not None:
                        fcf_ttm = ocf_ttm + capex_ttm
                if fcf_ttm is not None and rev_ttm and rev_ttm != 0:
                    result["fcf_margin"] = fcf_ttm / rev_ttm

            # --- ROIC (TTM) ---
            result["roic"] = None
            if has_qfins and has_qbs:
                ebit_ttm = sum_ttm(qfins, ["EBIT", "Operating Income"])
                use_net_income = False
                if ebit_ttm is None:
                    ebit_ttm = sum_ttm(qfins, "Net Income")
                    use_net_income = True

                tax_rate = 0.20
                if not use_net_income:
                    tax_ttm = sum_ttm(qfins, "Tax Provision")
                    pretax_ttm = sum_ttm(qfins, "Pretax Income")
                    if tax_ttm is not None and pretax_ttm and pretax_ttm != 0:
                        tr = tax_ttm / pretax_ttm
                        tax_rate = tr if 0 <= tr <= 0.5 else 0.20

                equity = safe_get(qbs, ["Stockholders Equity", "Total Stockholders Equity", "Common Stock Equity"], 0)
                lt_debt = safe_get(qbs, ["Long Term Debt", "Long Term Debt And Capital Lease Obligation"], 0) or 0

                if ebit_ttm is not None and equity is not None:
                    invested = equity + lt_debt
                    if invested > 0:
                        nopat = ebit_ttm if use_net_income else ebit_ttm * (1 - tax_rate)
                        result["roic"] = nopat / invested

            return result

        except Exception as e:
            if attempt < retry:
                time.sleep(1)
                continue
            print(f"  ✗ {ticker_str}: {e}", file=sys.stderr)
            return {"ticker": ticker_str, "rev_cagr": None, "eps_cagr": None, "fcf_margin": None, "roic": None}

def main():
    with open(INPUT) as f:
        data = json.load(f)
    tickers = [r["ticker"] for r in data["rankings"]]
    total = len(tickers)
    print(f"Fetching TW fundamentals for {total} stocks...")

    results = {}
    done = 0

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetch_one, t): t for t in tickers}
        for future in as_completed(futures):
            r = future.result()
            if r:
                results[r["ticker"]] = r
            done += 1
            if done % 20 == 0 or done == total:
                print(f"  {done}/{total} done")

    for tk, r in results.items():
        for k in ["rev_cagr", "eps_cagr", "fcf_margin", "roic"]:
            v = r[k]
            if v is not None:
                if isinstance(v, complex) or str(v) == 'nan':
                    r[k] = None
                else:
                    r[k] = round(float(v), 4)

    output = {
        "date": data["date"],
        "count": len(results),
        "data": results
    }

    with open(OUTPUT, "w") as f:
        json.dump(output, f, indent=None, separators=(",", ":"))

    has = lambda k: sum(1 for r in results.values() if r[k] is not None)
    print(f"\nSaved to {OUTPUT}")
    print(f"  rev_cagr: {has('rev_cagr')}/{total}")
    print(f"  eps_cagr: {has('eps_cagr')}/{total}")
    print(f"  fcf_margin: {has('fcf_margin')}/{total}")
    print(f"  roic: {has('roic')}/{total}")

if __name__ == "__main__":
    main()
