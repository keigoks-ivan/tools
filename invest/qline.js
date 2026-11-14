/* 文章主圖：原生 SVG 折線圖（可含一條色帶、一條基準線）。需先載入 qchart.js。
   用法：QLINE.mount(box, { x:[…], xtitle, xfmt, series:[{name, values, style}], band:{lo,hi,name}, base:{value,label}, yfmt, tipExtra })
   style：0 實線、1 虛線、2 點線、3 灰實線；顏色用 tool.css 的 --g1／--g2／--g3，線型不同，不只靠顏色。 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nice(min, max) {
    var span = Math.max(max - min, 1e-9), raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p, lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step, t = [];
    for (var v = lo; v <= hi + step * 0.001; v += step) t.push(v);
    return { ticks: t, lo: lo, hi: hi };
  }
  var COL = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--muted)'];
  var DASH = ['', '7 4', '2 4', ''];
  function sty(S, i) { return S.style != null ? S.style : i; }
  function draw(host, cfg) {
    host.innerHTML = '';
    var n = cfg.x.length, W = Math.max(host.clientWidth || 600, 260), narrow = W < 520, H = cfg.height || (narrow ? 280 : 330);
    var maxName = 0; cfg.series.forEach(function (S) { maxName = Math.max(maxName, S.name.length); });
    var mr = narrow ? Math.min(78, 14 + 12 * Math.min(maxName, 5)) : Math.min(150, 14 + 12 * Math.min(maxName, 11));
    var m = { l: narrow ? 44 : 52, r: mr, t: 14, b: 40 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var mn = Infinity, mx = -Infinity;
    function acc(v) { if (v == null) return; if (v < mn) mn = v; if (v > mx) mx = v; }
    cfg.series.forEach(function (S) { S.values.forEach(acc); });
    if (cfg.band) { cfg.band.lo.forEach(acc); cfg.band.hi.forEach(acc); }
    if (cfg.base) acc(cfg.base.value);
    acc(cfg.ymin);
    acc(cfg.ymax);
    var sc = nice(mn, mx);
    function yPos(v) { return m.t + (sc.hi - v) / (sc.hi - sc.lo) * ph; }
    function xPos(i) { return m.l + (n === 1 ? pw / 2 : pw * i / (n - 1)); }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    function mk(tg, attrs, txt) { var el = document.createElementNS(NS, tg); for (var k in attrs) el.setAttribute(k, attrs[k]); if (txt != null) el.textContent = txt; svg.appendChild(el); return el; }
    sc.ticks.forEach(function (v) {
      var y = yPos(v);
      mk('line', { x1: m.l, x2: m.l + pw, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': 1 });
      mk('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, (cfg.yaxis || cfg.yfmt)(v));
    });
    var xt = cfg.xticks || [];
    xt.forEach(function (i) {
      mk('line', { x1: xPos(i), x2: xPos(i), y1: m.t + ph, y2: m.t + ph + 4, stroke: 'var(--muted)', 'stroke-width': 1 });
      mk('text', { x: xPos(i), y: m.t + ph + 17, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, cfg.xfmt(cfg.x[i]));
    });
    if (cfg.xtitle) mk('text', { x: m.l + pw / 2, y: H - 6, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, cfg.xtitle);
    if (cfg.band) {
      var d = '', i;
      for (i = 0; i < n; i++) d += (i ? 'L' : 'M') + xPos(i) + ' ' + yPos(cfg.band.hi[i]);
      for (i = n - 1; i >= 0; i--) d += 'L' + xPos(i) + ' ' + yPos(cfg.band.lo[i]);
      mk('path', { d: d + 'Z', fill: 'var(--g1)', 'fill-opacity': 0.14, stroke: 'none' });
    }
    if (cfg.base) {
      var yb = yPos(cfg.base.value);
      mk('line', { x1: m.l, x2: m.l + pw, y1: yb, y2: yb, stroke: 'var(--ink2)', 'stroke-width': 1, 'stroke-dasharray': '2 3' });
    }
    if (cfg.vline != null) {
      mk('line', { x1: xPos(cfg.vline), x2: xPos(cfg.vline), y1: m.t, y2: m.t + ph, stroke: 'var(--ink2)', 'stroke-width': 1, 'stroke-dasharray': '2 3' });
      if (cfg.vlabel) mk('text', { x: xPos(cfg.vline) + 5, y: m.t + 12, fill: 'var(--ink2)', 'font-size': 11 }, cfg.vlabel);
    }
    cfg.series.forEach(function (S, si) {
      var k = sty(S, si), d = '', started = false;
      S.values.forEach(function (v, i) { if (v == null) { started = false; return; } d += (started ? 'L' : 'M') + xPos(i).toFixed(1) + ' ' + yPos(v).toFixed(1); started = true; });
      var a = { d: d, fill: 'none', stroke: COL[k], 'stroke-width': 2.2, 'stroke-linejoin': 'round' };
      if (DASH[k]) a['stroke-dasharray'] = DASH[k];
      mk('path', a);
    });
    var lab = cfg.series.map(function (S, si) {
      var lv = null; for (var i = S.values.length - 1; i >= 0; i--) if (S.values[i] != null) { lv = S.values[i]; break; }
      return { S: S, k: sty(S, si), y: yPos(lv == null ? 0 : lv) };
    }).sort(function (a, b) { return a.y - b.y; });
    for (var li = 1; li < lab.length; li++) if (lab[li].y - lab[li - 1].y < 15) lab[li].y = lab[li - 1].y + 15;
    var maxc = narrow ? 5 : 11;
    lab.forEach(function (L) {
      var nm = L.S.name.length > maxc ? L.S.name.slice(0, maxc) + '…' : L.S.name;
      mk('text', { x: m.l + pw + 6, y: L.y + 4, fill: COL[L.k], 'font-size': 12, 'font-weight': 700 }, nm);
    });
    var cur = mk('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ph, stroke: 'var(--ink)', 'stroke-opacity': 0.35, visibility: 'hidden' });
    var ov = mk('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
    host.appendChild(svg);
    var tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip);
    function show(clientX) {
      var r = svg.getBoundingClientRect(), px = (clientX - r.left) * (W / r.width);
      var i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / pw * (n - 1))));
      cur.setAttribute('x1', xPos(i)); cur.setAttribute('x2', xPos(i)); cur.setAttribute('visibility', 'visible');
      var h = '<div><b>' + esc(cfg.xfmt(cfg.x[i], true)) + '</b></div>';
      cfg.series.forEach(function (S, si) {
        var v = S.values[i], k = sty(S, si);
        h += '<div><b style="color:' + COL[k] + '">' + esc(S.name) + '</b>　' + (v == null ? '沒有資料' : esc(cfg.yfmt(v))) + '</div>';
      });
      if (cfg.band) h += '<div>' + esc(cfg.band.name) + '　' + esc(cfg.yfmt(cfg.band.lo[i])) + ' 到 ' + esc(cfg.yfmt(cfg.band.hi[i])) + '</div>';
      tip.innerHTML = h; tip.style.display = 'block';
      var tw = tip.offsetWidth, cx = xPos(i) * (r.width / W), left = cx + 14;
      if (left + tw > r.width) left = cx - tw - 14;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
    }
    function hide() { cur.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; }
    ov.addEventListener('pointermove', function (ev) { show(ev.clientX); });
    ov.addEventListener('pointerdown', function (ev) { show(ev.clientX); });
    ov.addEventListener('pointerleave', hide);
  }
  function legend(host, cfg) {
    var h = '';
    cfg.series.forEach(function (S, si) {
      var k = sty(S, si);
      h += '<span><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="' + COL[k] + '" stroke-width="2.4"' + (DASH[k] ? ' stroke-dasharray="' + DASH[k] + '"' : '') + '/></svg><b style="color:' + COL[k] + '">' + esc(S.name) + '</b></span>';
    });
    if (cfg.band) h += '<span><svg width="22" height="10" aria-hidden="true"><rect width="22" height="10" fill="var(--g1)" fill-opacity=".25"/></svg><b style="color:var(--ink2)">' + esc(cfg.band.name) + '</b></span>';
    host.innerHTML = h;
  }
  function mount(box, cfg) {
    box.__researchChart = cfg;
    box.__researchChartKind = "line";
    var lg = box.querySelector('.legend'), ch = box.querySelector('.chart');
    function go() { legend(lg, cfg); draw(ch, cfg); }
    go();
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(go, 120); });
  }
  window.QLINE = { mount: mount };
})();
