#!/usr/bin/env python3
"""Compact a one-time OSM Overpass export; no geometry is invented or simplified.

Usage: python3 games/flight/dev/bake_buildings.py ways.json relations.json parts.json
The three recorded queries and their public source are included in the output.
"""
import collections
import datetime
import json
import re
import sys
from pathlib import Path

BBOX = [8.530, 47.358, 8.555, 47.386]
ENDPOINT = 'https://overpass.osm.ch/api/interpreter'
QUERY_AREA = '(47.358,8.530,47.386,8.555)'


def metres(value):
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(m|metres|meters|ft|feet|\')?\s*', value, re.I)
    if not match:
        return None
    result = float(match[1]) * (0.3048 if match[2] and match[2].lower() in ['ft', 'feet', "'"] else 1)
    return result if 0 <= result <= 400 else None


def number(value):
    try:
        result = float(value)
        return result if 0 <= result <= 100 else None
    except (ValueError, TypeError):
        return None


def ring(geometry):
    points = [[p['lon'], p['lat']] for p in geometry if p and 'lon' in p and 'lat' in p]
    points = [p for i, p in enumerate(points) if i == 0 or p != points[i - 1]]
    return points[:-1] if len(points) >= 4 and points[0] == points[-1] else None


def joined_rings(members, role):
    pending = [m['geometry'][:] for m in members if m.get('type') == 'way' and m.get('role', 'outer') == role and m.get('geometry')]
    output = []
    while pending:
        points = pending.pop()
        while points[0] != points[-1]:
            match = next((i for i, other in enumerate(pending) if other[0] == points[-1] or other[-1] == points[-1]), None)
            if match is None:
                break
            other = pending.pop(match)
            if other[-1] == points[-1]:
                other.reverse()
            points.extend(other[1:])
        closed = ring(points)
        if closed:
            output.append(closed)
    return output


def contains(points, point):
    x, y = point
    inside = False
    for a, b in zip(points, points[1:] + points[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def feature(element, rings, suffix=''):
    tags = element.get('tags', {})
    height, levels, roof_levels = metres(tags.get('height')), number(tags.get('building:levels')), number(tags.get('roof:levels'))
    roof_height = metres(tags.get('roof:height'))
    source = 'height' if height is not None else 'levels' if levels is not None else 'inferred'
    if height is None:
        height = levels * 3.2 + (roof_height if roof_height is not None else (roof_levels or 0) * 2.6) if levels is not None else 8
    low = metres(tags.get('min_height'))
    if low is None:
        low = (number(tags.get('building:min_level')) or 0) * 3.2
    if source == 'inferred':
        height = low + 8
    result = {'id': f"{element['type']}/{element['id']}{suffix}", 'rings': rings,
              'height': round(max(height, low + 0.5), 2), 'heightSource': source}
    if low:
        result['minHeight'] = round(low, 2)
    if 'building:part' in tags:
        result['part'] = True
    for original, key in [('name', 'name'), ('building', 'building'), ('roof:shape', 'roofShape'),
                          ('roof:orientation', 'roofOrientation'), ('building:colour', 'wallColor'), ('roof:colour', 'roofColor')]:
        if original in tags:
            result[key] = tags[original]
    if levels is not None:
        result['levels'] = levels
    if roof_height is not None or roof_levels is not None:
        result['roofHeight'] = round(roof_height if roof_height is not None else roof_levels * 2.6, 2)
        result['roofHeightSource'] = 'height' if roof_height is not None else 'levels'
    return result


def bake(paths):
    exports = [json.loads(Path(path).read_text()) for path in paths]
    elements = {f"{e['type']}/{e['id']}": e for data in exports for e in data['elements']}
    features, suppressed, skipped, parents = [], set(), 0, {}
    # Building relations contain outlines and already mapped 3D parts, not a polygon of their own.
    for element in elements.values():
        if element['type'] == 'relation' and element.get('tags', {}).get('type') == 'building':
            parts = [m for m in element.get('members', []) if m.get('role') == 'part' and f"{m['type']}/{m['ref']}" in elements]
            if parts:
                suppressed.update(f"{m['type']}/{m['ref']}" for m in element['members'] if m.get('role') == 'outline')
                for part in parts:
                    parents[f"{part['type']}/{part['ref']}"] = element
    for element in elements.values():
        if element['type'] != 'relation' or element.get('tags', {}).get('type') != 'multipolygon':
            continue
        members = element.get('members', [])
        outers, inners = joined_rings(members, 'outer'), joined_rings(members, 'inner')
        if not outers:
            skipped += 1
            continue
        for i, outer in enumerate(outers):
            holes = [inner for inner in inners if contains(outer, inner[0])]
            features.append(feature(element, [outer] + holes, f'/{i}' if len(outers) > 1 else ''))
        suppressed.update(f"way/{m['ref']}" for m in members if m.get('role') in ['outer', 'inner', ''])
    for key, element in elements.items():
        if element['type'] != 'way' or key in suppressed:
            continue
        polygon = ring(element.get('geometry', []))
        if polygon:
            f = feature(element, [polygon])
            parent = parents.get(key)
            if parent:
                f['parentId'] = f"{parent['type']}/{parent['id']}"
                if parent.get('tags', {}).get('name'):
                    f.setdefault('name', parent['tags']['name'])
                if parent.get('tags', {}).get('building'):
                    f.setdefault('building', parent['tags']['building'])
            features.append(f)
        else:
            skipped += 1
    parts = [f for f in features if f.get('part')]
    # Follow OSM Simple 3D Buildings: a mapped part replaces the encompassing outline.
    # Use an interior sample rather than a corner, since parts often share the outline's edge.
    samples = [(sum(p[0] for p in f['rings'][0]) / len(f['rings'][0]), sum(p[1] for p in f['rings'][0]) / len(f['rings'][0])) for f in parts]
    removed = 0
    kept = []
    for f in features:
        if not f.get('part') and any(contains(f['rings'][0], p) and not any(contains(hole, p) for hole in f['rings'][1:]) for p in samples):
            removed += 1
        else:
            kept.append(f)
    kept.sort(key=lambda f: f['id'])
    queries = [f'[out:json][timeout:25];(way["building"]["building"!="no"]{QUERY_AREA};relation["building"]["building"!="no"]{QUERY_AREA};);out tags geom;',
               f'[out:json][timeout:25];relation["building"]["building"!="no"]{QUERY_AREA};out body geom;',
               f'[out:json][timeout:25];(way["building:part"]["building:part"!="no"]{QUERY_AREA};relation["building:part"]["building:part"!="no"]{QUERY_AREA};);out body geom;']
    return {'schemaVersion': 1, 'area': 'Zurich old city and northern lake', 'bbox': BBOX,
            'coordinateOrder': 'longitude,latitude', 'rings': 'outer first, then courtyard holes; closing point omitted',
            'source': {'name': 'OpenStreetMap', 'endpoint': ENDPOINT, 'queries': queries,
                       'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                       'serverRevision': exports[0].get('osm3s', {}).get('timestamp_osm_base'),
                       'revisionNote': 'Regional server returns a numeric revision, not an ISO snapshot time.',
                       'attribution': '© OpenStreetMap contributors', 'copyrightUrl': 'https://www.openstreetmap.org/copyright',
                       'license': 'ODbL-1.0', 'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/',
                       'documentation': ['https://wiki.openstreetmap.org/wiki/Overpass_API', 'https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings',
                                         'https://wiki.openstreetmap.org/wiki/Key:height', 'https://wiki.openstreetmap.org/wiki/Key:building:levels']},
            'heightPolicy': {'units': 'metres above ground, including roof', 'levels': 'Inferred: 3.2 metres per mapped building level plus 2.6 metres per mapped roof level.',
                             'fallback': 'Inferred: 8 metres where neither height nor building:levels is mapped, added above min_height for an elevated part.',
                             'minHeight': 'Mapped min_height or inferred 3.2 metres per building:min_level.',
                             'appearance': 'Approximate facade and roof materials; roofs may be simplified. Footprints and mapped building parts retain their source geometry.'},
            'statistics': {'features': len(kept), 'parts': sum(bool(f.get('part')) for f in kept), 'courtyardHoles': sum(len(f['rings']) - 1 for f in kept),
                           'heightSources': dict(collections.Counter(f['heightSource'] for f in kept)), 'supersededOutlines': len(suppressed) + removed, 'skippedUnclosedGeometry': skipped},
            'features': kept}


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    output = Path(__file__).resolve().parents[1] / 'data/lszh/buildings.json'
    result = bake(sys.argv[1:])
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({'path': str(output), 'bytes': output.stat().st_size, **result['statistics']}, ensure_ascii=False))
