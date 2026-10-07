import { dateOf, COSTS, COST_NAMES, profit, report, payable, financeAction } from './venture-core.js';
import { PRODUCTS, SUPPLIERS, createManufacturing, manufacturingAction, productionPlan, stepManufacturing } from './manufacturing.js';
import { MODELS, PROJECTS, createTechnology, technologyAction, technologyMetrics, stepTechnology } from './technology.js';
import { loadVenture, storeVenture, routeKey, encodeVenture, decodeVenture, MAX_BYTES } from './venture-saves.js';
import { routeArt } from './route-art.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => (n < 0 ? '−' : '') + '$' + (Math.abs(n) >= 10000 ? (Math.abs(n) / 10000).toLocaleString('zh-TW', { maximumFractionDigits: 1 }) + ' 萬' : Math.round(Math.abs(n)).toLocaleString('zh-TW'));
const num = n => Number.isFinite(n) ? Math.round(n).toLocaleString('zh-TW') : '停機中';
const percent = n => (n * 100).toFixed(1) + '%';
const select = (name, list, value) => `<select name="${name}">${list.map(([id, label]) => `<option value="${id}"${String(value) === String(id) ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
const input = (name, value, min, max, step = 1) => `<input name="${name}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" required>`;
const field = (label, control) => `<label class="venture-field"><span>${label}</span>${control}</label>`;
const meter = (value, color = '') => `<div class="venture-meter ${color}"><i style="width:${Math.max(0, Math.min(100, value * 100))}%"></i></div>`;
const tile = (label, value, detail, bad = false) => `<div class="venture-tile ${bad ? 'bad' : ''}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;

export function startVenture(mode, business) {
  const industrial = mode === 'manufacturing', catalog = industrial ? PRODUCTS : MODELS;
  const validBusiness = catalog[business] ? business : Object.keys(catalog)[0];
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
    const r = action(w, name, data); badMessage = !r.ok; message = r.error || r.message || '已更新經營決策。'; if (r.ok) save();
  }
  function advance(days) {
    if (blocked) return 0;
    let n = 0;
    for (; n < days; n++) { if (!step(w)) break; if (w.co.cash < 0 || w.event || w.status !== 'playing') { n++; break; } }
    if (w.co.cash < 0 || w.event || w.status !== 'playing') speed = 0;
    if (n) save(); return n;
  }
  const businessName = () => catalog[industrial ? w.productId : w.modelId].name;
  const done = () => w.status !== 'playing';
  function render() {
    syncTicker();
    const l = w.co.ledger, active = !blocked && !done(), paused = speed === 0;
    app.innerHTML = `<main class="venture-shell"><header class="venture-top"><a class="venture-back" href="./" data-action="routes">← 選經營路線</a><div class="venture-title"><span>${industrial ? 'MANUFACTURING / OPERATIONS' : 'INTERNET / PRODUCT STUDIO'}</span><h1>${industrial ? '雲港製造' : '未來網路'} <small>${businessName()}</small></h1></div><div class="venture-date">${dateOf(w.day).key}<small>${done() ? (w.status === 'bankrupt' ? '資金不足結案' : '三年結案') : '第 ' + (w.day + 1) + ' 天 · ' + (paused ? '暫停' : speed + ' 日／秒')}</small></div><div class="venture-time"><button data-action="pause" aria-label="暫停" class="${paused ? 'on' : ''}">Ⅱ</button><button data-action="speed" data-value="1"${!active ? ' disabled' : ''} class="${speed === 1 ? 'on' : ''}">▶</button><button data-action="speed" data-value="8"${!active ? ' disabled' : ''} class="${speed === 8 ? 'on' : ''}">8×</button><button data-action="day"${!active ? ' disabled' : ''}>一天</button><button data-action="month"${!active ? ' disabled' : ''}>下月</button></div></header><div class="venture-capital">${tile('可用現金', money(w.co.cash), `本月尚待支付 ${money(payable(w))}`, w.co.cash < payable(w))}${tile('本月營收', money(l.revenue), '截至目前 · 依交貨／實際使用認列')}${tile('本月淨利', money(profit(l)), '含已發生費用與折舊，稅於月結認列', profit(l) < 0)}${tile(industrial ? '應收尾款' : '活躍使用者', industrial ? money(w.receivables.reduce((n,r)=>n+r.amount,0)) : num(w.users), industrial ? '已交貨，等待客戶帳期到期' : `市場 ${num(MODELS[w.modelId].market)} 人，獲客會愈來愈貴`)}</div><nav class="venture-nav" aria-label="經營頁面"><button data-tab="operation" class="${tab === 'operation' ? 'on' : ''}">${industrial ? '工廠與訂單' : '產品與成長'}</button><button data-tab="report" class="${tab === 'report' ? 'on' : ''}">經營報表與分析</button><button data-action="settings" class="venture-mobile-adjust">調整經營</button><button data-action="finance">資金與還款</button><button data-action="download">下載存檔</button><button data-action="import">匯入存檔</button><button data-action="save">存檔</button><button data-action="new">另開新局</button></nav>${message ? `<div role="status" class="venture-notice ${badMessage ? 'bad' : ''}">${esc(message)}${blocked ? '<button data-action="raw">下載原始存檔</button>' : ''}<button data-action="dismiss" aria-label="關閉通知">×</button></div>` : ''}${blocked ? '<div class="venture-notice bad">此路線暫時不能推進或自動存檔；匯入有效備份或另開新局後才會恢復。</div>' : ''}${w.co.cash < 0 && !done() ? `<div class="venture-notice bad">現金不足已 ${w.co.insolventDays} 天，連續七天就會結案。請處理資金或縮減營運；借款仍需償還。</div>` : ''}${w.event ? `<section class="venture-event"><div><span>需要你的決定 · 時間暫停</span><h2>${esc(w.event.title)}</h2><p>${esc(w.event.text)}</p></div><button data-action="event" data-choice="${industrial ? 'buffer' : 'protect'}">${industrial ? '短約議價 $18,000' : '切換與稽核 $20,000'}</button><button data-action="event" data-choice="accept">保留現金，承受影響</button></section>` : ''}${done() ? '<div class="venture-notice">這局已結束。可查看整合報表、下載結案分析，或另開新局。</div>' : ''}${tab === 'operation' ? (industrial ? manufacturingPage() : technologyPage()) : reportPage()}<footer class="venture-footer"><span>每次操作及推進後自動存檔 · 切到背景暫停 · 此路線獨立進度</span><span>教育用模擬參數，非真實產業報價；稅以 20% 月結與累積虧損抵減簡化。</span></footer><input id="venture-file" type="file" accept="application/json,.json" hidden><dialog id="venture-dialog"></dialog></main>`;
  }
  function manufacturingPage() {
    const p = PRODUCTS[w.productId], plan = productionPlan(w), status = w.day < w.maintenanceUntil ? '停機保養' : w.stock.qty <= 0 && w.orders.length ? '等待原料' : w.orders.length ? '依訂單順位生產' : '等待訂單';
    return `<div class="venture-workspace"><div class="venture-main"><section class="venture-scene"><div class="venture-scene-label"><span>FACTORY FLOOR / ${w.lines} PRODUCTION LINE${w.lines > 1 ? 'S' : ''}</span><h2>${status}</h2><p>${w.workers} 位作業員 · ${w.shift === 'overtime' ? '加班班制' : '正常班制'} · ${w.qc === 'strict' ? '嚴格品管' : '標準品管'}</p></div>${routeArt('manufacturing')}<div class="venture-process"><div><b>01 原料</b><strong>${num(w.stock.qty)} 份</strong><small>${w.shipments.length} 批在途</small></div><span>→</span><div><b>02 生產</b><strong>${num(plan.capacity)} 件／日</strong><small>毛產能，預估瑕疵 ${percent(plan.defects)}</small></div><span>→</span><div><b>03 交貨</b><strong>${w.orders.length} 張在製</strong><small>${num(plan.remaining)} 件未完成</small></div></div></section><section class="venture-section"><div class="venture-section-head"><h2>生產排程</h2><span>按順位供料；完成自動交貨</span></div>${w.orders.length ? w.orders.map((o, i) => `<article class="venture-order"><div class="venture-order-head"><span class="venture-seq">${String(i+1).padStart(2,'0')}</span><div><h3>${esc(o.client)}</h3><small>${num(o.qty)} 件 × ${money(o.price)} · 合約 ${money(o.quote)}</small></div><span class="${o.due < w.day ? 'bad-text' : ''}">${o.due < w.day ? '逾期 ' + (w.day-o.due) : '剩 ' + (o.due-w.day)} 天</span></div>${meter(o.produced / o.qty)}<div class="venture-order-foot"><small>${num(o.produced)} / ${num(o.qty)} 件 · 在製成本 ${money(o.cost)} · 尾款交貨後 ${o.term} 天</small><button data-action="priority" data-id="${o.id}">優先生產</button><button data-action="cancel" data-id="${o.id}">取消</button></div></article>`).join('') : '<p class="venture-empty">尚未接單。先看報價、原料與交期，再決定投標；投標成功才會排入生產。</p>'}</section><section class="venture-section"><div class="venture-section-head"><h2>採購客戶的詢價單</h2><span>每七天更新 · 競爭廠商也會投標</span></div><div class="venture-bids">${w.offers.map(o => { const needed = Math.ceil(o.qty / Math.max(1, plan.capacity * (1-plan.defects))), slack = o.due-w.day-plan.backlogDays-needed; return `<article class="venture-bid"><span class="venture-tag">B2B / ${o.term} 天帳期</span><h3>${esc(o.client)}</h3><strong>${num(o.qty)} 件 <small>參考 ${money(o.price)}／件</small></strong><dl><dt>交期</dt><dd>${dateOf(o.due).key}（${o.due-w.day} 天）</dd><dt>訂金</dt><dd>${percent(o.depositRate)}</dd><dt>連同現有排程餘裕</dt><dd class="${slack < 0 ? 'bad-text' : ''}">${Number.isFinite(slack) ? slack.toFixed(1) + ' 天' : '停機中'}</dd></dl><p>排程估算未含缺料、維修或未完成擴線。逾期七天未交貨會取消並退訂金、付 10% 違約金。</p><div class="venture-bid-buttons">${[.9,1,1.1].map(f=>`<button data-action="bid" data-id="${o.id}" data-factor="${f}">${f === 1 ? '參考價' : f === .9 ? '低價 −10%' : '高價 +10%'}</button>`).join('')}</div></article>`; }).join('') || '<p class="venture-empty">沒有待投詢價單，可推進到下一週。</p>'}</div></section><section class="venture-section"><h2>履約與營運紀錄</h2>${logs()}</section></div><aside class="venture-sidebar"><section class="venture-section"><h2>產線決策</h2><form data-form="manufacturing">${field('作業員（每月 ' + money(p.wage) + '／人）', input('workers',w.workers,1,30))}${field('班制',select('shift',[['normal','正常：85% 額定產能'],['overtime','加班：140% 產能、人事 +25%']],w.shift))}${field('品管',select('qc',[['standard','標準：$6,000／月'],['strict','嚴格：$18,000／月、速度 −15%']],w.qc))}${field('供應商',select('supplier',Object.entries(SUPPLIERS).map(([id,s])=>[id,`${s.name}｜${s.lead} 天、價 ×${s.cost}`]),w.supplier))}<p class="venture-help">新聘每人 $8,000 訓練費。加班增加磨損與瑕疵；嚴格品管降低瑕疵但減少產能。</p><button class="venture-primary" type="submit">套用生產決策</button></form><div class="venture-mini-stats"><span>設備磨損 <b>${percent(w.wear)}</b></span>${meter(w.wear,'warm')}<span>昨日產能利用 <b>${percent(w.today.utilization)}</b></span>${meter(w.today.utilization)}<span>履約口碑 <b>${percent(w.reputation)}</b></span>${meter(w.reputation)}</div><button data-action="maintain" class="venture-wide">停機保養兩天 · ${money(p.equipment*w.lines*.035)}</button><button data-action="expand" class="venture-wide"${w.expansion || w.lines>=6 ? ' disabled' : ''}>${w.expansion ? '擴線完成：' + dateOf(w.expansion.ready).key : '增加一條產線 · ' + money(p.equipment)}</button><p class="venture-help">擴線 14 天施工，每線需三位作業員；訂單不足時，設備和人事仍有成本。</p></section><section class="venture-section"><h2>原料與周轉</h2><dl><dt>庫存原料價值</dt><dd>${money(w.stock.value)}</dd><dt>已付在途原料</dt><dd>${money(w.shipments.reduce((n,s)=>n+s.value,0))}</dd><dt>新採購基準單價</dt><dd>${money(plan.materialCost)}</dd></dl><form data-form="purchase">${field('採購份數',input('qty',p.capacity*10,1,p.capacity*w.lines*90))}<button class="venture-primary" type="submit">付現採購</button></form><p class="venture-help">每份原料可生產一件。瑕疵會消耗原料；供應商影響價格、到貨速度與瑕疵。</p>${w.shipments.map(s=>`<div class="venture-arrival"><span>${num(s.qty)} 份原料</span><b>${dateOf(s.arrival).key}</b></div>`).join('')}</section></aside></div>`;
  }
  function technologyPage() {
    const m = technologyMetrics(w), paid = w.modelId === 'saas', platform = w.modelId === 'marketplace', priceLabel = paid ? '訂閱月費（元）' : platform ? '交易抽成（%）' : '廣告密度（1–6）', bounds = paid ? [99,1999] : platform ? [2,20] : [1,6];
    const stages = [['觸及／獲客',num(w.today.acquired),'昨日新使用者'],['產品體驗',percent(m.uptime),'模型服務可用率'],[paid ? '付費轉換' : platform ? '成功媒合' : '內容使用',paid ? num(w.today.converted) : platform ? num(w.today.transactions) : num(w.today.visits),paid ? '昨日新增付費' : platform ? '昨日交易筆數' : '昨日瀏覽次數'],['留存',num(w.today.churned),'昨日流失，含未付費者']];
    return `<div class="venture-workspace technology-workspace"><div class="venture-main"><section class="venture-scene"><div class="venture-scene-label"><span>PRODUCT STUDIO / ${w.modelId.toUpperCase()}</span><h2>${paid ? '把使用，變成持續訂閱。' : platform ? '讓雙方找到值得交易的對象。' : '讓人願意再回來。'}</h2><p>${paid ? '經營訂閱收入與流失' : platform ? '交易總額與公司抽成分開記帳' : '流量變現，廣告也會傷害體驗'}</p></div>${routeArt('technology')}<div class="venture-funnel">${stages.map(([label,value,detail],i)=>`<div><span>0${i+1} / ${label}</span><strong>${value}</strong><small>${detail}</small></div>`).join('')}</div></section><div class="venture-product-grid">${tile(paid ? '付費訂閱' : platform ? '累積交易總額 GMV' : '累積內容瀏覽',paid ? num(w.paying) : platform ? money(w.stats.gmv) : num(w.stats.visits),paid ? '活躍與付費使用者分開追蹤' : platform ? 'GMV 屬交易雙方，不是公司營收' : '公司只認列廣告收入')}${tile('產品品質',percent(w.quality),'功能或內容會過時，需要持續改善')}${tile('預估月流失率',percent(m.churn),'付費／活躍客群，免費客群流失較高',m.churn>.12)}${tile('估計獲客成本',money(m.acquisitionCost),'每位新使用者；付費轉換還需成本')}</div><section class="venture-section"><div class="venture-section-head"><h2>產品開發板</h2><span>人力有限：新功能與穩定性共用工程時間</span></div>${w.project ? `<article class="venture-project active"><span class="venture-tag">IN PROGRESS</span><h3>${PROJECTS[w.project.id].name}</h3>${meter(w.project.progress/PROJECTS[w.project.id].days)}<p>${w.project.progress.toFixed(1)} / ${PROJECTS[w.project.id].days} 工程工作量 · 目前約剩 ${Math.ceil((PROJECTS[w.project.id].days-w.project.progress)/(w.engineers*(1-(w.focus==='stability'?1:w.focus==='balanced'?.55:.2)*.7)))} 天</p></article>` : ''}<div class="venture-roadmap">${Object.entries(PROJECTS).map(([id,p])=>`<article class="venture-project"><span class="venture-tag">${p.days} 工程工作量</span><h3>${p.name}</h3><p>${p.text}</p><button data-action="project" data-id="${id}"${w.project ? ' disabled' : ''}>投入 ${money(p.fee)}</button></article>`).join('')}</div><p class="venture-help">專案費另計，人事已在每月費用；工程師更多會加快，但每人每月 $45,000。快速開發留下技術債，維運投入則會拖慢上線。</p></section><section class="venture-section"><h2>產品與市場紀錄</h2>${logs()}</section></div><aside class="venture-sidebar"><section class="venture-section"><h2>成長與營運決策</h2><form data-form="technology">${field(priceLabel,input('price',w.price,...bounds))}${field('每月獲客預算',input('marketing',w.marketing,0,500000))}${field('工程師（$45,000／月）',input('engineers',w.engineers,1,12))}${field('客服（$30,000／月）',input('support',w.support,0,20))}${field('主機容量／基本月費',select('cloudTier',Array.from({length:6},(_,i)=>[i,`${num(MODELS[w.modelId].capacity*2**i*w.capacityBonus)} 人／${money(4500*2**i)}`]),w.cloudTier))}${field('工程重心',select('focus',[['growth','快速開發：20% 維運時間'],['balanced','平衡：55% 維運時間'],['stability','穩定：100% 維運時間']],w.focus))}<p class="venture-help">調價會影響轉換或流失。加廣告不保證獲利；新聘每人另付 $12,000。</p><button type="submit" class="venture-primary">套用營運決策</button></form></section><section class="venture-section"><h2>系統健康</h2><div class="venture-mini-stats"><span>使用者／主機容量 <b>${num(w.users)} / ${num(m.capacity)}</b></span>${meter(m.load,m.load>.8?'warm':'')}<span>技術債 <b>${percent(w.techDebt)}</b></span>${meter(w.techDebt,'warm')}<span>客服負載 <b>${percent(m.supportLoad)}</b></span>${meter(m.supportLoad,m.supportLoad>1?'warm':'')}<span>留存設計成熟度 <b>${percent(w.retention)}</b></span>${meter(w.retention)}</div><p class="venture-help">主機負載超過 80% 開始影響體驗。客服不足、技術債與供應商事故都可能推高流失；成熟度是產品投入，不是實際留存率。</p></section></aside></div>`;
  }
  function logs() { return `<ol class="venture-log">${w.co.log.slice(0,10).map(x=>`<li><time>${dateOf(x.day).key}</time><span>${esc(x.text)}</span></li>`).join('')}</ol>`; }
  function lessons() {
    if (industrial) {
      const p = productionPlan(w), material = w.stock.value + w.shipments.reduce((n,s)=>n+s.value,0), wip = w.orders.reduce((n,o)=>n+o.cost,0), deposits = w.orders.reduce((n,o)=>n+o.deposit,0), ar = w.receivables.reduce((n,r)=>n+r.amount,0);
      return [
        ['訂單不能當作現金',`已交貨應收 ${money(ar)}；未交貨訂金 ${money(deposits)} 是尚未履約的責任。取消訂單還需要退回，不能當成賺到。`],
        ['產能不等於良品',`日毛產能 ${num(p.capacity)} 件，預估瑕疵 ${percent(p.defects)}。現有排程約需 ${Number.isFinite(p.backlogDays) ? p.backlogDays.toFixed(1) : '無法估計'} 天，還要另看原料到貨與保養。`],
        ['周轉金被卡在哪裡',`原料與在途 ${money(material)}、在製品 ${money(wip)}、應收尾款 ${money(ar)}。可用現金扣已發生未付費用後 ${money(w.co.cash-payable(w))}。`],
        ['損平與報價',`依產品參考價及新原料基準估算，每月需交貨約 ${p.breakEven ? num(p.breakEven)+' 件' : '無法達到損平'}，含人事、租金、品管與能源基本費。實際低價標、瑕疵、利息、折舊及違約金會提高門檻。`],
        ['擴張有代價',`目前 ${w.lines} 條產線、${w.workers} 人。擴線要先付設備款，施工 14 天，每線還需三人；沒有足夠訂單或現金，擴線反而擴大虧損。`],
      ];
    }
    const m = technologyMetrics(w), paid = w.modelId === 'saas', cac = paid ? m.acquisitionCost/m.conversion : m.acquisitionCost;
    return [
      ['使用者不是利潤',`${num(w.users)} 位活躍使用者${paid ? '，其中 '+num(w.paying)+' 位付費' : ''}。${w.modelId === 'marketplace' ? '交易總額 '+money(w.stats.gmv)+' 只按抽成認列營收。' : w.modelId === 'content' ? '瀏覽只有展示廣告才帶來收入，提高廣告密度也會增加流失。' : '月費、可用率與流失共同決定能收多少錢。'}`],
      ['獲客是否划算',`估計${paid ? '轉成付費客戶' : '每位活躍客戶'}的獲客成本 ${money(cac)}；依目前貢獻與流失估計 LTV ${money(m.ltv)}，LTV / CAC 約 ${(m.ltv/Math.max(1,cac)).toFixed(1)} 倍。這是當前條件估算，未含固定研發人事，不是保證回收。`],
      ['成長會增加服務成本',`目前主機負載 ${percent(m.load)}、客服負載 ${percent(m.supportLoad)}，可用率約 ${percent(m.uptime)}。增加流量前，先確認系統與客服承受得住。`],
      ['產品與維運共用資源',`品質 ${percent(w.quality)}、技術債 ${percent(w.techDebt)}。同一批工程師要在新功能與穩定性間分配；只追上線速度，可能換來更高流失與退款。`],
      ['損平與資金跑道',`依目前模型估計需約 ${m.breakEven ? num(m.breakEven) : '無法估計'} 位${paid ? '付費客戶' : '活躍使用者'}才支應固定支出。現金扣除已發生未付費用後 ${money(w.co.cash-payable(w))}，月固定支出約 ${money(m.fixed)}；還要保留利息、還本及臨時事故費。`],
    ];
  }
  function reportPage() {
    const r = report(w), rows = [...r.rows].reverse(), selected = rows[0], co = w.co;
    const monthDetails = selected ? `<section class="venture-section"><div class="venture-section-head"><h2>月報明細</h2>${select('reportMonth',r.rows.map(x=>[x.month,x.month+(x.partial?' 至今':'')]),selected.month)}</div><div id="venture-month-details">${monthDetail(selected)}</div></section>` : '';
    return `<div class="venture-report"><section class="venture-section venture-report-intro"><span class="route-kicker">MANAGEMENT REVIEW / ${done() ? 'CASE CLOSED' : 'IN PROGRESS'}</span><h2>${done() ? '這一局，學到了什麼？' : '把損益、現金與決策放在一起。'}</h2><p>${businessName()} · ${dateOf(0).key} 至 ${dateOf(w.day).key} · ${w.day} 天。${done() ? (w.status==='bankrupt'?'現金連續七天不足，營運結束。':'三年經營已完成。') : '本月為未結月，已發生人事先計入損益，月結才付現。'}</p><div class="venture-product-grid">${tile('累積營收',money(r.totals.revenue),'已履約的營收')}${tile('累積淨利',money(r.totals.net),'含稅、瑕疵與營運支出',r.totals.net<0)}${tile('剩餘本金',money(co.debt),'還本金影響現金，不列入費用')}${tile('淨利率',r.totals.revenue ? percent(r.totals.net/r.totals.revenue) : '尚無營收','不是現金報酬率')}</div><button data-action="case">下載整局分析報告</button></section><section class="venture-section"><h2>每月損益與資金</h2><div class="venture-table-scroll"><table><thead><tr><th>月份</th><th>營收</th><th>總成本含稅</th><th>淨利</th><th>現金變動</th><th>月底現金</th></tr></thead><tbody>${rows.map(x=>`<tr><th>${x.month}${x.partial?' 至今':''}</th><td>${money(x.revenue)}</td><td>${money(x.revenue-x.net)}</td><td class="${x.net<0?'bad-text':'good-text'}">${money(x.net)}</td><td>${money(x.cashEnd-x.cashStart)}</td><td>${money(x.cashEnd)}</td></tr>`).join('') || '<tr><td colspan="6">尚無營運紀錄</td></tr>'}</tbody></table></div></section><div class="venture-review-grid">${monthDetails}<section class="venture-section"><h2>現在的資金風險</h2><dl><dt>可用現金</dt><dd>${money(co.cash)}</dd><dt>已發生未付費用</dt><dd>${money(payable(w))}</dd><dt>本月估計利息</dt><dd>${money(co.debt*.08/12)}</dd><dt>月結估計還本</dt><dd>${money(Math.ceil(co.debt/24))}</dd>${industrial ? `<dt>原料與在途</dt><dd>${money(w.stock.value+w.shipments.reduce((n,s)=>n+s.value,0))}</dd><dt>在製品成本</dt><dd>${money(w.orders.reduce((n,o)=>n+o.cost,0))}</dd><dt>待履約訂金</dt><dd>${money(w.orders.reduce((n,o)=>n+o.deposit,0))}</dd><dt>設備帳面值</dt><dd>${money(co.assets)}</dd>` : `<dt>每月固定支出</dt><dd>${money(technologyMetrics(w).fixed)}</dd><dt>使用者上限</dt><dd>${num(MODELS[w.modelId].market)}</dd>`}</dl><p class="venture-help">營收與現金不同：設備、採購、借款和還本金不會全數反映在當月淨利。稅與月結薪資也可能讓正利潤的公司缺現金。</p>${industrial && w.receivables.length ? `<h3>尾款收款時間</h3>${w.receivables.map(x=>`<div class="venture-arrival"><span>${esc(x.client)} · ${money(x.amount)}</span><b>${dateOf(x.due).key}</b></div>`).join('')}` : ''}</section></div><section class="venture-section"><h2>${done()?'結案檢討':'現在的經營取捨'}</h2><div class="venture-lessons">${lessons().map(([title,text],i)=>`<article><span>0${i+1}</span><div><h3>${title}</h3><p>${esc(text)}</p></div></article>`).join('')}</div></section><section class="venture-section"><h2>營運紀錄</h2>${logs()}</section></div>`;
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
    if (name === 'settings') { speed = 0; syncTicker(); document.querySelector('.venture-sidebar')?.scrollIntoView({block:'start'}); return; }
    if (name === 'pause') speed = 0;
    else if (name === 'speed') { speed = Number(b.dataset.value); accumulator = 0; lastAt = performance.now(); }
    else if (name === 'day') { speed = 0; advance(1); }
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
      const r = report(w), html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="robots" content="noindex"><title>${businessName()} 經營分析</title><style>body{max-width:900px;margin:40px auto;padding:24px;font:16px/1.8 system-ui;color:#192c38}h1,h2,h3{line-height:1.4}dl{display:grid;grid-template-columns:1fr 1fr}dd{text-align:right}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:right}td:first-child,th:first-child{text-align:left}</style><h1>${businessName()}｜${done()?'結案':'階段'}分析</h1><p>${dateOf(0).key} 至 ${dateOf(w.day).key}，${w.day} 天；${w.status==='bankrupt'?'現金連續七天不足。':done()?'三年經營完成。':'仍在經營。'}現金 ${money(w.co.cash)}，剩餘本金 ${money(w.co.debt)}。累積營收 ${money(r.totals.revenue)}、淨利 ${money(r.totals.net)}。</p><h2>每月損益</h2><table><tr><th>月份</th><th>營收</th><th>淨利</th><th>期末現金</th></tr>${r.rows.map(x=>`<tr><td>${x.month}${x.partial?' 至今':''}</td><td>${money(x.revenue)}</td><td>${money(x.net)}</td><td>${money(x.cashEnd)}</td></tr>`).join('')}</table><h2>經營取捨與診斷</h2>${lessons().map(([h,p])=>`<h3>${h}</h3><p>${esc(p)}</p>`).join('')}<h2>各月成本與現金對帳</h2>${r.rows.map(x=>`<h3>${x.month}${x.partial?' 至今':''}</h3>${monthDetail(x)}`).join('')}<p>教育用模擬，不代表真實產業報價。稅以 20% 月結及累積虧損抵減簡化；LTV 為當前條件估計，非保證回收。</p></html>`;
      download(html,`創業之城-${mode}-經營分析.html`,'text/html'); return;
    } else if (name === 'cancel') { if (!confirm('取消會退還訂金、支付合約 10% 違約金，並認列在製品損失。確認取消？')) return; apply(name,{id:b.dataset.id}); }
    else if (['bid','priority','project','maintain','expand','event'].includes(name)) apply(name,{id:b.dataset.id,factor:Number(b.dataset.factor),choice:b.dataset.choice});
    render();
  });
  app.addEventListener('submit', e => {
    const form = e.target.closest('[data-form]'); if (!form) return; e.preventDefault(); speed = 0;
    const data = Object.fromEntries(new FormData(form));
    if (form.dataset.form === 'new') { w = make(data.business); blocked = false; message = '此路線的新公司已成立。'; badMessage = false; tab = 'operation'; save(); }
    else if (form.dataset.form === 'finance') {
      const r = blocked ? {ok:false,error:'請先處理存檔問題。'} : financeAction(w,e.submitter?.value,Number(data.amount)); message = r.error || '已更新資金。'; badMessage = !r.ok; if (r.ok) save();
    } else { for (const k of ['workers','qty','engineers','support','marketing','price','cloudTier']) if (k in data) data[k] = Number(data[k]); apply(form.dataset.form === 'purchase' ? 'purchase' : 'settings',data); }
    render();
  });
  app.addEventListener('focusin', e => { if (e.target.matches('input,select')) { speed = 0; accumulator = 0; syncTicker(); } });
  app.addEventListener('change', async e => {
    if (e.target.name === 'reportMonth') { const r = report(w).rows.find(r=>r.month===e.target.value); if (r) document.getElementById('venture-month-details').innerHTML = monthDetail(r); return; }
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
