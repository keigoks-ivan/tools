import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three';
import { CITY_BACKDROP_PROFILES, createCityBackdrop } from './world-city-backdrop.js';
import { CITY_THEMES } from './world-cities.js';

const manifest = JSON.parse(await readFile(new URL('./assets/city-photo-manifest.json', import.meta.url), 'utf8'));

test('each city has its own verified local photographic reference within the download budget', async () => {
  assert.deepEqual(Object.keys(CITY_BACKDROP_PROFILES).sort(), [...CITY_THEMES].sort());
  assert.deepEqual(Object.keys(manifest.cities).sort(), [...CITY_THEMES].sort());
  const sources = new Set(); let bytes = 0;
  for (const [city, photo] of Object.entries(manifest.cities)) {
    assert.equal(photo.file, `${city}.webp`);
    assert.ok(photo.artist && photo.date && photo.descriptionurl.startsWith('https://commons.wikimedia.org/'));
    assert.match(photo.license, /^CC(?: BY|0)/); assert.ok(photo.licenseUrl.includes('creativecommons.org/'));
    assert.equal(photo.runtimeUse, CITY_BACKDROP_PROFILES[city].photograph === false ? 'reference-only' : 'licensed-photographic-horizon');
    assert.ok(photo.encodedWidth <= 1600 && photo.encodedHeight <= 1200);
    assert.equal((await stat(new URL(`./assets/city-photos/${photo.file}`, import.meta.url))).size, photo.encodedBytes);
    sources.add(photo.descriptionurl); bytes += photo.encodedBytes;
  }
  assert.equal(sources.size, CITY_THEMES.length, 'a shared city photo cannot stand in for another place');
  assert.ok(bytes / CITY_THEMES.length < 250 * 1024, 'average selected-city download stays below 250 KiB');
});

for (const mobile of [false, true]) test(`city horizons ${mobile ? 'mobile' : 'desktop'}: local-only load, finite geometry and two-draw budget`, async () => {
  for (const city of CITY_THEMES) {
    const scene = new THREE.Scene(), requests = [], photo = manifest.cities[city];
    const texture = new THREE.Texture({ width: photo.encodedWidth, height: photo.encodedHeight });
    const built = await createCityBackdrop({ city, scene, mobile, season: { sky: 'clear' }, textureLoader: { async loadAsync(url) { requests.push(url); return texture; } } });
    const photographic = CITY_BACKDROP_PROFILES[city].photograph !== false;
    assert.equal(requests.length, photographic ? 1 : 0);
    if (photographic) assert.ok(requests[0].endsWith(`/assets/city-photos/${city}.webp`));
    assert.equal(built.mode, photographic ? 'licensed-photograph' : 'original-geography'); assert.equal(built.group.parent, scene);
    const resources = new Set(photographic ? [texture] : []); let draws = 0, triangles = 0;
    built.group.traverse(node => {
      if (!node.isMesh) return;
      draws++; triangles += node.geometry.index.count / 3; resources.add(node.geometry); resources.add(node.material);
      for (const position of node.geometry.attributes.position.array) assert.ok(Number.isFinite(position));
      assert.ok(node.geometry.boundingSphere.radius < 2400); assert.equal(node.castShadow, false);
      if (node.material.map) {
        assert.equal(node.material.map.colorSpace, THREE.SRGBColorSpace);
        assert.equal(node.material.depthWrite, false);
        assert.equal(node.material.side, THREE.FrontSide, 'transparent photo stays within one render draw');
        assert.equal(node.geometry.attributes.uv.getX(0), 1, 'a photograph viewed inside the horizon is not mirrored');
        const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
        node.material.onBeforeCompile(shader);
        assert.ok(shader.fragmentShader.includes('smoothstep(.68, .98, cityHorizonUv.y)'), 'top photo boundary fades into the sky');
      }
    });
    assert.equal(draws, photographic ? 2 : 1); assert.ok(triangles <= 640);
    let disposed = 0; resources.forEach(value => value.addEventListener('dispose', () => disposed++));
    built.dispose(); built.dispose(); assert.equal(disposed, resources.size); assert.equal(built.group.parent, null);
  }
});

test('Kobe uses the north-facing Mount Maya sector and keeps the southern harbor open', async () => {
  const scene = new THREE.Scene();
  const photo = manifest.cities.kobe, texture = new THREE.Texture({ width: photo.encodedWidth, height: photo.encodedHeight });
  const built = await createCityBackdrop({ city: 'kobe', scene, textureLoader: { async loadAsync() { return texture; } } });
  assert.equal(built.mode, 'licensed-photograph'); assert.equal(built.group.children.length, 2);
  assert.match(photo.title, /Mt.Maya/); assert.equal(CITY_BACKDROP_PROFILES.kobe.bearing, 0);
  const positions = built.group.children[0].geometry.attributes.position;
  let northHeight = 0, southHeight = 0;
  for (let i = 1; i < positions.count; i += 2) {
    const x = positions.getX(i), z = positions.getZ(i), height = positions.getY(i);
    if (z > 1800 && Math.abs(x) < 500) northHeight = Math.max(northHeight, height);
    if (z < -1800 && Math.abs(x) < 500) southHeight = Math.max(southHeight, height);
  }
  assert.ok(northHeight > 400, 'Rokko remains behind the city');
  assert.ok(southHeight <= 10, 'the south-facing harbor remains open');
  built.dispose();
});

test('photographed historic city roofs and Warwick church keep a plausible horizon scale', async () => {
  // Anchors are read from the selected real photographs: the distant Bangkok
  // roof line near 27% from the top and Hanoi's low lake skyline near 17%.
  for (const [city, roofUv, maximumHeight] of [['bangkok', .73, 60], ['hanoi', .83, 60], ['paris', .79, 60], ['melbourne', .65, 60], ['prague', .66, 60], ['newcastle', .98, 95], ['warwick', .98, 80]]) {
    const scene = new THREE.Scene(), photo = manifest.cities[city];
    const texture = new THREE.Texture({ width: photo.encodedWidth, height: photo.encodedHeight });
    const built = await createCityBackdrop({ city, scene, textureLoader: { async loadAsync() { return texture; } } });
    const positions = built.group.children[1].geometry.attributes.position;
    const roofHeight = THREE.MathUtils.lerp(positions.getY(0), positions.getY(1), roofUv);
    assert.ok(roofHeight >= 0 && roofHeight < maximumHeight, `${city} must not become a floating city wall hundreds of meters above the road`);
    built.dispose();
  }
});

test('world capture owns shared horizon resources exactly once and missing photos retain local geography', async () => {
  const scene = new THREE.Scene(), texture = new THREE.Texture({ width: 1600, height: 400 });
  const built = await createCityBackdrop({ city: 'newyork', scene, resourcesOwnedByWorld: true, textureLoader: { async loadAsync() { return texture; } } });
  const captured = new Set([texture]); built.group.traverse(node => { if (node.isMesh) { captured.add(node.geometry); captured.add(node.material); } });
  let disposed = 0; captured.forEach(value => value.addEventListener('dispose', () => disposed++));
  built.dispose(); assert.equal(disposed, 0); captured.forEach(value => value.dispose()); assert.equal(disposed, captured.size);
  const fallback = await createCityBackdrop({ city: 'warwick', scene, textureLoader: { async loadAsync() { throw new Error('Offline'); } } });
  assert.equal(fallback.mode, 'original-geography'); assert.equal(fallback.group.userData.city, 'warwick'); assert.equal(fallback.group.children.length, 1); fallback.dispose();
  assert.equal(await createCityBackdrop({ city: 'costa', scene, textureLoader: { loadAsync() { throw new Error('Unexpected request'); } } }), null);
});

test('Gold Coast mountains stay landward and the ocean horizon stays level', async () => {
  const scene = new THREE.Scene();
  const built = await createCityBackdrop({ city: 'goldcoast', scene, textureLoader: { async loadAsync() { throw new Error('Offline'); } } });
  const positions = built.group.children[0].geometry.attributes.position;
  let inlandHeight = 0, oceanHeight = 0;
  for (let i = 1; i < positions.count; i += 2) {
    const x = positions.getX(i), z = positions.getZ(i), height = positions.getY(i);
    if (x > 1800 && Math.abs(z) < 500) inlandHeight = Math.max(inlandHeight, height);
    if (x < -1800 && Math.abs(z) < 500) oceanHeight = Math.max(oceanHeight, height);
  }
  assert.ok(inlandHeight > 250, 'the Tamborine hinterland remains recognizably mountainous');
  assert.ok(oceanHeight <= 10, 'the open Pacific cannot contain an angled mountain polygon');
  assert.equal(CITY_BACKDROP_PROFILES.goldcoast.bearing, 90, 'the actual hinterland photograph faces land');
  built.dispose();
});

test('Nice keeps a low irregular inland silhouette and an open western sea', async () => {
  const build = async () => createCityBackdrop({ city: 'nice', scene: new THREE.Scene(), textureLoader: { async loadAsync() { throw new Error('Offline'); } } });
  const first = await build(), second = await build();
  const positions = first.group.children[0].geometry.attributes.position;
  assert.deepEqual(positions.array, second.group.children[0].geometry.attributes.position.array, 'ridge variation must stay deterministic rather than moving with frames');
  let inlandHeight = 0, oceanHeight = 0;
  for (let i = 1; i < positions.count; i += 2) {
    const x = positions.getX(i), z = positions.getZ(i), height = positions.getY(i);
    if (z > 1400 && x > -1000) inlandHeight = Math.max(inlandHeight, height);
    if (x < -1800 && Math.abs(z) < 500) oceanHeight = Math.max(oceanHeight, height);
  }
  assert.ok(inlandHeight > 180 && inlandHeight < 300, 'the local foothills cannot become a giant smooth mountain wall');
  assert.ok(oceanHeight < 10, 'the bay stays open west of the modeled route');
  first.dispose(); second.dispose();
});
