import { readReplay, simulate, validMoves, rules } from './half-2x-engine.js?v=1';
import { colors, pathChart } from './market-chart.js?v=1';

const get = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const nt = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const money = value => '$' + nt.format(Math.round(Math.abs(value)));
const pct = (value, digits = 1) => value.toFixed(digits).replace('-', '−') + '%';
const dateText = date => date.replaceAll('-', '/');
const storageKey = 'half-2x-play-v1';

let replay;
let view = 'hub';
let moves = [];
let player;
let comparisons;
let selectedRule = '0050';
let point = 0;
let plot;
let loading = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function savedMoves() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (validMoves(stored, replay.turns)) return stored;
  } catch {
    // Storage is optional on this page.
  }
  return [];
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(moves));
  } catch {
    // Continue the current run in memory.
  }
}

function show(next, heading) {
  view = next;
  for (const panel of ['hub', 'board', 'result']) get(panel).hidden = panel !== next;
  window.scrollTo(0, 0);
  const title = get(heading);
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
}

function startLabel() {
  const saved = savedMoves().length;
  get('start').textContent = saved === replay.turns.length ? '回看結算'
    : saved > 0 ? '接著做決定' : '開始這一關';
}

async function load() {
  if (loading || replay) return;
  loading = true;
  get('load-error').hidden = true;
  get('start').textContent = '載入行情中…';
  get('start').disabled = true;
  try {
    const response = await fetch('../data/article-snapshots/leveraged-2x-cash-replay.csv');
    if (!response.ok) throw new Error('行情下載失敗');
    replay = readReplay(await response.text());
    startLabel();
  } catch {
    get('load-error').hidden = false;
    get('load-error').textContent = '行情載入失敗。可以再試一次。';
    get('start').textContent = '重新載入';
  } finally {
    get('start').disabled = false;
    loading = false;
  }
}

function enter(reset = false) {
  if (!replay) return load();
  moves = reset ? [] : savedMoves();
  save();
  if (moves.length === replay.turns.length) return finish();
  show('board', 'board-title');
  get('round-message').textContent = moves.length
    ? '回到上次的決策點。' : '起始各放 50 萬元。第一段行情已經走完，輪到你決定。';
  renderBoard();
}

function renderBoard() {
  player = simulate(replay, { moves });
  get('turn').textContent = `第 ${moves.length + 1}／${replay.turns.length} 次`;
  get('progress').value = moves.length;
  get('portfolio-total').textContent = money(player.total);
  get('leveraged-weight').textContent = pct(player.weight);
  get('deposit-weight').textContent = pct(100 - player.weight);
  get('mix-fill').style.width = pct(player.weight, 4);
  const transfer = player.total * (0.5 - player.weight / 100);
  get('rebalance-preview').textContent = Math.abs(transfer) < 0.5
    ? '目前正二和定存各約一半。'
    : `按目前收盤估算，要調回各半會${transfer > 0 ? '用定存加買' : '賣出'}約 ${money(transfer)} 的正二。`;
  renderMarket();
}

function advance(move) {
  if (view !== 'board' || moves.length >= replay.turns.length) return;
  const seen = player.stop;
  moves.push(move);
  save();
  if (moves.length === replay.turns.length) return finish();
  renderBoard();
  const change = 100 * (replay.days[player.stop].leveraged / replay.days[seen].leveraged - 1);
  const trade = move ? player.trades.at(-1) : null;
  const action = trade ? (trade.transfer >= 0 ? '從定存轉進正二' : '賣正二轉回定存') + ' ' + money(trade.transfer) : '這次先不調整';
  get('round-message').textContent = action + '。這段正二' + (change >= 0 ? '漲 ' : '跌 ') + pct(Math.abs(change)) + '。';
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    get('round-message').animate([{ backgroundColor: '#29414a' }, { backgroundColor: '#101e2c' }],
      { duration: 360, easing: 'ease-out' });
  }
}

function finish() {
  player = simulate(replay, { moves });
  comparisons = Object.fromEntries(Object.keys(rules).map(rule => [rule, simulate(replay, { rule })]));
  selectedRule = '0050';
  point = player.lowIndex;
  get('frequency').value = 'annual';
  const start = dateText(replay.days[0].date);
  const end = dateText(replay.days.at(-1).date);
  get('reveal-period').textContent = `關卡揭曉 · ${start}–${end}`;
  get('chart-start').textContent = start;
  get('chart-end').textContent = end;
  get('result-total').textContent = money(player.total);
  get('result-total').dataset.value = player.total;
  get('result-dd').textContent = '−' + pct(player.maxDrawdown, 2);
  get('result-dd').dataset.value = player.maxDrawdown;
  get('trade-count').textContent = `${player.trades.length} 次`;
  const entries = replay.turns.map((index, number) => {
    const li = element('li', '');
    const trade = player.trades.find(item => item.index === index + 1);
    const label = trade ? (trade.transfer >= 0 ? '補進正二 ' : '賣出正二 ') + money(trade.transfer) : '先不調整';
    const button = element('button', `${dateText(replay.days[index].date)}　${label}`);
    button.type = 'button';
    button.addEventListener('click', () => {
      point = index + Number(!!trade);
      renderPoint();
      get('result-chart').scrollIntoView({ block: 'center' });
    });
    li.append(button);
    return li;
  });
  get('replay-log').replaceChildren(...entries);
  show('result', 'result-title');
  renderResult();
}

function renderResult() {
  const frequency = get('frequency').value;
  const score = ['0050', 'none', frequency].map(rule => {
    const data = comparisons[rule];
    const card = element('button', '', 'score-row');
    card.type = 'button';
    card.dataset.rule = rule;
    card.dataset.value = data.total;
    card.dataset.drawdown = data.maxDrawdown;
    card.setAttribute('aria-pressed', String(selectedRule === rule));
    card.append(element('span', rules[rule]), element('b', money(data.total)),
      element('small', '最大跌幅 −' + pct(data.maxDrawdown, 2)));
    card.addEventListener('click', () => {
      selectedRule = rule;
      renderResult();
      get('score').querySelector(`[data-rule="${rule}"]`).focus({ preventScroll: true });
    });
    return card;
  });
  get('score').replaceChildren(...score);
  const compare = comparisons[selectedRule];
  const valueDiff = player.total - compare.total;
  const ddDiff = Number((compare.maxDrawdown - player.maxDrawdown).toFixed(2));
  const ddText = ddDiff ? `${ddDiff > 0 ? '少跌' : '多跌'} ${Math.abs(ddDiff).toFixed(2)} 個百分點` : '最大跌幅相同';
  const valueText = Math.abs(valueDiff) >= 0.5
    ? `期末${valueDiff > 0 ? '多' : '少'} ${money(valueDiff)}` : '期末資產相同';
  get('comparison').textContent = `和「${rules[selectedRule]}」相比，你的帳戶${ddText}，${valueText}。`;
  get('benchmark-label').textContent = rules[selectedRule];
  renderPoint();
}

function renderPoint() {
  const mine = player.path[point];
  const other = comparisons[selectedRule].path[point];
  const trade = player.trades.find(item => item.index === point);
  get('result-detail').replaceChildren(
    element('p', `${dateText(mine.date)}　你 ${money(mine.total)}・基準 ${money(other.total)}`),
    element('p', `你的正二占比 ${pct(mine.weight)}・距自己的前高跌 ${pct(mine.drawdown)}`
      + (trade ? `。這天${trade.transfer >= 0 ? '加買' : '賣出'}正二 ${money(trade.transfer)}。` : '。'))
  );
  get('previous-point').disabled = point === 0;
  get('next-point').disabled = point === player.path.length - 1;
  renderResultChart();
}

function renderMarket() {
  if (view !== 'board') return;
  const visible = replay.days.slice(Math.max(0, player.stop - 125), player.stop + 1);
  const first = replay.days[0];
  const a = visible.map(day => day.leveraged / first.leveraged * 100);
  const b = visible.map(day => day.market / first.market * 100);
  const canvas = get('market-chart');
  get('market-start-label').textContent = visible.length === player.stop + 1 ? '關卡起點' : '約半年前';
  canvas.setAttribute('aria-label', `起點 100，最新正二 ${a.at(-1).toFixed(1)}，0050 ${b.at(-1).toFixed(1)}`);
  const minimum = Math.floor(Math.min(100, ...a, ...b) / 15) * 15;
  const maximum = Math.ceil(Math.max(101, ...a, ...b) / 15) * 15;
  pathChart(canvas, [{ values: b, color: colors.mint, dash: true }, { values: a, color: colors.gold }], {
    guide: 100, minimum, maximum, axis: x => Math.round(x)
  });
}

function renderResultChart() {
  if (view !== 'result') return;
  const a = player.path.map(day => day.total);
  const b = comparisons[selectedRule].path.map(day => day.total);
  const canvas = get('result-chart');
  canvas.setAttribute('aria-label', `你的期末資產 ${money(a.at(-1))}，${rules[selectedRule]} ${money(b.at(-1))}`);
  const minimum = Math.floor(Math.min(...a, ...b) / 150000) * 150000;
  const maximum = Math.ceil(Math.max(...a, ...b) / 150000) * 150000;
  plot = pathChart(canvas, [{ values: b, color: colors.mint, dash: true }, { values: a, color: colors.gold }], {
    minimum, maximum, axis: x => Math.round(x / 10000) + '萬', point
  });
}

get('start').addEventListener('click', () => enter());
get('retry').addEventListener('click', () => enter(true));
all('[data-hub]').forEach(button => button.addEventListener('click', () => {
  startLabel();
  show('hub', 'game-title');
}));
all('[data-move]').forEach(button => button.addEventListener('click', () => advance(button.dataset.move === 'rebalance')));
get('frequency').addEventListener('change', () => {
  selectedRule = get('frequency').value;
  renderResult();
});
get('spotlight').addEventListener('click', () => {
  point = player.lowIndex;
  renderPoint();
});
get('previous-point').addEventListener('click', () => {
  if (point > 0) point--;
  renderPoint();
});
get('next-point').addEventListener('click', () => {
  if (point < player.path.length - 1) point++;
  renderPoint();
});
get('result-chart').addEventListener('click', event => {
  if (!plot) return;
  const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
  const last = player.path.length - 1;
  point = Math.min(last, Math.max(0, Math.round((x - plot.left) / (plot.right - plot.left) * last)));
  renderPoint();
});
window.addEventListener('resize', () => {
  renderMarket();
  renderResultChart();
});

load();
