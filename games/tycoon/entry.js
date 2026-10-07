import { routeArt } from './route-art.js';
const q = new URLSearchParams(location.search), mode = q.get('mode');
if (q.get('view') === 'sandbox' || mode === 'stores') await import('./game.js');
else if (['manufacturing', 'technology'].includes(mode)) {
  const { startVenture } = await import('./venture-ui.js'); startVenture(mode, q.get('business'));
} else {
  document.body.dataset.view = 'routes'; document.getElementById('boot').hidden = true;
  const definitions = [
    { id: 'stores', number: '01', name: '門店與連鎖', tagline: '一條街開始，一個品牌長大。', body: '從飲料、餐飲、零售到健身。走進城市，理解地段、來客、人力、租約與分店互搶。', skills: '定價 · 服務 · 庫存 · 地段 · 連鎖治理', key: 'tycoon.save.v1', choices: [['tea','九種門店業態，在城市中自由選擇']], start: '進入雲港市' },
    { id: 'manufacturing', number: '02', name: '製造與工業', tagline: '接到訂單，才是挑戰的開始。', body: '投標、採購、排程、品管到交貨。工廠可能帳上有利潤，卻被原料和應收尾款拖垮。', skills: '報價 · 產能 · 交期 · 品質 · 周轉金', key: 'tycoon.manufacturing.save.v1', choices: [['packaging','客製包材｜資本 90 萬'],['apparel','服飾代工｜資本 150 萬'],['electronics','電子組裝｜資本 350 萬']], start: '成立製造公司' },
    { id: 'technology', number: '03', name: '網路與科技', tagline: '有人用，還要有人願意留下。', body: '訂閱軟體、媒合平台或內容網站。驗證產品，經營獲客與留存，處理技術債和系統容量。', skills: '產品 · 轉換 · 留存 · 維運 · 單位經濟', key: 'tycoon.technology.save.v1', choices: [['saas','訂閱軟體｜資本 80 萬'],['marketplace','媒合平台｜資本 160 萬'],['content','內容工具網站｜資本 65 萬']], start: '成立網路公司' },
  ];
  const hasSave = key => { try { return !!(localStorage.getItem(key) || localStorage.getItem(key + '.backup')); } catch { return false; } };
  document.getElementById('app').innerHTML = `<main class="route-home"><header class="route-intro"><a href="../">← 遊戲館</a><span class="route-kicker">ENTREPRENEURSHIP / THREE WORLDS</span><h1>創業，不只一種路。</h1><p>選一條經營路線。不同的畫面、不同的生意，<br>同樣要面對有限的資金與真實的取捨。</p></header><div class="route-cards">${definitions.map(d => { const saved = hasSave(d.key); return `<article class="route-card ${d.id}"><div class="route-art">${routeArt(d.id, true)}</div><div class="route-content"><div class="route-eyebrow"><span>${d.number} / ${d.id.toUpperCase()}</span><b>${saved ? '有獨立存檔' : '新的開始'}</b></div><h2>${d.name}</h2><h3>${d.tagline}</h3><p>${d.body}</p><small>${d.skills}</small>${!saved && d.id !== 'stores' ? `<label>選擇創業題目<select id="business-${d.id}">${d.choices.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label>` : `<div class="route-preserved">${saved ? '繼續此路線的上次進度，進入後可另開新局。' : d.choices[0][1]}</div>`}<button data-route="${d.id}">${saved ? '繼續經營' : d.start}<span>↗</span></button></div></article>`; }).join('')}</div><footer class="route-foot"><span>三條路線分別存檔，切換不會刪掉進度。</span><span>三年經營 · 整合月報與結案分析 · 本機自動存檔</span></footer></main>`;
  document.getElementById('app').addEventListener('click', e => {
    const button = e.target.closest('[data-route]'); if (!button) return;
    const target = new URL(location.href); target.searchParams.set('mode', button.dataset.route);
    const business = document.getElementById('business-' + button.dataset.route)?.value;
    if (business) target.searchParams.set('business', business); else target.searchParams.delete('business'); location.href = target.href;
  });
  window.__ready = true;
}
