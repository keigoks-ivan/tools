import test from 'node:test';
import assert from 'node:assert/strict';
import {RESOURCES,OPPORTUNITIES,NETWORK_RULES,NETWORK_SOURCES,NETWORK_COVERAGE} from './network-data.mjs';
import {TREES,TREE_SOURCES} from './tree-data.mjs';
import {cleanNetworkState,effectiveResources,selectedResources,evaluateOpportunity,relatedViews,traceResources,coverageSummary} from './network-core.mjs';
import {RULE_FIELD_LABELS} from './fields.mjs';
import {readFile} from 'node:fs/promises';
import {ROUTES} from './content.mjs';
const op=id=>OPPORTUNITIES.find(item=>item.id===id);
const check=(id,resources,facts={})=>evaluateOpportunity(op(id),new Set(resources),facts);
test('every existing route and new opportunity has a real map destination',()=>{
  for(const route of ROUTES)assert.ok(op(route.id),route.id);
  const ids=new Set(RESOURCES.map(item=>item.id));
  assert.equal(ids.size,RESOURCES.length);
  assert.equal(new Set(OPPORTUNITIES.map(item=>item.id)).size,OPPORTUNITIES.length);
  for(const item of OPPORTUNITIES){assert.ok(TREES.some(tree=>tree.id===item.tree&&tree.nodes.some(node=>node.id===item.node)),item.id);for(const id of [...item.any,...item.all,...(item.forbidden||[]),...(item.allGroups||[]).flat()])assert.ok(ids.has(id),id);}
  for(const tree of TREES)for(const node of tree.nodes)for(const id of [...(node.resources||[]),...(node.start_resources||[]),...(node.bridge_resources||[])])assert.ok(ids.has(id),id);
});
test('holding an eligible card does not manufacture enrolled hotel status or MR from EVA',()=>{
  const resources=effectiveResources({resources:['amex-eva-platinum-card','ctbc-ci-precious']});
  assert.ok(resources.has('visa-infinite'));
  assert.ok(!resources.has('mb-gold')&&!resources.has('hh-gold')&&!resources.has('amex-mr')&&!resources.has('ctbc-ci-priority'));
  assert.equal(check('P004',[...resources]).state,'connected');
  assert.equal(check('P001',[...resources]).state,'missing');
  assert.equal(check('P006',[...resources]).state,'missing');
});
test('manual resource overrides preserve multiple cards and one current tier per program',()=>{
  const saved=cleanNetworkState({resources:['amex-platinum-credit','mb-platinum'],removed:['ctbc-ci-precious'],facts:{partnerUsed:'unknown',evil:'yes'}});
  const resources=effectiveResources(saved,{card:'ci',ciTier:'precious',marriott:'gold'});
  assert.ok(resources.has('amex-platinum-credit')&&resources.has('mb-platinum'));
  assert.ok(!resources.has('mb-gold')&&!resources.has('ctbc-ci-precious'));
  assert.equal(saved.facts.partnerUsed,'unknown');assert.ok(!('evil' in saved.facts));
  assert.ok(!selectedResources({resources:['ctbc-ci-precious']}).has('visa-infinite'));
});
test('Hilton needs source status AND recent stay proof AND allowed current tier',()=>{
  const facts={hiltonUsed:'no',competitorStay:'yes'};
  assert.equal(check('P007',['mb-gold','hh-base'],facts).state,'conflict');
  assert.equal(check('P007',['mb-gold','hh-base'],{...facts,competitorStay:'no'}).state,'blocked');
  assert.equal(check('P007',['mb-gold','hh-gold'],facts).state,'blocked');
  assert.equal(check('P007',['mb-gold'],facts).state,'missing');
});
test('partnership provenance and consumed registration remain blocked across maps',()=>{
  const facts={partnerUsed:'no',otherSqChallenge:'no',marriottSource:'card'};
  assert.equal(check('P005',['mb-platinum'],facts).state,'connected');
  assert.equal(check('P005',['mb-platinum'],{...facts,marriottSource:'trial'}).state,'blocked');
  assert.equal(check('P005',['mb-platinum'],{...facts,partnerUsed:'yes'}).state,'blocked');
  assert.equal(check('P012',['mb-platinum'],facts).state,'blocked');
});
test('Marriott spend upgrades keep card tier and qualifying spend together',()=>{
  assert.equal(check('N001',['ctbc-marriott-priority'],{mbSpend150:'yes'}).state,'connected');
  assert.equal(check('N001',['ctbc-marriott-priority'],{mbSpend150:'no'}).state,'blocked');
  assert.equal(check('N002',['ctbc-marriott-signature'],{mbSpend100:'yes'}).state,'missing');
  assert.equal(check('P010',['ctbc-marriott-priority-limited']).state,'closed');
  assert.equal(check('N001',['ctbc-marriott-priority-limited'],{mbSpend150:'yes'}).state,'connected');
});
test('Qatar cannot use a recent competing ALL link as eligible',()=>{
  assert.equal(check('P011',['all-account','qatar-account'],{allPartner:'flying-blue',allLinkAge:'recent'}).state,'blocked');
  assert.equal(check('P011',['all-account'],{allPartner:'qatar'}).state,'missing');
  assert.equal(check('P011',['all-account','qatar-account'],{allPartner:'flying-blue',allLinkAge:'old'}).state,'missing');
  assert.equal(check('P011',['all-account','qatar-account'],{allPartner:'qatar'}).state,'connected');
});
test('shared resources create explicit cross-map exits without inventing airline status',()=>{
  const ci=TREES.find(tree=>tree.id==='ci-card');
  const exits=relatedViews(TREES,'ci-card',ci.nodes.find(node=>node.id==='ci-precious'));
  assert.ok(exits.some(exit=>exit.tree==='sas-chain'&&exit.node==='visa'));
  const mr=TREES.find(tree=>tree.id==='points-air').nodes.find(node=>node.id==='mr-air-source');
  assert.ok(!relatedViews(TREES,'points-air',mr).some(exit=>exit.tree==='amex-hotels'));
  const amex=TREES.find(tree=>tree.id==='amex-hotels').nodes.find(node=>node.id==='amex-charge');
  assert.ok(relatedViews(TREES,'amex-hotels',amex).some(exit=>exit.tree==='points-air'));
  const sq=TREES.find(tree=>tree.id==='marriott-sq');
  assert.equal(traceResources(sq,new Set(['ctbc-ci-precious']),'mb-plat-target').connected,false);
  assert.equal(traceResources(sq,new Set(['mb-platinum']),'sq-gold').connected,true);
});
test('new research records retain unresolved sources, asset distinctions and coverage gaps',()=>{
  assert.equal(NETWORK_RULES.find(item=>item.id==='R071').values.bank_reward_points_are_status_points,false);
  assert.equal(NETWORK_RULES.find(item=>item.id==='R072').values.reverse_cancels_transfer,false);
  const sourceIds=new Set(NETWORK_SOURCES.map(item=>item.id));assert.ok(sourceIds.has('network-mb-spend'));
  assert.equal(NETWORK_COVERAGE.find(item=>item.id==='marriott-jal-partnership').research_status,'selected_fields_verified_gaps_remain');
  const summary=coverageSummary({coverage:NETWORK_COVERAGE},OPPORTUNITIES,TREES);assert.equal(summary.mapped,OPPORTUNITIES.length);assert.ok(summary.queued>0);
});

test('every new research value has a Chinese label and valid source reference',async()=>{
  const data=JSON.parse(await readFile(new URL('./data.json',import.meta.url),'utf8'));
  const sources=new Set([...data.sources,...TREE_SOURCES,...NETWORK_SOURCES].map(item=>item.id));
  for(const rule of NETWORK_RULES){for(const id of rule.source_ids)assert.ok(sources.has(id),id);for(const key of Object.keys(rule.values))assert.ok(RULE_FIELD_LABELS[key],key);}
  for(const source of NETWORK_SOURCES)assert.equal(new URL(source.url).protocol,'https:');
});

test('Marriott card upgrade connectors never pass through unrelated status nodes',()=>{
  const tree=TREES.find(item=>item.id==='marriott-card');
  for(const edge of tree.edges.filter(item=>Number.isFinite(item.viaX))){
    const from=tree.nodes.find(item=>item.id===edge.from),to=tree.nodes.find(item=>item.id===edge.to),startY=from.y+56,endY=to.y+56;
    for(const node of tree.nodes.filter(item=>![edge.from,edge.to].includes(item.id))){
      const horizontal=(a,b,y)=>y>node.y&&y<node.y+112&&Math.max(a,b)>node.x&&Math.min(a,b)<node.x+194;
      const vertical=edge.viaX>node.x&&edge.viaX<node.x+194&&Math.max(startY,endY)>node.y&&Math.min(startY,endY)<node.y+112;
      assert.ok(!horizontal(from.x+194,edge.viaX,startY)&&!horizontal(edge.viaX,to.x,endY)&&!vertical,edge.id+' crosses '+node.id);
    }
  }
});
