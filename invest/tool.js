/* 回測工具共用程式：計算（單筆／每月投入、再平衡、統計）、組合設定介面、折線圖。
   tool.html 與首頁精簡版共用。核心計算不碰 DOM，Node 也能載入驗算。 */
(function (root) {
  'use strict';
  var DAY = 86400000;
  var CATS = ['台股', '美股', '全球股票', '債券', '黃金', '現金'];
  var LET = ['A', 'B', 'C'];
  var DASH = ['', '7 4', '2 4'];
  var MINUS = '−';
  var D = null, AS = {}, dates = [], ms = [], NN = 0;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function gname(g) { return (g.name || '').trim() || ('組合 ' + LET[g.gi]); }
  function isDef(g) { return !(g.name || '').trim(); }
  function tag(g) { return isDef(g) ? gname(g) : LET[g.gi] + ' ' + gname(g); }

  /* ---------- 格式 ---------- */
  function pct(x, d, sign) {
    if (x == null || !isFinite(x)) return '—';
    var v = x * 100, s = Math.abs(v).toFixed(d == null ? 1 : d);
    if (Number(s) === 0) return s + '%';
    return (v < 0 ? MINUS : (sign ? '+' : '')) + s + '%';
  }
  function money(v) { return Math.round(v).toLocaleString('en-US') + ' 元'; }
  function shortMoney(v) {
    if (v >= 1e8) { var y = v / 1e8; return (y >= 100 ? y.toFixed(0) : y.toFixed(1)).replace(/\.0$/, '') + ' 億'; }
    if (v >= 1e4) return Math.round(v / 1e4).toLocaleString('en-US') + ' 萬';
    return Math.round(v).toLocaleString('en-US');
  }
  function yrs1(y) { return y.toFixed(1); }
  function span(days) {
    var m = Math.round(days / 30.4375);
    if (m < 1) return '不到 1 個月';
    var y = Math.floor(m / 12), r = m % 12;
    return (y ? y + ' 年' : '') + (r ? (y ? ' ' : '') + r + ' 個月' : '');
  }
  function dayDiff(a, b) { return (ms[b] - ms[a]) / DAY; }

  /* ---------- 資料 ---------- */
  function setData(j) {
    D = j; dates = j.dates; NN = dates.length; AS = {};
    ms = dates.map(function (s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); });
    j.assets.forEach(function (a) { AS[a.id] = a; a.hist = (ms[NN - 1] - ms[a.i0]) / DAY / 365.25; });
    return j;
  }
  function load(url) {
    return fetch(url || 'data/tool_assets.json').then(function (r) { return r.json(); }).then(setData);
  }
  function px(a, k) { return a.v[k - a.i0]; }
  function idxOnOrAfter(s) { var lo = 0, hi = NN; while (lo < hi) { var m = (lo + hi) >> 1; if (dates[m] < s) lo = m + 1; else hi = m; } return lo; }
  function idxOnOrBefore(s) { return idxOnOrAfter(s + '\u0001') - 1; }

  /* ---------- 驗證 ---------- */
  function validate(g) {
    var items = [], sum = 0, seen = {}, err = '';
    for (var i = 0; i < g.items.length; i++) {
      var it = g.items[i], w = String(it.w).trim();
      if (w === '') w = '0';
      if (!/^\d+$/.test(w)) { err = '比例要填整數，不能有小數點或負號。'; break; }
      var n = parseInt(w, 10);
      sum += n;
      if (n > 0) { if (seen[it.id]) { err = '同一檔「' + AS[it.id].name + '」出現兩次，請合併成一列。'; break; } seen[it.id] = 1; items.push({ id: it.id, w: n }); }
    }
    if (!err && sum !== 100) err = '比例合計 ' + sum + '%，要等於 100%。';
    return { sum: sum, err: err, items: err ? null : items };
  }

  /* ---------- 計算 ---------- */
  function simulate(items, s, e, mode, amount, rebal) {
    var n = e - s + 1, h = new Float64Array(items.length);
    var val = new Float64Array(n), nav = new Float64Array(n), contrib = new Float64Array(n);
    var flows = [], cum = 0, prevAfter = 0, navPrev = 1;
    var as = items.map(function (it) { return AS[it.id]; });
    for (var t = 0; t < n; t++) {
      var k = s + t, before = 0, i;
      if (t > 0) { for (i = 0; i < h.length; i++) h[i] *= px(as[i], k) / px(as[i], k - 1); }
      for (i = 0; i < h.length; i++) before += h[i];
      var flow = 0;
      if (t === 0) flow = amount;
      // 終點當天不再投入：終點剛好是月初第一個交易日時，新投入還沒放過一天，不算進這次回測
      else if (mode === 'monthly' && t < n - 1 && dates[k].slice(0, 7) !== dates[k - 1].slice(0, 7)) flow = amount;
      if (flow > 0) { for (i = 0; i < h.length; i++) h[i] += flow * items[i].w / 100; cum += flow; flows.push([k, flow]); }
      var after = 0; for (i = 0; i < h.length; i++) after += h[i];
      if (rebal === 'annual' && t > 0 && dates[k].slice(0, 4) !== dates[k - 1].slice(0, 4)) {
        for (i = 0; i < h.length; i++) h[i] = after * items[i].w / 100;
      }
      nav[t] = t === 0 ? 1 : navPrev * before / prevAfter;
      navPrev = nav[t]; prevAfter = after; val[t] = after; contrib[t] = cum;
    }
    return { val: val, nav: nav, contrib: contrib, flows: flows };
  }
  function irr(flows, s, endK, finalV) {
    function f(r) {
      var tot = finalV / Math.pow(1 + r, dayDiff(s, endK) / 365.25);
      for (var i = 0; i < flows.length; i++) tot -= flows[i][1] / Math.pow(1 + r, dayDiff(s, flows[i][0]) / 365.25);
      return tot;
    }
    var lo = -0.95, hi = 20;
    for (var it = 0; it < 200; it++) { var mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function stats(sim, s, e, mode, amount) {
    var n = e - s + 1, nav = sim.nav, i;
    var finalV = sim.val[n - 1], contributed = sim.contrib[n - 1];
    var years = dayDiff(s, e) / 365.25;
    var ann = mode === 'lump' ? Math.pow(finalV / amount, 1 / years) - 1 : irr(sim.flows, s, e, finalV);
    var peak = nav[0], peakI = 0, mdd = 0, mddP = 0, mddT = 0, longest = { days: 0, p: 0, r: 0, rec: true }, uwStart = -1;
    for (i = 1; i < n; i++) {
      if (nav[i] >= peak) {
        if (uwStart >= 0) { var dd = dayDiff(s + uwStart, s + i); if (dd > longest.days) longest = { days: dd, p: uwStart, r: i, rec: true }; uwStart = -1; }
        peak = nav[i]; peakI = i;
      } else {
        if (uwStart < 0) uwStart = peakI;
        var d = nav[i] / peak - 1;
        if (d < mdd) { mdd = d; mddP = peakI; mddT = i; }
      }
    }
    if (uwStart >= 0) { var d2 = dayDiff(s + uwStart, e); if (d2 > longest.days) longest = { days: d2, p: uwStart, r: n - 1, rec: false }; }
    var worst = null, sp = 0;
    for (i = 0; i < n; i++) {
      var k = s + i, tgt = (+dates[k].slice(0, 4) - 1) + dates[k].slice(4);
      if (tgt < dates[s]) continue;
      while (sp + 1 <= i && dates[s + sp + 1] <= tgt) sp++;
      var rr = nav[i] / nav[sp] - 1;
      if (worst === null || rr < worst.r) worst = { r: rr, end: i, start: sp };
    }
    var yearly = {}, y0 = +dates[s].slice(0, 4), y1 = +dates[e].slice(0, 4), prevNav = 1, y, lastI = {};
    for (i = 0; i < n; i++) lastI[dates[s + i].slice(0, 4)] = i;
    for (y = y0; y <= y1; y++) { var li = lastI[String(y)]; yearly[y] = nav[li] / prevNav - 1; prevNav = nav[li]; }
    var drawdown = new Float64Array(n), pk = nav[0];
    for (i = 0; i < n; i++) { if (nav[i] > pk) pk = nav[i]; drawdown[i] = nav[i] / pk - 1; }
    // 年化波動：每日報酬的標準差，換算成一年（用這段期間實際的每年交易日數）
    var sum = 0, sq = 0, m = n - 1;
    for (i = 1; i < n; i++) { var r1 = nav[i] / nav[i - 1] - 1; sum += r1; sq += r1 * r1; }
    var vol = m > 20 ? Math.sqrt(Math.max(0, (sq - sum * sum / m) / (m - 1))) * Math.sqrt(m / years) : null;
    // 最差單月：月底對上個月底，只算完整的月份
    var worstM = null, prevEnd = -1;
    for (i = 0; i < n; i++) {
      var k2 = s + i, isEnd = k2 === NN - 1 ? true : dates[k2 + 1].slice(0, 7) !== dates[k2].slice(0, 7);
      if (!isEnd || (i === n - 1 && k2 !== NN - 1 && dates[k2 + 1].slice(0, 7) === dates[k2].slice(0, 7))) continue;
      if (prevEnd >= 0) { var rm = nav[i] / nav[prevEnd] - 1; if (worstM === null || rm < worstM.r) worstM = { r: rm, end: i }; }
      prevEnd = i;
    }
    return { vol: vol, worstM: worstM, finalV: finalV, contributed: contributed, ann: ann, mdd: mdd, mddP: mddP, mddT: mddT, longest: longest, worst: worst, yearly: yearly, drawdown: drawdown, years: years };
  }
  function partialYear(s, e) {
    return {
      first: s > 0 ? dates[s - 1].slice(0, 4) === dates[s].slice(0, 4) : true,
      last: e < NN - 1 ? dates[e + 1].slice(0, 4) === dates[e].slice(0, 4) : !(+dates[e].slice(5, 7) === 12 && +dates[e].slice(8, 10) >= 24)
    };
  }

  var CRISES = [
    { n: '2008 年金融海嘯', s: '2008-01-31', e: '2008-12-31' },
    { n: '2020 年疫情急跌', s: '2020-02-01', e: '2020-04-30' },
    { n: '2022 年升息下跌', s: '2022-01-03', e: '2022-12-31' }
  ];
  function shortNote(items, s, e, years) {
    var shortA = items.filter(function (it) { return AS[it.id].hist < 5; });
    if (!shortA.length && years >= 5) return null;
    var uncovered = CRISES.filter(function (c) { return !(dates[s] <= c.s && dates[e] >= c.e); }).map(function (c) { return c.n; });
    var t = '只有 ' + yrs1(years) + ' 年資料（' + dates[s] + ' 到 ' + dates[e] + '）。';
    if (shortA.length) t += shortA.map(function (it) { return AS[it.id].name + '本身只有 ' + yrs1(AS[it.id].hist) + ' 年資料'; }).join('，') + '。';
    if (uncovered.length === CRISES.length) t += '這段期間沒有經歷過大跌（沒有涵蓋 ' + uncovered.join('、') + '），最大跌幅看不出這個組合遇到大跌會怎樣。';
    else if (uncovered.length) t += '這段期間沒有涵蓋 ' + uncovered.join('、') + '，最大跌幅看不出這幾種情況。';
    else t += '期間短於 5 年。';
    t += '因此不顯示「年化 ÷ 最大跌幅」。';
    return t;
  }

  /* 共同期間與計算。spec: { groups:[{gi,name,items(已驗證)}], mode, amount, rebal, userStart, userEnd }
     回傳 { out, s, e, mode, amount, note } 或 { err } */
  function compute(spec) {
    var okG = spec.groups, mode = spec.mode, amount = spec.amount;
    var cs = 0, limiter = null;
    okG.forEach(function (g) { g.items.forEach(function (it) { var a = AS[it.id]; if (a.i0 > cs || (a.i0 === cs && !limiter)) { cs = a.i0; limiter = { a: a, g: g }; } }); });
    var uS = spec.userStart ? idxOnOrAfter(spec.userStart) : 0;
    var s = Math.max(uS, cs);
    var e = spec.userEnd ? idxOnOrBefore(spec.userEnd) : NN - 1;
    if (e <= s + 1) return { err: '終點要晚於起點至少幾天。' };
    var note = '';
    if (spec.userStart && uS < cs) note = '你選的起點是 ' + spec.userStart + '，已往後移到 ' + dates[s] + '，因為 ' + limiter.a.name + (limiter.a.name.indexOf(gname(limiter.g)) >= 0 ? '' : '（' + gname(limiter.g) + '）') + limiter.a.start + ' 才有資料。';
    else if (!spec.userStart && cs > 0) note = '起點用所選資產都有資料的最早一天：' + dates[s] + '。限制來自 ' + limiter.a.name + (limiter.a.name.indexOf(gname(limiter.g)) >= 0 ? '' : '（' + gname(limiter.g) + '）') + '，它 ' + limiter.a.start + ' 才有資料。';
    if (spec.userEnd && dates[e] !== spec.userEnd) note = (note ? note + ' ' : '') + '終點 ' + spec.userEnd + ' 不是交易日，用前一個交易日 ' + dates[e] + '。';
    var out = okG.map(function (g) {
      var sim = simulate(g.items, s, e, mode, amount, spec.rebal);
      var st = stats(sim, s, e, mode, amount);
      var comp = g.items.map(function (it) { return AS[it.id].id.replace('TAIEX_TR', '加權含息').replace('CASH_TWD', '台幣定存') + ' ' + it.w + '%'; }).join('＋');
      return { g: g, gi: g.gi, items: g.items, sim: sim, st: st, comp: comp, warn: shortNote(g.items, s, e, st.years) };
    });
    return { out: out, s: s, e: e, mode: mode, amount: amount, note: note };
  }

  /* ---------- 表格與圖例（回傳 HTML） ---------- */
  var ROWS = ['principal', 'final', 'ann', 'mdd', 'mddPeriod', 'longest', 'worst', 'worstM', 'vol', 'ratio'];
  function statsHtml(res, rowKeys) {
    var out = res.out, s = res.s, mode = res.mode;
    var annLab = mode === 'lump' ? '含息年化報酬' : '含息年化報酬<span class="sub">資金加權：每一筆投入各自放了多久都算進去</span>';
    var defs = {
      principal: ['投入本金', function (o) { return money(o.st.contributed); }],
      final: ['期末金額', function (o) { return money(o.st.finalV); }],
      ann: [annLab, function (o) { return pct(o.st.ann, 1); }, true],
      mdd: ['最大跌幅', function (o) { return pct(o.st.mdd, 1); }, true],
      mddPeriod: ['最大跌幅的期間<span class="sub">前高日 → 谷底日</span>', function (o) { return o.st.mdd === 0 ? '沒有回落' : dates[s + o.st.mddP] + ' → ' + dates[s + o.st.mddT]; }],
      longest: ['最長等多久才回到前高<span class="sub">從前高日算到再創高</span>', function (o) { var l = o.st.longest; if (l.days === 0) return '沒有低於前高'; return span(l.days) + (l.rec ? '' : '（到終點還沒回到）'); }, true],
      worst: ['最差一年<span class="sub">任何連續 12 個月裡最低的</span>', function (o) { var w = o.st.worst; return w ? pct(w.r, 1) + '（至 ' + dates[s + w.end] + '）' : '期間不到 1 年'; }],
      worstM: ['最差單月<span class="sub">完整月份裡，月底對上個月底最低的</span>', function (o) { var w = o.st.worstM; return w ? pct(w.r, 1) + '（' + dates[s + w.end].slice(0, 7) + '）' : '期間不到 2 個月'; }],
      vol: ['年化波動<span class="sub">每日漲跌的標準差換算成一年，數字越大起伏越大</span>', function (o) { return o.st.vol == null ? '期間太短' : pct(o.st.vol, 1); }],
      ratio: ['年化 ÷ 最大跌幅（Calmar）<span class="sub">每承受 1 個百分點的跌幅，換到多少年化報酬</span>', function (o) {
        if (o.warn) return '不顯示';
        if (o.st.mdd === 0) return '沒有回落';
        return (o.st.ann / Math.abs(o.st.mdd)).toFixed(2);
      }]
    };
    var h = '<thead><tr><th></th>' + out.map(function (o) { return '<th class="gh" style="color:var(--g' + (o.gi + 1) + ')"><i>' + esc(tag(o.g)) + '</i><span class="sub" style="color:var(--muted)">' + esc(o.comp) + '</span></th>'; }).join('') + '</tr></thead><tbody>';
    (rowKeys || ROWS).forEach(function (k) {
      var r = defs[k];
      h += '<tr><th scope="row">' + r[0] + '</th>' + out.map(function (o) { return '<td' + (r[2] ? ' style="font-weight:700"' : '') + '>' + r[1](o) + '</td>'; }).join('') + '</tr>';
    });
    return h + '</tbody>';
  }
  function yearlyHtml(res) {
    var out = res.out, s = res.s, e = res.e, py = partialYear(s, e);
    var y0 = +dates[s].slice(0, 4), y1 = +dates[e].slice(0, 4), anyPartial = false;
    var yh = '<thead><tr><th>年度</th>' + out.map(function (o) { return '<th class="gh" style="color:var(--g' + (o.gi + 1) + ')"><i>' + esc(tag(o.g)) + '</i></th>'; }).join('') + '</tr></thead><tbody>';
    for (var y = y0; y <= y1; y++) {
      var p = (y === y0 && py.first) || (y === y1 && py.last);
      if (p) anyPartial = true;
      yh += '<tr><th scope="row">' + y + (p ? ' †' : '') + '</th>' + out.map(function (o) { return '<td>' + pct(o.st.yearly[y], 1, false) + '</td>'; }).join('') + '</tr>';
    }
    return { html: yh + '</tbody>', partial: anyPartial };
  }
  function warnsHtml(res) {
    var wh = '';
    res.out.forEach(function (o) { if (o.warn) wh += '<p class="warn c' + (o.gi + 1) + '"><b>' + esc(tag(o.g)) + '</b>：' + esc(o.warn) + '</p>'; });
    return wh;
  }
  function legendHtml(res) {
    var leg = res.out.map(function (o) {
      return '<span><svg width="30" height="10" aria-hidden="true"><line x1="1" y1="5" x2="29" y2="5" stroke="var(--g' + (o.gi + 1) + ')" stroke-width="2.5"' + (DASH[o.gi] ? ' stroke-dasharray="' + DASH[o.gi] + '"' : '') + '/></svg><b style="color:var(--g' + (o.gi + 1) + ')">' + esc(tag(o.g)) + '</b></span>';
    }).join('');
    if (res.mode === 'monthly') leg += '<span><svg width="30" height="10" aria-hidden="true"><line x1="1" y1="5" x2="29" y2="5" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="1 3"/></svg>累計投入</span>';
    return leg;
  }

  /* ---------- 原生 SVG 折線圖 ---------- */
  function niceLin(max) {
    var raw = max / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p, t = [];
    for (var v = 0; v <= max * 1.001; v += step) t.push(v);
    return { ticks: t, top: Math.max(t[t.length - 1], max) };
  }
  /* cfg: { xs:[ms], dates:[字串], series:[{gi,y,name,tip,prefix}], ref, scale:'lin'|'log'|'dd', fmt, tipFmt, height } */
  function chart(host, cfg) {
    var NS = 'http://www.w3.org/2000/svg';
    var xs = cfg.xs, ds = cfg.dates;
    host.innerHTML = '';
    var W = Math.max(host.clientWidth || 600, 260), narrow = W < 520, H = cfg.height || (narrow ? 260 : 330);
    var m = { l: narrow ? 46 : 60, r: narrow ? 56 : 88, t: 10, b: 24 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var all = cfg.series.slice(); if (cfg.ref) all.push(cfg.ref);
    var mn = Infinity, mx = -Infinity;
    all.forEach(function (S) { for (var i = 0; i < S.y.length; i++) { var v = S.y[i]; if (v < mn) mn = v; if (v > mx) mx = v; } });
    var yPos, ticks = [], lo, hi;
    if (cfg.scale === 'log') {
      lo = Math.log(mn * 0.9); hi = Math.log(mx * 1.1);
      yPos = function (v) { return m.t + (hi - Math.log(v)) / (hi - lo) * ph; };
      var p0 = Math.floor(Math.log10(mn * 0.9)), p1 = Math.ceil(Math.log10(mx * 1.1));
      for (var p = p0; p <= p1; p++) [1, 2, 5].forEach(function (f) { var v = f * Math.pow(10, p); if (Math.log(v) >= lo && Math.log(v) <= hi) ticks.push(v); });
      if (ticks.length > 8) ticks = ticks.filter(function (v) { return /^1/.test(String(v)); });
    } else if (cfg.scale === 'dd') {
      var bot = Math.min(-0.1, Math.floor(mn * 10) / 10), step = bot < -0.6 ? 0.2 : 0.1;
      lo = bot; hi = 0;
      yPos = function (v) { return m.t + (0 - v) / (0 - bot) * ph; };
      for (var t = 0; t >= bot - 1e-9; t -= step) ticks.push(t);
    } else {
      var nl = niceLin(mx * 1.05); lo = 0; hi = nl.top; ticks = nl.ticks;
      yPos = function (v) { return m.t + (hi - v) / (hi - lo) * ph; };
    }
    var x0 = xs[0], x1 = xs[xs.length - 1];
    function xPos(t) { return m.l + (t - x0) / (x1 - x0) * pw; }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    function mk(tg, attrs, txt) { var el = document.createElementNS(NS, tg); for (var k in attrs) el.setAttribute(k, attrs[k]); if (txt != null) el.textContent = txt; svg.appendChild(el); return el; }
    ticks.forEach(function (v) {
      var y = yPos(v);
      mk('line', { x1: m.l, x2: m.l + pw, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': 1 });
      mk('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, cfg.fmt(v));
    });
    var spanY = (x1 - x0) / (365.25 * DAY), stepY = [1, 2, 5, 10, 20].filter(function (c) { return spanY / c <= (narrow ? 5 : 8); })[0] || 20;
    var yStart = new Date(x0).getUTCFullYear() + 1;
    for (var yy = Math.ceil(yStart / stepY) * stepY; yy <= new Date(x1).getUTCFullYear(); yy += stepY) {
      var tx = Date.UTC(yy, 0, 1); if (tx < x0 || tx > x1) continue;
      mk('line', { x1: xPos(tx), x2: xPos(tx), y1: m.t, y2: m.t + ph, stroke: 'var(--line)', 'stroke-width': 1, 'stroke-dasharray': '2 4' });
      mk('text', { x: xPos(tx), y: H - 6, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, String(yy));
    }
    var dec = Math.ceil(xs.length / 1800);
    function pathOf(S) {
      var d = '';
      for (var i = 0; i < xs.length; i += dec) d += (d ? 'L' : 'M') + xPos(xs[i]).toFixed(1) + ' ' + yPos(S.y[i]).toFixed(1);
      if ((xs.length - 1) % dec) d += 'L' + xPos(xs[xs.length - 1]).toFixed(1) + ' ' + yPos(S.y[xs.length - 1]).toFixed(1);
      return d;
    }
    if (cfg.ref) mk('path', { d: pathOf(cfg.ref), fill: 'none', stroke: 'var(--muted)', 'stroke-width': 1.5, 'stroke-dasharray': '1 3' });
    cfg.series.forEach(function (S) {
      var a = { d: pathOf(S), fill: 'none', stroke: 'var(--g' + (S.gi + 1) + ')', 'stroke-width': 2, 'stroke-linejoin': 'round' };
      if (DASH[S.gi]) a['stroke-dasharray'] = DASH[S.gi];
      mk('path', a);
    });
    // 直接標籤（尾端），避免重疊
    var lab = cfg.series.map(function (S) { return { S: S, y: yPos(S.y[S.y.length - 1]) }; }).sort(function (a, b) { return a.y - b.y; });
    for (var li = 1; li < lab.length; li++) if (lab[li].y - lab[li - 1].y < 14) lab[li].y = lab[li - 1].y + 14;
    var maxc = narrow ? 4 : 7;
    lab.forEach(function (L) {
      var nm = L.S.name.length > maxc ? L.S.name.slice(0, maxc) + '…' : L.S.name;
      mk('text', { x: m.l + pw + 5, y: L.y + 4, fill: 'var(--g' + (L.S.gi + 1) + ')', 'font-size': 12, 'font-weight': 700 }, (L.S.prefix || '') + nm);
    });
    // 互動
    var cross = mk('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ph, stroke: 'var(--ink2)', 'stroke-width': 1, visibility: 'hidden' });
    var dots = cfg.series.map(function (S) { return mk('circle', { r: 4, fill: 'var(--g' + (S.gi + 1) + ')', stroke: 'var(--bg)', 'stroke-width': 1.5, visibility: 'hidden' }); });
    var ov = mk('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
    host.appendChild(svg);
    var tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip);
    function show(clientX) {
      var r = svg.getBoundingClientRect(), px_ = (clientX - r.left) * (W / r.width);
      var t = x0 + (px_ - m.l) / pw * (x1 - x0);
      var lo2 = 0, hi2 = xs.length - 1;
      while (hi2 - lo2 > 1) { var mid = (lo2 + hi2) >> 1; if (xs[mid] <= t) lo2 = mid; else hi2 = mid; }
      var i = (Math.abs(xs[lo2] - t) <= Math.abs(xs[hi2] - t)) ? lo2 : hi2;
      var cx = xPos(xs[i]);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      var h = '<div><b>' + ds[i] + '</b></div>';
      cfg.series.forEach(function (S, si) {
        dots[si].setAttribute('cx', cx); dots[si].setAttribute('cy', yPos(S.y[i])); dots[si].setAttribute('visibility', 'visible');
        h += '<div><b style="color:var(--g' + (S.gi + 1) + ')">' + esc(S.tip) + '</b>　' + cfg.tipFmt(S.y[i]) + '</div>';
      });
      if (cfg.ref) h += '<div>累計投入　' + cfg.tipFmt(cfg.ref.y[i]) + '</div>';
      tip.innerHTML = h; tip.style.display = 'block';
      var tw = tip.offsetWidth, left = cx * (r.width / W) + 12;
      if (left + tw > r.width) left = cx * (r.width / W) - tw - 12;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
    }
    function hide() { cross.setAttribute('visibility', 'hidden'); dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); }); tip.style.display = 'none'; }
    ov.addEventListener('pointermove', function (ev) { show(ev.clientX); });
    ov.addEventListener('pointerdown', function (ev) { show(ev.clientX); });
    ov.addEventListener('pointerleave', hide);
  }
  function navChart(host, res, log, height) {
    var s = res.s, e = res.e, n = e - s + 1, xs = new Array(n), ds = new Array(n);
    for (var i = 0; i < n; i++) { xs[i] = ms[s + i]; ds[i] = dates[s + i]; }
    var ser = res.out.map(function (o) { return { gi: o.gi, y: Array.prototype.slice.call(o.sim.val), name: gname(o.g), tip: tag(o.g), prefix: isDef(o.g) ? '' : LET[o.gi] + ' ' }; });
    var ref = res.mode === 'monthly' ? { gi: -1, y: Array.prototype.slice.call(res.out[0].sim.contrib), name: '累計投入' } : null;
    chart(host, { xs: xs, dates: ds, series: ser, ref: ref, scale: log ? 'log' : 'lin', fmt: shortMoney, tipFmt: money, height: height });
  }
  function ddChart(host, res, height) {
    var s = res.s, e = res.e, n = e - s + 1, xs = new Array(n), ds = new Array(n);
    for (var i = 0; i < n; i++) { xs[i] = ms[s + i]; ds[i] = dates[s + i]; }
    chart(host, { xs: xs, dates: ds, series: res.out.map(function (o) { return { gi: o.gi, y: Array.prototype.slice.call(o.st.drawdown), name: gname(o.g), tip: tag(o.g), prefix: isDef(o.g) ? '' : LET[o.gi] + ' ' }; }), scale: 'dd', fmt: function (v) { return pct(v, 0); }, tipFmt: function (v) { return pct(v, 1); }, height: height });
  }

  /* ---------- 組合設定介面 ----------
     groups: [{ on, name, items:[{id,w}] }]；o: { onChange, addBtn, removeFrom, maxItems, noName } */
  function optionsHtml(sel) {
    var h = '';
    CATS.forEach(function (c) {
      h += '<optgroup label="' + c + '">';
      D.assets.filter(function (a) { return a.cat === c; }).forEach(function (a) {
        h += '<option value="' + a.id + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.name) + '　' + a.start.slice(0, 7) + ' 起</option>';
      });
      h += '</optgroup>';
    });
    return h;
  }
  function groupsUI(host, groups, o) {
    var maxItems = o.maxItems || 8;
    function render() {
      host.innerHTML = '';
      groups.forEach(function (g, gi) {
        if (!g.on) return;
        var card = document.createElement('div');
        card.className = 'gcard c' + (gi + 1);
        var h = '<div class="ghead"><span class="gl">' + LET[gi] + '</span>' +
          (o.noName ? '' : '<input type="text" class="gname" maxlength="20" placeholder="組合 ' + LET[gi] + '" aria-label="組合 ' + LET[gi] + ' 的名稱" value="' + esc(g.name) + '">') +
          '</div><div class="rows"></div>';
        var canRm = o.removeFrom != null && gi >= o.removeFrom;
        h += '<div class="gsum"></div><div class="gerr"></div><div class="gfoot"><button type="button" class="sbtn add">加一檔</button>' + (canRm ? '<button type="button" class="sbtn rm">移除這組</button>' : '') + '</div>';
        card.innerHTML = h;
        host.appendChild(card);
        var rows = card.querySelector('.rows');
        var drawRows = function () {
          rows.innerHTML = '';
          g.items.forEach(function (it, ii) {
            var r = document.createElement('div'); r.className = 'grow';
            r.innerHTML = '<select aria-label="資產">' + optionsHtml(it.id) + '</select><input type="number" min="0" max="100" step="1" inputmode="numeric" aria-label="比例（%）" value="' + esc(it.w) + '"><span class="pc">%</span><button type="button" class="xbtn" aria-label="刪除這一檔">×</button>';
            r.querySelector('select').addEventListener('change', function (e) { it.id = e.target.value; o.onChange(); });
            r.querySelector('input').addEventListener('input', function (e) { it.w = e.target.value; o.onChange(); });
            r.querySelector('button').addEventListener('click', function () { if (g.items.length > 1) { g.items.splice(ii, 1); drawRows(); o.onChange(); } });
            rows.appendChild(r);
          });
        };
        drawRows();
        var nm = card.querySelector('.gname');
        if (nm) nm.addEventListener('input', function (e) { g.name = e.target.value; o.onChange(); });
        card.querySelector('.add').addEventListener('click', function () {
          if (g.items.length >= maxItems) return;
          var used = g.items.map(function (x) { return x.id; });
          var pick = D.assets.filter(function (a) { return used.indexOf(a.id) < 0; })[0];
          g.items.push({ id: pick ? pick.id : '0050', w: '0' }); drawRows(); o.onChange();
        });
        var rm = card.querySelector('.rm');
        if (rm) rm.addEventListener('click', function () { g.on = false; render(); o.onChange(); });
      });
      if (o.addBtn) o.addBtn.style.display = (groups[2] && !groups[2].on) ? '' : 'none';
    }
    return { render: render };
  }
  /* 更新各組卡片上的「合計」與錯誤訊息。vs: [{ v: validate 結果 }]，依序對應畫面上的卡片 */
  function paintCards(host, vs) {
    var cards = host.querySelectorAll('.gcard');
    vs.forEach(function (o, ci) {
      var c = cards[ci]; if (!c) return;
      var sm = c.querySelector('.gsum');
      sm.textContent = '合計 ' + o.v.sum + '%';
      sm.className = 'gsum' + (o.v.sum !== 100 || o.v.err ? ' bad' : '');
      c.querySelector('.gerr').textContent = o.v.err;
    });
  }

  /* ---------- 網址參數 ----------
     ?p1=0050:100&p2=0056:100（多檔用逗號：p1=0050:60,IEF:40），另有 mode、amt、start、end、rebal */
  function parseParams(search) {
    var q = {}, out = { groups: [null, null, null], mode: null, amount: null, start: null, end: null, rebal: null };
    String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return; var i = kv.indexOf('=');
      var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i)), v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
      q[k] = v;
    });
    [1, 2, 3].forEach(function (n) {
      var v = q['p' + n]; if (!v) return;
      var items = [];
      v.split(',').forEach(function (part) {
        var a = part.split(':'), id = a[0], w = a[1];
        if (AS[id] && /^\d+$/.test(w || '')) items.push({ id: id, w: w });
      });
      if (items.length) out.groups[n - 1] = items;
    });
    if (q.mode === 'lump' || q.mode === 'monthly') out.mode = q.mode;
    if (q.amt && /^\d+$/.test(q.amt)) out.amount = q.amt;
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.start || '')) out.start = q.start;
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.end || '')) out.end = q.end;
    if (q.rebal === 'annual' || q.rebal === 'none') out.rebal = q.rebal;
    return out;
  }
  function buildParams(groups, extra) {
    var p = [];
    groups.forEach(function (g, i) {
      if (!g.on) return;
      var s = g.items.filter(function (it) { return String(it.w).trim() !== '' && it.w !== '0'; }).map(function (it) { return it.id + ':' + String(it.w).trim(); }).join(',');
      if (s) p.push('p' + (i + 1) + '=' + encodeURIComponent(s).replace(/%3A/g, ':').replace(/%2C/g, ','));
    });
    if (extra) Object.keys(extra).forEach(function (k) { if (extra[k]) p.push(k + '=' + encodeURIComponent(extra[k])); });
    return p.length ? '?' + p.join('&') : '';
  }

  var API = {
    CATS: CATS, LET: LET, DASH: DASH,
    esc: esc, pct: pct, money: money, shortMoney: shortMoney, span: span,
    load: load, setData: setData,
    asset: function (id) { return AS[id]; }, assets: function () { return D.assets; }, dates: function () { return dates; }, dataEnd: function () { return dates[NN - 1]; },
    validate: validate, simulate: simulate, stats: stats, compute: compute, shortNote: shortNote,
    statsHtml: statsHtml, yearlyHtml: yearlyHtml, warnsHtml: warnsHtml, legendHtml: legendHtml,
    chart: chart, navChart: navChart, ddChart: ddChart,
    groupsUI: groupsUI, paintCards: paintCards,
    parseParams: parseParams, buildParams: buildParams,
    gname: gname, tag: tag, isDef: isDef
  };
  root.TOOL = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
