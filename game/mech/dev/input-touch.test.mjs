import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../input.js';

class Element extends EventTarget {
  style = {};
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 150, height: 150 }; }
  querySelector() { return this.knob; }
}

function browser(t) {
  const window = new EventTarget(), document = new EventTarget();
  const nodes = Object.fromEntries(['touch', 'tPad', 'tLook', 'tFire', 'tJump'].map(id => [id, new Element()]));
  nodes.tPad.knob = new Element();
  document.getElementById = id => nodes[id] || null;
  document.querySelector = () => nodes.tPad.knob;
  const globals = { document, addEventListener: window.addEventListener.bind(window), matchMedia: () => ({ matches: true }) };
  const original = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    for (const key of Object.keys(globals)) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]);
      else delete globalThis[key];
    }
  });
  const canvas = new Element(), input = new Input(canvas);
  return { input, canvas, document, nodes };
}

function pointer(target, type, pointerId, clientX = 75, clientY = 75) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId, clientX, clientY });
  target.dispatchEvent(event);
}

function touchEnd(target, cancelable = true) {
  const event = new Event('touchend', { cancelable });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

test('rapid gameplay taps cancel native zoom on the canvas and touch overlay', t => {
  const { input, canvas, nodes } = browser(t);
  input.enabled = true;
  for (let tap = 0; tap < 4; tap++) {
    assert.equal(touchEnd(canvas), true);
    assert.equal(touchEnd(nodes.touch), true);
  }
  assert.equal(touchEnd(canvas, false), false, 'noncancelable browser events remain valid');
});

test('zoom guard leaves title and menu touch events alone', t => {
  const { input, canvas, document, nodes } = browser(t);
  assert.equal(touchEnd(canvas), false, 'title input is disabled');
  assert.equal(touchEnd(nodes.touch), false);
  input.enabled = true;
  assert.equal(touchEnd(document), false, 'no document-wide touch cancellation');
});

test('movement, aim and rapid firing still work together with zoom prevention', t => {
  const { input, nodes } = browser(t);
  input.enabled = true;
  pointer(nodes.tPad, 'pointerdown', 1, 150, 75);
  pointer(nodes.tLook, 'pointerdown', 2, 300, 100);
  pointer(nodes.tLook, 'pointermove', 2, 320, 110);
  for (let tap = 0; tap < 4; tap++) {
    pointer(nodes.tFire, 'pointerdown', 3);
    const state = input.state(1 / 60);
    assert.equal(state.mx, 1);
    assert.equal(state.fire, true);
    if (tap === 0) { assert.ok(state.lookX > 0); assert.ok(state.lookY > 0); }
    pointer(nodes.tFire, 'pointerup', 3);
    assert.equal(touchEnd(nodes.touch), true);
    assert.equal(input.state(1 / 60).fire, false, 'released fire never sticks');
    input.endFrame();
  }
  pointer(nodes.tFire, 'pointerdown', 3);
  pointer(nodes.tFire, 'pointercancel', 3);
  pointer(nodes.tPad, 'pointerup', 1);
  pointer(nodes.tLook, 'pointercancel', 2);
  const state = input.state(1 / 60);
  assert.equal(state.mx, 0);
  assert.equal(state.fire, false);
  assert.equal(input.touch.look, null);
});
