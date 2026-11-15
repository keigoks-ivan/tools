import { colors, pathChart } from './market-chart.js?v=1';
import {
  CHAPTERS, actions, benchmarks, parseArticleInputs, scenarioFor,
  validDecision, play, runBenchmark, biggestChange
} from './0050-engine.js?v=1';

import { SCENE_COUNT, sceneAt, optionFor, movesFor } from './0050-scenes.js?v=1';

const get = id => document.getElementById(id);
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const nt = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const money = amount => '$' + nt.format(Math.round(amount));
const percent = amount => amount.toFixed(1).replace('-', '−') + '%';
const plus = amount => (amount > 0 ? '+' : '') + percent(amount);
const dateLabel = date => date.replaceAll('-', '/');
const savedKey = '0050-play-v1';


let scenarios;
let current = 0;
let view = 'hub';
let result;
let selection = 'direct';
let selectedPoint = 0;
let resultPlot;
let storyTurn;
let fileLoading = false;

const save = readProgress();

function readProgress() {
  const fresh = { sessions: {}, complete: [], reveals: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(savedKey));
    if (!raw) return fresh;
    for (const { start } of CHAPTERS) {
      const history = raw.sessions?.[start];
      if (Array.isArray(history) && history.length <= 60 && history.every(validDecision)) {
        fresh.sessions[start] = history;
      }
      const stage = raw.reveals?.[start];
      if (stage && Number.isInteger(stage.from) && stage.from >= 0 && stage.from < 60
          && typeof stage.choice === 'string') fresh.reveals[start] = stage;
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

function focusTop(id) {
  window.scrollTo(0, 0);
  const target = get(id);
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

function show(which, focus) {
  view = which;
  for (const name of ['hub', 'board', 'turn-reveal', 'result']) get(name).hidden = name !== which;
  if (focus) focusTop(focus);
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
  const select = get('compare-rule');
  for (const [key, option] of Object.entries(benchmarks)) {
    select.append(new Option(option.label, key));
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

function renderProgress(id, index, revealed) {
  const segments = Array.from({ length: SCENE_COUNT }, (_, number) => {
    const li = make('li', String(number + 1), number < index || revealed && number === index ? 'filled' : '');
    if (!revealed && number === index) li.setAttribute('aria-current', 'step');
    return li;
  });
  get(id).replaceChildren(...segments);
}

function sceneContext(from) {
  const scenario = scenarios[current];
  const previous = history().slice(0, from);
  const account = play(scenario, previous);
  return { previous, account, ...sceneAt(scenario.chapter.start, from, account.cash) };
}

function openChapter(index, restart = false) {
  if (!scenarios) return;
  current = index;
  const { chapter, turns } = scenarios[current];
  if (restart) {
    save.sessions[chapter.start] = [];
    delete save.reveals[chapter.start];
    persist();
  }

  const saved = save.reveals[chapter.start];
  if (saved) {
    const context = sceneContext(saved.from);
    if (context.keys?.includes(saved.choice) && context.end === history().length) {
      showReveal(context, saved.choice);
      return;
    }
  }
  if (history().length === turns.length) {
    finish(play(scenarios[current], history()));
    return;
  }
  show('board');
  renderBoard();
  focusTop('board-title');
}

function renderBoard() {
  const scenario = scenarios[current];
  const from = history().length;
  const { account, index, end, prompt, keys } = sceneContext(from);
  get('chapter-counter').textContent = `第 ${current + 1} 關 · 第 ${index + 1} 次決定`;
  renderProgress('scene-progress', index, false);
  get('scene-budget').textContent = `接下來 ${end - from} 個月 · 每月 ${money(10000)}`;
  get('board-title').textContent = prompt;
  get('account-value').textContent = money(account.total);
  get('account-cash').textContent = money(account.cash);
  const dd = scenario.data[account.observed].dailyDrawdown;
  get('market-drawdown').textContent = percent(dd);
  get('market-drawdown').style.color = dd <= -20 ? 'var(--negative)' : 'var(--mint)';
  get('market-disclosure').open = false;
  get('scene-choices').replaceChildren(...keys.map(key => {
    const [label, description] = optionFor(key);
    const button = make('button', '', 'scene-choice');
    button.type = 'button';
    button.dataset.choice = key;
    button.append(make('span', label), make('small', description));
    button.addEventListener('click', () => advance(key));
    return button;
  }));
}

function advance(key) {
  if (view !== 'board') return;
  const from = history().length;
  const context = sceneContext(from);
  if (!context.keys.includes(key)) return;
  history().push(...movesFor(key, context.end - from));
  save.reveals[CHAPTERS[current].start] = { from, choice: key };
  persist();
  showReveal(context, key);
}

function largestDrop(during) {
  let peak = during[0].price;
  let decline = 0;
  for (const day of during) {
    peak = Math.max(peak, day.price);
    decline = Math.max(decline, 1 - day.price / peak);
  }
  return decline * 100;
}

function showReveal(context, choice) {
  const scenario = scenarios[current];
  const { previous, account, index, end, keys } = context;
  const count = end - previous.length;
  const branches = Object.fromEntries(keys.map(key => [key,
    play(scenario, previous.concat(movesFor(key, count)))]));
  const played = branches[choice];
  const days = scenario.data.slice(account.observed, played.observed + 1);
  const endReturn = (days.at(-1).price / days[0].price - 1) * 100;
  const deepest = largestDrop(days);
  storyTurn = { context, choice, branches, compared: keys.find(key => key !== choice) };
  get('reveal-counter').textContent = `第 ${current + 1} 關 · 第 ${index + 1} 次結果`;
  get('reveal-period-length').textContent = `這段 ${count} 個月 · 入帳 ${money(count * 10000)}`;
  renderProgress('reveal-progress', index, true);
  get('turn-reveal-title').textContent = deepest >= 20
    ? `0050 一度跌 ${percent(deepest)}`
    : `0050 這段${endReturn < 0 ? '跌了' : '漲了'} ${percent(Math.abs(endReturn))}`;
  const marketLine = deepest >= 20
    ? `從這段起點到結束，0050 ${plus(endReturn)}。`
    : `途中從前高最多跌了 ${percent(deepest)}。`;
  const close = scenario.chapter.start === '2019-01' && index === 1
    ? days.find(day => day.date === '2020-03-31') : null;
  const periodComparison = close
    ? `這段最後一個月底，用最高單日收盤算跌 ${percent(-close.dailyDrawdown)}，用最高月底收盤算跌 ${percent(-close.monthlyDrawdown)}。` : '';
  get('reveal-context').textContent = marketLine + periodComparison;
  get('continue-turn').textContent = end === scenario.turns.length ? '看五年結算 →' : '下一次決定 →';
  get('turn-chart-end').textContent = end === scenario.turns.length ? '到結算' : '到下次決策前';
  get('branch-options').replaceChildren(...keys.map(key => {
    const button = make('button', '', 'scene-choice branch-option');
    button.type = 'button';
    button.dataset.branch = key;
    button.append(make('span', optionFor(key)[0] + (key === choice ? '（你選的）' : '')),
      make('b', money(branches[key].total)));
    button.addEventListener('click', () => {
      storyTurn.compared = key;
      renderBranch();
    });
    return button;
  }));
  show('turn-reveal', 'turn-reveal-title');
  renderBranch();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    get('turn-chart').animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0)' }],
      { duration: 700, easing: 'ease-out' });
  }
}

function flowNote(variant, observed) {
  const days = scenarios[current].data;
  const fills = variant.trades.filter(trade => trade.reserve && trade.date > days[observed].date);
  const invested = fills.reduce((sum, trade) => sum + trade.reserve, 0);
  if (!fills.length) return '這段沒有動用預留金，手上還有 ' + money(variant.cash) + '。';
  const first = days.findIndex((day, index) => index > observed && day.date === fills[0].date);
  return `第 ${first - observed} 個交易日首次動用預留金，這段共買入 ${money(invested)}，還留有 ${money(variant.cash)}。`;
}

function renderBranch() {
  const { choice, compared, branches, context } = storyTurn;
  const mine = branches[choice];
  const other = branches[compared];
  const diff = other.total - mine.total;
  const title = Math.abs(diff) < 0.5 ? '走到這裡，兩種做法差不到 1 元'
    : `改選這個，帳戶會${diff > 0 ? '多' : '少'} ${money(Math.abs(diff))}`;
  get('branch-details').replaceChildren(make('h2', compared === choice ? '這就是你的選擇' : title),
    make('p', '你選的做法：' + flowNote(mine, context.account.observed)));
  if (choice !== compared) {
    get('branch-details').append(make('p', '另一種做法：' + flowNote(other, context.account.observed)));
  }
  get('turn-alternative-label').textContent = optionFor(compared)[0];
  $$('[data-branch]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.branch === compared)));
  drawTurnChart();
}

function drawTurnChart() {
  if (view !== 'turn-reveal') return;
  const { context, choice, compared, branches } = storyTurn;
  const a = branches[choice].months.slice(context.previous.length).map(point => point.total);
  const b = branches[compared].months.slice(context.previous.length).map(point => point.total);
  a.unshift(context.account.total);
  b.unshift(context.account.total);
  a.push(branches[choice].total);
  b.push(branches[compared].total);
  const min = 10000 * Math.floor(Math.min(...a, ...b) / 10000);
  const max = 10000 * Math.ceil(Math.max(...a, ...b) / 10000) || 10000;
  const canvas = get('turn-chart');
  canvas.setAttribute('aria-label', `你的帳戶 ${money(a.at(-1))}，另一種做法 ${money(b.at(-1))}`);
  pathChart(canvas, [
    { values: b, color: colors.mint, dash: true },
    { values: a, color: colors.gold }
  ], { minimum: min, maximum: Math.max(min + 10000, max), axis: x => Math.round(x / 10000) + '萬' });
}

function proceed() {
  if (view !== 'turn-reveal') return;
  delete save.reveals[CHAPTERS[current].start];
  persist();
  openChapter(current);
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
  get('next-game').hidden = nextUnfinished(current) >= 0;
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
get('market-disclosure').addEventListener('toggle', drawMarket);
get('continue-turn').addEventListener('click', proceed);
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
  drawTurnChart();
  drawResult();
});

setChoices();
renderHub();
load();
