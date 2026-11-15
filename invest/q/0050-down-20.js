(function () {
  'use strict';

  var names = ['續扣', '停扣', '加碼'];

  function simulate(rows, stock, cash, monthly) {
    var principal = stock + cash;
    var values = rows.map(function () { return principal; });
    for (var k = 1; k < rows.length; k++) {
      var monthStart = k < rows.length - 1 && rows[k][0].slice(0, 7) !== rows[k - 1][0].slice(0, 7);
      values[k] = values[k - 1] + (monthStart ? monthly : 0);
    }
    var results = names.map(function (name, i) {
      var equity = stock + (i === 2 ? cash / 2 : 0);
      var deposit = principal - equity;
      var balance = [principal];
      var nav = 1, peak = 1, drawdown = 0;
      for (var day = 1; day < rows.length; day++) {
        var prev = rows[day - 1], today = rows[day];
        equity *= today[1] / prev[1];
        deposit *= today[2] / prev[2];
        nav *= (equity + deposit) / balance[day - 1];
        peak = Math.max(nav, peak);
        drawdown = Math.min(drawdown, nav / peak - 1);
        var added = values[day] - values[day - 1];
        if (i === 1) deposit += added;
        else equity += added;
        balance.push(equity + deposit);
      }
      return { name: name, balance: balance, final: balance[balance.length - 1], drawdown: drawdown };
    });
    return { results: results, principal: values };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = simulate;
    return;
  }

  var T = window.TOOL;
  function el(id) { return document.getElementById('drop-' + id); }
  var output = el('output'), message = el('error'), eventSelect = el('event'), events;
  var shown;

  function plot() {
    var dates = shown.rows.map(function (row) { return row[0]; });
    var times = dates.map(function (date) { return Date.parse(date); });
    var ticks = [0, Math.floor(dates.length / 2), dates.length - 1].map(function (i) {
      return { t: times[i], label: dates[i].slice(5).replace('-', '/') };
    });
    var series = shown.sim.results.map(function (result, i) {
      var letter = T.LET[i];
      return { gi: i, y: result.balance, name: result.name, lab: [letter + ' ' + result.name], labShort: letter };
    });
    T.chart(el('chart'), {
      xs: times, xTicks: ticks,
      dates: dates, series: series, bands: false, scale: 'lin',
      ref: { gi: -1, name: '累計本金', y: shown.sim.principal }, fmt: T.shortMoney, tipFmt: T.money, height: 265
    });
  }

  function render(moveFocus) {
    var stock = el('stock').valueAsNumber, cash = el('cash').valueAsNumber, monthly = el('monthly').valueAsNumber;
    if (stock + cash === 0) {
      output.hidden = true;
      message.textContent = '請填入起點的 0050 市值或可用現金。';
      return;
    }
    var event = events[eventSelect.value], rows = event.rows;
    var sim = simulate(rows, stock, cash, monthly);
    shown = { rows: rows, sim: sim };
    el('period').textContent = rows[0][0] + ' 至 ' + rows[rows.length - 1][0] + ' · 累計本金 ' +
      T.money(sim.principal[sim.principal.length - 1]);
    var base = Math.round(sim.results[0].final);
    el('cards').innerHTML = sim.results.map(function (result, i) {
      var delta = Math.round(result.final) - base;
      var difference = delta === 0 ? '和續扣相同' : '比續扣' + (delta > 0 ? '多 ' : '少 ') + T.money(Math.abs(delta));
      var note = ['每月買進 ' + T.money(monthly), '每月留在定存 ' + T.money(monthly), '第一天加買 ' + T.money(cash / 2)][i];
      return '<section class="drop-card drop-card-' + i + '"><h3><span aria-hidden="true">' + T.LET[i] + '</span> ' + result.name +
        '</h3><p>' + note + '</p><dl><dt>六個月期末</dt><dd>' + T.money(result.final) + '</dd><dt>最大跌幅</dt><dd>' +
        T.pct(result.drawdown, 2) + '</dd></dl>' + (i ? '<p>' + difference + '</p>' : '') + '</section>';
    }).join('');
    message.textContent = cash === 0 ? '起點現金為 0，續扣和加碼會相同。' : '已更新下方結果。';
    output.hidden = false;
    plot();
    if (moveFocus) el('result-title').focus();
  }

  el('form').addEventListener('submit', function (evt) {
    evt.preventDefault();
    if (events) render(true);
  });
  el('form').addEventListener('input', function () {
    if (!output.hidden) message.textContent = '設定已變更，按「比較三種做法」更新結果。';
  });
  var resize;
  window.addEventListener('resize', function () {
    if (output.hidden) return;
    clearTimeout(resize);
    resize = setTimeout(plot, 120);
  });

  fetch('../data/article-snapshots/0050-down-20.json').then(function (response) {
    if (!response.ok) throw new Error('data');
    return response.json();
  }).then(function (data) {
    events = data.events.filter(function (event) { return !event.partial; });
    var labels = { '2008': '2008 金融危機', '2020': '2020 疫情急跌', '2022': '2022 升息下跌' };
    events.forEach(function (event, i) {
      var label = labels[event.signal.slice(0, 4)] || event.signal.slice(0, 4) + ' 回落';
      var option = new Option(label, String(i));
      eventSelect.add(option);
      if (event.signal.slice(0, 4) === '2020') option.selected = true;
    });
    el('submit').disabled = false;
    render(false);
  }).catch(function () {
    message.textContent = '無法載入歷史行情。重新整理可再試，或先看下方的八次結果。';
  });
})();
