import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CUBE_PARTNERS,cubeQuote,cubeIhgPromotion} from './cube-data.mjs';
import {cubeRows} from './cube.mjs';
import {STAY_POLICIES,evaluateStay} from './stay.mjs';
import {OPPORTUNITIES,NETWORK_SOURCES,NETWORK_COVERAGE,NETWORK_COVERAGE_UPDATES} from './network-data.mjs';
import {effectiveResources,selectedResources,evaluateOpportunity,traceResources} from './network-core.mjs';
import {TREES,TREE_SOURCES} from './tree-data.mjs';
const check=(id,resources,facts={},date='2026-10-24')=>evaluateOpportunity(OPPORTUNITIES.find(item=>item.id===id),new Set(resources),facts,date);
const choices={brand:'standard',rate:'paid',channel:'direct',credit:'actual',time:'within'};
test('MEA is accepted normally, excluded for JAL and unresolved for SQ, without changing the policy',()=>{
  const input={...choices,brand:'mea'};
  assert.equal(evaluateStay('mb-normal',input).state,'conditional');
  assert.equal(evaluateStay('mb-jal',input).state,'excluded');
  assert.equal(evaluateStay('mb-sq',input).state,'pending');
  assert.equal(evaluateStay('mb-sq',{...input,rate:'reward'}).state,'excluded');
  assert.equal(evaluateStay('mb-sq',input).state,'pending');
});
test('award nights and card ENC cannot use normal Marriott rules to pass partnership challenges',()=>{
  for(const rate of ['reward','cash-points','certificate']){
    assert.equal(evaluateStay('mb-normal',{...choices,rate}).state,'conditional');
    for(const id of ['mb-sq','mb-jal'])assert.equal(evaluateStay(id,{...choices,rate}).state,'excluded');
  }
  assert.equal(evaluateStay('mb-sq',{...choices,credit:'bonus'}).state,'excluded');
  assert.equal(evaluateStay('mb-normal',{...choices,brand:'studiores'}).state,'excluded');
});
test('unclear split stays and unpublished individual challenges remain unresolved',()=>{
  assert.equal(evaluateStay('mb-jal',{...choices,time:'cross'}).state,'pending');
  assert.equal(evaluateStay('mb-jal',{}).state,'pending');
  for(const id of ['mb-public','mb-corporate','scandic'])assert.equal(evaluateStay(id,choices).state,'pending');
});
test('Hilton reward stays are excluded while unspecified certificates are not invented as accepted',()=>{
  const values={...choices,brand:'participating'};
  assert.equal(evaluateStay('hilton',{...values,rate:'reward'}).state,'excluded');
  assert.equal(evaluateStay('hilton',{...values,rate:'certificate'}).state,'pending');
  assert.equal(evaluateStay('hilton',{...values,rate:'cash-points'}).state,'pending');
});
test('Hyatt corporate prebooking and Aeroplan checkout deadlines are distinct restrictions',()=>{
  assert.equal(evaluateStay('hyatt-corporate',{...choices,brand:'participating',booking:'before'}).state,'excluded');
  assert.equal(evaluateStay('hyatt-ap',{...choices,brand:'hyatt',time:'late-checkout'}).state,'excluded');
  assert.equal(evaluateStay('hyatt-ap',{...choices,brand:'venetian'}).state,'conditional');
});
test('IHG Visa rejects Taiwan issue and sub-30 dollar paid rates, irrespective of card prestige',()=>{
  const values={...choices,brand:'participating',market:'listed'};
  assert.equal(evaluateStay('ihg-visa',values).state,'conditional');
  assert.equal(evaluateStay('ihg-visa',{...values,market:'tw'}).state,'excluded');
  assert.equal(evaluateStay('ihg-visa',{...values,rate:'low'}).state,'excluded');
  assert.equal(check('N024',['visa-overseas','ihg-account'],{ihgVisaMarket:'taiwan'}).state,'blocked');
});
test('all policy, coverage and graph research references point to registered sources and rules',async()=>{
  const data=JSON.parse(await readFile(new URL('./data.json',import.meta.url),'utf8'));
  const ids=new Set([...data.sources,...NETWORK_SOURCES,...TREE_SOURCES].map(item=>item.id));
  for(const policy of STAY_POLICIES)for(const id of policy.sources)assert.ok(ids.has(id),policy.id+': '+id);
  for(const row of [...NETWORK_COVERAGE,...Object.values(NETWORK_COVERAGE_UPDATES)])for(const id of row.source_ids||[])assert.ok(ids.has(id),id);
  for(const partner of CUBE_PARTNERS)for(const id of partner.sources)assert.ok(ids.has(id),id);
  for(const tree of TREES)for(const node of tree.nodes)if(node.stay_policy)assert.ok(STAY_POLICIES.some(policy=>policy.id===node.stay_policy));
});
test('CUBE contains 14 airline and 4 hotel outlets, including the distinct Shangri-La output',()=>{
  assert.equal(CUBE_PARTNERS.filter(item=>item.kind==='航空').length,14);
  assert.equal(CUBE_PARTNERS.filter(item=>item.kind==='飯店').length,4);
  assert.equal(cubeQuote('shangri-la',{balance:1100}).received,500);
  assert.equal(cubeQuote('eva',{balance:1000}).received,2000);
  assert.equal(cubeQuote('eva',{balance:1000}).remainder,280);
  assert.equal(cubeQuote('eva',{balance:1000,tier:'world'}).received,3000);
  assert.equal(cubeQuote('ci',{tier:'world'}).input,720);
  assert.equal(cubeQuote('eva',{tier:'asia-world'}).input,360);
  assert.equal(cubeQuote('eva',{balance:359}).received,0);
  assert.equal(cubeQuote('eva',{balance:-1}).valid,false);
});
test('2027 announced changes never invent unlisted partners or world-card ratios',()=>{
  assert.equal(cubeQuote('eva',{year:'2027'}).input,380);
  assert.equal(cubeQuote('sq',{year:'2027'}).input,null);
  assert.equal(cubeQuote('eva',{year:'2027',tier:'world'}).input,null);
  assert.match(cubeRows({year:'2027',tier:'world'}),/尚未確認/);
});
test('IHG limited campaign uses strictly greater base points, not bonus points, for status',()=>{
  assert.equal(cubeIhgPromotion(10000).base,40000);
  assert.equal(cubeIhgPromotion(10000).status,'尚未超過會籍門檻');
  assert.equal(cubeIhgPromotion(10250).status,'金卡門檻');
  assert.equal(cubeIhgPromotion(15000).status,'金卡門檻');
  assert.equal(cubeIhgPromotion(15250).status,'白金門檻');
  assert.equal(cubeIhgPromotion(15250).total,91500);
  assert.equal(check('N012',['cube-credit'],{},'2026-09-30').state,'scheduled');
  assert.equal(check('N012',['cube-credit'],{},'2026-11-30').state,'connected');
  assert.equal(check('N012',['cube-credit'],{},'2026-12-01').state,'closed');
});
test('CUBE card or Life points do not manufacture a transferable credit balance or Aeroplan status',()=>{
  for(const resources of [['cube-life'],['cube-card'],['cube-asia-world']])assert.equal(check('N010',resources).state,'missing');
  const owned=effectiveResources({resources:['cube-card','cube-credit']});
  assert.ok(!owned.has('ap-elite')&&!owned.has('cube-world'));
  assert.equal(check('N021',[...owned,'hyatt-account'],{hyattApLinked:'yes',hyattApUsed:'no'}).state,'missing');
});
test('unknown Platinum-plus never becomes Titanium for RewardsPlus; exact tiers still satisfy SQ legacy gates',()=>{
  const ambiguous=effectiveResources({resources:['mb-platinum']});
  assert.equal(check('N018',[...ambiguous],{marriottSource:'earned'}).state,'missing');
  const exact=effectiveResources({resources:['mb-titanium']});
  assert.ok(exact.has('mb-platinum'));
  assert.ok(!selectedResources({resources:['mb-titanium']}).has('mb-platinum'));
  assert.equal(check('N018',[...exact],{marriottSource:'earned'}).state,'connected');
  assert.equal(check('N018',[...exact],{marriottSource:'trial'}).state,'blocked');
  assert.equal(check('P005',[...exact],{marriottSource:'earned',partnerUsed:'no',otherSqChallenge:'no'}).state,'connected');
});
test('JAL Premier cannot reach the Diamond-only Platinum branch, and confirmed annual Metal benefits can recur',()=>{
  assert.equal(check('N013',['jal-premier','mb-gold'],{jalLinked:'no'}).state,'missing');
  assert.equal(check('N013',['jal-metal','mb-gold'],{jalLinked:'annual'}).state,'connected');
  const tree=TREES.find(item=>item.id==='jal-marriott');
  assert.equal(traceResources(tree,new Set(['jal-premier']),'jal-platinum').connected,false);
  assert.equal(traceResources(tree,new Set(['jal-metal']),'jal-platinum').connected,true);
});
test('Aeroplan premium cards allow a second annual Hyatt attempt, while status-only members do not',()=>{
  const facts={hyattApLinked:'yes',hyattApUsed:'one'};
  assert.equal(check('N021',['ap-elite','hyatt-account'],facts).state,'blocked');
  assert.equal(check('N021',['ap-premium-card','hyatt-account'],facts).state,'connected');
  assert.equal(check('N021',['ap-premium-card','hyatt-account'],{...facts,hyattApUsed:'two'}).state,'blocked');
});
