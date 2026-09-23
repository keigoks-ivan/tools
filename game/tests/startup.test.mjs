import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const mainSource = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const bootSource = fs.readFileSync(new URL('../boot.js', import.meta.url), 'utf8');

function functionSource(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `missing ${name} in source`);
  const start = match.index;
  let parens = 1, paramQuote = null, paramEscaped = false, closeParen = -1;
  for (let i = source.indexOf('(', start) + 1; i < source.length; i++) {
    const c = source[i];
    if (paramQuote) {
      if (paramEscaped) paramEscaped = false;
      else if (c === '\\') paramEscaped = true;
      else if (c === paramQuote) paramQuote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { paramQuote = c; continue; }
    if (c === '(') parens++;
    else if (c === ')' && --parens === 0) { closeParen = i; break; }
  }
  assert.notEqual(closeParen, -1, `unterminated parameters for ${name}`);
  const brace = source.indexOf('{', closeParen + 1);
  let depth = 0, quote = null, escaped = false;
  for (let i = brace; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function makeElement() {
  const listeners = new Map();
  const attrs = new Map();
  const classes = new Set();
  return {
    disabled: false, textContent: '', onclick: null,
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value),
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    dispatch(type, event = {}) { return listeners.get(type)?.(event); },
    listener(type) { return listeners.get(type); },
    setAttribute(name, value) { attrs.set(name, value); },
    getAttribute(name) { return attrs.get(name) ?? null; },
    removeAttribute(name) { attrs.delete(name); },
    querySelector() { return this.span ??= { textContent: '' }; },
  };
}

function bootHarness(loadGame) {
  const startButton = makeElement();
  const muteButton = makeElement();
  muteButton.setAttribute('aria-pressed', 'false');
  muteButton.textContent = '🔊';
  muteButton.setAttribute('aria-label', '靜音');
  const loadText = { textContent: '' };
  const body = { classList: { add() {} } };
  const windowListeners = new Map();
  const reloads = { count: 0 };
  const elements = { startBtn: startButton, mute: muteButton, loadtext: loadText };
  const context = vm.createContext({
    document: { body, getElementById: id => elements[id] },
    window: { location: { reload() { reloads.count++; } }, addEventListener: (type, fn) => windowListeners.set(type, fn), removeEventListener: (type, fn) => { if (windowListeners.get(type) === fn) windowListeners.delete(type); } },
    matchMedia: () => ({ matches: false }),
    loadGame,
    console: { error() {} },
  });
  const transformed = bootSource.replace(/await import\('\.\/main\.js\?v=[^']+'\)/, 'await loadGame()');
  assert.notEqual(transformed, bootSource, 'boot import site should match the controlled loader replacement');
  vm.runInContext(transformed, context);
  return { startButton, muteButton, loadText, reloads, windowListeners };
}

function stageHarness() {
  const events = { loads: [], builds: [], batches: [], backdrop: 0, reflections: 0, propPlacement: 0 };
  const worlds = Array.from({ length: 4 }, (_, i) => ({ name: `world${i + 1}`, children: [] }));
  const assets = {};
  const groundMats = [{ roughness: 0.2 }];
  const context = vm.createContext({
    assets,
    loader: { async loadAsync(path) { events.loads.push(path.split('?')[0]); return { scene: { path }, animations: [] }; } },
    toonify() {}, mergeSkinnedParts() {},
    STAGES: [{}, {}, {}, {}],
    CITY_PROPS: [],
    loadStreetArt: async () => {},
    ...Object.fromEntries(worlds.map((world, i) => [`world${i + 1}`, world])),
    w2anim: {}, w3anim: {}, w4anim: {},
    blockersRegBy: [[], [], [], []],
    groundMats,
    renderer: {}, scene: {},
    THREE: {
      WebGLCubeRenderTarget: class { constructor() { events.reflections++; this.texture = { reflection: true }; } },
      CubeCamera: class { constructor() { this.position = { set() {} }; } update() {} },
    },
    batchStaticWorld(world) { events.batches.push(world.name); },
    buildOpenCity() { events.builds.push(0); },
    buildNetherField() { events.builds.push(1); },
    buildHeaven() { events.builds.push(2); },
    buildVoid() { events.builds.push(3); groundMats.push({ roughness: 0.8 }); },
    buildBackdrop() { events.backdrop++; },
    placeCityProps() { events.propPlacement++; },
    setTimeout(fn) { fn(); return 0; },
  });
  const setup = mainSource.slice(mainSource.indexOf('const ENEMY_FILES ='), mainSource.indexOf('async function loadEnemyAsset('));
  const script = `${setup}\n${functionSource(mainSource, 'loadEnemyAsset')};\n${functionSource(mainSource, 'prepareStage')};\nthis.state = { builtWorlds, preparedStages, get streetReflection() { return streetReflection; } };`;
  try { vm.runInContext(script, context); } catch (err) { throw new Error(`${err.message}\n${script.slice(-800)}`); }
  return { context, events, worlds, assets, groundMats };
}

function requestStageHarness(prepareStage) {
  const events = { prepares: [], loaded: [], updates: 0, suspended: 0, resumed: 0, clearedCombatBuffer: 0 };
  const elements = Object.fromEntries(['stageLoading', 'stageLoadText', 'stageRetry'].map(id => [id, makeElement()]));
  const hud = { dead: makeElement(), win: makeElement() };
  const context = vm.createContext({
    state: 'play', animationFrame: 7,
    el: id => elements[id], hud,
    keys: new Set(['KeyW']),
    atkPressed: true, heavyPressed: false, jumpPressed: false, dodgePressed: false, musouPressed: false, heavyHold: false,
    clearTouchMove() {}, clearCombatBuffer() { events.clearedCombatBuffer++; }, cancelAnimationFrame() {}, updateHUD() { events.updates++; },
    suspendAudio() { events.suspended++; }, resumeAudio() { events.resumed++; },
    async prepareStage(i, report) { events.prepares.push(i); return prepareStage(i, report); },
    loadStage(i) { events.loaded.push(i); },
    yieldLoading: () => Promise.resolve(),
    console: { error() {} },
  });
  vm.runInContext(`let stageRequest = null;\n${functionSource(mainSource, 'requestStage')};\nthis.requestState = { get current() { return stageRequest; } };`, context);
  return { context, events, elements, hud };
}

const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };

test('boot waits for Start, allows title mute, and imports only once for duplicate Start', async () => {
  let resolveLoad;
  const imports = [];
  let muteObservedByGame = null;
  const h = bootHarness(() => {
    imports.push('main');
    return new Promise(resolve => { resolveLoad = () => resolve({ prepareGame: async () => { muteObservedByGame = h.muteButton.getAttribute('aria-pressed'); } }); });
  });

  assert.deepEqual(imports, []);
  h.muteButton.dispatch('click');
  assert.equal(h.muteButton.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(imports, [], 'title mute must not import the game');
  const start = h.startButton.listener('click');
  const first = start();
  const second = start();
  assert.equal(imports.length, 1);
  resolveLoad();
  await Promise.all([first, second]);
  assert.equal(muteObservedByGame, 'true');
  assert.equal(h.startButton.disabled, false);
});

test('boot exposes reload action after startup failure', async () => {
  let imports = 0;
  const h = bootHarness(async () => { imports++; throw new Error('controlled import failure'); });
  await h.startButton.listener('click')();
  assert.equal(imports, 1);
  assert.match(h.loadText.textContent, /載入失敗/);
  assert.equal(h.startButton.querySelector('span').textContent, '重新載入');
  await h.startButton.listener('click')();
  assert.equal(imports, 1);
  assert.equal(h.reloads.count, 1);
});

test('preparing stage 0 loads and batches only stage 0 assets and world', async () => {
  const h = stageHarness();
  await h.context.prepareStage(0);
  assert.deepEqual(h.events.loads, ['assets/runtime/Skeleton_Minion.glb', 'assets/runtime/Skeleton_Warrior.glb']);
  assert.deepEqual(h.events.builds, [0]);
  assert.deepEqual(h.events.batches, ['world1']);
  assert.deepEqual(Object.keys(h.assets).sort(), ['minion', 'warrior']);
  assert.equal(h.events.backdrop, 1);
  assert.equal(h.events.reflections, 1);
});

test('stage 4 loads rogue and barbarian with reflection, and cached preparation does not rebuild', async () => {
  const h = stageHarness();
  await h.context.prepareStage(0);
  const stage0Loads = h.events.loads.length;
  await h.context.prepareStage(3);
  assert.deepEqual(h.events.loads.slice(stage0Loads), ['assets/runtime/Rogue.glb', 'assets/runtime/Barbarian.glb']);
  assert.deepEqual(h.events.builds, [0, 3]);
  assert.deepEqual(h.events.batches, ['world1', 'world4']);
  assert.equal(h.groundMats.length, 2);
  assert.equal(h.groundMats[1].envMap, h.groundMats[0].envMap);
  assert.equal(h.groundMats.every(mat => mat.envMap?.reflection === true), true);
  await h.context.prepareStage(3);
  assert.deepEqual(h.events.builds, [0, 3]);
  assert.deepEqual(h.events.batches, ['world1', 'world4']);
  assert.equal(h.events.loads.length, stage0Loads + 2);
});

test('requestStage holds the loading overlay, shares in-flight work, then loads after preparation', async () => {
  let releasePreparation;
  const h = requestStageHarness(() => new Promise(resolve => { releasePreparation = resolve; }));
  const first = h.context.requestStage(1);
  const second = h.context.requestStage(1);
  assert.equal(first, second);
  assert.equal(h.events.clearedCombatBuffer, 1);
  await flush();
  assert.equal(h.events.prepares.length, 1);
  assert.equal(h.elements.stageLoading.classList.contains('hidden'), false);
  assert.equal(h.elements.stageRetry.classList.contains('hidden'), true);
  assert.deepEqual(h.events.loaded, []);
  releasePreparation();
  await first;
  assert.deepEqual(h.events.loaded, [1]);
  assert.equal(h.elements.stageLoading.classList.contains('hidden'), true);
  assert.equal(h.context.requestState.current, null);
});

test('requestStage failure keeps retry visible and a retry can succeed', async () => {
  let attempts = 0;
  const h = requestStageHarness(async () => {
    attempts++;
    if (attempts === 1) throw new Error('controlled stage failure');
  });
  await h.context.requestStage(2);
  assert.deepEqual(h.events.loaded, []);
  assert.equal(h.elements.stageLoading.classList.contains('hidden'), false);
  assert.equal(h.elements.stageRetry.classList.contains('hidden'), false);
  assert.match(h.elements.stageLoadText.textContent, /載入失敗/);
  assert.equal(h.context.state, 'loading');
  assert.equal(h.context.animationFrame, 0);
  assert.equal(h.context.keys.size, 0);
  assert.equal(h.events.clearedCombatBuffer, 1);
  await h.elements.stageRetry.onclick();
  assert.equal(attempts, 2);
  assert.deepEqual(h.events.loaded, [2]);
  assert.equal(h.elements.stageLoading.classList.contains('hidden'), true);
});


test('HTML enters through boot without preloading the engine', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const scriptSources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
  assert.equal(scriptSources.length, 1);
  assert.match(scriptSources[0], /^boot\.js\?v=/);
  assert.doesNotMatch(html, /rel="modulepreload"/);
});

test('middle stages load their own officer and boss models only', async () => {
  for (const [stage, model] of [[1, 'Barbarian'], [2, 'Knight']]) {
    const h = stageHarness();
    await h.context.prepareStage(stage);
    assert.deepEqual(h.events.loads, ['assets/runtime/Skeleton_Minion.glb', `assets/runtime/${model}.glb`]);
    assert.deepEqual(h.events.builds, [stage]);
    assert.deepEqual(h.events.batches, [`world${stage + 1}`]);
  }
});


test('city props load two at a time and are all present before placement', async () => {
  const h = stageHarness();
  h.context.CITY_PROPS = ['one', 'two', 'three', 'four', 'five'];
  let active = 0, peak = 0;
  const pending = [];
  const basicLoad = h.context.loader.loadAsync;
  h.context.loader.loadAsync = path => {
    if (!path.includes('/city/')) return basicLoad(path);
    active++;
    peak = Math.max(peak, active);
    return new Promise(resolve => pending.push(() => {
      active--;
      resolve({ scene: { path } });
    }));
  };
  let placed = null;
  h.context.placeCityProps = props => { placed = Object.keys(props); };
  const loading = h.context.prepareStage(0);
  for (const batchSize of [2, 2, 1]) {
    await flush();
    assert.equal(pending.length, batchSize);
    assert.equal(placed, null);
    pending.splice(0).forEach(resolve => resolve());
  }
  await loading;
  assert.equal(peak, 2);
  assert.deepEqual(placed.sort(), ['five', 'four', 'one', 'three', 'two']);
});
