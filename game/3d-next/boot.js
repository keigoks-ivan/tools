const startButton = document.getElementById('start');
const loadStatus = document.getElementById('loadstatus');
let loading = false;

async function start() {
  if (loading) return;
  loading = true;
  startButton.disabled = true;
  loadStatus.textContent = '正在載入 3D 角色與夜市…';
  document.body.dataset.mode = 'loading';
  try {
    const { createBattle } = await import('./battle.js?v=20260924a');
    const battle = await createBattle(document.getElementById('battle'));
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
