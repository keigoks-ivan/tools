import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../sim.js';
import { hourlyCapacity } from '../businesses.js';
import { FIXTURE, runDays } from './scenario.mjs';
import { caseReportDocument } from '../case-report.js';

function setup(id, cal) {
  const w = S.createWorld({ mapData: FIXTURE.map, distances: FIXTURE.dist, noRivals: true, multiBusiness: true, seed: 20261001, cal });
  w.companies.player.cash = 20000000; w.companies.player.awareness = 0.6;
  const lot = w.lots.filter((l) => l.zone === '住宅').sort((a, b) => a.rent - b.rent)[0];
  const result = S.openShop(w, lot.id, { businessId: id, ownerWorks: true });
  assert.equal(result.ok, true);
  const shop = w.shops.find((s) => s.id === result.shopId);
  shop.openAtT = 0;
  return { w, shop, co: w.companies.player, lot };
}

test('六業態都有獨立開店投入、產品、單位與損平分析，沒有資金或未知業態不會扣款', () => {
  assert.equal(Object.keys(S.BUSINESSES).length, 6);
  for (const id of Object.keys(S.BUSINESSES)) {
    const { w, shop, lot } = setup(id), b = S.businessOf(id);
    assert.equal(S.lotOpenCost(lot, id), b.renovation + b.equipment + b.firstStock + lot.deposit);
    assert.deepEqual(Object.keys(shop.prices), Object.keys(b.items));
    runDays(w, 8);
    const a = S.getShopAnalysis(w, shop.id);
    assert.equal(a.unit, b.unit); assert.ok(a.fixedMonthly > 0); assert.ok(Number.isFinite(a.pnl.profit));
    assert.ok(S.getReport(w).products.every((p) => p.businessId === id));
    assert.ok(S.getReport(w).market.sectors.some((s) => s.businessId === id));
    const spare = w.lots.find((l) => !l.shopId), est = S.getExpansionEstimate(w, spare.id, { businessId: id });
    assert.ok(Number.isFinite(est.incrementalProfit)); assert.equal(est.unit, b.unit);
    w.companies.player.cash = 0;
    const before = S.serialize(w);
    assert.equal(S.openShop(w, spare.id, { businessId: id }).ok, false);
    assert.equal(S.openShop(w, spare.id, { businessId: 'missing' }).ok, false);
    assert.equal(S.serialize(w), before);
  }
});

test('不同業態需求分開；加入髮廊不會把飲料客人分走，同業態仍有互搶客源', () => {
  const { w, shop, co } = setup('tea'), clone = S.deserialize(S.serialize(w));
  const lot = clone.lots.find((l) => !l.shopId);
  const extra = S.openShop(clone, lot.id, { businessId: 'salon' });
  clone.shops.find((s) => s.id === extra.shopId).openAtT = 0;
  runDays(w, 7); runDays(clone, 7);
  assert.deepEqual(shop.days, clone.shops.find((s) => s.id === shop.id).days);
  const same = S.getExpansionEstimate(w, lot.id, { businessId: 'tea' });
  const other = S.getExpansionEstimate(w, lot.id, { businessId: 'salon' });
  assert.ok(same.lostDaily > 0); assert.equal(other.lostDaily, 0);
  assert.equal(co.day30.reduce((a, n) => a + n, 0), shop.tot.walk + shop.tot.del);
});

test('便當與烘焙備貨先付款，未售全數報廢，月結不會重複扣同一批原料', () => {
  for (const id of ['bento', 'bakery']) {
    const { w, shop, co } = setup(id, { r: 0, r_del: 0 });
    S.setOperations(w, shop.id, { prep: 600 }); shop.inv = 0;
    runDays(w, 31); S.stepHour(w);
    const cash = co.cash;
    runDays(w, 30); S.stepHour(w);
    const row = S.getReport(w).financials.at(-1);
    assert.equal(row.ym, '2026-11'); assert.equal(row.cogs, 0); assert.ok(row.waste > 500000);
    assert.equal(co.cash - cash, row.netProfit);
    const history = shop.history.at(-1);
    assert.equal(history.prepared, 30 * 600); assert.equal(history.unsold, 30 * 600);
    assert.equal(S.getReport(w).products.reduce((a, p) => a + p.directCost, 0), co.rows.reduce((a, r) => a + shop.history.find((h) => h.ym === r.ym).waste, 0));
  }
});

test('生鮮售罄會失去訂單；晚間折扣與備貨設定有效，既有批次不會被設定回填', () => {
  const { w, shop } = setup('bento', { r: 0.5, r_del: 0.08 });
  assert.equal(S.setOperations(w, shop.id, { prep: 40, markdown: 30 }).ok, true);
  for (let i = 0; i < 12; i++) S.stepHour(w);
  assert.equal(shop.stock.prepared, 40);
  S.setOperations(w, shop.id, { prep: 200 });
  assert.equal(shop.stock.prepared, 40);
  for (let i = 12; i < 24; i++) S.stepHour(w);
  assert.ok(shop.today.walk + shop.today.del <= 40); assert.ok(shop.today.stockLost > 0);
  assert.equal(shop.Bw + shop.Bd, 0);
  assert.equal(S.setOperations(w, shop.id, { prep: 41 }).ok, false);
  assert.equal(S.setOperations(w, shop.id, { mode: 'dinein' }).ok, false);
});

test('咖啡座位與髮廊工作站會限制產能；切換模式在周轉和品質間取捨', () => {
  const cafe = setup('cafe'); cafe.shop.staff = [6, 6, 6];
  S.setOperations(cafe.w, cafe.shop.id, { mode: 'dinein' });
  const dine = hourlyCapacity(cafe.shop, 6, 1), quality = cafe.shop.quality;
  S.setOperations(cafe.w, cafe.shop.id, { mode: 'takeaway' });
  assert.ok(hourlyCapacity(cafe.shop, 6, 1) > dine); assert.ok(cafe.shop.quality < quality);
  const salon = setup('salon'); salon.shop.operations.stations = 2;
  S.setOperations(salon.w, salon.shop.id, { service: 'premium' });
  const premium = hourlyCapacity(salon.shop, 6, 1), pq = salon.shop.quality;
  S.setOperations(salon.w, salon.shop.id, { service: 'quick' });
  assert.ok(hourlyCapacity(salon.shop, 6, 1) > premium); assert.ok(salon.shop.quality < pq);
  assert.equal(hourlyCapacity(salon.shop, 6, 1), hourlyCapacity(salon.shop, 2, 1));
  S.setStaffing(salon.w, salon.shop.id, [2, 2, 2]); runDays(salon.w, 2);
  assert.equal(S.getShopAnalysis(salon.w, salon.shop.id).monthlyWage, Math.round(12 * salon.w.wages.market * 1.5 * (1 + S.V.labor.employerPct / 100) * 31));
});

test('便利商店貨款、庫存與月帳對得上，手動與自動補貨都受現金約束', () => {
  const { w, shop, co } = setup('convenience');
  S.setOperations(w, shop.id, { stockTarget: 200000 });
  runDays(w, 31); S.stepHour(w);
  const cash = co.cash, inv = shop.inv;
  runDays(w, 30); S.stepHour(w);
  const row = S.getReport(w).financials.at(-1);
  assert.ok(row.stockPurchases > 0); assert.equal(co.cash - cash, row.netProfit + inv - shop.inv);
  S.setOperations(w, shop.id, { autoStock: false }); shop.inv = 0; co.cash = 1234;
  assert.equal(S.restockShop(w, shop.id).cost, 1234); assert.equal(co.cash, 0); assert.equal(shop.inv, 1234);
  shop.inv = 0; runDays(w, 1);
  assert.equal(shop.today.walk + shop.today.del, 0); assert.ok(shop.mtd.stockLost > 0);
});

test('髮廊與便利商店不使用食品後勤，鮮奶漲價不會寫入其他業態菜單', () => {
  for (const id of ['salon', 'convenience']) {
    const { w, shop, co } = setup(id);
    const exp = co.expansion;
    exp.facilities.factory.status = 'ready'; exp.facilities.factory.active = true;
    exp.facilities.warehouse.status = 'ready'; exp.facilities.warehouse.active = true;
    exp.facilities.warehouse.auto = false; exp.facilities.warehouse.stockCost = 94000; exp.facilities.warehouse.stockValue = 100000;
    runDays(w, 2);
    assert.equal(co.cm.factoryCups, 0); assert.equal(co.cm.warehouseSavings, 0);
    assert.equal(exp.facilities.warehouse.stockValue, 100000);
    const e = { id: 'milk-test', kind: 'milk', status: 'pending', choices: [{ key: 'A', label: '漲價' }], data: {} };
    w.events.list.push(e); S.respondEvent(w, e.id, 'A');
    assert.ok(!('鮮奶茶' in shop.prices)); assert.ok(Object.values(shop.prices).every(Number.isFinite));
  }
});

test('同業態共用口碑，跨業態不共用；混合市場使用營收，結案列出各業態與單位', () => {
  const { w, shop, co } = setup('tea');
  const r = S.openShop(w, w.lots.find((l) => !l.shopId).id, { businessId: 'salon' });
  const salon = w.shops.find((s) => s.id === r.shopId); salon.openAtT = 0; salon.revCnt = 500; salon.revSum = 500;
  assert.equal(S._internals.chainStarOf(w, shop), S._internals.starOf(shop));
  runDays(w, 35);
  co.day30 = [999999]; co.revenue30 = [100];
  w.companies.example = { day30: [1], revenue30: [300] };
  assert.equal(S.marketShare30(w).player, 0.25); delete w.companies.example;
  const report = S.getFinalReport(w), doc = caseReportDocument(report);
  assert.deepEqual(report.businesses.map((b) => b.id).sort(), ['salon', 'tea']);
  assert.match(doc, /人次/); assert.match(doc, /各業態的結果/);
  const loaded = S.deserialize(S.serialize(w));
  assert.deepEqual(loaded.shops.map((s) => s.operations), w.shops.map((s) => s.operations));
  assert.equal(S.getFinalReport(loaded).totals.netProfit, report.totals.netProfit);
});

test('月結快進目標包含下月結算，跨年與手動逐小時推進有相同月帳', () => {
  const { w } = setup('bakery'), clone = S.deserialize(S.serialize(w));
  const target = S.fastForwardTarget(w, 'month');
  assert.equal(target, 31 * 24 + 1);
  while (w.t < target) S.stepHour(w);
  runDays(clone, 31); S.stepHour(clone);
  assert.equal(S.serialize(w), S.serialize(clone));
  assert.equal(w.companies.player.rows.length, 1);
  assert.equal(S.fastForwardTarget(w, 'week'), w.t + 168);
  runDays(w, 60); S.stepHour(w);
  const next = S.fastForwardTarget(w, 'month');
  while (w.t < next) S.stepHour(w);
  assert.equal(S.clockOf(w).year, 2027); assert.equal(w.companies.player.rows.at(-1).ym, '2026-12');
});

test('關店剩餘存貨列入損失，便利商店五折回收，預付存貨不重複扣現金', () => {
  for (const id of ['tea', 'bento', 'convenience', 'salon']) {
    const { w, shop, co } = setup(id), inventory = shop.inv, cash = co.cash;
    const result = S.closeShop(w, shop.id), recovery = id === 'convenience' ? Math.floor(inventory * 0.5) : 0;
    const history = shop.history.at(-1);
    assert.equal(result.stockRecovery, recovery);
    assert.equal(history.waste, inventory - recovery);
    assert.equal(co.cash - cash, result.refund + result.equipment + recovery - history.rent);
    assert.equal(shop.inv, 0);
    assert.equal(S.getFinalReport(w).totals.waste, inventory - recovery);
  }
});

test('新局每個業態都有既有競爭者，競爭者會調整供給與排班', () => {
  const w = S.createWorld({ mapData: FIXTURE.map, distances: FIXTURE.dist, multiBusiness: true, seed: 20261001 });
  for (const id of Object.keys(S.BUSINESSES)) assert.ok(w.shops.some((s) => s.owner === 'rival' && s.businessId === id));
  const bento = w.shops.find((s) => s.businessId === 'bento'), original = bento.operations.prep;
  runDays(w, 95);
  assert.notEqual(bento.operations.prep, original);
  const salon = w.shops.find((s) => s.businessId === 'salon');
  assert.ok(salon.staff.every((n) => n <= salon.operations.stations));
  assert.ok(Object.values(w.companies).every((co) => Number.isFinite(co.cash)));
  assert.ok(w.shops.every((s) => Object.values(s.prices).every(Number.isFinite)));
});

test('舊飲料存檔補齊業態欄位並保留原設定，仍可新增其他常見業態', () => {
  const { w, shop } = setup('tea');
  delete w.multiBusiness; delete shop.businessId; delete shop.operations; delete shop.stock;
  delete w.companies.player.revenue30;
  const cash = w.companies.player.cash, prices = { ...shop.prices };
  const loaded = S.deserialize(S.serialize(w)), restored = loaded.shops[0];
  assert.equal(restored.businessId, 'tea'); assert.deepEqual(restored.prices, prices); assert.equal(loaded.companies.player.cash, cash);
  assert.ok(S.openShop(loaded, loaded.lots.find((l) => !l.shopId).id, { businessId: 'cafe' }).ok);
  assert.equal(loaded.multiBusiness, true); runDays(loaded, 2);
  assert.ok(S.getReport(loaded).analysis.every((s) => Number.isFinite(s.pnl.profit)));
});
