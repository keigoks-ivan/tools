import test from 'node:test';
import assert from 'node:assert/strict';
import { Reinforcements, waveArrivalTime } from '../reinforcements.mjs';
import { Combat } from '../combat.js';
import { Encounter, parse } from '../encounter.js';
import { STAGE_DATA } from '../stages.js';
import { ENCOUNTERS, MECH6 } from '../zero/script.js';
import { ENCOUNTERS as LAST, MECH_CONFIGS } from '../lastline/script.js';

test('opening guards leave room to observe before larger resident groups', () => {
  for (const [encounters, start] of [[ENCOUNTERS, [-91.6, -91.6]], [LAST, [-180, -232]]]) {
    const first = encounters[0]; assert.equal(first.enemies.length, 1);
    const d = first.enemies[0]; assert(d.patrol?.length >= 2); assert(!d.alert);
    assert(Math.hypot(d.x - start[0], d.z - start[1]) >= 20);
    for (const [x, z] of d.patrol) assert(Math.hypot(x - start[0], z - start[1]) >= 18);
    assert(encounters[1].enemies.length > first.enemies.length);
  }
});
test('opening mech arrivals build from one unit to pairs and trios before support', () => {
  const wave = MECH6.waves[0];
  const times = [...wave.list, ...wave.reinforce].map((_, i) => waveArrivalTime(wave, i, true));
  assert.equal(times.filter(t => t <= 10).length, 1);
  assert.equal(times.filter(t => t <= 20).length, 3);
  assert.equal(times.filter(t => t < 24).length, 3);
  assert(times[wave.list.length] >= times[wave.list.length - 1] + 6);
  for (let i = 1; i < times.length; i++) assert(times[i] > times[i - 1]);
  for (const config of Object.values(MECH_CONFIGS)) {
    const w = config.waves[0]; const main = w.list.map((_, i) => waveArrivalTime(w, i, true));
    assert.equal(main.filter(t => t <= 10).length, 1);
    assert(waveArrivalTime(w, w.list.length, true) >= main.at(-1) + 6);
  }
  assert.equal(waveArrivalTime(wave, 2), 2.8);
  assert.equal(waveArrivalTime(wave, wave.list.length), 7);
});
test('first main-game area cannot overlap opening reinforcement waves immediately', () => {
  const E = parse(STAGE_DATA[0].route, 1), c = E.secs[0];
  assert.equal(c.pre.length, 1); assert.equal(c.waves[0].length, 1);
  assert.equal(c.pre.length + c.waves.flat().length, 8);
  const advances = [];
  const C = { def: {}, player: { pos: { x: -600, z: -480 } }, enemies: [], events: [], lines() {}, note() {}, audio: { ui() {} }, dead: false };
  const encounter = Object.assign(Object.create(Encounter.prototype), { C, E, sec: 0, N: E.secs.length, state: 'fight', beat: 1, beatT: 0, fightT: 0, beatSeen: new Set(), mine: [], queue: [], tg: [], peak: 0, prog: 180, ambush(b) { advances.push(b); this.beat = b; this.beatT = 0; } });
  for (let i = 0; i < 239; i++) encounter.update(.05);
  assert.deepEqual(advances, []);
  encounter.update(.1); assert.deepEqual(advances, [2]);
  encounter.update(.05); assert.deepEqual(advances, [2]);
});

test('infantry arrival queue holds at eight, spaces arrivals and drains every finite wave', () => {
  const queue = new Reinforcements(), enemies = Array.from({ length: 8 }, () => ({ dead: false }));
  queue.add(Array.from({ length: 20 }, (_, i) => ({ id: i })), 0, 2);
  const spawn = def => { const e = { ...def, dead: false }; enemies.push(e); return e; };
  assert.equal(queue.tick(10, 8, spawn), null); assert.equal(queue.pending.length, 20);
  enemies[0].dead = true; assert.equal(queue.tick(10, 7, spawn).id, 0);
  enemies[1].dead = true; assert.equal(queue.tick(10.1, 7, spawn), null);
  assert.equal(queue.tick(10.71, 7, spawn).id, 1);
  for (let t = 11; t < 40; t += .05) {
    for (const e of enemies) e.dead = true;
    queue.tick(t, 0, spawn); assert(enemies.filter(e => !e.dead).length <= 8);
  }
  assert.equal(queue.pending.length, 0); assert.equal(new Set(enemies.filter(e => e.id !== undefined).map(e => e.id)).size, 20);
});
test('reinforcement due time is independent of the most recently requested wave', () => {
  const q = new Reinforcements(); q.add([{ id: 'later' }], 0, 7); q.add([{ id: 'alarm' }], 1, 1.5);
  assert.equal(q.tick(2, 0, d => d), null); assert.equal(q.tick(2.5, 0, d => d).id, 'alarm');
  assert.equal(q.tick(6, 0, d => d), null); assert.equal(q.tick(7, 0, d => d).id, 'later');
});
test('mech event queue respects seven or nine live units while death events stay timely', () => {
  for (const cap of [7, 9]) {
    const C = Object.assign(Object.create(Combat.prototype), { enemyCap: cap, enemies: Array.from({ length: cap }, () => ({ dead: false })), events: [] });
    const spawned = []; let ended = false;
    for (let i = 0; i < 12; i++) C.events.push({ spawn: true, t: i * .1, fn: () => { spawned.push(i); C.enemies.push({ dead: false }); } });
    C.events.push({ t: .2, fn: () => { ended = true; } });
    C.updateEvents(3); assert(ended); assert.equal(spawned.length, 0); assert.equal(C.events.length, 12);
    C.enemies[0].dead = true; C.updateEvents(.1); assert.deepEqual(spawned, [0]);
    C.enemies[1].dead = true; C.updateEvents(.1); assert.equal(spawned.length, 1);
    for (let i = 0; i < 300; i++) { for (const e of C.enemies) e.dead = true; C.updateEvents(.05); assert(C.enemies.filter(e => !e.dead).length <= cap); }
    assert.equal(C.events.length, 0); assert.deepEqual(spawned, Array.from({ length: 12 }, (_, i) => i));
  }
});
test('all three campaigns have finite authored reinforcements and leave infiltration objectives optional', () => {
  assert.equal(ENCOUNTERS.flatMap(e => e.response?.enemies || []).length, 12);
  assert.equal(LAST.flatMap(e => e.response?.enemies || []).length, 19);
  assert.equal(MECH6.waves.flatMap(w => w.reinforce || []).length, 8);
  assert.equal(Object.values(MECH_CONFIGS).flatMap(c => c.waves).flatMap(w => w.reinforce).length, 22);
  for (const E of [...ENCOUNTERS, ...LAST]) {
    if (E.operation?.bypass) assert(!E.response);
    for (const d of E.response?.enemies || []) { assert(Number.isFinite(d.x)); assert(Number.isFinite(d.z)); assert(E.response.delay >= 5); }
  }
  for (const W of [ ...MECH6.waves, ...Object.values(MECH_CONFIGS).flatMap(c => c.waves) ]) {
    assert(W.reinforce.length <= 2);
    assert(W.reinforce.every(d => d[0] === 'grunt' && Number.isFinite(d[1]) && Number.isFinite(d[2])));
    assert(W.reinforce.every(d => W.list.some(p => p[1] === d[1] && p[2] === d[2])));
  }
});
