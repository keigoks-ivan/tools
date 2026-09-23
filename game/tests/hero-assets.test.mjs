import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const runtimeRoot = new URL('../assets/runtime/', import.meta.url);
const heroesRoot = new URL('../assets/heroes/', import.meta.url);
const heroKeys = ['rumi', 'mira', 'zoey'];

test('hero GLBs retain Maria animation tracks and the shared animated rig', async () => {
  const source = await parseAsset(await readFile(fileURLToPath(new URL('maria.glb', runtimeRoot))));
  const clipSignature = clips => clips.map(clip => [clip.name, clip.tracks.map(track => track.name)]);
  const expectedClips = clipSignature(source.animations);
  assert.equal(expectedClips.length, 13);

  for (const key of heroKeys) {
    const bytes = await readFile(fileURLToPath(new URL(`${key}.glb`, heroesRoot)));
    const rawJson = readGlbJson(bytes);
    assert.ok(bytes.length < 2 * 1024 * 1024, `${key}: model exceeds 2 MiB budget`);
    assert.equal((rawJson.images || []).length, 0, `${key}: unexpected decoded image cost`);
    assert.doesNotMatch(JSON.stringify(rawJson), /transformData/, `${key}: stale FBX metadata`);
    const hero = await parseAsset(bytes);
    assert.deepEqual(clipSignature(hero.animations), expectedClips, `${key}: source animation tracks changed`);

    const meshes = [];
    hero.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
    assert.equal(meshes.length, 4, `${key}: expected four merged skinned surfaces`);
    assert.ok(meshes.every(mesh => mesh.isSkinnedMesh), `${key}: every surface must deform with the rig`);
    const bones = meshes[0].skeleton.bones;
    const boneNames = new Set(bones.map(bone => bone.name));
    for (const name of ['mixamorigHips', 'mixamorigHead', 'mixamorigRightHand']) {
      assert.ok(boneNames.has(name), `${key}: missing ${name}`);
    }
    for (const mesh of meshes) {
      assert.deepEqual(mesh.skeleton.bones.map(bone => bone.name), bones.map(bone => bone.name),
        `${key}/${mesh.name}: bone order differs from shared rig`);
      const geometry = mesh.geometry;
      assert.ok(geometry.attributes.position && geometry.attributes.normal && geometry.attributes.color,
        `${key}/${mesh.name}: missing core vertex attributes`);
      assert.ok(geometry.attributes.skinIndex && geometry.attributes.skinWeight,
        `${key}/${mesh.name}: not exported with skinning attributes`);
      assert.ok(geometry.index, `${key}/${mesh.name}: geometry should stay indexed`);
      const indices = geometry.attributes.skinIndex;
      const weights = geometry.attributes.skinWeight;
      let covered = 0;
      for (let vertex = 0; vertex < weights.count; vertex++) {
        let sum = 0;
        for (let lane = 0; lane < 4; lane++) {
          const weight = weights.getComponent(vertex, lane);
          sum += weight;
          if (weight > 1e-5) {
            assert.ok(indices.getComponent(vertex, lane) < bones.length, `${key}: skin index outside rig`);
            covered++;
          }
        }
        assert.ok(sum > 0.98 && sum < 1.02, `${key}/${mesh.name}: vertex ${vertex} weights sum to ${sum}`);
      }
      assert.ok(covered >= weights.count, `${key}/${mesh.name}: vertices lack bone influence`);
    }

    const body = meshes.find(mesh => /body/i.test(mesh.name)) || meshes[0];
    const point = new THREE.Vector3();
    body.getVertexPosition(0, point);
    const before = point.clone();
    const slash = hero.animations.find(clip => clip.name === 'slash1');
    const mixer = new THREE.AnimationMixer(hero.scene);
    mixer.clipAction(slash).play();
    mixer.update(Math.min(0.2, slash.duration * 0.4));
    hero.scene.updateMatrixWorld(true);
    body.skeleton.update();
    body.getVertexPosition(0, point);
    assert.ok(point.distanceTo(before) > 1e-5, `${key}: slash animation did not deform the skinned body`);
    // Sample every action through its duration: a valid export must not explode
    // or detach a surface even though the GLB parses and the idle pose looks right.
    for (const clip of hero.animations) {
      mixer.stopAllAction();
      mixer.clipAction(clip).reset().play();
      for (const fraction of [0, .25, .5, .75, .98]) {
        mixer.setTime(clip.duration * fraction);
        hero.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3();
        for (const mesh of meshes) {
          mesh.skeleton.update();
          for (let i = 0; i < mesh.geometry.attributes.position.count; i += 11) {
            mesh.getVertexPosition(i, point);
            assert.ok([point.x, point.y, point.z].every(Number.isFinite), `${key}/${clip.name}: invalid posed vertex`);
            bounds.expandByPoint(point);
          }
        }
        const extent = bounds.getSize(new THREE.Vector3());
        assert.ok(Math.max(extent.x, extent.y, extent.z) < 500, `${key}/${clip.name}: detached geometry`);
      }
    }
  }
});

async function parseAsset(buffer) {
  const stripped = stripImages(buffer);
  const arrayBuffer = stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength);
  return new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer, '', resolve, reject));
}

function readGlbJson(buffer) {
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset < bytes.length) {
    const size = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === 0x4e4f534a) return JSON.parse(new TextDecoder().decode(bytes.slice(offset + 8, offset + 8 + size)));
    offset += 8 + size;
  }
  throw new Error('Missing GLB JSON chunk');
}

function stripImages(input) {
  const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  let offset = 12;
  while (offset < bytes.length) {
    const size = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    chunks.push({ type, data: bytes.slice(offset + 8, offset + 8 + size) });
    offset += 8 + size;
  }
  const jsonChunk = chunks.find(chunk => chunk.type === 0x4e4f534a);
  assert.ok(jsonChunk, 'GLB JSON chunk');
  const json = JSON.parse(new TextDecoder().decode(jsonChunk.data));
  json.images = [];
  json.textures = [];
  json.samplers = [];
  json.extensionsUsed = (json.extensionsUsed || []).filter(name => name !== 'EXT_texture_webp');
  json.extensionsRequired = (json.extensionsRequired || []).filter(name => name !== 'EXT_texture_webp');
  for (const material of json.materials || []) stripTextureProperties(material);
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array((encoded.length + 3) & ~3).fill(0x20);
  padded.set(encoded);
  chunks[chunks.indexOf(jsonChunk)] = { type: jsonChunk.type, data: padded };
  const length = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const result = new Uint8Array(length);
  const outputView = new DataView(result.buffer);
  outputView.setUint32(0, 0x46546c67, true);
  outputView.setUint32(4, 2, true);
  outputView.setUint32(8, length, true);
  offset = 12;
  for (const chunk of chunks) {
    outputView.setUint32(offset, chunk.data.length, true);
    outputView.setUint32(offset + 4, chunk.type, true);
    result.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return result;
}

function stripTextureProperties(value) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (/texture$/i.test(key)) delete value[key];
    else stripTextureProperties(value[key]);
  }
}
