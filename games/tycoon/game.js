// 創業之城 第 1 步：主迴圈與介面。把 sim.js（經濟）接到 city.js（3D 城市）。
// 預設網址直接進遊戲；?view=sandbox 進引擎測試台。
import { createCity } from './city.js';
import { icon } from './icons.js';
import { stacked, lines, spark } from './charts.js';
import { SOURCES } from './sources.js';
import { listParams } from './params.js';
import * as S from './sim.js';
import { caseReportHtml, caseReportDocument } from './case-report.js';

const q = new URLSearchParams(location.search);
if (q.get('view') === 'sandbox') {
  await import('./ui.js');
} else {
  await main();
}

async function main() {
  const V = S.V;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ───────── 數字格式：1 萬以上一律「$X.X 萬」（千分位、一位小數），未滿 1 萬用「$1,234」 ─────────
  const n1 = (v) => Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const wan = (n, sign = false) => (n < 0 ? '−' : sign && n > 0 ? '+' : '') + '$' + n1(n / 10000) + ' 萬';
  const yuan = (n, sign = false) => (n < 0 ? '−' : sign && n > 0 ? '+' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  const money = (n, sign = false) => (Math.abs(n) >= 10000 ? wan(n, sign) : yuan(n, sign));
  const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
  const int = (n) => Math.round(n).toLocaleString('en-US');

  const getShops = (owner) => S.getShops(world, owner);
  const ITEMS = Object.keys(V.items);
  const ZONE_NAME = { 住宅: '住宅巷弄', 商圈: '商圈', 辦公: '辦公區', 學校: '學校周邊', 捷運站旁: '捷運站旁' };
  const WAGE = { basic: '基本', market: '市場', high: '高' };
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const SAVE_KEY = 'tycoon.save.v1', TUT_KEY = 'tycoon.tutorial.v1';
  const COMPANY = '日常生活品牌';
  let selectedBusiness = 'tea';
  const bizOf = (s) => S.businessOf(s.businessId);
  const unitOf = (s) => bizOf(s).unit;
  const PLAYER_COLOR = '#1f9d5c', RIVAL_COLOR = '#c2413a';

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* 略過 */ } },
  };

  // ───────── 額外圖示 ─────────
  const sv = (p) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ic = {
    lock: sv('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
    book: sv('<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14.5H6.5A1.5 1.5 0 0 0 5 20z"/><path d="M5 20a1.5 1.5 0 0 0 1.5 1.5H19"/><path d="M9 8.5h6"/>'),
    loan: sv('<rect x="3.5" y="6.5" width="17" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.1M17.5 14.5v.1"/>'),
    report: sv('<path d="M5 20V4.5h10l4 4V20z"/><path d="M14.5 4.5v4h4M8.5 13.5h7M8.5 16.5h5"/>'),
    again: sv('<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4 4.5v4h4"/>'),
    sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'),
    cloud: sv('<path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a4.75 4.75 0 0 1 .5 9.5z"/>'),
    rain: sv('<path d="M7 15a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 5.5a4.75 4.75 0 0 1 .5 9.5z"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>'),
  };
  const WX = { sunny: ic.sun, cloudy: ic.cloud, rain: ic.rain };
  const WXN = { sunny: '晴', cloudy: '陰', rain: '雨' };

  // ───────── 外框 ─────────
  const app = $('#app');
  app.innerHTML = `
<header id="topbar" class="panel">
  <div class="brand"><div class="logo">${icon.shop.replace('currentColor', '#fff')}</div><div><b id="co-name">${COMPANY}</b><small>創業之城・雲港市</small></div></div>
  <div class="stat"><span class="ic">${icon.coin}</span><div><label>現金</label><strong class="num" id="h-cash"></strong></div></div>
  <div class="stat"><span class="ic">${icon.trend}</span><div><label>本月淨利</label><strong class="num" id="h-net"></strong></div></div>
  <div class="stat"><span class="ic">${icon.value}</span><div><label id="share-label">全城市占率</label><strong class="num" id="h-share"></strong></div></div>
  <div class="spacer"></div>
  <div class="date"><span class="wx" id="h-wx"></span><span class="num" id="h-date"></span><span class="ff" id="h-ff" hidden>夜間快轉</span></div>
  <div class="speed" role="group" aria-label="遊戲速度">
    <button data-sp="0" title="暫停" aria-label="暫停">${icon.pause}</button>
    <button data-sp="1" title="1 倍速" aria-label="1 倍速">${icon.play}</button>
    <button data-sp="2" title="2 倍速" aria-label="2 倍速">${icon.play2}</button>
    <button data-sp="4" title="4 倍速" aria-label="4 倍速">${icon.play4}</button>
    <button data-sp="16" title="16 倍速" aria-label="16 倍速">16×</button>
    <button data-sp="64" title="64 倍速，加快月份進度" aria-label="64 倍速">64×</button>
    <button data-fast="week" title="快進一週，遇到決策事件暫停">一週</button>
    <button data-fast="month" title="快進到下月月結，遇到決策事件暫停">下月</button>
  </div>
</header>
<nav id="dock" class="panel" aria-label="建造選單">
  <div class="cap">建造</div>
  <button data-dk="shop">${icon.shop}<span>開店</span></button>
  <button data-dk="factory">${icon.factory}<span>工廠</span></button>
  <button data-dk="warehouse">${icon.warehouse}<span>倉庫</span></button>
  <button data-dk="lab">${icon.lab}<span>研發</span></button>
  <button data-dk="ad">${icon.ad}<span>廣告</span></button>
  <button data-dk="loan">${ic.loan}<span>貸款</span></button>
  <div class="sep"></div>
  <button data-dk="report">${ic.report}<span>報表</span></button>
  <button data-dk="sources" class="mini">${ic.book}<span>數字來源</span></button>
  <button data-dk="new" class="mini">${ic.again}<span>新遊戲</span></button>
</nav>
<div id="map-controls" class="panel" role="group" aria-label="地圖視角">
  <button data-camera="left" aria-label="地圖向左旋轉" title="向左旋轉 45 度（也可按 Q 或滑鼠右鍵拖曳）">${ic.again}<span>左轉</span></button>
  <button data-camera="right" aria-label="地圖向右旋轉" title="向右旋轉 45 度（也可按 E 或滑鼠右鍵拖曳）">${ic.again}<span>右轉</span></button>
  <button data-camera="home" aria-label="回到全圖視角" title="回到全圖視角">全圖</button>
  <select id="map-district" aria-label="前往城市區域"><option value="all">選區域</option><option value="old">雲港舊城</option><option value="east">東城新區</option><option value="south">南城新區</option></select>
</div>
<aside id="side" class="panel" hidden></aside>
<aside id="event" class="panel" hidden></aside>
<div id="tut" class="panel" hidden></div>
<footer id="ticker" class="panel"><div class="lead"><i></i>快訊</div><div class="track"><div class="run" id="tk-run"></div></div></footer>
<div id="tags"></div>
<div id="toasts"></div>
<div class="mscrim" id="scrim" hidden></div>
<section id="report" class="panel modal" hidden aria-label="經營報表"></section>
<section id="sources" class="panel modal" hidden aria-label="數字來源"></section>
<div id="tip"></div>
<div id="over" hidden></div>
<div id="confirm" hidden></div>`;

  document.body.dataset.view = 'game';

  // ───────── 3D 城市 ─────────
  const city = createCity($('#stage'), { targetOffset: [1.6, 0, -0.15], time: 0 });
  await city.ready();
  const homeView = city.getView();
  $('#map-controls').addEventListener('click', (e) => {
    const b = e.target.closest('[data-camera]'); if (!b) return;
    if (b.dataset.camera === 'home') { city.setView(homeView); $('#map-district').value = 'all'; }
    else city.setView({ yaw: city.getView().yaw + (b.dataset.camera === 'left' ? 1 : -1) * Math.PI / 4 });
  });
  $('#map-district').addEventListener('change', (e) => {
    const views = { old: { x: 8, z: 6, dist: 31 }, east: { x: 20, z: 6, dist: 24 }, south: { x: 12, z: 14, dist: 31 } };
    city.setView(views[e.target.value] || homeView);
  });
  const map = city.getMapData();
  const bldXZ = Object.fromEntries(map.buildings.map((b) => [b.id, [b.x, b.z]]));
  const bldIds = map.buildings.filter((b) => ['住宅', '辦公', '學校', '捷運站', '商業'].includes(b.type)).map((b) => b.id);

  // 距離：引擎的人行道步行距離（格），sim 內部乘 metersPerTile（42 公尺）
  const distances = (() => {
    const d = {};
    for (const b of map.buildings) {
      d[b.id] = {};
      for (const l of map.lots) { const v = city.walkDistanceToLot([b.x, b.z], l.id); if (Number.isFinite(v)) d[b.id][l.id] = v; }
    }
    return d;
  })();

  // ───────── 遊戲狀態 ─────────
  let world = null;
  let meta = { cashHist: [] };
  let speed = 0, prevSpeed = 1, acc = 0, fastTarget = null, lastNow = performance.now();
  let panel = null, selLot = null, shopTab = 'today', modal = null, reportTab = 'all', reportMonth = 'current', srcFilter = '全部', srcQuery = '';
  let everSelected = false, played = false, tutOn = ls.get(TUT_KEY) !== '1';
  let shown = {}, carry = {}, pendingSpawns = [], lastWeather = null, lastLabelAt = 0;
  let hudDirty = true, labelDirty = true, overShown = false, closeConfirm = false, activeEventId = null;
  const toastQ = [];

  function newWorld(seed) {
    const w = S.createWorld({ mapData: map, distances, seed, playerName: COMPANY, multiBusiness: true });
    return w;
  }
  function tryLoad() {
    const raw = ls.get(SAVE_KEY);
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      const w = S.deserialize(o.w);
      S.expandMap(w, map, distances);
      meta = o.meta || { cashHist: [] };
      return w;
    } catch { return null; }
  }
  function save() {
    if (!world) return;
    ls.set(SAVE_KEY, JSON.stringify({ w: S.serialize(world), meta }));
  }
  function startFresh(seed) {
    world = newWorld(seed || (Date.now() % 1000000000));
    for (let i = 0; i < 9; i++) S.stepHour(world); // 開局從 09:00 開始，不讓玩家先看一段夜景（sim 本身從 00:00 起算）
    meta = { cashHist: [[S.getKpi(world).date.slice(0, 7), world.companies.player.cash]] };
    resetView();
    ls.del(SAVE_KEY);
    save();
  }
  function resetView() {
    for (const k of Object.keys(shown)) { city.setShop(k, null); city.setLabel(k, null); city.setQueue(k, 0); }
    shown = {}; carry = {}; pendingSpawns = [];
    panel = null; selLot = null; modal = null; closeConfirm = false; overShown = false; activeEventId = null;
    speed = 0; fastTarget = null; acc = 0; hudDirty = labelDirty = true;
    $('#over').hidden = true;
    everSelected = false; played = false;
  }

  world = tryLoad();
  if (world) { everSelected = true; played = true; if (world.t > 0) tutOn = false; }
  else startFresh(20261001);
  if (world.shops.some((s) => s.owner === 'player')) tutOn = false;

  // ───────── 同步 3D：店、標籤 ─────────
  function syncShops() {
    for (const l of S.getLots(world)) {
      const key = l.state === '空' ? '' : `${l.owner}|${l.name}`;
      if (shown[l.id] === key) continue;
      shown[l.id] = key;
      if (key) city.setShop(l.id, { owner: l.owner, name: l.name, businessId: l.businessId, color: l.color || (l.owner === 'player' ? PLAYER_COLOR : RIVAL_COLOR) });
      else { city.setShop(l.id, null); city.setLabel(l.id, null); city.setQueue(l.id, 0); }
    }
  }
  function updateLabels() {
    for (const s of getShops()) {
      let sub;
      if (s.status === 'renovating') sub = `裝修中，${Math.max(1, Math.ceil((s.openAtT - world.t) / 24))} 天後開張`;
      else if (s.owner === 'player') { const t = S.getShopToday(world, s.id); sub = `今天 ${int(t ? t.cups : 0)} ${unitOf(s)}`; }
      else { const r = S.getRivalInfo(world, s.id); sub = r && r.estDailyCups != null ? `日銷約 ${int(r.estDailyCups)} ${unitOf(s)}` : '營業中'; }
      city.setLabel(s.lotId, { title: `${bizOf(s).name}・${s.name}`, sub, tone: s.owner === 'player' ? 'green' : 'red' });
    }
    labelDirty = false;
  }

  // ───────── HUD ─────────
  function updateHud() {
    const k = S.getKpi(world);
    $('#h-cash').textContent = wan(k.cash);
    const net = $('#h-net'); net.textContent = wan(k.monthNetProfit, true);
    net.className = 'num ' + (k.monthNetProfit >= 0 ? 'up' : 'down');
    $('#h-share').textContent = pct(k.marketShare); $('#share-label').textContent = world.multiBusiness ? '全城營收市占' : '飲料杯數市占';
    const c = k.clock;
    $('#h-date').textContent = `${c.year} 年 ${c.month} 月 ${c.day} 日（${WEEK[c.dow]}）${String(Math.floor(c.hour)).padStart(2, '0')}:00`;
    $('#h-wx').innerHTML = WX[lastWeather || k.weather] || WX.sunny;
    $('#h-wx').title = WXN[lastWeather || k.weather] || '';
    $('#co-name').textContent = k.company;
    hudDirty = false;
  }
  function updateSpeedBtns() {
    $$('.speed button').forEach((b) => b.classList.toggle('on', b.dataset.sp != null && +b.dataset.sp === speed && fastTarget == null));
    $$('.speed [data-fast]').forEach((b) => b.classList.toggle('on', fastTarget != null && b.dataset.fast === fastTarget.period));
    const h = world.t % 24;
    $('#h-ff').hidden = !(speed > 0 && (h < V.time.openHour || h >= V.time.closeHour));
  }
  function updateDock() {
    const on = { shop: ['lot', 'shop', 'rival'].includes(panel), factory: panel === 'factory', warehouse: panel === 'warehouse', lab: panel === 'lab', ad: panel === 'ad', loan: panel === 'loan', report: modal === 'report', sources: modal === 'sources' };
    $$('#dock button[data-dk]').forEach((b) => b.classList.toggle('on', !!on[b.dataset.dk]));
  }
  function updateTicker() {
    const log = world.eventLog.slice(-8).reverse();
    const items = log.length ? log.map((e) => e.text) : ['創業之城開張，點地圖上的空店面開始'];
    const html = [0, 1].map(() => items.map((t) => `<span>${esc(t)}</span><em>◆</em>`).join('')).join('');
    const run = $('#tk-run');
    if (run.dataset.h !== html) { run.innerHTML = html; run.dataset.h = html; }
  }

  // ───────── 提示 ─────────
  function toast(msg, bad = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : '');
    el.textContent = msg;
    const box = $('#toasts'); box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 4200);
  }
  function confirmBox(msg, okLabel) {
    return new Promise((res) => {
      const el = $('#confirm');
      el.innerHTML = `<div class="box panel"><p>${msg}</p><div class="row"><button class="gbtn" data-r="0">取消</button><button class="gbtn danger" data-r="1">${okLabel}</button></div></div>`;
      el.hidden = false;
      el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; el.hidden = true; el.onclick = null; res(b.dataset.r === '1'); };
    });
  }

  // ───────── 新手提示 ─────────
  function updateTut() {
    const el = $('#tut');
    if (!tutOn) { el.hidden = true; return; }
    const hasShop = world.shops.some((s) => s.owner === 'player' && s.status !== 'closed');
    const step = !everSelected ? 1 : !hasShop ? 2 : !played ? 3 : 4;
    if (step === 4) { tutOn = false; ls.set(TUT_KEY, '1'); el.hidden = true; return; }
    const T = [
      ['點地圖上掛「招租」的空店面', '看租金、附近人口和對手，再決定開哪裡。'],
      ['按「租下開店」', '現金不夠，就先按「貸款」借青創貸款。'],
      ['按右上角的播放鍵', '裝修 28 天後開張，時間走得慢就按 4 倍速。'],
    ][step - 1];
    el.hidden = false;
    el.innerHTML = `<div class="steps">${[1, 2, 3].map((i) => `<i class="${i < step ? 'done' : i === step ? 'now' : ''}">${i < step ? '✓' : i}</i>`).join('')}</div><div><b>${T[0]}</b><small>${T[1]}</small></div><button class="skip" data-act="skipTut">略過</button>`;
  }

  // ───────── 側邊面板 ─────────
  const side = $('#side');
  const playerShopAt = (lotId) => getShops('player').find((s) => s.lotId === lotId);
  const zoneHtml = (z) => `<span class="zone">${ZONE_NAME[z] || z}</span>`;
  const starHtml = (v) => `<span class="stars sm" aria-label="${v} 顆星"><span class="bg">${icon.star.repeat(5)}</span><span class="fg" style="width:${(v / 5) * 100}%">${icon.star.repeat(5)}</span></span>`;
  const head = (title, sub) => `<div class="sd-head"><div><h3>${esc(title)}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}</div><button class="xbtn" data-act="close" aria-label="關閉">${icon.close}</button></div>`;

  function lotHtml() {
    const info = S.getLotInfo(world, selLot), biz = S.businessOf(selectedBusiness);
    info.openCost = S.lotOpenCost(world.lots.find((l) => l.id === selLot), selectedBusiness);
    const cash = world.companies.player.cash;
    const enough = cash >= info.openCost;
    const myCount = getShops('player').length;
    const ownerBusy = getShops('player').some((s) => s.ownerWorks);
    return `${head(`空店面 ${info.id}`, `${zoneHtml(info.zone)}<span class="num">${info.ping} 坪</span>`)}
<dl class="kv">
  <dt>月租（每坪 ${yuan(info.rentPerPing)}）</dt><dd class="num">${money(info.monthlyRent)}</dd>
  <dt>500 公尺內人口</dt><dd class="num">${int(info.pop500)} 人</dd>
  <dt>500 公尺內營業店</dt><dd class="num">${info.nearbyShops} 家</dd>
</dl>
<div class="sec"><h4>選擇創業業態</h4><div class="business-grid">${Object.entries(S.BUSINESSES).map(([id, b]) => `<button class="opt ${selectedBusiness === id ? 'on' : ''}" data-act="business:${id}"><b>${b.name}</b><small>${wan(S.lotOpenCost(world.lots.find((l) => l.id === selLot), id))} 起（含此店押金）</small></button>`).join('')}</div><p><b>${biz.model}</b>｜${biz.customer}</p><p class="note">${biz.tradeoff}</p><p class="note">所有業態開局可選。新業態的價格、成本、需求與產能是遊戲設計假設；可混合經營，也可專注同業態連鎖。</p></div>
${expansionEstimateHtml(!ownerBusy)}
<div class="kv-h">開店要花</div>
<dl class="kv">
  <dt>裝潢</dt><dd class="num">${wan(biz.renovation)}</dd>
  <dt>設備</dt><dd class="num">${wan(biz.equipment)}</dd>
  <dt>首批原料／商品／耗材</dt><dd class="num">${wan(biz.firstStock)}</dd>
  <dt>押金（${V.startup.depositMonths} 個月租金，關店退回）</dt><dd class="num">${wan(info.deposit)}</dd>
  <dt class="tl">合計</dt><dd class="num total">${wan(info.openCost)}</dd>
</dl>
<div class="field"><label>店名</label><input type="text" id="shop-name" maxlength="10" value="${esc(`${biz.name.replace('店', '')}${myCount + 1}店`)}"></div>
<label class="owner-choice"><input type="checkbox" id="open-owner" ${ownerBusy ? 'disabled' : 'checked'}>老闆自己顧店</label>
<p class="note">${ownerBusy ? '老闆已在另一家店工作。這家店先由員工經營。' : '每天工作 12 小時，替代每班一位員工。報表不另計老闆薪資，可在排班頁改回全聘員工。'}</p>
<p class="note ${enough ? '' : 'warn'}">${enough ? `簽約當天起算租金，裝修 ${V.startup.renovationDays} 天後開張。` : `你的現金 ${wan(cash)}，還差 ${wan(info.openCost - cash)}。可以到「貸款」借青創貸款。`}</p>
${enough ? '<button class="gbtn primary wide" data-act="rent">租下開店</button>' : '<button class="gbtn wide" data-act="gotoLoan">先去借款</button>'}`;
  }

  function expansionEstimateHtml(ownerWorks) {
    const estimate = S.getExpansionEstimate(world, selLot, { ownerWorks, businessId: selectedBusiness });
    return `<div class="sec" id="expansion-estimate"><h4>開店前評估</h4><dl class="kv"><dt>新店預估日銷</dt><dd>${int(estimate.newDaily)} ${estimate.unit}</dd><dt>原分店被分走</dt><dd>${int(estimate.lostDaily)} ${estimate.unit}／天</dd><dt>品牌淨增銷量</dt><dd>${int(estimate.netNewDaily)} ${estimate.unit}／天</dd><dt>品牌每月增量獲利</dt><dd class="${estimate.incrementalProfit < 0 ? 'down' : 'up'}">${money(estimate.incrementalProfit, true)}</dd><dt>開店投入回收</dt><dd>${estimate.paybackMonths == null ? '尚無法回收' : '約 ' + estimate.paybackMonths.toFixed(1) + ' 個月'}</dd></dl><p class="note">${esc(world.lots.find((l) => l.id === selLot).district || '雲港舊城')}。按參考售價、標準品質、${S.businessOf(selectedBusiness).staff.map((n) => n + "人").join("／")}班表與${ownerWorks ? '老闆顧店' : '全聘員工'}估算成熟客源典型日，已扣分店互搶客源與新增管理費；新業態已計班表、座位／工作站與預設備貨限制；按日均估算折扣，未計裝修空窗、排隊波動、後勤折扣與對手反擊。${estimate.incrementalProfit < 0 ? '目前條件下擴張會增加虧損。' : ''}</p></div>`;
  }

  function costOfItem(s, k) {
    const g = V.menu.grades[s.grade];
    const milk = k === '鮮奶茶' ? world.milkPct / 100 : 1;
    const material = world.companies.player.expansion.projects.recipe ? 0.94 : 1;
    const b = bizOf(s);
    return b.items[k].cost * g.cost * milk * (b.warehouse ? material : 1) + b.packaging;
  }

  function todayHtml(s) {
    if (s.status === 'renovating') {
      const d = Math.max(1, Math.ceil((s.openAtT - world.t) / 24));
      return `<p class="note warn">裝修中，還有 ${d} 天開張。租金已經在算，趁現在調好價格和班表。</p>`;
    }
    const t = S.getShopToday(world, s.id);
    const h = S.getShopHistory(world, s.id);
    const hr = Math.floor(world.t % 24);
    const maxv = Math.max(8, ...t.hourly.map((x) => x.walk + x.delivery));
    const W = 300, H = 112, L = 4, B = 16, ih = H - B - 6, bw = (W - L * 2) / t.hourly.length;
    let g = '';
    t.hourly.forEach((x, i) => {
      const cx = L + i * bw + bw / 2, w = 17;
      const hw = (x.walk / maxv) * ih, hd = (x.delivery / maxv) * ih;
      if (hw > 0) g += `<rect x="${cx - w / 2}" y="${H - B - hw}" width="${w}" height="${hw}" fill="#3987e5" rx="2"/>`;
      if (hd > 0) g += `<rect x="${cx - w / 2}" y="${H - B - hw - hd - (hw > 0 ? 1 : 0)}" width="${w}" height="${hd}" fill="#d95926" rx="2"/>`;
      if (x.hour === hr) g += `<rect x="${cx - w / 2 - 2}" y="2" width="${w + 4}" height="${H - B - 2}" fill="none" stroke="rgba(255,255,255,.35)" rx="4"/>`;
      g += `<text x="${cx}" y="${H - 3}" text-anchor="middle" class="num">${x.hour}</text>`;
    });
    return `<div class="mt">
  <div><label>今天成交（${unitOf(s)}）</label><b class="num">${int(t.cups)}</b></div>
  <div><label>目前排隊</label><b class="num">${int(t.queue)} 人</b></div>
  <div><label>等候時間</label><b class="num ${t.waitMin >= 12 ? 'bad' : ''}">${t.waitMin.toFixed(1)} 分</b></div>
  <div><label>流失客人</label><b class="num ${t.lost > 0 ? 'bad' : ''}">${int(t.lost)} 人</b></div></div>
<div class="legend sm"><span><i style="background:#3987e5"></i>門市</span><span><i style="background:#d95926"></i>外送</span><span style="margin-left:auto;color:var(--muted)">每小時成交（${unitOf(s)}）</span></div>
<div class="hbars"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="今天每小時成交（${unitOf(s)}）">${g}</svg></div>
<dl class="kv"><dt>今天營收</dt><dd class="num">${money(t.revenue)}</dd><dt>本月至今淨利</dt><dd class="num ${h.mtdPnL.profit >= 0 ? '' : 'bad'}" style="${h.mtdPnL.profit < 0 ? 'color:var(--bad)' : ''}">${money(h.mtdPnL.profit, true)}</dd></dl>
${operationsSummaryHtml(s, t)}
${s.shortage ? '<p class="note warn">有人離職，最忙的班少一人。</p>' : ''}`;
  }

  function operationsSummaryHtml(s, t) {
    if (['bento', 'bakery'].includes(s.businessId)) return `<dl class="kv"><dt>今日已備／目前剩餘</dt><dd>${int(t.prepared)}／${int(s.stock.qty)} ${unitOf(s)}</dd><dt>今日報廢</dt><dd>${int(t.unsold)} ${unitOf(s)}，${money(t.waste)}</dd><dt>缺貨流失</dt><dd>${int(t.stockLost)} 筆</dd></dl>`;
    if (s.businessId === 'convenience') return `<dl class="kv"><dt>目前商品庫存（成本）</dt><dd>${money(s.inventory)}</dd><dt>缺貨流失</dt><dd>${int(t.stockLost)} 筆</dd></dl>`;
    return '';
  }

  function operationsHtml(s) {
    const b = bizOf(s), op = s.operations, analysis = S.getShopAnalysis(world, s.id);
    const opts = (key, choices) => choices.map(([value, name, note]) => `<button class="opt ${String(op[key]) === String(value) ? 'on' : ''}" data-act="operation:${key}:${value}"><b>${name}</b><small>${note}</small></button>`).join('');
    let controls = '';
    if (s.businessId === 'cafe') controls = `<p>此店有 ${op.seats} 個座位，內用平均占用 50 分鐘。座位由坪數決定，切換模式不另收建置費。</p>${opts('mode', [['takeaway', '外帶優先', '約 15% 內用，體驗分數 −3，座位限制較小'], ['balanced', '內外帶並重', '約 55% 內用，體驗分數不變'], ['dinein', '內用體驗', '約 85% 內用，體驗分數 +4，尖峰受座位周轉限制']])}`;
    else if (['bento', 'bakery'].includes(s.businessId)) controls = `<p>每天 10 點先付款備貨，一天只做一批，22 點後剩餘商品全數報廢。備貨與折扣調整不另收費；已備的數量不會變更。</p><label class="field">每日備貨（${b.unit}）<input type="number" min="40" max="600" step="20" value="${op.prep}" data-operation-input="prep"></label><button class="gbtn wide" data-act="operationApply:prep">設定下次備貨量</button><h4>18 點後清庫存</h4>${opts('markdown', (s.businessId === 'bento' ? [0, 15, 30] : [0, 20, 35]).map((n) => [String(n), n ? `降價 ${n}%` : '維持原價', '門市與外送同步折扣，降低每份收入']))}${operationsSummaryHtml(s, S.getShopToday(world, s.id))}`;
    else if (s.businessId === 'convenience') controls = `<p>商品售出才列成本，進貨先付現金。每日開門前補至目標，買不起時只補可負擔的量。關店時剩餘商品成本五折回收。</p><label class="field">目標商品庫存（元）<input type="number" min="20000" max="300000" step="10000" value="${op.stockTarget}" data-operation-input="stockTarget"></label><button class="gbtn wide" data-act="operationApply:stockTarget">設定目標庫存</button><div class="sw"><span>每日自動補貨</span><button class="tg ${op.autoStock ? 'on' : ''}" data-act="operation:autoStock" aria-label="每日自動補貨" aria-pressed="${op.autoStock}"></button></div><button class="gbtn wide" data-act="restock">現在補貨至目標</button>${operationsSummaryHtml(s, S.getShopToday(world, s.id))}`;
    else if (s.businessId === 'salon') controls = `<p>此店有 ${op.stations} 個工作站，技術人員時薪是一般員工的 1.5 倍。服務時間是全店平均值；熟客的店家記憶衰退速度減半。切換服務模式不另收費。</p>${opts('service', [['quick', '快速服務', '平均 35 分鐘／人，體驗分數 −6'], ['standard', '標準服務', '平均 55 分鐘／人，體驗分數不變'], ['premium', '精緻服務', '平均 80 分鐘／人，體驗分數 +6']])}`;
    else controls = '<p>現點現做，主要決策在售價、原料等級、外送與尖峰排班。先看每小時成交量，再調整各班人數；同業態擴店會分走原分店客源。</p>';
    return `<h4>${b.model}</h4><p>${b.customer}</p><p class="note">${b.tradeoff}</p>${controls}<dl class="kv"><dt>目前每日供給上限</dt><dd>${int(analysis.capacityDaily)} ${b.unit}</dd><dt>每月固定成本</dt><dd>${money(analysis.fixedMonthly)}</dd><dt>門店損平需求</dt><dd>${analysis.breakEvenDaily == null ? '先累積成交資料' : int(analysis.breakEvenDaily) + ' ' + b.unit + '／天'}</dd></dl><p class="note">產能是供給上限，實際成交受客群、價格、口碑、排隊與庫存限制。新業態參數是遊戲設計假設。</p>`;
  }

  function menuHtml(s) {
    const rows = Object.keys(bizOf(s).items).map((k) => {
      const ref = bizOf(s).items[k].ref, { min: lo, max: hi, step } = S.priceBounds(s.businessId, k), p = s.prices[k];
      const cost = costOfItem(s, k);
      return `<div class="pr"><span class="nm">${k}</span><input type="range" min="${lo}" max="${hi}" step="${step}" value="${p}" data-price="${k}" style="--p:${((p - lo) / (hi - lo)) * 100}%" aria-label="${k} 售價"><b class="num" id="pp-${k}">$${p}</b>
        <span class="sm num" id="pm-${k}">成本約 $${cost.toFixed(1)}，毛利 ${pct((p - cost) / p, 0)}・參考價 $${ref}</span></div>`;
    }).join('');
    const mk = s.markupPct;
    return `${rows}${bizOf(s).delivery ? `<div class="sec"><div class="pr"><span class="nm">外送加價</span><input type="range" min="0" max="${V.delivery.markupMax}" step="1" value="${mk}" data-markup="1" style="--p:${(mk / V.delivery.markupMax) * 100}%" aria-label="平台加價率"><b class="num" id="pp-mk">${mk}%</b></div>
<p class="note">平台上的售價比門市高，用來補平台抽成（目前抽 ${V.delivery.commission}%）。加太多客人會變少。</p></div>` : '<p class="note">此業態僅提供門市商品或服務。</p>'}`;
  }

  function staffHtml(s) {
    const SH = V.capacity.shifts;
    const rows = SH.map(([a, b], i) => `<div class="stp"><span>${a}–${b} 點</span><span class="ctl"><button data-act="staff:${i}:-1" ${s.staff[i] <= V.capacity.staffMin ? 'disabled' : ''} aria-label="減一人">−</button><b class="num">${s.staff[i]}</b><button data-act="staff:${i}:1" ${s.staff[i] >= V.capacity.staffMax ? 'disabled' : ''} aria-label="加一人">+</button><span style="color:var(--muted);font-size:12px">人</span></span></div>`).join('');
    const hours = s.staff.reduce((a, n, i) => a + (n - (s.ownerWorks ? 1 : 0)) * (SH[i][1] - SH[i][0]), 0);
    const wage = Math.round(world.wages[s.wageLevel] * bizOf(s).wageMult);
    const monthly = hours * 30 * wage * (1 + V.labor.employerPct / 100);
    const opts = ['basic', 'market', 'high'].map((l) => `<button class="opt ${s.wageLevel === l ? 'on' : ''}" data-act="wage:${l}"><b><span>${WAGE[l]}時薪</span><span class="num">$${Math.round(world.wages[l] * bizOf(s).wageMult)}／時</span></b><small>品質 ${V.labor.qualityAdj[l] >= 0 ? '+' : '−'}${Math.abs(V.labor.qualityAdj[l])}${l === 'basic' ? '，招不到人，容易有人離職' : ''}</small></button>`).join('');
    return `<div class="sw"><span>老闆自己顧店</span><button class="tg ${s.ownerWorks ? 'on' : ''}" data-act="ownerWork" aria-label="老闆自己顧店" aria-pressed="${s.ownerWorks}"></button></div><p class="note">${s.ownerWorks ? '班表人數含老闆。老闆每天工作 12 小時，每班少支薪一人，報表不另計老闆薪資。' : '班表人數全部是支薪員工。老闆可以選一家店親自顧店。'}</p>${rows}<p class="note">每月人力成本約 <b class="num">${money(monthly)}</b>（${hours} 支薪人時／天，含勞健保與勞退）。人手不夠就會排隊、流失客人。</p><div class="kv-h" style="margin-top:14px">時薪等級</div>${opts}`;
  }

  function settingHtml(s) {
    const gr = Object.entries(V.menu.grades).map(([k, g]) => `<button class="opt ${s.grade === k ? 'on' : ''}" data-act="grade:${k}"><b><span>${k}品質</span><span class="num">品質 ${g.quality}</span></b><small>成本 ×${g.cost.toFixed(2)}${k === '平價' ? '，便宜但口碑吃虧' : k === '講究' ? '，貴但客人記得住' : ''}</small></button>`).join('');
    const raw = world.shops.find((x) => x.id === s.id);
    const promoUsed = raw && raw.promoUsed;
    const biz = bizOf(s), refund = s.deposit + Math.round(biz.equipment * V.startup.equipmentRecovery);
    return `<div class="kv-h" style="margin-top:0">品質等級</div>${gr}
${biz.delivery ? `<div class="sw"><span>上外送平台</span><button class="tg ${s.delivery ? 'on' : ''}" data-act="deliv" aria-label="外送開關" aria-pressed="${s.delivery}"></button></div>
<p class="note">抽成 ${V.delivery.commission}%，外送客人看平台上的星等和價格。</p>` : ''}
<div class="sec"><h4>開幕半價體驗</h4><p class="note">開店前 ${V.awareness.openingPromoDays} 天，門市半價體驗，快速累積熟悉度。每家店只能用一次。</p>
<button class="gbtn wide" data-act="promo" ${promoUsed ? 'disabled' : ''}>${promoUsed ? '已經用過' : s.status === 'renovating' ? '預約，開張當天開始' : '現在開始'}</button></div>
<div class="sec"><h4>關店</h4><p class="note">退回押金 ${money(s.deposit)}，設備回收 ${wan(Math.round(biz.equipment * V.startup.equipmentRecovery))}（裝潢拿不回來）。便利商店剩餘商品以成本五折回收，其餘剩餘存貨報廢。</p>
<button class="gbtn danger wide" data-act="closeShop">關店並退租（共退 ${money(refund)}）</button></div>`;
  }

  function shopHtml() {
    const s = playerShopAt(selLot);
    if (!s) return '';
    const st = s.status === 'renovating' ? '<span class="zone s-reno">裝修中</span>' : '<span class="zone s-open">營業中</span>';
    const lot = world.lots.find((l) => l.id === s.lotId);
    const tabs = [['today', '今天'], ['op', '經營'], ['menu', '產品'], ['staff', '排班'], ['set', '設定']];
    const body = { today: todayHtml, op: operationsHtml, menu: menuHtml, staff: staffHtml, set: settingHtml }[shopTab](s);
    return `${head(s.name, `${st}<span class="zone">${bizOf(s).name}</span>${zoneHtml(lot.zone)}${starHtml(s.star)}<span class="num" style="font-size:12px;margin-left:4px">${s.star.toFixed(1)}（${int(s.reviews)}）</span>`)}
<div class="mini-tabs">${tabs.map(([k, n]) => `<button class="${shopTab === k ? 'on' : ''}" data-act="tab:${k}">${n}</button>`).join('')}</div>
<div id="sd-body">${body}</div>`;
  }

  function rivalHtml() {
    const sh = getShops('rival').find((x) => x.lotId === selLot);
    if (!sh) return '';
    const r = S.getRivalInfo(world, sh.id);
    const mine = getShops('player').find((x) => x.status !== 'closed' && x.businessId === sh.businessId);
    const lot = world.lots.find((l) => l.id === sh.lotId);
    const rows = Object.keys(bizOf(sh).items).map((k) => `<tr><td>${k}</td><td class="num">$${r.prices[k]}</td><td class="num">${mine ? `$${mine.prices[k]}` : '—'}</td></tr>`).join('');
    return `${head(r.name, `<span class="zone" style="background:rgba(224,73,63,.18);color:#ff9b94">對手</span>${zoneHtml(lot.zone)}${starHtml(r.star)}<span class="num" style="font-size:12px;margin-left:4px">${r.star.toFixed(1)}（${int(r.reviews)}）</span>`)}
<dl class="kv"><dt>預估日銷</dt><dd class="num">${r.estDailyCups != null ? `約 ${int(r.estDailyCups)} ${unitOf(sh)}` : '還沒開張'}</dd><dt>有上外送平台</dt><dd>${r.delivery ? '有' : '沒有'}</dd></dl>
<p class="note">日銷是從門口人潮估的，會差一兩成。</p>
<table class="pt"><thead><tr><th>品項</th><th>對手售價</th><th>你的售價</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function loanRow(kind, name, max) {
    const co = world.companies.player;
    const used = co.loans.filter((l) => l.kind === kind).reduce((a, l) => a + l.balance, 0);
    const room = max - used;
    if (room < V.loan.unit) return `<div class="sec"><h4>${name}</h4><p class="note">額度 ${wan(max)}，已經借滿。</p></div>`;
    const lo = V.loan.unit, step = V.loan.unit;
    const def = Math.min(room, kind === 'start' ? 2000000 : 1000000);
    return `<div class="sec"><h4>${name}</h4><p class="note">額度 ${wan(max)}，已用 ${wan(used)}，還能借 ${wan(room)}。</p>
<div class="pr" style="grid-template-columns:1fr 70px"><input type="range" min="${lo}" max="${room}" step="${step}" value="${def}" data-loan="${kind}" style="--p:${((def - lo) / (room - lo || 1)) * 100}%" aria-label="${name}金額"><b class="num" id="ln-${kind}" style="width:70px">${wan(def)}</b></div>
<p class="note" id="lp-${kind}">每月還 ${yuan(S.annuityPayment(def))}，${V.loan.termMonths / 12} 年還完，年利率 ${(V.loan.rate * 100).toFixed(1)}%。</p>
<button class="gbtn primary wide" data-act="loan:${kind}">借款</button></div>`;
  }
  function loanHtml() {
    const co = world.companies.player;
    const list = co.loans.length ? `<div class="kv-h">目前的貸款</div><table class="pt"><thead><tr><th>種類</th><th>餘額</th><th>月付</th><th>剩餘</th></tr></thead><tbody>${co.loans.filter((l) => l.balance > 0).map((l) => `<tr><td>${l.kind === 'start' ? '開辦' : '週轉'}</td><td class="num">${wan(l.balance)}</td><td class="num">${yuan(l.payment)}</td><td class="num">${l.left} 個月</td></tr>`).join('')}</tbody></table>` : '';
    const repayments = co.loans.map((l) => `<div class="sec"><h4>提前還款・${l.kind === 'start' ? '開辦' : '週轉'}貸款</h4><label class="field">還本金（元）<input type="number" min="1" max="${l.balance}" step="1" value="${Math.min(l.balance, 100000)}" data-repay-input="${l.id}" aria-label="提前還款金額"></label><p class="note" data-repay-preview="${l.id}"></p><button class="gbtn wide" data-act="repay:${l.id}">提前還本金</button><button class="gbtn wide" data-act="repayAll:${l.id}" ${co.cash < l.balance ? 'disabled' : ''}>全部清償 ${money(l.balance)}</button></div>`).join('');
    return `${head('青創貸款', `年利率 ${(V.loan.rate * 100).toFixed(1)}%，${V.loan.termMonths / 12} 年本息平均攤還`)}
<p class="note">開局現金 ${wan(V.startup.startCash)}，開店與後勤都會占用資金。月結現金為負時，系統會自動動用週轉額度，用完還是負的就破產。</p>
${loanRow('start', '開辦貸款', V.loan.startMax)}${loanRow('working', '週轉貸款', V.loan.workingMax)}${list}${repayments}<p class="note">提前還款不收手續費，本金不列損益費用。剩餘期限不變，月付重新計算；已經過的天數仍計利息，月底支付。清償後借款額度恢復。</p>`;
  }

  function adHtml() {
    const co = world.companies.player;
    const ad = co.adWan || 0;
    const lo = V.awareness.socialMinWan, hi = V.awareness.socialMaxWan;
    const inf = V.awareness.influencer.map((t, i) => `<button class="opt" data-act="inf:${i + 1}"><b><span>${['小網紅', '中型網紅', '大網紅'][i]}合作</span><span class="num">${wan(t.cost)}</span></b><small>知名度 +${t.aware.toFixed(2)}，${pct(t.viral, 0)} 機率爆紅（${V.events.viralDays} 天客人 ×${V.events.viralMult}）</small></button>`).join('');
    const offer = world.events.list.some((e) => e.kind === 'platform');
    return `${head('廣告', `知名度 ${pct(co.awareness, 0)}`)}
<div class="sec" style="border:0;margin-top:0;padding-top:0"><h4>社群廣告（每月）</h4><p class="note">每月固定花，讓更多人知道你的店。${ad ? `目前每月 ${wan(ad * 10000)}。` : '目前沒有投放。'}</p>
<div class="pr" style="grid-template-columns:1fr 70px"><input type="range" min="${lo}" max="${hi}" step="1" value="${ad || lo}" data-ad="1" style="--p:${(((ad || lo) - lo) / (hi - lo)) * 100}%" aria-label="社群廣告月預算"><b class="num" id="ad-v" style="width:70px">${wan((ad || lo) * 10000)}</b></div>
<div style="display:flex;gap:8px;margin-top:8px"><button class="gbtn primary" style="flex:1" data-act="adSet">${ad ? '調整' : '開始投放'}</button><button class="gbtn" data-act="adOff" ${ad ? '' : 'disabled'}>停止</button></div></div>
<div class="sec"><h4>網紅合作（一次性）</h4>${inf}</div>
${offer ? `<div class="sec"><h4>外送平台曝光方案</h4><div class="sw" style="margin-top:6px"><span>付費加入（抽成 +${V.delivery.boostCommissionAdd} 點）</span><button class="tg ${co.platformBoost ? 'on' : ''}" data-act="plat" aria-label="平台曝光方案" aria-pressed="${!!co.platformBoost}"></button></div></div>` : ''}`;
  }

  function renderSide() {
    if (!panel) { side.hidden = true; updateDock(); return; }
    side.hidden = false;
    side.innerHTML = { lot: lotHtml, shop: shopHtml, rival: rivalHtml, loan: loanHtml, ad: adHtml, warehouse: () => facilityHtml('warehouse'), factory: () => facilityHtml('factory'), lab: () => facilityHtml('lab') }[panel]();
    $$('[data-repay-input]', side).forEach(updateRepayPreview);
    updateDock();
  }
  function openPanel(kind, lotId) {
    if (modal) closeModal();
    panel = kind; if (lotId !== undefined) selLot = lotId;
    renderSide();
  }
  function closePanel() { panel = null; selLot = null; renderSide(); }
  function updateRepayPreview(input) {
    const co = world.companies.player, l = co.loans.find((x) => x.id === input.dataset.repayInput), amount = +input.value;
    if (!l) return;
    $(`[data-repay-preview="${l.id}"]`, side).textContent = amount > 0 && amount <= Math.min(l.balance, co.cash) ? `還款後現金 ${money(co.cash - amount)}，剩餘本金 ${money(l.balance - amount)}，月付 ${money(amount === l.balance ? 0 : S.annuityPayment(l.balance - amount, V.loan.rate, l.left))}。月利息約少 ${money(amount * V.loan.rate / 12)}。` : '金額須在可用現金與剩餘本金以內。';
  }
  function facilityHtml(key) {
    const data = S.getFacilities(world), f = data.facilities.find((f) => f.key === key), co = world.companies.player;
    const status = { none: '尚未建置', building: '施工中', ready: f.active ? '營運中' : '暫停中' }[f.status];
    let body = `<dl class="kv"><dt>建置費</dt><dd>${money(f.cost)}</dd><dt>工期</dt><dd>${f.days} 天</dd><dt>營運固定費</dt><dd>${money(V.expansion.facilities[key].monthly)}／月</dd>${key !== 'warehouse' ? `<dt>暫停固定費</dt><dd>${money(f.standby)}／月</dd>` : ''}</dl>`;
    if (key !== 'lab') body += `<p class="note">${key === 'warehouse' ? '飲料、咖啡、便當與烘焙店集中採購原料便宜 6%，包材不打折。便利商店與髮廊不適用。原料先付款、2 天後到貨，耗用才列成本；容量按原價額度計，最多 80 萬元。店內首批庫存先用完才領中央原料。' : '每天最多替飲料、咖啡、便當與烘焙店備料 800 份，覆蓋的原料成本少 15%。超額或停產時，各店改自行備料；仍需原班表人力。便利商店與髮廊不使用中央採購或備料。共用批次異常會影響使用備料的分店。'}</p><dl class="kv"><dt>預估每月原料節省</dt><dd>${f.grossSaving == null ? '尚無銷售資料' : money(f.grossSaving)}</dd><dt>扣營運費後效益</dt><dd class="${f.netSaving < 0 ? 'down' : 'up'}">${f.netSaving == null ? '—' : money(f.netSaving, true)}</dd><dt>負擔固定費的規模</dt><dd>${f.breakEvenDaily == null ? '—' : int(f.breakEvenDaily) + ' 份／天'}</dd></dl><p class="note">按可使用後勤的業態之最近月帳銷量與原料組合估算單項效益，假設全月營運且供料充足；便當與烘焙備貨含未售報廢；未計建置回收、折舊與研發收益。${key === 'factory' && f.breakEvenDaily > f.cupsDaily ? '目前每份節省太少，即使滿載仍不足負擔固定費。' : ''}${f.netSaving < 0 ? '目前規模下，這項投資會增加固定費負擔。' : ''}</p>`;
    if (f.status === 'none') body += `<button class="gbtn primary wide" data-act="facilityBuild:${key}" ${co.cash < f.cost ? 'disabled' : ''}>建置${f.name} ${money(f.cost)}</button>${co.cash < f.cost ? '<p class="note warn">現金不足。</p>' : ''}`;
    else if (f.status === 'building') body += `<p class="note warn">還有 ${f.daysLeft} 天完工，完工後開始按天累計固定費。</p>`;
    else {
      if (key !== 'warehouse') body += `<div class="sw"><span>${f.active ? '暫停營運' : '恢復營運'}</span><button class="tg ${f.active ? 'on' : ''}" data-act="facilityActive:${key}" aria-label="設施營運開關" aria-pressed="${f.active}"></button></div>`;
      if (key === 'warehouse') body += `<div class="sec"><h4>原料庫存</h4><dl class="kv"><dt>可供料原價額度</dt><dd>${money(f.stockValue)}</dd><dt>庫存帳面成本</dt><dd>${money(f.stockCost)}</dd><dt>在途原價額度</dt><dd>${money(f.orders.reduce((a, o) => a + o.value, 0))}</dd></dl>${f.orders.map((o) => `<p class="note">${money(o.value)} 原料，${Math.max(0, Math.ceil((o.arriveT - world.t) / 24))} 天後到貨。</p>`).join('')}<label class="field">進貨原價額度（元）<input type="number" id="stock-order" min="10000" max="800000" step="10000" value="100000"></label><button class="gbtn wide" data-act="stockOrder">進貨（按原價 94 折付款）</button><div class="sw"><span>自動補貨</span><button class="tg ${f.auto ? 'on' : ''}" data-act="stockAuto" aria-label="自動補貨" aria-pressed="${f.auto}"></button></div><label class="field">備貨目標（原價元）<input type="number" id="stock-target" min="20000" max="800000" step="10000" value="${f.target}"></label><button class="gbtn wide" data-act="stockTarget">設定備貨目標</button><p class="note">可用與在途總額低於目標一半時補貨。先付款會占用資金；不足時只買負擔得起的批量，門店缺中央原料會改現購。備貨會占用月底支付薪資與租金的現金。</p></div>`;
      if (key === 'factory') body += `<dl class="kv"><dt>今日剩餘供料產能</dt><dd>${int(data.factoryLeft)} 份</dd><dt>本月供料</dt><dd>${int(co.cm.factoryCups)} 份</dd><dt>本月原料已省</dt><dd>${money(co.cm.factorySavings)}</dd></dl>${data.batchDaysLeft ? `<p class="note warn">回收檢查中，還有 ${data.batchDaysLeft} 天恢復中央供料。</p>` : ''}`;
      if (key === 'lab') body += `<div class="sec"><h4>研發專案</h4><p class="note">費用於啟動時列支，完成成果全品牌共用。每次一案；暫停時進度保留，關閉時取消進行中的專案，已支出研發費不退。</p>${data.research ? `<p class="note warn">${esc(V.expansion.projects[data.research.key].name)}：剩 ${data.research.remainingDays} 天${!f.active ? '（已暫停）' : ''}。</p>` : ''}${data.projects.map((p) => `<div class="research-project"><b>${p.name}</b><p>${p.note}</p><small>${money(p.cost)}・${p.days} 天</small><button class="gbtn wide" data-act="research:${p.key}" ${p.done || data.research || !f.active || co.cash < p.cost ? 'disabled' : ''}>${p.done ? '已完成，全店適用' : data.research?.key === p.key ? '研發中' : '開始研發'}</button></div>`).join('')}</div>`;
    }
    if (f.status !== 'none') body += `<div class="sec"><button class="gbtn danger wide" data-act="facilityClose:${key}">${f.status === 'building' ? '取消建置' : '關閉設施'}</button><p class="note">施工取消回收建置費 50%；完工後關閉回收 20%。庫存按帳面成本 80% 回收，剩餘列報廢；在途付款全退。</p></div>`;
    return `${head(f.name, status)}<p class="note">開局即可建置，沒有店數或獲利門檻。位於市外，不占門店。以下費用與效益都是遊戲設計值。</p>${body}`;
  }
  function selectLot(id) {
    const l = S.getLots(world).find((x) => x.id === id);
    if (!l) return;
    everSelected = true;
    selLot = id;
    if (l.state === '空') { shopTab = 'today'; openPanel('lot', id); }
    else if (l.state === '玩家') { if (panel !== 'shop') shopTab = 'today'; openPanel('shop', id); }
    else openPanel('rival', id);
    city.focusLot(id, 9);
    updateTut();
  }
  city.onPick(({ type, id }) => { if (type === 'lot') selectLot(id); });

  // 側邊面板事件
  side.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const [act, a1, a2] = b.dataset.act.split(':');
    const sh = panel === 'shop' ? playerShopAt(selLot) : null;
    const res = (r) => { if (!r.ok) toast(r.reason, true); return r.ok; };
    if (act === 'close') closePanel();
    else if (act === 'gotoLoan') openPanel('loan');
    else if (act === 'business') { selectedBusiness = a1; renderSide(); }
    else if (act === 'operation' && sh) { const val = a1 === 'autoStock' ? !sh.operations.autoStock : a1 === 'markdown' ? +a2 : a2; if (res(S.setOperations(world, sh.id, { [a1]: val }))) { renderSide(); save(); } }
    else if (act === 'operationApply' && sh) { if (res(S.setOperations(world, sh.id, { [a1]: +$(`[data-operation-input="${a1}"]`).value }))) { renderSide(); save(); } }
    else if (act === 'restock' && sh) { if (res(S.restockShop(world, sh.id))) { renderSide(); updateHud(); save(); } }
    else if (act === 'rent') {
      const name = ($('#shop-name') || {}).value || '半糖日常';
      const r = S.openShop(world, selLot, { name: name.trim().slice(0, 10) || '半糖日常', color: S.businessOf(selectedBusiness).color, businessId: selectedBusiness, ownerWorks: !!$('#open-owner')?.checked });
      if (res(r)) { toast(`租下了，簽約當天起算租金，${V.startup.renovationDays} 天後開張。`); syncShops(); labelDirty = hudDirty = true; shopTab = 'today'; openPanel('shop', selLot); updateTut(); save(); }
    } else if (act === 'tab') { shopTab = a1; renderSide(); }
    else if (act === 'staff' && sh) { const st = [...sh.staff]; st[+a1] += +a2; if (res(S.setStaffing(world, sh.id, st))) renderSide(); }
    else if (act === 'ownerWork' && sh) { if (res(S.setOwnerWorks(world, sh.id, !sh.ownerWorks))) { renderSide(); save(); } }
    else if (act === 'wage' && sh) { if (res(S.setWageLevel(world, sh.id, a1))) renderSide(); }
    else if (act === 'grade' && sh) { if (res(S.setGrade(world, sh.id, a1))) renderSide(); }
    else if (act === 'deliv' && sh) { if (res(S.setDelivery(world, sh.id, !sh.delivery))) renderSide(); }
    else if (act === 'promo' && sh) { const r = S.startOpeningPromo(world, sh.id); if (res(r)) { toast(r.startsOnOpening ? '開張當天開始半價體驗。' : '開幕半價體驗開始了。'); renderSide(); } }
    else if (act === 'closeShop' && sh) {
      const ok = await confirmBox(`確定關掉「${esc(sh.name)}」？裝潢拿不回來，已經累積的熟悉度也會歸零。`, '關店');
      if (ok) { const r = S.closeShop(world, sh.id); if (res(r)) { toast(`已關店，退回 ${money(r.refund + r.equipment + (r.stockRecovery || 0))}。`); syncShops(); labelDirty = hudDirty = true; openPanel('lot', selLot); save(); } }
    } else if (act === 'loan') {
      const inp = $(`[data-loan="${a1}"]`); const amt = +inp.value;
      if (res(S.takeLoan(world, a1, amt))) { toast(`借到 ${wan(amt)}，每月還 ${yuan(S.annuityPayment(amt))}。`); hudDirty = true; renderSide(); updateHud(); save(); }
    } else if (act === 'adSet') { if (res(S.setSocialAd(world, +$('[data-ad]').value))) { toast('社群廣告已設定，從下個月起每月扣款。'); renderSide(); save(); } }
    else if (act === 'adOff') { if (res(S.setSocialAd(world, 0))) { renderSide(); save(); } }
    else if (act === 'inf') { const r = S.hireInfluencer(world, +a1); if (res(r)) { toast(r.viral ? '合作成功，還爆紅了！' : '合作完成，知名度提高了。'); hudDirty = true; renderSide(); save(); } }
    else if (act === 'plat') { if (res(S.setPlatformBoost(world, !world.companies.player.platformBoost))) renderSide(); }
    else if (act === 'repay' || act === 'repayAll') {
      const l = world.companies.player.loans.find((l) => l.id === a1);
      const amount = act === 'repayAll' ? l.balance : +$(`[data-repay-input="${a1}"]`).value;
      if (res(S.repayLoan(world, a1, amount))) { toast(`已還本金 ${money(amount)}。`); renderSide(); updateHud(); save(); }
    } else {
      let r;
      if (act === 'facilityBuild') r = S.buildFacility(world, a1);
      else if (act === 'facilityActive') r = S.setFacilityActive(world, a1, !world.companies.player.expansion.facilities[a1].active);
      else if (act === 'stockOrder') r = S.orderWarehouseStock(world, +$('#stock-order').value);
      else if (act === 'stockAuto' || act === 'stockTarget') { const f = world.companies.player.expansion.facilities.warehouse; r = S.setWarehouseAuto(world, act === 'stockAuto' ? !f.auto : f.auto, +$('#stock-target').value); }
      else if (act === 'research') r = S.startResearch(world, a1);
      else if (act === 'facilityClose' && await confirmBox('確定關閉？建置費僅部分回收，庫存折價；關閉研發室會取消進行中的專案。', '關閉設施')) r = S.closeFacility(world, a1);
      if (r && res(r)) { renderSide(); updateHud(); save(); }
    }
  });
  side.addEventListener('input', (e) => {
    const r = e.target;
    if (r.dataset.repayInput) { updateRepayPreview(r); return; }
    if (r.type !== 'range') return;
    const lo = +r.min, hi = +r.max, v = +r.value;
    r.style.setProperty('--p', ((v - lo) / (hi - lo || 1)) * 100 + '%');
    const sh = playerShopAt(selLot);
    if (r.dataset.price && sh) {
      const k = r.dataset.price, cost = costOfItem(sh, k);
      $(`[id="pp-${k}"]`).textContent = '$' + v;
      $(`[id="pm-${k}"]`).textContent = `成本約 $${cost.toFixed(1)}，毛利 ${pct((v - cost) / v, 0)}・參考價 $${bizOf(sh).items[k].ref}`;
    } else if (r.dataset.markup) $('#pp-mk').textContent = v + '%';
    else if (r.dataset.loan) { $(`#ln-${r.dataset.loan}`).textContent = wan(v); $(`#lp-${r.dataset.loan}`).textContent = `每月還 ${yuan(S.annuityPayment(v))}，${V.loan.termMonths / 12} 年還完，年利率 ${(V.loan.rate * 100).toFixed(1)}%。`; }
    else if (r.dataset.ad) $('#ad-v').textContent = wan(v * 10000);
  });
  side.addEventListener('change', (e) => {
    const r = e.target;
    if (r.id === 'open-owner') { $('#expansion-estimate').outerHTML = expansionEstimateHtml(r.checked); return; }
    if (r.type !== 'range') return;
    const sh = playerShopAt(selLot);
    if (r.dataset.price && sh) { const x = S.setPrices(world, sh.id, { [r.dataset.price]: +r.value }); if (!x.ok) toast(x.reason, true); }
    else if (r.dataset.markup && sh) { const x = S.setMarkup(world, sh.id, +r.value); if (!x.ok) toast(x.reason, true); }
  });

  // ───────── 事件卡 ─────────
  const evEl = $('#event');
  const EV_META = {
    typhoon: ['世界大事', icon.bolt, ''], cold: ['世界大事', icon.bolt, ''], milk: ['成本', icon.tariff, ''],
    platform: ['外送平台', icon.ad, 'gold'], flame: ['口碑', icon.bolt, ''], batch: ['連鎖供料', icon.factory, ''],
  };
  function renderEvent() {
    const ev = S.getEvents(world).pending.filter((e) => e.choices && e.choices.length)[0];
    document.body.classList.toggle('has-event', !!ev);
    if (!ev) { evEl.hidden = true; activeEventId = null; return; }
    if (activeEventId === ev.id && !evEl.hidden) return;
    activeEventId = ev.id;
    const more = S.getEvents(world).pending.length - 1;
    const meta = EV_META[ev.kind] || ['事件', icon.bolt, ''];
    const dl = ev.deadlineT != null ? Math.max(1, Math.ceil((ev.deadlineT - world.t) / 24)) : null;
    const c = S.clockOf(world, ev.appearT);
    const choices = ev.choices.map((ch, i) => {
      const m = ch.label.match(/^(.*?)（(.*)）$/);
      const main = m ? m[1] : ch.label, sub = m ? m[2] : (ch.cost ? `花 ${money(ch.cost)}` : '');
      return `<button class="choice ${i === 0 ? 'primary' : ''}" data-ev="${ev.id}" data-key="${ch.key}"><b>${esc(main)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
    }).join('');
    evEl.hidden = false;
    evEl.innerHTML = `<div class="ev-head"><span class="chip">${icon.bolt}${meta[0]}</span><time>${c.month} 月 ${c.day} 日${more > 0 ? `・還有 ${more} 則` : ''}</time></div>
<div class="ev-main"><div class="ev-ic ${meta[2]}">${meta[1]}</div><div><h3>${esc(ev.title)}</h3><p>${esc(ev.text)}</p></div></div>
<div class="ev-note"></div>${choices}
<div class="ev-foot"><i></i>${dl ? (dl <= 1 ? '今天內決定，不選就用預設' : `${dl} 天內決定，不選就用預設`) : '遊戲已暫停，請先決定'}</div>`;
  }
  evEl.addEventListener('click', (e) => {
    const b = e.target.closest('.choice'); if (!b) return;
    const r = S.respondEvent(world, b.dataset.ev, b.dataset.key);
    if (!r.ok) { toast(r.reason, true); return; }
    activeEventId = null; hudDirty = true; renderEvent(); updateHud(); updateTicker();
    if (!document.body.classList.contains('has-event') && prevSpeed && speed === 0 && !modal) setSpeed(prevSpeed);
    save();
  });

  // ───────── 速度 ─────────
  function eventBlocking() { return S.getEvents(world).pending.some((e) => e.choices && e.choices.length); }
  function setSpeed(n) {
    if (n > 0 && eventBlocking()) { toast('先處理右邊的事件，才能繼續。', true); return; }
    if (n > 0 && world.status !== 'playing') return;
    fastTarget = null;
    if (speed > 0) prevSpeed = speed;
    speed = n; if (n > 0) { prevSpeed = n; played = true; }
    updateSpeedBtns(); updateTut();
  }
  function startFastForward(period) {
    if (world.status !== 'playing') return;
    if (eventBlocking()) { toast('先處理事件，再快進。', true); return; }
    fastTarget = { period, t: S.fastForwardTarget(world, period) }; speed = 64; prevSpeed = 0; acc = 0; played = true;
    pendingSpawns.length = 0; updateSpeedBtns(); updateTut();
  }
  function stopFastForward(message) {
    fastTarget = null; speed = 0; prevSpeed = 0; acc = 0; fullRefresh(); save();
    if (message) toast(message);
  }
  $('.speed').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b?.dataset.fast) startFastForward(b.dataset.fast); else if (b) setSpeed(+b.dataset.sp); });
  addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) return;
    if (e.key === ' ') { e.preventDefault(); setSpeed(speed ? 0 : prevSpeed || 1); }
    else if (e.key === 'Escape') { if (modal) closeModal(); else if (panel) closePanel(); }
  });

  // ───────── 推進一小時，並把 frame 餵給引擎 ─────────
  function step(fx) {
    const f = S.stepHour(world);
    if (fx) feed(f);
    else for (const n of f.newEvents) if (!n.needsChoice) { /* 快轉時不跳提示 */ }
    if (f.weather && f.weather !== lastWeather) { lastWeather = f.weather; city.setWeather(f.weather, !fx); }
    for (const n of f.newEvents) if (fx && !n.needsChoice) toast(n.title);
    if (world.t % 24 === 0) newDay();
    if (f.status !== 'playing') overShown = false;
    hudDirty = labelDirty = true;
    return f;
  }
  function newDay() {
    const k = S.getKpi(world);
    if (k.clock.day === 1) {
      meta.cashHist.push([k.date.slice(0, 7), k.cash]);
      if (meta.cashHist.length > 40) meta.cashHist.shift();
    }
    syncShops(); updateTicker(); save();
    if (panel === 'rival' || ['warehouse', 'factory', 'lab'].includes(panel)) renderSide();
  }
  let hourMs = 1000;
  function feed(f) {
    const now = performance.now();
    for (const e of f.shops) {
      city.setQueue(e.lotId, e.open ? e.queue : 0);
      if (!e.open || speed > 4) continue;
      // 門市客人：約 4 位客人生 1 個小人
      if (e.walkOrders > 0 && e.walkFrom && e.walkFrom.length) {
        carry[e.shopId] = (carry[e.shopId] || 0) + e.walkOrders / 4;
        let n = Math.floor(carry[e.shopId]); carry[e.shopId] -= n;
        const tot = e.walkFrom.reduce((a, x) => a + x[1], 0);
        while (n-- > 0 && pendingSpawns.length < 200) {
          let u = Math.random() * tot, from = e.walkFrom[0][0];
          for (const [bid, c] of e.walkFrom) { if ((u -= c) < 0) { from = bid; break; } }
          pendingSpawns.push({ at: now + Math.random() * hourMs, kind: 'w', from: bldXZ[from], lot: e.lotId });
        }
      }
      // 外送：約 3 單 1 台機車，每家每小時最多 4 台
      if (e.deliveryServed > 0) {
        carry['d' + e.shopId] = (carry['d' + e.shopId] || 0) + e.deliveryServed / 3;
        let n = Math.min(2, Math.floor(carry['d' + e.shopId])); carry['d' + e.shopId] = (carry['d' + e.shopId] % 1);
        while (n-- > 0 && pendingSpawns.length < 200) pendingSpawns.push({ at: now + Math.random() * hourMs, kind: 's', to: bldXZ[bldIds[Math.floor(Math.random() * bldIds.length)]], lot: e.lotId });
      }
    }
    const h = world.t % 24;
    if (world.status === 'playing') city.setClock(h);
  }
  function runSpawns(now) {
    if (!pendingSpawns.length) return;
    const cs = city.stats(); let walkers = cs.walkers || 0, scooters = cs.scooters || 0;
    const keep = [];
    for (const p of pendingSpawns) {
      if (p.at > now) { keep.push(p); continue; }
      if (p.kind === 'w') { if (walkers < 300) { city.spawnWalker(p.from, p.lot, {}); walkers++; } }
      else if (scooters < 14) { city.spawnScooter(p.lot, p.to, {}); scooters++; }
    }
    pendingSpawns = keep;
  }

  // ───────── 主迴圈 ─────────
  function running() { return speed > 0 && !modal && world.status === 'playing' && !eventBlocking(); }
  function frameLoop(now) {
    requestAnimationFrame(frameLoop);
    const dt = Math.min(0.25, (now - lastNow) / 1000); lastNow = now;
    if (fastTarget != null && running()) {
      const started = performance.now(); let steps = 0;
      while (world.t < fastTarget.t && running() && steps < 48 && performance.now() - started < 12) { step(false); steps++; }
      city.setClock(world.t % 24);
      for (const s of getShops()) { const t = S.getShopToday(world, s.id); city.setQueue(s.lotId, t.queue); }
      if (eventBlocking()) stopFastForward('快進暫停：有事件需要你決定。');
      else if (world.status !== 'playing') stopFastForward();
      else if (world.t >= fastTarget.t) stopFastForward(fastTarget.period === 'month' ? '已到下月，月結已完成。' : '已快進一週。');
    } else if (running()) {
      const h = world.t % 24;
      const night = h < V.time.openHour || h >= V.time.closeHour;
      const rate = speed * (night ? 6 : 1);
      hourMs = 1000 / rate;
      acc += dt * rate;
      let n = 0;
      while (acc >= 1 && n < 30 && running()) {
        acc -= 1; n++;
        const f = step(true);
        if (f.status !== 'playing' || f.newEvents.some((x) => x.needsChoice)) { acc = 0; break; }
      }
      if (eventBlocking()) { acc = 0; if (speed) { prevSpeed = speed; } speed = 0; updateSpeedBtns(); }
      city.setClock((world.t % 24) + Math.min(acc, 0.99));
      const h2 = world.t % 24; $('#h-ff').hidden = !(h2 < V.time.openHour || h2 >= V.time.closeHour);
    } else acc = 0;
    runSpawns(now);
    if (hudDirty) { updateHud(); updateSpeedBtns(); renderEventOnce(); liveRefresh(); updateTut(); }
    if (labelDirty && now - lastLabelAt > 250) { updateLabels(); lastLabelAt = now; }
    if (world.status !== 'playing' && !overShown) showOver();
  }
  function renderEventOnce() {
    renderEvent();
    if (eventBlocking() && speed !== 0) { prevSpeed = speed; speed = 0; updateSpeedBtns(); }
  }
  function liveRefresh() {
    if (panel === 'shop' && shopTab === 'today' && !modal) { const b = $('#sd-body'); const s = playerShopAt(selLot); if (b && s) b.innerHTML = todayHtml(s); }
    else if (panel === 'shop' && !playerShopAt(selLot)) closePanel();
  }

  // ───────── 勝負 ─────────
  function showOver() {
    overShown = true;
    speed = 0; updateSpeedBtns();
    const k = S.getKpi(world), sh = S.marketShare30(world);
    const won = world.status === 'won';
    const rows = Object.entries(sh).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, v]) => `<div><label>${esc(world.companies[id].name)}</label><b class="num">${pct(v)}</b></div>`).join('');
    const title = won ? '你贏了' : world.status === 'bankrupt' ? '破產了' : '時間到了';
    $('#over').innerHTML = `<div class="box panel"><h2 class="${won ? 'won' : 'lost'}">${title}</h2><p>${esc(world.endReason || '')}。<br>${S.dateOf(Math.floor(world.t / 24)).key.replace(/-/g, ' / ')}，現金 ${wan(k.cash)}。</p><div class="mt">${rows}</div><button class="gbtn primary wide" data-act="caseReport">查看結案分析</button><button class="gbtn wide" data-act="downloadCase">下載結案報告</button><button class="gbtn wide" data-act="again">重新開始</button></div>`;
    $('#over').hidden = false;
    save();
  }
  function downloadCase() {
    const report = S.getFinalReport(world), url = URL.createObjectURL(new Blob([caseReportDocument(report)], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `創業之城-結案分析-${report.endDate}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('#over').addEventListener('click', (e) => {
    if (e.target.closest('[data-act=again]')) { startFresh(); fullRefresh(); }
    else if (e.target.closest('[data-act=downloadCase]')) downloadCase();
    else if (e.target.closest('[data-act=caseReport]')) { $('#over').hidden = true; reportTab = 'case'; openReport(); }
  });

  // ───────── 彈出視窗 ─────────
  function closeModal() {
    modal = null; $('#report').hidden = true; $('#sources').hidden = true; $('#scrim').hidden = true; updateDock();
    if (world.status !== 'playing') $('#over').hidden = false;
  }
  $('#scrim').addEventListener('click', closeModal);

  // 報表
  const niceMax = (v) => { const steps = [1, 2, 5, 10, 20, 40, 60, 80, 100, 150, 200, 300, 400, 600, 800, 1000, 1500, 2000]; return steps.find((s) => s >= v * 1.05) || Math.ceil(v / 500) * 500; };
  const mLabel = (ym) => String(+ym.slice(5, 7));
  function reportData() {
    const rep = S.getReport(world), co = world.companies.player;
    const rows = co.rows.slice(-12);
    const shops = getShops('player').filter((s) => s.status !== 'closed');
    const rv = shops.reduce((a, s) => a + s.reviews, 0);
    const star = rv ? shops.reduce((a, s) => a + s.star * s.reviews, 0) / rv : (shops[0] ? shops[0].star : 0);
    const sh = S.marketShare30(world).player;
    const hist = meta.cashHist.slice(-12);
    const delta = (cur, pre, fmt, up) => (pre == null || cur == null) ? null : { text: fmt(cur - pre), up: up(cur - pre) };
    const tiles = [
      { label: '現金', value: wan(world.companies.player.cash), d: hist.length > 1 ? delta(hist[hist.length - 1][1], hist[hist.length - 2][1], (x) => wan(x, true), (x) => x >= 0) : null, spark: hist.length > 1 ? hist.map((h) => h[1] / 10000) : null, cmp: '較上月' },
      { label: '本月營收', value: money(rep.current.turnover), sub: '截至今日', empty: '門市＋外送標價' },
      { label: '本月總成本', value: money(rep.current.totalCost), sub: '截至今日', empty: '含人事、租金與利息' },
      { label: '本月淨利', value: money(rep.current.netProfit, true), tone: rep.current.netProfit < 0 ? 'down' : 'up', empty: rep.current.netMargin == null ? '尚無營收' : `淨利率 ${pct(rep.current.netMargin)}`, spark: rep.financials.length > 1 ? rep.financials.map((r) => r.netProfit / 10000) : null },
      { label: `市占率（近 30 天${world.multiBusiness ? '營收' : '杯數'}）`, value: pct(sh), d: rep.share.player.length > 1 ? delta(rep.share.player[rep.share.player.length - 1], rep.share.player[rep.share.player.length - 2], (x) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1) + ' 點', (x) => x >= 0) : null, spark: rep.share.player.length > 1 ? rep.share.player.map((x) => x * 100) : null, cmp: '較前月' },
      { label: '口碑星等', value: star ? star.toFixed(1) : '—', stars: star || 0, sub: rv ? `${int(rv)} 則評價` : '', d: null, spark: null },
    ];
    return { rep, rows, tiles, shops };
  }
  const tilesHtml = (tiles) => tiles.map((t) => `<div class="tile"><label>${t.label}${t.sub ? `<span class="mg">${t.sub}</span>` : ''}</label><div class="v num ${t.tone || ''}">${t.value}${t.stars ? `<span class="stars"><span class="bg">${icon.star.repeat(5)}</span><span class="fg" style="width:${(t.stars / 5) * 100}%">${icon.star.repeat(5)}</span></span>` : ''}</div>
    <div class="row">${t.d ? `<div class="d num ${t.d.up ? 'up' : 'down'}">${t.d.up ? '▲' : '▼'} ${t.d.text.replace(/^[+−]/, '')}<span>${t.cmp}</span></div>` : `<div class="d" style="color:var(--muted);font-weight:400">${t.empty || (t.spark || t.stars ? '' : '月結後才有')}</div>`}${t.spark ? spark(t.spark, t.tone === 'down' ? '#e66767' : '#4fd8a0') : ''}</div></div>`).join('');

  const COST_ROWS = [['cogs', '原料／商品／耗材'], ['pack', '包材'], ['waste', '原料／商品報廢'], ['commission', '平台佣金'], ['wage', '人事（含勞健保、勞退）'], ['rent', '店租（含裝修期間）'], ['util', '水電'], ['pos', 'POS 與雜支'], ['cardFee', '支付手續費'], ['bizTax', '營業稅'], ['adCost', '社群廣告'], ['extraExpense', '網紅合作與事件支出'], ['chainCost', '連鎖管理費'], ['facilityCost', '後勤設施固定費'], ['researchExpense', '研發專案費'], ['stockWriteOff', '中央庫存損失'], ['loanInterest', '貸款利息'], ['incomeTax', '營所稅（年結入帳）']];
  function financeHtml(rep) {
    const selected = rep.financials.find((r) => r.ym === reportMonth) || rep.current;
    const periods = [selected, ...rep.financials.slice().reverse().filter((r) => r.ym !== selected.ym).slice(0, 2)];
    const row = (name, key, profit = false) => `<tr><td class="nm">${name}</td>${periods.map((r) => `<td class="num ${profit ? r[key] < 0 ? 'down' : 'up' : ''}">${money(r[key], profit)}</td>`).join('')}</tr>`;
    return `<div class="card ptable finance finance-detail"><h4>損益明細<select id="finance-period" aria-label="損益明細月份"><option value="current" ${reportMonth === 'current' ? 'selected' : ''}>本月至今</option>${rep.financials.slice().reverse().map((r) => `<option value="${r.ym}" ${reportMonth === r.ym ? 'selected' : ''}>${r.ym}</option>`).join('')}</select></h4><div class="tbl-scroll"><table><thead><tr><th>項目</th>${periods.map((r) => `<th>${r.ym}${r === rep.current ? ' 至今' : ''}</th>`).join('')}</tr></thead><tbody>${row('營收（門市＋外送標價）', 'turnover')}${COST_ROWS.map(([key, name]) => row(name, key)).join('')}${row('總成本', 'totalCost')}${row('淨利', 'netProfit', true)}<tr><td class="nm">淨利率</td>${periods.map((r) => `<td class="num ${r.netProfit < 0 ? 'down' : 'up'}">${r.netMargin == null ? '—' : pct(r.netMargin)}</td>`).join('')}</tr>${row('另列：償還貸款本金', 'loanPrincipal')}${row('另列：開店投入', 'shopInvestment')}${row('另列：後勤建置投入', 'facilityCapex')}${row('另列：中央進貨付款', 'stockPurchases')}${row('另列：資產回收現金', 'assetRecoveries')}</tbody></table></div><p class="note">本月成本隨遊戲時間累計，貸款利息按天估列。本金只影響現金，不扣淨利。裝潢、設備與押金在開店時付現，本版未計折舊。${rep.analysis.some((a) => a.ownerWorks) ? '老闆自己顧店的門店未另計老闆薪資。' : ''}${rep.current.incomplete || rep.financials.some((r) => r.incomplete) ? '舊存檔更新前未記錄部分利息、一次性支出與營所稅，受影響月份的淨利僅供參考。' : ''}</p></div>`;
  }
  function profitHistoryHtml(rep) {
    const periods = [rep.current, ...rep.financials.slice().reverse()];
    return `<div class="card ptable finance"><h4>每月損益<small>近 12 個月，含品牌費用</small></h4><div class="tbl-scroll"><table><thead><tr><th>月份</th><th>營收</th><th>總成本</th><th>淨利</th><th>淨利率</th></tr></thead><tbody>${periods.map((r, i) => `<tr><td class="nm">${r.ym}${i === 0 ? ' 至今' : r.incomplete ? '＊' : ''}</td><td class="num">${money(r.turnover)}</td><td class="num">${money(r.totalCost)}</td><td class="num ${r.netProfit < 0 ? 'down' : 'up'}">${money(r.netProfit, true)}</td><td class="num">${r.netMargin == null ? '—' : pct(r.netMargin)}</td></tr>`).join('')}</tbody></table></div>${rep.financials.some((r) => r.incomplete) ? '<p class="note">＊舊存檔缺少部分品牌費用，詳見損益明細。</p>' : ''}</div>`;
  }
  function chainAnalysisHtml(rep) {
    const m = rep.market, c = rep.current, savings = c.warehouseSavings + c.factorySavings;
    const shops = getShops('player').filter((s) => s.status !== 'closed'), f = world.companies.player.expansion.facilities.warehouse;
    return `<div class="card"><h4>市場與連鎖分析</h4><div class="diagnosis-stats"><span>全城有效人口<b>${int(m.population)} 人</b></span><span>各業態潛在需求合計<b>${int(m.potentialDaily)} 單位</b></span><span>全城供給產能<b>${int(m.capacityDaily)} 單位／天</b></span><span>店面上限／空店面<b>${m.lots}／${m.freeLots} 家</b></span></div><p class="note">典型日選購需求約 ${int(m.typicalOrders)} 單位，需求池成交意願約 ${pct(m.saturation)}，未扣排隊流失。下表按業態分開比較供需，跨業態的單位合計不能當作同一市場的市占。需求按人口、平假日與平均天氣估算，包含選擇不買；產能代表最多能做多少，不代表能賣多少。多開店會分走其他店客源。</p><div class="tbl-scroll"><table><thead><tr><th>業態</th><th>潛在日需求</th><th>日供給上限</th><th>成交意願</th><th>營業店</th></tr></thead><tbody>${m.sectors.map((s) => `<tr><td>${s.name}</td><td>${int(s.potentialDaily)} ${s.unit}</td><td>${int(s.capacityDaily)} ${s.unit}</td><td>${pct(s.saturation)}</td><td>${s.openShops}</td></tr>`).join('')}</tbody></table></div><dl class="kv"><dt>你的分店（含裝修）</dt><dd>${shops.length} 家</dd><dt>本月連鎖管理費</dt><dd>${money(c.chainCost)}</dd><dt>本月後勤固定費</dt><dd>${money(c.facilityCost)}</dd><dt>本月採購與製程已省</dt><dd>${money(savings)}</dd><dt>節省扣後勤固定費</dt><dd class="${savings - c.facilityCost < 0 ? 'down' : 'up'}">${money(savings - c.facilityCost, true)}</dd><dt>倉庫占用資金（含在途）</dt><dd>${money(f.stockCost + f.orders.reduce((a, o) => a + o.cost, 0))}</dd></dl><p>品牌知名度與研發成果由分店共用。第二家起每家每月管理費 ${money(V.expansion.chain.managementPerShop)}，同業態各店選購評價有 25% 來自該業態的品牌平均；一家店的負評會影響同業態分店。</p><p>工廠有供料上限，也有共用批次異常風險。倉庫採購需先付款；新店裝修期間有租金、沒有營收。擴張前先看增量獲利與手上現金。</p></div>`;
  }
  function analysisHtml(rep) {
    if (!rep.analysis.length) return chainAnalysisHtml(rep) + '<div class="card"><h4>經營分析</h4><p class="note">開店後就會顯示固定成本，開始營業後可比較日銷成交量與損益兩平成交量。</p></div>';
    const brandCost = rep.current.totalCost - (rep.current.turnover - rep.current.profit);
    return `${chainAnalysisHtml(rep)}<div class="card"><h4>經營分析<small>按各店實際成交與成本計算</small></h4>${brandCost ? `<p class="note">本月品牌費用共 ${money(brandCost)}，包含廣告、管理、後勤、研發與利息，已扣在公司淨利。</p>` : ''}<div class="diagnostics">${rep.analysis.map((a) => {
      const notes = [];
      if (a.status === 'renovating') notes.push('裝修期間已有租金、尚無營收，這段虧損是開店成本的一部分。');
      else if (!a.pnl.cups) notes.push('尚無成交資料。先累積營業數字，才能估算損益兩平成交量。');
      else if (a.contribution <= 0) notes.push('每多賣一單位仍會虧錢。先檢查售價、促銷與平台抽成。');
      else if (a.dailyCups < a.breakEvenDaily) notes.push(`目前日銷距離門店損益兩平還差約 ${int(a.breakEvenDaily - a.dailyCups)} ${a.unit}。每單位扣完變動成本剩 ${yuan(a.contribution)}，還要支付租金與人事。`);
      else notes.push(`目前日銷已達門店損益兩平。每單位扣完變動成本剩 ${yuan(a.contribution)}，公司淨利還要再扣品牌費用。`);
      if (a.status !== 'renovating' && !a.ownerWorks) notes.push(`全聘員工的人事約 ${money(a.monthlyWage)}／月。老闆親自顧這家店可少付約 ${money(a.ownerSaving)}／月，一次只能顧一家店。`);
      if (a.breakEvenWithBrandDaily != null && a.dailyCups < a.breakEvenWithBrandDaily) notes.push(`計入分攤的品牌費用後，每天約需 ${int(a.breakEvenWithBrandDaily)} ${a.unit}，目前還差 ${int(a.breakEvenWithBrandDaily - a.dailyCups)} ${a.unit}。`);
      if (a.breakEvenWithBrandDaily > a.capacityDaily) notes.push(`損平成交量已超過目前班表每日最多 ${int(a.capacityDaily)} ${a.unit}的產能。先降低固定成本或提高每單位剩餘金額，再評估加人。`);
      if (a.prepared) notes.push(`已備 ${int(a.prepared)} ${a.unit}，未售報廢 ${int(a.unsold)} ${a.unit}（${pct(a.unsold / a.prepared)}）。備貨上限目前每天 ${a.operations.prep} ${a.unit}。`);
      if (a.stockLost) notes.push(`缺貨已流失 ${int(a.stockLost)} 筆訂單，先檢查備貨或庫存資金。`);
      if (a.businessId === 'convenience') notes.push(`商品庫存占用 ${money(a.inventory)}，目標 ${money(a.operations.stockTarget)}。${a.operations.autoStock ? '每日自動補貨，現金不足時只買得起部分庫存。' : '自動補貨已關閉。'}`);
      if (a.lostRate > 0.03 || a.avgWait > 12) notes.push(`流失客人占 ${pct(a.lostRate)}。查看每小時成交量，在忙的班增加人手，避免長時間排隊拖累評價。`);
      if (a.ownerWorks) notes.push('班表含老闆每天 12 小時的工作，淨利未另扣老闆薪資。');
      return `<article class="diagnosis"><h5>${esc(a.name)}・${S.businessOf(a.businessId).name}</h5><div class="diagnosis-stats"><span>實際日銷<b class="num">${a.pnl.cups ? int(a.dailyCups) + ' ' + a.unit : '—'}</b></span><span>門店損益兩平<b class="num">${a.breakEvenDaily == null ? '—' : int(a.breakEvenDaily) + ' ' + a.unit + '／天'}</b></span><span>含品牌費用損益兩平<b class="num">${a.breakEvenWithBrandDaily == null ? '—' : int(a.breakEvenWithBrandDaily) + ' ' + a.unit + '／天'}</b></span><span>每月固定成本<b class="num">${money(a.fixedMonthly)}</b></span></div><p class="note">${a.ym}${a.current ? ' 至今' : ''}，${a.sampleDays} 個營業日。損益兩平按目前班表及當期通路組合估算。廣告、管理、後勤、研發、一次性支出及利息平均分攤，每店 ${money(a.brandAllocation)}／月，未預估年結營所稅。${a.sampleDays < 7 ? '資料少於 7 天，先觀察。' : ''}</p>${notes.map((n) => `<p>${n}</p>`).join('')}<button class="gbtn" data-report-shop="${a.shopId}">查看門店與排班</button></article>`;
    }).join('')}</div></div>`;
  }

  function productsHtml(rep, shop) {
    const tot = rep.products.reduce((a, p) => a + p.revenue, 0);
    return `<div class="card ptable finance"><h4>商品<small>近 12 個月累計，毛利未扣人事、租金與平台佣金</small></h4><div class="tbl-scroll"><table><thead><tr><th>商品</th><th>目前售價</th><th>商品直接成本</th><th>商品毛利</th><th>毛利率</th><th>營收占比</th><th>成交量／單位</th><th>營收</th></tr></thead><tbody>
    ${rep.products.map((p) => `<tr><td class="nm">${p.name}<small>・${S.businessOf(p.businessId).name}</small></td><td class="num">${getShops('player').filter((s) => s.businessId === p.businessId).map((s) => '$' + s.prices[p.name]).filter((v, i, a) => a.indexOf(v) === i).join('／') || '—'}</td><td class="num">${money(p.directCost)}</td><td class="num">${money(p.grossProfit)}</td><td class="num">${p.cups ? pct(p.grossMargin) : '—'}</td><td class="num">${tot ? pct(p.revenue / tot, 0) : '—'}<span class="qbar"><i style="width:${tot ? (p.revenue / tot) * 100 : 0}%"></i></span></td><td class="num">${int(p.cups)} ${p.unit}</td><td class="num">${p.cups ? money(p.revenue) : '—'}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  }
  function channelHtml(rep, rows) {
    if (!rows.length) return '';
    return `<div class="card ptable"><h4>每月通路<small>門市、外送（平台標價），佣金是平台抽走的</small></h4><div class="tbl-scroll"><table><thead><tr><th>月份</th><th>門市營收</th><th>外送營收</th><th>平台佣金</th><th>門市成交量</th><th>外送成交量</th></tr></thead><tbody>
    ${rows.slice().reverse().map((r) => `<tr><td class="nm">${r.ym.replace('-', ' 年 ')} 月</td><td class="num">${money(r.store)}</td><td class="num">${money(r.gmv)}</td><td class="num">${money(r.commission)}</td><td class="num">${int(r.walk)}</td><td class="num">${int(r.del)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  }
  function rivalsHtml() {
    const sh = S.marketShare30(world);
    const rs = Object.values(world.companies).filter((c) => c.id !== 'player' && !c.id.startsWith('road'));
    const roadShare = Object.keys(sh).filter((k) => k.startsWith('road')).reduce((a, k) => a + sh[k], 0);
    const card = (name, share, shops) => `<div class="rv"><h5>${esc(name)}</h5><div class="num" style="font-size:22px;font-weight:700">${pct(share)}</div><div class="mg">近 30 天${world.multiBusiness ? '營收' : '杯數'}市占</div>${shops.map((s) => { const r = S.getRivalInfo(world, s.id); return `<div class="note" style="margin:6px 0 0">${esc(s.name)}：${starHtml(r.star)}<span class="num"> ${r.star.toFixed(1)}</span>， 日銷約 ${r.estDailyCups != null ? int(r.estDailyCups) : '—'} ${unitOf(s)}</div>`; }).join('')}</div>`;
    const all = getShops('rival');
    return `<div class="rivals">${rs.map((c) => card(c.name, sh[c.id] || 0, all.filter((s) => s.company === c.id))).join('')}${card('路邊小店（合計）', roadShare, all.filter((s) => s.company.startsWith('road')))}</div>`;
  }

  function renderReport() {
    const el = $('#report');
    const { rep, rows, tiles, shops } = reportData();
    const c = S.clockOf(world);
    const tabs = [['all', '總覽'], ['pl', '損益'], ['an', '分析'], ['ch', '通路'], ['pr', '商品'], ['rv', '對手'], ['case', world.status === 'playing' ? '整局' : '結案']];
    let body = '';
    const noData = '<div class="empty-note">第一次月結（每月 1 日）之後，這裡才會有數字。</div>';
    const revCard = () => `<div class="card"><h4>營收走勢<small>近 12 個月，依通路，單位：萬元</small></h4><div class="legend"><span><i style="background:#3987e5"></i>門市</span><span><i style="background:#d95926"></i>外送</span></div><div class="chart" id="c1">${rep.months.length ? '' : noData}</div></div>`;
    const shareCard = () => `<div class="card"><h4>市占率<small>${world.multiBusiness ? '全市六業態營收' : '全市手搖飲杯數'}，近 12 個月</small></h4><div class="legend">${[['#199e70', world.companies.player.name], ['#e66767', '大吉茶行'], ['#9085e9', '青柚手作'], ['#8c86a6', '其他業者']].map(([cl, n]) => `<span><i class="ln" style="background:${cl}"></i>${esc(n)}</span>`).join('')}</div><div class="chart" id="c2">${rep.share.months.length > 1 ? '' : noData}</div></div>`;
    if (reportTab === 'all') body = `<div class="tiles">${tilesHtml(tiles)}</div>${profitHistoryHtml(rep)}${analysisHtml(rep)}<div class="cards">${revCard()}${shareCard()}</div>${productsHtml(rep, shops[0])}`;
    else if (reportTab === 'pl') body = `${financeHtml(rep)}${profitHistoryHtml(rep)}`;
    else if (reportTab === 'an') body = analysisHtml(rep);
    else if (reportTab === 'ch') body = `<div class="cards" style="grid-template-columns:1fr">${revCard()}</div>${channelHtml(rep, rows)}`;
    else if (reportTab === 'pr') body = productsHtml(rep, shops[0]);
    else if (reportTab === 'case') body = `<button class="gbtn" data-act="downloadCase">下載${world.status === 'playing' ? '目前整局' : '結案'}分析報告</button>${caseReportHtml(S.getFinalReport(world))}`;
    else body = `<div class="cards" style="grid-template-columns:1fr">${shareCard()}</div>${rivalsHtml()}`;
    el.innerHTML = `<div class="rp-head"><h2>經營報表</h2><span class="sub num">${c.year} 年 ${c.month} 月 ${c.day} 日・${esc(world.companies.player.name)}</span>
      <div class="tabs">${tabs.map(([k, n]) => `<button data-rt="${k}" class="${reportTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <button class="xbtn" data-act="mclose" aria-label="關閉">${icon.close}</button></div><div class="rp-body">${body}</div>`;
    const c1 = $('#c1'), c2 = $('#c2');
    if (c1 && rep.months.length) {
      const st = rep.months.map((m) => +(m.storeRevenue / 10000).toFixed(1)), dl = rep.months.map((m) => +(m.deliveryRevenue / 10000).toFixed(1));
      const mx = niceMax(Math.max(...st.map((v, i) => v + dl[i])));
      stacked(c1, { months: rep.months.map((m) => mLabel(m.ym)), channels: [{ key: 'store', name: '門市', color: '#3987e5', data: st }, { key: 'del', name: '外送', color: '#d95926', data: dl }], yMax: mx, yTicks: [0, mx / 4, mx / 2, (mx * 3) / 4, mx].map((v) => +v.toFixed(1)) });
    }
    if (c2 && rep.share.months.length > 1) {
      const pc = (a) => a.map((v) => +(v * 100).toFixed(1));
      const series = [{ name: world.companies.player.name, me: true, color: '#199e70', data: pc(rep.share.player) }, { name: '大吉茶行', color: '#e66767', data: pc(rep.share.daji) }, { name: '青柚手作', color: '#9085e9', data: pc(rep.share.qingyou) }, { name: '其他業者', color: '#8c86a6', data: pc(rep.share.other) }];
      const mx = Math.max(10, Math.ceil(Math.max(...series.flatMap((s) => s.data)) / 10) * 10);
      const ticks = []; for (let t = 0; t <= mx; t += mx > 40 ? 20 : 10) ticks.push(t);
      lines(c2, { months: rep.share.months.map(mLabel), series, yMin: 0, yMax: mx, yTicks: ticks });
    }
  }
  $('#report').addEventListener('click', (e) => {
    if (e.target.closest('[data-act=mclose]')) return closeModal();
    if (e.target.closest('[data-act=downloadCase]')) return downloadCase();
    const shop = e.target.closest('[data-report-shop]');
    if (shop) { const s = getShops('player').find((s) => s.id === shop.dataset.reportShop); if (s) { closeModal(); shopTab = 'staff'; openPanel('shop', s.lotId); } return; }
    const b = e.target.closest('[data-rt]'); if (b) { reportTab = b.dataset.rt; renderReport(); }
  });
  $('#report').addEventListener('change', (e) => { if (e.target.id === 'finance-period') { reportMonth = e.target.value; renderReport(); } });
  function openReport() {
    closePanel(); modal = 'report'; $('#sources').hidden = true;
    $('#report').hidden = false; $('#scrim').hidden = false; renderReport(); updateDock();
  }

  // 數字來源
  const tagOf = (src) => /^S\d/.test(src) ? ['有來源', 't-src'] : src === '推算' ? ['推算', 't-calc'] : src === '文獻' ? ['文獻', 't-lit'] : ['暫定', 't-tmp'];
  const SEC = { time: '時間', people: '人口與地圖', demand: '需求', choice: '客人怎麼選店', queue: '排隊與等候', calibrated: '校準值（程式算出）', calibrationTargets: '校準目標', items: '品項與成本', menu: '菜單與原料', capacity: '產能與排班', delivery: '外送', reviews: '評價與星等', familiarity: '熟悉度', awareness: '知名度與廣告', lots: '空店面', startup: '開店成本', fixedCost: '固定成本', labor: '人力', tax: '稅', loan: '貸款', rivals: '對手', events: '事件', businesses: '多業態設計假設', expansion: '連鎖後勤與研發', perf: '效能' };
  const srcById = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
  const fmtVal = (v) => { if (typeof v === 'number') return v.toLocaleString('en-US'); if (typeof v === 'string') return v; const j = JSON.stringify(v); return j.length > 80 ? j.slice(0, 78) + '…' : j; };
  const srcLinks = (ids) => ids.map((id) => { const s = srcById[id]; return s ? s.urls.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}（${esc(s.date)}，可信度${esc(s.trust)}）">${id}${s.urls.length > 1 ? '-' + (i + 1) : ''}</a>`).join('') : ''; }).join('');
  let PARAMS = null;
  function renderSources() {
    PARAMS = PARAMS || [...listParams(), ...Object.entries(S.BUSINESSES).flatMap(([id, b]) => ['renovation', 'equipment', 'firstStock', 'solo', 'worker', 'utility', 'packaging', 'waste', 'rate', 'delRate', 'wageMult', 'items', 'affinity', 'hours', 'defaults'].map((key) => ({ path: `businesses.${id}.${key}`, v: b[key], src: '暫定', note: `${b.name}的遊戲設計參數；金額與需求並非實際創業報價或業界統計。${b.tradeoff}` })))].map((p) => {
      const [tag, cls] = tagOf(p.src);
      const ids = /^S\d/.test(p.src) ? [p.src] : [...new Set(p.note.match(/S\d+[a-z]?/g) || [])].filter((x) => srcById[x]);
      return { ...p, tag, cls, ids, sec: p.path.split('.')[0] };
    });
    const el = $('#sources');
    const cnt = { 全部: PARAMS.length }; for (const p of PARAMS) cnt[p.tag] = (cnt[p.tag] || 0) + 1;
    const qy = srcQuery.trim().toLowerCase();
    const list = PARAMS.filter((p) => (srcFilter === '全部' || p.tag === srcFilter) && (!qy || (p.path + p.note + (SEC[p.sec] || '')).toLowerCase().includes(qy)));
    let html = '', cur = '';
    for (const p of list) {
      if (p.sec !== cur) { cur = p.sec; html += `<div class="sc-grp">${SEC[cur] || cur}</div>`; }
      html += `<div class="sc-row"><div class="pth">${esc(p.path.split('.').slice(1).join('.') || p.path)}</div><div class="val num">${esc(fmtVal(p.v))}</div><span class="tag-s ${p.cls}">${p.tag}</span><div class="nt">${esc(p.note)}${p.ids.length ? `<div class="sc-src"><span>來源：</span>${srcLinks(p.ids)}</div>` : ''}</div></div>`;
    }
    const focused = document.activeElement && document.activeElement.id === 'sc-q';
    el.innerHTML = `<div class="rp-head"><h2>數字來源</h2><span class="sub num">共 ${PARAMS.length} 個參數</span><button class="xbtn" data-act="mclose" aria-label="關閉">${icon.close}</button></div>
<div class="sc-top"><p>想接近真實，所以每個數字都標了出處。「有來源」是查得到網址的；「推算」是從來源算出來的；「文獻」是國外研究；「暫定」是查不到、先讓遊戲能跑的假設，之後有資料就換掉。</p>
<div class="chips">${['全部', '有來源', '推算', '文獻', '暫定'].map((k) => `<button class="fchip ${srcFilter === k ? 'on' : ''}" data-sf="${k}">${k}<i class="num">${cnt[k] || 0}</i></button>`).join('')}</div>
<input type="search" id="sc-q" placeholder="搜尋說明或名稱" value="${esc(srcQuery)}"></div>
<div class="sc-list">${html || '<div class="empty-note">沒有符合的數字</div>'}<div class="sc-grp">來源清單（${SOURCES.length} 筆）</div>${SOURCES.map((s) => `<div class="sc-row" style="grid-template-columns:48px 1fr"><div class="pth">${s.id}</div><div class="nt">${esc(s.title)}（${esc(s.date)}，可信度：${esc(s.trust)}）<div class="sc-src">${s.urls.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.length > 70 ? u.slice(0, 68) + '…' : u)}</a>`).join('<br>')}</div></div></div>`).join('')}</div>`;
    if (focused) { const i = $('#sc-q'); i.focus(); i.setSelectionRange(srcQuery.length, srcQuery.length); }
  }
  $('#sources').addEventListener('click', (e) => {
    if (e.target.closest('[data-act=mclose]')) return closeModal();
    const b = e.target.closest('[data-sf]'); if (b) { srcFilter = b.dataset.sf; renderSources(); }
  });
  $('#sources').addEventListener('input', (e) => { if (e.target.id === 'sc-q') { srcQuery = e.target.value; renderSources(); } });
  function openSources() {
    closePanel(); modal = 'sources'; $('#report').hidden = true;
    $('#sources').hidden = false; $('#scrim').hidden = false; renderSources(); updateDock();
  }

  // ───────── 左側選單 ─────────
  $('#dock').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dk]'); if (!b) return;
    const k = b.dataset.dk;
    if (k === 'shop') { if (modal) closeModal(); if (!['lot', 'shop', 'rival'].includes(panel)) { closePanel(); toast('點地圖上掛「招租」的空店面，就能租下開店。'); } }
    else if (k === 'ad') (panel === 'ad' ? closePanel() : openPanel('ad'));
    else if (k === 'loan') (panel === 'loan' ? closePanel() : openPanel('loan'));
    else if (['warehouse', 'factory', 'lab'].includes(k)) (panel === k ? closePanel() : openPanel(k));
    else if (k === 'report') (modal === 'report' ? closeModal() : openReport());
    else if (k === 'sources') (modal === 'sources' ? closeModal() : openSources());
    else if (k === 'new') {
      if (await confirmBox('要重新開始嗎？目前的進度會被清掉。', '重新開始')) { startFresh(); fullRefresh(); }
    }
    updateDock();
  });
  $('#tut').addEventListener('click', (e) => { if (e.target.closest('[data-act=skipTut]')) { tutOn = false; ls.set(TUT_KEY, '1'); updateTut(); } });

  // ───────── 整體刷新 ─────────
  function fullRefresh() {
    syncShops(); updateLabels(); updateHud(); updateSpeedBtns(); updateTicker(); renderEvent(); renderSide(); updateTut();
    const c = S.clockOf(world); city.setClock(c.hour); lastWeather = null;
    const wk = S.getKpi(world).weather; city.setWeather(wk, true); lastWeather = wk;
    hudDirty = false;
  }
  fullRefresh();
  city.start();
  if (world.status !== 'playing') showOver();
  requestAnimationFrame(frameLoop);

  // 給自動試玩用：不經繪製快轉
  window.__game = {
    get world() { return world; },
    get state() { return { speed, panel, modal, selLot, shopTab, tutOn }; },
    ff(hours, { stopOnEvent = false } = {}) {
      const was = speed; speed = 0;
      let i = 0;
      for (; i < hours; i++) {
        if (world.status !== 'playing') break;
        if (eventBlocking()) break;
        const f = step(false);
        if (stopOnEvent && f.newEvents.some((x) => x.needsChoice)) { i++; break; }
      }
      syncShops(); updateLabels(); updateHud(); updateTicker(); renderEvent(); if (panel) renderSide(); updateTut(); save();
      if (world.status !== 'playing') showOver();
      return i;
    },
    setSpeed, startFastForward, selectLot, openReport, openSources, closeModal, save, sim: S, city,
  };
  window.__city = city;
  $('#boot') && $('#boot').classList.add('off');
  await new Promise((r) => setTimeout(r, 800));
  window.__ready = true;
}
