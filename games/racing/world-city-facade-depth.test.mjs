import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CITY_FACADE_DEPTH_PROFILES, createFacadeDepth, cutFacadeFront, configureFacadeUpperMaterial } from './world-city-facade-depth.js';

test('street windows have real openings and glazing behind the masonry face', () => {
  for (const city of ['taipei', 'london', 'newcastle', 'paris']) {
    const detail = createFacadeDepth({ city, index: 2, width: 22, height: 21, depth: 20 });
    const body = cutFacadeFront(new THREE.BoxGeometry(22, 21, 20), 22, 21, 20, detail.bottom, detail.top);
    body.translate(0, 21 / 2, 0);
    const material = new THREE.MeshStandardMaterial({ metalness: 0, side: THREE.FrontSide }), group = new THREE.Group();
    group.add(new THREE.Mesh(body, material));
    for (const [role, geometry] of Object.entries(detail.geometries)) { const mesh = new THREE.Mesh(geometry, material); mesh.name = role; group.add(mesh); }
    group.updateMatrixWorld(true);
    const window = detail.windows[1], sampleX = window.x0 + (window.x1 - window.x0) * .25, sampleY = window.y0 + (window.y1 - window.y0) * .26;
    const ray = new THREE.Raycaster(new THREE.Vector3(sampleX, sampleY, -18), new THREE.Vector3(0, 0, 1));
    const hit = ray.intersectObject(group, true)[0];
    assert.equal(hit.object.name, 'glass', `${city}: no opaque Box face remains over a window`);
    assert.ok(Math.abs(hit.point.z - window.back) < 1e-5);
    assert.ok(hit.point.z - window.front >= .19, `${city}: physical jamb depth is retained`);
    ray.set(new THREE.Vector3(window.x0 - .20, sampleY, -18), new THREE.Vector3(0, 0, 1));
    assert.equal(ray.intersectObject(group, true)[0].object.name, 'wall', `${city}: solid masonry surrounds the hole`);
    for (const geo of [body, ...Object.values(detail.geometries)]) geo.dispose(); material.dispose();
  }
});

test('openings use city proportions and the phone preserves complete floors', () => {
  assert.equal(Object.keys(CITY_FACADE_DEPTH_PROFILES).length, 19);
  for (const [city, profile] of Object.entries(CITY_FACADE_DEPTH_PROFILES)) {
    const desktop = createFacadeDepth({ city, index: 1, width: 20, height: 22, depth: 21 });
    const mobile = createFacadeDepth({ city, index: 1, width: 20, height: 22, depth: 21, mobile: true });
    assert.ok(desktop.physicalFloors > mobile.physicalFloors);
    assert.equal(mobile.physicalFloors, 2);
    assert.ok(Math.abs(desktop.floorHeight - profile.floor) < .4, `${city}: actual floor height has architectural scale`);
    assert.ok(Math.abs(20 / desktop.columns - profile.bay) < .5, `${city}: window bays do not stretch across a whole building`);
    assert.ok(Math.abs(mobile.top / mobile.floorHeight - 2) < 1e-9);
    for (const detail of [desktop, mobile]) for (const geometry of Object.values(detail.geometries)) {
      for (const attr of Object.values(geometry.attributes)) assert.ok(attr.array.every(Number.isFinite));
      assert.ok(geometry.index.array.every(index => index < geometry.attributes.position.count)); geometry.dispose();
    }
  }
});

test('partial phone skin leaves the original upper and lower faces without filling the recess', () => {
  const geo = cutFacadeFront(new THREE.BoxGeometry(18, 20, 19), 18, 20, 19, 3.9, 10.9);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()); mesh.position.y = 10; mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 8, -20), new THREE.Vector3(0, 0, 1));
  assert.equal(ray.intersectObject(mesh).length, 0, 'the physical-window band is actually cut away');
  for (const y of [2, 14]) { ray.set(new THREE.Vector3(0, y, -20), new THREE.Vector3(0, 0, 1)); assert.ok(ray.intersectObject(mesh).length > 0); }
  geo.dispose(); mesh.material.dispose();
});

test('physical panes vary in brightness and partial blinds without extra material roles', () => {
  const detail = createFacadeDepth({ city: 'newcastle', index: 5, width: 28, height: 22, depth: 20 });
  const colors = detail.geometries.glass.attributes.color;
  const tones = new Set();
  for (let i = 0; i < colors.count; i += 4) tones.add([colors.getX(i), colors.getY(i), colors.getZ(i)].map(value => value.toFixed(3)).join(','));
  assert.ok(tones.size >= 5, 'the whole street facade does not have identical blue panes');
  assert.ok(detail.geometries.blinds.index.count > 0);
  assert.ok(detail.geometries.blinds.index.count < detail.geometries.glass.index.count, 'most window glazing remains uncovered');
  const p = detail.geometries.blinds.attributes.position;
  const heights = new Set(); for (let i = 0; i < p.count; i += 4) heights.add((p.getY(i + 1) - p.getY(i)).toFixed(2));
  assert.ok(heights.size >= 3, 'blinds have different lowered heights');
  Object.values(detail.geometries).forEach(geometry => geometry.dispose());
});

test('six wall palettes select their painted canvas tile without crossing neighbours', () => {
  for (let index = 0; index < 6; index++) {
    const detail = createFacadeDepth({ city: 'taipei', index, width: 20, height: 14, depth: 18 });
    const uv = detail.geometries.wall.attributes.uv, col = index % 3, row = 1 - Math.floor(index / 3);
    for (let i = 0; i < uv.count; i++) {
      assert.ok(uv.getX(i) > col / 3 && uv.getX(i) < (col + 1) / 3, 'masonry UV stays inside one material variant');
      assert.ok(uv.getY(i) > row / 2 && uv.getY(i) < (row + 1) / 2, 'CanvasTexture flipY keeps the intended coloured wall');
    }
    Object.values(detail.geometries).forEach(geometry => geometry.dispose());
  }
});

test('cheap phone upper windows continue the physical bay grid and cover the entire upper wall', () => {
  for (const city of ['taipei', 'paris', 'london', 'newcastle']) {
    const detail = createFacadeDepth({ city, index: 2, width: 24, height: 22, depth: 20, mobile: true });
    const upper = detail.geometries.upper, p = upper.attributes.position, uv = upper.attributes.uv;
    assert.equal(upper.index.count, 6, 'one upper face remains two triangles regardless of window count');
    assert.ok(Math.abs(p.getY(0) - detail.top) < 1e-5 && Math.abs(p.getY(1) - 22) < 1e-5);
    assert.equal(uv.getY(0), detail.physicalFloors); assert.equal(uv.getY(1), detail.floors);
    assert.equal(uv.getX(2), detail.columns, 'the upper pane has the same number of bays as the lower windows');
    const size = upper.attributes.cityWindowSize, lower = detail.windows[0];
    assert.ok(Math.abs(size.getX(0) - (lower.x1 - lower.x0) / (24 / detail.columns)) < 1e-6);
    assert.ok(Math.abs(size.getY(0) - (lower.y1 - lower.y0) / detail.floorHeight) < 1e-6);
    Object.values(detail.geometries).forEach(geometry => geometry.dispose());
  }
});

test('upper shader retains standard lighting and separates dielectric wall and glass roughness', () => {
  const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), roughness: .94 });
  configureFacadeUpperMaterial(material, { city: 'paris', glassColor: new THREE.Color('#52676b'), frameColor: new THREE.Color('#eeeee0') });
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('vCityFacadeInfo = cityFacadeInfo'));
  assert.ok(shader.fragmentShader.includes('#include <lights_fragment_begin>'), 'the cheap phone surface uses normal Three lighting');
  assert.ok(shader.fragmentShader.includes('roughnessFactor = mix(roughnessFactor, .22, cityGlassMask)'));
  assert.ok(shader.fragmentShader.includes('fwidth(coordinate)'), 'window boundaries and sash lines are antialiased');
  assert.equal(material.metalness, 0);
  assert.equal(shader.uniforms.cityRoomSeed.value, 15);
  material.map.dispose(); material.dispose();
});
