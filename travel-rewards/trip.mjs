import {TRIP_CITIES} from './trip-cities.mjs?v=20261031-4';
import {flightOptions,hotelOptions,fillTemplate,cashValue,findCashFee,cashFeeTotals,valueTier,earliestBooking,referencePointCents,hyattNightPoints,tripTotals,HOTEL_ACCESS} from './trip-core.mjs?v=20261031-4';
import {IH_RULES} from './ihg-hyatt-data.mjs?v=20261031-4';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num=value=>new Intl.NumberFormat('zh-TW').format(value);
const STORE='imq-reward-trip-v1';
const REGIONS=['東北亞','港澳','東南亞','大洋洲','歐洲','北美'];
const CABIN={Y:'經濟艙',C:'商務艙'};
const DEFAULT_COST=0.25;
// Hyatt 標準房每晚點數：類別 1–8 × 五級；2026-05 起五級取代舊的三級
const HYATT_TABLE=IH_RULES.find(rule=>rule.id==='R109')?.values?.standard_room_points_per_night||null;
const HYATT_LEVELS=['最低','低','中','高','最高'];
// 萬豪、希爾頓、IHG 的點數參考估值（0.1 美分為單位）；Hyatt、ALL 沒有同來源的數字，不列
const HOTEL_REFERENCE={marriott:7,hilton:5,ihg:5};
const REFERENCE_SOURCE='參考：Upgraded Points 2026-10、One Mile at a Time';
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
  const form={city:TRIP_CITIES.some(c=>c.id===saved.city)?saved.city:'TYO',cabin:saved.cabin==='C'?'C':'Y',trip:saved.trip==='roundtrip'?'roundtrip':'oneway',pax:Math.min(9,Math.max(1,Number(saved.pax)||1)),cash:0,tax:{},checkin:'',checkout:'',cost:'cost' in saved?(saved.cost==null?null:Math.max(0,Number(saved.cost)||0)):DEFAULT_COST,nights:Math.min(60,Math.max(0,Math.round(Number(saved.nights)||0))),hotelIn:{},pick:{flight:null,hotel:null}};
  const label=id=>resourceLabel(id)||id;
  const sourceUrl=id=>data.sources.find(item=>item.id===id)?.url;

  function controls(){
    const options=REGIONS.map(region=>'<optgroup label="'+region+'">'+TRIP_CITIES.filter(c=>c.region===region).map(c=>'<option value="'+c.id+'" '+(c.id===form.city?'selected':'')+'>'+esc(c.zh)+'</option>').join('')+'</optgroup>').join('');
    return '<form class="trip-form" data-trip-form><label class="trip-city"><span>目的地</span><select name="city">'+options+'</select></label>'+
      '<label><span>去程</span><input type="date" name="checkin" value="'+form.checkin+'"></label><label><span>回程</span><input type="date" name="checkout" value="'+form.checkout+'"></label>'+
      '<label><span>人數</span><select name="pax">'+[1,2,3,4,5,6].map(n=>'<option '+(n===form.pax?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
      '<fieldset class="trip-seg"><legend>艙等</legend>'+Object.entries(CABIN).map(([k,v])=>'<label><input type="radio" name="cabin" value="'+k+'" '+(form.cabin===k?'checked':'')+'>'+v+'</label>').join('')+'</fieldset>'+
      '<label class="trip-cash"><span>同日期現金票價（每人，NT$，選填）</span><input type="number" inputmode="numeric" min="0" step="100" name="cash" value="'+(form.cash||'')+'" placeholder="填了會算每哩值多少"></label>'+
      '<fieldset class="trip-seg"><legend>行程</legend><label><input type="radio" name="trip" value="oneway" '+(form.trip==='oneway'?'checked':'')+'>單程</label><label><input type="radio" name="trip" value="roundtrip" '+(form.trip==='roundtrip'?'checked':'')+'>來回</label></fieldset>'+
      '<label class="trip-cost"><span>你取得 1 哩的成本（NT$）</span><input type="number" inputmode="decimal" min="0" step="0.01" name="cost" value="'+(form.cost==null?'':form.cost)+'"><small>例如刷卡拿 1% 現金回饋，約 NT$25 換 1 哩，每哩成本約 NT$0.25。</small></label></form>';
  }
  function flightPill(item){
    const first=item.routes[0];
    if(item.state==='enough')return ['哩程夠了','ok'];
    if(item.state==='topup')return ['還差 '+num(item.shortfall)+' 哩，可從'+label(first.from)+'補','warn'];
    if(item.state==='combo')return ['湊 '+item.combo.parts.length+' 家點數就夠','ok'];
    if(item.state==='transfer-enough')return ['可從'+label(item.routes.find(r=>r.enough)?.from||first.from)+'轉，點數夠','ok'];
    if(item.state==='have')return [item.balance==null?'你有這種哩程・餘額沒填':item.shortfall==null?'你有 '+num(item.balance)+' 哩':'還差 '+num(item.shortfall)+' 哩','warn'];
    if(item.state==='transfer')return ['可從'+label(first.from)+'轉'+(!item.need?'':first.sourceBalance!=null?'，點數不夠':'・餘額沒填'),'warn'];
    return ['你目前沒有入口','neutral'];
  }
  const cityOf=()=>TRIP_CITIES.find(c=>c.id===form.city);
  // 這張卡實際採用的表別（自家 own／夥伴 partner）；沒有固定表的計畫沒有表別
  const chartOf=item=>(item.need?.option||item.entry?.options?.[0]||{}).chart;
  // 每人單程稅費 → 這張票的稅費；對不到表別就退回同計畫同區域任一筆
  function feeOf(item){
    const found=findCashFee(data.cashFees||[],{program:item.program.id,region:cityOf().region,cabin:form.cabin,chart:chartOf(item)});
    if(!found)return null;
    const totals=cashFeeTotals(found.amount,{trip:form.trip,roundtripOnly:!!item.need?.roundtripOnly,pax:form.pax});
    return {...found,totals};
  }
  // 使用者沒改過稅費欄時，預設帶參考稅費（每人整張票）
  const taxPerPerson=item=>form.tax[item.program.id]!==undefined?form.tax[item.program.id]:(feeOf(item)?.totals?.perPerson||0);
  // 使用者填了現金票價：算每一哩值多少；來回表配單程現金價不能比
  function valueOf(item){
    const n=item.need;
    if(!form.cash||!n||(n.roundtripOnly&&form.trip==='oneway'))return null;
    return cashValue(form.cash*form.pax,taxPerPerson(item)*form.pax,n.total);
  }
  function valueText(item){
    const value=valueOf(item),tier=valueTier(value,form.cost),user=form.tax[item.program.id]!==undefined,ref=feeOf(item)?.totals;
    const note=user?'':ref?'<small>已扣參考稅費 NT$'+num(ref.perPerson)+'（每人）</small>':'<small>還沒扣這張獎勵票的稅金與附加費</small>';
    return '<b>每哩約值 NT$'+value.toFixed(2)+'</b>'+(tier?'<span class="trip-tag '+tier.tier+'">'+tier.text+'</span>':'')+note;
  }
  function feeLine(item){
    const fee=feeOf(item),n=item.need;
    if(!fee||fee.amount==null)return '<p class="trip-fee none">稅金與附加費：官網沒有金額</p>';
    const scope=(form.pax>1?form.pax+' 人':'')+(fee.totals.legs===2?'來回':'');
    return '<p class="trip-fee">'+(n?'＋':'')+'稅金與附加費約 <b>NT$'+num(fee.totals.total)+'</b>（參考值'+(scope?'・'+scope:'')+'）</p>';
  }
  // 開放兌換日：只在填了去程日期時顯示
  function bookingLine(item){
    if(!form.checkin)return '';
    const rule=(data.bookingRules||[]).find(row=>row.program===item.program.id);
    if(!rule)return '';
    const r=earliestBooking({depart:form.checkin,chart:chartOf(item),window:rule.booking_window,today});
    if(!r)return '';
    const text=r.kind==='date'?'最早 '+r.date+' 開放兌換（出發前 '+r.days+' 天）':r.kind==='open'?'已開放（出發前 '+r.days+' 天）':r.kind==='partner-later'?'夥伴航班依夥伴航空開放，可能更晚':'開放天數官網未公布';
    return '<p class="trip-book'+(r.kind==='date'||r.kind==='open'?'':' none')+'">'+esc(text)+'</p>';
  }
  const triState=value=>value===true?'可以':value===false?'不行':'官網沒寫';
  function familyDetails(item){
    const rule=(data.bookingRules||[]).find(row=>row.program===item.program.id);
    if(!rule)return '';
    const f=rule.family||{},r=f.redeem_for_others||{},pool=f.pooling||{};
    const nominee=r.nominee_required===true?'要先登錄受益人'+(r.nominee_limit?'，名額 '+r.nominee_limit+' 人':''):r.nominee_required===false?'不用事先登錄受益人':'要不要登錄受益人，官網沒寫';
    const poolText=triState(pool.available)+(pool.name?'：'+pool.name:'')+(pool.members?'，最多 '+pool.members+' 人':'')+(pool.fee?'，'+pool.fee:'');
    const rows=[['替別人換票',triState(r.allowed)+(r.relation?'。'+r.relation:'')],['受益人',nominee+(r.change_rule?'。'+r.change_rule:'')],['合併家人哩程',poolText+(pool.note?'。'+pool.note:'')],['哩程轉讓',f.transfer||'官網沒寫']];
    return '<details class="trip-fees trip-family"><summary>幫家人換票</summary><dl>'+rows.map(([k,v])=>'<dt>'+k+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>'+(rule.needs_check?'<p class="trip-note">這條來自搜尋摘要，官網原文待核對。</p>':'')+'</details>';
  }
  // 改稅金時只更新數字與排列順序（CSS order），不重畫卡片，輸入框才不會失焦
  let shown=[],picked={flight:null,hotel:null},ctx={flights:[],hotels:[],city:null};
  function updateValues(){
    const ranked=[...shown].sort((a,b)=>(valueOf(b)??-1)-(valueOf(a)??-1));
    for(const item of shown){
      const card=root.querySelector('[data-card="'+item.program.id+'"]');
      if(!card)continue;
      card.style.order=String(ranked.indexOf(item));
      const line=card.querySelector('.trip-value p');
      if(line&&valueOf(item)!=null)line.innerHTML=valueText(item);
    }
    updateTotals();
  }
  function cashLine(item){
    const n=item.need;
    if(!form.cash||!n)return '';
    if(n.roundtripOnly&&form.trip==='oneway')return '<p class="trip-note">這張表是來回價，跟單程現金價不能直接比。</p>';
    const tax=form.tax[item.program.id]!==undefined?form.tax[item.program.id]:'',ref=feeOf(item)?.totals?.perPerson;
    return '<div class="trip-value"><p>'+valueText(item)+'</p><label><span>這張獎勵票要付的稅金與附加費（每人，NT$）</span><input type="number" inputmode="numeric" min="0" step="100" data-tax="'+esc(item.program.id)+'" value="'+tax+'"'+(ref?' placeholder="參考值 '+num(ref)+'"':'')+'></label></div>';
  }
  function feesDetails(item){
    const fee=feeOf(item),p=item.program;
    if(!p.fees_note&&!fee)return '';
    const fx=data.cashFx;
    const extra=fee?'<p>'+(fee.amount==null?'官網沒有這張表的稅費金額。':'每人單程約 NT$'+num(fee.amount)+'（參考值）。')+esc(fee.row.note||'')+(fee.fallback?' 這張表別沒有單獨的金額，這裡用同計畫同區域的另一張表代替。':'')+'</p>'+(fx?'<p class="trip-note">資料日 '+esc(fx.checked_on)+'；匯率取臺灣銀行 '+esc(String(fx.date).slice(0,16))+' 牌價。</p>':''):'';
    return '<details class="trip-fees"><summary>稅金與燃油附加費</summary>'+(p.fees_note?'<p>'+esc(p.fees_note)+'</p>':'')+extra+'</details>';
  }
  const pickButton=(kind,id)=>'<button type="button" class="text-button trip-pick" data-pick-'+kind+'="'+esc(id)+'" aria-pressed="'+(picked[kind]===id)+'">'+(picked[kind]===id?'已排進整趟':'排進整趟')+'</button>';
  function flightCard(item,city){
    const [pill,tone]=flightPill(item),p=item.program,n=item.need,e=n?.option||item.entry;
    const per=n?(n.roundtripOnly?'每人來回 ':'每人單程 ')+num(n.each)+' 哩':p.no_chart_note?'官方沒有公布標準表':'這個艙等沒有固定表';
    const total=n&&(form.pax>1||form.trip==='roundtrip'||n.roundtripOnly)?'<span class="trip-total">共 '+num(n.total)+' 哩</span>':'';
    const comboLines=item.combo?'<li class="trip-combo-head">'+(item.combo.left?'全部湊起來還差 '+num(item.combo.left)+' 哩：':'幾家合起來轉：')+'</li>'+item.combo.parts.map(r=>'<li>從'+esc(label(r.from))+'轉 '+num(r.input)+' 點 → '+num(r.output)+' 哩（你有 '+num(r.sourceBalance)+'）'+(r.timing?'・'+esc(r.timing):'')+'</li>').join(''):'';
    const routes=item.state==='combo'?comboLines:item.routes.filter(r=>r.input).map(r=>'<li>從'+esc(label(r.from))+'轉 '+num(r.input)+' 點 → '+num(r.output)+' 哩'+(r.sourceBalance!=null?'（你有 '+num(r.sourceBalance)+'）':'')+(r.timing?'・'+esc(r.timing):'')+'</li>').join('')+comboLines;
    const value=cashLine(item);
    const search=data.awardSearch[p.id]?.url||p.award_search_url,login=data.awardSearch[p.id]?.login_required;
    const flights=flightsUrl(city.airports[0],form.checkin,form.checkout);
    return '<article class="trip-card '+tone+(picked.flight===p.id?' picked':'')+'" data-card="'+esc(p.id)+'"><span class="op-pill '+tone+'">'+esc(pill)+'</span><h3>'+esc(p.name)+'</h3><p class="trip-route">'+esc(e.route||'')+'</p><p class="trip-miles"><b>'+esc(per)+'</b>'+total+(n?'<small>'+CABIN[form.cabin]+'・官方表最低一級</small>':'')+'</p>'+feeLine(item)+bookingLine(item)+(routes?'<ul class="trip-transfers">'+routes+'</ul>':'')+value+(n?.alts?.length?'<details class="trip-paths"><summary>還有 '+n.alts.length+' 種走法</summary><ol>'+n.alts.map(alt=>'<li><span>'+esc(alt.option.route||'')+(alt.option.stops!=null?'・'+(alt.option.stops?'轉機 '+alt.option.stops+' 次':'直飛'):'')+(alt.option.estimate?'・參考值':'')+'</span><b>'+(alt.option.roundtrip_only?'來回 ':'')+num(alt.each)+' 哩</b></li>').join('')+'</ol></details>':'')+(!n&&p.no_chart_note?'<p class="trip-note">'+esc(p.no_chart_note)+'</p>':'')+(e.estimate?'<p class="trip-note trip-estimate">參考值：這個數字不是官方表直接寫的，是依飛行距離自算，或依官網範例推得；訂之前登入官網核對。</p>':'')+(e.note?'<details class="trip-fees"><summary>這條路線的細節</summary><p>'+esc(e.note)+'</p></details>':'')+feesDetails(item)+familyDetails(item)+'<div class="trip-actions">'+(n?pickButton('flight',p.id):'')+(search?'<a class="button secondary" href="'+esc(search)+'" target="_blank" rel="noopener">到官網查位子'+(login?'（要登入）':'')+'</a>':'')+(flights?'<a class="text-button" href="'+esc(flights)+'" target="_blank" rel="noopener">看誰飛這條航線</a>':'')+'</div></article>';
  }
  // 手上的卡自帶、出去玩用得到的權益（升等券、住宿優惠、續卡贈哩）
  // 目的地照片署名：img/cities/credits.json，讀不到就不顯示照片
  let credits=null;
  fetch(new URL('./img/cities/credits.json?v=20261031-4',import.meta.url)).then(r=>r.ok?r.json():{}).then(json=>{credits=json;render();}).catch(()=>{credits={};});
  function hero(city,flights){
    const usable=flights.filter(item=>item.state!=='none'&&item.need),min=flights.filter(item=>item.need).sort((a,b)=>a.need.each-b.need.each)[0];
    const lede=usable.length?'你手上的哩程和點數，接得上 <b>'+usable.length+'</b> 家計畫；最少的一張要 <b>'+num(usable.sort((a,b)=>a.need.each-b.need.each)[0].need.each)+'</b> 哩。':min?'各家最少要 <b>'+num(min.need.each)+'</b> 哩。選了你手上的卡和點數，會告訴你夠不夠。':'這條航線目前查不到固定的獎勵表。';
    const c=credits?.[city.id],src=new URL('./img/cities/'+city.id+'-1600.webp',import.meta.url).href,small=new URL('./img/cities/'+city.id+'-800.webp',import.meta.url).href;
    const photo=c?'<figure class="trip-photo"><div class="ph"><img src="'+small+'" srcset="'+small+' 800w, '+src+' 1600w" sizes="(max-width:760px) 100vw, 58vw" alt="'+esc(city.zh)+'" loading="lazy"></div><figcaption>照片：'+esc(c.author||'')+'・<a href="'+esc(c.license_url||c.file_page||'')+'" target="_blank" rel="noopener">'+esc(c.license||'')+'</a>・<a href="'+esc(c.file_page||'')+'" target="_blank" rel="noopener">Wikimedia Commons</a>・已裁切</figcaption></figure>':'';
    return '<section class="trip-hero'+(photo?'':' no-photo')+'"><div class="trip-hero-text"><span class="trip-kicker">台北出發・'+esc(city.region)+'・'+CABIN[form.cabin]+(form.trip==='roundtrip'?'來回':'單程')+'</span><h2>'+esc(city.zh)+'</h2><p class="trip-lede">'+lede+'</p></div>'+photo+'</section>';
  }
  function perksSection(owned){
    const rows=(data.perks||[]).filter(x=>owned.has(x.card));
    if(!rows.length)return '';
    const kind={upgrade:'升等券',companion:'住宿優惠',free_night:'免費住宿',award_ticket:'機票兌換券',bonus_points:'續卡贈點'};
    return '<section class="trip-section trip-perks"><h2>你的卡自帶的</h2><ul>'+rows.map(x=>'<li><span class="trip-perk-kind">'+esc(kind[x.kind]||'')+'</span><div><b>'+esc(label(x.card))+'</b>'+(x.count&&x.unit?'：'+num(x.count)+' '+esc(x.unit):'')+'<p>'+esc(x.use||'')+'</p><small>'+esc([x.how,x.valid].filter(Boolean).join('・'))+'</small></div></li>').join('')+'</ul></section>';
  }
  const dateNights=()=>Number(linkValues({query:'',checkin:form.checkin,checkout:form.checkout,adults:'1'}).nights)||0;
  const effNights=()=>form.nights||dateNights();
  // 每晚點數：Hyatt 依固定表（類別 × 等級），其他計畫由使用者填官網看到的點數
  function nightPoints(id){
    const inp=form.hotelIn[id]||{};
    if(id==='hyatt'&&HYATT_TABLE)return inp.cat?hyattNightPoints(HYATT_TABLE,inp.cat,Number(inp.level??2)):null;
    const value=Math.round(Number(inp.perNight)||0);
    return value>0?value:null;
  }
  function hotelCalc(p){
    const per=nightPoints(p.id),nights=effNights(),cash=Number(form.hotelIn[p.id]?.cash)||0,lines=[];
    if(per&&nights)lines.push('<p class="trip-hotel-total">總點數 <b>'+num(per*nights)+' 點</b><small>每晚 '+num(per)+' × '+nights+' 晚</small></p>');
    else lines.push('<p class="trip-note">'+(per?'再填住幾晚，會算總點數。':(p.id==='hyatt'&&HYATT_TABLE?'選好類別與等級':'填好每晚點數')+'，再填住幾晚，會算總點數。')+'</p>');
    if(per&&cash>0)lines.push('<p class="trip-hotel-total">每點值約 <b>NT$'+(cash/per).toFixed(2)+'</b><small>現金房價每晚 NT$'+num(cash)+' ÷ '+num(per)+' 點</small></p>');
    const ref=HOTEL_REFERENCE[p.id]!=null?referencePointCents(HOTEL_REFERENCE[p.id],data.cashFx?.rates?.USD):null;
    if(ref!=null)lines.push('<p class="trip-note">參考估值：每點約 NT$'+(ref/100).toFixed(2)+'（'+(HOTEL_REFERENCE[p.id]/10)+' 美分）。'+REFERENCE_SOURCE+'</p>');
    return lines.join('');
  }
  function hotelInputs(p){
    const inp=form.hotelIn[p.id]||{};
    const points=p.id==='hyatt'&&HYATT_TABLE?
      '<label><span>類別</span><select data-hotel-cat><option value="">選類別</option>'+[1,2,3,4,5,6,7,8].map(n=>'<option value="'+n+'" '+(String(inp.cat)===String(n)?'selected':'')+'>類別 '+n+'</option>').join('')+'</select></label>'+
      '<label><span>等級</span><select data-hotel-level>'+HYATT_LEVELS.map((name,i)=>'<option value="'+i+'" '+(Number(inp.level??2)===i?'selected':'')+'>'+name+'</option>').join('')+'</select></label>':
      '<label><span>每晚點數</span><input type="number" inputmode="numeric" min="0" step="500" data-hotel-field="perNight" data-hotel-id="'+esc(p.id)+'" value="'+(inp.perNight||'')+'" placeholder="官網看到的點數"></label>';
    return '<div class="trip-hotel-in">'+points+'<label><span>同日期現金房價（每晚，NT$，選填）</span><input type="number" inputmode="numeric" min="0" step="100" data-hotel-field="cash" data-hotel-id="'+esc(p.id)+'" value="'+(inp.cash||'')+'"></label></div>';
  }
  function hotelCard(item,city){
    const p=item.program,link=data.hotelLinks[p.id];
    const url=link?.template?fillTemplate(link.template,linkValues({query:city.query,checkin:form.checkin,checkout:form.checkout,adults:String(form.pax)})):null;
    const pill=item.state==='points'?(item.balance!=null?'你有 '+num(item.balance)+' 點':'你有點數・餘額沒填'):item.state==='member'?'你是'+label(item.tier):item.state==='transfer'?'可從'+label(item.routes[0].from)+'轉入':'你目前沒有入口';
    const tone=item.state==='none'?'neutral':item.state==='transfer'?'warn':'ok';
    const perk=hotelPerk(p.id,item.tier,new Set(getInventory().resources||[]));
    const checked=p.id==='hyatt'?(data.hyattCheck||[]).filter(row=>row.read&&!row.has_hyatt).length:0;
    return '<article class="trip-card '+tone+(picked.hotel===p.id?' picked':'')+'" data-hotel-card="'+esc(p.id)+'"><span class="op-pill '+tone+'">'+esc(pill)+'</span><h3>'+esc(p.name)+'</h3><p class="trip-note">'+esc(HOTEL_POINTS[p.id]||'')+'</p>'+(perk?'<p class="trip-route">'+esc(perk)+'</p>':'')+(checked?'<p class="trip-note">台灣銀行點數轉不進 Hyatt：運通、星展、國泰世華，以及另外 '+checked+' 家銀行的官方兌換頁都沒有 Hyatt。</p>':'')+hotelInputs(p)+'<div data-hotel-calc="'+esc(p.id)+'" class="trip-hotel-calc">'+hotelCalc(p)+'</div><div class="trip-actions">'+pickButton('hotel',p.id)+(url?'<a class="button secondary" href="'+esc(url)+'" target="_blank" rel="noopener">用點數搜尋'+esc(city.zh)+'</a>':'')+(link&&!link.points_preset?'<small class="muted">打開後要登入，再切換「用點數」。</small>':link&&link.results_verified===false?'<small class="muted">若沒看到點數價，在結果頁勾選「使用點數」。</small>':'')+'</div></article>';
  }
  // 整趟：機票哩數加飯店點數，銀行點數合併扣
  function resolvePicks(){
    const f=ctx.flights.filter(i=>i.need);
    const flight=f.find(i=>i.program.id===form.pick.flight)||f.find(i=>i.state!=='none')||null;
    const hotel=ctx.hotels.find(h=>h.program.id===form.pick.hotel)||ctx.hotels.find(h=>h.hasPoints||h.routes.length)||null;
    picked={flight:flight?.program.id||null,hotel:hotel?.program.id||null};
  }
  function sumHtml(){
    const fl=ctx.flights.find(i=>i.program.id===picked.flight),hl=ctx.hotels.find(h=>h.program.id===picked.hotel);
    const inv=getInventory(),reqs=[];
    if(fl?.need)reqs.push({key:'flight',label:'機票・'+fl.program.name,unit:'哩',target:fl.program.id,need:fl.need.total,own:fl.balance||0});
    const per=hl?nightPoints(hl.program.id):null,nights=effNights(),pointsId=hl?HOTEL_ACCESS[hl.program.id]?.points:null;
    if(hl&&per&&nights&&pointsId)reqs.push({key:'hotel',label:'飯店・'+hl.program.name,unit:'點',target:pointsId,need:per*nights,own:hl.hasPoints?(hl.balance||0):0});
    const head='<h2>整趟要多少點</h2>';
    if(!reqs.length)return head+'<p class="trip-note">在上面的機票卡按「排進整趟」，再在飯店卡填每晚點數、在飯店區填住幾晚，這裡會算整趟要多少點、要從哪家銀行轉多少。</p>';
    const result=tripTotals({reqs,transfers:data.transfers,owned:new Set(inv.resources||[]),balances:inv.balances||{},today});
    const chosen='<p class="small muted">已排進整趟：'+(fl?'機票 '+esc(fl.program.name):'')+(fl&&hl?'・':'')+(hl?'飯店 '+esc(hl.program.name):'')+(hl&&!reqs.some(r=>r.key==='hotel')?'（填好每晚點數與住幾晚才會一起算）':'')+'</p>';
    const rows=result.items.map(item=>{
      const parts=item.parts.map(part=>'<li>從'+esc(label(part.from))+'轉 '+num(part.input)+' 點 → '+num(part.output)+' '+item.unit+(part.timing?'・'+esc(part.timing):'')+'</li>').join('');
      const own=item.ownUsed?'，帳戶已有 '+num(item.ownUsed)+(item.shortfall?'，還要 '+num(item.shortfall):''):'';
      const gap=item.left>0?'<p class="trip-warn">還差 '+num(item.left)+' '+item.unit+'。'+(item.suggest.length?item.suggest.slice(0,2).map(s=>'可從'+esc(label(s.from))+'補：轉 '+num(s.input)+' 點'+(s.remaining==null?'（餘額沒填）':s.gap>0?'（你剩 '+num(s.remaining)+'，再差 '+num(s.gap)+' 點）':'（你剩 '+num(s.remaining)+'）')).join('；'):'手上沒有能轉進這個帳戶的來源。')+'</p>':'';
      return '<li><b>'+esc(item.label)+'</b>：需要 '+num(item.need)+' '+item.unit+own+(parts?'<ul>'+parts+'</ul>':item.shortfall?'':'<span class="trip-ok">，不用轉點</span>')+gap+'</li>';
    }).join('');
    const banks=result.banks.length?'<h3>各銀行點數轉完後</h3><ul class="trip-banks">'+result.banks.map(b=>{
      const split=result.items.length>1&&b.usedBy.flight&&b.usedBy.hotel?'（機票 '+num(b.usedBy.flight)+'＋飯店 '+num(b.usedBy.hotel)+'）':'';
      return '<li><b>'+esc(label(b.id))+'</b>：共轉出 '+num(b.used)+' 點'+split+'；你有 '+num(b.balance)+'，剩 '+num(b.remaining)+'</li>';
    }).join('')+'</ul>':'';
    let cash='';
    if(fl){
      const fee=feeOf(fl),mine=form.tax[fl.program.id]!==undefined;
      cash=mine?'機票稅金與附加費 NT$'+num(form.tax[fl.program.id]*form.pax)+'（你填的）':fee&&fee.amount!=null?'機票稅金與附加費約 NT$'+num(fee.totals.total)+'（參考值）':'機票稅金與附加費：官網沒有金額';
      cash='<p class="trip-cash-line"><b>現金</b>：'+cash+(reqs.some(r=>r.key==='hotel')?'；飯店用點數付，不另計房費。':'。')+'</p>';
    }
    return head+chosen+'<ul class="trip-sum-items">'+rows+'</ul>'+banks+cash+'<p class="trip-note">飯店總點數沒有扣連住優惠；官網顯示的已含優惠總點數更準，可直接填成「每晚點數」。</p>';
  }
  function updateTotals(){
    resolvePicks();
    const box=root.querySelector('[data-trip-sum]');
    if(box)box.innerHTML=sumHtml();
    root.querySelectorAll('[data-card]').forEach(card=>card.classList.toggle('picked',card.dataset.card===picked.flight));
    root.querySelectorAll('[data-hotel-card]').forEach(card=>card.classList.toggle('picked',card.dataset.hotelCard===picked.hotel));
    root.querySelectorAll('[data-pick-flight],[data-pick-hotel]').forEach(button=>{
      const kind=button.hasAttribute('data-pick-flight')?'flight':'hotel',on=picked[kind]===button.getAttribute('data-pick-'+kind);
      button.setAttribute('aria-pressed',String(on));button.textContent=on?'已排進整趟':'排進整趟';
    });
  }
  // 改每晚點數、現金房價、晚數時只更新數字，不重畫卡片，輸入框才不會失焦
  function updateHotels(){
    for(const box of root.querySelectorAll('[data-hotel-calc]')){
      const p=ctx.hotels.find(h=>h.program.id===box.dataset.hotelCalc)?.program;
      if(p)box.innerHTML=hotelCalc(p);
    }
    updateTotals();
  }
  function render(){
    const inv=getInventory(),owned=new Set(inv.resources||[]),city=TRIP_CITIES.find(c=>c.id===form.city);
    const flights=flightOptions({awards:data.awards,transfers:data.transfers,inventory:inv,city:form.city,cabin:form.cabin,pax:form.pax,trip:form.trip,today});
    const hotels=hotelOptions({programs:hotelPrograms,transfers:data.transfers,inventory:inv,today});
    if(form.cash)flights.sort((a,b)=>(valueOf(b)??-1)-(valueOf(a)??-1));
    shown=flights;ctx={flights,hotels,city};resolvePicks();
    const usable=flights.filter(item=>item.state!=='none'),other=flights.filter(item=>item.state==='none');
    const nonstop=data.routes[form.city]?.nonstop||{},carriers=[...new Set(Object.values(nonstop).flat())].map(code=>data.carriers[code]?.zh||code);
    const dynamic=data.dynamic.filter(item=>owned.has(item.id));
    const empty=!owned.size?'<div class="trip-empty"><p>還沒選你手上的卡和點數，下面只列各計畫要多少哩。選完會告訴你夠不夠、差多少要從哪裡轉。</p><button type="button" class="button" data-start-setup>選我手上的卡</button></div>':'';
    root.querySelector('[data-trip-results]').innerHTML=empty+hero(city,flights)+
      '<section class="trip-section"><h2>機票・台北到'+esc(city.zh)+'</h2>'+(carriers.length?'<p class="small muted">桃園直飛：'+esc(carriers.join('、'))+'</p>':'')+
      (usable.length?'<div class="trip-grid">'+usable.map(item=>flightCard(item,city)).join('')+'</div>':owned.size?'<div class="empty">你手上的哩程和點數，在這條航線還沒有接得上的計畫。下面是其他計畫要多少哩。</div>':'')+
      (other.length?(owned.size?'<details class="plan-other"><summary><b>其他計畫（'+other.length+'）</b><small>你目前沒有這些哩程，也沒有能轉過去的點數</small></summary><div class="trip-grid">'+other.map(item=>flightCard(item,city)).join('')+'</div></details>':'<div class="trip-grid">'+other.map(item=>flightCard(item,city)).join('')+'</div>'):'')+
      (dynamic.length?'<p class="trip-note">'+esc(dynamic.map(item=>item.name).join('、'))+' 是浮動價，沒有固定表，到官網查。</p>':'')+'<details class="trip-fees"><summary>哪些計畫沒列出來</summary><p>聯航 MileagePlus、Flying Blue 是浮動價，沒有固定表。卡達 Avios 官方計算器查不到台灣出發的數字；國泰亞洲萬里通要登入才看得到哩數。日航只列官方表上有的直飛城市與夥伴表，經東京轉往歐美沒有官方連程價。英航 Avios 只查到經香港到倫敦。各計畫的稅金與燃油附加費只查到下限，訂票時另付。</p></details></section>'+
      perksSection(owned)+
      '<section class="trip-section"><h2>飯店・'+esc(city.zh)+'</h2><label class="trip-nights"><span>住幾晚</span><input type="number" inputmode="numeric" min="1" max="60" step="1" data-nights value="'+(form.nights||'')+'" placeholder="'+(dateNights()||'晚數')+'"></label><div class="trip-grid">'+hotels.map(item=>hotelCard(item,city)).join('')+'</div></section>'+
      '<section class="trip-section trip-sum" data-trip-sum>'+sumHtml()+'</section>'+
      '<section class="trip-section trip-next"><p>在官網看到點數價和同日期的現金價，可以算一點值多少錢，划不划算。</p><button type="button" class="button secondary" data-open-calc>試算值不值得</button><p class="small muted">哩程數字是官方獎勵表的最低一級，查核日 '+esc(data.checked_on)+'；有沒有位子、要不要加價，以官網為準。</p></section>';
  }
  root.innerHTML='<div class="page-heading"><h1>出去玩</h1><p>選目的地，看你手上的哩程和點數能怎麼用，再到官網查位子和房間。</p></div>'+controls()+'<div data-trip-results aria-live="polite"></div>';
  let cashTimer=0;
  const persist=()=>save({city:form.city,cabin:form.cabin,trip:form.trip,pax:form.pax,cost:form.cost,nights:form.nights});
  // 事件掛在 root 上：換出發地時表單會重畫，不用重新綁定
  root.addEventListener('input',event=>{
    const name=event.target.name;
    if((name!=='cash'&&name!=='cost')||!event.target.closest('[data-trip-form]'))return;
    clearTimeout(cashTimer);
    cashTimer=setTimeout(()=>{
      const f=event.target.closest('[data-trip-form]');
      form.cash=Math.max(0,Math.round(Number(f.cash.value)||0));
      form.cost=f.cost.value===''?null:Math.max(0,Number(f.cost.value)||0);
      persist();render();
    },350);
  });
  root.addEventListener('change',event=>{
    const f=event.target.closest('[data-trip-form]');
    if(!f)return;
    const before=JSON.stringify(form);
    form.city=f.city.value;form.pax=Number(f.pax.value);form.cabin=f.cabin.value;form.trip=f.trip.value;form.checkin=f.checkin.value;form.checkout=f.checkout.value;form.cash=Math.max(0,Math.round(Number(f.cash.value)||0));
    form.cost=f.cost.value===''?null:Math.max(0,Number(f.cost.value)||0);
    if(form.checkout&&form.trip==='oneway'){form.trip='roundtrip';f.querySelector('[name=trip][value=roundtrip]').checked=true;}
    if(JSON.stringify(form)===before)return;
    persist();
    render();
  });
  const results=root.querySelector('[data-trip-results]');
  results.addEventListener('input',event=>{
    const t=event.target,tax=t.closest('[data-tax]');
    if(tax){
      if(tax.value==='')delete form.tax[tax.dataset.tax];else form.tax[tax.dataset.tax]=Math.max(0,Math.round(Number(tax.value)||0));
      updateValues();return;
    }
    if(t.matches('[data-nights]')){form.nights=Math.min(60,Math.max(0,Math.round(Number(t.value)||0)));persist();updateHotels();return;}
    if(t.matches('[data-hotel-field]')){
      const inp=form.hotelIn[t.dataset.hotelId]||(form.hotelIn[t.dataset.hotelId]={});
      inp[t.dataset.hotelField]=Math.max(0,Math.round(Number(t.value)||0));
      updateHotels();
    }
  });
  results.addEventListener('change',event=>{
    const t=event.target;
    if(t.matches('[data-hotel-cat],[data-hotel-level]')){
      const inp=form.hotelIn.hyatt||(form.hotelIn.hyatt={});
      if(t.matches('[data-hotel-cat]'))inp.cat=t.value;else inp.level=t.value;
      updateHotels();
    }
  });
  results.addEventListener('click',event=>{
    const flight=event.target.closest('[data-pick-flight]'),hotel=event.target.closest('[data-pick-hotel]');
    if(flight){form.pick.flight=flight.dataset.pickFlight;updateTotals();}
    if(hotel){form.pick.hotel=hotel.dataset.pickHotel;updateTotals();}
  });
  render();
  return {render};
}
