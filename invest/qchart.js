/* 文章主圖：原生 SVG 長條圖（分組、可含負值、可畫一條參考線）。
   不依賴任何套件；顏色用 tool.css 的 --g1／--g2／--g3，第二組加斜線、第三組只畫框，不只靠顏色。
   用法：QCHART.bars(host, { cats, series:[{name, values}], fmt, ref:{value,label}, extra:[每個類別的補充一行], height }) */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', uid = 0;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nice(min, max) {
    var span = Math.max(max - min, 1e-9), raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p, lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step, t = [];
    for (var v = lo; v <= hi + step * 0.001; v += step) t.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return { ticks: t, lo: lo, hi: hi };
  }
  function bars(host, cfg) {
    host.innerHTML = '';
    var n = cfg.cats.length, ns = cfg.series.length;
    var W = Math.max(host.clientWidth || 600, 260), narrow = W < 520, H = cfg.height || (narrow ? 280 : 330);
    var maxName = 0; cfg.series.forEach(function (S) { maxName = Math.max(maxName, S.name.length); });
    var mr = narrow ? Math.min(78, 14 + 12 * Math.min(maxName, 5)) : Math.min(130, 14 + 12 * Math.min(maxName, 9));
    var m = { l: narrow ? 44 : 56, r: mr, t: 14, b: 26 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var mn = 0, mx = 0;
    cfg.series.forEach(function (S) { S.values.forEach(function (v) { if (v == null) return; if (v < mn) mn = v; if (v > mx) mx = v; }); });
    if (cfg.ref) { mx = Math.max(mx, cfg.ref.value); mn = Math.min(mn, cfg.ref.value); }
    var sc = nice(mn, mx * 1.06);
    function yPos(v) { return m.t + (sc.hi - v) / (sc.hi - sc.lo) * ph; }
    var gw = pw / n, bw = Math.max(2, Math.min(34, gw * 0.78 / ns)), y0 = yPos(0);
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    function mk(tg, attrs, txt, parent) { var el = document.createElementNS(NS, tg); for (var k in attrs) el.setAttribute(k, attrs[k]); if (txt != null) el.textContent = txt; (parent || svg).appendChild(el); return el; }
    var defs = mk('defs', {});
    var id0 = 'qh' + (++uid);
    cfg.series.forEach(function (S, si) {
      var col = 'var(--g' + (si + 1) + ')';
      if (si === 1) {
        var pt = mk('pattern', { id: id0 + '_' + si, patternUnits: 'userSpaceOnUse', width: 6, height: 6, patternTransform: 'rotate(45)' }, null, defs);
        mk('rect', { width: 6, height: 6, fill: col, 'fill-opacity': 0.22 }, null, pt);
        mk('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: col, 'stroke-width': 3 }, null, pt);
      }
    });
    function fillOf(si) {
      var col = 'var(--g' + (si + 1) + ')';
      if (si === 0) return { fill: col };
      if (si === 1) return { fill: 'url(#' + id0 + '_1)', stroke: col, 'stroke-width': 1.5 };
      return { fill: col, 'fill-opacity': 0.25, stroke: col, 'stroke-width': 1.5 };
    }
    sc.ticks.forEach(function (v) {
      var y = yPos(v);
      mk('line', { x1: m.l, x2: m.l + pw, y1: y, y2: y, stroke: v === 0 ? 'var(--muted)' : 'var(--line)', 'stroke-width': 1 });
      mk('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, (cfg.axisFmt || cfg.fmt)(v));
    });
    if (cfg.ref) {
      var yr = yPos(cfg.ref.value);
      mk('line', { x1: m.l, x2: m.l + pw, y1: yr, y2: yr, stroke: 'var(--ink2)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' });
      mk('text', { x: m.l + 4, y: yr - 5, fill: 'var(--ink2)', 'font-size': 11 }, cfg.ref.label);
    }
    // 類別標籤：放得下才全部顯示，否則隔幾個顯示一個
    var maxLen = 0; cfg.cats.forEach(function (c) { maxLen = Math.max(maxLen, String(c).length); });
    var need = maxLen * 7 + 10, every = Math.max(1, Math.ceil(need / gw));
    cfg.cats.forEach(function (c, i) {
      if (i % every) return;
      mk('text', { x: m.l + gw * (i + 0.5), y: H - 8, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, c);
    });
    var showVal = bw >= 26;
    cfg.series.forEach(function (S, si) {
      S.values.forEach(function (v, i) {
        if (v == null) return;
        var cx = m.l + gw * (i + 0.5), x = cx - (ns * bw) / 2 + si * bw, y = yPos(v), top = Math.min(y, y0), h = Math.max(Math.abs(y - y0), 1);
        var a = fillOf(si); a.x = x + (ns > 1 ? 0.5 : 0); a.y = top; a.width = bw - (ns > 1 ? 1 : 0); a.height = h;
        mk('rect', a);
        if (showVal) mk('text', { x: x + bw / 2, y: v >= 0 ? top - 4 : top + h + 12, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 11, 'font-weight': 600 }, cfg.fmt(v));
      });
    });
    // 直接標籤：標在最後一個有值的柱子頂端高度，避免重疊
    var lab = cfg.series.map(function (S, si) {
      var lv = null; for (var i = S.values.length - 1; i >= 0; i--) if (S.values[i] != null) { lv = S.values[i]; break; }
      return { S: S, si: si, y: yPos(lv == null ? 0 : lv) };
    }).sort(function (a, b) { return a.y - b.y; });
    for (var li = 1; li < lab.length; li++) if (lab[li].y - lab[li - 1].y < 15) lab[li].y = lab[li - 1].y + 15;
    var maxc = narrow ? 5 : 9;
    lab.forEach(function (L) {
      var nm = L.S.name.length > maxc ? L.S.name.slice(0, maxc) + '…' : L.S.name;
      mk('text', { x: m.l + pw + 6, y: L.y + 4, fill: 'var(--g' + (L.si + 1) + ')', 'font-size': 12, 'font-weight': 700 }, nm);
    });
    var band = mk('rect', { x: 0, y: m.t, width: gw, height: ph, fill: 'var(--ink)', 'fill-opacity': 0.07, visibility: 'hidden' });
    var ov = mk('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
    host.appendChild(svg);
    var tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip);
    function show(clientX) {
      var r = svg.getBoundingClientRect(), px = (clientX - r.left) * (W / r.width);
      var i = Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / gw)));
      band.setAttribute('x', m.l + gw * i); band.setAttribute('visibility', 'visible');
      var h = '<div><b>' + esc(cfg.cats[i]) + '</b></div>';
      cfg.series.forEach(function (S, si) {
        var v = S.values[i];
        h += '<div><b style="color:var(--g' + (si + 1) + ')">' + esc(S.name) + '</b>　' + (v == null ? '沒有資料' : esc(cfg.fmt(v))) + '</div>';
      });
      if (cfg.extra && cfg.extra[i]) h += '<div>' + esc(cfg.extra[i]) + '</div>';
      tip.innerHTML = h; tip.style.display = 'block';
      var tw = tip.offsetWidth, cx = (m.l + gw * (i + 0.5)) * (r.width / W), left = cx + 14;
      if (left + tw > r.width) left = cx - tw - 14;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
    }
    function hide() { band.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; }
    ov.addEventListener('pointermove', function (ev) { show(ev.clientX); });
    ov.addEventListener('pointerdown', function (ev) { show(ev.clientX); });
    ov.addEventListener('pointerleave', hide);
  }
  function legend(host, series) {
    var h = '';
    series.forEach(function (S, si) {
      var col = 'var(--g' + (si + 1) + ')';
      var sw = si === 0 ? '<rect width="16" height="10" fill="' + col + '"/>' :
        si === 1 ? '<rect width="16" height="10" fill="' + col + '" fill-opacity=".3" stroke="' + col + '" stroke-width="1.5"/><line x1="3" y1="10" x2="13" y2="0" stroke="' + col + '" stroke-width="2"/>' :
          '<rect x=".75" y=".75" width="14.5" height="8.5" fill="' + col + '" fill-opacity=".25" stroke="' + col + '" stroke-width="1.5"/>';
      h += '<span><svg width="16" height="10" aria-hidden="true">' + sw + '</svg><b style="color:' + col + '">' + esc(S.name) + '</b></span>';
    });
    host.innerHTML = h;
  }
  /* 一次畫好：host 內放 .legend 與 .chart 兩個子元素 */
  function mount(box, cfg) {
    var lg = box.querySelector('.legend'), ch = box.querySelector('.chart');
    function draw() { legend(lg, cfg.series); bars(ch, cfg); }
    draw();
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(draw, 120); });
  }
  function pctF(d) { return function (v) { return (v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%'; }; }
  var fmt = { pct0: pctF(0), pct1: pctF(1), pct2: pctF(2), months: function (v) { return v.toFixed(1) + ' 個月'; }, num0: function (v) { return v.toFixed(0); } };
  window.QCHART = { bars: bars, legend: legend, mount: mount, fmt: fmt };
})();
