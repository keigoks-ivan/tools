import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, contractProfiles, createManufacturing, manufacturingQueue, manufacturingSchedule, manufacturingOrderPreview, manufacturingAction as action, stepManufacturing as step, manufacturingValid, productionPlan } from '../manufacturing.js';
import { END_DAY, receive, spend, cashIdentity } from '../venture-core.js';
import { encodeVenture, decodeVenture } from '../venture-saves.js';

const copy = w => decodeVenture(encodeVenture(w), 'manufacturing').world;
const ids = a => a.map(o => o.id);
function order(w, { qty = 100, due = 20, profile, produced = 0, inspectionReady } = {}) {
  const terms = profile ? contractProfiles(w.productId)[profile] : { term: 30, depositRate: .25 };
  const price = PRODUCTS[w.productId].price, quote = price * qty, deposit = Math.round(quote * terms.depositRate);
  const o = { id: 'schedule-' + w.seq++, client: '排程客戶', qty, due, price, term: terms.term, expires: 7, depositRate: terms.depositRate, quote, deposit, produced, cost: 0, attempted: produced, scrapped: 0, ...(profile ? { profile } : {}), ...(inspectionReady === undefined ? {} : { inspectionReady }) };
  w.orders.push(o); receive(w, deposit); return o;
}
function stock(w, qty, defects = 0, unitCost = PRODUCTS[w.productId].material) {
  const value = qty * unitCost; spend(w, value, 'purchases'); w.stock = { qty, value, defects };
}
function checks(w) {
  assert.ok(manufacturingValid(w)); assert.ok(Math.abs(cashIdentity(w.co.ledger, w.co.cash)) < .001);
  for (const row of w.co.history) assert.ok(Math.abs(cashIdentity(row, row.cashEnd)) < .001);
  assert.deepEqual(copy(w), w);
}

test('自動排程按剩餘交期排序、同日穩定，且保留原參照與純度', () => {
  const w = createManufacturing(), later = order(w, { due: 30 }), early = order(w, { due: 5 }), tied = order(w, { due: 5 });
  const offer = { ...w.offers[1], due: 5 }, before = JSON.stringify(w), queue = manufacturingQueue(w, { offer });
  assert.equal(w.scheduleMode, 'due'); assert.deepEqual(ids(queue), [early.id, tied.id, offer.id, later.id]);
  assert.equal(queue[0], early); assert.equal(queue[2], offer); assert.notEqual(queue, w.orders);
  assert.equal(JSON.stringify(w), before); assert.deepEqual(manufacturingQueue(w, { offer }), queue);
  assert.equal(manufacturingQueue(w, { offer: early }).length, 3);
  Object.freeze(w.orders); assert.deepEqual(ids(manufacturingQueue(w)), [early.id, tied.id, later.id]);
});

test('舊存檔未含排程政策仍可讀，預設交期排序且預覽不插入欄位', () => {
  const w = createManufacturing(); delete w.scheduleMode;
  const later = order(w, { due: 30 }), earlier = order(w, { due: 3 }); stock(w, 1000);
  const restored = copy(w), before = JSON.stringify(restored);
  assert.deepEqual(ids(manufacturingQueue(restored)), [earlier.id, later.id]); manufacturingOrderPreview(restored, restored.orders[0]);
  assert.equal(JSON.stringify(restored), before); assert.equal(Object.hasOwn(restored, 'scheduleMode'), false);
  const explicit = copy(restored); explicit.scheduleMode = 'due'; step(restored); step(explicit);
  assert.deepEqual(restored.co, explicit.co); assert.deepEqual(restored.stats, explicit.stats); assert.equal(restored.rng, explicit.rng); checks(restored);
});

test('手動移到最前會關閉自動排程，重新啟用交期排序即可恢復', () => {
  const w = createManufacturing(), later = order(w, { due: 30 }), early = order(w, { due: 2 });
  assert.ok(action(w, 'scheduling', { mode: 'due' }).ok); assert.deepEqual(ids(w.orders), [early.id, later.id]);
  assert.ok(action(w, 'priority', { id: later.id }).ok); assert.equal(w.scheduleMode, 'manual'); assert.deepEqual(ids(w.orders), [later.id, early.id]);
  assert.deepEqual(ids(manufacturingQueue(w)), ids(w.orders));
  assert.ok(action(w, 'scheduling', { mode: 'due' }).ok); assert.deepEqual(ids(w.orders), [early.id, later.id]);
  assert.ok(action(w, 'scheduling', { mode: 'manual' }).ok); assert.deepEqual(ids(w.orders), [early.id, later.id]); checks(w);
});

test('政策操作不抽種子、不改現金負債帳務，無效模式與訂單原子拒絕', () => {
  const w = createManufacturing(); order(w); const cash = w.co.cash, debt = w.co.debt, rng = w.rng, ledger = JSON.stringify(w.co.ledger);
  action(w, 'scheduling', { mode: 'manual' }); action(w, 'scheduling', { mode: 'due' });
  assert.equal(w.co.cash, cash); assert.equal(w.co.debt, debt); assert.equal(w.rng, rng); assert.equal(JSON.stringify(w.co.ledger), ledger);
  for (const data of [{}, { mode: null }, { mode: 'constructor' }, { mode: 1 }, { mode: {} }]) {
    const before = JSON.stringify(w); assert.equal(action(w, 'scheduling', data).ok, false); assert.equal(JSON.stringify(w), before);
  }
  const before = JSON.stringify(w); assert.equal(action(w, 'priority', { id: 'missing' }).ok, false); assert.equal(JSON.stringify(w), before);
  w.status = 'finished'; const closed = JSON.stringify(w); assert.equal(action(w, 'scheduling', { mode: 'manual' }).ok, false); assert.equal(JSON.stringify(w), closed);
});

for (const mode of ['due', 'manual']) test(`${mode} 存檔政策保存與嚴格驗證`, () => {
  const w = createManufacturing(); order(w); action(w, 'scheduling', { mode }); checks(w);
  for (const value of [null, '', 'constructor', 1, {}]) {
    const bad = copy(w); bad.scheduleMode = value; assert.equal(manufacturingValid(bad), false); assert.throws(() => copy(bad));
  }
});

test('新得標急單自动排在長單之前，手動模式新單維持追加', () => {
  for (const mode of ['due', 'manual']) {
    const w = createManufacturing(), long = order(w, { profile: 'bulk', qty: 1000, due: 30 }); w.scheduleMode = mode;
    const offer = w.offers.find(o => o.profile === 'rush'); offer.due = 2; w.rng = 0;
    assert.ok(action(w, 'bid', { id: offer.id, factor: .9 }).ok); assert.equal(w.orders.length, 2);
    assert.deepEqual(ids(w.orders), mode === 'due' ? [offer.id, long.id] : [long.id, offer.id]); checks(w);
  }
});

test('候選急單預覽按真正插入位置估交期與占料，手動單才追加在後', () => {
  const w = createManufacturing(); order(w, { profile: 'bulk', qty: 1000, due: 30 }); stock(w, 110);
  const offer = { ...w.offers[1], qty: 100, due: 2 }, before = JSON.stringify(w), auto = manufacturingOrderPreview(w, offer);
  assert.equal(auto.finishDay, 0); assert.equal(auto.materialGap, 0); assert.equal(JSON.stringify(w), before);
  w.scheduleMode = 'manual'; const manual = manufacturingOrderPreview(w, offer);
  assert.ok(manual.materialGap > 1000); assert.equal(manual.finishDay, null);
  assert.deepEqual(ids(manufacturingSchedule(w, { offer })), [w.orders[0].id, offer.id]);
});

for (const productId of Object.keys(PRODUCTS)) test(`${productId} 實際先做交期短單，與明確排序的手動引擎種子／帳務一致`, () => {
  const w = createManufacturing(productId, 4), long = order(w, { qty: PRODUCTS[productId].capacity * 8, due: 30 }), rush = order(w, { qty: 1, due: 2 }); stock(w, PRODUCTS[productId].capacity * 5);
  const expected = copy(w); expected.scheduleMode = 'manual'; expected.orders.sort((a, b) => a.due - b.due);
  assert.equal(manufacturingSchedule(w)[0].id, rush.id); step(w); step(expected);
  assert.equal(w.stats.delivered, 1); assert.ok(w.orders.find(o => o.id === long.id).produced > 0);
  assert.deepEqual(w.co, expected.co); assert.deepEqual(w.today, expected.today); assert.deepEqual(w.stats, expected.stats); assert.equal(w.rng, expected.rng); checks(w);
});

test('停機、供料到貨、擴線人力與單日容量仍限制自動排程', () => {
  const w = createManufacturing(), late = order(w, { qty: 300, due: 30 }), early = order(w, { qty: 100, due: 4 });
  w.maintenanceUntil = 3; action(w, 'purchase', { qty: 600 }); w.shipments[0].arrival = 3;
  const scheduled = manufacturingSchedule(w); assert.equal(scheduled[0].id, early.id); assert.equal(scheduled[0].finishDay, 3);
  for (let i = 0; i < 3; i++) { step(w); assert.equal(w.today.produced, 0); }
  const capacity = productionPlan(w).capacity; step(w); assert.equal(w.stats.delivered, 1); assert.ok(w.orders.find(o => o.id === late.id).produced > 0);
  assert.ok(w.today.produced + w.today.defects <= capacity); checks(w);
  const limited = copy(w), expanded = copy(w); limited.workers = expanded.workers = 6; expanded.expansion = { ready: expanded.day };
  assert.ok(manufacturingSchedule(expanded)[0].finishDay <= manufacturingSchedule(limited)[0].finishDay);
});

test('過了原交期但仍在寬限內的訂單先製作，取消期限當天仍可交貨', () => {
  const w = createManufacturing('packaging', 4); w.day = 5; const later = order(w, { qty: 1000, due: 30 }), late = order(w, { profile: 'rush', qty: 1, due: 2 }); stock(w, 300);
  assert.equal(manufacturingSchedule(w)[0].finishDay, 5); step(w); assert.equal(w.stats.delivered, 1); assert.equal(w.stats.late, 1);
  assert.ok(w.orders.find(o => o.id === later.id).produced > 0); assert.equal(w.today.lateFees, Math.round(late.quote * .12)); checks(w);
});

test('已超寬限期訂單不再占料，下一步取消後有效單立即履約', () => {
  const w = createManufacturing('packaging', 4); w.day = 8; const expired = order(w, { qty: 1000, due: 0 }), live = order(w, { qty: 100, due: 30 }); stock(w, 110);
  const p = manufacturingOrderPreview(w, live); assert.equal(p.materialGap, 0); assert.equal(p.finishDay, 8); assert.equal(manufacturingOrderPreview(w, expired).requiredMaterial, 0);
  const cash = w.co.cash; step(w); assert.equal(w.orders.length, 0); assert.equal(w.stats.delivered, 1); assert.equal(w.stats.late, 1);
  assert.equal(w.co.cash, cash - expired.deposit - Math.round(expired.quote * .1)); assert.ok(w.stock.qty > 0); checks(w);
});

test('待驗收成品不耗當日产能原料；超過寬限驗收則取消，不能重收費', () => {
  const w = createManufacturing('packaging', 4); w.day = 6; const audit = order(w, { profile: 'precision', qty: 10, due: 0, produced: 10, inspectionReady: 6 }), live = order(w, { qty: 100, due: 30 }); stock(w, 110);
  assert.equal(manufacturingOrderPreview(w, audit).requiredMaterial, 0); assert.equal(manufacturingSchedule(w).find(o => o.id === live.id).finishDay, 6);
  step(w); assert.equal(w.stats.delivered, 2); assert.equal(w.today.produced, 100); checks(w);
  const last = createManufacturing('packaging', 4); last.day = 7; const o = order(last, { profile: 'precision', qty: 1, due: 0 }); stock(last, 10);
  assert.equal(manufacturingOrderPreview(last, o).finishDay, null); step(last); assert.equal(o.inspectionReady, 8); step(last);
  assert.equal(last.stats.delivered, 0); assert.equal(last.orders.length, 0); assert.equal(last.co.ledger.revenue, 0); checks(last);
});

test('試算合併今天與已逾到貨日原料，料價與良率跟實際入庫一致', () => {
  const w = createManufacturing('packaging', 4); w.day = 2; const o = order(w, { qty: 80, due: 20 }); stock(w, 100, 0, 10);
  spend(w, 2000, 'purchases'); w.shipments.push({ qty: 100, value: 2000, defects: .1, arrival: 1 });
  const before = JSON.stringify(w), preview = manufacturingOrderPreview(w, o), merged = { ...w, stock: { qty: 200, value: 3000, defects: .05 }, shipments: [] };
  assert.equal(preview.requiredMaterial, Math.ceil(80 / (1 - productionPlan(merged).defects))); assert.equal(preview.materialCost, preview.requiredMaterial * 15); assert.equal(preview.materialGap, 0); assert.equal(JSON.stringify(w), before);
  step(w); assert.equal(w.co.ledger.cogs, preview.materialCost); assert.equal(w.stock.value + w.co.ledger.cogs, 3000); checks(w);
});

test('多張僅剩一件訂單逐張保留整數耗料，採購量與排程不會合併低估', () => {
  const w = createManufacturing('packaging', 4); for (let i = 0; i < 12; i++) order(w, { qty: 1 });
  const previews = manufacturingQueue(w).map(o => manufacturingOrderPreview(w, o));
  assert.equal(previews.reduce((n, p) => n + p.requiredMaterial, 0), 24); assert.equal(previews.at(-1).materialGap, 24);
  stock(w, 13, .008); const partial = manufacturingSchedule(w); assert.equal(partial.filter(o => o.finishDay === 0).length, 6);
  stock(w, 24, .008); assert.ok(manufacturingSchedule(w).every(o => o.finishDay === 0)); step(w);
  assert.equal(w.stats.delivered, 12); assert.equal(w.stock.qty, 0); assert.equal(w.today.defects, 12); checks(w);
});

test('排程最多九十個生產日，不預估結案後交貨或精密驗收', () => {
  const capped = createManufacturing(); capped.maintenanceUntil = 90; order(capped, { qty: 1, due: 120 }); stock(capped, 10);
  assert.equal(manufacturingSchedule(capped)[0].finishDay, null);
  capped.maintenanceUntil = 89; assert.equal(manufacturingSchedule(capped)[0].finishDay, 89);
  const w = createManufacturing('packaging', 4); w.day = END_DAY - 1; const large = order(w, { qty: 2000, due: END_DAY + 20 }); stock(w, 4000);
  assert.equal(manufacturingOrderPreview(w, large).finishDay, null); step(w); assert.equal(w.status, 'finished'); assert.equal(step(w), false); checks(w);
  const last = createManufacturing('packaging', 4); last.day = END_DAY - 1; const precise = order(last, { profile: 'precision', qty: 1, due: END_DAY + 5 }); stock(last, 10);
  assert.equal(manufacturingOrderPreview(last, precise).finishDay, null); step(last); assert.equal(last.orders[0].inspectionReady, END_DAY); assert.equal(last.co.history.at(-1).revenue, 0); checks(last);
});
