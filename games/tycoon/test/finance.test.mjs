// node --test games/tycoon/test/finance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { baseWorld, playerOpens, runDays } from './scenario.mjs';
import { V, stepHour, openShop, closeShop, getReport, getKpi, getShopAnalysis, setOwnerWorks, setStaffing, setSocialAd, hireInfluencer, serialize, deserialize } from '../sim.js';

const costKeys = ['commission', 'cogs', 'pack', 'waste', 'wage', 'rent', 'util', 'pos', 'cardFee', 'bizTax', 'adCost', 'extraExpense', 'loanInterest', 'incomeTax'];

test('公司損益逐項加總一致，月底淨利扣本金後等於現金變動', () => {
  const w = baseWorld({ noRivals: true }), s = playerOpens(w);
  s.inv = 0;
  setSocialAd(w, 2);
  runDays(w, 31); stepHour(w); // 11 月 1 日，10 月已結帳
  const cash = w.companies.player.cash;
  hireInfluencer(w, 1);
  runDays(w, 30);
  const r = getReport(w).financials.at(-1);
  assert.equal(r.ym, '2026-11');
  assert.equal(r.extraExpense, V.awareness.influencer[0].cost);
  assert.equal(r.totalCost, costKeys.reduce((a, k) => a + r[k], 0));
  assert.equal(r.netProfit, r.turnover - r.totalCost);
  assert.equal(w.companies.player.cash - cash, r.netProfit - r.loanPrincipal);
  assert.equal(r.turnover, w.companies.player.rows.at(-1).store + w.companies.player.rows.at(-1).gmv);
  assert.equal(r.incomplete, false);
});

test('本月損益包含已關門店、已發生的一次性支出，HUD 與報表一致', () => {
  const w = baseWorld(), s = playerOpens(w);
  runDays(w, 45);
  setSocialAd(w, 2); runDays(w, 3); setSocialAd(w, 0);
  hireInfluencer(w, 1);
  const before = getReport(w).current;
  assert.ok(before.adCost > 0); // 關掉廣告後仍保留已發生費用
  assert.equal(before.extraExpense, 30000);
  const remainingStock = s.inv;
  closeShop(w, s.id);
  const after = getReport(w).current;
  assert.equal(after.turnover, before.turnover);
  assert.equal(after.waste - before.waste, remainingStock);
  assert.equal(after.netProfit, before.netProfit - remainingStock + before.bizTax - after.bizTax);
  assert.equal(getKpi(w).monthNetProfit, after.netProfit);
  assert.equal(after.totalCost, costKeys.reduce((a, k) => a + after[k], 0));
});

test('多店及同月關店重租：原店的最後帳和新店租金都列入', () => {
  const w = baseWorld({ noRivals: true }), s = playerOpens(w);
  w.companies.player.cash = 5000000;
  runDays(w, 45);
  closeShop(w, s.id);
  const closedPnl = s.history.at(-1);
  const r = openShop(w, s.lotId);
  assert.ok(r.ok);
  const newShop = w.shops.find((x) => x.id === r.shopId);
  const report = getReport(w).current;
  assert.equal(report.turnover, closedPnl.turnover);
  assert.equal(report.rent, closedPnl.rent + Math.floor(newShop.rent / w.day.dim));
});

test('年結營所稅列入 12 月總成本，不混入貸款本金', () => {
  const w = baseWorld({ noRivals: true }), s = playerOpens(w);
  setOwnerWorks(w, s.id, true);
  runDays(w, 92); stepHour(w);
  const r = getReport(w).financials.at(-1);
  assert.equal(r.ym, '2026-12');
  assert.ok(r.incomeTax > 0);
  assert.equal(r.incomeTax, w.companies.player.lastIncomeTax);
  assert.equal(r.totalCost, costKeys.reduce((a, k) => a + r[k], 0));
});

test('老闆替代員工，服務杯數相同、預設班表支薪人事減半', () => {
  const w = baseWorld(), s = playerOpens(w);
  const owned = deserialize(serialize(w)), os = owned.shops.find((x) => x.id === s.id);
  assert.ok(setOwnerWorks(owned, os.id, true).ok);
  runDays(w, 62); runDays(owned, 62);
  assert.equal(os.tot.walk, s.tot.walk);
  assert.equal(os.tot.del, s.tot.del);
  assert.equal(os.mtd.wageMilli * 2, s.mtd.wageMilli);
  assert.ok(Math.abs(os.history[1].wage * 2 - s.history[1].wage) <= 1); // 月底整數四捨五入
  setStaffing(owned, os.id, [1, 1, 1]);
  os.mtd.wageMilli = 0;
  runDays(owned, 1);
  assert.equal(os.mtd.wageMilli, 0);
});

test('老闆只能顧一家，第二家開店失敗不扣錢，關店後可移轉', () => {
  const w = baseWorld({ noRivals: true }), s = playerOpens(w);
  setOwnerWorks(w, s.id, true);
  w.companies.player.cash = 5000000;
  const lot = w.lots.find((l) => !l.shopId), cash = w.companies.player.cash;
  assert.equal(openShop(w, lot.id, { ownerWorks: true }).code, 'owner_busy');
  assert.equal(w.companies.player.cash, cash);
  const other = openShop(w, lot.id);
  assert.equal(setOwnerWorks(w, other.shopId, true).code, 'owner_busy');
  closeShop(w, s.id);
  assert.ok(setOwnerWorks(w, other.shopId, true).ok);
  assert.equal(getShopAnalysis(w, other.shopId).ownerWorks, true);
});

test('住宅店親自經營後，第 4–12 個月有合理正利潤及較低損益兩平杯數', () => {
  const w = baseWorld(), s = playerOpens(w);
  setOwnerWorks(w, s.id, true);
  runDays(w, 400);
  const hs = s.history.slice(4, 13), profit = hs.reduce((a, h) => a + h.profit, 0), rev = hs.reduce((a, h) => a + h.turnover, 0);
  assert.ok(profit / rev > 0.1 && profit / rev < 0.3, String(profit / rev));
  const owned = getShopAnalysis(w, s.id);
  setOwnerWorks(w, s.id, false);
  const hired = getShopAnalysis(w, s.id);
  assert.ok(owned.breakEvenDaily < hired.breakEvenDaily);
  assert.ok(Math.abs(hired.monthlyWage - owned.monthlyWage - owned.ownerSaving) <= 1);
  assert.ok(owned.contribution > 0);
});

test('舊存檔可讀，缺漏費用有標記，報表與分析不改存檔', () => {
  const w = baseWorld(), s = playerOpens(w);
  runDays(w, 65);
  for (const row of w.companies.player.rows) { delete row.loanInterest; delete row.loanPrincipal; delete row.extraExpense; delete row.incomeTax; }
  delete s.ownerWorks;
  delete w.companies.player.cm.extraExpense;
  const old = deserialize(serialize(w)), snapshot = serialize(old);
  const rep = getReport(old);
  assert.ok(rep.financials.every((r) => r.incomplete));
  assert.ok(Number.isFinite(rep.current.netProfit));
  assert.equal(rep.analysis[0].ownerWorks, false);
  assert.equal(serialize(old), snapshot);
  hireInfluencer(old, 1);
  assert.equal(getReport(old).current.extraExpense, 30000);
});

test('損平杯數可核算，計入廣告和利息後增加，尚無營收時不顯示假數字', () => {
  const w = baseWorld(), s = playerOpens(w);
  assert.equal(getShopAnalysis(w, s.id).breakEvenDaily, null);
  runDays(w, 65);
  setSocialAd(w, 5);
  const a = getShopAnalysis(w, s.id);
  assert.equal(a.breakEvenDaily, Math.ceil(a.fixedMonthly / a.contribution / w.day.dim));
  assert.equal(a.breakEvenWithBrandDaily, Math.ceil((a.fixedMonthly + a.brandAllocation) / a.contribution / w.day.dim));
  assert.ok(a.breakEvenWithBrandDaily > a.breakEvenDaily);
  assert.ok(a.brandAllocation > 50000); // 廣告加貸款利息
  assert.equal(a.capacityDaily, 504);
});
