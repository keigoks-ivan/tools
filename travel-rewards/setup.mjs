import {RESOURCES} from './network-data.mjs?v=20261031-1';
import {cleanNetworkState,toggleNetworkResource,selectedResources} from './network-core.mjs?v=20261031-1';
import {SETUP_STORE,SETUP_STEPS,CARD_ISSUERS,cardIssuer,setupResources,cleanSetupPreference} from './setup-core.mjs?v=20261031-1';

import {normalizeRewardSearch,resourceSearchText} from './bank-entries-data.mjs?v=20261031-1';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const programNames={marriott:'萬豪',hilton:'Hilton',ihg:'IHG',hyatt:'凱悅 Hyatt',krisflyer:'新航 KrisFlyer',jal:'日本航空 JAL',united:'聯合航空',all:'雅高 ALL',qatar:'卡達航空 Qatar'};
// 常用計畫直接列出，其餘收進「其他航空與飯店會籍」
const mainPrograms=['marriott','hilton','ihg','hyatt','krisflyer'];

export function mountSetup(dialog,{getInventory,apply,onDismiss}){
  let preference=null;try{preference=cleanSetupPreference(JSON.parse(localStorage.getItem(SETUP_STORE)||'null'));}catch{}
  let draft=cleanNetworkState(),step=0,initial=false,trigger=null;
  const q=selector=>dialog.querySelector(selector);
  const selected=()=>selectedResources(draft);
  function remember(outcome){preference={version:1,outcome,goal:null};try{localStorage.setItem(SETUP_STORE,JSON.stringify(preference));}catch{}}
  function option(item){
    const checked=selected().has(item.id),balance=step===2&&!item.id.endsWith('account');
    return '<div class="setup-option" data-setup-option data-search="'+esc(resourceSearchText(item))+'"><label class="setup-choice"><input type="checkbox" data-setup-resource="'+item.id+'" '+(checked?'checked':'')+'><span>'+esc(item.label)+(item.note?'<small>'+esc(item.note)+'</small>':'')+'</span><span class="setup-check" aria-hidden="true">✓</span></label>'+(balance?'<label class="setup-balance" '+(checked?'':'hidden')+'>餘額（選填）<input type="number" min="0" step="any" inputmode="decimal" data-setup-balance="'+item.id+'" aria-label="'+esc(item.label)+'餘額（選填）" placeholder="不確定可留空" value="'+esc(draft.balances[item.id]??'')+'"></label>':'')+'</div>';
  }
  function unlistedBody(){const key=SETUP_STEPS[step].id;return '<details class="setup-other" '+(draft.unlisted[key]?'open':'')+'><summary>清單沒有你的'+(step===0?'信用卡':step===1?'會籍':'里程或點數')+'？</summary><label>其他起點（選填）<textarea data-setup-unlisted="'+key+'" maxlength="500" rows="3" placeholder="填寫名稱與卡別／等級；多項可分行">'+esc(draft.unlisted[key]||'')+'</textarea></label><p>只存於此瀏覽器，作為待核記錄。尚未建檔的規則不會用來判定路線。</p></details>';}
  function tierGroup(id,list){
    const items=list.filter(item=>item.exclusive===id),current=items.find(item=>selected().has(item.id))?.id||'';
    return '<fieldset class="setup-tier"><legend>'+esc(programNames[id]||id)+'</legend><div class="setup-pills"><label class="setup-pill"><input type="radio" name="tier-'+id+'" value="" data-setup-tier="'+id+'" '+(current?'':'checked')+'>沒有</label>'+items.map(item=>'<label class="setup-pill"><input type="radio" name="tier-'+id+'" value="'+item.id+'" data-setup-tier="'+id+'" '+(current===item.id?'checked':'')+'>'+esc(item.label)+'</label>').join('')+'</div></fieldset>';
  }
  function resourceBody(){
    const list=setupResources(SETUP_STEPS[step].id);
    if(step===1){
      const programs=[...new Set(list.map(item=>item.exclusive).filter(Boolean))],more=programs.filter(id=>!mainPrograms.includes(id)),others=list.filter(item=>!item.exclusive);
      const moreCount=list.filter(item=>(!item.exclusive||more.includes(item.exclusive))&&selected().has(item.id)).length;
      return '<div class="setup-tiers">'+mainPrograms.filter(id=>programs.includes(id)).map(id=>tierGroup(id,list)).join('')+'</div><details class="setup-group" '+(moreCount?'open':'')+'><summary><b>其他航空與飯店會籍</b>'+(moreCount?'<span class="setup-group-count">已選 '+moreCount+'</span>':'')+'<small>JAL、聯航、ALL、Qatar、GHA、BW…</small></summary><div class="setup-tiers">'+more.map(id=>tierGroup(id,list)).join('')+'</div><p class="setup-section-label">其他已核准會籍</p><div class="setup-options">'+others.map(option).join('')+'</div></details>';
    }
    const accounts=list.filter(item=>item.id.endsWith('account')),items=list.filter(item=>!item.id.endsWith('account'));
    const search='<label class="setup-search"><span>搜尋'+(step===0?'卡片':'里程或點數')+'</span><input type="search" data-setup-search placeholder="'+(step===0?'華航、CUBE、ANA、滙豐…':'小樹點、萬豪、Avios…')+'"></label>';
    const body=step===0?CARD_ISSUERS.map(([key,name])=>{const group=items.filter(item=>cardIssuer(item.id)===key);if(!group.length)return '';const count=group.filter(item=>selected().has(item.id)).length;return '<details class="setup-group" data-setup-group '+(count?'open':'')+'><summary><b>'+esc(name)+'</b>'+(count?'<span class="setup-group-count">已選 '+count+'</span>':'')+'<small>'+group.length+' 張</small></summary><div class="setup-options">'+group.map(option).join('')+'</div></details>';}).join(''):'<div class="setup-options">'+items.map(option).join('')+'</div>';
    return search+body+'<p class="setup-no-results" data-setup-no-results hidden>沒有符合的已建檔項目，可在下方記錄其他起點。</p>'+(accounts.length?'<details class="setup-accounts"><summary>只有會員帳戶、尚無點數？</summary><div class="setup-options">'+accounts.map(option).join('')+'</div></details>':'');
  }
  function render(){
    const current=SETUP_STEPS[step],last=step===SETUP_STEPS.length-1;
    dialog.innerHTML='<div class="setup-top">'+(step?'<button type="button" class="text-button" data-setup-back>‹ 上一步</button>':'<button type="button" class="text-button" data-setup-close>‹ 返回</button>')+'<span class="setup-step-count">'+(step+1)+' / '+SETUP_STEPS.length+'</span><button type="button" class="text-button" data-setup-skip>先逛逛</button></div><div class="setup-progress" aria-hidden="true">'+SETUP_STEPS.map((item,index)=>'<span'+(index<=step?' class="done"':'')+'></span>').join('')+'</div><div class="setup-heading"><p class="eyebrow">'+current.label+(last?' · 選填':' · 可複選，也可以留空')+'</p><h2 id="setup-title" tabindex="-1">'+current.title+'</h2><p id="setup-intro">'+current.note+'</p></div><div class="setup-body">'+resourceBody()+unlistedBody()+'</div><div class="setup-bottom"><p>已選 <b data-setup-count>'+selected().size+'</b> 項<br><span>只存於此瀏覽器；按完成才儲存。</span></p><button type="button" class="button" data-setup-next>'+(last?'完成，看我的路線':'下一步：'+SETUP_STEPS[step+1].label)+'</button></div>';
    dialog.scrollTop=0;if(dialog.open)q('#setup-title').focus();
  }
  function open(first=false){
    initial=first;trigger=document.activeElement;draft=cleanNetworkState(getInventory());step=0;
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
    if(button.hasAttribute('data-setup-close')){dialog.close();if(trigger?.isConnected)trigger.focus();return;}
    if(button.hasAttribute('data-setup-back')){step--;render();return;}
    if(button.hasAttribute('data-setup-next')){
      if([...dialog.querySelectorAll('[data-setup-balance]')].some(input=>!input.closest('.setup-balance').hidden&&!input.reportValidity()))return;
      if(step<SETUP_STEPS.length-1){step++;render();return;}
      const invalid=Object.values(draft.balances).some(value=>value!==''&&(!Number.isFinite(Number(value))||Number(value)<0));
      if(invalid){step=2;render();return;}
      remember('completed');dialog.close();apply({inventory:cleanNetworkState(draft)});
    }
  });
  dialog.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset.setupResource){draft=toggleNetworkResource(draft,input.dataset.setupResource,input.checked);sync();}
    if(input.dataset.setupTier){for(const item of RESOURCES.filter(item=>item.exclusive===input.dataset.setupTier))if(selected().has(item.id))draft=toggleNetworkResource(draft,item.id,false);if(input.value)draft=toggleNetworkResource(draft,input.value,true);sync();}
  });
  dialog.addEventListener('input',event=>{
    const input=event.target;
    if(input.dataset.setupUnlisted){draft.unlisted[input.dataset.setupUnlisted]=input.value;return;}
    if(input.dataset.setupBalance){draft.balances[input.dataset.setupBalance]=input.value;return;}
    if(input.hasAttribute('data-setup-search')){const query=normalizeRewardSearch(input.value);let visible=0;dialog.querySelectorAll('[data-setup-option]').forEach(item=>{if(item.closest('.setup-accounts'))return;item.hidden=!item.dataset.search.includes(query);if(!item.hidden)visible++;});dialog.querySelectorAll('[data-setup-group]').forEach(group=>{const hits=[...group.querySelectorAll('[data-setup-option]')].some(item=>!item.hidden);group.hidden=!hits;if(query)group.open=hits;});q('[data-setup-no-results]').hidden=visible>0;}
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();if(trigger?.isConnected)trigger.focus();});
  return {open:()=>open(false),get seen(){return !!preference;},skip:()=>remember('skipped')};
}
