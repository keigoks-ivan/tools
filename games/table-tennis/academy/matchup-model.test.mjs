import test from 'node:test';
import assert from 'node:assert/strict';
import { betaCdf, estimatePair, historicalRecord, recentRecord, verifiedMatches } from './matchup-model.mjs';
const match = (date, winner, event = date) => ({ date, winner, event });
const pair = matches => ({ a: 'lin', b: 'harimoto', recordScope: 'verifiedSample', matches });
test('uniform and integer beta distributions agree with closed forms', () => {
  for (const x of [0.001, 0.1, 0.5, 0.9, 0.999]) {
    assert.ok(Math.abs(betaCdf(x, 1, 1) - x) < 1e-10);
    assert.ok(Math.abs(betaCdf(x, 2, 1) - x * x) < 1e-10);
    assert.ok(Math.abs(betaCdf(x, 1, 2) - (2 * x - x * x)) < 1e-10);
  }
});
test('counts distinct matches once and does not count malformed or unrelated results', () => {
  const p = pair([match('2024-01-01', 'lin', 'Final'), match('2024-01-01', 'lin', 'Final'), match('not-a-date', 'lin'), match('2025-01-01', 'ma')]);
  assert.equal(verifiedMatches(p).length, 1); assert.deepEqual(historicalRecord(p), { winsA: 1, winsB: 0, n: 1, complete: false });
});
test('official career summary supersedes the smaller listed sample', () => {
  const p = { ...pair([match('2024-01-01', 'lin')]), recordScope: 'careerOfficial', officialSummary: { winsA: 8, winsB: 5 } };
  assert.deepEqual(historicalRecord(p), { winsA: 8, winsB: 5, n: 13, complete: true });
});
test('neutral equal-age results remain symmetric, with a wide interval at low sample size', () => {
  const p = pair([match('2026-10-05', 'lin', 'A'), match('2026-10-05', 'harimoto', 'B')]);
  const result = estimatePair(p, '2026-10-05'); assert.equal(result.probability, 0.5);
  assert.ok(Math.abs(result.low + result.high - 1) < 1e-10); assert.ok(result.high - result.low > 0.7);
});
test('swapping the two players reverses the forecast and its interval', () => {
  const p = pair([match('2024-01-01', 'lin'), match('2025-01-01', 'lin'), match('2026-01-01', 'harimoto')]);
  const first = estimatePair(p, '2026-10-05'), second = estimatePair({ ...p, a: p.b, b: p.a }, '2026-10-05');
  assert.ok(Math.abs(first.probability + second.probability - 1) < 1e-12);
  assert.ok(Math.abs(first.low + second.high - 1) < 1e-10);
});
test('recency can change the direction without using future results', () => {
  const p = pair([match('2020-01-01', 'lin'), match('2020-02-01', 'lin'), match('2026-10-04', 'harimoto'), match('2027-01-01', 'lin')]);
  const result = estimatePair(p, '2026-10-05', 365); assert.equal(result.n, 3); assert.ok(result.probability < 0.5);
  assert.deepEqual(recentRecord(p, '2026-10-05'), { n: 1, winsA: 0, winsB: 1 });
});
test('missing evidence produces no forecast; invalid parameters fail explicitly', () => {
  assert.equal(estimatePair(pair([]), '2026-10-05'), null);
  assert.throws(() => estimatePair(pair([]), '2026-10-05', 0), RangeError);
  assert.throws(() => estimatePair(pair([]), 'bad-date'), RangeError);
});
