import { ENTERPRISES, enterpriseMetrics, enterprisePlan, enterpriseQuote, enterpriseLeads, enterprisePolicy, enterpriseSettingsValid } from './enterprise.js';
import { dateOf } from './venture-core.js';
import { decisionSnapshot } from './decision-learning.js';

const money = n => '$' + Math.round(n).toLocaleString('zh-TW');
const driver = (id,label,value,unit,type,detail,unavailable='尚無營運樣本') => ({id,label,value,unit,type,detail,unavailable,basis:type==='observed'?'最近七個完整營業日':type==='state'?'目前狀態':'固定目前條件估算'});
const issue = (id,title,reason,severity='warning') => ({id,title,reason,severity});
const next = (title,action,tradeoff,view='settings') => ({title,action,tradeoff,view});
const sum = (rows,key) => rows.length && rows.every(r=>Number.isFinite(r[key])) ? rows.reduce((n,r)=>n+r[key],0) : null;
const ratio = (a,b) => a!==null&&b>0?a/b:null;

export function enterpriseCoach(w) {
  const p=ENTERPRISES[w.businessId],m=enterpriseMetrics(w),plan=enterprisePlan(w),dim=dateOf(w.day).dim,rows=w.co.daily.slice(-7),policy=enterprisePolicy(w);
  const sales=sum(rows,'sales'),returns=sum(rows,'returns'),ad=sum(rows,'marketingCost'),produced=sum(rows,'produced'),util=sum(rows,'utilization');
  const receivables=w.receivables.reduce((n,r)=>n+r.amount,0),inventory=w.stock.value+w.shipments.reduce((n,s)=>n+s.value,0),wip=w.orders.reduce((n,o)=>n+o.cost,0);
  const active=w.clients.filter(c=>c.until>w.day),serviceFees=active.reduce((n,c)=>n+c.fee,0),offer=w.offers[0],q=offer?enterpriseQuote(w,offer):null;
  const monthlyCapacity=m.capacity*dim,requiredOccupancy=m.breakEven===null?null:m.breakEven/(w.capacity*dim)*100;
  const contribution=driver('contribution',p.kind==='hotel'?'每間夜貢獻':'每件出貨貢獻',m.contribution,'$／'+p.unit,'estimate',p.kind==='hotel'?'房價扣入住備品、通路佣金與低品質補償，尚須支應房務工資、租金等固定費。':'售價扣估計退款、已耗商品成本、物流和通路費；退貨可回庫比例以半數估算，實際按整件處理。');
  const demand=driver('demand','每日客源需求',m.demand,p.unit+'／日','estimate','價格、業務／行銷、通路、服務定位、口碑、競爭及事件共同影響。需求仍須有容量、庫存才能成交。');
  const capacity=driver('freeCapacity',p.kind==='project'?'扣維運後交付能力':'人力有效容量',p.kind==='project'?m.freeCapacity:m.capacity,p.unit+'／日','estimate',p.kind==='project'?'既有維運先占用產能，剩下才能交付新案；提高品質可改善效率，擴張需等 21 日。':'設備／房間與人力能力取較小值；服務定位改變每人處理量，新增容量本身不會增加客源。');
  const margin=driver('quoteMargin','下一張詢價分攤後利潤率',q?.result!=null?q.result/q.quote*100:null,'%','estimate','依目前報價、工作量、材料／交付費、分攤固定費、折舊、利息及估計逾期費。未含未來修改、事故、維運收支及稅；需逐案看報價。',offer?'目前沒有可行交付估計':'目前沒有待提案詢價');
  const load=driver('serviceLoad','既有維運負載',m.serviceLoad*100,'%','estimate','已簽客戶先占每日能力；超過 100% 會產生服務短缺及補償，續約也是占用未來產能的決定。');
  const leads=driver('leads','下一輪新詢價數',p.kind==='project'?enterpriseLeads(w):null,'份／30日','estimate','業務開發投資影響每 30 日的新詢價；成長逐漸趨緩，上限六份。更多詢價不保證得標、獲利或準時交付。');
  const cash=driver('available','保留營運後可動用現金',m.available,'$','state','扣未付費用、授權的營運保留、下一次利息與還本、估計稅；應收尾款不能當現金支付薪資。');
  const pricing=driver('priceValue','售價／估計客戶價值',m.valuePrice?w.price/m.valuePrice*100:null,'%','estimate',`目前品質與口碑對應的參考價值約 ${money(m.valuePrice||0)}；超過後成交明顯下降${p.kind==='commerce'?'、退貨與口碑風險提高':''}。這不是保證成交的建議售價。`);
  const advertising=driver('adMarginalReturn','一萬元行銷加碼的貢獻／費用',m.adMarginalReturn,'倍','estimate',`月行銷 ${money(m.adFrom)} → ${money(m.adTo)}，固定品質、口碑及通路，有貨時新增成交的貢獻除以一萬元。低於一倍時加碼會減少利潤；已計人力容量，未計新增招聘、未來事件與稅。`);
  let drivers,formula;
  if(p.kind==='hotel') {
    drivers=[contribution,demand,driver('breakEvenOccupancy','含折舊利息的損平入住率',requiredOccupancy,'%','estimate','月固定費／每間夜貢獻，再除本月全部可售間夜；超過 100% 表示目前價格與成本無法靠滿房損平。','每間夜貢獻不為正'),capacity,driver('revpar','每間可售房收益 RevPAR',m.revpar,'$／日','estimate','房價 × 入住率；高房價若讓空房變多，RevPAR 可能下降。這是營收指標，仍須扣服務成本。'),driver('feeRate','通路佣金',m.feeRate*100,'%','state','平台可帶來較多客源，也按售價收較高佣金。比淨貢獻，不只比入住率。'),driver('quality','房務品質',w.quality*100,'%','state','維護預算逐日改善品質；低於 50% 有住宿補償，口碑需持續營運才能改變。'),cash];
    formula={text:'間夜 × 房價 − 備品、佣金、補償 − 房務工資與固定費 = 營運損益',detail:'房間每晚有容量上限；擴張先付現、增加房務與固定成本。當日貢獻的月化估計另含折舊與利息，月結才計稅。'};
  } else if(p.kind==='commerce') {
    drivers=[contribution,driver('adPerSale','實際行銷費／每筆出貨',ratio(ad,sales),'$／件','observed','用七日實際行銷費除出貨件數。有機訂單也會稀釋平均值；它不等於每位新客的獲客成本。'),driver('returnRate','估計退貨率',m.returnRate*100,'%','estimate',`品質、售價期待落差、通路與履約定位共同影響；退款付現會吃掉毛利。最近七日實際退貨率${sales>0&&returns!==null?' '+(returns/sales*100).toFixed(1)+'%':'尚無可用樣本'}。`),demand,driver('stockDays','在庫可供貨天數',ratio(w.stock.qty,Math.min(m.demand,m.capacity)),'日','state','只算已到貨可賣庫存；採購七天後到貨。在途不能立即出貨，備 30 天也會多占現金。','目前沒有可估銷量'),driver('stockCash','商品與在途占用資金',inventory,'$','state','採購先付款形成庫存，售出或報廢才認列商品成本；退回可售商品仍是資產。'),driver('breakEven','月損平出貨量',m.breakEven,'件／月','estimate',`月固定費含折舊與利息，除以每件貢獻；目前有效月容量約 ${Math.floor(monthlyCapacity)} 件，不代表有足夠訂單。`,'每件貢獻不為正'),cash];
    formula={text:'出貨金額 − 退款 − 已耗商品、物流與通路費 − 固定費 = 營運損益',detail:'每件貢獻尚未扣行銷與固定費；加廣告須比較新增成交和成本。庫存先占現金，出貨金額不是可花的利潤。'};
  } else {
    const specific={
      equipment:[driver('workingCapital','原料、在製與應收占用資金',inventory+wip+receivables,'$','state','原料先付現，在製不能立即出售；驗收認列收入後，尾款仍等帳期。訂金條款直接影響周轉需求。'),capacity,driver('defects','估計製造瑕疵率',m.defects*100,'%','estimate','品質與磨損影響良率；壞件會消耗已付材料與當日產能，工期與毛利一起承壓。')],
      ai:[driver('deliveryCost','每工程人日交付／算力費',m.unitCost,'$／人日','estimate','工作完成即發生交付／算力成本；後續維運依承諾的人日持續付費。供應商事件可能再提高單位成本。'),load,capacity],
      agency:[margin,driver('utilization','實際人力利用率',util===null?null:util/rows.length*100,'%','observed','最近七日已完成工作與既有服務負載／每日能力。人力閒置仍付薪；高利用率也未必代表案子有利潤。'),driver('revision','新客製案一次修改機會',w.channel?(1-.35-w.quality*.5)*100:0,'%','estimate','客製案在第一次完成時可能追加 20% 工作，固定總價保持；已簽範圍不因新方向改變。')],
      security:[load,driver('serviceFees','現有維運月合約金額',serviceFees,'$／月','state','有效合約按日認列並收款；續約才延長 90 日。加強維運費較高，也承諾更多專業人力。'),driver('staffCost','專業人才月薪資',w.staff*p.wage,'$／月','state','服務承諾先占人力，固定工資需先準備；人多能交付更多，也會增加每月損平壓力。')],
    }[w.businessId];
    drivers=[...specific,...(w.businessId==='agency'?[]:[margin]),leads,driver('bidChance','下一詢價參考價得標機會',q?q.chance*100:null,'%','estimate','價格、口碑、帳期及維運承諾共同影響；提高訂金會降低成交機會，放寬信用會拉長現金回收。','目前沒有待提案詢價'),driver('receivables','待收尾款',receivables,'$','state','已驗收案的尾款依各自帳期收回，尚未入帳不能支付當月費用。'),cash];
    formula={text:'驗收收入＋維運費 − 材料／交付費、工資、固定費與違約補償 = 營運損益',detail:'訂金增加現金，不是當日營收；驗收後尾款仍要等帳期。一次性交付保留產能，維運增加收入也增加持續責任。'};
  }
  if(p.kind!=='project')drivers.push(pricing,advertising);
  let bottleneck,decision;
  if(w.status!=='playing'){bottleneck=issue('closed','回看這一局的經營結果','對照月報、現金與決策觀察，找出是單位經濟、履約或周轉先失去餘裕。','info');decision=next('檢討主要決策','比較最近三次調整前後的實績與各月費用。','七日樣本不能單獨證明因果，長專案還要等驗收及收款。','report');}
  else if(w.event){bottleneck=issue('event','先處理眼前的營運事件',w.event.title);decision=next('比較改善費與後續風險','改善會先付現；接受衝擊可能提高接下來 30 日成本或減少需求。','保留現金也需要承擔品質與客戶承諾。','brief');}
  else if(!m.available){bottleneck=issue('cash','現金保留已沒有餘裕',`可用現金 ${money(w.co.cash)}，營運與還款保留 ${money(m.reserve)}；未收尾款 ${money(receivables)}。`,'danger');decision=next('先安排周轉','對照收款日、庫存和月結支出，再決定預算、還款或借款。','削減現金保留不會取消已發生的費用；借款增加利息與本金支出。','team');}
  else if(p.kind!=='project'&&m.contribution<=0){bottleneck=issue('margin','成交越多，單位損失越大',`每${p.unit}估計貢獻 ${money(m.contribution)}，尚未支應固定費。`,'danger');decision=next('先修正單位經濟','試算價格、通路及服務定位的淨貢獻，再增加行銷。','提高價格可能降低需求；節省服務成本也會影響客源或退貨。');}
  else if(p.kind==='commerce'&&w.stock.qty===0){bottleneck=issue('stock','目前沒有可出貨庫存',w.shipments.length?`已付在途 ${w.shipments.reduce((n,s)=>n+s.qty,0)} 件，最早 ${dateOf(Math.min(...w.shipments.map(s=>s.arrival))).key} 到貨。`:'先推進一天，團隊才會依授權備貨；若預算不足，需求仍會流失。');decision=next('把廣告與到貨時間排在一起','檢查七日補貨期、備貨天數與可動用現金。','在沒貨時加廣告仍付行銷費；一次備太多會鎖住周轉金。','operations');}
  else if(p.kind!=='project'&&w.price/m.valuePrice>1.25){bottleneck=issue('pricing','價格超出目前品質與口碑能支撐的價值',`售價約為估計客戶價值的 ${(w.price/m.valuePrice*100).toFixed(0)}%；提高廣告仍無法補回價格造成的低成交${p.kind==='commerce'?'與期待落差退貨':''}。`,'danger');decision=next('先驗證客戶願意付多少','在草稿比較較低售價的成交、單位貢獻與月損益，再用實際結果驗證。','降價會減少每筆毛利；品質與口碑需要逐日累積，不能靠一次拉滿預算取得。');}
  else if(p.kind==='project'&&m.serviceLoad>.8){bottleneck=issue('service','維運承諾正在擠壓新案',`已占有效能力 ${(m.serviceLoad*100).toFixed(1)}%；新案只能使用剩餘 ${m.freeCapacity.toFixed(1)} ${p.unit}／日。`,m.serviceLoad>1?'danger':'warning');decision=next('先核對續約與新案容量','比較一次性交付和加強維運，續約前確認人力與每日承諾。','不續約會失去收入；承諾更多維運也可能造成補償與交付延後。','operations');}
  else if(p.kind==='project'&&plan.issues.some(x=>x.includes('交期'))){bottleneck=issue('delivery','已接案的交期有風險','依目前有效能力、備料及驗收期，部分專案可能無法按約完成。','danger');decision=next('先守住已簽的交付','確認現有容量與團隊授權，暫緩新提案；擴張要等 21 日。','增員會增加固定薪資；取消要退訂金與付違約費。','operations');}
  else if(p.kind==='project'&&!w.orders.length){bottleneck=issue('orders','空團隊仍有固定成本',`每月固定支出 ${money(m.fixed)}，現有 ${w.offers.length} 份詢價。`);decision=next('用一張案子驗證報價與周轉','一起比較分攤後利潤、得標機會、訂金、交期與尾款帳期。','便宜與寬鬆信用可能較容易成交，但利潤和現金安全會下降。','contracts');}
  else if(p.kind==='hotel'&&(m.breakEven===null||m.breakEven>monthlyCapacity)){bottleneck=issue('capacity','目前有效容量不足以損平',`損平需 ${m.breakEven===null?'正的單位貢獻':m.breakEven+' 間夜／月'}，目前有效能力約 ${Math.floor(monthlyCapacity)} 間夜。`,'danger');decision=next('比較服務成本、房價與有效房務','先用價格和服務定位試算，再評估人力或擴張。','只增加房間仍要準備工資、固定費及足夠客源。');}
  else if(p.kind==='commerce'&&ratio(ad,sales)!==null&&ad/sales>=m.contribution){bottleneck=issue('advertising','廣告攤提已吃掉每件貢獻',`近七日每筆行銷費 ${money(ad/sales)}，目前每件貢獻約 ${money(m.contribution)}，尚未扣其他固定費。`,'danger');decision=next('先驗證廣告效率','小幅調整行銷，觀察實際出貨、退貨與每日營運損益。','減廣告可能降低訂單；只看出貨成長會忽略費用。');}
  else if(p.kind!=='project'&&w.marketing>0&&m.adMarginalReturn<1){bottleneck=issue('ad-limit','行銷加碼的新增貢獻不夠付廣告費',`${money(m.adFrom)} → ${money(m.adTo)} 的一萬元加碼，在可供貨及目前容量下只估增 ${money(m.adMarginalReturn*10000)} 貢獻。`);decision=next('比較縮減廣告與解除瓶頸','降低預算並對照成交與淨利；如果容量已滿，先評估擴張成本。','廣告觸及有限客群、成長逐漸趨緩；增加費用不會同比增加成交，擴張也不能解決價格太高。');}
  else {bottleneck=issue('economics','用實際經營驗證下一步',p.kind==='project'?`本輪已完成約 ${produced===null?'尚無樣本':produced.toFixed(1)} ${p.unit}；檢查驗收與回款，再增加承諾。`:`每${p.unit}貢獻約 ${money(m.contribution)}；固定費仍需 ${money(m.accountingFixed)}／月。`,'info');decision=next('先聚焦一個取捨',p.kind==='project'?'比較新案條款或維運定位，再觀察七日交付與現金；長專案繼續追到驗收。':'小幅調整價格、行銷或服務定位，再看七日成交與損益。','季節、競爭、到貨與事件也會改變結果；改善估算不等於已經獲利。',p.kind==='project'?'contracts':'settings');}
  return {mode:'enterprise',businessId:w.businessId,name:p.name,formula,drivers,bottleneck,decision,assumptions:[policy.detail,'價格、容量及單位費用是教育用模擬參數。品質投資逐日改善，已簽條款與維運責任不回溯修改。','同條件月化估計不推進時間、不預先補貨或招人，也不預測未來客源、修改、事故與稅。','七日觀察使用完整營業日；缺少舊欄位的樣本保持未知。行銷費／成交不等於新客 CAC，驗收收入不等於收款。']};
}

export function enterpriseLearningSnapshot(w) {
  const a=w.manager,settings=`價格 ${w.price}；行銷 ${w.marketing}／月；品質投資 ${w.qualityBudget}／月；通路 ${w.channel}；備貨 ${w.targetDays} 日；定位 ${w.policy||'standard'}；${w.staff} 人／容量 ${w.capacity}；${w.orders.length} 案／${w.offers.length} 詢價／未得標 ${w.stats.lostBids}；${w.clients.length} 維運／${w.shipments.length} 批在途；擴張 ${w.expansion?.ready??'無'}；負債 ${w.co.debt}；事件 ${w.event?.title||'無'}；衝擊 ${w.shock?.until??'無'}；代管 ${a.enabled}／預算 ${a.budget}／月費上限 ${a.maxFixed}／保留 ${a.reserveMonths} 月`;
  return decisionSnapshot(enterpriseCoach(w),w.co.cash,settings);
}

export function enterpriseDraft(w,data) {
  if(!enterpriseSettingsValid(w,data))return null;
  const test={...w,...data},before=enterpriseLearningSnapshot(w),after=enterpriseLearningSnapshot(test),changes=after.drivers.flatMap(d=>{const old=before.drivers.find(x=>x.id===d.id);return old&&Math.abs(old.value-d.value)>1e-8?[{...d,before:old.value,after:d.value}]:[];});
  const notes=[],p=ENTERPRISES[w.businessId];
  if(data.price!==w.price)notes.push(p.kind==='project'?'報價只影響新提案；價格提高會降低得標機會，已簽總價不變。':'價格改變每筆貢獻，也會影響客源需求；不是只調高營收。');
  if(data.marketing!==w.marketing)notes.push(p.kind==='project'?'業務開發費先增加固定支出，詢價數在下一個 30 日周期才改變；不會立刻產生新營收。':'廣告觸及會逐漸飽和，新增客源越來越貴；先比較一萬元加碼的新增貢獻，再看庫存、人力與容量。');
  if(data.qualityBudget!==w.qualityBudget)notes.push('品質投資先產生費用，逐日改變品質與效率；這份即時草稿不會先把未來品質加上去。');
  if(data.channel!==w.channel)notes.push(p.kind==='project'?'新方向在下一輪詢價改變工作量、報價及驗收；已簽範圍不變。':'新通路會同時改變客源及佣金；平台成交較多也可能剩較少貢獻。');
  if((data.policy||w.policy||'standard')!==(w.policy||'standard'))notes.push(p.kind==='project'?'新的維運定位在新提案鎖定；已交付客戶與已簽專案仍按原承諾執行。':enterprisePolicy(test).detail);
  if(data.targetDays!==w.targetDays)notes.push('備貨目標不會直接生成商品或退款；下次團隊執行才按預算採購，已付在途仍照原期到貨。');
  return {changes:changes.slice(0,8),notes,metrics:enterpriseMetrics(test)};
}
