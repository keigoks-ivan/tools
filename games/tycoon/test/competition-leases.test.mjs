import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../sim.js';
import { encodeSave, decodeSave } from '../saves.js';
const fx = JSON.parse(readFileSync(new URL('./fixtures/city-market.json', import.meta.url)));
const fresh = () => S.createWorld({ mapData: fx.map, distances: fx.dist, seed: 20261007, noRivals: true, multiBusiness: true });
function open(w, id = 'tea', lot = w.lots.find((l) => !l.shopId)) {
  w.companies.player.cash = 1e8;
  const r = S.openShop(w, lot.id, { businessId: id }); assert.ok(r.ok);
  const s = w.shops.find((s) => s.id === r.shopId); s.status = 'open'; s.openedT = w.t; return s;
}
function notice(w, s) { w.t = s.lease.noticeAtT; S._internals.leaseDay(w); return w.events.list.findLast((e) => e.kind === 'lease' && e.status === 'pending'); }
function npc(w, id) {
  const s = open(w, id); const co = structuredClone(w.companies.player);
  co.id = id; co.name = id; co.cash = 12000000; co.awareness = 0.6; co.rows = []; co.expansion = null;
  w.companies[id] = co; s.owner = 'rival'; s.company = id; s.fixedQ = 65; s.ownerWorks = false; s.F.fill(0.35); s.revCnt = 200; s.revSum = 800;
  S._internals.recalcShop(w, s); return s;
}
const review = (w) => { S._internals.rivalMonthly(w, S.dateOf(w.t / 24)); };

test('舊存檔首次更新保留現金、租金與歷史，一年租約與競爭適應期不因讀檔重設', () => {
  const w = fresh(), s = open(w); w.t = 200 * 24 + 7;
  s.mtd.rentDays = 12; s.history = [{ ym: '2026-01', profit: 1234, rent: 40000 }];
  delete w.pressure; for (const l of w.lots) delete l.baseRent; delete s.lease; delete s.mtd.rentUnits;
  const before = { cash: w.companies.player.cash, rent: s.rent, history: structuredClone(s.history) };
  const loaded = decodeSave(encodeSave(w, {})).world, sh = loaded.shops[0];
  assert.equal(loaded.companies.player.cash, before.cash); assert.equal(sh.rent, before.rent); assert.deepEqual(sh.history, before.history);
  assert.equal(sh.lease.endT, (200 + 365) * 24); assert.equal(sh.mtd.rentUnits, before.rent * 12); assert.equal(loaded.pressure.startT, w.t);
  assert.deepEqual(decodeSave(encodeSave(loaded, {})).world.pressure, loaded.pressure);
  assert.deepEqual(decodeSave(encodeSave(loaded, {})).world.shops[0].lease, sh.lease);
  w.status = 'lost'; const ended = S.deserialize(w); assert.equal(ended.pressure, undefined); assert.equal(ended.shops[0].lease, undefined);
});

test('續租押金按差額付現、不扣獲利；可改方案且正式月租到期才生效', () => {
  const w = fresh(), s = open(w); const oldRent = s.rent, oldDeposit = s.deposit, ev = notice(w, s);
  s.lease.offer = { rent: oldRent + 5000, longRent: oldRent + 2000 };
  const cash = w.companies.player.cash, profit = S.getReport(w).current.netProfit, investment = w.companies.player.cm.shopInvestment;
  assert.ok(S.respondEvent(w, ev.id, 'B').ok); const paid = (oldRent + 2000) * 3 - oldDeposit;
  assert.equal(w.companies.player.cash, cash - paid); assert.equal(w.companies.player.cm.shopInvestment, investment + paid);
  assert.equal(S.getReport(w).current.netProfit, profit); assert.equal(s.rent, oldRent);
  assert.equal(S.respondEvent(w, ev.id, 'B').ok, false);
  assert.ok(S.reviewLease(w, s.id).ok); const changed = w.events.list.findLast((e) => e.kind === 'lease');
  assert.ok(S.respondEvent(w, changed.id, 'A').ok);
  assert.equal(w.companies.player.cash, cash - ((oldRent + 5000) * 2 - oldDeposit));
  const loaded = decodeSave(encodeSave(w, {})).world, ls = loaded.shops[0]; assert.equal(ls.lease.plan.key, 'A');
  loaded.t = ls.lease.endT; S._internals.leaseDay(loaded);
  assert.equal(ls.rent, oldRent + 5000); assert.equal(ls.lease.endT, loaded.t + 365 * 24); assert.equal(ls.lease.plan, null);
});

test('月中續租按各天租金結算，原天數不因漲租被重算；公司與分店月報仍對帳', () => {
  const w = fresh(); w.t = 5 * 24; const s = open(w); const old = s.rent;
  const ev = notice(w, s); s.lease.offer = { rent: old + 9000, longRent: old + 6000 }; S.respondEvent(w, ev.id, 'A');
  w.t = s.lease.endT; s.mtd.rentDays = 10; s.mtd.rentUnits = old * 10;
  S._internals.leaseDay(w); S._internals.startDay(w);
  const dim = S.dateOf(w.t / 24).dim;
  assert.equal(S.getShopHistory(w, s.id).mtdPnL.rent, Math.floor((old * 10 + old + 9000) / dim));
  assert.equal(S.getMonthlyReport(w).current.rent, S.getMonthlyReport(w, s.id).current.rent);
});

test('續租可延後七天；現金不夠時保留決策，無回應且補不起押金才到期退租', () => {
  const w = fresh(), s = open(w), ev = notice(w, s); const firstT = w.t;
  assert.ok(S.respondEvent(w, ev.id, 'D').ok); assert.equal(S.getEvents(w).pending.length, 0);
  w.t += 6 * 24; S._internals.leaseDay(w); assert.equal(S.getEvents(w).pending.length, 0);
  w.t = firstT + 7 * 24; S._internals.leaseDay(w); const next = S.getEvents(w).pending[0];
  s.lease.offer = { rent: s.rent + 5000, longRent: s.rent + 2000 }; w.companies.player.cash = 0;
  assert.equal(S.respondEvent(w, next.id, 'A').ok, false); assert.equal(next.status, 'pending');
  w.t = s.lease.endT; S._internals.leaseDay(w); assert.equal(s.status, 'closed'); assert.equal(next.choice, 'C');
  assert.equal(w.companies.player.cm.extraExpense, 0); assert.equal(w.lots.find((l) => l.id === s.lotId).shopId, null);
});

test('到期退租沒有違約金，提早關店收兩個月且取消續租通知，不能重複回收', () => {
  const w = fresh(), s = open(w), ev = notice(w, s); const fee = S.getLeaseInfo(w, s.id).breakFee;
  const cash = w.companies.player.cash, result = S.closeShop(w, s.id);
  assert.ok(result.ok); assert.equal(result.breakFee, fee); assert.equal(w.companies.player.cm.extraExpense, fee);
  assert.equal(ev.status, 'resolved'); assert.equal(S.getEvents(w).pending.length, 0); const after = w.companies.player.cash;
  assert.ok(after < cash + result.refund + result.equipment); assert.equal(S.closeShop(w, s.id).ok, false); assert.equal(w.companies.player.cash, after);
  const other = open(w, 'convenience'); const e = notice(w, other); S.respondEvent(w, e.id, 'C');
  const expense = w.companies.player.cm.extraExpense; w.t = other.lease.endT; S._internals.leaseDay(w);
  assert.equal(other.status, 'closed'); assert.equal(w.companies.player.cm.extraExpense, expense);
});

test('行情隨人口與空置變化，已簽租金不動；單次續租增減有上限', () => {
  const w = fresh(), s = open(w), lot = w.lots.find((l) => l.id === s.lotId), rent = s.rent;
  w.t = 365 * 24; for (const b of w.bld) if (b.districtId === lot.districtId) b.pop *= 1.5;
  S._internals.updateAskingRents(w); assert.ok(lot.rent > rent); assert.equal(s.rent, rent);
  assert.equal(S.getLeaseInfo(w, s.id).one.rent, Math.round(rent * 1.12));
  for (const b of w.bld) if (b.districtId === lot.districtId) b.pop *= 0.1;
  S._internals.updateAskingRents(w); assert.ok(lot.rent < rent); assert.equal(S.getLeaseInfo(w, s.id).one.rent, Math.round(rent * 0.88));
});

test('存檔拒絕損壞租約、押金方案與競爭設定，保留格式及 key 相容性', () => {
  const w = fresh(), s = open(w); const before = encodeSave(w, {});
  assert.doesNotThrow(() => decodeSave(before));
  for (const corrupt of [x => x.shops[0].lease.endT = -1, x => x.shops[0].lease.plan = { key: 'B', rent: 50000, deposit: 1, termDays: 730 }, x => x.pressure.occupancy = {}, x => x.pressure.population.oldtown = -1, x => x.shops[0].mtd.rentUnits = -1]) {
    const x = JSON.parse(S.serialize(w)); corrupt(x); assert.throws(() => decodeSave(JSON.stringify({ w: x })));
  }
});

test('各業態對手共用客源、資金和裝修規則；適應期及現金不足不展店', () => {
  const w = fresh(); for (const id of Object.keys(S.BUSINESSES)) npc(w, id); w.noRivals = false;
  const count = w.shops.length; w.t = 60 * 24; review(w); assert.equal(w.shops.length, count);
  w.t = 92 * 24; for (const co of Object.values(w.companies)) if (co.id !== 'player') co.cash = 0;
  review(w); assert.equal(w.shops.length, count);
  for (const co of Object.values(w.companies)) if (co.id !== 'player') co.cash = 20000000;
  const cash = Object.fromEntries(Object.values(w.companies).map((co) => [co.id, co.cash]));
  review(w); const added = w.shops.slice(count); assert.ok(added.length > 0); assert.ok(added.length <= 2);
  assert.ok(added.some((s) => s.businessId !== 'tea'));
  for (const s of added) {
    assert.equal(s.status, 'renovating'); assert.equal(s.openAtT, w.t + S.businessOf(s.businessId).renovationDays * 24);
    assert.equal(w.companies[s.company].cash, cash[s.company] - S.lotOpenCost(w.lots.find((l) => l.id === s.lotId), s.businessId));
    assert.ok(w.companies[s.company].cash > 0); assert.equal(s.lease.endT, w.t + 365 * 24);
  }
  const brands = new Set(added.map((s) => s.company)); review(w);
  for (const id of brands) assert.equal(w.shops.filter((s) => s.company === id).length, 2);
});

test('薄毛利促銷有成本底線與冷卻期，且附近必須有玩家同業', () => {
  const w = fresh(), s = npc(w, 'convenience'); open(w, 'convenience', w.lots.find((l) => !l.shopId && l.districtId === w.lots[0].districtId));
  w.noRivals = false; w.t = 100 * 24; w.companies.convenience.cash = 500000;
  s.days = Array.from({ length: 90 }, (_, i) => ({ cups: i < 60 ? 300 : 100, lost: 0, wait: 0 }));
  // 相鄰門面，確認觸發的是同業反擊。
  const p = w.shops.find((x) => x.owner === 'player'), D = S._internals.derived(w); w.ll[D.lotIdx[s.lotId] * D.nl + D.lotIdx[p.lotId]] = 20;
  review(w); assert.equal(s.promo.kind, 'competitive'); assert.equal(s.promo.daysLeft, 14);
  const biz = S.businessOf(s.businessId); for (const [key, it] of Object.entries(biz.items)) assert.ok(s.prices[key] * s.promo.num / s.promo.den >= (it.cost * s.costMult * (1 + biz.waste) + biz.packaging + biz.utilityUnit) * 1.1);
  s.promo.daysLeft = 0; w.t += 30 * 24; review(w); assert.equal(s.promo.daysLeft, 0);
  s.lastPressurePromoT = 0; p.businessId = 'tea'; w.t += 100 * 24; review(w); assert.equal(s.promo.daysLeft, 0);
});

test('兩年鎖租的月租及押金在一年後仍保留，違約金按剩餘天數遞減', () => {
  const w = fresh(), s = open(w), ev = notice(w, s); const quote = S.getLeaseInfo(w, s.id).long;
  S.respondEvent(w, ev.id, 'B'); w.t = s.lease.endT; S._internals.leaseDay(w);
  const end = s.lease.endT; assert.equal(s.lease.termDays, 730); assert.equal(s.rent, quote.rent);
  w.t += 365 * 24; S._internals.updateAskingRents(w); S._internals.leaseDay(w);
  assert.equal(s.rent, quote.rent); assert.equal(s.deposit, quote.deposit); assert.equal(s.lease.endT, end);
  assert.equal(S.getLeaseInfo(w, s.id).breakFee, s.rent * 2);
  w.t = end - 24; assert.equal(S.getLeaseInfo(w, s.id).breakFee, Math.round(s.rent / 30));
});

test('對手實際虧損時，即使有大量現金也先停止展店；無空店面也不新增供給', () => {
  const w = fresh(), s = npc(w, 'cafe'); w.noRivals = false; w.t = 100 * 24;
  w.companies.cafe.cash = 100000000; s.lastPnL = { profit: -50000 }; const before = w.shops.length;
  review(w); assert.equal(w.shops.length, before);
  s.lastPnL.profit = 500000;
  for (const l of w.lots) l.shopId ||= s.id;
  review(w); assert.equal(w.shops.length, before);
});

test('月初到期退租也記錄剩餘存貨損失，不能因營業及租金天數為零而漏帳', () => {
  const w = fresh(), s = open(w, 'convenience'), ev = notice(w, s); S.respondEvent(w, ev.id, 'C');
  const loss = Math.ceil(s.inv / 2); w.t = s.lease.endT;
  S._internals.startDay(w); assert.equal(s.status, 'closed');
  const final = s.history.at(-1); assert.equal(final.partial, true); assert.equal(final.rent, 0); assert.equal(final.waste, loss); assert.equal(final.profit, -loss);
  assert.equal(S.getMonthlyReport(w).current.netProfit, -loss);
  assert.equal(S.getMonthlyReport(w, s.id).current.netProfit, -loss);
});

test('每日備料業態展店會採用已有店實測過的產量與班表，不能永遠卡在開局備料量', () => {
  for (const id of ['bento', 'bakery']) {
    const w = fresh(), s = npc(w, id); w.noRivals = false; w.t = 100 * 24; w.companies[id].cash = 20000000;
    s.days = Array.from({ length: 90 }, () => ({ cups: 590, lost: 10, wait: 5 }));
    s.hourEMA = [20, 100, 260, 100, 20, 15, 30, 100, 180, 80, 30, 10]; s.lastPnL = { profit: 400000 };
    review(w); const added = w.shops.filter((x) => x.company === id && x.id !== s.id);
    assert.equal(added.length, 1, id); assert.equal(added[0].operations.prep, 600); assert.deepEqual(added[0].staff, s.staff);
    assert.equal(added[0].operations.markdown, s.operations.markdown); assert.equal(added[0].status, 'renovating');
  }
});
