// Visual feedback only: every goal and badge reads the existing economic results.
import { CITIES, AIRCRAFT } from './data.mjs?v=13';
import { FACILITIES } from './v2.mjs?v=13';
import { aircraftArt } from './ui-art-v2.js?v=13';
import { tr, pick, esc, fmtUSD, fmtPct } from './ui-util.js';

export function playIcon(id) {
  const shape = id === 'margin' ? '<path d="M20 58V44h13v14m8 0V32h13v26m8 0V19h13v39" fill="#8aafce"/><path d="m21 31 20-12 13 3 19-13" fill="none" stroke="#2f5d8c" stroke-width="4"/><circle cx="75" cy="17" r="10" fill="#dfc37b"/><path d="m70 17 4 4 6-7" fill="none" stroke="#fff" stroke-width="2"/>'
    : id === 'network' ? '<path d="M17 22 47 39 75 15M47 39l27 23M47 39 17 64" stroke="#7b9fbe" stroke-width="3" fill="none"/><circle cx="47" cy="39" r="15" fill="#2f5d8c"/><g fill="#a9c9e8" stroke="#fff" stroke-width="3"><circle cx="17" cy="22" r="9"/><circle cx="75" cy="15" r="9"/><circle cx="74" cy="62" r="9"/><circle cx="17" cy="64" r="9"/></g><path d="m40 40 15-4-7 7-4-2-4 4" fill="#fff"/>'
    : id === 'resilience' ? '<path d="M46 8 75 20v23Q70 60 46 73 22 60 17 43V20Z" fill="#abc9e1" stroke="#7f9db7"/><path d="M46 15 67 24v19Q64 55 46 65" fill="#2f5d8c"/><path d="m29 38 12 12 23-25" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>'
    : '<circle cx="46" cy="39" r="31" fill="#a9c9e8" stroke="#87a9c6"/><path d="m24 20 16-5 6 8-7 9-12-1-6 12 12 7 4 15 9 2 10-14 12-4 5-16-16-5-5-12" fill="#f7f6f2"/><path d="M12 55Q38 15 82 33" stroke="#2f5d8c" stroke-width="2" fill="none" stroke-dasharray="3 4"/><path d="m68 32 14-6-6 11-3-3-6 3" fill="#2f5d8c"/>';
  return `<svg class="play-icon" viewBox="0 0 92 82" aria-hidden="true"><ellipse cx="46" cy="72" rx="34" ry="5" fill="#1e3550" opacity=".06"/>${shape}</svg>`;
}

export function routeTicket(s, r, e, bar, active) {
  const be = e.lf * e.cost / Math.max(1, e.revenue), good = e.profit >= 0;
  return `<button type="button" class="network-route boarding-pass ${good?'':'loss'}" data-route="${r.city}">
    <div class="ticket-header"><small>${tr('天青航空 · 航線計畫','SKYGLAZE · ROUTE PLAN')}</small><span class="ticket-status">${good?tr('預估獲利','EST. PROFIT'):tr('預估虧損','EST. LOSS')}</span></div>
    <div class="ticket-destination"><div><b>${s.hub}</b><small>${esc(pick(CITIES[s.hub]))}</small></div><div class="ticket-plane">${aircraftArt(r.type)}<span>····················</span></div><div><b>${r.city}</b><small>${esc(pick(CITIES[r.city]))}</small></div></div>
    <div class="ticket-info"><span>${esc(pick(AIRCRAFT[r.type]))}</span><small>${tr(`每週 ${r.weekly} 班`,`${r.weekly}/wk`)}</small></div>
    <div class="lfrow"><span>${tr('載客','Load')} ${fmtPct(e.lf,0)}</span>${bar(e.lf,be,e.lf<be)}<small>${tr('平衡','BE')} ${fmtPct(be,0)}</small></div>
    <div class="ticket-stub"><div><small>${active?tr('下期穩定預估','NEXT-TURN ESTIMATE'):tr('穩定期預估','STEADY-STATE ESTIMATE')}</small><b class="route-profit">${good?'+':''}${esc(fmtUSD(e.profit))}</b></div><span class="ticket-barcode" aria-hidden="true"></span><span class="ticket-edit">↗</span></div>
  </button>`;
}

export function hubScene(s, queued, large = false) {
  return `<div class="hub-scene ${large?'large':''}"><img src="./art/v2/airport.webp" width="1536" height="1024" decoding="async" alt="${tr('天青航空的迷你機場，跑道、航廈與飛機','A miniature SKYGLAZE airport with runway, terminal and aircraft')}"><span class="airport-beacon" aria-hidden="true"></span><span class="hub-scene-code">${s.hub}<small>${tr('你的基地','YOUR HUB')}</small></span><div class="hub-hotspots">${Object.entries(FACILITIES).map(([id,f],i)=>`<button type="button" class="hub-hotspot ${s.facilities?.[id]?'built':queued.has(id)?'queued':''}" data-hub-detail="${id}"><i>${['⚙','♧','◒'][i]}</i><span>${esc(pick(f))}<small>${s.facilities?.[id]?tr('營運中','ACTIVE'):queued.has(id)?tr('已排定','PLANNED'):tr('查看設施','EXPLORE')}</small></span></button>`).join('')}</div></div>`;
}

export function goalList(challenge, state) {
  const labels = challenge.id === 'margin' ? [tr(`淨利率 ${fmtPct(challenge.margin)} / 3.9%`,`Margin ${fmtPct(challenge.margin)} / 3.9%`),tr('現金保持正值','Keep cash positive')]
    : challenge.id === 'network' ? [tr(`航線 ${state.routes.length} / 5 條`,`${state.routes.length} / 5 routes`),tr(`轉機旅客 ${fmtPct(challenge.transfer)} / 5%`,`Connections ${fmtPct(challenge.transfer)} / 5%`),tr('累計獲利','Make a total profit')]
    : challenge.id === 'resilience' ? [tr('保留至少一半開局現金','Retain half the starting cash'),tr('經歷疫情衝擊','Face the pandemic'),tr('經歷油價衝擊','Face the fuel shock')]
    : [tr('完成首次營運','Complete a first turn'),tr('累計獲利','Make a total profit'),tr('淨利率達 3.9%','Reach a 3.9% margin')];
  return `<div class="goal-list">${labels.map((label,i)=>`<div class="${challenge.criteria[i]?'met':''}"><span>${challenge.criteria[i]?'✓':'○'}</span>${esc(label)}</div>`).join('')}</div>`;
}

export function resultBadges(s, rep) {
  const previous = s.history.slice(0,-1), co = rep.company;
  const badges = [];
  if(rep.routes.length && !previous.some(h=>h.pax>0))badges.push(['free',tr('首航完成','First flights'),tr(`${co.pax.toLocaleString()} 位旅客已送達`,`${co.pax.toLocaleString()} passengers carried`)]);
  if(co.profit>0 && !previous.some(h=>h.profit>0))badges.push(['margin',tr('第一次獲利','First profit'),tr('航班收入已超過公司成本。','Revenue exceeded company costs.')]);
  if(co.margin>=.039 && !previous.some(h=>h.margin>=.039))badges.push(['margin',tr('超越業界','Above the industry'),tr('本期淨利率達到 3.9%。','Turn margin reached 3.9%.')]);
  if(co.transferPax/Math.max(1,co.pax)>=.05 && !previous.some(h=>h.transferPax/Math.max(1,h.pax)>=.05))badges.push(['network',tr('轉機網絡成形','Connections take shape'),tr('本期 5% 旅客來自轉機。','5% of passengers connected this turn.')]);
  return badges.length?`<section class="milestones" aria-label="${tr('新成就','New achievements')}">${badges.map(([icon,title,desc])=>`<article>${playIcon(icon)}<div><small>${tr('新成就','ACHIEVEMENT')}</small><b>${esc(title)}</b><p>${esc(desc)}</p></div><span>✓</span></article>`).join('')}</section>`:'';
}
