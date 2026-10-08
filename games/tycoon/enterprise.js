import { clamp, random, company, dateOf, note, spend, receive, expense, finishDay, commonValid, payable, profit, END_DAY } from './venture-core.js';
import { management, managementAction, managementValid, managementRecord } from './manager-policy.js';

export const ENTERPRISES = {
  hotel: { name:'旅宿經營', category:'門店與資產', kind:'hotel', capital:4000000, setup:1800000, asset:true, wage:34000, rent:260000, staff:6, capacity:24, price:2600, cost:900, marketing:24000, qualityBudget:18000, autoBudget:160000, unit:'間夜', channelNames:['直訂與商務客','訂房平台與旅客'], factors:'房價、入住率、每房收益、平台佣金、房務品質', brief:'房間今晚沒賣掉就失去收入；旺季也要留得住服務品質。', expansion:800000 },
  equipment: { name:'工業設備製造', category:'製造與工業', kind:'project', capital:12000000, setup:5000000, asset:true, wage:48000, rent:140000, staff:4, capacity:4, price:100, cost:9000, work:80, quote:2200000, marketing:40000, qualityBudget:32000, autoBudget:1500000, unit:'工程單位', term:60, depositRate:.25, inspection:3, serviceRate:.025, serviceWork:.25, channelNames:['標準設備','客製整合'], factors:'長約報價、零組件周轉、產能、驗收、售後保固', brief:'訂金未必付得完零組件；設備驗收後，尾款還要等 60 天。', expansion:2200000 },
  ecommerce: { name:'電商自有品牌', category:'品牌與零售', kind:'commerce', capital:1200000, setup:180000, asset:false, wage:32000, rent:28000, staff:2, capacity:40, price:850, cost:330, marketing:26000, qualityBudget:9000, autoBudget:360000, unit:'件', channelNames:['品牌官網','電商平台'], factors:'定價、獲客成本、庫存週轉、缺貨、退貨、通路費', brief:'廣告不等於訂單，訂單不等於利潤；庫存先占用現金，退貨還會吃掉毛利。', expansion:180000 },
  ai: { name:'企業 AI 服務', category:'網路與科技', kind:'project', capital:1800000, setup:200000, asset:false, wage:60000, rent:30000, staff:3, capacity:3, price:100, cost:5500, work:36, quote:400000, marketing:28000, qualityBudget:16000, autoBudget:180000, unit:'工程人日', term:45, depositRate:.3, inspection:2, serviceRate:.1, serviceWork:.4, channelNames:['標準雲端方案','私有資料整合'], factors:'企業銷售、算力成本、資料驗證、交付、維運續約', brief:'導入案要驗證資料與效果，交付後仍要支付推論及維運成本。', expansion:260000 },
  agency: { name:'數位代理商', category:'網路與服務', kind:'project', capital:1000000, setup:120000, asset:false, wage:42000, rent:20000, staff:3, capacity:3, price:100, cost:800, work:35, quote:230000, marketing:18000, qualityBudget:8000, autoBudget:120000, unit:'專案人日', term:30, depositRate:.35, inspection:1, serviceRate:.08, serviceWork:.2, channelNames:['明確範圍交付','客製深度服務'], factors:'專案毛利、人力利用、修改次數、交期、客戶集中', brief:'固定總價的專案，多一次修改就多占用人力；不能只看接案金額。', expansion:150000 },
  security: { name:'資安服務公司', category:'網路與科技', kind:'project', capital:2400000, setup:400000, asset:false, wage:70000, rent:35000, staff:3, capacity:3, price:100, cost:2200, work:45, quote:550000, marketing:28000, qualityBudget:22000, autoBudget:240000, unit:'專業人日', term:45, depositRate:.25, inspection:2, serviceRate:.15, serviceWork:.6, channelNames:['稽核與檢測','監控與應變'], factors:'專業人才、稽核交付、監控負載、SLA、事故責任', brief:'專案之外還要守住既有客戶；新案接太多，監控服務也會承受風險。', expansion:300000 },
};
const known = id => typeof id==='string' && Object.hasOwn(ENTERPRISES,id);
export const enterpriseFixed = w => w.staff*ENTERPRISES[w.businessId].wage + ENTERPRISES[w.businessId].rent*(.6+.4*w.capacity/ENTERPRISES[w.businessId].capacity) + w.marketing + w.qualityBudget + w.capacity*(w.businessId==='hotel'?1200:800);
export const enterpriseManagement = w => management(w,enterpriseFixed(w));
export const enterpriseManagementAction = (w,data) => managementAction(w,data,enterpriseFixed(w));
export function createEnterprise(id='hotel',seed=20261008) {
  if(!known(id)) throw new Error('未知事業');
  const p=ENTERPRISES[id],w={v:1,mode:'enterprise',businessId:id,day:0,rng:seed>>>0,status:'playing',co:company(p.capital),staff:p.staff,capacity:p.capacity,price:p.price,marketing:p.marketing,qualityBudget:p.qualityBudget,channel:0,targetDays:14,quality:.6,reputation:.5,wear:0,stock:{qty:0,value:0},shipments:[],orders:[],offers:[],receivables:[],clients:[],seq:1,event:null,shock:null,expansion:null,today:{sales:0,demand:0,returns:0,produced:0,utilization:0,revenue:0},stats:{sales:0,returns:0,missed:0,delivered:0,cancelled:0,lostBids:0,serviceRevenue:0}};
  if(p.asset){spend(w,p.setup,'capex');w.co.assets=p.setup;}else expense(w,'research',p.setup,true);
  enterpriseManagementAction(w,{enabled:true,budget:p.autoBudget,maxFixed:Math.ceil(enterpriseFixed(w)*1.6)});
  note(w,p.brief); if(p.kind==='project') generateOffers(w); return w;
}
function generateOffers(w) {
  const p=ENTERPRISES[w.businessId];
  for(let i=0;i<3;i++) {
    const work=Math.round(p.work*(.65+random(w)*.65)*(w.channel?1.2:1)),days=30+i*18+(w.businessId==='equipment'?20:0),quote=Math.round(p.quote*work/p.work*(.94+random(w)*.16)*(w.channel?1.15:1));
    w.offers.push({id:'client-'+w.seq++,client:['禾豐企業','青川品牌','星河集團'][i],work,quote,due:w.day+days,expires:w.day+30,term:p.term,depositRate:p.depositRate,inspection:p.inspection+(w.channel?1:0),scope:w.channel});
  }
  w.offers=w.offers.slice(-6);
}
export function enterpriseMetrics(w) {
  const p=ENTERPRISES[w.businessId],dim=dateOf(w.day).dim,season=1+.25*Math.sin((w.day+25)/58),competition=1+w.day/END_DAY*.45,shock=w.shock&&w.day<w.shock.until?w.shock:{cost:1,demand:1};
  const serviceWork=w.clients.filter(c=>c.until>w.day).reduce((n,c)=>n+c.work,0), capacity=p.kind==='hotel'?Math.min(w.capacity,w.staff*7):p.kind==='commerce'?Math.min(w.capacity,w.staff*22):Math.min(w.capacity,w.staff*.85)*(.72+w.quality*.4);
  const freeCapacity=Math.max(0,capacity-serviceWork),fixed=enterpriseFixed(w),defects=clamp(.02+(1-w.quality)*.06+w.wear*.06,.01,.2),priceRatio=w.price/p.price;
  const demand=p.kind==='hotel'?Math.max(0,(10+w.marketing/8000)*season*(.7+w.reputation*.6)*Math.pow(priceRatio,-1.4)*(w.channel?1.28:.88)*shock.demand/competition):p.kind==='commerce'?Math.max(0,(4+w.marketing/dim/75)*(.65+w.reputation*.7)*Math.pow(priceRatio,-1.2)*(w.channel?1.35:1)*shock.demand/competition):0;
  const variable=p.kind==='hotel'?p.cost*shock.cost+(w.channel?.15:.025)*w.price:p.kind==='commerce'?p.cost*shock.cost+65+(w.channel?.14:.045)*w.price:p.cost*shock.cost;
  const returnRate=p.kind==='commerce'?clamp(.035+(1-w.quality)*.14+(w.channel?.02:0),.02,.25):0;
  const sold=p.kind==='hotel'?Math.min(demand,capacity):p.kind==='commerce'?Math.min(demand,capacity,w.stock.qty):0;
  const contribution=p.kind==='hotel'?w.price-variable:p.kind==='commerce'?w.price*(1-returnRate)-variable+p.cost*returnRate*.5:null;
  const reserve=Math.ceil(payable(w)+fixed*enterpriseManagement(w).reserveMonths+Math.round(w.co.debt*.08/12)+Math.ceil(w.co.debt/24)+Math.max(0,profit(w.co.ledger)-w.co.taxLoss)*.2);
  const serviceLoad=capacity?serviceWork/capacity:Infinity;
  return {fixed,capacity,freeCapacity,serviceWork,serviceLoad,demand,sold,defects,returnRate,variable,contribution,monthlyResult:contribution===null?null:sold*contribution*dim-fixed,breakEven:contribution>0?Math.ceil(fixed/contribution):null,reserve,available:Math.max(0,Math.floor(w.co.cash-reserve)),unitCost:p.cost*shock.cost,occupancy:p.kind==='hotel'&&w.capacity?sold/w.capacity:0,revpar:p.kind==='hotel'&&w.capacity?sold*w.price/w.capacity:0};
}
export function enterpriseQuote(w,o,factor=1) {
  const p=ENTERPRISES[w.businessId],m=enterpriseMetrics(w),quote=Math.round(o.quote*w.price/100*factor),deposit=Math.round(quote*o.depositRate),prior=w.orders.filter(x=>x.due<=o.due).reduce((n,x)=>n+Math.max(0,x.work-x.progress),0);
  const days=m.freeCapacity>0?Math.ceil((prior+o.work)/m.freeCapacity):null,material=p.kind==='project'&&w.businessId==='equipment'?Math.ceil(o.work/(1-m.defects)):o.work;
  const variable=material*m.unitCost,allocated=m.freeCapacity>0?m.fixed*o.work/m.freeCapacity/dateOf(w.day).dim:null,estimatedFinish=days===null?null:w.day+days-1+o.inspection+(w.businessId==='equipment'&&w.stock.qty<material?7:0),finish=estimatedFinish===null||estimatedFinish>=END_DAY?null:estimatedFinish;
  const late=finish===null?null:Math.round(quote*Math.min(.2,Math.max(0,finish-o.due)*.015));
  const allowance=Math.min(m.available+deposit,enterpriseManagement(w).remaining),nearCash=w.businessId==='equipment'?Math.max(0,Math.min(material,Math.ceil(m.capacity*14))-w.stock.qty-w.shipments.reduce((n,x)=>n+x.qty,0))*m.unitCost:0;
  return {quote,deposit,finish,days,variable,allocated,result:finish===null?null:quote-variable-allocated-late,late,shortage:Math.max(0,Math.ceil(nearCash-allowance)),chance:clamp(.58+(w.reputation-.5)*.6+(1-w.price/100*factor)*2,.1,.9)};
}
export function enterprisePlan(w) {
  const p=ENTERPRISES[w.businessId],m=enterpriseMetrics(w),a=enterpriseManagement(w),issues=[];
  const pending=w.orders.reduce((n,o)=>n+Math.max(0,o.work-o.progress),0),targetStaff=p.kind==='hotel'?Math.ceil(w.capacity/7):p.kind==='commerce'?Math.ceil(m.demand/22):Math.ceil((Math.min(w.capacity,pending/14)+m.serviceWork)/.85);
  const staff=Math.max(w.staff,Math.min(20,targetStaff)),hiring=(staff-w.staff)*12000,nextFixed=m.fixed+(staff-w.staff)*p.wage;
  const reserve=m.reserve+(nextFixed-m.fixed)*a.reserveMonths,canHire=nextFixed<=a.maxFixed&&hiring<=Math.min(a.remaining,Math.max(0,w.co.cash-reserve));
  if(staff>w.staff&&!canHire)issues.push('人力需求超出授權或現金保留，需調整預算或放慢擴張。');
  if(m.fixed>a.maxFixed)issues.push('固定月費已超過授權；團隊不會自行裁員或刪減老闆的投資。');
  const days=p.kind==='commerce'?w.targetDays:14,needed=p.kind==='commerce'?Math.ceil(m.demand*days):w.businessId==='equipment'?Math.min(Math.ceil(pending/(1-m.defects)),Math.ceil(m.capacity*days)):0;
  const gap=Math.max(0,needed-w.stock.qty-w.shipments.reduce((n,x)=>n+x.qty,0)),allowance=Math.max(0,Math.min(a.remaining,Math.max(0,w.co.cash-(canHire?reserve:m.reserve)))-(canHire?hiring:0));
  const qty=w.shipments.length<20?Math.min(gap,Math.floor(allowance/m.unitCost)):0;
  if(gap>qty)issues.push('備貨受月預算或周轉金限制；缺貨與交期仍由公司承擔。');
  if(w.orders.some(o=>{const q=enterpriseQuote(w,{...o,work:Math.max(0,o.work-o.progress),quote:o.quote*100/w.price});return q.finish===null||q.finish>o.due;}))issues.push('已接專案有交期風險；請評估人力、產能或取消代價。');
  if(m.serviceLoad>.8)issues.push('既有維運客戶已占用多數產能；新案可能擠壓服務承諾。');
  if(w.businessId==='hotel'&&w.quality<.45)issues.push('房務品質偏低，房價與入住率可能承壓，請評估維護投資。');
  if(w.businessId==='ecommerce'&&m.returnRate>.12)issues.push('退貨率偏高，請改善商品品質與客戶期待；GMV 不代表淨收入。');
  if(!m.available)issues.push('保留營運及還款現金後沒有餘裕，需老闆處理資金。');
  return {metrics:m,staff:canHire?staff:w.staff,hiring:canHire?hiring:0,qty,cost:Math.round(qty*m.unitCost),issues};
}
export function enterpriseAction(w,action,data={}) {
  const fail=error=>({ok:false,error}),p=ENTERPRISES[w.businessId]; if(w.status!=='playing')return fail('本局已結案。');
  if(action==='management')return enterpriseManagementAction(w,data);
  if(action==='settings') {
    const bounds=p.kind==='hotel'?[400,15000]:p.kind==='commerce'?[100,5000]:[80,140];
    if(!Number.isInteger(data.price)||data.price<bounds[0]||data.price>bounds[1]||!Number.isInteger(data.marketing)||data.marketing<0||data.marketing>500000||!Number.isInteger(data.qualityBudget)||data.qualityBudget<0||data.qualityBudget>100000||![0,1].includes(data.channel)||![7,14,30].includes(data.targetDays))return fail('請填寫有效收費、業務、品質與通路設定。');
    for(const k of ['price','marketing','qualityBudget','channel','targetDays'])w[k]=data[k];note(w,'老闆調整收費、業務投資、品質與通路；已簽合約價格不回溯修改。');
  } else if(action==='bid') {
    if(p.kind!=='project')return fail('這個業態使用每日客源，不使用企業專案投標。');
    const o=w.offers.find(x=>x.id===data.id);if(!o||o.expires<=w.day||![.9,1,1.1].includes(data.factor)||w.orders.length>=8)return fail('詢價已過期、報價不符或已達八份在製專案。');
    const q=enterpriseQuote(w,o,data.factor);w.offers=w.offers.filter(x=>x!==o);if(random(w)>q.chance){w.stats.lostBids++;note(w,'客戶選擇競爭公司，未收訂金。');return {ok:true,message:'未得標；報價與口碑都會影響成交。'};}
    w.orders.push({...o,quote:q.quote,deposit:q.deposit,progress:0,cost:0,revised:false,inspectionReady:null});w.orders.sort((a,b)=>a.due-b.due);receive(w,q.deposit);note(w,`${o.client} 簽約，收訂金 $${q.deposit.toLocaleString()}；驗收後尾款等 ${o.term} 天。`);
  } else if(action==='cancel') {
    const o=w.orders.find(x=>x.id===data.id);if(!o)return fail('專案不存在。');cancel(w,o);
  } else if(action==='renew') {
    if(p.kind!=='project')return fail('這個業態沒有售後維運合約。');
    const c=w.clients.find(x=>x.id===data.id);if(!c||c.until-w.day>15||c.until<w.day)return fail('目前不在續約期。');c.until+=90;note(w,`${c.client} 維運續約 90 天；服務人力及成本繼續由公司負擔。`);
  } else if(action==='expand') {
    if(w.expansion||w.capacity>=(p.kind==='hotel'?100:p.kind==='commerce'?200:12)||w.co.cash<p.expansion)return fail('擴張中、已達規模上限或現金不足。');
    spend(w,p.expansion,'capex');w.co.assets+=p.expansion;w.expansion={ready:w.day+21,add:p.kind==='hotel'?8:p.kind==='commerce'?20:2};note(w,'擴張需 21 天；完成後固定成本和人力需求也會提高。');
  } else if(action==='event') {
    if(!w.event||!['protect','accept'].includes(data.choice))return fail('沒有待決事件。');const cost=w.businessId==='equipment'?80000:40000;
    if(data.choice==='protect'){if(w.co.cash<cost)return fail('現金不足支付改善費。');expense(w,'repair',cost,true);w.quality=clamp(w.quality+.06,0,.95);w.shock={cost:1.05,demand:.98,until:w.day+30};note(w,'投入改善費，降低接下來 30 日的營運衝擊。');}else{w.shock={cost:1.2,demand:.8,until:w.day+30};w.reputation=clamp(w.reputation-.04,.1,.95);if(w.businessId==='security')w.quality=clamp(w.quality-.08,.1,.95);note(w,'保留現金，承擔成本、需求及口碑衝擊。');}w.event=null;
  } else return fail('未知經營操作。');return {ok:true};
}
function cancel(w,o) {spend(w,o.deposit);expense(w,'penalty',Math.round(o.quote*.1),true);if(o.cost)expense(w,'cogs',o.cost);w.orders=w.orders.filter(x=>x!==o);w.stats.cancelled++;w.reputation=clamp(w.reputation-.06,.1,.95);note(w,`${o.client} 取消：退訂金、支付 10% 違約金、認列在製成本。`);}
const count=(w,n)=>Math.floor(n)+(random(w)<n%1?1:0);
function autoRun(w) {
  if(!enterpriseManagement(w).enabled)return;
  if(w.manager.month!==dateOf(w.day).month){w.manager.month=dateOf(w.day).month;w.manager.spent=0;}
  const p=enterprisePlan(w);
  if(p.hiring){expense(w,'research',p.hiring,true);w.staff=p.staff;managementRecord(w,`團隊招聘至 ${w.staff} 人。`,p.hiring);}
  if(p.qty){spend(w,p.cost,'purchases');w.shipments.push({qty:p.qty,value:p.cost,arrival:w.day+7});managementRecord(w,`按需求採購 ${p.qty} 份，七天後到貨。`,p.cost);}
}
export function stepEnterprise(w) {
  if(w.status!=='playing'||w.event)return false;const p=ENTERPRISES[w.businessId],dim=dateOf(w.day).dim;
  for(const s of w.shipments.filter(x=>x.arrival<=w.day)){w.stock.qty+=s.qty;w.stock.value+=s.value;}w.shipments=w.shipments.filter(x=>x.arrival>w.day);
  for(const r of w.receivables.filter(x=>x.due<=w.day))receive(w,r.amount);w.receivables=w.receivables.filter(x=>x.due>w.day);
  if(w.expansion&&w.expansion.ready<=w.day){w.capacity+=w.expansion.add;w.expansion=null;note(w,'新增容量已開放，團隊將在授權內安排人力。');}
  for(const o of [...w.orders])if(w.day>o.due+7)cancel(w,o);
  autoRun(w);const m=enterpriseMetrics(w);let sales=0,demand=0,returns=0,produced=0,revenue=0,serviceReceipts=0;
  if(p.kind==='hotel') {
    demand=count(w,m.demand);sales=Math.min(demand,Math.floor(m.capacity));revenue=sales*w.price;spend(w,sales*m.unitCost,'purchases');expense(w,'cogs',sales*m.unitCost);expense(w,'cloud',sales*w.price*(w.channel?.15:.025));
    if(w.quality<.5)expense(w,'penalty',Math.round(revenue*(.5-w.quality)*.2),true);
  } else if(p.kind==='commerce') {
    demand=count(w,m.demand);sales=Math.min(demand,Math.floor(m.capacity),w.stock.qty);returns=Math.min(sales,count(w,sales*m.returnRate));const recovered=Math.floor(returns*.5),used=sales-recovered,unit=w.stock.qty?w.stock.value/w.stock.qty:0;
    w.stock.qty-=used;w.stock.value-=unit*used;if(!w.stock.qty)w.stock.value=0;expense(w,'cogs',used*unit);revenue=sales*w.price;expense(w,'cloud',sales*(65+w.price*(w.channel?.14:.045)));if(returns)expense(w,'penalty',returns*w.price,true);
    w.stats.returns+=returns;w.stats.missed+=Math.max(0,demand-sales);
  } else {
    const activeClients=w.clients.filter(c=>c.until>w.day),serviceRatio=m.serviceWork?Math.min(1,m.capacity/m.serviceWork):1;
    for(const c of activeClients){const earned=c.fee/dim;revenue+=earned;serviceReceipts+=earned;expense(w,'cloud',c.work*m.unitCost*(w.businessId==='equipment'||w.businessId==='ai'?.08:.35));if(serviceRatio<1)expense(w,'penalty',earned*(1-serviceRatio)*.5,true);w.stats.serviceRevenue+=earned;}
    w.clients=w.clients.filter(c=>c.until>=w.day);
    let available=w.businessId==='equipment'?Math.floor(m.freeCapacity):m.freeCapacity;
    for(const o of [...w.orders].sort((a,b)=>a.due-b.due)) {
      let work=Math.min(available,Math.max(0,o.work-o.progress));if(w.businessId==='equipment') {
        const input=Math.min(available,Math.ceil(work/(1-m.defects)),w.stock.qty),bad=Math.min(input,count(w,input*m.defects));work=Math.min(work,input-bad);const unit=w.stock.qty?w.stock.value/w.stock.qty:0,cost=input*unit;w.stock.qty-=input;w.stock.value-=cost;if(!w.stock.qty)w.stock.value=0;o.cost+=cost;available-=input;
      } else { available-=work; if(work>0)expense(w,'cloud',work*m.unitCost); }
      o.progress+=work;produced+=work;
      if(o.progress+1e-6<o.work)continue;
      if(w.businessId==='agency'&&!o.revised&&o.scope&&random(w)>.35+w.quality*.5){o.work+=Math.ceil(o.work*.2);o.revised=true;note(w,`${o.client} 要求合約範圍內修改，工作量增加 20%，總價保持。`);continue;}
      if(o.inspectionReady===null){o.inspectionReady=w.day+o.inspection;note(w,`${o.client} 進入 ${o.inspection} 日驗收。`);}if(w.day<o.inspectionReady)continue;
      revenue+=o.quote;sales+=o.work;expense(w,'cogs',o.cost);const late=Math.round(o.quote*Math.min(.2,Math.max(0,w.day-o.due)*.015));if(late)expense(w,'penalty',late,true);
      w.receivables.push({client:o.client,due:w.day+o.term,amount:o.quote-o.deposit});w.orders=w.orders.filter(x=>x!==o);w.stats.delivered++;w.reputation=clamp(w.reputation+(late?-.03:.025),.1,.95);
      if(w.clients.length<24)w.clients.push({id:o.id,client:o.client,fee:Math.round(o.quote*p.serviceRate),work:p.serviceWork*(o.scope?1.3:1),until:w.day+90});note(w,`${o.client} 驗收交付；尾款列應收，另有 90 日售後／維運服務承諾。`);
    }
  }
  // 訂金簽約時收現，交付只認列收入；售後維運費每日收現。
  w.co.ledger.revenue+=revenue;receive(w,p.kind==='project'?serviceReceipts:revenue);
  w.co.ledger.sales+=sales;expense(w,'payroll',w.staff*p.wage/dim);expense(w,'rent',p.rent*(.6+.4*w.capacity/p.capacity)/dim);expense(w,'marketing',w.marketing/dim);expense(w,'research',w.qualityBudget/dim);expense(w,'energy',w.capacity*(p.kind==='hotel'?1200:800)/dim);
  const dep=Math.min(w.co.assets,p.setup/120/dim);w.co.assets-=dep;expense(w,'depreciation',dep);
  w.quality=clamp(w.quality+w.qualityBudget/20000000-.0005-(m.serviceLoad>1?.001:0),.1,.95);w.wear=clamp(w.wear+(produced?.0015:.0003),0,1);
  if(p.kind!=='project')w.reputation=clamp(w.reputation+(w.quality>.65?.0005:-.0003)-(demand>sales?Math.min(.002,(demand-sales)*.0001):0),.1,.95);
  w.stats.sales+=sales;w.today={sales,demand,returns,produced,utilization:m.capacity?(p.kind==='project'?produced+m.serviceWork:sales)/m.capacity:0,revenue};
  w.offers=w.offers.filter(o=>o.expires>w.day+1);finishDay(w,w.today);
  if(w.status==='playing'&&w.day%30===0&&p.kind==='project')generateOffers(w);
  if(w.status==='playing'&&w.day%90===0){w.event={title:({hotel:'旺季房務與訂房市場變動',equipment:'零組件報價與驗收要求提高',ecommerce:'通路競價與退貨壓力',ai:'模型供應商與資料品質變動',agency:'客戶預算與交付要求變動',security:'新威脅與監控服務壓力'})[w.businessId],text:'要投入改善費降低未來 30 日衝擊，或保留現金承擔成本、需求與口碑風險？'};note(w,'事件需要老闆決定，時間暫停。');}return true;
}
export function enterpriseValid(w) {
  const nn=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0,int=n=>Number.isInteger(n)&&n>=0,day=n=>int(n)&&n<=END_DAY+365,arr=(x,n)=>Array.isArray(x)&&x.length<=n;
  if(!commonValid(w)||w.mode!=='enterprise'||!known(w.businessId)||!managementValid(w)||!w.manager||!Number.isInteger(w.staff)||w.staff<1||w.staff>20||!int(w.capacity)||w.capacity<1||w.capacity>200||!int(w.price)||!int(w.marketing)||w.marketing>500000||!int(w.qualityBudget)||w.qualityBudget>100000||![0,1].includes(w.channel)||![7,14,30].includes(w.targetDays)||!['quality','reputation','wear'].every(k=>nn(w[k])&&w[k]<=1)||!int(w.seq))return false;
  const p=ENTERPRISES[w.businessId],bounds=p.kind==='hotel'?[400,15000]:p.kind==='commerce'?[100,5000]:[80,140];if(w.price<bounds[0]||w.price>bounds[1])return false;
  if(p.kind!=='project'&&(w.orders?.length||w.offers?.length||w.clients?.length))return false;
  const offer=o=>o&&typeof o.id==='string'&&typeof o.client==='string'&&int(o.work)&&o.work>0&&int(o.quote)&&o.quote>0&&day(o.due)&&day(o.expires)&&o.term===p.term&&o.depositRate===p.depositRate&&int(o.inspection)&&[0,1].includes(o.scope);
  return !!(w.stock&&int(w.stock.qty)&&nn(w.stock.value)&&arr(w.shipments,20)&&w.shipments.every(s=>int(s.qty)&&s.qty>0&&nn(s.value)&&day(s.arrival))&&arr(w.offers,6)&&w.offers.every(offer)&&arr(w.orders,8)&&w.orders.every(o=>offer(o)&&nn(o.progress)&&o.progress<=o.work+1e-6&&nn(o.cost)&&int(o.deposit)&&o.deposit===Math.round(o.quote*o.depositRate)&&typeof o.revised==='boolean'&&(o.inspectionReady===null||day(o.inspectionReady)))&&arr(w.receivables,100)&&w.receivables.every(r=>nn(r.amount)&&day(r.due)&&typeof r.client==='string')&&arr(w.clients,24)&&w.clients.every(c=>typeof c.id==='string'&&typeof c.client==='string'&&nn(c.fee)&&nn(c.work)&&day(c.until))&&(!w.expansion||day(w.expansion.ready)&&int(w.expansion.add)&&w.expansion.add>0)&&(!w.shock||nn(w.shock.cost)&&nn(w.shock.demand)&&day(w.shock.until))&&(!w.event||typeof w.event.title==='string'&&typeof w.event.text==='string')&&w.today&&['sales','demand','returns','produced','utilization','revenue'].every(k=>nn(w.today[k]))&&w.stats&&['sales','returns','missed','delivered','cancelled','lostBids','serviceRevenue'].every(k=>nn(w.stats[k])));
}
