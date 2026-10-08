import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, SUPPLIERS, PRODUCTION_MODES, contractProfiles, contractPolicy, createManufacturing, productionPlan, manufacturingSchedule, manufacturingOrderPreview, manufacturingAction as action, stepManufacturing as step, manufacturingValid } from '../manufacturing.js';
import { receive, spend, cashIdentity, report } from '../venture-core.js';
import { encodeVenture, decodeVenture } from '../venture-saves.js';

const copy = w => decodeVenture(encodeVenture(w), 'manufacturing').world;
const settings = (w, productionMode) => ({ workers: w.workers, shift: w.shift, qc: w.qc, supplier: w.supplier, productionMode });
const cashChecks = w => { assert.ok(Math.abs(cashIdentity(w.co.ledger, w.co.cash)) < .001); for (const row of w.co.history) assert.ok(Math.abs(cashIdentity(row, row.cashEnd)) < .001); };
function order(w, { profile, qty = 500, due = 20, produced = 0, attempted, scrapped, cost = 0 } = {}) {
  const policy = profile ? contractProfiles(w.productId)[profile] : { term: 30, depositRate: .25 };
  const price = PRODUCTS[w.productId].price, quote = qty * price, deposit = Math.round(quote * policy.depositRate);
  const o = { id: 'fixture-' + w.seq++, client: '契約測試客戶', qty, due, price, term: policy.term, expires: 7, depositRate: policy.depositRate, quote, deposit, produced, cost, ...(profile ? { profile } : {}), ...(attempted === undefined ? {} : { attempted, scrapped }) };
  if (cost) spend(w, cost, 'purchases');
  receive(w, deposit); w.orders.push(o); return o;
}
function stock(w, qty = 5000, defects = .02) {
  const value = qty * PRODUCTS[w.productId].material; spend(w, value, 'purchases'); w.stock = { qty, value, defects };
}

for (const id of Object.keys(PRODUCTS)) test(`${id} 開局有三種不同的真實合約、相同種子可重現`, () => {
  const w = createManufacturing(id, 81), same = createManufacturing(id, 81), policies = contractProfiles(id);
  assert.deepEqual(w, same); assert.deepEqual(w.offers.slice(0,3).map(o => o.profile), ['bulk', 'rush', 'precision']);
  assert.equal(w.offers[0].depositRate, .15); assert.equal(w.offers[1].depositRate, .35); assert.equal(w.offers[0].term, 45); assert.equal(w.offers[1].term, 15);
  assert.ok(w.offers[0].qty > w.offers[1].qty); assert.ok(w.offers[1].price > w.offers[0].price);
  assert.equal(policies.precision.inspectionDays, 1); assert.ok(manufacturingValid(w)); copy(w);
});

test('包材、服飾、電子各有客戶情境與不同驗收門檻', () => {
  const p = Object.keys(PRODUCTS).map(id => contractProfiles(id));
  assert.equal(new Set(p.map(x => x.rush.name)).size, 3); assert.equal(new Set(p.map(x => x.precision.qualityTolerance)).size, 3);
  assert.ok(p[2].precision.qualityTolerance < p[1].precision.qualityTolerance);
});

test('生產方式真的改變良品、耗料、能源、磨損，帳務與原料守恆', () => {
  const base = createManufacturing(); order(base, { qty: 4000 }); stock(base);
  const worlds = Object.keys(PRODUCTION_MODES).map(id => { const w = copy(base); assert.ok(action(w, 'productionMode', { id }).ok); step(w); return w; });
  const [balanced, batch, precise] = worlds;
  assert.ok(batch.today.produced > balanced.today.produced); assert.ok(precise.today.produced < balanced.today.produced);
  assert.ok(batch.today.defects > balanced.today.defects); assert.ok(precise.today.defects < balanced.today.defects);
  assert.ok(batch.wear > balanced.wear); assert.ok(precise.wear < balanced.wear);
  for (const w of worlds) {
    const mode = PRODUCTION_MODES[w.productionMode], o = w.orders[0];
    assert.equal(w.stock.qty + w.stats.produced + w.stats.defects, 5000);
    assert.ok(Math.abs(w.stock.value + o.cost + w.co.ledger.cogs - 50000) < .001);
    assert.equal(o.attempted - o.scrapped, o.produced);
    assert.ok(Math.abs(w.co.ledger.energy - (6000 / 31 + w.today.produced * mode.energy)) < .00001);
    assert.equal(productionPlan(w).energyPerGood, mode.energy); assert.ok(manufacturingValid(w)); cashChecks(w); copy(w);
  }
});

test('生產方式和加班、品管疊加，沒有免費提高所有指標的選項', () => {
  const w = createManufacturing(), balanced = productionPlan(w);
  action(w, 'settings', { ...settings(w, 'precision'), qc: 'strict' }); const precision = productionPlan(w);
  assert.ok(precision.capacity < balanced.capacity); assert.ok(precision.defects < balanced.defects); assert.ok(precision.fixed > balanced.fixed); assert.ok(precision.energyPerGood > balanced.energyPerGood);
  action(w, 'settings', { ...settings(w, 'batch'), shift: 'overtime', qc: 'standard' }); const batch = productionPlan(w);
  assert.ok(batch.capacity > balanced.capacity); assert.ok(batch.defects > balanced.defects); assert.ok(batch.fixed > balanced.fixed);
  action(w, 'settings', { workers: w.workers, shift: 'normal', qc: 'standard', supplier: 'stable' });
  assert.equal(w.productionMode, 'batch');
});

test('舊存檔缺新欄位仍可讀，保留一般合約 7 天／10% 原規則', () => {
  const w = createManufacturing(); delete w.productionMode; w.offers = []; const o = order(w); stock(w, 1000);
  const policy = contractPolicy(w, o); assert.equal(policy.cancelAfter, 7); assert.equal(policy.cancelRate, .1); assert.equal(policy.auditTolerance, null);
  assert.ok(manufacturingValid(w)); const restored = copy(w), explicit = copy(w); explicit.productionMode = 'balanced';
  assert.equal(productionPlan(restored).capacity, productionPlan(explicit).capacity);
  for (let i = 0; i < 35; i++) { step(restored); step(explicit); }
  assert.deepEqual(restored.co, explicit.co); assert.deepEqual(restored.stats, explicit.stats); cashChecks(restored);
});

for (const id of Object.keys(PRODUCTS)) test(`${id} 精密合約完成後驗收一天，費用只付一次，收入與尾款分開`, () => {
  const w = createManufacturing(id), qty = 900, o = order(w, { profile: 'precision', qty, produced: qty, attempted: 1000, scrapped: 100, cost: qty * PRODUCTS[id].material });
  const before = w.co.cash, policy = contractPolicy(w, o), fee = Math.round(o.quote * Math.min(policy.auditCap, (.1 - policy.auditTolerance) * policy.auditRate));
  step(w); assert.equal(w.co.ledger.revenue, 0); assert.equal(w.orders.length, 1); assert.equal(o.inspectionReady, 1); assert.equal(w.co.ledger.penalty, 0); assert.ok(manufacturingValid(w));
  const saved = copy(w); step(w); step(saved); assert.deepEqual(saved, w);
  assert.equal(w.co.ledger.revenue, o.quote); assert.equal(w.co.cash, before - fee); assert.equal(w.co.ledger.penalty, fee); assert.equal(w.today.auditFees, fee);
  assert.equal(w.receivables[0].amount, o.quote - o.deposit); assert.equal(w.receivables[0].due, 1 + o.term); assert.equal(w.co.ledger.cogs, o.cost);
  step(w); assert.equal(w.co.ledger.penalty, fee); assert.equal(w.stats.delivered, 1); cashChecks(w);
});

test('符合精密門檻不收追加驗收費，驗收仍占用交期', () => {
  const w = createManufacturing(), o = order(w, { profile: 'precision', qty: 100, due: 0, produced: 100, attempted: 100, scrapped: 0 });
  assert.equal(manufacturingOrderPreview(w, o).finishDay, 1);
  step(w); step(w); assert.equal(w.today.auditFees, 0); assert.equal(w.stats.late, 1); assert.equal(w.today.lateFees, Math.round(o.quote * .02)); cashChecks(w);
});

test('急件逾期費與取消期限比一般單嚴格，取消不能再認列收入', () => {
  const w = createManufacturing(), o = order(w, { profile: 'rush', qty: 100, due: 0, produced: 100 }); w.day = 2;
  step(w); assert.equal(w.co.ledger.penalty, Math.round(o.quote * .08)); assert.equal(w.stats.delivered, 1); cashChecks(w);
  const canceled = createManufacturing(), lost = order(canceled, { profile: 'rush', qty: 100, due: 0 }); canceled.day = 4; stock(canceled, 300);
  const cash = canceled.co.cash; step(canceled); assert.equal(canceled.co.ledger.revenue, 0); assert.equal(canceled.orders.length, 0); assert.equal(canceled.stock.qty, 300);
  assert.equal(canceled.co.cash, cash - lost.deposit - Math.round(lost.quote * .15)); assert.equal(canceled.stats.late, 1); cashChecks(canceled);
});

test('大貨提供十天寬限，取消退訂金與 10% 違約金不重算在製成本', () => {
  const w = createManufacturing(), o = order(w, { profile: 'bulk', qty: 100, due: 0, produced: 80, cost: 800 }); w.day = 10;
  step(w); assert.equal(w.orders.length, 1); const cash = w.co.cash, cogs = w.co.ledger.cogs;
  step(w); assert.equal(w.orders.length, 0); assert.equal(w.co.cash, cash - o.deposit - Math.round(o.quote * .1)); assert.equal(w.co.ledger.cogs - cogs, 800);
  assert.equal(action(w, 'cancel', { id: o.id }).ok, false); cashChecks(w);
});

test('接單試算只讀且可重現，含優先訂單、原料、停機、擴線、驗收與模式', () => {
  const w = createManufacturing(), beforeOrder = order(w, { qty: 300, due: 20 });
  action(w, 'purchase', { qty: 500 }); w.shipments[0].arrival = 5; w.maintenanceUntil = 7;
  const offer = w.offers.find(o => o.profile === 'precision'), snapshot = JSON.stringify(w), preview = manufacturingOrderPreview(w, offer);
  assert.equal(JSON.stringify(w), snapshot); assert.deepEqual(manufacturingOrderPreview(w, offer), preview);
  assert.ok(preview.materialGap > 0); assert.equal(preview.upfrontMaterial, Math.round(preview.materialGap * PRODUCTS.packaging.material));
  assert.ok(preview.finishDay >= 7 + 1); assert.equal(preview.slackDays, offer.due - preview.finishDay); assert.equal(preview.policy.inspectionDays, 1);
  assert.equal(preview.estimatedContribution, preview.quote - preview.materialCost - preview.remaining * preview.energyPerUnit - preview.estimatedAuditFee - preview.estimatedLateFee);
  const batch = manufacturingOrderPreview(w, offer, { productionMode: 'batch' }), precision = manufacturingOrderPreview(w, offer, { productionMode: 'precision' });
  assert.ok(batch.finishDay < precision.finishDay); assert.ok(batch.estimatedAuditFee > precision.estimatedAuditFee);
  const low = manufacturingOrderPreview(w, offer, { factor: .9 }), high = manufacturingOrderPreview(w, offer, { factor: 1.1 });
  assert.ok(low.acceptanceChance > high.acceptanceChance); assert.ok(low.estimatedContribution < high.estimatedContribution);
  action(w, 'settings', { workers: 6, shift: 'normal', qc: 'standard', supplier: 'stable', productionMode: 'balanced' });
  w.expansion = { ready: 8 }; const expanded = manufacturingOrderPreview(w, offer); assert.ok(expanded.finishDay <= preview.finishDay);
  assert.ok(manufacturingSchedule(w).find(o => o.id === beforeOrder.id).finishDay >= 7);
});

test('試算採用已付原料成本，換供應商不能改寫庫存成本', () => {
  const w = createManufacturing(); const offer = w.offers[0]; stock(w, 10000, .008);
  const stable = manufacturingOrderPreview(w, offer); w.supplier = 'express'; const express = manufacturingOrderPreview(w, offer);
  assert.equal(stable.materialCost, express.materialCost); assert.equal(express.upfrontMaterial, 0); assert.equal(stable.estimatedContribution, express.estimatedContribution);
});

test('缺料未採購的排程不假造交貨，停機及 90 天上限都安全', () => {
  const w = createManufacturing(); order(w, { qty: 200, due: 20 });
  assert.equal(manufacturingSchedule(w)[0].finishDay, null); assert.ok(manufacturingSchedule(w, { includePurchase: true })[0].finishDay >= SUPPLIERS.stable.lead);
  w.maintenanceUntil = 1000; const p = manufacturingOrderPreview(w, w.offers[0]); assert.equal(p.finishDay, null); assert.equal(p.slackDays, null); assert.equal(p.estimatedLateFee, null);
  assert.equal(manufacturingOrderPreview(w, w.offers[0], { productionMode: 'constructor' }), null);
});

test('新生產／合約／驗收欄位嚴格驗證，無效操作原子拒絕', () => {
  const w = createManufacturing();
  for (const [name, data] of [['productionMode', { id: 'constructor' }], ['productionMode', { id: null }], ['productionMode', { id: { toString: 'invalid' } }], ['settings', settings(w, 'unknown')], ['settings', { ...settings(w, 'balanced'), supplier: 'constructor' }]]) {
    const snapshot = JSON.stringify(w); assert.equal(action(w, name, data).ok, false); assert.equal(JSON.stringify(w), snapshot);
  }
  for (const change of [x => x.productionMode = 'constructor', x => x.productionMode = { toString: 'invalid' }, x => x.productId = 'constructor', x => x.supplier = 'constructor', x => x.offers[0].profile = 'unknown', x => x.offers[0].depositRate = .35, x => x.offers[0].term = 15]) {
    const bad = copy(w); change(bad); assert.equal(manufacturingValid(bad), false); assert.throws(() => copy(bad));
  }
  const o = order(w, { profile: 'precision', qty: 100 });
  for (const change of [x => x.orders[0].attempted = -1, x => { x.orders[0].attempted = 100; x.orders[0].scrapped = 5; }, x => x.orders[0].inspectionReady = 100, x => x.orders[0].profile = 'constructor']) {
    const bad = copy(w); change(bad); assert.equal(manufacturingValid(bad), false);
  }
  assert.equal(o.produced, 0);
});

test('過期詢價不耗種子、不收訂金；12 張在製上限沿用', () => {
  const w = createManufacturing(), offer = w.offers[0]; offer.expires = 0;
  const old = JSON.stringify(w); assert.equal(action(w, 'bid', { id: offer.id, factor: 1 }).ok, false); assert.equal(JSON.stringify(w), old);
  offer.expires = 7; for (let i = 0; i < 12; i++) order(w, { qty: 10 });
  const capped = JSON.stringify(w); assert.equal(action(w, 'bid', { id: offer.id, factor: .9 }).ok, false); assert.equal(JSON.stringify(w), capped); assert.ok(manufacturingValid(w));
});

for (const productId of Object.keys(PRODUCTS)) test(`${productId} 三種生產方式跨月與尾款後帳務守恆、存檔續玩一致`, () => {
  for (const productionMode of Object.keys(PRODUCTION_MODES)) {
    const w = createManufacturing(productId, 382); action(w, 'productionMode', { id: productionMode });
    for (const profile of ['bulk', 'rush', 'precision']) order(w, { profile, qty: PRODUCTS[productId].capacity, due: 20 });
    stock(w, PRODUCTS[productId].capacity * 10); for (let day = 0; day < 4; day++) step(w);
    const restored = copy(w); for (let day = 0; day < 70; day++) { step(w); step(restored); }
    assert.deepEqual(w, restored); assert.equal(w.stats.delivered, 3); assert.equal(w.receivables.length, 0); assert.ok(report(w).totals.revenue > 0); assert.ok(manufacturingValid(w)); cashChecks(w);
  }
});
