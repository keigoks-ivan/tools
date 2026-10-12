import {hotelContextMarkup} from './travel-context-view.mjs?v=7';
import {CITY_SHORT,REGION_OF,hotelRegion} from './planner-core.mjs?v=8';
import './route-filter.mjs?v=2';
import {cityCardsMarkup} from './learn-view.mjs?v=3';
import {tripRoutes,tripHotels,tripPlaces,tripImages} from './research-data.mjs?v=9';
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const official = (url,label='官方資料 ↗') => `<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`;
const dateLabel = date => `${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`;
const img = (id,cls) => { const im=tripImages[id]; return im?`<img class="${cls}" src="${esc(im.file)}" width="${im.w}" height="${im.h}" loading="lazy" decoding="async" alt="${esc(im.alt)}">`:''; };
const credit = id => { const im=tripImages[id]; return im?`${esc(im.caption)}｜攝影：${esc(im.author)}｜<a href="${esc(im.licenseUrl)}" target="_blank" rel="noopener">${esc(im.license)} ↗</a>｜<a href="${esc(im.source)}" target="_blank" rel="noopener">來源頁 ↗</a>`:''; };
const cityKey = s => /Tanjung|Sutera|亞庇近郊/.test(s)?'resort':/Batu|Teluk|檳城渡假村/.test(s)?'penres':/檳城/.test(s)?'pen':/怡保/.test(s)?'ipoh':/沙巴|亞庇/.test(s)?'kk':/吉隆坡/.test(s)?'kl':'';
const storageKey = 'imq-travel-my2027-v1';
let saved = {route:'klpenkl',hotels:[]};
try { const stored=JSON.parse(localStorage.getItem(storageKey)); if(stored&&typeof stored==='object'){ if(tripRoutes.some(r=>r.id===stored.route)&&stored.route!=='balanced')saved.route=stored.route; if(Array.isArray(stored.hotels))saved.hotels=stored.hotels.filter(id=>tripHotels.some(h=>h.id===id)); } } catch { /* A fresh session is valid when storage is unavailable. */ }
function persist(){ try{let current={};try{current=JSON.parse(localStorage.getItem(storageKey))||{};}catch{}localStorage.setItem(storageKey,JSON.stringify({...current,...saved}));document.querySelector('#storage-status').textContent='';}catch{document.querySelector('#storage-status').textContent='目前瀏覽器無法儲存收藏；選擇仍可在本頁使用。';} }
// The planner is the single source of truth for the route; this panel only mirrors it.
// id = a route card id, or null when the planned route matches none of the cards.
let latest={regions:['kl','penang'],preset:'klpenkl',legs:[],hotels:[]},shownKey='';
const legClass=city=>REGION_OF[city]==='sabah'?'sb':REGION_OF[city]==='ipoh'?'ip':'';
function showRoute(id){
 const route=id?tripRoutes.find(r=>r.id===id)||tripRoutes[0]:null, key=route?route.id:'custom:'+JSON.stringify(latest.legs);
 if(key===shownKey)return; shownKey=key;
 if(route)saved.route=route.id;
 document.querySelector('#route-buttons').innerHTML=tripRoutes.map(r=>`<button type="button" class="route-button" data-route="${r.id}" aria-pressed="${Boolean(route)&&r.id===route.id}"><small>${esc(r.label)}</small><strong>${esc(r.title)}</strong><span>${esc(r.short)}</span></button>`).join('');
 const research=document.querySelector('#route-research');
 if(!route){
  document.querySelector('#route-detail').innerHTML=`<div class="detail-top"><div><h3>自訂路線</h3><p>目前的城市或晚數不是上面任何一張路線卡，可能來自「更多組合」，或在「微調晚數與住宿」裡調整過。行程簡表與每日安排依調整後的內容計算。</p></div><span class="pill">自訂</span></div><div class="timeline">${latest.legs.map(l=>`<div class="leg ${legClass(l.city)}" data-city="${l.city}" style="--nights:${l.nights}"><small>${dateLabel(l.start)} 入住 → ${dateLabel(l.end)} 離開</small><b>${esc(CITY_SHORT[l.city]||l.city)} ${l.nights} 晚</b></div>`).join('')}</div>`;
  research.hidden=true; return;
 }
 research.hidden=false;
 document.querySelector('#route-detail').innerHTML=`<div class="detail-top"><div><h3>${esc(route.title)}</h3><p>${esc(route.desc)}</p></div><span class="pill">${esc(route.tag)}</span></div><figure class="route-shot">${img(route.img,'route-photo')}<figcaption>${credit(route.img)}</figcaption></figure><div class="timeline">${route.legs.map(([city,start,end,nights,cls])=>`<div class="leg ${cls}" data-city="${cityKey(city)}" style="--nights:${nights}"><small>${dateLabel(start)} 入住 → ${dateLabel(end)} 離開</small><b>${city} ${nights} 晚</b></div>`).join('')}</div>`;
 document.querySelector('#route-research-body').innerHTML=`<div><h4>住宿配置</h4><p>${esc(route.stay)}</p><h4>孩子的節奏</h4><p>${esc(route.plan)}</p></div><div><h4>移動與費用結構</h4><p>${esc(route.cost)}</p><h4>要確認的取捨</h4><p>${esc(route.risk)}</p></div>`;
}
let hotelFilter='all';
function showHotels(){
  const hotels=tripHotels.filter(h=>hotelFilter==='all'||hotelFilter==='kitchen'&&h.kitchen||hotelFilter==='marriott'&&h.brand||hotelFilter==='sabah'&&h.sabah);
  // Hotels picked in the planner come first.
  const rank=h=>{const i=latest.hotels.indexOf(h.id);return i<0?Infinity:i;}; hotels.sort((a,b)=>rank(a)-rank(b));
  document.querySelector('#hotel-grid').innerHTML=hotels.map(h=>`<article class="hotel-card" data-city="${cityKey(h.city)}" data-regions="${hotelRegion(h.id)}">${latest.hotels.includes(h.id)?'<span class="pick-tag">目前選用</span>':''}${h.img?`<figure class="shot">${tripImages[h.img]?.nearby?'<span class="nearby-tag">周邊環境</span>':''}${img(h.img,'hotel-photo')}<figcaption>${credit(h.img)}</figcaption></figure>`:''}<span class="city">${esc(h.city)}</span><h3>${esc(h.name)}</h3><div class="badges">${h.tags.map(tag=>`<span class="badge ${h.warning?'warning':''}">${esc(tag)}</span>`).join('')}</div><p class="verdict">${esc(h.verdict)}</p><ul>${h.facts.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>${hotelContextMarkup(h)}<p><b>尚待確認：</b>${esc(h.check)}</p><div class="hotel-actions"><span><a class="gallery-btn" href="${esc(h.gallery)}" target="_blank" rel="noopener">${esc(h.galleryLabel||'看官方相簿')} ↗</a><br>${official(h.url,h.urlLabel?`${esc(h.urlLabel)} ↗`:undefined)}${h.extra?`<br>${official(h.extra,'官方交通 ↗')}`:''}${h.sources?`<br>${h.sources.map(([label,url])=>official(url,`${esc(label)} ↗`)).join(' · ')}`:''}</span><button type="button" class="save" data-save="${h.id}" aria-pressed="${saved.hotels.includes(h.id)}" aria-label="收藏 ${esc(h.name)}">${saved.hotels.includes(h.id)?'已收藏 ✓':'收藏 ＋'}</button></div></article>`).join('');
}
showRoute(saved.route);showHotels();
document.querySelector('#place-grid').innerHTML=cityCardsMarkup()+tripPlaces.map(p=>`<article class="place-card" data-city="${cityKey(p.city)}" data-regions="${REGION_OF[cityKey(p.city)]||''}"><h3>${esc(p.city)}</h3>${p.items.map(([name,desc,url,imgId])=>`<div class="attraction"><figure class="shot">${img(imgId,'place-photo')}<figcaption>${credit(imgId)}</figcaption></figure><strong>${esc(name)}</strong><p>${esc(desc)}</p>${official(url)}</div>`).join('')}</article>`).join('');
document.querySelector('#image-credits-list').innerHTML=Object.keys(tripImages).map(id=>`<li>${credit(id)}</li>`).join('');
document.querySelector('#route-buttons').addEventListener('click',e=>{const b=e.target.closest('[data-route]');if(b){showRoute(b.dataset.route);persist();document.dispatchEvent(new CustomEvent('travel-route-select',{detail:b.dataset.route}));document.querySelector(`[data-route="${b.dataset.route}"]`).focus();}});
document.querySelector('.filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(b){hotelFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',x===b));showHotels();}});
document.querySelector('#hotel-grid').addEventListener('click',e=>{const b=e.target.closest('[data-save]');if(b){const id=b.dataset.save;saved.hotels=saved.hotels.includes(id)?saved.hotels.filter(x=>x!==id):[...saved.hotels,id];persist();showHotels();document.querySelector(`[data-save="${id}"]`).focus();}});
document.addEventListener('travel-plan-change',e=>{
 latest=e.detail;
 // Route cards and the dropdown agree: a card is pressed only when the planned route is exactly that card's preset.
 showRoute(tripRoutes.some(r=>r.id===latest.preset)?latest.preset:null);
 if(hotelFilter==='sabah'&&!latest.regions.includes('sabah')){hotelFilter='all';document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.filter==='all'));}
 showHotels();
 persist();
});
document.querySelector('#print').addEventListener('click',()=>{const detail=document.querySelector('.all-routes');const wasOpen=detail.open;detail.open=true;window.print();detail.open=wasOpen;});
