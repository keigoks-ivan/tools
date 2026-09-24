import assert from 'node:assert/strict';
import test from 'node:test';
import { installGameGestures } from '../2d/touch-gestures.js';

function fakeRoot() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener, options) { listeners.set(type, { listener, options }); },
    removeEventListener(type, listener, options) {
      const current = listeners.get(type);
      if (current?.listener === listener && current.options === options) listeners.delete(type);
    },
  };
}

test('double-click zoom guard is nonpassive, cancelable-aware, and limited to its root', () => {
  const root = fakeRoot();
  const outside = fakeRoot();
  const cleanup = installGameGestures(root);
  const handler = root.listeners.get('dblclick');
  assert.ok(handler);
  assert.equal(handler.options.passive, false);
  assert.equal(outside.listeners.size, 0);

  let prevented = false;
  handler.listener({ cancelable: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  prevented = false;
  handler.listener({ cancelable: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);

  cleanup();
  assert.equal(root.listeners.size, 0);
});

test('gesture guard cleanup is safe to call repeatedly and on unsupported roots', () => {
  const cleanup = installGameGestures(fakeRoot());
  cleanup();
  cleanup();
  assert.doesNotThrow(() => installGameGestures(null)());
});

test('touch double tap is canceled without blocking separate taps or pinch gestures', () => {
  const root = fakeRoot();
  const cleanup = installGameGestures(root);
  const handler = root.listeners.get('touchend');
  assert.equal(handler.options.passive, false);
  const tap = (x, y, timeStamp, touches = [], changedTouches = [{ clientX: x, clientY: y }]) => {
    let prevented = false;
    handler.listener({ touches, changedTouches, timeStamp, cancelable: true, preventDefault() { prevented = true; } });
    return prevented;
  };
  assert.equal(tap(100, 100, 100), false);
  assert.equal(tap(105, 104, 280), true);
  assert.equal(tap(105, 104, 450), false);
  assert.equal(tap(250, 100, 530), false);
  assert.equal(tap(250, 100, 600, [{ clientX: 1, clientY: 1 }]), false);
  assert.equal(tap(250, 100, 690), false);
  cleanup();
  assert.equal(root.listeners.size, 0);
});
