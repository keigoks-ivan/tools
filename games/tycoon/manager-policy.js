import { dateOf, note } from './venture-core.js';

export function managementValid(w) {
  const m = w?.manager, amount = n => Number.isInteger(n) && n >= 0 && n <= (w?.co?.capital ?? 0) * 3;
  return m === undefined || !!(m && typeof m.enabled === 'boolean' && amount(m.budget) && amount(m.maxFixed) && typeof m.reserveMonths === 'number' && Number.isFinite(m.reserveMonths) && m.reserveMonths >= 0 && m.reserveMonths <= 3 && typeof m.allowOvertime === 'boolean' && ['balanced', 'service', 'delivery'].includes(m.priority) && typeof m.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m.month) && m.month >= dateOf(0).month && m.month <= dateOf(w.day).month && Number.isFinite(m.spent) && m.spent >= 0 && Array.isArray(m.log) && m.log.length <= 24 && m.log.every(x => x && Number.isInteger(x.day) && x.day >= 0 && x.day <= w.day && typeof x.text === 'string' && x.text.length <= 500 && Number.isFinite(x.amount) && x.amount >= 0));
}

export function management(w, fixed) {
  const defaults = { enabled: false, budget: Math.round(w.co.capital * (w.mode === 'manufacturing' ? .35 : .08)), maxFixed: Math.ceil(fixed * 1.5), reserveMonths: 1, allowOvertime: false, priority: 'balanced', month: dateOf(w.day).month, spent: 0, log: [] };
  const m = w.manager || defaults, spent = m.month === dateOf(w.day).month ? m.spent : 0;
  return { ...m, remaining: Math.max(0, m.budget - spent), currentSpent: spent };
}

export function managementAction(w, data, fixed) {
  if (w.status !== 'playing' || !data || typeof data !== 'object') return { ok: false, error: '已結案或代管設定不符。' };
  const old = management(w, fixed), next = { ...old };
  delete next.remaining; delete next.currentSpent;
  for (const key of ['enabled', 'budget', 'maxFixed', 'reserveMonths', 'allowOvertime', 'priority']) if (Object.hasOwn(data, key)) next[key] = data[key];
  if (!managementValid({ ...w, manager: next })) return { ok: false, error: '請填寫有效預算、固定月費上限、0–3 個月現金保留及代管方向。' };
  w.manager = next;
  note(w, next.enabled ? '已授權團隊在預算及現金保留內處理日常營運；接單、投資、借款與事件仍由老闆決定。' : '已切換自行管理，保留原有團隊與營運設定。');
  return { ok: true, message: next.enabled ? '團隊代管已啟用，下次推進時執行。' : '已切換自行管理。' };
}

export function managementRecord(w, text, amount = 0) {
  const m = w.manager;
  if (m.month !== dateOf(w.day).month) { m.month = dateOf(w.day).month; m.spent = 0; }
  m.spent += amount; m.log.unshift({ day: w.day, text, amount }); m.log.length = Math.min(24, m.log.length);
}
