export const CAPITAL = 1_000_000;
const START = '2024-07-11';
const END = '2026-10-30';

const decisionDates = [
  '2024-07-19', '2024-08-02', '2024-08-05', '2024-08-09', '2024-12-31',
  '2025-04-02', '2025-04-09', '2025-12-31', '2026-09-30', '2026-10-16'
];

export const rules = {
  '0050': '全買 0050',
  none: '半正二半定存，放著不調',
  annual: '每年調回各半',
  quarterly: '每季調回各半',
  monthly: '每月調回各半'
};

export function readReplay(csv) {
  const [header, ...rows] = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (header !== 'date,0050,00631L,CASH_TWD') throw new Error('行情欄位不完整');
  const days = rows.map((row, index) => {
    const [date, ...values] = row.split(',');
    const [market, leveraged, deposit] = values.map(Number);
    if (!date || (index && date <= rows[index - 1].slice(0, 10))
        || values.length !== 3 || [market, leveraged, deposit].some(v => !Number.isFinite(v) || v <= 0)) {
      throw new Error('行情資料有誤');
    }
    return { date, market, leveraged, deposit };
  });
  if (days[0]?.date !== START || days.at(-1)?.date !== END || days.length !== 596) {
    throw new Error('回放期間不完整');
  }
  const turns = decisionDates.map(date => days.findIndex(day => day.date === date));
  if (turns.some(index => index < 0 || index + 1 >= days.length)) throw new Error('找不到決策日期');
  return { days, turns };
}

export function validMoves(moves, turns) {
  return Array.isArray(moves) && moves.length <= turns.length && moves.every(move => typeof move === 'boolean');
}

function period(date, rule) {
  if (rule === 'annual') return date.slice(0, 4);
  if (rule === 'monthly') return date.slice(0, 7);
  return date.slice(0, 4) + Math.floor((Number(date.slice(5, 7)) - 1) / 3);
}

export function simulate(replay, { moves = [], rule = 'player' } = {}) {
  const { days, turns } = replay;
  if (rule === 'player' && !validMoves(moves, turns)) throw new Error('調整紀錄有誤');
  if (rule !== 'player' && !Object.hasOwn(rules, rule)) throw new Error('找不到比較規則');

  const stop = rule === 'player' && moves.length < turns.length ? turns[moves.length] : days.length - 1;
  const manual = new Set(moves.flatMap((move, index) => move ? [turns[index] + 1] : []));
  const scheduled = ['annual', 'quarterly', 'monthly'].includes(rule);
  let leveraged = CAPITAL / 2;
  let deposit = CAPITAL / 2;
  let peak = CAPITAL;
  let maxDrawdown = 0;
  let lowIndex = 0;
  const trades = [];
  const path = days.slice(0, stop + 1).map((day, index) => {
    let total = CAPITAL * day.market / days[0].market;
    if (rule !== '0050') {
      if (index) {
        const prev = days[index - 1];
        leveraged *= day.leveraged / prev.leveraged;
        deposit *= day.deposit / prev.deposit;
        if (manual.has(index) || (scheduled && period(day.date, rule) !== period(prev.date, rule))) {
          const transfer = (leveraged + deposit) / 2 - leveraged;
          leveraged += transfer;
          deposit -= transfer;
          trades.push({ index, date: day.date, transfer });
        }
      }
      total = leveraged + deposit;
    }
    peak = Math.max(peak, total);
    const drawdown = 100 * (1 - total / peak);
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      lowIndex = index;
    }
    return {
      total, weight: rule === '0050' ? null : 100 * leveraged / total,
      date: day.date, drawdown
    };
  });
  return {
    path, trades, maxDrawdown, lowIndex, stop,
    total: path.at(-1).total, weight: path.at(-1).weight,
    highWeight: rule === '0050' ? null : Math.max(...path.map(day => day.weight))
  };
}
