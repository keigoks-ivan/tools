import test from 'node:test';
import assert from 'node:assert/strict';
import {CITIES,PRESETS,presetForStops,schedule,validRoute,ageFit,evidence,commuteHours,quotedBudget,routeWarnings,restrictSabahScope,planDays,returnPlan,ACT} from './planner-core.mjs';
import {tripRoutes} from './research-data.mjs';
import {joinCampData} from './camp-options.mjs';
import {readFileSync} from 'node:fs';
test('all supported presets preserve the fixed week, total 22 nights and Feb 8 checkout',()=>{
 for(const [id,,rows] of PRESETS){const stops=rows.map(([city,nights],i)=>({id:String(i),city,nights}));assert.equal(validRoute(stops),true,id);const legs=schedule(stops);assert.equal(legs[0].start,'2027-01-17');assert.equal(legs[0].end,'2027-01-24');assert.equal(legs.at(-1).end,'2027-02-08',id);assert.equal(legs.reduce((n,s)=>n+s.nights,0),22);}
});
test('excess nights are reported, not silently truncated',()=>{const stops=[{city:'pen',nights:10},{city:'resort',nights:8}];assert.equal(validRoute(stops),false);assert.equal(schedule(stops).at(-1).end,'2027-02-11');assert.match(routeWarnings(schedule(stops))[0],/25 晚/);});
test('age boundaries separate siblings and preserve unknown ages',()=>{assert.equal(ageFit({age_min:7,age_max:16},6),'no');assert.equal(ageFit({age_min:4,age_max:10},10),'yes');assert.equal(ageFit({age_min:5,age_max:7},10),'no');assert.equal(ageFit({},6),'unknown');});
test('official season and aggregator weekly dates are not confirmed bookings',()=>{assert.equal(evidence({start_date:'2026-11-23',end_date:'2027-01-29',source_url:'https://newtonshow.my/winter-camp',date_status:'confirmed_target_year'}),'season');assert.equal(evidence({start_date:'2027-01-18',end_date:'2027-01-22',source_url:'https://www.languagecourse.net/school',date_status:'confirmed_target_year'}),'aggregator');assert.equal(evidence({start_date:'2026-12-14',end_date:'2026-12-18',source_url:'https://example.com',date_status:'confirmed_target_year'}),'outside');assert.equal(evidence({}),'unknown');});
test('blank budget items stay missing, quoted zero stays zero; split dates count correctly',()=>{const legs=schedule([{id:'p',city:'pen',nights:7},{id:'s',city:'resort',nights:8}]);assert.deepEqual(quotedBudget(legs,{fixed:500,p:600,s:''},{flights:0,camps:''}),{total:7700,missing:2});});
test('commute accounts for parent returning to hotel and selected day count',()=>{assert.equal(commuteHours(30,3,false),3);assert.equal(commuteHours(30,5,true),10);});
test('every curated camp joins existing database; younger child excluded from Active',()=>{const raw=Object.fromEntries(['programs','providers','locations','sessions'].map(f=>[f,JSON.parse(readFileSync(new URL(`../camps/data/${f}.json`,import.meta.url)))]));const camps=joinCampData(raw);assert.equal(camps.length,11);for(const c of camps){assert.ok(c.programData,c.id);assert.ok(c.locationData,c.id);assert.ok(c.providerData,c.id);}assert.equal(ageFit(camps.find(c=>c.id==='beaumont-active').programData,6),'no');assert.equal(camps.find(c=>c.id==='ace').status,'aggregator');});

test('current preset follows actual route after applying, restoring, or editing stops',()=>{
 for(const [id,,rows] of PRESETS){const stops=rows.map(([city,nights],i)=>({id:`saved-${i}`,city,nights,hotel:'user-choice'}));assert.equal(presetForStops(stops),id);assert.equal(presetForStops(JSON.parse(JSON.stringify(stops))),id);}
 assert.equal(presetForStops([{city:'pen',nights:8},{city:'resort',nights:7}]),'');
 assert.equal(presetForStops([{city:'pen',nights:7},{city:'resort',nights:8}].reverse()),'reverse');
});

test('old far-away Sabah choices keep nights and notes but require nearby hotel requotes',()=>{
 const old={stops:[{id:'m',city:'mountain',nights:2,hotel:''},{id:'r',city:'resort',nights:5,hotel:'kk-rasa'},{id:'p',city:'pen',nights:8,hotel:'pen-mea'}],rates:{m:100,r:200,p:300,fixed:500},notes:{'2027-01-31':'keep my note'},transfers:{'pen:resort:r':'flight'}};
 const updated=restrictSabahScope(old);assert.equal(updated.stops.reduce((n,s)=>n+s.nights,0),15);assert.equal(updated.stops[0].city,'kk');assert.equal(updated.stops[1].hotel,'');assert.deepEqual(updated.rates,{p:300,fixed:500});assert.deepEqual(updated.notes,old.notes);assert.equal(old.stops[0].city,'mountain');assert.equal(updated.scopeAdjusted,true);assert.deepEqual(restrictSabahScope(updated),updated);
});

// ---- default route, daily schedule and flights ----
const toStops=rows=>rows.map(([city,nights],i)=>({id:`t${i}`,city,nights}));
const preset=id=>toStops(PRESETS.find(p=>p[0]===id)[2]);
const campWeek=d=>d>='2027-01-18'&&d<='2027-01-20'?2:0;
test('default route is the Kuala Lumpur + Penang + Kuala Lumpur preset; route cards map to presets of the same id',()=>{
 assert.deepEqual(PRESETS.slice(0,4).map(p=>p[0]),['klpenkl','klsabahkl','sabah','pen']);
 assert.deepEqual(PRESETS.find(p=>p[0]==='klpenkl')[2],[['pen',7],['penres',4],['kl',4]]);
 assert.deepEqual(PRESETS.find(p=>p[0]==='klsabahkl')[2],[['kk',7],['resort',4],['kl',4]]);
 assert.deepEqual(tripRoutes.slice(0,2).map(r=>r.id),['klpenkl','klsabahkl']);
 for(const r of tripRoutes)assert.ok(PRESETS.some(p=>p[0]===r.id),r.id);
 assert.ok(CITIES.penres);assert.equal(presetForStops(preset('klpenkl')),'klpenkl');
});
test('default state produces the agreed 23 day titles',()=>{
 const rows=planDays({stops:preset('klpenkl'),pace:'easy',attendingCount:campWeek});
 assert.deepEqual(rows.map(r=>r.title),[
  '台北 → 吉隆坡・抵達與入住','兩位孩子營隊日・假設排入','兩位孩子營隊日・假設排入','兩位孩子營隊日・假設排入','KidZania 職業體驗','公寓泳池＋KLCC 公園','Aquaria KLCC 水族館',
  '吉隆坡 → 檳城・移動日','公寓＋Gurney 生活日','George Town 短程散步','公寓＋Gurney 生活日','升旗山＋The Habitat','公寓＋Gurney 生活日','公寓＋Gurney 生活日',
  '檳城 → 檳城渡假村・移動日','Entopia 自然觀察','ESCAPE 遊樂園（可選）','渡假村泳池日・兒童俱樂部',
  '檳城渡假村 → 吉隆坡・移動日','Petrosains 科學探索','公寓泳池＋KLCC 公園','公寓泳池＋KLCC 公園','吉隆坡 → 台北・回程']);
 assert.equal(rows[0].flight,'CI721 08:25→13:25，KLIA 第一航廈；機場接送、入住、採買。');
 assert.match(rows[5].holiday,/大寶森節：吉隆坡與檳城州假日/);assert.match(rows[19].holiday,/除夕/);assert.match(rows[20].holiday,/農曆新年/);assert.match(rows[21].holiday,/農曆新年/);
 assert.equal(rows.filter(r=>r.closure).length,0);
});
test('a family-chosen activity beats the built-in suggestion and warns on known closures',()=>{
 const rows=planDays({stops:preset('klpenkl'),activities:{'2027-01-21':{city:'kl',id:'science'},'2027-01-25':{city:'pen',id:'escape'}}});
 assert.equal(rows[4].item[0],'science');assert.equal(rows[4].closure,'');assert.equal(rows[8].item[0],'escape');assert.match(rows[8].closure,/週一休館/);
 const stale=planDays({stops:preset('klpenkl'),activities:{'2027-01-25':{city:'kl',id:'kid'}}});assert.equal(stale[8].stale,true);assert.equal(stale[8].item[0],'rest');
});
test('general rules keep big attractions off Thaipusam and Lunar New Year days, and book a boat day, for every route',()=>{
 const cities=Object.keys(CITIES),routes=[];
 const gen=(left,cur)=>{if(!left){routes.push(cur);return;}if(cur.length>=3)return;for(const city of cities)for(let nights=2;nights<=left;nights++)if(cur.at(-1)?.city!==city)gen(left-nights,[...cur,{city,nights}]);};
 gen(15,[]);for(const [,,rows] of PRESETS)routes.push(rows.map(([city,nights])=>({city,nights})));
 assert.ok(routes.length>1000);
 for(const pace of ['easy','active'])for(const r of routes){
  const stops=r.map((s,i)=>({...s,id:`g${i}`})),name=`${pace} ${r.map(s=>s.city+s.nights).join(',')}`,days=planDays({stops,pace});
  assert.equal(days.length,23,name);
  for(const d of days){assert.ok(d.item&&d.title&&!/undefined/.test(d.title+d.item.join()),name);if(['2027-01-22','2027-02-06','2027-02-07'].includes(d.date))assert.equal(d.item[0],'rest',`${name} ${d.date}`);}
  let sabahNights=0,at='2027-01-24';for(const s of stops){const end=schedule(stops).find(l=>l.id===s.id).end;if(['kk','resort'].includes(s.city))sabahNights+=Math.max(0,(Date.parse((end<'2027-02-06'?end:'2027-02-06')+'T00:00:00Z')-Date.parse(at+'T00:00:00Z'))/86400000);at=end;}
  if(sabahNights>=3)assert.ok(days.some(d=>d.item[0]==='island'&&!d.travel),`${name} boat day`);
  if(stops.some(s=>s.city==='pen'&&s.nights>=5)){const ids=days.filter(d=>d.city==='pen'&&!d.travel).map(d=>d.item[0]),old=ids.indexOf('old'),hill=ids.indexOf('hill'),escape=ids.indexOf('escape');assert.ok(old>=0&&hill>=0,name);if(escape>=0)assert.ok(escape>old&&escape>hill,name);}
  if(stops.some(s=>s.city==='penres'))assert.ok(!days.some(d=>d.city==='pen'&&['entopia','escape'].includes(d.item[0])),`${name} entopia/escape stay with the resort`);
  for(const d of days)if(!d.travel&&d.item[0]==='kid')assert.ok(![0,2,6].includes(new Date(d.date+'T00:00:00Z').getUTCDay()),`${name} KidZania weekday`);
  const seen=new Set();for(const d of days){if(d.travel||d.item[0]==='rest')continue;const k=`${['kk','resort'].includes(d.city)?'sabah':['pen','penres'].includes(d.city)?'pen':d.city}:${d.item[0]}`;assert.ok(!seen.has(k),`${name} repeats ${k}`);seen.add(k);}
 }
});
test('Kuala Lumpur week and penres lists exist in the activity tables',()=>{
 assert.ok(ACT.kl.some(a=>a[0]==='aquaria'));assert.deepEqual(ACT.penres.map(a=>a[0]),['rest','entopia','escape']);assert.deepEqual(ACT.pen.map(a=>a[0]),['rest','old','hill','entopia','escape']);assert.deepEqual(ACT.kk.map(a=>a[0]),['rest','island','culture','beach']);assert.doesNotMatch(ACT.penres[0][2],/留白/);
});
test('return flight text follows the last stop',()=>{
 const last=id=>planDays({stops:preset(id)}).at(-1);
 assert.match(last('klpenkl').flight,/CI722 吉隆坡 14:35→台北 19:15（A350）/);
 assert.match(last('pen').flight,/CI732 檳城 15:20→台北 19:55（A321neo 窄體）.*多點進出/);
 assert.match(last('balanced').flight,/AK1510 亞庇 08:40→台北 11:55/);assert.match(last('balanced').flight,/華航不飛亞庇/);assert.match(last('balanced').flight,/CI722/);assert.match(last('balanced').flight,/不建議 2\/8 當天轉機/);
 assert.match(last('reverse').flight,/多點進出/);
 assert.match(returnPlan('ipoh'),/沒有國際線.*CI722/);assert.match(returnPlan('penres'),/CI732/);
 assert.match(last('land').title,/檳城 → 台北・回程/);assert.match(last('klpenkl').title,/吉隆坡 → 台北・回程/);
});
