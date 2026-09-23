"""Static integrity checks for the generated runtime GLB assets."""
import copy
import json
from pathlib import Path
import re
import struct
import unittest


GAME = Path(__file__).resolve().parents[1]
ASSETS = GAME / 'assets'
RUNTIME = ASSETS / 'runtime'
ENEMIES = ('Skeleton_Minion', 'Skeleton_Warrior', 'Barbarian', 'Knight', 'Rogue')
COMPONENT_BYTES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COMPONENTS = {
    'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4,
    'MAT2': 4, 'MAT3': 9, 'MAT4': 16,
}


def read_glb(path):
    data = path.read_bytes()
    if len(data) < 20:
        raise AssertionError(f'{path} is too short to be a GLB')
    magic, version, declared_length = struct.unpack_from('<4sII', data)
    if (magic, version, declared_length) != (b'glTF', 2, len(data)):
        raise AssertionError(f'{path} has an invalid GLB header')
    json_size, json_kind = struct.unpack_from('<II', data, 12)
    if json_kind != 0x4E4F534A or 20 + json_size + 8 > len(data):
        raise AssertionError(f'{path} has an invalid JSON chunk')
    doc = json.loads(data[20:20 + json_size].decode('utf-8').rstrip(' \0'))
    bin_header = 20 + json_size
    bin_size, bin_kind = struct.unpack_from('<II', data, bin_header)
    if bin_kind != 0x004E4942 or bin_header + 8 + bin_size != len(data):
        raise AssertionError(f'{path} has an invalid BIN chunk')
    binary = data[bin_header + 8:bin_header + 8 + bin_size]
    return doc, binary


def accessor_metadata(accessor):
    """Fields that describe values rather than their repacked storage location."""
    return {key: value for key, value in accessor.items()
            if key not in ('bufferView', 'byteOffset', 'sparse')}


def _read_view_bytes(doc, binary, view_index, local_offset, size):
    view = doc['bufferViews'][view_index]
    if view.get('buffer', 0) != 0:
        raise AssertionError('Unexpected external or secondary buffer')
    start = view.get('byteOffset', 0) + local_offset
    end = start + size
    if local_offset < 0 or end > view.get('byteOffset', 0) + view['byteLength']:
        raise AssertionError(f'Buffer view {view_index} read exceeds its bounds')
    if end > len(binary):
        raise AssertionError(f'Buffer view {view_index} exceeds the BIN chunk')
    return binary[start:end]


def accessor_bytes(doc, binary, accessor_index):
    """Return tightly packed logical accessor elements, resolving stride/sparse data."""
    accessor = doc['accessors'][accessor_index]
    element_size = (COMPONENT_BYTES[accessor['componentType']]
                    * TYPE_COMPONENTS[accessor['type']])
    count = accessor['count']
    dense = bytearray(count * element_size)
    if 'bufferView' in accessor:
        view = doc['bufferViews'][accessor['bufferView']]
        stride = view.get('byteStride', element_size)
        if stride < element_size:
            raise AssertionError(f'Accessor {accessor_index} has an invalid stride')
        for element in range(count):
            dense[element * element_size:(element + 1) * element_size] = _read_view_bytes(
                doc, binary, accessor['bufferView'],
                accessor.get('byteOffset', 0) + element * stride, element_size)

    sparse = accessor.get('sparse')
    if sparse:
        sparse_count = sparse['count']
        indices = sparse['indices']
        index_size = COMPONENT_BYTES[indices['componentType']]
        raw_indices = _read_view_bytes(
            doc, binary, indices['bufferView'], indices.get('byteOffset', 0),
            sparse_count * index_size)
        values = sparse['values']
        raw_values = _read_view_bytes(
            doc, binary, values['bufferView'], values.get('byteOffset', 0),
            sparse_count * element_size)
        for i in range(sparse_count):
            index = int.from_bytes(raw_indices[i * index_size:(i + 1) * index_size], 'little')
            if index >= count:
                raise AssertionError(f'Sparse accessor {accessor_index} index is out of range')
            dense[index * element_size:(index + 1) * element_size] = raw_values[
                i * element_size:(i + 1) * element_size]
    return bytes(dense)


def assert_accessor_equal(test, before, before_bin, before_index,
                          after, after_bin, after_index):
    test.assertEqual(accessor_metadata(before['accessors'][before_index]),
                     accessor_metadata(after['accessors'][after_index]))
    test.assertEqual(accessor_bytes(before, before_bin, before_index),
                     accessor_bytes(after, after_bin, after_index))


def mesh_data(test, before, before_bin, after, after_bin):
    test.assertEqual(len(before.get('meshes', [])), len(after.get('meshes', [])))
    for old_mesh, new_mesh in zip(before.get('meshes', []), after.get('meshes', [])):
        old_base, new_base = copy.deepcopy(old_mesh), copy.deepcopy(new_mesh)
        test.assertEqual(len(old_base['primitives']), len(new_base['primitives']))
        for old_prim, new_prim in zip(old_base['primitives'], new_base['primitives']):
            for field in ('attributes', 'indices', 'targets'):
                old_refs = old_prim.pop(field, None)
                new_refs = new_prim.pop(field, None)
                test.assertEqual(old_refs is None, new_refs is None)
                if field == 'attributes' and old_refs is not None:
                    test.assertEqual(old_refs.keys(), new_refs.keys())
                    for name in old_refs:
                        assert_accessor_equal(test, before, before_bin, old_refs[name],
                                              after, after_bin, new_refs[name])
                elif field == 'indices' and old_refs is not None:
                    assert_accessor_equal(test, before, before_bin, old_refs,
                                          after, after_bin, new_refs)
                elif field == 'targets' and old_refs is not None:
                    test.assertEqual(len(old_refs), len(new_refs))
                    for old_target, new_target in zip(old_refs, new_refs):
                        test.assertEqual(old_target.keys(), new_target.keys())
                        for name in old_target:
                            assert_accessor_equal(test, before, before_bin, old_target[name],
                                                  after, after_bin, new_target[name])
        test.assertEqual(old_base, new_base)


def skin_data(test, before, before_bin, after, after_bin):
    old_skins, new_skins = before.get('skins', []), after.get('skins', [])
    test.assertEqual(len(old_skins), len(new_skins))
    for old, new in zip(old_skins, new_skins):
        old_base, new_base = copy.deepcopy(old), copy.deepcopy(new)
        old_accessor = old_base.pop('inverseBindMatrices', None)
        new_accessor = new_base.pop('inverseBindMatrices', None)
        test.assertEqual(old_base, new_base)
        test.assertEqual(old_accessor is None, new_accessor is None)
        if old_accessor is not None:
            assert_accessor_equal(test, before, before_bin, old_accessor,
                                  after, after_bin, new_accessor)


def image_bytes(doc, binary, image_index):
    image = doc['images'][image_index]
    view = doc['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    end = start + view['byteLength']
    if view.get('buffer', 0) != 0 or end > len(binary):
        raise AssertionError(f'Image {image_index} is outside the BIN chunk')
    return image.get('mimeType'), binary[start:end]


def texture_fingerprint(doc, binary, texture_index):
    texture = doc['textures'][texture_index]
    mime, payload = image_bytes(doc, binary, texture['source'])
    sampler = doc.get('samplers', [])[texture['sampler']] if 'sampler' in texture else None
    return sampler, mime, payload


def texture_refs(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key.endswith('Texture') and isinstance(child, dict) and 'index' in child:
                yield child, 'index'
            else:
                yield from texture_refs(child)
    elif isinstance(value, list):
        for child in value:
            yield from texture_refs(child)


def normalized_materials(doc, binary, *, ignore_normal=False):
    materials = copy.deepcopy(doc.get('materials', []))
    for material in materials:
        if ignore_normal:
            material.pop('normalTexture', None)
        for ref, key in texture_refs(material):
            ref[key] = texture_fingerprint(doc, binary, ref[key])
    return materials


def base_color_pngs(doc, binary):
    result = []
    for material in doc.get('materials', []):
        info = material.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if info:
            result.append(image_bytes(doc, binary,
                                      doc['textures'][info['index']]['source']))
    return result


def e_anims():
    source = (GAME / 'main.js').read_text(encoding='utf-8')
    match = re.search(r'const E_ANIMS = \[(.*?)\];', source, re.S)
    if not match:
        raise AssertionError('Could not find E_ANIMS in main.js')
    return set(re.findall(r"'([^']+)'", match.group(1)))


def animation_structure(animations):
    """Keep channel targets and sampler options while excluding remapped accessor IDs."""
    normalized = []
    for clip in animations:
        normalized.append({
            'name': clip.get('name'),
            'channels': copy.deepcopy(clip['channels']),
            'samplers': [{key: value for key, value in sampler.items()
                          if key not in ('input', 'output')}
                         for sampler in clip['samplers']],
        })
    return normalized


def compare_animations(test, before, before_bin, after, after_bin, expected_names):
    expected = [clip for clip in before.get('animations', [])
                if clip.get('name') in expected_names]
    test.assertEqual([clip.get('name') for clip in after.get('animations', [])],
                     [clip.get('name') for clip in expected])
    test.assertEqual(animation_structure(expected),
                     animation_structure(after.get('animations', [])))
    for old_clip, new_clip in zip(expected, after.get('animations', [])):
        test.assertEqual(len(old_clip['samplers']), len(new_clip['samplers']))
        for old_sampler, new_sampler in zip(old_clip['samplers'], new_clip['samplers']):
            for field in ('input', 'output'):
                assert_accessor_equal(test, before, before_bin, old_sampler[field],
                                      after, after_bin, new_sampler[field])


def assert_references_in_bounds(test, doc, binary):
    buffer_length = doc['buffers'][0]['byteLength']
    test.assertLessEqual(buffer_length, len(binary))
    for index, view in enumerate(doc.get('bufferViews', [])):
        start, length = view.get('byteOffset', 0), view['byteLength']
        test.assertEqual(view.get('buffer', 0), 0)
        test.assertGreaterEqual(start, 0)
        test.assertLessEqual(start + length, buffer_length,
                             f'bufferView {index} exceeds declared buffer')
        test.assertLessEqual(start + length, len(binary),
                             f'bufferView {index} exceeds the BIN chunk')

    for index, accessor in enumerate(doc.get('accessors', [])):
        test.assertIn(accessor['componentType'], COMPONENT_BYTES)
        test.assertIn(accessor['type'], TYPE_COMPONENTS)
        if 'bufferView' in accessor:
            test.assertLess(accessor['bufferView'], len(doc['bufferViews']))
            view = doc['bufferViews'][accessor['bufferView']]
            stride = view.get('byteStride', COMPONENT_BYTES[accessor['componentType']]
                              * TYPE_COMPONENTS[accessor['type']])
            end = accessor.get('byteOffset', 0)
            if accessor['count']:
                end += (accessor['count'] - 1) * stride
                end += COMPONENT_BYTES[accessor['componentType']] * TYPE_COMPONENTS[accessor['type']]
            test.assertLessEqual(end, view['byteLength'],
                                 f'accessor {index} exceeds its bufferView')
        sparse = accessor.get('sparse')
        if sparse:
            test.assertLessEqual(sparse['count'], accessor['count'])
            for key in ('indices', 'values'):
                test.assertLess(sparse[key]['bufferView'], len(doc['bufferViews']))

    for index, image in enumerate(doc.get('images', [])):
        test.assertLess(image['bufferView'], len(doc['bufferViews']),
                        f'image {index} references a missing bufferView')
        image_bytes(doc, binary, index)
    for index, texture in enumerate(doc.get('textures', [])):
        if 'source' in texture:
            test.assertLess(texture['source'], len(doc.get('images', [])))
        if 'sampler' in texture:
            test.assertLess(texture['sampler'], len(doc.get('samplers', [])))
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            if 'material' in primitive:
                test.assertLess(primitive['material'], len(doc.get('materials', [])))
            refs = list(primitive.get('attributes', {}).values())
            if 'indices' in primitive:
                refs.append(primitive['indices'])
            refs.extend(ref for target in primitive.get('targets', [])
                        for ref in target.values())
            for ref in refs:
                test.assertLess(ref, len(doc.get('accessors', [])))
    for skin in doc.get('skins', []):
        for joint in skin['joints']:
            test.assertLess(joint, len(doc.get('nodes', [])))
        if 'skeleton' in skin:
            test.assertLess(skin['skeleton'], len(doc.get('nodes', [])))
        if 'inverseBindMatrices' in skin:
            test.assertLess(skin['inverseBindMatrices'], len(doc.get('accessors', [])))
    for node in doc.get('nodes', []):
        if 'mesh' in node:
            test.assertLess(node['mesh'], len(doc.get('meshes', [])))
        if 'skin' in node:
            test.assertLess(node['skin'], len(doc.get('skins', [])))
        if 'camera' in node:
            test.assertLess(node['camera'], len(doc.get('cameras', [])))
        for child in node.get('children', []):
            test.assertLess(child, len(doc.get('nodes', [])))
    for scene in doc.get('scenes', []):
        for node in scene.get('nodes', []):
            test.assertLess(node, len(doc.get('nodes', [])))
    for animation in doc.get('animations', []):
        for sampler in animation['samplers']:
            test.assertLess(sampler['input'], len(doc.get('accessors', [])))
            test.assertLess(sampler['output'], len(doc.get('accessors', [])))
        for channel in animation['channels']:
            test.assertLess(channel['sampler'], len(animation['samplers']))
            test.assertLess(channel['target']['node'], len(doc.get('nodes', [])))
    for material in doc.get('materials', []):
        for ref, _ in texture_refs(material):
            test.assertLess(ref['index'], len(doc.get('textures', [])))


class RuntimeAssetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.enemy_names = e_anims()

    def compare_common_scene_data(self, before, before_bin, after, after_bin,
                                  *, ignore_normal=False):
        self.assertEqual(before.get('nodes', []), after.get('nodes', []))
        self.assertEqual(before.get('scenes', []), after.get('scenes', []))
        self.assertEqual(before.get('scene'), after.get('scene'))
        mesh_data(self, before, before_bin, after, after_bin)
        skin_data(self, before, before_bin, after, after_bin)
        self.assertEqual(normalized_materials(before, before_bin, ignore_normal=ignore_normal),
                         normalized_materials(after, after_bin, ignore_normal=ignore_normal))

    def test_enemy_geometry_rig_materials_and_referenced_animations_are_preserved(self):
        for name in ENEMIES:
            with self.subTest(asset=name):
                before, before_bin = read_glb(ASSETS / f'{name}.glb')
                after, after_bin = read_glb(RUNTIME / f'{name}.glb')
                assert_references_in_bounds(self, after, after_bin)
                self.compare_common_scene_data(before, before_bin, after, after_bin)
                expected_names = self.enemy_names & {
                    clip.get('name') for clip in before.get('animations', [])
                }
                compare_animations(self, before, before_bin, after, after_bin,
                                   expected_names)

    def test_maria_keeps_all_animations_geometry_and_base_color_pngs(self):
        before, before_bin = read_glb(ASSETS / 'maria.glb')
        after, after_bin = read_glb(RUNTIME / 'maria.glb')
        assert_references_in_bounds(self, after, after_bin)
        self.compare_common_scene_data(before, before_bin, after, after_bin,
                                       ignore_normal=True)
        compare_animations(self, before, before_bin, after, after_bin,
                           {clip.get('name') for clip in before.get('animations', [])})

        self.assertTrue(any('normalTexture' in material
                            for material in before.get('materials', [])))
        self.assertTrue(all('normalTexture' not in material
                            for material in after.get('materials', [])))
        source_pngs = base_color_pngs(before, before_bin)
        runtime_pngs = base_color_pngs(after, after_bin)
        self.assertTrue(source_pngs, 'Maria should have base-color PNG textures')
        self.assertEqual(source_pngs, runtime_pngs)
        for mime, payload in runtime_pngs:
            self.assertEqual(mime, 'image/png')
            self.assertGreaterEqual(len(payload), 24)
            self.assertEqual(payload[:8], b'\x89PNG\r\n\x1a\n')
            width, height = struct.unpack('>II', payload[16:24])
            self.assertGreater(width, 0)
            self.assertGreater(height, 0)


if __name__ == '__main__':
    unittest.main()
