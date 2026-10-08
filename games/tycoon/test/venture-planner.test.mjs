import test from 'node:test';
import assert from 'node:assert/strict';
import { manufacturingDraft, technologyDraft, manufacturingProcurement } from '../venture-planner.js';
import { PRODUCTS, SUPPLIERS, createManufacturing, manufacturingAction, productionPlan, manufacturingOrderPreview, stepManufacturing } from '../manufacturing.js';
import { MODELS, createTechnology, technologyAction, technologyMetrics, technologyEconomics, technologyProjectPlan } from '../technology.js';
import { ventureCoach } from '../venture-coach.js';
import { receive, spend, financeAction, dateOf } from '../venture-core.js';
import { encodeVenture, decodeVenture } from '../venture-saves.js';

const copy = w => decodeVenture(encodeVenture(w), w.mode).world;
const near = (a, b) => assert.ok(Math.abs(a - b) < .000001, `${a} != ${b}`);
function order(w, qty = 1000) {
  const quote = qty * PRODUCTS[w.productId].price, deposit = Math.round(quote * .25);
  const o = { id: 'planner-' + w.seq++, client: '排程測試', qty, price: PRODUCTS[w.productId].price, quote, deposit, produced: 0, cost: 0, due: w.day + 60, expires: w.day + 7, term: 30, depositRate: .25 };
  w.orders.push(o); receive(w, deposit); return o;
}
function finite(v) {
  if (typeof v === 'number') assert.ok(Number.isFinite(v));
  else if (v && typeof v === 'object') for (const value of Object.values(v)) finite(value);
}

for (const id of Object.keys(PRODUCTS)) test(`${id} 製造草稿純讀取，招聘付現與實際套用一致`, () => {
  const w = createManufacturing(id); order(w); manufacturingAction(w, 'purchase', { qty: 100 }); financeAction(w, 'borrow', 120000);
  const data = { workers: '6', shift: 'overtime', qc: 'strict', supplier: 'economy', productionMode: 'precision' }, snapshot = JSON.stringify(w), draft = manufacturingDraft(w, data);
  assert.equal(draft.ok, true); assert.equal(draft.canApply, true); assert.equal(draft.hiring, 24000); assert.equal(draft.cashAfterHiring, w.co.cash - 24000); assert.equal(JSON.stringify(w), snapshot); assert.deepEqual(manufacturingDraft(w, data), draft); finite(draft);
  const actual = copy(w); assert.equal(manufacturingAction(actual, 'settings', draft.settings).ok, true);
  const m = productionPlan(actual), coach = ventureCoach(actual);
  assert.equal(actual.co.cash, draft.cashAfterHiring); assert.equal(draft.after.capacity, m.capacity); assert.equal(draft.after.defects, m.defects); assert.equal(draft.after.energyPerGood, m.energyPerGood);
  assert.equal(draft.after.fixedCashMonthly, m.fixed); assert.equal(draft.after.fixedMonthly, m.fixed + draft.after.depreciationMonthly + draft.after.interestMonthly);
  assert.equal(draft.after.interestMonthly, 800); assert.equal(draft.after.breakEven, coach.metrics.breakEven); assert.equal(draft.after.availableCash, coach.finance.available);
  assert.equal(draft.after.newMaterialUnitCost, PRODUCTS[id].material * .88); assert.equal(draft.after.supplierLeadDays, 7);
  near(draft.after.newMaterialDefects, productionPlan({ ...actual, stock: { ...actual.stock, defects: SUPPLIERS.economy.defects } }).defects);
  assert.equal(w.stock.value, actual.stock.value); assert.equal(w.shipments[0].value, actual.shipments[0].value);
});

for (const id of Object.keys(MODELS)) test(`${id} 科技草稿固定客數比較完整月成本，與引擎一致`, () => {
  const w = createTechnology(id); financeAction(w, 'borrow', 120000);
  const data = { engineers: '2', support: '3', marketing: '45000', cloudTier: '1', focus: 'growth', price: id === 'saas' ? '699' : id === 'marketplace' ? '12' : '4' };
  const snapshot = JSON.stringify(w), draft = technologyDraft(w, data); assert.equal(draft.ok, true); assert.equal(draft.hiring, 36000); assert.equal(JSON.stringify(w), snapshot); assert.deepEqual(technologyDraft(w, data), draft); finite(draft);
  const actual = copy(w); assert.equal(technologyAction(actual, 'settings', draft.settings).ok, true);
  assert.equal(actual.co.cash, draft.cashAfterHiring); assert.equal(actual.users, w.users); assert.equal(actual.paying, w.paying);
  const m = technologyMetrics(actual, { includeBreakEven: false }), e = technologyEconomics(actual), coach = ventureCoach(actual);
  near(draft.after.monthlyRevenue, e.revenue); near(draft.after.variableMonthly, e.variable); near(draft.after.refundsMonthly, e.refunds);
  assert.equal(draft.after.fixedCashMonthly, m.fixed); assert.equal(draft.after.interestMonthly, 800); assert.equal(draft.after.depreciationMonthly, 0);
  near(draft.after.monthlyCost, m.fixed + 800 + e.variable + e.refunds); near(draft.after.monthlyResult, e.contribution - m.fixed - 800);
  near(draft.after.monthlyResult, coach.metrics.monthlyResult - coach.finance.interest);
  assert.equal(draft.after.users, w.users); assert.equal(draft.after.paying, w.paying); assert.equal(draft.after.breakEven, coach.metrics.breakEven);
  assert.equal(draft.after.capacity, m.capacity); assert.equal(draft.after.uptime, m.uptime); assert.equal(draft.after.conversion, m.conversion); assert.equal(draft.after.churn, m.churn);
  near(draft.after.transactionsMonthly, e.transactions); near(draft.after.visitsMonthly, e.visits); assert.equal(draft.after.maintenanceShare, .2); assert.equal(draft.before.maintenanceShare, .55);
});

test('製造供應商改價不影響目前庫存瑕疵，草稿分開顯示新料良率', () => {
  const w = createManufacturing(); manufacturingAction(w, 'purchase', { qty: 500 }); for (let i = 0; i < 4; i++) stepManufacturing(w);
  const draft = manufacturingDraft(w, { supplier: 'express' }); assert.equal(draft.before.defects, draft.after.defects); assert.ok(draft.after.newMaterialDefects < draft.before.newMaterialDefects); assert.ok(draft.after.newMaterialUnitCost > draft.before.newMaterialUnitCost); assert.equal(draft.after.supplierLeadDays, 1);
});

test('停機、設備與缺人條件保留，草稿不把尚未擴線當作已可用', () => {
  const w = createManufacturing(); manufacturingAction(w, 'expand'); w.maintenanceUntil = 2;
  const draft = manufacturingDraft(w, { workers: 6 }); assert.equal(draft.before.capacity, 0); assert.equal(draft.after.capacity, 0); assert.equal(w.lines, 1); assert.equal(draft.hiring, 24000);
  w.maintenanceUntil = 0; const one = manufacturingDraft(w, { workers: 6 }); assert.equal(one.before.capacity, one.after.capacity); assert.ok(one.after.fixedMonthly > one.before.fixedMonthly);
});

test('低資金仍能看招聘方案，但不能套用；不招募時負現金行為與引擎一致', () => {
  for (const [w, planner, change, action] of [[createManufacturing(), manufacturingDraft, { workers: 4 }, manufacturingAction], [createTechnology(), technologyDraft, { engineers: 2 }, technologyAction]]) {
    spend(w, w.co.cash - 100); const draft = planner(w, change); assert.equal(draft.ok, true); assert.equal(draft.canApply, false); assert.match(draft.error, /現金不足/); assert.equal(action(copy(w), 'settings', draft.settings).ok, false);
    spend(w, 200); const noHire = planner(w, {}); assert.equal(noHire.canApply, true); assert.equal(noHire.hiring, 0); assert.equal(action(copy(w), 'settings', noHire.settings).ok, true);
    w.status = 'bankrupt'; const closed = planner(w, {}); assert.equal(closed.canApply, false); assert.match(closed.error, /結案/);
  }
});

test('裁減人手沒有招聘費或免費退款，無改動草稿 delta 為零', () => {
  const f = createManufacturing(); const draft = manufacturingDraft(f, { workers: 1 }); assert.equal(draft.hiring, 0); assert.equal(draft.cashAfterHiring, f.co.cash); assert.ok(draft.delta.fixedMonthly < 0);
  const t = createTechnology(); const noChange = technologyDraft(t); assert.equal(noChange.changed, false); for (const value of Object.values(noChange.delta)) if (value !== null) assert.equal(value, 0);
});

test('表單空值、非整數、超界與未知枚舉拒絕，草稿不會部分變更世界', () => {
  for (const [w, planner, bad] of [[createManufacturing(), manufacturingDraft, [{ workers: '' }, { workers: null }, { workers: '1.5' }, { workers: 0 }, { workers: 31 }, { supplier: 'constructor' }, { shift: 'late' }, { qc: 'free' }, { productionMode: 'constructor' }, { productionMode: { toString: 'x' } }]], [createTechnology(), technologyDraft, [{ engineers: '' }, { engineers: 0 }, { engineers: 13 }, { support: -1 }, { support: 21 }, { marketing: Infinity }, { marketing: 500001 }, { cloudTier: 6 }, { price: 98 }, { price: 2000 }, { focus: 'unknown' }, { strategy: 'constructor' }]]]) {
    const snapshot = JSON.stringify(w); for (const data of bad) { const result = planner(w, data); assert.equal(result.ok, false); assert.equal(result.canApply, false); assert.equal(JSON.stringify(w), snapshot); }
    for (const data of [null, [], '3']) assert.equal(planner(w, data).ok, false);
  }
  assert.equal(technologyDraft(createManufacturing()).ok, false); assert.equal(manufacturingDraft(createTechnology()).ok, false);
});

test('三種科技價格邊界、客群與已完成能力沿真實公式估算', () => {
  for (const [id, bounds, strategy, capability] of [['saas', [99, 1999], 'teams', 'automation'], ['marketplace', [2, 20], 'niche', 'trust'], ['content', [1, 6], 'community', 'analytics']]) {
    const w = createTechnology(id); w.capabilities = [capability];
    for (const price of bounds) { const draft = technologyDraft(w, { price, strategy }); assert.equal(draft.ok, true); const next = { ...w, ...draft.settings }, metrics = technologyMetrics(next, { includeBreakEven: false }); assert.equal(draft.after.market, metrics.market); assert.equal(draft.after.fixedCashMonthly, metrics.fixed); near(draft.after.variableMonthly, technologyEconomics(next).variable); }
    assert.equal(technologyDraft(w, { price: bounds[0] - 1 }).ok, false); assert.equal(technologyDraft(w, { price: bounds[1] + 1 }).ok, false);
  }
});

test('科技過載退款與主機變動列入月比較，工程重心只改後續專案時程', () => {
  const w = createTechnology(); w.users = 1800; w.paying = 600; w.techDebt = .8;
  technologyAction(w, 'project', { id: 'activation', release: 'pilot' }); const draft = technologyDraft(w, { cloudTier: 2, focus: 'growth' });
  assert.ok(draft.before.refundsMonthly > 0); assert.ok(draft.after.refundsMonthly < draft.before.refundsMonthly); assert.ok(draft.after.monthlyRevenue > draft.before.monthlyRevenue);
  assert.equal(draft.after.projectDays, technologyProjectPlan({ ...w, focus: 'growth' }, 'activation').estimatedDays); assert.ok(draft.after.projectDays < draft.before.projectDays);
  const onlyFocus = technologyDraft(w, { focus: 'growth' }); assert.equal(onlyFocus.after.monthlyRevenue, onlyFocus.before.monthlyRevenue); assert.equal(onlyFocus.after.monthlyCost, onlyFocus.before.monthlyCost);
  const stability = technologyDraft(w, { focus: 'stability' }); assert.equal(stability.after.maintenanceShare, 1); assert.equal(stability.after.projectDays, technologyProjectPlan({ ...w, focus: 'stability' }, 'activation').estimatedDays);
});

for (const id of Object.keys(PRODUCTS)) test(`${id} 缺料建議扣庫存與在途，採購金額與到貨完全對應實際 action`, () => {
  const w = createManufacturing(id), p = PRODUCTS[id]; order(w, p.capacity * 6); manufacturingAction(w, 'purchase', { qty: p.capacity * 2 });
  const snapshot = JSON.stringify(w), procurement = manufacturingProcurement(w), last = manufacturingOrderPreview(w, w.orders.at(-1));
  assert.equal(JSON.stringify(w), snapshot); assert.deepEqual(manufacturingProcurement(w), procurement); finite(procurement);
  assert.equal(procurement.materialGap, last.materialGap); assert.equal(procurement.requiredMaterial, last.requiredMaterial); assert.equal(procurement.inTransitQty, p.capacity * 2); assert.equal(procurement.maxQty, p.capacity * 90); assert.equal(procurement.leadDays, 3);
  const actual = copy(w); assert.equal(manufacturingAction(actual, 'purchase', { qty: procurement.recommendedQty }).ok, true);
  assert.equal(w.co.cash - actual.co.cash, procurement.recommendedCost); assert.equal(actual.shipments.at(-1).arrival, procurement.arrivalDay); assert.equal(dateOf(actual.shipments.at(-1).arrival).key, procurement.arrivalDate); assert.equal(actual.shipments.at(-1).value, procurement.recommendedCost); assert.equal(actual.co.ledger.cogs, w.co.ledger.cogs);
});

test('多張單的缺口沿順位計算，各批原料良率與成本不被新供應商改寫', () => {
  const w = createManufacturing(); order(w, 1200); order(w, 800); w.supplier = 'economy'; manufacturingAction(w, 'purchase', { qty: 500 }); w.supplier = 'express'; manufacturingAction(w, 'purchase', { qty: 400 });
  const p = manufacturingProcurement(w), previews = w.orders.map(o => manufacturingOrderPreview(w, o)); assert.equal(p.materialGap, previews.at(-1).materialGap); assert.equal(p.requiredMaterial, previews.reduce((n, o) => n + o.requiredMaterial, 0)); assert.equal(p.inTransitQty, 900); assert.equal(p.unitCost, 12.2); assert.equal(p.leadDays, 1);
});

test('總量足夠但晚到不另買同一批料，沒有訂單不推薦囤貨', () => {
  const empty = manufacturingProcurement(createManufacturing()); assert.equal(empty.materialGap, 0); assert.equal(empty.recommendedQty, 0); assert.equal(empty.canPurchase, false); assert.match(empty.reason, /尚無已接訂單/);
  const w = createManufacturing(); const o = order(w, 100); o.due = 1; manufacturingAction(w, 'purchase', { qty: 200 }); w.shipments[0].arrival = 40;
  const p = manufacturingProcurement(w); assert.equal(p.materialGap, 0); assert.equal(p.recommendedQty, 0); assert.match(p.reason, /核對到貨與交期/);
});

test('補料受現有產線額定 90 日用量限制，不把加班或施工線算入上限', () => {
  const w = createManufacturing(); order(w, 100000); w.lines = 2; w.shift = 'overtime'; w.expansion = { ready: 14 }; receive(w, 10000000, 'borrowing'); w.co.debt += 10000000;
  const p = manufacturingProcurement(w); assert.equal(p.maxQty, PRODUCTS.packaging.capacity * 2 * 90); assert.equal(p.recommendedQty, p.maxQty); assert.ok(p.remainingGap > 0); assert.match(p.reason, /部分缺料/); assert.equal(manufacturingAction(copy(w), 'purchase', { qty: p.recommendedQty }).ok, true);
});

test('現金不足、20 批上限、結案均不產生無法執行的採購建議', () => {
  const w = createManufacturing(); order(w, 100); spend(w, w.co.cash - 35); let p = manufacturingProcurement(w); assert.equal(p.recommendedQty, 3); assert.equal(p.recommendedCost, 30); assert.equal(p.cashAfterPurchase, 5); assert.ok(p.remainingGap > 0); assert.equal(manufacturingAction(copy(w), 'purchase', { qty: p.recommendedQty }).ok, true);
  spend(w, 35); p = manufacturingProcurement(w); assert.equal(p.recommendedQty, 0); assert.equal(p.canPurchase, false); assert.match(p.reason, /現金不足/);
  receive(w, 10000); w.shipments = Array.from({ length: 20 }, () => ({ qty: 1, value: 10, defects: .008, arrival: 7 })); p = manufacturingProcurement(w); assert.equal(p.shipmentSlots, 0); assert.equal(p.recommendedQty, 0); assert.match(p.reason, /20 批/);
  w.status = 'bankrupt'; p = manufacturingProcurement(w); assert.equal(p.canPurchase, false); assert.equal(p.recommendedQty, 0); assert.match(p.reason, /結案/);
});

test('採購單次金額取整與小數現金邊界依實際引擎判斷', () => {
  for (const cash of [8.75, 9, 17.6, 18, 26.5, 27]) {
    const w = createManufacturing(); order(w, 100); w.supplier = 'economy'; spend(w, w.co.cash - cash);
    const p = manufacturingProcurement(w); assert.ok(p.recommendedCost <= w.co.cash); if (p.canPurchase) assert.equal(manufacturingAction(copy(w), 'purchase', { qty: p.recommendedQty }).ok, true);
    assert.ok(Math.round((p.affordableQty + 1) * p.unitCost) > w.co.cash);
  }
  const w = createManufacturing(); order(w, 100); w.shock = { cost: 0, until: 45 }; const p = manufacturingProcurement(w); assert.equal(p.unitCost, 0); assert.equal(p.recommendedCost, 0); assert.equal(p.canPurchase, true); finite(p);
});

test('漲價事件只影響新採購，已付原料不重估；舊存檔缺枚舉仍有安全預設', () => {
  const w = createManufacturing(); order(w); manufacturingAction(w, 'purchase', { qty: 100 }); const paid = w.shipments[0].value; w.shock = { cost: 1.22, until: 45 };
  const p = manufacturingProcurement(w); assert.equal(p.unitCost, 12.2); assert.equal(w.shipments[0].value, paid); w.day = 45; assert.equal(manufacturingProcurement(w).unitCost, 10);
  delete w.productionMode; assert.equal(manufacturingDraft(w).settings.productionMode, 'balanced');
  const t = createTechnology(); delete t.strategy; delete t.capabilities; assert.equal(technologyDraft(t).settings.strategy, 'general');
});
