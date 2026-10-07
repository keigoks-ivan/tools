import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, createTechnology, technologyMetrics, technologyEconomics, technologyBreakEven, stepTechnology } from '../technology.js';
import { dateOf } from '../venture-core.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const rounded = (actual, expected) => assert.ok(actual === Math.floor(expected) || actual === Math.ceil(expected), `${actual} is not stochastic rounding of ${expected}`);
const targetContribution = (w, n) => technologyEconomics(w, { users: w.modelId === 'saas' ? w.users - w.paying + n : n, paying: w.modelId === 'saas' ? n : 0 }).contribution;

for (const id of Object.keys(MODELS)) test(`${id}：流失率與 LTV 使用實際對應客群，不改逐日抽樣機制`, () => {
  const w = createTechnology(id); w.users = 1000; w.paying = id === 'saas' ? 100 : 0;
  const m = technologyMetrics(w), users = w.users, paying = w.paying, dim = dateOf(w.day).dim;
  near(m.activeChurn, Math.min(.5, m.paidChurn * 1.6));
  assert.equal(m.churn, id === 'saas' ? m.paidChurn : m.activeChurn);
  near(m.ltv, Math.max(0, m.monthlyUnit / m.churn));
  stepTechnology(w);
  const lostPaid = paying + w.today.converted - w.paying, lostActive = w.today.churned - lostPaid;
  rounded(lostPaid, paying * m.paidChurn / dim);
  rounded(lostActive, (users - paying) * m.activeChurn / dim);
});

for (const id of Object.keys(MODELS)) test(`${id}：月貢獻含實際支付、服務、交易與條件退款`, () => {
  const w = createTechnology(id); w.users = 2000; w.paying = id === 'saas' ? 300 : 0;
  const p = MODELS[id], dim = dateOf(w.day).dim;
  for (const uptime of [.999, .9, .85, .35]) {
    const e = technologyEconomics(w, { uptime });
    const trades = id === 'marketplace' ? w.users * .055 * (.6 + w.quality * .6) * Math.min(1, w.users / 2500) * uptime * Math.max(.5, Math.min(1.2, 1 - (w.price - 8) * .035)) * dim : 0;
    const visits = id === 'content' ? w.users * (2 + w.quality * 3) * uptime * dim : 0;
    const revenue = id === 'saas' ? w.paying * w.price * uptime : id === 'marketplace' ? trades * p.ticket * w.price / 100 : visits * w.price * p.adCPM / 1000;
    const variable = w.users * (id === 'saas' ? 8 : .35) + (id === 'saas' ? revenue * .035 : 0) + trades * 4;
    const refunds = uptime < .9 ? revenue * (1 - uptime) * .25 : 0;
    near(e.revenue, revenue); near(e.variable, variable); near(e.refunds, refunds);
    near(e.contribution, revenue - variable - refunds);
    near(e.monthlyUnit * (id === 'saas' ? w.paying : w.users) - (id === 'saas' ? (w.users - w.paying) * 8 : 0), e.contribution);
  }
});

for (const id of Object.keys(MODELS)) test(`${id}：每日引擎使用相同流量與退款因子，沒有重複收費`, () => {
  const w = createTechnology(id); w.users = MODELS[id].capacity * 3; w.paying = id === 'saas' ? 250 : 0;
  const before = structuredClone(w), m = technologyMetrics(w), dim = dateOf(w.day).dim;
  const cloud = w.co.ledger.cloud, penalty = w.co.ledger.penalty;
  stepTechnology(w);
  const e = technologyEconomics(before, { users: w.users, paying: w.paying, uptime: m.uptime });
  if (id === 'marketplace') rounded(w.today.transactions, e.dailyTransactions);
  if (id === 'content') rounded(w.today.visits, e.dailyVisits);
  if (id === 'saas') near(w.today.revenue, w.paying * w.price / dim * m.uptime);
  near(w.co.ledger.cloud - cloud, 4500 * 2 ** before.cloudTier / dim + w.users * (id === 'saas' ? 8 : .35) / dim + (id === 'saas' ? w.today.revenue * .035 : 0) + w.today.transactions * 4);
  near(w.co.ledger.penalty - penalty, w.today.revenue * (1 - m.uptime) * .25);
});

for (const [id, expected] of [['saas', 222], ['marketplace', 1410], ['content', 148535]]) test(`${id}：損平按目標規模重算，前一人仍虧損`, () => {
  const w = createTechnology(id), m = technologyMetrics(w);
  assert.equal(m.breakEven, expected);
  assert.ok(targetContribution(w, expected - 1) < m.fixed);
  assert.ok(targetContribution(w, expected) >= m.fixed);
  assert.ok(expected <= MODELS[id].market - (id === 'saas' ? w.users - w.paying : 0));
});

test('SaaS 損平保持既有免費使用者的服務負擔，付費目標亦占主機容量', () => {
  const w = createTechnology('saas'), original = technologyMetrics(w).breakEven;
  w.users = 1000; w.paying = 100;
  const m = technologyMetrics(w), free = 900;
  assert.ok(m.breakEven > original);
  const at = technologyEconomics(w, { users: free + m.breakEven, paying: m.breakEven });
  assert.ok(at.load > 1); assert.ok(at.contribution >= m.fixed);
  assert.ok(targetContribution(w, m.breakEven - 1) < m.fixed);
});

test('有限市場或負貢獻不足支應固定費時，損平不能外推成不存在的客戶數', () => {
  for (const id of Object.keys(MODELS)) {
    const w = createTechnology(id);
    assert.equal(technologyBreakEven(w, 1e10), null);
  }
  const saas = createTechnology('saas'); saas.users = MODELS.saas.market; saas.paying = 1;
  assert.equal(technologyMetrics(saas).breakEven, null);
  const content = createTechnology('content'); content.price = 1; content.quality = .1;
  assert.equal(technologyMetrics(content).breakEven, null);
});

test('負載導致獲利先升後降時，損平找到較早的短暫可行區，不因市場上限虧損而漏判', () => {
  const w = createTechnology('content'); w.quality = .1; w.price = 1;
  const fixed = 9000, n = technologyBreakEven(w, fixed);
  assert.equal(n, 10205);
  assert.ok(targetContribution(w, n - 1) < fixed); assert.ok(targetContribution(w, n) >= fixed);
  assert.ok(targetContribution(w, MODELS.content.market) < fixed);
});

test('非單調曲線只有一個整數規模可損平時，按極值分段仍找得到', () => {
  const w = createTechnology('content'); w.quality = .1; w.price = 1;
  const peak = 24913, fixed = targetContribution(w, peak) * .999999999;
  assert.ok(targetContribution(w, peak - 1) < fixed); assert.ok(targetContribution(w, peak + 1) < fixed);
  assert.equal(technologyBreakEven(w, fixed), peak);
});

test('可用率跨過 90% 觸發退款的跳點，損平不漏掉跳點前的最後一人', () => {
  const w = createTechnology('content'), lastWithoutRefund = 14200;
  const fixed = targetContribution(w, lastWithoutRefund) - .01;
  assert.equal(technologyEconomics(w, { users: lastWithoutRefund, paying: 0 }).refunds, 0);
  assert.ok(targetContribution(w, lastWithoutRefund - 1) < fixed);
  assert.ok(targetContribution(w, lastWithoutRefund + 1) < fixed);
  assert.equal(technologyBreakEven(w, fixed), lastWithoutRefund);
});

test('利息等額外固定費可納入同一損平公式；查詢不改 RNG、狀態或帳務', () => {
  const w = createTechnology('marketplace'), raw = JSON.stringify(w), m = technologyMetrics(w), fixed = m.fixed + 8000;
  const n = technologyBreakEven(w, fixed);
  assert.ok(n > m.breakEven); assert.ok(targetContribution(w, n - 1) < fixed); assert.ok(targetContribution(w, n) >= fixed);
  assert.deepEqual(technologyMetrics(w), m); technologyEconomics(w);
  assert.equal(JSON.stringify(w), raw);
  assert.equal(technologyMetrics(w, { includeBreakEven: false }).breakEven, null);
});
