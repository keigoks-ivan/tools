import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createConvoy, createEvacGate } from '../lastline/convoy.js';

test('續作兩車與閘門共用資源、低於 5000 三角形、不新增燈光貼圖', () => {
  const scene = new THREE.Scene(), convoy = createConvoy(scene);
  createEvacGate(scene, 600, -405, 0);
  convoy.trucks[0].children.forEach((m, i) => {
    assert.equal(m.geometry, convoy.trucks[1].children[i].geometry);
    assert.equal(m.material, convoy.trucks[1].children[i].material);
  });
  let triangles = 0, meshes = 0;
  scene.traverse(o => {
    assert(!o.isLight);
    if (!o.isMesh) return;
    meshes++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
    for (const value of Object.values(o.material)) assert(!value?.isTexture);
  });
  assert(triangles < 5000); assert(meshes <= 18);
});
