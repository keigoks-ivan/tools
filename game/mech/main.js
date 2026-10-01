// 鋼鐵黃昏 IRON DUSK：主程式
//   流程：標題（機體展示鏡頭＋選關）→ 開機（擋板升起）→ 戰鬥（一關）→ 暫停／結算 → 下一關
//   ?show=… 或 ?free 會改載入 preview.js（美術／動作預覽）
import * as THREE from 'three';
import { qualityLevel, pixelRatio, FrameGate } from './runtime.js';

const q = new URLSearchParams(location.search);
// 大檔案（貼圖、HDR、模型）改從 jsDelivr 下載，網站主機給大檔很慢；不能用時照舊從本站（見 cdn.js）
try { const f = await (await import('./cdn.js')).useCDN(); if (f) THREE.DefaultLoadingManager.setURLModifier(f); } catch (e) {}
if (q.has('show') || q.has('free')) await import('./preview.js');
else await game();

async function game() {
  const { loadAssets, World } = await import('./env.js');
  const { Mech, initMechMaterials, SEE } = await import('./mechs.js');
  const { Post } = await import('./post.js');
  const { Cockpit } = await import('./cockpit.js');
  const { Input } = await import('./input.js');
  const { Player } = await import('./player.js');
  const { Combat, STAGES, stageWeight } = await import('./combat.js');
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
  // 扶手台擋住的畫面，城市那層直接跳過不畫（?nomask 可關掉比對）
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
  // n＝關卡（遭遇戰從路線起點、面向第一段出發）；cp＝檢查點
  function resetPlayer(n = 0, cp = null) {
    const E = n ? STAGES[n - 1].enc : null;
    let x = SPAWN.x, z = SPAWN.z, yaw = 0;
    if (cp) { x = cp.x; z = cp.z; yaw = cp.yaw; }
    else if (E) { const [a, b] = E.pts; x = a.x; z = a.z; yaw = Math.atan2(b.x - a.x, b.z - a.z); }
    player.pos.set(x, world.height(x, z), z);
    player.vel.set(0, 0, 0); player.yaw = yaw; player.pitch = 0; hero.legYaw = yaw;
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

  function applyView() { cockpitView(!tpView); cockpit.root.visible = !tpView; if (!tpView) seeOff(); }
  addEventListener('wheel', (e) => { if (!tpView) return; chaseD = clamp(chaseD * Math.exp(e.deltaY * 0.001), 6, 40); store.set('camd2', chaseD.toFixed(1)); }, { passive: true });
  // 機體後方視角（越肩）：鏡頭在右肩外側、略高，機體偏畫面左邊，準心前方空出來；跟著瞄準方向轉。
  //   鏡頭正前方＝瞄準方向，所以畫面中央（準心）就是子彈會去的地方。
  //   撞到建築：先縮側移、再縮後退距離（縮短立刻、恢復慢慢來，轉角不會一直跳）
  const chasePivot = new THREE.Vector3(), chaseSide = new THREE.Vector3(), chaseOff = new THREE.Vector3(), chaseN = new THREE.Vector3(), chaseE = new THREE.Euler();
  let chaseK = 1, chaseBack = 9, chaseSkip = 0, chaseSideK = 1;   // 後退距離被擠短的比例、實際離機體多遠、鏡頭到機體中心沿瞄準線多遠（公尺）
  function chaseCam(dt) {
    const k = hero.scale;
    camera.quaternion.setFromEuler(chaseE.set(player.pitch, player.yaw + Math.PI, 0, 'YXZ'));
    hero.bones.torso.getWorldPosition(chasePivot);
    chasePivot.y += 5 * k;
    // 機體半寬約 4.8 m：側移要超過肩寬，準心才不會壓在肩甲、背後翼板上
    chaseSide.set((5.4 + chaseD * 0.06) * k, 3 * k, 0).applyQuaternion(camera.quaternion).add(chasePivot);
    let hit = world.raycast(chasePivot, chaseSide, chaseN);
    chaseSideK = hit >= 0 && hit <= 1 ? Math.max(0, hit - 0.08) : 1;
    chaseSide.lerpVectors(chasePivot, chaseSide, chaseSideK);
    chaseOff.set(0, 0, chaseD * k).applyQuaternion(camera.quaternion).add(chaseSide);
    hit = world.raycast(chaseSide, chaseOff, chaseN);
    const want = hit >= 0 && hit <= 1 ? Math.max(0.03, hit - 0.04) : 1;
    chaseK = want < chaseK ? want : Math.min(want, chaseK + dt * 1.5);
    camera.position.lerpVectors(chaseSide, chaseOff, chaseK);
    chaseBack = chaseD * k * chaseK;
    const gy = world.height(camera.position.x, camera.position.z) + 2;
    if (camera.position.y < gy) camera.position.y = gy;
    // 瞄準線從機體這裡才開始算（鏡頭和機體之間的東西打不到，不能拿來當準心目標）
    chaseSkip = Math.max(0, chaseN.set(0, 0, -1).applyQuaternion(camera.quaternion).dot(chaseOff.subVectors(chasePivot, camera.position)));
  }
  // 透視：準心、鎖定目標（沒有就用準心吸住的目標）被自機擋住的地方挖網點；鏡頭被建築擠近或側移受限時整台淡掉
  const seeP = new THREE.Vector3(), seeQ = new THREE.Vector3();
  function seeOff() { SEE.c.value.w = 0; SEE.t.value.w = 0; SEE.a.value = 0; }
  function seeThrough(C) {
    if (!tpView) { seeOff(); return; }
    const asp = camera.aspect;
    renderer.getDrawingBufferSize(SEE.res.value);
    SEE.c.value.set(asp / 2, 0.5, 0.13, 1);
    SEE.a.value = Math.max(clamp((7 - chaseBack) / 4, 0, 0.8), (1 - chaseSideK) * 0.65);
    // 整台淡掉時，眼睛、槍口的發光小燈也先關（不然會浮在半透明的機體上）
    for (const gl of hero.glows) gl.visible = SEE.a.value < 0.25;
    const L = C.lockTarget && !C.lockTarget.dead ? C.lockTarget : C.soft;
    SEE.t.value.w = 0;
    if (!L) return;
    camera.updateMatrixWorld();
    L.chest(seeP); seeQ.copy(seeP); seeQ.y += 9 * L.scale;
    seeP.project(camera); seeQ.project(camera);
    if (seeP.z > 1 || Math.abs(seeP.x) > 1.3 || Math.abs(seeP.y) > 1.3) return;
    // 半徑：比 HUD 的目標框大一圈（近戰貼臉時封頂，不然整隻手臂都被挖掉）
    SEE.t.value.set((seeP.x * 0.5 + 0.5) * asp, seeP.y * 0.5 + 0.5, Math.min(0.2, Math.abs(seeQ.y - seeP.y) * 0.5 * 1.7 + 0.05), 1);
  }

  // ---------------------------------------------------------------- 戰鬥
  let combat = null, stageNo = 1;
  // 可破壞建築：特效／音效／座艙震動／HUD 提示
  world.hook({ fx, audio, cockpit, player, note: (t, c) => combat && combat.note(t, c) });
  function newCombat(n = stageNo, cp = null) {
    if (combat) combat.dispose();
    world.resetBuildings();   // 每次開關／重來／回標題：大樓全部復原
    fx.clear();
    stageNo = n;
    combat = new Combat({ scene, world, camera, player, hero, fx, audio, cockpit, post, onEnd: finish, stage: n, cp });
    window.__combat = combat;
  }
  newCombat();

  // ---------------------------------------------------------------- 設定
  // 視角：false＝駕駛艙（第一人稱）、true＝機體後方（看得到整台機體）；記住上次的選擇
  const store0 = (k, d) => { try { const v = localStorage.getItem('mech.' + k); const n = v === null ? d : +v; return Number.isFinite(n) ? n : d; } catch (e) { return d; } };
  let tpView = store0('view', 0) === 1;
  let chaseD = store0('camd2', 9);
  chaseD = Number.isFinite(chaseD) ? clamp(chaseD, 6, 40) : 9;   // 近背視角距離（公尺），滑鼠滾輪調整；舊版遠鏡頭設定不套用
  const store = { get: (k, d) => { try { const v = localStorage.getItem('mech.' + k); const n = v === null ? d : +v; return Number.isFinite(n) ? n : d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('mech.' + k, v); } catch (e) {} } };
  let quality = store.get('q', 1);
  function setQuality(qv) {
    qv = qualityLevel(qv); quality = qv; store.set('q', qv);
    renderer.setPixelRatio(pixelRatio(innerWidth, innerHeight, devicePixelRatio, qv));
    renderer.setSize(innerWidth, innerHeight);
    post.setSize(innerWidth, innerHeight);
    post.setQuality(qv);
    post.gtao.enabled = qv > 1;
    const shadowSize = [1024, 2048, 4096][qv];
    if (world.sun.shadow.mapSize.x !== shadowSize) {
      world.sun.shadow.mapSize.setScalar(shadowSize);
      if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
      world.sun.shadow.needsUpdate = true;
    }
    renderer.shadowMap.type = qv > 0 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    fx.setQuality(qv);
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
  // 全螢幕：標題右上角、暫停選單各一顆（手機不支援就藏起來）
  const de = document.documentElement, fsBtns = document.querySelectorAll('.fs');
  const fsOn = () => document.fullscreenElement || document.webkitFullscreenElement;
  if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtns.forEach((b) => { b.style.display = 'none'; });
  fsBtns.forEach((b) => b.addEventListener('click', () => {
    try {
      const p = fsOn() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (de.requestFullscreen || de.webkitRequestFullscreen).call(de, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }));
  for (const k of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(k, () => fsBtns.forEach((b) => { b.textContent = fsOn() ? '離開全螢幕 EXIT' : '全螢幕 FULLSCREEN'; }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  addEventListener('blur', () => pause());
  addEventListener('resize', () => {
    renderer.setPixelRatio(pixelRatio(innerWidth, innerHeight, devicePixelRatio, quality));
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = cockCam.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix(); cockCam.updateProjectionMatrix();
    post.setSize(innerWidth, innerHeight);
  });

  // ---------------------------------------------------------------- 進度（打過第幾關、每關最佳評價；?all 全開）
  const RANKS = ['', 'C', 'B', 'A', 'S'];
  const cleared = () => (q.has('all') ? STAGES.length : store.get('cleared', 0));
  const nextStage = () => Math.min(STAGES.length, cleared() + 1);
  function renderStages() {
    const nx = nextStage();
    $('stages').innerHTML = STAGES.map((D, i) => {
      const n = i + 1, lock = n > nx, best = store.get('best' + n, 0);
      return `<button class="stg${lock ? ' lock' : ''}${n === nx ? ' next' : ''}" data-s="${n}"${lock ? ' disabled' : ''}>`
        + `${D.enc ? '<em>遭遇戰</em>' : ''}<b>${n}</b><span>${lock ? 'LOCKED' : D.name}</span>${best ? `<i>${RANKS[best]}</i>` : ''}</button>`;
    }).join('');
  }

  // ---------------------------------------------------------------- 流程
  let state = 'title', boot = 0, bootLen = 3.4, titleT = 0;
  const touchUI = $('touch');
  status.textContent = '選擇關卡';
  renderStages();
  $('stages').style.display = 'grid';
  $('stages').addEventListener('click', (ev) => { const b = ev.target.closest('.stg'); if (b && !b.disabled) { launch(+b.dataset.s); audio.ui('stage'); } });
  // 選單音效：滑過按鈕、按下按鈕
  document.addEventListener('mouseover', (ev) => { const b = ev.target.closest('.stg:not(.lock), .btn'); if (b && !b.contains(ev.relatedTarget)) audio.ui('hover'); });
  document.addEventListener('click', (ev) => { if (ev.target.closest('.btn')) audio.ui('click'); });
  // 瀏覽器要等玩家先點一下才准出聲：第一次點擊或按鍵就解鎖，標題曲才聽得到
  for (const k of ['pointerdown', 'keydown']) addEventListener(k, () => audio.unlock(), { once: true });
  audio.music('title');
  $('resume').addEventListener('click', resume);
  const replay = (n, cp = null) => { $('result').style.display = 'none'; resetPlayer(n, cp); newCombat(n, cp); startBoot(1.6); };
  $('next').addEventListener('click', () => { const n = stageNo + 1; $('result').style.display = 'none'; resetPlayer(n); newCombat(n); brief(n, () => startBoot(1.6)); });
  $('again').addEventListener('click', () => replay(stageNo));
  $('cont').addEventListener('click', () => replay(stageNo, combat.cp));   // 遭遇戰：從檢查點繼續
  $('menu').addEventListener('click', toTitle);
  $('quit').addEventListener('click', toTitle);
  input.onLockChange = (locked) => { if (!locked && (state === 'play' || state === 'boot') && !input.touch.on) pause(); };

  function launch(n = nextStage()) {
    audio.unlock();
    $('title').classList.add('hide');
    resetPlayer(n); newCombat(n);
    brief(n, () => startBoot(3.4));
  }
  // 出擊前的簡報卡（stages.js 的 brief）：點一下或按任意鍵出擊；重來（同一關）不再顯示
  function brief(n, go) {
    const D = STAGES[n - 1];
    if (!D.brief || !D.brief.length || q.has('nobrief')) { go(); return; }
    let el = $('brief');
    if (!el) {
      el = document.createElement('div'); el.id = 'brief';
      el.style.cssText = 'position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(3,7,10,0.92);color:#dcecf0;font-family:Rajdhani,"Noto Sans TC",sans-serif;text-align:center;padding:24px;cursor:pointer';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div style="font-size:13px;letter-spacing:0.4em;color:#7ff3ff">BRIEFING　STAGE ${n}</div>`
      + `<div style="font-size:clamp(30px,5vw,52px);font-weight:700;margin:10px 0 2px">${D.name}</div><div style="font-size:14px;letter-spacing:0.3em;color:#ffb850;margin-bottom:28px">${D.en}</div>`
      + D.brief.map((t) => `<p style="max-width:640px;margin:6px 0;font:500 17px/1.7 'Noto Sans TC',sans-serif">${t}</p>`).join('')
      + '<div style="margin-top:34px;font-size:13px;letter-spacing:0.3em;color:#8aa3ab">點一下或按任意鍵出擊</div>';
    el.style.display = 'flex';
    const t0 = performance.now();
    const done = () => {
      if (performance.now() - t0 < 400) return;   // 剛出現時的那一下不算
      removeEventListener('keydown', done); el.removeEventListener('pointerdown', done);
      el.style.display = 'none'; go();
    };
    addEventListener('keydown', done); el.addEventListener('pointerdown', done);
  }
  // 回標題選關：清掉戰場、機體擺回展示鏡頭
  function toTitle() {
    $('result').style.display = 'none'; $('pause').style.display = 'none';
    audio.setPaused(false); audio.setDanger(false); audio.setLockAlert(0); audio.boost(0);
    input.unlock(); input.enabled = false;
    touchUI.style.display = 'none';
    resetPlayer(); newCombat(stageNo);
    cockpitView(false); cockpit.root.visible = false; seeOff();
    for (const k of ['damage', 'overdrive', 'speed', 'danger', 'flash']) post.u[k].value = 0;
    odV = speedV = flashV = dangerV = 0;
    state = 'title'; titleT = 0;
    renderStages();
    audio.music('title');
    $('title').classList.remove('hide');
  }
  function startBoot(len) {
    combat.prep();   // 遭遇戰：擺路障、第一區的遠處目標
    state = 'boot'; boot = 0; bootLen = len;
    input.enabled = true;
    if (!input.touch.on) input.lock();
    touchUI.style.display = input.touch.on ? 'block' : 'none';
    applyView();
    audio.ui('boot');
    audio.music('battle', { stage: STAGES[stageNo - 1].music || stageNo });
  }
  function pause() {
    if (state !== 'play' && state !== 'boot') return;
    state = 'paused';
    $('pause').style.display = 'flex';
    audio.setPaused(true); input.reset();
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
    const S = combat.stats, n = combat.stage, D = STAGES[n - 1], last = n === STAGES.length;
    const acc = S.shots ? Math.min(1, S.hits / S.shots) : 0;
    // 評價：時間（依這關敵機多寡給標準時間）、承受傷害、命中率
    let rank = '';
    if (win) {
      const w = stageWeight(D), E = D.enc;
      // 遭遇戰：標準時間照路線長度＋敵人份量（E.par），中途有補給所以傷害分母放大；接關過的最高 A
      let r = E ? 0.4 * clamp((E.par * 1.9 - S.time) / (E.par * 0.9), 0, 1) + 0.4 * clamp(1 - S.dmgTaken / (player.apMax * (1 + 0.1 * (E.secs.length - 1))), 0, 1) + 0.2 * acc
        : 0.4 * clamp((35 * w + 30 - S.time) / (25 * w + 15), 0, 1) + 0.4 * clamp(1 - S.dmgTaken / player.apMax, 0, 1) + 0.2 * acc;
      if (S.cont) r = Math.min(r, 0.71);
      rank = r >= 0.72 ? 'S' : r >= 0.56 ? 'A' : r >= 0.4 ? 'B' : 'C';
      if (n > cleared()) store.set('cleared', n);
      if (RANKS.indexOf(rank) > store.get('best' + n, 0)) store.set('best' + n, RANKS.indexOf(rank));
    }
    audio.music(win ? (last ? 'allclear' : 'clear') : 'fail');
    $('resTitle').textContent = win ? (last ? '全部過關' : `第 ${n} 關完成`) : `第 ${n} 關失敗`;
    $('resSub').textContent = win ? (last ? 'ALL CLEAR' : 'STAGE CLEAR') : 'MISSION FAILED';
    $('resRank').textContent = rank;
    $('resRank').style.display = win ? '' : 'none';
    $('next').style.display = win && !last ? '' : 'none';
    $('again').textContent = win ? '再打一次 RETRY' : '再試一次 RETRY';
    $('cont').style.display = !win && combat.cp ? '' : 'none';
    const mm = Math.floor(S.time / 60), ss = String(Math.floor(S.time % 60)).padStart(2, '0');
    const rows = [['關卡', `${n}　${D.name}`], ['擊毀', S.kills], ['分數', S.score.toLocaleString()], ['時間', `${mm}:${ss}`], ['命中率', `${Math.round(acc * 100)}%`], ['最大連續擊破', S.maxChain], ['承受傷害', Math.round(S.dmgTaken)]];
    if (D.enc) rows.splice(1, 0, ['區域', `${win ? D.enc.secs.length : combat.enc.sec}/${D.enc.secs.length}`]);
    if (S.cont) rows.push(['續關', `${S.cont} 次（評價最高 A）`]);
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
  window.__game = { fake: null, launch: (n) => launch(n), toTitle: () => toTitle(), player, hero, world, post, cockpit, camera, get combat() { return combat; }, get state() { return state; }, fx, audio, input };

  // 每秒最多畫 60 張：120Hz 螢幕不會多畫一倍（?fps=0 不限、?fps=30 之類可改）
  const FPS = q.has('fps') ? +q.get('fps') : 60;
  const frameGate = new FrameGate();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || state === 'paused') { clock.getDelta(); input.endFrame(); return; }
    if (!frameGate.ready(now, state === 'title' ? 30 : FPS)) return;
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
    if (inp.view && live) { tpView = !tpView; store.set('view', tpView ? 1 : 0); applyView(); }
    const canMove = (state === 'play' || boot > 0.85) && !combat.dead && state !== 'result';
    if (!canMove) inp = Object.assign({}, inp, idle, { fire: false, lockHold: false, qb: false, boost: false, jump: false, hover: false, saber: false, cannon: false, hardLock: false, od: false, reload: false, lookX: state === 'result' ? 0 : inp.lookX, lookY: state === 'result' ? 0 : inp.lookY });

    // 光波砲充能／發射中：機體要撐住後座——轉向變慢、走不快、不能衝刺
    if (combat && combat.cannon.phase) inp = Object.assign({}, inp, { lookX: inp.lookX * 0.45, lookY: inp.lookY * 0.45, mx: inp.mx * 0.35, my: inp.my * 0.35, boost: false });

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
      saber: C.saber.cd, cannon: C.cannon, od: C.od, lockAlert: C.lockAlert, danger: player.ap / player.apMax < 0.3 ? 1 : 0,
      radar, px: player.pos.x, pz: player.pos.z, route: C.enc && C.enc.ahead, wp: C.enc && C.enc.wp,
    });
    if (tpView) chaseCam(rdt);
    C.aimSkip = tpView ? chaseSkip : 0;

    // ---- 戰鬥、特效、世界
    C.update(dt, state === 'result' ? null : inp, rdt);
    fx.update(dt);
    world.update(dt);
    world.followShadow(player.pos);
    camera.getWorldDirection(fwd);
    audio.setListener(camera.position, fwd);
    const danger = player.ap / player.apMax < 0.3 && !C.dead && state !== 'result';
    audio.setDanger(danger);
    // 配樂強度：附近敵人越多、被鎖定、挨打、血少、覺醒，音樂就疊越多層
    let near = 0;
    for (const e of C.enemies) if (!e.dead && e.pos.distanceToSquared(player.pos) < 400 * 400) near += e.vehicle ? 0.5 : e.kind === 'grunt' ? 1 : 1.6;
    audio.setIntensity(state !== 'play' ? 0.15 : clamp(0.2 + near * 0.08 + C.lockAlert * 0.25 + C.damageFx * 0.3 + (danger ? 0.2 : 0) + odV * 0.35, 0, 1));

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
    // 瞄準鏡頭：鎖定時另拍一張小的放大畫面，貼在側邊面板
    cockpit.targetView(renderer, scene, C.lockTarget);
    seeThrough(C);
    post.render(t);

    hud.draw(rdt, { boot: state === 'boot' ? boot : 1, combat: C, player, stages: STAGES.length, groundY: world.height(player.pos.x, player.pos.z), tp: tpView });
    input.endFrame();
  }
  requestAnimationFrame(frame);

  // 從前傳《鋼鐵黃昏 零》接過來（?zero）：跳過標題，黑畫面待命；瀏覽器要先有一次操作才能鎖滑鼠、出聲，按一下就直接第 1 關開機
  if (q.has('zero')) {
    const tl = $('title'), kids = [...tl.children];
    tl.style.background = '#000';
    for (const el of kids) el.style.display = 'none';
    const msg = document.createElement('div');
    msg.innerHTML = '<div class="logo" style="font-size:clamp(28px,5vw,56px)">XG-01<small>SYSTEM STANDBY</small></div><div class="zh">蒼焰　待命</div>'
      + '<div style="margin-top:40px;font-size:13px;letter-spacing:0.3em;color:#8aa3ab">按任意鍵或點一下，啟動機體</div>';
    tl.appendChild(msg);
    const go = () => {
      removeEventListener('keydown', go); removeEventListener('pointerdown', go);
      msg.remove(); for (const el of kids) el.style.display = ''; tl.style.background = '';
      launch(1);
    };
    addEventListener('keydown', go); addEventListener('pointerdown', go);
  }
}
