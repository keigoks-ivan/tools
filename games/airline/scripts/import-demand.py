"""Normalize official route totals and fit missing airport pairs. No runtime requests.

Run with a downloaded raw-data directory and OurAirports CSV. See design/demand/README.md.
Requires numpy and xlrd; never averages two reporters or adds mirrored route totals.
"""
import argparse, csv, hashlib, json, math
from collections import defaultdict
from pathlib import Path
import numpy as np
import xlrd

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('raw', type=Path)
parser.add_argument('airports', type=Path)
args = parser.parse_args()
raw = args.raw
cities = json.loads((raw / 'cities.json').read_text())
observations = []
files = []

def record_file(path, url):
    files.append({'file': path.name, 'url': url, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})

def add(a, b, pax, seats, year, source, reporter, row):
    if a not in cities or b not in cities or a == b or pax <= 0:
        return
    # Passenger-only services; reject inconsistent reported capacities.
    if seats and seats < pax:
        raise ValueError((source, a, b, pax, seats))
    observations.append(dict(pair='-'.join(sorted((a, b))), annualPax=round(pax),
        annualSeats=round(seats) if seats else None, year=year, source=source, reporter=reporter, row=str(row)))

airport_rows = list(csv.DictReader(args.airports.open()))
icao = {}
for r in airport_rows:
    if r['iata_code'] in cities:
        for code in [r['ident'], r['gps_code']]:
            if code:
                icao[code] = r['iata_code']
record_file(args.airports, 'https://ourairports.com/data/')

for path in sorted(raw.glob('eu-??.json')):
    country = path.stem[-2:]
    j = json.loads(path.read_text())
    codes = list(j['dimension']['airp_pr']['category']['index'])
    seat_path = raw / ('seats-' + country + '.json')
    sj = json.loads(seat_path.read_text())
    seat_codes = sj['dimension']['airp_pr']['category']['index']
    for idx, pax in j['value'].items():
        key = codes[int(idx)]
        parts = key.split('_')
        a, b = icao.get(parts[1]), icao.get(parts[3])
        si = seat_codes.get(key)
        seats = sj['value'].get(str(si)) if si is not None else None
        add(a, b, pax, seats, 2024, 'eurostat', a or parts[1], key)
    base = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/avia_par_' + country
    record_file(path, base + '?freq=A&time=2024&unit=PAS&tra_meas=PAS_BRD')
    record_file(seat_path, base + '?freq=A&time=2024&unit=SEAT&tra_meas=ST_PAS')

# Explicit aliases preserve one airport per city; e.g. HND, EWR, LGW and LIN are not folded into NRT/JFK/LHR/MXP.
uk_alias = {c['en'].upper(): id for id, c in cities.items()}
uk_alias.update(dict(HEATHROW='LHR', MANCHESTER='MAN', VIENNA='VIE', TAIPEI='TPE',
    BEIJING='PEK', BERLIN='BER', HAIKOU='HAK', QINGDAO='TAO', TIANJIN='TSN',
    PRAGUE='PRG', STOCKHOLM='ARN', OSLO='OSL', SEOUL='ICN', GUANGZHOU='CAN',
    SHENZHEN='SZX', SHANGHAI='PVG', BANGALORE='BLR', KUWAIT='KWI', ROME='FCO',
    MARRAKESH='RAK', TORONTO='YYZ', CHENNAI='MAA', HYDERABAD='HYD',
    KEFLAVIK='KEF', HANOI='HAN', CASABLANCA='CMN', AMMAN='AMM'))
uk_alias.update({
    'ABU DHABI INTERNATIONAL':'AUH', 'BANGALORE (BENGALURU)':'BLR', 'BANGKOK SUVARNABHUMI':'BKK',
    'BERLIN BRANDENBURG':'BER', 'CASABLANCA MOHAMED V':'CMN', 'CHANGSHA HUANGHUA INTERNATIONAL AIRPORT':'CSX',
    "CHICAGO (O'HARE)":'ORD', 'CHONGQING JIANGBEI INTERNATIONAL':'CKG', 'DALLAS/FORT WORTH':'DFW',
    'DOHA HAMAD':'DOH', 'FRANKFURT MAIN':'FRA', 'GUANGZHOU BAIYUN INTERNATIONAL':'CAN',
    'HAZRAT SHAHJALAL INTERNATIONAL AIRPORT':'DAC', 'HONG KONG (CHEK LAP KOK)':'HKG',
    'HYDERABAD ( RAJIV GHANDI )':'HYD', 'ISLAMABAD INTERNATIONAL AIRPORT':'ISB',
    'JORGE CHAVEZ INTERNATIONAL':'LIM', 'KUALA LUMPUR (SEPANG)':'KUL', 'LOS ANGELES INTERNATIONAL':'LAX',
    'MALE INTERNATIONAL':'MLE', 'MIAMI INTERNATIONAL':'MIA', 'MILAN (MALPENSA)':'MXP',
    'MONTREAL (DORVAL)':'YUL', 'NEW YORK (JF KENNEDY)':'JFK', 'OSLO (GARDERMOEN)':'OSL',
    'PARIS (CHARLES DE GAULLE)':'CDG', 'PERTH (AUSTRALIA)':'PER', 'PHUKET':'HKT',
    'RIO DE JANEIRO (GALEAO)':'GIG', 'ROME (FIUMICINO)':'FCO', 'SANTIAGO DE CHILE':'SCL',
    'SANYA PHOENIX INTERNATIONAL':'SYX', 'SAO PAULO (GUARULHOS)':'GRU', 'SEATTLE (TACOMA)':'SEA',
    'SEOUL (INCHEON)':'ICN', 'SHANGHAI (PU DONG)':'PVG', 'SHENZHEN (HUANGTIAN)':'SZX',
    'STOCKHOLM (ARLANDA)':'ARN', 'WARSAW (CHOPIN)':'WAW', 'WASHINGTON (DULLES)':'IAD',
    'WUHAN TIANHE INTERNATIONAL':'WUH', 'XIAN XIANYANG':'XIY'})
path = raw / 'uk2025.csv'
for i, r in enumerate(csv.DictReader(path.open(encoding='utf-8-sig')), 2):
    add(uk_alias.get(r['uk_apt'].strip()), uk_alias.get(r['foreign_apt'].strip()),
        int(r['ty_s_pax']), None, 2025, 'uk-caa', r['uk_apt'], i)
record_file(path, 'https://www.caa.co.uk/Documents/Download/24007/87fb7670-4e10-4aeb-942d-509238aa25a1/17509')

path = raw / 'bts2025.csv'
totals = defaultdict(lambda: [0, 0])
months = defaultdict(set)
for r in csv.DictReader(path.open()):
    if r['CLASS'] != 'F' or r['ORIGIN'] not in cities or r['DEST'] not in cities:
        continue
    key = '-'.join(sorted((r['ORIGIN'], r['DEST'])))
    totals[key][0] += float(r['PASSENGERS'])
    totals[key][1] += float(r['SEATS'])
    months[key].add(int(r['MONTH']))
for key, (pax, seats) in totals.items():
    add(*key.split('-'), pax, seats, 2025, 'us-bts', 'US DOT', key + ':CLASS=F:all months')
record_file(path, 'https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FJE')

zh_alias = {c['zh']: id for id, c in cities.items()}
zh_alias.update({'大阪':'KIX','札幌':'CTS','名古屋':'NGO','東京成田':'NRT','沖繩':'OKA','紐約':'JFK',
    '釜山':'PUS','曼谷蘇凡納布':'BKK','達拉斯':'DFW','普吉':'HKT','峇里島':'DPS',
    '米蘭':'MXP','羅馬':'FCO','倫敦希斯洛':'LHR','北京':'PEK','南京':'NKG','杭州':'HGH',
    '福州':'FOC','武漢':'WUH','青島':'TAO','廈門':'XMN','重慶':'CKG','深圳':'SZX','廣州':'CAN','汶萊':'BWN'})
path = raw / 'tw2025.xls'
book = xlrd.open_workbook(path)
for name, hub in [('53-1','TPE'),('53-2','KHH'),('53-4','RMQ')]:
    sheet = book.sheet_by_name(name)
    for i in range(11, sheet.nrows):
        r = sheet.row_values(i)
        if r[1] and not r[2] and isinstance(r[5], float):
            add(hub, zh_alias.get(r[1]), r[5], r[4], 2025, 'tw-caa', hub, name + ':' + str(i + 1))
# PNH's 2025 traffic is not relabelled as KTI; the airport changed in September.
record_file(path, 'https://www.caa.gov.tw/FileAtt.ashx?lang=1&id=40812')

priority = {'tw-caa': 4, 'us-bts': 3, 'uk-caa': 2, 'eurostat': 1}
grouped = defaultdict(list)
for r in observations:
    grouped[r['pair']].append(r)
selected = {k: sorted(v, key=lambda r: (-r['year'], -priority[r['source']], r['reporter'], r['row']))[0]
    for k, v in sorted(grouped.items())}
fields = ['pair','annualPax','annualSeats','year','source','reporter','row']
with (ROOT / 'design/demand/observations.csv').open('w') as f:
    w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(sorted(observations, key=lambda r: (r['pair'], r['source'], r['reporter'])))

def distance(a, b):
    rad = math.pi / 180
    x = math.sin((b['lat'] - a['lat']) * rad / 2)**2 + math.cos(a['lat'] * rad) * math.cos(b['lat'] * rad) * math.sin((b['lon'] - a['lon']) * rad / 2)**2
    return 2 * 6371 * math.asin(math.sqrt(min(1, x))) * 1.04

# Ridge on log traffic: old gravity shape is the prior, not a measured city-pair demand.
# Airport effects shrink to zero for airports without evidence. Hold out complete pairs, never mirrored reporters.
ids = sorted(cities)
region_pairs = sorted({'-'.join(sorted((a['region'], b['region']))) for a in cities.values() for b in cities.values()})
features = ['intercept','distanceSlope'] + ids + region_pairs
def feature(key):
    a, b = [cities[k] for k in key.split('-')]
    d = distance(a, b)
    base = 8000 * math.sqrt(a['pop'] * b['pop']) * (0.7 + 0.3 * (a['tourism'] + b['tourism'])) / (d / 1000 + 0.5)**0.8
    x = np.zeros(len(features)); x[0] = 1; x[1] = math.log(d / 1000 + 0.5)
    x[2 + ids.index(a['id'])] = 1; x[2 + ids.index(b['id'])] = 1
    x[2 + len(ids) + region_pairs.index('-'.join(sorted((a['region'], b['region']))))] = 1
    return x, base

fit_rows = [(k, r) for k, r in selected.items() if r['annualPax'] >= 25000 and (not r['annualSeats'] or r['annualPax'] / r['annualSeats'] >= .4)]
X = np.array([feature(k)[0] for k, r in fit_rows])
y = np.array([math.log(r['annualPax'] / 52 / feature(k)[1]) for k, r in fit_rows])
penalty = np.diag([.01, 5] + [8] * len(ids) + [12] * len(region_pairs))
def fit(mask):
    xm, ym = X[mask], y[mask]
    # Explicit reductions avoid the platform BLAS matmul warnings on sparse indicator columns.
    result = np.linalg.solve(np.einsum('ni,nj->ij', xm, xm) + penalty, np.einsum('ni,n->i', xm, ym))
    assert np.isfinite(result).all()
    return result
held = np.array([int(hashlib.sha256(k.encode()).hexdigest()[:8],16) % 5 == 0 for k, r in fit_rows])
cv = fit(~held)
error = np.abs(np.einsum('ni,i->n', X[held], cv) - y[held])
coef = fit(np.ones(len(fit_rows), dtype=bool))
counts = defaultdict(int)
for key in selected:
    for id in key.split('-'): counts[id] += 1
data = {k: [r['annualPax'],r['annualSeats'],r['year'],r['source']] for k,r in selected.items()}
fitted = {'intercept':round(float(coef[0]),6),'distanceSlope':round(float(coef[1]),6),
    'airports':{id:round(float(coef[2+i]),6) for i,id in enumerate(ids)},
    'regions':{key:round(float(coef[2+len(ids)+i]),6) for i,key in enumerate(region_pairs)},'coverage':dict(sorted(counts.items()))}
text = '// Generated by scripts/import-demand.py. Official totals are bidirectional flight-leg traffic, not true journey O-D.\n'
text += 'export const OBSERVED_MARKETS = ' + json.dumps(data,separators=(',',':')) + ';\n'
text += 'export const DEMAND_FIT = ' + json.dumps(fitted,separators=(',',':')) + ';\n'
(ROOT / 'demand-data.mjs').write_text(text)
summary = {'retrieved':'2026-10-05','pairs':len(selected),'bySource':dict((s,sum(r['source']==s for r in selected.values())) for s in priority),
    'allPairs':len(ids)*(len(ids)-1)//2,'airportsWithEvidence':len(counts),'fitRows':len(fit_rows),
    'holdoutPairs':int(held.sum()),'holdoutMedianMultiplicativeError':round(float(np.exp(np.median(error))),3),
    'holdoutP90MultiplicativeError':round(float(np.exp(np.quantile(error,.9))),3),
    'selection':'newest year, then Taiwan CAA > US BTS > UK CAA > Eurostat; then lexical reporting airport; never sum mirrored totals',
    'files':files,'btsMonths':sorted(set().union(*months.values()))}
(ROOT / 'design/demand/ingestion.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='files'},ensure_ascii=False,indent=2))
