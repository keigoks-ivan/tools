import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK } from './track.mjs';
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
  run(state, { brake: 1 }, 2);
  assert.equal(state.speed, 0);
  assert.ok(state.braking > .99);
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
