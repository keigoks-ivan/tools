"""Recalculate the historical portfolios in the 00981A and 00631L article.

Run with Python 3 in the folder containing active-etf-vs-leveraged-common-days.csv.
An optional first argument selects a different source file.
"""
import csv
from datetime import date
import math
from pathlib import Path
import statistics
import sys


SOURCE_NAME = 'active-etf-vs-leveraged-common-days.csv'
OUTPUT_NAME = 'active-etf-vs-leveraged-portfolio-paths.csv'
WINDOWS = {
    'full': (None, None),
    'spring': ('2026-02-26', '2026-03-31'),
    'summer': ('2026-06-22', '2026-07-30'),
    'fall': ('2026-10-06', '2026-11-06'),
}
CODES = ('0050', '00981A', '00631L')


def replay(rows, period, name, ticker, fraction, monthly=False, cash_yield=0, trade_cost=0):
    etf, cash = fraction, 1 - fraction
    previous_growth = float(rows[0][f'growth_{ticker}'])
    previous_date = date.fromisoformat(rows[0]['date'])
    peak = 1
    for index, row in enumerate(rows):
        day = date.fromisoformat(row['date'])
        growth = float(row[f'growth_{ticker}'])
        etf *= growth / previous_growth
        cash *= (1 + cash_yield) ** ((day - previous_date).days / 365.25)
        total = etf + cash
        last_common_day = index + 1 < len(rows) and rows[index + 1]['date'][:7] != row['date'][:7]
        traded = fee = 0
        if monthly and last_common_day and index > 0:
            adjustment = fraction * total - etf
            # Solve for the target fraction after subtracting the fee from cash.
            direction = 1 if adjustment >= 0 else -1
            traded = abs(adjustment / (1 + fraction * trade_cost * direction))
            fee = traded * trade_cost
            total -= fee
            etf = fraction * total
            cash = total - etf
        peak = max(peak, total)
        yield (period, name, row['date'], total, etf / total, total / peak - 1, traded, fee)
        previous_growth, previous_date = growth, day


def calculations(source):
    with source.open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    for period, (start, end) in WINDOWS.items():
        sample = rows if start is None else [row for row in rows if start <= row['date'] <= end]
        for code in CODES:
            yield from replay(sample, period, code, code, 1)
        for weight in (25, 50, 75):
            yield from replay(sample, period, f'00631L_{weight}_monthly', '00631L', weight / 100, True)
        if period == 'full':
            for weight in (50, 75):
                yield from replay(sample, period, f'00631L_{weight}_hold', '00631L', weight / 100)
                yield from replay(sample, period, f'00631L_{weight}_cash_1p5', '00631L', weight / 100, True, cash_yield=.015)
                yield from replay(sample, period, f'00631L_{weight}_cost_25bps', '00631L', weight / 100, True, trade_cost=.0025)

    def training_volatility(code):
        prices = [float(row[f'growth_{code}']) for row in rows[:127]]
        return statistics.stdev(b / a - 1 for a, b in zip(prices, prices[1:]))

    matched = min(1, training_volatility('00981A') / training_volatility('00631L'))
    evaluation = rows[126:]
    print(f'Start of evaluation: {evaluation[0]["date"]}, initial 00631L weight: {matched:.8%}')
    yield from replay(evaluation, 'after_126_sessions', '00981A', '00981A', 1)
    yield from replay(evaluation, 'after_126_sessions', '00631L_matched_monthly', '00631L', matched, True)


if __name__ == '__main__':
    import itertools

    source = Path(sys.argv[1] if len(sys.argv) > 1 else SOURCE_NAME)
    with Path(OUTPUT_NAME).open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.writer(handle, lineterminator='\n')
        writer.writerow(('period', 'account', 'date', 'value_from_one', 'etf_weight_close',
                         'drawdown', 'traded_from_one', 'fee_from_one'))
        for (period, name), results in itertools.groupby(calculations(source), lambda item: item[:2]):
            path = list(results)
            writer.writerows((*row[:3], *(f'{number:.12g}' for number in row[3:])) for row in path)
            prices = [row[3] for row in path]
            volatility = statistics.stdev(b / a - 1 for a, b in zip(prices, prices[1:])) * math.sqrt(252)
            print(f'{period:<20} {name:<26} {100 * prices[-1]:>8.2f} {volatility:>8.2%} {min(row[5] for row in path):>8.2%}')
