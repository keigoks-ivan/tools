import {redemptionValue,challengeCost,cardFee} from './core.mjs?v=20261031-1';
import {ROUTES,CARD_EN,ASSETS,RULE_EN} from './content.mjs?v=20261031-1';
import {localizeRuleValues} from './fields.mjs?v=20261031-1';
import {mountTree} from './tree.mjs?v=20261031-1';
import {TREES,TREE_STATUS,TREE_SOURCES} from './tree-data.mjs?v=20261031-1';
import {traceTree} from './tree-core.mjs?v=20261031-1';
import {RESOURCES,OPPORTUNITIES,NETWORK_SOURCES,NETWORK_RULES,NETWORK_COVERAGE,NETWORK_COVERAGE_UPDATES} from './network-data.mjs?v=20261031-1';
import {cleanNetworkState,selectedResources,effectiveResources,traceResources} from './network-core.mjs?v=20261031-1';
import {planGroups,cardIssuer} from './setup-core.mjs?v=20261031-1';
import {mountSetup} from './setup.mjs?v=20261031-1';
import {selectHotelProgram,HOTEL_PROGRAMS} from './hotel-use.mjs?v=20261031-1';
import {mountTrip} from './trip.mjs?v=20261031-1';
import {TRIP_DATA} from './trip-data.mjs?v=20261031-1';

import {BANK_CARDS,normalizeRewardSearch} from './bank-entries-data.mjs?v=20261031-1';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const views=['plan','trip','explore','cards','more','calculators','library'];
const TAB_FOR={calculators:'more',library:'more'};
let data, ruleMap, sourceMap, cardMap, routeMap, toastTimer, lastDialogTrigger, treeUI, setupUI, tripUI;
const state={view:'plan',goal:'all',cardCompare:[]};
const t=zh=>zh;
const text=pair=>Array.isArray(pair)?pair[0]:pair;
const number=value=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0}).format(value);
const money=value=>'NT$'+number(value);
const opMap=new Map(OPPORTUNITIES.map(op=>[op.id,op]));
const resourceMap=new Map(RESOURCES.map(item=>[item.id,item]));
const inventory=()=>treeUI?treeUI.getInventory():cleanNetworkState();
const sourceUrl=url=>{try{return new URL(url).protocol==='https:'?url:'#';}catch{return '#';}};

function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},3200);}
function applyLanguage(){
  document.documentElement.lang='zh-Hant';
  document.title=t('里程路線｜InvestMQuest','Reward Routes | InvestMQuest');
  $$('[data-zh]').forEach(el=>{el.textContent=el.dataset.zh.replaceAll('\\n','\n');});
  $$('.date-label').forEach(el=>el.textContent=t('資料查核 ','Research checked ')+data.as_of);
}
function currentAsOf(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));return parts.year+'-'+parts.month+'-'+parts.day;}
function routeRules(route){const ids=route.rule_ids||data.pathways.find(p=>p.id===route.id)?.rule_ids||[];return ids.map(id=>ruleMap.get(id)).filter(Boolean);}
function routeSources(route){return [...new Set(routeRules(route).flatMap(rule=>rule.source_ids))].map(id=>sourceMap.get(id)).filter(Boolean);}
function links(sources){return '<div class="source-links">'+sources.map(source=>'<a href="'+esc(sourceUrl(source.url))+'" target="_blank" rel="noopener noreferrer">'+esc(source.publisher)+' ↗</a>').join('')+'</div>';}
function originalNotes(items){return '<div class="original-note"><span>'+t('研究底稿原文（繁體中文）','Original research notes (Traditional Chinese)')+'</span><ul>'+items.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></div>';}
function ruleStatus(rule){
  const today=currentAsOf();
  if(rule.validity?.effective_from && rule.validity.effective_from>today) return [t('已公告・未生效','Announced · future terms'),'warn'];
  if(rule.validity?.effective_until && rule.validity.effective_until<today) return [t('已過期','Historical / expired'),'closed'];
  if(/conflict|ambiguity|consistency/.test(rule.type)||/conflict/.test(rule.evidence_status)) return [t('官方說法不一致','Conflict / scope pending'),'warn'];
  if(/lead|unconfirmed|unpublished|scope_expansion|research_scope/.test(rule.type+' '+rule.evidence_status)) return [t('還沒查實','Lead / eligibility pending'),'warn'];
  return [t('已查官方條款','Selected terms checked'),'neutral'];
}
const GOALS=[['all','全部'],['status','會籍'],['flight','機票'],['hotel','飯店']];
function opPill(item){
  const {check,anchors}=item;
  if(check.state==='connected')return ['起點相符・細則要核對','ok'];
  if(['lead','conflict'].includes(check.state))return [check.state==='conflict'?'官方說法不一致':'有一段條款還沒查實','unverified'];
  if(check.state==='blocked')return ['已填條件不適用','blocked'];
  if(check.state==='closed')return ['已截止','closed'];
  if(check.state==='scheduled')return ['已公告，尚未生效','neutral'];
  return [anchors?.length?'還缺 '+check.missing.length+' 個條件':'還缺起點','warn'];
}
function opNext(item){
  const {op,check}=item;
  if(check.blocked[0])return '不適用：'+check.blocked[0];
  if(check.missing[0])return '還缺：'+check.missing[0];
  return '先確認：'+(op.warning||'當期條款與官方核准。');
}
// 從起點到目標的節點，依前後順序排好；沒有起點時用這條路的第一個入口示範
function opPath(op,owned){
  const tree=TREES.find(item=>item.id===op.tree);if(!tree)return {tree:null,nodes:[],edges:[]};
  let trace=traceResources(tree,owned,op.node);
  if(!trace.starts.length||!trace.connected){
    const inputs=[...op.any,...op.all,...(op.allGroups||[]).flat()];
    const start=tree.nodes.find(node=>(node.resources||[]).some(id=>inputs.includes(id))&&traceTree(tree,node.id,op.node).connected);
    trace=start?traceTree(tree,start.id,op.node):traceTree(tree,'all',op.node);
  }
  const edges=tree.edges.filter(edge=>trace.edges.has(edge.id)),depth=new Map();
  const visit=(id,d)=>{if((depth.get(id)??-1)>=d)return;depth.set(id,d);edges.filter(edge=>edge.from===id).forEach(edge=>visit(edge.to,d+1));};
  tree.nodes.filter(node=>trace.nodes.has(node.id)&&!edges.some(edge=>edge.to===node.id)).forEach(node=>visit(node.id,0));
  const nodes=tree.nodes.filter(node=>trace.nodes.has(node.id)).sort((a,b)=>(depth.get(a.id)??0)-(depth.get(b.id)??0));
  return {tree,nodes,edges};
}
function opCard(item){
  const [label,tone]=opPill(item),path=opPath(item.op,effectiveResources(inventory()));
  const unverified=path.nodes.filter(node=>node.status==='unverified').map(node=>node.title);
  return '<button type="button" class="op-card '+tone+'" data-open-op="'+item.op.id+'"><span class="op-pill '+tone+'">'+esc(label)+'</span><b>'+esc(item.op.title)+'</b><span class="op-next">'+esc(opNext(item))+'</span><span class="op-meta"><span>'+(path.nodes.length?path.nodes.length+' 段':'')+'</span>'+(unverified.length?'<span class="op-meta-warn">待核：'+esc(unverified.join('、'))+'</span>':'')+'<span>'+esc(path.tree?.name||'')+'</span></span></button>';
}
function startSummary(owned){
  const names=[...owned].map(id=>resourceMap.get(id)?.label||id),cards=[...owned].filter(id=>resourceMap.get(id)?.group==='信用卡').length;
  return {label:'你的起點・'+(cards?cards+' 張卡、':'')+owned.size+' 項',names:names.length>4?names.slice(0,4).join('、')+' 等 '+names.length+' 項':names.join('、')};
}
function renderPlan(){
  const inv=inventory(),owned=selectedResources(inv),empty=!owned.size;
  $('#plan-welcome').hidden=!empty;$('#plan-main').hidden=empty;
  if(empty)return;
  const summary=startSummary(owned);$('#plan-start-label').textContent=summary.label;$('#plan-start-names').textContent=summary.names;
  const today=currentAsOf(),count=goal=>{const g=planGroups(goal,inv,today);return g.ready.length+g.missing.length+g.unverified.length;};
  $('#plan-goals').innerHTML=GOALS.map(([id,name])=>'<button type="button" data-plan-goal="'+id+'" aria-pressed="'+(state.goal===id)+'">'+name+' '+count(id)+'</button>').join('');
  const groups=planGroups(state.goal,inv,today);
  const section=(list,title,tone,note='')=>list.length?'<section class="plan-section"><h2 class="plan-section-title '+tone+'">'+title+'・'+list.length+' 條</h2>'+(note?'<p class="small muted">'+note+'</p>':'')+'<div class="op-list">'+list.map(opCard).join('')+'</div></section>':'';
  const main=section(groups.ready,'接得上','ok')+section(groups.missing,'起點對上，還缺條件','warn','補上條件再決定要不要登錄；條件可以在路線圖的「我的資源」補填。')+section(groups.unverified,'有一段條款還沒查實','unverified','先寫信確認，拿到書面核准前不要訂房或付費。');
  $('#plan-groups').innerHTML=(main||'<div class="empty">你填的起點，在這個目標下還沒有接得上的路線。可以補填其他卡片或會籍，或看下方其他路線。</div>')+(groups.other.length?'<details class="plan-other"><summary><b>其他路線（'+groups.other.length+'）</b><small>需要另外的卡或會籍，或已截止、尚未生效</small></summary><div class="op-list">'+groups.other.map(opCard).join('')+'</div></details>':'');
}
function renderExplore(){
  const query=normalizeRewardSearch($('#route-search').value),goal=$('#explore-goal').value,groups=planGroups('all',inventory(),currentAsOf());
  const items=[...groups.ready,...groups.missing,...groups.unverified,...groups.other].filter(item=>(goal==='all'||item.op.goal===goal)&&normalizeRewardSearch(item.op.title+' '+(item.op.warning||'')+' '+JSON.stringify(routeMap.get(item.op.id)?.name||'')).includes(query));
  $('#explore-count').textContent='共 '+number(items.length)+' 種玩法；狀態依你在「我的路線」填的起點。';
  $('#explore-routes').innerHTML=items.length?items.map(opCard).join(''):'<div class="empty">沒有符合的路線，試試其他品牌或關鍵字。</div>';
}
function cardName(card){return card.name;}
function feeText(card){
  const f=cardFee(card);
  if(card.fees.waiver_note)return '新戶首年NT$0；續年NT$'+number(card.fees.annual_twd)+'（符合條件可免）';
  if(f.amount===null)return t('續年費用待核','Renewal fee pending');
  if(f.period==='first')return money(f.amount)+' '+t('首年','first year')+(card.fees.subsequent_year_twd?' / '+money(card.fees.subsequent_year_twd)+' '+t('次年','renewal'):'');
  return money(f.amount)+' '+(f.period==='promotion'?t('上市優惠','launch offer'):t('／年','/ year'));
}
function baseText(card){
  const n=card.earning.base_twd_per_point??card.earning.base_twd_per_card_point??card.earning.base_twd_per_mile;
  if(card.earning.overseas_twd_per_point)return '國內NT$'+n+'／點 · 海外NT$'+card.earning.overseas_twd_per_point+'／點';
  return n?t('一般消費NT$'+n+'＝1'+(card.asset==='EVA_redeemable_miles'?'哩':'點'),'Base spend NT$'+n+' = 1 '+(card.asset==='EVA_redeemable_miles'?'mile':'point')):t('基本比例待核','Base rate pending');
}
function cardAlert(card){
  if(card.availability.startsWith('new_application'))return t('原梯次收件已截止','Original receipt window closed');
  if(card.asset==='HSBC_TW_TRAVELLER')return '旅遊積分與卓越紅利分開；迎新、續卡及轉點另有條件';
  if(card.asset==='EVA_redeemable_miles')return t('直接累積長榮哩，不是MR','Earns EVA miles directly, not MR');
  if(card.id==='amex-charge')return t('優遊常客計劃另收NT$1,800／年','Frequent-traveller program adds NT$1,800/year');
  if(card.asset==='Marriott_Bonvoy_points')return t('飯店類有季度上限，滿額後回饋待核','Hotel category has a quarterly cap; post-cap earning pending');
  if(card.asset==='CTBC_CI_card_points_to_Dynasty_miles')return t('生日與指定加碼有條件、月上限','Birthday and designated bonuses have conditions and monthly caps');
  return t('續卡、迎新與轉點費用分開核對','Check renewal, welcome and transfer fees separately');
}
function cardOps(id){const own=effectiveResources({resources:[id]});return OPPORTUNITIES.filter(op=>[...op.any,...op.all,...(op.allGroups||[]).flat()].some(input=>own.has(input)));}
function renderCards(){
  const query=normalizeRewardSearch($('#card-search').value),issuer=$('#card-issuer').value,asset=$('#card-asset').value;
  const cards=data.cards.filter(card=>(issuer==='all'||card.issuer===({amex:'台灣美國運通',ctbc:'中國信託',hsbc:'滙豐台灣'}[issuer]))&&(asset==='all'||asset===card.asset)&&normalizeRewardSearch(card.name+' '+(card.issuer==='滙豐台灣'?'HSBC Traveller TravelOne':'')+' '+(CARD_EN[data.cards.indexOf(card)]||'')+' '+text(ASSETS[card.asset])).includes(query));
  const owned=selectedResources(inventory());cards.sort((a,b)=>Number(owned.has(b.id))-Number(owned.has(a.id)));
  const unchecked=RESOURCES.filter(item=>item.group==='信用卡'&&['ctbc','cube','dbs'].includes(cardIssuer(item.id))&&!cardMap.has(item.id)).length;
  $('#card-count').textContent=number(cards.length)+' 張卡已核年費與累積。另有 '+unchecked+' 張台灣卡（星展、中信 ANA、國泰世華）還沒逐項核完，不放在這裡比較；它們的轉點出口在路線圖看得到。';
  $('#card-list').innerHTML=cards.length?cards.map(card=>{
    const closed=card.availability.startsWith('new_application'),selected=state.cardCompare.includes(card.id),art=card.issuer==='滙豐台灣'?'hsbc':card.asset==='Marriott_Bonvoy_points'?'marriott':card.issuer==='台灣美國運通'?'amex':'ci';
    return '<article class="credit-card"><div class="card-art '+art+'" aria-hidden="true"><span class="art-bank">'+esc(card.issuer==='台灣美國運通'?'美國運通':card.issuer)+'</span><span class="art-chip"></span><span class="art-currency">'+esc(text(ASSETS[card.asset]))+'</span></div><div class="card-top"><span class="tag '+(closed?'closed':'neutral')+'">'+(closed?t('原梯次截止','Original offer closed'):t('年費與累積已查','Selected fields checked'))+'</span>'+(owned.has(card.id)?'<span class="tag owned">你有</span>':'')+'</div><h3>'+esc(cardName(card))+'</h3><p class="card-asset">'+esc(text(ASSETS[card.asset]))+'</p><p class="card-fee">'+esc(feeText(card))+'</p><p class="card-base">'+esc(baseText(card))+'</p><p class="card-note">'+esc(cardAlert(card))+'</p><div class="route-actions card-actions"><button type="button" class="button secondary" data-card="'+card.id+'">'+(cardOps(card.id).length?'能接 '+cardOps(card.id).length+' 條路線・條件':'完整條件')+'</button><button type="button" class="button secondary '+(selected?'selected':'')+'" data-compare-card="'+card.id+'" aria-pressed="'+selected+'">'+(selected?t('✓ 比較中','✓ Comparing'):t('＋ 比較','＋ Compare'))+'</button></div></article>';
  }).join(''):'<div class="empty">'+t('沒有符合的卡片。','No matching cards.')+'</div>';
}
function knownEvidence(rule){const status=ruleStatus(rule);return '<span class="tag '+status[1]+'">'+esc(status[0])+'</span>';}
function renderLibrary(){
  const query=normalizeRewardSearch($('#library-search').value),kind=$('#library-kind').value;
  $('#research-stats').innerHTML=[[data.rules.length,t('規則／待核線索','rules / research leads')],[data.sources.length,t('來源紀錄','source records')],[data.cards.length,t('卡片／版本','card editions')],[data.coverage.length,t('研究目標・含待查','research targets, including queued')]].map(([n,label])=>'<div><strong>'+number(n)+'</strong><span>'+label+'</span></div>').join('');
  let rows=[];
  if(kind==='rules')rows=data.rules.filter(rule=>normalizeRewardSearch(rule.id+' '+rule.summary+' '+RULE_EN[rule.id]+' '+JSON.stringify(rule.values)).includes(query)).map(rule=>'<article class="research-item"><div class="card-top">'+knownEvidence(rule)+'<span class="evidence-label" title="'+esc(rule.id)+'">查核 '+esc(rule.checked_on)+'</span></div><h3>'+esc(t(rule.summary,RULE_EN[rule.id]||rule.summary))+'</h3><div class="research-meta">'+(rule.validity?.effective_from?t('生效 ','Effective ')+esc(rule.validity.effective_from):'')+(rule.validity?.effective_until?' · '+t('此規則期限 ','Term end ')+esc(rule.validity.effective_until):'')+'</div>'+links(rule.source_ids.map(id=>sourceMap.get(id)).filter(Boolean))+'<details><summary>'+t('數值、限制與未確認項目','Values, limits and unresolved items')+'</summary><pre class="research-values">'+esc(JSON.stringify(localizeRuleValues(rule.values),null,2))+'</pre>'+originalNotes(rule.missing||[])+'</details></article>');
  else if(kind==='sources')rows=data.sources.filter(source=>normalizeRewardSearch(JSON.stringify(source)).includes(query)).map(source=>'<article class="research-item"><div class="card-top"><span class="tag neutral">'+(source.kind==='official'?t('官方來源','Official source'):t('外部報導／線索','External report / lead'))+'</span><span class="evidence-label">'+esc(source.checked_on)+'</span></div><h3>'+esc(source.publisher)+'</h3><p>'+accessText(source.access)+'</p><div class="source-links"><a href="'+esc(sourceUrl(source.url))+'" target="_blank" rel="noopener noreferrer">'+esc(new URL(source.url).hostname)+' ↗</a></div><details><summary>'+t('查核註記原文','Original research note')+'</summary><p>'+esc(source.note)+'</p></details></article>');
  else rows=data.coverage.filter(item=>normalizeRewardSearch(JSON.stringify(item)).includes(query)).map(item=>'<article class="research-item"><div class="card-top"><span class="tag '+(item.research_status==='queued'?'warn':'neutral')+'">'+(item.research_status==='queued'?t('待研究','Queued'):item.research_status?.startsWith('application_window_closed')?t('申請梯次已截止','Application window closed'):t('部分資料已查，仍有缺口','Partial research; gaps remain'))+'</span></div><h3>'+esc(item.name)+'</h3><p>'+esc(item.note||t('納入研究範圍，尚未宣稱完整。','In scope; not claimed complete.'))+'</p>'+links((item.source_ids||[]).map(id=>sourceMap.get(id)).filter(Boolean))+'</article>');
  $('#library-list').innerHTML='<p class="small muted">'+t(number(rows.length)+'筆結果；同機構多頁不算獨立機構互證。',number(rows.length)+' results. Multiple pages from one institution are not independent counterpart verification.')+'</p>'+(rows.length?rows.join(''):'<div class="empty">'+t('沒有符合的資料。','No results found.')+'</div>');
}
function accessText(access){return /live_browser/.test(access)?t('已讀即時頁面與可見條款','Live page and visible terms read'):/pdf_text/.test(access)?t('已擷取PDF文字','PDF text extracted'):/failed|stale|conflict/.test(access)?t('擷取或時效差異，詳見註記','Access/freshness issue; see note'):/body/.test(access)?t('已讀本文','Page body read'):t('索引／摘要線索','Indexed excerpt / lead');}
function showDialog(html,trigger,tree=false){lastDialogTrigger=trigger||document.activeElement;$('#dialog-content').innerHTML=html;const dialog=$('#detail-dialog');dialog.classList.toggle('tree-detail-dialog',tree);dialog.classList.remove('op-detail-dialog');if(!dialog.open)dialog.showModal();dialog.scrollTop=0;$('#close-dialog').focus();}
function ruleDetails(rules){return rules.map(rule=>'<div class="rule-inline"><div class="card-top">'+knownEvidence(rule)+'<span class="evidence-label" title="'+esc(rule.id)+'">查核 '+esc(rule.checked_on)+'</span></div><p>'+esc(t(rule.summary,RULE_EN[rule.id]||rule.summary))+'</p>'+links(rule.source_ids.map(id=>sourceMap.get(id)).filter(Boolean))+'</div>').join('');}
function nodeSources(node){const ids=node.source_ids?.length?node.source_ids:[...new Set((node.rule_ids||[]).flatMap(id=>ruleMap.get(id)?.source_ids||[]))];return ids.map(id=>sourceMap.get(id)).filter(Boolean);}
function opDetail(op,trigger){
  const inv=inventory(),owned=effectiveResources(inv),item=[...Object.values(planGroups('all',inv,currentAsOf()))].flat().find(entry=>entry.op.id===op.id)||{op,check:{state:'missing',missing:[],blocked:[]},anchors:[]};
  const [label,tone]=opPill(item),path=opPath(op,owned),route=routeMap.get(op.id);
  const unverified=path.nodes.filter(node=>node.status==='unverified');
  const lead=unverified.length?'這 '+path.nodes.length+' 段裡，'+unverified.map(node=>node.title).join('、')+' 的條款還沒查實。先寫信確認，拿到書面核准再花錢。':item.check.state==='connected'?'起點相符。每一段仍須核對當期條款，並等對方核准。':opNext(item);
  const steps=path.nodes.map((node,index)=>{
    const mine=(node.resources||[]).some(id=>owned.has(id)),incoming=path.edges.filter(edge=>edge.to===node.id),status=TREE_STATUS[node.status]||TREE_STATUS.pending;
    const parents=incoming.map(edge=>path.nodes.find(n=>n.id===edge.from)?.title).filter(Boolean),sources=nodeSources(node);
    return '<li class="op-step '+status.tone+'"><span class="op-step-num">'+(index+1)+'</span><div class="op-step-body"><span class="op-pill '+(mine?'owned':status.tone)+'">'+esc(mine?'你有':status.label)+'</span><h3>'+esc(node.title)+'</h3><p class="op-step-sub">'+esc(node.subtitle)+(parents.length>1?'（'+(node.join==='all'?'需同時具備：':'可由其中一個接過來：')+esc(parents.join('、'))+'）':'')+'</p>'+((node.requirements||[]).length?'<ul>'+node.requirements.slice(0,3).map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul>':'')+'<p class="op-step-meta">'+[node.cost,node.timing].filter(Boolean).map(esc).join('<br>')+'</p>'+(sources.length?'<details><summary>官方來源 '+sources.length+' 筆</summary>'+links(sources)+'</details>':'')+'</div></li>';
  }).join('');
  showDialog('<p class="eyebrow">'+esc(path.tree?.name||'')+'</p><h2 id="dialog-title">'+esc(op.title)+'</h2><span class="op-pill '+tone+'">'+esc(label)+'</span><div class="op-lead '+tone+'">'+esc(lead)+'</div>'+(item.check.missing.length||item.check.blocked.length?'<ul class="op-checks">'+[...item.check.blocked,...item.check.missing].map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul>':'')+(steps?'<ol class="op-steps">'+steps+'</ol>':'')+(route?'<details class="op-more"><summary>完整說明與逐條依據</summary><p>'+esc(text(route.summary))+'</p><p>'+esc(text(route.time))+'</p><p>'+esc(text(route.cost))+'</p>'+ruleDetails(routeRules(route))+'</details>':'')+'<div class="op-actions"><button type="button" class="button secondary" data-open-tree="'+op.tree+'" data-open-node="'+op.node+'">在路線圖看</button><button type="button" class="button" data-open-calc>試算新增成本</button><button type="button" class="text-button" data-route-link="'+op.id+'">複製這條路線的連結</button></div>',trigger);
  $('#detail-dialog').classList.add('op-detail-dialog');
}
function cardRoutes(card){const list=cardOps(card.id);return list.length?'<section class="dialog-section"><h3>這張卡能接的路線（'+list.length+'）</h3><div class="op-list">'+list.map(op=>'<button type="button" class="op-link" data-open-op="'+op.id+'">'+esc(op.title)+' ›</button>').join('')+'</div></section>':'';}
function cardDialog(card,trigger){
  const rules=card.rule_ids.map(id=>ruleMap.get(id)).filter(Boolean),selected=state.cardCompare.includes(card.id);
  const earn=card.earning;
  const extras=[];
  if(earn.monthly_bonus_cap_primary)extras.push(t('主卡每月加碼上限：','Monthly primary bonus cap: ')+number(earn.monthly_bonus_cap_primary));
  if(earn.foreign_and_eva_ticket_bonus_percent)extras.push(t('海外／指定長榮消費額外加碼：','Extra bonus on foreign / designated EVA spend: ')+earn.foreign_and_eva_ticket_bonus_percent+'%');
  if(earn.monthly_first_miles_per_category)extras.push(t('各類每月首','First ')+number(earn.monthly_first_miles_per_category)+t('哩有階梯加碼；之後依基本比例。',' miles per monthly category have tiered bonuses; base rate thereafter.'));
  if(earn.overseas_twd_per_point)extras.push('海外一般消費NT$'+earn.overseas_twd_per_point+'／點；須符合台灣以外交易且列收國外交易手續費。');
  if(earn.foreign_physical_twd_per_point)extras.push(t('海外實體：NT$','Overseas physical spend: NT$')+earn.foreign_physical_twd_per_point+t('／點；網路消費不同。',' / point; online purchases differ.'));
  if(earn.qualifying_hotel_twd_per_point)extras.push(t('合格飯店：NT$','Qualifying hotels: NT$')+earn.qualifying_hotel_twd_per_point+t('／點，每季類別上限',' / point; quarterly category cap ')+number(earn.hotel_quarter_point_cap));
  if(card.fees.frequent_traveller_program_annual_twd)extras.push(t('優遊常客計劃另收：','Additional frequent-traveller program fee: ')+money(card.fees.frequent_traveller_program_annual_twd)+t('／年','/year'));
  if(card.fees.waiver_note)extras.push(card.fees.waiver_note);
  else if(card.fees.first_year_waived)extras.push(t('次年牌告年費','Listed renewal fee ')+money(card.fees.annual_twd)+t('；減免條件另核。','; waiver conditions need checking.'));
  showDialog('<h2 id="dialog-title">'+esc(cardName(card))+'</h2><p class="dialog-lede">'+esc(text(ASSETS[card.asset]))+' · '+esc(card.network)+' · '+t('台灣發卡','Taiwan issuance')+'</p><div class="detail-grid"><section class="detail-section"><h3>'+t('主卡年費與基本累積','Primary annual fee and base earning')+'</h3><p class="card-fee">'+esc(feeText(card))+'</p><p>'+esc(baseText(card))+'</p></section><section class="detail-section tradeoffs"><h3>'+t('額外條件','Additional conditions')+'</h3><ul><li>'+esc(cardAlert(card))+'</li>'+extras.map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul></section></div><section class="dialog-section"><h3>'+t('迎新、續卡、會籍與轉點','Welcome, renewal, status and transfers')+'</h3>'+ruleDetails(rules)+'</section><section class="dialog-section"><h3>'+t('尚待確認','Still to verify')+'</h3>'+originalNotes(card.gaps)+'</section>'+cardRoutes(card)+'<div class="route-actions"><button type="button" class="button secondary '+(selected?'selected':'')+'" data-compare-card="'+card.id+'" aria-pressed="'+selected+'">'+(selected?t('✓ 比較中','✓ Comparing'):t('＋ 加入比較','＋ Compare'))+'</button></div>',trigger);
}
function renderComparison(){
  const selected=state.cardCompare;
  $('#comparison').hidden=!selected.length||state.view!=='cards';
  if(!selected.length)return;
  $('#comparison-title').textContent='比較已選的'+selected.length+'張卡';
  const entries=selected.map(id=>cardMap.get(id)).filter(Boolean);
  const headings=entries.map(card=>cardName(card));
  const rows=[['獎勵資產',...entries.map(card=>esc(text(ASSETS[card.asset])))],['主卡費用',...entries.map(card=>esc(feeText(card)))],['基本累積',...entries.map(card=>esc(baseText(card)))],['主要限制',...entries.map(card=>esc(cardAlert(card)))],['能接的路線',...entries.map(card=>number(cardOps(card.id).length)+' 條')],['查核日',...entries.map(card=>esc(card.checked_on))],['詳情',...entries.map(card=>'<button type="button" class="text-button" data-card="'+card.id+'">查看來源</button>')]];
  $('#comparison-body').innerHTML='<table><thead><tr><th scope="col">比較項目</th>'+headings.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr><th scope="row">'+row[0]+'</th>'+row.slice(1).map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
function toggleCompare(id){
  if(state.cardCompare.includes(id))state.cardCompare=state.cardCompare.filter(value=>value!==id);
  else if(state.cardCompare.length>=3){toast('一次最多比較3張卡，請先移除一張。');return;}
  else state.cardCompare.push(id);
  renderCards();renderComparison();
  toast('已更新下方比較表（'+state.cardCompare.length+'/3）');
}
function renderCalculators(){
  const values=form=>Object.fromEntries(new FormData(form));
  const redemption=redemptionValue(values($('#redemption-form'))),output=$('#redemption-output');
  output.classList.toggle('negative',redemption?.saving<0);
  output.innerHTML=redemption?'<div class="metric"><span>'+t('扣除額外支出後少付的現金','Cash saved after extra costs')+'</span><strong>'+money(redemption.saving)+'</strong></div><div class="metric"><span>'+t('每哩／點換到的價值','Value obtained per mile / point')+'</span><strong>'+redemption.valuePerMile.toFixed(3)+'<small>NT$</small></strong></div>':'<p>'+t('請輸入現金價與所需點數。金額不可為負、點數須大於0。','Enter the cash price and points required. Amounts must be nonnegative and points greater than zero.')+'</p>';
  const challenge=challengeCost(values($('#challenge-form'))),cost=$('#challenge-output');
  cost.classList.toggle('negative',challenge?.net<0);
  cost.innerHTML=challenge?'<div class="metric"><span>'+t('為這次挑戰新增支出','Incremental challenge cost')+'</span><strong>'+money(challenge.total)+'</strong></div><div class="metric"><span>'+t('你的禮遇估值－新增支出','Your benefit value minus extra cost')+'</span><strong>'+money(challenge.net)+'</strong></div>':'<p>'+t('請填完整非負數字；晚數須為整數。','Enter nonnegative values in all fields; nights must be a whole number.')+'</p>';
}
function setExploreMode(mode){
  const map=mode==='tree';$('#tree-explorer').hidden=!map;$('#explore-catalog').hidden=map;
  $$('[data-explore-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.exploreMode===mode)));
}
function openTree(id='sas-chain',target=null){
  if($('#detail-dialog').open)$('#detail-dialog').close();setView('explore',false);setExploreMode('tree');treeUI.open({treeId:id,target},!!target);const params=new URLSearchParams({tree:id});if(target)params.set('node',target);history.replaceState(null,'','#'+params.toString());
}
function setView(view,updateHash=true){
  if(!views.includes(view))view='plan';
  state.view=view;
  const tab=TAB_FOR[view]||view;
  views.forEach(name=>{$('#view-'+name).hidden=name!==view;});
  $$('.nav-inner [data-view]').forEach(button=>{const on=button.dataset.view===tab;button.setAttribute('aria-selected',String(on));if(on)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  if(view==='plan')renderPlan();
  if(view==='trip')tripUI?.render();
  if(view==='explore')renderExplore();
  if(view==='cards')renderCards();
  if(updateHash){history.replaceState(null,'','#'+view);window.scrollTo(0,0);}
  renderComparison();
}
function renderAll(){applyLanguage();renderPlan();renderExplore();renderCards();renderLibrary();renderCalculators();renderComparison();}
function bindEvents(){
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-start-setup')){if($('#detail-dialog').open)$('#detail-dialog').close();setupUI.open();return;}
    if(button.hasAttribute('data-show-coverage')){setView('library');$('#library-kind').value='coverage';renderLibrary();return;}
    if(button.dataset.openOp){const op=opMap.get(button.dataset.openOp);if(op)opDetail(op,button);return;}
    if(button.dataset.view){if($('#detail-dialog').open)$('#detail-dialog').close();setView(button.dataset.view);return;}
    if(button.dataset.exploreMode){setExploreMode(button.dataset.exploreMode);return;}
    if(button.dataset.openTree){openTree(button.dataset.openTree,button.dataset.openNode||null);if(button.hasAttribute('data-scroll-cube'))document.querySelector('[data-cube-panel]')?.scrollIntoView({block:'start'});if(button.dataset.hotelFocusProgram){selectHotelProgram(document,button.dataset.hotelFocusProgram,data.sources);document.querySelector('[data-hotel-panel]')?.scrollIntoView({block:'start'});}return;}
    if(button.dataset.planGoal){state.goal=button.dataset.planGoal;renderPlan();return;}
    if(button.dataset.card){cardDialog(cardMap.get(button.dataset.card),button);return;}
    if(button.dataset.compareCard){toggleCompare(button.dataset.compareCard);return;}
    if(button.hasAttribute('data-open-calc')){$('#detail-dialog').close();setView('calculators');$('#redemption-form input').focus();return;}
    if(button.dataset.routeLink){
      const url=new URL(location.href);url.hash='route='+button.dataset.routeLink;
      if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url.href).then(()=>toast('已複製路線連結。')).catch(()=>toast('瀏覽器未允許複製；可從網址列分享。'));
      else {history.replaceState(null,'',url);toast('網址列已更新為此路線連結。');}
    }
  });
  ['route-search','explore-goal'].forEach(id=>$('#'+id).addEventListener(id==='route-search'?'input':'change',renderExplore));
  ['card-search','card-issuer','card-asset'].forEach(id=>$('#'+id).addEventListener(id==='card-search'?'input':'change',renderCards));
  ['library-search','library-kind'].forEach(id=>$('#'+id).addEventListener(id==='library-search'?'input':'change',renderLibrary));
  ['redemption-form','challenge-form'].forEach(id=>{$('#'+id).addEventListener('input',renderCalculators);$('#'+id).addEventListener('submit',event=>event.preventDefault());});
  $('#close-dialog').addEventListener('click',()=>$('#detail-dialog').close());
  $('#detail-dialog').addEventListener('close',()=>{if(lastDialogTrigger?.isConnected)lastDialogTrigger.focus();});
  $('#detail-dialog').addEventListener('click',event=>{if(event.target===$('#detail-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
  $('#clear-comparison').addEventListener('click',()=>{state.cardCompare=[];renderCards();renderComparison();});
  $('.nav-inner').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=$$('.nav-inner button');const index=tabs.indexOf(document.activeElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();setView(tabs[next].dataset.view);});
  window.addEventListener('hashchange',openHash);
}
function openHash(){
  const hash=location.hash.slice(1);
  if(hash==='main')return;
  if(hash.startsWith('tree=')){const params=new URLSearchParams(hash);setView('explore',false);setExploreMode('tree');treeUI.open({treeId:params.get('tree'),start:params.get('start')||'all',target:params.get('node')},!!params.get('node'));return;}
  if(hash.startsWith('route=')){const op=opMap.get(hash.slice(6));setView('plan',false);if(op)opDetail(op);return;}
  setView(hash||'plan',false);
}
async function init(){
  try{
    const response=await fetch('./data.json?v=20261031-1');if(!response.ok)throw new Error('Research HTTP '+response.status);data=await response.json();data.cards.push(...BANK_CARDS);
    data.sources=[...new Map([...data.sources,...TREE_SOURCES,...NETWORK_SOURCES].map(source=>[source.id,source])).values()];
    data.rules=[...data.rules,...NETWORK_RULES];data.coverage=[...data.coverage,...NETWORK_COVERAGE].map(item=>{const update=NETWORK_COVERAGE_UPDATES[item.id];return update?{...item,...update,source_ids:[...new Set([...item.source_ids,...(update.source_ids||[])])],rule_ids:[...new Set([...item.rule_ids,...(update.rule_ids||[])])]}:item;});
    ruleMap=new Map(data.rules.map(rule=>[rule.id,rule]));sourceMap=new Map(data.sources.map(source=>[source.id,source]));cardMap=new Map(data.cards.map(card=>[card.id,card]));routeMap=new Map(ROUTES.map(route=>[route.id,route]));
    treeUI=mountTree($('#tree-explorer'),{data,inspect:(html,trigger)=>showDialog(html,trigger,true),onChange:({treeId,start,target})=>{const params=new URLSearchParams({tree:treeId});if(start!=='all')params.set('start',start);if(target)params.set('node',target);history.replaceState(null,'','#'+params.toString());}});
    setupUI=mountSetup($('#setup-dialog'),{getInventory:treeUI.getInventory,apply:({inventory:value})=>{
      treeUI.setInventory(value);state.goal='all';tripUI?.render();setView(state.view==='trip'?'trip':'plan');window.scrollTo(0,0);document.querySelector('#plan-main h1')?.focus();
    },onDismiss:()=>{if(!selectedResources(inventory()).size)setView('explore');}});
    tripUI=mountTrip($('#trip-root'),{getInventory:inventory,data:TRIP_DATA,hotelPrograms:HOTEL_PROGRAMS,resourceLabel:id=>resourceMap.get(id)?.label.replace(/\s*餘額$/,''),today:currentAsOf()});
    bindEvents();renderAll();$('#app').hidden=false;$('#loading').hidden=true;
    openHash();
  }catch(error){console.error('Reward Routes failed to initialize',error);$('#loading').hidden=true;$('#load-error').hidden=false;}
}
$('#reload').addEventListener('click',()=>location.reload());
init();
