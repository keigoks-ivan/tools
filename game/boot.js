// 首頁只處理選單；使用者開始前不匯入 Three.js、不建立 WebGL。
const startButton = document.getElementById('startBtn');
const muteButton = document.getElementById('mute');
const loadText = document.getElementById('loadtext');
let loading = false;
let failed = false;

if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('is-touch');

function toggleTitleMute() {
  const muted = muteButton.getAttribute('aria-pressed') !== 'true';
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.setAttribute('aria-label', muted ? '開啟聲音' : '靜音');
  muteButton.textContent = muted ? '🔇' : '🔊';
}

async function beginLoading() {
  if (loading) return;
  if (failed) { window.location.reload(); return; }
  loading = true;
  startButton.disabled = true;
  muteButton.disabled = true;
  startButton.setAttribute('aria-busy', 'true');
  loadText.textContent = '準備遊戲…';
  // 引擎會從按鈕讀取靜音設定，並接手後續的音訊控制。
  muteButton.removeEventListener('click', toggleTitleMute);
  try {
    const game = await import('./main.js?v=20260923c');
    await game.prepareGame();
    startButton.removeEventListener('click', beginLoading);
    window.removeEventListener('keydown', titleKeydown);
  } catch (err) {
    failed = true;
    loadText.textContent = '遊戲載入失敗，請檢查連線後按下按鈕重新載入。';
    startButton.querySelector('span').textContent = '重新載入';
    console.error(err);
  } finally {
    loading = false;
    startButton.disabled = false;
    muteButton.disabled = false;
    startButton.removeAttribute('aria-busy');
  }
}

function titleKeydown(event) {
  if (event.target instanceof Element && event.target.closest('button')) return;
  if (event.code === 'KeyM' && !loading && !failed) toggleTitleMute();
  if (event.code === 'Enter' || event.code === 'KeyJ') {
    event.preventDefault();
    void beginLoading();
  }
}

startButton.addEventListener('click', beginLoading);
muteButton.addEventListener('click', toggleTitleMute);
window.addEventListener('keydown', titleKeydown);
