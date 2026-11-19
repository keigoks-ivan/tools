import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldScores } from '../zero/campaign-score.mjs';
import { footCue, mechCue } from '../zero/campaign-cues.mjs';
import { MECH6 } from '../zero/script.js';
import { MECH_CONFIGS, drydockBreakoutConfig } from '../lastline/script.js';

test('both suites contain harmonized, distinct scores, and end before the credits leave', () => {
  const phrases = new Set();
  for (const [key, create] of Object.entries(fieldScores)) {
    const s = create(), events = s.ev.flat();
    assert.ok(s.orchestra);
    assert.ok(events.some(e => e.k === 'pad' && new Set(e.n).size >= 3), key);
    assert.ok(events.some(e => e.k === 'brass' && e.n.length === 3), key);
    const lead = events.filter(e => e.k === 'horn').slice(0, 12).map(e => [e.m, e.d]);
    const phrase = JSON.stringify(lead);
    assert.ok(!phrases.has(phrase), key);
    phrases.add(phrase);
    for (const e of events) {
      for (const m of e.n || (e.m != null ? [e.m] : [])) assert.ok(Number.isInteger(m) && m >= 24 && m <= 99, key);
      if (e.d != null) assert.ok(e.d > 0 && Number.isFinite(e.d), key);
    }
    if (!s.loop) assert.ok(s.len / 4 * 60 / s.bpm + s.tail < 20, key);
  }
});

test('key, power, manifest and relay change the foot score after load as well as on pickup', () => {
  const at = (sequel, ch, done, scenic = false, relay = null) => footCue(sequel, ch, new Set(done), scenic, relay);
  assert.equal(at(false, 3, []), 'zNorth');
  assert.equal(at(false, 3, ['KEY'], true), 'zKey');
  assert.equal(at(false, 5, ['G3']), 'zIgnite');
  assert.equal(at(true, 1, [], false, 'damaged'), 'lDark');
  assert.equal(at(true, 1, ['B0'], false, 'damaged'), 'lCustoms');
  assert.equal(at(true, 1, ['C6']), 'lManifest');
  assert.equal(at(true, 2, ['KEY']), 'lAuth');
  assert.notEqual(at(false, 1, [], true), at(true, 1, [], true));
});

test('boss music starts at contact, the two convoy decisions and the drydock have separate music', () => {
  assert.equal(mechCue(false, MECH6, 3, true), 'zHound');
  assert.equal(mechCue(false, MECH6, 7, false), 'zPursuit');
  assert.equal(mechCue(false, MECH6, 7, true), 'zDuel');
  const convoy = MECH_CONFIGS[4];
  assert.equal(mechCue(true, drydockBreakoutConfig(convoy, {}), 1, true), 'lBreak');
  assert.equal(mechCue(true, convoy, 2, false), 'lConvoy');
  assert.equal(mechCue(true, convoy, 2, false, 'rescue'), 'lRescue');
  assert.equal(mechCue(true, convoy, 2, false, 'artillery'), 'lBatteryRun');
  assert.equal(mechCue(true, MECH_CONFIGS[5], 2, true), 'lAir');
  const final = MECH_CONFIGS[7], last = final.waves.length - 1;
  assert.equal(mechCue(true, final, last, false), 'lGate');
  assert.equal(mechCue(true, final, last, true), 'lCaptain');
});
