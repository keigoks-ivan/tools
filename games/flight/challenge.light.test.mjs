// MQ-172 landing challenge: level data, starts, grading and flyability with the scripted light approach pilot (light.pilot.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNWAY, PROFILES, createFlightState, stepFlight, getFlightData } from './physics.mjs';
import { LEVELS, LIGHT_LEVELS, levelsFor, levelById, nextLevel, createLevelState, windAt, grade, parseProgress, THRESHOLDS, LIGHT_THRESHOLDS } from './challenge.mjs';
import { approachPilot } from './light.pilot.mjs';

const KT = 1.943844, GLIDE = Math.tan(RUNWAY.glideslope * Math.PI / 180);

function fly(level, { seconds = 400, flareAgl = PROFILES.light.challenge.flareAglM } = {}) {
  const s = createLevelState(level), mem = { flare: false, ig: 0, il: 0 };
  let d = getFlightData(s);
  for (let i = 0; i < seconds * 120 && !s.crashed; i++) {
    d = getFlightData(s);
    if (s.touchdown && s.onGround && d.groundSpeed < 2.5) break;
    stepFlight(s, approachPilot(s, d, mem, { flareAgl }), 1 / 120, { wind: windAt(level, s.elapsed) });
  }
  d = getFlightData(s);
  return { state: s, data: d, result: grade(s, d), time: s.elapsed };
}

test('levelsFor: jet list unchanged, light list has the same ids and carries aircraft: light', () => {
  assert.equal(levelsFor('jet'), LEVELS); assert.equal(levelsFor('light'), LIGHT_LEVELS); assert.equal(levelsFor(createFlightState('approach', 'light')), LIGHT_LEVELS);
  assert.equal(levelsFor(undefined), LEVELS);
  assert.deepEqual(LIGHT_LEVELS.map(l => l.id), LEVELS.map(l => l.id));
  assert.deepEqual(LIGHT_LEVELS.map(l => l.weather), LEVELS.map(l => l.weather));
  for (const l of LIGHT_LEVELS) { assert.equal(l.aircraft, 'light'); assert.ok(l.zh && l.en && l.descZh && l.descEn); }
  assert.ok(LEVELS.every(l => l.aircraft === undefined));
  assert.equal(levelById(3, 'light'), LIGHT_LEVELS[2]); assert.equal(levelById(3), LEVELS[2]);
  assert.equal(nextLevel(2, 'light'), LIGHT_LEVELS[2]); assert.equal(nextLevel(7, 'light'), null);
});

test('light level data: 4 km start, 150 m / 50 m offsets, 10 and 12 kt (peak 16) wind, level 6 high and fast', () => {
  assert.equal(LIGHT_LEVELS[0].start.km, 4);
  assert.deepEqual([LIGHT_LEVELS[1].start.right, LIGHT_LEVELS[1].start.above], [150, 50]);
  assert.equal(LIGHT_LEVELS[2].wind.cross, 10);
  assert.deepEqual([LIGHT_LEVELS[3].wind.cross, LIGHT_LEVELS[3].wind.gust], [12, 4]);
  assert.deepEqual([LIGHT_LEVELS[6].wind.cross, LIGHT_LEVELS[6].wind.gust], [10, 4]);
  const l6 = LIGHT_LEVELS[5].start; assert.deepEqual([l6.km, l6.above, l6.kt, l6.flaps], [3, 80, 95, 1]);
  assert.ok(!/擾流|spoiler/i.test(LIGHT_LEVELS.map(l => l.descZh + l.descEn).join(' ')));
  // peak crosswind over a long gust series reaches about 16 kt but not much more
  let peak = 0; for (let t = 0; t < 300; t += .1) peak = Math.max(peak, Math.abs(windAt(LIGHT_LEVELS[3], t).x) * KT);
  assert.ok(peak > 12 && peak <= 16.01, `peak ${peak}`);
});

test('start states: level 1 is the untouched light approach scenario; the others sit where the data says', () => {
  const base = createFlightState('approach', 'light'), l1 = createLevelState(LIGHT_LEVELS[0]);
  assert.equal(l1.aircraft, 'light'); assert.equal(l1.challenge, 1);
  assert.deepEqual({ ...l1, challenge: undefined }, { ...base, challenge: undefined });
  assert.equal(createLevelState(1, 'light').aircraft, 'light'); assert.equal(createLevelState(1).aircraft, 'jet');
  const gh = PROFILES.light.gearHeight, path = km => gh + (km * 1000 + RUNWAY.nearThreshold - RUNWAY.touchdownTarget) * GLIDE;
  const l2 = createLevelState(LIGHT_LEVELS[1]);
  assert.ok(Math.abs(l2.position.x - 150) < 1e-9 && Math.abs(l2.position.y - (path(4) + 50)) < 1e-9); assert.equal(l2.aircraft, 'light');
  const l6 = createLevelState(LIGHT_LEVELS[5]), d = getFlightData(l6);
  assert.ok(Math.abs(d.indicatedAirspeed * KT - 95) < 1.5, `${d.indicatedAirspeed * KT}`);
  assert.ok(Math.abs(d.distanceToThreshold - 3000) < 1e-6); assert.equal(l6.flaps, 1); assert.equal(l6.gear, true); assert.equal(l6.gearPosition, 1);
  assert.ok(Math.abs(l6.position.y - (path(3) + 80)) < 1e-9);
  assert.ok(Math.abs(d.pitch - d.aoa - -3) < .1 && Math.abs(d.verticalSpeed) < 6, `${d.pitch} ${d.aoa} ${d.verticalSpeed}`);
});

test('grade: light thresholds 300 fpm / 5 m / 300 m, jet thresholds untouched', () => {
  assert.deepEqual({ ...THRESHOLDS }, { sinkFpm: 360, offsetM: 6, spotM: 400 });
  assert.deepEqual({ ...LIGHT_THRESHOLDS }, { sinkFpm: 300, offsetM: 5, spotM: 300 });
  const mk = (aircraft, fpm, off, spot) => {
    const s = createFlightState('approach', aircraft);
    s.onGround = true; s.touchdown = { sinkRate: fpm / 196.85, lateralOffset: off, position: { x: off, y: 0, z: RUNWAY.touchdownTarget + spot } };
    return grade(s, { onRunway: true, groundSpeed: 0 });
  };
  assert.equal(mk('light', 320, 0, 0).checks[0].ok, false); assert.equal(mk('jet', 320, 0, 0).checks[0].ok, true);
  assert.equal(mk('light', 100, 5.5, 0).checks[1].ok, false); assert.equal(mk('jet', 100, 5.5, 0).checks[1].ok, true);
  assert.equal(mk('light', 100, 0, 350).checks[2].ok, false); assert.equal(mk('jet', 100, 0, 350).checks[2].ok, true);
  assert.equal(mk('light', 100, 1, 50).stars, 3);
});

test('progress parsing follows the aircraft list', () => {
  assert.deepEqual(parseProgress(JSON.stringify({ 1: 3, 6: 2, 9: 1 }), 'light'), { 1: 3, 6: 2 });
  assert.deepEqual(parseProgress(JSON.stringify({ 1: 3, 6: 2 })), { 1: 3, 6: 2 });
});

test('flyability: the scripted light pilot lands levels 1, 2, 3 and 5 with at least one star (4, 6, 7 are printed)', () => {
  for (const id of [1, 2, 3, 4, 5, 6, 7]) {
    const level = LIGHT_LEVELS[id - 1], r = fly(level), t = r.state.touchdown;
    console.log(`  light L${id}: ${r.result.stars} stars, ${r.state.crashed ? 'CRASH ' + r.state.crashReason : `sink ${Math.round(t.sinkRate * 196.85)} fpm, offset ${t.lateralOffset.toFixed(1)} m, spot ${Math.round(Math.abs(t.position.z - RUNWAY.touchdownTarget))} m`}, ${r.time.toFixed(0)} s`);
    if ([1, 2, 3, 5].includes(id)) { assert.ok(!r.state.crashed, `L${id} crashed: ${r.state.crashReason}`); assert.ok(r.result.stars >= 1, `L${id}: ${r.result.stars} stars`); assert.equal(r.result.pass, true); }
  }
});
