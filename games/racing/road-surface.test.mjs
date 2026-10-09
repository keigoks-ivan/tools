import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from './vendor/three.module.js';
import { installAsphaltWear, installCurbJoints } from './road-surface.mjs';
import { createSeasonWeather } from './weather.js';
import { getSeason } from './seasons.mjs';
import { TRACKS } from './track.mjs';
register('./scripts/three-loader.mjs', import.meta.url);
const { createWorldMaterials } = await import('./world-materials.js');

function compile(material) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader); return shader;
}

test('asphalt uses real road metres and the selected lane count while preserving scans and the previous shader', () => {
  const maps = Array.from({ length: 3 }, () => new THREE.Texture());
  const material = new THREE.MeshStandardMaterial({ map: maps[0], normalMap: maps[1], roughnessMap: maps[2], color: '#596062' });
  const before = material.color.clone(); let calls = 0;
  material.onBeforeCompile = shader => { calls++; shader.uniforms.existingDetail = { value: 17 }; };
  material.customProgramCacheKey = () => 'existing-surface';
  installAsphaltWear(material, { roadWidth: 18, lanesPerDirection: 3, trackLength: TRACKS.taipei.length, city: true });
  const shader = compile(material);
  assert.equal(calls, 1); assert.equal(shader.uniforms.existingDetail.value, 17);
  const [width, laneWidth, length, patches] = shader.uniforms.apexAsphaltScale.value;
  assert.equal(width, 18); assert.equal(laneWidth, 3); assert.equal(length, TRACKS.taipei.length);
  assert.ok(length / patches >= 31 && length / patches <= 33, 'repairs keep their physical spacing when circuit length changes');
  assert.equal(shader.uniforms.apexAsphaltCompaction.value, 1);
  assert.match(shader.vertexShader, /apexAsphaltMeters = uv/);
  assert.ok(shader.fragmentShader.indexOf('float apexRepairEdge') > shader.fragmentShader.indexOf('#include <map_fragment>'));
  assert.ok(shader.fragmentShader.indexOf('roughnessFactor = clamp') > shader.fragmentShader.indexOf('#include <roughnessmap_fragment>'));
  assert.equal((shader.fragmentShader.match(/uniform vec4 apexAsphaltScale/g) || []).length, 1);
  assert.equal(material.customProgramCacheKey(), 'existing-surface-apexAsphalt-metres-v1');
  assert.ok(material.color.equals(before));
  for (const [index, key] of ['map', 'normalMap', 'roughnessMap'].entries()) assert.equal(material[key], maps[index]);
  material.dispose(); maps.forEach(map => map.dispose());
});

test('undivided scenic roads retain racing-line wear and disable traffic-lane compaction', () => {
  for (const id of ['costa', 'alpine', 'canyon', 'grandprix']) {
    const track = TRACKS[id], material = new THREE.MeshStandardMaterial();
    installAsphaltWear(material, { roadWidth: track.width, trackLength: track.length });
    const shader = compile(material);
    assert.equal(shader.uniforms.apexAsphaltCompaction.value, 0, id);
    assert.equal(shader.uniforms.apexAsphaltScale.value[0], track.width);
    assert.equal(shader.uniforms.apexAsphaltScale.value[2], track.length);
    assert.equal(material.map, null); assert.equal(material.normalMap, null); assert.equal(material.roughnessMap, null);
    material.dispose();
  }
});

test('surface shader parameters remain finite for missing or invalid options', () => {
  for (const options of [{}, { roadWidth: Infinity, lanesPerDirection: NaN, trackLength: NaN }, { roadWidth: -1, lanesPerDirection: 500, trackLength: -10 }]) {
    const material = new THREE.MeshStandardMaterial(); installAsphaltWear(material, options);
    const shader = compile(material), scale = shader.uniforms.apexAsphaltScale.value;
    assert.ok(scale.every(Number.isFinite)); assert.ok(scale[0] >= 6 && scale[0] <= 50); assert.ok(scale[1] > 0 && scale[2] >= 100);
    material.dispose();
  }
});

test('curb mortar joints use physical units with a continuous lap seam and distance filtering', () => {
  for (const track of Object.values(TRACKS)) {
    const material = new THREE.MeshStandardMaterial(); installCurbJoints(material, track.length);
    const shader = compile(material), unit = shader.uniforms.apexCurbUnit.value, units = track.length / unit;
    assert.ok(unit > .913 && unit < .915); assert.ok(Math.abs(units - Math.round(units)) < 1e-8);
    assert.match(shader.fragmentShader, /fwidth\(apexCurbMeters.y\)/);
    assert.equal(material.map, null); assert.equal(material.normalMap, null);
    material.dispose();
  }
});

test('wet asphalt retains its wear shader and restores dry reflectance without disposing shared maps', () => {
  const scene = new THREE.Scene(), map = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map, roughness: 1, envMapIntensity: .35 });
  installAsphaltWear(material, { roadWidth: 12.8, lanesPerDirection: 2, trackLength: TRACKS.bangkok.length, city: true });
  const initial = { color: material.color.clone(), compile: material.onBeforeCompile, cache: material.customProgramCacheKey }; let disposed = 0;
  map.addEventListener('dispose', () => disposed++); material.addEventListener('dispose', () => disposed++);
  const weather = createSeasonWeather({ scene, season: getSeason('bangkok', 'wet'), materials: { road: material }, resourcesOwnedByWorld: true });
  assert.ok(material.roughness < 1 && material.roughness >= .5); assert.ok(material.envMapIntensity > .35);
  assert.equal(material.onBeforeCompile, initial.compile); assert.equal(material.customProgramCacheKey, initial.cache);
  const shader = compile(material); assert.equal(shader.uniforms.apexAsphaltCompaction.value, 1); assert.equal(shader.uniforms.seasonSnowAmount, undefined);
  weather.dispose(); weather.dispose();
  assert.equal(disposed, 0); assert.ok(material.color.equals(initial.color)); assert.equal(material.roughness, 1); assert.equal(material.envMapIntensity, .35);
  material.dispose(); map.dispose();
});

test('city wetness keeps coarse aggregate while the scenic response and both dry states remain intact', () => {
  const scene = new THREE.Scene(), map = new THREE.Texture(), season = getSeason('bangkok', 'wet');
  const city = new THREE.MeshStandardMaterial({ map, roughness: .92, envMapIntensity: .4, color: '#62676a' });
  const scenic = city.clone();
  installAsphaltWear(city, { city: true }); installAsphaltWear(scenic, { city: false });
  const initialCity = { color: city.color.clone(), compile: city.onBeforeCompile, cache: city.customProgramCacheKey };
  const initialScenic = { color: scenic.color.clone(), compile: scenic.onBeforeCompile, cache: scenic.customProgramCacheKey };
  const cityWeather = createSeasonWeather({ scene, season, materials: { road: city }, resourcesOwnedByWorld: true });
  const scenicWeather = createSeasonWeather({ scene, season, materials: { road: scenic }, resourcesOwnedByWorld: true });
  assert.ok(city.roughness < .92 && city.roughness > scenic.roughness, 'wet city aggregate remains damp without becoming a street-wide mirror');
  assert.ok(city.envMapIntensity > .4 && city.envMapIntensity < scenic.envMapIntensity);
  assert.ok(city.color.r < initialCity.color.r && scenic.color.r < initialScenic.color.r);
  assert.equal(scenic.roughness, Math.max(.19, .92 * (1 - season.wet * .76)), 'the four original scenic roads keep their original wetness response');
  assert.equal(scenic.envMapIntensity, .4 + season.wet * .9);
  cityWeather.dispose(); scenicWeather.dispose();
  for (const [material, initial] of [[city, initialCity], [scenic, initialScenic]]) {
    assert.equal(material.roughness, .92); assert.equal(material.envMapIntensity, .4); assert.ok(material.color.equals(initial.color));
    assert.equal(material.onBeforeCompile, initial.compile); assert.equal(material.customProgramCacheKey, initial.cache); assert.equal(material.map, map);
    material.dispose();
  }
  map.dispose();
});

test('the world material factory loads only its existing five selected surfaces and disposes them once', async () => {
  const original = THREE.TextureLoader.prototype.load, requests = [];
  THREE.TextureLoader.prototype.load = function(url, onLoad) {
    const texture = new THREE.Texture({ width: 1024, height: 1024 }); requests.push(url);
    queueMicrotask(() => onLoad(texture)); return texture;
  };
  try {
    for (const [theme, mobile] of [['taipei', false], ['newcastle', true], ['costa', false]]) {
      const before = requests.length, track = TRACKS[theme], lanesPerDirection = theme === 'taipei' ? 3 : 1;
      const materials = await createWorldMaterials({ capabilities: { getMaxAnisotropy: () => 16 } }, { theme, mobile, roadWidth: track.width, trackLength: track.length, lanesPerDirection });
      assert.equal(requests.length - before, 15); assert.equal(materials.textures.length, 15); assert.equal(materials.materials.length, 5);
      assert.ok(requests.slice(before).every(url => /\/surfaces\/[a-z0-9_]+_(diff|nor_gl|rough)_1k\.jpg$/.test(url)));
      assert.ok(materials.textures.every(texture => texture.repeat.x > 0 && texture.repeat.x <= 1 && texture.anisotropy <= (mobile ? 4 : 8)));
      assert.equal(compile(materials.road).uniforms.apexAsphaltScale.value[0], track.width);
      assert.equal(compile(materials.road).uniforms.apexAsphaltCompaction.value, theme === 'costa' ? 0 : 1);
      assert.equal(materials.concrete.color.getHexString(), theme === 'costa' ? 'ffffff' : 'b1b6b3', 'the scenic palette stays unchanged');
      const resources = [...materials.materials, ...materials.textures], disposals = new Map(resources.map(value => [value, 0]));
      resources.forEach(resource => resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1)));
      materials.dispose(); materials.dispose(); assert.ok([...disposals.values()].every(count => count === 1));
    }
  } finally { THREE.TextureLoader.prototype.load = original; }
});
