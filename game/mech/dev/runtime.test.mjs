import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityLevel, pixelRatio, FrameGate } from '../runtime.js';
import { Input } from '../input.js';

test('corrupt quality settings recover to a valid preset', () => {
  assert.equal(qualityLevel(NaN), 1);
  assert.equal(qualityLevel('broken'), 1);
  assert.equal(qualityLevel(-8), 0);
  assert.equal(qualityLevel(100), 2);
});
test('4K and retina screens respect each pixel budget', () => {
  for (const [q, budget] of [1280 * 720, 1920 * 1080, 2560 * 1440].entries()) {
    const ratio = pixelRatio(3840, 2160, 2, q);
    assert.ok(3840 * 2160 * ratio ** 2 <= budget + 1);
    assert.ok(Number.isFinite(ratio) && ratio > 0);
  }
  assert.equal(pixelRatio(1280, 720, 1, 1), 1);
});
test('120/144 Hz displays submit about 60 battle frames and 30 title frames', () => {
  for (const hz of [60, 120, 144]) for (const fps of [30, 60]) {
    const gate = new FrameGate(); let count = 0;
    for (let i = 0; i < hz * 10; i++) if (gate.ready(i * 1000 / hz, fps)) count++;
    assert.ok(Math.abs(count - fps * 10) <= 1, `${hz} Hz → ${count / 10} fps`);
  }
});
test('return from a hidden tab cannot issue catch-up render bursts', () => {
  const gate = new FrameGate();
  assert.equal(gate.ready(0), true);
  assert.equal(gate.ready(90000), true);
  assert.equal(gate.ready(90001), false);
  assert.equal(gate.ready(90001, 30), true);
});
test('pause resets touch, held triggers and accumulated mouse movement', () => {
  const knob = { style: { transform: 'translate(45px,45px)' } };
  globalThis.document = { querySelector: () => knob };
  const input = Object.assign(Object.create(Input.prototype), {
    keys: new Set(['KeyW', 'M0']), down: new Set(['KeyG']), up: new Set(['M2']),
    mdx: 75, mdy: 50, shiftT: 1, sens: 1, touch: { mx: 1, my: 1, pad: 9, look: 10 },
  });
  input.reset();
  const next = input.state(1 / 60);
  assert.equal(next.mx, 0); assert.equal(next.my, 0);
  assert.equal(next.fire, false); assert.equal(next.lockRelease, false);
  assert.equal(next.lookX, 0); assert.equal(next.lookY, 0);
  assert.equal(input.touch.pad, null); assert.equal(knob.style.transform, '');
});
