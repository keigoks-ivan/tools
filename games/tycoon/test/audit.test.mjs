import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../sim.js';
import { encodeSave, decodeSave } from '../saves.js';
import { FIXTURE } from './scenario.mjs';

function world(seed = 20261001) {
  const w = S.createWorld({ mapData: FIXTURE.map, distances: FIXTURE.dist, seed, noRivals: true, multiBusiness: true });
  w.companies.player.cash = 100000000; w.companies.player.awareness = 0.7;
  return w;
}
function open(w, id) {
  const r = S.openShop(w, w.lots.find(l => !l.shopId).id, { businessId: id });
  assert.equal(r.ok, true);
  const s = w.shops.find(s => s.id === r.shopId); s.openAtT = w.t;
  return s;
}
function advance(w, t) { while (w.t < t && w.status === 'playing') S.stepHour(w); }
function inventory(w) { return w.shops.filter(s => s.owner === 'player').reduce((a, s) => a + s.inv + s.stock.value, 0); }

for (const id of Object.keys(S.BUSINESSES)) test(`${S.businessOf(id).name}：連續月帳、庫存與實際現金完整對帳（含跨年稅）`, () => {
  const w = world(), s = open(w, id);
  advance(w, S.fastForwardTarget(w, 'month'));
  for (let month = 0; month < 3; month++) {
    const co = w.companies.player, cash = co.cash, inv = inventory(w);
    advance(w, S.fastForwardTarget(w, 'month'));
    const r = S.getReport(w).financials.at(-1);
    assert.equal(co.cash - cash, r.netProfit - r.loanPrincipal - r.shopInvestment - r.facilityCapex + r.assetRecoveries - (inventory(w) - inv));
    assert.equal(r.netProfit, r.turnover - r.totalCost);
    assert.ok(r.turnover > 0, id); assert.ok(s.inv >= 0 && s.stock.qty >= 0 && s.stock.value >= 0);
    const report = S.getReport(w);
    assert.equal(report.financials.reduce((a, m) => a + m.turnover, 0), report.products.reduce((a, p) => a + p.revenue, 0));
    const a = S.getShopAnalysis(w, s.id);
    assert.ok(Number.isFinite(a.fixedMonthly) && Number.isFinite(a.capacityDaily));
  }
});

test('混合九業態：兩年經營、改排班與模式、設備升級後，存讀檔逐小時結果完全相同', () => {
  for (const seed of [20261001, 42, 20270315]) {
    const w = world(seed), shops = Object.keys(S.BUSINESSES).map(id => open(w, id));
    advance(w, 40 * 24 + 14);
    for (const s of shops) {
      assert.equal(S.setStaffing(w, s.id, [2, 3, 4]).ok, true);
      assert.equal(S.setWageLevel(w, s.id, 'high').ok, true);
      if (S.businessOf(s.businessId).upgrades) assert.equal(S.upgradeShop(w, s.id).ok, true);
    }
    for (const [id, changes] of Object.entries({ cafe: { mode: 'dinein' }, bento: { prep: 240, markdown: 30 }, bakery: { prep: 200, markdown: 35 }, convenience: { stockTarget: 200000 }, salon: { service: 'premium' }, restaurant: { mode: 'takeaway' }, supermarket: { stockTarget: 1200000 }, fitness: { focus: 'coached' } })) {
      assert.equal(S.setOperations(w, shops.find(s => s.businessId === id).id, changes).ok, true);
    }
    const restored = decodeSave(encodeSave(w)).world;
    advance(w, 730 * 24 + 14); advance(restored, 730 * 24 + 14);
    assert.equal(S.serialize(restored), S.serialize(w));
    assert.equal(w.status, 'playing'); assert.ok(w.companies.player.rows.length >= 23);
    const before = S.serialize(w), report = S.getFinalReport(w);
    S.getReport(w); shops.forEach(s => S.getShopAnalysis(w, s.id));
    assert.equal(S.serialize(w), before);
    assert.equal(report.businesses.length, 9);
    assert.ok(shops.every(s => s.inv >= 0 && s.stock.value >= 0 && s.stock.qty >= 0 && s.history.every(h => Number.isFinite(h.profit))));
  }
});

test('結案後九業態與平台、事件都不能再修改，結案報告與存檔保持不變', () => {
  const w = world(), shops = Object.keys(S.BUSINESSES).map(id => open(w, id));
  advance(w, 9 * 24);
  w.events.list.push({ id: 'audit', kind: 'platform', status: 'pending', choices: [{ key: 'A', cost: 0 }], title: 'audit' });
  for (const status of ['won', 'lost', 'bankrupt']) {
    w.status = status;
    const before = S.serialize(w);
    for (const s of shops) {
      const key = Object.keys(s.prices)[0];
      const actions = [() => S.setPrices(w, s.id, { [key]: s.prices[key] }), () => S.setMarkup(w, s.id, 10), () => S.setStaffing(w, s.id, [1, 1, 1]), () => S.setWageLevel(w, s.id, 'market'), () => S.setGrade(w, s.id, '講究'), () => S.setOwnerWorks(w, s.id, true), () => S.setDelivery(w, s.id, false), () => S.startOpeningPromo(w, s.id), () => S.upgradeShop(w, s.id), () => S.closeShop(w, s.id), () => S.restockShop(w, s.id), () => S.setOperations(w, s.id, {})];
      for (const action of actions) assert.equal(action().code, 'ended');
    }
    assert.equal(S.setPlatformBoost(w, true).code, 'ended');
    assert.equal(S.respondEvent(w, 'audit', 'A').code, 'ended');
    S.stepHour(w); S.getFinalReport(w);
    assert.equal(S.serialize(w), before);
  }
});

test('九業態同月中途關店、重租與存讀檔，原店最後帳不消失且不重複回收', () => {
  for (const id of Object.keys(S.BUSINESSES)) {
    const w = world(), s = open(w, id);
    advance(w, 13 * 24 + 16);
    const before = S.getReport(w).current.turnover;
    assert.equal(S.closeShop(w, s.id).ok, true);
    const closed = S.serialize(w);
    assert.equal(S.closeShop(w, s.id).code, 'closed'); assert.equal(S.serialize(w), closed);
    assert.equal(S.getReport(w).current.turnover, before);
    const r = S.openShop(w, s.lotId, { businessId: id }); assert.equal(r.ok, true); assert.notEqual(r.shopId, s.id);
    const restored = decodeSave(encodeSave(w)).world;
    advance(w, 100 * 24); advance(restored, 100 * 24);
    assert.equal(S.serialize(w), S.serialize(restored));
    assert.equal(S.getFinalReport(w).shops.length, 2);
  }
});

test('九業態備份拒絕負庫存、非法排班、錯誤門店關聯與不可能的經營數值', () => {
  const w = world(); Object.keys(S.BUSINESSES).forEach(id => open(w, id)); advance(w, 12);
  const raw = encodeSave(w), mutations = [
    x => { x.shops[0].stock.qty = -1; },
    x => { x.shops[0].staff[0] = 0; },
    x => { x.lots[0].shopId = null; },
    x => { x.shops.find(s => s.businessId === 'cafe').operations.seats = -4; },
    x => { x.shops.find(s => s.businessId === 'salon').operations.stations = 0; },
    x => { x.shops.find(s => s.businessId === 'bento').operations.prep = -40; },
    x => { x.shops.find(s => s.businessId === 'bakery').operations.markdown = 100; },
    x => { x.shops.find(s => s.businessId === 'supermarket').operations.stockTarget = 10000000; },
    x => { x.shops.find(s => s.businessId === 'convenience').stock.value = -1; },
  ];
  for (const mutate of mutations) {
    const o = JSON.parse(raw), body = JSON.parse(o.w); mutate(body); o.w = JSON.stringify(body);
    assert.throws(() => decodeSave(JSON.stringify(o)), /損壞/);
  }
  assert.equal(S.serialize(decodeSave(raw).world), S.serialize(w));
});
