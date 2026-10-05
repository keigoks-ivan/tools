// Run: node --experimental-default-type=module --test games/flight/dev/buildings.test.mjs
// Uses the shipped Three.js geometry code, not a DOM or WebGL mock. The OSM bake
// retains 5,643 features, 136 mapped parts and 46 courtyards in less than 2 MB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from '../../../game/lib/three.module.js';
import { AIRPORT } from '../airport.mjs';
import { createCityBuildings, projectBuildingPoint } from '../buildings.js';

const dataPath = new URL('../data/lszh/buildings.json', import.meta.url);
const dataset = JSON.parse(await readFile(dataPath, 'utf8'));
const area = ring => Math.abs(ring.reduce((sum, point, i) => { const next = ring[(i + 1) % ring.length]; return sum + point.x * next.z - next.x * point.z; }, 0) / 2);
const fakeData = features => ({ schemaVersion: 1, source: dataset.source, features });
const center = AIRPORT.runway.center;
const outer = [[center.lon, center.lat], [center.lon + .0004, center.lat], [center.lon + .0004, center.lat + .0004], [center.lon, center.lat + .0004]];
const hole = [[center.lon + .0001, center.lat + .0001], [center.lon + .0003, center.lat + .0001], [center.lon + .0003, center.lat + .0003], [center.lon + .0001, center.lat + .0003]];

test('projection agrees with geoscenery Web Mercator and runway bearing', () => {
  const zero = projectBuildingPoint(AIRPORT, [center.lon, center.lat]);
  assert.ok(Math.abs(zero.x) < 1e-7 && Math.abs(zero.z) < 1e-7);
  const point = [8.5438, 47.3702], actual = projectBuildingPoint(AIRPORT, point);
  const r = 6378137, rad = Math.PI / 180, c = Math.cos(AIRPORT.runway.bearing * rad), s = Math.sin(AIRPORT.runway.bearing * rad), scale = Math.cos(center.lat * rad);
  const east = (r * point[0] * rad - r * center.lon * rad) * scale;
  const north = (r * Math.log(Math.tan(Math.PI / 4 + point[1] * rad / 2)) - r * Math.log(Math.tan(Math.PI / 4 + center.lat * rad / 2))) * scale;
  assert.ok(Math.abs(actual.x - (c * east - s * north)) < 1e-7);
  assert.ok(Math.abs(actual.z - (-s * east - c * north)) < 1e-7);
  assert.ok(Math.hypot(actual.x - 8000, actual.z + 8060) < 60, 'Grossmünster aligns with the existing city-tour landmark');
});

test('baked OSM data is bounded, attributed, and preserves real courtyards and 3D tower parts', async () => {
  assert.ok((await stat(dataPath)).size < 2_000_000);
  assert.equal(dataset.source.license, 'ODbL-1.0');
  assert.equal(dataset.source.attribution, '© OpenStreetMap contributors');
  assert.equal(new Set(dataset.features.map(feature => feature.id)).size, dataset.features.length);
  assert.equal(dataset.features.length, dataset.statistics.features);
  assert.equal(dataset.features.filter(feature => feature.part).length, 136);
  assert.equal(dataset.features.reduce((sum, feature) => sum + feature.rings.length - 1, 0), 46);
  for (const feature of dataset.features) {
    assert.ok(feature.height > (feature.minHeight || 0));
    if (feature.heightSource === 'inferred') assert.ok(Math.abs(feature.height - (feature.minHeight || 0) - 8) < 0.01);
    assert.ok(feature.rings.every(ring => ring.length >= 3 && ring.every(point => point.every(Number.isFinite))));
  }
  assert.equal(dataset.features.filter(feature => feature.name === 'Grossmünster' && feature.roofShape === 'dome' && feature.height === 62).length, 2);
  assert.ok(!dataset.features.some(feature => feature.id === 'way/36916418'), 'tall whole-church outline is replaced by mapped tower/body parts');
});

test('merged roof triangulation preserves a courtyard hole and upward-facing roofs', async () => {
  const scene = new THREE.Scene(), handle = createCityBuildings(THREE, scene, { airport: AIRPORT, groundHeight: () => 0, data: fakeData([{ id: 'courtyard', rings: [outer, hole], height: 10 }]) });
  try {
    assert.equal((await handle.ready).phase, 'ready');
    const roof = handle.group.children[0].children[1], positions = roof.geometry.attributes.position.array;
    let roofArea = 0;
    for (let i = 0; i < positions.length; i += 9) roofArea += Math.abs((positions[i + 3] - positions[i]) * (positions[i + 8] - positions[i + 2]) - (positions[i + 6] - positions[i]) * (positions[i + 5] - positions[i + 2])) / 2;
    const expected = area(outer.map(point => projectBuildingPoint(AIRPORT, point))) - area(hole.map(point => projectBuildingPoint(AIRPORT, point)));
    assert.ok(Math.abs(roofArea - expected) / expected < 1e-5);
    const normals = roof.geometry.attributes.normal.array;
    for (let i = 1; i < normals.length; i += 3) assert.ok(normals[i] > 0.999);
  } finally { handle.dispose(); }
});

test('mapped pyramid roof height creates a steeple rather than a tall solid footprint', async () => {
  const scene = new THREE.Scene(), handle = createCityBuildings(THREE, scene, { airport: AIRPORT, groundHeight: () => 5, data: fakeData([{ id: 'steeple', rings: [outer], height: 80, roofShape: 'pyramidal', roofHeight: 40 }]) });
  try {
    await handle.ready;
    const [walls, roof] = handle.group.children[0].children;
    const heights = geometry => Array.from(geometry.attributes.position.array).filter((_, i) => i % 3 === 1);
    assert.equal(Math.max(...heights(walls.geometry)), 45);
    assert.equal(Math.max(...heights(roof.geometry)), 85);
    assert.equal(Math.min(...heights(roof.geometry)), 45);
  } finally { handle.dispose(); }
});

test('late tour DEM elevation moves buildings, low quality hides them, and disposal is complete', async () => {
  const scene = new THREE.Scene(); let height = 0;
  const handle = createCityBuildings(THREE, scene, { airport: AIRPORT, groundHeight: () => height, data: fakeData([{ id: 'terrain-change', rings: [outer], height: 8 }]) });
  await handle.ready;
  const state = { position: { x: 0, y: 100, z: 0 } };
  handle.update(state); const roof = handle.group.children[0].children[1], before = roof.geometry.attributes.position.array[1];
  height = 40;
  await new Promise(resolve => setTimeout(resolve, 1450));
  handle.update(state);
  assert.equal(roof.geometry.attributes.position.array[1] - before, 40);
  assert.ok(handle.status().visibleChunks > 0);
  handle.setQuality('low'); assert.equal(handle.status().visibleChunks, 0);
  handle.setQuality('high'); assert.ok(handle.status().visibleChunks > 0);
  let disposedGeometry = 0, disposedMaterial = 0;
  for (const mesh of handle.group.children[0].children) mesh.geometry.addEventListener('dispose', () => disposedGeometry++);
  for (const material of new Set(handle.group.children[0].children.map(mesh => mesh.material))) material.addEventListener('dispose', () => disposedMaterial++);
  handle.dispose(); handle.dispose();
  assert.equal(disposedGeometry, 2); assert.equal(disposedMaterial, 2); assert.equal(scene.children.length, 0);
});

test('a finer DEM resamples grounded corners even when the centre stays fixed; elevated parts keep min_height', async t => {
  let now = 2000, finer = false;
  t.mock.method(performance, 'now', () => now);
  const points = outer.map(point => projectBuildingPoint(AIRPORT, point));
  const anchor = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, z: points.reduce((sum, point) => sum + point.z, 0) / points.length };
  const groundHeight = (x, z) => 20 + (finer ? (x - anchor.x) * 0.1 + (z - anchor.z) * 0.03 : 0);
  const handle = createCityBuildings(THREE, new THREE.Scene(), { airport: AIRPORT, groundHeight, data: fakeData([
    { id: 'grounded', rings: [outer], height: 12 }, { id: 'elevated', rings: [outer], height: 12, minHeight: 4 },
  ]) });
  try {
    await handle.ready; handle.update({ position: { ...anchor, y: 100 } });
    const chunk = handle.group.children[0], [walls, roofs] = chunk.children;
    const beforeRoof = Array.from(roofs.geometry.attributes.position.array);
    finer = true; now += 1500; handle.update({ position: { ...anchor, y: 100 } });
    assert.deepEqual(Array.from(roofs.geometry.attributes.position.array), beforeRoof, 'roof height stays fixed when its terrain anchor does not move');
    const vertices = walls.geometry.attributes.position.array, count = vertices.length / 2;
    for (let i = 0; i < count; i += 18) {
      const expected = groundHeight(chunk.position.x + vertices[i], chunk.position.z + vertices[i + 2]) - 0.5;
      assert.ok(Math.abs(vertices[i + 1] - expected) < 1e-4, 'each grounded corner follows the new local terrain');
    }
    for (let i = count; i < vertices.length; i += 18) assert.equal(vertices[i + 1], 24, 'mapped min_height stays above the anchor, not the corner terrain');
  } finally { handle.dispose(); }
});

test('all real buildings merge into modest draw calls with finite geometry', async () => {
  const scene = new THREE.Scene(), begin = performance.now();
  const handle = createCityBuildings(THREE, scene, { airport: AIRPORT, groundHeight: () => 0, data: dataset });
  try {
    const result = await handle.ready;
    assert.equal(result.phase, 'ready'); assert.equal(result.buildings, 5643);
    assert.ok(result.chunks * 2 <= 80, `${result.chunks * 2} mesh draw calls`);
    assert.ok(result.triangles < 350_000);
    for (const chunk of handle.group.children) for (const mesh of chunk.children) {
      assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
      assert.ok(Array.from(mesh.geometry.attributes.normal.array).every(Number.isFinite));
    }
    console.log(JSON.stringify({ buildingGeometry: { buildings: result.buildings, chunks: result.chunks, drawCalls: result.chunks * 2, triangles: result.triangles, buildMilliseconds: Math.round(performance.now() - begin) } }));
  } finally { handle.dispose(); }
});

test('bad dataset fails without interrupting the flight scene', async () => {
  const scene = new THREE.Scene(), handle = createCityBuildings(THREE, scene, { airport: AIRPORT, data: {} });
  const result = await handle.ready;
  assert.equal(result.phase, 'unavailable'); assert.ok(result.error);
  handle.dispose(); assert.equal(scene.children.length, 0);
});
