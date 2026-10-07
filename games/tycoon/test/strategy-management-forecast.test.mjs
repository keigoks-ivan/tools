import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../sim.js';
import { customerFit, strategyEffects } from '../strategy.js';
import { encodeSave, decodeSave } from '../saves.js';
const fx = JSON.parse(readFileSync(new URL('./fixtures/city-market.json', import.meta.url)));
const fresh = () => S.createWorld({ mapData: fx.map, distances: fx.dist, seed: 20261007, noRivals: true, multiBusiness: true });
function open(w, id = 'tea', ownerWorks = false) {
  w.companies.player.cash = 20000000;
  const r = S.openShop(w, w.lots.find((l) => !l.shopId).id, { businessId: id, ownerWorks }); assert.ok(r.ok);
  const s = w.shops.find((s) => s.id === r.shopId); s.status = 'open'; s.openedT = w.t; return s;
}
const run = (w, hours) => { for (let n = 0; n < hours; n++) S.stepHour(w); };
const normal = (s) => Object.keys(s.prices).map((k) => [k, 1]);

test('舊存檔預設定位、組合、委任維持原品質、混合比例及帳目', () => {
  const w = fresh(), s = open(w); delete s.strategy; delete s.manager;
  const before = { mix: [...s.mix], quality: s.quality, cash: w.companies.player.cash, pnl: S.getReport(w).current };
  const loaded = decodeSave(encodeSave(w, {})).world; S._internals.recalcShop(loaded, loaded.shops[0]);
  assert.deepEqual(loaded.shops[0].mix, before.mix); assert.equal(loaded.shops[0].quality, before.quality);
  assert.equal(loaded.companies.player.cash, before.cash); assert.deepEqual(S.getReport(loaded).current, before.pnl);
  assert.equal(S.getShops(loaded, 'player')[0].strategy.profile, 'balanced'); assert.equal(S.getShops(loaded, 'player')[0].manager.tier, 'none');
});

test('定位有客群、所得、品質、速度與費用取捨；預設中立', () => {
  const w = fresh(), s = open(w), q = s.quality;
  assert.equal(customerFit(s, '學校', 1), 1); assert.equal(strategyEffects(s).speed, 1);
  S.setStrategy(w, s.id, { profile: 'value' }); assert.equal(s.quality, q - 2);
  assert.ok(customerFit(s, '學校', 1) > customerFit(s, '商圈', 1)); assert.ok(customerFit(s, '學校', 0.8) > customerFit(s, '學校', 1.3));
  assert.ok(strategyEffects(s).speed > 1); assert.ok(strategyEffects(s).monthly > 0);
  S.setStrategy(w, s.id, { profile: 'premium' }); assert.equal(s.quality, q + 6);
  assert.ok(customerFit(s, '商圈', 1.3) > customerFit(s, '商圈', 0.8)); assert.ok(strategyEffects(s).speed < 1);
});

test('組合停售／主推影響成交品項與複雜度；非法設定原子拒絕', () => {
  const w = fresh(), s = open(w), keys = Object.keys(s.prices), before = S.serialize(w);
  assert.equal(S.setStrategy(w, s.id, { weights: Object.fromEntries(keys.map((k) => [k, 0])) }).ok, false); assert.equal(S.serialize(w), before);
  assert.equal(S.setStrategy(w, s.id, { weights: { unknown: 2 } }).ok, false); assert.equal(S.serialize(w), before);
  const weights = Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 3 : 0])); assert.ok(S.setStrategy(w, s.id, { weights }).ok);
  assert.equal(s.mix[0], 1); assert.equal(s.mix.reduce((a, n) => a + n, 0), 1); assert.equal(strategyEffects(s).monthly, 2400);
  run(w, 24); const items = w.companies.player.cm.items;
  for (const k of keys.slice(1)) assert.equal(items[k]?.cups || 0, 0);
});

for (const id of ['bento', 'bakery']) test(`${id} 已付備料不能透過換組合變成更貴的商品；讀檔及下批生效`, () => {
  const w = fresh(), s = open(w, id), keys = Object.keys(s.prices);
  S.setStrategy(w, s.id, { weights: Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 1 : 0])) });
  run(w, 11); const original = structuredClone(s.stock), oldCash = w.companies.player.cash;
  assert.ok(S.setStrategy(w, s.id, { weights: Object.fromEntries(keys.map((k, i) => [k, i === keys.length - 1 ? 1 : 0])) }).pendingBatch);
  assert.deepEqual(s.mix, original.mix); assert.equal(s.stock.value, original.value); assert.equal(w.companies.player.cash, oldCash);
  const loaded = decodeSave(encodeSave(w, {})).world; assert.deepEqual(loaded.shops[0].mix, original.mix);
  run(w, 24); run(loaded, 24); assert.equal(s.mix.at(-1), 1); assert.equal(s.stock.day, 1); assert.equal(S.serialize(w), S.serialize(loaded));
});

test('店長招募先付現一次、定期費用按天；定位和委任費均可對回月報與結案', () => {
  const w = fresh(), s = open(w), cash = w.companies.player.cash;
  S.setStrategy(w, s.id, { profile: 'premium' }); S.setManager(w, s.id, { tier: 'assistant', staffing: false, purchasing: false });
  assert.equal(w.companies.player.cash, cash - 12000); S.setManager(w, s.id, { goal: 'service' }); assert.equal(w.companies.player.cash, cash - 12000);
  run(w, 24); const p = S.getShopHistory(w, s.id).mtdPnL; assert.equal(p.managerCost, Math.floor(18000 / 31)); assert.equal(p.strategyCost, Math.floor(6000 / 31));
  assert.equal(S.getShopAnalysis(w, s.id).managerMonthly, 18000); assert.equal(S.getMonthlyReport(w).current.managerCost, p.managerCost);
  const before = w.companies.player.cash; S._internals.settleMonth(w, S.dateOf(0));
  const row = S.getMonthlyReport(w).financials[0]; assert.equal(row.managerCost, p.managerCost); assert.equal(row.strategyCost, p.strategyCost);
  assert.equal(S.getFinalReport(w).totals.managerCost, p.managerCost); assert.ok(w.companies.player.cash < before);
});

test('委任排班每週最多改一人，尊重開關及老闆已占一人；不代改價格', () => {
  const w = fresh(), s = open(w, 'tea', true); s.staff = [4, 4, 4];
  s.days = Array.from({ length: 7 }, () => ({ cups: 12, walk: 12, del: 0, lost: 0 })); s.hourEMA.fill(1);
  S.setManager(w, s.id, { tier: 'assistant', purchasing: false }); const prices = { ...s.prices };
  run(w, 1); assert.deepEqual(s.staff, [3, 3, 3]); assert.deepEqual(s.prices, prices);
  run(w, 24); assert.deepEqual(s.staff, [3, 3, 3]);
  S.setManager(w, s.id, { staffing: false }); run(w, 7 * 24); assert.deepEqual(s.staff, [3, 3, 3]);
  const loaded = decodeSave(encodeSave(w, {})).world; assert.deepEqual(loaded.shops[0].manager, s.manager);
});

test('委任補貨保留品牌固定支出；手動補貨可使用保留資金', () => {
  const w = fresh(), s = open(w, 'convenience'); s.inv = 0; w.companies.player.cash = 50000;
  S.setManager(w, s.id, { tier: 'assistant', staffing: false, reserveMonths: 1 }); const cash = w.companies.player.cash;
  run(w, 1); assert.equal(s.inv, 0); assert.equal(w.companies.player.cash, cash);
  assert.ok(S.restockShop(w, s.id).ok); assert.equal(s.inv, cash); assert.equal(w.companies.player.cash, 0);
});

test('委任不會偷偷打開零售自動補貨或其他未委任操作', () => {
  const w = fresh(), s = open(w, 'convenience'); S.setOperations(w, s.id, { autoStock: false });
  s.days = Array.from({ length: 7 }, () => ({ cups: 500, walk: 500, del: 0, lost: 0 }));
  S.setManager(w, s.id, { tier: 'experienced', staffing: false }); run(w, 1);
  assert.equal(s.operations.autoStock, false); assert.deepEqual(s.staff, S.BUSINESSES.convenience.staff);
});

test('缺現金時仍可解除委任；零成本調整不被現金門檻擋住', () => {
  const w = fresh(), s = open(w); S.setManager(w, s.id, { tier: 'assistant' }); w.companies.player.cash = -100;
  assert.ok(S.setManager(w, s.id, { staffing: false }).ok); assert.ok(S.setManager(w, s.id, { tier: 'none' }).ok);
  assert.equal(w.companies.player.cash, -100); assert.equal(S.getShopAnalysis(w, s.id).managerMonthly, 0);
});

test('午夜不把前一日批次當成今天；鮮食原料等級也從下批生效', () => {
  const w = fresh(), s = open(w, 'bento'); run(w, 11); const q = s.quality;
  S.setGrade(w, s.id, '講究'); assert.equal(s.quality, q);
  run(w, 13); const weights = Object.fromEntries(Object.keys(s.prices).map((k, i) => [k, i === 0 ? 1 : 0]));
  assert.equal(S.setStrategy(w, s.id, { weights }).pendingBatch, false); assert.equal(s.mix[0], 1); assert.ok(s.quality > q);
});

test('低速定位造成的排隊不誤列成缺貨流失', () => {
  const w = fresh(), s = open(w, 'convenience'); s.inv = 1000000; s.staff = [1, 1, 1];
  w.companies.player.awareness = 1; s.F.fill(1); w.cal.r = 10; w.cal.c = 10;
  S.setStrategy(w, s.id, { profile: 'premium' }); run(w, 24);
  assert.ok(s.mtd.lost > 0); assert.ok(s.inv > 500000); assert.equal(s.mtd.stockLost, 0);
});

test('已付商品庫存只占起始現金，不再作進貨；關閉自動補貨不憑空得到商品', () => {
  const w = fresh(), s = open(w, 'convenience'); S.setOperations(w, s.id, { autoStock: false }); s.inv = 100000;
  const f = S.getCashForecast(w); assert.equal(f.base.rows.reduce((a, r) => a + r.purchases, 0), 0);
  assert.ok(f.base.rows[0].receipts > 0); assert.equal(f.base.rows.at(-1).receipts, 0);
});

test('零成交的薪資、租金、定位、委任及年調薪現金預測與真實月结對帳', () => {
  const w = fresh(), s = open(w); w.cal.r = 0; w.cal.r_del = 0; w.sched = {};
  S.setStrategy(w, s.id, { profile: 'premium' }); S.setManager(w, s.id, { tier: 'assistant', staffing: false, purchasing: false });
  run(w, 17 * 24); const f = S.getCashForecast(w); let ix = 0;
  while (ix < f.base.rows.length) {
    const rows = w.companies.player.rows.length; S.stepHour(w);
    if (w.companies.player.rows.length > rows) { assert.ok(Math.abs(w.companies.player.cash - f.base.rows[ix].endCash) <= 2, `${f.base.rows[ix].ym}: ${w.companies.player.cash} vs ${f.base.rows[ix].endCash}`); ix++; }
  }
});

test('快進停在月初 00:00 時，預測先結上月帳；不混用兩個月份天數', () => {
  const w = fresh(); open(w); w.cal.r = 0; w.cal.r_del = 0; w.sched = {};
  run(w, 31 * 24); assert.equal(w.day.m, 10); assert.equal(S.clockOf(w).month, 11);
  const before = S.serialize(w), f = S.getCashForecast(w); assert.equal(S.serialize(w), before);
  run(w, 30 * 24 + 1);
  assert.ok(Math.abs(w.companies.player.cash - f.base.rows[0].endCash) <= 2);
  assert.equal(f.base.rows[0].ym, '2026-11');
});

test('現金預測純查詢、六個月連續收付；近期獲利店壓力情境餘額較低', () => {
  const w = fresh(), s = open(w, 'convenience'); run(w, 14 * 24); const before = S.serialize(w);
  const f = S.getCashForecast(w); assert.equal(S.serialize(w), before); assert.equal(f.base.rows.length, 6);
  assert.ok(f.stress.endCash < f.base.endCash); assert.deepEqual(S.getCashForecast(w), f);
  for (const r of f.base.rows) assert.ok(Math.abs(r.startCash + r.receipts + r.recoveries - r.purchases - r.operatingPayments - r.tax - r.interest - r.principal - r.deposits - r.endCash) < 5);
  assert.equal(f.base.rows[0].partial, true); assert.ok(f.sampleDays.some((x) => x.shopId === s.id && x.days === 14));
});

test('無門店的貸款本金／利息預測與六個月真實攤還一致，已還本金不再扣', () => {
  const w = fresh(); S.takeLoan(w, 'start', 200000); S.repayLoan(w, w.companies.player.loans[0].id, 100000);
  const f = S.getCashForecast(w), projected = f.base.rows.reduce((a, r) => a + r.principal + r.interest, 0);
  const before = w.companies.player.cash;
  while (S.dateOf(Math.floor(w.t / 24)).m !== 4) S.stepHour(w); S.stepHour(w);
  assert.equal(before - w.companies.player.cash, projected); assert.equal(w.companies.player.cash, f.base.endCash);
});

test('裝修只有租金、開張後才有營業和委任費；已付押金不重扣', () => {
  const w = fresh(), s = open(w, 'fitness'); s.status = 'renovating'; s.openAtT = 90 * 24;
  S.setManager(w, s.id, { tier: 'assistant' }); const f = S.getCashForecast(w);
  assert.equal(f.base.rows[0].receipts, 0); assert.equal(f.base.rows[1].receipts, 0);
  assert.equal(f.base.rows[0].deposits, 0); assert.equal(f.base.rows[0].operatingPayments, s.rent);
});

test('已選退租投影到期停止交易並回收押金設備；已簽续租不再補押金', () => {
  const w = fresh(), s = open(w, 'convenience'); s.lease.endT = 10 * 24; s.lease.noticeAtT = 0; s.lease.plan = { key: 'C' };
  const exit = S.getCashForecast(w); assert.ok(exit.base.rows[0].recoveries >= s.deposit); assert.equal(exit.base.rows[1].receipts, 0);
  s.lease.plan = { key: 'A', rent: s.rent + 1000, deposit: (s.rent + 1000) * 2, termDays: 365 }; s.deposit = s.lease.plan.deposit;
  assert.equal(S.getCashForecast(w).base.rows[0].deposits, 0);
});

test('實戰檢視把降價需要的交易增幅、老闆工時與資金餘額量化', () => {
  const w = fresh(), s = open(w, 'convenience', true); run(w, 10 * 24);
  const r = S.getLearningReview(w, s.id), a = S.getShopAnalysis(w, s.id);
  assert.equal(r.lessons.length, 5); assert.ok(r.ownerCost > 0); assert.ok(r.economicBreakEven > a.breakEvenWithBrandDaily);
  assert.ok(r.priceCutExtra > 0.05); assert.equal(r.sampleDays, a.sampleDays);
});

test('損壞的新定位、委任、批次資料被拒絕；結束後所有新操作不改存檔', () => {
  const w = fresh(), s = open(w); S.setManager(w, s.id, { tier: 'assistant' });
  for (const mutate of [(s) => { s.strategy.profile = 'bad'; }, (s) => { s.manager.reserveMonths = 9; }, (s) => { s.stock.mix = [NaN]; }]) {
    const x = structuredClone(w); mutate(x.shops[0]); assert.throws(() => decodeSave(encodeSave(x, {})));
  }
  w.status = 'lost'; const before = S.serialize(w);
  assert.equal(S.setManager(w, s.id, { tier: 'experienced' }).ok, false); assert.equal(S.setStrategy(w, s.id, { profile: 'premium' }).ok, false);
  assert.equal(S.getCashForecast(w), null); assert.equal(S.serialize(w), before);
});

for (const id of Object.keys(S.BUSINESSES)) test(`${id} 新定位／混合組合／委任跨月和存讀檔皆有限且帳目對帳`, () => {
  const w = fresh(), s = open(w, id); S.setStrategy(w, s.id, { profile: 'premium', weights: Object.fromEntries(normal(s).map(([k, v], i) => [k, i === 0 ? 2 : v])) });
  S.setManager(w, s.id, { tier: 'experienced', reserveMonths: 1 }); run(w, 32 * 24);
  const loaded = decodeSave(encodeSave(w, {})).world, current = S.getMonthlyReport(w, s.id).current, brand = S.getMonthlyReport(w).current;
  assert.equal(S.serialize(loaded), S.serialize(w)); assert.ok(Number.isFinite(brand.netProfit)); assert.ok(s.inv >= 0); assert.ok(s.mix.every(Number.isFinite));
  assert.equal(brand.profit, current.profit); assert.equal(brand.managerCost, current.managerCost);
  const f = S.getCashForecast(w); assert.ok(Number.isFinite(f.base.endCash)); assert.ok(f.base.rows.every((r) => Object.values(r).every((v) => typeof v !== 'number' || Number.isFinite(v))));
});
