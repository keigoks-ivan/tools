import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, TRACKS } from './track.mjs';
import { createDrivingState, stepDriving } from './physics.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const crossing = (a, b, c, d) => {
  const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
};

test('the original coastal export is preserved and all twenty-three circuits are immutable', () => {
  assert.equal(TRACK, TRACKS.costa);
  assert.deepEqual(Object.keys(TRACKS), ['costa', 'alpine', 'canyon', 'grandprix', 'taipei', 'kualalumpur', 'kobe', 'london', 'sydney', 'goldcoast', 'melbourne', 'paris', 'prague', 'newcastle', 'bangkok', 'sanfrancisco', 'newyork', 'vancouver', 'hanoi', 'lisbon', 'marseille', 'nice', 'warwick']);
  assert.ok(Object.isFrozen(TRACKS));
  for (const track of Object.values(TRACKS)) {
    assert.ok(Object.isFrozen(track));
    assert.ok(Object.isFrozen(track.samples));
    assert.ok(Object.isFrozen(track.bounds));
    assert.ok(track.id && track.name && track.label && track.description && track.theme);
    assert.ok(track.length > 1500 && track.length < 3000);
    assert.ok(track.width >= 11 && track.wallOffset > track.width / 2 + 3);
  }
});

for (const track of Object.values(TRACKS)) {
  test(`${track.id}: continuous closed geometry, safe grades and a forward starting straight`, () => {
    assert.deepEqual(track.sample(0), track.sample(track.length));
    assert.deepEqual(track.spawn, track.sample(0));
    const end = track.sample(track.length - .01), start = track.sample(.01);
    assert.ok(Math.hypot(end.x - start.x, end.z - start.z) < .021);
    assert.ok(Math.abs(end.y - start.y) < .002);
    for (const p of track.samples) {
      for (const key of ['x', 'y', 'z', 'heading', 'curvature', 'nx', 'nz']) assert.ok(Number.isFinite(p[key]));
      assert.ok(p.x >= track.bounds.minX && p.x <= track.bounds.maxX);
      assert.ok(p.z >= track.bounds.minZ && p.z <= track.bounds.maxZ);
      assert.ok(Math.abs(track.sample(p.s + 2).y - p.y) / 2 < .07, 'road grade remains driveable');
      assert.ok(Math.abs(p.curvature) < .065, 'corners leave room inside the barriers');
    }
    const ahead = track.sample(45), dx = ahead.x - track.spawn.x, dz = ahead.z - track.spawn.z;
    assert.ok(dx * Math.sin(track.spawn.heading) + dz * Math.cos(track.spawn.heading) > 42);
    assert.ok(Math.abs(dx * track.spawn.nx + dz * track.spawn.nz) < 5);
  });

  test(`${track.id}: the road never intersects itself`, () => {
    const count = Math.ceil(track.length / 5), samples = Array.from({ length: count }, (_, i) => track.sample(i / count * track.length));
    for (let i = 0; i < count; i++) for (let j = i + 2; j < count; j++) {
      if (i === 0 && j === count - 1) continue;
      assert.equal(crossing(samples[i], samples[(i + 1) % count], samples[j], samples[(j + 1) % count]), false, `segments ${i} and ${j} cross`);
    }
  });

  test(`${track.id}: nearest queries recover the right road and signed shoulder offsets`, () => {
    for (let i = 0; i < 32; i++) {
      const p = track.sample(track.length * (i + .37) / 32);
      for (const side of [-1, 1]) {
        const x = p.x + p.nx * side * 3, z = p.z + p.nz * side * 3;
        for (const hint of [undefined, p.s, p.s + track.length / 2]) {
          const near = track.nearest(x, z, hint);
          const difference = Math.min(Math.abs(near.s - p.s), track.length - Math.abs(near.s - p.s));
          assert.ok(difference < .12, `distance along road ${difference}`);
          assert.ok(Math.abs(near.offset - side * 3) < .015);
          assert.ok(Math.abs(near.y - p.y) < .01);
        }
      }
    }
    const far = track.nearest(track.bounds.maxX + 900, track.bounds.maxZ + 900);
    assert.ok(Number.isFinite(far.s) && Number.isFinite(far.distance));
  });

  test(`${track.id}: steering, throttle and braking can complete a valid lap`, () => {
    const state = createDrivingState(track);
    let maxOffset = 0;
    for (let i = 0; i < 120 * 180 && state.lap === 1; i++) {
      let targetSpeed = 35;
      for (let distance = 0; distance <= 110; distance += 5) {
        const curve = track.sample(state.s + distance).curvature;
        const cornerSpeed = Math.sqrt(5.4 / Math.max(.001, Math.abs(curve)));
        targetSpeed = Math.min(targetSpeed, Math.sqrt(cornerSpeed ** 2 + 10 * distance));
      }
      const lookahead = 6 + state.speed * .42, point = track.sample(state.s + lookahead);
      const targetHeading = Math.atan2(point.x - state.x, point.z - state.z);
      const error = Math.atan2(Math.sin(targetHeading - state.heading), Math.cos(targetHeading - state.heading));
      const wheelAngle = Math.atan(2 * 2.68 * Math.sin(error) / lookahead);
      stepDriving(state, {
        steer: clamp(wheelAngle / (.53 / (1 + state.speed * .02)), -1, 1),
        throttle: clamp((targetSpeed - state.speed) * .45, 0, .85),
        brake: clamp((state.speed - targetSpeed) * .45, 0, .8), stability: true,
      }, 1 / 120, track);
      maxOffset = Math.max(maxOffset, Math.abs(state.offset));
    }
    assert.equal(state.lap, 2);
    assert.equal(state.lastLapValid, true);
    assert.ok(state.lastLap > 50 && state.lastLap < 160, `lap time ${state.lastLap}`);
    assert.ok(maxOffset < track.width / 2 - 1, `maximum road offset ${maxOffset}`);
    assert.equal(state.collision, 0);
  });
}
