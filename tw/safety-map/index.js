(function () {
  'use strict';
  var TW_BOUNDS = [[21.85, 119.35], [25.35, 122.05]];
  var THEFT = { '住宅竊盜': 1, '汽車竊盜': 1, '機車竊盜': 1 };

  Promise.all([
    SM.load(['towns', 'crime_town', 'crime_national', 'drug', 'pop_county', 'news2026', 'county_drug']),
    fetch('data/towns.topo.json').then(function (r) { return r.json(); })
  ]).then(function (res) {
    var D = res[0], topo = res[1];
    var townGeo = topojson.feature(topo, topo.objects.towns);
    var countyGeo = topojson.feature(topo, topo.objects.counties);
    initTabs();
    initCrime(D, townGeo);
    var drugReady = false;
    document.getElementById('btn-drug').addEventListener('click', function () {
      if (!drugReady) { drugReady = true; setTimeout(function () { initDrug(D, countyGeo); }, 0); }
    });
    if (location.hash === '#drug') document.getElementById('btn-drug').click();
  });

  function initTabs() {
    var btns = document.querySelectorAll('.tabs button');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.toggle('on', x === b); });
        document.getElementById('tab-crime').hidden = b.dataset.tab !== 'crime';
        document.getElementById('tab-drug').hidden = b.dataset.tab !== 'drug';
        history.replaceState(null, '', b.dataset.tab === 'drug' ? '#drug' : '#');
        window.dispatchEvent(new Event('resize'));
      });
    });
  }

  /* ---------------- 治安 ---------------- */
  function initCrime(D, townGeo) {
    var selType = document.getElementById('c-type'), selPer = document.getElementById('c-period');
    SM.TYPES.forEach(function (t) { selType.add(new Option(t, t)); });
    SM.PERIODS.forEach(function (p) { selPer.add(new Option(p.label, p.key)); });
    var state = { type: '住宅竊盜', period: SM.PERIODS[0] };
    var stats, lockCode = null;
    var map = SM.baseMap('map-crime');
    map.fitBounds(TW_BOUNDS);
    SM.legend(map, SM.relLegendHtml('跟同縣市平均比'));

    var layer = L.geoJSON(townGeo, {
      style: style,
      onEachFeature: function (f, l) {
        var code = f.properties.TOWNCODE;
        l.on('mouseover', function () { l.setStyle({ weight: 2, color: '#1e3a5f' }); if (!lockCode) panel(code); });
        l.on('mouseout', function () { layer.resetStyle(l); });
        l.on('click', function () { lockCode = code; panel(code); });
      }
    }).addTo(map);

    function style(f) {
      var code = f.properties.TOWNCODE, t = D.towns[code], s = stats && t && stats.town[code];
      return { fillColor: s ? SM.relColor(s.rate, stats.county[t.county].rate, s.n) : SM.ZERO, fillOpacity: 0.8, weight: 0.5, color: '#ffffff' };
    }
    function recompute() {
      stats = SM.townStats(D.towns, D.crime_town, state.type, state.period.years);
      layer.setStyle(style);
      panel(lockCode);
      trend();
      points();
    }
    function panel(code) {
      var el = document.getElementById('c-panel');
      if (!code) {
        var nat = stats.nation;
        el.innerHTML = '<div class="muted">全國・' + state.period.label + '</div><h3>' + state.type + '</h3>' +
          '<div class="big">' + SM.fmt(nat.n) + ' 件</div><div>每十萬人每年 ' + SM.fmtRate(nat.rate) + ' 件</div>' +
          '<div class="muted" style="margin-top:8px">滑過或點一下鄉鎮，這裡會顯示該鄉鎮的數字。</div>';
        return;
      }
      var t = D.towns[code], s = stats.town[code], c = stats.county[t.county];
      var cmp = SM.compare(s.rate, c.rate, s.n), cmpN = SM.compare(s.rate, stats.nation.rate, s.n);
      el.innerHTML = '<div class="muted">' + t.county + '・戶籍人口 ' + SM.fmt(t.pop) + ' 人</div><h3>' + t.town + '</h3>' +
        '<div class="muted">' + state.type + '・' + state.period.label + '</div>' +
        '<div class="big">' + SM.fmt(s.n) + ' 件</div>' +
        '<table><tr><td>每十萬人每年</td><td class="r">' + SM.fmtRate(s.rate) + '</td></tr>' +
        '<tr><td>' + t.county + '平均</td><td class="r">' + SM.fmtRate(c.rate) + '</td></tr>' +
        '<tr><td>全國平均</td><td class="r">' + SM.fmtRate(stats.nation.rate) + '</td></tr>' +
        '<tr><td>跟縣市比</td><td class="r ' + cmp.cls + '">' + cmp.txt + '</td></tr>' +
        '<tr><td>跟全國比</td><td class="r ' + cmpN.cls + '">' + cmpN.txt + '</td></tr></table>' +
        '<a class="go" href="town.html?code=' + code + '">看' + t.town + '七類案件與十年趨勢 →</a>';
    }

    var chart = echarts.init(document.getElementById('c-trend'));
    window.addEventListener('resize', function () { chart.resize(); });
    function trend() {
      var s = D.crime_national[state.type] || {};
      document.getElementById('c-trend-title').textContent = '全國' + state.type + '件數，2015 年到 2026 年 9 月';
      chart.setOption({
        grid: { left: 56, right: 16, top: 24, bottom: 32 },
        tooltip: { trigger: 'axis', formatter: function (p) { var y = p[0].name; return y + (y === '2026' ? '（1～9 月）' : '') + '<br>' + SM.fmt(p[0].value) + ' 件'; } },
        xAxis: { type: 'category', data: SM.YEARS.map(String) },
        yAxis: { type: 'value' },
        series: [{
          type: 'bar', barMaxWidth: 34,
          data: SM.YEARS.map(function (y) { return { value: s[y] || 0, itemStyle: { color: y === 2026 ? '#cbd5e1' : '#d9592a' } }; }),
          markArea: { silent: true, data: SM.BAD_AREA },
          markLine: { silent: true, symbol: 'none', lineStyle: { color: '#1e3a5f', type: 'dashed' }, label: { formatter: '2024-09 改算法', color: '#1e3a5f', fontSize: 11 }, data: [{ xAxis: '2024' }] }
        }]
      }, true);
    }

    /* 桃園竊盜點位（只有竊盜三類有） */
    var ptsLayer = L.layerGroup().addTo(map), ptsData = null;
    var ty = document.getElementById('c-ty');
    ty.addEventListener('change', function () {
      if (ty.checked && !ptsData) {
        fetch('data/taoyuan_points.json').then(function (r) { return r.json(); }).then(function (d) { ptsData = d; points(); map.fitBounds([[24.6, 120.95], [25.13, 121.47]]); });
      } else { points(); if (ty.checked) map.fitBounds([[24.6, 120.95], [25.13, 121.47]]); }
    });
    function points() {
      ptsLayer.clearLayers();
      if (!ty.checked || !ptsData) return;
      if (!THEFT[state.type]) return;
      var yrs = {}; state.period.years.forEach(function (y) { yrs[y] = 1; });
      var n = 0;
      ptsData.forEach(function (p) {
        if (p[0] !== state.type || !yrs[p[1]]) return;
        n++;
        L.circleMarker([p[2], p[3]], { radius: 2.2, weight: 0, fillColor: '#1e3a5f', fillOpacity: 0.5 }).addTo(ptsLayer);
      });
      ptsLayer.eachLayer(function () {});
    }

    selType.addEventListener('change', function () { state.type = selType.value; recompute(); });
    selPer.addEventListener('change', function () { state.period = SM.PERIODS.filter(function (p) { return p.key === selPer.value; })[0]; recompute(); });
    recompute();
  }

  /* ---------------- 毒駕 ---------------- */
  function initDrug(D, countyGeo) {
    var dr = D.drug, popC = D.pop_county;
    var years = Object.keys(dr.citations_county['臺北市']);
    var selY = document.getElementById('d-year'), selE = document.getElementById('d-ev');
    years.slice().reverse().forEach(function (y) { selY.add(new Option(y + ' 年每十萬人取締', y)); });
    selE.add(new Option('全部（2018～2025）', 'all'));
    for (var y = 2025; y >= 2018; y--) selE.add(new Option(y + ' 年', String(y)));
    selE.add(new Option('不顯示', 'none'));
    var state = { year: years[years.length - 1], ev: 'all' };
    var map = SM.baseMap('map-drug');
    map.fitBounds(TW_BOUNDS);
    var br = [], leg;
    function rate(cty, y) { var n = (dr.citations_county[cty] || {})[y]; return n == null ? null : n / popC[cty] * 1e5; }
    var layer = L.geoJSON(countyGeo, {
      style: function (f) { return { fillColor: SM.colorFor(rate(SM.norm(f.properties.COUNTYNAME), state.year), br), fillOpacity: 0.75, weight: 1, color: '#fff' }; },
      onEachFeature: function (f, l) {
        var cty = SM.norm(f.properties.COUNTYNAME);
        l.on('mouseover', function () { l.setStyle({ weight: 2.5, color: '#1e3a5f' }); countyPanel(cty); hiRow(cty); });
        l.on('mouseout', function () { layer.resetStyle(l); });
      }
    }).addTo(map);
    var evLayer = L.layerGroup().addTo(map);

    function recolor() {
      br = SM.breaks(Object.keys(popC).map(function (c) { return rate(c, state.year) || 0; }));
      layer.setStyle(function (f) { return { fillColor: SM.colorFor(rate(SM.norm(f.properties.COUNTYNAME), state.year), br), fillOpacity: 0.75, weight: 1, color: '#fff' }; });
      if (leg) map.removeControl(leg);
      leg = SM.legend(map, SM.legendHtml(state.year + ' 年每十萬人取締', br, function (x) { return SM.fmtRate(x); }));
    }
    function drawEvents() {
      evLayer.clearLayers();
      if (state.ev === 'none') return;
      dr.events.forEach(function (e) {
        if (state.ev !== 'all' && e.date.slice(0, 4) !== state.ev) return;
        var dead = e.cls === 'A1';
        L.circleMarker([e.lat, e.lon], { radius: dead ? 7 : 5, weight: 1, color: '#fff', fillColor: dead ? '#7f1d1d' : '#f97316', fillOpacity: 0.9 })
          .bindPopup('<b>' + e.date + ' ' + e.time + '</b><br>' + e.county + e.town + '<br>' + e.addr + '<br>' +
            (dead ? '24 小時內有人死亡' : '有人受傷') + '：死亡 ' + (e.dead || 0) + ' 人、受傷 ' + (e.inj || 0) + ' 人<br>' +
            '<a href="town.html?code=' + e.towncode + '">看' + e.town + ' →</a>')
          .addTo(evLayer);
      });
    }
    function countyPanel(cty) {
      var c = dr.citations_county[cty] || {}, ev = dr.events.filter(function (e) { return e.county === cty; });
      var rows = years.map(function (y) { return '<tr><td>' + y + '</td><td class="r">' + SM.fmt(c[y] || 0) + '</td><td class="r">' + SM.fmtRate(rate(cty, y)) + '</td></tr>'; }).join('');
      document.getElementById('d-panel').innerHTML = '<div class="muted">戶籍人口 ' + SM.fmt(popC[cty]) + ' 人</div><h3>' + cty + '</h3>' +
        '<table><tr><td class="muted">年</td><td class="r muted">取締件數</td><td class="r muted">每十萬人</td></tr>' + rows + '</table>' +
        '<div style="margin-top:8px">毒駕事故 2018～2025：<b>' + ev.length + '</b> 件，其中有人死亡 ' + ev.filter(function (e) { return e.cls === 'A1'; }).length + ' 件</div>';
    }
    selY.addEventListener('change', function () { state.year = selY.value; recolor(); });
    selE.addEventListener('change', function () { state.ev = selE.value; drawEvents(); });
    recolor(); drawEvents();

    /* 全國取締 */
    var c1 = echarts.init(document.getElementById('d-cit'));
    var cn = dr.citations_national;
    var mk = function (x, t) { return { xAxis: x, label: { formatter: t, color: '#1e3a5f', fontWeight: 700 } }; };
    c1.setOption({
      grid: { left: 56, right: 16, top: 28, bottom: 32 },
      tooltip: { trigger: 'axis', formatter: function (p) { return p[0].name + (p[0].name === '2013' ? '（7～12 月）' : '') + '<br>' + SM.fmt(p[0].value) + ' 件'; } },
      xAxis: { type: 'category', data: cn.map(function (r) { return String(r.year); }) },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', barMaxWidth: 34, data: cn.map(function (r) { return { value: r.n, itemStyle: { color: r.year === 2013 ? '#cbd5e1' : '#a83a14' } }; }),
        markLine: { silent: true, symbol: 'none', lineStyle: { color: '#1e3a5f', type: 'dashed' }, data: [mk('2023', '①'), mk('2024', '②'), mk('2025', '③')] } }]
    });

    /* 縣市表 */
    var order = Object.keys(dr.citations_county).filter(function (c) { return popC[c]; })
      .sort(function (a, b) { return dr.citations_county[b][years[years.length - 1]] - dr.citations_county[a][years[years.length - 1]]; });
    var last = years[years.length - 1];
    var head = '<tr><th>縣市</th>' + years.map(function (y) { return '<th class="r">' + y + '</th>'; }).join('') + '<th class="r">' + last + ' 每十萬人</th></tr>';
    var body = order.map(function (c) {
      var row = dr.citations_county[c], mx = Math.max.apply(null, years.map(function (y) { return row[y]; })) || 1;
      return '<tr data-c="' + c + '"><td>' + c + '</td>' + years.map(function (y) {
        var a = row[y] / mx; return '<td class="r" style="background:rgba(217,89,42,' + (a * 0.55).toFixed(2) + ')">' + SM.fmt(row[y]) + '</td>';
      }).join('') + '<td class="r"><b>' + SM.fmtRate(rate(c, last)) + '</b></td></tr>';
    }).join('');
    document.getElementById('d-table').innerHTML = head + body;
    function hiRow(c) { document.querySelectorAll('#d-table tr').forEach(function (tr) { tr.classList.toggle('sel', tr.dataset.c === c); }); }

    /* 2026 年新聞數字 */
    var md = function (s) { return +s.slice(5, 7) + '/' + +s.slice(8, 10); };
    var nw = D.news2026;
    document.getElementById('d-news').innerHTML = '<tr><th>地區</th><th>期間（2026 年）</th><th>用詞</th><th class="r">件數</th><th class="r">去年同期</th><th>出處</th></tr>' +
      nw.rows.map(function (r) {
        return '<tr><td>' + r.area + (r.dagger ? '†' : '') + '</td><td>' + md(r.start) + '～' + md(r.end) + (r.end_is_pub ? '＊' : '') + '</td><td>' + r.metric + '</td><td class="r"><b>' + SM.fmt(r.value) + '</b></td><td class="r">' +
          (r.cmp == null ? '—' : SM.fmt(r.cmp)) + '</td><td><a href="' + r.url + '" target="_blank" rel="noopener">' + r.outlet + '</a> ' + md(r.pub) + '</td></tr>';
      }).join('');
    document.getElementById('d-news-none').textContent = nw.none.join('、');
    document.getElementById('d-news-dagger').textContent = nw.rows.filter(function (r) { return r.dagger; }).map(function (r) { return '†' + r.dagger; }).join(' ');

    /* 縣市四項指標 */
    var cd = D.county_drug;
    var COLS = [['stu', '學生通報', '2022～24 年', 3, 1], ['pros', '檢察署施用被告', '2025 年', 1, 0], ['crash', '毒駕事故', '2018～25 年', 8, 2], ['cit', '毒駕舉發', '2025 年', 1, 0]];
    var cell = function (k, o) {
      var bg = SM.relColor(o.v, cd.nat[k[0]], o.n), dark = bg === '#a83a14' || bg === '#2f7d6d';
      var unit = k[0] === 'stu' ? '人' : k[0] === 'pros' ? '人' : '件';
      return '<td class="r" style="background:' + bg + (dark ? ';color:#fff' : '') + '" title="' + (k[3] > 1 ? k[3] + ' 年合計 ' : '') + SM.fmt(o.n) + ' ' + unit + '">' + o.v.toFixed(k[4]) + '</td>';
    };
    document.getElementById('d-county').innerHTML = '<tr><th>地區</th>' + COLS.map(function (k) { return '<th class="r">' + k[1] + '<br><span style="font-weight:400">' + k[2] + '</span></th>'; }).join('') + '</tr>' +
      '<tr><td><b>全國</b></td>' + COLS.map(function (k) { return '<td class="r"><b>' + cd.nat[k[0]].toFixed(k[4]) + '</b></td>'; }).join('') + '</tr>' +
      cd.rows.map(function (r) { return '<tr><td>' + r.g + '</td>' + COLS.map(function (k) { return cell(k, r[k[0]]); }).join('') + '</tr>'; }).join('');
    document.getElementById('d-county-legend').innerHTML = SM.relLegendHtml('跟全國平均比');

    /* 事故 */
    var c2 = echarts.init(document.getElementById('d-crash'));
    var ys = Object.keys(dr.crash_by_year);
    var a1 = ys.map(function (y) { return dr.events.filter(function (e) { return e.cls === 'A1' && e.date.slice(0, 4) === y; }).length; });
    var a2 = ys.map(function (y, i) { return dr.crash_by_year[y] - a1[i]; });
    c2.setOption({
      grid: { left: 48, right: 56, top: 36, bottom: 32 },
      legend: { top: 4, textStyle: { color: '#1e3a5f' } },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ys },
      yAxis: [{ type: 'value', name: '毒駕（件）', nameTextStyle: { color: '#4a6080' } }, { type: 'value', name: '酒駕（件）', nameTextStyle: { color: '#4a6080' }, splitLine: { show: false } }],
      series: [
        { name: '毒駕事故・有人死亡', type: 'bar', stack: 'd', data: a1, itemStyle: { color: '#7f1d1d' }, barMaxWidth: 34 },
        { name: '毒駕事故・有人受傷', type: 'bar', stack: 'd', data: a2, itemStyle: { color: '#f97316' }, barMaxWidth: 34 },
        { name: '酒駕事故（右軸）', type: 'line', yAxisIndex: 1, data: ys.map(function (y) { return dr.alcohol_by_year[y]; }), itemStyle: { color: '#64748b' }, lineStyle: { width: 2 } }
      ]
    });
    window.addEventListener('resize', function () { c1.resize(); c2.resize(); map.invalidateSize(); });

    /* 最近事故 */
    var rec = dr.events.slice(-12).reverse();
    document.getElementById('d-recent').innerHTML = '<tr><th>日期</th><th>時間</th><th>地點</th><th>結果</th></tr>' + rec.map(function (e) {
      return '<tr><td>' + e.date + '</td><td>' + e.time + '</td><td><a href="town.html?code=' + e.towncode + '">' + e.county + e.town + '</a></td><td>' +
        (e.cls === 'A1' ? '死亡 ' + (e.dead || 0) + ' 人' : '受傷 ' + (e.inj || 0) + ' 人') + '</td></tr>';
    }).join('');
  }
})();
