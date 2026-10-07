import { SwipeMatch, clamp } from './swipe-match.mjs?v=9';
import { createSwipeArena } from './swipe-renderer.js?v=9';

const $ = id => document.getElementById(id), canvas = $('game'), pad = $('controlPad');
let language = 'zh', started = false, paused = false, ended = false, mode = 'practice', sound = false;
let previous = performance.now(), view, audio, pointer = null, callUntil = 0, streak = 0, best = 0, sessionReturns = 0, lastCoach = 'welcome';
let target = { x: 0, z: 1.18 }, lastPlayerShot = null;
const keys = new Set(), eventLog = [], originals = new Map();
document.querySelectorAll('[data-en]').forEach(el => originals.set(el, el.innerHTML));
const t = (zh, en) => language === 'zh' ? zh : en;
const messages = {
  welcome: ['把球拍移到來球旁，靠近時向前滑過球。', 'Move beside the incoming ball, then swipe forward through it.'],
  hit: ['回球了！趁球飛走，把球拍移回下方準備下一板。', 'Connected! Move the paddle back while the ball travels away.'],
  change: ['橫滑打出變線。下一板試著打向對手另一側。', 'Your sideways swipe changed the lane. Try the other side next.'],
  power: ['向前推拍加力。看對手是否來得及追上這一球。', 'Forward motion added power. Watch whether the opponent can reach it.'],
  miss: ['下一球再來。球拍要滑動著撞上球，停著不會自動出拍。', 'Another ball is coming. Swipe into it; a stationary paddle will not swing for you.'],
  point: ['打出空檔得分。變線和力道都來自你的滑動。', 'You found the opening. Your movement made the shot.'],
  out: ['回球偏出邊界。下一板把橫滑幅度收小一些。', 'Your shot went wide. Try a smaller sideways swipe next time.'],
  opponentOut: ['對手回球出界，這一分是你的。', 'The opponent went wide. Your point.'],
};
function readBest() { try { const value = Number(localStorage.getItem('rally:swipe-best:v1')); return Number.isSafeInteger(value) && value >= 0 ? value : 0; } catch { return 0; } }
function saveBest() { try { localStorage.setItem('rally:swipe-best:v1', String(Math.max(best, readBest()))); } catch {} }
best = readBest();
function coach(key) { lastCoach = key; $('coachText').textContent = messages[key]?.[language === 'zh' ? 0 : 1] ?? messages.welcome[language === 'zh' ? 0 : 1]; }
function call(zh, en, duration = .8) { $('callout').textContent = t(zh, en); $('callout').classList.add('show'); callUntil = performance.now() + duration * 1000; }
function unlockAudio() { if (!sound) return; if (!audio) { const Context = window.AudioContext || window.webkitAudioContext; if (Context) audio = new Context(); } if (audio?.state === 'suspended') audio.resume().catch(() => {}); }
function tone(kind) {
  if (!sound || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(), gain = audio.createGain(), time = audio.currentTime;
  oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(kind === 'point' ? 740 : 980, time); oscillator.frequency.exponentialRampToValueAtTime(180, time + .055);
  gain.gain.setValueAtTime(.028, time); gain.gain.exponentialRampToValueAtTime(.001, time + .08); oscillator.connect(gain).connect(audio.destination); oscillator.start(time); oscillator.stop(time + .09); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
const match = new SwipeMatch({ onEvent(event) {
  const record = { ...event, at: match.wallClock }; eventLog.push(record); if (eventLog.length > 300) eventLog.shift(); view?.event(record);
  if (event.type === 'hit') {
    tone('hit');
    if (event.side === 1) { lastPlayerShot = { ...match.lastShot }; streak++; sessionReturns++; best = Math.max(best, streak); coach(Math.abs(event.vx ?? 0) > 1.3 ? 'change' : (event.power ?? 0) > .65 ? 'power' : 'hit'); }
  }
  if (event.type === 'point') { tone('point'); saveBest(); streak = 0; const won = event.winner === 1, out = event.reason === 'out'; coach(out ? won ? 'opponentOut' : 'out' : won ? 'point' : 'miss'); call(out ? won ? '對手出界' : '回球出界' : won ? '對手未接到' : '未接到球', out ? won ? 'OPPONENT WENT WIDE' : 'YOUR SHOT WENT WIDE' : won ? 'OPPONENT MISSED' : 'MISSED BALL', 1); }
  if (event.type === 'over') finish();
} });
view = createSwipeArena(canvas);
function shotText() { const shot = lastPlayerShot; if (!shot) return '—'; const direction = Math.abs(shot.angle ?? 0) < .12 ? t('直線', 'STRAIGHT') : (shot.angle ?? 0) < 0 ? t('左變線', 'LEFT LANE') : t('右變線', 'RIGHT LANE'); return `${direction} · ${Math.round((shot.power ?? 0) * 100)}%`; }
function hud() {
  $('yourScore').textContent = match.score[0]; $('aiScore').textContent = match.score[1]; $('rallyCount').textContent = streak; $('bestRally').textContent = best;
  $('modeLabel').textContent = !started ? t('先練一球', 'TRY A RALLY') : mode === 'match' ? t('先得 5 分', 'FIRST TO 5') : t('自由對拉', 'RALLY PRACTICE');
  $('pause').disabled = !started || ended; $('menu').disabled = !started; $('pause').textContent = paused ? t('繼續', 'Resume') : t('暫停', 'Pause');
  const slow = started && !paused && !ended && match.timeScale < .95;
  $('focusBadge').hidden = !slow; $('focusBar').style.width = `${clamp(match.slowRemaining ?? 0, 0, 1) * 100}%`;
  $('shotInfo').textContent = shotText(); $('shotTag').textContent = shotText(); $('shotTag').hidden = !started || !lastPlayerShot; pad.classList.toggle('inactive', !started || paused || ended);
}
function clearInput() {
  const held = pointer; pointer = null; keys.clear();
  if (held?.element.hasPointerCapture?.(held.id)) held.element.releasePointerCapture(held.id);
  pad.classList.remove('active'); match.cancelInput(); target = { x: match.player.x, z: match.player.z };
}
function start(value = mode) {
  clearInput(); mode = value; started = true; paused = false; ended = false; streak = 0; sessionReturns = 0; lastPlayerShot = null; eventLog.length = 0;
  match.start({ mode, level: $('difficulty').value }); target = { x: match.player.x, z: match.player.z }; view.reset(); coach('welcome');
  $('startPanel').hidden = true; $('resultPanel').hidden = true; $('pausePanel').hidden = true; $('shotTag').hidden = true; $('callout').classList.remove('show'); callUntil = 0;
  unlockAudio(); hud(); canvas.focus({ preventScroll: true }); previous = performance.now();
}
function menu() { saveBest(); clearInput(); started = false; paused = false; ended = false; lastPlayerShot = null; match.reset(); view.reset(); $('startPanel').hidden = false; $('pausePanel').hidden = true; $('resultPanel').hidden = true; $('callout').classList.remove('show'); coach('welcome'); hud(); }
function finish() { ended = true; clearInput(); saveBest(); $('pausePanel').hidden = true; $('resultPanel').hidden = false; $('resultTitle').textContent = match.score[0] > match.score[1] ? t('這局，打出來了。', 'Your shots. Your game.') : t('換個球路，再來。', 'A new angle. Another game.'); $('resultText').textContent = t(`${match.score[0]} : ${match.score[1]} · 你親手回了 ${sessionReturns} 球。試著先拉開對手，再突然變線。`, `${match.score[0]} : ${match.score[1]} · ${sessionReturns} manual returns. Move the opponent, then change lanes.`); hud(); }
function pause(force) { if (!started || ended) return; paused = force ?? !paused; clearInput(); $('pausePanel').hidden = !paused; previous = performance.now(); hud(); }
function setTarget(x, z) { target = { x: clamp(x, -1.02, 1.02), z: clamp(z, .62, 1.78) }; match.setPaddleTarget(target.x, target.z); }
function active() { return started && !paused && !ended; }
function fromCanvas(event) { if (!active()) return; const world = view.screenToWorld(event.clientX, event.clientY); setTarget(world.x, world.z); }
function fromPad(event) {
  if (!active()) return; const rect = pad.getBoundingClientRect();
  const x = clamp((event.clientX - rect.left) / rect.width, 0, 1), y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  setTarget((x - .5) * 2.04, .62 + y * 1.16); $('padMark').style.left = `${x * 100}%`; $('padMark').style.top = `${y * 100}%`;
}
function capture(event, element, mapper) { if (!active() || event.button !== 0 || pointer) return; event.preventDefault(); canvas.focus({ preventScroll: true }); pointer = { id: event.pointerId, element }; element.setPointerCapture(event.pointerId); if (element === pad) pad.classList.add('active'); mapper(event); }
function release(event) { if (pointer?.id !== event.pointerId) return; const element = pointer.element; pointer = null; if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId); pad.classList.remove('active'); }
canvas.addEventListener('pointermove', event => { if (event.pointerType === 'mouse' || pointer?.id === event.pointerId) fromCanvas(event); });
canvas.addEventListener('pointerdown', event => capture(event, canvas, fromCanvas));
pad.addEventListener('pointerdown', event => capture(event, pad, fromPad)); pad.addEventListener('pointermove', event => { if (pointer?.id === event.pointerId && pointer.element === pad) fromPad(event); });
for (const element of [canvas, pad]) { element.addEventListener('pointerup', release); element.addEventListener('pointercancel', event => { if (pointer?.id === event.pointerId) clearInput(); }); element.addEventListener('lostpointercapture', event => { if (pointer?.id === event.pointerId) clearInput(); }); }
$('startPractice').addEventListener('click', () => start('practice')); $('startMatch').addEventListener('click', () => start('match')); $('again').addEventListener('click', () => start()); $('resultMenu').addEventListener('click', menu); $('menu').addEventListener('click', menu); $('pause').addEventListener('click', () => pause()); $('resume').addEventListener('click', () => pause(false));
$('sound').addEventListener('click', () => { sound = !sound; unlockAudio(); $('sound').textContent = sound ? t('音效開', 'Sound on') : t('靜音', 'Sound off'); $('sound').setAttribute('aria-pressed', String(sound)); });
$('language').addEventListener('click', () => { language = language === 'zh' ? 'en' : 'zh'; document.documentElement.lang = language === 'zh' ? 'zh-Hant' : 'en'; document.querySelectorAll('[data-en]').forEach(el => { el.innerHTML = language === 'en' ? el.dataset.en : originals.get(el); }); $('language').textContent = language === 'zh' ? 'EN' : '中文'; $('sound').textContent = sound ? t('音效開', 'Sound on') : t('靜音', 'Sound off'); canvas.setAttribute('aria-label', t('移動滑鼠控拍，滑向來球；手機在下方滑拍區拖動。', 'Move the mouse paddle into the ball; touch users swipe in the pad below.')); pad.setAttribute('aria-label', t('滑拍區：左右滑改變方向，向上推拍加力', 'Swipe pad: sideways for direction, forward for power')); coach(lastCoach); if (ended) finish(); hud(); });
window.addEventListener('keydown', event => {
  if (!started || ended || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  const key = event.key.toLowerCase(); if (key === 'p' || key === 'escape') { event.preventDefault(); if (!event.repeat) pause(); return; } if (paused) return;
  if (['arrowleft','arrowright','arrowup','arrowdown','a','d','w','s'].includes(key)) { event.preventDefault(); keys.add(key); }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase())); window.addEventListener('blur', () => pause(true)); document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); }); window.addEventListener('resize', () => { clearInput(); view.resize(); });
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min((now - previous) / 1000, .1); previous = now;
  if (active()) { if (keys.size) { const dx = Number(keys.has('arrowright') || keys.has('d')) - Number(keys.has('arrowleft') || keys.has('a')), dz = Number(keys.has('arrowdown') || keys.has('s')) - Number(keys.has('arrowup') || keys.has('w')); setTarget(target.x + dx * dt * 2.3, target.z + dz * dt * 2.3); } match.step(dt); }
  if (now > callUntil) $('callout').classList.remove('show'); hud(); view.render(match, { language, paused: paused || ended, started, touchActive: pointer?.element === pad });
}
coach('welcome'); hud(); requestAnimationFrame(frame);
window.rallySwipe = Object.freeze({ snapshot: () => ({ ...match.snapshot(), started, paused, ended, mode, sound, best, streak, sessionReturns, target: { ...target }, pointerActive: Boolean(pointer) }), events: () => eventLog.map(event => ({ ...event })), project: (x, z) => { const point = view.project(x, z), rect = canvas.getBoundingClientRect(); return { x: rect.left + point.x, y: rect.top + point.y }; }, controlPoint: (x, z) => { const rect = pad.getBoundingClientRect(); return { x: rect.left + (x / 2.04 + .5) * rect.width, y: rect.top + (z - .62) / 1.16 * rect.height }; } });
