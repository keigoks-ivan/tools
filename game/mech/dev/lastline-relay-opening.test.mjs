import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, ENCOUNTERS, INTRO, LINES, RELAY_CUSTOMS, RELAY_RESTORE, lastLineEncounters, lastLineIntro, lastLineOpeningLines } from '../lastline/script.js';
import { createFootOperation } from '../lastline/foot-ops.js';
import { Operation } from '../lastline/operations.mjs';

test('only the damaged handoff requires a local radio before convoy contact', () => {
  const intact = lastLineEncounters('intact'), damaged = lastLineEncounters('damaged');
  assert.equal(lastLineEncounters(null), ENCOUNTERS);
  assert.equal(lastLineIntro('unknown'), INTRO);
  assert.equal(lastLineOpeningLines(null), LINES.start);
  assert.equal(damaged[0], RELAY_RESTORE);
  assert.deepEqual(damaged.slice(1).map(e => e.id), intact.map(e => e.id));
  assert.ok(intact.every((e, i) => ['B', 'B2', 'C4'].includes(e.id) || e === damaged[i + 1] && e === ENCOUNTERS[i]));
  assert.equal(intact[0].enemies, damaged[1].enemies);
  assert.equal(ENCOUNTERS[0].pickups[0].id, 'port_call');
  assert.equal(intact[0].pickups[0].id, damaged[1].pickups[0].id);
  assert.notDeepEqual(intact[0].pickups[0].lines, damaged[1].pickups[0].lines);
  assert.equal(CHAPTERS[0].end.after, 'C7');
  assert.deepEqual(RELAY_RESTORE.enemies, []);
});

test('relay branches enter customs at opposite doors and retain the same saved guard IDs', () => {
  const { intact, damaged } = RELAY_CUSTOMS;
  for (const [mode, route] of Object.entries(RELAY_CUSTOMS)) {
    const encounters = lastLineEncounters(mode);
    assert.equal(encounters.find(e => e.id === 'B2'), route);
    assert.equal(route.enemies, ENCOUNTERS.find(e => e.id === 'B2').enemies);
    assert.equal(route.operation.points.length, 1);
    assert.equal(encounters[encounters.indexOf(route) + 1].id, 'B3');
  }
  const at = E => ({ x: E.guide[0], z: E.guide[1] });
  assert.ok(intact.trigger(at(intact)) && !damaged.trigger(at(intact)));
  assert.ok(damaged.trigger(at(damaged)) && !intact.trigger(at(damaged)));
  assert.equal(intact.operation.bypass, true);
  assert.equal(damaged.operation.bypass, false);
  assert.notDeepEqual(lastLineEncounters('intact').find(e => e.id === 'C4').lines, lastLineEncounters('damaged').find(e => e.id === 'C4').lines);
});

test('the contact restore requires staying at the radio and holding the interaction to completion', () => {
  const task = new Operation(RELAY_RESTORE.operation), at = RELAY_RESTORE.guide;
  assert.ok(RELAY_RESTORE.trigger({ x: at[0], z: at[1] }));
  const tick = (seconds, player, held) => {
    for (let i = 0; i < seconds * 10; i++) task.step(.1, { player, held });
  };
  tick(4, [-180, -232], true);
  assert.equal(task.fraction, 0);
  tick(2, at, true);
  assert.ok(task.fraction > .6 && !task.done);
  tick(.1, at, false);
  assert.equal(task.fraction, 0);
  tick(3, at, true);
  assert.ok(task.done);
});

test('completing both customs verification terminals records only the earned clue', t => {
  const key = 'lastline.operations', files = new Map();
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: id => files.get(id) ?? null,
    setItem: (id, value) => files.set(id, value),
  } });
  t.after(() => {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else delete globalThis.localStorage;
  });
  for (const [route, clue] of [[null, undefined], ['intact', 'shift-log'], ['damaged', 'fax-copy']]) {
    files.set(key, JSON.stringify({ power: true }));
    const verify = lastLineEncounters(route).find(e => e.id === 'C4');
    const G = { player: { pos: {}, hurtT: 1 }, hud: { pins: [], note() {} } };
    const work = createFootOperation(verify, G, { keys: new Set(['KeyE']) });
    for (const point of verify.operation.points) {
      G.player.pos = { x: point[0], z: point[1] };
      for (let i = 0; i < point.seconds * 10; i++) work.update(.1);
      assert.deepEqual(JSON.parse(files.get(key)), { power: true });
    }
    assert(work.done);
    work.complete();
    assert.deepEqual(JSON.parse(files.get(key)), { power: true, evidence: true, ...(clue ? { customsClue: clue } : {}) });
  }
});
