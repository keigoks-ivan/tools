import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENTERPRISES, createEnterprise, enterpriseAction, enterpriseMetrics, enterprisePlan, enterpriseLeads, enterpriseQuote, stepEnterprise, enterpriseValid } from '../enterprise.js';
import { enterpriseCoach, enterpriseDraft } from '../enterprise-coach.js';
import { MODELS, createTechnology, technologyMetrics, technologyEconomics, technologyAction, stepTechnology, technologyBreakEven, technologyValid } from '../technology.js';
import { createOwnerVenture, stepOwnerVenture } from '../owner-management.js';
import { createManufacturing, manufacturingOrderPreview, productionPlan } from '../manufacturing.js';
import { ventureCoach } from '../venture-coach.js';
import { encodeVenture, decodeVenture } from '../venture-saves.js';
import { company, spend, profit, report, cashIdentity } from '../venture-core.js';
import * as S from '../sim.js';
import { priceBounds } from '../businesses.js';

const settings=(w,patch={})=>({price:w.price,marketing:w.marketing,qualityBudget:w.qualityBudget,channel:w.channel,targetDays:w.targetDays,policy:w.policy||'standard',...patch});
function matureEnterprise(id,seed=7) {
  const w=createEnterprise(id,seed);w.co=company(20000000);w.quality=.95;w.reputation=.95;w.capacity=id==='hotel'?80:160;w.staff=id==='hotel'?14:8;w.qualityBudget=10000;w.manager.budget=3000000;w.manager.maxFixed=3000000;
  if(id==='ecommerce'){w.stock={qty:5000,value:1650000};spend(w,w.stock.value,'purchases');}
  else {w.co.assets=ENTERPRISES[id].setup;spend(w,w.co.assets,'capex');}
  return w;
}
function matureTech(id,seed=7) {
  const w=createOwnerVenture('technology',id,seed);w.co=company(20000000);w.quality=.9;w.retention=.9;w.reputation=.9;w.techDebt=0;w.users=id==='content'?35000:id==='marketplace'?5000:3000;w.paying=id==='saas'?1200:0;w.cloudTier=id==='content'?3:2;w.marketing=18000;w.manager.maxFixed=2000000;w.manager.budget=1000000;
  if(id==='content'){w.price=3;w.capabilities=['evergreen','analytics'];}return w;
}
function run(w,n,step) {
  for(let i=0;i<n;i++){if(w.event)(w.mode==='enterprise'?enterpriseAction:technologyAction)(w,'event',{choice:'protect'});if(!step(w))break;assert.ok(Math.abs(cashIdentity(w.co.ledger,w.co.cash))<.01);}
  return report(w).totals.net;
}
for(const id of ['hotel','ecommerce'])test(`${id}: established firms cannot turn maximum price and marketing into guaranteed earnings`,()=>{
  for(const seed of [7,42,20261008])for(const channel of [0,1]){
    const normal=matureEnterprise(id,seed),max=structuredClone(normal);normal.price=id==='hotel'?3900:1275;normal.marketing=100000;max.price=id==='hotel'?15000:5000;max.marketing=500000;max.qualityBudget=100000;normal.channel=max.channel=channel;
    const a=enterpriseMetrics(normal),b=enterpriseMetrics(max);assert.ok(b.demand<a.demand*.1,'unsupported premium cannot be offset by five times the advertising');assert.ok(b.monthlyResult<a.monthlyResult);if(id==='ecommerce')assert.ok(b.returnRate>a.returnRate);
    const sensible=run(normal,365,stepEnterprise),corner=run(max,365,stepEnterprise);assert.ok(corner<sensible);assert.ok(corner<0,'plentiful starting cash, stock, staffing and quality cannot hide the exploit');assert.ok(enterpriseValid(normal)&&enterpriseValid(max));assert.deepEqual(decodeVenture(encodeVenture(max),'enterprise').world,max);
  }
});
for(const id of ['hotel','ecommerce'])test(`${id}: advertising gains diminish, capacity caps incremental sales, pricing value follows actual quality and reputation`,()=>{
  const w=matureEnterprise(id),m=n=>enterpriseMetrics({...w,marketing:n});assert.ok(m(300000).demand-m(200000).demand<m(200000).demand-m(100000).demand);assert.ok(m(500000).demand<m(100000).demand*5);assert.ok(m(500000).adMarginalReturn<m(100000).adMarginalReturn);assert.equal(m(500000).adTo,500000);
  const busy={...w,capacity:1};assert.equal(enterpriseMetrics(busy).adMarginalReturn,0);assert.ok(enterpriseMetrics({...w,quality:.3,reputation:.2}).valuePrice<enterpriseMetrics(w).valuePrice);
  const high={...w,price:id==='hotel'?15000:5000};assert.equal(enterpriseCoach(high).bottleneck.id,'pricing');const before=structuredClone(w),draft=enterpriseDraft(w,settings(w,{price:high.price,marketing:500000}));assert.ok(draft.changes.some(d=>d.id==='priceValue'));assert.ok(enterpriseCoach(w).drivers.some(d=>d.id==='adMarginalReturn'));assert.deepEqual(w,before,'draft and new risk guidance remain pure');
});

test('commerce manager buys and recruits for fulfillable sales instead of unlimited raw demand',()=>{
  const w=matureEnterprise('ecommerce');w.stock={qty:0,value:0};w.capacity=10;w.staff=1;w.price=600;w.marketing=500000;w.manager.maxFixed=3000000;const p=enterprisePlan(w);assert.ok(p.metrics.demand>w.capacity);assert.equal(p.staff,1);assert.ok(p.qty<=w.capacity*w.targetDays);w.shipments.push({qty:100,value:33000,arrival:7});spend(w,33000,'purchases');assert.ok(enterprisePlan(w).qty<=w.capacity*w.targetDays-100);
});

test('commerce refunds affect actual cash and reputation, not just a displayed forecast',()=>{
  const w=matureEnterprise('ecommerce',42);w.manager.enabled=false;w.price=2200;w.marketing=500000;w.stock={qty:5000,value:1650000};const rep=w.reputation,m=enterpriseMetrics(w),before=profit(w.co.ledger);stepEnterprise(w);assert.ok(w.today.returns>0);assert.equal(w.today.refunds,w.today.returns*w.price);assert.equal(w.co.ledger.penalty,w.today.refunds);assert.equal(w.today.operatingResult,profit(w.co.ledger)-before);assert.ok(w.reputation<rep);assert.ok(m.returnRate>.1);
});
for(const id of ['hotel','ecommerce'])test(`${id}: reasonably priced new businesses can still survive and profit through a full year`,()=>{
  for(const seed of [7,42,20261008]){const w=createEnterprise(id,seed);w.price=id==='ecommerce'?1000:3000;w.marketing=id==='ecommerce'?60000:80000;w.qualityBudget=id==='ecommerce'?15000:20000;w.manager.maxFixed=800000;const net=run(w,365,stepEnterprise);assert.equal(w.day,365);assert.equal(w.status,'playing');assert.ok(net>0);assert.ok(enterpriseValid(w));}
});
for(const id of Object.keys(MODELS))test(`${id}: maximum monetization and advertising underperform a healthy owner strategy over a year`,()=>{
  for(const seed of [7,42,20261008]){const normal=matureTech(id,seed),max=structuredClone(normal);max.price=id==='saas'?1999:id==='marketplace'?20:6;max.marketing=500000;const good=run(normal,365,stepOwnerVenture),bad=run(max,365,stepOwnerVenture);assert.equal(normal.day,365);assert.ok(good>0,'appropriate staffing, capacity and measured growth remain viable');assert.ok(bad<good);assert.ok(bad<0,'the corner strategy must fail even after establishing a good product and customer base');assert.ok(technologyValid(normal)&&technologyValid(max));assert.deepEqual(decodeVenture(encodeVenture(max),'technology').world,max);}
});
for(const id of Object.keys(MODELS))test(`${id}: paid growth saturates independently of market size, with truthful average and marginal acquisition costs`,()=>{
  const w=matureTech(id),m=n=>technologyMetrics({...w,marketing:n},{includeBreakEven:false});assert.ok(m(500000).paidAcquired<m(100000).paidAcquired*5);assert.ok(m(300000).paidAcquired-m(200000).paidAcquired<m(200000).paidAcquired-m(100000).paidAcquired);assert.ok(m(500000).acquisitionCost>m(100000).acquisitionCost);assert.ok(m(500000).adMarginalCost>m(500000).acquisitionCost);assert.equal(m(0).paidAcquired,0);assert.ok(Number.isFinite(m(0).acquisitionCost));assert.ok(ventureCoach(w).drivers.some(d=>d.id==='adMarginalCost'));
});

test('SaaS pricing affects both newly acquired and existing free-user conversion without a guaranteed floor',()=>{
  const w=matureTech('saas');w.manager.enabled=false;w.users=10000;w.paying=0;w.marketing=0;w.price=1999;w.cloudTier=5;w.support=10;const high=technologyMetrics(w),normal=technologyMetrics({...w,price:499});assert.ok(high.conversion<.01);assert.ok(high.freeConversion<normal.freeConversion*.05);const low=structuredClone(w);low.price=499;run(w,90,stepTechnology);run(low,90,stepTechnology);assert.ok(w.stats.converted<low.stats.converted*.1);assert.ok(w.stats.acquired>0,'organic visitors still do not guarantee paid conversion');
});
for(const id of ['marketplace','content'])test(`${id}: extreme fees or ad clutter reduce real transactions/visits; break-even stays consistent with the engine`,()=>{
  const w=matureTech(id),max={...w,price:id==='marketplace'?20:6},a=technologyEconomics(w),b=technologyEconomics(max);assert.ok(b.revenue<a.revenue);assert.ok(id==='marketplace'?b.transactions<a.transactions:b.visits<a.visits);assert.ok(b.monthlyUnit<a.monthlyUnit);
  for(const price of id==='marketplace'?[8,12,20]:[2,3,6]){const candidate={...w,price},fixed=technologyMetrics(candidate).fixed,n=technologyBreakEven(candidate,fixed);if(n!==null){assert.ok(technologyEconomics(candidate,{users:n,paying:0}).contribution>=fixed-.001);assert.ok(technologyEconomics(candidate,{users:n-1,paying:0}).contribution<fixed+.001);}}
  const clone=structuredClone(w),before=technologyMetrics(w,{includeBreakEven:false});stepOwnerVenture(w);stepOwnerVenture(clone);assert.deepEqual(w,clone);assert.ok(Number.isFinite(before.monetizationFactor));
});
for(const id of ['equipment','ai','agency','security'])test(`${id}: maximum business development and pricing are already constrained by lead ceilings and acceptance`,()=>{
  const w=createEnterprise(id),o=w.offers[0],base=enterpriseQuote(w,o),max={...w,price:140,marketing:500000},ceiling={...max,marketing:Math.ceil(ENTERPRISES[id].marketing*6.25)},q=enterpriseQuote(max,o,1.1);assert.ok(q.chance<base.chance);assert.equal(enterpriseLeads(max),enterpriseLeads(ceiling));assert.ok(enterpriseMetrics(max).fixed>enterpriseMetrics(ceiling).fixed);assert.equal(w.orders.length,0,'a bigger budget cannot fabricate signed revenue');
});
for(const id of ['packaging','apparel','electronics'])test(`${id}: expensive quotes lower acceptance; finite plant capacity and cash-bound material remain required`,()=>{
  const w=createManufacturing(id),o=w.offers[0],low=manufacturingOrderPreview(w,o,{factor:.9}),high=manufacturingOrderPreview(w,o,{factor:1.1});assert.ok(high.acceptanceChance<low.acceptanceChance);assert.ok(high.quote>low.quote);const expanded={...w,lines:6,workers:30};assert.ok(productionPlan(expanded).fixed>productionPlan(w).fixed);assert.equal(w.stats.delivered,0);assert.equal(w.co.ledger.revenue,0);
});

const fx=JSON.parse(readFileSync(new URL('./fixtures/city-market.json',import.meta.url)));
for(const id of Object.keys(S.BUSINESSES))test(`${id}: store pricing and supply cannot create an unlimited local consumer market`,()=>{
  const w=S.createWorld({mapData:fx.map,distances:fx.dist,seed:7,noRivals:true,multiBusiness:true});w.companies.player.cash=20000000;w.companies.player.awareness=.95;const lot=w.lots.find(l=>l.districtId==='tech'),opened=S.openShop(w,lot.id,{businessId:id});assert.ok(opened.ok);const s=w.shops.find(s=>s.id===opened.shopId);s.status='open';s.openAtT=0;s.openedT=0;const initial=S.getMarketAnalysis(w),reference=structuredClone(s.prices);assert.ok(S.setPrices(w,s.id,Object.fromEntries(Object.keys(reference).map(k=>[k,priceBounds(id,k).max]))).ok);const priced=S.getMarketAnalysis(w);assert.equal(priced.budgetDaily,initial.budgetDaily);assert.equal(priced.population,initial.population);assert.ok(priced.sectors.find(g=>g.businessId===id).typicalOrders<=initial.sectors.find(g=>g.businessId===id).typicalOrders);assert.ok(S.setSocialAd(w,S.V.awareness.socialMaxWan).ok);assert.equal(S.getMarketAnalysis(w).budgetDaily,initial.budgetDaily);assert.ok(S.getShopAnalysis(w,s.id).capacityDaily>0);
});
