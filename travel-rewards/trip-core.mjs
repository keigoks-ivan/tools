// 「出去玩」的計算：依使用者的起點，算每個哩程／飯店計畫要多少、夠不夠、差多少要從哪裡轉
// 資料（獎勵表、轉點表、連結）由呼叫端傳入，這裡不讀網路也不讀 DOM

export const HOTEL_PROGRAM_IDS=['marriott','hilton','ihg','hyatt','all'];
// 飯店計畫對應的點數資源與會籍資源；有其中一項就算「有這家」
export const HOTEL_ACCESS={
  marriott:{points:'marriott-points',status:['mb-ambassador','mb-titanium','mb-platinum-exact','mb-platinum','mb-gold','mb-silver','mb-base']},
  hilton:{points:'hilton-points',status:['hh-diamond','hh-gold','hh-silver','hh-base']},
  ihg:{points:'ihg-points',status:['ihg-diamond','ihg-platinum','ihg-gold','ihg-silver','ihg-club','ihg-account']},
  hyatt:{points:'hyatt-points',status:['hyatt-globalist','hyatt-explorist','hyatt-discoverist','hyatt-account']},
  all:{points:'all-points',status:['all-diamond','all-platinum','all-gold','all-silver','all-account']}
};

// 目前能用的轉點列：來源點數要在手上、在有效期間內；世界卡專屬比例要有國泰世華世界卡，有的話取代一般比例
export function usableTransfers(transfers,owned,today,to){
  const rows=transfers.filter(row=>row.to===to&&owned.has(row.from)&&!(row.valid_until&&row.valid_until<today)&&!(row.valid_from&&row.valid_from>today)&&(row.tier!=='world'||owned.has('cube-world')));
  return rows.filter(row=>!(row.tier==='normal'&&rows.some(other=>other.tier==='world'&&other.from===row.from)));
}
// 轉 need 點入帳，最少要投入多少來源點數；照最低量與增量單位取整
export function transferInput(need,row){
  if(!(need>0))return 0;
  const unitIn=row.unit||row.in,minIn=row.min||row.in;
  const raw=Math.ceil(need*row.in/row.out);
  const rounded=Math.ceil(raw/unitIn)*unitIn;
  return Math.max(rounded,minIn);
}
export function transferOutput(input,row){return Math.floor(input/row.in)*row.out;}
// 單一來源都不夠時，把幾家點數湊起來：先用每哩花點數較少的來源（同比例照原順序），每家照最低量與單位取整
// 回傳 {parts,left}；left>0 表示全部湊起來還差多少哩。比較比例用交叉相乘，留在整數空間
export function combineTransfers(shortfall,routes){
  if(!(shortfall>0))return null;
  const best=new Map();
  for(const row of routes){
    if(!Number.isFinite(row.sourceBalance))continue;
    const prev=best.get(row.from);
    if(!prev||row.in*prev.out<prev.in*row.out)best.set(row.from,row);
  }
  const rows=[...best.values()].sort((a,b)=>a.in*b.out-b.in*a.out);
  let left=shortfall;const parts=[];
  for(const row of rows){
    if(left<=0)break;
    const need=transferInput(left,row);
    if(need<=row.sourceBalance){parts.push({...row,input:need,output:transferOutput(need,row)});left=0;break;}
    const unitIn=row.unit||row.in,minIn=row.min||row.in;
    const max=Math.floor(row.sourceBalance/unitIn)*unitIn,out=transferOutput(max,row);
    if(max<minIn||out<=0)continue;
    parts.push({...row,input:max,output:out});left-=out;
  }
  return parts.length?{parts,left:Math.max(0,left)}:null;
}
// 用現金票價換算每一哩值多少：扣掉獎勵票自付的稅金與附加費，再除以哩數
export function cashValue(cash,tax,milesTotal){
  if(!(cash>0)||!(milesTotal>0))return null;
  const net=cash-(tax>0?tax:0);
  return net>0?net/milesTotal:0;
}

// 一個城市可能有自家與夥伴兩張表；依艙等挑哩數較少的一條，其他留作「另一條路線」
function miles(entry,cabin,pax,trip){
  const options=(entry?.options||[entry]).filter(item=>item&&Number.isInteger(item[cabin]));
  if(!options.length)return null;
  const cost=item=>item[cabin]*(item.roundtrip_only?1:(trip==='roundtrip'?2:1))*pax;
  const sorted=[...options].sort((a,b)=>cost(a)-cost(b)),best=sorted[0];
  return {each:best[cabin],total:cost(best),roundtripOnly:!!best.roundtrip_only,option:best,alts:sorted.slice(1).map(item=>({option:item,each:item[cabin],total:cost(item)}))};
}
// 一個計畫的入口：自己有這種哩程／帳戶，或能從手上的銀行點數轉過去
function access(programId,owned,balances,transfers,need,today){
  const has=owned.has(programId);
  const balance=Number.isFinite(balances[programId])?balances[programId]:null;
  const rows=usableTransfers(transfers,owned,today,programId);
  const shortfall=need==null?null:Math.max(0,need-(balance??0));
  const routes=rows.map(row=>{
    const input=shortfall?transferInput(shortfall,row):0,have=Number.isFinite(balances[row.from])?balances[row.from]:null;
    return {...row,input,output:transferOutput(input,row),sourceBalance:have,enough:have==null?null:have>=input};
 }).sort((a,b)=>Number(b.enough===true)-Number(a.enough===true));
  let state='none',combo=null;
  if(has&&balance!=null&&need!=null&&balance>=need)state='enough';
  else if(routes.some(route=>route.enough===true)&&(has||routes.length))state=has?'topup':'transfer-enough';
  else if(shortfall>0&&(combo=combineTransfers(shortfall,routes))&&combo.parts.length>1&&combo.left===0)state='combo';
  else if(has)state='have';
  else if(routes.length)state='transfer';
  return {has,balance,shortfall,routes,state,combo:combo&&combo.parts.length>1?combo:null};
}

const ORDER={enough:0,topup:1,'transfer-enough':2,combo:3,have:4,transfer:5,none:6};
export function flightOptions({awards,transfers,inventory,city,cabin='Y',pax=1,trip='oneway',today}){
  const owned=new Set(inventory.resources||[]),balances=inventory.balances||{};
  const list=[];
  for(const program of awards){
    const entry=program.cities?.[city];
    if(!entry)continue;
    const need=miles(entry,cabin,pax,trip);
    list.push({program,entry,need,...access(program.id,owned,balances,transfers,need?.total??null,today)});
  }
  return list.sort((a,b)=>ORDER[a.state]-ORDER[b.state]||(a.need?.total??Infinity)-(b.need?.total??Infinity));
}

export function hotelOptions({programs,transfers,inventory,today}){
  const owned=new Set(inventory.resources||[]),balances=inventory.balances||{};
  return programs.map(program=>{
    const map=HOTEL_ACCESS[program.id]||{points:null,status:[]};
    const tier=map.status.find(id=>owned.has(id))||null;
    const pointsId=map.points,hasPoints=!!pointsId&&owned.has(pointsId);
    const rows=pointsId?usableTransfers(transfers,owned,today,pointsId):[];
    const state=hasPoints?'points':tier?'member':rows.length?'transfer':'none';
    return {program,tier,hasPoints,balance:hasPoints&&Number.isFinite(balances[pointsId])?balances[pointsId]:null,routes:rows,state};
  }).sort((a,b)=>['points','member','transfer','none'].indexOf(a.state)-['points','member','transfer','none'].indexOf(b.state));
}

// 樣板網址：{query}{checkin}{checkout}{adults}{from}{to}，沒有日期時拿掉含空值的參數
export function fillTemplate(template,values){
  let url=template;
  for(const [key,value] of Object.entries(values))url=url.replaceAll('{'+key+'}',encodeURIComponent(value??''));
  try{
    const parsed=new URL(url);
    for(const [key,value] of [...parsed.searchParams])if(value==='')parsed.searchParams.delete(key);
    return parsed.href;
  }catch{return url;}
}

// 外站票工具也要判斷「這家計畫你接不接得上」
export function programAccess(programId,inventory,transfers,need,today){
  return access(programId,new Set(inventory.resources||[]),inventory.balances||{},transfers,need,today);
}

// ---- 稅金與附加費、每哩值標籤、最早訂票日、整趟點數 ----

// 台北出發的稅金＋燃油附加費＋訂位費（每人單程，新台幣）：依計畫、區域、艙等、表別（own／partner）找
// 該表別有列但官網沒有金額 → 回傳 {row,amount:null}；該表別根本沒有列才退回同計畫同區域任一筆有金額的列（fallback:true）
export function findCashFee(fees,{program,region,cabin,chart}){
  const same=(fees||[]).filter(row=>row.program===program&&row.region===region);
  if(!same.length)return null;
  const rank=row=>(chart&&row.chart===chart?0:2)+(row.cabin===cabin?0:1);
  const sorted=[...same].sort((a,b)=>rank(a)-rank(b));
  const exact=chart?sorted.filter(row=>row.chart===chart):[];
  if(exact.length){
    const hit=exact.find(row=>row.total_twd!=null&&row.cabin===cabin)||exact.find(row=>row.total_twd!=null);
    return hit?{row:hit,amount:hit.total_twd,fallback:false}:{row:exact[0],amount:null,fallback:false};
  }
  const hit=sorted.find(row=>row.total_twd!=null);
  return hit?{row:hit,amount:hit.total_twd,fallback:true}:{row:sorted[0],amount:null,fallback:true};
}
// 一張票的稅費：每人單程金額 × 單程／來回（來回表本身就是來回票，也算兩段）× 人數
export function cashFeeTotals(amount,{trip,roundtripOnly,pax}){
  if(!Number.isInteger(amount))return null;
  const legs=trip==='roundtrip'||roundtripOnly?2:1;
  return {legs,perPerson:amount*legs,total:amount*legs*pax};
}

// 每哩值對照成本：單位為 0.01 元的整數，比較時不用浮點
export function valueTier(valuePerMile,costPerMile){
  if(valuePerMile==null||!(costPerMile>0))return null;
  const v=Math.round(valuePerMile*100),c=Math.round(costPerMile*100);
  if(!(c>0))return null;
  if(v<c)return {tier:'bad',text:'不如拿現金回饋'};
  if(v<2*c)return {tier:'neutral',text:'普通'};
  return {tier:'ok',text:'划算'};
}

// 最早哪天開放兌換：出發日往前推 N 天（UTC 日曆日相減，與時區無關）
// 表別 own 用 own_days、partner 用 partner_days；沒有表別（國泰）當自家
export function earliestBooking({depart,chart,window,today}){
  if(!depart||!window)return null;
  const own=window.own_days??null,partner=window.partner_days??null;
  const days=chart==='partner'?partner:own;
  if(!Number.isInteger(days)){
    if(chart==='partner'&&Number.isInteger(own))return {kind:'partner-later'};
    return {kind:'unknown'};
  }
  const [y,m,d]=depart.split('-').map(Number);
  if(!y||!m||!d)return null;
  const date=new Date(Date.UTC(y,m-1,d)-days*86400000).toISOString().slice(0,10);
  return {kind:today&&date<=today?'open':'date',date,days};
}

// 飯店點數參考估值：每點的美分（以 0.1 美分為單位的整數）換成新台幣，四捨五入到 0.01，回傳以 0.01 元為單位的整數
export function referencePointCents(tenthCents,usdRate){
  if(!Number.isInteger(tenthCents)||!(usdRate>0))return null;
  return Math.round(tenthCents*usdRate/10);
}
// Hyatt 標準房每晚點數：類別 1–8 × 五級（0 最低到 4 最高）
export function hyattNightPoints(table,category,level){
  const row=table?.['c'+category];
  return row&&Number.isInteger(row[level])?row[level]:null;
}

// 整趟點數：機票哩數與飯店點數可能要從同一家銀行轉，銀行餘額共用，要合併扣
// reqs：[{key,label,target,need,own}]，target 是要轉進去的資源 id，own 是目標帳戶已有的點數（先用掉）
// 機票排在前面，不夠時機票優先。每一項先列出各種轉法（單一來源、湊幾家、什麼都不轉），
// 再找出彼此不超過銀行餘額、沒達成件數最少的組合
export function tripTotals({reqs,transfers,owned,balances,today}){
  const bal=id=>Number.isFinite(balances?.[id])?balances[id]:null;
  const items=reqs.map(req=>{
    const own=Math.min(req.need,Math.max(0,req.own||0));
    return {...req,ownUsed:own,shortfall:Math.max(0,req.need-own),rows:usableTransfers(transfers,owned,today,req.target)};
  });
  // 在指定的剩餘餘額下，一項要求有哪些轉法
  const plansFor=(item,remaining)=>{
    if(!(item.shortfall>0))return [{parts:[],left:0}];
    const routes=item.rows.map(row=>({...row,sourceBalance:Number.isFinite(remaining[row.from])?remaining[row.from]:null}));
    const plans=[];
    for(const row of routes){
      if(row.sourceBalance==null)continue;
      const input=transferInput(item.shortfall,row);
      if(input<=row.sourceBalance)plans.push({parts:[{...row,input,output:transferOutput(input,row)}],left:0});
    }
    const combo=combineTransfers(item.shortfall,routes);
    if(combo)plans.push({parts:combo.parts,left:combo.left});
    plans.push({parts:[],left:item.shortfall});
    return plans;
  };
  const used=(chosen,id)=>chosen.reduce((sum,plan)=>sum+plan.parts.filter(part=>part.from===id).reduce((s,part)=>s+part.input,0),0);
  const feasible=chosen=>{
    const ids=new Set(chosen.flatMap(plan=>plan.parts.map(part=>part.from)));
    return [...ids].every(id=>used(chosen,id)<=(bal(id)??0));
  };
  const score=chosen=>[chosen.filter(plan=>plan.left>0).length,...chosen.map(plan=>plan.left),chosen.reduce((n,plan)=>n+plan.parts.length,0),chosen.reduce((n,plan)=>n+plan.parts.reduce((s,part)=>s+part.input,0),0)];
  const better=(a,b)=>{const x=score(a),y=score(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]<y[i];return false;};
  const full=Object.fromEntries([...new Set(items.flatMap(item=>item.rows.map(row=>row.from)))].map(id=>[id,bal(id)]));
  const candidates=[];
  // 各項用完整餘額列出的轉法，取彼此不超過餘額的組合
  let combos=[[]];
  for(const item of items)combos=combos.flatMap(prefix=>plansFor(item,full).map(plan=>[...prefix,plan]));
  candidates.push(...combos.filter(feasible));
  // 依序扣：先扣前一項用掉的餘額，再算下一項（湊出不同拆法）
  const sequential=order=>{
    const remaining={...full},chosen=[];
    for(const index of order){
      const plan=plansFor(items[index],remaining).sort((a,b)=>(a.left>0)-(b.left>0)||a.left-b.left||a.parts.length-b.parts.length)[0];
      for(const part of plan.parts)remaining[part.from]-=part.input;
      chosen[index]=plan;
    }
    return chosen;
  };
  if(items.length>1){
    candidates.push(sequential(items.map((_,i)=>i)),sequential(items.map((_,i)=>i).reverse()));
  }else candidates.push(sequential([0]));
  const best=candidates.filter(feasible).reduce((a,b)=>!a||better(b,a)?b:a,null)||items.map(item=>({parts:[],left:item.shortfall}));
  const banks=[...new Set(best.flatMap(plan=>plan.parts.map(part=>part.from)))].map(id=>{
    const byKey=Object.fromEntries(items.map((item,i)=>[item.key,used([best[i]],id)]));
    const total=used(best,id);
    return {id,balance:bal(id),usedBy:byKey,used:total,remaining:(bal(id)??0)-total};
  });
  const remainingAfter=id=>(bal(id)??null)==null?null:bal(id)-used(best,id);
  const out=items.map((item,i)=>{
    const plan=best[i];
    // 還差的部分，建議改從哪家補：每家取最划算的一列，算還要多少點
    const suggest=plan.left>0?[...new Map(item.rows.map(row=>[row.from,row])).values()].map(row=>{
      const input=transferInput(plan.left,row),rest=remainingAfter(row.from);
      return {from:row.from,input,output:transferOutput(input,row),remaining:rest,gap:rest==null?null:Math.max(0,input-rest)};
    }).sort((a,b)=>(a.gap??Infinity)-(b.gap??Infinity)||a.input-b.input):[];
    return {key:item.key,label:item.label,unit:item.unit,target:item.target,need:item.need,ownUsed:item.ownUsed,shortfall:item.shortfall,parts:plan.parts,left:plan.left,suggest,hasRoute:item.rows.length>0};
  });
  return {items:out,banks,allMet:out.every(item=>item.left===0)};
}
