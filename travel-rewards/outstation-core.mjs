// 外站票：從外站開一張來回獎勵票，在台北停留，一張票飛兩趟（目的地一趟、外站一趟）
// 比法：同樣兩趟旅行，一張外站票要幾哩，對上同一家計畫分開換「台北來回目的地」＋「台北來回外站」
import {programAccess} from './trip-core.mjs?v=20261031-4';

export const OUTSTATIONS=[{id:'HKG',zh:'香港'},{id:'TYO',zh:'東京'}];
const TPE={lat:25.0797,lng:121.2342};
const LONG_HAUL=['歐洲','北美','大洋洲'];
// 自家航班票：第一段與最後一段（外站⇄台北）也要是這家飛的
const OWN_CARRIER={'ci-miles':['CI','華航'],'eva-miles':['BR','長榮'],'sq-miles':['SQ','新航'],'ap-account':['AC','加航']};

export function greatCircle(a,b){
  const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLng=(b.lng-a.lng)*r;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;
  return Math.round(3958.8*2*Math.asin(Math.sqrt(h)));
}

// 一個城市的來回哩數：單程表乘 2，只有來回表的照原數；chart 給了就只看那張表
export function roundTrip(entry,cabin,chart){
  const options=(entry?.options||[]).filter(item=>Number.isInteger(item[cabin])&&(!chart||item.chart===chart));
  if(!options.length)return null;
  const cost=item=>item.roundtrip_only?item[cabin]:item[cabin]*2;
  const best=[...options].sort((a,b)=>cost(a)-cost(b))[0];
  return {miles:cost(best),option:best};
}

// 規則有，但網站資料推不出來的特例
function special(rule,origin,city,data){
  const own=rule.chart==='own'&&OWN_CARRIER[rule.program];
  if(own&&!Object.values(data.routes?.[origin]?.nonstop||{}).flat().includes(own[0]))return own[1]+'自家航班沒有飛桃園到'+({HKG:'香港',TYO:'東京'}[origin]||origin)+'，第一段和最後一段開不出來，要改用夥伴票。';
  if(rule.program==='ana-miles'&&rule.chart==='own')return origin==='TYO'?'ANA 自家票從日本出發不能停留。':'香港到台北沒有 ANA 班機，要改用夥伴票。';
  if(rule.program==='eva-miles'&&rule.chart==='own'&&!LONG_HAUL.includes(city.region))return '長榮自家票只有歐洲、美洲、大洋洲的來回票能停留，'+city.zh+'是短程線。';
  return null;
}

export function outstationPlans({data,cities,origin,city:cityId,cabin='Y',inventory={},today}){
  const city=cities.find(c=>c.id===cityId),from=cities.find(c=>c.id===origin);
  const plans=[],blocked=[],seen=new Set();
  const direct=greatCircle(from,city),via=greatCircle(from,TPE)+greatCircle(TPE,city),detour=via/direct;
  for(const rule of data.stopoverRules||[]){
    const key=rule.program+':'+rule.chart;
    if(seen.has(key))continue;
    seen.add(key);
    const program=data.awards.find(p=>p.id===rule.program);
    if(!program)continue;
    const base={rule,program};
    if(rule.outstation_ok==='no'||!(rule.stopovers?.roundtrip>=1)){
      blocked.push({...base,reason:rule.stopovers?.roundtrip==null?'停留規則官網沒寫，'+rule.outstation_note:rule.outstation_note});continue;
    }
    const why=special(rule,origin,city,data);
    if(why){blocked.push({...base,reason:why});continue;}
    let out=roundTrip(data.outstation?.awards?.[origin]?.[rule.program]?.[cityId],cabin,rule.chart);
    // 距離計價：外站票要照「外站→台北→目的地」的實際距離重查級距，不能用外站直飛的價格
    if(rule.pricing==='distance'&&rule.chart==='partner'&&data.distanceCharts?.[rule.program]){
      const zone=out?.option.zone||(program.cities?.[cityId]?.options||[]).find(o=>o.chart===rule.chart&&o.zone)?.zone;
      const table=rule.program==='ap-account'?data.distanceCharts['ap-account'][zone]:data.distanceCharts[rule.program];
      const span=rule.program==='ap-account'?via:via*2,band=(table||[]).find(b=>span>=b.lo&&span<=b.hi);
      if(!band||!Number.isInteger(band[cabin])){blocked.push({...base,reason:'經台北的距離約 '+span.toLocaleString('en-US')+' 英里，落在查不到的級距，要到官網試訂。',nodata:true});continue;}
      out={miles:rule.program==='ap-account'?band[cabin]*2:band[cabin],option:{estimate:true,repriced:true,route:'經台北：'+(rule.program==='ap-account'?'每個方向':'來回合計')+'約 '+span.toLocaleString('en-US')+' 英里，落在 '+band.lo.toLocaleString('en-US')+'–'+band.hi.toLocaleString('en-US')+' 英里級距'}};
    }
    if(!out){blocked.push({...base,reason:'規則准停留，但'+from.zh+'出發到'+city.zh+'查不到固定的哩數表。',nodata:true});continue;}
    if(rule.program==='ap-account'&&detour>2){blocked.push({...base,reason:'經台北的飛行距離超過直飛的 2 倍，Aeroplan 不接受。'});continue;}
    const home=roundTrip(program.cities?.[cityId],cabin,rule.chart);
    if(['eva-miles','ana-miles'].includes(rule.program)&&rule.pricing==='zone'&&home&&home.miles>out.miles){
      blocked.push({...base,reason:'台北到'+city.zh+'的哩數比'+from.zh+'出發還高，停留點到目的地不能比起點貴，規則不准。'});continue;
    }
    const stops=Math.min(rule.stopovers.roundtrip,2),fee=(rule.stopovers.cost_miles||0)*stops;
    const total=out.miles+fee;
    const leg=roundTrip(program.cities?.[cityId],cabin),visit=roundTrip(program.cities?.[origin],cabin);
    const separate=leg&&visit?leg.miles+visit.miles:null;
    plans.push({...base,stops,fee,total,out,leg,visit,separate,saving:separate==null?null:separate-total,
      estimate:!!out.option.estimate||rule.pricing==='distance',detour,
      access:programAccess(rule.program,inventory,data.transfers,total,today)});
  }
  plans.sort((a,b)=>(b.saving??-Infinity)-(a.saving??-Infinity)||a.total-b.total);
  // 第一張票的起步：先從台北到外站，取各家單程最少的
  const starts=data.awards.map(p=>{
    const m=(p.cities?.[origin]?.options||[]).filter(o=>Number.isInteger(o.Y)&&!o.roundtrip_only).map(o=>o.Y).sort((a,b)=>a-b)[0];
    return m?{program:p,miles:m}:null;
  }).filter(Boolean).sort((a,b)=>a.miles-b.miles);
  return {plans,blocked,start:starts[0]||null,direct,via,detour};
}
