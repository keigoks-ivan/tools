import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTERPRISES, createEnterprise, enterpriseAction, enterpriseMetrics, enterpriseQuote, enterpriseTerms, stepEnterprise, enterpriseValid } from '../enterprise.js';
import { enterpriseCoach, enterpriseLearningSnapshot, enterpriseDraft } from '../enterprise-coach.js';
import { recordDecision, decisionReviews, completeDecisions, observation, learningValid } from '../decision-learning.js';
import { coachHtml, decisionReviewsHtml } from '../learning-view.js';
import { spend, dateOf, cashIdentity, profit } from '../venture-core.js';
import { encodeVenture, decodeVenture } from '../venture-saves.js';

const clone=w=>structuredClone(w);
const settings=(w,patch={})=>({price:w.price,marketing:w.marketing,qualityBudget:w.qualityBudget,channel:w.channel,targetDays:w.targetDays,policy:w.policy||'standard',...patch});
const remember=(w,title,before)=>w.learning=recordDecision(w.learning,{scope:'enterprise:'+w.businessId,title,day:w.day,fromDay:w.day,mode:'enterprise',unit:ENTERPRISES[w.businessId].unit,businessId:w.businessId,before,after:enterpriseLearningSnapshot(w),rows:w.co.daily});
const bid=(w,terms='standard')=>{w.rng=7;const o=w.offers[0],q=enterpriseQuote(w,o,.9,terms);assert.equal(enterpriseAction(w,'bid',{id:o.id,factor:.9,terms}).ok,true);assert.ok(w.orders.length);return {o,q};};
const run=(w,n)=>{for(let i=0;i<n;i++){if(w.event)enterpriseAction(w,'event',{choice:'accept'});if(!stepEnterprise(w))break;if(w.learning)w.learning=completeDecisions(w.learning,()=>w.co.daily);assert.ok(Math.abs(cashIdentity(w.co.ledger,w.co.cash))<.01);}};

for(const id of Object.keys(ENTERPRISES))test(`${id}: industry drivers, drafts and rendering are pure; decisions survive saves and freeze actual observations`,()=>{
  const w=createEnterprise(id),original=clone(w),c=enterpriseCoach(w);assert.equal(c.businessId,id);assert.ok(c.drivers.length>=6);assert.ok(c.drivers.every(d=>d.value===null||Number.isFinite(d.value)));assert.ok(c.formula.text.includes('損益'));assert.ok(c.decision.tradeoff);assert.ok(coachHtml(c).includes('經營關鍵'));
  const draft=enterpriseDraft(w,settings(w,{price:w.price+(id==='hotel'?100:id==='ecommerce'?50:5),marketing:w.marketing*4,policy:'premium'}));assert.ok(draft.changes.length);assert.ok(draft.notes.length>=3);assert.equal(enterpriseDraft(w,settings(w,{price:0})),null);assert.equal(enterpriseDraft(w,settings(w,{policy:'unknown'})),null);assert.deepEqual(w,original,'coach, rendering and pure draft cannot draw RNG or spend cash');
  const before=enterpriseLearningSnapshot(w);enterpriseAction(w,'settings',settings(w,{marketing:w.marketing*4,policy:'premium'}));remember(w,'調整定位與業務投資',before);assert.equal(learningValid(w.learning),true);assert.equal(w.learning[0].baseline.days,0);run(w,7);const reviewed=decisionReviews(w.learning,'enterprise:'+id,w.co.daily)[0];assert.equal(reviewed.after.days,7);assert.equal(reviewed.after.metrics.length,6);assert.equal(reviewed.after.metrics.find(x=>x.id==='cashChange').value,w.co.daily.slice(-7).reduce((n,r)=>n+r.cashChange,0)/7);assert.ok(decisionReviewsHtml([reviewed]).includes('不能單獨證明因果'));assert.deepEqual(decodeVenture(encodeVenture(w),'enterprise').world,w);
  const frozen=clone(w.learning[0].completed);w.co.daily=[];assert.deepEqual(decisionReviews(w.learning,'enterprise:'+id,[])[0].after,frozen);assert.equal(learningValid(w.learning),true);
});

test('hotel service positioning trades contribution and housekeeping capacity for demand; low-quality compensation and depreciation enter break-even',()=>{
  const w=createEnterprise('hotel');w.staff=2;w.manager.enabled=false;const lean={...clone(w),policy:'lean'},premium={...clone(w),policy:'premium'},a=enterpriseMetrics(lean),b=enterpriseMetrics(premium);assert.ok(b.demand>a.demand);assert.ok(b.capacity<a.capacity);assert.ok(b.contribution<a.contribution);stepEnterprise(premium);assert.equal(premium.co.ledger.cogs,premium.today.sales*b.unitCost);
  w.quality=.2;const m=enterpriseMetrics(w);assert.ok(m.compensation>0);assert.ok(m.accountingFixed>m.fixed);assert.equal(m.breakEven,Math.ceil(m.accountingFixed/m.contribution));assert.equal(m.monthlyResult,m.sold*m.contribution*dateOf(w.day).dim-m.accountingFixed);
});

test('commerce positioning changes real fulfillment cost, demand, capacity and returns; estimates use paid stock cost rather than new supply price',()=>{
  const w=createEnterprise('ecommerce');w.manager.enabled=false;w.stock={qty:1000,value:510000};spend(w,510000,'purchases');w.shock={cost:1.2,demand:1,until:30};const low={...clone(w),policy:'lean'},high={...clone(w),policy:'premium'},a=enterpriseMetrics(low),b=enterpriseMetrics(high);assert.ok(b.demand>a.demand);assert.ok(b.capacity<a.capacity);assert.ok(b.returnRate<a.returnRate);assert.equal(b.stockCost,510);assert.equal(b.unitCost,396);stepEnterprise(high);assert.equal(high.co.ledger.cloud,high.today.sales*(85+high.price*.045));assert.equal(high.today.refunds,high.today.returns*high.price);assert.ok(Math.abs(high.co.ledger.cogs-(high.today.sales-Math.floor(high.today.returns*.5))*510)<.01);
  const old=enterpriseCoach(w).drivers.find(d=>d.id==='adPerSale');assert.equal(old.value,null);assert.equal(old.type,'observed');
});

for(const id of ['equipment','ai','agency','security'])test(`${id}: credit choices alter cash, acceptance chance and actual invoice dates; signed service promises stay locked`,()=>{
  const w=createEnterprise(id),o=w.offers[0],standard=enterpriseQuote(w,o,.9),advance=enterpriseQuote(w,o,.9,'advance'),credit=enterpriseQuote(w,o,.9,'credit'),initial=clone(w);
  assert.ok(advance.deposit>standard.deposit);assert.ok(advance.chance<standard.chance);assert.ok(advance.term<standard.term);assert.ok(credit.deposit<standard.deposit);assert.ok(credit.chance>standard.chance);assert.ok(credit.term>standard.term);assert.equal(advance.quote,credit.quote);assert.deepEqual(w,initial);
  w.policy='premium';const {q}=bid(w,'advance'),contract=clone(w.orders[0]);assert.equal(contract.term,q.term);assert.equal(contract.depositRate,q.depositRate);assert.equal(w.co.ledger.revenue,0);assert.equal(w.co.ledger.receipts,q.deposit);assert.equal(enterpriseValid(w),true);
  enterpriseAction(w,'settings',settings(w,{policy:'lean',price:140}));assert.deepEqual(w.orders[0],contract);while(!w.stats.delivered&&w.day<100)run(w,1);assert.equal(w.stats.delivered,1);assert.equal(w.clients[0].fee,q.serviceFee);assert.equal(w.clients[0].work,q.serviceWork);assert.equal(w.receivables[0].due,w.day-1+q.term);assert.deepEqual(decodeVenture(encodeVenture(w),'enterprise').world,w);
});

test('delivery-only projects create no paid service obligation, and legacy promises keep standard terms after changing new positioning',()=>{
  const w=createEnterprise('agency');w.policy='lean';bid(w);w.policy='premium';while(!w.stats.delivered)run(w,1);assert.equal(w.clients.length,0);assert.equal(w.stats.serviceRevenue,0);
  const old=createEnterprise('ai');delete old.policy;bid(old);delete old.orders[0].terms;delete old.orders[0].servicePolicy;const signed=clone(old.orders[0]);assert.equal(enterpriseValid(old),true);assert.deepEqual(decodeVenture(encodeVenture(old),'enterprise').world,old);enterpriseAction(old,'settings',settings(old,{policy:'premium'}));assert.equal(enterpriseQuote(old,old.orders[0]).servicePolicy,'standard');while(!old.stats.delivered)run(old,1);assert.equal(old.clients[0].work,ENTERPRISES.ai.serviceWork);assert.equal(old.clients[0].fee,Math.round(signed.quote*ENTERPRISES.ai.serviceRate));
});

test('business development changes next-cycle leads with a bounded diminishing response, without creating immediate orders',()=>{
  for(const id of ['equipment','ai','agency','security']){const w=createEnterprise(id),before=clone(w.offers);enterpriseAction(w,'settings',settings(w,{marketing:0}));assert.deepEqual(w.offers,before);run(w,30);assert.equal(w.offers.length,1);assert.equal(w.orders.length,0);
    enterpriseAction(w,'settings',settings(w,{marketing:500000}));const forecast=enterpriseCoach(w).drivers.find(d=>d.id==='leads').value;run(w,30);assert.equal(w.offers.length,forecast);assert.ok(forecast<=6);assert.equal(w.orders.length,0);assert.equal(enterpriseValid(w),true);}
});

test('order risk estimates do not double-count their own work or restart an inspection already underway',()=>{
  const w=createEnterprise('ai');bid(w);const o=w.orders[0],m=enterpriseMetrics(w),q=enterpriseQuote(w,o);assert.equal(q.days,Math.ceil(o.work/m.freeCapacity));o.progress=o.work;o.inspectionReady=8;w.day=5;assert.equal(enterpriseQuote(w,{...o,work:0}).finish,8);
});

test('owner expansions stop at the advertised capacity ceiling, including the last partial phase',()=>{
  for(const [id,capacity,ceiling] of [['hotel',96,100],['ecommerce',190,200],['ai',11,12]]) {
    const w=createEnterprise(id);w.capacity=capacity;assert.equal(enterpriseAction(w,'expand').ok,true);assert.equal(w.expansion.add,ceiling-capacity);run(w,22);assert.equal(w.capacity,ceiling);assert.equal(enterpriseAction(w,'expand').ok,false);
  }
});

test('invalid policies and credit terms are atomic; forged terms cannot enter saves',()=>{
  const w=createEnterprise('security'),before=clone(w);for(const terms of ['unknown','__proto__','',null,0]){assert.equal(enterpriseAction(w,'bid',{id:w.offers[0].id,factor:1,terms}).ok,false);assert.deepEqual(w,before);}
  assert.equal(enterpriseTerms(w,'__proto__'),null);for(const policy of ['unknown','__proto__',null,0]){assert.equal(enterpriseAction(w,'settings',settings(w,{policy})).ok,false);assert.deepEqual(w,before);}
  bid(w,'credit');w.orders[0].term++;assert.equal(enterpriseValid(w),false);assert.throws(()=>decodeVenture(encodeVenture(w),'enterprise'));w.orders[0].term--;w.orders[0].servicePolicy='unknown';assert.equal(enterpriseValid(w),false);
});

test('historical missing metrics remain unknown; observations use weighted rates and real daily costs, not invented zeroes',()=>{
  const old=observation([{sales:10,demand:12,returns:1,revenue:8500}],'enterprise',{businessId:'ecommerce',unit:'件'});assert.equal(old.metrics.find(x=>x.id==='marketingPerSale').value,null);assert.equal(old.metrics.find(x=>x.id==='operatingResult').value,null);assert.equal(old.metrics.find(x=>x.id==='cashChange').value,null);
  const actual=observation([{sales:10,returns:2,marketingCost:300},{sales:20,returns:1,marketingCost:600}],'enterprise',{businessId:'ecommerce',unit:'件'});assert.equal(actual.metrics.find(x=>x.id==='marketingPerSale').value,30);assert.equal(actual.metrics.find(x=>x.id==='returns').value,10);
  const w=createEnterprise('ecommerce'),cash=w.co.cash,before=profit(w.co.ledger);stepEnterprise(w);assert.equal(w.today.operatingResult,profit(w.co.ledger)-before);assert.equal(w.today.cashChange,w.co.cash-cash);assert.ok(w.today.operatingResult<0);assert.ok(w.today.cashChange<0);
});
