import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RUNWAY, getFlightData } from './physics.mjs';
import { AP_MAX_FT, apFloorFt } from './airport.mjs';
import { TOURS, RING, LIMITS, START_KT, tourById, legs, tourLengthM, ringNormal, createTourState, createTourRun, updateTourRun, nextRingCue, nearestLandmark, parseTourBest, recordTourBest, formatTime, ringHeightM } from './tour.mjs';
import { flyTour } from './tour.pilot.mjs';

const KT = 1.943844, FT = 3.28084, G = 9.80665;

test('two routes with complete, bilingual data and whole-number coordinates', () => {
  assert.deepEqual(TOURS.map(t => t.id), ['alps', 'city']);
  for (const t of TOURS) {
    assert.ok(t.zh && t.en && t.descZh && t.descEn && ['alps', 'city'].includes(t.scenery), t.id);
    assert.ok(t.rings.length >= 5 && t.rings.length <= 9, `${t.id} ring count`);
    for (const p of [t.start, ...t.rings]) for (const k of ['x', 'z', 'altFt']) assert.ok(Number.isInteger(p[k]), `${t.id} ${k} must be an integer (dev/check_tours.py hashes it)`);
    assert.ok(t.landmarks.length >= 4);
    for (const l of t.landmarks) { assert.ok(l.zh && l.en && l.factZh && l.factEn && l.radiusM >= 1000, l.id); assert.ok(Number.isFinite(l.x) && Number.isFinite(l.z)); }
    assert.equal(tourById(t.id), t);
  }
  assert.equal(tourById('nope'), null);
});

test('flyability: legs >= 3 km, turns <= 60 deg, gradients <= 5 %, altitudes inside the autopilot range', () => {
  for (const t of TOURS) {
    for (const [i, l] of legs(t).entries()) {
      assert.ok(l.lengthM >= LIMITS.minLegM, `${t.id} leg ${i}: ${l.lengthM.toFixed(0)} m`);
      assert.ok(Math.abs(l.turnDeg) <= LIMITS.maxTurnDeg, `${t.id} ring ${i - 1} turn ${l.turnDeg.toFixed(1)} deg`);
      assert.ok(Math.abs(l.gradePct) <= LIMITS.maxGradePct, `${t.id} leg ${i}: ${l.gradePct.toFixed(1)} %`);
    }
    for (const p of [t.start, ...t.rings]) assert.ok(p.altFt >= apFloorFt() && p.altFt <= AP_MAX_FT);
    const minutes = tourLengthM(t) / (START_KT / KT) / 60;
    assert.ok(minutes >= 4 && minutes <= 7, `${t.id} ${minutes.toFixed(1)} min at ${START_KT} kt`);
  }
});

// A 25 degree bank at the start speed turns on a circle of radius TAS^2 / (g tan 25). After a turn of theta the next ring must lie outside that
// circle by a margin, i.e. the leg must be at least 2 R sin(theta) (x1.05), or no pilot at 25 degrees of bank could reach it.
test('flyability: every leg after a turn is long enough for a 25 degree bank at the start speed', () => {
  const density = altFt => Math.pow(Math.max(216.65, 288.15 - altFt / FT * .0065) / 288.15, 4.2561);
  for (const t of TOURS) {
    const L = legs(t), pts = [t.start, ...t.rings];
    for (let i = 1; i < L.length; i++) {
      const tas = START_KT / KT / Math.sqrt(density(pts[i].altFt)), R = tas * tas / (G * Math.tan(25 * Math.PI / 180));
      assert.ok(L[i].lengthM >= 1.05 * 2 * R * Math.sin(Math.abs(L[i].turnDeg) * Math.PI / 180), `${t.id} leg ${i}: ${L[i].lengthM.toFixed(0)} m, turn ${L[i].turnDeg.toFixed(0)} deg, R ${R.toFixed(0)} m`);
    }
  }
});

test('terrain clearance (dev/tour_clearance.json from dev/check_tours.py): current ring list, >= 1,000 ft at rings, >= 800 ft along legs', () => {
  const report = JSON.parse(readFileSync(new URL('./dev/tour_clearance.json', import.meta.url), 'utf8'));
  // Same recipe as rings_hash() in check_tours.py: editing a ring without re-running the script makes this fail.
  const flat = TOURS.map(t => [t.id, [t.start.x, t.start.z, t.start.altFt], ...t.rings.map(r => [r.x, r.z, r.altFt])]);
  assert.equal(report.ringsHash, createHash('sha256').update(JSON.stringify(flat)).digest('hex').slice(0, 16), 'tour_clearance.json is stale: run python3 games/flight/dev/check_tours.py');
  for (const t of TOURS) {
    const r = report.tours[t.id];
    assert.equal(r.ringClearFt.length, t.rings.length); assert.equal(r.legs.length, t.rings.length);
    for (const [i, c] of r.ringClearFt.entries()) assert.ok(c >= LIMITS.ringClearFt, `${t.id} ring ${i}: ${c} ft`);
    for (const l of r.legs) assert.ok(l.minClearFt >= LIMITS.legClearFt, `${t.id} leg ${l.to}: ${l.minClearFt} ft`);
    assert.equal(r.ok, true);
  }
});

test('start state: level, trimmed, flaps 0, gear up, at the start altitude, nose on the first ring', () => {
  for (const t of TOURS) {
    const s = createTourState(t), d = getFlightData(s), first = legs(t)[0];
    assert.equal(s.tour, t.id); assert.equal(s.scenario, 'cruise');
    assert.ok(Math.abs(d.indicatedAirspeed * KT - START_KT) < 3, `${d.indicatedAirspeed * KT}`);
    assert.ok(Math.abs(d.verticalSpeed) < .3 && Math.abs(d.roll) < .5 && Math.abs(d.pitch - d.aoa) < 1.5);
    assert.equal(s.flaps, 0); assert.equal(s.gear, false); assert.equal(s.gearPosition, 0); assert.equal(s.autopilot.enabled, false);
    assert.ok(Math.abs(((d.heading - first.heading + 540) % 360) - 180) < 1);
    assert.deepEqual([s.position.x, s.position.z], [t.start.x, t.start.z]);
    assert.ok(Math.abs((s.position.y + RUNWAY.fieldElevation) * FT - t.start.altFt) < 1);
    assert.equal(s.elapsed, 0); assert.ok(!s.crashed && !s.onGround);
  }
});

test('scripted pilot (25 deg bank, 200 kt) flies every route through every ring', () => {
  for (const t of TOURS) {
    const r = flyTour(t);
    assert.ok(!r.state.crashed, `${t.id} crashed`);
    assert.equal(r.run.hits, t.rings.length, `${t.id}: hits ${r.run.hits}/${t.rings.length}, offsets ${r.run.offsets}`);
    assert.ok(r.run.offsets.every(o => o <= RING.radius));
    assert.ok(r.maxBank <= 26, `bank ${r.maxBank}`);
    assert.ok(r.time >= 4 * 60 && r.time <= 7 * 60, `${t.id}: ${r.time.toFixed(0)} s`);
    console.log(`  ${t.id}: ${formatTime(r.time)} (${r.time.toFixed(0)} s), ${r.run.hits}/${t.rings.length} rings, worst offset ${Math.max(...r.run.offsets)} m, max bank ${r.maxBank.toFixed(1)} deg, ${(tourLengthM(t) / 1000).toFixed(1)} km`);
  }
});

test('ring passing: inside the radius is a hit, outside a miss, both advance; wrong direction and teleports do nothing', () => {
  const t = TOURS[0], r0 = t.rings[0], n = ringNormal(t, 0), y0 = ringHeightM(r0);
  assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-9);
  const side = { x: -n.z, z: n.x }; // horizontal, in the ring plane
  const at = (along, off, up = 0) => ({ x: r0.x + n.x * along + side.x * off, y: y0 + n.y * along + up, z: r0.z + n.z * along + side.z * off });
  const fly = (run, off, up = 0) => { updateTourRun(run, at(-300, off, up)); return updateTourRun(run, at(30, off, up)); };
  let run = createTourRun(t);
  assert.deepEqual(fly(run, 0), [{ type: 'hit', index: 0 }]); assert.deepEqual([run.next, run.hits, run.misses], [1, 1, 0]);
  run = createTourRun(t); assert.deepEqual(fly(run, RING.radius - 10), [{ type: 'hit', index: 0 }]);
  run = createTourRun(t); assert.deepEqual(fly(run, RING.radius + 20), [{ type: 'miss', index: 0 }]); assert.deepEqual([run.next, run.hits, run.misses], [1, 0, 1]);
  run = createTourRun(t); assert.deepEqual(fly(run, 0, RING.radius + 20), [{ type: 'miss', index: 0 }]); // too high
  run = createTourRun(t); updateTourRun(run, at(300, 0)); assert.deepEqual(updateTourRun(run, at(-30, 0)), []); // flying backwards through it
  run = createTourRun(t); updateTourRun(run, at(-3000, 0)); assert.deepEqual(updateTourRun(run, at(30, 0)), []); // 3 km jump = teleport, not a pass
  run = createTourRun(t); assert.deepEqual(updateTourRun(run, at(-300, 0)), []); // first call only records the position
  // all rings in a row: done, no more events
  run = createTourRun(t);
  for (const [i, r] of t.rings.entries()) {
    const m = ringNormal(t, i), c = { x: r.x, y: ringHeightM(r), z: r.z };
    updateTourRun(run, { x: c.x - m.x * 100, y: c.y - m.y * 100, z: c.z - m.z * 100 });
    assert.equal(updateTourRun(run, { x: c.x + m.x * 10, y: c.y + m.y * 10, z: c.z + m.z * 10 })[0]?.type, 'hit');
  }
  assert.equal(run.done, true); assert.equal(run.hits, t.rings.length);
  assert.deepEqual(updateTourRun(run, at(30, 0)), []);
});

test('next-ring cue: distance, turn direction and altitude', () => {
  const t = TOURS[1], s = createTourState(t), d = getFlightData(s), run = createTourRun(t);
  const c = nextRingCue(run, s, d);
  assert.equal(c.index, 0); assert.equal(c.count, t.rings.length); assert.equal(c.altFt, t.rings[0].altFt);
  assert.ok(Math.abs(c.distanceM - legs(t)[0].lengthM) < 1 && Math.abs(c.diff) < 1);
  run.done = true; assert.equal(nextRingCue(run, s, d), null);
});

test('landmark captions: nearest inside its radius, nothing far away', () => {
  const city = tourById('city'), hb = city.landmarks.find(l => l.id === 'hb'), outlet = city.landmarks.find(l => l.id === 'limmat');
  assert.equal(nearestLandmark(city, { x: hb.x, z: hb.z }).id, 'hb');
  assert.equal(nearestLandmark(city, { x: outlet.x, z: outlet.z }).id, 'limmat');
  assert.equal(nearestLandmark(city, { x: 0, z: 40000 }), null);
  const alps = tourById('alps');
  assert.equal(nearestLandmark(alps, { x: alps.landmarks[2].x, z: alps.landmarks[2].z }).id, 'quinten');
  // the routes actually go past what they promise: every landmark is inside its caption radius at some point along the legs
  for (const t of TOURS) for (const l of t.landmarks) {
    const pts = [t.start, ...t.rings]; let best = Infinity;
    for (let i = 1; i < pts.length; i++) for (let f = 0; f <= 1; f += .01) best = Math.min(best, Math.hypot(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f - l.x, pts[i - 1].z + (pts[i].z - pts[i - 1].z) * f - l.z));
    assert.ok(best <= l.radiusM, `${t.id}/${l.id}: closest approach ${best.toFixed(0)} m, radius ${l.radiusM}`);
  }
});

test('best times: parse, keep the faster one, format', () => {
  assert.deepEqual(parseTourBest('garbage'), {});
  assert.deepEqual(parseTourBest(JSON.stringify({ alps: 300, city: -1, other: 5, x: 'a' })), { alps: 300 });
  let best = recordTourBest({}, 'alps', 312.34); assert.deepEqual(best, { alps: 312.3 });
  assert.equal(recordTourBest(best, 'alps', 330), best); assert.deepEqual(recordTourBest(best, 'alps', 290), { alps: 290 });
  assert.equal(formatTime(312.9), '05:12'); assert.equal(formatTime(5), '00:05');
});
