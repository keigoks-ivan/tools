import { dateOf, COSTS, COST_NAMES, profit, report, payable, financeAction } from './venture-core.js';
import { PRODUCTS, SUPPLIERS, PRODUCTION_MODES, contractProfiles, contractPolicy, manufacturingOrderPreview, manufacturingSchedule, createManufacturing, manufacturingAction, productionPlan, stepManufacturing } from './manufacturing.js';
import { MODELS, PROJECTS, STRATEGIES, RELEASES, technologyProjects, technologyProjectPlan, createTechnology, technologyAction, technologyMetrics, stepTechnology } from './technology.js';
import { loadVenture, storeVenture, routeKey, encodeVenture, decodeVenture, MAX_BYTES } from './venture-saves.js';
import { routeArt } from './route-art.js';
import { ventureCoach } from './venture-coach.js';
import { decisionSnapshot, recordDecision, decisionReviews, completeDecisions } from './decision-learning.js';
import { coachHtml, decisionReviewsHtml } from './learning-view.js';
import { ventureJourney } from './venture-playbook.js';
import { manufacturingDraft, technologyDraft, manufacturingProcurement } from './venture-planner.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => (n < 0 ? '−' : '') + '$' + (Math.abs(n) >= 10000 ? (Math.abs(n) / 10000).toLocaleString('zh-TW', { maximumFractionDigits: 1 }) + ' 萬' : Math.round(Math.abs(n)).toLocaleString('zh-TW'));
const unitMoney = n => '$' + n.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
const num = n => Number.isFinite(n) ? Math.round(n).toLocaleString('zh-TW') : '停機中';
const percent = n => (n * 100).toFixed(1) + '%';
const select = (name, list, value) => `<select name="${name}">${list.map(([id, label]) => `<option value="${id}"${String(value) === String(id) ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
const input = (name, value, min, max, step = 1) => `<input name="${name}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" required>`;
const field = (label, control) => `<label class="venture-field"><span>${label}</span>${control}</label>`;
const meter = (value, color = '') => `<div class="venture-meter ${color}"><i style="width:${Math.max(0, Math.min(100, value * 100))}%"></i></div>`;
const tile = (label, value, detail, bad = false) => `<div class="venture-tile ${bad ? 'bad' : ''}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
const SCENE_LABELS = { packaging: '紙材裁切與包裝線', apparel: '裁剪與縫製工坊', electronics: '電子組裝與測試線', saas: '訂閱產品工作室', marketplace: '交易媒合指揮中心', content: '內容與工具創作基地' };

export function startVenture(mode, business) {
  const industrial = mode === 'manufacturing', catalog = industrial ? PRODUCTS : MODELS;
  const validBusiness = Object.hasOwn(catalog,business) ? business : Object.keys(catalog)[0];
  const make = id => industrial ? createManufacturing(id) : createTechnology(id);
  const action = industrial ? manufacturingAction : technologyAction, step = industrial ? stepManufacturing : stepTechnology;
  const storage = { getItem: k => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) };
  const loaded = loadVenture(storage, mode);
  let w = loaded.ok ? loaded.world : make(validBusiness), blocked = !loaded.ok && loaded.found, message = loaded.recovered ? '已從此路線的上次有效備份恢復。' : blocked ? loaded.error : '', badMessage = blocked, tab = 'operation', speed = 0, lastAt = performance.now(), accumulator = 0, ticker = null;
  const app = document.getElementById('app'); document.body.dataset.view = mode; document.getElementById('boot').hidden = true;
  document.title = (industrial ? '製造與工業' : '網路與科技') + '｜創業之城';
  function save() {
    if (blocked) return false;
    const r = storeVenture(storage, w);
    if (!r.ok) { message = r.error; badMessage = true; speed = 0; }
    return r.ok;
  }
  function apply(name, data) {
    if (blocked) { message = '先處理存檔問題，原始資料仍保留。'; badMessage = true; return; }
    speed = 0; accumulator = 0; syncTicker();
    const before = learningSnapshot();
    const r = action(w, name, data); badMessage = !r.ok; message = r.error || r.message || (r.ok ? w.co.log[0]?.text : '') || '已更新經營決策。';
    if (r.ok) { rememberDecision(({ settings: '調整營運設定', productionMode: '選擇生產製程', strategy: '選擇客群策略', purchase: '採購原料', bid: '投標與接單', priority: '調整生產順位', cancel: '取消訂單', maintain: '停機保養', expand: '擴充產線', project: '投入研發與發布', event: '處理營運事件' })[name] || '經營決策', before); save(); }
  }
  function learningSnapshot() {
    const settings = industrial ? `${w.workers} 人／${w.lines} 線；${w.shift === 'overtime' ? '加班' : '正常'}；${w.qc === 'strict' ? '嚴格' : '標準'}品管；${SUPPLIERS[w.supplier].name} / ${PRODUCTION_MODES[w.productionMode || 'balanced'].name}；${w.orders.length} 張訂單／${w.offers.length} 張詢價／累計未得標 ${w.stats.lostBids} 次；${w.shipments.length} 批在途；${w.expansion ? '擴線施工中' : '未擴線'}；保養至第 ${w.maintenanceUntil+1} 天；訂單順位 ${w.orders.map(o=>o.id).join('/')}` : `價格／密度 ${w.price}；獲客 ${w.marketing}／月；工程 ${w.engineers} 人；客服 ${w.support} 人；主機第 ${w.cloudTier+1} 級；重心 ${({ growth: '開發', balanced: '平衡', stability: '維運' })[w.focus]}；客群 ${STRATEGIES[w.modelId][w.strategy || 'general'].name} / ${w.project ? PROJECTS[w.project.id].name+' / '+RELEASES[w.project.release || 'standard'].name : '無'}`;
    return decisionSnapshot(ventureCoach(w), w.co.cash, settings);
  }
  function rememberDecision(title, before) {
    w.learning = recordDecision(w.learning, { scope: mode, title, day: w.day, fromDay: w.day, mode, businessId: industrial ? w.productId : w.modelId, before, after: learningSnapshot(), rows: w.co.daily });
  }
  function learningHtml(compact = true) {
    return coachHtml(ventureCoach(w), { compact }) + decisionReviewsHtml(decisionReviews(w.learning, mode, w.co.daily), { compact });
  }
  function scenePin(number, title, detail, target, x, y, warn = false, field = '') {
    return `<button class="scene-hotspot ${warn ? 'warn' : ''}" data-action="scene" data-target="${target}" data-field="${field}" style="left:${x}%;top:${y}%" aria-label="${esc(title + '：' + detail + '，點擊調整')}" title="${esc(title + '：' + detail)}"><span class="scene-pin-number">${number}</span><span><b>${title}</b><small>${detail}</small></span></button>`;
  }
  function nextOperation(c) {
    if (c.bottleneck.id === 'closed') return { label: '查看整局分析', tab: 'report' };
    if (c.bottleneck.id === 'event') return { label: '處理營運事件', target: '.venture-event' };
    if (c.bottleneck.id === 'cash') return { label: '安排資金與還款', action: 'finance' };
    if (industrial) return ({
      orders: { label: '比較訂單再投標', target: '#factory-opportunities' },
      materials: { label: '算缺料與採購', target: '[data-form=purchase]', field: 'qty' },
      delivery: { label: '檢查排程與交期', target: '#factory-orders' },
      staffing: { label: '試算人力與產能', target: '[data-form=manufacturing]', field: 'workers' },
      quality: { label: '比較製程與良率', target: '#production-choices' },
    })[c.bottleneck.id] || { label: '檢查訂單與貢獻', target: '#factory-opportunities' };
    return ({
      reliability: { label: '試算服務容量', target: '[data-form=technology]', field: 'cloudTier' },
      support: { label: '試算客服人力', target: '[data-form=technology]', field: 'support' },
      liquidity: { label: '先選密度足夠的客群', target: '#strategy-choices' },
      retention: { label: '比較留存改善', target: '#product-projects' },
      value: { label: '安排產品改善', target: '#product-projects' },
      acquisition: { label: '試算獲客與支出', target: '[data-form=technology]', field: 'marketing' },
    })[c.bottleneck.id] || { label: '試算收入與營運成本', target: '[data-form=technology]', field: 'price' };
  }
  function operationButton(n, className = '') {
    return `<button class="${className}" ${n.tab ? 'data-tab="'+n.tab+'"' : n.action ? 'data-action="'+n.action+'"' : 'data-action="scene" data-target="'+n.target+'" data-field="'+(n.field || '')+'"'}>${esc(n.label)} →</button>`;
  }
  function objectiveHtml() {
    const c = ventureCoach(w);
    return `<section class="venture-objective" data-risk="${c.bottleneck.severity}"><span class="objective-badge">${done() ? '✓' : '!'}</span><div><span>${done() ? '經營回顧' : '現在先處理'}</span><h2>${esc(c.bottleneck.title)}</h2><p>${esc(c.bottleneck.reason)}</p></div>${operationButton(nextOperation(c),'venture-primary')}</section>`;
  }
  function workflowHtml() {
    const c = ventureCoach(w), m = c.metrics, id = industrial ? w.productId : w.modelId;
    const brief = {
      packaging: ['包材工廠：靠按時交付的數量攤回固定成本','整批單填產線，急件賺時效，精品單重良率。先比較合約，再安排原料、班制與收款。',['良品交貨量','原料周轉']],
      apparel: ['服飾工坊：交期與良率要一起守住','大貨、檔期急件、精品小批次有不同交期和驗收成本。趕工可能多做，也可能多報廢。',['交期餘裕','良品效率']],
      electronics: ['電子組裝：高報價也可能先用光現金','原料先付款，精密單要驗收，尾款還要等帳期。接單、品管與資金不能分開決定。',['驗收損失','現金週轉']],
      saas: ['訂閱產品：讓使用者願意付費，也願意續訂','選擇自助型或團隊客群，改善引導、留存或自動化。廣告帶來新客，產品與服務決定能留多久。',['付費轉換','續訂與獲客回收']],
      marketplace: ['媒合平台：先促成交易，再擴大市場','聚焦利基或大眾市場，改善媒合與交易信任。註冊數、成交總額、公司抽成是三件不同的事。',['成交密度','抽成與信任']],
      content: ['內容事業：回訪帶來流量，廣告換取收入','搜尋或社群路線有不同使用習慣；長青內容與廣告分析能改善收入，過多廣告也會讓人離開。',['回訪與瀏覽','廣告收入與體驗']],
    }[id];
    const procurement = industrial ? manufacturingProcurement(w) : null;
    const steps = industrial ? [
      ['orders','挑單與報價',num(w.offers.length)+' 張詢價','比較貢獻、交期、訂金與帳期','#factory-opportunities',''],
      ['materials','備料與供應',num(procurement.materialGap)+' 份估計缺料','扣掉在庫與在途；先付現再到料','[data-form=purchase]','qty'],
      ['production','排產與驗收',num(m.remaining)+' 件待交','順位、班制、良率共同影響交期','#factory-orders',''],
      ['cash','交貨與收款',money(m.receivables)+' 待收','交貨才有營收；尾款到期才是現金','#factory-cash',''],
    ] : [
      ['customers','選擇客群',num(m.market)+' 人可觸及','先決定服務誰，規模不是唯一目標','#strategy-choices',''],
      ['product','改善產品',w.project ? '迭代進行中' : '選一項改善','開發與維運共用工程時間','#product-projects',''],
      ['growth',w.modelId==='saas' ? '獲客與付費' : w.modelId==='marketplace' ? '獲客與成交' : '獲客與變現',money(m.revenue)+' 估計月收入','先試算現有客群，再投入成長','[data-form=technology]','price'],
      ['service','留存與維運',percent(w.modelId==='saas' ? m.paidChurn : m.activeChurn)+' 估計月流失','讓服務資源跟上客群；觀察再調整','#technology-health',''],
    ];
    const recommended = industrial ? ({orders:'orders',materials:'materials',delivery:'production',staffing:'production',quality:'production',cash:'cash'})[c.bottleneck.id] || 'orders' : ({liquidity:'customers',value:'product',retention:'product',reliability:'service',support:'service',acquisition:'growth',cash:'growth'})[c.bottleneck.id] || 'growth';
    return `<section class="venture-command"><div><span>${industrial ? 'OPERATIONS / 從接單到回款' : 'PRODUCT / 從價值到收入'}</span><h2>${esc(brief[0])}</h2><p>${esc(brief[1])}</p></div><div class="command-variables">${brief[2].map((label,i)=>`<div class="command-variable"><span>關鍵因子 0${i+1}</span><strong>${esc(label)}</strong><small>${industrial ? '每張合約都要一起看' : '成長後仍須持續檢驗'}</small></div>`).join('')}</div></section><nav class="venture-workflow" aria-label="${industrial ? '製造營運流程' : '產品經營流程'}">${steps.map(([key,title,value,hint,target,control],i)=>`<button class="workflow-step ${key===recommended ? 'is-recommended' : ''}" data-action="scene" data-workflow="${key}" data-target="${target}" data-field="${control}"><span class="workflow-step-index">0${i+1}</span><span class="workflow-step-content"><b>${title}${key===recommended ? ' · 先看這裡' : ''}</b><strong>${value}</strong><small>${hint}</small></span></button>`).join('')}</nav>`;
  }
  function draftHtml(data = {}) {
    const p = industrial ? manufacturingDraft(w,data) : technologyDraft(w,data);
    if (!p.ok) return `<div class="venture-draft"><div class="draft-heading">決策前試算</div><p class="draft-warnings">${esc(p.error)}</p></div>`;
    const rows = industrial ? [
      ['日良品能力',num(p.before.goodCapacity)+' 件',num(p.after.goodCapacity)+' 件'],
      ['目前庫存料瑕疵',percent(p.before.defects),percent(p.after.defects)],
      ['新到料估計瑕疵',percent(p.before.newMaterialDefects),percent(p.after.newMaterialDefects)],
      ['固定月成本',money(p.before.fixedMonthly),money(p.after.fixedMonthly)],
      ['新採購料價／份',unitMoney(p.before.newMaterialUnitCost),unitMoney(p.after.newMaterialUnitCost)],
      ['新料到貨',p.before.supplierLeadDays+' 天',p.after.supplierLeadDays+' 天'],
    ] : [
      [w.modelId==='saas' ? '新客付費轉換' : w.modelId==='marketplace' ? '同客數月成交' : '同客數月瀏覽',w.modelId==='saas' ? percent(p.before.conversion) : num(w.modelId==='marketplace' ? p.before.transactionsMonthly : p.before.visitsMonthly),w.modelId==='saas' ? percent(p.after.conversion) : num(w.modelId==='marketplace' ? p.after.transactionsMonthly : p.after.visitsMonthly)],
      ['同客數月收入',money(p.before.monthlyRevenue),money(p.after.monthlyRevenue)],
      ['同客數月總成本',money(p.before.monthlyCost),money(p.after.monthlyCost)],
      ['同客數稅前結果',money(p.before.monthlyResult),money(p.after.monthlyResult)],
      ['估計可用率',percent(p.before.uptime),percent(p.after.uptime)],
      ['估計月流失',percent(p.before.churn),percent(p.after.churn)],
      ['研發速度（每人）',percent(1-p.before.maintenanceShare*.7),percent(1-p.after.maintenanceShare*.7)],
      ...(w.project ? [['目前迭代約剩',num(p.before.projectDays)+' 天',num(p.after.projectDays)+' 天']] : []),
    ];
    return `<div class="venture-draft" data-valid="true"><div class="draft-heading"><b>決策前試算</b><span>現在 → 草稿</span></div><dl>${rows.map(([label,before,after])=>`<dt>${label}</dt><dd class="draft-value"><span>${before}</span><b>${after}</b></dd>`).join('')}<dt>套用時立即付現</dt><dd>${money(p.hiring)}</dd><dt>付招募費後現金</dt><dd>${money(p.cashAfterHiring)}</dd></dl>${!p.canApply ? `<p class="draft-warnings">${esc(p.error)}</p>` : ''}<p>${industrial ? '固定月成本含折舊、利息；原料與變動能源另計。' : '固定目前客數估計完整月份；含利息、未含稅與一次性研發。'}</p><details class="draft-assumptions"><summary>試算依據與未計項目</summary>${p.assumptions.map(a=>`<p>${esc(a)}</p>`).join('')}</details><small>只看草稿不會花錢或推進。按「套用」才會改變經營。</small></div>`;
  }
  function purchasePreviewHtml(qty) {
    const p = manufacturingProcurement(w), valid = Number.isInteger(qty) && qty>=1 && qty<=p.maxQty, cost = valid ? Math.round(qty*p.unitCost) : null;
    return `<div class="venture-draft"><div class="draft-heading"><b>採購前確認</b><span>目前供應商 · ${esc(p.supplierName)}</span></div><dl><dt>立即付現</dt><dd>${cost===null ? '填寫有效數量' : money(cost)}</dd><dt>付款後現金</dt><dd>${cost===null ? '—' : money(w.co.cash-cost)}</dd><dt>到貨日期</dt><dd>${p.arrivalDate}（${p.leadDays} 天）</dd></dl>${!valid || cost>w.co.cash || !p.shipmentSlots ? `<p class="draft-warnings">${!valid ? '數量須為 1 至 '+num(p.maxQty)+' 的整數。' : !p.shipmentSlots ? '已達 20 批在途上限。' : '現金不足；先調整數量或安排資金。'}</p>` : cost>w.co.cash-payable(w) ? '<p class="draft-warnings">採購後現金不足支付目前已發生的月結費用。</p>' : ''}<p>先轉為原料資產，投入生產才逐步認列成本；仍須保留薪資與其他承諾的現金。</p><details class="draft-assumptions"><summary>採購依據與限制</summary>${p.assumptions.map(a=>`<p>${esc(a)}</p>`).join('')}</details></div>`;
  }
  function cashCycleHtml() {
    const c=ventureCoach(w), m=c.metrics;
    return `<section class="venture-section" id="factory-cash"><div class="venture-section-head"><h2>履約與收款台</h2><span>合約 ≠ 營收 ≠ 可用現金</span></div><div class="venture-cash-stages"><article><span>01 接單</span><h3>${money(m.deposits)}</h3><p>在製訂單已收訂金。尚待履約，取消時需退回。</p></article><article><span>02 生產／交貨</span><h3>${money(m.wip)}</h3><p>目前在製品成本。良品完成及合約驗收後認列交貨收入。</p></article><article><span>03 尾款入帳</span><h3>${money(m.receivables)}</h3><p>已交貨的待收尾款。帳期到期才會增加可用現金。</p></article></div>${w.receivables.length ? w.receivables.slice().sort((a,b)=>a.due-b.due).map(r=>`<div class="venture-arrival"><span>${esc(r.client)} · ${money(r.amount)}</span><b>${dateOf(r.due).key} 收款</b></div>`).join('') : '<p class="venture-empty">尚無已交貨的待收尾款。得標訂金不算營收；完成交貨後才會建立尾款帳期。</p>'}<p class="venture-brief-note">現金扣已發生未付費用及下一次利息、還本後 ${money(c.finance.available)}。尚未保留新採購、研發、維修與稅。</p><button data-action="finance">安排資金與提前還款 →</button></section>`;
  }
  function observationHtml() {
    return `<section class="venture-section" id="venture-observation"><div class="venture-section-head"><h2>做一次決策，再看營運結果</h2><span>不靠一次調整永久獲利</span></div><p>套用設定、接單或開始研發後，先跑七天，對照交貨、收入、流失與現金。遇到事件或現金不足會先停下。</p><div class="supply-actions"><button data-action="week" class="venture-primary"${done() || blocked ? ' disabled' : ''}>觀察接下來七天 →</button><button data-tab="report">查看報表與決策觀察</button></div></section>`;
  }
  function advance(days) {
    if (blocked) return 0;
    let n = 0;
    for (; n < days; n++) { if (!step(w)) break; if (w.co.cash < 0 || w.event || w.status !== 'playing') { n++; break; } }
    if (w.co.cash < 0 || w.event || w.status !== 'playing') speed = 0;
    if (n) { if (w.learning) w.learning = completeDecisions(w.learning, () => w.co.daily); save(); } return n;
  }
  const businessName = () => catalog[industrial ? w.productId : w.modelId].name;
  const done = () => w.status !== 'playing';
  function render() {
    syncTicker();
    const l = w.co.ledger, active = !blocked && !done(), paused = speed === 0;
    app.innerHTML = `<main class="venture-shell"><header class="venture-top"><a class="venture-back" href="./" data-action="routes">← 選經營路線</a><div class="venture-title"><span>${industrial ? 'MANUFACTURING / OPERATIONS' : 'INTERNET / PRODUCT STUDIO'}</span><h1>${industrial ? '雲港製造' : '未來網路'} <small>${businessName()}</small></h1></div><div class="venture-date">${dateOf(w.day).key}<small>${done() ? (w.status === 'bankrupt' ? '資金不足結案' : '三年結案') : '第 ' + (w.day + 1) + ' 天 · ' + (paused ? '暫停' : speed + ' 日／秒')}</small></div><div class="venture-time"><button data-action="pause" aria-label="暫停" class="${paused ? 'on' : ''}">Ⅱ</button><button data-action="speed" data-value="1"${!active ? ' disabled' : ''} class="${speed === 1 ? 'on' : ''}">▶</button><button data-action="speed" data-value="8"${!active ? ' disabled' : ''} class="${speed === 8 ? 'on' : ''}">8×</button><button data-action="day"${!active ? ' disabled' : ''}>一天</button><button data-action="month"${!active ? ' disabled' : ''}>下月</button></div></header><div class="venture-capital">${tile('可用現金', money(w.co.cash), `本月尚待支付 ${money(payable(w))}`, w.co.cash < payable(w))}${tile('本月營收', money(l.revenue), '截至目前 · 依交貨／實際使用認列')}${tile('本月淨利', money(profit(l)), '含已發生費用與折舊，稅於月結認列', profit(l) < 0)}${tile(industrial ? '應收尾款' : '活躍使用者', industrial ? money(w.receivables.reduce((n,r)=>n+r.amount,0)) : num(w.users), industrial ? '已交貨，等待客戶帳期到期' : `市場 ${num(technologyMetrics(w,{includeBreakEven:false}).market)} 人，獲客會愈來愈貴`)}</div><nav class="venture-nav" aria-label="經營頁面"><button data-tab="operation" class="${tab === 'operation' ? 'on' : ''}">${industrial ? '工廠與訂單' : '產品與成長'}</button><button data-tab="report" class="${tab === 'report' ? 'on' : ''}">經營報表與分析</button><button data-action="settings" class="venture-mobile-adjust">調整經營</button><button data-action="finance">資金與還款</button><button data-action="download">下載存檔</button><button data-action="import">匯入存檔</button><button data-action="save">存檔</button><button data-action="new">另開新局</button></nav>${message ? `<div role="status" class="venture-notice ${badMessage ? 'bad' : ''}">${esc(message)}${blocked ? '<button data-action="raw">下載原始存檔</button>' : ''}<button data-action="dismiss" aria-label="關閉通知">×</button></div>` : ''}${blocked ? '<div class="venture-notice bad">此路線暫時不能推進或自動存檔；匯入有效備份或另開新局後才會恢復。</div>' : ''}${w.co.cash < 0 && !done() ? `<div class="venture-notice bad">現金不足已 ${w.co.insolventDays} 天，連續七天就會結案。請處理資金或縮減營運；借款仍需償還。</div>` : ''}${w.event ? `<section class="venture-event"><div><span>需要你的決定 · 時間暫停</span><h2>${esc(w.event.title)}</h2><p>${esc(w.event.text)}</p></div><button data-action="event" data-choice="${industrial ? 'buffer' : 'protect'}">${industrial ? '短約議價 $18,000' : '切換與稽核 $20,000'}</button><button data-action="event" data-choice="accept">保留現金，承受影響</button></section>` : ''}${done() ? '<div class="venture-notice">這局已結束。可查看整合報表、下載結案分析，或另開新局。</div>' : ''}${tab === 'operation' ? objectiveHtml() + workflowHtml() + (industrial ? manufacturingPage() : technologyPage()) : reportPage()}<footer class="venture-footer"><span>每次操作及推進後自動存檔 · 切到背景暫停 · 此路線獨立進度</span><span>教育用模擬參數，非真實產業報價；稅以 20% 月結與累積虧損抵減簡化。</span></footer><input id="venture-file" type="file" accept="application/json,.json" hidden><dialog id="venture-dialog"></dialog></main>`;
  }
  function journeyHtml() {
    const journey = ventureJourney(w, industrial ? {} : technologyMetrics(w, { includeBreakEven: false }));
    const target = id => id === 'profit' ? 'data-tab="report"' : `data-action="scene" data-target="${industrial ? id === 'contract' ? '#factory-opportunities' : '#factory-orders' : id === 'release' ? '#product-projects' : id === 'customers' ? '#strategy-choices' : '[data-form=technology]'}"`;
    return `<section class="venture-journey" aria-label="創業階段目標"><div class="venture-board-heading"><h2>你的創業旅程</h2><span>${journey.completed}／${journey.steps.length} 目標 · 自由經營</span></div><div class="journey-track">${journey.steps.map((s,i)=>`<button class="journey-step ${s.complete ? 'is-done' : journey.current === i ? 'is-current' : ''}" ${target(s.id)} title="${esc(s.detail)}"><span class="journey-number">${s.complete ? '✓' : String(i+1).padStart(2,'0')}</span><span><b>${esc(s.title)}</b><small>${s.unit === '達標' ? s.complete ? '目前達標' : '等待營運驗證' : num(Math.min(s.value,s.target))+'／'+num(s.target)+' '+s.unit}</small><i class="journey-progress"><i style="width:${s.progress*100}%"></i></i></span></button>`).join('')}</div><p>階段目標不限制經營選項。獲利以已完成月結為準；服務與客群目標依目前營運狀態檢查。</p></section>`;
  }
  function productionModesHtml() {
    return `<section class="venture-section" id="production-choices"><div class="venture-board-heading"><h2>選擇這批的製程</h2><span>可隨時切換 · 影響接下來的生產</span></div><div class="venture-decision-grid">${Object.entries(PRODUCTION_MODES).map(([id,p])=>{const m=productionPlan({...w,productionMode:id});return `<button class="venture-choice ${id === (w.productionMode || 'balanced') ? 'on' : ''}" data-action="production" data-mode="${id}" aria-pressed="${id === (w.productionMode || 'balanced')}"><span class="choice-icon" aria-hidden="true">${id === 'batch' ? '▦' : id === 'precision' ? '◎' : '⚙'}</span><b>${esc(p.name)}</b><small>${esc(p.description)}</small><span>毛產能 ${num(m.capacity)} 件／天</span><span>估計瑕疵 ${percent(m.defects)}</span><span>良品變動能源 ${unitMoney(m.energyPerGood)}／件</span></button>`;}).join('')}</div><p class="venture-help">製程與班制、品管、原料一起影響良品。精密單另看合約的製程損失門檻；加快生產也可能增加驗收支出。</p></section>`;
  }
  function strategyHtml() {
    return `<section class="venture-section" id="strategy-choices"><div class="venture-board-heading"><h2>這次先服務誰？</h2><span>客群策略 · 後續獲客與使用量會改變</span></div><div class="venture-decision-grid">${Object.entries(STRATEGIES[w.modelId]).map(([id,p])=>{const m=technologyMetrics({...w,strategy:id},{includeBreakEven:false});return `<button class="venture-choice ${id === (w.strategy || 'general') ? 'on' : ''}" data-action="strategy" data-strategy="${id}" aria-pressed="${id === (w.strategy || 'general')}"><span class="choice-icon" aria-hidden="true">${id === 'general' ? '◉' : '◇'}</span><b>${esc(p.name)}</b><small>${esc(p.text)}</small><span>估計廣告獲客 ${money(m.acquisitionCost)}／人</span><span>客群上限 ${num(m.market)} 人</span><span>${w.modelId === 'marketplace' ? '完整媒合密度 ' + num(m.liquidityTarget) + ' 人' : w.modelId === 'content' ? '每千次廣告收入 ' + unitMoney(m.adCPM) : '每人月服務成本 ' + unitMoney(m.userCost)}</span></button>`;}).join('')}</div><p class="venture-help">卡片估算已計入完成的產品能力。策略從現在起套用；既有使用者仍會留在帳上，實際新增、流失與收入要等營運觀察。</p></section>`;
  }
  function projectPlanHtml(id, release = 'standard') {
    const p = technologyProjectPlan(w,id,release);
    return `<dl><dt>工具與發布費</dt><dd>${money(p.fee)}</dd><dt>工程工作量</dt><dd>${num(p.days)} 人日</dd><dt>依目前團隊估計</dt><dd>${num(p.estimatedDays)} 天</dd><dt>技術債變動</dt><dd>${p.debt >= 0 ? '+' : ''}${(p.debt*100).toFixed(1)} 點</dd>${id === 'reliability' ? `<dt>基礎容量增幅</dt><dd>${percent(p.capacityGain)}</dd>` : ''}</dl><p>${esc(RELEASES[release].text)} 技術債限制在 0–100 點內。</p>`;
  }
  function contractPreviewHtml(o, factor = 1) {
    const p = manufacturingOrderPreview(w,o,{factor}), terms = p.policy;
    return `<div class="contract-preview"><dl><dt>得標機會估計</dt><dd>${percent(p.acceptanceChance)}</dd><dt>補足原料後預估驗收</dt><dd class="${p.slackDays === null || p.slackDays < 0 ? 'bad-text' : ''}">${p.finishDay === null ? '排程範圍內未估到完成；請檢查交期與供料' : dateOf(p.finishDay).key}</dd><dt>排程補料估算</dt><dd>${money(p.upfrontMaterial)} · ${num(p.materialGap)} 份</dd><dt>履約成功時估計貢獻</dt><dd class="${p.estimatedContribution < 0 || p.finishDay===null ? 'bad-text' : ''}">${p.finishDay===null ? '交貨未確定，暫不判定' : money(p.estimatedContribution)}</dd></dl><p>${esc(p.assumptions)}；固定費、折舊、利息與稅另計。${p.finishDay===null ? '尚未估到交貨，不把未知逾期費當零，也不把這張單當作可實現獲利。' : '未含可能取消的違約與在製損失。'}</p>${p.upfrontMaterial > Math.max(0,w.co.cash+p.deposit-payable(w)) ? '<p class="draft-warnings">即使得標收訂金，扣已發生未付費用後仍不足補料。先安排周轉，再承諾交期。</p>' : ''}${p.materialGap > PRODUCTS[w.productId].capacity*w.lines*90 ? '<p class="draft-warnings">缺料超過單次採購上限，需拆批並核對到貨。此排程試算假設缺料可同時補足。</p>' : ''}<p class="contract-risk">每日逾期 ${percent(terms.lateRate)}，超過 ${terms.cancelAfter} 天取消；取消違約 ${percent(terms.cancelRate)}。${terms.inspectionDays ? `驗收另需 ${terms.inspectionDays} 天；製程損失超過 ${percent(terms.auditTolerance)} 會增加驗收支出，最高合約 ${percent(terms.auditCap)}。` : ''}</p></div>`;
  }
  function factoryOrderHtml(o, i, scheduled) {
    const terms = contractPolicy(w,o), profile = o.profile ? contractProfiles(w.productId)[o.profile] : null, p = scheduled.find(x=>x.id===o.id);
    return `<article class="venture-order"><div class="venture-order-head"><span class="venture-seq">${String(i+1).padStart(2,'0')}</span><div><span class="contract-profile ${o.profile || 'legacy'}">${esc(profile?.name || '既有合約')}</span><h3>${esc(o.client)}</h3><small>${num(o.qty)} 件 × ${money(o.price)} · 合約 ${money(o.quote)}</small></div><span class="${o.due < w.day ? 'bad-text' : ''}">${o.due < w.day ? '逾期 ' + (w.day-o.due) : '剩 ' + (o.due-w.day)} 天</span></div>${meter(o.produced/o.qty)}<p class="contract-risk">${o.inspectionReady != null ? '良品完成，等待 '+dateOf(o.inspectionReady).key+' 驗收' : '按目前排程估計 '+(p.finishDay === null ? '最多 90 日排程內未估到完成，請檢查供料與產能' : dateOf(p.finishDay).key+' 完成／驗收')} · 取消期限 ${dateOf(o.due+terms.cancelAfter+1).key}</p><div class="venture-order-foot"><small>${num(o.produced)}／${num(o.qty)} 件 · 在製成本 ${money(o.cost)} · 尾款交貨後 ${o.term} 天</small><button data-action="priority" data-id="${o.id}"${i===0 ? ' disabled' : ''}>移到最前</button><button data-action="cancel" data-id="${o.id}">取消</button></div></article>`;
  }
  function factoryOfferHtml(o) {
    const profile = o.profile ? contractProfiles(w.productId)[o.profile] : null;
    return `<article class="venture-bid" data-offer="${o.id}"><span class="venture-tag contract-profile ${o.profile || 'legacy'}">${esc(profile?.name || '既有詢價')} · ${o.term} 天帳期</span><h3>${esc(o.client)}</h3>${profile ? `<p class="venture-brief-note">${esc(profile.description)}</p>` : ''}<strong>${num(o.qty)} 件 <small>參考 ${money(o.price)}／件</small></strong><dl><dt>交期</dt><dd>${dateOf(o.due).key}（${o.due-w.day} 天）</dd><dt>得標先收訂金</dt><dd>${percent(o.depositRate)}</dd><dt>詢價有效期</dt><dd>${Math.max(0,o.expires-w.day)} 天</dd></dl><label class="venture-field"><span>先選報價，看風險與貢獻</span>${select('quote',[[.9,'低價 −10%'],[1,'參考價'],[1.1,'高價 +10%']],1)}</label><div data-contract-preview="${o.id}">${contractPreviewHtml(o)}</div><div class="venture-bid-buttons">${[.9,1,1.1].map(f=>`<button data-action="bid" data-id="${o.id}" data-factor="${f}" class="${f===1 ? 'on' : ''}"${done() || w.orders.length>=12 ? ' disabled' : ''}>${f===1?'參考價投標':f===.9?'低價投標':'高價投標'}</button>`).join('')}</div></article>`;
  }
  function projectWorkboardHtml() {
    const active = w.project && technologyProjectPlan(w,w.project.id);
    return `<section class="venture-section" id="product-projects"><div class="venture-section-head"><h2>產品迭代工作台</h2><span>不同專案與發布方式 · 共用工程時間</span></div>${active ? `<article class="venture-project active"><span class="venture-tag">製作中 · ${active.releaseName}</span><h3>${active.name}</h3>${meter(w.project.progress/active.days)}<p>${w.project.progress.toFixed(1)}／${active.days} 工程工作量 · 依目前團隊約剩 ${num(active.estimatedDays)} 天</p><p>${esc(active.text)}</p><p>發布技術債 ${active.debt >= 0 ? '+' : ''}${(active.debt*100).toFixed(1)} 點（0–100 點內）${active.id === 'reliability' ? ' · 基礎容量增加 ' + percent(active.capacityGain) : ''}。</p></article>` : ''}<div class="venture-roadmap">${Object.entries(technologyProjects(w.modelId)).map(([id,p])=>{const plan=technologyProjectPlan(w,id);return `<article class="venture-project" data-project="${id}"><span class="venture-tag">${plan.completed ? '已研發，效果持續啟用' : p.modelId ? '專屬研發' : '基礎研發'}</span><h3>${p.name}</h3><p>${p.text}</p><label class="venture-field project-launch-options"><span>發布方式</span>${select('release',Object.entries(RELEASES).map(([id,r])=>[id,r.name]),'standard')}</label><div data-project-preview="${id}">${projectPlanHtml(id)}</div><button data-action="project" data-id="${id}"${w.project || plan.completed || done() ? ' disabled' : ''}>${plan.completed ? '已完成研發' : '啟動這次迭代'}</button></article>`;}).join('')}</div><p class="venture-help">專案費另計，人事已在每月費用。先小量發布降低技術債但較慢；搶先發布較快，也需要承受額外維運成本。</p></section>`;
  }
  function manufacturingPage() {
    const scheduled = manufacturingSchedule(w), procurement = manufacturingProcurement(w);
    const p = PRODUCTS[w.productId], plan = productionPlan(w), status = w.day < w.maintenanceUntil ? '停機保養' : w.stock.qty <= 0 && w.orders.length ? '等待原料' : w.orders.length ? '依訂單順位生產' : '等待訂單';
    return `<div class="venture-workspace"><div class="venture-main"><section class="venture-scene"><div class="venture-scene-label"><span>FACTORY FLOOR / ${w.lines} PRODUCTION LINE${w.lines > 1 ? 'S' : ''}</span><h2>${SCENE_LABELS[w.productId]}</h2><p>${status} / ${w.workers} 位作業員 · ${w.shift === 'overtime' ? '加班班制' : '正常班制'} · ${w.qc === 'strict' ? '嚴格品管' : '標準品管'}</p></div><div class="venture-scene-map">${routeArt('manufacturing',false,w.productId)}${scenePin('01','原料倉',num(w.stock.qty)+' 份','[data-form=purchase]',18,26,w.stock.qty===0 && w.orders.length>0,'qty')}${scenePin('02','生產線',num(w.today.produced)+' 件良品／昨日','[data-form=manufacturing]',50,49,w.day<w.maintenanceUntil,'workers')}${scenePin('03','交貨與訂單',w.orders.length+' 張在製','#factory-orders',85,50,false)}<span class="scene-map-status">${w.lines} 條線 · ${w.workers} 位作業員 · 點標記管理</span></div><div class="venture-process"><div><b>01 原料</b><strong>${num(w.stock.qty)} 份</strong><small>${w.shipments.length} 批在途</small></div><span>→</span><div><b>02 生產</b><strong>${num(plan.capacity)} 件／日</strong><small>毛產能，預估瑕疵 ${percent(plan.defects)}</small></div><span>→</span><div><b>03 交貨</b><strong>${w.orders.length} 張在製</strong><small>${num(plan.remaining)} 件未完成</small></div></div></section>${journeyHtml()}${productionModesHtml()}<section class="venture-section" id="factory-orders"><div class="venture-section-head"><h2>生產排程</h2><span>按順位供料；完成自動交貨</span></div>${w.orders.length ? w.orders.map((o,i)=>factoryOrderHtml(o,i,scheduled)).join('') : '<p class="venture-empty">尚未接單。先看報價、原料與交期，再決定投標；投標成功才會排入生產。</p>'}</section><section class="venture-section" id="factory-opportunities"><div class="venture-section-head"><h2>客戶任務板</h2><span>每七天更新 · 競爭廠商也會投標</span></div><div class="venture-bids">${w.offers.map(factoryOfferHtml).join('') || '<p class="venture-empty">沒有待投詢價單，可推進到下一週。</p>'}</div></section>${cashCycleHtml()}${observationHtml()}<details class="venture-debrief"><summary>經營取捨與七日決策觀察</summary>${learningHtml()}</details><section class="venture-section"><h2>工廠動態</h2>${logs()}</section></div><aside class="venture-sidebar"><section class="venture-section"><h2>產線決策</h2><form data-form="manufacturing">${field('作業員（每月 ' + money(p.wage) + '／人）', input('workers',w.workers,1,30))}${field('班制',select('shift',[['normal','正常：85% 額定產能'],['overtime','加班：140% 產能、人事 +25%']],w.shift))}${field('品管',select('qc',[['standard','標準：$6,000／月'],['strict','嚴格：$18,000／月、速度 −15%']],w.qc))}${field('供應商',select('supplier',Object.entries(SUPPLIERS).map(([id,s])=>[id,`${s.name}｜${s.lead} 天、價 ×${s.cost}`]),w.supplier))}<p class="venture-help">新聘每人 $8,000 訓練費。加班增加磨損與瑕疵；嚴格品管降低瑕疵但減少產能。</p><div data-settings-preview>${draftHtml()}</div><button class="venture-primary" type="submit">套用生產決策</button></form><div class="venture-mini-stats"><span>設備磨損 <b>${percent(w.wear)}</b></span>${meter(w.wear,'warm')}<span>昨日產能利用 <b>${percent(w.today.utilization)}</b></span>${meter(w.today.utilization)}<span>履約口碑 <b>${percent(w.reputation)}</b></span>${meter(w.reputation)}</div><button data-action="maintain" class="venture-wide">停機保養兩天 · ${money(p.equipment*w.lines*.035)}</button><button data-action="expand" class="venture-wide"${w.expansion || w.lines>=6 ? ' disabled' : ''}>${w.expansion ? '擴線完成：' + dateOf(w.expansion.ready).key : '增加一條產線 · ' + money(p.equipment)}</button><p class="venture-help">擴線 14 天施工，每線需三位作業員；訂單不足時，設備和人事仍有成本。</p></section><section class="venture-section"><h2>原料與周轉</h2><dl><dt>庫存原料價值</dt><dd>${money(w.stock.value)}</dd><dt>已付在途原料</dt><dd>${money(w.shipments.reduce((n,s)=>n+s.value,0))}</dd><dt>新採購供應商單價</dt><dd>${unitMoney(procurement.unitCost)}</dd></dl><div class="venture-supply-brief"><b>已接訂單估計缺料 ${num(procurement.materialGap)} 份</b><p>已扣在庫及在途，按各批良率估算。${esc(procurement.reason)}</p><button type="button" data-action="fill-materials"${procurement.recommendedQty ? '' : ' disabled'}>帶入目前可採購 ${num(procurement.recommendedQty)} 份 →</button><small>只帶入數量；確認金額後才付現。</small></div><form data-form="purchase">${field('採購份數',input('qty',procurement.recommendedQty || p.capacity*10,1,p.capacity*w.lines*90))}<div data-purchase-preview>${purchasePreviewHtml(procurement.recommendedQty || p.capacity*10)}</div><button class="venture-primary" type="submit">付現採購</button></form><p class="venture-help">每份原料可生產一件。瑕疵會消耗原料；供應商影響價格、到貨速度與瑕疵。</p>${w.shipments.map(s=>`<div class="venture-arrival"><span>${num(s.qty)} 份原料</span><b>${dateOf(s.arrival).key}</b></div>`).join('')}</section></aside></div>`;
  }
  function technologyPage() {
    const m = technologyMetrics(w), paid = w.modelId === 'saas', platform = w.modelId === 'marketplace', priceLabel = paid ? '訂閱月費（元）' : platform ? '交易抽成（%）' : '廣告密度（1–6）', bounds = paid ? [99,1999] : platform ? [2,20] : [1,6];
    const stages = [['觸及／獲客',num(w.today.acquired),'昨日新使用者'],['產品體驗',percent(m.uptime),'模型服務可用率'],[paid ? '付費轉換' : platform ? '成功媒合' : '內容使用',paid ? num(w.today.converted) : platform ? num(w.today.transactions) : num(w.today.visits),paid ? '昨日新增付費' : platform ? '昨日交易筆數' : '昨日瀏覽次數'],['留存',num(w.today.churned),'昨日流失，含未付費者']];
    return `<div class="venture-workspace technology-workspace"><div class="venture-main"><section class="venture-scene"><div class="venture-scene-label"><span>PRODUCT STUDIO / ${w.modelId.toUpperCase()}</span><h2>${SCENE_LABELS[w.modelId]}</h2><p>${paid ? '經營訂閱收入與流失' : platform ? '交易總額與公司抽成分開記帳' : '流量變現，廣告也會傷害體驗'}</p></div><div class="venture-scene-map">${routeArt('technology',false,w.modelId)}${scenePin('01','客服與成長',w.support+' 位客服','[data-form=technology]',15,30,m.supportLoad>1,'support')}${scenePin('02','產品團隊',w.engineers+' 位工程師','#product-projects',48,50,false)}${scenePin('03','伺服器',percent(m.uptime)+' 可用率','[data-form=technology]',80,23,m.uptime<.9,'cloudTier')}<span class="scene-map-status">${num(w.users)} 位活躍使用者 · 點標記管理</span></div><div class="venture-funnel">${stages.map(([label,value,detail],i)=>`<div><span>0${i+1} / ${label}</span><strong>${value}</strong><small>${detail}</small></div>`).join('')}</div></section><div class="venture-product-grid">${tile(paid ? '付費訂閱' : platform ? '累積交易總額 GMV' : '累積內容瀏覽',paid ? num(w.paying) : platform ? money(w.stats.gmv) : num(w.stats.visits),paid ? '活躍與付費使用者分開追蹤' : platform ? 'GMV 屬交易雙方，不是公司營收' : '公司只認列廣告收入')}${tile('產品品質',percent(w.quality),'功能或內容會過時，需要持續改善')}${tile('預估月流失率',percent(m.churn),paid ? '付費客群；免費客群另有較高流失率' : '活躍客群；依實際每日流失模型估算',m.churn>.12)}${tile('估計獲客成本',money(m.acquisitionCost),'每位新使用者；付費轉換還需成本')}</div>${journeyHtml()}${strategyHtml()}${projectWorkboardHtml()}${observationHtml()}<details class="venture-debrief"><summary>經營取捨與七日決策觀察</summary>${learningHtml()}</details><section class="venture-section"><h2>產品與市場紀錄</h2>${logs()}</section></div><aside class="venture-sidebar"><section class="venture-section"><h2>成長與營運決策</h2><form data-form="technology">${field(priceLabel,input('price',w.price,...bounds))}${field('每月獲客預算',input('marketing',w.marketing,0,500000))}${field('工程師（$45,000／月）',input('engineers',w.engineers,1,12))}${field('客服（$30,000／月）',input('support',w.support,0,20))}${field('主機容量／基本月費',select('cloudTier',Array.from({length:6},(_,i)=>[i,`${num(MODELS[w.modelId].capacity*2**i*w.capacityBonus)} 人／${money(4500*2**i)}`]),w.cloudTier))}${field('工程重心',select('focus',[['growth','開發優先：86% 研發速度'],['balanced','平衡：61.5% 研發速度'],['stability','維運優先：30% 研發速度']],w.focus))}<p class="venture-help">調價會影響轉換或流失。新聘每人另付 $12,000。維運優先更能抑制技術債，研發仍以較慢速度進行；百分比是模型進度效率。</p><div data-settings-preview>${draftHtml()}</div><button type="submit" class="venture-primary">套用營運決策</button></form></section><section class="venture-section" id="technology-health"><h2>系統健康</h2><div class="venture-mini-stats"><span>使用者／主機容量 <b>${num(w.users)} / ${num(m.capacity)}</b></span>${meter(m.load,m.load>.8?'warm':'')}<span>技術債 <b>${percent(w.techDebt)}</b></span>${meter(w.techDebt,'warm')}<span>客服負載 <b>${percent(m.supportLoad)}</b></span>${meter(m.supportLoad,m.supportLoad>1?'warm':'')}<span>留存設計成熟度 <b>${percent(w.retention)}</b></span>${meter(w.retention)}</div><p class="venture-help">主機負載超過 80% 開始影響體驗。客服不足、技術債與供應商事故都可能推高流失；成熟度是產品投入，不是實際留存率。</p></section></aside></div>`;
  }
  function logs() { return `<ol class="venture-log">${w.co.log.slice(0,10).map(x=>`<li><time>${dateOf(x.day).key}</time><span>${esc(x.text)}</span></li>`).join('')}</ol>`; }
  function lessons() {
    if (industrial) {
      const p = productionPlan(w), economic = ventureCoach(w).metrics, material = w.stock.value + w.shipments.reduce((n,s)=>n+s.value,0), wip = w.orders.reduce((n,o)=>n+o.cost,0), deposits = w.orders.reduce((n,o)=>n+o.deposit,0), ar = w.receivables.reduce((n,r)=>n+r.amount,0);
      return [
        ['訂單不能當作現金',`已交貨應收 ${money(ar)}；未交貨訂金 ${money(deposits)} 是尚未履約的責任。取消訂單還需要退回，不能當成賺到。`],
        ['產能不等於良品',`日毛產能 ${num(p.capacity)} 件，預估瑕疵 ${percent(p.defects)}。現有排程約需 ${Number.isFinite(p.backlogDays) ? p.backlogDays.toFixed(1) : '無法估計'} 天，還要另看原料到貨與保養。`],
        ['周轉金被卡在哪裡',`原料與在途 ${money(material)}、在製品 ${money(wip)}、應收尾款 ${money(ar)}。可用現金扣已發生未付費用後 ${money(w.co.cash-payable(w))}。`],
        ['損平與報價',`依參考售價、選定供應商新料價與目前良率估算，每月需交貨約 ${economic.breakEven != null ? num(economic.breakEven)+' 件' : '無法達到損平'}，含固定營運費、折舊及利息。已付庫存按原成本；低價標、批次良率、違約及稅仍會改變結果。`],
        ['擴張有代價',`目前 ${w.lines} 條產線、${w.workers} 人。擴線要先付設備款，施工 14 天，每線還需三人；沒有足夠訂單或現金，擴線反而擴大虧損。`],
      ];
    }
    const m = technologyMetrics(w), paid = w.modelId === 'saas', cac = paid ? m.acquisitionCost/m.conversion : m.acquisitionCost;
    return [
      ['使用者不是利潤',`${num(w.users)} 位活躍使用者${paid ? '，其中 '+num(w.paying)+' 位付費' : ''}。${w.modelId === 'marketplace' ? '交易總額 '+money(w.stats.gmv)+' 只按抽成認列營收。' : w.modelId === 'content' ? '瀏覽只有展示廣告才帶來收入，提高廣告密度也會增加流失。' : '月費、可用率與流失共同決定能收多少錢。'}`],
      ['獲客是否划算',`估計${paid ? '轉成付費客戶' : '每位活躍客戶'}的獲客成本 ${money(cac)}；依目前貢獻與流失估計 LTV ${money(m.ltv)}，LTV / CAC 約 ${(m.ltv/Math.max(1,cac)).toFixed(1)} 倍。這是當前條件估算，未含固定研發人事，不是保證回收。`],
      ['成長會增加服務成本',`目前主機負載 ${percent(m.load)}、客服負載 ${percent(m.supportLoad)}，可用率約 ${percent(m.uptime)}。增加流量前，先確認系統與客服承受得住。`],
      ['產品與維運共用資源',`品質 ${percent(w.quality)}、技術債 ${percent(w.techDebt)}。同一批工程師要在新功能與穩定性間分配；只追上線速度，可能換來更高流失與退款。`],
      ['損平與資金跑道',`${m.breakEven == null ? '目前設定與市場上限內無法損平。' : '保留目前設定'+(paid ? '與免費客群' : '')+'，依目標規模重算容量'+(w.modelId === 'marketplace' ? '與媒合率' : '')+'後，約需 '+num(m.breakEven)+' 位'+(paid ? '付費客戶' : '活躍使用者')+'才能支應固定支出。'}現金扣除已發生未付費用後 ${money(w.co.cash-payable(w))}，月固定支出約 ${money(m.fixed)}；還要保留利息、還本及臨時事故費。`],
    ];
  }
  function reportPage() {
    const r = report(w), rows = [...r.rows].reverse(), selected = rows[0], co = w.co;
    const monthDetails = selected ? `<section class="venture-section"><div class="venture-section-head"><h2>月報明細</h2>${select('reportMonth',r.rows.map(x=>[x.month,x.month+(x.partial?' 至今':'')]),selected.month)}</div><div id="venture-month-details">${monthDetail(selected)}</div></section>` : '';
    return `<div class="venture-report"><section class="venture-section venture-report-intro"><span class="route-kicker">MANAGEMENT REVIEW / ${done() ? 'CASE CLOSED' : 'IN PROGRESS'}</span><h2>${done() ? '這一局，學到了什麼？' : '把損益、現金與決策放在一起。'}</h2><p>${businessName()} · ${dateOf(0).key} 至 ${dateOf(w.day).key} · ${w.day} 天。${done() ? (w.status==='bankrupt'?'現金連續七天不足，營運結束。':'三年經營已完成。') : '本月為未結月，已發生人事先計入損益，月結才付現。'}</p><div class="venture-product-grid">${tile('累積營收',money(r.totals.revenue),'已履約的營收')}${tile('累積淨利',money(r.totals.net),'含稅、瑕疵與營運支出',r.totals.net<0)}${tile('剩餘本金',money(co.debt),'還本金影響現金，不列入費用')}${tile('淨利率',r.totals.revenue ? percent(r.totals.net/r.totals.revenue) : '尚無營收','不是現金報酬率')}</div><button data-action="case">下載整局分析報告</button></section>${learningHtml(false)}<section class="venture-section"><h2>每月損益與資金</h2><div class="venture-table-scroll"><table><thead><tr><th>月份</th><th>營收</th><th>總成本含稅</th><th>淨利</th><th>現金變動</th><th>月底現金</th></tr></thead><tbody>${rows.map(x=>`<tr><th>${x.month}${x.partial?' 至今':''}</th><td>${money(x.revenue)}</td><td>${money(x.revenue-x.net)}</td><td class="${x.net<0?'bad-text':'good-text'}">${money(x.net)}</td><td>${money(x.cashEnd-x.cashStart)}</td><td>${money(x.cashEnd)}</td></tr>`).join('') || '<tr><td colspan="6">尚無營運紀錄</td></tr>'}</tbody></table></div></section><div class="venture-review-grid">${monthDetails}<section class="venture-section"><h2>現在的資金風險</h2><dl><dt>可用現金</dt><dd>${money(co.cash)}</dd><dt>已發生未付費用</dt><dd>${money(payable(w))}</dd><dt>本月估計利息</dt><dd>${money(co.debt*.08/12)}</dd><dt>月結估計還本</dt><dd>${money(Math.ceil(co.debt/24))}</dd>${industrial ? `<dt>原料與在途</dt><dd>${money(w.stock.value+w.shipments.reduce((n,s)=>n+s.value,0))}</dd><dt>在製品成本</dt><dd>${money(w.orders.reduce((n,o)=>n+o.cost,0))}</dd><dt>待履約訂金</dt><dd>${money(w.orders.reduce((n,o)=>n+o.deposit,0))}</dd><dt>設備帳面值</dt><dd>${money(co.assets)}</dd>` : `<dt>每月固定支出</dt><dd>${money(technologyMetrics(w).fixed)}</dd><dt>使用者上限</dt><dd>${num(technologyMetrics(w,{includeBreakEven:false}).market)}</dd>`}</dl><p class="venture-help">營收與現金不同：設備、採購、借款和還本金不會全數反映在當月淨利。稅與月結薪資也可能讓正利潤的公司缺現金。</p>${industrial && w.receivables.length ? `<h3>尾款收款時間</h3>${w.receivables.map(x=>`<div class="venture-arrival"><span>${esc(x.client)} · ${money(x.amount)}</span><b>${dateOf(x.due).key}</b></div>`).join('')}` : ''}</section></div><section class="venture-section"><h2>${done()?'結案檢討':'現在的經營取捨'}</h2><div class="venture-lessons">${lessons().map(([title,text],i)=>`<article><span>0${i+1}</span><div><h3>${title}</h3><p>${esc(text)}</p></div></article>`).join('')}</div></section><section class="venture-section"><h2>營運紀錄</h2>${logs()}</section></div>`;
  }
  function monthDetail(r) { return `<dl class="venture-costs"><dt>營收</dt><dd>${money(r.revenue)}</dd>${COSTS.filter(k=>r[k]).map(k=>`<dt>${COST_NAMES[k]}</dt><dd>${money(r[k])}</dd>`).join('')}<dt>所得稅</dt><dd>${money(r.tax)}</dd><dt class="venture-total">淨利</dt><dd class="venture-total">${money(r.net)}</dd></dl><h3>現金流對帳</h3><dl><dt>期初現金</dt><dd>${money(r.cashStart)}</dd><dt>實際收款</dt><dd>+${money(r.receipts)}</dd><dt>借款</dt><dd>+${money(r.borrowing)}</dd><dt>實付費用含稅</dt><dd>−${money(r.payments)}</dd><dt>設備支出</dt><dd>−${money(r.capex)}</dd><dt>原料採購</dt><dd>−${money(r.purchases)}</dd><dt>償還本金</dt><dd>−${money(r.principal)}</dd><dt class="venture-total">期末現金</dt><dd class="venture-total">${money(r.cashEnd)}</dd></dl>`; }
  function download(raw, name, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([raw], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function financeDialog() {
    const d = document.getElementById('venture-dialog'); speed = 0; syncTicker();
    d.innerHTML = `<form method="dialog" class="venture-dialog-head"><h2>資金與還款</h2><button aria-label="關閉">×</button></form><dl><dt>可用現金</dt><dd>${money(w.co.cash)}</dd><dt>剩餘本金</dt><dd>${money(w.co.debt)}</dd><dt>還可借款</dt><dd>${money(w.co.capital*1.5-w.co.debt)}</dd></dl><p>年息 8%。每月支付剩餘本金的 1/24 及利息，另可提前還款。利息為費用，本金只影響現金。</p><form data-form="finance">${field('金額（元）',input('amount',100000,1,w.co.capital*1.5))}<button name="financeAction" value="borrow" type="submit">借款</button><button name="financeAction" value="repay" type="submit">提前還款</button></form>`; d.showModal();
  }
  app.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; speed = 0; render(); return; }
    const b = e.target.closest('[data-action]'); if (!b) return;
    const name = b.dataset.action;
    if (name === 'routes') { e.preventDefault(); speed = 0; if (save()) location.href = './'; else render(); return; }
    if (name === 'scene') {
      speed = 0; accumulator = 0; syncTicker();
      const target = document.querySelector(b.dataset.target);
      if (target) { for (let d = target.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true; target.scrollIntoView({ block: 'start' }); const control = b.dataset.field && target.querySelector(`[name="${b.dataset.field}"]`); if (control) control.focus({ preventScroll: true }); }
      return;
    }
    if (name === 'fill-materials') {
      speed=0; accumulator=0; syncTicker(); const form=app.querySelector('[data-form=purchase]'), p=manufacturingProcurement(w);
      if (form && p.recommendedQty) { form.elements.qty.value=p.recommendedQty; form.querySelector('[data-purchase-preview]').innerHTML=purchasePreviewHtml(p.recommendedQty); form.scrollIntoView({block:'start'}); form.elements.qty.focus({preventScroll:true}); }
      return;
    }
    if (name === 'settings') { speed = 0; syncTicker(); document.querySelector('.venture-sidebar')?.scrollIntoView({block:'start'}); return; }
    if (name === 'pause') speed = 0;
    else if (name === 'speed') { speed = Number(b.dataset.value); accumulator = 0; lastAt = performance.now(); }
    else if (name === 'day') { speed = 0; advance(1); }
    else if (name === 'week') { speed = 0; const n=advance(7); message=`已觀察 ${n} 天；可到報表對照經營結果。`; badMessage=false; }
    else if (name === 'month') { speed = 0; const d = dateOf(w.day); advance(d.dim-d.day+1); }
    else if (name === 'finance') { financeDialog(); return; }
    else if (name === 'save') { const ok = save(); message = ok ? '已保存此路線，刷新或關閉後可繼續。' : message || '此路線的原始存檔正在保護中。'; badMessage = !ok; }
    else if (name === 'dismiss') message = '';
    else if (name === 'download') { download(encodeVenture(w),`創業之城-${mode}-${dateOf(w.day).key}.json`); return; }
    else if (name === 'raw') { if (loaded.raw) download(loaded.raw,`創業之城-${mode}-原始存檔.json`); return; }
    else if (name === 'import') { speed = 0; syncTicker(); document.getElementById('venture-file').click(); return; }
    else if (name === 'new') {
      speed = 0; syncTicker(); const d = document.getElementById('venture-dialog');
      d.innerHTML = `<form method="dialog" class="venture-dialog-head"><h2>另開${industrial?'製造':'網路'}新局</h2><button aria-label="關閉">×</button></form><p>會取代此路線的自動進度。請先下載存檔；其他兩條路線保持各自進度。</p><form data-form="new">${field('創業題目',select('business',Object.entries(catalog).map(([id,p])=>[id,p.name+'｜資本 '+money(p.capital)]),industrial?w.productId:w.modelId))}<button type="submit" class="venture-primary">確認另開新局</button></form>`; d.showModal(); return;
    } else if (name === 'case') {
      const r = report(w), html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="robots" content="noindex"><title>${businessName()} 經營分析</title><style>body{max-width:900px;margin:40px auto;padding:24px;font:16px/1.8 system-ui;color:#192c38}h1,h2,h3{line-height:1.4}dl{display:grid;grid-template-columns:1fr 1fr}dd{text-align:right}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:right}td:first-child,th:first-child{text-align:left}</style><h1>${businessName()}｜${done()?'結案':'階段'}分析</h1><p>${dateOf(0).key} 至 ${dateOf(w.day).key}，${w.day} 天；${w.status==='bankrupt'?'現金連續七天不足。':done()?'三年經營完成。':'仍在經營。'}現金 ${money(w.co.cash)}，剩餘本金 ${money(w.co.debt)}。累積營收 ${money(r.totals.revenue)}、淨利 ${money(r.totals.net)}。</p><h2>每月損益</h2><table><tr><th>月份</th><th>營收</th><th>淨利</th><th>期末現金</th></tr>${r.rows.map(x=>`<tr><td>${x.month}${x.partial?' 至今':''}</td><td>${money(x.revenue)}</td><td>${money(x.net)}</td><td>${money(x.cashEnd)}</td></tr>`).join('')}</table><h2>業態關鍵因子與決策觀察</h2>${learningHtml(false)}<h2>經營取捨與診斷</h2>${lessons().map(([h,p])=>`<h3>${h}</h3><p>${esc(p)}</p>`).join('')}<h2>各月成本與現金對帳</h2>${r.rows.map(x=>`<h3>${x.month}${x.partial?' 至今':''}</h3>${monthDetail(x)}`).join('')}<p>教育用模擬，不代表真實產業報價。稅以 20% 月結及累積虧損抵減簡化；LTV 為當前條件估計，非保證回收。</p></html>`;
      download(html,`創業之城-${mode}-經營分析.html`,'text/html'); return;
    } else if (name === 'cancel') { const order = w.orders.find(o=>o.id===b.dataset.id), terms = order && contractPolicy(w,order); if (!terms || !confirm(`取消會退還訂金、支付合約 ${percent(terms.cancelRate)} 違約金，並認列在製品損失。確認取消？`)) return; apply(name,{id:b.dataset.id}); }
    else if (name === 'production') apply('productionMode',{id:b.dataset.mode});
    else if (name === 'strategy') apply('strategy',{id:b.dataset.strategy});
    else if (name === 'project') apply(name,{id:b.dataset.id,release:b.closest('[data-project]')?.querySelector('[name=release]')?.value || 'standard'});
    else if (['bid','priority','maintain','expand','event'].includes(name)) apply(name,{id:b.dataset.id,factor:Number(b.dataset.factor),choice:b.dataset.choice});
    render();
  });
  app.addEventListener('submit', e => {
    const form = e.target.closest('[data-form]'); if (!form) return; e.preventDefault(); speed = 0;
    const data = Object.fromEntries(new FormData(form));
    if (form.dataset.form === 'new') { w = make(data.business); blocked = false; message = '此路線的新公司已成立。'; badMessage = false; tab = 'operation'; save(); }
    else if (form.dataset.form === 'finance') {
      const before = learningSnapshot();
      const r = blocked ? {ok:false,error:'請先處理存檔問題。'} : financeAction(w,e.submitter?.value,Number(data.amount)); message = r.error || '已更新資金。'; badMessage = !r.ok; if (r.ok) { rememberDecision(e.submitter?.value === 'repay' ? '提前還款' : '借入資金', before); save(); }
    } else { for (const k of ['workers','qty','engineers','support','marketing','price','cloudTier']) if (k in data) data[k] = Number(data[k]); apply(form.dataset.form === 'purchase' ? 'purchase' : 'settings',data); }
    render();
  });
  app.addEventListener('focusin', e => { if (e.target.matches('input,select')) { speed = 0; accumulator = 0; syncTicker(); } });
  function previewForm(form) {
    if (form?.dataset.form==='purchase') { form.querySelector('[data-purchase-preview]').innerHTML=purchasePreviewHtml(form.elements.qty.value.trim() ? Number(form.elements.qty.value) : NaN); }
    else if (['manufacturing','technology'].includes(form?.dataset.form)) { form.querySelector('[data-settings-preview]').innerHTML=draftHtml(Object.fromEntries(new FormData(form))); }
  }
  app.addEventListener('input',e=>{ if (e.target.matches('input[type=number]')) previewForm(e.target.closest('[data-form]')); });
  app.addEventListener('change', async e => {
    if (e.target.matches('select,input[type=number]') && e.target.closest('[data-form]')) previewForm(e.target.closest('[data-form]'));
    if (e.target.name === 'reportMonth') { const r = report(w).rows.find(r=>r.month===e.target.value); if (r) document.getElementById('venture-month-details').innerHTML = monthDetail(r); return; }
    if (e.target.name === 'release') { const card=e.target.closest('[data-project]'); if (card) card.querySelector('[data-project-preview]').innerHTML=projectPlanHtml(card.dataset.project,e.target.value); return; }
    if (e.target.name === 'quote') { const card=e.target.closest('[data-offer]'), offer=w.offers.find(o=>o.id===card?.dataset.offer); if (offer) { card.querySelector('[data-contract-preview]').innerHTML=contractPreviewHtml(offer,Number(e.target.value)); for (const b of card.querySelectorAll('[data-action=bid]')) b.classList.toggle('on',Number(b.dataset.factor)===Number(e.target.value)); } return; }
    if (e.target.id !== 'venture-file') return;
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > MAX_BYTES) throw new Error('存檔超過 2 MiB。');
      const incoming = decodeVenture(await file.text(),mode);
      if (!confirm('匯入會取代這條路線的進度，請先下載目前存檔。確認匯入？')) return;
      w = incoming.world; blocked = false; message = '已匯入並保存此路線。'; badMessage = false; speed = 0; save();
    } catch (err) { message = err.message; badMessage = true; }
    render();
  });
  document.addEventListener('visibilitychange',()=>{speed=0;accumulator=0;lastAt=performance.now();syncTicker();save();if(!document.hidden)render();});
  window.addEventListener('pagehide',save); window.addEventListener('beforeunload',save);
  function tick() {
    const now = performance.now(), elapsed = Math.min(500,now-lastAt); lastAt=now;
    if (document.hidden || !speed || blocked || done() || document.getElementById('venture-dialog')?.open) return;
    accumulator += elapsed * speed / 1000;
    if (accumulator >= 1) { const n = Math.floor(accumulator); accumulator -= n; advance(n); render(); }
  }
  function syncTicker() {
    if (speed && !document.hidden && !blocked && !done()) { if (!ticker) { lastAt = performance.now(); ticker = setInterval(tick,250); } }
    else if (ticker) { clearInterval(ticker); ticker = null; }
    const label = app.querySelector('.venture-date small');
    if (label && !done()) label.textContent = '第 ' + (w.day + 1) + ' 天 · ' + (speed ? speed + ' 日／秒' : '暫停');
    for (const b of app.querySelectorAll('.venture-time [data-action]')) if (['pause','speed'].includes(b.dataset.action)) b.classList.toggle('on', b.dataset.action === 'pause' ? !speed : Number(b.dataset.value) === speed);
  }
  if (!loaded.ok && !blocked) save(); render();
  window.__venture = { get world(){return w;}, action: (a,d)=>{apply(a,d);render();}, advance:n=>{const r=advance(n);render();return r;}, save, get state(){return {speed,tab,blocked,ticking:!!ticker};} }; window.__ready = true;
}
