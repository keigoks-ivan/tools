// 全螢幕（電腦版）：與 game/3d-next/boot.js 的 setupFullscreenUi 同一套行為，三人頁獨立一份以免動到單人頁 boot.js。
// 標題與 HUD 各一顆按鈕＋F 鍵；Esc 由瀏覽器處理。觸控裝置與不支援的瀏覽器不顯示。
// 進出全螢幕會觸發 window resize，battle.js 原本的 resize() 會重設畫布與鏡頭比例。
export function setupFullscreenUi() {
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
    if (event.target.closest?.('input, textarea, select')) return;   // 輸入代號、房號時打 F 不切換
    flip();
  });
  document.addEventListener('fullscreenchange', render);
  document.addEventListener('webkitfullscreenchange', render);
  render();
}
