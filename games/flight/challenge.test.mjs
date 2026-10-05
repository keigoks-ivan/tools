import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNWAY, createFlightState, getFlightData } from './physics.mjs';
import { LEVELS, levelById, nextLevel, createLevelState, windAt, grade, THRESHOLDS, bestStars, isUnlocked, recordResult, parseProgress, starText } from './challenge.mjs';
import { flyLevel } from './challenge.pilot.mjs';
import { approachActive, autoConfig } from './novice.mjs';

const KT = 1.943844;
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} differs from ${b}`);
const landed = (patch = {}, t = {}) => {
  const state = createFlightState('approach');
  Object.assign(state, { onGround: true, crashed: false, touchdown: { sinkRate: 1, lateralOffset: 1, roll: 0, speed: 70, position: { x: 1, y: 4, z: RUNWAY.touchdownTarget }, ...t } }, patch);
  const data = { onRunway: true, groundSpeed: 0, ...(patch.data || {}) };
  return { state, data };
};

test('seven frozen levels with sequential ids and both languages', () => {
  assert.equal(LEVELS.length, 7); assert.ok(Object.isFrozen(LEVELS) && LEVELS.every(l => Object.isFrozen(l)));
  LEVELS.forEach((l, i) => { assert.equal(l.id, i + 1); assert.ok(l.zh && l.en && l.descZh && l.descEn); });
  assert.equal(levelById(3).id, 3); assert.equal(nextLevel(7), null); assert.equal(nextLevel(2).id, 3);
});

test('level 1 starts exactly like the approach scenario; every level keeps scenario approach and stores its id', () => {
  const base = createFlightState('approach'), one = createLevelState(LEVELS[0]);
  assert.deepEqual({ ...one, challenge: undefined }, { ...base, challenge: undefined });
  for (const l of LEVELS) { const s = createLevelState(l); assert.equal(s.scenario, 'approach'); assert.equal(s.challenge, l.id); assert.equal(s.crashed, false); assert.equal(s.onGround, false); }
});

test('level 2 starts right of the course and above the glidepath; level 6 is 4 km out, high, fast, gear up, flaps 1', () => {
  const two = getFlightData(createLevelState(2));
  assert.ok(two.localizerDeviation > 1.5 && two.localizerDeviation < 1.8, 'right of course is positive');
  assert.ok(two.glideslopeDeviation > 0.6 && two.glideslopeDeviation < 1, 'above the path is positive');
  assert.equal(two.distanceToThreshold, 7000);
  assert.equal(createLevelState(2).position.x, 300);
  const base = createFlightState('approach'); near(createLevelState(2).position.y - base.position.y, 100);
  const s6 = createLevelState(6), d6 = getFlightData(s6);
  near(d6.distanceToThreshold, 4000); near(d6.indicatedAirspeed * KT, 190, 0.5);
  assert.equal(s6.gear, false); assert.equal(s6.gearPosition, 0); assert.equal(s6.flaps, 1); assert.equal(s6.flapPosition, 1);
  assert.ok(d6.glideslopeDeviation > 1.5 && d6.glideslopeDeviation < 2.5);
  near(d6.localizerDeviation, 0);
});

test('novice logic still treats every level as an approach and puts gear and flaps out on schedule', () => {
  for (const l of LEVELS) { const s = createLevelState(l), d = getFlightData(s); assert.equal(approachActive(s, d, 0), true); }
  const s = createLevelState(6), d = getFlightData(s);
  const change = autoConfig(s, d, { gear: s.gear, flaps: s.flaps }, {}, 0);
  assert.equal(change.gear, true);
});

test('windAt is deterministic, bounded and blows from the right', () => {
  assert.deepEqual(windAt(LEVELS[0], 12), { x: 0, y: 0, z: 0 });
  assert.deepEqual(windAt(LEVELS[4], 33), { x: 0, y: 0, z: 0 });
  for (const l of LEVELS.filter(l => l.wind.cross)) {
    let min = Infinity, max = -Infinity, zmax = 0;
    for (let t = 0; t < 400; t += 0.25) {
      const a = windAt(l, t), b = windAt(l, t);
      assert.deepEqual(a, b); assert.equal(a.y, 0);
      min = Math.min(min, -a.x * KT); max = Math.max(max, -a.x * KT); zmax = Math.max(zmax, Math.abs(a.z) * KT);
    }
    assert.ok(min >= l.wind.cross - l.wind.gust - 1e-6 && max <= l.wind.cross + l.wind.gust + 1e-6, `level ${l.id} crosswind range`);
    assert.ok(zmax <= l.wind.head + 1e-6);
    if (l.wind.gust) { assert.ok(max - min > l.wind.gust, 'gusts actually vary'); assert.ok(min > 0, 'never reverses to a left wind'); }
    else near(max, l.wind.cross, 1e-9);
    // from the right: the air moves toward -x, and the instrument wind direction (local frame) is 90 deg
    const s = createFlightState('approach'); s.wind = windAt(l, 3);
    const dir = getFlightData(s).windDirection; assert.ok(dir > 70 && dir < 110, `level ${l.id} wind direction ${dir}`);
  }
  near(windAt(3, 5).x * -KT, 10, 1e-9);
});

test('grade: stars are one per check; crash and off-runway score zero', () => {
  let { state, data } = landed();
  let g = grade(state, data);
  assert.equal(g.stars, 3); assert.equal(g.pass, true); assert.deepEqual(g.checks.map(c => c.id), ['sink', 'centre', 'spot']);
  assert.ok(g.checks.every(c => c.ok && c.zh && c.en));
  ({ state, data } = landed({}, { sinkRate: 361 / 196.85 })); g = grade(state, data);
  assert.deepEqual(g.checks.map(c => c.ok), [false, true, true]); assert.equal(g.stars, 2); assert.equal(g.pass, true);
  ({ state, data } = landed({}, { sinkRate: 359 / 196.85 })); assert.equal(grade(state, data).checks[0].ok, true);
  assert.match(grade(state, data).checks[0].zh, /359 呎／分/);
  ({ state, data } = landed({}, { lateralOffset: -6.1 })); g = grade(state, data);
  assert.deepEqual(g.checks.map(c => c.ok), [true, false, true]); assert.equal(g.stars, 2);
  ({ state, data } = landed({}, { lateralOffset: 5.9 })); assert.equal(grade(state, data).checks[1].ok, true);
  ({ state, data } = landed({}, { position: { x: 0, y: 4, z: RUNWAY.touchdownTarget - 401 } })); g = grade(state, data);
  assert.deepEqual(g.checks.map(c => c.ok), [true, true, false]);
  ({ state, data } = landed({}, { position: { x: 0, y: 4, z: RUNWAY.touchdownTarget + 399 } })); assert.equal(grade(state, data).checks[2].ok, true);
  ({ state, data } = landed({}, { sinkRate: 3, lateralOffset: 20, position: { x: 20, y: 4, z: 0 } })); g = grade(state, data);
  assert.equal(g.stars, 0); assert.equal(g.pass, false, 'a hard, off-centre, long landing that stays on the runway fails every check');
  ({ state, data } = landed({ crashed: true, crashReason: 'hard-landing' })); g = grade(state, data);
  assert.equal(g.stars, 0); assert.equal(g.pass, false);
  ({ state, data } = landed({}, {})); data.onRunway = false; g = grade(state, data);
  assert.equal(g.stars, 0); assert.equal(g.pass, false);
  ({ state, data } = landed()); data.groundSpeed = 20; g = grade(state, data);
  assert.equal(g.pass, false, 'not stopped yet'); assert.equal(g.stars, 3);
  state = createFlightState('approach'); g = grade(state, getFlightData(state));
  assert.equal(g.stars, 0); assert.equal(g.pass, false);
  assert.equal(THRESHOLDS.sinkFpm, 360);
});

test('progress: level 1 always open, level n opens with a star on n-1, best result is kept, bad storage is ignored', () => {
  let p = {};
  assert.equal(isUnlocked(p, 1), true); assert.equal(isUnlocked(p, 2), false);
  p = recordResult(p, 1, 0); assert.equal(isUnlocked(p, 2), false);
  p = recordResult(p, 1, 1); assert.equal(isUnlocked(p, 2), true); assert.equal(isUnlocked(p, 3), false);
  p = recordResult(p, 1, 3); p = recordResult(p, 1, 2); assert.equal(bestStars(p, 1), 3);
  assert.deepEqual(recordResult({}, 4, 2), { 4: 2 }); assert.equal(Object.keys(p).length, 1, 'recordResult does not mutate');
  assert.deepEqual(parseProgress('{"1":3,"2":"x","9":3,"3":7}'), { 1: 3, 3: 3 });
  assert.deepEqual(parseProgress('nonsense'), {}); assert.deepEqual(parseProgress(null), {});
  assert.equal(starText(2), '★★☆'); assert.equal(starText(0), '☆☆☆');
});

// Flyability: a scripted pilot (challenge.pilot.mjs) flies each level at 120 Hz with windAt. Levels 1, 2, 3 and 5 must land safely with at least one star;
// 4, 6 and 7 are only printed (the pilot is simple, so a miss there is information, not a failure).
const describe = (l, r) => `level ${l.id}: ${r.state.crashed ? `crashed (${r.state.crashReason})` : `stopped ${r.result.pass ? 'on the runway' : 'FAILED'}`}, ${r.result.stars} star(s), ${r.result.checks.map(c => `${c.id}=${c.value}`).join(' ')}, ${r.time.toFixed(0)} s`;
for (const l of LEVELS) {
  const mustPass = [1, 2, 3, 5].includes(l.id);
  test(`flyability: scripted pilot on level ${l.id} ${mustPass ? 'lands safely' : '(reported only)'}`, () => {
    const r = flyLevel(l); console.log(`  ${describe(l, r)}`);
    if (!mustPass) return;
    assert.equal(r.state.crashed, false, r.state.crashReason);
    assert.equal(r.result.pass, true); assert.ok(r.result.stars >= 1);
  });
}
