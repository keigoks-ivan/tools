import {RESOURCES,FACTS,OPPORTUNITIES} from './network-data.mjs?v=20261025-12';
import {traceTree} from './tree-core.mjs?v=20261025-12';
const resourceMap=new Map(RESOURCES.map(item=>[item.id,item]));
export function cleanNetworkState(value={}){
  const resources=[...new Set((Array.isArray(value.resources)?value.resources:[]).filter(id=>resourceMap.has(id)))];
  const removed=[...new Set((Array.isArray(value.removed)?value.removed:[]).filter(id=>resourceMap.has(id)))];
  const facts={};for(const field of FACTS)if(value.facts?.[field.id]==='unknown'||field.options.some(([id])=>id===value.facts?.[field.id]))facts[field.id]=value.facts[field.id];
  return {resources,facts,removed};
}
export function profileResources(profile={}){
  const ids=[];
  const card={'amex-plat':'amex-platinum-charge','amex-eva-plat':'amex-eva-platinum-card','amex-mr':'amex-mr'}[profile.card];if(card)ids.push(card);
  if(profile.card==='ci'){
    const ci={priority:'ctbc-ci-priority',precious:'ctbc-ci-precious',signature:'ctbc-ci-signature'}[profile.ciTier];if(ci)ids.push(ci);
  }
  const mb={none:'mb-base',silver:'mb-silver',gold:'mb-gold',platinum:'mb-platinum'}[profile.marriott];if(mb)ids.push(mb);
  const hh={base:'hh-base',silver:'hh-silver',gold:'hh-gold',diamond:'hh-diamond'}[profile.hilton];if(hh)ids.push(hh);
  const sq={member:'sq-member',silver:'sq-silver',gold:'sq-gold'}[profile.krisflyer];if(sq)ids.push(sq);
  return ids;
}
export function selectedResources(saved,profile={}){
  const own=cleanNetworkState(saved).resources,overrides=new Set(own.map(id=>resourceMap.get(id)?.exclusive).filter(Boolean));
  return new Set([...profileResources(profile).filter(id=>!overrides.has(resourceMap.get(id)?.exclusive)),...own].filter(id=>!saved.removed?.includes(id)));
}
export function effectiveResources(saved,profile={}){
  const result=selectedResources(saved,profile);
  if(['ctbc-ci-priority','ctbc-ci-precious','ctbc-marriott-priority','ctbc-marriott-infinite','ctbc-marriott-priority-limited'].some(id=>result.has(id)))result.add('visa-infinite');
  if(['mb-platinum-exact','mb-titanium','mb-ambassador'].some(id=>result.has(id)))result.add('mb-platinum');
  if(['jal-base','jal-crystal','jal-sapphire','jal-premier','jal-diamond','jal-metal'].some(id=>result.has(id)))result.add('jal-account');
  if(['all-points','all-silver','all-gold','all-platinum','all-diamond'].some(id=>result.has(id)))result.add('all-account');
  if(['avios','qr-silver','qr-gold','qr-platinum'].some(id=>result.has(id)))result.add('qatar-account');
  if(result.has('fb-miles'))result.add('fb-account');
  return result;
}
export function effectiveFacts(saved,profile={}){
  const facts={marriottSource:profile.provenance,partnerUsed:profile.linked,otherSqChallenge:profile.otherChallenge,hiltonUsed:profile.hiltonMatched};
  return {...facts,...cleanNetworkState(saved).facts};
}
export function evaluateOpportunity(op,resources,facts={},today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
  const missing=[],blocked=[];const label=id=>resourceMap.get(id)?.label||id;
  for(const id of op.all||[])if(!resources.has(id))missing.push('需 '+label(id));
  if(op.any?.length&&!op.any.some(id=>resources.has(id)))missing.push('需其中一項：'+op.any.map(label).join('／'));
  for(const group of op.allGroups||[])if(!group.some(id=>resources.has(id)))missing.push('另需其中一項：'+group.map(label).join('／'));
  for(const id of op.forbidden||[])if(resources.has(id))blocked.push('已持有'+label(id)+'，不適用此分支');
  for(const item of op.conditions||[]){
    if(item.whenAny?.length&&!item.whenAny.some(id=>resources.has(id)))continue;
    if(item.unlessAny?.some(id=>resources.has(id)))continue;
    const value=facts[item.fact];if(!value||value==='unknown')missing.push('待確認：'+item.label);else if(!item.allowed.includes(value)){if(item.reviewValues?.includes(value))missing.push('仍待官方確認：'+item.label);else blocked.push('未符合：'+item.label);}
  }
  if(op.link){const check=evaluateAllLink(op.link,facts);missing.push(...check.missing);blocked.push(...check.blocked);}
  const state=op.research==='closed'||(op.valid_until&&today>op.valid_until)?'closed':op.valid_from&&today<op.valid_from?'scheduled':blocked.length?'blocked':missing.length?'missing':op.research==='lead'?'lead':op.research==='conflict'?'conflict':'connected';
  if(op.valid_from&&today<op.valid_from)missing.unshift('此版本尚未生效：'+op.valid_from);
  if(op.valid_until&&today>op.valid_until)blocked.unshift('此版本／登錄梯次已於'+op.valid_until+'截止');
  return {state,missing,blocked,label:{closed:'此版本／梯次已截止',scheduled:'已公告，尚未生效',blocked:'已填條件不適用',missing:'還缺起點／條件',lead:'關鍵條件待核',conflict:'官方範圍有差異',connected:'起點與已填條件相符'}[state]};
}
export function evaluateAllLink(link,facts={}){
  const missing=[],blocked=[],current=facts.allPartner,partner={qatar:'Qatar','flying-blue':'Flying Blue',other:'其他航空'};
  if(!current||current==='unknown')missing.push('待填ALL目前實際連結航空；不能假設同時連Qatar與Flying Blue');
  else if(current==='none'){if(link.required)missing.push('先完成ALL與'+partner[link.partner]+'同名帳戶連結');}
  else if(current!==link.partner){
    if(facts.allLinkAge==='recent')blocked.push('ALL目前連結'+partner[current]+'且未滿12個月，不能直接改連'+partner[link.partner]);
    else if(facts.allLinkAge==='old')missing.push('已滿12個月仍需先解除'+partner[current]+'，再連結'+partner[link.partner]+'；不會自動並存');
    else missing.push('ALL已連結'+partner[current]+'，需核對12個月限制及解除程序');
  }
  return {missing,blocked};
}
export function traceResources(tree,resources,target=null){
  const starts=tree.nodes.filter(node=>[...(node.resources||[]),...(node.start_resources||[])].some(id=>resources.has(id))).map(node=>node.id),nodes=new Set(),edges=new Set();
  for(const start of starts){const trace=traceTree(tree,start,target);for(const id of trace.nodes)nodes.add(id);for(const id of trace.edges)edges.add(id);}
  return {nodes,edges,starts,connected:!target||nodes.has(target)};
}
export function relatedViews(trees,current,node){
  const resources=[...(node.resources||[]),...(node.bridge_resources||[])];if(!resources.length)return [];
  return trees.filter(tree=>tree.id!==current).flatMap(tree=>{
    const match=tree.nodes.find(item=>item.resources?.some(id=>resources.includes(id)));
    return match?[{tree:tree.id,node:match.id,label:tree.name}]:[];
  });
}
export function coverageSummary(data,opportunities,trees){
  const mapped=opportunities.filter(op=>trees.some(tree=>tree.id===op.tree&&tree.nodes.some(node=>node.id===op.node))).length;
  return {opportunities:opportunities.length,mapped,targets:data.coverage.length,queued:data.coverage.filter(item=>item.research_status==='queued').length};
}
export function relevantNetworkFacts(tree){
  const ids=new Set(tree.nodes.map(node=>node.opportunity_id).filter(Boolean)),fields=new Set();
  for(const op of OPPORTUNITIES.filter(item=>item.tree===tree.id||ids.has(item.id))){
    for(const condition of op.conditions||[])fields.add(condition.fact);
    if(op.link){fields.add('allPartner');fields.add('allLinkAge');}
  }
  return FACTS.filter(field=>fields.has(field.id));
}
