import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, ENCOUNTERS, INTRO, LINES, RELAY_RESTORE, lastLineEncounters, lastLineIntro, lastLineOpeningLines } from '../lastline/script.js';
import { Operation } from '../lastline/operations.mjs';

test('only the damaged handoff requires a local radio before the common convoy and customs missions', () => {
  const intact = lastLineEncounters('intact'), damaged = lastLineEncounters('damaged');
  assert.equal(lastLineEncounters(null), ENCOUNTERS);
  assert.equal(lastLineIntro('unknown'), INTRO);
  assert.equal(lastLineOpeningLines(null), LINES.start);
  assert.equal(damaged[0], RELAY_RESTORE);
  assert.deepEqual(damaged.slice(1).map(e => e.id), intact.map(e => e.id));
  assert.ok(intact.slice(1).every((e, i) => e === damaged[i + 2] && e === ENCOUNTERS[i + 1]));
  assert.equal(intact[0].enemies, damaged[1].enemies);
  assert.equal(ENCOUNTERS[0].pickups[0].id, 'port_call');
  assert.equal(intact[0].pickups[0].id, damaged[1].pickups[0].id);
  assert.notDeepEqual(intact[0].pickups[0].lines, damaged[1].pickups[0].lines);
  assert.equal(CHAPTERS[0].end.after, 'C7');
  assert.deepEqual(RELAY_RESTORE.enemies, []);
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
