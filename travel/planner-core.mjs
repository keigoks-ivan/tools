export const START='2027-01-17', END='2027-02-08', KL_END='2027-01-24';
export const CITIES={kl:'吉隆坡',ipoh:'怡保',pen:'檳城',kk:'亞庇市區',resort:'沙巴渡假村',mountain:'昆達山'};
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
 ['balanced','住宿與體驗平衡',[['pen',7],['resort',8]]],
 ['land','怡保＋檳城・陸路慢遊',[['ipoh',3],['pen',12]]],
 ['all','怡保＋檳城＋沙巴',[['ipoh',3],['pen',6],['resort',6]]],
 ['pen','檳城長住・少搬行李',[['pen',15]]],
 ['sabah','沙巴慢住・市區＋渡假村',[['kk',4],['resort',11]]],
 ['reverse','先沙巴・檳城回台北',[['resort',8],['pen',7]]],
 ['mountain','檳城＋沙巴山海',[['pen',6],['kk',2],['mountain',2],['resort',5]]],
 ['buffer','檳城＋沙巴＋回吉隆坡',[['pen',6],['resort',8],['kl',1]]],
 ['ipoh-sabah','怡保＋吉隆坡轉接＋沙巴',[['ipoh',3],['kl',1],['resort',11]]]
];
export function routeWarnings(legs){const warnings=[];const total=legs.reduce((n,s)=>n+s.nights,0);if(total!==22)warnings.push(`目前 ${total} 晚，需調整為 22 晚；差 ${Math.abs(22-total)} 晚。每日表暫停產生。`);
 for(let i=1;i<legs.length;i++){const s=legs[i],prev=legs[i-1];if(s.city==='ipoh'&&s.nights<3)warnings.push('怡保少於 3 晚：樂園與移動日可能擠在一起。');if(s.city==='pen'&&s.nights<5)warnings.push('檳城少於 5 晚：從主要景點中挑 2 個，保留雨天。');if(s.city==='mountain'&&s.nights<2)warnings.push('昆達山建議至少 2 晚，避免連續山路移動。');if(['kk','resort','mountain'].includes(s.city)&&prev.city==='ipoh'||s.city==='ipoh'&&['kk','resort','mountain'].includes(prev.city))warnings.push('怡保與沙巴間需比對經吉隆坡的交通；本頁沒有假設怡保直飛亞庇。');if(s.start>='2027-02-05'&&s.start<END)warnings.push(`${s.start} 更換住宿：接近農曆年，接送與餐飲須預先確認。`);}
 const pen=legs.find(s=>s.city==='pen');if(pen&&pen.start>'2027-01-28')warnings.push('檳城在 1/29 之後才入住：會錯過已公告至 1/29 的 Newtonshow 冬季營。');
 if(legs.filter(s=>s.city!=='kl').length>=4)warnings.push('吉隆坡之後至少 4 次入住：若孩子不喜歡搬行李，可刪掉山區或拆館。');return [...new Set(warnings)];}
