// HUNTR/X：魂門之戰 — Stage 1「首爾夜市・魂門裂縫」
// 3D 無雙式關卡：四區推進＋Boss 陰差隊長
// 資產：KayKit Character Packs（CC0，見 assets/LICENSE-*.txt）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MODEL_YAW = Math.PI;        // KayKit 模型原生面向 -Z，統一補 180°
const HALF_W = 13.5;              // 街道可走半寬
const NEON = [0xff4fa3, 0x4fd8ff, 0xffd84f, 0xa04fff, 0x4fff9e, 0xff6a4f];

// 關卡分區（沿 -Z 推進）
const ZONES = [
  { name: '夜市街口',  enterZ: 0,    boundZ: -45,  need: 10, cap: 7,  elites: 0 },
  { name: '夜市主街',  enterZ: -45,  boundZ: -90,  need: 22, cap: 13, elites: 0 },
  { name: '十字路口',  enterZ: -90,  boundZ: -135, need: 12, cap: 8,  elites: 2 },
  { name: '魂門裂縫',  enterZ: -135, boundZ: -172, boss: true },
];

// ---------- 基本場景 ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0a1c, 30, 110);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.5, 0.62));
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// 燈光
scene.add(new THREE.HemisphereLight(0x9aa0ff, 0x30204a, 1.75));
const sun = new THREE.DirectionalLight(0xd8c8ff, 1.9);
sun.position.set(6, 12, 4);
scene.add(sun);
const rimLight = new THREE.DirectionalLight(0x4fd8ff, 0.7);
rimLight.position.set(-8, 6, -10);
scene.add(rimLight);
const heroLight = new THREE.PointLight(0xff4fa3, 1.4, 9, 1.6);
scene.add(heroLight);

// ---------- 天空 ----------
(function buildSky() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#05050f');
  grad.addColorStop(0.55, '#12102e');
  grad.addColorStop(0.8, '#2a1650');
  grad.addColorStop(1, '#3a1a5e');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 320; i++) {
    const y = Math.random() * 360;
    const a = 0.25 + Math.random() * 0.75;
    g.fillStyle = `rgba(255,255,255,${a * (1 - y / 420)})`;
    const s = Math.random() < 0.06 ? 2 : 1;
    g.fillRect(Math.random() * 1024, y, s, s);
  }
  const mx = 660, my = 100;
  const mg = g.createRadialGradient(mx, my, 8, mx, my, 60);
  mg.addColorStop(0, 'rgba(255,240,220,1)');
  mg.addColorStop(0.25, 'rgba(255,220,240,0.55)');
  mg.addColorStop(1, 'rgba(255,200,255,0)');
  g.fillStyle = mg;
  g.beginPath(); g.arc(mx, my, 60, 0, 6.28); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(210, 32, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
  );
  sky.position.set(0, 0, -85);
  scene.add(sky);
})();

// ---------- 街道兩側城市剪影 ----------
(function buildSkyline() {
  const makeWindowTex = hue => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#0c0c1e'; g.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 122; y += 10) {
      for (let x = 6; x < 58; x += 10) {
        if (Math.random() < 0.42) {
          g.fillStyle = Math.random() < 0.75 ? `hsl(${hue},80%,70%)` : '#fff2cc';
          g.fillRect(x, y, 5, 6);
        }
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const mats = [46, 190, 285].map(h => new THREE.MeshBasicMaterial({ map: makeWindowTex(h) }));
  let i = 0;
  for (const side of [-1, 1]) {
    for (let z = 15; z > -195; z -= 9 + Math.random() * 5) {
      const w = 5 + Math.random() * 8;
      const h = 9 + Math.random() * 26;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mats[i++ % 3]);
      b.position.set(side * (27 + Math.random() * 18), h / 2 - 0.5, z);
      scene.add(b);
    }
  }
  // 終點後方一排高樓
  for (let x = -60; x <= 60; x += 12) {
    const h = 16 + Math.random() * 22;
    const b = new THREE.Mesh(new THREE.BoxGeometry(9, h, 9), mats[i++ % 3]);
    b.position.set(x, h / 2, -200 - Math.random() * 10);
    scene.add(b);
  }
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
  honmoon.add(ring, ring2, disc);
  honmoon.position.set(0, 15, -186);
  scene.add(honmoon);
})();

// ---------- 街道 ----------
(function buildStreet() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1b3e'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120,120,220,0.16)'; g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120,120,220,0.07)';
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 34);
  tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 240), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -85;
  scene.add(ground);

  // 兩側攤位＋霓虹招牌
  const stallMat = new THREE.MeshLambertMaterial({ color: 0x2a2a52 });
  const roofMats = NEON.map(col => new THREE.MeshLambertMaterial({ color: col }));
  let i = 0;
  for (const side of [-1, 1]) {
    for (let z = -5; z > -168; z -= 8.5) {
      if (ZONES.some(zn => Math.abs(z - zn.boundZ) < 4)) continue;   // 讓開拱門位置
      const stall = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.6, 3.2), stallMat);
      stall.position.set(side * 16.6, 1.3, z);
      scene.add(stall);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.3, 3.6), roofMats[i % NEON.length]);
      roof.position.set(side * 16.6, 2.85, z);
      scene.add(roof);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 0.85),
        new THREE.MeshBasicMaterial({ color: NEON[i % NEON.length] })
      );
      sign.position.set(side * 14.9, 2.1, z);
      sign.rotation.y = side * -Math.PI / 2;
      scene.add(sign);
      i++;
    }
  }
  // 路燈
  for (const side of [-1, 1]) {
    for (let z = -14; z > -165; z -= 22) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 6), stallMat);
      pole.position.set(side * 12.6, 2.3, z);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe8b0 }));
      lamp.position.set(side * 12.6, 4.7, z);
      scene.add(lamp);
    }
  }
})();

// ---------- 區界拱門＋光牆 ----------
const barriers = [];
(function buildGates() {
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x221838 });
  for (let zi = 0; zi < ZONES.length; zi++) {
    const z = ZONES[zi].boundZ;
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7.6, 0.9), pillarMat);
      p.position.set(side * 14.2, 3.8, z);
      scene.add(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 0.5), pillarMat);
    bar.position.set(0, 7.6, z);
    scene.add(bar);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(30, 0.14, 0.56), new THREE.MeshBasicMaterial({ color: 0xa04fff }));
    trim.position.set(0, 7.35, z);
    scene.add(trim);
    // 光牆（未肅清前擋路；最終區直通魂門，不放牆）
    if (zi === ZONES.length - 1) { barriers.push({ wall: null, open: false }); continue; }
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(28.5, 6.1),
      new THREE.MeshBasicMaterial({ color: 0x8a3fff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    wall.position.set(0, 3.05, z);
    scene.add(wall);
    barriers.push({ wall, open: false, fade: 0 });
  }
})();

// ---------- 環境浮塵 ----------
const embers = (() => {
  const N = 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 20;
    pos[i * 3 + 1] = Math.random() * 9;
    pos[i * 3 + 2] = 8 - Math.random() * 190;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xb07aff, size: 0.14, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(pts);
  return { pts, pos, N };
})();

// ---------- 共用貼圖／工具 ----------
const gradTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
function toonify(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const conv = m => {
      if (m.name === 'Glow') return new THREE.MeshBasicMaterial({ color: 0xff3a6a, name: 'Glow' });
      return new THREE.MeshToonMaterial({ map: m.map || null, color: m.color.clone(), gradientMap: gradTex, name: m.name });
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
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
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
const sparks = [];
function spawnSpark(pos, scale = 1, color = 0xffffff) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sparkTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.position.copy(pos);
  s.scale.setScalar(0.4 * scale);
  s.userData = { t: 0, dur: 0.22, scale };
  scene.add(s);
  sparks.push(s);
}
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
  const m = new THREE.Mesh(makeFanGeo(0.7, outer, ang), new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  m.position.set(x, 1.15, z);
  m.rotation.y = yaw;
  m.userData = { t: 0, dur, dir };
  scene.add(m);
  slashes.push(m);
}
// 補血心（掉落物）
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

// ---------- 輸入 ----------
const keys = new Set();
let atkPressed = false, heavyPressed = false, jumpPressed = false, dodgePressed = false;
addEventListener('keydown', e => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyJ' || e.code === 'KeyZ') atkPressed = true;
  if (e.code === 'KeyK' || e.code === 'KeyX') heavyPressed = true;
  if (e.code === 'Space') jumpPressed = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyL') dodgePressed = true;
  if (e.code === 'KeyR' && state === 'dead') restart();
  if (state === 'title' && ready && (e.code === 'Enter' || e.code === 'KeyJ')) start();
});
addEventListener('keyup', e => keys.delete(e.code));

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
el('startBtn').addEventListener('click', () => ready && start());
el('retryBtn').addEventListener('click', () => restart());
el('againBtn').addEventListener('click', () => restart());
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
let worldT = 0, runStartT = 0, runTime = 0;

// 關卡進度
const level = { zi: 0, phase: 'fight', zoneKills: 0, spawned: 0, boss: null };

// 攻擊表（Rumi／Knight，1H 劍）
const LIGHT = [
  { clip: '1H_Melee_Attack_Slice_Horizontal', ts: 1.7,  range: 2.9, ang: 2.6, dmg: 1, kb: 7,  hitAt: 0.38, dir: 1 },
  { clip: '1H_Melee_Attack_Slice_Diagonal',   ts: 1.7,  range: 2.9, ang: 2.6, dmg: 1, kb: 7,  hitAt: 0.38, dir: -1 },
  { clip: '1H_Melee_Attack_Chop',             ts: 1.6,  range: 3.0, ang: 2.2, dmg: 1, kb: 9,  hitAt: 0.40, dir: 1 },
  { clip: '1H_Melee_Attack_Stab',             ts: 1.55, range: 3.4, ang: 1.5, dmg: 2, kb: 12, hitAt: 0.40, dir: 1, shake: 0.3 },
];
const HEAVY_SOLO   = { clip: '2H_Melee_Attack_Chop', ts: 1.35, range: 3.3, ang: 2.5, dmg: 3, kb: 13, hitAt: 0.44, dir: 1,  shake: 0.45 };
const HEAVY_FINISH = { clip: '2H_Melee_Attack_Spin', ts: 1.4,  range: 3.7, ang: 6.3, dmg: 2, kb: 15, hitAt: 0.45, dir: 1,  shake: 0.55 };
const PLUNGE       = { range: 4.0, ang: 6.3, dmg: 2, kb: 14, shake: 0.6 };

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

// 敵種
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
  boss: {
    file: 'warrior', scale: 1.6, hp: 70, spdBase: 2.7, spdVar: 0, dmg: 14,
    atkRange: 3.2, hitRange: 3.6, atkTs: 0.85, kbMul: 0.12, shadowR: 1.5,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick'],
    dropRate: 0,
  },
};

// ---------- 載入 ----------
const loader = new GLTFLoader();
Promise.all([
  loader.loadAsync('assets/Knight.glb'),
  loader.loadAsync('assets/Skeleton_Minion.glb'),
  loader.loadAsync('assets/Skeleton_Warrior.glb'),
]).then(([knight, minion, warrior]) => {
  const hide = new Set(['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '2H_Sword', 'Knight_Helmet']);
  knight.scene.traverse(o => { if (hide.has(o.name)) o.visible = false; });
  toonify(knight.scene);
  knight.scene.traverse(o => {
    if (o.isMesh && o.name === '1H_Sword') {
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(0x7a2fff);
      o.material.emissiveIntensity = 1.4;
    }
  });
  player.root = knight.scene;
  scene.add(player.root);
  player.rig = makeRig(player.root, knight.animations, [
    'Idle', 'Running_A', 'Dodge_Forward', 'Hit_A', 'Death_A', 'Cheer',
    'Jump_Start', 'Jump_Idle', 'Jump_Land',
    ...LIGHT.map(c => c.clip), HEAVY_SOLO.clip, HEAVY_FINISH.clip,
  ]);
  play(player.rig, 'Idle');
  player.shadow = makeBlobShadow(1.1);

  toonify(minion.scene);
  toonify(warrior.scene);
  assets = {
    minion: { scene: minion.scene, clips: minion.animations },
    warrior: { scene: warrior.scene, clips: warrior.animations },
  };
  ready = true;
  hud.load.textContent = '載入完成';
}).catch(err => {
  hud.load.textContent = '載入失敗：' + err.message;
  console.error(err);
});

// ---------- 敵人 ----------
const E_ANIMS = [
  'Spawn_Ground', 'Running_A', 'Hit_A', 'Death_A', 'Idle',
  'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B', 'Unarmed_Melee_Attack_Kick',
  'Spellcast_Long', 'Spellcast_Summon', 'Taunt',
];
const MAX_ATTACKERS = 2;

function spawnEnemy(kindName, fx, fz) {
  const kind = KINDS[kindName];
  const zone = ZONES[level.zi];
  let x, z;
  if (fx !== undefined) { x = fx; z = fz; }
  else {
    for (let tries = 0; tries < 12; tries++) {
      x = (Math.random() * 2 - 1) * (HALF_W - 1.5);
      z = Math.max(zone.boundZ + 3, Math.min(zone.enterZ - 2, player.z - 6 - Math.random() * 20));
      if (Math.hypot(x - player.x, z - player.z) > 5) break;
    }
  }
  const src = assets[kind.file];
  const root = SkeletonUtils.clone(src.scene);
  const mats = [];
  root.traverse(o => {
    if (o.isMesh) {
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.push(m);
    }
  });
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

function killEnemy(e) {
  e.st = 'dead'; e.deadT = 0;
  play(e.rig, 'Death_A', { once: true, ts: 1.3 });
  kills++;
  spawnSpark(new THREE.Vector3(e.x, 1.0, e.z), e.kindName === 'boss' ? 4 : 2.2, 0xa04fff);
  if (!ZONES[level.zi].boss || e.kindName === 'boss') level.zoneKills++;
  if (Math.random() < e.kind.dropRate) spawnDrop(e.x, e.z);
  if (e.kindName === 'boss') onBossDown();
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

    const dx = p.x - e.x, dz = p.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const targetYaw = Math.atan2(dx, dz);
    const isBoss = e.kindName === 'boss';

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
        if (e.summonCd <= 0 && enemies.filter(x => x.kindName === 'minion' && x.st !== 'dead').length < 6) {
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
        if (d < e.kind.hitRange && p.y < 1.2 && p.invuln <= 0 && p.st !== 'dead') damagePlayer(e.kind.dmg, e);
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
        spawnSpark(new THREE.Vector3(e.x, 1.5, e.z), 3.5, 0xff3a5a);
        spawnShockwave(e.x, e.z, { maxR: 7, dur: 0.3, color: 0xff5a7a });
        shakeT = 0.3; shakeAmp = 0.4;
        if (d < 6.5 && p.y < 1.6 && p.invuln <= 0 && p.st !== 'dead') damagePlayer(16, e);
      }
      if (e.castKind === 'summon' && !e.hitAppl && e.castT >= e.castDur * 0.6) {
        e.hitAppl = true;
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * 6.28, r = 3 + Math.random() * 2;
          spawnEnemy('minion',
            Math.max(-HALF_W + 1, Math.min(HALF_W - 1, e.x + Math.cos(a) * r)),
            Math.max(ZONES[level.zi].boundZ + 2, e.z + Math.sin(a) * r));
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
    e.x = Math.max(-HALF_W + 0.8, Math.min(HALF_W - 0.8, e.x));
    e.z = Math.max(ZONES[level.zi].boundZ + 1, Math.min(1.5, e.z));
  }
  // 彼此分開
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
  // 套用與清理
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.root.position.x = e.x; e.root.position.z = e.z;
    e.root.rotation.y = e.yaw + MODEL_YAW;
    e.shadow.position.set(e.x, 0.02, e.z);
    e.shadow.material.opacity = e.st === 'dead' ? Math.max(0, 1 - e.deadT) : 1;
    if (e.st === 'dead' && e.deadT > 1.5) {
      scene.remove(e.root); scene.remove(e.shadow);
      e.rig.mixer.stopAllAction();
      enemies.splice(i, 1);
    }
  }
}

// ---------- 關卡進度 ----------
function startZone(zi) {
  level.zi = zi;
  level.phase = 'fight';
  level.zoneKills = 0;
  level.spawned = 0;
  const zone = ZONES[zi];
  showToast(zone.name);
  if (zone.boss) {
    hud.bosswrap.style.display = 'block';
    level.boss = spawnEnemy('boss', 0, zone.enterZ - 22);
    for (let i = 0; i < 3; i++) spawnEnemy('minion');
  } else {
    const elites = zone.elites || 0;
    for (let i = 0; i < elites; i++) { spawnEnemy('elite'); level.spawned++; }
    const first = Math.min(zone.cap - elites, zone.need - elites, 6);
    for (let i = 0; i < first; i++) { spawnEnemy('minion'); level.spawned++; }
  }
}

function updateLevel(dt) {
  const zone = ZONES[level.zi];
  const alive = enemies.filter(e => e.st !== 'dead').length;
  if (level.phase === 'fight') {
    if (zone.boss) {
      hud.objective.textContent = '擊破 陰差隊長';
      if (level.boss) hud.bossfill.style.width = Math.max(0, level.boss.hp / level.boss.hpMax * 100) + '%';
    } else {
      hud.objective.textContent = `肅清區域 ${Math.min(level.zoneKills, zone.need)}／${zone.need}`;
      hud.objective.classList.remove('go');
      // 補怪（有上限，不無限刷）
      if (level.spawned < zone.need && alive < zone.cap && Math.random() < 0.3) {
        spawnEnemy('minion'); level.spawned++;
      }
      if (level.zoneKills >= zone.need && alive === 0) {
        level.phase = 'advance';
        barriers[level.zi].open = true;
        showToast('區域肅清！');
      }
    }
  } else if (level.phase === 'advance') {
    hud.objective.textContent = '▲ 前進';
    hud.objective.classList.add('go');
    const next = ZONES[level.zi + 1];
    if (next && player.z < next.enterZ - 4) startZone(level.zi + 1);
  }
  // 光牆淡出
  for (const b of barriers) {
    if (b.open && b.wall && b.wall.material.opacity > 0) {
      b.wall.material.opacity = Math.max(0, b.wall.material.opacity - dt * 0.5);
      if (b.wall.material.opacity === 0) b.wall.visible = false;
    }
  }
}

function playerMinZ() {
  const zone = ZONES[level.zi];
  if (level.phase === 'advance') {
    const next = ZONES[level.zi + 1];
    return next ? next.boundZ + 1 : zone.boundZ + 1;
  }
  return zone.boundZ + 1;
}

function onBossDown() {
  state = 'win';
  runTime = (performance.now() - runStartT) / 1000;
  hud.bosswrap.style.display = 'none';
  // 清場演出
  for (const e of enemies) {
    if (e.st !== 'dead' && e.kindName !== 'boss') {
      e.st = 'dead'; e.deadT = 0;
      play(e.rig, 'Death_A', { once: true, ts: 1.3 });
    }
  }
  spawnShockwave(player.x, player.z, { maxR: 14, dur: 0.7 });
  shakeT = 0.4; shakeAmp = 0.5;
  if (player.rig) play(player.rig, 'Cheer', { once: true, ts: 1 });
  setTimeout(() => {
    const m = Math.floor(runTime / 60), s = Math.round(runTime % 60);
    let score = 0;
    if (player.hp >= 50) score++;
    if (runTime <= 330) score += 2; else if (runTime <= 450) score++;
    if (maxCombo >= 35) score++;
    const grade = score >= 3 ? 'S' : score === 2 ? 'A' : score === 1 ? 'B' : 'C';
    hud.grade.textContent = grade;
    hud.winStats.textContent = `通關時間 ${m}:${String(s).padStart(2, '0')} · 擊殺 ${kills} · 最大連段 ${maxCombo} · 剩餘 HP ${Math.round(player.hp)}`;
    hud.win.classList.remove('hidden');
  }, 1400);
}

// ---------- 戰鬥 ----------
function meleeSweep(a) {
  const p = player;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  let hits = 0;
  for (const e of enemies) {
    if (e.st === 'dead' || e.st === 'spawn') continue;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > a.range + (e.kind.scale - 1)) continue;
    if (a.ang < 6) {
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (d > 1.0 && dot < Math.cos(a.ang / 2)) continue;
    }
    hits++;
    e.hp -= a.dmg;
    e.flash = 0.13;
    const kd = d || 1;
    e.vx += (dx / kd) * a.kb * e.kind.kbMul;
    e.vz += (dz / kd) * a.kb * e.kind.kbMul;
    spawnSpark(new THREE.Vector3(e.x, 1.2, e.z), 1.2 + a.dmg * 0.25);
    combo++; comboTimer = 2.2;
    if (combo > maxCombo) maxCombo = combo;
    if (e.hp <= 0) killEnemy(e);
    else if (e.st !== 'attack' && e.st !== 'cast' && e.kindName === 'minion') {
      e.st = 'hit'; e.hitT = 0.3;
      play(e.rig, 'Hit_A', { once: true, ts: 1.6 });
    }
  }
  if (hits > 0) {
    hitStopT = Math.min(0.13, 0.045 + hits * 0.008 + (a.shake ? 0.035 : 0));
    shakeT = 0.18; shakeAmp = (a.shake || 0.12) + hits * 0.01;
  }
  return hits;
}
function applyPlayerHit(a) {
  const hits = meleeSweep(a);
  spawnSlash(player.x, player.z, player.yaw, {
    ang: Math.min(a.ang, 6.3), outer: a.range, dir: a.dir,
    color: a.dmg > 1 ? 0xd9b4ff : 0xc9a4ff, dur: a.dmg > 1 ? 0.28 : 0.18,
  });
  if (a === HEAVY_SOLO || a === HEAVY_FINISH) spawnShockwave(player.x, player.z, { maxR: a.range + 0.6 });
  return hits;
}
function damagePlayer(dmg, from) {
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
    play(p.rig, 'Death_A', { once: true, ts: 1.1 });
    state = 'dead';
    setTimeout(() => {
      hud.deadStats.textContent = `推進到 ${ZONES[level.zi].name} · 擊殺 ${kills} · 最大連段 ${maxCombo}`;
      hud.dead.classList.remove('hidden');
    }, 900);
  } else if (dmg >= 10 && (p.st === 'idle' || p.st === 'run')) {
    // 只有重擊會打出硬直，小兵攻擊不打斷 Rumi 的動作
    play(p.rig, 'Hit_A', { once: true, ts: 1.6 });
    p.st = 'hurt'; p.hurtT = clipDur(p.rig, 'Hit_A', 1.6) * 0.8;
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
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }

  if (p.st === 'hurt') {
    p.hurtT -= dt;
    if (p.hurtT <= 0) { p.st = 'idle'; play(p.rig, 'Idle'); }
  } else if (p.st === 'dodge') {
    p.dodgeT += dt;
    const k = Math.max(0.2, 1 - p.dodgeT / p.dodgeDur);
    p.x += p.dodgeDx * 10 * k * dt;
    p.z += p.dodgeDz * 10 * k * dt;
    if (p.dodgeT >= p.dodgeDur) { p.st = 'idle'; play(p.rig, 'Idle'); }
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
        play(p.rig, '1H_Melee_Attack_Chop', { once: true, ts: 1.2, fade: 0.06 });
      } else if (p.vy < 0 && p.rig.current === p.rig.actions['Jump_Start']) {
        play(p.rig, 'Jump_Idle', { ts: 1 });
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
      play(p.rig, 'Jump_Land', { once: true, ts: 1.8, fade: 0.06 });
      setTimeout(() => { if (p.st === 'idle') play(p.rig, 'Idle', { fade: 0.15 }); }, 220);
    }
  } else if (p.st === 'atk') {
    const a = p.curAtk;
    p.atkT += dt;
    const k = Math.max(0, 1 - p.atkT / (p.atkDur * 0.6));
    p.x += Math.sin(p.yaw) * 3.5 * k * dt;
    p.z += Math.cos(p.yaw) * 3.5 * k * dt;
    if (ml > 0) p.yaw += angDiff(p.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 4);
    if (!p.didHit && p.atkT >= p.atkDur * a.hitAt) { p.didHit = true; applyPlayerHit(a); }
    if (atkPressed) { p.queuedLight = true; atkPressed = false; }
    if (heavyPressed) { p.queuedHeavy = true; heavyPressed = false; }
    if (dodgePressed && p.didHit) { dodgePressed = false; startDodge(mx, mz, ml); }
    else if (p.atkT >= p.atkDur * 0.58 && p.queuedHeavy) {
      startAttack(p.atkStage >= 1 ? HEAVY_FINISH : HEAVY_SOLO, -1, mx, mz, ml);
    } else if (p.atkT >= p.atkDur * 0.58 && p.queuedLight && p.atkStage >= 0 && p.atkStage < 3) {
      startAttack(LIGHT[p.atkStage + 1], p.atkStage + 1, mx, mz, ml);
    } else if (p.atkT >= p.atkDur * 0.92) {
      p.st = 'idle';
      play(p.rig, ml > 0 ? 'Running_A' : 'Idle', { ts: ml > 0 ? 1.3 : 1 });
    }
  } else {
    if (ml > 0) {
      p.x += mx * p.spd * dt;
      p.z += mz * p.spd * dt;
      p.yaw += angDiff(p.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 12);
      if (p.st !== 'run') { p.st = 'run'; play(p.rig, 'Running_A', { ts: 1.3 }); }
    } else if (p.st !== 'idle') { p.st = 'idle'; play(p.rig, 'Idle'); }
    if (atkPressed) { atkPressed = false; startAttack(LIGHT[0], 0, mx, mz, ml); }
    else if (heavyPressed) { heavyPressed = false; startAttack(HEAVY_SOLO, -1, mx, mz, ml); }
    else if (jumpPressed) {
      jumpPressed = false;
      p.st = 'jump'; p.vy = JUMP_V;
      play(p.rig, 'Jump_Start', { once: true, ts: 1.4, fade: 0.06 });
    }
    else if (dodgePressed) { dodgePressed = false; startDodge(mx, mz, ml); }
  }
  atkPressed = heavyPressed = jumpPressed = dodgePressed = false;

  p.x = Math.max(-HALF_W, Math.min(HALF_W, p.x));
  p.z = Math.max(playerMinZ(), Math.min(1.5, p.z));
  syncPlayer();

  // 撿補血心
  for (let i = drops.length - 1; i >= 0; i--) {
    const dr = drops[i];
    if (Math.hypot(dr.position.x - p.x, dr.position.z - p.z) < 1.3) {
      p.hp = Math.min(p.hpMax, p.hp + 14);
      spawnSpark(new THREE.Vector3(p.x, 1.2, p.z), 1.4, 0x8fffbf);
      scene.remove(dr); drops.splice(i, 1);
    }
  }
}
function syncPlayer() {
  const p = player;
  p.root.position.set(p.x, p.y, p.z);
  p.root.rotation.y = p.yaw + MODEL_YAW;
  p.shadow.position.set(p.x, 0.02, p.z);
  const sk = 1 / (1 + p.y * 0.18);
  p.shadow.scale.setScalar(sk);
  heroLight.position.set(p.x, p.y + 2.2, p.z + 0.5);
}
function startAttack(a, stage, mx, mz, ml) {
  const p = player;
  if (ml > 0) p.yaw = Math.atan2(mx, mz);
  p.st = 'atk'; p.curAtk = a; p.atkStage = stage;
  p.atkT = 0; p.didHit = false; p.queuedLight = false; p.queuedHeavy = false;
  p.atkDur = clipDur(p.rig, a.clip, a.ts);
  play(p.rig, a.clip, { once: true, ts: a.ts, fade: 0.07 });
}
function startDodge(mx, mz, ml) {
  const p = player;
  if (ml > 0) { p.dodgeDx = mx; p.dodgeDz = mz; p.yaw = Math.atan2(mx, mz); }
  else { p.dodgeDx = Math.sin(p.yaw); p.dodgeDz = Math.cos(p.yaw); }
  p.st = 'dodge'; p.dodgeT = 0;
  p.dodgeDur = clipDur(p.rig, 'Dodge_Forward', 1.6);
  p.invuln = Math.max(p.invuln, 0.45);
  play(p.rig, 'Dodge_Forward', { once: true, ts: 1.6, fade: 0.06 });
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
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const m = shockwaves[i];
    m.userData.t += dt;
    const k = m.userData.t / m.userData.dur;
    if (k >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); shockwaves.splice(i, 1); continue; }
    const r = 1 + k * m.userData.maxR;
    m.scale.set(r, r, 1);
    m.material.opacity = 0.9 * (1 - k);
  }
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
}

// ---------- 鏡頭 ----------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const p = player;
  camTarget.set(p.x * 0.7, 0, p.z);
  const want = new THREE.Vector3(p.x * 0.7, 10.5, p.z + 13.2);
  camera.position.lerp(want, Math.min(1, dt * 5));
  let ox = 0, oy = 0;
  if (shakeT > 0) {
    shakeT -= dt;
    ox = (Math.random() * 2 - 1) * shakeAmp;
    oy = (Math.random() * 2 - 1) * shakeAmp;
  }
  camera.position.x += ox; camera.position.y += oy;
  camera.lookAt(camTarget.x, 1.5, camTarget.z - 4);
}

// ---------- HUD ----------
let lastCombo = -1, lastKills = -1, lastHp = -1;
function updateHUD() {
  if (player.hp !== lastHp) { lastHp = player.hp; hud.hp.style.width = (player.hp / player.hpMax * 100) + '%'; }
  if (kills !== lastKills) { lastKills = kills; hud.kills.textContent = `擊殺 ${kills}`; }
  if (combo !== lastCombo) {
    lastCombo = combo;
    if (combo >= 3) {
      hud.combo.textContent = `${combo} HITS`;
      hud.combo.style.opacity = 1;
      hud.combo.classList.toggle('hot', combo >= 30);
    } else hud.combo.style.opacity = 0;
  }
}

// ---------- 流程 ----------
function start() {
  hud.title.classList.add('hidden');
  state = 'play';
  runStartT = performance.now();
  startZone(0);
}
function restart() {
  hud.dead.classList.add('hidden');
  hud.win.classList.add('hidden');
  hud.bosswrap.style.display = 'none';
  for (const e of enemies) { scene.remove(e.root); scene.remove(e.shadow); e.rig.mixer.stopAllAction(); }
  enemies.length = 0;
  for (const dr of drops) scene.remove(dr);
  drops.length = 0;
  for (const b of barriers) {
    b.open = false;
    if (b.wall) { b.wall.visible = true; b.wall.material.opacity = 0.32; }
  }
  const p = player;
  p.x = 0; p.y = 0; p.z = 0; p.vy = 0; p.yaw = Math.PI;
  p.hp = p.hpMax; p.invuln = 0; p.st = 'idle';
  play(p.rig, 'Idle', { fade: 0 });
  kills = 0; combo = 0; maxCombo = 0;
  level.boss = null;
  state = 'play';
  runStartT = performance.now();
  startZone(0);
}

// 開發用 debug hook
window.__dbg = () => ({ state, kills, combo, level: { zi: level.zi, phase: level.phase, zoneKills: level.zoneKills, spawned: level.spawned, bossHp: level.boss?.hp }, player, enemies: enemies.length, alive: enemies.filter(e => e.st !== 'dead').length });
window.__lvl = level;
window.__E = enemies;
window.__P = player;
window.__warp = zi => {   // 測試用：跳區
  for (const e of enemies) { scene.remove(e.root); scene.remove(e.shadow); e.rig.mixer.stopAllAction(); }
  enemies.length = 0;
  for (let i = 0; i < zi; i++) barriers[i].open = true;
  player.x = 0; player.z = ZONES[zi].enterZ - 6;
  startZone(zi);
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

  if (state === 'play' || state === 'dead' || state === 'win') {
    updatePlayer(dt);
    updateEnemies(dt);
    if (state === 'play') updateLevel(dt);
    updateFx(dt);
  } else if (player.root) {
    player.rig.mixer.update(raw);
    player.root.rotation.y += raw * 0.4;
  }
  updateAmbient(raw);
  updateCamera(raw);
  updateHUD();
  composer.render();
}
loop();
