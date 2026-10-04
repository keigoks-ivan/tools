#!/usr/bin/env python3
"""從 盤感 LAB 的原始資料產生新手版用的還原權息日線。只讀來源，不改來源。"""
import json, os
SRC = "/Users/ivanchang/financial-analysis-bot/docs/simulation/data/stocks"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
SYMS = ["2330.TW", "2317.TW", "2454.TW", "2412.TW", "SPY", "QQQ", "AAPL", "NVDA", "MSFT", "KO", "TSLA"]
KEEP = 2520       # 最多保留最近約 10 年
NEED = 120        # 60 天背景＋60 天進行

def load_catalog():
    cat = {e["symbol"]: e for e in json.load(open(f"{SRC}/catalog.json"))}
    cat.update({e["symbol"]: e for e in json.load(open(f"{SRC}/index-etfs.json"))})
    return cat

def adjust(days):
    """與原版 stockChartBars 相同：由最新往回，把分割與現金股息還原到最新價位。"""
    n = len(days)
    pf = vf = 1.0
    rows = [None] * n
    for i in range(n - 1, -1, -1):
        b = days[i]
        rows[i] = [b["open"] * pf, b["high"] * pf, b["low"] * pf, b["close"] * pf, b["volume"] * vf]
        split = b.get("split") or 1
        prev = days[i - 1] if i > 0 else None
        if prev:
            ref = prev["close"] / split
            cash = 1 - (b.get("dividend") or 0) / ref
            if not (split > 0 and cash > 0):
                raise SystemExit(f"bad action {b['date']}")
            pf *= cash / split
            vf *= split
    return rows

def main():
    cat = load_catalog()
    out_cat, total = [], 0
    for s in SYMS:
        e = cat[s]
        d = json.load(open(f"{SRC}/{s}.json"))["days"]
        assert len(d) == e["count"], (s, len(d), e["count"])
        rows = adjust(d)
        cut = max(0, len(d) - KEEP)
        d, rows = d[cut:], rows[cut:]
        ranges = []
        for lo, hi in e["liquidity"]["ranges"]:
            lo, hi = lo - cut, hi - cut
            if hi < 0: continue
            ranges.append([max(lo, 0), hi])
        # 合法起點 t＝進行第 1 天的索引；背景 60 天＋進行 60 天（含第 0 天）都要落在同一段流動性區間
        starts = []
        for lo, hi in ranges:
            a, b = lo + 60, hi - 59
            if b >= a: starts.append([a, b])
        obj = {"s": s, "n": len(d),
               "d": [x["date"] for x in d],
               "o": [round(r[0], 3) for r in rows], "h": [round(r[1], 3) for r in rows],
               "l": [round(r[2], 3) for r in rows], "c": [round(r[3], 3) for r in rows],
               "v": [int(round(r[4])) for r in rows],
               "r": [x["close"] for x in d]}  # r＝當日原始名目收盤價，遊戲用來把還原價縮放回開局當天的真實價位
        p = f"{OUT}/{s}.json"
        json.dump(obj, open(p, "w"), separators=(",", ":"))
        total += os.path.getsize(p)
        out_cat.append({"symbol": s, "name": e["name"], "market": e["market"], "currency": e["currency"],
                        "count": len(d), "starts": starts})
        print(s, e["name"], len(d), starts[:3], os.path.getsize(p))
    json.dump(out_cat, open(f"{OUT}/catalog.json", "w"), ensure_ascii=False, separators=(",", ":"))
    print("total bytes", total + os.path.getsize(f"{OUT}/catalog.json"))

main()
