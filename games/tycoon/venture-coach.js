import { dateOf, payable } from './venture-core.js';
import { PRODUCTS, SUPPLIERS, productionPlan } from './manufacturing.js';
import { MODELS, PROJECTS, technologyMetrics, technologyEconomics, technologyBreakEven } from './technology.js';

const money = n => '$' + Math.round(n).toLocaleString('zh-TW');
const count = n => Math.round(n).toLocaleString('zh-TW');
const pct = n => (n * 100).toFixed(1) + '%';
const dayText = day => Number.isFinite(new Date(Date.UTC(2026, 9, day + 1)).valueOf()) ? dateOf(day).key : '超出可估日期';
const driver = (id, label, value, unit, type, detail) => ({ id, label, value, unit, type, basis: type === 'observed' ? '已完成營運紀錄' : type === 'estimate' ? '目前條件估計' : '目前狀態', detail });
const issue = (id, title, severity, reason) => ({ id, title, severity, reason });
const decision = (id, title, action, tradeoff) => ({ id, title, action, tradeoff });

function finance(w, fixed, monthlyContribution = 0, industrial = false) {
  const unpaid = payable(w), interest = Math.round(w.co.debt * .08 / 12), principal = Math.min(w.co.debt, Math.ceil(w.co.debt / 24));
  const available = w.co.cash - unpaid - interest - principal, monthlyBurn = Math.max(0, fixed + interest + principal - monthlyContribution);
  return { cash: w.co.cash, unpaid, interest, principal, available, monthlyBurn, runwayMonths: monthlyBurn > 0 ? Math.max(0, available) / monthlyBurn : null, basis: '目前條件估計', detail: industrial ? '先扣已發生未付費用與下一次利息、還本，再以固定月支出估算無新收款跑道；未計新採購、維修、稅與未收尾款。' : '先扣已發生未付費用與下一次利息、還本，再按目前客戶規模的月現金貢獻估算；未計未來獲客、流失、一次性研發與稅。跑道不是破產日期。' };
}

// 沿既有訂單順序、已付原料與已排到貨估交期；不推進引擎或預先抽樣。
function schedule(w) {
  const orders = w.orders.map(o => ({ id: o.id, client: o.client, due: o.due, remaining: o.qty - o.produced, finishDay: null }));
  let stock = { ...w.stock };
  const shipments = w.shipments.map(s => ({ ...s })), last = Math.min(w.day + 90, Math.max(w.day, ...orders.map(o => o.due + 7)));
  for (let day = w.day; day <= last && orders.some(o => o.remaining > 1e-6); day++) {
    for (const s of shipments.filter(s => s.arrival === day || day === w.day && s.arrival < day)) {
      const total = stock.qty + s.qty;
      stock.defects = total ? (stock.defects * stock.qty + s.defects * s.qty) / total : 0;
      stock.qty = total;
    }
    const plan = productionPlan({ ...w, day, stock, lines: w.lines + (w.expansion && day >= w.expansion.ready ? 1 : 0) });
    let budget = Math.min(plan.capacity, stock.qty);
    for (const o of orders) {
      if (budget <= 0) break;
      if (o.remaining <= 1e-6 || day > o.due + 7) continue;
      const input = Math.min(budget, o.remaining / (1 - plan.defects)), good = input * (1 - plan.defects);
      stock.qty -= input; budget -= input; o.remaining = Math.max(0, o.remaining - good);
      if (o.remaining <= 1e-6) o.finishDay = day;
    }
  }
  return orders.map(o => ({ ...o, slackDays: o.finishDay === null ? null : o.due - o.finishDay, late: o.finishDay === null || o.finishDay > o.due }));
}

function manufacturingCoach(w) {
  const p = PRODUCTS[w.productId], m = productionPlan(w), supplier = SUPPLIERS[w.supplier], dim = dateOf(w.day).dim;
  const daily = w.co.daily.slice(-14), utilization = daily.length ? daily.reduce((n,d) => n + d.utilization, 0) / daily.length : null;
  const made = daily.reduce((n,d) => n + d.produced, 0), scrapped = daily.reduce((n,d) => n + d.defects, 0);
  const defectRate = made + scrapped > 0 ? scrapped / (made + scrapped) : null;
  const orders = schedule(w), remaining = w.orders.reduce((n,o) => n + o.qty - o.produced, 0);
  const requiredMaterial = Math.ceil(remaining / (1 - m.defects)), inTransitQty = w.shipments.reduce((n,s) => n + s.qty, 0);
  const materialGap = Math.max(0, requiredMaterial - w.stock.qty - inTransitQty), newMaterialCost = m.materialCost * supplier.cost;
  let priorityRemaining = 0;
  const resumed = productionPlan({ ...w, day: Math.max(w.day, w.maintenanceUntil) });
  const risky = orders.find(o => {
    priorityRemaining += w.orders.find(x => x.id === o.id).qty - w.orders.find(x => x.id === o.id).produced;
    if (!o.late) return false;
    if (o.finishDay !== null || !materialGap) return true;
    const earliestWithPurchase = Math.max(w.day + supplier.lead, w.maintenanceUntil) + Math.ceil(priorityRemaining / Math.max(1, resumed.capacity * (1 - resumed.defects))) - 1;
    return earliestWithPurchase > o.due;
  });
  const procurementCost = Math.round(materialGap * newMaterialCost);
  let futureMaterialCost = 0, inputNeeded = remaining / (1 - m.defects);
  for (const s of [w.stock, ...w.shipments.slice().sort((a,b) => a.arrival-b.arrival)]) {
    const used = Math.min(inputNeeded, s.qty); if (s.qty) futureMaterialCost += used * s.value / s.qty; inputNeeded -= used;
  }
  futureMaterialCost += inputNeeded * newMaterialCost;
  const inventoryValue = w.stock.value + w.shipments.reduce((n,s) => n + s.value, 0), wip = w.orders.reduce((n,o) => n + o.cost, 0);
  const receivables = w.receivables.reduce((n,r) => n + r.amount, 0), deposits = w.orders.reduce((n,o) => n + o.deposit, 0);
  const quote = w.orders.reduce((n,o) => n + o.quote, 0), quotedContribution = quote - wip - futureMaterialCost - remaining * 1.5;
  const referenceDefects = productionPlan({ ...w, stock: { ...w.stock, defects: supplier.defects } }).defects;
  const f = finance(w, m.fixed, 0, true), goodMonthCapacity = m.capacity * (1 - referenceDefects) * dim;
  const contributionPerUnit = p.price - newMaterialCost / (1 - referenceDefects) - 1.5;
  const depreciation = Math.min(w.co.assets, p.equipment * w.lines / 180), fixedWithDebt = m.fixed + depreciation + f.interest;
  const breakEven = contributionPerUnit > 0 ? Math.ceil(fixedWithDebt / contributionPerUnit) : null;
  const bottleneck = w.status !== 'playing' ? issue('closed', '已結案，回看經營取捨', 'info', '以下數字是結案當時的狀態與估計，不能再調整。')
    : w.event ? issue('event', '供應鏈事件待決', 'warning', '時間已暫停；先比較處理費與未來 45 天新採購的價差。')
    : f.available < 0 || procurementCost > Math.max(0, f.available) ? issue('cash', '先解決周轉金', 'danger', `現金扣未付費用、利息與還本後 ${money(f.available)}；已接訂單的估計缺料還需 ${money(procurementCost)}，應收 ${money(receivables)} 尚未入帳。`)
    : risky ? issue('delivery', '目前排程有交期風險', 'danger', `${risky.client} 應在 ${dayText(risky.due)} 交貨；${risky.finishDay === null ? '只靠現有原料與已排到貨無法在取消期限前完成' : `沿目前順位估計 ${dayText(risky.finishDay)} 完成`}。`)
    : materialGap > 0 || remaining > 0 && w.stock.qty === 0 && !w.shipments.some(s => s.arrival <= w.day) ? issue('materials', '訂單在等原料', 'warning', `良品還差 ${count(remaining)} 件；在庫 ${count(w.stock.qty)} 份、在途 ${count(inTransitQty)} 份，按目前瑕疵率仍缺約 ${count(materialGap)} 份。`)
    : !w.orders.length ? issue('orders', '先補訂單，再談擴線', 'warning', `目前沒有待製訂單，每月仍需 ${money(m.fixed)} 固定現金支出；空產線不會自動帶來收入。`)
    : w.workers < w.lines * 3 ? issue('staffing', '人力限制了現有設備', 'warning', `${w.lines} 條線需 ${w.lines * 3} 人才能發揮容量，目前 ${w.workers} 人；先比較增員成本與已有訂單，不要直接再買設備。`)
    : m.defects > .08 ? issue('quality', '瑕疵正在吃掉毛利與產能', 'warning', `目前估計瑕疵 ${pct(m.defects)}；每件良品需約 ${(1 / (1 - m.defects)).toFixed(2)} 份原料，報廢還會拖延交期。`)
    : issue('capacity', w.productId === 'packaging' ? '用穩定訂單填滿有效產能' : w.productId === 'apparel' ? '守住交期，再提高良品效率' : '讓回款與接單規模同步', 'info', w.productId === 'packaging' ? `參考價每件貢獻約 ${money(contributionPerUnit)}；每月需交貨約 ${breakEven === null ? '無法損平' : count(breakEven) + ' 件'}，目前日良品能力約 ${count(m.capacity * (1 - m.defects))} 件。` : w.productId === 'apparel' ? `排程約 ${Number.isFinite(m.backlogDays) ? m.backlogDays.toFixed(1) : '無法估計'} 天；加班會增產也增瑕疵，嚴格品管則會減少毛產能。` : `原料／在途 ${money(inventoryValue)}、在製 ${money(wip)}、應收 ${money(receivables)}，都已占用資金但還不能支付薪資。`);
  let next;
  if (bottleneck.id === 'closed') next = decision('review', '比較承諾與履約結果', `累積交貨 ${count(w.stats.delivered)} 張、逾期／取消 ${count(w.stats.late)} 張；對照每月現金與淨利，找出是哪個決策先失去餘裕。`, '營收成長未必代表接單品質或現金周轉改善。');
  else if (bottleneck.id === 'event') {
    const raw = p.material * supplier.cost, threshold = Math.ceil(18000 / (raw * .17));
    next = decision('supplier-event', '估算議價是否能回本', `兩個方案相差 17% 新原料價格；以目前供應商，45 天採購超過約 ${count(threshold)} 份，$18,000 短約費才可能由價差抵回。`, '原有已付庫存不受漲價影響；少採購時，保留現金可能更有價值。');
  } else if (bottleneck.id === 'cash') next = decision('cash-plan', '先安排採購與月結現金', `估計缺料支出 ${money(procurementCost)}，已知尾款 ${money(receivables)}；先看收款日，再決定拆單採購或借款。取消全部未交貨訂單需退訂金 ${money(deposits)}，另付約 ${money(quote * .1)} 違約金。`, '借款增加每月利息與還本；接下高毛利、長帳期訂單也可能使現金先用完。');
  else if (bottleneck.id === 'delivery') next = decision('delivery-plan', '比較排程、到料與加班', `最早危險訂單剩 ${Math.max(0, risky.due - w.day + 1)} 個生產日；目前日毛產能 ${count(m.capacity)}、估計良品 ${count(m.capacity * (1 - m.defects))}。把急單優先，並檢查 ${supplier.lead} 天到料是否來得及。`, '調整順位會延後其他訂單；加班提高工資 25% 並增加瑕疵，擴線須等 14 天。');
  else if (bottleneck.id === 'materials') next = decision('purchase-plan', '只買已知交貨需要的原料', materialGap > 0 ? `估計補 ${count(materialGap)} 份約需 ${money(procurementCost)}，目前供應商 ${supplier.lead} 天到貨；先核對各訂單截止日。` : `已付在途 ${count(inTransitQty)} 份，最早 ${dayText(Math.min(...w.shipments.map(s => s.arrival)))} 到貨；急件費要與延遲違約金比較。`, '這是依目前瑕疵率估算，批次與磨損會改變用量；一次買太多會鎖住現金。');
  else if (bottleneck.id === 'orders') next = decision('bid-plan', '先試算一張訂單再投標', `現有 ${count(w.offers.length)} 張招標；月固定現金費用 ${money(m.fixed)}，參考價每件貢獻約 ${money(contributionPerUnit)}。比較售價、訂金、到期日與 ${supplier.lead} 天供料時間。`, '降價提高得標機會，但需更多交貨量才能支應固定成本；未得標不會收訂金。');
  else if (bottleneck.id === 'staffing') {
    const missing = w.lines * 3 - w.workers;
    next = decision('staff-plan', '先利用已買設備', `補足 ${missing} 人需招募費 ${money(missing * 8000)}，每月工資增加 ${money(missing * p.wage * (w.shift === 'overtime' ? 1.25 : 1))}；擴一線還要先付 ${money(p.equipment)}。`, '增加人手只有在訂單和原料足夠時才增加交貨；固定薪資會先增加。');
  } else if (bottleneck.id === 'quality') next = decision('quality-plan', '比較品管與磨損成本', `嚴格品管每月多 $12,000，毛產能減少 15%；保養需 ${money(Math.round(p.equipment * w.lines * .035))} 並停機兩天。先看哪一項能減少眼前瑕疵。`, '良率提高不等於交期一定改善；停機、品管降速與已接交期必須一起算。');
  else next = decision('order-margin', '用現有訂單檢驗下一步', `待履約合約 ${money(quote)}，扣在製與後續原料、變動能源後估計貢獻 ${money(quotedContribution)}；每月另有固定支出 ${money(m.fixed)}。先穩定履約與回款，再評估擴線。`, '契約貢獻尚未扣固定費、折舊、利息、稅、過去報廢及未來違約，不是本月淨利或可用現金。');
  const emphasis = { packaging: ['大量生產靠利用率回收固定成本', '低單價的每件毛利不高。更低報價要由足夠且能按時交付的數量彌補；設備閒置仍有薪資、租金與折舊。'], apparel: ['交期與良率要一起排', '加班趕件提高瑕疵與工資，嚴格品管減少產量。評估的單位應是按時交付的良品，而不是毛產能。'], electronics: ['高原料成本放大周轉風險', '先付原料、交貨後認列收入、15–45 天後收尾款。高報價可以帶來帳面利潤，卻仍可能沒有現金支付下一批料與薪資。'] }[w.productId];
  return { mode: w.mode, businessId: w.productId, name: p.name, formula: { text: '交貨收入 − 原料／報廢 − 工資、租金、品管、能源 − 折舊、違約、利息與稅 = 淨利', detail: '訂金與借款只增加現金；採購先成為原料，設備先成為資產，尾款要等帳期才入帳。' }, bottleneck, drivers: [
    driver('utilization', '近 14 個營運日產能利用率', utilization === null ? null : utilization * 100, '%', 'observed', daily.length ? `${daily.length} 個已完成日的毛產能使用率；利用率高仍需看良品與交期。` : '尚未完成營運日。'),
    driver('goodCapacity', '估計日良品產能', m.capacity * (1 - m.defects), '件／日', 'estimate', '按目前人力、班制、磨損與品管；原料或訂單不足時無法達成。'),
    driver('defects', '估計瑕疵率', m.defects * 100, '%', 'estimate', defectRate === null ? '尚無實際生產批次；供應商新到料會改變良率。' : `近期實際瑕疵／多餘投料 ${pct(defectRate)}，不等於未來批次保證。`),
    driver('materialGap', '現有訂單估計缺料', materialGap, '份', 'estimate', '扣在庫與已付在途；到貨晚於交期仍有風險。'),
    driver('deliveryRisk', '現有供料計畫交期風險', orders.filter(o => o.late).length, '張', 'estimate', '沿目前順位、已知到貨與施工排程；磨損凍結，未計新採購與隨機瑕疵。缺料且尚有採購時間時，先處理補料。'),
    driver('receivables', '已交貨未收尾款', receivables, '$', 'state', '已認列收入，須到收款日才能使用。'),
    driver('quotedContribution', '待履約契約估計貢獻', quotedContribution, '$', 'estimate', '合約額減既有在製成本、剩餘原料與變動能源；固定費與其他損失另計。'),
    driver('breakEven', '參考價估計月損平交貨量', breakEven, '件／月', 'estimate', `以目前供應商新料價與新料瑕疵、現有磨損／品管、固定費、折舊與利息計；未含稅與違約。新料估計瑕疵 ${pct(referenceDefects)}，日能力折月約 ${count(goodMonthCapacity)} 件。`),
  ], decision: next, tradeoffs: [{ title: emphasis[0], text: emphasis[1] }, { title: '便宜原料不一定是便宜交貨', text: '低價供應商便宜 12%，但七天到料且瑕疵較高；急件供應商一天到料但貴 22%。缺料、報廢和違約都可能吃掉價差。' }], finance: f, metrics: { remaining, requiredMaterial, materialGap, procurementCost, inventoryValue, wip, receivables, deposits, quote, quotedContribution, contributionPerUnit, referenceDefects, breakEven, goodMonthCapacity, orders }, assumptions: ['排程最多估未來 90 日，按現有順位、已知訂單與已付原料；不預知後續中標、事故、磨損變化或隨機瑕疵。', '契約貢獻以已付在庫與在途平均料價估剩餘用料，不足部分用目前新料報價；未來批次良率會改變結果。', '損平用目前供應商新料的瑕疵率；眼前生產與已接契約的用料估計用現有庫存良率，兩者不是同一批原料。', f.detail] };
}

function technologyCoach(w) {
  const p = MODELS[w.modelId], m = technologyMetrics(w, { includeBreakEven: false }), e = technologyEconomics(w), paid = w.modelId === 'saas', platform = w.modelId === 'marketplace';
  const activeChurn = m.activeChurn, paidCac = paid ? m.acquisitionCost / m.conversion : null;
  const unitContribution = e.monthlyUnit;
  const paybackMonths = paidCac !== null && unitContribution > 0 ? paidCac / unitContribution : !paid && unitContribution > 0 ? m.acquisitionCost / unitContribution : null;
  const f = finance(w, m.fixed, e.contribution), breakEven = technologyBreakEven(w, m.fixed + f.interest);
  const daily = w.co.daily.slice(-14), observedAcquired = daily.reduce((n,d) => n+d.acquired,0), observedConverted = daily.reduce((n,d) => n+d.converted,0), observedChurned = daily.reduce((n,d) => n+d.churned,0);
  const retentionRisk = paid ? m.churn : activeChurn;
  const bottleneck = w.status !== 'playing' ? issue('closed', '已結案，回看成長品質', 'info', '以下估計是結案條件，不代表未來還能維持的收入。')
    : w.event ? issue('event', '流量與主機事件待決', 'warning', '先比較處理費、30 天廣告價差與事故退款，再恢復時間。')
    : f.available < 0 || f.runwayMonths !== null && f.runwayMonths < 1 ? issue('cash', '先把資金跑道拉回來', 'danger', `扣未付費用、利息與還本後 ${money(f.available)}；目前規模的估計月現金消耗 ${money(f.monthlyBurn)}，支出比成長先發生。`)
    : m.uptime < .95 || m.load > .8 ? issue('reliability', '服務品質正在限制成長', m.uptime < .9 ? 'danger' : 'warning', `主機負載 ${pct(m.load)}、技術債 ${pct(w.techDebt)}，估計可用率 ${pct(m.uptime)}；這會減少收入並提高流失。`)
    : m.supportLoad > 1 ? issue('support', '客服超載會把新客流失掉', 'warning', `目前 ${count(w.users)} 位使用者，客服負載 ${pct(m.supportLoad)}；即使主機夠用，服務不足仍提高流失。`)
    : platform && w.users < 2500 ? issue('liquidity', '先讓平台有足夠成交密度', 'warning', `${count(w.users)} 位活躍使用者只提供 ${pct(Math.min(1,w.users/2500))} 的規模媒合因子；目前估計每月 ${count(e.transactions)} 筆交易，而不是每位註冊都會成交。`)
    : retentionRisk > .12 ? issue('retention', '先修補流失，再放大獲客', 'warning', `估計月${paid ? '付費客戶' : '活躍使用者'}流失 ${pct(retentionRisk)}；加廣告帶來的人也可能很快離開。`)
    : w.quality < .45 ? issue('value', paid ? '先驗證付費價值' : '先提高內容／產品價值', 'warning', `品質 ${pct(w.quality)}，${paid ? `估計新客付費轉換 ${pct(m.conversion)}` : platform ? '品質會改變每位活躍者的交易頻率' : `估計每位活躍者每日 ${(2+w.quality*3).toFixed(1)} 次瀏覽（未扣可用率）`}。`)
    : unitContribution <= 0 || paybackMonths !== null && f.runwayMonths !== null && paybackMonths > f.runwayMonths ? issue('acquisition', '獲客回收慢於現金承受能力', 'warning', `每位${paid ? '付費客戶' : '活躍使用者'}目前估計月貢獻 ${money(unitContribution)}；${paybackMonths === null ? '目前無正貢獻，無法估回收' : `獲客回收約 ${paybackMonths.toFixed(1)} 個月，尚未計流失與固定費`}。`)
    : issue('economics', paid ? '把付費、留存與回收一起看' : platform ? '成交與抽成要一起看' : '廣告收入與體驗要一起看', 'info', `目前估計月營收 ${money(e.revenue)}，扣使用量成本、支付與退款後貢獻 ${money(e.contribution)}；每月固定支出另有 ${money(m.fixed)}。`);
  let next;
  if (bottleneck.id === 'closed') next = decision('review', '對照成長與資金結果', `累積獲客 ${count(w.stats.acquired)}、流失 ${count(w.stats.churned)}；對照每月廣告、雲端、人事與現金，找出規模何時開始改善或拖累經營。`, '累積使用者或 GMV 不是股東收入；營收、淨利、現金要分開看。');
  else if (bottleneck.id === 'event') next = decision('traffic-event', '比較處理費與廣告價差', `以目前月廣告 ${money(w.marketing)}，其他條件固定時，兩方案約差 ${count(w.marketing/m.acquisitionCost*(1/1.1-1/1.45))} 位廣告新客；$20,000 處理費另能避免可用率下降 4 點並減少技術債 10 點。`, '廣告價差是同預算多取得使用者，不是現金退款；如果新客不能留存或變現，更多流量仍可能虧損。');
  else if (bottleneck.id === 'cash') next = decision('cash-plan', '先比較縮支與成長回收', `月廣告 ${money(w.marketing)}、工程與客服 ${money(w.engineers*45000+w.support*30000)}、基本主機 ${money(4500*2**w.cloudTier)}；先調整最晚才能回收的支出，保留必要維運。`, '減廣告會少新客，減工程或客服可能增加技術債、流失與退款；借款還會增加利息與本金支出。');
  else if (bottleneck.id === 'reliability') {
    const nextTier = Math.min(5,w.cloudTier+1), capacity = Math.round(p.capacity*2**nextTier*w.capacityBonus), added = 4500*(2**nextTier-2**w.cloudTier);
    next = decision('reliability-plan', '分清容量不足與技術債', w.cloudTier < 5 ? `升一級主機容量 ${count(capacity)} 人，每月多 ${money(added)}；目前技術債 ${pct(w.techDebt)}，升級主機不會消除它。架構專案費 $15,000，另需 ${Math.ceil(PROJECTS.reliability.days/(w.engineers*(1-(w.focus==='stability'?1:w.focus==='balanced'?.55:.2)*.7)))} 天左右。` : `主機已到最高等級；架構專案費 $15,000 可提高基礎容量 20%，並消除技術債 22 點。先檢查現有研發與維運時間。`, '主機費立即提高；架構改善要等專案完成，維運投入增加則新功能上線更慢。');
  } else if (bottleneck.id === 'support') {
    const required = Math.ceil(w.users/p.supportCapacity), added = Math.max(0,required-w.support);
    next = decision('support-plan', '比較客服量與流失成本', `以目前客群需約 ${required} 位客服，補 ${added} 人需 ${money(added*12000)} 招募費及 ${money(added*30000)} 月工資。`, '客服只改善超載造成的流失；產品價值、主機與技術債仍須各自處理。');
  } else if (bottleneck.id === 'liquidity') next = decision('liquidity-plan', '用成交而非註冊評估擴張', `距規模媒合因子滿額還差 ${count(2500-w.users)} 位活躍者；按目前廣告單人成本機械估算要 ${money((2500-w.users)*m.acquisitionCost)}，還未扣自然流量或加上流失、漲價。先比較每月交易貢獻與獲客費。`, '增加客群會提高規模媒合，也會推高獲客與服務成本；提高抽成則降低成交率並提高流失。');
  else if (bottleneck.id === 'retention') next = decision('retention-plan', '先測試留存改善', `新手引導專案費 $12,000、${PROJECTS.retention.days} 工程工作量，成熟度增加 12 點；在其他條件固定時，模型基本月流失約降低 ${(0.12*.3*.065*(paid?1:1.6)*100).toFixed(2)} 個百分點。`, '留存成熟度不是實際留存率；專案也增加技術債 4 點，主機、客服與價格仍會影響結果。');
  else if (bottleneck.id === 'value') next = decision('value-plan', paid ? '比較核心功能與付費門檻' : '先提高每位使用者的價值', `核心專案費 $18,000、${PROJECTS.value.days} 工程工作量，品質最多提升 14 點；${paid ? '會影響新客轉換與流失，調低月費也會提高轉換但降低每客收入' : platform ? '會提高交易頻率與留存，抽成調高會減少媒合' : '品質提升會增加瀏覽與留存；多一個廣告位則提高單次收入，也提高流失'}。`, '發布增加技術債 6 點；收入改善要靠實際使用，不能把專案完成當作保證賺錢。');
  else next = decision('growth-check', '再決定是否加大獲客', `目前廣告每位新使用者約 ${money(m.acquisitionCost)}${paid ? `，按新客轉換估每位付費客戶約 ${money(paidCac)}` : ''}；目前每位${paid?'付費客戶':'活躍者'}估計月貢獻 ${money(unitContribution)}。先用少量預算與已完成日的新增、流失、收入驗證。`, '回收月數未計流失與固定研發人事，客群增長也會改變成本與可用率；不宜按目前單位收益無限外推。');
  const formula = paid ? { text: '付費客戶 × 月費 × 可用率 − 全部使用者的服務成本 − 支付、退款與固定支出 = 稅前營運結果', detail: '免費使用者也有主機成本；廣告買的是新使用者，只有一部分會付費，現有免費客群也可能日後轉換。' } : platform ? { text: '活躍使用者 × 成交頻率 × 客單價 × 抽成 − 每筆服務成本、使用量成本、退款與固定支出 = 稅前營運結果', detail: 'GMV 是交易雙方的金額，公司收入只有抽成；規模媒合因子到 2,500 位活躍者前隨客群增加，之後不再提高。' } : { text: '活躍使用者 × 每日瀏覽 × 廣告密度 × 每千次展示收入 − 使用量成本、退款與固定支出 = 稅前營運結果', detail: '品質增加每位使用者的瀏覽，廣告密度增加收入也提高流失；主機可用率會影響真正發生的瀏覽。' };
  const specific = paid ? [driver('paying','目前付費客戶',w.paying,'人','state',`${count(w.users-w.paying)} 位免費使用者也會產生服務成本。`),driver('conversion','新使用者估計付費轉換',m.conversion*100,'%','estimate','只適用新客；現有免費使用者另有逐日轉換，不能用全部新增付費／廣告新客當觀察轉換率。'),driver('paidCac','廣告付費客戶估計取得成本',paidCac,'$','estimate','廣告新客單人成本 ÷ 新客付費轉換；未含自然流量、舊免費轉換或固定人事。')] : platform ? [driver('liquidity','規模媒合因子',Math.min(1,w.users/2500)*100,'%','estimate','由活躍規模形成；模型未分買賣雙邊，不能推論特定客群是否足夠。'),driver('transactions','估計月交易',e.transactions,'筆／月','estimate','會隨品質、規模媒合、可用率與抽成改變；GMV 不是收入。'),driver('takeRate','交易抽成',w.price,'%','state','抽成高於 8% 會壓低成交因子並提高流失。')] : [driver('visits','估計月瀏覽',e.visits,'次／月','estimate','按目前客群、品質與可用率；不是已完成流量。'),driver('adDensity','每次瀏覽廣告數',w.price,'個／次','state','超過兩個會增加流失。'),driver('adCPM','每千次展示收入參數',p.adCPM,'$','state','教育用模擬參數；收入需由真正瀏覽產生。')];
  return { mode:w.mode, businessId:w.modelId, name:p.name, formula, bottleneck, drivers:[...specific,
    driver('users','活躍使用者',w.users,'人','state',`模型市場上限 ${count(p.market)}，規模越大，邊際獲客越貴。`),
    driver('churn',paid?'估計月付費流失':'估計月活躍流失',retentionRisk*100,'%','estimate',paid?`免費客群流失較高，約 ${pct(activeChurn)}；不是已觀察的付費續訂率。`:'活躍者使用免費客群流失公式，不能套用付費訂閱的流失率。'),
    driver('acquisitionCost','廣告每位新使用者估計成本',m.acquisitionCost,'$','estimate',`近 ${daily.length} 個已完成日新增 ${count(observedAcquired)}、轉付費 ${count(observedConverted)}、總流失 ${count(observedChurned)}；新增含自然流量。`),
    driver('unitContribution',paid?'估計每付費客月貢獻':'估計每活躍者月貢獻',unitContribution,'$／人／月','estimate','已扣可用率、使用量／支付與退款；固定費、利息與稅另計。'),
    driver('breakEven',paid?'估計損平付費客戶':'估計損平活躍使用者',breakEven,'人','estimate',paid?'維持目前免費客群，改變付費數時重新計算主機可用率；固定費與利息計入，未含稅。':`增加客群時重新計算${platform?'規模媒合與':''}主機可用率；在目前主機、價格與品質、有限市場下求解，固定費與利息計入。`),
    driver('uptime','估計服務可用率',m.uptime*100,'%','estimate','負載超過 80%、技術債或供應商事件會降低；低於 90% 還有退款。'),
  ],decision:next,tradeoffs:[{title:paid?'價格與轉換不是單向關係':platform?'提高抽成不等於同比提高營收':'廣告密度與流量有取捨',text:paid?'降價提高新客轉換，但每位付費客收入也下降；漲價高於參考月費會提高流失。留存能改善付費基礎，但新功能與維運共用工程時間.':platform?'抽成提高會減少每位活躍者的成交頻率並提高流失。擴大規模增加媒合密度，也提高獲客與主機成本。': '多廣告立即增加每次瀏覽的收入，但密度過高增加流失。品質改善增加瀏覽；若主機超載，可用率會削弱真正收入。'},{title:'獲客先花錢，回收要等營運',text:`機械估計獲客回收 ${paybackMonths===null?'目前無法形成正貢獻':paybackMonths.toFixed(1)+' 個月'}，尚未計流失、固定費和未來條件變化；這不代表保證回報。`}],finance:f,metrics:{revenue:e.revenue,variable:e.variable,refunds:e.refunds,contribution:e.contribution,fixed:m.fixed,monthlyResult:e.contribution-m.fixed,unitContribution,paidCac,paybackMonths,breakEven,activeChurn,paidChurn:m.paidChurn??m.churn,transactions:e.transactions,visits:e.visits,observedAcquired,observedConverted,observedChurned},assumptions:['收入、回收與損平是目前設定的估計；不預知新客、流失與交易的隨機結果。','損平推算不會自動增聘、升主機或研發，平台會隨假設客群規模重算媒合；實際擴張應再調整服務資源。',f.detail] };
}

export function ventureCoach(world) {
  if (world?.mode === 'manufacturing' && PRODUCTS[world.productId]) return manufacturingCoach(world);
  if (world?.mode === 'technology' && MODELS[world.modelId]) return technologyCoach(world);
  throw new Error('未知創業路線');
}
