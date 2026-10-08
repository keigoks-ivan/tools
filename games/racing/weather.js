import * as THREE from './vendor/three.module.js';

const clamp = THREE.MathUtils.clamp;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const wrap = (value, span) => ((value % span) + span) % span;
function random(seed = 5031) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}

// Attach before world resource capture when resourcesOwnedByWorld is true.
// Only newly allocated precipitation geometry/material belong to this helper;
// surface, foliage, fog and light references are borrowed and restored on dispose.
export function createSeasonWeather({ scene, season, mobile = false, renderer, materials = {}, sun, hemisphere, groundHeight, camera, resourcesOwnedByWorld = false } = {}) {
  if (!scene?.isScene) throw new TypeError('Season weather requires a Three scene');
  const wet = clamp(finite(season?.wet), 0, 1), snow = clamp(finite(season?.snow), 0, 1), cloudy = season?.sky === 'cloudy';
  const snapshots = new Map(), restoredLights = [], existingFog = scene.fog;
  const fogColor = existingFog?.color.clone(), fogDensity = existingFog?.density;
  const backgroundIntensity = scene.backgroundIntensity, environmentIntensity = scene.environmentIntensity;
  const frost = new THREE.Color('#edf1ee');
  function snapshot(mat) {
    if (!mat?.color || snapshots.has(mat)) return;
    snapshots.set(mat, { color: mat.color.clone(), roughness: mat.roughness, envMapIntensity: mat.envMapIntensity, clearcoat: mat.clearcoat, clearcoatRoughness: mat.clearcoatRoughness, alphaTest: mat.alphaTest, onBeforeCompile: mat.onBeforeCompile, customProgramCacheKey: mat.customProgramCacheKey });
  }
  const road = materials.road;
  if (road) {
    snapshot(road);
    road.color.multiplyScalar(1 - wet * .29);
    road.roughness = Math.max(.19, finite(road.roughness, 1) * (1 - wet * .76));
    road.envMapIntensity = finite(road.envMapIntensity, .35) + wet * .9;
    if ('clearcoat' in road) { road.clearcoat = wet * .9; road.clearcoatRoughness = .14; }
  }
  for (const mat of [materials.terrain, materials.dryGrass, materials.shoulder]) {
    if (!mat || snapshots.has(mat)) continue;
    snapshot(mat);
    if (snow) mat.color.lerp(frost, snow * .9);
    else if (season?.id === 'autumn' && mat.userData?.surface === 'sparse_grass') mat.color.multiply(new THREE.Color('#d8c293'));
    if (wet) mat.color.multiplyScalar(1 - wet * .09);
  }
  const foliage = new Set(), evergreens = new Set();
  scene.traverse(node => {
    if (!node.material) return;
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!mat.color) continue;
      if (mat.name === 'city-foliage') foliage.add(mat);
      else if (/branches and foliage|grass tufts/i.test(node.name)) evergreens.add(mat);
    }
  });
  for (const mat of foliage) {
    snapshot(mat); mat.color.set(season?.foliage || '#b5c6a0');
    if (snow) mat.color.lerp(frost, snow * .37);
    const coverage = clamp(finite(season?.leafCoverage, 1), .2, 1);
    if (coverage < 1 && mat.map) {
      const initial = snapshots.get(mat);
      mat.onBeforeCompile = function(shader, webglRenderer) {
        initial.onBeforeCompile.call(this, shader, webglRenderer);
        shader.uniforms.seasonLeafCoverage = { value: coverage };
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 seasonLeafUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nseasonLeafUv=uv;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float seasonLeafCoverage;varying vec2 seasonLeafUv;').replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif(fract(sin(dot(floor(seasonLeafUv*32.),vec2(12.9898,78.233)))*43758.5453)>seasonLeafCoverage)discard;');
      };
      mat.customProgramCacheKey = () => `${initial.customProgramCacheKey.call(mat)}-season-leaf-coverage`;
      mat.needsUpdate = true;
    }
  }
  for (const mat of evergreens) {
    snapshot(mat); mat.color.multiply(new THREE.Color(season?.evergreen || '#aabea0'));
    if (snow) mat.color.lerp(frost, snow * .62);
  }
  const fogTint = snow ? '#c2d0d7' : cloudy ? '#b0bec5' : season?.id === 'autumn' ? '#c9c1b4' : '#c0cfc9';
  if (existingFog) {
    existingFog.color.set(fogTint);
    if (Number.isFinite(fogDensity)) existingFog.density = Math.max(fogDensity, .00035) * (1 + wet * .58 + snow * .8);
  }
  scene.backgroundIntensity = finite(backgroundIntensity, 1) * (cloudy ? .81 : season?.id === 'winter' ? .9 : 1);
  scene.environmentIntensity = finite(environmentIntensity, 1) * (cloudy ? .93 : 1);
  for (const light of [sun, hemisphere]) {
    if (!light?.isLight) continue;
    restoredLights.push({ light, color: light.color.clone(), intensity: light.intensity, ground: light.groundColor?.clone() });
    light.color.set(cloudy ? '#e0e9f0' : season?.id === 'autumn' ? '#ffe4c8' : '#fff5e5');
    light.intensity *= light === sun ? (cloudy ? .53 : season?.id === 'winter' ? .8 : 1) : (cloudy ? 1.42 : 1);
    if (light.groundColor) light.groundColor.set(snow ? '#b2bfbd' : '#8b958c');
  }

  let points, geometry, material, elapsed = 0, disposed = false, activeCount = 0;
  const capacity = mobile ? 350 : 700, precipitation = Math.max(snow, wet >= .2 ? wet : 0), snowing = snow > 0;
  const positions = new Float32Array(precipitation ? capacity * 3 : 0), speeds = new Float32Array(precipitation ? capacity : 0), phases = new Float32Array(precipitation ? capacity : 0);
  if (precipitation) {
    const rand = random();
    for (let i = 0; i < capacity; i++) {
      positions[i * 3] = (rand() - .5) * 68; positions[i * 3 + 1] = -4 + rand() * 34; positions[i * 3 + 2] = (rand() - .5) * 88;
      speeds[i] = snowing ? 1.2 + rand() * 1.4 : 17 + rand() * 9; phases[i] = rand() * Math.PI * 2;
    }
    geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    material = new THREE.ShaderMaterial({
      name: snowing ? 'season-snow' : 'season-rain', transparent: true, depthWrite: false, depthTest: true,
      uniforms: { flake: { value: snowing ? 1 : 0 }, opacity: { value: snowing ? .7 : .32 }, pixelScale: { value: mobile ? 420 : 620 } },
      vertexShader: `uniform float flake;uniform float pixelScale;varying float distanceFade;
        void main(){vec4 view=modelViewMatrix*vec4(position,1.);float d=max(1.,-view.z);
          distanceFade=smoothstep(1.,6.,d)*(1.-smoothstep(42.,70.,d));
          gl_PointSize=clamp((flake>.5?.14:.33)*pixelScale/d,flake>.5?1.5:3.,flake>.5?8.:13.);
          gl_Position=projectionMatrix*view;}`,
      fragmentShader: `uniform float flake;uniform float opacity;varying float distanceFade;
        void main(){vec2 p=gl_PointCoord-.5;float alpha;
          if(flake>.5){alpha=1.-smoothstep(.25,.49,length(p));}
          else{alpha=(1.-smoothstep(.025,.10,abs(p.x)))*(1.-smoothstep(.25,.5,abs(p.y)));}
          alpha*=opacity*distanceFade;if(alpha<.01)discard;gl_FragColor=vec4(flake>.5?vec3(.91,.95,.97):vec3(.70,.79,.85),alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    points = new THREE.Points(geometry, material); points.name = 'Season precipitation'; points.frustumCulled = false; points.renderOrder = 4;
    points.userData.resourceOwner = resourcesOwnedByWorld ? 'world' : 'weather'; scene.add(points);
  }
  function setQuality(level) {
    if (disposed || !points) return;
    const budget = level === 'low' ? Math.round(capacity * .46) : level === 'medium' ? Math.round(capacity * .72) : capacity;
    activeCount = Math.min(capacity, Math.max(32, Math.round(budget * (.42 + precipitation * .58))));
    geometry.setDrawRange(0, activeCount);
    const pixelRatio = renderer?.getPixelRatio?.();
    material.uniforms.pixelScale.value = (mobile ? 420 : 620) * clamp(finite(pixelRatio, 1), .6, 2);
  }
  setQuality(mobile ? 'medium' : 'high');
  return {
    update(state = {}, dt = 1 / 60, viewCamera = camera) {
      if (disposed || !points) return;
      const step = clamp(finite(dt), 0, .1); elapsed += step;
      const cameraPosition = viewCamera?.position, view = cameraPosition || state, yOffset = cameraPosition ? 0 : 2;
      const oldX = points.position.x, oldY = points.position.y, oldZ = points.position.z;
      points.position.set(finite(view.x, oldX), finite(view.y, oldY - yOffset) + yOffset, finite(view.z, oldZ));
      const floor = finite(groundHeight?.(points.position.x, points.position.z), finite(state.y)) - points.position.y + .12;
      for (let i = 0; i < activeCount; i++) {
        const index = i * 3;
        positions[index] = wrap(positions[index] + oldX - points.position.x + (snowing ? Math.sin(elapsed * .8 + phases[i]) * .32 : -.7) * step + 34, 68) - 34;
        positions[index + 2] = wrap(positions[index + 2] + oldZ - points.position.z + 44, 88) - 44;
        positions[index + 1] += oldY - points.position.y - speeds[i] * step;
        if (positions[index + 1] < floor || positions[index + 1] > floor + 36) positions[index + 1] = floor + 5 + wrap(i * .73 + elapsed * 3, 30);
      }
      geometry.attributes.position.needsUpdate = true;
    },
    setQuality,
    dispose() {
      if (disposed) return; disposed = true;
      points?.removeFromParent();
      if (!resourcesOwnedByWorld) { geometry?.dispose(); material?.dispose(); }
      for (const [mat, initial] of snapshots) {
        mat.color.copy(initial.color);
        for (const key of ['roughness', 'envMapIntensity', 'clearcoat', 'clearcoatRoughness', 'alphaTest']) if (initial[key] !== undefined) mat[key] = initial[key];
        if (mat.onBeforeCompile !== initial.onBeforeCompile) {
          mat.onBeforeCompile = initial.onBeforeCompile; mat.customProgramCacheKey = initial.customProgramCacheKey; mat.needsUpdate = true;
        }
      }
      if (scene.fog === existingFog && fogColor) { scene.fog.color.copy(fogColor); if (Number.isFinite(fogDensity)) scene.fog.density = fogDensity; }
      scene.backgroundIntensity = backgroundIntensity; scene.environmentIntensity = environmentIntensity;
      for (const initial of restoredLights) { initial.light.color.copy(initial.color); initial.light.intensity = initial.intensity; if (initial.ground) initial.light.groundColor.copy(initial.ground); }
    },
  };
}
