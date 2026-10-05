// MQ-172 novice mode: no gear steps, rotate at 55 kt, flap schedule inside Vfe, 65 kt approach bands, light circuit altitudes, boxes on the ILS path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, RUNWAY, createFlightState, stepFlight, getFlightData } from './physics.mjs';
import { AIRPORT } from './airport.mjs';
import { NOVICE, NOVICE_LIGHT, noviceFor, nextStep, autoConfig, approachActive, approachBoxes } from './novice.mjs';
import { takeoffPilot, approachPilot } from './light.pilot.mjs';
import { createLevelState, LIGHT_LEVELS } from './challenge.mjs';

const KT = 1.943844, FT = 3.28084, L = PROFILES.light;
const route = AIRPORT.lightCircuit.waypoints;
const make = (scenario, patch = () => {}, speedKt = 0) => {
  const state = createFlightState(scenario, 'light'); patch(state);
  const data = { ...getFlightData(state) }; if (speedKt) data.indicatedAirspeed = speedKt / KT;
  return { state, data };
};
const cmd = (o = {}) => ({ throttle: 0, flaps: 1, gear: true, trim: .15, spoilers: false, ...o });
const step = (s, d, c, ctx = {}) => nextStep(s, d, c, { routeIndex: 0, route, ...ctx });

test('noviceFor: jet is the untouched NOVICE object, light is its own table; accepts ids and states', () => {
  assert.equal(noviceFor('jet'), NOVICE); assert.equal(noviceFor(createFlightState('runway')), NOVICE); assert.equal(noviceFor(undefined), NOVICE);
  assert.equal(noviceFor('light'), NOVICE_LIGHT); assert.equal(noviceFor(createFlightState('runway', 'light')), NOVICE_LIGHT);
  assert.equal(NOVICE.rotateKt, Math.round(PROFILES.jet.rotateSpeed * KT)); assert.equal(NOVICE.light, undefined);
  assert.equal(NOVICE_LIGHT.rotateKt, 55);
  assert.deepEqual(NOVICE_LIGHT.flapExtend.map(r => [...r]), [[110, 1], [85, 3]]);
});

test('light takeoff: throttle, accelerate, rotate at 55 kt; never a gear step; flaps up at 70 kt', () => {
  let { state, data } = make('runway');
  assert.equal(step(state, data, cmd()).id, 'throttle');
  assert.equal(step(state, data, cmd({ throttle: 1 })).id, 'roll'); assert.match(step(state, data, cmd({ throttle: 1 })).zh, /55 節拉起/);
  ({ state, data } = make('runway', () => {}, 54)); assert.equal(step(state, data, cmd({ throttle: 1 })).id, 'roll');
  ({ state, data } = make('runway', () => {}, 56)); assert.equal(step(state, data, cmd({ throttle: 1 })).id, 'rotate');
  const lift = (o, kt) => make('runway', s => { s.onGround = false; Object.assign(s.position, { z: 0, ...o }); s.velocity = { x: 0, y: 3, z: -(kt / KT) }; });
  ({ state, data } = lift({ y: L.gearHeight + 5 }, 60)); assert.equal(step(state, data, cmd({ throttle: 1 })).id, 'climb');
  ({ state, data } = lift({ y: 150 }, 62)); // 150 m AGL at 62 kt: gear would be the jet's next step; here it is the flap wait... then circuit
  const s1 = step(state, data, cmd({ throttle: 1 })); assert.notEqual(s1.id, 'gear'); assert.notEqual(s1.glow, 'gear');
  ({ state, data } = lift({ y: 150 }, 72)); assert.equal(step(state, data, cmd({ throttle: 1 })).id, 'flaps');
  ({ state, data } = lift({ y: 150 }, 72)); assert.equal(step(state, data, cmd({ throttle: 1, flaps: 0 })).id, 'circuit');
});

test('autoConfig: never touches the gear (fixed gear), flaps by the 110 / 85 kt table, retract after take-off at 70 kt above 45 m', () => {
  const air = (kt, o = {}) => make('approach', s => { Object.assign(s, o); s.flaps = s.flapPosition = o.fl ?? 0; }, kt);
  for (const kt of [120, 105, 84, 60]) {
    const { state, data } = air(kt);
    const out = autoConfig(state, data, cmd({ flaps: 0, gear: false }), {}, 0); assert.equal(out.gear, undefined, `gear at ${kt} kt`);
  }
  let { state, data } = air(120); assert.equal(autoConfig(state, data, cmd({ flaps: 0 }), {}, 0).flaps, undefined);
  ({ state, data } = air(105)); assert.equal(autoConfig(state, data, cmd({ flaps: 0 }), {}, 0).flaps, 1);
  ({ state, data } = air(105, { fl: 1 })); assert.equal(autoConfig(state, data, cmd({ flaps: 1 }), {}, 0).flaps, undefined); // flaps 2 only below 85 kt
  ({ state, data } = air(84, { fl: 1 })); assert.equal(autoConfig(state, data, cmd({ flaps: 1 }), {}, 0).flaps, 2);
  ({ state, data } = air(84, { fl: 2 })); assert.equal(autoConfig(state, data, cmd({ flaps: 2 }), {}, 0).flaps, 3);
  // below the gear-extend height and sinking: the jet would lower the gear, the light must not
  ({ state, data } = make('approach', s => { s.position.y = 80; s.velocity.y = -3; }, 65)); assert.equal(autoConfig(state, data, cmd({ flaps: 3, gear: false }), {}, 0).gear, undefined);
  // after take-off
  const up = kt => make('runway', s => { s.onGround = false; s.position.y = 120; s.velocity = { x: 0, y: 3, z: -(kt / KT) }; }, kt);
  ({ state, data } = up(65)); assert.equal(autoConfig(state, data, cmd({ flaps: 1 }), {}, 0).flaps, undefined);
  ({ state, data } = up(72)); const mem = {}; assert.equal(autoConfig(state, data, cmd({ flaps: 1 }), mem, 0).flaps, 0); assert.equal(mem.flapsUp, true);
  assert.equal(autoConfig(state, data, cmd({ flaps: 0 }), mem, 0).flaps, undefined);
});

test('light approach: flaps 3 first (slow to 85 kt before it), then 55-75 kt bands around Vref 65', () => {
  const app = (kt, flaps, o = {}) => make('approach', s => { s.flaps = s.flapPosition = flaps; Object.assign(s.position, o); }, kt);
  let { state, data } = app(95, 1); let r = step(state, data, cmd({ flaps: 1 }));
  assert.equal(r.id, 'slow-down'); assert.match(r.zh, /85 節/); assert.doesNotMatch(r.zh + r.en, /起落架|gear/i);
  ({ state, data } = app(88, 1)); r = step(state, data, cmd({ flaps: 1 })); assert.equal(r.id, 'config'); assert.equal(r.glow, 'flaps'); assert.doesNotMatch(r.zh + r.en, /起落架|gear/i);
  ({ state, data } = app(70, 3)); assert.equal(step(state, data, cmd({ flaps: 3 })).id, 'final');
  ({ state, data } = app(80, 3)); assert.equal(step(state, data, cmd({ flaps: 3 })).id, 'final-fast');
  ({ state, data } = app(50, 3)); assert.equal(step(state, data, cmd({ flaps: 3 })).id, 'final-slow');
  ({ state, data } = app(65, 3)); assert.equal(step(state, data, cmd({ flaps: 3, gear: false })).id, 'final'); // a "gear up" command state is ignored
  // the flare cue
  ({ state, data } = app(65, 3, { y: 20 })); assert.equal(step(state, data, cmd({ flaps: 3 })).id, 'final');
  ({ state, data } = app(65, 3, { y: 7 })); r = step(state, data, cmd({ flaps: 3 })); assert.equal(r.id, 'flare'); assert.equal(NOVICE_LIGHT.flareAglM, 8);
  // gear notices never show for the light
  ({ state, data } = app(70, 3)); assert.equal(step(state, data, cmd({ flaps: 3 }), { notice: { gear: { age: 1, to: true } } }).id, 'final');
  assert.equal(step(state, data, cmd({ flaps: 3 }), { notice: { flaps: { age: 1, to: 3 } } }).id, 'auto-flaps');
});

test('circuit altitudes: 2,900 ft on the legs, 2,300 ft once on base/final; free flight holds 2,900 ft', () => {
  const alt = (idx, ft) => make('runway', s => { s.onGround = false; Object.assign(s.position, { x: -2500, y: ft / FT - RUNWAY.fieldElevation, z: 0 }); s.velocity = { x: 0, y: 0, z: -(80 / KT) }; }, 80);
  let { state, data } = alt(1, 2900); let r = step(state, data, cmd({ flaps: 0 }), { routeIndex: 1 });
  assert.equal(r.id, 'circuit'); assert.match(r.en, /hold 2,900 ft/);
  ({ state, data } = alt(1, 2900)); r = step(state, data, cmd({ flaps: 0 }), { routeIndex: 3 }); assert.match(r.en, /descend to 2,300 ft/);
  ({ state, data } = alt(1, 3600)); r = step(state, data, cmd({ flaps: 0 }), { routeIndex: 1 }); assert.match(r.en, /descend to 2,900 ft/);
  ({ state, data } = make('cruise', () => {}, 90)); r = step(state, data, cmd({ flaps: 0 })); assert.equal(r.id, 'free'); assert.match(r.en, /2,900 ft/);
  // jet text for the same call is untouched: 4,500 then 3,000 ft
  const j = createFlightState('runway'); j.onGround = false; j.position.y = 4500 / FT - RUNWAY.fieldElevation; j.velocity = { x: 0, y: 0, z: -80 };
  assert.match(nextStep(j, getFlightData(j), cmd({ flaps: 0, gear: false }), { routeIndex: 1, route: [{ x: 0, z: -5500 }, { x: -5000, z: -5500 }, { x: -5000, z: 11000 }, { x: 0, z: 11000 }] }).en, /hold 4,500 ft/);
});

test('approach boxes: light set sits on the ILS path for the 1.2 m gear height, closer spacing, smaller frames; the jet set is untouched', () => {
  const b = approachBoxes('light'), j = approachBoxes(), tan = Math.tan(RUNWAY.glideslope * Math.PI / 180), zone = RUNWAY.nearThreshold - RUNWAY.touchdownTarget;
  assert.equal(approachBoxes(createFlightState('runway', 'light')).length, b.length);
  assert.equal(approachBoxes('jet').length, j.length); assert.equal(j.length, 26); assert.ok(Math.abs(j[0].y - (PROFILES.jet.gearHeight + zone * tan)) < 1e-9);
  assert.ok(b.length > 15 && b.length < j.length + 1);
  assert.equal(b[1].z - b[0].z, 200); assert.equal(j[1].z - j[0].z, 400);
  assert.deepEqual([b[0].w, b[0].h], [24, 16]); assert.deepEqual([b.at(-1).w, b.at(-1).h], [40, 28]); assert.ok(b.at(-1).fade > .99 && b[0].fade === 0);
  assert.ok(b.at(-1).z - RUNWAY.touchdownTarget - zone >= 4000 - 1e-6);
  for (const box of b) { // a point at the box centre has ~0 glideslope deviation
    const s = createFlightState('approach', 'light'); s.position = { x: 0, y: box.y, z: box.z };
    const d = getFlightData(s); assert.ok(Math.abs(d.glideslopeDeviation) < 1e-6, `z ${box.z}: ${d.glideslopeDeviation}`);
    assert.ok(box.w <= 40 && box.h <= 28);
  }
});

test('end to end: a light takeoff and a level-1 approach flown by the scripted pilots never produce a gear step and always end in stopped', () => {
  const ids = new Set();
  const s = createFlightState('runway', 'light'); let d = getFlightData(s), cmds = cmd({ throttle: 1, flaps: 1 }), mem = {}, last = null;
  for (let i = 0; i < 60 * 120; i++) {
    d = getFlightData(s);
    if (i % 120 === 0) { const n = nextStep(s, d, cmds, { routeIndex: 0, route }); ids.add(n.id); assert.doesNotMatch(n.zh + n.en, /起落架|gear/i, n.id); }
    const out = takeoffPilot(s, d); const auto = autoConfig(s, d, { ...cmds, flaps: out.flaps }, mem, 0); if (auto.flaps !== undefined) out.flaps = auto.flaps; cmds = { ...cmds, flaps: out.flaps };
    stepFlight(s, out, 1 / 120);
  }
  assert.ok(ids.has('roll') && ids.has('rotate') || ids.has('climb'), [...ids].join());
  const a = createLevelState(LIGHT_LEVELS[0]), am = { flare: false, ig: 0, il: 0 }; const seen = new Set();
  let c = cmd({ flaps: 3 });
  for (let i = 0; i < 300 * 120 && !a.crashed; i++) {
    d = getFlightData(a);
    if (i % 60 === 0) { const n = nextStep(a, d, c, { routeIndex: 0 }); seen.add(n.id); assert.doesNotMatch(n.zh + n.en, /起落架|gear/i, n.id); }
    if (a.touchdown && a.onGround && d.groundSpeed < 2.5) { seen.add(nextStep(a, d, c, {}).id); break; }
    stepFlight(a, approachPilot(a, d, am, { flareAgl: 6 }), 1 / 120);
  }
  assert.ok(seen.has('final') && seen.has('flare') && seen.has('stopped'), [...seen].join());
  assert.ok(approachActive(createFlightState('approach', 'light'), getFlightData(createFlightState('approach', 'light'))));
});
