(function () {
  'use strict';

  var plans = [
    { name: '繼續買 0050', monthlyAsset: '0050' },
    { name: '只改新扣款', monthlyAsset: 'VT' },
    { name: '先換一部分', monthlyAsset: 'VT' }
  ];

  function compare(T, input) {
    var dates = T.dates();
    var tw = T.asset('0050'), world = T.asset('VT');
    var start = Math.max(tw.i0, world.i0, T.idxOnOrAfter(input.start));
    var end = Math.min(T.idxOnOrBefore(tw.end), T.idxOnOrBefore(world.end), T.idxOnOrBefore(input.end));
    if (start >= end) throw new Error('這段期間至少要有兩天共同資料，請調整起點或終點。');

    var count = end - start + 1;
    var contributions = new Float64Array(count);
    contributions[0] = input.holding;
    for (var k = start + 1; k <= end; k++) {
      var isDepositDay = k < end && dates[k].slice(0, 7) !== dates[k - 1].slice(0, 7);
      contributions[k - start] = contributions[k - start - 1] + (isDepositDay ? input.monthly : 0);
    }
    var out = plans.map(function (plan, i) {
      var swapGross = i === 2 ? input.holding * input.swap / 100 : 0;
      var netSale = swapGross * (1 - input.sellTW);
      var twValue = input.holding - swapGross, worldValue = netSale * (1 - input.buyWorld);
      var cost = swapGross - worldValue, nav = 1, peak = 1, drawdown = 0;
      var values = new Float64Array(count);
      values[0] = twValue + worldValue;
      var monthlyFee = plan.monthlyAsset === '0050' ? input.buyTW : input.buyWorld;

      for (var j = 1; j < count; j++) {
        var day = start + j;
        twValue *= tw.v[day - tw.i0] / tw.v[day - tw.i0 - 1];
        worldValue *= world.v[day - world.i0] / world.v[day - world.i0 - 1];
        nav *= (twValue + worldValue) / values[j - 1];
        peak = Math.max(peak, nav);
        drawdown = Math.min(drawdown, nav / peak - 1);

        var deposit = contributions[j] - contributions[j - 1];
        var net = deposit * (1 - monthlyFee);
        if (plan.monthlyAsset === '0050') twValue += net;
        else worldValue += net;
        cost += deposit - net;
        values[j] = twValue + worldValue;
      }
      return {
        gi: i, g: { gi: i, name: plan.name }, comp: '',
        sim: { val: values, contrib: contributions },
        st: { finalV: values[count - 1] },
        drawdown: drawdown, cost: cost, swapGross: swapGross,
        twShare: twValue / values[count - 1]
      };
    });
    return { out: out, s: start, e: end, mode: 'monthly', start: dates[start], end: dates[end], principal: contributions[count - 1] };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = compare;
    return;
  }

  var T = window.TOOL;
  function el(id) { return document.getElementById(id); }
  var form = el('next-form'), results = el('next-results'), error = el('next-error');
  var status = el('next-status'), download = el('next-download'), run = el('next-run');
  var data, current, downloadUrl;

  function number(id) { return el(id).valueAsNumber; }
  function money(value) { return T.money(value); }
  function relativeAmount(value) {
    return value === 0 ? '相同' : (value < 0 ? '少 ' : '多 ') + money(Math.abs(value));
  }
  function dateRange() {
    var mode = el('period').value;
    var end = T.dataEnd();
    if (mode === 'custom') return [el('start').value, el('end').value];
    if (mode === 'all') return [T.asset('VT').start, end];
    var crisis = T.CRISES.find(function (item) { return item.short === mode; });
    if (crisis) return [crisis.s, crisis.e];
    return [String(Number(end.slice(0, 4)) - Number(mode)) + end.slice(4), end];
  }
  function readInputs() {
    var dates = dateRange();
    if (!dates[0] || !dates[1]) throw new Error('請選擇開始日期和結算日期。');
    return {
      holding: number('holding'), monthly: number('monthly'), swap: number('swap'),
      buyTW: number('buy-tw') / 100, sellTW: number('sell-tw') / 100, buyWorld: number('buy-world') / 100,
      start: dates[0], end: dates[1]
    };
  }

  function describe(entry) {
    if (entry.gi === 0) return '舊的 0050 照留，每月繼續買 0050。';
    if (entry.gi === 1) return '舊的 0050 照留，每月改買 VT。';
    return '第一天將 ' + money(entry.swapGross) + '的 0050 換成 VT，每月再買 VT。';
  }

  function render(input, res) {
    var heading = res.start + ' 至 ' + res.end + ' · 累計本金 ' + money(res.principal);
    var base = Math.round(res.out[0].st.finalV);
    var comparison = '和繼續買 0050 相比，<strong>只改新扣款</strong>的期末金額' +
      relativeAmount(Math.round(res.out[1].st.finalV) - base) + '，<strong>先換一部分</strong>的期末金額' +
      relativeAmount(Math.round(res.out[2].st.finalV) - base) + '。<br>三種做法的最大跌幅依序為 ' +
      res.out.map(function (entry) { return T.pct(entry.drawdown, 2); }).join('、') + '。';
    var cards = res.out.map(function (entry, i) {
      return '<article class="next-card next-card-' + i + '"><h3><span aria-hidden="true">' + T.LET[i] + '</span> ' +
        plans[i].name + '</h3><p class="next-plan">' + describe(entry) + '</p>' +
        '<dl><dt>期末金額</dt><dd class="next-total">' + money(entry.st.finalV) + '</dd>' +
        '<dt>期間最大跌幅</dt><dd>' + T.pct(entry.drawdown, 2) + '</dd>' +
        '<dt>期末持有 0050 比重</dt><dd>' + T.pct(entry.twShare, 1) + '</dd>' +
        '<dt>累計交易成本</dt><dd>' + money(entry.cost) + '</dd></dl></article>';
    }).join('');
    var notes = '<h3>這次用哪些假設？</h3><ul><li>開始時持有 ' + money(input.holding) + ' 的 0050，每月投入 ' +
      money(input.monthly) + '。方案三在起點先賣 ' + input.swap + '% 的 0050，再用賣出淨額買 VT。之後各方案都不調整舊部位的比例。</li>' +
      '<li>從起點的下個月開始，在每月第一個資料日收盤投入。結算日即使是月初也不追加。配息再投入，金額皆為台幣。</li>' +
      '<li>買 0050 成本 ' + T.pct(input.buyTW, 2) + '、賣 0050 成本 ' + T.pct(input.sellTW, 2) +
      '、買 VT 成本 ' + T.pct(input.buyWorld, 2) + '。每筆按金額內扣，未另計固定費用、個人稅負或股息預扣。</li>' +
      '<li>最大跌幅是持有部位從高點到低點的最大跌幅，排除入金和扣交易費當天的金額變動。期末金額已扣除上列成本。</li>' +
      '<li>0050 採證交所含息資料，VT 採含息還原價並按央行匯率換算。台美市場依資料日期對齊，休市日沿用上一筆。資料截至 ' +
      T.esc(T.dataEnd()) + '，資料版本 ' + T.esc(data.meta.generated) + '。</li></ul>';
    el('next-period').textContent = heading;
    el('next-comparison').innerHTML = comparison;
    el('next-cards').innerHTML = cards;
    el('next-assumptions').innerHTML = notes;
    results.hidden = false;
    var chart = el('next-chart');
    T.navChart(chart, res, false);
    current = { heading: heading, comparison: comparison, cards: cards, notes: notes, chart: chart.querySelector('svg').outerHTML, end: res.end };
    download.disabled = false;
  }

  function calculate(moveFocus) {
    error.hidden = true;
    try {
      var input = readInputs();
      render(input, compare(T, input));
      status.textContent = '已更新下方結果。';
      if (moveFocus) el('next-results-title').focus();
    } catch (err) {
      results.hidden = true;
      error.textContent = err.message;
      error.hidden = false;
      status.textContent = '';
    }
  }

  function markEdited() {
    if (results.hidden) return;
    download.disabled = true;
    status.textContent = '設定已變更，請重新比較。';
  }
  form.addEventListener('input', markEdited);
  form.addEventListener('invalid', function (evt) {
    var costs = evt.target.closest('details');
    if (costs) costs.open = true;
  }, true);
  el('period').addEventListener('change', function () {
    var custom = el('period').value === 'custom';
    el('date-fields').hidden = !custom;
    el('start').disabled = el('end').disabled = !custom;
    markEdited();
  });
  form.addEventListener('submit', function (evt) {
    evt.preventDefault();
    if (data) calculate(true);
  });

  download.addEventListener('click', function () {
    if (!current || download.disabled) return;
    var report = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>0050 配置比較報告</title><style>body{--g1:#243f64;--g2:#9c502a;--g3:#176b63;--line:#d7e0e7;--muted:#495e71;max-width:900px;margin:32px auto;padding:0 18px;font:16px/1.65 system-ui,sans-serif;color:#172b43}' +
      '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:12px}' +
      'article{padding:14px;border:1px solid #b6c6d3;border-top:4px solid #183759;border-radius:8px;break-inside:avoid}' +
      'h1,h2,h3{line-height:1.3}article h3{margin:3px 0}dt{color:#45596a}dd{margin:0 0 8px;font-weight:700}li+li{margin-top:6px}figure{margin:20px 0;break-inside:avoid}svg{display:block;max-width:100%;height:auto}</style></head><body>' +
      '<h1>已有 0050，下一筆怎麼買？</h1><p>' + T.esc(current.heading) + '</p><p>' + current.comparison +
      '</p><div class="cards">' + current.cards + '</div><figure><figcaption>帳戶金額走勢（新台幣）</figcaption>' +
      current.chart + '</figure><section>' + current.notes + '</section></body></html>';
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([report], { type: 'text/html;charset=utf-8' }));
    var link = document.createElement('a');
    link.href = downloadUrl;
    link.download = '0050-配置比較-' + current.end + '.html';
    document.body.appendChild(link);
    link.click();
    link.remove();
    status.textContent = '已建立比較報告，可在下載後離線開啟。';
  });

  T.load('data/tool_assets.json').then(function (loaded) {
    data = loaded;
    var dates = dateRange();
    ['start', 'end'].forEach(function (id, i) {
      el(id).min = T.asset('VT').start;
      el(id).max = T.dataEnd();
      el(id).value = dates[i];
    });
    run.disabled = false;
    calculate(false);
  }).catch(function () {
    status.textContent = '歷史資料載入失敗，請重新整理後再試。';
  });
})();
