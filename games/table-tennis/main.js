import { Match, clamp } from './physics.mjs?v=8';
import { createArena } from './arena-renderer.js?v=8';
import { MISSIONS, TacticalRun, missionById, launchTrainingFeed, readBest, saveBest } from './tactics.mjs?v=8';

const $ = id => document.getElementById(id), canvas = $('game');
let language = 'zh', mode = 'practice', aim = 0, spin = 1, depth = 'long';
let started = false, paused = false, ended = false, demonstrating = false, sound = false;
let previous = performance.now(), idleClock = 0, touch = null, queuedShot = null, feedNeeded = false;
let run = null, combo = 0, audio = null, callUntil = 0, lastCoach = 'welcome', resultWin = null, view;
let manualBest = 0, manualShots = 0, humanInRally = false, manualSwing = null;
const eventLog = [], originals = new Map();
document.querySelectorAll('[data-en]').forEach(el => originals.set(el, el.innerHTML));
const t = (zh, en) => language === 'zh' ? zh : en;
const playerNames = { lin: ['林昀儒', 'LIN YUN-JU'], harimoto: ['張本智和', 'HARIMOTO'] };
const coaches = {
  welcome: ['自動步法幫你站到位。選落點，看薄荷綠提示，再按一次揮拍。', 'Footwork is automatic. Choose a target, watch the mint cue, then press once.'],
  good: ['漂亮回球。趁球飛向對手，選好下一板落點。', 'Clean return. Pick your next target while the ball travels away.'],
  early: ['已預備出拍，綠燈亮起就會揮拍。', 'Stroke prepared — it will start when the timing window opens.'],
  wait: ['等對手回球，再開始揮拍。', 'Wait for the opponent’s return before swinging.'],
  late: ['這次太晚。下一球在綠燈亮起時按一次。', 'A little late. Press once as the mint cue lights up on the next ball.'],
  fault: ['看球落桌，再跟著綠燈出拍。下一球再來。', 'Watch the bounce, then follow the mint cue. Another ball is coming.'],
  top: ['上旋向前、向上帶球；適合持續對拉和起板。', 'Topspin lifts the ball forward and up — useful for rallies and openings.'],
  back: ['下旋適合控制低短球。搭配短落點和較低力道。', 'Backspin controls low, short balls. Try a short target with less power.'],
  flat: ['平擊球路直接。先用中等力道保持穩定。', 'Flat shots travel directly. Start with moderate power.'],
  take: ['已接手。等綠燈亮起，按空白鍵或揮拍鈕。', 'You are in control. Follow the mint cue and press Space or Swing.'],
};
const missionMessages = {
  start: ['跟著提示完成任務；三次漏球或時間到即結束。', 'Complete the task before time runs out; three lost points end the attempt.'],
  good: ['落點有效，繼續。', 'That landing counts. Keep going.'], same: ['再打一板同側。', 'One more to the same side.'], switch: ['現在變線，打向另一側。', 'Switch to the opposite side now.'],
  wide: ['落點太靠中間，需離中線至少 22 公分。', 'Too central — land at least 22 cm from the centre line.'],
  backspin: ['這板沒有下旋。選下旋，再試一次。', 'That shot was not backspin. Select backspin and try again.'],
  short: ['未符合低短區。選短球，降低力道，看看實際落點。', 'Outside the low-short target. Choose Short, ease the power and watch the landing.'],
  topspin: ['要用上旋起板，讓回球合法落桌。', 'Use topspin against the feed and land the return legally.'], fault: ['失去這一分，還能再試。', 'Point lost. You can still try again.'],
};
function storage() { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {} }; } }
function profiles() { const near = $('playerProfile').value; return [near, near === 'lin' ? 'harimoto' : 'lin']; }
function coach(key) { lastCoach = key; $('coachText').textContent = coaches[key]?.[language === 'zh' ? 0 : 1] ?? coaches.welcome[language === 'zh' ? 0 : 1]; }
function call(text, duration = .85) { $('callout').textContent = text; $('callout').classList.add('show'); callUntil = performance.now() / 1000 + duration; }
function unlockAudio() {
  if (!sound) return;
  if (!audio) { const Context = window.AudioContext || window.webkitAudioContext; if (Context) audio = new Context(); }
  if (audio?.state === 'suspended') audio.resume().catch(() => {});
}
function soundEffect(kind) {
  if (!sound || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(), gain = audio.createGain(), time = audio.currentTime;
  oscillator.type = kind === 'bounce' ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(kind === 'bounce' ? 420 : kind === 'point' ? 730 : 1020, time);
  oscillator.frequency.exponentialRampToValueAtTime(170, time + .05); gain.gain.setValueAtTime(.035, time); gain.gain.exponentialRampToValueAtTime(.001, time + .08);
  oscillator.connect(gain).connect(audio.destination); oscillator.start(time); oscillator.stop(time + .09); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
const match = new Match({ onEvent(event) {
  const record = { ...event, at: match.clock, automated: demonstrating };
  eventLog.push(record); if (eventLog.length > 400) eventLog.shift();
  if (event.type === 'swing' && event.side === 1) run?.captureSwing(event, match.ball, demonstrating);
  const counted = run?.event(event, match.ball, demonstrating);
  view?.event({ ...event, hitter: match.ball?.hitter }, match.clock);
  if (event.type === 'hit') {
    soundEffect('hit');
    const humanHit = event.side === 1 && !demonstrating && match.playerSwing === manualSwing;
    if (humanHit) manualSwing = null;
    if (humanHit || (event.side === -1 && humanInRally && !demonstrating)) { humanInRally = true; manualShots++; manualBest = Math.max(manualBest, manualShots); }
    if (humanHit) { combo++; coach('good'); if (combo % 3 === 0) call(`${combo} ${t('連擊', 'RETURN COMBO')}`); }
  }
  if (event.type === 'bounce') { soundEffect('bounce'); if (counted) call(missionMessages[run.message]?.[language === 'zh' ? 0 : 1] ?? t('漂亮落點', 'Clean landing')); }
  if (event.type === 'feed') call(run?.mission.id === 'lift' ? t('下旋來球 · 上旋起板', 'BACKSPIN FEED · LIFT WITH TOPSPIN') : t('教練送球', 'TRAINING FEED'));
  if (event.type === 'miss') { coach(event.reason === 'wait' ? 'wait' : 'fault'); queuedShot = null; }
  if (event.type === 'ready' && mode === 'challenge') feedNeeded = true;
  if (event.type === 'let') call(t('擦網重發', 'LET · SERVE AGAIN'));
  if (event.type === 'point' || event.type === 'over') {
    soundEffect('point'); queuedShot = null; combo = 0; manualShots = 0; humanInRally = false; manualSwing = null;
    const reasons = { net: ['掛網', 'Into the net'], short: ['未過網', 'Too short'], serve: ['發球失誤', 'Service fault'], double: ['兩次彈跳', 'Double bounce'], missed: ['未接到球', 'Missed ball'], out: ['出界', 'Out'] };
    const reason = reasons[event.reason]?.[language === 'zh' ? 0 : 1] ?? event.reason;
    call(`${event.winner === 1 ? t('得分', 'YOUR POINT') : t('這分失誤', 'POINT LOST')} · ${reason}`, 1.1); coach(event.winner === 1 ? 'good' : 'fault');
    if (event.type === 'over') finish(match.score[0] > match.score[1]);
  }
  if (run?.status === 'success') finish(true);
  else if (run?.status === 'failed') finish(false);
  updateHud();
} });
function missionPicker() {
  const selected = $('missionSelect').value || 'rhythm';
  $('missionSelect').replaceChildren(...MISSIONS.map(m => { const option = document.createElement('option'); option.value = m.id; option.textContent = `${m.number} / ${m.title[language === 'zh' ? 0 : 1]}`; return option; }));
  $('missionSelect').value = selected; const mission = missionById(selected), best = readBest(storage(), `mission:${selected}`);
  $('missionDescription').textContent = mission.description[language === 'zh' ? 0 : 1];
  $('missionBest').textContent = best ? t(`本機最佳：${best.toFixed(1)} 秒`, `Local best: ${best.toFixed(1)} s`) : t('完成關卡，留下第一筆紀錄。', 'Complete the task to set your first record.');
}
function modeLabel() { return mode === 'practice' ? t('對拉練習', 'Rally practice') : mode === 'match' ? t('11 分對戰', '11-point match') : t('戰術挑戰', 'Tactical challenge'); }
function updateHud() {
  const [near, far] = profiles(), index = language === 'zh' ? 0 : 1;
  $('yourName').textContent = `${playerNames[near][index]} ${t('／你', '/ YOU')}`; $('opponentName').textContent = playerNames[far][index];
  $('yourScore').textContent = String(match.score[0]).padStart(2, '0'); $('aiScore').textContent = String(match.score[1]).padStart(2, '0');
  $('yourServe').classList.toggle('active', match.server === 1); $('aiServe').classList.toggle('active', match.server === -1);
  $('rallyCount').textContent = match.shots; $('bestRally').textContent = Math.max(manualBest, readBest(storage(), 'rally') ?? 0);
  $('speed').textContent = match.lastSpeed ? `${Math.round(match.lastSpeed)} km/h` : t('選落點再出拍', 'AIM THEN SWING');
  $('format').textContent = mode === 'match' ? t('11 分・領先兩分', 'FIRST TO 11 · WIN BY TWO') : mode === 'challenge' ? t('戰術任務・實際球路判定', 'TACTICAL TASK · REAL BALL LANDINGS') : t('自由練習・自動續球', 'FREE PRACTICE · AUTO RESTART');
  $('sessionTitle').textContent = run ? run.mission.title[index] : modeLabel(); $('startLabel').textContent = mode === 'practice' ? t('開始練球', 'Start practising') : mode === 'match' ? t('開始對戰', 'Start the match') : t('挑戰開始', 'Start challenge');
  $('demoBadge').hidden = !demonstrating; $('challengeHud').hidden = !run; $('combo').hidden = combo < 2 || demonstrating;
  $('combo').textContent = `${combo} ${t('連擊', 'COMBO')}`;
  if (run) {
    const status = run.snapshot(); $('missionTitle').textContent = `${run.mission.number} / ${run.mission.title[index]}`; $('missionTarget').textContent = run.mission.target[index];
    $('missionProgress').textContent = `${status.progress} / ${status.goal}`; $('missionClock').textContent = `${Math.ceil(status.remaining)}s`; $('missionFaults').textContent = t(`失誤 ${status.faults}/3`, `FAULTS ${status.faults}/3`);
    $('missionBar').style.width = `${status.progress / status.goal * 100}%`; $('challengeHud').dataset.status = status.status;
    if (status.message !== 'good' && missionMessages[status.message]) $('coachText').textContent = missionMessages[status.message][index];
  }
  $('stroke').disabled = !started || paused || ended || (!demonstrating && (!match.inputReady || Boolean(queuedShot)));
  $('strokeLabel').textContent = demonstrating ? t('接手操作', 'TAKE CONTROL') : queuedShot ? t('已預備', 'PREPARED') : match.phase === 'ready' && !match.pendingServe ? t('發球', 'SERVE') : t('揮拍', 'SWING');
}
function selectMode(value) {
  mode = value; document.querySelectorAll('[data-mode]').forEach(button => { const selected = button.dataset.mode === mode; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  $('missionPicker').hidden = mode !== 'challenge'; $('demo').hidden = mode === 'challenge'; $('difficulty').disabled = mode === 'challenge'; missionPicker(); updateHud();
}
function setSpin(value, note = true) { spin = value; document.querySelectorAll('[data-spin]').forEach(button => { const selected = Number(button.dataset.spin) === spin; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }); if (note) coach(spin > 0 ? 'top' : spin < 0 ? 'back' : 'flat'); }
function setAim(value) { aim = clamp(value, -1, 1); document.querySelectorAll('[data-aim]').forEach(button => { const selected = Math.abs(Number(button.dataset.aim) - aim) < .16; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }); }
function setDepth(value) { depth = value; document.querySelectorAll('[data-depth]').forEach(button => { const selected = button.dataset.depth === depth; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }); }
function start(isDemo = false) {
  started = true; paused = false; ended = false; resultWin = null; demonstrating = isDemo; combo = 0; manualBest = 0; manualShots = 0; humanInRally = false; manualSwing = null; queuedShot = null; touch = null; eventLog.length = 0; feedNeeded = false;
  run = mode === 'challenge' ? new TacticalRun($('missionSelect').value) : null;
  setSpin(1, false); setAim(0); setDepth('long'); $('power').value = '55'; $('powerLabel').textContent = '55%';
  // Settings stay under the player's control; the mission gives a suggestion, not a free completion.
  coach('welcome'); view.reset(); unlockAudio(); const [playerProfile, opponentProfile] = profiles();
  match.start(run ? 'easy' : $('difficulty').value, { practice: mode !== 'match', playerProfile, opponentProfile, autoPlayer: isDemo });
  $('startPanel').hidden = true; $('playArea').hidden = false; $('resultPanel').hidden = true; $('pausePanel').hidden = true;
  $('pause').textContent = t('暫停', 'Pause'); if (run) { feedNeeded = true; call(run.mission.tip[language === 'zh' ? 0 : 1], 2.2); }
  updateHud(); canvas.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); previous = performance.now();
}
function menu() {
  if (started && !demonstrating && manualBest > 0) saveBest(storage(), 'rally', manualBest); started = false; paused = false; ended = false; demonstrating = false; queuedShot = null; run = null; touch = null; combo = 0;
  match.reset(); view.reset(); $('startPanel').hidden = false; $('playArea').hidden = true; $('pausePanel').hidden = true; $('resultPanel').hidden = true; missionPicker(); updateHud(); window.scrollTo({ top: 0, behavior: 'instant' });
}
function finish(won, refresh = false) {
  if (ended && !refresh) return; resultWin = won; ended = true; queuedShot = null; $('resultPanel').hidden = false; $('pausePanel').hidden = true;
  if (!demonstrating && manualBest > 0) saveBest(storage(), 'rally', manualBest);
  if (run) {
    const seconds = run.elapsed, stars = won ? run.faults === 0 && seconds <= run.mission.time * .65 ? 3 : run.faults <= 1 ? 2 : 1 : 0;
    const best = won ? saveBest(storage(), `mission:${run.mission.id}`, seconds, true) : readBest(storage(), `mission:${run.mission.id}`);
    $('resultEyebrow').textContent = won ? '★'.repeat(stars) + ' · CHALLENGE COMPLETE' : 'CHALLENGE / TRY AGAIN';
    $('resultTitle').textContent = won ? t('戰術，打出來了。', 'Tactic delivered.') : t('差一點，再試一次。', 'Reset. Read. Rally.');
    $('resultText').textContent = won ? t(`${run.progress} 次有效落桌・${seconds.toFixed(1)} 秒・失誤 ${run.faults} 次。本機最佳 ${best.toFixed(1)} 秒。`, `${run.progress} valid landings · ${seconds.toFixed(1)} s · ${run.faults} faults. Local best ${best.toFixed(1)} s.`) : t(`${run.message === 'time' ? '時間到' : '已失去三分'}。完成 ${run.progress}/${run.mission.goal}。${run.mission.tip[0]}`, `${run.message === 'time' ? 'Time expired' : 'Three points lost'}. ${run.progress}/${run.mission.goal} complete. ${run.mission.tip[1]}`);
  } else {
    $('resultEyebrow').textContent = 'MATCH COMPLETE'; $('resultTitle').textContent = won ? t('這局是你的。', 'Your game.') : t('下一局再來。', 'The next game awaits.');
    $('resultText').textContent = t(`${match.score[0]} : ${match.score[1]}・手動最長 ${manualBest} 板連續對拉`, `${match.score[0]} : ${match.score[1]} · Best manual rally: ${manualBest} shots`);
  }
  updateHud();
}
function pause(force) { if (!started || ended) return; paused = force ?? !paused; queuedShot = null; touch = null; $('pausePanel').hidden = !paused; $('pause').textContent = paused ? t('繼續', 'Resume') : t('暫停', 'Pause'); updateHud(); }
function returnToCourt(event) { if (started && event.detail > 0) canvas.focus({ preventScroll: true }); }
function shotControls() { return { aim, spin, power: Number($('power').value) / 100, landingDepth: depth === 'short' ? .55 : 1.04, assist: true }; }
function performSwing(shot) { queuedShot = null; const rallyInput = match.phase === 'rally'; if (match.strike(shot) && rallyInput) manualSwing = match.playerSwing; updateHud(); }
function swing() {
  if (!started || paused || ended) return; unlockAudio();
  if (demonstrating) { demonstrating = false; match.autoPlayer = false; manualShots = 0; humanInRally = false; manualSwing = null; coach('take'); call(t('接手成功', 'YOU ARE IN CONTROL')); updateHud(); return; }
  if (!match.inputReady || queuedShot) return;
  if (match.phase === 'ready') { performSwing(shotControls()); return; }
  const contact = match.contact(1);
  if (!contact?.legal) { coach('wait'); call(t('等待來球', 'WAIT FOR THE BALL'), .55); return; }
  if (contact.time > .33 && contact.time <= .60) { queuedShot = { expires: match.clock + .55 }; coach('early'); call(t('預備出拍', 'STROKE PREPARED'), .45); updateHud(); return; }
  if (contact.time > .60) { coach('wait'); call(t('先看球，還沒到', 'WATCH — NOT YET'), .6); return; }
  if (contact.time < .12) { coach('late'); call(t('太晚了', 'TOO LATE'), .65); return; }
  performSwing(shotControls());
}
function pointAt(event) { if (started && !paused && !ended) setAim(view.aimTarget(event.clientX, depth)); }
$('quickStart').addEventListener('click', () => { selectMode('practice'); start(); });
$('start').addEventListener('click', () => start()); $('again').addEventListener('click', () => start()); $('demo').addEventListener('click', () => { selectMode('practice'); start(true); });
$('reset').addEventListener('click', menu); $('resultMenu').addEventListener('click', menu); $('pause').addEventListener('click', () => pause()); $('resume').addEventListener('click', () => pause(false));
$('missionSelect').addEventListener('change', missionPicker); $('playerProfile').addEventListener('change', updateHud);
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => selectMode(button.dataset.mode)));
document.querySelectorAll('[data-spin]').forEach(button => button.addEventListener('click', event => { setSpin(Number(button.dataset.spin)); returnToCourt(event); }));
document.querySelectorAll('[data-aim]').forEach(button => button.addEventListener('click', event => { setAim(Number(button.dataset.aim)); returnToCourt(event); }));
document.querySelectorAll('[data-depth]').forEach(button => button.addEventListener('click', event => { setDepth(button.dataset.depth); returnToCourt(event); }));
$('power').addEventListener('input', () => { $('powerLabel').textContent = `${$('power').value}%`; });
$('power').addEventListener('pointerup', () => { if (started) canvas.focus({ preventScroll: true }); });
$('sound').addEventListener('click', () => { sound = !sound; unlockAudio(); $('sound').setAttribute('aria-pressed', String(sound)); $('sound').textContent = sound ? t('音效開', 'Sound on') : t('音效關', 'Sound off'); });
$('language').addEventListener('click', () => {
  language = language === 'zh' ? 'en' : 'zh'; document.documentElement.lang = language === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-en]').forEach(el => { el.innerHTML = language === 'en' ? el.dataset.en : originals.get(el); }); $('language').textContent = language === 'zh' ? 'EN' : '中文';
  $('sound').textContent = sound ? t('音效開', 'Sound on') : t('音效關', 'Sound off'); $('pause').textContent = paused ? t('繼續', 'Resume') : t('暫停', 'Pause'); missionPicker(); coach(lastCoach); updateHud(); if (ended) finish(resultWin, true);
});
canvas.addEventListener('pointermove', event => { if (event.pointerType === 'mouse') pointAt(event); else if (touch?.id === event.pointerId) { pointAt(event); if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 12) touch.dragged = true; } });
canvas.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); canvas.focus({ preventScroll: true }); if (event.pointerType === 'mouse') { pointAt(event); swing(); } else if (!touch) { touch = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false }; canvas.setPointerCapture(event.pointerId); pointAt(event); } });
canvas.addEventListener('pointerup', event => { if (touch?.id === event.pointerId) { const tap = !touch.dragged; touch = null; if (tap) swing(); } }); canvas.addEventListener('pointercancel', event => { if (touch?.id === event.pointerId) touch = null; });
$('stroke').addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); canvas.focus({ preventScroll: true }); swing(); });
$('stroke').addEventListener('click', event => { if (event.detail === 0) swing(); });
window.addEventListener('keydown', event => {
  if (!started || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase(); if (![' ', 'arrowleft', 'arrowright', '1', '2', '3', 'p', 'escape'].includes(key)) return;
  // A focused settings button must not receive both native activation and a global stroke.
  if (key === ' ' && event.target instanceof HTMLButtonElement && event.target !== $('stroke')) return;
  event.preventDefault(); if (event.repeat) return; if (key === 'p' || key === 'escape') { pause(); return; } if (paused || ended) return;
  if (key === ' ') swing(); if (key === 'arrowleft') setAim(aim - .5); if (key === 'arrowright') setAim(aim + .5); if (key === '1') setSpin(1); if (key === '2') setSpin(0); if (key === '3') setSpin(-1);
});
window.addEventListener('blur', () => pause(true)); document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
view = createArena(canvas); missionPicker(); coach('welcome'); selectMode('practice');
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min((now - previous) / 1000, .1); previous = now;
  if (started && !paused && !ended) {
    if (feedNeeded && run) { feedNeeded = false; launchTrainingFeed(match, run.mission.id, match.rallies); }
    for (let remaining = dt; remaining > .000001 && !ended; remaining -= 1 / 120) {
      const step = Math.min(remaining, 1 / 120), contact = match.contact(1);
      if (queuedShot && match.inputReady && contact?.legal && contact.time <= .30 && contact.time >= .12) performSwing(shotControls());
      else if (queuedShot && (match.clock >= queuedShot.expires || !contact?.legal)) { queuedShot = null; coach('wait'); }
      const previousBall = match.ball ? { ...match.ball } : null;
      // In the lift drill the coach continues to return underspin through the normal hit solver.
      if (run?.mission.id === 'lift' && match.opponentSwing && !match.opponentSwing.hit) Object.assign(match.opponentSwing.shot, { spin: -.8, power: .35, landingDepth: .95 });
      match.step(step, clamp(match.stance(1).bodyX ?? 0, -1.1, 1.1)); run?.observeBall(previousBall, match.ball); run?.tick(step);
      if (run?.status === 'failed') finish(false);
    }
  } else if (!started) idleClock += dt;
  const contact = match.contact(1), ready = started && !paused && !ended && match.timingReady && contact.time >= .12;
  $('court').classList.toggle('ready-to-swing', Boolean(ready)); $('stroke').dataset.ready = String(Boolean(ready));
  $('timingMarker').style.left = `${contact ? clamp((.7 - contact.time) / .7 * 100, 0, 100) : 0}%`;
  $('timingLabel').textContent = paused ? t('暫停中', 'PAUSED') : ended ? t('這一回合結束', 'SESSION COMPLETE') : demonstrating ? t('觀察球路 · 隨時接手', 'WATCH THE RALLY · TAKE CONTROL') : ready ? t('現在揮拍', 'SWING NOW') : queuedShot ? t('已預備 · 等待綠燈', 'PREPARED · WAIT FOR MINT') : match.playerSwing ? t('出拍 · 還原', 'STROKE · RECOVER') : contact ? t('看來球 · 抓節奏', 'READ THE BALL') : match.phase === 'ready' ? t('按一下發球', 'PRESS TO SERVE') : t('準備下一板', 'READY FOR THE NEXT BALL');
  $('timingHelp').textContent = ready ? t('點一下／空白鍵／揮拍鈕', 'CLICK / SPACE / SWING') : t('選好下一板落點', 'CHOOSE YOUR NEXT TARGET');
  if (now / 1000 > callUntil) $('callout').classList.remove('show');
  if (started) view.render(match, match.clock, { aim, depth, contact, ready, started, paused: paused || ended, demo: demonstrating, mission: run?.mission.id, language });
  updateHud();
}
requestAnimationFrame(frame);
// Read-only diagnostics for ball/timing acceptance checks; no gameplay bypasses.
window.rallyArena = Object.freeze({ snapshot: () => ({ mode, started, paused, ended, demonstrating, sound, controls: { aim, spin, depth, power: Number($('power').value) / 100 }, queued: Boolean(queuedShot), clock: match.clock, phase: match.phase, score: [...match.score], shots: match.shots, totalHits: match.totalHits, manualBest, manualShots, ball: match.ball ? { ...match.ball, lastBounce: match.ball.lastBounce ? { ...match.ball.lastBounce } : undefined } : null, contact: match.contact(1), inputReady: match.inputReady, timingReady: match.timingReady, profiles: profiles(), mission: run?.snapshot() ?? null }), events: () => eventLog.map(event => ({ ...event, stance: event.stance ? { ...event.stance } : undefined })) });
