import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { TRACK } from './track.mjs?v=city-drive-15';
import { createWorldMaterials } from './world-materials.js?v=city-drive-15';
import { addVegetation } from './world-vegetation.js?v=city-drive-15';
import { addLandmarks } from './world-landmarks.js?v=city-drive-15';
import { addRoadDetails } from './world-road.js?v=city-drive-15';
import { CITY_THEMES, cityGroundLevel, addCityScenery } from './world-cities.js?v=city-drive-15';
import { defaultSeason } from './seasons.mjs?v=city-drive-15';
import { createSeasonWeather } from './weather.js?v=city-drive-15';
import { shadowFrame, sunlightProfile } from './lighting.mjs?v=city-drive-15';
import { createTyreMarks } from './tyre-marks.js?v=city-drive-15';
import { createCityBackdrop } from './world-city-backdrop.js?v=city-drive-15';
import { createTerrainHeightSampler } from './world-terrain.mjs?v=city-drive-15';
import { CITY_ROAD_PROFILES } from './world-city-roadmarkings.js?v=city-drive-15';

const noise = new ImprovedNoise();
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
function random(seed = 73) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}
function textureCanvas(size, paint) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  paint(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
function waterNormalTexture(mobile) {
  const texture = textureCanvas(mobile ? 128 : 256, (c, n) => {
    const image = c.createImageData(n, n), tau = Math.PI * 2;
    function height(x, y) {
      const u = x / n * tau, v = y / n * tau;
      const warp = .38 * Math.sin(u * 2 - v * 3) + .16 * Math.cos(v * 4 + u);
      return Math.sin(u * 7 + v * 3 + warp) * .46 + Math.sin(u * 3 - v * 11 - warp * .7) * .32
        + Math.sin(u * 17 + v * 8 + 1.3) * .14 + Math.sin(u * 23 - v * 19 + warp * .6) * .08
        + Math.sin(u * 31 + v * 13 + .8) * .04;
    }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * n / 128;
      const dy = (height(x, y + 1) - height(x, y - 1)) * n / 128;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y * n + x) * 4;
      image.data[i] = (dx * inverseLength * .5 + .5) * 255;
      image.data[i + 1] = (dy * inverseLength * .5 + .5) * 255;
      image.data[i + 2] = (inverseLength * .5 + .5) * 255; image.data[i + 3] = 255;
    }
    c.putImageData(image, 0, 0);
  });
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}
function roadStrip(track, inner, outer, material, segments = track.samples.length, lift = 0) {
  const positions = [], uv = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const p = track.sample(i / segments * track.length);
    for (const offset of [inner, outer]) {
      positions.push(p.x + p.nx * offset, p.y + lift, p.z + p.nz * offset);
      uv.push(offset, i / segments * track.length);
    }
    if (i < segments) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material); mesh.receiveShadow = true; return mesh;
}
function signTexture(title, sub = 'COASTAL MOTOR CLUB') {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const c = canvas.getContext('2d'); c.fillStyle = '#242723'; c.fillRect(0, 0, 1024, 256);
  c.fillStyle = '#efdfb7'; c.fillRect(40, 46, 8, 162); c.font = 'italic 700 125px Arial'; c.fillText(title, 76, 153);
  c.fillStyle = '#acb8a6'; c.font = '22px Arial'; c.fillText(sub, 84, 209);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export async function createWorld(renderer, { mobile = false, track = TRACK, season = defaultSeason(track) } = {}) {
  const theme = track.theme, alpine = theme === 'alpine', canyon = theme === 'canyon', grandprix = theme === 'grandprix', city = CITY_THEMES.includes(theme);
  const palette = city ? { fog: theme === 'london' ? '#bac7cd' : '#c0cbc9', grass: '#889b7d', rock: '#bfc0b5', sun: '#fff1de', hemisphere: '#dceaf0', ground: '#777d77' }
    : alpine ? { fog: '#bacbce', grass: '#6c8274', rock: '#919b9c', sun: '#fff0d4', hemisphere: '#d8ecf4', ground: '#647468' }
    : canyon ? { fog: '#dcc4af', grass: '#ba8765', rock: '#d9b491', sun: '#ffdeb9', hemisphere: '#dfeaf4', ground: '#a47858' }
      : grandprix ? { fog: '#becbc7', grass: '#718c65', rock: '#c4b59a', sun: '#ffead0', hemisphere: '#d8eaf0', ground: '#8b896c' }
        : { fog: '#b3beb9', grass: '#8a9470', rock: '#b0a28a', sun: '#ffe1b0', hemisphere: '#d6ebef', ground: '#948366' };
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(palette.fog, city ? .00032 : alpine ? .00065 : canyon ? .00048 : .00052);
  const daylight = sunlightProfile({ city, alpine, canyon, cloudy: season.sky === 'cloudy' });
  const skyFile = daylight.skyFile;
  const loaded = await Promise.allSettled([
    createWorldMaterials(renderer, { mobile, theme, roadWidth: track.width, lanesPerDirection: CITY_ROAD_PROFILES[track.id]?.lanes ?? 1, trackLength: track.length }),
    new RGBELoader().loadAsync(new URL(`./assets/${skyFile}`, import.meta.url).href),
  ]);
  if (loaded.some(result => result.status === 'rejected')) {
    loaded.filter(result => result.status === 'fulfilled').forEach(result => result.value.dispose());
    throw loaded.find(result => result.status === 'rejected').reason;
  }
  const [surfaceMaterials, environment] = loaded.map(result => result.value);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer); const env = pmrem.fromEquirectangular(environment); scene.environment = env.texture; pmrem.dispose();
  scene.background = environment; scene.backgroundBlurriness = .015;
  scene.backgroundRotation.y = scene.environmentRotation.y = daylight.skyRotation;
  scene.backgroundIntensity = canyon ? .9 : alpine ? 1.04 : .86;
  scene.environmentIntensity = skyFile === 'environment.hdr' ? 1.04 : city ? 1.06 : canyon ? .78 : .76;
  const sunOffset = new THREE.Vector3(daylight.sunOffset.x, daylight.sunOffset.y, daylight.sunOffset.z);
  const hemisphere = new THREE.HemisphereLight(palette.hemisphere, palette.ground, city ? .24 : .20); scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(canyon ? '#fff0dc' : '#fff5e6', canyon ? 2.5 : city ? 1.85 : 2.3); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -56, right: 56, top: 56, bottom: -56, near: 1, far: 1800 });
  sun.shadow.bias = -.00012; sun.shadow.normalBias = .025;
  sun.shadow.autoUpdate = false;
  scene.add(sun, sun.target);

  const groundMat = city ? surfaceMaterials.concrete.clone() : surfaceMaterials.terrain;
  if (city) groundMat.color.set('#868b87');
  function groundHeight(x, z, nearest = track.nearest(x, z)) {
    const inland = Math.max(0, x - 10);
    const cityLevel = city ? cityGroundLevel(theme, x, z) : 0;
    const base = city ? cityLevel === 4.65 ? nearest.y - .65 : cityLevel
      : alpine ? 24 + noise.noise(x / 145, z / 130, .4) * 52 + noise.noise(x / 36, z / 39, 2) * 8
      : canyon ? 12 + noise.noise(x / 190, z / 180, .4) * 22 + noise.noise(x / 39, z / 42, 2) * 5
        : grandprix ? 4 + noise.noise(x / 230, z / 220, .4) * 3
          : 8 + inland * .115 + noise.noise(x / 105, z / 95, .4) * 19 + noise.noise(x / 27, z / 29, 2) * 2.8;
    const corridorBlend = clamp((nearest.distance - (track.width / 2 + 7)) / (grandprix || city ? 18 : 28), 0, 1);
    let height = mix(nearest.y - .35, base, corridorBlend * corridorBlend * (3 - 2 * corridorBlend));
    if (theme === 'costa') {
      const sea = clamp((-x - 180) / 70, 0, 1); height = mix(height, -2.6, sea * sea * (3 - 2 * sea));
    }
    return height;
  }
  const terrainResolution = city ? mobile ? 48 : 64 : mobile ? 240 : 320;
  const terrain = new THREE.PlaneGeometry(1800, 1800, terrainResolution, terrainResolution); terrain.rotateX(-Math.PI / 2);
  const pos = terrain.attributes.position, colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color('#f6f5ee'), rock = new THREE.Color(alpine ? '#c5cfca' : canyon ? '#d1bbaa' : '#dfdbc9'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, groundHeight(x, z)); terrain.attributes.uv.setXY(i, x, z);
    const v = clamp(noise.noise(x / (canyon ? 80 : 34), z / (canyon ? 72 : 35), 7) * .9 + .42 + (theme === 'costa' ? Math.max(0, x - 160) / 500 : 0), 0, 1);
    c.copy(grass).lerp(rock, v); c.multiplyScalar(.92 + noise.noise(x / 11, z / 10, 1) * .08); colors.set([c.r, c.g, c.b], i * 3);
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3)); terrain.computeVertexNormals();
  const ground = new THREE.Mesh(terrain, groundMat); ground.receiveShadow = true; scene.add(ground);
  const sampleTerrainHeight = city ? createTerrainHeightSampler(terrain) : null;
  const groundSurfaceHeight = city ? (x, z) => sampleTerrainHeight(x, z) ?? groundHeight(x, z) : groundHeight;
  if (city) groundSurfaceHeight.grid = sampleTerrainHeight.grid;

  const roadMat = surfaceMaterials.road;
  const half = track.width / 2;
  if (grandprix) {
    const runoff = new THREE.MeshStandardMaterial({ color: '#b4c5bb', roughness: 1, side: THREE.DoubleSide });
    scene.add(roadStrip(track, -track.wallOffset, -half, runoff, undefined, .012), roadStrip(track, half, track.wallOffset, runoff, undefined, .012));
  }
  scene.add(roadStrip(track, -half, half, roadMat, track.samples.length, .035));
  const shoulder = surfaceMaterials.shoulder;
  if(city){
    const verge = surfaceMaterials.concrete;
    scene.add(roadStrip(track,-track.wallOffset,-half,verge,undefined,.10),roadStrip(track,half,track.wallOffset,verge,undefined,.10));
  }else{
    scene.add(roadStrip(track, -half - 1.4, -half, shoulder, undefined, .02), roadStrip(track, half, half + 1.4, shoulder, undefined, .02));
    const lineMaterial = new THREE.MeshStandardMaterial({ color: '#e7e2d2', roughness: .9, side: THREE.DoubleSide });
    scene.add(roadStrip(track, -half + .15, -half + .28, lineMaterial, undefined, .05), roadStrip(track, half - .28, half - .15, lineMaterial, undefined, .05));
  }
  addRoadDetails({ scene, track, mobile, materials: surfaceMaterials });
  const vegetation = city ? {} : addVegetation({ scene, track, mobile, groundHeight, materials: surfaceMaterials });
  const landmarks = city ? addCityScenery({ scene, track, mobile, groundHeight, groundSurfaceHeight, materials: surfaceMaterials })
    : addLandmarks({ scene, track, mobile, groundHeight, materials: surfaceMaterials });
  const rand = random(744), bounds = track.bounds;

  if (alpine || canyon) {
    const distant = new THREE.Group(), centerX = (bounds.minX + bounds.maxX) / 2, centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const mountainMat = surfaceMaterials.rock.clone(); mountainMat.vertexColors = true; mountainMat.normalMap = null; mountainMat.roughnessMap = null; mountainMat.roughness = 1;
    const snowMat = alpine ? new THREE.MeshStandardMaterial({ color: '#e3e9e6', roughness: .94 }) : null;
    const rockColor = new THREE.Color(alpine ? '#a4aca7' : '#b78058'), summitColor = new THREE.Color(alpine ? '#f4f7f4' : '#d9aa78');
    const forestColor = new THREE.Color('#899286'), strataColor = new THREE.Color('#8c533a'), vertexColor = new THREE.Color();
    const peakCount = alpine ? 16 : 17;
    for (let i = 0; i < peakCount; i++) {
      const angle = i * Math.PI * 2 / peakCount + (rand() - .5) * .1;
      const radius = alpine ? 1350 + rand() * 280 : 800 + rand() * 500;
      const x = centerX + Math.cos(angle) * radius, z = centerZ + Math.sin(angle) * radius;
      const near = track.nearest(x, z); if (near.distance < 170) continue;
      const height = alpine ? 220 + rand() * 170 : 45 + rand() * 80, width = alpine ? 280 + rand() * 170 : 75 + rand() * 100;
      const base = alpine ? 10 : groundHeight(x, z, near) - 8;
      let geo;
      if (alpine) {
        const segments = mobile ? 48 : 72;
        geo = new THREE.PlaneGeometry(width * 3.2, width * 2.7, segments, segments); geo.rotateX(-Math.PI / 2);
        const vertices = geo.attributes.position, vertexColors = new Float32Array(vertices.count * 3);
        const peaks = [[-.2, -.12, 1], [.62, .2, .76 + rand() * .13], [-.81, .33, .58 + rand() * .2]];
        for (let j = 0; j < vertices.count; j++) {
          const px = vertices.getX(j), pz = vertices.getZ(j), u = px / width, v = pz / width;
          let ridge = 0;
          for (const [pu, pv, strength] of peaks) ridge = Math.max(ridge, Math.exp(-((u - pu) ** 2 / .32 + (v - pv) ** 2 / .52)) * strength);
          const edge = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(u) / 1.6, Math.abs(v) / 1.35), .72, 1);
          const crags = noise.noise(px / 36, pz / 39, i + 2) * .16 - Math.abs(noise.noise(px / 16, pz / 18, i)) * .09;
          const elevation = Math.max(0, (ridge * (.98 + crags) + crags * .32) * edge);
          vertices.setY(j, height * elevation); geo.attributes.uv.setXY(j, px / 16, pz / 16);
          const snowLine = .61 + noise.noise(px / 33, pz / 31, i + 4) * .065;
          const snow = THREE.MathUtils.smoothstep(elevation, snowLine, snowLine + .12);
          vertexColor.copy(forestColor).lerp(rockColor, THREE.MathUtils.smoothstep(elevation, .12, .43)).lerp(summitColor, snow);
          vertexColor.multiplyScalar(.92 + noise.noise(px / 18, pz / 20, 7) * .08);
          vertexColors.set([vertexColor.r, vertexColor.g, vertexColor.b], j * 3);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
      } else {
        const sides = mobile ? 24 : 36, positions = [], vertexColors = [], uv = [], indices = [];
        const rings = [[0, 1.16], [.10, 1.05], [.24, .82], [.30, .85], [.45, .65], [.50, .69], [.70, .57], [.76, .6], [.95, .49], [1, .51]];
        for (let ring = 0; ring < rings.length; ring++) for (let side = 0; side <= sides; side++) {
          const a = side / sides * Math.PI * 2, [level, radiusScale] = rings[ring];
          const silhouette = 1 + Math.sin(a * 3 + i) * .23 + Math.sin(a * 7 - i) * .1 + Math.sin(a * 11 + i * 3) * .06;
          const radiusAt = width * radiusScale * silhouette, px = Math.cos(a) * radiusAt + level * width * .18, pz = Math.sin(a) * radiusAt * (.65 + Math.sin(i * 3) * .18);
          const elevation = level * height + noise.noise(px / 27, pz / 23, i + 1) * (ring === rings.length - 1 ? 1.8 : 3);
          positions.push(px, elevation, pz); uv.push(side / sides * width * Math.PI / 15, elevation / 15);
          const band = .18 + .25 * (Math.sin(level * 42 + i) * .5 + .5);
          vertexColor.copy(rockColor).lerp(strataColor, band).lerp(summitColor, level > .98 ? .65 : .1);
          vertexColors.push(vertexColor.r, vertexColor.g, vertexColor.b);
          if (ring < rings.length - 1 && side < sides) {
            const k = ring * (sides + 1) + side, next = k + sides + 1;
            indices.push(k, next, k + 1, k + 1, next, next + 1);
          }
        }
        const center = positions.length / 3; positions.push(width * .16, height, 0); uv.push(.5, .5); vertexColors.push(summitColor.r, summitColor.g, summitColor.b);
        for (let side = 0; side < sides; side++) { const k = (rings.length - 1) * (sides + 1) + side; indices.push(center, k + 1, k); }
        geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices);
      }
      geo.computeVertexNormals();
      const peak = new THREE.Mesh(geo, mountainMat); peak.position.set(x, base, z); peak.rotation.y = rand() * Math.PI; distant.add(peak);
      if (alpine) {
        const snowPositions = [], snowNormals = [], vertices = geo.attributes.position, normals = geo.attributes.normal;
        const triangles = geo.index.array;
        for (let j = 0; j < triangles.length; j += 3) {
          const ids = [triangles[j], triangles[j + 1], triangles[j + 2]];
          const snowy = ids.every(id => vertices.getY(id) / height > .43 + noise.noise(vertices.getX(id) / 47, vertices.getZ(id) / 45, i + 4) * .06);
          if (!snowy) continue;
          for (const id of ids) { snowPositions.push(vertices.getX(id), vertices.getY(id) + .25, vertices.getZ(id)); snowNormals.push(normals.getX(id), normals.getY(id), normals.getZ(id)); }
        }
        const cap = new THREE.BufferGeometry(); cap.setAttribute('position', new THREE.Float32BufferAttribute(snowPositions, 3)); cap.setAttribute('normal', new THREE.Float32BufferAttribute(snowNormals, 3));
        const snow = new THREE.Mesh(cap, snowMat); snow.position.copy(peak.position); snow.rotation.copy(peak.rotation); distant.add(snow);
      }
    }
    scene.add(distant);
  }

  let waterNormals, waterMat, foamMat;
  if (theme === 'costa') {
    waterNormals = waterNormalTexture(mobile); waterNormals.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    waterMat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, cameraPos: { value: new THREE.Vector3() }, ripples: { value: waterNormals }, skyReflection: { value: environment }, sunDirection: { value: sunOffset.clone().normalize() }, sunStrength: { value: 1 }, sunColor: { value: sun.color.clone() }, fogColor: { value: scene.fog.color.clone() }, fogDensity: { value: scene.fog.density } }, transparent: false,
      vertexShader: 'varying vec3 vPos;void main(){vPos=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vPos,1.);}',
      fragmentShader: `varying vec3 vPos;uniform float time;uniform vec3 cameraPos;uniform sampler2D ripples;uniform sampler2D skyReflection;uniform vec3 sunDirection;uniform float sunStrength;uniform vec3 sunColor;uniform vec3 fogColor;uniform float fogDensity;
        void main(){vec2 p=vPos.xz;vec2 drift=vec2(time*.002,-time*.0013);
          vec2 broad=texture2D(ripples,p*.018+drift*.35).rg*2.-1.;
          vec2 medium=texture2D(ripples,p*.057+drift+broad*.09).rg*2.-1.;
          vec2 micro=texture2D(ripples,mat2(.74,-.67,.67,.74)*p*.143-drift*.8).rg*2.-1.;
          float distanceToCamera=length(cameraPos-vPos);float detail=1.-smoothstep(35.,340.,distanceToCamera);
          vec2 slope=broad*(.035+.075*detail)+medium*(.13*detail)+micro*(.07*detail);vec3 n=normalize(vec3(slope.x,1.,slope.y));vec3 v=normalize(cameraPos-vPos);
          float fres=.025+.975*pow(1.-max(dot(n,v),0.),5.);vec3 reflected=reflect(-v,n);
          reflected=vec3(cos(1.8)*reflected.x+sin(1.8)*reflected.z,reflected.y,-sin(1.8)*reflected.x+cos(1.8)*reflected.z);
          vec2 skyUV=vec2(atan(reflected.z,reflected.x)*.159154943+.5,asin(clamp(reflected.y,-1.,1.))*.318309886+.5);
          vec3 skyColor=texture2D(skyReflection,skyUV).rgb;skyColor=skyColor/(vec3(1.)+skyColor*.32);
          vec3 col=mix(vec3(.016,.115,.155),skyColor*.64,fres);
          vec3 l=sunDirection;float spec=pow(max(dot(reflect(-l,n),v),0.),110.);col+=sunColor*spec*.32*sunStrength;
          float fog=1.-exp(-distanceToCamera*distanceToCamera*fogDensity*fogDensity);col=mix(col,fogColor,fog);
          gl_FragColor=vec4(col,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4600), waterMat); water.rotation.x = -Math.PI / 2; water.position.set(-2320, -.7, 0); scene.add(water);
    const foamPositions = [], foamUV = [], foamIndices = [];
    let row = 0;
    for (let z = -780; z <= 780; z += 6) {
      let west = -265, east = -185;
      for (let i = 0; i < 12; i++) { const x = (west + east) / 2; if (groundHeight(x, z) < -.7) west = x; else east = x; }
      const shore = (west + east) / 2;
      for (const offset of [-7, .5]) { foamPositions.push(shore + offset, -.665, z); foamUV.push((offset + 7) / 7.5, z / 16); }
      if (row > 0) { const k = row * 2; foamIndices.push(k - 2, k, k - 1, k - 1, k, k + 1); } row++;
    }
    const foamGeo = new THREE.BufferGeometry(); foamGeo.setAttribute('position', new THREE.Float32BufferAttribute(foamPositions, 3)); foamGeo.setAttribute('uv', new THREE.Float32BufferAttribute(foamUV, 2)); foamGeo.setIndex(foamIndices);
    foamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: { value: 0 }, ripples: { value: waterNormals } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv;uniform float time;uniform sampler2D ripples;void main(){
        float n=texture2D(ripples,vec2(vUv.x*2.,vUv.y*.35+time*.009)).r;
        float wave=sin(vUv.x*11.-time*.7+sin(vUv.y*1.5)*.8)*.5+.5;
        float edge=smoothstep(0.,.24,vUv.x)*(1.-smoothstep(.83,1.,vUv.x));
        float alpha=pow(wave,7.)*edge*(.08+n*.2);gl_FragColor=vec4(vec3(.68,.78,.76),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
    scene.add(new THREE.Mesh(foamGeo, foamMat));

  }

  const start = track.sample(0);
  const titles = { costa: ['COSTA', 'COASTAL MOTOR CLUB'], alpine: ['ALPINE', 'SUMMIT MOTOR CLUB'], canyon: ['RED ROCK', 'DESERT MOTOR CLUB'], grandprix: ['APEX GP', 'INTERNATIONAL CIRCUIT'], taipei: ['TAIPEI', 'XINYI STREET CIRCUIT'], kualalumpur: ['KLCC', 'KUALA LUMPUR STREET CIRCUIT'], kobe: ['KOBE', 'MERIKEN HARBOR CIRCUIT'], london: ['LONDON', 'WESTMINSTER STREET CIRCUIT'] };
  const [title, subtitle] = titles[theme] || [track.id.toUpperCase(), 'CITY STREET CIRCUIT'];
  const finish = new THREE.Group(); finish.position.set(start.x, start.y + .06, start.z); finish.rotation.y = start.heading;
  for (let row = 0; row < 2; row++) for (let i = 0; i < 16; i++) {
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(track.width / 16, .65), new THREE.MeshStandardMaterial({ color: (row + i) % 2 ? '#e7e2d5' : '#242725', roughness: .95 }));
    tile.rotation.x = -Math.PI / 2; tile.position.set(-half + (i + .5) * track.width / 16, .01, row * .65); tile.receiveShadow = true; finish.add(tile);
  }
  scene.add(finish);
  const signs = new THREE.Group();
  const sponsorMap = signTexture(title, subtitle);
  for (let s = 70; !city && s < track.length; s += 160) {
    const a = track.sample(s), sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: sponsorMap, side: THREE.DoubleSide }));
    sign.position.set(a.x + a.nx * (half + 3.15), a.y + 1.3, a.z + a.nz * (half + 3.15)); sign.rotation.y = a.heading - Math.PI / 2; signs.add(sign);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, 1.6, 6), new THREE.MeshStandardMaterial({ color: '#989e97', metalness: .65, roughness: .6 }));
    pole.position.set(sign.position.x, a.y + .65, sign.position.z); pole.castShadow = true; signs.add(pole);
  }
  scene.add(signs);
  const backdrop = await createCityBackdrop({ city: track.id, scene, mobile, season, resourcesOwnedByWorld: true });
  const weather = createSeasonWeather({ scene, season, mobile, renderer, materials: { ...surfaceMaterials, seasonGround: groundMat }, sun, hemisphere, groundHeight, diffuseSky: skyFile === 'environment.hdr', resourcesOwnedByWorld: true });
  if (waterMat) { waterMat.uniforms.sunStrength.value = sun.intensity / 2.3; waterMat.uniforms.sunColor.value.copy(sun.color); waterMat.uniforms.fogColor.value.copy(scene.fog.color); waterMat.uniforms.fogDensity.value = scene.fog.density; }
  let weatherTime = 0;
  const tyreMarks = createTyreMarks({ scene, track, mobile, wet: season.wet, resourcesOwnedByWorld: true });
  let shadowQuality = mobile ? 'medium' : 'high', shadowExtent = 56, lastShadowTime = -Infinity, lastShadowState = -1, shadowDirty = true;
  // Capture world-owned resources before the caller adds cars or ghosts.
  const geometries = new Set(), materials = new Set(surfaceMaterials.materials), textures = new Set([environment, ...surfaceMaterials.textures]), instances = new Set();
  scene.traverse(object => {
    if (object.isInstancedMesh) instances.add(object);
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [...(Array.isArray(object.material) ? object.material : object.material ? [object.material] : []), object.customDepthMaterial, object.customDistanceMaterial].filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture && value !== env.texture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {})) if (uniform.value?.isTexture && uniform.value !== env.texture) textures.add(uniform.value);
    }
  });
  let disposed = false;
  return { scene, groundHeight, update(state, elapsed, camera, vehicle) {
    weather.update(state, Math.max(0, elapsed - weatherTime), camera); weatherTime = elapsed;
    if (waterMat) { waterMat.uniforms.time.value = elapsed; waterMat.uniforms.cameraPos.value.copy(camera.position); foamMat.uniforms.time.value = elapsed; }
    vegetation.update?.(state, elapsed); landmarks.update?.(state, elapsed);
    tyreMarks.update(state, vehicle);
    if (shadowDirty || (state.elapsed !== lastShadowState && elapsed - lastShadowTime >= (shadowQuality === 'high' ? 1 / 60 : 1 / 30))) {
      const frame = shadowFrame(state, sunOffset, { extent: shadowExtent, resolution: sun.shadow.mapSize.x });
      sun.position.set(frame.light.x, frame.light.y, frame.light.z); sun.target.position.set(frame.target.x, frame.target.y, frame.target.z);
      sun.shadow.needsUpdate = true; lastShadowTime = elapsed; lastShadowState = state.elapsed; shadowDirty = false;
    }
  }, setQuality(level) {
    shadowQuality = level; shadowExtent = level === 'high' ? 72 : 56;
    const size = level === 'high' ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size && sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.shadow.mapSize.set(size, size);
    Object.assign(sun.shadow.camera, { left: -shadowExtent, right: shadowExtent, top: shadowExtent, bottom: -shadowExtent }); sun.shadow.camera.updateProjectionMatrix(); shadowDirty = true;
    vegetation.setQuality?.(level); landmarks.setQuality?.(level); weather.setQuality(level);
  }, dispose() {
    if (disposed) return; disposed = true;
    weather.dispose(); tyreMarks.dispose(); backdrop?.dispose();
    instances.forEach(instance => instance.dispose());
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
    sun.shadow.map?.dispose(); sun.shadow.mapPass?.dispose(); env.dispose();
    scene.environment = scene.background = null;
  } };
}
