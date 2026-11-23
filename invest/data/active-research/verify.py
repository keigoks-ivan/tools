#!/usr/bin/env python3
"""Verify published summary arithmetic. This is NOT a trading backtest.
Run beside any downloaded CSV: python3 verify.py vs-leveraged.csv
With no arguments, process available CSVs in this script's directory.
"""
import csv
import math
import statistics
import sys
from pathlib import Path

def read(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def check(path):
    rows = read(path)
    if path.name == 'persistence.csv':
        a = [float(r['source_relative_return_first_pct']) for r in rows]
        b = [float(r['source_relative_return_second_pct']) for r in rows]
        ra = [sorted(a, reverse=True).index(v) + 1 for v in a]
        rb = [sorted(b, reverse=True).index(v) + 1 for v in b]
        assert all(int(r['rank_first']) == x and int(r['rank_second']) == y
                   for r, x, y in zip(rows, ra, rb))
        rho = 1 - 6 * sum((x-y)**2 for x,y in zip(ra,rb)) / (len(rows)*(len(rows)**2-1))
        assert sum(v > 0 for v in a) == 9 and sum(v > 0 for v in b) == 0
        assert round(rho, 2) == -0.58
        print('11 funds; outperformers: 9 then 0; rank correlation:', round(rho, 3))
    elif path.name == 'drawdowns.csv':
        benchmark = next(float(r['loss_pct']) for r in rows if r['code']=='0050')
        losses = [float(r['loss_pct']) for r in rows if r['code']!='0050']
        assert len(losses) == 19 and all(v > benchmark for v in losses)
        assert statistics.median(losses) == 26.3
        print('All 19 lost more than 0050; median loss:', statistics.median(losses))
        print('Recovery after 30% loss:', round(0.3/0.7*100, 2), '%')
    elif path.name == 'diversification.csv':
        assert [int(r['funds']) for r in rows] == [5,11,22]
        assert [int(r['observations']) for r in rows] == [312,174,57]
        for r in rows:
            assert -1 <= float(r['daily_correlation']) <= 1
            assert -1 <= float(r['active_daily_correlation']) <= 1
        print('Published correlation bounds and sample labels valid; not independently recomputed.')
        print('Two equal-vol assets, equal weights; portfolio/single-asset volatility:')
        for rho in [1,0.9,0.5,0]:
            print(rho, round(math.sqrt((1+rho)/2)*100, 1), '%')
    elif path.name == 'activeness.csv':
        assert len(rows)==3 and all(r['holdings_date']=='2026-11-13' for r in rows)
        assert all(0<=float(r['top10_weight_pct'])<=100 for r in rows)
        print('Three same-date concentration observations; not a full holdings recomputation.')
    elif path.name == 'vs-leveraged.csv':
        dates = [r['date'] for r in rows]
        assert dates == sorted(set(dates)) and len(dates) == 355
        assert dates[0]=='2025-05-27' and dates[-1]=='2026-11-20'
        for code, final, maxdd in [('0050',193.8,-27.5),('00981A',200.0,-43.1),('00631L',245.8,-49.3)]:
            wealth=[float(r['wealth_'+code]) for r in rows]
            dd=[float(r['drawdown_'+code+'_pct']) for r in rows]
            assert wealth[0]==100 and wealth[-1]==final
            assert min(dd)==maxdd
            peak=wealth[0]; computed=[]
            for value in wealth:
                peak=max(peak,value);computed.append((value/peak-1)*100)
            # Source graph rounds wealth and drawdown independently to 0.1.
            assert max(abs(x-y) for x,y in zip(computed,dd)) < 0.16
            print(code, 'ending wealth:', final, 'source max drawdown:', maxdd,
                  'recomputed from rounded wealth:', round(min(computed),2))
    else:
        raise ValueError('Unknown dataset: '+path.name)
    print('PASS', path.name)

if __name__ == '__main__':
    paths=[Path(s) for s in sys.argv[1:]] if len(sys.argv)>1 else sorted(Path(__file__).parent.glob('*.csv'))
    if not paths:
        raise SystemExit('Place a downloaded CSV beside this script, or pass its path.')
    for path in paths:
        check(path)
