import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { TRACKS } from './track.mjs';
import { getSeasons, getSeason, defaultSeason } from './seasons.mjs';
import { createSeasonWeather } from './weather.js';

test('every track exposes immutable, bounded seasonal conditions with a valid default', () => {
  for (const track of Object.values(TRACKS)) {
    const options = getSeasons(track);
    assert.ok(Object.isFrozen(options));
    assert.ok(options.length >= 2 && options.length <= 4);
    assert.equal(new Set(options.map(value => value.id)).size, options.length);
    assert.ok(options.includes(defaultSeason(track)));
    assert.equal(getSeason(track, 'unknown'), defaultSeason(track));
    for (const value of options) {
      assert.ok(Object.isFrozen(value));
      assert.ok(value.label.length > 0 && value.description.length > 0);
      assert.ok(value.grip >= .64 && value.grip <= 1);
      assert.ok(value.wet >= 0 && value.wet <= 1 && value.snow >= 0 && value.snow <= 1);
      assert.ok(Number.isFinite(value.temperature) && value.temperature >= -10 && value.temperature <= 40);
      assert.ok(['cloudy', 'clear'].includes(value.sky));
      assert.match(value.foliage, /^#[a-f0-9]{6}$/i);
      assert.ok(Object.isFrozen(value.months));
    }
  }
  assert.deepEqual(getSeasons({ id: 'unknown' }), getSeasons(TRACKS.grandprix));
});

test('tropical and mild coastal circuits do not acquire a fictional snowy winter', () => {
  for (const id of ['kualalumpur', 'bangkok']) {
    assert.deepEqual(getSeasons(id).map(value => value.id), ['dry', 'wet']);
    assert.ok(getSeasons(id).every(value => value.snow === 0 && value.temperature >= 25));
    assert.ok(getSeason(id, 'wet').grip < getSeason(id, 'dry').grip);
  }
  for (const id of ['taipei', 'hanoi', 'kobe', 'london', 'newcastle', 'warwick', 'paris', 'nice', 'marseille', 'lisbon', 'sydney', 'goldcoast', 'melbourne', 'sanfrancisco', 'canyon']) {
    assert.equal(getSeason(id, 'winter').snow, 0, id);
    assert.equal(getSeasons(id).length, 4);
  }
  for (const id of ['alpine', 'prague', 'newyork', 'vancouver']) {
    assert.ok(getSeason(id, 'winter').snow > 0, id);
    assert.ok(getSeason(id, 'winter').temperature <= 0, id);
    assert.ok(getSeason(id, 'winter').grip < getSeason(id, 'summer').grip);
    assert.ok(getSeasons(id).filter(value => value.id !== 'winter').every(value => value.snow === 0));
  }
});

test('southern summer and winter have the correct opposite months', () => {
  for (const id of ['sydney', 'goldcoast', 'melbourne']) {
    assert.deepEqual(getSeason(id, 'summer').months, [12, 1, 2]);
    assert.deepEqual(getSeason(id, 'winter').months, [6, 7, 8]);
    assert.equal(getSeason(id, 'summer').hemisphere, 'south');
    assert.ok(getSeason(id, 'summer').temperature > getSeason(id, 'winter').temperature);
  }
  assert.deepEqual(getSeason('london', 'summer').months, [6, 7, 8]);
});

test('rain changes only borrowed seasonal surfaces and light, then restores them without disposing them', () => {
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#b3beb9', .00052);
  scene.backgroundIntensity = .86; scene.environmentIntensity = .72;
  const road = new THREE.MeshStandardMaterial({ color: '#909b9e', roughness: 1, envMapIntensity: .35 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#c0cead', roughness: .96 }); leaf.name = 'city-foliage';
  const traffic = new THREE.MeshStandardMaterial({ color: '#21a046' });
  const meshGeometry = new THREE.BoxGeometry();
  scene.add(new THREE.Mesh(meshGeometry, leaf), new THREE.Mesh(meshGeometry, traffic));
  const sun = new THREE.DirectionalLight('#fff5e6', 2.3), hemisphere = new THREE.HemisphereLight('#dceaf0', '#777d77', .48); scene.add(sun, hemisphere);
  const initial = { road: road.color.clone(), leaf: leaf.color.clone(), traffic: traffic.color.clone(), sun: sun.intensity, hemisphere: hemisphere.intensity, fog: scene.fog.color.clone() };
  let borrowedDisposals = 0;
  for (const mat of [road, leaf, traffic]) mat.addEventListener('dispose', () => borrowedDisposals++);
  const weather = createSeasonWeather({ scene, season: getSeason('kualalumpur', 'wet'), materials: { road }, sun, hemisphere, mobile: true });
  assert.ok(road.roughness < .4 && road.envMapIntensity > .9);
  assert.ok(road.color.r < initial.road.r);
  assert.ok(sun.intensity < initial.sun && hemisphere.intensity > initial.hemisphere);
  assert.ok(traffic.color.equals(initial.traffic), 'traffic lights are not foliage');
  weather.dispose(); weather.dispose();
  assert.equal(borrowedDisposals, 0);
  assert.ok(road.color.equals(initial.road) && leaf.color.equals(initial.leaf));
  assert.equal(road.roughness, 1); assert.equal(road.envMapIntensity, .35);
  assert.equal(sun.intensity, initial.sun); assert.equal(hemisphere.intensity, initial.hemisphere);
  assert.ok(scene.fog.color.equals(initial.fog)); assert.equal(scene.fog.density, .00052);
  assert.equal(scene.backgroundIntensity, .86); assert.equal(scene.environmentIntensity, .72);
  meshGeometry.dispose(); road.dispose(); leaf.dispose(); traffic.dispose();
});

test('winter reduces deciduous coverage with a shader restored on disposal', () => {
  const scene = new THREE.Scene(), map = new THREE.Texture(), mat = new THREE.MeshStandardMaterial({ map }); mat.name = 'city-foliage';
  const geometry = new THREE.PlaneGeometry(); scene.add(new THREE.Mesh(geometry, mat));
  const initialCompile = mat.onBeforeCompile, initialCache = mat.customProgramCacheKey;
  const weather = createSeasonWeather({ scene, season: getSeason('london', 'winter') });
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <uv_vertex>', fragmentShader: '#include <common>\n#include <alphatest_fragment>' };
  mat.onBeforeCompile(shader);
  assert.equal(shader.uniforms.seasonLeafCoverage.value, .44);
  assert.match(shader.vertexShader, /seasonLeafUv=uv/);
  assert.match(shader.fragmentShader, /seasonLeafCoverage\)discard/);
  weather.dispose();
  assert.equal(mat.onBeforeCompile, initialCompile); assert.equal(mat.customProgramCacheKey, initialCache);
  geometry.dispose(); mat.dispose(); map.dispose();
});

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} precipitation follows the actual camera, stays finite and fits one bounded draw`, () => {
    for (const [id, seasonId] of [['kualalumpur', 'wet'], ['alpine', 'winter'], ['costa', 'summer']]) {
      const scene = new THREE.Scene(), season = getSeason(id, seasonId), camera = new THREE.PerspectiveCamera();
      camera.position.set(100, 13, -200);
      const weather = createSeasonWeather({ scene, season, mobile, groundHeight: () => 5 });
      const points = scene.children.filter(value => value.isPoints);
      assert.ok(points.length <= 1);
      if (!points.length) { assert.equal(season.wet, 0); assert.equal(season.snow, 0); weather.dispose(); continue; }
      const cloud = points[0], resource = cloud.geometry, mat = cloud.material, capacity = resource.attributes.position.count;
      assert.ok(capacity <= (mobile ? 350 : 700));
      let disposedGeometry = 0, disposedMaterial = 0;
      resource.addEventListener('dispose', () => disposedGeometry++); mat.addEventListener('dispose', () => disposedMaterial++);
      weather.setQuality('high'); const highCount = resource.drawRange.count;
      weather.setQuality('low'); assert.ok(resource.drawRange.count < highCount);
      weather.setQuality('medium'); assert.ok(resource.drawRange.count <= capacity);
      for (let frame = 0; frame < 150; frame++) {
        camera.position.x += 2; camera.position.y += .025; camera.position.z += 1;
        weather.update({ x: -99, y: 5, z: -99 }, 1 / 60, camera);
      }
      assert.ok(cloud.position.equals(camera.position), 'particles follow the rendered view instead of the car position');
      const attribute = resource.attributes.position;
      assert.ok(attribute.array.every(Number.isFinite));
      for (let i = 0; i < resource.drawRange.count; i++) {
        assert.ok(Math.abs(attribute.getX(i)) <= 34 && Math.abs(attribute.getZ(i)) <= 44);
        assert.ok(attribute.getY(i) + cloud.position.y >= 5, 'particles recycle above the local road plane');
      }
      camera.position.set(NaN, NaN, NaN); weather.update({ x: NaN, y: NaN, z: NaN }, NaN, camera);
      assert.ok(attribute.array.every(Number.isFinite)); assert.ok(cloud.position.toArray().every(Number.isFinite));
      weather.dispose(); weather.dispose();
      assert.equal(disposedGeometry, 1); assert.equal(disposedMaterial, 1); assert.equal(scene.children.length, 0);
    }
  });
}

test('world-owned precipitation participates in world resource capture without duplicate disposal', () => {
  const scene = new THREE.Scene(), weather = createSeasonWeather({ scene, season: getSeason('alpine', 'winter'), resourcesOwnedByWorld: true });
  const points = scene.getObjectByName('Season precipitation'), geometry = points.geometry, material = points.material;
  const capturedGeometry = new Set(), capturedMaterial = new Set();
  scene.traverse(node => { if (node.geometry) capturedGeometry.add(node.geometry); if (node.material) capturedMaterial.add(node.material); });
  let geometryDisposals = 0, materialDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++); material.addEventListener('dispose', () => materialDisposals++);
  assert.equal(points.userData.resourceOwner, 'world');
  weather.dispose(); weather.dispose();
  assert.equal(geometryDisposals, 0); assert.equal(materialDisposals, 0);
  capturedGeometry.forEach(value => value.dispose()); capturedMaterial.forEach(value => value.dispose());
  assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
});
