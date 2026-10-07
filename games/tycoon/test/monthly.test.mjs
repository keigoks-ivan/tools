import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE, runDays } from './scenario.mjs';
import * as S from '../sim.js';

function setup() {
  const w = S.createWorld({ mapData: FIXTURE.map, distances: FIXTURE.dist, noRivals: true, multiBusiness: true, seed: 20261007 });
  w.companies.player.cash = 100000000;
  w.companies.player.awareness = 0.6;
  const open = (id, lotId = w.lots.find((l) => !l.shopId).id) => {
    const result = S.openShop(w, lotId, { businessId: id, name: id });
    assert.ok(result.ok);
    const s = w.shops.find((s) => s.id === result.shopId);
    s.status = 'open'; s.openAtT = 0; s.openedT = 0;
    return s;
  };
  return { w, open };
}

test('混合業態月報的分店收入、店內成本與共同費用可核對品牌淨利', () => {
  const { w, open } = setup(); open('tea'); open('convenience');
  S.setSocialAd(w, 2); runDays(w, 65);
  const snapshot = S.serialize(w), report = S.getMonthlyReport(w);
  for (const r of [...report.financials, report.current]) {
    const parts = report.shops.map((s) => r === report.current ? s.current : s.financials.find((h) => h.ym === r.ym));
    assert.equal(parts.reduce((a, h) => a + h.turnover, 0), r.turnover);
    assert.equal(parts.reduce((a, h) => a + h.cups, 0), r.cups);
    const ownCost = parts.reduce((a, h) => a + h.totalCost, 0);
    const shared = r.adCost + r.extraExpense + r.chainCost + r.facilityCost + r.researchExpense + r.stockWriteOff + r.loanInterest + r.incomeTax;
    assert.equal(ownCost + shared, r.totalCost);
    assert.equal(parts.reduce((a, h) => a + h.netProfit, 0) - shared, r.netProfit);
  }
  const retail = report.shops.find((s) => s.businessId === 'convenience');
  assert.equal(S.getMonthlyReport(w, retail.id).unit, '筆');
  assert.ok(retail.financials[0].daily > 0);
  assert.equal(S.serialize(w), snapshot);
  assert.equal(S.getMonthlyReport(w, 'unknown'), null);
});

test('同月關店重租保留兩家店的身分與最後帳，新店之前月份標示未營運', () => {
  const { w, open } = setup(), old = open('tea'); runDays(w, 45);
  assert.ok(S.closeShop(w, old.id).ok);
  const next = open('convenience', old.lotId); runDays(w, 3);
  const report = S.getMonthlyReport(w), closed = report.shops.find((s) => s.id === old.id), current = report.shops.find((s) => s.id === next.id);
  assert.equal(closed.status, 'closed'); assert.ok(closed.current.partial);
  assert.equal(closed.current.turnover, old.history.at(-1).turnover);
  assert.equal(current.financials[0].active, false); assert.equal(current.financials[0].daily, null);
  assert.equal(report.current.turnover, closed.current.turnover + current.current.turnover);
  assert.ok(S.getMonthlyReport(w, old.id).financials[0].turnover > 0);
  runDays(w, 20);
  const after = S.getMonthlyReport(w, old.id);
  assert.equal(after.current.active, false); assert.equal(after.current.netProfit, 0);
  assert.ok(after.financials.find((r) => r.ym === '2026-11').partial);
});

test('月報保留超過一年歷史，存檔接續結果一致，缺營業日不捏造日均成交', () => {
  const { w, open } = setup(), s = open('convenience'); runDays(w, 400);
  const report = S.getMonthlyReport(w, s.id);
  assert.ok(report.financials.length > 12);
  assert.deepEqual(S.getMonthlyReport(S.deserialize(S.serialize(w)), s.id), report);
  delete s.history[0].tradingDays;
  const legacy = S.getMonthlyReport(w, s.id).financials[0];
  assert.equal(legacy.daily, null); assert.ok(legacy.turnover > 0);
});
