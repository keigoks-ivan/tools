import test from 'node:test';
import assert from 'node:assert/strict';
import {RESOURCES} from './network-data.mjs';
import {cleanNetworkState,toggleNetworkResource,selectedResources,effectiveResources} from './network-core.mjs';
import {SETUP_STEPS,setupResources,cleanSetupPreference,setupMatches} from './setup-core.mjs';

test('setup covers existing resources without choosing one or borrowing a planning profile',()=>{
  const ids=SETUP_STEPS.flatMap(step=>setupResources(step.id).map(item=>item.id));
  assert.equal(new Set(ids).size,RESOURCES.length);
  assert.equal(ids.length,RESOURCES.length);
  assert.equal(selectedResources(cleanNetworkState()).size,0);
  assert.deepEqual(setupMatches('status',cleanNetworkState(),'2026-10-26'),[]);
});
test('setup completion and skip are explicit valid decisions, independent of resource count',()=>{
  assert.equal(cleanSetupPreference(null),null);
  assert.equal(cleanSetupPreference({resources:['mb-gold']}),null);
  assert.equal(cleanSetupPreference({version:2,outcome:'completed'}),null);
  assert.equal(cleanSetupPreference({version:1,outcome:'partial'}),null);
  assert.deepEqual(cleanSetupPreference({version:1,outcome:'skipped'}),{version:1,outcome:'skipped',goal:null});
  assert.deepEqual(cleanSetupPreference({version:1,outcome:'completed',goal:'hotel'}),{version:1,outcome:'completed',goal:'hotel'});
});
test('one resource mutation is shared by setup and inventory and preserves only one hotel tier',()=>{
  const first=toggleNetworkResource({resources:['ctbc-ci-precious','mb-gold'],facts:{marriottSource:'card'}},'mb-titanium',true);
  assert.ok(first.resources.includes('ctbc-ci-precious')&&first.resources.includes('mb-titanium'));
  assert.ok(!first.resources.includes('mb-gold'));
  assert.equal(first.facts.marriottSource,'card');
  assert.ok(!first.resources.includes('mb-platinum')&&!first.resources.includes('sq-gold'));
  const removed=toggleNetworkResource(first,'mb-titanium',false);
  assert.ok(!effectiveResources(removed).has('mb-platinum'));
});
test('optional balances distinguish unknown and zero and never imply ownership or status',()=>{
  const value=cleanNetworkState({resources:['cube-credit','marriott-points','all-account','mb-gold'],balances:{'cube-credit':'0','marriott-points':'','all-account':400,'mb-gold':100,'avios':20000}});
  assert.deepEqual(value.balances,{'cube-credit':0});
  assert.deepEqual(cleanNetworkState({resources:['cube-credit'],balances:{'cube-credit':'-5'}}).balances,{});
  assert.deepEqual(cleanNetworkState({resources:['cube-credit'],balances:{'cube-credit':'12.5'}}).balances,{'cube-credit':12.5});
  assert.ok(!effectiveResources({balances:{'mb-platinum':50000}}).has('mb-platinum'));
  const removed=toggleNetworkResource(value,'cube-credit',false);assert.ok(!('cube-credit' in removed.balances));
});
test('candidate suggestions require a real entry, goal match and no known exclusion',()=>{
  const ci={resources:['ctbc-ci-precious']};
  const status=setupMatches('status',ci,'2026-10-26');
  assert.ok(status.some(item=>item.op.id==='P013'));
  assert.ok(!status.some(item=>['P005','P006','P012'].includes(item.op.id)));
  assert.ok(status.every(item=>item.op.goal==='status'));
  assert.ok(!setupMatches('flight',ci,'2026-10-26').some(item=>item.op.id==='P013'));
  const consumed=setupMatches('status',{resources:['mb-titanium'],facts:{partnerUsed:'yes'}},'2026-10-26');
  assert.ok(!consumed.some(item=>item.op.id==='P005'));
  const conflict=setupMatches('hotel',{resources:['all-account','qatar-account'],facts:{allPartner:'flying-blue',allLinkAge:'recent'}},'2026-10-26');
  assert.ok(!conflict.some(item=>item.op.id==='P011'));
  assert.ok(setupMatches('all',ci,'2026-10-26').every(item=>!['closed','blocked','scheduled'].includes(item.check.state)));
  const zeroPoints=setupMatches('status',{resources:['cube-credit'],balances:{'cube-credit':0}},'2026-10-26');
  assert.ok(!zeroPoints.some(item=>item.op.id==='N022'));
});
