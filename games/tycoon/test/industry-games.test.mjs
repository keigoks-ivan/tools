import test from 'node:test';
import assert from 'node:assert/strict';
import { INDUSTRIES, industryId, industryKey } from '../industry-catalog.js';
import { enableIndustry, industryAction, industryState, industryEffects, industryValid, industryDay } from '../industry-sim.js';
import { industryBoardHtml } from '../industry-view.js';
import { createOwnerVenture, stepOwnerVenture } from '../owner-management.js';
import { createEnterprise, enterpriseAction, stepEnterprise, enterpriseMetrics, enterpriseQuote } from '../enterprise.js';
import { manufacturingAction, productionPlan } from '../manufacturing.js';
import { technologyAction, technologyMetrics, technologyEconomics, technologyBreakEven } from '../technology.js';
import { cashIdentity, report, commonValid } from '../venture-core.js';
import { storeVenture, loadVenture, routeKey, encodeVenture, decodeVenture } from '../venture-saves.js';
import * as S from '../sim.js';
import { encodeSave, decodeSave, storeLocal, loadLocal } from '../saves.js';
import { FIXTURE, runDays } from './scenario.mjs';
const clone = w => structuredClone(w);
const storage = () => { const data = new Map(); return { data, getItem:k=>data.get(k)||null, setItem:(k,v)=>data.set(k,v) }; };
function make(id) {
  const p=INDUSTRIES[id];
  if(p.mode==='stores') {
    const world=S.createWorld({mapData:FIXTURE.map,distances:FIXTURE.dist,noRivals:true,multiBusiness:true,campaignBusiness:id,seed:7});
    world.companies.player.awareness=.6;
    const lot=world.lots.filter(l=>l.zone==='住宅').sort((a,b)=>a.rent-b.rent)[0],r=S.openShop(world,lot.id,{businessId:id,ownerWorks:true});assert.equal(r.ok,true,r.reason);
    const w=world.shops.find(s=>s.id===r.shopId);w.openAtT=0;
    return {w,world,action:data=>S.storeIndustryAction(world,w.id,data),advance:n=>runDays(world,n),save:()=>decodeSave(encodeSave(world,{})).world};
  }
  const w=enableIndustry(p.mode==='enterprise'?createEnterprise(id,7):createOwnerVenture(p.mode,id,7)), core=p.mode==='enterprise'?enterpriseAction:p.mode==='technology'?technologyAction:manufacturingAction;
  return {w,action:data=>core(w,'industry',data),advance:n=>{for(let i=0;i<n;i++){if(w.event)core(w,'event',{choice:p.mode==='manufacturing'?'buffer':'protect'});if(!(p.mode==='enterprise'?stepEnterprise(w):stepOwnerVenture(w)))break;}},save:()=>decodeVenture(encodeVenture(w),p.mode).world};
}
for(const [id,p] of Object.entries(INDUSTRIES)) {
  test(`${id}: independent campaign, pure boards, atomic choices and guarded investment`,()=>{
    const g=make(id),before=clone(g.w),html=industryBoardHtml(g.w);assert.match(html,new RegExp(p.name));assert.match(html,/data-industry-kind/);assert.deepEqual(g.w,before);
    for(const data of [{kind:'policy',axis:'__proto__',value:'bad'},{kind:'invest',axis:'bad',value:'bad',foo:Infinity},{kind:'missing'}]) {
      // A valid invest ignores extraneous transport fields; malformed policy/operation must be atomic.
      if(data.kind==='invest')continue;
      assert.equal(g.action(data).ok,false);assert.deepEqual(g.w,before);
    }
    for(const axis of p.axes){assert.equal(g.action({kind:'policy',axis:axis.id,value:axis.options[1].id}).ok,true);assert.equal(g.w.industry.policies[axis.id],axis.options[1].id);}
    const cash=p.mode==='stores'?g.world.companies.player.cash:g.w.co.cash,fx=industryEffects(g.w);
    assert.equal(g.action({kind:'invest'}).ok,true);assert.ok(g.w.industry.work);assert.ok((p.mode==='stores'?g.world.companies.player.cash:g.w.co.cash)<cash);const started=clone(g.w);assert.equal(g.action({kind:'invest'}).ok,false);assert.deepEqual(g.w,started);
    assert.ok(industryEffects(g.w).capacity<=fx.capacity||p.mode==='technology');assert.ok(industryValid(g.w.industry,id));
    if(p.mode==='stores'){const wrong=id==='tea'?'cafe':'tea',lot=g.world.lots.find(l=>!l.shopId),raw=S.serialize(g.world);assert.equal(S.openShop(g.world,lot.id,{businessId:wrong}).ok,false);assert.equal(S.serialize(g.world),raw);}
  });
  test(`${id}: delayed learning, paid improvements and resumable monthly accounting`,()=>{
    const g=make(id);for(const a of p.axes)g.action({kind:'policy',axis:a.id,value:a.options[1].id});assert.equal(g.action({kind:'invest'}).ok,true);
    g.advance(p.investment.days-1);assert.equal(g.w.industry.stats.investments,0,'no instant resource bonus');assert.ok(g.w.industry.work);
    g.advance(2);assert.equal(g.w.industry.stats.investments,1);assert.equal(g.w.industry.work,null);assert.ok(g.w.industry.stats.spent>=p.investment.cost);
    assert.equal(industryValid(g.w.industry,id),true);const saved=g.save();assert.deepEqual(p.mode==='stores'?saved.shops.find(s=>s.id===g.w.id):saved,p.mode==='stores'?JSON.parse(JSON.stringify(g.w)):g.w);
    g.advance(40);assert.ok(g.w.industry.history.length<=60);assert.ok(industryValid(g.w.industry,id));g.save();
    if(p.mode!=='stores'){assert.equal(commonValid(g.w),true);for(const r of report(g.w).rows){assert.ok(Math.abs(cashIdentity(r,r.cashEnd))<.01);assert.ok(r.research>=0);}}
    else {const m=S.getMonthlyReport(g.world,g.w.id);assert.ok(m.financials.some(x=>x.industryCost>0));assert.ok(m.current.totalCost>=m.current.industryCost);}
  });
}
test('all 21 campaigns expose different loops, specific resources and decisions',()=>{
  assert.equal(Object.keys(INDUSTRIES).length,21);assert.equal(new Set(Object.values(INDUSTRIES).map(p=>p.loop.join('/'))).size,21);assert.equal(new Set(Object.values(INDUSTRIES).map(p=>p.axes.map(a=>a.id+':'+a.options.map(o=>o.id).join('/')).join('|'))).size,21);
});
test('six manufacturing and tech save slots preserve legacy data and reject cross-business fallback',()=>{
  for(const mode of ['manufacturing','technology']) {
    const ids=Object.keys(INDUSTRIES).filter(id=>INDUSTRIES[id].mode===mode),st=storage(),legacy=createOwnerVenture(mode,ids[0]),raw=encodeVenture(legacy);st.setItem(routeKey(mode),raw);
    const migrated=loadVenture(st,mode,ids[0]);assert.equal(migrated.ok,true);assert.equal(migrated.migrated,true);assert.equal(st.getItem(routeKey(mode)),raw);assert.equal(loadVenture(st,mode,ids[1]).found,false);
    for(const id of ids){const g=make(id);assert.equal(storeVenture(st,g.w).ok,true);assert.equal(industryId(loadVenture(st,mode,id).world),id);}
    assert.equal(st.getItem(routeKey(mode)),raw);st.setItem(routeKey(mode,ids[0]),'broken');assert.equal(loadVenture(st,mode,ids[0]).ok,false,'corrupt independent save cannot silently reset to old progress');
    const bad=make(ids[1]).w;bad.industry.resources[INDUSTRIES[ids[1]].resources[0].id]=2;const before=st.getItem(routeKey(mode,ids[1]));assert.equal(storeVenture(st,bad).ok,false);assert.equal(st.getItem(routeKey(mode,ids[1])),before);
  }
});
test('city independent backups are scoped and old mixed-city saves stay readable',()=>{
  const st=storage(),old=S.createWorld({mapData:FIXTURE.map,distances:FIXTURE.dist,noRivals:true,multiBusiness:true});assert.equal(storeLocal(st,encodeSave(old,{})).ok,true);const legacy=st.getItem('tycoon.save.v1');
  for(const id of ['tea','fitness']){const g=make(id),key=industryKey('stores',id);assert.equal(storeLocal(st,encodeSave(g.world,{}),key).ok,true);g.advance(1);assert.equal(storeLocal(st,encodeSave(g.world,{}),key).ok,true);st.setItem(key,'broken');const resumed=loadLocal(st,key);assert.equal(resumed.ok,true);assert.equal(resumed.recovered,true);assert.equal(resumed.world.campaignBusiness,id);}
  assert.equal(st.getItem('tycoon.save.v1'),legacy);assert.equal(loadLocal(st).ok,true);
});
test('SaaS onboarding, platform balance and content stock change real economic calculations',()=>{
  for(const id of ['saas','marketplace','content']){const {w}=make(id),before=technologyMetrics(w);w.industry.resources[INDUSTRIES[id].resources[0].id]=.95;const after=technologyMetrics(w);assert.notDeepEqual(before,after);const be=technologyBreakEven(w);if(be!==null){const users=id==='saas'?w.users-w.paying+be:be;assert.ok(technologyEconomics(w,{users,paying:id==='saas'?be:0}).contribution>=after.fixed-.01);}}
});
test('AI data and evaluation affect actual inspection; entered inspection dates stay fixed',()=>{
  const {w}=make('ai');const o=w.offers[0],q=enterpriseQuote(w,o);assert.ok(q.finish>=w.day+q.days+o.inspection);w.rng=7;enterpriseAction(w,'bid',{id:o.id,factor:1,terms:'standard'});assert.equal(w.orders.length,1);const signed=w.orders[0];signed.progress=signed.work;stepEnterprise(w);const ready=signed.inspectionReady;assert.ok(ready>w.day);w.industry.resources.data=1;w.industry.resources.evaluation=1;assert.equal(enterpriseQuote(w,signed).finish,ready);assert.equal(signed.inspectionReady,ready);
});
for(const [id,p] of Object.entries(INDUSTRIES)) test(`${id}: monthly situation is saved, paid once, repaired over seven operating days`,()=>{
  const g=make(id);g.advance(30);assert.ok(g.w.industry.situation,'each industry has a continuing operating decision');const event=g.w.industry.situation,resource=event.resource,before=g.w.industry.resources[resource],cost=event.cost;
  const restored=g.save();assert.deepEqual((p.mode==='stores'?restored.shops.find(s=>s.id===g.w.id):restored).industry.situation,event);
  const co=p.mode==='stores'?g.world.companies.player:g.w.co,originalCash=co.cash;co.cash=0;const snapshot=JSON.parse(JSON.stringify(p.mode==='stores'?g.world:g.w));assert.equal(g.action({kind:'event',choice:'protect'}).ok,false);assert.deepEqual(JSON.parse(JSON.stringify(p.mode==='stores'?g.world:g.w)),snapshot);co.cash=originalCash;
  const decide=choice=>p.mode==='stores'?S.respondEvent(g.world,g.world.events.list.find(e=>e.kind==='industry'&&e.status==='pending').id,choice==='protect'?'A':'B'):(p.mode==='enterprise'?enterpriseAction:p.mode==='manufacturing'?manufacturingAction:technologyAction)(g.w,'event',{choice});
  assert.equal(decide('protect').ok,true);assert.equal(co.cash,originalCash-cost);assert.equal(g.w.industry.resources[resource],before,'paid repair is not instant');assert.equal(g.w.industry.recovery.remaining,7);assert.equal(g.w.industry.situation,null);
  const stable=JSON.parse(JSON.stringify(p.mode==='stores'?g.world:g.w));assert.equal(g.action({kind:'event',choice:'protect'}).ok,false);assert.deepEqual(JSON.parse(JSON.stringify(p.mode==='stores'?g.world:g.w)),stable);
  g.advance(6);assert.ok(g.w.industry.recovery);g.save();g.advance(1);assert.equal(g.w.industry.recovery,null);assert.ok(g.w.industry.stats.spent>=cost);g.save();
  if(p.mode!=='stores')for(const row of report(g.w).rows)assert.ok(Math.abs(cashIdentity(row,row.cashEnd))<.01);
  else assert.ok(S.getMonthlyReport(g.world,g.w.id).financials.reduce((n,r)=>n+r.industryCost,0)>=cost);
});
test('customer foundations and stock availability cannot grow from idle simulation',()=>{
  const check=[['cafe','regulars'],['bento','contracts'],['bakery','preorders'],['convenience','traffic'],['salon','loyalty'],['supermarket','loyalty'],['fitness','loyalty'],['hotel','repeat'],['ecommerce','repeat'],['packaging','repeat']];
  for(const [id,resource] of check){const {w}=make(id);for(const axis of INDUSTRIES[id].axes)w.industry.policies[axis.id]=axis.options.find(o=>['neighborhood','office','preorder','pickup','fresh','crm','standard'].includes(o.id))?.id||axis.options[0].id;const before=w.industry.resources[resource];for(let day=0;day<20;day++)industryDay(w,day,{volume:0,revenue:0},()=>{},false);assert.ok(w.industry.resources[resource]<=before,`${id} cannot gain customers by idling`);assert.equal(w.industry.milestones.length,0);}
  const {w}=make('convenience'),before=w.industry.resources.availability;for(let day=0;day<20;day++)industryDay(w,day,{volume:0,revenue:0},()=>{},false);assert.equal(w.industry.resources.availability,before);
});
test('store case report carries campaign variables, paid improvements and preserved starting capital',async()=>{
  const {caseReportDocument}=await import('../case-report.js'),g=make('fitness');g.action({kind:'invest'});g.advance(2);const before=clone(g.world),r=S.getFinalReport(g.world),html=caseReportDocument(r);assert.equal(r.initialCash,20000000);assert.equal(r.industries.length,1);assert.match(html,/專屬劇本回顧/);assert.match(html,/業態制度、改善與情境/);assert.match(html,/教練|訓練成果/);assert.deepEqual(g.world,before);
});
test('new city local saves compress losslessly, retain backups and enforce bounded decompression',()=>{
  const data=new Map(),quota=5*1024*1024,st={getItem:k=>data.get(k)||null,setItem:(k,v)=>{const size=[...data].reduce((n,[other,value])=>n+(other===k?0:value.length),0)+v.length;if(size>quota)throw new Error('quota');data.set(k,v);}};
  const old=make('tea'),legacy=encodeSave(old.world,{});assert.equal(storeLocal(st,legacy).ok,true);
  for(const [id,p] of Object.entries(INDUSTRIES).filter(([,p])=>p.mode==='stores')){const g=make(id),key=industryKey(p.mode,id);g.world.eventLog.push({t:0,kind:'info',text:'保留完整城市地圖與歷史資料'.repeat(10000)});const first=encodeSave(g.world,{});assert.equal(storeLocal(st,first,key).ok,true);assert.ok(st.getItem(key).length<first.length/2);assert.deepEqual(decodeSave(st.getItem(key)).world,JSON.parse(JSON.stringify(g.world)));g.advance(1);assert.equal(storeLocal(st,encodeSave(g.world,{}),key).ok,true);assert.equal(decodeSave(st.getItem(key+'.backup')).world.t,0);assert.equal(loadLocal(st,key).world.t,g.world.t);}
  assert.equal(st.getItem('tycoon.save.v1'),legacy);assert.equal(data.size,19);
  for(const bytes of [0,-1,1.5,21*1024*1024])assert.throws(()=>decodeSave(JSON.stringify({format:'tycoon-local',version:1,bytes,data:'eA=='})));
  assert.throws(()=>decodeSave(JSON.stringify({format:'tycoon-local',version:1,bytes:100,data:'broken'})));
});
test('closing a store ends its work and pending industry decision without blocking the city',()=>{
  const g=make('tea');g.advance(30);assert.ok(g.w.industry.situation);g.action({kind:'invest'});const spent=g.w.industry.stats.spent;assert.equal(S.closeShop(g.world,g.w.id).ok,true);assert.equal(g.w.industry.situation,null);assert.equal(g.w.industry.work,null);assert.equal(g.w.industry.stats.spent,spent);assert.equal(g.world.events.list.some(e=>e.kind==='industry'&&e.status==='pending'),false);g.save();
});
test('keeping event cash sacrifices real industry capability and survives reload',()=>{
  for(const id of ['bakery','saas','equipment']){const g=make(id),p=INDUSTRIES[id];g.advance(30);const {resource}=g.w.industry.situation,before=g.w.industry.resources[resource],co=p.mode==='stores'?g.world.companies.player:g.w.co,cash=co.cash;assert.equal(g.action({kind:'event',choice:'accept'}).ok,true);assert.equal(co.cash,cash);assert.equal(g.w.industry.resources[resource],Math.max(0,before-.15));assert.equal(g.w.industry.recovery,null);g.save();}
});
test('independent store ending requires mastery and three profitable complete months',()=>{
  for(const [mastered,previousProfit,status] of [[true,100000,'won'],[false,100000,'lost'],[true,-100000,'lost']]){
    const g=make('tea'),co=g.world.companies.player;g.w.status='open';g.w.openedT=0;g.w.industry.milestones=mastered?[0,1,2]:[0];
    for(const ym of ['2029-07','2029-08']){co.rows.push({ym,loanInterest:0,extraExpense:0});g.w.history.push({ym,turnover:500000,profit:previousProfit});}
    g.w.mtd.storeRev=500000;g.w.mtd.rentDays=30;co.cm.store=500000;g.world.t=S._internals.END_DAY*24;g.world.day=S._internals.dateOf(S._internals.END_DAY-1);S.stepHour(g.world);assert.equal(g.world.status,status,JSON.stringify({reason:g.world.endReason,months:S.getMonthlyReport(g.world).financials,cash:co.cash}));assert.match(g.world.endReason,/三年挑戰/);
  }
});
test('cash projection includes industry fixed fees and does not pay recorded improvements twice',async()=>{
  const {projectCash}=await import('../forecast.js'),g=make('tea');g.w.status='open';g.action({kind:'policy',axis:'training',value:'standard'});g.action({kind:'invest'});const m=clone(g.w.mtd),before=clone(g.world);
  // Use the same shared facility definitions as the runtime, while keeping demand at zero.
  const { E: EXP }=await import('../facilities.js');
  const run=shop=>projectCash({world:g.world,plans:[{shop,samples:7,walk:0,del:0,unit:0,price:0,plat:0,capacity:0,dailyWage:0,wasteRate:0}],dateOf:S._internals.dateOf,computePnL:S._internals.computePnL,newMTD:()=>Object.fromEntries(Object.keys(m).map(k=>[k,0])),monthlyFixed:()=>0,V:S.V,EXP,endDay:S._internals.END_DAY});
  const withFees=run(g.w),without=clone(g.w);delete without.industry;without.mtd.industryDayUnits=0;const plain=run(without);assert.equal(plain.endCash-withFees.endCash,36000,'six monthly policy fees are recorded');const noPaid=clone(without);noPaid.mtd.industryPaid=0;assert.equal(run(noPaid).endCash,plain.endCash,'already-paid project does not create a second cash payment');assert.deepEqual(g.world,before);
});
