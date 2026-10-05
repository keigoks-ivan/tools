// MQ-172 sightseeing route 'valley': route data, limits, terrain report (dev/check_tours.py light block) and the scripted pilot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RUNWAY, PROFILES, getFlightData } from './physics.mjs';
import { AIRPORT, AP_MAX_FT, apFloorFt } from './airport.mjs';
import { LIGHT_CIRCUIT, LIGHT_CIRCUIT_ALT_FT, LIGHT_FINAL_ALT_FT } from './light.pilot.mjs';
import { TOURS, LIGHT_TOURS, LIGHT_LIMITS, RING, toursFor, tourById, legs, tourLengthM, createTourState, nextRingCue, createTourRun, parseTourBest, formatTime } from './tour.mjs';
import { flyTour } from './tour.pilot.mjs';

const KT = 1.943844, FT = 3.28084, G = 9.80665, RAD = Math.PI / 180;
const valley = LIGHT_TOURS[0];

test('toursFor and tourById: jet keeps alps + city, light gets valley only', () => {
  assert.equal(toursFor('jet'), TOURS); assert.equal(toursFor('light'), LIGHT_TOURS); assert.equal(toursFor({ aircraft: 'light' }), LIGHT_TOURS); assert.equal(toursFor(undefined), TOURS);
  assert.deepEqual(TOURS.map(t => t.id), ['alps', 'city']); assert.deepEqual(LIGHT_TOURS.map(t => t.id), ['valley']);
  assert.equal(tourById('valley'), valley); assert.equal(tourById('alps'), TOURS[0]); assert.equal(tourById('nope'), null);
  assert.deepEqual(parseTourBest(JSON.stringify({ alps: 300, valley: 480, x: 1 })), { alps: 300, valley: 480 });
});

test('route data: bilingual, whole-number coordinates, 8 rings, alps scenery, 100 kt, landmarks with facts', () => {
  const t = valley;
  assert.ok(t.zh && t.en && t.descZh && t.descEn && t.tagZh && t.tagEn);
  assert.equal(t.aircraft, 'light'); assert.equal(t.scenery, 'alps'); assert.equal(t.startKt, 100); assert.equal(t.rings.length, 8);
  for (const p of [t.start, ...t.rings]) for (const k of ['x', 'z', 'altFt']) assert.ok(Number.isInteger(p[k]), k);
  assert.deepEqual(t.rings.map(r => r.altFt), [3500, 3400, 3300, 3200, 3200, 3250, 3350, 3400]);
  assert.deepEqual([t.start.x, t.start.z, t.start.altFt], [-13450, -65357, 3500]);
  assert.deepEqual(t.landmarks.map(l => l.id), ['walensee', 'churfirsten', 'quinten', 'seerenbach', 'weesen', 'naefels', 'glarus', 'glaernisch']);
  for (const l of t.landmarks) { assert.ok(l.zh && l.en && l.factZh && l.factEn && l.radiusM >= 1000, l.id); assert.ok(Number.isFinite(l.x) && Number.isFinite(l.z)); assert.doesNotMatch(l.zh + l.factZh, /[\u4e00-\u9fff][,.:;]/, `${l.id} half-width punctuation`); }
  // reused landmarks are identical to the jet 'alps' route
  for (const id of ['walensee', 'churfirsten', 'quinten', 'glaernisch']) assert.deepEqual({ ...t.landmarks.find(l => l.id === id) }, { ...TOURS[0].landmarks.find(l => l.id === id) });
  assert.ok(Object.isFrozen(valley) && Object.isFrozen(valley.rings));
});

test('LIGHT_LIMITS: legs >= 2 km, turns <= 75 deg, climb <= 2 %, descent <= 4 %, 5-9 min; the profile carries the same numbers', () => {
  assert.equal(LIGHT_LIMITS.minLegM, 2000); assert.equal(LIGHT_LIMITS.maxTurnDeg, 75); assert.equal(LIGHT_LIMITS.maxClimbPct, 2); assert.equal(LIGHT_LIMITS.maxDescentPct, 4);
  assert.equal(LIGHT_LIMITS.minMinutes, 5); assert.equal(LIGHT_LIMITS.maxMinutes, 9);
  assert.equal(PROFILES.light.tour.startKt, 100); assert.equal(PROFILES.light.tour.bankDeg, 30); assert.deepEqual({ ...LIGHT_LIMITS }, { ...PROFILES.light.tour.limits });
});

test('flyability: legs, turns, gradients, altitudes, duration; every leg after a turn is long enough for the autopilot bank at 100 kt', () => {
  const t = valley, L = legs(t), pts = [t.start, ...t.rings];
  for (const [i, l] of L.entries()) {
    assert.ok(l.lengthM >= LIGHT_LIMITS.minLegM, `leg ${i}: ${l.lengthM.toFixed(0)} m`);
    assert.ok(Math.abs(l.turnDeg) <= LIGHT_LIMITS.maxTurnDeg, `ring ${i - 1} turn ${l.turnDeg.toFixed(1)} deg`);
    assert.ok(l.gradePct <= LIGHT_LIMITS.maxClimbPct && -l.gradePct <= LIGHT_LIMITS.maxDescentPct, `leg ${i}: ${l.gradePct.toFixed(2)} %`);
  }
  for (const p of pts) assert.ok(p.altFt >= apFloorFt() && p.altFt <= AP_MAX_FT);
  const minutes = tourLengthM(t) / (t.startKt / KT) / 60; assert.ok(minutes >= LIGHT_LIMITS.minMinutes && minutes <= LIGHT_LIMITS.maxMinutes, `${minutes.toFixed(1)} min`);
  const density = altFt => Math.pow(Math.max(216.65, 288.15 - altFt / FT * .0065) / 288.15, 4.2561);
  for (let i = 1; i < L.length; i++) {
    const tas = t.startKt / KT / Math.sqrt(density(pts[i].altFt)), R = tas * tas / (G * Math.tan(PROFILES.light.ap.bank * RAD));
    assert.ok(L[i].lengthM >= 1.05 * 2 * R * Math.sin(Math.abs(L[i].turnDeg) * RAD), `leg ${i}: ${L[i].lengthM.toFixed(0)} m, turn ${L[i].turnDeg.toFixed(0)} deg, R ${R.toFixed(0)} m`);
  }
});

test('terrain report (dev/check_tours.py light block): current ring list, vertical clearance, valley walls, flown track', () => {
  const report = JSON.parse(readFileSync(new URL('./dev/tour_clearance.json', import.meta.url), 'utf8')), r = report.light, v = r.tours.valley;
  const flat = LIGHT_TOURS.map(t => [t.id, [t.start.x, t.start.z, t.start.altFt], ...t.rings.map(p => [p.x, p.z, p.altFt])]);
  assert.equal(r.ringsHash, createHash('sha256').update(JSON.stringify(flat)).digest('hex').slice(0, 16), 'light block is stale: run python3 games/flight/dev/check_tours.py');
  assert.equal(r.ok, true); assert.equal(v.ok, true); assert.equal(report.ok, true);
  assert.equal(v.ringClearFt.length, valley.rings.length); assert.equal(v.legs.length, valley.rings.length);
  for (const c of v.ringClearFt) assert.ok(c >= LIGHT_LIMITS.ringClearFt, `ring ${c} ft`);
  for (const l of v.legs) assert.ok(l.minClearFt >= LIGHT_LIMITS.legClearFt, `leg ${l.to}: ${l.minClearFt} ft`);
  assert.ok(v.walls.minLeftM >= LIGHT_LIMITS.wallM && v.walls.minRightM >= LIGHT_LIMITS.wallM, `walls ${v.walls.minLeftM} / ${v.walls.minRightM} m`);
  assert.ok(v.walls.minSumM >= v.walls.requiredSumM && v.walls.requiredSumM > 1000); assert.equal(v.walls.dropFt, LIGHT_LIMITS.wallDropFt);
  assert.ok(v.flown.minClearFt >= LIGHT_LIMITS.flownClearFt && v.flown.minWallM >= LIGHT_LIMITS.flownWallM, JSON.stringify(v.flown));
  assert.equal(v.flown.hits, valley.rings.length); assert.ok(v.flown.maxBankDeg <= 31);
  // the jet blocks are still there and untouched in shape
  assert.deepEqual(Object.keys(report.tours), ['alps', 'city']);
});

test('start state: level at 3,500 ft, trimmed 100 kt, flaps 0, fixed gear down, nose on the first ring, light fuel', () => {
  const s = createTourState(valley), d = getFlightData(s), first = legs(valley)[0];
  assert.equal(s.aircraft, 'light'); assert.equal(s.tour, 'valley'); assert.equal(s.scenario, 'cruise');
  assert.ok(Math.abs(d.indicatedAirspeed * KT - 100) < 3, `${d.indicatedAirspeed * KT}`);
  assert.ok(Math.abs(d.verticalSpeed) < .3 && Math.abs(d.roll) < .5);
  assert.equal(s.flaps, 0); assert.equal(s.gear, true); assert.equal(s.gearPosition, 1); assert.equal(s.autopilot.enabled, false);
  assert.ok(Math.abs(((d.heading - first.heading + 540) % 360) - 180) < 1);
  assert.deepEqual([s.position.x, s.position.z], [valley.start.x, valley.start.z]);
  assert.ok(Math.abs((s.position.y + RUNWAY.fieldElevation) * FT - 3500) < 1);
  assert.equal(s.fuel, PROFILES.light.initialFuel); assert.equal(s.elapsed, 0); assert.ok(!s.crashed && !s.onGround);
  const c = nextRingCue(createTourRun(valley), s, d); assert.equal(c.count, 8); assert.ok(Math.abs(c.diff) < 1);
  const j = createTourState(TOURS[1]); assert.equal(j.aircraft, 'jet'); assert.equal(j.gear, false); // the jet start is unchanged
});

test('scripted pilot (30 deg bank, 100 kt) flies the valley through every ring in 5-9 minutes', () => {
  const r = flyTour(valley, { track: true });
  assert.ok(!r.state.crashed); assert.equal(r.run.hits, valley.rings.length, `hits ${r.run.hits}, offsets ${r.run.offsets}`);
  assert.ok(r.run.offsets.every(o => o <= RING.radius)); assert.ok(r.maxBank <= 31, `bank ${r.maxBank}`);
  assert.ok(r.time >= 5 * 60 && r.time <= 9 * 60, `${r.time.toFixed(0)} s`);
  assert.ok(r.track.length > 400 && r.track[0].t === 0);
  console.log(`  valley: ${formatTime(r.time)} (${r.time.toFixed(0)} s), ${r.run.hits}/${valley.rings.length} rings, worst offset ${Math.max(...r.run.offsets)} m, max bank ${r.maxBank.toFixed(1)} deg, ${(tourLengthM(valley) / 1000).toFixed(1)} km`);
});

test('the route goes past every landmark it names', () => {
  const pts = [valley.start, ...valley.rings];
  for (const l of valley.landmarks) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) for (let f = 0; f <= 1; f += .01) best = Math.min(best, Math.hypot(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f - l.x, pts[i - 1].z + (pts[i].z - pts[i - 1].z) * f - l.z));
    assert.ok(best <= l.radiusM, `${l.id}: closest approach ${best.toFixed(0)} m, radius ${l.radiusM}`);
  }
});

test('AIRPORT.lightCircuit matches light.pilot.mjs LIGHT_CIRCUIT, 2,900 / 2,300 ft', () => {
  const c = AIRPORT.lightCircuit;
  assert.deepEqual(c.waypoints.map(p => ({ ...p })), LIGHT_CIRCUIT.map(p => ({ ...p })));
  assert.equal(c.altFt, LIGHT_CIRCUIT_ALT_FT); assert.equal(c.finalAltFt, LIGHT_FINAL_ALT_FT); assert.equal(AIRPORT.circuitAltFt, 4500);
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.waypoints));
});
