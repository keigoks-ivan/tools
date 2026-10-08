import test from 'node:test';
import assert from 'node:assert/strict';
import { createTiltSteering, orientationRoll } from './tilt-steering.mjs';
import { createDrivingState, stepDriving } from './physics.mjs';

const radians = Math.PI / 180;
function fire(target, type, properties = {}) {
  const event = new Event(type);
  Object.assign(event, properties);
  target.dispatchEvent(event);
}
// Invert the gravity projection for a phone held 60 degrees above horizontal.
// The inputs describe physical clockwise rotation without reusing orientationRoll.
function rotatedPhone(clockwiseDegrees) {
  const radius = Math.sin(60 * radians);
  const beta = Math.asin(radius * Math.cos(clockwiseDegrees * radians)) / radians;
  const gamma = Math.asin(radius * Math.sin(clockwiseDegrees * radians)
    / Math.cos(beta * radians)) / radians;
  return { beta, gamma };
}
function fixture(options = {}) {
  const target = new EventTarget(), screenTarget = new EventTarget();
  let time = 0, timerId = 0;
  const timers = new Map(), statuses = [];
  const tilt = createTiltSteering({
    target, screenTarget, orientationEvent: {}, isSecure: true,
    now: () => time, onStatus: status => statuses.push(status),
    setTimer: (callback, delay) => {
      const id = ++timerId;
      timers.set(id, { callback, deadline: time + delay });
      return id;
    },
    clearTimer: id => timers.delete(id),
    ...options,
  });
  function advance(milliseconds) {
    time += milliseconds;
    for (const [id, timer] of [...timers]) {
      if (timer.deadline <= time && timers.delete(id)) timer.callback();
    }
  }
  const orientation = (beta, gamma) => fire(target, 'deviceorientation', { beta, gamma });
  const rotation = degrees => fire(target, 'deviceorientation', rotatedPhone(degrees));
  async function enableAt(degrees = 0) {
    const promise = tilt.enable();
    await Promise.resolve();
    rotation(degrees);
    assert.equal(await promise, true);
  }
  function settleSteering() {
    let value;
    for (let i = 0; i < 30; i++) value = tilt.sample(1 / 60);
    return value;
  }
  return { tilt, target, screenTarget, timers, statuses, advance, orientation, rotation,
    enableAt, settleSteering };
}

test('enable requests sensor permission synchronously inside the initiating call', async () => {
  let requested = false, resolvePermission;
  const permission = new Promise(resolve => { resolvePermission = resolve; });
  const f = fixture({ orientationEvent: { requestPermission() { requested = true; return permission; } } });
  const enabled = f.tilt.enable();
  assert.equal(requested, true, 'permission must precede the first asynchronous boundary');
  assert.equal(f.tilt.pending, true);
  assert.equal(f.tilt.status, 'requesting');
  resolvePermission('granted');
  await Promise.resolve();
  assert.equal(f.tilt.status, 'waiting');
  assert.equal(f.tilt.enabled, false, 'permission alone does not demonstrate working sensor data');
  f.rotation(0);
  assert.equal(await enabled, true);
  assert.deepEqual(f.statuses, ['requesting', 'waiting', 'ready']);
  assert.equal(f.timers.size, 0);
});

test('denied, throwing, and rejected permissions leave button steering available', async () => {
  for (const requestPermission of [
    () => 'denied',
    () => { throw new Error('blocked by host app'); },
    () => Promise.reject(new Error('sensor access refused')),
  ]) {
    const f = fixture({ orientationEvent: { requestPermission } });
    assert.equal(await f.tilt.enable(), false);
    assert.equal(f.tilt.status, 'denied');
    assert.equal(f.tilt.enabled, false);
    assert.equal(f.tilt.pending, false);
    f.rotation(30);
    assert.equal(f.tilt.sample(.1), 0);
    assert.equal(f.timers.size, 0);
  }
});

test('insecure contexts and absent orientation API fail before requesting permission', async () => {
  let requests = 0;
  for (const options of [
    { isSecure: false, orientationEvent: { requestPermission() { requests++; return 'granted'; } } },
    { orientationEvent: null },
  ]) {
    const f = fixture(options);
    assert.equal(await f.tilt.enable(), false);
    assert.equal(f.tilt.status, 'unavailable');
    assert.equal(f.tilt.pending, false);
    assert.equal(f.tilt.sample(.1), 0);
    assert.equal(f.timers.size, 0);
  }
  assert.equal(requests, 0);
});

test('permission granted without valid sensor readings times out and never activates later', async () => {
  const f = fixture();
  const enabled = f.tilt.enable();
  await Promise.resolve();
  f.advance(2499);
  assert.equal(f.tilt.pending, true);
  f.advance(1);
  assert.equal(await enabled, false);
  assert.equal(f.tilt.status, 'unavailable');
  assert.equal(f.tilt.enabled, false);
  f.rotation(0);
  assert.equal(f.tilt.enabled, false);
  assert.equal(f.tilt.sample(.1), 0);
  assert.equal(f.timers.size, 0);
});

test('null and nonfinite sensor values cannot falsely report sensor readiness', async () => {
  const f = fixture();
  const enabled = f.tilt.enable();
  await Promise.resolve();
  for (const [beta, gamma] of [[null, null], [60, null], [null, 0], [NaN, 0], [60, Infinity]]) {
    f.orientation(beta, gamma);
    assert.equal(f.tilt.status, 'waiting');
    assert.equal(f.tilt.enabled, false);
    assert.equal(f.tilt.pending, true);
  }
  f.advance(2500);
  assert.equal(await enabled, false);
});

test('finite flat readings prove access but cannot steer until the phone is lifted', async () => {
  const f = fixture();
  const enabled = f.tilt.enable();
  await Promise.resolve();
  f.orientation(0, 0);
  assert.equal(await enabled, true);
  assert.equal(f.tilt.enabled, true);
  assert.equal(f.tilt.status, 'flat');
  assert.equal(f.tilt.sample(.1), 0);
  f.rotation(90);
  assert.equal(f.tilt.status, 'ready');
  assert.equal(f.tilt.sample(.1), 0, 'lifting the phone establishes its neutral position');
  f.rotation(120);
  assert.ok(f.settleSteering() > .99);
  f.orientation(0, 0);
  assert.equal(f.tilt.status, 'flat');
  assert.equal(f.tilt.sample(.1), 0, 'laying the phone flat immediately clears prior steering');
});

test('portrait and either landscape grip steer clockwise to the right and counterclockwise left', async () => {
  const grips = [
    { neutral: [60, 0], right: [48.59038, 40.89339], left: [48.59038, -40.89339] },
    { neutral: [0, 60], right: [-25.6599, 56.3099], left: [25.6599, 56.3099] },
    { neutral: [0, -60], right: [25.6599, -56.3099], left: [-25.6599, -56.3099] },
  ];
  for (const grip of grips) {
    const f = fixture();
    const enabled = f.tilt.enable();
    await Promise.resolve();
    f.orientation(...grip.neutral);
    assert.equal(await enabled, true);
    assert.equal(f.tilt.sample(.1), 0);
    f.orientation(...grip.right);
    assert.ok(f.settleSteering() > .99, `right grip ${grip.neutral}`);
    f.orientation(...grip.left);
    assert.ok(f.settleSteering() < -.99, `left grip ${grip.neutral}`);
  }
});

test('crossing the plus/minus 180 degree boundary preserves the short steering direction', async () => {
  for (const [neutral, next, direction] of [[170, -170, 1], [-170, 170, -1]]) {
    const f = fixture();
    await f.enableAt(neutral);
    f.rotation(next);
    const steer = f.settleSteering();
    assert.ok(steer * direction > .63 && steer * direction < .65,
      `a 20 degree turn must not become a 340 degree turn: ${steer}`);
  }
});

test('deadzone rejects hand tremor, filtering smooths input, and 30 degrees reaches full lock', async () => {
  const f = fixture();
  await f.enableAt();
  for (const angle of [-1.9, 0, 1.9]) {
    f.rotation(angle);
    assert.equal(f.tilt.sample(.1), 0);
  }
  f.rotation(30);
  const first = f.tilt.sample(1 / 60), second = f.tilt.sample(1 / 60);
  assert.ok(first > 0 && first < .3, `first filtered value ${first}`);
  assert.ok(second > first && second < .5, `second filtered value ${second}`);
  assert.ok(f.settleSteering() > .99);
  f.rotation(80);
  assert.ok(f.settleSteering() <= 1 && f.settleSteering() > .99);
  f.rotation(-30);
  assert.ok(f.settleSteering() < -.99);
  f.rotation(0);
  assert.ok(Math.abs(f.settleSteering()) < .001, 'release approaches neutral smoothly');
});

test('recalibration centers the current grip and subsequent rotation uses the new neutral', async () => {
  const f = fixture();
  await f.enableAt();
  f.rotation(20);
  assert.ok(f.settleSteering() > .6);
  f.tilt.recalibrate();
  assert.equal(f.tilt.sample(.1), 0);
  assert.equal(f.tilt.status, 'ready');
  f.rotation(-10);
  assert.ok(f.settleSteering() < -.99);
});

test('screen changes clear steering and calibrate the first new orientation event', async () => {
  for (const nativeScreenEvent of [false, true]) {
    const f = fixture();
    await f.enableAt();
    f.rotation(30);
    assert.ok(f.settleSteering() > .99);
    fire(nativeScreenEvent ? f.screenTarget : f.target, nativeScreenEvent ? 'change' : 'orientationchange');
    assert.equal(f.tilt.status, 'calibrating');
    assert.equal(f.tilt.sample(.1), 0);
    f.rotation(90);
    assert.equal(f.tilt.sample(.1), 0);
    assert.equal(f.tilt.status, 'ready');
    f.rotation(60);
    assert.ok(f.settleSteering() < -.99);
  }
});

test('stale data releases steering and resumed sensor delivery recalibrates safely', async () => {
  const f = fixture();
  await f.enableAt();
  f.rotation(30);
  assert.ok(f.settleSteering() > .99);
  f.advance(1501);
  assert.equal(f.tilt.sample(.1), 0);
  assert.equal(f.tilt.status, 'stale');
  f.rotation(90);
  assert.equal(f.tilt.sample(.1), 0);
  assert.equal(f.tilt.status, 'ready');
  f.rotation(120);
  assert.ok(f.settleSteering() > .99);
});

test('disabling during an unresolved permission request prevents a late activation', async () => {
  let resolvePermission;
  const f = fixture({ orientationEvent: { requestPermission: () => new Promise(resolve => { resolvePermission = resolve; }) } });
  const enabled = f.tilt.enable();
  f.tilt.disable();
  resolvePermission('granted');
  assert.equal(await enabled, false);
  f.rotation(0);
  assert.equal(f.tilt.enabled, false);
  assert.equal(f.tilt.pending, false);
  assert.equal(f.tilt.status, 'off');
  assert.equal(f.tilt.sample(.1), 0);
  assert.equal(f.timers.size, 0);
});

test('disable while waiting settles the request and detached listeners leave zero output', async () => {
  const f = fixture();
  const enabled = f.tilt.enable();
  await Promise.resolve();
  f.tilt.disable();
  assert.equal(await enabled, false);
  assert.equal(f.timers.size, 0);
  f.rotation(0);
  fire(f.screenTarget, 'change');
  f.advance(3000);
  assert.equal(f.tilt.status, 'off');
  assert.equal(f.tilt.sample(.1), 0);
  await f.enableAt();
  f.rotation(30);
  assert.ok(f.settleSteering() > .99);
  f.tilt.destroy();
  f.rotation(-30);
  assert.equal(f.tilt.sample(.1), 0);
  assert.equal(f.tilt.status, 'off');
});

test('clockwise tilt with the main input convention moves the car toward screen right', async () => {
  async function drive(rotation) {
    const f = fixture();
    await f.enableAt(90);
    const state = createDrivingState();
    for (let i = 0; i < 240; i++) {
      if (i === 180) f.rotation(90 + rotation);
      stepDriving(state, { throttle: 1, steer: -f.tilt.sample(1 / 120), stability: true }, 1 / 120);
    }
    return state;
  }
  const straight = await drive(0), right = await drive(30), left = await drive(-30);
  // The chase view looks along +Z, where lower world X appears on screen right.
  assert.ok(right.x < straight.x - .2, `clockwise steering delta ${right.x - straight.x}`);
  assert.ok(left.x > straight.x + .2, `counterclockwise steering delta ${left.x - straight.x}`);
  assert.ok(right.speed > 3 && left.speed > 3, 'sensor steering works while holding throttle');
});

test('gravity projection identifies flat and invalid inputs without inventing a roll', () => {
  for (const [beta, gamma] of [[0, 0], [null, 0], [0, null], [Infinity, 0], [0, NaN]]) {
    assert.equal(orientationRoll(beta, gamma), null);
  }
  for (const angle of [-170, -90, -30, 0, 30, 90, 170]) {
    const { beta, gamma } = rotatedPhone(angle);
    assert.ok(Math.abs(orientationRoll(beta, gamma) - angle) < 1e-8);
  }
});
