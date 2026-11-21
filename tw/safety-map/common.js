/* 台灣治安與毒駕地圖：兩頁共用的資料與小工具 */
var SM = (function () {
  'use strict';
  var TYPES = ['住宅竊盜', '汽車竊盜', '機車竊盜', '強盜', '搶奪', '強制性交', '毒品'];
  var PERIODS = [
    { key: '2023-2025', label: '2023～2025 三年合計', years: [2023, 2024, 2025] },
    { key: '2025', label: '2025 年', years: [2025] },
    { key: '2019-2021', label: '2019～2021 三年合計', years: [2019, 2020, 2021] }
  ];
  var COLORS = ['#fde7d4', '#f9b98a', '#f08a4b', '#d9592a', '#a83a14'];
  var ZERO = '#eef2f7';

  function load(names) {
    return Promise.all(names.map(function (n) {
      return fetch('data/' + n + '.json').then(function (r) { return r.json(); });
    })).then(function (arr) {
      var o = {};
      names.forEach(function (n, i) { o[n] = arr[i]; });
      return o;
    });
  }
  function norm(s) { return (s || '').replace(/台/g, '臺'); }
  function sumYears(obj, years) {
    var a = 0;
    years.forEach(function (y) { a += (obj && obj[y]) || 0; });
    return a;
  }
  function fmt(n) { return Math.round(n).toLocaleString('zh-TW'); }
  function fmtRate(x) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    return x >= 10 ? x.toFixed(1) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3);
  }
  /* 鄉鎮比率與縣市、全國平均。縣市平均只用有填鄉鎮的案件，跟鄉鎮比才公平 */
  function townStats(towns, crime, type, years) {
    var town = {}, county = {}, N = 0, P = 0;
    Object.keys(towns).forEach(function (code) {
      var t = towns[code];
      var n = sumYears((crime[code] || {})[type], years);
      town[code] = { n: n, rate: t.pop ? n / years.length / t.pop * 1e5 : null };
      var c = county[t.county] || (county[t.county] = { n: 0, pop: 0 });
      c.n += n; c.pop += t.pop; N += n; P += t.pop;
    });
    Object.keys(county).forEach(function (k) { county[k].rate = county[k].n / years.length / county[k].pop * 1e5; });
    return { town: town, county: county, nation: { n: N, pop: P, rate: N / years.length / P * 1e5 } };
  }
  function compare(rate, ref, n) {
    if (n < 10) return { cls: 'tag-na', txt: '件數少於 10 件，不比' };
    var d = (rate / ref - 1) * 100;
    if (Math.abs(d) < 10) return { cls: 'tag-na', txt: '差不多' };
    return d > 0 ? { cls: 'tag-hi', txt: '高 ' + Math.round(d) + '%' } : { cls: 'tag-lo', txt: '低 ' + Math.round(-d) + '%' };
  }
  function breaks(vals, k) {
    k = k || 5;
    var v = vals.filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    var out = [];
    if (!v.length) return out;
    for (var i = 1; i < k; i++) out.push(v[Math.floor(i * v.length / k)]);
    return out;
  }
  function colorFor(x, br) {
    if (!x) return ZERO;
    var i = 0;
    while (i < br.length && x >= br[i]) i++;
    return COLORS[i];
  }
  function baseMap(id, opts) {
    var m = L.map(id, Object.assign({ preferCanvas: true, zoomSnap: 0.25, scrollWheelZoom: false }, opts || {}));
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, opacity: 0.6,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者'
    }).addTo(m);
    m.on('click', function () { m.scrollWheelZoom.enable(); });
    return m;
  }
  function legend(map, html) {
    var c = L.control({ position: 'bottomleft' });
    c.onAdd = function () { var d = L.DomUtil.create('div', 'map-legend'); d.innerHTML = html; return d; };
    c.addTo(map);
    return c;
  }
  function legendHtml(title, br, unitFmt) {
    var rows = ['<div><b>' + title + '</b></div>'];
    var lo = 0;
    for (var i = 0; i < COLORS.length; i++) {
      var hi = br[i];
      var lab = i < br.length ? unitFmt(lo) + '～' + unitFmt(hi) : unitFmt(lo) + ' 以上';
      if (i === 0) lab = '未滿 ' + unitFmt(hi);
      rows.push('<div class="row"><span class="sw" style="background:' + COLORS[i] + '"></span>' + lab + '</div>');
      lo = hi;
    }
    rows.push('<div class="row"><span class="sw" style="background:' + ZERO + '"></span>沒有案件</div>');
    return rows.join('');
  }
  var YEARS = []; for (var y = 2015; y <= 2026; y++) YEARS.push(y);
  var BAD_AREA = [[{ xAxis: '2023', itemStyle: { color: 'rgba(148,163,184,.16)' }, label: { show: true, position: 'insideTop', color: '#64748b', fontSize: 11, formatter: '資料不完整' } }, { xAxis: '2024' }]];
  return {
    TYPES: TYPES, PERIODS: PERIODS, COLORS: COLORS, ZERO: ZERO, YEARS: YEARS, BAD_AREA: BAD_AREA,
    load: load, norm: norm, sumYears: sumYears, fmt: fmt, fmtRate: fmtRate, townStats: townStats,
    compare: compare, breaks: breaks, colorFor: colorFor, baseMap: baseMap, legend: legend, legendHtml: legendHtml
  };
})();
