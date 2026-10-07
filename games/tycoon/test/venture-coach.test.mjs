import test from 'node:test';
import assert from 'node:assert/strict';
import { ventureCoach } from '../venture-coach.js';
import { PRODUCTS, createManufacturing, manufacturingAction, productionPlan, stepManufacturing } from '../manufacturing.js';
import { MODELS, createTechnology, technologyMetrics, stepTechnology } from '../technology.js';
import { expense, receive, financeAction, dateOf } from '../venture-core.js';

const d = (c,id) => c.drivers.find(x => x.id === id);
function order(w, qty = 100, due = 20) {
  const price = PRODUCTS[w.productId].price, quote = qty * price, deposit = quote * .25;
  const o = { id: 'test-' + w.seq++, client: '測試採購', qty, price, quote, deposit, produced: 0, cost: 0, due, term: 30, expires: 7, depositRate: .25 };
  w.orders.push(o); receive(w,deposit); return o;
}
function finite(v) {
  if (typeof v === 'number') assert.ok(Number.isFinite(v));
  else if (v && typeof v === 'object') for (const value of Object.values(v)) finite(value);
}

test('六種業態的診斷都純讀取、可重現，數字有限且明確區分觀察與估計', () => {
  for (const w of [...Object.keys(PRODUCTS).map(id => createManufacturing(id)), ...Object.keys(MODELS).map(id => createTechnology(id))]) {
    const before = JSON.stringify(w), c = ventureCoach(w);
    assert.equal(JSON.stringify(w),before); assert.deepEqual(ventureCoach(w),c); finite(c);
    assert.ok(c.formula.text && c.bottleneck.reason && c.decision.action && c.decision.tradeoff);
    for (const x of c.drivers) { assert.ok(['state','observed','estimate'].includes(x.type)); assert.ok(x.basis); }
    if (w.mode === 'technology') assert.equal(d(c,'uptime').value,technologyMetrics(w).uptime * 100);
  }
});

test('製造不把沒有生產紀錄當作已觀察利用率', () => {
  const w = createManufacturing(); assert.equal(d(ventureCoach(w),'utilization').value,null);
  stepManufacturing(w); const c = ventureCoach(w);
  assert.equal(d(c,'utilization').type,'observed'); assert.equal(d(c,'utilization').value,0);
  assert.equal(c.bottleneck.id,'orders');
});

test('製造先付原料不會使契約毛利消失，訂金不會變成營收', () => {
  const w = createManufacturing('electronics'), o = order(w,30);
  const before = ventureCoach(w); manufacturingAction(w,'purchase',{qty:100});
  const after = ventureCoach(w);
  assert.ok(after.finance.cash < before.finance.cash); assert.equal(w.co.ledger.revenue,0);
  assert.ok(Math.abs(before.metrics.quotedContribution-after.metrics.quotedContribution)<.001);
  assert.equal(after.metrics.deposits,o.deposit); assert.equal(after.metrics.quote,o.quote);
  assert.ok(after.metrics.quotedContribution > 0); assert.equal(after.metrics.procurementCost,0);
});

test('原料短缺與未入帳尾款都反映周轉金，帳面毛利不能付款', () => {
  const w = createManufacturing('electronics'); order(w,1000); w.co.cash = 10000;
  w.receivables.push({amount:500000,due:45,client:'長帳期'});
  const c = ventureCoach(w);
  assert.equal(c.bottleneck.id,'cash'); assert.ok(c.metrics.procurementCost > c.finance.available);
  assert.equal(c.metrics.receivables,500000); assert.ok(c.metrics.quotedContribution > 0);
  assert.equal(c.finance.available,10000); assert.match(c.bottleneck.reason,/尚未入帳/);
});

test('尚有採購時間與資金的缺料訂單先提示補料，迫近交期才優先警示履約', () => {
  const w = createManufacturing(); const o = order(w,100,20);
  assert.equal(ventureCoach(w).bottleneck.id,'materials');
  assert.equal(ventureCoach(w).decision.id,'purchase-plan');
  o.due = 1; assert.equal(ventureCoach(w).bottleneck.id,'delivery');
});

test('各供應商新料價影響損平與採購，已付庫存不被重估', () => {
  const w = createManufacturing(); order(w,500);
  w.supplier = 'economy'; const low = ventureCoach(w);
  w.supplier = 'express'; const fast = ventureCoach(w);
  assert.ok(low.metrics.procurementCost < fast.metrics.procurementCost);
  assert.ok(low.metrics.breakEven < fast.metrics.breakEven);
  assert.ok(low.metrics.referenceDefects > fast.metrics.referenceDefects);
  assert.equal(d(low,'defects').value,d(fast,'defects').value);
  manufacturingAction(w,'purchase',{qty:1000}); const paid = ventureCoach(w).metrics.quotedContribution;
  w.supplier = 'economy'; assert.equal(ventureCoach(w).metrics.quotedContribution,paid);
});

test('已付在途到料時間與原有排程次序決定交期風險', () => {
  const w = createManufacturing(); const a = order(w,400,12), b = order(w,100,3);
  manufacturingAction(w,'purchase',{qty:1000}); w.shipments[0].arrival = 3;
  let c = ventureCoach(w); assert.equal(c.bottleneck.id,'delivery'); assert.equal(c.metrics.materialGap,0);
  assert.ok(c.metrics.orders.find(x => x.id === b.id).late);
  manufacturingAction(w,'priority',{id:b.id}); c = ventureCoach(w);
  assert.equal(c.metrics.orders.find(x => x.id === b.id).finishDay,3);
  assert.equal(c.metrics.orders.find(x => x.id === b.id).late,false);
  assert.ok(c.metrics.orders.find(x => x.id === a.id).finishDay >= 3);
});

test('保養停機不能被當作可用產能，異常遠交期排程仍有界', () => {
  const w = createManufacturing(); order(w,100,2);
  manufacturingAction(w,'purchase',{qty:1000}); w.shipments[0].arrival = 0; w.maintenanceUntil = 4;
  const c = ventureCoach(w); assert.equal(d(c,'goodCapacity').value,0);
  assert.ok(c.metrics.orders[0].finishDay >= 4); assert.equal(c.bottleneck.id,'delivery'); finite(c);
  w.orders[0].due = Number.MAX_SAFE_INTEGER; w.maintenanceUntil = Number.MAX_SAFE_INTEGER;
  assert.equal(ventureCoach(w).metrics.orders[0].finishDay,null);
});

test('擴線與員工限制的建議用既有設備需求，不直接建議再買產線', () => {
  const w = createManufacturing(); w.lines = 2; order(w,500,20);
  manufacturingAction(w,'purchase',{qty:1000}); w.shipments[0].arrival = 0;
  const c = ventureCoach(w); assert.equal(c.bottleneck.id,'staffing'); assert.equal(c.decision.id,'staff-plan');
  assert.match(c.decision.action,/3 人/); assert.match(c.decision.tradeoff,/固定薪資/);
});

test('包材、服飾、電子的核心學習重點不同', () => {
  const a = ventureCoach(createManufacturing('packaging'));
  const b = ventureCoach(createManufacturing('apparel'));
  const c = ventureCoach(createManufacturing('electronics'));
  assert.match(a.tradeoffs[0].text,/利用率|閒置/); assert.match(b.tradeoffs[0].text,/交期|良品/); assert.match(c.tradeoffs[0].text,/周轉|尾款/);
  assert.notEqual(a.tradeoffs[0].title,b.tradeoffs[0].title); assert.notEqual(b.tradeoffs[0].title,c.tradeoffs[0].title);
});

test('現金跑道先扣已發生未付支出、利息與本金，不把借款當利潤', () => {
  const w = createTechnology(); financeAction(w,'borrow',240000); expense(w,'payroll',20000);
  const c = ventureCoach(w);
  assert.equal(c.finance.interest,1600); assert.equal(c.finance.principal,10000);
  assert.equal(c.finance.available,w.co.cash-20000-1600-10000);
  assert.ok(c.finance.monthlyBurn > 0); assert.ok(c.finance.runwayMonths > 0);
  assert.match(c.finance.detail,/跑道不是破產日期/);
});

test('SaaS 免費用戶有成本，廣告新客 CAC 與付費客 CAC 分開', () => {
  const w = createTechnology('saas'), m = technologyMetrics(w), c = ventureCoach(w);
  assert.equal(d(c,'acquisitionCost').value,m.acquisitionCost);
  assert.equal(d(c,'paidCac').value,m.acquisitionCost/m.conversion);
  assert.ok(c.metrics.paidCac > m.acquisitionCost); assert.match(d(c,'conversion').detail,/現有免費使用者/);
  const moreFree = {...w,users:w.users+100}; const x = ventureCoach(moreFree);
  assert.ok(x.metrics.variable > c.metrics.variable); assert.equal(x.metrics.revenue,c.metrics.revenue);
});

test('平台 GMV 不是營收，規模增加會改變媒合，損平重算流動性', () => {
  const w = createTechnology('marketplace'), c = ventureCoach(w);
  assert.equal(c.bottleneck.id,'liquidity'); assert.equal(c.metrics.paidCac,null);
  assert.match(c.formula.detail,/收入只有抽成/);
  const m = technologyMetrics(w), dim = dateOf(w.day).dim;
  const expected = w.users*.055*(.6+w.quality*.6)*Math.min(1,w.users/2500)*m.uptime*dim;
  assert.ok(Math.abs(c.metrics.transactions-expected)<.00001);
  assert.ok(Math.abs(c.metrics.revenue-expected*MODELS.marketplace.ticket*w.price/100)<.00001);
  const x = ventureCoach({...w,users:w.users*2}); assert.ok(x.metrics.transactions > c.metrics.transactions*3.5);
  if (c.metrics.breakEven !== null) {
    const at = ventureCoach({...w,users:c.metrics.breakEven}); assert.ok(at.metrics.monthlyResult >= -.001);
    const prior = ventureCoach({...w,users:c.metrics.breakEven-1}); assert.ok(prior.metrics.monthlyResult < .001);
  }
});

test('內容網站收入由瀏覽、廣告密度與 CPM 形成，過密也提高活躍流失', () => {
  const w = createTechnology('content'), base = ventureCoach(w);
  assert.equal(base.metrics.paidCac,null); assert.equal(base.metrics.revenue,base.metrics.visits*w.price*MODELS.content.adCPM/1000);
  w.price = 5; const ads = ventureCoach(w);
  assert.ok(ads.metrics.revenue > base.metrics.revenue); assert.ok(ads.metrics.activeChurn > base.metrics.activeChurn);
  assert.equal(d(ads,'churn').value,ads.metrics.activeChurn*100); assert.match(ads.decision.tradeoff,/技術債|流失|固定/);
});

test('高負載退款進入預估貢獻，不能只顯示樂觀 LTV', () => {
  for (const id of Object.keys(MODELS)) {
    const w = createTechnology(id); w.users = MODELS[id].capacity*2; if (id==='saas') w.paying = 100;
    const c = ventureCoach(w), m = technologyMetrics(w);
    assert.ok(m.uptime < .9); assert.ok(c.metrics.refunds > 0);
    assert.ok(Math.abs(c.metrics.contribution-(c.metrics.revenue-c.metrics.variable-c.metrics.refunds))<.0001);
    assert.equal(c.bottleneck.id,'reliability'); assert.equal('ltv' in c.metrics,false);
    finite(c);
  }
});

test('結案與待決事件不會建議跳過，實際新增觀察不冒充付費轉換率', () => {
  const w = createTechnology(); stepTechnology(w); const before = JSON.stringify(w), c = ventureCoach(w);
  assert.equal(JSON.stringify(w),before); assert.equal(c.metrics.observedAcquired,w.today.acquired);
  assert.equal(c.metrics.observedConverted,w.today.converted); assert.equal(c.metrics.observedChurned,w.today.churned);
  w.event = {title:'供應商事件',text:'測試'}; assert.equal(ventureCoach(w).bottleneck.id,'event');
  w.status = 'finished'; assert.equal(ventureCoach(w).bottleneck.id,'closed');
});
