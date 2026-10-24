import {TREES,TREE_STATUS} from './tree-data.mjs?v=20261024-4';
import {traceTree,treePosition,validateTree} from './tree-core.mjs?v=20261024-4';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const W=194,H=112;
const icon={信用卡:'卡',酒店會籍:'住',酒店配對:'配',額外酒店會籍:'支',酒店挑戰:'住',航空配對:'飛',航空挑戰:'飛',付費航空配對:'飛',航空會籍:'飛',航空里程:'哩',旅行目標:'票'};

export function mountTree(root,{data,inspect,onChange,getProfile}){
  TREES.forEach(validateTree);
  const state={treeId:TREES[0].id,start:'all',target:null,mode:matchMedia('(max-width:640px)').matches?'steps':'map',zoom:1,offset:{x:0,y:0}};
  const tree=()=>TREES.find(item=>item.id===state.treeId);
  let drag=null,lastTrigger=null;
  const q=selector=>root.querySelector(selector);
  const notify=()=>onChange?.({treeId:state.treeId,start:state.start,target:state.target});
  const statusBadge=status=>'<span class="tree-status '+esc(status)+'">'+esc(TREE_STATUS[status].label)+'</span>';
  const sourceIds=node=>node.source_ids?.length?node.source_ids:[...new Set((node.rule_ids||[]).flatMap(id=>data.rules.find(rule=>rule.id===id)?.source_ids||[]))];
  function nodeDetail(node){
    const graph=tree(),parents=graph.edges.filter(edge=>edge.to===node.id),sources=sourceIds(node).map(id=>data.sources.find(source=>source.id===id)).filter(Boolean);
    const currentStart=graph.nodes.find(n=>n.id===state.start),connection=traceTree(graph,state.start,node.id);
    const disconnected=!connection.connected?'<div class="notice error">這張圖沒有從「'+esc(currentStart?.title||state.start)+'」接到「'+esc(node.title)+'」的路線。若另有適用起點，請先改選起點。</div>':'';
    const before=parents.length?'<section class="tree-detail-section"><h3>從哪裡接過來</h3>'+(parents.length>1?'<p>以下是不同來源分支，並非全部都要完成；各來源能否接受仍須核對。</p>':'')+parents.map(edge=>{const parent=graph.nodes.find(n=>n.id===edge.from);return '<p><b>'+esc(parent.title)+'</b> → '+esc(edge.label)+'<span class="tree-detail-state '+edge.status+'">'+esc(TREE_STATUS[edge.status].label)+'</span></p>';}).join('')+'</section>':'';
    return '<div class="tree-detail"><p class="eyebrow">'+esc(node.kind)+' · 資料查核 2026-10-24</p><h2 id="dialog-title">'+esc(node.title)+'</h2><p class="tree-detail-subtitle">'+esc(node.subtitle)+'</p>'+statusBadge(node.status)+disconnected+'<div class="tree-outcome"><small>這一段要取得什麼</small><p>'+esc(node.outcome)+'</p></div>'+before+'<section class="tree-detail-section"><h3>先確認這些條件</h3><ul>'+node.requirements.map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul></section><div class="tree-detail-facts"><section><h3>費用</h3><p>'+esc(node.cost)+'</p></section><section><h3>時間與效期</h3><p>'+esc(node.timing)+'</p></section></div>'+(node.claim?'<section class="tree-claim"><h3>文章說法與當期查核</h3><p><b>文章線索：</b>'+esc(node.claim)+'</p><p><b>目前查核：</b>'+esc(node.verdict)+'</p></section>':'')+'<section class="tree-detail-section"><h3>依據與查核範圍</h3>'+(sources.length?sources.map(source=>'<div class="tree-source"><a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer">'+esc(source.publisher)+' ↗</a><p>'+esc(source.note)+'</p></div>').join(''):'<p>尚無確認這一段完整條件的官方文件。</p>')+'</section><div class="route-actions">'+(node.route_id?'<button class="button secondary" data-route="'+esc(node.route_id)+'" type="button">看相關完整路線</button>':'')+'<button class="button secondary" type="button" data-open-calc>試算新增成本</button></div><p class="tree-detail-footnote">節點亮起只表示圖上的前後關係；不代表帳戶已通過資格審核或已取得會籍。</p></div>';
  }
  function edgePath(edge){
    const graph=tree(),from=graph.nodes.find(n=>n.id===edge.from),to=graph.nodes.find(n=>n.id===edge.to);
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
    return '<g class="tree-node '+status.tone+'" data-tree-node="'+node.id+'" transform="translate('+node.x+' '+node.y+')" role="button" tabindex="0" aria-label="'+esc(label)+'" aria-pressed="false"><title>'+esc(label)+'</title><rect class="tree-node-halo" x="-5" y="-5" width="'+(W+10)+'" height="'+(H+10)+'" rx="20"/><rect class="tree-node-body" width="'+W+'" height="'+H+'" rx="15"/><rect class="tree-node-icon" x="14" y="13" width="27" height="25" rx="7"/><text class="tree-node-symbol" x="27.5" y="31" text-anchor="middle">'+esc(icon[node.kind]||'會')+'</text><text class="tree-node-kind" x="49" y="31">'+esc(node.kind)+'</text><circle class="tree-node-dot" cx="175" cy="25" r="4"/><text class="tree-node-title" x="15" y="65">'+esc(node.title)+'</text><text class="tree-node-subtitle" x="15" y="92">'+esc(node.subtitle)+'</text></g>';
  }
  function graphMarkup(){
    const graph=tree();
    return '<svg id="rewards-tree-svg" class="tree-svg" preserveAspectRatio="xMidYMin meet" viewBox="0 0 '+graph.width+' '+graph.height+'" role="group" aria-label="'+esc(graph.name)+'互動樹狀圖" tabindex="0"><defs>'+Object.keys(TREE_STATUS).map(key=>'<marker id="tree-arrow-'+key+'" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="tree-marker '+key+'" d="M1 1 L7 4 L1 7 Z"/></marker>').join('')+'</defs><g class="tree-edges">'+graph.edges.map(edge=>'<g class="tree-edge '+edge.status+'" data-tree-edge="'+edge.id+'"><title>'+esc(edge.label+'：'+TREE_STATUS[edge.status].label)+'</title><path d="'+edgePath(edge)+'" marker-end="url(#tree-arrow-'+edge.status+')"/></g>').join('')+'</g><g>'+graph.nodes.map(nodeMarkup).join('')+'</g></svg>';
  }
  function stepsMarkup(){
    const graph=tree();
    return '<p class="tree-step-caption">不同卡片／會籍是替代起點。每張卡片會寫明承接哪一段，並非依序全部都要完成。</p><ol class="tree-step-list">'+graph.nodes.map(node=>{const parents=graph.edges.filter(edge=>edge.to===node.id).map(edge=>graph.nodes.find(n=>n.id===edge.from).title);return '<li><button type="button" class="tree-step '+node.status+'" data-tree-node="'+node.id+'" aria-pressed="false"><span class="tree-step-icon">'+esc(icon[node.kind]||'會')+'</span><span class="tree-step-copy"><small>'+esc(node.kind)+(parents.length?' · 承接 '+esc(parents.join(' 或 ')):' · 可選起點')+'</small><b>'+esc(node.title)+'</b><span>'+esc(node.subtitle)+'</span><em>'+esc(TREE_STATUS[node.status].label)+'</em></span><span aria-hidden="true">↗</span></button></li>';}).join('')+'</ol>';
  }
  function render(){
    const graph=tree();
    root.innerHTML='<div class="tree-family" role="group" aria-label="選擇路線樹">'+TREES.map((item,i)=>'<button type="button" data-tree-family="'+item.id+'" aria-pressed="'+(item.id===graph.id)+'"><span>0'+(i+1)+'</span>'+esc(item.name)+'</button>').join('')+'</div><section class="tree-workspace"><div class="tree-workspace-top"><div><span class="tree-live-dot" aria-hidden="true"></span><b>'+esc(graph.name)+'</b><small>點節點看條件，選起點看後續</small></div><div class="tree-mode" role="group" aria-label="圖表顯示方式"><button type="button" data-tree-mode="map" aria-pressed="'+(state.mode==='map')+'">互動地圖</button><button type="button" data-tree-mode="steps" aria-pressed="'+(state.mode==='steps')+'">步驟版</button></div></div><div class="tree-toolbar"><label>從哪裡開始看<select id="tree-start" aria-label="從哪裡開始看"><option value="all">看全部起點</option>'+graph.nodes.map(node=>'<option value="'+node.id+'" '+(node.id===state.start?'selected':'')+'>'+esc(node.title)+'</option>').join('')+'</select></label><div class="tree-map-controls" '+(state.mode==='steps'?'hidden':'')+'><button type="button" data-tree-zoom="out" aria-label="縮小路線圖">−</button><output id="tree-zoom-value">100%</output><button type="button" data-tree-zoom="in" aria-label="放大路線圖">＋</button><button type="button" data-tree-fit>看全圖</button><button type="button" data-tree-expand aria-label="切換放大檢視">⛶</button></div></div><div class="tree-canvas" '+(state.mode==='steps'?'hidden':'')+'>'+graphMarkup()+'<div class="tree-canvas-hint">拖曳移動 · Ctrl／⌘＋滾輪縮放</div></div><div class="tree-step-view" '+(state.mode==='map'?'hidden':'')+'>'+stepsMarkup()+'</div><div class="tree-legend"><span class="verified">實線：此段有官方規則</span><span class="pending">虛線：仍待核准／確認</span><span class="blocked">粉紅：地區／來源排除</span><span class="historical">灰色：當期受理未確認</span></div><div id="tree-trace-summary" class="tree-trace-summary" role="status"></div></section><div class="tree-profile-note" id="tree-profile-note" hidden></div><div class="tree-underbar"><p>'+esc(graph.description)+'</p><button type="button" class="text-button" data-tree-share>複製這張路線樹連結 ↗</button></div><p class="tree-research-note">'+esc(graph.note)+'</p>';
    paintFocus();updatePosition();updateProfile();syncExpanded();
  }
  function paintFocus(){
    const graph=tree(),trace=traceTree(graph,state.start,state.target),hasFilter=state.start!=='all'||state.target;
    root.querySelectorAll('[data-tree-node]').forEach(el=>{const id=el.dataset.treeNode;el.classList.toggle('is-dimmed',!!hasFilter&&!trace.nodes.has(id));el.classList.toggle('is-selected',id===state.target);el.classList.toggle('is-path',!!hasFilter&&trace.nodes.has(id));el.setAttribute('aria-pressed',String(id===state.target));});
    root.querySelectorAll('[data-tree-edge]').forEach(el=>{el.classList.toggle('is-dimmed',!!hasFilter&&!trace.edges.has(el.dataset.treeEdge));el.classList.toggle('is-path',!!hasFilter&&trace.edges.has(el.dataset.treeEdge));});
    const start=graph.nodes.find(n=>n.id===state.start),target=graph.nodes.find(n=>n.id===state.target);
    q('#tree-trace-summary').textContent=!trace.connected?'這個起點在圖中接不到「'+target.title+'」。請選其他起點；不會自動補出你未持有的會籍。':target?'通往「'+target.title+'」的候選分支已亮起；待核與排除條件仍保留，並不代表已符合資格。':start?'從「'+start.title+'」往後的候選分支已亮起；不代表你已取得後續會籍。':'先選一個起點，或點任何會籍看前後關係。整張圖的費用與資格須逐段核對。';
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
    const profile=getProfile?.(),el=q('#tree-profile-note');if(!el)return;
    el.hidden=profile?.card!=='ci'||tree().id!=='sas-chain';
    if(profile?.ciTier==='signature'){el.textContent='你填的是華航商務御璽卡。Visa當期對應GHA白金，並非這張圖的鈦金起點；可切換「華航卡可以接什麼」先看自身分支。';return;}
    el.textContent=['priority','precious'].includes(profile?.ciTier)?'你已填華航無限卡卡別；仍須到Visa官方入口驗證。圖上的酒店與航空會籍不會因此自動算作已持有。':'你選了華航聯名卡，但尚未確認卡等。不能直接把它視為Visa無限卡或新航金卡；可切換「華航卡可以接什麼」先看分支。';
  }
  function selectNode(id,trigger){
    const node=tree().nodes.find(node=>node.id===id);if(!node)return;
    state.target=id;paintFocus();notify();lastTrigger=trigger;
    inspect(nodeDetail(node),trigger);
  }
  function resetView(){state.zoom=1;state.offset={x:0,y:0};state.target=null;state.start='all';q('#tree-start').value='all';paintFocus();updatePosition();notify();}
  function open({treeId,start='all',target=null},showDetail=false){
    const graph=TREES.find(item=>item.id===treeId);if(!graph)return false;
    state.treeId=graph.id;state.start=start==='all'||graph.nodes.some(n=>n.id===start)?start:'all';state.target=graph.nodes.some(n=>n.id===target)?target:null;state.zoom=1;state.offset={x:0,y:0};render();
    if(showDetail&&state.target)selectNode(state.target,q((state.mode==='steps'?'.tree-step-view ':'#rewards-tree-svg ')+'[data-tree-node="'+state.target+'"]'));
    return true;
  }
  root.addEventListener('click',event=>{
    const node=event.target.closest('[data-tree-node]');if(node){selectNode(node.dataset.treeNode,node);return;}
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.treeFamily){open({treeId:button.dataset.treeFamily});notify();return;}
    if(button.dataset.treeMode){state.mode=button.dataset.treeMode;if(state.mode==='map'&&matchMedia('(max-width:640px)').matches){const focus=tree().nodes.find(n=>n.id===state.target||n.id===state.start)||tree().nodes[0];state.zoom=2.6;state.offset={x:focus.x+W/2-tree().width/2,y:focus.y+H/2-tree().height/2};}render();return;}
    if(button.dataset.treeZoom){state.zoom*=button.dataset.treeZoom==='in'?1.25:.8;updatePosition();return;}
    if(button.hasAttribute('data-tree-fit')){resetView();return;}
    if(button.hasAttribute('data-tree-expand')){root.classList.toggle('is-expanded');syncExpanded();return;}
    if(button.hasAttribute('data-tree-share')){
      const params=new URLSearchParams({tree:state.treeId});if(state.start!=='all')params.set('start',state.start);if(state.target)params.set('node',state.target);const url=new URL(location.href);url.hash=params.toString();
      if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url.href).then(()=>{q('#tree-trace-summary').textContent='已複製這張路線樹連結。';}).catch(()=>{history.replaceState(null,'',url);q('#tree-trace-summary').textContent='請從網址列複製路線樹連結。';});else {history.replaceState(null,'',url);q('#tree-trace-summary').textContent='網址列已更新，可直接分享。';}
    }
  });
  root.addEventListener('change',event=>{if(event.target.id==='tree-start'){state.start=event.target.value;state.target=null;paintFocus();notify();}});
  root.addEventListener('keydown',event=>{
    const node=event.target.closest('[data-tree-node]');if(node&&['Enter',' '].includes(event.key)){event.preventDefault();selectNode(node.dataset.treeNode,node);}
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
  return {open,updateProfile,resetView,getState:()=>({...state,offset:{...state.offset}})};
}
