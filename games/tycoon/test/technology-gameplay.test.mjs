import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, PROJECTS, STRATEGIES, RELEASES, createTechnology, technologyProjects, technologyProjectPlan, technologyEffects, technologyMetrics, technologyEconomics, technologyBreakEven, technologyAction as act, stepTechnology as step, technologyValid } from '../technology.js';
import { dateOf, cashIdentity } from '../venture-core.js';
import { encodeVenture, decodeVenture } from '../venture-saves.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const rounded = (actual, expected) => assert.ok(actual === Math.floor(expected) || actual === Math.ceil(expected), `${actual} != rounding(${expected})`);
const settings = (w, changes = {}) => ({ engineers: w.engineers, support: w.support, marketing: w.marketing, price: w.price, cloudTier: w.cloudTier, focus: w.focus, ...changes });
const cashValid = w => { near(cashIdentity(w.co.ledger, w.co.cash), 0); w.co.history.forEach(r => near(cashIdentity(r, r.cashEnd), 0)); };
function complete(w, id, release = 'standard') {
  assert.ok(act(w, 'project', { id, release }).ok);
  w.project.progress = technologyProjectPlan(w, id).days - .1;
  assert.ok(step(w)); assert.equal(w.project, null);
}

test('三種產品有共同維運專案與各自的兩項能力，跨業態與原型名稱原子拒絕', () => {
  for (const modelId of Object.keys(MODELS)) {
    const w = createTechnology(modelId), list = technologyProjects(modelId);
    assert.equal(Object.keys(list).length, 5);
    for (const id of ['value', 'retention', 'reliability']) assert.ok(list[id]);
    const other = Object.keys(PROJECTS).find(id => PROJECTS[id].modelId && PROJECTS[id].modelId !== modelId);
    for (const id of [other, 'constructor', 'toString', 'missing']) {
      const raw = JSON.stringify(w); assert.equal(act(w, 'project', { id }).ok, false); assert.equal(JSON.stringify(w), raw);
    }
  }
  assert.throws(() => createTechnology('constructor'), /未知/);
});

test('試點與搶先發布明確交換費用、工程工作量和技術債，查詢不改狀態', () => {
  const w = createTechnology(), raw = JSON.stringify(w), standard = technologyProjectPlan(w, 'value'), pilot = technologyProjectPlan(w, 'value', 'pilot'), rush = technologyProjectPlan(w, 'value', 'rush');
  assert.equal(standard.days, 35); assert.equal(standard.fee, 18000); near(standard.debt, .06);
  assert.equal(pilot.days, 49); assert.equal(pilot.fee, 27000); near(pilot.debt, .012);
  assert.equal(rush.days, 23); assert.equal(rush.fee, 15300); near(rush.debt, .16);
  assert.ok(pilot.estimatedDays > standard.estimatedDays); assert.ok(standard.estimatedDays > rush.estimatedDays);
  near(technologyProjectPlan(w, 'reliability', 'pilot').debt, -.25);
  near(technologyProjectPlan(w, 'reliability', 'rush').debt, -.12);
  assert.equal(technologyProjectPlan(w, 'value', 'constructor'), null); assert.equal(JSON.stringify(w), raw);
});

test('發布方式影響實際完成日與留下的技術債，並支付一次測試費', () => {
  const result = {};
  for (const release of Object.keys(RELEASES)) {
    const w = createTechnology(); w.marketing = 0;
    const plan = technologyProjectPlan(w, 'activation', release), cash = w.co.cash;
    assert.ok(act(w, 'project', { id: 'activation', release }).ok); assert.equal(w.co.cash, cash - plan.fee);
    while (w.project) assert.ok(step(w));
    result[release] = { day: w.day, debt: w.techDebt };
    assert.equal(w.day, plan.estimatedDays); assert.equal(w.stats.projectsCompleted, 1);
    assert.equal(w.today.completedProject, 'activation'); assert.ok(w.co.log.some(x => x.text.includes(plan.releaseName) && x.text.includes('上線')));
    assert.ok(technologyValid(w)); cashValid(w);
  }
  assert.ok(result.rush.day < result.standard.day && result.standard.day < result.pilot.day);
  assert.ok(result.rush.debt > result.standard.debt && result.standard.debt > result.pilot.debt);
});

test('架構試點與搶先發布的文字、容量效果和技術債上限使用當前選擇', () => {
  const w = createTechnology(); w.capacityBonus = 2.9;
  for (const [release, debt] of [['pilot', -.25], ['rush', -.12]]) {
    const plan = technologyProjectPlan(w, 'reliability', release);
    near(plan.debt, debt); near(plan.capacityGain, 3 / 2.9 - 1);
    assert.ok(plan.text.includes(plan.releaseName)); assert.ok(plan.text.includes(Math.abs(debt * 100).toFixed(1) + ' 點'));
    assert.ok(plan.text.includes((plan.capacityGain * 100).toFixed(1) + '%')); assert.ok(!plan.text.includes('22 點'));
  }
  w.capacityBonus = 3; assert.equal(technologyProjectPlan(w, 'reliability', 'pilot').capacityGain, 0);
  assert.match(technologyProjectPlan(w, 'reliability', 'rush').text, /增加基礎容量 0.0%/);
  assert.equal(technologyProjectPlan(w, 'activation', 'pilot').capacityGain, 0);
});

test('完成紀錄顯示技術債和容量的實際上下限效果，不宣稱名目發布效果', () => {
  for (const [release, capacityBonus] of [['pilot', 2.9], ['rush', 3]]) {
    const w = createTechnology(); w.techDebt = .04; w.capacityBonus = capacityBonus;
    const plan = technologyProjectPlan(w, 'reliability', release);
    assert.ok(act(w, 'project', { id: 'reliability', release }).ok); w.project.progress = plan.days - .1; step(w);
    const preReleaseDebt = Math.max(0, Math.min(1, .04 + .0015 + w.today.acquired / 30000 + .001 - .55 * .0025));
    const log = w.co.log.find(x => x.text.includes('已上線')).text;
    assert.equal(w.techDebt, 0); assert.equal(w.capacityBonus, 3);
    assert.ok(log.includes(`實際消除 ${(preReleaseDebt * 100).toFixed(1)} 點`));
    assert.ok(log.includes(`容量實際增加 ${((3 / capacityBonus - 1) * 100).toFixed(1)}%`));
    assert.ok(!log.includes(`消除 ${Math.abs(plan.debt * 100).toFixed(1)} 點`));
  }
  const w = createTechnology(); w.techDebt = .96;
  act(w, 'project', { id: 'value', release: 'rush' }); w.project.progress = technologyProjectPlan(w, 'value').days - .1; step(w);
  const preReleaseDebt = Math.max(0, Math.min(1, .96 + .0015 + w.today.acquired / 30000 + .001 - .55 * .0025));
  const log = w.co.log.find(x => x.text.includes('已上線')).text;
  assert.equal(w.techDebt, 1); assert.ok(log.includes(`實際增加 ${((1 - preReleaseDebt) * 100).toFixed(1)} 點`)); assert.ok(!log.includes('增加 16.0 點'));
});

test('SaaS 自助與團隊策略有相反的獲客、轉換、流失和服務成本取捨', () => {
  const w = createTechnology(), base = technologyMetrics(w), own = technologyMetrics({ ...w, strategy: 'selfserve' }), team = technologyMetrics({ ...w, strategy: 'teams' });
  assert.ok(own.acquisitionCost < base.acquisitionCost); assert.ok(own.conversion > base.conversion); assert.ok(own.churn > base.churn);
  assert.ok(team.acquisitionCost > base.acquisitionCost); assert.ok(team.conversion < base.conversion); assert.ok(team.churn < base.churn);
  assert.equal(team.userCost, 10); assert.equal(team.market, 18000); assert.ok(team.supportCapacity < base.supportCapacity);
  assert.ok(act(w, 'strategy', { id: 'teams' }).ok); assert.equal(w.strategy, 'teams');
  assert.ok(act(w, 'settings', settings(w, { price: 599 })).ok); assert.equal(w.strategy, 'teams');
});

test('平台垂直市場先形成密度，大眾市場有較低 CAC 卻需要更大雙邊規模', () => {
  const w = createTechnology('marketplace'), base = technologyMetrics(w), niche = technologyMetrics({ ...w, strategy: 'niche' }), mass = technologyMetrics({ ...w, strategy: 'mass' });
  assert.equal(niche.liquidityTarget, 1200); assert.equal(niche.market, 45000); assert.ok(niche.transactions > base.transactions);
  assert.equal(mass.liquidityTarget, 5000); assert.ok(mass.acquisitionCost < base.acquisitionCost); assert.ok(mass.transactions < base.transactions);
  w.users = 6000; w.cloudTier = 2;
  assert.ok(technologyEconomics({ ...w, strategy: 'mass' }).transactions > technologyEconomics(w).transactions);
});

test('內容搜尋與社群策略分別改變自然流量、瀏覽深度、廣告收益和客服需求', () => {
  const w = createTechnology('content'), base = technologyMetrics(w), search = technologyMetrics({ ...w, strategy: 'search' }), community = technologyMetrics({ ...w, strategy: 'community' });
  assert.ok(search.organicMultiplier > base.organicMultiplier); assert.ok(search.visits < base.visits); assert.ok(search.adCPM > base.adCPM); assert.ok(search.userCost > base.userCost);
  assert.ok(community.visits > base.visits); assert.ok(community.churn < base.churn); assert.ok(community.adCPM < base.adCPM); assert.ok(community.supportCapacity < base.supportCapacity);
});

for (const modelId of Object.keys(MODELS)) test(`${modelId}：業態能力只在完成後生效且不可重複疊加`, () => {
  const w = createTechnology(modelId), specials = Object.keys(technologyProjects(modelId)).filter(id => PROJECTS[id].modelId);
  for (const id of specials) {
    const before = technologyEffects(w), plan = technologyProjectPlan(w, id, 'pilot');
    assert.ok(act(w, 'project', { id, release: 'pilot' }).ok); assert.deepEqual(technologyEffects(w), before);
    w.project.progress = plan.days - .1; step(w); assert.ok(w.capabilities.includes(id)); assert.equal(w.project, null);
    const raw = JSON.stringify(w); assert.equal(act(w, 'project', { id }).ok, false); assert.equal(JSON.stringify(w), raw);
  }
  assert.equal(w.stats.projectsCompleted, 2); assert.ok(technologyValid(w)); cashValid(w);
  const fx = technologyEffects(w);
  if (modelId === 'saas') { assert.equal(fx.userCost, 6); assert.equal(fx.toolingCost, 3500); near(fx.conversionMultiplier, 1.18); }
  else if (modelId === 'marketplace') { near(fx.liquidityTarget, 1750); assert.equal(fx.transactionCost, 5); near(fx.churnMultiplier, .88); }
  else { near(fx.organicMultiplier, 1.35); near(fx.visitMultiplier, 1.1); near(fx.adCPM, 21.6); near(fx.userCost, .5); }
});

test('SaaS 自動化工具的固定月費、全用戶成本與 LTV 使用同一帳務來源', () => {
  const w = createTechnology(); complete(w, 'automation');
  w.users = 1100; w.paying = 200; w.cloudTier = 2; w.strategy = 'teams';
  const m = technologyMetrics(w), cloud = w.co.ledger.cloud, dim = dateOf(w.day).dim;
  assert.equal(m.userCost, 8); assert.equal(m.fixed, 45000 + 30000 + 6000 + 18000 + 18000 + 3500);
  near(m.ltv, m.monthlyUnit / m.churn); step(w);
  near(w.co.ledger.cloud - cloud, (4500 * 2 ** 2 + 3500) / dim + w.users * 8 / dim + w.today.revenue * .035);
  cashValid(w);
});

test('平台信任機制降低流失也增加逐筆成本，成交與 GMV 仍分開認列', () => {
  const w = createTechnology('marketplace'); complete(w, 'matching'); complete(w, 'trust');
  w.users = 4500; w.cloudTier = 2; w.strategy = 'niche';
  const before = structuredClone(w), m = technologyMetrics(w), cloud = w.co.ledger.cloud, dim = dateOf(w.day).dim;
  step(w); const e = technologyEconomics(before, { users: w.users, uptime: m.uptime });
  rounded(w.today.transactions, e.dailyTransactions);
  near(w.today.revenue, w.today.transactions * MODELS.marketplace.ticket * w.price / 100);
  near(w.co.ledger.cloud - cloud, 4500 * 2 ** 2 / dim + w.users * .35 / dim + w.today.transactions * 5); cashValid(w);
});

test('內容能力與客群策略影響實際瀏覽、廣告收入及使用量費，與月貢獻一致', () => {
  const w = createTechnology('content'); complete(w, 'evergreen'); complete(w, 'analytics');
  w.users = 10000; w.cloudTier = 1; w.strategy = 'search';
  const before = structuredClone(w), m = technologyMetrics(w), cloud = w.co.ledger.cloud, dim = dateOf(w.day).dim;
  step(w); const e = technologyEconomics(before, { users: w.users, uptime: m.uptime });
  rounded(w.today.visits, e.dailyVisits); near(w.today.revenue, w.today.visits * w.price * e.adCPM / 1000);
  near(w.co.ledger.cloud - cloud, 9000 / dim + w.users * e.userCost / dim); cashValid(w);
});

test('縮小策略市場保留既有客群，新增不會變負數，損平不可越過可觸及上限', () => {
  const w = createTechnology('marketplace'); w.users = 60000; w.cloudTier = 5; w.support = 15;
  assert.ok(act(w, 'strategy', { id: 'niche' }).ok); assert.equal(w.users, 60000); step(w); assert.equal(w.today.acquired, 0); assert.ok(w.users <= 60000 && w.users > 0);
  assert.ok(technologyValid(w)); assert.equal(technologyBreakEven(w, 1e10), null);
  const n = technologyBreakEven(w, 10000); assert.ok(n !== null && n <= 45000);
});

test('所有策略與完成能力的非線性損平找出第一個可行整數，LTV 含新成本', () => {
  for (const modelId of Object.keys(MODELS)) for (const strategy of Object.keys(STRATEGIES[modelId])) {
    const w = createTechnology(modelId); w.strategy = strategy; w.capabilities = Object.keys(technologyProjects(modelId)).filter(id => PROJECTS[id].modelId); w.cloudTier = 1; w.techDebt = .65;
    const m = technologyMetrics(w), free = modelId === 'saas' ? w.users - w.paying : 0, fixed = modelId === 'content' ? 14000 : m.fixed;
    const contribution = n => technologyEconomics(w, { users: free + n, paying: modelId === 'saas' ? n : 0 }).contribution;
    let expected = null;
    for (let n = 1; n <= m.market - free; n++) if (contribution(n) >= fixed) { expected = n; break; }
    assert.equal(technologyBreakEven(w, fixed), expected, `${modelId}/${strategy}`); near(m.ltv, Math.max(0, m.monthlyUnit / m.churn));
  }
});

test('舊存檔缺少策略、能力及發布方式仍可讀取，預設經濟與下一日一致', () => {
  for (const modelId of Object.keys(MODELS)) {
    const w = createTechnology(modelId); act(w, 'project', { id: 'retention' });
    const old = structuredClone(w); delete old.strategy; delete old.capabilities; delete old.project.release;
    const raw = encodeVenture(old), decoded = decodeVenture(raw, 'technology').world;
    assert.deepEqual(decoded, old); assert.deepEqual(technologyMetrics(w), technologyMetrics(old));
    step(w); step(decoded); delete w.strategy; delete w.capabilities; delete w.project.release;
    assert.deepEqual(decoded, w);
  }
});

test('新策略、能力、發布紀錄跨存讀檔後逐日一致，無效新欄位不覆寫世界', () => {
  for (const modelId of Object.keys(MODELS)) {
    const w = createTechnology(modelId), strategy = Object.keys(STRATEGIES[modelId]).at(-1), id = Object.keys(technologyProjects(modelId)).find(k => PROJECTS[k].modelId);
    act(w, 'strategy', { id: strategy }); act(w, 'project', { id, release: 'rush' });
    for (let i = 0; i < 10; i++) step(w);
    const saved = decodeVenture(encodeVenture(w), 'technology').world;
    for (let i = 0; i < 25; i++) { step(w); step(saved); }
    assert.deepEqual(saved, w); assert.ok(technologyValid(w)); cashValid(w);
  }
  const w = createTechnology();
  for (const [action, data] of [['strategy', { id: 'search' }], ['strategy', { id: 'constructor' }], ['strategy', { id: { toString: 'bad' } }], ['project', { id: 'activation', release: 'unknown' }], ['project', { id: { toString: 'bad' } }], ['settings', settings(w, { strategy: null })]]) {
    const raw = JSON.stringify(w); assert.equal(act(w, action, data).ok, false); assert.equal(JSON.stringify(w), raw);
  }
  for (const mutate of [x => x.strategy = 'search', x => x.strategy = { toString: 'bad' }, x => x.capabilities = ['trust'], x => x.capabilities = ['automation', 'automation'], x => x.capabilities = [{ toString: 'bad' }], x => x.capabilities = null, x => x.stats.projectsCompleted = .5, x => x.project = { id: 'matching', progress: 0 }, x => x.project = { id: 'value', progress: 0, release: null }, x => x.shock = { cac: 1, outage: 0, until: 1e100 }]) {
    const bad = structuredClone(w); mutate(bad); assert.equal(technologyValid(bad), false); assert.throws(() => decodeVenture(encodeVenture(bad), 'technology'));
  }
});
