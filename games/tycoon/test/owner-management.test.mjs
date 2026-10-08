import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerVenture, ownerManagement, ownerManagementAction, factoryManagerPlan, factoryOrderReview, technologyManagerPlan, stepOwnerVenture } from '../owner-management.js';
import { createManufacturing, manufacturingAction, manufacturingValid, stepManufacturing, productionPlan } from '../manufacturing.js';
import { createTechnology, technologyAction, technologyValid, stepTechnology } from '../technology.js';
import { encodeVenture, decodeVenture } from '../venture-saves.js';
import { spend, cashIdentity, dateOf } from '../venture-core.js';
const clone = w => structuredClone(w);
const won = id => { const w=createOwnerVenture('manufacturing',id); w.rng=7; const o=w.offers.find(o=>o.profile==='supply'&&o.batchCount===3); assert.equal(manufacturingAction(w,'bid',{id:o.id,factor:.9}).ok,true); assert.equal(w.orders.length,3); return w; };
const identity = w => { assert.ok(Math.abs(cashIdentity(w.co.ledger,w.co.cash))<.01); for(const r of w.co.history) assert.ok(Math.abs(cashIdentity(r,r.cashEnd))<.01); };

for(const [mode,ids] of [['manufacturing',['packaging','apparel','electronics']],['technology',['saas','marketplace','content']]]) for(const id of ids) {
  test(`${id}: new owner game, pure previews, policy validation and save resume`,()=>{
    const w=createOwnerVenture(mode,id), before=clone(w);
    assert.equal(ownerManagement(w).enabled,true);
    for(let i=0;i<3;i++) if(mode==='manufacturing') { factoryManagerPlan(w); for(const o of w.offers) for(const factor of [.9,1,1.1]) { const r=factoryOrderReview(w,o,factor); assert.ok(r.preview); assert.ok(r.shortage>=0); assert.ok(r.occupiedDays===null || Number.isFinite(r.occupiedDays)); } } else technologyManagerPlan(w);
    assert.deepEqual(w,before,'renders and forecasts must not spend, consume RNG or change the save');
    assert.deepEqual(decodeVenture(encodeVenture(w),mode).world,w);
    for(const data of [{budget:-1},{budget:Infinity},{budget:1.2},{maxFixed:NaN},{reserveMonths:4},{enabled:'yes'},{allowOvertime:'true'},{priority:'unknown'}]) {assert.equal(ownerManagementAction(w,data).ok,false); assert.deepEqual(w,before);}
    assert.equal(ownerManagementAction(w,{budget:0,reserveMonths:3}).ok,true);
    assert.equal((mode==='manufacturing'?manufacturingValid:technologyValid)(w),true);
    assert.equal(ownerManagementAction(w,{enabled:false}).ok,true);
    const a=clone(w),b=clone(w); stepOwnerVenture(a); (mode==='manufacturing'?stepManufacturing:stepTechnology)(b); assert.deepEqual(a,b,'disabled management must use original gameplay exactly');
  });
}
for(const id of ['packaging','apparel','electronics']) {
  test(`${id}: one 90-day agreement automatically supplies all three batches and reconciles actual costs`,()=>{
    const w=won(id), initial=clone(w), originalOffers=w.offers.map(o=>o.id); let purchased=0;
    for(let day=0;day<89;day++) {
      const before=w.co.cash, purchases=w.co.ledger.purchases, plan=factoryManagerPlan(w);
      const repeated=factoryManagerPlan(w); assert.deepEqual(plan,repeated);
      stepOwnerVenture(w); assert.equal(manufacturingValid(w),true,`valid save on day ${w.day}`); identity(w);
      const bought=w.co.ledger.month===dateOf(day).month?w.co.ledger.purchases-purchases:0;
      if(bought>0) { purchased+=bought; assert.ok(before-bought>=plan.guard.reserve-1); }
      assert.equal(w.co.debt,0); assert.equal(w.lines,initial.lines); assert.equal(w.expansion,null);
      assert.ok(w.manager.spent<=w.manager.budget); assert.ok(w.manager.log.length<=24);
      if(day===1) { assert.equal(w.stock.qty,0,'paid material has not arrived yet'); assert.ok(w.shipments.length); }
      if(day===29) assert.equal(w.orders.find(o=>o.batchIndex===2)?.produced || 0,0,'second batch cannot start early');
      if(day===59) assert.equal(w.orders.find(o=>o.batchIndex===3)?.produced || 0,0,'third batch cannot start early');
    }
    assert.ok(purchased>0); assert.equal(w.stats.delivered,3); assert.equal(w.stats.late,0); assert.equal(w.orders.length,0);
    assert.equal(w.stats.lostBids,initial.stats.lostBids,'manager never bids'); assert.ok(w.receivables.length,'actual delivery creates deferred collections');
    assert.ok(originalOffers.length); assert.deepEqual(decodeVenture(encodeVenture(w),w.mode).world,w);
  });
}
test('procurement respects zero budget, cash reserve and already-paid material',()=>{
  const w=won('electronics'); ownerManagementAction(w,{budget:0}); const before=clone(w); const p=factoryManagerPlan(w); assert.equal(p.qty,0); assert.ok(p.issues.some(x=>x.includes('預算'))); assert.deepEqual(w,before);
  stepOwnerVenture(w); assert.equal(w.shipments.length,0); assert.equal(w.co.ledger.purchases,0);
  ownerManagementAction(w,{budget:500000,reserveMonths:1}); spend(w,Math.max(0,w.co.cash-1000)); assert.equal(factoryManagerPlan(w).qty,0);
  // Today's receivable is collected before the manager evaluates cash.
  w.receivables.push({due:w.day,amount:1000000,client:'測試尾款'}); stepOwnerVenture(w); assert.ok(w.shipments.length>0); identity(w);
  const after=w.co.ledger.purchases; stepOwnerVenture(w); assert.equal(w.co.ledger.purchases,after,'pending shipment must not be purchased again');
});
test('changing policies, disabling and re-enabling cannot reset monthly spending',()=>{
  const w=won('packaging'); stepOwnerVenture(w); const spent=w.manager.spent; assert.ok(spent>0);
  for(const data of [{budget:0},{enabled:false},{enabled:true},{budget:100000}]) ownerManagementAction(w,data);
  assert.equal(w.manager.spent,spent); assert.equal(ownerManagement(w).remaining,100000-spent);
  ownerManagementAction(w,{budget:0}); assert.equal(manufacturingValid(w),true,'lower cap may be below already-spent amount');
  while(w.day<31) stepOwnerVenture(w); assert.equal(ownerManagement(w).currentSpent,0,'new calendar month grants new budget without render mutation');
});
test('idle maintenance is guarded and never auto-borrows, expands or resolves events',()=>{
  const w=createOwnerVenture('manufacturing','packaging'); w.wear=.7; const p=factoryManagerPlan(w); assert.equal(p.maintain,true); stepOwnerVenture(w); assert.equal(w.maintenanceUntil,2); assert.ok(w.wear<.01); assert.equal(w.manager.spent,8400);
  w.event={title:'原料漲價',text:'需要老闆決定'}; const before=clone(w); assert.equal(stepOwnerVenture(w),false); assert.deepEqual(w,before);
  const t=createOwnerVenture('technology','saas'); t.event={title:'供應商事件',text:'需要老闆決定'}; const b=clone(t); assert.equal(stepOwnerVenture(t),false); assert.deepEqual(t,b);
});
test('quote result allocates fixed costs and deposit cannot mask later batch commitments',()=>{
  const w=createOwnerVenture('manufacturing','electronics'); const offer=w.offers.find(o=>o.profile==='supply'&&o.batchCount===3), r=factoryOrderReview(w,offer);
  assert.ok(r.allocatedFixed>0); assert.equal(r.result,r.preview.estimatedContribution-r.allocatedFixed); assert.ok(r.nearCash<r.preview.upfrontMaterial,'quarter material is not all purchased up front');
  const absurd={...w.offers[0],qty:10000000}; const risk=factoryOrderReview(w,absurd); assert.equal(risk.result,null); assert.equal(risk.preview.finishDay,null);
});
for(const id of ['saas','marketplace','content']) test(`${id}: service automatically scales within caps and leaves commercial strategy to owner`,()=>{
  const w=createOwnerVenture('technology',id); w.users=8000; if(id==='saas')w.paying=4000;
  ownerManagementAction(w,{maxFixed:w.co.capital*2,reserveMonths:0,budget:300000}); const p=technologyManagerPlan(w), old=clone(w);
  assert.ok(p.settings.support>=w.support); stepOwnerVenture(w); identity(w); assert.equal(technologyValid(w),true);
  assert.equal(w.price,old.price); assert.equal(w.marketing,old.marketing); assert.equal(w.strategy,old.strategy); assert.equal(w.project,null); assert.equal(w.co.debt,0);
  assert.equal(w.support,p.settings.support); assert.equal(w.cloudTier,p.settings.cloudTier); assert.equal(w.focus,p.settings.focus); assert.equal(w.manager.spent,p.hiring);
  assert.ok(w.manager.spent<=w.manager.budget); assert.deepEqual(decodeVenture(encodeVenture(w),w.mode).world,w);
});
test('technology prioritizes service, respects hiring caps, and only accelerates an owner-funded project',()=>{
  const w=createOwnerVenture('technology','saas'); w.users=1500; w.paying=200; ownerManagementAction(w,{budget:0,maxFixed:400000,reserveMonths:0,priority:'delivery'});
  let p=technologyManagerPlan(w); assert.ok(p.settings.cloudTier>0,'no setup fee for capacity but recurring fee counts in monthly ceiling'); assert.equal(p.settings.support,1); assert.ok(p.issues.some(x=>x.includes('客服'))); stepOwnerVenture(w); assert.equal(w.engineers,1);
  ownerManagementAction(w,{budget:100000}); assert.equal(technologyAction(w,'project',{id:'value',release:'pilot'}).ok,true); p=technologyManagerPlan(w); assert.equal(p.settings.engineers,3); stepOwnerVenture(w); assert.equal(w.engineers,3); assert.ok(w.project.progress>0); assert.equal(w.manager.spent,36000); identity(w);
  ownerManagementAction(w,{maxFixed:1}); const low=technologyManagerPlan(w); assert.equal(low.settings.support,w.support); assert.ok(low.issues.some(x=>x.includes('固定月費')));
});
test('legacy saves stay manual and invalid manager data is rejected without migration',()=>{
  for(const w of [createManufacturing(),createTechnology()]) {const before=clone(w); assert.equal(ownerManagement(w).enabled,false); assert.deepEqual(decodeVenture(encodeVenture(w),w.mode).world,before); assert.deepEqual(w,before); const a=clone(w),b=clone(w); stepOwnerVenture(a); (w.mode==='manufacturing'?stepManufacturing:stepTechnology)(b); assert.deepEqual(a,b);}
  for(const field of [{spent:-1},{month:'2099-01'},{log:[{day:2,text:'future',amount:0}]},{reserveMonths:NaN},{enabled:null}]) {const w=createOwnerVenture('technology','saas'); Object.assign(w.manager,field); assert.equal(technologyValid(w),false); assert.throws(()=>decodeVenture(encodeVenture(w),w.mode));}
  assert.equal(manufacturingValid(null),false); assert.equal(technologyValid(null),false);
});
