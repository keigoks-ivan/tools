#!/usr/bin/env python3
"""Fetch MYR/USD/SGD/KRW -> TWD rates from Yahoo Finance (yfinance) into camps/data/fx.json."""
import json
import os
from datetime import datetime, timezone

import yfinance as yf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAIRS = {"MYR": "MYRTWD=X", "USD": "USDTWD=X", "SGD": "SGDTWD=X", "KRW": "KRWTWD=X"}


def main():
    rates = {"TWD": 1.0}
    asof = {}
    for cur, ticker in PAIRS.items():
        hist = yf.Ticker(ticker).history(period="5d")
        if hist.empty:
            raise SystemExit(f"no data for {ticker}")
        rates[cur] = round(float(hist["Close"].iloc[-1]), 4)
        asof[cur] = hist.index[-1].strftime("%Y-%m-%d")
    out = {"base": "TWD", "rates": rates, "asof": asof, "source": "Yahoo Finance via yfinance",
           "tickers": PAIRS, "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    json.dump(out, open(os.path.join(ROOT, "data", "fx.json"), "w"), indent=1)
    print(out)


if __name__ == "__main__":
    main()
