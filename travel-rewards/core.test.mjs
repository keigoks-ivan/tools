import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_PROFILE,evaluateRoute,redemptionValue,challengeCost,cardFee,eligibleTransfer} from './core.mjs';
import {ROUTES,RULE_EN,CARD_EN} from './content.mjs';
const data=JSON.parse(await readFile(new URL('./data.json',import.meta.url),'utf8'));
const route=id=>ROUTES.find(item=>item.id===id);
const profile=patch=>({...DEFAULT_PROFILE,...patch});
const eligible={marriott:'platinum',krisflyer:'member',provenance:'earned',linked:'no',otherChallenge:'no'};

test('unknown status never counts as verified eligibility',()=>{assert.equal(evaluateRoute(route('P005'),profile({})).state,'unknown');});
test('Marriott Gold cannot enter the Platinum-to-Gold branch',()=>{const e=evaluateRoute(route('P005'),profile({...eligible,marriott:'gold'}));assert.equal(e.state,'blocked');assert.ok(e.blockers.some(pair=>pair[1].includes('Platinum')));});
test('Platinum with known prerequisites remains a candidate, not a guaranteed approval',()=>{assert.equal(evaluateRoute(route('P005'),profile(eligible)).state,'candidate');});
test('trial status is excluded even when the tier is high enough',()=>{assert.equal(evaluateRoute(route('P005'),profile({...eligible,provenance:'trial'})).state,'blocked');});
test('one-time registration cannot be reused',()=>{assert.equal(evaluateRoute(route('P005'),profile({...eligible,linked:'yes'})).state,'blocked');});
test('other KrisFlyer challenge in progress is a conflict',()=>{assert.equal(evaluateRoute(route('P005'),profile({...eligible,otherChallenge:'yes'})).state,'blocked');});
test('existing KrisFlyer Silver cannot take the Marriott Gold Silver accelerator',()=>{assert.equal(evaluateRoute(route('P012'),profile({...eligible,marriott:'gold',krisflyer:'silver'})).state,'blocked');});
test('existing Hilton Gold is excluded from the public FAQ route',()=>{assert.equal(evaluateRoute(route('P007'),profile({hilton:'gold',hiltonMatched:'no'})).state,'blocked');});
test('Hilton Base still retains unresolved official scope conflict',()=>{assert.equal(evaluateRoute(route('P007'),profile({hilton:'base',hiltonMatched:'no'})).state,'conflict');});
test('limited offer receipt deadline is distinct from later approval deadline',()=>{assert.equal(evaluateRoute(route('P010'),profile({}),'2026-10-24').state,'closed');});
test('expired hotel transfer period closes that specific route',()=>{assert.equal(evaluateRoute(route('H001'),profile({card:'amex-mr'}),'2027-07-01').state,'closed');});
test('known fee budget and prior spending gate the upgrade route',()=>{assert.equal(evaluateRoute(route('P003'),profile({maxFee:'0',annualSpend:'1200000'})).state,'blocked');assert.equal(evaluateRoute(route('P003'),profile({annualSpend:'1199999'})).state,'blocked');});
test('redemption value includes taxes and incremental fees',()=>{assert.deepEqual(redemptionValue({cash:50000,miles:60000,taxes:5000,extra:1000}),{saving:44000,valuePerMile:44000/60000});});
test('redemption handles missing, zero, negative and worse-than-cash inputs',()=>{assert.equal(redemptionValue({cash:'',miles:60000,taxes:0,extra:0}),null);assert.equal(redemptionValue({cash:1,miles:0,taxes:0,extra:0}),null);assert.equal(redemptionValue({cash:1,miles:1,taxes:-1,extra:0}),null);assert.equal(redemptionValue({cash:100,miles:1000,taxes:200,extra:0}).saving,-100);});
test('challenge cost counts only supplied incremental spending',()=>{assert.deepEqual(challengeCost({nights:4,nightly:3000,flights:5000,transport:1000,fees:0,benefit:9000}),{total:18000,net:-9000});assert.equal(challengeCost({nights:1.5,nightly:1,flights:0,transport:0,fees:0,benefit:0}),null);});
test('unknown renewal fee is not silently zero',()=>{assert.equal(cardFee({fees:{annual_twd:null}}).amount,null);assert.deepEqual(cardFee({fees:{first_year_waived:true,annual_twd:1800}}),{amount:0,period:'first',renewal:1800});});
test('hotel MR transfer requires minimum and increment',()=>{const r=data.rules.find(item=>item.id==='R013');assert.equal(eligibleTransfer(999,r),null);assert.equal(eligibleTransfer(1500,r),null);assert.equal(eligibleTransfer(2000,r),1800);});
test('research references, translations and distinct currencies stay intact',()=>{
  const rules=new Set(data.rules.map(item=>item.id)),sources=new Set(data.sources.map(item=>item.id));
  assert.equal(data.complete,false);assert.equal(data.cards.length,CARD_EN.length);
  for(const rule of data.rules){assert.ok(RULE_EN[rule.id]);for(const id of rule.source_ids)assert.ok(sources.has(id));}
  for(const item of [...data.cards,...data.pathways])for(const id of item.rule_ids)assert.ok(rules.has(id));
  for(const item of ROUTES){const ids=item.rule_ids||data.pathways.find(path=>path.id===item.id)?.rule_ids;assert.ok(ids?.length);for(const id of ids)assert.ok(rules.has(id));}
  assert.equal(data.cards.find(card=>card.id==='amex-eva-platinum-card').asset,'EVA_redeemable_miles');
  assert.equal(data.cards.find(card=>card.id==='amex-platinum-charge').asset,'AMEX_TW_MR');
  for(const source of data.sources)assert.equal(new URL(source.url).protocol,'https:');
});
