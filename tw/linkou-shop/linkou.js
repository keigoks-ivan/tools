/* 林口店面頁：讀 data/*.json 畫地圖、圖表、表格與試算。無 localStorage。 */
(function () {
  'use strict';
  /* 九個商圈固定色：新興用飽和色，成熟用灰藍色調。地圖、表格標籤、卡片、圖表共用 */
  var COLORS = { LK03: '#ea580c', LK01: '#2563eb', LK02: '#dc2626', LK06: '#0d9488', LK04: '#7c3aed', LK09: '#ca8a04',
                 LK07: '#52708f', LK05: '#8fa7c0', LK08: '#b3c0cf' };
  var COL = COLORS;
  var FONT = '-apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  var charts = [];
  var UP = null, CH = null, ROAD1 = null, SUM1 = null;   /* upper.json、charts.json、roads.json、summary.json */
  var FLOOR_ONE = '一樓（含地下室、沒寫樓層）';

  function jget(f) { return fetch('data/' + f).then(function (r) { if (!r.ok) throw new Error(f); return r.json(); }); }
  function fmt(n, d) { if (n === null || n === undefined || isNaN(n)) return '—'; return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sgn(n, d) { if (n === null || n === undefined) return '—'; return (n > 0 ? '+' : '') + fmt(n, d); }

  /* 樓層切換（分段按鈕，樣式同半徑列） */
  function seg(id, cb) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-fl'); if (!v) return;
      Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) { b.classList.toggle('on', b === e.target); });
      cb(v);
    });
  }

  /* ---------------- 表格 ---------------- */
  function buildTables(S) {
    var R = S.rows, ord = S.order;
    var head = ['商圈', '新興或成熟', '2016 後完工店面棟數', '未完工戶數', '成交中位數（2023 起，萬／坪，括號筆數）',
      '實價登錄月租中位數（2023 起，元／坪，括號筆數）', '591 一樓月租開價（換成含公設口徑，元／坪）', '毛報酬率',
      '人口變化 2019→2025', '6～11 歲兒童（2025）', '每 100 名兒童的補習班數', '店面型商家淨增（2021～2025）'];
    var h = '<thead><tr>' + head.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>';
    ord.forEach(function (k) {
      var r = R[k];
      h += '<tr><td><span class="chip" style="background:' + COLORS[k] + '"></span>' + r.name + '</td><td>' + r.mature + '</td><td>' + fmt(r.new10_bld) + '</td><td>' + fmt(r.pipe_units) +
        '</td><td>' + fmt(r.sale_med) + '（' + r.sale_n + '）</td><td>' + fmt(r.rent_med) + '（' + r.rent_n + '）</td><td>' +
        fmt(r.l591_rent_conv) + '</td><td>' + fmt(r.yield, 1) + '%</td><td>' + sgn(r.pop_chg, 0) + '%</td><td>' + fmt(r.kids611) +
        '</td><td>' + fmt(r.cram_per100, 2) + '</td><td>' + fmt(r.shop_net) + '</td></tr>';
    });
    h += '<tr><td>選手村社宅</td><td class="l" colspan="11">一樓店鋪由新北市標租。最近一批只有 1 間，192.9 坪，月租底價 323,033 元（含稅），每坪約 1,675 元；改作補教用途要出租人書面同意，並辦變更使用。</td></tr>';
    h += '<tr><td>工二工業區、工一 AI+ 智慧園區</td><td class="l" colspan="11">以工廠和辦公為主，店面很少。</td></tr></tbody>';
    document.getElementById('tblOverview').innerHTML = h;
    document.getElementById('st_shops').textContent = fmt(R.LK02.shops_alive);
    document.getElementById('st_sale').textContent = fmt(R.LK03.sale_med) + ' 萬';
    document.getElementById('st_pipe').textContent = '約 ' + fmt(Math.round(R.LK03.pipe_units / 10) * 10);
    Array.prototype.forEach.call(document.querySelectorAll('.area-card[data-a]'), function (el) { el.style.borderLeftColor = COLORS[el.getAttribute('data-a')]; });

    var y = '<thead><tr><th>商圈</th><th>成交中位數（萬／坪）</th><th>租金中位數（元／坪／月）</th><th>毛報酬率</th></tr></thead><tbody>';
    ord.forEach(function (k) {
      var r = R[k];
      y += '<tr><td><span class="chip" style="background:' + COLORS[k] + '"></span>' + r.name + '</td><td>' + fmt(r.sale_med) + '（' + r.sale_n + '）</td><td>' + fmt(r.rent_med) + '（' + r.rent_n + '）</td><td>' + fmt(r.yield, 1) + '%</td></tr>';
    });
    document.getElementById('tblYield').innerHTML = y + '</tbody>';
  }

  /* 二到四樓版的價格表：空樣本顯示「–」加筆數 */
  function buildYieldUp(S) {
    var U = UP.rows, ord = S.order;
    function cell(v, n) { return (v === null || v === undefined ? '–' : fmt(v)) + '（' + n + '）'; }
    var y = '<thead><tr><th>商圈</th><th>成交中位數（萬／坪）</th><th>租金中位數（元／坪／月）</th><th>毛報酬率</th></tr></thead><tbody>';
    ord.forEach(function (k) {
      var r = U[k];
      y += '<tr><td><span class="chip" style="background:' + COLORS[k] + '"></span>' + r.name + '</td><td>' + cell(r.sale_med, r.sale_n) + '</td><td>' + cell(r.rent_med, r.rent_n) +
        '</td><td>' + (r['yield'] === null ? '–' : fmt(r['yield'], 1) + '%') + '（' + r.yield_n + '）</td></tr>';
    });
    document.getElementById('tblYield').innerHTML = y + '</tbody>';
    var o = UP.overall, mx = Math.max.apply(null, ord.map(function (k) { return U[k].sale_n; })), mn = Math.min.apply(null, ord.map(function (k) { return U[k].sale_n; }));
    document.getElementById('yieldNote').innerHTML = '二到四樓是 2～4 樓、登記為辦公或商業用途的單位，不含 5 樓以上。這類單位多數在住宅大樓裡（428 筆買賣中有 366 筆），有些實際當住家用，行情可能偏低。2023 年以來進統計的成交全林口只有 ' + o.sale_n + ' 筆，各商圈 ' + mn + ' 到 ' + mx +
      ' 筆，租賃 ' + o.rent_n + ' 筆，中位數只能看大方向。同一期間全林口二到四樓成交中位數每坪 ' + fmt(o.sale_med) + ' 萬，一樓 ' + fmt(o.sale_one_med) + ' 萬（' + o.sale_one_n +
      ' 筆）；二到四樓月租每坪 ' + fmt(o.rent_med) + ' 元，一樓 ' + fmt(o.rent_one_med) + ' 元（' + o.rent_one_n + ' 筆）。毛報酬率用全期間的租賃，配對同棟或同路段、前後兩年內的成交算出，括號內，成交、租金是筆數，毛報酬率是配對到的租賃筆數。';
  }
  function setYieldMode(m) {
    if (m === 'up') buildYieldUp(SUM1);
    else {
      buildTables(SUM1);
      document.getElementById('yieldNote').textContent = '';
    }
  }

  /* ---------------- 圖表 ---------------- */
  var INK = '#1e3a5f', MUTED = '#5a7a9a', GRID = '#edf1f5', BASE = '#cfd8e3';
  function mk(id, opt, h) {
    var el = document.getElementById(id);
    if (h) el.style.height = h + 'px';
    var c = echarts.init(el);
    opt.textStyle = { fontFamily: FONT, fontSize: 11 };
    opt.animationDuration = 600; opt.animationEasing = 'cubicOut';
    c.setOption(opt);
    charts.push(c);
    return c;
  }
  /* 座標軸：無 y 軸線、實線細格線、x 軸基線，無軸標題 */
  function xAx(extra) {
    return Object.assign({ type: 'category', axisTick: { show: false }, axisLine: { lineStyle: { color: BASE, width: 1 } },
      axisLabel: { color: MUTED, fontSize: 11 }, splitLine: { show: false } }, extra || {});
  }
  function yAx(extra) {
    return Object.assign({ type: 'value', axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 11 }, splitLine: { lineStyle: { color: GRID, width: 1, type: 'solid' } } }, extra || {});
  }
  /* 提示卡：白底無框、圓角 8、柔影；每列＝色點＋名稱＋右對齊數值 */
  function tip(unit, titleFn, extra) {
    return Object.assign({ trigger: 'axis', backgroundColor: '#fff', borderWidth: 0, padding: [10, 12], confine: true,
      extraCssText: 'border-radius:8px;box-shadow:0 6px 20px rgba(30,58,95,.16);',
      textStyle: { color: INK, fontSize: 12, fontFamily: FONT },
      axisPointer: { type: 'line', lineStyle: { color: BASE, width: 1 } },
      formatter: function (ps) {
        ps = Array.isArray(ps) ? ps : [ps];
        var h = '<div style="font-size:11px;color:' + MUTED + ';margin-bottom:6px">' + (titleFn ? titleFn(ps[0]) : ps[0].axisValueLabel) + '</div>';
        ps.forEach(function (p) {
          var v = Array.isArray(p.value) ? p.value[1] : p.value;
          if (v === null || v === undefined) return;
          h += '<div style="display:flex;align-items:center;gap:14px;line-height:20px"><span style="display:flex;align-items:center"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + p.color + ';margin-right:7px"></i>' + p.seriesName + '</span><b style="margin-left:auto;font-variant-numeric:tabular-nums">' + fmt(v) + (unit || '') + '</b></div>';
        });
        return h;
      } }, extra || {});
  }
  var LEG = { top: 0, left: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 16, textStyle: { fontSize: 11, color: '#4a6080' } };
  function endDot(coord, color) {
    return { symbol: 'circle', symbolSize: 8, coord: coord, itemStyle: { color: color, borderColor: '#fff', borderWidth: 2 }, label: { show: false } };
  }

  /* 小圖並排：一個 ECharts 實例、六個 grid，共用 y 軸刻度 */
  function multiples(id, o) {
    var el = document.getElementById(id), W = el.clientWidth || 600, narrow = W < 560;
    var cols = narrow ? 2 : 3, rows = Math.ceil(o.ord.length / cols), cellW = W / cols, cellH = narrow ? 176 : 188, gt = 30;
    var opt = { title: [], grid: [], xAxis: [], yAxis: [], series: [], tooltip: tip(o.unit, function (p) { return p.axisValueLabel; }) };
    var ymax = 0;
    o.ord.forEach(function (k) { o.data[k].forEach(function (v) { if (v > ymax) ymax = v; }); });
    var step = o.step, top = Math.ceil(ymax * 1.08 / step) * step;
    o.ord.forEach(function (k, i) {
      var cx = (i % cols) * cellW, cy = Math.floor(i / cols) * cellH, first = (i % cols) === 0, n = o.years.length;
      var padL = first ? 40 : 20, padR = 22;
      opt.title.push({ left: cx + 4, top: cy + 2, text: '{n|' + o.nm[k] + '}  {s|' + o.sub(k) + '}',
        textStyle: { rich: { n: { fontSize: 12.5, fontWeight: 700, color: o.colors[k] }, s: { fontSize: 11, fontWeight: 400, color: MUTED, lineHeight: 16 } } } });
      opt.grid.push({ left: cx + padL, top: cy + gt, width: cellW - padL - padR, height: cellH - gt - 30, containLabel: false });
      opt.xAxis.push(xAx({ gridIndex: i, data: o.years, boundaryGap: o.type === 'bar',
        axisLabel: { color: MUTED, fontSize: 11, interval: function (j) { return j === 0 || j === n - 1 || (!narrow && j === Math.floor((n - 1) / 2)); }, formatter: function (v) { return String(v); } } }));
      opt.yAxis.push(yAx({ gridIndex: i, min: 0, max: top, interval: o.step, axisLabel: { show: first, color: MUTED, fontSize: 11, formatter: o.yfmt || function (v) { return fmt(v); } } }));
      var data = o.data[k], col = o.colors[k], s;
      if (o.type === 'bar') {
        var mx = Math.max.apply(null, data);
        s = { name: o.nm[k], type: 'bar', xAxisIndex: i, yAxisIndex: i, barMaxWidth: 18, itemStyle: { color: col, borderRadius: [4, 4, 0, 0] },
          data: data.map(function (v, j) { return (v === mx && mx > 0 && o.peak) ? { value: v, label: { show: true, position: 'top', color: INK, fontSize: 11, fontWeight: 600, formatter: String(v) } } : v; }) };
      } else {
        s = { name: o.nm[k], type: 'line', xAxisIndex: i, yAxisIndex: i, data: data, showSymbol: false, symbol: 'circle', symbolSize: 6,
          lineStyle: { color: col, width: 2, cap: 'round', join: 'round' }, itemStyle: { color: col }, areaStyle: { color: col, opacity: 0.10 },
          markPoint: { silent: true, animation: false, data: [Object.assign(endDot([n - 1, data[n - 1]], col), { label: { show: true, position: 'top', color: INK, fontSize: 11, fontWeight: 600, formatter: fmt(data[n - 1]), offset: [-10, 0] } })] } };
      }
      opt.series.push(s);
    });
    var c = mk(id, opt, rows * cellH + 4);
    c.__multi = { id: id, o: o };
    return c;
  }

  function buildCharts(C) {
    var ord = C.order, nm = C.names;
    var narrow = window.innerWidth < 700;
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };

    /* 圖 1：每年完工的店面大樓，六個商圈各一格 */
    multiples('fig1', { ord: ord, nm: nm, colors: COL, years: C.fig1.years, data: C.fig1.data, type: 'bar', unit: ' 棟', step: 4, peak: true,
      sub: function (k) { return '合計 ' + sum(C.fig1.data[k]) + ' 棟'; }, xfmt: function (v) { return String(v); } });

    /* 圖 2：兩張熱度表 */
    buildHeat(C, ord, nm);

    /* 圖 3：兒童數兩條線，標出各自最高點與最新值 */
    var f3 = C.fig3, L = f3.labels.length;
    function peakOf(a) { var m = Math.max.apply(null, a); return a.indexOf(m); }
    function lineSeries(name, a, col, peakPos) {
      var pi = peakOf(a), yr = f3.labels[pi].slice(0, 4);
      return { name: name, type: 'line', data: a, symbol: 'circle', showSymbol: false, lineStyle: { color: col, width: 2, cap: 'round', join: 'round' }, itemStyle: { color: col },
        areaStyle: { color: col, opacity: 0.06 },
        endLabel: { show: true, formatter: function (p) { return fmt(p.value); }, color: col, fontSize: 11, fontWeight: 600, distance: 10 },
        markPoint: { silent: true, animation: false, data: [
          Object.assign(endDot([pi, a[pi]], col), { label: { show: true, position: peakPos, color: col, fontSize: 11, fontWeight: 600, formatter: yr + ' 年 ' + fmt(a[pi]), distance: 8 } }),
          endDot([L - 1, a[L - 1]], col)] } };
    }
    mk('fig3', { tooltip: tip(' 人'), legend: LEG, grid: { left: 44, right: 56, top: 40, bottom: 28 },
      xAxis: xAx({ data: f3.labels, boundaryGap: false, axisLabel: { color: MUTED, fontSize: 11, interval: narrow ? 1 : 0, formatter: function (v) { return v.indexOf('年') > 0 ? '2026' : v; } } }),
      yAxis: yAx({ min: 5000, max: 12000, interval: 1000, axisLabel: { color: MUTED, fontSize: 11, formatter: function (v) { return fmt(v); } } }),
      series: [lineSeries('6～11 歲', f3.a611, '#1e3a5f', 'top'), lineSeries('0～5 歲', f3.a05, '#d97706', 'bottom')] }, narrow ? 300 : 340);

    /* 圖 4：各商圈人口，小圖並排 */
    var yrs4 = C.fig4.years, i19 = yrs4.indexOf(2019), last4 = yrs4.length - 1;
    function chg4(k) { var d = C.fig4.data[k]; return (d[last4] / d[i19] - 1) * 100; }
    multiples('fig4', { ord: ord, nm: nm, colors: COL, years: yrs4, data: C.fig4.data, type: 'area', unit: ' 人', step: 10000,
      yfmt: function (v) { return v === 0 ? '0' : fmt(v / 10000) + ' 萬'; },
      sub: function (k) { return (chg4(k) >= 0 ? '+' : '') + fmt(chg4(k), 1) + '%'; } });

    /* 圖 5：每年淨增商家，小圖並排 */
    var last5 = C.fig5.years.length - 1;
    multiples('fig5', { ord: ord, nm: nm, colors: COL, years: C.fig5.years, data: C.fig5.data, type: 'bar', unit: ' 家', step: 40, peak: false,
      sub: function (k) { return C.fig5.years[last5] + ' 年 ' + fmt(C.fig5.data[k][last5]) + ' 家'; } });

    /* 圖 6：A9 站日均運量 */
    var mo = C.fig6.months, vv = C.fig6.v, n6 = vv.length, col6 = '#3b5b82';
    var a = mo.indexOf('2021-05'), b = mo.indexOf('2021-07');
    var ml = mo[n6 - 1].split('-');
    mk('fig6', { tooltip: tip(' 人次', function (p) { var s = p.axisValue.split('-'); return s[0] + ' 年 ' + (+s[1]) + ' 月'; }),
      grid: { left: 44, right: 78, top: 24, bottom: 28 },
      xAxis: xAx({ data: mo, boundaryGap: false, axisLabel: { color: MUTED, fontSize: 11, interval: function (i) { return mo[i].slice(5) === '01' && (!narrow || (+mo[i].slice(0, 4) - 2019) % 2 === 0); }, formatter: function (v) { return v.slice(0, 4); } } }),
      yAxis: yAx({ min: 0, axisLabel: { color: MUTED, fontSize: 11, formatter: function (v) { return fmt(v); } } }),
      series: [{ name: 'A9 林口站', type: 'line', data: vv, showSymbol: false, symbol: 'circle', lineStyle: { color: col6, width: 2, cap: 'round', join: 'round' }, itemStyle: { color: col6 },
        areaStyle: { color: col6, opacity: 0.10 },
        endLabel: { show: true, distance: 10, color: INK, fontSize: 11, fontWeight: 600, formatter: function (p) { return fmt(p.value) + '\n{m|' + ml[0] + ' 年 ' + (+ml[1]) + ' 月}'; }, rich: { m: { fontSize: 10.5, color: MUTED, fontWeight: 400, lineHeight: 15 } } },
        markPoint: { silent: true, animation: false, data: [endDot([n6 - 1, vv[n6 - 1]], col6)] },
        markArea: (a >= 0 && b >= 0) ? { silent: true, itemStyle: { color: 'rgba(90,122,154,.14)' }, label: { color: MUTED, fontSize: 11, position: 'insideTop' },
          data: [[{ xAxis: mo[a], name: '三級警戒' }, { xAxis: mo[b] }]] } : undefined }] }, narrow ? 280 : 320);

    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        charts.slice().forEach(function (c) {
          if (c.__multi) { var m = c.__multi, el = document.getElementById(m.id); el.style.height = ''; c.dispose(); charts.splice(charts.indexOf(c), 1); multiples(m.id, m.o); }
          else c.resize();
        });
      }, 120);
    });
  }

  /* 圖 1：一樓店面／二到四樓辦公、商業 兩種版本 */
  var FIG1_ORIG = null;
  function drawFig1(mode) {
    var h = document.getElementById('fig1H'), cap = document.getElementById('fig1C'), el = document.getElementById('fig1');
    if (!FIG1_ORIG) FIG1_ORIG = { h: h.textContent, c: cap.textContent };
    charts.slice().forEach(function (c) { if (c.__multi && c.__multi.id === 'fig1') { c.dispose(); charts.splice(charts.indexOf(c), 1); } });
    el.style.height = '';
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
    var F = mode === 'up' ? UP.fig1 : CH.fig1;
    h.textContent = mode === 'up' ? F.title : FIG1_ORIG.h;
    cap.textContent = mode === 'up' ? '圖 1：各商圈每年完工、有二到四樓辦公或商業成交或租賃紀錄的大樓數（2016～2026，依實價登錄的完工年；二到四樓指登記為辦公或商業用途的 2～4 樓）' : FIG1_ORIG.c;
    multiples('fig1', { ord: CH.order, nm: CH.names, colors: COL, years: F.years, data: F.data, type: 'bar', unit: ' 棟', step: mode === 'up' ? 1 : 4, peak: true,
      sub: function (k) { return '合計 ' + sum(F.data[k]) + ' 棟'; }, xfmt: function (v) { return String(v); } });
  }

  /* 圖 2：兩張熱度表（單一藍色，深淺＝數值，格內印數字） */
  function heatColor(t) {
    var a = [205, 226, 251], z = [24, 79, 149];
    return 'rgb(' + a.map(function (x, i) { return Math.round(x + (z[i] - x) * t); }).join(',') + ')';
  }
  function heatTable(title, ord, nm, years, data) {
    var mx = 0;
    ord.forEach(function (k) { data[k].forEach(function (v) { if (v > mx) mx = v; }); });
    var h = '<div class="heat"><div class="heat-t">' + title + '</div><table><thead><tr><th></th>' + years.map(function (y) { return '<th>' + y + '</th>'; }).join('') + '<th class="tot">合計</th></tr></thead><tbody>';
    ord.forEach(function (k) {
      var tot = data[k].reduce(function (x, y) { return x + y; }, 0);
      h += '<tr><td class="an"><span class="chip" style="background:' + COL[k] + '"></span>' + nm[k] + '</td>';
      data[k].forEach(function (v) {
        if (!v) { h += '<td class="z">–</td>'; return; }
        var t = v / mx;
        h += '<td style="background:' + heatColor(t) + ';color:' + (t > 0.5 ? '#fff' : INK) + '">' + fmt(v) + '</td>';
      });
      h += '<td class="tot">' + (tot ? fmt(tot) : '–') + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  function buildHeat(C, ord, nm) {
    var f = C.fig2;
    document.getElementById('fig2').innerHTML = '<div class="heat-wrap">' + heatTable('未完工戶數', ord, nm, f.years, f.units) + heatTable('已簽約店面（間）', ord, nm, f.years, f.signed) + '</div>';
  }

  /* 各路段的店面供給：HTML 長條表 */
  var ROAD_NOTE1 = null;
  function buildRoads(R, mode) {
    var up = mode === 'up';
    if (up) R = UP.roads;
    var el = document.getElementById('roadCards'), sc = R.scale;
    var note = document.getElementById('roadNote');
    if (ROAD_NOTE1 === null) ROAD_NOTE1 = note.innerHTML;
    function bar(v, mx, col) {
      if (!v) return '<div class="rb"><b class="z">–</b></div>';
      return '<div class="rb"><i style="flex:0 0 calc((100% - 40px) * ' + (v / mx).toFixed(4) + ');background:' + col + '"></i><b>' + fmt(v) + '</b></div>';
    }
    var h = '';
    R.areas.forEach(function (a) {
      var col = COL[a.id];
      h += '<div class="rcard"><div class="rc-h"><span class="chip" style="background:' + col + '"></span><b>' + esc(a.name) + '</b><span class="rc-c">' + esc(a.claim) + '</span></div>';
      if (up) h += '<div class="rr up rh"><span class="rn"></span><span>2016 年後完工（棟）</span><span>2015 年前完工（棟）</span><span>二到四樓成交（筆）</span><span>未完工戶數</span></div>';
      else h += '<div class="rr rh"><span class="rn"></span><span>2016 年後完工（棟）</span><span>2015 年前完工（棟）</span><span>未完工戶數</span><span>已簽約店面（間）</span></div>';
      a.rows.forEach(function (r) {
        var mu = (r.other || r.road === '路段不明') ? ' mu' : '';
        if (up) h += '<div class="rr up' + mu + '"><span class="rn">' + esc(r.road) + '</span>' +
          bar(r.b16, sc.b16, col) + bar(r.b15, sc.b15, '#c3ccd8') + bar(r.sales, sc.sales, '#8b7fb8') + bar(r.units, sc.units, '#6b8cae') + '</div>';
        else h += '<div class="rr' + mu + '"><span class="rn">' + esc(r.road) + '</span>' +
          bar(r.b16, sc.b16, col) + bar(r.b15, sc.b15, '#c3ccd8') + bar(r.units, sc.units, '#6b8cae') +
          '<div class="rb">' + (r.signed ? '<b>' + fmt(r.signed) + '</b>' : '<b class="z">–</b>') + '</div></div>';
      });
      h += '</div>';
    });
    el.innerHTML = h;
    if (up) {
      note.innerHTML = '後段、前段、中段各一張表。2016 年後完工、2015 年前完工是有二到四樓辦公、商業成交或租賃紀錄的大樓棟數，三張表的 2016 年後完工加起來等於圖 1。二到四樓成交是實價登錄 2～4 樓、登記辦公或商業用途的全部買賣筆數，含特殊交易和算不出單價的筆數，只計該商圈。未完工戶數是整個建案的戶數，不分樓層，跟一樓店面那一版相同。已簽約店面是一樓預售店面，這一版不列。同一欄的長條在三張表用同一個比例。寫成路口的地址算在先寫的那條路，「段別未載」是建案只寫路名、沒寫第幾段。';
      return;
    }
    note.innerHTML = ROAD_NOTE1;
    var ny = R.areas.filter(function (a) { return a.noyear; }).map(function (a) { return a.name + ' ' + a.noyear + ' 棟'; });
    var n2 = document.getElementById('roadNoYear');
    if (n2 && ny.length) n2.textContent = '另有' + ny.join('、') + '查不到完工年，沒有列入 2016 年後或 2015 年前兩欄。';
  }

  /* ---------------- 試算 ---------------- */
  var FIELDS = [
    ['area', '坪數', 'number', 1], ['price', '每坪價格（萬元）', 'number', 0.5], ['rent', '每坪月租（元）', 'number', 10],
    ['ltv', '貸款成數（%）', 'number', 5], ['rate', '房貸利率（%）', 'number', 0.1], ['years', '貸款年數', 'number', 1],
    ['hold', '持有年數', 'number', 1], ['hg', '每年房價變動（%）', 'number', 0.5], ['rg', '每年租金調整（%）', 'number', 0.5],
    ['fee', '每年稅費與管理費占總價比例（%）', 'number', 0.1]];
  var PRESETS = [
    { area: 40, price: 54, rent: 1419, ltv: 60, rate: 2.8, years: 20, hold: 10, hg: 0, rg: 0, fee: 0.5 },
    { area: 40, price: 69, rent: 1462, ltv: 60, rate: 2.8, years: 20, hold: 10, hg: 0, rg: 0, fee: 0.5 }];
  function wan(v) { return fmt(v / 1e4, 1) + ' 萬'; }
  function calc() {
    var v = {};
    FIELDS.forEach(function (f) { v[f[0]] = parseFloat(document.getElementById('c_' + f[0]).value); if (isNaN(v[f[0]])) v[f[0]] = 0; });
    var P = v.area * v.price * 1e4, loan = P * v.ltv / 100, down = P - loan;
    var n = Math.max(0, Math.round(v.years * 12)), i = v.rate / 100 / 12;
    var pmt = n === 0 ? 0 : (i === 0 ? loan / n : loan * i / (1 - Math.pow(1 + i, -n)));
    var k = Math.min(Math.round(v.hold * 12), n);
    var bal = loan;
    if (n > 0) { bal = i === 0 ? loan - pmt * k : loan * Math.pow(1 + i, k) - pmt * (Math.pow(1 + i, k) - 1) / i; }
    if (bal < 0 || k >= n) bal = 0;
    var feeY = P * v.fee / 100, H = Math.round(v.hold);
    var paid = pmt * k, fees = feeY * v.hold;
    var sellP = P * Math.pow(1 + v.hg / 100, v.hold);
    var buyTotal = down + paid + fees;
    var buyNet = buyTotal - (sellP - bal);
    var rent0 = v.area * v.rent, rentTotal = 0;
    for (var y = 0; y < H; y++) rentTotal += rent0 * 12 * Math.pow(1 + v.rg / 100, y);
    var diff = buyNet - rentTotal;
    var o = [
      ['總價', wan(P), 0], ['每月房貸', fmt(pmt) + ' 元', 0], ['買的每月現金支出（房貸＋稅費管理費）', fmt(pmt + feeY / 12) + ' 元', 0],
      ['租的每月租金', fmt(rent0) + ' 元', 0], ['持有期間買的總現金支出（自備款＋房貸總繳＋稅費管理費）', wan(buyTotal), 0],
      ['持有期間租的總現金支出', wan(rentTotal), 0], ['期末賣掉並還清剩餘貸款後，買的淨成本', wan(buyNet), 0],
      ['期末淨成本差（買減租，正數代表買比較貴）', (diff > 0 ? '+' : '') + wan(diff), 1]];
    document.getElementById('calcOut').innerHTML = o.map(function (x) {
      return '<div class="o' + (x[2] ? ' key' : '') + '"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + '</div></div>';
    }).join('');
  }
  function setPreset(i) {
    var p = PRESETS[i];
    FIELDS.forEach(function (f) { document.getElementById('c_' + f[0]).value = p[f[0]]; });
    Array.prototype.forEach.call(document.querySelectorAll('#presetBar button'), function (b) { b.classList.toggle('on', +b.getAttribute('data-p') === i); });
    calc();
  }
  function buildCalc() {
    document.getElementById('calcIn').innerHTML = FIELDS.map(function (f) {
      return '<label>' + f[1] + '<input id="c_' + f[0] + '" type="number" inputmode="decimal" step="' + f[3] + '" min="0"></label>';
    }).join('');
    FIELDS.forEach(function (f) { document.getElementById('c_' + f[0]).addEventListener('input', function () {
      Array.prototype.forEach.call(document.querySelectorAll('#presetBar button'), function (b) { b.classList.remove('on'); }); calc(); }); });
    Array.prototype.forEach.call(document.querySelectorAll('#presetBar button'), function (b) {
      b.addEventListener('click', function () { setPreset(+b.getAttribute('data-p')); }); });
    setPreset(0);
  }

  /* ---------------- 地圖 ---------------- */
  var ZCOL = { '第一種住宅區': '#cfe3f7', '第二種住宅區': '#9cc3ec', '第三種住宅區': '#5f9de0', '第四種住宅區': '#2f72c9', '第五種住宅區': '#17458f' };
  function zoneStyle(z) {
    var m = z.match(/^(第[一二三四五]種住宅區)/);
    if (m) return { fillColor: ZCOL[m[1]], fillOpacity: 0.55, color: ZCOL[m[1]], weight: 0.5, opacity: 0.8 };
    if (z === '住宅區' || z === '低密度住宅區') return { fillColor: '#9cc3ec', fillOpacity: 0.55, color: '#9cc3ec', weight: 0.5, opacity: 0.8 };
    if (/^(中心商業區|建成商業區|鄰里商業區|商業區)/.test(z)) return { fillColor: '#e11d48', fillOpacity: 0.6, color: '#be123c', weight: 0.6, opacity: 0.9 };
    if (z === '乙種工業區') return { fillColor: '#a16207', fillOpacity: 0.55, color: '#a16207', weight: 0.5, opacity: 0.8 };
    return { fillColor: '#9ca3af', fillOpacity: 0.18, color: '#9ca3af', weight: 0.3, opacity: 0.35 };
  }
  var VBINS = [[0, 500, '#fef3c7'], [500, 700, '#fcd34d'], [700, 900, '#f59e0b'], [900, 1100, '#d97706'], [1100, 1e9, '#92400e']];
  function vcolor(n) { for (var i = 0; i < VBINS.length; i++) if (n >= VBINS[i][0] && n < VBINS[i][1]) return VBINS[i][2]; return '#ccc'; }

  function buildMap(D) {
    var map = L.map('map', { preferCanvas: true, scrollWheelZoom: false }).setView([25.075, 121.372], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者' }).addTo(map);
    map.createPane('pZone').style.zIndex = 305;
    map.createPane('pVill').style.zIndex = 310;
    map.createPane('pArea').style.zIndex = 320;
    map.createPane('pFind').style.zIndex = 640; map.getPane('pFind').style.pointerEvents = 'none';
    var S = D.summary.rows;

    function areaPopup(r) {
      var h = '<b>' + esc(r.full) + '</b>（' + esc(r.mature) + '）<br>';
      h += '2016 年後完工店面：' + fmt(r.new10_bld) + ' 棟<br>未完工戶數：' + fmt(r.pipe_units) + ' 戶（已簽約店面 ' + fmt(r.pipe_signed) + '）<br>';
      h += '成交中位數（2023 起）：' + (r.sale_med ? fmt(r.sale_med) + ' 萬／坪（' + r.sale_n + ' 筆）' : '—') + '<br>';
      h += '實價登錄月租中位數（2023 起）：' + (r.rent_med ? fmt(r.rent_med) + ' 元／坪（' + r.rent_n + ' 筆）' : '—') + '<br>';
      if (r.l591_rent_conv) h += '591 一樓月租開價（含公設口徑）：' + fmt(r.l591_rent_conv) + ' 元／坪<br>';
      h += '毛報酬率：' + (r.yield ? fmt(r.yield, 1) + '%' : '—') + '<br>6～11 歲兒童（2025）：' + fmt(r.kids611) + '<br>';
      if (r.cram_per100 !== undefined) h += '每 100 名兒童的補習班數：' + fmt(r.cram_per100, 2);
      return h;
    }
    var L_ = {};
    L_.areas = L.geoJSON(D.areas, { pane: 'pArea', style: function (f) {
        var r = S[f.properties.id]; var old = r && r.mature === '成熟', c = COLORS[f.properties.id] || '#94a3b8';
        return { color: c, weight: old ? 1.5 : 2.5, dashArray: old ? '5 4' : null, fillColor: c, fillOpacity: old ? 0.12 : 0.2 };
      }, onEachFeature: function (f, l) { var r = S[f.properties.id]; if (r) l.bindPopup(areaPopup(r), { maxWidth: 280 }); } });
    var bb = L.latLngBounds([]);
    L_.areas.eachLayer(function (l) { if (/^LK/.test(l.feature.properties.id)) bb.extend(l.getBounds()); });
    if (bb.isValid()) map.fitBounds(bb, { padding: [12, 12] });

    function dot(lat, lon, o) { o.bubblingMouseEvents = false; return L.circleMarker([lat, lon], o); }
    function pb(lat, lon) { return '<br><button type="button" class="pick-btn" data-lat="' + lat + '" data-lon="' + lon + '">以這裡為中心分析</button>'; }
    var newB = [], oldB = [];
    D.bld.forEach(function (b) {
      var pop = '<b>' + esc(b.n) + '</b><br>完工年：' + (b.y || '不明') + '<br>成交：' + (b.ns ? b.ns + ' 筆，每坪中位數 ' + fmt(b.sm) + ' 萬' : '無有效成交') +
        '<br>租賃：' + (b.nr ? b.nr + ' 筆，每坪月租中位數 ' + fmt(b.rm) + ' 元' : '無有效租賃') + '<br>最近交易日：' + (b.d || '—') +
        (b.gp !== 'building' ? '<br><i>座標只對到路段</i>' : '') + pb(b.lat, b.lon);
      if (b.new) newB.push(dot(b.lat, b.lon, { radius: 5, color: '#fff', weight: 1, fillColor: '#0d9488', fillOpacity: 0.9 }).bindPopup(pop));
      else oldB.push(dot(b.lat, b.lon, { radius: 4, color: '#fff', weight: 0.8, fillColor: '#6b7280', fillOpacity: 0.8 }).bindPopup(pop));
    });
    L_.newb = L.layerGroup(newB); L_.oldb = L.layerGroup(oldB);

    L_.l591 = L.layerGroup(D.l591.map(function (x) {
      var sale = x.t === 'sale';
      var pop = '<b>591 一樓' + (sale ? '出售' : '出租') + '</b><br>' + esc(x.a) + '<br>' + (x.p ? '坪數：' + fmt(x.p, 1) + ' 坪<br>' : '') +
        (sale ? '開價：' + fmt(x.tot) + ' 萬（每坪 ' + fmt(x.u, 1) + ' 萬）' : '月租：' + fmt(x.tot) + ' 元（每坪 ' + fmt(x.u) + ' 元，使用坪數）') + '<br>屋齡：' +
        (x.age !== null ? fmt(x.age) + ' 年' : '—') + (x.p16 === true ? '（2016 年後完工）' : '') + '<br>刊登日：' + (x.d || '—') + '<br><a href="' + esc(x.url) + '" target="_blank" rel="noopener">591 連結</a>' + pb(x.lat, x.lon);
      return dot(x.lat, x.lon, { radius: 4.5, color: '#fff', weight: 0.8, fillColor: sale ? '#dc2626' : '#16a34a', fillOpacity: 0.85 }).bindPopup(pop);
    }));
    var edu = [];
    D.edu.cram.forEach(function (c) { edu.push(dot(c.lat, c.lon, { radius: 4, color: '#fff', weight: 0.8, fillColor: '#7c3aed', fillOpacity: 0.9 }).bindPopup('<b>' + esc(c.n) + '</b><br>補習班' + (c.c ? '（' + esc(c.c) + '）' : '') + pb(c.lat, c.lon))); });
    D.edu.asc.forEach(function (c) { edu.push(dot(c.lat, c.lon, { radius: 7, color: '#78350f', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.95 }).bindPopup('<b>' + esc(c.n) + '</b><br>課後照顧中心' + pb(c.lat, c.lon))); });
    L_.edu = L.layerGroup(edu);

    L_.pipe = L.layerGroup(D.pipe.map(function (p) {
      return L.marker([p.lat, p.lon], { bubblingMouseEvents: false, icon: L.divIcon({ className: '', html: '<div class="sq-icon"></div>', iconSize: [13, 13] }) })
        .bindPopup('<b>' + esc(p.n) + '</b><br>戶數：' + fmt(p.hh) + ' 戶<br>預計完工年：' + (p.y || '—') + '<br>已簽約店面：' + fmt(p.sg) + ' 間' + (p.gp === 'road' || p.gp === 'none' ? '<br><i>只對到路名，位置不準</i>' : '') + pb(p.lat, p.lon));
    }));
    L_.sch = L.layerGroup(D.sch.map(function (s) {
      return dot(s.lat, s.lon, { radius: Math.max(5, Math.sqrt(s.s || 100) / 4), color: '#1e3a5f', weight: 1.5, fillColor: '#60a5fa', fillOpacity: 0.75 })
        .bindPopup('<b>' + esc(s.n) + '</b><br>學生數（114 學年）：' + fmt(s.s) + pb(s.lat, s.lon));
    }));
    var BIZCOL = ['#db2777', '#0284c7', '#ca8a04', '#4d7c0f'], BIZK = [];
    var FLOOR_ON = [true, false];   /* 樓層群：0 一樓（含地下室、沒寫樓層）、1 二樓以上 */
    function fillBiz(i) {
      var c = D.biz.cats[i], lg = L_['biz' + i];
      lg.clearLayers();
      D.biz.pts[c].forEach(function (q) {
        if (!FLOOR_ON[q[4]]) return;
        lg.addLayer(dot(q[0], q[1], { radius: Math.min(11, 3.5 + 1.6 * Math.sqrt(q[2] - 1)), color: '#fff', weight: 1, fillColor: BIZCOL[i], fillOpacity: 0.85 })
          .bindPopup('<b>' + esc(c) + '</b><br>樓層：' + (q[4] ? '二樓以上' : FLOOR_ONE) + '<br>這個門牌營業中 ' + q[2] + ' 家' + (q[3] ? '，其中 ' + q[3] + ' 家 2021～2025 年新設' : '') + pb(q[0], q[1])));
      });
    }
    function bizCount(c) { return (FLOOR_ON[0] ? D.biz.n[c][0] : 0) + (FLOOR_ON[1] ? D.biz.n[c][1] : 0); }
    D.biz.cats.forEach(function (c, i) {
      BIZK.push('biz' + i);
      L_['biz' + i] = L.layerGroup();
      fillBiz(i);
    });
    L_.vill = L.geoJSON(D.vill, { pane: 'pVill', style: function (f) { return { color: '#92400e', weight: 1, fillColor: vcolor(f.properties.age611), fillOpacity: 0.55 }; },
      onEachFeature: function (f, l) { l.bindPopup('<b>' + esc(f.properties.village) + '</b><br>6～11 歲兒童（2025 年 12 月）：' + fmt(f.properties.age611) + ' 人'); } });

    var zoneLayer = null, zoneLoading = false;
    function loadZone(cb) {
      if (zoneLayer) return cb();
      if (zoneLoading) return;
      zoneLoading = true;
      fetch('data/zoning.geojson').then(function (r) { return r.json(); }).then(function (g) {
        zoneLayer = L.geoJSON(g, { pane: 'pZone', style: function (f) { return zoneStyle(f.properties.ZONE || ''); },
          onEachFeature: function (f, l) { l.bindPopup('<b>' + esc(f.properties.ZONE || '') + '</b>'); } });
        L_.zone = zoneLayer; cb();
      }).catch(function () { zoneLoading = false; });
    }

    var LAYERS = [
      ['areas', '商圈範圍（新興飽和色、成熟灰藍虛線）', 1, '<span class="sw poly" style="background:#ea580c"></span><span class="sw poly" style="background:#52708f"></span>'],
      ['newb', '2016 年後完工的店面大樓', 1, '<span class="sw" style="background:#0d9488"></span>'],
      ['l591', '591 一樓出售、出租', 1, '<span class="sw" style="background:#dc2626"></span><span class="sw" style="background:#16a34a"></span>'],
      ['edu', '補習班、課後照顧中心', 1, '<span class="sw" style="background:#7c3aed"></span><span class="sw" style="background:#f59e0b"></span>'],
      ['oldb', '較舊的店面大樓（2015 年以前完工）', 0, '<span class="sw" style="background:#6b7280"></span>'],
      ['pipe', '未完工建案', 0, '<span class="sw sq" style="background:#7c3aed"></span>'],
      ['sch', '國小', 0, '<span class="sw" style="background:#60a5fa"></span>'],
      ['vill', '各里國小年齡兒童數', 0, '<span class="sw poly" style="background:#f59e0b"></span>'],
      ['zone', '土地使用分區', 0, '<span class="sw poly" style="background:#5f9de0"></span>']].concat(
      D.biz.cats.map(function (c, i) { return ['biz' + i, '<span class="bl">' + c + '（' + fmt(bizCount(c)) + ' 家）</span>', 0, '<span class="sw" style="background:' + BIZCOL[i] + '"></span>', i === 0]; }));
    var bar = document.getElementById('layerBar'), on = {};
    LAYERS.forEach(function (l) {
      if (l[4]) {
        var gh = document.createElement('div'); gh.className = 'lyr-group'; gh.textContent = '營業中的店家（依商業登記）'; bar.appendChild(gh);
        var fr = document.createElement('div'); fr.className = 'fl-row'; fr.id = 'floorRow';
        fr.innerHTML = '<span class="fl-k">樓層：</span><label><input type="checkbox" data-fl="0" checked> 一樓（含地下室、沒寫樓層）</label><label><input type="checkbox" data-fl="1"> 二樓以上</label>';
        bar.appendChild(fr);
      }
      var lab = document.createElement('label');
      lab.innerHTML = '<input type="checkbox" data-k="' + l[0] + '"' + (l[2] ? ' checked' : '') + '> ' + l[3] + l[1];
      bar.appendChild(lab); on[l[0]] = !!l[2];
    });
    var legendDiv;
    var Legend = L.control({ position: 'bottomright' });
    var legendBody;
    Legend.onAdd = function () {
      legendDiv = L.DomUtil.create('div', 'map-legend' + (window.innerWidth < 700 ? ' collapsed' : ''));
      var btn = L.DomUtil.create('button', 'lg-btn', legendDiv); btn.type = 'button'; btn.innerHTML = '圖例 <span class="lg-arrow">▾</span>';
      btn.addEventListener('click', function () { legendDiv.classList.toggle('collapsed'); });
      legendBody = L.DomUtil.create('div', 'lg-body', legendDiv);
      L.DomEvent.disableClickPropagation(legendDiv); L.DomEvent.disableScrollPropagation(legendDiv); return legendDiv; };
    Legend.addTo(map);
    function renderLegend() {
      var h = '';
      if (on.areas) h += '<div class="g2">' + ['LK03', 'LK01', 'LK02', 'LK06', 'LK04', 'LK09', 'LK07', 'LK05', 'LK08'].map(function (k) { var r = S[k]; return r ? '<div class="row"><span class="bar" style="background:' + COLORS[k] + '"></span>' + esc(r.name.replace('生活圈', '').replace('工一新北國際AI+智慧園區', '工一 AI+')) + (r.mature === '成熟' ? '（成熟）' : '') + '</div>' : ''; }).join('') + '</div>';
      if (on.l591) h += '<div class="row"><span class="sw" style="background:#dc2626"></span>591 出售 <span class="sw" style="background:#16a34a"></span>出租</div>';
      if (on.edu) h += '<div class="row"><span class="sw" style="background:#7c3aed"></span>補習班 <span class="sw" style="background:#f59e0b"></span>課後照顧</div>';
      var bz = BIZK.filter(function (k) { return on[k]; });
      if (bz.length) h += '<div class="row">' + bz.map(function (k) { var i = +k.slice(3); return '<span class="sw" style="background:' + BIZCOL[i] + '"></span>' + esc(D.biz.cats[i]); }).join(' ') + '</div><div style="color:#4a6080">圓點越大，同一門牌的店家越多。樓層：' + (FLOOR_ON[0] && FLOOR_ON[1] ? '一樓和二樓以上' : FLOOR_ON[0] ? '一樓（含地下室、沒寫樓層）' : FLOOR_ON[1] ? '二樓以上' : '都沒選') + '</div>';
      if (on.vill) { h += '<div>6～11 歲兒童數（人）</div>' + VBINS.map(function (b) { return '<div class="row"><span class="bar" style="background:' + b[2] + '"></span>' + (b[1] > 1e8 ? b[0] + ' 以上' : b[0] + '～' + b[1]) + '</div>'; }).join(''); }
      if (on.zone) {
        h += '<div>土地使用分區</div>' + [['#cfe3f7', '第一種住宅區（淺）'], ['#5f9de0', '第二至四種'], ['#17458f', '第五種住宅區（深）'], ['#e11d48', '中心、建成、鄰里商業區'], ['#a16207', '乙種工業區'], ['#9ca3af', '其他用地']]
          .map(function (b) { return '<div class="row"><span class="bar" style="background:' + b[0] + '"></span>' + b[1] + '</div>'; }).join('') +
          '<div style="margin-top:4px;color:#4a6080">分區圖來自新北市政府資料開放平臺（2026-02-26 版，政府資料開放授權條款第 1 版），僅供參考，以都市計畫書圖為準。</div>';
      }
      legendBody.innerHTML = h; legendDiv.style.display = h ? '' : 'none';
    }
    function apply(k) {
      var layers = k === 'newb' ? [L_.newb] : [L_[k]];
      var l = L_[k];
      if (!l) return;
      if (on[k]) l.addTo(map); else map.removeLayer(l);
      renderLegend();
    }
    bar.addEventListener('change', function (e) {
      var fl = e.target.getAttribute('data-fl');
      if (fl !== null) {
        FLOOR_ON[+fl] = e.target.checked;
        D.biz.cats.forEach(function (c, i) {
          fillBiz(i);
          var sp = bar.querySelector('[data-k=biz' + i + ']').parentNode.querySelector('.bl');
          if (sp) sp.textContent = c + '（' + fmt(bizCount(c)) + ' 家）';
        });
        renderLegend();
        return;
      }
      var k = e.target.getAttribute('data-k'); if (!k) return;
      on[k] = e.target.checked;
      if (k === 'zone' && on[k]) loadZone(function () { if (on.zone) { zoneLayer.addTo(map); } renderLegend(); });
      else apply(k);
    });
    LAYERS.forEach(function (l) { if (l[2]) L_[l[0]].addTo(map); });
    renderLegend();
    buildFinder(map, D, L_.areas);
    window.__map = { map: map, layers: L_, floors: FLOOR_ON, toggle: function (k, v) { var c = bar.querySelector('[data-k=' + k + ']'); c.checked = v; c.dispatchEvent(new Event('change', { bubbles: true })); } };
  }

  /* ---------------- 選址工具 ---------------- */
  function hav(lat1, lon1, lat2, lon2) {
    var p = Math.PI / 180, a = Math.pow(Math.sin((lat2 - lat1) * p / 2), 2) + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.pow(Math.sin((lon2 - lon1) * p / 2), 2);
    return 2 * 6371000 * Math.asin(Math.sqrt(a));
  }
  function median(a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
  function pc(n, d) { if (n === null || n === undefined || !isFinite(n)) return '—'; var v = Math.round(Math.abs(n) * Math.pow(10, d || 1)) / Math.pow(10, d || 1); return (n > 0 && v > 0 ? '+' : (n < 0 && v > 0 ? '−' : '±')) + v.toFixed(d === undefined ? 1 : d) + '%'; }
  function centroid(ring) {
    var a = 0, cx = 0, cy = 0;
    for (var i = 0; i < ring.length - 1; i++) { var x0 = ring[i][0], y0 = ring[i][1], x1 = ring[i + 1][0], y1 = ring[i + 1][1], c = x0 * y1 - x1 * y0; a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
    return [cx / (3 * a), cy / (3 * a)];
  }
  function row(k, v) { return '<div class="cp-row"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }

  function buildFinder(map, D, areasLayer) {
    var C = D.catchData, M = D.summary.overall, AGEL = C.meta.age_labels, CATS = C.meta.cats;
    var PUB = M.public_ratio_med;
    var state = { lat: null, lon: null, r: 500, demo: true };
    var circle = null, mark = null, findR = null;

    function analyze(lat, lon, R) {
      var o = { R: R };
      var cs = C.cells.filter(function (c) { return hav(lat, lon, c[0], c[1]) <= R; });
      function sum(i) { return cs.reduce(function (t, c) { return t + c[i]; }, 0); }
      o.pop = sum(5); o.hh = sum(10);
      o.pop105 = sum(3); o.pop108 = sum(4); o.pc105 = sum(6); o.pc108 = sum(7);
      o.hh105 = sum(8); o.hh108 = sum(9); o.hc105 = sum(11); o.hc108 = sum(12);
      o.age = []; o.age08 = [];
      for (var j = 0; j < 8; j++) { o.age.push(sum(13 + j)); o.age08.push(sum(21 + j)); }
      var vw = {}; cs.forEach(function (c) { vw[c[2]] = (vw[c[2]] || 0) + c[5]; });
      o.vill = Object.keys(vw).map(function (k) { return { v: C.villages[k], w: vw[k] }; }).filter(function (x) { return x.w > 0; }).sort(function (a, b) { return b.w - a.w; });
      var tw = o.vill.reduce(function (t, x) { return t + x.w; }, 0);
      function wavg(key) { var n = 0, d = 0; o.vill.forEach(function (x) { if (x.v[key] !== null) { n += x.v[key] * x.w; d += x.w; } }); return d ? n / d : null; }
      o.inc = { tw: tw, med112: wavg('med112'), mean112: wavg('mean112'), med105: wavg('med105'), mean105: wavg('mean105') };
      // 捷運
      var best = null;
      C.mrt.forEach(function (m) { var d = hav(lat, lon, m.lat, m.lon); if (!best || d < best.d) best = { m: m, d: d }; });
      o.mrt = best;
      var mm = best.m, last = mm.m.length - 1, ly = mm.m[last], same = mm.m.indexOf('2019-' + ly.slice(5));
      o.mrtLast = { month: ly, v: mm.v[last], v19: same >= 0 ? mm.v[same] : null };
      // 公車（同站不同站位依站名去重）
      var names = {}, routes = {}, nstop = 0;
      C.bus.stops.forEach(function (s) { if (hav(lat, lon, s[0], s[1]) <= R) { nstop++; names[s[2]] = 1; s[4].forEach(function (r) { routes[r] = 1; }); } });
      o.bus = { stops: nstop, names: Object.keys(names).length, routes: Object.keys(routes).length };
      // 店家
      var bz = CATS.map(function () { return [0, 0, 0]; });
      C.biz.forEach(function (p) { if (hav(lat, lon, p[0], p[1]) <= R) for (var i = 2; i < p.length; i += 4) { var t = bz[p[i]]; t[0] += p[i + 1]; t[1] += p[i + 2]; t[2] += p[i + 3]; } });
      o.biz = bz;
      // 店面行情
      var sv = C.sales.filter(function (x) { return hav(lat, lon, x[0], x[1]) <= R; }).map(function (x) { return x[2]; });
      var rv = C.rents.filter(function (x) { return hav(lat, lon, x[0], x[1]) <= R; }).map(function (x) { return x[2]; });
      o.sale = { n: sv.length, med: median(sv) }; o.rent = { n: rv.length, med: median(rv) };
      var sv2 = UP.sales.filter(function (x) { return hav(lat, lon, x[0], x[1]) <= R; }).map(function (x) { return x[2]; });
      var rv2 = UP.rents.filter(function (x) { return hav(lat, lon, x[0], x[1]) <= R; }).map(function (x) { return x[2]; });
      o.sale2 = { n: sv2.length, med: median(sv2) }; o.rent2 = { n: rv2.length, med: median(rv2) };
      var ls = [], lr = [];
      D.l591.forEach(function (x) { if (hav(lat, lon, x.lat, x.lon) <= R && x.u) (x.t === 'sale' ? ls : lr).push(x.u); });
      o.l591s = { n: ls.length, med: median(ls) };
      o.l591r = { n: lr.length, med: median(lr) !== null ? median(lr) * (1 - PUB / 100) : null, raw: median(lr) };
      // 未來住戶
      var py = {}, ph = 0, pn = 0, pf = 0;
      D.pipe.forEach(function (p) { if (hav(lat, lon, p.lat, p.lon) <= R) { pn++; ph += p.hh || 0; var y = p.y || '不明'; py[y] = (py[y] || 0) + (p.hh || 0); if (p.gp === 'road' || p.gp === 'none') pf++; } });
      o.pipe = { n: pn, hh: ph, byYear: py, fuzzy: pf };
      return o;
    }

    var AGECOL = ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e3a8a'];
    function tag(n) { if (n === null || n === undefined || !isFinite(n)) return ''; var r = Math.round(n * 10) / 10; return '<span class="tag ' + (r > 0 ? 'up' : (r < 0 ? 'dn' : 'fl')) + '">' + pc(n) + '</span>'; }
    function rowT(k, v, t) { return '<div class="cp-row"><span class="k">' + k + '</span><span class="v">' + (t || '') + '<span>' + v + '</span></span></div>'; }
    function card(title, big, body) { return '<div class="cp-card"><h4><span>' + title + '</span><span class="big">' + big + '</span></h4>' + body + '</div>'; }
    function inRing(lat, lon, ring) { var c = false; for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) { var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) c = !c; } return c; }
    function inGeom(lat, lon, g) { var polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return polys.some(function (pl) { return inRing(lat, lon, pl[0]); }); }
    function where(lat, lon) {
      var a = null, v = null;
      areasLayer.eachLayer(function (l) { var id = l.feature.properties.id; if (!a && /^LK/.test(id) && inGeom(lat, lon, l.feature.geometry)) a = D.summary.rows[id] ? D.summary.rows[id].name : id; });
      D.villGeo.features.forEach(function (f) { if (!v && inGeom(lat, lon, f.geometry)) v = f.properties.village; });
      return { area: a, vill: v };
    }

    function render(o, w) {
      var h = '', A = o.age.reduce(function (t, x) { return t + x; }, 0), A8 = o.age08.reduce(function (t, x) { return t + x; }, 0);
      h += '<div class="cp-ctx">' + (state.demo ? '示範位置' : '你點選的位置') + '：<b>' + (w.area ? esc(w.area) + '商圈' : '商圈範圍外') + '</b>' + (w.vill ? '・' + esc(w.vill) : '') + '<br>分析半徑 <b>' + fmt(o.R) + ' 公尺</b></div>';
      // 1 住戶
      var b = '';
      if (!o.pop) { b = '<div class="cp-note">這個範圍內沒有住戶資料。</div>'; }
      else {
        b += rowT('戶數（2025 年底）', fmt(o.hh) + ' 戶');
        b += rowT('人口比 2016 年底', '', o.pop105 ? tag((o.pc105 / o.pop105 - 1) * 100) : '—') + rowT('人口比 2019 年底', '', o.pop108 ? tag((o.pc108 / o.pop108 - 1) * 100) : '—');
        b += rowT('戶數比 2016 年底', '', o.hh105 ? tag((o.hc105 / o.hh105 - 1) * 100) : '—') + rowT('戶數比 2019 年底', '', o.hh108 ? tag((o.hc108 / o.hh108 - 1) * 100) : '—');
        var cv105 = o.pc105 / o.pop * 100, cv108 = o.pc108 / o.pop * 100;
        if (cv105 < 99.5 || cv108 < 99.5) b += '<div class="cp-note">增減只比較兩期都有資料的統計區：2016 年底比較涵蓋現有人口的 ' + fmt(cv105) + '%，2019 年底涵蓋 ' + fmt(cv108) + '%。</div>';
        b += '<div style="margin:6px 0 2px;font-weight:600">年齡結構（2025 年底，括號為 2019 年底占比）</div>';
        var mx = Math.max.apply(null, o.age.map(function (x) { return x / A; }));
        o.age.forEach(function (x, i) {
          var wd = A ? x / A * 100 : 0;
          b += '<div class="cp-bar"><span>' + (i === 7 ? '70 歲以上' : AGEL[i] + ' 歲') + '</span><span class="bg"><span class="fg" style="display:block;--c:' + AGECOL[i] + ';width:' + (mx ? wd / (mx * 100) * 100 : 0).toFixed(1) + '%"></span></span><span class="v">' + wd.toFixed(1) + '%' + (A8 ? '（' + (o.age08[i] / A8 * 100).toFixed(0) + '%）' : '') + '</span></div>';
        });
      }
      h += card('1 住戶・人口（2025 年底）', o.pop ? fmt(o.pop) + ' 人' : '—', b);
      // 2 所得
      function man(v) { return v === null ? '—' : fmt(v / 10, 1) + ' 萬元'; }
      b = '';
      if (!o.inc.tw) b = '<div class="cp-note">這個範圍內沒有住戶資料，無法加權。</div>';
      else {
        b += rowT('112 年度平均數', man(o.inc.mean112));
        b += rowT('中位數比 105 年度', '', o.inc.med105 ? tag((o.inc.med112 / o.inc.med105 - 1) * 100) : '—') + rowT('平均數比 105 年度', '', o.inc.mean105 ? tag((o.inc.mean112 / o.inc.mean105 - 1) * 100) : '—');
        b += '<div class="cp-note">涵蓋 ' + o.vill.slice(0, 4).map(function (x) { return esc(x.v.n) + ' ' + Math.round(x.w / o.inc.tw * 100) + '%'; }).join('、') + (o.vill.length > 4 ? ' 等 ' + o.vill.length + ' 里' : '') + '。依人口加權，每個納稅單位，單位為萬元。</div>';
      }
      h += card('2 所得・112 年度中位數', o.inc.tw ? man(o.inc.med112) : '—', b);
      // 3 人流
      var m = o.mrt.m;
      b = rowT('直線距離', fmt(o.mrt.d) + ' 公尺');
      b += rowT('日均運量（' + o.mrtLast.month + '）', fmt(o.mrtLast.v) + ' 人次') + rowT('比 2019 年同月', '', o.mrtLast.v19 ? tag((o.mrtLast.v / o.mrtLast.v19 - 1) * 100) : '—');
      var vs = m.v, mn = Math.min.apply(null, vs), mxv = Math.max.apply(null, vs), W = 300, Hh = 36;
      var pts = vs.map(function (v, i) { return (i / (vs.length - 1) * W).toFixed(1) + ',' + (Hh - 3 - (v - mn) / ((mxv - mn) || 1) * (Hh - 6)).toFixed(1); }).join(' ');
      b += '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="100%" height="' + Hh + '" preserveAspectRatio="none" role="img" aria-label="捷運日均運量走勢"><polyline fill="none" stroke="#2563eb" stroke-width="1.5" points="' + pts + '"/></svg>';
      b += '<div class="cp-note">走勢為 ' + m.m[0] + ' 至 ' + o.mrtLast.month + ' 逐月日均運量。</div>';
      b += rowT('公車站（依站名去重）', fmt(o.bus.names) + ' 站') + rowT('經過的路線', fmt(o.bus.routes) + ' 條');
      h += card('3 人流替代指標・最近捷運站', m.code + ' ' + esc(m.n) + '站', b);
      // 4 店家
      var tt = [0, 0, 0], rows4 = '';
      o.biz.forEach(function (x, i) { tt[0] += x[0]; tt[1] += x[1]; tt[2] += x[2]; rows4 += '<tr><td>' + (CATS[i] === '其他' ? '辦公與其他' : CATS[i]) + '</td><td>' + fmt(x[0]) + '</td><td>' + fmt(x[1]) + '</td><td>' + fmt(x[2]) + '</td></tr>'; });
      b = '<div style="overflow-x:auto"><table class="cp-t"><thead><tr><th>類別</th><th>營業中</th><th>2021～2025 新設</th><th>關閉</th></tr></thead><tbody>' + rows4 +
        '<tr><td><b>合計</b></td><td><b>' + fmt(tt[0]) + '</b></td><td><b>' + fmt(tt[1]) + '</b></td><td><b>' + fmt(tt[2]) + '</b></td></tr></tbody></table></div><div class="cp-note">依登記地址統計，家數不等於實際開店數。「辦公與其他」多是登記在住家或辦公室的公司，不一定開在店面。</div>';
      h += card('4 店家・營業中', fmt(tt[0]) + ' 家', b);
      // 5 行情
      function few(n) { return n < 5 ? '，樣本少' : ''; }
      b = rowT('一樓成交中位數', o.sale.n ? fmt(o.sale.med, 1) + ' 萬／坪（' + o.sale.n + ' 筆' + few(o.sale.n) + '）' : '–（0 筆）');
      b += rowT('一樓租金中位數', o.rent.n ? fmt(o.rent.med) + ' 元／坪／月（' + o.rent.n + ' 筆' + few(o.rent.n) + '）' : '–（0 筆）');
      b += rowT('二到四樓成交中位數', o.sale2.n ? fmt(o.sale2.med, 1) + ' 萬／坪（' + o.sale2.n + ' 筆' + few(o.sale2.n) + '）' : '–（0 筆）');
      b += rowT('二到四樓租金中位數', o.rent2.n ? fmt(o.rent2.med) + ' 元／坪／月（' + o.rent2.n + ' 筆' + few(o.rent2.n) + '）' : '–（0 筆）');
      b += '<div class="cp-note">成交、租金中位數都是 2023 年以來；二到四樓指登記為辦公或商業用途的 2～4 樓，不含 5 樓以上。</div>';
      b += rowT('591 一樓出售掛牌', o.l591s.n ? fmt(o.l591s.med, 1) + ' 萬／坪（' + o.l591s.n + ' 筆' + few(o.l591s.n) + '）' : '無掛牌');
      b += rowT('591 一樓出租掛牌', o.l591r.n ? fmt(o.l591r.med) + ' 元／坪／月（' + o.l591r.n + ' 筆' + few(o.l591r.n) + '）' : '無掛牌');
      b += '<div class="cp-note">591 的出租坪數是使用坪數，已用一樓出售物件的公設比中位數 ' + fmt(PUB) + '% 換算成含公設口徑（原始開價中位數' + (o.l591r.raw ? ' ' + fmt(o.l591r.raw) + ' 元' : '無') + '），才能跟實價登錄的租金比。成交與租金座標取自大樓，有些只對到路段。</div>';
      h += card('5 店面行情・一樓成交中位數', o.sale.n ? fmt(o.sale.med, 1) + ' 萬／坪' : '無成交', b);
      // 6 未來住戶
      b = '';
      if (!o.pipe.n) b = '<div class="cp-note">範圍內沒有還沒完工的建案。</div>';
      else {
        b += rowT('未完工建案', o.pipe.n + ' 案');
        Object.keys(o.pipe.byYear).sort().forEach(function (y) { b += rowT('預計 ' + y + ' 年完工', o.pipe.byYear[y] ? fmt(o.pipe.byYear[y]) + ' 戶' : '戶數不明'); });
        b += '<div class="cp-note">預計完工年是用建照年加 4 年推的，不是建商公告。' + (o.pipe.fuzzy ? '其中 ' + o.pipe.fuzzy + ' 案只對到路名，位置不準。' : '') + '</div>';
      }
      h += card('6 未來住戶・未完工', fmt(o.pipe.hh) + ' 戶', b);
      document.getElementById('catchPanel').innerHTML = h;
    }

    function update() {
      if (state.lat === null) return;
      if (circle) map.removeLayer(circle);
      if (mark) map.removeLayer(mark);
      if (!findR) findR = L.svg({ pane: 'pFind' });
      circle = L.circle([state.lat, state.lon], { pane: 'pFind', renderer: findR, radius: state.r, color: '#9a3412', weight: 3, dashArray: '7 5', fillColor: '#f59e0b', fillOpacity: 0.14, interactive: false }).addTo(map);
      mark = L.circleMarker([state.lat, state.lon], { pane: 'pFind', renderer: findR, radius: 7, color: '#fff', weight: 2.5, fillColor: '#9a3412', fillOpacity: 1, interactive: false }).addTo(map);
      document.getElementById('centerLabel').textContent = state.demo ? '示範位置（中段商圈），點地圖換位置' : '中心：' + state.lat.toFixed(5) + ', ' + state.lon.toFixed(5) + '（點地圖或在彈出視窗按「以這裡為中心分析」換位置）';
      Array.prototype.forEach.call(document.querySelectorAll('#radiusBar button'), function (b) { b.classList.toggle('on', +b.getAttribute('data-r') === state.r); });
      render(analyze(state.lat, state.lon, state.r), where(state.lat, state.lon));
    }
    function setCenter(lat, lon, demo) { state.lat = lat; state.lon = lon; state.demo = !!demo; update(); }
    window.__finder = { set: function (la, lo) { setCenter(la, lo, false); }, radius: function (r) { state.r = r; update(); }, state: state };

    map.on('click', function (e) { setCenter(e.latlng.lat, e.latlng.lng, false); });
    map.on('popupopen', function (e) {
      var b = e.popup.getElement().querySelector('.pick-btn');
      if (b) b.addEventListener('click', function () { setCenter(parseFloat(b.getAttribute('data-lat')), parseFloat(b.getAttribute('data-lon')), false); map.closePopup(); });
    });
    document.getElementById('radiusBar').addEventListener('click', function (e) {
      var r = e.target.getAttribute && e.target.getAttribute('data-r'); if (!r) return; state.r = +r; update();
    });
    // 預設中心：中段商圈（LK02）多邊形的中心
    var c = null;
    areasLayer.eachLayer(function (l) { if (l.feature.properties.id === 'LK02') { var ring = l.feature.geometry.coordinates[0]; var cc = centroid(ring); c = [cc[1], cc[0]]; } });
    if (!c) c = [25.0785, 121.3745];
    setCenter(c[0], c[1], true);
  }

  /* ---------------- 啟動 ---------------- */
  Promise.all(['summary.json', 'charts.json', 'areas_geo.json', 'villages_geo.json', 'buildings.json', 'listings591.json', 'edu.json', 'schools.json', 'pipeline.json', 'catch.json', 'roads.json', 'bizmap.json', 'upper.json'].map(jget))
    .then(function (a) {
      var S = a[0], C = a[1];
      UP = a[12]; CH = C; ROAD1 = a[10]; SUM1 = S;
      buildTables(S);
      buildCalc();
      buildCharts(C);
      buildRoads(a[10], '1f');
      seg('supplySwitch', function (m) { drawFig1(m); buildRoads(ROAD1, m); });
      seg('yieldSwitch', setYieldMode);
      buildMap({ catchData: a[9], villGeo: a[3], summary: S, areas: a[2], vill: a[3], bld: a[4], l591: a[5], edu: a[6], sch: a[7], pipe: a[8], biz: a[11] });
    }).catch(function (e) { console.error('linkou load', e); });
})();
