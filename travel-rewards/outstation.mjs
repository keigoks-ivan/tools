import {TRIP_CITIES} from './trip-cities.mjs?v=20261031-3';
import {OUTSTATIONS,outstationPlans} from './outstation-core.mjs?v=20261031-3';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num=value=>new Intl.NumberFormat('zh-TW').format(value);
const STORE='imq-reward-outstation-v1';
const REGIONS=['東北亞','港澳','東南亞','大洋洲','歐洲','北美'];
const CABIN={Y:'經濟艙',C:'商務艙'};
const CHART={own:'自家航班',partner:'聯盟夥伴'};
function load(){try{return JSON.parse(localStorage.getItem(STORE))||{};}catch{return {};}}
function save(value){try{localStorage.setItem(STORE,JSON.stringify(value));}catch{}}

export function mountOutstation(root,{getInventory,data,resourceLabel,today}){
  const saved=load();
  const form={origin:OUTSTATIONS.some(o=>o.id===saved.origin)?saved.origin:'HKG',city:TRIP_CITIES.some(c=>c.id===saved.city)?saved.city:'LON',cabin:saved.cabin==='C'?'C':'Y'};
  const label=id=>resourceLabel(id)||id;
  const cityOf=id=>TRIP_CITIES.find(c=>c.id===id);
  const sourceMap=new Map((data.sources||[]).map(s=>[s.id,s]));

  function fixCity(){
    const blockedCities=new Set([form.origin,...(form.origin==='TYO'?['OSA','SPK','FUK','OKA']:[])]);
    if(blockedCities.has(form.city))form.city='LON';
    return blockedCities;
  }
  function controls(){
    const skip=fixCity();
    const options=REGIONS.map(region=>'<optgroup label="'+region+'">'+TRIP_CITIES.filter(c=>c.region===region&&!skip.has(c.id)).map(c=>'<option value="'+c.id+'" '+(c.id===form.city?'selected':'')+'>'+esc(c.zh)+'</option>').join('')+'</optgroup>').join('');
    return '<form class="trip-form out-form" data-out-form><label><span>外站</span><select name="origin">'+OUTSTATIONS.map(o=>'<option value="'+o.id+'" '+(o.id===form.origin?'selected':'')+'>'+esc(o.zh)+'</option>').join('')+'</select></label>'+
      '<label class="trip-city"><span>目的地</span><select name="city">'+options+'</select></label>'+
      '<fieldset class="trip-seg"><legend>艙等</legend>'+Object.entries(CABIN).map(([k,v])=>'<label><input type="radio" name="cabin" value="'+k+'" '+(form.cabin===k?'checked':'')+'>'+v+'</label>').join('')+'</fieldset></form>';
  }
  // 一張票的四段：停 2 次時最後一段可以另外找時間飛
  function shape(origin,city,stops){
    const leg=(text,kind)=>'<li class="'+kind+'"><b>'+esc(text)+'</b></li>';
    return '<ol class="out-shape">'+leg(origin.zh,'end')+leg('台北・停留','stop')+leg(city.zh,'turn')+leg(stops>=2?'台北・停留':'台北・轉機',stops>=2?'stop':'pass')+leg(origin.zh,'end')+'</ol>';
  }
  function accessLine(a){
    const first=a.routes[0];
    if(a.state==='enough')return ['你的哩程夠','ok'];
    if(a.state==='topup')return ['還差 '+num(a.shortfall)+' 哩，可從'+label(first.from)+'補','warn'];
    if(a.state==='combo')return ['湊 '+a.combo.parts.length+' 家點數就夠','ok'];
    if(a.state==='transfer-enough'){const r=a.routes.find(x=>x.enough)||first;return ['從'+label(r.from)+'轉 '+num(r.input)+' 點就夠','ok'];}
    if(a.state==='have')return [a.balance==null?'你有這種哩程・餘額沒填':'還差 '+num(a.shortfall)+' 哩','warn'];
    if(a.state==='transfer')return ['可從'+label(first.from)+'轉'+(first.sourceBalance!=null?'，點數不夠':'・餘額沒填'),'warn'];
    return ['你手上的點數轉不進這家','neutral'];
  }
  function stopText(p){
    const r=p.rule.stopovers;
    const cost=r.cost_miles?'每次加 '+num(r.cost_miles)+' 點':r.cost_miles===0||/免費/.test(r.cost||'')?'免費':'官網沒寫要不要加哩數';
    return '可停 '+p.stops+' 次，'+cost;
  }
  function sources(ids){
    const list=(ids||[]).map(id=>sourceMap.get(id)).filter(s=>s?.url);
    return list.length?'<p class="out-src">官方來源：'+list.slice(0,3).map(s=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.publisher||s.id)+'</a>').join('、')+'</p>':'';
  }
  function planRow(p,i,origin,city){
    const [pill,tone]=accessLine(p.access);
    const saving=p.saving==null?'<span class="out-save neutral">分開換的價格不全，沒辦法比</span>':p.saving>0?'<span class="out-save ok">省 <b>'+num(p.saving)+'</b> 哩</span>':p.saving===0?'<span class="out-save neutral">跟分開換一樣</span>':'<span class="out-save bad">多 <b>'+num(-p.saving)+'</b> 哩，不划算</span>';
    const sep=p.separate==null?'':'<p class="out-vs">分開換：台北來回'+esc(city.zh)+' '+num(p.leg.miles)+' 哩＋台北來回'+esc(origin.zh)+' '+num(p.visit.miles)+' 哩＝'+num(p.separate)+' 哩</p>';
    const surcharge=p.rule.surcharges?.[form.origin];
    const search=data.awardSearch?.[p.program.id]?.url||p.program.award_search_url;
    return '<article class="out-row"><span class="out-rank">'+String(i+1).padStart(2,'0')+'</span><div class="out-main">'+
      '<h3>'+esc(p.program.name)+'<small>'+CHART[p.rule.chart]+'</small></h3>'+
      '<p class="out-stops">'+esc(stopText(p))+(p.rule.outstation_ok==='limited'?'・有限制':'')+'</p>'+
      '<p class="out-ticket">一張外站票 <b>'+num(p.total)+'</b> 哩<small>每人來回・'+CABIN[form.cabin]+(p.fee?'・含停留費 '+num(p.fee)+' 點':'')+'</small></p>'+sep+
      '<p class="trip-note">'+(p.out.option.repriced?esc(p.out.option.route):'照區域表：'+esc(origin.zh)+'出發到'+esc(city.zh)+'的來回價')+'</p>'+
      (p.estimate?'<p class="trip-note trip-estimate">參考值：依飛行距離自算，或依官網範例推得；訂之前到官網試訂核對。</p>':'')+
      (p.detour>1.45?'<p class="trip-note trip-estimate">經台北比直飛多飛 '+Math.round((p.detour-1)*100)+'%，部分航空會以繞路為由不給訂。</p>':'')+
      '<details class="trip-fees"><summary>這家的規則</summary><p>'+esc(p.rule.outstation_note)+'</p><p>'+esc(p.rule.stopovers.note||'')+'</p>'+(p.rule.origin_restriction?'<p>'+esc(p.rule.origin_restriction)+'</p>':'')+(p.rule.change_fee?'<p>改票、退票：'+esc(p.rule.change_fee)+'</p>':'')+sources(p.rule.source_ids)+'</details>'+
      (surcharge?'<details class="trip-fees"><summary>'+esc(origin.zh)+'出發的稅金與燃油附加費</summary><p>'+esc(surcharge)+'</p></details>':'')+
      '</div><div class="out-side">'+saving+'<span class="op-pill '+tone+'">'+esc(pill)+'</span>'+(search?'<a class="button secondary" href="'+esc(search)+'" target="_blank" rel="noopener">到官網試訂</a>':'')+'</div></article>';
  }
  function render(){
    const origin=OUTSTATIONS.find(o=>o.id===form.origin),city=cityOf(form.city);
    const r=outstationPlans({data,cities:TRIP_CITIES,origin:form.origin,city:form.city,cabin:form.cabin,inventory:getInventory(),today});
    const best=r.plans.find(p=>p.saving>0);
    const lede=best?'同樣是一趟'+esc(city.zh)+'加一趟'+esc(origin.zh)+'，<b>'+r.plans.filter(p=>p.saving>0).length+'</b> 家計畫開外站票比分開換省；最多省 <b>'+num(best.saving)+'</b> 哩（'+esc(best.program.name)+'）。':r.plans.length?'有 '+r.plans.length+' 家計畫排得出外站票，但都沒有比分開換省。':'這條路線目前找不到能排外站票的計畫。';
    const stops2=r.plans.some(p=>p.stops>=2);
    const blocked=r.blocked.filter(b=>!b.nodata),nodata=r.blocked.filter(b=>b.nodata);
    root.querySelector('[data-out-results]').innerHTML=
      '<section class="out-hero"><span class="trip-kicker">'+esc(origin.zh)+'外站・'+esc(city.region)+'・'+CABIN[form.cabin]+'來回</span><h2>'+esc(origin.zh)+'<span>⇄</span>'+esc(city.zh)+'</h2><p class="trip-lede">'+lede+'</p>'+shape(origin,city,stops2?2:1)+'<p class="trip-note">第一段從'+esc(origin.zh)+'回台灣，中間兩段是你要去'+esc(city.zh)+'的那一趟，最後一段回'+esc(origin.zh)+'。准停 2 次的計畫，最後一段可以在效期內另外找時間飛；只准停 1 次的，回程會一路飛到'+esc(origin.zh)+'。</p></section>'+
      '<section class="trip-section"><h2>排得出外站票的計畫</h2><p class="trip-note">依「比分開換省多少」排序。分開換是同一家計畫各換一張台北來回'+esc(city.zh)+'、台北來回'+esc(origin.zh)+'。</p>'+(r.plans.length?r.plans.map((p,i)=>planRow(p,i,origin,city)).join(''):'<p class="trip-empty">沒有計畫排得出這條外站票。</p>')+'</section>'+
      (nodata.length?'<section class="trip-section out-list"><h2>規則准，但哩數要自己查</h2><ul>'+nodata.map(b=>'<li><b>'+esc(b.program.name)+'・'+CHART[b.rule.chart]+'</b><span>'+esc(b.reason)+'</span></li>').join('')+'</ul></section>':'')+
      (blocked.length?'<section class="trip-section out-list"><h2>排不出來的</h2><ul>'+blocked.map(b=>'<li><b>'+esc(b.program.name)+'・'+CHART[b.rule.chart]+'</b><span>'+esc(b.reason)+'</span></li>').join('')+'</ul></section>':'')+
      '<section class="trip-section out-list"><h2>開票前要知道</h2><ul>'+
        '<li><b>第一張票怎麼開始</b><span>第一次要先到'+esc(origin.zh)+'。'+(r.start?'台北飛'+esc(origin.zh)+'單程最少 '+num(r.start.miles)+' 哩（'+esc(r.start.program.name)+'，經濟艙），或直接買現金票。':'可以買現金票過去。')+'之後每張外站票的最後一段，就是下一張的起點。</span></li>'+
        '<li><b>中途有一段沒飛</b><span>航空公司會取消後面所有航段。行程有變要先改票，不能直接跳過。</span></li>'+
        '<li><b>效期</b><span>整張票通常要在開票後一年內飛完，最後一段回'+esc(origin.zh)+'也要算進去。</span></li>'+
        '<li><b>台北停兩次</b><span>去程、回程都停台北，等於同一城市停兩次。長榮、新航、ANA 官網沒寫准不准，訂位前跟航空公司確認。</span></li>'+
        '<li><b>外站要在國外</b><span>長榮規定停留點不能跟起點或終點同一國家，新航不給出發國境內的停留，所以外站要選台灣以外的城市。</span></li>'+
      '</ul><p class="small muted">停留規則查核日 2026-10-31，哩數是官方表最低一級；有沒有位子、要不要加價，以官網為準。</p></section>';
  }
  root.innerHTML='<div class="page-heading"><h1>外站票</h1><p>從外站開一張來回獎勵票，在台北停留，一張票飛兩趟：你要去的地方一趟，外站一趟。這裡比較開外站票和分開換兩張，哪個省哩數。</p></div>'+controls()+'<div data-out-results aria-live="polite"></div>';
  root.addEventListener('change',event=>{
    const f=event.target.closest('[data-out-form]');
    if(!f)return;
    const prev=form.origin;
    form.origin=f.origin.value;form.city=f.city.value;form.cabin=f.cabin.value;
    save({...form});
    if(form.origin!==prev)f.outerHTML=controls();
    render();
  });
  render();
  return {render};
}
