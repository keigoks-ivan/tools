// 鋼鐵黃昏 IRON DUSK：主程式
//   流程：標題（機體展示鏡頭）→ 開機（擋板升起）→ 戰鬥（四波）→ 暫停／結算
//   ?show=… 或 ?free 會改載入 preview.js（美術／動作預覽）
import * as THREE from 'three';

const q = new URLSearchParams(location.search);
if (q.has('show') || q.has('free')) await import('./preview.js');
else await game();

async function game() {
  const { loadAssets, World } = await import('./env.js');
  const { Mech, initMechMaterials } = await import('./mechs.js');
  const { Post } = await import('./post.js');
  const { Cockpit } = await import('./cockpit.js');
  const { Input } = await import('./input.js');
  const { Player } = await import('./player.js');
  const { Combat, WAVES } = await import('./combat.js');
  const { HUD } = await import('./hud.js');
  const { Audio: Sound } = await import('./audio.js');
  const clamp = THREE.MathUtils.clamp;
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------- 畫面
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 1.0, 12000);
  const cockScene = new THREE.Scene();
  const cockCam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 20);

  const bar = document.querySelector('#bar i'), status = $('status');
  const A = await loadAssets(renderer, (p) => { bar.style.width = (p * 90).toFixed(0) + '%'; });
  status.textContent = '建立城市';
  initMechMaterials(A);
  const world = new World(renderer, scene, A);
  const post = new Post(renderer, scene, camera, cockScene, cockCam);
  const cockpit = new Cockpit(world, camera, cockScene, cockCam);
  // 艙壁擋住的畫面，城市那層直接跳過不畫（?nomask 可關掉比對）
  const cockMask = cockpit.depthMask();
  cockMask.visible = false;
  if (!q.has('nomask')) scene.add(cockMask);

  // 特效：載入失敗就用空殼，遊戲照跑
  let fx;
  try { const { FX } = await import('./fx.js'); fx = new FX(scene, camera, world); }
  catch (err) {
    console.warn('[mech] fx.js 載入失敗，改用空殼', err);
    fx = new Proxy({}, { get: (_, k) => (k === 'missile' ? () => ({ pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), alive: true }) : () => {}) });
  }
  const audio = new Sound();
  if (q.has('mute')) audio.setVolume(0);   // 測試用：?mute 全程靜音
  const input = new Input(canvas);
  const hud = new HUD($('hud'), camera);
  bar.style.width = '100%';

  // ---------------------------------------------------------------- 自機
  const SPAWN = new THREE.Vector3(0, 0, -70);
  const hero = new Mech('hero', 'hero');
  scene.add(hero.root);
  const player = new Player(hero, world, {
    land: (s) => {
      audio.land(s); cockpit.kick('land', s);
      hero.landV = (hero.landV || 0) + s * 7;
      if (s > 0.35) fx.dust(new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z), 0.8 + s);
    },
    qb: (dir) => { audio.quickBoost(); cockpit.kick('qb', 1); if (player.grounded) fx.skid(player.pos, dir, 1); },
    jump: () => audio.jump(),
    stomp: (o) => { audio.trample(new THREE.Vector3(o.x ?? player.pos.x, player.pos.y, o.z ?? player.pos.z), o.kind); cockpit.kick('step', 0.5, 0); },
    enOut: () => combat && combat.note('EN OUT', 'rd'),
  });
  player.apMax = 9000;
  function resetPlayer() {
    player.pos.set(SPAWN.x, world.height(SPAWN.x, SPAWN.z), SPAWN.z);
    player.vel.set(0, 0, 0); player.yaw = 0; player.pitch = 0; hero.legYaw = 0;
    player.grounded = true; player.en = 100; player.overheat = 0; player.odT = 0; player.dashT = 0; player.lockMove = 0;
    player.ap = player.apMax;
    hero.swing = 0; hero.saber.visible = false;
  }
  resetPlayer();
  // 駕駛艙視角：整台自機只投影子（手臂也藏，免得擋窗），光劍照常看得到
  function cockpitView(on) {
    hero.setFirstPerson(on);
    cockMask.visible = on;
    if (!on) return;
    const shadowMat = hero.meshes.map((m) => m.material).find((m) => m.colorWrite === false);
    for (const m of hero.meshes) if (m.parent !== hero.saber && shadowMat) m.material = shadowMat;
    for (const gl of hero.glows) { let o = gl, keep = false; while (o) { if (o === hero.saber) keep = true; o = o.parent; } gl.visible = keep; }
  }

  // ---------------------------------------------------------------- 戰鬥
  let combat = null;
  function newCombat(firstWave = 1) {
    if (combat) combat.dispose();
    fx.clear();
    combat = new Combat({ scene, world, camera, player, hero, fx, audio, cockpit, post, onEnd: finish, firstWave });
    window.__combat = combat;
  }
  newCombat();

  // ---------------------------------------------------------------- 設定
  const store = { get: (k, d) => { try { const v = localStorage.getItem('mech.' + k); return v === null ? d : +v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('mech.' + k, v); } catch (e) {} } };
  let quality = store.get('q', 1);
  function setQuality(qv) {
    quality = qv; store.set('q', qv);
    renderer.setPixelRatio(Math.min(devicePixelRatio, [0.7, 1, 1.5][qv]));
    renderer.setSize(innerWidth, innerHeight);
    post.setSize(innerWidth, innerHeight);
    post.gtao.enabled = qv > 0;
    renderer.shadowMap.type = qv > 0 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    fx.setQuality(qv);
    document.querySelectorAll('[data-q]').forEach((b) => { b.style.background = +b.dataset.q === qv ? 'rgba(127,243,255,0.25)' : ''; });
  }
  setQuality(quality);
  document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => setQuality(+b.dataset.q)));
  const sens = $('sens');
  input.sens = store.get('sens', 1); sens.value = input.sens;
  sens.addEventListener('input', () => { input.sens = +sens.value; store.set('sens', sens.value); });
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = cockCam.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix(); cockCam.updateProjectionMatrix();
    post.setSize(innerWidth, innerHeight);
  });

  // ---------------------------------------------------------------- 流程
  let state = 'title', boot = 0, bootLen = 3.4, titleT = 0;
  const touchUI = $('touch');
  status.textContent = '準備完成';
  $('start').style.display = 'inline-block';
  $('start').addEventListener('click', launch);
  $('resume').addEventListener('click', resume);
  $('again').addEventListener('click', () => { $('result').style.display = 'none'; resetPlayer(); newCombat(); startBoot(1.6); });
  // 輸了：從倒下的那一波接著打（評價最高 B）
  let contWave = 1;
  $('cont').addEventListener('click', () => { $('result').style.display = 'none'; resetPlayer(); newCombat(contWave); combat.continued = true; startBoot(1.6); });
  input.onLockChange = (locked) => { if (!locked && state === 'play' && !input.touch.on) pause(); };

  function launch() {
    audio.unlock();
    $('title').classList.add('hide');
    startBoot(3.4);
  }
  function startBoot(len) {
    state = 'boot'; boot = 0; bootLen = len;
    input.enabled = true;
    if (!input.touch.on) input.lock();
    touchUI.style.display = input.touch.on ? 'block' : 'none';
    cockpitView(true);
    cockpit.root.visible = true;
    audio.ui('boot');
  }
  function pause() {
    if (state !== 'play' && state !== 'boot') return;
    state = 'paused';
    $('pause').style.display = 'flex';
    audio.setPaused(true);
  }
  function resume() {
    $('pause').style.display = 'none';
    audio.setPaused(false);
    if (!input.touch.on) input.lock();
    state = boot < 1 ? 'boot' : 'play';
    clock.getDelta();
  }
  function finish(win) {
    state = 'result';
    input.unlock();
    touchUI.style.display = 'none';
    audio.setDanger(false); audio.setLockAlert(0);
    const S = combat.stats;
    const acc = S.shots ? Math.min(1, S.hits / S.shots) : 0;
    const r = 0.4 * clamp((780 - S.time) / 540, 0, 1) + 0.4 * clamp(1 - S.dmgTaken / 20000, 0, 1) + 0.2 * acc;
    let rank = !win ? (combat.wave >= 4 ? 'C' : 'D') : r >= 0.72 ? 'S' : r >= 0.56 ? 'A' : r >= 0.4 ? 'B' : 'C';
    if (win && combat.continued && (rank === 'S' || rank === 'A')) rank = 'B';
    contWave = combat.wave;
    $('cont').style.display = !win && combat.wave >= 2 ? '' : 'none';
    $('cont').textContent = `從第 ${combat.wave} 波繼續 CONTINUE`;
    $('resTitle').textContent = win ? '任務完成' : '任務失敗';
    $('resRank').textContent = rank;
    $('resRank').style.color = win ? '' : '#ff4a4a';
    const mm = Math.floor(S.time / 60), ss = String(Math.floor(S.time % 60)).padStart(2, '0');
    const rows = [['擊毀', S.kills], ['分數', S.score.toLocaleString()], ['時間', `${mm}:${ss}`], ['命中率', `${Math.round(acc * 100)}%`], ['最大連續擊破', S.maxChain], ['承受傷害', Math.round(S.dmgTaken)], ['到達波次', `${combat.wave} / ${WAVES.length}`]];
    $('resTable').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    $('result').style.display = 'flex';
  }

  // 標題畫面：外部鏡頭繞著機體轉
  cockpitView(false);
  cockpit.root.visible = false;

  // ---------------------------------------------------------------- 主迴圈
  const clock = new THREE.Clock();
  let t = 0, odV = 0, speedV = 0, flashV = 0, dangerV = 0;
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), foot = new THREE.Vector3();
  const idle = { mx: 0, my: 0, lookX: 0, lookY: 0 };
  window.__game = { fake: null, launch: () => launch(), player, hero, world, post, cockpit, camera, get combat() { return combat; }, get state() { return state; }, fx, audio, input };

  // 每秒最多畫 60 張：120Hz 螢幕不會多畫一倍（?fps=0 不限、?fps=30 之類可改）
  const FPS = q.has('fps') ? +q.get('fps') : 60;
  let nextT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (FPS > 0) {
      if (now < nextT - 2) return;
      nextT = Math.max(nextT + 1000 / FPS, now);
    }
    tick(Math.min(0.05, clock.getDelta()));
  }
  // 測試用：__game.fake 可覆蓋操作；__game.run(秒) 在背景分頁也能推進
  window.__game.tick = (d) => tick(d);
  window.__game.run = (sec, d = 1 / 60) => { for (let i = 0; i < sec / d; i++) tick(d); };
  function tick(rdt) {
    if (state === 'paused') { input.endFrame(); return; }
    t += rdt;
    const dt = rdt * (combat ? combat.timeScale : 1);

    if (state === 'title') {
      titleT += rdt;
      hero.animate(rdt, { vel: tmp.set(0, 0, 0), grounded: true, boost: 0, torsoYaw: 0, pitch: 0, thrust: 0, aim: null, lean: 0 });
      const a = 0.7 + titleT * 0.06, p = player.pos;
      camera.position.set(p.x + Math.sin(a) * 30, p.y + 7 + Math.sin(titleT * 0.2) * 1.5, p.z + Math.cos(a) * 30);
      camera.lookAt(p.x, p.y + 11, p.z);
      world.followShadow(p);
      world.update(rdt);
      fx.update(rdt);
      post.u.boot.value = 1;
      hud.clear();
      post.render(t);
      input.endFrame();
      return;
    }

    // ---- 開機
    if (state === 'boot') {
      boot = Math.min(1, boot + rdt / bootLen);
      if (boot >= 1) { state = 'play'; combat.start(); }
    }
    const live = state === 'play' || state === 'boot';
    let inp = input.state(rdt);
    if (window.__game.fake) Object.assign(inp, window.__game.fake);
    if (inp.pause && live) { input.unlock(); pause(); input.endFrame(); return; }
    const canMove = (state === 'play' || boot > 0.85) && !combat.dead && state !== 'result';
    if (!canMove) inp = Object.assign({}, inp, idle, { fire: false, lockHold: false, qb: false, boost: false, jump: false, hover: false, saber: false, hardLock: false, od: false, reload: false, lookX: state === 'result' ? 0 : inp.lookX, lookY: state === 'result' ? 0 : inp.lookY });

    // ---- 自機
    player.update(dt, inp);
    hero.animate(dt, player.animState(combat.aimPoint));
    if (hero.footfall) {
      const s = clamp(player.speed / 16, 0.35, 1.3);
      audio.footstep(s);
      cockpit.kick('step', s, hero.footfall);
      hero.bones[hero.footfall > 0 ? 'ankleR' : 'ankleL'].getWorldPosition(foot);
      foot.y = player.pos.y;
      if (player.speed > 6) fx.dust(foot, 0.35 + 0.25 * s);
    }
    if (hero.servo > 0.05) audio.servo(hero.servo);
    audio.boost(player.thrust);
    const agl = player.pos.y - world.height(player.pos.x, player.pos.z);
    if (player.thrust > 0.2 && agl < 22) fx.thrusterWash(tmp.set(player.pos.x, player.pos.y - agl, player.pos.z), player.thrust * (1 - agl / 22));
    if (player.grounded && player.boosting) fx.skid(player.pos, player.vel, 0.6);

    // ---- 駕駛艙（擺鏡頭）
    const C = combat;
    const radar = C.radar();
    cockpit.update(dt, hero, {
      yaw: player.yaw, pitch: player.pitch, boot,
      move: { x: inp.mx, y: inp.my }, turn: { x: inp.lookX * 25, y: inp.lookY * 25 },
      boost: player.boosting, hover: player.hovering, speed: player.speed, alt: agl, vs: player.vel.y,
      ap: player.ap, apMax: player.apMax, en: player.en / 100, parts: C.parts,
      rifle: C.rifle, msl: { ready: C.msl.cd >= 1 ? 6 : 0, max: 6, cd: C.msl.cd, locks: C.msl.locks.length },
      saber: C.saber.cd, od: C.od, lockAlert: C.lockAlert, danger: player.ap / player.apMax < 0.3 ? 1 : 0,
      radar, px: player.pos.x, pz: player.pos.z,
    });

    // ---- 戰鬥、特效、世界
    C.update(dt, state === 'result' ? null : inp, rdt);
    fx.update(dt);
    world.update(dt);
    world.followShadow(player.pos);
    camera.getWorldDirection(fwd);
    audio.setListener(camera.position, fwd);
    const danger = player.ap / player.apMax < 0.3 && !C.dead && state !== 'result';
    audio.setDanger(danger);

    // ---- 畫面後製
    odV += ((C.od.active ? 1 : 0) - odV) * (1 - Math.exp(-rdt * 4));
    speedV += (clamp((player.speed - 20) / 40, 0, 1) * (player.boosting || player.qbT > 0 || player.dashT > 0 ? 1 : 0.3) - speedV) * (1 - Math.exp(-rdt * 6));
    dangerV += ((danger ? 0.6 : 0) - dangerV) * (1 - Math.exp(-rdt * 3));
    flashV = Math.max(0, flashV - rdt * 3);
    if (C.hitstop > 0 && C.killMark > 0.9) flashV = Math.max(flashV, 0.06);
    post.u.boot.value = state === 'boot' ? boot : 1;
    post.u.damage.value = Math.min(1, C.damageFx * 0.8);
    post.u.overdrive.value = odV;
    post.u.speed.value = speedV;
    post.u.danger.value = dangerV;
    post.u.flash.value = flashV;
    post.render(t);

    hud.draw(rdt, { boot: state === 'boot' ? boot : 1, combat: C, player, waves: WAVES.length, groundY: world.height(player.pos.x, player.pos.z) });
    input.endFrame();
  }
  requestAnimationFrame(frame);
}
