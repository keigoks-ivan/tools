import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { createTyreMarks } from './tyre-marks.js';

test('rear rubber tracks follow road grade, remain bounded and never bridge resets or normal grip', () => {
  const scene = new THREE.Scene(), track = { nearest: (x, z) => ({ y: z * .08 }) };
  const marks = createTyreMarks({ scene, track, mobile: true });
  const state = { x: 0, z: 0, heading: 0, speed: 16, slip: .8, elapsed: 0 };
  for (let i = 0; i < 1200; i++) { state.z = i * .7; state.elapsed = i / 30; marks.update(state, { rearAxle: 1.2 }); }
  const mesh = marks.group, geometry = mesh.geometry, count = geometry.drawRange.count;
  assert.equal(scene.children.length, 1); assert.ok(count <= 384 * 6);
  assert.ok(geometry.attributes.position.array.every(Number.isFinite));
  const p = geometry.attributes.position.array;
  for (let i = 0; i < count * 3; i += 3) assert.ok(Math.abs(p[i + 1] - p[i + 2] * .08 - .043) < .00002, 'rubber follows the slope above the asphalt surface');
  state.slip = .1; marks.update(state); state.z += 40; state.slip = .9; marks.update(state);
  assert.equal(geometry.drawRange.count, count, 'fresh slide begins without a long connecting strip');
  state.elapsed = 0; marks.update(state); assert.equal(geometry.drawRange.count, 0, 'reset clears old rubber');
  let disposed = 0; geometry.addEventListener('dispose', () => disposed++); mesh.material.addEventListener('dispose', () => disposed++);
  marks.dispose(); marks.dispose(); assert.equal(disposed, 2); assert.equal(scene.children.length, 0);
});
