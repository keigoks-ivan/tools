import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRCRAFT, RUNWAY, createFlightState, stepFlight, getFlightData,
  normalizeQuaternion, quaternionFromEuler, rotateVector,
} from '../physics.mjs';

const RAD = Math.PI / 180;
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const run = (state, seconds, input = () => ({}), environment = {}) => {
  for (let i = 0; i < Math.round(seconds * 120) && !state.crashed; i++) stepFlight(state, input(state), 1 / 120, environment);
  return state;
};

test('quaternion basis follows nose-up, north/east heading and right-wing-down conventions', () => {
  const nose = rotateVector(quaternionFromEuler(30 * RAD), { x: 0, y: 0, z: -1 });
  near(nose.x, 0); near(nose.y, 0.5); near(nose.z, -Math.sqrt(3) / 2);
  const east = rotateVector(quaternionFromEuler(0, 90 * RAD), { x: 0, y: 0, z: -1 });
  near(east.x, 1); near(east.y, 0); near(east.z, 0);
  const rightWing = rotateVector(quaternionFromEuler(0, 0, 30 * RAD), { x: 1, y: 0, z: 0 });
  near(rightWing.x, Math.sqrt(3) / 2); near(rightWing.y, -0.5);
});

test('normalization and composed rotations preserve vectors and recover instrument attitude', () => {
  const q = normalizeQuaternion({ x: 1, y: -2, z: 3, w: 4 });
  near(Math.hypot(q.x, q.y, q.z, q.w), 1);
  const vector = rotateVector(q, { x: 3, y: -4, z: 12 });
  near(Math.hypot(vector.x, vector.y, vector.z), 13);
  const s = createFlightState('cruise');
  s.quaternion = quaternionFromEuler(17 * RAD, 213 * RAD, -23 * RAD);
  const f = getFlightData(s);
  near(f.pitch, 17); near(f.heading, 213); near(f.roll, -23);
  assert.deepEqual(normalizeQuaternion({ x: 0, y: 0, z: 0, w: 0 }), { x: 0, y: 0, z: 0, w: 1 });
});

test('parked aircraft stays on its wheels; engines spool rather than applying instant thrust', () => {
  const parked = run(createFlightState(), 10);
  near(parked.position.y, AIRCRAFT.gearHeight); near(parked.position.z, RUNWAY.nearThreshold - 180);
  near(getFlightData(parked).pitch, 0);
  const accelerating = createFlightState();
  stepFlight(accelerating, { throttle: 1 }, 1 / 120);
  assert.ok(accelerating.engine > 0 && accelerating.engine < 0.01);
  run(accelerating, 10, () => ({ throttle: 1 }));
  assert.ok(accelerating.engine > 0.93 && accelerating.engine < 1);
  assert.ok(getFlightData(accelerating).groundSpeed > 24);
  assert.ok(accelerating.fuel < parked.fuel);
});

test('airspeed is relative to wind while ground speed and compass track remain world based', () => {
  const s = createFlightState('cruise');
  s.wind = { x: 0, y: 0, z: -20 };
  const f = getFlightData(s);
  near(f.airspeed, 100); near(f.groundSpeed, 120); near(f.groundTrack, 0);
  assert.ok(f.indicatedAirspeed < f.airspeed);
  near(f.windDirection, 180); near(f.windSpeed, 20);
});

test('neutral cruise and configured approach are trimmed, stable states', () => {
  const cruise = run(createFlightState('cruise'), 180);
  const cf = getFlightData(cruise);
  assert.equal(cruise.crashed, false);
  assert.ok(Math.abs(cf.altitude - 1800) < 50);
  assert.ok(Math.abs(cf.airspeed - 120) < 3);
  assert.ok(Math.abs(cf.gLoad - 1) < 0.04);
  near(Math.hypot(...Object.values(cruise.quaternion)), 1);
  const approach = createFlightState('approach');
  near(getFlightData(approach).distanceToThreshold, 7000);
  near(approach.position.y, 370);
  near(approach.autopilot.speed, getFlightData(approach).indicatedAirspeed);
  run(approach, 30);
  const af = getFlightData(approach);
  assert.ok(af.verticalSpeed < -3 && af.verticalSpeed > -4.4);
  assert.ok(af.airspeed > 72 && af.airspeed < 77);
  assert.equal(af.stallWarning, false);
});

test('pitch and roll controls change attitude with correct sign and bank causes a real turn', () => {
  const pitch = run(createFlightState('cruise'), 2, () => ({ pitch: 0.5 }));
  assert.ok(getFlightData(pitch).pitch > 10);
  const bank = run(createFlightState('cruise'), 2, () => ({ roll: 1 }));
  assert.ok(getFlightData(bank).roll > 28);
  run(bank, 8);
  assert.ok(getFlightData(bank).heading > 12);
  assert.ok(bank.position.x > -1320);
});

test('gear and flaps transit over time, and flaps lower the stall speed', () => {
  const s = createFlightState('cruise');
  const cleanStall = getFlightData(s).stallSpeed;
  stepFlight(s, { flaps: 3, gear: true }, 1 / 120);
  assert.ok(s.flapPosition > 0 && s.flapPosition < 0.01);
  assert.ok(s.gearPosition > 0 && s.gearPosition < 0.01);
  run(s, 9, () => ({ flaps: 3, gear: true, autopilot: { enabled: true, altitude: 1800, heading: 0, speed: 90 } }));
  near(s.flapPosition, 3); near(s.gearPosition, 1);
  assert.ok(getFlightData(s).stallSpeed < cleanStall * 0.85);
});

test('excessive angle of attack loses lift and warns instead of granting unlimited climb', () => {
  const beforeStall = createFlightState('cruise');
  const stalled = createFlightState('cruise');
  beforeStall.quaternion = quaternionFromEuler(13 * RAD);
  stalled.quaternion = quaternionFromEuler(30 * RAD);
  stepFlight(beforeStall, {}, 1 / 120);
  stepFlight(stalled, {}, 1 / 120);
  assert.ok(stalled.gLoad < beforeStall.gLoad * 0.8);
  assert.equal(getFlightData(stalled).stallWarning, true);
});

test('takeoff rotation lifts off within the runway without an artificial altitude boost', () => {
  const s = createFlightState();
  run(s, 36, state => {
    const f = getFlightData(state);
    return { throttle: 1, pitch: f.airspeed >= AIRCRAFT.rotateSpeed && f.pitch < 12 ? 0.55 : 0 };
  });
  assert.equal(s.crashed, false);
  assert.equal(s.onGround, false);
  assert.ok(s.position.y > 60);
  assert.ok(s.position.z > RUNWAY.farThreshold);
  assert.ok(getFlightData(s).verticalSpeed > 6);
  assert.equal(s.touchdown, null);
});

test('a controlled flare can land and brakes/spoilers stop the aircraft on the runway', () => {
  const s = createFlightState('approach');
  let flare = false;
  run(s, 125, state => {
    const f = getFlightData(state);
    if (f.agl < 14) flare = true;
    return {
      throttle: flare ? 0 : 0.24,
      pitch: flare && !state.onGround ? Math.max(-0.4, Math.min(0.4, (4.5 - f.pitch) * 0.11)) : 0,
      brake: state.onGround ? 1 : 0, spoilers: state.onGround,
    };
  });
  assert.equal(s.crashed, false);
  assert.equal(s.onGround, true);
  assert.ok(s.touchdown);
  assert.ok(s.touchdown.sinkRate > 0 && s.touchdown.sinkRate < 2);
  assert.ok(s.touchdown.speed > 65 && s.touchdown.speed < 77);
  assert.ok(s.touchdown.position.z < RUNWAY.nearThreshold);
  assert.ok(s.touchdown.position.z > RUNWAY.farThreshold);
  assert.ok(getFlightData(s).groundSpeed < 0.1);
  assert.ok(s.position.z > RUNWAY.farThreshold);
});

test('unsafe landings distinguish impact, gear and runway position failures', () => {
  for (const [reason, modify] of [
    ['hard-landing', s => { s.velocity.y = -8; }],
    ['gear-up', s => { s.gear = false; s.gearPosition = 0; s.position.y = 1.5; }],
    ['off-runway', s => { s.position.x = 40; }],
  ]) {
    const s = createFlightState('approach');
    s.position.y = 4.1; s.position.z = 800; s.velocity.y = -2;
    modify(s);
    run(s, 0.25);
    assert.equal(s.crashed, true, reason);
    assert.equal(s.crashReason, reason);
    assert.ok(s.touchdown);
    near(getFlightData(s).groundSpeed, 0);
  }
});

test('terrain elevation affects radio altitude and off-runway collision height', () => {
  const s = createFlightState('approach');
  s.position.y = 304.1;
  s.velocity.y = -2;
  stepFlight(s, {}, 1 / 120, { groundElevation: 300 });
  near(getFlightData(s).agl, s.position.y - 300);
  assert.equal(s.crashed, false);
  run(s, 0.25, () => ({}), { groundElevation: 300 });
  assert.equal(s.crashed, true);
  assert.equal(s.crashReason, 'off-runway');
  near(s.position.y, 300 + AIRCRAFT.gearHeight);
  near(getFlightData(s).agl, AIRCRAFT.gearHeight);
});

test('autopilot captures heading, altitude and speed through the same forces and controls', () => {
  const s = createFlightState('cruise');
  near(s.autopilot.speed, getFlightData(s).indicatedAirspeed);
  run(s, 180, () => ({ autopilot: { enabled: true, heading: 30, altitude: 2000, speed: 120 } }));
  const f = getFlightData(s);
  assert.equal(s.crashed, false);
  assert.ok(Math.abs(f.heading - 30) < 1);
  assert.ok(Math.abs(f.altitude - 2000) < 6);
  assert.ok(Math.abs(f.indicatedAirspeed - 120) < 1);
  assert.ok(f.airspeed > f.indicatedAirspeed + 10);
  assert.ok(Math.abs(f.roll) < 1);
});

test('ILS guidance has the proper touchdown glide geometry and a far-end localizer', () => {
  const s = createFlightState('approach');
  s.position.z = RUNWAY.nearThreshold;
  s.position.y = AIRCRAFT.gearHeight + (RUNWAY.nearThreshold - RUNWAY.touchdownTarget) * Math.tan(3 * RAD);
  const crossing = getFlightData(s);
  assert.equal(crossing.ilsValid, true);
  assert.equal(crossing.gsValid, true);
  near(crossing.glideslopeDeviation, 0);
  assert.ok(s.position.y > 20 && s.position.y < 30);
  s.position.x = 10;
  assert.ok(Math.abs(getFlightData(s).localizerDeviation) < 0.2);
  s.position.z = RUNWAY.touchdownTarget - 1;
  assert.equal(getFlightData(s).gsValid, false);
  near(getFlightData(s).glideslopeDeviation, 0);
  s.quaternion = quaternionFromEuler(0, Math.PI);
  assert.equal(getFlightData(s).ilsValid, false);
  near(getFlightData(s).localizerDeviation, 0);
  s.quaternion = quaternionFromEuler();
  s.onGround = true;
  assert.equal(getFlightData(s).ilsValid, false);
  assert.equal(getFlightData(s).gsValid, false);
});

test('internal fixed substeps produce the same flight at different render frame rates', () => {
  const a = createFlightState('cruise');
  const b = createFlightState('cruise');
  run(a, 20, () => ({ throttle: 0.4, pitch: 0.04 }));
  for (let i = 0; i < 200; i++) stepFlight(b, { throttle: 0.4, pitch: 0.04 }, 0.1);
  for (const axis of ['x', 'y', 'z']) {
    near(a.position[axis], b.position[axis], 1e-6);
    near(a.velocity[axis], b.velocity[axis], 1e-6);
  }
  const originalPosition = { ...a.position };
  stepFlight(a, {}, Number.NaN);
  assert.deepEqual(a.position, originalPosition);
});
