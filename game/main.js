// HUNTR/X：魂門之戰 — Stage 1「首爾夜市・魂門裂縫」
// 3D 無雙式關卡：韓國街頭四區推進＋Boss 陰差隊長
// 資產：KayKit Character/City Packs（CC0，見 assets/LICENSE-*.txt）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MODEL_YAW = 0;              // glTF 標準：模型原生面向 +Z，rotation.y 直接用 yaw
const NEON = [0xff4fd8, 0xff2fa0, 0x8a4fff, 0x4fd8ff, 0xff6ab0, 0xb47aff];
const IS_MOBILE = matchMedia('(pointer: coarse)').matches;
if (IS_MOBILE) document.body.classList.add('is-touch');

// 關卡（同一條街廊道，分區沿 -Z 推進；Stage 2 為血月變體）
const STAGES = [
  {
    // 第一關＝千人斬爽關：全程高密度屍潮，滿千見魔王
    name: '第一關　首爾夜市・千人斬', bossKind: 'boss', bossLabel: '陰差隊長',
    objectives: [
      { name: '千人斬', type: 'horde', need: 1000, pos: [0, 0], fast: 0.28 },
    ],
    bossPos: [0, -35],
  },
  {
    // 第二關主打「魂燈防衛戰」：敵人衝魂燈，時限內守住
    name: '第二關　黃泉花海・魂燈渡口', bossKind: 'boss2', bossLabel: '陰差大隊長',
    objectives: [
      { name: '花田殲滅戰',   type: 'kill',    need: 22, pos: [-27, 18], fast: 0.3, ambush: true },
      { name: '西渡口魂燈',   type: 'defend',  time: 40, pos: [27, 18], fast: 0.35 },
      { name: '冥河敵將',     type: 'officer', officers: 3, pos: [-27, -21], fast: 0.35 },
      { name: '東渡口魂燈',   type: 'defend',  time: 45, pos: [27, -21], fast: 0.45 },
    ],
    bossPos: [0, -35],
  },
  {
    // 第三關主打「時限試煉」：限時殺夠額度，超時歸零重來
    name: '第三關　天界・魂門之上', bossKind: 'boss3', bossLabel: '陰差王',
    objectives: [
      { name: '雲海據點',     type: 'capture', pos: [-27, 18], fast: 0.4 },
      { name: '百人斬試煉',   type: 'trial',   need: 26, tlimit: 55, pos: [27, 18], fast: 0.45 },
      { name: '星橋敵將',     type: 'officer', officers: 3, pos: [-27, -21], fast: 0.5 },
      { name: '神速試煉',     type: 'trial',   need: 20, tlimit: 38, pos: [27, -21], fast: 0.65 },
    ],
    bossPos: [0, -35],
  },
  {
    // 第四關主打「封印裂口」：打破會湧敵的裂口水晶
    name: '第四關　虛空・魂門之心', bossKind: 'boss4', bossLabel: '魂門之靈',
    objectives: [
      { name: '北裂口封印',   type: 'rift', riftHp: 55, pos: [-27, 18], fast: 0.45 },
      { name: '虛空武將團',   type: 'officer', officers: 3, pos: [27, 18], fast: 0.5 },
      { name: '西裂口封印',   type: 'rift', riftHp: 70, pos: [-27, -21], fast: 0.55 },
      { name: '深淵裂口封印', type: 'rift', riftHp: 85, pos: [27, -21], fast: 0.6, ambush: true },
    ],
    bossPos: [0, -35],
  },
];
const OFFICER_NAMES = ['陰差百夫長', '陰差千夫長', '夜叉先鋒', '羅刹遊擊', '牛頭督戰', '馬面斥候'];
let stageIdx = 0;

// ---------- 可操作角色（HUNTR/X 三人組） ----------
// mira.glb / zoey.glb 若存在（tmp-convert 管線產出）自動採用；否則以 Rumi 模型＋靈氣配色代身
const CHARS = {
  rumi: { key: 'rumi', name: 'RUMI', weapon: 'sword', tint: null,     hair: 0x8a5ae0, fx: 0xc9a4ff, fxHi: 0xe0ccff, boltCol: 0x7ad0ff, spd: 6.5, dmgMul: 1,    hpMul: 1,    atkTs: 1,    rangeMul: 1,    light: 0xff4fa3 },
  mira: { key: 'mira', name: 'MIRA', weapon: 'great', tint: 0x4a78ff, hair: 0x3a5090, fx: 0x6aa8ff, fxHi: 0xaad4ff, boltCol: 0x6ab8ff, spd: 5.9, dmgMul: 1.28, hpMul: 1.18, atkTs: 0.86, rangeMul: 1.2,  light: 0x5a8aff },
  zoey: { key: 'zoey', name: 'ZOEY', weapon: 'short', tint: 0xffc040, hair: 0xff9ec0, fx: 0xffd84f, fxHi: 0xffeaa8, boltCol: 0xffe08a, spd: 7.5, dmgMul: 0.82, hpMul: 0.88, atkTs: 1.18, rangeMul: 0.85, light: 0xffb040 },
};
let curChar = CHARS.rumi;

// ---------- 基本場景 ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.15 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x140f28, 26, 100);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.72, 0.55, 0.55));
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- 燈光（夜街：冷月光主光＋暖鈉燈補光＋青色輪廓光） ----------
const hemi = new THREE.HemisphereLight(0x9a8aff, 0x241540, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xbfcaff, 1.35);
sun.position.set(8, 18, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0015;
scene.add(sun);
scene.add(sun.target);
const warmFill = new THREE.DirectionalLight(0xff4fd0, 0.35);
warmFill.position.set(-6, 8, 3);
scene.add(warmFill);
const rimLight = new THREE.DirectionalLight(0x4fd8ff, 0.55);
rimLight.position.set(-8, 6, -10);
scene.add(rimLight);
const heroLight = new THREE.PointLight(0xff4fa3, 1.4, 9, 1.6);
scene.add(heroLight);

// ---------- 天空（AI 生成全景） ----------
let skyMat = null;
let skyTex1 = null;
(function buildSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(290, 48, 24),
    new THREE.MeshBasicMaterial({ color: 0x0a0818, side: THREE.BackSide, fog: false })
  );
  sky.position.set(0, 0, -85);
  sky.rotation.y = Math.PI;
  skyMat = sky.material;
  scene.add(sky);
  new THREE.TextureLoader().load('assets/gen/sky.jpg', tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    skyTex1 = tex;
    if (stageIdx === 0) {
      sky.material.map = tex;
      sky.material.color.set(0xffffff);
      sky.material.needsUpdate = true;
    }
  });
})();

// ---------- 共用貼圖工具 ----------
function makeWindowTex(hue) {
  // 寫實立面：混凝土基底＋樓層帶＋窗框＋污漬＋垂直明暗
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#26263a');
  bg.addColorStop(0.6, '#1b1b2a');
  bg.addColorStop(1, '#12121f');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 42; i++) {           // 立面污漬直紋
    g.fillStyle = `rgba(${8 + Math.random() * 20},${8 + Math.random() * 18},${16 + Math.random() * 24},${0.1 + Math.random() * 0.16})`;
    const w = 3 + Math.random() * 9;
    g.fillRect(Math.random() * 128, Math.random() * 256, w, w * (2 + Math.random() * 6));
  }
  for (let y = 8; y < 250; y += 16) {      // 樓層分割帶
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y + 12, 128, 2);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, y + 14, 128, 1);
  }
  for (let y = 8; y < 242; y += 16) {      // 窗（亮/暗/窗簾）
    for (let x = 6; x < 118; x += 12) {
      const lit = Math.random() < 0.36;
      if (lit) {
        const warm = Math.random() < 0.6;
        const wg = g.createLinearGradient(0, y, 0, y + 10);
        wg.addColorStop(0, warm ? '#ffe9c0' : `hsl(${hue},75%,80%)`);
        wg.addColorStop(1, warm ? '#e8a95e' : `hsl(${hue},60%,52%)`);
        g.fillStyle = wg;
      } else {
        g.fillStyle = `rgba(${20 + Math.random() * 18},${26 + Math.random() * 20},${46 + Math.random() * 26},0.92)`;
      }
      g.fillRect(x, y, 8, 10);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x, y, 8, 1);
      if (lit && Math.random() < 0.35) {   // 半掩窗簾
        g.fillStyle = 'rgba(28,18,30,0.6)';
        g.fillRect(x, y, 8, 3 + Math.random() * 4);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 韓文招牌
const KR_WORDS = ['치킨', '노래방', 'PC방', '분식', '호프', '편의점', '미용실', '약국', '곱창', '떡볶이', '삼겹살', '카페', '만화방', '슈퍼', '세탁소', '핸드폰'];
const SIGN_NEON = ['#ff5fd0', '#5fe0ff', '#b47aff', '#ff8fe0', '#7a9fff', '#ff4fa8'];
const SIGN_STYLES = SIGN_NEON.map(c => ['#14101f', c]);
function makeSignTex(word, w = 256, h = 72) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const [bg, fg] = SIGN_STYLES[Math.floor(Math.random() * SIGN_STYLES.length)];
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 3;
  g.shadowColor = fg; g.shadowBlur = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.globalAlpha = 1;
  g.font = `900 ${Math.floor(h * 0.6)}px "Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowBlur = 18;
  g.fillStyle = fg;
  g.fillText(word, w / 2, h / 2 + 2);
  g.fillText(word, w / 2, h / 2 + 2);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff'; g.globalAlpha = 0.85;
  g.fillText(word, w / 2, h / 2 + 2);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeVSignTex(word) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const [bg, fg] = SIGN_STYLES[Math.floor(Math.random() * SIGN_STYLES.length)];
  g.fillStyle = bg; g.fillRect(0, 0, 64, 256);
  g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 3;
  g.shadowColor = fg; g.shadowBlur = 8;
  g.strokeRect(4, 4, 56, 248);
  g.globalAlpha = 1;
  g.font = '900 38px "Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...word].slice(0, 4);
  const step = 256 / (chars.length + 1);
  g.shadowBlur = 14;
  g.fillStyle = fg;
  chars.forEach((ch, i) => { g.fillText(ch, 32, step * (i + 1) + 6); g.fillText(ch, 32, step * (i + 1) + 6); });
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff'; g.globalAlpha = 0.85;
  chars.forEach((ch, i) => g.fillText(ch, 32, step * (i + 1) + 6));
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 一樓店面（發光玻璃＋門＋雨棚）
function makeStorefrontTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#191926'; g.fillRect(0, 0, 256, 128);
  const aw = ['#b02a8a', '#2a4fb0', '#6a2ab0', '#3a3a8a'][Math.floor(Math.random() * 4)];
  g.fillStyle = aw; g.fillRect(0, 0, 256, 18);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (let x = 0; x < 256; x += 24) g.fillRect(x, 0, 12, 18);
  const wg = g.createLinearGradient(0, 30, 0, 118);
  const cool = Math.random() < 0.5;
  wg.addColorStop(0, cool ? '#ffc8ee' : '#ffe9b8');
  wg.addColorStop(1, cool ? '#c878d8' : '#e8a95e');
  g.fillStyle = wg; g.fillRect(14, 30, 150, 88);
  g.fillStyle = 'rgba(30,20,10,0.35)';
  g.fillRect(14, 30, 150, 6);
  g.fillStyle = 'rgba(60,30,10,0.45)';
  for (let i = 0; i < 3; i++) g.fillRect(26 + i * 46, 66 - Math.random() * 14, 20, 52);
  g.fillStyle = '#241a2e'; g.fillRect(184, 34, 56, 84);
  g.fillStyle = '#ffd9a0'; g.fillRect(206, 70, 10, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


const world1 = new THREE.Group();
const world2 = new THREE.Group();
const world3 = new THREE.Group();
const world4 = new THREE.Group();
scene.add(world1, world2, world3, world4);
world2.visible = false;
world3.visible = false;
world4.visible = false;

// 開放戰場：正方形地圖，每關獨立佈局（碰撞/遮擋/小地圖跟著切換）
const MAP_HALF = 47;
// 第一關：千人斬大廣場——只留外圈少量街區，中央全開放屍潮
function genCityBlocks() {
  return [
    { x: -34, z: 34, hx: 7, hz: 7 }, { x: 34, z: 34, hx: 7, hz: 7 },
    { x: -34, z: -34, hx: 7, hz: 7 }, { x: 34, z: -34, hx: 7, hz: 7 },
    { x: -36, z: 0, hx: 5.5, hz: 5.5 }, { x: 36, z: 0, hx: 5.5, hz: 5.5 },
  ];
}
// 第二關：開闊花海＋樹叢群落（防衛戰要跑位）
function genMeadowBlocks() {
  return [
    { x: -14, z: 30, hx: 4, hz: 4 }, { x: 10, z: 27, hx: 3.5, hz: 3.5 },
    { x: -32, z: 2, hx: 4.5, hz: 4.5 }, { x: -10, z: 6, hx: 3.5, hz: 3.5 },
    { x: 12, z: -2, hx: 4, hz: 4 }, { x: 34, z: 0, hx: 4, hz: 4 },
    { x: -14, z: -32, hx: 4, hz: 4 }, { x: 12, z: -26, hx: 3.5, hz: 3.5 },
    { x: 32, z: 32, hx: 4.5, hz: 4.5 }, { x: -36, z: 34, hx: 4, hz: 4 },
    { x: 38, z: -32, hx: 4, hz: 4 },
  ];
}
// 第三關：對稱聖域（十字柱廊＋四角平台）
function genTempleBlocks() {
  return [
    { x: -18, z: 0, hx: 5, hz: 5 }, { x: 18, z: 0, hx: 5, hz: 5 },
    { x: 0, z: 18, hx: 5, hz: 5 }, { x: 0, z: -18, hx: 5, hz: 5 },
    { x: -34, z: 34, hx: 6, hz: 6 }, { x: 34, z: 34, hx: 6, hz: 6 },
    { x: -34, z: -34, hx: 6, hz: 6 }, { x: 34, z: -34, hx: 6, hz: 6 },
    { x: -36, z: 0, hx: 4, hz: 4 }, { x: 36, z: 0, hx: 4, hz: 4 },
  ];
}
// 第四關：中央六角浮島環＋外圍碎島（不對稱）
function genVoidBlocks() {
  const arr = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    arr.push({ x: Math.round(Math.cos(a) * 20), z: Math.round(Math.sin(a) * 20), hx: 3.5, hz: 3.5 });
  }
  arr.push({ x: -40, z: 26, hx: 4.5, hz: 4.5 }, { x: 40, z: 30, hx: 4, hz: 4 },
    { x: -20, z: -38, hx: 5, hz: 5 }, { x: 36, z: -36, hx: 4, hz: 4 });
  return arr;
}
const OBSTACLES_BY_STAGE = [genCityBlocks(), genMeadowBlocks(), genTempleBlocks(), genVoidBlocks()];
const blockersRegBy = OBSTACLES_BY_STAGE.map(list => list.map(() => ({ mats: [], cur: 1, target: 1, applied: 1 })));
let OBSTACLES = OBSTACLES_BY_STAGE[0];
let blockersReg = blockersRegBy[0];
function segHitsAABB(x0, z0, x1, z1, minx, minz, maxx, maxz) {
  const dx = x1 - x0, dz = z1 - z0;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-6) { if (x0 < minx || x0 > maxx) return false; }
  else {
    let ta = (minx - x0) / dx, tb = (maxx - x0) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-6) { if (z0 < minz || z0 > maxz) return false; }
  else {
    let ta = (minz - z0) / dz, tb = (maxz - z0) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
function updateOcclusion() {
  const cx = camera.position.x, cz = camera.position.z;
  for (let i = 0; i < OBSTACLES.length; i++) {
    const b = OBSTACLES[i], reg = blockersReg[i];
    if (!reg.mats.length) continue;
    reg.target = segHitsAABB(cx, cz, player.x, player.z, b.x - b.hx - 0.8, b.z - b.hz - 0.8, b.x + b.hx + 0.8, b.z + b.hz + 0.8) ? 0.16 : 1;
    reg.cur += (reg.target - reg.cur) * 0.22;
    if (Math.abs(reg.cur - reg.applied) > 0.015) {
      reg.applied = reg.cur;
      for (const m of reg.mats) {
        m.transparent = reg.cur < 0.98;
        m.opacity = reg.cur;
        m.depthWrite = reg.cur > 0.6;
      }
    }
  }
}
function collideCircle(o, r) {
  o.x = Math.max(-MAP_HALF + 1, Math.min(MAP_HALF - 1, o.x));
  o.z = Math.max(-MAP_HALF + 1, Math.min(MAP_HALF - 1, o.z));
  for (const b of OBSTACLES) {
    const dx = o.x - b.x, dz = o.z - b.z;
    const px = b.hx + r - Math.abs(dx);
    const pz = b.hz + r - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) o.x = b.x + (dx >= 0 ? 1 : -1) * (b.hx + r);
      else o.z = b.z + (dz >= 0 ? 1 : -1) * (b.hz + r);
    }
  }
}

// ---------- 韓國街道 ----------// ---------- 開放城區（第一關：首爾夜市街區） ----------
let lightPool = null;
const groundMats = [];
const flickers = [];
const ENV = { signs: [], fronts: [], wins: [], tentGlows: [] };
(function buildOpenCity() {
  // 柏油地面
  const ac = document.createElement('canvas');
  ac.width = ac.height = 256;
  const ag = ac.getContext('2d');
  ag.fillStyle = '#191922'; ag.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    ag.fillStyle = `rgba(${120 + Math.random() * 60},${120 + Math.random() * 60},${130 + Math.random() * 60},${0.05 + Math.random() * 0.07})`;
    ag.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const asphalt = new THREE.CanvasTexture(ac);
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.repeat.set(18, 18);
  asphalt.colorSpace = THREE.SRGBColorSpace;
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.32, metalness: 0.62 });
  groundMats.push(roadMat);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(104, 104), roadMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world1.add(ground);
  // 兩條主幹道虛線
  const dashMat = new THREE.MeshBasicMaterial({ color: 0x8a8a80 });
  for (let k = -44; k <= 44; k += 5) {
    const d1 = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1.8), dashMat);
    d1.rotation.x = -Math.PI / 2;
    d1.position.set(0, 0.012, k);
    world1.add(d1);
    const d2 = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.18), dashMat);
    d2.rotation.x = -Math.PI / 2;
    d2.position.set(k, 0.012, 0);
    world1.add(d2);
  }
  // 街區：人行道座台＋組合式樓體（裙樓＋退縮塔身＋女兒牆＋屋頂設備）＋招牌
  const winTexs = [makeWindowTex(46), makeWindowTex(190), makeWindowTex(285), makeWindowTex(210), makeWindowTex(320)];
  const paveMat = new THREE.MeshLambertMaterial({ color: 0x2e2a3a });
  let wi = 0;
  const OBS1 = OBSTACLES_BY_STAGE[0], REG1 = blockersRegBy[0];
  for (const b of OBS1) {
    const blockReg = REG1[OBS1.indexOf(b)];
    const reg = m => { blockReg.mats.push(m); return m; };
    const plate = new THREE.Mesh(new THREE.BoxGeometry(b.hx * 2 + 4, 0.14, b.hz * 2 + 4), paveMat);
    plate.position.set(b.x, 0.07, b.z);
    plate.receiveShadow = true;
    world1.add(plate);
    // 裙樓（1-2F 商場帶）＋女兒牆
    const podMat = reg(new THREE.MeshLambertMaterial({ color: 0x252134 }));
    const pod = new THREE.Mesh(new THREE.BoxGeometry(b.hx * 2, 3.6, b.hz * 2), podMat);
    pod.position.set(b.x, 1.9, b.z);
    pod.castShadow = true;
    world1.add(pod);
    const lipMat = reg(new THREE.MeshLambertMaterial({ color: 0x171422 }));
    const podLip = new THREE.Mesh(new THREE.BoxGeometry(b.hx * 2 + 0.3, 0.28, b.hz * 2 + 0.3), lipMat);
    podLip.position.set(b.x, 3.85, b.z);
    world1.add(podLip);
    // 塔身（退縮 + 隨機第二段退縮）
    const h = 10 + Math.random() * 9;
    const winMat = reg(new THREE.MeshBasicMaterial({ map: winTexs[wi % winTexs.length] }));
    ENV.wins.push(winMat);
    const inset = 0.8 + Math.random() * 0.8;
    const tw = b.hx * 2 - inset * 2, td = b.hz * 2 - inset * 2;
    const tx = b.x + (Math.random() * 2 - 1) * inset * 0.4, tz = b.z + (Math.random() * 2 - 1) * inset * 0.4;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, h, td), winMat);
    tower.position.set(tx, h / 2 + 3.9, tz);
    tower.castShadow = true;
    world1.add(tower);
    let topY = h + 3.9, topW = tw, topD = td;
    if (Math.random() < 0.55) {
      const h2 = 3.5 + Math.random() * 5;
      const winMat2 = reg(new THREE.MeshBasicMaterial({ map: winTexs[(wi + 2) % winTexs.length] }));
      ENV.wins.push(winMat2);
      const w2 = tw * 0.62, d2 = td * 0.62;
      const t2 = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, d2), winMat2);
      t2.position.set(tx, topY + h2 / 2, tz);
      t2.castShadow = true;
      world1.add(t2);
      const lip1 = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.24, 0.22, td + 0.24), lipMat);
      lip1.position.set(tx, topY + 0.1, tz);
      world1.add(lip1);
      topY += h2; topW = w2; topD = d2;
    }
    // 頂部女兒牆＋霓虹頂緣
    const lipTop = new THREE.Mesh(new THREE.BoxGeometry(topW + 0.24, 0.22, topD + 0.24), lipMat);
    lipTop.position.set(tx, topY + 0.1, tz);
    world1.add(lipTop);
    const trimMat = reg(new THREE.MeshBasicMaterial({ color: NEON[wi % NEON.length] }));
    const trim = new THREE.Mesh(new THREE.BoxGeometry(topW + 0.34, 0.09, topD + 0.34), trimMat);
    trim.position.set(tx, topY + 0.26, tz);
    world1.add(trim);
    // 屋頂設備：水塔＋空調＋天線（紅色警示燈）
    const roofMat = reg(new THREE.MeshLambertMaterial({ color: 0x2a2738 }));
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.5, 8), roofMat);
    tank.position.set(tx - topW * 0.26, topY + 0.95, tz - topD * 0.2);
    world1.add(tank);
    const tankCap = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.4, 8), roofMat);
    tankCap.position.set(tank.position.x, topY + 1.9, tank.position.z);
    world1.add(tankCap);
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 0.9), roofMat);
    ac.position.set(tx + topW * 0.24, topY + 0.5, tz + topD * 0.22);
    world1.add(ac);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 4), roofMat);
    ant.position.set(tx + topW * 0.1, topY + 1.5, tz - topD * 0.25);
    world1.add(ant);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3a3a });
    const bcn = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), beaconMat);
    bcn.position.set(ant.position.x, topY + 2.85, ant.position.z);
    world1.add(bcn);
    flickers.push({ mat: beaconMat, base: new THREE.Color(0xff3a3a), speed: 0.3 + Math.random() * 0.3, phase: Math.random() * 10 });
    // 四面一樓店面＋裙樓頂看板
    for (const [dx, dz, ry] of [[0, b.hz + 0.06, 0], [0, -b.hz - 0.06, Math.PI], [b.hx + 0.06, 0, Math.PI / 2], [-b.hx - 0.06, 0, -Math.PI / 2]]) {
      const frontMat = new THREE.MeshBasicMaterial({ map: makeStorefrontTex() });
      ENV.fronts.push(frontMat);
      blockReg.mats.push(frontMat);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(b.hx * 2 - 1.2, 3.1), frontMat);
      front.position.set(b.x + dx, 1.68, b.z + dz);
      front.rotation.y = ry;
      world1.add(front);
      const signMat = new THREE.MeshBasicMaterial({ map: makeSignTex(KR_WORDS[Math.floor(Math.random() * KR_WORDS.length)]) });
      ENV.signs.push(signMat);
      blockReg.mats.push(signMat);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(b.hx * 2 - 2, 1.2), signMat);
      sign.position.set(b.x + dx * 1.012, 4.62, b.z + dz * 1.012);
      sign.rotation.y = ry;
      world1.add(sign);
      if (Math.random() < 0.4) flickers.push({ mat: signMat, speed: 0.5 + Math.random(), phase: Math.random() * 10 });
    }
    // 立式直招（裙樓角落，含支柱）
    const vTex = makeVSignTex(KR_WORDS[Math.floor(Math.random() * KR_WORDS.length)]);
    const vDark = new THREE.MeshLambertMaterial({ color: 0x14141f });
    const vMats = [
      new THREE.MeshBasicMaterial({ map: vTex }),
      new THREE.MeshBasicMaterial({ map: vTex }),
      vDark, vDark, vDark, vDark,
    ];
    ENV.signs.push(vMats[0], vMats[1]);
    blockReg.mats.push(vMats[0], vMats[1], vDark);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 1), vMats);
    v.position.set(b.x + b.hx - 0.4, 5.9, b.z + b.hz + 0.35);
    world1.add(v);
    const vPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), vDark);
    vPole.position.set(b.x + b.hx - 0.4, 4.6, b.z + b.hz - 0.1);
    world1.add(vPole);
    wi++;
  }
  // 斑馬線（中央十字路口四向）
  const cwMat = new THREE.MeshBasicMaterial({ color: 0x8f8f88 });
  for (let i = -2; i <= 2; i++) {
    for (const [px, pz, w, d2] of [[i * 1.15, 7.4, 0.55, 2.2], [i * 1.15, -7.4, 0.55, 2.2], [7.4, i * 1.15, 2.2, 0.55], [-7.4, i * 1.15, 2.2, 0.55]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d2), cwMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(px, 0.014, pz);
      world1.add(s);
    }
  }
  // 光池
  const poolTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, 'rgba(255,214,150,0.5)');
    rg.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  lightPool = (x, z, s2 = 6) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s2, s2), new THREE.MeshBasicMaterial({
      map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, z);
    world1.add(m);
  };
  // 布帳馬車（各據點廣場旁）
  const tentMats = [0x3a4a8a, 0x4a3a7a, 0x2e3a6e].map(c => new THREE.MeshLambertMaterial({ color: c }));
  const tentGlow = new THREE.MeshBasicMaterial({ color: 0xffa8d8 });
  ENV.tentGlows.push(tentGlow);
  const counterMat = new THREE.MeshLambertMaterial({ color: 0x3a3548 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x585868 });
  const tentSpots = [[-23, 23], [32, 13], [-32, -15], [23, -25], [-5, 18], [5, -18], [-18, -5], [18, 5], [-34, 25], [34, -26]];
  tentSpots.forEach(([tx, tz], i) => {
    const grp = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 1.5), counterMat);
    counter.position.y = 0.5;
    counter.castShadow = true;
    grp.add(counter);
    for (const [px, pz] of [[-1.5, -0.9], [1.5, -0.9], [-1.5, 0.9], [1.5, 0.9]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 5), poleMat);
      pole.position.set(px, 1.15, pz);
      grp.add(pole);
    }
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 1.35), tentMats[i % 3]);
    roofL.position.set(0, 2.42, -0.62); roofL.rotation.x = 0.42;
    const roofR = roofL.clone(); roofR.position.z = 0.62; roofR.rotation.x = -0.42;
    grp.add(roofL, roofR);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.1), tentGlow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 2.1;
    grp.add(glow);
    grp.position.set(tx, 0, tz);
    grp.rotation.y = Math.random() * 6.28;
    world1.add(grp);
  });
})();

// ---------- 遠景：外環大樓＋南山塔（world1） ----------
(function buildBackdrop() {
  const mats = [46, 190, 285].map(h => new THREE.MeshBasicMaterial({ map: makeWindowTex(h) }));
  let i = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.16) {
    const r = 62 + Math.random() * 14;
    const w = 7 + Math.random() * 9;
    const h = 14 + Math.random() * 28;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mats[i++ % 3]);
    b.position.set(bx, h / 2 - 0.5, bz);
    b.rotation.y = Math.random() * Math.PI;
    world1.add(b);
    if (Math.random() < 0.4) {   // 頂部退縮層：打破方塊剪影
      const t2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, h * 0.22, w * 0.55), mats[i % 3]);
      t2.position.set(bx, h + h * 0.11 - 0.5, bz);
      t2.rotation.y = b.rotation.y;
      world1.add(t2);
    }
    if (Math.random() < 0.35) {  // 天線尖塔
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 5 + Math.random() * 4, 4), new THREE.MeshBasicMaterial({ color: 0x1a1630 }));
      sp.position.set(bx, h + 3, bz);
      world1.add(sp);
    }
  }
  const hill = new THREE.Mesh(new THREE.ConeGeometry(30, 16, 6), new THREE.MeshBasicMaterial({ color: 0x0c0a18, fog: false }));
  hill.position.set(42, 7, -78);
  world1.add(hill);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 20, 8), new THREE.MeshBasicMaterial({ color: 0x262040, fog: false }));
  tower.position.set(42, 25, -78);
  world1.add(tower);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.2, 2.2, 10), new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }));
  deck.position.set(42, 36, -78);
  world1.add(deck);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a3a, fog: false }));
  beacon.position.set(42, 44, -78);
  world1.add(beacon);
})();

// ---------- 魂界（第二關場景：黑曜岩裂谷） ----------// ---------- 魂界（第二關：黑曜荒原，開放版） ----------
let skyTex2 = null;
const w2anim = { flames: [], rocks: [] };
(function buildNetherField() {
  // 暮金天空＋巨大金月＋雲帶剪影＋疏星
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#2c2050');
  grad.addColorStop(0.4, '#7a4470');
  grad.addColorStop(0.72, '#d87858');
  grad.addColorStop(1, '#ffd98a');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
  const mx = 700, my = 150;
  const mg = g.createRadialGradient(mx, my, 8, mx, my, 110);
  mg.addColorStop(0, 'rgba(255,236,180,1)');
  mg.addColorStop(0.35, 'rgba(255,210,120,0.9)');
  mg.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = mg;
  g.beginPath(); g.arc(mx, my, 110, 0, 6.28); g.fill();
  g.fillStyle = '#fff2cc';
  g.beginPath(); g.arc(mx, my, 52, 0, 6.28); g.fill();
  g.fillStyle = 'rgba(230,190,120,0.5)';
  g.beginPath(); g.arc(mx - 14, my - 10, 9, 0, 6.28); g.fill();
  g.beginPath(); g.arc(mx + 16, my + 14, 6, 0, 6.28); g.fill();
  for (let band = 0; band < 4; band++) {
    g.beginPath();
    const baseY = 180 + band * 60;
    for (let x = 0; x <= 1024; x += 16) {
      const y = baseY + Math.sin(x / 70 + band * 2.4) * 16 + Math.sin(x / 31 + band) * 7;
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.strokeStyle = ['rgba(90,50,90,0.4)', 'rgba(150,70,90,0.35)', 'rgba(220,120,90,0.3)', 'rgba(255,180,110,0.28)'][band];
    g.lineWidth = 20 - band * 3;
    g.stroke();
  }
  g.fillStyle = '#fff';
  for (let i = 0; i < 90; i++) {
    g.globalAlpha = 0.25 + Math.random() * 0.5;
    g.fillRect(Math.random() * 1024, Math.random() * 170, 1, 1);
  }
  g.globalAlpha = 1;
  skyTex2 = new THREE.CanvasTexture(c);
  skyTex2.colorSpace = THREE.SRGBColorSpace;

  // 地面：暖土草地＋彼岸花紅點
  const gc = document.createElement('canvas');
  gc.width = gc.height = 512;
  const gg = gc.getContext('2d');
  gg.fillStyle = '#4c4034'; gg.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 700; i++) {
    gg.fillStyle = `rgba(${70 + Math.random() * 40},${60 + Math.random() * 35},${35 + Math.random() * 25},${0.25 + Math.random() * 0.3})`;
    gg.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 5, 2 + Math.random() * 4);
  }
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    gg.fillStyle = 'rgba(40,80,40,0.6)';
    gg.fillRect(x, y + 2, 1.5, 4);
    gg.fillStyle = `rgba(${215 + Math.random() * 40},${30 + Math.random() * 40},${50 + Math.random() * 40},0.95)`;
    gg.beginPath(); gg.arc(x, y, 1.6 + Math.random() * 1.8, 0, 6.28); gg.fill();
  }
  const groundTex = new THREE.CanvasTexture(gc);
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(9, 9);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  const g2 = new THREE.Mesh(new THREE.PlaneGeometry(104, 104), new THREE.MeshLambertMaterial({ map: groundTex }));
  g2.rotation.x = -Math.PI / 2;
  g2.position.y = 0.01;
  g2.receiveShadow = true;
  world2.add(g2);

  // 樹叢群落：冥界紅葉巨木（枯幹＋紅花樹冠）＋石燈籠
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3226 });
  const canopyCols = [0xc03048, 0xd84860, 0xa82840];
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a8078 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd890 });
  const OBS2 = OBSTACLES_BY_STAGE[1], REG2 = blockersRegBy[1];
  for (const b of OBS2) {
    const tm = trunkMat.clone();
    const cm = new THREE.MeshLambertMaterial({ color: canopyCols[Math.floor(Math.random() * 3)] });
    REG2[OBS2.indexOf(b)].mats.push(tm, cm);
    for (let i = 0; i < 2; i++) {
      const th = 5 + Math.random() * 3;
      const px2 = b.x + (Math.random() * 2 - 1) * (b.hx - 1.2), pz2 = b.z + (Math.random() * 2 - 1) * (b.hz - 1.2);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 + Math.random() * 0.3, 0.9 + Math.random() * 0.4, th, 7), tm);
      trunk.position.set(px2, th / 2, pz2);
      trunk.rotation.z = (Math.random() - 0.5) * 0.15;
      trunk.castShadow = true;
      world2.add(trunk);
      for (let j = 0; j < 3; j++) {
        const cs = 2 + Math.random() * 1.8;
        const can = new THREE.Mesh(new THREE.SphereGeometry(cs, 8, 6), cm);
        can.position.set(px2 + (Math.random() * 2 - 1) * 1.8, th + (Math.random() - 0.2) * 1.6, pz2 + (Math.random() * 2 - 1) * 1.8);
        can.scale.y = 0.75;
        can.castShadow = true;
        world2.add(can);
      }
    }
    const pill = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), stoneMat);
    pill.position.set(b.x + b.hx + 1.2, 0.8, b.z);
    world2.add(pill);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.5, 4), stoneMat);
    cap.position.set(b.x + b.hx + 1.2, 1.95, b.z);
    world2.add(cap);
    const lampCube = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), lampGlowMat);
    lampCube.position.set(b.x + b.hx + 1.2, 1.62, b.z);
    world2.add(lampCube);
  }
  // 立體彼岸花叢
  const flowerMat = new THREE.MeshBasicMaterial({ color: 0xe83a52 });
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x3a6a3a });
  for (let i = 0; i < 40; i++) {
    const fcx = (Math.random() * 2 - 1) * 42, fcz = (Math.random() * 2 - 1) * 42;
    for (let j = 0; j < 3; j++) {
      const fh = 0.5 + Math.random() * 0.4;
      const fx2 = fcx + (Math.random() * 2 - 1) * 0.9, fz2 = fcz + (Math.random() * 2 - 1) * 0.9;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, fh, 4), stemMat);
      stem.position.set(fx2, fh / 2, fz2);
      world2.add(stem);
      const bloom = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 6), flowerMat);
      bloom.rotation.x = Math.PI;
      bloom.position.set(fx2, fh + 0.08, fz2);
      world2.add(bloom);
    }
  }
  // 魂燈光斑（地表金色暖光）
  const warmTex = (() => {
    const lc = document.createElement('canvas');
    lc.width = lc.height = 128;
    const lg = lc.getContext('2d');
    const rg = lg.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, 'rgba(255,214,150,0.6)');
    rg.addColorStop(0.5, 'rgba(255,180,100,0.25)');
    rg.addColorStop(1, 'rgba(255,160,80,0)');
    lg.fillStyle = rg; lg.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(lc);
  })();
  for (let i = 0; i < 12; i++) {
    const s = 3 + Math.random() * 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({
      map: warmTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45 + Math.random() * 0.25,
    }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6.28;
    m.position.set((Math.random() * 2 - 1) * 40, 0.03, (Math.random() * 2 - 1) * 40);
    world2.add(m);
  }
  // 飄浮花瓣（粉紅薄片，隨風緩浮）
  const petalMat = new THREE.MeshBasicMaterial({ color: 0xff9ab8 });
  for (let i = 0; i < 18; i++) {
    const petal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), petalMat);
    petal.scale.set(1, 0.28, 0.7);
    petal.position.set((Math.random() * 2 - 1) * 42, 2.5 + Math.random() * 9, (Math.random() * 2 - 1) * 42);
    petal.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    world2.add(petal);
    w2anim.rocks.push({ m: petal, phase: Math.random() * 6.28, speed: 0.5 + Math.random() * 0.6 });
  }
  const flameTex = (() => {
    const fc = document.createElement('canvas');
    fc.width = fc.height = 64;
    const fg = fc.getContext('2d');
    const rg = fg.createRadialGradient(32, 32, 2, 32, 32, 30);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.35, 'rgba(255,190,140,0.9)');
    rg.addColorStop(1, 'rgba(255,90,40,0)');
    fg.fillStyle = rg; fg.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(fc);
  })();
  for (let i = 0; i < 40; i++) {
    // 漂浮魂燈火（金色為主、偶有青色魂火）
    const f = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flameTex, color: Math.random() < 0.75 ? 0xffd890 : 0x9ad8ff,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
    }));
    f.position.set((Math.random() * 2 - 1) * 44, 1 + Math.random() * 4, (Math.random() * 2 - 1) * 44);
    f.scale.setScalar(0.5 + Math.random() * 0.7);
    world2.add(f);
    w2anim.flames.push({ m: f, phase: Math.random() * 6.28, base: f.position.y, sz: f.scale.x });
  }
  for (let a = 0; a < Math.PI * 2; a += 0.22) {
    const h = 22 + Math.random() * 30;
    const r = 60 + Math.random() * 12;
    const mtn = new THREE.Mesh(
      new THREE.ConeGeometry(10 + Math.random() * 12, h, 6),
      new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0x3a2a50 : 0x4a3560, fog: false })
    );
    mtn.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
    world2.add(mtn);
  }
})();

// ---------- 天界（第三關場景：雲海聖域） ----------// ---------- 天界（第三關：雲海聖域，開放版） ----------
let skyTex3 = null;
const w3anim = { clouds: [], lanterns: [], shafts: [] };
(function buildHeaven() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#060a1e');
  grad.addColorStop(0.5, '#0e1e42');
  grad.addColorStop(0.85, '#1e4468');
  grad.addColorStop(1, '#2e6a88');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
  for (let band = 0; band < 3; band++) {
    g.beginPath();
    const baseY = 90 + band * 55;
    for (let x = 0; x <= 1024; x += 16) {
      const y = baseY + Math.sin(x / 90 + band * 2.2) * 34 + Math.sin(x / 41 + band) * 12;
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.strokeStyle = ['rgba(90,255,190,0.3)', 'rgba(120,200,255,0.26)', 'rgba(200,140,255,0.22)'][band];
    g.lineWidth = 26 - band * 5;
    g.shadowColor = ['#5affbe', '#78c8ff', '#c88cff'][band];
    g.shadowBlur = 24;
    g.stroke();
  }
  g.shadowBlur = 0;
  for (let i = 0; i < 240; i++) {
    const y = Math.random() * 360;
    g.globalAlpha = 0.3 + Math.random() * 0.7;
    g.fillStyle = '#ffffff';
    g.fillRect(Math.random() * 1024, y, Math.random() < 0.06 ? 2 : 1, 1);
  }
  g.globalAlpha = 1;
  skyTex3 = new THREE.CanvasTexture(c);
  skyTex3.colorSpace = THREE.SRGBColorSpace;

  const gc = document.createElement('canvas');
  gc.width = gc.height = 256;
  const gg = gc.getContext('2d');
  gg.fillStyle = '#8ea6c2'; gg.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) {
    for (let x = 0; x < 256; x += 64) {
      gg.fillStyle = (x + y) % 128 === 0 ? '#849cba' : '#98b0ca';
      gg.fillRect(x + 2, y + 2, 60, 60);
    }
  }
  gg.strokeStyle = 'rgba(120,200,255,0.85)'; gg.lineWidth = 3;
  gg.shadowColor = '#78c8ff'; gg.shadowBlur = 8;
  for (let i = 0; i <= 256; i += 64) {
    gg.beginPath(); gg.moveTo(i, 0); gg.lineTo(i, 256); gg.stroke();
    gg.beginPath(); gg.moveTo(0, i); gg.lineTo(256, i); gg.stroke();
  }
  const pathTex = new THREE.CanvasTexture(gc);
  pathTex.wrapS = pathTex.wrapT = THREE.RepeatWrapping;
  pathTex.repeat.set(15, 15);
  pathTex.colorSpace = THREE.SRGBColorSpace;
  const plat = new THREE.Mesh(new THREE.PlaneGeometry(104, 104), new THREE.MeshLambertMaterial({ map: pathTex }));
  plat.rotation.x = -Math.PI / 2;
  plat.position.y = 0.01;
  plat.receiveShadow = true;
  world3.add(plat);
  for (const [px, pz, w, d] of [[0, 48, 104, 0.5], [0, -48, 104, 0.5], [48, 0, 0.5, 104], [-48, 0, 0.5, 104]]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), new THREE.MeshBasicMaterial({ color: 0xffd070 }));
    edge.position.set(px, 0.15, pz);
    world3.add(edge);
  }
  const pillarMat3 = new THREE.MeshLambertMaterial({ color: 0xaebfd8 });
  const capMat = new THREE.MeshBasicMaterial({ color: 0xffd070 });
  const crystalMat3 = new THREE.MeshBasicMaterial({ color: 0x6ae0ff });
  const OBS3 = OBSTACLES_BY_STAGE[2], REG3 = blockersRegBy[2];
  for (const b of OBS3) {
    const pm = pillarMat3.clone();
    REG3[OBS3.indexOf(b)].mats.push(pm);
    for (const [cx, cz] of [[-b.hx + 1.2, -b.hz + 1.2], [b.hx - 1.2, -b.hz + 1.2], [-b.hx + 1.2, b.hz - 1.2], [b.hx - 1.2, b.hz - 1.2]]) {
      const h = 7 + Math.random() * 3;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, h, 10), pm);
      col.position.set(b.x + cx, h / 2, b.z + cz);
      col.castShadow = true;
      world3.add(col);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), capMat);
      cap.position.set(b.x + cx, h + 0.4, b.z + cz);
      world3.add(cap);
    }
    const ch = 4 + Math.random() * 3;
    const cr = new THREE.Mesh(new THREE.ConeGeometry(1, ch, 5), crystalMat3);
    cr.position.set(b.x, ch / 2 + 0.3, b.z);
    world3.add(cr);
  }
  const cloudTex = (() => {
    const cc = document.createElement('canvas');
    cc.width = cc.height = 128;
    const cg = cc.getContext('2d');
    const rg = cg.createRadialGradient(64, 64, 6, 64, 64, 62);
    rg.addColorStop(0, 'rgba(235,242,255,0.9)');
    rg.addColorStop(0.7, 'rgba(210,226,248,0.45)');
    rg.addColorStop(1, 'rgba(200,220,245,0)');
    cg.fillStyle = rg; cg.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cc);
  })();
  for (let i = 0; i < 56; i++) {
    const cl = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.5, depthWrite: false, color: 0xb8cce4,
    }));
    const a = Math.random() * 6.28;
    const r = 52 + Math.random() * 20;
    cl.position.set(Math.cos(a) * r, -1 + Math.random() * 2, Math.sin(a) * r);
    const sz = 8 + Math.random() * 14;
    cl.scale.set(sz, sz * 0.42, 1);
    world3.add(cl);
    w3anim.clouds.push({ m: cl, phase: Math.random() * 6.28, x0: cl.position.x });
  }
  for (let i = 0; i < 30; i++) {
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
    lan.position.set((Math.random() * 2 - 1) * 42, 2.5 + Math.random() * 4, (Math.random() * 2 - 1) * 42);
    world3.add(lan);
    w3anim.lanterns.push({ m: lan, phase: Math.random() * 6.28, base: lan.position.y });
  }
  // 天門（金色鳥居式拱門，戰場邊緣三方）
  const goldMat = new THREE.MeshLambertMaterial({ color: 0xd8b060, emissive: 0x453310 });
  const goldCap = new THREE.MeshBasicMaterial({ color: 0xffd070 });
  for (const [ax, az, ry] of [[0, -44, 0], [-44, 4, Math.PI / 2], [44, 4, Math.PI / 2]]) {
    const gate = new THREE.Group();
    for (const px of [-3.4, 3.4]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 9.5, 10), goldMat);
      col.position.set(px, 4.75, 0);
      col.castShadow = true;
      gate.add(col);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.65, 1.1), goldMat);
    beam.position.y = 9.4;
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.45, 0.9), goldMat);
    beam2.position.y = 8.3;
    gate.add(beam, beam2);
    for (const px of [-4.5, 4.5]) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), goldCap);
      tip.position.set(px, 9.65, 0);
      gate.add(tip);
    }
    gate.position.set(ax, 0, az);
    gate.rotation.y = ry;
    world3.add(gate);
  }
  // 天光光柱（雲隙灑落）
  for (let i = 0; i < 6; i++) {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4 + Math.random(), 2.2 + Math.random(), 24, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    shaft.position.set((Math.random() * 2 - 1) * 38, 12, (Math.random() * 2 - 1) * 38);
    world3.add(shaft);
    w3anim.shafts.push({ m: shaft, phase: Math.random() * 6.28 });
  }
  for (let i = 0; i < 12; i++) {
    const w = 10 + Math.random() * 16;
    const a = (i / 12) * 6.28;
    const isle = new THREE.Mesh(new THREE.ConeGeometry(w, w * 0.9, 6), new THREE.MeshLambertMaterial({ color: 0x8aa8cc }));
    isle.rotation.x = Math.PI;
    isle.position.set(Math.cos(a) * (66 + Math.random() * 12), 14 + Math.random() * 16, Math.sin(a) * (66 + Math.random() * 12));
    world3.add(isle);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.9, w, 2.2, 6), new THREE.MeshLambertMaterial({ color: 0xd8e6f4 }));
    top.position.set(isle.position.x, isle.position.y + w * 0.45 + 1, isle.position.z);
    world3.add(top);
  }
})();

// ---------- 虛空（第四關：魂門之心） ----------
let skyTex4 = null;
const w4anim = { shards: [], rings: [] };
(function buildVoid() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#020208');
  grad.addColorStop(0.6, '#0a0620');
  grad.addColorStop(1, '#1a0e38');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 24; i++) {   // 星雲
    const x = Math.random() * 1024, y = Math.random() * 420;
    const cyan = Math.random() < 0.5;
    const rg = g.createRadialGradient(x, y, 4, x, y, 50 + Math.random() * 80);
    rg.addColorStop(0, cyan ? 'rgba(60,220,255,0.14)' : 'rgba(210,70,255,0.13)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, 130, 0, 6.28); g.fill();
  }
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 520; i++) {
    g.globalAlpha = 0.25 + Math.random() * 0.75;
    g.fillRect(Math.random() * 1024, Math.random() * 512, Math.random() < 0.05 ? 2 : 1, 1);
  }
  g.globalAlpha = 1;
  skyTex4 = new THREE.CanvasTexture(c);
  skyTex4.colorSpace = THREE.SRGBColorSpace;

  const gc = document.createElement('canvas');
  gc.width = gc.height = 512;
  const gg = gc.getContext('2d');
  gg.fillStyle = '#05040c'; gg.fillRect(0, 0, 512, 512);
  gg.strokeStyle = 'rgba(70,200,255,0.22)'; gg.lineWidth = 1.5;
  gg.shadowColor = '#40c8ff'; gg.shadowBlur = 5;
  for (let i = 0; i <= 512; i += 64) {
    gg.beginPath(); gg.moveTo(i, 0); gg.lineTo(i, 512); gg.stroke();
    gg.beginPath(); gg.moveTo(0, i); gg.lineTo(512, i); gg.stroke();
  }
  gg.shadowBlur = 0;
  gg.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 200; i++) gg.fillRect(Math.random() * 512, Math.random() * 512, 1, 1);
  const voidTex = new THREE.CanvasTexture(gc);
  voidTex.wrapS = voidTex.wrapT = THREE.RepeatWrapping;
  voidTex.repeat.set(6, 6);
  voidTex.colorSpace = THREE.SRGBColorSpace;
  const vg = new THREE.Mesh(new THREE.PlaneGeometry(104, 104), new THREE.MeshStandardMaterial({ map: voidTex, roughness: 0.25, metalness: 0.7 }));
  vg.rotation.x = -Math.PI / 2;
  vg.position.y = 0.01;
  vg.receiveShadow = true;
  world4.add(vg);
  groundMats.push(vg.material);

  const darkMat = new THREE.MeshLambertMaterial({ color: 0x0e0a1e });
  const cyanMat = new THREE.MeshBasicMaterial({ color: 0x30e0ff });
  const magMat = new THREE.MeshBasicMaterial({ color: 0xd040ff });
  const OBS4 = OBSTACLES_BY_STAGE[3], REG4 = blockersRegBy[3];
  for (const b of OBS4) {
    const dm = darkMat.clone();
    REG4[OBS4.indexOf(b)].mats.push(dm);
    for (let i = 0; i < 3; i++) {
      const h = 9 + Math.random() * 12;
      const mono = new THREE.Mesh(new THREE.ConeGeometry(3 + Math.random() * 2.5, h, 4), dm);
      mono.position.set(b.x + (Math.random() * 2 - 1) * 5, h / 2, b.z + (Math.random() * 2 - 1) * 5);
      mono.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI, (Math.random() - 0.5) * 0.2);
      mono.scale.set(0.8 + Math.random() * 0.4, 1, 0.8 + Math.random() * 0.4);
      mono.castShadow = true;
      world4.add(mono);
      const edge = new THREE.Mesh(new THREE.ConeGeometry(0.5, h * 0.7, 4), Math.random() < 0.5 ? cyanMat : magMat);
      edge.position.set(mono.position.x, h * 0.4, mono.position.z);
      world4.add(edge);
    }
  }
  for (let i = 0; i < 26; i++) {
    const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.7 + Math.random() * 1.4, 0), Math.random() < 0.5 ? cyanMat : magMat);
    sh.position.set((Math.random() * 2 - 1) * 42, 3 + Math.random() * 12, (Math.random() * 2 - 1) * 42);
    world4.add(sh);
    w4anim.shards.push({ m: sh, phase: Math.random() * 6.28, base: sh.position.y });
  }
  for (let a = 0; a < Math.PI * 2; a += 0.28) {
    const h = 24 + Math.random() * 26;
    const r = 58 + Math.random() * 12;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(6 + Math.random() * 6, h, 4), darkMat);
    spike.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
    spike.rotation.z = (Math.random() - 0.5) * 0.15;
    world4.add(spike);
  }
  // 戰場上空的能量巨環（緩慢旋轉）
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(15 + i * 10, 0.16, 8, 72),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xd040ff : 0x30e0ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.position.set(0, 20 + i * 8, 0);
    ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    world4.add(ring);
    w4anim.rings.push({ m: ring, sp: (0.06 + 0.05 * i) * (i % 2 ? -1 : 1) });
  }
  // 地表水晶簇
  for (let i = 0; i < 12; i++) {
    const cx = (Math.random() * 2 - 1) * 40, cz = (Math.random() * 2 - 1) * 40;
    for (let j = 0; j < 3; j++) {
      const ch = 0.6 + Math.random() * 1.6;
      const cr = new THREE.Mesh(new THREE.ConeGeometry(0.22 + Math.random() * 0.2, ch, 5), Math.random() < 0.5 ? cyanMat : magMat);
      cr.position.set(cx + (Math.random() * 2 - 1) * 1.3, ch / 2, cz + (Math.random() * 2 - 1) * 1.3);
      cr.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
      world4.add(cr);
    }
  }
})();

// ---------- 據點制壓法陣 ----------
const capturePoint = (() => {
  const grp = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.7, 4.05, 48),
    new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 48),
    new THREE.MeshBasicMaterial({ color: 0x2a90c0, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.01;
  grp.add(ring, disc);
  grp.position.y = 0.08;
  grp.visible = false;
  scene.add(grp);
  return grp;
})();

// ---------- 魂門巨環（關卡終點） ----------
const honmoon = new THREE.Group();
(function buildHonmoon() {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(10, 0.55, 12, 64),
    new THREE.MeshBasicMaterial({ color: 0xa04fff, fog: false })
  );
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(8, 0.2, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xff4fa3, fog: false })
  );
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(9.6, 48),
    new THREE.MeshBasicMaterial({ color: 0x30104f, transparent: true, opacity: 0.6, side: THREE.DoubleSide, fog: false })
  );
  // 旋渦漩流
  const sc = document.createElement('canvas');
  sc.width = sc.height = 256;
  const sg = sc.getContext('2d');
  sg.translate(128, 128);
  for (let arm = 0; arm < 3; arm++) {
    sg.rotate((Math.PI * 2) / 3);
    sg.beginPath();
    for (let t = 0; t < 6; t += 0.08) {
      const r = 6 + t * 19;
      sg.lineTo(Math.cos(t) * r, Math.sin(t) * r);
    }
    sg.strokeStyle = arm === 0 ? 'rgba(255,120,220,0.9)' : 'rgba(190,110,255,0.7)';
    sg.lineWidth = 10 - arm * 2;
    sg.shadowColor = '#ff5fd0'; sg.shadowBlur = 12;
    sg.stroke();
  }
  const swirlTex = new THREE.CanvasTexture(sc);
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(8.8, 48),
    new THREE.MeshBasicMaterial({ map: swirlTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  swirl.position.z = 0.1;
  honmoon.add(ring, ring2, disc, swirl);
  honmoon.userData.swirl = swirl;
  honmoon.position.set(0, 14, -64);
  scene.add(honmoon);
})();

// ---------- 區界拱門＋光牆 ----------// ---------- （開放地圖：無區界關門） ----------
const barriers = [];

// ---------- 環境浮塵 ----------
const embers = (() => {
  const N = IS_MOBILE ? 350 : 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 46;
    pos[i * 3 + 1] = Math.random() * 9;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * 46;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xff7ad0, size: 0.17, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(pts);
  return { pts, pos, N };
})();

// ---------- 雨 ----------
const rain = (() => {
  const N = IS_MOBILE ? 700 : 1400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 30;
    pos[i * 3 + 1] = Math.random() * 14;
    pos[i * 3 + 2] = 10 - Math.random() * 70;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x9ab8ff, size: 0.07, transparent: true, opacity: 0.42, depthWrite: false,
  }));
  scene.add(pts);
  return { pts, pos, N };
})();

// ---------- 角色渲染工具 ----------
function makeOutlineMat(width = 0.028) {
  const m = new THREE.MeshBasicMaterial({ color: 0x0a0714, side: THREE.BackSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace(
      '#include <project_vertex>',
      `transformed += normal * ${width.toFixed(4)};\n#include <project_vertex>`
    );
  };
  m.customProgramCacheKey = () => 'outline' + width.toFixed(4);
  return m;
}
function addOutline(root, matsArr, width = 0.028) {
  const targets = [];
  root.traverse(o => {
    if (o.isMesh && o.visible && o.material?.name !== 'Glow' && !o.userData.isOutline) targets.push(o);
  });
  const mat = makeOutlineMat(width);
  if (matsArr) matsArr.push(mat);
  for (const m of targets) {
    const oc = m.clone(false);
    oc.material = mat;
    oc.castShadow = false;
    oc.receiveShadow = false;
    oc.userData.isOutline = true;
    oc.raycast = () => {};
    m.parent.add(oc);
  }
}

const gradTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
// 主角專用四階漸層（暗部/中間調/亮部層次更細）
const gradTex4 = (() => {
  const t = new THREE.DataTexture(new Uint8Array([60, 128, 210, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
function toonify(root, grad = gradTex) {
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const conv = m => {
      if (m.name === 'Glow') return new THREE.MeshBasicMaterial({ color: 0xff3a6a, name: 'Glow' });
      return new THREE.MeshToonMaterial({ map: m.map || null, color: m.color.clone(), gradientMap: grad, name: m.name });
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}
const blobTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  rg.addColorStop(0, 'rgba(0,0,0,0.55)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
function makeBlobShadow(r) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2, r * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.5 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  scene.add(m);
  return m;
}
const sparkTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.35, 'rgba(220,180,255,0.9)');
  rg.addColorStop(1, 'rgba(160,79,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
// 新月形劍氣貼圖（外層彩光＋內層白熱核心）
const crescentTex = (() => {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const moon = (r1, y1, r2, y2, color, blur) => {
    g.save();
    g.shadowColor = color; g.shadowBlur = blur;
    g.fillStyle = color;
    g.beginPath(); g.arc(64, y1, r1, 0, 6.29); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.shadowBlur = 0;
    g.fillStyle = '#000';
    g.beginPath(); g.arc(64, y2, r2, 0, 6.29); g.fill();
    g.restore();
    g.globalCompositeOperation = 'source-over';
  };
  moon(46, 72, 52, 96, 'rgba(150,220,255,0.9)', 18);
  moon(38, 68, 46, 94, 'rgba(255,255,255,0.95)', 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const sparks = [];
function spawnSpark(pos, scale = 1, color = 0xffffff, opts = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sparkTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.position.copy(pos);
  s.scale.setScalar(0.4 * scale);
  s.userData = { t: 0, dur: opts.dur || 0.22, scale, rise: opts.rise || 0 };
  scene.add(s);
  sparks.push(s);
}
const pillars = [];
function spawnPillar(x, z, color = 0xffd84f, big = 1) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9 * big, 1.5 * big, 16, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  m.position.set(x, 8, z);
  m.userData = { t: 0, dur: 0.55 * big };
  scene.add(m);
  pillars.push(m);
}
let screenFlash = 0;
const flashEl = document.getElementById('flash');
const shockwaves = [];
function spawnShockwave(x, z, { maxR = 4, dur = 0.35, color = 0xc9a4ff } = {}) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.06, z);
  m.userData = { t: 0, dur, maxR };
  scene.add(m);
  shockwaves.push(m);
}
function makeFanGeo(inner, outer, ang, segs = 24) {
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = -ang / 2 + (i / segs) * ang;
    pos.push(Math.sin(a) * inner, 0, Math.cos(a) * inner);
    pos.push(Math.sin(a) * outer, 0, Math.cos(a) * outer);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}
const slashes = [];
function spawnSlash(x, z, yaw, { ang = 2.4, outer = 2.9, dur = 0.18, color = 0xc9a4ff, dir = 1 }) {
  const mk = (inner, out, col, op, spinMul, tilt) => {
    const m = new THREE.Mesh(makeFanGeo(inner, out, ang), new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: op, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.position.set(x, 1.15, z);
    m.rotation.y = yaw;
    m.rotation.x = tilt;
    m.userData = { t: 0, dur, dir: dir * spinMul };
    scene.add(m);
    slashes.push(m);
  };
  mk(0.7, outer, color, 0.7, 1, 0);               // 外圈色彩
  mk(0.9, outer * 0.82, 0xffffff, 0.9, 1.35, 0);  // 白熱核心（轉更快）
  mk(0.7, outer * 1.05, color, 0.35, 0.7, 0.18);  // 殘影層（微傾斜）
}
const drops = [];
function spawnDrop(x, z) {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.32),
    new THREE.MeshBasicMaterial({ color: 0xff4fa3 })
  );
  m.position.set(x, 0.8, z);
  m.userData = { t: Math.random() * 6.28 };
  scene.add(m);
  drops.push(m);
}

// 動畫 rig
function makeRig(root, clips, names) {
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const n of names) {
    const c = THREE.AnimationClip.findByName(clips, n);
    if (c) actions[n] = mixer.clipAction(c);
  }
  return { mixer, actions, current: null, clips };
}
function play(rig, name, { once = false, ts = 1, fade = 0.12 } = {}) {
  const next = rig.actions[name];
  if (!next) return null;
  if (rig.current === next && !once) return next;
  next.reset();
  next.setEffectiveTimeScale(ts);
  next.setEffectiveWeight(1);
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  next.clampWhenFinished = once;
  if (rig.current && rig.current !== next) next.crossFadeFrom(rig.current, fade, false);
  next.play();
  rig.current = next;
  return next;
}
function clipDur(rig, name, ts) {
  const c = THREE.AnimationClip.findByName(rig.clips, name);
  return c ? c.duration / ts : 0.5;
}
function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------- 主角武器與劍光：三人武器造型不同＋揮劍軌跡帶 ----------
// 程序生成武器（Mira 大劍／Zoey 短刃），len 為手部骨骼局部單位的刃長
function buildWeaponMesh(char, len) {
  const grp = new THREE.Group();
  const isGreat = char.weapon === 'great';
  const w = len * (isGreat ? 0.16 : 0.07);
  const th = len * (isGreat ? 0.035 : 0.022);
  const bladeLen = len * 0.78;
  const y0 = len * 0.2;
  const steel = new THREE.MeshToonMaterial({ color: isGreat ? 0x9ab0cc : 0xe8d8a0, gradientMap: gradTex4 });
  const dark = new THREE.MeshToonMaterial({ color: 0x2a2438, gradientMap: gradTex4 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(w, bladeLen, th), steel);
  blade.position.y = y0 + bladeLen / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, len * 0.14, 4), steel);
  tip.position.y = y0 + bladeLen + len * 0.07;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(w * (isGreat ? 1.8 : 2.4), len * 0.035, th * 2.2), dark);
  guard.position.y = y0;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.22, w * 0.25, len * 0.2, 6), dark);
  grip.position.y = y0 - len * 0.1;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.2, bladeLen + len * 0.16), new THREE.MeshBasicMaterial({
    color: char.fx, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  glow.position.y = y0 + bladeLen / 2 + len * 0.04;
  for (const m of [blade, tip, guard, grip]) m.castShadow = true;
  grp.add(blade, tip, guard, grip, glow);
  return grp;
}
// 長髮（獵魔女團風）：掛頭部骨骼的程序生成髮型——Rumi 長辮／Mira 長直髮／Zoey 雙馬尾
function setupHair(root, char, hScale) {
  const head = root.getObjectByName('mixamorigHead');
  if (!head) return;
  root.updateMatrixWorld(true);
  const headW = head.getWorldPosition(new THREE.Vector3());
  const bbox = new THREE.Box3().setFromObject(root);
  const u = Math.max(0.02, bbox.max.y - headW.y) / hScale;   // 頭部高度＝比例尺（頭骨局部單位）
  const dirL = v => head.worldToLocal(headW.clone().add(v)).normalize();
  const upL = dirL(new THREE.Vector3(0, 1, 0));
  const backL = dirL(new THREE.Vector3(0, 0, -1));
  const rightL = dirL(new THREE.Vector3(1, 0, 0));
  const grp = new THREE.Group();
  head.add(grp);
  const hairMat = new THREE.MeshToonMaterial({ color: char.hair, gradientMap: gradTex4 });
  const tieMat = new THREE.MeshBasicMaterial({ color: 0xffd070 });
  const P = (a, b, c) => new THREE.Vector3()
    .addScaledVector(upL, a * u).addScaledVector(backL, b * u).addScaledVector(rightL, c * u);
  const ball = (pos, r, mat = hairMat) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
    m.position.copy(pos);
    m.castShadow = true;
    grp.add(m);
    return m;
  };
  // 後腦杓髮量
  ball(P(0.55, 0.35, 0), 0.52 * u);
  ball(P(0.15, 0.5, 0), 0.46 * u);
  // 髮鏈：由粗到細的珠鏈沿弧線垂下，髮根繫金色髮繩
  const chain = (sideC, len, n, r0) => {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = -0.2 - t * len;
      const b = 0.55 + Math.sin(t * 2.6) * 0.28;
      ball(P(a, b, sideC + Math.sin(t * 6 + sideC * 9) * 0.05), r0 * (1 - t * 0.55) * u);
    }
    ball(P(-0.2 - len * 0.1, 0.62, sideC), 0.15 * u, tieMat);
  };
  if (char.weapon === 'short') {          // Zoey：雙馬尾
    chain(0.45, 2.0, 7, 0.24);
    chain(-0.45, 2.0, 7, 0.24);
  } else if (char.weapon === 'great') {   // Mira：及腰長直髮（中股＋兩側）
    chain(0, 2.9, 9, 0.34);
    chain(0.3, 2.2, 7, 0.2);
    chain(-0.3, 2.2, 7, 0.2);
  } else {                                // Rumi：招牌長辮
    chain(0, 3.2, 10, 0.3);
  }
}
const trail = { pts: [], max: 16, mesh: null, mat: null, base: null, tip: null, color: new THREE.Color(0xc9a4ff) };
function setupSwordFx(root, char) {
  if (trail.mesh) { scene.remove(trail.mesh); trail.mesh.geometry.dispose(); trail.mat.dispose(); trail.mesh = null; }
  trail.pts = []; trail.base = null; trail.tip = null;
  const hand = root.getObjectByName('mixamorigRightHand');
  let sword = null;
  root.traverse(o => { if (o.isMesh && /sword/i.test(o.name) && !o.userData.isOutline) sword = o; });
  if (!hand || !sword) return;
  // 綁定姿勢下算出劍根/劍尖 → 右手骨骼局部座標
  root.updateMatrixWorld(true);
  sword.geometry.computeBoundingBox();
  const bb = sword.geometry.boundingBox, size = new THREE.Vector3();
  bb.getSize(size);
  const axis = size.x > size.y ? (size.x > size.z ? 'x' : 'z') : (size.y > size.z ? 'y' : 'z');
  const mk = v => { const o = new THREE.Object3D(); o.position.copy(hand.worldToLocal(v.clone())); hand.add(o); return o; };
  const mid = bb.getCenter(new THREE.Vector3());
  const endA = mid.clone(); endA[axis] = bb.min[axis];
  const endB = mid.clone(); endB[axis] = bb.max[axis];
  sword.localToWorld(endA); sword.localToWorld(endB);
  const handW = hand.getWorldPosition(new THREE.Vector3());
  const tipW = endA.distanceTo(handW) > endB.distanceTo(handW) ? endA : endB;
  const baseW = tipW === endA ? endB : endA;
  const nearL = hand.worldToLocal(baseW.clone());
  const tipL = hand.worldToLocal(tipW.clone());
  const dirL = tipL.clone().sub(nearL).normalize();
  const bladeLen = tipL.distanceTo(nearL);
  if (char.weapon === 'great' || char.weapon === 'short') {
    // 換裝程序生成武器：隱藏原劍（含描邊複製），大劍 1.3x／短刃 0.68x
    const swordGeo = sword.geometry;
    root.traverse(o => { if (o.isMesh && o.geometry === swordGeo) o.visible = false; });
    const k = char.weapon === 'great' ? 1.3 : 0.68;
    const wgrp = buildWeaponMesh(char, bladeLen * k);
    wgrp.position.copy(nearL);
    wgrp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirL);
    hand.add(wgrp);
    const mkL = v => { const o = new THREE.Object3D(); o.position.copy(v); hand.add(o); return o; };
    trail.base = mkL(nearL.clone().add(dirL.clone().multiplyScalar(bladeLen * k * 0.25)));
    trail.tip = mkL(nearL.clone().add(dirL.clone().multiplyScalar(bladeLen * k * 1.08)));
  } else {
    // Rumi：原長劍＋能量刃光（複製劍 mesh，法線外擴加法混色）
    const glowM = sword.clone(false);
    const gm = new THREE.MeshBasicMaterial({
      color: char.fx, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    });
    gm.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'transformed += normal * 0.012;\n#include <project_vertex>');
    };
    gm.customProgramCacheKey = () => 'swordglow';
    glowM.material = gm;
    glowM.userData.isOutline = true;
    glowM.raycast = () => {};
    sword.parent.add(glowM);
    trail.base = mk(baseW.clone().lerp(tipW, 0.2));
    trail.tip = mk(tipW.clone().lerp(baseW, -0.15));
  }
  // 軌跡帶 geometry（雙頂點帶狀、頂點色淡出）
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trail.max * 2 * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(trail.max * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < trail.max - 1; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  geo.setIndex(idx);
  trail.mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  trail.mesh = new THREE.Mesh(geo, trail.mat);
  trail.mesh.frustumCulled = false;
  trail.mesh.visible = false;
  scene.add(trail.mesh);
  trail.color.set(char.fx);
}
const _tv1 = new THREE.Vector3(), _tv2 = new THREE.Vector3();
function updateTrail() {
  if (!trail.mesh) return;
  const p = player;
  const swinging = (p.st === 'atk' || p.st === 'musou' || p.st === 'plunge') && p.root;
  if (swinging) {
    trail.base.getWorldPosition(_tv1);
    trail.tip.getWorldPosition(_tv2);
    trail.pts.push([_tv1.x, _tv1.y, _tv1.z, _tv2.x, _tv2.y, _tv2.z]);
  } else if (trail.pts.length) {
    trail.pts.shift();
    if (trail.pts.length) trail.pts.shift();
  }
  while (trail.pts.length > trail.max) trail.pts.shift();
  const n = trail.pts.length;
  if (n < 2) { trail.mesh.visible = false; return; }
  trail.mesh.visible = true;
  const posA = trail.mesh.geometry.attributes.position;
  const colA = trail.mesh.geometry.attributes.color;
  const last = trail.pts[n - 1];
  for (let i = 0; i < trail.max; i++) {
    const pt = i < n ? trail.pts[i] : last;
    posA.setXYZ(i * 2, pt[0], pt[1], pt[2]);
    posA.setXYZ(i * 2 + 1, pt[3], pt[4], pt[5]);
    const fade = i < n ? Math.pow(Math.max(0, 1 - (n - 1 - i) / trail.max), 2) : 0;
    colA.setXYZ(i * 2, trail.color.r * fade * 0.55, trail.color.g * fade * 0.55, trail.color.b * fade * 0.55);
    colA.setXYZ(i * 2 + 1, trail.color.r * fade, trail.color.g * fade, trail.color.b * fade);
  }
  posA.needsUpdate = true;
  colA.needsUpdate = true;
}
// 氣滿光環（無雙可發動時的腳下金環＋身體輝光）
const heroAura = (() => {
  const grp = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.1, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd84f, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sparkTex, color: 0xffd84f, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(2.6, 2.6, 1);
  glow.position.y = 1.1;
  grp.add(ring, glow);
  grp.visible = false;
  scene.add(grp);
  return grp;
})();

// ---------- 音訊（Web Audio 全合成：BGM＋SFX，無外部音檔） ----------
const AU = { ctx: null, master: null, music: null, sfx: null, noise: null, muted: false, timer: null, nextBar: 0, bar: 0 };
function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function initAudio() {
  if (AU.ctx) { AU.ctx.resume(); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  AU.ctx = ctx;
  AU.master = ctx.createGain(); AU.master.gain.value = 0.8; AU.master.connect(ctx.destination);
  AU.music = ctx.createGain(); AU.music.gain.value = 0.42; AU.music.connect(AU.master);
  AU.sfx = ctx.createGain(); AU.sfx.gain.value = 0.9; AU.sfx.connect(AU.master);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  AU.noise = nb;
  // 主旋律匯流排＋節奏延遲（空間感）
  AU.lead = ctx.createGain(); AU.lead.gain.value = 1;
  AU.lead.connect(AU.music);
  const dly = ctx.createDelay(1.5); dly.delayTime.value = 0.34;
  const fb = ctx.createGain(); fb.gain.value = 0.3;
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  AU.lead.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(AU.music);
  AU.nextBar = ctx.currentTime + 0.1;
  AU.timer = setInterval(scheduleMusic, 200);
}
const MUSIC = [
  { // 第一關：獵魔女團風主題戰歌（原創致敬向：主歌低音蓄力→副歌高音爆發，Am–F–C–G）
    bpm: 122,
    prog: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]],
    lead: [
      // 主歌：低音區切分蓄力
      [69, 0, 0.5], [69, 0.5, 0.25], [72, 0.75, 0.25], [74, 1, 0.75], [72, 1.75, 0.25], [74, 2, 0.5], [76, 2.5, 1.5],
      [65, 4, 0.5], [65, 4.5, 0.25], [69, 4.75, 0.25], [72, 5, 0.75], [69, 5.75, 0.25], [72, 6, 0.5], [74, 6.5, 1.5],
      // 副歌：戰歌高音爆發
      [81, 8, 0.75], [79, 8.75, 0.25], [81, 9, 0.5], [84, 9.5, 1], [81, 10.5, 0.5], [79, 11, 0.5], [76, 11.5, 0.5],
      [77, 12, 0.75], [76, 12.75, 0.25], [77, 13, 0.5], [79, 13.5, 0.75], [76, 14.25, 0.5], [74, 14.75, 0.25], [72, 15, 1],
    ],
    hat16: true,
  },
  { // 第二關：黃泉花海（C–G–Am–F，溫暖懷舊中版）
    bpm: 118,
    prog: [[48, 52, 55, 59], [55, 59, 62, 65], [57, 60, 64, 67], [53, 57, 60, 64]],
    lead: [
      [72, 0, 1], [76, 1, 0.5], [79, 1.5, 0.5], [81, 2, 1.5], [79, 3.5, 0.5],
      [76, 4, 1], [74, 5, 0.5], [76, 5.5, 0.5], [72, 6, 2],
      [69, 8, 1], [72, 9, 0.5], [76, 9.5, 0.5], [81, 10, 1], [84, 11, 1],
      [81, 12, 0.75], [79, 12.75, 0.25], [76, 13, 1], [74, 14, 0.5], [72, 14.5, 1.5],
    ],
    hat16: false,
  },
  { // 第四關：虛空終曲（Am–F–C–E，急速悲壯）——插在此註解前的陣列尾端由下方補上
    bpm: 140,
    prog: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [52, 56, 59, 64]],
    lead: [
      [81, 0, 0.5], [79, 0.5, 0.5], [81, 1, 0.5], [84, 1.5, 0.5], [81, 2, 1], [76, 3, 1],
      [77, 4, 0.5], [76, 4.75, 0.25], [77, 5, 0.5], [81, 5.5, 0.5], [79, 6, 2],
      [84, 8, 0.5], [83, 8.5, 0.5], [84, 9, 0.5], [88, 9.5, 0.5], [86, 10, 1], [81, 11, 1],
      [80, 12, 1], [81, 13, 0.5], [83, 13.5, 0.5], [84, 14, 2],
    ],
    hat16: true,
  },
  { // 第三關：天界頌歌（C–G–Am–F，明亮上揚）
    bpm: 132,
    prog: [[48, 52, 55, 59], [55, 59, 62, 65], [57, 60, 64, 67], [53, 57, 60, 64]],
    lead: [
      [84, 0, 0.5], [83, 0.5, 0.5], [79, 1, 1], [76, 2, 0.5], [79, 2.5, 0.5], [81, 3, 1],
      [79, 4, 0.75], [76, 4.75, 0.25], [74, 5, 1], [76, 6, 0.5], [79, 6.5, 0.5], [81, 7, 1],
      [84, 8, 0.5], [86, 8.5, 0.5], [88, 9, 1.5], [84, 10.5, 0.5], [83, 11, 1],
      [81, 12, 0.75], [79, 12.75, 0.25], [76, 13, 1], [74, 14, 0.5], [72, 14.5, 1.5],
    ],
    hat16: true,
  },
];
function tone(type, freq, t, dur, gain, dest, freqEnd) {
  const o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}
function noiseHit(t, dur, gain, filterType, freq, dest, q = 1) {
  const src = AU.ctx.createBufferSource(); src.buffer = AU.noise;
  const f = AU.ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = AU.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t); src.stop(t + dur + 0.05);
}
function scheduleMusic() {
  const ctx = AU.ctx;
  if (!ctx || ctx.state !== 'running') return;
  const cfg = MUSIC[Math.min(stageIdx, MUSIC.length - 1)];
  const spb = 60 / cfg.bpm, barLen = spb * 4;
  while (AU.nextBar < ctx.currentTime + 0.8) {
    const t0 = AU.nextBar;
    const bi = AU.bar % 4;
    const ch = cfg.prog[bi];
    const root = midi(ch[0] - 24);
    for (let b = 0; b < 4; b++) {
      const bt = t0 + b * spb;
      tone('sine', 150, bt, 0.16, 0.5, AU.music, 44);                    // kick
      if (b === 1 || b === 3) noiseHit(bt, 0.13, 0.24, 'bandpass', 1900, AU.music, 0.9);
      noiseHit(bt + spb / 2, 0.045, 0.1, 'highpass', 8500, AU.music);
      if (cfg.hat16) noiseHit(bt + spb * 0.25, 0.03, 0.05, 'highpass', 9800, AU.music);
      tone('sawtooth', root, bt, spb * 0.46, 0.13, AU.music);            // bass
      tone('sawtooth', root * (b === 2 ? 1.5 : 2), bt + spb / 2, spb * 0.4, 0.08, AU.music);
    }
    if (bi === 3) {                                                      // 第4小節 snare 過門
      for (let i = 0; i < 4; i++) noiseHit(t0 + barLen - spb / 2 + i * spb / 8, 0.06, 0.1 + i * 0.04, 'bandpass', 2100, AU.music);
    }
    for (const n of ch) {                                                // 7th 和弦 pad（雙鋸齒＋高八度亮澤）
      tone('sawtooth', midi(n) * 0.998, t0, barLen * 0.95, 0.02, AU.music);
      tone('sawtooth', midi(n) * 1.004, t0, barLen * 0.95, 0.02, AU.music);
      tone('sine', midi(n + 12), t0, barLen * 0.95, 0.012, AU.music);
    }
    tone('sine', midi(ch[0] - 12), t0, barLen * 0.95, 0.035, AU.music);  // 低八度根音鋪底
    tone('sine', midi(ch[2] - 12), t0, barLen * 0.95, 0.018, AU.music);  // 五度撐厚
    const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[3] + 12];        // arp 8ths → 進延遲
    for (let i = 0; i < 8; i++) {
      tone('triangle', midi(arp[i % 4]), t0 + i * spb / 2, 0.13, 0.035, AU.lead);
      if (cfg.hat16) tone('sine', midi(arp[(i + 2) % 4] + 12), t0 + i * spb / 2 + spb / 4, 0.08, 0.018, AU.lead);   // 16 分閃爍
    }
    if (bi === 0) {                                                      // 主旋律 hook（4 小節一循環）＋自動和聲
      for (const [n, beat, len] of cfg.lead) {
        const t = t0 + beat * spb, d = len * spb * 0.9;
        tone('square', midi(n), t, d, 0.075, AU.lead);
        tone('sawtooth', midi(n) * 1.004, t, d, 0.045, AU.lead);
        // 和聲：從該拍所屬和弦挑出貼在主音下方一個八度內的最高和弦音（自然三/六度）
        const chd = cfg.prog[Math.floor(beat / 4) % 4];
        let h = -1;
        for (const c of chd) for (const o of [0, 12, 24]) {
          const v = c + o;
          if (v < n && v > n - 12 && v > h) h = v;
        }
        if (h > 0) tone('triangle', midi(h), t, d, 0.05, AU.lead);
      }
    }
    AU.nextBar += barLen;
    AU.bar++;
  }
}
const S = {
  slash() { if (AU.ctx) { const t = AU.ctx.currentTime; noiseHit(t, 0.12, 0.22, 'bandpass', 2600, AU.sfx, 2); tone('sawtooth', 900, t, 0.1, 0.05, AU.sfx, 240); } },
  hit(n = 1, heavy = false) {
    if (!AU.ctx) return;
    const t = AU.ctx.currentTime;
    tone('sine', heavy ? 150 : 190, t, 0.11, Math.min(0.5, 0.3 + n * 0.05), AU.sfx, 50);
    noiseHit(t, 0.07, 0.18, 'lowpass', 900, AU.sfx);
  },
  kill() { if (AU.ctx) { const t = AU.ctx.currentTime; tone('square', 660, t, 0.16, 0.14, AU.sfx, 110); noiseHit(t, 0.14, 0.14, 'bandpass', 700, AU.sfx); } },
  hurt() { if (AU.ctx) { const t = AU.ctx.currentTime; tone('sawtooth', 130, t, 0.2, 0.3, AU.sfx, 60); noiseHit(t, 0.1, 0.16, 'lowpass', 500, AU.sfx); } },
  jump() { if (AU.ctx) tone('sine', 320, AU.ctx.currentTime, 0.16, 0.16, AU.sfx, 620); },
  roll() { if (AU.ctx) noiseHit(AU.ctx.currentTime, 0.18, 0.14, 'lowpass', 1300, AU.sfx); },
  pickup() { if (AU.ctx) { const t = AU.ctx.currentTime; tone('triangle', midi(88), t, 0.1, 0.16, AU.sfx); tone('triangle', midi(93), t + 0.09, 0.16, 0.16, AU.sfx); } },
  zone() { if (AU.ctx) { const t = AU.ctx.currentTime; [76, 81, 85, 88].forEach((n, i) => tone('triangle', midi(n), t + i * 0.1, 0.22, 0.16, AU.sfx)); } },
  roar() { if (AU.ctx) { const t = AU.ctx.currentTime; tone('sawtooth', 75, t, 0.7, 0.4, AU.sfx, 42); noiseHit(t, 0.55, 0.2, 'lowpass', 300, AU.sfx); } },
  boom() { if (AU.ctx) { const t = AU.ctx.currentTime; tone('sine', 120, t, 0.35, 0.5, AU.sfx, 34); noiseHit(t, 0.3, 0.3, 'lowpass', 600, AU.sfx); } },
  win() { if (AU.ctx) { const t = AU.ctx.currentTime; [69, 73, 76, 81, 88].forEach((n, i) => tone('square', midi(n), t + i * 0.13, 0.3, 0.13, AU.sfx)); } },
};
document.getElementById('mute').addEventListener('click', () => {
  AU.muted = !AU.muted;
  if (AU.master) AU.master.gain.value = AU.muted ? 0 : 0.8;
  document.getElementById('mute').textContent = AU.muted ? '🔇' : '🔊';
});
document.addEventListener('visibilitychange', () => {
  if (!AU.ctx) return;
  if (document.hidden) AU.ctx.suspend();
  else AU.ctx.resume();
});

// ---------- 輸入 ----------
const keys = new Set();
let atkPressed = false, heavyPressed = false, jumpPressed = false, dodgePressed = false, musouPressed = false;
let heavyHold = false;   // 重攻擊按住中（蓄力判定用）
addEventListener('keydown', e => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
  if (e.code === 'Tab' && state === 'play') { toggleLock(); return; }
  if (typeof dlg !== 'undefined' && dlg.active) {
    if (e.code === 'KeyJ' || e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') nextDialog();
    return;
  }
  keys.add(e.code);
  if (e.code === 'KeyJ' || e.code === 'KeyZ') atkPressed = true;
  if (e.code === 'KeyK' || e.code === 'KeyX') { heavyPressed = true; heavyHold = true; }
  if (e.code === 'Space') jumpPressed = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyL') dodgePressed = true;
  if (e.code === 'KeyM') document.getElementById('mute').click();
  if (e.code === 'KeyQ' && state === 'play') switchWeapon();
  if (e.code === 'KeyE') musouPressed = true;
  if (e.code === 'KeyR' && state === 'dead') restart();
  if (state === 'title' && ready) {
    const sel = document.getElementById('charsel');
    if (sel.classList.contains('hidden')) {
      if (e.code === 'Enter' || e.code === 'KeyJ') {
        hud.title.classList.add('hidden');
        sel.classList.remove('hidden');
      }
    } else {
      const pick = { Digit1: 'rumi', Digit2: 'mira', Digit3: 'zoey' }[e.code];
      if (pick) {
        buildHero(CHARS[pick]);
        sel.classList.add('hidden');
        start();
      }
    }
  }
});
addEventListener('keyup', e => {
  keys.delete(e.code);
  if (e.code === 'KeyK' || e.code === 'KeyX') heavyHold = false;
});

// 觸控：左半螢幕虛擬搖桿＋右側按鍵
const touchMove = { active: false, mx: 0, mz: 0 };
(function setupTouch() {
  const zone = document.getElementById('stickZone');
  const base = document.getElementById('stickBase');
  const knob = document.getElementById('stickKnob');
  if (!zone) return;
  let pid = null, cx = 0, cy = 0;
  const R = 55;
  zone.addEventListener('pointerdown', e => {
    pid = e.pointerId; cx = e.clientX; cy = e.clientY;
    base.style.left = knob.style.left = cx + 'px';
    base.style.top = knob.style.top = cy + 'px';
    base.style.display = knob.style.display = 'block';
    touchMove.active = true;
    zone.setPointerCapture(pid);
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    knob.style.left = (cx + dx) + 'px';
    knob.style.top = (cy + dy) + 'px';
    touchMove.mx = dx / R;
    touchMove.mz = dy / R;
  });
  const end = e => {
    if (e.pointerId !== pid) return;
    pid = null;
    touchMove.active = false; touchMove.mx = 0; touchMove.mz = 0;
    base.style.display = knob.style.display = 'none';
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  const bind = (id, fn) => {
    const el2 = document.getElementById(id);
    el2.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  };
  bind('btnA', () => { atkPressed = true; });
  const bB = document.getElementById('btnB');
  bB.addEventListener('pointerdown', e => { e.preventDefault(); heavyPressed = true; heavyHold = true; });
  bB.addEventListener('pointerup', () => { heavyHold = false; });
  bB.addEventListener('pointercancel', () => { heavyHold = false; });
  bind('btnJ', () => { jumpPressed = true; });
  bind('btnR', () => { dodgePressed = true; });
  bind('btnW', () => { if (state === 'play') switchWeapon(); });
  bind('btnU', () => { musouPressed = true; });
  bind('btnL', () => { if (state === 'play') toggleLock(); });
})();

// ---------- HUD ----------
const el = id => document.getElementById(id);
const hud = {
  hp: el('hpfill'), kills: el('kills'), combo: el('combo'),
  objective: el('objective'), toast: el('toast'),
  bosswrap: el('bosswrap'), bossfill: el('bossfill'),
  title: el('title'), dead: el('dead'), deadStats: el('deadStats'),
  win: el('win'), winStats: el('winStats'), grade: el('grade'),
  load: el('loadtext'),
};
el('startBtn').addEventListener('click', () => {
  if (!ready) return;
  hud.title.classList.add('hidden');
  document.getElementById('charsel').classList.remove('hidden');
});
for (const card of document.querySelectorAll('.ccard')) {
  card.addEventListener('click', () => {
    if (!ready || state !== 'title') return;
    buildHero(CHARS[card.dataset.char]);
    document.getElementById('charsel').classList.add('hidden');
    start();
  });
}
el('retryBtn').addEventListener('click', () => restart());
el('againBtn').addEventListener('click', () => restart());
el('nextBtn').addEventListener('click', () => {
  hud.win.classList.add('hidden');
  loadStage(stageIdx + 1);
});
function showToastMini(text) { showToast(text); }
function showToast(text) {
  hud.toast.textContent = text;
  hud.toast.classList.remove('show');
  void hud.toast.offsetWidth;
  hud.toast.classList.add('show');
}

// ---------- 遊戲狀態 ----------
let state = 'title';               // title | play | dead | win
let ready = false;
let kills = 0, combo = 0, comboTimer = 0, maxCombo = 0;
let hitStopT = 0, shakeT = 0, shakeAmp = 0;
let musou = 0;                      // 無雙集氣 0~100
let worldT = 0, runStartT = 0, runTime = 0;

const level = { objs: [], bossPhase: false, boss: null, props: [] };

// 攻擊表：三位主角招式組各自不同
const PLUNGE = { range: 4.0, ang: 6.3, dmg: 2, kb: 14, shake: 0.6 };
const MOVES = {
  rumi: {   // 靈力長劍：四段均衡連段
    light: [
      { clip: 'slash1', ts: 1.85, range: 2.9, ang: 2.6, dmg: 1, kb: 7,  hitAt: 0.36, dir: 1,  mul: 1 },
      { clip: 'slash2', ts: 1.85, range: 2.9, ang: 2.6, dmg: 1, kb: 7,  hitAt: 0.36, dir: -1, mul: 1.1 },
      { clip: 'slash3', ts: 1.8,  range: 3.0, ang: 2.2, dmg: 1, kb: 9,  hitAt: 0.38, dir: 1,  mul: 1.25 },
      { clip: 'slash4', ts: 1.7,  range: 3.4, ang: 2.4, dmg: 2, kb: 12, hitAt: 0.40, dir: 1,  mul: 1.45, shake: 0.3 },
    ],
    heavySolo:   { clip: 'heavy',    ts: 1.55, range: 3.3, ang: 2.5, dmg: 3, kb: 13, hitAt: 0.44, dir: 1, shake: 0.45, mul: 1,   shock: true },
    heavyFinish: { clip: 'heavyfin', ts: 1.55, range: 3.7, ang: 6.3, dmg: 2, kb: 15, hitAt: 0.46, dir: 1, shake: 0.55, mul: 1.5, shock: true },
    dash:   { clip: 'slash3',   ts: 1.6, range: 3.2, ang: 2.0, dmg: 2, kb: 11, hitAt: 0.34, dir: 1, mul: 1.35, shake: 0.35, dash: 19 },
    charge: { clip: 'heavyfin', ts: 1.3, range: 4.6, ang: 6.3, dmg: 5, kb: 19, hitAt: 0.46, dir: 1, mul: 1.6,  shake: 0.75, charged: true, shock: true },
    rlight: [
      { clip: 'slash1', ts: 2.3, hitAt: 0.33, dir: 1,  bolt: { dmg: 1, pierce: 2, size: 1.6 } },
      { clip: 'slash2', ts: 2.3, hitAt: 0.33, dir: -1, bolt: { dmg: 1, pierce: 2, size: 1.6 } },
    ],
    rheavy:  { clip: 'heavy',    ts: 1.6, hitAt: 0.44, dir: 1, shake: 0.3, fan: 3, bolt: { dmg: 2, pierce: 4,  size: 1.9 } },
    rcharge: { clip: 'heavyfin', ts: 1.4, hitAt: 0.46, dir: 1, shake: 0.5, fan: 5, charged: true, bolt: { dmg: 3, pierce: 99, size: 2.4 } },
  },
  mira: {   // 破魔大劍：三段重連段（段段震波）、跳壓地裂、破城衝撞
    light: [
      { clip: 'slash1', ts: 1.6,  range: 3.4, ang: 2.9, dmg: 2, kb: 10, hitAt: 0.38, dir: 1,  mul: 1,    shake: 0.2 },
      { clip: 'slash3', ts: 1.55, range: 3.5, ang: 2.6, dmg: 2, kb: 12, hitAt: 0.40, dir: -1, mul: 1.15, shake: 0.25 },
      { clip: 'heavy',  ts: 1.5,  range: 3.8, ang: 3.1, dmg: 3, kb: 15, hitAt: 0.44, dir: 1,  mul: 1.35, shake: 0.45, shock: true },
    ],
    heavySolo:   { clip: 'slash4',   ts: 1.35, range: 4.2, ang: 6.3, dmg: 4, kb: 16, hitAt: 0.42, dir: 1, mul: 1,   shake: 0.6,  shock: true, slam: true },
    heavyFinish: { clip: 'heavyfin', ts: 1.4,  range: 4.2, ang: 6.3, dmg: 3, kb: 18, hitAt: 0.46, dir: 1, mul: 1.5, shake: 0.65, shock: true },
    dash:   { clip: 'heavy',    ts: 1.5, range: 3.6, ang: 2.4, dmg: 3, kb: 22, hitAt: 0.40, dir: 1, mul: 1.3, shake: 0.5, dash: 16, shock: true },
    charge: { clip: 'heavyfin', ts: 1.1, range: 5.4, ang: 6.3, dmg: 7, kb: 24, hitAt: 0.46, dir: 1, mul: 1.7, shake: 0.9, charged: true, shock: true, slam: true },
    rlight: [
      { clip: 'slash1', ts: 2.0, hitAt: 0.35, dir: 1,  bolt: { dmg: 2, pierce: 3, size: 2.0 } },
      { clip: 'slash3', ts: 2.0, hitAt: 0.36, dir: -1, bolt: { dmg: 2, pierce: 3, size: 2.0 } },
    ],
    rheavy:  { clip: 'heavy',    ts: 1.5, hitAt: 0.44, dir: 1, shake: 0.4, bolt: { dmg: 4, pierce: 99, size: 2.8 } },
    rcharge: { clip: 'heavyfin', ts: 1.3, hitAt: 0.46, dir: 1, shake: 0.6, fan: 3, charged: true, bolt: { dmg: 4, pierce: 99, size: 2.6 } },
  },
  zoey: {   // 疾風短刃：六段疾風連段、突刺重擊、穿風突進、散射新月
    light: [
      { clip: 'slash1', ts: 2.3, range: 2.5, ang: 2.4, dmg: 1, kb: 5,  hitAt: 0.34, dir: 1,  mul: 1 },
      { clip: 'slash2', ts: 2.3, range: 2.5, ang: 2.4, dmg: 1, kb: 5,  hitAt: 0.34, dir: -1, mul: 1.05 },
      { clip: 'slash1', ts: 2.4, range: 2.6, ang: 2.4, dmg: 1, kb: 6,  hitAt: 0.34, dir: 1,  mul: 1.1 },
      { clip: 'slash2', ts: 2.4, range: 2.6, ang: 2.4, dmg: 1, kb: 6,  hitAt: 0.34, dir: -1, mul: 1.15 },
      { clip: 'slash3', ts: 2.2, range: 2.8, ang: 2.2, dmg: 1, kb: 8,  hitAt: 0.36, dir: 1,  mul: 1.3, dash: 8 },
      { clip: 'slash4', ts: 2.0, range: 3.0, ang: 6.3, dmg: 2, kb: 13, hitAt: 0.38, dir: 1,  mul: 1.5, shake: 0.35, shock: true },
    ],
    heavySolo:   { clip: 'slash3',   ts: 2.0, range: 3.0, ang: 1.6, dmg: 2, kb: 9,  hitAt: 0.35, dir: 1, mul: 1.2, shake: 0.3,  dash: 14 },
    heavyFinish: { clip: 'heavyfin', ts: 1.9, range: 3.2, ang: 6.3, dmg: 2, kb: 12, hitAt: 0.44, dir: 1, mul: 1.4, shake: 0.45, shock: true },
    dash:   { clip: 'slash3',   ts: 2.1, range: 2.9, ang: 1.8, dmg: 2, kb: 9,  hitAt: 0.30, dir: 1, mul: 1.3, shake: 0.3, dash: 26 },
    charge: { clip: 'heavyfin', ts: 1.7, range: 3.8, ang: 6.3, dmg: 4, kb: 15, hitAt: 0.42, dir: 1, mul: 1.5, shake: 0.6, charged: true, shock: true },
    rlight: [
      { clip: 'slash1', ts: 2.6, hitAt: 0.30, dir: 1,  fan: 2, bolt: { dmg: 1, pierce: 1, size: 1.2 } },
      { clip: 'slash2', ts: 2.6, hitAt: 0.30, dir: -1, fan: 2, bolt: { dmg: 1, pierce: 1, size: 1.2 } },
    ],
    rheavy:  { clip: 'heavy',    ts: 1.8, hitAt: 0.42, dir: 1, shake: 0.3, fan: 5, bolt: { dmg: 1, pierce: 2, size: 1.4 } },
    rcharge: { clip: 'heavyfin', ts: 1.6, hitAt: 0.44, dir: 1, shake: 0.5, fan: 7, charged: true, bolt: { dmg: 2, pierce: 4, size: 1.6 } },
  },
};
const curMoves = () => MOVES[curChar.key];
let weapon = 'melee';
const curLight = () => weapon === 'melee' ? curMoves().light : curMoves().rlight;
function switchWeapon() {
  if (player.st === 'atk' || player.st === 'dead') return;
  weapon = weapon === 'melee' ? 'ranged' : 'melee';
  document.getElementById('wpn').textContent = weapon === 'melee' ? '⚔ 近戰' : '✦ 魂力彈';
  if (AU.ctx) { const t = AU.ctx.currentTime; tone('triangle', midi(weapon === 'melee' ? 76 : 83), t, 0.12, 0.15, AU.sfx); }
  spawnSpark(new THREE.Vector3(player.x, 1.4, player.z), 1.6, weapon === 'melee' ? curChar.fx : 0x6ae0ff);
}
// 劍氣彈
const bolts = [];
function spawnBolt(cfg, dirX, dirZ) {
  const p = player;
  const fx = dirX !== undefined ? dirX : Math.sin(p.yaw);
  const fz = dirZ !== undefined ? dirZ : Math.cos(p.yaw);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: crescentTex, color: cfg.size > 1.2 ? 0xc8f4ff : curChar.boltCol,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  spr.position.set(p.x + fx * 0.9, 1.3, p.z + fz * 0.9);
  spr.scale.set(1.7 * cfg.size, 1.15 * cfg.size, 1);
  scene.add(spr);
  bolts.push({ spr, x: p.x + fx * 0.9, z: p.z + fz * 0.9, dx: fx, dz: fz, yaw: Math.atan2(fx, fz), traveled: 0, pierce: cfg.pierce, dmg: cfg.dmg, size: cfg.size, hitSet: new Set() });
}
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    const step = 24 * dt * (b.size > 1.2 ? 1.12 : 1);
    b.x += b.dx * step; b.z += b.dz * step;
    b.traveled += step;
    if (Math.floor(b.traveled / 1.2) !== Math.floor((b.traveled - step) / 1.2)) {
      spawnSpark(new THREE.Vector3(b.x, 1.3, b.z), 0.55 * b.size, 0x6ac0ff, { dur: 0.16 });
    }
    b.spr.position.set(b.x, 1.3, b.z);
    const pulse = 1 + Math.sin(b.traveled * 6) * 0.12;
    b.spr.scale.set(1.7 * b.size * pulse, 1.15 * b.size * pulse, 1);
    // 新月開口對齊行進方向（螢幕空間）
    b.spr.material.rotation = -(b.yaw - camYaw) + Math.sin(b.traveled * 3) * 0.08;
    let dead = b.traveled > 22 || Math.abs(b.x) > MAP_HALF + 1 || Math.abs(b.z) > MAP_HALF + 1;
    for (const e of enemies) {
      if (dead) break;
      if (e.st === 'dead' || e.st === 'spawn' || b.hitSet.has(e)) continue;
      if (Math.hypot(e.x - b.x, e.z - b.z) < 0.95 * b.size + (e.kind.scale - 1) * 0.5) {
        b.hitSet.add(e);
        hitEnemy(e, b.dmg, 8, b.dx, b.dz, 1.2 + b.dmg * 0.3);
        S.hit(1, b.dmg > 1);
        b.pierce--;
        if (b.pierce <= 0) dead = true;
      }
    }
    // 劍氣命中裂口
    for (const o of level.objs || []) {
      if (dead) break;
      if (o.type !== 'rift' || o.state !== 'active' || o.riftHp <= 0 || b.hitSet.has(o)) continue;
      if (Math.hypot(o.pos[0] - b.x, o.pos[1] - b.z) < 1.8 + 0.4 * b.size) {
        b.hitSet.add(o);
        o.riftHp -= b.dmg * curChar.dmgMul;
        spawnSpark(new THREE.Vector3(o.pos[0], 2.4, o.pos[1]), 1.5, 0x30e0ff);
        S.hit(1);
        b.pierce--;
        if (b.pierce <= 0) dead = true;
      }
    }
    if (dead) {
      spawnSpark(new THREE.Vector3(b.x, 1.3, b.z), 0.9, 0x7ad0ff);
      scene.remove(b.spr); b.spr.material.dispose();
      bolts.splice(i, 1);
    }
  }
}

const player = {
  root: null, rig: null, shadow: null,
  x: 0, y: 0, z: 0, vy: 0, yaw: Math.PI,
  hp: 100, hpMax: 100, spd: 6.5,
  st: 'idle',
  curAtk: null, atkStage: -1, atkT: 0, atkDur: 0, didHit: false, queuedLight: false, queuedHeavy: false,
  dodgeT: 0, dodgeDur: 0, dodgeDx: 0, dodgeDz: 0,
  hurtT: 0, invuln: 0,
};

const enemies = [];
let assets = null;

const KINDS = {
  minion: {
    file: 'minion', scale: 1, hp: 2, spdBase: 2.4, spdVar: 1.1, dmg: 5,
    atkRange: 2.3, hitRange: 2.4, atkTs: 0.8, kbMul: 1, shadowR: 0.9,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B'],
    dropRate: 0.10,
  },
  elite: {
    file: 'warrior', scale: 1.2, hp: 9, spdBase: 2.2, spdVar: 0.5, dmg: 11,
    atkRange: 2.7, hitRange: 3.0, atkTs: 0.8, kbMul: 0.35, shadowR: 1.15,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick'],
    dropRate: 1,
  },
  runner: {
    file: 'minion', scale: 0.92, hp: 1, spdBase: 4.1, spdVar: 0.8, dmg: 4,
    atkRange: 2.1, hitRange: 2.2, atkTs: 0.95, kbMul: 1.2, shadowR: 0.8,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B'],
    dropRate: 0.07, tint: 0xff4040,
  },
  boss: {
    file: 'warrior', scale: 1.6, hp: 70, spdBase: 2.7, spdVar: 0, dmg: 14,
    atkRange: 3.2, hitRange: 3.6, atkTs: 0.85, kbMul: 0.12, shadowR: 1.5,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick'],
    dropRate: 0,
  },
  boss2: {
    file: 'warrior', scale: 1.8, hp: 130, spdBase: 3.0, spdVar: 0, dmg: 17,
    atkRange: 3.4, hitRange: 3.8, atkTs: 0.9, kbMul: 0.08, shadowR: 1.7,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick'],
    dropRate: 0, tint: 0xff5050,
  },
  boss3: {
    file: 'warrior', scale: 2.0, hp: 200, spdBase: 3.2, spdVar: 0, dmg: 20,
    atkRange: 3.6, hitRange: 4.0, atkTs: 0.95, kbMul: 0.06, shadowR: 1.9,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick'],
    dropRate: 0, tint: 0xb070ff,
  },
  boss4: {
    file: 'warrior', scale: 2.2, hp: 280, spdBase: 3.4, spdVar: 0, dmg: 22,
    atkRange: 3.8, hitRange: 4.2, atkTs: 1.0, kbMul: 0.05, shadowR: 2.1,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick'],
    dropRate: 0, tint: 0x60c8ff,
  },
};

// ---------- 載入 ----------
const loader = new GLTFLoader();
const CITY_PROPS = ['car_sedan', 'car_taxi', 'car_hatchback', 'streetlight', 'trafficlight_A', 'dumpster', 'bench', 'firehydrant'];
// Mixamo 動作自帶前進位移，鎖定 Hips 水平位移（保留 Y 起伏），移動交給遊戲邏輯
function lockHips(animations) {
  for (const clip of animations) {
    for (const tr of clip.tracks) {
      if (/Hips\.position$/.test(tr.name)) {
        const v = tr.values;
        const x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
      }
    }
  }
}
let heroBase = null;
function prepHeroModel(gltf) {
  lockHips(gltf.animations);
  toonify(gltf.scene, gradTex4);
  gltf.scene.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  // 依模型實際身高標定為 1.78m（Mixamo FBX 單位是公分）
  const bbox = new THREE.Box3().setFromObject(gltf.scene);
  return { scene: gltf.scene, clips: gltf.animations, hScale: 1.78 / (bbox.max.y - bbox.min.y) };
}
function buildHero(char) {
  curChar = char;
  if (player.root) {
    scene.remove(player.root);
    player.rig.mixer.stopAllAction();
    scene.remove(player.shadow);
  }
  const base = char.model || heroBase;
  const root = SkeletonUtils.clone(base.scene);
  if (!char.model && char.tint) {
    // 專屬模型未到位前：靈氣配色代身
    const tc = new THREE.Color(char.tint);
    root.traverse(o => {
      if (!o.isMesh || o.userData.isOutline) return;
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.color && m.name !== 'Glow') m.color.lerp(tc, 0.3);
      }
    });
  }
  root.scale.setScalar(base.hScale);
  player.root = root;
  scene.add(root);
  player.rig = makeRig(root, base.clips, [
    'idle', 'run', 'roll', 'hurt', 'death', 'win', 'jump',
    'slash1', 'slash2', 'slash3', 'slash4', 'heavy', 'heavyfin',
  ]);
  setupHair(root, char, base.hScale);   // 在描邊前掛髮，讓頭髮一起吃描邊
  addOutline(root, null, 0.028 / base.hScale);
  play(player.rig, 'idle');
  player.shadow = makeBlobShadow(1.1);
  player.spd = char.spd;
  setupSwordFx(root, char);
  heroLight.color.set(char.light);
  document.getElementById('hpname').textContent = char.name;
  syncPlayer();
}
const tryLoad = url => loader.loadAsync(url).catch(() => null);
Promise.all([
  loader.loadAsync('assets/maria.glb'),
  loader.loadAsync('assets/Skeleton_Minion.glb'),
  loader.loadAsync('assets/Skeleton_Warrior.glb'),
  tryLoad('assets/mira.glb'),
  tryLoad('assets/zoey.glb'),
  ...CITY_PROPS.map(n => loader.loadAsync(`assets/city/${n}.gltf`)),
]).then(([maria, minion, warrior, mira, zoey, ...city]) => {
  heroBase = prepHeroModel(maria);
  if (mira) CHARS.mira.model = prepHeroModel(mira);
  if (zoey) CHARS.zoey.model = prepHeroModel(zoey);
  buildHero(CHARS.rumi);

  toonify(minion.scene);
  toonify(warrior.scene);
  assets = {
    minion: { scene: minion.scene, clips: minion.animations },
    warrior: { scene: warrior.scene, clips: warrior.animations },
  };

  placeCityProps(Object.fromEntries(CITY_PROPS.map((n, i) => [n, city[i].scene])));

  // 濕地面反射：對街景烘一次靜態 cubemap
  const cubeRT = new THREE.WebGLCubeRenderTarget(256);
  const cubeCam = new THREE.CubeCamera(0.5, 250, cubeRT);
  cubeCam.position.set(0, 1.6, -40);
  cubeCam.update(renderer, scene);
  for (const m of groundMats) {
    m.envMap = cubeRT.texture;
    m.envMapIntensity = m.roughness < 0.4 ? 1.25 : 0.65;
    m.needsUpdate = true;
  }

  ready = true;
  hud.load.textContent = '載入完成';
}).catch(err => {
  hud.load.textContent = '載入失敗：' + err.message;
  console.error(err);
});

// ---------- 城市道具擺設 ----------
function placeCityProps(props) {
  const put = (name, x, z, rotY = 0, scale = 1) => {
    const src = props[name];
    if (!src) return null;
    const m = src.clone(true);
    toonify(m);
    m.position.set(x, 0.03, z);
    m.rotation.y = rotY;
    m.scale.setScalar(scale);
    world1.add(m);
    return m;
  };
  // 路邊停車（沿兩條主幹道）
  const carTypes = ['car_sedan', 'car_taxi', 'car_hatchback'];
  for (let i = 0; i < 12; i++) {
    const k = -44 + i * 8 + Math.random() * 3;
    if (Math.abs(k) < 8) continue;
    put(carTypes[i % 3], (i % 2 === 0 ? 3.6 : -3.6), k, i % 2 === 0 ? 0 : Math.PI, 1.05);
    put(carTypes[(i + 1) % 3], k, (i % 2 === 0 ? -3.6 : 3.6), i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2, 1.05);
  }
  // 路燈＋光池（幹道沿線）
  for (let i = 0; i < 7; i++) {
    const k = -42 + i * 14;
    put('streetlight', 6.2, k, Math.PI, 1.35);
    lightPool?.(4.8, k, 7);
    put('streetlight', k, -6.2, Math.PI / 2, 1.35);
    lightPool?.(k, -4.8, 7);
  }
  // 紅綠燈（中央十字路口）
  put('trafficlight_A', 6.2, 6.2, Math.PI, 1.3);
  put('trafficlight_A', -6.2, -6.2, 0, 1.3);
  // 雜物散布各街區邊
  OBSTACLES_BY_STAGE[0].forEach((b, i) => {
    if (i % 2 === 0) put('dumpster', b.x + b.hx + 2.2, b.z - 4, Math.PI / 2, 1.2);
    else put('bench', b.x - b.hx - 2.2, b.z + 3, -Math.PI / 2, 1.2);
    if (i % 3 === 0) put('firehydrant', b.x + 4, b.z + b.hz + 2.4, 0, 1.2);
  });
}

// ---------- 敵人 ----------
const E_ANIMS = [
  'Spawn_Ground', 'Running_A', 'Hit_A', 'Death_A', 'Idle',
  'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B', 'Unarmed_Melee_Attack_Kick',
  'Spellcast_Long', 'Spellcast_Summon', 'Taunt',
];
const MAX_ATTACKERS = 4;

function spawnEnemy(kindName, fx, fz) {
  const kind = KINDS[kindName];
  let x, z;
  if (fx !== undefined) { x = fx; z = fz; }
  else {
    const a = Math.random() * 6.28;
    const r = 10 + Math.random() * 8;
    x = Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, player.x + Math.cos(a) * r));
    z = Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, player.z + Math.sin(a) * r));
  }
  const src = assets[kind.file];
  const root = SkeletonUtils.clone(src.scene);
  const mats = [];
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.push(m);
    }
  });
  addOutline(root, mats);
  if (kind.tint) {
    const tc = new THREE.Color(kind.tint);
    for (const m of mats) {
      if (m.color && m.name !== 'Glow') m.color.lerp(tc, 0.4);
    }
  }
  root.scale.setScalar(kind.scale);
  root.position.set(x, 0, z);
  scene.add(root);
  const rig = makeRig(root, src.clips, E_ANIMS);
  const e = {
    kind, kindName, root, rig, mats,
    shadow: makeBlobShadow(kind.shadowR),
    x, z, yaw: 0, vx: 0, vz: 0,
    hp: kind.hp, hpMax: kind.hp,
    spd: kind.spdBase + Math.random() * kind.spdVar,
    st: 'spawn', t: clipDur(rig, 'Spawn_Ground', 1.4),
    atkCd: 0.6 + Math.random() * 1.8, flash: 0, hitT: 0, deadT: 0, hitAppl: false,
    aoeCd: 6, summonCd: 3, castT: 0, castKind: null,
  };
  play(rig, 'Spawn_Ground', { once: true, ts: 1.4, fade: 0 });
  spawnSpark(new THREE.Vector3(x, 0.6, z), kindName === 'boss' ? 3 : 1.3, 0xa04fff);
  enemies.push(e);
  return e;
}

function makeOfficerBar(e, name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 56;
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(3, 0.66, 1);
  sp.position.y = 2.5;
  e.root.add(sp);
  e.bar = { c, tex, sp, name };
  drawOfficerBar(e);
}
function drawOfficerBar(e) {
  const g = e.bar.c.getContext('2d');
  g.clearRect(0, 0, 256, 56);
  g.fillStyle = 'rgba(10,8,20,0.75)';
  g.fillRect(28, 0, 200, 30);
  g.font = '900 22px "Apple SD Gothic Neo","PingFang TC",sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#ffb056';
  g.fillText(e.bar.name, 128, 23);
  g.fillStyle = 'rgba(30,10,14,0.85)';
  g.fillRect(48, 36, 160, 12);
  g.fillStyle = '#ff3a4a';
  g.fillRect(50, 38, 156 * Math.max(0, e.hp / e.hpMax), 8);
  e.bar.tex.needsUpdate = true;
}
function killEnemy(e) {
  S.kill();
  if (player.st !== 'musou') musou = Math.min(100, musou + 1.5);
  spawnSpark(new THREE.Vector3(e.x, 1.6, e.z), 1.3, 0xb07aff, { dur: 0.7, rise: 2.6 });
  e.st = 'dead'; e.deadT = 0;
  play(e.rig, 'Death_A', { once: true, ts: 1.3 });
  kills++;
  spawnSpark(new THREE.Vector3(e.x, 1.0, e.z), e.kindName === 'boss' ? 4 : 2.2, 0xa04fff);
  if (!e.noCount && e.obj) e.obj.kills = (e.obj.kills || 0) + 1;
  else if (!e.noCount && !e.kindName.startsWith('boss')) {
    // 千人斬：野生敵擊殺也計入
    const horde = (level.objs || []).find(o => o.type === 'horde' && o.state === 'active');
    if (horde) horde.kills++;
  }
  if (Math.random() < e.kind.dropRate) spawnDrop(e.x, e.z);
  if (e.officer) {
    if (e.obj) e.obj.officersLeft--;
    showToast('敵將討破！');
    S.zone();
    spawnShockwave(e.x, e.z, { maxR: 12, dur: 0.5, color: 0xffb056 });
    for (const m of [...enemies]) {
      if (m.st === 'dead' || m.officer || m.kindName.startsWith('boss')) continue;
      if ((m.kindName === 'minion' || m.kindName === 'runner') && Math.hypot(m.x - e.x, m.z - e.z) < 14) {
        m.noCount = true;
        killEnemy(m);
      }
    }
  }
  if (e.kindName.startsWith('boss')) onBossDown();
}

function updateEnemies(dt) {
  const p = player;
  let attackers = enemies.filter(e => e.st === 'attack').length;
  for (const e of enemies) {
    e.rig.mixer.update(dt);
    e.flash = Math.max(0, e.flash - dt);
    for (const m of e.mats) {
      if (m.emissive) m.emissive.setScalar(e.flash > 0 ? 1 : 0);
    }
    e.x += e.vx * dt; e.z += e.vz * dt;
    e.vx *= Math.pow(0.002, dt); e.vz *= Math.pow(0.002, dt);

    // 防衛戰：鎖定魂燈（玩家貼近時才回頭打玩家）
    let tX = p.x, tZ = p.z;
    e.lampTgt = null;
    if (e.obj && e.obj.type === 'defend' && e.obj.state === 'active') {
      if (Math.hypot(p.x - e.x, p.z - e.z) > 5.5) {
        tX = e.obj.pos[0]; tZ = e.obj.pos[1];
        e.lampTgt = e.obj;
      }
    }
    const dx = tX - e.x, dz = tZ - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const targetYaw = Math.atan2(dx, dz);
    const isBoss = e.kindName.startsWith('boss');

    if (e.st === 'spawn') {
      e.t -= dt;
      if (e.t <= 0) { e.st = 'chase'; play(e.rig, 'Running_A', { ts: 1.2 }); }
    } else if (e.st === 'chase') {
      e.yaw += angDiff(e.yaw, targetYaw) * Math.min(1, dt * 8);
      if (d > e.kind.atkRange - 0.2) {
        e.x += (dx / d) * e.spd * dt;
        e.z += (dz / d) * e.spd * dt;
      }
      e.atkCd -= dt;
      if (isBoss) {
        e.aoeCd -= dt; e.summonCd -= dt;
        if (e.summonCd <= 0 && enemies.filter(x => (x.kindName === 'minion' || x.kindName === 'runner') && x.st !== 'dead').length < 9) {
          e.st = 'cast'; e.castKind = 'summon'; e.castT = 0;
          e.castDur = clipDur(e.rig, 'Spellcast_Summon', 1.1);
          play(e.rig, 'Spellcast_Summon', { once: true, ts: 1.1 });
          continue;
        }
        if (e.aoeCd <= 0 && d < 7) {
          e.st = 'cast'; e.castKind = 'aoe'; e.castT = 0;
          e.castDur = clipDur(e.rig, 'Spellcast_Long', 1.15);
          play(e.rig, 'Spellcast_Long', { once: true, ts: 1.15 });
          spawnShockwave(e.x, e.z, { maxR: 6.5, dur: e.castDur * 0.75, color: 0xff3a5a });
          continue;
        }
      }
      if (d < e.kind.atkRange && e.atkCd <= 0 && (isBoss || attackers < MAX_ATTACKERS) && p.st !== 'dead') {
        if (!isBoss) attackers++;
        e.st = 'attack';
        const clip = e.kind.atks[Math.floor(Math.random() * e.kind.atks.length)];
        e.t = 0; e.hitAppl = false;
        e.atkDur = clipDur(e.rig, clip, e.kind.atkTs);
        play(e.rig, clip, { once: true, ts: e.kind.atkTs });
        spawnShockwave(e.x, e.z, { maxR: e.kind.hitRange * 0.55, dur: e.atkDur * 0.45, color: 0xff3a5a });
      }
    } else if (e.st === 'attack') {
      e.yaw += angDiff(e.yaw, targetYaw) * Math.min(1, dt * 4);
      e.t += dt;
      if (!e.hitAppl && e.t >= e.atkDur * 0.45) {
        e.hitAppl = true;
        if (e.lampTgt) {
          if (d < e.kind.hitRange + 1) damageLamp(e.lampTgt, e.kind.dmg);
        } else if (d < e.kind.hitRange && p.y < 1.2 && p.st !== 'dead') {
          if (p.st === 'dodge' && p.invuln > 0) triggerWitchTime();
          else if (p.invuln <= 0) damagePlayer(e.kind.dmg * (e.dmgMul || 1), e);
        }
      }
      if (e.t >= e.atkDur * 0.95) {
        e.st = 'chase';
        e.atkCd = (isBoss ? 1.1 : 1.7) + Math.random() * 1.5;
        play(e.rig, 'Running_A', { ts: 1.2 });
      }
    } else if (e.st === 'cast') {
      e.castT += dt;
      if (e.castKind === 'aoe' && !e.hitAppl && e.castT >= e.castDur * 0.72) {
        e.hitAppl = true;
        S.boom();
        spawnSpark(new THREE.Vector3(e.x, 1.5, e.z), 3.5, 0xff3a5a);
        spawnShockwave(e.x, e.z, { maxR: 7, dur: 0.3, color: 0xff5a7a });
        shakeT = 0.3; shakeAmp = 0.4;
        if (d < 6.5 && p.y < 1.6 && p.st !== 'dead') {
          if (p.st === 'dodge' && p.invuln > 0) triggerWitchTime();
          else if (p.invuln <= 0) damagePlayer(16, e);
        }
      }
      if (e.castKind === 'summon' && !e.hitAppl && e.castT >= e.castDur * 0.6) {
        e.hitAppl = true;
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * 6.28, r = 3 + Math.random() * 2;
          spawnEnemy('minion',
            Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, e.x + Math.cos(a) * r)),
            Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, e.z + Math.sin(a) * r)));
        }
      }
      if (e.castT >= e.castDur) {
        e.st = 'chase'; e.hitAppl = false;
        if (e.castKind === 'aoe') e.aoeCd = 7 + Math.random() * 3;
        else e.summonCd = 14;
        play(e.rig, 'Running_A', { ts: 1.2 });
      }
    } else if (e.st === 'hit') {
      e.hitT -= dt;
      if (e.hitT <= 0) { e.st = 'chase'; play(e.rig, 'Running_A', { ts: 1.2 }); }
    } else if (e.st === 'dead') {
      e.deadT += dt;
      if (e.deadT > 0.7) {
        e.root.position.y = -(e.deadT - 0.7) * 1.6;
        for (const m of e.mats) { m.transparent = true; m.opacity = Math.max(0, 1 - (e.deadT - 0.7) / 0.7); }
      }
      continue;
    }
    collideCircle(e, 0.7);
  }
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.st === 'dead') continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.st === 'dead') continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = 1.35 * Math.max(a.kind.scale, b.kind.scale);
      if (d > 0 && d < min) {
        const push = (min - d) / 2, ux = dx / d, uz = dz / d;
        a.x -= ux * push; a.z -= uz * push;
        b.x += ux * push; b.z += uz * push;
      }
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.root.position.x = e.x; e.root.position.z = e.z;
    e.root.rotation.y = e.yaw + MODEL_YAW;
    e.shadow.position.set(e.x, 0.04, e.z);
    e.shadow.material.opacity = (e.st === 'dead' ? Math.max(0, 1 - e.deadT) : 1) * 0.5;
    if (e.st === 'dead' && e.deadT > 1.5) {
      scene.remove(e.root); scene.remove(e.shadow);
      e.rig.mixer.stopAllAction();
      enemies.splice(i, 1);
    }
  }
}

// ---------- 開放戰場目標系統 ----------
// 魂燈（第二關防衛目標）
function makeLamp(x, z) {
  const grp = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.3, 8), new THREE.MeshLambertMaterial({ color: 0x8a8078 }));
  base.position.y = 0.65;
  base.castShadow = true;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffd890 }));
  orb.position.y = 1.75;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: 0xffc860, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(3.2, 3.2, 1);
  glow.position.y = 1.75;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.95, 40), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  grp.add(base, orb, glow, ring);
  grp.position.set(x, 0, z);
  grp.userData.orb = orb;
  grp.userData.glow = glow;
  scene.add(grp);
  level.props.push(grp);
  return grp;
}
function damageLamp(o, dmg) {
  o.lampHp -= dmg;
  spawnSpark(new THREE.Vector3(o.pos[0], 1.8, o.pos[1]), 1.4, 0xff8050);
  if (AU.ctx) tone('square', 220, AU.ctx.currentTime, 0.1, 0.12, AU.sfx, 120);
}
// 虛空裂口（第四關可破壞目標）
function makeRift(x, z) {
  const grp = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.OctahedronGeometry(1.7, 0), new THREE.MeshBasicMaterial({ color: 0xd040ff, transparent: true, opacity: 0.85 }));
  outer.position.y = 2.4;
  const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: 0x30e0ff }));
  inner.position.y = 2.4;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.9, 40), new THREE.MeshBasicMaterial({ color: 0xd040ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: 0xc060ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(4.5, 4.5, 1);
  glow.position.y = 2.4;
  grp.add(outer, inner, ring, glow);
  grp.position.set(x, 0, z);
  grp.userData.outer = outer;
  grp.userData.inner = inner;
  scene.add(grp);
  level.props.push(grp);
  return grp;
}
// 玩家攻擊命中裂口
function damageRifts(x, z, range, dmg) {
  let hits = 0;
  for (const o of level.objs || []) {
    if (o.type !== 'rift' || o.state !== 'active' || o.riftHp <= 0) continue;
    if (Math.hypot(o.pos[0] - x, o.pos[1] - z) < range + 1.6) {
      o.riftHp -= dmg * curChar.dmgMul;
      hits++;
      spawnSpark(new THREE.Vector3(o.pos[0], 2.4, o.pos[1]), 1.5, 0x30e0ff);
    }
  }
  return hits;
}
function objSpawn(o, kindName) {
  const a = Math.random() * 6.28;
  const r = 7 + Math.random() * 9;
  const e = spawnEnemy(kindName,
    Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, o.pos[0] + Math.cos(a) * r)),
    Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, o.pos[1] + Math.sin(a) * r)));
  e.obj = o;
  return e;
}
function activateObjective(o) {
  o.state = 'active';
  showToast(o.name);
  S.zone();
  if (o.type === 'officer') {
    const names = [...OFFICER_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < o.officers; i++) {
      const off = objSpawn(o, 'elite');
      off.officer = true;
      off.hp = off.hpMax = 14;
      makeOfficerBar(off, names[i % names.length]);
    }
    for (let i = 0; i < 4; i++) objSpawn(o, Math.random() < (o.fast || 0) ? 'runner' : 'minion');
  } else if (o.type === 'defend') {
    o.lampMax = 120; o.lampHp = 120; o.defT = 0;
    o.lamp = makeLamp(o.pos[0], o.pos[1]);
    for (let i = 0; i < 7; i++) objSpawn(o, Math.random() < (o.fast || 0) ? 'runner' : 'minion');
  } else if (o.type === 'trial') {
    o.trialT = o.tlimit;
    for (let i = 0; i < 9; i++) objSpawn(o, Math.random() < (o.fast || 0) ? 'runner' : 'minion');
  } else if (o.type === 'rift') {
    o.riftHpMax = o.riftHp;
    o.rift = makeRift(o.pos[0], o.pos[1]);
    for (let i = 0; i < 6; i++) objSpawn(o, Math.random() < (o.fast || 0) ? 'runner' : 'minion');
  } else if (o.type === 'horde') {
    o.mile = 100; o.spawnT = 0;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.28, r = 9 + Math.random() * 10;
      const e = spawnEnemy(Math.random() < (o.fast || 0) ? 'runner' : 'minion',
        Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, player.x + Math.cos(a) * r)),
        Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, player.z + Math.sin(a) * r)));
      e.obj = o;
    }
  } else {
    for (let i = 0; i < 10; i++) objSpawn(o, Math.random() < (o.fast || 0) ? 'runner' : 'minion');
  }
}
function completeObjective(o) {
  o.state = 'done';
  showToast(o.type === 'capture' ? '據點制壓！' : o.type === 'officer' ? '敵將全滅！'
    : o.type === 'defend' ? '魂燈守住了！' : o.type === 'trial' ? '試煉突破！'
    : o.type === 'rift' ? '裂口封印！' : '目標達成！');
  S.zone();
  if (o.type === 'capture') capturePoint.visible = false;
  if (o.lamp) {
    o.lamp.userData.orb.material.color.set(0x8fffbf);
    o.lamp.userData.glow.material.color.set(0x8fffbf);
  }
  if (o.rift) {
    spawnShockwave(o.pos[0], o.pos[1], { maxR: 12, dur: 0.6, color: 0xd040ff });
    spawnPillar(o.pos[0], o.pos[1], 0xd040ff, 1.4);
    scene.remove(o.rift);
    o.rift = null;
  }
  for (const m of [...enemies]) {
    if (m.obj === o && m.st !== 'dead') { m.noCount = true; killEnemy(m); }
  }
  spawnShockwave(o.pos[0], o.pos[1], { maxR: 10, dur: 0.5, color: 0x8fffbf });
}
function startBossPhase() {
  level.bossPhase = true;
  const cfg = STAGES[stageIdx];
  document.getElementById('bossname').textContent = cfg.bossLabel;
  hud.bosswrap.style.display = 'block';
  S.roar();
  level.boss = spawnEnemy(cfg.bossKind, cfg.bossPos[0], cfg.bossPos[1]);
  for (let i = 0; i < 8; i++) spawnEnemy('minion', cfg.bossPos[0] + (Math.random() * 2 - 1) * 10, cfg.bossPos[1] + (Math.random() * 2 - 1) * 10);
  showToast(cfg.bossLabel + ' 現身！');
  showDialog(STORY['s' + (stageIdx + 1) + 'boss'] || []);
}
function updateLevel(dt) {
  const alive = enemies.filter(e => e.st !== 'dead').length;
  if (level.bossPhase) {
    hud.objective.textContent = '擊破 ' + STAGES[stageIdx].bossLabel;
    hud.objective.classList.remove('go');
    if (level.boss) hud.bossfill.style.width = Math.max(0, level.boss.hp / level.boss.hpMax * 100) + '%';
    if (alive < 14 && Math.random() < 0.05) {
      const a = Math.random() * 6.28;
      spawnEnemy(Math.random() < 0.4 ? 'runner' : 'minion',
        Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, player.x + Math.cos(a) * 15)),
        Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, player.z + Math.sin(a) * 15)));
    }
    return;
  }
  let remaining = 0;
  let engaged = null;
  for (const o of level.objs) {
    if (o.state === 'done') continue;
    remaining++;
    const d = Math.hypot(player.x - o.pos[0], player.z - o.pos[1]);
    if (o.state === 'dormant' && (o.type === 'horde' || d < 20)) activateObjective(o);
    if (o.state !== 'active') continue;
    if (!engaged || d < Math.hypot(player.x - engaged.pos[0], player.z - engaged.pos[1])) engaged = o;
    const objAlive = enemies.filter(e => e.obj === o && e.st !== 'dead').length;
    if (o.type === 'kill') {
      if (o.spawned < o.need && objAlive < 16 && alive < 34 && Math.random() < 0.55) {
        objSpawn(o, Math.random() < (o.fast || 0) ? 'runner' : 'minion');
        o.spawned++;
      }
      if (o.ambush && !o.ambushDone && o.kills >= o.need * 0.5) {
        o.ambushDone = true;
        showToast('敵　襲　！');
        S.roar();
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * 6.28;
          const e = spawnEnemy(Math.random() < 0.5 ? 'runner' : 'minion',
            player.x + Math.cos(a) * 9, player.z + Math.sin(a) * 9);
          e.noCount = true;
        }
      }
      if (o.kills >= o.need) completeObjective(o);
    } else if (o.type === 'capture') {
      const inside = Math.hypot(player.x - o.pos[0], player.z - o.pos[1]) < 4 && player.y < 1;
      const contested = enemies.some(e => e.st !== 'dead' && e.st !== 'spawn' && Math.hypot(e.x - o.pos[0], e.z - o.pos[1]) < 5);
      if (inside) o.capT = Math.min(100, o.capT + dt * (contested ? 5 : 14));
      if (objAlive < 13 && alive < 34 && Math.random() < 0.42) objSpawn(o, Math.random() < (o.fast || 0) ? 'runner' : 'minion');
      if (o.capT >= 100) completeObjective(o);
    } else if (o.type === 'officer') {
      if (objAlive < 13 && alive < 34 && Math.random() < 0.38) objSpawn(o, Math.random() < (o.fast || 0) ? 'runner' : 'minion');
      if (o.officersLeft <= 0) completeObjective(o);
    } else if (o.type === 'defend') {
      o.defT += dt;
      if (objAlive < 12 && alive < 34 && Math.random() < 0.5) objSpawn(o, Math.random() < (o.fast || 0) ? 'runner' : 'minion');
      if (o.lamp) {
        const lk = 1 + Math.sin(worldT * 4) * 0.12;
        o.lamp.userData.glow.scale.set(3.2 * lk, 3.2 * lk, 1);
        const hpk = o.lampHp / o.lampMax;
        o.lamp.userData.orb.material.color.setHex(hpk > 0.5 ? 0xffd890 : hpk > 0.25 ? 0xffa060 : 0xff6050);
      }
      if (o.lampHp <= 0) {
        o.lampHp = o.lampMax; o.defT = 0;
        showToast('魂燈熄滅！重新點燃');
        S.roar();
        spawnShockwave(o.pos[0], o.pos[1], { maxR: 8, dur: 0.5, color: 0xff5a3a });
      }
      if (o.defT >= o.time) completeObjective(o);
    } else if (o.type === 'trial') {
      o.trialT -= dt;
      if (objAlive < 16 && alive < 34 && Math.random() < 0.6) objSpawn(o, Math.random() < (o.fast || 0) ? 'runner' : 'minion');
      if (o.kills >= o.need) completeObjective(o);
      else if (o.trialT <= 0) {
        o.kills = 0; o.trialT = o.tlimit;
        showToast('時限已至——試煉重置！');
        S.hurt();
      }
    } else if (o.type === 'rift') {
      if (o.rift) {
        o.rift.userData.outer.rotation.y += dt * 1.2;
        o.rift.userData.inner.rotation.y -= dt * 2;
        const rk = 1 + Math.sin(worldT * 5) * 0.1;
        o.rift.userData.outer.scale.setScalar(rk);
      }
      if (objAlive < 10 && alive < 34 && Math.random() < 0.35) objSpawn(o, Math.random() < (o.fast || 0) ? 'runner' : 'minion');
      if (o.riftHp <= 0) completeObjective(o);
    } else if (o.type === 'horde') {
      // 千人斬：貼著玩家高密度刷屍潮，殺越多敵人越強越快
      const cap = IS_MOBILE ? 24 : 40;
      const prog = Math.min(1, o.kills / o.need);   // 0→1 難度進度
      o.spawnT -= dt;
      if (o.spawnT <= 0 && alive < cap) {
        o.spawnT = Math.max(0.18, 0.35 - prog * 0.15);
        const n = Math.min(cap - alive, 3 + Math.floor(Math.random() * 3) + Math.floor(prog * 2));
        for (let k = 0; k < n; k++) {
          const roll = Math.random();
          const kind = roll < 0.04 + prog * 0.14 ? 'elite' : roll < (o.fast || 0) + prog * 0.4 ? 'runner' : 'minion';
          const a = Math.random() * 6.28, r = 11 + Math.random() * 9;
          const e = spawnEnemy(kind,
            Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, player.x + Math.cos(a) * r)),
            Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, player.z + Math.sin(a) * r)));
          e.obj = o;
          // 屍潮強化：滿千時 HP×2.2、速度+1.5、攻擊+80%
          e.hp = e.hpMax = e.kind.hp * (1 + prog * 1.2);
          e.spd += prog * 1.5;
          e.dmgMul = 1 + prog * 0.8;
        }
      }
      // 每百人斬里程碑：爆氣獎勵；每三百斬敵軍升級吼聲警示
      if (o.kills >= o.mile && o.mile <= 900) {
        const digits = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
        showToast(`${digits[Math.floor(o.mile / 100) - 1]}百人斬！`);
        if (o.mile % 300 === 0) S.roar();
        o.mile += 100;
        S.win();
        musou = Math.min(100, musou + 25);
        spawnShockwave(player.x, player.z, { maxR: 8, dur: 0.5, color: 0xffd84f });
      }
      if (o.kills >= o.need) completeObjective(o);
    }
  }
  // 目標提示
  if (engaged) {
    if (engaged.type === 'kill') hud.objective.textContent = `${engaged.name}　殲滅 ${Math.min(engaged.kills, engaged.need)}／${engaged.need}`;
    else if (engaged.type === 'capture') {
      const inside = Math.hypot(player.x - engaged.pos[0], player.z - engaged.pos[1]) < 4;
      const contested = enemies.some(e => e.st !== 'dead' && e.st !== 'spawn' && Math.hypot(e.x - engaged.pos[0], e.z - engaged.pos[1]) < 5);
      hud.objective.textContent = `${engaged.name}　制壓 ${Math.round(engaged.capT)}%${inside && contested ? '（拮抗中！）' : ''}`;
    }
    else if (engaged.type === 'defend') hud.objective.textContent = `${engaged.name}　守護 ${Math.max(0, Math.ceil(engaged.time - engaged.defT))}s ・ 魂燈 ${Math.max(0, Math.round(engaged.lampHp / engaged.lampMax * 100))}%`;
    else if (engaged.type === 'trial') hud.objective.textContent = `${engaged.name}　${Math.min(engaged.kills, engaged.need)}／${engaged.need} ・ 剩 ${Math.max(0, Math.ceil(engaged.trialT))}s`;
    else if (engaged.type === 'rift') hud.objective.textContent = `${engaged.name}　攻擊裂口！ ${Math.max(0, Math.round(engaged.riftHp / engaged.riftHpMax * 100))}%`;
    else if (engaged.type === 'horde') hud.objective.textContent = `千人斬　${Math.min(engaged.kills, engaged.need)}／${engaged.need}`;
    else hud.objective.textContent = `${engaged.name}　討伐敵將 ${engaged.officers - engaged.officersLeft}／${engaged.officers}`;
    hud.objective.classList.remove('go');
  } else {
    hud.objective.textContent = `剩餘目標 ${remaining}——依小地圖光點推進`;
    hud.objective.classList.add('go');
  }
  // 巡遊敵（地圖上的野生威脅）
  const roamers = enemies.filter(e => !e.obj && !e.kindName.startsWith('boss') && e.st !== 'dead').length;
  if (roamers < 12 && alive < 34 && Math.random() < 0.06) {
    const a = Math.random() * 6.28;
    const cx = Math.max(-MAP_HALF + 4, Math.min(MAP_HALF - 4, player.x + Math.cos(a) * (14 + Math.random() * 6)));
    const cz = Math.max(-MAP_HALF + 4, Math.min(MAP_HALF - 4, player.z + Math.sin(a) * (14 + Math.random() * 6)));
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      spawnEnemy(Math.random() < 0.3 ? 'runner' : 'minion',
        Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, cx + (Math.random() * 2 - 1) * 3)),
        Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, cz + (Math.random() * 2 - 1) * 3)));
    }
  }
  if (remaining === 0) startBossPhase();
}

function onBossDown() {
  S.win();
  state = 'win';
  runTime = (performance.now() - runStartT) / 1000;
  hud.bosswrap.style.display = 'none';
  for (const e of enemies) {
    if (e.st !== 'dead' && !e.kindName.startsWith('boss')) {
      e.st = 'dead'; e.deadT = 0;
      play(e.rig, 'Death_A', { once: true, ts: 1.3 });
    }
  }
  spawnShockwave(player.x, player.z, { maxR: 14, dur: 0.7 });
  shakeT = 0.4; shakeAmp = 0.5;
  if (player.rig) play(player.rig, 'win', { once: true, ts: 1 });
  const showWin = () => {
    const m = Math.floor(runTime / 60), s = Math.round(runTime % 60);
    let score = 0;
    if (player.hp >= 50) score++;
    if (runTime <= 480) score += 2; else if (runTime <= 660) score++;
    if (maxCombo >= 35) score++;
    const grade = score >= 3 ? 'S' : score === 2 ? 'A' : score === 1 ? 'B' : 'C';
    hud.grade.textContent = grade;
    const isLast = stageIdx >= STAGES.length - 1;
    document.getElementById('winTitle').textContent = isLast ? '魂門守住了' : '關卡突破！';
    document.getElementById('nextBtn').style.display = isLast ? 'none' : '';
    hud.winStats.textContent = `通關時間 ${m}:${String(s).padStart(2, '0')} · 擊殺 ${kills} · 最大連段 ${maxCombo} · 剩餘 HP ${Math.round(player.hp)}`
      + (isLast ? '' : '　｜　升級獎勵：體力上限 +30、攻擊力 +12%');
    hud.win.classList.remove('hidden');
  };
  setTimeout(() => {
    if (stageIdx >= STAGES.length - 1) showDialog(STORY.ending, showWin);
    else showWin();
  }, 1400);
}

// ---------- 鎖定武將（Tab / 手機「鎖」鍵） ----------
let lockTarget = null;
const lockMarker = (() => {
  const grp = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.1, 32),
    new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  const tri = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
  tri.rotation.x = Math.PI;
  grp.add(ring, tri);
  grp.visible = false;
  scene.add(grp);
  return grp;
})();
function lockRank(e) { return e.kindName.startsWith('boss') ? 0 : e.officer ? 1 : 2; }
function toggleLock() {
  const cands = enemies
    .filter(e => e.st !== 'dead' && e.st !== 'spawn'
      && (e.officer || e.kindName.startsWith('boss') || e.kindName === 'elite')
      && Math.hypot(e.x - player.x, e.z - player.z) < 32)
    .sort((a, b) => (lockRank(a) * 8 + Math.hypot(a.x - player.x, a.z - player.z))
                  - (lockRank(b) * 8 + Math.hypot(b.x - player.x, b.z - player.z)));
  if (!cands.length) { lockTarget = null; return; }
  if (!lockTarget || !cands.includes(lockTarget)) lockTarget = cands[0];
  else {
    const i = cands.indexOf(lockTarget);
    lockTarget = i >= cands.length - 1 ? null : cands[i + 1];   // 循環到底解除
  }
  if (lockTarget) {
    spawnSpark(new THREE.Vector3(lockTarget.x, 1.8 * lockTarget.kind.scale, lockTarget.z), 1.6, 0xff6050, { dur: 0.3 });
    if (AU.ctx) tone('square', midi(86), AU.ctx.currentTime, 0.09, 0.14, AU.sfx);
  } else if (AU.ctx) tone('square', midi(74), AU.ctx.currentTime, 0.09, 0.1, AU.sfx);
}
function updateLock() {
  if (lockTarget && (lockTarget.st === 'dead' || Math.hypot(lockTarget.x - player.x, lockTarget.z - player.z) > 40)) lockTarget = null;
  lockMarker.visible = !!lockTarget && state === 'play';
  if (lockTarget) {
    lockMarker.position.set(lockTarget.x, 0, lockTarget.z);
    lockMarker.children[1].position.y = 2.6 * lockTarget.kind.scale + Math.sin(worldT * 5) * 0.15;
    lockMarker.children[0].scale.setScalar(lockTarget.kind.scale * (1 + Math.sin(worldT * 6) * 0.08));
    lockMarker.rotation.y += 0.02;
  }
}

// ---------- 戰鬥 ----------
// 完美閃避 → 子彈時間（翻滾 i-frame 內吃到攻擊判定觸發）
let witchT = 0;
function triggerWitchTime() {
  if (witchT > 0) return;
  witchT = 1.6;
  screenFlash = Math.max(screenFlash, 0.3);
  showToast('完美閃避！');
  musou = Math.min(100, musou + 8);
  spawnShockwave(player.x, player.z, { maxR: 6, dur: 0.5, color: 0xc06aff });
  spawnSpark(new THREE.Vector3(player.x, 1.4, player.z), 2.6, 0xc06aff, { dur: 0.4 });
  if (AU.ctx) { const t = AU.ctx.currentTime; tone('sine', 880, t, 0.5, 0.2, AU.sfx, 220); }
}
function comboMul() { return 1 + Math.min(combo, 50) * 0.005; }   // 50 hits 封頂 +25%
function hitEnemy(e, dmg, kb, ux, uz, sparkScale = 1.4) {
  e.hp -= dmg * comboMul() * (1 + stageIdx * 0.12) * curChar.dmgMul;
  if (e.bar) drawOfficerBar(e);
  e.flash = 0.13;
  e.vx += ux * kb * e.kind.kbMul;
  e.vz += uz * kb * e.kind.kbMul;
  spawnSpark(new THREE.Vector3(e.x, 1.2, e.z), sparkScale * 1.25);
  if (player.st !== 'musou') musou = Math.min(100, musou + 0.5);
  if (dmg >= 2 || Math.random() < 0.4) spawnShockwave(e.x, e.z, { maxR: 1.3, dur: 0.16, color: 0xffffff });
  combo++; comboTimer = 2.2;
  if (combo > maxCombo) maxCombo = combo;
  if (combo > 0 && combo % 15 === 0) {   // 連段里程碑：紫色新星
    spawnSpark(new THREE.Vector3(player.x, 1.4, player.z), 3.4, 0xc06aff, { dur: 0.35 });
    spawnShockwave(player.x, player.z, { maxR: 5, dur: 0.4, color: 0xc06aff });
    if (AU.ctx) { const t = AU.ctx.currentTime; tone('triangle', midi(88 + Math.min(12, combo / 15)), t, 0.2, 0.18, AU.sfx); }
  }
  if (e.hp <= 0) killEnemy(e);
  else if (e.st !== 'attack' && e.st !== 'cast' && (e.kindName === 'minion' || e.kindName === 'runner')) {
    e.st = 'hit'; e.hitT = 0.3;
    play(e.rig, 'Hit_A', { once: true, ts: 1.6 });
  }
}
function meleeSweep(a) {
  const p = player;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const range = a.range * (curChar.rangeMul || 1);
  let hits = 0;
  for (const e of enemies) {
    if (e.st === 'dead' || e.st === 'spawn') continue;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > range + (e.kind.scale - 1)) continue;
    if (a.ang < 6) {
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (d > 1.0 && dot < Math.cos(a.ang / 2)) continue;
    }
    hits++;
    const kd = d || 1;
    hitEnemy(e, a.dmg * (a.mul || 1), a.kb, dx / kd, dz / kd, 1.2 + a.dmg * 0.25);
  }
  hits += damageRifts(p.x + fx * range * 0.6, p.z + fz * range * 0.6, range * 0.9, a.dmg * (a.mul || 1));
  if (hits > 0) {
    S.hit(hits, !!a.shake);
    hitStopT = Math.min(0.13, 0.045 + hits * 0.008 + (a.shake ? 0.035 : 0));
    shakeT = 0.18; shakeAmp = (a.shake || 0.12) + hits * 0.01;
  }
  return hits;
}
function applyPlayerHit(a) {
  if (a.bolt) {
    if (AU.ctx) { const t = AU.ctx.currentTime; tone('sawtooth', a.bolt.size > 1.2 ? 500 : 780, t, 0.14, 0.14, AU.sfx, 190); }
    const n = a.fan || 1;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 0.28;
      spawnBolt(a.bolt, Math.sin(player.yaw + off), Math.cos(player.yaw + off));
    }
    if (a.charged) {
      spawnShockwave(player.x, player.z, { maxR: 4, dur: 0.4, color: curChar.fx });
      screenFlash = Math.max(screenFlash, 0.3);
    }
    if (a.shake) { shakeT = 0.12; shakeAmp = 0.2; }
    return n;
  }
  S.slash();
  const hits = meleeSweep(a);
  spawnSlash(player.x, player.z, player.yaw, {
    ang: Math.min(a.ang, 6.3), outer: a.range, dir: a.dir,
    color: a.dmg > 1 ? curChar.fxHi : curChar.fx, dur: a.dmg > 1 ? 0.28 : 0.18,
  });
  if (a.shock) spawnShockwave(player.x, player.z, { maxR: a.range + 0.6 });
  if (a.slam) {
    // 跳壓地裂：追加地面裂波
    spawnShockwave(player.x, player.z, { maxR: a.range + 1.4, dur: 0.45 });
    spawnSpark(new THREE.Vector3(player.x, 0.6, player.z), 2.6, curChar.fx, { dur: 0.35 });
  }
  if (a.charged) {
    // 蓄力震地斬：光柱＋三重衝擊波＋閃白
    spawnPillar(player.x, player.z, 0xffd84f, 1.5);
    spawnShockwave(player.x, player.z, { maxR: a.range + 2.2, dur: 0.55, color: 0xffd84f });
    spawnShockwave(player.x, player.z, { maxR: a.range + 0.8, dur: 0.42, color: curChar.fx });
    spawnSpark(new THREE.Vector3(player.x, 1.2, player.z), 4, 0xffe8b0, { dur: 0.4 });
    screenFlash = Math.max(screenFlash, 0.45);
    S.boom();
  }
  return hits;
}
function damagePlayer(dmg, from) {
  S.hurt();
  musou = Math.min(100, musou + 5);
  const p = player;
  p.hp -= dmg;
  p.invuln = 0.8;
  combo = 0;
  shakeT = 0.25; shakeAmp = 0.3;
  spawnSpark(new THREE.Vector3(p.x, 1.3, p.z), 1.6, 0xff5a5a);
  const dx = p.x - from.x, dz = p.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  p.x += (dx / d) * 0.7; p.z += (dz / d) * 0.7;
  if (p.hp <= 0) {
    p.hp = 0; p.st = 'dead';
    play(p.rig, 'death', { once: true, ts: 1.1 });
    state = 'dead';
    setTimeout(() => {
      hud.deadStats.textContent = `${STAGES[stageIdx].name} · 目標 ${(level.objs || []).filter(o => o.state === 'done').length}／${(level.objs || []).length} · 擊殺 ${kills} · 最大連段 ${maxCombo}`;
      hud.dead.classList.remove('hidden');
    }, 900);
  } else if (dmg >= 10 && (p.st === 'idle' || p.st === 'run')) {
    // 只有重擊會打出硬直，小兵攻擊不打斷 Rumi 的動作
    play(p.rig, 'hurt', { once: true, ts: 1.5 });
    p.st = 'hurt'; p.hurtT = clipDur(p.rig, 'hurt', 1.5) * 0.8;
  }
}

// ---------- 玩家 ----------
const GRAV = 26, JUMP_V = 9.5;
function updatePlayer(dt) {
  const p = player;
  if (!p.root) return;
  p.rig.mixer.update(dt);
  if (p.st === 'dead' || state === 'win') { syncPlayer(); return; }
  p.invuln = Math.max(0, p.invuln - dt);

  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (touchMove.active) { mx = touchMove.mx; mz = touchMove.mz; }
  let ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }
  else if (ml > 0 && !touchMove.active) { mx /= ml; mz /= ml; ml = 1; }
  if (ml < 0.25) { mx = 0; mz = 0; ml = 0; }
  if (ml > 0) {
    // 鏡頭相對移動：W＝畫面前方
    const cfx = Math.sin(camYaw), cfz = Math.cos(camYaw);
    const wx = cfx * (-mz) + (-cfz) * mx;
    const wz = cfz * (-mz) + cfx * mx;
    mx = wx; mz = wz;
  }

  if (p.st === 'hurt') {
    p.hurtT -= dt;
    if (p.hurtT <= 0) { p.st = 'idle'; play(p.rig, 'idle'); }
  } else if (p.st === 'dodge') {
    p.dodgeT += dt;
    const k = Math.max(0.2, 1 - p.dodgeT / p.dodgeDur);
    p.x += p.dodgeDx * 10 * k * dt;
    p.z += p.dodgeDz * 10 * k * dt;
    if (p.dodgeT >= p.dodgeDur) { p.st = 'idle'; play(p.rig, 'idle'); }
  } else if (p.st === 'jump' || p.st === 'plunge') {
    if (ml > 0) {
      p.x += mx * p.spd * 0.85 * dt;
      p.z += mz * p.spd * 0.85 * dt;
      p.yaw += angDiff(p.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 8);
    }
    if (p.st === 'jump') {
      p.vy -= GRAV * dt;
      if (atkPressed) {
        atkPressed = false;
        p.st = 'plunge'; p.vy = -22;
        play(p.rig, 'slash4', { once: true, ts: 1.3, fade: 0.06 });
      }
    } else {
      p.vy = -22;
    }
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      if (p.st === 'plunge') {
        const hits = meleeSweep(PLUNGE);
        spawnShockwave(p.x, p.z, { maxR: PLUNGE.range + 0.8, dur: 0.4 });
        spawnSpark(new THREE.Vector3(p.x, 0.5, p.z), 2.6, 0xd9b4ff);
        shakeT = 0.25; shakeAmp = 0.5;
        if (hits === 0) hitStopT = 0.04;
      }
      p.st = 'idle';
      play(p.rig, 'idle', { fade: 0.14 });
    }
  } else if (p.st === 'musou') {
    p.musouT += dt;
    p.invuln = 0.5;
    if (ml > 0) {
      p.x += mx * 3.6 * dt;
      p.z += mz * 3.6 * dt;
      p.yaw += angDiff(p.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 5);
    }
    p.musouTick -= dt;
    if (p.musouTick <= 0) {
      p.musouTick = 0.2;
      for (const e of enemies) {
        if (e.st === 'dead' || e.st === 'spawn') continue;
        const dx = e.x - p.x, dz = e.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 7) { const kd = d || 1; hitEnemy(e, 3, 9, dx / kd, dz / kd, 1.7); }
      }
      damageRifts(p.x, p.z, 7, 3);
      spawnSlash(p.x, p.z, Math.random() * 6.28, { ang: 6.3, outer: 7, dir: Math.random() < 0.5 ? 1 : -1, color: [0xd07aff, 0xff7ac8, 0xffd84f][Math.floor(Math.random() * 3)], dur: 0.3 });
      spawnShockwave(p.x, p.z, { maxR: 7, dur: 0.32, color: 0xd07aff });
      spawnSpark(new THREE.Vector3(p.x + (Math.random() * 2 - 1) * 2, 1 + Math.random() * 2, p.z + (Math.random() * 2 - 1) * 2), 1.6, 0xffd84f, { dur: 0.3, rise: 3 });
      S.slash();
      shakeT = 0.15; shakeAmp = 0.3;
    }
    // 每 0.55 秒向八方射出劍氣
    p.musouBoltT = (p.musouBoltT || 0) - dt;
    if (p.musouBoltT <= 0) {
      p.musouBoltT = 0.55;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + p.musouT;
        spawnBolt({ dmg: 2, speed: 24, pierce: 3, size: 1.5 }, Math.sin(a), Math.cos(a));
      }
      spawnPillar(p.x, p.z, 0xffd84f, 0.8);
      if (AU.ctx) tone('sawtooth', 700, AU.ctx.currentTime, 0.12, 0.12, AU.sfx, 260);
    }
    if (p.musouT >= 4.0) {
      // 終結大爆發
      for (const e of enemies) {
        if (e.st === 'dead' || e.st === 'spawn') continue;
        const dx = e.x - p.x, dz = e.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 12) { const kd = d || 1; hitEnemy(e, 12, 30, dx / kd, dz / kd, 2.6); }
      }
      damageRifts(p.x, p.z, 12, 12);
      spawnShockwave(p.x, p.z, { maxR: 13, dur: 0.7, color: 0xffd84f });
      spawnShockwave(p.x, p.z, { maxR: 10, dur: 0.6, color: 0xff7ac8 });
      spawnShockwave(p.x, p.z, { maxR: 7, dur: 0.5, color: 0xffffff });
      spawnPillar(p.x, p.z, 0xffe8b0, 2.2);
      spawnSpark(new THREE.Vector3(p.x, 2, p.z), 8, 0xffe8b0, { dur: 0.55 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        spawnBolt({ dmg: 3, speed: 27, pierce: 99, size: 1.8 }, Math.sin(a), Math.cos(a));
      }
      screenFlash = 1;
      S.boom(); S.roar(); S.win();
      hitStopT = 0.2; shakeT = 0.7; shakeAmp = 1.0;
      p.st = 'idle';
      play(p.rig, 'idle', { fade: 0.2 });
    }
  } else if (p.st === 'charge') {
    // 蓄力：按住重攻擊 0.5s 進入滿蓄，放開釋放
    p.chargeT += dt;
    if (ml > 0) {
      p.x += mx * 2.4 * dt;
      p.z += mz * 2.4 * dt;
      p.yaw += angDiff(p.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 6);
    }
    p.chargeFx -= dt;
    if (p.chargeFx <= 0) {
      p.chargeFx = 0.08;
      const full = p.chargeT >= 0.5;
      spawnSpark(new THREE.Vector3(p.x + (Math.random() * 2 - 1) * 0.9, 0.3 + Math.random() * 1.7, p.z + (Math.random() * 2 - 1) * 0.9),
        full ? 1.1 : 0.6, full ? 0xffd84f : curChar.fx, { dur: 0.25, rise: 2.2 });
    }
    if (p.chargeT >= 0.5 && !p.chargeCue) {
      p.chargeCue = true;
      spawnShockwave(p.x, p.z, { maxR: 2.6, dur: 0.3, color: 0xffd84f });
      if (AU.ctx) tone('triangle', midi(90), AU.ctx.currentTime, 0.16, 0.2, AU.sfx);
    }
    if (!heavyHold || p.chargeT > 1.25) {
      const full = p.chargeT >= 0.5;
      p.chargeCue = false;
      const mv = curMoves();
      if (weapon === 'melee') startAttack(full ? mv.charge : (ml > 0 ? mv.dash : mv.heavySolo), -1, mx, mz, ml);
      else startAttack(full ? mv.rcharge : mv.rheavy, -1, mx, mz, ml);
    }
  } else if (p.st === 'atk') {
    const a = p.curAtk;
    p.atkT += dt;
    const k = Math.max(0, 1 - p.atkT / (p.atkDur * 0.6));
    p.x += Math.sin(p.yaw) * (a.dash || 4.6) * k * dt;
    p.z += Math.cos(p.yaw) * (a.dash || 4.6) * k * dt;
    if (a.dash && Math.random() < 0.6) spawnSpark(new THREE.Vector3(p.x, 0.9 + Math.random() * 0.6, p.z), 0.9, curChar.fx, { dur: 0.2 });
    if (ml > 0) p.yaw += angDiff(p.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 4);
    if (!p.didHit && p.atkT >= p.atkDur * a.hitAt) { p.didHit = true; applyPlayerHit(a); }
    if (musouPressed && musou >= 100) { musouPressed = false; startMusou(); return; }
    if (atkPressed) { p.queuedLight = true; atkPressed = false; }
    if (heavyPressed) { p.queuedHeavy = true; heavyPressed = false; }
    if (dodgePressed && p.didHit) { dodgePressed = false; startDodge(mx, mz, ml); }
    else if (p.atkT >= p.atkDur * 0.5 && p.queuedHeavy) {
      const mv = curMoves();
      startAttack(weapon === 'melee' ? (p.atkStage >= 1 ? mv.heavyFinish : mv.heavySolo) : mv.rheavy, -1, mx, mz, ml);
    } else if (p.atkT >= p.atkDur * 0.5 && p.queuedLight && p.atkStage >= 0) {
      const lt = curLight();
      startAttack(lt[(p.atkStage + 1) % lt.length], (p.atkStage + 1) % lt.length, mx, mz, ml);
    } else if (p.atkT >= p.atkDur * 0.86) {
      p.st = 'idle';
      play(p.rig, ml > 0 ? 'run' : 'idle', { ts: ml > 0 ? 1.15 : 1 });
    }
  } else {
    if (ml > 0) {
      p.x += mx * p.spd * dt;
      p.z += mz * p.spd * dt;
      p.yaw += angDiff(p.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 12);
      if (p.st !== 'run') { p.st = 'run'; play(p.rig, 'run', { ts: 1.15 }); }
    } else if (p.st !== 'idle') { p.st = 'idle'; play(p.rig, 'idle'); }
    if (musouPressed && musou >= 100) { musouPressed = false; startMusou(); }
    else if (atkPressed) { atkPressed = false; startAttack(curLight()[0], 0, mx, mz, ml); }
    else if (heavyPressed) {
      heavyPressed = false;
      p.st = 'charge'; p.chargeT = 0; p.chargeFx = 0; p.chargeCue = false;
      play(p.rig, ml > 0 ? 'run' : 'idle', { ts: ml > 0 ? 0.7 : 0.6 });
    }
    else if (jumpPressed) {
      jumpPressed = false;
      p.st = 'jump'; p.vy = JUMP_V;
      S.jump();
      play(p.rig, 'jump', { once: true, ts: 1.15, fade: 0.06 });
    }
    else if (dodgePressed) { dodgePressed = false; startDodge(mx, mz, ml); }
  }
  atkPressed = heavyPressed = jumpPressed = dodgePressed = musouPressed = false;

  collideCircle(p, 0.55);
  syncPlayer();

  for (let i = drops.length - 1; i >= 0; i--) {
    const dr = drops[i];
    if (Math.hypot(dr.position.x - p.x, dr.position.z - p.z) < 1.3) {
      p.hp = Math.min(p.hpMax, p.hp + 14);
      S.pickup();
      spawnSpark(new THREE.Vector3(p.x, 1.2, p.z), 1.4, 0x8fffbf);
      scene.remove(dr); drops.splice(i, 1);
    }
  }
}
function syncPlayer() {
  const p = player;
  p.root.position.set(p.x, p.y, p.z);
  p.root.rotation.y = p.yaw + MODEL_YAW;
  p.shadow.position.set(p.x, 0.04, p.z);
  const sk = 1 / (1 + p.y * 0.18);
  p.shadow.scale.setScalar(sk);
  heroLight.position.set(p.x, p.y + 2.2, p.z + 0.5);
}
function startAttack(a, stage, mx, mz, ml) {
  const p = player;
  if (lockTarget && lockTarget.st !== 'dead') p.yaw = Math.atan2(lockTarget.x - p.x, lockTarget.z - p.z);
  else if (ml > 0) p.yaw = Math.atan2(mx, mz);
  p.st = 'atk'; p.curAtk = a; p.atkStage = stage;
  p.atkT = 0; p.didHit = false; p.queuedLight = false; p.queuedHeavy = false;
  const ts = a.ts * (curChar.atkTs || 1);   // 角色武器：重刃慢、短刃快
  p.atkDur = clipDur(p.rig, a.clip, ts);
  play(p.rig, a.clip, { once: true, ts, fade: 0.07 });
}
function startMusou() {
  const p = player;
  p.st = 'musou'; p.musouT = 0; p.musouTick = 0; p.musouBoltT = 0.3;
  p.invuln = 4.4;
  musou = 0;
  play(p.rig, 'heavyfin', { ts: 1.75 });
  spawnPillar(p.x, p.z, 0xffd84f, 1.8);
  spawnShockwave(p.x, p.z, { maxR: 8, dur: 0.55, color: 0xffd84f });
  spawnShockwave(p.x, p.z, { maxR: 5, dur: 0.4, color: 0xffffff });
  spawnSpark(new THREE.Vector3(p.x, 1.5, p.z), 5, 0xffd84f, { dur: 0.45 });
  screenFlash = 0.7;
  if (AU.ctx) {
    const t = AU.ctx.currentTime;
    tone('sawtooth', 160, t, 0.7, 0.32, AU.sfx, 1100);
    S.roar();
  }
  showToastMini?.('魂門亂舞！');
  hitStopT = 0.22; shakeT = 0.4; shakeAmp = 0.6;
}
function startDodge(mx, mz, ml) {
  const p = player;
  if (ml > 0) { p.dodgeDx = mx; p.dodgeDz = mz; p.yaw = Math.atan2(mx, mz); }
  else { p.dodgeDx = Math.sin(p.yaw); p.dodgeDz = Math.cos(p.yaw); }
  p.st = 'dodge'; p.dodgeT = 0;
  S.roll();
  p.dodgeDur = Math.min(0.55, clipDur(p.rig, 'roll', 1.9));
  p.invuln = Math.max(p.invuln, 0.45);
  play(p.rig, 'roll', { once: true, ts: 1.9, fade: 0.06 });
}

// ---------- 特效更新 ----------
function updateFx(dt) {
  comboTimer -= dt;
  if (comboTimer <= 0) combo = 0;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.userData.t += dt;
    const k = s.userData.t / s.userData.dur;
    if (k >= 1) { scene.remove(s); s.material.dispose(); sparks.splice(i, 1); continue; }
    s.scale.setScalar((0.4 + k * 1.8) * s.userData.scale);
    s.material.opacity = 1 - k;
    if (s.userData.rise) s.position.y += s.userData.rise * dt;
  }
  for (let i = slashes.length - 1; i >= 0; i--) {
    const m = slashes[i];
    m.userData.t += dt;
    const k = m.userData.t / m.userData.dur;
    if (k >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); slashes.splice(i, 1); continue; }
    m.rotation.y += m.userData.dir * dt * 6;
    m.material.opacity = 0.85 * (1 - k);
    const s = 1 + k * 0.25;
    m.scale.set(s, 1, s);
  }
  for (let i = pillars.length - 1; i >= 0; i--) {
    const m = pillars[i];
    m.userData.t += dt;
    const k = m.userData.t / m.userData.dur;
    if (k >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); pillars.splice(i, 1); continue; }
    m.scale.set(1 + k * 1.6, 1, 1 + k * 1.6);
    m.material.opacity = 0.7 * (1 - k);
    m.rotation.y += dt * 3;
  }
  if (screenFlash > 0) {
    screenFlash = Math.max(0, screenFlash - dt * 2.6);
    if (flashEl) flashEl.style.opacity = (screenFlash * 0.85).toFixed(2);
  }
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const m = shockwaves[i];
    m.userData.t += dt;
    const k = m.userData.t / m.userData.dur;
    if (k >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); shockwaves.splice(i, 1); continue; }
    const r = 1 + k * m.userData.maxR;
    m.scale.set(r, r, 1);
    m.material.opacity = 0.9 * (1 - k);
  }
  updateBolts(dt);
  for (const dr of drops) {
    dr.userData.t += dt;
    dr.position.y = 0.8 + Math.sin(dr.userData.t * 3) * 0.15;
    dr.rotation.y += dt * 2.5;
  }
}

// ---------- 環境動態 ----------
function updateAmbient(dt) {
  worldT += dt;
  honmoon.rotation.z += dt * 0.15;
  honmoon.children[1].rotation.z -= dt * 0.4;
  const pos = embers.pos;
  for (let i = 0; i < embers.N; i++) {
    pos[i * 3 + 1] += dt * (0.25 + (i % 5) * 0.1);
    pos[i * 3] += Math.sin(worldT * 0.6 + i) * dt * 0.15;
    if (pos[i * 3 + 1] > 9) pos[i * 3 + 1] = 0;
  }
  embers.pts.geometry.attributes.position.needsUpdate = true;
  if (world3.visible) {
    for (const cl of w3anim.clouds) {
      cl.m.position.x = cl.x0 + Math.sin(worldT * 0.15 + cl.phase) * 3;
    }
    for (const l of w3anim.lanterns) {
      l.m.position.y = l.base + Math.sin(worldT * 1.1 + l.phase) * 0.4;
    }
    for (const s of w3anim.shafts) {
      s.m.material.opacity = 0.07 + (Math.sin(worldT * 0.7 + s.phase) + 1) * 0.03;
    }
  }
  if (world4.visible) {
    for (const sh of w4anim.shards) {
      sh.m.position.y = sh.base + Math.sin(worldT * 1.4 + sh.phase) * 0.5;
      sh.m.rotation.y += dt * 1.2;
      sh.m.rotation.x += dt * 0.6;
    }
    for (const r of w4anim.rings) {
      r.m.rotation.z += r.sp * dt;
    }
  }
  if (world2.visible) {
    for (const f of w2anim.flames) {
      f.m.position.y = f.base + Math.sin(worldT * 2.2 + f.phase) * 0.35;
      const k = 1 + Math.sin(worldT * 9 + f.phase * 3) * 0.22;
      f.m.scale.set(f.sz * k, f.sz * k * 1.25, 1);
    }
    for (const r of w2anim.rocks) {
      r.m.position.y += Math.sin(worldT * r.speed + r.phase) * 0.004;
      r.m.rotation.y += 0.0008;
    }
  }
  // 雨
  const rp = rain.pos;
  for (let i = 0; i < rain.N; i++) {
    rp[i * 3 + 1] -= 24 * dt;
    if (rp[i * 3 + 1] < 0) {
      rp[i * 3 + 1] = 13 + Math.random() * 2;
      rp[i * 3] = player.x + (Math.random() * 2 - 1) * 30;
      rp[i * 3 + 2] = player.z + (Math.random() * 2 - 1) * 38 - 4;
    }
  }
  rain.pts.geometry.attributes.position.needsUpdate = true;
  // 魂門旋渦
  if (honmoon.userData.swirl) honmoon.userData.swirl.rotation.z -= dt * 1.3;
  // 招牌閃爍
  for (const f of flickers) {
    const t = worldT * f.speed + f.phase;
    const v = Math.sin(t * 7) * Math.sin(t * 13 + 1.7);
    const k = v > 0.9 ? 0.3 : 1;
    if (f.base) f.mat.color.copy(f.base).multiplyScalar(k);
    else f.mat.color.setScalar(k);
  }
  if (capturePoint.visible) {
    const k = 1 + Math.sin(worldT * 3) * 0.06;
    capturePoint.scale.set(k, 1, k);
    capturePoint.rotation.y += dt * 0.8;
    capturePoint.children[0].material.opacity = 0.6 + Math.sin(worldT * 5) * 0.25;
  }
  // 氣滿光環
  heroAura.visible = state === 'play' && musou >= 100 && player.st !== 'dead';
  if (heroAura.visible) {
    heroAura.position.set(player.x, player.y + 0.02, player.z);
    heroAura.rotation.y += dt * 2;
    const ak = 1 + Math.sin(worldT * 6) * 0.12;
    heroAura.children[0].scale.set(ak, ak, 1);
  }
  // 陰影相機跟著玩家
  sun.position.set(player.x + 8, 18, player.z + 6);
  sun.target.position.set(player.x, 0, player.z);
  sun.target.updateMatrixWorld();
}

// ---------- 鏡頭（真三式：貼背低角度、隨朝向旋轉） ----------
let camYaw = Math.PI;
const camPos = { x: 0, z: 0 };
function updateCamera(dt) {
  const p = player;
  // 鏡頭緩慢轉到玩家背後（移動中轉快、靜止轉慢）；鎖定中則朝向鎖定目標
  const ease = p.st === 'run' || p.st === 'dodge' ? 2.2 : 0.9;
  const wantYaw = lockTarget && lockTarget.st !== 'dead' ? Math.atan2(lockTarget.x - p.x, lockTarget.z - p.z) : p.yaw;
  camYaw += angDiff(camYaw, wantYaw) * Math.min(1, dt * (lockTarget ? 3 : ease));
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  camPos.x = p.x - fx * 6.5;
  camPos.z = p.z - fz * 6.5;
  collideCircle(camPos, 0.7);   // 鏡頭不穿進建築
  const want = new THREE.Vector3(camPos.x, 3.4 + p.y * 0.5, camPos.z);
  camera.position.lerp(want, Math.min(1, dt * 6));
  let ox = 0, oy = 0;
  if (shakeT > 0) {
    shakeT -= dt;
    ox = (Math.random() * 2 - 1) * shakeAmp;
    oy = (Math.random() * 2 - 1) * shakeAmp;
  }
  camera.position.x += ox; camera.position.y += oy;
  camera.lookAt(p.x + fx * 2.7, 1.95 + p.y * 0.6, p.z + fz * 2.7);
}

// ---------- 小地圖（方形戰場） ----------
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');
function drawMinimap() {
  const W2 = mmCanvas.width, H2 = mmCanvas.height;
  const mx = x => (x + MAP_HALF) / (MAP_HALF * 2) * (W2 - 8) + 4;
  const mz = z => (z + MAP_HALF) / (MAP_HALF * 2) * (H2 - 8) + 4;
  mmCtx.clearRect(0, 0, W2, H2);
  mmCtx.fillStyle = 'rgba(60,50,110,0.3)';
  mmCtx.fillRect(4, 4, W2 - 8, H2 - 8);
  mmCtx.fillStyle = 'rgba(140,130,190,0.35)';
  for (const b of OBSTACLES) {
    mmCtx.fillRect(mx(b.x - b.hx), mz(b.z - b.hz), (b.hx * 2) / (MAP_HALF * 2) * (W2 - 8), (b.hz * 2) / (MAP_HALF * 2) * (H2 - 8));
  }
  for (const o of (level.objs || [])) {
    const px = mx(o.pos[0]), pz = mz(o.pos[1]);
    if (o.state === 'done') {
      mmCtx.fillStyle = 'rgba(80,255,160,0.9)';
      mmCtx.fillRect(px - 2.5, pz - 2.5, 5, 5);
    } else {
      const pulse = 3.5 + Math.sin(worldT * 5) * 1.5;
      mmCtx.strokeStyle = o.state === 'active' ? '#ffd84f' : 'rgba(200,180,255,0.8)';
      mmCtx.lineWidth = o.state === 'active' ? 2 : 1.2;
      mmCtx.beginPath();
      mmCtx.arc(px, pz, o.state === 'active' ? pulse + 2 : 4, 0, 6.28);
      mmCtx.stroke();
    }
  }
  if (level.bossPhase && level.boss && level.boss.st !== 'dead') {
    mmCtx.fillStyle = '#ff2050';
    mmCtx.fillRect(mx(level.boss.x) - 3.5, mz(level.boss.z) - 3.5, 7, 7);
  }
  for (const e of enemies) {
    if (e.st === 'dead' || e.kindName.startsWith('boss')) continue;
    if (e.officer) {
      mmCtx.fillStyle = '#ffb056';
      mmCtx.fillRect(mx(e.x) - 2, mz(e.z) - 2, 4.5, 4.5);
    } else {
      mmCtx.fillStyle = 'rgba(255,90,90,0.85)';
      mmCtx.fillRect(mx(e.x) - 1, mz(e.z) - 1, 2.2, 2.2);
    }
  }
  mmCtx.fillStyle = '#ffffff';
  mmCtx.save();
  mmCtx.translate(mx(player.x), mz(player.z));
  mmCtx.rotate(Math.atan2(Math.sin(player.yaw), -Math.cos(player.yaw)) + Math.PI);
  mmCtx.beginPath();
  mmCtx.moveTo(0, -4.5); mmCtx.lineTo(3.2, 3.2); mmCtx.lineTo(-3.2, 3.2);
  mmCtx.closePath(); mmCtx.fill();
  mmCtx.restore();
}

// ---------- HUD ----------
let lastCombo = -1, lastKills = -1, lastHp = -1, lastMusou = -1;
const musouBarEl = document.getElementById('musoubar');
const musouFillEl = document.getElementById('musoufill');
const btnUEl = document.getElementById('btnU');
function updateHUD() {
  if (state === 'play') drawMinimap();
  if (player.hp !== lastHp) { lastHp = player.hp; hud.hp.style.width = (player.hp / player.hpMax * 100) + '%'; }
  if (musou !== lastMusou) {
    lastMusou = musou;
    musouFillEl.style.width = musou + '%';
    musouBarEl.classList.toggle('full', musou >= 100);
    btnUEl?.classList.toggle('ready', musou >= 100);
  }
  if (kills !== lastKills) { lastKills = kills; hud.kills.textContent = `擊殺 ${kills}`; }
  if (combo !== lastCombo) {
    lastCombo = combo;
    if (combo >= 3) {
      const pct = Math.round((comboMul() - 1) * 100);
      hud.combo.textContent = `${combo} HITS${pct > 0 ? ` ⚡+${pct}%` : ''}`;
      hud.combo.style.opacity = 1;
      hud.combo.classList.toggle('hot', combo >= 30);
    } else hud.combo.style.opacity = 0;
  }
}

// ---------- 劇情對話 ----------
const dlg = { queue: [], active: false, onDone: null };
const dlgBox = document.getElementById('dialog');
function showDialog(lines, onDone) {
  dlg.queue = [...lines];
  dlg.onDone = onDone || null;
  dlg.active = true;
  nextDialog(true);
}
function nextDialog(first = false) {
  if (!first && !dlg.active) return;
  const line = dlg.queue.shift();
  if (!line) {
    dlg.active = false;
    dlgBox.style.display = 'none';
    const cb = dlg.onDone; dlg.onDone = null;
    if (cb) cb();
    return;
  }
  const [who, text] = line;
  const nameEl = document.getElementById('dlgName');
  nameEl.textContent = who === 'RUMI' ? curChar.name : who;
  nameEl.classList.toggle('enemy', who !== 'RUMI');
  document.getElementById('dlgText').textContent = text;
  dlgBox.style.display = 'block';
  if (AU.ctx) tone('triangle', midi(81), AU.ctx.currentTime, 0.06, 0.08, AU.sfx);
}
dlgBox.addEventListener('pointerdown', e => { e.stopPropagation(); nextDialog(); });
const STORY = {
  s1open: [
    ['RUMI', '魂門出現裂縫了……整條街都是陰差。數不完的陰差。'],
    ['RUMI', '那就全部斬掉。今晚的目標——千人斬！'],
  ],
  s1boss: [
    ['陰差隊長', '渺小的獵魔士……魂門將為吾等而開！'],
    ['RUMI', '守門是我的工作。你，回地府重新排隊。'],
  ],
  s2open: [
    ['RUMI', '穿過裂縫……這裡是黃泉的花海。彼岸花開得像一片火。'],
    ['RUMI', '渡口的魂燈還亮著——別讓陰差把它們吹熄。'],
  ],
  s2boss: [
    ['陰差大隊長', '吾乃陰差大隊長！汝之魂，今夜歸吾！'],
    ['RUMI', '……來取啊。'],
  ],
  s3open: [
    ['RUMI', '雲海之上……天界以「試煉」迎接闖入者。'],
    ['RUMI', '時限之內斬出答案——這就是獵魔士的回答。'],
  ],
  s3boss: [
    ['陰差王', '獵魔士……汝竟踏入天界。此地，即汝之墓。'],
    ['RUMI', '墓誌銘我幫你想好了——「敗給了 HUNTR/X」。'],
  ],
  s4open: [
    ['RUMI', '虛空……魂門的心臟在跳動，裂口不斷湧出陰差。'],
    ['RUMI', '封印所有裂口，直搗核心。最後一戰。'],
  ],
  s4boss: [
    ['魂門之靈', '吾即是門，吾即是界。汝斬不斷「界」本身。'],
    ['RUMI', '界不界的我不懂——我只知道，你擋路了。'],
  ],
  ending: [
    ['RUMI', '魂門，守住了。'],
    ['RUMI', '但裂縫的另一端……還有更深的東西在看著我們。'],
    ['RUMI', '下次，三個人一起來。'],
  ],
};

// ---------- 流程 ----------
function applyStageTint(i) {
  world1.visible = i === 0;
  world2.visible = i === 1;
  world3.visible = i === 2;
  world4.visible = i === 3;
  if (i === 3) {
    // 虛空：星雲魂門之心
    if (skyMat && skyTex4) { skyMat.map = skyTex4; skyMat.needsUpdate = true; skyMat.color.set(0xffffff); }
    scene.fog.color.set(0x090616);
    scene.fog.near = 24; scene.fog.far = 95;
    hemi.color.set(0x8a9aff); hemi.groundColor.set(0x101030); hemi.intensity = 0.9;
    sun.color.set(0xaac8ff); sun.intensity = 1.1;
    warmFill.color.set(0x40e0ff); warmFill.intensity = 0.4;
    honmoon.children[0].material.color.set(0x40e0ff);
    honmoon.children[1].material.color.set(0xd040ff);
    rain.pts.visible = false;
    embers.pts.material.color.set(0x80e8ff);
    embers.pts.material.size = 0.18;
    heroLight.color.set(0x9ad8ff);
    return;
  }
  if (i === 2) {
    if (skyMat && skyTex3) { skyMat.map = skyTex3; skyMat.needsUpdate = true; skyMat.color.set(0xffffff); }
    scene.fog.color.set(0x1a2c4c);
    scene.fog.near = 30; scene.fog.far = 115;
    hemi.color.set(0xc0d4f0); hemi.groundColor.set(0x48608a); hemi.intensity = 0.9;
    sun.color.set(0xfff0d0); sun.intensity = 1.05;
    warmFill.color.set(0xffd070); warmFill.intensity = 0.4;
    honmoon.children[0].material.color.set(0xffd84f);
    honmoon.children[1].material.color.set(0x4fd8ff);
    rain.pts.visible = false;
    embers.pts.material.color.set(0xbfe8ff);
    embers.pts.material.size = 0.14;
    heroLight.color.set(0xffe0b0);
    return;
  }
  if (i === 1) {
    // 黃泉花海：暮金天空、彼岸花田、魂燈——明亮溫暖
    if (skyMat && skyTex2) { skyMat.map = skyTex2; skyMat.needsUpdate = true; }
    scene.fog.color.set(0x6a4a5a);
    scene.fog.near = 28; scene.fog.far = 105;
    hemi.color.set(0xffd8b0); hemi.groundColor.set(0x5a4048); hemi.intensity = 1.15;
    sun.color.set(0xffc890); sun.intensity = 1.3;
    warmFill.color.set(0xff8a50); warmFill.intensity = 0.45;
    if (skyMat) skyMat.color.set(0xffffff);
    honmoon.children[0].material.color.set(0xff7a50);
    honmoon.children[1].material.color.set(0xffd84f);
    rain.pts.visible = false;
    embers.pts.material.color.set(0xffc880);
    embers.pts.material.size = 0.2;
    heroLight.color.set(0xffc080);
  } else {
    if (skyMat && skyTex1) { skyMat.map = skyTex1; skyMat.needsUpdate = true; }
    scene.fog.color.set(0x140f28);
    scene.fog.near = 26; scene.fog.far = 100;
    hemi.color.set(0x9a8aff); hemi.groundColor.set(0x241540); hemi.intensity = 1.25;
    sun.color.set(0xbfcaff); sun.intensity = 1.35;
    warmFill.color.set(0xff4fd0); warmFill.intensity = 0.35;
    if (skyMat) skyMat.color.set(0xffffff);
    honmoon.children[0].material.color.set(0xa04fff);
    honmoon.children[1].material.color.set(0xff4fa3);
    for (const m of ENV.signs) m.color.setScalar(1);
    for (const m of ENV.fronts) m.color.setScalar(1);
    for (const m of ENV.wins) m.color.setScalar(1);
    for (const m of ENV.tentGlows) m.color.set(0xffa8d8);
    rain.pts.visible = true;
    embers.pts.material.color.set(0xff7ad0);
    embers.pts.material.size = 0.17;
    heroLight.color.set(0xff4fa3);
  }
}
function loadStage(i) {
  stageIdx = i;
  // 切換本關的碰撞/遮擋佈局（小地圖跟著換）
  OBSTACLES = OBSTACLES_BY_STAGE[Math.min(i, OBSTACLES_BY_STAGE.length - 1)];
  blockersReg = blockersRegBy[Math.min(i, blockersRegBy.length - 1)];
  applyStageTint(i);
  for (const e of enemies) { scene.remove(e.root); scene.remove(e.shadow); e.rig.mixer.stopAllAction(); }
  enemies.length = 0;
  for (const dr of drops) scene.remove(dr);
  drops.length = 0;
  for (const b of bolts) scene.remove(b.spr);
  bolts.length = 0;
  for (const pr of level.props) scene.remove(pr);
  level.props = [];
  const cfg = STAGES[i];
  level.objs = cfg.objectives.map(o => ({ ...o, state: 'dormant', kills: 0, spawned: 0, capT: 0, officersLeft: o.officers || 0, ambushDone: false, defT: 0, lampHp: 0, lampMax: 1, trialT: 0, riftHpMax: o.riftHp || 1 }));
  level.bossPhase = false;
  level.boss = null;
  const capObj = level.objs.find(o => o.type === 'capture');
  if (capObj) {
    capturePoint.position.x = capObj.pos[0];
    capturePoint.position.z = capObj.pos[1];
    capturePoint.visible = true;
  } else capturePoint.visible = false;
  musou = 0;
  lockTarget = null;
  if (AU.ctx) { AU.nextBar = AU.ctx.currentTime + 0.15; AU.bar = 0; }
  hud.bosswrap.style.display = 'none';
  const p = player;
  p.x = 0; p.y = 0; p.z = 36; p.vy = 0; p.yaw = Math.PI;
  camYaw = Math.PI;
  // 過關升級：體力上限＋攻擊力成長（角色體力係數）
  p.hpMax = Math.round((100 + i * 30) * curChar.hpMul);
  p.hp = p.hpMax;
  p.invuln = 0; p.st = 'idle';
  if (p.rig) play(p.rig, 'idle', { fade: 0 });
  state = 'play';
  runStartT = performance.now();
  showToast(STAGES[i].name);
  showDialog(i === 0 ? STORY.s1open : i === 1 ? STORY.s2open : i === 2 ? STORY.s3open : STORY.s4open);
}
function start() {
  initAudio();
  hud.title.classList.add('hidden');
  kills = 0; combo = 0; maxCombo = 0;
  loadStage(0);
}
function restart() {
  initAudio();
  hud.dead.classList.add('hidden');
  hud.win.classList.add('hidden');
  kills = 0; combo = 0; maxCombo = 0;
  loadStage(stageIdx);
}

// 開發用 debug hook
window.__dbg = () => ({ state, stageIdx, weapon, musou, kills, combo, objs: (level.objs || []).map(o => o.state), bossPhase: level.bossPhase, bossHp: level.boss?.hp, player, enemies: enemies.length, alive: enemies.filter(e => e.st !== 'dead').length });
window.__lvl = level;
window.__occ = updateOcclusion;
window.__stage = loadStage;
window.__switch = switchWeapon;
window.__E = enemies;
window.__P = player;
window.__warp = k => {   // 測試用：完成前 k 個目標
  for (let i = 0; i < Math.min(k, level.objs.length); i++) {
    if (level.objs[i].state !== 'done') completeObjective(level.objs[i]);
  }
};
window.__gl = { renderer, composer, scene, camera };
window.__cap = (mode = 'composer') => {
  updateCamera(0.016);
  if (mode === 'direct') renderer.render(scene, camera);
  else composer.render();
  const c2 = document.createElement('canvas');
  c2.width = 120; c2.height = 68;
  const g = c2.getContext('2d');
  g.drawImage(renderer.domElement, 0, 0, 120, 68);
  const d = g.getImageData(0, 0, 120, 68).data;
  let sum = 0, mx = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += l; if (l > mx) mx = l;
  }
  return { avg: +(sum / (d.length / 4)).toFixed(1), max: mx };
};
window.__key = (code, downMs = 60) => {
  dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })), downMs);
};

// ---------- 主迴圈 ----------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const raw = Math.min(clock.getDelta(), 0.05);
  let dt = raw;
  if (hitStopT > 0) { hitStopT -= raw; dt = raw * 0.06; }

  witchT = Math.max(0, witchT - raw);
  if (dlg.active && state === 'play') {
    if (player.root) player.rig.mixer.update(raw);
  } else if (state === 'play' || state === 'dead' || state === 'win') {
    updatePlayer(dt);
    updateEnemies(witchT > 0 ? dt * 0.22 : dt);   // 子彈時間：敵人慢動作
    if (state === 'play') updateLevel(dt);
    updateFx(dt);
  } else if (player.root) {
    player.rig.mixer.update(raw);
    player.root.rotation.y += raw * 0.4;
  }
  updateAmbient(raw);
  updateLock();
  updateCamera(raw);
  updateOcclusion();
  updateTrail();
  updateHUD();
  composer.render();
}
loop();
