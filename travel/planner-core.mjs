import {tripPlaces} from './research-data.mjs?v=7';
export const START='2027-01-17', END='2027-02-08', KL_END='2027-01-24';
export const CITIES={kl:'吉隆坡',ipoh:'怡保',pen:'檳城',penres:'檳城渡假村（Teluk Bahang／Batu Ferringhi）',kk:'亞庇市區',resort:'亞庇近郊渡假村'};
export const CITY_SHORT={...CITIES,penres:'檳城渡假村'};
export const addDays=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export const daysBetween=(a,b)=>(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000;
export function schedule(stops){let start=KL_END;return [{city:'kl',nights:7,start:START,end:KL_END,fixed:true},...stops.map(s=>{const end=addDays(start,s.nights);const row={...s,start,end};start=end;return row;})];}
export function validRoute(stops){return stops.length>0&&stops.every(s=>CITIES[s.city]&&Number.isInteger(s.nights)&&s.nights>0&&s.nights<=15)&&stops.reduce((n,s)=>n+s.nights,0)===15;}
export function ageFit(program,age){if(program.age_min==null&&program.age_max==null)return 'unknown';return (program.age_min==null||age>=program.age_min)&&(program.age_max==null||age<=program.age_max)?'yes':'no';}
export function evidence(s,from='2027-01-18',to='2027-01-22'){
 if(!s?.start_date||!s?.end_date)return 'unknown';
 if(s.end_date<from||s.start_date>to)return 'outside';
 if(!s.source_url||/languagecourse|seed:|google.com\/search/.test(s.source_url))return 'aggregator';
 if(s.date_status!=='confirmed_target_year')return 'unconfirmed';
 return daysBetween(s.start_date,s.end_date)>6?'season':'week';
}
export function commuteHours(minutes,days,returns){return minutes*days*(returns?4:2)/60;}
export function quotedBudget(legs,rates,extras){let missing=0,total=0;for(const leg of legs){const key=leg.fixed?'fixed':leg.id;const value=rates[key];if(value===''||value==null||!Number.isFinite(Number(value))||Number(value)<0)missing++;else total+=Number(value)*leg.nights;}for(const v of Object.values(extras)){if(v===''||v==null||!Number.isFinite(Number(v))||Number(v)<0)missing++;else total+=Number(v);}return {total,missing};}
export const PRESETS=[
 ['klpenkl','吉隆坡＋檳城＋回吉隆坡',[['pen',7],['penres',4],['kl',4]]],
 ['klsabahkl','吉隆坡＋沙巴＋回吉隆坡',[['kk',7],['resort',4],['kl',4]]],
 ['sabah','吉隆坡＋亞庇・市區＋渡假村',[['kk',4],['resort',11]]],
 ['pen','檳城長住・少搬行李',[['pen',15]]],
 ['balanced','住宿與體驗平衡',[['pen',7],['resort',8]]],
 ['land','怡保＋檳城・陸路慢遊',[['ipoh',3],['pen',12]]],
 ['all','怡保＋檳城＋沙巴',[['ipoh',3],['pen',6],['resort',6]]],
 ['reverse','先沙巴・檳城回台北',[['resort',8],['pen',7]]],
 ['buffer','檳城＋沙巴＋回吉隆坡',[['pen',6],['resort',8],['kl',1]]],
 ['ipoh-sabah','怡保＋吉隆坡轉接＋沙巴',[['ipoh',3],['kl',1],['resort',11]]]
];
export function presetForStops(stops){return PRESETS.find(([, ,rows])=>rows.length===stops.length&&rows.every(([city,nights],i)=>stops[i].city===city&&stops[i].nights===nights))?.[0]||'';}
export function routeWarnings(legs){const warnings=[];const total=legs.reduce((n,s)=>n+s.nights,0);if(total!==22)warnings.push(`目前 ${total} 晚，需調整為 22 晚；差 ${Math.abs(22-total)} 晚。每日表暫停產生。`);
 for(let i=1;i<legs.length;i++){const s=legs[i],prev=legs[i-1];if(s.city==='ipoh'&&s.nights<3)warnings.push('怡保少於 3 晚：樂園與移動日可能擠在一起。');if(s.city==='pen'&&s.nights<5)warnings.push('檳城少於 5 晚：從主要景點中挑 2 個，保留雨天。');if(['kk','resort'].includes(s.city)&&prev.city==='ipoh'||s.city==='ipoh'&&['kk','resort'].includes(prev.city))warnings.push('怡保與沙巴間需比對經吉隆坡的交通；本頁沒有假設怡保直飛亞庇。');if(s.start>='2027-02-05'&&s.start<END)warnings.push(`${s.start} 更換住宿：接近農曆年，接送與餐飲須預先確認。`);}
 const pen=legs.find(s=>s.city==='pen');if(pen&&pen.start>'2027-01-28')warnings.push('檳城在 1/29 之後才入住：會錯過已公告至 1/29 的 Newtonshow 冬季營。');
 if(legs.filter(s=>s.city!=='kl').length>=4)warnings.push('吉隆坡之後至少 4 次入住：若孩子不喜歡搬行李，可減少拆館。');return [...new Set(warnings)];}

// Keep dates and private notes when older plans include destinations now out of scope.
export function restrictSabahScope(plan){
 if(!plan||!Array.isArray(plan.stops))return plan;
 const rates={...plan.rates};let changed=false;
 const stops=plan.stops.map(s=>{if(s.city==='mountain'){changed=true;delete rates[s.id];return {...s,city:'kk',hotel:''};}if(s.hotel==='kk-rasa'){changed=true;delete rates[s.id];return {...s,hotel:''};}return {...s};});
 return {...plan,stops,rates,scopeAdjusted:changed||Boolean(plan.scopeAdjusted)};
}

// ---- Daily schedule: activity lists, rules and the built-in suggestion for the default route ----
const src=(city,index)=>tripPlaces[city].items[index][2];
const TATLER='https://www.tatlerasia.com/lifestyle/travel/celebrate-festivities-angsana-teluk-bahang-penang';
const ENTOPIA_RAIN='含室內部分但非全室內；大雨就改公寓日。',ESCAPE_RAIN='雨天取消或改期；先確認票券更改條款。';
export const ACT={
 kl:[['rest','公寓泳池＋KLCC 公園','上午採買、下午休息／泳池；到公園看當天雨勢。','公寓手作、閱讀或室內商場；泳池按設施狀態。',src(0,2)],['science','Petrosains 科學探索','安排 3–4 小時；其餘留給午餐與休息。','可作室內備案，但先查 2027 休館與票務。',src(0,0)],['kid','KidZania 職業體驗','獨立一整天，提前安排 Petaling Jaya 接送。','室內候選；不要與其他主要景點擠同一天。',src(0,1)],['aquaria','Aquaria KLCC 水族館','上午從公寓步行到 KLCC，約 2–3 小時；下午收行李或休息。','室內，雨天備案首選；平日 10:00–20:00 來自轉售平台，官網未核實。',src(0,3)]],
 ipoh:[['rest','老城短走＋飯店休息','早上短走與午餐，下午泳池或休息。','飯店休息、室內午餐；不要把戶外池當雨天保證。',src(1,2)],['lost','Lost World of Tambun','一整天；先確認孩子身高、各項目門檻。','改到飯店休息；雷雨時不強行玩水與戶外設施。',src(1,0)],['lang','Gunung Lang 自然半日','石灰岩景觀，另留午餐與午睡。','老城室內午餐／飯店遊戲；自然行程移到下一個空白日。',src(1,1)]],
 pen:[['rest','公寓＋Gurney 生活日','採買、下廚、洗衣，下午泳池或短走。','公寓手作、商場餐飲；保留不花門票的一天。',src(2,3)],['old','George Town 短程散步','上午 1–2 小時＋午餐；下午回公寓。','改室內用餐、公寓或商場；不要在雨中長走。',src(2,3)],['hill','升旗山＋The Habitat','平日早上出發、短步道；排隊多時縮短行程。','雷雨改期，使用公寓生活日；纜車開放另查。',src(2,1)],['entopia','Entopia 自然觀察','半天，不與 ESCAPE 同一天；在 Teluk Bahang 一帶，兩位都在兒童票範圍。',ENTOPIA_RAIN,src(2,0)],['escape','ESCAPE 遊樂園（可選）','一整天，在 Teluk Bahang 一帶；依兩個孩子身高／體重逐項確認。週一休館（二手來源）。',ESCAPE_RAIN,src(2,2)]],
 penres:[['rest','渡假村泳池日・兒童俱樂部','上午泳池（無邊際池、附滑水道的家庭池、兒童池），下午 Rangers’ Club 兒童俱樂部（4–12 歲，10 歲可能嫌小）；傍晚在園區短走。','雷雨暫停戶外池，改兒童俱樂部、房內遊戲或館內餐廳；室內設施與開放時段先查。',TATLER],['entopia','Entopia 自然觀察','半天，從渡假村約 15 分鐘車程；不與 ESCAPE 同一天。',ENTOPIA_RAIN,src(2,0)],['escape','ESCAPE 遊樂園（可選）','一整天，從渡假村約 10 分鐘車程；依兩個孩子身高／體重逐項確認。週一休館（二手來源）。',ESCAPE_RAIN,src(2,2)]],
 kk:[['rest','亞庇市區生活日','購物、短走與飯店休息；先查泳池設施。','室內購物、餐飲與房內閱讀。',src(3,0)],['island','海洋公園 1–2 島','作為主要出海日；另保留一個可替換日。','海況差改市區／飯店；不承諾浮潛活動一定開。',src(3,0)],['culture','Mari Mari Cultural Village','文化半日＋下午休息，先確認接送與導覽。','非純室內景點；大雨改飯店日、文化村再移動。',src(3,1)],['beach','丹絨亞路沙灘短程日','玩沙、短走與看夕陽；依天氣選時段並安排接送。海泳區、海況與泳力須另確認。','下雨或風浪大改館內活動，沙灘移到後面的留白日。',src(3,2)]],
 resort:[['rest','渡假村留白日','依當日預報安排上午泳池，午間休息；傍晚再看天氣短走，不加長途行程。','雷雨暫停泳池，改館內兒童活動、房內遊戲或餐飲；室內設施與開放時段先查。',src(3,3)],['island','海洋公園 1–2 島','依飯店位置確認到碼頭接送；只挑 1–2 島。','海況差改渡假村日，留後續空白日替換。',src(3,0)],['culture','文化村半日＋渡假村','只安排一個外出半日，另一半休息。','文化村仍有戶外移動，強雨改房內活動。',src(3,1)],['beach','丹絨亞路沙灘短程日','玩沙、短走與看夕陽；依天氣選時段並安排接送。海泳區、海況與泳力須另確認。','下雨或風浪大改館內活動，沙灘移到後面的留白日。',src(3,2)]]
};
// Weekdays (0=Sun) the auto-scheduler avoids; CLOSED also warns when the family picks such a day by hand.
const BAN={science:[1],kid:[0,2,6],escape:[1]};
export const CLOSED={science:{dow:[1],text:'Petrosains 官方有指定週一休館規則，2027 日期待公告，請確認該日是否開放。'},kid:{dow:[2],text:'KidZania 休館日各來源不一，可能是週二，請確認該日是否開放。'},escape:{dow:[1],text:'ESCAPE 週一休館（二手來源），請確認該日是否開放。'}};
// Built-in suggestion for the default route (pace easy). Dates not listed fall back to the general rules.
export const SUGGESTED={klpenkl:{'2027-01-21':'kid','2027-01-22':'rest','2027-01-23':'aquaria','2027-01-25':'rest','2027-01-26':'old','2027-01-27':'rest','2027-01-28':'hill','2027-01-29':'rest','2027-01-30':'rest','2027-02-01':'entopia','2027-02-02':'escape','2027-02-03':'rest','2027-02-05':'science','2027-02-06':'rest','2027-02-07':'rest'}};
export const holidayFor=date=>date==='2027-01-22'?'大寶森節：吉隆坡與檳城州假日，景點人多、營隊是否上課待確認；避開黑風洞。':date==='2027-02-05'?'除夕：商店可能提早打烊。':date==='2027-02-06'||date==='2027-02-07'?'農曆新年（初一、初二）：商場有舞獅，華人餐廳多休息，可在公寓煮食；餐飲、營業與接送先確認。':'';
const dow=date=>new Date(date+'T00:00:00Z').getUTCDay();
const grp=c=>c==='kk'||c==='resort'?'sabah':c==='pen'||c==='penres'?'pen':c;
const restOnly=(date,city)=>date>='2027-02-06'||date==='2027-01-22'&&['kl','pen','penres'].includes(city)||city==='kl'&&date==='2027-01-18';
export const OUTBOUND='CI721 08:25→13:25，KLIA 第一航廈；機場接送、入住、採買。';
export function returnPlan(city){
 if(city==='kl')return 'CI722 吉隆坡 14:35→台北 19:15（A350）。約 11:00 從公寓出發前往 KLIA 第一航廈。';
 if(city==='pen'||city==='penres')return `CI732 檳城 15:20→台北 19:55（A321neo 窄體）。機票要買多點進出（台北→吉隆坡、檳城→台北）。${city==='penres'?'渡假村到檳城機場約 1 小時，報到前留足車程。':''}`;
 if(city==='ipoh')return '怡保沒有國際線，需回吉隆坡搭 CI722（14:35→台北 19:15）；當天一早走陸路或 ETS，留足緩衝。';
 return '華航不飛亞庇。選項一：AirAsia AK1510 亞庇 08:40→台北 11:55，唯一直飛；廉航，行李與選位另購，與華航分票。選項二：2/7 先飛回吉隆坡住一晚，2/8 搭 CI722（14:35→19:15）。不建議 2/8 當天轉機：分票，國內線延誤華航不負責。';
}
export function planDays({stops,pace='easy',activities={},attendingCount=()=>0}){
 const legs=schedule(stops),days=[];
 for(let i=0;i<23;i++){const date=addDays(START,i),leg=i===22?legs.at(-1):legs.find(l=>date>=l.start&&date<l.end),idx=legs.indexOf(leg);days.push({i,date,leg,idx,city:leg.city,prev:legs[idx-1]?.city,travel:i===0||i===22||date===leg.start&&idx>0,item:null,stale:false});}
 const hasPenres=stops.some(s=>s.city==='penres'),list=c=>hasPenres&&c==='pen'?ACT.pen.filter(a=>!['entopia','escape'].includes(a[0])):ACT[c];
 const used=new Set(),fixed=new Set(),key=(c,id)=>`${grp(c)}:${id}`;
 const take=(d,a)=>{d.item=a;fixed.add(d.i);if(a[0]!=='rest')used.add(key(d.city,a[0]));};
 for(const d of days){const o=activities[d.date],chosen=o&&o.city===d.city?ACT[d.city].find(a=>a[0]===o.id):null;d.stale=Boolean(o)&&!chosen;if(chosen&&!d.travel)take(d,chosen);}
 const suggested=pace==='easy'?SUGGESTED[presetForStops(stops)]:null;
 if(suggested)for(const d of days){const a=!d.travel&&!fixed.has(d.i)&&ACT[d.city].find(a=>a[0]===suggested[d.date]);if(a)take(d,a);}
 for(const leg of legs){
  const E=days.filter(d=>d.leg===leg&&!d.travel&&!fixed.has(d.i)&&!restOnly(d.date,d.city)&&!attendingCount(d.date));
  let slots=pace==='active'?E:E.filter((_,j)=>j%2===0);
  if(pace!=='active'&&leg.city==='pen'&&leg.nights>=5&&E.length>=2&&slots.length<2)slots=E.slice(0,2);
  const free=[...slots];
  for(const a of list(leg.city).slice(1)){
   if(used.has(key(leg.city,a[0])))continue;
   const ok=free.filter(d=>!(BAN[a[0]]||[]).includes(dow(d.date))),pick=a[0]==='island'?ok.find(d=>dow(d.date)>=1&&dow(d.date)<=5)||ok[0]:ok[0];
   if(!pick)continue;
   pick.item=a;free.splice(free.indexOf(pick),1);used.add(key(leg.city,a[0]));
  }
 }
 return days.map(d=>{
  const item=d.item||ACT[d.city][0],n=attendingCount(d.date),closed=CLOSED[item[0]];
  const title=d.travel?(d.i===0?'台北 → 吉隆坡・抵達與入住':d.i===22?`${CITY_SHORT[d.city]} → 台北・回程`:`${CITY_SHORT[d.prev]} → ${CITY_SHORT[d.city]}・移動日`):n?`${n===2?'兩位孩子':'一位孩子'}營隊日・假設排入`:item[1];
  return {...d,item,title,holiday:holidayFor(d.date),closure:!d.travel&&closed?.dow.includes(dow(d.date))?closed.text:'',flight:d.i===0?OUTBOUND:d.i===22?returnPlan(d.city):''};
 });
}
