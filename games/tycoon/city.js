/* 創業之城：3D 低多邊形城市引擎。素材為 Kenney CC0（assets 內各資料夾的 License.txt），其餘皆程式生成。
 *
 * 座標單位 = 1 格路磚（道路中線每 4 格一條，x: 0..16、z: 0..12，y 向上）。
 * 本檔只負責畫面與介面，不含任何經濟邏輯。
 *
 * import { createCity } from './city.js';
 * const city = createCity(container, { hour, weather, quality, freeze, controls, targetOffset });
 * await city.ready();  city.start();
 *
 * ── 給模擬層用的 API（createCity 回傳物件上的方法）──
 *  getMapData()                         → { lots, buildings, sidewalk, roads, bounds }
 *       lots[]:      { id, x, z（店門前人行道座標）, bx, bz（建築中心）, zone: 商圈|住宅|辦公|學校|捷運站旁, state: 空|玩家|對手, owner, name, color, building }
 *       buildings[]: { id, type: 住宅|辦公|商業|學校|捷運站, x, z, w, d, h, floors }
 *       sidewalk:    { nodes:[{id,x,z}], edges:[[a,b,長度]] }   roads 同結構（車道中心線）
 *  walkDistance(fromXZ, toXZ)           → 沿人行道的步行距離（格）；walkDistanceToLot(fromXZ, lotId)
 *  setShop(lotId, { owner:'player'|'rival', name, color } | null)   開店／換店名顏色／null＝變回招租空店面
 *  spawnWalker(fromXZ, lotId, opts)     → id；小人沿人行道走到店門、進店消失。opts:{ speed, color, onArrive }
 *  setQueue(lotId, n)                   店門口排 n 人（最多畫 12 個，其餘顯示 +N）
 *  spawnScooter(lotId, toXZ, opts)      → id；外送機車沿車道從店騎到某點。opts:{ speed, color, onArrive }
 *  setClock(hour)                       0–24：日照、天色、窗燈、路燈、招牌（夜間 bloom）
 *  setWeather('sunny'|'cloudy'|'rain')
 *  onPick(cb)                           cb({ type:'lot'|'building', id })；滑鼠移過有外框高亮。回傳取消函式
 *  setLabel(lotId, { title, sub, tone:'green'|'red'|'gray' } | null)   浮動標籤
 * ── 其他 ──
 *  setQuality('high'|'low')、getQuality()、setTimeScale(x)、step(sec)（不經繪製快轉模擬）、
 *  setView({x,z,dist,yaw})、getView()、focusLot(id, dist)、project(x,y,z)、stats()
 *  鏡頭：左鍵拖曳旋轉，右鍵／中鍵／Shift＋左鍵平移，滾輪／雙指縮放，Q·E 旋轉（有邊界）。
 *  網址：?debug 顯示 fps；?q=low|high 指定畫質；?hour=、?weather=
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createKit, BB, FLOOR_H, U, wetStd, windowStd } from './city-kit.js';
import { sampleEnv, sunDirFor, createSky, createRain, createScenery } from './city-env.js';
import { Graph, createPeople } from './city-people.js';
import { createShops } from './city-shop.js';
import { businessIcon } from './business-art.js';

const BX = 6, BZ = 4;            // 街區數（橫、縱）
const PITCH = 4;                 // 路線間距（格）
const W = BX * PITCH, D = BZ * PITCH;
const M = 1.5;                   // 底座外擴
export const ZONES = ['商圈', '住宅', '辦公', '學校', '捷運站旁'];

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(20261005);
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function createCity(container, opts = {}) {
  const qs = new URLSearchParams(location.search);
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (matchMedia && matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 820);
  let quality = opts.quality || qs.get('q') || (isMobile ? 'low' : 'high');
  const autoQuality = opts.autoQuality ?? (!qs.get('q') && !opts.quality && !navigator.webdriver);
  const dprCap = () => (quality === 'low' ? 1.5 : 2);
  let dpr = Math.min(window.devicePixelRatio || 1, dprCap());
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.info.autoReset = false;
  container.appendChild(renderer.domElement); renderer.domElement.style.touchAction = 'none';

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xc98a98, 0.0035);
  const camera = new THREE.PerspectiveCamera(30, 1.6, 0.5, 2000);
  const target = new THREE.Vector3(W / 2 + 0.2, 0.4, D / 2 + 0.2);
  const home = { x: target.x + (opts.targetOffset?.[0] || 0), z: target.z + (opts.targetOffset?.[2] || 0) };

  // ---------- 光 ----------
  const hemi = new THREE.HemisphereLight(0xa9b6f0, 0x8a6a64, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb072, 3.9);
  sun.position.set(target.x - 17, 11, target.z + 12); sun.target.position.copy(target);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera; sc.left = -17; sc.right = 17; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 70;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3.5;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x8fa0ff, 0.6);
  rim.position.set(target.x + 14, 8, target.z - 8); rim.target.position.copy(target); scene.add(rim, rim.target);

  // ---------- 後製 ----------
  const rt = new THREE.WebGLRenderTarget(10, 10, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 10, 10);
  gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = 0.95;
  gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 12 });
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(10, 10), 0.32, 0.55, 1.15); composer.addPass(bloom);
  composer.addPass(new ShaderPass(gradeShader()));
  composer.addPass(new OutputPass());

  function applyQuality(q) {
    quality = q; dpr = Math.min(window.devicePixelRatio || 1, dprCap());
    gtao.enabled = q === 'high' && !opts.noAO;
    sun.shadow.mapSize.set(q === 'high' ? 4096 : 1024, q === 'high' ? 4096 : 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    [composer.renderTarget1, composer.renderTarget2].forEach(r => { r.samples = q === 'high' ? 4 : 0; r.dispose(); });
    resize();
  }

  // ---------- 天空、環境 ----------
  const sky = createSky(); scene.add(sky.dome);
  const root = new THREE.Group(); scene.add(root);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null, envHourStamp = -99;
  function refreshEnvMap(force) {
    const key = Math.round(env.hour * 2) + Math.round(env.cloud * 3) * 0.1 + Math.round(env.rain * 3) * 0.01 + (env.rain > 0 ? 100 : 0);
    if (!force && Math.abs(key - envHourStamp) < 0.5) return;
    envHourStamp = key;
    const previous = envTarget, first = !scenery.waterMat.envMap;
    envTarget = pmrem.fromScene(sky.envScene, 0, 0.1, 50);
    scene.environment = envTarget.texture; scenery.waterMat.envMap = envTarget.texture;
    if (first) scenery.waterMat.needsUpdate = true;
    // PMREM 同時配置 framebuffer 與 depth buffer，必須釋放完整 render target。
    previous?.dispose();
  }
  const scenery = createScenery(root, { W, D, M });
  const rain = createRain(); scene.add(rain.lines);
  let hour = opts.hour ?? (qs.has('hour') ? +qs.get('hour') : 17.7);
  const wx = { cloud: 0, rain: 0, tc: 0, tr: 0 };
  let env = sampleEnv(hour, 0, 0);
  const shopsRef = { s: null }, lampRef = { l: null };

  function applyEnv() {
    env = sampleEnv(hour, wx.cloud, wx.rain);
    const dir = sunDirFor(env);
    sun.color.copy(env.sunC); sun.intensity = env.sunI;
    sun.position.set(target.x + dir.x * 26, Math.max(2, dir.y * 26), target.z + dir.z * 26);
    rim.intensity = 0.6 * (1 - 0.5 * env.night); hemi.color.copy(env.hemS); hemi.groundColor.copy(env.hemG); hemi.intensity = env.hemI;
    renderer.toneMappingExposure = env.expo;
    scene.fog.color.copy(env.fog); scene.fog.density = env.fogD; renderer.setClearColor(env.hor);
    const u = sky.uniforms; u.uTop.value.copy(env.top); u.uMid.value.copy(env.mid); u.uHor.value.copy(env.hor); u.uSunDir.value.copy(dir); u.uSunCol.value.copy(env.sunC);
    u.uNight.value = env.night; u.uCloud.value = env.cloud; u.uRain.value = wx.rain;
    U.uWin.value = env.night; U.uWet.value = wx.rain;
    scene.environmentIntensity = 0.1 + 0.55 * wx.rain + 0.2 * env.cloud;
    bloom.strength = 0.3 + 0.62 * Math.pow(env.night, 3) ; bloom.threshold = 1.15 - 0.2 * env.night;
    rain.u.uAmt.value = smooth(0.05, 0.6, wx.rain);
    scenery.update(env, simT);
    shopsRef.s && shopsRef.s.setNight(env.night);
    if (lampRef.l) lampRef.l(smooth(0.3, 0.8, env.night));
    people && people.setRain(wx.rain > 0.3);
    if (scenery) refreshEnvMap(false);
  }

  // ---------- 載入器與地面 ----------
  const kit = createKit(root, renderer);
  const put = kit.put;
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * M, 1.2, D + 2 * M), [
    wetStd(0x8f8794, 1), wetStd(0x8f8794, 1), wetStd(0x7cae58, 1), wetStd(0x2a2030, 1), wetStd(0x8f8794, 1), wetStd(0x8f8794, 1)]);
  base.position.set(W / 2, -0.6 - 0.001, D / 2); base.receiveShadow = true; base.castShadow = true; root.add(base);
  const plateMats = new Map();
  function plate(cx, cz, w, d, color, h = 0.05) {
    if (!plateMats.has(color)) plateMats.set(color, wetStd(color, 0.95));
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plateMats.get(color));
    m.position.set(cx, h / 2, cz); m.receiveShadow = true; root.add(m); return m;
  }

  // ---------- 道路（含橋） ----------
  const bridgeAt = (x, z) => (z === 8 && x >= -10 && x <= -1) || (x === 8 && z >= -10 && z <= -1) || (z === 8 && x >= 17 && x <= 27);
  const roadAt = (x, z) => (x >= 0 && x <= W && z >= 0 && z <= D && (x % PITCH === 0 || z % PITCH === 0)) || bridgeAt(x, z);
  const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  const rot90 = ([x, z], k) => { for (let i = 0; i < k; i++) [x, z] = [z, -x]; return [x, z]; };
  const keyOf = (v) => v.map(Math.round).join(',');
  const BASEK = { 'road-straight': ['W', 'E'], 'road-bend': ['W', 'S'], 'road-intersection': ['W', 'E', 'S'], 'road-crossroad': ['N', 'E', 'S', 'W'], 'road-end': ['W'] };
  function roadTile(x, z) {
    const c = Object.keys(DIRS).filter(d => roadAt(x + DIRS[d][0], z + DIRS[d][1]));
    const name = { 1: 'road-end', 4: 'road-crossroad' }[c.length] || (c.length === 3 ? 'road-intersection' : (c[0] === 'N' && c[1] === 'S') || (c[0] === 'E' && c[1] === 'W') ? 'road-straight' : 'road-bend');
    const want = new Set(c.map(d => keyOf(DIRS[d])));
    for (let k = 0; k < 4; k++) {
      const have = new Set(BASEK[name].map(d => keyOf(rot90(DIRS[d], k))));
      if (have.size === want.size && [...want].every(v => have.has(v))) return [name, k * Math.PI / 2];
    }
    return [name, 0];
  }
  for (let x = -10; x <= Math.max(27, W); x++) for (let z = -10; z <= D; z++) if (roadAt(x, z)) { const [n, r] = roadTile(x, z); put('roads', n, x, z, r); }

  // ---------- 建築登記 ----------
  const buildings = [], lotSpecs = [], specBoxes = [], labelPlanes = [];
  const roofs = { ac: [], tank: [], ant: [] };
  const NRM = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  const faceOf = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 };
  const typeOf = (name) => /skyscraper|building-m$|building-n$/.test(name) ? '辦公' : /building-type|building-f$|building-g$|building-l$/.test(name) ? '住宅' : '商業';
  function addB(o) {
    const { kit: k = 'commercial', name, x, z, rot = 0, scale = 1, sy = 1, v = null } = o;
    put(k, name, x, z, rot, scale, 0, v, sy);
    const [hw, hd, h] = BB[name]; const sw = Math.abs(Math.sin(rot)) > 0.5;
    const rec = { id: 'B' + String(buildings.length + 1).padStart(2, '0'), type: o.type || typeOf(name), x, z, w: 2 * (sw ? hd : hw) * scale, d: 2 * (sw ? hw : hd) * scale, h: h * scale * sy, floors: Math.max(1, Math.round(h * scale * sy / FLOOR_H)), name, hd: hd * scale };
    buildings.push(rec); return rec;
  }
  function addLot(rec, face, zone, extra = 0) {
    const [nx, nz] = NRM[face], half = rec.hd + extra;
    lotSpecs.push({ id: 'L' + String(lotSpecs.length + 1).padStart(2, '0'), zone, x: rec.x + nx * half, z: rec.z + nz * half, nx, nz, bx: rec.x, bz: rec.z, building: rec.id, face });
  }
  const recent = [];
  function freshName(list) { for (let i = 0; i < 12; i++) { const n = pick(list); if (!recent.includes(n)) { recent.push(n); if (recent.length > 7) recent.shift(); return n; } } return pick(list); }
  const COMM = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h', 'building-i', 'building-j', 'building-k', 'building-l', 'building-m', 'building-n'];
  const HOUSE = ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d', 'building-type-e', 'building-type-f', 'building-type-g', 'building-type-h', 'building-type-i', 'building-type-j', 'building-type-k', 'building-type-l'];
  const ring = [[-1, -1, 'n'], [0, -1, 'n'], [1, -1, 'n'], [1, 0, 'e'], [1, 1, 's'], [0, 1, 's'], [-1, 1, 's'], [-1, 0, 'w']];
  // 變體：貼圖 a/b、色相。每棟另外隨機高度（0.88–1.3 倍）讓同款樓不重複
  const vb = () => pick(['a|0', 'a|0', 'a|20', 'a|40', 'a|200', 'a|200', 'b|0', 'b|40', 'b|200', 'b|120', 'a|300']).replace(/^a\|/, '|');
  const vh = () => pick(['b|0', 'c|0', '|30', '|0', 'b|40', 'c|20', '|330', 'b|200']);
  const tree = (x, z, big) => put('suburban', big ? 'tree-large' : 'tree-small', x, z, R() * 6.28, 1.15 + R() * 0.35);
  const heightJit = (name) => /skyscraper/.test(name) ? 0.82 + R() * 0.38 : 0.88 + R() * 0.42;

  function skyBlock(cx, cz, plan, lotIdx) {
    plate(cx, cz, 3.0, 3.0, 0x7d7a86); const o = 0.72;
    [[-o, -o], [o, -o], [-o, o], [o, o]].forEach(([dx, dz], i) => {
      const rec = addB({ name: plan[i], x: cx + dx, z: cz + dz, v: ['|0', '|200', 'b|40', '|0'][i], sy: heightJit(plan[i]) });
      if (lotIdx === i) addLot(rec, 's', '辦公');
    });
  }
  // lots: { ringIdx: zone }
  function commBlock(cx, cz, opt = {}) {
    plate(cx, cz, 3.0, 3.0, opt.floor || 0x8a8590);
    const names = opt.names || [];
    ring.forEach(([dx, dz, f], i) => {
      const nm = names[i] || freshName(COMM);
      const isLot = opt.lots && opt.lots[i];
      // 街面一格一棟，寬素材須縮入格內，否則會把鄰店的入口與招牌埋進樓體。
      const fit = Math.min(1, 0.92 / (2 * BB[nm][0]));
      const rec = addB({ name: nm, x: cx + dx, z: cz + dz, rot: faceOf[f], scale: fit, v: (opt.keepA && opt.keepA.includes(i)) ? null : vb(), sy: (isLot ? 1 : heightJit(nm)) / fit });
      if (isLot) addLot(rec, f, opt.lots[i]);
    });
  }
  function houseBlock(cx, cz, lots = {}) {
    plate(cx, cz, 3.0, 3.0, 0x73905a, 0.05);
    [-0.8, 0.8].forEach((dz, ri) => [-0.78, 0.78].forEach((dx, ci) => {
      const nm = freshName(HOUSE), key = ri * 2 + ci, isLot = lots[key];
      const rec = addB({ kit: 'suburban', name: nm, x: cx + dx, z: cz + (isLot ? 0.98 : dz), rot: ri === 0 ? Math.PI : 0, scale: 0.92, v: vh(), sy: isLot ? 1 : 0.9 + R() * 0.3 });
      if (isLot) addLot(rec, 's', lots[key]);
    }));
    [[-1.3, 0], [1.3, 0], [0, 0.0]].forEach(([dx, dz]) => tree(cx + dx, cz + dz, R() > 0.4));
    plate(cx, cz, 0.28, 3.0, 0xc9bda8, 0.06);
  }
  function parkBlock(cx, cz) {
    plate(cx, cz, 3.0, 3.0, 0x6d9a54, 0.05); plate(cx, cz, 0.35, 3.0, 0xcdbca0, 0.06); plate(cx, cz, 3.0, 0.35, 0xcdbca0, 0.06);
    [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1], [-0.7, -0.5], [0.7, -0.6], [-0.6, 0.7], [0.65, 0.55], [-1.2, 0.1], [1.2, -0.2], [0.1, -1.2], [-0.2, 1.25]].forEach(([dx, dz]) => tree(cx + dx, cz + dz, R() > 0.35));
    put('suburban', 'planter', cx, cz, 0, 1.4, 0.05);
  }
  function plazaBlock(cx, cz) {
    plate(cx, cz, 3.0, 3.0, 0xb7ada3, 0.05); plate(cx, cz, 1.7, 1.7, 0x6d9a54, 0.07);
    [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].forEach(([dx, dz]) => tree(cx + dx, cz + dz, true));
    [[-1.25, -1.2], [1.25, -1.2], [-1.25, 1.2], [1.25, 1.2], [0, -1.25], [0, 1.25]].forEach(([dx, dz]) => put('suburban', 'planter', cx + dx, cz + dz, 0, 1.3, 0.05));
    [[-1.1, 0], [1.1, 0]].forEach(([dx, dz]) => put('commercial', 'detail-parasol-' + (dx < 0 ? 'a' : 'b'), cx + dx, cz + dz, 0, 1.6, 0.05));
  }
  // 特殊方塊（學校、捷運站）：窗格材質、單一 draw call
  const spec = (x, y0, z, w, h, d, c) => specBoxes.push({ x, y0, z, w, h, d, c });
  function textPlane(text, w, h, x, y, z, rotY, bg, fg, sub) {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(c.height * (sub ? 0.46 : 0.6))}px "PingFang TC","Noto Sans TC",system-ui,sans-serif`; g.fillText(text, 256, sub ? c.height * 0.38 : c.height / 2);
    if (sub) { g.font = `600 ${Math.round(c.height * 0.24)}px system-ui,sans-serif`; g.fillText(sub, 256, c.height * 0.8); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    m.position.set(x, y, z); m.rotation.y = rotY; root.add(m); labelPlanes.push(m); return m;
  }
  function schoolBlock(cx, cz) {
    plate(cx, cz, 3.0, 3.0, 0xb9b0a0, 0.05);
    plate(cx, cz - 0.1, 2.6, 1.0, 0x7aa35a, 0.07);                    // 操場草地
    plate(cx, cz - 0.1, 2.1, 0.7, 0xc9694b, 0.08);                    // 跑道
    plate(cx, cz - 0.1, 1.7, 0.36, 0x7aa35a, 0.09);
    plate(cx, cz - 0.1, 0.02, 0.7, 0xffffff, 0.095);
    // 校舍（兩翼＋中央鐘樓）
    spec(cx - 0.7, 0.05, cz - 1.0, 1.1, 0.78, 0.62, '#e6d8b8'); spec(cx + 0.7, 0.05, cz - 1.0, 1.1, 0.78, 0.62, '#e6d8b8');
    spec(cx, 0.05, cz - 1.0, 0.5, 1.2, 0.62, '#d7694f'); spec(cx, 1.25, cz - 1.0, 0.56, 0.06, 0.68, '#7a4a3a');
    spec(cx, 1.31, cz - 1.0, 0.14, 0.2, 0.14, '#cfc3a6');
    textPlane('雲港國小', 0.62, 0.15, cx, 0.98, cz - 0.685, 0, '#d7694f', '#ffffff');
    // 旗桿
    spec(cx + 1.25, 0.05, cz - 0.55, 0.025, 0.9, 0.025, '#e8e8ee'); spec(cx + 1.34, 0.72, cz - 0.55, 0.16, 0.1, 0.01, '#d33a2e');
    buildings.push({ id: 'B' + String(buildings.length + 1).padStart(2, '0'), type: '學校', x: cx, z: cz - 1.0, w: 2.5, d: 0.62, h: 1.31, floors: 3, name: 'school', hd: 0.31 });
    const rs = [4, 5, 6];
    rs.forEach(i => { const [dx, dz, f] = ring[i]; const isLot = i !== 5; const rec = addB({ name: i === 5 ? 'building-c' : (i === 4 ? 'building-b' : 'building-d'), x: cx + dx, z: cz + dz, rot: faceOf[f], v: vb(), sy: 1 }); if (isLot) addLot(rec, f, '學校'); });
    [[-1.3, -0.1], [1.3, -0.2]].forEach(([dx, dz]) => tree(cx + dx, cz + dz, true));
  }
  function stationBlock(cx, cz, opt) {
    commBlock(cx, cz, opt);
    // 捷運站出入口：深藍屋頂＋玻璃牆、兩面站牌
    spec(cx, 0.05, cz, 1.0, 0.42, 0.62, '#dfe6ee'); spec(cx, 0.47, cz, 1.12, 0.07, 0.74, '#2d5fa8');
    spec(cx - 0.62, 0.05, cz, 0.12, 0.3, 0.5, '#2d5fa8');
    spec(cx + 0.45, 0.05, cz + 0.45, 0.1, 0.82, 0.1, '#2d5fa8');
    textPlane('雲港站', 0.56, 0.22, cx, 0.31, cz + 0.32, 0, '#2d5fa8', '#ffffff', 'Yungang');
    textPlane('捷運', 0.38, 0.2, cx + 0.45, 0.95, cz + 0.45, 0, '#2d5fa8', '#ffffff');
    textPlane('捷運', 0.38, 0.2, cx + 0.45, 0.95, cz + 0.45, Math.PI, '#2d5fa8', '#ffffff');
    buildings.push({ id: 'B' + String(buildings.length + 1).padStart(2, '0'), type: '捷運站', x: cx, z: cz, w: 1.1, d: 0.7, h: 0.55, floors: 1, name: 'mrt', hd: 0.35 });
  }

  const bc = (i, j) => [i * PITCH + PITCH / 2, j * PITCH + PITCH / 2];
  skyBlock(...bc(0, 0), ['building-skyscraper-c', 'building-skyscraper-a', 'building-skyscraper-e', 'building-skyscraper-b'], 2);
  skyBlock(...bc(1, 0), ['building-skyscraper-d', 'building-skyscraper-c', 'building-skyscraper-a', 'building-skyscraper-e'], 3);
  commBlock(...bc(2, 0), { keepA: [6], lots: { 6: '商圈', 4: '商圈', 2: '商圈' } });
  houseBlock(...bc(3, 0), { 2: '住宅' });
  commBlock(...bc(0, 1), { names: ['building-skyscraper-b', 'building-n', 'building-k', 'building-l', 'building-m', 'building-h', 'building-g', 'building-f'], lots: { 5: '商圈', 3: '商圈' } });
  commBlock(...bc(1, 1), { names: ['building-a', 'building-b', 'building-j', 'building-i', 'building-d', 'building-c', 'building-e', 'building-h'], keepA: [4], lots: { 4: '商圈', 0: '商圈', 7: '商圈' } });
  plazaBlock(...bc(2, 1));
  stationBlock(...bc(3, 1), { lots: { 6: '捷運站旁', 3: '捷運站旁', 5: '捷運站旁' } });
  houseBlock(...bc(0, 2), { 2: '住宅', 3: '住宅' });
  commBlock(...bc(1, 2), { keepA: [6], lots: { 6: '商圈', 2: '商圈' } });
  schoolBlock(...bc(2, 2));
  parkBlock(...bc(3, 2));
  // 追加街區保留原有建築與店面編號，舊存檔可原地擴大。
  houseBlock(...bc(4, 0), { 2: '住宅', 3: '住宅' });
  skyBlock(...bc(5, 0), ['building-skyscraper-a', 'building-skyscraper-c', 'building-skyscraper-b', 'building-skyscraper-d'], 2);
  houseBlock(...bc(4, 1), { 2: '住宅', 3: '住宅' });
  stationBlock(...bc(5, 1), { lots: { 3: '捷運站旁', 4: '捷運站旁', 6: '捷運站旁' } });
  commBlock(...bc(4, 2), { lots: { 2: '商圈', 4: '商圈', 6: '商圈' } });
  houseBlock(...bc(5, 2), { 2: '住宅', 3: '住宅' });
  schoolBlock(...bc(0, 3));
  houseBlock(...bc(1, 3), { 2: '住宅', 3: '住宅' });
  commBlock(...bc(2, 3), { lots: { 2: '商圈', 4: '商圈', 6: '商圈' } });
  skyBlock(...bc(3, 3), ['building-skyscraper-e', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-a'], 2);
  commBlock(...bc(4, 3), { lots: { 2: '辦公', 4: '辦公', 6: '辦公' } });
  parkBlock(...bc(5, 3));
  // 預設三家（樣張）
  const DEF = {};
  { const find = (bx, bz) => lotSpecs.find(l => Math.abs(l.bx - bx) < 0.01 && Math.abs(l.bz - bz) < 0.01);
    const [c1x, c1z] = bc(1, 1), [c2x, c2z] = bc(2, 0), [c3x, c3z] = bc(1, 2);
    DEF.player = find(c1x + 1, c1z + 1).id; DEF.rivalA = find(c2x - 1, c2z + 1).id; DEF.rivalB = find(c3x - 1, c3z + 1).id; }

  // ---------- 屋頂設備（instanced）----------
  buildings.forEach(b => {
    if (b.type === '學校' || b.type === '捷運站') return;
    const n = b.h > 2.5 ? 2 : 1 + (R() > 0.45 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const rx = b.x + (R() - 0.5) * Math.min(0.5, b.w * 0.4), rz = b.z + (R() - 0.5) * Math.min(0.5, b.d * 0.4), r = R();
      const y = b.h - 0.01;
      if (r < 0.5) roofs.ac.push([rx, y, rz, R() * 3.14, 0.8 + R() * 0.6]);
      else if (r < 0.75 && b.h < 2.4) roofs.tank.push([rx, y, rz, 0, 0.8 + R() * 0.4]);
      else roofs.ant.push([rx, y, rz, 0, 0.7 + R() * 0.9 + (b.h > 2.5 ? 0.6 : 0)]);
    }
  });
  const grayM = wetStd(0x9a96a2, 0.8), tankM = wetStd(0xb48a64, 0.8);
  function roofMesh(geo, mat, list, shadow = true) {
    if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach(([x, y, z, ry, s], i) => { m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, ry, 0)), new THREE.Vector3(s, s, s)); im.setMatrixAt(i, m); });
    im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false; root.add(im);
  }
  roofMesh(new THREE.BoxGeometry(0.16, 0.08, 0.12).translate(0, 0.04, 0), grayM, roofs.ac);
  roofMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.14, 10).translate(0, 0.14, 0), tankM, roofs.tank);
  roofMesh(new THREE.CylinderGeometry(0.01, 0.014, 0.4, 5).translate(0, 0.2, 0), grayM, roofs.ant);
  // 特殊方塊實體化
  if (specBoxes.length) {
    const g = new THREE.BoxGeometry(1, 1, 1); const tint = new Float32Array(specBoxes.length * 3), c = new THREE.Color();
    const im = new THREE.InstancedMesh(g, windowStd(), specBoxes.length); const m = new THREE.Matrix4();
    specBoxes.forEach((s, i) => { m.makeScale(s.w, s.h, s.d).setPosition(s.x, s.y0 + s.h / 2, s.z); im.setMatrixAt(i, m); c.set(s.c); tint[i * 3] = c.r; tint[i * 3 + 1] = c.g; tint[i * 3 + 2] = c.b; });
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3)); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; root.add(im);
  }

  // ---------- 外圍綠地 ----------
  for (let i = 0; i < 46; i++) {
    const side = i % 4, t = R(); let x, z;
    if (side === 0) { x = -M + 0.5 + R() * 0.5; z = -M + t * (D + 2 * M); }
    else if (side === 1) { x = W + M - 0.5 - R() * 0.5; z = -M + t * (D + 2 * M); }
    else if (side === 2) { z = -M + 0.5 + R() * 0.5; x = -M + t * (W + 2 * M); }
    else { z = D + M - 0.5 - R() * 0.5; x = -M + t * (W + 2 * M); }
    if ((Math.abs(z - 8) < 0.9 && x < 0.2) || (Math.abs(x - 8) < 0.9 && z < 0.2) || (Math.abs(z - 8) < 0.9 && x > W - 0.2)) continue;
    tree(x, z, R() > 0.3);
  }

  // ---------- 路燈 ----------
  const lampHeads = [];
  for (let i = 0; i <= BX; i++) for (let j = 0; j <= BZ; j++) {
    const x = i * PITCH, z = j * PITCH;
    [[0.52, 0.52], [-0.52, -0.52]].forEach(([dx, dz]) => {
      if ((i + j) % 2 === 0 || R() > 0.5) {
        const rot = dx > 0 ? Math.PI * 0.75 : -Math.PI * 0.25; put('roads', 'light-square', x + dx, z + dz, rot, 1.6);
        const ls = Math.sin(rot), lc = Math.cos(rot); lampHeads.push([x + dx - 0.336 * ls, 0.95, z + dz - 0.336 * lc]);
      }
    });
  }
  { // 路燈燈泡與地面光池
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), bulbMat, lampHeads.length);
    const poolT = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
    const poolMat = new THREE.MeshBasicMaterial({ map: poolT, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.25, 1.25).rotateX(-Math.PI / 2), poolMat, lampHeads.length);
    const m = new THREE.Matrix4(); lampHeads.forEach(([x, y, z], i) => { m.makeTranslation(x, y, z); bulbs.setMatrixAt(i, m); m.makeTranslation(x, 0.075, z); pools.setMatrixAt(i, m); });
    bulbs.frustumCulled = pools.frustumCulled = false; root.add(bulbs, pools);
    lampRef.l = (k) => { bulbMat.color.setRGB(1, 0.85, 0.6).multiplyScalar(0.25 + 1.9 * k); poolMat.color.setRGB(1, 0.69, 0.38).multiplyScalar(0.4 * k); poolMat.visible = k > 0.01; };
  }

  // ---------- 店面 ----------
  const shops = createShops(root, lotSpecs, { wetStd });
  shopsRef.s = shops;
  const lotById = shops.byId, bldById = new Map(buildings.map(b => [b.id, b]));

  // ---------- 路網 ----------
  const SW = 0.43;   // 人行道離道路中線
  const sidewalk = new Graph(), roads = new Graph();
  { const key = (i, j, sx, sz) => i + ',' + j + ',' + sx + ',' + sz, idx = new Map();
    const blockOk = (i, j) => i >= 0 && i < BX && j >= 0 && j < BZ;
    for (let i = 0; i <= BX; i++) for (let j = 0; j <= BZ; j++) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (blockOk(i + (sx > 0 ? 0 : -1), j + (sz > 0 ? 0 : -1))) idx.set(key(i, j, sx, sz), sidewalk.addNode(i * PITCH + sx * SW, j * PITCH + sz * SW));
    }
    const g = (...a) => idx.get(key(...a)), link = (a, b) => { if (a !== undefined && b !== undefined) sidewalk.addEdge(a, b); };
    for (let i = 0; i < BX; i++) for (let j = 0; j <= BZ; j++) for (const sz of [-1, 1]) link(g(i, j, 1, sz), g(i + 1, j, -1, sz));
    for (let i = 0; i <= BX; i++) for (let j = 0; j < BZ; j++) for (const sx of [-1, 1]) link(g(i, j, sx, 1), g(i, j + 1, sx, -1));
    for (let i = 0; i <= BX; i++) for (let j = 0; j <= BZ; j++) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (sx === 1) link(g(i, j, -1, sz), g(i, j, 1, sz));
      if (sz === 1) link(g(i, j, sx, -1), g(i, j, sx, 1));
    }
    const rid = new Map();
    for (let i = 0; i <= BX; i++) for (let j = 0; j <= BZ; j++) rid.set(i + ',' + j, roads.addNode(i * PITCH, j * PITCH));
    for (let i = 0; i <= BX; i++) for (let j = 0; j <= BZ; j++) { if (i < BX) roads.addEdge(rid.get(i + ',' + j), rid.get((i + 1) + ',' + j)); if (j < BZ) roads.addEdge(rid.get(i + ',' + j), rid.get(i + ',' + (j + 1))); }
  }

  // ---------- 小人 ----------
  const simUniforms = { uTime: { value: 0 } };
  const people = createPeople(root, {
    sidewalk, roads, uTime: simUniforms.uTime, laneOff: 0.19, qCap: lotSpecs.length * 12,
    doorOf: (id) => { const l = lotById.get(id); return l ? { x: l.door.x, z: l.door.z } : null; },
    lotNrm: (id) => { const l = lotById.get(id); return l ? [l.nx, l.nz] : [0, 1]; },
  });

  // ---------- 車 ----------
  const CARS = ['sedan', 'taxi', 'van', 'suv', 'suv-luxury', 'hatchback-sports', 'delivery', 'sedan-sports'];
  const cars = [], carJobs = [], lane = 0.19, cs = 0.2;
  function addCar(axis, line, dir, t0, speed) {
    const name = pick(CARS);
    carJobs.push(kit.clone('cars', name).then(o => { const holder = new THREE.Group(); o.scale.setScalar(cs); o.position.y = 0.01; o.rotation.y = opts.carFlip ?? 0; holder.add(o); root.add(holder); cars.push({ holder, axis, line, dir, t0, speed }); }));
  }
  for (let j = 0; j <= BZ; j++) for (let n = 0; n < 2; n++) addCar('x', j * PITCH, n % 2 ? 1 : -1, R() * W, 0.5 + R() * 0.4);
  for (let i = 0; i <= BX; i++) for (let n = 0; n < 2; n++) addCar('z', i * PITCH, n % 2 ? 1 : -1, R() * D, 0.5 + R() * 0.4);
  function placeCars(time) {
    for (const c of cars) {
      const L = c.axis === 'x' ? W : D, t = ((c.t0 + c.dir * c.speed * time) % L + L) % L;
      if (c.axis === 'x') { c.holder.position.set(t, 0, c.line + c.dir * lane); c.holder.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { c.holder.position.set(c.line - c.dir * lane, 0, t); c.holder.rotation.y = c.dir > 0 ? 0 : Math.PI; }
    }
  }

  // ---------- 攝影機 ----------
  let yaw = Math.atan2(0.62, 0.78), tilt = 0, tx = home.x, tz = home.z, camDist = 36, aspectScale = 1;
  const LIM = { x0: -3, x1: W + 3, z0: -3, z1: D + 3 };
  const distMin = 2.5;
  const zoomRef = () => camDist / aspectScale;
  function placeCamera() {
    camDist = THREE.MathUtils.clamp(camDist, distMin * aspectScale, 125 * aspectScale);
    const k = smooth(40, 118, zoomRef());
    const pitch = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.6257, 0.48, k) + tilt, 0.28, 1.15), fov = THREE.MathUtils.lerp(30, 48, k);
    if (camera.fov !== fov) { camera.fov = fov; }
    tx = THREE.MathUtils.clamp(tx, LIM.x0, LIM.x1); tz = THREE.MathUtils.clamp(tz, LIM.z0, LIM.z1);
    const cp = Math.cos(pitch);
    camera.position.set(tx + Math.sin(yaw) * cp * camDist, 0.4 + Math.sin(pitch) * camDist, tz + Math.cos(yaw) * cp * camDist);
    camera.lookAt(tx, 0.4, tz);
    camera.near = Math.max(0.3, camDist * 0.035); camera.far = 2000;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    sky.dome.position.copy(camera.position);
    rain.lines.position.set(tx, 0, tz); const rs = THREE.MathUtils.clamp(camDist * 0.8, 20, 100); rain.u.uSize.value = rs;
    rain.lines.position.set(tx - rs * 0.15, 0.0, tz - rs * 0.15);
    view = { pitch, fov };
  }
  let view = { pitch: 0.6257, fov: 30 };
  function resize() {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h); composer.setPixelRatio(dpr); composer.setSize(w, h);
    camera.aspect = w / h;
    const prevScale = aspectScale; aspectScale = Math.max(1, 1.62 / camera.aspect);
    if (!resize.done) { camDist = 49 * aspectScale; resize.done = true; } else camDist *= aspectScale / prevScale;
    placeCamera();
  }
  window.addEventListener('resize', resize);

  // ---------- 投影（HTML 標籤用） ----------
  const tmp = new THREE.Vector3();
  function project(x, y, z) { tmp.set(x, y, z).project(camera); return { x: (tmp.x * 0.5 + 0.5) * container.clientWidth, y: (-tmp.y * 0.5 + 0.5) * container.clientHeight, z: tmp.z }; }

  // ---------- 浮動標籤 ----------
  const layer = document.createElement('div'); layer.id = 'city-labels'; layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;overflow:hidden';
  container.parentNode.insertBefore(layer, container.nextSibling);
  const labels = new Map();
  function setLabel(lotId, cfg) {
    const l = lotById.get(lotId); if (!l) return;
    let e = labels.get(lotId);
    if (!cfg) { if (e) { e.el.remove(); labels.delete(lotId); } return; }
    const cls = { green: 'me', red: 'rival', gray: 'empty' }[cfg.tone] || 'empty';
    if (!e) { const el = document.createElement('div'); el.className = 'tag'; layer.appendChild(el); e = { el, lot: l }; labels.set(lotId, e); }
    e.el.className = 'tag ' + cls;
    e.priority = cfg.selected ? 2 : cls === 'me' ? 1 : 0;
    e.el.classList.toggle('selected', !!cfg.selected);
    e.el.style.setProperty('--shop-color', cfg.color || '#687784');
    e.el.innerHTML = `<div class="box"><span class="mk">${businessIcon(cfg.businessId)}</span><div><b>${esc(cfg.title || '')}</b>${cfg.sub ? `<small class="num">${esc(cfg.sub)}</small>` : ''}</div><i class="owner">${cls === 'me' ? '自營' : cls === 'rival' ? '對手' : ''}</i></div><div class="stem"></div>`;
    e.width = e.el.offsetWidth; e.height = e.el.querySelector('.box').offsetHeight;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function placeLabels() {
    const fade = 1 - 0.4 * smooth(60, 110, zoomRef()), placed = [];
    [...labels.values()].sort((a, b) => b.priority - a.priority || a.lot.i - b.lot.i).forEach(({ el, lot, width, height, priority }) => {
      const x = lot.x + lot.nx * 0.1, z = lot.z + lot.nz * 0.1;
      const g = project(x, THREE.MathUtils.lerp(1.05, 0.65, smooth(3, 10, zoomRef())), z), stem = 20;
      el.style.transform = `translate(${g.x}px,${g.y}px) translate(-50%,-100%)`;
      el.querySelector('.stem').style.height = stem + 'px';
      const r = { x0: g.x - width / 2 - 3, x1: g.x + width / 2 + 3, y0: g.y - height - stem - 3, y1: g.y - stem + 3 };
      const visible = g.z < 1 && g.z > -1 && r.x1 > 0 && r.x0 < container.clientWidth && r.y0 > 82 && r.y1 < container.clientHeight && !placed.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
      el.style.opacity = priority ? 1 : fade; el.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) placed.push(r);
    });
  }

  // ---------- 滑鼠選取與高亮 ----------
  const pickCbs = new Set();
  const frame3 = new THREE.Group(); frame3.visible = false; frame3.renderOrder = 999; scene.add(frame3);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, toneMapped: false, depthTest: false, transparent: true, opacity: 0.95 });
  const edges = []; for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), edgeMat); m.renderOrder = 999; frame3.add(m); edges.push(m); }
  function setFrame(min, max, matrix) {
    const t = 0.016 * Math.pow(Math.max(camDist, 8) / 36, 0.75) + 0.008;
    const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z, cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2, cz = (min.z + max.z) / 2;
    let k = 0; const e = (px, py, pz, w, h, d) => { const m = edges[k++]; m.position.set(px, py, pz); m.scale.set(w, h, d); };
    for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) e(cx, y, z, sx + t, t, t);
    for (const x of [min.x, max.x]) for (const z of [min.z, max.z]) e(x, cy, z, t, sy + t, t);
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) e(x, y, cz, t, t, sz + t);
    frame3.matrix.copy(matrix); frame3.matrixAutoUpdate = false; frame3.matrixWorldNeedsUpdate = true; frame3.visible = true;
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _v = new THREE.Vector3(), _b = new THREE.Box3();
  const IDM = new THREE.Matrix4();
  function pickAt(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    let best = null;
    for (const l of shops.lots) {
      const lr = ray.ray.clone().applyMatrix4(l.inv);
      if (lr.intersectBox(l.box, _v)) { const d = _v.applyMatrix4(l.B).distanceTo(ray.ray.origin) - 0.25; if (!best || d < best.d) best = { d, type: 'lot', id: l.id, lot: l }; }
    }
    for (const b of buildings) {
      _b.min.set(b.x - b.w / 2, 0, b.z - b.d / 2); _b.max.set(b.x + b.w / 2, b.h, b.z + b.d / 2);
      if (ray.ray.intersectBox(_b, _v)) { const d = _v.distanceTo(ray.ray.origin); if (!best || d < best.d) best = { d, type: 'building', id: b.id, b }; }
    }
    return best;
  }
  let hover = null;
  function setHover(h) {
    if ((h && hover && h.id === hover.id) || (!h && !hover)) return; hover = h;
    if (!h) { frame3.visible = false; renderer.domElement.style.cursor = ''; return; }
    renderer.domElement.style.cursor = 'pointer';
    if (h.type === 'lot') setFrame(h.lot.box.min, h.lot.box.max, h.lot.B);
    else setFrame(new THREE.Vector3(h.b.x - h.b.w / 2, 0, h.b.z - h.b.d / 2), new THREE.Vector3(h.b.x + h.b.w / 2, h.b.h, h.b.z + h.b.d / 2), IDM);
  }

  // ---------- 輸入：平移、縮放、旋轉 ----------
  const dom = renderer.domElement;
  const ptrs = new Map(); let drag = null, down = null, gest = null, hoverQ = null;
  const keys = new Set();
  function panBy(dx, dy) {
    const s = 2 * camDist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / dom.clientHeight;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    tx -= rx * dx * s; tz -= rz * dx * s; tx += fx * dy * s / Math.sin(view.pitch); tz += fz * dy * s / Math.sin(view.pitch);
    placeCamera();
  }
  if (opts.controls !== false) {
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('pointerdown', e => {
      e.preventDefault();
      dom.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { drag = { btn: e.button, pan: e.button !== 0 || e.shiftKey, moved: 0 }; down = { x: e.clientX, y: e.clientY, t: performance.now() }; }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gest = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null; down = null; }
    });
    dom.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId);
      if (!p) { hoverQ = [e.clientX, e.clientY]; return; }
      if (ptrs.size === 2 && gest) {
        p.x = e.clientX; p.y = e.clientY; const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        camDist *= gest.d / Math.max(d, 1); let da = ang - gest.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; yaw -= da;
        panBy(mx - gest.mx, my - gest.my); gest = { d, ang, mx, my }; placeCamera(); return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (drag) {
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 4) {
          setHover(null); dom.style.cursor = 'grabbing';
          if (drag.pan) panBy(dx, dy);
          else { yaw -= dx * 0.006; tilt = THREE.MathUtils.clamp(tilt + dy * 0.003, -0.3, 0.45); placeCamera(); }
        }
      }
    });
    const up = (e) => {
      const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId);
      if (ptrs.size < 2) gest = null;
      if (had && drag && drag.btn === 0 && !drag.pan && drag.moved <= 4 && down && performance.now() - down.t < 500) {
        const h = pickAt(e.clientX, e.clientY); if (h) pickCbs.forEach(cb => cb({ type: h.type, id: h.id }));
      }
      if (ptrs.size === 0) { drag = null; down = null; dom.style.cursor = ''; }
    };
    const cancel = () => { ptrs.clear(); drag = down = gest = hoverQ = null; setHover(null); dom.style.cursor = ''; };
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', cancel); dom.addEventListener('lostpointercapture', e => { if (ptrs.has(e.pointerId)) cancel(); });
    dom.addEventListener('pointerleave', () => { hoverQ = null; setHover(null); });
    dom.addEventListener('wheel', e => { e.preventDefault(); const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? dom.clientHeight : 1); camDist *= Math.exp(THREE.MathUtils.clamp(dy, -180, 180) * 0.0016); placeCamera(); }, { passive: false });
    window.addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return; const key = e.key.toLowerCase(); if (/^(q|e|w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/.test(key)) { e.preventDefault(); keys.add(key); } });
    window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { keys.clear(); cancel(); });
  }
  function keyStep(dt) {
    if (!keys.size) return; let ch = false;
    if (keys.has('q')) { yaw += 1.4 * dt; ch = true; } if (keys.has('e')) { yaw -= 1.4 * dt; ch = true; }
    const v = camDist * 0.6 * dt; let mx = 0, mz = 0;
    if (keys.has('w') || keys.has('arrowup')) { mx -= Math.sin(yaw); mz -= Math.cos(yaw); } if (keys.has('s') || keys.has('arrowdown')) { mx += Math.sin(yaw); mz += Math.cos(yaw); }
    if (keys.has('a') || keys.has('arrowleft')) { mx -= Math.cos(yaw); mz += Math.sin(yaw); } if (keys.has('d') || keys.has('arrowright')) { mx += Math.cos(yaw); mz -= Math.sin(yaw); }
    if (mx || mz) { tx += mx * v; tz += mz * v; ch = true; }
    if (ch) placeCamera();
  }
  function focusLot(id, dist = 9) {
    const l = lotById.get(id); if (!l) return;
    tx = l.x + l.nx * 0.2; tz = l.z + l.nz * 0.2;
    const front = Math.atan2(l.nx, l.nz), from = new THREE.Vector3(tx, 0.4, tz), dir = new THREE.Vector3(), hit = new THREE.Vector3(), bounds = new THREE.Box3();
    const sight = new THREE.Ray(), distances = [...new Set([dist, Math.min(dist, 5.5), Math.min(dist, 3.5), distMin])];
    // 樓間街道很窄：選店時先找通暢視線，避免鏡頭停在對面樓體裡。
    let best = null;
    for (const d of distances) for (const t of [0, 0.25, -0.2]) for (const offset of [0.55, 0, -0.55, 1.15, -1.15]) {
      const p = THREE.MathUtils.clamp(0.6257 + t, 0.28, 1.15), a = front + offset, distance = d * aspectScale;
      dir.set(Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p)); sight.set(from, dir);
      let blocked = 0;
      for (const b of buildings) {
        if (b.id === l.building) continue;
        bounds.min.set(b.x - b.w / 2, 0, b.z - b.d / 2); bounds.max.set(b.x + b.w / 2, b.h, b.z + b.d / 2);
        if (sight.intersectBox(bounds, hit) && hit.distanceTo(from) < distance) blocked++;
      }
      const score = blocked * 100 + Math.abs(dist - d) * 2 + Math.abs(t) * 3 + Math.abs(offset - 0.55);
      if (!best || score < best.score) best = { score, d, t, a };
    }
    camDist = best.d * aspectScale; yaw = best.a; tilt = best.t; placeCamera();
  }

  // ---------- 主迴圈 ----------
  const clock = new THREE.Clock();
  let simT = opts.time ?? 0, frozen = !!opts.freeze, frames = 0, timeScale = 1;
  let fpsEMA = 60, fpsT = 0, lowStreak = 0, warm = 0;
  const dbg = (opts.debug ?? qs.has('debug')) ? Object.assign(document.createElement('div'), {}) : null;
  if (dbg) { dbg.style.cssText = 'position:fixed;right:8px;bottom:6px;z-index:99;font:11px/1.3 ui-monospace,monospace;color:#cfe;background:rgba(0,0,0,.45);padding:2px 6px;border-radius:4px;pointer-events:none'; document.body.appendChild(dbg); }
  function update(dt) {
    if (!frozen) simT += dt * timeScale;
    simUniforms.uTime.value = simT;
    // 天氣漸變
    const k = Math.min(1, dt * 0.9); let ch = false;
    if (Math.abs(wx.cloud - wx.tc) > 0.002) { wx.cloud += (wx.tc - wx.cloud) * k; ch = true; } else if (wx.cloud !== wx.tc) { wx.cloud = wx.tc; ch = true; }
    if (Math.abs(wx.rain - wx.tr) > 0.002) { wx.rain += (wx.tr - wx.rain) * k; ch = true; } else if (wx.rain !== wx.tr) { wx.rain = wx.tr; ch = true; }
    if (ch || envDirty) { envDirty = false; applyEnv(); }
    sky.uniforms.uTime.value = simT; rain.u.uTime.value = simT; scenery.wU.uT.value = simT;
    if (!frozen) { placeCars(simT); people.update(dt * timeScale, simT); }
  }
  let envDirty = true;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    keyStep(dt);
    update(dt);
    if (hoverQ && !drag) { const h = pickAt(hoverQ[0], hoverQ[1]); setHover(h); hoverQ = null; }
    renderer.info.reset();
    composer.render();
    frames++;
    placeLabels();
    api.onFrame && api.onFrame();
    // fps 與自動畫質
    fpsT += dt; if (dt > 0) fpsEMA += (1 / dt - fpsEMA) * 0.05;
    if (dbg && frames % 15 === 0) dbg.textContent = `${fpsEMA.toFixed(0)} fps · ${quality} · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tri · ${people.counts().walkers} walkers`;
    warm += dt;
    if (autoQuality && quality === 'high' && warm > 4) { if (fpsEMA < 24) lowStreak += dt; else lowStreak = 0; if (lowStreak > 3) { applyQuality('low'); lowStreak = 0; } }
    requestAnimationFrame(frame);
  }

  const api = {
    shops: {}, project, camera, onFrame: null, frames: () => frames, scene, renderer,
    async ready() {
      await Promise.all([kit.finalize(), ...carJobs]);
      resize(); applyQuality(quality); applyEnv(); refreshEnvMap(true); placeCars(simT);
      shops.lots.forEach(l => { api.shops[l.id] = { x: l.bx, z: l.bz }; });
      Object.entries(DEF).forEach(([k, id]) => { const l = lotById.get(id); api.shops[k] = { x: l.bx, z: l.bz, lot: id }; });
      api.defaultLots = DEF; api.loaded = true;
    },
    start() { clock.getDelta(); requestAnimationFrame(frame); },
    // ---- 模擬層介面 ----
    getMapData() {
      const state = (l) => !l.owner ? '空' : l.owner === 'player' ? '玩家' : '對手';
      const nodes = (g) => g.nodes.map((n, i) => ({ id: i, x: +n.x.toFixed(3), z: +n.z.toFixed(3) }));
      return {
        populationMultiplier: 2,
        lots: shops.lots.map(l => ({ id: l.id, x: +l.door.x.toFixed(3), z: +l.door.z.toFixed(3), bx: l.bx, bz: l.bz, zone: l.zone, district: l.bz > 12 ? '南城生活與商辦區' : l.bx > 16 ? '東城新區' : '雲港舊城', state: state(l), owner: l.owner, name: l.name, color: l.color, building: l.building, face: l.face })),
        buildings: buildings.map(b => ({ id: b.id, type: b.type, x: +b.x.toFixed(3), z: +b.z.toFixed(3), w: +b.w.toFixed(2), d: +b.d.toFixed(2), h: +b.h.toFixed(2), floors: b.floors })),
        sidewalk: { nodes: nodes(sidewalk), edges: sidewalk.edges.map(e => [e[0], e[1], +e[2].toFixed(3)]) },
        roads: { nodes: nodes(roads), edges: roads.edges.map(e => [e[0], e[1], +e[2].toFixed(3)]) },
        bounds: { minX: -M, maxX: W + M, minZ: -M, maxZ: D + M },
      };
    },
    walkDistance(a, b) { return sidewalk.length([a[0], a[1]], [b[0], b[1]]); },
    walkDistanceToLot(a, lotId) { const l = lotById.get(lotId); return l ? sidewalk.length([a[0], a[1]], [l.door.x, l.door.z]) : Infinity; },
    setShop(lotId, cfg) { const ok = shops.setShop(lotId, cfg); if (ok && !cfg) { people.setQueue(lotId, 0, qAnchor(lotById.get(lotId))); } return ok; },
    spawnWalker(from, lotId, o) { return people.spawnWalker(from, lotId, o); },
    setQueue(lotId, n) { const l = lotById.get(lotId); if (!l) return; l.queue = n; people.setQueue(lotId, n, qAnchor(l)); },
    spawnScooter(lotId, to, o) { return people.spawnScooter(lotId, to, o); },
    setClock(h) { hour = ((h % 24) + 24) % 24; envDirty = true; applyEnv(); },
    getClock: () => hour,
    setWeather(w, instant) { wx.tc = w === 'rain' ? 0.85 : w === 'cloudy' ? 0.8 : 0; wx.tr = w === 'rain' ? 1 : 0; api.weather = w; if (instant) { wx.cloud = wx.tc; wx.rain = wx.tr; } envDirty = true; },
    getWeather: () => api.weather || 'sunny',
    onPick(cb) { pickCbs.add(cb); return () => pickCbs.delete(cb); },
    setLabel,
    // ---- 其他 ----
    setQuality(q) { applyQuality(q === 'low' ? 'low' : 'high'); }, getQuality: () => quality,
    setTimeScale(x) { timeScale = x; },
    freeze(f) { frozen = f; },
    step(sec) { let t = sec; while (t > 1e-6) { const d = Math.min(0.05, t); update(d); t -= d; } },
    setView(v) { if (v.x !== undefined) tx = v.x; if (v.z !== undefined) tz = v.z; if (v.dist !== undefined) camDist = v.dist * aspectScale; if (v.yaw !== undefined) yaw = v.yaw; if (v.tilt !== undefined) tilt = THREE.MathUtils.clamp(v.tilt, -0.3, 0.45); placeCamera(); },
    getView: () => ({ x: tx, z: tz, dist: camDist / aspectScale, yaw, tilt }),
    focusLot,
    stats: () => ({ fps: fpsEMA, quality, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, ...people.counts(), lots: shops.lots.length, buildings: buildings.length, ...kit.stats() }),
    lotsById: lotById,
    pickAt(x, y) { const h = pickAt(x, y); return h && { type: h.type, id: h.id }; }, hovered: () => hover && hover.id,
  };
  function qAnchor(l) { return { x: l.qStart.x, z: l.qStart.z, nx: l.nx, nz: l.nz, tx: l.tangent.x, tz: l.tangent.z, sx: 0 }; }
  api.setWeather(opts.weather || qs.get('weather') || 'sunny', true);
  return api;
}

function gradeShader() {
  return {
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, 0.94);
        c *= vec3(1.05, 1.0, 0.93);
        c += (1.0 - smoothstep(0.0, 0.35, l)) * vec3(0.012, 0.004, 0.03);
        float v = distance(vUv, vec2(0.5)); c *= 1.0 - smoothstep(0.45, 0.95, v) * 0.35;
        gl_FragColor = vec4(c, t.a);
      }`,
  };
}
