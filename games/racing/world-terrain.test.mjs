import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { createTerrainHeightSampler } from './world-terrain.mjs';

for (const resolution of [1, 48, 64]) test(`rendered ${resolution}-cell terrain height agrees with physical triangle ray intersections`, () => {
  const terrain = new THREE.PlaneGeometry(1800, 1800, resolution, resolution);
  terrain.rotateX(-Math.PI / 2);
  const positions = terrain.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i, Math.sin(i * .71) * 3 + Math.cos(i * .19) * 2);
  terrain.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(terrain, material);
  const sample = createTerrainHeightSampler(terrain), ray = new THREE.Raycaster();
  for (let i = 0; i < 90; i++) {
    const x = Math.sin(i * 1.93 + .4) * 899.9, z = Math.cos(i * 1.31 + .7) * 899.9;
    ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0];
    assert.ok(hit, 'a rendered terrain triangle is present');
    assert.ok(Math.abs(sample(x, z) - hit.point.y) < 1e-7, 'overlay uses the actual triangle, including either side of its diagonal');
  }
  for (const corner of [0, resolution, resolution * (resolution + 1), positions.count - 1]) {
    assert.ok(Math.abs(sample(positions.getX(corner), positions.getZ(corner)) - positions.getY(corner)) < 1e-7);
  }
  assert.equal(sample(901, 0), null); assert.equal(sample(0, -901), null); assert.equal(sample(NaN, 0), null);
  terrain.dispose(); material.dispose();
});
