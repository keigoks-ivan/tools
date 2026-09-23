"""Package HUNTR/X GLBs without unused animations or the discarded hero normal map.

No geometry, animation samples or image pixels are resampled. Source GLBs remain
in assets/; generated files live in assets/runtime/. No browser or GPU is used.
"""
import argparse
import copy
import json
from pathlib import Path
import re
import struct

GAME = Path(__file__).resolve().parents[1]
ASSETS = GAME / 'assets'
ENEMIES = ['Skeleton_Minion', 'Skeleton_Warrior', 'Barbarian', 'Knight', 'Rogue']


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', data)
    assert (magic, version, length) == (b'glTF', 2, len(data))
    size, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(data[20:20 + size])
    offset = 20 + size
    size, kind = struct.unpack_from('<II', data, offset)
    assert kind == 0x004E4942 and offset + 8 + size == len(data)
    assert not doc.get('extensionsUsed'), 'Audit extension references before packing'
    assert len(doc['buffers']) == 1 and 'uri' not in doc['buffers'][0]
    return doc, data[offset + 8:offset + 8 + size]


def write_glb(doc, binary):
    encoded = json.dumps(doc, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary += b'\0' * (-len(binary) % 4)
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
            + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
            + struct.pack('<II', len(binary), 0x004E4942) + binary)


def accessor_slots(doc):
    """Yield all accessor references in the supported, extension-free assets."""
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            for key in primitive['attributes']:
                yield primitive['attributes'], key
            if 'indices' in primitive:
                yield primitive, 'indices'
            for target in primitive.get('targets', []):
                for key in target:
                    yield target, key
    for skin in doc.get('skins', []):
        if 'inverseBindMatrices' in skin:
            yield skin, 'inverseBindMatrices'
    for animation in doc.get('animations', []):
        for sampler in animation['samplers']:
            yield sampler, 'input'
            yield sampler, 'output'


def view_slots(doc):
    for accessor in doc.get('accessors', []):
        if 'bufferView' in accessor:
            yield accessor, 'bufferView'
        if 'sparse' in accessor:
            yield accessor['sparse']['indices'], 'bufferView'
            yield accessor['sparse']['values'], 'bufferView'
    for image in doc.get('images', []):
        yield image, 'bufferView'


def texture_slots(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith('Texture') and isinstance(item, dict) and 'index' in item:
                yield item, 'index'
            else:
                yield from texture_slots(item)
    elif isinstance(value, list):
        for item in value:
            yield from texture_slots(item)


def select_entries(doc, collection, slots):
    slots = list(slots)
    selected = sorted({obj[key] for obj, key in slots})
    remap = {old: new for new, old in enumerate(selected)}
    doc[collection] = [doc[collection][old] for old in selected]
    for obj, key in slots:
        obj[key] = remap[obj[key]]


def pack(source, binary, *, keep_animations=None, drop_normal=False):
    doc = copy.deepcopy(source)
    if keep_animations is not None:
        doc['animations'] = [clip for clip in doc['animations'] if clip['name'] in keep_animations]
    if drop_normal:
        for material in doc['materials']:
            material.pop('normalTexture', None)
    select_entries(doc, 'textures', texture_slots(doc.get('materials', [])))
    select_entries(doc, 'images', ((tex, 'source') for tex in doc['textures']))
    select_entries(doc, 'samplers', ((tex, 'sampler') for tex in doc['textures'] if 'sampler' in tex))
    select_entries(doc, 'accessors', accessor_slots(doc))
    select_entries(doc, 'bufferViews', view_slots(doc))
    packed = bytearray()
    for view in doc['bufferViews']:
        assert view['buffer'] == 0
        offset, length = view.get('byteOffset', 0), view['byteLength']
        assert offset + length <= len(binary)
        payload = binary[offset:offset + length]
        packed.extend(b'\0' * (-len(packed) % 4))
        view['byteOffset'] = len(packed)
        packed.extend(payload)
    doc['buffers'][0]['byteLength'] = len(packed)
    return doc, bytes(packed)


def enemy_animations():
    text = (GAME / 'main.js').read_text()
    body = re.search(r'const E_ANIMS = \[(.*?)\];', text, re.S).group(1)
    return set(re.findall(r"'([^']+)'", body))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='verify generated assets are current without writing')
    args = parser.parse_args()
    target = ASSETS / 'runtime'
    if not args.check:
        target.mkdir(exist_ok=True)
    for name in ['maria', *ENEMIES]:
        source, binary = read_glb(ASSETS / f'{name}.glb')
        optimized, payload = pack(source, binary,
                                  keep_animations=enemy_animations() if name in ENEMIES else None,
                                  drop_normal=name == 'maria')
        result = write_glb(optimized, payload)
        output = target / f'{name}.glb'
        if args.check:
            assert output.read_bytes() == result, f'Regenerate {output}'
        else:
            output.write_bytes(result)
        before = (ASSETS / f'{name}.glb').stat().st_size
        print(f'{name}: {before:,} -> {len(result):,} bytes; '
              f'animations {len(source["animations"])} -> {len(optimized["animations"])}')


if __name__ == '__main__':
    main()
