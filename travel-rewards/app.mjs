import {DEFAULT_PROFILE,evaluateRoute,routeStartingPoint,partitionPlanRoutes,redemptionValue,challengeCost,cardFee,nonNegative} from './core.mjs?v=20261024-2';
import {ROUTES,CARD_EN,ASSETS,RULE_EN} from './content.mjs?v=20261024-2';
import {localizeRuleValues} from './fields.mjs?v=20261024-2';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const STORE='imq-reward-routes-v1';
const views=['plan','explore','cards','calculators','library'];
let data, ruleMap, sourceMap, cardMap, routeMap, toastTimer, lastDialogTrigger;
const state={view:'plan',goal:'flight',profile:{...DEFAULT_PROFILE},cabin:'economy',routeCompare:[],cardCompare:[]};
try{
  const saved=JSON.parse(localStorage.getItem(STORE)||'null');
  if(saved&&saved.version===1){
    if(['flight','status','hotel'].includes(saved.goal)) state.goal=saved.goal;
    if(['economy','business','premium','upgrade'].includes(saved.cabin)) state.cabin=saved.cabin;
    for(const key of Object.keys(DEFAULT_PROFILE)) if(typeof saved.profile?.[key]==='string') state.profile[key]=saved.profile[key];
  }
}catch{}
const t=zh=>zh;
const text=pair=>Array.isArray(pair)?pair[0]:pair;
const number=value=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0}).format(value);
const money=value=>'NT$'+number(value);
const save=()=>{try{localStorage.setItem(STORE,JSON.stringify({version:1,goal:state.goal,cabin:state.cabin,profile:state.profile}));}catch{}};
const sourceUrl=url=>{try{return new URL(url).protocol==='https:'?url:'#';}catch{return '#';}};

function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},3200);}
function applyLanguage(){
  document.documentElement.lang='zh-Hant';
  document.title=t('里程路線｜InvestMQuest','Reward Routes | InvestMQuest');
  $$('[data-zh]').forEach(el=>{el.textContent=el.dataset.zh.replaceAll('\\n','\n');});
  $$('.yes-no').forEach(select=>{const value=state.profile[select.name]||'unknown';select.innerHTML='<option value="unknown">'+t('尚未確認','Unknown')+'</option><option value="no">'+t('沒有','No')+'</option><option value="yes">'+t('有','Yes')+'</option>';select.value=value;});
  $$('.date-label').forEach(el=>el.textContent=t('資料查核 ','Research checked ')+data.as_of);
  $('[aria-label="旅行目標"]').setAttribute('aria-label',t('旅行目標','Travel goal'));
  $('.main-nav').setAttribute('aria-label',t('工具頁面','Tool navigation'));
}
function currentAsOf(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));return parts.year+'-'+parts.month+'-'+parts.day;}
const evaluate=route=>evaluateRoute(route,state.profile,currentAsOf());
const states={candidate:['可進一步核對','Ready for further checks'],unknown:['資格待補','Eligibility incomplete'],blocked:['目前缺少條件','Missing prerequisites'],closed:['申請期已過','Application window closed'],conflict:['官方差異待釐清','Official wording differs'],lead:['關鍵規則待核','Key terms unverified']};
const stateClass=value=>['closed','blocked'].includes(value)?value:['unknown','conflict','lead'].includes(value)?'warn':'';
function routeRules(route){const ids=route.rule_ids||data.pathways.find(p=>p.id===route.id)?.rule_ids||[];return ids.map(id=>ruleMap.get(id)).filter(Boolean);}
function routeSources(route){return [...new Set(routeRules(route).flatMap(rule=>rule.source_ids))].map(id=>sourceMap.get(id)).filter(Boolean);}
function links(sources){return '<div class="source-links">'+sources.map(source=>'<a href="'+esc(sourceUrl(source.url))+'" target="_blank" rel="noopener noreferrer">'+esc(source.publisher)+' ↗</a>').join('')+'</div>';}
function originalNotes(items){return '<div class="original-note"><span>'+t('研究底稿原文（繁體中文）','Original research notes (Traditional Chinese)')+'</span><ul>'+items.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></div>';}
function ruleStatus(rule){
  if(rule.validity?.effective_from && rule.validity.effective_from>data.as_of) return [t('已公告・未生效','Announced · future terms'),'warn'];
  if(rule.validity?.effective_until && rule.validity.effective_until<data.as_of) return [t('歷史／過期活動','Historical / expired'),'closed'];
  if(/conflict|ambiguity|consistency/.test(rule.type)||/conflict/.test(rule.evidence_status)) return [t('差異或範圍待核','Conflict / scope pending'),'warn'];
  if(/lead|unconfirmed|unpublished|scope_expansion|research_scope/.test(rule.type+' '+rule.evidence_status)) return [t('線索／資格待核','Lead / eligibility pending'),'warn'];
  return [t('選定規則已查','Selected terms checked'),'neutral'];
}
function routeCard(route,context={}){
  const evaluation=evaluate(route), reason=context.reason||evaluation.blockers[0]||evaluation.pending[0];
  const selected=state.routeCompare.includes(route.id),start=routeStartingPoint(route,state.profile);
  const origin=start.connected?'<p class="route-origin">你已填的起點：'+esc(start.label)+'</p>':'';
  return '<article class="route-card '+evaluation.state+'"><div class="card-top"><span class="tag '+stateClass(evaluation.state)+'">'+esc(text(states[evaluation.state]))+'</span><span class="evidence-label">'+esc(text(route.evidence))+'</span></div>'+origin+'<h3>'+esc(text(route.name))+'</h3><p class="route-target">'+esc(text(route.target))+'</p><p class="route-summary">'+esc(text(route.summary))+'</p><dl class="route-stats"><div><dt>'+t('時間與節奏','Timing')+'</dt><dd>'+esc(text(route.time))+'</dd></div><div><dt>'+t('成本基礎','Cost basis')+'</dt><dd>'+esc(text(route.cost))+'</dd></div></dl>'+(reason?'<p class="route-reason '+(evaluation.blockers.length?'blocked':'')+'">'+esc(text(reason))+'</p>':'')+'<div class="route-actions"><button type="button" class="button" data-route="'+route.id+'">'+t('看步驟與限制','Steps & conditions')+' ↗</button><button type="button" class="button secondary '+(selected?'selected':'')+'" data-compare-route="'+route.id+'" aria-pressed="'+selected+'">'+(selected?t('✓ 已加入比較','✓ Comparing'):t('＋ 加入比較','＋ Compare'))+'</button></div></article>';
}
function renderPlan(){
  $$('[data-goal]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.goal===state.goal)));
  $$('.status-field').forEach(el=>el.hidden=state.goal!=='status');
  $$('.flight-field').forEach(el=>el.hidden=state.goal!=='flight');
  $('#ci-status-fields').hidden=state.goal!=='status'||state.profile.card!=='ci';
  $('#cabin').value=state.cabin;
  $('#results-title').textContent={flight:'從現有點數找兌票路線',status:'從現有卡片與會籍出發',hotel:'從現有點數找飯店轉點路線'}[state.goal];
  $('#plan-context').textContent=state.goal==='status'?t('會籍來源與已用過的挑戰，可能改變可走的分支。','Status provenance and past challenges can change the available branch.'):state.goal==='hotel'?t('同一份銀行點數只能分配一次；轉點比例不能直接當住宿價值。','Bank points can only be allocated once. A transfer ratio is not a hotel valuation.'):t('目前提供累積與兌換路徑比較；航線、日期、人數與實際空位仍需查詢。','This release compares earning and redemption paths; routes, dates, travelers and seats still need checking.');
  if(state.goal==='status'&&state.profile.card==='ci')$('#plan-context').textContent=state.profile.ciTier==='signature'?'華航商務御璽卡沒有這項贈金卡禮遇，可切換到「換機票與升等」看累哩兌票。若另持其他會籍，請填入後再判斷。':'你選的是華航聯名卡，先確認它本身的華夏金卡禮遇。華航金卡不能當作新航金卡；若另有新航或萬豪會籍，請填入後再判斷。';
  if(state.goal==='status'&&state.profile.card==='ci'&&(state.profile.krisflyer==='gold'||['gold','platinum'].includes(state.profile.marriott)))$('#plan-context').textContent='華航卡與你另外填寫的航空／飯店會籍分開判斷。每條路線會標出實際使用的起點；不會把華航金卡當作新航或萬豪會籍。';
  $('#cabin-note').textContent=state.cabin==='upgrade'?t('升等仍須確認適用現金票與空位。','An eligible paid fare and upgrade inventory are still required.'):t('艙等用於規劃目標，未連接即時獎勵機位。','Cabin records your goal; live award inventory is not connected.');
  let routes=ROUTES.filter(route=>route.goals.includes(state.goal));
  const rank={candidate:0,unknown:1,conflict:2,lead:3,blocked:4,closed:5};
  routes.sort((a,b)=>rank[evaluate(a).state]-rank[evaluate(b).state] || (state.cabin==='upgrade'&&state.goal==='flight'?(a.id==='P003'?-1:b.id==='P003'?1:0):0));
  const groups=partitionPlanRoutes(routes,state.profile,currentAsOf());
  $('#plan-count').textContent='起點已對上 '+number(groups.ready.length+groups.pending.length)+'條';
  $('#plan-ready-heading').hidden=!groups.ready.length;
  $('#plan-routes').innerHTML=groups.ready.map(route=>routeCard(route)).join('');
  $('#plan-pending').hidden=!groups.pending.length;
  $('#plan-pending-routes').innerHTML=groups.pending.map(route=>routeCard(route)).join('');
  $('#plan-empty').hidden=!!(groups.ready.length+groups.pending.length);
  $('#plan-other').hidden=!groups.other.length;
  $('#plan-other-summary').textContent='查看其他起點、目前不適用或待核的路線（'+groups.other.length+'）';
  $('#plan-other-routes').innerHTML=groups.other.map(route=>{const start=routeStartingPoint(route,state.profile);return routeCard(route,start.connected?{}:{reason:['目前接不上：'+start.reason,'']});}).join('');
}
function renderExplore(){
  const query=$('#route-search').value.trim().toLocaleLowerCase(),goal=$('#explore-goal').value;
  const routes=ROUTES.filter(route=>(goal==='all'||route.goals.includes(goal))&&JSON.stringify([route.name,route.target,route.tags,route.summary]).toLocaleLowerCase().includes(query));
  $('#explore-count').textContent=t(number(routes.length)+'條候選路線；資格沿用你的規劃條件。',number(routes.length)+' candidate routes; eligibility uses your planning conditions.');
  $('#explore-routes').innerHTML=routes.length?routes.map(route=>routeCard(route)).join(''):'<div class="empty">'+t('沒有符合的路線，試試其他品牌或關鍵字。','No routes found. Try another program or keyword.')+'</div>';
}
function cardName(card){return card.name;}
function feeText(card){
  const f=cardFee(card);
  if(f.amount===null)return t('續年費用待核','Renewal fee pending');
  if(f.period==='first')return money(f.amount)+' '+t('首年','first year')+(card.fees.subsequent_year_twd?' / '+money(card.fees.subsequent_year_twd)+' '+t('次年','renewal'):'');
  return money(f.amount)+' '+(f.period==='promotion'?t('上市優惠','launch offer'):t('／年','/ year'));
}
function baseText(card){
  const n=card.earning.base_twd_per_point??card.earning.base_twd_per_card_point??card.earning.base_twd_per_mile;
  return n?t('一般消費NT$'+n+'＝1'+(card.asset==='EVA_redeemable_miles'?'哩':'點'),'Base spend NT$'+n+' = 1 '+(card.asset==='EVA_redeemable_miles'?'mile':'point')):t('基本比例待核','Base rate pending');
}
function cardAlert(card){
  if(card.availability.startsWith('new_application'))return t('原梯次收件已截止','Original receipt window closed');
  if(card.asset==='EVA_redeemable_miles')return t('直接累積長榮哩，不是MR','Earns EVA miles directly, not MR');
  if(card.id==='amex-charge')return t('優遊常客計劃另收NT$1,800／年','Frequent-traveller program adds NT$1,800/year');
  if(card.asset==='Marriott_Bonvoy_points')return t('飯店類有季度上限，滿額後回饋待核','Hotel category has a quarterly cap; post-cap earning pending');
  if(card.asset==='CTBC_CI_card_points_to_Dynasty_miles')return t('生日與指定加碼有條件、月上限','Birthday and designated bonuses have conditions and monthly caps');
  return t('續卡、迎新與轉點費用分開核對','Check renewal, welcome and transfer fees separately');
}
function renderCards(){
  const query=$('#card-search').value.trim().toLocaleLowerCase(),issuer=$('#card-issuer').value,asset=$('#card-asset').value;
  const cards=data.cards.filter(card=>(issuer==='all'||(issuer==='amex'?card.issuer==='台灣美國運通':card.issuer==='中國信託'))&&(asset==='all'||asset===card.asset)&&(card.name+' '+CARD_EN[data.cards.indexOf(card)]+' '+text(ASSETS[card.asset])).toLocaleLowerCase().includes(query));
  $('#card-count').textContent=t(number(cards.length)+'張卡／版本；未宣稱涵蓋全市場。',number(cards.length)+' card editions; not a complete market survey.');
  $('#card-list').innerHTML=cards.length?cards.map(card=>{
    const closed=card.availability.startsWith('new_application'),selected=state.cardCompare.includes(card.id),art=card.asset==='Marriott_Bonvoy_points'?'marriott':card.issuer==='台灣美國運通'?'amex':'ci';
    return '<article class="credit-card"><div class="card-art '+art+'" aria-hidden="true"><span class="art-bank">'+(card.issuer==='台灣美國運通'?'美國運通':'中國信託')+'</span><span class="art-chip"></span><span class="art-currency">'+esc(text(ASSETS[card.asset]))+'</span></div><div class="card-top"><span class="tag '+(closed?'closed':'neutral')+'">'+(closed?t('原梯次截止','Original offer closed'):t('選定欄位已查','Selected fields checked'))+'</span></div><h3>'+esc(cardName(card))+'</h3><p class="card-asset">'+esc(text(ASSETS[card.asset]))+'</p><p class="card-fee">'+esc(feeText(card))+'</p><p class="card-base">'+esc(baseText(card))+'</p><p class="card-note">'+esc(cardAlert(card))+'</p><div class="route-actions card-actions"><button type="button" class="button secondary" data-card="'+card.id+'">'+t('完整條件','Conditions')+'</button><button type="button" class="button secondary '+(selected?'selected':'')+'" data-compare-card="'+card.id+'" aria-pressed="'+selected+'">'+(selected?t('✓ 比較中','✓ Comparing'):t('＋ 比較','＋ Compare'))+'</button></div></article>';
  }).join(''):'<div class="empty">'+t('沒有符合的卡片。','No matching cards.')+'</div>';
}
function knownEvidence(rule){const status=ruleStatus(rule);return '<span class="tag '+status[1]+'">'+esc(status[0])+'</span>';}
function renderLibrary(){
  const query=$('#library-search').value.trim().toLocaleLowerCase(),kind=$('#library-kind').value;
  $('#research-stats').innerHTML=[[data.rules.length,t('規則／待核線索','rules / research leads')],[data.sources.length,t('來源紀錄','source records')],[data.cards.length,t('卡片／版本','card editions')],[data.coverage.length,t('研究目標・含待查','research targets, including queued')]].map(([n,label])=>'<div><strong>'+number(n)+'</strong><span>'+label+'</span></div>').join('');
  let rows=[];
  if(kind==='rules')rows=data.rules.filter(rule=>(rule.id+' '+rule.summary+' '+RULE_EN[rule.id]+' '+JSON.stringify(rule.values)).toLocaleLowerCase().includes(query)).map(rule=>'<article class="research-item"><div class="card-top">'+knownEvidence(rule)+'<span class="evidence-label">'+esc(rule.id)+' · '+esc(rule.checked_on)+'</span></div><h3>'+esc(t(rule.summary,RULE_EN[rule.id]||rule.summary))+'</h3><div class="research-meta">'+(rule.validity?.effective_from?t('生效 ','Effective ')+esc(rule.validity.effective_from):'')+(rule.validity?.effective_until?' · '+t('此規則期限 ','Term end ')+esc(rule.validity.effective_until):'')+'</div>'+links(rule.source_ids.map(id=>sourceMap.get(id)).filter(Boolean))+'<details><summary>'+t('數值、限制與未確認項目','Values, limits and unresolved items')+'</summary><pre class="research-values">'+esc(JSON.stringify(localizeRuleValues(rule.values),null,2))+'</pre>'+originalNotes(rule.missing||[])+'</details></article>');
  else if(kind==='sources')rows=data.sources.filter(source=>JSON.stringify(source).toLocaleLowerCase().includes(query)).map(source=>'<article class="research-item"><div class="card-top"><span class="tag neutral">'+(source.kind==='official'?t('官方來源','Official source'):t('外部報導／線索','External report / lead'))+'</span><span class="evidence-label">'+esc(source.checked_on)+'</span></div><h3>'+esc(source.publisher)+'</h3><p>'+accessText(source.access)+'</p><div class="source-links"><a href="'+esc(sourceUrl(source.url))+'" target="_blank" rel="noopener noreferrer">'+esc(new URL(source.url).hostname)+' ↗</a></div><details><summary>'+t('查核註記原文','Original research note')+'</summary><p>'+esc(source.note)+'</p></details></article>');
  else rows=data.coverage.filter(item=>JSON.stringify(item).toLocaleLowerCase().includes(query)).map(item=>'<article class="research-item"><div class="card-top"><span class="tag '+(item.research_status==='queued'?'warn':'neutral')+'">'+(item.research_status==='queued'?t('待研究','Queued'):item.research_status?.startsWith('application_window_closed')?t('申請梯次已截止','Application window closed'):t('部分資料已查，仍有缺口','Partial research; gaps remain'))+'</span></div><h3>'+esc(item.name)+'</h3><p>'+esc(item.note||t('納入研究範圍，尚未宣稱完整。','In scope; not claimed complete.'))+'</p>'+links((item.source_ids||[]).map(id=>sourceMap.get(id)).filter(Boolean))+'</article>');
  $('#library-list').innerHTML='<p class="small muted">'+t(number(rows.length)+'筆結果；同機構多頁不算獨立機構互證。',number(rows.length)+' results. Multiple pages from one institution are not independent counterpart verification.')+'</p>'+(rows.length?rows.join(''):'<div class="empty">'+t('沒有符合的資料。','No results found.')+'</div>');
}
function accessText(access){return /live_browser/.test(access)?t('已讀即時頁面與可見條款','Live page and visible terms read'):/pdf_text/.test(access)?t('已擷取PDF文字','PDF text extracted'):/failed|stale|conflict/.test(access)?t('擷取或時效差異，詳見註記','Access/freshness issue; see note'):/body/.test(access)?t('已讀本文','Page body read'):t('索引／摘要線索','Indexed excerpt / lead');}
function showDialog(html,trigger){lastDialogTrigger=trigger||document.activeElement;$('#dialog-content').innerHTML=html;const dialog=$('#detail-dialog');if(!dialog.open)dialog.showModal();dialog.scrollTop=0;$('#close-dialog').focus();}
function ruleDetails(rules){return rules.map(rule=>'<div class="rule-inline"><div class="card-top">'+knownEvidence(rule)+'<span class="evidence-label">'+esc(rule.id)+' · '+esc(rule.checked_on)+'</span></div><p>'+esc(t(rule.summary,RULE_EN[rule.id]||rule.summary))+'</p>'+links(rule.source_ids.map(id=>sourceMap.get(id)).filter(Boolean))+'</div>').join('');}
function routeDialog(route,trigger){
  const evaluation=evaluate(route),raw=data.pathways.find(p=>p.id===route.id),selected=state.routeCompare.includes(route.id);
  const restrictions=raw?.constraints||routeRules(route).flatMap(rule=>rule.missing).slice(0,3);
  const missing=raw?.missing||routeRules(route).flatMap(rule=>rule.missing);
  const assessment=evaluation.blockers.length?evaluation.blockers:evaluation.pending;
  const start=routeStartingPoint(route,state.profile),origin='<p class="route-origin">'+esc(start.connected?'你已填的起點：'+start.label:'目前接不上：'+start.reason)+'</p>';
  showDialog('<h2 id="dialog-title">'+esc(text(route.name))+'</h2><p class="route-target">'+esc(text(route.target))+'</p>'+origin+'<div class="card-top"><span class="tag '+stateClass(evaluation.state)+'">'+esc(text(states[evaluation.state]))+'</span><span class="evidence-label">'+esc(text(route.evidence))+'</span></div><p class="dialog-lede">'+esc(text(route.summary))+'</p><ol class="route-steps">'+route.steps.map((step,i)=>'<li><b>步驟 '+(i+1)+'</b>'+esc(text(step))+'</li>').join('')+'</ol><div class="detail-grid"><section class="detail-section"><h3>'+t('你的條件判斷','Your condition check')+'</h3><ul>'+(assessment.length?assessment.map(reason=>'<li>'+esc(text(reason))+'</li>').join(''):'<li>'+t('已填條件未發現明確排除；仍須核對完整條款與個別帳戶。','No explicit exclusion found from entered conditions; full terms and account approval still need checking.')+'</li>')+'</ul></section><section class="detail-section tradeoffs"><h3>'+t('時間與新增成本','Timing and incremental cost')+'</h3><p>'+esc(text(route.time))+'</p><p>'+esc(text(route.cost))+'</p><p>'+t('任何獎勵機位、升等空位與飯店房型，都未在這裡確認可訂。','No award seat, upgrade inventory or hotel room is confirmed bookable here.')+'</p></section></div><section class="dialog-section"><h3>'+t('限制與未完成的查核','Limits and unresolved checks')+'</h3>'+originalNotes([...restrictions,...missing])+'</section><section class="dialog-section"><h3>'+t('逐條依據與官方來源','Rule-by-rule evidence and sources')+'</h3>'+ruleDetails(routeRules(route))+'</section><div class="route-actions"><button class="button secondary '+(selected?'selected':'')+'" type="button" data-compare-route="'+route.id+'" aria-pressed="'+selected+'">'+(selected?t('✓ 已加入比較','✓ Comparing'):t('＋ 加入比較','＋ Compare'))+'</button><button class="button secondary" type="button" data-route-link="'+route.id+'">'+t('複製這條路線連結','Copy route link')+'</button><button class="text-button" type="button" data-open-calc>'+t('計算這次的新增成本 →','Calculate incremental cost →')+'</button></div>',trigger);
}
function cardDialog(card,trigger){
  const rules=card.rule_ids.map(id=>ruleMap.get(id)).filter(Boolean),selected=state.cardCompare.includes(card.id);
  const earn=card.earning;
  const extras=[];
  if(earn.monthly_bonus_cap_primary)extras.push(t('主卡每月加碼上限：','Monthly primary bonus cap: ')+number(earn.monthly_bonus_cap_primary));
  if(earn.foreign_and_eva_ticket_bonus_percent)extras.push(t('海外／指定長榮消費額外加碼：','Extra bonus on foreign / designated EVA spend: ')+earn.foreign_and_eva_ticket_bonus_percent+'%');
  if(earn.monthly_first_miles_per_category)extras.push(t('各類每月首','First ')+number(earn.monthly_first_miles_per_category)+t('哩有階梯加碼；之後依基本比例。',' miles per monthly category have tiered bonuses; base rate thereafter.'));
  if(earn.foreign_physical_twd_per_point)extras.push(t('海外實體：NT$','Overseas physical spend: NT$')+earn.foreign_physical_twd_per_point+t('／點；網路消費不同。',' / point; online purchases differ.'));
  if(earn.qualifying_hotel_twd_per_point)extras.push(t('合格飯店：NT$','Qualifying hotels: NT$')+earn.qualifying_hotel_twd_per_point+t('／點，每季類別上限',' / point; quarterly category cap ')+number(earn.hotel_quarter_point_cap));
  if(card.fees.frequent_traveller_program_annual_twd)extras.push(t('優遊常客計劃另收：','Additional frequent-traveller program fee: ')+money(card.fees.frequent_traveller_program_annual_twd)+t('／年','/year'));
  if(card.fees.first_year_waived)extras.push(t('次年牌告年費','Listed renewal fee ')+money(card.fees.annual_twd)+t('；減免條件另核。','; waiver conditions need checking.'));
  showDialog('<h2 id="dialog-title">'+esc(cardName(card))+'</h2><p class="dialog-lede">'+esc(text(ASSETS[card.asset]))+' · '+esc(card.network)+' · '+t('台灣發卡','Taiwan issuance')+'</p><div class="detail-grid"><section class="detail-section"><h3>'+t('主卡年費與基本累積','Primary annual fee and base earning')+'</h3><p class="card-fee">'+esc(feeText(card))+'</p><p>'+esc(baseText(card))+'</p></section><section class="detail-section tradeoffs"><h3>'+t('額外條件','Additional conditions')+'</h3><ul><li>'+esc(cardAlert(card))+'</li>'+extras.map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul></section></div><section class="dialog-section"><h3>'+t('迎新、續卡、會籍與轉點','Welcome, renewal, status and transfers')+'</h3>'+ruleDetails(rules)+'</section><section class="dialog-section"><h3>'+t('尚待確認','Still to verify')+'</h3>'+originalNotes(card.gaps)+'</section><div class="route-actions"><button type="button" class="button secondary '+(selected?'selected':'')+'" data-compare-card="'+card.id+'" aria-pressed="'+selected+'">'+(selected?t('✓ 比較中','✓ Comparing'):t('＋ 加入比較','＋ Compare'))+'</button></div>',trigger);
}
function renderComparison(){
  const cards=state.view==='cards',selected=cards?state.cardCompare:state.routeCompare;
  $('#comparison').hidden=!selected.length||!['plan','explore','cards'].includes(state.view);
  if(!selected.length)return;
  $('#comparison-title').textContent=t('比較已選的'+selected.length+(cards?'張卡':'條路線'),'Compare '+selected.length+(cards?' cards':' routes'));
  let headings=[],rows=[];
  if(cards){
    const entries=selected.map(id=>cardMap.get(id)).filter(Boolean);
    headings=entries.map(card=>cardName(card));
    rows=[[t('獎勵資產','Reward currency'),...entries.map(card=>esc(text(ASSETS[card.asset])))],[t('主卡費用','Primary fee'),...entries.map(card=>esc(feeText(card)))],[t('基本累積','Base earning'),...entries.map(card=>esc(baseText(card)))],[t('主要限制','Key limitation'),...entries.map(card=>esc(cardAlert(card)))],[t('查核日','Checked on'),...entries.map(card=>esc(card.checked_on))],[t('詳情','Details'),...entries.map(card=>'<button type="button" class="text-button" data-card="'+card.id+'">'+t('查看來源','View sources')+'</button>')]];
  }else{
    const entries=selected.map(id=>routeMap.get(id)).filter(Boolean);
    headings=entries.map(route=>text(route.name));
    rows=[[t('目標','Target'),...entries.map(route=>esc(text(route.target)))],[t('目前條件','Entered conditions'),...entries.map(route=>{const e=evaluate(route);return '<span class="tag '+stateClass(e.state)+'">'+esc(text(states[e.state]))+'</span>';})],[t('時間','Timing'),...entries.map(route=>esc(text(route.time)))],[t('成本基礎','Cost basis'),...entries.map(route=>esc(text(route.cost)))],[t('證據範圍','Evidence scope'),...entries.map(route=>esc(text(route.evidence)))],[t('尚待確認','Unresolved'),...entries.map(route=>{const e=evaluate(route);return esc(text(e.blockers[0]||e.pending[0]||[ '實際核准、報價與可得性。','Actual approval, quotes and availability.' ]));})],[t('步驟與來源','Steps and sources'),...entries.map(route=>'<button type="button" class="text-button" data-route="'+route.id+'">'+t('展開完整路線','Open full route')+'</button>')]];
  }
  $('#comparison-body').innerHTML='<table><thead><tr><th scope="col">'+t('比較項目','Criterion')+'</th>'+headings.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr><th scope="row">'+row[0]+'</th>'+row.slice(1).map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
function toggleCompare(kind,id){
  const key=kind==='card'?'cardCompare':'routeCompare';
  if(state[key].includes(id))state[key]=state[key].filter(value=>value!==id);
  else if(state[key].length>=3){toast(t('一次最多比較3個項目，請先移除一個。','Compare up to three items. Remove one first.'));return;}
  else state[key].push(id);
  renderPlan();renderExplore();renderCards();renderComparison();
  $$('[data-compare-'+kind+']').filter(button=>button.dataset[kind==='card'?'compareCard':'compareRoute']===id).forEach(button=>{const selected=state[key].includes(id);button.setAttribute('aria-pressed',String(selected));button.classList.toggle('selected',selected);button.textContent=selected?t('✓ 比較中','✓ Comparing'):t('＋ 加入比較','＋ Compare');});
  toast(t('已更新下方比較表（'+state[key].length+'/3）','Comparison table updated ('+state[key].length+'/3)'));
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
function setView(view,updateHash=true){
  if(!views.includes(view))view='plan';
  state.view=view;
  views.forEach(name=>{$('#view-'+name).hidden=name!==view;$('#tab-'+name).setAttribute('aria-selected',String(name===view));});
  if(updateHash)history.replaceState(null,'','#'+view);
  renderComparison();
}
function renderAll(){applyLanguage();renderPlan();renderExplore();renderCards();renderLibrary();renderCalculators();renderComparison();}
function bindEvents(){
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.view){setView(button.dataset.view);return;}
    if(button.dataset.goal){state.goal=button.dataset.goal;save();renderPlan();return;}
    if(button.dataset.route){routeDialog(routeMap.get(button.dataset.route),button);return;}
    if(button.dataset.card){cardDialog(cardMap.get(button.dataset.card),button);return;}
    if(button.dataset.compareRoute){toggleCompare('route',button.dataset.compareRoute);return;}
    if(button.dataset.compareCard){toggleCompare('card',button.dataset.compareCard);return;}
    if(button.hasAttribute('data-open-calc')){$('#detail-dialog').close();setView('calculators');$('#redemption-form input').focus();return;}
    if(button.dataset.routeLink){
      const url=new URL(location.href);url.hash='route='+button.dataset.routeLink;
      if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url.href).then(()=>toast(t('已複製路線連結。','Route link copied.'))).catch(()=>toast(t('瀏覽器未允許複製；可從網址列分享。','Clipboard access unavailable; share from the address bar.')));
      else {history.replaceState(null,'',url);toast(t('網址列已更新為此路線連結。','The address bar now contains the route link.'));}
    }
  });
  $('#profile-form').addEventListener('input',event=>{
    const el=event.target;if(!(el.name in DEFAULT_PROFILE))return;
    state.profile[el.name]=el.value;save();renderPlan();renderExplore();renderComparison();
  });
  $('#profile-form').addEventListener('submit',event=>event.preventDefault());
  $('#clear-profile').addEventListener('click',()=>{state.profile={...DEFAULT_PROFILE};for(const [key,value]of Object.entries(state.profile))$('#profile-form').elements.namedItem(key).value=value;save();renderAll();toast(t('已清除本工具的規劃條件。','Planning conditions cleared.'));});
  $('#cabin').addEventListener('change',event=>{state.cabin=event.target.value;save();renderPlan();});
  ['route-search','explore-goal'].forEach(id=>$('#'+id).addEventListener(id==='route-search'?'input':'change',renderExplore));
  ['card-search','card-issuer','card-asset'].forEach(id=>$('#'+id).addEventListener(id==='card-search'?'input':'change',renderCards));
  ['library-search','library-kind'].forEach(id=>$('#'+id).addEventListener(id==='library-search'?'input':'change',renderLibrary));
  ['redemption-form','challenge-form'].forEach(id=>{$('#'+id).addEventListener('input',renderCalculators);$('#'+id).addEventListener('submit',event=>event.preventDefault());});
  $('#close-dialog').addEventListener('click',()=>$('#detail-dialog').close());
  $('#detail-dialog').addEventListener('close',()=>{if(lastDialogTrigger?.isConnected)lastDialogTrigger.focus();});
  $('#detail-dialog').addEventListener('click',event=>{if(event.target===$('#detail-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
  $('#clear-comparison').addEventListener('click',()=>{state[state.view==='cards'?'cardCompare':'routeCompare']=[];renderPlan();renderExplore();renderCards();renderComparison();});
  $('.nav-inner').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=$$('.nav-inner button');const index=tabs.indexOf(document.activeElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();setView(tabs[next].dataset.view);});
  window.addEventListener('hashchange',openHash);
}
function openHash(){
  const hash=location.hash.slice(1);
  if(hash.startsWith('route=')){const route=routeMap.get(hash.slice(6));setView('explore',false);if(route)routeDialog(route);return;}
  setView(hash||'plan',false);
}
async function init(){
  try{
    const response=await fetch('./data.json?v=20261024-2');if(!response.ok)throw new Error('Research HTTP '+response.status);data=await response.json();
    ruleMap=new Map(data.rules.map(rule=>[rule.id,rule]));sourceMap=new Map(data.sources.map(source=>[source.id,source]));cardMap=new Map(data.cards.map(card=>[card.id,card]));routeMap=new Map(ROUTES.map(route=>[route.id,route]));
    for(const [key,value]of Object.entries(state.profile)){const el=$('#profile-form').elements.namedItem(key);if(el.tagName==='SELECT'&&!el.classList.contains('yes-no')){if([...el.options].some(option=>option.value===value))el.value=value;else state.profile[key]='unknown';}else if(el.type==='number'){el.value=nonNegative(value)===null?'':value;state.profile[key]=el.value;}}
    bindEvents();renderAll();openHash();$('#app').hidden=false;$('#loading').hidden=true;
  }catch(error){console.error('Reward Routes failed to initialize',error);$('#loading').hidden=true;$('#load-error').hidden=false;}
}
$('#reload').addEventListener('click',()=>location.reload());
init();
