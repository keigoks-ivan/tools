'use strict';

/* ===========================================================================
   遠雄仰森個案追蹤：純前端讀 ../data/*.json（跟青埔主報告共用同一批資料，
   不重複算），沒有伺服器。中文單語頁。ECharts 用法沿用站內 echarts-spec：
   色彩變數 C、baseText/baseGrid/baseTooltip/baseLegend/mkAxis、allCharts 陣列
   + resize handler（分頁切換時也會呼叫一次 resize，隱藏分頁裡的圖表才會量對尺寸）。

   從青埔主報告（../qingpu.js）拆出來的個案頁，分頁架構：現況/銷控表/開價列表/
   成交/戶別試算/怎麼算的，用 URL hash（ascii id 或對應中文）連結、方向鍵可切換。
   第一次載入抓 data/summary.json＋units/listings/meta/estimate/outlook（並行）；
   data/deals.json（11MB）延遲到「現況」「銷控表」「成交」「戶別試算」分頁才抓
   （見 ensureDealsLoaded()），「開價列表」「怎麼算的」不需要。
   =========================================================================== */

var SIZE_LABELS = { small: '小 (<30坪)', mid: '中 (30-45坪)', large: '大 (>45坪)' };
var AGE_LABELS = { presale: '預售', new: '新成屋 (0-2年)', mid_age: '3-10年', old: '10年以上', unknown: '未知' };
var PAGE_SIZE = 50;

var DEALS = [], LISTINGS = [], UNITS = [];
var ESTIMATE = null, OUTLOOK = null, META = {}, SUMMARY = null;
var DEALS_LOADED = false, DEALS_PROMISE = null;

var FILTERS = {
  size: new Set(['small', 'mid', 'large']),
  age: new Set(['presale', 'new', 'mid_age', 'old', 'unknown']),
};

var listingLimit = PAGE_SIZE, yxDealsLimit = PAGE_SIZE, latestLimit = PAGE_SIZE;

/* ---------------------------------------------------------------------------
   小工具
   --------------------------------------------------------------------------- */
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
// 少數說明文字是 Python 那邊算好、原樣寫進 JSON 的（scenarios[].basis、outlook.json
// 的 caveat/observation_note），還留著舊術語；顯示前先換成白話版，不改資料本身的數字。
function deJargon(s) {
  if (!s) return s;
  return String(s)
    .replace(/美國房市常見的MOI門檻/g, '美國房市常見的門檻')
    .replace(/季價指數/g, '轉手/預售倍數');
}
function fmt(n, d) {
  if (n === null || n === undefined || Number.isNaN(n)) return '--';
  d = d === undefined ? 1 : d;
  return Number(n).toLocaleString('zh-Hant-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtInt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '--';
  return Number(n).toLocaleString('zh-Hant-TW');
}
function fmtPct(n, d) {
  if (n === null || n === undefined || Number.isNaN(n)) return '--';
  return fmt(n * 100, d === undefined ? 1 : d) + '%';
}
function fmtDateTime(iso) {
  if (!iso) return '尚未執行';
  var d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-Hant-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function median(arr) {
  var a = arr.filter(function (v) { return v !== null && v !== undefined && !Number.isNaN(v); }).slice().sort(function (x, y) { return x - y; });
  if (!a.length) return null;
  var mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function percentile(sortedArr, p) {
  if (!sortedArr.length) return null;
  var idx = (sortedArr.length - 1) * p;
  var lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}
function withinDays(dateStr, refDate, n) {
  if (!dateStr) return false;
  var d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  var diff = (refDate - d) / 86400000;
  return diff >= 0 && diff <= n;
}
function sizeOk(bucket) { return bucket == null ? true : FILTERS.size.has(bucket); }
function passesFilter(sizeBucket, ageBucket) { return sizeOk(sizeBucket) && FILTERS.age.has(ageBucket); }

/* ---------------------------------------------------------------------------
   ECharts 共用設定（站內 echarts-spec）
   --------------------------------------------------------------------------- */
var C = { navy: '#1e3a5f', green: '#16a34a', orange: '#d97706', red: '#dc2626', blue: '#2563eb', aqua: '#0891b2', muted: '#5a7a9a', grid: '#e8f0f9', text: '#1e3a5f' };
var baseText = { color: C.muted, fontFamily: 'Inter, sans-serif', fontSize: 11 };
var baseGrid = { left: 50, right: 20, top: 36, bottom: 30, containLabel: true };
var baseTooltip = { trigger: 'axis', backgroundColor: '#fff', borderColor: '#ccd9e8', borderWidth: 1, textStyle: { color: C.navy, fontSize: 11, fontFamily: 'Inter' } };
var baseLegend = { top: 4, textStyle: baseText, icon: 'circle', itemWidth: 8, itemHeight: 8 };
function mkAxis(o) { return Object.assign({ axisLine: { lineStyle: { color: C.grid } }, axisTick: { show: false }, axisLabel: baseText, splitLine: { lineStyle: { color: C.grid } } }, o || {}); }
var allCharts = [];
function newChart(id) {
  var dom = document.getElementById(id);
  if (!dom) return null;
  var c = echarts.init(dom);
  allCharts.push(c);
  return c;
}
window.addEventListener('resize', function () { allCharts.forEach(function (c) { if (c) c.resize(); }); });

/* ---------------------------------------------------------------------------
   篩選列
   --------------------------------------------------------------------------- */
function loadFiltersFromStorage() {
  try {
    var raw = localStorage.getItem('qingpuFilters');
    if (!raw) return;
    var obj = JSON.parse(raw);
    if (Array.isArray(obj.size)) FILTERS.size = new Set(obj.size);
    if (Array.isArray(obj.age)) FILTERS.age = new Set(obj.age);
  } catch (e) { /* 私密瀏覽擋存取，用預設值 */ }
}
function saveFiltersToStorage() {
  try { localStorage.setItem('qingpuFilters', JSON.stringify({ size: [...FILTERS.size], age: [...FILTERS.age] })); } catch (e) { /* ignore */ }
}
function initFilterBar() {
  // 篩選 chip 在「開價列表」「成交」兩個分頁各出現一次，都綁同一份 FILTERS
  // 狀態（跟 localStorage 的 key 跟青埔主報告共用，兩邊篩選保持一致）；點其中
  // 一組要連動另一組的顯示（不然切分頁會以為篩選跑掉了）。
  loadFiltersFromStorage();
  document.querySelectorAll('.chip[data-group]').forEach(function (btn) {
    var group = btn.dataset.group, value = btn.dataset.value;
    if (FILTERS[group].has(value)) btn.classList.add('active');
    btn.addEventListener('click', function () {
      var set = FILTERS[group];
      var willActivate = !set.has(value);
      if (willActivate) set.add(value); else set.delete(value);
      document.querySelectorAll('.chip[data-group="' + group + '"][data-value="' + value + '"]').forEach(function (b) {
        b.classList.toggle('active', willActivate);
      });
      saveFiltersToStorage();
      renderFilteredSections(true);
    });
  });
  ['filter-reset', 'filter-reset-2'].forEach(function (id) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', function () {
      FILTERS.size = new Set(['small', 'mid', 'large']);
      FILTERS.age = new Set(['presale', 'new', 'mid_age', 'old', 'unknown']);
      document.querySelectorAll('.chip[data-group]').forEach(function (b) { b.classList.add('active'); });
      saveFiltersToStorage();
      renderFilteredSections(true);
    });
  });
}

/* ---------------------------------------------------------------------------
   資料載入
   --------------------------------------------------------------------------- */
async function fetchJsonSafe(path, fallback) {
  try {
    var res = await fetch(path);
    return res.ok ? await res.json() : fallback;
  } catch (e) { return fallback; }
}
async function fetchJsonlSafe(path) {
  try {
    var res = await fetch(path);
    if (!res.ok) return [];
    var text = await res.text();
    return text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) { return []; }
}

async function loadSummary() {
  var res = await fetch('../data/summary.json');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  SUMMARY = await res.json();
  return SUMMARY;
}

// 跟青埔主報告共用同一批 data/*.json（路徑用 ../data/，這支頁面放在
// tw/qingpu/yangsen/ 底下），都不大（合計不到3MB），並行抓，不等 deals.json。
async function loadData() {
  var listingsJson = await fetchJsonSafe('../data/listings.json', { listings: {} });
  var unitsJson = await fetchJsonSafe('../data/units.json', { units: [] });
  META = await fetchJsonSafe('../data/meta.json', {});
  LISTINGS = Object.values(listingsJson.listings || {});
  UNITS = unitsJson.units || [];
  META._listingsUpdatedAt = listingsJson.updated_at;

  ESTIMATE = await fetchJsonSafe('../data/estimate.json', null);
  OUTLOOK = await fetchJsonSafe('../data/outlook.json', null);
}

// deals.json 約11MB，「現況」「銷控表」「成交」「戶別試算」分頁才需要，
// 第一次打開其中一個才抓；抓過就快取在 DEALS，不重複抓。
function ensureDealsLoaded() {
  if (DEALS_PROMISE) return DEALS_PROMISE;
  DEALS_PROMISE = fetch('../data/deals.json').then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function (json) {
    DEALS = json.deals || [];
    META._dealsUpdatedAt = json.updated_at;
    DEALS_LOADED = true;
    onDealsLoaded();
  }).catch(function (err) {
    console.error(err);
    onDealsError(err);
    throw err;
  });
  return DEALS_PROMISE;
}
function onDealsLoaded() {
  ['yx-deals-loading', 'estimator-loading'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var estBox = document.getElementById('estimator-box');
  if (estBox) estBox.style.display = '';
  renderYxDealsSection();
  renderSalesGrid();
  populateEstimatorSelects();
  renderStatusSummary();
  requestAnimationFrame(function () { allCharts.forEach(function (c) { if (c) c.resize(); }); });
}
function onDealsError(err) {
  var msg = '成交明細載入失敗：' + err.message + '，請重新整理頁面再試一次。';
  ['yx-deals-loading', 'estimator-loading'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.textContent = msg; el.classList.add('error-line'); }
  });
}

/* ---------------------------------------------------------------------------
   通用可排序表格（沿用原版邏輯，換成 data-table 樣式）
   --------------------------------------------------------------------------- */
function makeTable(tableEl, columns, defaultSort) {
  var theadRow = tableEl.querySelector('thead tr');
  var tbody = tableEl.querySelector('tbody');
  var rows = [];
  var limit = Infinity;
  var state = { key: defaultSort.key, dir: defaultSort.dir || 'desc' };

  function buildHead() {
    theadRow.innerHTML = columns.map(function (c) {
      var dirAttr = state.key === c.key ? (state.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return '<th data-key="' + c.key + '" style="cursor:pointer;white-space:nowrap">' + esc(c.label) + dirAttr + '</th>';
    }).join('');
    theadRow.querySelectorAll('th').forEach(function (th, i) {
      th.addEventListener('click', function () {
        var key = columns[i].key;
        if (state.key === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.key = key; state.dir = 'desc'; }
        render();
      });
    });
  }

  function sortedRows() {
    var col = columns.find(function (c) { return c.key === state.key; });
    var arr = rows.slice();
    arr.sort(function (a, b) {
      var va = col.value(a), vb = col.value(b);
      if (col.type === 'num') {
        if (va === null || va === undefined) va = -Infinity;
        if (vb === null || vb === undefined) vb = -Infinity;
        var cmp = va - vb;
        return state.dir === 'asc' ? cmp : -cmp;
      }
      va = va === null || va === undefined ? '' : va;
      vb = vb === null || vb === undefined ? '' : vb;
      var cmp2 = va < vb ? -1 : va > vb ? 1 : 0;
      return state.dir === 'asc' ? cmp2 : -cmp2;
    });
    return arr;
  }

  function render() {
    buildHead();
    var sorted = sortedRows();
    var shown = sorted.slice(0, limit);
    tbody.innerHTML = shown.map(function (r) {
      return '<tr>' + columns.map(function (c) { return '<td>' + c.cell(r) + '</td>'; }).join('') + '</tr>';
    }).join('') || '<tr><td colspan="' + columns.length + '">沒有符合條件的資料。</td></tr>';
    return { total: sorted.length, shown: shown.length };
  }

  return {
    setRows: function (r) { rows = r; },
    setLimit: function (n) { limit = n; },
    render: render,
  };
}

function staticTable(tableEl, columns, rows) {
  var theadRow = tableEl.querySelector('thead tr');
  var tbody = tableEl.querySelector('tbody');
  theadRow.innerHTML = columns.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('');
  tbody.innerHTML = rows.map(function (r) {
    return '<tr>' + columns.map(function (c) { return '<td>' + c.cell(r) + '</td>'; }).join('') + '</tr>';
  }).join('') || '<tr><td colspan="' + columns.length + '">沒有資料。</td></tr>';
}

/* ===========================================================================
   仰森現況
   =========================================================================== */
function tileHTML(label, value, sub, cls) {
  return '<div class="kpi-card' + (cls ? ' ' + cls : '') + '"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-value">' + value + '</div>' + (sub ? '<div class="kpi-source">' + sub + '</div>' : '') + '</div>';
}
// 591樓層欄位格式固定是「11F/24F」，取分子當樓層數。
function parseFloorNum(floorStr) {
  if (!floorStr) return null;
  var m = String(floorStr).match(/^(\d+)F/);
  return m ? parseInt(m[1], 10) : null;
}
var statusFloorAskChart;
function renderFloorAskChart() {
  var yxUnits = UNITS.filter(function (u) { return u.is_yuanxiong && u.adj_unitprice != null; });
  var bySize = { small: [], mid: [], large: [] };
  yxUnits.forEach(function (u) {
    var fl = parseFloorNum(u.floor);
    if (fl == null || !bySize[u.adj_size_bucket]) return;
    bySize[u.adj_size_bucket].push([fl, u.adj_unitprice]);
  });
  if (!statusFloorAskChart) statusFloorAskChart = newChart('chart-status-floor-ask');
  if (!statusFloorAskChart) return;
  var sizeColors = { small: C.blue, mid: C.orange, large: C.red };
  statusFloorAskChart.setOption({
    tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#ccd9e8', borderWidth: 1, textStyle: baseTooltip.textStyle, formatter: function (p) { return p.value[0] + 'F：' + fmt(p.value[1], 1) + ' 萬/坪'; } },
    legend: baseLegend, grid: baseGrid,
    xAxis: mkAxis({ type: 'value', name: '樓層', minInterval: 1, axisLabel: Object.assign({}, baseText, { formatter: function (v) { return v + 'F'; } }) }),
    yAxis: mkAxis({ type: 'value', name: '開價(扣車位,萬/坪)' }),
    series: ['small', 'mid', 'large'].map(function (k) {
      return { name: SIZE_LABELS[k].split(' ')[0], type: 'scatter', symbolSize: 9, data: bySize[k], itemStyle: { color: sizeColors[k] } };
    }),
  }, true);
  var n = yxUnits.filter(function (u) { return parseFloorNum(u.floor) != null; }).length;
  var noteEl = document.getElementById('status-floor-ask-note');
  if (noteEl) noteEl.textContent = '仰森591去重後在售戶（n=' + n + '）開價（已扣車位）依樓層分布，依坪數分類上色；同一樓層常見多戶、開價受坪數/朝向影響，不是純樓層溢價。資料來源：units.json。';
}
function hadRecentDrop(listing, refDate, days) {
  var p = listing.prices || [];
  if (p.length < 2) return false;
  var prev = p[p.length - 2][1], cur = p[p.length - 1][1], curDate = p[p.length - 1][0];
  return withinDays(curDate, refDate, days) && cur < prev;
}
function renderTiles() {
  var refDate = META._listingsUpdatedAt ? new Date(META._listingsUpdatedAt) : new Date();
  var yxAll = LISTINGS.filter(function (l) { return l.is_yuanxiong; });
  var yxActive = yxAll.filter(function (l) { return l.active; });
  var yxUnits = UNITS.filter(function (u) { return u.is_yuanxiong; });
  var medAll = median(yxUnits.map(function (u) { return u.adj_unitprice; }));
  var bySize = ['small', 'mid', 'large'].map(function (key) {
    var arr = yxUnits.filter(function (u) { return u.adj_size_bucket === key; }).map(function (u) { return u.adj_unitprice; });
    return { key: key, n: arr.filter(function (v) { return v != null; }).length, med: median(arr) };
  });
  // 最近一筆成交：直接用 summary.json 已經算好的（不用等 deals.json 11MB 抓完）。
  var lastDeal = SUMMARY && SUMMARY.yx_current && SUMMARY.yx_current.last_deal;
  var WIN = 31; // 近一個月（每月排程，用約31天窗口）
  var newN = yxAll.filter(function (l) { return withinDays(l.first_seen, refDate, WIN); }).length;
  var dropN = yxAll.filter(function (l) { return hadRecentDrop(l, refDate, WIN); }).length;
  var removedN = yxAll.filter(function (l) { return l.removed_at && withinDays(l.removed_at, refDate, WIN); }).length;
  // 第一次抓取時每筆都是「新上架」，要有上個月的快照才有意義
  var firstSeenDates = yxAll.map(function (l) { return l.first_seen; }).filter(Boolean).sort();
  var hasHistory = firstSeenDates.length && !withinDays(firstSeenDates[0], refDate, WIN);

  var tiles = [
    tileHTML('在售筆數', '約 ' + fmtInt(yxUnits.length) + ' 戶', '591刊登 ' + fmtInt(yxActive.length) + ' 則（同戶重複刊登已合併）'),
    tileHTML('開價中位數', medAll != null ? fmt(medAll, 1) + ' 萬/坪' : '--', bySize.map(function (b) { return SIZE_LABELS[b.key] + '：' + (b.med != null ? fmt(b.med, 1) + '萬/坪' : '--') + '（n=' + b.n + '）'; }).join('<br>')),
    tileHTML('最近一筆成交', lastDeal ? fmt(lastDeal.unit_price_wan_ping, 1) + ' 萬/坪' : '--', lastDeal ? lastDeal.date + '・' + esc(lastDeal.floor_label || '') + (lastDeal.deal_kind === 'resale' ? '（交屋後轉手）' : lastDeal.deal_kind === 'presale_transfer' ? '（預售交屋登記）' : '') : '尚無資料'),
    tileHTML('近一個月新上架', hasHistory ? fmtInt(newN) : '--', hasHistory ? '' : '首次抓取，下個月起才有比較基準'),
    tileHTML('近一個月降價', hasHistory ? fmtInt(dropN) : '--', ''),
    tileHTML('近一個月下架', hasHistory ? fmtInt(removedN) : '--', ''),
  ];
  document.getElementById('tiles-grid').innerHTML = tiles.join('');

  document.getElementById('status-conclusion').textContent =
    '仰森591去重後在售約 ' + fmtInt(yxUnits.length) + ' 戶，開價中位數 ' + fmt(medAll, 1) + ' 萬/坪；最近一筆成交 ' + (lastDeal ? lastDeal.date + '、' + fmt(lastDeal.unit_price_wan_ping, 1) + ' 萬/坪' : '尚無資料') + '。';
  document.getElementById('status-method').innerHTML =
    '<ul><li>「在售筆數」「開價中位數」用 591 同戶重複刊登去重後的「戶」（見資料說明的591去重規則），不是原始刊登筆數。</li>' +
    '<li>「近一個月」用約31天窗口，配合每月排程頻率；591下架判定門檻目前是 1（排程改成每月一次後，只要這一輪關鍵字完整抓完就直接採信，不用等第二輪確認，partial crawl 保護仍保留）。</li>' +
    '</ul>';
  renderStatusSummary();
  renderFloorAskChart();
}

// 同建案轉手/預售倍數（見「戶別試算」情境三倍數，來自 outlook.json），套到仰森
// 自己的預售單價中位數，給一個「現在市價大概落在哪個範圍」的區間，不是預測。
function renderStatusSummary() {
  var el = document.getElementById('status-scenario-summary');
  if (!el) return;
  if (!DEALS_LOADED || !OUTLOOK || !OUTLOOK.scenarios) { el.textContent = ''; return; }
  var presaleUnits = DEALS.filter(function (d) { return d.is_yuanxiong && d.deal_kind === 'presale' && d.unit_price_wan_ping_precise != null; })
    .map(function (d) { return d.unit_price_wan_ping_precise; });
  var presaleMedian = median(presaleUnits);
  if (presaleMedian == null) { el.textContent = ''; return; }
  var sc = OUTLOOK.scenarios;
  var names = ['收斂', '維持', '回升'].filter(function (n) { return sc[n]; });
  if (!names.length) { el.textContent = ''; return; }
  var vals = names.map(function (n) { var m = sc[n].multiplier != null ? sc[n].multiplier : sc[n].index; return { name: n, unit: presaleMedian * m }; });
  el.textContent = '把三個轉手/預售倍數情境套到仰森自己的預售單價中位數（' + fmt(presaleMedian, 2) + ' 萬/坪，n=' + presaleUnits.length + '），現在市價大概落在 ' +
    vals.map(function (v) { return v.name + ' ' + fmt(v.unit, 1) + ' 萬/坪'; }).join('、') + '（同一戶要精確試算見「戶別試算」分頁）。';
}

/* ===========================================================================
   戶別試算
   =========================================================================== */
var EST_SELECTED = null; // {unit_code, floor_num}

function estYxPresaleDeals() {
  return DEALS.filter(function (d) { return d.is_yuanxiong && d.deal_kind === 'presale' && d.unit_code && d.floor_num != null; });
}

function populateEstimatorSelects() {
  var rows = estYxPresaleDeals();
  var buildings = [...new Set(rows.map(function (d) { return d.unit_code[0]; }))].sort();
  var bSel = document.getElementById('est-building');
  buildings.forEach(function (b) { var o = document.createElement('option'); o.value = b; o.textContent = b + ' 棟'; bSel.appendChild(o); });

  function refreshUnitOptions() {
    var b = bSel.value;
    var uSel = document.getElementById('est-unit');
    uSel.innerHTML = '<option value="">請選擇</option>';
    var codes = [...new Set(rows.filter(function (d) { return !b || d.unit_code[0] === b; }).map(function (d) { return d.unit_code; }))].sort();
    codes.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; uSel.appendChild(o); });
    refreshFloorOptions();
  }
  function refreshFloorOptions() {
    var u = document.getElementById('est-unit').value;
    var fSel = document.getElementById('est-floor');
    fSel.innerHTML = '<option value="">請選擇</option>';
    if (!u) return;
    var floors = [...new Set(rows.filter(function (d) { return d.unit_code === u; }).map(function (d) { return d.floor_num; }))].sort(function (a, b) { return a - b; });
    floors.forEach(function (fl) { var o = document.createElement('option'); o.value = fl; o.textContent = fl + 'F'; fSel.appendChild(o); });
  }
  bSel.addEventListener('change', refreshUnitOptions);
  document.getElementById('est-unit').addEventListener('change', refreshFloorOptions);
  document.getElementById('est-floor').addEventListener('change', function () {
    var u = document.getElementById('est-unit').value, fl = document.getElementById('est-floor').value;
    if (u && fl) selectEstimatorUnit(u, parseInt(fl, 10));
  });
  document.getElementById('est-clear').addEventListener('click', function () { clearEstimatorSelection(); });
}

function clearEstimatorSelection() {
  EST_SELECTED = null;
  document.getElementById('est-building').value = '';
  document.getElementById('est-unit').innerHTML = '<option value="">請選擇</option>';
  document.getElementById('est-floor').innerHTML = '<option value="">請選擇</option>';
  document.getElementById('estimator-empty').style.display = 'block';
  document.getElementById('estimator-result').style.display = 'none';
  document.getElementById('estimator-basis').textContent = '';
  document.querySelectorAll('td.grid-cell.picked').forEach(function (td) { td.classList.remove('picked'); });
}

function selectEstimatorUnit(unitCode, floorNum) {
  var rows = estYxPresaleDeals().filter(function (d) { return d.unit_code === unitCode && d.floor_num === floorNum; });
  if (!rows.length) return;
  var deal = rows.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0]; // 多筆取最新
  EST_SELECTED = { unit_code: unitCode, floor_num: floorNum, deal: deal };

  document.getElementById('est-building').value = unitCode[0];
  var uSel = document.getElementById('est-unit');
  if (uSel.value !== unitCode) {
    uSel.innerHTML = '<option value="">請選擇</option>';
    estYxPresaleDeals().filter(function (d) { return d.unit_code[0] === unitCode[0]; }).map(function (d) { return d.unit_code; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort().forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; uSel.appendChild(o); });
    uSel.value = unitCode;
  }
  var fSel = document.getElementById('est-floor');
  fSel.innerHTML = '<option value="">請選擇</option>';
  estYxPresaleDeals().filter(function (d) { return d.unit_code === unitCode; }).map(function (d) { return d.floor_num; })
    .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; })
    .forEach(function (fl) { var o = document.createElement('option'); o.value = fl; o.textContent = fl + 'F'; fSel.appendChild(o); });
  fSel.value = floorNum;

  document.querySelectorAll('td.grid-cell.picked').forEach(function (td) { td.classList.remove('picked'); });
  var cell = document.querySelector('td.grid-cell[data-unit-code="' + unitCode + '"][data-floor="' + floorNum + '"]');
  if (cell) cell.classList.add('picked');

  renderEstimatorResult();
}

function floorFitSlopeFor(unitCode) {
  if (!ESTIMATE || !ESTIMATE.floor_fit) return 0;
  var ff = ESTIMATE.floor_fit;
  var byCode = ff.by_unit_code && ff.by_unit_code[unitCode];
  if (byCode && byCode.n >= (ff.min_n_unit_code || 8) && byCode.slope != null) return byCode.slope;
  var bcode = unitCode[0];
  var byB = ff.by_building && ff.by_building[bcode];
  if (byB && byB.n >= (ff.min_n_building || 15) && byB.slope != null) return byB.slope;
  return ff.pooled_slope || 0;
}

function renderEstimatorResult() {
  if (!EST_SELECTED || !ESTIMATE) return;
  document.getElementById('estimator-empty').style.display = 'none';
  var resultEl = document.getElementById('estimator-result');
  resultEl.style.display = 'grid';

  var deal = EST_SELECTED.deal;
  var presaleUnit = deal.unit_price_wan_ping_precise;
  var area = deal.area_ping;
  var car = deal.car_price_wan || 0;

  document.getElementById('estimator-basis').innerHTML =
    '選定：<strong>' + esc(EST_SELECTED.unit_code) + '-' + EST_SELECTED.floor_num + 'F</strong>　預售簽約 ' + deal.date + '　單價 ' + fmt(presaleUnit, 2) + ' 萬/坪　' + fmt(area, 1) + ' 坪（不含車位）　車位 ' + fmt(car, 0) + ' 萬' + (rows_len_gt1(deal) ? '　（此格有多筆交易，取最新一筆）' : '');

  function roundTo10(v) { return v == null ? null : Math.round(v / 10) * 10; }
  function totalFrom(unitPrice) { return unitPrice == null ? null : roundTo10(unitPrice * area + car); }

  var cards = [];

  // 同案漲幅法：現在市價
  var upl = ESTIMATE.same_project_uplift || {};
  var marketUnit = upl.median != null ? presaleUnit * (1 + upl.median) : null;
  var marketLo = upl.p25 != null ? presaleUnit * (1 + upl.p25) : null;
  var marketHi = upl.p75 != null ? presaleUnit * (1 + upl.p75) : null;
  cards.push(estCard('現在市價（同案漲幅法）', marketUnit != null ? fmt(marketUnit, 2) + ' 萬/坪' : '--',
    '範圍(IQR) ' + fmt(marketLo, 2) + '–' + fmt(marketHi, 2) + ' 萬/坪，n=' + (upl.n_projects || 0) + ' 個建案；總價約 ' + fmtInt(totalFrom(marketUnit)) + ' 萬（範圍 ' + fmtInt(totalFrom(marketLo)) + '–' + fmtInt(totalFrom(marketHi)) + ' 萬）'));

  // 三個情境（來自 OUTLOOK.scenarios，指數 x 該戶預售單價）
  if (OUTLOOK && OUTLOOK.scenarios) {
    Object.keys(OUTLOOK.scenarios).forEach(function (name) {
      var s = OUTLOOK.scenarios[name];
      var mult = s.multiplier != null ? s.multiplier : s.index; // 相容兩種鍵名
      var unitP = mult != null ? presaleUnit * mult : null;
      cards.push(estCard('情境：' + name, unitP != null ? fmt(unitP, 2) + ' 萬/坪' : '--',
        (mult != null ? '倍數 ' + fmt(mult, 4) + '　' : '') + '總價約 ' + fmtInt(totalFrom(unitP)) + ' 萬<br>依據：' + esc(deJargon(s.basis) || '--')));
    });
  }

  // 對照：591開價換算到選定樓層
  var cc = ESTIMATE.cross_check_ask_pool || {};
  var pool = cc.units || [];
  var adjTol = cc.adj_area_tolerance || 1.2, rawTol = cc.raw_area_tolerance || 1.8;
  var slope = floorFitSlopeFor(EST_SELECTED.unit_code);
  var matched = pool.filter(function (u) {
    if (u.adj_area != null && Math.abs(u.adj_area - area) <= adjTol) return true;
    if (u.has_carport && u.raw_area != null && Math.abs(u.raw_area - area) <= rawTol) return true;
    return false;
  });
  var converted = matched.map(function (u) { return u.adj_unitprice - slope * (u.floor - EST_SELECTED.floor_num); }).sort(function (a, b) { return a - b; });
  var ccLo = percentile(converted, 0.25), ccHi = percentile(converted, 0.75);
  cards.push(estCard('對照：591開價換算到' + EST_SELECTED.floor_num + 'F', converted.length ? fmt(ccLo, 2) + '–' + fmt(ccHi, 2) + ' 萬/坪' : '--',
    '仰森591在售同型戶（坪數±容許值），用戶別自己的樓層斜率換算，n=' + converted.length + '；只是對照，不是主方法'));

  // 建議開價
  var premium = (ESTIMATE.ask_premium || {}).value;
  var suggested = (marketUnit != null && premium != null) ? marketUnit * (1 + premium) : null;
  var capped = false;
  if (suggested != null && ccHi != null && suggested > ccHi) { suggested = ccHi; capped = true; }
  cards.push(estCard('建議開價', suggested != null ? fmt(suggested, 2) + ' 萬/坪' : '--',
    '現在市價 ×（1+開價溢價 ' + fmtPct(premium) + '）' + (capped ? '，已被591開價換算75百分位封頂' : '') + '；溢價來源：' + ((ESTIMATE.ask_premium || {}).source === 'same_project' ? '同建案(n=' + (((ESTIMATE.ask_premium || {}).detail || {}).n_projects || 0) + ')' : '屋齡0-3年退回青埔全區') + '；總價約 ' + fmtInt(totalFrom(suggested)) + ' 萬'));

  // 要多久
  var abs = ESTIMATE.absorption || {};
  // 用同型戶（591同坪數池，跟建議開價相同 tolerance）裡開價 <= 建議開價的筆數
  var queueN = suggested != null ? converted.filter(function (v) { return v <= suggested; }).length : null;
  var months = (queueN != null && abs.avg_per_month) ? queueN / abs.avg_per_month : null;
  cards.push(estCard('要多久（對照）', months != null ? fmt(months, 1) + ' 個月' : '--',
    '排隊 ' + fmtInt(queueN) + ' 戶（591同型開價≤建議開價）÷ 青埔屋齡0-3年、24-35坪中古月均成交 ' + fmt(abs.avg_per_month, 2) + ' 件；成交速度是通用值，不是這個坪數型自己的樣本'));

  resultEl.innerHTML = cards.join('');
}
function rows_len_gt1() { return false; } // 佔位：目前每格取最新一筆，多筆情況見銷控表 badge
function estCard(label, value, sub) {
  return '<div class="est-card"><div class="est-label">' + esc(label) + '</div><div class="est-value">' + value + '</div><div class="est-sub">' + sub + '</div></div>';
}

function renderEstimatorMethod() {
  document.getElementById('estimator-method').innerHTML =
    '<ul>' +
    '<li>這是通用工具：任何一戶都用同一組係數試算，不是預先算好某一戶的答案。</li>' +
    '<li>現在市價＝同建案漲幅法：選定戶的預售單價 ×（1+同建案漲幅中位數），範圍用25–75百分位（IQR）。</li>' +
    '<li>三個情境（維持/收斂/回升）＝三個轉手/預售倍數（見「價格走向」），直接乘上選定戶的預售單價；不是預測，是把已觀察到的倍數水準套進來。</li>' +
    '<li>樓層換算斜率：優先用該戶別代碼自己的迴歸，樣本不足退回同棟迴歸，再不足退回全案迴歸。</li>' +
    '<li>建議開價＝現在市價 ×（1+開價溢價），溢價來源優先用「同時有591在售、又有中古成交、屋齡0-3年」的建案，不足3個才退回青埔全區屋齡0-3年比例；上限是591開價換算後的75百分位。</li>' +
    '<li>要多久用「青埔屋齡0-3年、24-35坪」中古每月平均成交幾件當分母，不論選哪一戶都用同一個值——這是唯一樣本量穩定夠用的組合，不是該戶自己坪數型的成交速度。</li>' +
    '</ul>';
}

/* ===========================================================================
   仰森開價列表
   =========================================================================== */
function estTag(l) { return l.adj_estimated ? ' <span class="badge-est">估</span>' : ''; }
function postingsDetail(u) {
  var ids = u.houseids || [], links = u.links || [];
  if (ids.length <= 1) return links[0] ? '<a href="' + esc(links[0]) + '" target="_blank" rel="noopener">591</a>' : '--';
  return '<details><summary>' + ids.length + ' 則</summary><ul>' + ids.map(function (id, i) { return '<li><a href="' + esc(links[i]) + '" target="_blank" rel="noopener">' + esc(id) + '</a></li>'; }).join('') + '</ul></details>';
}
var listingColumns = [
  { key: 'adj_unitprice', label: '開價(扣車位)', type: 'num', value: function (u) { return u.adj_unitprice; }, cell: function (u) { return fmt(u.adj_unitprice, 1) + estTag(u); } },
  { key: 'unitprice', label: '591原始單價', type: 'num', value: function (u) { return u.unitprice; }, cell: function (u) { return fmt(u.unitprice, 1); } },
  { key: 'min_price', label: '總價(萬,最低)', type: 'num', value: function (u) { return u.min_price; }, cell: function (u) { return fmt(u.min_price, 0); } },
  { key: 'area', label: '坪數', type: 'num', value: function (u) { return u.area; }, cell: function (u) { return fmt(u.area, 1); } },
  { key: 'size_bucket', label: '坪數分類', type: 'str', value: function (u) { return u.adj_size_bucket || ''; }, cell: function (u) { return SIZE_LABELS[u.adj_size_bucket] || '--'; } },
  { key: 'age', label: '屋齡', type: 'num', value: function (u) { return u.age_years; }, cell: function (u) { return esc(u.showhouseage || '--'); } },
  { key: 'age_bucket', label: '屋齡分類', type: 'str', value: function (u) { return u.age_bucket || ''; }, cell: function (u) { return AGE_LABELS[u.age_bucket] || '--'; } },
  { key: 'floor', label: '樓層', type: 'str', value: function (u) { return u.floor || ''; }, cell: function (u) { return esc(u.floor || '--'); } },
  { key: 'room', label: '房型', type: 'str', value: function (u) { return u.room || ''; }, cell: function (u) { return esc(u.room || '--'); } },
  { key: 'post_date', label: '上架日', type: 'str', value: function (u) { return u.post_date || u.first_seen || ''; }, cell: function (u) { return esc(u.post_date || u.first_seen || '--'); } },
  { key: 'n_postings', label: '刊登', type: 'num', value: function (u) { return u.n_postings; }, cell: postingsDetail },
];
var listingTable;
function renderListingTable() {
  var rows = UNITS.filter(function (u) { return u.is_yuanxiong && passesFilter(u.adj_size_bucket, u.age_bucket); });
  listingTable.setRows(rows); listingTable.setLimit(listingLimit);
  var t = listingTable.render();
  document.getElementById('listing-more').style.display = t.total > listingLimit ? 'inline-block' : 'none';
  document.getElementById('listing-conclusion').textContent = '仰森591去重後開價列表共 ' + fmtInt(t.total) + ' 戶符合目前篩選條件。';
  document.getElementById('listing-method').innerHTML = '<ul><li>一列一戶：同一戶被多個仲介重複刊登，依（社區/道路、樓層字串、坪數取到0.5坪）分組，組內開價差在3%以內視為同戶，合併後取最低價那筆代表。</li><li>「開價(扣車位)」是否有車位、開價是否已含車位判斷見資料說明；標「估」代表用同社區或青埔近24個月車位中位數扣算。</li></ul>';
}

/* ===========================================================================
   仰森成交
   =========================================================================== */
function dealFlags(d) {
  var b = [];
  if (d.car_lumped) b.push('<span class="badge-flag">車位灌入</span>');
  if (d.special) b.push('<span class="badge-flag">特殊交易</span>');
  return b.join(' ') || '--';
}
function dealKindLabel(d) {
  if (d.deal_kind === 'presale') return '預售';
  if (d.deal_kind === 'presale_transfer') return '預售交屋登記';
  return d.is_yuanxiong ? '交屋後轉手' : '中古/新成屋';
}
var yxDealsColumns = [
  { key: 'date', label: '日期', type: 'str', value: function (d) { return d.date; }, cell: function (d) { return d.date; } },
  { key: 'floor_label', label: '棟號/樓層', type: 'str', value: function (d) { return d.floor_label || ''; }, cell: function (d) { return esc(d.floor_label || '--'); } },
  { key: 'area_ping', label: '坪數', type: 'num', value: function (d) { return d.area_ping; }, cell: function (d) { return fmt(d.area_ping, 1); } },
  { key: 'total_price_wan', label: '總價(萬)', type: 'num', value: function (d) { return d.total_price_wan; }, cell: function (d) { return fmt(d.total_price_wan, 0); } },
  { key: 'unit_price_wan_ping', label: '萬/坪', type: 'num', value: function (d) { return d.unit_price_wan_ping; }, cell: function (d) { return fmt(d.unit_price_wan_ping, 1); } },
  { key: 'kind', label: '類型', type: 'str', value: function (d) { return d.deal_kind; }, cell: dealKindLabel },
  { key: 'age_bucket', label: '屋齡分類', type: 'str', value: function (d) { return d.age_bucket || ''; }, cell: function (d) { return AGE_LABELS[d.age_bucket] || '--'; } },
  { key: 'flags', label: '旗標', type: 'str', value: function () { return ''; }, cell: dealFlags },
];
var yxDealsTable, yxDealsChart;
function renderYxDealsChart(rows) {
  var presale = rows.filter(function (d) { return d.deal_kind !== 'resale'; }).map(function (d) { return [Date.parse(d.date), d.unit_price_wan_ping]; });
  var resale = rows.filter(function (d) { return d.deal_kind === 'resale'; }).map(function (d) { return [Date.parse(d.date), d.unit_price_wan_ping]; });
  if (!yxDealsChart) yxDealsChart = newChart('chart-yx-deals');
  if (!yxDealsChart) return;
  yxDealsChart.setOption({
    tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#ccd9e8', borderWidth: 1, textStyle: baseTooltip.textStyle, formatter: function (p) { return new Date(p.value[0]).toISOString().slice(0, 10) + '：' + fmt(p.value[1], 1) + ' 萬/坪'; } },
    legend: baseLegend,
    grid: baseGrid,
    xAxis: mkAxis({ type: 'time' }),
    yAxis: mkAxis({ type: 'value', name: '萬/坪' }),
    series: [
      { name: '預售（含交屋登記）', type: 'scatter', data: presale, symbolSize: 8, itemStyle: { color: C.blue } },
      { name: '交屋後轉手', type: 'scatter', data: resale, symbolSize: 8, itemStyle: { color: C.orange } },
    ],
  }, true);
}
function renderYxDealsSection() {
  var rows = DEALS.filter(function (d) { return d.is_yuanxiong && passesFilter(d.size_bucket, d.age_bucket); });
  renderYxDealsChart(rows);
  yxDealsTable.setRows(rows); yxDealsTable.setLimit(yxDealsLimit);
  var t = yxDealsTable.render();
  document.getElementById('yxdeals-more').style.display = t.total > yxDealsLimit ? 'inline-block' : 'none';
  var presaleN = rows.filter(function (d) { return d.deal_kind !== 'resale'; }).length;
  var resaleN = rows.filter(function (d) { return d.deal_kind === 'resale'; }).length;
  document.getElementById('deals-conclusion').textContent = '仰森累計預售（含交屋登記）' + fmtInt(presaleN) + ' 筆、交屋後轉手 ' + fmtInt(resaleN) + ' 筆（符合目前篩選）。';
  document.getElementById('deals-method').innerHTML = '<ul><li>預售屋簽約（B檔）和交屋前過戶（A檔）常各登記一次，已用（行政區、交易日期、總價、樓層）比對去重；配不到的多半是2021年7月B檔開始登記前簽的約，標「預售交屋登記」。</li><li>交屋後150天內完成的買賣登記也算預售交屋登記，不算轉手（轉手需要原屋主先交屋、住一段時間才會賣，不可能交屋一兩個月內就有全新第三方交易）。</li></ul>';
}

/* ===========================================================================
   仰森銷控表
   =========================================================================== */
function normalizeDigitsJs(s) { var full = '０１２３４５６７８９', half = '0123456789'; return (s || '').replace(/[０-９]/g, function (c) { return half[full.indexOf(c)]; }); }
function extractDoorNumberJs(address) {
  var norm = normalizeDigitsJs(address);
  var idx = norm.indexOf('領航南路二段');
  if (idx === -1) return null;
  var rest = norm.slice(idx + '領航南路二段'.length);
  var m = rest.match(/^(\d+)\s*號/);
  return m ? parseInt(m[1], 10) : null;
}
function unitSortKey(code) { var m = code.match(/^([A-Za-z]+)(\d+)$/); if (!m) return [code, 0]; return [m[1], parseInt(m[2], 10)]; }
function isoToRocYM(iso) { var p = iso.split('-'); return (parseInt(p[0], 10) - 1911) + '/' + p[1]; }
function colorForGridValue(value, min, max) {
  if (value == null || max == null || min == null || max === min) return 'transparent';
  var t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  var alpha = 0.08 + t * 0.55;
  return 'rgba(37,99,235,' + alpha.toFixed(2) + ')';
}
function gridCellHTML(deals, mode, min, max, unitCode, floorNum) {
  if (!deals || !deals.length) return '<td class="grid-cell empty">·</td>';
  var sorted = deals.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var d0 = sorted[0];
  var value = mode === 'unit' ? d0.unit_price_wan_ping_precise : d0.total_price_wan;
  var valueText = mode === 'unit' ? fmt(value, 2) : fmt(value, 0);
  var bg = colorForGridValue(mode === 'unit' ? value : d0.total_price_wan, min, max);
  var roc = isoToRocYM(d0.date);
  var dot = (d0.special || d0.car_lumped) ? '<span class="dot-special" title="特殊交易或車位灌入總價"></span>' : '';
  var badge = sorted.length > 1 ? '<span class="badge-multi" title="這格有多筆交易，顯示最新一筆">多筆</span>' : '';
  var tooltip = sorted.map(function (x) { return x.date + '｜' + fmt(x.unit_price_wan_ping_precise, 2) + '萬/坪｜總價' + fmt(x.total_price_wan, 0) + '萬'; }).join('\n');
  var attrs = unitCode != null ? ' data-unit-code="' + esc(unitCode) + '" data-floor="' + floorNum + '"' : '';
  return '<td class="grid-cell" style="background:' + bg + '" title="' + esc(tooltip) + '"' + attrs + '><span class="grid-cell-date">' + roc + '</span><span class="grid-cell-value">' + valueText + '</span>' + dot + badge + '</td>';
}
function buildMainGridData() {
  var rows = DEALS.filter(function (d) { return d.is_yuanxiong && d.deal_kind === 'presale' && d.unit_code && d.floor_num != null; });
  var cellMap = new Map();
  rows.forEach(function (d) { var key = d.unit_code + '|' + d.floor_num; if (!cellMap.has(key)) cellMap.set(key, []); cellMap.get(key).push(d); });
  var units = [...new Set(rows.map(function (d) { return d.unit_code; }))].sort(function (a, b) { var ka = unitSortKey(a), kb = unitSortKey(b); return ka[0] === kb[0] ? ka[1] - kb[1] : (ka[0] < kb[0] ? -1 : 1); });
  var floors = [...new Set(rows.map(function (d) { return d.floor_num; }))].sort(function (a, b) { return b - a; });
  return { units: units, floors: floors, cellMap: cellMap };
}
function buildTransferGridData() {
  var cellMap = new Map();
  DEALS.filter(function (d) { return d.is_yuanxiong && d.deal_kind === 'presale_transfer'; }).forEach(function (d) {
    var door = extractDoorNumberJs(d.address);
    if (door == null || d.floor_num == null) return;
    var key = door + '|' + d.floor_num;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key).push(d);
  });
  var all = [...cellMap.values()].flat();
  var doors = [...new Set(all.map(function (d) { return extractDoorNumberJs(d.address); }))].sort(function (a, b) { return a - b; });
  var floors = [...new Set(all.map(function (d) { return d.floor_num; }))].sort(function (a, b) { return b - a; });
  return { doors: doors, floors: floors, cellMap: cellMap };
}
function gridValueRange(cellMap, mode) {
  var vals = [];
  cellMap.forEach(function (deals) {
    var newest = deals.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
    var v = mode === 'unit' ? newest.unit_price_wan_ping_precise : newest.total_price_wan;
    if (v != null) vals.push(v);
  });
  if (!vals.length) return { min: null, max: null };
  return { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
}
function renderSalesGrid() {
  var mode = document.getElementById('grid-mode').value;
  var main = buildMainGridData();
  var mm = gridValueRange(main.cellMap, mode);
  var html = '<table class="sales-grid"><thead><tr><th class="floor-col">樓層</th>' + main.units.map(function (u) { return '<th>' + esc(u) + '</th>'; }).join('') + '</tr></thead><tbody>';
  main.floors.forEach(function (f) {
    html += '<tr><td class="floor-col">' + f + 'F</td>';
    main.units.forEach(function (u) { html += gridCellHTML(main.cellMap.get(u + '|' + f), mode, mm.min, mm.max, u, f); });
    html += '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('sales-grid-main').innerHTML = html;
  document.querySelectorAll('#sales-grid-main td.grid-cell[data-unit-code]').forEach(function (td) {
    td.addEventListener('click', function () { selectEstimatorUnit(td.dataset.unitCode, parseInt(td.dataset.floor, 10)); });
  });
  if (EST_SELECTED) {
    var cell = document.querySelector('#sales-grid-main td.grid-cell[data-unit-code="' + EST_SELECTED.unit_code + '"][data-floor="' + EST_SELECTED.floor_num + '"]');
    if (cell) cell.classList.add('picked');
  }

  var tr = buildTransferGridData();
  var tm = gridValueRange(tr.cellMap, mode);
  var html2 = '<table class="sales-grid"><thead><tr><th class="floor-col">樓層</th>' + tr.doors.map(function (d) { return '<th>' + d + '號</th>'; }).join('') + '</tr></thead><tbody>';
  if (!tr.floors.length) {
    html2 += '<tr><td class="floor-col" colspan="' + (tr.doors.length + 1) + '">目前沒有配對不到預售資料、需要單獨列出的過戶登記。</td></tr>';
  } else {
    tr.floors.forEach(function (f) {
      html2 += '<tr><td class="floor-col">' + f + 'F</td>';
      tr.doors.forEach(function (d) { html2 += gridCellHTML(tr.cellMap.get(d + '|' + f), mode, tm.min, tm.max); });
      html2 += '</tr>';
    });
  }
  html2 += '</tbody></table>';
  document.getElementById('sales-grid-transfer').innerHTML = html2;

  document.getElementById('salesgrid-conclusion').textContent = '仰森共 ' + main.units.length + ' 個戶別代碼、' + main.floors.length + ' 個樓層有預售簽約資料，點格子即可套用到「戶別試算」。';
  document.getElementById('salesgrid-method').innerHTML = '<ul><li>顏色深淺＝同一批格子裡單價/總價的相對高低（同一張表自己比，不跨表比）。</li><li>一格若有多筆交易只顯示最新一筆，滑鼠移上去看全部明細；灰點代表特殊交易或車位灌入總價。</li></ul>';
}


/* ===========================================================================
   主流程
   =========================================================================== */
function renderFilteredSections(resetPages) {
  // 開價列表只要 UNITS，隨時可畫；成交要 deals.json，還沒抓到就先不畫，
  // 等 ensureDealsLoaded() 完成後自己會補畫一次。
  if (resetPages) { listingLimit = PAGE_SIZE; yxDealsLimit = PAGE_SIZE; }
  renderListingTable();
  if (DEALS_LOADED) renderYxDealsSection();
}
function wireStaticControls() {
  document.getElementById('listing-more').addEventListener('click', function () { listingLimit += PAGE_SIZE; renderListingTable(); });
  document.getElementById('yxdeals-more').addEventListener('click', function () { yxDealsLimit += PAGE_SIZE; renderYxDealsSection(); });
  document.getElementById('grid-mode').addEventListener('change', renderSalesGrid);
}

/* ===========================================================================
   怎麼算的（仰森個案相關方法）：各分頁自己的方法說明沿用原有寫法，一樣是
   render函式順手寫進對應的 method-note（renderTiles→status-method、
   renderEstimatorMethod→estimator-method、renderSalesGrid→salesgrid-method、
   renderListingTable→listing-method、renderYxDealsSection→deals-method）；
   這裡只補一段全案通用的判斷規則（仰森辨識、單價公式），跟一個回主報告的連結
   （完整資料來源／青埔特區範圍定義／限制都在主報告，不重複維護兩份）。
   =========================================================================== */
function renderMethodologyIntro() {
  var cfg = META.config || {};
  var yx = cfg.yuanxiong_rule || {};
  var el = document.getElementById('methodology-intro');
  if (!el) return;
  el.innerHTML =
    '<h3 class="section-heading" style="font-size:13px">遠雄仰森判斷方式</h3>' +
    '<p>預售資料直接比對建案名稱「' + esc(yx.project_name) + '」。買賣資料（交屋後轉手、或預售交屋登記）沒有建案名稱，改用地址判斷：' + esc(yx.district) + '、地址包含「' + esc(yx.address_keyword) + '」、門牌號為 ' + (yx.door_numbers || []).join('、') + ' 號其中之一。</p>' +
    '<h3 class="section-heading" style="font-size:13px">單價怎麼算</h3>' +
    '<p>萬/坪 =（總價－車位總價）÷（（建物移轉總面積－車位移轉總面積）× 0.3025）。備註出現親友、特殊關係、員工、瑕疵、含裝潢、增建、頂樓加蓋等字樣的交易，或疑似把車位價格灌進總價的交易，排除在中位數之外，但列表仍列出並標記旗標。</p>' +
    '<h3 class="section-heading" style="font-size:13px">「現在市價大概落在哪個範圍」怎麼算（現況分頁）</h3>' +
    '<p>取仰森自己預售單價中位數，乘上「價格走向」算好的三個轉手/預售倍數情境（收斂/維持/回升，見青埔主報告「價格」章節），三個倍數不是預測，是把近期已觀察到的倍數水準套進來；同一戶要精確試算（含樓層調整、591開價對照、建議開價）見「戶別試算」分頁。</p>';
  document.getElementById('methodology-link').innerHTML =
    '完整資料來源、青埔特區範圍定義、限制，見<a href="../#methodology">青埔主報告「怎麼算的」章節 →</a>';
}

/* ===========================================================================
   分頁籤：URL hash 連結（ascii id 或中文都認）、鍵盤方向鍵可切換、切換時
   resize 所有圖表（隱藏分頁裡的 echarts 一開始量到的是 0 寬，顯示後要重量一次）。
   =========================================================================== */
var TABS = [
  { id: 'status', zh: '現況' },
  { id: 'salesgrid', zh: '銷控表' },
  { id: 'listing', zh: '開價列表' },
  { id: 'deals', zh: '成交' },
  { id: 'estimator', zh: '戶別試算' },
  { id: 'methodology', zh: '怎麼算的' },
];
// 這五個分頁都要 deals.json 才能畫；「開價列表」只要 units.json、「怎麼算的」不用資料。
var DEALS_TABS = { status: true, salesgrid: true, deals: true, estimator: true };

function resolveTabId(rawHash) {
  if (!rawHash) return null;
  var v;
  try { v = decodeURIComponent(rawHash.replace(/^#/, '')); } catch (e) { v = rawHash.replace(/^#/, ''); }
  var hit = TABS.filter(function (t) { return t.id === v || t.zh === v; })[0];
  return hit ? hit.id : null;
}
function activateTab(id, opts) {
  opts = opts || {};
  if (!TABS.some(function (t) { return t.id === id; })) id = 'status';
  TABS.forEach(function (t) {
    var btn = document.getElementById('tab-btn-' + t.id);
    var panel = document.getElementById('panel-' + t.id);
    var active = t.id === id;
    if (btn) { btn.classList.toggle('active', active); btn.setAttribute('aria-selected', active ? 'true' : 'false'); btn.tabIndex = active ? 0 : -1; }
    if (panel) panel.classList.toggle('active', active);
  });
  if (opts.updateHash !== false && window.location.hash.replace(/^#/, '') !== id) {
    history.replaceState(null, '', '#' + id);
  }
  requestAnimationFrame(function () { allCharts.forEach(function (c) { if (c) c.resize(); }); });
  if (DEALS_TABS[id]) ensureDealsLoaded();
}
function initTabs() {
  TABS.forEach(function (t, i) {
    var btn = document.getElementById('tab-btn-' + t.id);
    if (!btn) return;
    btn.setAttribute('aria-selected', 'false');
    btn.tabIndex = -1;
    btn.addEventListener('click', function () { activateTab(t.id); });
    btn.addEventListener('keydown', function (e) {
      var idx = -1;
      if (e.key === 'ArrowRight') idx = (i + 1) % TABS.length;
      else if (e.key === 'ArrowLeft') idx = (i - 1 + TABS.length) % TABS.length;
      else if (e.key === 'Home') idx = 0;
      else if (e.key === 'End') idx = TABS.length - 1;
      else return;
      e.preventDefault();
      var nextId = TABS[idx].id;
      activateTab(nextId);
      var nextBtn = document.getElementById('tab-btn-' + nextId);
      if (nextBtn) nextBtn.focus();
    });
  });
  window.addEventListener('hashchange', function () {
    activateTab(resolveTabId(window.location.hash) || 'status', { updateHash: false });
  });
  activateTab(resolveTabId(window.location.hash) || 'status', { updateHash: false });
}

async function init() {
  initTabs();
  initFilterBar();
  wireStaticControls();

  listingTable = makeTable(document.getElementById('table-listing'), listingColumns, { key: 'post_date', dir: 'desc' });
  yxDealsTable = makeTable(document.getElementById('table-yx-deals'), yxDealsColumns, { key: 'date', dir: 'desc' });
  renderEstimatorMethod();

  // summary.json（小檔，最近成交/情境用）跟其他 JSON 並行抓，誰先到誰先畫；
  // deals.json 由 activateTab() 依目前分頁決定要不要抓（見 DEALS_TABS）。
  var summaryPromise = loadSummary().catch(function (err) { console.error(err); });
  var dataPromise = loadData().catch(function (err) { console.error(err); });

  await dataPromise; // META（含 config.yuanxiong_rule）要等這裡才有值
  renderListingTable();
  renderMethodologyIntro();

  await summaryPromise;
  renderTiles(); // renderTiles 內會呼叫 renderStatusSummary()，要等 DEALS 才有完整內容

  document.getElementById('updated-line').textContent = '實價登錄：' + fmtDateTime(META.lvr && META.lvr.last_run) + '　591售價：' + fmtDateTime(META.house591 && META.house591.last_run) + '　591租金：' + fmtDateTime(META.house591_rent && META.house591_rent.last_run);
}

init().catch(function (err) {
  console.error(err);
  var line = document.getElementById('updated-line');
  if (line) line.textContent = '資料載入失敗：' + err.message;
});
