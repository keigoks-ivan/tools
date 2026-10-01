// 鋼鐵黃昏 零：主程式
//   流程：標題（選章節）→ 開場字卡 → 第一人稱戰鬥（章節／遭遇戰／檢查點）→ 機庫爬上鋼彈 → 跳進駕駛艙 → 接到《鋼鐵黃昏》的駕駛艙
//   除錯：?ch=1..3 直接開章、?x=&z=&yaw= 指定位置、?god 無敵、?mute 靜音、?final 直接到最後一幕
import * as THREE from 'three';
import { qualityLevel, pixelRatio, FrameGate } from '../runtime.js';

// 本篇的 env.js 用相對路徑 './assets/' 讀天空、HDR、城市貼圖：
//   前傳有縮小的 webp 版（assets/env/，遠景看不出差別、下載少 12 MB）；沒有的才去本篇資料夾拿
const LITE = new Set(['grass_diff', 'grass_nor', 'grass_arm', 'asphalt_diff', 'asphalt_nor', 'asphalt_arm', 'rubble_diff', 'rubble_nor', 'rock_diff', 'rock_nor', 'rock_arm', 'sky',
  'wear_mask', 'wear_nor', 'frame_mask', 'frame_nor', ...['glass', 'office', 'brick', 'concrete', 'brick2'].flatMap((f) => ['col', 'nor', 'arm'].map((k) => `fac_${f}_${k}`))]);
const lite = (u) => {
  if (!u.startsWith('./assets/')) return u;
  const name = u.slice(9), base = name.replace(/\.jpg$/, '');
  return LITE.has(base) ? './assets/env/' + base + '.webp' : '../assets/' + name;
};
// 大檔案改從 jsDelivr 下載（見 ../cdn.js；不能用時照舊從本站）
const cdn = await import('../cdn.js').then((m) => m.useCDN()).catch(() => null);
THREE.DefaultLoadingManager.setURLModifier((u) => { const v = lite(u); return cdn ? cdn(v) : v; });

const q = new URLSearchParams(location.search);
const campaign = document.body.dataset.campaign === 'lastline';
let resumeSave = false;
const readSave = (key) => { try { return JSON.parse(localStorage.getItem('lastline.' + key)); } catch { return null; } };
const writeSave = (key, value) => { try { localStorage.setItem('lastline.' + key, JSON.stringify(value)); } catch {} };
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const bar = document.querySelector('#bar i'), status = $('status');
let prog = 0; const step = (k) => { prog = Math.min(1, prog + k); bar.style.width = (prog * 100).toFixed(0) + '%'; };

const [{ loadAssets, World }, { Post }, { Mech, initMechMaterials }, { loadSurfaces, Solid }, { buildMap }, { HumanKit, wrap }, { ViewModel, WEAPONS }, { FXL }, { HUD }, { Pilot }, { Trooper, Drone }, { Input }, S, { Models, Placer }] = await Promise.all([
  import('../env.js'), import('../post.js'), import('../mechs.js'), import('./kit.js'), import(campaign ? '../lastline/map.js' : './map.js'), import('./human.js'), import('./viewmodel.js'),
  import('./fxl.js'), import('./hud.js'), import('./player.js'), import('./ai.js'), import('../input.js'), import(campaign ? '../lastline/script.js' : './script.js'), import('./models.js'),
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
status.textContent = campaign ? '建立港區' : '建立街區';
await new Promise((r) => setTimeout(r, 0));
initMechMaterials(A);
const world = new World(renderer, scene, A, { terrainSegments: 72, city: !campaign });
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
    if (o.isInstancedMesh && !(o.material && o.material.isMeshBasicMaterial)) { o.visible = false; o.userData.suppressFoliage=true; (world.cityInst ||= []).push(o); return; }   // 第 6 章開機體會再打開
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
// 黃昏的戰場：遠處被煙塵蓋成暖灰色（霧濃一點、偏褐）；太陽偏暖、陰影保留天空的冷色；天空地平線一層霾（全部只改參數，不多畫東西）
scene.fog.color.setRGB(0.38, 0.325, 0.28); scene.fog.density = 0.003;
world.sun.color.setRGB(1.0, 0.81, 0.62); world.sun.intensity = 4.2;
scene.environmentIntensity = 0.42;
scene.traverse((o) => {
  if (o.isHemisphereLight) { o.color.setRGB(0.3, 0.4, 0.58); o.groundColor.setRGB(0.09, 0.07, 0.05); o.intensity = 0.3; }
  const u = o.material && o.material.uniforms;
  if (!campaign && u && u.fogCol && u.sunFog && !o.material.userData.haze) {
    o.material.userData.haze = true; u.fogCol.value.copy(scene.fog.color); u.gain.value *= 0.9;
    o.material.fragmentShader = o.material.fragmentShader.replace('gl_FragColor = vec4(c, 1.0);', `
        float hz = 1.0 - smoothstep(-1.0, 30.0, el);
        c = mix(vec3(dot(c, vec3(0.3, 0.55, 0.15))), c, 0.8) * vec3(1.02, 0.97, 0.9);   // 褪色、偏暖：下午的藍天變成煙塵裡的黃昏
        c = mix(c, fogCol * (1.0 + s * 1.6), hz * 0.8);
        gl_FragColor = vec4(c, 1.0);`);
    o.material.needsUpdate = true;
  }
});
const solid = new Solid();
const placer = new Placer(MODELS, solid);
const map = buildMap(scene, SURF, solid, placer, A, world);
const placed = placer.build(scene);
console.log('[zero] 掃描模型', placed);
// 點光源：每個像素都要把場景裡的每一盞點光算一遍（離多遠都算），地圖六盞很貴。
//   改成固定三盞，每次畫之前搬到離鏡頭最近的三個燈位（機庫三盞同時亮，其他地方最多兩盞）：畫面一樣，shader 少算三盞
const mapLights = map.lights.slice(0, 3).map((L) => { const l = new THREE.PointLight(L.c, 0, L.d, 2); scene.add(l); return l; });
const lightOrder = map.lights.map((L, i) => [0, i]);
scene.onBeforeRender = (r, s, cam) => {
  for (const o of lightOrder) { const L = map.lights[o[1]]; o[0] = cam.position.distanceTo(L.p) - L.d; }
  lightOrder.sort((a, b) => a[0] - b[0]);
  mapLights.forEach((l, k) => { const L = map.lights[lightOrder[k][1]]; l.color.set(L.c); l.intensity = L.i; l.distance = L.d; l.position.copy(L.p); l.updateMatrixWorld(); });
};
vScene.environment = world.envMap;

const post = new Post(renderer, scene, camera, vScene, vCam);
post.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 0.8, scale: 1.1, distanceFallOff: 1 });
post.gtao.updatePdMaterial({ radius: 4, rings: 2, samples: 12 });
post.u.vignette.value = 0.44; post.u.grain.value = 0.02;

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
window.__renderer = renderer; window.__scene = scene; window.__solid = solid; window.__map = map; window.__hero = hero; window.__world = world;

// ---------------------------------------------------------------- 遊戲狀態（AI 也讀這個）
const NADE_START = 3, NADE_MAX = 5;   // 玩家手榴彈：每章開頭至少幾顆、最多帶幾顆
const G = {
  scene, solid, kit, audio, fx, player, vm, hud, t: 0, nextId: 1, enemies: [], playing: false,
  playerEye: new THREE.Vector3(), aimDir: new THREE.Vector3(0, 0, 1), ads: 0, diff: { acc: 1, dmg: 1 }, bolts: [], grenades: [], nadeN: 3, loot: [],
  chapterTag: '', objText: '', objSub: '', lastHit: -99, scopeRange: 0, stats: { shots: 0, hits: 0, kills: 0, heads: 0, taken: 0, time: 0 },
  // 同時開火的敵人上限（避免四面八方同時打）
  canShoot(e) { let n = 0; for (const o of G.enemies) if (o !== e && !o.dead && o.burst > 0 && o.sees && (!o.s || o.s.mode === 'aim')) n++; return n < 3; },
  // 敵人丟手榴彈：拋物線丟到目標附近（落點有一點誤差），撞牆撞地會彈，2.6 秒後爆炸
  throwGrenade(from, to, owner) {
    to.x += (Math.random() - 0.5) * 2.4; to.z += (Math.random() - 0.5) * 2.4; to.y = solid.floorAt(to.x, to.z, to.y + 1) + 0.1;
    const d = to.clone().sub(from), T = clamp(Math.hypot(d.x, d.z) / 11, 0.9, 1.6);
    const vel = d.divideScalar(T).add(new THREE.Vector3(0, 0.5 * 9.8 * T, 0));
    G.spawnNade(from, vel, 2.6, owner);
    audio.radio('enemy', owner ? owner.pos : from);
  },
  // mine＝玩家丟的：爆炸比較大；落地離玩家很近（彈回來）才警告；敵人看到會跑開（ai.js）
  spawnNade(from, vel, fuse, owner, mine = false) {
    const m = new THREE.Group(); m.add(new THREE.Mesh(NADE.body, NADE.metal)); const lamp = new THREE.Mesh(NADE.lamp, NADE.red); lamp.position.y = 0.06; lamp.userData.noAO = true; m.add(lamp);
    m.children[0].castShadow = true; m.position.copy(from); scene.add(m);
    G.grenades.push({ p: m.position, vel, t: 0, fuse, m, lamp, landed: false, landT: 0, warned: false, owner, mine });
  },
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
window.__G = G; window.__S = S;   // 測試用
// 測試用：看目前章節、已清的段落
window.__flow = { get chapter() { return chapter; }, get done() { return [...done]; }, get active() { return active.map((a) => a.E.id); }, get mech() { return !!mechWalk; } };
// 可破壞的道具：地圖建好時登記的全部接上
const D = (G.destruct = new Destruct(G));
for (const r of placer.reg) D.register(r.name, r.h, r.box);
for (const w of placer.bagWalls) D.bagWall(w.box, w.bags);
for (const s of map.b.breakables) D.surface(s);
// 任務目標（map.targets）接上對應的可破壞物件
for (const id in map.targets) { const T = map.targets[id]; T.obj = D.objs.find((o) => o.handle === T.h) || null; }
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ---------------------------------------------------------------- 設定
const store = { get: (k, d) => { try { const v = localStorage.getItem((S.SAVE_KEY || 'zero') + '.' + k); const n = v === null ? d : +v; return Number.isFinite(n) ? n : d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem((S.SAVE_KEY || 'zero') + '.' + k, v); } catch (e) {} } };
let quality = store.get('q', 1), M6 = null;
function setQuality(qv) {
  qv = qualityLevel(qv); quality = qv; store.set('q', qv);
  renderer.setPixelRatio(pixelRatio(innerWidth, innerHeight, devicePixelRatio, qv));
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
  post.setQuality(qv);
  post.gtao.enabled = qv > 1;   // AO 要整個場景多畫一次：只在高畫質開
  world.sun.shadow.mapSize.setScalar([1024, 2048, 4096][qv]);
  world.sun.shadow.needsUpdate = true;
  if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  renderer.shadowMap.type = qv > 0 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  fx.quality = qv;
  if (M6) M6.setQuality(qv);
  document.querySelectorAll('[data-q]').forEach((b) => { b.style.background = +b.dataset.q === qv ? 'rgba(127,243,255,0.25)' : ''; });
}
setQuality(quality);
document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => setQuality(+b.dataset.q)));
const sens = $('sens');
input.sens = store.get('sens', 1); sens.value = input.sens;
sens.addEventListener('input', () => { input.sens = +sens.value; store.set('sens', sens.value); });
// 音量（全部聲音／配樂），記在這台瀏覽器；?mute 測試時維持靜音
const vol = $('vol'), mvol = $('mvol');
vol.value = store.get('vol', 0.8); mvol.value = store.get('mvol', 0.7);
const applyVol = () => {
  if (!q.has('mute')) audio.setVolume(+vol.value);
  audio.setMusicVolume(+mvol.value);
  $('volN').textContent = Math.round(vol.value * 100) + '%'; $('mvolN').textContent = Math.round(mvol.value * 100) + '%';
};
vol.addEventListener('input', () => { store.set('vol', vol.value); applyVol(); });
mvol.addEventListener('input', () => { store.set('mvol', mvol.value); applyVol(); });
applyVol();
const de = document.documentElement, fsBtns = document.querySelectorAll('.fs');
const fsOn = () => document.fullscreenElement || document.webkitFullscreenElement;
if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtns.forEach((b) => { b.style.display = 'none'; });
fsBtns.forEach((b) => b.addEventListener('click', () => { try { const p = fsOn() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (de.requestFullscreen || de.webkitRequestFullscreen).call(de, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) {} }));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('blur', () => pause());
addEventListener('resize', () => {
  renderer.setPixelRatio(pixelRatio(innerWidth, innerHeight, devicePixelRatio, quality));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); vCam.updateProjectionMatrix();
  post.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- 章節／遭遇戰
const done = new Set();         // 已清完的遭遇
let active = [];                // 進行中 {E, list}
let chapter = 1, checkpoint = null, stage = 'play';
let mechWalk = null, finale = null, hatchOpen = 0, alarmOn = false;   // M6＝第 6 章（mech6.js）進行中
const progress = () => clamp(store.get('ch', 1), 1, S.CHAPTERS.length);
function saveFoot() {
  if (!campaign || !checkpoint) return;
  writeSave('checkpoint', { chapter, foot: { layout: S.LAYOUT, p: checkpoint.p.toArray(), yaw: checkpoint.yaw, done: checkpoint.done, nades: checkpoint.nades, picked: [...pickedItems] }, stats: G.stats });
}

// 手榴彈的樣子：墨綠色小圓柱＋一顆閃爍的紅燈（越接近爆炸閃越快）
const NADE = { body: new THREE.CylinderGeometry(0.045, 0.05, 0.12, 10), lamp: new THREE.SphereGeometry(0.018, 8, 6),
  metal: new THREE.MeshStandardMaterial({ color: 0x3b4430, roughness: 0.6, metalness: 0.5 }), red: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.25) }) };
function updateGrenades(dt) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i]; g.t += dt;
    g.lamp.visible = Math.sin(g.t * (8 + g.t * 10)) > 0;
    if (!g.rest) {
      g.vel.y -= 9.8 * dt;
      const step = g.vel.length() * dt, dir = g.vel.clone().normalize(), hit = step > 1e-4 ? solid.ray(g.p, dir, step + 0.06) : null;
      if (hit && hit.n && Math.abs(hit.n.y) < 0.6) { const n = hit.n; const vn = g.vel.dot(n); g.vel.addScaledVector(n, -1.6 * vn).multiplyScalar(0.45); }
      else g.p.addScaledVector(g.vel, dt);
      const fl = solid.floorAt(g.p.x, g.p.z, g.p.y + 0.3);
      if (g.p.y < fl + 0.06) {
        g.p.y = fl + 0.06;
        if (!g.landed) { g.landed = true; g.landT = g.t; audio.grenade(g.p.clone()); }
        g.vel.y = Math.abs(g.vel.y) * 0.25; g.vel.x *= 0.55; g.vel.z *= 0.55;
        if (g.vel.length() < 0.6) { g.rest = true; g.vel.set(0, 0, 0); }
      }
      g.m.rotation.x += dt * 9; g.m.rotation.z += dt * 5;
    }
    if (g.landed && !g.warned && g.p.distanceTo(player.pos) < (g.mine ? 4.5 : 8) && !player.dead) { g.warned = true; hud.note('手榴彈！快離開', '#ff5b4d'); }
    if (g.t >= g.fuse) {
      const p = g.p.clone().add(new THREE.Vector3(0, 0.3, 0)), s = g.mine ? 1 : 0.8;
      const hp0 = g.mine ? new Map(G.enemies.filter((e) => !e.dead).map((e) => [e, e.hp])) : null;
      if (G.destruct) G.destruct.explode(p, s); else { fx.explode(p, s); audio.explosion(p, 0.6); G.splash(p, 4.5 * s, 110 * s); }
      if (hp0) nadeHits(hp0);
      scene.remove(g.m); G.grenades.splice(i, 1);
    }
  }
}
function clearEnemies() {
  for (const e of G.enemies) e.dispose();
  for (const g of G.grenades) scene.remove(g.m);
  for (const L of G.loot) scene.remove(L.m); G.loot.length = 0;
  G.enemies.length = 0; G.bolts.length = 0; fx.bolts.length = 0; G.grenades.length = 0;
}
function spawn(def) {
  const e = def.type === 'drone' ? new Drone(G, def) : new Trooper(G, def);
  G.enemies.push(e); return e;
}
const doneT = {};   // 每段清完的時間（after＋wait 用）
function markDone(id, old = false) { done.add(id); doneT[id] = old ? -1e9 : campaign ? G.t : performance.now() / 1000; }   // old＝讀檔／選關還原的，不必再等 wait
function startEncounter(E) {
  const list = E.enemies.map(spawn);
  // hold＝守住幾秒（期間一波波增援）；stealth＝別被發現（被發現就叫增援）；targets＝要炸掉的東西；pickups＝要撿的東西（全部都要做完、敵人全倒才算清完）
  const tg = E.targets ? E.targets.map((id) => map.targets[id] && map.targets[id].obj).filter(Boolean) : null;
  // 已經撿過的東西（死掉重來時）算數，不用再撿一次（模型也已經收起來了）
  const got = new Set((E.pickups || []).map((P, i) => (pickedItems.has(P.id) ? i : -1)).filter((i) => i >= 0));
  active.push({ E, list, picked: false, t0: G.t, n: list.length, holdT: 0, wave: 0, spotted: false, tg, got, beats: new Set() });
  for (const [who, text, now] of E.lines) hud.say(who, text, 3.6, now);
  if (E.lines.length) audio.radio('in');
  G.objText = list.length ? E.fight || '擊倒所有敵人' : E.obj;   // 開打後改成「要打誰」，不要還寫著「爬上高架道路」
  hud.obj = E.pickup ? guideObj(E) : null;
  if (E.alarm && !alarmOn) { alarmOn = true; audio.alarm(true); }
}
// 這一段做完了沒：守的時間到、目標都炸掉、東西都撿了、敵人全倒
function encDone(a) {
  const E = a.E;
  if (E.hold && a.holdT < E.hold.t) return false;
  if (E.pickup && !a.picked) return false;
  if (E.pickups && a.got.size < E.pickups.length) return false;
  if (a.tg && a.tg.some((o) => o.alive)) return false;
  return a.list.every((e) => e.dead);
}
// 任務進行中：守點的計時與增援、潛行被發現、炸掉目標、撿東西（按 E）
const mm = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const pickedItems = new Set();   // 這一章撿過的東西（map.items 的 id）
function updateMissions(dt) {
  hud.pins.length = 0;
  for (const a of active) {
    const E = a.E;
    for (let i = 0; i < (E.beats || []).length; i++) {
      const b = E.beats[i];
      if (a.beats.has(i) || G.t - a.t0 < b.t) continue;
      a.beats.add(i);
      for (const [w, t, now] of b.lines) hud.say(w, t, 3.4, now ?? true);
      audio.radio('in');
    }
    if (E.hold && a.holdT < E.hold.t) {
      a.holdT += dt;
      const H = E.hold, due = H.waves ? Math.min(H.waves.length, Math.floor(a.holdT / (H.gap || 15))) : 0;
      while (a.wave < due) {
        for (const d of H.waves[a.wave]) a.list.push(spawn({ alert: true, ...d }));
        if (H.lines && H.lines[a.wave]) for (const [w, t, now] of H.lines[a.wave]) hud.say(w, t, 3.4, now);
        a.wave++; hud.note('敵方增援', '#ff6a55');
      }
      if (a.holdT >= H.t) { hud.note('撐過去了', '#ffb347'); if (H.done) for (const [w, t, now] of H.done) hud.say(w, t, 3.4, now); }
    }
    if (E.stealth && !a.spotted && a.list.some((e) => !e.dead && e.state === 'combat')) {
      a.spotted = true;
      for (const d of E.stealth.reinforce || []) a.list.push(spawn({ alert: true, ...d }));
      for (const [w, t, now] of E.stealth.lines || []) hud.say(w, t, 3.4, now ?? true);
      hud.note('被發現了！', '#ff5b4d');
      if (E.stealth.alarm && !alarmOn) { alarmOn = true; audio.alarm(true); }
    }
    if (a.tg) {
      const left = a.tg.filter((o) => o.alive);
      if (left.length !== a.tgLeft) { if (a.tgLeft !== undefined) hud.note(`${E.tgName || '目標'} ${a.tg.length - left.length}/${a.tg.length}`, '#ffb347'); a.tgLeft = left.length; }
      for (const o of left) hud.pins.push({ p: o.pos, h: 1.2 });
    }
    if (E.pickups) {
      E.pickups.forEach((P, i) => {
        if (a.got.has(i)) return;
        const it = map.items[P.id]; if (!it) { a.got.add(i); return; }
        hud.pins.push({ p: it.p, h: 0.6 });
        const near = Math.hypot(player.pos.x - it.p.x, player.pos.z - it.p.z) < 2 && Math.abs(player.pos.y - it.p.y) < 1.6;
        if (!near || player.dead) return;
        hud.prompt = P.text || '按 E　拿取';
        if (input.pressed('KeyE') || input.pressed('Tlock')) {
          a.got.add(i); pickedItems.add(P.id); hud.prompt = null; if (it.h) it.h.hide();
          hud.note(`${E.itemName || '情報'} ${a.got.size}/${E.pickups.length}`, '#ffb347');
          if (P.lines) for (const [w, t, now] of P.lines) hud.say(w, t, 3.4, now);
        }
      });
    }
  }
}
// 下一段還沒清的遭遇
function objective() { return S.ENCOUNTERS.find((E) => E.ch === chapter && !done.has(E.id)); }
// 遭遇開打前的導引點
function guideFor(E) {
  const z = E.guide || [0, 0];
  return new THREE.Vector3(z[0], 1.5, z[1]);
}
// 帶路：一串轉彎點 [x, z, 高度?]，畫面上的指示和光柱一次只指下一個點，走到了就換下一個（不會直接指穿牆）
// 轉彎點如果剛好落在車子、沙包、護欄裡，推到旁邊最近的空地（地圖改了也不會指到東西裡面）
const pt3 = (w) => { const y = w[2] ?? 0, q = new THREE.Vector3(w[0], y, w[1]); for (let k = 0; k < 6; k++) if (!solid.pushOut(q, 0.55, y, y + 1.7, 0.45)) break; return new THREE.Vector3(q.x, y + 1.2, q.z); };
function routeObj(pts) { const route = pts.map(pt3), o = { route, i: 0, p: route[0].clone() }; startAt(o); return o; }
// 從哪一點開始帶：最近、同一層、看得到的那個轉彎點（打完仗人常常已經走過前面幾個點，不要叫他走回頭路）
function startAt(o) {
  const P = player.pos, eye = new THREE.Vector3(P.x, P.y + player.eyeH, P.z), R = o.route;
  let best = 0, bd = 1e9;
  for (let j = 0; j < R.length; j++) {
    const w = R[j], d = Math.hypot(w.x - P.x, w.z - P.z);
    if (Math.abs(w.y - 1.2 - P.y) < 1.5 && d < bd && solid.sees(eye, w)) { bd = d; best = j; }
  }
  o.i = best; o.p.copy(R[best]);
}
const guideObj = (E) => routeObj([...(E.route || []), [E.guide[0], E.guide[1], E.guide[2]]]);
const markObj = (E) => routeObj([...(E.nextRoute || []), [E.mark.x, E.mark.z, E.mark.y]]);
function updateGuide(dt) {
  const o = hud.obj; beacon.visible = false;
  if (!o || !o.route) return;
  // 距離把高度算進去（樓梯上下層不會搞混）：走到這一點、或已經比這一點更接近下一點（走過頭）才換下一點
  const P = player.pos, R = o.route, d3 = (w, x, y, z) => Math.hypot(w.x - x, (w.y - 1.2 - y) * 1.5, w.z - z), near = (w, r) => d3(w, P.x, P.y, P.z) < r;
  for (let j = R.length - 1; j > o.i; j--) if (near(R[j], 2)) { o.i = j; break; }
  // 掉到下層（比現在這一點低 2.5 m 以上超過 1 秒）：改指最近、同一層的點，重新走一次
  //（爬樓梯時會比目標低，所以要比上一個點也低才算掉下去）
  const lo = Math.min(R[o.i].y, R[Math.max(0, o.i - 1)].y) - 1.2;
  o.fallT = lo - P.y > 2.5 ? (o.fallT || 0) + dt : 0;
  if (o.fallT > 1) { let best = -1, bd = 1e9; for (let j = 0; j < R.length; j++) { const d = d3(R[j], P.x, P.y, P.z); if (Math.abs(R[j].y - 1.2 - P.y) < 1.5 && d < bd) { bd = d; best = j; } } if (best >= 0) o.i = best; o.fallT = 0; }
  while (o.i < R.length - 1) {
    const a = R[o.i], b = R[o.i + 1];
    // 走過頭：人在「這一點→下一點」那條線上（離線 2.2 m 內、同一層）、而且已經往下一點走了一段
    const ax = b.x - a.x, az = b.z - a.z, L2 = ax * ax + az * az || 1, t = ((P.x - a.x) * ax + (P.z - a.z) * az) / L2;
    const side = Math.hypot(P.x - (a.x + ax * t), P.z - (a.z + az * t)), sameY = Math.abs(a.y + (b.y - a.y) * Math.min(1, Math.max(0, t)) - 1.2 - P.y) < 1.5;
    if (near(a, 1.8) || (t > 0.15 && side < 2.2 && sameY)) o.i++; else break;
  }
  o.p.copy(R[o.i]);
  // 剩下的路（給畫面上的距離）
  let d = Math.hypot(o.p.x - P.x, o.p.z - P.z);
  for (let j = o.i; j < R.length - 1; j++) d += R[j].distanceTo(R[j + 1]);
  o.left = d;
  // 光柱：立在下一個點，從建築後面也看得到；快到最後一點時淡掉
  const last = o.i === R.length - 1, dd = Math.hypot(o.p.x - P.x, o.p.z - P.z);
  beacon.visible = !(last && dd < 3);
  beacon.position.set(o.p.x, o.p.y - 1.2, o.p.z);
  beaconT += dt; beacon.children[0].material.opacity = 0.16 + 0.07 * Math.sin(beaconT * 3); beacon.children[1].rotation.z += dt * 0.8;
}
let beaconT = 0;
const beacon = new THREE.Group();
{
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 34, 14, 1, true).translate(0, 17, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.1, 0.25), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32, 1, 0, Math.PI * 1.6).rotateX(-Math.PI / 2).translate(0, 0.05, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.3), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.order = 'XZY';
  for (const m of [beam, ring]) { m.userData.noAO = true; m.frustumCulled = false; }
  beacon.add(beam, ring); beacon.visible = false; scene.add(beacon);
}
// 撿東西的段落（啟動金鑰）：走近按 E
function updatePickup() {
  const a = active.find((x) => x.E.pickup && !x.picked);
  if (map.keyMesh) map.keyMesh.visible = !done.has('KEY') && !(a && a.picked);
  if (!a) return;
  const at = map.marks[a.E.pickup.at];
  const near = Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < 2.3 && Math.abs(player.pos.y - at.y) < 1.5;
  if (!near) return;
  hud.prompt = a.E.pickup.text;
  if (input.pressed('KeyE') || input.pressed('Tlock')) { a.picked = true; hud.prompt = null; audio.radio('in'); }
}
const toCockpit = () => { G.objText = '爬上維修架，進入駕駛艙'; hud.obj = routeObj(S.HATCH_ROUTE); };

function startChapter(n) {
  pickedItems.clear();
  clearEnemies(); fx.clear(); D.clear(); active = [];
  chapter = n;
  const C = S.CHAPTERS[n - 1];
  done.clear();
  for (const E of S.ENCOUNTERS) if (E.ch < n) markDone(E.id, true);
  player.reset(map.marks[C.start].clone(), C.yaw);
  G.nadeN = NADE_START;
  if (q.has('x')) player.reset(new THREE.Vector3(+q.get('x'), +(q.get('y') || 0), +q.get('z')), +(q.get('yaw') || 0));
  vm.refill();
  checkpoint = { p: player.pos.clone(), yaw: player.yaw, done: [...done], ch: n, nades: G.nadeN };
  G.chapterTag = `CHAPTER ${n}　${C.en}`;
  const first = objective();
  G.objText = first ? first.obj : '';
  hud.obj = first ? guideObj(first) : null;
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
    if (E.after ? done.has(E.after) && (campaign ? G.t : performance.now() / 1000) - (doneT[E.after] ?? 0) > (E.wait || 0) : E.trigger(p)) startEncounter(E);
  }
  // 清完
  for (const a of [...active]) {
    if (!encDone(a)) continue;
    active.splice(active.indexOf(a), 1);
    markDone(a.E.id);
    for (const [w, t, now] of a.E.done) hud.say(w, t, 3.6, now);
    if (a.E.done.length) audio.radio('in');
    hud.note(a.E.pickup ? '取得啟動金鑰  KEY ACQUIRED' : '區域清除  AREA CLEAR', '#ffb347');
    checkpoint = { p: player.pos.clone(), yaw: player.yaw, done: [...done], ch: chapter, nades: G.nadeN };
    saveFoot();
    const nx = objective();
    if (a.E.id === 'G2') { toCockpit(); if (alarmOn) { alarmOn = false; audio.alarm(false); } }
    else if (nx && nx.ch === chapter) { G.objText = nx.obj; hud.obj = guideObj(nx); }
    else if (a.E.mark) { G.objText = a.E.next || a.E.obj; hud.obj = markObj(a.E); }
    // 屍體多了就清掉最舊的
    const dead = G.enemies.filter((e) => e.dead);
    if (dead.length > 14) for (const e of dead.slice(0, dead.length - 14)) { e.dispose(); G.enemies.splice(G.enemies.indexOf(e), 1); }
  }
  // 章節終點（script.js 的 CHAPTERS[n].end）
  const end = S.CHAPTERS[chapter - 1].end;
  if (end && done.has(end.after) && end.at(p)) nextChapter(chapter + 1);
  // 獵犬機走過圍牆外（script.js 的 MECH_WALK）
  const MW = S.MECH_WALK;
  if (chapter === MW.ch && !mechWalk && !G.mechDone && done.has(MW.after) && MW.at(p)) {
    G.mechDone = true; mechWalk = { t: 0, i: 0, stepT: 0 }; hound.root.visible = true; hound.root.position.copy(map.marks.mechPath[0]);
    // 最後一句（「它往北走了」）等獵犬機真的走完才講
    for (const [w, t, now] of S.LINES.mech.slice(0, -1)) hud.say(w, t, 3.4, now); audio.radio('in');
  }
}
// 打仗時：左上角多一行「還剩幾個敵人」；剩 3 個以內又 6 秒沒打中人、或 20 秒都沒打中人時，畫面上標出剩下的敵人在哪（不會打完一半找不到人）
function updateFoes() {
  hud.foes.length = 0; G.objSub = '';
  const a = active[0]; if (!a) return;
  const E = a.E, left = a.list.filter((e) => !e.dead), sub = [];
  if (E.hold) sub.push(a.holdT < E.hold.t ? `撐住 ${mm(E.hold.t - a.holdT)}` : '時間到　清掉剩下的');
  if (E.stealth && !a.spotted) sub.push('別被發現');
  if (a.tg) sub.push(`${E.tgName || '目標'} ${a.tg.filter((o) => !o.alive).length}/${a.tg.length}`);
  if (E.pickups) sub.push(`${E.itemName || '情報'} ${a.got.size}/${E.pickups.length}`);
  if (left.length) sub.push(`還剩 ${left.length} 個敵人`);
  G.objSub = sub.join('　');
  if (left.length < a.n) { a.n = left.length; a.t0 = G.t; }   // 有人倒下也算「剛打到」
  if (!left.length) return;
  const quiet = G.t - Math.max(a.t0, G.lastHit);
  if ((left.length <= 3 && quiet > 6) || quiet > 20) for (const e of left) hud.foes.push({ p: e.pos, h: e.type === 'drone' ? 0.7 : 2.2 });
}
function nextChapter(n) {
  G.nadeN = Math.max(G.nadeN, NADE_START);   // 每章開頭至少補到 3 顆
  const C = S.CHAPTERS[n - 1];
  hud.title(`第 ${n} 章　${C.name}`, C.en, 4);
  chapter = n;
  G.chapterTag = `CHAPTER ${n}　${C.en}`;
  const L = S.LINES['ch' + n]; if (L) { audio.radio('in'); for (const [w, t] of L) hud.say(w, t, 3.8); }
  const first = objective();
  G.objText = first ? first.obj : ''; hud.obj = first ? guideObj(first) : null;
  checkpoint = { p: player.pos.clone(), yaw: player.yaw, done: [...done], ch: n, nades: G.nadeN };
  audio.music('battle', { stage: C.music });
  if (n > progress()) store.set('ch', n);
}

// ---------------------------------------------------------------- 開槍
// 子彈用的射線：碰撞盒是外接方塊，斜放的車和箱子四角、護欄頂上鋼筋環之間、手推車框架中間、沙包牆被打掉的缺口、樓梯斜坡上方其實是空的，
//   看得到人卻打不到（準心明明在頭上，子彈停在看不見的盒子）。打到這幾種盒子時，再對真正的形狀驗一次（掃描模型的網格、每一袋沙包、斜坡面），
//   是空的就穿過去。只給玩家的子彈用：走路碰撞、敵人視線照舊
const _rc = new THREE.Raycaster(), _pm = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), _hole = [];
_pm.matrixAutoUpdate = false;
// 模型 name 擺在 mat：射線打到網格的距離＋法線（沒打到＝null）
function meshHit(name, mat, o, d, far) {
  const M = MODELS.get(name); if (!M) return null;
  _rc.set(o, d); _rc.far = far; _pm.matrixWorld.copy(mat);
  let best = null;
  for (const p of M.parts) { _pm.geometry = p.geo; const h = _rc.intersectObject(_pm, false)[0]; if (h && (!best || h.distance < best.distance)) best = h; }
  if (!best) return null;
  const n = best.face ? best.face.normal.clone().transformDirection(mat) : d.clone().negate();
  if (n.dot(d) > 0) n.negate();
  return { t: best.distance, n };
}
// 盒子在射線上真正擋到的地方 {t, n}；是空的＝null；不用驗的（牆、地板、一般方塊）＝undefined
function realHit(b, o, d, far) {
  const ob = b.obj;
  if (b.ramp) {
    // 斜坡：頂面沿軸線從 y0 升到 y1（碰撞盒的射線把它當成半高的方塊），找射線第一次走到頂面以下的點
    let lo = 0, hi = far;
    for (const [oo, dd, mn, mx] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < mn || oo > mx) return null; continue; }
      let ta = (mn - oo) / dd, tb = (mx - oo) / dd; if (ta > tb) [ta, tb] = [tb, ta];
      lo = Math.max(lo, ta); hi = Math.min(hi, tb); if (lo > hi) return null;
    }
    const f = (t) => o.y + d.y * t - solid.top(b, o.x + d.x * t, o.z + d.z * t), f0 = f(lo), f1 = f(hi);
    const cross = () => lo + (hi - lo) * f0 / (f0 - f1);
    if (f0 <= 0) {
      // 鐵樓梯（map.js 的 P.stairs）底下是空的，只有踏板和兩側的樑：從底下穿過去不算，往上穿過踏板才算；水泥匝道底下是實心的
      if (b.mat !== 'metal' || f0 > -0.3) return { t: lo, n: d.clone().negate() };
      return f1 > 0 ? { t: cross(), n: d.clone().negate() } : null;
    }
    if (f1 > 0) return null;
    const s = (b.y1 - b.y0) / (b.ramp.axis === 'x' ? b.x1 - b.x0 : b.z1 - b.z0) * (b.ramp.dir > 0 ? 1 : -1);
    return { t: cross(), n: (b.ramp.axis === 'x' ? new THREE.Vector3(-s, 1, 0) : new THREE.Vector3(0, 1, -s)).normalize() };
  }
  if (ob && ob.kind === 'bagwall') { let best = null; for (const g of ob.bags) if (g.alive) { const h = meshHit('cement_bag', g.h.mat, o, d, far); if (h && (!best || h.t < best.t)) best = h; } return best; }
  if (b.obb) {
    // 斜放的方塊：盒子上有 obb＝{cx, cz, hx, hz, ry}（中心、半長寬、繞 Y 轉角，跟 kit.js 的 obox 同一套）就用斜方塊算，外接盒多出來的四角是空的
    const { cx, cz, hx, hz, ry } = b.obb, c = Math.cos(ry), s = Math.sin(ry), ox = o.x - cx, oz = o.z - cz;
    let lo = 0, hi = far, ax = 0;
    for (const [k, oo, dd, h] of [[0, ox * c - oz * s, d.x * c - d.z * s, hx + 0.04], [1, o.y, d.y, 0], [2, ox * s + oz * c, d.x * s + d.z * c, hz + 0.04]]) {   // 多 4 cm：邊框、門把凸出一點
      const mn = k === 1 ? b.y0 : -h, mx = k === 1 ? b.y1 : h;
      if (Math.abs(dd) < 1e-9) { if (oo < mn || oo > mx) return null; continue; }
      let ta = (mn - oo) / dd, tb = (mx - oo) / dd; if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > lo) { lo = ta; ax = k; } hi = Math.min(hi, tb); if (lo > hi) return null;
    }
    return { t: lo, n: ax === 1 ? new THREE.Vector3(0, d.y > 0 ? -1 : 1, 0) : d.clone().negate() };
  }
  if (ob && ob.handle && ob.name && MODELS.has(ob.name)) return meshHit(ob.name, ob.handle.mat, o, d, far);
  return undefined;
}
function shotRay(o, d, maxT) {
  let best = null, far = maxT;
  for (let k = 0; k < 10; k++) {
    const h = solid.ray(o, d, far);
    if (!h) break;
    const r = h.b ? realHit(h.b, o, d, far) : undefined;
    if (r === undefined) { best = h; break; }                 // 實心的：就是它
    if (r) { h.t = r.t; h.n = r.n; best = h; far = r.t; }     // 真的打到了，但點在盒子裡面：記下來，再找有沒有更近的
    _hole.push([h.b, h.b.noRay]); h.b.noRay = true;           // 驗過的盒子這次先不算
  }
  for (const [b, v] of _hole) b.noRay = v;
  _hole.length = 0;
  return best;
}
G.shotRay = shotRay;
let recoilV = 0, recoil = 0;
function playerShoot(shot) {
  const eye = G.playerEye, W = shot.W;
  const d = camera.getWorldDirection(new THREE.Vector3());
  if (shot.spread > 0) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * shot.spread;
    const U = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), R = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    d.addScaledVector(U, Math.sin(a) * r).addScaledVector(R, Math.cos(a) * r).normalize();
  }
  const wh = shotRay(eye, d, W.range);
  let maxT = wh ? wh.t : W.range, target = null, part = null;
  for (const e of G.enemies) { const h = e.hitTest(eye, d, maxT); if (h) { maxT = h.t; target = e; part = h.part; } }
  const end = eye.clone().addScaledVector(d, maxT);
  const muzzle = vm.muzzleWorld(camera);
  if (shot.weapon === 'rifle') { fx.beam(muzzle, end, 'rifle'); fx.muzzle(muzzle, d, [0.6, 2.6, 4.2], true); }
  else { pistolBolts.push({ p: muzzle.clone(), dir: end.clone().sub(muzzle).normalize(), to: end.clone(), speed: 240, len: 0.8, w: 0.022, c: [0.5, 2.2, 3.8] }); fx.muzzle(muzzle, d, [0.5, 2.2, 3.8]); }
  G.stats.shots++;
  if (target) {
    const dmg = part === 'head' ? W.head : part === 'limb' ? W.limb : W.dmg;
    const armored = !!(target.T && target.T.armor && part !== 'head');   // 重裝兵打身體：裝甲擋掉四成
    const killed = target.damage(dmg, d.clone(), part, player.pos);
    G.stats.hits++; G.lastHit = G.t;
    // 打中人的火花和打牆分得出來：牆是青色，打中人是橘色（爆頭大一點、偏黃），重裝兵裝甲是冷白的金屬火花
    const n = d.clone().negate(), big = shot.weapon === 'rifle' ? 1.25 : 0.85;
    if (target.type === 'drone') fx.impact(end, n, 'metal', [3, 1.6, 0.6], big);
    else if (armored) fx.impact(end, n, 'armor', [2.4, 2.8, 3.4], big * 1.2);
    else fx.impact(end, n, 'body', part === 'head' ? [4, 2.4, 0.9] : [3.4, 1.3, 0.45], part === 'head' ? big * 1.4 : big);
    // 命中聲：放在往敵人方向 3 m 的地方（遠的敵人也聽得清楚、分得出方向）；打身體是悶的肉聲、裝甲是鏗、爆頭清脆
    audio.hit(eye.clone().addScaledVector(d, Math.min(maxT, 3)), part === 'head' ? 'head' : target.type === 'drone' ? 'metal' : armored ? 'armor' : 'body');
    audio.hitmark(killed ? 'kill' : part === 'head' ? 'head' : 'hit');
    hud.marker(killed ? 'kill' : part === 'head' ? 'head' : armored ? 'armor' : 'hit');
    if (armored && !killed && !G.armorTip) { G.armorTip = true; hud.note('重裝兵有裝甲　打頭  AIM FOR THE HEAD', '#9ec3dc'); }
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
  if (q.has('god') || player.dead || finale || M6) return;
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
  done.clear(); for (const id of cp.done) markDone(id, true);
  chapter = cp.ch;
  player.reset(cp.p, cp.yaw); vm.refill(); G.nadeN = cp.nades ?? NADE_START;
  const nx = objective();
  if (done.has('G2')) toCockpit(); else if (nx) { G.objText = nx.obj; hud.obj = guideObj(nx); }
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
  if (campaign) { store.set('ch', Math.max(S.FIRST_MECH, progress())); writeSave('checkpoint', null); }
  else { store.set('ch', S.CHAPTERS.length); store.set('clear', 1); }
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
  if (F.t > 6.2 && !F.go) { F.go = true; startMech(); }
}
// 第 6 章：開蒼焰，每一幀交給 mech6.js；載入失敗就照舊直接接本篇
async function startMech() {
  finale = null; stage = 'mech'; chapter = S.CHAPTERS[chapter - 1].mech ? chapter : (S.FIRST_MECH || 6); G.playing = false; player.frozen = true;
  hud.prompt = null; hud.obj = null; G.objText = ''; clearEnemies(); active = [];
  vm.holder.visible = false; vm.arms.root.visible = false;
  if (progress() < chapter) store.set('ch', chapter);
  try {
    const { startMech: go } = await import('./mech6.js');
    M6 = await go({ renderer, scene, camera, vScene, vCam, post, world, hero, audio, input, zhud: hud, solid, D, fxl: fx, G, S: S.MECH_CONFIGS ? { ...S, MECH6: S.MECH_CONFIGS[chapter] } : S, $, pause, resumeSave, saveChapter: (n) => store.set('ch', Math.max(n, progress())), exit: (u) => { location.href = u; } });
    M6.setQuality(quality);
  } catch (e) {
    console.error('[zero] 機體章節載入失敗', e);
    if (!campaign) location.href = '../?zero=1';
    else { $('result').style.display = 'flex'; $('resTitle').textContent = '載入中斷'; $('resSub').textContent = '回標題重試；已解鎖的章節仍保留'; $('cont').style.display = 'none'; }
  }
}
const ease = (t) => t * t * (3 - 2 * t);
const lerpA = (a, b, t) => a + wrap(b - a) * t;

// ---------------------------------------------------------------- 玩家的手榴彈
// G 丟：每章開頭至少 3 顆、最多帶 5 顆（NADE_START／NADE_MAX 在遊戲狀態上面）；敵人身上沒丟完的，倒下時掉在旁邊，走過去自動撿
function playerNade() {
  const d = G.aimDir, eye = G.playerEye;
  const from = eye.clone().addScaledVector(d, 0.45).addScaledVector(_w.set(-d.z, 0, d.x).normalize(), 0.18); from.y -= 0.12;   // 右手出手
  const dir = from.clone().sub(eye), L = dir.length();
  if (solid.ray(eye, dir.divideScalar(L), L + 0.1)) from.copy(eye).addScaledVector(d, 0.05);   // 貼著牆丟：從眼前出手，不穿牆
  const vel = d.clone().multiplyScalar(15).add(_v.set(0, 3.2, 0)).addScaledVector(player.vel, 0.5);
  G.nadeN--;
  G.spawnNade(from, vel, 2.2, null, true);
}
// 炸到人：跟開槍一樣有命中標記、擊倒數
function nadeHits(hp0) {
  let hit = 0, kill = 0;
  for (const [e, h] of hp0) { if (e.hp < h || e.dead) hit++; if (e.dead) kill++; }
  if (!hit) return;
  G.lastHit = G.t; G.stats.hits += hit; G.stats.kills += kill;
  audio.hitmark(kill ? 'kill' : 'hit'); hud.marker(kill ? 'kill' : 'hit');
  if (kill) hud.note(kill > 1 ? `手榴彈　擊倒 ${kill} 個  MULTI KILL` : '擊倒  DOWN', '#7ff3ff');
}
function updateLoot() {
  for (const e of G.enemies) {
    if (!e.dead || !(e.nades > 0) || e.dropped) continue;
    e.dropped = true;
    const p = e.pos.clone(); p.y = solid.floorAt(p.x, p.z, p.y + 1) + 0.05;
    // 旁邊 2.5 m 內已經有一堆：併成一堆（標籤才不會疊在一起）
    const L0 = G.loot.find((L) => L.p.distanceTo(p) < 2.5);
    const m = L0 ? L0.m : new THREE.Group();
    for (let i = 0; i < e.nades; i++) { const k = m.children.length, b = new THREE.Mesh(NADE.body, NADE.metal); b.rotation.set(0, k * 1.3, Math.PI / 2); b.position.set(k * 0.09, 0.05, k * 0.06); b.castShadow = true; m.add(b); }
    if (L0) { L0.n += e.nades; continue; }
    m.position.copy(p); scene.add(m);
    G.loot.push({ p, n: e.nades, m });
    if (G.loot.length > 12) scene.remove(G.loot.shift().m);
  }
  if (player.dead) return;
  for (let i = G.loot.length - 1; i >= 0; i--) {
    const L = G.loot[i];
    if (G.nadeN >= NADE_MAX || Math.hypot(L.p.x - player.pos.x, L.p.z - player.pos.z) > 1.6 || Math.abs(L.p.y - player.pos.y) > 1.2) continue;
    const k = Math.min(L.n, NADE_MAX - G.nadeN);
    G.nadeN += k; L.n -= k;
    hud.note(`撿到手榴彈 +${k}`, '#b8e07a'); audio.swap();
    while (L.m.children.length > L.n) L.m.remove(L.m.children[L.m.children.length - 1]);
    if (L.n <= 0) { scene.remove(L.m); G.loot.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- 獵犬機走過
function updateMechWalk(dt) {
  const M = mechWalk; if (!M) return;
  const path = map.marks.mechPath, sp = 5.5;
  const to = path[Math.min(M.i + 1, path.length - 1)], p = hound.root.position;
  _v.subVectors(to, p); _v.y = 0;
  const L = _v.length();
  if (L < 1 && M.i < path.length - 2) M.i++;
  else if (L < 1) { hound.root.visible = false; mechWalk = null; const [w, t, now] = S.LINES.mech.at(-1); hud.say(w, t, 3.4, now); audio.radio('in'); return; }
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
  const nx = q.has('all') ? S.CHAPTERS.length : progress();
  $('chapters').innerHTML = S.CHAPTERS.map((C) => `<button class="chp${C.n > nx ? ' lock' : ''}${C.n === nx ? ' next' : ''}" data-c="${C.n}"${C.n > nx ? ' disabled' : ''}><b>CHAPTER ${C.n}</b><span>${C.n > nx ? 'LOCKED' : C.name}</span></button>`).join('');
  if (campaign && $('campaignResume')) {
    const saved = readSave('checkpoint');
    $('campaignResume').hidden = !saved || !S.CHAPTERS[saved.chapter - 1];
    $('campaignResume').onclick = () => { const cp = readSave('checkpoint'); if (cp && S.CHAPTERS[cp.chapter - 1]) { resumeSave = true; launch(cp.chapter); } };
  }
}
status.textContent = '選擇章節';
bar.style.width = '100%';
renderChapters();
$('chapters').style.display = 'flex';
$('chapters').addEventListener('click', (ev) => { const b = ev.target.closest('.chp'); if (b && !b.disabled) { resumeSave = false; if (campaign) writeSave('checkpoint', null); launch(+b.dataset.c); } });
document.addEventListener('mouseover', (ev) => { const b = ev.target.closest('.chp:not(.lock), .btn'); if (b && !b.contains(ev.relatedTarget)) audio.ui('hover'); });
document.addEventListener('click', (ev) => { if (ev.target.closest('.btn, .chp')) audio.ui('click'); });
for (const k of ['pointerdown', 'keydown']) addEventListener(k, () => audio.unlock(), { once: true });
audio.music('title');
$('resume').addEventListener('click', resume);
$('quit').addEventListener('click', toTitle);
$('menu').addEventListener('click', toTitle);
$('cont').addEventListener('click', respawn);
input.onLockChange = (locked) => { if (!locked && state === 'play' && (stage === 'play' || M6) && !input.touch.on && !finale && !M6?.holdsInput) pause(); };
const touchUI = $('touch');

function launch(n) {
  audio.unlock();
  $('title').classList.add('hide');
  G.stats = { shots: 0, hits: 0, kills: 0, heads: 0, taken: 0, time: 0 };
  if (n === 1 && !resumeSave && !q.has('x') && !q.has('ch')) intro(() => begin(n)); else begin(n);
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
  n = clamp(Math.floor(n) || 1, 1, S.CHAPTERS.length);
  chapter = n;
  if (S.CHAPTERS[n - 1].mech) {
    state = 'play'; input.enabled = true; if (!input.touch.on) input.lock();
    touchUI.style.display = input.touch.on ? 'block' : 'none';
    startMech(); return;
  }
  startChapter(n);
  if (campaign) {
    const saved = resumeSave ? readSave('checkpoint') : null, foot = saved?.chapter === n ? saved.foot : null;
    const ids = new Set(S.ENCOUNTERS.filter(e => e.ch <= n).map(e => e.id));
    if (foot && foot.layout === S.LAYOUT && Array.isArray(foot.p) && foot.p.length === 3 && foot.p.every(Number.isFinite) && Math.max(Math.abs(foot.p[0]), Math.abs(foot.p[2])) < (S.FOOT_EXTENT || 140) && foot.p[1] >= 0 && foot.p[1] < 40 && Number.isFinite(foot.yaw) && Array.isArray(foot.done) && foot.done.every(id => ids.has(id))) {
      checkpoint = { p: new THREE.Vector3(...foot.p), yaw: foot.yaw, done: foot.done, ch: n, nades: clamp(foot.nades || 0, 0, NADE_MAX) };
      pickedItems.clear(); for (const id of Array.isArray(foot.picked) ? foot.picked : []) if (map.items[id]) { pickedItems.add(id); map.items[id].h?.hide(); }
      respawn();
      for (const k of Object.keys(G.stats)) if (Number.isFinite(saved.stats?.[k])) G.stats[k] = Math.max(0, saved.stats[k]);
    }
    vm.swap('smg'); saveFoot();
  }
  if (q.has('final')) { for (const E of S.ENCOUNTERS) done.add(E.id); player.reset(new THREE.Vector3(14, 0, 90), 0); toCockpit(); }
  state = 'play'; stage = 'play'; G.playing = true;
  input.enabled = true;
  if (!input.touch.on) input.lock();
  touchUI.style.display = input.touch.on ? 'block' : 'none';
  $('fade').style.opacity = 0;
}
function pause() {
  if (state !== 'play') return;
  state = 'paused'; M6?.setPaused?.(true); $('pause').style.display = 'flex'; audio.setPaused(true); input.reset();
}
function resume() {
  $('pause').style.display = 'none'; M6?.setPaused?.(false); audio.setPaused(false);
  if (!input.touch.on && !M6?.holdsInput) input.lock();
  state = 'play'; clock.getDelta();
}
function toTitle() {
  if (M6 || stage === 'mech') { location.href = location.pathname; return; }   // 第 6 章換了整套機體系統：直接重新載入回標題
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
const frameGate = new FrameGate();
const FPS = q.has('fps') ? +q.get('fps') : 60;
function frame(now = performance.now()) {
  requestAnimationFrame(frame);
  if (document.hidden || state === 'paused') { clock.getDelta(); input.endFrame(); return; }
  if (!frameGate.ready(now, state === 'title' ? 30 : FPS)) return;
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
  if (stage === 'mech') { if (M6) M6.tick(dt); input.endFrame(); return; }   // 第 6 章（載入中先停在黑畫面）
  const c = input.state(dt), K = input.keys;
  if (c.pause && !finale) { pause(); input.endFrame(); return; }
  if (input.pressed('KeyC') || input.pressed('Tod')) crouchToggle = !crouchToggle;
  const run = K.has('ShiftLeft') || K.has('ShiftRight') || K.has('Tboost');
  if (run && c.my > 0.3) crouchToggle = false;
  const lookK = vm.scoped ? WEAPONS.rifle.fov / FOV * 1.1 : 1 - vm.ads * 0.3;
  let ctl = { mx: c.mx, my: c.my, lookX: c.lookX * lookK, lookY: c.lookY * lookK, jump: c.jump, sprint: run && !vm.scoped, crouch: crouchToggle || K.has('ControlLeft'), ads: K.has('M2') || K.has('Tmsl') };
  if (window.__botCtl) ctl = { mx: 0, my: 0, lookX: 0, lookY: 0, jump: false, sprint: false, crouch: false, ads: false, ...window.__botCtl };   // 測試腳本用：自動走路
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
    if (input.pressed('KeyG') || input.pressed('Tnade')) { if (G.nadeN <= 0) hud.note('沒有手榴彈了', '#8aa3ab'); else if (vm.throwNade()) audio.throw(); }
    const shot = vm.update(dt, { fire: K.has('M0') || K.has('Tfire'), ads: ctl.ads, reload: c.reload || input.pressed('Tsaber'), swap: input.pressed('KeyQ') || input.pressed('Tcannon'), swapTo: input.pressed('Digit1') ? 'rifle' : input.pressed('Digit2') ? 'pistol' : input.pressed('Digit3') ? 'smg' : null, hold: run }, player, { x: c.lookX, y: c.lookY });
    if (shot) playerShoot(shot);
    if (vm.nadeGo) playerNade();
  } else if (player.dead) { vm.holder.visible = false; vm.arms.root.visible = false; }
  // 視角場景的光：在陰影裡嗎（往太陽方向打一條線）
  const inShade = !!solid.ray(G.playerEye, world.lightDir, 80);
  vm.light(camera, world.lightDir, null, inShade, dt);
  if (vm.scoped) { const d = camera.getWorldDirection(new THREE.Vector3()); const h = shotRay(G.playerEye, d, 400); G.scopeRange = h ? h.t : 0; }   // 測距跟子彈用同一條射線
  // 敵人、光彈、手榴彈、遭遇戰（敵人會讀玩家準心方向、是不是正在用瞄準鏡）
  camera.getWorldDirection(G.aimDir); G.ads = vm.ads;
  for (const e of G.enemies) e.update(dt);
  updateBolts(dt);
  updateGrenades(dt);
  D.update(dt);
  if (stage === 'play' && !finale) { updateEncounters(); updateHatch(dt); updateMissions(dt); updatePickup(); updateLoot(); }   // updateHatch 每幀先清提示，任務的「按 E」要排在它後面
  updateFoes();
  updateGuide(dt);
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
