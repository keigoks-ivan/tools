import test from 'node:test';
import assert from 'node:assert/strict';
import { ZOOM_BASE, ZOOM_STEPS, steppedZoom, zoomPercent, createWheelStepper, edgeScrollDirection } from './camera-steps.mjs';
import { Renderer } from './renderer.js';

test('zoom has five fixed levels around a 100% default of 1.1', () => {
  assert.deepEqual(ZOOM_STEPS.map(zoomPercent), [50, 75, 100, 125, 150]);
  assert.equal(ZOOM_STEPS[2], ZOOM_BASE);
});
test('stepping moves exactly one level and stops at both ends', () => {
  assert.equal(steppedZoom(ZOOM_BASE, 1), ZOOM_STEPS[3]);
  assert.equal(steppedZoom(ZOOM_BASE, -1), ZOOM_STEPS[1]);
  assert.equal(steppedZoom(ZOOM_STEPS[4], 1), ZOOM_STEPS[4]);
  assert.equal(steppedZoom(ZOOM_STEPS[0], -1), ZOOM_STEPS[0]);
  assert.equal(steppedZoom(1.0, 1), ZOOM_STEPS[2]);
  assert.equal(steppedZoom(1.0, -1), ZOOM_STEPS[1]);
});
test('a mouse notch is one step and a trackpad inertia burst cannot skip levels', () => {
  const step = createWheelStepper();
  assert.equal(step(-100, 0), 1);
  assert.equal(step(-100, 600), 1);
  const times = []; for (let i = 0; i < 30; i++) if (step(-12, 2000 + i * 8)) times.push(2000 + i * 8);
  assert.ok(times.length >= 1 && times.length <= 3);
  assert.ok(times.every((t, i) => !i || t - times[i - 1] >= 110));
  assert.equal(step(100, 5000), -1);
  assert.equal(step(10, 6000), 0);
});
test('renderer zoomStep lands exactly on levels and keeps the screen centre', () => {
  const view = Object.assign(Object.create(Renderer.prototype), { width: 1920, height: 774, tileW: 42, tileH: 21, zoom: ZOOM_BASE, pan: { x: 0, y: 0 }, project: { map: { size: 128 } } });
  view.center({ x: 40, y: 50 });
  const before = view.world(960, 387);
  view.zoomStep(1); assert.equal(view.zoom, ZOOM_STEPS[3]);
  const after = view.world(960, 387); assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 1e-6);
  for (let i = 0; i < 9; i++) view.zoomStep(1); assert.equal(view.zoom, ZOOM_STEPS[4]);
  for (let i = 0; i < 9; i++) view.zoomStep(-1); assert.equal(view.zoom, ZOOM_STEPS[0]);
});
test('edge scroll triggers at the window edge, including the HUD strips, and nowhere inside', () => {
  const vp = { width: 1920, height: 1080 };
  assert.deepEqual(edgeScrollDirection({ x: 960, y: 0 }, vp), { dx: 0, dy: 1 });
  assert.deepEqual(edgeScrollDirection({ x: 0, y: 1079 }, vp), { dx: 1, dy: -1 });
  assert.deepEqual(edgeScrollDirection({ x: 1919, y: 500 }, vp), { dx: -1, dy: 0 });
  assert.deepEqual(edgeScrollDirection({ x: 960, y: 540 }, vp), { dx: 0, dy: 0 });
  assert.deepEqual(edgeScrollDirection({ x: 12, y: 12 }, vp), { dx: 0, dy: 0 });
  assert.deepEqual(edgeScrollDirection(null, vp), { dx: 0, dy: 0 });
});
