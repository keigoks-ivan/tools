import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TRACKS } from './track.mjs';
import { CITY_THEMES, cityGroundLevel, addCityScenery } from './world-cities.js';

const context = new Proxy({
  font: '16px Arial',
  measureText(text) { return { width: text.length * (parseFloat(this.font.match(/[\d.]+px/)?.[0]) || 16) * .55 }; },
  createLinearGradient: () => ({ addColorStop() {} }),
  createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
}, { get: (target, key) => target[key] || (() => {}) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };

test('city terrain opens coast and river channels without lowering the driving corridor', () => {
  assert.equal(cityGroundLevel('london', 220, 0), -4);
  assert.equal(cityGroundLevel('kobe', 0, -500), -4);
  assert.equal(cityGroundLevel('sydney', -500, 0), -4);
  assert.equal(cityGroundLevel('goldcoast', -500, 0), -4);
  assert.equal(cityGroundLevel('goldcoast', -370, 0), 1.15);
  assert.equal(cityGroundLevel('melbourne', 0, -420), -4);
  for (const city of CITY_THEMES) assert.equal(cityGroundLevel(city, TRACKS[city].spawn.x, TRACKS[city].spawn.z), 4.65);
});

for (const city of CITY_THEMES) for (const mobile of [false, true]) {
  test(`${city} ${mobile ? 'mobile' : 'desktop'}: recognizable landmark geometry is finite and street structures clear the racing surface`, () => {
    const scene = new THREE.Scene(), track = TRACKS[city];
    const concrete = new THREE.MeshStandardMaterial(), shoulder = new THREE.MeshStandardMaterial(), rock = new THREE.MeshStandardMaterial();
    const built = addCityScenery({ scene, track, mobile, groundHeight: () => 4.65, materials: { concrete, shoulder, rock } });
    assert.ok(built.group.userData.landmarks.length >= 2);
    assert.ok(built.group.userData.buildings.length >= 65);
    assert.ok(built.group.children.length < 38, 'street detail is batched by material');
    let height = 0, vertices = 0, meshes = 0;
    scene.traverse(object => {
      if (!object.geometry) return;
      meshes++;
      for (const attribute of Object.values(object.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite), `${object.name}: finite vertex attributes`);
      const positions = object.geometry.attributes.position;
      assert.ok(object.geometry.index.array.every(index => index < positions.count), `${object.name}: valid triangle indices`);
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
        height = Math.max(height, y); vertices++;
        if (object.material.userData.cityRoadPaint) assert.ok(Math.abs(y - track.nearest(x, z).y) < .7, 'markings follow the local elevated road surface');
        else if (y > 7 && y < 30 && !object.material.userData.cityWater) assert.ok(track.nearest(x, z).distance > track.width / 2 + .5, `${object.name}: structure intrudes on road at ${x}, ${y}, ${z}`);
      }
    });
    assert.ok(vertices > 15000);
    assert.ok(meshes < 82, `complete city draw batches: ${meshes}`);
    const requiredHeight = { taipei: 510, kualalumpur: 455, kobe: 110, london: 135 }[city];
    if (requiredHeight) assert.ok(height >= requiredHeight && height < 520, `landmark height ${height}`);
    else assert.ok(height > (city === 'hanoi' ? 30 : 40) && height < 550, `bounded recognizable skyline: ${height}`);
    let disposed = 0;
    const resources = new Set([concrete, shoulder, rock]);
    scene.traverse(object => {
      if (!object.geometry) return;
      object.geometry.addEventListener('dispose', () => disposed++); resources.add(object.geometry); resources.add(object.material);
      for (const value of Object.values(object.material)) if (value?.isTexture) resources.add(value);
    });
    resources.forEach(resource => resource.dispose());
    assert.equal(disposed, meshes);
  });
}
