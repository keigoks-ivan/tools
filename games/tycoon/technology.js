import { clamp, random, company, dateOf, note, expense, receive, finishDay, commonValid, payable } from './venture-core.js';

export const MODELS = {
  saas: { name: '訂閱軟體 SaaS', description: '付費訂閱，重點是轉換、續訂與客戶終身價值。', capital: 800000, setup: 80000, price: 499, cac: 55, market: 30000, initialUsers: 80, initialPaid: 12, ticket: 0, capacity: 600, supportCapacity: 1200, adCPM: 0 },
  marketplace: { name: '網路媒合平台', description: '交易抽成，流動性、成功媒合與客服成本相互牽動。', capital: 1600000, setup: 140000, price: 8, cac: 26, market: 90000, initialUsers: 160, initialPaid: 0, ticket: 1200, capacity: 2500, supportCapacity: 6000, adCPM: 0 },
  content: { name: '內容與工具網站', description: '廣告收入，流量、使用體驗與內容更新的取捨。', capital: 650000, setup: 50000, price: 2, cac: 8, market: 250000, initialUsers: 500, initialPaid: 0, ticket: 0, capacity: 10000, supportCapacity: 40000, adCPM: 18 },
};
export const PROJECTS = {
  value: { name: '核心功能／內容', days: 35, fee: 18000, text: '提升品質 14 點；發布增加技術債 6 點。' },
  retention: { name: '新手引導與留存', days: 28, fee: 12000, text: '改善轉換與留存 12 點；技術債增加 4 點。' },
  reliability: { name: '架構與維運', days: 24, fee: 15000, text: '消除技術債 22 點、基礎容量增加 20%。' },
};
export function createTechnology(modelId = 'saas', seed = 20261007) {
  if (!MODELS[modelId]) throw new Error('未知網路業態');
  const p = MODELS[modelId], w = { v: 1, mode: 'technology', modelId, day: 0, rng: seed >>> 0, status: 'playing', co: company(p.capital), users: p.initialUsers, paying: p.initialPaid, quality: .4, retention: .35, techDebt: .2, reputation: .5, engineers: 1, support: 1, marketing: 18000, price: p.price, cloudTier: 0, capacityBonus: 1, focus: 'balanced', project: null, event: null, shock: null, stats: { acquired: 0, converted: 0, churned: 0, outages: 0, transactions: 0, gmv: 0, visits: 0 }, today: { acquired: 0, converted: 0, churned: 0, uptime: 1, load: 0, revenue: 0, transactions: 0, visits: 0, acquisitionCost: 0 } };
  expense(w, 'research', p.setup, true); note(w, '產品已上線。先驗證客戶願不願留下與付費，再擴大獲客。三年後結案。');
  return w;
}
export function technologyMetrics(w) {
  const p = MODELS[w.modelId], capacity = Math.round(p.capacity * 2 ** w.cloudTier * w.capacityBonus), load = w.users / capacity;
  const uptime = clamp(1 - Math.max(0, load - .8) * .15 - w.techDebt * .035 - (w.shock && w.day < w.shock.until ? w.shock.outage : 0), .35, .999);
  const supportLoad = w.users / Math.max(1, w.support * p.supportCapacity), fit = clamp(w.quality * .7 + w.retention * .3, 0, 1);
  const friction = w.modelId === 'saas' ? Math.max(0, w.price / p.price - 1) * .08 : w.modelId === 'marketplace' ? Math.max(0, w.price - 8) * .006 : Math.max(0, w.price - 2) * .015;
  const churn = clamp(.035 + (1 - fit) * .065 + (1 - uptime) * .7 + Math.max(0, supportLoad - 1) * .035 + friction, .02, .45);
  const conversion = clamp((.07 + w.quality * .22 + w.retention * .1) * uptime * (w.modelId === 'saas' ? (p.price / w.price) ** .6 : 1), .01, .55);
  const competition = 1 + Math.min(.65, w.day / 1095 * .65), saturation = 1 + w.users / p.market * 2.5;
  const acquisitionCost = p.cac * competition * saturation * (w.shock && w.day < w.shock.until ? w.shock.cac : 1) / (.8 + w.reputation * .4);
  const fixed = w.engineers * 45000 + w.support * 30000 + 6000 + 4500 * 2 ** w.cloudTier + w.marketing;
  const dim = dateOf(w.day).dim, transactionRate = .055 * (.6 + w.quality * .6) * Math.min(1, w.users / 2500) * uptime * clamp(1 - (w.price - 8) * .035, .5, 1.2);
  const monthlyUnit = w.modelId === 'saas' ? w.price * uptime * .965 - 8 : w.modelId === 'marketplace' ? transactionRate * dim * (p.ticket * w.price / 100 - 4) - .35 : dim * (2 + w.quality * 3) * w.price * p.adCPM / 1000 * uptime - .35;
  const freeUserCost = w.modelId === 'saas' ? (w.users - w.paying) * 8 : 0;
  return { capacity, load, uptime, supportLoad, churn, conversion, acquisitionCost, fixed, monthlyUnit, breakEven: monthlyUnit > 0 ? Math.ceil((fixed + freeUserCost) / monthlyUnit) : null, ltv: monthlyUnit > 0 ? monthlyUnit / churn : 0, payable: payable(w) };
}
export function technologyAction(w, action, data = {}) {
  const fail = error => ({ ok: false, error });
  if (w.status !== 'playing') return fail('已結案，不能更改經營。');
  if (action === 'settings') {
    const bounds = w.modelId === 'saas' ? [99, 1999] : w.modelId === 'marketplace' ? [2, 20] : [1, 6];
    if (!Number.isInteger(data.engineers) || data.engineers < 1 || data.engineers > 12 || !Number.isInteger(data.support) || data.support < 0 || data.support > 20 || !Number.isInteger(data.marketing) || data.marketing < 0 || data.marketing > 500000 || !Number.isInteger(data.price) || data.price < bounds[0] || data.price > bounds[1] || !Number.isInteger(data.cloudTier) || data.cloudTier < 0 || data.cloudTier > 5 || !['growth', 'balanced', 'stability'].includes(data.focus)) return fail('設定超出範圍。');
    const hiring = (Math.max(0, data.engineers - w.engineers) + Math.max(0, data.support - w.support)) * 12000;
    if (hiring > 0 && w.co.cash < hiring) return fail('每位新人需 $12,000 招募費，現金不足。');
    if (hiring) expense(w, 'research', hiring, true);
    for (const k of ['engineers', 'support', 'marketing', 'price', 'cloudTier', 'focus']) w[k] = data[k]; note(w, '已調整價格、獲客、人力、容量與開發重心。');
  } else if (action === 'project') {
    const p = PROJECTS[data.id]; if (!p || w.project) return fail('研發已在進行或專案不存在。');
    if (w.co.cash < p.fee) return fail('現金不足支付外部工具與測試費。');
    expense(w, 'research', p.fee, true); w.project = { id: data.id, progress: 0 }; note(w, `${p.name} 開始，工程人力投入會影響上線速度與日常維運。`);
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
  const p = MODELS[w.modelId], dim = dateOf(w.day).dim, m = technologyMetrics(w), spendDay = w.marketing / dim;
  const organic = w.modelId === 'content' ? (12 + w.users * .004 * w.quality) * m.uptime : (2 + w.users * .0015 * w.reputation) * m.uptime;
  const acquired = Math.min(p.market - w.users, stochastic(w, spendDay / m.acquisitionCost + organic));
  const free = w.users - w.paying, lostFree = stochastic(w, free * Math.min(.5, m.churn * 1.6) / dim), lostPaid = stochastic(w, w.paying * m.churn / dim);
  const converted = w.modelId === 'saas' ? Math.min(free - lostFree + acquired, stochastic(w, acquired * m.conversion + free * .002 * w.quality)) : 0;
  w.users = Math.max(0, w.users + acquired - lostFree - lostPaid); w.paying = Math.min(w.users, Math.max(0, w.paying + converted - lostPaid));
  let revenue = 0, transactions = 0, visits = 0, gmv = 0;
  if (w.modelId === 'saas') revenue = w.paying * w.price / dim * m.uptime;
  else if (w.modelId === 'marketplace') {
    transactions = stochastic(w, w.users * .055 * (.6 + w.quality * .6) * Math.min(1, w.users / 2500) * m.uptime * clamp(1 - (w.price - 8) * .035, .5, 1.2));
    gmv = transactions * p.ticket; revenue = gmv * w.price / 100;
  } else { visits = stochastic(w, w.users * (2 + w.quality * 3) * m.uptime); revenue = visits * w.price * p.adCPM / 1000; }
  w.co.ledger.revenue += revenue; w.co.ledger.sales += w.modelId === 'saas' ? w.paying / dim : w.modelId === 'marketplace' ? transactions : visits; receive(w, revenue);
  expense(w, 'payroll', (w.engineers * 45000 + w.support * 30000) / dim); expense(w, 'rent', 6000 / dim); expense(w, 'marketing', spendDay);
  expense(w, 'cloud', 4500 * 2 ** w.cloudTier / dim + w.users * (w.modelId === 'saas' ? 8 / dim : .35 / dim) + revenue * (w.modelId === 'saas' ? .035 : 0) + transactions * 4);
  if (m.uptime < .9) { const refunds = revenue * (1 - m.uptime) * .25; expense(w, 'penalty', refunds, true); w.stats.outages++; }
  const maintenance = w.focus === 'stability' ? 1 : w.focus === 'balanced' ? .55 : .2;
  w.techDebt = clamp(w.techDebt + .0015 + acquired / 30000 + (w.project ? .001 : 0) - w.engineers * maintenance * .0025, 0, 1);
  w.quality = clamp(w.quality - .0003 - w.techDebt * .00035, .1, .95);
  w.reputation = clamp(w.reputation + (m.uptime > .98 && m.supportLoad < 1 ? .001 : -.002 * Math.max(1, m.supportLoad)), .1, .95);
  if (w.project) {
    w.project.progress += w.engineers * (1 - maintenance * .7);
    const job = PROJECTS[w.project.id];
    if (w.project.progress >= job.days) {
      if (w.project.id === 'value') { w.quality = Math.min(.95, w.quality + .14); w.techDebt = Math.min(1, w.techDebt + .06); }
      if (w.project.id === 'retention') { w.retention = Math.min(.95, w.retention + .12); w.techDebt = Math.min(1, w.techDebt + .04); }
      if (w.project.id === 'reliability') { w.techDebt = Math.max(0, w.techDebt - .22); w.capacityBonus = Math.min(3, w.capacityBonus * 1.2); }
      note(w, `${job.name} 已上線。`); w.project = null;
    }
  }
  w.stats.acquired += acquired; w.stats.converted += converted; w.stats.churned += lostFree + lostPaid; w.stats.transactions += transactions; w.stats.gmv += gmv; w.stats.visits += visits;
  w.today = { acquired, converted, churned: lostFree + lostPaid, uptime: m.uptime, load: m.load, revenue, transactions, visits, acquisitionCost: m.acquisitionCost };
  finishDay(w, { ...w.today, users: w.users, paying: w.paying });
  if (w.status === 'playing' && w.day % 90 === 0) { w.event = { title: '流量與雲端供應商調整', text: '未來 30 天廣告成本上漲，服務穩定性也受影響。花 $20,000 切換供應商與稽核，或保留現金接受較高獲客成本及較低可用率。' }; note(w, '網路營運決策待處理，時間已暫停。'); }
  return true;
}
export function technologyValid(w) {
  const nn = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (!commonValid(w) || w.mode !== 'technology' || !MODELS[w.modelId] || !Number.isInteger(w.users) || w.users < 0 || w.users > MODELS[w.modelId].market || !Number.isInteger(w.paying) || w.paying < 0 || w.paying > w.users || !['quality', 'retention', 'techDebt', 'reputation'].every(k => nn(w[k]) && w[k] <= 1) || !Number.isInteger(w.engineers) || w.engineers < 1 || w.engineers > 12 || !Number.isInteger(w.support) || w.support < 0 || w.support > 20 || !Number.isInteger(w.marketing) || w.marketing < 0 || w.marketing > 500000 || !Number.isInteger(w.cloudTier) || w.cloudTier < 0 || w.cloudTier > 5 || !nn(w.capacityBonus) || w.capacityBonus < 1 || w.capacityBonus > 3 || !['growth', 'balanced', 'stability'].includes(w.focus)) return false;
  const bounds = w.modelId === 'saas' ? [99, 1999] : w.modelId === 'marketplace' ? [2, 20] : [1, 6];
  return Number.isInteger(w.price) && w.price >= bounds[0] && w.price <= bounds[1] && (!w.project || PROJECTS[w.project.id] && nn(w.project.progress)) && (!w.shock || nn(w.shock.cac) && nn(w.shock.outage) && Number.isInteger(w.shock.until)) && (!w.event || typeof w.event.title === 'string' && typeof w.event.text === 'string') && w.stats && ['acquired','converted','churned','outages','transactions','gmv','visits'].every(k=>nn(w.stats[k])) && w.today && ['acquired','converted','churned','uptime','load','revenue','transactions','visits','acquisitionCost'].every(k=>nn(w.today[k]));
}
