import test from 'node:test';
import assert from 'node:assert/strict';
import { readLapRecord, writeLapRecord } from './records.mjs';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const ghost = [[0, 10, 2, 4, .1, 0], [70, 10, 2, 4, .1, 1700]];

test('best laps and ghosts are isolated by both track and vehicle', () => {
  const store = storage();
  writeLapRecord(store, 'costa', 'ferrari458', 70, ghost);
  writeLapRecord(store, 'alpine', 'ferrari458', 95, []);
  writeLapRecord(store, 'costa', 'apexR', 60, []);
  assert.deepEqual(readLapRecord(store, 'costa', 'ferrari458'), { best: 70, ghost });
  assert.equal(readLapRecord(store, 'alpine', 'ferrari458').best, 95);
  assert.equal(readLapRecord(store, 'costa', 'apexR').best, 60);
  assert.deepEqual(readLapRecord(store, 'alpine', 'apexR'), { best: null, ghost: [] });
});

test('existing coastal Ferrari records survive the expanded garage', () => {
  const store = storage();
  store.setItem('apex.costa.v1', JSON.stringify({ best: 74, ghost }));
  assert.deepEqual(readLapRecord(store, 'costa', 'ferrari458'), { best: 74, ghost });
  assert.equal(readLapRecord(store, 'costa', 'conceptGT').best, null);
  assert.equal(readLapRecord(store, 'canyon', 'ferrari458').best, null);
  writeLapRecord(store, 'costa', 'ferrari458', 69, []);
  assert.deepEqual(readLapRecord(store, 'costa', 'ferrari458'), { best: 69, ghost: [] });
});

test('corrupt local records cannot introduce invalid lap times or ghost poses', () => {
  const store = storage();
  store.setItem('apex.lap.v2.costa.ferrari458', '{');
  assert.equal(readLapRecord(store, 'costa', 'ferrari458').best, null);
  writeLapRecord(store, 'costa', 'ferrari458', 0, ghost);
  assert.equal(readLapRecord(store, 'costa', 'ferrari458').best, null);
  writeLapRecord(store, 'costa', 'ferrari458', 70, [[1, null, 2, 3, 4, 5]]);
  assert.deepEqual(readLapRecord(store, 'costa', 'ferrari458'), { best: 70, ghost: [] });
});

test('unavailable browser storage leaves the game playable', () => {
  const store = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(readLapRecord(store, 'costa', 'ferrari458'), { best: null, ghost: [] });
  assert.doesNotThrow(() => writeLapRecord(store, 'costa', 'ferrari458', 70, ghost));
});
