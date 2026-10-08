import test from 'node:test';
import assert from 'node:assert/strict';
import { installTouchControls } from './touch-controls.mjs';
import { createDrivingState, stepDriving } from './physics.mjs';

class Button extends EventTarget {
  attributes = new Map();
  captures = new Set();
  classes = new Set();
  classList = { toggle: (name, pressed) => pressed ? this.classes.add(name) : this.classes.delete(name) };
  setAttribute(name, value) { this.attributes.set(name, value); }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) {
    this.captures.delete(id);
    fire(this, 'lostpointercapture', { pointerId: id, pointerType: 'mouse' });
  }
}

function fire(button, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  button.dispatchEvent(event);
  return event;
}
const touch = (button, type, ...ids) => fire(button, type, {
  changedTouches: ids.map(identifier => ({ identifier })),
});
const pointer = (button, type, id, pointerType = 'mouse', buttonIndex = 0) => fire(button, type, {
  pointerId: id, pointerType, button: buttonIndex,
});
function fixture() {
  const controls = Object.fromEntries(['left', 'right', 'throttle', 'brake'].map(name => [name, new Button()]));
  const session = { driving: true, input: { steer: 0, throttle: 0, brake: 0 }, changes: [] };
  const handler = installTouchControls(controls, {
    canDrive: () => session.driving,
    onChange: input => { session.input = input; session.changes.push(input); },
  });
  return { controls, session, handler };
}

test('two fingers can hold throttle and change steering without releasing the pedal', () => {
  const { controls, session } = fixture();
  touch(controls.throttle, 'touchstart', 1);
  touch(controls.left, 'touchstart', 2);
  assert.deepEqual(session.input, { steer: -1, throttle: 1, brake: 0 });
  assert.equal(controls.left.attributes.get('aria-pressed'), 'true');
  touch(controls.left, 'touchend', 2);
  assert.deepEqual(session.input, { steer: 0, throttle: 1, brake: 0 });
  touch(controls.right, 'touchstart', 3);
  touch(controls.throttle, 'touchend', 1);
  assert.deepEqual(session.input, { steer: 1, throttle: 0, brake: 0 });
  assert.ok(controls.right.classes.has('is-pressed'));
  touch(controls.right, 'touchend', 3);
  assert.deepEqual(session.input, { steer: 0, throttle: 0, brake: 0 });
});

test('cancellation releases only that contact and capture loss releases a mouse hold', () => {
  const { controls, session } = fixture();
  touch(controls.throttle, 'touchstart', 1, 2);
  touch(controls.right, 'touchstart', 3);
  touch(controls.throttle, 'touchcancel', 1);
  assert.equal(session.input.throttle, 1);
  touch(controls.right, 'touchcancel', 3);
  assert.deepEqual(session.input, { steer: 0, throttle: 1, brake: 0 });
  touch(controls.throttle, 'touchcancel', 2);
  pointer(controls.brake, 'pointerdown', 8);
  assert.equal(session.input.brake, 1);
  pointer(controls.brake, 'lostpointercapture', 8);
  assert.deepEqual(session.input, { steer: 0, throttle: 0, brake: 0 });
  pointer(controls.left, 'pointerdown', 9);
  pointer(controls.left, 'pointercancel', 9);
  assert.equal(session.input.steer, 0);
});

test('pause clears every contact and capture before a new finger starts driving', () => {
  const { controls, session, handler } = fixture();
  touch(controls.throttle, 'touchstart', 1);
  touch(controls.left, 'touchstart', 2);
  pointer(controls.brake, 'pointerdown', 3);
  session.driving = false;
  handler.clear();
  assert.deepEqual(session.input, { steer: 0, throttle: 0, brake: 0 });
  for (const button of Object.values(controls)) {
    assert.equal(button.attributes.get('aria-pressed'), 'false');
    assert.equal(button.classes.has('is-pressed'), false);
    assert.equal(button.captures.size, 0);
  }
  session.driving = true;
  touch(controls.right, 'touchstart', 4);
  touch(controls.left, 'touchend', 2);
  touch(controls.throttle, 'touchend', 1);
  assert.deepEqual(session.input, { steer: 1, throttle: 0, brake: 0 });
  touch(controls.right, 'touchend', 4);
  assert.deepEqual(session.input, { steer: 0, throttle: 0, brake: 0 });
});

test('rapid taps prevent browser touch defaults throughout each contact', () => {
  const { controls, session } = fixture();
  for (let id = 1; id <= 4; id++) {
    assert.ok(touch(controls.left, 'touchstart', id).defaultPrevented);
    assert.ok(touch(controls.left, 'touchmove', id).defaultPrevented);
    assert.ok(touch(controls.left, 'touchend', id).defaultPrevented);
  }
  assert.deepEqual(session.input, { steer: 0, throttle: 0, brake: 0 });
});

test('compatibility touch PointerEvents neither duplicate nor prematurely release a finger', () => {
  const { controls, session } = fixture();
  pointer(controls.throttle, 'pointerdown', 10, 'touch');
  touch(controls.throttle, 'touchstart', 1);
  assert.equal(session.changes.length, 1);
  assert.equal(session.input.throttle, 1);
  pointer(controls.throttle, 'pointerup', 10, 'touch');
  pointer(controls.throttle, 'lostpointercapture', 10, 'touch');
  assert.equal(session.changes.length, 1);
  assert.equal(session.input.throttle, 1);
  touch(controls.throttle, 'touchend', 1);
  assert.equal(session.input.throttle, 0);
});

test('mouse input works and inactive sessions reject touch, mouse and keyboard holds', () => {
  const { controls, session } = fixture();
  assert.ok(pointer(controls.right, 'pointerdown', 1).defaultPrevented);
  assert.equal(session.input.steer, 1);
  pointer(controls.right, 'pointerup', 1);
  pointer(controls.left, 'pointerdown', 2, 'mouse', 2);
  assert.equal(session.input.steer, 0);
  session.driving = false;
  assert.ok(touch(controls.throttle, 'touchstart', 3).defaultPrevented);
  assert.ok(pointer(controls.left, 'pointerdown', 4).defaultPrevented);
  assert.ok(fire(controls.brake, 'keydown', { code: 'Space' }).defaultPrevented);
  assert.deepEqual(session.input, { steer: 0, throttle: 0, brake: 0 });
  assert.equal(controls.left.captures.size, 0);
});

test('held touch steering reaches the physics and moves toward the selected screen side', () => {
  function drive(direction) {
    const { controls, session } = fixture();
    const state = createDrivingState();
    touch(controls.throttle, 'touchstart', 1);
    for (let i = 0; i < 240; i++) {
      if (i === 180 && direction) touch(controls[direction], 'touchstart', 2);
      stepDriving(state, { ...session.input, steer: -session.input.steer, stability: true }, 1 / 120);
    }
    return state;
  }
  const straight = drive(), left = drive('left'), right = drive('right');
  // The chase camera looks along +Z, making +X the screen's left.
  assert.ok(left.x > straight.x + .2, `left delta ${left.x - straight.x}`);
  assert.ok(right.x < straight.x - .2, `right delta ${right.x - straight.x}`);
  assert.ok(left.speed > 3 && right.speed > 3, 'steering keeps simultaneous throttle active');
});
