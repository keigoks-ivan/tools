import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, TRACKS } from './track.mjs';
import { VEHICLES } from './vehicles.mjs';
import { createDrivingState, resetDriving, stepDriving } from './physics.mjs';

const flat = {
  length: 10000, width: 10000, wallOffset: 5010,
  spawn: { x: 0, y: 0, z: 0, s: 0, heading: 0 },
  sample(s) { return { x: 0, y: 0, z: s, s, heading: 0, nx: 1, nz: 0, curvature: 0 }; },
  nearest(x, z) {
    return { s: ((z % this.length) + this.length) % this.length, offset: x,
      distance: Math.abs(x), y: 0, heading: 0, nx: 1, nz: 0, curvature: 0 };
  },
};
const run = (state, input, seconds, track = flat) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) stepDriving(state, input, 1 / 120, track);
  return state;
};

test('coastal road is a continuous closed loop with signed nearest offsets', () => {
  assert.ok(TRACK.length > 1200 && TRACK.length < 1800);
  assert.deepEqual(TRACK.sample(0), TRACK.sample(TRACK.length));
  const a = TRACK.sample(TRACK.length - .001), b = TRACK.sample(.001);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < .003);
  assert.ok(Math.abs(a.y - b.y) < .001);
  const p = TRACK.sample(TRACK.length * .61);
  const right = TRACK.nearest(p.x + p.nx * 3, p.z + p.nz * 3, 0);
  const left = TRACK.nearest(p.x - p.nx * 3, p.z - p.nz * 3, p.s);
  assert.ok(Math.abs(right.s - p.s) < .04);
  assert.ok(Math.abs(right.offset - 3) < .01);
  assert.ok(Math.abs(left.offset + 3) < .01);
});

test('steering at standstill cannot create velocity or yaw', () => {
  const state = createDrivingState(flat);
  run(state, { steer: 1 }, 8);
  assert.equal(state.speed, 0);
  assert.equal(state.yawRate, 0);
  assert.equal(state.x, 0);
  assert.equal(state.z, 0);
  assert.equal(state.rpm, 950);
  assert.equal(state.slip, 0);
});

test('power accelerates through automatic gears and braking stops the car', () => {
  const state = createDrivingState(flat);
  run(state, { throttle: 1 }, 10);
  assert.ok(state.speed > 33 && state.speed < 42, `speed ${state.speed}`);
  assert.ok(state.gear >= 3);
  assert.ok(state.rpm > 2500 && state.rpm < 7900);
  const beforeBraking = state.speed;
  run(state, { brake: 1 }, 3);
  assert.ok(state.speed < beforeBraking * .3);
  assert.ok(state.longitudinalAccel < -7);
  for (let i = 0; i < 240 && state.speed > 0; i++) stepDriving(state, { brake: 1 }, 1 / 120, flat);
  assert.equal(state.speed, 0);
  assert.equal(state.reverse, false, 'service braking stops before reverse can engage');
  assert.ok(state.braking > .99);
});

test('holding the brake at rest engages reverse and throttle returns to forward motion', () => {
  const state = createDrivingState(flat);
  run(state, { brake: 1 }, .25);
  assert.equal(state.speed, 0);
  assert.equal(state.reverse, false, 'a brief brake press cannot propel a stopped car');
  run(state, { brake: 1 }, 2);
  assert.equal(state.reverse, true);
  assert.ok(state.vz < -2 && state.z < -2, 'the held pedal backs the car up');
  assert.equal(state.braking, 0, 'reverse drive is separate from service braking');
  run(state, {}, .2);
  assert.equal(state.reverse, true, 'selected reverse gear remains visible while coasting');
  assert.ok(state.vz < 0, 'releasing the pedal does not erase backward momentum');
  run(state, { throttle: 1 }, 3);
  assert.equal(state.reverse, false, 'throttle selects forward gear');
  assert.ok(state.vz > 3, 'forward torque first arrests reverse motion, then pulls forward');
});

const barrierState = (track, vehicle, side, headingOffset, speed = 0) => {
  const p = track.sample(track.length * .31), state = createDrivingState(track);
  Object.assign(state, {
    x: p.x + p.nx * side * ((track.wallOffset || track.width / 2 + 4.5) - .94),
    z: p.z + p.nz * side * ((track.wallOffset || track.width / 2 + 4.5) - .94),
    y: p.y, s: p.s, heading: p.heading + side * headingOffset,
    _lastS: p.s,
  });
  state.vx = Math.sin(state.heading) * speed; state.vz = Math.cos(state.heading) * speed; state.speed = speed;
  state._lastX = state.x; state._lastZ = state.z;
  return state;
};

test('every car can reverse away from either head-on guardrail without resetting', () => {
  const track = { ...flat, width: 12, wallOffset: 10.5 };
  for (const vehicle of Object.values(VEHICLES)) for (const side of [-1, 1]) {
    const state = barrierState(track, vehicle, side, Math.PI / 2, 14);
    stepDriving(state, {}, 1 / 120, track, vehicle);
    assert.ok(state.collision > .1, `${vehicle.id}: the setup causes a real impact`);
    const heading = state.heading, initialOffset = side * state.x;
    for (let i = 0; i < 240; i++) stepDriving(state, { brake: 1, steer: side * .45 }, 1 / 120, track, vehicle);
    assert.ok(side * state.offset < initialOffset - 1.5, `${vehicle.id}/${side}: reverse clears the guardrail`);
    assert.ok(side * (state.heading - heading) < -.1, 'reverse steering yaws opposite forward steering');
    assert.ok(state.invalidLap, 'recovery cannot restore an invalid lap');
    assert.equal(state.lap, 1);
  }
});

test('guardrail contact accounts for each car body width and length at every approach angle', () => {
  const track = { ...flat, width: 12, wallOffset: 10.5 };
  for (const vehicle of [VEHICLES.porsche911gt3rs, VEHICLES.bmwX3, VEHICLES.lamborghiniRevuelto]) for (const side of [-1, 1]) for (let angle = 0; angle <= Math.PI / 2; angle += Math.PI / 12) {
    const state = barrierState(track, vehicle, side, angle, 8);
    stepDriving(state, {}, 1 / 120, track, vehicle);
    const reach = Math.abs(Math.sin(state.heading)) * vehicle.dimensions.length / 2 + Math.abs(Math.cos(state.heading)) * vehicle.dimensions.width / 2;
    assert.ok(Math.abs(state.x) + reach <= track.wallOffset - .049, `${vehicle.id}/${angle}: bumpers and flanks stay inside the guardrail`);
  }
});

test('curved and inclined city guardrails allow reverse and glancing forward recovery on both sides', () => {
  for (const track of [TRACKS.sanfrancisco, TRACKS.lisbon, TRACKS.warwick, TRACKS.hanoi]) for (const side of [-1, 1]) {
    const reverse = barrierState(track, VEHICLES.bmwX3, side, Math.PI / 2);
    const initialOffset = track.wallOffset - .94;
    for (let i = 0; i < 240; i++) stepDriving(reverse, { brake: 1, steer: side * .45 }, 1 / 120, track, VEHICLES.bmwX3);
    assert.ok(side * reverse.offset < initialOffset - 1.5, `${track.id}/${side}: reverse backs off the wall`);
    assert.ok(reverse.speed > 1.5 && reverse.reverse);
    const forward = barrierState(track, VEHICLES.bmwX3, side, .25, 10);
    for (let i = 0; i < 180; i++) stepDriving(forward, { throttle: .35, steer: -side * .6 }, 1 / 120, track, VEHICLES.bmwX3);
    assert.ok(forward.speed > 8, `${track.id}/${side}: forward steering preserves useful speed`);
    assert.ok(side * forward.offset < initialOffset - .05, `${track.id}/${side}: steering moves off the barrier`);
    assert.equal(forward.collision, 0, 'continued steering away does not keep colliding');
  }
});

test('rear-wheel handbraking initiates a drift and releasing with countersteer recovers every car', () => {
  for (const vehicle of Object.values(VEHICLES)) {
    const baseline = createDrivingState(flat), drift = createDrivingState(flat);
    baseline.vz = baseline.speed = drift.vz = drift.speed = 20;
    for (let i = 0; i < 84; i++) {
      stepDriving(baseline, { steer: .35, throttle: .15 }, 1 / 120, flat, vehicle);
      stepDriving(drift, { steer: .35, throttle: .15, handbrake: 1 }, 1 / 120, flat, vehicle);
    }
    assert.ok(Math.abs(drift.rearSlip) > Math.abs(baseline.rearSlip) * 2, `${vehicle.id}: the rear tyres break traction`);
    assert.ok(drift.yawRate > baseline.yawRate * 1.8, `${vehicle.id}: braking the rear axle creates oversteer`);
    assert.ok(Math.abs(drift.slipAngle) > .3, `${vehicle.id}: the car travels at an angle to its heading`);
    assert.equal(drift.reverse, false, 'handbraking never requests reverse');
    const initialSlip = Math.abs(drift.slipAngle);
    for (let i = 0; i < 240; i++) stepDriving(drift, {
      steer: -Math.sign(drift.yawRate) * Math.min(.5, Math.abs(drift.yawRate) * .8), throttle: .25,
    }, 1 / 120, flat, vehicle);
    assert.ok(Math.abs(drift.slipAngle) < initialSlip * .15, `${vehicle.id}: countersteer restores traction`);
    assert.ok(Math.abs(drift.yawRate) < .1, `${vehicle.id}: the yaw settles after release`);
    assert.ok(drift.speed > 3 && Number.isFinite(drift.x) && Number.isFinite(drift.z));
  }
  const stopped = createDrivingState(flat);
  run(stopped, { handbrake: 1, steer: 1 }, 2);
  assert.equal(stopped.speed, 0);
  assert.equal(stopped.yawRate, 0);
  assert.equal(stopped.reverse, false);
});

test('high speed saturates tyre grip and widens the turn', () => {
  const slow = createDrivingState(flat), fast = createDrivingState(flat);
  slow.vz = slow.speed = 8; fast.vz = fast.speed = 35;
  run(slow, { steer: .45, throttle: .2 }, 1);
  run(fast, { steer: .45, throttle: .2 }, 1);
  assert.ok(fast.slip > slow.slip + .4);
  assert.ok(fast.yawRate / fast.speed < slow.yawRate / slow.speed * .35);
  assert.ok(Math.abs(fast.lateralAccel) <= 10.8, `lateral acceleration ${fast.lateralAccel}`);
  assert.ok(Math.abs(fast.frontSlip) > Math.abs(fast.rearSlip), 'front tyre saturation produces understeer');
});

test('rear-drive power uses rear cornering grip and stability limits oversteer', () => {
  const assisted = createDrivingState(flat), unassisted = createDrivingState(flat);
  assisted.vz = assisted.speed = 20; unassisted.vz = unassisted.speed = 20;
  run(assisted, { steer: .3, throttle: 1, stability: true }, .75);
  run(unassisted, { steer: .3, throttle: 1, stability: false }, .75);
  assert.ok(Math.abs(unassisted.rearSlip) > Math.abs(assisted.rearSlip) * 1.5);
  assert.ok(unassisted.yawRate > assisted.yawRate * 1.5);
  assert.ok(Number.isFinite(unassisted.speed));
});

test('runoff lowers cornering grip and a barrier removes outward motion', () => {
  const road = { ...flat, width: 12, wallOffset: 100 };
  const asphalt = createDrivingState(road), runoff = createDrivingState(road);
  asphalt.vz = asphalt.speed = 20; runoff.vz = runoff.speed = 20;
  runoff.x = runoff._lastX = 8.3;
  asphalt.steering = runoff.steering = .45;
  run(asphalt, { steer: .45 }, .2, road); run(runoff, { steer: .45 }, .2, road);
  assert.ok(runoff.offTrack);
  assert.ok(runoff.lateralAccel < asphalt.lateralAccel * .65);
  const barrierTrack = { ...road, wallOffset: 10.5 }, impact = createDrivingState(barrierTrack);
  impact.x = impact._lastX = 9.5; impact.vx = 10; impact.vz = 20;
  impact.speed = Math.hypot(impact.vx, impact.vz);
  stepDriving(impact, {}, 1 / 120, barrierTrack);
  assert.ok(impact.x <= 9.56 + 1e-8);
  assert.ok(impact.vx <= .01);
  assert.ok(impact.collision > .1);
  assert.ok(impact.invalidLap);
});

test('control inputs alone can drive a complete valid lap on the real circuit', () => {
  const state = createDrivingState();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let maxOffset = 0, maxSpeed = 0;
  for (let i = 0; i < 120 * 150 && state.lap === 1; i++) {
    // Brake for upcoming bends using the speed available at 0.55 G lateral
    // acceleration and 5 m/s² braking. No car pose or velocity is overwritten.
    let targetSpeed = 35;
    for (let distance = 0; distance <= 110; distance += 5) {
      const curve = TRACK.sample(state.s + distance).curvature;
      const cornerSpeed = Math.sqrt(5.4 / Math.max(.001, Math.abs(curve)));
      targetSpeed = Math.min(targetSpeed, Math.sqrt(cornerSpeed ** 2 + 10 * distance));
    }
    const lookahead = 6 + state.speed * .42, point = TRACK.sample(state.s + lookahead);
    const targetHeading = Math.atan2(point.x - state.x, point.z - state.z);
    const error = Math.atan2(Math.sin(targetHeading - state.heading), Math.cos(targetHeading - state.heading));
    const wheelAngle = Math.atan(2 * 2.68 * Math.sin(error) / lookahead);
    const steer = clamp(wheelAngle / (.53 / (1 + state.speed * .02)), -1, 1);
    stepDriving(state, {
      steer, throttle: clamp((targetSpeed - state.speed) * .45, 0, .85),
      brake: clamp((state.speed - targetSpeed) * .45, 0, .8), stability: true,
    }, 1 / 120);
    maxOffset = Math.max(maxOffset, Math.abs(state.offset));
    maxSpeed = Math.max(maxSpeed, state.speed);
  }
  assert.equal(state.lap, 2);
  assert.equal(state.lastLapValid, true);
  assert.equal(state.bestLap, state.lastLap);
  assert.ok(state.lastLap > 60 && state.lastLap < 100, `lap time ${state.lastLap}`);
  assert.ok(maxOffset < 3, `maximum road offset ${maxOffset}`);
  assert.ok(maxSpeed > 30, `maximum speed ${maxSpeed}`);
  assert.equal(state.collision, 0);
});

// A recorded forward motion trace isolates timing logic from driver skill.
// Poses are only 1.25 m apart and the velocity matches the trace at 25 m/s.
function driveTrace(state, offsetAt = () => 0, backwards = false) {
  const increment = 1.25, speed = 25, dt = increment / speed;
  for (let distance = 0; distance <= TRACK.length + increment * 2; distance += increment) {
    const s = backwards ? TRACK.length - distance : distance;
    const p = TRACK.sample(s), offset = offsetAt(distance);
    state.x = p.x + p.nx * offset; state.z = p.z + p.nz * offset;
    state.heading = p.heading + (backwards ? Math.PI : 0);
    state.vx = Math.sin(state.heading) * speed; state.vz = Math.cos(state.heading) * speed;
    state.speed = speed; state.yawRate = (backwards ? -1 : 1) * p.curvature * speed;
    state.steering = Math.atan(2.68 * p.curvature) / (.53 / (1 + speed * .02));
    stepDriving(state, { throttle: .15, steer: state.steering }, dt, TRACK);
  }
}

test('a forward circuit through all checkpoints records a valid lap', () => {
  const state = createDrivingState();
  driveTrace(state);
  assert.equal(state.lap, 2);
  assert.ok(state.lastLap > 65 && state.lastLap < 72);
  assert.equal(state.lastLapValid, true);
  assert.equal(state.bestLap, state.lastLap);
});

test('a smooth runoff excursion invalidates the lap without setting a best time', () => {
  const state = createDrivingState();
  const middle = TRACK.length * .32;
  driveTrace(state, s => Math.max(0, 7 - Math.abs(s - middle) * .12));
  assert.equal(state.lap, 2);
  assert.equal(state.lastLapValid, false);
  assert.equal(state.bestLap, null);
  assert.ok(state.lastLap > 0);
});

test('reverse circuits and teleporting to the timing line cannot farm laps', () => {
  const reverse = createDrivingState();
  driveTrace(reverse, () => 0, true);
  assert.equal(reverse.lap, 1);
  assert.equal(reverse.lastLap, null);
  const teleport = createDrivingState();
  const nearEnd = TRACK.sample(TRACK.length - .3);
  teleport.x = nearEnd.x; teleport.z = nearEnd.z; teleport.heading = nearEnd.heading;
  teleport.vx = Math.sin(nearEnd.heading) * 25; teleport.vz = Math.cos(nearEnd.heading) * 25;
  teleport.speed = 25;
  stepDriving(teleport, {}, .05);
  assert.equal(teleport.lap, 1);
  assert.equal(teleport.lastLap, null);
  assert.equal(teleport.bestLap, null);
});

test('reset restores the spawn and clears timing and input state', () => {
  const state = createDrivingState();
  run(state, { throttle: 1, steer: .2 }, .5, TRACK);
  state.bestLap = 70;
  assert.equal(resetDriving(state), state);
  assert.deepEqual(state, createDrivingState());
});
