export const MONTHLY_BUDGET = 10_000;
const HORIZON = 60;

export const CHAPTERS = [
  {
    start: '2007-01',
    label: '轉折將至',
    description: '帳戶剛起步。你會先入場，還是留一筆等機會？',
    reveal: '金融海嘯',
    finding: '這五年裡，海嘯來得早，累積的現金有機會在跌勢中買進。這段全等的帳戶最後比每月全買的多。'
  },
  {
    start: '2019-01',
    label: '急轉彎',
    description: '行情會在兩個月底之間，走出你沒料到的變化。',
    reveal: '疫情急跌',
    finding: '跌勢在三月中間最深。用月資料回看，會少掉一段很重要的行情。'
  },
  {
    start: '2012-01',
    label: '還要等多久',
    description: '預留金愈存愈多。你願意繼續等原來的門檻嗎？',
    reveal: '遲遲等不到的月底',
    finding: '這五年，把月底收盤和最高月底收盤相比，從來沒跌滿兩成。照月底規則等的帳戶結算時仍全是現金。'
  }
];

// Reserve orders are pinned to the article's per-deposit execution dates.
// Each lot keeps its rule, even if the player changes the rule for new cash.
const reserveColumns = {
  month: 'month_lot_buy_date',
  daily: 'daily_lot_buy_date',
  monthDailyHigh: 'month_daily_high_lot_buy_date',
  monthCap: 'month_cap_lot_buy_date',
  dailyCap: 'daily_cap_lot_buy_date'
};

export const actions = {
  buy: { share: 1, release: false, label: '本月全買' },
  half: { share: 0.5, release: false, label: '只買一半' },
  wait: { share: 0, release: false, label: '本月先等' },
  boost: { share: 1, release: true, label: '全買再加碼' }
};

export const benchmarks = {
  direct: { action: 'buy', policy: 'manual', label: '全數定期定額' },
  month: { action: 'wait', policy: 'month', label: '月底看，全部等跌' },
  daily: { action: 'wait', policy: 'daily', label: '每天看，全部等跌' },
  month_daily_high: { action: 'wait', policy: 'monthDailyHigh', label: '月底看，用日線高點' },
  split_month: { action: 'half', policy: 'month', label: '月底看，半買半等' },
  split_daily: { action: 'half', policy: 'daily', label: '每天看，半買半等' },
  split_month_cap: { action: 'half', policy: 'monthCap', label: '月底看，半等最多半年' },
  split_daily_cap: { action: 'half', policy: 'dailyCap', label: '每天看，半等最多半年' }
};

export function parseArticleInputs(csv) {
  const [header, ...rows] = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = header.split(',');
  const position = Object.fromEntries(headers.map((name, index) => [name, index]));
  const required = ['date', 'adjusted_close', 'deposit_index', 'from_daily_high_pct', 'month_end',
    'from_month_end_high_pct', ...Object.values(reserveColumns)];
  if (required.some(name => !(name in position))) throw new Error('回測資料欄位不完整');
  return rows.map(row => {
    const cols = row.split(',');
    const get = field => cols[position[field]];
    const price = Number(get('adjusted_close'));
    const interest = Number(get('deposit_index'));
    const dailyDrawdown = Number(get('from_daily_high_pct'));
    if (!get('date') || !Number.isFinite(price) || price <= 0 || !Number.isFinite(interest)
        || interest <= 0 || !Number.isFinite(dailyDrawdown)) throw new Error('回測資料無法讀取');
    return {
      date: get('date'), price, interest, dailyDrawdown,
      monthEnd: get('month_end') === 'True',
      monthlyDrawdown: get('from_month_end_high_pct') ? Number(get('from_month_end_high_pct')) : null,
      orders: Object.fromEntries(Object.entries(reserveColumns).map(([key, col]) => [key, get(col) || null]))
    };
  });
}

export function scenarioFor(data, chapter) {
  const first = data.findIndex(day => day.monthEnd && day.date.startsWith(chapter.start));
  if (first < 0) throw new Error('找不到關卡起點');
  const turns = [];
  for (let index = first; index < data.length && turns.length < HORIZON; index++) {
    if (data[index].monthEnd) turns.push(index);
  }
  if (turns.length !== HORIZON) throw new Error('關卡資料不足五年');
  return { chapter, data, turns, first, last: turns[turns.length - 1] };
}

export function validDecision(decision) {
  return !!decision && Object.hasOwn(actions, decision.action)
    && (decision.policy === 'manual' || Object.hasOwn(reserveColumns, decision.policy));
}

export function play(scenario, decisions) {
  const { data, turns, first, last } = scenario;
  if (decisions.length > turns.length || !decisions.every(validDecision)) throw new Error('操作無法重播');
  const stop = decisions.length === turns.length ? last : turns[decisions.length] - 1;
  const months = [];
  const trades = [];
  let month = 0;
  let lots = [];
  let shares = 0;
  let principal = 0;
  let previousValue = 0;
  let unitValue = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let cashShareSum = 0;

  for (let index = first; index <= stop; index++) {
    const day = data[index];
    const cashBefore = lots.reduce((sum, lot) => sum + lot.units * day.interest, 0);
    if (previousValue > 0) {
      unitValue *= (shares * day.price + cashBefore) / previousValue;
      peak = Math.max(peak, unitValue);
      maxDrawdown = Math.max(maxDrawdown, 1 - unitValue / peak);
    }

    const monthly = index === turns[month];
    let regular = 0;
    let release = false;
    if (monthly) {
      const decision = decisions[month];
      const action = actions[decision.action];
      principal += MONTHLY_BUDGET;
      regular = MONTHLY_BUDGET * action.share;
      release = action.release;
      const reserve = MONTHLY_BUDGET - regular;
      if (reserve) lots.push({
        units: reserve / day.interest,
        buyDate: day.orders[decision.policy] ?? null
      });
      month++;
    }

    let reserveBought = 0;
    let cash = 0;
    const remaining = [];
    for (const lot of lots) {
      const value = lot.units * day.interest;
      if (release || lot.buyDate === day.date) reserveBought += value;
      else {
        cash += value;
        remaining.push(lot);
      }
    }
    lots = remaining;
    shares += (regular + reserveBought) / day.price;
    previousValue = shares * day.price + cash;
    if (regular || reserveBought) {
      // A trade between two scheduled deposits belongs to the following month.
      const turn = monthly ? month : Math.min(month + 1, turns.length);
      trades.push({ date: day.date, turn, regular, reserve: reserveBought, release });
    }
    if (monthly) {
      cashShareSum += cash / previousValue;
      months.push({ total: previousValue, cash, date: day.date });
    }
  }
  const cash = lots.reduce((sum, lot) => sum + lot.units * data[stop].interest, 0);
  return {
    total: previousValue, cash, principal,
    drawdown: 100 * maxDrawdown, meanMonthEndCash: month ? 100 * cashShareSum / month : 0,
    observed: stop, months, trades
  };
}

export function runBenchmark(scenario, key) {
  const { action, policy } = benchmarks[key];
  return play(scenario, Array.from({ length: scenario.turns.length }, () => ({ action, policy })));
}

export function biggestChange(player, base) {
  let previous = 0;
  let highlight = { index: 0, gap: 0, move: 0 };
  player.months.forEach((point, index) => {
    const gap = point.total - base.months[index].total;
    const move = gap - previous;
    if (Math.abs(move) > Math.abs(highlight.move)) highlight = { index, gap, move };
    previous = gap;
  });
  return highlight;
}
