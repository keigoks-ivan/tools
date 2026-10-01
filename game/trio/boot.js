// 紫刃夜行・三人連線入口（/game/trio/）。引擎模組全部沿用 game/3d-next/，這裡只負責：
// 代號 → 大廳（開房／加入）→ 載入戰場 → 開始，並把 net/coop.js 交給 createBattle 讓隊友出現在同一個關卡。
// 第二階段：房主的裝置跑敵人（出兵、AI、血量、段落），大家打同一批敵人；隊友的命中申報給房主（net/enemy-sync.js）。
// 第三階段：倒地與救援、全滅才輸（任何人都能按重來）、合體大招、補給由房主裁定、交棒看誰看得到畫面（net/team.js）。
import { installGameGestures } from '../2d/touch-gestures.js';
import { CoopClient } from '../3d-next/net/client.js?v=20261002b';
import { createCoop } from '../3d-next/net/coop.js?v=20261002b';
import { relayUrl } from '../3d-next/net/protocol.js?v=20261002b';
import { RoomLoadout } from '../3d-next/net/loadout.js?v=20261002b';
import { HEROES } from '../3d-next/heroes.js?v=20261002b';
import { CHAPTERS } from '../3d-next/campaign.js?v=20261002b';
import { setupFullscreenUi } from './fullscreen.js?v=trio11';
import { setupWipeTransitions } from './wipe.js?v=trio11';
import { setupTeamOverlay } from './overlay.js?v=trio11';
import { setupTeamResults } from './results.js?v=trio11';

const $ = id => document.getElementById(id);
installGameGestures($('game'));
setupFullscreenUi();
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, event => { if (event.cancelable) event.preventDefault(); }, { passive: false });
}

// 引擎：版本字串與單人頁不同也沒關係（兩頁不會同時開），battle.js 內部的 import 網址相同
const loadBattleModule = () => import('../3d-next/battle.js?v=20261002b');
const params = new URLSearchParams(location.search);

const client = new CoopClient({ relay: relayUrl(location) });
const coop = createCoop({ client });
if (params.has('debug')) Object.assign(window, { __coopClient: client, __coop: coop });
const transitions = setupWipeTransitions({ coop, client });
if (params.has('debug')) window.__transitions = transitions;
// 隊友箭頭＋快捷喊話、結算卡隊伍成績（第四階段）
let liveBattle = null;
const roomLoadout = new RoomLoadout({ client, character: params.get('character'), chapter: Number(params.get('chapter')) || 0,
  currentChapter: () => liveBattle?.campaign?.index ?? roomLoadout.chapter,
  onChange: () => renderMembers(), onLaunch: options => launchBattle(options) });
for (const hero of Object.values(HEROES)) { const option = document.createElement('option'); option.value = hero.id; option.textContent = `${hero.name} ／ ${hero.weapon}`; $('characterSelect').append(option); }
for (const [i, chapter] of CHAPTERS.entries()) { const option = document.createElement('option'); option.value = i; option.textContent = `${String(i + 1).padStart(2, '0')} ${chapter.name}`; $('chapterSelect').append(option); }
$('characterSelect').value = roomLoadout.character;
$('characterSelect').addEventListener('change', event => roomLoadout.setCharacter(event.target.value));
$('chapterSelect').addEventListener('change', event => roomLoadout.setChapter(Number(event.target.value)));
const lobbyPulse = setInterval(() => roomLoadout.publish(), 2000);
setupTeamOverlay({ coop, client, getCamera: () => liveBattle?.camera, canvas: $('battle') });
setupTeamResults({ coop });

// ---- 音訊（與單人頁相同的 audio.js；M 鍵與 HUD 按鈕切換靜音） ----
let audio = null, assets = null;
const audioReady = import('../3d-next/audio.js?v=trio11').then(({ createAudio }) => {
  audio = createAudio({ baseUrl: '../assets/audio/march/', fetchImpl: (url, init) => assets ? assets.fetchAudio(url, init) : fetch(url, init) });
  if (params.get('mute') === '1') audio.setMuted(true);
  const button = $('soundBtn');
  const render = s => { if (button) { button.hidden = false; button.textContent = s.muted ? '🔇' : '🔊'; button.setAttribute('aria-pressed', String(s.muted)); button.setAttribute('aria-label', s.muted ? '開啟聲音' : '靜音'); } if ($('soundState')) $('soundState').textContent = s.muted ? '已靜音（M）' : '聲音開（M）'; };
  const flip = () => { audio.unlock(); audio.toggleMuted(); audio.ui(); };
  audio.subscribe(render);
  render(audio.state());
  button?.addEventListener('click', flip);
  window.addEventListener('keydown', event => { if (event.code === 'KeyM' && !event.repeat && !event.target.closest?.('input')) flip(); });
  return audio;
}).catch(error => { console.warn('audio unavailable', error); return null; });

// ---- 背景載入戰場（大廳期間就開始，按開始時通常已經好了） ----
let battlePromise = null;
function prepare() {
  if (!battlePromise) {
    battlePromise = Promise.all([loadBattleModule(), audioReady]).then(([module]) => {
      assets = module.createBattleAssets().start();
      return module.createBattle($('battle'), { audio, assets, coop });
    });
    battlePromise.catch(error => { console.warn('preload failed; Start will retry', error); battlePromise = null; });
  }
  return battlePromise;
}
if (!navigator.connection?.saveData) {
  const go = () => requestAnimationFrame(() => setTimeout(prepare, 0));
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}

// ---- 畫面：代號 → 大廳 → 房內 ----
const panels = { gate: $('gatePanel'), lobby: $('lobbyPanel'), room: $('roomPanel') };
function show(name) { for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== name; }
function message(text = '', ok = false) { $('trioMessage').textContent = text; $('trioMessage').classList.toggle('ok', ok); }

function showLobby(name) {
  $('helloText').textContent = `你好，${name}`;
  show('lobby');
}
const saved = client.savedIdentity();
if (saved) showLobby(saved.name); else show('gate');

$('gatePanel').addEventListener('submit', async event => {
  event.preventDefault();
  const code = $('codeInput').value;
  if (!code.trim()) return;
  $('codeSubmit').disabled = true;
  message('確認中…', true);
  try {
    const { name } = await client.login(code);
    $('codeInput').value = '';
    message('');
    showLobby(name);
  } catch (error) { message(error.message); }
  finally { $('codeSubmit').disabled = false; }
});
$('forgetCode').addEventListener('click', () => { client.forget(); message(''); show('gate'); });

async function enterRoom(room) {
  for (const button of document.querySelectorAll('#lobbyPanel button')) button.disabled = true;
  message('連線中…', true);
  try {
    await client.connect(room);
    message('');
    show('room');
  } catch (error) {
    message(error.message);
    if (error.code === 4001) show('gate');
  } finally {
    for (const button of document.querySelectorAll('#lobbyPanel button')) button.disabled = false;
  }
}
$('createRoom').addEventListener('click', () => enterRoom('NEW'));
$('joinForm').addEventListener('submit', event => {
  event.preventDefault();
  const code = $('roomInput').value.trim().toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{4}$/.test(code)) { message('房號是 4 個字（英文字母與數字，沒有 0、O、1、I）。'); return; }
  enterRoom(code);
});
$('leaveRoom').addEventListener('click', () => { client.close(); renderMembers(); showLobby(client.savedIdentity()?.name || ''); });

// ---- 名單、房主與連線狀態 ----
function renderMembers() {
  const list = $('memberList');
  list.replaceChildren(...[...client.members.values()].map(member => {
    const item = document.createElement('li');
    const choice = roomLoadout.choice(member.id);
    item.textContent = `${member.name}・${HEROES[choice.character]?.name || '紫刃'}・${choice.ready ? '已準備' : '選擇中'}`;
    if (member.id === client.host) { const tag = document.createElement('small'); tag.textContent = '房主'; item.append(tag); }
    if (member.id === client.you) { const tag = document.createElement('small'); tag.textContent = '你'; item.append(tag); }
    return item;
  }));
  $('roomCode').textContent = client.room && client.room !== 'NEW' ? client.room : '----';
  $('characterSelect').value = roomLoadout.character; $('characterSelect').disabled = !!roomLoadout.launched;
  $('chapterSelect').value = String(roomLoadout.chapter); $('chapterSelect').disabled = !roomLoadout.isHost || !!roomLoadout.launched;
  $('chapterNote').textContent = roomLoadout.isHost ? '你是房主，選好關卡後按準備，全員準備完成就會一起出擊。' : roomLoadout.run ? '戰鬥已開始，選好角色後加入目前關卡。' : '關卡由房主選擇，準備完成後會一起出擊。';
  $('start').querySelector('span').textContent = roomLoadout.ready ? '已準備・等待隊伍' : roomLoadout.run ? '加入戰鬥' : '準備完成';
  $('start').disabled = roomLoadout.ready && !roomLoadout.launched;
  renderHud();
}
let hudNote = '', hudNoteUntil = 0, statusKind = 'ok';
function renderHud() {
  const hud = $('trioHud');
  const names = [...client.members.values()].map(member => `${member.name}${member.id === client.host ? '（房主）' : ''}`).join('・');
  hud.hidden = !client.room;
  hud.innerHTML = '';
  const code = document.createElement('b');
  code.textContent = client.room || '';
  hud.append('房號 ', code, `　${names}`);
  const note = Date.now() < hudNoteUntil ? hudNote : statusKind !== 'ok' ? lastStatus : '';
  if (note) { const span = document.createElement('span'); span.className = statusKind === 'ok' ? '' : 'warn'; span.textContent = `　${note}`; hud.append(span); }
}
function note(text) { hudNote = text; hudNoteUntil = Date.now() + 3000; renderHud(); setTimeout(renderHud, 3100); }
let lastStatus = '';
client.on('welcome', renderMembers);
client.on('join', (member, rejoin) => { renderMembers(); if (!rejoin && member.id !== client.you) note(`${member.name} 加入了`); });
client.on('leave', id => { renderMembers(); note(`${id} 離開了`); });
client.on('host', id => { renderMembers(); note(id === client.you ? '你成為房主' : `${id} 成為房主`); });
client.on('status', (text, kind) => { lastStatus = text; statusKind = kind === 'connecting' || kind === 'retry' || kind === 'error' ? 'warn' : 'ok'; renderHud(); });
client.on('closed', (code, text) => {
  renderMembers();
  if (document.body.dataset.mode !== 'play') { message(text); show(code === 4001 ? 'gate' : 'lobby'); }
});

// ---- 開始 ----
let loading = false;
$('start').addEventListener('click', () => { audio?.unlock(); roomLoadout.prepare(); });
async function launchBattle(options) {
  if (loading) return;
  loading = true;
  audio?.unlock(); audio?.ui();   // iOS／Android 需要在點擊當下解鎖音訊
  $('start').disabled = true;
  $('loadstatus').textContent = '載入戰場中…';
  const timer = setInterval(() => {
    const pct = assets ? Math.floor(assets.progress.display() * 100) : 0;
    $('loadstatus').textContent = `載入戰場中… ${pct}%`;
  }, 200);
  try {
    const battle = await prepare();
    liveBattle = battle;
    battle.configure(options);
    audio?.unlock();
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    $('title').hidden = true;
    document.body.dataset.mode = 'play';
    coop.setControls(battle);   // 第三階段：全滅／過關後任何人按重來，房主重開、其他人跟著重來
    battle.start();
    coop.setActive(true);
    renderHud();
  } catch (error) {
    console.error(error);
    $('loadstatus').textContent = '載入失敗，請檢查連線後重試。';
    $('start').disabled = false;
    loading = false;
    roomLoadout.failed();
  } finally { clearInterval(timer); }
}
window.addEventListener('pagehide', () => { clearInterval(lobbyPulse); coop.setActive(false); client.close(); });
