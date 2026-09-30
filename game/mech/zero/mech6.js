// 第 6 章「蒼焰」：坐進蒼焰之後換成本篇的機體戰鬥（player.js／combat.js／hud.js／cockpit.js／fx.js），在第七機庫一帶把獵犬軍團打出基地
//   前傳的街區蓋在本篇城市的正中央。前傳的建築（kit Solid 的盒子）挑「立在地上、比 3.35 m 高」的登記成本篇的碰撞盒：
//   機體撞得到、站得上屋頂、子彈打得到；車、木箱、沙包、鐵絲網這些矮的直接踩過去（可破壞的會被踩爛）
//   基地裡只派機體、直升機、戰機：本篇的戰車只會沿城市道路開，而道路剛好穿過前傳的建築
//   後半在市區：黑犬打到剩四成就飛過東牆逃走，基地清完出現目標點，一路追進城裡（戰車在這裡才出場，基地周圍的路口封掉不走）
//   本篇的模組一行都沒改：Combat 的 def／tier／spawnGroup／say／damageEnemy 在這裡換掉；目標點（HUD、光柱、雷達）也畫在這裡
//   波次、對白都在 script.js 的 MECH6；main.js 的 frame() 在這章把每一幀交給這裡的 tick()
import * as THREE from 'three';
import { Audio as BaseAudio } from '../audio.js';
import { Player } from '../player.js';
import { Combat } from '../combat.js';
import { HUD as MechHUD } from '../hud.js';
import { Cockpit } from '../cockpit.js';
import { SEE } from '../mechs.js';

const clamp = THREE.MathUtils.clamp;
const HANGAR = { x0: 10.5, x1: 69.5, z0: 52.5, z1: 111.5, h: 28 };
// 這章的難度：敵機出手、準度跟本篇第 2 關差不多，耐打度打七折（多打幾台、打得爽）
const TIER = { atk: 2, fire: 1.3, aim: 1.25, dmg: 0.6, ap: 0.7, alt: false };
const IDLE = { mx: 0, my: 0, lookX: 0, lookY: 0, fire: false, lockHold: false, qb: false, boost: false, jump: false, hover: false, saber: false, cannon: false, hardLock: false, od: false, reload: false };
// 前傳改成人聲版的幾個音效（受傷、跳、落地、換彈、子彈呼嘯），這章換回本篇機體版
const MECH_SFX = new Set(['hurt', 'jump', 'land', 'reload', 'whiz']);
// 戰車不走的路段：基地正中央那九個路口（x、z＝-120、0、120）連出去的路都被前傳的建築壓著（同 encounter.js 的 edgeKey）
const BLOCK = new Set();
for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) BLOCK.add((i * 2 + di + 20) * 100 + (j * 2 + dj + 20));
const BASE = 136;   // |x|、|z| 小於這個＝基地（含外圍高樓）
const L_IN = 2, L_SMALL = 3, L_OFF = 4;   // 基地裡面的東西放在這幾個圖層（見 startMech 開頭、baseLayers）；L_OFF 沒有鏡頭會開
const SANS = 'Rajdhani, "Noto Sans TC", sans-serif';
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
// 目標點的光柱（同本篇遭遇戰的藍色光柱）
const BEAM_VS = `varying vec2 vUv; varying vec3 vN, vV;
  void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const BEAM_FS = `uniform float t, a, k; varying vec2 vUv; varying vec3 vN, vV;
  void main() {
    float y = vUv.y, f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float band = 0.55 + 0.45 * smoothstep(0.7, 1.0, sin(y * 90.0 - t * 5.0));
    float fade = pow(max(1.0 - y, 0.0), 1.5) * smoothstep(0.0, 0.015, y);
    gl_FragColor = vec4(vec3(0.3, 1.6, 2.1) * (0.15 + f * f * 0.9) * band * fade * a * k, 1.0);
  }`;

export async function startMech(X) {
  const { renderer, scene, camera, vScene, vCam, post, world, hero, audio, input, zhud, solid, D, fxl, G, S, $, pause, exit } = X;
  const M6 = S.MECH6;
  let FX = null;
  try { ({ FX } = await import('../fx.js')); } catch (e) { console.warn('[zero] fx.js 載入失敗，改用空殼', e); }

  // ---------------------------------------------------------------- 場景換成機體的尺度
  scene.fog.density = 0.0011;
  camera.fov = 70; camera.near = 0.5; camera.far = 6000; camera.updateProjectionMatrix();
  vCam.fov = 70; vCam.near = 0.05; vCam.far = 20; vCam.updateProjectionMatrix();
  const sc = world.sun.shadow.camera;
  sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.updateProjectionMatrix();
  world.sun.shadow.bias = -0.0004; world.sun.shadow.normalBias = 0.5;
  for (const o of world.cityInst || []) o.visible = true;   // 前傳藏起來的城市樹、路燈、車：飛過外圍高樓看得到
  if (!world.zeroBoxes) {
    world.zeroBoxes = true;
    for (const b of solid.list) if (!b.dead && !b.noRay && b.y0 < 1.5 && b.y1 >= 3.35) world.addCollider({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, top: b.y1 });
  }
  // 省效能：人在基地外面時，基地裡面的東西不畫（前傳約 200 個網格，從市區回頭看會多出一百多個 draw call）
  //   外圍高樓 28～34 m：鏡頭在牆外、低於 26 m 時，牆裡面、不超過 30.5 m 高的東西一定被牆擋住；
  //   鏡頭在牆外、高過牆時，小東西（車、箱子、沙包…）只畫 150 m 以內的（見 baseLayers）
  //   用圖層開關，不動 visible（前傳的可破壞物件自己會開關 visible）；影子跟著主鏡頭的圖層，瞄準莢艙的鏡頭也跟著開關
  const smallProps = [];
  {
    const bb = new THREE.Box3();
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh || !o.frustumCulled) return;
      for (let h = o; h; h = h.parent) if (h === hero.root) return;
      if (o.isInstancedMesh) { o.computeBoundingBox(); bb.copy(o.boundingBox); } else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox); }
      bb.applyMatrix4(o.matrixWorld);
      if (bb.isEmpty() || bb.min.x < -115 || bb.max.x > 115 || bb.min.z < -115 || bb.max.z > 115 || bb.max.y > 30.5) return;
      const small = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) < 60;
      o.layers.set(small ? L_SMALL : L_IN);
      if (small) smallProps.push({ o, box: bb.clone(), on: true });
    });
  }
  // 爆炸也炸得到前傳的道具（車、油桶、木箱）
  const blast0 = world.blast.bind(world), _p = new THREE.Vector3(), _d = new THREE.Vector3();
  world.blast = (p, r, dmg) => {
    blast0(p, r, dmg);
    for (const o of D.objs) {
      if (!o.alive || o.kind === 'surface' || !o.pos || o.pos.distanceTo(p) > r + 1) continue;
      D.hit(o, 600, o.pos.clone(), _d.subVectors(o.pos, p).normalize().clone());
    }
  };

  // ---------------------------------------------------------------- 聲音、特效、駕駛艙、HUD
  const au = new Proxy(audio, { get: (t, k) => (MECH_SFX.has(k) ? BaseAudio.prototype[k].bind(t) : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
  const fx = FX ? new FX(scene, camera, world) : new Proxy({}, { get: (_, k) => (k === 'missile' ? () => ({ pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), alive: true }) : () => {}) });
  if (fx.setQuality) fx.setQuality(1);
  const cockpit = new Cockpit(world, camera, vScene, vCam);
  const cv = document.createElement('canvas');
  cv.id = 'hud2'; cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5';
  document.body.appendChild(cv);
  const mhud = new MechHUD(cv, camera);
  zhud.lift = 92;   // 字幕往上移，不壓在機體 HUD 的 AP／武器列上
  // 操作說明（開場 25 秒；手機把按鈕字換成機體版）
  const keys = document.createElement('div');
  keys.style.cssText = 'position:fixed;right:24px;top:56%;z-index:7;pointer-events:none;font:500 13px/1.9 "Noto Sans TC",sans-serif;color:#cfe6ec;background:rgba(6,12,16,0.55);padding:10px 16px;border-right:2px solid #7ff3ff;transition:opacity 1.2s';
  keys.innerHTML = M6.keys.map(([k, t]) => `<div><b style="color:#7ff3ff;display:inline-block;min-width:92px">${k}</b>${t}</div>`).join('');
  if (!input.touch.on) document.body.appendChild(keys);
  for (const [id, t] of M6.touch) { const b = $(id); if (b) b.textContent = t; }
  const nb = $('tNade'); if (nb) nb.style.display = 'none';

  // ---------------------------------------------------------------- 自機
  if (hero.hatchOpen) hero.hatchOpen(0);
  let C = null;
  const player = new Player(hero, world, {
    land: (s) => {
      au.land(s); cockpit.kick('land', s);
      hero.landV = (hero.landV || 0) + s * 7;
      if (s > 0.35) fx.dust(new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z), 0.8 + s);
    },
    qb: (dir) => { au.quickBoost(); cockpit.kick('qb', 1); if (player.grounded) fx.skid(player.pos, dir, 1); },
    jump: () => au.jump(),
    stomp: (o) => { au.trample(new THREE.Vector3(o.x ?? player.pos.x, player.pos.y, o.z ?? player.pos.z), o.kind); cockpit.kick('step', 0.5, 0); },
    enOut: () => C && C.note('EN OUT', 'rd'),
  });
  player.apMax = 9000;
  function place(P) {
    player.pos.set(P.x, world.height(P.x, P.z), P.z);
    player.vel.set(0, 0, 0); player.yaw = P.yaw; player.pitch = 0; hero.legYaw = P.yaw;
    player.grounded = true; player.en = 100; player.overheat = 0; player.odT = 0; player.dashT = 0; player.lockMove = 0;
    player.ap = player.apMax;
    hero.swing = 0; hero.saber.visible = false;
  }
  place(M6.start);

  // ---------------------------------------------------------------- 視角：預設機體後方（看得到蒼焰的背），V 換駕駛艙
  let tpView = true, chaseD = 15;
  function cockpitView(on) {
    hero.setFirstPerson(on);
    if (!on) return;
    const shadowMat = hero.meshes.map((m) => m.material).find((m) => m.colorWrite === false);
    for (const m of hero.meshes) if (m.parent !== hero.saber && shadowMat) m.material = shadowMat;
    for (const gl of hero.glows) { let o = gl, keep = false; while (o) { if (o === hero.saber) keep = true; o = o.parent; } gl.visible = keep; }
  }
  function applyView() { cockpitView(!tpView); cockpit.root.visible = !tpView; if (!tpView) seeOff(); }
  const onWheel = (e) => { if (tpView) chaseD = clamp(chaseD * Math.exp(e.deltaY * 0.001), 9, 40); };
  addEventListener('wheel', onWheel, { passive: true });
  // 越肩鏡頭（同本篇 main.js 的 chaseCam）：鏡頭在右肩外側，撞到建築先縮側移再縮距離
  const chasePivot = new THREE.Vector3(), chaseSide = new THREE.Vector3(), chaseOff = new THREE.Vector3(), chaseN = new THREE.Vector3(), chaseE = new THREE.Euler();
  let chaseK = 1, chaseBack = 15, chaseSkip = 0;
  function chaseCam(dt) {
    const k = hero.scale;
    camera.quaternion.setFromEuler(chaseE.set(player.pitch, player.yaw + Math.PI, 0, 'YXZ'));
    hero.bones.torso.getWorldPosition(chasePivot);
    chasePivot.y += 3.5 * k;
    chaseSide.set((5.4 + chaseD * 0.1) * k, 2.4 * k, 0).applyQuaternion(camera.quaternion).add(chasePivot);
    let hit = world.raycast(chasePivot, chaseSide, chaseN);
    if (hit >= 0 && hit <= 1) chaseSide.lerpVectors(chasePivot, chaseSide, Math.max(0, hit - 0.08));
    chaseOff.set(0, 0, chaseD * k).applyQuaternion(camera.quaternion).add(chaseSide);
    hit = world.raycast(chaseSide, chaseOff, chaseN);
    const want = hit >= 0 && hit <= 1 ? Math.max(0.03, hit - 0.04) : 1;
    chaseK = want < chaseK ? want : Math.min(want, chaseK + dt * 1.5);
    camera.position.lerpVectors(chaseSide, chaseOff, chaseK);
    chaseBack = chaseD * k * chaseK;
    const gy = world.height(camera.position.x, camera.position.z) + 2;
    if (camera.position.y < gy) camera.position.y = gy;
    // 機庫裡：鏡頭不穿出屋頂
    if (inHangar(camera.position)) camera.position.y = Math.min(camera.position.y, HANGAR.h - 1.5);
    chaseSkip = Math.max(0, chaseN.set(0, 0, -1).applyQuaternion(camera.quaternion).dot(chaseOff.subVectors(chasePivot, camera.position)));
  }
  const seeP = new THREE.Vector3(), seeQ = new THREE.Vector3();
  function seeOff() { SEE.c.value.w = 0; SEE.t.value.w = 0; SEE.a.value = 0; }
  function seeThrough() {
    if (!tpView) { seeOff(); return; }
    renderer.getDrawingBufferSize(SEE.res.value);
    SEE.c.value.set(camera.aspect / 2, 0.5, 0.13, 1);
    SEE.a.value = clamp((7 - chaseBack) / 4, 0, 0.8);
    for (const gl of hero.glows) gl.visible = SEE.a.value < 0.25;
    const L = C.lockTarget && !C.lockTarget.dead ? C.lockTarget : C.soft;
    SEE.t.value.w = 0;
    if (!L) return;
    camera.updateMatrixWorld();
    L.chest(seeP); seeQ.copy(seeP); seeQ.y += 9 * L.scale;
    seeP.project(camera); seeQ.project(camera);
    if (seeP.z > 1 || Math.abs(seeP.x) > 1.3 || Math.abs(seeP.y) > 1.3) return;
    SEE.t.value.set((seeP.x * 0.5 + 0.5) * camera.aspect, seeP.y * 0.5 + 0.5, Math.min(0.2, Math.abs(seeQ.y - seeP.y) * 0.5 * 1.7 + 0.05), 1);
  }
  const inHangar = (p) => p.x > HANGAR.x0 && p.x < HANGAR.x1 && p.z > HANGAR.z0 && p.z < HANGAR.z1;
  // 基地裡面的東西畫不畫（圖層見開頭）：鏡頭在牆裡＝全畫（跟原本一樣）；在牆外、低於牆頂＝全不畫；在牆外、高過牆頂＝小東西只畫 150 m 以內的
  let baseOut = false;
  function baseLayers() {
    const c = camera.position, out = Math.max(Math.abs(c.x), Math.abs(c.z)) >= 130, high = c.y >= 26;
    for (const cam of [camera, cockpit.tg && cockpit.tg.cam]) {
      if (!cam) continue;
      cam.layers.enable(L_SMALL);
      if (!out || high) cam.layers.enable(L_IN); else cam.layers.disable(L_IN);
    }
    if (!out && !baseOut) return;
    baseOut = out;
    for (const s of smallProps) {
      const on = !out || (high && s.box.distanceToPoint(c) < 150);
      if (on !== s.on) { s.on = on; s.o.layers.set(on ? L_SMALL : L_OFF); }
    }
  }

  // ---------------------------------------------------------------- 戰鬥：本篇的 Combat，波次換成 MECH6.waves
  const DEF = { name: M6.name, en: M6.en, tip: '', groups: M6.waves.map((w) => w.list.map((a) => a[0])) };
  let boss = null, bossTold = false, started = false, wave = 0;
  // 市區：gate＝目前的目標點（上一波打完、這一波還沒開打）；cp＝大破時從哪裡重來；fled＝基地那台黑犬已經逃了
  let gate = null, cp = M6.restart, fled = false;
  const told = new Set(), flyers = [], pods = [];
  const cpOf = (W) => (W.cp ? { x: W.cp[0], z: W.cp[1], yaw: W.cp[2] } : { x: W.go[0], z: W.go[1], yaw: 0 });
  const reached = (W) => Math.hypot(player.pos.x - W.go[0], player.pos.z - W.go[1]) < W.go[2];
  // 還沒輪到的劇情對白丟掉（戰鬥喊話留著）：打得快的時候，上一段的對白不會一路排到下一段、排到結尾
  const flushTalk = () => { const q = zhud.subQ; for (let i = q.length - 1; i >= 0; i--) if (!q[i].now) q.splice(i, 1); };
  function spawnGroup() {
    const W = M6.waves[this.group]; if (!W) return;   // 已經沒有下一波（Combat 下一幀就判過關）
    const k = this.group;
    // 市區的波次：先出現目標點，走到了才開打（Combat 每一幀都會叫這裡，沒到就先不動）
    if (W.go && !reached(W)) { arm(k); return; }
    this.group++;
    wave = k; gate = null;
    if (W.go) cp = cpOf(W);
    this.say(W.title, W.sub, 3.6, W.boss ? 'am' : 'cy');
    this.audio.ui('wave');
    const noDog = W.boss && W.boss.flee && fled;   // 黑犬已經逃了：從這一波重來時只剩掩護他的那幾台
    if (!noDog) for (const [w, t, now] of W.lines) zhud.say(w, t, 3.6, now);
    if (W.music) audio.music('battle', { stage: W.music });
    const A = W.go ? { x: W.go[0], z: W.go[1] } : { x: player.pos.x, z: player.pos.z };
    W.list.forEach(([kind, x, z, y], i) => {
      if (kind === 'ace' && noDog) return;
      this.events.push({ spawn: true, t: 1.4 + i * 0.6, fn: () => {
        const e = this.spawn(kind, i, W.list.length, x === undefined ? null : { x, z, y: y ?? 0, tx: A.x, tz: A.z });
        if (kind === 'ace' && W.boss) { boss = e; e.ap = e.apMax = Math.round(e.apMax * W.boss.ap); e.flee = W.boss.flee || 0; e.label = 'BLACK DOG'; }
      } });
    });
  }
  // 目標點出現：上一波清完的大字＋對白（大破重來時不再重播）
  function arm(k) {
    if (gate && gate.k === k) return;
    const W = M6.waves[k];
    gate = { k, W, x: W.go[0], z: W.go[1], t: 0 };
    wave = k;
    if (told.has(k) || C.dead) return;   // 大破畫面中：重來之後才講
    told.add(k);
    flushTalk();
    if (W.clear) { C.say(W.clear[0], W.clear[1], 4, 'am'); au.ui('clear'); }
    // 緊急修復：一整章只有一條 AP，市區每一段開始前補一些（部位損傷也跟著回來）
    if (W.repair && !C.dead) {
      const add = Math.min(player.apMax - player.ap, player.apMax * W.repair);
      if (add > 1) { player.ap += add; C.note(`EMERGENCY REPAIR  AP +${Math.round(add / player.apMax * 100)}%`, 'gr'); }
      for (const p in C.parts) C.parts[p] = Math.min(1, C.parts[p] + W.repair);
    }
    for (const [w, t, now] of W.talk || []) zhud.say(w, t, 3.6, now);
  }
  function newCombat() {
    if (C) C.dispose();
    fx.clear && fx.clear();
    for (const f of flyers) f.e.m.root.removeFromParent();
    for (const p of pods) scene.remove(p.m);
    flyers.length = 0; pods.length = 0;
    C = new Combat({ scene, world, camera, player, hero, fx, audio: au, cockpit, post, onEnd, stage: 3 });
    Object.defineProperty(C, 'tier', { value: TIER });
    Object.defineProperty(C, 'def', { value: DEF });
    world.blocked = BLOCK;   // Combat 開場會把路障清掉（setRoute），這裡再封一次
    C.spawnGroup = spawnGroup;
    const say = C.say.bind(C);
    C.say = (text, sub, t, color) => (text === 'STAGE CLEAR' || text === 'ALL CLEAR' ? say(M6.clear[0], M6.clear[1], 4, 'am') : say(text, sub, t, color));
    // 基地的黑犬：怎麼打都不會在這裡倒（留一點血，下一幀 tick() 讓他撤退）；撤退中完全打不到
    const dmg0 = C.damageEnemy.bind(C);
    C.damageEnemy = (e, dmg, stag, pos, dir, crit = false) => {
      if (e.fleeing) return;
      if (e.flee) dmg = Math.min(dmg, Math.max(0, (e.ap - 1) / (e.stagT > 0 && !crit ? 1.4 : 1)));
      dmg0(e, dmg, stag, pos, dir, crit);
    };
    boss = null; bossTold = false; gate = null;
  }
  newCombat();
  world.hook({ fx, audio: au, cockpit, player, note: (t, c) => C && C.note(t, c) });   // 城市大樓打得爛
  function fight(from) { C.start(); C.group = from; started = true; }
  // 大破：從這一波重來（基地裡擺在機庫大門外；市區擺在最後一個走到的目標點）
  function restart() {
    newCombat(); place(cp); fight(wave); boot = 0.7;
    for (const [w, t] of M6.down) zhud.say(w, t, 3.4, true);
    audio.music('battle', { stage: M6.waves[wave].music || 4 });
  }
  let ending = null;
  function onEnd(ok) {
    if (!ok) { setTimeout(restart, 3400); return; }   // 大破畫面由本篇 HUD 顯示（AP ZERO）
    ending = { t: 0 };
    gate = null;
    flushTalk();
    audio.music('clear');
    for (const [w, t] of M6.end) zhud.say(w, t, 3.8);
  }

  // ---------------------------------------------------------------- 撤退：黑犬（和決戰後剩下的僚機）噴射飛走
  //   從 Combat 拿掉（鎖不到、打不到、不算敵數），動作自己接手：先往上升，越過前面的樓頂才往前衝，冒著煙飛遠了就消失
  function flee(e, path) {
    e.fleeing = true; e.gone = true;
    C.enemies = C.enemies.filter((o) => o !== e);
    if (C.lockTarget === e) C.lockTarget = null;
    if (C.soft === e) C.soft = null;
    C.msl.locks = C.msl.locks.filter((o) => o !== e); e.locks = 0;
    e.warn = 0; e.charge = 0; e.burst = 0; e.volley = 0; e.lunge = 0; e.stagT = 0; e.m.swing = 0;
    e.vel.set(e.vel.x * 0.3, 24, e.vel.z * 0.3); e.grounded = false; e.dropping = false;
    flyers.push({ e, path, i: 0, t: 0, smoke: 0 });
  }
  const _f = new THREE.Vector3();
  function updFlyers(dt) {
    for (let n = flyers.length - 1; n >= 0; n--) {
      const F = flyers[n], e = F.e, p = e.pos;
      F.t += dt;
      const [tx, tz, alt] = F.path[F.i];
      let dx = tx - p.x, dz = tz - p.z, dl = Math.hypot(dx, dz);
      if (dl < 30 && F.i < F.path.length - 1) F.i++;
      dx /= dl || 1; dz /= dl || 1;
      // 前方 45 m 的樓頂：還沒高過它就只往上、不往前（不穿牆）
      const roof = Math.max(world.support(p.x, p.z, 6, 1e4), world.support(p.x + dx * 45, p.z + dz * 45, 8, 1e4));
      const want = Math.max(world.height(p.x, p.z) + alt, roof + 22);
      const go = clamp((p.y - roof - 4) / 14, 0, 1) * Math.min(1, F.t / 0.8);
      e.vel.x = damp(e.vel.x, dx * 72 * go, 2.2, dt); e.vel.z = damp(e.vel.z, dz * 72 * go, 2.2, dt);
      e.vel.y = damp(e.vel.y, clamp((want - p.y) * 1.1, -8, 30), 3, dt);
      p.addScaledVector(e.vel, dt);
      e.face = Math.atan2(dx, dz);
      e.m.animate(dt, { vel: e.vel, grounded: false, boost: 0, torsoYaw: e.face, pitch: 0, thrust: 1, aim: null, lean: 0.3 });
      au.enemyBoost(e.id, p, 1);
      F.smoke += dt * 22;
      while (F.smoke >= 1) { F.smoke -= 1; fx.trail(e.chest(_f)); }
      if (F.t > 7.5 || Math.hypot(p.x - player.pos.x, p.z - player.pos.z) > 520) {
        e.m.root.removeFromParent(); au.enemyBoost(e.id, p, 0);
        flyers.splice(n, 1);
      }
    }
  }
  // 決戰：黑犬的逃生艙從胸口彈出去（小膠囊＋橘燈，拖著煙往上飛，幾秒後消失）
  const podGeo = new THREE.CapsuleGeometry(0.9, 1.8, 3, 8), podMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.6, roughness: 0.45, emissive: 0xff6a20, emissiveIntensity: 0.35 });
  function eject(e) {
    const m = new THREE.Mesh(podGeo, podMat);
    e.chest(m.position); m.position.y += 2;
    const away = _f.subVectors(e.pos, player.pos).setY(0).normalize();
    scene.add(m);
    pods.push({ m, vel: new THREE.Vector3(away.x * 10, 52, away.z * 10), t: 0, smoke: 0 });
    au.explosion(m.position, 0.6);
  }
  function updPods(dt) {
    for (let n = pods.length - 1; n >= 0; n--) {
      const P = pods[n];
      P.t += dt;
      P.vel.y -= 14 * dt;
      P.m.position.addScaledVector(P.vel, dt);
      P.m.rotation.x += dt * 3; P.m.rotation.z += dt * 1.7;
      P.smoke += dt * 30;
      while (P.smoke >= 1) { P.smoke -= 1; fx.trail(P.m.position); }
      if (P.t > 4.5) { scene.remove(P.m); pods.splice(n, 1); }
    }
  }
  // 戰車被擠進基地（路口封了，但重新找路時可能落在外圍高樓底下）：搬回這一波的戰場旁邊的路上
  function tankGuard() {
    const A = gate || M6.waves[wave], go = A.go || (A.W && A.W.go);
    if (!go) return;
    for (const v of C.vehicles.list) {
      if (v.kind !== 'tank' || v.state !== 'alive' || Math.abs(v.pos.x) > BASE || Math.abs(v.pos.z) > BASE) continue;
      C.vehicles.placeTank(v, 0, 1, true, { x: go[0] + 130, z: go[1], tx: go[0], tz: go[1] });
    }
  }

  // ---------------------------------------------------------------- 目標點：地上的光柱＋HUD（航向帶菱形、目標字、畫面上的菱形／畫面外箭頭）＋駕駛艙雷達
  //   本篇 HUD 只畫遭遇戰（combat.enc）的目標點，這章的目標點照它的樣式自己畫在同一張畫布上
  const beacon = (() => {
    const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, a: { value: 0 }, k: { value: 1 } }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const core = mat.clone(); core.uniforms.t = mat.uniforms.t; core.uniforms.a = mat.uniforms.a; core.uniforms.k = { value: 2.6 };
    const gemMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 2.8, 3.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const root = new THREE.Group();
    const add = (m) => { m.frustumCulled = false; m.userData.noAO = true; m.castShadow = m.receiveShadow = false; root.add(m); return m; };
    add(new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 170, 24, 1, true).translate(0, 85, 0), mat));
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 170, 10, 1, true).translate(0, 85, 0), core));
    const gem = add(new THREE.Mesh(new THREE.OctahedronGeometry(3.2, 0), gemMat));
    gem.scale.set(1, 1.7, 1);
    root.visible = false;
    scene.add(root);
    return { root, mat, gem, a: 0, t: 0 };
  })();
  function beaconFx(dt) {
    const B = beacon, on = gate && !ending ? 1 : 0;
    B.t += dt;
    B.a += (on - B.a) * (1 - Math.exp(-dt * 3));
    if (gate) B.root.position.set(gate.x, world.height(gate.x, gate.z), gate.z);
    B.root.visible = B.a > 0.01;
    B.mat.uniforms.t.value = B.t; B.mat.uniforms.a.value = B.a;
    B.gem.material.opacity = B.a; B.gem.rotation.y = B.t * 1.6; B.gem.position.y = 38 + Math.sin(B.t * 2) * 1.5;
  }
  const _g = new THREE.Vector3(), DEG = Math.PI / 180;
  function drawGoal() {
    if (!gate || boot < 0.8 || ending || C.dead) return;
    const h = mhud, X = h.x, s = h.s, W = h.w, H = h.h, g = gate;
    const dist = Math.hypot(player.pos.x - g.x, player.pos.z - g.z), dm = `${Math.round(dist)}m`;
    const fade = Math.min(1, g.t / 0.6);
    X.globalAlpha = fade;
    // 航向帶：目標方位（青色菱形，超出 ±30° 貼在兩端）
    const f = h.fwd, hdg = ((-Math.atan2(f.x, f.z) / DEG) % 360 + 360) % 360;
    const hx = W / 2, hy = h.tp(0, 0.4)[1], kp = 150 * s / 30;
    const rb = ((-Math.atan2(g.x - h.cam.position.x, g.z - h.cam.position.z) / DEG - hdg) % 360 + 540) % 360 - 180;
    const bx = hx + clamp(rb, -30, 30) * kp, q = 4 * s;
    X.beginPath(); X.moveTo(bx, hy + 3 * s); X.lineTo(bx + q, hy + 3 * s + q); X.lineTo(bx, hy + 3 * s + q * 2); X.lineTo(bx - q, hy + 3 * s + q); X.closePath();
    h.sk('cy', Math.abs(rb) > 30 ? 0.55 : 1, 1.3);
    // 目標字＋距離（航向帶下方；連殺字樣出現時往下讓）；還在基地裡就多一行怎麼過牆
    const chainOn = C.stats.chain > 1 && C.stats.time - C.stats.lastKill < 8;
    const y = hy + (chainOn ? 42 : 25) * s;
    h.text(`${g.W.obj}  ▶ ${dm}`, W / 2, y, 15, 'cy', 0.8 + 0.2 * Math.sin(h.t * 4), 'center', 700, SANS);
    if (g.W.hint && Math.abs(player.pos.x) < 128 && Math.abs(player.pos.z) < 128) h.text(g.W.hint, W / 2, y + 19 * s, 13, 'am', 0.95, 'center', 600, SANS);
    // 目標點（光柱頂端的高度）：畫面內＝菱形＋距離，畫面外＝邊緣箭頭
    const p = h.proj(_g.set(g.x, world.height(g.x, g.z) + 38, g.z), {});
    if (!(p.front && p.x > 30 && p.x < W - 30 && p.y > 30 && p.y < H - 30)) h.edgeMark(p, 'cy', dm, W, H, 0.9);
    else {
      const r = 11 * s, k = 1 + 0.12 * Math.sin(h.t * 5);
      X.beginPath(); X.moveTo(p.x, p.y - r * k); X.lineTo(p.x + r * k, p.y); X.lineTo(p.x, p.y + r * k); X.lineTo(p.x - r * k, p.y); X.closePath();
      X.fillStyle = 'rgba(127,243,255,0.2)'; X.fill();
      h.sk('cy', 0.95, 1.6);
      h.text(dm, p.x, p.y + r + 11 * s, 11, 'cy', 0.95, 'center', 700);
    }
    X.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- 開場
  let T = 0, boot = 0, odV = 0, speedV = 0, flashV = 0, dangerV = 0;
  zhud.sub = null; zhud.subQ.length = 0;   // 上一章（駕駛艙）還沒播完的字幕不帶過來
  zhud.title(`第 6 章　${M6.name}`, M6.en, 4.5);
  for (const [w, t] of M6.start.lines) zhud.say(w, t, 3.6);
  audio.music('battle', { stage: 4 });
  $('fade').style.transition = 'opacity 1.2s'; $('fade').style.opacity = 0;
  const fwd = new THREE.Vector3(), foot = new THREE.Vector3(), tmp = new THREE.Vector3();

  function tick(rdt) {
    T += rdt;
    const dt = rdt * C.timeScale;
    boot = Math.min(1, boot + rdt / 2.6);
    let inp = input.state(rdt);
    if (window.__m6.fake) Object.assign(inp, window.__m6.fake);
    if (inp.pause && !ending) { input.unlock(); pause(); return; }
    if (inp.view && !ending) { tpView = !tpView; applyView(); }
    if (!(boot > 0.85 && !C.dead && !ending)) inp = Object.assign({}, inp, IDLE);
    if (C.cannon.phase) inp = Object.assign({}, inp, { lookX: inp.lookX * 0.45, lookY: inp.lookY * 0.45, mx: inp.mx * 0.35, my: inp.my * 0.35, boost: false });

    // ---- 自機
    player.update(dt, inp);
    if (inHangar(player.pos) && player.pos.y > HANGAR.h - 19) { player.pos.y = HANGAR.h - 19; player.vel.y = Math.min(0, player.vel.y); }   // 機庫屋頂
    hero.animate(dt, player.animState(C.aimPoint));
    if (hero.footfall) {
      const s = clamp(player.speed / 16, 0.35, 1.3);
      au.footstep(s); cockpit.kick('step', s, hero.footfall);
      hero.bones[hero.footfall > 0 ? 'ankleR' : 'ankleL'].getWorldPosition(foot);
      foot.y = player.pos.y;
      if (player.speed > 6) fx.dust(foot, 0.35 + 0.25 * s);
    }
    if (hero.servo > 0.05) au.servo(hero.servo);
    au.boost(player.thrust);
    const agl = player.pos.y - world.height(player.pos.x, player.pos.z);
    if (player.thrust > 0.2 && agl < 22) fx.thrusterWash(tmp.set(player.pos.x, player.pos.y - agl, player.pos.z), player.thrust * (1 - agl / 22));
    if (player.grounded && player.boosting) fx.skid(player.pos, player.vel, 0.6);
    crush();

    // ---- 駕駛艙、鏡頭
    cockpit.update(dt, hero, {
      yaw: player.yaw, pitch: player.pitch, boot,
      move: { x: inp.mx, y: inp.my }, turn: { x: inp.lookX * 25, y: inp.lookY * 25 },
      boost: player.boosting, hover: player.hovering, speed: player.speed, alt: agl, vs: player.vel.y,
      ap: player.ap, apMax: player.apMax, en: player.en / 100, parts: C.parts,
      rifle: C.rifle, msl: { ready: C.msl.cd >= 1 ? 6 : 0, max: 6, cd: C.msl.cd, locks: C.msl.locks.length },
      saber: C.saber.cd, cannon: C.cannon, od: C.od, lockAlert: C.lockAlert, danger: player.ap / player.apMax < 0.3 ? 1 : 0,
      radar: C.radar(), px: player.pos.x, pz: player.pos.z,
      route: gate ? [player.pos.x, player.pos.z, gate.x, gate.z] : null, wp: gate ? { x: gate.x, z: gate.z } : null,
    });
    if (tpView) chaseCam(rdt);
    C.aimSkip = tpView ? chaseSkip : 0;

    // ---- 流程：走出機庫大門（或開場 30 秒）才開打
    if (!started && (player.pos.x > HANGAR.x1 + 2 || T > 30)) fight(0);
    if (!started && T > 5 && T - rdt <= 5) C.say(M6.goal[0], M6.goal[1], 5, 'cy');
    // 基地的黑犬打到剩四成：撤退（僚機留下來掩護）
    if (boss && boss.flee && !boss.fleeing && !boss.dead && !boss.dropping && boss.ap <= boss.apMax * boss.flee) {
      fled = true; flee(boss, M6.flee.path);
      for (const [w, t, now] of M6.flee.lines) zhud.say(w, t, 3.4, now);
    }
    // 市區的黑犬被打倒：逃生艙彈出去，剩下的僚機跟著撤
    if (boss && boss.dead && !bossTold && !boss.flee) {
      bossTold = true; eject(boss);
      for (const [w, t] of M6.bossDown) zhud.say(w, t, 3.6, true);
      C.events = C.events.filter((ev) => !ev.spawn);
      for (const e of C.enemies.slice()) {
        if (e.dead || e.vehicle || e === boss) continue;
        const a = Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        flee(e, [[e.pos.x + Math.sin(a) * 600, e.pos.z + Math.cos(a) * 600, 70]]);
      }
    }
    if (T > 25 && keys.style.opacity !== '0') keys.style.opacity = 0;
    if (gate) gate.t += rdt;

    // ---- 戰鬥、特效、世界
    C.update(dt, ending ? null : inp, rdt);
    updFlyers(dt); updPods(dt); tankGuard();
    beaconFx(rdt);
    fx.update(dt); fxl.update(dt, true); D.update(dt);
    world.update(dt);
    world.followShadow(player.pos);
    camera.getWorldDirection(fwd);
    audio.setListener(camera.position, fwd);
    const danger = player.ap / player.apMax < 0.3 && !C.dead && !ending;
    audio.setDanger(danger);
    let near = 0;
    for (const e of C.enemies) if (!e.dead && e.pos.distanceToSquared(player.pos) < 400 * 400) near += e.vehicle ? 0.5 : e.kind === 'grunt' ? 1 : 1.6;
    audio.setIntensity(ending ? 0.15 : clamp(0.2 + near * 0.08 + C.lockAlert * 0.25 + C.damageFx * 0.3 + (danger ? 0.2 : 0) + odV * 0.35, 0, 1));

    // ---- 畫面後製
    odV += ((C.od.active ? 1 : 0) - odV) * (1 - Math.exp(-rdt * 4));
    speedV += (clamp((player.speed - 20) / 40, 0, 1) * (player.boosting || player.qbT > 0 || player.dashT > 0 ? 1 : 0.3) - speedV) * (1 - Math.exp(-rdt * 6));
    dangerV += ((danger ? 0.6 : 0) - dangerV) * (1 - Math.exp(-rdt * 3));
    flashV = Math.max(0, flashV - rdt * 3);
    if (C.hitstop > 0 && C.killMark > 0.9) flashV = Math.max(flashV, 0.06);
    post.u.boot.value = boot;
    post.u.damage.value = Math.min(1, C.damageFx * 0.8);
    post.u.overdrive.value = odV;
    post.u.speed.value = speedV;
    post.u.danger.value = dangerV;
    post.u.flash.value = flashV;
    baseLayers();
    if (!tpView) cockpit.targetView(renderer, scene, C.lockTarget);
    seeThrough();
    post.render(T);
    mhud.draw(rdt, { boot, combat: C, player, stages: 1, groundY: world.height(player.pos.x, player.pos.z), tp: tpView, label: M6.label });
    drawGoal();
    zhud.draw(rdt, G);

    // ---- 結尾：對白 → 黑畫面 → 字卡 → 接本篇（最後一句對白講完才接，最晚 26 秒）
    if (ending) {
      ending.t += rdt;
      if (ending.t > 12 && !ending.fade) { ending.fade = true; $('fade').style.transition = 'opacity 2s'; $('fade').style.opacity = 1; }
      if (ending.t > 14.2 && !ending.card) { ending.card = true; zhud.title(M6.fin[0], M6.fin[1], 5); }
      if (ending.t > 19 && (!(zhud.sub || zhud.subQ.length) || ending.t > 26) && !ending.go) { ending.go = true; exit('../?zero=1'); }
    }
  }
  // 蒼焰走過去：腳邊的車、油桶、木箱直接踩爛
  function crush() {
    const p = player.pos;
    for (const o of D.objs) {
      if (!o.alive || o.kind === 'surface' || !o.pos || o.pos.y > p.y + 4) continue;
      const dx = o.pos.x - p.x, dz = o.pos.z - p.z;
      if (dx * dx + dz * dz > 18) continue;
      D.hit(o, 1e4, _p.copy(o.pos), _d.set(dx, 0, dz).normalize().clone());
    }
  }

  applyView();
  window.__m6 = { fake: null, get combat() { return C; }, player, hero, get wave() { return wave; }, get ending() { return ending; }, fight, tick,
    get gate() { return gate; }, get boss() { return boss; }, get fled() { return fled; }, get cp() { return cp; }, flyers, pods };
  return { tick };
}
