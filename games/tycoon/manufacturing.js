import { clamp, random, company, dateOf, note, spend, receive, expense, finishDay, commonValid, payable, END_DAY } from './venture-core.js';

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
export const PRODUCTION_MODES = {
  balanced: { name: '穩定生產', description: '保留產能、良率與單件成本的平衡。', capacity: 1, defects: 0, energy: 1.5, wear: 1 },
  batch: { name: '大批量快線', description: '產能 +18%，瑕疵 +1.2 個百分點；單件能源較低，磨損較快。', capacity: 1.18, defects: .012, energy: 1.25, wear: 1.18 },
  precision: { name: '精密慢線', description: '產能 −18%，瑕疵 −2.2 個百分點；單件能源較高，磨損較慢。', capacity: .82, defects: -.022, energy: 2.1, wear: .75 },
};
const known = (catalog, id) => typeof id === 'string' && Object.hasOwn(catalog, id);
const PROFILE_NAMES = {
  packaging: { bulk: '通路整批包材', rush: '活動急件包材', precision: '精品印製包材', supply: '品牌包材月供合約' },
  apparel: { bulk: '制服大貨', rush: '檔期急件', precision: '精品小批次', supply: '服飾月供合約' },
  electronics: { bulk: '通路標準機', rush: '維修急件組裝', precision: '精密模組', supply: '組裝月供合約' },
};
const LEGACY_CONTRACT = { id: 'standard', name: '一般訂單', description: '沿用原合約的交期與付款條件。', lateRate: .02, lateCap: .2, graceDays: 7, cancelRate: .1, inspectionDays: 0, qualityTolerance: null, auditRate: 0, auditCap: 0 };
export function contractProfiles(productId) {
  if (!known(PRODUCTS, productId)) throw new Error('未知製造業態');
  const names = PROFILE_NAMES[productId], tolerance = { packaging: .035, apparel: .025, electronics: .015 }[productId];
  return {
    bulk: { ...LEGACY_CONTRACT, id: 'bulk', name: names.bulk, description: '大批量、低單價；訂金少、帳期長，先確認原料周轉。', qtyFactor: 1.6, priceFactor: .92, minDays: 22, dayRange: 12, term: 45, depositRate: .15, lateRate: .012, lateCap: .18, graceDays: 10 },
    rush: { ...LEGACY_CONTRACT, id: 'rush', name: names.rush, description: '報價高、回款快；交期短，逾期費與取消期限更嚴格。', qtyFactor: .75, priceFactor: 1.25, minDays: 7, dayRange: 5, term: 15, depositRate: .35, lateRate: .04, lateCap: .3, graceDays: 3, cancelRate: .15 },
    precision: { ...LEGACY_CONTRACT, id: 'precision', name: names.precision, description: '高單價小批次；完成後再驗收一天，製程損失過高需付追加驗收費。', qtyFactor: .9, priceFactor: 1.16, minDays: 16, dayRange: 10, term: 30, depositRate: .25, inspectionDays: 1, qualityTolerance: tolerance, auditRate: 2.5, auditCap: .2 },
    supply: { ...LEGACY_CONTRACT, id: 'supply', name: names.supply, description: '一次議價鎖定 30、60 或 90 日供貨；每 30 日一批。單價較低、訂金 15%，每批實際交貨後尾款等 45 日。', priceFactor: .9, term: 45, depositRate: .15, lateRate: .012, lateCap: .18, graceDays: 10 },
  };
}
export function contractPolicy(w, order) {
  const profiles = contractProfiles(w.productId), policy = known(profiles, order.profile) ? profiles[order.profile] : LEGACY_CONTRACT;
  return { ...policy, cancelAfter: policy.graceDays, auditTolerance: policy.qualityTolerance };
}
export function manufacturingQueue(w, { offer = null } = {}) {
  const orders = [...w.orders];
  if (offer && !orders.some(o => o.id === offer.id || o.contractId === offer.id)) orders.push(...manufacturingDeliveries(w, offer));
  return (w.scheduleMode ?? 'due') === 'due' ? orders.sort((a, b) => a.due - b.due) : orders;
}
export function manufacturingDeliveries(w, offer, { factor = 1 } = {}) {
  if (offer.profile !== 'supply' || offer.batchIndex !== undefined) return [offer];
  const price = Math.round(offer.price * factor), base = Math.floor(offer.qty / offer.batchCount), extra = offer.qty % offer.batchCount;
  return Array.from({ length: offer.batchCount }, (_, i) => {
    const qty = base + (i < extra ? 1 : 0), due = offer.due - 30 * (offer.batchCount - 1 - i), quote = price * qty;
    return { ...offer, id: offer.id + '-part-' + (i + 1), contractId: offer.id, batchIndex: i + 1, releaseDay: Math.max(w.day, due - 30), qty, due, price, quote, deposit: Math.round(quote * offer.depositRate), produced: 0, cost: 0, attempted: 0, scrapped: 0 };
  });
}
export function createManufacturing(productId = 'packaging', seed = 20261007) {
  if (!known(PRODUCTS, productId)) throw new Error('未知製造業態');
  const p = PRODUCTS[productId], w = { v: 1, mode: 'manufacturing', productId, day: 0, rng: seed >>> 0, status: 'playing', co: company(p.capital), workers: 3, lines: 1, shift: 'normal', qc: 'standard', productionMode: 'balanced', scheduleMode: 'due', supplier: 'stable', wear: 0, reputation: .55, stock: { qty: 0, value: 0, defects: 0 }, shipments: [], orders: [], offers: [], receivables: [], maintenanceUntil: 0, expansion: null, shock: null, event: null, seq: 1, stats: { produced: 0, defects: 0, delivered: 0, late: 0, lostBids: 0, busyDays: 0 }, today: { produced: 0, defects: 0, utilization: 0 } };
  spend(w, p.equipment, 'capex'); w.co.assets = p.equipment;
  note(w, '先比較訂單交期、原料到貨與周轉金，再投標。三年後結案。'); generateOffers(w); generateSupplyOffers(w);
  return w;
}
export function productionPlan(w) {
  const p = PRODUCTS[w.productId], mode = PRODUCTION_MODES[w.productionMode || 'balanced'], factor = w.shift === 'overtime' ? 1.4 : .85;
  const capacity = w.day < w.maintenanceUntil ? 0 : Math.floor(p.capacity * Math.min(w.lines, w.workers / 3) * factor * mode.capacity * (1 - w.wear * .45) * (w.qc === 'strict' ? .85 : 1));
  const defects = clamp(.035 + w.stock.defects + w.wear * .13 + (w.shift === 'overtime' ? .035 : 0) - (w.qc === 'strict' ? .035 : 0) + mode.defects, .006, .3);
  const fixed = p.wage * w.workers * (w.shift === 'overtime' ? 1.25 : 1) + p.rent * (.7 + .3 * w.lines) + (w.qc === 'strict' ? 18000 : 6000) + w.lines * 6000;
  const remaining = w.orders.reduce((n, o) => n + o.qty - o.produced, 0), materialCost = p.material * (w.shock && w.day < w.shock.until ? w.shock.cost : 1);
  return { capacity, defects, fixed, remaining, energyPerUnit: mode.energy, energyPerGood: mode.energy, wearFactor: mode.wear, backlogDays: capacity * (1 - defects) > 0 ? remaining / (capacity * (1 - defects)) : remaining ? Infinity : 0, materialCost, breakEven: p.price > materialCost / (1 - defects) + mode.energy ? Math.ceil(fixed / (p.price - materialCost / (1 - defects) - mode.energy)) : null, payable: payable(w) };
}
function generateOffers(w) {
  const p = PRODUCTS[w.productId], cycle = .9 + .18 * Math.sin(w.day / 90), count = 3 + (w.reputation > .7 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const profile = ['bulk', 'rush', 'precision'][i % 3], terms = contractProfiles(w.productId)[profile];
    const qty = Math.round(p.lot * (.75 + random(w) * .5) * cycle * terms.qtyFactor), days = terms.minDays + Math.floor(random(w) * terms.dayRange), price = Math.round(p.price * (.96 + random(w) * .08) * terms.priceFactor);
    w.offers.push({ id: 'bid-' + w.seq++, client: ['禾豐品牌', '青川通路', '星河採購', '遠山商務'][i], profile, qty, due: w.day + days, price, term: terms.term, expires: w.day + 7, depositRate: terms.depositRate });
  }
  limitOffers(w);
}
function limitOffers(w) {
  const keep = new Set([...w.offers.filter(o => o.profile !== 'supply').slice(-6), ...w.offers.filter(o => o.profile === 'supply').slice(-6)]);
  w.offers = w.offers.filter(o => keep.has(o));
}
function generateSupplyOffers(w) {
  const p = PRODUCTS[w.productId], terms = contractProfiles(w.productId).supply;
  for (const batchCount of [1, 2, 3]) {
    const batchQty = Math.round(p.lot * 2.5 * (.85 + random(w) * .3)), price = Math.round(p.price * terms.priceFactor * (.96 + random(w) * .08));
    w.offers.push({ id: 'supply-' + w.seq++, client: ['禾豐長約採購', '青川年度通路', '星河供應合作'][batchCount - 1], profile: 'supply', batchCount, qty: batchQty * batchCount, due: w.day + 30 * batchCount, price, term: terms.term, expires: w.day + 30, depositRate: terms.depositRate });
  }
  limitOffers(w);
}
function materialBudget(w, priorGood, targetGood, productionMode) {
  let input = 0, cost = 0, gap = 0;
  const stock = { ...w.stock }, supplier = SUPPLIERS[w.supplier];
  for (const s of w.shipments.filter(s => s.arrival <= w.day)) {
    const total = stock.qty + s.qty; stock.defects = total ? (stock.defects * stock.qty + s.defects * s.qty) / total : 0;
    stock.qty = total; stock.value += s.value;
  }
  const sources = [stock, ...w.shipments.filter(s => s.arrival > w.day).sort((a, b) => a.arrival - b.arrival)].map(s => ({ ...s, unitCost: s.qty ? s.value / s.qty : 0 }));
  const newCost = productionPlan(w).materialCost * supplier.cost;
  sources.push({ qty: Infinity, defects: supplier.defects, unitCost: newCost, purchase: true });
  for (const [i, good] of [...priorGood, targetGood].entries()) {
    let remaining = good;
    for (const s of sources) {
      if (!remaining) break;
      const plan = productionPlan({ ...w, productionMode, stock: { ...w.stock, defects: s.defects } }), yieldRate = 1 - plan.defects;
      const used = Math.min(s.qty, Math.ceil(remaining / yieldRate));
      if (i === priorGood.length) { input += used; cost += used * s.unitCost; }
      if (s.purchase) gap += used;
      s.qty -= used; remaining = Math.max(0, remaining - used * yieldRate);
    }
  }
  return { input, cost, gap };
}
const productionRemaining = (w, o) => w.day > o.due + contractPolicy(w, o).graceDays ? 0 : Math.max(0, o.qty - (o.produced ?? 0));
// 只讀排程：維持目前磨損、班制、原料良率；不抽樣，也不預先推進遊戲。
export function manufacturingSchedule(w, { offer = null, productionMode = w.productionMode || 'balanced', includePurchase = false } = {}) {
  const originals = manufacturingQueue(w, { offer });
  const orders = originals.map(o => { const policy = contractPolicy(w, o), produced = o.produced ?? 0; return { id: o.id, client: o.client, due: o.due, releaseDay: o.releaseDay ?? w.day, remaining: o.qty - produced, finishDay: o.inspectionReady !== undefined ? Math.max(w.day, o.inspectionReady) : produced >= o.qty ? w.day + policy.inspectionDays : null, policy }; });
  const stock = { ...w.stock }, shipments = w.shipments.map(s => ({ ...s }));
  const gap = materialBudget(w, originals.map(o => productionRemaining(w, o)), 0, productionMode).gap;
  if (includePurchase && gap) {
    const supplier = SUPPLIERS[w.supplier]; shipments.push({ qty: gap, defects: supplier.defects, arrival: w.day + supplier.lead });
  }
  const last = Math.min(w.day + 89, END_DAY - 1, Math.max(w.day, ...orders.map(o => o.due + o.policy.graceDays)));
  for (let day = w.day; day <= last && orders.some(o => o.remaining > 1e-6); day++) {
    for (const s of shipments.filter(s => s.arrival === day || day === w.day && s.arrival < day)) {
      const total = stock.qty + s.qty; stock.defects = total ? (stock.defects * stock.qty + s.defects * s.qty) / total : 0; stock.qty = total;
    }
    const plan = productionPlan({ ...w, day, productionMode, stock, lines: w.lines + (w.expansion && day >= w.expansion.ready ? 1 : 0) });
    let budget = Math.min(plan.capacity, stock.qty);
    for (const o of orders) {
      if (budget <= 0) break;
      if (o.remaining <= 1e-6 || day < o.releaseDay || day > o.due + o.policy.graceDays) continue;
      const input = Math.min(budget, Math.ceil(o.remaining / (1 - plan.defects)));
      stock.qty -= input; budget -= input; o.remaining = Math.max(0, o.remaining - input * (1 - plan.defects));
      if (o.remaining <= 1e-6) o.finishDay = day + o.policy.inspectionDays;
    }
  }
  return orders.map(o => {
    const finishDay = o.finishDay !== null && o.finishDay <= o.due + o.policy.graceDays && o.finishDay < END_DAY && o.finishDay < w.day + 90 ? o.finishDay : null;
    return { ...o, finishDay, slackDays: finishDay === null ? null : o.due - finishDay };
  });
}
export function manufacturingOrderPreview(w, offer, { factor = 1, productionMode = w.productionMode || 'balanced' } = {}) {
  if (!offer || !known(PRODUCTION_MODES, productionMode) || ![.9, 1, 1.1].includes(factor)) return null;
  if (offer.profile === 'supply' && offer.batchIndex === undefined) {
    const batches = manufacturingDeliveries(w, offer, { factor }), proposed = { ...w, orders: manufacturingQueue(w, { offer: { ...offer, price: Math.round(offer.price * factor) } }) };
    const deliveries = batches.map(o => ({ id: o.id, due: o.due, releaseDay: o.releaseDay, qty: o.qty, batchIndex: o.batchIndex, ...manufacturingOrderPreview(proposed, o, { productionMode }) }));
    const sum = key => deliveries.reduce((n, o) => n + o[key], 0), finishDay = deliveries.some(o => o.finishDay === null) ? null : Math.max(...deliveries.map(o => o.finishDay));
    const plan = productionPlan(w), acceptanceChance = clamp(.6 + (w.reputation - .55) * .65 + (1 - factor) * 3 - Math.min(.25, plan.backlogDays / Math.max(1, offer.due - w.day) * .12), .1, .95);
    const materialGap = Math.max(0, ...deliveries.map(o => o.materialGap));
    return { ...deliveries[0], deliveries, acceptanceChance, quote: sum('quote'), deposit: sum('deposit'), remaining: sum('remaining'), requiredMaterial: sum('requiredMaterial'), materialGap, upfrontMaterial: Math.round(materialGap * productionPlan(w).materialCost * SUPPLIERS[w.supplier].cost), materialCost: sum('materialCost'), finishDay, slackDays: finishDay === null ? null : Math.min(...deliveries.map(o => o.slackDays)), estimatedLateFee: deliveries.some(o => o.estimatedLateFee === null) ? null : sum('estimatedLateFee'), estimatedAuditFee: sum('estimatedAuditFee'), estimatedContribution: sum('estimatedContribution'), cancellationFee: sum('cancellationFee') };
  }
  const plan = productionPlan({ ...w, productionMode }), policy = contractPolicy(w, offer), supplier = SUPPLIERS[w.supplier];
  const active = w.orders.some(o => o.id === offer.id), remaining = offer.qty - (active ? offer.produced : 0), price = Math.round(offer.price * factor), quote = active ? offer.quote : price * offer.qty;
  const deposit = active ? offer.deposit : Math.round(quote * offer.depositRate);
  const queue = manufacturingQueue(w, { offer }), prior = queue.slice(0, queue.findIndex(o => o.id === offer.id));
  const budget = materialBudget(w, prior.map(o => productionRemaining(w, o)), productionRemaining(w, offer), productionMode);
  const requiredMaterial = budget.input, materialGap = budget.gap, materialCost = budget.cost, newMaterialCost = plan.materialCost * supplier.cost;
  const schedule = manufacturingSchedule(w, { offer: active ? null : offer, productionMode, includePurchase: true }), target = schedule.find(o => o.id === offer.id);
  const lateDays = target?.finishDay === null || target?.finishDay === undefined ? null : Math.max(0, target.finishDay - offer.due);
  const estimatedLateFee = lateDays === null ? null : Math.round(quote * Math.min(policy.lateCap, lateDays * policy.lateRate));
  const observedAttempts = offer.attempted || 0, observedScrap = offer.scrapped || 0;
  const estimatedLoss = observedAttempts + requiredMaterial > 0 ? (observedScrap + requiredMaterial - remaining) / (observedAttempts + requiredMaterial) : 0;
  const estimatedAuditFee = policy.qualityTolerance === null ? 0 : Math.round(quote * Math.min(policy.auditCap, Math.max(0, estimatedLoss - policy.qualityTolerance) * policy.auditRate));
  const acceptanceChance = clamp(.6 + (w.reputation - .55) * .65 + (1 - factor) * 3 - Math.min(.25, plan.backlogDays / Math.max(1, offer.due - w.day) * .12), .1, .95);
  return { productionMode, policy, price, quote, deposit, remaining, capacity: plan.capacity, goodCapacity: plan.capacity * (1 - plan.defects), defects: plan.defects, energyPerUnit: plan.energyPerUnit, requiredMaterial, materialGap, upfrontMaterial: Math.round(materialGap * newMaterialCost), materialCost, finishDay: target?.finishDay ?? null, slackDays: target?.slackDays ?? null, estimatedLateFee, estimatedAuditFee, estimatedContribution: quote - (active ? offer.cost : 0) - materialCost - remaining * plan.energyPerUnit - estimatedAuditFee - (estimatedLateFee || 0), acceptanceChance, cancellationFee: Math.round(quote * policy.cancelRate), assumptions: '估計維持目前人力、班制、磨損與排程政策，包含已排到貨、擴線、停機與合約驗收；現到原料先混合，未到批次料價與良率依序估算。假設立即補足缺料，最多估 90 日且不跨結案；未含未來磨損、抽樣波動、固定費與稅。' };
}
export function manufacturingAction(w, action, data = {}) {
  const fail = error => ({ ok: false, error });
  if (w.status !== 'playing') return fail('已結案，不能更改經營。');
  const p = PRODUCTS[w.productId];
  if (action === 'settings') {
    const productionMode = data.productionMode === undefined ? w.productionMode || 'balanced' : data.productionMode;
    if (!Number.isInteger(data.workers) || data.workers < 1 || data.workers > 30 || !['normal', 'overtime'].includes(data.shift) || !['standard', 'strict'].includes(data.qc) || !known(SUPPLIERS, data.supplier) || !known(PRODUCTION_MODES, productionMode)) return fail('設定超出範圍。');
    const cost = Math.max(0, data.workers - w.workers) * 8000;
    if (w.co.cash < cost && cost > 0) return fail('現金不足支付每人 $8,000 招募訓練費。');
    if (cost) expense(w, 'research', cost, true);
    w.workers = data.workers; w.shift = data.shift; w.qc = data.qc; w.supplier = data.supplier; w.productionMode = productionMode; note(w, `已調整人力、班制、品管與供應商；採用${PRODUCTION_MODES[productionMode].name}。`);
  } else if (action === 'productionMode') {
    if (!known(PRODUCTION_MODES, data.id)) return fail('未知生產方式。');
    w.productionMode = data.id; note(w, `改用${PRODUCTION_MODES[data.id].name}：${PRODUCTION_MODES[data.id].description}`);
  } else if (action === 'purchase') {
    if (!Number.isInteger(data.qty) || data.qty < 1 || data.qty > p.capacity * w.lines * 90 || w.shipments.length >= 20) return fail('單次採購 1 到現有產線 90 天用量，最多 20 批在途。');
    const supplier = SUPPLIERS[w.supplier], cost = Math.round(productionPlan(w).materialCost * supplier.cost * data.qty);
    if (w.co.cash < cost) return fail('原料要先付現，現金不足。');
    spend(w, cost, 'purchases'); w.shipments.push({ qty: data.qty, value: cost, defects: supplier.defects, arrival: w.day + supplier.lead }); note(w, `採購 ${data.qty} 份原料，${supplier.lead} 天後到貨。`);
  } else if (action === 'bid') {
    const o = w.offers.find(o => o.id === data.id);
    if (!o || o.expires <= w.day || ![.9, 1, 1.1].includes(data.factor) || o.profile === 'supply' && (![1, 2, 3].includes(o.batchCount) || o.qty < o.batchCount) || w.orders.length + (o.profile === 'supply' ? o.batchCount : 1) > 12) return fail('投標已過期、報價不符或在製訂單已達 12 張。');
    const price = Math.round(o.price * data.factor), plan = productionPlan(w), quote = price * o.qty;
    const chance = clamp(.6 + (w.reputation - .55) * .65 + (1 - data.factor) * 3 - Math.min(.25, plan.backlogDays / Math.max(1, o.due - w.day) * .12), .1, .95);
    w.offers = w.offers.filter(x => x !== o);
    if (random(w) > chance) { w.stats.lostBids++; note(w, `${o.client} 選擇了競爭廠商；低價或履約口碑會提高得標率。`); return { ok: true, message: '未得標，沒有收取訂金。' }; }
    const batches = o.profile === 'supply' ? manufacturingDeliveries(w, o, { factor: data.factor }) : [{ ...o, price, quote, deposit: Math.round(quote * o.depositRate), produced: 0, cost: 0, attempted: 0, scrapped: 0 }];
    const deposit = batches.reduce((n, batch) => n + batch.deposit, 0);
    w.orders.push(...batches); w.orders = manufacturingQueue(w); receive(w, deposit); note(w, `${o.client} 得標：${contractPolicy(w,o).name} ${o.qty} 件${o.profile === 'supply' ? `，分 ${o.batchCount} 批月供` : ''}，收取訂金 $${deposit.toLocaleString()}，每批交貨後餘款 ${o.term} 天。`);
  } else if (action === 'scheduling') {
    if (!['due', 'manual'].includes(data.mode)) return fail('未知生產排程方式。');
    w.scheduleMode = data.mode; w.orders = manufacturingQueue(w); note(w, data.mode === 'due' ? '已依交期自動排程，剩餘天數最少的訂單先供料生產。' : '已切換手動排程，依目前指定順位生產。');
  } else if (action === 'priority') {
    const i = w.orders.findIndex(o => o.id === data.id);
    if (i < 0) return fail('訂單不存在。');
    w.scheduleMode = 'manual'; w.orders.unshift(...w.orders.splice(i, 1)); note(w, '已改用手動排程，把這張訂單移到生產順位第一。');
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
  const policy = contractPolicy(w, o);
  spend(w, o.deposit); expense(w, 'penalty', Math.round(o.quote * policy.cancelRate), true); expense(w, 'cogs', o.cost);
  w.reputation = clamp(w.reputation - .08, .1, .95); w.stats.late++; w.orders = w.orders.filter(x => x !== o); note(w, `${o.client} 訂單取消：退訂金、${Math.round(policy.cancelRate * 100)}% 違約金，在製品認列損失。`);
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
  for (const o of [...w.orders]) if (w.day > o.due + contractPolicy(w, o).graceDays) cancelOrder(w, o);
  w.orders = manufacturingQueue(w);
  const plan = productionPlan(w); let budget = Math.min(plan.capacity, w.stock.qty), produced = 0, defects = 0, delivered = 0, lateFees = 0, auditFees = 0;
  for (const o of [...w.orders]) {
    if (budget <= 0) break;
    if (o.releaseDay !== undefined && w.day < o.releaseDay) continue;
    const input = Math.min(budget, Math.ceil((o.qty - o.produced) / (1 - plan.defects)));
    if (input <= 0) continue;
    const cost = input === w.stock.qty ? w.stock.value : w.stock.value * input / w.stock.qty;
    // 瑕疵按比例加小幅種子擾動，小批量也有失敗風險；良品不超過契約數量。
    const bad = Math.min(input, Math.floor(input * plan.defects + random(w))), good = Math.min(o.qty - o.produced, input - bad), scrap = input - good;
    w.stock.qty -= input; w.stock.value -= cost; if (!w.stock.qty) w.stock.value = 0;
    o.attempted = (o.attempted ?? o.produced) + input; o.scrapped = (o.scrapped || 0) + scrap;
    o.produced += good; o.cost += cost * good / input; expense(w, 'cogs', cost * scrap / input);
    budget -= input; produced += good; defects += scrap;
  }
  for (const o of [...w.orders]) {
    if (o.produced >= o.qty) {
      const policy = contractPolicy(w, o);
      if (policy.inspectionDays && o.inspectionReady === undefined) { o.inspectionReady = w.day + policy.inspectionDays; note(w, `${o.client} 良品完成，進入一天合約驗收；驗收完才認列交貨收入。`); }
      if (o.inspectionReady !== undefined && w.day < o.inspectionReady) continue;
      const late = w.day > o.due, penalty = late ? Math.round(o.quote * Math.min(policy.lateCap, (w.day - o.due) * policy.lateRate)) : 0;
      const lossRate = o.attempted ? o.scrapped / o.attempted : 0, audit = policy.qualityTolerance === null ? 0 : Math.round(o.quote * Math.min(policy.auditCap, Math.max(0, lossRate - policy.qualityTolerance) * policy.auditRate));
      co.ledger.revenue += o.quote; co.ledger.sales += o.qty; expense(w, 'cogs', o.cost); if (penalty) expense(w, 'penalty', penalty, true);
      if (audit) { expense(w, 'penalty', audit, true); note(w, `${o.client} 製程損失 ${(lossRate * 100).toFixed(1)}% 高於合約 ${(policy.qualityTolerance * 100).toFixed(1)}% 門檻，追加驗收費 $${audit.toLocaleString()}；已交貨仍是良品。`); }
      w.receivables.push({ amount: o.quote - o.deposit, due: w.day + o.term, client: o.client }); w.orders = w.orders.filter(x => x !== o);
      delivered++; lateFees += penalty; auditFees += audit;
      w.stats.delivered++; w.stats.late += late ? 1 : 0; w.reputation = clamp(w.reputation + (late ? -.06 : .025), .1, .95); note(w, `${o.client} 已交貨${late ? '（逾期，已付違約金）' : ''}，尾款列入應收。`);
    } else if (w.day > o.due + contractPolicy(w, o).graceDays) cancelOrder(w, o);
  }
  expense(w, 'payroll', p.wage * w.workers * (w.shift === 'overtime' ? 1.25 : 1) / dim);
  expense(w, 'rent', p.rent * (.7 + .3 * w.lines) / dim);
  expense(w, 'research', (w.qc === 'strict' ? 18000 : 6000) / dim);
  expense(w, 'energy', w.lines * 6000 / dim + produced * plan.energyPerUnit);
  const depreciation = Math.min(co.assets, p.equipment * w.lines / 180 / dim); co.assets -= depreciation; expense(w, 'depreciation', depreciation);
  w.wear = clamp(w.wear + (produced ? .004 * (w.shift === 'overtime' ? 1.7 : 1) * plan.wearFactor : .0006), 0, 1);
  w.stats.produced += produced; w.stats.defects += defects; w.stats.busyDays += produced > 0 ? 1 : 0;
  w.today = { produced, defects, utilization: plan.capacity ? (produced + defects) / plan.capacity : 0, delivered, lateFees, auditFees };
  w.offers = w.offers.filter(o => o.expires > w.day + 1);
  finishDay(w, w.today);
  if (w.status === 'playing' && w.day % 7 === 0) generateOffers(w);
  if (w.status === 'playing' && w.day % 30 === 0) generateSupplyOffers(w);
  if (w.status === 'playing' && w.day % 90 === 0) { w.event = { title: '原料報價上漲', text: '供應商調整未來 45 天的新採購報價。已付原料不受影響。花 $18,000 簽短約，把漲幅從 22% 壓到 5%，或接受漲價。' }; note(w, '供應鏈決策待處理，時間已暫停。'); }
  return true;
}
export function manufacturingValid(w) {
  const nn = n => typeof n === 'number' && Number.isFinite(n) && n >= 0, integer = n => Number.isInteger(n) && n >= 0;
  const calendarDay = n => integer(n) && n <= END_DAY + 365;
  if (!commonValid(w) || w.mode !== 'manufacturing' || !known(PRODUCTS, w.productId) || !Number.isInteger(w.workers) || w.workers < 1 || w.workers > 30 || !Number.isInteger(w.lines) || w.lines < 1 || w.lines > 6 || !['normal', 'overtime'].includes(w.shift) || !['standard', 'strict'].includes(w.qc) || !known(SUPPLIERS, w.supplier) || w.productionMode !== undefined && !known(PRODUCTION_MODES, w.productionMode) || w.scheduleMode !== undefined && !['due', 'manual'].includes(w.scheduleMode) || !nn(w.wear) || w.wear > 1 || !nn(w.reputation) || w.reputation > 1 || !integer(w.seq) || !calendarDay(w.maintenanceUntil)) return false;
  const arr = (a, max) => Array.isArray(a) && a.length <= max;
  const profiles = contractProfiles(w.productId);
  const staged = (o, accepted) => {
    const noParts = ['contractId', 'batchIndex', 'releaseDay'].every(k => o[k] === undefined);
    if (o.profile !== 'supply') return noParts && o.batchCount === undefined;
    if (![1, 2, 3].includes(o.batchCount) || o.expires < 30) return false;
    if (!accepted) return noParts && o.qty >= o.batchCount && o.due === o.expires + 30 * (o.batchCount - 1);
    return typeof o.contractId === 'string' && o.contractId.length > 0 && Number.isInteger(o.batchIndex) && o.batchIndex >= 1 && o.batchIndex <= o.batchCount && o.id === o.contractId + '-part-' + o.batchIndex && o.due === o.expires + 30 * (o.batchIndex - 1) && calendarDay(o.releaseDay) && o.releaseDay >= o.due - 30 && o.releaseDay <= o.due && (o.batchIndex === 1 ? o.releaseDay <= w.day : o.releaseDay === o.due - 30) && (w.day >= o.releaseDay || o.produced === 0) && o.quote === o.price * o.qty && o.deposit === Math.round(o.quote * o.depositRate);
  };
  const offer = (o, accepted = false) => o && typeof o.id === 'string' && typeof o.client === 'string' && ['qty', 'due', 'price', 'term', 'expires'].every(k => integer(o[k])) && o.qty > 0 && o.price > 0 && calendarDay(o.due) && calendarDay(o.expires) && [15, 30, 45].includes(o.term) && (o.profile === undefined ? [.1, .25].includes(o.depositRate) : known(profiles, o.profile) && o.depositRate === profiles[o.profile].depositRate && o.term === profiles[o.profile].term) && staged(o, accepted);
  const progress = o => o.attempted === undefined && o.scrapped === undefined || integer(o.attempted) && integer(o.scrapped) && o.attempted >= o.produced && o.scrapped <= o.attempted && o.attempted - o.scrapped === o.produced;
  const inspection = o => o.inspectionReady === undefined || o.profile === 'precision' && o.produced === o.qty && calendarDay(o.inspectionReady) && o.inspectionReady <= w.day + 1;
  const sameContract = orders => orders.every(o => o.profile !== 'supply' || orders.filter(x => x.contractId === o.contractId).every(x => ['batchCount', 'expires', 'price', 'client'].every(k => x[k] === o[k])));
  return w.stock && integer(w.stock.qty) && nn(w.stock.value) && nn(w.stock.defects) && w.stock.defects <= .1 && arr(w.shipments, 20) && w.shipments.every(s => integer(s.qty) && s.qty > 0 && nn(s.value) && calendarDay(s.arrival) && nn(s.defects) && s.defects <= .1) && arr(w.orders, 12) && w.orders.every(o => offer(o, true) && integer(o.produced) && o.produced <= o.qty && nn(o.cost) && nn(o.quote) && nn(o.deposit) && o.deposit <= o.quote && progress(o) && inspection(o)) && new Set(w.orders.map(o=>o.id)).size === w.orders.length && sameContract(w.orders) && arr(w.offers, 12) && w.offers.every(o => offer(o)) && w.offers.filter(o => o.profile === 'supply').length <= 6 && arr(w.receivables, 100) && w.receivables.every(r => nn(r.amount) && calendarDay(r.due) && typeof r.client === 'string') && (!w.expansion || calendarDay(w.expansion.ready)) && (!w.shock || nn(w.shock.cost) && calendarDay(w.shock.until)) && (!w.event || typeof w.event.title === 'string' && typeof w.event.text === 'string') && w.stats && ['produced','defects','delivered','late','lostBids','busyDays'].every(k=>nn(w.stats[k])) && w.today && ['produced','defects','utilization'].every(k=>nn(w.today[k])) && ['delivered','lateFees','auditFees'].every(k=>w.today[k] === undefined || nn(w.today[k]));
}
