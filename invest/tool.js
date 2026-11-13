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
  /* 資金加權年化（XIRR）：解 r 使 Σ 投入 ×(1+r)^(距終點年數) = 期末金額；二分法 −99%～+1000%，容差 1e-7；無解或期間不到一年回傳 null */
  function xirr(flows, e, finalV) {
    if (dayDiff(flows[0][0], e) / 365.25 < 1) return null;
    function f(r) {
      var tot = -finalV;
      for (var i = 0; i < flows.length; i++) tot += flows[i][1] * Math.pow(1 + r, dayDiff(flows[i][0], e) / 365.25);
      return tot;
    }
    var lo = -0.99, hi = 10, flo = f(lo), fhi = f(hi);
    if (!(flo < 0 && fhi > 0)) return null;
    for (var it = 0; it < 200 && hi - lo > 1e-7; it++) { var mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function stats(sim, s, e, mode, amount) {
    var n = e - s + 1, nav = sim.nav, i;
    var finalV = sim.val[n - 1], contributed = sim.contrib[n - 1];
    var years = dayDiff(s, e) / 365.25;
    var twr = years > 0 ? Math.pow(nav[n - 1], 1 / years) - 1 : null;
    var xi = mode === 'lump' ? null : xirr(sim.flows, e, finalV);
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
    // 夏普值：每日（組合報酬 − 台幣定存報酬）的平均 ÷ 樣本標準差，乘以 √（每年交易日數），與年化波動同一算法
    var sharpe = null, sharpeNA = false, cashA = AS['CASH_TWD'];
    if (m > 20 && cashA && cashA.i0 <= s) {
      var ex = new Float64Array(m), exSum = 0;
      for (i = 1; i < n; i++) { ex[i - 1] = (nav[i] / nav[i - 1] - 1) - (px(cashA, s + i) / px(cashA, s + i - 1) - 1); exSum += ex[i - 1]; }
      var exMean = exSum / m, exSq = 0;
      for (i = 0; i < m; i++) exSq += (ex[i] - exMean) * (ex[i] - exMean);
      var exSd = Math.sqrt(exSq / (m - 1));
      if (exSd < 1e-10) sharpeNA = true; else sharpe = exMean / exSd * Math.sqrt(m / years);
    }
    // 前五大下跌：從創新高那天起，到淨值回到或超過前高那天為止；互不重疊
    var eps = [], pk2 = nav[0], pkI = 0, trI = -1, trD = 0;
    for (i = 1; i < n; i++) {
      if (nav[i] >= pk2) {
        if (trI >= 0) eps.push({ p: pkI, t: trI, r: i, depth: trD, rec: true });
        pk2 = nav[i]; pkI = i; trI = -1; trD = 0;
      } else {
        var dd2 = nav[i] / pk2 - 1;
        if (dd2 < trD) { trD = dd2; trI = i; }
      }
    }
    if (trI >= 0) eps.push({ p: pkI, t: trI, r: n - 1, depth: trD, rec: false });
    var dd5 = eps.map(function (x, ix) { x.ix = ix; return x; }).sort(function (a, b) { return a.depth - b.depth || a.ix - b.ix; })
      .filter(function (x) { return x.depth <= -0.05; }).slice(0, 5);
    return { sharpe: sharpe, sharpeNA: sharpeNA, dd5: dd5, vol: vol, worstM: worstM, finalV: finalV, contributed: contributed, ann: ann, twr: twr, xirr: xi, mdd: mdd, mddP: mddP, mddT: mddT, longest: longest, worst: worst, yearly: yearly, drawdown: drawdown, years: years };
  }
  function partialYear(s, e) {
    return {
      first: s > 0 ? dates[s - 1].slice(0, 4) === dates[s].slice(0, 4) : true,
      last: e < NN - 1 ? dates[e + 1].slice(0, 4) === dates[e].slice(0, 4) : !(+dates[e].slice(5, 7) === 12 && +dates[e].slice(8, 10) >= 24)
    };
  }

  var CRISES = [
    { n: '2008 年金融海嘯', short: '2008', s: '2008-01-31', e: '2008-12-31' },
    { n: '2020 年疫情急跌', short: '2020', s: '2020-02-01', e: '2020-04-30' },
    { n: '2022 年升息下跌', short: '2022', s: '2022-01-03', e: '2022-12-31' }
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
  var BASIC_ROWS;
  BASIC_ROWS = ['principal', 'final', 'ann', 'mdd', 'longest', 'worst'];
  var YOURS = '你的錢實際的年化報酬';
  var ADV_ROWS = ['mddPeriod', 'worstM', 'vol', 'ratio', 'sharpe'];
  var ROWS = BASIC_ROWS.concat(ADV_ROWS);
  function statsHtml(res, rowKeys) {
    var out = res.out, s = res.s, mode = res.mode;
    var annLab = '含息年化報酬';
    var xiLab = YOURS + '<span class="sub">每一筆錢投入的時間不同，這個數字反映的是你實際放進去的錢賺了多少</span>';
    var twLab = '這個組合本身的年化報酬<span class="sub">不管什麼時候投入，組合本身每年漲多少。用來跟別的組合或單筆比較</span>';
    var defs = {
      principal: ['投入本金', function (o) { return money(o.st.contributed); }],
      final: ['期末金額', function (o) { return money(o.st.finalV); }],
      ann: [annLab, function (o) { return pct(o.st.ann, 1); }, true],
      xirr: [xiLab, function (o) { return o.st.xirr == null ? '不顯示' + (o.st.years < 1 ? '<span class="sub">期間不到 1 年</span>' : '') : pct(o.st.xirr, 1); }, true],
      twr: [twLab, function (o) { return pct(o.st.twr, 1); }, true],
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
      }],
      sharpe: ['夏普值<span class="sub">每承受一分起伏，換到多少超過台幣定存的報酬。數字越大越好，同一段期間的組合之間才能比</span>', function (o) {
        if (o.warn) return '不顯示';
        if (o.st.sharpeNA) return '不適用';
        if (o.st.sharpe == null) return '期間太短';
        return o.st.sharpe.toFixed(2);
      }]
    };
    var h = '<thead><tr><th></th>' + out.map(function (o) { return '<th class="gh" style="color:var(--g' + (o.gi + 1) + ')"><i>' + esc(tag(o.g)) + '</i><span class="sub" style="color:var(--muted)">' + esc(o.comp) + '</span></th>'; }).join('') + '</tr></thead><tbody>';
    var keys = [];
    (rowKeys || ROWS).forEach(function (k) { if (k === 'ann' && mode !== 'lump') keys.push('xirr', 'twr'); else keys.push(k); });
    keys.forEach(function (k) {
      var r = defs[k];
      h += '<tr data-k="' + k + '"><th scope="row">' + r[0] + '</th>' + out.map(function (o) { return '<td' + (r[2] ? ' style="font-weight:700"' : '') + '>' + r[1](o) + '</td>'; }).join('') + '</tr>';
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
  function crisisOverlap(res) {
    var a = dates[res.s], b = dates[res.e];
    return CRISES.some(function (c) { return !(c.e < a || c.s > b); });
  }
  function legendHtml(res, opts) {
    opts = opts || {};
    var leg = res.out.map(function (o) {
      return '<span><svg width="30" height="10" aria-hidden="true"><line x1="1" y1="5" x2="29" y2="5" stroke="var(--g' + (o.gi + 1) + ')" stroke-width="2"' + (DASH[o.gi] ? ' stroke-dasharray="' + DASH[o.gi] + '"' : '') + '/></svg><b style="color:var(--g' + (o.gi + 1) + ')">' + esc(tag(o.g)) + '</b><em class="lc">' + esc(o.comp) + '</em></span>';
    }).join('');
    if (res.mode === 'monthly' && !opts.noContrib) leg += '<span><svg width="30" height="10" aria-hidden="true"><line x1="1" y1="5" x2="29" y2="5" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="1 3"/></svg>累計投入</span>';
    if (opts.bands !== false && crisisOverlap(res)) leg += '<span><svg width="16" height="10" aria-hidden="true"><rect width="16" height="10" fill="var(--muted)" fill-opacity=".22"/></svg>灰底是三次大跌期間</span>';
    return leg;
  }
  function barLegendHtml(res) {
    return res.out.map(function (o) {
      var fill = o.gi === 0 ? 'var(--g1)' : 'url(#hatch' + (o.gi + 1) + ')';
      return '<span><svg width="18" height="12" aria-hidden="true"><rect x="1" y="1" width="16" height="10" fill="' + fill + '" stroke="var(--g' + (o.gi + 1) + ')" stroke-width="1.5"/></svg><b style="color:var(--g' + (o.gi + 1) + ')">' + esc(tag(o.g)) + '</b><em class="lc">' + esc(o.comp) + '</em></span>';
    }).join('');
  }

  /* ---------- 滾動報酬 ---------- */
  var ROLL_N = [1, 3, 5, 10], ROLL_MIN = 250;
  /* 起點日 d 單筆買進，抱到 d 往後 N 年同月同日當天或之前最近的交易日；終點超出資料的起點不算 */
  function rollSeries(nav, s, e, N) {
    var n = e - s + 1, ann = [], j = 0, lose = 0;
    for (var i = 0; i < n; i++) {
      var d = dates[s + i], tgt = (+d.slice(0, 4) + N) + d.slice(4);
      if (tgt > dates[e]) break;
      while (j + 1 < n && dates[s + j + 1] <= tgt) j++;
      ann.push(Math.pow(nav[j] / nav[i], 1 / N) - 1);
      if (nav[j] < nav[i] * (1 - 1e-12)) lose++; // 價格完全相同算持平，不算賠（淨值連乘有 1e-16 等級的誤差）
    }
    return { ann: ann, lose: lose };
  }
  function median(a) {
    var b = a.slice().sort(function (x, y) { return x - y; }), k = b.length;
    return k % 2 ? b[(k - 1) >> 1] : (b[k / 2 - 1] + b[k / 2]) / 2;
  }
  function rollAll(res) {
    if (res._roll) return res._roll;
    res._roll = ROLL_N.map(function (N) {
      var rows = res.out.map(function (o) {
        var r = rollSeries(o.sim.nav, res.s, res.e, N), a = r.ann, K = a.length;
        var ok = K >= ROLL_MIN, best = -Infinity, worst = Infinity;
        for (var i = 0; i < K; i++) { if (a[i] > best) best = a[i]; if (a[i] < worst) worst = a[i]; }
        return { ann: a, K: K, ok: ok, best: best, worst: worst, med: ok ? median(a) : null, lose: r.lose, loseShare: K ? r.lose / K : null };
      });
      return { N: N, K: rows.length ? rows[0].K : 0, ok: rows.length > 0 && rows.every(function (r) { return r.ok; }), rows: rows };
    });
    return res._roll;
  }
  function rollHtml(res) {
    var R = rollAll(res), out = res.out;
    var h = '<thead><tr><th scope="col"></th><th scope="col">最好</th><th scope="col">中位數</th><th scope="col">最差</th><th scope="col">期末是賠的起點占比</th></tr></thead><tbody>';
    R.forEach(function (g) {
      h += '<tr class="rsecrow"><th colspan="5" scope="colgroup" class="rsec" data-n="' + g.N + '">持有 ' + g.N + ' 年</th></tr>';
      if (!g.ok) { h += '<tr data-n="' + g.N + '"><td colspan="5" class="rna">期間不夠</td></tr>'; return; }
      out.forEach(function (o, oi) {
        var r = g.rows[oi];
        h += '<tr data-n="' + g.N + '"><th scope="row" style="color:var(--g' + (o.gi + 1) + ')"><i>' + esc(tag(o.g)) + '</i></th><td data-c="best">' + pct(r.best, 1) + '</td><td data-c="med">' + pct(r.med, 1) + '</td><td data-c="worst">' + pct(r.worst, 1) + '</td><td data-c="share">' + pct(r.loseShare, 1) + '<span class="cnt"><span>' + r.lose.toLocaleString('en-US') + '／' + r.K.toLocaleString('en-US') + '</span> <span>個起點</span></span></td></tr>';
      });
    });
    return h + '</tbody>';
  }
  function rollAvailable(res) { return rollAll(res).filter(function (g) { return g.ok; }).map(function (g) { return g.N; }); }

  /* ---------- 前五大下跌 ---------- */
  function dd5Html(res) {
    var h = '';
    res.out.forEach(function (o) {
      if (res.out.length > 1) h += '<h4 class="gtitle" style="color:var(--g' + (o.gi + 1) + ')">' + esc(tag(o.g)) + '<em class="lc">' + esc(o.comp) + '</em></h4>';
      var list = o.st.dd5;
      if (!list.length) { h += '<p class="t-note">這段期間沒有超過 5% 的下跌。</p>'; return; }
      h += '<div class="dwrap"><table class="dtbl rtbl dd5tbl" data-gi="' + o.gi + '"><thead><tr><th></th><th>前高日</th><th>谷底日</th><th>跌幅</th><th>回到前高的日子</th><th>從前高到回到前高共多久</th></tr></thead><tbody>';
      list.forEach(function (x, ix) {
        h += '<tr><th scope="row">第 ' + (ix + 1) + ' 名</th><td>' + dates[res.s + x.p] + '</td><td>' + dates[res.s + x.t] + '</td><td>' + pct(x.depth, 1) + '</td><td>' + (x.rec ? dates[res.s + x.r] : '到終點還沒回到') + '</td><td>' + (x.rec ? span(dayDiff(res.s + x.p, res.s + x.r)) : '到終點已 ' + span(dayDiff(res.s + x.p, res.s + x.r)) + '，還沒回到') + '</td></tr>';
      });
      h += '</tbody></table></div>';
    });
    return h;
  }

  /* ---------- 原生 SVG 折線圖 ---------- */
  var LINK = { hosts: [], date: null }; // 三張時間序列圖共用的提示位置（用日期對齊）
  function linkBroadcast(date) { LINK.date = date; LINK.hosts.forEach(function (h) { if (h._c && h.isConnected) h._c.at(date); }); }
  function linkHide() { LINK.date = null; LINK.hosts.forEach(function (h) { if (h._c) h._c.hide(); }); }
  function tw(str, fs) { var w = 0; for (var i = 0; i < str.length; i++) w += str.charCodeAt(i) > 255 ? fs : fs * 0.58; return w; }
  function clip(str, fs, maxW) {
    if (tw(str, fs) <= maxW) return str;
    while (str.length > 1 && tw(str + '…', fs) > maxW) str = str.slice(0, -1);
    return str + '…';
  }
  function clean(x) { return Number(x.toPrecision(12)); }
  /* 5 到 6 條刻度，取 1、2、2.5、5 的倍數 */
  function niceTicks(mn, mx, fixLo, fixHi) {
    var a = fixLo != null ? fixLo : mn, b = fixHi != null ? fixHi : mx, range = b - a;
    if (!(range > 0)) range = Math.abs(b) || 1;
    var base = Math.pow(10, Math.floor(Math.log10(range / 5))), best = null;
    [0.1, 1, 10].forEach(function (e) {
      [1, 2, 2.5, 5].forEach(function (f) {
        var step = f * base * e;
        var lo = fixLo != null ? fixLo : Math.floor(mn / step + 1e-9) * step;
        var hi = fixHi != null ? fixHi : Math.ceil(mx / step - 1e-9) * step;
        if (hi <= lo) hi = lo + step;
        var cnt = Math.round((hi - lo) / step) + 1;
        var sc = Math.abs(cnt - 5.5) + Math.max(0, (hi - lo - range)) / range * 0.3;
        if (!best || sc < best.sc) best = { sc: sc, step: step, lo: lo, hi: hi, cnt: cnt };
      });
    });
    var t = []; for (var k = 0; k < best.cnt; k++) t.push(clean(best.lo + k * best.step));
    return { ticks: t, lo: t[0], hi: t[t.length - 1] };
  }
  function logTicks(mn, mx) {
    var lo = Math.log(mn * 0.9), hi = Math.log(mx * 1.1), best = null;
    [[1, 2, 5], [1, 3], [1, 2, 3, 5, 7], [1]].forEach(function (S) {
      var t = [];
      for (var p = Math.floor(Math.log10(mn * 0.9)); p <= Math.ceil(Math.log10(mx * 1.1)); p++) S.forEach(function (f) { var v = f * Math.pow(10, p); if (Math.log(v) >= lo && Math.log(v) <= hi) t.push(v); });
      var sc = Math.abs(t.length - 5.5);
      if (t.length >= 3 && (!best || sc < best.sc)) best = { sc: sc, t: t };
    });
    return { ticks: best ? best.t : [mn, mx], lo: lo, hi: hi };
  }
  function xTicks(x0, x1, pw) {
    // 橫軸只標年份（每年 1 月 1 日的位置）；期間長就隔 2、5、10、20 年標一次
    var spanM = (x1 - x0) / (30.4375 * DAY), cands = [12, 24, 60, 120, 240], c = cands[cands.length - 1];
    for (var i = 0; i < cands.length; i++) if (pw / Math.max(1, spanM / cands[i]) >= 46) { c = cands[i]; break; }
    var d0 = new Date(x0), y = d0.getUTCFullYear(), out = [];
    for (var yy = y; yy < y + 400; yy++) {
      var t = Date.UTC(yy, 0, 1);
      if (t > x1) break;
      if (t < x0 || (yy * 12) % c) continue;
      out.push({ t: t, label: String(yy) });
    }
    if (!out.length) out.push({ t: x0, label: String(y) });
    return out;
  }
  /* cfg: { xs:[ms], dates:[字串], series:[{gi,y,name,tip,lab:[行],endVal,mark:{i,text}}], ref, scale:'lin'|'log'|'dd'|'sym', fmt, tipFmt, height,
            zero, bands, fillFirst, dateLabel, tipNote } */
  function chart(host, cfg) {
    var NS = 'http://www.w3.org/2000/svg';
    var xs = cfg.xs, ds = cfg.dates;
    host.innerHTML = '';
    if (LINK.hosts.indexOf(host) < 0) LINK.hosts.push(host);
    var W = Math.max(host.clientWidth || 600, 260), narrow = W < 520, H = cfg.height || (narrow ? 290 : 350);
    var fs = narrow ? 11 : 12;
    var compact = W < 560;
    var m = { l: narrow ? 46 : 62, r: compact ? (cfg.rCompact || 30) : 156, t: 20, b: 26 };
    var ph = H - m.t - m.b, pw;
    var all = cfg.series.slice(); if (cfg.ref) all.push(cfg.ref);
    var mn = Infinity, mx = -Infinity;
    all.forEach(function (S) { for (var i = 0; i < S.y.length; i++) { var v = S.y[i]; if (v < mn) mn = v; if (v > mx) mx = v; } });
    var yPos, ticks, lo, hi, nt;
    if (cfg.scale === 'log') {
      nt = logTicks(mn, mx); lo = nt.lo; hi = nt.hi; ticks = nt.ticks;
      yPos = function (v) { return m.t + (hi - Math.log(v)) / (hi - lo) * ph; };
    } else {
      if (cfg.scale === 'dd') nt = niceTicks(Math.min(mn, -0.05), 0, null, 0);
      else if (cfg.scale === 'sym') nt = niceTicks(Math.min(mn, 0), Math.max(mx, 0.01));
      else nt = niceTicks(0, mx, 0, null);
      lo = nt.lo; hi = nt.hi; ticks = nt.ticks;
      yPos = function (v) { return m.t + (hi - v) / (hi - lo) * ph; };
    }
    m.l = Math.max(narrow ? 40 : 56, Math.ceil(Math.max.apply(null, ticks.map(function (v) { return tw(cfg.fmt(v), 11); }))) + 12);
    pw = W - m.l - m.r;
    var x0 = xs[0], x1 = xs[xs.length - 1];
    function xPos(t) { return m.l + (t - x0) / (x1 - x0) * pw; }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.style.fontVariantNumeric = 'tabular-nums';
    function mk(tg, attrs, txt) { var el = document.createElementNS(NS, tg); for (var k in attrs) el.setAttribute(k, attrs[k]); if (txt != null) el.textContent = txt; svg.appendChild(el); return el; }
    // 大跌期間底色
    if (cfg.bands !== false) CRISES.forEach(function (c) {
      var bs = Date.UTC(+c.s.slice(0, 4), +c.s.slice(5, 7) - 1, +c.s.slice(8, 10)), be = Date.UTC(+c.e.slice(0, 4), +c.e.slice(5, 7) - 1, +c.e.slice(8, 10));
      if (be < x0 || bs > x1) return;
      var l = xPos(Math.max(bs, x0)), r = xPos(Math.min(be, x1));
      mk('rect', { x: l, y: m.t, width: Math.max(1, r - l), height: ph, fill: 'var(--muted)', 'fill-opacity': 0.16 });
      if (r - l >= 30) mk('text', { x: (l + r) / 2, y: m.t - 6, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 10 }, c.short);
    });
    ticks.forEach(function (v) {
      var y = yPos(v);
      mk('line', { x1: m.l, x2: m.l + pw, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': 0.8, 'stroke-opacity': 0.8 });
      mk('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, cfg.fmt(v));
    });
    var xLabs = [];
    xTicks(x0, x1, pw).forEach(function (tk) {
      var x = xPos(tk.t);
      mk('line', { x1: x, x2: x, y1: m.t, y2: m.t + ph, stroke: 'var(--line)', 'stroke-width': 0.8, 'stroke-dasharray': '2 4' });
      xLabs.push(mk('text', { x: x, y: H - 8, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, tk.label));
    });
    if (cfg.zero) mk('line', { x1: m.l, x2: m.l + pw, y1: yPos(0), y2: yPos(0), stroke: 'var(--ink2)', 'stroke-width': 1.2 });
    var dec = Math.ceil(xs.length / 1800);
    function pts(S) {
      var a = [];
      for (var i = 0; i < xs.length; i += dec) a.push([xPos(xs[i]), yPos(S.y[i])]);
      if ((xs.length - 1) % dec) a.push([xPos(xs[xs.length - 1]), yPos(S.y[xs.length - 1])]);
      return a;
    }
    function pathOf(S) { return pts(S).map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(''); }
    if (cfg.fillFirst && cfg.series[0]) {
      var p0 = pts(cfg.series[0]), z = yPos(0);
      mk('path', { d: pathOf(cfg.series[0]) + 'L' + p0[p0.length - 1][0].toFixed(1) + ' ' + z.toFixed(1) + 'L' + p0[0][0].toFixed(1) + ' ' + z.toFixed(1) + 'Z', fill: 'var(--g' + (cfg.series[0].gi + 1) + ')', 'fill-opacity': 0.13, stroke: 'none' });
    }
    if (cfg.ref) mk('path', { d: pathOf(cfg.ref), fill: 'none', stroke: 'var(--muted)', 'stroke-width': 1.5, 'stroke-dasharray': '1 3' });
    cfg.series.forEach(function (S) {
      var a = { d: pathOf(S), fill: 'none', stroke: 'var(--g' + (S.gi + 1) + ')', 'stroke-width': 2, 'stroke-linejoin': 'round' };
      if (DASH[S.gi]) a['stroke-dasharray'] = DASH[S.gi];
      mk('path', a);
    });
    // 最大跌幅標記：圓點＋數字；數字放在圓點左右兩側並互相錯開，排不開就只標最深的一組
    var marks = cfg.series.filter(function (S) { return S.mark; }).map(function (S) {
      return { S: S, cx: xPos(xs[S.mark.i]), cy: yPos(S.y[S.mark.i]), w: tw(S.mark.text, 11) + 4, h: 14 };
    });
    function hit(a, b) { return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y); }
    marks.forEach(function (k) { mk('circle', { cx: k.cx, cy: k.cy, r: 4, fill: 'var(--g' + (k.S.gi + 1) + ')', stroke: 'var(--bg)', 'stroke-width': 1.5 }); });
    function placeMarks(list) {
      var placed = marks.map(function (k) { return { x: k.cx - 6, y: k.cy - 6, w: 12, h: 12 }; }), res = [];
      for (var mi = 0; mi < list.length; mi++) {
        var k = list[mi], pick = null, dys = [0, -k.h - 1, k.h + 1, -2 * k.h - 2, 2 * k.h + 2];
        var sides = [function (dy) { return { x: k.cx - 8 - k.w, y: k.cy - k.h / 2 + dy }; }, function (dy) { return { x: k.cx + 8, y: k.cy - k.h / 2 + dy }; }];
        for (var si = 0; si < sides.length && !pick; si++) for (var di = 0; di < dys.length && !pick; di++) {
          var p = sides[si](dys[di]), r = { x: p.x, y: p.y, w: k.w, h: k.h };
          if (r.x < m.l || r.x + r.w > m.l + pw || r.y < m.t || r.y + r.h > m.t + ph) continue;
          if (placed.some(function (q) { return hit(r, q); })) continue;
          pick = r;
        }
        if (!pick) return null;
        placed.push(pick); res.push({ k: k, r: pick });
      }
      return res;
    }
    if (marks.length) {
      var byDepth = marks.slice().sort(function (a, b) { return b.cy - a.cy; }); // 越深（畫面越下方）越先排
      var plan = placeMarks(byDepth) || placeMarks(byDepth.slice(0, 1));
      if (plan) plan.forEach(function (it) {
        mk('text', { x: it.r.x + it.r.w / 2, y: it.r.y + it.r.h - 3, 'text-anchor': 'middle', fill: 'var(--g' + (it.k.S.gi + 1) + ')', 'font-size': 11, 'font-weight': 700, stroke: 'var(--card)', 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, it.k.S.mark.text);
      });
    }
    // 線尾直接標籤（組合名稱、成分、期末數字），上下互相避開
    var lh = fs + 2, maxW = m.r - 10;
    var labs = cfg.series.map(function (S) {
      var lines = [];
      if (compact) lines.push({ t: clip(S.labShort || S.name, fs, maxW), bold: true, muted: false });
      else {
        (S.lab || [S.name]).forEach(function (t, k) { lines.push({ t: clip(t, fs, maxW), bold: k === 0, muted: k > 0 }); });
        if (S.endVal) lines.push({ t: clip(S.endVal, fs, maxW), bold: true, muted: false });
      }
      return { S: S, lines: lines, h: lines.length * lh, top: yPos(S.y[S.y.length - 1]) - lines.length * lh / 2 };
    }).sort(function (a, b) { return a.top - b.top; });
    var minTop = 2, maxBot = H - 4, gap = 4, li;
    for (li = 0; li < labs.length; li++) labs[li].top = Math.max(labs[li].top, li ? labs[li - 1].top + labs[li - 1].h + gap : minTop);
    for (li = labs.length - 1; li >= 0; li--) { var lim = li < labs.length - 1 ? labs[li + 1].top - gap : maxBot; if (labs[li].top + labs[li].h > lim) labs[li].top = lim - labs[li].h; }
    labs.forEach(function (L) {
      L.lines.forEach(function (ln, k) {
        mk('text', { x: m.l + pw + 6, y: L.top + k * lh + fs, fill: ln.muted ? 'var(--muted)' : 'var(--g' + (L.S.gi + 1) + ')', 'font-size': ln.muted ? fs - 1 : fs, 'font-weight': ln.bold ? 700 : 400 }, ln.t);
      });
    });
    // 互動：滑鼠、手指、鍵盤；三張圖用日期連動
    var cross = mk('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ph, stroke: 'var(--ink2)', 'stroke-width': 1, visibility: 'hidden' });
    var dots = cfg.series.map(function (S) { return mk('circle', { r: 4, fill: 'var(--g' + (S.gi + 1) + ')', stroke: 'var(--bg)', 'stroke-width': 1.5, visibility: 'hidden' }); });
    var ov = mk('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
    host.appendChild(svg);
    // 瀏覽器設了最小字級時，實際字寬會比估的大：量實際寬度，重疊的刻度字隱藏
    (function () {
      var lastR = -Infinity;
      xLabs.forEach(function (el) {
        var bb; try { bb = el.getBBox(); } catch (e) { return; }
        if (!bb || !bb.width) return;
        if (bb.x < lastR + 8 || bb.x + bb.width > W) el.setAttribute('visibility', 'hidden');
        else lastR = bb.x + bb.width;
      });
    })();
    var tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip);
    function idxOf(date) { var a = 0, b = ds.length - 1; while (a < b) { var md = (a + b) >> 1; if (ds[md] < date) a = md + 1; else b = md; } return ds[a] === date ? a : -1; }
    function hide() { cross.setAttribute('visibility', 'hidden'); dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); }); tip.style.display = 'none'; }
    function showIdx(i) {
      var cx = xPos(xs[i]);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      var h = '<div><b>' + (cfg.dateLabel || '') + ds[i] + '</b></div>' + (cfg.tipNote ? '<div class="tn">' + cfg.tipNote + '</div>' : '');
      cfg.series.forEach(function (S, si) {
        dots[si].setAttribute('cx', cx); dots[si].setAttribute('cy', yPos(S.y[i])); dots[si].setAttribute('visibility', 'visible');
        h += '<div><b style="color:var(--g' + (S.gi + 1) + ')">' + esc(S.tip) + '</b>　' + cfg.tipFmt(S.y[i]) + '</div>';
      });
      if (cfg.ref) h += '<div>累計投入　' + cfg.tipFmt(cfg.ref.y[i]) + '</div>';
      tip.innerHTML = h; tip.style.display = 'block';
      var r = svg.getBoundingClientRect(), k = r.width / W, tw_ = tip.offsetWidth, th = tip.offsetHeight, left = cx * k + 12;
      if (left + tw_ > r.width) left = cx * k - tw_ - 12;
      tip.style.left = Math.min(Math.max(0, left), Math.max(0, r.width - tw_)) + 'px';
      tip.style.top = Math.max(0, Math.min(8, r.height - th)) + 'px';
    }
    function fromX(clientX) {
      var r = svg.getBoundingClientRect(), px_ = (clientX - r.left) * (W / r.width);
      var t = x0 + (px_ - m.l) / pw * (x1 - x0);
      var a = 0, b = xs.length - 1;
      while (b - a > 1) { var mid = (a + b) >> 1; if (xs[mid] <= t) a = mid; else b = mid; }
      return (Math.abs(xs[a] - t) <= Math.abs(xs[b] - t)) ? a : b;
    }
    ov.addEventListener('pointermove', function (ev) { linkBroadcast(ds[fromX(ev.clientX)]); });
    ov.addEventListener('pointerdown', function (ev) { linkBroadcast(ds[fromX(ev.clientX)]); });
    ov.addEventListener('pointerleave', linkHide);
    host.setAttribute('tabindex', '0');
    host.onkeydown = function (ev) {
      var k = ev.key, i = LINK.date != null ? idxOf(LINK.date) : -1;
      if (k === 'ArrowLeft') i = i < 0 ? ds.length - 1 : Math.max(0, i - 1);
      else if (k === 'ArrowRight') i = i < 0 ? 0 : Math.min(ds.length - 1, i + 1);
      else if (k === 'Home') i = 0;
      else if (k === 'End') i = ds.length - 1;
      else if (k === 'Escape') { linkHide(); return; }
      else return;
      ev.preventDefault(); linkBroadcast(ds[i]);
    };
    host.onblur = linkHide;
    host._c = { at: function (date) { var i = idxOf(date); if (i < 0) hide(); else showIdx(i); }, hide: hide };
    if (LINK.date != null && idxOf(LINK.date) >= 0) showIdx(idxOf(LINK.date));
  }
  function seriesOf(o) {
    var lab = isDef(o.g) ? [LET[o.gi] + '　' + o.comp] : [LET[o.gi] + '　' + gname(o.g), o.comp];
    return { gi: o.gi, name: gname(o.g), tip: tag(o.g), lab: lab, labShort: LET[o.gi] };
  }
  function navChart(host, res, log, height) {
    var s = res.s, e = res.e, n = e - s + 1, xs = new Array(n), ds = new Array(n);
    for (var i = 0; i < n; i++) { xs[i] = ms[s + i]; ds[i] = dates[s + i]; }
    var ser = res.out.map(function (o) { var S = seriesOf(o); S.y = Array.prototype.slice.call(o.sim.val); S.endVal = shortMoney(o.st.finalV); S.labShort = LET[o.gi] + '　' + S.endVal; return S; });
    var ref = res.mode === 'monthly' ? { gi: -1, y: Array.prototype.slice.call(res.out[0].sim.contrib), name: '累計投入' } : null;
    chart(host, { xs: xs, dates: ds, series: ser, ref: ref, scale: log ? 'log' : 'lin', fmt: shortMoney, tipFmt: money, height: height, rCompact: 84 });
  }
  function ddChart(host, res, height) {
    var s = res.s, e = res.e, n = e - s + 1, xs = new Array(n), ds = new Array(n);
    for (var i = 0; i < n; i++) { xs[i] = ms[s + i]; ds[i] = dates[s + i]; }
    var ser = res.out.map(function (o) {
      var S = seriesOf(o); S.y = Array.prototype.slice.call(o.st.drawdown);
      if (o.st.mdd < 0) S.mark = { i: o.st.mddT, text: pct(o.st.mdd, 1) };
      return S;
    });
    chart(host, { xs: xs, dates: ds, series: ser, scale: 'dd', fillFirst: true, rCompact: 30, fmt: function (v) { return pct(v, Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 ? 0 : 1); }, tipFmt: function (v) { return pct(v, 1); }, height: height });
  }
  function rollChart(host, res, N, height) {
    var g = rollAll(res).filter(function (x) { return x.N === N; })[0], K = g.K, s = res.s, xs = new Array(K), ds = new Array(K);
    for (var i = 0; i < K; i++) { xs[i] = ms[s + i]; ds[i] = dates[s + i]; }
    var ser = res.out.map(function (o, oi) { var S = seriesOf(o); S.y = g.rows[oi].ann; return S; });
    chart(host, { xs: xs, dates: ds, series: ser, scale: 'sym', zero: true, rCompact: 30, dateLabel: '進場日 ', tipNote: '抱滿 ' + N + ' 年的年化報酬', fmt: function (v) { return pct(v, Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 ? 0 : 1); }, tipFmt: function (v) { return pct(v, 1); }, height: height });
  }

  /* ---------- 每年報酬分組柱狀圖 ---------- */
  function barChart(host, res, height) {
    var NS = 'http://www.w3.org/2000/svg', out = res.out, s = res.s, e = res.e, py = partialYear(s, e);
    var y0 = +dates[s].slice(0, 4), y1 = +dates[e].slice(0, 4), nY = y1 - y0 + 1, nG = out.length, yi;
    host.innerHTML = '';
    var W = Math.max(host.clientWidth || 600, 260), narrow = W < 520, H = height || (narrow ? 260 : 320);
    var m = { l: narrow ? 46 : 62, r: 10, t: 12, b: 28 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    var mn = 0, mx = 0.01;
    out.forEach(function (o) { for (var y = y0; y <= y1; y++) { var v = o.st.yearly[y]; if (v < mn) mn = v; if (v > mx) mx = v; } });
    var nt = niceTicks(mn, mx), lo = nt.lo, hi = nt.hi;
    function yPos(v) { return m.t + (hi - v) / (hi - lo) * ph; }
    function partial(y) { return (y === y0 && py.first) || (y === y1 && py.last); }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.style.fontVariantNumeric = 'tabular-nums';
    function mk(tg, attrs, txt, parent) { var el = document.createElementNS(NS, tg); for (var k in attrs) el.setAttribute(k, attrs[k]); if (txt != null) el.textContent = txt; (parent || svg).appendChild(el); return el; }
    var defs = mk('defs', {});
    [[2, 45], [3, -45]].forEach(function (p) {
      var pt = mk('pattern', { id: 'hatch' + p[0], width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(' + p[1] + ')' }, null, defs);
      mk('rect', { width: 6, height: 6, fill: 'var(--card)' }, null, pt);
      mk('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--g' + p[0] + ')', 'stroke-width': 3 }, null, pt);
    });
    nt.ticks.forEach(function (v) {
      var y = yPos(v);
      mk('line', { x1: m.l, x2: m.l + pw, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': 0.8, 'stroke-opacity': 0.8 });
      mk('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, pct(v, Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 ? 0 : 1));
    });
    var gw = pw / nY, bw = Math.min(gw * 0.8 / nG, 44), kstep = Math.max(1, Math.ceil(44 / gw));
    var hl = mk('rect', { x: 0, y: m.t, width: gw, height: ph, fill: 'var(--muted)', 'fill-opacity': 0.14, visibility: 'hidden' });
    for (yi = 0; yi < nY; yi++) {
      var y = y0 + yi, gx = m.l + yi * gw + (gw - bw * nG) / 2;
      out.forEach(function (o, j) {
        var v = o.st.yearly[y], top = yPos(Math.max(v, 0)), bot = yPos(Math.min(v, 0));
        var a = { x: gx + j * bw + (bw > 6 ? 0.5 : 0), y: top, width: Math.max(1, bw - (bw > 6 ? 1 : 0)), height: Math.max(1, bot - top), fill: o.gi === 0 ? 'var(--g1)' : 'url(#hatch' + (o.gi + 1) + ')', stroke: 'var(--g' + (o.gi + 1) + ')', 'stroke-width': o.gi === 0 ? 0 : 1.5 };
        if (partial(y)) a.opacity = 0.45;
        mk('rect', a);
        if (bw >= 38) mk('text', { x: gx + j * bw + bw / 2, y: v >= 0 ? top - 3 : bot + 11, 'text-anchor': 'middle', fill: 'var(--ink2)', 'font-size': 10 }, pct(v, 1));
      });
      if (yi % kstep === 0 || yi === nY - 1 && kstep === 1) mk('text', { x: m.l + yi * gw + gw / 2, y: H - 9, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, String(y) + (partial(y) ? '†' : ''));
    }
    mk('line', { x1: m.l, x2: m.l + pw, y1: yPos(0), y2: yPos(0), stroke: 'var(--ink2)', 'stroke-width': 1.2 });
    var ov = mk('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
    host.appendChild(svg);
    var tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip);
    var cur = -1;
    function hide() { hl.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; cur = -1; }
    function showY(i) {
      cur = i; var y = y0 + i;
      hl.setAttribute('x', m.l + i * gw); hl.setAttribute('visibility', 'visible');
      var h = '<div><b>' + y + ' 年' + (partial(y) ? '（部分期間）' : '') + '</b></div>';
      out.forEach(function (o) { h += '<div><b style="color:var(--g' + (o.gi + 1) + ')">' + esc(tag(o.g)) + '</b>　' + pct(o.st.yearly[y], 1) + '</div>'; });
      tip.innerHTML = h; tip.style.display = 'block';
      var r = svg.getBoundingClientRect(), k = r.width / W, tw_ = tip.offsetWidth, th = tip.offsetHeight, cx = (m.l + i * gw + gw / 2) * k, left = cx + 14;
      if (left + tw_ > r.width) left = cx - tw_ - 14;
      tip.style.left = Math.min(Math.max(0, left), Math.max(0, r.width - tw_)) + 'px';
      tip.style.top = Math.max(0, Math.min(8, r.height - th)) + 'px';
    }
    function fromX(cx) { var r = svg.getBoundingClientRect(), px_ = (cx - r.left) * (W / r.width); return Math.max(0, Math.min(nY - 1, Math.floor((px_ - m.l) / gw))); }
    ov.addEventListener('pointermove', function (ev) { showY(fromX(ev.clientX)); });
    ov.addEventListener('pointerdown', function (ev) { showY(fromX(ev.clientX)); });
    ov.addEventListener('pointerleave', hide);
    host.setAttribute('tabindex', '0');
    host.onkeydown = function (ev) {
      if (ev.key === 'ArrowLeft') showY(cur < 0 ? nY - 1 : Math.max(0, cur - 1));
      else if (ev.key === 'ArrowRight') showY(cur < 0 ? 0 : Math.min(nY - 1, cur + 1));
      else if (ev.key === 'Escape') hide(); else return;
      ev.preventDefault();
    };
    host.onblur = hide;
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
     ?p1=0050:100&p2=0056:100（多檔用逗號：p1=0050:60,IEF:40），另有 mode、amt、start、end、rebal；
     n1～n3＝組合名稱，log=1／0＝對數座標（沒有這個參數就依期間長短自動決定） */
  function parseParams(search) {
    var q = {}, out = { groups: [null, null, null], names: ['', '', ''], log: null, mode: null, amount: null, start: null, end: null, rebal: null };
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
    [1, 2, 3].forEach(function (n) { if (q['n' + n]) out.names[n - 1] = q['n' + n].slice(0, 20); });
    if (q.log === '1' || q.log === '0') out.log = q.log === '1';
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
      if (s) {
        p.push('p' + (i + 1) + '=' + encodeURIComponent(s).replace(/%3A/g, ':').replace(/%2C/g, ','));
        if ((g.name || '').trim()) p.push('n' + (i + 1) + '=' + encodeURIComponent(g.name.trim()));
      }
    });
    if (extra) Object.keys(extra).forEach(function (k) { if (extra[k]) p.push(k + '=' + encodeURIComponent(extra[k])); });
    return p.length ? '?' + p.join('&') : '';
  }

  /* ---------- 買多少：股票比例與跌幅 ----------
     同一檔資產配 0%～100% 股票（每格 10%），其餘放台幣定存，每年第一個交易日調回，用上面同一套 simulate()／stats()。
     期間用「該資產與台幣定存都有資料」的共同期間，11 個比例共用同一段。 */
  var SIZE_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  function sizeCalc(assetId, spec) {
    var res = compute({ groups: [{ gi: 0, name: '', items: [{ id: assetId, w: 50 }, { id: 'CASH_TWD', w: 50 }] }], mode: spec.mode, amount: spec.amount, rebal: 'annual', userStart: spec.userStart, userEnd: spec.userEnd });
    if (res.err) return { err: res.err };
    var s = res.s, e = res.e;
    var rows = SIZE_STEPS.map(function (w) {
      var items = [];
      if (w > 0) items.push({ id: assetId, w: w });
      if (w < 100) items.push({ id: 'CASH_TWD', w: 100 - w });
      var st = stats(simulate(items, s, e, spec.mode, spec.amount, 'annual'), s, e, spec.mode, spec.amount);
      return { w: w, st: st };
    });
    var years = rows[rows.length - 1].st.years;
    return { mode: spec.mode, assetId: assetId, s: s, e: e, rows: rows, years: years, warn: shortNote([{ id: assetId, w: 100 }], s, e, years) };
  }
  function annName(calc) { return calc.mode === 'monthly' ? YOURS : '含息年化報酬'; }
  function sizeRow(calc, w) { return calc.rows[w / 10]; }
  function r1(x) { return Math.round(x * 1000) / 10; }            // 小數換成百分點，取到小數 1 位
  function d1(x) { return Math.round(x * 10) / 10; }
  function sizeRatio(calc, st) {
    if (calc.warn) return '不顯示';
    if (st.mdd > -1e-9) return '沒有回落';   // 台幣定存的淨值連乘有 1e-16 等級的誤差
    return (st.ann / Math.abs(st.mdd)).toFixed(2);
  }
  function sizeLongest(l) { return l.days === 0 ? '沒有低於前高' : span(l.days) + (l.rec ? '' : '（到終點還沒回到）'); }
  function sizeWorst(st) { return st.worst ? pct(st.worst.r, 1) : '期間不到 1 年'; }
  function sizeCardsHtml(calc, cur) {
    var c = sizeRow(calc, cur).st, b = sizeRow(calc, 100).st, base = cur === 100, V = '全部買股票';
    function cmp(d, more, less, unit) { // d 已是 1 位小數的百分點差
      if (base) return '這是' + V + '的數字';
      if (d === 0) return '和' + V + '相同';
      return '比' + V + (d > 0 ? more : less) + ' ' + Math.abs(d).toFixed(1) + ' 個百分點';
    }
    var tAnn = cmp(d1(r1(c.ann) - r1(b.ann)), '多', '少');
    var dm = d1(r1(c.mdd) - r1(b.mdd));
    var tMdd = base ? '這是' + V + '的數字' : dm === 0 ? '和' + V + '相同' : '跌幅比' + V + (dm > 0 ? '少' : '多') + ' ' + Math.abs(dm).toFixed(1) + ' 個百分點';
    var tLong;
    var dl = c.longest.days - b.longest.days;
    if (base) tLong = '這是' + V + '的數字';
    else if (dl === 0) tLong = '和' + V + '相同';
    else if (Math.abs(dl) < 15) tLong = '和' + V + '相差不到 1 個月';
    else tLong = '比' + V + (dl > 0 ? '多' : '少') + ' ' + span(Math.abs(dl));
    var tWorst;
    if (!c.worst || !b.worst) tWorst = '';
    else {
      var dw = d1(r1(c.worst.r) - r1(b.worst.r));
      tWorst = base ? '這是' + V + '的數字' : dw === 0 ? '和' + V + '相同' : '比' + V + (dw > 0 ? '高' : '低') + ' ' + Math.abs(dw).toFixed(1) + ' 個百分點';
    }
    function card(lab, val, note) { return '<div class="szcard"><div class="szk">' + lab + '</div><div class="szv">' + val + '</div><div class="szn">' + note + '</div></div>'; }
    return card(annName(calc), pct(c.ann, 1), tAnn) + card('最大跌幅', pct(c.mdd, 1), tMdd) + card('最長等多久才回到前高', sizeLongest(c.longest), tLong) + card('最差一年', sizeWorst(c), tWorst);
  }
  function sizeTableHtml(calc, cur) {
    var h = '<thead><tr><th scope="col">股票比例</th><th scope="col">' + annName(calc) + '</th><th scope="col">最大跌幅</th><th scope="col">最差一年</th><th scope="col">年化 ÷ 最大跌幅</th></tr></thead><tbody>';
    calc.rows.forEach(function (r) {
      var on = r.w === cur;
      h += '<tr data-w="' + r.w + '"' + (on ? ' aria-current="true" class="on"' : '') + '><th scope="row">' + r.w + '%' + (on ? '<span class="here">目前</span>' : '') + '</th><td>' + pct(r.st.ann, 1) + '</td><td>' + pct(r.st.mdd, 1) + '</td><td>' + sizeWorst(r.st) + '</td><td>' + sizeRatio(calc, r.st) + '</td></tr>';
    });
    return h + '</tbody>';
  }
  /* 一張小長條圖：橫軸股票比例 0%～100%，目前這一根用深色、其他淡色；沿用折線圖的刻度與提示框寫法 */
  function sizeBars(host, calc, cur, key, label) {
    var NS = 'http://www.w3.org/2000/svg', rows = calc.rows, n = rows.length;
    host.innerHTML = '';
    var W = Math.max(host.clientWidth || 600, 260), narrow = W < 520, H = narrow ? 168 : 190;
    var vals = rows.map(function (r) { return r.st[key]; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var nt = key === 'mdd' ? niceTicks(Math.min(mn, -0.05), 0, null, 0) : niceTicks(Math.min(mn, 0), Math.max(mx, 0.01));
    var m = { l: 40, r: 10, t: 18, b: 24 };
    function tf(v) { return pct(v, Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 ? 0 : 1); }
    m.l = Math.max(narrow ? 40 : 56, Math.ceil(Math.max.apply(null, nt.ticks.map(function (v) { return tw(tf(v), 11); }))) + 12);
    var pw = W - m.l - m.r, ph = H - m.t - m.b, gw = pw / n, bw = Math.min(gw * 0.7, 40);
    function yPos(v) { return m.t + (nt.hi - v) / (nt.hi - nt.lo) * ph; }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.style.fontVariantNumeric = 'tabular-nums';
    function mk(tg, attrs, txt) { var el = document.createElementNS(NS, tg); for (var k in attrs) el.setAttribute(k, attrs[k]); if (txt != null) el.textContent = txt; svg.appendChild(el); return el; }
    nt.ticks.forEach(function (v) {
      var y = yPos(v);
      mk('line', { x1: m.l, x2: m.l + pw, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': 0.8, 'stroke-opacity': 0.8 });
      mk('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, tf(v));
    });
    var hl = mk('rect', { x: 0, y: m.t, width: gw, height: ph, fill: 'var(--muted)', 'fill-opacity': 0.14, visibility: 'hidden' });
    var step = gw < 34 ? 2 : 1, z = yPos(0);
    rows.forEach(function (r, i) {
      var v = vals[i], y = yPos(v), top = Math.min(y, z), hgt = Math.max(1, Math.abs(y - z)), on = r.w === cur, cx = m.l + i * gw + gw / 2;
      mk('rect', { x: cx - bw / 2, y: top, width: bw, height: hgt, fill: on ? 'var(--navy)' : 'var(--s40)' });
      if (on) mk('text', { x: cx, y: v >= 0 ? top - 4 : top + hgt + 12, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 11, 'font-weight': 700 }, pct(v, 1));
      if (i % step === 0) mk('text', { x: cx, y: H - 7, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, r.w + '%');
    });
    mk('line', { x1: m.l, x2: m.l + pw, y1: z, y2: z, stroke: 'var(--ink2)', 'stroke-width': 1.2 });
    var ov = mk('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
    host.appendChild(svg);
    var tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip);
    function hide() { hl.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; }
    function show(i) {
      hl.setAttribute('x', m.l + i * gw); hl.setAttribute('visibility', 'visible');
      tip.innerHTML = '<div><b>股票 ' + rows[i].w + '%，定存 ' + (100 - rows[i].w) + '%</b></div><div>' + label + '　' + pct(vals[i], 1) + '</div>';
      tip.style.display = 'block';
      var r = svg.getBoundingClientRect(), k = r.width / W, tw_ = tip.offsetWidth, th = tip.offsetHeight, cx = (m.l + i * gw + gw / 2) * k, left = cx + 14;
      if (left + tw_ > r.width) left = cx - tw_ - 14;
      tip.style.left = Math.min(Math.max(0, left), Math.max(0, r.width - tw_)) + 'px';
      tip.style.top = Math.max(0, Math.min(8, r.height - th)) + 'px';
    }
    function fromX(cx) { var r = svg.getBoundingClientRect(), px_ = (cx - r.left) * (W / r.width); return Math.max(0, Math.min(n - 1, Math.floor((px_ - m.l) / gw))); }
    ov.addEventListener('pointermove', function (ev) { show(fromX(ev.clientX)); });
    ov.addEventListener('pointerdown', function (ev) { show(fromX(ev.clientX)); });
    ov.addEventListener('pointerleave', hide);
  }

  var API = {
    CATS: CATS, LET: LET, DASH: DASH,
    esc: esc, pct: pct, money: money, shortMoney: shortMoney, span: span,
    load: load, setData: setData,
    asset: function (id) { return AS[id]; }, assets: function () { return D.assets; }, dates: function () { return dates; }, dataEnd: function () { return dates[NN - 1]; },
    validate: validate, simulate: simulate, stats: stats, compute: compute, shortNote: shortNote,
    statsHtml: statsHtml, yearlyHtml: yearlyHtml, warnsHtml: warnsHtml, legendHtml: legendHtml, barLegendHtml: barLegendHtml,
    BASIC_ROWS: BASIC_ROWS, ADV_ROWS: ADV_ROWS, ROLL_N: ROLL_N, rollHtml: rollHtml, rollAvailable: rollAvailable, dd5Html: dd5Html, rollAll: rollAll,
    chart: chart, navChart: navChart, ddChart: ddChart, rollChart: rollChart, barChart: barChart, CRISES: CRISES, partialYear: partialYear,
    idxOnOrAfter: idxOnOrAfter, idxOnOrBefore: idxOnOrBefore, dayDiff: dayDiff,
    groupsUI: groupsUI, paintCards: paintCards,
    parseParams: parseParams, buildParams: buildParams,
    annName: annName, SIZE_STEPS: SIZE_STEPS, sizeCalc: sizeCalc, sizeRow: sizeRow, sizeCardsHtml: sizeCardsHtml, sizeTableHtml: sizeTableHtml, sizeBars: sizeBars,
    gname: gname, tag: tag, isDef: isDef
  };
  root.TOOL = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
