import test from 'node:test';
import assert from 'node:assert/strict';
import {RESOURCES,OPPORTUNITIES,NETWORK_RULES,NETWORK_SOURCES} from './network-data.mjs';
import {BANK_CARDS,HSBC_CARD_IDS,DBS_CARD_IDS,ANA_CARD_IDS,normalizeRewardSearch,resourceSearchText} from './bank-entries-data.mjs';
import {cleanNetworkState,toggleNetworkResource,effectiveResources,evaluateOpportunity} from './network-core.mjs';
import {setupResources,setupMatches} from './setup-core.mjs';
import {TREES} from './tree-data.mjs';
import {ASSETS} from './content.mjs';
import {cardFee} from './core.mjs';

test('all listed cards are selectable and labels never assert ownership',()=>{
  const cards=new Set(setupResources('cards').map(item=>item.id));
  for(const id of [...HSBC_CARD_IDS,...DBS_CARD_IDS,...ANA_CARD_IDS])assert.ok(cards.has(id),id);
  for(const item of RESOURCES)assert.ok(!item.label.includes('已持有'),item.label);
  for(const query of ['匯豐','滙豐','HSBC','ＴｒａｖｅｌＯｎｅ'])assert.equal(setupResources('cards').filter(item=>resourceSearchText(item).includes(normalizeRewardSearch(query))).length,3);
});
test('bank card holdings open earning entries without creating balances, miles or status',()=>{
  for(const [ids,entry,currency] of [[HSBC_CARD_IDS,'B001','hsbc-travel'],[DBS_CARD_IDS,'B004','dbs-fly'],[ANA_CARD_IDS,'B005','ana-miles']]){
    for(const id of ids){
      const value=toggleNetworkResource({},id,true),resources=effectiveResources(value);
      assert.ok(!resources.has(currency)&&!resources.has('sq-gold')&&!resources.has('mb-gold'));
      assert.deepEqual(value.balances,{});
      assert.ok(setupMatches('flight',value,'2026-10-27').some(item=>item.op.id===entry));
    }
  }
  for(const id of HSBC_CARD_IDS){
    const value={resources:[id]},resources=effectiveResources(value);
    assert.equal(resources.has('visa-infinite'),id==='hsbc-traveller-infinite');
    assert.equal(evaluateOpportunity(OPPORTUNITIES.find(op=>op.id==='B002'),resources,{},'2026-10-27').state,'missing');
    assert.equal(setupMatches('hotel',value,'2026-10-27').find(item=>item.op.id==='B003').check.state,'missing');
  }
  const zero={resources:[HSBC_CARD_IDS[0],'hsbc-travel'],balances:{'hsbc-travel':0}};
  assert.equal(setupMatches('hotel',zero,'2026-10-27').find(item=>item.op.id==='B003').check.state,'missing');
  assert.ok(!setupMatches('flight',{resources:[HSBC_CARD_IDS[0]]},'2027-01-01').some(item=>item.op.id==='B001'));
});
test('unlisted entries survive save and resource edits as notes without granting prerequisites',()=>{
  const value=cleanNetworkState({unlisted:{cards:' Other bank card ',status:'sq-gold',points:'hsbc-travel',evil:'injected'}});
  assert.deepEqual(value.unlisted,{cards:'Other bank card',status:'sq-gold',points:'hsbc-travel'});
  assert.equal(effectiveResources(value).size,0);assert.deepEqual(setupMatches('all',value,'2026-10-27'),[]);
  const saved=JSON.parse(JSON.stringify(toggleNetworkResource(value,'ctbc-ci-precious',true)));
  assert.deepEqual(cleanNetworkState(saved).unlisted,value.unlisted);
  assert.equal(effectiveResources(saved).has('sq-gold'),false);
  assert.equal(cleanNetworkState({unlisted:{cards:'x'.repeat(600),status:42,points:'  '}}).unlisted.cards.length,500);
});
test('HSBC comparisons keep domestic, overseas and conditional fees separate with valid sources',()=>{
  assert.deepEqual(BANK_CARDS.map(card=>cardFee(card).amount),[8000,2500,0]);
  assert.deepEqual(BANK_CARDS.map(card=>card.earning.base_twd_per_point),[18,18,20]);
  assert.deepEqual(BANK_CARDS.map(card=>card.earning.overseas_twd_per_point),[10,15,20]);
  assert.equal(BANK_CARDS[2].fees.annual_twd,2000);assert.ok(BANK_CARDS[2].fees.waiver_note.includes('新戶'));
  for(const card of BANK_CARDS){
    assert.ok(ASSETS[card.asset]);
    for(const id of card.rule_ids)assert.ok(NETWORK_RULES.some(rule=>rule.id===id));
    for(const id of card.source_ids)assert.ok(NETWORK_SOURCES.some(source=>source.id===id));
    assert.equal(card.recommendation_ready,false);
  }
  const mapped=new Set(TREES.flatMap(tree=>tree.nodes.flatMap(node=>[...(node.resources||[]),...(node.start_resources||[])])));
  for(const id of [...HSBC_CARD_IDS,...DBS_CARD_IDS,...ANA_CARD_IDS])assert.ok(mapped.has(id));
});
