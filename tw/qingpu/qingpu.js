'use strict';

/* ===========================================================================
   青埔特區房市追蹤：純前端讀 data/*.json 現場算現場畫，沒有伺服器。
   中文單語頁（依站方指示不做雙語）。ECharts 用法沿用站內 echarts-spec：
   色彩變數 C、baseText/baseGrid/baseTooltip/baseLegend/mkAxis、allCharts 陣列
   + resize handler（分頁切換時也會呼叫一次 resize，隱藏分頁裡的圖表才會量對尺寸）。

   分頁架構：總覽/仰森/戶別試算/青埔供給/青埔需求/價格走向/怎麼算的，用
   URL hash（#yuanxiong 等 ascii id，或對應中文）連結、方向鍵可切換。
   第一次載入只抓 data/summary.json（小檔，總覽用）+ 除 deals.json、rental.json
   以外的其他 JSON（並行）；data/deals.json（11MB）延遲到「仰森」「戶別試算」
   分頁，或「青埔需求」分頁裡「青埔成交」收合區塊被打開時才抓（見
   ensureDealsLoaded()）。rental.json（2MB）目前沒有任何畫面在讀它——需求分頁
   的租金圖表用的是 demand.json 裡已經算好的 rental 彙總，所以整支拿掉，不抓。
   =========================================================================== */

var SIZE_LABELS = { small: '小 (<30坪)', mid: '中 (30-45坪)', large: '大 (>45坪)' };
var AGE_LABELS = { presale: '預售', new: '新成屋 (0-2年)', mid_age: '3-10年', old: '10年以上', unknown: '未知' };
var PRICE_BAND_LABELS = { lt1500: '<1500萬', '1500_2000': '1500-2000萬', '2000_2500': '2000-2500萬', gte2500: '2500萬+' };
var PAGE_SIZE = 50;

var DEALS = [], LISTINGS = [], UNITS = [];
var ESTIMATE = null, SUPPLY = null, DEMAND = null, OUTLOOK = null, LISTING_HISTORY = [], META = {}, DOOR_PROJECT = null, SUMMARY = null;
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
var overviewKeyChart;
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
  // 篩選 chip 現在在兩個分頁各出現一次（仰森／青埔需求-青埔成交），都綁同一份
  // FILTERS 狀態；點其中一組要連動另一組的顯示（不然使用者切分頁會以為篩選跑掉了）。
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
  var res = await fetch('data/summary.json');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  SUMMARY = await res.json();
  return SUMMARY;
}

// 「總覽」以外的分頁要的其他 JSON：都不大（合計不到3MB），並行抓，不等 deals.json。
async function loadData() {
  var listingsJson = await fetchJsonSafe('data/listings.json', { listings: {} });
  var unitsJson = await fetchJsonSafe('data/units.json', { units: [] });
  META = await fetchJsonSafe('data/meta.json', {});
  LISTINGS = Object.values(listingsJson.listings || {});
  UNITS = unitsJson.units || [];
  META._listingsUpdatedAt = listingsJson.updated_at;

  ESTIMATE = await fetchJsonSafe('data/estimate.json', null);
  SUPPLY = await fetchJsonSafe('data/supply_demand.json', null);
  DEMAND = await fetchJsonSafe('data/demand.json', null);
  OUTLOOK = await fetchJsonSafe('data/outlook.json', null);
  LISTING_HISTORY = await fetchJsonlSafe('data/listing_history.jsonl');
  DOOR_PROJECT = await fetchJsonSafe('data/door_project.json', null);
}

// deals.json 約11MB，只有「仰森」「戶別試算」分頁、跟「青埔需求」分頁裡「青埔
// 成交」收合區塊需要，第一次打開才抓；抓過就快取在 DEALS，不重複抓。
function ensureDealsLoaded() {
  if (DEALS_PROMISE) return DEALS_PROMISE;
  DEALS_PROMISE = fetch('data/deals.json').then(function (res) {
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
  ['yx-deals-loading', 'estimator-loading', 'qingpu-deals-loading'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var estBox = document.getElementById('estimator-box');
  if (estBox) estBox.style.display = '';
  renderYxDealsSection();
  renderSalesGrid();
  populateEstimatorSelects();
  populateRoadOptions();
  renderCompareTable();
  renderTrendSection();
  renderLatestTable();
  requestAnimationFrame(function () { allCharts.forEach(function (c) { if (c) c.resize(); }); });
}
function onDealsError(err) {
  var msg = '成交明細載入失敗：' + err.message + '，請重新整理頁面再試一次。';
  ['yx-deals-loading', 'estimator-loading', 'qingpu-deals-loading'].forEach(function (id) {
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
   總覽分頁：一頁看懂——4張大數字卡＋3句結論＋1張關鍵圖，資料只來自 data/summary.json
   （不等其他 JSON、不等 deals.json），所以總覽一定是頁面上第一個畫出來的東西。
   =========================================================================== */
function overviewCard(label, value, sub) {
  return '<div class="kpi-card"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-value">' + value + '</div><div class="kpi-source">' + sub + '</div></div>';
}
function showOverviewError(err) {
  var el = document.getElementById('overview-error');
  if (el) { el.style.display = 'block'; el.textContent = '總覽資料載入失敗：' + err.message + '，請重新整理頁面再試一次。'; }
  var sEl = document.getElementById('overview-sentences');
  if (sEl) sEl.innerHTML = '';
}
function renderOverview() {
  if (!SUMMARY) return;
  var yx = SUMMARY.yx_current || {};
  var up = SUMMARY.uplift || {};
  var sv = SUMMARY.supply_vs_sales || {};
  var sc = SUMMARY.scenarios || {};

  document.getElementById('overview-sentences').innerHTML =
    (SUMMARY.sentences || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') || '<li>目前沒有可顯示的結論。</li>';

  var mid = sc['維持'] || {}, conv = sc['收斂'] || {}, rise = sc['回升'] || {};
  var cards = [
    overviewCard('仰森現在開價', yx.median_ask_per_ping != null ? fmt(yx.median_ask_per_ping, 1) + ' 萬/坪' : '--', '每坪中位數（已扣車位），約 ' + fmtInt(yx.n_onsale) + ' 戶在賣'),
    overviewCard('轉手比預售貴多少', up.median != null ? fmtPct(up.median, 0) : '--', '同建案中位漲幅，n=' + fmtInt(up.n_projects) + ' 個建案'),
    overviewCard('一年要賣 vs 賣得掉', fmtInt(sv.total_to_sell) + ' 戶　vs　' + fmtInt(sv.one_year_sold) + ' 戶', '現在在售＋未來4季新增　vs　近4季轉手成交×1年'),
    overviewCard('轉手價是預售價的幾倍', mid.multiplier != null ? fmt(mid.multiplier, 2) + ' 倍' : '--', '收斂 ' + (conv.multiplier != null ? fmt(conv.multiplier, 2) : '--') + ' 倍・回升 ' + (rise.multiplier != null ? fmt(rise.multiplier, 2) : '--') + ' 倍'),
  ];
  document.getElementById('overview-cards').innerHTML = cards.join('');

  var kc = SUMMARY.key_chart || {};
  if (!overviewKeyChart) overviewKeyChart = newChart('chart-overview-key');
  if (overviewKeyChart) {
    overviewKeyChart.setOption({
      tooltip: baseTooltip, legend: baseLegend, grid: baseGrid,
      xAxis: mkAxis({ type: 'category', data: kc.quarters || [] }),
      yAxis: mkAxis({ type: 'value', name: '戶' }),
      series: [
        { name: '上季留下沒賣掉', type: 'bar', stack: 's', data: kc.carry_over || [], itemStyle: { color: C.blue } },
        { name: '本季新增要賣', type: 'bar', stack: 's', data: kc.new_supply || [], itemStyle: { color: '#93c5fd' } },
        { name: '本季賣掉', type: 'line', data: kc.sold || [], symbolSize: 7, itemStyle: { color: C.orange }, lineStyle: { color: C.orange, width: 3 } },
      ],
    }, true);
  }
  document.getElementById('overview-chart-note').textContent =
    '長條＝每季要賣的戶數（上季留下沒賣掉＋本季新增），線＝每季賣掉的戶數。' + (kc.scope_note || '') + '。';
}

/* ===========================================================================
   仰森現況
   =========================================================================== */
function tileHTML(label, value, sub, cls) {
  return '<div class="kpi-card' + (cls ? ' ' + cls : '') + '"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-value">' + value + '</div>' + (sub ? '<div class="kpi-source">' + sub + '</div>' : '') + '</div>';
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
   青埔各社區比價
   =========================================================================== */
function medCell(n, med) {
  if (med == null) return '--';
  return '<span' + (n < 3 ? ' class="low-n"' : '') + '>' + fmt(med, 1) + ' 萬/坪</span>';
}
function buildCommunityStats() {
  var listingMap = new Map();
  UNITS.filter(function (u) { return u.community_name && passesFilter(u.adj_size_bucket, u.age_bucket); }).forEach(function (u) {
    if (!listingMap.has(u.community_name)) listingMap.set(u.community_name, []);
    listingMap.get(u.community_name).push(u.adj_unitprice);
  });
  var refDate = META._dealsUpdatedAt ? new Date(META._dealsUpdatedAt) : new Date();
  var cutoff = new Date(refDate); cutoff.setDate(cutoff.getDate() - 365);
  var dealMap = new Map(), resaleMap = new Map();
  DEALS.filter(function (d) { return d.source === 'presale' && d.project_name && !d.special && !d.car_lumped && passesFilter(d.size_bucket, d.age_bucket) && new Date(d.date) >= cutoff; }).forEach(function (d) {
    if (!dealMap.has(d.project_name)) dealMap.set(d.project_name, []);
    dealMap.get(d.project_name).push(d.unit_price_wan_ping);
  });
  DEALS.filter(function (d) { return d.deal_kind === 'resale' && d.project_name_inferred && !d.special && !d.car_lumped && passesFilter(d.size_bucket, d.age_bucket) && new Date(d.date) >= cutoff; }).forEach(function (d) {
    if (!resaleMap.has(d.project_name_inferred)) resaleMap.set(d.project_name_inferred, []);
    resaleMap.get(d.project_name_inferred).push(d.unit_price_wan_ping);
  });
  var names = new Set([...listingMap.keys(), ...dealMap.keys(), ...resaleMap.keys()]);
  var yxName = (META.config && META.config.yuanxiong_rule && META.config.yuanxiong_rule.project_name) || '遠雄仰森';
  return [...names].map(function (name) {
    var lArr = listingMap.get(name) || [], dArr = dealMap.get(name) || [], rArr = resaleMap.get(name) || [];
    return {
      name: name,
      listingN: lArr.filter(function (v) { return v != null; }).length, listingMed: median(lArr),
      dealN: dArr.filter(function (v) { return v != null; }).length, dealMed: median(dArr),
      resaleN: rArr.filter(function (v) { return v != null; }).length, resaleMed: median(rArr),
      isYx: name === yxName || name.indexOf('仰森') !== -1,
    };
  });
}
var compareColumns = [
  { key: 'name', label: '社區', type: 'str', value: function (r) { return r.name; }, cell: function (r) { return (r.isYx ? '<strong>' : '') + esc(r.name) + (r.isYx ? '</strong>' : ''); } },
  { key: 'listingN', label: '在售戶數', type: 'num', value: function (r) { return r.listingN; }, cell: function (r) { return fmtInt(r.listingN); } },
  { key: 'listingMed', label: '開價中位數', type: 'num', value: function (r) { return r.listingMed; }, cell: function (r) { return medCell(r.listingN, r.listingMed); } },
  { key: 'dealN', label: '預售成交(近12月)', type: 'num', value: function (r) { return r.dealN; }, cell: function (r) { return fmtInt(r.dealN); } },
  { key: 'dealMed', label: '預售中位(近12月)', type: 'num', value: function (r) { return r.dealMed; }, cell: function (r) { return medCell(r.dealN, r.dealMed); } },
  { key: 'resaleN', label: '中古成交(近12月)', type: 'num', value: function (r) { return r.resaleN; }, cell: function (r) { return fmtInt(r.resaleN); } },
  { key: 'resaleMed', label: '中古中位(近12月)', type: 'num', value: function (r) { return r.resaleMed; }, cell: function (r) { return medCell(r.resaleN, r.resaleMed); } },
];
var compareTable;
function renderCompareTable() {
  var rows = buildCommunityStats();
  compareTable.setRows(rows);
  compareTable.render();
  document.getElementById('compare-conclusion').textContent = '共 ' + rows.length + ' 個社區/建案有資料；仰森在售戶數約 ' + fmtInt((rows.find(function(r){return r.isYx;})||{}).listingN || 0) + ' 戶。';
  document.getElementById('compare-method').innerHTML = '<ul><li>在售戶數/開價中位數用591去重後的戶；預售成交用建案名稱直接歸戶；中古成交用門牌對照表歸戶（見資料說明），兩者都只算近12個月。</li><li>同一列可比，不同列（不同建案）不要比：屋齡組成不一樣。</li></ul>';
}

/* ===========================================================================
   青埔成交走勢
   =========================================================================== */
var TREND_AGE_KEYS = ['presale', 'new', 'mid_age', 'old'];
var TREND_LABELS = { presale: '預售', new: '新成屋(0-2年)', mid_age: '3-10年', old: '10年以上' };
var TREND_COLORS = [C.blue, C.orange, C.aqua, C.red];
function buildTrendData() {
  var months = new Set(), buckets = {};
  DEALS.filter(function (d) { return !d.special && !d.car_lumped && d.unit_price_wan_ping != null && TREND_AGE_KEYS.indexOf(d.age_bucket) !== -1 && sizeOk(d.size_bucket); }).forEach(function (d) {
    var month = d.date.slice(0, 7);
    if (month < '2023-01') return;
    months.add(month);
    buckets[month] = buckets[month] || {};
    buckets[month][d.age_bucket] = buckets[month][d.age_bucket] || [];
    buckets[month][d.age_bucket].push(d.unit_price_wan_ping);
  });
  var sortedMonths = [...months].sort();
  var series = {};
  TREND_AGE_KEYS.forEach(function (k) {
    series[k] = sortedMonths.map(function (m) {
      var arr = (buckets[m] && buckets[m][k]) || [];
      return { n: arr.length, med: median(arr) };
    });
  });
  return { months: sortedMonths, series: series };
}
var trendChart;
function renderTrendSection() {
  var d = buildTrendData();
  if (!trendChart) trendChart = newChart('chart-trend');
  if (trendChart) {
    trendChart.setOption({
      tooltip: baseTooltip, legend: baseLegend, grid: baseGrid,
      xAxis: mkAxis({ type: 'category', data: d.months }),
      yAxis: mkAxis({ type: 'value', name: '萬/坪' }),
      series: TREND_AGE_KEYS.map(function (k, i) {
        return { name: TREND_LABELS[k], type: 'line', data: d.series[k].map(function (v) { return v.med; }), connectNulls: true, showSymbol: true, symbolSize: 5, lineStyle: { color: TREND_COLORS[i] }, itemStyle: { color: TREND_COLORS[i] }, emphasis: { focus: 'series' } };
      }),
    }, true);
  }
  var rows = d.months.map(function (m, i) {
    var r = { month: m };
    TREND_AGE_KEYS.forEach(function (k) { r[k] = d.series[k][i]; });
    return r;
  }).slice().reverse();
  staticTable(document.getElementById('table-trend'),
    [{ label: '月份', cell: function (r) { return r.month; } }].concat(TREND_AGE_KEYS.map(function (k) { return { label: TREND_LABELS[k], cell: function (r) { var v = r[k]; return v && v.med != null ? '<span' + (v.n < 3 ? ' class="low-n"' : '') + '>' + fmt(v.med, 1) + '（n=' + v.n + '）</span>' : '--'; } }; })),
    rows);
  var lastMonth = d.months[d.months.length - 1];
  document.getElementById('trend-conclusion').textContent = lastMonth ? '最新一個月（' + lastMonth + '）各屋齡分類單價中位數見圖；n<3的月份標灰字僅供參考。' : '尚無資料。';
  document.getElementById('trend-method').innerHTML = '<ul><li>2023年以來，青埔特區（含仰森）成交單價中位數，依屋齡分四條線；坪數篩選會套用，屋齡篩選只決定要不要畫出該條線（走勢圖不受屋齡篩選影響資料本身）。</li></ul>';
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
   青埔未來供給（a-e）
   =========================================================================== */
var HANDOVER_STATUS_LABEL = { actual: '實際', actual_probable: '實際(推)', estimated: '推估', estimated_overdue: '逾期（平均攤入未來4季）', unknown: '不明' };
var SELL_STATUS_LABEL = { selling: '銷售中', stalled: '停售/觀望', sold_out: '已售完', unknown: '不明（2021-07前開賣）' };

function renderProjectsTable() {
  if (!SUPPLY) return;
  var all = (SUPPLY.supply.handover || {}).projects || [];
  var filterVal = document.getElementById('projects-status-filter').value;
  var rows = filterVal === 'all' ? all : all.filter(function (p) { return p.sell_status === filterVal; });
  var cols = [
    { key: 'project_name', label: '建案', type: 'str', value: function (r) { return r.project_name; }, cell: function (r) { return esc(r.project_name); } },
    { key: 'builder', label: '起造人', type: 'str', value: function (r) { return r.builder || ''; }, cell: function (r) { return esc(r.builder || '--'); } },
    { key: 'households', label: '總戶數', type: 'num', value: function (r) { return r.households; }, cell: function (r) { return fmtInt(r.households); } },
    { key: 'units_sold', label: '已售', type: 'num', value: function (r) { return r.units_sold; }, cell: function (r) { return fmtInt(r.units_sold); } },
    { key: 'units_unsold', label: '未售(估)', type: 'num', value: function (r) { return r.units_unsold; }, cell: function (r) { return fmtInt(r.units_unsold); } },
    { key: 'total_floors', label: '樓層', type: 'num', value: function (r) { return r.total_floors; }, cell: function (r) { return r.total_floors ? r.total_floors + 'F' : '--'; } },
    { key: 'size_mix', label: '主力坪數帶', type: 'str', value: function (r) { return ''; }, cell: function (r) { var m = r.size_mix || {}; var parts = ['small', 'mid', 'large'].filter(function (k) { return m[k] != null; }).map(function (k) { return SIZE_LABELS[k].split(' ')[0] + fmtPct(m[k], 0); }); return parts.join('/') || '--'; } },
    { key: 'presale_price', label: '預售單價中位(區間)', type: 'num', value: function (r) { return (r.presale_price || {}).median; }, cell: function (r) { var p = r.presale_price || {}; return p.median != null ? fmt(p.median, 1) + '（' + fmt(p.p25, 1) + '–' + fmt(p.p75, 1) + '）' : '--'; } },
    { key: 'first_registration_date_roc', label: '第1次登記/推估完工', type: 'str', value: function (r) { return r.handover_quarter || ''; }, cell: function (r) { return esc(r.handover_quarter || '--'); } },
    { key: 'handover_status', label: '交屋狀態', type: 'str', value: function (r) { return r.handover_status; }, cell: function (r) { return (HANDOVER_STATUS_LABEL[r.handover_status] || r.handover_status || '--') + (r.conflict_note ? ' <span title="' + esc(r.conflict_note) + '">⚠️</span>' : ''); } },
    { key: 'sell_status', label: '銷售狀態', type: 'str', value: function (r) { return r.sell_status; }, cell: function (r) { return SELL_STATUS_LABEL[r.sell_status] || r.sell_status; } },
    { key: 'road', label: '道路', type: 'str', value: function (r) { return r.road || ''; }, cell: function (r) { return esc(r.road || '--'); } },
  ];
  if (!window.__projectsTable) window.__projectsTable = makeTable(document.getElementById('table-projects'), cols, { key: 'units_unsold', dir: 'desc' });
  window.__projectsTable.setRows(rows);
  window.__projectsTable.render();
  var nSelling = all.filter(function (p) { return p.sell_status === 'selling'; }).length;
  document.getElementById('projects-conclusion').textContent = '共 ' + all.length + ' 個青埔預售建案對到官方備查資料，其中 ' + nSelling + ' 個仍銷售中；表格可依狀態篩選、點欄名排序。';
  document.getElementById('projects-method').innerHTML = '<ul><li>總戶數/已售/未售來自「預售屋備查建案」官方登記（層棟戶數），不是只算實價登錄賣掉的戶數。</li><li>交屋狀態：官方已辦「第1次登記」算「實際」；未登記但有≥20筆過戶訊號算「實際(推)」；用建照核發日+已完成案例的中位落後天數推算的算「推估」；推算時間已過仍未登記的算「逾期」。</li><li>銷售狀態：近6個月有新簽約算「銷售中」，未售戶>0但近6個月無新簽約算「停售/觀望」。</li></ul>';
}

var supplySizeChart;
function renderSupplyBySize() {
  if (!SUPPLY) return;
  var rows = ((SUPPLY.supply.handover || {}).chart_quarters_by_size) || [];
  var quarters = rows.map(function (r) { return r.quarter; });
  var seriesDef = [
    ['small_sold', '小坪-已售', C.blue], ['small_unsold', '小坪-未售', '#93c5fd'],
    ['mid_sold', '中坪-已售', C.orange], ['mid_unsold', '中坪-未售', '#fdba74'],
    ['large_sold', '大坪-已售', C.red], ['large_unsold', '大坪-未售', '#fca5a5'],
  ];
  document.getElementById('supply-size-legend').innerHTML = seriesDef.map(function (s) { return '<span><i style="background:' + s[2] + '"></i>' + s[1] + '</span>'; }).join('') + '<span><i style="background:#94a3b8;opacity:.35"></i>陰影＝逾期建案戶數平均攤入的季別</span>';
  if (!supplySizeChart) supplySizeChart = newChart('chart-supply-by-size');
  if (!supplySizeChart) return;
  var markAreaData = [];
  var inRun = false, start = null;
  rows.forEach(function (r, i) {
    if (r.is_overdue_spread && !inRun) { start = i; inRun = true; }
    if (!r.is_overdue_spread && inRun) { markAreaData.push([{ xAxis: quarters[start] }, { xAxis: quarters[i - 1] }]); inRun = false; }
  });
  if (inRun) markAreaData.push([{ xAxis: quarters[start] }, { xAxis: quarters[quarters.length - 1] }]);
  supplySizeChart.setOption({
    tooltip: baseTooltip, grid: baseGrid,
    xAxis: mkAxis({ type: 'category', data: quarters }),
    yAxis: mkAxis({ type: 'value', name: '戶' }),
    series: seriesDef.map(function (s, i) {
      var stackGroup = s[0].indexOf('small') === 0 ? 'small' : s[0].indexOf('mid') === 0 ? 'mid' : 'large';
      var conf = { name: s[1], type: 'bar', stack: stackGroup, data: rows.map(function (r) { return r[s[0]] || 0; }), itemStyle: { color: s[2] }, barMaxWidth: 14 };
      if (i === 0 && markAreaData.length) conf.markArea = { itemStyle: { color: 'rgba(148,163,184,0.18)' }, data: markAreaData };
      return conf;
    }),
    legend: { show: false },
  }, true);
  document.getElementById('supply-size-conclusion').textContent = '未來8季（前後各8季顯示16季）新增供給按坪數帶拆分，陰影季別為逾期建案戶數平均攤提所在。';
  document.getElementById('supply-size-method').innerHTML = '<ul><li>已售戶部分＝該季交屋戶數(已售) × 建案自己的坪數結構 × 交屋後拿出來賣的比例中位數；未售戶（建商餘屋）部分＝該季交屋戶數(未售) × 坪數結構，交屋後4季內平均分批拿出來賣。</li><li>建案自己的坪數結構樣本不足10筆時，退回青埔全區坪數結構。</li></ul>';
}

function renderHandoverChart() {
  if (!SUPPLY) return;
  var rows = ((SUPPLY.supply.handover || {}).chart_quarters) || [];
  var c = newChart('chart-handover');
  if (!c) return;
  c.setOption({
    tooltip: baseTooltip, legend: baseLegend, grid: baseGrid,
    xAxis: mkAxis({ type: 'category', data: rows.map(function (r) { return r.quarter; }) }),
    yAxis: mkAxis({ type: 'value', name: '戶' }),
    series: [
      { name: '實際交屋(戶)', type: 'bar', stack: 's', data: rows.map(function (r) { return r.actual; }), itemStyle: { color: C.blue } },
      { name: '推估交屋(戶)', type: 'bar', stack: 's', data: rows.map(function (r) { return r.estimated; }), itemStyle: { color: '#fbbf24' } },
    ],
  }, true);
}

function renderUnsoldTable() {
  if (!SUPPLY) return;
  var un = SUPPLY.supply.unsold || {};
  staticTable(document.getElementById('table-unsold'),
    [
      { label: '建案', cell: function (r) { return esc(r.project_name); } },
      { label: '未售戶(估)', cell: function (r) { return fmtInt(r.units_unsold); } },
      { label: '銷售狀態', cell: function (r) { return SELL_STATUS_LABEL[r.sell_status] || r.sell_status; } },
      { label: '最近一筆簽約', cell: function (r) { return esc(r.last_contract || '--'); } },
      { label: '道路', cell: function (r) { return esc(r.road || '--'); } },
    ], un.rows || []);
  document.getElementById('unsold-conclusion').textContent = '青埔未完工建案的建商未售戶合計約 ' + fmtInt(un.total_unsold) + ' 戶，分布在 ' + ((un.rows || []).length) + ' 個建案；' + (un.n_selling || 0) + ' 個仍銷售中、' + (un.n_stalled || 0) + ' 個停售/觀望。';
  document.getElementById('unsold-method').innerHTML = '<ul><li>未售戶(估)＝官方登記總戶數－實價登錄已賣出戶數，是估計值不是官方公布的餘屋數字。</li><li>只算還沒完工的建案：完工後建商改賣成屋，登記在買賣檔、不在預售檔，已完工建案用這個減法會高估。</li><li>2021年7月以前就開賣的建案，預售檔還沒上線，已售戶數會少算，未售戶數標「不明」、不列入合計。</li><li>「銷售中」＝近' + (un.still_selling_window_months || 6) + '個月內該建案仍有新的預售簽約；「停售/觀望」＝未售戶>0但近期無新簽約。</li></ul>';
}

function renderInventoryTables() {
  if (!SUPPLY) return;
  var inv = (SUPPLY.supply.inventory) || {};
  var byC = (inv.by_community || []).slice(0, 12);
  staticTable(document.getElementById('table-inventory-community'),
    [{ label: '社區', cell: function (r) { return esc(r.community_name); } }, { label: 'n', cell: function (r) { return fmtInt(r.n); } }, { label: '開價中位(扣車位)', cell: function (r) { return medCell(r.n, r.median_adj_unitprice); } }],
    byC);
  var matrix = inv.by_age_size || [];
  var sizeKeys = ['small', 'mid', 'large'];
  var ageKeys = ['presale', 'new', 'mid_age', 'old', 'unknown'];
  var byKey = {};
  matrix.forEach(function (c) { byKey[c.age_bucket + '|' + c.size_bucket] = c; });
  var theadRow = document.querySelector('#table-inventory-matrix thead tr');
  theadRow.innerHTML = '<th>屋齡\\坪數</th>' + sizeKeys.map(function (k) { return '<th>' + SIZE_LABELS[k].split(' ')[0] + '</th>'; }).join('');
  document.querySelector('#table-inventory-matrix tbody').innerHTML = ageKeys.map(function (ak) {
    return '<tr><td>' + (AGE_LABELS[ak] || ak) + '</td>' + sizeKeys.map(function (sk) {
      var c = byKey[ak + '|' + sk];
      return '<td>' + (c ? medCell(c.n, c.median_adj_unitprice) + '<br><span style="font-size:10px;color:#94a3b8">n=' + c.n + '</span>' : '--') + '</td>';
    }).join('') + '</tr>';
  }).join('');
  document.getElementById('inventory-conclusion').textContent = '591在售存量前3大社區：' + byC.slice(0, 3).map(function (r) { return esc(r.community_name) + '(' + r.n + '戶)'; }).join('、') + '。';
  document.getElementById('inventory-method').innerHTML = '<ul><li>皆用591同戶重複刊登去重後的「戶」計算，開價已扣車位。</li><li>每月存一筆全站在售戶數快照到 inventory_history.jsonl，累積月數還少，趨勢要等後續每月執行才會看出來。</li></ul>';
}

function renderReleaseRateAll() {
  if (!SUPPLY) return;
  var rr = SUPPLY.supply.release_rate || {};
  var rows = rr.all_rows || [];
  staticTable(document.getElementById('table-release-rate-all'),
    [
      { label: '建案', cell: function (r) { return esc(r.project_name); } },
      { label: '已售戶數', cell: function (r) { return fmtInt(r.units_sold); } },
      { label: '591在售(去重)', cell: function (r) { return fmtInt(r.active_591_units); } },
      { label: '拿出來賣的比例', cell: function (r) { return r.release_rate != null ? fmtPct(r.release_rate) : '--'; } },
      { label: '交屋日', cell: function (r) { return esc(r.handover_date || '--'); } },
    ], rows.slice().sort(function (a, b) { return (b.handover_date || '') < (a.handover_date || '') ? -1 : 1; }));
  document.getElementById('release-conclusion').textContent = '近12個月交屋建案，交屋後拿出來賣的比例中位數 ' + (rr.median != null ? fmtPct(rr.median) : '--') + '（n=' + (rr.n || 0) + '），全歷史共 ' + rows.length + ' 個建案查得到這個比例。';
  document.getElementById('release-method').innerHTML = '<ul><li>交屋後拿出來賣的比例＝交屋後591去重在售戶數 ÷ 實價登錄賣出戶數；只算有實際或高機率交屋日的建案。</li><li>近12個月交屋的建案（rows）用來推算未來供給時的假設比例；全歷史（本表）只是給每個建案自己的參考值。</li></ul>';
}

function renderNewLaunchesAndNewhouse() {
  if (!SUPPLY) return;
  staticTable(document.getElementById('table-new-launches'),
    [{ label: '建案', cell: function (r) { return esc(r.project_name); } }, { label: '已售戶數', cell: function (r) { return fmtInt(r.units_sold); } }, { label: '單價中位數', cell: function (r) { return r.median_unit_price != null ? fmt(r.median_unit_price, 2) + ' 萬/坪' : '--'; } }, { label: '首次簽約', cell: function (r) { return r.first_contract; } }, { label: '道路', cell: function (r) { return esc(r.road || '--'); } }],
    SUPPLY.supply.new_launches || []);
  var nh = SUPPLY.supply.newhouse_591_crosscheck || [];
  staticTable(document.getElementById('table-newhouse'),
    [{ label: '591建案名', cell: function (r) { return esc(r.build_name || '--'); } }, { label: '對到的實價登錄建案', cell: function (r) { return esc(r.matched_b_project || '--'); } }, { label: '地址', cell: function (r) { return esc(r.addr_number || '--'); } }, { label: '銷售狀態', cell: function (r) { return esc(r.sale_status || ''); } }],
    nh);
}

function renderSupplySection() {
  if (!SUPPLY) {
    document.getElementById('supply-conclusion').textContent = '尚未算出，執行 compute_supply.py 之後才有這個區塊。';
    return;
  }
  renderProjectsTable();
  renderSupplyBySize();
  renderHandoverChart();
  renderUnsoldTable();
  renderInventoryTables();
  renderReleaseRateAll();
  renderNewLaunchesAndNewhouse();
  var h = SUPPLY.supply.handover || {};
  document.getElementById('supply-conclusion').textContent = '共 ' + (h.total_projects || 0) + ' 個青埔預售建案對到官方備查資料；建照核發到第1次登記中位落後 ' + fmtInt(h.lag_median_days) + ' 天（n=' + (h.lag_n || 0) + '）。';
  document.getElementById('projects-status-filter').addEventListener('change', renderProjectsTable);
}

/* ===========================================================================
   青埔需求（f-j）
   =========================================================================== */
var volumeChart, volumeSizeChart, volumeBandChart;
function renderVolumeSection() {
  if (!DEMAND) return;
  var tv = DEMAND.transaction_volume;
  if (!volumeChart) volumeChart = newChart('chart-volume');
  if (volumeChart) {
    volumeChart.setOption({
      tooltip: baseTooltip, legend: baseLegend, grid: baseGrid,
      xAxis: mkAxis({ type: 'category', data: tv.monthly.map(function (m) { return m.month; }), axisLabel: Object.assign({}, baseText, { interval: 3 }) }),
      yAxis: mkAxis({ type: 'value', name: '件' }),
      series: [
        { name: '預售簽約', type: 'line', data: tv.monthly.map(function (m) { return m.presale; }), itemStyle: { color: C.blue }, lineStyle: { color: C.blue }, showSymbol: false },
        { name: '預售交屋登記(舊約)', type: 'line', data: tv.monthly.map(function (m) { return m.presale_transfer; }), itemStyle: { color: '#94a3b8' }, lineStyle: { color: '#94a3b8' }, showSymbol: false },
        { name: '中古/新成屋成交', type: 'line', data: tv.monthly.map(function (m) { return m.resale; }), itemStyle: { color: C.orange }, lineStyle: { color: C.orange }, showSymbol: false },
      ],
    }, true);
  }
  if (!volumeSizeChart) volumeSizeChart = newChart('chart-volume-size');
  if (volumeSizeChart) {
    var qs = tv.quarterly;
    volumeSizeChart.setOption({
      tooltip: baseTooltip, legend: baseLegend, grid: baseGrid,
      xAxis: mkAxis({ type: 'category', data: qs.map(function (q) { return q.quarter; }) }),
      yAxis: mkAxis({ type: 'value' }),
      series: ['small', 'mid', 'large'].map(function (k, i) { return { name: SIZE_LABELS[k].split(' ')[0], type: 'bar', stack: 's', data: qs.map(function (q) { return (q.by_size || {})[k] || 0; }), itemStyle: { color: [C.blue, C.orange, C.red][i] } }; }),
    }, true);
  }
  if (!volumeBandChart) volumeBandChart = newChart('chart-volume-band');
  if (volumeBandChart) {
    var qs2 = tv.quarterly;
    var bandKeys = ['lt1500', '1500_2000', '2000_2500', 'gte2500'];
    volumeBandChart.setOption({
      tooltip: baseTooltip, legend: baseLegend, grid: baseGrid,
      xAxis: mkAxis({ type: 'category', data: qs2.map(function (q) { return q.quarter; }) }),
      yAxis: mkAxis({ type: 'value' }),
      series: bandKeys.map(function (k, i) { return { name: PRICE_BAND_LABELS[k], type: 'bar', stack: 's', data: qs2.map(function (q) { return (q.by_price_band || {})[k] || 0; }), itemStyle: { color: [C.blue, C.aqua, C.orange, C.red][i] } }; }),
    }, true);
  }
  var yoy = tv.yoy;
  document.getElementById('volume-conclusion').textContent = yoy ? '最新完整季（' + yoy.latest_quarter + '）成交 ' + fmtInt(yoy.latest_total) + ' 件，較去年同季（' + yoy.prior_year_quarter + '，' + fmtInt(yoy.prior_year_total) + ' 件）' + (yoy.change_pct >= 0 ? '增加' : '減少') + ' ' + fmtPct(Math.abs(yoy.change_pct)) + '。' : '資料不足，無法算年增率。';
  document.getElementById('volume-method').innerHTML = '<ul><li>presale=B檔預售簽約、presale_transfer=A檔配對不到B檔的預售交屋登記（多為2021年7月前舊約）、resale=轉手（含新成屋）。</li><li>坪數帶/總價帶統計三種交易性質都算在一起，反映整體市場成交組成，不是單一類型。</li><li>最近2個月實價登錄還在陸續公布，件數會偏低，不是真的量縮。</li></ul>';
}

var rentalCountChart;
function renderRentalSection() {
  if (!DEMAND) return;
  var r = DEMAND.rental;
  if (!rentalCountChart) rentalCountChart = newChart('chart-rental-count');
  if (rentalCountChart) {
    rentalCountChart.setOption({
      tooltip: baseTooltip, grid: baseGrid,
      xAxis: mkAxis({ type: 'category', data: r.monthly_count.map(function (m) { return m.month; }) }),
      yAxis: mkAxis({ type: 'value', name: '件' }),
      series: [{ name: '青埔租賃登記件數', type: 'bar', data: r.monthly_count.map(function (m) { return m.n; }), itemStyle: { color: C.aqua }, barMaxWidth: 16 }],
    }, true);
  }
  var yieldRows = r.gross_yield_by_age_size || [];
  staticTable(document.getElementById('table-rental-yield'),
    [
      { label: '屋齡', cell: function (row) { return AGE_LABELS[row.age_bucket] || row.age_bucket; } },
      { label: '坪數', cell: function (row) { return SIZE_LABELS[row.size_bucket]; } },
      { label: '租金中位(萬/坪/月)', cell: function (row) { return row.median_rent_per_ping_month != null ? fmtInt(row.median_rent_per_ping_month) + '元' : '--'; } },
      { label: 'n(租)', cell: function (row) { return fmtInt(row.rent_n); } },
      { label: '中古單價中位', cell: function (row) { return row.median_resale_price_per_ping != null ? fmt(row.median_resale_price_per_ping, 2) + '萬/坪' : '--'; } },
      { label: 'n(中古)', cell: function (row) { return fmtInt(row.resale_n); } },
      { label: '毛租金收益率', cell: function (row) { return row.gross_yield != null ? fmtPct(row.gross_yield, 2) : '--（樣本不足）'; } },
    ], yieldRows);
  var h591 = r.rent_591_crosscheck || {};
  var extra = h591.active_listings != null ? '591即時交叉核對：目前在租約 ' + fmtInt(h591.active_listings) + ' 筆（仰森約 ' + fmtInt(h591.active_yuanxiong) + ' 筆），中位開租金約 ' + (h591.sample_median_rent != null ? fmtInt(h591.sample_median_rent) + ' 元/月' : '--') + '。' : '591即時交叉核對目前抓不到資料。';
  document.getElementById('rental-conclusion').textContent = '青埔租賃登記累計 ' + fmtInt(r.sample_total_n) + ' 筆（市場行情、整棟出租 ' + fmtInt(r.market_rate_whole_unit_n) + ' 筆）。' + extra;
  document.getElementById('rental-method').innerHTML = '<ul><li>租金來源：內政部實價登錄租賃(C檔)，只算「整棟(戶)出租」且非社會住宅代管/包租轉租的市場行情租金。</li><li>毛租金收益率＝月租金中位數×12 ÷ 中古成交單價中位數，同一屋齡×坪數格至少各3筆才算，是稅前、未扣管理費/折舊/空置期的粗略毛收益率。</li><li>591在租物件數只是即時交叉核對，不做去重/扣車位，跟實價登錄成交量口徑不同，不能直接相減比較。</li></ul>';
}

var popHhChart, popAgeChart;
function renderPopulationSection() {
  if (!DEMAND) return;
  var pop = DEMAND.population;
  if (pop.status !== 'ok') {
    document.getElementById('pop-conclusion').textContent = '人口資料抓取失敗：' + (pop.message || '未知原因') + '。';
    return;
  }
  var agg = pop.aggregate_monthly || [];
  if (!popHhChart) popHhChart = newChart('chart-pop-household');
  if (popHhChart) {
    popHhChart.setOption({
      tooltip: baseTooltip, legend: baseLegend, grid: Object.assign({}, baseGrid, { right: 50 }),
      xAxis: mkAxis({ type: 'category', data: agg.map(function (m) { return m.month; }), axisLabel: Object.assign({}, baseText, { interval: 5 }) }),
      yAxis: [mkAxis({ type: 'value', name: '戶/人' })],
      series: [
        { name: '戶數', type: 'line', data: agg.map(function (m) { return m.household; }), itemStyle: { color: C.blue }, lineStyle: { color: C.blue }, showSymbol: false },
        { name: '人口', type: 'line', data: agg.map(function (m) { return m.people; }), itemStyle: { color: C.orange }, lineStyle: { color: C.orange }, showSymbol: false },
      ],
    }, true);
  }
  if (!popAgeChart) popAgeChart = newChart('chart-pop-age');
  if (popAgeChart) {
    popAgeChart.setOption({
      tooltip: baseTooltip, legend: baseLegend, grid: Object.assign({}, baseGrid, { right: 50 }),
      xAxis: mkAxis({ type: 'category', data: agg.map(function (m) { return m.month; }), axisLabel: Object.assign({}, baseText, { interval: 5 }) }),
      yAxis: [mkAxis({ type: 'value', name: '佔比', axisLabel: Object.assign({}, baseText, { formatter: function (v) { return (v * 100).toFixed(0) + '%'; } }) }), mkAxis({ type: 'value', name: '人/戶', position: 'right' })],
      series: [
        { name: '25-44歲佔比', type: 'line', data: agg.map(function (m) { return m.age_25_44_share; }), itemStyle: { color: C.blue }, lineStyle: { color: C.blue }, showSymbol: false },
        { name: '0-14歲佔比', type: 'line', data: agg.map(function (m) { return m.age_0_14_share; }), itemStyle: { color: C.aqua }, lineStyle: { color: C.aqua }, showSymbol: false },
        { name: '戶量(人/戶)', type: 'line', yAxisIndex: 1, data: agg.map(function (m) { return m.household_size; }), itemStyle: { color: C.orange }, lineStyle: { color: C.orange }, showSymbol: false },
      ],
    }, true);
  }
  var yoy = pop.household_growth_yoy;
  var latest = pop.latest || {};
  document.getElementById('pop-conclusion').textContent = '最新月（' + (latest.month || '--') + '）納入村里戶數 ' + fmtInt(latest.household) + '、人口 ' + fmtInt(latest.people) + '、戶量 ' + fmt(latest.household_size, 2) + ' 人/戶、25-44歲佔比 ' + fmtPct(latest.age_25_44_share) + '。' + (yoy ? '戶數年增 ' + fmtPct(yoy.growth_rate) + '。' : '');
  document.getElementById('pop-method').innerHTML = '<ul><li>資料來源：內政部戶政司「村里戶數、單一年齡人口」(ODRP014)，逐月抓取，2021年7月起。</li><li>納入村里：' + (pop.included_villages || []).map(function (v) { return esc(v.label); }).join('；') + '。</li><li>排除（沒有可查驗的特區界圖資）：' + (pop.excluded_candidates || []).map(function (v) { return esc(v.village); }).join('、') + '。</li><li>中壢區青埔里2024年前後分割為青埔/青航/青園三里，三里加總視為一條線。</li></ul>';
}

function renderAffordabilitySection() {
  if (!DEMAND) return;
  var af = DEMAND.affordability;
  staticTable(document.getElementById('table-affordability'),
    [
      { label: '典型房型', cell: function (r) { return esc(r.label); } },
      { label: '總價中位(萬,近12月)', cell: function (r) { return r.median_total_price_wan != null ? fmtInt(r.median_total_price_wan) : '--'; } },
      { label: 'n', cell: function (r) { return fmtInt(r.n); } },
      { label: '房價所得比(PIR)', cell: function (r) { return r.pir != null ? fmt(r.pir, 1) + '倍' : '--'; } },
      { label: '假設房貸月付', cell: function (r) { return r.mortgage_monthly != null ? fmtInt(r.mortgage_monthly) + '元' : '--'; } },
      { label: '月付/月所得', cell: function (r) { return r.payment_to_income_ratio != null ? fmtPct(r.payment_to_income_ratio, 1) : '--'; } },
    ], af.rows || []);
  var incomeNote = af.status === 'ok' ? '桃園市' + af.income_year + '年平均每戶可支配所得 ' + fmtInt(af.income_annual_twd) + ' 元' : '桃園市可支配所得資料抓取失敗（' + esc(af.message || '') + '）';
  document.getElementById('afford-conclusion').textContent = incomeNote + '；' + (af.mortgage_assumption ? '假設房貸利率' + fmtPct(af.mortgage_assumption.rate_annual) + '、' + af.mortgage_assumption.years + '年、' + fmtPct(af.mortgage_assumption.ltv, 0) + '成數。' : '');
  document.getElementById('afford-method').innerHTML = '<ul><li>典型2房/3房用坪數帶（小&lt;30坪／中30-45坪）近似對應房型，不是嚴格房型統計；總價取近12個月預售+中古成交中位數。</li><li>可支配所得是桃園市全市數字（行政院主計總處家庭收支調查），不是青埔特區居民所得，逐年更新。</li><li>房貸月付是假設情境（利率/年期/成數見上），不是特定銀行核貸條件。</li></ul>';
}

function renderCrosswalkSection() {
  if (!DEMAND) return;
  var cw = DEMAND.crosswalk;
  staticTable(document.getElementById('table-crosswalk'),
    [
      { label: '坪數帶', cell: function (r) { return SIZE_LABELS[r.size_bucket]; } },
      { label: '未來4季新增待售', cell: function (r) { return fmt(r.future_4q_new_supply, 1); } },
      { label: '近4季中古成交×4', cell: function (r) { return fmt(r.trailing_4q_absorption, 1); } },
      { label: '差距', cell: function (r) { return (r.gap >= 0 ? '+' : '') + fmt(r.gap, 1); } },
    ], cw.rows || []);
  var hg = cw.household_growth_implied_demand || {};
  document.getElementById('crosswalk-conclusion').textContent = '現在在售約 ' + fmtInt(cw.current_onsale_stock) + ' 戶＋未來4季新增待售約 ' + fmtInt(Math.round(cw.future_4q_new_supply_total)) + ' 戶＝約 ' + fmtInt(Math.round(cw.current_onsale_stock + cw.future_4q_new_supply_total)) + ' 戶，照近4季中古成交速度同期約可賣掉 ' + fmtInt(Math.round(cw.trailing_4q_absorption_total)) + ' 戶；家戶成長推算新增自住需求約 ' + (hg.implied_new_ownership_demand != null ? fmtInt(hg.implied_new_ownership_demand) + ' 戶（假設轉化比例' + fmtPct(hg.ownership_share_assumption, 0) + '）' : '--') + '。';
  document.getElementById('crosswalk-method').innerHTML = '<ul><li>「未來4季新增待售」是壓力測試過供給結構、交屋後拿出來賣的比例算好的新增待售，不是新增交屋戶數本身；「近4季成交」只用轉手成交（不含預售）。</li><li>差距>0代表未來供給快於近期成交速度，差距<0反過來；這是速度比較，不是存量比較。</li><li>家戶成長推算需求＝新增家戶數(YoY) × 假設的自住購屋轉化比例（明確標註的假設值，不是實測），且沒有拆坪數帶，只能跟總量對照。</li></ul>';
}

function renderDemandSection() {
  if (!DEMAND) {
    document.getElementById('demand-conclusion').textContent = '尚未算出，執行 compute_demand.py 之後才有這個區塊。';
    return;
  }
  renderVolumeSection();
  renderRentalSection();
  renderPopulationSection();
  renderAffordabilitySection();
  renderCrosswalkSection();
  document.getElementById('demand-conclusion').textContent = '成交量、租賃需求、人口家戶、購屋負擔、供需對照見以下各小節。';
}

/* ===========================================================================
   價格走向
   =========================================================================== */
var outlookHistChart, outlookCalibChart, outlookIndexChart;
function renderOutlookHistoryChart() {
  var rows = LISTING_HISTORY.slice().sort(function (a, b) { return (a.month || a.date) < (b.month || b.date) ? -1 : 1; });
  if (!outlookHistChart) outlookHistChart = newChart('chart-outlook-history');
  if (!outlookHistChart) return;
  outlookHistChart.setOption({
    tooltip: baseTooltip, legend: baseLegend, grid: Object.assign({}, baseGrid, { right: 50 }),
    xAxis: mkAxis({ type: 'category', data: rows.map(function (r) { return r.month || r.date; }) }),
    yAxis: [mkAxis({ type: 'value', name: '在售戶數' }), mkAxis({ type: 'value', name: '萬/坪', position: 'right' })],
    series: [
      { name: '在售戶數(同類型)', type: 'line', data: rows.map(function (r) { return r.n_listings; }), itemStyle: { color: C.blue }, lineStyle: { color: C.blue } },
      { name: '開價中位數(萬/坪)', type: 'line', yAxisIndex: 1, data: rows.map(function (r) { return r.median_adj_ask; }), itemStyle: { color: C.orange }, lineStyle: { color: C.orange } },
    ],
  }, true);
}
function renderOutlookCalibChart(calib) {
  if (!outlookCalibChart) outlookCalibChart = newChart('chart-outlook-calib');
  if (!outlookCalibChart) return;
  var rows = calib.rows || [];
  outlookCalibChart.setOption({
    tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#ccd9e8', textStyle: baseTooltip.textStyle, formatter: function (p) { return '供給壓力 ' + fmt(p.value[0], 3) + '　未來4季變化 ' + fmtPct(p.value[1]); } },
    grid: baseGrid,
    xAxis: mkAxis({ type: 'value', name: '供給壓力代理變數' }),
    yAxis: mkAxis({ type: 'value', name: '未來4季指數變化' }),
    series: [{ type: 'scatter', symbolSize: 9, data: rows.map(function (r) { return [r.proxy, r.change_4q]; }), itemStyle: { color: C.blue } }],
  }, true);
}
function renderOutlookIndexChart(indexSeries, minN) {
  if (!outlookIndexChart) outlookIndexChart = newChart('chart-outlook-premium-index');
  if (!outlookIndexChart) return;
  var rows = indexSeries || [];
  outlookIndexChart.setOption({
    tooltip: baseTooltip, grid: baseGrid,
    xAxis: mkAxis({ type: 'category', data: rows.map(function (r) { return r.quarter + '(n=' + r.n + ')'; }), axisLabel: Object.assign({}, baseText, { rotate: 45 }) }),
    yAxis: mkAxis({ type: 'value' }),
    series: [{ name: '轉手/預售倍數', type: 'line', data: rows.map(function (r) { return r.index; }), lineStyle: { color: C.blue }, itemStyle: { color: C.blue }, symbolSize: function (v, p) { return (rows[p.dataIndex].n >= minN) ? 7 : 4; } }],
  }, true);
}
function renderPriceOutlook() {
  if (!OUTLOOK) {
    document.getElementById('outlook-conclusion').textContent = '尚未算出，執行 compute_price_outlook.py 之後才有這個區塊。';
    return;
  }
  document.getElementById('outlook-scope-note').textContent = OUTLOOK.scope_note;
  var moi = OUTLOOK.current_moi;
  document.getElementById('outlook-moi-note').innerHTML = '591去重後同類型在售 ' + fmtInt(moi.n_listings) + ' 戶，開價中位數 ' + fmt(moi.median_ask, 2) + ' 萬/坪；同類型轉手月均成交 ' + fmt(moi.monthly_absorption, 2) + ' 戶/月（近' + moi.window_months + '個月，扣最後' + moi.lag_months + '個月落後月）。<strong>照這個速度，現在這批存貨大約還要 ' + (moi.moi != null ? fmt(moi.moi, 1) + ' 個月賣完' : '--') + '</strong>。<br>' + esc(deJargon(moi.caveat) || '');
  renderOutlookHistoryChart();

  var proj = OUTLOOK.projection;
  document.getElementById('outlook-projection-note').textContent = '賣出戶數＝近4個完整季同類型中古成交季均 ' + fmt(proj.base_absorption_per_quarter, 1) + ' 戶，每季用青埔戶數年增率 ' + (proj.household_growth_yoy_used != null ? fmtPct(proj.household_growth_yoy_used) : '--') + ' 放大。';
  staticTable(document.getElementById('table-outlook-projection'),
    [{ label: '季別', cell: function (r) { return r.quarter; } }, { label: '期初存量', cell: function (r) { return fmt(r.opening_stock, 1); } }, { label: '新增供給', cell: function (r) { return fmt(r.new_supply, 1); } }, { label: '可售合計', cell: function (r) { return fmt(r.available, 1); } }, { label: '預估賣出', cell: function (r) { return fmt(r.absorption, 1); } }, { label: '幾個月賣得完', cell: function (r) { return r.moi != null ? fmt(r.moi, 1) : '--'; } }, { label: '期末存量', cell: function (r) { return fmt(r.closing_stock, 1); } }],
    proj.rows || []);

  var calib = OUTLOOK.calibration;
  document.getElementById('outlook-calib-note').innerHTML = '回歸「未來4季指數變化」對「當季供給壓力代理變數」：n=' + fmtInt(calib.n) + '，R²=' + (calib.r2 != null ? fmt(calib.r2, 3) : '--') + '。' + esc(calib.note || '');
  renderOutlookCalibChart(calib);

  var facts = OUTLOOK.premium_index_facts || {};
  var minN = (facts.lowest_n_ge_min || {}).min_n_required;
  document.getElementById('outlook-index-note').textContent = '橫軸標每季樣本數(n)；樣本數低於' + minN + '的點只當參考。';
  renderOutlookIndexChart(calib.index_series, minN);
  var last4 = facts.last4_complete || {}, lowest = facts.lowest_n_ge_min || {}, peak = facts.peak || {};
  document.getElementById('outlook-facts-note').textContent = '近4個完整季（' + (last4.quarters || []).join('、') + '）指數中位數 ' + fmt(last4.median, 4) + '；n≥' + minN + '最低點 ' + esc(lowest.quarter || '--') + '（' + fmt(lowest.value, 4) + '，n=' + fmtInt(lowest.n) + '）；2024高點區間中位數 ' + fmt(peak.median, 4) + '。';

  var scenarios = OUTLOOK.scenarios || {};
  staticTable(document.getElementById('table-outlook-scenarios'),
    [{ label: '情境', cell: function (r) { return r.name; } }, { label: '倍數', cell: function (r) { return r.multiplier != null ? fmt(r.multiplier, 4) : '--'; } }, { label: '依據', cell: function (r) { return esc(deJargon(r.basis) || '--'); } }],
    Object.keys(scenarios).map(function (name) { var s = scenarios[name]; return { name: name, multiplier: s.multiplier != null ? s.multiplier : s.index, basis: s.basis }; }));

  var sc = OUTLOOK.supply_context || {}, pv = sc.presale_volume || {};
  document.getElementById('outlook-supply-context-note').innerHTML = '未來4季預估新增待售約 ' + fmt(sc.future_4q_new_supply, 1) + ' 戶，同期預估賣出約 ' + fmt(sc.future_4q_absorption, 1) + ' 戶。<br>觀察（不是預測）：預售簽約量從' + esc(pv.baseline_year) + '年季均' + fmt(pv.baseline_avg_per_quarter, 1) + '件，到' + esc(pv.since_quarter) + '起季均降到' + fmt(pv.recent_avg_per_quarter, 1) + '件，變化' + (pv.change_pct != null ? fmtPct(pv.change_pct) : '--') + '；同一段期間轉手/預售倍數從' + fmt(sc.premium_index_at_shrink_start, 4) + '到' + fmt(sc.premium_index_latest_complete_value, 4) + '（' + esc(sc.premium_index_latest_complete_quarter) + '）。' + esc(deJargon(sc.observation_note) || '');
  document.getElementById('outlook-recalc-note').textContent = OUTLOOK.recalc_note;

  document.getElementById('outlook-conclusion').textContent = '青埔同建案轉手價近4完整季中位數為預售價的 ' + fmt(last4.median, 2) + ' 倍；供給壓力和後續價格在過去資料裡沒有穩定關係（R²=' + (calib.r2 != null ? fmt(calib.r2, 2) : '--') + '），所以只列三個情境、不給漲跌幅。';
  document.getElementById('outlook-method').innerHTML = '<ul><li>轉手/預售倍數＝每筆中古成交單價 ÷ 該建案預售單價中位數，取季中位數；這樣不同建案放在一起比，才不會被新舊產品世代混雜的假趨勢誤導，自2021Q3起。</li><li>三個情境（維持/收斂/回升）只輸出倍數本身，不綁定任何特定戶別；套用到哪一戶由「戶別試算」分頁決定。</li><li>歷史校準回歸n或R²沒過門檻時，只是記錄「查過供給壓力對未來價格變化的解釋力，沒查到關係」，不拿來配價格路徑。</li></ul>';
}

/* ===========================================================================
   青埔最新成交
   =========================================================================== */
var latestColumns = [
  { key: 'date', label: '日期', type: 'str', value: function (d) { return d.date; }, cell: function (d) { return d.date; } },
  { key: 'district', label: '行政區', type: 'str', value: function (d) { return d.district; }, cell: function (d) { return esc(d.district); } },
  { key: 'road', label: '道路', type: 'str', value: function (d) { return d.road || ''; }, cell: function (d) { return esc(d.road || '--'); } },
  { key: 'project', label: '建案/地址', type: 'str', value: function (d) { return d.project_name || d.address; }, cell: function (d) { return esc(d.project_name || d.address); } },
  { key: 'source', label: '類型', type: 'str', value: function (d) { return d.deal_kind; }, cell: dealKindLabel },
  { key: 'area', label: '坪數', type: 'num', value: function (d) { return d.area_ping; }, cell: function (d) { return fmt(d.area_ping, 1); } },
  { key: 'total_price', label: '總價(萬)', type: 'num', value: function (d) { return d.total_price_wan; }, cell: function (d) { return fmt(d.total_price_wan, 0); } },
  { key: 'unit_price', label: '萬/坪', type: 'num', value: function (d) { return d.unit_price_wan_ping; }, cell: function (d) { return fmt(d.unit_price_wan_ping, 1); } },
  { key: 'age', label: '屋齡', type: 'num', value: function (d) { return d.age_years; }, cell: function (d) { return d.age_bucket === 'presale' ? '預售' : d.age_years != null ? fmt(d.age_years, 1) + '年' : '未知'; } },
  { key: 'flags', label: '旗標', type: 'str', value: function () { return ''; }, cell: dealFlags },
];
var latestTable;
function populateRoadOptions() {
  var roads = [...new Set(DEALS.map(function (d) { return d.road; }).filter(Boolean))].sort();
  var sel = document.getElementById('latest-road-filter');
  roads.forEach(function (r) { var o = document.createElement('option'); o.value = r; o.textContent = r; sel.appendChild(o); });
}
function renderLatestTable() {
  var typeVal = document.getElementById('latest-type-filter').value;
  var roadVal = document.getElementById('latest-road-filter').value;
  var rows = DEALS.filter(function (d) { return passesFilter(d.size_bucket, d.age_bucket); });
  if (typeVal !== 'all') rows = rows.filter(function (d) { return d.source === typeVal; });
  if (roadVal !== 'all') rows = rows.filter(function (d) { return d.road === roadVal; });
  latestTable.setRows(rows); latestTable.setLimit(latestLimit);
  var t = latestTable.render();
  document.getElementById('latest-more').style.display = t.total > latestLimit ? 'inline-block' : 'none';
  document.getElementById('latest-conclusion').textContent = '符合目前篩選共 ' + fmtInt(t.total) + ' 筆青埔交易。';
}

/* ===========================================================================
   資料說明與方法論
   =========================================================================== */
function renderMethodology() {
  var cfg = META.config || {};
  var lvr = META.lvr || {};
  var h591 = META.house591 || {};
  var h591rent = META.house591_rent || {};
  var roads = (cfg.road_whitelist_common || []).concat((cfg.road_whitelist_dayuan_only || []).map(function (r) { return r + '（僅大園區）'; }));
  var districts = (cfg.districts || []).join('、');
  var yx = cfg.yuanxiong_rule || {};

  document.getElementById('methodology-body').innerHTML =
    '<h3 class="section-heading" style="font-size:13px">資料來源</h3>' +
    '<ul>' +
    '<li>實價登錄A/B/C檔：內政部不動產成交案件實際資訊資料庫（plvr.land.moi.gov.tw），每月1、11、21日更新，登記後約1個月才公開。A檔＝買賣（中古/新成屋），B檔＝預售屋，C檔＝租賃。最後抓取：' + fmtDateTime(lvr.last_run) + '，累積 ' + fmtInt(lvr.total_deals) + ' 筆交易＋' + fmtInt(lvr.total_rentals) + ' 筆租賃。</li>' +
    '<li>591售屋（sale.591.com.tw）公開JSON API，關鍵字「青埔」「仰森」。最後抓取：' + fmtDateTime(h591.last_run) + '，狀態 ' + esc(h591.status || '--') + '。</li>' +
    '<li>591租屋（rent.591.com.tw）v3 API，輕量交叉核對用途。最後抓取：' + fmtDateTime(h591rent.last_run) + '，狀態 ' + esc(h591rent.status || '--') + '。</li>' +
    '<li>內政部戶政司村里戶數/單一年齡人口（ODRP014）、內政部預售屋備查建案/建照資料、行政院主計總處家庭收支調查（可支配所得）。</li>' +
    '</ul>' +
    '<h3 class="section-heading" style="font-size:13px">青埔特區範圍</h3>' +
    '<p>鄉鎮市區為' + esc(districts) + '，且地址包含下列任一道路（子字串比對，預售屋「A路與B路交叉口」這種地址也算）：</p>' +
    '<p class="road-list">' + roads.map(esc).join('、') + '</p>' +
    '<h3 class="section-heading" style="font-size:13px">遠雄仰森判斷方式</h3>' +
    '<p>預售資料直接比對建案名稱「' + esc(yx.project_name) + '」。買賣資料（交屋後轉手、或預售交屋登記）沒有建案名稱，改用地址判斷：' + esc(yx.district) + '、地址包含「' + esc(yx.address_keyword) + '」、門牌號為 ' + (yx.door_numbers || []).join('、') + ' 號其中之一。</p>' +
    '<h3 class="section-heading" style="font-size:13px">預售屋簽約 / 交屋前過戶去重</h3>' +
    '<p>預售屋簽約（B檔）和交屋前過戶（A檔）常各登記一次；用（行政區、交易日期、總價、樓層）比對去重，A檔配對得到B檔的那筆不會重複列出。配不到的多半是B檔開始登記前簽的約，仍列出並標「預售交屋登記」。另外，交屋後150天內完成的買賣登記也算預售交屋登記，不算轉手：轉手需要原屋主先交屋、住一段時間才會賣，不可能交屋一兩個月內就有全新的第三方交易。</p>' +
    '<h3 class="section-heading" style="font-size:13px">單價怎麼算</h3>' +
    '<p>萬/坪 =（總價－車位總價）÷（（建物移轉總面積－車位移轉總面積）× 0.3025）。租金/坪同理，用租賃C檔的總額元－車位總額元。備註出現親友、特殊關係、員工、瑕疵、債權債務、急買急賣、含裝潢、增建、頂樓加蓋等字樣的交易，或疑似把車位價格灌進總價的交易，排除在中位數之外，但列表仍列出並標記旗標。</p>' +
    '<h3 class="section-heading" style="font-size:13px">591開價扣車位 / 重複刊登去重</h3>' +
    '<p>591單價欄位不一致，判斷式：物件有車位、且591單價跟「總價÷坪數」的差小於0.6，代表591沒扣車位，這時用同社區（或青埔近24個月）車位總價/坪數中位數重新扣一次，扣過的標「估」。同一戶常被多個仲介重複刊登，依（社區或道路、樓層字串、坪數取到0.5坪）分組，組內開價差在3%以內視為同戶。</p>' +
    '<h3 class="section-heading" style="font-size:13px">買賣資料歸戶到建案（門牌對照表）</h3>' +
    '<p>中古屋（買賣資料）沒有建案名稱，把備註寫「預售屋」的買賣列，用（行政區、交易日期、總價）配對回預售資料，配對成功就把門牌記一票給那個建案；同一門牌全部票數多數決。' + (DOOR_PROJECT ? '門牌對照共 ' + fmtInt(DOOR_PROJECT.door_count) + ' 個門牌對應到 ' + fmtInt(DOOR_PROJECT.project_count) + ' 個建案。' : '') + '</p>' +
    '<h3 class="section-heading" style="font-size:13px">同建案漲幅估值法</h3>' +
    '<p>不拿青埔全區跨屋齡的中位數互相比較，只比同一個建案（預售單價中位數 vs 中古單價中位數），至少3筆中古成交的建案才算，同建案樣本不足時退回同屋齡區間、青埔全區的比例。</p>' +
    '<h3 class="section-heading" style="font-size:13px">轉手/預售倍數</h3>' +
    '<p>每筆中古成交單價 ÷ 該建案預售單價中位數，取季中位數，用來消除「新舊產品世代混雜」造成的假趨勢。三個情境倍數（維持/收斂/回升）用這條倍數近4完整季中位數、n≥5季別裡的最低點、2024年高點區間，不是預測。</p>' +
    '<h3 class="section-heading" style="font-size:13px">建案供給模型</h3>' +
    '<p>交屋時間表用官方「第1次登記日期」為準，不是用交易資料反推；推算交屋時間已過但官方仍未登記的「逾期」建案，戶數平均攤到未來4季（不是全部疊在單一季），因為逾期建案的實際交屋時間點本來就不確定。</p>' +
    '<h3 class="section-heading" style="font-size:13px">人口村里納入範圍</h3>' +
    '<p>納入：' + ((SUPPLY && SUPPLY.demand) ? '' : '') + (((DEMAND && DEMAND.population && DEMAND.population.included_villages) || []).map(function (v) { return esc(v.label); }).join('；')) + '。排除（沒有可查驗的青埔特區界圖資，無法確認面積佔比）：' + (((DEMAND && DEMAND.population && DEMAND.population.excluded_candidates) || []).map(function (v) { return esc(v.village); }).join('、')) + '。</p>' +
    '<h3 class="section-heading" style="font-size:13px">限制</h3>' +
    '<ul>' +
    '<li>591在售筆數常包含屋主開高的試探性開價，不會真的用這個價成交，跟成交端的「存貨」不是同一個基礎。</li>' +
    '<li>可支配所得、房貸月付都是全市/假設情境數字，不是青埔特區居民或特定銀行的真實數字。</li>' +
    '<li>毛租金收益率是稅前、未扣管理費/折舊/空置期的粗略估計，樣本不足的屋齡×坪數格留空。</li>' +
    '<li>家戶成長推算購屋需求的轉化比例是明確標註的假設值，不是實測。</li>' +
    '<li>所有歷史校準回歸若n或R²沒過門檻，誠實記錄「沒查到關係」，不拿來配價格路徑。</li>' +
    '</ul>';
}

/* ===========================================================================
   主流程
   =========================================================================== */
function renderFilteredSections(resetPages) {
  // 開價列表只要 UNITS，隨時可畫；成交/比價/走勢/最新成交要 deals.json，
  // 還沒抓到就先不畫，等 ensureDealsLoaded() 完成後那幾支自己會補畫一次。
  if (resetPages) { listingLimit = PAGE_SIZE; yxDealsLimit = PAGE_SIZE; latestLimit = PAGE_SIZE; }
  renderListingTable();
  if (DEALS_LOADED) {
    renderYxDealsSection();
    renderCompareTable();
    renderTrendSection();
    renderLatestTable();
  }
}
function wireStaticControls() {
  document.getElementById('listing-more').addEventListener('click', function () { listingLimit += PAGE_SIZE; renderListingTable(); });
  document.getElementById('yxdeals-more').addEventListener('click', function () { yxDealsLimit += PAGE_SIZE; renderYxDealsSection(); });
  document.getElementById('latest-more').addEventListener('click', function () { latestLimit += PAGE_SIZE; renderLatestTable(); });
  document.getElementById('latest-type-filter').addEventListener('change', function () { latestLimit = PAGE_SIZE; renderLatestTable(); });
  document.getElementById('latest-road-filter').addEventListener('change', function () { latestLimit = PAGE_SIZE; renderLatestTable(); });
  document.getElementById('grid-mode').addEventListener('change', renderSalesGrid);
}

/* ===========================================================================
   分頁籤：URL hash 連結（ascii id 或中文都認）、鍵盤方向鍵可切換、切換時
   resize 所有圖表（隱藏分頁裡的 echarts 一開始量到的是 0 寬，顯示後要重量一次）。
   =========================================================================== */
var TABS = [
  { id: 'overview', zh: '總覽' },
  { id: 'yuanxiong', zh: '仰森' },
  { id: 'estimator', zh: '戶別試算' },
  { id: 'supply', zh: '青埔供給' },
  { id: 'demand', zh: '青埔需求' },
  { id: 'outlook', zh: '價格走向' },
  { id: 'methodology', zh: '怎麼算的' },
];
var DEALS_TABS = { yuanxiong: true, estimator: true }; // 進這兩個分頁就要開始抓 deals.json

function resolveTabId(rawHash) {
  if (!rawHash) return null;
  var v;
  try { v = decodeURIComponent(rawHash.replace(/^#/, '')); } catch (e) { v = rawHash.replace(/^#/, ''); }
  var hit = TABS.filter(function (t) { return t.id === v || t.zh === v; })[0];
  return hit ? hit.id : null;
}
function activateTab(id, opts) {
  opts = opts || {};
  if (!TABS.some(function (t) { return t.id === id; })) id = 'overview';
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
    activateTab(resolveTabId(window.location.hash) || 'overview', { updateHash: false });
  });
  var qpDetails = document.getElementById('details-qingpu-deals');
  if (qpDetails) qpDetails.addEventListener('toggle', function () { if (qpDetails.open) ensureDealsLoaded(); });
  activateTab(resolveTabId(window.location.hash) || 'overview', { updateHash: false });
}

async function init() {
  initTabs();
  initFilterBar();
  wireStaticControls();

  listingTable = makeTable(document.getElementById('table-listing'), listingColumns, { key: 'post_date', dir: 'desc' });
  yxDealsTable = makeTable(document.getElementById('table-yx-deals'), yxDealsColumns, { key: 'date', dir: 'desc' });
  compareTable = makeTable(document.getElementById('table-compare'), compareColumns, { key: 'listingN', dir: 'desc' });
  latestTable = makeTable(document.getElementById('table-latest'), latestColumns, { key: 'date', dir: 'desc' });
  renderEstimatorMethod();

  // 總覽只靠 summary.json（小檔），跟其他 JSON 並行抓、誰先到誰先畫，
  // 不互相等；deals.json 完全不在這個階段抓。
  var summaryPromise = loadSummary().then(renderOverview).catch(function (err) {
    console.error(err);
    showOverviewError(err);
  });
  var dataPromise = loadData().catch(function (err) { console.error(err); });

  await dataPromise;
  renderListingTable();
  renderSupplySection();
  renderDemandSection();
  renderPriceOutlook();
  renderMethodology();

  await summaryPromise; // renderTiles 的「最近一筆成交」讀 summary.json，兩份都要到齊
  renderTiles();

  document.getElementById('updated-line').textContent = '實價登錄：' + fmtDateTime(META.lvr && META.lvr.last_run) + '　591售價：' + fmtDateTime(META.house591 && META.house591.last_run) + '　591租金：' + fmtDateTime(META.house591_rent && META.house591_rent.last_run);

  // 如果一開始就是用 #yuanxiong / #estimator 這種連結直接進站，activateTab()
  // 裡已經觸發過 ensureDealsLoaded()；這裡不用再重複判斷一次。
}

init().catch(function (err) {
  console.error(err);
  var line = document.getElementById('updated-line');
  if (line) line.textContent = '資料載入失敗：' + err.message;
});
