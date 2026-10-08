import { routeArt } from './route-art.js';
const q = new URLSearchParams(location.search), mode = q.get('mode');
if (mode === 'enterprise') {
  const { startEnterprise } = await import('./enterprise-ui.js'); startEnterprise(q.get('business'));
} else if (q.get('view') === 'sandbox' || mode === 'stores') await import('./game.js');
else if (['manufacturing', 'technology'].includes(mode)) {
  const { startVenture } = await import('./venture-ui.js'); startVenture(mode, q.get('business'));
} else {
  document.body.dataset.view = 'routes'; document.getElementById('boot').hidden = true;
  const definitions = [
    { id: 'stores', number: '01', name: '門店與連鎖', world: '雲港街區', play: '城市地圖 × 品牌擴張', tagline: '一條街開始，一個品牌長大。', body: '從飲料、餐飲、零售到健身。走進城市，理解地段、來客、人力、租約與分店互搶。', skills: '定價 · 服務 · 庫存 · 地段 · 連鎖治理', key: 'tycoon.save.v1', choices: [['tea','九種門店業態，在城市中自由選擇']], start: '進入雲港市' },
    { id: 'manufacturing', number: '02', name: '製造與工業', world: '雲港工業園', play: '工廠產線 × 訂單履約', tagline: '接到訂單，才是挑戰的開始。', body: '投標、採購、排程、品管到交貨。工廠可能帳上有利潤，卻被原料和應收尾款拖垮。', skills: '報價 · 產能 · 交期 · 品質 · 周轉金', key: 'tycoon.manufacturing.save.v1', choices: [['packaging','客製包材｜資本 90 萬'],['apparel','服飾代工｜資本 150 萬'],['electronics','電子組裝｜資本 350 萬']], start: '成立製造公司' },
    { id: 'technology', number: '03', name: '網路與科技', world: '未來創意園', play: '產品工作室 × 使用者成長', tagline: '有人用，還要有人願意留下。', body: '訂閱軟體、媒合平台或內容網站。驗證產品，經營獲客與留存，處理技術債和系統容量。', skills: '產品 · 轉換 · 留存 · 維運 · 單位經濟', key: 'tycoon.technology.save.v1', choices: [['saas','訂閱軟體｜資本 80 萬'],['marketplace','媒合平台｜資本 160 萬'],['content','內容工具網站｜資本 65 萬']], start: '成立網路公司' },
  ];
  const hasSave = key => { try { return !!(localStorage.getItem(key) || localStorage.getItem(key + '.backup')); } catch { return false; } };
  const icons = {
    stores: '<path d="M4 10V6h16v4M3 10h18l-2 5H5l-2-5Zm3 5v6h12v-6M10 21v-5h4v5M7 6V3h10v3"/>',
    manufacturing: '<path d="M3 21V10l6 3V8l6 4V3h4v18H3Zm4-4h2m3 0h2m3 0h1"/>',
    technology: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4m-5-10 3-3m4 6 3-3m-7 3 4-6"/>',
  };
  document.getElementById('app').innerHTML = `<main class="route-home"><div class="route-topline"><a href="../">← 遊戲館</a><span class="route-save-note"><i></i>三個世界 · 獨立進度</span></div><header class="route-intro"><span class="route-kicker">創業之城 / SELECT YOUR WORLD</span><h1>選你的創業世界<span>從第一個決定開始。</span></h1><p>走進街區、接手工廠，或做出有人願意使用的產品。<br>用有限的資金，經營一段屬於你的創業故事。</p><div class="route-game-rules"><span><b>3</b> 年經營挑戰</span><span>隨時暫停與調整</span><span>自動存檔，隨時續玩</span><a href="#owner-businesses">六種新事業 ▶</a></div></header><section class="route-cards" aria-label="選擇經營世界">${definitions.map(d => { const saved = hasSave(d.key); return `<article class="route-card ${d.id}"><div class="route-art">${routeArt(d.id, true)}<span class="route-world-number">世界 ${d.number}</span><div class="route-world-name"><span>${d.world}</span><small>${d.play}</small></div></div><div class="route-content"><div class="route-eyebrow"><span class="route-business-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[d.id]}</svg></span><span>${d.id.toUpperCase()}</span><b class="${saved ? 'saved' : ''}">${saved ? '進度已保存' : '準備開局'}</b></div><h2>${d.name}</h2><h3>${d.tagline}</h3><p>${d.body}</p><div class="route-skills" aria-label="經營重點">${d.skills.split(' · ').map(s=>`<span>${s}</span>`).join('')}</div>${!saved && d.id !== 'stores' ? `<label>這次經營什麼？<select id="business-${d.id}">${d.choices.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label>` : `<div class="route-preserved">${saved ? '繼續此路線的上次進度，進入後可另開新局。' : d.choices[0][1]}</div>`}<button data-route="${d.id}"><span>${saved ? '繼續經營' : d.start}</span><span aria-hidden="true">▶</span></button></div></article>`; }).join('')}</section><footer class="route-foot"><span>三條路線分別存檔，切換不會刪掉進度。</span><span>整合月報 · 決策觀察 · 結案分析</span></footer></main>`;
  const { ENTERPRISES } = await import('./enterprise.js');
  const more=document.createElement('section');more.className='owner-business-gallery';more.id='owner-businesses';more.setAttribute('aria-label','新增老闆經營劇本');
  more.innerHTML=`<header><span>MORE BUSINESSES / 六種新事業</span><h2>接手不同的生意，做不同的決定</h2><p>從客房、品牌到企業合約。每個新業態各自保存進度。</p></header><div>${Object.entries(ENTERPRISES).map(([id,p])=>`<a class="owner-business-card" href="?mode=enterprise&amp;business=${id}" data-business="${id}"><img src="assets/worlds/${id}-owner-v1-small.webp" width="640" height="360" alt="${p.name}場景" loading="lazy" decoding="async"><div><span>${p.category} · 資本 ${p.capital/10000} 萬</span><h3>${p.name}</h3><p>${p.factors}</p><b>${hasSave('tycoon.enterprise.'+id+'.save.v1')?'繼續經營':'以老闆身分開局'} →</b></div></a>`).join('')}</div>`;
  document.querySelector('.route-foot').before(more);
  document.querySelector('.route-foot>span').textContent='原三條路線與六種新增事業分別存檔，切換不會刪除進度。';
  document.getElementById('app').addEventListener('click', e => {
    const button = e.target.closest('[data-route]'); if (!button) return;
    const target = new URL(location.href); target.searchParams.set('mode', button.dataset.route);
    const business = document.getElementById('business-' + button.dataset.route)?.value;
    if (business) target.searchParams.set('business', business); else target.searchParams.delete('business'); location.href = target.href;
  });
  window.__ready = true;
}
