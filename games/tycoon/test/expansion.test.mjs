import test from 'node:test';
import assert from 'node:assert/strict';
import { baseWorld, playerOpens, runDays, FIXTURE } from './scenario.mjs';
import * as S from '../sim.js';
import { caseReportDocument } from '../case-report.js';

const expenseKeys = ['commission', 'cogs', 'pack', 'waste', 'wage', 'rent', 'util', 'pos', 'cardFee', 'bizTax', 'adCost', 'extraExpense', 'chainCost', 'facilityCost', 'researchExpense', 'stockWriteOff', 'loanInterest', 'incomeTax'];
const nextDay = (w) => { runDays(w, 1); S.stepHour(w); };

test('開局可直接建全部設施；資金檢查、工期、取消與固定費均生效', () => {
  const w = baseWorld({ noRivals: true }), co = w.companies.player;
  for (const k of ['factory', 'lab', 'warehouse']) assert.equal(S.buildFacility(w, k).ok, true);
  assert.equal(co.cash, S.V.startup.startCash - 900000);
  assert.equal(S.buildFacility(w, 'factory').ok, false);
  assert.equal(S.getReport(w).current.facilityCapex, 900000);
  assert.equal(S.getFinalReport(w).totals.facilityCapex, 900000);
  runDays(w, 7); S.stepHour(w);
  assert.equal(co.expansion.facilities.warehouse.status, 'ready');
  assert.equal(co.expansion.facilities.lab.status, 'building');
  const before = co.cash;
  assert.equal(S.closeFacility(w, 'lab').refund, 90000);
  assert.equal(co.cash, before + 90000);
  runDays(w, 24);
  const r = S.getReport(w).financials[0];
  assert.ok(r.facilityCost > 0);
  assert.equal(r.totalCost, expenseKeys.reduce((a, k) => a + r[k], 0));
  const poor = baseWorld({ noRivals: true }); poor.companies.player.cash = 0;
  const snap = S.serialize(poor);
  assert.equal(S.buildFacility(poor, 'warehouse').ok, false);
  assert.equal(S.serialize(poor), snap);
});

test('倉庫先付款、到貨後供料；耗用成本、現金與存貨完全對得上', () => {
  const w = baseWorld({ noRivals: true }), s = playerOpens(w), co = w.companies.player;
  S.setOwnerWorks(w, s.id, true); s.inv = 0;
  S.buildFacility(w, 'warehouse'); runDays(w, 7); S.stepHour(w);
  S.setWarehouseAuto(w, false);
  // 自動首次補貨已在完工日下單；額外訂單驗證容量與付款。
  const before = co.cash, ordersBefore = co.expansion.facilities.warehouse.orders.length;
  assert.equal(S.orderWarehouseStock(w, 100000).cost, 94000);
  assert.equal(co.cash, before - 94000);
  assert.equal(co.expansion.facilities.warehouse.orders.length, ordersBefore + 1);
  assert.equal(S.orderWarehouseStock(w, 800000).ok, false);
  runDays(w, 24); S.stepHour(w); // 11 月 1 日
  const cash = co.cash, f = co.expansion.facilities.warehouse, stock = f.stockCost;
  runDays(w, 30);
  const r = S.getReport(w).financials.at(-1), consumed = stock - f.stockCost;
  assert.ok(r.warehouseSavings > 0); assert.ok(consumed > 0);
  assert.equal(co.cash - cash, r.netProfit - r.loanPrincipal + consumed);
  assert.equal(r.totalCost, expenseKeys.reduce((a, k) => a + r[k], 0));
  assert.equal(co.rows.at(-1).items && Object.values(co.rows.at(-1).items).reduce((a, i) => a + i.cost, 0), r.cogs);
});

test('研發可暫停續做，完成後所有分店共享；研發費與固定費都入帳', () => {
  const w = baseWorld({ noRivals: true }), s = playerOpens(w), co = w.companies.player;
  S.buildFacility(w, 'lab'); runDays(w, 14); S.stepHour(w);
  const q = s.quality;
  assert.equal(S.startResearch(w, 'taste').ok, true);
  assert.equal(S.startResearch(w, 'recipe').ok, false);
  S.setFacilityActive(w, 'lab', false); runDays(w, 4);
  assert.equal(co.expansion.research.remainingDays, 21);
  S.setFacilityActive(w, 'lab', true); runDays(w, 22);
  assert.equal(co.expansion.projects.taste, true); assert.equal(s.quality, q + 4);
  co.cash += 2000000;
  const lot = w.lots.find((l) => !l.shopId), r = S.openShop(w, lot.id);
  assert.equal(w.shops.find((x) => x.id === r.shopId).quality, q + 4);
  assert.equal(S.getFinalReport(w).totals.researchExpense, 80000);
  const snap = S.serialize(w); S.getReport(w); S.getFacilities(w); S.getFinalReport(w); S.getExpansionEstimate(w, w.lots.find((l) => !l.shopId).id);
  assert.equal(S.serialize(w), snap);
});

test('工廠實際降低原料成本，但有全品牌每日上限與營運費', () => {
  const w = baseWorld({ noRivals: true }), s = playerOpens(w), co = w.companies.player;
  S.setOwnerWorks(w, s.id, true); S.buildFacility(w, 'factory'); runDays(w, 31); S.stepHour(w);
  assert.equal(co.expansion.facilities.factory.status, 'ready');
  runDays(w, 30);
  const r = S.getReport(w).financials.at(-1);
  assert.ok(r.factorySavings > 0); assert.ok(r.factoryCups > 0);
  assert.ok(r.factoryCups <= 800 * 30); assert.equal(r.facilityCost, 45000);
  S.setFacilityActive(w, 'factory', false); nextDay(w);
  assert.equal(co.expansion.factoryLeft, 0);
});

test('擴張分析扣掉原分店被分走的客源，連鎖管理费及品牌口碑連動生效', () => {
  const w = baseWorld({ noRivals: true }), s = playerOpens(w), co = w.companies.player;
  S.setOwnerWorks(w, s.id, true); runDays(w, 60);
  co.cash += 2000000;
  const lot = w.lots.find((l) => !l.shopId), est = S.getExpansionEstimate(w, lot.id);
  assert.ok(est.lostDaily > 0); assert.equal(est.netNewDaily, est.newDaily - est.lostDaily);
  assert.equal(est.management, 4000);
  const r = S.openShop(w, lot.id); runDays(w, 32); S.stepHour(w);
  assert.ok(S.getReport(w).financials.at(-1).chainCost > 0);
  const second = w.shops.find((x) => x.id === r.shopId);
  const ownStar = S._internals.starOf(second);
  s.revSum = 50; s.revCnt = 50;
  assert.ok(S._internals.chainStarOf(w, second) < ownStar);
});

test('提前還本金降低月付，保留已經過天數的利息，不當作營運費用', () => {
  const w = baseWorld({ noRivals: true }), co = w.companies.player;
  S.takeLoan(w, 'start', 1000000); runDays(w, 15);
  const l = co.loans[0], oldPayment = l.payment, cash = co.cash;
  assert.equal(S.repayLoan(w, l.id, 200000).ok, true);
  assert.equal(l.balance, 800000); assert.ok(l.payment < oldPayment);
  assert.equal(co.cash, cash - 200000);
  const r = S.getReport(w).current;
  assert.equal(r.loanPrincipal, 200000); assert.ok(r.loanInterest > 0);
  assert.equal(r.totalCost, r.loanInterest);
  const snap = S.serialize(w);
  assert.equal(S.repayLoan(w, l.id, 900000).ok, false); assert.equal(S.serialize(w), snap);
  assert.equal(S.repayLoan(w, l.id, 800000).ok, true); assert.equal(co.loans.length, 0);
  assert.ok(S.getReport(w).current.loanInterest > 0);
  runDays(w, 16); S.stepHour(w);
  assert.equal(S.getReport(w).financials[0].loanPrincipal, 1000000);
  assert.equal(co.cash, S.V.startup.startCash - S.getReport(w).financials[0].loanInterest);
  S.takeLoan(w, 'working', 100000); S.takeLoan(w, 'working', 100000);
  const ids = co.loans.map((l) => l.id);
  S.repayLoan(w, ids[0], 100000); S.takeLoan(w, 'working', 100000);
  assert.equal(new Set(co.loans.map((l) => l.id)).size, co.loans.length);
});

test('真實批次異常事件：回收支出與庫存損失入帳，放任會傷害所有分店', () => {
  const w = baseWorld({ noRivals: true, seed: 43 }), co = w.companies.player;
  S.takeLoan(w, 'start', 2000000); S.takeLoan(w, 'working', 2000000);
  for (const lot of w.lots.slice(0, 2)) assert.ok(S.openShop(w, lot.id).ok);
  S.buildFacility(w, 'warehouse'); S.buildFacility(w, 'factory'); runDays(w, 31); S.stepHour(w);
  const ev = S.getEvents(w).pending.find((e) => e.kind === 'batch'); assert.ok(ev);
  const recalled = S.deserialize(S.serialize(w)), c = recalled.companies.player, f = c.expansion.facilities.warehouse, cash = c.cash, stock = f.stockCost;
  assert.equal(S.respondEvent(recalled, ev.id, 'A').ok, true);
  assert.equal(cash - c.cash, 30000); assert.equal(c.cm.stockWriteOff, Math.round(stock * 0.1));
  assert.equal(c.expansion.factoryLeft, 0); assert.equal(S.getFacilities(recalled).batchDaysLeft, 2);
  const reviews = w.shops.map((s) => s.revCnt);
  assert.equal(S.respondEvent(w, ev.id, 'B').ok, true);
  w.shops.forEach((s, i) => assert.equal(s.revCnt, reviews[i] + 20));
  assert.equal(co.cm.stockWriteOff, 0);
});

test('舊存檔擴地圖保留門店與帳目，新增客源、距離與熟悉度維度', () => {
  const w = baseWorld({ noRivals: true }), s = playerOpens(w), cash = w.companies.player.cash, oldPop = w.popAll, oldF = [...s.F];
  const map = structuredClone(FIXTURE.map), dist = structuredClone(FIXTURE.dist);
  map.populationMultiplier = 2;
  map.buildings.push({ ...map.buildings[0], id: 'BNEW', floors: 5 });
  map.lots.push({ ...map.lots[0], id: 'LNEW', building: 'BNEW' });
  dist.BNEW = { ...dist[map.buildings[0].id], LNEW: 1 };
  for (const d of Object.values(dist)) d.LNEW ??= 5;
  assert.equal(S.expandMap(w, map, dist), true);
  assert.equal(w.companies.player.cash, cash); assert.ok(w.popAll > oldPop);
  assert.deepEqual(s.F.slice(0, oldF.length), oldF);
  assert.equal(s.F.length, w.bld.length); assert.equal(w.dM.length, w.bld.length * w.lots.length);
  assert.equal(S.expandMap(w, map, dist), false);
  delete w.companies.player.expansion; delete s.mtd.wasteMilli;
  const loaded = S.deserialize(S.serialize(w)); S.stepHour(loaded); assert.ok(S.getReport(loaded).facilities);
});

test('結案使用整局帳目與已關閉門店，結束邊界不重複最後月份，下載安全轉義', () => {
  const w = baseWorld({ noRivals: true }), s = playerOpens(w), co = w.companies.player;
  S.setOwnerWorks(w, s.id, true); runDays(w, 120); S.closeShop(w, s.id);
  co.cash += 10000000; runDays(w, S._internals.END_DAY - Math.floor(w.t / 24)); S.stepHour(w);
  const report = S.getFinalReport(w);
  assert.notEqual(w.status, 'playing'); assert.equal(report.endDate, S.V.time.endDate);
  assert.equal(report.months.length, 36); assert.equal(new Set(report.months.map((r) => r.ym)).size, 36);
  assert.equal(report.totals.turnover, co.rows.reduce((a, r) => a + r.store + r.gmv, 0));
  assert.equal(report.totals.totalCost, expenseKeys.reduce((a, k) => a + report.totals[k], 0));
  assert.equal(report.shops[0].status, 'closed'); assert.ok(report.shops[0].cups > 0);
  report.company = '<script>alert(1)</script>';
  const html = caseReportDocument(report); assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>'));
});
