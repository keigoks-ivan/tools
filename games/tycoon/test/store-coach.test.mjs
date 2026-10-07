import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../sim.js';
import { storeCoach } from '../store-coach.js';
import { hourlyCapacity } from '../businesses.js';
import { FIXTURE, runDays } from './scenario.mjs';

function setup(id = 'tea', ownerWorks = false) {
  const world = S.createWorld({ mapData: FIXTURE.map, distances: FIXTURE.dist, noRivals: true, multiBusiness: true, seed: 20261007 });
  world.companies.player.cash = 50000000;
  const opened = S.openShop(world, world.lots[0].id, { businessId: id, ownerWorks });
  assert.equal(opened.ok, true);
  const shop = world.shops.find((s) => s.id === opened.shopId);
  shop.status = 'open'; shop.openAtT = 0; shop.openedT = 0;
  shop.days = Array.from({ length: 7 }, () => ({ cups: 100, walk: 75, del: 25, lost: 0, stockLost: 0, prepared: 160, unsold: 0, wait: 3, rev: 10000 }));
  const analysis = { ...S.getShopAnalysis(world, shop.id), sampleDays: 7, contribution: 50, breakEvenWithBrandDaily: 80, ym: '2026-10', current: true, pnl: { cups: 700, turnover: 70000, commission: 5000, gmv: 20000 } };
  const review = { ownerCost: ownerWorks ? 80000 : 0 };
  const get = () => storeCoach({ shop, analysis, review, world });
  return { world, shop, analysis, review, get };
}
const metric = (coach, id) => coach.drivers.find((d) => d.id === id);
const pattern = (ctx, changes) => ctx.shop.days.forEach((d) => Object.assign(d, changes));

test('九種門店用不同營利公式、關鍵因子和可控制項；純查詢不改時間、帳目或亂數', () => {
  const expected = { tea: 'deliveryShare', cafe: 'seatCapacity', bento: 'mealConcentration', bakery: 'markdown', convenience: 'stockCover', salon: 'serviceMinutes', restaurant: 'productionCapacity', supermarket: 'stockLimit', fitness: 'equipmentCapacity' };
  const formulas = new Set();
  for (const [id, key] of Object.entries(expected)) {
    const ctx = setup(id), before = S.serialize(ctx.world), result = ctx.get();
    assert.equal(S.serialize(ctx.world), before); assert.deepEqual(ctx.get(), result);
    assert.equal(result.businessId, id); assert.ok(metric(result, key));
    formulas.add(result.formula.text); assert.ok(result.formula.detail.length > 10);
    assert.equal(result.sample.days, 7); assert.equal(result.sample.enough, true);
    assert.ok(result.bottleneck.reason); assert.ok(result.decision.action); assert.ok(result.decision.tradeoff);
    for (const d of result.drivers) {
      assert.ok(d.value == null || Number.isFinite(d.value), d.id);
      assert.ok(['observed', 'estimate', 'state'].includes(d.type)); assert.ok(d.basis); assert.ok(d.detail);
      assert.ok(d.controls.length > 0); if (d.unit === '%') assert.ok(d.value == null || d.value >= 0);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  }
  assert.equal(formulas.size, 9);
});

test('尚無完整日的數字保持未知，樣本不足時先建立基準而不給免費增長配方', () => {
  const ctx = setup(); ctx.shop.days = [];
  const result = ctx.get();
  assert.equal(metric(result, 'dailySales').value, null); assert.equal(metric(result, 'deliveryShare').value, null);
  assert.equal(result.sample.days, 0); assert.equal(result.bottleneck.id, 'sample'); assert.match(result.decision.action, /還差 7 天/);
  ctx.shop.days = [{ cups: 10, walk: 10, del: 0, lost: 0, stockLost: 0 }];
  assert.match(ctx.get().decision.action, /還差 6 天/);
  assert.equal(storeCoach(), null); assert.equal(storeCoach({ shop: ctx.shop, world: ctx.world }), null);
});

test('今日半日成交與分析期日均不會混入完整日日均；帳目另列日期與樣本', () => {
  const ctx = setup(); ctx.shop.today.walk = 10000; ctx.analysis.dailyCups = 9000;
  ctx.analysis.current = false; ctx.analysis.ym = '2026-09';
  const result = ctx.get();
  assert.equal(metric(result, 'dailySales').value, 100);
  assert.match(metric(result, 'dailySales').basis, /7 個完整營業日/);
  assert.match(metric(result, 'contribution').basis, /2026-09.*已結算/);
  assert.match(metric(result, 'breakEven').detail, /分析期.*目前固定成本/);
});

test('舊存檔沒有備料／缺貨紀錄時不補成零；只用同一批完整日分開缺貨與其他流失', () => {
  const ctx = setup('bento');
  ctx.shop.days = Array.from({ length: 7 }, () => ({ cups: 100, walk: 100, del: 0, lost: 1000 }));
  let result = ctx.get();
  assert.equal(metric(result, 'unsoldRate').value, null); assert.equal(metric(result, 'stockLost').value, null);
  ctx.shop.days[6] = { cups: 100, walk: 100, del: 0, lost: 11, stockLost: 10, prepared: 100, unsold: 0 };
  result = ctx.get();
  assert.equal(metric(result, 'stockLost').value, 10); assert.match(metric(result, 'stockLost').basis, /1 天/);
  assert.equal(metric(result, 'unsoldRate').value, 0); assert.match(metric(result, 'unsoldRate').basis, /1 天/);
  assert.equal(result.bottleneck.id, 'stock');
});

test('鮮食先看完整日的報廢，多備只減一個有效批次步長且不改遊戲', () => {
  for (const id of ['bento', 'bakery']) {
    const ctx = setup(id); pattern(ctx, { prepared: 160, unsold: 40, lost: 20, stockLost: 20 });
    const before = S.serialize(ctx.world), result = ctx.get();
    assert.equal(result.bottleneck.id, 'waste'); assert.equal(metric(result, 'unsoldRate').value, 25);
    assert.deepEqual(result.decision.change, { key: 'prep', from: ctx.shop.operations.prep, to: ctx.shop.operations.prep - 20 });
    assert.match(result.decision.action, /下一|下次/); assert.match(result.decision.tradeoff, /折扣|提早售罄/);
    assert.equal(S.serialize(ctx.world), before);
  }
});

test('鮮食售罄建議加批次而不加人，最高批次不會超過允許範圍', () => {
  const ctx = setup('bento'); pattern(ctx, { prepared: 160, unsold: 0, lost: 30, stockLost: 30 });
  let result = ctx.get(); assert.equal(result.bottleneck.id, 'stock'); assert.equal(result.decision.control, 'operations');
  assert.deepEqual(result.decision.change, { key: 'prep', from: 160, to: 180 });
  ctx.shop.operations.prep = 600; result = ctx.get();
  assert.equal(result.bottleneck.id, 'stock'); assert.equal(result.decision.change, undefined);
});

test('鮮食目前批次實備不足先辨認資金，而不建議再提高備餐目標', () => {
  const ctx = setup('bento'); ctx.shop.stock = { day: 0, prepared: 20, qty: 20, value: 1000 };
  const result = ctx.get();
  assert.equal(result.bottleneck.id, 'prepFunding'); assert.equal(result.bottleneck.severity, 'critical');
  assert.equal(result.decision.control, 'cash'); assert.match(result.bottleneck.reason, /實備 20.*設定 160/);
});

test('便利商店與超市缺貨先檢查貨款現金；補貨關閉、提高目標與資金限制有不同決策', () => {
  for (const id of ['convenience', 'supermarket']) {
    const ctx = setup(id); pattern(ctx, { lost: 20, stockLost: 20 }); ctx.shop.inv = 0;
    ctx.world.companies.player.cash = 0;
    let result = ctx.get(); assert.equal(result.bottleneck.id, 'workingCapital'); assert.equal(result.decision.control, 'cash');
    ctx.world.companies.player.cash = 5000000; ctx.shop.operations.autoStock = false;
    result = ctx.get(); assert.equal(result.bottleneck.id, 'stock'); assert.equal(result.decision.control, 'restock'); assert.equal(result.decision.change, undefined);
    ctx.shop.operations.autoStock = true; result = ctx.get();
    assert.equal(result.decision.control, 'operations');
    assert.equal(result.decision.change.to - result.decision.change.from, id === 'supermarket' ? 100000 : 10000);
    assert.match(result.decision.tradeoff, /不會自動提高客源/);
  }
});

test('零售庫存天數是依合併成本估算，沒有假造逐 SKU 庫存或效期', () => {
  const ctx = setup('convenience'), b = S.businessOf('convenience'); ctx.shop.inv = 12345;
  const cost = Object.values(b.items).reduce((a, it, i) => a + ctx.shop.mix[i] * it.cost * ctx.shop.costMult, 0) + b.packaging;
  const d = metric(ctx.get(), 'stockCover');
  assert.equal(d.value, 12345 / (100 * cost)); assert.equal(d.type, 'estimate');
  assert.match(d.detail, /不是逐品項庫存/); assert.match(ctx.get().assumptions.join(' '), /沒有逐品項效期/);
});

test('非缺貨流失加一人的產能與增薪都按真實公式，老闆不再重算一人', () => {
  const ctx = setup('tea', true); ctx.shop.staff = [1, 1, 1]; ctx.shop.hourEMA.fill(1); ctx.shop.hourEMA[5] = 20;
  pattern(ctx, { lost: 30, stockLost: 0 });
  const result = ctx.get(), cap = hourlyCapacity(ctx.shop, 1, S.V.capacity.wageSpeed.market), next = hourlyCapacity(ctx.shop, 2, S.V.capacity.wageSpeed.market);
  assert.equal(metric(result, 'peakCapacity').value, cap); assert.equal(result.bottleneck.id, 'staff');
  assert.deepEqual(result.decision.change, { key: 'staff', shift: 1, from: 1, to: 2 });
  const cost = 4 * ctx.world.wages.market * (1 + S.V.labor.employerPct / 100);
  assert.ok(result.decision.action.includes(`${(next - cap) * 4} 杯／日`));
  assert.ok(result.decision.action.includes(`${Math.round(cost).toLocaleString()} 元／日`));
  assert.ok(result.decision.action.includes(`${Math.ceil(cost / 50)} 杯`));
  assert.match(result.decision.tradeoff, /上限增加不等於新增訂單/);
});

test('咖啡店與餐廳座位限制按模式計算；轉外帶建議保留體驗取捨', () => {
  for (const id of ['cafe', 'restaurant']) {
    const ctx = setup(id); ctx.shop.staff = [6, 6, 6]; ctx.shop.operations.seats = 8;
    ctx.shop.operations.mode = 'dinein'; ctx.shop.hourEMA.fill(10); pattern(ctx, { lost: 20, stockLost: 0 });
    const result = ctx.get();
    assert.equal(result.bottleneck.id, 'seats'); assert.deepEqual(result.decision.change, { key: 'mode', from: 'dinein', to: 'balanced' });
    assert.equal(metric(result, 'seatCapacity').type, 'estimate'); assert.match(result.decision.tradeoff, /降低內用體驗/);
    assert.match(result.assumptions.join(' '), /未追蹤實際入座率/);
  }
});

test('餐廳某班人少時不以最多人班的廚房產能誤認成座位瓶頸', () => {
  const ctx = setup('restaurant'); ctx.shop.staff = [1, 6, 6]; ctx.shop.operations.seats = 48; ctx.shop.operations.mode = 'balanced';
  ctx.shop.hourEMA.fill(1); ctx.shop.hourEMA[1] = 6; pattern(ctx, { lost: 20, stockLost: 0 });
  const result = ctx.get(); assert.equal(result.bottleneck.id, 'staff'); assert.equal(result.decision.change.shift, 0);
});

test('髮廊工作站滿時不加沒用的人；改服務只有提高取整後產能才提出', () => {
  const ctx = setup('salon'); ctx.shop.operations.stations = 2; ctx.shop.staff = [2, 2, 2];
  ctx.shop.hourEMA.fill(2); pattern(ctx, { lost: 20, stockLost: 0 });
  let result = ctx.get(); assert.equal(result.bottleneck.id, 'stations'); assert.equal(result.decision.change.key, 'service');
  assert.equal(metric(result, 'serviceMinutes').value, 55); assert.match(metric(result, 'familiarity').detail, /不能稱為回購率/);
  ctx.shop.operations.stations = 1; result = ctx.get();
  assert.equal(result.bottleneck.id, 'capacity'); assert.equal(result.decision.change, undefined);
  assert.match(result.assumptions.join(' '), /工時由服務模式統一決定/);
});

test('健身中心分器材與人力上限；團課降低產能時不誤薦，改列設備投入及維護', () => {
  const ctx = setup('fitness'); ctx.shop.staff = [3, 3, 3]; ctx.shop.operations.stations = 40;
  ctx.shop.operations.focus = 'open'; ctx.shop.hourEMA.fill(30); pattern(ctx, { lost: 20, stockLost: 0 });
  const result = ctx.get();
  assert.equal(metric(result, 'equipmentCapacity').value, 32); assert.equal(metric(result, 'sessionMinutes').value, 75);
  assert.equal(result.bottleneck.id, 'equipment'); assert.equal(result.decision.control, 'upgrade');
  assert.equal(result.decision.change.key, 'assetLevel'); assert.match(result.decision.action, /3,000,000 元.*30,000 元／月/);
  assert.match(result.assumptions.join(' '), /沒有預收會員年費/);
});

test('每筆貢獻非正比擴量優先，裝修期不能診斷為需求不足', () => {
  const ctx = setup(); ctx.analysis.contribution = -3; pattern(ctx, { lost: 100, stockLost: 100 });
  let result = ctx.get(); assert.equal(result.bottleneck.id, 'unitEconomics'); assert.equal(result.bottleneck.severity, 'critical');
  ctx.shop.status = 'renovating'; result = ctx.get(); assert.equal(result.bottleneck.id, 'opening'); assert.equal(result.decision.control, 'cash');
});

test('客源不足時算損平差距與降價需要增量，不承諾成交會成長', () => {
  const ctx = setup(); ctx.analysis.breakEvenWithBrandDaily = 130;
  const result = ctx.get(), receipt = (70000 - 5000) / 700, extra = 50 / (50 - receipt * 0.05) - 1;
  assert.equal(result.bottleneck.id, 'demand'); assert.match(result.decision.action, /30 杯/);
  assert.ok(result.decision.action.includes(`${(100 * extra).toFixed(1)}%`));
  assert.match(result.decision.tradeoff, /增加備貨、員工或設備主要會增加成本/);
});

test('真實九業態經過營業、存讀檔後診斷仍有限且決策查詢不改保存狀態', () => {
  for (const id of Object.keys(S.BUSINESSES)) {
    const ctx = setup(id); ctx.shop.days = []; runDays(ctx.world, 8);
    const world = S.deserialize(S.serialize(ctx.world)), shop = world.shops.find((s) => s.id === ctx.shop.id);
    const before = S.serialize(world), analysis = S.getShopAnalysis(world, shop.id), review = S.getLearningReview(world, shop.id);
    const result = storeCoach({ world, shop, analysis, review });
    assert.equal(S.serialize(world), before); assert.ok(result.sample.days >= 7);
    assert.ok(result.drivers.every((d) => d.value == null || Number.isFinite(d.value)));
    assert.equal(metric(result, 'dailySales').value, meanDays(shop.days.slice(-7)));
  }
});
function meanDays(days) { return days.reduce((a, d) => a + d.cups, 0) / days.length; }
