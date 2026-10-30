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
