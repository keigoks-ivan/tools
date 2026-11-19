/* 林口店面頁：「我要開某種店」（industry.html）與「看某個商圈」（area.html）。
   畫圖、表格、樣式函式都來自 linkou.js 匯出的 window.LK，這裡只放兩頁的組裝與互動。數字全部讀 data/*.json，不在這裡手打。 */
(function () {
  'use strict';
  var LK = window.LK, VIEW = document.body.getAttribute('data-view');
  if (!LK || (VIEW !== 'industry' && VIEW !== 'area')) return;
  var fmt = LK.fmt, esc = LK.esc, sgn = LK.sgn, COLORS = LK.COLORS, jget = LK.jget;
  var BIZCOL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
  var OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者';

  function q(id) { return document.getElementById(id); }
  function qs() { return new URLSearchParams(location.search); }
  function setUrl(params, push) {
    var u = '?' + params;
    try { (push ? history.pushState : history.replaceState).call(history, null, '', u); } catch (e) { /* 分享站或檔案開啟時可能不能改網址 */ }
  }
  function few(n) { return n < 5 ? '<span class="few">樣本少</span>' : ''; }
  function tileMap(id, wheel) {
    var map = L.map(id, { preferCanvas: true, scrollWheelZoom: !!wheel });
    L.tileLayer(OSM, { maxZoom: 19, referrerPolicy: 'strict-origin', attribution: ATTR }).addTo(map);
    return map;
  }
  /* 商圈範圍的內部點：重心在多邊形外（凹形）時，改用格點裡離重心最近的內部點 */
  function repPoint(g) {
    var polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates, ring = polys[0][0];
    polys.forEach(function (p) { if (p[0].length > ring.length) ring = p[0]; });
    var c = LK.centroid(ring), lat = c[1], lon = c[0];
    if (LK.inGeom(lat, lon, g)) return [lat, lon];
    var xs = ring.map(function (p) { return p[0]; }), ys = ring.map(function (p) { return p[1]; }), best = null;
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    for (var i = 0; i <= 40; i++) for (var j = 0; j <= 40; j++) {
      var x = x0 + (x1 - x0) * i / 40, y = y0 + (y1 - y0) * j / 40;
      if (!LK.inGeom(y, x, g)) continue;
      var d = Math.pow(x - lon, 2) + Math.pow(y - lat, 2);
      if (!best || d < best[0]) best = [d, y, x];
    }
    return best ? [best[1], best[2]] : [lat, lon];
  }

  /* ================= 我要開某種店 ================= */
  function bootIndustry() {
    Promise.all(['industry.json', 'summary.json', 'areas_geo.json', 'bizmap.json', 'edu.json'].map(jget)).then(function (a) {
      var IND = a[0], S = a[1], AREAS = a[2], BM = a[3], EDU = a[4], ids = IND.areas, G = {};
      IND.groups.forEach(function (g) { G[g.id] = g; });
      var st = { g: '餐飲', s: -1, m: 'rent' }, p0 = qs();
      if (G[p0.get('c')]) st.g = p0.get('c');
      var s0 = p0.get('s');
      if (s0 !== null && s0 !== 'all' && G[st.g].subs[+s0] && G[st.g].subs[+s0].total_n) st.s = +s0;
      if (p0.get('m') === 'buy') st.m = 'buy';

      /* 第一步：行業按鈕 */
      var h = '';
      IND.groups.forEach(function (g) {
        h += '<div class="ind-g"><div class="ind-gh">' + esc(g.id) + (g.kind === 'edu' ? '' : '') + '</div><div class="ind-bs" role="group" aria-label="' + esc(g.id) + '">' +
          '<button type="button" data-g="' + esc(g.id) + '" data-s="-1">' + (g.kind === 'edu' ? '補習班與安親班' : '整個' + esc(g.id) + '業') + '<span class="n">' + fmt(g.all.total_n) + '</span></button>' +
          g.subs.map(function (s, i) { return s.total_n ? '<button type="button" data-g="' + esc(g.id) + '" data-s="' + i + '">' + esc(s.name) + '<span class="n">' + fmt(s.total_n) + '</span></button>' : ''; }).join('') + '</div></div>';
      });
      q('indPick').innerHTML = h;

      /* 地圖 */
      var map = tileMap('indMap', false), shopLayer = L.layerGroup().addTo(map), labels = [];
      var areaLayer = L.geoJSON(AREAS, { style: function (f) { return LK.areaStyle(f, S.rows); } }).addTo(map);
      var bb = L.latLngBounds([]);
      areaLayer.eachLayer(function (l) {
        var id = l.feature.properties.id;
        if (ids.indexOf(id) >= 0) { bb.extend(l.getBounds()); l.bindTooltip(S.rows[id].name, { permanent: true, direction: 'center', className: 'area-lbl', interactive: false }); }
      });
      map.fitBounds(bb, { padding: [10, 10] });
      function dot(lat, lon, o) { o.bubblingMouseEvents = false; return L.circleMarker([lat, lon], o); }
      function go(lat, lon) { return '<br><a href="map.html?lat=' + lat + '&lon=' + lon + '&r=500">在全螢幕地圖分析這裡</a>'; }

      function draw(g, s) {
        shopLayer.clearLayers();
        var legend = '', n = 0;
        if (g.kind === 'edu') {
          if (s !== 1) EDU.cram.forEach(function (c) { n++; shopLayer.addLayer(dot(c.lat, c.lon, { radius: 4.5, color: '#fff', weight: 0.8, fillColor: '#7c3aed', fillOpacity: 0.9 }).bindPopup('<b>' + esc(c.n) + '</b><br>補習班' + (c.c ? '（' + esc(c.c) + '）' : '') + go(c.lat, c.lon))); });
          if (s !== 0) EDU.asc.forEach(function (c) { n++; shopLayer.addLayer(dot(c.lat, c.lon, { radius: 7, color: '#78350f', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.95 }).bindPopup('<b>' + esc(c.n) + '</b><br>課後照顧中心' + go(c.lat, c.lon))); });
          legend = (s !== 1 ? '<span class="sw" style="background:#7c3aed"></span>補習班 ' : '') + (s !== 0 ? '<span class="sw" style="background:#f59e0b"></span>課後照顧中心' : '');
          q('indMapNote').textContent = '補習班與課後照顧中心的位置來自教育部、新北市教育局名冊的門牌座標，沒有樓層資料，全部畫出。';
        } else {
          var subs = BM.subs[g.id], mine = 0;
          BM.pts[g.id].forEach(function (p) {
            if (p[5] !== 0 || (s >= 0 && p[2] !== s)) return;
            mine += p[3];
            shopLayer.addLayer(dot(p[0], p[1], { radius: Math.min(11, 3.5 + 1.6 * Math.sqrt(p[3] - 1)), color: '#fff', weight: 1, fillColor: BIZCOL[p[2]], fillOpacity: 0.85 })
              .bindPopup('<b>' + esc(subs[p[2]]) + '</b>（' + esc(g.id) + '）<br>樓層：' + esc(LK.FLOOR_ONE) + '<br>這個門牌營業中 ' + p[3] + ' 家<br>2021～2025 年新設 ' + p[4] + ' 家' + go(p[0], p[1])));
          });
          n = mine;
          legend = subs.map(function (nm, i) { return (s < 0 || s === i) && g.subs[i].total_n ? '<span class="lg"><span class="sw" style="background:' + BIZCOL[i] + '"></span>' + esc(nm) + '</span>' : ''; }).join('');
          q('indMapNote').textContent = '只畫營業中、門牌對得到的一樓群店家（圓點越大，同一門牌的家數越多）。只對到路段的 ' + fmt(g.unmapped) + ' 家（整個' + g.id + '業）沒有畫，表上有算。';
        }
        q('indLegend').innerHTML = legend;
        q('indMapCount').textContent = '地圖上 ' + fmt(n) + ' 家';
      }

      /* 結果 */
      function bars(vals, k, col) {
        var mx = Math.max.apply(null, vals.map(Math.abs)) || 1, v = vals[k];
        return '<i class="bar" style="width:' + (Math.abs(v) / mx * 100).toFixed(1) + '%;background:' + (v < 0 ? '#dc2626' : col) + '"></i>';
      }
      function render() {
        var g = G[st.g], p = st.s < 0 ? g.all : g.subs[st.s], edu = g.kind === 'edu', rows = S.rows;
        Array.prototype.forEach.call(document.querySelectorAll('#indPick button'), function (b) { b.classList.toggle('on', b.getAttribute('data-g') === st.g && +b.getAttribute('data-s') === st.s); });
        Array.prototype.forEach.call(document.querySelectorAll('#indM button'), function (b) { b.classList.toggle('on', b.getAttribute('data-m') === st.m); });
        var title = (st.s < 0 ? (edu ? '補習班與安親班' : '整個' + g.id + '業') : g.id + '・' + p.name);
        q('indTitle').textContent = title + '：六個商圈比較';
        var in6 = p.n.reduce(function (x, y) { return x + y; }, 0);
        q('indLead').innerHTML = edu
          ? '全林口立案 ' + fmt(p.total_n) + ' 家，在這六個商圈 ' + fmt(in6) + ' 家，其餘 ' + fmt(p.other_n) + ' 家在工業區、其他商圈或商圈外。'
          : '全林口一樓群營業中 ' + fmt(p.total_n) + ' 家，在這六個商圈 ' + fmt(in6) + ' 家，其餘 ' + fmt(p.other_n) + ' 家在工業區、其他商圈或商圈外。';

        var cols = [];   /* [表頭, 欄位值函式] */
        if (edu) {
          cols.push(['立案中的家數', function (k, j) { return '<b>' + fmt(p.n[j]) + '</b>' + bars(p.n, j, COLORS[k]); }]);
          cols.push(['每千位居民的家數', function (k, j) { return '<b>' + fmt(p.per1k[j], 2) + '</b>' + bars(p.per1k, j, COLORS[k]); }]);
          cols.push(['每 100 名 6～11 歲兒童', function (k, j) { return '<b>' + fmt(p.per100kids[j], 2) + '</b>' + bars(p.per100kids, j, COLORS[k]); }]);
          cols.push(['2021～2025 年新立案（名冊沒有關閉資料，不是淨增）', function (k, j) { return '<b>' + sgn(p.new[j]) + '</b>' + bars(p.new, j, COLORS[k]); }]);
        } else {
          cols.push(['營業中的同業家數（一樓群）', function (k, j) { return '<b>' + fmt(p.n[j]) + '</b>' + bars(p.n, j, COLORS[k]); }]);
          cols.push(['每千位居民的同業家數', function (k, j) { return '<b>' + fmt(p.per1k[j], 1) + '</b>' + bars(p.per1k, j, COLORS[k]); }]);
          cols.push(['2021～2025 年新設減關閉的淨增', function (k, j) { return '<b>' + sgn(p.net[j]) + '</b>' + bars(p.net, j, COLORS[k]) + '<small>新設 ' + fmt(p.new[j]) + '、關閉 ' + fmt(p.closed[j]) + '</small>'; }]);
        }
        if (st.m === 'rent') cols.push(['一樓店面月租中位數（元／坪，2023 年以來，括號筆數）', function (k) { var r = rows[k]; return '<b>' + fmt(r.rent_med) + '</b><small>（' + r.rent_n + ' 筆）' + few(r.rent_n) + '</small>'; }]);
        else {
          cols.push(['一樓店面成交中位數（萬／坪，2023 年以來，括號筆數）', function (k) { var r = rows[k]; return '<b>' + fmt(r.sale_med) + '</b><small>（' + r.sale_n + ' 筆）' + few(r.sale_n) + '</small>'; }]);
          cols.push(['毛報酬率', function (k) { var r = rows[k]; return '<b>' + fmt(r['yield'], 1) + '%</b>'; }]);
        }
        var t = '<div class="ind-r ind-h"><span>商圈</span>' + cols.map(function (c) { return '<span>' + c[0] + '</span>'; }).join('') + '</div>';
        ids.forEach(function (k, j) {
          t += '<div class="ind-r"><span class="ind-n"><span class="chip" style="background:' + COLORS[k] + '"></span>' + esc(IND.names[k]) + '</span>' +
            cols.map(function (c) { return '<span class="ind-c" data-l="' + esc(c[0]) + '">' + c[1](k, j) + '</span>'; }).join('') + '</div>';
        });
        var tot = p.n.reduce(function (x, y) { return x + y; }, 0), second = edu ? p.new.reduce(function (x, y) { return x + y; }, 0) : p.net.reduce(function (x, y) { return x + y; }, 0);
        t += '<div class="ind-r ind-f"><span class="ind-n">六個商圈合計</span><span class="ind-c" data-l="' + esc(cols[0][0]) + '"><b>' + fmt(tot) + '</b></span><span class="ind-c" data-l="' + esc(cols[1][0]) + '"></span>' +
          (edu ? '<span class="ind-c" data-l="' + esc(cols[2][0]) + '"></span>' : '') +
          '<span class="ind-c" data-l="' + esc(cols[edu ? 3 : 2][0]) + '"><b>' + sgn(second) + '</b></span>' + '<span class="ind-c ind-x"></span>'.repeat(st.m === 'rent' ? 1 : 2) + '</div>';
        var el = q('indTbl'); el.style.setProperty('--nc', cols.length); el.innerHTML = t;
        q('indPriceNote').textContent = st.m === 'rent'
          ? '租金是實價登錄一樓店面 2023 年以來的月租中位數，不分行業，跟報告「價格：買還是租」同一份數字。租賃只有經過仲介或代管的案子必須登錄，屋主自己出租的通常不在裡面。'
          : '成交與毛報酬率是實價登錄一樓店面 2023 年以來的數字，不分行業，跟報告「價格：買還是租」同一份。毛報酬率用同棟或同路段、時間相近的成交與租賃配對算出。';
        draw(g, st.s);
        setUrl('c=' + encodeURIComponent(st.g) + '&s=' + (st.s < 0 ? 'all' : st.s) + '&m=' + st.m);
        document.title = '林口店面選址・我要開某種店：' + title;
      }
      q('indPick').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-g]'); if (!b) return;
        st.g = b.getAttribute('data-g'); st.s = +b.getAttribute('data-s'); render();
      });
      q('indM').addEventListener('click', function (e) { var b = e.target.closest('button[data-m]'); if (!b) return; st.m = b.getAttribute('data-m'); render(); });

      /* 口徑核對：店面型商家淨增 */
      var rc = '<table class="dt"><thead><tr><th>商圈</th><th>四個業態，一樓群</th><th>四個業態，二樓以上</th><th>補習與教育</th><th>醫療診所</th><th>辦公與其他（仲介、銀行分行等）</th><th>合計</th></tr></thead><tbody>';
      ids.forEach(function (k) {
        var r = IND.recon[k];
        rc += '<tr><td><span class="chip" style="background:' + COLORS[k] + '"></span>' + esc(IND.names[k]) + '</td><td>' + sgn(r['四業態一樓群']) + '</td><td>' + sgn(r['四業態二樓以上']) + '</td><td>' + sgn(r['補習與教育']) + '</td><td>' + sgn(r['醫療診所']) + '</td><td>' + sgn(r['辦公與其他']) + '</td><td><b>' + sgn(r['合計']) + '</b></td></tr>';
      });
      q('indRecon').innerHTML = rc + '</tbody></table>';
      q('indUnknown').textContent = fmt(IND.meta.unknown_status);
      render();
    }).catch(function (e) { console.error('industry load', e); q('indTbl').innerHTML = '<div class="fine">資料讀取失敗，請重新整理。</div>'; });
  }

  /* ================= 看某個商圈 ================= */
  function niceStep(mx) {
    var raw = Math.max(mx, 1) * 1.08 / 4, b = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), m = [1, 2, 4, 5, 10].filter(function (x) { return x * b >= raw; })[0] || 10;
    return m * b;
  }
  function bootArea() {
    Promise.all(['summary.json', 'charts.json', 'areas_geo.json', 'upper.json', 'roads.json', 'buildings.json'].map(jget).concat(
      fetch('index.html').then(function (r) { if (!r.ok) throw new Error('index.html'); return r.text(); }).then(function (t) { return new DOMParser().parseFromString(t, 'text/html'); }).catch(function () { return null; })
    )).then(function (a) {
      var S = a[0], C = a[1], AREAS = a[2], UPJ = a[3], ROAD = a[4], BLD = a[5], DOC = a[6], ord = S.order;
      LK.setUP(UPJ);
      var cur = null, map = null, yieldMode = '1f';
      var geom = {}; AREAS.features.forEach(function (f) { geom[f.properties.id] = f.geometry; });
      var sum = function (v) { return v.reduce(function (x, y) { return x + y; }, 0); };

      q('arPills').innerHTML = ord.map(function (k) {
        return '<a class="pill" href="area.html?a=' + k + '" data-a="' + k + '" style="--pc:' + COLORS[k] + '"><span class="chip" style="background:' + COLORS[k] + '"></span>' + esc(S.rows[k].name) + '</a>';
      }).join('');

      function dispose() {
        LK.charts.slice().forEach(function (c) { try { c.dispose(); } catch (e) { /* 已經移除 */ } });
        LK.charts.length = 0;
        ['ar1', 'ar2', 'ar3'].forEach(function (id) { var el = q(id); if (el) el.style.height = ''; });
        if (map) { map.remove(); map = null; }
      }
      function setYield() {
        Array.prototype.forEach.call(document.querySelectorAll('#yieldSwitch button'), function (b) { b.classList.toggle('on', b.getAttribute('data-fl') === yieldMode); });
        if (yieldMode === 'up') LK.buildYieldUp(S, cur);
        else { q('tblYield').innerHTML = LK.yieldTbl(S, [cur]); q('yieldNote').textContent = ''; }
      }
      function show(k) {
        if (ord.indexOf(k) < 0) k = ord[0];
        dispose(); cur = k;
        var r = S.rows[k], col = COLORS[k];
        Array.prototype.forEach.call(document.querySelectorAll('#arPills .pill'), function (el) { var on = el.getAttribute('data-a') === k; el.classList.toggle('on', on); if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });

        /* 商圈卡片：單一來源是 index.html 的 .area-card */
        var card = DOC ? DOC.querySelector('.area-card[data-a="' + k + '"]') : null, box = q('arCard');
        box.style.borderLeftColor = col;
        box.innerHTML = card ? card.innerHTML : '<h3>' + esc(r.full) + '</h3><p class="fine">商圈說明讀取失敗，請看<a href="index.html#areas">完整報告</a>。</p>';

        /* 關鍵數字 */
        var chg = r.pop_chg;
        var stats = [
          [fmt(r.pop25), '人口（2025 年底），比 2019 年底 ' + (chg >= 0 ? '+' : '') + fmt(chg, 1) + '%'],
          [fmt(r.shops_alive), '營業中商家（所有行業）'],
          [sgn(r.shop_net), '2021～2025 年開在店面的商家淨增'],
          [fmt(r.new10_bld) + ' 棟', '2016 年後完工或預售的店面大樓，已完工 ' + fmt(C.fig1.data[k].reduce(function (a, b) { return a + b; }, 0)) + ' 棟'],
          [fmt(r.sale_med) + ' 萬', '一樓店面成交中位數每坪（2023 年以來，' + r.sale_n + ' 筆）'],
          [fmt(r.rent_med) + ' 元', '一樓店面月租中位數每坪（2023 年以來，' + r.rent_n + ' 筆）'],
          [fmt(r['yield'], 1) + '%', '毛報酬率（成交與租賃配對）'],
          [fmt(r.pipe_units) + ' 戶', '未完工建案戶數，已簽約店面 ' + fmt(r.pipe_signed) + ' 間']];
        q('arStats').innerHTML = stats.map(function (s) { return '<div class="stat" style="border-top-color:' + col + '"><div class="n">' + s[0] + '</div><div class="l">' + s[1] + '</div></div>'; }).join('');

        /* 地圖 */
        var g = geom[k], rp = repPoint(g);
        map = tileMap('arMap', false);
        L.geoJSON(AREAS, { filter: function (f) { return /^LK/.test(f.properties.id); }, style: function (f) {
          var id = f.properties.id, base = LK.areaStyle(f, S.rows);
          if (id === k) { base.weight = 3.5; base.fillOpacity = 0.22; } else { base.weight = 1; base.fillOpacity = 0.04; base.opacity = 0.5; base.dashArray = null; }
          return base;
        } }).addTo(map);
        var layerK = L.geoJSON({ type: 'Feature', geometry: g, properties: {} });
        map.fitBounds(layerK.getBounds(), { padding: [14, 14] });
        BLD.forEach(function (b) {
          if (!b.new || !LK.inGeom(b.lat, b.lon, g)) return;
          L.circleMarker([b.lat, b.lon], { radius: 5, color: '#fff', weight: 1, fillColor: '#0d9488', fillOpacity: 0.9, bubblingMouseEvents: false })
            .bindPopup('<b>' + esc(b.n) + '</b><br>完工年：' + (b.y || (b.new ? '還沒有完工紀錄，只有預售成交' : '不明')) + '<br>成交：' + (b.ns ? b.ns + ' 筆，每坪中位數 ' + fmt(b.sm) + ' 萬' : '無有效成交')).addTo(map);
        });
        q('arOpen').href = 'map.html?lat=' + rp[0].toFixed(5) + '&lon=' + rp[1].toFixed(5) + '&r=500';
        q('arMapNote').textContent = '綠點是 2016 年後完工或預售的店面大樓，只有預售成交的點開會註明。';

        /* 圖：人口、每年淨增、每年完工、未完工 */
        var yrs4 = C.fig4.years, i19 = yrs4.indexOf(2019), l4 = yrs4.length - 1, pc = (C.fig4.data[k][l4] / C.fig4.data[k][i19] - 1) * 100;
        q('ar1H').textContent = r.name + '人口 2019 到 2025 年' + (pc >= 0 ? '增加 ' : '減少 ') + fmt(Math.abs(pc), 1) + '%';
        LK.multiples('ar1', { ord: [k], cols: 1, nm: C.names, colors: COLORS, years: yrs4, data: C.fig4.data, type: 'area', unit: ' 人', step: niceStep(Math.max.apply(null, C.fig4.data[k])),
          yfmt: function (v) { return v === 0 ? '0' : fmt(v / 10000, 1) + ' 萬'; }, sub: function () { return (pc >= 0 ? '+' : '') + fmt(pc, 1) + '%'; } });
        var l5 = C.fig5.years.length - 1;
        q('ar2H').textContent = r.name + ' 2025 年開在店面的商家淨增 ' + fmt(C.fig5.data[k][l5]) + ' 家';
        LK.multiples('ar2', { ord: [k], cols: 1, nm: C.names, colors: COLORS, years: C.fig5.years, data: C.fig5.data, type: 'bar', unit: ' 家', step: niceStep(Math.max.apply(null, C.fig5.data[k].concat([1]))), peak: false,
          sub: function () { return '2016～2025 年合計 ' + sgn(sum(C.fig5.data[k])) + ' 家'; } });
        q('ar3H').textContent = r.name + '有 ' + sum(C.fig1.data[k]) + ' 棟 2016 年後完工的店面大樓';
        LK.multiples('ar3', { ord: [k], cols: 1, nm: C.names, colors: COLORS, years: C.fig1.years, data: C.fig1.data, type: 'bar', unit: ' 棟', step: niceStep(Math.max.apply(null, C.fig1.data[k].concat([1]))), peak: true,
          sub: function () { return '合計 ' + sum(C.fig1.data[k]) + ' 棟'; } });
        var f2 = C.fig2, mxu = Math.max.apply(null, ord.map(function (x) { return Math.max.apply(null, f2.units[x]); })), mxs = Math.max.apply(null, ord.map(function (x) { return Math.max.apply(null, f2.signed[x]); }));
        q('ar4H').textContent = r.name + '未完工 ' + fmt(sum(f2.units[k])) + ' 戶，已簽約店面 ' + fmt(sum(f2.signed[k])) + ' 間';
        q('ar4').innerHTML = '<div class="heat-wrap">' + LK.heatTable('未完工戶數', [k], C.names, f2.years, f2.units, mxu) + LK.heatTable('已簽約店面（間）', [k], C.names, f2.years, f2.signed, mxs) + '</div>';

        /* 各路段供給（只有後段、前段、中段有） */
        var hasRoad = ROAD.areas.some(function (x) { return x.id === k; });
        q('arRoadSec').hidden = !hasRoad;
        if (hasRoad) LK.buildRoads(ROAD, '1f', k);

        /* 價格一列 */
        yieldMode = '1f'; setYield();

        document.title = '林口店面選址・' + r.name;
        q('arH1').textContent = r.name + '：人口、新店面、同業和價格';
      }
      q('arPills').addEventListener('click', function (e) {
        var el = e.target.closest('a.pill'); if (!el || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault(); var k = el.getAttribute('data-a'); setUrl('a=' + k, true); show(k);
      });
      window.addEventListener('popstate', function () { show(qs().get('a') || ord[0]); });
      q('yieldSwitch').addEventListener('click', function (e) { var b = e.target.closest('button[data-fl]'); if (!b) return; yieldMode = b.getAttribute('data-fl'); setYield(); });
      LK.attachResize();
      var a0 = qs().get('a'); show(ord.indexOf(a0) >= 0 ? a0 : ord[0]);
      if (a0 === null || ord.indexOf(a0) < 0) setUrl('a=' + cur, false);
      window.__area = { show: show, cur: function () { return cur; } };
    }).catch(function (e) { console.error('area load', e); q('arCard').innerHTML = '<div class="fine">資料讀取失敗，請重新整理。</div>'; });
  }

  if (VIEW === 'industry') bootIndustry(); else bootArea();
})();
