'use strict';

/* ===========================================================================
   青埔特區房市追蹤：純前端讀 data/*.json 現場算現場畫，沒有伺服器。
   中文單語頁（依站方指示不做雙語）。ECharts 用法沿用站內 echarts-spec：
   色彩變數 C、baseText/baseGrid/baseTooltip/baseLegend/mkAxis、allCharts 陣列
   + resize handler（分頁切換時也會呼叫一次 resize，隱藏分頁裡的圖表才會量對尺寸）。

   分頁架構（章節，讀起來由上到下）：結論/青埔在哪個位置/供給/需求/價格/
   什麼情況下結論會錯/怎麼算的，用 URL hash（ascii id 或對應中文）連結、
   方向鍵可切換，每章底部有「下一章 →」連結。仰森個案（現況/銷控表/開價列表/
   成交/戶別試算）已搬到 yangsen/index.html 獨立頁面，跟這裡共用 data/*.json。
   第一次載入只抓 data/summary.json＋data/compare.json（小檔，結論/青埔在哪個
   位置用）+ 除 deals.json、listings.json、estimate.json、rental.json 以外的
   其他 JSON（並行）；data/deals.json（11MB）延遲到「價格」章節（各社區比價/
   成交走勢/最新成交需要）才抓（見 ensureDealsLoaded()）。
   =========================================================================== */

var SIZE_LABELS = { small: '小 (<30坪)', mid: '中 (30-45坪)', large: '大 (>45坪)' };
var AGE_LABELS = { presale: '預售', new: '新成屋 (0-2年)', mid_age: '3-10年', old: '10年以上', unknown: '未知' };
var PRICE_BAND_LABELS = { lt1500: '<1500萬', '1500_2000': '1500-2000萬', '2000_2500': '2000-2500萬', gte2500: '2500萬+' };
var PAGE_SIZE = 50;

var DEALS = [], UNITS = [];
var SUPPLY = null, DEMAND = null, OUTLOOK = null, ESTIMATE = null, LISTING_HISTORY = [], META = {}, DOOR_PROJECT = null, SUMMARY = null, COMPARE = null;
var DEALS_LOADED = false, DEALS_PROMISE = null;

var FILTERS = {
  size: new Set(['small', 'mid', 'large']),
  age: new Set(['presale', 'new', 'mid_age', 'old', 'unknown']),
};

var latestLimit = PAGE_SIZE;

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
  // 篩選 chip 只在「價格」章節的「看青埔成交」收合區塊出現一次，跟仰森個案頁
  // （yangsen/yangsen.js）共用同一個 localStorage key，兩邊篩選保持一致。
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
    var res = await fetch(path, { cache: 'no-cache' });
    return res.ok ? await res.json() : fallback;
  } catch (e) { return fallback; }
}
async function fetchJsonlSafe(path) {
  try {
    var res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) return [];
    var text = await res.text();
    return text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) { return []; }
}

async function loadSummary() {
  var res = await fetch('data/summary.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  SUMMARY = await res.json();
  return SUMMARY;
}

// 「結論」以外的分頁要的其他 JSON：都不大（合計不到3MB），並行抓，不等 deals.json。
// listings.json/rental.json 只有仰森個案頁（yangsen/）需要，這裡不抓；estimate.json
// 這裡也要抓，「結論」S4（同案漲幅小圖）跟「價格」章節都用得到。
async function loadData() {
  var unitsJson = await fetchJsonSafe('data/units.json', { units: [] });
  META = await fetchJsonSafe('data/meta.json', {});
  UNITS = unitsJson.units || [];

  SUPPLY = await fetchJsonSafe('data/supply_demand.json', null);
  DEMAND = await fetchJsonSafe('data/demand.json', null);
  OUTLOOK = await fetchJsonSafe('data/outlook.json', null);
  ESTIMATE = await fetchJsonSafe('data/estimate.json', null);
  LISTING_HISTORY = await fetchJsonlSafe('data/listing_history.jsonl');
  DOOR_PROJECT = await fetchJsonSafe('data/door_project.json', null);
}

async function loadCompare() {
  COMPARE = await fetchJsonSafe('data/compare.json', null);
  return COMPARE;
}

// deals.json 約11MB，只有「仰森」「戶別試算」分頁、跟「青埔需求」分頁裡「青埔
// 成交」收合區塊需要，第一次打開才抓；抓過就快取在 DEALS，不重複抓。
function ensureDealsLoaded() {
  if (DEALS_PROMISE) return DEALS_PROMISE;
  DEALS_PROMISE = fetch('data/deals.json', { cache: 'no-cache' }).then(function (res) {
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
  var el = document.getElementById('qingpu-deals-loading');
  if (el) el.style.display = 'none';
  populateRoadOptions();
  renderCompareTable();
  renderTrendSection();
  renderLatestTable();
  requestAnimationFrame(function () { allCharts.forEach(function (c) { if (c) c.resize(); }); });
}
function onDealsError(err) {
  var msg = '成交明細載入失敗：' + err.message + '，請重新整理頁面再試一次。';
  var el = document.getElementById('qingpu-deals-loading');
  if (el) { el.textContent = msg; el.classList.add('error-line'); }
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
  for (var i = 1; i <= 5; i++) {
    var sEl = document.getElementById('overview-sentence-' + i);
    if (sEl) sEl.textContent = '';
  }
}
function chapterConclusion(k) {
  return (SUMMARY && SUMMARY.chapter_conclusions && SUMMARY.chapter_conclusions[k]) || '';
}

function renderOverview() {
  if (!SUMMARY) return;
  var yx = SUMMARY.yx_current || {};
  var up = SUMMARY.uplift || {};
  var sv = SUMMARY.supply_vs_sales || {};
  var sc = SUMMARY.scenarios || {};

  var sentences = SUMMARY.sentences || [];
  for (var i = 1; i <= 5; i++) {
    var sEl = document.getElementById('overview-sentence-' + i);
    if (sEl) sEl.textContent = sentences[i - 1] || '';
  }

  var mid = sc['維持'] || {}, conv = sc['收斂'] || {}, rise = sc['回升'] || {};
  var qzone = COMPARE && (COMPARE.zones || []).filter(function (z) { return z.id === 'qingpu'; })[0];
  var cards = [
    overviewCard('一年要賣 vs 賣得掉', fmtInt(sv.total_to_sell) + ' 戶　vs　' + fmtInt(sv.one_year_sold) + ' 戶', '現在在售＋未來4季新增　vs　近4季轉手成交×1年'),
    overviewCard('轉手比預售貴多少', up.median != null ? fmtPct(up.median, 0) : '--', '同建案中位漲幅，n=' + fmtInt(up.n_projects) + ' 個建案'),
    overviewCard('轉手價是預售價的幾倍', mid.multiplier != null ? fmt(mid.multiplier, 2) + ' 倍' : '--', '收斂 ' + (conv.multiplier != null ? fmt(conv.multiplier, 2) : '--') + ' 倍・回升 ' + (rise.multiplier != null ? fmt(rise.multiplier, 2) : '--') + ' 倍'),
    overviewCard('近兩年蓋好的是兩年轉手的幾倍', SUMMARY.zone_card ? fmt(SUMMARY.zone_card.ratio_completed, 1) + ' 倍' : '--',
      SUMMARY.zone_card ? '全桃園第 ' + (SUMMARY.zone_card.rank_completed_taoyuan || '--') + ' 高（全市 ' + fmt(SUMMARY.zone_card.city_ratio_completed, 1) + ' 倍）；只比新房子的話，重劃區 ' + (SUMMARY.zone_card.n_zones || '--') + ' 個裡第 ' + (SUMMARY.zone_card.rank_completed_zones || '--') + ' 高' : '詳見「青埔在哪個位置」'),
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
   結論章節：每句話底下的小圖（S1-S4；S5 沿用上面的關鍵圖）。各自只依賴自己
   要的 JSON，資料到了才畫，跟其他章節的主圖分開一份 chart 實例（id 不同），
   不搶「青埔在哪個位置/供給/需求/價格」章節裡對應的完整圖表。
   =========================================================================== */
// 逐季走勢（兩年窗口 vs 一年窗口，S1小圖＋「青埔在哪個位置」大圖共用）：顏色固定
// 對應區域身分（不隨排序/篩選換色），桃園全市用虛線中性色當參考線、不跟其他區域
// 搶色（跟S2的markLine邏輯一致），跟六都比較的「色彩代表對象、不代表排名」是同一個
// 原則。早期（2024Q1前）完工戶數可能偏少（預售屋備查2021年7月才開始登記），該季
// 的點標成灰色（跟S3把最後一季成交柱標灰色是同一個手法）。
var ZONE_TREND_COLORS = {
  qingpu: C.orange, linkou: C.blue, a7: C.green, taoyuan: C.muted,
  xiaoguixi: C.aqua, zhonglu: C.red, jingguo: '#7c3aed', yiwen: '#b45309',
};
var ZONE_TREND_NAMES = { qingpu: '青埔', linkou: '林口', a7: 'A7', taoyuan: '桃園全市', xiaoguixi: '小檜溪', zhonglu: '中路', jingguo: '經國', yiwen: '藝文特區' };
var EARLY_POINT_COLOR = '#cbd5e1';
function trendPoint(p, key) {
  return { value: p[key], itemStyle: p.early_undercount ? { color: EARLY_POINT_COLOR } : undefined };
}

// S1：近一年完工÷一年轉手、換手率——桃園市13個行政區＋青埔＋桃園全市（不含
// 其他重劃區，跟「青埔在哪個位置」章節21根的那張長條圖範圍不同）。
var s1RatioChart, s1TurnoverChart;
function renderOverviewS1() {
  if (!COMPARE) return;
  var rows = (COMPARE.districts || [])
    .concat(COMPARE.qingpu_district_row ? [COMPARE.qingpu_district_row] : [])
    .concat(COMPARE.city ? [Object.assign({}, COMPARE.city, { id: 'city' })] : [])
    .filter(function (r) { return r.ratio_completed_to_resale != null; })
    .sort(function (a, b) { return a.ratio_completed_to_resale - b.ratio_completed_to_resale; });
  function barColor(r) { return r.id === 'qingpu' ? C.orange : (r.id === 'city' ? C.muted : C.blue); }
  if (!s1RatioChart) s1RatioChart = newChart('chart-s1-ratio');
  if (s1RatioChart) {
    s1RatioChart.setOption({
      tooltip: baseTooltip,
      grid: Object.assign({}, baseGrid, { left: 84, top: 8, bottom: 8 }),
      xAxis: mkAxis({ type: 'value', name: '完工÷轉手(倍)' }),
      yAxis: mkAxis({ type: 'category', data: rows.map(function (r) { return r.name; }), axisLabel: Object.assign({}, baseText, { fontSize: 10, interval: 0 }) }),
      series: [{ type: 'bar', barMaxWidth: 11, data: rows.map(function (r) { return { value: r.ratio_completed_to_resale, itemStyle: { color: barColor(r) } }; }) }],
    }, true);
  }
  if (!s1TurnoverChart) s1TurnoverChart = newChart('chart-s1-turnover');
  if (s1TurnoverChart) {
    s1TurnoverChart.setOption({
      tooltip: baseTooltip,
      grid: Object.assign({}, baseGrid, { left: 84, top: 8, bottom: 8 }),
      xAxis: mkAxis({ type: 'value', name: '換手率(%)' }),
      yAxis: mkAxis({ type: 'category', data: rows.map(function (r) { return r.name; }), axisLabel: Object.assign({}, baseText, { fontSize: 10, interval: 0 }) }),
      series: [{ type: 'bar', barMaxWidth: 11, data: rows.map(function (r) { return { value: r.turnover_pct, itemStyle: { color: barColor(r) } }; }) }],
    }, true);
  }
  var noteEl = document.getElementById('s1-chart-note');
  if (noteEl) noteEl.textContent = '左：近兩年完工戶數÷兩年轉手量（倍，主要欄位），桃園市13個行政區＋青埔＋桃園全市，依數值排序，橙色＝青埔、灰色＝全市。右：同一組區域的換手率（年均轉手÷總戶數，轉手量取兩年平均）。資料來源：compare.json；完整表格見「青埔在哪個位置」章節。';
}
// S1逐季走勢小圖：青埔近12季的完工÷轉手倍數，兩年窗口（主要）實線＋一年窗口
// （次要）虛線疊在一起看，示範一年窗口波動有多大；桃園全市（兩年窗口）當參考虛線。
var s1TrendChart;
function renderOverviewS1Trend() {
  if (!COMPARE) return;
  var qz = (COMPARE.zones || []).filter(function (z) { return z.id === 'qingpu'; })[0];
  var cityRow = COMPARE.city;
  if (!qz || !qz.ratio_series || !qz.ratio_series.length) return;
  var quarters = qz.ratio_series.map(function (p) { return p.quarter; });
  var series = [
    {
      name: '青埔（兩年窗口）', type: 'line', data: qz.ratio_series.map(function (p) { return trendPoint(p, 'ratio_2y'); }),
      lineStyle: { color: C.orange, width: 2 }, itemStyle: { color: C.orange }, symbolSize: 5, connectNulls: true,
    },
    {
      name: '青埔（一年窗口）', type: 'line', data: qz.ratio_series.map(function (p) { return trendPoint(p, 'ratio_1y'); }),
      lineStyle: { color: C.orange, width: 1.5, type: 'dashed' }, itemStyle: { color: C.orange }, symbolSize: 4, connectNulls: true,
    },
  ];
  if (cityRow && cityRow.ratio_series && cityRow.ratio_series.length) {
    series.push({
      name: '桃園全市（兩年窗口）', type: 'line', data: cityRow.ratio_series.map(function (p) { return p.ratio_2y; }),
      lineStyle: { color: C.muted, width: 1.5, type: 'dashed' }, itemStyle: { color: C.muted }, symbolSize: 3, connectNulls: true,
    });
  }
  if (!s1TrendChart) s1TrendChart = newChart('chart-s1-trend');
  if (s1TrendChart) {
    s1TrendChart.setOption({
      tooltip: baseTooltip, legend: baseLegend, grid: Object.assign({}, baseGrid, { top: 30, bottom: 24 }),
      xAxis: mkAxis({ type: 'category', data: quarters }),
      yAxis: mkAxis({ type: 'value', name: '完工÷轉手(倍)' }),
      series: series,
    }, true);
  }
  var noteEl = document.getElementById('s1-trend-note');
  if (noteEl) noteEl.textContent = '青埔完工÷轉手近12季走勢：實線＝兩年窗口（主要欄位），虛線＝一年窗口，一年窗口起伏明顯比兩年窗口大。灰點：2024Q1以前，預售屋備查資料才剛開始登記，完工戶數可能偏少。完整版（含林口／A7／其他重劃區，可切換顯示）見「青埔在哪個位置」章節。';
}
// S2：還沒蓋好要用現在的轉手速度消化幾年——青埔 vs 其他重劃區（樣本過小的排除、
// 註明），虛線＝桃園全市。
var s2ZonesChart;
function renderOverviewS2() {
  if (!COMPARE) return;
  var allZones = COMPARE.zones || [];
  var zones = allZones.filter(function (z) { return !z.small_sample && z.ratio_unfinished_to_resale != null; });
  var excluded = allZones.filter(function (z) { return z.small_sample; });
  var cityVal = COMPARE.city ? COMPARE.city.ratio_unfinished_to_resale : null;
  if (!s2ZonesChart) s2ZonesChart = newChart('chart-s2-zones');
  if (s2ZonesChart) {
    var opt = {
      tooltip: baseTooltip,
      grid: Object.assign({}, baseGrid, { top: 12, bottom: 24 }),
      xAxis: mkAxis({ type: 'category', data: zones.map(function (z) { return z.name; }), axisLabel: Object.assign({}, baseText, { interval: 0 }) }),
      yAxis: mkAxis({ type: 'value', name: '消化年數(年)' }),
      series: [{
        type: 'bar', barMaxWidth: 36,
        data: zones.map(function (z) { return { value: z.ratio_unfinished_to_resale, itemStyle: { color: z.id === 'qingpu' ? C.orange : C.blue } }; }),
      }],
    };
    if (cityVal != null) {
      opt.series[0].markLine = {
        symbol: 'none',
        label: { formatter: '全市 ' + fmt(cityVal, 1) + ' 年', color: C.muted, fontSize: 11 },
        lineStyle: { color: C.muted, type: 'dashed' },
        data: [{ yAxis: cityVal }],
      };
    }
    s2ZonesChart.setOption(opt, true);
  }
  var noteEl = document.getElementById('s2-chart-note');
  if (noteEl) noteEl.textContent = '還沒蓋好的戶數，要用現在的轉手速度（兩年平均年化）消化幾年，青埔 vs 其他重劃區（只比2010年後完工的房子），虛線＝桃園全市要' + fmt(cityVal, 1) + '年。' +
    (excluded.length ? excluded.map(function (z) { return z.name; }).join('、') + '兩年轉手量不到100戶，比值會被分母放大，不列入比較。' : '');
}
// S3：需求——青埔村里戶數（月）＋青埔季成交件數（最後一季資料未公布齊全，灰色）。
var s3HouseholdChart, s3VolumeChart;
function renderOverviewS3() {
  if (!DEMAND) return;
  var pop = DEMAND.population;
  if (pop && pop.status === 'ok') {
    var agg = pop.aggregate_monthly || [];
    if (!s3HouseholdChart) s3HouseholdChart = newChart('chart-s3-households');
    if (s3HouseholdChart) {
      s3HouseholdChart.setOption({
        tooltip: baseTooltip, grid: Object.assign({}, baseGrid, { top: 10 }),
        xAxis: mkAxis({ type: 'category', data: agg.map(function (m) { return m.month; }), axisLabel: Object.assign({}, baseText, { interval: 8 }) }),
        yAxis: mkAxis({ type: 'value', name: '戶' }),
        series: [{ name: '青埔村里戶數', type: 'line', data: agg.map(function (m) { return m.household; }), itemStyle: { color: C.blue }, lineStyle: { color: C.blue, width: 2 }, showSymbol: false }],
      }, true);
    }
  }
  var tv = DEMAND.transaction_volume;
  if (tv && tv.quarterly && tv.quarterly.length) {
    var qs = tv.quarterly;
    var lastIdx = qs.length - 1;
    if (!s3VolumeChart) s3VolumeChart = newChart('chart-s3-volume');
    if (s3VolumeChart) {
      s3VolumeChart.setOption({
        tooltip: baseTooltip, grid: Object.assign({}, baseGrid, { top: 10 }),
        xAxis: mkAxis({ type: 'category', data: qs.map(function (q) { return q.quarter; }), axisLabel: Object.assign({}, baseText, { rotate: 45, interval: Math.ceil(qs.length / 8) }) }),
        yAxis: mkAxis({ type: 'value', name: '件' }),
        series: [{ name: '成交件數', type: 'bar', barMaxWidth: 12, data: qs.map(function (q, i) { return { value: q.total, itemStyle: { color: i === lastIdx ? '#cbd5e1' : C.blue } }; }) }],
      }, true);
    }
  }
  var noteEl = document.getElementById('s3-chart-note');
  if (noteEl) noteEl.textContent = '左：青埔納入村里戶政戶數（月）。右：青埔季成交件數（預售簽約＋預售交屋登記＋中古/新成屋轉手），最後一季（灰色）實價登錄還在陸續公布，件數會偏低，不是真的量縮。資料來源：demand.json。';
}
// S4：價格——同建案轉手/預售倍數（季），虛線＝三個情境；17個建案的同案漲幅。
var s4IndexChart, s4UpliftChart;
function renderOverviewS4() {
  if (!SUMMARY || !SUMMARY.scenarios) return;
  var sc = SUMMARY.scenarios;
  if (OUTLOOK && OUTLOOK.calibration && OUTLOOK.calibration.index_series) {
    var rows = OUTLOOK.calibration.index_series;
    var minN = ((OUTLOOK.premium_index_facts || {}).lowest_n_ge_min || {}).min_n_required;
    if (!s4IndexChart) s4IndexChart = newChart('chart-s4-index');
    if (s4IndexChart) {
      var mlData = ['收斂', '維持', '回升'].filter(function (n) { return sc[n] && sc[n].multiplier != null; })
        .map(function (n) { return { yAxis: sc[n].multiplier, name: n + ' ' + fmt(sc[n].multiplier, 2) + '倍' }; });
      s4IndexChart.setOption({
        tooltip: baseTooltip, grid: Object.assign({}, baseGrid, { top: 10, bottom: 40 }),
        xAxis: mkAxis({ type: 'category', data: rows.map(function (r) { return r.quarter; }), axisLabel: Object.assign({}, baseText, { rotate: 60, fontSize: 9 }) }),
        yAxis: mkAxis({ type: 'value', name: '轉手/預售倍數' }),
        series: [{
          name: '轉手/預售倍數', type: 'line', data: rows.map(function (r) { return r.index; }),
          lineStyle: { color: C.blue }, itemStyle: { color: C.blue },
          symbolSize: function (v, p) { return (minN && rows[p.dataIndex].n >= minN) ? 6 : 3; },
          markLine: { symbol: 'none', lineStyle: { color: C.muted, type: 'dashed' }, label: { color: C.muted, fontSize: 9 }, data: mlData },
        }],
      }, true);
    }
  }
  if (ESTIMATE && ESTIMATE.same_project_uplift && ESTIMATE.same_project_uplift.rows) {
    var uRows = ESTIMATE.same_project_uplift.rows.slice().sort(function (a, b) { return a.uplift - b.uplift; });
    if (!s4UpliftChart) s4UpliftChart = newChart('chart-s4-uplift');
    if (s4UpliftChart) {
      s4UpliftChart.setOption({
        tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#ccd9e8', borderWidth: 1, textStyle: baseTooltip.textStyle, formatter: function (p) { return p.name + '：' + fmtPct(p.value); } },
        grid: Object.assign({}, baseGrid, { top: 10, bottom: 56 }),
        xAxis: mkAxis({ type: 'category', data: uRows.map(function (r) { return r.project_name; }), axisLabel: Object.assign({}, baseText, { rotate: 60, fontSize: 9, interval: 0 }) }),
        yAxis: mkAxis({ type: 'value', name: '漲幅', axisLabel: Object.assign({}, baseText, { formatter: function (v) { return (v * 100).toFixed(0) + '%'; } }) }),
        series: [{ type: 'bar', barMaxWidth: 14, data: uRows.map(function (r) { return { value: r.uplift, itemStyle: { color: r.uplift >= 0 ? C.blue : C.red } }; }) }],
      }, true);
    }
  }
  var noteEl = document.getElementById('s4-chart-note');
  if (noteEl) noteEl.textContent = '左：同建案轉手/預售倍數（季中位數），虛線＝三個情境（收斂/維持/回升）目前的倍數。右：17個建案的同案轉手漲幅（中古單價中位÷預售單價中位-1），由低到高排列。資料來源：outlook.json、estimate.json。';
}

/* ===========================================================================
   青埔在哪個位置：跟其他重劃區（林口/A7/小檜溪/中路/經國/藝文特區）、跟桃園市
   13個行政區比同一組供給/流動性指標，資料只用官方來源（不用591），資料/文字
   都來自 data/compare.json（compute_compare.py 產出，結論/論證/各區說明/
   限制的文字是規則式模板寫的，不是這裡現場組句子）。
   =========================================================================== */
function showPositionError(err) {
  var el = document.getElementById('position-error');
  if (el) { el.style.display = 'block'; el.textContent = '「青埔在哪個位置」資料載入失敗：' + err.message + '，請重新整理頁面再試一次。'; }
}
function positionCell(r, text) {
  return r.highlight ? '<strong style="color:#1e3a5f">' + text + '</strong>' : text;
}
var positionColumns = [
  { key: 'name', label: '區域', type: 'str', value: function (r) { return r.name; }, cell: function (r) { return positionCell(r, esc(r.name)); } },
  { key: 'resale_2y', label: '兩年轉手(戶)', type: 'num', value: function (r) { return r.resale_2y; }, cell: function (r) { return positionCell(r, fmtInt(r.resale_2y)); } },
  { key: 'unfinished_units', label: '未完工戶', type: 'num', value: function (r) { return r.unfinished_units; }, cell: function (r) { return positionCell(r, fmtInt(r.unfinished_units)); } },
  { key: 'completed_2y_units', label: '近兩年完工戶', type: 'num', value: function (r) { return r.completed_2y_units; }, cell: function (r) { return positionCell(r, fmtInt(r.completed_2y_units)); } },
  { key: 'households', label: '總戶數', type: 'num', value: function (r) { return r.households; }, cell: function (r) { return positionCell(r, r.households != null ? fmtInt(r.households) : '--'); } },
  { key: 'ratio_unfinished_to_resale', label: '還沒蓋好的要用現在的轉手速度消化幾年', type: 'num', value: function (r) { return r.ratio_unfinished_to_resale; }, cell: function (r) { return positionCell(r, r.ratio_unfinished_to_resale != null ? fmt(r.ratio_unfinished_to_resale, 1) + ' 年' : '--'); } },
  { key: 'ratio_completed_to_resale', label: '近兩年蓋好的是兩年轉手的幾倍', type: 'num', value: function (r) { return r.ratio_completed_to_resale; }, cell: function (r) { return positionCell(r, r.ratio_completed_to_resale != null ? fmt(r.ratio_completed_to_resale, 1) + ' 倍' : '--'); } },
  { key: 'turnover_pct', label: '換手率（年均轉手÷總戶數）', type: 'num', value: function (r) { return r.turnover_pct; }, cell: function (r) { return positionCell(r, r.turnover_pct != null ? fmt(r.turnover_pct, 2) + '%' : '--'); } },
];
var positionZoneTable, positionDistrictTable, positionBarChart;

function argumentBlockHTML(a) {
  var tbl = (a.table || []).map(function (r) {
    var cells = Object.keys(r).filter(function (k) { return k !== 'is_qingpu' && k !== 'name'; });
    return '<tr' + (r.is_qingpu ? ' style="font-weight:600;color:#1e3a5f"' : '') + '><td>' + esc(r.name) + '</td>' +
      cells.map(function (k) { var v = r[k]; return '<td>' + (v == null ? '--' : (typeof v === 'number' ? fmt(v, k.indexOf('pct') !== -1 || k.indexOf('turnover') !== -1 ? 2 : (k.indexOf('ratio') !== -1 ? 1 : 0)) : esc(v))) + '</td>'; }).join('') +
      '</tr>';
  }).join('');
  var headKeys = (a.table && a.table[0]) ? Object.keys(a.table[0]).filter(function (k) { return k !== 'is_qingpu' && k !== 'name'; }) : [];
  var headLabels = { ratio_unfinished: '未完工÷轉手(年)', ratio_completed: '完工÷轉手(倍)', resale_2y: '兩年轉手', households: '總戶數', turnover_pct: '換手率(%)' };
  return '<div class="position-argument">' +
    '<p style="font-weight:600;color:#1e3a5f;margin:14px 0 6px">' + esc(a.claim) + '</p>' +
    '<div class="table-scroll"><table class="data-table"><thead><tr><th>區域</th>' + headKeys.map(function (k) { return '<th>' + (headLabels[k] || k) + '</th>'; }).join('') + '</tr></thead><tbody>' + tbl + '</tbody></table></div>' +
    '<p class="chart-subtitle" style="margin-top:4px">' + esc(a.reasoning) + '</p>' +
    '</div>';
}

function renderPosition() {
  if (!COMPARE) return;
  var rep = COMPARE.report || {};
  var zones = (COMPARE.zones || []).map(function (z) { return Object.assign({}, z, { highlight: z.id === 'qingpu' }); });
  var cityRow = Object.assign({}, COMPARE.city || {}, { highlight: true, name: '桃園全市（參考）' });
  var districts = (COMPARE.districts || []).map(function (d) { return Object.assign({}, d, { highlight: false }); });
  var districtCityRow = Object.assign({}, COMPARE.city || {}, { highlight: true });

  document.getElementById('position-conclusion-list').innerHTML =
    (rep.conclusion_bullets || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') || '<li>目前沒有可顯示的結論。</li>';

  // 橫向長條圖：重劃區(7)+行政區(13)+桃園全市，共21根，依「完工÷轉手」由高到低排，青埔特別上色
  var allBars = zones.concat(districts).concat([Object.assign({}, COMPARE.city || {}, { name: '桃園全市' })])
    .filter(function (r) { return r.ratio_completed_to_resale != null; })
    .sort(function (a, b) { return a.ratio_completed_to_resale - b.ratio_completed_to_resale; });
  if (!positionBarChart) positionBarChart = newChart('chart-position-bar');
  if (positionBarChart) {
    positionBarChart.setOption({
      tooltip: baseTooltip,
      grid: Object.assign({}, baseGrid, { left: 90 }),
      xAxis: mkAxis({ type: 'value', name: '完工÷轉手(倍)' }),
      yAxis: mkAxis({ type: 'category', data: allBars.map(function (r) { return r.name; }), axisLabel: Object.assign({}, baseText, { interval: 0 }) }),
      series: [{
        type: 'bar', data: allBars.map(function (r) {
          return { value: r.ratio_completed_to_resale, itemStyle: { color: r.name === '青埔' ? C.orange : (r.name === '桃園全市' ? C.muted : C.blue) } };
        }), barMaxWidth: 12,
      }],
    }, true);
  }
  document.getElementById('position-bar-note').textContent =
    '橫軸＝近兩年完工戶數÷兩年轉手量（倍，主要欄位），涵蓋桃園市13個行政區、6個重劃區＋青埔、桃園全市共21個候選；橙色＝青埔，灰色＝桃園全市。';

  renderPositionTrend();

  document.getElementById('position-arguments').innerHTML = (rep.arguments || []).map(argumentBlockHTML).join('');

  if (!positionZoneTable) positionZoneTable = makeTable(document.getElementById('table-position-zones'), positionColumns, { key: 'ratio_completed_to_resale', dir: 'desc' });
  positionZoneTable.setRows(zones.concat([cityRow]));
  positionZoneTable.render();

  if (!positionDistrictTable) positionDistrictTable = makeTable(document.getElementById('table-position-districts'), positionColumns, { key: 'ratio_completed_to_resale', dir: 'desc' });
  positionDistrictTable.setRows(districts.concat([districtCityRow]));
  positionDistrictTable.render();

  var notes = rep.zone_notes || {};
  var zoneOrder = ['linkou', 'a7', 'xiaoguixi', 'zhonglu', 'jingguo', 'yiwen'];
  document.getElementById('position-zone-notes').innerHTML = zoneOrder.filter(function (id) { return notes[id]; }).map(function (id) {
    var z = zones.filter(function (zz) { return zz.id === id; })[0];
    return '<div class="position-zone-note"><strong>' + esc(z ? z.name : id) + '</strong><p style="margin:4px 0 0">' + esc(notes[id]) + '</p></div>';
  }).join('');

  document.getElementById('position-limits').innerHTML = (rep.limits || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');

  var zd = COMPARE.zone_defs || {};
  document.getElementById('position-method').innerHTML = zoneOrder.map(function (id) {
    var z = zd[id] || {};
    var roadTxt = z.roads ? '道路白名單：' + z.roads.map(esc).join('、') : '整個行政區（不用道路篩選）';
    return '<p><strong>' + esc(z.name || id) + '</strong>（' + esc(z.city || '') + esc(z.district || '') + '）：' + roadTxt + '。' + esc(z.village_note || '') + '</p>';
  }).join('') + '<p>兩年轉手期間（主要欄位）：' + esc((COMPARE.period || {}).resale_start_2y) + '～' + esc((COMPARE.period || {}).resale_end) + '（近8個完整季）；一年轉手期間（次要欄位）：' + esc((COMPARE.period || {}).resale_start_1y) + '～' + esc((COMPARE.period || {}).resale_end) + '。戶政人口月份：' + esc((COMPARE.period || {}).population_month) + '。近兩年完工戶數的比較基準日：' + esc((COMPARE.period || {}).completed_2y_since) + '起（次要欄位的近一年完工基準日：' + esc((COMPARE.period || {}).completed_1y_since) + '起）。</p>';

  var why2yEl = document.getElementById('position-why-2y-method');
  if (why2yEl) {
    var trendFalsifier = (rep.falsifiers || []).filter(function (s) { return s.indexOf('兩年窗口') !== -1; })[0];
    why2yEl.innerHTML =
      '<p>完工戶數到貨很不均勻：青埔或A7這種還在開發中的新市鎮，單一建案一次登記就有1,000戶以上，哪一季剛好有大案登記、哪一季沒有，會讓「近一年完工÷一年轉手」這個比值在短短幾季內大幅擺動——不是市場真的忽好忽壞，是分子（完工戶數）本身就很跳。改成兩年窗口（近兩年完工÷兩年轉手）之後，單季的大案登記被攤進8個季度裡，波動明顯變小，排名也更穩定。</p>' +
      (trendFalsifier ? '<p>' + esc(trendFalsifier) + '</p>' : '') +
      '<p>一年窗口沒有拿掉，留做次要欄位（表格、逐季走勢圖都有），讓讀者自己比對兩個窗口差多少；「還沒蓋好÷轉手」這個指標同時把分母從「一年轉手」換成「兩年轉手量的年均」，單位也從「倍」改成「年」（還沒蓋好的戶數，要用現在的轉手速度幾年才能消化完），意思更直覺。</p>';
  }
}

// 「青埔在哪個位置」逐季走勢大圖：青埔／林口／A7／桃園全市預設顯示，其他重劃區
// 點圖例加顯示（legend click 內建就能切換，不用另外做UI）；青埔多畫一條一年窗口
// 虛線，其餘重劃區只畫兩年窗口（主要欄位）。
var positionTrendChart;
function renderPositionTrend() {
  if (!COMPARE) return;
  var zonesById = {};
  (COMPARE.zones || []).forEach(function (z) { zonesById[z.id] = z; });
  var cityRow = COMPARE.city;
  var order = ['qingpu', 'linkou', 'a7', 'xiaoguixi', 'zhonglu', 'jingguo', 'yiwen'];
  var series = [];
  var quarters = null;
  order.forEach(function (id) {
    var z = zonesById[id];
    if (!z || !z.ratio_series || !z.ratio_series.length) return;
    if (!quarters) quarters = z.ratio_series.map(function (p) { return p.quarter; });
    var color = ZONE_TREND_COLORS[id];
    series.push({
      name: ZONE_TREND_NAMES[id], type: 'line', data: z.ratio_series.map(function (p) { return trendPoint(p, 'ratio_2y'); }),
      lineStyle: { color: color, width: 2 }, itemStyle: { color: color }, symbolSize: 5, connectNulls: true,
    });
    if (id === 'qingpu') {
      series.push({
        name: '青埔（一年窗口）', type: 'line', data: z.ratio_series.map(function (p) { return trendPoint(p, 'ratio_1y'); }),
        lineStyle: { color: color, width: 1.5, type: 'dashed' }, itemStyle: { color: color }, symbolSize: 4, connectNulls: true,
      });
    }
  });
  if (cityRow && cityRow.ratio_series && cityRow.ratio_series.length) {
    if (!quarters) quarters = cityRow.ratio_series.map(function (p) { return p.quarter; });
    series.push({
      name: '桃園全市', type: 'line', data: cityRow.ratio_series.map(function (p) { return p.ratio_2y; }),
      lineStyle: { color: C.muted, width: 1.5, type: 'dashed' }, itemStyle: { color: C.muted }, symbolSize: 3, connectNulls: true,
    });
  }
  var defaultOn = { '青埔': true, '青埔（一年窗口）': true, '林口': true, 'A7': true, '桃園全市': true, '小檜溪': false, '中路': false, '經國': false, '藝文特區': false };
  if (!positionTrendChart) positionTrendChart = newChart('chart-position-trend');
  if (positionTrendChart) {
    positionTrendChart.setOption({
      tooltip: baseTooltip,
      legend: Object.assign({}, baseLegend, { type: 'scroll', selected: defaultOn }),
      grid: Object.assign({}, baseGrid, { top: 40, bottom: 24 }),
      xAxis: mkAxis({ type: 'category', data: quarters || [] }),
      yAxis: mkAxis({ type: 'value', name: '完工÷轉手(倍)' }),
      series: series,
    }, true);
  }
  var noteEl = document.getElementById('position-trend-note');
  if (noteEl) noteEl.textContent =
    '完工÷轉手近12季走勢：實線＝兩年窗口（主要欄位），橙色虛線＝青埔的一年窗口（次要欄位，波動明顯更大）、灰色虛線＝桃園全市（兩年窗口）當參考。灰點：2024Q1以前，預售屋備查資料從2021年7月才開始登記，完工戶數可能偏少。最新一點以「該季季底」為準，跟結論／本章節最上方「近兩年完工」即時數字（抓到今天為止）相比，兩者可能有一點差異，不是錯誤——即時數字比季底再多算了這一季之後、到今天為止新登記的完工戶。';
}

/* ===========================================================================
   跟台北、台中、高雄比：台北市/台中市/高雄市/新北市（整個行政區）＋桃園全市＋
   青埔，同一組兩年窗口指標＋轉手中位單價（全部屋齡/屋齡5年內），資料來自
   data/compare.json 的 cities/qingpu_price。
   =========================================================================== */
var cityCompareTable, cityRatioChart, cityPriceChart;
var cityCompareColumns = [
  { key: 'name', label: '區域', type: 'str', value: function (r) { return r.name; },
    cell: function (r) { return r.id === 'qingpu' ? '<strong style="color:#1e3a5f">' + esc(r.name) + '</strong>' : esc(r.name); } },
  { key: 'resale_2y', label: '兩年轉手(戶)', type: 'num', value: function (r) { return r.resale_2y; },
    cell: function (r) { return fmtInt(r.resale_2y); } },
  { key: 'ratio_completed_to_resale', label: '近兩年完工÷兩年轉手', type: 'num', value: function (r) { return r.ratio_completed_to_resale; },
    cell: function (r) { return r.ratio_completed_to_resale != null ? fmt(r.ratio_completed_to_resale, 1) + ' 倍' : '--'; } },
  { key: 'ratio_unfinished_to_resale', label: '未完工消化年數', type: 'num', value: function (r) { return r.ratio_unfinished_to_resale; },
    cell: function (r) { return r.ratio_unfinished_to_resale != null ? fmt(r.ratio_unfinished_to_resale, 1) + ' 年' : '--'; } },
  { key: 'turnover_pct', label: '換手率(%)', type: 'num', value: function (r) { return r.turnover_pct; },
    cell: function (r) { return r.turnover_pct != null ? fmt(r.turnover_pct, 2) + '%' : '--'; } },
  { key: 'price_all_wan_ping', label: '轉手中位價-全部屋齡(萬/坪)', type: 'num', value: function (r) { return r.price_all_wan_ping; },
    cell: function (r) { return r.price_all_wan_ping != null ? fmt(r.price_all_wan_ping, 1) : '--'; } },
  { key: 'price_new_wan_ping', label: '轉手中位價-屋齡5年內(萬/坪)', type: 'num', value: function (r) { return r.price_new_wan_ping; },
    cell: function (r) { return r.price_new_wan_ping != null ? fmt(r.price_new_wan_ping, 1) : '--'; } },
  { key: 'presale_wan_ping', label: '預售中位價(萬/坪，僅青埔)', type: 'num', value: function (r) { return r.presale_wan_ping; },
    cell: function (r) { return r.presale_wan_ping != null ? fmt(r.presale_wan_ping, 1) : '--'; } },
];

function renderCityCompare() {
  if (!COMPARE) return;
  var rows = COMPARE.cities || [];
  var rep = COMPARE.report || {};
  var qp = COMPARE.qingpu_price || {};
  document.getElementById('city-compare-conclusion').textContent = rep.city_compare_conclusion || '資料不足。';

  function barColor(r) { return r.id === 'qingpu' ? C.orange : (r.id === 'taoyuan' ? C.muted : C.blue); }
  var ratioRows = rows.filter(function (r) { return r.ratio_completed_to_resale != null; })
    .sort(function (a, b) { return a.ratio_completed_to_resale - b.ratio_completed_to_resale; });
  if (!cityRatioChart) cityRatioChart = newChart('chart-city-ratio');
  if (cityRatioChart) {
    cityRatioChart.setOption({
      tooltip: baseTooltip,
      grid: Object.assign({}, baseGrid, { left: 70, top: 8 }),
      xAxis: mkAxis({ type: 'value', name: '完工÷轉手(倍)' }),
      yAxis: mkAxis({ type: 'category', data: ratioRows.map(function (r) { return r.name; }), axisLabel: Object.assign({}, baseText, { interval: 0 }) }),
      series: [{ type: 'bar', barMaxWidth: 20, data: ratioRows.map(function (r) { return { value: r.ratio_completed_to_resale, itemStyle: { color: barColor(r) } }; }) }],
    }, true);
  }

  var priceRows = rows.filter(function (r) { return r.price_all_wan_ping != null; });
  if (!cityPriceChart) cityPriceChart = newChart('chart-city-price');
  if (cityPriceChart) {
    cityPriceChart.setOption({
      tooltip: baseTooltip, legend: baseLegend,
      grid: Object.assign({}, baseGrid, { top: 30, bottom: 24 }),
      xAxis: mkAxis({ type: 'category', data: priceRows.map(function (r) { return r.name; }), axisLabel: Object.assign({}, baseText, { interval: 0 }) }),
      yAxis: mkAxis({ type: 'value', name: '萬/坪' }),
      series: [
        { name: '全部屋齡', type: 'bar', barMaxWidth: 18, data: priceRows.map(function (r) { return r.price_all_wan_ping; }), itemStyle: { color: C.blue } },
        { name: '屋齡5年內', type: 'bar', barMaxWidth: 18, data: priceRows.map(function (r) { return r.price_new_wan_ping; }), itemStyle: { color: C.orange } },
      ],
    }, true);
  }
  document.getElementById('city-compare-chart-note').textContent =
    '左：近兩年完工÷兩年轉手（倍），橙色＝青埔、灰色＝桃園全市、藍色＝其他城市。右：轉手中位單價（萬/坪，扣車位，排除車位疑似灌入總價的列），藍＝全部屋齡、橙＝屋齡' + (qp.age_max_years || 5) + '年內；青埔另有預售中位價' + (qp.presale_wan_ping != null ? '（' + fmt(qp.presale_wan_ping, 1) + ' 萬/坪，n=' + fmtInt(qp.n_presale) + '）' : '') + '，見下表最後一欄。';

  if (!cityCompareTable) cityCompareTable = makeTable(document.getElementById('table-city-compare'), cityCompareColumns, { key: 'ratio_completed_to_resale', dir: 'desc' });
  cityCompareTable.setRows(rows);
  cityCompareTable.render();

  var methodEl = document.getElementById('city-compare-method');
  if (methodEl) {
    methodEl.innerHTML =
      '<p>城市範圍：台北市/台中市/高雄市/新北市整個行政區（不分區），實價登錄買賣(A檔)檔名字首對照全國zip manifest.csv驗證過：台北=a、台中=b、高雄=e、新北=f、桃園=h。新北市不限林口、整個行政區重新算一次；桃園全市沿用「跟13個行政區比」章節算好的數字。</p>' +
      '<p>完工/未完工/轉手的定義跟上面「重劃區比較」「跟13個行政區比」完全一樣（兩年窗口為主、一年窗口次要），只是改成整個城市不分行政區。總戶數用戶政司村里資料整個城市加總（ODRP014 的 site_id 實測一律用「臺」，臺北市/臺中市，程式兩種字型都比對一次，避免未來改字型查不到）。</p>' +
      '<p>轉手中位單價：萬/坪 =（總價－車位總價）÷（（建物移轉總面積－車位移轉總面積）×0.3025），排除有車位但車位總價=0（疑似把車位價格灌進總價，單價會失真）的列；拆「全部屋齡」「屋齡' + (qp.age_max_years || 5) + '年內」兩組，避免青埔這種新市鎮的新成屋被拿去跟其他城市摻雜老屋的全市中位價直接比。</p>' +
      '<p>青埔預售中位價：用桃園市預售買賣(B檔)、同一個青埔道路白名單篩選，近兩年成交（n=' + fmtInt(qp.n_presale) + '）算中位數，其他城市沒有對應的「單一新市鎮」範圍可比，所以只給青埔一個數字。</p>' +
      '<p>六都比較不納入「跟13個行政區比」「跟其他重劃區比」的正式排名系統，只給原始數字＋一句資料生成的結論。</p>';
  }
}

/* ===========================================================================
   什麼情況下結論會錯：consolidated falsifiers，來自 compare.json（供給面）跟
   outlook.json 的 recalc_note（價格面），列出具體門檻，不是空泛的「僅供參考」。
   =========================================================================== */
function renderFalsifiers() {
  var items = [];
  if (COMPARE && COMPARE.report && COMPARE.report.falsifiers) items = items.concat(COMPARE.report.falsifiers);
  if (OUTLOOK && OUTLOOK.recalc_note) items.push(OUTLOOK.recalc_note);
  document.getElementById('falsifiers-list').innerHTML = items.length
    ? items.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('')
    : '<li>資料還沒算出來，執行 compute_compare.py／compute_price_outlook.py 之後才有這個章節。</li>';
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
  document.getElementById('inventory-conclusion').textContent = '591去重後在售存量前3大社區：' + byC.slice(0, 3).map(function (r) { return esc(r.community_name) + '(' + r.n + '戶)'; }).join('、') + '。';
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

// 供給章節總結論（supply-conclusion）自己的小圖：未來4季預計交屋（推估）、
// 建商未售戶前8名建案，對應結論句裡「未來4季預計交屋約X戶」「建商手上還沒
// 賣掉約Y戶」兩個數字。
var supplyNext4qChart, supplyUnsoldTopChart;
function renderSupplyConclusionCharts() {
  if (!SUPPLY) return;
  var h = SUPPLY.supply.handover || {};
  var cq = h.chart_quarters || [];
  var startIdx = -1;
  for (var i = 0; i < cq.length; i++) { if ((cq[i].actual || 0) === 0 && (cq[i].estimated || 0) > 0) { startIdx = i; break; } }
  var next4 = startIdx === -1 ? [] : cq.slice(startIdx, startIdx + 4);
  if (!supplyNext4qChart) supplyNext4qChart = newChart('chart-supply-next4q');
  if (supplyNext4qChart) {
    supplyNext4qChart.setOption({
      tooltip: baseTooltip, grid: Object.assign({}, baseGrid, { top: 10 }),
      xAxis: mkAxis({ type: 'category', data: next4.map(function (r) { return r.quarter; }) }),
      yAxis: mkAxis({ type: 'value', name: '戶' }),
      series: [{ name: '推估交屋(戶)', type: 'bar', barMaxWidth: 36, data: next4.map(function (r) { return Math.round(r.estimated || r.actual || 0); }), itemStyle: { color: '#fbbf24' } }],
    }, true);
  }
  var un = SUPPLY.supply.unsold || {};
  var topRows = (un.rows || []).slice().sort(function (a, b) { return (b.units_unsold || 0) - (a.units_unsold || 0); }).slice(0, 8);
  if (!supplyUnsoldTopChart) supplyUnsoldTopChart = newChart('chart-supply-unsold-top');
  if (supplyUnsoldTopChart) {
    supplyUnsoldTopChart.setOption({
      tooltip: baseTooltip, grid: Object.assign({}, baseGrid, { left: 96, top: 10 }),
      xAxis: mkAxis({ type: 'value', name: '未售戶(估)' }),
      yAxis: mkAxis({ type: 'category', data: topRows.map(function (r) { return r.project_name; }), axisLabel: Object.assign({}, baseText, { fontSize: 10, interval: 0 }) }),
      series: [{ type: 'bar', barMaxWidth: 14, data: topRows.map(function (r) { return r.units_unsold; }), itemStyle: { color: C.blue } }],
    }, true);
  }
  var noteEl = document.getElementById('supply-conclusion-chart-note');
  if (noteEl) noteEl.textContent = '左：未來4季預計交屋戶數（逾期未完工的案子平均攤入），合計約 ' + fmtInt(Math.round(next4.reduce(function (s, r) { return s + (r.estimated || r.actual || 0); }, 0))) + ' 戶。右：建商未售戶前' + topRows.length + '名（全部' + (un.rows || []).length + '案合計約 ' + fmtInt(un.total_unsold) + ' 戶）。資料來源：supply_demand.json。';
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
  renderSupplyConclusionCharts();
  var h = SUPPLY.supply.handover || {};
  document.getElementById('supply-conclusion').textContent = chapterConclusion('supply') || ('共 ' + (h.total_projects || 0) + ' 個青埔預售建案對到官方備查資料。');
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
  document.getElementById('crosswalk-method').innerHTML = '<ul><li>這張表的「近4季成交」按坪數拆、只算有坪數資料的轉手，而且排除親友、員工、含裝潢、瑕疵屋等特殊交易，所以比結論章的一年轉手量少。</li><li>「未來4季新增待售」是壓力測試過供給結構、交屋後拿出來賣的比例算好的新增待售，不是新增交屋戶數本身；「近4季成交」只用轉手成交（不含預售）。</li><li>差距>0代表未來供給快於近期成交速度，差距<0反過來；這是速度比較，不是存量比較。</li><li>家戶成長推算需求＝新增家戶數(YoY) × 假設的自住購屋轉化比例（明確標註的假設值，不是實測），且沒有拆坪數帶，只能跟總量對照。</li></ul>';
}

// 需求章節總結論（demand-conclusion）自己的小圖：戶數（月）＋房價所得比，
// 對應結論句裡「戶數一年+11.2%」「是...12.8倍」兩個數字。
var demandHhChart, demandAffordChart;
function renderDemandConclusionCharts() {
  if (!DEMAND) return;
  var pop = DEMAND.population;
  if (pop && pop.status === 'ok') {
    var agg = pop.aggregate_monthly || [];
    if (!demandHhChart) demandHhChart = newChart('chart-demand-households');
    if (demandHhChart) {
      demandHhChart.setOption({
        tooltip: baseTooltip, grid: Object.assign({}, baseGrid, { top: 10 }),
        xAxis: mkAxis({ type: 'category', data: agg.map(function (m) { return m.month; }), axisLabel: Object.assign({}, baseText, { interval: 8 }) }),
        yAxis: mkAxis({ type: 'value', name: '戶' }),
        series: [{ name: '青埔村里戶數', type: 'line', data: agg.map(function (m) { return m.household; }), itemStyle: { color: C.blue }, lineStyle: { color: C.blue, width: 2 }, showSymbol: false }],
      }, true);
    }
  }
  var af = DEMAND.affordability;
  if (af && af.rows && af.rows.length) {
    if (!demandAffordChart) demandAffordChart = newChart('chart-demand-affordability');
    if (demandAffordChart) {
      demandAffordChart.setOption({
        tooltip: baseTooltip, grid: Object.assign({}, baseGrid, { top: 10 }),
        xAxis: mkAxis({ type: 'category', data: af.rows.map(function (r) { return r.label; }) }),
        yAxis: mkAxis({ type: 'value', name: '房價所得比(倍)' }),
        series: [{ name: 'PIR', type: 'bar', barMaxWidth: 50, data: af.rows.map(function (r) { return r.pir; }), itemStyle: { color: C.orange } }],
      }, true);
    }
  }
  var noteEl = document.getElementById('demand-conclusion-chart-note');
  if (noteEl) noteEl.textContent = '左：青埔納入村里戶政戶數（月）。右：典型房型的房價所得比（總價中位數÷桃園市家戶可支配所得），數字越高代表越買不起。資料來源：demand.json。';
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
  renderDemandConclusionCharts();
  renderOverviewS3();
  document.getElementById('demand-conclusion').textContent = chapterConclusion('demand') || '成交量、租賃需求、人口家戶、購屋負擔、供需對照見以下各小節。';
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
  document.getElementById('outlook-moi-note').innerHTML = '591去重後同類型在售 ' + fmtInt(moi.n_listings) + ' 戶，開價中位數 ' + fmt(moi.median_ask, 2) + ' 萬/坪；同類型轉手月均成交 ' + fmt(moi.monthly_absorption, 2) + ' 戶/月（近' + moi.window_months + '個月，扣最後' + moi.lag_months + '個月落後月）。這組在售數來自 591（同一戶多則刊登已合併，仍含不會成交的試探開價），只拿來看每月的變化方向，不拿來算幾個月賣完。<br>' + esc(deJargon(moi.caveat) || '');
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

  document.getElementById('outlook-conclusion').textContent = chapterConclusion('price') || '同建案轉手價與三種情況見下方。';
  document.getElementById('outlook-method').innerHTML = '<ul><li>轉手/預售倍數＝每筆中古成交單價 ÷ 該建案預售單價中位數，取季中位數；這樣不同建案放在一起比，才不會被新舊產品世代混雜的假趨勢誤導，自2021Q3起。</li><li>三個情境（維持/收斂/回升）只輸出倍數本身，不綁定任何特定戶別；套用到哪一戶由「戶別試算」分頁決定。</li><li>歷史校準回歸n或R²沒過門檻時，只是記錄「查過供給壓力對未來價格變化的解釋力，沒查到關係」，不拿來配價格路徑。</li></ul>';
}

/* ===========================================================================
   青埔最新成交
   =========================================================================== */
// dealFlags/dealKindLabel：任何一筆交易通用（不限仰森），「仰森成交」表格搬到
// 遠雄仰森個案頁（yangsen/yangsen.js）後，這兩支留在這裡給下面 latestColumns 用。
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
    '<p><a href="yangsen/#methodology">遠雄仰森個案的判斷規則（建案名稱比對、地址門牌判斷），見仰森個案追蹤頁「怎麼算的」→</a></p>' +
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
  // 各社區比價/成交走勢/最新成交要 deals.json，還沒抓到就先不畫，
  // 等 ensureDealsLoaded() 完成後那幾支自己會補畫一次。
  if (resetPages) { latestLimit = PAGE_SIZE; }
  if (DEALS_LOADED) {
    renderCompareTable();
    renderTrendSection();
    renderLatestTable();
  }
}
function wireStaticControls() {
  document.getElementById('latest-more').addEventListener('click', function () { latestLimit += PAGE_SIZE; renderLatestTable(); });
  document.getElementById('latest-type-filter').addEventListener('change', function () { latestLimit = PAGE_SIZE; renderLatestTable(); });
  document.getElementById('latest-road-filter').addEventListener('change', function () { latestLimit = PAGE_SIZE; renderLatestTable(); });
}

/* ===========================================================================
   分頁籤（章節）：URL hash 連結（ascii id 或中文都認）、鍵盤方向鍵可切換、
   切換時 resize 所有圖表（隱藏分頁裡的 echarts 一開始量到的是 0 寬，顯示後要
   重量一次）。每章底部有「下一章 →」連結，靠同一組 activateTab() 切換。
   =========================================================================== */
var TABS = [
  { id: 'conclusion', zh: '結論' },
  { id: 'position', zh: '青埔在哪個位置' },
  { id: 'supply', zh: '供給' },
  { id: 'demand', zh: '需求' },
  { id: 'price', zh: '價格' },
  { id: 'falsifiers', zh: '什麼情況下結論會錯' },
  { id: 'methodology', zh: '怎麼算的' },
];
var DEALS_TABS = { price: true }; // 「價格」章節含各社區比價/成交走勢/最新成交，要 deals.json

function resolveTabId(rawHash) {
  if (!rawHash) return null;
  var v;
  try { v = decodeURIComponent(rawHash.replace(/^#/, '')); } catch (e) { v = rawHash.replace(/^#/, ''); }
  var hit = TABS.filter(function (t) { return t.id === v || t.zh === v; })[0];
  return hit ? hit.id : null;
}
function activateTab(id, opts) {
  opts = opts || {};
  if (!TABS.some(function (t) { return t.id === id; })) id = 'conclusion';
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
  document.querySelectorAll('.next-chapter-link').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      activateTab(a.dataset.next);
      var nextBtn = document.getElementById('tab-btn-' + a.dataset.next);
      if (nextBtn) nextBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  window.addEventListener('hashchange', function () {
    activateTab(resolveTabId(window.location.hash) || 'conclusion', { updateHash: false });
  });
  var qpDetails = document.getElementById('details-qingpu-deals');
  if (qpDetails) qpDetails.addEventListener('toggle', function () { if (qpDetails.open) ensureDealsLoaded(); });
  activateTab(resolveTabId(window.location.hash) || 'conclusion', { updateHash: false });
}

async function init() {
  initTabs();
  initFilterBar();
  wireStaticControls();

  compareTable = makeTable(document.getElementById('table-compare'), compareColumns, { key: 'listingN', dir: 'desc' });
  latestTable = makeTable(document.getElementById('table-latest'), latestColumns, { key: 'date', dir: 'desc' });

  // 結論章節只靠 summary.json（小檔），跟其他 JSON 並行抓、誰先到誰先畫，
  // 不互相等；deals.json 完全不在這個階段抓。
  var summaryPromise = loadSummary().then(renderOverview).catch(function (err) {
    console.error(err);
    showOverviewError(err);
  });
  var comparePromise = loadCompare().then(function () { renderPosition(); renderOverviewS1(); renderOverviewS1Trend(); renderOverviewS2(); renderCityCompare(); }).then(renderFalsifiers).catch(function (err) {
    console.error(err);
    showPositionError(err);
  });
  var dataPromise = loadData().catch(function (err) { console.error(err); });

  await dataPromise;
  renderSupplySection();
  renderDemandSection();
  renderPriceOutlook();
  renderMethodology();
  renderFalsifiers(); // 重畫一次：這時 OUTLOOK 已經到齊，falsifiers 才會補上價格面那一條

  await Promise.all([summaryPromise, comparePromise]);
  renderOverviewS4(); // 要等 SUMMARY(情境倍數)＋OUTLOOK/ESTIMATE(dataPromise已載入) 都到齊

  document.getElementById('updated-line').textContent = '實價登錄：' + fmtDateTime(META.lvr && META.lvr.last_run) + '　591售價：' + fmtDateTime(META.house591 && META.house591.last_run) + '　591租金：' + fmtDateTime(META.house591_rent && META.house591_rent.last_run);

  // 如果一開始就是用 #price 這種連結直接進站，activateTab() 裡已經觸發過
  // ensureDealsLoaded()；這裡不用再重複判斷一次。
}

init().catch(function (err) {
  console.error(err);
  var line = document.getElementById('updated-line');
  if (line) line.textContent = '資料載入失敗：' + err.message;
});
