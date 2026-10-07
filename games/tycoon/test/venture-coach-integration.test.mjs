import test from 'node:test';
import assert from 'node:assert/strict';
import { ventureCoach } from '../venture-coach.js';
import { PRODUCTS, SUPPLIERS, PRODUCTION_MODES, createManufacturing, productionPlan, contractProfiles, manufacturingOrderPreview, manufacturingSchedule } from '../manufacturing.js';
import { STRATEGIES, PROJECTS, createTechnology, technologyProjects, technologyMetrics, technologyEconomics, technologyBreakEven, technologyAction, technologyProjectPlan } from '../technology.js';
import { dateOf, expense, receive } from '../venture-core.js';

const driver = (c, id) => c.drivers.find(d => d.id === id);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const finite = v => { if (typeof v === 'number') assert.ok(Number.isFinite(v)); else if (v && typeof v === 'object') Object.values(v).forEach(finite); };
function order(w, { profile, qty = 100, due = 20, produced = 0, attempted = produced, scrapped = 0, cost = 0, inspectionReady } = {}) {
  const price = PRODUCTS[w.productId].price, quote = qty * price, policy = profile ? contractProfiles(w.productId)[profile] : { depositRate: .25, term: 30 }, deposit = Math.round(quote * policy.depositRate);
  const o = { id: 'integration-' + w.seq++, client: '測試合約', qty, price, quote, deposit, produced, cost, due, term: policy.term, expires: 7, depositRate: policy.depositRate, ...(profile ? { profile, attempted, scrapped } : {}), ...(inspectionReady === undefined ? {} : { inspectionReady }) };
  w.orders.push(o); receive(w, deposit); return o;
}

test('製造三種生產方式的參考損平、良品能力與契約能源均使用實際模式', () => {
  for (const productId of Object.keys(PRODUCTS)) for (const productionMode of Object.keys(PRODUCTION_MODES)) {
    const w = createManufacturing(productId); w.productionMode = productionMode; w.supplier = 'economy'; w.qc = 'strict'; w.wear = .12;
    const p = PRODUCTS[productId], c = ventureCoach(w), m = productionPlan(w), newDefects = productionPlan({ ...w, stock: { ...w.stock, defects: SUPPLIERS.economy.defects } }).defects;
    const unit = p.price - m.materialCost * SUPPLIERS.economy.cost / (1 - newDefects) - m.energyPerGood;
    near(c.metrics.energyPerGood, PRODUCTION_MODES[productionMode].energy); near(c.metrics.contributionPerUnit, unit);
    assert.equal(c.metrics.breakEven, Math.ceil((m.fixed + Math.min(w.co.assets, p.equipment * w.lines / 180)) / unit));
    near(driver(c, 'goodCapacity').value, m.capacity * (1 - m.defects));
  }
});

test('精密合約排程包含驗收一天及已排驗收日，交期風險和共享排程一致', () => {
  const w = createManufacturing(); w.stock = { qty: 500, value: 5000, defects: .008 };
  const o = order(w, { profile: 'precision', qty: 100, due: 0 });
  let c = ventureCoach(w), scheduled = manufacturingSchedule(w).find(x => x.id === o.id);
  assert.equal(scheduled.finishDay, 1); assert.equal(c.metrics.orders[0].finishDay, scheduled.finishDay); assert.equal(c.metrics.orders[0].late, true);
  assert.equal(c.bottleneck.id, 'delivery'); assert.match(c.bottleneck.reason, /合約驗收/);
  o.produced = o.qty; o.attempted = o.qty; o.inspectionReady = 4;
  c = ventureCoach(w); assert.equal(c.metrics.orders[0].finishDay, 4); assert.equal(c.metrics.remaining, 0); assert.equal(c.metrics.materialGap, 0);
});

test('急件合約取消寬限比舊合約短，教練不假設每張訂單都能多等七天', () => {
  const w = createManufacturing(); w.maintenanceUntil = 4; w.stock = { qty: 500, value: 5000, defects: .008 };
  order(w, { profile: 'rush', qty: 100, due: 0 });
  const c = ventureCoach(w); assert.equal(c.metrics.orders[0].policy.graceDays, 3); assert.equal(c.metrics.orders[0].finishDay, null); assert.equal(c.bottleneck.id, 'delivery');
});

test('補料可挽救的交期先提示採購，精密驗收會改變是否趕得上', () => {
  const w = createManufacturing(); w.supplier = 'express';
  const o = order(w, { profile: 'precision', qty: 100, due: 1 });
  assert.equal(ventureCoach(w).bottleneck.id, 'delivery');
  o.due = 2; assert.equal(ventureCoach(w).bottleneck.id, 'materials');
});

test('契約貢獻含預估驗收和逾期費，取消費依各合約且不重扣已認列報廢', () => {
  const w = createManufacturing(); w.productionMode = 'batch'; w.stock = { qty: 500, value: 5000, defects: .03 };
  order(w, { profile: 'precision', qty: 100, due: 0, produced: 80, attempted: 100, scrapped: 20, cost: 800 });
  order(w, { profile: 'rush', qty: 100, due: 20 });
  let c = ventureCoach(w), previews = w.orders.map(o => manufacturingOrderPreview(w, o));
  assert.ok(c.metrics.estimatedAuditFees > 0); assert.ok(c.metrics.estimatedLateFees > 0);
  near(c.metrics.quotedContribution, previews.reduce((n, o) => n + o.estimatedContribution, 0));
  assert.equal(c.metrics.cancellationFees, previews.reduce((n, o) => n + o.cancellationFee, 0));
  assert.equal(c.metrics.materialGap, previews.at(-1).materialGap);
  const contribution = c.metrics.quotedContribution; expense(w, 'cogs', 1234); c = ventureCoach(w); near(c.metrics.quotedContribution, contribution);
  assert.match(driver(c, 'quotedContribution').detail, /已認列報廢不重扣/);
  w.co.cash = -100; c = ventureCoach(w); assert.match(c.decision.action, new RegExp('\\$' + c.metrics.cancellationFees.toLocaleString('zh-TW')));
});

test('教練與共享排程最多估九十日，未知長交期不冒充已發生違約且查詢純讀取', () => {
  const w = createManufacturing(); order(w, { qty: 500000, due: Number.MAX_SAFE_INTEGER }); w.maintenanceUntil = Number.MAX_SAFE_INTEGER;
  const raw = JSON.stringify(w), c = ventureCoach(w); finite(c); assert.equal(JSON.stringify(w), raw); assert.equal(c.metrics.orders[0].finishDay, null);
  assert.match(driver(c, 'deliveryRisk').detail, /最多 90 日/); assert.match(driver(c, 'deliveryRisk').detail, /不代表已發生違約/);
});

test('全部科技策略和完成能力的報表貢獻、市場與損平都與引擎一致', () => {
  for (const modelId of Object.keys(STRATEGIES)) for (const strategy of Object.keys(STRATEGIES[modelId])) {
    const w = createTechnology(modelId); w.strategy = strategy; w.capabilities = Object.keys(technologyProjects(modelId)).filter(id => PROJECTS[id].modelId);
    const raw = JSON.stringify(w), c = ventureCoach(w), m = technologyMetrics(w), e = technologyEconomics(w); finite(c);
    assert.equal(JSON.stringify(w), raw); near(c.metrics.contribution, e.contribution); near(c.metrics.fixed, m.fixed); assert.equal(c.metrics.market, m.market);
    assert.equal(c.metrics.breakEven, technologyBreakEven(w, m.fixed + c.finance.interest)); assert.equal(c.metrics.supportCapacity, m.supportCapacity);
    if (modelId === 'marketplace') { near(driver(c, 'liquidity').value, Math.min(1, w.users / m.liquidityTarget) * 100); assert.match(c.formula.detail, new RegExp(m.liquidityTarget.toLocaleString('zh-TW'))); }
    if (modelId === 'content') { near(driver(c, 'adCPM').value, m.adCPM); near(c.metrics.revenue, c.metrics.visits * w.price * m.adCPM / 1000); }
    assert.match(driver(c, 'users').detail, new RegExp(m.market.toLocaleString('zh-TW')));
  }
});

test('平台達到新策略密度後不再提示舊的兩千五百人目標', () => {
  const w = createTechnology('marketplace'); w.strategy = 'niche'; w.capabilities = ['matching']; w.users = 900; w.quality = .6; w.retention = .6;
  const c = ventureCoach(w); assert.equal(c.metrics.liquidityTarget, 840); assert.equal(driver(c, 'liquidity').value, 100); assert.notEqual(c.bottleneck.id, 'liquidity');
  w.strategy = 'mass'; const mass = ventureCoach(w); assert.equal(mass.metrics.liquidityTarget, 3500); assert.equal(mass.bottleneck.id, 'liquidity'); assert.match(mass.decision.action, /2,600/);
});

test('客服建議計入社群策略容量與 SaaS 自動化，而不是業態基準容量', () => {
  const w = createTechnology('content'); w.strategy = 'community'; w.users = 30000; w.cloudTier = 3;
  const c = ventureCoach(w); assert.equal(c.bottleneck.id, 'support'); assert.equal(c.metrics.supportCapacity, 22000); assert.match(c.decision.action, /2 位客服/); assert.match(c.decision.action, /補 1 人/);
  const t = createTechnology('saas'); t.strategy = 'teams'; t.capabilities = ['automation']; t.users = 2000; t.paying = 400; t.cloudTier = 3;
  const tc = ventureCoach(t); assert.equal(tc.bottleneck.id, 'support'); near(tc.metrics.supportCapacity, 1215); assert.match(tc.decision.action, /1,215 人/);
});

test('現有試點或搶先發布的架構專案用實際費用、剩餘工作量及技術債效果', () => {
  for (const release of ['pilot', 'rush']) {
    const w = createTechnology(); w.users = 900; w.paying = 100; w.techDebt = .5;
    technologyAction(w, 'project', { id: 'reliability', release }); w.project.progress = 3.2;
    const c = ventureCoach(w), plan = technologyProjectPlan(w, 'reliability');
    assert.equal(c.bottleneck.id, 'reliability'); assert.deepEqual(c.metrics.project, plan);
    assert.ok(c.decision.action.includes(plan.releaseName)); assert.ok(c.decision.action.includes(`約剩 ${plan.estimatedDays} 天`));
    assert.ok(c.decision.action.includes(Math.abs(plan.debt * 100).toFixed(1) + ' 點'));
  }
});

test('留存改善的百分點取自策略、能力和流失上限的反事實估計', () => {
  const w = createTechnology('content'); w.strategy = 'community'; w.capabilities = ['analytics']; w.price = 6; w.retention = .94;
  technologyAction(w, 'project', { id: 'retention', release: 'pilot' }); w.project.progress = 4;
  const c = ventureCoach(w), m = technologyMetrics(w), later = technologyMetrics({ ...w, retention: .95 }), delta = Math.max(0, m.churn - later.churn) * 100;
  assert.equal(c.bottleneck.id, 'retention'); assert.ok(c.decision.action.includes(delta.toFixed(2) + ' 個百分點'));
  assert.match(c.decision.action, /最多增加 1.0 點/); assert.match(c.decision.action, /小規模試點/); assert.match(c.decision.tradeoff, /0.8 點/);
});
