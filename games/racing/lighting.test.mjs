import test from 'node:test';
import assert from 'node:assert/strict';
import { shadowFrame } from './lighting.mjs';

test('shadow window snaps in the light plane and retains the HDR sunlight direction', () => {
  for (const direction of [{ x: -26, y: 125, z: 22 }, { x: -93, y: 41, z: 81 }, { x: -82, y: 95, z: 58 }]) {
    const position = { x: 230.1, y: 24.8, z: -812.3, heading: 1.2 }, frame = shadowFrame(position, direction);
    const dot = a => frame.target.x * a.x + frame.target.y * a.y + frame.target.z * a.z;
    for (const basis of [frame.right, frame.up]) assert.ok(Math.abs(dot(basis) / frame.texel - Math.round(dot(basis) / frame.texel)) < 1e-8);
    const length = Math.hypot(direction.x, direction.y, direction.z);
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs((frame.light[axis] - frame.target[axis]) / 1200 - direction[axis] / length) < 1e-10);
    assert.ok(frame.light.y > position.y + 350, 'light depth covers tall city towers');
  }
});

test('sub-texel light-plane motion does not swim the shadow projection', () => {
  const direction = { x: -26, y: 125, z: 22 }, origin = { x: 0, y: 0, z: 0, heading: 0 };
  const a = shadowFrame(origin, direction, { lookAhead: 0 });
  const b = shadowFrame({ ...origin, x: a.right.x * a.texel * .2, z: a.right.z * a.texel * .2 }, direction, { lookAhead: 0 });
  assert.ok(Math.hypot(a.target.x - b.target.x, a.target.y - b.target.y, a.target.z - b.target.z) < 1e-9);
});
