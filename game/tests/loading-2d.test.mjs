import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../2d/main.js', import.meta.url), 'utf8');
const loadStart = source.indexOf('function loadImage(name, url)');
const loadEnd = source.indexOf('function clearInput()', loadStart);
assert.ok(loadStart >= 0 && loadEnd > loadStart, 'expected image loader block in 2D main.js');
const loadingFunctions = source.slice(loadStart, loadEnd);

function createHarness(warriorView = false) {
  const requested = [];
  const instances = [];
  const timers = new Map();
  let nextTimer = 1;
  const status = { textContent: '' };
  class StubImage {
    constructor() { this.width = 1254; this.height = 1254; this.onload = null; this.onerror = null; instances.push(this); }
    set src(value) { this._src = value; if (value) requested.push(value); }
    get src() { return this._src; }
    succeed() { const callback = this.onload; this.onload = this.onerror = null; callback?.(); }
    fail() { const callback = this.onerror; this.onload = this.onerror = null; callback?.(); }
  }
  const context = vm.createContext({
    Image: StubImage,
    setTimeout(callback, delay) { const id = nextTimer++; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    $: id => id === 'loadstatus' ? status : null,
    atlas(image, columns, rows, rowEdges) { return [{ image, columns, rows, rowEdges }]; },
    console,
  });
  vm.runInContext(`const warriorView = ${warriorView};\nconst images = {};\nconst imagePromises = {};\nlet assetsPromise, heroFrames, enemyFrames;\n${loadingFunctions}\nthis.api = {
    loadImage, loadHero, loadAssets,
    get images() { return images; },
    get imagePromises() { return imagePromises; },
    get heroFrames() { return heroFrames; },
    get enemyFrames() { return enemyFrames; },
    get assetsPromise() { return assetsPromise; },
  };`, context);
  return {
    api: context.api,
    requested,
    instances,
    timers,
    status,
    latestImage() { return instances.at(-1); },
    finish(url) {
      const image = instances.findLast(item => item.src === url && item.onload);
      assert.ok(image, `no pending Image for ${url}`);
      image.succeed();
      return image;
    },
    fail(url) {
      const image = instances.findLast(item => item.src === url && item.onerror);
      assert.ok(image, `no pending Image for ${url}`);
      image.fail();
      return image;
    },
    expireLatest() {
      const [id, timer] = [...timers.entries()].at(-1) || [];
      assert.ok(timer, 'expected active image timeout');
      assert.equal(timer.delay, 45000);
      timers.delete(id);
      timer.callback();
    },
  };
}

test('hero preview loads only the hero, then full loading reuses it and fetches the other images once', async () => {
  const h = createHarness();
  const previewA = h.api.loadHero();
  const previewB = h.api.loadHero();
  assert.equal(h.requested.length, 1, 'concurrent previews share a single hero image');
  assert.deepEqual(h.requested, ['./assets/rumi-actions-v2.webp']);
  assert.equal(h.instances.length, 1);

  h.finish('./assets/rumi-actions-v2.webp');
  await Promise.all([previewA, previewB]);
  assert.equal(h.api.heroFrames.length, 9);

  const fullA = h.api.loadAssets();
  const fullB = h.api.loadAssets();
  assert.deepEqual(h.requested, [
    './assets/rumi-actions-v2.webp',
    './assets/enemies-actions-v1.webp',
    './assets/night-market-v1.webp',
  ]);
  assert.equal(h.instances.length, 3, 'the hero must not be fetched a second time');
  h.finish('./assets/enemies-actions-v1.webp');
  h.finish('./assets/night-market-v1.webp');
  await Promise.all([fullA, fullB]);
  assert.equal(h.api.enemyFrames.length, 1);
  assert.equal(h.api.enemyFrames[0].image, h.api.images.enemies);
  assert.equal(h.api.assetsPromise !== null, true);
});

test('third-person preview and battle load only their own hero and arena art', async () => {
  const h = createHarness(true);
  const preview = h.api.loadHero();
  assert.deepEqual(h.requested, ['./assets/rumi-rear-v1.webp']);
  h.finish('./assets/rumi-rear-v1.webp');
  await preview;
  assert.equal(h.api.heroFrames.length, 4);

  const battle = h.api.loadAssets();
  assert.deepEqual(h.requested, [
    './assets/rumi-rear-v1.webp',
    './assets/enemies-actions-v1.webp',
    './assets/night-market-chase-v1.webp',
  ]);
  h.finish('./assets/enemies-actions-v1.webp');
  h.finish('./assets/night-market-chase-v1.webp');
  await battle;
});

test('loadImage returns the same in-flight promise for a repeated name', async () => {
  const h = createHarness();
  const first = h.api.loadImage('hero', './assets/rumi-actions-v2.webp');
  const second = h.api.loadImage('hero', './assets/rumi-actions-v2.webp');
  assert.equal(first, second);
  assert.equal(h.instances.length, 1);
  h.finish('./assets/rumi-actions-v2.webp');
  assert.equal(await first, h.api.images.hero);
});

test('network image errors clear the per-image promise so the next attempt can succeed', async () => {
  const h = createHarness();
  const first = h.api.loadImage('hero', './assets/rumi-actions-v2.webp');
  h.fail('./assets/rumi-actions-v2.webp');
  await assert.rejects(first, /圖片載入失敗/);
  assert.equal(h.api.imagePromises.hero, undefined);

  const retry = h.api.loadImage('hero', './assets/rumi-actions-v2.webp');
  assert.equal(h.instances.length, 2);
  h.finish('./assets/rumi-actions-v2.webp');
  assert.equal(await retry, h.api.images.hero);
});

test('image timeout clears the per-image promise so the next attempt can succeed', async () => {
  const h = createHarness();
  const first = h.api.loadImage('arena', './assets/night-market-v1.webp');
  h.expireLatest();
  await assert.rejects(first, /下載等候較久/);
  assert.equal(h.api.imagePromises.arena, undefined);
  assert.equal(h.latestImage().src, '');

  const retry = h.api.loadImage('arena', './assets/night-market-v1.webp');
  assert.equal(h.instances.length, 2);
  h.finish('./assets/night-market-v1.webp');
  assert.equal(await retry, h.api.images.arena);
});

test('a failed full-asset request resets the group promise and can retry with cached successes', async () => {
  const h = createHarness();
  const first = h.api.loadAssets();
  h.finish('./assets/rumi-actions-v2.webp');
  h.fail('./assets/enemies-actions-v1.webp');
  h.finish('./assets/night-market-v1.webp');
  await assert.rejects(first, /圖片載入失敗/);
  assert.equal(h.api.assetsPromise, null);
  assert.equal(h.api.imagePromises.enemies, undefined);

  const retry = h.api.loadAssets();
  assert.equal(h.instances.length, 4, 'retry should request only the failed image');
  assert.deepEqual(h.requested, [
    './assets/rumi-actions-v2.webp',
    './assets/enemies-actions-v1.webp',
    './assets/night-market-v1.webp',
    './assets/enemies-actions-v1.webp',
  ]);
  h.finish('./assets/enemies-actions-v1.webp');
  await retry;
  assert.equal(h.api.enemyFrames.length, 1);
});
