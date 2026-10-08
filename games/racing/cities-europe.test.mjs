import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TRACKS } from './track.mjs';
import { addEuropeanLandmarks } from './world-city-europe.js';

const context = new Proxy({
  font: '16px Arial',
  measureText(value) { return { width: value.length * (parseFloat(this.font.match(/[\d.]+px/)?.[0]) || 16) * .55 }; },
  createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
}, { get: (target, key) => target[key] || (() => {}) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };

function create(city, mobile = true) {
  const scene = new THREE.Scene(), track = TRACKS[city];
  const concrete = new THREE.MeshStandardMaterial(), shoulder = new THREE.MeshStandardMaterial();
  const built = addEuropeanLandmarks({ scene, track, mobile, groundHeight: (x, z) => track.nearest(x, z).y - .65, materials: { concrete, shoulder } });
  return { built, scene, track, concrete, shoulder };
}
function cleanup({ built, concrete, shoulder }) {
  const resources = new Set([concrete, shoulder]);
  built.group.traverse(object => {
    if (!object.isMesh) return;
    resources.add(object.geometry); resources.add(object.material);
    for (const value of Object.values(object.material)) if (value?.isTexture) resources.add(value);
  });
  resources.forEach(resource => resource.dispose());
}

for (const city of ['paris', 'prague', 'newcastle', 'lisbon', 'marseille', 'nice', 'warwick']) for (const mobile of [true, false]) {
  test(`${city} / ${mobile ? 'mobile' : 'desktop'}: bounded architecture has finite geometry and clears the racing road`, () => {
    const created = create(city, mobile), { built, track } = created;
    assert.ok(built.group.children.length <= 30, 'detailed architecture stays in material batches');
    assert.ok(built.reserved.length >= 8, 'monuments and city-specific streets protect their footprints');
    let triangles = 0, minClearance = Infinity;
    built.group.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry, positions = geometry.attributes.position;
      for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
      assert.ok(geometry.index.array.every(index => index < positions.count));
      triangles += geometry.index.count / 3;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        if (y > 7 && y < 30) minClearance = Math.min(minClearance, track.nearest(x, z).distance);
      }
    });
    assert.ok(triangles > 15000 && triangles < (mobile ? 85000 : 120000), `bounded triangle count: ${triangles}`);
    assert.ok(minClearance > track.wallOffset + 2, `architecture clearance ${minClearance}`);
    built.setQuality('low'); assert.ok(built.shadowMeshes.every(mesh => !mesh.castShadow));
    cleanup(created);
  });
}

test('Paris tower retains the official 330 m height above its base', () => {
  const created = create('paris'), { track, built } = created;
  const base = track.nearest(-155, 155).y - .65;
  const bounds = new THREE.Box3().setFromObject(built.group);
  assert.ok(Math.abs(bounds.max.y - base - 330) < .01);
  cleanup(created);
});

test('Arc de Triomphe, Charles Bridge and Castle Bridge contain actual open archways', () => {
  for (const [city, x, z, yaw, y, front, distance] of [
    ['paris', 116, -95, -.18, 13, -18, 36],
    ['prague', -516 / 32, -493, 0, 9, -16, 32],
    ['warwick', 150, -454, 0, 6, -16, 32],
  ]) {
    const created = create(city), { built, track } = created;
    built.group.updateMatrixWorld();
    const base = city === 'paris' ? track.nearest(x, z).y - .65 : 0;
    const frame = new THREE.Matrix4().compose(new THREE.Vector3(x, base, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    const origin = new THREE.Vector3(0, y, front).applyMatrix4(frame);
    const direction = new THREE.Vector3(0, 0, 1).transformDirection(frame);
    const ray = new THREE.Raycaster(origin, direction, 0, distance);
    assert.equal(ray.intersectObject(built.group, true).length, 0, `${city}: archway is empty geometry`);
    cleanup(created);
  }
});
