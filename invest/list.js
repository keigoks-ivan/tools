/* 說法清單：分組、側欄分類自動產生、表格上方的市場切換鈕（全部／台股／美股）、即時篩選。
   新增一題＝在 #ledger 裡加一列 .lrow，並寫上 data-cat（分類）、data-test（這題在測什麼：進場／出場／買多少／選標的／觀察）與 data-mkt（市場，可多值、空白分隔）。
   兩個市場都測過的題目，把 .lrow 寫成 .lrow.split：說法用 a.l-claim，各市場一個 .l-mk[data-m]，
   裡面放 .l-ct（小標 .l-tag＋結論 .l-concl）與 .l-num；切換鈕只顯示對應市場的 .l-mk，data-m="多國" 的區塊只在「全部」顯示。
   整理中的題目用 <div class="lrow off">。分類顯示順序改下面的 CATS；
   沒列在這裡的新分類會接在後面，不用改程式。 */
(function () {
  'use strict';
  var CATS = ['選哪一種 ETF', '怎麼進場', '下跌與漲回', '均線與趨勢訊號', '突破與線型', '總經與事件', '選股方法', '槓桿、放空與避險', '資產配置與輪動', '房價與其他'];
  var SEG = ['全部', '台股', '美股'];
  var TESTS = ['進場', '出場', '買多少', '選標的', '觀察'];
  var ledger = document.getElementById('ledger');
  if (!ledger) return;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function order(list, v) { var i = list.indexOf(v); return i < 0 ? list.length : i; }

  var rows = [].slice.call(ledger.querySelectorAll('.lrow'));
  function cat(r) { return r.getAttribute('data-cat') || '其他'; }
  function mkts(r) { return (r.getAttribute('data-mkt') || '').split(/\s+/).filter(Boolean); }
  function test(r) { return r.getAttribute('data-test') || ''; }
  function isOn(r) { return !r.classList.contains('off'); }

  /* 依分類排序（同分類維持原順序），插入分組標題 */
  var seenCats = [];
  rows.forEach(function (r) { if (seenCats.indexOf(cat(r)) < 0) seenCats.push(cat(r)); });
  var catList = CATS.filter(function (c) { return seenCats.indexOf(c) >= 0; }).concat(seenCats.filter(function (c) { return CATS.indexOf(c) < 0; }));
  var heads = {};
  catList.forEach(function (c) {
    var h = document.createElement('div');
    h.className = 'lgroup'; h.textContent = c; h.setAttribute('data-g', c);
    ledger.appendChild(h); heads[c] = h;
    rows.filter(function (r) { return cat(r) === c; }).forEach(function (r) { ledger.appendChild(r); });
  });

  /* 計數與側欄 */
  function count(fn) { return rows.filter(function (r) { return isOn(r) && fn(r); }).length; }
  function box(id, items, kind, fn) {
    var el = $(id); if (!el) return;
    el.innerHTML = items.map(function (v) {
      return '<label class="fopt"><input type="checkbox" data-kind="' + kind + '" value="' + esc(v) + '"><span class="fl">' + esc(v) + '</span><span class="fn">' + count(function (r) { return fn(r, v); }) + '</span></label>';
    }).join('');
  }
  box('catBox', catList, 'cat', function (r, v) { return cat(r) === v; });

  /* 「這題在測什麼」：每列說法欄下方顯示標籤；側欄單選按鈕（全部＋五種），題數算法同分類（只算已測完的題） */
  rows.forEach(function (r) {
    var c = r.querySelector('.l-claim'), t = test(r);
    if (!c || !t) return;
    var s = document.createElement('span');
    s.className = 'l-test'; s.textContent = t;
    c.appendChild(s);
  });
  var testSel = '全部', testBtns = [];
  var tbox = $('testBox');
  if (tbox) {
    ['全部'].concat(TESTS).forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-t', v);
      b.innerHTML = '<span class="fl">' + esc(v) + '</span><span class="fn">' + (v === '全部' ? online0() : count(function (r) { return test(r) === v; })) + '</span>';
      b.addEventListener('click', function () { testSel = v; apply(); });
      tbox.appendChild(b); testBtns.push(b);
    });
  }
  function online0() { return count(function () { return true; }); }

  var online = count(function () { return true; });
  [].forEach.call(document.querySelectorAll('[data-online-count]'), function (e) { e.textContent = online; });
  [].forEach.call(document.querySelectorAll('[data-total-count]'), function (e) { e.textContent = rows.length; });
  [].forEach.call(document.querySelectorAll('[data-pending-count]'), function (e) { e.textContent = rows.length - online; });

  /* 篩選：關鍵字（空白分隔，全部要出現）、分類（同組聯集）、市場切換鈕（單選），三者取交集 */
  var q = $('fq'), clear = $('fclear'), cnt = $('fcount'), empty = $('fempty'), seg = $('mseg');
  var market = '全部', segBtns = [];
  if (seg) {
    SEG.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-m', m);
      b.innerHTML = '<span class="ml">' + esc(m) + '</span> <span class="mn"></span>';
      b.addEventListener('click', function () { market = m; apply(); });
      seg.appendChild(b); segBtns.push(b);
    });
  }
  function inMarket(r, m) { return m === '全部' || mkts(r).indexOf(m) >= 0; }
  function rowText(r) {
    var blocks = [].slice.call(r.querySelectorAll('.l-mk'));
    if (!blocks.length) return r.textContent;
    var t = (r.querySelector('.l-claim') || r).textContent;
    blocks.forEach(function (b) { if (market === '全部' || b.getAttribute('data-m') === market) t += ' ' + b.textContent; });
    return t;
  }
  function checked(kind) {
    return [].slice.call(document.querySelectorAll('input[data-kind="' + kind + '"]:checked')).map(function (i) { return i.value; });
  }
  function apply() {
    var words = (q ? q.value : '').toLowerCase().split(/\s+/).filter(Boolean);
    var cs = checked('cat');
    var ts = testSel;
    var shown = 0, perCat = {}, perM = { '全部': 0, '台股': 0, '美股': 0 };
    rows.forEach(function (r) {
      var hay = (rowText(r) + ' ' + cat(r) + ' ' + mkts(r).join(' ')).toLowerCase();
      var base = words.every(function (w) { return hay.indexOf(w) >= 0; }) &&
        (!cs.length || cs.indexOf(cat(r)) >= 0) &&
        (ts === '全部' || test(r) === ts);
      if (base) SEG.forEach(function (m) { if (inMarket(r, m)) perM[m]++; });
      var ok = base && inMarket(r, market);
      r.hidden = !ok;
      [].forEach.call(r.querySelectorAll('.l-mk'), function (b) {
        b.hidden = !(market === '全部' || b.getAttribute('data-m') === market);
      });
      if (ok) { shown++; perCat[cat(r)] = true; }
    });
    segBtns.forEach(function (b) {
      var m = b.getAttribute('data-m');
      b.setAttribute('aria-pressed', m === market ? 'true' : 'false');
      b.querySelector('.mn').textContent = perM[m];
    });
    testBtns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-t') === testSel ? 'true' : 'false'); });
    catList.forEach(function (c) { heads[c].hidden = !perCat[c]; });
    if (empty) empty.hidden = shown > 0;
    if (cnt) cnt.textContent = '符合 ' + shown + ' 題';
    if (clear) clear.hidden = !(words.length || cs.length || ts !== '全部' || market !== '全部');
  }
  if (q) q.addEventListener('input', apply);
  [].forEach.call(document.querySelectorAll('input[data-kind]'), function (i) { i.addEventListener('change', apply); });
  if (clear) clear.addEventListener('click', function () {
    if (q) q.value = '';
    market = '全部'; testSel = '全部';
    [].forEach.call(document.querySelectorAll('input[data-kind]'), function (i) { i.checked = false; });
    apply();
  });
  apply();
})();
