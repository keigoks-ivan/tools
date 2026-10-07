// 新路線共用帳務與日期；生產、獲客與成長各由自己的引擎處理。
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const END_DAY = 1096; // 2026-10-01 至 2029-10-01，包含 2028 閏日。
export const COSTS = ['cogs', 'payroll', 'rent', 'cloud', 'marketing', 'research', 'energy', 'repair', 'penalty', 'interest', 'depreciation'];
export const COST_NAMES = { cogs: '已售商品／報廢成本', payroll: '人事', rent: '租金與行政', cloud: '主機與支付成本', marketing: '獲客與業務', research: '研發與品管', energy: '能源', repair: '維修', penalty: '違約／退款', interest: '利息', depreciation: '設備折舊' };
export function dateOf(day) {
  const d = new Date(Date.UTC(2026, 9, 1 + day));
  return { key: d.toISOString().slice(0, 10), month: d.toISOString().slice(0, 7), day: d.getUTCDate(), dim: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() };
}
export function random(w) { w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0; return w.rng / 4294967296; }
export function ledger(cash, month) {
  return { month, revenue: 0, ...Object.fromEntries(COSTS.map(k => [k, 0])), tax: 0, cashStart: cash, receipts: 0, payments: 0, paidCosts: 0, capex: 0, purchases: 0, borrowing: 0, principal: 0, sales: 0 };
}
export function company(capital) { return { cash: capital, capital, debt: 0, assets: 0, taxLoss: 0, insolventDays: 0, ledger: ledger(capital, dateOf(0).month), history: [], daily: [], log: [] }; }
export function note(w, text) { w.co.log.unshift({ day: w.day, text }); w.co.log.length = Math.min(w.co.log.length, 50); }
export function spend(w, n, kind = 'payments') { w.co.cash -= n; w.co.ledger[kind] += n; }
export function receive(w, n, kind = 'receipts') { w.co.cash += n; w.co.ledger[kind] += n; }
export function expense(w, kind, n, paid = false) { w.co.ledger[kind] += n; if (paid) { w.co.ledger.paidCosts += n; spend(w, n); } }
export function profit(row) { return row.revenue - COSTS.reduce((n, k) => n + row[k], 0) - row.tax; }
export function payable(w) { const l = w.co.ledger; return Math.max(0, COSTS.filter(k => !['cogs', 'depreciation', 'interest'].includes(k)).reduce((n, k) => n + l[k], 0) - l.paidCosts); }
export function financeAction(w, action, amount) {
  if (w.status !== 'playing' || !Number.isInteger(amount) || amount <= 0) return { ok: false, error: '請輸入正整數金額；結案後不能調整。' };
  if (action === 'borrow') {
    const limit = w.co.capital * 1.5;
    if (amount < 10000 || w.co.debt + amount > limit) return { ok: false, error: `貸款額度為初始資本的 1.5 倍，單次至少 1 萬。` };
    w.co.debt += amount; receive(w, amount, 'borrowing'); note(w, `借款 $${amount.toLocaleString()}；年息 8%，每月攤還剩餘本金的 1/24。`);
  } else if (action === 'repay') {
    if (amount > w.co.debt || amount > w.co.cash) return { ok: false, error: '還款不能超過剩餘本金或現金。' };
    w.co.debt -= amount; spend(w, amount, 'principal'); note(w, `提前還款 $${amount.toLocaleString()}。`);
  } else return { ok: false, error: '未知資金操作。' };
  return { ok: true };
}
export function finishDay(w, metrics) {
  const co = w.co, d = dateOf(w.day), next = dateOf(w.day + 1);
  if (d.month !== next.month || w.day === END_DAY - 1) {
    const interest = Math.round(co.debt * .08 / 12), principal = Math.min(co.debt, Math.ceil(co.debt / 24));
    expense(w, 'interest', interest); spend(w, payable(w) + interest); co.debt -= principal; spend(w, principal, 'principal');
    const preTax = profit(co.ledger), taxable = Math.max(0, preTax - co.taxLoss);
    co.taxLoss = Math.max(0, co.taxLoss - Math.max(0, preTax)) + Math.max(0, -preTax);
    co.ledger.tax = Math.round(taxable * .2); spend(w, co.ledger.tax);
    co.history.push({ ...co.ledger, net: profit(co.ledger), cashEnd: co.cash });
    co.ledger = ledger(co.cash, next.month); note(w, `${d.month} 月結：人事與費用支付，損益、本金與現金分列。`);
  }
  co.daily.push({ day: w.day, cash: co.cash, ...metrics }); co.daily = co.daily.slice(-180);
  co.insolventDays = co.cash < 0 ? co.insolventDays + 1 : 0;
  w.day++;
  if (co.insolventDays >= 7) { w.status = 'bankrupt'; note(w, '連續七天現金不足，營運結案。'); }
  else if (w.day >= END_DAY) { w.status = 'finished'; note(w, '三年經營結束，已產生結案分析。'); }
}
export function report(w) {
  const rows = [...w.co.history, ...(w.co.ledger.revenue || COSTS.some(k => w.co.ledger[k]) || w.status === 'playing' ? [{ ...w.co.ledger, net: profit(w.co.ledger), cashEnd: w.co.cash, partial: true }] : [])];
  return { rows, totals: rows.reduce((a, r) => { for (const k of ['revenue', ...COSTS, 'tax', 'net']) a[k] += r[k]; return a; }, Object.fromEntries(['revenue', ...COSTS, 'tax', 'net'].map(k => [k, 0]))) };
}
export function cashIdentity(row, cashEnd) { return row.cashStart + row.receipts + row.borrowing - row.payments - row.capex - row.purchases - row.principal - cashEnd; }
export function commonValid(w) {
  if (!w || w.v !== 1 || !Number.isInteger(w.day) || w.day < 0 || w.day > END_DAY || !Number.isInteger(w.rng) || w.rng < 0 || w.rng > 4294967295 || !['playing', 'finished', 'bankrupt'].includes(w.status) || w.status === 'playing' && w.day === END_DAY) return false;
  const co = w.co, finite = n => typeof n === 'number' && Number.isFinite(n), nonnegative = n => finite(n) && n >= 0;
  if (!co || !finite(co.cash) || !['capital', 'debt', 'assets', 'taxLoss', 'insolventDays'].every(k => nonnegative(co[k])) || co.capital <= 0 || !Array.isArray(co.history) || co.history.length > 36 || !Array.isArray(co.daily) || co.daily.length > 180 || !Array.isArray(co.log) || co.log.length > 50) return false;
  const rowValid = r => r && typeof r.month === 'string' && finite(r.cashStart) && ['revenue', ...COSTS, 'tax', 'receipts', 'payments', 'paidCosts', 'capex', 'purchases', 'borrowing', 'principal', 'sales'].every(k => nonnegative(r[k]));
  const dayValid = d => Number.isInteger(d) && d >= 0 && d <= w.day;
  return rowValid(co.ledger) && co.history.every(r => rowValid(r) && finite(r.net) && finite(r.cashEnd) && Math.abs(cashIdentity(r, r.cashEnd)) < .01) && Math.abs(cashIdentity(co.ledger, co.cash)) < .01 && co.log.every(x => x && dayValid(x.day) && typeof x.text === 'string') && co.daily.every(x => x && dayValid(x.day) && finite(x.cash));
}
