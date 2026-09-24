import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import {
  SOUNDS, MUSIC_TRACKS, STORAGE_KEY, DEFAULT_SETTINGS, mapEvent, createEventState, musicForSegment, VoiceLimiter,
  smoothLoopSeam, findMarker, spriteOffset, loadSettings, saveSettings, SlowMo, createAudio,
} from '../3d-next/audio.js';

const audioDir = new URL('../assets/audio/march/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', audioDir), 'utf8'));
const ids = res => res.cues.map(c => c.id);
const fixed = v => () => v;

test('manifest: every cue file exists, loops are long and seamless-ready, budgets hold', () => {
  let musicBytes = 0;
  for (const name of MUSIC_TRACKS) {
    const entry = manifest.music[name];
    assert.ok(entry, `manifest has ${name}`);
    const size = statSync(new URL(entry.file, audioDir)).size;
    assert.equal(size, entry.bytes, `${name} size matches manifest`);
    musicBytes += size;
    assert.ok(entry.lufs <= -14.5 && entry.lufs >= -17, `${name} loudness ${entry.lufs}`);
    assert.ok(entry.truePeak <= -1, `${name} true peak ${entry.truePeak}`);
    if (entry.loop) {
      assert.ok(entry.loopEnd - entry.loopStart >= 55 && entry.loopEnd - entry.loopStart <= 90, `${name} loop length`);
      assert.ok(entry.loopStart >= 0.25, 'pre-roll before loopStart');
    } else assert.ok(entry.duration > 3 && entry.duration < 12, `${name} sting length`);
  }
  assert.ok(musicBytes <= 4.2e6, `music total ${musicBytes}`);
  const sfxSize = statSync(new URL(manifest.sfx.file, audioDir)).size;
  assert.ok(sfxSize <= 1.5e6, `sfx ${sfxSize}`);
  assert.deepEqual(Object.keys(manifest.music).filter(k => manifest.music[k].loop).sort(), ['boss', 'market', 'plaza']);
});

test('every sound rule has sprite entries and every sprite sound has a rule', () => {
  const sprite = Object.keys(manifest.sfx.sounds).sort();
  assert.deepEqual(Object.keys(SOUNDS).sort(), sprite);
  for (const [id, variants] of Object.entries(manifest.sfx.sounds)) {
    assert.ok(variants.length >= 1, id);
    for (const [start, dur] of variants) assert.ok(start > 0 && dur > 0.03 && dur < 4, `${id} ${start} ${dur}`);
  }
  // entries are ordered and never overlap
  const all = Object.values(manifest.sfx.sounds).flat().sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < all.length; i++) assert.ok(all[i][0] >= all[i - 1][0] + all[i - 1][1], 'no overlap');
});

test('every mapped cue refers to a known sound (all event types)', () => {
  const events = [
    { type: 'swing', kind: 'attack', combo: 1, index: 0, last: true }, { type: 'swing', kind: 'attack', combo: 5, index: 3, last: true },
    { type: 'swing', kind: 'heavy' }, { type: 'swing', kind: 'special', flurry: true, index: 4 }, { type: 'swing', kind: 'special' },
    { type: 'airSlash' }, { type: 'plunge' }, { type: 'jump' }, { type: 'land', plunge: true }, { type: 'land' },
    { type: 'hit', source: 'attack' }, { type: 'hit', source: 'heavy' }, { type: 'hit', role: 'breakable' }, { type: 'hit', role: 'lantern' }, { type: 'hit', source: 'special', armored: true },
    { type: 'guard' }, { type: 'guardBreak' }, { type: 'sidestep' }, { type: 'airEvade' }, { type: 'dodge' }, { type: 'hurt' },
    { type: 'knockback', source: 'heavy' }, { type: 'kill', role: 'grunt' }, { type: 'kill', role: 'officer' }, { type: 'kill', role: 'boss' },
    { type: 'enemyAttack', role: 'boss' }, { type: 'enemyAttack', role: 'officer' }, { type: 'enemyAttack', role: 'grunt' },
    { type: 'telegraph', role: 'boss' }, { type: 'groundTelegraph' }, { type: 'special' }, { type: 'musouStart', true: true },
    { type: 'musouFinish' }, { type: 'pickup', kind: 'bun' }, { type: 'pickup', kind: 'bigBun' }, { type: 'pickup', kind: 'wine' },
    { type: 'heal' }, { type: 'drop' }, { type: 'breakableBroken', breakType: 'jar' }, { type: 'breakableBroken', breakType: 'crate' },
    { type: 'lanternBroken' }, { type: 'lanternSpawn' }, { type: 'summon' }, { type: 'group' }, { type: 'officer' }, { type: 'officerDown' },
    { type: 'bossDown' }, { type: 'bossIntro' }, { type: 'roar' }, { type: 'bossSlam' }, { type: 'bossSweep' }, { type: 'bossJump' },
    { type: 'gateOpen' }, { type: 'gateClose' }, { type: 'lampHit' }, { type: 'lampBroken' }, { type: 'lampSecured' }, { type: 'lampRestored' },
  ];
  const seen = new Set();
  for (const event of events) {
    const res = mapEvent(event, createEventState(), fixed(0));
    assert.ok(res.cues.length > 0, `${event.type} ${JSON.stringify(event)} maps to a sound`);
    for (const c of res.cues) { assert.ok(SOUNDS[c.id], `${event.type} → ${c.id}`); seen.add(c.id); }
  }
  // everything except the UI click is reachable from game events
  for (const id of Object.keys(SOUNDS)) if (id !== 'ui_click') assert.ok(seen.has(id), `${id} reachable`);
});

test('swings: light chain, full-circle finisher, heavy, musou flurry pitch climb; slash is silent in musou mode', () => {
  const st = createEventState();
  assert.deepEqual(ids(mapEvent({ type: 'swing', kind: 'attack', combo: 2, index: 0, last: true }, st)), ['swing_light']);
  assert.deepEqual(ids(mapEvent({ type: 'swing', kind: 'attack', combo: 5, index: 2, last: false }, st)), ['swing_light']);
  assert.deepEqual(ids(mapEvent({ type: 'swing', kind: 'attack', combo: 5, index: 3, last: true }, st)), ['swing_heavy']);
  assert.deepEqual(ids(mapEvent({ type: 'swing', kind: 'heavy', combo: 1, index: 0, last: true }, st)), ['swing_heavy']);
  const a = mapEvent({ type: 'swing', kind: 'special', flurry: true, index: 0 }, st).cues[0];
  const b = mapEvent({ type: 'swing', kind: 'special', flurry: true, index: 8 }, st).cues[0];
  assert.equal(a.id, 'swing_musou');
  assert.ok(b.rate > a.rate, 'later flurry swings pitch up');
  assert.deepEqual(ids(mapEvent({ type: 'slash', kind: 'attack' }, createEventState())), []);
  const legacy = createEventState({ slashWhoosh: true });
  assert.deepEqual(ids(mapEvent({ type: 'slash', kind: 'heavy' }, legacy)), ['swing_heavy']);
  mapEvent({ type: 'swing', kind: 'attack', combo: 1 }, legacy);
  assert.deepEqual(ids(mapEvent({ type: 'slash', kind: 'attack' }, legacy)), [], 'once swing events arrive, slash stays quiet');
});

test('hits and kills use the target role learnt from spawn events', () => {
  const st = createEventState();
  mapEvent({ type: 'spawn', enemyId: 7, role: 'breakable' }, st);
  mapEvent({ type: 'spawn', enemyId: 8, role: 'lantern' }, st);
  mapEvent({ type: 'spawn', enemyId: 9, role: 'grunt' }, st);
  mapEvent({ type: 'spawn', enemyId: 10, role: 'officer' }, st);
  assert.deepEqual(ids(mapEvent({ type: 'hit', enemyId: 7, source: 'heavy' }, st)), ['hit_prop']);
  assert.deepEqual(ids(mapEvent({ type: 'hit', enemyId: 8, source: 'attack' }, st)), ['hit_lantern']);
  assert.deepEqual(ids(mapEvent({ type: 'hit', enemyId: 9, source: 'attack' }, st)), ['hit_light']);
  assert.deepEqual(ids(mapEvent({ type: 'hit', enemyId: 9, source: 'heavy', armored: true }, st)), ['hit_heavy', 'guard']);
  assert.deepEqual(ids(mapEvent({ type: 'kill', enemyId: 7, role: 'breakable' }, st)), [], 'breakableBroken plays instead');
  assert.deepEqual(ids(mapEvent({ type: 'kill', enemyId: 9, role: 'grunt' }, st, fixed(0.9))), ['soul_burst']);
  assert.deepEqual(ids(mapEvent({ type: 'kill', enemyId: 10, role: 'officer' }, st)), ['hit_finisher', 'soul_burst']);
  assert.equal(st.roles.has(9), false, 'kill forgets the role');
  assert.deepEqual(ids(mapEvent({ type: 'breakableBroken', breakType: 'jar' }, st)), ['break_jar']);
  assert.deepEqual(ids(mapEvent({ type: 'breakableBroken', breakType: 'barrel' }, st)), ['break_wood']);
});

test('grunt voices are probabilistic, officer / boss voices are not', () => {
  const st = createEventState();
  assert.deepEqual(ids(mapEvent({ type: 'enemyAttack', role: 'grunt' }, st, fixed(0.9))), []);
  assert.deepEqual(ids(mapEvent({ type: 'enemyAttack', role: 'grunt' }, st, fixed(0.1))), ['oni']);
  assert.deepEqual(ids(mapEvent({ type: 'enemyAttack', role: 'officer' }, st, fixed(0.9))), ['oni']);
  assert.deepEqual(ids(mapEvent({ type: 'enemyAttack', role: 'boss' }, st, fixed(0.9))), ['boss_grunt']);
  assert.deepEqual(ids(mapEvent({ type: 'telegraph', role: 'grunt' }, st)), [], 'grunt wind-ups stay quiet (crowds)');
});

test('pickups by kind; the heal that follows a pickup does not double up', () => {
  const st = createEventState();
  st.now = 10;
  assert.deepEqual(ids(mapEvent({ type: 'pickup', kind: 'bun' }, st)), ['pickup_charm']);
  assert.deepEqual(ids(mapEvent({ type: 'heal' }, st)), []);
  st.now = 12;
  assert.deepEqual(ids(mapEvent({ type: 'heal' }, st)), ['heal'], 'segment heal chimes');
  assert.deepEqual(ids(mapEvent({ type: 'pickup', kind: 'bigBun' }, st)), ['pickup_lamp']);
  assert.deepEqual(ids(mapEvent({ type: 'pickup', kind: 'wine' }, st)), ['pickup_crystal']);
});

test('music follows segments, boss intro, single-stage waves and the result stings', () => {
  assert.deepEqual([0, 1, 2, 3].map(musicForSegment), ['market', 'plaza', 'plaza', 'boss']);
  const st = createEventState();
  assert.equal(mapEvent({ type: 'segment', index: 2 }, st).music.play, 'plaza');
  assert.equal(mapEvent({ type: 'bossIntro' }, st).music.play, 'boss');
  assert.equal(mapEvent({ type: 'wave', wave: 1 }, st).music.play, 'market');
  assert.equal(mapEvent({ type: 'wave', wave: 'boss' }, st).music.play, 'boss');
  for (const type of ['clear', 'win']) assert.equal(mapEvent({ type }, st).music.play, 'victory');
  for (const type of ['fail', 'dead']) assert.equal(mapEvent({ type }, st).music.play, 'defeat');
});

test('musou ducks the music: start, deeper at the finisher, released at the end', () => {
  const st = createEventState();
  const start = mapEvent({ type: 'musouStart', true: true, duration: 5 }, st);
  assert.equal(start.cues[0].variant, 1, '真・無雙 uses the stronger variant');
  assert.ok(start.duck.level < 1 && start.duck.hold >= 5);
  const fin = mapEvent({ type: 'musouFinish', true: false }, st);
  assert.equal(fin.cues[0].variant, 0);
  assert.ok(fin.duck.level < start.duck.level, 'finisher ducks deeper');
  assert.equal(mapEvent({ type: 'musouEnd' }, st).duck.level, 1);
  assert.ok(mapEvent({ type: 'officerDown' }, st).duck.level < 1);
});

test('voice limiter: per-sound max, minimum gap, stealing the oldest, global priority cap', () => {
  const lim = new VoiceLimiter({ a: { max: 2, gap: 0.05, prio: 1 }, b: { max: 2, gap: 0, prio: 1, steal: true }, hi: { max: 9, gap: 0, prio: 3 }, lo: { max: 9, gap: 0, prio: 0 } }, 4);
  assert.equal(lim.request('a', 0, 1).ok, true);
  assert.equal(lim.request('a', 0.01, 1).reason, 'gap');
  assert.equal(lim.request('a', 0.1, 1).ok, true);
  assert.equal(lim.request('a', 0.2, 1).reason, 'max');
  assert.equal(lim.request('a', 1.2, 1).ok, true, 'voices free up after they end');
  const h1 = { n: 1 }, h2 = { n: 2 };
  lim.clear();
  lim.request('b', 0, 1, h1); lim.request('b', 0.1, 1, h2);
  const r = lim.request('b', 0.2, 1, { n: 3 });
  assert.equal(r.ok, true); assert.equal(r.steal, h1, 'oldest voice is stolen');
  lim.clear();
  const low = { low: true };
  lim.request('lo', 0, 5, low); lim.request('lo', 0, 5); lim.request('lo', 0, 5); lim.request('lo', 0, 5);
  const hi = lim.request('hi', 0.1, 1);
  assert.equal(hi.ok, true); assert.equal(hi.steal, low, 'high priority evicts low priority at the global cap');
  assert.equal(lim.request('lo', 0.2, 1).reason, 'global');
  lim.release(hi.steal);
  assert.equal(lim.active.length, 4);
});

test('SOUNDS rules are sane for crowds (hits and kills limited, stealing enabled)', () => {
  for (const [id, r] of Object.entries(SOUNDS)) {
    assert.ok(r.max >= 1 && r.max <= 4, id);
    assert.ok(r.gap >= 0.02, id);
    assert.ok(r.gain > 0 && r.gain <= 1, id);
  }
  for (const id of ['hit_light', 'hit_heavy', 'soul_burst', 'swing_light']) assert.equal(SOUNDS[id].steal, true, id);
});

test('smoothLoopSeam makes the wrap continuous even when the encoded copies differ', () => {
  const sr = 1000, a = 200, b = 1200, n = 1500;
  const ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = Math.sin(2 * Math.PI * 7 * i / sr);   // period 1000 samples = loop length
  for (let i = b - 40; i < b; i++) ch[i] += 0.3;                           // codec-like mismatch right before loopEnd
  assert.ok(Math.abs(ch[a] - ch[b - 1]) > 0.25, 'discontinuous before');
  const faded = smoothLoopSeam([ch], sr, a / sr, b / sr, 0.02);
  assert.equal(faded, 20);
  const step = Math.abs(ch[a] - ch[b - 1]);
  const natural = Math.abs(Math.sin(2 * Math.PI * 7 * a / sr) - Math.sin(2 * Math.PI * 7 * (a - 1) / sr));
  assert.ok(step <= natural + 1e-6, `wrap step ${step} vs natural ${natural}`);
});

test('marker calibration finds the burst and converts to a sprite base', () => {
  const sr = 8000, x = new Float32Array(sr * 0.3);
  const centre = manifest.sfx.marker + manifest.sfx.markerLen / 2 + 0.01;   // decoder shifted by 10 ms
  x[Math.round(centre * sr)] = 0.9;
  x[Math.round(0.25 * sr)] = 1.0;                                            // first real sound: outside the window
  const found = findMarker(x, sr);
  assert.ok(Math.abs(found - centre) < 2 / sr);
  assert.ok(Math.abs(spriteOffset(manifest.sfx, found) - (manifest.sfx.marker + 0.01)) < 2 / sr);
  assert.equal(spriteOffset(manifest.sfx, null), manifest.sfx.marker, 'no marker → nominal positions');
  assert.equal(findMarker(new Float32Array(100), sr), null);
});

test('settings persist and survive broken storage', () => {
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  saveSettings(storage, { muted: true, music: 2, sfx: 0.3 });
  assert.deepEqual(loadSettings(storage), { muted: true, music: 1, sfx: 0.3 });
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadSettings(broken), DEFAULT_SETTINGS);
  assert.doesNotThrow(() => saveSettings(broken, DEFAULT_SETTINGS));
  mem.set(STORAGE_KEY, '{not json');
  assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
});

test('slow-motion follower ignores hit-stops and freezes but follows the musou slow-mo', () => {
  const s = new SlowMo();
  for (let i = 0; i < 4; i++) s.update(1 / 60, 0.06);   // 67 ms hit-stop
  assert.ok(s.value > 0.99);
  for (let i = 0; i < 5; i++) s.update(1 / 60, 1);
  for (let i = 0; i < 40; i++) s.update(1 / 60, 0.3);   // 0.67 s at 0.3×
  assert.ok(s.value < 0.45, `value ${s.value}`);
  for (let i = 0; i < 120; i++) s.update(1 / 60, 1);
  assert.ok(s.value > 0.95);
});

// ------------------------------------------------------------------ runtime with a fake Web Audio

function fakeWebAudio() {
  const log = { started: [], ctx: null };
  const param = v => ({ value: v, setValueAtTime(x) { this.value = x; }, setTargetAtTime(x) { this.value = x; }, exponentialRampToValueAtTime(x) { this.value = x; },
    linearRampToValueAtTime(x) { this.value = x; }, cancelScheduledValues() {} });
  const node = extra => ({ connect(n) { return n; }, disconnect() {}, ...extra });
  class Ctx {
    constructor() { this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 8000; this.destination = node(); log.ctx = this; }
    createGain() { return node({ gain: param(1) }); }
    createBiquadFilter() { return node({ type: '', frequency: param(20000), Q: param(1) }); }
    createDynamicsCompressor() { return node({ threshold: param(0), knee: param(0), ratio: param(1), attack: param(0), release: param(0) }); }
    createStereoPanner() { return node({ pan: param(0) }); }
    createBuffer(c, n, sr) { return { numberOfChannels: c, length: n, sampleRate: sr, getChannelData: () => new Float32Array(n) }; }
    createBufferSource() {
      const s = node({ playbackRate: param(1), loop: false, start(...args) { log.started.push({ buffer: s.buffer, args, loop: s.loop, loopStart: s.loopStart, loopEnd: s.loopEnd, rate: s.playbackRate.value }); }, stop() {} });
      return s;
    }
    decodeAudioData(ab) {
      const kind = new TextDecoder().decode(new Uint8Array(ab));
      const sr = 8000;
      if (kind === 'sfx.mp3') {
        const d = new Float32Array(sr * 90);
        d[Math.round((manifest.sfx.marker + manifest.sfx.markerLen / 2) * sr)] = 0.9;
        return Promise.resolve({ kind, numberOfChannels: 1, sampleRate: sr, length: d.length, getChannelData: () => d });
      }
      const e = manifest.music[kind.replace('.mp3', '')];
      const len = Math.round((e.loop ? e.loopEnd + 0.5 : e.duration) * sr);
      const chans = [new Float32Array(len), new Float32Array(len)];
      return Promise.resolve({ kind, numberOfChannels: 2, sampleRate: sr, length: len, getChannelData: c => chans[c] });
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const fetchImpl = async url => {
    const name = String(url).split('/').pop();
    if (name === 'manifest.json') return { ok: true, json: async () => manifest };
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(name).buffer };
  };
  const listeners = {};
  const doc = { hidden: false, addEventListener(t, f) { (listeners[t] ||= []).push(f); }, removeEventListener() {} };
  return { Ctx, fetchImpl, doc, log, fire: t => (listeners[t] || []).forEach(f => f()) };
}

const tick = () => new Promise(r => setTimeout(r, 0));

test('createAudio: nothing before unlock; unlock starts music + sprite; events play sprite slices; mute persists', async () => {
  const fake = fakeWebAudio();
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const audio = createAudio({ baseUrl: 'x/', storage, fetchImpl: fake.fetchImpl, AudioContextClass: fake.Ctx, doc: fake.doc, rand: fixed(0.5) });
  audio.onEvent({ type: 'segment', index: 0 });
  assert.equal(fake.log.ctx, null, 'no AudioContext before the gesture');
  await audio.unlock();
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(fake.log.ctx.state, 'running');
  const music = fake.log.started.find(s => s.buffer?.kind === 'market.mp3');
  assert.ok(music, 'market music started after unlock');
  assert.equal(music.loop, true);
  assert.equal(music.loopStart, manifest.music.market.loopStart);
  assert.equal(music.args[1], manifest.music.market.loopStart, 'playback begins at loopStart');
  fake.log.started.length = 0;
  audio.onEvent({ type: 'spawn', enemyId: 3, role: 'grunt' });
  audio.onEvent({ type: 'hit', enemyId: 3, source: 'attack', x: 900, y: 500 });
  const hit = fake.log.started.find(s => s.buffer?.kind === 'sfx.mp3');
  assert.ok(hit, 'hit played from the sprite');
  const offsets = manifest.sfx.sounds.hit_light.map(([st]) => manifest.sfx.marker + st);
  assert.ok(offsets.some(o => Math.abs(o - hit.args[1]) < 1e-3), 'offset is one of the hit_light variants');
  // same-frame duplicates are limited by the minimum gap
  const before = fake.log.started.length;
  for (let i = 0; i < 6; i++) audio.onEvent({ type: 'hit', enemyId: 3, source: 'attack' });
  assert.equal(fake.log.started.length, before, 'gap blocks same-instant repeats');
  audio.setMuted(true);
  assert.equal(JSON.parse(mem.get(STORAGE_KEY)).muted, true);
  fake.log.started.length = 0;
  fake.log.ctx.currentTime = 5;
  audio.onEvent({ type: 'guard' });
  assert.equal(fake.log.started.length, 0, 'muted: silent');
  fake.doc.hidden = true; fake.fire('visibilitychange');
  assert.equal(fake.log.ctx.state, 'suspended');
  const again = createAudio({ baseUrl: 'x/', storage, fetchImpl: fake.fetchImpl, AudioContextClass: fake.Ctx, doc: fake.doc });
  assert.equal(again.state().muted, true, 'mute restored from storage');
  audio.dispose(); again.dispose();
});

test('createAudio: stings replace the loop; visibility resumes; slow-mo lowers the music cutoff', async () => {
  const fake = fakeWebAudio();
  const audio = createAudio({ baseUrl: 'x/', storage: null, fetchImpl: fake.fetchImpl, AudioContextClass: fake.Ctx, doc: fake.doc, rand: fixed(0.5) });
  await audio.unlock();
  audio.onEvent({ type: 'segment', index: 3 });
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(audio.state().track, 'boss');
  audio.onEvent({ type: 'bossDown' });
  audio.onEvent({ type: 'win' });
  audio.onEvent({ type: 'clear' });
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(audio.state().track, 'victory');
  assert.equal(fake.log.started.filter(s => s.buffer?.kind === 'victory.mp3').length, 1, 'win + clear play one sting');
  fake.doc.hidden = true; fake.fire('visibilitychange');
  assert.equal(fake.log.ctx.state, 'suspended');
  fake.doc.hidden = false; fake.fire('visibilitychange');
  assert.equal(fake.log.ctx.state, 'running');
  for (let i = 0; i < 60; i++) audio.update(1 / 60, 0.2, { x: 640, y: 500 });
  assert.ok(audio.context && audio.state().contextState === 'running');
  audio.dispose();
});
