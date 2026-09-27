// 世界：真實天空（HDR 照明 + 高解析天空圖）、高度霧、地形與道路、城市、可踩倒的街道物件、碰撞查詢。
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFacade, FACADE_TILE } from './textures.js';

const ASSET = './assets/';
export const CITY = { block: 120, road: 14, walk: 18, half: 740 };
const SKY_ELEV_MIN = -10; // 天空圖裁到 -10°

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- 資源載入
export async function loadAssets(renderer, onProgress = () => {}) {
  const tl = new THREE.TextureLoader();
  let done = 0; const total = 13 + FACADES.length * 3 + 4;
  const step = (x) => { done++; onProgress(done / total); return x; };
  const T = (name, srgb = false, rep = 1) => tl.loadAsync(ASSET + name).then((t) => {
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
      fogCol: { value: fog.clone() }, sunFog: { value: sunFog.clone() },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform sampler2D map; uniform float gain; uniform vec3 sunDir, fogCol, sunFog; varying vec3 vDir;
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
  const ridge = 1 - Math.abs(noise.noise(x / 800, 7.3, z / 800));
  h += m * (ridge * ridge * 520 + fbm(x / 380, z / 380, 4, 9) * 160 + 80);
  // 主幹道兩條往外延伸：路面整平
  const onRoad = Math.max(1 - smooth(20, 70, Math.abs(x)), 1 - smooth(20, 70, Math.abs(z)));
  if (onRoad > 0 && r > 700) h = THREE.MathUtils.lerp(h, h * 0.35, onRoad * (1 - m * 0.7));
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
    const fx = (x + size / 2) / cell, fz = (z + size / 2) / cell;
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
}

// 地面材質：草地／岩壁／柏油路／人行道／空地，道路標線全部在 shader 裡算
function terrainMaterial(A) {
  const mat = new THREE.MeshStandardMaterial({
    map: A.grassD, normalMap: A.grassN, roughnessMap: A.grassA, aoMap: A.grassA,
    normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1, metalness: 0,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      asphD: { value: A.asphD }, asphN: { value: A.asphN }, asphA: { value: A.asphA },
      rubD: { value: A.rubD }, rubN: { value: A.rubN }, rockD: { value: A.rockD }, rockN: { value: A.rockN },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying vec3 vTN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTW = (modelMatrix * vec4(transformed,1.0)).xyz;\nvTN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D asphD, asphN, asphA, rubD, rubN, rockD, rockN;
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
        vec4 G = ground(vTW.xz);
        vec3 grass = texture2D(map, vMapUv).rgb;
        vec3 grass2 = texture2D(map, vMapUv * 0.21 + 0.37).rgb;
        grass = mix(grass, grass2, 0.4);
        float macro = tfbm(vTW.xz / 260.0);
        float dry = tfbm(vTW.xz / 90.0 + 7.0);
        grass *= mix(0.72, 1.18, macro);
        grass = mix(grass, grass * vec3(1.18, 1.05, 0.72), smoothstep(0.45, 0.75, dry) * 0.6);
        vec3 rock = texture2D(rockD, vTW.xz / 45.0).rgb * vec3(0.95, 0.92, 0.88);
        float slope = 1.0 - normalize(vTN).y;
        float rk = smoothstep(0.16, 0.32, slope + (macro - 0.5) * 0.25);
        vec3 base = mix(grass, rock, rk);
        vec3 asph = texture2D(asphD, vTW.xz / 7.0).rgb;
        asph *= mix(0.85, 1.12, tfbm(vTW.xz / 23.0));
        vec3 rub = texture2D(rubD, vTW.xz / 6.0).rgb;
        vec3 walkC = asph * 1.55 + 0.03;
        float tile = max(aaLine(abs(fract(vTW.x / 2.0) - 0.5) , 0.02), aaLine(abs(fract(vTW.z / 2.0) - 0.5), 0.02));
        walkC *= 1.0 - tile * 0.35;
        float inCity = 1.0 - smoothstep(${(CITY.half - 10).toFixed(1)}, ${(CITY.half + 40).toFixed(1)}, max(abs(vTW.x), abs(vTW.z)));
        vec3 lot = mix(rub * 0.9, grass * 0.8, smoothstep(0.35, 0.65, tfbm(vTW.xz / 30.0)));
        base = mix(base, lot, inCity * (1.0 - G.x) * (1.0 - G.y));
        base = mix(base, walkC, G.y);
        vec3 roadC = asph;
        roadC = mix(roadC, vec3(0.62), G.z * 0.85 * (0.75 + 0.25 * tn(vTW.xz * 3.0)));
        roadC = mix(roadC, vec3(0.62, 0.45, 0.10), G.w * 0.8);
        base = mix(base, roadC, G.x);
        diffuseColor.rgb *= base;
        float isGrass = (1.0 - G.x) * (1.0 - G.y) * (1.0 - inCity * 0.6);
      `)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        float rG = texture2D(roughnessMap, vRoughnessMapUv).g;
        float rA = texture2D(asphA, vTW.xz / 7.0).g;
        roughnessFactor = mix(0.72 + rA * 0.28, rG, isGrass);
        roughnessFactor = mix(roughnessFactor, 0.55, G.z * 0.6);
      `)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `
        vec3 nG = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        vec3 nA = texture2D( asphN, vTW.xz / 7.0 ).xyz * 2.0 - 1.0;
        vec3 nR = texture2D( rockN, vTW.xz / 45.0 ).xyz * 2.0 - 1.0;
        vec3 mapN = mix( mix(nG, nR, rk), nA * vec3(0.8,0.8,1.0), 1.0 - isGrass );
        mapN = mix( mapN, vec3(0.0,0.0,1.0), (G.z + G.w) * 0.8 );
      `);
  };
  return mat;
}

// ---------------------------------------------------------------- 建築幾何
class GeoBucket {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.b = []; }
  quad(a, b, c, d, n, uvs, col) {
    const base = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) { this.n.push(n[0], n[1], n[2]); this.c.push(col[0], col[1], col[2]); this.b.push(col[3] || 0); }
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
    g.setIndex(this.i);
    return g;
  }
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

// 照片立面＋隨機亮燈窗＋煙燻／雨痕／燒焦
function buildingMaterial(A, fi) {
  const F = FACADES[fi], [col, nor, arm] = A.fac[fi];
  const m = new THREE.MeshStandardMaterial({
    map: col, normalMap: nor, aoMap: arm, roughnessMap: arm, roughness: 1, metalness: 0.0,
    aoMapIntensity: 1.0, vertexColors: true, envMapIntensity: 1.2,
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
        roughnessFactor = mix(roughnessFactor, 0.95, bfac);`)
      .replace('#include <emissivemap_fragment>', `
        vec2 cell = floor(vMapUv * vec2(${F.cols.toFixed(1)}, ${F.rows.toFixed(1)}));
        float hsh = bh(cell * 1.37 + floor(vBW.xz / 6.0) * 0.013);
        float lit = step(hsh, ${F.lit.toFixed(3)}) * (1.0 - vBurn);
        float fire = step(0.93, hsh) * vBurn * (0.7 + 0.3 * bn(vec2(cell.x * 3.0, cell.y * 3.0)));
        vec3 wc = mix(vec3(1.0, 0.62, 0.3), vec3(0.95, 0.85, 0.7), step(0.7, bh(cell + 3.1)));
        totalEmissiveRadiance = (wc * lit * 0.55 + vec3(3.0, 0.9, 0.2) * fire) * winMask * (0.4 + 0.6 * bh(cell + 9.7));`);
  };
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
      const s = 1 + (r() - 0.5) * 0.35;
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.85, p.getZ(i) * s);
    }
    g.translate((r() - 0.5) * 1.2, 5.5 + k * 1.6, (r() - 0.5) * 1.2);
    parts.push(g);
  }
  const cols = [];
  parts.forEach((g, i) => {
    const n = g.attributes.position.count;
    const c = i === 0 ? [0.25, 0.18, 0.12] : [0.2 + i * 0.03, 0.3 + i * 0.03, 0.12];
    for (let k = 0; k < n; k++) cols.push(...c);
  });
  const nonIdx = parts.map((g) => g.index ? g.toNonIndexed() : g);
  const m = mergeGeometries(nonIdx);
  m.setAttribute('color', new THREE.Float32BufferAttribute(cols.slice(0, m.attributes.position.count * 3), 3));
  m.computeVertexNormals();
  return m;
}

function carGeometry() {
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
  constructor(renderer, scene, A) {
    this.scene = scene;
    this.A = A;
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
    const lightEl = Math.max(el, THREE.MathUtils.degToRad(11));
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
    scene.add(makeSkyDome(A.sky, this.sunDir, fog, sunFog, this.skyGain));

    const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.7, 0.45), 6.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    sc.left = -260; sc.right = 260; sc.top = 260; sc.bottom = -260; sc.near = 10; sc.far = 2400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.9;
    scene.add(sun, sun.target);
    this.sun = sun;
    const hemi = new THREE.HemisphereLight(0x7f98c0, 0x3a2e24, 0.12);
    scene.add(hemi);

    // 地形
    this.terrain = new Terrain();
    const tmesh = new THREE.Mesh(this.terrain.geometry(), terrainMaterial(A));
    tmesh.receiveShadow = true;
    scene.add(tmesh);
    this.terrainMesh = tmesh;

    this.buildCity();
    this.buildProps();
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
    const roofMat = new THREE.MeshStandardMaterial({ map: this.A.asphD, normalMap: this.A.asphN, roughness: 0.95, vertexColors: true, color: 0x9a9690 });
    patchGroundAO(roofMat);
    const inner = new THREE.MeshStandardMaterial({ color: 0x16130f, roughness: 1, vertexColors: true });
    const CH = 3; // 3×3 區塊
    const buckets = [];
    for (let i = 0; i < CH * CH; i++) buckets.push({ f: FACADES.map(() => new GeoBucket()), roof: new GeoBucket(), inner: new GeoBucket() });
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
      // 切成 1~4 棟
      const lots = [];
      const split = r();
      if (split < 0.3) lots.push([lx0, lx1, lz0, lz1]);
      else if (split < 0.65) { const m = THREE.MathUtils.lerp(lx0, lx1, 0.4 + r() * 0.2); lots.push([lx0, m - 3, lz0, lz1], [m + 3, lx1, lz0, lz1]); }
      else { const mx = THREE.MathUtils.lerp(lx0, lx1, 0.4 + r() * 0.2), mz = THREE.MathUtils.lerp(lz0, lz1, 0.4 + r() * 0.2);
        lots.push([lx0, mx - 3, lz0, mz - 3], [mx + 3, lx1, lz0, mz - 3], [lx0, mx - 3, mz + 3, lz1], [mx + 3, lx1, mz + 3, lz1]); }
      for (const [a0, a1, c0, c1] of lots) {
        if (r() < 0.12) continue;
        const sh = 0.04 * (a1 - a0);
        const x0 = a0 + r() * sh * 2, x1 = a1 - r() * sh * 2, z0 = c0 + r() * sh * 2, z1 = c1 - r() * sh * 2;
        const floors = Math.max(3, Math.round((8 + r() * r() * 42) * hScale * (kind === 'ruin' ? 0.8 : 1)));
        const H = floors * 3.6;
        const ruin = kind === 'ruin' ? true : r() < 0.08;
        // 0 玻璃帷幕 1 辦公 2 紅磚 3 混凝土 4 磚柱
        const style = ruin ? 2 + ((r() * 3) | 0) : (H > 75 ? (r() < 0.6 ? 0 : 1) : H > 45 ? [1, 3, 4, 0][(r() * 4) | 0] : 2 + ((r() * 3) | 0));
        const F = FACADES[style];
        const tint = 0.8 + r() * 0.3;
        const col = [tint, tint * (0.97 + r() * 0.05), tint * (0.93 + r() * 0.07), ruin ? 0.75 + r() * 0.25 : (r() < 0.15 ? 0.35 : 0)];
        const uo = Math.floor(r() * 8) / 8, vo = Math.floor(r() * 8) / 8;
        const bk = chunkOf((x0 + x1) / 2, (z0 + z1) / 2);
        if (!ruin) {
          addWalls(bk.f[style], x0, x1, z0, z1, 0, H, col, uo, 0, null, F);
          const rc = [0.75, 0.75, 0.75];
          addBox(bk.roof, x0, x1, H - 0.01, H, z0, z1, rc, 12);
          // 女兒牆
          const pw = 0.6, ph = 1.2;
          addBox(bk.roof, x0, x1, H, H + ph, z0, z0 + pw, rc); addBox(bk.roof, x0, x1, H, H + ph, z1 - pw, z1, rc);
          addBox(bk.roof, x0, x0 + pw, H, H + ph, z0, z1, rc); addBox(bk.roof, x1 - pw, x1, H, H + ph, z0, z1, rc);
          // 屋頂設備
          const nEq = 1 + ((r() * 4) | 0);
          for (let k = 0; k < nEq; k++) {
            const ew = 3 + r() * 8, ed = 3 + r() * 8, eh = 2 + r() * 4;
            const ex = THREE.MathUtils.lerp(x0 + 2, x1 - 2 - ew, r()), ez = THREE.MathUtils.lerp(z0 + 2, z1 - 2 - ed, r());
            addBox(bk.roof, ex, ex + ew, H, H + eh, ez, ez + ed, [0.6, 0.6, 0.62]);
          }
          // 塔樓頂層退縮
          if (H > 60 && r() < 0.6) {
            const ix = (x1 - x0) * 0.2, iz = (z1 - z0) * 0.2, H2 = H + 3.6 * (2 + ((r() * 6) | 0));
            addWalls(bk.f[style], x0 + ix, x1 - ix, z0 + iz, z1 - iz, H, H2, col, uo, 0, null, F);
            addBox(bk.roof, x0 + ix, x1 - ix, H2 - 0.01, H2, z0 + iz, z1 - iz, rc, 12);
            if (r() < 0.5) this.lampSites.push(new THREE.Vector3((x0 + x1) / 2, H2 + 8, (z0 + z1) / 2)); // 屋頂紅燈
            addBox(bk.roof, (x0 + x1) / 2 - 0.3, (x0 + x1) / 2 + 0.3, H2, H2 + 8, (z0 + z1) / 2 - 0.3, (z0 + z1) / 2 + 0.3, [0.4, 0.4, 0.4]);
          }
          this.addCollider({ x0, x1, z0, z1, top: H + 0.2 });
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
        const g = bk.f[s].geometry();
        if (g) { const m = new THREE.Mesh(g, fmats[s]); m.castShadow = m.receiveShadow = true; this.scene.add(m); }
      }
      const rg = bk.roof.geometry();
      if (rg) { const m = new THREE.Mesh(rg, roofMat); m.castShadow = m.receiveShadow = true; this.scene.add(m); }
      const ig = bk.inner.geometry();
      if (ig) { const m = new THREE.Mesh(ig, inner); m.castShadow = true; m.receiveShadow = true; this.scene.add(m); }
    }
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
    const treeMat = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true });
    const treeMesh = new THREE.InstancedMesh(treeGeometry(), treeMat, trees.length);
    trees.forEach(([x, z], i) => {
      const s = 0.8 + r() * 0.9, ry = r() * 6.28;
      dummy.position.set(x, this.height(x, z) - 0.2, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(s, s * (0.8 + r() * 0.5), s); dummy.updateMatrix();
      treeMesh.setMatrixAt(i, dummy.matrix);
      const v = 0.75 + r() * 0.4;
      treeMesh.setColorAt(i, new THREE.Color(v, v * (0.9 + r() * 0.2), v * 0.85));
      this.trample.push({ mesh: [treeMesh], i, x, z, ry, r: 1.5, kind: 'tree', down: 0, s, y: this.height(x, z) - 0.2, sy: dummy.scale.y });
    });
    treeMesh.castShadow = true; treeMesh.receiveShadow = true;
    scene.add(treeMesh);

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
    this.tgrid = new Map();
    this.trample.forEach((o, i) => {
      const k = Math.floor(o.x / 20) * 10007 + Math.floor(o.z / 20);
      if (!this.tgrid.has(k)) this.tgrid.set(k, []);
      this.tgrid.get(k).push(i);
    });
    this.dummy = dummy;
    this.falling = [];
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
    if (this.beacon) this.beacon.visible = (performance.now() % 1500) < 700;
  }

  // 陰影相機跟隨玩家（對齊貼圖像素避免閃爍）
  followShadow(p) {
    const s = this.sun;
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
