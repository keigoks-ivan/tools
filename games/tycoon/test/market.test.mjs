import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../sim.js';
import { shareWallet, walletAt, updatePopulation } from '../market.js';
import { encodeSave, decodeSave } from '../saves.js';
import { FIXTURE } from './scenario.mjs';
import { caseReportDocument } from '../case-report.js';
const fx = JSON.parse(readFileSync(new URL('./fixtures/city-market.json', import.meta.url)));
const fresh = () => S.createWorld({ mapData: fx.map, distances: fx.dist, seed: 20261007, noRivals: true, multiBusiness: true });
function open(w, id, lot = w.lots.find((l) => !l.shopId)) {
  w.companies.player.cash = 1e9; w.companies.player.awareness = 0.6;
  const r = S.openShop(w, lot.id, { businessId: id }); assert.ok(r.ok);
  const s = w.shops.find((s) => s.id === r.shopId); s.status = 'open'; s.openAtT = 0; s.openedT = 0; return s;
}
const run = (w, days) => { for (let h = 0; h < days * 24; h++) S.stepHour(w); };

test('新城有六個可租生活圈，人口按區域分配、折算人流，店面與路網完整', () => {
  const w = fresh(), m = S.getMarketAnalysis(w);
  assert.equal(w.lots.length, 101); assert.equal(w.bld.length, 276); assert.equal(m.freeLots, 101);
  assert.equal(m.districts.length, 6); assert.ok(m.districts.every((d) => d.lots > 0 && d.residents > 0));
  assert.ok(Math.abs(m.residents - 72000) < 1e-6); assert.ok(Math.abs(m.population - 114600) < 1e-6);
  assert.ok(m.areaKm2 > 2.3 && m.areaKm2 < 2.4);
  assert.equal(m.districts.reduce((a, d) => a + d.lots, 0), w.lots.length);
  for (let l = 0; l < w.lots.length; l++) assert.ok(w.bld.some((_, b) => w.dM[b * w.lots.length + l] < 600));
  for (const l of w.lots) assert.equal(l.districtId, w.bld.find((b) => b.id === l.building).districtId);
});

test('商圈範圍依業態區分，所得與共同消費預算可在選址時比較', () => {
  const w = fresh(), lot = w.lots.find((l) => l.districtId === 'tech'), tea = S.getLotInfo(w, lot.id, 'tea'), gym = S.getLotInfo(w, lot.id, 'fitness');
  assert.equal(tea.radius, 600); assert.equal(gym.radius, 1800); assert.ok(gym.catchmentPopulation > tea.catchmentPopulation);
  assert.equal(tea.income, 1.25); assert.ok(tea.catchmentBudgetDaily > 0);
  const cheap = w.lots.find((l) => l.districtId === 'campus'); assert.equal(S.getLotInfo(w, cheap.id).income, 0.8);
});

test('人口與所得平滑成長，成熟區與新區有差異，供給升級不會增加人口', () => {
  const w = fresh(), before = S.getMarketAnalysis(w); w.t = 365 * 24; updatePopulation(w);
  const after = S.getMarketAnalysis(w), old = after.districts.find((d) => d.id === 'old'), tech = after.districts.find((d) => d.id === 'tech');
  assert.ok(Math.abs(old.residents / 9000 - 1.005) < 1e-8); assert.ok(Math.abs(tech.residents / 13000 - 1.08) < 1e-8);
  assert.ok(Math.abs(tech.income - 1.25 * 1.02) < 1e-8); assert.ok(after.budgetDaily > before.budgetDaily);
  const s = open(w, 'supermarket'), pop = w.popAll; S.upgradeShop(w, s.id); assert.equal(w.popAll, pop);
});

test('共同預算同時限制到店、外送與熱度，各業態會排擠其他業態的預期消費', () => {
  const w = fresh(), nb = w.bld.length, walk = [new Float64Array(nb).fill(100000), new Float64Array(nb).fill(100000)], del = [new Float64Array(nb).fill(100000), new Float64Array(nb).fill(100000)];
  shareWallet(w, walk, del, [60, 500], [80, 600], 2, () => 1, [2, 1]);
  for (let b = 0; b < nb; b++) assert.ok(Math.abs((walk[0][b] * 60 + del[0][b] * 80) * 2 + walk[1][b] * 500 + del[1][b] * 600 - walletAt(w, w.bld[b], 2, 1)) < 1e-5);
  const only = [new Float64Array(nb).fill(100000)]; shareWallet(w, only, [new Float64Array(nb)], [60], [80], 2, () => 1);
  assert.ok(only.reduce((a, v) => a + v.reduce((x, n) => x + n, 0), 0) > walk[0].reduce((a, n) => a + n, 0));
});

test('市外外送預算不能補貼到店，低頻服務有自己的消費偏好上限', () => {
  const w = fresh(), nb = w.bld.length, walk = [new Float64Array(nb).fill(1e6)], del = [new Float64Array(nb)];
  shareWallet(w, walk, del, [60], [80], 3, () => 1);
  for (let b = 0; b < nb; b++) assert.ok(Math.abs(walk[0][b] * 60 - walletAt(w, w.bld[b], 3, 1, false)) < 1e-5);
  const gym = [new Float64Array(nb).fill(1e6)];
  shareWallet(w, gym, [new Float64Array(nb)], [500], [500], 3, () => 1, [], ['fitness']);
  for (let b = 0; b < nb; b++) assert.ok(Math.abs(gym[0][b] * 500 - walletAt(w, w.bld[b], 3, 1, false) * 0.025) < 1e-5);
});

test('同區開店會互搶，跨業態預算排擠計入增量獲利，單位不混加', () => {
  const w = fresh();
  const first = open(w, 'tea', w.lots.find((l) => l.districtId === 'old' && l.zone === '住宅'));
  first.staff = [6, 6, 6];
  const li = w.lots.findIndex((l) => l.id === first.lotId), nearby = w.lots.filter((l) => !l.shopId).sort((a, b) => w.ll[li * w.lots.length + w.lots.indexOf(a)] - w.ll[li * w.lots.length + w.lots.indexOf(b)])[0];
  const same = S.getExpansionEstimate(w, nearby.id, { businessId: 'tea' });
  w.cal.r = 100; w.cal.r_del = 10;
  const closest = w.bld.map((b, bi) => ({ b, distance: w.dM[bi * w.lots.length + li] })).filter((x) => x.b.pop > 0).sort((a, b) => a.distance - b.distance)[0].b;
  w.bld.forEach((b) => { b.pop = b === closest ? 100 : 0; }); w.popAll = 100;
  const other = S.getExpansionEstimate(w, nearby.id, { businessId: 'supermarket' });
  assert.ok(same.lostDaily > 0); assert.equal(same.netNewDaily, same.newDaily - same.lostDaily);
  assert.equal(other.lostDaily, 0); assert.equal(other.unit, '筆'); assert.ok(other.crossSectorRevenueLostDaily > 0);
});

test('外送不能服務全城，選址與到店範圍會影響日銷，預估受產能和總預算限制', () => {
  const w = fresh();
  for (const id of Object.keys(S.BUSINESSES)) open(w, id);
  const m = S.getMarketAnalysis(w);
  assert.ok(m.estimatedSpendDaily <= m.budgetDaily + 1e-6);
  assert.ok(m.sectors.every((s) => s.typicalOrders <= s.capacityDaily + 1e-6));
  const before = S.serialize(w); S.getReport(w); S.getFinalReport(w); assert.equal(S.serialize(w), before);
});

test('舊存檔更新保留現金、貸款、店租、原店與月帳；更新只做一次，已結案不改寫', () => {
  const w = S.createWorld({ mapData: FIXTURE.map, distances: FIXTURE.dist, noRivals: true, seed: 2 });
  S.takeLoan(w, 'start', 2000000); const r = S.openShop(w, w.lots[0].id, { ownerWorks: true }); run(w, 62);
  const s = w.shops.find((s) => s.id === r.shopId), co = S.serialize(w.companies.player), rent = s.rent, history = JSON.stringify(s.history), familiarity = [...s.F], t = w.t;
  assert.equal(S.expandMap(w, fx.map, fx.dist), true); assert.equal(S.serialize(w.companies.player), co);
  assert.equal(s.rent, rent); assert.equal(JSON.stringify(s.history), history); assert.deepEqual(s.F.slice(0, familiarity.length), familiarity);
  assert.equal(w.market.startT, t); assert.equal(S.expandMap(w, fx.map, fx.dist), false);
  const snapshot = S.serialize(w); assert.equal(S.serialize(decodeSave(encodeSave(w, {})).world), snapshot);
  w.status = 'lost'; const end = S.serialize(w); assert.equal(S.expandMap(w, fx.map, fx.dist), false); assert.equal(S.serialize(w), end);
});

test('沒有新增店面的舊市場也能升級，更新後可讀檔精確續玩並輸出市場結案分析', () => {
  const w = fresh(); for (const id of Object.keys(S.BUSINESSES)) open(w, id);
  delete w.market; for (const b of w.bld) { delete b.basePop; delete b.districtId; }
  assert.equal(S.expandMap(w, fx.map, fx.dist), true); run(w, 36);
  const loaded = decodeSave(encodeSave(w, {})).world; run(w, 5); run(loaded, 5); assert.equal(S.serialize(w), S.serialize(loaded));
  const html = caseReportDocument(S.getFinalReport(w)); assert.ok(html.includes('期末市場與生活圈')); assert.ok(html.includes('科技商辦生活圈'));
  const raw = JSON.parse(encodeSave(w, {})), bad = JSON.parse(raw.w); bad.market.startT = bad.t + 1; raw.w = JSON.stringify(bad);
  assert.throws(() => decodeSave(JSON.stringify(raw)), /存檔/);
});
