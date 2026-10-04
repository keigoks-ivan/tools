import { Match, clamp } from './physics.mjs';
import { createScene } from './scene.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
let view = null, paused = false, language = 'zh', aim = 0, spin = 1;
let targetX = 0, chargeAt = null, callUntil = 0, audio = null, sound = true;
let renderTime = 0, previous = performance.now(), started = false, lastCoach = 'welcome';
const keys = new Set();
const zhText = new Map();
document.querySelectorAll('[data-en]').forEach(el => zhText.set(el, el.innerHTML));
const coaches = {
  welcome: ['先移動到來球前方，等球彈起再揮拍。開啟輔助時，可以提前按一下。', 'Move in front of the ball. Hit after the bounce. With timing assist, you can swing a little early.'],
  ready: ['輪到你發球。按一下球場、揮拍按鈕或空白鍵，開始這一分。', 'Your serve. Click the court, tap the swing button or press Space to begin.'],
  receive: ['阿林發球。觀察球的方向，左右移動到接球位置。', 'Lin is serving. Watch the ball and move sideways into position.'],
  good: ['這球接得剛好。試著打往對手兩側，讓他多移動幾步。', 'Good contact. Place the ball to either side and make your opponent move.'],
  reach: ['球離身體太遠了。先左右移動到球前方，再準備揮拍。', 'The ball was out of reach. Move your player in front of it before swinging.'],
  timing: ['時機還沒到。讓球先在你的半場彈一次，再回擊。', 'Wait for the bounce on your half, then swing as the ball comes towards you.'],
  wait: ['球已經回過去了。回到中間，準備接下一球。', 'Your shot is on its way. Recover towards the middle for the next return.'],
  queued: ['揮拍已準備好。保持站位，輔助會在球靠近時完成擊球。', 'Shot prepared. Stay in position; the assist will time your contact.'],
  loss: ['下一球先把站位移到來球前方，輕一點回擊也能延長回合。', 'Get into position for the next ball. A lighter shot can keep the rally going.'],
  top: ['上旋會讓球更快下墜，彈起後繼續往前衝，適合主動進攻。', 'Topspin pulls the ball down and kicks it forward after the bounce.'],
  back: ['下旋在球桌上彈起後會減速。用落點變化打亂對手節奏。', 'Backspin slows the ball after the bounce. Mix your placement to change the rhythm.'],
  flat: ['平擊的球路比較直接。先把球穩穩打進對手半場。', 'A flat shot travels directly. Start with a steady return onto the other half.'],
};
const reasons = {
  net: ['掛網', 'Into the net'], short: ['未過網', 'Short return'], serve: ['發球失誤', 'Service fault'],
  double: ['兩次彈跳', 'Double bounce'], missed: ['未接到球', 'Missed return'], out: ['出界', 'Out'],
};
function t(zh, en) { return language === 'zh' ? zh : en; }
function coach(key) { lastCoach = key; $('coachText').textContent = coaches[key][language === 'zh' ? 0 : 1]; }
function call(text, duration = 1.2) { $('callout').textContent = text; $('callout').classList.add('show'); callUntil = renderTime + duration; }
function unlockAudio() {
  if (!audio) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (Context) audio = new Context();
  }
  if (audio?.state === 'suspended') audio.resume().catch(() => {});
}
function playSound(kind, side = 1) {
  if (!sound || !audio || audio.state !== 'running') return;
  const osc = audio.createOscillator(), filter = audio.createBiquadFilter(), gain = audio.createGain(), pan = audio.createStereoPanner();
  const now = audio.currentTime;
  osc.type = kind === 'bounce' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(kind === 'bounce' ? 460 : kind === 'point' ? 780 : 1080, now);
  osc.frequency.exponentialRampToValueAtTime(kind === 'bounce' ? 150 : kind === 'point' ? 420 : 270, now + 0.045);
  filter.type = 'lowpass'; filter.frequency.value = 2800;
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(kind === 'point' ? 0.075 : 0.19, now + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'point' ? 0.23 : 0.075));
  pan.pan.value = side * 0.28; osc.connect(filter).connect(gain).connect(pan).connect(audio.destination);
  osc.start(now); osc.stop(now + 0.25); osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect(); };
}
const match = new Match({ onEvent(event) {
  view?.event(event, renderTime);
  if (event.type === 'ready') { coach(event.server === 1 ? 'ready' : 'receive'); call(event.server === 1 ? t('你的發球', 'Your serve') : t('阿林發球', 'Lin to serve')); }
  if (event.type === 'serve') playSound('hit', event.side);
  if (event.type === 'bounce') playSound('bounce', event.z >= 0 ? 1 : -1);
  if (event.type === 'hit') {
    playSound('hit', event.side);
    if (event.side === 1) {
      coach(event.quality > 0.65 ? 'good' : 'timing');
      call(event.quality > 0.8 ? t('漂亮回擊', 'Sweet contact') : t('回擊', 'Return'), 0.55);
    }
  }
  if (event.type === 'queued') { coach('queued'); call(t('準備回擊', 'Shot prepared'), 0.6); }
  if (event.type === 'miss') { coach(event.reason); call(event.reason === 'reach' ? t('移動到球前方', 'Move into reach') : t('等球靠近再揮拍', 'Wait for the ball'), 0.7); }
  if (event.type === 'let') call(t('擦網，重新發球', 'Let — serve again'), 1.2);
  if (event.type === 'point' || event.type === 'over') {
    playSound('point', event.winner);
    const reason = reasons[event.reason][language === 'zh' ? 0 : 1];
    call(`${event.winner === 1 ? t('你得分', 'Your point') : t('阿林得分', 'Lin’s point')} · ${reason}`, 1.5);
    coach(event.winner === 1 ? 'good' : 'loss');
    if (event.type === 'over') showResult();
  }
  updateHud();
} });
function updateHud() {
  $('yourScore').textContent = String(match.score[0]).padStart(2, '0');
  $('aiScore').textContent = String(match.score[1]).padStart(2, '0');
  $('yourServe').classList.toggle('active', match.server === 1);
  $('aiServe').classList.toggle('active', match.server === -1);
  $('rallyCount').textContent = match.shots;
  $('bestRally').textContent = match.best;
  $('speed').textContent = match.lastSpeed ? Math.round(match.lastSpeed) : '—';
  $('strokeLabel').textContent = match.phase === 'ready' && match.server === 1 ? t('按一下發球', 'TAP TO SERVE') : t('蓄力／揮拍', 'HOLD / SWING');
  $('stroke').disabled = !started || paused || match.phase === 'over' || match.phase === 'point';
}
function start() {
  unlockAudio(); started = true; paused = false; chargeAt = null; targetX = 0;
  $('startPanel').hidden = true; $('resultPanel').hidden = true; $('pausePanel').hidden = true;
  $('difficulty').disabled = true; $('pause').textContent = t('暫停', 'Pause');
  match.start($('difficulty').value); updateHud(); canvas.focus({ preventScroll: true });
}
function showResult() {
  $('resultPanel').hidden = false;
  $('difficulty').disabled = false;
  $('resultTitle').textContent = match.score[0] > match.score[1] ? t('這局是你的。', 'Your game.') : t('下一局再來。', 'One more rally.');
  $('resultText').textContent = t(`${match.score[0]} : ${match.score[1]} · 最長 ${match.best} 次連續擊球`, `${match.score[0]} : ${match.score[1]} · Best rally: ${match.best} shots`);
}
function pause(force) {
  if (!started || match.phase === 'over') return;
  paused = force ?? !paused; chargeAt = null; keys.clear();
  $('pausePanel').hidden = !paused; $('pause').textContent = paused ? t('繼續', 'Resume') : t('暫停', 'Pause');
  $('stroke').classList.remove('charging'); updateHud();
}
function setSpin(value) {
  spin = value;
  document.querySelectorAll('[data-spin]').forEach(btn => { const selected = Number(btn.dataset.spin) === spin; btn.classList.toggle('selected', selected); btn.setAttribute('aria-pressed', String(selected)); });
  coach(spin > 0 ? 'top' : spin < 0 ? 'back' : 'flat');
}
function setAim(value) {
  aim = clamp(value, -1, 1);
  document.querySelectorAll('[data-aim]').forEach(btn => { const selected = Number(btn.dataset.aim) === aim; btn.classList.toggle('selected', selected); btn.setAttribute('aria-pressed', String(selected)); });
}
function beginCharge() {
  if (!started || paused || ['point', 'over'].includes(match.phase)) return;
  unlockAudio(); chargeAt = performance.now(); $('stroke').classList.add('charging');
}
function releaseCharge() {
  if (chargeAt === null) return;
  const duration = (performance.now() - chargeAt) / 1000;
  const power = duration < 0.12 ? 0.5 : clamp(0.22 + duration * 0.82, 0.22, 1);
  $('powerLabel').textContent = `${Math.round(power * 100)}%`; $('powerBar').style.width = `${power * 100}%`;
  chargeAt = null; $('stroke').classList.remove('charging');
  if (!paused) match.strike({ aim, power, spin, assist: $('assist').checked });
}
$('start').addEventListener('click', start);
$('again').addEventListener('click', start);
$('reset').addEventListener('click', () => {
  started = false; paused = false; chargeAt = null; keys.clear(); targetX = 0; match.reset();
  $('startPanel').hidden = false; $('resultPanel').hidden = true; $('pausePanel').hidden = true;
  $('difficulty').disabled = false; $('pause').textContent = t('暫停', 'Pause');
  $('stroke').classList.remove('charging'); $('powerLabel').textContent = '50%'; $('powerBar').style.width = '50%';
  $('callout').classList.remove('show'); coach('welcome'); updateHud();
});
$('pause').addEventListener('click', () => pause()); $('resume').addEventListener('click', () => pause(false));
$('sound').addEventListener('click', () => { sound = !sound; if (sound) unlockAudio(); $('sound').setAttribute('aria-pressed', String(sound)); $('sound').textContent = sound ? t('音效開', 'Sound on') : t('音效關', 'Sound off'); });
$('language').addEventListener('click', () => {
  language = language === 'zh' ? 'en' : 'zh';
  document.documentElement.lang = language === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-en]').forEach(el => { if (language === 'en') el.textContent = el.dataset.en; else el.innerHTML = zhText.get(el); });
  $('language').textContent = language === 'zh' ? 'EN' : '中文';
  $('sound').textContent = sound ? t('音效開', 'Sound on') : t('音效關', 'Sound off');
  $('pause').textContent = paused ? t('繼續', 'Resume') : t('暫停', 'Pause');
  coach(lastCoach); if (match.phase === 'over') showResult(); updateHud();
});
document.querySelectorAll('[data-spin]').forEach(btn => btn.addEventListener('click', () => setSpin(Number(btn.dataset.spin))));
document.querySelectorAll('[data-aim]').forEach(btn => btn.addEventListener('click', () => setAim(Number(btn.dataset.aim))));
canvas.addEventListener('pointermove', event => { if (!paused && view) targetX = view.moveTarget(event.clientX, event.clientY); });
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); canvas.focus({ preventScroll: true });
  canvas.setPointerCapture(event.pointerId);
  if (view) targetX = view.moveTarget(event.clientX, event.clientY);
  beginCharge();
});
canvas.addEventListener('pointerup', releaseCharge);
canvas.addEventListener('pointercancel', () => { chargeAt = null; $('stroke').classList.remove('charging'); });
$('stroke').addEventListener('pointerdown', event => { event.preventDefault(); $('stroke').setPointerCapture(event.pointerId); beginCharge(); });
$('stroke').addEventListener('pointerup', releaseCharge);
$('stroke').addEventListener('pointercancel', () => { chargeAt = null; $('stroke').classList.remove('charging'); });
$('stroke').addEventListener('click', event => { if (event.detail === 0 && started && !paused) match.strike({ aim, power: 0.5, spin, assist: $('assist').checked }); });
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
  if (!started) return;
  const key = event.key.toLowerCase();
  if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'p', 'escape', '1', '2', '3'].includes(key)) event.preventDefault();
  if (event.repeat) return;
  if (key === 'p' || key === 'escape') { pause(); return; }
  if (paused) return;
  keys.add(key);
  if (key === ' ') beginCharge();
  if (key === '1') setSpin(1); if (key === '2') setSpin(0); if (key === '3') setSpin(-1);
  if (key === 'arrowleft') setAim(aim - 1); if (key === 'arrowright') setAim(aim + 1);
});
window.addEventListener('keyup', event => { const key = event.key.toLowerCase(); keys.delete(key); if (key === ' ') releaseCharge(); });
window.addEventListener('blur', () => pause(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
function contextLost() { pause(true); $('loading').hidden = false; $('loading').textContent = t('畫面暫時中斷。重新整理頁面即可回到球館。', 'The court view was interrupted. Reload this page to reopen the club.'); }
try { view = createScene(canvas, $('court'), contextLost); $('loading').hidden = true; } catch (error) {
  console.error(error); $('loading').textContent = t('球館無法開啟。請使用支援 WebGL 的瀏覽器，並開啟硬體加速後重新整理。', 'Could not open the club. Use a browser with WebGL and hardware acceleration, then reload.');
}
coach('welcome'); updateHud();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - previous) / 1000, 0.04); previous = now;
  if (!paused) {
    renderTime += dt;
    if (keys.has('a')) targetX -= dt * 2.1;
    if (keys.has('d')) targetX += dt * 2.1;
    targetX = clamp(targetX, -1.1, 1.1);
    match.step(dt, targetX);
  }
  if (chargeAt !== null) {
    const power = clamp(0.22 + (now - chargeAt) / 1000 * 0.82, 0.22, 1);
    $('powerLabel').textContent = `${Math.round(power * 100)}%`; $('powerBar').style.width = `${power * 100}%`;
  }
  const b = match.ball;
  const incoming = match.phase === 'rally' && b?.hitter === -1;
  $('timingMarker').style.left = `${incoming ? clamp((b.z + 1.37) / 3.25 * 100, 0, 100) : 0}%`;
  $('timingLabel').textContent = paused ? t('比賽暫停', 'MATCH PAUSED') : incoming ?
    (match.canHit(1) ? t('接球窗口 · 準備揮拍', 'IN REACH / SWING') : t('觀察來球 · 移動站位', 'WATCH / MOVE')) :
    match.phase === 'ready' ? (match.server === 1 ? t('準備好了就發球', 'READY WHEN YOU ARE') : t('準備接發球', 'READY TO RECEIVE')) : t('回到中間 · 準備下一球', 'RECOVER TO THE MIDDLE');
  if (renderTime > callUntil) $('callout').classList.remove('show');
  view?.render(match, renderTime, paused ? 0 : dt, aim, paused);
}
requestAnimationFrame(frame);
