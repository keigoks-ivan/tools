// Shows only the parts of the page that apply to the route currently planned.
// planner.mjs publishes the route as body[data-regions] and a `travel-plan-change` event; every element carrying
// data-regions="kl penang ipoh sabah" (any subset) is hidden unless it shares a region with the route.
// "Show all research" keeps everything visible and labels what is off the route.
import {matchesRegions,REGION_OF} from './planner-core.mjs?v=9';
const KEY='imq-travel-my2027-v1',CIRCLED='①②③④⑤⑥⑦⑧⑨';
const split=text=>String(text||'').split(/\s+/).filter(Boolean);
let regions=split(document.body.dataset.regions).length?split(document.body.dataset.regions):['kl','penang'],lastRegion='kl';
const readStored=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{};}catch{return {};}};
function storeShowAll(on){try{localStorage.setItem(KEY,JSON.stringify({...readStored(),showAll:on}));}catch{/* The switch still works for this visit. */}}
const showingAll=()=>document.body.classList.contains('show-all');

function buildNav(){
 const bar=document.querySelector('.toolbar');if(!bar)return;
 const links=[...document.querySelectorAll('main [data-nav]')].filter(el=>!el.hidden).map(el=>{
  const num=el.dataset.num,mark=num?`${CIRCLED[Number(num)-1]} `:'';
  return `<a href="#${el.id}"${num?'':' class="sub"'}>${mark}${el.dataset.nav}</a>`;
 }).join('');
 if(bar.dataset.built===links)return;
 bar.dataset.built=links;
 bar.querySelectorAll('a').forEach(a=>a.remove());
 bar.insertAdjacentHTML('afterbegin',links);
}

export function applyRegions(){
 const all=showingAll();
 document.querySelectorAll('[data-regions]').forEach(el=>{
  const off=!matchesRegions(el.dataset.regions,regions);
  if(el.classList.contains('off-route')!==off)el.classList.toggle('off-route',off);
  const hide=off&&!all;
  if(el.hidden!==hide)el.hidden=hide;
 });
 document.querySelectorAll('.map .dot').forEach(dot=>{
  const region=dot.classList.contains('pen')?'penang':dot.classList.contains('ipoh')?'ipoh':dot.classList.contains('sabah')?'sabah':'kl';
  dot.classList.toggle('dim',!regions.includes(region));
 });
 document.querySelectorAll('[data-last]').forEach(row=>row.classList.toggle('is-last-stop',row.dataset.last===lastRegion));
 buildNav();
}

document.addEventListener('travel-plan-change',e=>{
 regions=e.detail.regions;
 lastRegion=REGION_OF[e.detail.cities.at(-1)]||'kl';
 applyRegions();
});

const toggle=document.querySelector('#show-all');
function setShowAll(on,save){
 document.body.classList.toggle('show-all',on);
 if(toggle)toggle.setAttribute('aria-pressed',String(on));
 if(save)storeShowAll(on);
 applyRegions();
}
if(toggle){
 toggle.addEventListener('click',()=>setShowAll(!showingAll(),true));
 setShowAll(readStored().showAll===true,false);
}else applyRegions();

// Cards and tables are rendered by script after load; tag them as soon as they appear.
const main=document.querySelector('main');
if(main)new MutationObserver(list=>{
 if(list.every(m=>m.target.closest?.('.toolbar')))return;
 applyRegions();
}).observe(main,{childList:true,subtree:true});

// Folded sections are printed open; the page goes back to its state afterwards.
let reopened=[];
window.addEventListener('beforeprint',()=>{reopened=[...document.querySelectorAll('details.fold')].filter(d=>!d.open);reopened.forEach(d=>{d.open=true;});});
window.addEventListener('afterprint',()=>{reopened.forEach(d=>{d.open=false;});reopened=[];});
