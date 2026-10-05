// The jet model must stay bit-identical after the aircraft-profile refactor. golden.jet.json was generated from the
// pre-refactor code by make_golden.mjs. Every number in the golden file must match with ===; keys that only the new code adds
// (state.aircraft, data.engineRpm) are ignored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from './make_golden.mjs';

const golden = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'golden.jet.json'), 'utf8'));
const actual = build();

function same(a, e, path, bad) {
  if (bad.length) return;
  if (e === null || typeof e !== 'object') { if (a !== e) bad.push(`${path}: ${a} !== ${e}`); return; }
  if (a === null || typeof a !== 'object') { bad.push(`${path}: not an object`); return; }
  if (Array.isArray(e)) { if (!Array.isArray(a) || a.length !== e.length) { bad.push(`${path}: array length ${a?.length} !== ${e.length}`); return; } }
  for (const k of Object.keys(e)) same(a[k], e[k], `${path}.${k}`, bad);
}
const check = (name, a, e) => { const bad = []; same(a, e, name, bad); assert.deepEqual(bad, []); };

test('golden: initial states of all three scenarios', () => check('scenarios', actual.scenarios, golden.scenarios));
for (const run of Object.keys(golden.runs)) {
  test(`golden: ${run} (full state + instruments every 0.5 s)`, () => check(run, actual.runs[run], golden.runs[run]));
}
test('golden: all 7 challenge levels flown by the scripted pilot', () => check('levels', actual.levels, golden.levels));
test('golden: novice cues (nextStep, autoConfig, ilsCue) over approach and takeoff flights', () => check('novice', actual.novice, golden.novice));
test('golden: golden file is substantial', () => {
  assert.equal(Object.keys(golden.runs).length, 8);
  assert.equal(Object.keys(golden.levels).length, 7);
  assert.ok(golden.runs.takeoff.length > 200 && golden.novice.boxes.length > 20);
});
