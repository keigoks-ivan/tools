import {TRIP_CITIES} from './trip-cities.mjs?v=20261030-19';
import {flightOptions,hotelOptions,fillTemplate} from './trip-core.mjs?v=20261030-19';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num=value=>new Intl.NumberFormat('zh-TW').format(value);
const STORE='imq-reward-trip-v1';
const REGIONS=['東北亞','港澳','東南亞','大洋洲','歐洲','北美'];
const CABIN={Y:'經濟艙',C:'商務艙'};
const HOTEL_POINTS={
  marriott:'點數價依日期與酒店浮動，到官網看當晚點數。',
  hilton:'點數價依日期與酒店浮動，到官網看當晚點數。',
  ihg:'點數價依品牌、酒店與星期浮動，到官網看當晚點數。',
  hyatt:'固定表：標準房每晚 3,000 點（類別 1 最低一級）到 75,000 點（類別 8 最高一級）；先查這家酒店的類別與當晚等級。',
  all:'1,000 點折抵 20 歐元；官網 1,000 點起用。'
};
function hotelPerk(id,tier,owned){
  if(id==='marriott')return '任何會員：同一訂單 5 晚全點數標準房，免最低點數的那一晚。';
  if(id==='hilton')return ['hh-silver','hh-gold','hh-diamond'].includes(tier)?'你的等級可用：同酒店全點數標準房連住 5 晚以上，第 5 晚免費。':'第 5 晚免費要銀卡以上；一般會員沒有。';
  if(id==='ihg')return owned.has('chase-ihg-select')?'你有 Chase IHG 卡：同酒店全點數標準房連住 4 晚，第 4 晚免費。':'第 4 晚免費要美國 Chase IHG 卡；只有 IHG 白金不算。';
  if(id==='hyatt')return '官方頁面查不到連住優惠，不要套用萬豪或 Hilton 的第五晚規則。';
  return '';
}
// 各飯店網址要的日期格式不同：萬豪 MM/DD/YYYY、IHG 日與「月份減 1 再接年份」、ALL 晚數
export function linkValues({query,checkin,checkout,adults}){
  const parts=value=>value?value.split('-').map(Number):null,ci=parts(checkin),co=parts(checkout);
  const mdy=p=>p?String(p[1]).padStart(2,'0')+'/'+String(p[2]).padStart(2,'0')+'/'+p[0]:'';
  const my=p=>p?String(p[1]-1)+p[0]:'';
  const nights=ci&&co?Math.round((Date.UTC(co[0],co[1]-1,co[2])-Date.UTC(ci[0],ci[1]-1,ci[2]))/86400000):'';
  return {query,checkin:checkin||'',checkout:checkout||'',adults,checkin_mdy:mdy(ci),checkout_mdy:mdy(co),ci_day:ci?String(ci[2]):'',co_day:co?String(co[2]):'',ci_my:my(ci),co_my:my(co),nights:nights>0?String(nights):''};
}
function flightsUrl(to,checkin,checkout){
  const q='Flights from TPE to '+to+(checkin?' on '+checkin:'')+(checkin&&checkout?' through '+checkout:checkin?' oneway':'');
  return 'https://www.google.com/travel/flights?q='+encodeURIComponent(q)+'&curr=TWD&hl=zh-TW';
}
function load(){try{return JSON.parse(localStorage.getItem(STORE))||{};}catch{return {};}}
function save(value){try{localStorage.setItem(STORE,JSON.stringify(value));}catch{}}

export function mountTrip(root,{getInventory,data,hotelPrograms,resourceLabel,today}){
  const saved=load();
  const form={city:TRIP_CITIES.some(c=>c.id===saved.city)?saved.city:'TYO',cabin:saved.cabin==='C'?'C':'Y',trip:saved.trip==='roundtrip'?'roundtrip':'oneway',pax:Math.min(9,Math.max(1,Number(saved.pax)||1)),checkin:'',checkout:''};
  const label=id=>resourceLabel(id)||id;
  const sourceUrl=id=>data.sources.find(item=>item.id===id)?.url;

  function controls(){
    const options=REGIONS.map(region=>'<optgroup label="'+region+'">'+TRIP_CITIES.filter(c=>c.region===region).map(c=>'<option value="'+c.id+'" '+(c.id===form.city?'selected':'')+'>'+esc(c.zh)+'</option>').join('')+'</optgroup>').join('');
    return '<form class="trip-form" data-trip-form><label class="trip-city"><span>目的地</span><select name="city">'+options+'</select></label>'+
      '<label><span>去程</span><input type="date" name="checkin" value="'+form.checkin+'"></label><label><span>回程</span><input type="date" name="checkout" value="'+form.checkout+'"></label>'+
      '<label><span>人數</span><select name="pax">'+[1,2,3,4,5,6].map(n=>'<option '+(n===form.pax?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
      '<fieldset class="trip-seg"><legend>艙等</legend>'+Object.entries(CABIN).map(([k,v])=>'<label><input type="radio" name="cabin" value="'+k+'" '+(form.cabin===k?'checked':'')+'>'+v+'</label>').join('')+'</fieldset>'+
      '<fieldset class="trip-seg"><legend>行程</legend><label><input type="radio" name="trip" value="oneway" '+(form.trip==='oneway'?'checked':'')+'>單程</label><label><input type="radio" name="trip" value="roundtrip" '+(form.trip==='roundtrip'?'checked':'')+'>來回</label></fieldset></form>';
  }
  function flightPill(item){
    const first=item.routes[0];
    if(item.state==='enough')return ['哩程夠了','ok'];
    if(item.state==='topup')return ['還差 '+num(item.shortfall)+' 哩，可從'+label(first.from)+'補','warn'];
    if(item.state==='transfer-enough')return ['可從'+label(item.routes.find(r=>r.enough)?.from||first.from)+'轉，點數夠','ok'];
    if(item.state==='have')return [item.balance==null?'你有這種哩程・餘額沒填':item.shortfall==null?'你有 '+num(item.balance)+' 哩':'還差 '+num(item.shortfall)+' 哩','warn'];
    if(item.state==='transfer')return ['可從'+label(first.from)+'轉'+(!item.need?'':first.sourceBalance!=null?'，點數不夠':'・餘額沒填'),'warn'];
    return ['你目前沒有入口','neutral'];
  }
  function flightCard(item,city){
    const [pill,tone]=flightPill(item),p=item.program,n=item.need,e=n?.option||item.entry;
    const per=n?(n.roundtripOnly?'每人來回 ':'每人單程 ')+num(n.each)+' 哩':p.no_chart_note?'官方沒有公布標準表':'這個艙等沒有固定表';
    const total=n&&(form.pax>1||form.trip==='roundtrip'||n.roundtripOnly)?'<span class="trip-total">共 '+num(n.total)+' 哩</span>':'';
    const routes=item.routes.filter(r=>r.input).map(r=>'<li>從'+esc(label(r.from))+'轉 '+num(r.input)+' 點 → '+num(r.output)+' 哩'+(r.sourceBalance!=null?'（你有 '+num(r.sourceBalance)+'）':'')+(r.timing?'・'+esc(r.timing):'')+'</li>').join('');
    const search=data.awardSearch[p.id]?.url||p.award_search_url,login=data.awardSearch[p.id]?.login_required;
    const flights=flightsUrl(city.airports[0],form.checkin,form.checkout);
    return '<article class="trip-card '+tone+'"><span class="op-pill '+tone+'">'+esc(pill)+'</span><h3>'+esc(p.name)+'</h3><p class="trip-route">'+esc(e.route||'')+'</p><p class="trip-miles"><b>'+esc(per)+'</b>'+total+(n?'<small>'+CABIN[form.cabin]+'・官方表最低一級</small>':'')+'</p>'+(routes?'<ul class="trip-transfers">'+routes+'</ul>':'')+(n?.alts?.length?'<p class="trip-note">另一條路線：'+n.alts.map(alt=>esc(alt.option.route||'')+'，每人 '+num(alt.each)+' 哩').join('；')+'</p>':'')+(!n&&p.no_chart_note?'<p class="trip-note">'+esc(p.no_chart_note)+'</p>':'')+(e.estimate?'<p class="trip-note trip-estimate">參考值：官方表依整趟飛行距離計價，距離是本站按航段估算；訂之前登入官網核對。</p>':'')+(e.note?'<details class="trip-fees"><summary>這條路線的細節</summary><p>'+esc(e.note)+'</p></details>':'')+(p.fees_note?'<details class="trip-fees"><summary>稅金與燃油附加費</summary><p>'+esc(p.fees_note)+'</p></details>':'')+'<div class="trip-actions">'+(search?'<a class="button secondary" href="'+esc(search)+'" target="_blank" rel="noopener">到官網查位子'+(login?'（要登入）':'')+'</a>':'')+(flights?'<a class="text-button" href="'+esc(flights)+'" target="_blank" rel="noopener">看誰飛這條航線</a>':'')+'</div></article>';
  }
  function hotelCard(item,city){
    const p=item.program,link=data.hotelLinks[p.id];
    const url=link?.template?fillTemplate(link.template,linkValues({query:city.query,checkin:form.checkin,checkout:form.checkout,adults:String(form.pax)})):null;
    const pill=item.state==='points'?(item.balance!=null?'你有 '+num(item.balance)+' 點':'你有點數・餘額沒填'):item.state==='member'?'你是'+label(item.tier):item.state==='transfer'?'可從'+label(item.routes[0].from)+'轉入':'你目前沒有入口';
    const tone=item.state==='none'?'neutral':item.state==='transfer'?'warn':'ok';
    const perk=hotelPerk(p.id,item.tier,new Set(getInventory().resources||[]));
    const checked=p.id==='hyatt'?(data.hyattCheck||[]).filter(row=>row.read&&!row.has_hyatt).length:0;
    return '<article class="trip-card '+tone+'"><span class="op-pill '+tone+'">'+esc(pill)+'</span><h3>'+esc(p.name)+'</h3><p class="trip-note">'+esc(HOTEL_POINTS[p.id]||'')+'</p>'+(perk?'<p class="trip-route">'+esc(perk)+'</p>':'')+(checked?'<p class="trip-note">台灣銀行點數轉不進 Hyatt：運通、星展、國泰世華，以及另外 '+checked+' 家銀行的官方兌換頁都沒有 Hyatt。</p>':'')+'<div class="trip-actions">'+(url?'<a class="button secondary" href="'+esc(url)+'" target="_blank" rel="noopener">用點數搜尋'+esc(city.zh)+'</a>':'')+(link&&!link.points_preset?'<small class="muted">打開後要登入，再切換「用點數」。</small>':link&&link.results_verified===false?'<small class="muted">若沒看到點數價，在結果頁勾選「使用點數」。</small>':'')+'</div></article>';
  }
  function render(){
    const inv=getInventory(),owned=new Set(inv.resources||[]),city=TRIP_CITIES.find(c=>c.id===form.city);
    const flights=flightOptions({awards:data.awards,transfers:data.transfers,inventory:inv,city:form.city,cabin:form.cabin,pax:form.pax,trip:form.trip,today});
    const hotels=hotelOptions({programs:hotelPrograms,transfers:data.transfers,inventory:inv,today});
    const usable=flights.filter(item=>item.state!=='none'),other=flights.filter(item=>item.state==='none');
    const nonstop=data.routes[form.city]?.nonstop||{},carriers=[...new Set(Object.values(nonstop).flat())].map(code=>data.carriers[code]?.zh||code);
    const dynamic=data.dynamic.filter(item=>owned.has(item.id));
    const empty=!owned.size?'<div class="trip-empty"><p>還沒選你手上的卡和點數，下面只列各計畫要多少哩。選完會告訴你夠不夠、差多少要從哪裡轉。</p><button type="button" class="button" data-start-setup>選我手上的卡</button></div>':'';
    root.querySelector('[data-trip-results]').innerHTML=empty+
      '<section class="trip-section"><h2>機票・台北到'+esc(city.zh)+'</h2>'+(carriers.length?'<p class="small muted">桃園直飛：'+esc(carriers.join('、'))+'</p>':'')+
      (usable.length?'<div class="trip-grid">'+usable.map(item=>flightCard(item,city)).join('')+'</div>':owned.size?'<div class="empty">你手上的哩程和點數，在這條航線還沒有接得上的計畫。下面是其他計畫要多少哩。</div>':'')+
      (other.length?(owned.size?'<details class="plan-other"><summary><b>其他計畫（'+other.length+'）</b><small>你目前沒有這些哩程，也沒有能轉過去的點數</small></summary><div class="trip-grid">'+other.map(item=>flightCard(item,city)).join('')+'</div></details>':'<div class="trip-grid">'+other.map(item=>flightCard(item,city)).join('')+'</div>'):'')+
      (dynamic.length?'<p class="trip-note">'+esc(dynamic.map(item=>item.name).join('、'))+' 是浮動價，沒有固定表，到官網查。</p>':'')+'<details class="trip-fees"><summary>哪些計畫沒列出來</summary><p>聯航 MileagePlus、Flying Blue 是浮動價，沒有固定表。卡達 Avios 官方計算器查不到台灣出發的數字；國泰亞洲萬里通要登入才看得到哩數。日航只列官方表上有的直飛城市與夥伴表，經東京轉往歐美沒有官方連程價。英航 Avios 只查到經香港到倫敦。各計畫的稅金與燃油附加費只查到下限，訂票時另付。</p></details></section>'+
      '<section class="trip-section"><h2>飯店・'+esc(city.zh)+'</h2><div class="trip-grid">'+hotels.map(item=>hotelCard(item,city)).join('')+'</div></section>'+
      '<section class="trip-section trip-next"><p>在官網看到點數價和同日期的現金價，可以算一點值多少錢，划不划算。</p><button type="button" class="button secondary" data-open-calc>試算值不值得</button><p class="small muted">哩程數字是官方獎勵表的最低一級，查核日 '+esc(data.checked_on)+'；有沒有位子、要不要加價，以官網為準。</p></section>';
  }
  root.innerHTML='<div class="page-heading"><h1>出去玩</h1><p>選目的地，看你手上的哩程和點數能怎麼用，再到官網查位子和房間。</p></div>'+controls()+'<div data-trip-results aria-live="polite"></div>';
  root.querySelector('[data-trip-form]').addEventListener('change',event=>{
    const f=event.currentTarget;
    form.city=f.city.value;form.pax=Number(f.pax.value);form.cabin=f.cabin.value;form.trip=f.trip.value;form.checkin=f.checkin.value;form.checkout=f.checkout.value;
    if(form.checkout&&form.trip==='oneway'){form.trip='roundtrip';f.querySelector('[name=trip][value=roundtrip]').checked=true;}
    save({city:form.city,cabin:form.cabin,trip:form.trip,pax:form.pax});render();
  });
  render();
  return {render};
}
