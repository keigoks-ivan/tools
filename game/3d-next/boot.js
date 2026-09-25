import { installGameGestures } from '../2d/touch-gestures.js';

// 手機防誤觸縮放：連點放大、雙指縮放（iOS gesture*）一律擋下；萬一仍被放大，重設 viewport 讓畫面縮回原比例
installGameGestures(document.getElementById('game'));
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, event => { if (event.cancelable) event.preventDefault(); }, { passive: false });
}
const viewportMeta = document.querySelector('meta[name="viewport"]');
const baseViewport = viewportMeta?.getAttribute('content') || '';
function resetZoom() {
  if (!viewportMeta || !window.visualViewport || window.visualViewport.scale <= 1.01) return;
  viewportMeta.setAttribute('content', `${baseViewport},maximum-scale=1`);
  setTimeout(() => viewportMeta.setAttribute('content', baseViewport), 300);
}
window.visualViewport?.addEventListener('resize', resetZoom);

// 紫刃版標題：換掉 Rumi 單角色與靜音的說明文字（音訊狀態由 #soundNote 另外更新）
if (new URLSearchParams(location.search).get('hero') === 'vroid') {
  const subtitle = document.querySelector('.title-subtitle');
  const copy = document.querySelector('.title-copy');
  const note = document.querySelector('.prototype-note');
  if (subtitle) subtitle.textContent = '紫刃・夜市突圍';
  if (copy) copy.textContent = '沿著夜市大街一路殺到魂門，擊倒敵將，最後單挑魂門守將。';
  if (note?.firstChild) note.firstChild.textContent = '3D 試作　·　紫刃　·　';
}

const startButton = document.getElementById('start');
const loadStatus = document.getElementById('loadstatus');
let loading = false;

// ?hero=vroid：有聲試作（audio.js，程式合成的原創配樂＋音效）；預設 Rumi 頁面不載入音訊、維持靜音
const vroid = new URLSearchParams(location.search).get('hero') === 'vroid';
let audio = null;
const audioReady = vroid
  ? import('./audio.js?v=20260925a').then(({ createAudio }) => {
    audio = createAudio({ baseUrl: '../assets/audio/march/' });
    if (new URLSearchParams(location.search).has('debug')) window.__audio = audio;
    setupSoundUi();
    return audio;
  })
    .catch(error => { console.warn('audio unavailable', error); return null; })
  : Promise.resolve(null);

function setupSoundUi() {
  const note = document.getElementById('soundNote');
  const toggle = document.getElementById('soundToggle');
  const hudButton = document.getElementById('soundBtn');
  const state = document.getElementById('soundState');
  const render = s => {
    if (note) note.textContent = s.muted ? '已靜音' : '有聲試作';
    if (toggle) { toggle.hidden = false; toggle.textContent = s.muted ? '🔇 聲音：關' : '🔊 聲音：開'; toggle.setAttribute('aria-pressed', String(s.muted)); }
    if (hudButton) { hudButton.hidden = false; hudButton.textContent = s.muted ? '🔇' : '🔊'; hudButton.setAttribute('aria-pressed', String(s.muted)); hudButton.setAttribute('aria-label', s.muted ? '開啟聲音' : '靜音'); }
    if (state) state.textContent = s.muted ? '已靜音（M）' : '聲音開（M）';
  };
  const flip = () => { audio.unlock(); audio.toggleMuted(); audio.ui(); };
  audio.subscribe(render);
  render(audio.state());
  toggle?.addEventListener('click', flip);
  hudButton?.addEventListener('click', flip);
  window.addEventListener('keydown', event => { if (event.code === 'KeyM' && !event.repeat) flip(); });
  document.addEventListener('click', event => { if (event.target.closest?.('#pauseBtn, #resume, #retry')) audio.ui(); });
}

async function start() {
  if (loading) return;
  loading = true;
  // the Start click is the user gesture iOS / Android need: unlock synchronously, before any await
  audio?.unlock();
  audio?.ui();
  startButton.disabled = true;
  loadStatus.textContent = '正在載入 3D 角色與夜市…';
  document.body.dataset.mode = 'loading';
  try {
    const [{ createBattle }] = await Promise.all([import('./battle.js?v=20260925d'), audioReady]);
    audio?.unlock();   // no-op when already unlocked; covers a click that beat the audio module download
    const battle = await createBattle(document.getElementById('battle'), { audio });
    document.getElementById('title').hidden = true;
    document.body.dataset.mode = 'play';
    battle.start();
  } catch (error) {
    console.error(error);
    loadStatus.textContent = '載入失敗，請檢查連線後重試。';
    document.body.dataset.mode = 'title';
    startButton.disabled = false;
    loading = false;
  }
}

startButton.addEventListener('click', start);
