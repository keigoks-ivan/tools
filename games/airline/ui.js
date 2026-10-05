// 天青航空：航線經營 — UI. All game logic lives in the model (backend.mjs); this file only renders and collects decisions.
import * as B from './backend.mjs';
import { airlinerSVG, cloudLines } from './ui-art.js';
import { createMap } from './ui-map.js';
import { BRAND_EN, tr, pick, esc, $, $$, fmtUSD, fmtPct, fmtNum, fmtFare, term, withTerms, markTermSeen, locale, setLocale } from './ui-util.js';

const { MODES, HUBS, CITIES, AIRCRAFT, LESSONS, GLOSSARY } = B;
const INDUSTRY = B.CONST?.industryMargin ?? 0.039;
const list = (o) => (Array.isArray(o) ? o.map((x) => (typeof x === 'string' ? { id: x, ...(CITIES[x] || {}) } : { ...x })) : Object.entries(o || {}).map(([id, v]) => ({ id, ...v })));
// what each hub teaches (UI copy; the model only supplies geography)
const HUB_TEACH = {
  TPE: ['夾在東北亞與東南亞中間，轉機客是機會。', 'Between NE and SE Asia; transfer traffic is the opportunity.'],
  NRT: ['本國市場很大，先把近距離的航線做穩。', 'A huge home market. Build a solid short-haul base first.'],
  SIN: ['沒有國內線，每條航線都是國際線。', 'No domestic market; every route is international.'],
  DXB: ['位置就是優勢，長程轉機是主力。', 'Geography is the asset; long-haul transfers carry the network.'],
  ZRH: ['市場小但客人有錢，成本很高。', 'Small, rich market with very high costs.'],
};
const MODE_MIN = { 0: '20–30', 1: '40' };
const modeList = list(MODES).map((m, i) => ({ minutes: MODE_MIN[i], ...m })), hubList = list(HUBS).map((h) => (HUB_TEACH[h.id] ? { teachZh: HUB_TEACH[h.id][0], teachEn: HUB_TEACH[h.id][1], ...h } : h));
const cadence = (m) => (m.monthsPerTurn >= 6 ? tr('半年一回合（夏季／冬季）', 'One turn per half year (summer / winter)') : tr('一個月一回合', 'One turn per month'));
const modeOf = (id) => modeList.find((m) => m.id === id) || modeList[0];
const hubOf = (id) => hubList.find((h) => h.id === id) || hubList[0];
const isSeasonMode = (mid) => modeList.indexOf(modeOf(mid)) === 1;
const SAVE_KEY = (m) => `tq-airline-save-${m}`;
const BEST_KEY = 'tq-airline-best';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const app = { screen: 'start', prev: 'start', sel: { mode: modeList[0].id, hub: (B.DEFAULT_HUB || 'TPE') }, state: null, draft: null, map: null, city: null, tmp: null, report: null, reportTurn: 0, lastMargin: null, panelMin: false };
if (!hubList.some((h) => h.id === app.sel.hub)) app.sel.hub = hubList[0].id;
try { const s = JSON.parse(store.get('tq-airline-sel') || 'null'); if (s && modeList.some((m) => m.id === s.mode) && hubList.some((h) => h.id === s.hub)) app.sel = { mode: s.mode, hub: s.hub }; } catch {}

/* ---------- adapters over model state (keep model shape knowledge here) ---------- */
const needMap = (x) => { if (Array.isArray(x)) return x.reduce((o, r) => ({ ...o, [r.type || r.id]: r.n ?? r.count ?? r.needed ?? 0 }), {}); return { ...(x || {}) }; };
const fleetCounts = (s) => { const f = s.fleet || {}, out = {}; if (Array.isArray(f)) { for (const a of f) out[a.type] = (out[a.type] || 0) + 1; return out; } for (const k of ['lease', 'leased', 'own', 'owned']) if (f[k] && typeof f[k] === 'object') for (const [t, n] of Object.entries(f[k])) if (typeof n === 'number') out[t] = (out[t] || 0) + n; return out; };
const stateRoutes = (s) => (s.routes || []).map((r) => ({ city: r.city, type: r.type, weekly: r.weekly, fare: r.fare || 'mid' }));
const rivalCities = (s) => [...new Set((s.rivalRoutes || s.rivals || []).flatMap((r) => (typeof r === 'string' ? [r] : Array.isArray(r.routes) ? r.routes.map((x) => x.city || x) : r.routes ? Object.keys(r.routes) : (r.city ? [r.city] : []))))].filter((c) => CITIES[c]);
const isOver = (s) => !!(s.over || s.finished || s.gameOver);
const hedgeOf = (s) => (typeof s.hedge === 'object' && s.hedge ? s.hedge.frac || 0 : s.hedge || 0);
const totalTurns = (s) => s.totalTurns ?? s.turns ?? modeOf(s.mode).turns;
const bizModel = () => app.draft?.businessModel || app.state?.model || app.state?.businessModel || 'fsc';
const seatsOf = (t) => { const a = AIRCRAFT[t]; if (!a) return 0; return typeof a.seats === 'object' ? (a.seats[bizModel()] ?? a.seats.fsc) : a.seats; };
const hedgeAllowed = (s) => s.turn >= (modeOf(s.mode).hedgeFromTurn ?? 0);

function turnLabel(s, turnIdx = s.turn) {
  const n = turnIdx + 1, tot = totalTurns(s);
  if (isSeasonMode(s.mode)) { const y = Math.floor(turnIdx / 2) + 1; return tr(`第 ${y} 年${turnIdx % 2 ? '冬季' : '夏季'} · ${n}/${tot}`, `Year ${y} ${turnIdx % 2 ? 'winter' : 'summer'} · ${n}/${tot}`); }
  return tr(`第 ${n} 個月 / ${tot}`, `Month ${n} / ${tot}`);
}
const turnWord = (s) => (isSeasonMode(s.mode) ? tr('這一季', 'this season') : tr('這個月', 'this month'));

/* ---------- persistence ---------- */
function saveGame() {
  const s = app.state; if (!s || isOver(s)) return;
  store.set(SAVE_KEY(s.mode), JSON.stringify({ v: 1, at: Date.now(), hub: s.hub, mode: s.mode, turn: s.turn, cash: s.cash, state: B.serialize(s) }));
}
function readSaves() {
  const out = [];
  for (const m of modeList) { try { const o = JSON.parse(store.get(SAVE_KEY(m.id)) || 'null'); if (o && o.state) out.push(o); } catch {} }
  return out;
}
function recordBest(s, rep) {
  let b = {}; try { b = JSON.parse(store.get(BEST_KEY) || '{}'); } catch {}
  const k = `${s.hub}-${s.mode}`; const m = rep.marginTotal;
  const prev = b[k]; b[k] = (!prev || m > prev.margin) ? { margin: m, grade: pick(rep, 'gradeZh', 'gradeEn'), at: Date.now() } : prev;
  store.set(BEST_KEY, JSON.stringify(b));
  return { best: b[k], isBest: !prev || m > prev.margin, prev };
}

/* ---------- screen plumbing ---------- */
const appEl = $('#app');
function go(name) {
  app.prev = app.screen; app.screen = name;
  if (name !== 'main' && app.map) { app.map.destroy(); app.map = null; }
  closeOverlay(); hideTerm();
  $('#menu-btn').hidden = name !== 'main';
  $('#turnlabel').textContent = name === 'main' && app.state ? turnLabel(app.state) : '';
  window.scrollTo(0, 0);
  ({ start: renderStart, main: renderMain, results: renderResults, end: renderEnd, sources: renderSources })[name]();
  appEl.focus({ preventScroll: true });
}
function chrome() {
  $('#back-label').textContent = tr('遊戲大廳', 'Games');
  $('.back-link').setAttribute('aria-label', tr('返回遊戲大廳', 'Back to games'));
  $('#lang-btn').textContent = locale === 'zh' ? 'EN' : '中文';
  $('#menu-btn').textContent = tr('選單', 'Menu');
  $('.brand strong').textContent = tr('天青航空', BRAND_EN);
  document.documentElement.lang = locale === 'zh' ? 'zh-Hant' : 'en';
  document.title = tr('天青航空：航線經營 · InvestMQuest', `${BRAND_EN}: Airline Manager · InvestMQuest`);
}

/* ---------- start ---------- */
function renderStart() {
  const saves = readSaves();
  const modeCards = modeList.map((m) => `
    <button type="button" class="choice" role="radio" aria-checked="${app.sel.mode === m.id}" data-mode="${esc(m.id)}">
      <b><span>${esc(pick(m))}</span><span class="meta">${tr(`約 ${m.minutes} 分鐘`, `~${m.minutes} min`)}</span></b>
      <span class="sub"><b class="cad">${esc(cadence(m))}</b> ${esc(pick(m, 'descZh', 'descEn'))}</span></button>`).join('');
  const hubCards = hubList.map((h) => `
    <button type="button" class="choice" role="radio" aria-checked="${app.sel.hub === h.id}" data-hub="${esc(h.id)}">
      <b><span>${esc(pick(h))}</span><span class="meta">${esc(h.id)}</span></b>
      <span class="sub">${esc(pick(h, 'teachZh', 'teachEn'))}</span></button>`).join('');
  const how = [
    tr('選模式和基地，所有航線都從基地出發。', 'Pick a mode and a hub. Every route starts at the hub.'),
    tr('點地圖上的城市，選機型、每週班次和票價。', 'Tap a city on the map. Choose aircraft, weekly flights and fare.'),
    tr('按「開始這個月」，系統算出整個月的收支。', 'Press start. The game works out the whole month.'),
    tr('看結果頁：哪條航線賺、哪條賠，原因寫得很白。', 'Read the results: which routes made money, which lost, and why.'),
    tr('調整後再跑下一回合，目標是淨利率超過行業的 3.9%。', 'Adjust and run the next turn. Aim to beat the industry margin of 3.9%.'),
  ].map((t) => `<li>${esc(t)}</li>`).join('');
  const saveHtml = saves.length ? `<section class="sect"><h2>${tr('繼續上次的遊戲', 'Continue')}</h2><div class="saves">${saves.map((o) => `
    <div class="save"><div class="t"><b>${esc(pick(modeOf(o.mode)))} · ${esc(pick(hubOf(o.hub)))}</b><small>${esc(turnLabelFromSave(o))} · ${tr('現金', 'Cash')} ${esc(fmtUSD(o.cash))}</small></div>
    <button type="button" class="btn sec" data-continue="${esc(o.mode)}">${tr('繼續', 'Continue')}</button></div>`).join('')}</div></section>` : '';
  let best = {}; try { best = JSON.parse(store.get(BEST_KEY) || '{}'); } catch {}
  const bk = best[`${app.sel.hub}-${app.sel.mode}`];
  appEl.innerHTML = `<div class="wrap">
    <section class="hero"><div>
      <div class="kicker">${esc(BRAND_EN)}</div>
      <h1>${tr('天青航空', esc(BRAND_EN))}<small>${tr('航線經營', 'AIRLINE MANAGER')}</small></h1>
      <p class="poem">${tr('雨過天青雲破處，開一家自己的航空公司。', 'Where clouds break after rain, run an airline of your own.')}</p>
      <p class="hint" style="margin-top:10px">${tr('看一次，就懂航空公司怎麼賺錢，又為什麼賠錢。', 'See how an airline makes money, and why it loses it.')}</p>
    </div><div class="art">${airlinerSVG({ id: 'hero', brand: BRAND_EN, label: tr('天青航空客機', BRAND_EN + ' airliner') })}${cloudLines}</div></section>
    ${saveHtml}
    <section class="sect"><h2>${tr('選擇模式', 'Mode')}</h2><div class="choices two" role="radiogroup" aria-label="${tr('模式', 'Mode')}">${modeCards}</div></section>
    <section class="sect"><h2>${tr('選擇基地', 'Hub')}</h2><div class="choices hubs" role="radiogroup" aria-label="${tr('基地', 'Hub')}">${hubCards}</div></section>
    <div class="cta-row"><button type="button" class="btn" id="go-new">${tr('開始經營', 'Start')} →</button>${bk ? `<span class="hint">${tr('這組的最佳成績', 'Your best here')}：${esc(fmtPct(bk.margin))} · ${esc(bk.grade || '')}</span>` : ''}</div>
    <section class="sect"><h2>${tr('怎麼玩', 'How to play')}</h2><ol class="howto">${how}</ol></section>
    <div class="foot"><button type="button" class="link" id="go-src">${tr('資料來源', 'Data sources')}</button><span>${tr('數字依真實航空業資料簡化而成，是教學用的模擬，不是預測。', 'Numbers are simplified from real industry data. This is a teaching sim, not a forecast.')}</span></div>
  </div>`;
  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { app.sel.mode = b.dataset.mode; store.set('tq-airline-sel', JSON.stringify(app.sel)); renderStart(); $(`[data-mode="${app.sel.mode}"]`).focus(); }));
  $$('[data-hub]').forEach((b) => b.addEventListener('click', () => { app.sel.hub = b.dataset.hub; store.set('tq-airline-sel', JSON.stringify(app.sel)); renderStart(); $(`[data-hub="${app.sel.hub}"]`).focus(); }));
  $('#go-new').addEventListener('click', () => newGame());
  $('#go-src').addEventListener('click', () => go('sources'));
  $$('[data-continue]').forEach((b) => b.addEventListener('click', () => continueGame(b.dataset.continue)));
}
function turnLabelFromSave(o) { try { return turnLabel({ mode: o.mode, turns: modeOf(o.mode).turns, turn: o.turn }, o.turn); } catch { return ''; } }

function newGame() {
  store.set('tq-airline-sel', JSON.stringify(app.sel));
  app.state = B.newGame({ mode: app.sel.mode, hub: app.sel.hub, seed: (Date.now() % 100000) + 1 });
  app.report = null; app.lastMargin = null;
  go('main');
}
function continueGame(mode) {
  try {
    const o = JSON.parse(store.get(SAVE_KEY(mode))); app.state = B.deserialize(o.state); app.sel = { mode: o.mode, hub: o.hub };
    app.report = null; app.lastMargin = null; go('main');
  } catch (e) { store.del(SAVE_KEY(mode)); renderStart(); }
}

/* ---------- main ---------- */
function initDraft() {
  const s = app.state;
  app.draft = { routes: new Map(stateRoutes(s).map((r) => [r.city, r])), hedge: hedgeOf(s), businessModel: s.model || s.businessModel || 'fsc', acquire: 'lease', eventChoices: {} };
  app.city = null; app.tmp = null;
}
const draftRoutes = () => [...app.draft.routes.values()];
function fleetDecision(routes) {
  const s = app.state, need = needMap(B.fleetNeeded(s, routes)), have = fleetCounts(s);
  const add = {}, ret = {};
  for (const t of new Set([...Object.keys(need), ...Object.keys(have)])) {
    const d = (need[t] || 0) - (have[t] || 0);
    if (d > 0) add[t] = d; else if (d < 0) ret[t] = -d;
  }
  const f = {};
  if (app.draft.acquire === 'buy' && modeOf(s.mode).buy) { f.buy = add; f.lease = {}; } else { f.lease = add; f.buy = {}; }
  f.returnLease = ret; f.sell = {};
  return f;
}
const buildDecisions = (routes = draftRoutes()) => ({ routes, fleet: fleetDecision(routes), hedge: app.draft.hedge, eventChoices: app.draft.eventChoices, ...(isSeasonMode(app.state.mode) ? { businessModel: app.draft.businessModel } : {}) });

function renderMain() {
  const s = app.state;
  if (!app.draft || app.draft.forTurn !== s.turn) { initDraft(); app.draft.forTurn = s.turn; }
  appEl.innerHTML = `<div class="game"><div class="mapbox" id="mapbox"><div class="mapctl"><button type="button" id="zin" aria-label="${tr('放大', 'Zoom in')}">+</button><button type="button" id="zout" aria-label="${tr('縮小', 'Zoom out')}">−</button><button type="button" id="zfit" aria-label="${tr('回到基地', 'Recenter')}">⌖</button></div>
    <div class="maplegend"><span><i></i>${tr('我的航線', 'My routes')}</span><span><i class="r"></i>${tr('對手航線', 'Rival routes')}</span></div></div>
    <aside class="panel" id="panel" aria-label="${tr('營運面板', 'Operations panel')}"><button type="button" class="handle" id="handle"></button><div class="panel-scroll" id="pscroll"></div><div class="panel-foot" id="pfoot"></div></aside></div>`;
  app.map = createMap($('#mapbox'), { hubId: s.hub, onCityClick: selectCity });
  $('#zin').onclick = () => app.map.zoomBy(1.5); $('#zout').onclick = () => app.map.zoomBy(1 / 1.5); $('#zfit').onclick = () => app.map.recenter();
  $('#handle').onclick = () => { app.panelMin = !app.panelMin; syncPanelMin(); };
  refreshMap(); renderPanel();
  const ev = (B.pendingEvents(s) || []).filter((e) => !(e.id in app.draft.eventChoices));
  if (ev.length) askEvents(ev);
}
function syncPanelMin() { const p = $('#panel'); if (!p) return; p.classList.toggle('min', app.panelMin); const h = $('#handle'); h.textContent = app.panelMin ? tr('展開', 'Expand') : tr('收合，看地圖', 'Collapse'); h.setAttribute('aria-expanded', String(!app.panelMin)); }
function refreshMap() { app.map?.update({ routes: draftRoutes(), rivals: rivalCities(app.state), selected: app.city }); }
function selectCity(id) {
  const s = app.state;
  if (id === s.hub) { app.city = null; renderPanel(); return; }
  app.city = id; app.tmp = null; app.panelMin = false; refreshMap(); renderPanel();
}
function renderPanel() { if (!$('#pscroll')) return; syncPanelMin(); (app.city ? renderRoutePanel : renderOverview)(); }

/* ----- overview ----- */
function renderOverview() {
  const s = app.state, d = app.draft, routes = draftRoutes();
  const need = needMap(B.fleetNeeded(s, routes)), have = fleetCounts(s);
  const types = [...new Set([...Object.keys(need), ...Object.keys(have)])].filter((t) => need[t] || have[t]);
  const m = app.lastMargin;
  const marginTxt = m == null ? tr('跑完第一回合後顯示', 'Shown after turn 1') : `${fmtPct(m)} <span class="pill ${m >= INDUSTRY ? 'good' : 'warn'}">${m >= INDUSTRY ? tr('高於行業', 'above industry') : tr('低於行業', 'below industry')} ${fmtPct(INDUSTRY)}</span>`;
  const routeItems = routes.map((r) => { const c = CITIES[r.city], o = B.routeOptions(s, r.city); return `
    <button type="button" class="ritem" data-route="${esc(r.city)}"><span class="n"><b>${esc(pick(c))}</b><small>${esc(pick(AIRCRAFT[r.type]))} · ${tr(`每週 ${r.weekly} 班`, `${r.weekly}/wk`)} · ${esc(fareName(r.fare))} ${esc(fmtFare(o.refFare[r.fare]))}</small></span><span class="go" aria-hidden="true">›</span></button>`; }).join('');
  const noRoutes = !routes.length && app.lastMargin == null;
  const fleetRows = types.map((t) => { const n = need[t] || 0, h = have[t] || 0; const short = n > h;
    if (noRoutes) return `<div class="ritem" style="cursor:default"><span class="n"><b>${esc(pick(AIRCRAFT[t]))}</b><small>${tr(`現有 ${h} 架`, `You have ${h}`)}</small></span></div>`;
    return `<div class="ritem" style="cursor:default"><span class="n"><b>${esc(pick(AIRCRAFT[t]))}</b><small>${tr(`需要 ${n} 架 · 現有 ${h} 架`, `Need ${n} · have ${h}`)}</small></span>${short ? `<span class="pill warn">${tr(`開始時租入 ${n - h}`, `+${n - h} on start`)}</span>` : n < h ? `<span class="pill">${tr(`退租 ${h - n}`, `return ${h - n}`)}</span>` : `<span class="pill good">${tr('剛好', 'matched')}</span>`}</div>`; }).join('');
  const hedgeOk = hedgeAllowed(s), hedgeMonth = (modeOf(s.mode).hedgeFromTurn ?? 0) + 1;
  const hedgePct = Math.round((d.hedge || 0) * 100);
  const season = isSeasonMode(s.mode), canBuy = !!modeOf(s.mode).buy;
  $('#pscroll').innerHTML = `
    <div class="psec"><div class="summary"><div><small>${tr('現金', 'Cash')}</small><b>${esc(fmtUSD(s.cash))}</b></div><div><small>${tr('上一回合淨利率', 'Last margin')}</small><b style="font-size:16px">${marginTxt}</b></div></div></div>
    <div class="psec"><h3><span>${tr('航線', 'Routes')} (${routes.length})</span></h3>${routes.length ? `<div class="rlist">${routeItems}</div>` : `<div class="callout">${tr(`從 ${esc(pick(hubOf(s.hub)))} 出發。點地圖上的城市，開第一條航線。`, `Tap a city on the map to open your first route from ${esc(pick(hubOf(s.hub)))}.`)}</div>`}</div>
    ${types.length ? `<div class="psec"><h3><span>${tr('機隊', 'Fleet')}</span><span class="hint">${tr('不夠的飛機會自動租入', 'Missing aircraft are leased automatically')}</span></h3><div class="rlist">${fleetRows}</div>${noRoutes ? `<p class="hint" style="margin-top:6px">${tr('先開航線，把這些飛機排滿。', 'Open routes first to put these aircraft to work.')}</p>` : ''}
      ${canBuy ? `<div style="margin-top:10px"><div class="hint" style="margin-bottom:6px">${tr('新增的飛機用哪種方式取得？', 'How to acquire new aircraft?')}</div><div class="seg" role="group"><button type="button" aria-pressed="${d.acquire === 'lease'}" data-acq="lease">${tr('租賃', 'Lease')}</button><button type="button" aria-pressed="${d.acquire === 'buy'}" data-acq="buy">${tr('購買（貸款）', 'Buy (loan)')}</button></div><p class="hint" style="margin-top:6px">${tr('租賃月付租金、彈性高。購買要付利息，但長期單位成本較低。', 'Leasing is flexible. Buying costs interest but is cheaper over time.')}</p></div>` : ''}</div>` : ''}
    ${season ? `<div class="psec"><h3><span>${tr('經營模式', 'Business model')}</span></h3><div class="seg" role="group"><button type="button" aria-pressed="${d.businessModel === 'fsc'}" data-bm="fsc">${tr('傳統全服務', 'Full-service')}</button><button type="button" aria-pressed="${d.businessModel === 'lcc'}" data-bm="lcc">${tr('廉價航空', 'Low-cost')}</button></div><p class="hint" style="margin-top:6px">${tr('全服務：票價高、座位少、成本高。廉價：座位密、票價低、行李餐飲另收，人力與通路成本低。中途想換要付代價。', 'Full-service: higher fares, fewer seats, higher cost. Low-cost: dense seats, low fares, ancillary revenue, lean costs. Switching later costs money.')}</p></div>` : ''}
    <div class="psec"><h3><span>${term('避險', tr('燃油避險', 'Fuel hedge'))}</span><b class="num" id="hedgeval">${hedgePct}%</b></h3>
      <input type="range" id="hedge" min="0" max="100" step="10" value="${hedgePct}" ${hedgeOk ? '' : 'disabled'} aria-label="${tr('燃油避險比例', 'Fuel hedge share')}">
      <p class="hint">${hedgeOk ? tr('先鎖定一部分油價。油價漲了你少賠，跌了你也少賺。', 'Lock part of the fuel price. You lose less if it rises and gain less if it falls.') : tr(`第 ${hedgeMonth} ${isSeasonMode(s.mode) ? '季' : '個月'}起可以買燃油避險。`, `Fuel hedging opens in ${isSeasonMode(s.mode) ? 'season' : 'month'} ${hedgeMonth}.`)}</p></div>`;
  $('#pfoot').innerHTML = `<button type="button" class="btn block" id="run">${tr(`開始${turnWord(s)}`, `Run ${turnWord(s)}`)} ▶</button><div class="hint" id="runmsg" role="alert" style="margin-top:6px"></div>`;
  $$('[data-route]').forEach((b) => b.addEventListener('click', () => selectCity(b.dataset.route)));
  $$('[data-acq]').forEach((b) => b.addEventListener('click', () => { d.acquire = b.dataset.acq; renderOverview(); }));
  $$('[data-bm]').forEach((b) => b.addEventListener('click', () => { d.businessModel = b.dataset.bm; renderOverview(); }));
  const hr = $('#hedge'); hr.addEventListener('input', () => { d.hedge = hr.value / 100; $('#hedgeval').textContent = `${hr.value}%`; });
  $('#run').addEventListener('click', runTurn);
}
const fareName = (f) => ({ low: tr('低價', 'Low'), mid: tr('中價', 'Mid'), high: tr('高價', 'High') }[f] || f);

/* ----- route panel ----- */
/** Default aircraft for a new route: never a widebody when a narrower type can fly it; among those, the type the model's own
 *  estimate says fits the market best at a normal frequency (7/week). Widebody-only routes start at a lower frequency. */
function defaultChoice(city) {
  const s = app.state, o = B.routeOptions(s, city), el = o.eligibleTypes;
  const narrow = el.filter((t) => !AIRCRAFT[t].widebody), pool = narrow.length ? narrow : el;
  const est = (t, w) => { try { return B.estimateRoute(s, city, t, w, 'mid')?.profit ?? -Infinity; } catch { return -Infinity; } };
  const asc = [...pool].sort((a, b) => seatsOf(a) - seatsOf(b)), ps = asc.map((t) => est(t, 7)), top = Math.max(...ps), tol = Math.max(0.1 * Math.abs(top), 30000);
  const type = asc[ps.findIndex((p) => p >= top - tol)] || asc[0];   // smallest type within 10% of the best estimate
  let weekly = 7;
  if (!narrow.length) { let bp = -Infinity; for (const w of [3, 4, 5, 7]) { const p = est(type, w); if (p > bp + 1) { bp = p; weekly = w; } } }
  const wide = el.some((t) => AIRCRAFT[t].widebody), small = pool.length > 1 || (pool.length === 1 && wide && narrow.length);
  const note = !narrow.length ? tr('這個距離只有寬體機飛得到，先從較少的班次開始。', 'Only widebodies reach this far, so it starts with fewer flights.')
    : wide ? tr('預設用能飛到、又和市場大小合得來的最小機型。寬體機座位多、租金貴，這個距離用不到。', 'Default: the smallest type that fits this market. A widebody is too big and costly for this distance.')
    : small ? tr('預設用能飛到、又和市場大小合得來的機型。想坐滿就換小一點的，想多載就換大一點的。', 'Default: the type that best fits this market size. Go smaller to fill seats, bigger to carry more.') : '';
  return { type, weekly: Math.min(weekly, o.maxWeekly || 28), note };
}
function renderRoutePanel() {
  const s = app.state, city = app.city, c = CITIES[city], o = B.routeOptions(s, city);
  const open = app.draft.routes.has(city);
  if (!open && !app.tmp) { const d = defaultChoice(city); app.tmp = { city, type: d.type, weekly: d.weekly, fare: 'mid', defType: d.type, note: d.note }; }
  const r = open ? app.draft.routes.get(city) : app.tmp;
  if (!o.eligibleTypes.includes(r.type)) r.type = o.eligibleTypes[0];
  const routes = draftRoutes().filter((x) => x.city !== city).concat(open || true ? [r] : []);
  const need = needMap(B.fleetNeeded(s, routes)), have = fleetCounts(s);
  const ac = AIRCRAFT[r.type];
  const bh = o.blockHoursByType?.[r.type] ?? o.blockHours, hrsWeek = r.weekly * 2 * bh;
  const acOpts = o.eligibleTypes.length ? o.eligibleTypes.map((t) => { const a = AIRCRAFT[t]; return `
    <button type="button" class="ac-opt" role="radio" aria-checked="${r.type === t}" data-type="${esc(t)}"><span class="t"><b>${esc(pick(a))}</b><small>${tr(`${seatsOf(t)} 座 · 租金約 ${fmtUSD(a.leasePerMonth)}／月`, `${seatsOf(t)} seats · lease ≈ ${fmtUSD(a.leasePerMonth)}/mo`)}</small></span></button>`; }).join('') : `<div class="callout warn">${tr('目前沒有任何機型飛得到這麼遠。', 'No aircraft type can fly this far.')}</div>`;
  $('#pscroll').innerHTML = `
    <button type="button" class="back-sm" id="back">‹ ${tr('回總覽', 'Overview')}</button>
    <h2>${esc(pick(hubOf(s.hub)))} → ${esc(pick(c))} <small class="hint">${esc(pick(c, 'en', 'zh'))}</small></h2>
    ${c.blurbZh ? `<p class="hint">${esc(pick(c, 'blurbZh', 'blurbEn'))}</p>` : ''}
    <div class="psec"><div class="kv three"><div><small>${tr('距離', 'Distance')}</small><b>${fmtNum(o.distanceKm)} km</b></div><div><small>${tr('單程飛行', 'Block time')}</small><b>${(o.blockHoursByType?.[r.type] ?? o.blockHours).toFixed(1)} h</b></div><div><small>${tr('每週市場', 'Market/wk')}</small><b>${fmtNum(o.estMarketPaxPerWeek)}</b></div></div>
      <p class="hint" style="margin-top:6px">${tr('每週市場是估計單程旅客數，由雙方城市大小和距離推算。', 'Market is an estimate of one-way passengers per week.')} ${o.rivalsOnRoute ? `<span class="pill warn">${tr(`${o.rivalsOnRoute} 家對手已在飛`, `${o.rivalsOnRoute} rival(s) fly it`)}</span>` : `<span class="pill good">${tr('目前沒有對手', 'No rival yet')}</span>`} ${o.slotLimited ? `<span class="pill warn">${tr('機場時段有限', 'Slot-limited')}</span>` : ''}</p></div>
    <div class="psec"><h3><span>${tr('機型', 'Aircraft')}</span></h3>${!open && r.note && r.type === r.defType ? `<p class="hint" style="margin-bottom:6px">${esc(r.note)}</p>` : ''}<div role="radiogroup" aria-label="${tr('機型', 'Aircraft')}">${acOpts}</div></div>
    <div class="psec"><h3><span>${term('週班次', tr('每週班次', 'Flights per week'))}</span><span class="hint">${tr('一班＝來回一趟', 'one = one round trip')}</span></h3>
      <div class="stepper"><button type="button" id="wm" aria-label="${tr('減少班次', 'Fewer')}" ${r.weekly <= 1 ? 'disabled' : ''}>−</button><output id="wv" aria-live="polite">${r.weekly}</output><button type="button" id="wp" aria-label="${tr('增加班次', 'More')}" ${r.weekly >= (o.maxWeekly || 28) ? 'disabled' : ''}>＋</button><small>${tr(`每週約 ${fmtNum(r.weekly * 2 * seatsOf(r.type))} 個單程座位`, `≈ ${fmtNum(r.weekly * 2 * seatsOf(r.type))} one-way seats/wk`)}</small></div></div>
    <div class="psec"><h3><span>${tr('票價水準', 'Fare level')}</span></h3><div class="seg" role="group" aria-label="${tr('票價水準', 'Fare level')}">${['low', 'mid', 'high'].map((f) => `<button type="button" class="fare-btn" aria-pressed="${r.fare === f}" data-fare="${f}"><b>${esc(fareName(f))}</b><small>${esc(fmtFare(o.refFare[f]))}</small></button>`).join('')}</div>
      <p class="hint" style="margin-top:6px">${tr('價格低，客人多但每人賺得少。價格高，客人少。', 'Lower fares fill seats but earn less per passenger.')}</p></div>
    <div class="psec"><div class="callout">${tr(`這條航線每週飛行約 ${hrsWeek.toFixed(0)} 小時，全公司需要 ${esc(pick(ac))} ${need[r.type] ?? '—'} 架，目前有 ${have[r.type] || 0} 架。`, `About ${hrsWeek.toFixed(0)} block hours/week. Fleet need: ${need[r.type] ?? '—'} × ${esc(pick(ac))}, you own ${have[r.type] || 0}.`)}</div></div>
    <div class="psec" id="estbox"></div>`;
  $('#pfoot').innerHTML = open
    ? `<div style="display:flex;gap:10px"><button type="button" class="btn block" id="done">${tr('完成', 'Done')}</button><button type="button" class="btn sec" id="close">${tr('關閉航線', 'Close route')}</button></div>`
    : `<button type="button" class="btn block" id="open" ${o.eligibleTypes.length ? '' : 'disabled'}>${tr('開這條航線', 'Open this route')}</button>`;
  const upd = () => { if (open) { app.draft.routes.set(city, r); refreshMap(); } renderRoutePanel(); };
  $('#back').onclick = () => { app.city = null; app.tmp = null; refreshMap(); renderPanel(); };
  $$('[data-type]').forEach((b) => b.addEventListener('click', () => { r.type = b.dataset.type; upd(); }));
  $('#wm').onclick = () => { r.weekly = Math.max(1, r.weekly - 1); upd(); };
  $('#wp').onclick = () => { r.weekly = Math.min(o.maxWeekly || 28, r.weekly + 1); upd(); };
  $$('[data-fare]').forEach((b) => b.addEventListener('click', () => { r.fare = b.dataset.fare; upd(); }));
  if (open) { $('#done').onclick = $('#back').onclick; $('#close').onclick = () => { app.draft.routes.delete(city); app.city = null; refreshMap(); renderPanel(); }; }
  else $('#open')?.addEventListener('click', () => { app.draft.routes.set(city, { city: r.city, type: r.type, weekly: r.weekly, fare: r.fare }); app.tmp = null; app.city = null; refreshMap(); renderPanel(); });
  renderEstimate(r);
}
/** Dry run of the real model for this route under current conditions. Skipped quietly if the model cannot run it. */
function renderEstimate(r) {
  const box = $('#estbox'); if (!box) return;
  let e = null;
  try { e = B.estimateRoute ? B.estimateRoute(app.state, r.city, r.type, r.weekly, r.fare) : null; } catch { e = null; }
  if (!e) { box.innerHTML = ''; return; }
  const ok = e.profit >= 0, be = e.revenue > 0 ? Math.min(1.5, e.lf * e.cost / e.revenue) : null;
  box.innerHTML = `<div class="est"><b>${tr('預估', 'Estimate')}</b>：${term('載客率')} <b>${fmtPct(e.lf, 0)}</b>${be != null ? `（${tr('損益平衡', 'break-even')} ${fmtPct(be, 0)}）` : ''} · ${tr(`${turnWord(app.state)}損益`, 'profit')} <b style="color:${ok ? 'var(--good)' : 'var(--warn)'}">${esc(fmtUSD(e.profit))}</b>
    <p class="hint" style="margin-top:4px">${tr('只算這一條航線在穩定狀態下的結果，飛機成本按用掉的比例攤。轉機客、事件和對手反應不在內。', 'Steady state for this route alone, aircraft cost shared pro rata. Transfers, events and rival moves are not included.')}</p></div>`;
}

/* ----- events ----- */
function overlay(html, { label, dismiss = true } = {}) {
  const ov = $('#overlay'); ov.hidden = false; ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(label || '')}" tabindex="-1">${html}</div>`;
  const m = $('.modal', ov); (m.querySelector('button') || m).focus();
  ov.onkeydown = (e) => { if (e.key === 'Escape' && dismiss) closeOverlay(); if (e.key === 'Tab') { const f = $$('button,[href]', m); if (!f.length) return; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } };
  if (dismiss) ov.onclick = (e) => { if (e.target === ov) closeOverlay(); }; else ov.onclick = null;
  return m;
}
function closeOverlay() { const ov = $('#overlay'); if (ov) { ov.hidden = true; ov.innerHTML = ''; } }
function askEvents(queue) {
  const ev = queue[0];
  const body = pick(ev, 'bodyZh', 'bodyEn') || pick(B.EVENTS?.[ev.id], 'explainZh', 'explainEn');
  const m = overlay(`<div class="kick">${tr('本回合要決定', 'A DECISION')}</div><h2>${esc(pick(ev))}</h2>${body ? `<p class="body">${withTerms(body)}</p>` : ''}
    <div class="opts">${(ev.options || []).map((o) => `<button type="button" class="opt" data-opt="${esc(o.id)}"><b>${esc(pick(o))}</b>${pick(o, 'hintZh', 'hintEn') ? `<small>${esc(pick(o, 'hintZh', 'hintEn'))}</small>` : ''}</button>`).join('')}</div>`, { label: pick(ev), dismiss: false });
  $$('[data-opt]', m).forEach((b) => b.addEventListener('click', () => {
    app.draft.eventChoices[ev.id] = b.dataset.opt; closeOverlay();
    if (queue.length > 1) askEvents(queue.slice(1)); else renderPanel();
  }));
}

/* ----- run turn ----- */
function runTurn() {
  const s = app.state, msg = $('#runmsg');
  const pend = (B.pendingEvents(s) || []).filter((e) => !(e.id in app.draft.eventChoices));
  if (pend.length) { askEvents(pend); return; }
  const dec = buildDecisions();
  let res;
  try { res = B.applyDecisions(s, dec); } catch (e) { console.error(e); msg.textContent = String(e.message || e); return; }
  if (res.errors && res.errors.length) { msg.innerHTML = res.errors.map((e) => `<span style="color:var(--warn)">• ${esc(pick(e))}</span>`).join('<br>'); return; }
  const turnIdx = s.turn;
  const out = B.simulateTurn(res.state);
  app.state = out.state; app.report = out.report; app.reportTurn = turnIdx; app.lastMargin = out.report.company.margin;
  app.draft = null;
  saveGame();
  go('results');
}

/* ---------- results (the teaching core) ---------- */
const COST_KEYS = [['fuel', '燃油', 'Fuel', '#b5533c'], ['labour', '人力', 'Labour', '#2f5d8c'], ['maintenance', '維修', 'Maintenance', '#6e9ccb'], ['airport', '機場與航管', 'Airport & ATC', '#8aa3bd'], ['ownership', '飛機持有', 'Aircraft ownership', '#c9a45c'], ['distribution', '通路與訂位', 'Distribution', '#9a8aa8'], ['overhead', '管理費用', 'Overheads', '#7a8580'], ['interest', '利息', 'Interest', '#3b3b3b']];
function costBlock(costs, total, noStack) {
  const rows = COST_KEYS.filter(([k]) => (costs?.[k] || 0) > 0);
  const sum = total || rows.reduce((a, [k]) => a + costs[k], 0) || 1;
  return `${noStack ? '' : '<div class="stack" role="img" aria-label="' + tr('成本組成', 'Cost mix') + '">'}${noStack ? '' : rows.map(([k, zh, en, col]) => `<i style="width:${(costs[k] / sum * 100).toFixed(2)}%;background:${col}" title="${tr(zh, en)}"></i>`).join('') + '</div>'}
  <div class="legend">${rows.map(([k, zh, en, col]) => `<div><i style="background:${col}"></i>${tr(zh, en)}<span class="v">${esc(fmtUSD(costs[k]))} · ${(costs[k] / sum * 100).toFixed(0)}%</span></div>`).join('')}</div>`;
}
function lfBar(lf, be, bad, muted) {
  const p = (x) => Math.max(0, Math.min(100, x * 100)).toFixed(1);
  return `<div class="lf"><div class="fill ${bad ? 'bad' : ''}" style="width:${p(lf)}%${muted ? ';opacity:.4' : ''}"></div>${be != null ? `<div class="be" style="left:calc(${p(be)}% - 1.5px)" title="${tr('損益平衡', 'break-even')}"></div>` : ''}</div>`;
}
function marginScale(m) {
  const lo = -0.15, hi = 0.15, pos = (x) => (Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo) * 100;
  return `<div class="mscale" role="img" aria-label="${tr(`你的淨利率 ${fmtPct(m)}，行業 ${fmtPct(INDUSTRY)}`, `Your margin ${fmtPct(m)}, industry ${fmtPct(INDUSTRY)}`)}"><div class="track"></div>
    <div class="mk you ${m < 0 ? 'neg' : ''}" style="left:${pos(m)}%;${pos(m) < 14 ? 'transform:none' : pos(m) > 86 ? 'transform:translateX(-100%)' : ''}">${tr('你', 'You')} ${fmtPct(m)}</div>
    <div class="mk ind" style="left:${pos(INDUSTRY)}%;top:24px;display:flex;flex-direction:column-reverse"><span>${tr('行業', 'Industry')} ${fmtPct(INDUSTRY)}</span></div>
    <span class="ax" style="left:0">${fmtPct(lo, 0)}</span><span class="ax" style="right:0">+${fmtPct(hi, 0)}</span></div>`;
}

const FUEL_REF = 0.26; // IATA 2026 outlook: fuel about a quarter of operating cost
function companyNotes(co) {
  const out = [];
  const fs = co.costShares?.fuel;
  if (fs != null && co.costTotal > 0) out.push(tr(`燃油占成本 ${fmtPct(fs, 0)}，業界大約 ${fmtPct(FUEL_REF, 0)}。油價一動，這一塊最敏感。`, `Fuel is ${fmtPct(fs, 0)} of cost; the industry runs near ${fmtPct(FUEL_REF, 0)}. It is the most price-sensitive line.`));
  if (co.model === 'lcc' || co.ancillaryShare > 0.03) out.push(tr(`輔助收入（行李、選位、餐飲）${fmtUSD(co.ancillaryRevenue)}，占營收 ${fmtPct(co.ancillaryShare, 0)}。廉價航空靠它補回低票價。`, `Ancillary revenue (bags, seats, meals) ${fmtUSD(co.ancillaryRevenue)}, ${fmtPct(co.ancillaryShare, 0)} of revenue. Low-cost carriers use it to make up for low fares.`));
  if (co.idleFleetCost > 0) out.push(tr(`閒置飛機成本 ${fmtUSD(co.idleFleetCost)}：${co.idleAircraft || 0} 架飛機沒排滿班次，租金和利息照付。`, `Idle aircraft cost ${fmtUSD(co.idleFleetCost)}: ${co.idleAircraft || 0} aircraft are not fully scheduled, yet rent and interest are still due.`));
  return out.length ? `<ul class="notes">${out.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
}
function rivalLine(rep, s) {
  const mine = new Set((rep.routes || []).map((r) => r.city));
  const parts = (rep.rivals || []).map((rv) => {
    const rt = rv.routes || [], over = rt.filter((x) => mine.has(x.city));
    const base = rv.kind === 'lcc' ? 0.72 : 1, cut = over.some((x) => x.fare < base - 0.01);
    const names = over.slice(0, 3).map((x) => pick(CITIES[x.city])).join(tr('、', ', '));
    return over.length ? tr(`${rv.zh}和你有 ${over.length} 條航線重疊（${names}）${cut ? '，在其中降了價' : ''}。`, `${rv.en} overlaps on ${over.length} of your routes (${names})${cut ? ' and has cut fares there' : ''}.`)
      : (rt.length ? tr(`${rv.zh}有 ${rt.length} 條航線，目前沒有和你重疊。`, `${rv.en} flies ${rt.length} routes, none overlapping yours.`) : '');
  }).filter(Boolean);
  return parts.length ? `<section class="card"><h2>${tr('對手動態', 'Rivals')}</h2><p>${esc(parts.join(' '))}</p></section>` : '';
}
function renderResults() {
  const s = app.state, rep = app.report, co = rep.company;
  const totalCost = COST_KEYS.reduce((a, [k]) => a + (co.costs?.[k] || 0), 0);
  const scale = Math.max(co.revenue, totalCost) || 1;
  const m = co.margin, beat = m >= INDUSTRY;
  const lessons = (rep.lessons || []).map((l) => (typeof l === 'string' ? { id: l, ...(LESSONS[l] || {}) } : { ...(LESSONS[l.id] || {}), ...l }));
  const events = rep.events || [], warns = events.filter((e) => e.kind === 'warning'), happened = events.filter((e) => e.kind !== 'warning');
  const last = !!(rep.gameOver || isOver(s));
  const routeCards = (rep.routes || []).slice().sort((a, b) => b.profit - a.profit).map((r) => {
    const c = CITIES[r.city], bad = r.lf < r.breakEvenLF;
    return `<article class="card rc ${r.profit < 0 ? 'loss' : ''}"><header><div><h3>${esc(pick(hubOf(s.hub)))} → ${esc(pick(c))}</h3><small>${esc(pick(AIRCRAFT[r.type]))} · ${tr(`每週 ${r.weekly} 班`, `${r.weekly}/wk`)}</small></div><span class="pchip ${r.profit >= 0 ? 'pos' : 'neg'}">${r.profit >= 0 ? tr('賺', 'Made') : tr('虧', 'Lost')} ${esc(fmtUSD(Math.abs(r.profit)))}</span></header>
      ${(pick(r, 'reasonZh', 'reasonEn')) ? `<p class="reason">${withTerms(pick(r, 'reasonZh', 'reasonEn'))}</p>` : ''}
      <div class="lfrow"><span>${term('載客率')}</span>${lfBar(r.lf, r.breakEvenLF, bad)}<b>${fmtPct(r.lf, 0)}</b></div>
      <div class="lfrow"><span>${term('損益平衡載客率', tr('損益平衡', 'Break-even'))}</span>${lfBar(r.breakEvenLF, null, false, true)}<b>${fmtPct(r.breakEvenLF, 0)}</b></div>
      <div class="mini"><div>${tr('收入', 'Revenue')}<b>${esc(fmtUSD(r.revenue))}</b></div><div>${tr('成本', 'Cost')}<b>${esc(fmtUSD(r.cost))}</b></div><div>${tr('損益', 'Profit')}<b style="color:${r.profit >= 0 ? 'var(--good)' : 'var(--warn)'}">${esc(fmtUSD(r.profit))}</b></div><div>${tr('旅客', 'Passengers')}<b>${fmtNum(r.pax)} / ${fmtNum(r.seats)}</b></div><div>${term('RASK')} / ${term('CASK')}<b>${(r.rask * 100).toFixed(1)}¢ / ${(r.cask * 100).toFixed(1)}¢</b></div><div>${tr('平均票價', 'Avg fare')}<b>${esc(fmtFare(r.avgFare))}</b></div></div>
      ${r.costs ? `<details class="cb"><summary>${tr('成本拆開看', 'Cost breakdown')}</summary>${costBlock(r.costs, r.cost)}</details>` : ''}</article>`; }).join('');
  appEl.innerHTML = `<div class="rwrap">
    <div class="rhead"><div><small>${esc(turnLabel(s, app.reportTurn))}</small><h1>${tr('這回合的成績單', 'Turn results')}</h1></div></div>
    <section class="card"><h2>${tr('公司整體', 'Company')}</h2>
      <div class="profit num ${co.profit >= 0 ? 'pos' : 'neg'}">${esc(fmtUSD(co.profit))}</div>
      <p class="hint">${tr('淨利率', 'Net margin')} <b>${fmtPct(m)}</b>，${beat ? tr('高於', 'above') : tr('低於', 'below')}${tr('行業的', ' the industry’s')} ${fmtPct(INDUSTRY)} · ${tr('期末現金', 'Cash')} ${esc(fmtUSD(co.cash))}</p>
      ${marginScale(m)}
      <div style="margin-top:12px"><div class="barrow"><span>${tr('收入', 'Revenue')}</span><div class="stack"><i style="width:${(co.revenue / scale * 100).toFixed(1)}%;background:var(--blue)"></i></div></div>
      <div class="barrow"><span>${tr('成本', 'Cost')}</span><div class="stack" style="width:${(totalCost / scale * 100).toFixed(1)}%;min-width:4px">${COST_KEYS.filter(([k]) => co.costs?.[k] > 0).map(([k, zh, en, col]) => `<i style="width:${(co.costs[k] / totalCost * 100).toFixed(2)}%;background:${col}"></i>`).join('')}</div></div>
      <p class="hint" style="display:flex;justify-content:space-between"><span>${tr('收入', 'Revenue')} ${esc(fmtUSD(co.revenue))}</span><span>${tr('成本', 'Cost')} ${esc(fmtUSD(totalCost))}</span></p></div>
      ${costBlock(co.costs, totalCost, true)}
      <div style="margin-top:14px"><div class="lfrow"><span>${term('載客率')}</span>${lfBar(co.loadFactor, null, false)}<b>${fmtPct(co.loadFactor, 0)}</b></div>
      <div class="lfrow"><span>${term('損益平衡載客率', tr('損益平衡', 'Break-even'))}</span>${lfBar(co.breakEvenLF, null, false, true)}<b>${fmtPct(co.breakEvenLF, 0)}</b></div>
      <p class="hint">${co.loadFactor >= co.breakEvenLF ? tr('座位賣得比損益平衡點多，公司賺錢。', 'Seats sold exceed the break-even point.') : tr('座位賣得比損益平衡點少，每飛一班就多賠一點。', 'Seats sold are below break-even.')}</p></div>
      ${companyNotes(co)}
    </section>
    ${rivalLine(rep, s)}
    ${lessons.length ? `<section class="card"><h2>${tr('這回合學到的事', 'What this turn taught')}</h2>${lessons.map((l) => `<div class="lesson"><b>${esc(pick(l))}</b><p>${withTerms(pick(l, 'explainZh', 'explainEn'))}</p></div>`).join('')}</section>` : ''}
    ${warns.length ? `<section class="card warnbox"><h2>${tr('預警', 'Heads-up')}</h2>${warns.map((e) => `<div class="ev"><b>${esc(pick(e))}</b></div>`).join('')}</section>` : ''}
    ${happened.length ? `<section class="card"><h2>${tr('發生的事', 'What happened')}</h2>${happened.map((e) => `<div class="ev"><b>${esc(pick(e))}</b>${pick(e, 'explainZh', 'explainEn') ? `<div class="hint">${esc(pick(e, 'explainZh', 'explainEn'))}</div>` : ''}</div>`).join('')}</section>` : ''}
    <h2 style="margin:18px 0 10px;font-size:18px">${tr('各條航線', 'Routes')}</h2>
    ${routeCards || `<div class="card"><p class="hint">${tr('這回合沒有航線，只付了租金和管理費用。', 'No routes this turn. Only fixed costs were paid.')}</p></div>`}
    <div class="sticky-next"><button type="button" class="btn block" id="next">${last ? tr('看總成績', 'See final report') : tr(`下一${isSeasonMode(s.mode) ? '季' : '個月'}`, 'Next turn')} →</button></div></div>`;
  $('#next').addEventListener('click', () => { if (last) { store.del(SAVE_KEY(s.mode)); go('end'); } else go('main'); });
}

/* ---------- end report ---------- */
function renderEnd() {
  const s = app.state, rep = B.endReport(s), rec = recordBest(s, rep);
  const broke = s.cash < 0 || !!s.gameOver, g = pick(rep, 'gradeZh', 'gradeEn');
  const rt = (x, title, good) => { if (!x) return ''; const c = CITIES[x.city]; return `<div class="card" style="border-left:5px solid ${good ? 'var(--cel)' : 'var(--warn)'}"><small class="hint">${title}</small><h3 style="margin:2px 0">${esc(pick(hubOf(s.hub)))} → ${esc(pick(c))}</h3>${x.profit != null ? `<b class="num">${esc(fmtUSD(x.profit))}</b>` : ''}<p style="margin-top:6px">${withTerms(pick(x, 'reasonZh', 'reasonEn'))}</p></div>`; };
  const seen = (rep.lessonsSeen || []).map((x) => (typeof x === 'string' ? x : x.id)), handled = new Set((rep.lessonsHandled || []).map((x) => (typeof x === 'string' ? x : x.id)));
  const tips = (locale === 'zh' ? rep.replayTipsZh : (rep.replayTipsEn || rep.replayTipsZh)) || [];
  const beat = rep.marginTotal >= (rep.industryMargin ?? INDUSTRY);
  const bR = rep.bestRoute, wR = rep.worstRoute, same = bR && wR && bR.city === wR.city;
  const bLbl = bR && bR.profit < 0 ? tr('虧最少的航線', 'Smallest loss') : tr('最賺的航線', 'Best route');
  const wLbl = wR && wR.profit >= 0 ? tr('賺最少的航線', 'Smallest profit') : tr('虧最多的航線', 'Biggest loss');
  const routeCards2 = same ? rt(bR, bR.profit < 0 ? tr('唯一的航線，虧損', 'Your only route, at a loss') : tr('唯一的航線', 'Your only route'), bR.profit >= 0) : `${rt(bR, bLbl, bR && bR.profit >= 0)}${rt(wR, wLbl, wR && wR.profit >= 0)}`;
  appEl.innerHTML = `<div class="rwrap">
    <section class="card grade ${beat ? '' : 'bad'}"><small class="hint">${esc(pick(modeOf(s.mode)))} · ${esc(pick(hubOf(s.hub)))}${broke ? ' · ' + tr('現金見底', 'Out of cash') : ''}</small>
      <div class="g">${esc(g)}</div>
      ${broke ? `<p class="callout warn" style="margin-top:10px">${esc((s.gameOver && pick(s.gameOver)) || tr('現金用完了，公司撐不下去。主要原因看最後幾回合的成本結構和載客率。', 'Cash ran out. Check the cost mix and load factors of your last turns.'))}</p>` : ''}
      <div class="cmp"><div><small>${tr('累計淨利率', 'Total margin')}</small><b>${fmtPct(rep.marginTotal)}</b></div><div><small>${tr('行業參考', 'Industry')}</small><b>${fmtPct(rep.industryMargin ?? INDUSTRY)}</b></div><div><small>${tr('期末現金', 'Cash')}</small><b>${esc(fmtUSD(rep.cash))}</b></div></div>
      ${marginScale(rep.marginTotal)}
      ${rec.isBest && rep.marginTotal < 0 ? '' : rec.isBest ? `<p class="hint">${tr('這是你在這組基地和模式的最佳成績。', 'A new personal best for this hub and mode.')}</p>` : `<p class="hint">${tr('這組的最佳成績', 'Your best here')} ${fmtPct(rec.best.margin)}</p>`}</section>
    ${routeCards2}
    <section class="card"><h2>${tr('你遇到的課題', 'Lessons you met')}</h2>${seen.length ? seen.map((id) => { const l = LESSONS[id] || {}; return `<div class="lesson"><b>${handled.has(id) ? '✓ ' : '· '}${esc(pick(l) || id)}</b><p>${withTerms(pick(l, 'explainZh', 'explainEn'))}</p><p class="hint">${handled.has(id) ? tr('你處理得不錯。', 'You handled this well.') : tr('這次沒有處理好，下次可以留意。', 'Not handled this time.')}</p></div>`; }).join('') : `<p class="hint">${tr('這次沒有遇到課題。', 'None this time.')}</p>`}${(rep.lessonsUnseen || []).length ? `<p class="hint" style="margin-top:12px">${tr('這局沒遇到', 'Not met this game')}：${(rep.lessonsUnseen || []).map((id) => esc(pick(LESSONS[id] || {}) || id)).join(tr('、', ', '))}</p>` : ''}</section>
    ${tips.length ? `<section class="card"><h2>${tr('換一種走法再玩', 'Try a different line')}</h2><ul class="tips">${tips.map((t) => `<li>${withTerms(t)}</li>`).join('')}</ul></section>` : ''}
    <div class="cta-row"><button type="button" class="btn" id="again">${tr('再玩一次', 'Play again')}</button><button type="button" class="btn sec" id="change">${tr('換基地或模式', 'Change hub or mode')}</button><button type="button" class="link" id="src">${tr('資料來源', 'Data sources')}</button></div></div>`;
  $('#again').onclick = () => newGame(); $('#change').onclick = () => go('start'); $('#src').onclick = () => go('sources');
}

/* ---------- sources ---------- */
const SRC_TAG = { verified: ['已查證', 'Verified', 'ok'], secondary: ['二手資料', 'Secondary', 'mid'], design: ['設計值', 'Design value', 'dv'] };
function renderSources() {
  const items = B.SOURCES || [], dvs = B.DESIGN_VALUES || [], ver = B.VERIFICATION;
  const back = app.prev === 'main' ? 'main' : app.prev === 'end' ? 'end' : 'start';
  const tag = (st) => { const t = SRC_TAG[st] || SRC_TAG.design; return `<span class="flag ${t[2]}">${tr(t[0], t[1])}</span>`; };
  const srcHtml = items.map((x) => `<div class="src"><b>${esc(pick(x, 'topicZh', 'topicEn'))}</b>${tag(x.status)}<p>${esc(pick(x, 'valueZh', 'valueEn'))}</p>${x.sourceName ? `<p class="hint">${tr('出處', 'Source')}：${esc(x.sourceName)}</p>` : ''}${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.url)}</a>` : ''}</div>`).join('');
  const dvHtml = dvs.map((x) => `<div class="src"><b>${esc(pick(x, 'zhName', 'enName'))}</b>${tag('design')}<p>${esc(pick(x, 'zh', 'en'))}</p><p class="hint num">${esc(x.value)}</p></div>`).join('');
  const verHtml = ver ? `<ul class="tips">${(ver[locale] || ver.zh).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  appEl.innerHTML = `<div class="rwrap"><button type="button" class="back-sm" id="b">‹ ${tr('返回', 'Back')}</button><h1 style="margin-bottom:6px">${tr('資料來源', 'Data sources')}</h1>
    <p class="hint">${tr('遊戲裡的數字來自這些公開資料，再簡化成教學用的版本。三種標籤：已查證是讀過原始來源；二手資料是只在二手整理裡看到；設計值是沒有公開數字、為了玩法而訂。', 'Game numbers come from these public sources, simplified for teaching. Three tags: Verified means read in the original source; Secondary means seen only in a second-hand summary; Design value means no public figure exists and the number was chosen for gameplay.')}</p>
    <div style="margin-top:10px">${srcHtml}</div>
    ${dvHtml ? `<h2 style="margin:22px 0 4px;font-size:18px">${tr('只有設計值的部分', 'Design values only')}</h2>${dvHtml}` : ''}
    ${verHtml ? `<h2 style="margin:22px 0 4px;font-size:18px">${tr('查證結果', 'What the check found')}</h2>${verHtml}` : ''}</div>`;
  $('#b').onclick = () => { if (back === 'main' && app.state) go('main'); else go(back === 'end' ? 'end' : 'start'); };
}

/* ---------- glossary popover ---------- */
const pop = $('#term-pop');
function showTerm(btn) {
  const key = btn.dataset.term, g = GLOSSARY[key]; if (!g) return;
  markTermSeen(key); $$(`[data-term="${CSS.escape(key)}"]`).forEach((b) => b.classList.remove('is-new'));
  pop.innerHTML = `<h4>${esc(pick(g))}</h4><p>${esc(pick(g, 'explainZh', 'explainEn'))}</p><button type="button" class="btn sec" id="pop-x" style="min-height:36px;padding:4px 16px">${tr('知道了', 'Got it')}</button>`;
  pop.hidden = false; $('#pop-x').focus(); pop._for = btn;
  $('#pop-x').onclick = hideTerm;
}
function hideTerm() { if (!pop.hidden) { pop.hidden = true; const f = pop._for; pop._for = null; if (f && document.contains(f)) f.focus({ preventScroll: true }); } }
document.addEventListener('click', (e) => { const t = e.target.closest?.('[data-term]'); if (t) { e.preventDefault(); showTerm(t); } else if (!pop.hidden && !e.target.closest('#term-pop')) hideTerm(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTerm(); });

/* ---------- chrome wiring ---------- */
$('#lang-btn').addEventListener('click', () => { setLocale(locale === 'zh' ? 'en' : 'zh'); chrome(); go(app.screen === 'main' && !app.draft ? 'main' : app.screen); });
$('#menu-btn').addEventListener('click', () => {
  const m = overlay(`<h2>${tr('選單', 'Menu')}</h2><div class="opts" style="margin-top:12px"><button type="button" class="opt" data-m="src"><b>${tr('資料來源', 'Data sources')}</b></button><button type="button" class="opt" data-m="home"><b>${tr('回到開始畫面', 'Back to start')}</b><small>${tr('進度每回合自動存檔，可從開始畫面繼續。', 'Progress autosaves each turn. Continue from the start screen.')}</small></button><button type="button" class="opt" data-m="x"><b>${tr('關閉', 'Close')}</b></button></div>`, { label: tr('選單', 'Menu') });
  $$('[data-m]', m).forEach((b) => b.addEventListener('click', () => { closeOverlay(); if (b.dataset.m === 'src') go('sources'); if (b.dataset.m === 'home') go('start'); }));
});

/* ---------- debug hook (?debug) ---------- */
if (new URLSearchParams(location.search).has('debug')) {
  window.__tq = {
    app, B,
    /** run n turns with the current draft (auto-answering events with the first option) */
    ff(n = 1) { for (let i = 0; i < n && !isOver(app.state); i++) { if (app.screen !== 'main') go('main'); if (!app.draft) initDraft(); for (const e of B.pendingEvents(app.state)) app.draft.eventChoices[e.id] = e.options[0].id; runTurn(); } return app.state.turn; },
    end() { while (!isOver(app.state)) this.ff(1); if (app.screen !== 'end') { go('end'); } },
  };
}

chrome(); go('start');
