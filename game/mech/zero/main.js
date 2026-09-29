// 鋼鐵黃昏 零：主程式
//   流程：標題（選章節）→ 開場字卡 → 第一人稱戰鬥（章節／遭遇戰／檢查點）→ 機庫爬上鋼彈 → 跳進駕駛艙 → 接到《鋼鐵黃昏》的駕駛艙
//   除錯：?ch=1..3 直接開章、?x=&z=&yaw= 指定位置、?god 無敵、?mute 靜音、?final 直接到最後一幕
import * as THREE from 'three';

// 本篇的 env.js 用相對路徑 './assets/' 讀天空、HDR、城市貼圖：
//   前傳有縮小的 webp 版（assets/env/，遠景看不出差別、下載少 12 MB）；沒有的才去本篇資料夾拿
const LITE = new Set(['grass_diff', 'grass_nor', 'grass_arm', 'asphalt_diff', 'asphalt_nor', 'asphalt_arm', 'rubble_diff', 'rubble_nor', 'rock_diff', 'rock_nor', 'rock_arm', 'sky',
  'wear_mask', 'wear_nor', 'frame_mask', 'frame_nor', ...['glass', 'office', 'brick', 'concrete', 'brick2'].flatMap((f) => ['col', 'nor', 'arm'].map((k) => `fac_${f}_${k}`))]);
THREE.DefaultLoadingManager.setURLModifier((u) => {
  if (!u.startsWith('./assets/')) return u;
  const name = u.slice(9), base = name.replace(/\.jpg$/, '');
  return LITE.has(base) ? './assets/env/' + base + '.webp' : '../assets/' + name;
});

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const bar = document.querySelector('#bar i'), status = $('status');
let prog = 0; const step = (k) => { prog = Math.min(1, prog + k); bar.style.width = (prog * 100).toFixed(0) + '%'; };

const [{ loadAssets, World }, { Post }, { Mech, initMechMaterials }, { loadSurfaces, Solid }, { buildMap }, { HumanKit, wrap }, { ViewModel, WEAPONS }, { FXL }, { HUD }, { Pilot }, { Trooper, Drone }, { Input }, S, { Models, Placer }] = await Promise.all([
  import('../env.js'), import('../post.js'), import('../mechs.js'), import('./kit.js'), import('./map.js'), import('./human.js'), import('./viewmodel.js'),
  import('./fxl.js'), import('./hud.js'), import('./player.js'), import('./ai.js'), import('../input.js'), import('./script.js'), import('./models.js'),
]);
const { Destruct } = await import('./destruct.js');
let Audio;
try { ({ ZeroAudio: Audio } = await import('./sfx.js')); } catch (e) { console.warn('[zero] sfx 載入失敗，改用靜音', e); }

// ---------------------------------------------------------------- 畫面
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOV = 72;
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.05, 4000);
camera.rotation.order = 'YXZ';
const vScene = new THREE.Scene();
const vCam = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.01, 10);

status.textContent = '載入城市';
const [A, SURF, MODELS, kit] = await Promise.all([
  loadAssets(renderer, () => step(0.008)), loadSurfaces(renderer, () => step(0.008)), Models.load(() => step(0.008), Math.min(8, renderer.capabilities.getMaxAnisotropy())),
  HumanKit.load(new URL('./assets/soldier.glb', import.meta.url).href).then((k) => { step(0.1); return k; }),
]);
status.textContent = '建立街區';
await new Promise((r) => setTimeout(r, 0));
initMechMaterials(A);
const world = new World(renderer, scene, A);
// 街區內原本的路燈、車、樹拿掉（地圖自己擺道具）
{
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  world.trample = world.trample.filter((o) => {
    if (Math.abs(o.x) < 118 && Math.abs(o.z) < 118) { for (const m of o.mesh) { m.setMatrixAt(o.i, zero); m.instanceMatrix.needsUpdate = true; } return false; }
    return true;
  });
  // 省效能：街區外的樹／路燈／車／瓦礫（實例化）全部被外圍高樓擋住，直接不畫；遠方城市與地形不投影子、不算 AO
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isInstancedMesh && !(o.material && o.material.isMeshBasicMaterial)) { o.visible = false; return; }
    o.castShadow = false; o.userData.noAO = true;
  });
  // 地形換成粗網格（城市範圍內本來就是平的，遠方山丘只是背景）
  {
    const N = 72, size = 10000, g = new THREE.PlaneGeometry(size, size, N, N).rotateX(-Math.PI / 2);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) P.setY(i, world.height(P.getX(i), P.getZ(i)));
    g.computeVertexNormals();
    const old = world.terrainMesh.geometry;
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, P.getX(i), P.getZ(i));
    if (old.attributes.uv) { const ou = old.attributes.uv, op = old.attributes.position; const sx = (ou.getX(1) - ou.getX(0)) / ((op.getX(1) - op.getX(0)) || 1); for (let i = 0; i < uv.count; i++) uv.setXY(i, P.getX(i) * sx, P.getZ(i) * sx); }
    for (const k of Object.keys(old.attributes)) if (!g.attributes[k]) { const a = old.attributes[k]; g.setAttribute(k, new THREE.BufferAttribute(new a.array.constructor(P.count * a.itemSize).fill(1), a.itemSize)); }
    world.terrainMesh.geometry = g; old.dispose();
  }
  // 影子：人的尺度，範圍縮小
  const sc = world.sun.shadow.camera;
  sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.updateProjectionMatrix();
  world.sun.shadow.bias = -0.00025; world.sun.shadow.normalBias = 0.035;
}
scene.fog.density = 0.0016;
const solid = new Solid();
const placer = new Placer(MODELS, solid);
const map = buildMap(scene, SURF, solid, placer);
const placed = placer.build(scene);
console.log('[zero] 掃描模型', placed);
for (const L of map.lights) { const l = new THREE.PointLight(L.c, L.i, L.d, 2); l.position.copy(L.p); scene.add(l); }
vScene.environment = world.envMap;

const post = new Post(renderer, scene, camera, vScene, vCam);
post.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 0.8, scale: 1.1, distanceFallOff: 1 });
post.gtao.updatePdMaterial({ radius: 4, rings: 2, samples: 12 });
post.u.vignette.value = 0.38;

const fx = new FXL(scene);
fx.setFog(scene.fog.color, scene.fog.density);
const mute = new Proxy({}, { get: (_, k) => (k === 'ready' ? false : () => {}) });
const audio = Audio ? new Audio() : mute;
if (q.has('mute') && audio.setVolume) audio.setVolume(0);
const hud = new HUD($('hud'), camera);
const input = new Input(canvas);
const player = new Pilot(solid);
const vm = new ViewModel(kit, vScene, audio, fx);

// ---- 機庫裡的蒼焰（靜止、面向南）＋圍牆外走過的獵犬機
const hero = new Mech('hero', 'hero');
hero.root.position.copy(map.marks.mech); hero.legYaw = Math.PI;
scene.add(hero.root);
const idleSt = { vel: new THREE.Vector3(), grounded: true, boost: 0, torsoYaw: Math.PI, pitch: 0.05, thrust: 0, aim: null, lean: 0 };
for (let i = 0; i < 30; i++) hero.animate(1 / 30, idleSt);
const hound = new Mech('grunt', 'grunt');
hound.root.visible = false; scene.add(hound.root);
window.__renderer = renderer; window.__scene = scene; window.__solid = solid; window.__map = map; window.__hero = hero;

// ---------------------------------------------------------------- 遊戲狀態（AI 也讀這個）
const G = {
  scene, solid, kit, audio, fx, player, vm, hud, t: 0, nextId: 1, enemies: [], playing: false,
  playerEye: new THREE.Vector3(), diff: { acc: 1, dmg: 1 }, bolts: [],
  chapterTag: '', objText: '', scopeRange: 0, stats: { shots: 0, hits: 0, kills: 0, heads: 0, taken: 0, time: 0 },
  // 同時開火的敵人上限（避免四面八方同時打）
  canShoot(e) { let n = 0; for (const o of G.enemies) if (o !== e && !o.dead && (o.burst > 0)) n++; return n < 3; },
  bolt(p, d, speed, dmg, owner) {
    G.bolts.push({ p: p.clone(), dir: d.clone(), speed, dmg, owner, len: Math.min(2.2, speed * 0.028), w: owner && owner.type === 'sniper' ? 0.05 : 0.035, c: [4, 0.45, 0.25], life: 3, whiz: false });
  },
  // 範圍傷害（無人機墜毀）
  splash(p, r, dmg) {
    const d = player.pos.distanceTo(p);
    if (d < r) hurtPlayer(dmg * (1 - d / r), p);
    for (const e of G.enemies) if (!e.dead && e.pos.distanceTo(p) < r) e.damage(dmg * 2, _v.subVectors(e.pos, p).normalize().clone(), 'body', p);
    shake(0.4 * (1 - Math.min(1, d / 20)));
  },
};
window.__G = G;
// 可破壞的道具：地圖建好時登記的全部接上
const D = (G.destruct = new Destruct(G));
for (const r of placer.reg) D.register(r.name, r.h, r.box);
for (const w of placer.bagWalls) D.bagWall(w.box, w.bags);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ---------------------------------------------------------------- 設定
const store = { get: (k, d) => { try { const v = localStorage.getItem('zero.' + k); return v === null ? d : +v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('zero.' + k, v); } catch (e) {} } };
let quality = store.get('q', 1);
function setQuality(qv) {
  quality = qv; store.set('q', qv);
  renderer.setPixelRatio(Math.min(devicePixelRatio, [0.75, 1, 1.5][qv]));
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
  post.gtao.enabled = qv > 1;   // AO 要整個場景多畫一次：只在高畫質開
  world.sun.shadow.mapSize.setScalar(qv > 0 ? 4096 : 2048);
  if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  renderer.shadowMap.type = qv > 0 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  fx.quality = qv;
  document.querySelectorAll('[data-q]').forEach((b) => { b.style.background = +b.dataset.q === qv ? 'rgba(127,243,255,0.25)' : ''; });
}
setQuality(quality);
document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => setQuality(+b.dataset.q)));
const sens = $('sens');
input.sens = store.get('sens', 1); sens.value = input.sens;
sens.addEventListener('input', () => { input.sens = +sens.value; store.set('sens', sens.value); });
const de = document.documentElement, fsBtns = document.querySelectorAll('.fs');
const fsOn = () => document.fullscreenElement || document.webkitFullscreenElement;
if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtns.forEach((b) => { b.style.display = 'none'; });
fsBtns.forEach((b) => b.addEventListener('click', () => { try { const p = fsOn() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (de.requestFullscreen || de.webkitRequestFullscreen).call(de, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) {} }));
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); vCam.updateProjectionMatrix();
  post.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- 章節／遭遇戰
const done = new Set();         // 已清完的遭遇
let active = [];                // 進行中 {E, list}
let chapter = 1, checkpoint = null, stage = 'play';
let mechWalk = null, finale = null, hatchOpen = 0, alarmOn = false;
const progress = () => store.get('ch', 1);

function clearEnemies() {
  for (const e of G.enemies) e.dispose();
  G.enemies.length = 0; G.bolts.length = 0; fx.bolts.length = 0;
}
function spawn(def) {
  const e = def.type === 'drone' ? new Drone(G, def) : new Trooper(G, def);
  G.enemies.push(e); return e;
}
function startEncounter(E) {
  const list = E.enemies.map(spawn);
  active.push({ E, list });
  for (const [who, text] of E.lines) hud.say(who, text, 3.6);
  if (E.lines.length) audio.radio('in');
  G.objText = E.obj;
  hud.obj = null;
  if (E.alarm && !alarmOn) { alarmOn = true; audio.alarm(true); }
}
// 下一段還沒清的遭遇
function objective() { return S.ENCOUNTERS.find((E) => E.ch === chapter && !done.has(E.id)); }
// 遭遇開打前的導引點
function guideFor(E) {
  const Z = { B: [-91.5, -80], C: [-91.5, -60], D: [-43, -42], E: [28, -30], F: [28, 24], G1: [32, 53], G2: [40, 70] };
  const z = Z[E.id] || [0, 0];
  return new THREE.Vector3(z[0], 1.5, z[1]);
}
const toCockpit = () => { G.objText = '爬上維修架，進入駕駛艙'; hud.obj = { p: map.marks.hatch.clone().add(new THREE.Vector3(0, 1, -1)) }; };

function startChapter(n) {
  clearEnemies(); fx.clear(); D.clear(); active = [];
  chapter = n;
  const C = S.CHAPTERS[n - 1];
  done.clear();
  for (const E of S.ENCOUNTERS) if (E.ch < n) done.add(E.id);
  player.reset(map.marks[C.start].clone(), C.yaw);
  if (q.has('x')) player.reset(new THREE.Vector3(+q.get('x'), +(q.get('y') || 0), +q.get('z')), +(q.get('yaw') || 0));
  vm.refill();
  checkpoint = { p: player.pos.clone(), yaw: player.yaw, done: [...done], ch: n };
  G.chapterTag = `CHAPTER ${n}　${C.en}`;
  const first = objective();
  G.objText = first ? first.obj : '';
  hud.obj = first ? { p: guideFor(first) } : null;
  hud.title(`第 ${n} 章　${C.name}`, C.en, 4);
  const L = S.LINES[n === 1 ? 'start' : 'ch' + n];
  if (L) { setTimeout(() => audio.radio('in'), 1500); for (const [w, t] of L) hud.say(w, t, 3.8); }
  audio.music('battle', { stage: C.music });
  mechWalk = null; hound.root.visible = false;
  if (alarmOn) { alarmOn = false; audio.alarm(false); }
  finale = null; hatchOpen = 0; if (hero.hatchOpen) hero.hatchOpen(0);
  player.frozen = false;
  if (n > progress()) store.set('ch', n);
}

function updateEncounters() {
  const p = player.pos;
  // 觸發（依順序：前一段清完才會觸發下一段）
  for (const E of S.ENCOUNTERS) {
    if (E.ch !== chapter || done.has(E.id) || active.some((a) => a.E === E)) continue;
    const idx = S.ENCOUNTERS.indexOf(E), prev = S.ENCOUNTERS.slice(0, idx).filter((x) => x.ch === chapter);
    if (!prev.every((x) => done.has(x.id))) continue;
    if (E.after ? done.has(E.after) : E.trigger(p)) startEncounter(E);
  }
  // 清完
  for (const a of [...active]) {
    if (!a.list.every((e) => e.dead)) continue;
    active.splice(active.indexOf(a), 1);
    done.add(a.E.id);
    for (const [w, t] of a.E.done) hud.say(w, t, 3.6);
    if (a.E.done.length) audio.radio('in');
    hud.note('區域清除  AREA CLEAR', '#ffb347');
    checkpoint = { p: player.pos.clone(), yaw: player.yaw, done: [...done], ch: chapter };
    const nx = objective();
    if (a.E.id === 'G2') { toCockpit(); if (alarmOn) { alarmOn = false; audio.alarm(false); } }
    else if (nx && nx.ch === chapter) { G.objText = nx.obj; hud.obj = { p: guideFor(nx) }; }
    else if (a.E.mark) { G.objText = a.E.id === 'C' ? '穿過東邊的商店' : a.E.id === 'E' ? '進入基地大門' : a.E.obj; hud.obj = { p: a.E.mark.clone().setY(1.5) }; }
    // 屍體多了就清掉最舊的
    const dead = G.enemies.filter((e) => e.dead);
    if (dead.length > 14) for (const e of dead.slice(0, dead.length - 14)) { e.dispose(); G.enemies.splice(G.enemies.indexOf(e), 1); }
  }
  // 章節終點
  if (chapter === 1 && done.has('C') && p.x > -58 && p.z > -48 && p.z < -36) nextChapter(2);
  if (chapter === 2 && done.has('E') && p.z > 20.5 && p.x > 24 && p.x < 32) nextChapter(3);
  // 獵犬機走過圍牆外（第 2 章，走進貨櫃場時）
  if (chapter === 2 && !mechWalk && !G.mechDone && done.has('D') && p.x > 14 && p.z > -34) {
    G.mechDone = true; mechWalk = { t: 0, i: 0, stepT: 0 }; hound.root.visible = true; hound.root.position.copy(map.marks.mechPath[0]);
    for (const [w, t] of S.LINES.mech) hud.say(w, t, 3.4); audio.radio('in');
  }
}
function nextChapter(n) {
  const C = S.CHAPTERS[n - 1];
  hud.title(`第 ${n} 章　${C.name}`, C.en, 4);
  chapter = n;
  G.chapterTag = `CHAPTER ${n}　${C.en}`;
  const L = S.LINES['ch' + n]; if (L) { audio.radio('in'); for (const [w, t] of L) hud.say(w, t, 3.8); }
  const first = objective();
  G.objText = first ? first.obj : ''; hud.obj = first ? { p: guideFor(first) } : null;
  checkpoint = { p: player.pos.clone(), yaw: player.yaw, done: [...done], ch: n };
  audio.music('battle', { stage: C.music });
  if (n > progress()) store.set('ch', n);
}

// ---------------------------------------------------------------- 開槍
let recoilV = 0, recoil = 0;
function playerShoot(shot) {
  const eye = G.playerEye, W = shot.W;
  const d = camera.getWorldDirection(new THREE.Vector3());
  if (shot.spread > 0) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * shot.spread;
    const U = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), R = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    d.addScaledVector(U, Math.sin(a) * r).addScaledVector(R, Math.cos(a) * r).normalize();
  }
  const wh = solid.ray(eye, d, W.range);
  let maxT = wh ? wh.t : W.range, target = null, part = null;
  for (const e of G.enemies) { const h = e.hitTest(eye, d, maxT); if (h) { maxT = h.t; target = e; part = h.part; } }
  const end = eye.clone().addScaledVector(d, maxT);
  const muzzle = vm.muzzleWorld(camera);
  if (shot.weapon === 'rifle') { fx.beam(muzzle, end, 'rifle'); fx.muzzle(muzzle, d, [0.6, 2.6, 4.2], true); }
  else { pistolBolts.push({ p: muzzle.clone(), dir: end.clone().sub(muzzle).normalize(), to: end.clone(), speed: 240, len: 0.8, w: 0.022, c: [0.5, 2.2, 3.8] }); fx.muzzle(muzzle, d, [0.5, 2.2, 3.8]); }
  G.stats.shots++;
  if (target) {
    const dmg = part === 'head' ? W.head : part === 'limb' ? W.limb : W.dmg;
    const killed = target.damage(dmg, d.clone(), part, player.pos);
    G.stats.hits++;
    fx.impact(end, d.clone().negate(), 'armor', shot.weapon === 'rifle' ? [0.8, 2.4, 4] : [0.7, 2, 3.5], shot.weapon === 'rifle' ? 1.1 : 0.7);
    audio.hit(end, part === 'head' ? 'head' : target.type === 'drone' ? 'metal' : 'armor');
    audio.hitmark(killed ? 'kill' : part === 'head' ? 'head' : 'hit');
    hud.marker(killed ? 'kill' : part === 'head' ? 'head' : 'hit');
    if (killed) { G.stats.kills++; if (part === 'head') G.stats.heads++; if (target.type !== 'drone') hud.note(part === 'head' ? '爆頭  HEADSHOT' : '擊倒  DOWN', part === 'head' ? '#ffb347' : '#7ff3ff'); }
  } else if (wh) {
    const kind = /metal|rust|corr|olive/.test(wh.mat) ? 'metal' : wh.mat === 'glass' ? 'glass' : wh.mat === 'wood' ? 'concrete' : 'concrete';
    fx.impact(end, wh.n, kind, shot.weapon === 'rifle' ? [1.2, 2.2, 3.5] : [1, 1.8, 3], shot.weapon === 'rifle' ? 1.1 : 0.6);
    audio.hit(end, kind);
    if (wh.b && wh.b.obj) D.hit(wh.b.obj, W.dmg * (shot.weapon === 'rifle' ? 1.4 : 1), end, d);
    else D.wall(end, wh.n, wh.mat, W.dmg);
  }
  // 附近的敵人聽到槍聲
  for (const e of G.enemies) if (!e.dead && e.pos.distanceTo(player.pos) < 32) e.alert(player.pos, 0.8);
  recoilV += (shot.weapon === 'rifle' ? (vm.scoped ? 0.03 : 0.022) : 0.008) * 14;
}
const pistolBolts = [];

// 敵人光彈：移動、撞牆、打到玩家、擦身而過
function updateBolts(dt) {
  const eye = G.playerEye, foot = player.pos;
  fx.bolts.length = 0;
  for (let i = pistolBolts.length - 1; i >= 0; i--) {
    const b = pistolBolts[i], step = b.speed * dt;
    if (step >= b.p.distanceTo(b.to)) { pistolBolts.splice(i, 1); continue; }
    b.p.addScaledVector(b.dir, step); fx.bolts.push(b);
  }
  for (let i = G.bolts.length - 1; i >= 0; i--) {
    const b = G.bolts[i];
    b.life -= dt;
    const step = b.speed * dt;
    const wh = solid.ray(b.p, b.dir, step);
    const lim = wh ? wh.t : step;
    const hit = segCapsule(b.p, b.dir, lim, foot.x, foot.z, foot.y + 0.2, eye.y + 0.1, 0.36);
    if (hit >= 0 && !player.dead && !finale) {
      hurtPlayer(b.dmg, b.p.clone().addScaledVector(b.dir, -5));
      fx.impact(b.p.clone().addScaledVector(b.dir, hit), b.dir.clone().negate(), 'body', [4, 0.6, 0.3], 0.5);
      G.bolts.splice(i, 1); continue;
    }
    if (!b.whiz) { const cd = closestTo(b.p, b.dir, lim, eye); if (cd < 1.5) { b.whiz = true; audio.whiz(eye.clone().addScaledVector(b.dir, 2)); } }
    if (wh) {
      const p = b.p.clone().addScaledVector(b.dir, wh.t);
      if (wh.b && wh.b.obj) D.hit(wh.b.obj, b.dmg * 1.5, p, b.dir);
      fx.impact(p, wh.n, /metal|rust|corr/.test(wh.mat) ? 'metal' : 'concrete', [4, 0.7, 0.3], b.owner && b.owner.type === 'sniper' ? 1 : 0.55);
      if (p.distanceTo(eye) < 25) audio.hit(p, 'concrete');
      G.bolts.splice(i, 1); continue;
    }
    b.p.addScaledVector(b.dir, step);
    if (b.life <= 0) { G.bolts.splice(i, 1); continue; }
    fx.bolts.push(b);
  }
}
function segCapsule(o, d, L, cx, cz, y0, y1, r) {
  const n = Math.max(2, Math.ceil(L / 0.25));
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * L, x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < y0 - r || y > y1 + r) continue;
    const dx = x - cx, dz = z - cz, yy = clamp(y, y0, y1) - y;
    if (dx * dx + dz * dz + yy * yy < r * r) return t;
  }
  return -1;
}
function closestTo(o, d, L, p) {
  const t = clamp((p.x - o.x) * d.x + (p.y - o.y) * d.y + (p.z - o.z) * d.z, 0, L);
  return Math.hypot(o.x + d.x * t - p.x, o.y + d.y * t - p.y, o.z + d.z * t - p.z);
}

let dmgFlash = 0, shakeK = 0;
function shake(k) { shakeK = Math.min(1.5, shakeK + k); }
function hurtPlayer(dmg, from) {
  if (q.has('god') || player.dead || finale) return;
  const hpDmg = player.damage(dmg);
  G.stats.taken += dmg;
  const a = -wrap(Math.atan2(from.x - player.pos.x, from.z - player.pos.z) - player.yaw);
  hud.hurt(a);
  dmgFlash = Math.min(1, dmgFlash + dmg / 30 + (hpDmg > 0 ? 0.2 : 0));
  audio.hurt(clamp(dmg / 20, 0.2, 1), Math.sin(a));
  shake(0.15);
  if (player.dead) die();
}
player.onShieldBreak = () => audio.shieldBreak();
player.onRecharge = () => audio.shieldRecharge();
player.onStep = (k) => audio.step(stepSurface(), k);
player.onJump = () => audio.jump();
player.onLand = (k) => { audio.land(k); vm.land(k * 0.5); shake(k * 0.2); };
function stepSurface() { const p = player.pos; if (p.y > 1 || (p.z > 52 && p.x > 10)) return 'metal'; if (p.x < -86 && p.z < -58) return 'gravel'; return 'concrete'; }

function die() {
  stage = 'dead';
  audio.lowHealth(false);
  setTimeout(() => {
    input.unlock();
    $('resTitle').textContent = '陣亡'; $('resSub').textContent = 'KILLED IN ACTION';
    $('result').style.display = 'flex';
  }, 1600);
}
function respawn() {
  $('result').style.display = 'none';
  // 從檢查點：已清的保留，進行中的整段重來
  const cp = checkpoint;
  clearEnemies(); active = [];
  done.clear(); for (const id of cp.done) done.add(id);
  chapter = cp.ch;
  player.reset(cp.p, cp.yaw); vm.refill();
  const nx = objective();
  if (done.has('G2')) toCockpit(); else if (nx) { G.objText = nx.obj; hud.obj = { p: guideFor(nx) }; }
  if (alarmOn) { alarmOn = false; audio.alarm(false); }
  stage = 'play'; input.lock();
}

// ---------------------------------------------------------------- 最後一幕：登上蒼焰
function hatchWorld() {
  if (hero.cockpitLocal && hero.bones && hero.bones.torso) { hero.root.updateMatrixWorld(true); return hero.bones.torso.localToWorld(hero.cockpitLocal.clone()); }
  return map.marks.hatch.clone().add(new THREE.Vector3(0, 1.4, 1.8));
}
function updateHatch(dt) {
  if (!done.has('G2')) { hud.prompt = null; return; }
  const hp = hatchWorld();
  const onDeck = player.pos.y > map.marks.hatch.y - 0.5;
  const near = onDeck && Math.hypot(player.pos.x - hp.x, player.pos.z - map.marks.hatch.z) < 3.5;
  // 走上胸前平台時艙門打開
  const want = onDeck ? 1 : 0;
  if (want && hatchOpen === 0) { audio.door(hp); for (const [w, t] of S.LINES.hatch) hud.say(w, t, 3); }
  hatchOpen = clamp(hatchOpen + (want ? dt / 2.5 : -dt / 2.5), 0, 1);
  if (hero.hatchOpen) hero.hatchOpen(hatchOpen);
  hud.prompt = near && hatchOpen > 0.9 ? '按 E　進入駕駛艙' : null;
  if (hud.prompt && (input.pressed('KeyE') || input.pressed('Tlock'))) startFinale();
}
function startFinale() {
  finale = { t: 0, from: G.playerEye.clone(), yaw: player.yaw, pitch: player.pitch, to: hatchWorld() };
  player.frozen = true; hud.prompt = null; hud.obj = null; G.objText = ''; G.playing = false;
  audio.music('off');
  audio.mechBoot(finale.to);
  store.set('ch', 3); store.set('clear', 1);
}
function updateFinale(dt) {
  const F = finale; F.t += dt;
  // 0～1.2 s：轉頭看向艙口並走近；1.2～2.2 s：跳進去；之後黑畫面＋開機聲，接鋼鐵黃昏
  const a = clamp(F.t / 1.2, 0, 1), b = clamp((F.t - 1.2) / 1.0, 0, 1);
  const fwd = new THREE.Vector3(0, 0, 1);   // 蒼焰面向 −Z，駕駛艙往 +Z 進去
  const front = F.to.clone().addScaledVector(fwd, -1.6).add(new THREE.Vector3(0, 0.2, 0));
  const inside = F.to.clone().addScaledVector(fwd, 1.2);
  const p = F.from.clone().lerp(front, ease(a)).lerp(inside, ease(b));
  p.y += Math.sin(b * Math.PI) * 0.45;
  const tgtYaw = Math.atan2(F.to.x - front.x, F.to.z - front.z) || 0;
  const yaw = lerpA(F.yaw, tgtYaw, ease(a)), pitch = lerp(F.pitch, -0.12, ease(a)) + b * 0.08;
  camera.position.copy(p); camera.rotation.set(pitch, yaw + Math.PI, 0);
  vm.holder.visible = false; vm.arms.root.visible = false;
  const fade = clamp((F.t - 1.7) / 0.6, 0, 1);
  $('fade').style.transition = 'none'; $('fade').style.opacity = fade;
  if (F.t > 2.4 && !F.card) { F.card = true; hud.title('XG-01　蒼焰', '系統啟動中……　SYSTEM BOOT', 3.5); }
  if (F.t > 6.2 && !F.go) { F.go = true; location.href = '../?zero=1'; }
}
const ease = (t) => t * t * (3 - 2 * t);
const lerpA = (a, b, t) => a + wrap(b - a) * t;

// ---------------------------------------------------------------- 獵犬機走過
function updateMechWalk(dt) {
  const M = mechWalk; if (!M) return;
  const path = map.marks.mechPath, sp = 5.5;
  const to = path[Math.min(M.i + 1, path.length - 1)], p = hound.root.position;
  _v.subVectors(to, p); _v.y = 0;
  const L = _v.length();
  if (L < 1 && M.i < path.length - 2) M.i++;
  else if (L < 1) { hound.root.visible = false; mechWalk = null; return; }
  _v.normalize();
  const vel = _v.clone().multiplyScalar(sp);
  p.addScaledVector(vel, dt);
  hound.legYaw = Math.atan2(vel.x, vel.z);
  const look = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
  M.t += dt;
  hound.animate(dt, { vel, grounded: true, boost: 0, torsoYaw: lerpA(hound.legYaw, look, 0.5 + 0.3 * Math.sin(M.t * 0.5)), pitch: -0.1, thrust: 0, aim: null, lean: 0 });
  M.stepT += dt;
  if (M.stepT > 0.95) { M.stepT = 0; audio.enemyStep(p, 1.3); const d = p.distanceTo(player.pos); shake(clamp(1 - d / 90, 0, 1) * 0.5); fx.puff(p.clone().add(new THREE.Vector3(0, 0.5, 0)), [0.4, 0.38, 0.35], 3); }
}

// ---------------------------------------------------------------- 流程
let state = 'title';
function renderChapters() {
  const nx = q.has('all') ? 3 : progress();
  $('chapters').innerHTML = S.CHAPTERS.map((C) => `<button class="chp${C.n > nx ? ' lock' : ''}${C.n === nx ? ' next' : ''}" data-c="${C.n}"${C.n > nx ? ' disabled' : ''}><b>CHAPTER ${C.n}</b><span>${C.n > nx ? 'LOCKED' : C.name}</span></button>`).join('');
}
status.textContent = '選擇章節';
bar.style.width = '100%';
renderChapters();
$('chapters').style.display = 'flex';
$('chapters').addEventListener('click', (ev) => { const b = ev.target.closest('.chp'); if (b && !b.disabled) launch(+b.dataset.c); });
document.addEventListener('mouseover', (ev) => { const b = ev.target.closest('.chp:not(.lock), .btn'); if (b && !b.contains(ev.relatedTarget)) audio.ui('hover'); });
document.addEventListener('click', (ev) => { if (ev.target.closest('.btn, .chp')) audio.ui('click'); });
for (const k of ['pointerdown', 'keydown']) addEventListener(k, () => audio.unlock(), { once: true });
audio.music('title');
$('resume').addEventListener('click', resume);
$('quit').addEventListener('click', toTitle);
$('menu').addEventListener('click', toTitle);
$('cont').addEventListener('click', respawn);
input.onLockChange = (locked) => { if (!locked && state === 'play' && stage === 'play' && !input.touch.on && !finale) pause(); };
const touchUI = $('touch');

function launch(n) {
  audio.unlock();
  $('title').classList.add('hide');
  G.stats = { shots: 0, hits: 0, kills: 0, heads: 0, taken: 0, time: 0 };
  if (n === 1 && !q.has('x') && !q.has('ch')) intro(() => begin(n)); else begin(n);
}
function intro(then) {
  const el = $('intro'), box = $('introText');
  el.style.display = 'flex';
  box.innerHTML = S.INTRO.map((t) => `<p>${t}</p>`).join('');
  const ps = [...box.querySelectorAll('p')];
  let i = 0, tm = null, over = false;
  const next = () => { if (over) return; if (i < ps.length) { ps[i++].classList.add('on'); tm = setTimeout(next, 2600); } else tm = setTimeout(finish, 1800); };
  const finish = () => { if (over) return; over = true; clearTimeout(tm); el.style.display = 'none'; removeEventListener('keydown', skip); el.removeEventListener('pointerdown', skip); then(); };
  const skip = () => { if (i < ps.length) { ps.forEach((p) => p.classList.add('on')); i = ps.length; clearTimeout(tm); tm = setTimeout(finish, 900); } else finish(); };
  addEventListener('keydown', skip); el.addEventListener('pointerdown', skip);
  audio.music('off');
  tm = setTimeout(next, 500);
}
function begin(n) {
  startChapter(n);
  if (q.has('final')) { for (const E of S.ENCOUNTERS) done.add(E.id); player.reset(new THREE.Vector3(14, 0, 90), 0); toCockpit(); }
  state = 'play'; stage = 'play'; G.playing = true;
  input.enabled = true;
  if (!input.touch.on) input.lock();
  touchUI.style.display = input.touch.on ? 'block' : 'none';
  $('fade').style.opacity = 0;
}
function pause() {
  if (state !== 'play') return;
  state = 'paused'; $('pause').style.display = 'flex'; audio.setPaused(true);
}
function resume() {
  $('pause').style.display = 'none'; audio.setPaused(false);
  if (!input.touch.on) input.lock();
  state = 'play'; clock.getDelta();
}
function toTitle() {
  $('pause').style.display = 'none'; $('result').style.display = 'none';
  audio.setPaused(false); audio.lowHealth(false); if (alarmOn) { alarmOn = false; audio.alarm(false); }
  input.unlock(); input.enabled = false; touchUI.style.display = 'none';
  clearEnemies(); G.playing = false; state = 'title';
  renderChapters(); audio.music('title');
  $('title').classList.remove('hide');
}

// ---------------------------------------------------------------- 主迴圈
const clock = new THREE.Clock();
let titleT = 0, crouchToggle = false;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (state === 'paused') { input.endFrame(); return; }
  G.t += dt;
  if (state === 'title') {
    // 標題：鏡頭慢慢繞著機庫裡的蒼焰
    titleT += dt * 0.08;
    const c = map.marks.mech;
    camera.fov = FOV; camera.updateProjectionMatrix();
    camera.position.set(c.x + Math.sin(titleT) * 16, 9 + Math.sin(titleT * 0.7) * 2, c.z - 16 + Math.cos(titleT) * 5);
    camera.lookAt(c.x, 11, c.z);
    vm.holder.visible = false; vm.arms.root.visible = false;
    world.followShadow(camera.position); world.update(dt); fx.update(dt);
    post.render(clock.elapsedTime); hud.draw(dt, null);
    input.endFrame(); return;
  }
  const c = input.state(dt), K = input.keys;
  if (c.pause && !finale) { pause(); input.endFrame(); return; }
  if (input.pressed('KeyC') || input.pressed('Tod')) crouchToggle = !crouchToggle;
  const run = K.has('ShiftLeft') || K.has('ShiftRight') || K.has('Tboost');
  if (run && c.my > 0.3) crouchToggle = false;
  const lookK = vm.scoped ? WEAPONS.rifle.fov / FOV * 1.1 : 1 - vm.ads * 0.3;
  const ctl = { mx: c.mx, my: c.my, lookX: c.lookX * lookK, lookY: c.lookY * lookK, jump: c.jump, sprint: run && !vm.scoped, crouch: crouchToggle || K.has('ControlLeft'), ads: K.has('M2') || K.has('Tmsl') };
  if (stage === 'play' && !finale) {
    G.stats.time += dt;
    player.update(dt, ctl);
    // 後座造成的鏡頭上揚（大部分會回來）
    recoilV -= recoil * 60 * dt; recoilV *= Math.exp(-14 * dt); recoil += recoilV * dt;
    player.pitch = clamp(player.pitch + recoilV * dt * 0.35, -1.45, 1.45);
  }
  // 鏡頭
  if (!finale) {
    const eyeY = player.pos.y + player.eyeH;
    const bob = player.grounded ? Math.sin(player.stepPh * Math.PI * 2) * 0.025 * Math.min(1, player.moveK) * (1 - vm.ads * 0.8) : 0;
    let yaw = player.yaw, pitch = player.pitch + recoil;
    // 狙擊鏡晃動（屏息幾乎不動）
    if (vm.scoped) { const k = vm.holding ? 0.1 : 1 + player.stam; yaw += Math.sin(G.t * 0.9) * 0.0035 * k + Math.sin(G.t * 2.3) * 0.0012 * k; pitch += Math.sin(G.t * 1.3) * 0.003 * k; }
    shakeK *= Math.exp(-dt * 5);
    const sh = shakeK * 0.02;
    camera.position.set(player.pos.x, eyeY + Math.abs(bob), player.pos.z);
    camera.rotation.set(pitch + (Math.random() - 0.5) * sh, yaw + Math.PI + (Math.random() - 0.5) * sh, bob * 0.3 + (Math.random() - 0.5) * sh * 0.5);
    G.playerEye.set(player.pos.x, eyeY, player.pos.z);
    if (player.dead) { camera.position.y = player.pos.y + 0.35; camera.rotation.z = 0.7; }
  } else updateFinale(dt);
  // FOV：舉槍放大（長槍：進鏡才放大）
  const W = vm.W, fovT = lerp(FOV, W.fov, vm.cur === 'rifle' ? (vm.scoped ? 1 : vm.ads * 0.2) : vm.ads) + player.sprintK * 4;
  camera.fov = vm.scoped ? fovT : lerp(camera.fov, fovT, 1 - Math.exp(-dt * 18));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // 武器
  if (stage === 'play' && !finale && !player.dead) {
    const shot = vm.update(dt, { fire: K.has('M0') || K.has('Tfire'), ads: ctl.ads, reload: c.reload || input.pressed('Tsaber'), swap: input.pressed('KeyQ') || input.pressed('Tcannon'), swapTo: input.pressed('Digit1') ? 'rifle' : input.pressed('Digit2') ? 'pistol' : null, hold: run }, player, { x: c.lookX, y: c.lookY });
    if (shot) playerShoot(shot);
  } else if (player.dead) { vm.holder.visible = false; vm.arms.root.visible = false; }
  // 視角場景的光：在陰影裡嗎（往太陽方向打一條線）
  const inShade = !!solid.ray(G.playerEye, world.lightDir, 80);
  vm.light(camera, world.lightDir, null, inShade, dt);
  if (vm.scoped) { const d = camera.getWorldDirection(new THREE.Vector3()); const h = solid.ray(G.playerEye, d, 400); G.scopeRange = h ? h.t : 0; }
  // 敵人、光彈、遭遇戰
  for (const e of G.enemies) e.update(dt);
  updateBolts(dt);
  D.update(dt);
  if (stage === 'play' && !finale) { updateEncounters(); updateHatch(dt); }
  updateMechWalk(dt);
  // 後製：受傷、低血量
  dmgFlash *= Math.exp(-dt * 4);
  post.u.damage.value = Math.min(1, dmgFlash * 0.8);
  post.u.danger.value = player.hp < 35 && !player.dead ? 0.6 : 0;
  audio.lowHealth(player.hp < 35 && !player.dead && stage === 'play');
  audio.setListener(camera.position, camera.getWorldDirection(_w));
  audio.breath(player.stam);
  audio.setIntensity(active.length ? 1 : 0.3);
  world.followShadow(camera.position);
  world.update(dt);
  fx.update(dt, true);
  post.render(clock.elapsedTime);
  hud.draw(dt, G);
  input.endFrame();
}
frame();
if (q.has('ch')) launch(+q.get('ch'));
