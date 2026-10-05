// Run: node --test games/flight/dev/landing-assist.test.mjs
// End-to-end controller regressions use the production flight physics at 120 Hz.
// The declared envelope is straight-in final, not arbitrary terrain or gusts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightState, stepFlight, getFlightData, quaternionFromEuler, profileOf, RUNWAY } from '../physics.mjs';
import { createLandingAssist, landingAssistEligibility } from '../landing-assist.mjs';

const KT = 1.943844, RAD = Math.PI / 180, DT = 1 / 120;

function start(aircraft = 'jet', options = {}) {
  const state = createFlightState('approach', aircraft), P = profileOf(state);
  if (options.distance) {
    state.position.z = RUNWAY.nearThreshold + options.distance;
    state.position.y = P.gearHeight + (state.position.z - RUNWAY.touchdownTarget) * Math.tan(RUNWAY.glideslope * RAD);
  }
  state.position.x = options.x || 0; state.position.y += options.above || 0;
  state.quaternion = quaternionFromEuler(P.scenarios.approach.pitch * RAD, (options.heading || 0) * RAD, (options.roll || 0) * RAD);
  if (options.kt) {
    const data = getFlightData(state), speed = options.kt / KT / (data.indicatedAirspeed / data.airspeed);
    state.velocity.z = -speed * Math.cos(RUNWAY.glideslope * RAD); state.velocity.y = -speed * Math.sin(RUNWAY.glideslope * RAD);
  }
  if (options.flaps !== undefined) state.flaps = state.flapPosition = options.flaps;
  if (options.gear !== undefined) { state.gear = options.gear; state.gearPosition = options.gear ? 1 : 0; }
  state.wind = { x: options.wind?.x || 0, y: options.wind?.y || 0, z: options.wind?.z || 0 };
  return state;
}

function fly(state, wind = state.wind) {
  const assist = createLandingAssist(), eligibility = assist.engage(state, getFlightData(state)), phases = new Set();
  assert.equal(eligibility.eligible, true, eligibility.reason);
  for (let i = 0; i < 270 * 120 && assist.active && !state.crashed; i++) {
    const input = assist.update(state, getFlightData(state), DT); phases.add(assist.status.phase);
    if (input) stepFlight(state, input, DT, { wind });
  }
  return { state, data: getFlightData(state), assist, phases };
}

function safeLanding(result) {
  const { state, data, assist } = result, P = profileOf(state), touchdown = state.touchdown;
  assert.equal(state.crashed, false, state.crashReason);
  assert.ok(touchdown, `no touchdown; assist phase ${assist.status.phase}`);
  assert.equal(state.onGround, true); assert.equal(data.onRunway, true);
  assert.ok(data.groundSpeed < 1.5, `not stopped: ${data.groundSpeed} m/s`);
  assert.equal(assist.status.phase, 'complete'); assert.equal(assist.active, false);
  assert.ok(touchdown.position.z < RUNWAY.nearThreshold && touchdown.position.z > RUNWAY.farThreshold);
  assert.ok(touchdown.sinkRate < P.crash.hardSink, `sink ${touchdown.sinkRate}`);
  assert.ok(Math.abs(touchdown.roll) < P.crash.landingRoll && touchdown.pitch < P.crash.landingPitch);
  assert.ok(Math.abs(touchdown.lateralOffset) < RUNWAY.width / 2);
}

test('assist defaults off, never teleports, and explicitly disengages rather than interpreting stick input', () => {
  const state = start(), assist = createLandingAssist(), data = getFlightData(state), before = JSON.stringify(state);
  assert.equal(assist.active, false); assert.equal(assist.update(state, data, DT), null);
  assert.equal(assist.engage(state, data).eligible, true);
  const input = assist.update(state, data, DT);
  assert.equal(JSON.stringify(state), before, 'the controller only returns controls');
  assert.deepEqual(input.autopilot, { enabled: false }, 'no overlapping altitude-hold AP');
  assert.ok(assist.active); assist.disengage();
  assert.equal(assist.status.reason, 'manual'); assert.equal(assist.update(state, data, DT), null);
});

test('challenge, tour, ground, exhausted fuel and invalid states cannot engage', () => {
  assert.equal(landingAssistEligibility(null, null).reason, 'unavailable');
  for (const [patch, reason] of [[{ challenge: 1 }, 'challenge'], [{ tour: 'city' }, 'tour'], [{ onGround: true }, 'on-ground'], [{ crashed: true }, 'crashed'], [{ fuel: 0 }, 'unavailable']]) {
    const state = Object.assign(start(), patch), assist = createLandingAssist();
    assert.deepEqual(assist.engage(state, getFlightData(state)), { eligible: false, reason }); assert.equal(assist.active, false);
  }
});

test('unsafe final geometry, attitude, speed and weather have actionable rejection reasons', () => {
  const cases = [
    [{ distance: 200 }, 'distance'], [{ distance: 14000 }, 'distance'],
    [{ heading: 50 }, 'runway-direction'], [{ x: 700 }, 'runway-position'],
    [{ roll: 30 }, 'attitude'], [{ above: 180 }, 'altitude'], [{ kt: 195 }, 'speed'],
    [{ wind: { x: 12 } }, 'wind'], [{ wind: { y: 2 } }, 'wind'], [{ wind: { z: -8 } }, 'wind'],
    [{ distance: 500, x: 70 }, 'runway-position'], [{ distance: 500, above: -10 }, 'altitude'],
    [{ distance: 500, kt: 170 }, 'speed'], [{ distance: 500, heading: 20 }, 'attitude'],
  ];
  for (const [options, expected] of cases) {
    const state = start('jet', options), result = landingAssistEligibility(state, getFlightData(state));
    assert.equal(result.eligible, false, JSON.stringify(options)); assert.equal(result.reason, expected, JSON.stringify(options));
  }
});

test('configuration transit requires enough remaining final approach distance', () => {
  const state = start('jet', { distance: 800, kt: 155, flaps: 0, gear: false });
  assert.equal(landingAssistEligibility(state, getFlightData(state)).reason, 'distance');
});

for (const aircraft of ['jet', 'light']) {
  const light = aircraft === 'light';
  const scenarios = [
    ['normal', {}],
    ['high and right', { x: light ? 120 : 250, above: light ? 40 : 70 }],
    ['low and left', { x: light ? -120 : -250, above: light ? -40 : -70 }],
    ['heading and bank capture', { heading: 15, roll: 12 }],
    ['fast, clean configuration', { kt: light ? 85 : 175, flaps: 0, gear: false }],
    ['late stabilized capture', { distance: 500, x: 25 }],
    ['overcast wind', { wind: { x: 1.7, z: 2 } }],
    ['15 kt crosswind right', { wind: { x: 7.72 } }],
    ['15 kt crosswind left', { wind: { x: -7.72 } }],
  ];
  for (const [name, options] of scenarios) test(`${aircraft}: ${name} lands softly, on centreline and stops`, () => {
    const result = fly(start(aircraft, options)); safeLanding(result);
    assert.ok(result.state.touchdown.sinkRate < 2, `sink ${result.state.touchdown.sinkRate}`);
    assert.ok(Math.abs(result.state.touchdown.lateralOffset) < 6, `offset ${result.state.touchdown.lateralOffset}`);
    for (const phase of ['approach', 'flare', 'rollout', 'complete']) assert.ok(result.phases.has(phase), phase);
  });
}

test('unsafe weather change or low clearance before the pavement cancels with a safety reason', () => {
  for (const reason of ['wind', 'altitude']) {
    const state = start(), assist = createLandingAssist(); assist.engage(state, getFlightData(state));
    if (reason === 'wind') state.wind.x = 15;
    else state.groundElevation = state.position.y - 10;
    assert.equal(assist.update(state, getFlightData(state), DT), null);
    assert.equal(assist.active, false); assert.equal(assist.status.reason, reason);
  }
});

test('deterministic mixed envelope trials: every accepted state lands safely through real physics', () => {
  let seed = 1847, accepted = 0, rejected = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (const aircraft of ['jet', 'light']) for (let i = 0; i < 60; i++) {
    const light = aircraft === 'light', distance = [500, 1000, 2000, 4000, light ? 5500 : 7000][i % 5];
    const P = profileOf({ aircraft }), path = P.gearHeight + (distance + RUNWAY.nearThreshold - RUNWAY.touchdownTarget) * Math.tan(RUNWAY.glideslope * RAD);
    const options = { distance, x: (random() * 2 - 1) * Math.min(light ? 220 : 500, 10 + distance * .04), above: (random() * 2 - 1) * Math.max(8, path * .3), heading: (random() * 2 - 1) * 25, roll: (random() * 2 - 1) * 20, wind: { x: (random() * 2 - 1) * 7.72 }, kt: (light ? 58 : 125) + random() * (light ? 27 : 50) };
    const state = start(aircraft, options), eligibility = landingAssistEligibility(state, getFlightData(state));
    if (!eligibility.eligible) { rejected++; continue; }
    accepted++; safeLanding(fly(state));
  }
  assert.ok(accepted > 50); assert.ok(rejected > 10);
  console.log(JSON.stringify({ mixedLandingTrials: { accepted, rejected, unsafeAccepted: 0 } }));
});
