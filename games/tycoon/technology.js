import { clamp, random, company, dateOf, note, expense, receive, finishDay, commonValid, payable, END_DAY } from './venture-core.js';

export const MODELS = {
  saas: { name: '訂閱軟體 SaaS', description: '付費訂閱，重點是轉換、續訂與客戶終身價值。', capital: 800000, setup: 80000, price: 499, cac: 55, market: 30000, initialUsers: 80, initialPaid: 12, ticket: 0, capacity: 600, supportCapacity: 1200, adCPM: 0 },
  marketplace: { name: '網路媒合平台', description: '交易抽成，流動性、成功媒合與客服成本相互牽動。', capital: 1600000, setup: 140000, price: 8, cac: 26, market: 90000, initialUsers: 160, initialPaid: 0, ticket: 1200, capacity: 2500, supportCapacity: 6000, adCPM: 0 },
  content: { name: '內容與工具網站', description: '廣告收入，流量、使用體驗與內容更新的取捨。', capital: 650000, setup: 50000, price: 2, cac: 8, market: 250000, initialUsers: 500, initialPaid: 0, ticket: 0, capacity: 10000, supportCapacity: 40000, adCPM: 18 },
};
export const PROJECTS = {
  value: { name: '核心功能／內容', days: 35, fee: 18000, debt: .06, text: '提升品質最多 14 點，上限 95%；發布技術債依選定方式計算。' },
  retention: { name: '新手引導與留存', days: 28, fee: 12000, debt: .04, text: '改善留存成熟度最多 12 點，上限 95%；發布技術債依選定方式計算。' },
  reliability: { name: '架構與維運', days: 24, fee: 15000, debt: -.22, text: '改善架構並消除技術債，效果依發布方式；基礎容量最多提高 20%，累積上限為原始容量的 3 倍。' },
  activation: { name: '工作流程樣板', modelId: 'saas', days: 22, fee: 14000, debt: .04, text: '新客付費轉換 ×1.18、現有免費轉換 ×1.3；把功能做成能立即使用的工作流程。' },
  automation: { name: '客服與服務自動化', modelId: 'saas', days: 32, fee: 22000, debt: .06, text: '每位使用者月服務成本由 $8 降至 $6、客服容量 +35%；每月另付 $3,500 工具費。' },
  matching: { name: '雙邊搜尋與推薦', modelId: 'marketplace', days: 26, fee: 24000, debt: .07, text: '達到完整媒合密度所需人數 −30%、成交頻率 +6%；不能用註冊數代替成交。' },
  trust: { name: '信任與爭議處理', modelId: 'marketplace', days: 24, fee: 18000, debt: .04, text: '月流失 ×0.88；每筆交易服務成本由 $4 升至 $5，信任需要持續付出成本。' },
  evergreen: { name: '常青內容資料庫', modelId: 'content', days: 30, fee: 16000, debt: .05, text: '自然獲客 ×1.35、每人瀏覽 +10%；建立能持續被找到的內容與工具。' },
  analytics: { name: '編輯與廣告分析台', modelId: 'content', days: 20, fee: 12000, debt: .04, text: '每千次廣告收入 +20%、月流失 ×0.94；每位使用者月服務成本增加 $0.15。' },
};
export const STRATEGIES = {
  saas: {
    general: { name: '通用工具', text: '平衡獲客、轉換與服務成本，先找到願意付費的使用情境。' },
    selfserve: { name: '自助小團隊', text: '廣告單人成本 −22%、新客轉付費 +12%、自然獲客 +15%；月流失加 0.6 點、客服容量 −15%。', cac: .78, conversion: 1.12, organic: 1.15, churnAdd: .006, support: .85 },
    teams: { name: '企業協作團隊', text: '月流失 −22%；廣告單人成本 +35%、新客轉付費 −12%、每人月服務成本 +$2、客服容量 −25%，可觸及市場 18,000 人。', cac: 1.35, conversion: .88, churn: .78, userCost: 2, support: .75, market: .6 },
  },
  marketplace: {
    general: { name: '綜合媒合', text: '完整密度需 2,500 位活躍者；抽成、品質與流動性一起影響成交。' },
    niche: { name: '垂直專業市場', text: '完整媒合密度門檻降至 1,200 人、成交頻率 +5%；廣告單人成本 +10%、客服容量 −20%，可觸及市場 45,000 人。', liquidity: 1200, trades: 1.05, cac: 1.1, support: .8, market: .5 },
    mass: { name: '大眾交易市場', text: '廣告單人成本 −22%、成交頻率 +15%；完整媒合密度需 5,000 位活躍者，前期雙邊客源更難湊齊。', liquidity: 5000, cac: .78, trades: 1.15 },
  },
  content: {
    general: { name: '綜合內容與工具', text: '平衡瀏覽、自然觸及與廣告收入，廣告密度仍會影響流失。' },
    search: { name: '搜尋與解題內容', text: '自然獲客 +55%、每千次廣告收入 +15%、月流失 −5%；每人瀏覽 −10%、廣告單人成本 +15%、每人月服務成本 +$0.15。', organic: 1.55, adCPM: 1.15, churn: .95, visits: .9, cac: 1.15, userCost: .15 },
    community: { name: '深度社群與會員', text: '每人瀏覽 +25%、月流失 −20%、自然獲客 +20%；每千次廣告收入 −15%、廣告單人成本 +10%、客服容量 −45%。', visits: 1.25, churn: .8, organic: 1.2, adCPM: .85, cac: 1.1, support: .55 },
  },
};
export const RELEASES = {
  standard: { name: '標準發布', text: '標準工作量與測試費，按專案增加或消除技術債。', days: 1, fee: 1 },
  pilot: { name: '小規模試點', text: '工作量 +40%、測試費 +50%；功能發布只留下原定 20% 技術債，架構專案額外消除 3 點。', days: 1.4, fee: 1.5 },
  rush: { name: '搶先全面上線', text: '工作量 −35%、測試費 −15%；額外留下技術債 10 點，後續可用率與維運會承受代價。', days: .65, fee: .85 },
};
export function technologyProjects(modelId) {
  return Object.fromEntries(Object.entries(PROJECTS).filter(([, p]) => !p.modelId || p.modelId === modelId));
}
const strategyOf = w => STRATEGIES[w.modelId][w.strategy || 'general'];
const has = (w, id) => (w.capabilities || []).includes(id);
const maintenanceOf = w => w.focus === 'stability' ? 1 : w.focus === 'balanced' ? .55 : .2;
export function technologyProjectPlan(w, id, release = w.project?.id === id ? w.project.release || 'standard' : 'standard') {
  if (typeof id !== 'string' || typeof release !== 'string') return null;
  const projects = technologyProjects(w.modelId), p = Object.hasOwn(projects, id) ? projects[id] : null, r = Object.hasOwn(RELEASES, release) ? RELEASES[release] : null;
  if (!p || !r) return null;
  const days = Math.ceil(p.days * r.days), progress = w.project?.id === id && (w.project.release || 'standard') === release ? w.project.progress : 0;
  const debt = release === 'pilot' ? p.debt > 0 ? p.debt * .2 : p.debt - .03 : p.debt + (release === 'rush' ? .1 : 0);
  const capacityGain = id === 'reliability' ? Math.min(3, w.capacityBonus * 1.2) / w.capacityBonus - 1 : 0;
  const text = id === 'reliability' ? `依目前容量，完成可增加基礎容量 ${(capacityGain * 100).toFixed(1)}%；${r.name}最多消除技術債 ${Math.abs(debt * 100).toFixed(1)} 點，技術債最低為零。` : p.text;
  return { ...p, id, text, days, fee: Math.round(p.fee * r.fee), debt, capacityGain, release, releaseName: r.name, estimatedDays: Math.max(0, Math.ceil((days - progress) / (w.engineers * (1 - maintenanceOf(w) * .7)))), completed: !!p.modelId && has(w, id) };
}
export function technologyEffects(w) {
  const s = strategyOf(w);
  return {
    strategy: w.strategy || 'general', strategyName: s.name, market: Math.round(MODELS[w.modelId].market * (s.market || 1)),
    liquidityTarget: (s.liquidity || 2500) * (has(w, 'matching') ? .7 : 1), transactionMultiplier: (s.trades || 1) * (has(w, 'matching') ? 1.06 : 1),
    conversionMultiplier: (s.conversion || 1) * (has(w, 'activation') ? 1.18 : 1), oldFreeConversionMultiplier: has(w, 'activation') ? 1.3 : 1,
    organicMultiplier: (s.organic || 1) * (has(w, 'evergreen') ? 1.35 : 1), visitMultiplier: (s.visits || 1) * (has(w, 'evergreen') ? 1.1 : 1),
    adCPM: MODELS[w.modelId].adCPM * (s.adCPM || 1) * (has(w, 'analytics') ? 1.2 : 1),
    userCost: (w.modelId === 'saas' ? has(w, 'automation') ? 6 : 8 : .35) + (s.userCost || 0) + (has(w, 'analytics') ? .15 : 0),
    transactionCost: has(w, 'trust') ? 5 : 4, toolingCost: has(w, 'automation') ? 3500 : 0,
    supportCapacity: MODELS[w.modelId].supportCapacity * (s.support || 1) * (has(w, 'automation') ? 1.35 : 1),
    churnMultiplier: (s.churn || 1) * (has(w, 'trust') ? .88 : 1) * (has(w, 'analytics') ? .94 : 1), churnAdd: s.churnAdd || 0, cacMultiplier: s.cac || 1,
  };
}
export function createTechnology(modelId = 'saas', seed = 20261007) {
  if (typeof modelId !== 'string' || !Object.hasOwn(MODELS, modelId)) throw new Error('未知網路業態');
  const p = MODELS[modelId], w = { v: 1, mode: 'technology', modelId, day: 0, rng: seed >>> 0, status: 'playing', co: company(p.capital), users: p.initialUsers, paying: p.initialPaid, quality: .4, retention: .35, techDebt: .2, reputation: .5, engineers: 1, support: 1, marketing: 18000, price: p.price, cloudTier: 0, capacityBonus: 1, focus: 'balanced', strategy: 'general', capabilities: [], project: null, event: null, shock: null, stats: { acquired: 0, converted: 0, churned: 0, outages: 0, transactions: 0, gmv: 0, visits: 0 }, today: { acquired: 0, converted: 0, churned: 0, uptime: 1, load: 0, revenue: 0, transactions: 0, visits: 0, acquisitionCost: 0 } };
  expense(w, 'research', p.setup, true); note(w, '產品已上線。先驗證客戶願不願留下與付費，再擴大獲客。三年後結案。');
  return w;
}
const capacityOf = w => Math.round(MODELS[w.modelId].capacity * 2 ** w.cloudTier * w.capacityBonus);
const uptimeBase = w => 1 - w.techDebt * .035 - (w.shock && w.day < w.shock.until ? w.shock.outage : 0);
const uptimeOf = (w, users) => clamp(1 - Math.max(0, users / capacityOf(w) - .8) * .15 - w.techDebt * .035 - (w.shock && w.day < w.shock.until ? w.shock.outage : 0), .35, .999);
const fixedOf = w => w.engineers * 45000 + w.support * 30000 + 6000 + 4500 * 2 ** w.cloudTier + w.marketing + technologyEffects(w).toolingCost;
// 月貢獻與每日收入共用相同流量、支付和退款因子；不含固定人事與獲客費。
export function technologyEconomics(w, { users = w.users, paying = w.paying, uptime = uptimeOf(w, users), dim = dateOf(w.day).dim } = {}) {
  const p = MODELS[w.modelId], fx = technologyEffects(w), capacity = capacityOf(w), load = users / capacity, paid = w.modelId === 'saas';
  const transactionRate = .055 * (.6 + w.quality * .6) * Math.min(1, users / fx.liquidityTarget) * uptime * clamp(1 - (w.price - 8) * .035, .5, 1.2) * fx.transactionMultiplier;
  const dailyTransactions = w.modelId === 'marketplace' ? users * transactionRate : 0;
  const dailyVisits = w.modelId === 'content' ? users * (2 + w.quality * 3) * uptime * fx.visitMultiplier : 0;
  const transactions = dailyTransactions * dim, visits = dailyVisits * dim;
  const revenue = paid ? paying * w.price * uptime : w.modelId === 'marketplace' ? transactions * p.ticket * w.price / 100 : visits * w.price * fx.adCPM / 1000;
  const userCost = fx.userCost, paymentRate = paid ? .035 : 0, refundRate = uptime < .9 ? (1 - uptime) * .25 : 0;
  const variable = users * userCost + revenue * paymentRate + transactions * fx.transactionCost, refunds = revenue * refundRate;
  const monthlyUnit = paid ? w.price * uptime * (1 - paymentRate - refundRate) - userCost : w.modelId === 'marketplace' ? transactionRate * dim * (p.ticket * w.price / 100 * (1 - refundRate) - fx.transactionCost) - userCost : dim * (2 + w.quality * 3) * w.price * fx.adCPM / 1000 * uptime * fx.visitMultiplier * (1 - refundRate) - userCost;
  return { ...fx, capacity, load, uptime, transactionRate, transactions, visits, dailyTransactions, dailyVisits, revenue, variable, refunds, contribution: revenue - variable - refunds, monthlyUnit, refundRate, userCost, paymentRate };
}
const polyScale = (a, n) => a.map(x => x * n);
const polyAdd = (a, b) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] || 0) + (b[i] || 0));
function polyMultiply(a, b) { const p = Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { p[i + j] += x * y; })); return p; }
const polyAt = (p, x) => p.reduceRight((v, n) => v * x + n, 0);
const polyDerivative = p => p.slice(1).map((n, i) => n * (i + 1));
function polynomialRoots(p, lo, hi) {
  while (p.length > 1 && p.at(-1) === 0) p = p.slice(0, -1);
  if (p.length <= 1) return [];
  if (p.length === 2) { const x = -p[0] / p[1]; return x > lo && x < hi ? [x] : []; }
  const points = [lo, ...polynomialRoots(polyDerivative(p), lo, hi), hi], roots = [];
  for (let i = 0; i < points.length - 1; i++) {
    let a = points[i], b = points[i + 1], va = polyAt(p, a), vb = polyAt(p, b);
    if (i && Math.abs(va) < 1e-8) roots.push(a);
    if (va * vb >= 0) continue;
    for (let j = 0; j < 48; j++) { const mid = (a + b) / 2, v = polyAt(p, mid); if (va * v <= 0) b = mid; else { a = mid; va = v; } }
    roots.push((a + b) / 2);
  }
  return roots;
}
function profitPolynomial(w, free, max, lo, hi, fixed) {
  const p = MODELS[w.modelId], fx = technologyEffects(w), dim = dateOf(w.day).dim, users = [free, max], midUsers = free + max * (lo + hi) / 2, capacity = capacityOf(w), base = uptimeBase(w);
  const raw = base - Math.max(0, midUsers / capacity - .8) * .15;
  const up = raw <= .35 ? [.35] : raw >= .999 ? [.999] : midUsers <= capacity * .8 ? [base] : [base + .12 - free / capacity * .15, -max / capacity * .15];
  const refund = polyAt(up, (lo + hi) / 2) < .9 ? polyAdd([.25], polyScale(up, -.25)) : [0];
  let gross, costs = polyScale(users, fx.userCost);
  if (w.modelId === 'saas') gross = polyScale(polyMultiply([0, max], up), w.price);
  else if (w.modelId === 'marketplace') {
    const liquidity = midUsers < fx.liquidityTarget ? polyScale(users, 1 / fx.liquidityTarget) : [1];
    const trades = polyScale(polyMultiply(polyMultiply(users, liquidity), up), dim * .055 * (.6 + w.quality * .6) * clamp(1 - (w.price - 8) * .035, .5, 1.2) * fx.transactionMultiplier);
    gross = polyScale(trades, p.ticket * w.price / 100); costs = polyAdd(costs, polyScale(trades, fx.transactionCost));
  } else gross = polyScale(polyMultiply(users, up), dim * (2 + w.quality * 3) * w.price * fx.adCPM / 1000 * fx.visitMultiplier);
  const keep = polyAdd([w.modelId === 'saas' ? .965 : 1], polyScale(refund, -1));
  return polyAdd(polyMultiply(gross, keep), polyAdd(polyScale(costs, -1), [-fixed]));
}
// 每段獲利是至多四次多項式。按容量、退款及媒合轉折與極值分段，避免假設獲利隨規模單調增加。
export function technologyBreakEven(w, fixed = fixedOf(w)) {
  const fx = technologyEffects(w), paid = w.modelId === 'saas', free = paid ? w.users - w.paying : 0, max = fx.market - free;
  if (max <= 0) return null;
  const capacity = capacityOf(w), base = uptimeBase(w), usersAtUptime = u => (base + .12 - u) * capacity / .15;
  const cuts = [0, 1, ...[capacity * .8, usersAtUptime(.999), usersAtUptime(.9), usersAtUptime(.35), ...(paid ? [] : [fx.liquidityTarget])].map(n => (n - free) / max).filter(n => n > 0 && n < 1)].sort((a, b) => a - b);
  const value = n => technologyEconomics(w, { users: free + n, paying: paid ? n : 0 }).contribution - fixed;
  for (let i = 0; i < cuts.length - 1; i++) {
    const lo = cuts[i], hi = cuts[i + 1], poly = profitPolynomial(w, free, max, lo, hi, fixed);
    const points = [lo, ...polynomialRoots(polyDerivative(poly), lo, hi), hi];
    for (let j = 0; j < points.length - 1; j++) {
      let a = Math.max(1, Math.ceil(points[j] * max - 1e-7)), b = Math.min(max, Math.floor(points[j + 1] * max + 1e-7));
      if (a > b) continue;
      if (value(a) >= 0) return a;
      if (value(b) < 0) continue;
      while (a < b) { const mid = Math.floor((a + b) / 2); if (value(mid) >= 0) b = mid; else a = mid + 1; }
      return a;
    }
  }
  return null;
}
export function technologyMetrics(w, { includeBreakEven = true } = {}) {
  const p = MODELS[w.modelId], e = technologyEconomics(w), { capacity, load, uptime, monthlyUnit } = e;
  const supportLoad = w.users / Math.max(1, w.support * e.supportCapacity), fit = clamp(w.quality * .7 + w.retention * .3, 0, 1);
  const friction = w.modelId === 'saas' ? Math.max(0, w.price / p.price - 1) * .08 : w.modelId === 'marketplace' ? Math.max(0, w.price - 8) * .006 : Math.max(0, w.price - 2) * .015;
  const paidChurn = clamp((.035 + (1 - fit) * .065 + (1 - uptime) * .7 + Math.max(0, supportLoad - 1) * .035 + friction) * e.churnMultiplier + e.churnAdd, .02, .45), activeChurn = Math.min(.5, paidChurn * 1.6), churn = w.modelId === 'saas' ? paidChurn : activeChurn;
  const conversion = clamp((.07 + w.quality * .22 + w.retention * .1) * uptime * (w.modelId === 'saas' ? (p.price / w.price) ** .6 : 1) * e.conversionMultiplier, .01, .55);
  const competition = 1 + Math.min(.65, w.day / 1095 * .65), saturation = 1 + w.users / e.market * 2.5;
  const acquisitionCost = p.cac * competition * saturation * (w.shock && w.day < w.shock.until ? w.shock.cac : 1) / (.8 + w.reputation * .4) * e.cacMultiplier;
  const fixed = fixedOf(w);
  return { ...e, supportLoad, churn, paidChurn, activeChurn, conversion, acquisitionCost, fixed, monthlyUnit, breakEven: includeBreakEven ? technologyBreakEven(w, fixed) : null, ltv: monthlyUnit > 0 ? monthlyUnit / churn : 0, payable: payable(w) };
}
export function technologyAction(w, action, data = {}) {
  const fail = error => ({ ok: false, error });
  if (w.status !== 'playing') return fail('已結案，不能更改經營。');
  if (action === 'settings') {
    const bounds = w.modelId === 'saas' ? [99, 1999] : w.modelId === 'marketplace' ? [2, 20] : [1, 6];
    if (!Number.isInteger(data.engineers) || data.engineers < 1 || data.engineers > 12 || !Number.isInteger(data.support) || data.support < 0 || data.support > 20 || !Number.isInteger(data.marketing) || data.marketing < 0 || data.marketing > 500000 || !Number.isInteger(data.price) || data.price < bounds[0] || data.price > bounds[1] || !Number.isInteger(data.cloudTier) || data.cloudTier < 0 || data.cloudTier > 5 || !['growth', 'balanced', 'stability'].includes(data.focus) || data.strategy !== undefined && (typeof data.strategy !== 'string' || !Object.hasOwn(STRATEGIES[w.modelId], data.strategy))) return fail('設定超出範圍。');
    const hiring = (Math.max(0, data.engineers - w.engineers) + Math.max(0, data.support - w.support)) * 12000;
    if (hiring > 0 && w.co.cash < hiring) return fail('每位新人需 $12,000 招募費，現金不足。');
    if (hiring) expense(w, 'research', hiring, true);
    for (const k of ['engineers', 'support', 'marketing', 'price', 'cloudTier', 'focus']) w[k] = data[k];
    if (data.strategy !== undefined) w.strategy = data.strategy;
    note(w, `已調整價格、獲客、人力、容量與開發重心。客群策略：${strategyOf(w).name}。`);
  } else if (action === 'project') {
    const p = technologyProjectPlan(w, data.id, data.release === undefined ? 'standard' : data.release);
    if (!p || w.project || p.completed) return fail(p?.completed ? '這項產品能力已完成；可投資其他專案或持續改善核心產品。' : '研發已在進行、專案不屬於此業態，或發布方式不符。');
    if (w.co.cash < p.fee) return fail('現金不足支付外部工具與測試費。');
    expense(w, 'research', p.fee, true); w.project = { id: data.id, progress: 0, release: p.release };
    note(w, `${p.name} 開始 · ${p.releaseName}，測試費 $${p.fee.toLocaleString()}、${p.days} 工程工作量；目前約 ${p.estimatedDays} 天。工程投入會影響日常維運。`);
  } else if (action === 'strategy') {
    if (typeof data.id !== 'string' || !Object.hasOwn(STRATEGIES[w.modelId], data.id)) return fail('這項客群策略不屬於此業態。');
    if ((w.strategy || 'general') === data.id) return { ok: true, message: '目前已採用這項客群策略。' };
    w.strategy = data.id; note(w, `改採${strategyOf(w).name}：${strategyOf(w).text} 既有使用者保留，新的獲客受策略市場上限影響。`);
  } else if (action === 'event') {
    if (!w.event || !['protect', 'accept'].includes(data.choice)) return fail('沒有待決事件。');
    if (data.choice === 'protect') {
      if (w.co.cash < 20000) return fail('遷移與稽核需要 $20,000。');
      expense(w, 'repair', 20000, true); w.shock = { cac: 1.1, outage: 0, until: w.day + 30 }; w.techDebt = Math.max(0, w.techDebt - .1); note(w, '完成供應商切換與稽核，30 天內獲客成本增加 10%。');
    } else { w.shock = { cac: 1.45, outage: .04, until: w.day + 30 }; note(w, '保留現金，30 天內獲客成本增加 45%，可用率下降 4 點。'); }
    w.event = null;
  } else return fail('未知網路操作。');
  return { ok: true };
}
const stochastic = (w, n) => Math.floor(n) + (random(w) < n % 1 ? 1 : 0);
export function stepTechnology(w) {
  if (w.status !== 'playing' || w.event) return false;
  const p = MODELS[w.modelId], dim = dateOf(w.day).dim, m = technologyMetrics(w, { includeBreakEven: false }), spendDay = w.marketing / dim;
  const organic = (w.modelId === 'content' ? (12 + w.users * .004 * w.quality) * m.uptime : (2 + w.users * .0015 * w.reputation) * m.uptime) * m.organicMultiplier;
  const acquired = Math.min(Math.max(0, m.market - w.users), stochastic(w, spendDay / m.acquisitionCost + organic));
  const free = w.users - w.paying, lostFree = stochastic(w, free * m.activeChurn / dim), lostPaid = stochastic(w, w.paying * m.paidChurn / dim);
  const converted = w.modelId === 'saas' ? Math.min(free - lostFree + acquired, stochastic(w, acquired * m.conversion + free * .002 * w.quality * m.oldFreeConversionMultiplier)) : 0;
  w.users = Math.max(0, w.users + acquired - lostFree - lostPaid); w.paying = Math.min(w.users, Math.max(0, w.paying + converted - lostPaid));
  const e = technologyEconomics(w, { uptime: m.uptime, dim });
  let revenue = 0, transactions = 0, visits = 0, gmv = 0;
  if (w.modelId === 'saas') revenue = w.paying * w.price / dim * m.uptime;
  else if (w.modelId === 'marketplace') {
    transactions = stochastic(w, e.dailyTransactions);
    gmv = transactions * p.ticket; revenue = gmv * w.price / 100;
  } else { visits = stochastic(w, e.dailyVisits); revenue = visits * w.price * e.adCPM / 1000; }
  w.co.ledger.revenue += revenue; w.co.ledger.sales += w.modelId === 'saas' ? w.paying / dim : w.modelId === 'marketplace' ? transactions : visits; receive(w, revenue);
  expense(w, 'payroll', (w.engineers * 45000 + w.support * 30000) / dim); expense(w, 'rent', 6000 / dim); expense(w, 'marketing', spendDay);
  expense(w, 'cloud', (4500 * 2 ** w.cloudTier + e.toolingCost) / dim + w.users * (e.userCost / dim) + revenue * e.paymentRate + transactions * e.transactionCost);
  if (m.uptime < .9) { expense(w, 'penalty', revenue * e.refundRate, true); w.stats.outages++; }
  const maintenance = maintenanceOf(w);
  w.techDebt = clamp(w.techDebt + .0015 + acquired / 30000 + (w.project ? .001 : 0) - w.engineers * maintenance * .0025, 0, 1);
  w.quality = clamp(w.quality - .0003 - w.techDebt * .00035, .1, .95);
  w.reputation = clamp(w.reputation + (m.uptime > .98 && m.supportLoad < 1 ? .001 : -.002 * Math.max(1, m.supportLoad)), .1, .95);
  let completedProject = '';
  if (w.project) {
    w.project.progress += w.engineers * (1 - maintenance * .7);
    const job = technologyProjectPlan(w, w.project.id);
    if (w.project.progress >= job.days) {
      completedProject = w.project.id;
      const debtBefore = w.techDebt, capacityBefore = w.capacityBonus;
      if (completedProject === 'value') w.quality = Math.min(.95, w.quality + .14);
      if (completedProject === 'retention') w.retention = Math.min(.95, w.retention + .12);
      if (completedProject === 'reliability') w.capacityBonus = Math.min(3, w.capacityBonus * 1.2);
      if (job.modelId) w.capabilities = [...(w.capabilities || []), completedProject];
      w.techDebt = clamp(w.techDebt + job.debt, 0, 1); w.stats.projectsCompleted = (w.stats.projectsCompleted || 0) + 1;
      const debtChanged = w.techDebt - debtBefore, capacityChanged = w.capacityBonus / capacityBefore - 1;
      const effects = completedProject === 'reliability' ? `基礎容量實際增加 ${(capacityChanged * 100).toFixed(1)}%。` : job.text;
      const debtEffect = debtChanged === 0 ? '變化 0.0 點' : `${debtChanged > 0 ? '增加' : '消除'} ${Math.abs(debtChanged * 100).toFixed(1)} 點`;
      note(w, `${job.name} · ${job.releaseName}已上線。${effects} 本次技術債實際${debtEffect}；能力從下一個營運日生效。`); w.project = null;
    }
  }
  w.stats.acquired += acquired; w.stats.converted += converted; w.stats.churned += lostFree + lostPaid; w.stats.transactions += transactions; w.stats.gmv += gmv; w.stats.visits += visits;
  w.today = { acquired, converted, churned: lostFree + lostPaid, uptime: m.uptime, load: m.load, revenue, transactions, visits, acquisitionCost: m.acquisitionCost, completedProject };
  finishDay(w, { ...w.today, users: w.users, paying: w.paying });
  if (w.status === 'playing' && w.day % 90 === 0) { w.event = { title: '流量與雲端供應商調整', text: '未來 30 天廣告成本上漲，服務穩定性也受影響。花 $20,000 切換供應商與稽核，或保留現金接受較高獲客成本及較低可用率。' }; note(w, '網路營運決策待處理，時間已暫停。'); }
  return true;
}
export function technologyValid(w) {
  const nn = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (!commonValid(w) || w.mode !== 'technology' || typeof w.modelId !== 'string' || !Object.hasOwn(MODELS, w.modelId) || !Number.isInteger(w.users) || w.users < 0 || w.users > MODELS[w.modelId].market || !Number.isInteger(w.paying) || w.paying < 0 || w.paying > w.users || !['quality', 'retention', 'techDebt', 'reputation'].every(k => nn(w[k]) && w[k] <= 1) || !Number.isInteger(w.engineers) || w.engineers < 1 || w.engineers > 12 || !Number.isInteger(w.support) || w.support < 0 || w.support > 20 || !Number.isInteger(w.marketing) || w.marketing < 0 || w.marketing > 500000 || !Number.isInteger(w.cloudTier) || w.cloudTier < 0 || w.cloudTier > 5 || !nn(w.capacityBonus) || w.capacityBonus < 1 || w.capacityBonus > 3 || !['growth', 'balanced', 'stability'].includes(w.focus)) return false;
  if (w.strategy !== undefined && (typeof w.strategy !== 'string' || !Object.hasOwn(STRATEGIES[w.modelId], w.strategy)) || w.capabilities !== undefined && (!Array.isArray(w.capabilities) || w.capabilities.length > 2 || new Set(w.capabilities).size !== w.capabilities.length || w.capabilities.some(id => typeof id !== 'string' || !Object.hasOwn(PROJECTS, id) || PROJECTS[id].modelId !== w.modelId))) return false;
  const bounds = w.modelId === 'saas' ? [99, 1999] : w.modelId === 'marketplace' ? [2, 20] : [1, 6];
  const job = w.project ? technologyProjectPlan(w, w.project.id, w.project.release === undefined ? 'standard' : w.project.release) : null;
  return !!(Number.isInteger(w.price) && w.price >= bounds[0] && w.price <= bounds[1] && (!w.project || job && !job.completed && nn(w.project.progress) && w.project.progress < job.days) && (!w.shock || nn(w.shock.cac) && nn(w.shock.outage) && w.shock.outage <= 1 && Number.isInteger(w.shock.until) && w.shock.until >= 0 && w.shock.until <= END_DAY + 365) && (!w.event || typeof w.event.title === 'string' && typeof w.event.text === 'string') && w.stats && ['acquired','converted','churned','outages','transactions','gmv','visits'].every(k=>nn(w.stats[k])) && (w.stats.projectsCompleted === undefined || Number.isInteger(w.stats.projectsCompleted) && w.stats.projectsCompleted >= 0 && w.stats.projectsCompleted <= END_DAY * 12) && w.today && ['acquired','converted','churned','uptime','load','revenue','transactions','visits','acquisitionCost'].every(k=>nn(w.today[k])) && (w.today.completedProject === undefined || w.today.completedProject === '' || typeof w.today.completedProject === 'string' && Object.hasOwn(technologyProjects(w.modelId), w.today.completedProject)));
}
