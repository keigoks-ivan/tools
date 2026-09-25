import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assetPlan, LoadProgress, readWithProgress, createPreloader, STAGE, BYTES_PER_MS } from '../3d-next/preload.js';

const gameRoot = new URL('../', import.meta.url);
const plan = (items) => items.map(item => ({ blocking: true, kind: 'file', stage: 'hero', ...item }));

test('progress is weighted by bytes and ignores non-blocking items', () => {
  const progress = new LoadProgress(plan([
    { id: 'big', bytes: 3000 }, { id: 'small', bytes: 1000, stage: 'oni' }, { id: 'music', bytes: 50000, blocking: false },
  ]), { now: () => 0 });
  assert.equal(progress.value(), 0);
  progress.set('big', 0.5);
  assert.equal(progress.value(), 0.375);
  progress.complete('small');
  assert.equal(progress.value(), 0.625);
  progress.set('music', 1);   // not tracked
  assert.equal(progress.value(), 0.625);
  assert.equal(progress.has('music'), false);
});

test('progress never reports 100 % before every blocking item is complete', () => {
  const progress = new LoadProgress(plan([{ id: 'a', bytes: 1 }, { id: 'b', bytes: 1e9 }]), { now: () => 0 });
  progress.set('b', 1);            // a download that read everything but has not resolved yet
  progress.complete('a');
  assert.ok(progress.value() < 1);
  assert.ok(progress.value() <= 0.99);
  assert.equal(progress.done, false);
  progress.complete('b');
  assert.equal(progress.value(), 1);
  assert.equal(progress.display(), 1);
  assert.equal(progress.done, true);
});

test('steps earn time-based credit while running so the bar does not stall', () => {
  let t = 0;
  const progress = new LoadProgress(plan([{ id: 'file', bytes: 1000 }, { id: 'bake', kind: 'step', ms: 1000, bytes: 1000, stage: 'build' }]), { now: () => t });
  progress.complete('file');
  assert.equal(progress.value(), 0.5);
  progress.begin('bake');
  t = 1000;
  const credit = 0.9 * (1 - Math.exp(-1));
  assert.ok(Math.abs(progress.value() - (0.5 + 0.5 * credit)) < 1e-9);
  t = 1e7;                                               // a step that takes far longer than expected
  assert.ok(progress.value() < 0.96, 'step credit is capped at 90 % of the step');
  progress.complete('bake');
  assert.equal(progress.value(), 1);
});

test('display value is monotonic even when a failed download restarts', () => {
  const progress = new LoadProgress(plan([{ id: 'a', bytes: 100 }, { id: 'b', bytes: 100 }]), { now: () => 0 });
  progress.set('a', 0.8);
  const before = progress.display();
  progress.reset('a');
  assert.equal(progress.value(), 0);
  assert.equal(progress.display(), before);
  progress.set('a', 0.9);
  assert.ok(progress.display() > before);
});

test('stage label follows the first unfinished item in plan order', () => {
  const progress = new LoadProgress(plan([
    { id: 'hero', stage: 'hero', bytes: 10 }, { id: 'oni', stage: 'oni', bytes: 10 }, { id: 'world', kind: 'step', stage: 'build', ms: 10, bytes: 10 },
  ]), { now: () => 0 });
  assert.equal(progress.stage(), STAGE.hero);
  progress.complete('oni');
  assert.equal(progress.stage(), STAGE.hero);
  progress.complete('hero');
  assert.equal(progress.stage(), STAGE.build);
  assert.equal(progress.downloaded, true);
  progress.complete('world');
  assert.equal(progress.stage(), STAGE.build);
});

function streamResponse(chunks, headers = {}) {
  let i = 0;
  return {
    ok: true, status: 200,
    headers: { get: name => headers[name.toLowerCase()] ?? null },
    body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }) }) },
  };
}

test('readWithProgress concatenates chunks and uses the decoded size for compressed responses', async () => {
  const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6, 7, 8, 9, 10])];
  const plain = [];
  const buffer = await readWithProgress(streamResponse(chunks, { 'content-length': '10' }), 999, f => plain.push(f));
  assert.deepEqual([...new Uint8Array(buffer)], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(plain, [0.3, 0.5, 1, 1]);
  // gzip: Content-Length (4) is the compressed size; progress uses the known decoded size (20)
  const gz = [];
  await readWithProgress(streamResponse(chunks, { 'content-length': '4', 'content-encoding': 'gzip' }), 20, f => gz.push(f));
  assert.deepEqual(gz, [0.15, 0.25, 0.5, 1]);
  // no streams (old browsers): whole body at once
  const whole = await readWithProgress({ headers: { get: () => null }, arrayBuffer: async () => new Uint8Array([7]).buffer }, 1);
  assert.equal(new Uint8Array(whole)[0], 7);
});

const MANIFEST = { music: { market: { file: 'market.mp3', hash: 'm1', bytes: 30 }, plaza: { file: 'plaza.mp3', hash: 'p1', bytes: 30 } }, sfx: { file: 'sfx.mp3', hash: 's1', bytes: 30 } };

function fakeNetwork() {
  const calls = [];
  const failures = new Set();
  const gates = new Map();
  const fetchImpl = async (url) => {
    calls.push(url);
    if (gates.has(url)) await gates.get(url);
    if (failures.has(url)) { failures.delete(url); return { ok: false, status: 503, headers: { get: () => null } }; }
    const text = url.endsWith('manifest.json') ? JSON.stringify(MANIFEST) : url.endsWith('.json') ? '{"ok":true}' : `body:${url}`;
    const bytes = new TextEncoder().encode(text);
    const response = streamResponse([bytes], { 'content-length': String(bytes.length) });
    response.json = async () => JSON.parse(text);
    return response;
  };
  return { calls, failures, gates, fetchImpl };
}

const testPlan = () => [
  { id: 'hero', stage: 'hero', kind: 'file', url: 'http://x/hero.glb', bytes: 100, as: 'buffer', blocking: true },
  { id: 'hero-parse', stage: 'hero', kind: 'step', ms: 10, bytes: 10, blocking: true },
  { id: 'atlas', stage: 'scene', kind: 'file', url: 'http://x/atlas.json', bytes: 10, as: 'json', blocking: true },
  { id: 'engine', stage: 'engine', kind: 'engine', ms: 10, bytes: 50, blocking: true },
  { id: 'audio', stage: 'audio', kind: 'audio-manifest', url: 'http://x/audio/manifest.json', tracks: ['sfx', 'market'], blocking: false },
];

test('preloader downloads each file once and hands the bytes to every caller', async () => {
  const net = fakeNetwork();
  const assets = createPreloader({ plan: testPlan(), fetchImpl: net.fetchImpl, loadEngine: async () => ({ parseGltf: async buffer => ({ parsed: new TextDecoder().decode(buffer) }) }) });
  assets.start();
  assets.start();
  const [a, b, atlas] = await Promise.all([assets.file('hero'), assets.file('hero'), assets.file('atlas')]);
  assert.equal(a, b);
  assert.deepEqual(atlas, { ok: true });
  assert.equal(net.calls.filter(url => url === 'http://x/hero.glb').length, 1);
  const gltf = await assets.gltf('hero');
  assert.equal(gltf.parsed, 'body:http://x/hero.glb');
  assert.equal(assets.progress.byId.get('hero-parse').done, true);
  assert.equal(net.calls.filter(url => url === 'http://x/hero.glb').length, 1, 'parsing reuses the prefetched bytes');
});

test('audio waits for the blocking downloads, uses the manifest ?v= hashes and is served from memory once', async () => {
  const net = fakeNetwork();
  let release;
  net.gates.set('http://x/hero.glb', new Promise(resolve => { release = resolve; }));
  const assets = createPreloader({ plan: testPlan(), fetchImpl: net.fetchImpl, loadEngine: async () => ({}) });
  assets.start();
  const manifest = await (await assets.fetchAudio('http://x/audio/manifest.json', { cache: 'no-cache' })).json();
  assert.equal(manifest.sfx.hash, 's1');
  const audioResponse = assets.fetchAudio('http://x/audio/sfx.mp3?v=s1');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(net.calls.some(url => url.includes('sfx.mp3')), false, 'audio must not compete with the hero download');
  release();
  const response = await audioResponse;
  assert.equal(await response.text(), 'body:http://x/audio/sfx.mp3?v=s1');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(net.calls.filter(url => url.includes('.mp3')).sort(), ['http://x/audio/market.mp3?v=m1', 'http://x/audio/sfx.mp3?v=s1']);
  assert.equal(net.calls.filter(url => url.endsWith('manifest.json')).length, 1, 'manifest fetched once for both');
  await assets.fetchAudio('http://x/audio/plaza.mp3?v=p1');   // not prefetched: straight to the network
  await assets.fetchAudio('http://x/audio/sfx.mp3?v=s1');     // second request (after audio.js dropped its copy): network
  assert.equal(net.calls.filter(url => url === 'http://x/audio/sfx.mp3?v=s1').length, 2);
  assert.ok(net.calls.includes('http://x/audio/plaza.mp3?v=p1'));
  await assets.fetchAudio('http://x/other.png');
  assert.ok(net.calls.includes('http://x/other.png'));
});

test('a failed download is retried on the next request', async () => {
  const net = fakeNetwork();
  net.failures.add('http://x/hero.glb');
  const assets = createPreloader({ plan: testPlan(), fetchImpl: net.fetchImpl, loadEngine: async () => ({}) });
  await assert.rejects(assets.file('hero'), /503/);
  assert.equal(assets.progress.byId.get('hero').done, false);
  const buffer = await assets.file('hero');
  assert.ok(buffer.byteLength > 0);
  assert.equal(net.calls.filter(url => url === 'http://x/hero.glb').length, 2);
  assets.skip('hero-parse');
  assert.equal(assets.progress.byId.get('hero-parse').done, true);
});

test('asset plan weights match the files on disk', async () => {
  for (const [hero, march] of [['vroid', true], ['vroid', false], ['rumi', false]]) {
    const items = assetPlan({ hero, march, base: gameRoot.href });
    for (const item of items.filter(entry => entry.kind === 'file')) {
      const path = fileURLToPath(new URL(item.url.replace(/\?.*$/, '')));
      const { size } = await stat(path);
      assert.equal(item.bytes, size, `${item.id}: plan says ${item.bytes} B, file is ${size} B`);
    }
    for (const step of items.filter(entry => entry.kind === 'step')) assert.equal(step.bytes, Math.round(step.ms * BYTES_PER_MS));
    assert.ok(items.some(item => item.id === 'engine' && item.blocking));
    assert.equal(items.some(item => item.stage === 'audio' && item.blocking), false, 'audio never blocks the start');
    const audio = items.find(item => item.kind === 'audio-manifest');
    if (hero === 'vroid') {
      // tracks named in the plan exist in the manifest audio.js reads (sizes and ?v= hashes come from there)
      const manifest = JSON.parse(await readFile(fileURLToPath(new URL(audio.url)), 'utf8'));
      for (const key of audio.tracks) assert.ok((key === 'sfx' ? manifest.sfx : manifest.music[key])?.file, `manifest lacks ${key}`);
    } else assert.equal(audio, undefined, 'the Rumi page stays silent');
  }
});

test('preload versions and module URLs agree with the modules that consume them', async () => {
  const read = path => readFile(new URL(path, gameRoot), 'utf8');
  const [boot, battle, index, marchArt, combatFx, fxPreview] = await Promise.all(
    ['3d-next/boot.js', '3d-next/battle.js', '3d-next/index.html', '3d-next/march-art.js', '3d-next/combat-fx.js', '3d-next/fx-preview.js'].map(read));
  const plan = assetPlan({ base: gameRoot.href });
  const version = id => new URL(plan.find(item => item.id === id).url).searchParams.get('v');
  assert.equal(version('march-props'), marchArt.match(/const VERSION = '([^']+)'/)[1], 'march texture ?v= differs from march-art.js');
  assert.equal(version('fx-strips'), combatFx.match(/const FX_VERSION = '([^']+)'/)[1], 'fx texture ?v= differs from combat-fx.js');
  // the same preload.js / lazy-module URLs everywhere, so the module map never loads a second copy
  const preloadUrls = new Set([...boot.matchAll(/preload\.js\?v=[\w]+/g), ...battle.matchAll(/preload\.js\?v=[\w]+/g), ...index.matchAll(/preload\.js\?v=[\w]+/g)].map(m => m[0]));
  assert.equal(preloadUrls.size, 1, [...preloadUrls].join(' '));
  for (const name of ['march-art.js', 'combat-fx.js']) {
    const inBattle = battle.match(new RegExp(`import\\('\\./${name.replace('.', '\\.')}(\\?v=\\w+)?'\\)`))[1] || '';
    assert.ok(boot.includes(`'./${name}${inBattle}'`), `boot.js modulepreload for ${name} must match battle.js (${inBattle})`);
  }
  const battleVersion = boot.match(/import\('\.\/battle\.js(\?v=\w+)'\)/)[1];
  assert.ok(battleVersion, 'boot imports a versioned battle.js');
  // fx-preview.js is a standalone judge page for combat-fx.js; its import must not go stale against battle.js's
  const combatFxInBattle = battle.match(/import\('\.\/combat-fx\.js(\?v=\w+)?'\)/)[1] || '';
  const combatFxInPreview = fxPreview.match(/from '\.\/combat-fx\.js(\?v=\w+)?'/)[1] || '';
  assert.equal(combatFxInPreview, combatFxInBattle, 'fx-preview.js imports a stale combat-fx.js version');
});
