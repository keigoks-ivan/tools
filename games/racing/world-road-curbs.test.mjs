import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from './vendor/three.module.js';
import { TRACKS } from './track.mjs';
import { createSeasonWeather } from './weather.js';
import { getSeason } from './seasons.mjs';
register('./scripts/three-loader.mjs', import.meta.url);
const { createCityCurbGeometry, addRoadDetails } = await import('./world-road.js');
const { CITY_ROAD_PROFILES } = await import('./world-city-roadmarkings.js');
const { taipeiJunctionAt } = await import('./world-city-taipei-streets.js');

function point(attribute, index) { return new THREE.Vector3().fromBufferAttribute(attribute, index); }
const weights = [[1 / 3, 1 / 3, 1 / 3], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6]];

for (const id of Object.keys(CITY_ROAD_PROFILES)) for (const mobile of [false, true]) {
  test(`${id} ${mobile ? 'phone' : 'desktop'}: raised curb stays outside asphalt with metre UVs and a bounded bend mesh`, () => {
    const track = TRACKS[id], geometry = createCityCurbGeometry(track, { mobile });
    const position = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
    assert.ok(geometry.index.count / 3 <= (mobile ? 8000 : 16000));
    assert.equal(position.count, normal.count); assert.equal(position.count, uv.count);
    assert.ok(position.array.every(Number.isFinite) && normal.array.every(Number.isFinite) && uv.array.every(Number.isFinite));
    assert.ok(geometry.index.array.every(index => index >= 0 && index < position.count));
    assert.ok(geometry.userData.maxOutwardCorrection < .09, 'bend detail follows the real asphalt edge rather than moving the curb into a broad shoulder');
    let highest = 0, maxAlong = 0, maxAcross = 0, frontFaces = 0, topFaces = 0;
    for (let i = 0; i < position.count; i++) {
      const s = uv.getY(i), p = point(position, i), road = track.sample(s), near = track.nearest(p.x, p.z, s);
      assert.ok(Math.abs(near.offset) >= track.width / 2 + .012, 'curb vertex stays outside the asphalt boundary');
      assert.ok(Math.abs(near.offset) <= track.width / 2 + .45, 'curb width and tight bend correction remain compact');
      assert.ok(Math.abs(point(normal, i).length() - 1) < 1e-5);
      highest = Math.max(highest, p.y - road.y); maxAlong = Math.max(maxAlong, s); maxAcross = Math.max(maxAcross, uv.getX(i));
    }
    assert.ok(Math.abs(highest - .175) < 1e-5, 'the curb is 140mm above the 35mm asphalt surface');
    assert.ok(Math.abs(maxAlong - track.length) < .001, 'longitudinal UV is actual circuit metres, including the lap seam');
    assert.ok(maxAcross > .50 && maxAcross < .51, 'cross-profile UV follows the half-metre developed bevel profile');
    for (let k = 0; k < geometry.index.count; k += 3) {
      const ids = [0, 1, 2].map(j => geometry.index.getX(k + j)), points = ids.map(i => point(position, i));
      const face = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
      assert.ok(face.lengthSq() > 1e-12, 'each visible face has real area'); face.normalize();
      for (const weight of weights) {
        const p = new THREE.Vector3(), s = ids.reduce((sum, i, j) => sum + uv.getY(i) * weight[j], 0);
        points.forEach((point, j) => p.addScaledVector(point, weight[j]));
        const road = track.nearest(p.x, p.z, s);
        assert.ok(Math.abs(road.offset) >= track.width / 2 + .01, 'triangle interiors cannot chord across the asphalt on a bend');
      }
      const centre = points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3);
      const s = ids.reduce((sum, i) => sum + uv.getY(i), 0) / 3, road = track.nearest(centre.x, centre.z, s);
      if (ids.every(i => uv.getX(i) < .111)) {
        assert.ok((face.x * road.nx + face.z * road.nz) * Math.sign(road.offset) < -.97, 'the inner vertical face faces the road'); frontFaces++;
      }
      if (ids.every(i => Math.abs(position.getY(i) - track.sample(uv.getY(i)).y - .175) < 1e-5)) {
        assert.ok(face.y > .98, 'the curb top faces the sky rather than disappearing with FrontSide culling'); topFaces++;
      }
    }
    assert.ok(frontFaces > 0 && topFaces > 0);
    geometry.dispose();
  });
}

test('Taipei curb leaves actual side-road openings with capped, visible ends', () => {
  const track = TRACKS.taipei, geometry = createCityCurbGeometry(track), position = geometry.attributes.position, uv = geometry.attributes.uv;
  let caps = 0;
  for (let k = 0; k < geometry.index.count; k += 3) {
    const ids = [0, 1, 2].map(j => geometry.index.getX(k + j));
    const metres = ids.map(i => uv.getY(i));
    if (Math.max(...metres) - Math.min(...metres) < .001) { caps++; continue; }
    const centre = ids.reduce((value, i) => value.add(point(position, i)), new THREE.Vector3()).multiplyScalar(1 / 3);
    const s = metres.reduce((sum, value) => sum + value, 0) / 3, road = track.nearest(centre.x, centre.z, s);
    const junction = taipeiJunctionAt(track, s, 0);
    assert.ok(!junction || !(junction.cross || junction.side === Math.sign(road.offset)), 'an active curb face does not close a side-street opening');
  }
  assert.ok(caps >= 8); geometry.dispose();
});

test('one curb batch borrows the existing concrete maps and survives wet winter wrapping and world disposal', () => {
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {} }) }) };
  const maps = Array.from({ length: 3 }, () => new THREE.Texture());
  const concrete = new THREE.MeshStandardMaterial({ map: maps[0], normalMap: maps[1], roughnessMap: maps[2] });
  const scene = new THREE.Scene(); addRoadDetails({ scene, track: TRACKS.prague, materials: { concrete }, mobile: true });
  const curb = scene.getObjectByName('prague-bevelled-street-curbs');
  assert.equal(scene.children.length, 3);
  assert.ok(curb.isMesh && !curb.isInstancedMesh); assert.equal(curb.castShadow, false); assert.equal(curb.receiveShadow, true);
  for (const [index, key] of ['map', 'normalMap', 'roughnessMap'].entries()) assert.equal(curb.material[key], maps[index]);
  assert.equal(curb.material.side, THREE.FrontSide);
  const compile = curb.material.onBeforeCompile, cache = curb.material.customProgramCacheKey, dryColor = curb.material.color.clone();
  const weather = createSeasonWeather({ scene, season: getSeason('prague', 'winter'), resourcesOwnedByWorld: true });
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  curb.material.onBeforeCompile(shader);
  assert.ok(shader.uniforms.apexCurbUnit.value > .913 && shader.uniforms.apexCurbUnit.value < .915);
  assert.ok(shader.uniforms.seasonSnowAmount.value > 0);
  assert.match(shader.fragmentShader, /apexJointDistance/); assert.match(shader.fragmentShader, /snowCover/);
  assert.match(curb.material.customProgramCacheKey(), /apexCurb-metres-v1-season-ground-snow$/);
  const resources = new Set([concrete, ...maps]);
  scene.traverse(mesh => { if (mesh.geometry) resources.add(mesh.geometry); if (mesh.material) { resources.add(mesh.material); if (mesh.material.map) resources.add(mesh.material.map); } });
  const disposals = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
  weather.dispose(); weather.dispose();
  assert.equal(curb.material.onBeforeCompile, compile); assert.equal(curb.material.customProgramCacheKey, cache); assert.ok(curb.material.color.equals(dryColor));
  assert.ok([...disposals.values()].every(count => count === 0), 'weather restores borrowed maps and curb resources without destroying them');
  resources.forEach(resource => resource.dispose());
  assert.ok([...disposals.values()].every(count => count === 1), 'shared concrete maps are captured and disposed once');
});
