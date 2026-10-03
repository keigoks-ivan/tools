"""Refresh the game's official MLB hot/cold zone snapshot; does not touch team data."""
import argparse
import datetime
import json
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--season', type=int, default=2026)
args = parser.parse_args()
source = (ROOT / 'assets/teams.js').read_text()
teams = json.loads(next(line for line in source.splitlines() if line.startswith('window.TEAMS=')).removeprefix('window.TEAMS=').rstrip(';'))
ids = sorted({p['id'] for t in teams for p in t['lineup']} | {p for t in teams for p in t['bench']})
players = {}
for start in range(0, len(ids), 30):
    batch = ids[start:start + 30]
    query = urllib.parse.urlencode({'personIds': ','.join(map(str, batch)), 'hydrate': f'stats(type=hotColdZones,group=hitting,season={args.season})'})
    with urllib.request.urlopen('https://statsapi.mlb.com/api/v1/people?' + query, timeout=30) as response:
        people = json.load(response)['people']
    if {p['id'] for p in people} != set(batch):
        raise RuntimeError('MLB response omitted requested player IDs; preserving previous snapshot.')
    for p in people:
        zones = next((split['stat']['zones'] for stat in p.get('stats', []) for split in stat.get('splits', []) if split.get('stat', {}).get('name') == 'battingAverage'), [])
        values = {}
        for z in zones:
            zone = int(z['zone'])
            if 1 <= zone <= 9:
                try:
                    value = float(z['value'])
                except (TypeError, ValueError):
                    continue
                if not 0 <= value <= 1:
                    raise ValueError(f'Invalid batting average for {p["id"]}, zone {zone}')
                values[zone] = [value, z['temp']]
        if values:
            players[str(p['id'])] = [values.get(i) for i in range(1, 10)]
    print(f'{min(start + 30, len(ids))}/{len(ids)} players checked', flush=True)
snapshot = {'season': args.season, 'retrieved': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
            'source': 'https://statsapi.mlb.com/api/v1/people', 'metric': 'battingAverage', 'perspective': 'catcher', 'players': players}
(ROOT / 'assets/hotzones.js').write_text('// Official MLB Stats API hotColdZones; zones 1–9 in catcher perspective.\nwindow.BATTING_HOTZONES=' + json.dumps(snapshot, separators=(',', ':')) + ';\n')
print(f'Saved official heat zones for {len(players)}/{len(ids)} lineup and bench players.')
