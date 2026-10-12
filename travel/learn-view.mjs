// "小小探險家" cards, stamps and the explorer passport. Stamps live in localStorage and are shared by topic key.
import {tripLearn} from './learn-data.mjs?v=1';
import {cityTopic} from './learn-core.mjs?v=2';
const KEY='imq-travel-my2027-learn-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let done={};
try{const stored=JSON.parse(localStorage.getItem(KEY));if(stored&&typeof stored.done==='object'&&stored.done)done=stored.done;}catch{/* Stamps still work for this visit. */}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({done}));}catch{/* Stamps still work for this visit. */}};
const today=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};
const sealDate=iso=>/^\d{4}-\d{2}-\d{2}/.test(iso||'')?`${+iso.slice(5,7)}/${+iso.slice(8,10)}`:'';
const BTN_TODO='完成任務，蓋章！',BTN_DONE='已蓋章，再按一次可取消';

export function learnMarkup(key,city){
 const t=tripLearn[key];if(!t)return '';
 const isCity=key.startsWith('city:'),on=Boolean(done[key]);
 return `<details class="learn${on?' is-done':''}" data-learn="${esc(key)}" data-city="${esc(city)}"><summary><span class="learn-label">${isCity?'城市小百科':'小小探險家'}</span><span class="learn-title">${esc(t.title)}</span><span class="learn-tags">${t.tags.map(g=>`<i>${esc(g)}</i>`).join('')}</span><span class="learn-done-tag">已蓋章</span></summary>`
  +`<div class="learn-body"><span class="learn-seal" aria-hidden="true"><b>探險家</b><em>${esc(sealDate(done[key]))}</em></span><p class="learn-kid">${esc(t.kid)}</p>`
  +`<div class="learn-block learn-mission"><h4>${isCity?'這趟任務':'今日任務'}</h4><p>${esc(t.mission)}</p><button type="button" class="learn-stamp-btn" data-learn-stamp="${esc(key)}" aria-pressed="${on}">${on?BTN_DONE:BTN_TODO}</button></div>`
  +`<div class="learn-block"><h4>晚餐聊一聊</h4><p>${esc(t.dinner)}</p></div>`
  +`<div class="learn-block"><h4>學一句當地話</h4><p><b class="learn-word">${esc(t.malay.word)}</b>（${esc(t.malay.say)}）＝${esc(t.malay.zh)}</p><p class="learn-tip">${esc(t.malay.tip)}</p></div>`
  +`<details class="learn-parent"><summary>給爸媽</summary><p>${esc(t.parent)}</p><p class="learn-src">${t.sources.map(([label,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join('<br>')}</p></details></div></details>`;
}
export const learnBlocks=(keys,city)=>keys.map(k=>learnMarkup(k,city)).join('');
// City card for #places: same component, wrapped in a place-card so route-filter can hide it by region.
const CITY_REGION={kl:'kl',pen:'penang',ipoh:'ipoh',kk:'sabah'};
export const cityCardsMarkup=()=>Object.keys(CITY_REGION).map(c=>`<article class="place-card learn-city" data-city="${c}" data-regions="${CITY_REGION[c]}">${learnMarkup(cityTopic(c),c)}</article>`).join('');

function paint(key){
 const on=Boolean(done[key]);
 document.querySelectorAll('[data-learn]').forEach(el=>{
  if(el.dataset.learn!==key)return;
  el.classList.toggle('is-done',on);
  el.querySelector('.learn-seal em').textContent=sealDate(done[key]);
  const b=el.querySelector('[data-learn-stamp]');
  b.setAttribute('aria-pressed',String(on));b.textContent=on?BTN_DONE:BTN_TODO;
 });
}
let routeKeys=[];
// Passport: distinct topics of the current route; filled circles are stamped ones.
// Called with keys on every daily render; a stamp click calls it bare so the open extra-reading list is kept.
export function renderPassport(keys,extra){
 if(keys){routeKeys=keys;renderExtra(extra||[]);}
 const el=document.querySelector('#passport');if(!el)return;
 if(!routeKeys.length){el.innerHTML='';return;}
 const got=routeKeys.filter(k=>done[k]).length;
 el.innerHTML=`<p class="passport-count"><b>探險護照</b>：已蓋 ${got}／${routeKeys.length} 個章</p><ul class="passport-grid">${routeKeys.map((k,i)=>{const c=k.startsWith('city:')?k.slice(5):document.querySelector(`[data-learn="${CSS.escape(k)}"]`)?.dataset.city||'',ok=Boolean(done[k]);return `<li class="${ok?'is-done':''}" data-city="${/^(kl|pen|penres|ipoh|kk|resort)$/.test(c)?c:''}" title="${esc(tripLearn[k]?.title)}" aria-label="${esc(tripLearn[k]?.title)}${ok?'（已蓋章）':''}">${ok?'✓':i+1}</li>`;}).join('')}</ul>`;
}
function renderExtra(extra){
 const el=document.querySelector('#learn-extra');if(!el)return;
 el.innerHTML=extra.length?`<details class="fold learn-more"><summary>還有 ${extra.length} 張這趟沒排進每日行程的小知識卡</summary><p class="small">休息日不夠排，這些主題沒有分到哪一天；挑孩子有興趣的念，一樣可以蓋章。</p>${extra.map(k=>learnMarkup(k,k.split(':')[0])).join('')}</details>`:'';
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-learn-stamp]');if(!b)return;
 const key=b.dataset.learnStamp;
 if(done[key])delete done[key];else done[key]=today();
 save();paint(key);renderPassport();
});
