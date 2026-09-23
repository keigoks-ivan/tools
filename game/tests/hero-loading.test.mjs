import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const mainSource = await readFile(new URL('../main.js', import.meta.url), 'utf8');

function functionSource(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(mainSource);
  assert.ok(match, `missing ${name} in main.js`);
  const start = match.index;
  let depth = 0;
  let quote = null;
  let escaped = false;
  let brace = -1;
  for (let index = mainSource.indexOf('(', start); index < mainSource.length; index++) {
    const character = mainSource[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') { quote = character; continue; }
    if (character === '{' && brace < 0) { brace = index; depth = 1; continue; }
    if (brace < 0) continue;
    if (character === '{') depth++;
    if (character === '}' && --depth === 0) return mainSource.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function makeAsset(key = 'rumi') {
  const root = new THREE.Group();
  root.userData.heroModel = key;
  const nested = new THREE.Group();
  nested.userData.heroModel = key;
  root.add(nested);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  nested.add(mesh);
  return { scene: root, animations: [] };
}

function makeLoaderHarness(loadAsync) {
  const context = vm.createContext({
    loader: { loadAsync },
    prepHeroModel(gltf) { return { scene: gltf.scene, clips: gltf.animations, authored: true }; },
    CHARS: { rumi: { name: 'Rumi' }, mira: { name: 'Mira' }, zoey: { name: 'Zoey' } },
  });
  const source = `const heroAssets = new Map();\n${functionSource('loadHeroAsset')}\nthis.api = { loadHeroAsset, heroAssets };`;
  vm.runInContext(source, context);
  return context.api;
}

test('loadHeroAsset shares same-key in-flight requests and keeps the prepared cache', async () => {
  const pending = deferred();
  const calls = [];
  const api = makeLoaderHarness(path => { calls.push(path); return pending.promise; });
  const first = api.loadHeroAsset('rumi');
  const second = api.loadHeroAsset('rumi');
  assert.equal(first, second);
  assert.deepEqual(calls, ['assets/heroes/rumi.glb?v=20260924a']);

  pending.resolve(makeAsset('rumi'));
  const firstResult = await first;
  const secondResult = await second;
  assert.equal(firstResult.scene.userData.heroModel, 'rumi');
  assert.equal(secondResult, firstResult, 'both callers should receive the exact same prepared asset');
  assert.equal(api.heroAssets.get('rumi'), first, 'the prepared promise remains in the cache');
  assert.equal(api.heroAssets.size, 1);
});

test('loadHeroAsset evicts failures so a later call can retry', async () => {
  let calls = 0;
  const api = makeLoaderHarness(path => {
    calls++;
    if (calls === 1) return Promise.reject(new Error('network unavailable'));
    return Promise.resolve(makeAsset('mira'));
  });
  await assert.rejects(api.loadHeroAsset('mira'), /network unavailable/);
  assert.equal(api.heroAssets.has('mira'), false);
  const retried = await api.loadHeroAsset('mira');
  assert.equal(retried.scene.userData.heroModel, 'mira');
  assert.equal(calls, 2);
  assert.equal(api.heroAssets.has('mira'), true);
});

test('prepHeroModel discovers nested heroModel metadata from an exported GLB', async () => {
  const path = fileURLToPath(new URL('../assets/heroes/rumi.glb', import.meta.url));
  const bytes = await readFile(path);
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject));
  const gradTex4 = new THREE.DataTexture(new Uint8Array([88, 150, 212, 255]), 4, 1, THREE.RedFormat);
  gradTex4.needsUpdate = true;
  const context = vm.createContext({ THREE, gradTex4, console });
  const prepSource = `${functionSource('lockHips')}\n${functionSource('toonify')}\n${functionSource('prepHeroModel')}\nthis.prepHeroModel = prepHeroModel;`;
  vm.runInContext(prepSource, context);
  const base = context.prepHeroModel(gltf);
  assert.equal(base.authored, true);
  assert.equal(base.scene.userData.heroModel, 'rumi');
  assert.ok(base.hScale > 0 && Number.isFinite(base.hScale));
  assert.ok(base.scene.children.some(object => object.userData.heroModel === 'rumi'), 'metadata should be found on nested exported objects');
  gradTex4.dispose();
});

function selectionHarness(loadHeroAsset) {
  const cards = Array.from({ length: 3 }, () => ({ disabled: false }));
  const status = { textContent: '' };
  const retryClasses = new Set();
  const retry = { classList: { add: value => retryClasses.add(value), remove: value => retryClasses.delete(value) } };
  const charselClasses = new Set();
  const charsel = { classList: { add: value => charselClasses.add(value) }, setAttribute() {} };
  const elements = { charLoadStatus: status, charLoadRetry: retry, charsel };
  const events = { builds: 0, starts: 0, clears: 0 };
  const context = vm.createContext({
    CHARS: { rumi: { name: 'Rumi' } },
    ready: true,
    state: 'title',
    loadHeroAsset,
    clearHeldInput() { events.clears++; },
    buildHero() { events.builds++; },
    start() { events.starts++; },
    document: {
      getElementById(id) { return elements[id]; },
      querySelectorAll() { return cards; },
    },
    console: { error() {} },
  });
  vm.runInContext(`let heroSelectionPending = false;\nlet pendingHeroKey = null;\nlet heroPreloadFailed = false;\n${functionSource('setHeroCardsDisabled')}\n${functionSource('chooseHero')}\nthis.api = { chooseHero, get pending() { return heroSelectionPending; } };`, context);
  return { api: context.api, cards, status, retryClasses, charselClasses, events };
}

test('chooseHero guards duplicate clicks and restores all cards after success', async () => {
  const pending = deferred();
  let calls = 0;
  const h = selectionHarness(() => { calls++; return pending.promise; });
  const first = h.api.chooseHero('rumi');
  const second = h.api.chooseHero('rumi');
  assert.equal(calls, 1);
  assert.ok(h.cards.every(card => card.disabled));
  assert.equal(h.api.pending, true);
  pending.resolve({ scene: {}, clips: [], authored: true });
  await Promise.all([first, second]);
  assert.equal(h.events.builds, 1);
  assert.equal(h.events.starts, 1);
  assert.equal(h.events.clears, 1);
  assert.ok(h.cards.every(card => !card.disabled));
  assert.equal(h.api.pending, false);
  assert.ok(h.charselClasses.has('hidden'));
});

test('chooseHero exposes retry after failure and recovers on the next selection', async () => {
  let calls = 0;
  const h = selectionHarness(async () => {
    calls++;
    if (calls === 1) throw new Error('temporary failure');
    return { scene: {}, clips: [], authored: true };
  });
  await h.api.chooseHero('rumi');
  assert.match(h.status.textContent, /載入失敗/);
  assert.ok(h.retryClasses.has('hidden') === false);
  assert.ok(h.cards.every(card => !card.disabled));
  assert.equal(h.api.pending, false);

  await h.api.chooseHero('rumi');
  assert.equal(calls, 2);
  assert.equal(h.events.builds, 1);
  assert.equal(h.events.starts, 1);
  assert.ok(h.cards.every(card => !card.disabled));
});

test('disposing a cloned hero never disposes cached GLB geometry', () => {
  const cachedScene = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 2, 0.5);
  const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
  cachedScene.add(new THREE.Mesh(geometry, sourceMaterial));
  const disposed = { geometry: 0 };
  geometry.addEventListener('dispose', () => disposed.geometry++);
  const elements = {
    hpname: { textContent: '' },
    charsel: { classList: { add() {} } },
  };
  const context = vm.createContext({
    THREE,
    SkeletonUtils,
    CHARS: {},
    player: { root: null, shadow: null, rig: null },
    heroOwnedResources: new WeakMap(),
    scene: { add() {}, remove() {} },
    curChar: null,
    clearSwordFx() {}, shareClonedSkeletons() {},
    makeRig() { return { mixer: { stopAllAction() {} } }; },
    addOutline() {}, play() {}, makeBlobShadow() { return null; }, setupSwordFx() {}, syncPlayer() {},
    heroLight: { color: { set() {} } },
    document: {
      getElementById(id) { return elements[id]; },
      body: { style: { setProperty() {} } },
    },
  });
  const source = `let curChar = null;\n${functionSource('cloneHeroMaterials')}\n${functionSource('disposeHero')}\n${functionSource('buildHero')}\nthis.api = { buildHero, disposeHero, player };`;
  vm.runInContext(source, context);
  const base = { scene: cachedScene, clips: [], hScale: 1, authored: true };
  const char = { name: 'Rumi', model: base, fx: 0xffffff, spd: 4, light: 0xffffff };
  context.api.buildHero(char);
  const root = context.api.player.root;
  assert.equal(context.heroOwnedResources.get(root).geometries.length, 0, 'shared cached geometry must not become clone-owned');
  context.api.disposeHero(root, null, context.api.player.rig);
  assert.equal(disposed.geometry, 0);
});
