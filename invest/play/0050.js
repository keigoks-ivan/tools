import {
  CHAPTERS, actions, benchmarks, parseArticleInputs, scenarioFor,
  validDecision, play, runBenchmark, biggestChange
} from './0050-engine.js?v=1';

const get = id => document.getElementById(id);
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const nt = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const money = amount => '$' + nt.format(Math.round(amount));
const percent = amount => amount.toFixed(1).replace('-', '−') + '%';
const plus = amount => (amount > 0 ? '+' : '') + percent(amount);
const dateLabel = date => date.replaceAll('-', '/');
const savedKey = '0050-play-v1';
const colors = { mint: '#87e0cc', gold: '#ffce88', grid: '#233746', text: '#a9b9c7' };

let scenarios;
let current = 0;
let view = 'hub';
let result;
let selection = 'direct';
let selectedPoint = 0;
let resultPlot;
let fileLoading = false;

const save = readProgress();

function readProgress() {
  const fresh = { sessions: {}, complete: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(savedKey));
    if (!raw) return fresh;
    for (const { start } of CHAPTERS) {
      const history = raw.sessions?.[start];
      if (Array.isArray(history) && history.length <= 60 && history.every(validDecision)) {
        fresh.sessions[start] = history;
      }
    }
    if (Array.isArray(raw.complete)) {
      fresh.complete = CHAPTERS.filter(item => raw.complete.includes(item.start)).map(item => item.start);
    }
  } catch {
    // A blocked storage API never prevents playing.
  }
  return fresh;
}

function persist() {
  try {
    localStorage.setItem(savedKey, JSON.stringify(save));
  } catch {
    // The current run remains usable in memory.
  }
}

function make(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function show(which, focus) {
  view = which;
  for (const name of ['hub', 'board', 'result']) get(name).hidden = name !== which;
  if (focus) {
    window.scrollTo(0, 0);
    const target = get(focus);
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
}

function nextUnfinished(from = -1) {
  for (let offset = 1; offset <= CHAPTERS.length; offset++) {
    const index = (from + offset) % CHAPTERS.length;
    if (!save.complete.includes(CHAPTERS[index].start)) return index;
  }
  return -1;
}

function renderHub() {
  get('completion').textContent = '已完成 ' + save.complete.length + '／' + CHAPTERS.length + ' 關';
  const cards = CHAPTERS.map((chapter, index) => {
    const button = make('button', '', 'chapter');
    button.type = 'button';
    button.disabled = !scenarios;
    const progress = save.sessions[chapter.start]?.length;
    const status = save.complete.includes(chapter.start) ? ' · 已完成' : progress ? ' · 可繼續' : '';
    button.append(make('small', `第 ${index + 1} 關${status}`), make('b', chapter.label), make('p', chapter.description));
    button.addEventListener('click', () => openChapter(index));
    return button;
  });
  get('chapters').replaceChildren(...cards);
  if (!scenarios) return;
  const next = nextUnfinished();
  const pending = save.sessions[CHAPTERS[Math.max(0, next)].start]?.length;
  get('start').disabled = false;
  get('start').textContent = next < 0 ? '再玩一次' : pending ? '繼續這一關' : next === 0 ? '開始第一關' : '繼續下一關';
}

function setChoices() {
  for (const id of ['compare-rule', 'autoplay-rule']) {
    const select = get(id);
    for (const [key, option] of Object.entries(benchmarks)) {
      select.append(new Option(option.label, key));
    }
  }
}

async function load() {
  if (fileLoading || scenarios) return;
  fileLoading = true;
  get('load-error').hidden = true;
  get('start').disabled = true;
  get('start').textContent = '載入關卡中…';
  try {
    const response = await fetch('../data/article-snapshots/0050-dca-timing-inputs.csv');
    if (!response.ok) throw new Error('missing article data');
    const days = parseArticleInputs(await response.text());
    scenarios = CHAPTERS.map(chapter => scenarioFor(days, chapter));
    renderHub();
  } catch {
    get('load-error').textContent = '行情載入失敗。可以再試一次。';
    get('load-error').hidden = false;
    get('start').textContent = '重新載入';
    get('start').disabled = false;
  } finally {
    fileLoading = false;
  }
}

function history() {
  const key = CHAPTERS[current].start;
  return save.sessions[key] ??= [];
}

function openChapter(index, restart = false) {
  if (!scenarios) return;
  current = index;
  if (restart) {
    save.sessions[CHAPTERS[current].start] = [];
    persist();
  }
  const scenario = scenarios[current];
  if (history().length === scenario.turns.length) {
    finish(play(scenario, history()));
    return;
  }
  get('board-title').textContent = scenario.chapter.label;
  get('chapter-counter').textContent = `第 ${index + 1} 關／共 ${CHAPTERS.length} 關`;
  $('input[name="step"][value="1"]').checked = true;
  const previousPolicy = history().at(-1)?.policy ?? 'month';
  const selection = previousPolicy === 'monthDailyHigh' ? 'month' : previousPolicy.replace('Cap', '');
  $(`input[name="policy"][value="${selection}"]`).checked = true;
  get('deadline').checked = previousPolicy.endsWith('Cap');
  get('autoplay').open = false;
  get('autoplay-rule').value = 'direct';
  get('round-message').textContent = history().length
    ? '回到上次停下的月份。' : '第一筆預算已就緒。選好做法，時間才會往前。';
  show('board', 'board-title');
  renderBoard();
}

function renderBoard(account = play(scenarios[current], history())) {
  const scenario = scenarios[current];
  const played = history().length;
  get('progress').value = played;
  get('turn').textContent = `第 ${played + 1}／${scenario.turns.length} 月`;
  get('account-value').textContent = money(account.total);
  get('account-cash').textContent = money(account.cash);
  get('account-principal').textContent = money(account.principal);
  const dd = scenario.data[account.observed].dailyDrawdown;
  get('market-drawdown').textContent = percent(dd);
  get('market-drawdown').classList.toggle('negative', dd <= -20);
  get('boost').disabled = account.cash < 0.5;
  const maxSteps = scenario.turns.length - played;
  const step = $('input[name="step"][value="3"]');
  step.disabled = maxSteps < 3;
  if (step.disabled) $('input[name="step"][value="1"]').checked = true;
  renderSettings();
  drawMarket();
}

function renderSettings() {
  const steps = +$('input[name="step"]:checked').value;
  get('step-note').textContent = steps === 1
    ? '決定後，下個收盤價才會揭曉。'
    : '同一個決定會沿用三個月，下面的金額是每月預算。';
  const policy = $('input[name="policy"]:checked').value;
  get('deadline').disabled = policy === 'manual';
  get('policy-note').textContent = {
    month: '用最高月底收盤算跌幅，月底確認跌兩成，下一個交易日買。',
    daily: '用最高單日收盤算跌幅，每天檢查，確認跌兩成後隔天買。',
    manual: '先放定存。你點「全買再加碼」時才會買進。'
  }[policy];
  if (policy !== 'manual' && get('deadline').checked) {
    get('policy-note').textContent += ' 每筆錢存滿半年，就在當月月底買進。';
  }
}

function currentPolicy() {
  const policy = $('input[name="policy"]:checked').value;
  return policy !== 'manual' && get('deadline').checked ? policy + 'Cap' : policy;
}

function advance(rule, count) {
  if (view !== 'board') return;
  const scenario = scenarios[current];
  const moves = history();
  const before = play(scenario, moves);
  const used = Math.min(count, scenario.turns.length - moves.length);
  for (let index = 0; index < used; index++) moves.push({ policy: rule.policy, action: rule.action });
  const after = play(scenario, moves);
  persist();
  if (moves.length === scenario.turns.length) {
    finish(after);
    return;
  }
  const a = scenario.data[before.observed].price;
  const b = scenario.data[after.observed].price;
  const released = after.trades.filter(trade => trade.date > scenario.data[before.observed].date && trade.reserve)
    .reduce((total, trade) => total + trade.reserve, 0);
  get('round-message').textContent = `往前 ${used} 個月，0050 ${plus((b / a - 1) * 100)}。`
    + (released ? `這段動用了 ${money(released)} 預留金。` : '');
  renderBoard(after);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    get('round-message').animate([
      { backgroundColor: '#25404b', transform: 'translateY(3px)' },
      { backgroundColor: '#101e2c', transform: 'translateY(0)' }
    ], { duration: 360, easing: 'ease-out' });
  }
}

function finish(player) {
  const scenario = scenarios[current];
  const key = scenario.chapter.start;
  if (!save.complete.includes(key)) save.complete.push(key);
  persist();
  renderHub();
  const comparisons = Object.fromEntries(Object.keys(benchmarks).map(id => [id, runBenchmark(scenario, id)]));
  result = { player, comparisons };
  selection = 'direct';
  selectedPoint = biggestChange(player, comparisons.direct).index;
  get('compare-rule').value = selection;
  $('input[name="score-mode"][value="half"]').checked = true;
  $('input[name="peak"][value="day"]').checked = true;
  get('result-title').textContent = scenario.chapter.reveal;
  const period = [scenario.first, scenario.last].map(index => dateLabel(scenario.data[index].date.slice(0, 7)));
  get('reveal-period').textContent = `關卡揭曉 · ${period.join('–')}`;
  get('chart-start').textContent = period[0];
  get('chart-end').textContent = period[1];
  get('result-finding').textContent = scenario.chapter.finding;
  get('result-value').textContent = money(player.total);
  get('result-value').dataset.value = player.total;
  get('result-drawdown').textContent = percent(player.drawdown);
  get('result-cash').textContent = money(player.cash);
  get('lesson').hidden = key !== '2019-01';
  get('next-chapter').textContent = nextUnfinished(current) < 0 ? '回到選關' : '玩下一關 →';
  show('result', 'result-title');
  if (!get('lesson').hidden) renderLesson();
  renderComparison();
}

function renderScore() {
  const half = $('input[name="score-mode"]:checked').value === 'half';
  const groups = half
    ? [['定期定額', ['direct']], ['等跌兩成', ['split_month', 'split_daily']], ['最多等半年', ['split_month_cap', 'split_daily_cap']]]
    : [['定期定額', ['direct']], ['全數等跌兩成', ['month', 'daily', 'month_daily_high']]];
  get('score').replaceChildren(...groups.map(([name, ids]) => {
    const group = make('section', '', 'score-group');
    group.append(make('h3', name));
    for (const id of ids) {
      const b = result.comparisons[id];
      const row = make('button', '', 'score-row');
      row.type = 'button';
      row.dataset.rule = id;
      row.dataset.value = b.total;
      row.setAttribute('aria-pressed', String(id === selection));
      row.append(make('span', benchmarks[id].label), make('b', money(b.total)),
        make('small', `最大跌幅 ${percent(b.drawdown)}・剩餘現金 ${money(b.cash)}`));
      row.addEventListener('click', () => {
        chooseBenchmark(id);
        get('score').querySelector(`[data-rule="${id}"]`).focus({ preventScroll: true });
      });
      group.append(row);
    }
    return group;
  }));
}

function chooseBenchmark(id) {
  selection = id;
  selectedPoint = biggestChange(result.player, result.comparisons[id]).index;
  get('compare-rule').value = id;
  const full = ['month', 'daily', 'month_daily_high'].includes(id);
  if (id !== 'direct') $(`input[name="score-mode"][value="${full ? 'all' : 'half'}"]`).checked = true;
  renderComparison();
}

function renderComparison() {
  get('benchmark-label').textContent = benchmarks[selection].label;
  renderScore();
  renderPoint();
}

function renderPoint() {
  const a = result.player.months[selectedPoint];
  const b = result.comparisons[selection].months[selectedPoint];
  const delta = a.total - b.total;
  const verdict = Math.abs(delta) < 0.5 ? '和基準相同' : `${delta > 0 ? '比基準多' : '比基準少'} ${money(Math.abs(delta))}`;
  const inMonth = result.player.trades.filter(trade => trade.turn === selectedPoint + 1);
  const reserve = inMonth.reduce((sum, trade) => sum + trade.reserve, 0);
  const action = actions[history()[selectedPoint].action].label;
  const amountLine = make('p', '');
  amountLine.append(make('strong', dateLabel(a.date.slice(0, 7)) + '　'), verdict);
  const previous = selectedPoint
    ? result.player.months[selectedPoint - 1].total - result.comparisons[selection].months[selectedPoint - 1].total
    : 0;
  const movement = delta - previous;
  const tradeNote = reserve ? `預留金成交 ${money(reserve)}。` : '';
  const movementNote = Math.abs(movement) >= 0.5
    ? `與上月相比，你的資產相對基準${movement > 0 ? '多了' : '少了'} ${money(Math.abs(movement))}。` : '';
  get('result-detail').replaceChildren(amountLine, make('p', `你選了「${action}」。` + tradeNote + movementNote));
  get('previous-point').disabled = selectedPoint === 0;
  get('next-point').disabled = selectedPoint === result.player.months.length - 1;
  drawResult();
}

function renderLesson() {
  const day = $('input[name="peak"]:checked').value === 'day';
  const close = scenarios[current].data.find(point => point.date === '2020-03-31');
  const label = day ? '用最高單日收盤算' : '用最高月底收盤算';
  const hit = day ? '已達門檻。同樣只在月底檢查，採這個高點的人隔天就買。'
    : '沒到門檻，預留金繼續等。';
  const detail = day ? '每個交易日都檢查的人，在 3 月 17 日就確認達到門檻，3 月 18 日成交。' : '';
  get('lesson-answer').replaceChildren('3 月 31 日' + label + '，距高點 ',
    make('strong', percent(day ? close.dailyDrawdown : close.monthlyDrawdown)), '。' + hit + detail);
}

function pathChart(canvas, series, { guide, maximum, minimum, axis, point }) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);
  const left = 40, right = width - 12, top = 10, bottom = height - 12;
  const number = series[0].values.length;
  const x = index => left + (right - left) * index / Math.max(1, number - 1);
  const y = value => bottom - (bottom - top) * (value - minimum) / (maximum - minimum);
  ctx.font = '600 10px "DM Sans", system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.text;
  for (let tick = 0; tick <= 3; tick++) {
    const value = minimum + tick / 3 * (maximum - minimum);
    ctx.beginPath();
    ctx.moveTo(left, y(value));
    ctx.lineTo(right, y(value));
    ctx.stroke();
    ctx.fillText(axis(value), left - 6, y(value));
  }
  if (guide !== undefined) {
    ctx.strokeStyle = '#a78b72';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(left, y(guide));
    ctx.lineTo(right, y(guide));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const s of series) {
    if (s.fill) {
      const fill = ctx.createLinearGradient(0, top, 0, bottom);
      fill.addColorStop(0, '#87e0cc22');
      fill.addColorStop(1, '#87e0cc00');
      ctx.fillStyle = fill;
      ctx.beginPath();
      s.values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
      ctx.lineTo(right, bottom);
      ctx.lineTo(left, bottom);
      ctx.closePath();
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = s.color;
    ctx.setLineDash(s.dash ? [4, 4] : []);
    ctx.beginPath();
    s.values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (point !== undefined) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#536d7a';
    ctx.beginPath();
    ctx.moveTo(x(point), top);
    ctx.lineTo(x(point), bottom);
    ctx.stroke();
  }
  for (const s of series) {
    const index = point ?? number - 1;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(x(index), y(s.values[index]), 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  return { left, right };
}

function drawMarket() {
  if (view !== 'board') return;
  const scenario = scenarios[current];
  const month = history().length;
  const end = scenario.turns[month];
  const samples = scenario.data.slice(Math.max(0, end - 126), end);
  const dd = samples.map(item => item.dailyDrawdown);
  get('market-chart').setAttribute('aria-label', '0050 最近約半年距前高的跌幅，最新為 ' + percent(dd.at(-1)));
  const minimum = Math.min(-30, 15 * Math.floor(Math.min(...dd) / 15));
  pathChart(get('market-chart'), [{ values: dd, color: colors.mint, fill: true }], {
    guide: -20, maximum: 0, minimum, axis: x => Math.round(x).toString().replace('-', '−') + '%'
  });
}

function drawResult() {
  if (view !== 'result') return;
  const a = result.player.months;
  const b = result.comparisons[selection].months;
  const canvas = get('result-chart');
  canvas.setAttribute('aria-label', '你的期末資產 ' + money(result.player.total)
    + '，' + benchmarks[selection].label + '的期末資產 ' + money(b.at(-1).total));
  const maximum = 150000 * Math.ceil(Math.max(...a.map(x => x.total), ...b.map(x => x.total)) / 150000);
  resultPlot = pathChart(canvas, [
    { color: colors.mint, dash: true, values: b.map(x => x.total) },
    { color: colors.gold, values: a.map(x => x.total) }
  ], { maximum, minimum: 0, axis: x => Math.round(x / 10000) + '萬', point: selectedPoint });
}

get('start').addEventListener('click', () => {
  if (!scenarios) return load();
  const next = nextUnfinished();
  openChapter(Math.max(0, next), next < 0);
});
$$('[data-hub]').forEach(btn => btn.addEventListener('click', () => {
  renderHub();
  show('hub', 'game-title');
}));
$$('input[name="policy"], input[name="step"], #deadline').forEach(field => field.addEventListener('change', renderSettings));
$$('[data-action]').forEach(btn => btn.addEventListener('click', () => {
  advance({ action: btn.dataset.action, policy: currentPolicy() }, +$('input[name="step"]:checked').value);
}));
get('run-rule').addEventListener('click', () => advance(benchmarks[get('autoplay-rule').value], 60));
get('compare-rule').addEventListener('change', event => chooseBenchmark(event.target.value));
$$('input[name="score-mode"]').forEach(field => field.addEventListener('change', () => {
  const key = field.value === 'half' ? 'split_month' : 'month';
  chooseBenchmark(key);
}));
$$('input[name="peak"]').forEach(field => field.addEventListener('change', renderLesson));
get('previous-point').addEventListener('click', () => {
  if (selectedPoint > 0) selectedPoint--;
  renderPoint();
});
get('next-point').addEventListener('click', () => {
  if (selectedPoint < result.player.months.length - 1) selectedPoint++;
  renderPoint();
});
get('spotlight').addEventListener('click', () => {
  selectedPoint = biggestChange(result.player, result.comparisons[selection]).index;
  renderPoint();
});
get('result-chart').addEventListener('click', event => {
  if (!resultPlot) return;
  const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
  const fraction = (x - resultPlot.left) / (resultPlot.right - resultPlot.left);
  const last = result.player.months.length - 1;
  selectedPoint = Math.min(last, Math.max(0, Math.round(fraction * last)));
  renderPoint();
});
get('next-chapter').addEventListener('click', () => {
  const next = nextUnfinished(current);
  if (next >= 0) openChapter(next);
  else show('hub', 'game-title');
});
get('retry').addEventListener('click', () => openChapter(current, true));
window.addEventListener('resize', () => {
  drawMarket();
  drawResult();
});

setChoices();
renderHub();
load();
