import { dateOf } from './venture-core.js';
import { PRODUCTS, SUPPLIERS, PRODUCTION_MODES, productionPlan, manufacturingOrderPreview } from './manufacturing.js';
import { MODELS, STRATEGIES, technologyMetrics, technologyEconomics, technologyProjectPlan } from './technology.js';
import { ventureCoach } from './venture-coach.js';

const known = (catalog, id) => typeof id === 'string' && Object.hasOwn(catalog, id);
const invalid = error => ({ ok: false, canApply: false, error });
const value = (data, key, fallback) => data[key] === undefined ? fallback : data[key];
const numeric = n => typeof n === 'number' ? n : typeof n === 'string' && n.trim() !== '' ? Number(n) : NaN;
const bounded = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const draftObject = data => data && typeof data === 'object' && !Array.isArray(data);
function affordableQuantity(cash, unitCost, maxQty) {
  if (!unitCost) return cash >= 0 ? maxQty : 0;
  let qty = Math.max(0, Math.min(maxQty, Math.floor(cash / unitCost)));
  if (qty < maxQty && Math.round((qty + 1) * unitCost) <= cash) qty++;
  if (qty && Math.round(qty * unitCost) > cash) qty--;
  return qty;
}
function hiringWorld(w, settings, hiring) {
  return { ...w, ...settings, co: { ...w.co, cash: w.co.cash - hiring, ledger: { ...w.co.ledger, research: w.co.ledger.research + hiring, paidCosts: w.co.ledger.paidCosts + hiring, payments: w.co.ledger.payments + hiring } } };
}
function comparison(w, settings, hiring, before, after, assumptions) {
  const canApply = w.status === 'playing' && !(hiring > 0 && hiring > w.co.cash);
  const error = w.status !== 'playing' ? '已結案，不能套用經營設定。' : !canApply ? '現金不足支付立即招募費。' : null;
  const delta = Object.fromEntries(Object.keys(after).map(key => [key, typeof before[key] === 'number' && typeof after[key] === 'number' ? after[key] - before[key] : null]));
  const changed = Object.entries(settings).some(([key, next]) => next !== (w[key] ?? (key === 'productionMode' ? 'balanced' : key === 'strategy' ? 'general' : undefined)));
  return { ok: true, canApply, error, changed, settings, hiring, cashAfterHiring: w.co.cash - hiring, before, after, delta, assumptions };
}
function manufacturingSnapshot(w) {
  const plan = productionPlan(w), coach = ventureCoach(w), supplier = SUPPLIERS[w.supplier];
  const depreciationMonthly = Math.min(w.co.assets, PRODUCTS[w.productId].equipment * w.lines / 180), interestMonthly = coach.finance.interest;
  const newMaterialDefects = productionPlan({ ...w, stock: { ...w.stock, defects: supplier.defects } }).defects;
  return { capacity: plan.capacity, goodCapacity: plan.capacity * (1 - plan.defects), defects: plan.defects, energyPerGood: plan.energyPerGood, fixedCashMonthly: plan.fixed, depreciationMonthly, interestMonthly, fixedMonthly: plan.fixed + depreciationMonthly + interestMonthly, availableCash: coach.finance.available, newMaterialUnitCost: plan.materialCost * supplier.cost, supplierLeadDays: supplier.lead, newMaterialDefects, breakEven: coach.metrics.breakEven };
}
// 草稿只比較已載入狀態，不招聘、不抽樣，也不改寫存檔。
export function manufacturingDraft(w, data = {}) {
  if (w?.mode !== 'manufacturing' || !known(PRODUCTS, w.productId) || !draftObject(data)) return invalid('製造草稿或營運路線不符。');
  const settings = { workers: numeric(value(data, 'workers', w.workers)), shift: value(data, 'shift', w.shift), qc: value(data, 'qc', w.qc), supplier: value(data, 'supplier', w.supplier), productionMode: value(data, 'productionMode', w.productionMode || 'balanced') };
  if (!bounded(settings.workers, 1, 30) || !['normal', 'overtime'].includes(settings.shift) || !['standard', 'strict'].includes(settings.qc) || !known(SUPPLIERS, settings.supplier) || !known(PRODUCTION_MODES, settings.productionMode)) return invalid('請完整填寫有效人力、班制、品管、供應商與製程。');
  const hiring = Math.max(0, settings.workers - w.workers) * 8000;
  return comparison(w, settings, hiring, manufacturingSnapshot(w), manufacturingSnapshot(hiringWorld(w, settings, hiring)), ['日產能與眼前瑕疵用目前庫存、磨損、停機及設備估計；換供應商不會改寫已付原料。', '固定月費含人事、租金、品管、基本能源、設備折舊與利息；未含原料、每件能源、違約、驗收與稅。招募費另列立即付現。', '損平用選定供應商的新料價與良率，按參考售價估計；交貨量、報價與排程仍須另看。']);
}
function technologySnapshot(w) {
  const metrics = technologyMetrics(w, { includeBreakEven: false }), economics = technologyEconomics(w), coach = ventureCoach(w), interestMonthly = coach.finance.interest;
  const fixedMonthly = metrics.fixed + interestMonthly, monthlyCost = fixedMonthly + economics.variable + economics.refunds;
  return { users: w.users, paying: w.paying, capacity: metrics.capacity, uptime: metrics.uptime, supportLoad: metrics.supportLoad, conversion: metrics.conversion, churn: metrics.churn, paidChurn: metrics.paidChurn, activeChurn: metrics.activeChurn, acquisitionCost: metrics.acquisitionCost, market: metrics.market, fixedCashMonthly: metrics.fixed, depreciationMonthly: 0, interestMonthly, fixedMonthly, availableCash: coach.finance.available, monthlyRevenue: economics.revenue, variableMonthly: economics.variable, refundsMonthly: economics.refunds, monthlyCost, monthlyResult: economics.revenue - monthlyCost, transactionsMonthly: economics.transactions, visitsMonthly: economics.visits, maintenanceShare: ({ growth: .2, balanced: .55, stability: 1 })[w.focus], breakEven: coach.metrics.breakEven, projectDays: w.project ? technologyProjectPlan(w, w.project.id).estimatedDays : null };
}
export function technologyDraft(w, data = {}) {
  if (w?.mode !== 'technology' || !known(MODELS, w.modelId) || !draftObject(data)) return invalid('科技草稿或營運路線不符。');
  const settings = Object.fromEntries(['engineers', 'support', 'marketing', 'price', 'cloudTier'].map(key => [key, numeric(value(data, key, w[key]))]));
  settings.focus = value(data, 'focus', w.focus); settings.strategy = value(data, 'strategy', w.strategy || 'general');
  const priceBounds = w.modelId === 'saas' ? [99, 1999] : w.modelId === 'marketplace' ? [2, 20] : [1, 6];
  if (!bounded(settings.engineers, 1, 12) || !bounded(settings.support, 0, 20) || !bounded(settings.marketing, 0, 500000) || !bounded(settings.price, ...priceBounds) || !bounded(settings.cloudTier, 0, 5) || !['growth', 'balanced', 'stability'].includes(settings.focus) || !known(STRATEGIES[w.modelId], settings.strategy)) return invalid('請完整填寫有效價格、獲客、人力、容量、工程重心與客群。');
  const hiring = (Math.max(0, settings.engineers - w.engineers) + Math.max(0, settings.support - w.support)) * 12000;
  return comparison(w, settings, hiring, technologySnapshot(w), technologySnapshot(hiringWorld(w, settings, hiring)), ['固定目前活躍與付費人數，按目前品質、技術債、策略與已完成能力估計完整月份；沒有預先加入新客或扣掉流失。', '月成本包含人事、行政、基本主機、獲客、工具、使用量、支付、交易服務、估計退款與利息；月淨結果為稅前，招募與新研發費另計。', '主機與價格可改變目前規模的收入；工程重心影響後續維運與研發，不會立刻產生新收入。這是草稿比較，不是未來營收保證。']);
}
export function manufacturingProcurement(w) {
  if (w?.mode !== 'manufacturing' || !known(PRODUCTS, w.productId) || !known(SUPPLIERS, w.supplier)) return { ok: false, canPurchase: false, reason: '製造營運狀態不符。' };
  const previews = w.orders.map(o => manufacturingOrderPreview(w, o)), plan = productionPlan(w), supplier = SUPPLIERS[w.supplier];
  const remaining = w.orders.reduce((n, o) => n + o.qty - o.produced, 0), requiredMaterial = previews.reduce((n, o) => n + o.requiredMaterial, 0), materialGap = previews.at(-1)?.materialGap || 0;
  const stockQty = w.stock.qty, inTransitQty = w.shipments.reduce((n, s) => n + s.qty, 0), unitCost = plan.materialCost * supplier.cost, maxQty = PRODUCTS[w.productId].capacity * w.lines * 90;
  const shipmentSlots = Math.max(0, 20 - w.shipments.length), affordableQty = affordableQuantity(w.co.cash, unitCost, maxQty);
  const recommendedQty = w.status === 'playing' && shipmentSlots ? Math.min(materialGap, maxQty, affordableQty) : 0, recommendedCost = Math.round(recommendedQty * unitCost);
  const canPurchase = recommendedQty > 0 && recommendedCost <= w.co.cash, arrivalDay = w.day + supplier.lead;
  const reason = w.status !== 'playing' ? '已結案，不能採購。' : !w.orders.length ? '尚無已接訂單，先比較合約再決定備料；未用原料會占用現金。' : !materialGap ? '庫存與已付在途按各批良率估算足夠；仍需核對到貨與交期。' : !shipmentSlots ? '已達 20 批在途上限，須等原料到貨。' : !affordableQty ? '現金不足採購一份原料。' : recommendedQty < materialGap ? '本次僅補部分缺料，受立即現金或單次 90 天用量上限限制。' : '此數量只補目前已接訂單的估計缺料。';
  return { ok: true, remaining, requiredMaterial, stockQty, inTransitQty, materialGap, supplierId: w.supplier, supplierName: supplier.name, unitCost, leadDays: supplier.lead, arrivalDay, arrivalDate: dateOf(arrivalDay).key, maxQty, shipmentSlots, affordableQty, recommendedQty, recommendedCost, totalGapCost: Math.round(materialGap * unitCost), canPurchase, cashAfterPurchase: w.co.cash - recommendedCost, remainingGap: Math.max(0, materialGap - recommendedQty), reason, assumptions: ['按既有訂單順位及每批原料良率扣除庫存與全部已付在途；在途尚未抵達時，總量足夠也可能趕不上交期。', '採購價採目前供應商與有效原料漲價事件，付現後等到貨；採購是原料資產，不是立即全數列為費用。', '建議數量受現有產線額定產能的 90 天上限、20 批在途與眼前現金限制，未替月結薪資、維修、稅及其他承諾保留資金；隨機瑕疵與未來磨損仍可能需要補料。'] };
}
