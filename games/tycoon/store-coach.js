// 用既有模擬資料說明各業態的因果關係；不推進時間、不改帳目或經營設定。
import { P, unwrap } from './params.js';
import { BUSINESSES, businessOf, freshBusiness, retailBusiness, hourlyCapacity, assetFactor, assetMonthly, stockLimit } from './businesses.js';
import { strategyOf, strategyEffects } from './strategy.js';
import { effects } from './facilities.js';
const V = unwrap(P);
const mean = (xs) => xs.length ? xs.reduce((a, n) => a + n, 0) / xs.length : null;
const finite = (n) => Number.isFinite(n) ? n : null;
const money = (n) => Math.round(n).toLocaleString();
const pct = (n) => (100 * n).toFixed(1);
const MODE = { takeaway: '外帶為主', balanced: '內外兼顧', dinein: '內用體驗' };
const SERVICE = { quick: '快剪', standard: '標準服務', premium: '精緻服務' };
const FOCUS = { open: '自由訓練', coached: '教練指導', classes: '團體課程' };
const DEFINITIONS = {
  tea: { focus: '尖峰出杯與通路貢獻', formula: '成交杯數 × 每杯貢獻 − 排班、租金與品牌分攤', detail: '售價、原料、外送抽成和排隊一起決定每杯留下多少錢；夏季客源較多也可能塞住產能。' },
  cafe: { focus: '製作產能與座位周轉', formula: '成交份數 × 每份貢獻 − 人事、店租與體驗費用', detail: '可成交量同時受製作速度和座位周轉限制。增加座位使用比例提高體驗，也讓座位更早成為上限。' },
  bento: { focus: '餐期需求與每日備餐', formula: '已售餐份收入 − 全批備餐成本 − 包材、抽成與固定支出', detail: '原料在每天備餐時先付，未售餐份當天報廢。多準備不代表多成交，午晚餐又共用同一批備餐。' },
  bakery: { focus: '批次售罄、折扣與報廢', formula: '原價與折扣銷售收入 − 全批烘焙成本 − 營運費用', detail: '每天一次烘焙，售罄後當天不能補烤。18 點後的折扣可能減少報廢，也減少每份收入。' },
  convenience: { focus: '薄利、多筆交易與補貨現金', formula: '交易筆數 × 每筆貢獻 − 排班、租金與水電', detail: '貨款先付，補貨後才有商品可售。交易量由客源、結帳能力與庫存共同限制，庫存本身不會產生客人。' },
  salon: { focus: '技術人力與每客工時', formula: '服務人次 × 每客貢獻 − 技術人員工時與店租', detail: '人員和工作站取較少者，每客服務時間決定周轉。高價服務提高體驗，但每位客人占用工時更久。' },
  restaurant: { focus: '廚房、翻桌與高固定成本', formula: '接待客數 × 每客貢獻 − 廚房人事、店租與設備維護', detail: '成交量取廚房製作與座位周轉的較低值。擴充增加上限與維護費，還需要實際需求填滿。' },
  supermarket: { focus: '存貨資金、結帳與耗損', formula: '購物筆數 × 每筆貢獻 − 大店人事、水電與維護', detail: '大量貨款占用現金，缺貨會流失交易，結帳排班又有另一個上限。設備可提高庫存上限，也增加固定負擔。' },
  fitness: { focus: '器材時段與教練工時', formula: '單次付費人次 × 每次貢獻 − 教練、人事、器材維護與水電', detail: '本版每次進場才收款。不同訓練模式改變器材占用時間與每位員工可服務的人數，體驗與接待量需要取捨。' },
};

function capacityPlan(shop, world) {
  const x = strategyOf(shop), batch = freshBusiness(shop.businessId) && shop.stock?.day === Math.floor(world.t / 24) && shop.stock.weights;
  const strategy = batch ? { ...x, weights: shop.stock.weights } : x;
  const speed = V.capacity.wageSpeed[shop.wageLevel] * effects(world.companies[shop.company]?.expansion).speed * strategyEffects(shop, strategy).speed;
  // 玩家班表已含老闆；增加一人只增加一位支薪員工。
  const hourly = shop.staff.map((n) => hourlyCapacity(shop, n, speed));
  const daily = hourly.reduce((a, n, i) => a + n * (V.capacity.shifts[i][1] - V.capacity.shifts[i][0]), 0);
  const signals = shop.hourEMA || [], loads = hourly.map((cap, i) => ({ shift: i, cap, signal: Math.max(0, ...signals.slice(i * 4, i * 4 + 4)) }));
  loads.sort((a, b) => b.signal / Math.max(1, b.cap) - a.signal / Math.max(1, a.cap) || a.shift - b.shift);
  return { speed, hourly, daily, peak: loads[0], maxStaff: Math.max(...shop.staff) };
}

/** analysis/review 為 sim 的 getShopAnalysis/getLearningReview；所有回傳欄位可序列化。 */
export function storeCoach({ shop, analysis, review, world } = {}) {
  if (!shop || !analysis || !world || !Object.hasOwn(BUSINESSES, shop.businessId || 'tea')) return null;
  const id = shop.businessId || 'tea', biz = businessOf(id), definition = DEFINITIONS[id], op = shop.operations;
  const recent = (shop.days || []).slice(-7), days = recent.length;
  const observed = (key) => mean(recent.filter((d) => Number.isFinite(d[key])).map((d) => d[key]));
  const daily = observed('cups'), lost = observed('lost'), stockLost = observed('stockLost');
  const supplyDays = recent.filter((d) => Number.isFinite(d.stockLost) && Number.isFinite(d.lost) && Number.isFinite(d.cups));
  const queueLost = mean(supplyDays.map((d) => Math.max(0, d.lost - d.stockLost)));
  const supplyAttempts = mean(supplyDays.map((d) => d.cups + d.lost));
  const freshDays = recent.filter((d) => Number.isFinite(d.prepared) && Number.isFinite(d.unsold));
  const prepared = mean(freshDays.map((d) => d.prepared)), unsold = mean(freshDays.map((d) => d.unsold));
  const preparedTotal = freshDays.reduce((a, d) => a + d.prepared, 0), unsoldTotal = freshDays.reduce((a, d) => a + d.unsold, 0);
  const unsoldRate = preparedTotal ? unsoldTotal / preparedTotal : null;
  const recentBasis = days ? `近 ${days} 個完整營業日` : '尚無完整營業日';
  const accountBasis = `${analysis.ym || '分析期'}帳目${analysis.current ? '，含今日截至目前' : '，已結算'}（${analysis.sampleDays || 0} 個營業日）`;
  const plan = capacityPlan(shop, world), co = world.companies[shop.company], factor = assetFactor(shop);
  const rawUnit = Object.values(biz.items).reduce((a, it, i) => a + (shop.mix[i] || 0) * it.cost * shop.costMult, 0);
  const stockedUnit = rawUnit + biz.packaging;
  const cover = daily > 0 && stockedUnit > 0 ? shop.inv / (daily * stockedUnit) : null;
  const contribution = finite(analysis.contribution), breakEven = finite(analysis.breakEvenWithBrandDaily ?? analysis.breakEvenDaily);
  const drivers = [];
  const driver = (key, label, value, unit, type, basis, detail, controls) => drivers.push({ id: key, label, value: finite(value), unit, type, basis, detail, controls });
  const state = (key, label, value, unit, detail, controls) => driver(key, label, value, unit, 'state', '目前設定', detail, controls);
  const estimate = (key, label, value, unit, detail, controls) => driver(key, label, value, unit, 'estimate', '目前設定的模型估算', detail, controls);
  const actual = (key, label, value, unit, detail, controls) => driver(key, label, value, unit, 'observed', key === 'stockLost' ? `近完整日中有缺貨紀錄的 ${recent.filter((d) => Number.isFinite(d.stockLost)).length} 天` : key === 'unsoldRate' ? `近完整日中有備料紀錄的 ${freshDays.length} 天` : recentBasis, detail, controls);
  const assumptions = [
    '金額、服務時間與產能係數沿用遊戲模型，不是現實產業的標準或創業報價。',
    '完整營業日的成交與流失、分析期帳目、目前設定的產能分開標示；改設定不會立即改變已發生的成交。',
    '一次調整一項設定，觀察至少 7 個完整營業日，再比較成交、每筆貢獻、淨利與現金；需求仍受地段、口碑、競爭及有限消費預算影響。',
    '流失只記全日合計，未記錄流失時段；班次診斷以已成交的平滑訊號和目前產能找測試方向，不是還原流失客人的完整原因。',
  ];
  let physical = null;
  if (id === 'tea') {
    estimate('peakCapacity', '尖峰班每小時出杯上限', plan.peak.cap, '杯／小時', '依三班中成交訊號相對最擁擠的一班計算，沒有把老闆再加一人。', ['staffing', 'wage', 'strategy']);
    const walk = observed('walk'), del = observed('del');
    actual('deliveryShare', '外送成交比重', walk + del > 0 && del != null && walk != null ? 100 * del / (walk + del) : null, '%', '外送與門市共用出杯產能；比重提高時也要看抽成後貢獻。', ['delivery', 'markup']);
    driver('commissionRate', '外送有效抽成率', analysis.pnl?.gmv > 0 ? 100 * analysis.pnl.commission / analysis.pnl.gmv : null, '%', 'observed', accountBasis, '用實際抽成除以平台標價營收；未經外送成交時不填零。', ['markup', 'delivery']);
    driver('seasonDemand', '今日季節需求係數', finite(world.day?.season) == null ? null : 100 * world.day.season, '%', 'state', '今日市場條件', '100% 為季節基準；只是需求乘數，不能當成保證成交率。', ['staffing', 'prices']);
  } else if (id === 'cafe' || id === 'restaurant') {
    const minutes = id === 'cafe' ? 50 : { takeaway: 50, balanced: 80, dinein: 110 }[op.mode];
    const dineShare = id === 'cafe' ? { takeaway: 0.15, balanced: 0.55, dinein: 0.85 }[op.mode] : 1;
    const seatCap = Math.floor(op.seats * (id === 'restaurant' ? factor : 1) * 60 / minutes / dineShare);
    const production = Math.floor((plan.maxStaff === 1 ? biz.solo : (plan.maxStaff - 1) * biz.worker) * plan.speed * factor + 1e-6);
    const n = shop.staff[plan.peak.shift], peakProduction = Math.floor((n === 1 ? biz.solo : (n - 1) * biz.worker) * plan.speed * factor + 1e-6);
    physical = { kind: seatCap <= peakProduction ? 'seats' : 'production', seats: seatCap, production: peakProduction, shift: plan.peak.shift };
    state('seatCount', '模型座位數', op.seats * (id === 'restaurant' ? factor : 1), '席', '目前租賃坪數與設備級別決定；不是現場已坐滿的席位。', id === 'restaurant' ? ['upgrade', 'operations'] : ['operations']);
    estimate('seatCapacity', '座位換算接待上限', seatCap, `${biz.unit}／小時`, id === 'cafe' ? `${MODE[op.mode]}：內用比例 ${pct(dineShare)}%，每位占用 50 分鐘；換算包含外帶的總成交上限。` : `${MODE[op.mode]}：每客占用 ${minutes} 分鐘，遊戲以共用接待上限限制門市與外送。`, ['operations', ...(id === 'restaurant' ? ['upgrade'] : [])]);
    estimate('productionCapacity', id === 'cafe' ? '最多人班的製作上限' : '最多人班的廚房上限', production, `${biz.unit}／小時`, '這是人力、流程與設備的上限；各班實際採製作和座位的較低值，其他班可能人更少。', ['staffing', 'wage', 'strategy', ...(id === 'restaurant' ? ['upgrade'] : [])]);
    assumptions.push('未追蹤實際入座率、每桌人數或每張餐桌；座位指標只說明目前模式在遊戲中的限制。');
  } else if (freshBusiness(id)) {
    state('prepTarget', id === 'bento' ? '每日備餐目標' : '每日烘焙目標', op.prep, '份／日', '下次備料依此目標扣原料與現金；當天批次已完成時，調整留到下一批生效。', ['operations']);
    actual('unsoldRate', '完整日未售比率', unsoldRate == null ? null : unsoldRate * 100, '%', `用有備料紀錄的 ${freshDays.length} 天合計未售量除以合計備料量；未售餐份／麵包當天報廢。`, ['operations', 'prices']);
    actual('stockLost', '售罄／缺貨流失', stockLost, '份／日', '已發生的供應不足，不是少做一份就一定少賣一份；與排隊流失分開看。', ['operations']);
    if (id === 'bento') {
      const signals = shop.hourEMA || [], total = signals.reduce((a, n) => a + n, 0);
      const meals = signals.reduce((a, n, i) => a + ([11, 12, 13, 18, 19].includes(V.time.openHour + i) ? n : 0), 0);
      estimate('mealConcentration', '午晚餐成交時段訊號', total > 0 ? 100 * meals / total : null, '%', '取 11–13 點與 18–19 點的成交平滑紀錄比重；是已服務時段訊號，不能用來還原全部來客。', ['staffing', 'delivery']);
    } else state('markdown', '18 點後折扣', op.markdown, '%', '折扣降低售價且可能吸引晚間需求；未售品已先支付備料成本，需一起比較。', ['operations']);
    assumptions.push('今日尚未結束時，剩餘備料不等於報廢；未售比率只取已完成日。舊存檔沒有備料紀錄的日子不補成零。');
  } else if (retailBusiness(id)) {
    state('inventoryCash', '已付商品庫存', shop.inv, '$', '這筆現金已轉成商品，沒有再留在公司現金中。', ['operations', 'restock']);
    estimate('stockCover', '目前庫存可售天數', cover, '日', '用近完整日日均成交及目前商品組合的進貨＋包材成本估算；不是逐品項庫存或保證供應天數。', ['operations', 'restock']);
    actual('stockLost', '缺貨流失交易', stockLost, '筆／日', '補足庫存只處理缺貨；排隊、價格、地段和競爭仍會限制成交。', ['operations', 'restock']);
    estimate('checkoutCapacity', '目前全日結帳上限', plan.daily, '筆／日', '三班各自結帳產能的合計，未扣商品庫存限制，不代表有足夠來客。', ['staffing', 'wage', 'strategy', ...(id === 'supermarket' ? ['upgrade'] : [])]);
    if (id === 'supermarket') state('stockLimit', '設備允許的庫存上限', stockLimit(shop), '$', `目前設備維護費 ${money(assetMonthly(shop))} 元／月；提高上限不會免費取得商品。`, ['upgrade', 'operations']);
    assumptions.push(`本版商品合併成成本金額庫存；耗損按售出商品成本的 ${pct(biz.waste)}% 計入，沒有逐品項效期。營業時間為 10–22 點。`);
  } else if (id === 'salon') {
    const minutes = { quick: 35, standard: 55, premium: 80 }[op.service];
    state('serviceMinutes', '每客服務時間', minutes, '分鐘／人', `${SERVICE[op.service]}；服務時間是模式設定，未追蹤每種造型的獨立工序。`, ['operations']);
    state('stations', '可用工作站', op.stations, '站', '同時可服務人數取當班人員和工作站的較少值，多聘人不會突破工作站數。', ['staffing', 'operations']);
    estimate('serviceCapacity', '最多人班的接待上限', hourlyCapacity(shop, plan.maxStaff, plan.speed), '人次／小時', '依較少的人員／工作站、每客服務時間與流程速度換算；其他班可能更少。', ['staffing', 'wage', 'operations']);
    state('familiarity', '街區熟悉度', shop.Fbar * 100, '%', '街區對店鋪的熟悉程度，髮廊遺忘較慢；沒有辨識個別回頭客，不能稱為回購率。', ['strategy', 'operations']);
    physical = { kind: shop.staff.every((n) => n >= op.stations) ? 'stations' : 'staff' };
    assumptions.push('染護和燙髮有不同售價／材料成本，但本版工時由服務模式統一決定；街區熟悉度不是客戶留存率。');
  } else if (id === 'fitness') {
    const minutes = { open: 75, coached: 90, classes: 60 }[op.focus], perStaff = { open: 12, coached: 3, classes: 8 }[op.focus];
    const equipment = op.stations * factor * 60 / minutes, staff = plan.maxStaff * perStaff * plan.speed;
    state('sessionMinutes', '每次占用器材時段', minutes, '分鐘', `${FOCUS[op.focus]}；這是目前模式的統一時長。`, ['operations']);
    estimate('equipmentCapacity', '器材接待上限', equipment, '人次／小時', `有效器材位 ${op.stations * factor}，擴充設備增加器材端上限與維護費。`, ['upgrade', 'operations']);
    estimate('staffCapacity', '最多人班的人力上限', staff, '人次／小時', `此模式每位員工基準接待 ${perStaff} 人次／小時，再乘流程速度；實際取器材與人力較低值並取整。`, ['staffing', 'wage', 'operations']);
    physical = { kind: equipment <= shop.staff[plan.peak.shift] * perStaff * plan.speed ? 'equipment' : 'staff' };
    assumptions.push('本版採單次付費，沒有預收會員年費、會員續約率或特定課程的獨立預約席位。');
  }
  actual('dailySales', '完整日日均成交', daily, `${biz.unit}／日`, '只含已完成營業日，包含門市與外送；不將正在營業的今日當成完整一天。', ['prices', 'strategy']);
  driver('contribution', `每${biz.unit}貢獻`, contribution, '$', 'observed', accountBasis, '扣原料、包材、報廢、抽成及變動費後，可支付固定支出的金額；全批報廢會拉低每筆貢獻。', ['prices', 'grade', 'strategy']);
  estimate('breakEven', '含品牌分攤的每日損平量', breakEven, `${biz.unit}／日`, `用分析期每筆貢獻配合目前固定成本；貢獻非正時無法靠增加成交損平。${review?.ownerCost > 0 ? `老闆替代工時價值另計約 ${money(review.ownerCost)} 元／月。` : ''}`, ['staffing', 'prices', 'strategy']);

  const snapshot = { daily, lost, stockLost, queueLost, supplyAttempts, prepared, unsold, unsoldRate, cover, plan, physical, contribution, breakEven, rawUnit };
  const { bottleneck, decision } = diagnose({ shop, analysis, world, co, biz, snapshot, days, recentBasis });
  return { businessId: id, title: `${biz.name}：${definition.focus}`, formula: { text: definition.formula, detail: definition.detail }, sample: { days, basis: recentBasis, accountingBasis: accountBasis, enough: days >= 7 }, drivers, bottleneck, decision, assumptions };
}

function diagnose({ shop, analysis, world, co, biz, snapshot: x, days, recentBasis }) {
  const id = shop.businessId || 'tea', op = shop.operations, unit = biz.unit;
  const result = (key, title, severity, reason, action, tradeoff, control, change) => ({
    bottleneck: { id: key, title, severity, reason },
    decision: { id: key, title: `下一個可驗證的決策：${title}`, action, tradeoff, control, ...(change ? { change } : {}) },
  });
  if (shop.status === 'renovating') return result('opening', '先負擔裝修期現金', 'watch', '尚未營業，零成交不能判為沒有市場。', '先看現金預測能否支付到開店後 1 個月的固定支出，再檢查定位與班表。', '裝修、押金與庫存已占現金；增加據點會增加尚未產生收入的支出。', 'cash');
  if (x.contribution != null && x.contribution <= 0) return result('unitEconomics', '每筆貢獻沒有留下固定費空間', 'critical', `分析期每${unit}貢獻 ${x.contribution.toFixed(1)} 元；多成交也無法覆蓋固定支出。`, '先改 1 項售價、商品組合或原料設定，檢查接下來 7 個完整營業日能否把每筆貢獻轉正。', '漲價可能減少需求，換較便宜原料可能影響口碑；鮮食還要先查全批未售成本。', 'prices');
  if (days < 7) return result('sample', '先建立完整營業日基準', 'watch', `目前只有 ${days} 個完整營業日，不能把今天的半日數據當日均。`, `先累積到 7 個完整營業日，還差 ${7 - days} 天；記下現在售價、班表與每日目標，期間一次只改 1 項。`, '開店初期知名度仍在累積；產能上限是設定估算，成交則要等實際營業。', 'report');
  if (freshBusiness(id) && shop.stock?.day === Math.floor(world.t / 24) && shop.stock.prepared < op.prep) return result('prepFunding', '今日備料沒有達到目標', 'critical', `今日實備 ${shop.stock.prepared} 份，設定 ${op.prep} 份；提高設定不會補上已完成的批次。`, `先用現金預測確認下一批約 ${money(op.prep * x.rawUnit)} 元原料的來源，再檢查店長採購保留金額；下次備料後對比實備與目標。`, '這是按目前商品組合估算的原料金額，倉庫、中央備料與既有原料會改變實際現金支出。', 'cash');
  if (freshBusiness(id) && x.unsoldRate >= 0.1 && x.unsold >= 20 && op.prep > 40) {
    const target = Math.max(40, op.prep - 20);
    return result('waste', '每天備得多於售出', 'watch', `${recentBasis}平均未售 ${x.unsold.toFixed(1)} 份，未售比率 ${pct(x.unsoldRate)}%。`, `把下次備料由 ${op.prep} 減至 ${target} 份，少備 ${op.prep - target} 份；按目前組合約少占用 ${money((op.prep - target) * x.rawUnit)} 元原料，觀察 7 天的未售與售罄流失。`, id === 'bakery' ? `目前 18 點後折扣 ${op.markdown}%；減產可能提早售罄，折扣和減產請分開試。` : '減產可能在午晚餐提早售罄；不會讓已付的當天批次退回現金。', 'operations', { key: 'prep', from: op.prep, to: target });
  }
  const attempts = Math.max(1, x.supplyAttempts || 0);
  if (x.stockLost > 0 && x.stockLost / attempts >= 0.05) {
    if (freshBusiness(id) && op.prep < 600 && (x.unsoldRate == null || x.unsoldRate < 0.1)) {
      const target = Math.min(600, op.prep + 20);
      return result('stock', '每日批次售罄擋住成交', 'watch', `${recentBasis}供應不足流失 ${x.stockLost.toFixed(1)} 份／日；加人不能製造更多已備餐份。`, `下次備料由 ${op.prep} 增至 ${target} 份，新增原料約 ${money((target - op.prep) * x.rawUnit)} 元／批；先確認現金，再看 7 天是否少流失而沒有增加報廢。`, '多備增加先付現金與報廢風險；這個金額按目前商品組合估算，不含後勤節省。', 'operations', { key: 'prep', from: op.prep, to: target });
    }
    if (retailBusiness(id)) {
      const need = Math.max(0, op.stockTarget - shop.inv), step = id === 'supermarket' ? 100000 : 10000;
      if (need > 0 && co?.cash < need) return result('workingCapital', '補貨受現金限制', 'critical', `目前庫存距目標還差 ${money(need)} 元，公司現金 ${money(co.cash)} 元；已出現缺貨流失。`, `先查未付月結費用與下一批貨款 ${money(need)} 元，從現金預測確認可動用金額，再安排補貨。`, '營收不等於可用現金；提高庫存目標會加大資金缺口，不能直接補上商品。', 'cash');
      if (!op.autoStock) return result('stock', '缺貨時需要安排補貨', 'watch', `${recentBasis}缺貨流失 ${x.stockLost.toFixed(1)} 筆／日，目前自動補貨關閉。`, `可先補到既有目標 ${money(op.stockTarget)} 元；按現在庫存需要 ${money(need)} 元，再決定是否開啟每日自動補貨。`, '現金不足或委任保留金額仍可能限制實際補貨；不會預測新增多少客人。', 'restock');
      const target = Math.min(stockLimit(shop), op.stockTarget + step);
      if (target > op.stockTarget) return result('stock', '庫存供應限制交易', 'watch', `${recentBasis}缺貨流失 ${x.stockLost.toFixed(1)} 筆／日，和結帳排隊分開記錄。`, `先把庫存目標 ${money(op.stockTarget)} 提到 ${money(target)} 元，新增目標 ${money(target - op.stockTarget)} 元；觀察 7 天的缺貨流失與現金餘額。`, '只是增加商品緩衝，不會自動提高客源。若補貨受現金或保留金額限制，先解決資金問題。', 'operations', { key: 'stockTarget', from: op.stockTarget, to: target });
    }
    return result('stock', '供應已達設定上限', 'watch', `${recentBasis}仍有供應不足流失 ${x.stockLost.toFixed(1)} ${unit}／日。`, `先檢查目前供應、現金與每筆貢獻，觀察下一個 7 天；${id === 'supermarket' ? '再估算設備升級的貨款和維護負擔。' : '比較價格與商品組合，避免只追求更多筆數。'}`, '無法只靠加人解決供應不足；滿庫存或最大批次都仍受有限市場限制。', id === 'supermarket' ? 'upgrade' : 'report');
  }
  if (x.queueLost > 0 && x.queueLost / attempts >= 0.05) {
    if (['cafe', 'restaurant'].includes(id) && x.physical?.kind === 'seats' && op.mode !== 'takeaway') {
      const target = op.mode === 'dinein' ? 'balanced' : 'takeaway', next = { ...shop, operations: { ...op, mode: target } };
      const cap = shop.staff.reduce((a, n) => a + 4 * hourlyCapacity(next, n, x.plan.speed), 0);
      return result('seats', '目前模式受到座位周轉限制', 'watch', `${recentBasis}非缺貨流失 ${x.queueLost.toFixed(1)} ${unit}／日；成交訊號相對擁擠的 ${V.capacity.shifts[x.physical.shift][0]} 點班，模型座位上限 ${x.physical.seats}，製作上限 ${x.physical.production} ${unit}／小時。`, `可把${MODE[op.mode]}改為${MODE[target]}，模型全日接待上限 ${x.plan.daily}→${cap} ${unit}；觀察 7 天實際成交與口碑。`, '降低內用體驗會影響品質與需求；上限增加量不是預測新增成交量，未記錄流失在哪一班。', 'operations', { key: 'mode', from: op.mode, to: target });
    }
    if (id === 'salon' && x.physical?.kind === 'stations' && op.service !== 'quick') {
      const target = op.service === 'premium' ? 'standard' : 'quick', next = { ...shop, operations: { ...op, service: target } };
      const cap = shop.staff.reduce((a, n) => a + 4 * hourlyCapacity(next, n, x.plan.speed), 0);
      if (cap > x.plan.daily) return result('stations', '工作站與服務時間限制接客', 'watch', `各班人數都至少等於 ${op.stations} 個工作站；再聘人不能突破站數。非缺貨流失 ${x.queueLost.toFixed(1)} 人次／日。`, `可由${SERVICE[op.service]}改為${SERVICE[target]}，目前班表模型上限 ${x.plan.daily}→${cap} 人次／日；觀察 7 天成交、貢獻與口碑。`, '服務時間縮短會降低體驗品質；沒有把染護／燙髮各自拆成獨立工時。', 'operations', { key: 'service', from: op.service, to: target });
    }
    if (id === 'fitness' && x.physical?.kind === 'equipment' && op.focus !== 'classes') {
      const next = { ...shop, operations: { ...op, focus: 'classes' } }, cap = shop.staff.reduce((a, n) => a + 4 * hourlyCapacity(next, n, x.plan.speed), 0);
      if (cap > x.plan.daily) return result('equipment', '器材時段限制接待', 'watch', `${recentBasis}非缺貨流失 ${x.queueLost.toFixed(1)} 人次／日，目前成交訊號相對擁擠的班次受器材上限限制。`, `可比較${FOCUS[op.focus]}與團體課程；同班表上限 ${x.plan.daily}→${cap} 人次／日，再觀察 7 天成交與口碑。`, '模式同時改變體驗和人力接待係數；上限增加量不是新增成交預測，升級器材則要另付投資與維護費。', 'operations', { key: 'focus', from: op.focus, to: 'classes' });
    }
    if (['seats', 'equipment'].includes(x.physical?.kind) && biz.upgrades?.[shop.assetLevel || 0]) {
      const upgrade = biz.upgrades[shop.assetLevel || 0], next = { ...shop, assetLevel: (shop.assetLevel || 0) + 1 };
      const cap = shop.staff.reduce((a, n) => a + 4 * hourlyCapacity(next, n, x.plan.speed), 0);
      return result('equipment', '目前設備上限需要另算投資', 'watch', `${recentBasis}非缺貨流失 ${x.queueLost.toFixed(1)} ${unit}／日，目前模式的設備／座位可能先限制接待。`, `下一級「${upgrade.name}」需先付 ${money(upgrade.cost)} 元，另加維護 ${money(upgrade.monthly)} 元／月；同班表模型上限 ${x.plan.daily}→${cap} ${unit}／日，先用現金預測檢查是否付得起。`, '設備提高上限，也提高損平；沒有足夠需求時不會多賺這個容量，流失時段也未單獨記錄。', 'upgrade', { key: 'assetLevel', from: shop.assetLevel || 0, to: (shop.assetLevel || 0) + 1 });
    }
    const choices = shop.staff.map((n, shift) => ({ shift, from: n, to: Math.min(V.capacity.staffMax, n + 1), gain: hourlyCapacity(shop, Math.min(V.capacity.staffMax, n + 1), x.plan.speed) - x.plan.hourly[shift], signal: Math.max(0, ...(shop.hourEMA || []).slice(shift * 4, shift * 4 + 4)) }));
    choices.sort((a, b) => b.signal / Math.max(1, x.plan.hourly[b.shift]) - a.signal / Math.max(1, x.plan.hourly[a.shift]) || a.shift - b.shift);
    const choice = choices.find((c) => c.to > c.from && c.gain > 0);
    if (choice) {
      const cost = 4 * world.wages[shop.wageLevel] * biz.wageMult * (1 + V.labor.employerPct / 100);
      const need = x.contribution > 0 ? Math.ceil(cost / x.contribution) : null;
      return result('staff', '先測試有接待流失的班次', 'watch', `${recentBasis}非缺貨流失 ${x.queueLost.toFixed(1)} ${unit}／日；它可能包含等候離開及打烊未接完，未記錄流失發生在哪一班。`, `可先試 ${V.capacity.shifts[choice.shift][0]}–${V.capacity.shifts[choice.shift][1]} 點班 ${choice.from}→${choice.to} 人：該班上限增加 ${choice.gain * 4} ${unit}／日，增薪約 ${money(cost)} 元／日${need != null ? `，至少要多售約 ${need} ${unit}才能支付這筆增薪` : ''}。觀察 7 天後決定是否保留。`, '選班依已成交時段的平滑訊號，不保證它就是流失時段；上限增加不等於新增訂單，也不能解決缺貨或座位限制。', 'staffing', { key: 'staff', shift: choice.shift, from: choice.from, to: choice.to });
    }
    return result('capacity', '既有班表難再增加接待', 'watch', `${recentBasis}非缺貨流失 ${x.queueLost.toFixed(1)} ${unit}／日，但加一人的模型上限沒有再增加。`, `先比較 1 項服務模式或商品組合，並觀察 7 個完整營業日；${biz.upgrades ? '若仍擁擠，再將設備投資和每月維護費一起算進現金預測。' : '不要因流失就增加沒有產能效果的員工。'}`, '人力、工作站、座位及器材可能互相限制；縮短服務也會改變體驗與需求。', biz.upgrades ? 'upgrade' : 'operations');
  }
  if (x.breakEven != null && x.daily != null && x.daily < x.breakEven) return result('demand', '現有成交不足以支付損平量', 'watch', `${recentBasis}日均 ${x.daily.toFixed(1)} ${unit}，目前損平需約 ${x.breakEven} ${unit}／日；不同期間與目前成本的組合估算。`, `先找出日均約 ${Math.ceil(x.breakEven - x.daily)} ${unit}的差距，選 1 項售價或定位做 7 天比較。若考慮全通路降價 5%，${Number.isFinite(reviewPriceCut(analysis)) ? `保持原貢獻總額需成交增加約 ${pct(reviewPriceCut(analysis))}%，先評估是否有這個客源。` : '先確認降價後每筆貢獻仍為正。'}`, '沒有明顯供應流失時，增加備貨、員工或設備主要會增加成本；降價可能增加成交但降低每筆貢獻。', 'strategy');
  return result('resilience', '已能覆蓋成本，下一步檢查韌性', 'stable', `${recentBasis}日均 ${x.daily == null ? '尚無' : x.daily.toFixed(1)} ${unit}，暫未發現顯著供應流失。`, '先比較未來 6 個月正常與壓力現金預測；展店前再看新增店淨貢獻與既有店客源流失，保留至少 1 個月固定支出的緩衝。', '這是風險檢查建議，1 個月緩衝不保證安全；穩定獲利也仍可能受競爭、續租與成本變動影響。', 'cash');
}

function reviewPriceCut(analysis) {
  const pnl = analysis.pnl, receipt = pnl?.cups > 0 ? (pnl.turnover - pnl.commission) / pnl.cups : null;
  const after = analysis.contribution - receipt * 0.05;
  return receipt != null && after > 0 ? Math.max(0, analysis.contribution / after - 1) : null;
}
