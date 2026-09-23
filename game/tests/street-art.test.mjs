import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { mapStorefrontPanel } from '../street-art.js';

test('eight storefront panels occupy separate inset cells without flipping or adding vertices', () => {
  const centers = new Set();
  for (let panel = 0; panel < 8; panel++) {
    const geometry = new THREE.PlaneGeometry(10, 3.1);
    const positions = Array.from(geometry.attributes.position.array);
    const uv = geometry.attributes.uv;
    mapStorefrontPanel(geometry, panel, 1254, 1254);
    const xs = Array.from({length: uv.count}, (_, i) => uv.getX(i));
    const ys = Array.from({length: uv.count}, (_, i) => uv.getY(i));
    const col = panel % 2, row = Math.floor(panel / 2);
    assert.ok(Math.min(...xs) > col / 2 && Math.max(...xs) < (col + 1) / 2);
    assert.ok(Math.min(...ys) > 1 - (row + 1) / 4 && Math.max(...ys) < 1 - row / 4);
    assert.ok(uv.getX(0) < uv.getX(1), 'left-to-right image orientation');
    assert.ok(uv.getY(0) > uv.getY(2), 'top-to-bottom image orientation');
    assert.deepEqual(Array.from(geometry.attributes.position.array), positions);
    centers.add(`${(Math.min(...xs)+Math.max(...xs)).toFixed(3)},${(Math.min(...ys)+Math.max(...ys)).toFixed(3)}`);
    geometry.dispose();
  }
  assert.equal(centers.size, 8);
});

test('additional storefronts wrap to the shared eight panels', () => {
  const first = mapStorefrontPanel(new THREE.PlaneGeometry(), 0, 1254, 1254);
  const repeated = mapStorefrontPanel(new THREE.PlaneGeometry(), 24, 1254, 1254);
  assert.deepEqual(first.attributes.uv.array, repeated.attributes.uv.array);
});
