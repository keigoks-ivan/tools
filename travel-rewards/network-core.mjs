import {RESOURCES,FACTS} from './network-data.mjs?v=20261024-10';
import {traceTree} from './tree-core.mjs?v=20261024-10';
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
  return result;
}
export function effectiveFacts(saved,profile={}){
  const facts={marriottSource:profile.provenance,partnerUsed:profile.linked,otherSqChallenge:profile.otherChallenge,hiltonUsed:profile.hiltonMatched};
  return {...facts,...cleanNetworkState(saved).facts};
}
export function evaluateOpportunity(op,resources,facts={}){
  const missing=[],blocked=[];const label=id=>resourceMap.get(id)?.label||id;
  for(const id of op.all||[])if(!resources.has(id))missing.push('需 '+label(id));
  if(op.any?.length&&!op.any.some(id=>resources.has(id)))missing.push('需其中一項：'+op.any.map(label).join('／'));
  for(const group of op.allGroups||[])if(!group.some(id=>resources.has(id)))missing.push('另需其中一項：'+group.map(label).join('／'));
  for(const id of op.forbidden||[])if(resources.has(id))blocked.push('已持有'+label(id)+'，不適用此分支');
  for(const item of op.conditions||[]){const value=facts[item.fact];if(!value||value==='unknown')missing.push('待確認：'+item.label);else if(!item.allowed.includes(value))blocked.push('未符合：'+item.label);}
  const state=op.research==='closed'?'closed':blocked.length?'blocked':missing.length?'missing':op.research==='lead'?'lead':op.research==='conflict'?'conflict':'connected';
  return {state,missing,blocked,label:{closed:'本梯次新件截止',blocked:'已填條件不適用',missing:'還缺起點／條件',lead:'關鍵條件待核',conflict:'官方範圍有差異',connected:'起點與已填條件相符'}[state]};
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
