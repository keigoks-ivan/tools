// 特效測試台：沿用正式的 World 與 Post，在街道上觸發各種特效。
//   ?fx=explosion3&every=3   自動每 3 秒觸發一次（名稱見 NAMES）
//   ?amb=1                   開啟城市煙柱與火點
//   ?x=&y=&z=&yaw=&pitch=    鏡頭；?dist= 特效離鏡頭的距離（預設 90）
//   ?q=0|1|2                 畫質；?hud=0 隱藏資訊框
//   鍵盤：1 爆炸1　2 爆炸2　3 爆炸3　4 玩家光束　5 敵方光束　6 曳光彈　7 飛彈　8 命中（裝甲）　9 命中（地面）
//         0 命中（建築）　B 光束命中　M 槍口（機槍）　C 槍口（砲）　N 槍口（飛彈）　D 塵土　L 重落地　K 滑行　W 推進器　S 光劍　F 燃燒殘骸
//         A 環境開關　P 暫停　. 單步　X 清除　Q 畫質循環
import * as THREE from 'three';
import { loadAssets, World } from '../env.js';
import { Post } from '../post.js';
import { FX } from '../fx.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);

const canvas = document.getElementById('gl');
const info = document.getElementById('info');
if (Q.get('hud') === '0') info.classList.add('hide');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 1.0, 12000);
const cockpit = new THREE.Scene();
const cockCam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 20);

const A = await loadAssets(renderer, (p) => { info.textContent = 'loading ' + (p * 100).toFixed(0) + '%'; });
const world = new World(renderer, scene, A);
const post = new Post(renderer, scene, camera, cockpit, cockCam);
post.u.boot.value = 1;
post.setSize(innerWidth, innerHeight);

const cam = new THREE.Vector3(num('x', 0), 0, num('z', -110));
cam.y = num('y', world.height(cam.x, cam.z) + 17);
let yaw = num('yaw', Math.PI), pitch = num('pitch', -0.06);
const dist = num('dist', 90);
camera.position.copy(cam);
camera.rotation.set(pitch, yaw, 0, 'YXZ');
camera.updateMatrixWorld();

const t0 = performance.now();
const fx = new FX(scene, camera, world);
const initMs = performance.now() - t0;
fx.setQuality(num('q', 2));
if (Q.get('amb') === '1') fx.ambient(true);

// 目標點：鏡頭前方 dist 公尺的地面
const fwd = new THREE.Vector3();
function target(out, d = dist, h = 0) {
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  out.copy(cam).addScaledVector(fwd, d);
  out.y = world.height(out.x, out.z) + h;
  return out;
}
const side = () => new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

// 持續型效果（每幀都要呼叫）；later 用模擬時間排程（暫停單步時也正確）
const cont = [];
const later = (t, fn) => cont.push({ t: 0, dur: t, tick() {}, end: fn });
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();

const T = new THREE.Vector3();
const acts = {
  explosion1: () => fx.explosion(target(T, dist, 2), 1),
  explosion2: () => fx.explosion(target(T, dist, 3), 2),
  explosion3: () => fx.explosion(target(T, dist, 9), 3),
  airburst: () => fx.explosion(target(T, dist, 40), 1.5),
  beam: () => { const a = target(new THREE.Vector3(), 8, 13).addScaledVector(side(), 6); fx.beam(a, target(T, dist + 60, 10), 'player'); },
  enemybeam: () => { const a = target(new THREE.Vector3(), dist + 80, 14).addScaledVector(side(), -30); fx.beam(a, target(T, 20, 12).addScaledVector(side(), 12), 'enemy'); },
  tracer: () => {
    for (let k = 0; k < 6; k++) {
      const a = target(new THREE.Vector3(), 10, 13).addScaledVector(side(), 5);
      const b = target(new THREE.Vector3(), dist, 8 + Math.random() * 6).addScaledVector(side(), (Math.random() - 0.5) * 8);
      later(k * 0.07 + 1e-4, () => fx.tracer(a, b));
    }
  },
  missile: () => {
    const h = fx.missile('player');
    const a = target(new THREE.Vector3(), 20, 25).addScaledVector(side(), -40);
    const b = target(new THREE.Vector3(), dist, 2);
    const mid = a.clone().lerp(b, 0.5); mid.y += 45;
    const dur = 2.4;
    cont.push({ t: 0, dur, tick(t) {
      const u = t / dur, v = 1 - u;
      tmpA.copy(a).multiplyScalar(v * v).addScaledVector(mid, 2 * u * v).addScaledVector(b, u * u);
      tmpB.copy(mid).sub(a).multiplyScalar(2 * v).addScaledVector(tmpC.copy(b).sub(mid), 2 * u).normalize();
      h.pos.copy(tmpA); h.dir.copy(tmpB);
    }, end() { fx.missileEnd(h); fx.explosion(b, 1); } });
    fx.muzzle(a, tmpD.copy(mid).sub(a).normalize(), 'missile');
  },
  salvo: () => { for (let k = 0; k < 6; k++) later(k * 0.14 + 1e-4, () => acts.missile()); },
  armor: () => fx.impact(target(T, dist * 0.6, 10), new THREE.Vector3(0, 0.3, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).normalize(), 'armor'),
  ground: () => fx.impact(target(T, dist * 0.7, 0), new THREE.Vector3(0, 1, 0), 'ground'),
  building: () => {
    const a = target(new THREE.Vector3(), 5, 20), b = target(new THREE.Vector3(), 300, 20).addScaledVector(side(), 60);
    const n = new THREE.Vector3(); const hit = world.raycast ? world.raycast(a, b, n) : null;
    if (hit) fx.impact(hit, n, 'building'); else fx.impact(target(T, dist, 12), new THREE.Vector3(0, 0, 1), 'building');
  },
  beamhit: () => fx.impact(target(T, dist * 0.6, 8), new THREE.Vector3(0, 0.2, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).normalize(), 'beam'),
  mg: () => { const p = target(new THREE.Vector3(), 22, 10).addScaledVector(side(), 4); for (let k = 0; k < 8; k++) later(k * 0.06 + 1e-4, () => fx.muzzle(p, fwd, 'mg')); },
  cannon: () => fx.muzzle(target(new THREE.Vector3(), 26, 10).addScaledVector(side(), 4), fwd, 'cannon'),
  mmuzzle: () => fx.muzzle(target(new THREE.Vector3(), 26, 14).addScaledVector(side(), 4), tmpD.copy(fwd).setY(0.5).normalize(), 'missile'),
  bmuzzle: () => fx.muzzle(target(new THREE.Vector3(), 20, 10).addScaledVector(side(), 3), fwd, 'beam'),
  dust: () => fx.dust(target(T, dist * 0.5, 0), 1),
  land: () => fx.dust(target(T, dist * 0.5, 0), 2.5),
  skid: () => {
    const p = new THREE.Vector3();
    cont.push({ t: 0, dur: 1.6, tick(t) { target(p, 40 + t * 18, 0).addScaledVector(side(), -8 + t * 6); fx.skid(p, fwd, 1 - t / 1.6 * 0.6); }, end() {} });
  },
  wash: () => {
    const p = new THREE.Vector3();
    cont.push({ t: 0, dur: 3, tick(t) { target(p, dist * 0.5, 6 + 5 * Math.sin(t * 2)); fx.thrusterWash(p, 1); }, end() {} });
  },
  saber: () => {
    const c = target(new THREE.Vector3(), 35, 12), s = side();
    const col = new THREE.Color(3, 0.5, 1.8); // 與 combat.js 的 SABER 相同
    cont.push({ t: 0, dur: 0.32, tick(t) {
      const ang = -1.4 + (t / 0.32) * 2.8;
      const dx = Math.sin(ang), dy = Math.cos(ang);
      tmpA.copy(c).addScaledVector(s, dx * 2).setY(c.y + dy * 2);
      tmpB.copy(c).addScaledVector(s, dx * 13).setY(c.y + dy * 9 - 2);
      fx.saberArc(tmpA, tmpB, col);
    }, end() {} });
  },
  wreck: () => fx.smokeColumn(target(T, dist, 0), 40),
  trail: () => { for (let k = 0; k < 30; k++) fx.trail(target(T, dist * 0.6, 5).addScaledVector(side(), k - 15)); },
};
const NAMES = Object.keys(acts);
const KEYS = { '1': 'explosion1', '2': 'explosion2', '3': 'explosion3', '4': 'beam', '5': 'enemybeam', '6': 'tracer', '7': 'missile', '8': 'armor', '9': 'ground', '0': 'building',
  b: 'beamhit', m: 'mg', c: 'cannon', n: 'mmuzzle', v: 'bmuzzle', d: 'dust', l: 'land', k: 'skid', w: 'wash', s: 'saber', f: 'wreck', t: 'trail', y: 'salvo', u: 'airburst' };

let paused = Q.get('pause') === '1';
let ambOn = Q.get('amb') === '1';
function trigger(name) { if (acts[name]) { acts[name](); return true; } return false; }
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (KEYS[k]) trigger(KEYS[k]);
  else if (k === 'a') { ambOn = !ambOn; fx.ambient(ambOn); }
  else if (k === 'p') paused = !paused;
  else if (k === '.') step(1 / 30);
  else if (k === 'x') { fx.clear(); cont.length = 0; }
  else if (k === 'q') fx.setQuality((fx.q + 2) % 3);
  else if (k === 'arrowleft') yaw += 0.08;
  else if (k === 'arrowright') yaw -= 0.08;
  else if (k === 'arrowup') pitch += 0.05;
  else if (k === 'arrowdown') pitch -= 0.05;
});

const auto = Q.get('fx');
const every = num('every', 3);
let autoT = auto ? 0.4 : 1e9;

let simT = 0;
function advance(dt) {
  simT += dt;
  for (let k = cont.length - 1; k >= 0; k--) {
    const c = cont[k];
    c.t += dt;
    if (c.t >= c.dur) { c.end(); cont.splice(k, 1); } else c.tick(c.t);
  }
  if (auto) {
    autoT -= dt;
    if (autoT <= 0) { autoT = every; for (const n of auto.split(',')) trigger(n); }
  }
  camera.position.copy(cam);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  world.update(dt);
  fx.update(dt);
}
function draw() {
  world.followShadow(cam);
  post.render(simT);
}
// 暫停狀態下前進 t 秒再畫一張（截圖用）
function step(t, sub = 1 / 60) {
  let n = Math.max(1, Math.round(t / sub));
  while (n-- > 0) advance(t / Math.max(1, Math.round(t / sub)));
  draw();
}

// 量測：平均 rAF 間隔
const frames = [];
let lastNow = performance.now();
function perf(ms = 2000) {
  return new Promise((res) => {
    const s0 = performance.now(), arr = [];
    let prev = s0;
    function f(now) {
      arr.push(now - prev); prev = now;
      if (now - s0 < ms) requestAnimationFrame(f);
      else {
        arr.shift();
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        const sorted = arr.slice().sort((a, b) => a - b);
        res({ avg: +avg.toFixed(2), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), n: arr.length, vol: fx.vCount, stk: fx.sCount, calls: renderer.info.render.calls });
      }
    }
    requestAnimationFrame(f);
  });
}

// 只計算特效本身的 draw call
function fxCalls() {
  let n = 0;
  for (const m of [fx.vMesh, fx.sMesh, fx.rMesh, fx.mMesh]) if (m.visible) n++;
  return n;
}

let fpsAcc = 0, fpsN = 0, fpsShow = 0, infoT = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  if (!paused) { advance(dt); draw(); }
  fpsAcc += dt; fpsN++; infoT += dt;
  if (infoT > 0.25) {
    fpsShow = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; infoT = 0;
    info.textContent = `${fpsShow.toFixed(0)} fps  vol ${fx.vCount}  stk ${fx.sCount}+${fx.sN - fx.sCount}  fx calls ${fxCalls()}  total calls ${renderer.info.render.calls}\n` +
      `amb ${ambOn ? 'on' : 'off'}  q ${fx.q}  ${paused ? 'PAUSED' : ''}  atlas ${fx.buildMs.toFixed(0)} ms  init ${initMs.toFixed(0)} ms`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = cockCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); cockCam.updateProjectionMatrix();
  post.setSize(innerWidth, innerHeight);
});

Object.assign(window, {
  __fx: fx, __cam: camera, __world: world, __renderer: renderer, __post: post, __trigger: trigger, __names: NAMES,
  __step: step, __perf: perf, __fxCalls: fxCalls,
  __pause: (v) => { paused = v === undefined ? !paused : !!v; return paused; },
  __setCam: (x, y, z, yw, pt) => { cam.set(x, y, z); if (yw !== undefined) yaw = yw; if (pt !== undefined) pitch = pt; },
  __target: (d, h) => target(new THREE.Vector3(), d, h),
});

// 貼圖檢視：__showAtlas('r'|'n'|'a')，__hideAtlas()
window.__showAtlas = (ch = 'r') => {
  const img = fx.atlas.image;
  let c = document.getElementById('atl');
  if (!c) { c = document.createElement('canvas'); c.id = 'atl'; c.style.cssText = 'position:fixed;left:0;top:50px;width:1024px;height:512px;z-index:9;background:#000'; document.body.appendChild(c); }
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'), id = ctx.createImageData(img.width, img.height), d = img.data;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const i = ((img.height - 1 - y) * img.width + x) * 4, o = (y * img.width + x) * 4; // GL 的 v 向上，畫面翻轉
    if (ch === 'n') { id.data[o] = d[i + 1]; id.data[o + 1] = d[i + 2]; id.data[o + 2] = d[i]; }
    else { const v = ch === 'a' ? d[i + 3] : d[i]; id.data[o] = id.data[o + 1] = id.data[o + 2] = v; }
    id.data[o + 3] = 255;
  }
  ctx.putImageData(id, 0, 0); c.style.display = 'block';
};
window.__hideAtlas = () => { const c = document.getElementById('atl'); if (c) c.style.display = 'none'; };
if (Q.get('atlas')) window.__showAtlas(Q.get('atlas'));
