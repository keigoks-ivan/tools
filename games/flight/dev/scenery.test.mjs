import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../../game/lib/three.module.js';
import { AIRPORT } from '../airport.mjs';
import { createGeoScenery } from '../geoscenery.js';
import { installSceneryFixtures } from './scenery-fixture.mjs';

const golden = JSON.parse(readFileSync(new URL('./golden.scenery.json', import.meta.url), 'utf8'));
const restore = installSceneryFixtures();
test.after(restore);
const scene = new THREE.Scene(), scenery = createGeoScenery(THREE, scene, { airport: AIRPORT, quality: 'low' });
await scenery.ready;
function checkSampler(name) {
  for (const point of golden.samples) assert.equal(scenery.groundHeight(point.x, point.z), point[name], `${name} groundHeight(${point.x}, ${point.z})`);
}
test('actual DEM sampler is bit-identical to the pre-visual baseline', () => checkSampler('base'));

function checkBoundary(id) {
  const spec = JSON.parse(readFileSync(new URL('../data/lszh/tours.json', import.meta.url), 'utf8')).tours[id].dem;
  const patch = scene.getObjectByName(`tour patch ${id}`).geometry.attributes.position.array;
  const n = Math.round(spec.groundHalfM * 2 / spec.meshCellM), stride = n + 1;
  const key = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
  const boundary = new Map();
  for (let i = 0; i <= n; i++) for (const index of [i, n * stride + i, i * stride, i * stride + n]) {
    const offset = index * 3; boundary.set(key(patch[offset], patch[offset + 2]), patch[offset + 1]);
  }
  const matches = new Map();
  for (let ring = 0; ring < 4; ring++) {
    const geometry = scene.getObjectByName(`terrain ring ${ring}`).geometry, vertices = geometry.attributes.position.array;
    assert.ok(Array.from(vertices).every(Number.isFinite), 'clipped vertices stay finite');
    for (const index of new Set(geometry.index.array)) {
      const offset = index * 3, name = key(vertices[offset], vertices[offset + 2]);
      if (boundary.has(name)) matches.set(name, Math.max(matches.get(name) ?? -Infinity, vertices[offset + 1]));
    }
  }
  assert.equal(matches.size, boundary.size, 'all four edges retain the fine DEM sampling points');
  let maximumGap = 0;
  for (const [name, expected] of boundary) maximumGap = Math.max(maximumGap, Math.abs(matches.get(name) - expected));
  assert.ok(maximumGap < 0.001, `maximum seam gap ${maximumGap}m; pre-fix north edge was 23–26m`);
  console.log(JSON.stringify({ terrainJoin: { tour: id, samples: matches.size, maximumGapM: maximumGap } }));
}
test('city tour stitches every fine boundary sample without a sunk coarse surface', async () => {
  await scenery.setTour('city'); checkSampler('city'); checkBoundary('city');
});

test('Alps DEM and removal preserve the original sampler', async () => {
  await scenery.setTour('alps'); checkSampler('alps'); checkBoundary('alps');
  await scenery.setTour(null); checkSampler('base');
  scenery.dispose(); assert.equal(scene.children.length, 0);
});
