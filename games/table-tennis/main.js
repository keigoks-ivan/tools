import { Match, clamp } from './physics.mjs?v=3';
import { createScene } from './scene.js?v=3';

const $ = id => document.getElementById(id), canvas = $('game');
let view = null, paused = false, language = 'zh', aim = 0, spin = 1, mode = 'practice';
let targetX = 0, callUntil = 0, audio = null, sound = false, touch = null;
let renderTime = 0, previous = performance.now(), started = false, lastCoach = 'welcome', demonstrating = false, cameraMode = 'broadcast';
const keys = new Set(), zhText = new Map();
document.querySelectorAll('[data-en]').forEach(el => zhText.set(el, el.innerHTML));
const coaches = {
  welcome: ['先從對拉練習開始。滑鼠選落點，看到「現在揮拍」就點一下；球員會自動調整站位。', 'Aim with the mouse, then click when SWING NOW appears. Footwork is automatic.'],
  ready: ['按一下發球。對拉練習會自動開始下一球，可以專心找擊球節奏。', 'Click to serve. Practice starts the next ball automatically.'],
  receive: ['準備接發球。看球過網、落桌，接近你之前開始揮拍。', 'Watch the serve cross the net and bounce. Begin the stroke before the ball reaches you.'],
  good: ['接到了。揮拍後還原，準備接下一球；滑鼠可以選擇回擊落點。', 'Good return. Recover for the next ball and choose your placement with the mouse.'],
  reach: ['球離身體太遠。手動步法時，用 A／D 或滑鼠調整站位。', 'Out of reach. With manual footwork, move using A / D or the mouse.'],
  timing: ['這次揮拍時機沒接上。等「現在揮拍」亮起，再點一下。', 'That stroke missed its timing. Click when SWING NOW lights up.'],
  wait: ['球正在飛向對手。先還原，等下一顆來球再揮拍。', 'Recover and wait for the next incoming ball.'],
  loss: ['下一球先看落桌，再跟著提示找揮拍時機。對拉練習會自動開始下一球。', 'Watch the bounce and follow the timing cue. Practice starts the next ball automatically.'],
  top: ['上旋從較低的位置往前、往上揮。先用中等力道保持對拉。', 'Topspin moves forward and upward. Use moderate power to sustain a rally.'],
  back: ['下旋用較短的推切動作。試著用落點和節奏變化回擊。', 'Backspin uses a shorter pushing stroke. Vary placement and rhythm.'],
  flat: ['平擊的球路比較直接。先穩穩回到對手半場。', 'A flat stroke travels directly. Aim for a steady return.'],
};
const reasons = { net: ['掛網', 'Into the net'], short: ['未過網', 'Short return'], serve: ['發球失誤', 'Service fault'], double: ['兩次彈跳', 'Double bounce'], missed: ['未接到球', 'Missed return'], out: ['出界', 'Out'] };
function t(zh, en) { return language === 'zh' ? zh : en; }
function coach(key) { lastCoach = key; $('coachText').textContent = coaches[key][language === 'zh' ? 0 : 1]; }
function call(text, duration = 1.2) { $('callout').textContent = text; $('callout').classList.add('show'); callUntil = performance.now() / 1000 + duration; }
function unlockAudio() {
  if (!sound) return;
  if (!audio) { const Context = window.AudioContext || window.webkitAudioContext; if (Context) audio = new Context(); }
  if (audio?.state === 'suspended') audio.resume().catch(() => {});
}
function playSound(kind, side = 1) {
  if (!sound || !audio || audio.state !== 'running') return;
  const osc = audio.createOscillator(), gain = audio.createGain(), pan = audio.createStereoPanner(), now = audio.currentTime;
  osc.type = kind === 'bounce' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(kind === 'bounce' ? 460 : kind === 'point' ? 780 : 1080, now);
  osc.frequency.exponentialRampToValueAtTime(170, now + 0.045);
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.08, now + 0.001); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
  pan.pan.value = side * 0.28; osc.connect(gain).connect(pan).connect(audio.destination);
  osc.start(now); osc.stop(now + 0.1); osc.onended = () => { osc.disconnect(); gain.disconnect(); pan.disconnect(); };
}
const match = new Match({ onEvent(event) {
  view?.event(event, match.clock);
  if (event.type === 'ready') coach(event.server === 1 ? 'ready' : 'receive');
  if (event.type === 'serve') playSound('hit', event.side);
  if (event.type === 'bounce') playSound('bounce', event.z >= 0 ? 1 : -1);
  if (event.type === 'hit') { playSound('hit', event.side); if (event.side === 1) coach('good'); }
  if (event.type === 'miss') { coach(event.reason); call(event.reason === 'reach' ? t('移動到球前方', 'Move into reach') : t('揮拍沒接上', 'Stroke missed'), 0.7); }
  if (event.type === 'let') call(t('擦網，重新發球', 'Let — serve again'));
  if (event.type === 'point' || event.type === 'over') {
    playSound('point', event.winner); const reason = reasons[event.reason][language === 'zh' ? 0 : 1];
    call(match.practice ? reason : `${event.winner === 1 ? t('你得分', 'Your point') : t('對手得分', 'Opponent’s point')} · ${reason}`);
    coach(event.winner === 1 ? 'good' : 'loss'); if (event.type === 'over') showResult();
  }
  updateHud();
} });
function updateHud() {
  $('yourScore').textContent = String(match.score[0]).padStart(2, '0'); $('aiScore').textContent = String(match.score[1]).padStart(2, '0');
  $('yourServe').classList.toggle('active', match.server === 1); $('aiServe').classList.toggle('active', match.server === -1);
  $('rallyCount').textContent = match.shots; $('bestRally').textContent = match.best; $('speed').textContent = match.lastSpeed ? Math.round(match.lastSpeed) : '—';
  $('format').textContent = mode === 'practice' ? t('對拉練習 · 自動開始下一球', 'RALLY PRACTICE · AUTO RESTART') : t('11 分制 · 領先 2 分獲勝', 'FIRST TO 11 · WIN BY 2');
  $('strokeLabel').textContent = demonstrating ? t('接手操作', 'TAKE CONTROL') : match.phase === 'ready' && match.server === 1 ? t('發球', 'SERVE') : t('揮拍', 'SWING');
  $('stroke').disabled = !started || paused || (!demonstrating && !match.inputReady);
}
function start(isDemo = false) {
  demonstrating = isDemo; $('demoBadge').hidden = !demonstrating;
  if (demonstrating) { mode = 'practice'; document.querySelectorAll('[data-mode]').forEach(btn => { const selected = btn.dataset.mode === mode; btn.classList.toggle('selected', selected); btn.setAttribute('aria-pressed', String(selected)); }); }
  unlockAudio(); started = true; paused = false; touch = null; targetX = 0; keys.clear(); view?.reset();
  $('startPanel').hidden = true; $('resultPanel').hidden = true; $('pausePanel').hidden = true; $('difficulty').disabled = true;
  document.querySelectorAll('[data-mode]').forEach(btn => { btn.disabled = true; }); $('pause').textContent = t('暫停', 'Pause'); $('callout').classList.remove('show');
  match.start($('difficulty').value, { practice: mode === 'practice', playerHand: 'left' }); updateHud(); canvas.focus({ preventScroll: true });
}
function showResult() {
  $('resultPanel').hidden = false; $('difficulty').disabled = false; document.querySelectorAll('[data-mode]').forEach(btn => { btn.disabled = false; });
  $('resultTitle').textContent = match.score[0] > match.score[1] ? t('這局是你的。', 'Your game.') : t('下一局再來。', 'One more rally.');
  $('resultText').textContent = t(`${match.score[0]} : ${match.score[1]} · 最長 ${match.best} 次連續擊球`, `${match.score[0]} : ${match.score[1]} · Best rally: ${match.best} shots`);
}
function pause(force) {
  if (!started || match.phase === 'over') return;
  paused = force ?? !paused; touch = null; keys.clear(); $('pausePanel').hidden = !paused; $('pause').textContent = paused ? t('繼續', 'Resume') : t('暫停', 'Pause'); updateHud();
}
function setSpin(value) {
  spin = value; document.querySelectorAll('[data-spin]').forEach(btn => { const selected = Number(btn.dataset.spin) === spin; btn.classList.toggle('selected', selected); btn.setAttribute('aria-pressed', String(selected)); }); coach(spin > 0 ? 'top' : spin < 0 ? 'back' : 'flat');
}
function setAim(value) {
  aim = clamp(value, -1, 1); document.querySelectorAll('[data-aim]').forEach(btn => { const selected = Math.abs(Number(btn.dataset.aim) - aim) < 0.15; btn.classList.toggle('selected', selected); btn.setAttribute('aria-pressed', String(selected)); });
}
function swing() { if (!started || paused) return; if (demonstrating) { demonstrating = false; $('demoBadge').hidden = true; coach('welcome'); updateHud(); return; } if (!match.inputReady) return; unlockAudio(); match.strike({ aim, power: Number($('power').value) / 100, spin, assist: $('assist').checked }); updateHud(); }
function pointAt(event) { if (paused || !view) return; if ($('assist').checked) setAim(view.aimTarget(event.clientX)); else targetX = view.moveTarget(event.clientX); }
$('start').addEventListener('click', () => start()); $('again').addEventListener('click', () => start());
$('demo').addEventListener('click', () => start(true));
$('camera').addEventListener('click', () => { cameraMode = cameraMode === 'broadcast' ? 'player' : 'broadcast'; view?.setCamera(cameraMode); $('camera').setAttribute('aria-pressed', String(cameraMode === 'player')); $('camera').textContent = cameraMode === 'player' ? t('選手鏡頭', 'Player view') : t('轉播鏡頭', 'Broadcast view'); });
$('reset').addEventListener('click', () => {
  started = false; paused = false; demonstrating = false; $('demoBadge').hidden = true; touch = null; keys.clear(); targetX = 0; match.reset(); view?.reset(); $('startPanel').hidden = false; $('resultPanel').hidden = true; $('pausePanel').hidden = true; $('difficulty').disabled = false;
  document.querySelectorAll('[data-mode]').forEach(btn => { btn.disabled = false; }); $('pause').textContent = t('暫停', 'Pause'); $('callout').classList.remove('show'); coach('welcome'); updateHud();
});
$('pause').addEventListener('click', () => pause()); $('resume').addEventListener('click', () => pause(false));
$('sound').addEventListener('click', () => { sound = !sound; unlockAudio(); $('sound').setAttribute('aria-pressed', String(sound)); $('sound').textContent = sound ? t('音效開', 'Sound on') : t('音效關', 'Sound off'); });
$('language').addEventListener('click', () => {
  language = language === 'zh' ? 'en' : 'zh'; document.documentElement.lang = language === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-en]').forEach(el => { if (language === 'en') el.textContent = el.dataset.en; else el.innerHTML = zhText.get(el); }); $('language').textContent = language === 'zh' ? 'EN' : '中文';
  $('sound').textContent = sound ? t('音效開', 'Sound on') : t('音效關', 'Sound off'); $('pause').textContent = paused ? t('繼續', 'Resume') : t('暫停', 'Pause'); $('camera').textContent = cameraMode === 'player' ? t('選手鏡頭', 'Player view') : t('轉播鏡頭', 'Broadcast view'); coach(lastCoach); if (match.phase === 'over') showResult(); updateHud();
});
document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { mode = btn.dataset.mode; document.querySelectorAll('[data-mode]').forEach(item => { const selected = item === btn; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected)); }); updateHud(); }));
document.querySelectorAll('[data-spin]').forEach(btn => btn.addEventListener('click', () => setSpin(Number(btn.dataset.spin)))); document.querySelectorAll('[data-aim]').forEach(btn => btn.addEventListener('click', () => setAim(Number(btn.dataset.aim))));
$('power').addEventListener('input', () => { $('powerLabel').textContent = `${$('power').value}%`; }); $('assist').addEventListener('change', () => { targetX = match.playerX; keys.clear(); });
canvas.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse') pointAt(event);
  else if (touch?.id === event.pointerId) { pointAt(event); if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 12) touch.dragged = true; }
});
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return; event.preventDefault(); canvas.focus({ preventScroll: true });
  if (event.pointerType === 'mouse') { pointAt(event); swing(); }
  else if (!touch) { touch = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false }; canvas.setPointerCapture(event.pointerId); pointAt(event); }
});
canvas.addEventListener('pointerup', event => { if (touch?.id === event.pointerId) { const tap = !touch.dragged; touch = null; if (tap) swing(); } }); canvas.addEventListener('pointercancel', event => { if (touch?.id === event.pointerId) touch = null; });
$('stroke').addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); canvas.focus({ preventScroll: true }); swing(); });
$('stroke').addEventListener('click', event => { if (event.detail === 0) swing(); });
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement || !started) return;
  const key = event.key.toLowerCase(); if ([' ', 'arrowleft', 'arrowright', 'a', 'd', 'p', 'escape', '1', '2', '3'].includes(key)) event.preventDefault(); if (event.repeat) return;
  if (key === 'p' || key === 'escape') { pause(); return; } if (paused) return;
  keys.add(key); if (key === ' ') swing(); if (key === '1') setSpin(1); if (key === '2') setSpin(0); if (key === '3') setSpin(-1); if (key === 'arrowleft') setAim(aim - 0.5); if (key === 'arrowright') setAim(aim + 0.5);
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase())); window.addEventListener('blur', () => pause(true)); document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
function contextLost() { pause(true); $('loading').hidden = false; $('loading').textContent = t('畫面暫時中斷。重新整理頁面即可回到球場。', 'The court view was interrupted. Reload to reopen the arena.'); }
try { view = createScene(canvas, $('court'), contextLost); $('loading').hidden = true; } catch (error) { console.error(error); $('loading').textContent = t('球場無法開啟。請開啟瀏覽器硬體加速後重新整理。', 'Could not open the arena. Enable hardware acceleration and reload.'); }
coach('welcome'); updateHud();
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min((now - previous) / 1000, 0.25); previous = now;
  if (!paused) {
    if (!started) renderTime += dt;
    else {
      if (demonstrating && match.timingReady) { setAim(Math.sin(match.totalHits * 1.31) * 0.62); match.strike({ aim, power: 0.55, spin: match.totalHits % 7 === 4 ? 0 : 1, assist: true }); }
      const contact = match.contact(1);
      if ($('assist').checked || demonstrating) {
        if (contact?.legal) targetX = clamp(contact.x + (contact.x < 0 ? 0.22 : -0.16), -1.1, 1.1);
        else if (!match.playerSwing || match.clock > match.playerSwing.startedAt + match.playerSwing.contactDelay + 0.15) targetX = 0;
      } else { if (keys.has('a')) targetX -= dt * 2.1; if (keys.has('d')) targetX += dt * 2.1; targetX = clamp(targetX, -1.1, 1.1); }
      for (let remaining = dt; remaining > 0.00001; remaining -= 0.1) match.step(Math.min(remaining, 0.1), targetX); renderTime = match.clock;
    }
  }
  const contact = match.contact(1), ready = started && !paused && match.timingReady && contact.time >= 0.12;
  $('court').classList.toggle('ready-to-swing', Boolean(ready)); $('stroke').dataset.ready = String(Boolean(ready));
  $('timingMarker').style.left = `${contact ? clamp((0.7 - contact.time) / 0.7 * 100, 0, 100) : 0}%`;
  $('timingLabel').textContent = paused ? t('暫停中', 'PAUSED') : ready ? t('現在揮拍', 'SWING NOW') : match.playerSwing ? t('揮拍中 · 準備還原', 'STROKE / RECOVER') : contact ? t('看來球 · 等待時機', 'WATCH THE BALL') : match.phase === 'ready' ? t('準備發球', 'READY TO SERVE') : t('還原 · 準備下一球', 'RECOVER / NEXT BALL'); updateHud();
  if (now / 1000 > callUntil) $('callout').classList.remove('show'); view?.render(match, renderTime, paused ? 0 : dt, aim, paused);
  const cue = contact?.legal && contact.time < 0.5 && !paused && !match.playerSwing ? view?.projectContact(contact) : null;
  $('contactCue').hidden = !cue; if (cue) { $('contactCue').style.left = `${cue.x}px`; $('contactCue').style.top = `${cue.y}px`; }
}
requestAnimationFrame(frame);
