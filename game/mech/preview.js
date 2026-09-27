// 預覽版（main.js 帶 ?show= 或 ?free 時載入）：看世界與機體美術／動作
//   ?show=hero|grunt|ace|heavy|all  展示間：滑鼠拖曳旋轉、滾輪縮放；數字鍵 1 站 2 走 3 跑 4 衝刺 5 空中 6 原地轉 7 倒退 8 側走
//   ?x=&y=&z=&yaw=&pitch=           自由鏡頭
import * as THREE from 'three';
import { loadAssets, World } from './env.js';
import { Mech, initMechMaterials } from './mechs.js';
import { Post } from './post.js';

const canvas = document.getElementById('gl');
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

const bar = document.querySelector('#bar i');
const A = await loadAssets(renderer, (p) => { bar.style.width = (p * 100).toFixed(0) + '%'; });
initMechMaterials(A);
const world = new World(renderer, scene, A);
const post = new Post(renderer, scene, camera, cockpit, cockCam);
post.u.boot.value = 1;
post.setSize(innerWidth, innerHeight);
document.getElementById('title').classList.add('hide');

const q = new URLSearchParams(location.search);
const show = q.get('show');
const mechs = [];
const place = (style, scheme, x, z, yaw) => {
  const m = new Mech(style, scheme);
  m.root.position.set(x, world.height(x, z), z);
  m.legYaw = yaw;
  scene.add(m.root);
  mechs.push(m);
  return m;
};

// 展示間
const ORIGIN = new THREE.Vector3(q.get('sx') ? +q.get('sx') : 0, 0, q.get('sz') ? +q.get('sz') : 20);
const orbit = { yaw: +(q.get('oy') || 0.6), pitch: +(q.get('op') || 0.12), dist: +(q.get('od') || 34), h: +(q.get('oh') || 9.5) };
let mode = +(q.get('mode') || 1);
if (show) {
  const list = show === 'all' ? [['hero', 'hero'], ['grunt', 'grunt'], ['grunt', 'ace'], ['heavy', 'heavy']] : [[show === 'ace' ? 'grunt' : show, show]];
  list.forEach(([s, p], i) => { const m = place(s, p, ORIGIN.x + (i - (list.length - 1) / 2) * 16, ORIGIN.z, 0); m.home = m.root.position.x; });
  let drag = null;
  addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbit.yaw -= (e.clientX - drag[0]) * 0.006; orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + (e.clientY - drag[1]) * 0.004, -0.2, 1.2);
    drag = [e.clientX, e.clientY];
  });
  addEventListener('wheel', (e) => { orbit.dist = THREE.MathUtils.clamp(orbit.dist * Math.exp(e.deltaY * 0.001), 8, 200); });
  addEventListener('keydown', (e) => { if (e.key >= '1' && e.key <= '8') mode = +e.key; });
} else {
  place('hero', 'hero', 0, 40, Math.PI);
  place('grunt', 'grunt', 30, 10, Math.PI * 0.8);
  place('grunt', 'ace', -30, 10, -Math.PI * 0.8);
  place('heavy', 'heavy', 0, -30, 0);
}

let yaw = +(q.get('yaw') || 0), pitch = +(q.get('pitch') || -0.1);
const cam = new THREE.Vector3(+(q.get('x') || 0), +(q.get('y') || 30), +(q.get('z') || -60));
window.__cam = { cam, set: (x, y, z, yw, pt) => { cam.set(x, y, z); yaw = yw; pitch = pt; } };
window.__show = { orbit, setMode: (n) => { mode = n; } };
window.__mechs = mechs; window.__world = world; window.__post = post; window.__renderer = renderer;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = cockCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); cockCam.updateProjectionMatrix();
  post.setSize(innerWidth, innerHeight);
});

// 各模式：速度（公尺／秒）、方向、是否衝刺／空中
const MODES = {
  1: { v: 0 }, 2: { v: 9 }, 3: { v: 16 }, 4: { v: 42, boost: 1, thrust: 1 }, 5: { v: 8, air: 1, thrust: 0.7 },
  6: { v: 0, turn: 1.1 }, 7: { v: -7 }, 8: { v: 8, side: 1 },
};
const clock = new THREE.Clock();
let t = 0;
const vel = new THREE.Vector3(), tgt = new THREE.Vector3();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;
  for (const m of mechs) {
    let st;
    if (show) {
      const M = MODES[mode] || MODES[1];
      const face = (m.face = (m.face || 0) + (M.turn || 0) * dt);
      const dirA = face + (M.side ? Math.PI / 2 : 0);
      vel.set(Math.sin(dirA) * M.v, 0, Math.cos(dirA) * M.v);
      m.root.position.addScaledVector(vel, dt);
      // 走出 70 公尺就拉回來
      const dx = m.root.position.x - m.home, dz = m.root.position.z - ORIGIN.z;
      if (Math.hypot(dx, dz) > 70) m.root.position.set(m.home, 0, ORIGIN.z);
      m.root.position.y = world.height(m.root.position.x, m.root.position.z) + (M.air ? 6 + Math.sin(t * 1.3) * 2 : 0);
      st = { vel, grounded: !M.air, boost: M.boost || 0, torsoYaw: face, pitch: 0, thrust: M.thrust || 0, aim: null };
    } else {
      st = { vel: vel.set(0, 0, 0), grounded: true, boost: 0, torsoYaw: m.legYaw, pitch: 0, thrust: 0, aim: null };
    }
    m.animate(dt, st);
  }
  if (show) {
    const c = mechs.length === 1 ? mechs[0].root.position : ORIGIN;
    tgt.set(c.x, (mechs.length === 1 ? c.y : world.height(c.x, c.z)) + orbit.h, c.z);
    camera.position.set(
      tgt.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist,
      tgt.y + Math.sin(orbit.pitch) * orbit.dist,
      tgt.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist);
    camera.lookAt(tgt);
    world.followShadow(camera.position);
  } else {
    camera.position.copy(cam);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    world.followShadow(cam);
  }
  world.update(dt);
  post.render(t);
  requestAnimationFrame(frame);
}
frame();
