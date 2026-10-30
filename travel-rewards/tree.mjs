import {TREES,TREE_STATUS} from './tree-data.mjs?v=20261030-19';
import {traceTree,treePosition,validateTree} from './tree-core.mjs?v=20261030-19';

import {RESOURCES,FACTS,OPPORTUNITIES} from './network-data.mjs?v=20261030-19';
import {cleanNetworkState,selectedResources,effectiveResources,effectiveFacts,evaluateOpportunity,traceResources,relatedViews,coverageSummary,relevantNetworkFacts,toggleNetworkResource} from './network-core.mjs?v=20261030-19';
import {stayHub,stayNodeSummary,wireStayTools} from './stay.mjs?v=20261030-19';
import {cubePanel,wireCubeTools} from './cube.mjs?v=20261030-19';
import {hotelPanel,hotelNodeSummary,wireHotelTools} from './hotel-use.mjs?v=20261030-19';
import {setupMatches,SETUP_GOALS} from './setup-core.mjs?v=20261030-19';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const W=194,H=112;
const compact=value=>{let units=0,result='';for(const char of value){units+=/[ -~]/.test(char)?.55:1;if(units>12)return result+'…';result+=char;}return result;};
const icon={銀行點數:'點',酒店點數:'點',資格房晚:'晚',申請條件:'核',會員帳戶:'連',雙重累積:'雙',升等權益:'升',信用卡:'卡',酒店會籍:'住',酒店配對:'配',額外酒店會籍:'支',酒店挑戰:'住',航空配對:'飛',航空挑戰:'飛',付費航空配對:'飛',航空會籍:'飛',航空里程:'哩',航空資格點:'資',旅行目標:'票'};

export function mountTree(root,{data,inspect,onChange}){
  TREES.forEach(validateTree);
  wireStayTools(document,data.sources);wireCubeTools(document);
  wireHotelTools(document,data.sources);
  let inventory=cleanNetworkState();try{inventory=cleanNetworkState(JSON.parse(localStorage.getItem('imq-reward-network-v1')||'{}'));}catch{}
  const owned=()=>effectiveResources(inventory);
  const facts=()=>effectiveFacts(inventory);
  const state={goal:'all',suggestions:false,inventoryOpen:false,catalogOpen:false,treeId:TREES[0].id,start:'all',target:null,mode:matchMedia('(max-width:640px)').matches?'steps':'map',zoom:1,offset:{x:0,y:0}};
  const tree=()=>TREES.find(item=>item.id===state.treeId);
  let drag=null;
  const q=selector=>root.querySelector(selector);
  const notify=()=>onChange?.({treeId:state.treeId,start:state.start,target:state.target});
  const statusBadge=status=>'<span class="tree-status '+esc(status)+'">'+esc(TREE_STATUS[status].label)+'</span>';
  const sourceIds=node=>node.source_ids?.length?node.source_ids:[...new Set((node.rule_ids||[]).flatMap(id=>data.rules.find(rule=>rule.id===id)?.source_ids||[]))];
  function nodeDetail(node){
    const checkedOn=node.checked_on||[...(node.rule_ids||[]).map(id=>data.rules.find(rule=>rule.id===id)?.checked_on).filter(Boolean)].sort().at(-1)||data.as_of;
    const graph=tree(),parents=graph.edges.filter(edge=>edge.to===node.id),sources=sourceIds(node).map(id=>data.sources.find(source=>source.id===id)).filter(Boolean);
    const currentStart=graph.nodes.find(n=>n.id===state.start),connection=state.start==='owned'?traceResources(graph,owned(),node.id):traceTree(graph,state.start,node.id);
    const op=OPPORTUNITIES.find(item=>item.id===node.opportunity_id),assessment=op?evaluateOpportunity(op,owned(),facts()):null;
    const assessmentHtml=assessment?'<section class="tree-detail-section network-assessment"><h3>這一取得方式與你已填的條件</h3><b class="network-state '+assessment.state+'">'+esc(assessment.label)+'</b><ul>'+[...assessment.blocked,...assessment.missing].map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul>'+(op.warning?'<p>'+esc(op.warning)+'</p>':'')+'<p>未填條件保留待核；起點相符仍須官方核准及完成活動。</p></section>':'';
    const related=relatedViews(TREES,graph.id,node);
    const bridges=related.length?'<section class="tree-detail-section network-bridges"><h3>這份資源還能往哪裡看</h3><p>保留會籍取得來源；跨圖後仍須重新核對當段資格。</p>'+related.map(item=>'<button type="button" class="button secondary" data-open-tree="'+esc(item.tree)+'" data-open-node="'+esc(item.node)+'">'+esc(item.label)+' ↗</button>').join('')+'</section>':'';
    const disconnected=!connection.connected?'<div class="notice error">這張圖沒有從「'+esc(currentStart?.title||(state.start==='owned'?'我已填的資源':state.start))+'」接到「'+esc(node.title)+'」的路線。若另有適用起點，請先改選起點。</div>':'';
    const before=parents.length?'<section class="tree-detail-section"><h3>從哪裡接過來</h3>'+(parents.length>1?'<p>'+(node.join==='all'?'這一段需同時滿足列出的條件；單有其中一項不代表符合。':'以下是替代來源，各來源能否接受仍須核對。')+'</p>':'')+parents.map(edge=>{const parent=graph.nodes.find(n=>n.id===edge.from);return '<p><b>'+esc(parent.title)+'</b> → '+esc(edge.label)+'<span class="tree-detail-state '+edge.status+'">'+esc(TREE_STATUS[edge.status].label)+'</span></p>';}).join('')+'</section>':'';
    return '<div class="tree-detail"><p class="eyebrow">'+esc(node.kind)+' · 資料查核 '+esc(checkedOn)+'</p><h2 id="dialog-title">'+esc(node.title)+'</h2><p class="tree-detail-subtitle">'+esc(node.subtitle)+'</p>'+statusBadge(node.status)+disconnected+'<div class="tree-outcome"><small>這一段要取得什麼</small><p>'+esc(node.outcome)+'</p></div>'+assessmentHtml+'<div class="tree-detail-facts"><section><h3>費用</h3><p>'+esc(node.cost)+'</p></section><section><h3>時間與效期</h3><p>'+esc(node.timing)+'</p></section></div><details class="detail-disclosure"><summary>前置路線與延伸用途</summary>'+before+stayNodeSummary(node.stay_policy,data.sources)+hotelNodeSummary(node.hotel_program)+(node.cube_panel?'<section class="tree-detail-section"><h3>完整轉點表與餘額試算</h3><button type="button" class="button secondary" data-open-tree="cube-points" data-scroll-cube>前往18家兌換表 ↗</button></section>':'')+bridges+'</details><section class="tree-detail-section"><h3>先確認這些條件</h3><ul>'+node.requirements.map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul></section><details class="detail-disclosure"><summary>官方來源與查核紀錄 <span>'+sources.length+' 筆</span></summary>'+(node.claim?'<section class="tree-claim"><h3>文章說法與當期查核</h3><p><b>文章線索：</b>'+esc(node.claim)+'</p><p><b>目前查核：</b>'+esc(node.verdict)+'</p></section>':'')+'<section class="tree-detail-section"><h3>依據與查核範圍</h3>'+(sources.length?sources.map(source=>'<div class="tree-source"><a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer">'+esc(source.publisher)+' ↗</a><p>'+esc(source.note)+'</p></div>').join(''):'<p>尚無確認這一段完整條件的官方文件。</p>')+'</section></details><div class="route-actions">'+(node.route_id?'<button class="button secondary" data-route="'+esc(node.route_id)+'" type="button">看相關完整路線</button>':'')+'<button class="button secondary" type="button" data-open-calc>試算新增成本</button></div><p class="tree-detail-footnote">節點亮起只表示圖上的前後關係；不代表帳戶已通過資格審核或已取得會籍。</p></div>';
  }
  // 接到「條款還沒查實」節點的待核連線，跟節點同色
  function edgeStatus(edge){return edge.status==='pending'&&tree().nodes.find(n=>n.id===edge.to)?.status==='unverified'?'unverified':edge.status;}
  function edgePath(edge){
    const graph=tree(),from=graph.nodes.find(n=>n.id===edge.from),to=graph.nodes.find(n=>n.id===edge.to);
    if(Number.isFinite(edge.viaX))return 'M '+(from.x+W)+' '+(from.y+H/2)+' H '+edge.viaX+' V '+(to.y+H/2)+' H '+to.x;
    if(edge.side==='right'){
      const x=from.x+W,y=from.y+H/2,endY=to.y+H/2,bend=graph.width-26;
      return 'M '+x+' '+y+' C '+bend+' '+y+' '+bend+' '+endY+' '+(to.x+W)+' '+endY;
    }
    if(from.x===to.x){const x=from.x+W/2,y=from.y+H,end=to.y;return 'M '+x+' '+y+' C '+x+' '+((y+end)/2)+' '+x+' '+((y+end)/2)+' '+x+' '+end;}
    const x=from.x+W,y=from.y+H/2,endX=to.x,endY=to.y+H/2,mid=(x+endX)/2;
    return 'M '+x+' '+y+' C '+mid+' '+y+' '+mid+' '+endY+' '+endX+' '+endY;
  }
  function nodeMarkup(node){
    const status=TREE_STATUS[node.status],label=node.title+'，'+node.subtitle+'，'+status.label;
    return '<g class="tree-node '+status.tone+'" data-tree-node="'+node.id+'" transform="translate('+node.x+' '+node.y+')" role="button" tabindex="0" aria-label="'+esc(label)+'" aria-pressed="false"><title>'+esc(label)+'</title><rect class="tree-node-halo" x="-5" y="-5" width="'+(W+10)+'" height="'+(H+10)+'" rx="20"/><rect class="tree-node-body" width="'+W+'" height="'+H+'" rx="15"/><rect class="tree-node-icon" x="14" y="13" width="27" height="25" rx="7"/><text class="tree-node-symbol" x="27.5" y="31" text-anchor="middle">'+esc(icon[node.kind]||'會')+'</text><text class="tree-node-kind" x="49" y="31">'+esc(node.kind)+'</text><circle class="tree-node-dot" cx="175" cy="25" r="4"/><text class="tree-node-title" x="15" y="65">'+esc(node.title)+'</text><text class="tree-node-subtitle" x="15" y="92">'+esc(compact(node.subtitle))+'</text><g class="tree-owned-badge" aria-hidden="true"><circle cx="175" cy="94" r="9"/><text x="175" y="98" text-anchor="middle">✓</text></g></g>';
  }
  function graphMarkup(){
    const graph=tree();
    return '<svg id="rewards-tree-svg" class="tree-svg" preserveAspectRatio="xMidYMin meet" viewBox="0 0 '+graph.width+' '+graph.height+'" role="group" aria-label="'+esc(graph.name)+'互動樹狀圖" tabindex="0"><defs>'+Object.keys(TREE_STATUS).map(key=>'<marker id="tree-arrow-'+key+'" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="tree-marker '+key+'" d="M1 1 L7 4 L1 7 Z"/></marker>').join('')+'</defs><g class="tree-edges">'+graph.edges.map(edge=>{const status=edgeStatus(edge);return '<g class="tree-edge '+status+'" data-tree-edge="'+edge.id+'"><title>'+esc(edge.label+'：'+TREE_STATUS[status].label)+'</title><path d="'+edgePath(edge)+'" marker-end="url(#tree-arrow-'+status+')"/></g>';}).join('')+'</g><g>'+graph.nodes.map(nodeMarkup).join('')+'</g></svg>';
  }
  function stepsMarkup(){
    const graph=tree();
    return '<p class="tree-step-caption">各卡片列出承接來源；「或」是替代入口，「＋」須同時具備。請逐段核對條件。</p><ol class="tree-step-list">'+graph.nodes.map(node=>{const parents=graph.edges.filter(edge=>edge.to===node.id).map(edge=>graph.nodes.find(n=>n.id===edge.from).title);return '<li><button type="button" class="tree-step '+node.status+'" data-tree-node="'+node.id+'" aria-pressed="false"><span class="tree-step-icon">'+esc(icon[node.kind]||'會')+'</span><span class="tree-step-copy"><small>'+esc(node.kind)+(parents.length?' · 承接 '+esc(parents.join(node.join==='all'?' ＋ ':' 或 ')):' · 可選起點')+'</small><b>'+esc(node.title)+'</b><span>'+esc(node.subtitle)+'</span><em>'+esc(TREE_STATUS[node.status].label)+'</em></span><span aria-hidden="true">↗</span></button></li>';}).join('')+'</ol>';
  }
  function inventoryMarkup(){
    const selected=selectedResources(inventory),current=facts(),questions=relevantNetworkFacts(tree());
    return '<details class="network-inventory" '+(state.inventoryOpen?'open':'')+'><summary>我的資源 <b id="network-owned-count">'+selected.size+' 項</b><span>編輯起點</span></summary><div class="network-inventory-body"><p>預設不選任何資源。請自行勾選實際持有的卡片、已核准會籍及點數；卡片禮遇仍要另外申請。資料只存於此瀏覽器。下方只問目前子圖相關的條件，其他已填答案仍保留。</p><button type="button" class="text-button" data-start-setup>重新設定我的起點 ↗</button>'+[...new Set(RESOURCES.map(item=>item.group))].map(group=>'<fieldset><legend>'+esc(group)+'</legend><div class="network-resource-grid">'+RESOURCES.filter(item=>item.group===group).map(item=>'<label><input type="checkbox" data-network-resource="'+item.id+'" '+(selected.has(item.id)?'checked':'')+'>'+esc(item.label)+'</label>').join('')+'</div></fieldset>').join('')+(Object.keys(inventory.unlisted).length?'<fieldset><legend>其他起點 · 待核</legend>'+Object.entries(inventory.unlisted).map(([key,value])=>'<p class="setup-unlisted-note">'+({cards:'信用卡',status:'會籍',points:'點數'}[key])+'：'+esc(value)+'</p>').join('')+'<p>只作記錄，尚未用來判定路線。可從上方重新設定修改。</p></fieldset>':'')+'<fieldset '+(questions.length?'':'hidden')+'><legend>這張圖的來源與一次性條件</legend><div class="network-fact-grid">'+questions.map(item=>'<label>'+esc(item.label)+'<select data-network-fact="'+item.id+'"><option value="unknown">不確定／未填</option>'+item.options.map(([id,label])=>'<option value="'+id+'" '+(current[item.id]===id?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>').join('')+'</div></fieldset><button type="button" class="text-button" data-network-clear>清空我的資源與條件</button></div></details>';
  }
  function directoryMarkup(){
    const list=OPPORTUNITIES.filter(op=>state.goal==='all'||op.goal===state.goal),resources=owned(),current=facts(),summary=coverageSummary(data,OPPORTUNITIES,TREES);
    return '<details class="network-directory" '+(state.catalogOpen?'open':'')+'><summary>候選玩法總覽 <b>'+list.length+' 種</b><span>查看已有起點、缺少條件及截止方案</span></summary><p>目前'+summary.mapped+'種候選玩法已接到子圖，包含待核與截止方案。研究目標共'+summary.targets+'項，其中'+summary.queued+'項待研究；不代表完整市場或所有路線已驗證。</p><div class="network-op-grid">'+list.map(op=>{const check=evaluateOpportunity(op,resources,current),reason=check.blocked[0]||check.missing[0]||op.warning||'起點相符，仍須核對當期條款與官方核准。';return '<article><span class="network-state '+check.state+'">'+esc(check.label)+'</span><h3>'+esc(op.title)+'</h3><p>'+esc(reason)+'</p><button type="button" data-open-tree="'+op.tree+'" data-open-node="'+op.node+'">看這條路的條件 ↗</button></article>';}).join('')+'</div><button type="button" class="text-button" data-show-coverage>查看完整研究清單與缺口 ↗</button></details>';
  }
  function suggestionsMarkup(){
    if(!state.suggestions)return '';
    const matches=setupMatches(state.goal,inventory).slice(0,3);
    return '<section class="setup-matches"><div class="setup-match-heading"><div><p class="eyebrow">從你已填的起點出發</p><h2 tabindex="-1">'+(matches.length?'先從這些候選路線看起':'目前沒有找到可接的入口')+'</h2></div><button type="button" class="text-button" data-start-setup>調整起點 ↗</button></div>'+(matches.length?'<p>入口相關不代表已符合資格；會籍來源、登錄、成本與可得性仍須逐段確認。</p><div class="setup-match-grid">'+matches.map(({op,check})=>'<button type="button" data-open-tree="'+op.tree+'" data-open-node="'+op.node+'"><span class="network-state '+check.state+'">'+esc(check.state==='connected'?'起點相符，細則仍須核對':check.label)+'</span><b>'+esc(op.title)+'</b><small>'+esc(check.missing[0]||op.warning||'查看這一段的限制與官方來源。')+'</small><span class="setup-match-arrow" aria-hidden="true">↗</span></button>').join('')+'</div>':'<p>可以先探索下方路線圖，或補充實際持有的卡片、會籍與點數；系統不會替你新增資源。</p>')+'</section>';
  }
  function saveInventory(){try{localStorage.setItem('imq-reward-network-v1',JSON.stringify(inventory));}catch{}}
  function syncInventory(){
    const selected=selectedResources(inventory);
    root.querySelectorAll('[data-network-resource]').forEach(input=>input.checked=selected.has(input.dataset.networkResource));
    q('#network-owned-count').textContent=selected.size+' 項';
    q('#network-directory-wrap').innerHTML=directoryMarkup();q('#setup-match-results').innerHTML=suggestionsMarkup();const current=facts();root.querySelectorAll('[data-network-fact]').forEach(input=>input.value=current[input.dataset.networkFact]||'unknown');paintFocus();
  }
  function render(){
    const graph=tree();
    const available=TREES.filter(item=>state.goal==='all'||item.goals.includes(state.goal));
    const legend='<div class="tree-legend"><span class="owned">藍框：已填資源</span><span class="verified">實線：規則已查</span><span class="pending">黃虛線：規則已查，須申請或核准</span><span class="unverified">橘虛線：條款還沒查實，先別花錢</span><span class="blocked">粉紅：排除條件</span><span class="historical">灰色：歷史／未生效</span></div>';
    root.innerHTML='<div class="network-controls"><div class="network-goals" role="group" aria-label="選擇探索目標">'+[['all','全部'],['status','會籍'],['flight','機票'],['hotel','飯店']].map(([id,label])=>'<button type="button" data-network-goal="'+id+'" aria-pressed="'+(state.goal===id)+'">'+label+'</button>').join('')+'</div>'+inventoryMarkup()+'<details class="network-tools"><summary aria-label="更多工具"><span class="tools-label">更多工具</span><span aria-hidden="true">⋯</span></summary><div><button type="button" data-start-setup>重新設定我的起點 ↗</button><button type="button" data-open-tree="cube-points" data-scroll-cube>小樹點18個出口 ↗</button><button type="button" data-open-tree="hotel-use" data-hotel-focus-program="marriott">飯店點數怎麼用 ↗</button><button type="button" data-stay-hub>訂房前查認列 ↗</button></div></details></div><div id="setup-match-results">'+suggestionsMarkup()+'</div><section class="tree-workspace"><div class="tree-workspace-top"><label class="tree-route-picker"><span>切換路線 <small>'+available.length+' 張</small></span><select id="tree-family-select" aria-label="選擇路線">'+available.map(item=>'<option value="'+item.id+'" '+(item.id===graph.id?'selected':'')+'>'+esc(item.name)+'</option>').join('')+'</select></label><div class="tree-mode" role="group" aria-label="圖表顯示方式"><button type="button" data-tree-mode="map" aria-pressed="'+(state.mode==='map')+'">地圖</button><button type="button" data-tree-mode="steps" aria-pressed="'+(state.mode==='steps')+'">步驟</button></div></div><div class="tree-toolbar"><label>起點<select id="tree-start" aria-label="從哪裡開始看"><option value="all" '+(state.start==='all'?'selected':'')+'>全部起點</option><option value="owned" '+(state.start==='owned'?'selected':'')+'>我的資源</option>'+graph.nodes.map(node=>'<option value="'+node.id+'" '+(node.id===state.start?'selected':'')+'>'+esc(node.title)+'</option>').join('')+'</select></label><div class="tree-map-controls" '+(state.mode==='steps'?'hidden':'')+'><button type="button" data-tree-zoom="out" aria-label="縮小路線圖">−</button><output id="tree-zoom-value">100%</output><button type="button" data-tree-zoom="in" aria-label="放大路線圖">＋</button><button type="button" data-tree-fit>看全圖</button><button type="button" data-tree-expand aria-label="切換放大檢視">⛶</button></div></div><div class="tree-canvas" '+(state.mode==='steps'?'hidden':'')+'>'+graphMarkup()+'<div class="tree-canvas-hint">拖曳移動 · Ctrl／⌘＋滾輪縮放</div></div><div class="tree-step-view" '+(state.mode==='map'?'hidden':'')+'>'+stepsMarkup()+'</div><div class="tree-map-footer"><div id="tree-trace-summary" class="tree-trace-summary" role="status"></div><details class="tree-map-guide"><summary>圖例與說明</summary>'+legend+'<p>'+esc(graph.description)+'</p><p>'+esc(graph.note)+'</p></details><button type="button" class="text-button" data-tree-share aria-label="複製這張路線圖連結">分享 ↗</button></div></section>'+(graph.id==='cube-points'?cubePanel():'')+(['points-hotel','hotel-use'].includes(graph.id)?hotelPanel(data.sources):'')+stayHub(data.sources)+'<div id="network-directory-wrap">'+directoryMarkup()+'</div>';
    q('.network-inventory').addEventListener('toggle',event=>state.inventoryOpen=event.target.open);
    q('#network-directory-wrap').addEventListener('toggle',event=>{if(event.target.matches('.network-directory'))state.catalogOpen=event.target.open;},true);
    paintFocus();updatePosition();updateProfile();syncExpanded();
  }
  function paintFocus(){
    const graph=tree(),resources=owned(),trace=state.start==='owned'?traceResources(graph,resources,state.target):traceTree(graph,state.start,state.target),hasFilter=state.start!=='all'||state.target;
    root.querySelectorAll('[data-tree-node]').forEach(el=>{const id=el.dataset.treeNode;el.classList.toggle('is-dimmed',!!hasFilter&&!trace.nodes.has(id));el.classList.toggle('is-selected',id===state.target);el.classList.toggle('is-path',!!hasFilter&&trace.nodes.has(id));el.setAttribute('aria-pressed',String(id===state.target));const node=graph.nodes.find(item=>item.id===id);el.classList.toggle('is-owned',[...(node.resources||[]),...(node.start_resources||[])].some(resource=>resources.has(resource))); });
    root.querySelectorAll('[data-tree-edge]').forEach(el=>{el.classList.toggle('is-dimmed',!!hasFilter&&!trace.edges.has(el.dataset.treeEdge));el.classList.toggle('is-path',!!hasFilter&&trace.edges.has(el.dataset.treeEdge));});
    const start=graph.nodes.find(n=>n.id===state.start),target=graph.nodes.find(n=>n.id===state.target);
    q('#tree-trace-summary').textContent=!trace.connected?'已選起點在這張圖接不到「'+target?.title+'」。請選其他起點；不會自動補出你未持有的會籍。':state.start==='owned'&&!trace.starts.length?'這張子圖沒有你已填的起點；可補充資源或切換其他子圖。':target?'通往「'+target.title+'」的候選分支已亮起；待核與排除條件仍保留，並不代表已符合資格。':state.start==='owned'?'已亮起你所填資源的候選後續；待核、來源排除與截止仍保留。':start?'從「'+start.title+'」往後的候選分支已亮起；不代表你已取得後續會籍。':'點節點看資格。路線相連，仍須逐段核對條件。';
  }
  function updatePosition(){
    const position=treePosition(tree(),state.zoom,state.offset);state.zoom=position.zoom;
    q('#rewards-tree-svg')?.setAttribute('viewBox',[position.x,position.y,position.width,position.height].join(' '));
    q('#tree-zoom-value').textContent=Math.round(state.zoom*100)+'%';
  }
  function syncExpanded(){
    const button=q('[data-tree-expand]'),expanded=root.classList.contains('is-expanded');
    if(button){button.textContent=expanded?'×':'⛶';button.setAttribute('aria-label',expanded?'關閉放大檢視':'切換放大檢視');}
  }
  function updateProfile(){
    if(q('#network-owned-count'))syncInventory();

  }
  function selectNode(id,trigger){
    const node=tree().nodes.find(node=>node.id===id);if(!node)return;
    state.target=id;paintFocus();notify();
    inspect(nodeDetail(node),trigger);
  }
  function resetView(){state.zoom=1;state.offset={x:0,y:0};state.target=null;state.start='all';q('#tree-start').value='all';paintFocus();updatePosition();notify();}
  function open({treeId,start='all',target=null},showDetail=false){
    const graph=TREES.find(item=>item.id===treeId);if(!graph)return false;
    state.treeId=graph.id;state.start=['all','owned'].includes(start)||graph.nodes.some(n=>n.id===start)?start:'all';state.target=graph.nodes.some(n=>n.id===target)?target:null;state.zoom=1;state.offset={x:0,y:0};if(state.goal!=='all'&&!graph.goals.includes(state.goal))state.goal='all';render();
    if(showDetail&&state.target)selectNode(state.target,q((state.mode==='steps'?'.tree-step-view ':'#rewards-tree-svg ')+'[data-tree-node="'+state.target+'"]'));
    return true;
  }
  root.addEventListener('click',event=>{
    const node=event.target.closest('[data-tree-node]');if(node){selectNode(node.dataset.treeNode,node);return;}
    const button=event.target.closest('button');if(!button)return;
    button.closest('.network-tools')?.removeAttribute('open');
    if(button.hasAttribute('data-stay-hub')){q('#stay-rules').open=true;q('#stay-rules').scrollIntoView({block:'start'});return;}
    if(button.dataset.networkGoal){state.goal=button.dataset.networkGoal;const graph=TREES.find(item=>state.goal==='all'||item.goals.includes(state.goal));if(state.goal!=='all'&&!tree().goals.includes(state.goal))open({treeId:graph.id,start:state.start==='owned'?'owned':'all'});else render();notify();return;}
    if(button.hasAttribute('data-network-clear')){inventory=cleanNetworkState();saveInventory();render();return;}
    if(button.dataset.treeFamily){open({treeId:button.dataset.treeFamily,start:state.start==='owned'?'owned':'all'});notify();return;}
    if(button.dataset.treeMode){state.mode=button.dataset.treeMode;if(state.mode==='map'&&matchMedia('(max-width:640px)').matches){const focus=tree().nodes.find(n=>n.id===state.target||n.id===state.start)||tree().nodes[0];state.zoom=2.6;state.offset={x:focus.x+W/2-tree().width/2,y:focus.y+H/2-tree().height/2};}render();return;}
    if(button.dataset.treeZoom){state.zoom*=button.dataset.treeZoom==='in'?1.25:.8;updatePosition();return;}
    if(button.hasAttribute('data-tree-fit')){resetView();return;}
    if(button.hasAttribute('data-tree-expand')){root.classList.toggle('is-expanded');syncExpanded();return;}
    if(button.hasAttribute('data-tree-share')){
      const params=new URLSearchParams({tree:state.treeId});if(state.start!=='all')params.set('start',state.start);if(state.target)params.set('node',state.target);const url=new URL(location.href);url.hash=params.toString();
      if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url.href).then(()=>{q('#tree-trace-summary').textContent='已複製這張路線樹連結。';}).catch(()=>{history.replaceState(null,'',url);q('#tree-trace-summary').textContent='請從網址列複製路線樹連結。';});else {history.replaceState(null,'',url);q('#tree-trace-summary').textContent='網址列已更新，可直接分享。';}
    }
  });
  root.addEventListener('change',event=>{
    const input=event.target;if(input.id==='tree-family-select'){open({treeId:input.value,start:state.start==='owned'?'owned':'all'});notify();q('#tree-family-select').focus();return;}if(input.dataset.networkResource){inventory=toggleNetworkResource(inventory,input.dataset.networkResource,input.checked);state.start='owned';state.target=null;q('#tree-start').value='owned';saveInventory();syncInventory();notify();return;}
    if(input.dataset.networkFact){inventory.facts[input.dataset.networkFact]=input.value;saveInventory();syncInventory();return;}
    if(event.target.id==='tree-start'){state.start=event.target.value;state.target=null;paintFocus();notify();}});
  root.addEventListener('keydown',event=>{
    const node=event.target.closest('[data-tree-node]');if(node&&['Enter',' '].includes(event.key)){event.preventDefault();selectNode(node.dataset.treeNode,node);}
    if(event.key==='Escape'){const panel=q('.network-tools[open],.tree-map-guide[open]');if(panel){panel.open=false;panel.querySelector('summary').focus();return;}}
    if(event.key==='Escape'&&root.classList.contains('is-expanded')){root.classList.remove('is-expanded');syncExpanded();q('[data-tree-expand]')?.focus();}
  });
  root.addEventListener('pointerdown',event=>{
    const svg=event.target.closest('#rewards-tree-svg');if(!svg||event.target.closest('[data-tree-node]')||event.button!==0)return;
    drag={x:event.clientX,y:event.clientY,offset:{...state.offset},pointer:event.pointerId};svg.setPointerCapture(event.pointerId);svg.classList.add('is-dragging');
  });
  root.addEventListener('pointermove',event=>{if(!drag)return;const svg=q('#rewards-tree-svg'),box=svg.getBoundingClientRect(),position=treePosition(tree(),state.zoom);const ratio=Math.max(position.width/box.width,position.height/box.height);state.offset={x:drag.offset.x-(event.clientX-drag.x)*ratio,y:drag.offset.y-(event.clientY-drag.y)*ratio};updatePosition();});
  const finishDrag=()=>{drag=null;q('#rewards-tree-svg')?.classList.remove('is-dragging');};
  root.addEventListener('pointerup',finishDrag);root.addEventListener('pointercancel',finishDrag);
  root.addEventListener('wheel',event=>{if(!event.target.closest('#rewards-tree-svg')||!(event.ctrlKey||event.metaKey))return;event.preventDefault();state.zoom*=event.deltaY<0?1.1:1/1.1;updatePosition();},{passive:false});
  render();
  return {open,updateProfile,resetView,getInventory:()=>cleanNetworkState(inventory),setInventory:value=>{inventory=cleanNetworkState(value);saveInventory();render();},showSuggestions:(goal,preserveView=false)=>{
    state.goal=SETUP_GOALS.some(item=>item.id===goal)?goal:'all';state.suggestions=true;
    if(preserveView){render();return;}
    const matches=setupMatches(state.goal,inventory),fallback=TREES.find(item=>state.goal==='all'||item.goals.includes(state.goal));
    open({treeId:matches[0]?.op.tree||fallback.id,start:owned().size?'owned':'all'});notify();
  },getState:()=>({...state,offset:{...state.offset}})};
}
