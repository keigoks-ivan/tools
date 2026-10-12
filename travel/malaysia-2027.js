import {hotelContextMarkup} from './travel-context-view.mjs?v=4';
import {tripRoutes,tripHotels,tripPlaces} from './research-data.mjs?v=6';
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const official = (url,label='官方資料 ↗') => `<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`;
const dateLabel = date => `${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`;
const storageKey = 'imq-travel-my2027-v1';
let saved = {route:'klpenkl',hotels:[]};
try { const stored=JSON.parse(localStorage.getItem(storageKey)); if(stored&&typeof stored==='object'){ if(tripRoutes.some(r=>r.id===stored.route)&&stored.route!=='balanced')saved.route=stored.route; if(Array.isArray(stored.hotels))saved.hotels=stored.hotels.filter(id=>tripHotels.some(h=>h.id===id)); } } catch { /* A fresh session is valid when storage is unavailable. */ }
function persist(){ try{localStorage.setItem(storageKey,JSON.stringify(saved));document.querySelector('#storage-status').textContent='';}catch{document.querySelector('#storage-status').textContent='目前瀏覽器無法儲存收藏；選擇仍可在本頁使用。';} }
function showRoute(id){
  const route=tripRoutes.find(r=>r.id===id)||tripRoutes[0]; saved.route=route.id;
  document.querySelector('#route-buttons').innerHTML=tripRoutes.map(r=>`<button type="button" class="route-button" data-route="${r.id}" aria-pressed="${r.id===route.id}"><small>${esc(r.label)}</small><strong>${esc(r.title)}</strong><span>${esc(r.short)}</span></button>`).join('');
  document.querySelector('#route-detail').innerHTML=`<div class="detail-top"><div><h3>${esc(route.title)}</h3><p>${esc(route.desc)}</p></div><span class="pill">${esc(route.tag)}</span></div><div class="timeline">${route.legs.map(([city,start,end,nights,cls])=>`<div class="leg ${cls}" style="--nights:${nights}"><small>${dateLabel(start)} 入住 → ${dateLabel(end)} 離開</small><b>${city} ${nights} 晚</b></div>`).join('')}</div><div class="detail-body"><div><h4>住宿配置</h4><p>${esc(route.stay)}</p><h4>孩子的節奏</h4><p>${esc(route.plan)}</p></div><div><h4>移動與費用結構</h4><p>${esc(route.cost)}</p><h4>要確認的取捨</h4><p>${esc(route.risk)}</p></div></div>`;
}
let hotelFilter='all';
function showHotels(){
  const hotels=tripHotels.filter(h=>hotelFilter==='all'||hotelFilter==='kitchen'&&h.kitchen||hotelFilter==='marriott'&&h.brand||hotelFilter==='sabah'&&h.sabah);
  document.querySelector('#hotel-grid').innerHTML=hotels.map(h=>`<article class="hotel-card"><span class="city">${esc(h.city)}</span><h3>${esc(h.name)}</h3><div class="badges">${h.tags.map(tag=>`<span class="badge ${h.warning?'warning':''}">${esc(tag)}</span>`).join('')}</div><p class="verdict">${esc(h.verdict)}</p><ul>${h.facts.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>${hotelContextMarkup(h)}<p><b>尚待確認：</b>${esc(h.check)}</p><div class="hotel-actions"><span>${official(h.url,h.urlLabel?`${esc(h.urlLabel)} ↗`:undefined)}${h.extra?`<br>${official(h.extra,'官方交通 ↗')}`:''}${h.sources?`<br>${h.sources.map(([label,url])=>official(url,`${esc(label)} ↗`)).join(' · ')}`:''}</span><button type="button" class="save" data-save="${h.id}" aria-pressed="${saved.hotels.includes(h.id)}" aria-label="收藏 ${esc(h.name)}">${saved.hotels.includes(h.id)?'已收藏 ✓':'收藏 ＋'}</button></div></article>`).join('');
}
showRoute(saved.route);showHotels();
document.querySelector('#place-grid').innerHTML=tripPlaces.map(p=>`<article class="place-card"><h3>${esc(p.city)}</h3>${p.items.map(([name,desc,url])=>`<div class="attraction"><strong>${esc(name)}</strong><p>${esc(desc)}</p>${official(url)}</div>`).join('')}</article>`).join('');
document.querySelector('#route-buttons').addEventListener('click',e=>{const b=e.target.closest('[data-route]');if(b){showRoute(b.dataset.route);persist();document.dispatchEvent(new CustomEvent('travel-route-select',{detail:b.dataset.route}));document.querySelector(`[data-route="${b.dataset.route}"]`).focus();}});
document.querySelector('.filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(b){hotelFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',x===b));showHotels();}});
document.querySelector('#hotel-grid').addEventListener('click',e=>{const b=e.target.closest('[data-save]');if(b){const id=b.dataset.save;saved.hotels=saved.hotels.includes(id)?saved.hotels.filter(x=>x!==id):[...saved.hotels,id];persist();showHotels();document.querySelector(`[data-save="${id}"]`).focus();}});
document.querySelector('#print').addEventListener('click',()=>{const detail=document.querySelector('.all-routes');const wasOpen=detail.open;detail.open=true;window.print();detail.open=wasOpen;});
