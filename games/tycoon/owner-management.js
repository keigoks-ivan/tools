import { dateOf, payable, profit } from './venture-core.js';
import { management, managementAction, managementRecord } from './manager-policy.js';
import { PRODUCTS, SUPPLIERS, createManufacturing, productionPlan, manufacturingQueue, manufacturingDeliveries, manufacturingSchedule, manufacturingOrderPreview, manufacturingAction, stepManufacturing } from './manufacturing.js';
import { MODELS, createTechnology, technologyMetrics, technologyAction, stepTechnology } from './technology.js';

const fixedOf = w => w.mode === 'manufacturing' ? productionPlan(w).fixed : technologyMetrics(w, { includeBreakEven: false }).fixed;
export const ownerManagement = w => management(w, fixedOf(w));
export const ownerManagementAction = (w, data) => managementAction(w, data, fixedOf(w));
export function createOwnerVenture(mode, id, seed) {
  const w = mode === 'manufacturing' ? createManufacturing(id, seed) : createTechnology(id, seed);
  ownerManagementAction(w, { enabled: true });
  return w;
}
function cashGuard(w, fixed, variable = 0) {
  const m = ownerManagement(w), debt = Math.round(w.co.debt * .08 / 12) + Math.ceil(w.co.debt / 24);
  const tax = Math.max(0, profit(w.co.ledger) - w.co.taxLoss) * .2;
  const reserve = Math.ceil(payable(w) + (fixed + variable) * m.reserveMonths + debt + tax);
  return { reserve, available: Math.max(0, Math.floor(w.co.cash - reserve)), remaining: m.remaining };
}
const settingsOf = w => Object.fromEntries((w.mode === 'manufacturing' ? ['workers','shift','qc','supplier','productionMode'] : ['engineers','support','cloudTier','focus','price','marketing']).map(k => [k, w[k] ?? 'balanced']));
const differs = (w, settings) => Object.entries(settings).some(([k,v]) => (w[k] ?? 'balanced') !== v);
const nearOrders = w => manufacturingQueue(w).filter(o => (o.releaseDay ?? w.day) <= w.day + 7 && (o.produced ?? 0) < o.qty);

// 有限候選方案，只讀估算；不抽樣、不付錢，也不把未收尾款當現金。
export function factoryManagerPlan(w, { offer = null } = {}) {
  const m = ownerManagement(w), p = PRODUCTS[w.productId];
  const proposed = offer ? { ...w, scheduleMode: 'due', orders: manufacturingQueue({ ...w, scheduleMode: 'due' }, { offer }).map(o => ({ ...o, produced:o.produced ?? 0, cost:o.cost ?? 0, quote:o.quote ?? o.qty*o.price, deposit:o.deposit ?? Math.round(o.qty*o.price*o.depositRate) })), co: { ...w.co, cash: w.co.cash + manufacturingDeliveries(w, offer).reduce((n,o) => n + (o.deposit ?? Math.round(o.qty * o.price * o.depositRate)), 0) } } : { ...w, scheduleMode: 'due' };
  const active = nearOrders(proposed), current = settingsOf(w), candidates = [];
  const workers = active.length ? Math.max(w.workers, w.lines * 3) : w.workers;
  for (const count of [...new Set([w.workers, workers])]) {
    const options = active.length ? [['balanced','standard'],['batch','standard'],['precision','strict']] : [['balanced','standard']];
    for (const [productionMode,qc] of options) for (const shift of m.allowOvertime && active.length ? ['normal','overtime'] : ['normal']) for (const supplier of active.length ? ['stable','economy','express'] : [w.supplier]) {
      const settings = { workers: count, productionMode, qc, shift, supplier }, test = { ...proposed, ...settings }, plan = productionPlan(test), hiring = Math.max(0, count - w.workers) * 8000, guard = cashGuard(test, plan.fixed);
      if (plan.fixed > m.maxFixed || hiring > Math.min(guard.available, guard.remaining)) continue;
      const rows = manufacturingSchedule(test, { includePurchase: true });
      const risk = rows.reduce((n,r) => n + (r.finishDay === null ? 1000 : Math.max(0, -r.slackDays)), 0);
      const good = active.reduce((n,o) => n + o.qty - o.produced, 0), occupied = plan.capacity ? good / (plan.capacity * (1-plan.defects)) : 90;
      const qualityFee = active.some(o => o.profile === 'precision') ? good * p.price * Math.max(0, plan.defects - ({ packaging:.035,apparel:.025,electronics:.015 })[w.productId]) * 2.5 : 0;
      const cost = good * (plan.materialCost * SUPPLIERS[supplier].cost / (1-plan.defects) + plan.energyPerUnit) + plan.fixed * occupied / dateOf(w.day).dim + hiring + qualityFee;
      candidates.push({ settings, world: test, plan, hiring, guard, rows, risk, cost });
    }
  }
  candidates.sort((a,b) => a.risk-b.risk || a.cost-b.cost || Number(differs(w,a.settings))-Number(differs(w,b.settings)));
  const selected = candidates[0] || { settings: current, world: proposed, plan: productionPlan(proposed), hiring: 0, guard: cashGuard(proposed, productionPlan(proposed).fixed), rows: manufacturingSchedule(proposed, { includePurchase: true }) };
  const test = { ...selected.world, orders: active }, preview = active.length ? manufacturingOrderPreview(test, active.at(-1)) : null;
  const gap = preview?.materialGap || 0, s = SUPPLIERS[selected.settings.supplier], unit = selected.plan.materialCost * s.cost;
  // 只備未來一週加到貨期的用料；已付在途也占用緩衝，避免每天重複買料。
  const paid = w.stock.qty + w.shipments.reduce((n,x) => n+x.qty,0);
  const buffer = Math.max(0, selected.plan.capacity * (s.lead+7) - paid);
  const allowance = Math.max(0, Math.min(selected.guard.available, selected.guard.remaining) - selected.hiring);
  const qty = w.shipments.length < 20 && candidates.length ? Math.min(gap, buffer, p.capacity*w.lines*90, Math.floor(allowance / unit)) : 0;
  const issues = [];
  if (!candidates.length) issues.push('固定月費或招募費超出授權，請調整上限、資金或改自行管理。');
  if (active.length && gap && !qty) issues.push(w.shipments.length >= 20 ? '在途已達 20 批，等待到料後再採購。' : buffer <= 0 ? '用料已在途；到貨前仍可能延誤，請核對交期。' : '補料受本月代管預算或現金保留限制，請先安排周轉。');
  if (selected.rows.some(r => r.finishDay === null || r.slackDays < 0)) issues.push('授權內的產能仍有交期風險；需要老闆減少接單、允許加班或決定擴線。');
  const maintenanceCost = Math.round(p.equipment*w.lines*.035), slack = selected.rows.length ? Math.min(...selected.rows.map(r => r.slackDays ?? -Infinity)) : Infinity;
  const maintain = candidates.length > 0 && w.wear >= .45 && w.day >= w.maintenanceUntil && slack >= 3 && maintenanceCost <= allowance - Math.round(qty*unit);
  if (w.wear >= .65 && !maintain && w.day >= w.maintenanceUntil) issues.push('設備磨損偏高，交期或預算不足以安排保養，請決定停機時機。');
  return { ...selected, candidates: candidates.length, materialGap: gap, qty, costToBuy: Math.round(qty*unit), arrivalDay: w.day+s.lead, maintain, maintenanceCost, issues, canAdjust: candidates.length > 0 };
}

export function factoryOrderReview(w, offer, factor = 1) {
  const quoted = { ...offer, price: Math.round(offer.price * factor) }, managed = ownerManagement(w).enabled;
  const operation = managed ? factoryManagerPlan(w, { offer: quoted }) : null;
  const test = operation ? { ...w, ...operation.settings, scheduleMode: 'due' } : w;
  const preview = manufacturingOrderPreview(test, offer, { factor });
  // 得標機率依投標時的真實產線狀態，不用尚未執行的代管方案提高機率。
  preview.acceptanceChance = manufacturingOrderPreview(w, offer, { factor }).acceptanceChance;
  const plan = productionPlan(test), occupiedDays = plan.capacity ? preview.requiredMaterial / plan.capacity : null;
  const fixed = plan.fixed + Math.min(w.co.assets, PRODUCTS[w.productId].equipment*w.lines/180) + Math.round(w.co.debt*.08/12);
  const allocatedFixed = occupiedDays === null ? null : fixed * occupiedDays / dateOf(w.day).dim;
  const result = preview.finishDay === null || allocatedFixed === null ? null : preview.estimatedContribution - allocatedFixed;
  const guard = cashGuard({ ...test, co: { ...w.co, cash: w.co.cash + preview.deposit } }, plan.fixed);
  const nearCash = operation ? operation.materialGap * plan.materialCost * SUPPLIERS[test.supplier].cost + operation.hiring : preview.upfrontMaterial;
  const shortage = Math.max(0, Math.ceil(nearCash - guard.available));
  const delayedExisting = operation?.rows.filter(r => w.orders.some(o => o.id===r.id) && (r.finishDay===null || r.slackDays<0)).length || 0;
  return { preview, occupiedDays, allocatedFixed, result, shortage, nearCash, delayedExisting, operation };
}

export function technologyManagerPlan(w) {
  const m = ownerManagement(w), before = technologyMetrics(w, { includeBreakEven: false }), settings = settingsOf(w), issues = [];
  const requested = { ...settings };
  while (requested.cloudTier < 5 && w.users > MODELS[w.modelId].capacity * 2**requested.cloudTier * w.capacityBonus * .7) requested.cloudTier++;
  requested.support = Math.max(w.support, Math.min(20, Math.ceil(w.users / (before.supportCapacity * .85))));
  if (w.project && m.priority === 'delivery') requested.engineers = Math.max(w.engineers, 3);
  requested.focus = w.techDebt >= .35 || m.priority === 'service' || !w.project ? 'stability' : m.priority === 'delivery' && w.techDebt < .25 ? 'growth' : 'balanced';
  // 維運、主機、客服優先於加快研發；各項提升逐一檢查，不整批拒絕可行改善。
  for (const key of ['focus','cloudTier','support','engineers']) {
    const next = { ...settings, [key]: requested[key] }, metrics = technologyMetrics({ ...w, ...next }, { includeBreakEven:false });
    const hiring = (Math.max(0,next.engineers-w.engineers)+Math.max(0,next.support-w.support))*12000;
    const guard = cashGuard(w,metrics.fixed,metrics.variable+metrics.refunds);
    if (key==='focus' || metrics.fixed <= m.maxFixed && hiring <= Math.min(guard.available,guard.remaining)) Object.assign(settings,next);
    else if (requested[key] !== w[key]) issues.push(`${({cloudTier:'主機容量',support:'客服人力',engineers:'研發團隊'})[key]}提升超出授權或現金保留，需老闆調整預算。`);
  }
  const metrics = technologyMetrics({ ...w, ...settings }, { includeBreakEven:false }), guard = cashGuard(w,metrics.fixed,metrics.variable+metrics.refunds);
  const hiring = (Math.max(0,settings.engineers-w.engineers)+Math.max(0,settings.support-w.support))*12000;
  if (metrics.fixed > m.maxFixed) issues.push('目前固定月費已高於上限；團隊不會自行裁員或刪減你設定的獲客預算。');
  if (metrics.load > .8) issues.push('服務容量不足會降低可用率及收入、增加流失；請決定升級或放慢成長。');
  if (metrics.supportLoad > 1) issues.push('客服需求超過服務能力，客戶流失風險提高。');
  if (!guard.available) issues.push('保留營運與還款現金後沒有餘裕；應評估成長支出及資金來源。');
  if (w.techDebt >= .6) issues.push('技術債偏高；維運只能逐步改善，請評估架構專案與發布節奏。');
  return { settings, metrics, guard, hiring, issues };
}

function autoAction(w, action, data, text) {
  const before = w.co.cash, r = w.mode === 'manufacturing' ? manufacturingAction(w,action,data) : technologyAction(w,action,data);
  if (r.ok) managementRecord(w,text,Math.max(0,before-w.co.cash));
  return r.ok;
}
function runFactoryManager(w) {
  if (!ownerManagement(w).enabled) return;
  const p = factoryManagerPlan(w);
  if (p.canAdjust && differs(w,p.settings)) autoAction(w,'settings',p.settings,`經理調整 ${p.settings.workers} 人、${p.settings.shift==='normal'?'正常班':'加班'}與製程／供應商。`);
  if (w.scheduleMode !== 'due') autoAction(w,'scheduling',{mode:'due'},'經理按剩餘交期安排生產。');
  if (p.qty) autoAction(w,'purchase',{qty:p.qty},`經理分批採購 ${p.qty} 份原料，${SUPPLIERS[p.settings.supplier].lead} 天到貨。`);
  if (p.maintain) autoAction(w,'maintain',{},'經理利用交期餘裕安排兩天保養。');
}
function runTechnologyManager(w) {
  if (!ownerManagement(w).enabled) return;
  const p = technologyManagerPlan(w);
  if (differs(w,p.settings)) autoAction(w,'settings',p.settings,`團隊安排 ${p.settings.engineers} 位工程師、${p.settings.support} 位客服、主機第 ${p.settings.cloudTier+1} 級及${p.settings.focus==='stability'?'維運':p.settings.focus==='growth'?'開發':'平衡'}重心。`);
}
export function stepOwnerVenture(w) {
  return w.mode === 'manufacturing' ? stepManufacturing(w,runFactoryManager) : stepTechnology(w,runTechnologyManager);
}
