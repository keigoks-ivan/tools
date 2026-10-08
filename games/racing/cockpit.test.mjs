import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCockpit } from './cockpit.js';
import { VEHICLES } from './vehicles.mjs';
import { TRACKS } from './track.mjs';

const contexts = [];
globalThis.document = { createElement() {
  const calls = [];
  const context = new Proxy({ calls, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), createLinearGradient: () => ({ addColorStop() {} }), fillText: text => calls.push(String(text)) }, { get: (target, key) => key in target ? target[key] : () => {} });
  contexts.push(context); return { width: 0, height: 0, getContext: () => context };
} };

for (const mobile of [false, true]) test(`cockpit ${mobile ? 'mobile' : 'desktop'}: stable foreground geometry, live instruments and owned resources`, () => {
  const built = createCockpit({ mobile });
  const geometry = new Set(), materials = new Set(), textures = new Set();
  let triangles = 0, meshes = 0, cabinMaterials = 0, minimumOcclusion = 1, maximumOcclusion = 0, lights = 0;
  built.group.traverse(node => {
    if (node.isLight) lights++;
    if (!node.isMesh) return;
    meshes++;
    geometry.add(node.geometry); materials.add(node.material);
    triangles += node.geometry.index ? node.geometry.index.count / 3 : node.geometry.attributes.position.count / 3;
    for (const p of node.geometry.attributes.position.array) assert.ok(Number.isFinite(p));
    for (const value of Object.values(node.material)) if (value?.isTexture) textures.add(value);
    if (node.material.userData.cabinOcclusion) {
      cabinMaterials++;
      const occlusion = node.geometry.getAttribute('cabinOcclusion');
      assert.equal(occlusion.count, node.geometry.attributes.position.count, 'baked shading covers every cabin vertex');
      for (const value of occlusion.array) { assert.ok(Number.isFinite(value) && value >= .249 && value <= .941); minimumOcclusion = Math.min(minimumOcclusion, value); maximumOcclusion = Math.max(maximumOcclusion, value); }
    }
  });
  assert.ok(triangles < 35000, `foreground triangle budget ${triangles}`);
  assert.ok(meshes < 50, `batched foreground draw budget ${meshes}`);
  assert.ok(cabinMaterials > 0 && maximumOcclusion - minimumOcclusion > .45, 'window light and recessed cabin have distinct exposure');
  assert.equal(lights, 0, 'cabin lighting requires no added dynamic lights');
  for (const mat of materials) {
    if (!mat.userData.cabinOcclusion) continue;
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    mat.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('attribute float cabinOcclusion;'));
    assert.ok(shader.fragmentShader.includes('reflectedLight.indirectDiffuse *= vCabinOcclusion;'));
    assert.equal(mat.isMeshPhysicalMaterial, undefined, 'cabin shading leaves exterior clearcoat separate');
  }
  assert.equal(built.group.visible, false);
  built.group.visible = true;
  const state = { speed: 27, rpm: 3600, gear: 3, steeringAngle: .12 };
  for (const vehicle of Object.values(VEHICLES)) { built.setPaint('#465051'); built.update(state, vehicle, TRACKS.taipei, .016); }
  const readouts = contexts.flatMap(c => c.calls);
  assert.ok(readouts.includes('97'), 'speed is presented in km/h');
  assert.ok(readouts.includes('3'), 'gear is presented');
  assert.ok(readouts.includes('Taipei Xinyi'), 'navigation names the active circuit');
  const versions = [...textures].map(t => t.version);
  built.update(state, Object.values(VEHICLES).at(-1), TRACKS.taipei, .016);
  assert.deepEqual([...textures].map(t => t.version), versions, 'unchanged instruments avoid texture uploads');
  built.update({ ...state, reverse: true }, Object.values(VEHICLES).at(-1), TRACKS.taipei, .016);
  assert.ok(contexts.some(c => c.calls.includes('R')), 'reverse has a distinct driver readout');
  assert.ok([...textures].some((t, i) => t.version > versions[i]), 'entering reverse refreshes the instruments');
  built.update(state, VEHICLES.bmwX3, TRACKS.newyork, .016);
  assert.ok(contexts.some(c => c.calls.includes('New York Manhattan')));
  let disposed = 0;
  for (const resource of [...geometry, ...materials, ...textures]) resource.addEventListener('dispose', () => disposed++);
  built.dispose(); built.dispose();
  assert.equal(disposed, geometry.size + materials.size + textures.size, 'all foreground resources dispose exactly once');
  assert.equal(new THREE.Box3().setFromObject(built.group).isEmpty(), false);
});
