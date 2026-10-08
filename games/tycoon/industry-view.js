import { INDUSTRIES, industryId, industryVolumeUnit } from './industry-catalog.js';
import { industryState, industryEffects, industryInvestmentCost } from './industry-sim.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Math.round(n).toLocaleString('zh-TW');
const pct = n => (n * 100).toFixed(1) + '%';
export function industrySettings(w) {
  if (!w.industry) return '未啟用專屬劇本';
  const p = INDUSTRIES[industryId(w)], s = w.industry;
  return p.axes.map(a => a.name + '：' + a.options.find(o => o.id === s.policies[a.id]).name).join('／') + '；專屬改善 ' + (s.work ? s.work.elapsed + '/' + p.investment.days : '無');
}
export function industryDrivers(w) {
  const p = INDUSTRIES[industryId(w)], s = industryState(w);
  return p.resources.map(r => ({ id: 'industry-' + r.id, label: r.name, value: s.resources[r.id] * 100, unit: '%', type: 'state' }));
}
export function industryBoardHtml(w, { disabled = false, report = false, scene = '', shopId = '' } = {}) {
  const id = industryId(w), p = INDUSTRIES[id], s = industryState(w), e = industryEffects(w), end = disabled || report;
  const unit=industryVolumeUnit(id);
  const attr = `data-industry-shop="${esc(shopId)}"`;
  const goals = [['營運驗證', `${Math.min(7, s.stats.days)}／7 日；${s.stats.volume>0?'有實際營運樣本':'尚無實際營運樣本'}`], ['關鍵能力', `${p.resources.find(r => r.id === p.target[0]).name} ${pct(s.resources[p.target[0]])}／${pct(p.target[1])}`], ['成長實績', `累積營運量 ${Math.round(s.stats.volume).toLocaleString()}／${p.target[2].toLocaleString()} ${unit}，完成一次改善`]];
  return `<section class="industry-board industry-${id}${scene&&!report?' industry-has-scene':''}${report ? ' industry-report' : ''}" data-industry="${id}" ${attr} aria-label="${p.name}專屬經營劇本">
    <header class="industry-heading"><div><span>BUSINESS CAMPAIGN / ${p.name}</span><h2>${p.name} · 經營作戰室</h2><p>${esc(p.lesson)}</p></div><b class="industry-level">${s.milestones.length}<small>／3 里程碑</small></b></header>
    ${!w.industry&&!report?'<p>這是保留的舊版進度。選擇下方專屬決策後才啟用劇本；既有現金、訂單與已付庫存保留。</p>':''}
    ${scene && !report ? `<div class="industry-stage">${scene}<div class="industry-stage-caption"><span>你的生意，正在運作</span><b>${esc(p.loop[s.stats.days < 7 ? 0 : s.work ? 1 : s.milestones.length >= 2 ? 3 : 2])}</b></div></div>` : ''}
    <ol class="industry-loop">${p.loop.map((x, i) => `<li><b>0${i + 1}</b><span>${esc(x)}</span></li>`).join('')}</ol>
    <div class="industry-resources">${p.resources.map(r => { const value = s.resources[r.id], last = s.history.length > 6 ? s.history.at(-7)[r.id] : null; return `<article><span>${esc(r.name)}</span><strong>${pct(value)}<small>${last === null ? '營運後逐日更新' : `${value >= last ? '▲' : '▼'} ${Math.abs((value - last) * 100).toFixed(1)} 點／近七筆實績`}</small></strong><meter min="0" max="1" value="${value}">${pct(value)}</meter><p>${esc(r.help)}</p></article>`; }).join('')}</div>
    ${!report ? `<div class="industry-decisions">${p.axes.map(a => `<fieldset><legend>${esc(a.name)}</legend>${a.options.map(o => `<button type="button" data-industry-kind="policy" data-axis="${a.id}" data-value="${o.id}" class="${s.policies[a.id] === o.id ? 'is-chosen' : ''}" aria-pressed="${s.policies[a.id] === o.id}"${end ? ' disabled' : ''}><b>${s.policies[a.id] === o.id ? '◆ ' : '◇ '}${esc(o.name)}</b><span>${esc(o.detail)}</span></button>`).join('')}</fieldset>`).join('')}</div><div class="industry-investment"><div><span>老闆專屬投資</span><h3>${p.investment.name}</h3><p>${esc(p.investment.text)}</p>${s.recovery?`<p>情境改善還需 ${s.recovery.remaining} 個營運日；期間保留能力或增加科技維運費。</p>`:''}${s.work ? `<progress value="${s.work.elapsed}" max="${p.investment.days}"></progress><b>團隊執行 ${s.work.elapsed}／${p.investment.days} 個營運日</b>` : `<small>需 ${p.investment.days} 個營運日 · 第 ${s.stats.investments + 1} 次改善</small>`}</div><button type="button" data-industry-kind="invest"${end || s.work ? ' disabled' : ''}>${s.work ? '執行中' : '決定投資 ' + money(industryInvestmentCost(w))}</button></div>` : `<p>目前決策：${esc(industrySettings(w))}。專屬改善與情境支出累計支付 ${money(s.stats.spent)}，已完成 ${s.stats.investments} 次；費用已進入經營損益。</p>`}
    <details class="industry-effects"><summary>這些決策目前如何影響經營</summary><dl>${[['客源吸引倍率', e.demand.toFixed(2) + '×'], ['服務／生產能力', pct(e.capacity)], ['新採購單位成本', pct(e.cost)], ['額外固定月費', money(e.monthly)], ...(p.mode === 'technology' ? [['新客轉換倍率', e.conversion.toFixed(2) + '×'], ['流失倍率', e.churn.toFixed(2) + '×'], ['自然觸及倍率', e.organic.toFixed(2) + '×'], ['成交／瀏覽倍率', e.trades.toFixed(2) + '×／' + e.visits.toFixed(2) + '×'], ['每人每月額外服務成本', money(e.userCost)]] : [['額外瑕疵／退貨率', pct(e.defects)], ['額外驗收等待', e.inspection + ' 日'], ['服務補償／風險費率', pct(e.risk)]])].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><p>倍率套用在目前條件上；不會直接增加人口、現金或保證成交。庫存不足、排隊、價格接受度、既有合約與團隊預算仍然生效。採購仍須先付現；生產批次依已記錄成本結算，門店商品庫存沿用原有價值模型。驗收等待在進入驗收時確定。</p></details>
    ${p.mode==='stores'?'<p>獨立門店三年挑戰：完成三個里程碑，最近三個完整月淨利為正，並保有營運現金。</p>':''}
    <ol class="industry-goals">${goals.map(([name, detail], i) => `<li class="${s.milestones.includes(i) ? 'is-done' : ''}"><b>${s.milestones.includes(i) ? '✓' : i + 1}</b><div><strong>${name}</strong><small>${esc(detail)}</small></div></li>`).join('')}</ol>
    <details class="industry-history"><summary>專屬變數與實際營運的歷史</summary>${s.history.length ? `<div class="industry-table"><table><thead><tr><th>遊戲日</th>${p.resources.map(r => `<th>${r.name}</th>`).join('')}<th>實際營運量（${unit}）</th><th>認列營收</th></tr></thead><tbody>${s.history.slice(-7).reverse().map(h => `<tr><td>${h.day + 1}</td>${p.resources.map(r => `<td>${pct(h[r.id])}</td>`).join('')}<td>${h.volume.toLocaleString('zh-TW',{maximumFractionDigits:1})}</td><td>${money(h.revenue)}</td></tr>`).join('')}</tbody></table></div>` : '<p>完成一個營運日後顯示，不會拿預估當實績。</p>'}<p>營運量以實際 ${unit} 加總；製造良品與專案工作尚待合約交付驗收才認列營收。資源是模擬中的能力／風險指數，並非客戶數或保證訂單。整月成本、淨利與現金請看同頁整合報表；里程碑不送錢、不限制選項。</p></details>
  </section>`;
}
