import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from './track.mjs';
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
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const run = (state, input, seconds, vehicle, track = flat) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) {
    stepDriving(state, typeof input === 'function' ? input(state) : input, 1 / 120, track, vehicle);
  }
  return state;
};

test('the hybrid supercar, track coupe and heavy SUV accelerate differently', () => {
  const accelerated = Object.fromEntries(Object.values(VEHICLES).map(vehicle => [vehicle.id,
    run(createDrivingState(flat), { throttle: 1 }, 10, vehicle),
  ]));
  const { porsche911gt3rs: coupe, bmwX3: suv, ferrari296Speciale: hybrid } = accelerated;
  assert.ok(hybrid.speed > coupe.speed * 1.1, 'the hybrid preset accelerates more strongly');
  assert.ok(coupe.speed > suv.speed * 1.25, 'the heavy SUV accelerates more gradually');
  assert.ok(hybrid.z > coupe.z * 1.1, 'the acceleration advantage also covers more road');
  for (const state of Object.values(accelerated)) {
    assert.ok(state.gear >= 3, 'each drivetrain shifts up under sustained acceleration');
    assert.ok(Number.isFinite(state.speed) && state.speed > 25);
  }
});

test('at equal driving speeds the cars have distinct turn response and cornering grip', () => {
  const response = {}, grip = {};
  for (const vehicle of Object.values(VEHICLES)) {
    const turn = createDrivingState(flat);
    turn.vz = turn.speed = 20;
    // The same steering input and speed target isolate handling from acceleration.
    // Speed is maintained through the throttle; no pose or velocity is overwritten.
    run(turn, state => ({ steer: .25, throttle: clamp((20 - state.speed) * 2, 0, .95) }), 3, vehicle);
    assert.ok(Math.abs(turn.speed - 20) < 1, `${vehicle.id} holds the shared cornering speed`);
    response[vehicle.id] = turn.yawRate / turn.speed;

    const saturated = createDrivingState(flat);
    saturated.vz = saturated.speed = 30;
    run(saturated, { steer: .5 }, 1, vehicle);
    assert.ok(saturated.slip > .9, `${vehicle.id} reaches tyre saturation`);
    grip[vehicle.id] = Math.abs(saturated.lateralAccel);
  }
  assert.ok(response.porsche911gt3rs > response.bmwX3 * 1.15, 'the track coupe follows a tighter turn than the SUV');
  assert.ok(response.lotusEmira > response.bmwM4 * 1.12, 'the compact mid-engine car turns more readily than the larger coupe');
  assert.ok(grip.porsche911gt3rs > grip.bmwX3 * 1.2, 'the track coupe sustains more cornering acceleration than the SUV');
  assert.ok(grip.corvetteZ06 > grip.nissanZ * 1.1, 'the track supercar retains more cornering grip');
});

for (const track of Object.values(TRACKS)) {
  for (const vehicle of Object.values(VEHICLES)) {
    test(`${track.id} / ${vehicle.id}: inputs alone complete a valid lap`, () => {
      const state = createDrivingState(track);
      let maxOffset = 0, maxSpeed = 0, collided = false, leftAsphalt = false;
      for (let i = 0; i < 120 * 200 && state.lap === 1; i++) {
        // Conservative bend speeds and braking lookahead are shared by all
        // combinations; steering uses the selected car's wheelbase and lock.
        let targetSpeed = 32;
        for (let distance = 0; distance <= 110; distance += 5) {
          const curve = track.sample(state.s + distance).curvature;
          const cornerSpeed = Math.sqrt(4.8 / Math.max(.001, Math.abs(curve)));
          targetSpeed = Math.min(targetSpeed, Math.sqrt(cornerSpeed ** 2 + 10 * distance));
        }
        const lookahead = 6 + state.speed * .42, point = track.sample(state.s + lookahead);
        const targetHeading = Math.atan2(point.x - state.x, point.z - state.z);
        const error = Math.atan2(Math.sin(targetHeading - state.heading), Math.cos(targetHeading - state.heading));
        const wheelAngle = Math.atan(2 * (vehicle.frontAxle + vehicle.rearAxle) * Math.sin(error) / lookahead);
        const steer = clamp(wheelAngle / (vehicle.steerLock / (1 + state.speed * .02)), -1, 1);
        stepDriving(state, {
          steer, throttle: clamp((targetSpeed - state.speed) * .45, 0, .85),
          brake: clamp((state.speed - targetSpeed) * .45, 0, .8), stability: true,
        }, 1 / 120, track, vehicle);
        maxOffset = Math.max(maxOffset, Math.abs(state.offset));
        maxSpeed = Math.max(maxSpeed, state.speed);
        collided ||= state.collision > 0;
        leftAsphalt ||= state.offTrack;
      }
      const observation = `progress ${state.s.toFixed(1)}m, offset ${maxOffset.toFixed(2)}m, collision ${collided}, runoff ${leftAsphalt}`;
      assert.equal(state.lap, 2, observation);
      assert.equal(state.lastLapValid, true, observation);
      assert.equal(state.bestLap, state.lastLap);
      assert.ok(state.lastLap > 30 && state.lastLap < 200, `lap time ${state.lastLap}`);
      assert.ok(maxOffset < track.width / 2, observation);
      assert.ok(maxSpeed > 25, `maximum speed ${maxSpeed}`);
      assert.equal(collided, false, observation);
      assert.equal(leftAsphalt, false, observation);
    });
  }
}

test('switching circuits resets the same driving state at the new circuit spawn', () => {
  const circuits = Object.values(TRACKS), state = createDrivingState(circuits[0]);
  for (let i = 0; i < circuits.length; i++) {
    const previous = circuits[i], next = circuits[(i + 1) % circuits.length];
    run(state, { throttle: 1 }, 1, VEHICLES.ferrari458, previous);
    state.bestLap = 100; state.invalidLap = true;
    assert.equal(resetDriving(state, next), state, 'reset preserves the state object used by the game');
    assert.deepEqual(state, createDrivingState(next));
    assert.equal(state.x, next.spawn.x);
    assert.equal(state.z, next.spawn.z);
    assert.equal(state.heading, next.spawn.heading);
    assert.notEqual(next.id, previous.id, 'the reset is checked against a different selected circuit');
  }
});
