import assert from 'node:assert/strict';
import test from 'node:test';
import { depthScaleAt, FollowCamera } from '../2d/depth-view.js';

test('actor depth stays bounded and increases toward the foreground', () => {
  assert.equal(depthScaleAt(-1000), 0.74);
  assert.equal(depthScaleAt(1000), 1.17);
  assert.ok(depthScaleAt(210) < depthScaleAt(430));
  assert.ok(depthScaleAt(430) < depthScaleAt(625));
});

test('camera follows smoothly without enlarging the painted arena', () => {
  const camera = new FollowCamera();
  const target = { x: 1190, y: 625 };
  camera.update(1 / 60, target);
  assert.ok(camera.x > 0 && camera.x < 50);
  for (let i = 0; i < 600; i++) camera.update(1 / 60, target);
  assert.ok(camera.x <= 50 && camera.y <= 24);
  const calls = [];
  camera.apply({ translate(...args) { calls.push(['translate', ...args]); }, scale() { calls.push(['scale']); } });
  assert.deepEqual(calls, [['translate', -camera.x, -camera.y]]);
});

test('camera convergence is independent of 60 or 120 Hz updates', () => {
  const a = new FollowCamera(), b = new FollowCamera();
  for (let i = 0; i < 60; i++) a.update(1 / 60, { x: 1100, y: 600 });
  for (let i = 0; i < 120; i++) b.update(1 / 120, { x: 1100, y: 600 });
  assert.ok(Math.abs(a.x - b.x) < 1e-9);
  assert.ok(Math.abs(a.y - b.y) < 1e-9);
  a.enabled = false; a.update(1 / 60, { x: 1100, y: 600 });
  assert.equal(a.x, 0); assert.equal(a.y, 0);
});
