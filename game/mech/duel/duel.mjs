import { STEP, LIMITS, advancePilot, sanitizeInput } from './rules.mjs';
import { createArena } from './arena-view.mjs?v=3';
import { loadDuelMechArt } from './duel-mech-art.mjs?v=3';
import { createControls } from './controls.mjs';

const $ = id => document.getElementById(id);
const canvas = $('arena'), menu = $('menu'), hud = $('hud'), overlay = $('overlay');
const query = new URLSearchParams(location.search);
const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const relay = new URL(loopback ? 'http://127.0.0.1:8791/' : 'https://mech-duel.keigoks.workers.dev/');
const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const codePattern = /^[0-9abcdefghjkmnpqrstvwxyz]{24}$/;
const seatKey = code => `iron-dusk-duel.seat.${code}`;
const read = (storage, key) => { try { return window[storage].getItem(key); } catch { return null; } };
const write = (storage, key, value) => {
  try { if (value === null) window[storage].removeItem(key); else window[storage].setItem(key, value); } catch {}
};
const roomErrors = {
  room_not_found: '找不到房間。請向朋友索取新的邀請連結。',
  room_expired: '這個房間已逾時，請重新開房。',
  room_full: '這個房間已有兩位駕駛員。',
  resume_expired: '原本的座位已逾時，請重新加入。',
  replaced: '這個座位已由另一個分頁接管。',
  rate_limit: '連線次數過多，請稍後再試。',
  origin: '此網址無法連上對戰服務。',
  unavailable: '暫時無法建立房間，請再試一次。',
};
const pilotNames = ['青藍', '赭紅'];
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

let arena = null, socket = null, room = null, seat = null, retries = 0, retryTimer = 0;
let members = [false, false], ready = [false, false], paused = false, opening = false;
let state = null, frames = [], seq = -1, pending = [], predicted = null, correction = [0, 0, 0];
let activeOverlay = '', localQuality = read('localStorage','iron-dusk-duel.low');
let low = localQuality === null ? matchMedia('(pointer:coarse)').matches : localQuality === '1';
let toastTimer = 0, focusOn = false, sound = null, lastSoundEvent = -1;
let sentInputAt = 0, simBudget = 0, lastFrame = 0, lastRendered = 0;
let priorPhase = null, priorRound = 0;

const controls = createControls(canvas, {
  move: $('touch-move'), look: $('touch-look'), buttons: [...document.querySelectorAll('[data-drive]')],
}, {
  onMode: mode => {
    document.body.classList.toggle('touch', mode === 'touch');
    $('touch-controls').hidden = mode !== 'touch' || hud.hidden || Boolean(activeOverlay);
    showInputTip();
  },
  onEscape: () => {
    if (state && state.phase !== 'matchEnd' && !paused) {
      if (activeOverlay === 'pause') hideOverlay(); else showOverlay('pause');
      refresh();
    }
  },
});

const mechArt = await loadDuelMechArt().catch(error => { console.warn('[duel] M-07 model',error); return null; });
try { arena = createArena(canvas,mechArt); }
catch (error) { console.error('[duel] renderer', error); announce('這台裝置無法啟用 3D。請確認瀏覽器允許硬體加速。', true); }
function setQuality(value) {
  low = value;
  arena?.setQuality(low ? 0 : 1);
  $('quality').setAttribute('aria-pressed', String(low));
  write('localStorage', 'iron-dusk-duel.low', low ? '1' : '0');
}
$('quality').addEventListener('click', () => setQuality(!low));
setQuality(low);
addEventListener('resize', () => arena?.resize());
addEventListener('pointerdown', activateAudio, {once: true});
addEventListener('keydown', activateAudio, {once: true});
document.addEventListener('pointerlockchange', showInputTip);

function activateAudio() {
  if (query.has('mute') || sound) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  try { sound = new Context(); sound.resume().catch(() => {}); } catch {}
}
function playEvent(event) {
  if (!sound || sound.state !== 'running') return;
  const local = event.owner === seat;
  if (!local && event.hit !== seat) return;
  const audio = sound.createOscillator(), volume = sound.createGain(), t = sound.currentTime;
  const kind = event.type;
  const duration = kind === 'rifle' ? .08 : .23;
  audio.type = kind === 'rifle' ? 'sawtooth' : kind === 'launch' ? 'triangle' : 'sine';
  audio.frequency.setValueAtTime(kind === 'rifle' ? 115 : kind === 'launch' ? 320 : 76, t);
  audio.frequency.exponentialRampToValueAtTime(kind === 'launch' ? 135 : 39, t + duration);
  volume.gain.setValueAtTime(local ? .064 : .045, t);
  volume.gain.exponentialRampToValueAtTime(.001, t + duration);
  audio.connect(volume); volume.connect(sound.destination);
  audio.start(); audio.stop(t + duration); audio.onended = () => { audio.disconnect(); volume.disconnect(); };
}

function announce(text, error = false) {
  $('status').textContent = text;
  $('status').dataset.error = String(error);
}
function toast(text) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}
function normalizeRoom(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (codePattern.test(text.toLowerCase())) return text.toLowerCase();
  try {
    const code = new URL(text).searchParams.get('room')?.toLowerCase();
    return code && codePattern.test(code) ? code : null;
  } catch { return null; }
}
function reflectRoom(value) {
  if (value) params.set('room', value); else params.delete('room');
  const suffix = params.toString();
  history.replaceState(null, '', location.pathname + (suffix ? `?${suffix}` : ''));
}
function inviteURL() {
  const url = new URL(location.pathname, location.href);
  url.searchParams.set('room', room);
  if (query.has('mute')) url.searchParams.set('mute', '');
  return url.href;
}
function transmit(msg) {
  if (socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 48_000) return false;
  socket.send(JSON.stringify(msg));
  return true;
}
function resetMatch() {
  state = null; frames = []; pending = []; predicted = null; correction = [0,0,0];
  priorPhase = null; priorRound = 0; lastSoundEvent = -1;
  hideOverlay();
}
function leave(close = true, forget = true, clear = true) {
  clearTimeout(retryTimer);
  if (room && forget) write('sessionStorage', seatKey(room), null);
  if (close && seat !== null) transmit({t:'leave'});
  const ws = socket;
  socket = null; ws?.close();
  room = seat = null; members = [false,false]; ready = [false,false]; paused = false; retries = 0; opening = false;
  resetMatch();
  if (clear) reflectRoom(null);
  refresh();
}
function showDisconnected() {
  if (state) { showOverlay('reconnect'); }
  else announce('連線中斷，正在恢復座位……');
  refresh();
}
function connect(code, retry = false) {
  room = code;
  opening = true;
  reflectRoom(code);
  if (!retry) { $('room-code').value = code; announce('正在加入房間……'); }
  const url = new URL('ws', relay);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('room', code);
  const resume = read('sessionStorage', seatKey(code));
  if (resume) url.searchParams.set('resume', resume);
  const ws = new WebSocket(url);
  socket = ws;
  const helloTimeout = setTimeout(() => { if (socket === ws && opening) ws.close(); }, 7500);
  ws.addEventListener('message', event => {
    if (socket !== ws) return;
    let packet;
    try { packet = JSON.parse(event.data); } catch { return; }
    if (packet.t === 'welcome') {
      clearTimeout(helloTimeout);
      seat = packet.slot; seq = packet.ack; pending = []; retries = 0; opening = false;
      write('sessionStorage', seatKey(code), packet.resume);
      updateLobby(packet);
      if (activeOverlay === 'reconnect') hideOverlay();
      if (focusOn || controls.mode === 'pad') $('ready').focus();
      refresh();
    } else if (packet.t === 'room') {
      updateLobby(packet); refresh();
    } else if (packet.t === 'state') {
      acceptState(packet.state, packet.ack);
    } else if (packet.t === 'aborted') {
      resetMatch(); refresh();
      announce('對手已離線，房間可以繼續邀請朋友。');
    } else if (packet.t === 'error') {
      toast(roomErrors[packet.code] || '對戰服務暫時無法完成操作。');
    }
  });
  ws.addEventListener('close', event => {
    clearTimeout(helloTimeout);
    if (socket !== ws) return;
    socket = null; opening = false;
    if (event.reason === 'resume_expired' && resume && retries === 0 && !state) {
      write('sessionStorage', seatKey(code), null);
      retries++;
      connect(code, true); return;
    }
    if (event.reason in roomErrors || (!resume && seat === null) || retries >= 9) {
      leave(false, event.reason !== 'replaced');
      announce(roomErrors[event.reason] || '無法連上對戰服務，請檢查網路後再試。', true);
      return;
    }
    paused = true;
    showDisconnected();
    retryTimer = setTimeout(() => connect(code, true), Math.min(4000, 800 * 1.5 ** retries++));
  });
  refresh();
}
function updateLobby(packet) {
  members = packet.members; ready = packet.ready; paused = packet.paused === true;
  if (paused && state && activeOverlay !== 'reconnect') showOverlay('wait');
  if (!paused && activeOverlay === 'wait') hideOverlay();
}
function showInputTip() {
  $('battle-tip').hidden = controls.mode !== 'mouse' || document.pointerLockElement === canvas;
}
function refresh() {
  const playing = state !== null;
  menu.hidden = playing;
  hud.hidden = !playing;
  document.body.classList.toggle('playing', playing);
  document.body.classList.toggle('touch', controls.mode === 'touch');
  $('entry').hidden = seat !== null;
  $('seated').hidden = seat === null;
  $('create').disabled = opening || !arena;
  $('join').querySelector('button').disabled = opening || !arena;
  if (seat !== null) {
    const connected = socket?.readyState === WebSocket.OPEN && !opening;
    $('room-label').textContent = room;
    for (let i = 0; i < 2; i++) $('pilot-' + i).textContent =
      `${pilotNames[i]}${i === seat ? '（你）' : ''} · ${ready[i] ? '就緒' : members[i] ? '已加入' : '等待加入'}`;
    $('ready').textContent = ready[seat] ? '取消準備' : '準備';
    $('ready').disabled = !connected || !members.every(Boolean);
    if (connected && !playing) announce(members.every(Boolean) ? '兩位駕駛員都準備後開始。' : '複製邀請連結給朋友，等待對方加入。');
  }
  controls.setDriving(playing && !paused && !activeOverlay && state.phase !== 'matchEnd');
  $('touch-controls').hidden = controls.mode !== 'touch' || !playing || Boolean(activeOverlay);
  showInputTip();
}
function showOverlay(kind) {
  if (activeOverlay === kind) return;
  activeOverlay = kind;
  const title = $('overlay-title'), label = $('overlay-text'), main = $('overlay-main');
  if (kind === 'result') {
    title.textContent = state.winner === seat ? '對戰勝利' : state.winner === null ? '平手' : '對手獲勝';
    label.textContent = `比分 ${state.wins.join(' : ')}。雙方都選擇再戰後，即可開始下一場。`;
    main.textContent = '再戰'; main.disabled = false;
  } else if (kind === 'pause') {
    title.textContent = '操作已暫停'; label.textContent = '對局仍在進行中。';
    main.textContent = '回到對戰'; main.disabled = false;
  } else {
    title.textContent = kind === 'wait' ? '等待對手重新連線' : '連線中斷';
    label.textContent = kind === 'wait' ? '對戰暫停，對手有 45 秒回來。' : '正在嘗試恢復座位。';
    main.disabled = true; main.textContent = '重新連線中';
  }
  overlay.hidden = false;
  if (controls.mode === 'pad') (main.disabled ? $('overlay-leave') : main).focus();
}
function hideOverlay() { activeOverlay = ''; overlay.hidden = true; }

$('create').addEventListener('click', async () => {
  opening = true; focusOn = controls.mode === 'pad'; announce('正在建立房間……'); refresh();
  try {
    const result = await fetch(new URL('rooms', relay), {method:'POST', signal:AbortSignal.timeout(7000)});
    const created = await result.json();
    if (!result.ok || !normalizeRoom(created.room)) throw new Error(created.error || 'unavailable');
    connect(created.room);
  } catch (error) { opening = false; refresh(); announce(roomErrors[error.message] || roomErrors.unavailable, true); }
});
$('join').addEventListener('submit', event => {
  event.preventDefault();
  const code = normalizeRoom($('room-code').value);
  if (!code) { announce('請貼上完整的邀請連結或房號。', true); return; }
  focusOn = controls.mode === 'pad'; connect(code);
});
$('copy').addEventListener('click', async () => {
  const note = $('copy-note'), link = inviteURL();
  try { await navigator.clipboard.writeText(link); note.textContent = '已複製邀請連結。'; }
  catch { note.textContent = link; }
  note.hidden = false;
});
$('ready').addEventListener('click', () => transmit({t:'ready',value:!ready[seat]}));
function leaveRoom() { leave(); $('copy-note').hidden = true; announce('兩位駕駛員都準備後開始。'); }
$('leave').addEventListener('click', leaveRoom);
$('overlay-leave').addEventListener('click', leaveRoom);
$('overlay-main').addEventListener('click', () => {
  if (activeOverlay === 'result') {
    if (transmit({t:'rematch'})) {
      $('overlay-main').disabled = true; $('overlay-main').textContent = '等待對手';
      if (controls.mode === 'pad') $('overlay-leave').focus();
    }
  } else if (activeOverlay === 'pause') { hideOverlay(); refresh(); canvas.requestPointerLock?.()?.catch(() => {}); }
});

function acceptState(next, ack) {
  if (seat === null || !next?.players?.[seat]) return;
  const start = !state || next.tick < state.tick;
  const roundStart = start || next.round !== priorRound;
  if (start) { frames = []; pending = []; lastSoundEvent = -1; activateAudio(); }
  const resuming = activeOverlay === 'reconnect' && !paused;
  if (resuming || (roundStart && !paused)) hideOverlay();
  const pilot = next.players[seat];
  if (roundStart) {
    controls.setAim(pilot.yaw, pilot.pitch); pending = []; correction = [0,0,0];
    frames = [];
  }
  pending = pending.filter(entry => entry.seq > ack);
  const target = {...pilot};
  if (next.phase === 'fight' && !paused) for (const entry of pending) advancePilot(target, entry.input);
  if (predicted && !roundStart && next.phase === 'fight' && !paused) {
    const dx = predicted.x + correction[0] - target.x, dy = predicted.y + correction[1] - target.y, dz = predicted.z + correction[2] - target.z;
    correction = Math.hypot(dx,dy,dz) < 8 ? [dx,dy,dz] : [0,0,0];
  } else correction = [0,0,0];
  predicted = target;
  frames.push({state:next,time:performance.now()});
  if (frames.length > 5) frames.shift();
  const first = !state;
  state = next; priorRound = next.round;
  if (state.phase === 'matchEnd' && !paused) showOverlay('result');
  else if (priorPhase === 'matchEnd' && activeOverlay === 'result') hideOverlay();
  if (first || priorPhase !== next.phase || resuming) refresh();
  priorPhase = next.phase;
  for (const event of next.events) {
    if (event.id <= lastSoundEvent) continue;
    lastSoundEvent = event.id;
    playEvent(event);
  }
  updateHUD();
}
function formatTime(seconds) {
  const n = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(n / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}`;
}
function updateHUD() {
  const p = state.players[seat];
  $('round').textContent = `第 ${state.round} 回合`;
  $('clock').textContent = formatTime(state.phase === 'countdown' ? LIMITS.roundSeconds : state.clock);
  $('wins-0').textContent = state.wins[0]; $('wins-1').textContent = state.wins[1];
  $('hp').max = LIMITS.hp; $('hp').value = p.hp; $('hp-label').textContent = Math.ceil(p.hp * 100 / LIMITS.hp) + '%';
  $('energy').value = p.en; $('energy-label').textContent = Math.floor(p.en) + '%';
  $('ammo').textContent = p.reload ? '換彈中' : p.ammo;
  $('missile').textContent = p.lock >= 1 ? '已鎖定' : p.lock > 0 ? '鎖定中' : p.missileCooldown > 0 ? `${Math.ceil(p.missileCooldown)} 秒` : '就緒';
  $('crosshair').classList.toggle('locked', p.lock >= 1);
  $('objective').hidden = !state.objective.open || state.phase !== 'fight';
  $('objective-title').textContent = state.objective.owner === seat ? '正在占領' : state.objective.owner === null ? '爭奪中央中繼台' : '敵機正在占領';
  $('objective-bar').value = state.objective.progress;
  const announcement = state.phase === 'countdown' ? `${Math.max(1,Math.ceil(state.clock))} 秒後開始` : state.phase === 'roundEnd' ?
    (state.winner === seat ? '拿下本回合' : state.winner === null ? '本回合平手' : '對手拿下本回合') : '';
  const announcer = $('announcer');
  if (announcer.textContent !== announcement) announcer.textContent = announcement;
  announcer.hidden = !announcement || Boolean(activeOverlay);
}
function displayState(now, dt, input) {
  if (!state) return null;
  let a = frames[0], b = frames.at(-1);
  const t = now - 92;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].time >= t) { a = frames[i-1]; b = frames[i]; break; }
    a = frames[i]; b = a;
  }
  const blend = a === b ? 1 : Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time)));
  const other = 1 - seat, left = a.state.players[other], right = b.state.players[other];
  const remote = {...right};
  for (const key of ['x','y','z','vx','vy','vz','pitch']) remote[key] = lerp(left[key],right[key],blend);
  remote.yaw = lerpAngle(left.yaw,right.yaw,blend);
  const local = {...predicted};
  if (!paused && state.phase !== 'matchEnd' && !activeOverlay) { local.yaw = input.yaw; local.pitch = input.pitch; }
  const decay = reduceMotion ? 0 : Math.exp(-dt*13);
  for (let i = 0; i < correction.length; i++) correction[i] *= decay;
  local.x += correction[0]; local.y += correction[1]; local.z += correction[2];
  const players = state.players.slice(); players[seat] = local; players[other] = remote;
  return {...state,players};
}
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { lastFrame = now; simBudget = 0; return; }
  const dt = Math.min(.07,(now-(lastFrame || now))/1000); lastFrame = now;
  const input = controls.sample(dt,now);
  const live = state?.phase === 'fight' && !paused && !activeOverlay;
  if (live) {
    simBudget = Math.min(.1, simBudget + dt);
    while (simBudget >= STEP) {
      simBudget -= STEP;
      const packet = sanitizeInput(input);
      if (transmit({t:'input',seq:seq+1,input:packet})) {
        pending.push({seq:++seq,input:packet}); sentInputAt = now;
        advancePilot(predicted,packet);
        controls.acknowledgeInput(); input.missileCancel = false;
      }
    }
  } else {
    simBudget = 0;
    if (state?.phase === 'fight' && !paused && now - sentInputAt > 80 &&
        transmit({t:'input',seq:seq+1,input:{missileCancel:true}})) {
      seq++; sentInputAt = now;
    }
  }
  const frameMs = state ? (low ? 30 : 15) : (low || reduceMotion ? 62 : 31);
  if (arena && now-lastRendered >= frameMs) {
    const frameDt = Math.min(.09,(now-(lastRendered || now))/1000);
    lastRendered = now;
    const view = displayState(now,frameDt,input);
    const aim = view && view.players[seat];
    arena.render(view,seat,frameDt,aim && {yaw:aim.yaw,pitch:aim.pitch});
    if (view) {
      const mark = arena.aimPoint;
      $('crosshair').hidden = !mark.visible;
      $('crosshair').style.left = `${mark.x * 100}%`;
      $('crosshair').style.top = `${mark.y * 100}%`;
    }
  }
}
refresh();
requestAnimationFrame(frame);
const code = normalizeRoom(query.get('room'));
if (arena && code) connect(code);
else if (arena && query.has('room')) announce('邀請連結有誤，請向朋友確認房號。', true);
