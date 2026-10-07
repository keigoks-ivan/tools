// 創業之城：天空、時間／天氣關鍵影格、河岸、遠方街區、山的剪影、雨絲
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wetStd, windowStd } from './city-kit.js';

const C = (h) => new THREE.Color(h);
// 時間關鍵影格。hour 之間線性內插。傍晚 17.7 = 使用者看過、滿意的樣張色調
const KF = [
  { h: 0,    top: '#060a1f', mid: '#0e1740', hor: '#25346a', sunC: '#7f95e0', sunI: 1.15, el: 48, hemS: '#3a4a9a', hemG: '#222036', hemI: 1.15, expo: 1.25, night: 1,    amb: 0.4,  fog: '#1c2650' },
  { h: 5,    top: '#060a1f', mid: '#0e1740', hor: '#25346a', sunC: '#7f95e0', sunI: 1.15, el: 48, hemS: '#3a4a9a', hemG: '#222036', hemI: 1.15, expo: 1.25, night: 1,    amb: 0.4,  fog: '#1c2650' },
  { h: 6.3,  top: '#46508f', mid: '#d98aa0', hor: '#ffbf8a', sunC: '#ffb98a', sunI: 2.3,  el: 8,  hemS: '#9aa6e6', hemG: '#7a6064', hemI: 0.95, expo: 1.1,  night: 0.45, amb: 0.7,  fog: '#e8a888' },
  { h: 8,    top: '#4f93e0', mid: '#93c4ee', hor: '#cfe3f2', sunC: '#fff0d6', sunI: 3.3,  el: 32, hemS: '#b4cdf5', hemG: '#8a8272', hemI: 1.1,  expo: 1.1,  night: 0,    amb: 1,    fog: '#c9dcec' },
  { h: 12,   top: '#2f7fe0', mid: '#7db6ee', hor: '#c4def2', sunC: '#ffffff', sunI: 4.0,  el: 66, hemS: '#bcd4ff', hemG: '#8e8878', hemI: 1.15, expo: 1.05, night: 0,    amb: 1,    fog: '#bcd6ea' },
  { h: 16,   top: '#4a86d8', mid: '#9dc0e6', hor: '#ead9bd', sunC: '#ffe2b6', sunI: 3.7,  el: 40, hemS: '#b4c6ee', hemG: '#8a7a6a', hemI: 1.1,  expo: 1.1,  night: 0,    amb: 0.95, fog: '#e2d5c0' },
  { h: 17.7, top: '#242256', mid: '#5b4088', hor: '#f0a070', sunC: '#ffb072', sunI: 3.9,  el: 26, hemS: '#a9b6f0', hemG: '#8a6a64', hemI: 1.15, expo: 1.12, night: 0.85, amb: 0.8,  fog: '#c98a98' },
  { h: 19,   top: '#1a1c4c', mid: '#44357a', hor: '#b0577a', sunC: '#ff7a5a', sunI: 1.6,  el: 9,  hemS: '#6c78c8', hemG: '#5a4050', hemI: 1.0,  expo: 1.15, night: 1,    amb: 0.55, fog: '#8a5078' },
  { h: 20.5, top: '#060a1f', mid: '#0e1740', hor: '#25346a', sunC: '#7f95e0', sunI: 1.15, el: 48, hemS: '#3a4a9a', hemG: '#222036', hemI: 1.15, expo: 1.25, night: 1,    amb: 0.4,  fog: '#1c2650' },
  { h: 24,   top: '#060a1f', mid: '#0e1740', hor: '#25346a', sunC: '#7f95e0', sunI: 1.15, el: 48, hemS: '#3a4a9a', hemG: '#222036', hemI: 1.15, expo: 1.25, night: 1,    amb: 0.4,  fog: '#1c2650' },
].map(k => ({ ...k, top: C(k.top), mid: C(k.mid), hor: C(k.hor), sunC: C(k.sunC), hemS: C(k.hemS), hemG: C(k.hemG), fog: C(k.fog) }));

const NUM = ['sunI', 'el', 'hemI', 'expo', 'night', 'amb'], COL = ['top', 'mid', 'hor', 'sunC', 'hemS', 'hemG', 'fog'];
const GREY_RAIN = C('#59606f'), GREY_CLOUD = C('#9aa3b2');
function lerpKF(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0; while (i < KF.length - 2 && h > KF[i + 1].h) i++;
  const a = KF[i], b = KF[i + 1], t = THREE.MathUtils.clamp((h - a.h) / (b.h - a.h), 0, 1);
  const o = { hour: h };
  NUM.forEach(k => o[k] = a[k] + (b[k] - a[k]) * t);
  COL.forEach(k => o[k] = a[k].clone().lerp(b[k], t));
  return o;
}
// 取得某個時間＋天氣下的環境參數
export function sampleEnv(hour, cloud, rain) {
  const o = lerpKF(hour);
  const luma = (c) => c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  const gray = (c, k) => { const l = luma(c); return new THREE.Color(l * 0.95, l * 1.0, l * 1.1).multiplyScalar(k); };
  const g = Math.max(cloud, rain);
  if (g > 0) {
    const dayK = 1 - o.night * 0.6;
    for (const k of ['top', 'mid', 'hor', 'fog']) o[k].lerp(gray(o[k], 0.82 - 0.14 * rain), 0.72 * g);
    o.sunI *= 1 - 0.74 * g; o.hemI *= 1 + 0.12 * g * dayK; o.expo *= 1 - 0.05 * rain;
    o.sunC.lerp(GREY_CLOUD, 0.5 * g); o.night = Math.min(1, o.night + 0.3 * g * (1 - o.night));
  }
  o.fogD = 0.0021 + 0.0022 * cloud + 0.0038 * rain;
  o.cloud = g; o.rain = rain;
  return o;
}
export const sunDirFor = (env) => {
  const t = THREE.MathUtils.clamp((env.hour - 6) / 12, 0, 1);
  const hx = Math.cos(t * Math.PI), hz = 0.15 + 0.6 * t, hl = Math.hypot(hx, hz);
  const el = env.el * Math.PI / 180;
  return new THREE.Vector3(hx / hl * Math.cos(el), Math.sin(el), hz / hl * Math.cos(el));
};

// ---------- 天空穹頂 ----------
const SKY_FRAG = `
uniform vec3 uTop, uMid, uHor, uSunDir, uSunCol; uniform float uNight, uCloud, uRain, uTime, uGain;
varying vec3 vDir;
float h13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float h12(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h12(i), h12(i+vec2(1,0)), f.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for(int i=0;i<5;i++){ s += a*vn(p); p = p*2.03 + 7.1; a *= .5; } return s; }
void main(){
  vec3 d = normalize(vDir); float y = d.y;
  vec3 c = mix(uHor, uMid, smoothstep(-0.02, 0.3, y));
  c = mix(c, uTop, smoothstep(0.25, 0.9, y));
  c = mix(c, uHor * 0.75, smoothstep(0.0, -0.25, y));
  float sd = max(dot(d, uSunDir), 0.0);
  float vis = smoothstep(-0.08, 0.12, uSunDir.y);
  c += uSunCol * (pow(sd, 22.0) * 0.32 + pow(sd, 700.0) * 2.4) * (1.0 - uCloud * 0.85) * vis * (1.0 - uNight * 0.6);
  float st = step(0.9975, h13(floor(d * 520.0))) * smoothstep(0.12, 0.4, y) * pow(uNight, 8.0) * (1.0 - uCloud);
  c += vec3(0.85, 0.92, 1.0) * st * 1.6;
  if (y > 0.0) {
    vec2 cp = d.xz / (y + 0.22) * 1.9 + vec2(uTime * 0.012, uTime * 0.004);
    float f = fbm(cp);
    float th = mix(0.6, 0.32, uCloud);
    float cm = smoothstep(th, th + 0.22, f) * smoothstep(0.0, 0.16, y) * mix(0.55, 1.0, uCloud);
    vec3 cc = mix(uHor * 0.55 + vec3(0.5) * (1.0 - uNight), vec3(dot(uMid, vec3(0.33))) * 0.92, uCloud);
    cc = mix(cc, uHor * 0.5, uNight * 0.7);
    c = mix(c, cc, cm);
  }
  gl_FragColor = vec4(c * uGain, 1.0);
}`;
export function createSky() {
  const uniforms = {
    uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() }, uNight: { value: 0 }, uCloud: { value: 0 }, uRain: { value: 0 }, uTime: { value: 0 }, uGain: { value: 1.25 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
    fragmentShader: SKY_FRAG,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
  dome.renderOrder = -10; dome.frustumCulled = false;
  // 給 PMREM 用的副本（共用 uniform）
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 16), mat); envScene.add(envDome);
  return { dome, uniforms, envScene };
}

// ---------- 雨絲 ----------
export function createRain(N = 2600) {
  const pos = new Float32Array(N * 6), seed = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 2, z = (Math.random() - 0.5) * 2, y = Math.random();
    for (let k = 0; k < 2; k++) { pos[i * 6 + k * 3] = x; pos[i * 6 + k * 3 + 1] = y; pos[i * 6 + k * 3 + 2] = z; seed[i * 2 + k] = k; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(seed, 1));
  const u = { uTime: { value: 0 }, uAmt: { value: 0 }, uSize: { value: 30 }, uCol: { value: new THREE.Color('#c8d4ee') } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute float aEnd; uniform float uTime, uSize; varying float vA;
      void main(){
        vec3 p = position; float sp = 0.9 + fract(p.x * 91.7 + p.z * 37.3) * 0.5;
        float y = fract(p.y - uTime * sp * 0.9);
        vec3 w = vec3(p.x * uSize, y * uSize * 0.7, p.z * uSize);
        w.x += y * 2.0 * uSize * 0.02 - aEnd * 0.0;
        float len = uSize * 0.028;
        w.y += aEnd * len; w.x -= aEnd * len * 0.18;
        vA = (1.0 - aEnd * 0.6) * smoothstep(0.0, 0.08, y) * 0.55;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: 'uniform vec3 uCol; uniform float uAmt; varying float vA; void main(){ gl_FragColor = vec4(uCol * 2.0, vA * uAmt); }',
  });
  const lines = new THREE.LineSegments(g, m);
  lines.frustumCulled = false; lines.renderOrder = 20;
  return { lines, u };
}

// ---------- 河岸、遠方街區、山 ----------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createScenery(root, { W, D, M }) {
  const Rf = rng(8841);
  const noise = new ImprovedNoise();
  const stone = wetStd(0x8f8794, 1), stoneDark = wetStd(0x5a5260, 1), asphalt = wetStd(0x3b3745, 0.9), sidew = wetStd(0x8a8590, 0.95), parkMat = wetStd(0x6d9a54, 1);

  // 水面
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1f5f86, roughness: 0.16, metalness: 0.0, envMapIntensity: 1.6 });
  const wU = { uT: { value: 0 } };
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = wU.uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPw = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPw;\nuniform float uT;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + vec3(sin(vWPw.x*4.9+uT*1.1)*0.007 + sin(vWPw.z*7.1-uT*0.8)*0.005, 0.0, cos(vWPw.z*4.6+uT*0.9)*0.007 + cos(vWPw.x*6.7+uT*1.3)*0.005));`);
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(W / 2, -0.7, D / 2); water.receiveShadow = true; root.add(water);

  // 陸地塊（上面柏油，側面石砌護岸）
  function landSlab(x0, x1, z0, z1) {
    const mats = [stone, stone, asphalt, stoneDark, stone, stone];
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.4, z1 - z0), mats);
    m.position.set((x0 + x1) / 2, -0.7 - 0.002, (z0 + z1) / 2); m.receiveShadow = true; root.add(m);
  }
  // 護岸頂緣（細長亮邊）
  function coping(x0, x1, z0, z1) {
    const t = 0.1, h = 0.04, mats = sidew;
    [[(x0 + x1) / 2, z0 + t / 2, x1 - x0, t], [(x0 + x1) / 2, z1 - t / 2, x1 - x0, t], [x0 + t / 2, (z0 + z1) / 2, t, z1 - z0], [x1 - t / 2, (z0 + z1) / 2, t, z1 - z0]]
      .forEach(([x, z, w, d]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats); m.position.set(x, h / 2, z); root.add(m); });
  }
  // 城市主底座護岸
  const cityRect = [-M, W + M, -M, D + M];
  coping(...cityRect);

  // 遠方街區：instanced 方塊（窗格＋夜間亮燈）、公園樹
  const lands = [
    { x0: -92, x1: -6.5, z0: -6.5, z1: 46 },   // 西
    { x0: -92, x1: 112, z0: -96, z1: -6.5 },    // 北
    { x0: W + M + 6, x1: Math.max(112, W + 70), z0: -6.5, z1: Math.max(38, D + 10) }, // 東岸位於可經營城市之外
  ];
  const boxes = [], plates = [], parks = [];
  const clusters = [[-34, -36, 20], [34, -34, 16], [-44, 6, 12]];
  const PAL = ['#cfc7cc', '#bba9b8', '#aab2c8', '#d6bba6', '#a0a5b2', '#c8b9a7', '#9fb0c4'];
  for (const L of lands) {
    landSlab(L.x0, L.x1, L.z0, L.z1); coping(L.x0, L.x1, L.z0, L.z1);
    for (let cx = Math.ceil((L.x0 + 2.5) / 4) * 4 - 2; cx <= L.x1 - 2; cx += 4) for (let cz = Math.ceil((L.z0 + 2.5) / 4) * 4 - 2; cz <= L.z1 - 2; cz += 4) {
      if (cx - 1.7 < L.x0 + 0.4 || cx + 1.7 > L.x1 - 0.4 || cz - 1.7 < L.z0 + 0.4 || cz + 1.7 > L.z1 - 0.4) continue;
      if (L === lands[0] && cz < -4) continue;
      if (L === lands[2] && cz < -4) continue;
      plates.push([cx, cz]);
      const r = Rf();
      if (r < 0.14) { parks.push([cx, cz]); continue; }
      let hMax = 1.2;
      for (const [kx, kz, s] of clusters) hMax += 6.5 * Math.exp(-((cx - kx) ** 2 + (cz - kz) ** 2) / (2 * s * s));
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const w = 1.0 + Rf() * 0.45, d = 1.0 + Rf() * 0.45, hh = 0.5 + (0.25 + 0.75 * Rf() * Rf() * 1.4) * hMax * (0.5 + Rf() * 0.7);
        boxes.push({ x: cx - 0.72 + a * 1.44 + (Rf() - 0.5) * 0.1, z: cz - 0.72 + b * 1.44 + (Rf() - 0.5) * 0.1, w, d, h: hh, c: hh > 6 ? '#8aa0c0' : PAL[Math.floor(Rf() * PAL.length)] });
      }
    }
  }
  // 方塊建築
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const bMat = windowStd({ dense: true });
  const farB = new THREE.InstancedMesh(bGeo, bMat, boxes.length);
  const tint = new Float32Array(boxes.length * 3);
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  boxes.forEach((b, i) => {
    mtx.makeScale(b.w, b.h, b.d).setPosition(b.x, b.h / 2 + 0.05, b.z); farB.setMatrixAt(i, mtx);
    col.set(b.c).multiplyScalar(0.9 + Rf() * 0.2); tint[i * 3] = col.r; tint[i * 3 + 1] = col.g; tint[i * 3 + 2] = col.b;
  });
  bGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  farB.frustumCulled = false; farB.castShadow = false; farB.receiveShadow = true; root.add(farB);
  // 街區人行道方塊
  const pGeo = new THREE.BoxGeometry(3.1, 0.1, 3.1);
  const farP = new THREE.InstancedMesh(pGeo, sidew, plates.length);
  plates.forEach(([x, z], i) => { mtx.makeTranslation(x, 0.05, z); farP.setMatrixAt(i, mtx); });
  farP.frustumCulled = false; farP.receiveShadow = true; root.add(farP);
  // 公園與樹
  const tg = [];
  { const tr = new THREE.CylinderGeometry(0.03, 0.04, 0.3, 5).translate(0, 0.15, 0); const cn = new THREE.ConeGeometry(0.2, 0.55, 6).translate(0, 0.55, 0);
    const paint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); const cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    tg.push(paint(tr, '#5a3f2e'), paint(cn, '#4b8a46')); }
  const treeGeo = mergeGeometries(tg.map(g => { g.deleteAttribute('uv'); return g.toNonIndexed(); }));
  const treeM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const treePts = [];
  parks.forEach(([x, z]) => { for (let i = 0; i < 7; i++) treePts.push([x + (Rf() - 0.5) * 2.6, z + (Rf() - 0.5) * 2.6, 0.9 + Rf() * 0.8]); });
  const farT = new THREE.InstancedMesh(treeGeo, treeM, treePts.length);
  treePts.forEach(([x, z, s], i) => { mtx.makeScale(s, s * (0.9 + Rf() * 0.5), s).setPosition(x, 0.1, z); farT.setMatrixAt(i, mtx); });
  farT.frustumCulled = false; root.add(farT);
  const parkP = new THREE.InstancedMesh(new THREE.BoxGeometry(3.1, 0.1, 3.1), parkMat, parks.length);
  parks.forEach(([x, z], i) => { mtx.makeTranslation(x, 0.06, z); parkP.setMatrixAt(i, mtx); });
  parkP.frustumCulled = false; root.add(parkP);

  // 橋：西側 z=8、北側 x=8、東側 z=8（路面磚由 city.js 鋪）
  const bg = [];
  const bpart = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z); g.deleteAttribute('uv'); return g.toNonIndexed(); };
  function bridge(axis, line, a, b) {
    const L = Math.abs(b - a), mid = (a + b) / 2;
    const put = (w, h, d, u, y, lat) => axis === 'x' ? bg.push(bpart(L * 0 + w, h, d, mid + u, y, line + lat)) : bg.push(bpart(d, h, w, line + lat, y, mid + u));
    // 上面 w 為沿橋方向長度，d 為橫向寬度
    put(L, 0.16, 1.3, 0, -0.08, 0);
    put(L, 0.1, 0.06, 0, 0.05, 0.62); put(L, 0.1, 0.06, 0, 0.05, -0.62);
    for (let u = -L / 2 + 0.8; u < L / 2; u += 1.9) { put(0.22, 1.0, 0.5, u, -0.6, 0); }
  }
  bridge('x', 8, -6.5, -M); bridge('z', 8, -6.5, -M); bridge('x', 8, W + M, W + M + 6);
  // 北橋沿 z 方向：put 的軸交換已處理
  const bridgeMesh = new THREE.Mesh(mergeGeometries(bg), stone); bridgeMesh.receiveShadow = true; bridgeMesh.castShadow = true; root.add(bridgeMesh);

  // 山的剪影（三層）
  const mtns = [];
  [[165, 40, 0x4a3a78, 3.3], [225, 66, 0x5f5290, 2.1], [300, 105, 0x7a70a8, 1.3]].forEach(([r, hMax, c, f], li) => {
    const N = 360, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const th = i / N * Math.PI * 2;
      const nx = Math.cos(th) * f * 0.8 + li * 11, nz = Math.sin(th) * f * 0.8 + li * 5;
      let hh = (noise.noise(nx, nz, 0.3) * 0.5 + 0.5) * 0.7 + (noise.noise(nx * 3, nz * 3, 1.7) * 0.5 + 0.5) * 0.3;
      // 北、西側高，南、東側（海）低
      const wDir = Math.max(0, -Math.cos(th - Math.PI * 1.35) * 0.5 + 0.5);
      hh = hh * (0.25 + 0.75 * wDir) * hMax;
      const x = W / 2 + Math.cos(th) * r, z = D / 2 + Math.sin(th) * r;
      pos.push(x, -6, z, x, hh, z);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, fog: true }));
    m.frustumCulled = false; root.add(m); mtns.push({ m, base: new THREE.Color(c), li });
  });

  return {
    water, waterMat, wU, bMat, mtns, farB,
    update(env, time) {
      wU.uT.value = time;
      // 水色：隨天空／亮度
      const wc = new THREE.Color(0x1f5f86).multiplyScalar(0.25 + 0.75 * env.amb).lerp(env.hor, 0.22 + 0.25 * env.cloud);
      waterMat.color.copy(wc);
      mtns.forEach(({ m, base, li }) => {
        const c = base.clone().multiplyScalar(0.35 + 0.65 * env.amb).lerp(env.mid, 0.12 + li * 0.1); m.material.color.copy(c);
      });
    },
  };
}
