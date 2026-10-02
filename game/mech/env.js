// 世界：真實天空（HDR 照明 + 高解析天空圖）、高度霧、地形與道路、城市、可踩倒的街道物件、碰撞查詢。
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFacade, FACADE_TILE } from './textures.js';
import { shopMaterial, shopUV } from './urban.js';
import { roofline } from './roofline.js';
import { streetfront } from './streetfront.js';
import { BATTLEFIELDS, fieldHeight, fieldLayout, routeDistance, fieldGridCoordinate, fieldGridIndex } from './battlefields.js';

import { fieldTreeGeometry, fieldShrubGeometry, fieldRockGeometry, fieldArchitecture, fieldLeafMaterial, fieldRadar, fieldGroundMask } from './fieldart.js';

const ASSET = './assets/';
const COMPACT = new URL('./zero/assets/env/', import.meta.url).href;
export const CITY = { block: 120, road: 14, walk: 18, half: 740 };
const SKY_ELEV_MIN = -10; // 天空圖裁到 -10°

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- 資源載入
export async function loadAssets(renderer, onProgress = () => {}, compact = true) {
  const tl = new THREE.TextureLoader();
  let done = 0; const total = 13 + FACADES.length * 3 + 4;
  const step = (x) => { done++; onProgress(done / total); return x; };
  const T = (name, srgb = false, rep = 1) => (compact ? tl.loadAsync(COMPACT + name.replace(/\.jpg$/, '.webp')).catch(() => tl.loadAsync(ASSET + name)) : tl.loadAsync(ASSET + name)).then((t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return step(t);
  });
  const hdrP = new RGBELoader().setDataType(THREE.FloatType).loadAsync(ASSET + 'env.hdr').then(step);
  const skyP = tl.loadAsync(ASSET + 'sky.jpg').then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return step(t); });
  const [hdr, sky, grassD, grassN, grassA, asphD, asphN, asphA, rubD, rubN, rockD, rockN, rockA] = await Promise.all([
    hdrP, skyP,
    T('grass_diff.jpg', true), T('grass_nor.jpg'), T('grass_arm.jpg'),
    T('asphalt_diff.jpg', true), T('asphalt_nor.jpg'), T('asphalt_arm.jpg'),
    T('rubble_diff.jpg', true), T('rubble_nor.jpg'),
    T('rock_diff.jpg', true), T('rock_nor.jpg'), T('rock_arm.jpg'),
  ]);
  const fac = await Promise.all(FACADES.map((f) => Promise.all([T(`fac_${f.name}_col.jpg`, true), T(`fac_${f.name}_nor.jpg`), T(`fac_${f.name}_arm.jpg`)])));
  const [wearM, wearN, frameM, frameN] = await Promise.all([T('wear_mask.jpg'), T('wear_nor.jpg'), T('frame_mask.jpg'), T('frame_nor.jpg')]);
  return { hdr, sky, grassD, grassN, grassA, asphD, asphN, asphA, rubD, rubN, rockD, rockN, rockA, fac, wearM, wearN, frameM, frameN };
}

// 照片立面：tile＝一張貼圖代表幾公尺；rows/cols＝窗格數（算亮燈用）
export const FACADES = [
  { name: 'glass', w: 36, h: 36, cols: 16, rows: 10, lit: 0.018 },
  { name: 'office', w: 28.8, h: 28.8, cols: 12, rows: 8, lit: 0.025 },
  { name: 'brick', w: 20.4, h: 20.4, cols: 6, rows: 6, lit: 0.05 },
  { name: 'concrete', w: 20.4, h: 20.4, cols: 6, rows: 6, lit: 0.04 },
  { name: 'brick2', w: 20.4, h: 20.4, cols: 6, rows: 6, lit: 0.05 },
];

// 從 HDR 找太陽方向（最亮像素），與 three.js 的 equirect 對應一致
function findSun(hdr) {
  const { width: w, height: h, data } = hdr.image;
  let best = -1, bi = 0, bj = 0;
  for (let j = 0; j < h / 2; j++) for (let i = 0; i < w; i++) {
    const p = (j * w + i) * 4;
    const L = data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722;
    if (L > best) { best = L; bi = i; bj = j; }
  }
  const u = (bi + 0.5) / w, v = 1 - (bj + 0.5) / h;
  const az = (u - 0.5) * Math.PI * 2, el = (v - 0.5) * Math.PI;
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
}

// 從天空圖取地平線顏色（給霧用），回傳線性色
function horizonColors(skyTex, sunDir, gain) {
  const img = skyTex.image;
  const W = 512, H = Math.round(512 * img.height / img.width);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
  const elev = 1.5;
  const row = Math.round((1 - (elev - SKY_ELEV_MIN) / (90 - SKY_ELEV_MIN)) * (H - 1));
  const d = x.getImageData(0, row, W, 1).data;
  const sunU = Math.atan2(sunDir.z, sunDir.x) / (Math.PI * 2) + 0.5;
  const all = [0, 0, 0], near = [0, 0, 0]; let nn = 0;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  for (let i = 0; i < W; i++) {
    const r = lin(d[i * 4]), g = lin(d[i * 4 + 1]), b = lin(d[i * 4 + 2]);
    all[0] += r; all[1] += g; all[2] += b;
    let du = Math.abs(i / W - sunU); du = Math.min(du, 1 - du);
    if (du < 0.04) { near[0] += r; near[1] += g; near[2] += b; nn++; }
  }
  const fog = new THREE.Color(all[0] / W, all[1] / W, all[2] / W).multiplyScalar(gain);
  const sunFog = new THREE.Color(near[0] / nn, near[1] / nn, near[2] / nn).multiplyScalar(gain);
  return { fog, sunFog };
}

// ---------------------------------------------------------------- 高度霧（改寫全域 fog chunk）
function installHeightFog(sunDir, sunFog) {
  const S = THREE.ShaderChunk;
  const v3 = (v) => `vec3(${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)})`;
  const c3 = (c) => `vec3(${c.r.toFixed(5)},${c.g.toFixed(5)},${c.b.toFixed(5)})`;
  S.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth;\n varying vec3 vFogWorld;\n#endif';
  S.fog_vertex = `#ifdef USE_FOG
    vFogDepth = - mvPosition.z;
    vec4 fogWP = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      fogWP = instanceMatrix * fogWP;
    #endif
    vFogWorld = ( modelMatrix * fogWP ).xyz;
  #endif`;
  S.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying float vFogDepth;
    varying vec3 vFogWorld;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear;
      uniform float fogFar;
    #endif
    #define FOG_SUN_DIR ${v3(sunDir)}
    #define FOG_SUN_COL ${c3(sunFog)}
    vec3 heightFog( vec3 col, vec3 wp ) {
      vec3 ray = wp - cameraPosition;
      float dist = length( ray );
      vec3 dir = ray / max( dist, 1e-3 );
      float hf = 0.0045;
      float h0 = max( cameraPosition.y, -20.0 );
      float dy = ray.y * hf;
      float t = abs( dy ) > 1e-4 ? ( 1.0 - exp( -dy ) ) / dy : 1.0;
      #ifdef FOG_EXP2
        float od = fogDensity * exp( -hf * h0 ) * t * dist;
      #else
        float od = fogDensity * dist;
      #endif
      float f = 1.0 - exp( -od );
      float s = pow( max( dot( dir, FOG_SUN_DIR ), 0.0 ), 7.0 );
      vec3 fc = mix( fogColor, FOG_SUN_COL, s );
      return mix( col, fc, clamp( f, 0.0, 1.0 ) );
    }
  #endif`;
  S.fog_fragment = `#ifdef USE_FOG
    gl_FragColor.rgb = heightFog( gl_FragColor.rgb, vFogWorld );
  #endif`;
}

// ---------------------------------------------------------------- 天空穹頂
function makeSkyDome(sky, sunDir, fog, sunFog, gain) {
  const geo = new THREE.SphereGeometry(1, 64, 32);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: sky }, gain: { value: gain }, sunDir: { value: sunDir.clone() },
      fogCol: { value: fog.clone() }, sunFog: { value: sunFog.clone() }, environmentCapture: { value: 0 },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform sampler2D map; uniform float gain, environmentCapture; uniform vec3 sunDir, fogCol, sunFog; varying vec3 vDir;
      #define PI 3.14159265
      void main(){
        vec3 d = normalize(vDir);
        float u = atan(d.z, d.x) / (2.0*PI) + 0.5;
        float el = asin(clamp(d.y,-1.0,1.0)) * 180.0 / PI;
        float v = clamp((el - (${SKY_ELEV_MIN.toFixed(1)})) / (90.0 - (${SKY_ELEV_MIN.toFixed(1)})), 0.002, 0.999);
        vec3 c = texture2D(map, vec2(u, v)).rgb * gain;
        float sd = max(dot(d, sunDir), 0.0);
        c += vec3(1.0,0.78,0.52) * (pow(sd, 1600.0) * 60.0 + pow(sd, 60.0) * 0.5);
        float s = pow(sd, 7.0);
        vec3 fc = mix(fogCol, sunFog, s);
        c = mix(c, fc, smoothstep(4.0, -2.0, el) * 0.9);
        c=mix(c,vec3(.045,.038,.027),environmentCapture*smoothstep(0.0,.35,-d.y));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthWrite: false, side: THREE.BackSide, fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.scale.setScalar(9000);
  m.frustumCulled = false;
  m.renderOrder = -1000;
  m.onBeforeRender = (r, s, cam) => m.position.copy(cam.position);
  return m;
}

// ---------------------------------------------------------------- 地形高度
const noise = new ImprovedNoise();
const MOUNTAIN_PEAKS = [
  [-3700, -2200, 1120, 1200, 950], [-1000, -4200, 800, 1100, 1050],
  [1700, -3400, 1250, 1250, 900], [4100, -800, 950, 900, 1400],
  [3500, 2900, 1120, 1200, 1000], [200, 4100, 780, 1000, 900],
  [-2800, 3600, 900, 1100, 900], [-4200, 900, 680, 950, 1150],
];
function fbm(x, z, oct, seed = 0) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise.noise(x * f, seed + i * 17.1, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = fbm(x / 900, z / 900, 3) * 60 + fbm(x / 260, z / 260, 2, 5) * 10;
  h *= smooth(820, 1250, r);
  const m = smooth(1500, 3300, r);
  // 彎曲主稜線與支稜，讓山谷接到山麓，避免等高的一圈尖丘。
  if (m > 0) {
    const wx = x + fbm(x / 1800, z / 1800, 2, 31) * 420;
    const wz = z + fbm(x / 1800, z / 1800, 2, 43) * 420;
    let mass = 0;
    for (const [px, pz, summit, rx, rz] of MOUNTAIN_PEAKS) {
      const dx = (wx - px) / rx, dz = (wz - pz) / rz;
      mass += summit * Math.exp(-(dx * dx + dz * dz));
    }
    const n = noise.noise(wx / 1050, 7.3, wz / 1050);
    const ridge = Math.max(0, (0.95 - Math.sqrt(n * n + 0.04)) / 0.75);
    const spur = fbm(wx / 420, wz / 420, 3, 21);
    h += m * (mass * (0.62 + ridge * ridge * 0.38) + ridge * ridge * 110 + spur * 85 * (1 - ridge * 0.7) + 45);
    const gullies=Math.abs(noise.noise(wx/290,17,wz/290));
    h+=m*smooth(150,650,mass)*(fbm(wx/180,wz/180,2,61)*110-gullies*95);
  }
  // 主幹道兩條往外延伸：路面整平
  const onRoad = Math.max(1 - smooth(20, 70, Math.abs(x)), 1 - smooth(20, 70, Math.abs(z)));
  if (onRoad > 0 && r > 700) h = THREE.MathUtils.lerp(h, h * 0.35, onRoad * (1 - m));
  return h;
}

class Terrain {
  constructor(size = 10000, seg = 320) {
    this.size = size; this.seg = seg; this.cell = size / seg;
    const n = seg + 1;
    this.h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -size / 2 + i * this.cell, z = -size / 2 + j * this.cell;
      this.h[j * n + i] = rawHeight(x, z);
    }
  }
  height(x, z) {
    const { size, seg, cell, h } = this;
    const n = seg + 1;
    const fx = fieldGridIndex(x, seg, size, this.detailed), fz = fieldGridIndex(z, seg, size, this.detailed);
    const i = Math.min(seg - 1, Math.max(0, Math.floor(fx))), j = Math.min(seg - 1, Math.max(0, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
    const ha = h[j * n + i], hb = h[(j + 1) * n + i], hc = h[(j + 1) * n + i + 1], hd = h[j * n + i + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }
  geometry() {
    const { size, seg, cell, h } = this;
    const n = seg + 1;
    const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, x = -size / 2 + i * cell, z = -size / 2 + j * cell;
      pos[k * 3] = x; pos[k * 3 + 1] = h[k]; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 15; uv[k * 2 + 1] = z / 15;
    }
    const idx = new Uint32Array(seg * seg * 6);
    let p = 0;
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * n + i, b = (j + 1) * n + i, c = (j + 1) * n + i + 1, d = j * n + i + 1;
      idx[p++] = a; idx[p++] = b; idx[p++] = d;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }
  backdropGeometry() {
    // 與原地形邊界逐點接合；遠山只用 12 圈網格，不增加碰撞或逐幀更新。
    const { size, seg } = this, count = seg * 4, rings = 12;
    const pos = new Float32Array((rings + 1) * (count + 1) * 3), uv = new Float32Array((rings + 1) * (count + 1) * 2);
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= count; i++) {
      const side = Math.floor((i % count) / seg), t = (i % seg) / seg * 2 - 1;
      const bx = [t, 1, -t, -1][side], bz = [-1, t, 1, -t][side];
      const half = size / 2 + j / rings * 4000, x = bx * half, z = bz * half;
      const edge = this.height(bx * size / 2, bz * size / 2);
      const n = noise.noise(x / 1550, 36.7, z / 1550);
      const ridge = Math.max(0, (0.95 - Math.sqrt(n * n + 0.025)) / 0.8);
      const far = 380 + ridge * ridge * 1450 + fbm(x / 550, z / 550, 3, 57) * 180 + noise.noise(x/240,17,z/240)*75;
      const h = THREE.MathUtils.lerp(edge, far, smooth(0, 1800, half - size / 2));
      const k = j * (count + 1) + i;
      pos.set([x, h, z], k * 3); uv.set([x / 15, z / 15], k * 2);
    }
    const idx = new Uint32Array(rings * count * 6); let p = 0;
    for (let j = 0; j < rings; j++) for (let i = 0; i < count; i++) {
      const a = j * (count + 1) + i, b = a + count + 1;
      idx.set([a, a + 1, b, a + 1, b + 1, b], p); p += 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    return g;
  }
}

// 地面材質：草地／岩壁／柏油路／人行道／空地，道路標線全部在 shader 裡算
function terrainMaterial(A) {
  const mat = new THREE.MeshStandardMaterial({
    map: A.grassD, normalMap: A.grassN, roughnessMap: A.grassA, aoMap: A.grassA,
    normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1, metalness: 0,
  });
  mat.userData.battlefield = { value: 0 };
  mat.userData.fieldMask = { value: null };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      battlefield: mat.userData.battlefield, fieldMask: mat.userData.fieldMask,
      surfaceAtlas:A.surfaceAtlas, surfaceReady:A.surfaceReady,
      asphD: { value: A.asphD }, asphN: { value: A.asphN }, asphA: { value: A.asphA },
      rubD: { value: A.rubD }, rubN: { value: A.rubN }, rockD: { value: A.rockD }, rockN: { value: A.rockN },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying vec3 vTN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTW = (modelMatrix * vec4(transformed,1.0)).xyz;\nvTN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D asphD, asphN, asphA, rubD, rubN, rockD, rockN, surfaceAtlas;
        uniform float surfaceReady;
        vec3 scanned(vec2 uv,vec2 tile){return texture2D(surfaceAtlas,tile+vec2(.008)+fract(uv)*.484).rgb;}
        uniform float battlefield; uniform sampler2D fieldMask;
        varying vec3 vTW; varying vec3 vTN;
        float th(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float tn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(th(i),th(i+vec2(1,0)),f.x), mix(th(i+vec2(0,1)),th(i+vec2(1,1)),f.x), f.y); }
        float tfbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*tn(p); p*=2.03; a*=0.5; } return s; }
        float aaLine(float d, float w){ float fw = fwidth(d) + 1e-4; return 1.0 - smoothstep(w - fw, w + fw, d); }
        // x: 路面, y: 人行道, z: 標線(白), w: 標線(黃)
        vec4 ground(vec2 p){
          float B = ${CITY.block.toFixed(1)}, R = ${CITY.road.toFixed(1)}, W = ${CITY.walk.toFixed(1)};
          vec2 c = p - B * floor(p / B + 0.5);
          vec2 ac = abs(c);
          float inCity = 1.0 - step(${CITY.half.toFixed(1)}, max(abs(p.x), abs(p.y)));
          float extX = step(abs(p.x), R), extZ = step(abs(p.y), R);
          float roadV = max(step(ac.x, R) * inCity, extX);   // 南北向
          float roadH = max(step(ac.y, R) * inCity, extZ);   // 東西向
          float road = max(roadV, roadH);
          float walk = (1.0 - road) * inCity * step(min(ac.x, ac.y), W);
          float inter = roadV * roadH;
          float white = 0.0, yellow = 0.0;
          // 南北向道路標線
          float lx = abs(p.x) < R ? p.x : c.x; float ly = p.y;
          float lz = abs(p.y) < R ? p.y : c.y; float lxx = p.x;
          float mV = roadV * (1.0 - inter), mH = roadH * (1.0 - inter);
          yellow += mV * (aaLine(abs(abs(lx) - 0.35), 0.12));
          yellow += mH * (aaLine(abs(abs(lz) - 0.35), 0.12));
          float dashV = step(fract(ly / 12.0), 0.5), dashH = step(fract(lxx / 12.0), 0.5);
          white += mV * dashV * aaLine(abs(abs(lx) - 6.8), 0.12);
          white += mH * dashH * aaLine(abs(abs(lz) - 6.8), 0.12);
          white += mV * aaLine(abs(abs(lx) - 13.2), 0.14);
          white += mH * aaLine(abs(abs(lz) - 13.2), 0.14);
          // 斑馬線（路口外側）
          float zc = inCity * roadV * (1.0 - roadH) * step(ac.y, W + 5.0) * step(W + 0.6, ac.y);
          white += zc * step(fract(c.x / 1.8), 0.5) * step(ac.x, R - 1.0);
          float zc2 = inCity * roadH * (1.0 - roadV) * step(ac.x, W + 5.0) * step(W + 0.6, ac.x);
          white += zc2 * step(fract(c.y / 1.8), 0.5) * step(ac.y, R - 1.0);
          return vec4(road, walk, clamp(white,0.0,1.0), clamp(yellow,0.0,1.0));
        }`)
      .replace('#include <map_fragment>', `
        vec4 G = battlefield < 0.5 ? ground(vTW.xz) : vec4(0.0);
        if (battlefield > 4.5 && battlefield < 5.5) {
          float runway = (1.0 - smoothstep(46.0, 48.0, abs(vTW.x + 420.0))) * (1.0 - smoothstep(880.0, 900.0, abs(vTW.z)));
          float line = aaLine(abs(vTW.x + 420.0), 0.7) * step(fract(vTW.z / 42.0), 0.55);
          line += aaLine(abs(abs(vTW.x + 420.0) - 42.0), 0.35);
          line += step(780.0,abs(vTW.z)) * step(fract((vTW.x + 420.0) / 5.0),0.45);
          G = vec4(runway, 0.0, runway * min(line,1.0), 0.0);
        }
        G *= 1.0 - smoothstep(1400.0, 2100.0, length(vTW.xz));
        vec3 grass = texture2D(map, vMapUv).rgb;
        vec3 grass2 = texture2D(map, vMapUv * 0.21 + 0.37).rgb;
        grass = mix(grass, grass2, 0.4);
        float macro = tfbm(vTW.xz / 260.0);
        float dry = tfbm(vTW.xz / 90.0 + 7.0);
        grass *= mix(0.72, 1.18, macro);
        grass = mix(grass, grass * vec3(1.18, 1.05, 0.72), smoothstep(0.45, 0.75, dry) * 0.6);
        vec3 terrainN = normalize(vTN);
        float slope = 1.0 - terrainN.y;
        float mountain = smoothstep(battlefield > 0.5 ? 650.0 : 1350.0, battlefield > 0.5 ? 1250.0 : 1950.0, length(vTW.xz));
        // 森林覆蓋由坡度與海拔決定，以貼圖表現樹冠，不建立數萬棵遠樹。
        float treeline = 0.0;
        if (mountain > 0.001) {
          float canopy = tn(vTW.xz / 8.0);
          float facing = dot(terrainN.xz, normalize(vec2(-.6,.8))) * .5 + .5;
          vec3 forest = mix(vec3(0.038,0.072,0.028), vec3(0.10,0.145,0.048), macro);
          forest *= mix(0.72, 1.28, canopy) * mix(.78,1.12,facing);
          forest = mix(forest,forest*vec3(1.2,1.08,.77),smoothstep(.52,.72,dry)*.35);
          float meadow = smoothstep(0.50, 0.72, dry) * (1.0 - smoothstep(0.08, 0.25, slope));
          forest = mix(forest, grass * vec3(0.62,0.72,0.42), meadow * 0.65);
          treeline = smoothstep(1050.0, 1580.0, vTW.y + (macro - 0.5) * 180.0);
          grass = mix(grass, mix(forest, grass * vec3(0.65,0.70,0.54), treeline), mountain);
        }
        vec3 rockW = pow(abs(terrainN), vec3(4.0)); rockW /= max(dot(rockW, vec3(1.0)), 0.001);
        vec3 rock = texture2D(rockD, vTW.xz / 38.0).rgb;
        if (mountain > 0.001 && slope > 0.08) rock = texture2D(rockD, vTW.zy / 38.0).rgb * rockW.x
          + rock * rockW.y + texture2D(rockD, vTW.xy / 38.0).rgb * rockW.z;
        if(surfaceReady>.5) {
          if(slope>.08) rock=mix(rock,scanned(vTW.zy/26.0,vec2(0.0))*rockW.x+scanned(vTW.xz/26.0,vec2(0.0))*rockW.y+scanned(vTW.xy/26.0,vec2(0.0))*rockW.z,.85);
          else if(battlefield>3.5 && battlefield<4.5) rock=mix(rock,scanned(vTW.xz/26.0,vec2(0.0)),.85);
        }
        // 冷灰岩壁、斜向岩層、雨水侵蝕紋；三面投影避免陡坡拉伸。
        float strata = sin(vTW.y * 0.095 + vTW.x * 0.018 + vTW.z * 0.012 + macro * 9.0) * 0.5 + 0.5;
        rock *= mix(vec3(0.42,0.46,0.49),vec3(.78,.81,.80),surfaceReady) * mix(0.90, 1.04, strata) * mix(0.86, 1.10, dry);
        rock *= 1.0 - smoothstep(.48,.70,dry) * smoothstep(.12,.42,slope) * .15;
        float rk = smoothstep(0.20, 0.48, slope + (macro - 0.5) * 0.14 + treeline * 0.14);
        if (battlefield > 3.5 && battlefield < 4.5) grass = mix(grass, texture2D(rubD, vTW.xz / 14.0).rgb * vec3(0.85,0.63,0.40), 0.85);
        if (battlefield > 1.5 && battlefield < 2.5) grass *= vec3(0.65,0.83,0.64);
        if (battlefield > 0.5) {
          vec3 soil=texture2D(rubD,vTW.xz/9.0).rgb;
          float bare=smoothstep(0.42,0.68,dry+tn(vTW.xz/18.0)*0.12);
          if (battlefield > 1.5 && battlefield < 2.5) grass=mix(grass,soil*vec3(0.46,0.41,0.29),bare*0.65);
          else if (battlefield > 3.5 && battlefield < 4.5) {
            grass=mix(soil*vec3(0.70,0.49,0.29),rock*vec3(1.35,0.97,0.63),bare);
            rock*=vec3(1.38,1.05,0.73);
            rk=max(rk,smoothstep(0.04,0.24,slope)*0.7);
          } else grass=mix(grass,soil*vec3(0.67,0.60,0.44),bare*0.48);
        }
        vec3 base = mix(grass, rock, rk);
        vec3 fieldGround = vec3(0.0);
        if(battlefield > 0.5) {
          vec2 maskUV=vTW.xz/2800.0+0.5;
          fieldGround=texture2D(fieldMask,maskUV).rgb*step(0.0,min(maskUV.x,maskUV.y))*step(max(maskUV.x,maskUV.y),1.0);
          float path=fieldGround.r*(.75+.25*tn(vTW.xz/3.0));
          vec3 dirt=texture2D(rubD,vTW.xz/7.0).rgb*vec3(.43,.40,.32);
          base=mix(base,dirt,max(path,fieldGround.g*.8));
          float mountainDetail=(.72+.28*tn(vTW.xz/110.0))*mix(.75,1.1,tn(vec2(vTW.y*.025,vTW.x*.007+vTW.z*.008)));
          base*=mix(1.0,mountainDetail,mountain);
        }
        vec3 asph = texture2D(asphD, vTW.xz / 7.0).rgb;
        float paved=(battlefield > 2.5 && battlefield < 3.5)||(battlefield > 4.5 && battlefield < 5.5)?max(fieldGround.r,fieldGround.g):0.0;
        if(surfaceReady>.5 && max(max(G.x,G.y),paved)>.001) asph=mix(asph,scanned(vTW.xz/1.8,vec2(.5,0.0))*.72,.8);
        asph *= mix(0.85, 1.12, tfbm(vTW.xz / 23.0));
        vec3 rub = texture2D(rubD, vTW.xz / 6.0).rgb;
        vec3 walkC = asph * 1.55 + 0.03;
        if(surfaceReady>.5 && G.y>.001) walkC=scanned(vTW.xz/3.0,vec2(.5,.5))*.85+.025;
        float tile = max(aaLine(abs(fract(vTW.x / 2.0) - 0.5) , 0.02), aaLine(abs(fract(vTW.z / 2.0) - 0.5), 0.02));
        walkC *= 1.0 - tile * 0.35;
        float inCity = 1.0 - smoothstep(${(CITY.half - 10).toFixed(1)}, ${(CITY.half + 40).toFixed(1)}, max(abs(vTW.x), abs(vTW.z)));
        vec3 lot = mix(rub * 0.9, grass * 0.8, smoothstep(0.35, 0.65, tfbm(vTW.xz / 30.0)));
        base = mix(base, lot, inCity * (1.0 - G.x) * (1.0 - G.y) * (1.0 - step(0.5, battlefield)));
        base=mix(base,asph*.82,paved*.9);
        base = mix(base, walkC, G.y);
        vec2 lane = mod(vTW.xz + 60.0, 120.0) - 60.0;
        float wheel = (1.0 - smoothstep(0.35, 1.1, abs(abs(lane.x) - 4.2))) + (1.0 - smoothstep(0.35, 1.1, abs(abs(lane.y) - 4.2)));
        float roadWear = smoothstep(0.3, 0.7, dry);
        float paintWear = 0.55 + 0.45 * smoothstep(0.2, 0.7, tn(vTW.xz * 2.0));
        G.zw *= paintWear;
        float roadDamp = smoothstep(.48,.63,dry) * (1.0-smoothstep(.42,.62,macro));
        vec3 roadC = asph * (1.0 - min(wheel, 1.0) * 0.12) * (1.0-roadDamp*.14);
        roadC = mix(roadC, vec3(0.62), G.z * 0.85 * (0.75 + 0.25 * tn(vTW.xz * 3.0)));
        roadC = mix(roadC, vec3(0.62, 0.45, 0.10), G.w * 0.8);
        base = mix(base, roadC, G.x);
        diffuseColor.rgb *= base;
        float isGrass = (1.0-paved) * (1.0 - G.x) * (1.0 - G.y) * (1.0 - inCity * 0.6 * (1.0 - step(0.5, battlefield)));
      `)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        if(battlefield > 0.5) {
          reflectedLight.indirectDiffuse*=1.0-fieldGround.b*.7;
          reflectedLight.indirectSpecular*=1.0-fieldGround.b*.5;
        }`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        float rG = texture2D(roughnessMap, vRoughnessMapUv).g;
        float rA = texture2D(asphA, vTW.xz / 7.0).g;
        roughnessFactor = mix(0.72 + rA * 0.28, mix(rG, 0.82 + strata * 0.12, rk), isGrass);
        roughnessFactor = mix(roughnessFactor, 0.46 + roadWear * 0.18, G.x * min(wheel, 1.0) * 0.7);
        roughnessFactor = mix(roughnessFactor, 0.55, G.z * 0.6);
        roughnessFactor = mix(roughnessFactor,.32,roadDamp*G.x*.65);
      `)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `
        vec3 nG = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        vec3 nA = texture2D( asphN, vTW.xz / 7.0 ).xyz * 2.0 - 1.0;
        vec3 nR = texture2D( rockN, vTW.xz / 38.0 ).xyz * 2.0 - 1.0;
        vec3 mapN = mix( mix(nG, nR, rk), nA * vec3(0.8,0.8,1.0), 1.0 - isGrass );
        if(battlefield > 0.5) {
          vec3 nSoil=texture2D(rubN,vTW.xz/7.0).xyz*2.0-1.0;
          mapN=mix(mapN,nSoil,max(fieldGround.r,fieldGround.g)*.75*(1.0-G.x)*(1.0-paved));
          mapN.xy*=.6;
        }
        mapN = mix( mapN, vec3(0.0,0.0,1.0), (G.z + G.w) * 0.8 );
      `)
      .replace('normal = normalize( tbn * mapN );', `
        normal = normalize( tbn * mapN );
        if (rk * mountain > 0.001) {
          vec3 nRX = texture2D(rockN, vTW.zy / 38.0).xyz * 2.0 - 1.0;
          vec3 nRZ = texture2D(rockN, vTW.xy / 38.0).xyz * 2.0 - 1.0;
          vec3 rockDetail = vec3(0.0, nRX.y, nRX.x) * rockW.x
            + vec3(nR.x, 0.0, nR.y) * rockW.y + vec3(nRZ.x, nRZ.y, 0.0) * rockW.z;
          vec3 rockNormal = normalize(terrainN + rockDetail * 0.30);
          vec3 rockView = normalize((viewMatrix * vec4(rockNormal, 0.0)).xyz);
          normal = normalize(mix(normal, rockView, rk * mountain * (1.0 - G.x)));
        }
      `)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        #ifdef USE_FOG
          // 高處仍有空氣散射：補足高度霧在山頂過薄、遠近山黏在一起的問題。
          float mountainAir = (1.0 - exp(-max(0.0,length(vTW - cameraPosition)-1800.0) * .00007)) * mountain;
          vec3 air = mix(vec3(0.43,0.51,0.59), FOG_SUN_COL, pow(max(dot(normalize(vTW - cameraPosition), FOG_SUN_DIR),0.0),7.0) * 0.55);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, air, mountainAir);
        #endif`);
  };
  return mat;
}

// ---------------------------------------------------------------- 建築幾何
class GeoBucket {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.b = []; this.s = []; }
  quad(a, b, c, d, n, uvs, col) {
    const base = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) { this.n.push(n[0], n[1], n[2]); this.c.push(col[0], col[1], col[2]); this.b.push(col[3] || 0); this.s.push(col[4] || 0); }
    for (const t of uvs) this.uv.push(t[0], t[1]);
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  geometry() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('burn', new THREE.Float32BufferAttribute(this.b, 1));
    g.setAttribute('surface', new THREE.Float32BufferAttribute(this.s, 1));
    g.setIndex(this.i);
    return g;
  }
}

// 倒塌後的瓦礫丘：單位圓盤（半徑 1、頂高 1）上起伏的土堆，平面著色
function moundGeometry() {
  const R = 6, S = 14, pos = [], uv = [];
  const hs = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
  const P = (ri, si) => {
    si %= S;
    if (ri === 0) return [0, 1, 0];
    const rho = ri / R, a = si / S * Math.PI * 2 + (ri % 2) * Math.PI / S;
    const rr = rho * (0.9 + 0.2 * hs(ri, si));
    const y = ri === R ? -0.2 : Math.pow(1 - rho * rho, 1.2) * (0.75 + 0.5 * hs(si + 7, ri));
    return [Math.cos(a) * rr, y, Math.sin(a) * rr];
  };
  const tri = (a, b, c) => { for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); uv.push(p[0] * 2.5, p[2] * 2.5); } };
  for (let s = 0; s < S; s++) tri(P(0, 0), P(1, s + 1), P(1, s));
  for (let r = 1; r < R; r++) for (let s = 0; s < S; s++) {
    const p00 = P(r, s), p01 = P(r, s + 1), p10 = P(r + 1, s), p11 = P(r + 1, s + 1);
    tri(p00, p11, p10); tri(p00, p01, p11);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// 四面牆（立面貼圖以公尺計）
function addWalls(B, x0, x1, z0, z1, y0, y1, col, uo, vo, tops = null, F = FACADE_TILE) {
  const fw = F.w, fh = F.h;
  const walls = [
    [[x0, z1], [x1, z1], [0, 0, 1]],
    [[x1, z1], [x1, z0], [1, 0, 0]],
    [[x1, z0], [x0, z0], [0, 0, -1]],
    [[x0, z0], [x0, z1], [-1, 0, 0]],
  ];
  let u = uo;
  walls.forEach(([a, b, n], wi) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!tops) {
      B.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], n,
        [[u, (y0 / fh) + vo], [u + len / fw, (y0 / fh) + vo], [u + len / fw, (y1 / fh) + vo], [u, (y1 / fh) + vo]], col);
    } else {
      // 殘破頂部：切段、每段不同高度
      const segs = tops[wi];
      for (let s = 0; s < segs.length; s++) {
        const t0 = s / segs.length, t1 = (s + 1) / segs.length;
        const ax = a[0] + (b[0] - a[0]) * t0, az = a[1] + (b[1] - a[1]) * t0;
        const bx = a[0] + (b[0] - a[0]) * t1, bz = a[1] + (b[1] - a[1]) * t1;
        const ya = segs[s], yb = segs[Math.min(segs.length - 1, s + 1)] * 0.5 + segs[s] * 0.5;
        B.quad([ax, y0, az], [bx, y0, bz], [bx, yb, bz], [ax, ya, az], n,
          [[u + len * t0 / fw, y0 / fh + vo], [u + len * t1 / fw, y0 / fh + vo], [u + len * t1 / fw, yb / fh + vo], [u + len * t0 / fw, ya / fh + vo]], col);
      }
    }
    u += len / fw;
  });
}
function addBox(B, x0, x1, y0, y1, z0, z1, col, uvScale = 8) {
  // 簡單方塊（屋頂設備、女兒牆）；世界座標 UV
  const s = 1 / uvScale;
  B.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 * s, z1 * s], [x1 * s, z1 * s], [x1 * s, z0 * s], [x0 * s, z0 * s]], col);
  const sides = [
    [[x0, z1], [x1, z1], [0, 0, 1]], [[x1, z1], [x1, z0], [1, 0, 0]],
    [[x1, z0], [x0, z0], [0, 0, -1]], [[x0, z0], [x0, z1], [-1, 0, 0]],
  ];
  for (const [a, b, n] of sides) {
    const la = (n[0] ? a[1] : a[0]) * s, lb = (n[0] ? b[1] : b[0]) * s;
    B.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], n, [[la, y0 * s], [lb, y0 * s], [lb, y1 * s], [la, y1 * s]], col);
  }
}

// 立面細節仍寫進同一棟的合併區段：沒有額外材質／draw call，倒塌時跟著樓體一起消失。
function architecture(B, signs, x0, x1, z0, z1, H, style, F, district, roofTop, crown = [x0, x1, z0, z1], exposed = [true, true, true, true]) {
  const stone = style < 2 ? [0.48, 0.5, 0.52, 0, 1] : [0.72, 0.69, 0.63, 0, 1], steel = [0.12, 0.15, 0.17, 0, 2];
  const glass = [0.055, 0.095, 0.11, 0, 4];
  const floor = F.h / F.rows, bay = F.w / F.cols;
  const sides = [['x', z1, 1, x0, x1], ['x', z0, -1, x0, x1], ['z', x1, 1, z0, z1], ['z', x0, -1, z0, z1]];
  const asian = style >= 2 && x0 > 120 && z0 < 240;
  for (const [si, [axis, fix, out, a0, a1]] of sides.entries()) {
    const box = (lo, hi, y0, y1, d0, d1, c) => {
      const p = fix + out * d0, q = fix + out * d1;
      if (axis === 'x') addBox(B, lo, hi, y0, y1, Math.min(p, q), Math.max(p, q), c, 4);
      else addBox(B, Math.min(p, q), Math.max(p, q), y0, y1, lo, hi, c, 4);
    };
    // 樓板邊、窗台與垂直分格產生真實的側光和遮蔭，不再只靠照片上的陰影。
    for (let y = floor; y < H - 0.3; y += floor * (style < 2 ? 2 : 1)) {
      box(a0, a1, y - 0.12, y + 0.08, 0, style < 2 ? 0.18 : 0.32, stone);
    }
    const step = style < 2 ? bay * 3 : bay * 2;
    for (let a = a0 + step; a < a1 - 1; a += step) box(a - 0.12, a + 0.12, 0.3, H, 0, 0.24, stone);
    box(a0, a1, 0.05, 0.65, 0, 0.22, [0.38, 0.36, 0.33, 0, 1]);
    box(a0 - 0.2, a1 + 0.2, H - 0.35, H, 0, 0.4, stone);
    // 相鄰地塊的窄樓縫只留貼牆線腳，不放相向的陽台、梯架、店棚與招牌。
    if (!exposed[si]) continue;
    const point = (a, y, d) => axis === 'x' ? [a, y, fix + out * d] : [fix + out * d, y, a];
    const face = (pts, c) => {
      const n = new THREE.Vector3().subVectors(new THREE.Vector3(...pts[1]), new THREE.Vector3(...pts[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...pts[2]), new THREE.Vector3(...pts[0]))).normalize();
      if ((Math.abs(n.y) > 0.5 ? n.y : (axis === 'x' ? n.z : n.x) * out) < 0) { pts.reverse(); n.negate(); }
      B.quad(...pts, n.toArray(), [[0, 0], [1, 0], [1, 1], [0, 1]], c);
    };
    // 每面最多三個店面：真正的拱圈、玻璃、門框與遮陽棚，併在既有屋頂桶。
    const shops = Math.min(3, Math.floor((a1 - a0 - 2) / 7));
    if (style >= 2 && H < 32 && shops) streetfront(a0, a1, asian, box);
    for (let i = 0; i < shops; i++) {
      const a = a0 + (a1 - a0) * (i + 0.5) / shops, rad = 1.35;
      const arch = !asian && (style === 2 || style === 4);
      const y = arch ? 1.75 : 2.8;
      face([point(a - rad, 0.7, 0.035), point(a + rad, 0.7, 0.035), point(a + rad, y, 0.035), point(a - rad, y, 0.035)], glass);
      box(a - rad - 0.14, a - rad, 0.65, y, 0.03, 0.23, stone);
      box(a + rad, a + rad + 0.14, 0.65, y, 0.03, 0.23, stone);
      box(a - 0.03, a + 0.03, 0.7, y, 0.04, 0.13, steel);
      // 門檻、橫框與分離把手，在街層產生實際側光，不是照片上的線。
      if(H<45) {
        box(a-rad,a+rad,.65,.72,.04,.3,stone);
        box(a-rad,a+rad,1.98,2.04,.04,.15,steel);
        box(a+.09,a+.13,1.05,1.42,.15,.22,steel);
      }
      if (arch) {
        for (let k = 0; k < 8; k++) {
          const t0 = k * Math.PI / 8, t1 = (k + 1) * Math.PI / 8;
          const p = (r, t, d) => point(a + Math.cos(t) * r, y + Math.sin(t) * r, d);
          face([point(a, y, 0.035), p(rad, t0, 0.035), p(rad, t1, 0.035), point(a, y, 0.035)], glass);
          face([p(rad, t0, 0.24), p(rad + 0.18, t0, 0.24), p(rad + 0.18, t1, 0.24), p(rad, t1, 0.24)], stone);
        }
        if (i === 1) {
          for (let stripe=0;stripe<8;stripe++) {
            const lo=a-1.7+stripe*.425,hi=lo+.425,cloth=stripe%2?[.75,.7,.58,0,5]:[.16,.25,.22,0,5];
            for(let k=0;k<3;k++) {
              const t0=k/3,t1=(k+1)/3;
              face([point(lo,3.4-.46*t0*t0,.1+1.25*t0),point(hi,3.4-.46*t0*t0,.1+1.25*t0),point(hi,3.4-.46*t1*t1,.1+1.25*t1),point(lo,3.4-.46*t1*t1,.1+1.25*t1)],cloth);
            }
            face([point(lo,2.78,1.35),point(hi,2.78,1.35),point(hi,2.94,1.35),point(lo,2.94,1.35)],cloth);
          }
        }
      } else box(a - rad, a + rad, y, y + 0.12, 0.03, 0.23, steel);
      if (asian) {
        // 日式店面：木格子與分片暖簾保留門口的尺度，細節只在面向街道的立面。
        const wood = [0.26, 0.19, 0.14, 0, 1], cloth = [0.22, 0.29, 0.34, 0, 5];
        for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
          const lo = a + side * (rad + .25 + k * .18);
          box(lo - .025, lo + .025, .7, 2.65, .04, .09, wood);
        }
        box(a - 2.3, a + 2.3, 2.68, 2.78, 0, .18, wood);
        for (let k = 0; k < 3; k++) {
          const lo = a - rad + k * .9;
          face([point(lo, 2.08, .2), point(lo + .85, 2.08, .2), point(lo + .85, 2.68, .2), point(lo, 2.68, .2)], cloth);
        }
      }
    }
    if (style < 2) {
      // 街層雨棚；突出量保持在人行道內。
      const mid = (a0 + a1) / 2, w = Math.min(8, (a1 - a0) * 0.32);
      box(mid - w, mid + w, 3.15, 3.38, 0, 1.8, steel);
      for (const a of [mid - w + 0.3, mid + w - 0.3]) box(a - 0.12, a + 0.12, 0, 3.2, 1.5, 1.74, steel);
    } else {
      // 住宅陽台：只做近地面的三層，遠處沿用原立面，幾何量不隨樓高暴增。
      for (let y = floor * 2; y < Math.min(H - 1, floor * 4); y += floor) {
        for (let a = a0 + 5; a < a1 - 3; a += 12) {
          const lo = a - 1.8, hi = Math.min(a1 - 0.5, a + 1.8);
          box(lo, hi, y - 0.18, y, 0, 1.05, stone);
          for (const h of [0.42, 0.95]) box(lo, hi, y + h, y + h + 0.06, 0.99, 1.05, steel);
          for (let p = lo; p <= hi; p += 1.2) box(p, p + 0.045, y, y + 1, 0.99, 1.05, steel);
          for (const p of [lo, hi - 0.05]) box(p, p + 0.05, y + 0.95, y + 1.01, 0.02, 1.05, steel);
        }
      }
      if (asian) {
        // 住宅街的外掛冷氣與窗上遮陽板；公尺尺度，沒有放大的裝飾。
        for (let y = floor + 0.4; y < Math.min(H - 1, floor * 4); y += floor) for (let a = a0 + 4; a < a1 - 2; a += 9) {
          box(a - 0.45, a + 0.45, y, y + 0.6, 0, 0.45, [0.62, 0.64, 0.62, 0, 2]);
          for (let k = 0; k < 4; k++) box(a - 0.3, a + 0.3, y + 0.12 + k * 0.09, y + 0.15 + k * 0.09, 0.45, 0.46, steel);
        }
      }
    }
    if (style >= 2) {
      const mid = (a0 + a1) / 2, idx = asian ? 4 + (Math.abs(Math.round(a0)) % 2) : Math.abs(Math.round(a0 + fix)) % 4;
      const lo = asian ? mid + 2 : mid - 2.8, hi = asian ? mid + 3.2 : mid + 2.8, y0 = asian ? 3.6 : 2.9, y1 = asian ? 7.2 : 4.1;
      const d = asian ? 0.6 : 0.18;
      box(lo - 0.08, hi + 0.08, y0 - 0.08, y1 + 0.08, 0, d, steel);
      const p = (a, y) => axis === 'x' ? [a, y, fix + out * (d + 0.012)] : [fix + out * (d + 0.012), y, a];
      const uv = shopUV(idx), pts = [p(lo, y0), p(hi, y0), p(hi, y1), p(lo, y1)];
      // 正面頂點朝向 +Z／-X，其餘面反轉繞序。
      if (axis === 'x' ? out < 0 : out > 0) { pts.reverse(); uv.reverse(); }
      signs.quad(...pts, axis === 'x' ? [0, 0, out] : [out, 0, 0], uv, [0.85, 0.85, 0.85]);
    }
    // 少數磚街屋的側面消防梯；階梯為斜面，併入原可破壞樓體。
    if(style===2&&axis==='z'&&out===1&&H<32&&Math.abs(Math.round(x0+z0))%4===0) {
      const mid=(a0+a1)/2;
      for(let y=floor*2;y<Math.min(H-1,floor*5);y+=floor) {
        box(mid-2.1,mid+2.1,y-.12,y,0,1.1,steel);
        box(mid-2.1,mid+2.1,y+.85,y+.92,.99,1.05,steel);
        for(const a of [mid-2.1,mid,mid+2.1])box(a-.05,a+.05,y,y+.9,.99,1.05,steel);
        face([point(mid-2,y,.4),point(mid+2,y-floor,.4),point(mid+2,y-floor,1.1),point(mid-2,y,1.1)],steel);
      }
    }
  }
  // 街屋的山牆、工廠鋸齒屋頂與退縮冠頂皆併入原本可破壞的屋頂區段。
  const kind = H >= 45 ? 'tower' : district === 'old' || district === 'mixed' && style !== 3 ? 'old' : district === 'east' ? 'east' : 'industrial';
  roofline(...crown, roofTop, kind, (a, b, c, d, col) => {
    const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a))).normalize();
    const axes = Math.abs(n.y) > 0.5 ? [0, 2] : Math.abs(n.x) > 0.5 ? [2, 1] : [0, 1];
    B.quad(a, b, c, d, n.toArray(), [a, b, c, d].map(p => [p[axes[0]] / 4, p[axes[1]] / 4]), col);
  }, (a, b, c, d, e, f, col) => addBox(B, a, b, c, d, e, f, col, 4));
}
function roofTank(B, x, z, y, radius, h) {
  const col = [0.56, 0.58, 0.56, 0, 2], N = 12;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, b = (i + 1) / N * Math.PI * 2;
    const p = [x + Math.cos(a) * radius, z + Math.sin(a) * radius], q = [x + Math.cos(b) * radius, z + Math.sin(b) * radius];
    B.quad([q[0], y, q[1]], [p[0], y, p[1]], [p[0], y + h, p[1]], [q[0], y + h, q[1]], [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)], [[b, 0], [a, 0], [a, h / 3], [b, h / 3]], col);
    B.quad([x, y + h, z], [q[0], y + h, q[1]], [p[0], y + h, p[1]], [p[0], y + h, p[1]], [0, 1, 0], [[0.5, 0.5], [1, 0], [0, 0], [0, 0]], col);
  }
}

// 照片立面＋隨機亮燈窗＋煙燻／雨痕／燒焦
function buildingMaterial(A, fi) {
  const F = FACADES[fi], [col, nor, arm] = A.fac[fi];
  const m = new THREE.MeshStandardMaterial({
    map: col, normalMap: nor, aoMap: arm, roughnessMap: arm, roughness: 1, metalness: 0.0,
    aoMapIntensity: 1.0, vertexColors: true, envMapIntensity: 0.75,
    emissive: new THREE.Color(1.0, 0.62, 0.3), emissiveIntensity: 1,
  });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float burn; varying float vBurn; varying vec3 vBW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvBurn = burn; vBW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vBurn; varying vec3 vBW;
        float bh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float bn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(bh(i),bh(i+vec2(1,0)),f.x), mix(bh(i+vec2(0,1)),bh(i+vec2(1,1)),f.x), f.y); }
        float bf(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*bn(p); p*=2.07; a*=0.5; } return s; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float hz = vBW.x + vBW.z;
        // 雨痕：沿牆往下的深色條紋
        float streak = bn(vec2(hz * 0.9, vBW.y * 0.035)) * bn(vec2(hz * 3.1, vBW.y * 0.02));
        float grime = smoothstep(0.25, 0.7, streak) * 0.35;
        grime += (1.0 - smoothstep(0.0, 7.0, vBW.y)) * 0.35;               // 地面噴濺
        float soot = vBurn * smoothstep(0.35, 0.65, bf(vec2(hz, vBW.y) / 11.0) + vBurn * 0.25);
        diffuseColor.rgb *= (1.0 - grime) * mix(1.0, 0.12, soot);
        float bfac = soot;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float winMask = 1.0 - smoothstep(0.25, 0.55, texelRoughness.g);
        vec2 paneCell = floor(vMapUv * vec2(${F.cols.toFixed(1)}, ${F.rows.toFixed(1)}));
        vec2 paneUV = fract(vMapUv * vec2(${F.cols.toFixed(1)}, ${F.rows.toFixed(1)}));
        float blind = step(0.58, bh(paneCell + 4.3)) * (1.0 - smoothstep(0.28, 0.75, paneUV.y));
        float room = 0.75 + 0.25 * bh(paneCell + 1.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * room + vec3(0.035, 0.032, 0.024) * blind, winMask * (1.0 - bfac));
        roughnessFactor = mix(roughnessFactor, 0.2 + 0.18 * bh(paneCell), winMask * (1.0 - bfac));
        roughnessFactor = mix(roughnessFactor, 0.95, bfac);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = winMask * (1.0 - bfac) * 0.28;`)
      .replace('#include <emissivemap_fragment>', `
        vec2 cell = floor(vMapUv * vec2(${F.cols.toFixed(1)}, ${F.rows.toFixed(1)}));
        float hsh = bh(cell * 1.37);
        float lit = step(hsh, ${F.lit.toFixed(3)}) * (1.0 - vBurn);
        float fire = step(0.93, hsh) * vBurn * (0.7 + 0.3 * bn(vec2(cell.x * 3.0, cell.y * 3.0)));
        vec3 wc = mix(vec3(1.0, 0.62, 0.3), vec3(0.95, 0.85, 0.7), step(0.7, bh(cell + 3.1)));
        totalEmissiveRadiance = (wc * lit * 0.25 + vec3(3.0, 0.9, 0.2) * fire) * winMask * (0.4 + 0.6 * bh(cell + 9.7));`);
  };
  m.customProgramCacheKey = () => 'facade-' + fi + '-v3';
  patchGroundAO(m);
  return m;
}
// 線腳、設備、店窗共用原屋頂材質與柏油細節；surface 頂點欄位區分材質，沒有新增貼圖或 draw call。
function architecturalMaterial(A) {
  const m = new THREE.MeshStandardMaterial({ map: A.asphD, normalMap: A.asphN, roughness: 0.95, vertexColors: true, color: 0xa8a49c });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms,{surfaceAtlas:A.surfaceAtlas,surfaceReady:A.surfaceReady});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float surface; varying float vSurface; varying vec3 vAW; varying vec3 vAN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface = surface; vAW = (modelMatrix * vec4(transformed,1.0)).xyz; vAN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSurface; varying vec3 vAW; varying vec3 vAN; uniform sampler2D surfaceAtlas; uniform float surfaceReady;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (vSurface > 0.5) {
          float grain = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb /= max(sampledDiffuseColor.rgb, vec3(0.005));
          diffuseColor.rgb *= 0.88 + grain * 0.3;
          if(surfaceReady>.5 && vSurface<2.5) {
            vec2 surfaceUV=abs(vAN.y)>.5?vAW.xz:vec2(abs(vAN.x)>.5?vAW.z:vAW.x,vAW.y);
            vec2 tile=vSurface<1.5?vec2(.5,.5):vec2(0.0,.5);
            vec3 scan=texture2D(surfaceAtlas,tile+vec2(.008)+fract(surfaceUV/(vSurface<1.5?4.0:5.0))*.484).rgb;
            diffuseColor.rgb*=mix(vec3(1.0),scan*1.75,vSurface<1.5?.8:.9);
          }
          if (vSurface > 2.5 && vSurface < 3.5) {
            float tile = max(step(0.94, fract(vAW.z / 0.38)), step(0.92, fract(vAW.x / 0.24)));
            diffuseColor.rgb *= 1.0 - tile * 0.24;
          }
          if (vSurface > 3.5 && vSurface < 4.5) {
            float along = abs(vAN.x) > 0.5 ? vAW.z : vAW.x;
            float shelf = step(0.92, fract(vAW.y / 0.6)) * step(0.4, fract(along / 1.1));
            diffuseColor.rgb += vec3(0.025, 0.018, 0.009) * shelf;
          }
          diffuseColor.rgb *= mix(0.76, 1.0, smoothstep(0.1, 1.3, vAW.y));
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (vSurface > 0.5) roughnessFactor = vSurface < 1.5 ? 0.78 : vSurface < 2.5 ? 0.4 : vSurface < 3.5 ? 0.86 : vSurface < 4.5 ? 0.18 : 0.94;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = vSurface > 1.5 && vSurface < 2.5 ? 0.68 : vSurface > 3.5 && vSurface < 4.5 ? 0.15 : 0.0;`)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        if (vSurface > 0.5) mapN.xy *= vSurface > 3.5 && vSurface < 4.5 ? 0.03 : 0.2;`);
  };
  m.customProgramCacheKey = () => 'architecture-v2';
  patchGroundAO(m);
  return m;
}
function patchGroundAO(m, k = 16) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wyp = vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          wyp = instanceMatrix * wyp;
        #endif
        vWY = (modelMatrix * wyp).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float gao = mix(0.42, 1.0, smoothstep(0.0, ${k.toFixed(1)}, vWY));
        reflectedLight.indirectDiffuse *= gao; reflectedLight.directDiffuse *= mix(0.75, 1.0, gao);`);
  };
}

// ---------------------------------------------------------------- 樹、車、路燈（可被踩倒）
function treeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.25, 0.4, 5, 6).translate(0, 2.5, 0);
  const parts = [trunk];
  const r = rng(5);
  for (let k = 0; k < 3; k++) {
    const g = new THREE.IcosahedronGeometry(2.6 - k * 0.5, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = 1 + noise.noise(p.getX(i) * 0.7, p.getY(i) * 0.7 + k * 7, p.getZ(i) * 0.7) * 0.18;
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.85, p.getZ(i) * s);
    }
    g.translate((r() - 0.5) * 1.2, 5.5 + k * 1.6, (r() - 0.5) * 1.2);
    parts.push(g);
  }
  const nonIdx = parts.map((g) => g.index ? g.toNonIndexed() : g);
  const cols = [];
  nonIdx.forEach((g, i) => {
    const n = g.attributes.position.count;
    const c = i === 0 ? [0.25, 0.18, 0.12] : [0.2 + i * 0.03, 0.3 + i * 0.03, 0.12];
    for (let k = 0; k < n; k++) cols.push(...c);
  });
  let m = mergeGeometries(nonIdx);
  m.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  m = mergeVertices(m); m.computeVertexNormals();
  return m;
}

export function carGeometry() {
  // 轎車：側面輪廓擠出（車身）＋較窄的車艙（深色玻璃）＋車頂＋輪胎
  const ext = (pts, w, bev, col) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: w - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -(w - bev * 2) / 2);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set(col, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const body = ext([[-2.2, 0.32], [2.15, 0.32], [2.28, 0.55], [2.22, 0.8], [1.2, 0.95], [-1.5, 0.98], [-2.22, 0.9], [-2.3, 0.6]], 1.78, 0.1, [1, 1, 1]);
  const cab = ext([[-1.55, 0.92], [1.05, 0.92], [0.35, 1.38], [-0.95, 1.4]], 1.52, 0.06, [0.035, 0.04, 0.045]);
  const roof = ext([[-0.98, 1.36], [0.4, 1.34], [0.32, 1.45], [-0.9, 1.46]], 1.46, 0.04, [1, 1, 1]);
  const parts = [body, cab, roof];
  for (const [x, z] of [[1.35, 0.8], [-1.35, 0.8], [1.35, -0.8], [-1.35, -0.8]]) {
    const w = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14).rotateX(Math.PI / 2).translate(x, 0.34, z).toNonIndexed();
    w.deleteAttribute('uv');
    const c = new Float32Array(w.attributes.position.count * 3).fill(0.03);
    w.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(w);
  }
  const m = mergeGeometries(parts);
  m.computeVertexNormals();
  return m;
}

function lampGeometry() {
  const pole = new THREE.CylinderGeometry(0.12, 0.2, 10, 6).translate(0, 5, 0);
  const arm = new THREE.BoxGeometry(0.15, 0.15, 2.4).translate(0, 9.9, 1.1);
  const head = new THREE.BoxGeometry(0.5, 0.2, 0.9).translate(0, 9.8, 2.2);
  return mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed(), head.toNonIndexed()]);
}

// 高壓電塔（城外，尺度參照）
function pylonGeometry() {
  const parts = [];
  const H = 46;
  const leg = (x0, z0, x1, z1, y0, y1, t = 0.35) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(t, len, t);
    const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 0, 1));
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    g.applyMatrix4(m);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(g.toNonIndexed());
  };
  const w = (y) => THREE.MathUtils.lerp(5, 1.2, y / H);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) leg(sx * w(0), sz * w(0), sx * w(H), sz * w(H), 0, H, 0.5);
  for (let y = 0; y < H - 4; y += 6) {
    const a = w(y), b = w(y + 6);
    for (const [sx, sz, ex, ez] of [[1, 1, -1, 1], [1, -1, -1, -1], [1, 1, 1, -1], [-1, 1, -1, -1]]) {
      leg(sx * a, sz * a, ex * b, ez * b, y, y + 6, 0.2);
      leg(ex * a, ez * a, sx * b, sz * b, y, y + 6, 0.2);
    }
  }
  for (const y of [30, 38, 44]) leg(-9 + (y - 30) * 0.3, 0, 9 - (y - 30) * 0.3, 0, y, y, 0.45);
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------- 世界
export class World {
  constructor(renderer, scene, A, { terrainSegments = 160, city = true } = {}) {
    this.cityEnabled = city;
    this.scene = scene;
    this.renderer = renderer;
    this.A = A;
    // 四種建材共用一張 1024 貼圖；非同步載入，不等待新貼圖才顯示標題。
    A.surfaceAtlas={value:A.asphD};A.surfaceReady={value:0};
    new THREE.TextureLoader().load(new URL('./assets/field-surfaces-v1.webp',import.meta.url).href,texture=>{
      const c=document.createElement('canvas');c.width=c.height=1024;c.getContext('2d').drawImage(texture.image,0,0,1024,1024);
      texture.image=c;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.needsUpdate=true;
      A.surfaceAtlas.value=texture;A.surfaceReady.value=1;
    },undefined,()=>{});
    this.boxes = [];          // {x0,x1,z0,z1,top}
    this.grid = new Map();    // 空間格
    this.cellSize = 60;
    this.trample = [];        // 可被踩倒的物件
    this.smokeSites = [];
    this.fireSites = [];
    this.lampSites = [];

    // 天空與光
    this.sunDir = findSun(A.hdr);
    // 光線用的太陽稍微拉高，讓城市不全在陰影裡（天空圖上的太陽位置不變）
    const el = Math.asin(this.sunDir.y);
    const lightEl = Math.max(el, THREE.MathUtils.degToRad(18));
    const az = Math.atan2(this.sunDir.z, this.sunDir.x);
    this.lightDir = new THREE.Vector3(Math.cos(az) * Math.cos(lightEl), Math.sin(lightEl), Math.sin(az) * Math.cos(lightEl));
    this.skyGain = 1.25;
    const { fog, sunFog } = horizonColors(A.sky, this.sunDir, this.skyGain);
    this.fogColor = fog; this.sunFogColor = sunFog;
    installHeightFog(this.sunDir, sunFog);
    scene.fog = new THREE.FogExp2(fog, 0.00042);

    const pm = new THREE.PMREMGenerator(renderer);
    A.hdr.mapping = THREE.EquirectangularReflectionMapping;
    this.envMap = pm.fromEquirectangular(A.hdr).texture;
    pm.dispose();
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.55;
    this.skyDome=makeSkyDome(A.sky, this.sunDir, fog, sunFog, this.skyGain);
    scene.add(this.skyDome);this.cityLightDir=this.lightDir.clone();

    const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.9, 0.77), 3.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    sc.left = -260; sc.right = 260; sc.top = 260; sc.bottom = -260; sc.near = 10; sc.far = 2400;
    sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.08;
    sun.shadow.autoUpdate = false;   // 影子圖每兩格重畫一次（followShadow 裡開關），省一半顯示卡工
    scene.add(sun, sun.target);
    this.sun = sun;
    const hemi = new THREE.HemisphereLight(0x7f98c0, 0x3a2e24, 0.28);
    scene.add(hemi); this.hemi=hemi;

    // 地形
    this.terrain = new Terrain(10000, terrainSegments);
    const tmesh = new THREE.Mesh(this.terrain.geometry(), terrainMaterial(A));
    tmesh.receiveShadow = true;
    scene.add(tmesh);
    this.terrainMesh = tmesh;
    const mountains = new THREE.Mesh(this.terrain.backdropGeometry(), tmesh.material);
    mountains.userData.noAO = true;
    scene.add(mountains); this.mountainMesh = mountains;

    const before = new Set(scene.children);
    if (city) {
      this.buildCity();
      let facadePending=3;
      const facadeDone=()=>{this.cityFacadeReady=--facadePending===0;};
      for(const [i,name] of [[2,'city-brick-v2'],[3,'city-stone-v2'],[4,'city-piers-v2']])new THREE.TextureLoader().load(new URL('./assets/'+name+'.webp',import.meta.url).href,texture=>{
        const c=document.createElement('canvas');c.width=c.height=512;c.getContext('2d').drawImage(texture.image,0,0,512,512);
        texture.image=c;texture.name=name;texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
        texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;
        const old=A.fac[i][0];A.fac[i][0]=texture;this.cityFacadeMaterials[i].map=texture;old.dispose();facadeDone();
      },undefined,facadeDone);
      this.buildProps();
    } else {
      this._initBlds(); this._indexTrample();
      this.dummy = new THREE.Object3D(); this.falling = [];
      this.cityTreeMeshes = []; this.fieldFoliageReady = this.cityFacadeReady = true;
    }
    this.cityObjects = scene.children.filter(o => !before.has(o) && ![this.mound, this.pile, this.chunkM].includes(o));
    this.cityState = { boxes: [...this.boxes], blds: this.blds, trample: this.trample, smokeSites: this.smokeSites, fireSites: this.fireSites, lampSites: this.lampSites };
    this.cityHeights = this.terrain.h.slice();
    this.battlefield = 'city';
  }

  setBattlefield(profile = 'city', route = null) {
    if (!BATTLEFIELDS[profile] || !route) profile = 'city';
    if (this.battlefield === profile && (profile === 'city' || this.fieldRoute === route)) return;
    this.resetBuildings();
    if (this.fieldGroup) {
      this.fieldGroup.traverse(o => { if (o.userData.fieldGeometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
      this.fieldGroup.removeFromParent(); this.fieldGroup = null;
    }
    this.battlefield = profile; this.fieldRoute = route;
    const F = BATTLEFIELDS[profile], layout = F.mode ? fieldLayout(profile, route) : null;
    const terrainRoute = layout ? { ...route, pads: layout.structures } : null;
    const T = this.terrain, p = this.terrainMesh.geometry.attributes.position, uv = this.terrainMesh.geometry.attributes.uv;
    T.detailed = !!F.mode;
    for (let i = 0; i < T.h.length; i++) {
      const x = fieldGridCoordinate(i % (T.seg + 1), T.seg, T.size, T.detailed), z = fieldGridCoordinate(Math.floor(i / (T.seg + 1)), T.seg, T.size, T.detailed);
      T.h[i] = F.mode ? fieldHeight(x, z, profile, terrainRoute, rawHeight(x,z)) : this.cityHeights[i];
      p.setXYZ(i, x, T.h[i], z); uv.setXY(i, x / 15, z / 15);
    }
    p.needsUpdate = uv.needsUpdate = true; this.terrainMesh.geometry.computeVertexNormals(); this.terrainMesh.geometry.computeBoundingSphere();
    this.terrainMesh.material.userData.battlefield.value = F.mode;
    this.scene.fog.density = F.mode ? profile === 'forest' ? .00018 : .00012 : .00042;
    this.scene.environmentIntensity=F.mode?.43:.55;
    if(F.mode) {
      const az=Math.atan2(this.sunDir.z,this.sunDir.x),el=Math.max(Math.asin(this.sunDir.y),THREE.MathUtils.degToRad(32));
      this.lightDir.set(Math.cos(az)*Math.cos(el),Math.sin(el),Math.sin(az)*Math.cos(el));
    } else this.lightDir.copy(this.cityLightDir);
    this.skyDome.material.uniforms.sunDir.value.copy(F.mode?this.lightDir:this.sunDir);
    // 戶外反射與補光由同一個可見天空烘焙，首次進場一次；之後所有場地共用。
    if(F.mode && !this.fieldEnvMap) {
      const skyScene=new THREE.Scene(),pm=new THREE.PMREMGenerator(this.renderer);
      const capture=new THREE.WebGLCubeRenderTarget(128,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,generateMipmaps:false});
      skyScene.add(this.skyDome);this.skyDome.material.uniforms.environmentCapture.value=1;
      try {new THREE.CubeCamera(.1,10000,capture).update(this.renderer,skyScene);this.fieldEnvMap=pm.fromCubemap(capture.texture).texture;}
      finally {this.scene.add(this.skyDome);this.skyDome.material.uniforms.environmentCapture.value=0;capture.dispose();pm.dispose();}
    }
    this.scene.environment=F.mode?this.fieldEnvMap:this.envMap;
    this.sun.intensity=F.mode?3.5:3.8;
    this.sun.color.setRGB(1,F.mode?.91:.9,F.mode?.79:.77);
    this.hemi.intensity=F.mode?.32:.28;
    const sc=this.sun.shadow.camera,extent=F.mode?190:260;
    sc.left=sc.bottom=-extent;sc.right=sc.top=extent;sc.updateProjectionMatrix();
    this.sun.shadow.bias=F.mode?-.00008:-.0001;this.sun.shadow.normalBias=.08;
    this.terrainMesh.castShadow=!!F.mode;
    for (const o of this.cityObjects) o.visible = !F.mode;
    for (const k of ['blds', 'trample', 'smokeSites', 'fireSites', 'lampSites']) this[k] = F.mode ? [] : this.cityState[k];
    this.falling.length = 0;
    this.boxes = []; this.grid.clear();
    if (!F.mode) for (const b of this.cityState.boxes) this.addCollider(b);
    // 路障仍使用原遭遇戰快取；重建格網後重新登記，避免重玩時看得到卻穿得過去。
    for (const R of this._enc?.values() || []) for (const b of R.boxes) this.addCollider(b);
    for (const b of this.blds) { for (const t of b.tr) this.addCollider(t); b.trIn = true; }
    if (F.mode) this.buildBattlefield(profile, layout);
    this._indexTrample();
    this.sun.shadow.needsUpdate = true;
  }

  buildBattlefield(profile, layout) {
    const group = this.fieldGroup = new THREE.Group(); this.scene.add(group);
    const r = rng(601 + layout.mode * 91), walls = new GeoBucket(), roofs = new GeoBucket(), records = [], contacts = [];
    const put = (bucket, mat, shadow = true) => {
      const geo = bucket.geo = bucket.geometry();
      if (!geo) return;
      const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; m.userData.fieldGeometry = true; group.add(m);
    };
    for (const S of layout.structures) {
      const width = S.width || (S.target ? 30 : profile === 'airfield' || profile === 'depot' ? 48 : 28);
      const oil = S.name?.includes('油庫');
      const depth = S.depth || (S.target ? 32 : 34), H = oil ? 5 : S.kind==='tower'?28:S.kind==='bunker'?10:S.kind==='office'?9:S.kind==='workshop'?11:profile === 'fortress' ? 11 : profile === 'airfield' ? 16 : profile === 'depot' ? 14 + r() * 4 : 9 + r() * 4;
      const x0 = S.x - width / 2, x1 = S.x + width / 2, z0 = S.z - depth / 2, z1 = S.z + depth / 2;
      const rec = { fB: walls, rB: roofs, sB: {}, f0: walls.p.length / 3, r0: roofs.p.length / 3, s0: 0, s1: 0, lamp: -1, x0, x1, z0, z1, H };
      const face = (a,b,c,d,color) => {
        const pts=[a,b,c,d], normal=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c),new THREE.Vector3(...a))).normalize();
        const axes=Math.abs(normal.y)>0.5?[0,2]:Math.abs(normal.x)>0.5?[2,1]:[0,1];
        roofs.quad(...pts,normal.toArray(),pts.map(v=>[v[axes[0]]/6,v[axes[1]]/6]),color);
      };
      const box = (a,b,c,d,e,f,col) => addBox(walls,a,b,c,d,e,f,col,6);
      if(oil) {
        addBox(walls,x0,x1,0,1.5,z0,z1,[.45,.46,.42,0,1]);
        roofTank(roofs,S.x,S.z,1.5,12,21);
      } else fieldArchitecture({...S,x0,x1,z0,z1},profile,H,box,face,(x,z,h,rad,tall)=>roofTank(roofs,x,z,h,rad,tall));
      if (S.target && /雷達|通訊|指揮|觀測/.test(S.name)) {
        fieldRadar(S.x,S.z,H,face,(a,b,c,d,e,f,col)=>addBox(roofs,a,b,c,d,e,f,col),/通訊/.test(S.name));
      }
      rec.f1 = walls.p.length / 3; rec.r1 = roofs.p.length / 3;
      const collider = rec.box = { x0, x1, z0, z1, top: oil ? 22.5 : H + 0.3 };
      this.addCollider(collider); records.push(rec);
    }
    // 兩個合併網格容納全部可破壞基地建築，沿用既有建材、焦痕與倒塌池。
    put(walls, this.fieldRoofMaterial); put(roofs, this.fieldRoofMaterial); this._registerBlds(records);
    const place = (geo, material, count, type) => {
      const foliage=type==='tree'||type==='shrub';
      const m = new THREE.InstancedMesh(geo, material, count); m.castShadow = m.receiveShadow = true;
      if(foliage){m.userData.fieldTree=true;m.userData.noAO=true;m.customDepthMaterial=this.fieldTreeDepth;m.visible=!!this.fieldFoliageReady;}
      group.add(m);
      const d = new THREE.Object3D(); let n = 0;
      for (let i = 0; i < count * 12 && n < count; i++) {
        let x = (r() - 0.5) * 2400, z = (r() - 0.5) * 2400;
        const size = type==='shrub'?.65+r()*.65:type === 'tree' ? .95 + r() * 1.85 : 2.5 + r() * 9;
        if(type==='rock' && n%4 && contacts.length) {const c=contacts[contacts.length-1];x=c.x+(r()-.5)*55;z=c.z+(r()-.5)*55;}
        if(foliage && r() < (profile==='forest'?.78:.4)) {
          const p=this.fieldRoute.pts[Math.floor(r()*this.fieldRoute.pts.length)];
          x=p[0]+(r()-.5)*520; z=p[1]+(r()-.5)*520;
        }
        if (routeDistance(x,z,this.fieldRoute.pts) < size + 32 || layout.structures.some(t => Math.hypot(t.x-x,t.z-z) < size + 42)) continue;
        if (profile === 'airfield' && Math.abs(x + 420) < 65 && Math.abs(z) < 930) continue;
        const y = this.height(x,z);
        contacts.push({x,z,r:size*(foliage?3:1.2),tree:foliage});
        d.position.set(x,y,z); d.rotation.set(foliage ? 0 : r() * 0.25, r() * 6.28, 0);
        d.scale.set(size, foliage ? size * (0.9 + r() * 0.25) : size * (0.7 + r() * 0.6), size * (0.65 + r() * 0.65)); d.updateMatrix();
        m.setMatrixAt(n,d.matrix); m.setColorAt(n,foliage ? new THREE.Color().setRGB(.7+r()*.22,.8+r()*.2,.65+r()*.25) : profile==='badlands' ? new THREE.Color(.72+r()*.18,.54+r()*.12,.36+r()*.09) : new THREE.Color(.72+r()*.2,.75+r()*.18,.68+r()*.18));
        if (foliage) this.trample.push({ mesh:[m], i:n, x,z,y:d.position.y,ry:d.rotation.y,r:size*0.7,s:size,sy:d.scale.y,kind:'tree',down:0 });
        else this.addCollider({ x0:x-size*0.75,x1:x+size*0.75,z0:z-size*0.75,z1:z+size*0.75,top:y+d.scale.y*0.9 });
        n++;
      }
      m.count = n; m.instanceMatrix.needsUpdate = true;
    };
    if (!this.fieldRock) {
      this.fieldRock = { geo:fieldRockGeometry(), mat:new THREE.MeshStandardMaterial({map:this.A.rockD,normalMap:this.A.rockN,roughness:1,color:0xaca89c}) };
      const mat=this.fieldRock.mat;
      mat.normalScale.set(.18,.18);
      mat.onBeforeCompile=sh=>{
        Object.assign(sh.uniforms,{surfaceAtlas:this.A.surfaceAtlas,surfaceReady:this.A.surfaceReady});
        sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFieldRock,vFieldRockN;').replace('#include <project_vertex>','#include <project_vertex>\nvec4 rp=vec4(transformed,1.0);vec3 rn=normal;\n#ifdef USE_INSTANCING\nrp=instanceMatrix*rp;rn=mat3(instanceMatrix)*rn;\n#endif\nvFieldRock=(modelMatrix*rp).xyz;vFieldRockN=normalize(mat3(modelMatrix)*rn);');
        sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
          varying vec3 vFieldRock,vFieldRockN;uniform sampler2D surfaceAtlas;uniform float surfaceReady;
          vec3 rockScan(vec2 uv){return texture2D(surfaceAtlas,vec2(.008)+fract(uv)*.484).rgb;}`)
          .replace('#include <map_fragment>',`vec3 detail=texture2D(map,vFieldRock.xz/12.0).rgb;
            if(surfaceReady>.5){vec3 w=pow(abs(vFieldRockN),vec3(4.0));w/=max(dot(w,vec3(1.0)),.001);
              detail=rockScan(vFieldRock.zy/10.0)*w.x+rockScan(vFieldRock.xz/10.0)*w.y+rockScan(vFieldRock.xy/10.0)*w.z;}
            diffuseColor.rgb*=detail;`);
      };
      this.prepareFoliage();
    }
    place(this.fieldRock.geo,this.fieldRock.mat,layout.rocks,'rock');
    if(layout.trees) {
      for(let i=0;i<6;i++)place(this.fieldTrees[i],this.fieldTreeMaterial,Math.floor(layout.trees/6)+(i<layout.trees%6?1:0),'tree');
      place(this.fieldShrub,this.fieldTreeMaterial,Math.round(layout.trees*.25),'shrub');
    }
    const mask=fieldGroundMask(this.fieldRoute,layout.structures,contacts,undefined,profile);
    if(!this.fieldGroundTexture) {this.fieldGroundTexture=new THREE.CanvasTexture(mask);this.fieldGroundTexture.generateMipmaps=false;this.fieldGroundTexture.minFilter=THREE.LinearFilter;}
    else {this.fieldGroundTexture.image=mask;this.fieldGroundTexture.needsUpdate=true;}
    this.terrainMesh.material.userData.fieldMask.value=this.fieldGroundTexture;
    if (profile === 'depot' || profile === 'airfield') {
      const tanks = new GeoBucket();
      for (const S of layout.structures) if (!S.target && !S.kind && routeDistance(S.x+35,S.z,this.fieldRoute.pts)>25) {
        roofTank(tanks,S.x+35,S.z,0,10,17);
        addBox(tanks,S.x+22,S.x+43,17,17.5,S.z-0.8,S.z+0.8,[0.5,0.53,0.55,0,2]);
        this.addCollider({x0:S.x+25,x1:S.x+45,z0:S.z-10,z1:S.z+10,top:18});
      }
      put(tanks,this.fieldRoofMaterial);
    }
  }

  prepareFoliage() {
    if(!this.fieldTrees) {
      this.fieldTrees=[0,1,2].flatMap(v=>[fieldTreeGeometry(true,v),fieldTreeGeometry(false,v)]);
      this.fieldShrub=fieldShrubGeometry();
      const ready=(texture)=>{
        if(texture?.image){
          const c=document.createElement('canvas');c.width=c.height=512;c.getContext('2d').drawImage(texture.image,0,0,512,512);
          texture.image=c;texture.needsUpdate=true;
        }
        this.fieldFoliageReady=true;
        this.fieldGroup?.traverse(o=>{if(o.userData.fieldTree)o.visible=true;});
        for(const m of this.cityTreeMeshes||[])m.visible=this.battlefield==='city'&&!m.userData.suppressFoliage;
        this.sun.shadow.needsUpdate=true;
      };
      const failed=()=>{
        this.fieldTreeMaterial.map=null;this.fieldTreeMaterial.alphaTest=0;this.fieldTreeMaterial.color.setHex(0x385132);this.fieldTreeMaterial.needsUpdate=true;
        this.fieldTreeDepth.map=null;this.fieldTreeDepth.alphaTest=0;this.fieldTreeDepth.needsUpdate=true;ready();
      };
      const tex=new THREE.TextureLoader().load(new URL('./assets/field-foliage-v2.webp',import.meta.url).href,ready,undefined,failed);
      tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
      this.fieldTreeMaterial=fieldLeafMaterial(tex);this.fieldTreeDepth=fieldLeafMaterial(tex,true);
    }
  }

  height(x, z) { return this.terrain.height(x, z); }

  addCollider(b) {
    const i = this.boxes.length;
    this.boxes.push(b);
    const cs = this.cellSize;
    for (let gx = Math.floor(b.x0 / cs); gx <= Math.floor(b.x1 / cs); gx++)
      for (let gz = Math.floor(b.z0 / cs); gz <= Math.floor(b.z1 / cs); gz++) {
        const k = gx * 10007 + gz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(i);
      }
  }
  nearBoxes(x, z, r, out = []) {
    out.length = 0;
    const cs = this.cellSize, seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let gx = Math.floor((x - r) / cs); gx <= Math.floor((x + r) / cs); gx++)
      for (let gz = Math.floor((z - r) / cs); gz <= Math.floor((z + r) / cs); gz++) {
        const l = this.grid.get(gx * 10007 + gz);
        if (l) for (const i of l) if (!seen.has(i)) { seen.add(i); out.push(this.boxes[i]); }
      }
    return out;
  }

  // 腳下支撐高度：地形或屋頂（只算腳底下方、可以踩上去的）
  support(x, z, r, feetY) {
    let h = this.height(x, z);
    for (const b of this.nearBoxes(x, z, r, this._tmpA || (this._tmpA = []))) {
      if (x > b.x0 - r * 0.5 && x < b.x1 + r * 0.5 && z > b.z0 - r * 0.5 && z < b.z1 + r * 0.5 && b.top <= feetY + 1.5) h = Math.max(h, b.top);
    }
    return h;
  }

  // 圓柱推出建築
  collide(pos, r, feetY) {
    let hit = false;
    for (const b of this.nearBoxes(pos.x, pos.z, r + 2, this._tmpB || (this._tmpB = []))) {
      if (b.top <= feetY + 1.5) continue;
      const cx = Math.max(b.x0, Math.min(pos.x, b.x1)), cz = Math.max(b.z0, Math.min(pos.z, b.z1));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-6) { // 在盒子裡：從最近的邊推出
          const l = pos.x - b.x0, rr = b.x1 - pos.x, f = pos.z - b.z0, bk = b.z1 - pos.z;
          const m = Math.min(l, rr, f, bk);
          if (m === l) pos.x = b.x0 - r; else if (m === rr) pos.x = b.x1 + r; else if (m === f) pos.z = b.z0 - r; else pos.z = b.z1 + r;
        } else {
          const d = Math.sqrt(d2);
          pos.x = cx + dx / d * r; pos.z = cz + dz / d * r;
        }
        hit = true;
      }
    }
    return hit;
  }

  // 線段對建築／地形求交，回傳 t (0..1) 或 -1；normal 寫進 outN
  raycast(a, b, outN) {
    let best = 2;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 50));
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      for (const bx of this.nearBoxes(a.x + dx * t, a.z + dz * t, 50, this._tmpC || (this._tmpC = []))) {
        if (seen.has(bx)) continue; seen.add(bx);
        if (bx.top < 0) continue;   // 停用中的瓦礫台階
        // slab
        let t0 = 0, t1 = 1, nAxis = -1, nSign = 0;
        const L = [[a.x, dx, bx.x0, bx.x1], [a.y, dy, -50, bx.top], [a.z, dz, bx.z0, bx.z1]];
        let ok = true;
        for (let k = 0; k < 3; k++) {
          const [o, d, mn, mx] = L[k];
          if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } continue; }
          let ta = (mn - o) / d, tb = (mx - o) / d;
          if (ta > tb) { const q = ta; ta = tb; tb = q; }
          if (ta > t0) { t0 = ta; nAxis = k; nSign = d > 0 ? -1 : 1; }
          if (tb < t1) t1 = tb;
          if (t0 > t1) { ok = false; break; }
        }
        if (ok && t0 < best && t0 >= 0) {
          best = t0;
          if (outN) { outN.set(0, 0, 0); if (nAxis >= 0) outN.setComponent(nAxis, nSign); else outN.set(0, 1, 0); }
        }
      }
    }
    // 地形
    const tsteps = Math.max(2, Math.ceil(Math.hypot(dx, dy, dz) / 8));
    let prevAbove = a.y - this.height(a.x, a.z);
    for (let s = 1; s <= tsteps; s++) {
      const t = s / tsteps;
      if (t > best) break;
      const x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
      const above = y - this.height(x, z);
      if (above < 0 && prevAbove >= 0) {
        const tt = (s - 1 + prevAbove / (prevAbove - above)) / tsteps;
        if (tt < best) { best = tt; if (outN) outN.set(0, 1, 0); }
        break;
      }
      prevAbove = above;
    }
    return best <= 1 ? best : -1;
  }

  buildCity() {
    const r = rng(2026);
    const NF = FACADES.length;
    const fmats = FACADES.map((f, i) => buildingMaterial(this.A, i));
    this.cityFacadeMaterials=fmats;
    const roofMat = architecturalMaterial(this.A);
    this.fieldRoofMaterial = architecturalMaterial(this.A);
    const fieldMat = this.fieldRoofMaterial, prepareField = fieldMat.onBeforeCompile;
    fieldMat.onBeforeCompile = (sh,renderer) => {
      prepareField(sh,renderer);
      sh.uniforms.fieldWear={value:this.A.wearM};
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float burn; varying float vFieldBurn;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFieldBurn=burn;');
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vFieldBurn; uniform sampler2D fieldWear;').replace('#include <map_fragment>',`#include <map_fragment>
        float streak=fract(sin(dot(floor(vAW.xz*2.0),vec2(127.1,311.7)))*43758.5453);
        float grime=(1.0-smoothstep(0.0,4.0,vAW.y))*0.16+step(0.88,streak)*(0.04+0.1*abs(sin(vAW.y*0.25)));
        float wear=texture2D(fieldWear,vAW.xz/9.0+vAW.y*.031).r;
        float along=abs(vAN.x)>.5?vAW.z:vAW.x;
        float joint=1.0-smoothstep(.01,.035,abs(fract(along/3.0)-.5));
        float rib=sin(along*15.0)*.5+.5;
        float metal=step(1.5,vSurface)*(1.0-step(2.5,vSurface));
        diffuseColor.rgb*=1.0-grime-wear*.07-joint*.12;
        diffuseColor.rgb*=mix(1.0,.85+rib*.15,metal);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.58,.38,.23),wear*metal*.25);

        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(0.25,0.22,0.20),clamp(vFieldBurn,0.0,1.0));`);
      sh.fragmentShader=sh.fragmentShader.replace('vSurface < 2.5 ? 0.4','vSurface < 2.5 ? 0.75').replace('normal = normalize( tbn * mapN );','mapN.x+=cos(along*15.0)*.16*metal; normal = normalize( tbn * mapN );');
    };
    fieldMat.customProgramCacheKey=()=> 'field-architecture-v3';
    const inner = new THREE.MeshStandardMaterial({ color: 0x16130f, roughness: 1, vertexColors: true });
    const CH = 3; // 3×3 區塊
    const buckets = [];
    const signMat = shopMaterial();
    for (let i = 0; i < CH * CH; i++) buckets.push({ f: FACADES.map(() => new GeoBucket()), roof: new GeoBucket(), inner: new GeoBucket(), signs: new GeoBucket() });
    const chunkOf = (x, z) => {
      const cx = Math.min(CH - 1, Math.max(0, Math.floor((x + CITY.half) / (2 * CITY.half) * CH)));
      const cz = Math.min(CH - 1, Math.max(0, Math.floor((z + CITY.half) / (2 * CITY.half) * CH)));
      return buckets[cz * CH + cx];
    };
    this.blocks = [];
    const B = CITY.block, nb = Math.round(CITY.half / B);
    for (let bi = -nb; bi < nb; bi++) for (let bj = -nb; bj < nb; bj++) {
      const bx = (bi + 0.5) * B, bz = (bj + 0.5) * B;
      const dist = Math.hypot(bx, bz);
      const inset = CITY.walk + 2;
      const lx0 = bx - B / 2 + inset, lx1 = bx + B / 2 - inset, lz0 = bz - B / 2 + inset, lz1 = bz + B / 2 - inset;
      let kind = 'build';
      const roll = r();
      if (Math.abs(bx) < B && Math.abs(bz) < B) kind = dist < 100 ? 'plaza' : (roll < 0.5 ? 'park' : 'ruin');
      else if (roll < 0.12) kind = 'park';
      else if (roll < 0.3) kind = 'ruin';
      else if (roll < 0.36) kind = 'lot';
      this.blocks.push({ x: bx, z: bz, kind, lx0, lx1, lz0, lz1 });
      if (kind === 'plaza' || kind === 'park' || kind === 'lot') continue;
      const hScale = THREE.MathUtils.lerp(1.0, 0.28, smooth(80, CITY.half * 1.1, dist));
      const district = dist < 230 ? 'core' : bx < -120 && bz < 480 ? 'old' : bx > 120 && bz < 240 ? 'east' : 'mixed';
      // 街屋用狹長地塊，住宅／商辦保留院落，避免一個低矮大盒子填滿整個街區。
      const lots = [];
      const split = r();
      if (district === 'old' || district === 'east' && split < 0.65) {
        const alongX = (bi + bj) % 2 === 0, count = district === 'old' ? 4 : 3;
        const lo = alongX ? lx0 : lz0, hi = alongX ? lx1 : lz1;
        let edge = lo;
        for (let i = 0; i < count; i++) {
          const end = i === count - 1 ? hi : lo + (hi - lo) * (i + 1) / count + (r() - 0.5) * 4;
          lots.push(alongX ? [edge, end - 1, lz0, lz1] : [lx0, lx1, edge, end - 1]); edge = end + 1;
        }
      } else if (split < 0.3) lots.push([lx0, lx1, lz0, lz1]);
      else if (split < 0.65) { const m = THREE.MathUtils.lerp(lx0, lx1, 0.4 + r() * 0.2); lots.push([lx0, m - 3, lz0, lz1], [m + 3, lx1, lz0, lz1]); }
      else { const mx = THREE.MathUtils.lerp(lx0, lx1, 0.4 + r() * 0.2), mz = THREE.MathUtils.lerp(lz0, lz1, 0.4 + r() * 0.2);
        lots.push([lx0, mx - 3, lz0, mz - 3], [mx + 3, lx1, lz0, mz - 3], [lx0, mx - 3, mz + 3, lz1], [mx + 3, lx1, mz + 3, lz1]); }
      for (const [a0, a1, c0, c1] of lots) {
        if (r() < 0.12) continue;
        const street = district === 'old' || district === 'east';
        const sh = street ? 0.5 : 2.5;
        const sx = street ? Math.max(0, (a1 - a0 - 46) * 0.5) : (a1 - a0) * (0.08 + r() * 0.09), sz = street ? Math.max(0, (c1 - c0 - 46) * 0.5) : (c1 - c0) * (0.08 + r() * 0.09);
        const x0 = a0 + sx + r() * sh, x1 = a1 - sx - r() * sh, z0 = c0 + sz + r() * sh, z1 = c1 - sz - r() * sh;
        const rawFloors = Math.max(3, Math.round((8 + r() * r() * 42) * hScale * (kind === 'ruin' ? 0.8 : 1)));
        const floors = district === 'old' ? 4 + ((r() * 4) | 0) : district === 'east' ? Math.min(14, Math.max(5, rawFloors + ((r() * 4) | 0))) : rawFloors;
        const H = floors * 3.6;
        const ruin = kind === 'ruin' ? true : r() < 0.08;
        // 0 玻璃帷幕 1 辦公 2 紅磚 3 混凝土 4 磚柱
        const rawStyle = ruin ? 2 + ((r() * 3) | 0) : (H > 75 ? (r() < 0.6 ? 0 : 1) : H > 45 ? [1, 3, 4, 0][(r() * 4) | 0] : 2 + ((r() * 3) | 0));
        const style = !ruin && district === 'old' ? (bi % 2 ? 2 : 4) : !ruin && district === 'east' ? (bj % 2 ? 3 : 4) : rawStyle;
        const F = FACADES[style];
        const tint = 0.8 + r() * 0.3;
        const col = [tint, tint * (0.97 + r() * 0.05), tint * (0.93 + r() * 0.07), ruin ? 0.75 + r() * 0.25 : (r() < 0.15 ? 0.35 : 0)];
        const uo = Math.floor(r() * F.cols) / F.cols, vo = Math.floor(r() * 8) / 8;
        const bk = chunkOf((x0 + x1) / 2, (z0 + z1) / 2);
        if (!ruin) {
          // 可破壞：記下這棟在各合併網格裡的頂點區段（每棟連續寫入）
          const rec = { fB: bk.f[style], rB: bk.roof, sB: bk.signs, f0: bk.f[style].p.length / 3, r0: bk.roof.p.length / 3, s0: bk.signs.p.length / 3, lamp: -1, x0, x1, z0, z1 };
          const nLamp = this.lampSites.length;
          addWalls(bk.f[style], x0, x1, z0, z1, 0, H, col, uo, 0, null, F);
          const rc = [0.75, 0.75, 0.75];
          addBox(bk.roof, x0, x1, H - 0.01, H, z0, z1, rc, 12);
          // 女兒牆
          const pitched = H < 45 && (district === 'old' || district === 'mixed' && style !== 3);
          const pw = 0.45, ph = pitched ? 0.18 : 0.9;
          addBox(bk.roof, x0, x1, H, H + ph, z0, z0 + pw, rc); addBox(bk.roof, x0, x1, H, H + ph, z1 - pw, z1, rc);
          addBox(bk.roof, x0, x0 + pw, H, H + ph, z0, z1, rc); addBox(bk.roof, x1 - pw, x1, H, H + ph, z0, z1, rc);
          // 屋頂設備
          const nEq = pitched ? 0 : 1 + ((r() * 3) | 0);
          for (let k = 0; k < nEq; k++) {
            const ew = 3 + r() * 8, ed = 3 + r() * 8, eh = 2 + r() * 4;
            const ex = THREE.MathUtils.lerp(x0 + 2, x1 - 2 - ew, r()), ez = THREE.MathUtils.lerp(z0 + 2, z1 - 2 - ed, r());
            if (k === 0 && style >= 2) roofTank(bk.roof, ex + ew / 2, ez + ed / 2, H, Math.min(ew, ed) * 0.4, eh);
            else addBox(bk.roof, ex, ex + ew, H, H + eh, ez, ez + ed, [0.6, 0.6, 0.62, 0, 2]);
          }
          let roofTop = H, crown = [x0, x1, z0, z1];
          // 塔樓頂層退縮
          if (H > 60 && r() < 0.6) {
            const ix = (x1 - x0) * 0.2, iz = (z1 - z0) * 0.2, H2 = H + 3.6 * (2 + ((r() * 6) | 0));
            roofTop = H2; crown = [x0 + ix, x1 - ix, z0 + iz, z1 - iz];
            addWalls(bk.f[style], x0 + ix, x1 - ix, z0 + iz, z1 - iz, H, H2, col, uo, 0, null, F);
            addBox(bk.roof, x0 + ix, x1 - ix, H2 - 0.01, H2, z0 + iz, z1 - iz, rc, 12);
            if (r() < 0.5) this.lampSites.push(new THREE.Vector3((x0 + x1) / 2, H2 + 8, (z0 + z1) / 2)); // 屋頂紅燈
            addBox(bk.roof, (x0 + x1) / 2 - 0.3, (x0 + x1) / 2 + 0.3, H2, H2 + 8, (z0 + z1) / 2 - 0.3, (z0 + z1) / 2 + 0.3, [0.4, 0.4, 0.4]);
          }
          const exposed = [c1 >= lz1 || c1 - z1 >= 1.5, c0 <= lz0 || z0 - c0 >= 1.5,
            a1 >= lx1 || a1 - x1 >= 1.5, a0 <= lx0 || x0 - a0 >= 1.5];
          architecture(bk.roof, bk.signs, x0, x1, z0, z1, H, style, F, district, roofTop, crown, exposed);
          rec.box = { x0, x1, z0, z1, top: H + 0.2 };
          this.addCollider(rec.box);
          rec.f1 = rec.fB.p.length / 3; rec.r1 = rec.rB.p.length / 3; rec.H = H;
          rec.s1 = bk.signs.p.length / 3;
          if (this.lampSites.length > nLamp) rec.lamp = nLamp;
          (this._recs || (this._recs = [])).push(rec);
        } else {
          // 殘骸：牆頂參差、內部焦黑、樓板外露
          const Hr = Math.max(10, H * (0.35 + r() * 0.4));
          const tops = [0, 1, 2, 3].map(() => { const n = 4 + ((r() * 5) | 0); return Array.from({ length: n }, () => Hr * (0.45 + r() * 0.55)); });
          addWalls(bk.f[style], x0, x1, z0, z1, 0, Hr, col, uo, 0, tops, F);
          const inH = Hr * 0.45;
          const ic = [0.5, 0.5, 0.5];
          addBox(bk.inner, x0 + 0.5, x1 - 0.5, inH - 1, inH, z0 + 0.5, z1 - 0.5, ic);
          // 內牆（從外面看進去是暗的）
          for (const [ax0, ax1, az0, az1] of [[x0 + 0.5, x1 - 0.5, z0 + 0.5, z0 + 0.9], [x0 + 0.5, x1 - 0.5, z1 - 0.9, z1 - 0.5], [x0 + 0.5, x0 + 0.9, z0 + 0.5, z1 - 0.5], [x1 - 0.9, x1 - 0.5, z0 + 0.5, z1 - 0.5]])
            addBox(bk.inner, ax0, ax1, 0, Hr * 0.9, az0, az1, ic);
          // 外露樓板
          for (let fl = 3.6 * 3; fl < Hr * 0.9; fl += 3.6 * (1 + ((r() * 3) | 0))) {
            if (r() < 0.5) continue;
            const side = (r() * 4) | 0, ext = 1 + r() * 3;
            let bx0 = x0, bx1 = x1, bz0 = z0, bz1 = z1;
            if (side === 0) { bz1 = z0 + 0.2; bz0 = z0 - ext; } else if (side === 1) { bz0 = z1 - 0.2; bz1 = z1 + ext; }
            else if (side === 2) { bx1 = x0 + 0.2; bx0 = x0 - ext; } else { bx0 = x1 - 0.2; bx1 = x1 + ext; }
            const s0 = r() * 0.5, s1 = 0.5 + r() * 0.5;
            if (side < 2) { const w = bx1 - bx0; bx0 += w * s0; bx1 = bx0 + w * (s1 - s0); } else { const w = bz1 - bz0; bz0 += w * s0; bz1 = bz0 + w * (s1 - s0); }
            addBox(bk.roof, bx0, bx1, fl - 0.4, fl, bz0, bz1, [0.55, 0.53, 0.5]);
          }
          this.addCollider({ x0, x1, z0, z1, top: inH });
          // 周圍瓦礫
          this.rubbleSites = this.rubbleSites || [];
          for (let k = 0; k < 8; k++) this.rubbleSites.push([THREE.MathUtils.lerp(x0 - 6, x1 + 6, r()), THREE.MathUtils.lerp(z0 - 6, z1 + 6, r()), 2 + r() * 5]);
          if (r() < 0.55) {
            const p = new THREE.Vector3(THREE.MathUtils.lerp(x0, x1, 0.3 + r() * 0.4), Hr * 0.7, THREE.MathUtils.lerp(z0, z1, 0.3 + r() * 0.4));
            this.smokeSites.push(p);
            if (r() < 0.7) this.fireSites.push(p.clone().setY(inH + 1));
          }
        }
      }
    }
    for (const bk of buckets) {
      for (let s = 0; s < NF; s++) {
        const g = bk.f[s].geo = bk.f[s].geometry();
        if (g) { const m = new THREE.Mesh(g, fmats[s]); m.castShadow = m.receiveShadow = true; this.scene.add(m); }
      }
      const rg = bk.roof.geo = bk.roof.geometry();
      if (rg) { const m = new THREE.Mesh(rg, roofMat); m.castShadow = m.receiveShadow = true; this.scene.add(m); }
      const ig = bk.inner.geometry();
      if (ig) { const m = new THREE.Mesh(ig, inner); m.castShadow = true; m.receiveShadow = true; this.scene.add(m); }
      const sg = bk.signs.geo = bk.signs.geometry();
      if (sg) { const m = new THREE.Mesh(sg, signMat); m.receiveShadow = true; this.scene.add(m); }
    }
    this._initBlds();
  }

  // ---------------------------------------------------------------- 可破壞建築
  // 每棟：合併網格裡的頂點區段（原始位置備份）、血量、碰撞盒、倒塌後的瓦礫台階
  _initBlds() {
    this.blds = [];
    this._registerBlds(this._recs || []);
    delete this._recs;
    this.bAnim = []; this.bLow = []; this.nFall = 0;
    this.smk = []; this.smkSel = []; this.smkT = 0;
    // 瓦礫丘＋丘上大塊碎石＋飛落碎塊（共用瓦礫材質）
    const rubMat = new THREE.MeshStandardMaterial({ map: this.A.rubD, normalMap: this.A.rubN, roughness: 0.95, color: 0x8a8580 });
    const NM = 48, dod = new THREE.DodecahedronGeometry(1, 0);
    // 平時 count＝0 但保持 visible：開場就把各渲染通道（主畫面、陰影、AO）的 shader 編好，第一次倒塌才不會卡一下
    const mk = (g, n) => { const m = new THREE.InstancedMesh(g, rubMat, n); m.castShadow = m.receiveShadow = true; m.count = 0; m.frustumCulled = false; this.scene.add(m); return m; };
    this.mound = mk(moundGeometry(), NM);
    this.pile = mk(dod, NM * 10);
    this.chunkM = mk(dod, 96);
    this.mSlots = new Array(NM).fill(null); this.mNext = 0;
    this.ck = Array.from({ length: 96 }, () => ({ live: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, t: 0, rest: 0, q: new THREE.Quaternion(), ax: new THREE.Vector3(1, 0, 0), av: 0 }));
    this.ckN = 0; this.ckI = 0; this.ckSnd = 0;
    this._m4 = new THREE.Matrix4(); this._qq = new THREE.Quaternion(); this._sv = new THREE.Vector3(); this._pv = new THREE.Vector3();
    this._nv = new THREE.Vector3(); this._cv = new THREE.Vector3();
  }

  _registerBlds(records) {
    for (const R of records) {
      const pa = R.fB.geo.attributes.position, ba = R.fB.geo.attributes.burn, qa = R.rB.geo.attributes.position;
      const seg = [[pa, R.f0, R.f1 - R.f0], [qa, R.r0, R.r1 - R.r0], [R.sB.geo?.attributes.position, R.s0, R.s1 - R.s0]].filter((s) => s[2] > 0)
        .map(([a, s, n]) => ({ a, s, o: a.array.slice(s * 3, (s + n) * 3) }));
      let top = R.H;
      for (const g of seg) for (let i = 1; i < g.o.length; i += 3) top = Math.max(top, g.o[i]);
      const w = R.x1 - R.x0, d = R.z1 - R.z0;
      // 血量（步槍一發＝1）：中型樓約 9～10 發，150 m 高樓約 27 發
      const hpMax = Math.min(30, Math.max(4, 3 + 0.16 * R.H + 0.06 * (Math.sqrt(w * d) - 35)));
      const cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2, gy = this.height(cx, cz);
      const hM = Math.min(8, Math.max(4, 3 + 0.05 * R.H));
      const b = {
        x0: R.x0, x1: R.x1, z0: R.z0, z1: R.z1, cx, cz, w, d, H: R.H, top, gy, hM,
        box: R.box, top0: R.box.top, seg, burn: { a: ba, s: R.f0, o: ba.array.slice(R.f0, R.f1) }, lamp: R.lamp,
        rh: [gy + 1.4, gy + 2.8, gy + Math.min(4.2, hM * 0.85)],
        hp: hpMax, hpMax, st: 0, t: 0, u: 0, shk: 0, bl: 0, wn: [], dirty: false, anim: false, groanT: 0, slot: -1,
      };
      R.box.bld = b;
      // 瓦礫台階（第一次倒塌才加進格網；重設後 top＜0 停用）：外圈沿用原碰撞盒，往內兩層，每層高 1.4 m 以內，機體走得上去
      b.tr = [0.18, 0.34].map((f) => ({ x0: R.x0 + w * f, x1: R.x1 - w * f, z0: R.z0 + d * f, z1: R.z1 - d * f, top: -1e4, bld: b }));
      this.blds.push(b);
    }
  }

  // main.js 接上特效／音效／座艙／HUD
  hook(h) { this.hooks = h; }

  // pos 附近 pad 公尺內、還立著的建築
  bldAt(p, pad = 1.5) {
    let best = null, bd = pad;
    for (const bx of this.nearBoxes(p.x, p.z, pad + 1, this._tmpD || (this._tmpD = []))) {
      const b = bx.bld;
      if (!b || b.st !== 0 || bx !== b.box) continue;
      const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dz = Math.max(b.z0 - p.z, 0, p.z - b.z1), dy = Math.max(b.gy - p.y, 0, p.y - bx.top);
      const dd = Math.hypot(dx, dy, dz);
      if (dd <= bd) { bd = dd; best = b; }
    }
    return best;
  }
  // 單發命中（步槍、光劍）：dmg 以「步槍一發」為單位
  hitBuilding(p, dmg, n) {
    const b = this.bldAt(p, 1.5);
    if (b) this._dmg(b, dmg, p, n, dmg >= 2);
    return b;
  }
  // 爆炸：半徑 r 內的建築依距離扣血（貼牆爆炸＝全額）
  blast(p, r, dmg) {
    const n = this._nv, q = this._cv;
    for (const bx of this.nearBoxes(p.x, p.z, r + 1, this._tmpD || (this._tmpD = []))) {
      const b = bx.bld;
      if (!b || b.st !== 0 || bx !== b.box) continue;
      const qx = Math.min(b.x1, Math.max(b.x0, p.x)), qy = Math.min(bx.top, Math.max(b.gy, p.y)), qz = Math.min(b.z1, Math.max(b.z0, p.z));
      const d = Math.hypot(p.x - qx, p.y - qy, p.z - qz);
      if (d >= r) continue;
      q.set(qx, qy, qz);
      if (d > 0.01) n.set(p.x - qx, p.y - qy, p.z - qz).divideScalar(d);
      else { // 爆心貼在表面上：取最近的牆面
        const l = p.x - b.x0, rr = b.x1 - p.x, f = p.z - b.z0, bk = b.z1 - p.z, m = Math.min(l, rr, f, bk);
        n.set(0, 0, 0);
        if (m === l) n.x = -1; else if (m === rr) n.x = 1; else if (m === f) n.z = -1; else n.z = 1;
      }
      this._dmg(b, dmg * (1 - d / r), q, n, true);
    }
  }

  _dmg(b, dmg, p, n, big) {
    if (dmg <= 0.02 || b.st !== 0) return;
    const H = this.hooks || {};
    const f0 = b.hp / b.hpMax;
    b.hp -= dmg; b.dirty = true;
    const f = Math.max(0, b.hp / b.hpMax);
    // 整棟晃一下：越殘越晃
    b.shk = Math.min(1.4, b.shk + (0.08 + 0.2 * Math.min(dmg, 3)) * (0.5 + 1.8 * (1 - f)));
    this._anim(b);
    if (p) {
      // 牆面剝落：碎塊往下掉＋粉塵
      if (H.fx && H.fx.crumble) H.fx.crumble(p, n, Math.min(3, dmg));
      if (dmg >= 0.7 || Math.random() < 0.3) this._chunk(p, n, dmg >= 0.7 ? 2 + ((Math.random() * 2) | 0) : 1, 0.7 + 0.35 * Math.min(2, dmg));
      // 傷口：之後冒煙、起火的位置（每棟最多 3 個）
      if (b.wn.length < 3 && (big || !b.wn.length || Math.random() < 0.15)) {
        const up = n && n.y > 0.7;
        b.wn.push({ x: p.x + (n ? n.x : 0) * 1.5, y: Math.min(b.top - 2, Math.max(b.gy + 4, p.y)) + (up ? 1 : 0), z: p.z + (n ? n.z : 0) * 1.5, nx: up || !n ? 0 : n.x, nz: up || !n ? 0 : n.z, s: null });
      }
    }
    // 燒焦：窗戶熄燈、牆面燻黑；剩四分之一以下窗內起火
    const bl = f > 0.25 ? 0.7 * (1 - f) : 0.85 + 0.6 * (0.25 - f);
    if (bl - b.bl > 0.05) this._burn(b, Math.min(1, bl));
    if (f0 > 0.5 && f <= 0.5 && f > 0) this._smkOn(b, 1);
    if (f0 > 0.25 && f <= 0.25 && f > 0) {
      this._smkOn(b, 2);
      this.bLow.push(b); b.groanT = 2.5 + Math.random() * 3;
      if (H.audio && H.audio.groan) H.audio.groan(this._pv.set(b.cx, b.gy + Math.min(b.top * 0.6, 60), b.cz), 1);
    }
    if (b.hp <= 0) this._fall(b);
  }

  _anim(b) { if (!b.anim) { b.anim = true; this.bAnim.push(b); } }

  _burn(b, bl) {
    b.bl = bl; b.dirty = true;
    const B = b.burn, A = B.a.array, O = B.o;
    for (let i = 0; i < O.length; i++) A[B.s + i] = Math.max(O[i], bl);
    B.a.addUpdateRange(B.s, O.length); B.a.needsUpdate = true;
  }

  // 頂點擺位：繞底部中心、水平軸 (ax,0,az) 傾斜 th，再往下 dy、水平抖動 (jx,jz)
  _pose(b, dy, th, jx, jz) {
    const c = Math.cos(th), s = Math.sin(th), kx = b.ax || 0, kz = b.az || 0, cx = b.cx, cz = b.cz, gy = b.gy;
    for (const g of b.seg) {
      const A = g.a.array, O = g.o, o3 = g.s * 3;
      for (let i = 0; i < O.length; i += 3) {
        const vx = O[i] - cx, vy = O[i + 1] - gy, vz = O[i + 2] - cz;
        const m = (kx * vx + kz * vz) * (1 - c);
        A[o3 + i] = cx + vx * c - kz * vy * s + kx * m + jx;
        A[o3 + i + 1] = gy + vy * c + (kz * vx - kx * vz) * s + dy;
        A[o3 + i + 2] = cz + vz * c + kx * vy * s + kz * m + jz;
      }
      g.a.addUpdateRange(o3, O.length); g.a.needsUpdate = true;
    }
    b.dirty = true;
  }

  // 開始倒塌：先抖、微傾，再加速往下沉進自己的塵雲裡
  _fall(b) {
    const H = this.hooks || {};
    b.st = 1; b.t = 0; b.u = 0; b.hp = 0;
    b.dur = 2.4 + b.top / 70;
    const a = Math.random() * Math.PI * 2;
    b.ax = Math.cos(a); b.az = Math.sin(a); b.tilt = (0.05 + Math.random() * 0.09) * (Math.random() < 0.5 ? -1 : 1); b.ph = Math.random() * 10;
    b.ckAcc = 0;
    this._anim(b);
    this.nFall++;
    // 傷口煙改由倒塌塵雲接手
    this.smk = this.smk.filter((s) => s.b !== b); this.smkT = 0;
    const li = this.bLow.indexOf(b); if (li >= 0) this.bLow.splice(li, 1);
    if (b.lamp >= 0 && this.beacon) { this.beacon.setMatrixAt(b.lamp, this._m4.makeScale(0, 0, 0)); this.beacon.instanceMatrix.needsUpdate = true; }
    // 瓦礫丘佔一格（滿了就回收最舊的）
    let k = this.mSlots.indexOf(null);
    if (k < 0) { k = this.mNext; this.mNext = (this.mNext + 1) % this.mSlots.length; const o = this.mSlots[k]; if (o) o.slot = -1; }
    this.mSlots[k] = b; b.slot = k;
    this._mound(b, 0);
    const size = Math.min(3, Math.max(0.6, b.top / 55));
    const P = this._pv.set(b.cx, b.gy + Math.min(b.top * 0.35, 40), b.cz);
    if (H.fx && H.fx.collapse) H.fx.collapse(b, 0, 0, 0, this.nFall);
    if (H.audio && H.audio.collapse) H.audio.collapse(P, size, b.dur);
    const vp = this.viewP;
    if (vp) {
      const dist = Math.hypot(vp.x - b.cx, vp.z - b.cz);
      const near = Math.max(0, 1 - dist / (250 + b.top * 1.5));
      if (near > 0 && H.cockpit) H.cockpit.kick('land', 0.5 * near);
      if (dist < 350 + b.top && H.note) H.note('STRUCTURE COLLAPSE', 'am');
    }
  }

  _fallStep(b, dt) {
    const H = this.hooks || {};
    b.t += dt;
    const T0 = 0.55, t = b.t;
    let dy, th, a;
    if (t < T0) { const u = t / T0; dy = -0.5 * u * u; th = b.tilt * 0.05 * u; a = 0.12 + 0.4 * u; }
    else {
      const u = b.u = Math.min(1, (t - T0) / (b.dur - T0));
      dy = -0.5 - (b.top + 8) * u * u;                 // 越掉越快
      th = b.tilt * (0.05 + 0.95 * Math.pow(u, 1.3));
      a = 0.45 * (1 - u) + 0.08;
    }
    this._pose(b, dy, th, a * Math.sin(t * 43 + b.ph), a * Math.sin(t * 39 + b.ph * 2));
    // 屋頂跟著往下：站在上面的機體一起掉
    b.box.top = Math.max(b.rh[0], b.top0 + dy);
    this._mound(b, t < T0 ? 0 : b.u);
    if (H.fx && H.fx.collapse) H.fx.collapse(b, 1, t < T0 ? 0 : b.u, dt, this.nFall);
    // 外牆崩落的大塊碎塊（同時倒很多棟就少丟一點）
    if (t > T0 * 0.6) {
      b.ckAcc += dt * 14 / Math.max(1, this.nFall * 0.7);
      const roof = b.gy + Math.max(3, b.top + dy);
      while (b.ckAcc >= 1) {
        b.ckAcc -= 1;
        const side = (Math.random() * 4) | 0, v = Math.random();
        const n = this._nv.set(side === 0 ? -1 : side === 1 ? 1 : 0, 0, side === 2 ? -1 : side === 3 ? 1 : 0);
        const x = side === 0 ? b.x0 : side === 1 ? b.x1 : b.x0 + (b.x1 - b.x0) * v;
        const z = side === 2 ? b.z0 : side === 3 ? b.z1 : b.z0 + (b.z1 - b.z0) * v;
        this._chunk(this._cv.set(x, roof - Math.random() * Math.min(20, b.top * 0.3), z), n, 1, 1.2 + Math.random() * 1.6);
      }
    }
    // 座艙隆隆震
    const vp = this.viewP;
    if (vp && H.cockpit) {
      const near = Math.max(0, 1 - Math.hypot(vp.x - b.cx, vp.z - b.cz) / (220 + b.top * 1.5));
      if (near > 0) H.cockpit.vib = Math.max(H.cockpit.vib || 0, near * (0.35 + 0.5 * b.u));
    }
    if (t >= b.dur) this._down(b);
  }

  // 倒完：頂點收成一點埋進地下、碰撞改成瓦礫台階、留下瓦礫丘與餘煙
  _down(b) {
    const H = this.hooks || {};
    b.st = 2; this.nFall = Math.max(0, this.nFall - 1);
    for (const g of b.seg) {
      const A = g.a.array, o3 = g.s * 3, n = g.o.length;
      for (let i = 0; i < n; i += 3) { A[o3 + i] = b.cx; A[o3 + i + 1] = b.gy - 40; A[o3 + i + 2] = b.cz; }
      g.a.addUpdateRange(o3, n); g.a.needsUpdate = true;
    }
    if (!b.trIn) { b.trIn = true; for (const c of b.tr) this.addCollider(c); }
    b.box.top = b.rh[0]; b.tr[0].top = b.rh[1]; b.tr[1].top = b.rh[2];
    this._mound(b, 1);
    this._pileRocks(b);
    // 瓦礫堆餘煙：1～2 處，十幾秒就散
    const nS = b.top > 60 ? 2 : 1;
    for (let k = 0; k < nS; k++) {
      const x = b.x0 + b.w * (0.25 + 0.5 * Math.random()), z = b.z0 + b.d * (0.25 + 0.5 * Math.random());
      this.smk.push({ x, y: b.gy + b.hM * 0.6, z, nx: 0, nz: 0, lv: 3, r: Math.min(1.8, 0.6 + Math.sqrt(b.w * b.d) / 60), acc: 0, accF: 0, t: 0, dur: 14 + Math.random() * 6, b, fire: Math.random() < 0.45 });
    }
    this.smkT = 0;
    if (H.fx && H.fx.collapse) H.fx.collapse(b, 2, 1, 0, this.nFall);
    const vp = this.viewP;
    if (vp && H.cockpit) {
      const near = Math.max(0, 1 - Math.hypot(vp.x - b.cx, vp.z - b.cz) / (220 + b.top * 1.5));
      if (near > 0) H.cockpit.kick('land', 0.9 * near);
    }
  }

  // 瓦礫丘：隨倒塌進度長高（被塵雲蓋住）
  _mound(b, u) {
    if (b.slot < 0) return;
    const m = this.mound, k = b.slot;
    const e = u < 0.3 ? 0 : Math.min(1, (u - 0.3) / 0.7);
    const hy = b.hM * (e * e * (3 - 2 * e)) + 0.001;
    this._m4.compose(this._pv.set(b.cx, b.gy, b.cz), this._qq.identity(), this._sv.set(b.w * 0.62, hy, b.d * 0.62));
    m.setMatrixAt(k, this._m4);
    m.count = Math.max(m.count, k + 1); m.visible = true;
    m.instanceMatrix.needsUpdate = true;
  }
  // 丘上的大塊混凝土、樓板
  _pileRocks(b) {
    if (b.slot < 0) return;
    const P = this.pile, base = b.slot * 10, e = new THREE.Euler();
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2, rho = Math.sqrt(Math.random()) * 0.85;
      const x = b.cx + Math.cos(a) * rho * b.w * 0.55, z = b.cz + Math.sin(a) * rho * b.d * 0.55;
      const hy = b.hM * Math.pow(Math.max(0, 1 - rho * rho / 1.1), 1.2);
      const slab = k < 3, s = slab ? 4 + Math.random() * 4 : 1.5 + Math.random() * 2.5;
      e.set((Math.random() - 0.5) * (slab ? 0.8 : 3), Math.random() * 6.28, (Math.random() - 0.5) * (slab ? 0.8 : 3));
      this._m4.compose(this._pv.set(x, b.gy + hy * 0.85, z), this._qq.setFromEuler(e), slab ? this._sv.set(s, 0.35, s * 0.6) : this._sv.set(s, s * 0.6, s * 0.8));
      P.setMatrixAt(base + k, this._m4);
    }
    P.count = Math.max(P.count, base + 10); P.visible = true;
    P.instanceMatrix.needsUpdate = true;
  }

  // 飛落碎塊（實體石塊，有陰影）
  _chunk(p, n, cnt, s) {
    for (let k = 0; k < cnt; k++) {
      const c = this.ck[this.ckI]; this.ckI = (this.ckI + 1) % this.ck.length;
      if (!c.live) this.ckN++;
      const nx = n ? n.x : 0, nz = n ? n.z : 0, out = 2 + Math.random() * 6;
      c.live = 1; c.rest = 0; c.t = 0; c.s = s * (0.55 + Math.random() * 0.6);
      c.x = p.x + nx * c.s; c.y = p.y; c.z = p.z + nz * c.s;
      c.vx = nx * out + (Math.random() - 0.5) * 5; c.vy = (n && n.y > 0.7 ? 6 : 0) + Math.random() * 4 - 1; c.vz = nz * out + (Math.random() - 0.5) * 5;
      c.q.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      c.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); c.av = 2 + Math.random() * 5;
    }
  }
  _updChunks(dt) {
    if (!this.ckN) return;
    const M = this.chunkM, H = this.hooks || {};
    let n = 0, hi = 0;
    this.ckSnd -= dt;
    for (let i = 0; i < this.ck.length; i++) {
      const c = this.ck[i];
      if (!c.live) { if (M.count > i) { M.setMatrixAt(i, this._m4.makeScale(0, 0, 0)); } continue; }
      c.t += dt;
      if (c.t > 9) { c.live = 0; this.ckN--; M.setMatrixAt(i, this._m4.makeScale(0, 0, 0)); continue; }
      if (!c.rest) {
        c.vy -= 26 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.q.premultiply(this._qq.setFromAxisAngle(c.ax, c.av * dt));
        const g = this.height(c.x, c.z) + c.s * 0.35;
        if (c.y < g) {
          c.y = g;
          if (c.vy < -9) {
            c.vy *= -0.28; c.vx *= 0.45; c.vz *= 0.45; c.av *= 0.5;
            if (c.s > 1.3 && Math.random() < 0.4 && H.fx && H.fx.dust) H.fx.dust(this._pv.set(c.x, g - c.s * 0.35, c.z), 0.45 + c.s * 0.15);
            if (this.ckSnd <= 0 && H.audio && H.audio.debris) { this.ckSnd = 0.18; H.audio.debris(this._pv.set(c.x, c.y, c.z)); }
          } else { c.rest = 1; c.vx = c.vy = c.vz = 0; }
        }
      }
      const sc = c.s * Math.min(1, (9 - c.t) / 1.2);
      this._m4.compose(this._pv.set(c.x, c.y, c.z), c.q, this._sv.set(sc, sc * 0.7, sc * 0.85));
      M.setMatrixAt(i, this._m4);
      n++; hi = i + 1;
    }
    M.count = hi;
    M.instanceMatrix.needsUpdate = true;
  }

  // 冒煙點：傷口（lv1 煙、lv2 火＋濃煙）、瓦礫堆（lv3）
  // 傷口只冒一陣子（灰煙 14 秒、起火 22 秒，最後幾秒慢慢變淡），不會整場一直冒
  _smkOn(b, lv) {
    if (!b.wn.length) b.wn.push({ x: b.cx + b.w * 0.5 + 1, y: b.gy + b.top * 0.6, z: b.cz, nx: 1, nz: 0, s: null });
    const dur = lv >= 2 ? 22 : 14;
    for (const w of b.wn) {
      if (w.s && w.s.t <= w.s.dur) { w.s.lv = Math.max(w.s.lv, lv); w.s.dur = Math.max(w.s.dur, w.s.t + dur); continue; }
      w.s = { x: w.x, y: w.y, z: w.z, nx: w.nx, nz: w.nz, lv, r: 1, acc: 0, accF: 0, t: 0, dur, b };
      this.smk.push(w.s);
    }
    this.smkT = 0;
  }
  _updSmoke(dt) {
    const L = this.smk, fx = this.hooks && this.hooks.fx;
    if (!L.length) return;
    for (let k = L.length - 1; k >= 0; k--) { const s = L[k]; s.t += dt; if (s.t > s.dur) L.splice(k, 1); }
    // 每 0.4 秒挑最近的 4 個來冒煙（遠的省掉）
    this.smkT -= dt;
    if (this.smkT <= 0) {
      this.smkT = 0.4;
      const vp = this.viewP || { x: 0, z: 0 };
      for (const s of L) s.dd = (s.x - vp.x) ** 2 + (s.z - vp.z) ** 2;
      this.smkSel = L.filter((s) => s.dd < 900 * 900).sort((a, b) => a.dd - b.dd).slice(0, 4);
    }
    if (fx && fx.bldSmoke) for (const s of this.smkSel) if (s.t <= s.dur) fx.bldSmoke(s, dt);
  }

  _updBlds(dt) {
    if (!this.blds) return;
    const L = this.bAnim;
    for (let k = L.length - 1; k >= 0; k--) {
      const b = L[k];
      if (b.st === 1) this._fallStep(b, dt);
      else if (b.st === 0) {
        b.t += dt; b.shk *= Math.exp(-dt * 5);
        if (b.shk < 0.01) { b.shk = 0; this._pose(b, 0, 0, 0, 0); b.anim = false; L.splice(k, 1); continue; }
        const a = b.shk * 0.3;
        this._pose(b, 0, 0, a * Math.sin(b.t * 41 + 1.3), a * Math.sin(b.t * 37));
      }
      if (b.st === 2) { b.anim = false; L.splice(k, 1); }
    }
    // 快倒的樓：偶爾呻吟、抖一下、掉點東西
    const H = this.hooks || {};
    for (const b of this.bLow) {
      if (b.st !== 0) continue;
      b.groanT -= dt;
      if (b.groanT > 0) continue;
      b.groanT = 4 + Math.random() * 4;
      b.shk = Math.max(b.shk, 0.5); this._anim(b);
      const vp = this.viewP;
      if (vp && Math.hypot(vp.x - b.cx, vp.z - b.cz) > 600) continue;
      const P = this._pv.set(b.cx, b.gy + b.top * (0.4 + Math.random() * 0.4), b.cz);
      if (H.audio && H.audio.groan) H.audio.groan(P, 0.6);
      const side = Math.random() < 0.5, n = this._nv.set(side ? (Math.random() < 0.5 ? -1 : 1) : 0, 0, side ? 0 : (Math.random() < 0.5 ? -1 : 1));
      P.x += n.x * b.w * 0.5; P.z += n.z * b.d * 0.5;
      if (H.fx && H.fx.crumble) H.fx.crumble(P, n, 1.5);
      this._chunk(P, n, 2, 1.2);
    }
    this._updChunks(dt);
    this._updSmoke(dt);
  }

  // 每次開局：全部建築復原（位置、碰撞、血量、燈、瓦礫、煙）
  resetBuildings() {
    if (!this.blds) return;
    for (const b of this.blds) {
      if (!b.dirty) continue;
      for (const g of b.seg) { g.a.array.set(g.o, g.s * 3); g.a.addUpdateRange(g.s * 3, g.o.length); g.a.needsUpdate = true; }
      if (b.bl) this._burn(b, 0);
      if (b.lamp >= 0 && this.beacon && b.st !== 0) {
        const p = this.lampSites[b.lamp];
        this.beacon.setMatrixAt(b.lamp, this._m4.makeTranslation(p.x, p.y, p.z)); this.beacon.instanceMatrix.needsUpdate = true;
      }
      b.box.top = b.top0; b.tr[0].top = b.tr[1].top = -1e4;
      b.hp = b.hpMax; b.st = 0; b.t = 0; b.u = 0; b.shk = 0; b.bl = 0; b.wn.length = 0; b.anim = false; b.slot = -1; b.dirty = false;
    }
    this.bAnim.length = 0; this.bLow.length = 0; this.nFall = 0;
    this.smk.length = 0; this.smkSel.length = 0;
    this.mSlots.fill(null); this.mNext = 0;
    for (const m of [this.mound, this.pile, this.chunkM]) m.count = 0;
    for (const c of this.ck) c.live = 0;
    this.ckN = 0;
  }

  buildProps() {
    const r = rng(77);
    const scene = this.scene;
    const dummy = new THREE.Object3D();
    const inRoad = (x, z) => {
      const B = CITY.block;
      const cx = Math.abs(x - B * Math.round(x / B)), cz = Math.abs(z - B * Math.round(z / B));
      return cx < CITY.road || cz < CITY.road;
    };
    const blocked = (x, z, pad = 1) => this.nearBoxes(x, z, pad + 2, []).some((b) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad);

    // 街道尺度參照：真正有厚度的路緣石，整座城市合成一個網格。
    const curb = new GeoBucket();
    for (const bl of this.blocks) {
      const x0 = bl.x - CITY.block / 2 + CITY.road, x1 = bl.x + CITY.block / 2 - CITY.road;
      const z0 = bl.z - CITY.block / 2 + CITY.road, z1 = bl.z + CITY.block / 2 - CITY.road, c = [0.62, 0.6, 0.55];
      for (const x of [x0, x1]) addBox(curb, x - 0.14, x + 0.14, 0, 0.16, z0, z1, c, 1.4);
      for (const z of [z0, z1]) addBox(curb, x0, x1, 0, 0.16, z - 0.14, z + 0.14, c, 1.4);
    }
    const curbMesh = new THREE.Mesh(curb.geometry(), new THREE.MeshStandardMaterial({ map: this.A.rockD, normalMap: this.A.rockN, roughness: 0.92, vertexColors: true }));
    curbMesh.receiveShadow = true; scene.add(curbMesh);

    // --- 路燈 ---
    const lamps = [];
    const B = CITY.block;
    const nearInter = (t) => Math.abs(t - B * Math.round(t / B)) < CITY.walk + 2;
    for (let k = -6; k <= 6; k++) for (let t = -CITY.half + 10; t <= CITY.half - 10; t += 45) {
      if (nearInter(t)) continue;
      for (const side of [-1, 1]) {
        const off = side * (CITY.road + 1.2);
        lamps.push([k * B + off, t, -side * Math.PI / 2]);
        lamps.push([t, k * B + off, side > 0 ? Math.PI : 0]);
      }
    }
    // 城外主幹道
    for (let t = CITY.half + 30; t < 2600; t += 60) for (const sg of [-1, 1]) for (const side of [-1, 1]) {
      const off = side * (CITY.road + 1.2);
      lamps.push([off, sg * t, -side * Math.PI / 2]);
      lamps.push([sg * t, off, side > 0 ? Math.PI : 0]);
    }
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.6, metalness: 0.6 });
    const lampMesh = new THREE.InstancedMesh(lampGeometry(), lampMat, lamps.length);
    const bulbGeo = new THREE.BoxGeometry(0.45, 0.08, 0.8).translate(0, 9.68, 2.2);
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 2.4, 0.9) });
    const bulbMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, lamps.length);
    lamps.forEach(([x, z, ry], i) => {
      const y = this.height(x, z);
      dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      lampMesh.setMatrixAt(i, dummy.matrix); bulbMesh.setMatrixAt(i, dummy.matrix);
      this.trample.push({ mesh: [lampMesh, bulbMesh], i, x, z, y, ry, r: 1.2, kind: 'lamp', down: 0 });
    });
    lampMesh.castShadow = true;
    scene.add(lampMesh, bulbMesh);

    // --- 車輛（棄置、部分燒毀） ---
    const cars = [];
    const palette = [[0.55, 0.56, 0.56], [0.05, 0.05, 0.055], [0.32, 0.05, 0.04], [0.07, 0.12, 0.22], [0.36, 0.37, 0.38], [0.62, 0.6, 0.56], [0.14, 0.17, 0.14], [0.45, 0.38, 0.28]];
    for (let k = -6; k <= 6; k++) for (let t = -CITY.half + 20; t < CITY.half - 20; t += 9 + r() * 25) {
      if (r() < 0.45 || Math.abs(t - B * Math.round(t / B)) < CITY.walk + 1) continue;
      const lane = [-10.3, -3.5, 3.5, 10.3][(r() * 4) | 0];
      const vert = r() < 0.5;
      const x = vert ? k * B + lane : t, z = vert ? t : k * B + lane;
      const ang = (vert ? Math.PI / 2 : 0) + (lane > 0 ? 0 : Math.PI) + (r() - 0.5) * (r() < 0.2 ? 1.6 : 0.15);
      const burnt = r() < 0.3;
      cars.push([x, z, ang, burnt ? [0.05 + r() * 0.04, 0.035 + r() * 0.02, 0.025] : palette[(r() * palette.length) | 0]]);
    }
    const carMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.35, vertexColors: true, map: this.A.rubD });
    carMat.onBeforeCompile = (sh) => {
      // 車身灰塵：用瓦礫貼圖當髒污遮罩（世界座標）
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCW = (modelMatrix * instanceMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
        .replace('#include <map_fragment>', `float dirt = texture2D(map, vCW.xz / 3.0 + vCW.y * 0.1).g;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.27, 0.23), smoothstep(0.3, 0.7, dirt) * 0.55);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.35, 0.95, smoothstep(0.3, 0.7, dirt));');
    };
    const carMesh = new THREE.InstancedMesh(carGeometry(), carMat, cars.length);
    cars.forEach(([x, z, a, c], i) => {
      dummy.position.set(x, 0, z); dummy.rotation.set(0, a, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      carMesh.setMatrixAt(i, dummy.matrix);
      carMesh.setColorAt(i, new THREE.Color(c[0], c[1], c[2]));
      this.trample.push({ mesh: [carMesh], i, x, z, ry: a, r: 2.6, kind: 'car', down: 0 });
    });
    carMesh.castShadow = true; carMesh.receiveShadow = true;
    scene.add(carMesh);

    // --- 樹 ---
    const trees = [];
    for (const bl of this.blocks) {
      if (bl.kind !== 'park' && bl.kind !== 'plaza') {
        // 行道樹
        continue;
      }
      const n = bl.kind === 'park' ? 40 : 14;
      for (let k = 0; k < n; k++) {
        const x = THREE.MathUtils.lerp(bl.lx0, bl.lx1, r()), z = THREE.MathUtils.lerp(bl.lz0, bl.lz1, r());
        if (bl.kind === 'plaza' && Math.hypot(x - bl.x, z - bl.z) < 30) continue;
        trees.push([x, z]);
      }
    }
    for (let k = 0; k < 900; k++) {
      const a = r() * Math.PI * 2, d = CITY.half + 60 + Math.pow(r(), 0.7) * 1400;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < 24 || Math.abs(z) < 24 || Math.max(Math.abs(x), Math.abs(z)) < CITY.half + 30) continue;
      if (fbm(x / 400, z / 400, 2, 3) < -0.05) continue; // 成片的林子
      trees.push([x, z]);
    }
    this.prepareFoliage();
    this.cityTreeMeshes=[1,3,5].map((variant,j)=>{
      const m=new THREE.InstancedMesh(this.fieldTrees[variant],this.fieldTreeMaterial,Math.floor(trees.length/3)+(j<trees.length%3?1:0));
      m.castShadow=m.receiveShadow=true;m.customDepthMaterial=this.fieldTreeDepth;m.userData.noAO=true;m.visible=!!this.fieldFoliageReady;scene.add(m);return m;
    });
    trees.forEach(([x, z], i) => {
      const treeMesh=this.cityTreeMeshes[i%3],index=Math.floor(i/3);
      const s = 0.7 + r() * 0.65, ry = r() * 6.28;
      dummy.position.set(x, this.height(x, z) - 0.2, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(s, s * (0.8 + r() * 0.5), s); dummy.updateMatrix();
      treeMesh.setMatrixAt(index, dummy.matrix);
      const v = 0.75 + r() * 0.4;
      treeMesh.setColorAt(index, new THREE.Color(v, v * (0.9 + r() * 0.2), v * 0.85));
      this.trample.push({ mesh: [treeMesh], i:index, x, z, ry, r: 1.5, kind: 'tree', down: 0, s, y: this.height(x, z) - 0.2, sy: dummy.scale.y });
    });

    // --- 瓦礫堆 ---
    const rs = this.rubbleSites || [];
    const rubGeo = new THREE.DodecahedronGeometry(1, 0);
    const rubMat = new THREE.MeshStandardMaterial({ map: this.A.rubD, normalMap: this.A.rubN, roughness: 0.95, color: 0x8a8580 });
    const rubMesh = new THREE.InstancedMesh(rubGeo, rubMat, rs.length * 3);
    let ri = 0;
    for (const [x, z, s] of rs) for (let k = 0; k < 3; k++) {
      dummy.position.set(x + (r() - 0.5) * s, s * 0.15, z + (r() - 0.5) * s);
      dummy.rotation.set(r() * 3, r() * 3, r() * 3);
      dummy.scale.set(s * (0.6 + r() * 0.6), s * (0.25 + r() * 0.3), s * (0.6 + r() * 0.6));
      dummy.updateMatrix(); rubMesh.setMatrixAt(ri++, dummy.matrix);
    }
    rubMesh.castShadow = rubMesh.receiveShadow = true;
    scene.add(rubMesh);

    // --- 高壓電塔與電線 ---
    const pylGeo = pylonGeometry();
    const pylMat = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.55, metalness: 0.7 });
    const pyl = [];
    for (let k = 0; k < 14; k++) {
      const x = -1500 + k * 230, z = -980 + Math.sin(k * 0.7) * 40;
      pyl.push(new THREE.Vector3(x, this.height(x, z), z));
    }
    for (let k = 0; k < 10; k++) {
      const z = -1400 + k * 260, x = 1000 + Math.cos(k * 0.5) * 50;
      pyl.push(new THREE.Vector3(x, this.height(x, z), z));
    }
    const pylMesh = new THREE.InstancedMesh(pylGeo, pylMat, pyl.length);
    pyl.forEach((p, i) => {
      dummy.position.copy(p); dummy.rotation.set(0, i < 14 ? 0 : Math.PI / 2, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      pylMesh.setMatrixAt(i, dummy.matrix);
    });
    pylMesh.castShadow = true;
    scene.add(pylMesh);
    const wirePts = [];
    const addWires = (A, B, rot) => {
      for (const [dx, y] of [[-9, 30], [9, 30], [-6.6, 38], [6.6, 38], [-4.2, 44], [4.2, 44]]) {
        const a = A.clone().add(rot ? new THREE.Vector3(0, y, dx) : new THREE.Vector3(dx, y, 0));
        const b = B.clone().add(rot ? new THREE.Vector3(0, y, dx) : new THREE.Vector3(dx, y, 0));
        let prev = a;
        for (let s = 1; s <= 16; s++) {
          const t = s / 16;
          const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * 9;
          wirePts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z); prev = p;
        }
      }
    };
    for (let k = 0; k < 13; k++) addWires(pyl[k], pyl[k + 1], false);
    for (let k = 14; k < pyl.length - 1; k++) addWires(pyl[k], pyl[k + 1], true);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8 })));

    // 大樓屋頂航空障礙燈
    if (this.lampSites.length) {
      const g = new THREE.SphereGeometry(0.6, 8, 6);
      const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 0.6, 0.4) }), this.lampSites.length);
      this.lampSites.forEach((p, i) => { dummy.position.copy(p); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
      scene.add(m);
      this.beacon = m;
    }

    // 踩踏格
    this._indexTrample();
    this.dummy = dummy;
    this.falling = [];
  }

  _indexTrample() {
    this.tgrid = new Map();
    this.trample.forEach((o, i) => {
      const k = Math.floor(o.x / 20) * 10007 + Math.floor(o.z / 20);
      if (!this.tgrid.has(k)) this.tgrid.set(k, []);
      this.tgrid.get(k).push(i);
    });
  }

  // 機體腳步 / 衝刺碰到街道物件 → 壓扁或推倒
  stomp(x, z, radius, dirX = 0, dirZ = 0, onHit = null) {
    for (let gx = Math.floor((x - radius) / 20); gx <= Math.floor((x + radius) / 20); gx++)
      for (let gz = Math.floor((z - radius) / 20); gz <= Math.floor((z + radius) / 20); gz++) {
        const l = this.tgrid.get(gx * 10007 + gz);
        if (!l) continue;
        for (const i of l) {
          const o = this.trample[i];
          if (o.down) continue;
          if (Math.hypot(o.x - x, o.z - z) > radius + o.r) continue;
          o.down = 1;
          if (o.kind === 'car') {
            const d = this.dummy;
            d.position.set(o.x, -0.1, o.z); d.rotation.set((Math.random() - 0.5) * 0.2, o.ry, (Math.random() - 0.5) * 0.3); d.scale.set(1.08, 0.32, 1.12); d.updateMatrix();
            o.mesh[0].setMatrixAt(o.i, d.matrix); o.mesh[0].instanceMatrix.needsUpdate = true;
            o.mesh[0].setColorAt(o.i, new THREE.Color(0.06, 0.055, 0.05)); o.mesh[0].instanceColor.needsUpdate = true;
          } else {
            let ax = o.x - x, az = o.z - z;
            if (dirX || dirZ) { ax = dirX; az = dirZ; }
            const L = Math.hypot(ax, az) || 1;
            o.fx = ax / L; o.fz = az / L; o.t = 0;
            this.falling.push(o);
          }
          if (onHit) onHit(o);
        }
      }
  }

  update(dt) {
    const d = this.dummy;
    for (let k = this.falling.length - 1; k >= 0; k--) {
      const o = this.falling[k];
      o.t = Math.min(1, o.t + dt * 1.6);
      const ang = (o.t * o.t) * Math.PI / 2 * 0.97;
      // 沿倒下方向繞地面軸旋轉
      const axis = new THREE.Vector3(o.fz, 0, -o.fx);
      d.position.set(o.x, o.y || 0, o.z);
      d.quaternion.setFromAxisAngle(axis, ang).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.ry));
      if (o.kind === 'tree') d.scale.set(o.s, o.sy, o.s); else d.scale.setScalar(1);
      d.updateMatrix();
      for (const m of o.mesh) { m.setMatrixAt(o.i, d.matrix); m.instanceMatrix.needsUpdate = true; }
      if (o.t >= 1) {
        this.falling.splice(k, 1);
        if (o.kind === 'lamp') { // 燈熄
          const dm = new THREE.Matrix4().makeScale(0, 0, 0);
          o.mesh[1].setMatrixAt(o.i, dm); o.mesh[1].instanceMatrix.needsUpdate = true;
        }
      }
    }
    if (this.beacon) this.beacon.visible = this.battlefield === 'city' && (performance.now() % 1500) < 700;
    this._updBlds(dt);
  }

  // 陰影相機跟隨玩家（對齊貼圖像素避免閃爍）
  followShadow(p) {
    this.viewP = p;
    const s = this.sun;
    // 每兩格重畫一次影子：不動的城市看不出差別，會動的機體影子晚 1/60 秒
    this._shF = !this._shF;
    if (this._shF) s.shadow.needsUpdate = true;
    const size = (s.shadow.camera.right - s.shadow.camera.left) / s.shadow.mapSize.x;
    const z = this.lightDir;
    const x = new THREE.Vector3(0, 1, 0).cross(z).normalize();
    const y = z.clone().cross(x);
    const px = Math.round(p.dot(x) / size) * size, py = Math.round(p.dot(y) / size) * size, pz = p.dot(z);
    const c = x.multiplyScalar(px).addScaledVector(y, py).addScaledVector(z, pz);
    s.target.position.copy(c);
    s.position.copy(c).addScaledVector(z, 1200);
    s.target.updateMatrixWorld();
  }
}
