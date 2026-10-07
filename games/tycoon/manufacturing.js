import { clamp, random, company, dateOf, note, spend, receive, expense, finishDay, commonValid, payable } from './venture-core.js';

export const PRODUCTS = {
  packaging: { name: '客製包材', description: '大量低單價，產能利用與原料議價是關鍵。', capital: 900000, equipment: 240000, capacity: 220, material: 10, price: 28, wage: 28000, rent: 18000, lot: 1100 },
  apparel: { name: '服飾代工', description: '中量訂單，交期、熟練度與品質取捨。', capital: 1500000, equipment: 600000, capacity: 50, material: 90, price: 240, wage: 32000, rent: 28000, lot: 300 },
  electronics: { name: '小型電子組裝', description: '高原料與設備門檻，瑕疵和應收款更傷周轉。', capital: 3500000, equipment: 1400000, capacity: 16, material: 650, price: 1600, wage: 36000, rent: 38000, lot: 100 },
};
export const SUPPLIERS = {
  economy: { name: '低價供應商', cost: .88, lead: 7, defects: .03 },
  stable: { name: '穩定供應商', cost: 1, lead: 3, defects: .008 },
  express: { name: '急件供應商', cost: 1.22, lead: 1, defects: .005 },
};
export function createManufacturing(productId = 'packaging', seed = 20261007) {
  if (!PRODUCTS[productId]) throw new Error('未知製造業態');
  const p = PRODUCTS[productId], w = { v: 1, mode: 'manufacturing', productId, day: 0, rng: seed >>> 0, status: 'playing', co: company(p.capital), workers: 3, lines: 1, shift: 'normal', qc: 'standard', supplier: 'stable', wear: 0, reputation: .55, stock: { qty: 0, value: 0, defects: 0 }, shipments: [], orders: [], offers: [], receivables: [], maintenanceUntil: 0, expansion: null, shock: null, event: null, seq: 1, stats: { produced: 0, defects: 0, delivered: 0, late: 0, lostBids: 0, busyDays: 0 }, today: { produced: 0, defects: 0, utilization: 0 } };
  spend(w, p.equipment, 'capex'); w.co.assets = p.equipment;
  note(w, '先比較訂單交期、原料到貨與周轉金，再投標。三年後結案。'); generateOffers(w);
  return w;
}
export function productionPlan(w) {
  const p = PRODUCTS[w.productId], factor = w.shift === 'overtime' ? 1.4 : .85;
  const capacity = w.day < w.maintenanceUntil ? 0 : Math.floor(p.capacity * Math.min(w.lines, w.workers / 3) * factor * (1 - w.wear * .45) * (w.qc === 'strict' ? .85 : 1));
  const defects = clamp(.035 + w.stock.defects + w.wear * .13 + (w.shift === 'overtime' ? .035 : 0) - (w.qc === 'strict' ? .035 : 0), .006, .3);
  const fixed = p.wage * w.workers * (w.shift === 'overtime' ? 1.25 : 1) + p.rent * (.7 + .3 * w.lines) + (w.qc === 'strict' ? 18000 : 6000) + w.lines * 6000;
  const remaining = w.orders.reduce((n, o) => n + o.qty - o.produced, 0), materialCost = p.material * (w.shock && w.day < w.shock.until ? w.shock.cost : 1);
  return { capacity, defects, fixed, remaining, backlogDays: capacity * (1 - defects) > 0 ? remaining / (capacity * (1 - defects)) : remaining ? Infinity : 0, materialCost, breakEven: p.price > materialCost / (1 - defects) + 1.5 ? Math.ceil(fixed / (p.price - materialCost / (1 - defects) - 1.5)) : null, payable: payable(w) };
}
function generateOffers(w) {
  const p = PRODUCTS[w.productId], cycle = .9 + .18 * Math.sin(w.day / 90), count = 3 + (w.reputation > .7 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const qty = Math.round(p.lot * (.6 + random(w) * .8) * cycle), days = 12 + Math.floor(random(w) * 16), price = Math.round(p.price * (.9 + random(w) * .2)), term = [15, 30, 45][Math.floor(random(w) * 3)];
    w.offers.push({ id: 'bid-' + w.seq++, client: ['禾豐品牌', '青川通路', '星河採購', '遠山商務'][i], qty, due: w.day + days, price, term, expires: w.day + 7, depositRate: term === 45 ? .1 : .25 });
  }
  w.offers = w.offers.slice(-12);
}
export function manufacturingAction(w, action, data = {}) {
  const fail = error => ({ ok: false, error });
  if (w.status !== 'playing') return fail('已結案，不能更改經營。');
  const p = PRODUCTS[w.productId];
  if (action === 'settings') {
    if (!Number.isInteger(data.workers) || data.workers < 1 || data.workers > 30 || !['normal', 'overtime'].includes(data.shift) || !['standard', 'strict'].includes(data.qc) || !SUPPLIERS[data.supplier]) return fail('設定超出範圍。');
    const cost = Math.max(0, data.workers - w.workers) * 8000;
    if (w.co.cash < cost && cost > 0) return fail('現金不足支付每人 $8,000 招募訓練費。');
    if (cost) expense(w, 'research', cost, true);
    w.workers = data.workers; w.shift = data.shift; w.qc = data.qc; w.supplier = data.supplier; note(w, '已調整人力、班制、品管與供應商。');
  } else if (action === 'purchase') {
    if (!Number.isInteger(data.qty) || data.qty < 1 || data.qty > p.capacity * w.lines * 90 || w.shipments.length >= 20) return fail('單次採購 1 到現有產線 90 天用量，最多 20 批在途。');
    const supplier = SUPPLIERS[w.supplier], cost = Math.round(productionPlan(w).materialCost * supplier.cost * data.qty);
    if (w.co.cash < cost) return fail('原料要先付現，現金不足。');
    spend(w, cost, 'purchases'); w.shipments.push({ qty: data.qty, value: cost, defects: supplier.defects, arrival: w.day + supplier.lead }); note(w, `採購 ${data.qty} 份原料，${supplier.lead} 天後到貨。`);
  } else if (action === 'bid') {
    const o = w.offers.find(o => o.id === data.id);
    if (!o || ![.9, 1, 1.1].includes(data.factor) || w.orders.length >= 12) return fail('投標已過期、報價不符或在製訂單已達 12 張。');
    const price = Math.round(o.price * data.factor), plan = productionPlan(w), quote = price * o.qty;
    const chance = clamp(.6 + (w.reputation - .55) * .65 + (1 - data.factor) * 3 - Math.min(.25, plan.backlogDays / Math.max(1, o.due - w.day) * .12), .1, .95);
    w.offers = w.offers.filter(x => x !== o);
    if (random(w) > chance) { w.stats.lostBids++; note(w, `${o.client} 選擇了競爭廠商；低價或履約口碑會提高得標率。`); return { ok: true, message: '未得標，沒有收取訂金。' }; }
    const deposit = Math.round(quote * o.depositRate);
    w.orders.push({ ...o, price, quote, deposit, produced: 0, cost: 0 }); receive(w, deposit); note(w, `${o.client} 得標：${o.qty} 件，收取訂金 $${deposit.toLocaleString()}，交貨後餘款 ${o.term} 天。`);
  } else if (action === 'priority') {
    const i = w.orders.findIndex(o => o.id === data.id);
    if (i < 0) return fail('訂單不存在。');
    w.orders.unshift(...w.orders.splice(i, 1)); note(w, '已把這張訂單移到生產順位第一。');
  } else if (action === 'cancel') {
    const o = w.orders.find(o => o.id === data.id); if (!o) return fail('訂單不存在。');
    cancelOrder(w, o);
  } else if (action === 'maintain') {
    const cost = Math.round(p.equipment * w.lines * .035);
    if (w.day < w.maintenanceUntil || w.co.cash < cost) return fail('維護尚未完成或現金不足。');
    expense(w, 'repair', cost, true); w.wear = Math.max(0, w.wear - .7); w.maintenanceUntil = w.day + 2; note(w, '排定兩天停機保養，降低磨損與瑕疵。');
  } else if (action === 'expand') {
    if (w.expansion || w.lines >= 6 || w.co.cash < p.equipment) return fail('擴線尚未完成、已達六線或現金不足。');
    spend(w, p.equipment, 'capex'); w.co.assets += p.equipment; w.expansion = { ready: w.day + 14 }; note(w, '新產線 14 天後可用；每條線需三人才能發揮產能。');
  } else if (action === 'event') {
    if (!w.event || !['buffer', 'accept'].includes(data.choice)) return fail('沒有待決事件。');
    if (data.choice === 'buffer') {
      if (w.co.cash < 18000) return fail('議價與驗收需要 $18,000。');
      expense(w, 'repair', 18000, true); w.shock = { cost: 1.05, until: w.day + 45 }; note(w, '議定短約並加驗收，45 天內原料漲幅降為 5%。');
    } else { w.shock = { cost: 1.22, until: w.day + 45 }; note(w, '接受市場報價，45 天內新原料價格上漲 22%。'); }
    w.event = null;
  } else return fail('未知製造操作。');
  return { ok: true };
}
function cancelOrder(w, o) {
  spend(w, o.deposit); expense(w, 'penalty', Math.round(o.quote * .1), true); expense(w, 'cogs', o.cost);
  w.reputation = clamp(w.reputation - .08, .1, .95); w.stats.late++; w.orders = w.orders.filter(x => x !== o); note(w, `${o.client} 訂單取消：退訂金、10% 違約金，在製品認列損失。`);
}
export function stepManufacturing(w) {
  if (w.status !== 'playing' || w.event) return false;
  const p = PRODUCTS[w.productId], co = w.co, dim = dateOf(w.day).dim;
  for (const s of w.shipments.filter(s => s.arrival <= w.day)) {
    const total = w.stock.qty + s.qty; w.stock.defects = total ? (w.stock.defects * w.stock.qty + s.defects * s.qty) / total : 0;
    w.stock.qty = total; w.stock.value += s.value;
  }
  w.shipments = w.shipments.filter(s => s.arrival > w.day);
  for (const r of w.receivables.filter(r => r.due <= w.day)) { receive(w, r.amount); note(w, `收到 ${r.client} 尾款 $${r.amount.toLocaleString()}。`); }
  w.receivables = w.receivables.filter(r => r.due > w.day);
  if (w.expansion && w.day >= w.expansion.ready) { w.lines++; w.expansion = null; note(w, '新產線已可使用。'); }
  for (const o of [...w.orders]) if (w.day > o.due + 7) cancelOrder(w, o);
  const plan = productionPlan(w); let budget = Math.min(plan.capacity, w.stock.qty), produced = 0, defects = 0;
  for (const o of [...w.orders]) {
    if (budget <= 0) break;
    const input = Math.min(budget, Math.ceil((o.qty - o.produced) / (1 - plan.defects)));
    if (input <= 0) continue;
    const cost = input === w.stock.qty ? w.stock.value : w.stock.value * input / w.stock.qty;
    // 瑕疵按比例加小幅種子擾動，小批量也有失敗風險；良品不超過契約數量。
    const bad = Math.min(input, Math.floor(input * plan.defects + random(w))), good = Math.min(o.qty - o.produced, input - bad), scrap = input - good;
    w.stock.qty -= input; w.stock.value -= cost; if (!w.stock.qty) w.stock.value = 0;
    o.produced += good; o.cost += cost * good / input; expense(w, 'cogs', cost * scrap / input);
    budget -= input; produced += good; defects += scrap;
  }
  for (const o of [...w.orders]) {
    if (o.produced >= o.qty) {
      const late = w.day > o.due, penalty = late ? Math.round(o.quote * Math.min(.2, (w.day - o.due) * .02)) : 0;
      co.ledger.revenue += o.quote; co.ledger.sales += o.qty; expense(w, 'cogs', o.cost); if (penalty) expense(w, 'penalty', penalty, true);
      w.receivables.push({ amount: o.quote - o.deposit, due: w.day + o.term, client: o.client }); w.orders = w.orders.filter(x => x !== o);
      w.stats.delivered++; w.stats.late += late ? 1 : 0; w.reputation = clamp(w.reputation + (late ? -.06 : .025), .1, .95); note(w, `${o.client} 已交貨${late ? '（逾期，已付違約金）' : ''}，尾款列入應收。`);
    } else if (w.day > o.due + 7) cancelOrder(w, o);
  }
  expense(w, 'payroll', p.wage * w.workers * (w.shift === 'overtime' ? 1.25 : 1) / dim);
  expense(w, 'rent', p.rent * (.7 + .3 * w.lines) / dim);
  expense(w, 'research', (w.qc === 'strict' ? 18000 : 6000) / dim);
  expense(w, 'energy', w.lines * 6000 / dim + produced * 1.5);
  const depreciation = Math.min(co.assets, p.equipment * w.lines / 180 / dim); co.assets -= depreciation; expense(w, 'depreciation', depreciation);
  w.wear = clamp(w.wear + (produced ? .004 * (w.shift === 'overtime' ? 1.7 : 1) : .0006), 0, 1);
  w.stats.produced += produced; w.stats.defects += defects; w.stats.busyDays += produced > 0 ? 1 : 0;
  w.today = { produced, defects, utilization: plan.capacity ? (produced + defects) / plan.capacity : 0 };
  w.offers = w.offers.filter(o => o.expires > w.day + 1);
  finishDay(w, w.today);
  if (w.status === 'playing' && w.day % 7 === 0) generateOffers(w);
  if (w.status === 'playing' && w.day % 90 === 0) { w.event = { title: '原料報價上漲', text: '供應商調整未來 45 天的新採購報價。已付原料不受影響。花 $18,000 簽短約，把漲幅從 22% 壓到 5%，或接受漲價。' }; note(w, '供應鏈決策待處理，時間已暫停。'); }
  return true;
}
export function manufacturingValid(w) {
  const nn = n => typeof n === 'number' && Number.isFinite(n) && n >= 0, integer = n => Number.isInteger(n) && n >= 0;
  if (!commonValid(w) || w.mode !== 'manufacturing' || !PRODUCTS[w.productId] || !Number.isInteger(w.workers) || w.workers < 1 || w.workers > 30 || !Number.isInteger(w.lines) || w.lines < 1 || w.lines > 6 || !['normal', 'overtime'].includes(w.shift) || !['standard', 'strict'].includes(w.qc) || !SUPPLIERS[w.supplier] || !nn(w.wear) || w.wear > 1 || !nn(w.reputation) || w.reputation > 1 || !integer(w.seq) || !integer(w.maintenanceUntil)) return false;
  const arr = (a, max) => Array.isArray(a) && a.length <= max;
  const offer = o => o && typeof o.id === 'string' && typeof o.client === 'string' && ['qty', 'due', 'price', 'term', 'expires'].every(k => integer(o[k])) && o.qty > 0 && o.price > 0 && [15, 30, 45].includes(o.term) && [.1, .25].includes(o.depositRate);
  return w.stock && integer(w.stock.qty) && nn(w.stock.value) && nn(w.stock.defects) && w.stock.defects <= .1 && arr(w.shipments, 20) && w.shipments.every(s => integer(s.qty) && s.qty > 0 && nn(s.value) && integer(s.arrival) && nn(s.defects) && s.defects <= .1) && arr(w.orders, 12) && w.orders.every(o => offer(o) && integer(o.produced) && o.produced <= o.qty && nn(o.cost) && nn(o.quote) && nn(o.deposit) && o.deposit <= o.quote) && new Set(w.orders.map(o=>o.id)).size === w.orders.length && arr(w.offers, 12) && w.offers.every(offer) && arr(w.receivables, 100) && w.receivables.every(r => nn(r.amount) && integer(r.due) && typeof r.client === 'string') && (!w.expansion || integer(w.expansion.ready)) && (!w.shock || nn(w.shock.cost) && integer(w.shock.until)) && (!w.event || typeof w.event.title === 'string' && typeof w.event.text === 'string') && w.stats && ['produced','defects','delivered','late','lostBids','busyDays'].every(k=>nn(w.stats[k])) && w.today && ['produced','defects','utilization'].every(k=>nn(w.today[k]));
}
