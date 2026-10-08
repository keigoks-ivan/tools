import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTERPRISES, createEnterprise, enterpriseAction, enterpriseMetrics, enterprisePlan, enterpriseQuote, stepEnterprise, enterpriseValid } from '../enterprise.js';
import { cashIdentity, dateOf, spend, financeAction, profit } from '../venture-core.js';
import { encodeVenture, decodeVenture, storeVenture, loadVenture, routeKey } from '../venture-saves.js';
const clone=w=>structuredClone(w),identity=w=>{assert.ok(Math.abs(cashIdentity(w.co.ledger,w.co.cash))<.01);for(const r of w.co.history)assert.ok(Math.abs(cashIdentity(r,r.cashEnd))<.01);};
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),data};};
const bid=w=>{w.rng=7;const o=w.offers[0],q=enterpriseQuote(w,o,.9);assert.equal(enterpriseAction(w,'bid',{id:o.id,factor:.9}).ok,true);assert.equal(w.orders.length,1);return {o,q};};
for(const id of Object.keys(ENTERPRISES)) {
 test(`${id}: valid independent owner game, pure forecasts, guarded spending and monthly accounting`,()=>{
  const w=createEnterprise(id),initial=clone(w),p=ENTERPRISES[id];assert.equal(enterpriseValid(w),true);assert.deepEqual(decodeVenture(encodeVenture(w),'enterprise').world,w);
  for(let n=0;n<3;n++){enterpriseMetrics(w);enterprisePlan(w);for(const o of w.offers)for(const f of [.9,1,1.1])enterpriseQuote(w,o,f);}assert.deepEqual(w,initial);
  if(p.kind==='project')bid(w);
  for(let n=0;n<89;n++){const before=enterprisePlan(w),spent=w.manager.month===dateOf(w.day).month?w.manager.spent:0;stepEnterprise(w);identity(w);assert.equal(enterpriseValid(w),true,`day ${w.day}`);assert.ok(w.manager.spent<=w.manager.budget);if(w.manager.spent>spent)assert.ok(w.co.cash>=before.metrics.reserve-1);}
  assert.ok(w.co.history.length>=2);assert.deepEqual(decodeVenture(encodeVenture(w),'enterprise').world,w);assert.equal(w.co.debt,0);assert.equal(w.expansion,null);assert.equal(w.capacity,initial.capacity);
  if(p.kind==='project'){assert.equal(w.stats.delivered,1);assert.equal(w.stats.cancelled,0);assert.equal(w.stats.lostBids,0);assert.ok(w.stats.serviceRevenue>0);assert.equal(w.clients.length,1);}
  else assert.ok(w.stats.sales>0);
 });
 test(`${id}: invalid owner decisions are atomic and events remain owner choices`,()=>{
  const w=createEnterprise(id),before=clone(w),p=ENTERPRISES[id];
  for(const action of [['settings',{price:1,marketing:0,qualityBudget:0,channel:0,targetDays:14}],['management',{budget:-1}],['management',{reserveMonths:Infinity}],['bid',{id:'unknown',factor:1}],['renew',{id:'unknown'}]]){assert.equal(enterpriseAction(w,...action).ok,false);assert.deepEqual(w,before);}
  for(let i=0;i<90;i++)stepEnterprise(w);assert.equal(w.day,90);assert.ok(w.event);const paused=clone(w);assert.equal(stepEnterprise(w),false);assert.deepEqual(w,paused);
  assert.equal(enterpriseAction(w,'event',{choice:'invalid'}).ok,false);assert.deepEqual(w,paused);assert.equal(enterpriseAction(w,'event',{choice:'accept'}).ok,true);assert.equal(w.event,null);stepEnterprise(w);assert.equal(w.day,91);identity(w);
 });
}
test('all six saves coexist, backup recovery is scoped to the selected business',()=>{
 const s=storage();for(const id of Object.keys(ENTERPRISES)){const w=createEnterprise(id);stepEnterprise(w);assert.equal(storeVenture(s,w).ok,true);stepEnterprise(w);assert.equal(storeVenture(s,w).ok,true);}
 for(const id of Object.keys(ENTERPRISES)){const loaded=loadVenture(s,'enterprise',id);assert.equal(loaded.ok,true);assert.equal(loaded.world.businessId,id);assert.equal(loaded.world.day,2);}
 s.setItem(routeKey('enterprise','hotel'),'broken');const recovered=loadVenture(s,'enterprise','hotel');assert.equal(recovered.recovered,true);assert.equal(recovered.world.day,1);
 assert.equal(loadVenture(s,'enterprise','ai').world.day,2);s.setItem(routeKey('enterprise','hotel'),encodeVenture(createEnterprise('agency')));assert.equal(loadVenture(s,'enterprise','hotel').world.businessId,'hotel');
});
test('hotel room nights are finite, consumables are actually paid and an excessive room price reduces demand',()=>{
 const w=createEnterprise('hotel'),m=enterpriseMetrics(w),before=w.co.cash;stepEnterprise(w);assert.ok(w.today.sales<=w.capacity);assert.ok(w.co.ledger.cogs>0);assert.equal(w.co.ledger.purchases,w.today.sales*ENTERPRISES.hotel.cost);assert.equal(w.co.cash,before+w.today.revenue-w.co.ledger.purchases);
 const high=enterpriseMetrics({...w,price:15000}),low=enterpriseMetrics({...w,price:1800});assert.ok(high.demand<low.demand);assert.ok(high.monthlyResult<0,'very high pricing may leave too many rooms empty');
 const expanded=clone(w);expanded.capacity+=24;assert.ok(enterpriseMetrics(expanded).fixed>enterpriseMetrics(w).fixed);assert.ok(enterpriseMetrics(expanded).demand===enterpriseMetrics(w).demand,'new rooms do not create unlimited guests');identity(w);
});
test('commerce pays stock before sales, waits seven days, recognizes only used stock and refunds cash',()=>{
 const w=createEnterprise('ecommerce');stepEnterprise(w);assert.equal(w.today.sales,0);assert.equal(w.stock.qty,0);assert.ok(w.shipments.length>0);assert.ok(w.co.ledger.purchases>0);assert.equal(w.co.ledger.cogs,0);
 for(let i=0;i<6;i++){stepEnterprise(w);assert.equal(w.today.sales,0);}stepEnterprise(w);assert.ok(w.today.sales>0);assert.ok(w.co.ledger.cogs>0);assert.ok(w.stock.qty>=0);identity(w);
 w.quality=.1;for(let i=0;i<12;i++)stepEnterprise(w);assert.ok(w.stats.returns>0);assert.ok(w.co.ledger.penalty>0);assert.ok(w.co.ledger.paidCosts>=w.co.ledger.penalty);identity(w);
 const before=clone(w);enterpriseAction(w,'management',{budget:0});for(let i=0;i<3;i++)stepEnterprise(w);assert.equal(w.manager.spent,before.manager.spent,'lowered budget cannot reset or add auto spending');
});
for(const id of ['equipment','ai','agency','security'])test(`${id}: deposit is not revenue, acceptance is not collection, invoice is collected on its due date`,()=>{
 const w=createEnterprise(id),p=ENTERPRISES[id],before=w.co.cash,{q}=bid(w);assert.equal(w.co.cash,before+q.deposit);assert.equal(w.co.ledger.revenue,0);assert.equal(w.co.ledger.receipts,q.deposit);
 while(!w.stats.delivered&&w.day<80)stepEnterprise(w);assert.equal(w.stats.delivered,1);const invoice=w.receivables[0];assert.equal(invoice.amount,q.quote-q.deposit);assert.ok(invoice.due>w.day);assert.ok(w.co.ledger.revenue>0||w.co.history.some(r=>r.revenue>0));
 while(w.day<invoice.due){if(w.event)enterpriseAction(w,'event',{choice:'accept'});stepEnterprise(w);}assert.equal(w.receivables.some(r=>r===invoice),true);const start=w.co.cash,m=enterpriseMetrics(w),service=w.clients.filter(c=>c.until>w.day).reduce((n,c)=>n+c.fee/dateOf(w.day).dim,0);stepEnterprise(w);assert.equal(w.receivables.length,0);assert.ok(w.co.cash>=start+invoice.amount+service-1 || w.co.history.at(-1)?.month===dateOf(w.day-1).month);identity(w);
});
test('contract cancellation refunds the exact deposit and loses consumed equipment material',()=>{
 const w=createEnterprise('equipment'),{q}=bid(w);for(let i=0;i<12;i++)stepEnterprise(w);const o=w.orders[0],cash=w.co.cash,cogs=w.co.ledger.cogs;assert.ok(o.cost>0);assert.equal(enterpriseAction(w,'cancel',{id:o.id}).ok,true);assert.equal(w.co.cash,cash-q.deposit-Math.round(q.quote*.1));assert.equal(w.co.ledger.cogs,cogs+o.cost);assert.equal(w.orders.length,0);identity(w);
});
test('quarterly clients expire unless owner renews, and their work constrains new project estimates',()=>{
 const w=createEnterprise('security');bid(w);while(!w.stats.delivered)stepEnterprise(w);const c=w.clients[0],m=enterpriseMetrics(w),empty=enterpriseMetrics({...w,clients:[]});assert.ok(m.freeCapacity<empty.freeCapacity);const before=clone(w);assert.equal(enterpriseAction(w,'renew',{id:c.id}).ok,false);assert.deepEqual(w,before);
 while(w.day<c.until-15){if(w.event)enterpriseAction(w,'event',{choice:'accept'});stepEnterprise(w);}const until=c.until;assert.equal(enterpriseAction(w,'renew',{id:c.id}).ok,true);assert.equal(c.until,until+90);identity(w);
});
test('new calendar budget charges the first new-month purchase and hiring stays inside the cash reserve',()=>{
 const w=createEnterprise('ecommerce');w.manager.month='2026-10';w.manager.spent=w.manager.budget;while(w.day<31)stepEnterprise(w);assert.equal(w.shipments.length,0);stepEnterprise(w);assert.equal(w.manager.month,'2026-11');assert.ok(w.manager.spent>0,'first new-month purchase must count, not be reset away');assert.ok(w.shipments.length);identity(w);
 const t=createEnterprise('ecommerce');t.capacity=100;t.marketing=400000;t.manager.maxFixed=1000000;t.manager.budget=1000000;spend(t,Math.max(0,t.co.cash-10000));const plan=enterprisePlan(t);assert.equal(plan.hiring,0);assert.equal(plan.qty,0);assert.ok(plan.issues.length);
});
test('project agency revisions have a cost, fixed signed price and no accidental duplicate client receipts',()=>{
 const w=createEnterprise('agency');w.channel=1;w.offers[0].scope=1;bid(w);const price=w.orders[0].quote;w.quality=.1;let sawRevision=false;
 for(let i=0;i<85;i++){stepEnterprise(w);sawRevision ||= w.orders.some(o=>o.revised);identity(w);if(w.stats.delivered)break;}assert.ok(sawRevision,'seeded custom campaign requires a revision');assert.equal(w.stats.delivered,1);const total=w.co.history.reduce((n,r)=>n+r.revenue,0)+w.co.ledger.revenue;assert.ok(total>=price);assert.ok(total<price*1.1,'revision cannot invent a second project sale');
});
test('new businesses end after three years or insolvency, all simulated states remain saveable',()=>{
 for(const id of Object.keys(ENTERPRISES)){const w=createEnterprise(id,123);for(let i=0;i<1100&&w.status==='playing';i++){if(w.event)enterpriseAction(w,'event',{choice:'accept'});stepEnterprise(w);assert.equal(enterpriseValid(w),true,`${id} day ${w.day}`);identity(w);}assert.ok(['finished','bankrupt'].includes(w.status));const before=clone(w);assert.equal(stepEnterprise(w),false);assert.deepEqual(w,before);}
});
test('new saves reject invalid fields and manager budgets without damaging unrelated slots',()=>{
 for(const id of Object.keys(ENTERPRISES))for(const data of [{staff:0},{capacity:10000},{stock:{qty:-1,value:0}},{price:NaN},{clients:[{id:'x',client:'x',fee:1,work:1,until:99999}]}]){const w=createEnterprise(id);Object.assign(w,data);assert.equal(enterpriseValid(w),false);assert.throws(()=>decodeVenture(encodeVenture(w),'enterprise'));}
 assert.equal(enterpriseValid(null),false);
});
