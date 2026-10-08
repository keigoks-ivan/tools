import * as THREE from 'three';

// Bearings follow the game's north (+Z), east (+X) convention. Routes are adapted,
// so these are geographic horizons rather than surveyed street panoramas.
export const CITY_BACKDROP_PROFILES = Object.freeze({
  taipei: { bearing: 0, span: 100, baseline: .35, land: '#738c7c', ridges: [[65, 24, 290], [110, 28, 370], [155, 25, 240], [340, 24, 120]] },
  kualalumpur: { bearing: 210, span: 64, baseline: .24, land: '#779386', ridges: [[35, 42, 125], [92, 24, 70]] },
  kobe: { bearing: 0, span: 75, baseline: .42, land: '#74887f', ridges: [[310, 26, 340], [355, 28, 420], [35, 25, 315]] },
  london: { bearing: 45, span: 98, baseline: .45, land: '#8d998a', ridges: [[275, 60, 32], [25, 45, 20]] },
  sydney: { bearing: 90, span: 88, baseline: .27, land: '#7c968e', ridges: [[40, 28, 54], [92, 22, 36], [280, 28, 46]] },
  goldcoast: { bearing: 90, span: 95, baseline: .35, land: '#819d86', ridges: [[55, 25, 220], [90, 22, 295], [135, 28, 160]] },
  melbourne: { bearing: 0, span: 108, baseline: .60, land: '#8b9b8b', ridges: [[82, 27, 68], [128, 28, 38], [290, 40, 22]] },
  paris: { bearing: 0, span: 135, baseline: .74, land: '#9caa98', ridges: [[10, 48, 36], [260, 45, 22]] },
  prague: { bearing: 270, span: 126, baseline: .63, land: '#8b9b87', ridges: [[250, 22, 105], [290, 29, 90], [60, 34, 65]] },
  newcastle: { bearing: 0, span: 15, baseline: .17, land: '#879b8b', ridges: [[325, 34, 44], [40, 42, 35], [180, 55, 18]] },
  bangkok: { bearing: 0, span: 128, baseline: .70, land: '#8f9c8d', ridges: [[75, 65, 12], [285, 65, 10]] },
  sanfrancisco: { bearing: 0, span: 105, baseline: .35, land: '#899991', ridges: [[0, 23, 210], [40, 22, 130], [225, 21, 220], [92, 30, 70]] },
  newyork: { bearing: 0, span: 118, baseline: .31, land: '#9aa6a1', ridges: [[280, 60, 13], [100, 60, 12]] },
  vancouver: { bearing: 0, span: 145, baseline: .25, land: '#6f8586', ridges: [[320, 19, 70], [352, 16, 100], [22, 17, 90], [58, 22, 70]] },
  hanoi: { bearing: 0, span: 118, baseline: .76, land: '#829987', ridges: [[60, 50, 24], [225, 65, 21]] },
  lisbon: { bearing: 0, span: 130, baseline: .63, land: '#99a388', ridges: [[335, 26, 125], [35, 28, 108], [180, 60, 38]] },
  marseille: { bearing: 180, span: 136, baseline: .34, land: '#97a698', ridges: [[80, 28, 245], [135, 27, 160], [270, 32, 82]] },
  nice: { bearing: 270, span: 115, baseline: .39, land: '#8a9c8b', ridges: [[345, 22, 199], [28, 22, 248], [72, 26, 173]] },
  warwick: { bearing: 0, span: 13, baseline: .34, land: '#889d80', ridges: [[40, 55, 31], [190, 48, 24], [290, 42, 29]] },
});

const radians = degrees => THREE.MathUtils.degToRad(degrees);
const angleDistance = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function geographyGeometry(profile, mobile) {
  const segments = mobile ? 128 : 256, radius = 2050, positions = [], colors = [], indices = [];
  const low = new THREE.Color(profile.land).lerp(new THREE.Color('#c6d0c9'), .25), high = new THREE.Color(profile.land);
  const phase = profile.ridges.reduce((sum, [bearing, width, peak]) => sum + bearing * .017 + width * .013 + peak * .003, 0);
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    let height = 9;
    const ridgeDetail = 1 + Math.sin(angle * 7 + phase) * .06 + Math.sin(angle * 19 + phase * .71) * .04 + Math.sin(angle * 31 - phase * .42) * .02;
    for (const [bearing, width, peak] of profile.ridges) height += Math.exp(-((angleDistance(angle, radians(bearing)) / radians(width)) ** 2)) * peak * ridgeDetail;
    for (const [y, color] of [[-45, low], [height, high]]) {
      positions.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius); colors.push(color.r, color.g, color.b);
    }
    if (i < segments) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}
function photoGeometry(profile, aspect, mobile) {
  const radius = 1850, span = radians(profile.span), height = Math.min(940, radius * span / aspect), bottom = 5 - profile.baseline * height;
  const segments = mobile ? 32 : 64, positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, angle = radians(profile.bearing) + (u - .5) * span;
    for (const [y, v] of [[bottom, 0], [bottom + height, 1]]) { positions.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius); uvs.push(1 - u, v); }
    if (i < segments) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}

export async function createCityBackdrop({ city, scene, mobile = false, season, resourcesOwnedByWorld = false, textureLoader = new THREE.TextureLoader() } = {}) {
  const profile = CITY_BACKDROP_PROFILES[city];
  if (!profile) return null;
  if (!scene?.isScene) throw new TypeError('City backdrop requires a Three scene');
  const group = new THREE.Group(); group.name = `${city} real geographic horizon`;
  const geometry = new Set(), materials = new Set(), textures = new Set();
  const geographicMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }); materials.add(geographicMaterial);
  const geographicGeometry = geographyGeometry(profile, mobile); geometry.add(geographicGeometry);
  const geography = new THREE.Mesh(geographicGeometry, geographicMaterial); geography.name = `${city} original geographic silhouette`; group.add(geography);
  let mode = 'original-geography';
  if (profile.photograph !== false) try {
    const texture = await textureLoader.loadAsync(new URL(`./assets/city-photos/${city}.webp`, import.meta.url).href); textures.add(texture);
    const width = texture.image?.width, height = texture.image?.height;
    if (!(width > 0 && height > 0 && width <= 2048 && height <= 1600)) throw new RangeError('City photo exceeded its decoded texture budget');
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = mobile ? 2 : 4;
    const photoMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: season?.sky === 'cloudy' ? .78 : .90, depthWrite: false, fog: true, color: season?.sky === 'cloudy' ? '#d1dbe0' : '#eef0e9' });
    photoMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 cityHorizonUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\ncityHorizonUv = uv;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 cityHorizonUv;').replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
        diffuseColor.a *= smoothstep(0., .085, cityHorizonUv.x) * smoothstep(0., .085, 1. - cityHorizonUv.x);
        diffuseColor.a *= smoothstep(0., .12, cityHorizonUv.y) * (1. - smoothstep(.68, .98, cityHorizonUv.y));
      `);
    };
    photoMaterial.customProgramCacheKey = () => 'city-photographic-horizon-v1'; materials.add(photoMaterial);
    const photo = photoGeometry(profile, width / height, mobile); geometry.add(photo);
    const mesh = new THREE.Mesh(photo, photoMaterial); mesh.name = `${city} licensed real photograph`; mesh.renderOrder = -1; group.add(mesh); mode = 'licensed-photograph';
  } catch (error) {
    // A failed photograph never prevents driving or substitutes another city's view.
    for (const texture of textures) texture.dispose(); textures.clear(); group.userData.photoUnavailable = true;
  }
  group.userData.city = city; group.userData.mode = mode; scene.add(group);
  let disposed = false;
  return {
    group, mode,
    dispose() {
      if (disposed) return; disposed = true; group.removeFromParent();
      if (!resourcesOwnedByWorld) { geometry.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose()); }
    },
  };
}
