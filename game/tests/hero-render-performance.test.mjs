import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { indexGeometry } from '../3d-next/index-geometry.js';
import { createHeroArt } from '../3d-next/hero-art.js';
import { HEROES } from '../3d-next/heroes.js';

test('indexing preserves every triangle attribute, including UV seams and skin weights', () => {
  const geometry = new T.BoxGeometry().toNonIndexed();
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(new Uint16Array(count * 4).fill(3), 4));
  geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(new Float32Array(count * 4).fill(0.25), 4));
  // A skin-weight difference must keep otherwise identical vertices separate.
  geometry.attributes.skinWeight.setX(3, 0.5);
  geometry.addGroup(0, 12, 2); geometry.setDrawRange(3, 27);
  const compact = indexGeometry(geometry);
  assert.ok(compact.attributes.position.count < count);
  assert.equal(compact.index.count, count);
  assert.deepEqual(compact.groups, geometry.groups);
  assert.deepEqual(compact.drawRange, geometry.drawRange);
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const other = compact.attributes[name];
    for (let i = 0; i < count; i++) for (let k = 0; k < attribute.itemSize; k++) {
      assert.ok(Object.is(attribute.array[i * attribute.itemSize + k], other.array[compact.index.getX(i) * other.itemSize + k]), `${name}/${i}/${k}`);
    }
  }
  assert.equal(indexGeometry(compact), compact, 'already-indexed source is reused');
  geometry.morphAttributes.position = [geometry.attributes.position.clone()];
  assert.equal(indexGeometry(geometry), geometry, 'source morph data must remain intact');
});

test('polearm art preserves the original weapon mount across 75 legacy authored poses', async () => {
  // Golden world matrices were captured from f6db9a0 with the original solver;
  // includes every source animation at 10%, 50%, 90% under nonuniform root scale.
  globalThis.ProgressEvent = class { constructor(type, init) { Object.assign(this, { type }, init); } };
  const bytes = await readFile(new URL('../assets/heroes/swordswoman-v4.glb', import.meta.url));
  const size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size).toString());
  const strip = value => {
    for (const key of Object.keys(value)) {
      if (/texture$/i.test(key)) delete value[key];
      else if (value[key] && typeof value[key] === 'object') strip(value[key]);
    }
  };
  for (const material of json.materials) strip(material);
  json.images = []; json.textures = [];
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + size).toString('base64')}`;
  const source = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
  const root = source.scene, art = createHeroArt(T, root, root.getObjectByName('Hero_sword'));
  art.apply(HEROES.azure);
  const mixer = new T.AnimationMixer(root);
  root.position.set(0.7, 0.3, -1.2); root.rotation.set(0.1, 0.7, -0.03); root.scale.set(0.9, 1.15, 1.05);
  const poses = JSON.parse(await readFile(new URL('fixtures/azure-grip-20261002.json', import.meta.url), 'utf8'));
  for (const pose of poses) {
    mixer.stopAllAction(); mixer.clipAction(source.animations.find(clip => clip.name === pose.clip)).reset().play();
    mixer.update(pose.time); art.update(); root.updateMatrixWorld(true);
    for (const [name, expected] of Object.entries(pose.matrices)) {
      if (name !== 'azure_J_Bip_R_Hand_weapon') continue;
      const actual = root.getObjectByName(name).matrixWorld.elements;
      for (let i = 0; i < 16; i++) assert.ok(Math.abs(actual[i] - expected[i]) < 1e-8, `${pose.clip}/${pose.time}/${name}/${i}`);
    }
  }
  art.dispose();
});
