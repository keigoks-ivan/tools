import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OPPORTUNITIES,NETWORK_SOURCES,NETWORK_RULES,FACTS} from './network-data.mjs';
import {TREES,TREE_SOURCES} from './tree-data.mjs';
import {evaluateAllLink,evaluateOpportunity,effectiveResources,cleanNetworkState,relevantNetworkFacts} from './network-core.mjs';
import {HOTEL_PROGRAMS,hotelTransferRows,hotelValue} from './hotel-use.mjs';
import {STAY_POLICIES,evaluateStay} from './stay.mjs';
const op=id=>OPPORTUNITIES.find(item=>item.id===id);
const check=(id,resources,facts={})=>evaluateOpportunity(op(id),effectiveResources({resources}),facts,'2026-10-25');
test('ALL only has one actual airline link; twelve months is not automatic unlinking',()=>{
  assert.equal(evaluateAllLink({partner:'qatar',required:true},{allPartner:'flying-blue',allLinkAge:'recent'}).blocked.length,1);
  assert.equal(evaluateAllLink({partner:'qatar',required:true},{allPartner:'flying-blue',allLinkAge:'old'}).missing.length,1);
  assert.equal(evaluateAllLink({partner:'qatar',required:true},{allPartner:'qatar'}).missing.length,0);
  assert.equal(evaluateAllLink({partner:'flying-blue',required:true},{allPartner:'qatar'}).missing.length,1);
  assert.equal(evaluateAllLink({partner:'flying-blue',required:false},{allPartner:'none'}).missing.length,0);
  assert.equal(evaluateAllLink({partner:'flying-blue',required:true},{allPartner:'none'}).missing.length,1);
});
test('legacy relative link answers cannot silently assert a real link to both partners',()=>{
  const clean=cleanNetworkState({facts:{allOtherLinked:'no'}});
  assert.ok(!FACTS.some(field=>field.id==='allOtherLinked'));
  assert.ok(!('allOtherLinked' in clean.facts));
  assert.equal(check('P011',['all-account','qatar-account'],clean.facts).state,'missing');
  assert.equal(check('N033',['all-account','fb-account'],{allPartner:'qatar',allLinkAge:'recent'}).state,'blocked');
});
test('Qatar status needs grade, first qualified activity, quota and unused one-time opportunity together',()=>{
  const facts={allPartner:'qatar',allStatusSource:'earned',qatarBoostQuota:'confirmed',qatarBoostUsed:'no',qatarFirstFlight:'yes'};
  assert.equal(check('N031',['all-gold','qatar-account'],facts).state,'connected');
  assert.equal(check('N031',['all-silver','qatar-account'],facts).state,'missing');
  assert.equal(check('N031',['all-gold','qatar-account'],{...facts,qatarBoostUsed:'yes'}).state,'blocked');
  assert.equal(check('N031',['all-gold','qatar-account'],{...facts,qatarBoostQuota:'unknown'}).state,'missing');
  assert.equal(check('N031',['all-gold','qatar-account'],{...facts,qatarBoostQuota:'exhausted'}).state,'blocked');
});
test('nonstandard sources and domestic ALL stays remain pending, not invented as universally rejected',()=>{
  const facts={allPartner:'qatar',qatarStatusSource:'earned',allBoostQuota:'confirmed',allQatarBoostUsed:'no',qatarFirstStay:'foreign'};
  assert.equal(check('N032',['qr-platinum','all-account'],facts).state,'conflict');
  assert.equal(check('N032',['qr-platinum','all-account'],{...facts,qatarFirstStay:'domestic'}).state,'missing');
  assert.equal(check('N032',['qr-platinum','all-account'],{...facts,qatarFirstStay:'no'}).state,'blocked');
  assert.equal(check('N032',['qr-platinum','all-account'],{...facts,qatarStatusSource:'card'}).state,'missing');
});
test('Flying Blue first rewards are limited qualification units, never automatic high status',()=>{
  const rule=NETWORK_RULES.find(item=>item.id==='R099');
  assert.equal(rule.values.all_first_total_nights,2);assert.equal(rule.values.fb_first_total_xp,10);assert.equal(rule.values.guaranteed_gold_status,false);
  assert.equal(check('N035',['all-account','fb-account'],{allPartner:'flying-blue',fbFirstBonus:'both'}).state,'blocked');
  assert.equal(check('N035',['all-account','fb-account'],{allPartner:'flying-blue',fbFirstBonus:'stay'}).state,'connected');
  assert.equal(NETWORK_RULES.find(item=>item.id==='R100').values.automatic_transfer_supported,false);
});
test('one Qatar direction cannot borrow the other direction provenance or quota',()=>{
  const facts={allPartner:'qatar',allStatusSource:'earned',qatarBoostQuota:'confirmed',qatarBoostUsed:'no',qatarFirstFlight:'yes',allQatarBoostUsed:'no',qatarFirstStay:'foreign'};
  assert.equal(check('N031',['all-gold','qatar-account'],facts).state,'connected');
  assert.equal(check('N032',['qr-gold','all-account'],facts).state,'missing');
});
test('hotel rewards do not manufacture status and IHG fourth-night card eligibility',()=>{
  const resources=effectiveResources({resources:['ihg-points','cube-credit','all-points']});
  assert.ok(!resources.has('chase-ihg-select')&&!resources.has('all-gold'));
  assert.equal(check('N029',[...resources]).state,'missing');
  assert.equal(check('N029',['ihg-points','chase-ihg-select']).state,'connected');
  assert.equal(check('N027',['hilton-points','hh-base']).state,'missing');
  assert.equal(check('N027',['hilton-points','hh-silver']).state,'connected');
});
test('normal ALL qualification does not override Qatar full-point exclusions or FB first-XP uncertainty',()=>{
  const choices={brand:'participating',rate:'reward',channel:'direct',credit:'actual',time:'after-link',country:'foreign'};
  assert.equal(evaluateStay('all-qatar',choices).state,'excluded');
  assert.equal(evaluateStay('all-fb',choices).state,'pending');
  assert.equal(evaluateStay('all-qatar',{...choices,rate:'paid',country:'domestic'}).state,'pending');
});
test('hotel comparison keeps currency-specific minimums, unknown Premier units and unavailable outlets',()=>{
  const rows=hotelTransferRows('all');
  assert.match(rows.find(row=>row.source==='滙豐旅人旅遊積分').minimum,/3,000/);
  assert.match(rows.find(row=>row.source==='滙豐卓越紅利積分').minimum,/待銀行/);
  assert.ok(hotelTransferRows('hilton').every(row=>!row.source.includes('小樹點')&&!row.source.includes('滙豐')));
  assert.match(hotelTransferRows('marriott').find(row=>row.source.includes('小樹點')).ratio,/340/);
});
test('hotel value uses quoted discounted total, rejects missing or fractional points and retains negative outcomes',()=>{
  const input={cash:20000,points:80000,cashPart:1000,fees:500,alternative:4000};
  assert.deepEqual(hotelValue(input),{saving:18500,valuePerMile:18500/80000,versusAlternative:14500});
  assert.equal(hotelValue({...input,alternative:''}).versusAlternative,null);
  assert.equal(hotelValue({...input,cash:''}),null);
  assert.equal(hotelValue({...input,points:10.5}),null);
  assert.equal(hotelValue({...input,cash:100,cashPart:200}).saving,-600);
});
test('source references, use destinations and visible questions remain specific to their map',async()=>{
  const data=JSON.parse(await readFile(new URL('./data.json',import.meta.url),'utf8'));
  const ids=new Set([...data.sources,...TREE_SOURCES,...NETWORK_SOURCES].map(item=>item.id));
  for(const program of HOTEL_PROGRAMS)for(const id of program.sources)assert.ok(ids.has(id),id);
  for(const policy of STAY_POLICIES)for(const id of policy.sources)assert.ok(ids.has(id),id);
  for(const program of HOTEL_PROGRAMS)assert.ok(TREES.some(tree=>tree.id===program.tree&&tree.nodes.some(node=>node.id===program.node)));
  const fields=relevantNetworkFacts(TREES.find(tree=>tree.id==='all-flyingblue')).map(field=>field.id);
  assert.ok(fields.includes('allPartner')&&fields.includes('allLinkAge')&&fields.includes('fbFirstBonus'));
  assert.ok(!fields.includes('mbSpend150')&&!fields.includes('hyattEmployer'));
  assert.equal(relevantNetworkFacts(TREES.find(tree=>tree.id==='hotel-use')).length,0);
});
