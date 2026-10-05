import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, RUNWAY, createFlightState, getFlightData } from './physics.mjs';
import { NOVICE, nextStep, ilsCue, turnCue, autoConfig, approachActive, approachBoxes } from './novice.mjs';

const KT = 1.943844, FT = 3.28084;
const route = [{ x: 0, z: -5500 }, { x: -5000, z: -5500 }, { x: -5000, z: 11000 }, { x: 0, z: 11000 }, { x: 0, z: RUNWAY.touchdownTarget }];
// Build a state + data pair; patch() edits the state before getFlightData runs.
const make = (scenario, patch = () => {}, speedKt = 0) => {
  const state = createFlightState(scenario); patch(state);
  const data = { ...getFlightData(state) }; if (speedKt) data.indicatedAirspeed = speedKt / KT;
  return { state, data };
};
const cmd = (o = {}) => ({ throttle: 0, flaps: 1, gear: true, trim: .15, spoilers: false, ...o });
const step = (s, d, c, ctx = {}) => nextStep(s, d, c, { routeIndex: 0, route, ...ctx });
const airborne = (state, o) => { state.onGround = false; Object.assign(state.position, { y: 300, ...o }); };

test('takeoff steps follow real state: throttle -> accelerate -> rotate, and go back when throttle is pulled', () => {
  let { state, data } = make('runway');
  assert.equal(step(state, data, cmd()).id, 'throttle');
  assert.equal(step(state, data, cmd()).glow, 'throttle');
  assert.equal(step(state, data, cmd({ throttle: 1 })).id, 'roll'); // already pushed: skip ahead
  ({ state, data } = make('runway', () => {}, 100));
  assert.equal(step(state, data, cmd({ throttle: 1 })).id, 'roll');
  assert.equal(step(state, data, cmd({ throttle: .3 })).id, 'throttle'); // pulled back: hint goes back
  ({ state, data } = make('runway', () => {}, NOVICE.rotateKt + 1));
  const rotate = step(state, data, cmd({ throttle: 1 }));
  assert.equal(rotate.id, 'rotate'); assert.match(rotate.zh, /↓/);
  assert.match(step(state, data, cmd({ throttle: 1 }), { touch: true }).zh, /搖桿/);
  assert.equal(NOVICE.rotateKt, Math.round(AIRCRAFT.rotateSpeed * KT));
});

test('after liftoff: climb -> gear -> flaps -> circuit turn cue', () => {
  const lift = o => make('runway', s => { s.onGround = false; Object.assign(s.position, { z: 0, ...o }); s.velocity = { x: 0, y: 5, z: -80 }; });
  let { state, data } = lift({ y: AIRCRAFT.gearHeight + 8 });
  assert.equal(step(state, data, cmd({ throttle: 1 })).id, 'climb');
  ({ state, data } = lift({ y: 150 }));
  assert.equal(step(state, data, cmd({ throttle: 1 })).id, 'gear');
  assert.equal(step(state, data, cmd({ throttle: 1 })).glow, 'gear');
  assert.equal(step(state, data, cmd({ throttle: 1, gear: false })).id, 'flaps-wait');
  ({ state, data } = make('runway', s => { s.onGround = false; Object.assign(s.position, { z: 0, y: 150 }); s.velocity = { x: 0, y: 5, z: -80 }; }, 170));
  assert.equal(step(state, data, cmd({ gear: false })).id, 'flaps');
  assert.equal(step(state, data, cmd({ gear: false, flaps: 0 })).id, 'circuit');
  const c = step(state, data, cmd({ gear: false, flaps: 0 }), { routeIndex: 1 });
  assert.match(c.zh, /4,500 呎/);
  assert.match(step(state, data, cmd({ gear: false, flaps: 0 }), { routeIndex: 3 }).zh, /3,000 呎/);
});

test('turn cue sign: target to the right of the nose says right, to the left says left', () => {
  const { state, data } = make('runway', s => { s.onGround = false; Object.assign(s.position, { x: 0, z: 0, y: 500 }); });
  data.heading = 0; // nose along -z
  assert.equal(turnCue(data, { x: 3000, z: -3000 }, state).dir, 'right');
  assert.equal(turnCue(data, { x: -3000, z: -3000 }, state).dir, 'left');
  assert.equal(turnCue(data, { x: 100, z: -5000 }, state).dir, 'straight');
  data.heading = 90; // nose along +x: a target at -z is on the left
  assert.equal(turnCue(data, { x: 0, z: -3000 }, state).dir, 'left');
});

test('approach: config -> final -> flare -> brake; scenario starts at final', () => {
  let { state, data } = make('approach');
  assert.equal(approachActive(state, data), true);
  data.indicatedAirspeed = 145 / KT;
  assert.equal(step(state, data, cmd({ flaps: 3 })).id, 'final');
  assert.equal(step(state, data, cmd({ flaps: 3, gear: false })).id, 'config');
  assert.equal(step(state, data, cmd({ flaps: 3, gear: false })).glow, 'gear');
  assert.equal(step(state, data, cmd({ flaps: 1 })).glow, 'flaps');
  data.indicatedAirspeed = 190 / KT;
  assert.equal(step(state, data, cmd({ flaps: 1 })).id, 'slow-down');
  data.indicatedAirspeed = 118 / KT;
  assert.equal(step(state, data, cmd({ flaps: 3 })).id, 'final-slow');
  ({ state, data } = make('approach', s => { s.position.y = 20; }));
  assert.equal(step(state, data, cmd({ flaps: 3 })).id, 'flare');
  ({ state, data } = make('approach', s => { s.onGround = true; s.touchdown = { elapsed: 1 }; s.velocity = { x: 0, y: 0, z: -50 }; }));
  assert.equal(step(state, data, cmd({ flaps: 3 })).id, 'brake');
  assert.equal(step(state, data, cmd({ flaps: 3 })).glow, 'brake');
  ({ state, data } = make('approach', s => { s.onGround = true; s.touchdown = { elapsed: 1 }; s.velocity = { x: 0, y: 0, z: 0 }; }));
  assert.equal(step(state, data, cmd({ flaps: 3 })).id, 'stopped');
});

test('takeoff scenario only counts as approach after the circuit (routeIndex >= 3)', () => {
  const { state, data } = make('runway', s => { s.onGround = false; Object.assign(s.position, { x: 0, y: 300, z: 6000 }); });
  assert.equal(approachActive(state, data, 1), false);
  assert.equal(approachActive(state, data, 3), true);
});

test('auto notice shows what happened and the button glows for 2 s only', () => {
  const { state, data } = make('runway', s => { s.onGround = false; Object.assign(s.position, { z: 0, y: 150 }); s.velocity = { x: 0, y: 5, z: -80 }; });
  const a = step(state, data, cmd({ gear: false }), { notice: { gear: { age: 1, to: false } } });
  assert.equal(a.id, 'auto-gear'); assert.match(a.zh, /已自動收起/); assert.equal(a.glow, 'gear');
  assert.equal(step(state, data, cmd({ gear: false }), { notice: { gear: { age: 3, to: false } } }).glow, null);
  assert.notEqual(step(state, data, cmd({ gear: false }), { notice: { gear: { age: 5, to: false } } }).id, 'auto-gear');
});

test('ILS cue signs: LOC + (right of course) says left, GS + (above path) says lower', () => {
  const d = (loc, gs, gsValid = true) => ({ ilsValid: true, gsValid, localizerDeviation: loc, glideslopeDeviation: gs });
  assert.equal(ilsCue(d(1.5, 0)).h.state, 'left'); assert.equal(ilsCue(d(1.5, 0)).h.zh, '往左一點');
  assert.equal(ilsCue(d(-1.5, 0)).h.state, 'right');
  assert.equal(ilsCue(d(0, .5)).v.state, 'low'); assert.equal(ilsCue(d(0, .5)).v.zh, '再低一點');
  assert.equal(ilsCue(d(0, -.5)).v.state, 'high');
  assert.equal(ilsCue(d(.3, .1)).h.state, 'ok'); assert.equal(ilsCue(d(.3, .1)).v.state, 'ok');
  assert.equal(ilsCue(d(0, 0, false)).v, null);
  assert.equal(ilsCue({ ilsValid: false }), null);
  // half-dot thresholds from the PFD scale, with hysteresis
  assert.ok(Math.abs(NOVICE.locDot - 1.2209) < 1e-3 && Math.abs(NOVICE.gsDot - 0.3431) < 1e-3);
  const edge = NOVICE.locDot * .6;
  assert.equal(ilsCue(d(edge, 0)).h.state, 'left');
  assert.equal(ilsCue(d(edge, 0), ilsCue(d(0, 0))).h.state, 'ok'); // was centred: stays centred a little longer
});

test('ILS cue agrees with the real physics: a point right of / above the path gets the right word', () => {
  const at = (x, y, z) => make('approach', s => { Object.assign(s.position, { x, y, z }); }).data;
  const gd = 5000, y0 = AIRCRAFT.gearHeight + gd * Math.tan(RUNWAY.glideslope * Math.PI / 180), z = RUNWAY.touchdownTarget + gd;
  assert.equal(ilsCue(at(300, y0, z)).h.state, 'left');
  assert.equal(ilsCue(at(-300, y0, z)).h.state, 'right');
  assert.equal(ilsCue(at(0, y0 + 80, z)).v.state, 'low');
  assert.equal(ilsCue(at(0, y0 - 80, z)).v.state, 'high');
  assert.equal(ilsCue(at(0, y0, z)).h.state, 'ok'); assert.equal(ilsCue(at(0, y0, z)).v.state, 'ok');
});

test('auto gear: retracts once airborne and climbing, only once; extends on approach and when sinking low', () => {
  const mem = {};
  let { state, data } = make('runway');
  assert.deepEqual(autoConfig(state, data, cmd(), mem), {}); // on the ground: nothing
  ({ state, data } = make('runway', s => { s.onGround = false; Object.assign(s.position, { z: 0, y: 5 }); s.velocity = { x: 0, y: 5, z: -80 }; }));
  assert.deepEqual(autoConfig(state, data, cmd(), mem), {}); // below 50 ft
  ({ state, data } = make('runway', s => { s.onGround = false; Object.assign(s.position, { z: 0, y: 40 }); s.velocity = { x: 0, y: 5, z: -80 }; }));
  assert.deepEqual(autoConfig(state, data, cmd(), mem), { gear: false });
  assert.deepEqual(autoConfig(state, data, cmd(), mem), {}); // player lowers it again: not fought during the climb
  ({ state, data } = make('runway', s => { s.onGround = false; Object.assign(s.position, { z: 0, y: 400 }); s.velocity = { x: 0, y: -3, z: -80 }; }));
  assert.deepEqual(autoConfig(state, data, cmd({ gear: false }), {}), {}); // sinking but still high enough
  ({ state, data } = make('runway', s => { s.onGround = false; Object.assign(s.position, { z: 0, y: 200 }); s.velocity = { x: 0, y: -3, z: -80 }; }));
  assert.deepEqual(autoConfig(state, data, cmd({ gear: false }), {}), { gear: true }); // sinking below 250 m AGL
  ({ state, data } = make('approach', s => { s.gear = false; }));
  assert.equal(data.agl < NOVICE.gearDownAglM, true);
  assert.deepEqual(autoConfig(state, data, cmd({ gear: false, flaps: 3 }), {}), { gear: true }); // approach path below 2,000 ft AGL
  assert.deepEqual(autoConfig(state, data, cmd({ gear: true, flaps: 3 }), {}), {}); // never retracts on approach
  const m2 = { gearUp: true }; make('runway'); autoConfig(make('runway').state, make('runway').data, cmd(), m2);
  assert.equal(m2.gearUp, false); // reset on the ground
});

test('auto flaps: retract at 160 kt after takeoff; extend one step at a time by speed on approach, within the flap limits', () => {
  const mem = {}, climb = kt => make('runway', s => { s.onGround = false; Object.assign(s.position, { z: 0, y: 200 }); s.velocity = { x: 0, y: 5, z: -80 }; }, kt);
  let { state, data } = climb(150);
  assert.deepEqual(autoConfig(state, data, cmd({ gear: false }), mem), {});
  ({ state, data } = climb(165));
  assert.deepEqual(autoConfig(state, data, cmd({ gear: false }), mem), { flaps: 0 });
  assert.equal(mem.flapsUp, true);
  assert.deepEqual(autoConfig(state, data, cmd({ gear: false, flaps: 1 }), mem), {}); // manual re-extension is left alone

  const appr = (kt, flapPosition) => { const r = make('approach', s => { s.flapPosition = flapPosition; }, kt); return r; };
  ({ state, data } = appr(210, 0)); assert.deepEqual(autoConfig(state, data, cmd({ flaps: 0 }), {}), {}); // too fast for flaps 1
  ({ state, data } = appr(195, 0)); assert.deepEqual(autoConfig(state, data, cmd({ flaps: 0 }), {}), { flaps: 1 });
  ({ state, data } = appr(195, 0.5)); assert.deepEqual(autoConfig(state, data, cmd({ flaps: 1 }), {}), {}); // flaps 1 still moving
  ({ state, data } = appr(195, 1)); assert.deepEqual(autoConfig(state, data, cmd({ flaps: 1 }), {}), {}); // 195 kt: only flaps 1 allowed
  ({ state, data } = appr(175, 1)); assert.deepEqual(autoConfig(state, data, cmd({ flaps: 1 }), {}), { flaps: 2 });
  ({ state, data } = appr(175, 2)); assert.deepEqual(autoConfig(state, data, cmd({ flaps: 2 }), {}), {}); // 175 kt too fast for 3
  ({ state, data } = appr(155, 2)); assert.deepEqual(autoConfig(state, data, cmd({ flaps: 2 }), {}), { flaps: 3 });
  // table respects physics limits: speedLimit(flap) = 120 - 11 * flap m/s
  for (const [kt, flaps] of NOVICE.flapExtend) assert.ok(kt / KT < 120 - 11 * flaps, `${kt} kt must be under the flap-${flaps} limit`);
});

test('approach boxes: on the glidepath, centred = ILS centred (through the real physics deviation functions)', () => {
  const boxes = approachBoxes();
  assert.ok(boxes.length >= 25 && boxes.length <= 27);
  assert.equal(boxes[1].z - boxes[0].z, NOVICE.boxSpacingM);
  assert.ok(Math.abs(boxes[0].z - RUNWAY.nearThreshold) < 1e-9, 'first box sits at the landing threshold');
  assert.ok(boxes.at(-1).z - RUNWAY.nearThreshold >= 9999, 'last box about 10 km out');
  assert.deepEqual([boxes[0].w, boxes[0].h], [60, 40]);
  assert.deepEqual([boxes.at(-1).w, boxes.at(-1).h], [120, 80]);
  for (const b of boxes) {
    const { data } = make('approach', s => { Object.assign(s.position, { x: b.x, y: b.y, z: b.z }); });
    assert.ok(data.ilsValid && data.gsValid);
    assert.ok(Math.abs(data.glideslopeDeviation) < 1e-9, `GS deviation ${data.glideslopeDeviation}`);
    assert.ok(Math.abs(data.localizerDeviation) < 1e-9);
    assert.equal(ilsCue(data).v.state, 'ok');
  }
  // an edge of the box is not centred: top edge of the far box reads "lower"
  const far = boxes.at(-1), { data } = make('approach', s => { Object.assign(s.position, { x: 0, y: far.y + far.h / 2, z: far.z }); });
  assert.ok(data.glideslopeDeviation > 0);
  assert.ok(boxes.every(b => b.y - b.h / 2 > -5), 'boxes do not sink into the ground');
  void FT;
});

test('flaps-wait only holds the hint line below 500 ft AGL; above it the circuit cue shows (slow climb-out)', () => {
  const at = y => make('runway', s => { s.onGround = false; Object.assign(s.position, { z: 0, y }); s.velocity = { x: 0, y: 5, z: -80 }; }, 150);
  let { state, data } = at(AIRCRAFT.gearHeight + 100); // ~330 ft AGL
  assert.equal(step(state, data, cmd({ gear: false })).id, 'flaps-wait');
  ({ state, data } = at(AIRCRAFT.gearHeight + 200)); // ~660 ft AGL, still 150 kt with flaps 1
  assert.equal(step(state, data, cmd({ gear: false })).id, 'circuit');
});

test('no "raise the gear" advice while the gear was lowered because the aircraft is sinking low', () => {
  const { state, data } = make('runway', s => { s.onGround = false; Object.assign(s.position, { z: 0, y: 200 }); s.velocity = { x: 0, y: -3, z: -80 }; }, 150);
  assert.notEqual(step(state, data, cmd({ gear: true, flaps: 0 })).id, 'gear');
});
