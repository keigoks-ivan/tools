// 世界盃 2026：阿根廷 vs 西班牙 — FIFA 式街機足球（three.js 純前端）
// TEAMS 為資料驅動：之後擴充選隊只要加名單資料
import * as THREE from 'three';

const IS_MOBILE = matchMedia('(pointer: coarse)').matches;
if (IS_MOBILE) document.body.classList.add('is-touch');

// 場地（半長/半寬，公尺感比例）
const FX = 52, FZ = 33;
const GOAL_HW = 3.66, GOAL_H = 2.44;

// ---------- 渲染 ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
// 獵魔女團教訓：全解析度細緻＋自適應降階（掉幀自動降）＋60fps 上限（主迴圈）
let curPR = Math.min(devicePixelRatio, IS_MOBILE ? 1.5 : 2);
renderer.setPixelRatio(curPR);
let perfAcc = 0, perfN = 0;
function perfTick(dt) {
  perfAcc += dt; perfN++;
  if (perfN >= 90) {
    const avg = perfAcc / perfN;
    perfAcc = 0; perfN = 0;
    if (avg > 0.024 && curPR > 1.2) {
      curPR = Math.max(1.1, curPR - 0.25);
      renderer.setPixelRatio(curPR);
    }
  }
}
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc8ec);
scene.fog = new THREE.Fog(0x8fc8ec, 90, 230);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x2e7a3a, 1.15));
const sun = new THREE.DirectionalLight(0xfff2dc, 1.5);
sun.position.set(30, 60, 20);
scene.add(sun);

// ---------- 球場 ----------
(function buildPitch() {
  const gc = document.createElement('canvas');
  gc.width = 128; gc.height = 128;
  const g = gc.getContext('2d');
  g.fillStyle = '#2f9e44'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#2a8f3d'; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(${30 + Math.random() * 30},${130 + Math.random() * 40},${40 + Math.random() * 25},0.25)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const grass = new THREE.CanvasTexture(gc);
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(14, 1);
  grass.colorSpace = THREE.SRGBColorSpace;
  grass.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const field = new THREE.Mesh(new THREE.PlaneGeometry(FX * 2 + 14, FZ * 2 + 12), new THREE.MeshLambertMaterial({ map: grass }));
  field.rotation.x = -Math.PI / 2;
  scene.add(field);
  // 白線
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f6f2 });
  const line = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    scene.add(m);
  };
  line(FX * 2, 0.14, 0, FZ); line(FX * 2, 0.14, 0, -FZ);
  line(0.14, FZ * 2, FX, 0); line(0.14, FZ * 2, -FX, 0);
  line(0.14, FZ * 2, 0, 0);   // 中線
  const circ = new THREE.Mesh(new THREE.RingGeometry(8.3, 8.5, 48), lineMat);
  circ.rotation.x = -Math.PI / 2; circ.position.y = 0.02;
  scene.add(circ);
  for (const s of [1, -1]) {   // 禁區/小禁區/點球點
    line(0.14, 36, s * (FX - 15), 0); line(15, 0.14, s * (FX - 7.5), 18); line(15, 0.14, s * (FX - 7.5), -18);
    line(0.14, 18, s * (FX - 5.2), 0); line(5.2, 0.14, s * (FX - 2.6), 9); line(5.2, 0.14, s * (FX - 2.6), -9);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), lineMat);
    spot.rotation.x = -Math.PI / 2; spot.position.set(s * (FX - 11), 0.02, 0);
    scene.add(spot);
    // 球門：門柱+橫楣+網
    const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (const pz of [GOAL_HW, -GOAL_HW]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, GOAL_H, 8), postMat);
      post.position.set(s * FX, GOAL_H / 2, pz);
      scene.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, GOAL_HW * 2, 8), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(s * FX, GOAL_H, 0);
    scene.add(bar);
    const net = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, GOAL_H, GOAL_HW * 2),
      new THREE.MeshLambertMaterial({ color: 0xdddddd, transparent: true, opacity: 0.22 })
    );
    net.position.set(s * (FX + 0.9), GOAL_H / 2, 0);
    scene.add(net);
  }
  // 廣告板＋看台＋觀眾
  const adCols = ['#1a56c4', '#c42222', '#e8c018', '#158a4a'];
  const adTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 32;
    const cg = c.getContext('2d');
    for (let i = 0; i < 8; i++) { cg.fillStyle = adCols[i % 4]; cg.fillRect(i * 64, 0, 64, 32); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1);
    return t;
  })();
  for (const s of [1, -1]) {
    const ad = new THREE.Mesh(new THREE.BoxGeometry(FX * 2 + 10, 1, 0.3), new THREE.MeshLambertMaterial({ map: adTex }));
    ad.position.set(0, 0.5, s * (FZ + 5));
    scene.add(ad);
  }
  const crowdTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const cg = c.getContext('2d');
    cg.fillStyle = '#22303e'; cg.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 2600; i++) {
      cg.fillStyle = `hsl(${Math.random() * 360},${40 + Math.random() * 40}%,${45 + Math.random() * 30}%)`;
      cg.fillRect(Math.random() * 256, Math.random() * 128, 1.6, 1.6);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  })();
  const standMat = new THREE.MeshLambertMaterial({ map: crowdTex });
  const mkStand = (w, x, z, ry) => {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(w, 22), standMat);
    st.position.set(x, 9.5, z);
    st.rotation.y = ry;
    st.rotation.x = ry === 0 || Math.abs(ry) === Math.PI ? -0.42 * Math.sign(Math.cos(ry) * (z > 0 ? 1 : -1) || 1) : st.rotation.x;
    scene.add(st);
    return st;
  };
  const stN = mkStand(FX * 2 + 40, 0, -(FZ + 16), 0); stN.rotation.x = 0.38;
  const stS = mkStand(FX * 2 + 40, 0, FZ + 16, Math.PI); stS.rotation.x = -0.38;
  const stE = new THREE.Mesh(new THREE.PlaneGeometry(FZ * 2 + 30, 22), standMat);
  stE.position.set(FX + 16, 9.5, 0); stE.rotation.y = -Math.PI / 2; stE.rotation.z = 0; stE.rotateX(0.38);
  scene.add(stE);
  const stW = new THREE.Mesh(new THREE.PlaneGeometry(FZ * 2 + 30, 22), standMat);
  stW.position.set(-(FX + 16), 9.5, 0); stW.rotation.y = Math.PI / 2; stW.rotateX(0.38);
  scene.add(stW);
})();

// ---------- 隊伍資料（可擴充：新增一筆即可加隊） ----------
// pace/skill/shot 0~1；formation 4-3-3 錨點（fx 沿進攻方向、fz 橫向）
const XI_ANCHOR = [
  [-0.94, 0],                                   // GK
  [-0.6, 0.62], [-0.68, 0.22], [-0.68, -0.22], [-0.6, -0.62],   // 後衛
  [-0.26, 0.46], [-0.4, 0], [-0.26, -0.46],     // 中場
  [0.24, 0.6], [0.3, 0], [0.24, -0.6],          // 前鋒
];
const TEAMS = {
  ARG: {
    short: 'ARG', name: '阿根廷', jerseyStyle: 'stripes', c1: 0x9fd4f7, c2: 0xffffff,
    shorts: 0x14203a, gk: 0xd9c43a, dir: 1,
    xi: [
      { num: 23, name: 'E. Martínez', pace: 0.55, skill: 0.7, shot: 0.4 },
      { num: 26, name: 'Molina', pace: 0.8, skill: 0.72, shot: 0.55 },
      { num: 13, name: 'Romero', pace: 0.74, skill: 0.7, shot: 0.5 },
      { num: 19, name: 'Otamendi', pace: 0.62, skill: 0.68, shot: 0.5 },
      { num: 3, name: 'Tagliafico', pace: 0.76, skill: 0.72, shot: 0.52 },
      { num: 7, name: 'De Paul', pace: 0.78, skill: 0.84, shot: 0.7 },
      { num: 24, name: 'E. Fernández', pace: 0.75, skill: 0.88, shot: 0.75 },
      { num: 20, name: 'Mac Allister', pace: 0.74, skill: 0.88, shot: 0.78 },
      { num: 10, name: 'Messi', pace: 0.7, skill: 0.98, shot: 0.95 },
      { num: 9, name: 'J. Álvarez', pace: 0.83, skill: 0.85, shot: 0.86 },
      { num: 22, name: 'L. Martínez', pace: 0.8, skill: 0.82, shot: 0.9 },
    ],
  },
  ESP: {
    short: 'ESP', name: '西班牙', jerseyStyle: 'solid', c1: 0xc32636, c2: 0xe8c018,
    shorts: 0x1a2a5e, gk: 0x88d840, dir: -1,
    xi: [
      { num: 1, name: 'Raya', pace: 0.55, skill: 0.72, shot: 0.4 },
      { num: 2, name: 'Llorente', pace: 0.84, skill: 0.76, shot: 0.6 },
      { num: 5, name: 'Cubarsí', pace: 0.72, skill: 0.8, shot: 0.45 },
      { num: 14, name: 'Laporte', pace: 0.64, skill: 0.74, shot: 0.5 },
      { num: 24, name: 'Cucurella', pace: 0.78, skill: 0.76, shot: 0.5 },
      { num: 16, name: 'Rodri', pace: 0.7, skill: 0.93, shot: 0.8 },
      { num: 6, name: 'Zubimendi', pace: 0.72, skill: 0.85, shot: 0.65 },
      { num: 8, name: 'Pedri', pace: 0.78, skill: 0.95, shot: 0.7 },
      { num: 10, name: 'L. Yamal', pace: 0.92, skill: 0.96, shot: 0.85 },
      { num: 21, name: 'Oyarzabal', pace: 0.78, skill: 0.8, shot: 0.82 },
      { num: 11, name: 'N. Williams', pace: 0.95, skill: 0.85, shot: 0.75 },
    ],
  },
};
const USER = 'ARG';
const CPU = 'ESP';

// ---------- 球員模型（程序生成小人） ----------
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  rg.addColorStop(0, 'rgba(0,0,0,0.4)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
function jerseyTex(team) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const c1 = '#' + team.c1.toString(16).padStart(6, '0');
  const c2 = '#' + team.c2.toString(16).padStart(6, '0');
  if (team.jerseyStyle === 'stripes') {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(i * 8, 0, 8, 64); }
  } else {
    g.fillStyle = c1; g.fillRect(0, 0, 64, 64);
    g.fillStyle = c2; g.fillRect(0, 28, 64, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function labelTex(p) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 56;
  const g = c.getContext('2d');
  g.font = '800 30px -apple-system,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.85)';
  const txt = `${p.num} ${p.name}`;
  g.strokeText(txt, 128, 28);
  g.fillStyle = '#ffffff';
  g.fillText(txt, 128, 28);
  const t = new THREE.CanvasTexture(c);
  return t;
}
const SKINS = [0xf2c9a0, 0xd9a06a, 0xa8734a, 0x8a5a3a, 0xf5d5b5];
function buildPlayerMesh(team, info, isGK) {
  const grp = new THREE.Group();
  const jMat = isGK ? new THREE.MeshLambertMaterial({ color: team.gk }) : new THREE.MeshLambertMaterial({ map: jerseyTex(team) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jMat);
  torso.position.y = 1.06;
  grp.add(torso);
  const shortsMat = new THREE.MeshLambertMaterial({ color: team.shorts });
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.34), shortsMat);
  hips.position.y = 0.62;
  grp.add(hips);
  const skin = new THREE.MeshLambertMaterial({ color: SKINS[Math.floor(Math.random() * SKINS.length)] });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.66;
  grp.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.215, 10, 8, 0, Math.PI * 2, 0, 1.4), new THREE.MeshLambertMaterial({ color: Math.random() < 0.82 ? 0x241a12 : 0x6a4a2a }));
  hair.position.y = 1.7;
  grp.add(hair);
  const legMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });   // 白襪
  const legs = [];
  for (const s of [1, -1]) {
    const leg = new THREE.Group();
    const th = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.52, 0.22), skin);
    th.position.y = -0.26;
    const sock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 0.2), legMat);
    sock.position.y = -0.62;
    leg.add(th, sock);
    leg.position.set(s * 0.15, 0.52, 0);
    grp.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const s of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.16), jMat);
    arm.geometry.translate(0, -0.24, 0);
    arm.position.set(s * 0.4, 1.36, 0);
    grp.add(arm);
    arms.push(arm);
  }
  // 名牌
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(info), transparent: true, depthWrite: false }));
  label.scale.set(2.4, 0.52, 1);
  label.position.y = 2.15;
  grp.add(label);
  // 影子
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  grp.add(shadow);
  scene.add(grp);
  return { grp, legs, arms, label };
}
// 操控指示環
const ctrlRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 24), new THREE.MeshBasicMaterial({ color: 0xffe24f, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
ctrlRing.rotation.x = -Math.PI / 2;
ctrlRing.position.y = 0.03;
scene.add(ctrlRing);

// ---------- 球 ----------
const ballTexC = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#222';
  for (let i = 0; i < 10; i++) {
    g.beginPath();
    g.arc(8 + (i % 4) * 16 + (Math.floor(i / 4) % 2) * 8, 8 + Math.floor(i / 4) * 20, 4.6, 0, 6.28);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), new THREE.MeshLambertMaterial({ map: ballTexC }));
scene.add(ballMesh);
const ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
ballShadow.rotation.x = -Math.PI / 2;
ballShadow.position.y = 0.012;
scene.add(ballShadow);
const ball = { x: 0, y: 0.24, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTeam: 'ARG', freeK: null, freeT: 0 };

// ---------- 音訊（輕量合成：觀眾、哨音、踢球、歡呼） ----------
const AU = { ctx: null, master: null, crowdGain: null, excite: 0, muted: false };
function initAudio() {
  if (AU.ctx) { AU.ctx.resume(); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  AU.ctx = ctx;
  ctx.resume();
  try {
    const un = document.createElement('audio');
    un.setAttribute('playsinline', '');
    un.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    un.loop = true; un.volume = 0.01;
    un.play().catch(() => {});
  } catch (e) { /* noop */ }
  AU.master = ctx.createGain(); AU.master.gain.value = 0.8; AU.master.connect(ctx.destination);
  // 觀眾底噪（噪音 loop + 低通）
  const len = ctx.sampleRate * 2;
  const nb = ctx.createBuffer(1, len, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) { v = v * 0.97 + (Math.random() * 2 - 1) * 0.03; nd[i] = v * 8; }
  const src = ctx.createBufferSource();
  src.buffer = nb; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  AU.crowdGain = ctx.createGain(); AU.crowdGain.gain.value = 0.1;
  src.connect(lp).connect(AU.crowdGain).connect(AU.master);
  src.start();
}
document.addEventListener('pointerdown', () => { if (AU.ctx && AU.ctx.state !== 'running') AU.ctx.resume(); }, true);
function tone(type, f0, dur, gain, f1) {
  if (!AU.ctx) return;
  const t = AU.ctx.currentTime;
  const o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(AU.master);
  o.start(t); o.stop(t + dur + 0.05);
}
const S = {
  kick(pow = 0.5) { tone('sine', 140, 0.09, 0.25 + pow * 0.2, 60); },
  whistle(n = 1) { for (let i = 0; i < n; i++) setTimeout(() => tone('square', 2350, 0.32, 0.12, 2250), i * 380); },
  cheer() { AU.excite = 1; },
  post() { tone('square', 900, 0.15, 0.2, 500); },
};
document.getElementById('mute').addEventListener('click', () => {
  AU.muted = !AU.muted;
  if (AU.master) AU.master.gain.value = AU.muted ? 0 : 0.8;
  document.getElementById('mute').textContent = AU.muted ? '🔇' : '🔊';
});

// ---------- 輸入 ----------
const keys = new Set();
let passP = false, thruP = false, shootHold = false, shootP = false, slideP = false, switchP = false, sprintHold = false;
let shootT = 0;
addEventListener('keydown', e => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyJ') passP = true;
  if (e.code === 'KeyE') thruP = true;
  if (e.code === 'KeyK' && !shootHold) { shootHold = true; shootT = 0; }
  if (e.code === 'Space') slideP = true;
  if (e.code === 'KeyQ') switchP = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sprintHold = true;
  if (e.code === 'KeyM') document.getElementById('mute').click();
  if (state === 'title' && e.code === 'Enter') startMatch();
});
addEventListener('keyup', e => {
  keys.delete(e.code);
  if (e.code === 'KeyK') { if (shootHold) shootP = true; shootHold = false; }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sprintHold = false;
});
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
    touchMove.mx = dx / R; touchMove.mz = dy / R;
  });
  const end = e => {
    if (e.pointerId !== pid) return;
    pid = null;
    touchMove.active = false; touchMove.mx = 0; touchMove.mz = 0;
    base.style.display = knob.style.display = 'none';
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  const bind = (id, down, up) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', e => { e.preventDefault(); down(); });
    if (up) { el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); }
  };
  bind('btnPass', () => { passP = true; });
  bind('btnThru', () => { thruP = true; });
  bind('btnShoot', () => { shootHold = true; shootT = 0; }, () => { if (shootHold) shootP = true; shootHold = false; });
  bind('btnSlide', () => { slideP = true; });
  bind('btnSwitch', () => { switchP = true; });
  bind('btnSprint', () => { sprintHold = true; }, () => { sprintHold = false; });
})();

// ---------- 球員與比賽狀態 ----------
let state = 'title';   // title | play | freeze | goal | ft
const match = { score: { ARG: 0, ESP: 0 }, t: 0, half: 1, freezeT: 0, afterFreeze: null, scorer: '' };
const players = [];
function anchorOf(p) {
  const a = XI_ANCHOR[p.idx];
  const dir = TEAMS[p.team].dir;
  return { x: a[0] * FX * 0.98 * dir, z: a[1] * FZ * 0.9 };
}
for (const tk of ['ARG', 'ESP']) {
  const team = TEAMS[tk];
  team.xi.forEach((info, idx) => {
    const isGK = idx === 0;
    const mesh = buildPlayerMesh(team, info, isGK);
    const p = {
      team: tk, idx, info, isGK, ...mesh,
      x: 0, z: 0, yaw: 0, vx: 0, vz: 0,
      spd: 5.4 + info.pace * 2.3,
      slideT: 0, recoverT: 0, decideT: Math.random() * 0.4, animT: Math.random() * 6,
      gkHoldT: 0,
    };
    players.push(p);
  });
}
let controlled = players.find(p => p.team === USER && p.idx === 9);   // 前鋒
let pendingReceiver = null, switchCd = 0;

function resetFormation(kickTeam) {
  for (const p of players) {
    const a = anchorOf(p);
    p.x = a.x; p.z = a.z; p.vx = p.vz = 0;
    p.slideT = 0; p.recoverT = 0; p.gkHoldT = 0;
  }
  ball.x = 0; ball.z = 0; ball.y = 0.24;
  ball.vx = ball.vy = ball.vz = 0;
  ball.owner = null; ball.freeK = null; ball.freeT = 0;
  // 開球隊 ST 站到球旁
  const st = players.find(p => p.team === kickTeam && p.idx === 9);
  st.x = -TEAMS[kickTeam].dir * 1.2; st.z = 0;
  if (kickTeam === USER) controlled = st;
  else controlled = players.find(p => p.team === USER && p.idx === 9);
  pendingReceiver = null;
}

// ---------- 傳/射/鏟 ----------
function kickBall(kicker, dx, dz, speed, vy) {
  const d = Math.hypot(dx, dz) || 1;
  ball.vx = dx / d * speed;
  ball.vz = dz / d * speed;
  ball.vy = vy;
  ball.owner = null;
  ball.freeK = kicker; ball.freeT = 0.3;
  ball.lastTeam = kicker.team;
  S.kick(speed / 30);
}
function inputDir() {
  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (touchMove.active) { mx = touchMove.mx; mz = touchMove.mz; }
  const l = Math.hypot(mx, mz);
  return l > 0.25 ? { x: mx / l, z: mz / l, has: true } : { x: 0, z: 0, has: false };
}
function doPass(p, lofted) {
  // 只有玩家操控者讀搖桿方向；AI 用自身朝向
  const dir = p === controlled ? inputDir() : { has: false };
  const fx = dir.has ? dir.x : Math.sin(p.yaw), fz = dir.has ? dir.z : Math.cos(p.yaw);
  let best = null, bestS = -1e9;
  for (const m of players) {
    if (m.team !== p.team || m === p) continue;
    const dx = m.x - p.x, dz = m.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const align = (dx * fx + dz * fz) / d;
    const fwd = TEAMS[p.team].dir * dx / d;
    let sc = align * 2 + (lofted ? fwd * 2.2 : 0) - d / (lofted ? 60 : 26) - (m.isGK ? 2 : 0);
    if (sc > bestS) { bestS = sc; best = m; }
  }
  if (!best) return;
  const lead = lofted ? 4.5 : 1.2;
  const tx = best.x + best.vx * 0.4 + TEAMS[p.team].dir * (lofted ? lead : 0.4);
  const tz = best.z + best.vz * 0.4;
  const d = Math.hypot(tx - p.x, tz - p.z);
  kickBall(p, tx - p.x, tz - p.z, Math.min(24, (lofted ? 13 : 12) + d * 0.28), lofted ? 4.6 : 0.35);
  if (p.team === USER) pendingReceiver = best;
}
function doShoot(p, pow) {
  const dir = p === controlled ? inputDir() : { has: false };
  const gx = TEAMS[p.team].dir * FX;
  const tz = (dir.has ? dir.z * 2.8 : 0) + (Math.random() * 2 - 1) * (1.6 - p.info.shot * 1.2);
  const d = Math.hypot(gx - p.x, tz - p.z);
  kickBall(p, gx - p.x, tz - p.z, 15 + pow * 14 + p.info.shot * 3, 1 + pow * (d > 20 ? 5 : 3.4));
  AU.excite = Math.max(AU.excite, 0.5);
  pendingReceiver = null;
}
function doSlide(p) {
  if (p.slideT > 0 || p.recoverT > 0) return;
  p.slideT = 0.45;
  const dir = inputDir();
  if (p === controlled && dir.has) p.yaw = Math.atan2(dir.x, dir.z);
  p.vx = Math.sin(p.yaw) * 10;
  p.vz = Math.cos(p.yaw) * 10;
}

// ---------- 比賽流程 ----------
const el = id => document.getElementById(id);
function showToast(t, sub) {
  el('toast').textContent = t;
  el('toast').classList.remove('show'); void el('toast').offsetWidth;
  el('toast').classList.add('show');
  if (sub) {
    el('subtoast').textContent = sub;
    el('subtoast').classList.remove('show'); void el('subtoast').offsetWidth;
    el('subtoast').classList.add('show');
  }
}
function startMatch() {
  initAudio();
  el('title').classList.add('hidden');
  el('fulltime').classList.add('hidden');
  match.score.ARG = 0; match.score.ESP = 0;
  match.t = 0; match.half = 1;
  TEAMS.ARG.dir = 1; TEAMS.ESP.dir = -1;
  resetFormation(USER);
  state = 'freeze';
  match.freezeT = 1.2; match.afterFreeze = 'play';
  S.whistle();
  showToast('上半場開始');
}
el('startBtn').addEventListener('click', startMatch);
el('againBtn').addEventListener('click', startMatch);
function onGoal(scoredOn) {
  // scoredOn = 進球在哪側球門的 x 正負 → 得分隊 = 進攻該側的隊
  const scorer = ball.freeK && TEAMS[ball.freeK.team].dir === Math.sign(scoredOn) ? ball.freeK : null;
  const scoreTeam = Object.keys(TEAMS).find(k => TEAMS[k].dir === Math.sign(scoredOn));
  match.score[scoreTeam]++;
  match.scorer = scorer ? `${scorer.info.name} ${scorer.info.num}號` : '';
  state = 'goal';
  match.freezeT = 2.6;
  match.afterFreeze = 'kickoff:' + (scoreTeam === 'ARG' ? 'ESP' : 'ARG');
  S.cheer(); S.whistle();
  showToast('GOAL！', `${TEAMS[scoreTeam].name}${match.scorer ? '・' + match.scorer : ''}`);
  updateScore();
}
function updateScore() {
  el('sbScore').textContent = `${match.score.ARG} - ${match.score.ESP}`;
}
const HALF_LEN = 180;
function tickMatch(dt) {
  match.t += dt;
  const mm = Math.floor(match.t / 60), ss = Math.floor(match.t % 60);
  el('sbTime').textContent = `${match.half}H ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  if (match.t >= HALF_LEN) {
    if (match.half === 1) {
      match.half = 2; match.t = 0;
      TEAMS.ARG.dir = -1; TEAMS.ESP.dir = 1;   // 換邊
      resetFormation(CPU);
      state = 'freeze'; match.freezeT = 1.6; match.afterFreeze = 'play';
      S.whistle(2);
      showToast('下半場', '雙方交換場地');
    } else {
      state = 'ft';
      S.whistle(3); S.cheer();
      el('ftScore').textContent = `ARG ${match.score.ARG} - ${match.score.ESP} ESP`;
      el('ftTitle').textContent = match.score.ARG > match.score.ESP ? '阿根廷獲勝！' : match.score.ARG < match.score.ESP ? '西班牙獲勝' : '平手收場';
      el('fulltime').classList.remove('hidden');
    }
  }
}

// ---------- 球物理與所有權 ----------
function updateBall(dt) {
  ball.freeT = Math.max(0, ball.freeT - dt);
  if (ball.freeT === 0) ball.freeK = null;
  if (ball.owner) {
    const o = ball.owner;
    const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
    ball.x = o.x + fx * 0.55;
    ball.z = o.z + fz * 0.55;
    ball.y = 0.24;
    ball.vx = o.vx; ball.vz = o.vz; ball.vy = 0;
  } else {
    ball.vy -= 22 * dt;
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    ball.y += ball.vy * dt;
    if (ball.y < 0.24) {
      ball.y = 0.24;
      if (ball.vy < -1.5) ball.vy = -ball.vy * 0.45;
      else ball.vy = 0;
    }
    const fr = ball.y <= 0.25 ? Math.pow(0.35, dt) : Math.pow(0.85, dt);
    ball.vx *= fr; ball.vz *= fr;
    // 撿球
    for (const p of players) {
      if (p.slideT > 0 || p.recoverT > 0) continue;
      if (p === ball.freeK && ball.freeT > 0) continue;
      if (ball.y > 1.4) continue;
      if (Math.hypot(p.x - ball.x, p.z - ball.z) < 0.85) {
        ball.owner = p;
        ball.lastTeam = p.team;
        if (p.isGK && ball.y < 1.4) { p.gkHoldT = 1.0; }
        if (pendingReceiver === p && p.team === USER) { controlled = p; pendingReceiver = null; }
        if (p.team !== USER) pendingReceiver = null;
        break;
      }
    }
  }
  // 出界／進球
  if (state === 'play') {
    if (Math.abs(ball.x) > FX + 0.3) {
      if (Math.abs(ball.z) < GOAL_HW && ball.y < GOAL_H) { onGoal(Math.sign(ball.x)); }
      else {
        // 球門線出界：角球或門球（簡化：給對應隊在定點）
        const defTeam = Object.keys(TEAMS).find(k => TEAMS[k].dir === -Math.sign(ball.x));
        const corner = ball.lastTeam === defTeam;
        const spotX = Math.sign(ball.x) * (corner ? FX - 1 : FX - 6);
        const spotZ = corner ? Math.sign(ball.z || 1) * (FZ - 1) : 0;
        restartAt(corner ? (defTeam === 'ARG' ? 'ESP' : 'ARG') : defTeam, spotX, spotZ, corner ? '角球' : '門球');
      }
    } else if (Math.abs(ball.z) > FZ + 0.3) {
      const throwTeam = ball.lastTeam === 'ARG' ? 'ESP' : 'ARG';
      restartAt(throwTeam, Math.max(-FX + 2, Math.min(FX - 2, ball.x)), Math.sign(ball.z) * (FZ - 0.5), '界外球');
    }
  }
  ballMesh.position.set(ball.x, ball.y, ball.z);
  ballShadow.position.set(ball.x, 0.012, ball.z);
  const sp = Math.hypot(ball.vx, ball.vz);
  ballMesh.rotation.x += sp * dt * 2.2;
}
function restartAt(teamKey, x, z, label) {
  state = 'freeze';
  match.freezeT = 0.9;
  match.afterFreeze = 'play';
  ball.x = x; ball.z = z; ball.y = 0.24;
  ball.vx = ball.vy = ball.vz = 0;
  ball.owner = null; ball.freeK = null;
  // 最近的該隊球員去接
  let best = null, bd = 1e9;
  for (const p of players) {
    if (p.team !== teamKey || p.isGK) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) { best.x = x - Math.sin(best.yaw) * 0.6; best.z = z - Math.cos(best.yaw) * 0.6; ball.owner = best; ball.lastTeam = teamKey; }
  if (teamKey === USER && best) controlled = best;
  el('subtoast').textContent = label;
  el('subtoast').classList.remove('show'); void el('subtoast').offsetWidth;
  el('subtoast').classList.add('show');
}

// ---------- 球員更新 ----------
function moveToward(p, tx, tz, spd, dt, face = true) {
  const dx = tx - p.x, dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) { p.vx = p.vz = 0; return; }
  const s = Math.min(spd, d / dt);
  p.vx = dx / d * s; p.vz = dz / d * s;
  p.x += p.vx * dt; p.z += p.vz * dt;
  if (face) p.yaw = Math.atan2(dx, dz);
}
let chasers = { ARG: new Set(), ESP: new Set() };
function computeChasers() {
  for (const tk of ['ARG', 'ESP']) {
    const sorted = players.filter(o => o.team === tk && !o.isGK)
      .sort((a, b) => Math.hypot(a.x - ball.x, a.z - ball.z) - Math.hypot(b.x - ball.x, b.z - ball.z));
    chasers[tk] = new Set(sorted.slice(0, 2));
  }
}
function updatePlayers(dt) {
  const owner = ball.owner;
  computeChasers();
  switchCd = Math.max(0, switchCd - dt);
  // 手動換人
  if (switchP && switchCd <= 0) {
    switchP = false; switchCd = 0.3;
    let best = null, bd = 1e9;
    for (const p of players) {
      if (p.team !== USER || p === controlled) continue;
      const d = Math.hypot(p.x - ball.x, p.z - ball.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) controlled = best;
  }
  // 自動換人：對方持球且目前操控者離球太遠（我方傳球飛行中不搶走接應者）
  if (!pendingReceiver && ((owner && owner.team !== USER) || (!owner && ball.lastTeam !== USER))) {
    let best = null, bd = 1e9;
    for (const p of players) {
      if (p.team !== USER || p.isGK) continue;
      const d = Math.hypot(p.x - ball.x, p.z - ball.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best && best !== controlled && bd + 2.5 < Math.hypot(controlled.x - ball.x, controlled.z - ball.z) && switchCd <= 0) {
      controlled = best; switchCd = 0.8;
    }
  }
  for (const p of players) {
    p.animT += dt * (1 + Math.hypot(p.vx, p.vz) * 0.5);
    p.decideT -= dt;
    if (p.slideT > 0) {
      p.slideT -= dt;
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.vx *= Math.pow(0.05, dt); p.vz *= Math.pow(0.05, dt);
      // 鏟到球
      if (Math.hypot(p.x - ball.x, p.z - ball.z) < 1.2 && ball.y < 0.8 && (!ball.owner || ball.owner.team !== p.team)) {
        if (ball.owner) { ball.owner = null; }
        kickBall(p, Math.sin(p.yaw), Math.cos(p.yaw), 8, 1.2);
      }
      if (p.slideT <= 0) p.recoverT = 0.4;
      continue;
    }
    if (p.recoverT > 0) { p.recoverT -= dt; p.vx = p.vz = 0; continue; }
    if (p.gkHoldT > 0 && ball.owner === p) {
      p.gkHoldT -= dt;
      if (p.gkHoldT <= 0) {
        // 大腳解圍
        kickBall(p, TEAMS[p.team].dir, (Math.random() * 2 - 1) * 0.5, 21, 6.5);
      }
      continue;
    }
    if (p === controlled && state === 'play') { updateControlled(p, dt); continue; }
    updateAI(p, dt, owner);
  }
  // 輕微互斥
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < 0.7) {
        const push = (0.7 - d) / 2, ux = dx / d, uz = dz / d;
        a.x -= ux * push; a.z -= uz * push;
        b.x += ux * push; b.z += uz * push;
      }
    }
  }
  // 同步 mesh
  for (const p of players) {
    p.x = Math.max(-FX - 1.5, Math.min(FX + 1.5, p.x));
    p.z = Math.max(-FZ - 1.5, Math.min(FZ + 1.5, p.z));
    p.grp.position.set(p.x, 0, p.z);
    p.grp.rotation.y = p.yaw;
    const mv = Math.hypot(p.vx, p.vz);
    const sw = Math.sin(p.animT * 9) * Math.min(0.7, mv * 0.12);
    p.legs[0].rotation.x = sw;
    p.legs[1].rotation.x = -sw;
    p.arms[0].rotation.x = -sw * 0.8;
    p.arms[1].rotation.x = sw * 0.8;
    if (p.slideT > 0) { p.grp.rotation.x = -1.1; p.grp.position.y = -0.25; }
    else p.grp.rotation.x = 0;
  }
  ctrlRing.position.set(controlled.x, 0.03, controlled.z);
  ctrlRing.rotation.z += dt * 1.5;
}
function updateControlled(p, dt) {
  const dir = inputDir();
  const spd = p.spd * (sprintHold ? 1.32 : 1) * (ball.owner === p ? 0.92 : 1);
  if (dir.has) {
    p.vx = dir.x * spd; p.vz = dir.z * spd;
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.yaw = Math.atan2(dir.x, dir.z);
  } else { p.vx = p.vz = 0; }
  if (ball.owner === p) {
    if (passP) { passP = false; doPass(p, false); }
    else if (thruP) { thruP = false; doPass(p, true); }
    else if (shootP) { shootP = false; doShoot(p, Math.min(1, shootT)); }
  } else {
    passP = false; thruP = false;
    if (shootP) shootP = false;
  }
  if (slideP) { slideP = false; if (ball.owner !== p) doSlide(p); }
}
function updateAI(p, dt, owner) {
  const team = TEAMS[p.team];
  const oppGoalX = team.dir * FX;
  // GK
  if (p.isGK) {
    const gx = -team.dir * (FX - 1.2);
    let gz = Math.max(-GOAL_HW + 0.4, Math.min(GOAL_HW - 0.4, ball.z * 0.55));
    const threat = Math.sign(ball.vx || 1) === -team.dir && Math.abs(ball.x - gx) < 17 && Math.abs(ball.z) < 10;
    if (threat && !ball.owner) {
      // 撲救：撲向來球
      moveToward(p, Math.max(-FX + 0.6, Math.min(FX - 0.6, ball.x - team.dir * 0)), ball.z, 9.5, dt);
    } else {
      moveToward(p, gx, gz, 6, dt);
    }
    return;
  }
  const distBall = Math.hypot(p.x - ball.x, p.z - ball.z);
  // AI 持球
  if (owner === p) {
    if (p.decideT <= 0) {
      p.decideT = 0.45;
      const gdist = Math.hypot(oppGoalX - p.x, p.z);
      const pressured = players.some(o => o.team !== p.team && Math.hypot(o.x - p.x, o.z - p.z) < 2.6);
      if (gdist < 17 + p.info.shot * 6 && Math.random() < 0.4 + p.info.shot * 0.4) {
        doShoot(p, 0.55 + p.info.shot * 0.4);
        return;
      }
      if (pressured && Math.random() < 0.75) {
        p.yaw = Math.atan2(oppGoalX - p.x, -p.z || 0.01);
        doPass(p, Math.random() < 0.25);
        return;
      }
    }
    // 帶球推進（避開最近防守者）
    let ax = oppGoalX - p.x, az = -p.z * 0.3;
    let nr = null, nd = 1e9;
    for (const o of players) {
      if (o.team === p.team) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < nd) { nd = d; nr = o; }
    }
    if (nr && nd < 3.5) { az += Math.sign(p.z - nr.z || 1) * 6; }
    const l = Math.hypot(ax, az) || 1;
    p.vx = ax / l * p.spd * 0.9; p.vz = az / l * p.spd * 0.9;
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.yaw = Math.atan2(p.vx, p.vz);
    return;
  }
  const ourBall = owner && owner.team === p.team;
  // 防守：最近兩人追球（chasers 每幀預算一次）
  if (!ourBall) {
    if (chasers[p.team].has(p) && p !== controlled) {
      moveToward(p, ball.x, ball.z, p.spd * 0.95, dt);
      // AI 搶斷
      if (owner && distBall < 1.1 && Math.random() < dt * 2.2) {
        ball.owner = null;
        kickBall(p, Math.sin(p.yaw), Math.cos(p.yaw), 6, 0.8);
      }
      return;
    }
  }
  // 站位：錨點＋隨球偏移；進攻時前壓
  const a = anchorOf(p);
  const shift = ourBall ? 0.34 : 0.22;
  const tx = a.x + (ball.x - a.x) * shift + (ourBall ? team.dir * 6 : -team.dir * 3);
  const tz = a.z + (ball.z - a.z) * 0.3;
  moveToward(p, tx, tz, p.spd * 0.82, dt);
}

// ---------- 鏡頭／雷達／HUD ----------
function updateCamera(dt) {
  const cx = Math.max(-36, Math.min(36, ball.x));
  const want = new THREE.Vector3(cx * 0.94, IS_MOBILE ? 27 : 24, (IS_MOBILE ? 42 : 39));
  camera.position.lerp(want, Math.min(1, dt * 3.2));
  camera.lookAt(cx * 0.9, 0, ball.z * 0.42 + 2);
}
const radar = document.getElementById('radar');
const rctx = radar.getContext('2d');
function drawRadar() {
  const W = radar.width, H = radar.height;
  rctx.clearRect(0, 0, W, H);
  rctx.strokeStyle = 'rgba(255,255,255,0.5)';
  rctx.strokeRect(3, 3, W - 6, H - 6);
  rctx.beginPath(); rctx.moveTo(W / 2, 3); rctx.lineTo(W / 2, H - 3); rctx.stroke();
  const mx = x => (x + FX) / (FX * 2) * (W - 8) + 4;
  const mz = z => (z + FZ) / (FZ * 2) * (H - 8) + 4;
  for (const p of players) {
    rctx.fillStyle = p.team === 'ARG' ? '#9fd4f7' : '#ff5a5a';
    rctx.fillRect(mx(p.x) - 1.6, mz(p.z) - 1.6, 3.2, 3.2);
  }
  rctx.fillStyle = '#fff';
  rctx.beginPath(); rctx.arc(mx(ball.x), mz(ball.z), 2.4, 0, 6.28); rctx.fill();
  rctx.strokeStyle = '#ffe24f';
  rctx.strokeRect(mx(controlled.x) - 3, mz(controlled.z) - 3, 6, 6);
}
const powerWrap = el('powerwrap'), powerFill = el('powerfill');

// ---------- 主迴圈 ----------
const clock = new THREE.Clock();
let lastFrameTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  if (ts !== undefined && lastFrameTs && ts - lastFrameTs < 15.5) return;
  if (ts !== undefined) lastFrameTs = ts;
  const dt = Math.min(clock.getDelta(), 0.05);
  perfTick(dt);
  if (AU.crowdGain) {
    AU.excite = Math.max(0, AU.excite - dt * 0.35);
    AU.crowdGain.gain.value = (AU.muted ? 0 : 0.09) + AU.excite * 0.16;
  }
  if (state === 'play') {
    if (shootHold && ball.owner === controlled) {
      shootT = Math.min(1, shootT + dt * 1.4);
      powerWrap.style.display = 'block';
      powerFill.style.width = (shootT * 100) + '%';
    } else powerWrap.style.display = 'none';
    updatePlayers(dt);
    updateBall(dt);
    tickMatch(dt);
  } else if (state === 'freeze' || state === 'goal') {
    match.freezeT -= dt;
    // 凍結時球員緩慢歸位
    for (const p of players) {
      if (ball.owner === p) continue;
      const a = anchorOf(p);
      moveToward(p, a.x + (ball.x - a.x) * 0.15, a.z + (ball.z - a.z) * 0.15, p.spd * 0.5, dt);
      p.grp.position.set(p.x, 0, p.z);
      p.grp.rotation.y = p.yaw;
    }
    if (match.freezeT <= 0) {
      const af = match.afterFreeze;
      if (af && af.startsWith('kickoff:')) {
        resetFormation(af.split(':')[1]);
        state = 'freeze'; match.freezeT = 1.0; match.afterFreeze = 'play';
      } else {
        state = 'play';
      }
    }
    updateBall(dt * 0.001);
  }
  updateCamera(dt);
  if (state !== 'title') drawRadar();
  renderer.render(scene, camera);
}
document.getElementById('loadtext').textContent = '準備完成';
window.__dbg = () => ({ state, score: match.score, t: match.t.toFixed(1), half: match.half, owner: ball.owner ? ball.owner.info.name : null, controlled: controlled.info.name, ball: [ball.x.toFixed(1), ball.z.toFixed(1)] });
window.__ball = ball;
window.__players = players;
window.__match = match;
loop();
