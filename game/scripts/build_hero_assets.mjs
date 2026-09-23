#!/usr/bin/env node
// Build small, image-free heroine GLBs from the runtime Maria rig.
// Run: node --experimental-default-type=module --loader ./game/tests/three-loader.mjs game/scripts/build_hero_assets.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from '../lib/addons/exporters/GLTFExporter.js';
import { buildAnimeHero } from '../hero-model.js';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = path.join(rootDir, 'assets/runtime/maria.glb');
const outputDir = path.join(rootDir, 'assets/heroes');
const EXPECTED_CLIPS = ['idle', 'run', 'slash1', 'slash2', 'slash3', 'slash4', 'heavy', 'heavyfin', 'hurt', 'death', 'jump', 'win', 'roll'];
const HERO_KEYS = ['rumi', 'mira', 'zoey'];

// GLTFExporter only needs FileReader for image/data-URL conversion. Our models
// deliberately have no image textures, but this shim keeps the vendored API
// usable in Node and gives a clear failure if image use is added accidentally.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(value => {
        this.result = value;
        const event = { target: this };
        this.onload?.(event);
        this.onloadend?.(event);
      }, error => this.onerror?.(error));
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then(value => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(value).toString('base64')}`;
        const event = { target: this };
        this.onload?.(event);
        this.onloadend?.(event);
      }, error => this.onerror?.(error));
    }
  };
}

await mkdir(outputDir, { recursive: true });
const sourceBytes = await readFile(sourcePath);

for (const key of HERO_KEYS) {
  // Reload clean source state per model to keep peak memory bounded and avoid
  // one generated hero or its skeleton affecting the next export.
  const { gltf: fresh } = await parseWithoutImages(sourceBytes);
  const scene = fresh.scene;
  const clips = fresh.animations;
  assert.deepEqual(clips.map(clip => clip.name), EXPECTED_CLIPS);
  const stats = buildAnimeHero(scene, key);
  scene.traverse(object => stripTransformData(object.userData));
  for (const clip of clips) stripTransformData(clip.userData);
  scene.updateMatrixWorld(true);

  const exported = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    animations: clips,
    onlyVisible: true,
    trs: true,
  });
  assert.ok(exported instanceof ArrayBuffer || ArrayBuffer.isView(exported), 'exporter did not return binary GLB');
  const bytes = exported instanceof ArrayBuffer
    ? new Uint8Array(exported)
    : new Uint8Array(exported.buffer, exported.byteOffset, exported.byteLength);
  const cleaned = removeFBXtransformData(bytes);

  // Reload the emitted file with image fetching omitted. This verifies the
  // actual serialized rig, all source clips and each visible skinned part.
  const { gltf: check } = await parseWithoutImages(cleaned);
  assert.deepEqual(check.animations.map(clip => clip.name), EXPECTED_CLIPS, `${key}: animation clips changed`);
  const skinned = [];
  check.scene.traverse(object => { if (object.isSkinnedMesh) skinned.push(object); });
  assert.ok(skinned.length >= 4, `${key}: expected body, hair, details and weapon skinned meshes`);
  const visibleBoneNames = new Set();
  for (const mesh of skinned) {
    assert.ok(mesh.skeleton, `${key}: exported mesh lost skeleton`);
    for (const bone of mesh.skeleton.bones) visibleBoneNames.add(bone.name);
  }
  for (const bone of ['mixamorigHips', 'mixamorigHead', 'mixamorigRightHand']) {
    assert.ok(visibleBoneNames.has(bone), `${key}: missing required animated bone ${bone}`);
  }
  assert.ok(bytes.byteLength < 2 * 1024 * 1024, `${key}: GLB is over 2 MiB (${bytes.byteLength})`);
  const destination = path.join(outputDir, `${key}.glb`);
  await writeFile(destination, cleaned);
  console.log(`${key}: ${(cleaned.byteLength / 1048576).toFixed(2)} MiB, ${skinned.length} skinned meshes, ${check.animations.length} clips${stats?.vertices ? `, ${stats.vertices} vertices` : ''} → ${destination}`);
}

async function parseWithoutImages(bytes) {
  const stripped = stripImageReferences(bytes);
  const arrayBuffer = stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength);
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });
  return { gltf };
}

function stripImageReferences(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67, 'input GLB magic');
  assert.equal(view.getUint32(4, true), 2, 'input GLB version');
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
  const output = new Uint8Array(length);
  const outputView = new DataView(output.buffer);
  outputView.setUint32(0, 0x46546c67, true);
  outputView.setUint32(4, 2, true);
  outputView.setUint32(8, length, true);
  offset = 12;
  for (const chunk of chunks) {
    outputView.setUint32(offset, chunk.data.length, true);
    outputView.setUint32(offset + 4, chunk.type, true);
    output.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}

function stripTextureProperties(value) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (/texture$/i.test(key)) delete value[key];
    else stripTextureProperties(value[key]);
  }
}

function stripTransformData(value) {
  if (!value || typeof value !== 'object') return;
  delete value.transformData;
  for (const child of Object.values(value)) stripTransformData(child);
}

function removeFBXtransformData(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
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
  assert.ok(jsonChunk, 'exported GLB JSON chunk');
  const json = JSON.parse(new TextDecoder().decode(jsonChunk.data));
  stripTransformData(json);
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array((encoded.length + 3) & ~3).fill(0x20);
  padded.set(encoded);
  chunks[chunks.indexOf(jsonChunk)] = { type: jsonChunk.type, data: padded };
  const length = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const output = new Uint8Array(length);
  const outputView = new DataView(output.buffer);
  outputView.setUint32(0, 0x46546c67, true);
  outputView.setUint32(4, 2, true);
  outputView.setUint32(8, length, true);
  offset = 12;
  for (const chunk of chunks) {
    outputView.setUint32(offset, chunk.data.length, true);
    outputView.setUint32(offset + 4, chunk.type, true);
    output.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}
