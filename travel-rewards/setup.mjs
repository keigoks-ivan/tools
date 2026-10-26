import {RESOURCES} from './network-data.mjs?v=20261025-12';
import {cleanNetworkState,toggleNetworkResource,selectedResources} from './network-core.mjs?v=20261026-15';
import {SETUP_STORE,SETUP_GOALS,SETUP_STEPS,setupResources,cleanSetupPreference} from './setup-core.mjs?v=20261026-15';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const programNames={marriott:'萬豪',hilton:'Hilton',krisflyer:'新航',jal:'日本航空 JAL',united:'聯合航空',hyatt:'凱悅 Hyatt',all:'雅高 ALL',qatar:'卡達航空 Qatar'};

export function mountSetup(dialog,{getInventory,apply,onDismiss}){
  let preference=null;try{preference=cleanSetupPreference(JSON.parse(localStorage.getItem(SETUP_STORE)||'null'));}catch{}
  let draft=cleanNetworkState(),step=0,goal=null,initial=false,trigger=null;
  const q=selector=>dialog.querySelector(selector);
  const selected=()=>selectedResources(draft);
  function remember(outcome){preference={version:1,outcome,goal:outcome==='completed'?goal:null};try{localStorage.setItem(SETUP_STORE,JSON.stringify(preference));}catch{}}
  function option(item){
    const checked=selected().has(item.id),balance=step===2&&!item.id.endsWith('account');
    return '<div class="setup-option" data-setup-option data-search="'+esc(item.label.toLocaleLowerCase())+'"><label class="setup-choice"><input type="checkbox" data-setup-resource="'+item.id+'" '+(checked?'checked':'')+'><span>'+esc(item.label)+'</span><span class="setup-check" aria-hidden="true">✓</span></label>'+(balance?'<label class="setup-balance" '+(checked?'':'hidden')+'>餘額（選填）<input type="number" min="0" step="any" inputmode="decimal" data-setup-balance="'+item.id+'" aria-label="'+esc(item.label)+'餘額（選填）" placeholder="不確定可留空" value="'+esc(draft.balances[item.id]??'')+'"></label>':'')+'</div>';
  }
  function resourceBody(){
    const list=setupResources(SETUP_STEPS[step].id);
    if(step===1){
      const programs=[...new Set(list.map(item=>item.exclusive).filter(Boolean))];
      return '<div class="setup-tiers">'+programs.map(id=>'<label>'+esc(programNames[id]||id)+'<select data-setup-tier="'+id+'"><option value="">尚未填寫</option>'+list.filter(item=>item.exclusive===id).map(item=>'<option value="'+item.id+'" '+(selected().has(item.id)?'selected':'')+'>'+esc(item.label)+'</option>').join('')+'</select></label>').join('')+'</div><p class="setup-section-label">其他已核准會籍</p><div class="setup-options">'+list.filter(item=>!item.exclusive).map(option).join('')+'</div>';
    }
    const accounts=list.filter(item=>item.id.endsWith('account'));
    return '<label class="setup-search">搜尋'+(step===0?'卡片':'里程或點數')+'<input type="search" data-setup-search placeholder="'+(step===0?'華航、運通、CUBE…':'小樹點、萬豪、Avios…')+'"></label><div class="setup-options">'+list.filter(item=>!item.id.endsWith('account')).map(option).join('')+'</div><p class="setup-no-results" data-setup-no-results hidden>目前清單沒有符合的項目，可先留空。</p>'+(accounts.length?'<details class="setup-accounts"><summary>只有會員帳戶、尚無點數？</summary><div class="setup-options">'+accounts.map(option).join('')+'</div></details>':'');
  }
  function render(){
    const current=SETUP_STEPS[step];
    dialog.innerHTML='<div class="setup-top"><span class="setup-brand" aria-hidden="true">↗</span><span>設定我的起點</span><button type="button" class="icon-button" data-setup-skip aria-label="略過設定，先逛逛">×</button></div><nav class="setup-progress" aria-label="設定步驟">'+SETUP_STEPS.map((item,index)=>'<button type="button" data-setup-step="'+index+'" '+(index===step?'aria-current="step"':'')+'><span>'+String(index+1).padStart(2,'0')+'</span>'+item.label+'</button>').join('')+'</nav><div class="setup-heading"><p class="eyebrow">'+(step+1)+' / '+SETUP_STEPS.length+' · '+(step===3?'選一個方向':'可複選，也可以留空')+'</p><h2 id="setup-title" tabindex="-1">'+current.title+'</h2><p id="setup-intro">'+current.note+'</p></div><div class="setup-body">'+(step===3?'<div class="setup-goals" role="group" aria-label="選擇旅行目標">'+SETUP_GOALS.map(item=>'<button type="button" data-setup-goal="'+item.id+'" aria-pressed="'+(goal===item.id)+'"><span aria-hidden="true">'+item.icon+'</span><span><b>'+item.title+'</b><small>'+item.note+'</small></span><span class="setup-goal-check" aria-hidden="true">✓</span></button>').join('')+'</div><details class="setup-review"><summary>查看已選資源 <b>'+selected().size+' 項</b></summary><div>'+([ ...selected()].map(id=>'<span>'+esc(RESOURCES.find(item=>item.id===id)?.label||id)+'</span>').join('')||'<p>尚未選擇資源；可先探索全部路線。</p>')+'</div></details>':resourceBody())+'</div><div class="setup-bottom"><p>已選 <b data-setup-count>'+selected().size+'</b> 項 · 只存於此瀏覽器<br><span>按完成才儲存；略過不會更動原有資源。</span></p><div class="setup-actions"><button type="button" class="text-button" data-setup-skip>先逛逛</button>'+(step?'<button type="button" class="button secondary" data-setup-back>上一步</button>':'')+'<button type="button" class="button" data-setup-next '+(step===3&&!goal?'disabled':'')+'>'+(step===3?'完成，查看路線 ↗':'下一步 →')+'</button></div></div>';
    dialog.scrollTop=0;if(dialog.open)q('#setup-title').focus();
  }
  function open(first=false){
    initial=first;trigger=document.activeElement;draft=cleanNetworkState(getInventory());step=0;goal=preference?.goal||null;
    render();dialog.showModal();q('#setup-title').focus();
  }
  function dismiss(){
    if(initial)remember('skipped');dialog.close();if(trigger?.isConnected&&!initial)trigger.focus();onDismiss?.({initial});
  }
  function sync(){
    const own=selected();q('[data-setup-count]').textContent=own.size;
    dialog.querySelectorAll('[data-setup-resource]').forEach(input=>{input.checked=own.has(input.dataset.setupResource);const balance=input.closest('[data-setup-option]').querySelector('.setup-balance');if(balance)balance.hidden=!input.checked;});
  }
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-setup-skip')){dismiss();return;}
    if(button.dataset.setupStep!==undefined){step=Number(button.dataset.setupStep);render();return;}
    if(button.hasAttribute('data-setup-back')){step--;render();return;}
    if(button.dataset.setupGoal){goal=button.dataset.setupGoal;dialog.querySelectorAll('[data-setup-goal]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.setupGoal===goal)));q('[data-setup-next]').disabled=false;return;}
    if(button.hasAttribute('data-setup-next')){
      if([...dialog.querySelectorAll('[data-setup-balance]')].some(input=>!input.closest('.setup-balance').hidden&&!input.reportValidity()))return;
      if(step<3){step++;render();return;}
      if(!goal)return;
      const invalid=Object.values(draft.balances).some(value=>value!==''&&(!Number.isFinite(Number(value))||Number(value)<0));
      if(invalid){step=2;render();return;}
      remember('completed');dialog.close();apply({inventory:cleanNetworkState(draft),goal});
    }
  });
  dialog.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset.setupResource){draft=toggleNetworkResource(draft,input.dataset.setupResource,input.checked);sync();}
    if(input.dataset.setupTier){for(const item of RESOURCES.filter(item=>item.exclusive===input.dataset.setupTier))if(selected().has(item.id))draft=toggleNetworkResource(draft,item.id,false);if(input.value)draft=toggleNetworkResource(draft,input.value,true);sync();}
  });
  dialog.addEventListener('input',event=>{
    const input=event.target;
    if(input.dataset.setupBalance){draft.balances[input.dataset.setupBalance]=input.value;return;}
    if(input.hasAttribute('data-setup-search')){const query=input.value.trim().toLocaleLowerCase();let visible=0;dialog.querySelectorAll('[data-setup-option]').forEach(item=>{if(item.closest('.setup-accounts'))return;item.hidden=!item.dataset.search.includes(query);if(!item.hidden)visible++;});q('[data-setup-no-results]').hidden=visible>0;}
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  return {open:()=>open(false),offer:()=>{if(preference)return false;open(true);return true;},get goal(){return preference?.outcome==='completed'?preference.goal:null;}};
}
