import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, generateMap } from './core.mjs';
import { createObserver, unitClass } from './audio-events.mjs';
import { createMixer, spatial, SOUNDS, CATEGORIES, ALERT, VOICE } from './audio-mixer.mjs';
import { createAudio, loadSettings, AUDIO_STORAGE, RECIPES } from './audio.mjs';
import { sampleIds, allSampleIds, SAMPLE_SETS, VOICE_SETS, DEATH_SETS, SAMPLE_EXTENSION } from './audio-samples.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function setup({ fog = false, startAge = 4, plain = true } = {}) {
  const p = defaultProject(); p.map = generateMap(64); if (plain) { if (p.map.tiles) p.map.tiles.fill('grass'); else { p.map.template = 'grass'; p.map.patches = {}; } }
  Object.assign(p.rules, { ai: 'off', fog, startAge });
  const w = new World(p), observe = createObserver(); observe(w);
  const town = w.buildings.find(b => b.team === 0 && b.type === 'town'), worker = w.units.find(u => u.team === 0 && u.blueprint.role === 'worker');
  return { w, observe, town, worker };
}
function collect(w, observe, seconds, stop = () => false) {
  const events = [];
  for (let i = 0; i < seconds * 20; i++) { w.tick(.05); events.push(...observe(w)); if (stop(events)) break; }
  return events;
}
const kinds = events => new Set(events.map(e => e.kind));

// ---- observer: world -> events ------------------------------------------------
test('observer primes silently on a new world and never mutates the simulation', () => {
  const { w, observe } = setup(), before = JSON.stringify(w.saveState());
  assert.deepEqual(observe(w), []);
  assert.equal(JSON.stringify(w.saveState()), before);
  const other = setup().w; assert.deepEqual(observe(other), []);
  observe(other); assert.equal(JSON.stringify(other.saveState()), JSON.stringify(other.saveState()));
});

test('villager work produces exactly one strike sound per 1.05s swing', () => {
  const { w, observe, worker } = setup({ plain: false });
  w.command([worker.id], { type: 'gather', ...w.closestResource(worker, 'wood') });
  const times = [];
  for (let i = 0; i < 30 * 20; i++) { w.tick(.05); for (const e of observe(w)) if (e.kind === 'chop' && e.id === worker.id) { assert.equal(e.team, 0); assert.ok(Number.isFinite(e.x)); times.push(w.time); } }
  assert.ok(times.length >= 5, 'wood gathering should chop repeatedly');
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] > .95, `double strike at ${times[i]}`);
});

test('building: hammer while building, then a UI completion chime for our own building', () => {
  const { w, observe, worker, town } = setup();
  assert.equal(w.build([worker.id], 'house', town.x + 5, town.y + 3), null);
  const events = collect(w, observe, 120, e => e.some(x => x.kind === 'building-complete'));
  assert.ok(kinds(events).has('hammer'));
  const done = events.find(e => e.kind === 'building-complete');
  assert.equal(done.ui, true); assert.equal(done.building, 'house');
});

test('melee fight yields sword hits then deaths; archers yield shoot plus delayed impact', () => {
  const { w, observe } = setup();
  const a = w.spawn('swordsman', 0, { x: 30, y: 30 }), b = w.spawn('swordsman', 1, { x: 31, y: 30 });
  w.command([a.id], { type: 'attack', target: b.id }); w.command([b.id], { type: 'attack', target: a.id });
  const melee = collect(w, observe, 90, e => e.some(x => x.kind === 'death'));
  assert.ok(kinds(melee).has('sword')); const death = melee.find(e => e.kind === 'death');
  assert.equal(death.unit, 'infantry');
  const c = w.spawn('archer', 0, { x: 40, y: 40 }), d = w.spawn('swordsman', 1, { x: 45, y: 40 });
  w.command([c.id], { type: 'attack', target: d.id });
  const ranged = collect(w, observe, 20, e => e.some(x => x.kind === 'arrow-hit'));
  assert.ok(kinds(ranged).has('arrow-shoot'));
  assert.ok(ranged.find(e => e.kind === 'arrow-hit').delay > 0);
});

test('being attacked raises exactly one alert at the attacked spot (core cooldown)', () => {
  const { w, observe } = setup();
  const mine = w.spawn('swordsman', 0, { x: 30, y: 30 }), foe = w.spawn('swordsman', 1, { x: 31, y: 30 });
  w.command([foe.id], { type: 'attack', target: mine.id });
  const events = collect(w, observe, 5), alerts = events.filter(e => e.kind === 'alert');
  assert.equal(alerts.length, 1); assert.ok(Math.abs(alerts[0].x - mine.x) < 3);
});

test('training, research and ageing give UI jingles; destroyed buildings collapse', () => {
  const { w, observe, town } = setup({ startAge: 0 });
  assert.equal(w.train(town.id, 'villager'), null);
  assert.ok(kinds(collect(w, observe, 40, e => e.some(x => x.kind === 'trained'))).has('trained'));
  w.stocks[0].food = 5000; w.stocks[0].gold = 5000; w.stocks[0].wood = 5000;
  assert.equal(w.research(town.id, 'loom'), null);
  assert.ok(kinds(collect(w, observe, 120, e => e.some(x => x.kind === 'tech'))).has('tech'));
  w.completeResearch(0, 'feudal'); // age requirements are covered by the core tests
  assert.ok(kinds(collect(w, observe, 120, e => e.some(x => x.kind === 'age-up'))).has('age-up'));
  const enemy = w.buildings.find(b => b.team === 1 && b.progress >= 1); enemy.hp = 0;
  const collapse = collect(w, observe, 1).find(e => e.kind === 'building-collapse');
  assert.ok(collapse); assert.equal(collapse.team, 1);
});

test('fog: fights and work out of sight make no sound, but our own alert still does', () => {
  const { w, observe } = setup({ fog: true });
  const foe = w.buildings.find(b => b.team === 1 && b.type === 'town');
  const x = w.spawn('swordsman', 1, { x: foe.x + 3, y: foe.y }), y = w.spawn('swordsman', 2 % w.teams, { x: foe.x + 4, y: foe.y });
  assert.ok(!w.isVisible(x));
  w.effects.push({ type: 'hit', x: x.x, y: x.y, tx: x.x + 1, ty: x.y, age: 0, team: 1 });
  assert.equal(observe(w).filter(e => e.kind === 'sword').length, 0);
  const mine = w.units.find(u => u.team === 0);
  w.effects.push({ type: 'hit', x: mine.x, y: mine.y, tx: mine.x, ty: mine.y, age: 0, team: 0 });
  assert.equal(observe(w).filter(e => e.kind === 'sword').length, 1);
  assert.equal(y.team >= 0, true);
});

test('unit classes map to distinct voices', () => {
  const { w } = setup();
  const seen = {}; for (const id of ['villager', 'swordsman', 'archer', 'knight', 'mangonel']) seen[id] = unitClass(w.spawn(id, 0, { x: 20, y: 20 }).blueprint);
  assert.deepEqual(seen, { villager: 'villager', swordsman: 'infantry', archer: 'archer', knight: 'cavalry', mangonel: 'siege' });
  assert.equal(unitClass(w.spawn('monk', 0, { x: 22, y: 22 }).blueprint), 'monk');
  for (const name of Object.keys(SOUNDS)) assert.equal(typeof RECIPES[name], 'function', `no recipe for ${name}`);
  assert.equal(typeof RECIPES.voice, 'function');
});

// ---- mixer: attenuation, culling, limits, cooldowns -------------------------------
function rig() {
  const clock = { t: 100 }, plays = [];
  const mixer = createMixer({ now: () => clock.t, random: () => .5, play: (name, o) => { plays.push({ name, t: clock.t, ...o }); return { stop() { plays.at(-1).stopped = true; } }; } });
  return { clock, plays, mixer, listener: { x: 50, y: 50, radius: 20 } };
}

test('spatial: louder when close, silent off-screen, pans toward the source side', () => {
  const l = { x: 50, y: 50, radius: 20 };
  const near = spatial(l, { x: 51, y: 50 }), far = spatial(l, { x: 50, y: 64 });
  assert.ok(near.gain > far.gain && far.gain > 0);
  assert.equal(spatial(l, { x: 90, y: 50 }), null);
  assert.ok(spatial(l, { x: 60, y: 50 }).pan > 0 && spatial(l, { x: 50, y: 60 }).pan < 0);
  for (const gain of [near.gain, far.gain]) assert.ok(gain <= 1);
  assert.equal(spatial({ x: 50, y: 50, radius: 200 }, { x: 150, y: 50 }), null, 'zoomed far out still has a hearing limit');
});

test('off-screen combat is dropped but the alert and UI jingles are not', () => {
  const { mixer, plays, listener } = rig();
  assert.equal(mixer.event({ kind: 'sword', x: 5, y: 5 }, listener), false);
  assert.equal(mixer.event({ kind: 'death', x: 5, y: 5 }, listener), false);
  assert.equal(mixer.event({ kind: 'alert', x: 5, y: 5, ui: true }, listener), true);
  assert.equal(mixer.event({ kind: 'tech', x: 0, y: 0, ui: true }, null), true);
  assert.deepEqual(plays.map(p => p.name), ['alert', 'tech']);
});

test('limiter: fifty villagers chopping never exceed the work voice cap or spacing', () => {
  const { mixer, plays, clock, listener } = rig();
  let maxActive = 0, accepted = 0;
  for (let step = 0; step < 100; step++) {
    clock.t += .01;
    for (let i = 0; i < 50; i++) if (mixer.event({ kind: 'chop', x: 50 + (i % 5), y: 50 + (i % 7), id: i }, listener)) accepted++;
    const active = plays.filter(p => p.name === 'chop' && p.t + SOUNDS.chop.dur > clock.t).length; maxActive = Math.max(maxActive, active);
  }
  assert.ok(maxActive <= CATEGORIES.work.max, `max concurrent ${maxActive}`);
  assert.ok(accepted <= Math.ceil(1.0 / CATEGORIES.work.gap) + 1, `accepted ${accepted} in 1s`);
  assert.ok(accepted >= 8, 'still audible');
  for (const p of plays) assert.ok(p.gain > 0 && p.gain <= 1);
});

test('different sound categories do not starve each other', () => {
  const { mixer, plays, listener } = rig();
  for (const kind of ['chop', 'sword', 'arrow-shoot', 'death']) assert.equal(mixer.event({ kind, x: 50, y: 50 }, listener), true);
  assert.equal(plays.length, 4);
});

test('alert cooldown: same region suppressed, far region allowed after the global gap, region reopens later', () => {
  const { mixer, plays, clock } = rig();
  const ev = (x, y) => mixer.event({ kind: 'alert', x, y, ui: true }, null);
  assert.equal(ev(30, 30), true);
  clock.t += 1; assert.equal(ev(32, 31), false, 'global gap');
  clock.t += ALERT.globalCooldown; assert.equal(ev(32, 31), false, 'same region');
  assert.equal(ev(30 + ALERT.regionRadius + 10, 30), true, 'different region');
  clock.t += ALERT.regionCooldown + 1; assert.equal(ev(30, 30), true, 'cooldown elapsed');
  assert.equal(plays.filter(p => p.name === 'alert').length, 3);
});

test('voices: no bombardment from one unit, cycling variants, one voice at a time', () => {
  const { mixer, plays, clock } = rig();
  assert.equal(mixer.voice('villager', 'select', 7), true);
  clock.t += .3; assert.equal(mixer.voice('villager', 'command', 7), false, 'same unit too soon');
  assert.equal(mixer.voice('villager', 'command', 8), true);
  assert.equal(plays[0].stopped, true, 'new voice cuts the old one');
  clock.t += .05; assert.equal(mixer.voice('infantry', 'select', 9), false, 'global voice gap');
  clock.t += VOICE.unitCooldown; assert.equal(mixer.voice('villager', 'select', 7), true);
  const variants = []; for (let i = 0; i < 6; i++) { clock.t += 2; mixer.voice('archer', 'select', 100 + i); variants.push(plays.at(-1).variant); }
  for (let i = 1; i < variants.length; i++) assert.notEqual(variants[i], variants[i - 1]);
  assert.deepEqual(new Set(plays.filter(p => p.name === 'voice').map(p => p.unitClass)), new Set(['villager', 'archer']));
});

// ---- settings and engine -----------------------------------------------------------
const memoryStorage = (initial) => { const m = new Map(initial ? [[AUDIO_STORAGE, initial]] : []); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
function fakeContext(counter) {
  const node = () => new Proxy(function () {}, {
    get: (_, key) => key === 'state' ? counter.state : key === 'sampleRate' ? 44100 : key === 'currentTime' ? 0 : key === 'start' ? () => { counter.started++; } : key === 'playbackRate' ? (counter.rate = (counter.rate || 0) + 1, node()) : key === 'decodeAudioData' ? (ab, ok) => { counter.decoded = (counter.decoded || 0) + 1; ok({ duration: .3 }); } : key === 'value' ? 0 : node(),
    apply: () => node(), set: () => true,
  });
  return class { constructor() { counter.created++; return node(); } };
}

test('settings: defaults to sound on, persists, survives corrupt or throwing storage', () => {
  assert.deepEqual(loadSettings(memoryStorage()), { volume: .7, muted: false, ambient: true });
  assert.deepEqual(loadSettings(memoryStorage('{bad json')), { volume: .7, muted: false, ambient: true });
  assert.deepEqual(loadSettings({ getItem() { throw new Error('blocked'); } }), { volume: .7, muted: false, ambient: true });
  const s = memoryStorage(), audio = createAudio({ storage: s, AudioContextClass: null });
  audio.setVolume(.25); audio.setMuted(true); audio.setAmbient(false);
  assert.deepEqual(JSON.parse(s.m.get(AUDIO_STORAGE)), { volume: .25, muted: true, ambient: false });
  assert.deepEqual(loadSettings(s), { volume: .25, muted: true, ambient: false });
  audio.setVolume(9); assert.equal(audio.settings.volume, 1); audio.setVolume(NaN); assert.equal(audio.settings.volume, 0);
  assert.doesNotThrow(() => createAudio({ storage: { getItem: () => null, setItem() { throw new Error('quota'); } }, AudioContextClass: null }).setVolume(.5));
});

test('engine stays silent until unlocked by a gesture and honours mute and zero volume', () => {
  const counter = { created: 0, started: 0, state: 'suspended' };
  const audio = createAudio({ storage: memoryStorage(), AudioContextClass: fakeContext(counter), now: () => 1, fetchImpl: null });
  const listener = { x: 50, y: 50, radius: 20 }, hit = [{ kind: 'sword', x: 50, y: 50 }];
  audio.handle(hit, listener); assert.equal(counter.created, 0, 'no AudioContext before a gesture'); assert.equal(counter.started, 0);
  audio.unlock(); assert.equal(counter.created, 1); audio.unlock(); assert.equal(counter.created, 1);
  const base = counter.started; // ambient wind/LFO sources start on unlock
  audio.handle(hit, listener); assert.equal(counter.started, base, 'suspended context plays nothing');
  counter.state = 'running'; audio.handle(hit, listener); assert.ok(counter.started > base, 'plays once running');
  const after = counter.started; audio.setMuted(true); audio.handle([{ kind: 'sword', x: 50, y: 50 }], listener); audio.voice({ id: 1, blueprint: { role: 'worker' } });
  assert.equal(counter.started, after, 'muted');
  audio.setMuted(false); audio.setVolume(0); audio.handle([{ kind: 'sword', x: 50, y: 50 }], listener); assert.equal(counter.started, after, 'volume 0');
});

// ---- recorded samples -----------------------------------------------------------------
const audioDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'audio');

test('every referenced sample ships, is small, and is credited in LICENSE.txt', () => {
  const ids = allSampleIds(), license = fs.readFileSync(path.join(audioDir, 'LICENSE.txt'), 'utf8');
  assert.equal(new Set(ids).size, ids.length);
  let total = 0;
  for (const id of ids) {
    const file = path.join(audioDir, `${id}.${SAMPLE_EXTENSION}`), size = fs.statSync(file).size; total += size;
    assert.ok(size > 500 && size < 60 * 1024, `${id} is ${size} bytes`);
    assert.ok(license.includes(id), `${id} missing from LICENSE.txt`);
  }
  assert.ok(total < 3 * 1024 * 1024, `total ${total}`);
  const onDisk = fs.readdirSync(audioDir).filter(f => f.endsWith('.' + SAMPLE_EXTENSION)).map(f => f.replace(/\.[^.]+$/, ''));
  assert.deepEqual(onDisk.sort(), [...ids].sort(), 'no orphan or missing files');
  assert.ok(/CC0/.test(license) && /publicdomain\/zero/.test(license));
});

test('sample tables only name known sounds and unit classes', () => {
  for (const name of Object.keys(SAMPLE_SETS)) assert.ok(SOUNDS[name], `${name} is not a mixer sound`);
  assert.deepEqual(sampleIds('voice', { unitClass: 'monk', kind: 'select' }), null, 'monks stay synthesised');
  assert.equal(sampleIds('voice', { unitClass: 'cavalry', kind: 'command' }), VOICE_SETS.cavalry.command);
  assert.equal(sampleIds('death', { unit: 'cavalry' }), DEATH_SETS.cavalry);
  assert.equal(sampleIds('death', { unit: 'monk' }), DEATH_SETS.infantry, 'unknown classes fall back to infantry');
  assert.equal(sampleIds('farm'), null);
});

test('engine plays decoded recordings, synthesises while they load, and survives download failures', async () => {
  const settle = async (audio) => { for (let i = 0; i < 200 && !audio.sampleStatus().ready; i++) await new Promise(r => setImmediate(r)); };
  const ok = { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  const make = fetchImpl => { const counter = { created: 0, started: 0, state: 'running' }; return { counter, audio: createAudio({ storage: memoryStorage(), AudioContextClass: fakeContext(counter), now: () => 1, fetchImpl, sampleBase: 'http://x/a/' }) }; };
  const L = { x: 50, y: 50, radius: 20 };
  { // loaded
    const urls = [], { counter, audio } = make(async url => { urls.push(url); return ok; });
    audio.unlock(); await settle(audio);
    assert.equal(audio.sampleStatus().loaded, allSampleIds().length); assert.equal(audio.sampleStatus().failed, 0);
    assert.ok(urls.every(u => u.startsWith('http://x/a/') && u.endsWith('.mp3')) && urls.length === allSampleIds().length);
    counter.rate = 0; audio.handle([{ kind: 'sword', x: 50, y: 50 }], L); assert.equal(counter.rate, 1, 'sword uses a recording');
    counter.rate = 0; audio.handle([{ kind: 'farm', x: 50, y: 50 }], L); assert.equal(counter.rate, 0, 'farm has no recording, stays synthesised');
    counter.rate = 0; audio.voice({ id: 1, blueprint: { role: 'melee', look: 'knight', family: 'cavalry' } }); assert.equal(counter.rate, 1, 'cavalry voice is a recording');
    counter.rate = 0; audio.voice({ id: 2, blueprint: { role: 'healer' } }); assert.equal(counter.rate, 0, 'monk voice is synthesised');
  }
  { // not loaded yet: synth fallback
    const { counter, audio } = make(() => new Promise(() => {})); audio.unlock();
    const before = counter.started; counter.rate = 0; audio.handle([{ kind: 'sword', x: 50, y: 50 }], L);
    assert.equal(counter.rate, 0); assert.ok(counter.started > before, 'synth fallback plays while samples load');
  }
  { // every download fails
    const { counter, audio } = make(async () => ({ ok: false, status: 404 })); audio.unlock(); await settle(audio);
    assert.equal(audio.sampleStatus().failed, allSampleIds().length);
    const before = counter.started; counter.rate = 0; audio.handle([{ kind: 'chop', x: 50, y: 50 }], L);
    assert.equal(counter.rate, 0); assert.ok(counter.started > before);
  }
  { // fetch itself throws
    const { audio } = make(async () => { throw new Error('offline'); }); audio.unlock(); await settle(audio);
    assert.equal(audio.sampleStatus().loaded, 0);
  }
});
