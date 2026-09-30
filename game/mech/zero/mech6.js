// 第 6 章「蒼焰」：坐進蒼焰之後換成本篇的機體戰鬥（player.js／combat.js／hud.js／cockpit.js／fx.js），在第七機庫一帶把獵犬軍團打出基地
//   前傳的街區蓋在本篇城市的正中央。前傳的建築（kit Solid 的盒子）挑「立在地上、比 3.35 m 高」的登記成本篇的碰撞盒：
//   機體撞得到、站得上屋頂、子彈打得到；車、木箱、沙包、鐵絲網這些矮的直接踩過去（可破壞的會被踩爛）
//   敵人只派機體、直升機、戰機：本篇的戰車只會沿城市道路開，而道路剛好穿過前傳的建築
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

  // ---------------------------------------------------------------- 戰鬥：本篇的 Combat，波次換成 MECH6.waves
  const DEF = { name: M6.name, en: M6.en, tip: '', groups: M6.waves.map((w) => w.list.map((a) => a[0])) };
  let boss = null, bossTold = false, started = false, wave = 0;
  function spawnGroup() {
    const W = M6.waves[this.group]; if (!W) return;   // 已經沒有下一波（Combat 下一幀就判過關）
    const k = this.group++;
    wave = k;
    this.say(W.title, W.sub, 3.6, k === M6.waves.length - 1 ? 'am' : 'cy');
    this.audio.ui('wave');
    for (const [w, t, now] of W.lines) zhud.say(w, t, 3.6, now);
    if (W.music) audio.music('battle', { stage: W.music });
    W.list.forEach(([kind, x, z, y], i) => this.events.push({ spawn: true, t: 1.4 + i * 0.6, fn: () => {
      const e = this.spawn(kind, i, W.list.length, x === undefined ? null : { x, z, y: y ?? 0 });
      if (kind === 'ace') { boss = e; e.ap = e.apMax = Math.round(e.apMax * 1.8); }
    } }));
  }
  function newCombat() {
    if (C) C.dispose();
    fx.clear && fx.clear();
    C = new Combat({ scene, world, camera, player, hero, fx, audio: au, cockpit, post, onEnd, stage: 3 });
    Object.defineProperty(C, 'tier', { value: TIER });
    Object.defineProperty(C, 'def', { value: DEF });
    C.spawnGroup = spawnGroup;
    const say = C.say.bind(C);
    C.say = (text, sub, t, color) => (text === 'STAGE CLEAR' || text === 'ALL CLEAR' ? say(M6.clear[0], M6.clear[1], 4, 'am') : say(text, sub, t, color));
    boss = null; bossTold = false;
  }
  newCombat();
  world.hook({ fx, audio: au, cockpit, player, note: (t, c) => C && C.note(t, c) });   // 城市大樓打得爛
  function fight(from) { C.start(); C.group = from; started = true; }
  // 大破：從這一波重來（機體擺在機庫大門外）
  function restart() {
    newCombat(); place(M6.restart); fight(wave); boot = 0.7;
    for (const [w, t] of M6.down) zhud.say(w, t, 3.4, true);
    audio.music('battle', { stage: M6.waves[wave].music || 4 });
  }
  let ending = null;
  function onEnd(ok) {
    if (!ok) { setTimeout(restart, 3400); return; }   // 大破畫面由本篇 HUD 顯示（AP ZERO）
    ending = { t: 0 };
    audio.music('clear');
    for (const [w, t] of M6.end) zhud.say(w, t, 3.8);
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
      radar: C.radar(), px: player.pos.x, pz: player.pos.z, route: null, wp: null,
    });
    if (tpView) chaseCam(rdt);
    C.aimSkip = tpView ? chaseSkip : 0;

    // ---- 流程：走出機庫大門（或開場 30 秒）才開打；黑犬被打倒時喊一聲
    if (!started && (player.pos.x > HANGAR.x1 + 2 || T > 30)) fight(0);
    if (!started && T > 5 && T - rdt <= 5) C.say(M6.goal[0], M6.goal[1], 5, 'cy');
    if (boss && boss.dead && !bossTold) { bossTold = true; for (const [w, t] of M6.bossDown) zhud.say(w, t, 3.6, true); }
    if (T > 25 && keys.style.opacity !== '0') keys.style.opacity = 0;

    // ---- 戰鬥、特效、世界
    C.update(dt, ending ? null : inp, rdt);
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
    if (!tpView) cockpit.targetView(renderer, scene, C.lockTarget);
    seeThrough();
    post.render(T);
    mhud.draw(rdt, { boot, combat: C, player, stages: 1, groundY: world.height(player.pos.x, player.pos.z), tp: tpView, label: M6.label });
    zhud.draw(rdt, G);

    // ---- 結尾：對白講完 → 黑畫面 → 接本篇
    if (ending) {
      ending.t += rdt;
      if (ending.t > 12 && !ending.fade) { ending.fade = true; $('fade').style.transition = 'opacity 2s'; $('fade').style.opacity = 1; }
      if (ending.t > 14.2 && !ending.card) { ending.card = true; zhud.title(M6.fin[0], M6.fin[1], 5); }
      if (ending.t > 19 && !ending.go) { ending.go = true; exit('../?zero=1'); }
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
  window.__m6 = { fake: null, get combat() { return C; }, player, hero, get wave() { return wave; }, get ending() { return ending; }, fight, tick };
  return { tick };
}
