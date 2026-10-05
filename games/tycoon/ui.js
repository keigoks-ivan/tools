import { createCity } from './city.js';
import { icon } from './icons.js';
import { company, hud, shops, worldEvent, ticker, months, channels, share, tiles, products } from './data.js';
import { stacked, lines, spark } from './charts.js';

const q = new URLSearchParams(location.search);
const view = ['report', 'sandbox'].includes(q.get('view')) ? q.get('view') : 'city';
document.body.dataset.view = view;
if (q.has('freeze')) document.body.classList.add('freeze');

const fmtW = (n) => '$' + (n / 10000).toFixed(1) + ' 萬';
const app = document.getElementById('app');

const cityHud = () => `
<header id="topbar" class="panel">
  <div class="brand"><div class="logo">${icon.shop.replace('currentColor', '#fff')}</div><div><b>${company.name}</b><small>創業之城・${company.city}</small></div></div>
  <div class="stat"><span class="ic">${icon.coin}</span><div><label>現金</label><strong class="num">${fmtW(hud.cash)}</strong></div></div>
  <div class="stat"><span class="ic">${icon.trend}</span><div><label>本月淨利</label><strong class="num ${hud.netProfit >= 0 ? 'up' : 'down'}">${hud.netProfit >= 0 ? '+' : '−'}$${Math.abs(hud.netProfit).toLocaleString('en-US')}</strong></div></div>
  <div class="stat"><span class="ic">${icon.value}</span><div><label>公司估值</label><strong class="num">${fmtW(hud.valuation)}</strong></div></div>
  <div class="spacer"></div>
  <div class="date">${icon.cal}<span class="num">${company.date}</span></div>
  <div class="speed" role="group" aria-label="遊戲速度">
    <button title="暫停" aria-label="暫停">${icon.pause}</button>
    <button class="on" title="1 倍速" aria-label="1 倍速">${icon.play}</button>
    <button title="2 倍速" aria-label="2 倍速">${icon.play2}</button>
    <button title="4 倍速" aria-label="4 倍速">${icon.play4}</button>
  </div>
</header>
<nav id="dock" class="panel" aria-label="建造選單">
  <div class="cap">建造</div>
  <button class="on">${icon.shop}<span>開店</span></button>
  <button>${icon.factory}<span>工廠</span></button>
  <button>${icon.warehouse}<span>倉庫</span></button>
  <button>${icon.lab}<span>研發</span></button>
  <button>${icon.ad}<span>廣告</span></button>
</nav>
<aside id="event" class="panel">
  <div class="ev-head"><span class="chip">${icon.bolt}${worldEvent.tag}</span><time>${worldEvent.when}</time></div>
  <div class="ev-main"><div class="ev-ic">${icon.tariff}</div><div><h3>${worldEvent.title}</h3><p>${worldEvent.body}</p></div></div>
  <div class="fx">${worldEvent.effects.map(([l, v, k]) => `<div><label>${l}</label><b class="num ${k}">${v}</b></div>`).join('')}</div>
  ${worldEvent.choices.map(c => `<button class="choice ${c.primary ? 'primary' : ''}"><b>${c.label}</b><small>${c.note}</small></button>`).join('')}
  <div class="ev-foot"><i></i>${worldEvent.deadline}</div>
</aside>
<footer id="ticker" class="panel"><div class="lead"><i></i>快訊</div><div class="track"><div class="run">${[0, 1].map(() => ticker.map(t => `<span>${t}</span><em>◆</em>`).join('')).join('')}</div></div></footer>
<div id="tags"></div>`;

const starsHtml = (v) => `<span class="stars" aria-label="${v} 顆星"><span class="bg">${icon.star.repeat(5)}</span><span class="fg" style="width:${(v / 5) * 100}%">${icon.star.repeat(5)}</span></span>`;

const reportHud = () => {
  const sel = (n) => ((n.price - n.min) / (n.max - n.min)) * 100;
  return `
<section id="report" class="panel" aria-label="經營報表">
  <div class="rp-head"><h2>經營報表</h2><span class="sub num">${company.date}・${company.name}</span>
    <div class="tabs"><button class="on">總覽</button><button>通路</button><button>商品</button><button>對手</button></div>
    <button class="xbtn" aria-label="關閉">${icon.close}</button></div>
  <div class="tiles">${tiles.map(t => `
    <div class="tile"><label>${t.label}${t.sub ? `<span class="mg">${t.sub}</span>` : ''}</label><div class="v num">${t.value}${t.stars ? starsHtml(t.stars) : ''}</div>
    <div class="row"><div class="d num ${t.up ? 'up' : 'down'}">${t.up ? '▲' : '▼'} ${t.delta}<span>較上月</span></div>${spark(t.spark, '#4fd8a0')}</div></div>`).join('')}</div>
  <div class="cards">
    <div class="card"><h4>營收走勢<small>近 12 個月，依通路，單位：萬元</small></h4>
      <div class="legend">${channels.map(c => `<span><i style="background:${c.color}"></i>${c.name}</span>`).join('')}</div><div class="chart" id="c1"></div></div>
    <div class="card"><h4>市占率<small>全市手搖飲，近 12 個月</small></h4>
      <div class="legend">${share.map(c => `<span><i class="ln" style="background:${c.color}"></i>${c.name}</span>`).join('')}</div><div class="chart" id="c2"></div></div>
  </div>
  <div class="card ptable"><h4>商品<small>拖動滑桿調整售價，預估月銷量會跟著變</small></h4>
    <table><thead><tr><th>商品</th><th>售價</th><th>成本 / 毛利</th><th>品質</th><th>口碑</th><th>月銷量</th></tr></thead><tbody>
    ${products.map((p, i) => `<tr><td>${p.name}</td>
      <td class="price"><div class="pw"><input type="range" min="${p.min}" max="${p.max}" value="${p.price}" data-i="${i}" style="--p:${sel(p)}%" aria-label="${p.name} 售價"><b class="num" id="pp${i}">$${p.price}</b></div></td>
      <td class="num">$${p.cost.toFixed(1)}<span class="mg num" id="mg${i}">${(((p.price - p.cost) / p.price) * 100).toFixed(0)}%</span></td>
      <td class="num">${p.quality}<span class="qbar"><i style="width:${p.quality}%"></i></span></td>
      <td class="num rt">${icon.star}${p.rating.toFixed(1)}</td>
      <td class="num" id="vol${i}">${p.vol.toLocaleString('en-US')}</td></tr>`).join('')}
    </tbody></table></div>
</section><div id="tip"></div>`;
};

app.innerHTML = view === 'city' ? cityHud() : view === 'report' ? reportHud() : '';

// ---------- 城市場景 ----------
const city = createCity(document.getElementById('stage'), { freeze: q.has('freeze'), time: +(q.get('t') || 0), targetOffset: view === 'city' ? [1.6, 0, -0.15] : [0, 0, 0], controls: view !== 'report' });
await city.ready();
// 樣張的三家店（其餘店面維持「招租」）
const D3 = city.defaultLots;
if (view !== 'sandbox') {
  city.setShop(D3.player, { owner: 'player', name: shops.player.name, color: '#1f9d5c' });
  city.setShop(D3.rivalA, { owner: 'rival', name: shops.rivalA.name, color: '#c2413a' });
  city.setShop(D3.rivalB, { owner: 'rival', name: shops.rivalB.name, color: '#c2413a' });
}

if (view === 'city') {
  [['player', 'green'], ['rivalA', 'red'], ['rivalB', 'red']].forEach(([k, tone]) => city.setLabel(D3[k], { title: shops[k].name, sub: `月營收 ${fmtW(shops[k].revenue)}`, tone }));
} else if (view === 'report') {
  stacked(document.getElementById('c1'), { months, channels });
  lines(document.getElementById('c2'), { months, series: share });
  document.querySelectorAll('input[type=range]').forEach(r => r.addEventListener('input', () => {
    const i = +r.dataset.i, p = products[i], v = +r.value;
    r.style.setProperty('--p', ((v - p.min) / (p.max - p.min)) * 100 + '%');
    document.getElementById('pp' + i).textContent = '$' + v;
    document.getElementById('mg' + i).textContent = Math.round(((v - p.cost) / v) * 100) + '%';
    document.getElementById('vol' + i).textContent = Math.round(p.vol * Math.pow(p.price / v, 1.4)).toLocaleString('en-US');
  }));
}

if (view === 'sandbox') { const { initSandbox } = await import('./sandbox.js'); initSandbox(city); }
city.start();
window.__city = city;
await new Promise(r => setTimeout(r, 1500));
window.__ready = true;
