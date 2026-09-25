import { installGameGestures } from '../2d/touch-gestures.js';
import { assetPlan, createPreloader } from './preload.js?v=20260925c';

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
if (new URLSearchParams(location.search).get('hero') !== 'rumi') {
  const subtitle = document.querySelector('.title-subtitle');
  const copy = document.querySelector('.title-copy');
  const note = document.querySelector('.prototype-note');
  if (subtitle) subtitle.textContent = '紫刃・夜市突圍';
  if (copy) copy.textContent = '沿著夜市大街一路殺到鬼門，擊倒敵將，最後單挑鬼門守將。';
  if (note?.firstChild) note.firstChild.textContent = '3D 試作　·　紫刃　·　';
}

// 全螢幕（電腦版）：標題與 HUD 各一顆按鈕＋F 鍵；Esc 由瀏覽器處理。觸控裝置與不支援的瀏覽器不顯示。
// 進出全螢幕會觸發 window resize，battle.js 原本的 resize() 會重設畫布與鏡頭比例。
function setupFullscreenUi() {
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  const enabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (!request || !exit || !enabled || matchMedia('(pointer: coarse)').matches) return;
  const current = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const buttons = [document.getElementById('fullscreenToggle'), document.getElementById('fullscreenBtn')].filter(Boolean);
  const render = () => {
    const on = !!current();
    for (const button of buttons) {
      button.hidden = false;
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', on ? '離開全螢幕' : '全螢幕');
      if (button.id === 'fullscreenToggle') button.textContent = on ? '⛶ 離開全螢幕（F）' : '⛶ 全螢幕（F）';
    }
    document.querySelector('[data-fullscreen-help]')?.removeAttribute('hidden');
  };
  const flip = () => {
    const done = current() ? exit.call(document) : request.call(root);
    Promise.resolve(done).catch(() => {});   // 被瀏覽器拒絕（例如沒有使用者手勢）時保持原狀
  };
  for (const button of buttons) button.addEventListener('click', flip);
  window.addEventListener('keydown', event => {
    if (event.code !== 'KeyF' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('input, textarea, select')) return;
    flip();
  });
  document.addEventListener('fullscreenchange', render);
  document.addEventListener('webkitfullscreenchange', render);
  render();
}
setupFullscreenUi();

const startButton = document.getElementById('start');
const loadStatus = document.getElementById('loadstatus');
let loading = false;

// ?hero=vroid：有聲試作（audio.js，程式合成的原創配樂＋音效）；預設 Rumi 頁面不載入音訊、維持靜音
const params = new URLSearchParams(location.search);
const vroid = params.get('hero') !== 'rumi';   // 預設紫刃；?hero=rumi 為舊版靜音頁
// 預載器：標題畫面畫好後在背景下載開戰要用的檔案；判斷角色／關卡的規則與 battle.js 相同
const assets = createPreloader({
  plan: assetPlan({ hero: vroid ? 'vroid' : 'rumi', march: vroid && params.get('level') !== 'single' }),
  loadEngine: () => loadBattleModule().then(async module => { await module.loadLazyModules(); return module; }),
});
const loadBattleModule = () => import('./battle.js?v=20260925i');
if (params.has('debug')) window.__assets = assets;   // ?debug：各項下載／步驟的開始與完成時間（__assets.progress.items）
let audio = null;
const audioReady = vroid
  ? import('./audio.js?v=20260925d').then(({ createAudio }) => {
    // mp3 由預載器提供（開戰要用的檔案下載完才抓）；解碼仍在按下開始、解鎖音訊之後
    audio = createAudio({ baseUrl: '../assets/audio/march/', fetchImpl: (url, init) => assets.fetchAudio(url, init) });
    if (params.has('debug')) window.__audio = audio;
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

// ---- 預載與進度條 ----
// 背景建好的戰場（createBattle）；失敗時清掉，按開始會重新下載失敗的檔案再建一次
let battlePromise = null, battleReady = false, prefetching = false;
// battle.js 的 import 圖：一次全部送出請求，不用等 battle.js 下載完才發現要抓 three.js（版本字串與 battle.js 相同，測試會比對）
const ENGINE_MODULES = ['../lib/three.module.js', '../lib/addons/loaders/GLTFLoader.js', '../lib/addons/utils/SkeletonUtils.js',
  '../2d/combat.js', '../frame-pacing.js', './world.js', './oni.js', './touch-input.js',
  ...(vroid ? ['./combat-fx.js?v=20260925i'] : []), ...(vroid && params.get('level') !== 'single' ? ['./march.js', './march-art.js?v=20260925f'] : [])];
function preloadModules() {
  for (const href of ENGINE_MODULES) {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = href;
    document.head.append(link);
  }
}
function prepare() {
  if (!prefetching) preloadModules();
  prefetching = true;
  assets.start();
  if (!battlePromise) {
    battlePromise = Promise.all([loadBattleModule(), audioReady])
      .then(([{ createBattle }]) => createBattle(document.getElementById('battle'), { audio, assets }));
    battlePromise.then(battle => {
      battleReady = true;
      // 還在標題畫面：趁空檔先編 shader、上傳貼圖（約 0.5～1 秒 CPU），按開始後就不用等
      if (!loading) setTimeout(() => { if (!loading) battle.warm?.(); }, 50);
    }, error => { battlePromise = null; if (!loading) console.warn('background preload failed; Start will retry', error); });
  }
  return battlePromise;
}
// 省流量模式不預載；其餘在標題畫面（含背景圖）載完、畫出第一格之後才開始，不跟標題搶頻寬
function schedulePrefetch() {
  if (navigator.connection?.saveData) return;
  const go = () => requestAnimationFrame(() => setTimeout(prepare, 0));
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}

const panel = document.getElementById('loadPanel');
const stageText = panel?.querySelector('.load-stage');
const pctText = panel?.querySelector('.load-pct');
const bar = panel?.querySelector('.load-progress');
const barFill = bar?.querySelector('i');
let shownPct = -1, shownText = '';
function renderProgress() {
  const mode = document.body.dataset.mode;
  if (!panel || (mode !== 'title' && mode !== 'loading')) return false;
  const pct = Math.floor(assets.progress.display() * 100);
  panel.hidden = !prefetching;
  if (pct !== shownPct) {
    shownPct = pct;
    barFill.style.transform = `scaleX(${pct / 100})`;
    bar.setAttribute('aria-valuenow', String(pct));
    pctText.textContent = `${pct}%`;
  }
  const stage = assets.progress.stage();
  if (stageText.textContent !== stage) stageText.textContent = stage;
  let text = shownText;
  if (mode === 'loading') text = '載入完成後自動開始';
  else if (loadStatus.dataset.error) text = loadStatus.dataset.error;
  else if (battleReady) text = '已準備好，按下即可開始';
  else if (prefetching) text = `背景預載 ${pct}%，可直接開始`;
  if (text && text !== shownText) { shownText = text; loadStatus.textContent = text; }
  return true;
}
function progressLoop() { if (renderProgress()) requestAnimationFrame(progressLoop); }
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

async function start() {
  if (loading) return;
  loading = true;
  // the Start click is the user gesture iOS / Android need: unlock synchronously, before any await
  audio?.unlock();
  audio?.ui();
  startButton.disabled = true;
  delete loadStatus.dataset.error;
  document.body.dataset.mode = 'loading';
  requestAnimationFrame(progressLoop);
  try {
    const battle = await prepare();
    audio?.unlock();   // no-op when already unlocked; covers a click that beat the audio module download
    // 最後一步（編 shader、畫第一格）會佔住主執行緒：先把「準備戰場」畫出來
    assets.progress.begin('start');
    renderProgress();
    await nextPaint();
    document.getElementById('title').hidden = true;
    document.body.dataset.mode = 'play';
    battle.start();
    assets.progress.complete('start');
  } catch (error) {
    console.error(error);
    loadStatus.dataset.error = '載入失敗，請檢查連線後重試。';
    document.body.dataset.mode = 'title';
    startButton.disabled = false;
    loading = false;
    requestAnimationFrame(progressLoop);
  }
}

startButton.addEventListener('click', start);
// 按開始時音訊模組若還沒下載完，改在下一次觸碰（仍是使用者手勢）時解鎖
audioReady.then(a => {
  if (!a || a.state().unlocked) return;
  const late = () => { if (!loading) return; a.unlock(); for (const t of ['pointerdown', 'touchend', 'click']) document.removeEventListener(t, late, true); };
  for (const t of ['pointerdown', 'touchend', 'click']) document.addEventListener(t, late, true);
});
requestAnimationFrame(progressLoop);
schedulePrefetch();
