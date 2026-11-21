(function () {
  'use strict';
  var code = new URLSearchParams(location.search).get('code') || '68000020';
  var YRS = [2023, 2024, 2025];

  Promise.all([
    SM.load(['towns', 'crime_town', 'drug']),
    fetch('data/towns.topo.json').then(function (r) { return r.json(); })
  ]).then(function (res) {
    var D = res[0], topo = res[1];
    var T = D.towns[code];
    if (!T) { document.getElementById('t-title').textContent = '找不到這個鄉鎮代號'; return; }
    var all = {};
    SM.TYPES.forEach(function (ty) { all[ty] = SM.townStats(D.towns, D.crime_town, ty, YRS); });
    document.title = T.county + T.town + '治安｜台灣治安與毒駕地圖';
    document.getElementById('t-eyebrow').textContent = T.county;
    document.getElementById('t-title').textContent = T.county + T.town + '治安';

    /* 開頭：挑出比縣市高最多、低最多的案類（件數要 ≥ 10） */
    var cmp = SM.TYPES.map(function (ty) {
      var s = all[ty].town[code], c = all[ty].county[T.county];
      return { ty: ty, n: s.n, rate: s.rate, ref: c.rate, d: s.n >= 10 ? s.rate / c.rate - 1 : null };
    });
    var ok = cmp.filter(function (x) { return x.d != null && x.ty !== '毒品'; }).sort(function (a, b) { return b.d - a.d; });
    var lead = T.town + '戶籍人口 ' + SM.fmt(T.pop) + ' 人。';
    if (ok.length) {
      var hi = ok[0], lo = ok[ok.length - 1];
      var pre = '2023～2025 年';
      if (hi.d > 0.1) { lead += pre + hi.ty + '每十萬人每年 ' + SM.fmtRate(hi.rate) + ' 件，比' + T.county + '平均高 ' + Math.round(hi.d * 100) + '%。'; pre = ''; }
      if (lo.d < -0.1) lead += pre + lo.ty + '比縣市平均低 ' + Math.round(-lo.d * 100) + '%。';
      if (hi.d <= 0.1 && lo.d >= -0.1) lead += '竊盜、強盜等案件都跟縣市平均差不多。';
    } else {
      lead += '竊盜、強盜等案件三年都不到 10 件，不跟縣市比。';
    }
    document.getElementById('t-lead').textContent = lead;

    /* KPI：竊盜三類合計、暴力三類合計、毒駕事故 */
    function group(types) {
      var n = 0, cn = 0, cp = all[types[0]].county[T.county].pop;
      types.forEach(function (ty) { n += all[ty].town[code].n; cn += all[ty].county[T.county].n; });
      return { n: n, rate: n / 3 / T.pop * 1e5, ref: cn / 3 / cp * 1e5 };
    }
    var g1 = group(['住宅竊盜', '汽車竊盜', '機車竊盜']), g2 = group(['強盜', '搶奪', '強制性交']);
    var dev = D.drug.events.filter(function (e) { return e.towncode === code; });
    function kpi(k, v, s) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>'; }
    function tag(g) { var c = SM.compare(g.rate, g.ref, g.n); return '<span class="' + c.cls + '">跟縣市比：' + c.txt + '</span>'; }
    document.getElementById('t-kpis').innerHTML =
      kpi('竊盜（住宅、汽車、機車）', SM.fmt(g1.n) + ' 件', '每十萬人每年 ' + SM.fmtRate(g1.rate) + '・' + tag(g1)) +
      kpi('強盜、搶奪、強制性交', SM.fmt(g2.n) + ' 件', '每十萬人每年 ' + SM.fmtRate(g2.rate) + '・' + tag(g2)) +
      kpi('毒駕事故 2018～2025', dev.length + ' 件', '有人死亡 ' + dev.filter(function (e) { return e.cls === 'A1'; }).length + ' 件');

    /* 七類表 */
    document.getElementById('t-table').innerHTML = '<tr><th>案類</th><th class="r">三年件數</th><th class="r">每十萬人每年</th><th class="r">' + T.county + '平均</th><th class="r">全國平均</th><th class="r">跟縣市比</th></tr>' +
      cmp.map(function (x) {
        var c = SM.compare(x.rate, x.ref, x.n);
        return '<tr><td>' + x.ty + '</td><td class="r">' + SM.fmt(x.n) + '</td><td class="r">' + SM.fmtRate(x.rate) + '</td><td class="r">' + SM.fmtRate(x.ref) +
          '</td><td class="r">' + SM.fmtRate(all[x.ty].nation.rate) + '</td><td class="r ' + c.cls + '">' + c.txt + '</td></tr>';
      }).join('');

    /* 趨勢 */
    var sel = document.getElementById('t-type');
    SM.TYPES.forEach(function (t) { sel.add(new Option(t, t)); });
    var chart = echarts.init(document.getElementById('t-trend'));
    window.addEventListener('resize', function () { chart.resize(); });
    var cpop = 0, ccodes = Object.keys(D.towns).filter(function (c) { return D.towns[c].county === T.county; });
    ccodes.forEach(function (c) { cpop += D.towns[c].pop; });
    function trend() {
      var ty = sel.value, s = (D.crime_town[code] || {})[ty] || {};
      var cy = SM.YEARS.map(function (y) { var n = 0; ccodes.forEach(function (c) { n += ((D.crime_town[c] || {})[ty] || {})[y] || 0; }); return n; });
      chart.setOption({
        grid: { left: 48, right: 56, top: 36, bottom: 32 },
        legend: { top: 4, textStyle: { color: '#1e3a5f' } },
        tooltip: { trigger: 'axis', valueFormatter: function (v) { return typeof v === 'number' && v % 1 ? v.toFixed(2) : v; } },
        xAxis: { type: 'category', data: SM.YEARS.map(String) },
        yAxis: [{ type: 'value', name: '件數', minInterval: 1 }, { type: 'value', name: '每十萬人', splitLine: { show: false } }],
        series: [
          { name: T.town + '件數', type: 'bar', barMaxWidth: 30, itemStyle: { color: '#f08a4b' }, data: SM.YEARS.map(function (y) { return { value: s[y] || 0, itemStyle: { color: y === 2026 ? '#cbd5e1' : '#f08a4b' } }; }),
            markArea: { silent: true, data: SM.BAD_AREA } },
          { name: T.town + '每十萬人', type: 'line', yAxisIndex: 1, data: SM.YEARS.map(function (y) { return +((s[y] || 0) / T.pop * 1e5).toFixed(2); }), itemStyle: { color: '#a83a14' }, lineStyle: { width: 2.5 } },
          { name: T.county + '平均每十萬人', type: 'line', yAxisIndex: 1, data: SM.YEARS.map(function (y, i) { return +(cy[i] / cpop * 1e5).toFixed(2); }), itemStyle: { color: '#64748b' }, lineStyle: { width: 2, type: 'dashed' } }
        ]
      }, true);
    }
    sel.addEventListener('change', trend);
    trend();

    /* 地圖：本鄉鎮＋鄰近，毒駕事故點 */
    var geo = topojson.feature(topo, topo.objects.towns);
    var map = SM.baseMap('t-map');
    var nb = {}; T.nb.forEach(function (c) { nb[c] = 1; });
    var focus = null;
    L.geoJSON(geo, {
      filter: function (f) { var c = f.properties.TOWNCODE; return c === code || nb[c]; },
      style: function (f) { var me = f.properties.TOWNCODE === code; return { color: me ? '#c2410c' : '#334155', weight: me ? 3 : 1.5, dashArray: me ? null : '4 3', fillColor: me ? '#f08a4b' : '#94a3b8', fillOpacity: me ? 0.3 : 0.12 }; },
      onEachFeature: function (f, l) {
        var c = f.properties.TOWNCODE;
        if (c === code) focus = l;
        l.bindTooltip(SM.norm(f.properties.TOWNNAME));
        if (c !== code) l.on('click', function () { location.href = 'town.html?code=' + c; });
      }
    }).addTo(map);
    map.fitBounds(focus.getBounds(), { padding: [20, 20] });
    dev.forEach(function (e) {
      L.circleMarker([e.lat, e.lon], { radius: e.cls === 'A1' ? 7 : 5, weight: 1, color: '#fff', fillColor: e.cls === 'A1' ? '#7f1d1d' : '#f97316', fillOpacity: 0.9 })
        .bindPopup('<b>毒駕事故 ' + e.date + ' ' + e.time + '</b><br>' + e.addr).addTo(map);
    });
    document.getElementById('t-map-note').innerHTML = '<div><b>' + T.town + '</b>畫橘色框，鄰近鄉鎮畫灰色，點一下可以切過去。</div>' +
      '<div style="margin-top:6px">圓點是毒駕事故：深紅色 24 小時內有人死亡，橘色有人受傷。</div>' +
      '';

    /* 鄰近鄉鎮表 */
    var cols = ['住宅竊盜', '汽車竊盜', '機車竊盜', '強盜', '搶奪'];
    var rows = [code].concat(T.nb.filter(function (c) { return D.towns[c]; }));
    document.getElementById('t-nb').innerHTML = '<tr><th>鄉鎮</th><th class="r">戶籍人口</th>' + cols.map(function (c) { return '<th class="r">' + c + '</th>'; }).join('') + '</tr>' +
      rows.map(function (c) {
        var t = D.towns[c];
        var name = c === code ? '<b>' + t.county + t.town + '</b>' : '<a href="town.html?code=' + c + '">' + (t.county !== T.county ? t.county : '') + t.town + '</a>';
        return '<tr' + (c === code ? ' class="sel"' : '') + '><td>' + name + '</td><td class="r">' + SM.fmt(t.pop) + '</td>' +
          cols.map(function (ty) { return '<td class="r">' + SM.fmtRate(all[ty].town[c].rate) + '</td>'; }).join('') + '</tr>';
      }).join('');

    /* 毒駕事故清單 */
    document.getElementById('t-drug').innerHTML = dev.length ?
      '<div class="table-wrap"><table class="data"><tr><th>日期</th><th>時間</th><th>地點</th><th>結果</th></tr>' + dev.slice().reverse().map(function (e) {
        return '<tr><td>' + e.date + '</td><td>' + e.time + '</td><td>' + e.addr + '</td><td>' + (e.cls === 'A1' ? '死亡 ' + (e.dead || 0) + ' 人' : '受傷 ' + (e.inj || 0) + ' 人') + '</td></tr>';
      }).join('') + '</table></div><p class="chart-note">警方在現場判斷肇事原因是「吸食違禁物駕駛」的事故。</p>' :
      '<p class="prose">2018～2025 年沒有毒駕事故紀錄。全國這八年合計 264 件。</p>';
  });
})();
