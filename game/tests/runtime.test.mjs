import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name} in game source`);
  const brace = source.indexOf('{', start);
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

function makeNode(extra = {}) {
  const calls = { contexts: 0, fetches: 0, decodes: 0, starts: 0, resumes: 0, suspends: 0, intervals: 0 };
  const gain = () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } });
  const ctx = {
    state: 'suspended', currentTime: 0, sampleRate: 10, destination: {},
    resume() { calls.resumes++; this.state = 'running'; return Promise.resolve(); },
    suspend() { calls.suspends++; this.state = 'suspended'; return Promise.resolve(); },
    createDynamicsCompressor() { return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect() {} }; },
    createGain: gain,
    createConvolver() { return { connect() {}, buffer: null }; },
    createDelay() { return { delayTime: {}, connect() {} }; },
    createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; },
    decodeAudioData(raw) {
      calls.decodes++;
      return extra.decodeAudioData ? extra.decodeAudioData(raw) : Promise.resolve({ decoded: true });
    },
    createBufferSource() { return { connect() { return this; }, start() { calls.starts++; }, stop() {}, disconnect() {}, buffer: null }; },
    createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; }, start() {}, stop() {} }; },
    createBiquadFilter() { return { connect() { return this; }, frequency: {}, Q: {} }; },
  };
  class AudioContext { constructor() { calls.contexts++; return ctx; } }
  const document = {
    hidden: false,
    getElementById() { return { textContent: '', setAttribute() {} }; },
    addEventListener() {},
  };
  const context = vm.createContext({
    AU: { ctx: null, master: null, music: null, sfx: null, noise: null, muted: false, timer: null, nextBar: 0, bar: 0,
      bgmGain: null, bgm: { bufs: {}, pending: {}, failed: new Set(), request: 0, cur: null, want: null, src: null, srcGain: null } },
    BGM_FILES: ['stage.mp3'], BGM_TITLE: 'title.ogg', window: { AudioContext }, document,
    fetch: extra.fetch ?? (() => { calls.fetches++; return Promise.reject(new Error('unexpected fetch')); }),
    setInterval: () => { calls.intervals++; return 1; },
    clearInterval() {}, Promise, Math, Float32Array,
  });
  const names = extra.names ?? ['resumeAudio', 'suspendAudio', 'initAudio', 'playBgm', 'scheduleMusic', 'toggleMute', 'handleVisibilityChange'];
  Object.assign(context, {
    animationFrame: 0, keys: new Set(), clearTouchMove() {},
    atkPressed: false, heavyPressed: false, jumpPressed: false, dodgePressed: false, musouPressed: false, heavyHold: false,
    cancelAnimationFrame() {}, resumeFrames() {},
  });
  vm.runInContext(names.map(functionSource).join('\n'), context);
  return { context, calls, ctx, document };
}

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('muting before Start keeps audio completely lazy', () => {
  const h = makeNode();
  h.context.toggleMute();
  h.context.initAudio();
  assert.equal(h.context.AU.muted, true);
  assert.equal(h.calls.contexts, 0);
  assert.equal(h.calls.fetches, 0);
  assert.equal(h.calls.intervals, 0);
});

test('unmute initializes and plays the BGM that was requested while muted', async () => {
  let resolveFetch;
  const h = makeNode({ fetch: () => { h.calls.fetches++; return new Promise(resolve => { resolveFetch = resolve; }); } });
  h.context.AU.muted = true;
  h.context.AU.bgm.want = 0;
  h.context.toggleMute();
  assert.equal(h.calls.contexts, 1);
  await flush();
  resolveFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  await flush();
  assert.equal(h.calls.decodes, 1);
  assert.equal(h.calls.starts, 1);
});

test('a pending decode invalidated by mute cannot start a source', async () => {
  let resolveFetch;
  const h = makeNode({ fetch: () => { h.calls.fetches++; return new Promise(resolve => { resolveFetch = resolve; }); } });
  h.context.initAudio();
  h.context.playBgm(0);
  await flush();
  h.context.toggleMute();
  resolveFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  await flush();
  assert.equal(h.calls.decodes, 0);
  assert.equal(h.calls.starts, 0);
});

test('an in-flight decode invalidated by mute cannot retain PCM or start a source', async () => {
  let resolveDecode;
  const h = makeNode({
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
    decodeAudioData: () => new Promise(resolve => { resolveDecode = resolve; }),
  });
  h.context.initAudio();
  h.context.playBgm(0);
  await flush();
  assert.equal(h.calls.decodes, 1);
  h.context.toggleMute();
  resolveDecode({ decoded: true });
  await flush();
  assert.equal(h.calls.starts, 0);
  assert.deepEqual(Object.keys(h.context.AU.bgm.bufs), []);
});

test('switching away and back retries a stale pending BGM request', async () => {
  const resolvers = [];
  const h = makeNode({ fetch: () => {
    h.calls.fetches++;
    return new Promise(resolve => resolvers.push(resolve));
  } });
  h.context.initAudio();
  h.context.playBgm(0);
  await flush();
  h.context.playBgm(1);
  await flush();
  h.context.playBgm(0);
  await flush();
  assert.equal(h.calls.fetches, 3);
  for (const resolve of resolvers) resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  await flush();
  assert.equal(h.calls.starts, 1);
});

test('visibility and pointer resume are gated while muted', async () => {
  const h = makeNode();
  h.context.initAudio();
  h.context.AU.muted = true;
  h.document.hidden = false;
  h.context.resumeAudio();
  assert.equal(h.calls.resumes, 1, 'initial init resume is the only resume');
  h.context.AU.muted = false;
  h.context.resumeAudio();
  await flush();
  assert.equal(h.calls.resumes, 2);
  h.document.hidden = true;
  h.context.handleVisibilityChange();
  h.document.hidden = false;
  h.context.AU.muted = true;
  h.context.handleVisibilityChange();
  assert.equal(h.calls.suspends, 1);
  assert.equal(h.calls.resumes, 2);
});

test('loadStage synchronizes the spawned player before updating the camera', () => {
  const root = { position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: {} };
  const shadow = { position: { set() {} }, scale: { setScalar() {} } };
  const player = { x: 99, y: 0, z: 99, yaw: 0, vy: 0, root, shadow, hpMax: 0, hp: 0, invuln: 0, st: 'idle', rig: null };
  const heroLight = { position: { set() {} } };
  let cameraSawSpawn = false;
  const context = vm.createContext({
    stageIdx: 0, OBSTACLES: null, OBSTACLES_BY_STAGE: [[]], blockersReg: null, blockersRegBy: [[]],
    applyStageTint() {}, captureLightBase() {}, enemies: [], drops: [], bolts: [], level: { props: [] },
    STAGES: [{ name: 'stage', objectives: [{ name: 'objective', type: 'kill' }], }], capturePoint: { position: {}, visible: false },
    STORY: { s1open: [] },
    musou: 0, lockTarget: null, BGM_FILES: ['stage.mp3'], AU: { ctx: null }, hud: {
      bosswrap: { style: {} },
      objective: { textContent: 'old progress', classList: { contains: () => false, toggle() {} } },
    },
    player, heroLight, MODEL_YAW: 0, camYaw: 0, curChar: { hpMul: 1 }, play() {}, syncPlayer: undefined,
    state: 'title', updateCamera() { cameraSawSpawn = root.position.x === 0 && root.position.y === 0 && root.position.z === 36; },
    resumeFrames() {}, performance: { now: () => 1 }, showToast() {}, showDialog() {},
    playBgm() {}, scene: { remove() {} }, releaseEnemy() {},
  });
  vm.runInContext(functionSource('syncPlayer'), context);
  vm.runInContext(functionSource('setObjective'), context);
  vm.runInContext(functionSource('loadStage'), context);
  context.loadStage(0);
  assert.deepEqual({ x: root.position.x, y: root.position.y, z: root.position.z }, { x: 0, y: 0, z: 36 });
  assert.equal(cameraSawSpawn, true);
  assert.equal(context.hud.objective.textContent, 'stage');
});

test('RAF loop has no duplicate requests, stops while hidden, and resumes cleanly', () => {
  const events = { requests: 0, renders: 0, hud: 0, updates: 0 };
  let nextId = 0;
  const context = vm.createContext({
    document: { hidden: false }, animationFrame: 0, state: 'title',
    requestAnimationFrame() { events.requests++; return ++nextId; },
    clock: { getDelta: () => 0.016 }, perfAcc: 0, perfN: 0, lastFrameTs: 0,
    hud: { dead: { classList: { contains: () => true } }, win: { classList: { contains: () => true } } },
    updateHUD() { events.hud++; }, composer: { render() { events.renders++; } },
    dlg: { active: false }, player: { root: null }, hitStopT: 0, musouSlowT: 0, witchT: 0,
    updatePlayer() { events.updates++; }, updateEnemies() {}, updateLevel() {}, updateFx() {}, perfTick() {},
    updateAmbient() {}, updateLock() {}, updateCamera() {}, updateOcclusion() {}, updateTrail() {},
  });
  vm.runInContext(`${functionSource('resumeFrames')}\n${functionSource('loop')}`, context);
  context.loop(1);
  assert.equal(events.renders, 0);
  assert.equal(events.requests, 0);
  context.state = 'play';
  context.loop(16);
  assert.equal(events.requests, 1);
  assert.equal(events.renders, 1);
  context.document.hidden = true;
  context.loop(32);
  assert.equal(events.requests, 1);
  context.resumeFrames();
  assert.equal(events.requests, 1);
  context.document.hidden = false;
  context.resumeFrames();
  assert.equal(events.requests, 2);
  context.resumeFrames();
  assert.equal(events.requests, 2);
});
