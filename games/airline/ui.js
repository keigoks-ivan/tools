// 天青航空：航線經營 — UI. All game logic lives in the model (backend.mjs); this file only renders and collects decisions.
import * as B from './backend.mjs?v=25';
import { createAirport } from './ui-airport.js?v=22';
import { createNetwork } from './ui-network.js?v=22.2';
import { FACILITIES, SCENARIOS, scenarioProgress, newClock, advanceClock, turnSeconds, fuelOrder } from './v2.mjs?v=23';
import { aircraftArt, facilityArt } from './ui-art-v2.js?v=22';
import { playIcon, routeTicket, goalList, resultBadges, aircraftStats, rangeComparison } from './ui-play.js?v=22';
import { orbitBackdrop } from './ui-scene.js?v=22';
import { createSoundtrack } from './ui-music.js?v=22';
import { readCareer } from './career.mjs?v=22';
import { missionTitle, careerHeader, dispatchView, missionPin, passportView, rivalView, careerResult } from './ui-career.js?v=22';
import { BRAND_EN, tr, pick, esc, $, $$, fmtUSD, fmtPct, fmtNum, fmtFare, term, withTerms, markTermSeen, locale, setLocale } from './ui-util.js?v=22';

import { gameIcon, brandCrest, regionalArt } from './ui-premium-art.js?v=22';

const { MODES, HUBS, CITIES, CITY_REGIONS, AIRCRAFT, LESSONS, GLOSSARY } = B;
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
const MODE_MIN = { 0: '15–20', 1: '25–35' };
const modeList = list(MODES).map((m, i) => ({ minutes: MODE_MIN[i], ...m })), hubList = list(HUBS).map((h) => (HUB_TEACH[h.id] ? { teachZh: HUB_TEACH[h.id][0], teachEn: HUB_TEACH[h.id][1], ...h } : h));
const cadence = (m) => (m.monthsPerTurn >= 6 ? tr('半年一回合（夏季／冬季）', 'One turn per half year (summer / winter)') : tr('一個月一回合', 'One turn per month'));
const modeOf = (id) => modeList.find((m) => m.id === id) || modeList[0];
const hubOf = (id) => CITIES[id] || CITIES.TPE;
const isSeasonMode = (mid) => modeList.indexOf(modeOf(mid)) === 1;
const SAVE_KEY = (m) => `tq-airline-save-${m}`;
const BEST_KEY = 'tq-airline-best';
const PASSPORT_KEY = 'tq-airline-passport';
const SAVE_BACKUP_KEY = 'tq-airline-save-backups';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const app = { screen: 'start', prev: 'start', sel: { mode: modeList[0].id, hub: (B.DEFAULT_HUB || 'TPE') }, state: null, draft: null, map: null, city: null, tmp: null, report: null, reportTurn: 0, lastMargin: null, panelMin: false, panelOpen: false, view: 'airport', tab: 'routes', active: null, clock: newClock(), scenario: 'free' };
if (!Object.hasOwn(CITIES, app.sel.hub)) app.sel.hub = hubList[0].id;
try { const s = JSON.parse(store.get('tq-airline-sel') || 'null'); if (s && modeList.some((m) => m.id === s.mode) && Object.hasOwn(CITIES, s.hub)) app.sel = { mode: s.mode, hub: s.hub }; app.scenario = SCENARIOS[s?.scenario] ? s.scenario : 'free'; } catch {}

/* ---------- adapters over model state (keep model shape knowledge here) ---------- */
const needMap = (x) => { if (Array.isArray(x)) return x.reduce((o, r) => ({ ...o, [r.type || r.id]: r.n ?? r.count ?? r.needed ?? 0 }), {}); return { ...(x || {}) }; };
const fleetCounts = (s) => { const f = s.fleet || {}, out = {}; if (Array.isArray(f)) { for (const a of f) out[a.type] = (out[a.type] || 0) + 1; return out; } for (const k of ['lease', 'leased', 'own', 'owned']) if (f[k] && typeof f[k] === 'object') for (const [t, n] of Object.entries(f[k])) if (typeof n === 'number') out[t] = (out[t] || 0) + n; return out; };
const stateRoutes = (s) => (s.routes || []).map((r) => ({ city: r.city, type: r.type, weekly: r.weekly, fare: r.fare || 'mid' }));
const rivalCities = (s) => [...new Set((s.rivalRoutes || s.rivals || []).flatMap((r) => (typeof r === 'string' ? [r] : Array.isArray(r.routes) ? r.routes.map((x) => x.city || x) : r.routes ? Object.keys(r.routes) : (r.city ? [r.city] : []))))].filter((c) => CITIES[c]);
const isOver = (s) => !!(s.over || s.finished || s.gameOver);
const hedgeOf = (s) => (typeof s.hedge === 'object' && s.hedge ? s.hedge.frac || 0 : s.hedge || 0);
const totalTurns = (s) => s.totalTurns ?? s.turns ?? modeOf(s.mode).turns;
const bizModel = () => app.draft?.eventChoices?.['a-model'] || app.draft?.eventChoices?.['b-model'] || app.draft?.businessModel || app.state?.model || 'fsc';
const planningState = () => ({ ...(app.active?.state || app.state), model: bizModel(), maintenance:app.draft?.maintenance || (app.active?.state || app.state)?.maintenance || {} });
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
  const draft = app.draft ? { ...app.draft, routes: draftRoutes(), facilities: [...app.draft.facilities] } : null;
  store.set(SAVE_KEY(s.mode), JSON.stringify({ v: 2, at: Date.now(), hub: s.hub, mode: s.mode, turn: s.turn, cash: s.cash, state: B.serialize(s), active: app.active, clock: app.clock, draft }));
}
function readSaves() {
  const out = [];
  for (const m of modeList) { try { const o = JSON.parse(store.get(SAVE_KEY(m.id)) || 'null'); if (o && o.state) out.push(o); } catch {} }
  return out;
}
function clearSaves() {
  const saves = Object.fromEntries(modeList.map(m => [SAVE_KEY(m.id), store.get(SAVE_KEY(m.id))]).filter(([, v]) => v));
  if (Object.keys(saves).length) {
    let backups = {}; try { backups = JSON.parse(store.get(SAVE_BACKUP_KEY) || '{}'); } catch {}
    const value = JSON.stringify({ ...backups, [Date.now()]: saves });
    store.set(SAVE_BACKUP_KEY, value);
    if (store.get(SAVE_BACKUP_KEY) !== value) { alert(tr('無法備份，存檔尚未清除。', 'Backup failed. Saves were not cleared.')); return; }
  }
  for (const m of modeList) store.del(SAVE_KEY(m.id));
  app.state = null; app.active = null; app.draft = null; app.report = null; app.clock = newClock();
  go('start');
}
function restoreSaves() {
  let backups = {}; try { backups = JSON.parse(store.get(SAVE_BACKUP_KEY) || '{}'); } catch {}
  const latest = Object.keys(backups).sort((a,b) => Number(b)-Number(a))[0];
  for (const [key, value] of Object.entries(backups[latest] || {})) if (modeList.some(m => SAVE_KEY(m.id) === key)) store.set(key, value);
  go('start');
}
function recordBest(s, rep) {
  let b = {}; try { b = JSON.parse(store.get(BEST_KEY) || '{}'); } catch {}
  const k = `${s.hub}-${s.mode}`; const m = rep.marginTotal;
  const prev = b[k]; b[k] = (!prev || m > prev.margin) ? { margin: m, grade: pick(rep, 'gradeZh', 'gradeEn'), at: Date.now() } : prev;
  store.set(BEST_KEY, JSON.stringify(b));
  return { best: b[k], isBest: !prev || m > prev.margin, prev };
}
function readPassport() {
  try { const o=JSON.parse(store.get(PASSPORT_KEY)||'{}');return Object.fromEntries(Object.entries(o.stamps||{}).filter(([city])=>CITIES[city])); } catch { return {}; }
}
function syncPassport() {
  const stamps=readPassport();for(const [city,stamp] of Object.entries(readCareer(app.state).stamps)) stamps[city] ||= { ...stamp,hub:app.state.hub };
  store.set(PASSPORT_KEY,JSON.stringify({v:1,stamps}));return stamps;
}

/* ---------- screen plumbing ---------- */
const appEl = $('#app');
const music = createSoundtrack(syncMusic);
function syncMusic(status){
  const s=status||music.stats(),b=$('#music-btn');
  b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V5l11-2v12M9 7l11-2" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="6" cy="18" rx="4" ry="3" fill="currentColor"/><ellipse cx="17" cy="16" rx="4" ry="3" fill="currentColor"/>${s.muted?'<path d="m3 2 19 20" stroke="var(--navy)" stroke-width="5"/><path d="m3 2 19 20" stroke="currentColor" stroke-width="2"/>':''}</svg><span class="music-label">${s.busy?tr('準備中','Loading'):s.muted?tr('音樂關','Music off'):tr('音樂開','Music on')}</span>`;
  b.setAttribute('aria-label',s.busy?tr('正在準備配樂','Preparing soundtrack'):s.unavailable?tr('此瀏覽器無法播放配樂','Sound unavailable in this browser'):s.muted?tr('播放和弦配樂','Play chord soundtrack'):tr('靜音配樂','Mute soundtrack'));
  b.setAttribute('aria-pressed',String(!s.muted));b.disabled=s.busy||s.unavailable;
  b.title=tr('柔和鋼琴與和弦配樂，預設靜音。','Soft piano and chord soundtrack. Muted by default.');
}
$('#music-btn').onclick=()=>music.toggle();
function go(name) {
  app.prev = app.screen; app.screen = name;
  if (app.map) { app.map.destroy(); app.map = null; }
  document.body.dataset.screen = name;
  closeOverlay(); hideTerm();
  $('#menu-btn').hidden = name !== 'main';
  $('#turnlabel').textContent = name === 'main' && app.state ? turnLabel(app.state) : '';
  window.scrollTo(0, 0);
  ({ start: renderStart, main: renderMain, results: renderResults, end: renderEnd, sources: renderSources })[name]();
  appEl.focus({ preventScroll: true });
}
function chrome() {
  syncMusic();
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
  app.map?.destroy(); app.map=null;
  const saves=readSaves();
  appEl.innerHTML=`<div class="title-game"><div class="title-world" id="title-world"></div><div class="title-vignette" aria-hidden="true"></div><div class="title-logo">${brandCrest()}<span>SKYGLAZE</span><h1>${tr('天青航空','SKYGLAZE')}</h1><p>${tr('打造你的航空王國','BUILD YOUR AIRLINE')}</p></div><div class="title-menu"><button type="button" class="title-play" id="go-new"><i>${gameIcon("play")}</i><span>${tr('開始新遊戲','NEW GAME')}<small>${esc(pick(modeOf(app.sel.mode)))} · ${app.sel.hub}</small></span></button>${saves.map(o=>`<button type="button" class="title-option" data-continue="${esc(o.mode)}"><i>${gameIcon("continue")}</i><span>${tr('繼續旅程','CONTINUE')}<small>${esc(pick(hubOf(o.hub)))} · ${esc(turnLabelFromSave(o))}</small></span></button>`).join('')}<button type="button" class="title-option" id="configure-game"><i>${gameIcon("hub")}</i><span>${tr('模式與挑戰','MODE & CHALLENGE')}<small>${esc(pick(SCENARIOS[app.scenario]))}</small></span></button><button type="button" class="title-option" id="choose-hub"><i>${gameIcon("network")}</i><span>${tr('選擇出發基地','HOME AIRPORT')}<small>${app.sel.hub} · ${esc(pick(hubOf(app.sel.hub)))} / 180</small></span></button><button type="button" class="title-option" id="passport-home"><i>${gameIcon("passport")}</i><span>${tr('旅行手冊','TRAVEL PASSPORT')}<small>${tr(`已收藏 ${Object.keys(readPassport()).length} 座城市`,`${Object.keys(readPassport()).length} cities collected`)}</small></span></button></div><div class="title-caption"><span class="live-dot"></span>${tr('你的世界，從第一班飛機開始。','Your world starts with its first departure.')}</div><div class="title-footer"><button type="button" id="how-play">${tr('怎麼玩','How to play')}</button><button type="button" id="go-src">${tr('資料來源','Sources')}</button>${saves.length?`<button type="button" id="clear-saves">${tr('清除存檔','Clear saves')}</button>`:''}${store.get(SAVE_BACKUP_KEY)?`<button type="button" id="restore-saves">${tr('還原上次清除的存檔','Restore cleared saves')}</button>`:''}<span>SKYGLAZE / v23.2</span></div></div>`;
  app.map=createAirport($('#title-world'),{hubId:app.sel.hub,preview:true});app.map.update({fleet:[{type:'MQ-320'},{type:'MQ-350'},{type:'MQ-72'}],routes:[],facilities:{depot:1,lounge:1,tank:1}});
  $('#go-new').onclick=newGame;$('#configure-game').onclick=showSetup;$('#choose-hub').onclick=showHubPicker;$('#passport-home').onclick=showPassport;$('#go-src').onclick=()=>go('sources');$('#how-play').onclick=showHow;
  $$('[data-continue]').forEach(b=>b.onclick=()=>continueGame(b.dataset.continue));
  if ($('#clear-saves')) $('#clear-saves').onclick=clearSaves;
  if ($('#restore-saves')) $('#restore-saves').onclick=restoreSaves;
}
function showSetup(){
  const m=overlay(`<div class="career-dialog-top"><small>${tr('新的旅程','NEW ADVENTURE')}</small><button type="button" class="ghost" id="setup-close">${tr('返回','Back')} ×</button></div><h2>${tr('這次，挑戰什麼？','Choose your adventure')}</h2><div class="choices two" role="radiogroup" aria-label="${tr('模式','Mode')}">${modeList.map(mode=>`<button type="button" class="choice" role="radio" aria-checked="${app.sel.mode===mode.id}" data-mode="${mode.id}"><b>${esc(pick(mode))}</b><span class="sub">${esc(cadence(mode))} · ${mode.turns} ${tr('回合','turns')}</span></button>`).join('')}</div><div class="scenario-choices">${Object.entries(SCENARIOS).map(([id,c],i)=>`<button type="button" class="scenario-choice" data-scenario="${id}" aria-pressed="${app.scenario===id}"><span class="scenario-no">0${i+1}</span>${playIcon(id)}<small>${esc(pick(c,'tagZh','tagEn'))}</small><b>${esc(pick(c))}</b><span>${esc(pick(c,'descZh','descEn'))}</span></button>`).join('')}</div><p class="hint">${tr('出發基地','Home airport')}：${app.sel.hub} · ${esc(pick(hubOf(app.sel.hub)))}</p><button type="button" class="btn block" id="setup-start">${tr('出發，開始新遊戲','Depart — new game')} ▶</button>`,{label:tr('模式與挑戰','Mode and challenge')});m.classList.add('setup-dialog');
  const remember=()=>{store.set('tq-airline-sel',JSON.stringify({...app.sel,scenario:app.scenario}));$('#go-new small').textContent=pick(modeOf(app.sel.mode))+' · '+app.sel.hub;$('#configure-game small').textContent=pick(SCENARIOS[app.scenario]);};
  $$('[data-mode]',m).forEach(b=>b.onclick=()=>{app.sel.mode=b.dataset.mode;if(SCENARIOS[app.scenario]?.mode&&SCENARIOS[app.scenario].mode!==app.sel.mode)app.scenario='free';remember();showSetup();});
  $$('[data-scenario]',m).forEach(b=>b.onclick=()=>{app.scenario=b.dataset.scenario;if(SCENARIOS[app.scenario].mode)app.sel.mode=SCENARIOS[app.scenario].mode;remember();showSetup();});
  $('#setup-close').onclick=()=>{closeOverlay();renderStart();};$('#setup-start').onclick=newGame;
}
function showHow(){
  overlay(`<div class="kick">SKYGLAZE / ${tr('飛行指南','FLIGHT MANUAL')}</div><h2>${tr('點機場，就能開始經營。','Your airport is your controller.')}</h2><ol class="howto"><li>${tr('點航廈或下方「航圖」，選目的地、機型、班次與票價。','Tap the terminal or World map. Choose destination, aircraft, frequency and fares.')}</li><li>${tr('點「開始營運」，看飛機滑行起飛。可暫停、快轉或直接結算。','Start operations and watch departures. Pause, speed up or jump to settlement.')}</li><li>${tr('點機隊手動訂機，先付押金或頭期款，依方案等待交付；新機型還要招募合格機組，訓練完成後才能開航，停飛照付固定薪資。每回合額度與機隊容量有限；維修基地完工後才擴容；密集飛行會消耗機隊狀態，可預留時數或加強保養。點塔台接任務。','Order aircraft in Fleet: pay a deposit or down payment and wait for delivery. Recruit type-qualified rosters and wait for training; idle staff remain on payroll. Quotas and fleet capacity limit growth; a completed depot expands capacity. Intensive flying wears condition; reserve hours or increase care. Tap the tower for missions.')}</li><li>${tr('營運中可以安排下期航線。結算時看每條航線的賺賠原因，再調整。','Plan next-turn routes during playback. Review each route’s profit or loss at settlement and adjust.')}</li></ol><p class="hint">${tr('拖曳旋轉機場，雙指或滾輪縮放。場景航班為縮時示意；帳目由供需模型結算。','Drag to orbit; pinch or scroll to zoom. Traffic is sampled; accounts settle through the demand model.')}</p><button type="button" class="btn block" id="how-close">${tr('準備好了','Ready')} ✓</button>`,{label:tr('怎麼玩','How to play')});$('#how-close').onclick=closeOverlay;
}
function showHubPicker() {
  const m=overlay(`<div class="career-dialog-top"><small>${tr('自由選擇基地','CHOOSE YOUR HOME AIRPORT')}</small><button type="button" class="ghost" id="hub-picker-close">${tr('返回','Back')} ×</button></div><h2>${tr('你的航空公司，從哪裡出發？','Where does your airline begin?')}</h2><p class="hint">${tr('可選全部 180 個機場。選定後，這一局的航線都從這裡出發。','Choose any of 180 airports. All routes in this game depart from your chosen base.')}</p><div class="hub-picker-controls"><label>${tr('搜尋機場','Find an airport')}<input type="search" id="hub-search" placeholder="${tr('城市名稱或機場代碼，例如高雄、LAX','City or airport code, e.g. London, LAX')}" autocomplete="off"></label><label>${tr('區域','Region')}<select id="hub-region"><option value="">${tr('全部區域','All regions')}</option>${Object.entries(CITY_REGIONS).map(([id,r])=>`<option value="${id}">${esc(pick(r))}</option>`).join('')}</select></label></div><div class="hub-picker-count" id="hub-picker-count" role="status"></div><div class="hub-airports" id="hub-airports" role="radiogroup" aria-label="${tr('基地機場','Home airport')}"></div>`,{label:tr('自由選擇基地','Choose home airport')});
  m.classList.add('hub-picker-dialog');
  const refresh=()=>{
    const q=$('#hub-search').value.trim().toLocaleLowerCase(),region=$('#hub-region').value;
    const cities=Object.values(CITIES).filter(c=>(!region||c.region===region)&&(!q||`${c.id} ${c.zh} ${c.en}`.toLocaleLowerCase().includes(q))).sort((a,b)=>Number(b.id===app.sel.hub)-Number(a.id===app.sel.hub)||a.id.localeCompare(b.id));
    $('#hub-picker-count').textContent=tr(`${cities.length} 個機場`,`${cities.length} airports`);
    $('#hub-airports').innerHTML=cities.length?cities.map(c=>`<button type="button" class="hub-airport" role="radio" aria-checked="${c.id===app.sel.hub}" data-pick-hub="${c.id}">${regionalArt(c.region,"city-thumb")}<b>${c.id}</b><span><strong>${esc(pick(c))}</strong><small>${esc(pick(CITY_REGIONS[c.region]))} · ${tr('成本指數','Cost index')} ×${c.feeLevel.toFixed(2)}${c.slotLimited?' · '+tr('繁忙機場','Busy airport'):''}</small></span><i>${c.id===app.sel.hub?'✓':'↗'}</i></button>`).join(''):`<p class="hub-empty">${tr('沒有找到機場，試試城市名稱或三碼代碼。','No airports found. Try a city name or three-letter code.')}</p>`;
    $$('[data-pick-hub]',m).forEach(b=>b.onclick=()=>{app.sel.hub=b.dataset.pickHub;store.set('tq-airline-sel',JSON.stringify({...app.sel,scenario:app.scenario}));closeOverlay();renderStart();$('#choose-hub').focus({preventScroll:true});});
  };
  $('#hub-search').oninput=refresh;$('#hub-region').onchange=refresh;$('#hub-picker-close').onclick=()=>{closeOverlay();$('#choose-hub').focus({preventScroll:true});};refresh();$('#hub-search').focus();
}
function turnLabelFromSave(o) { try { return turnLabel({ mode: o.mode, turns: modeOf(o.mode).turns, turn: o.turn }, o.turn); } catch { return ''; } }

function newGame() {
  store.set('tq-airline-sel', JSON.stringify({ ...app.sel, scenario: app.scenario }));
  app.state = B.newGame({ mode: app.sel.mode, hub: app.sel.hub, seed: SCENARIOS[app.scenario]?.seed ?? ((Date.now() % 100000) + 1) });
  app.state.scenario = app.scenario;
  app.active = null; app.clock = newClock(); app.draft = null; app.tab = 'routes'; app.panelMin = false;
  app.report = null; app.lastMargin = null; app.city = null; app.tmp = null; app.view='airport'; app.panelOpen=false;
  go('main');
}
function continueGame(mode) {
  try {
    const o = JSON.parse(store.get(SAVE_KEY(mode))); app.state = B.deserialize(o.state); app.sel = { mode: o.mode, hub: o.hub };
    app.scenario = app.state.scenario || 'free'; app.active = o.v === 2 && o.active?.report?.company ? o.active : null;
    app.clock = { ...newClock(), ...(app.active ? o.clock : {}), running: false };
    app.draft = o.v === 2 && o.draft ? { ...o.draft, routes: new Map(o.draft.routes.map(r=>[r.city,r])), facilities: new Set(o.draft.facilities || []) } : null;
    app.report = null; app.lastMargin = app.state.history.at(-1)?.margin ?? null; app.tab = 'routes'; app.city = null; app.tmp = null; app.view='airport';app.panelOpen=false;syncPassport(); go('main');
  } catch { store.del(SAVE_KEY(mode)); app.active = null; app.draft = null; renderStart(); }
}

/* ---------- main ---------- */
function initDraft() {
  const s = app.state;
  app.draft = { routes: new Map(stateRoutes(s).map((r) => [r.city, r])), hedge: hedgeOf(s), businessModel: s.model || s.businessModel || 'fsc', eventChoices: {}, maintenance:{...(s.maintenance||{})}, facilities: new Set(), buyFuel: false };
  app.city = null; app.tmp = null;
}
const draftRoutes = () => [...app.draft.routes.values()];
function commitFleet(fleet) {
  if (app.active) return;
  const out = B.applyDecisions(app.state, { fleet });
  if (out.errors.length) { $('#fleetmsg').textContent = out.errors.map(e => pick(e)).join(' · '); return; }
  app.state = out.state; refreshMap(); renderHud(); renderPanel(); saveGame();
}
const buildDecisions = (routes = draftRoutes()) => ({ maintenance:app.draft.maintenance || {}, facilities: [...app.draft.facilities], buyFuel: app.draft.buyFuel, routes, hedge: app.draft.hedge, eventChoices: app.draft.eventChoices, ...(isSeasonMode(app.state.mode) ? { businessModel: bizModel() } : {}) });
function commitPersonnel(personnel){
  if(app.active)return;
  const out=B.applyDecisions(app.state,{personnel,routes:draftRoutes(),maintenance:app.draft.maintenance,...(isSeasonMode(app.state.mode)?{businessModel:bizModel()}: {})});
  if(out.errors.length){$('#fleetmsg').textContent=out.errors.map(e=>pick(e)).join(' · ');return;}
  app.state=out.state;refreshMap();renderHud();renderPanel();saveGame();
}

function renderMain() {
  const s=app.state;
  if(!app.draft||app.draft.forTurn!==s.turn){initDraft();app.draft.forTurn=s.turn;}
  app.panelOpen=false;
  appEl.innerHTML=`<div class="play-game" data-view="${app.view}" id="play-game"><div class="play-world mapbox" id="mapbox"></div><div class="game-vignette" aria-hidden="true"></div><div class="play-location"><small>${tr('你的基地','YOUR AIRPORT')}</small><b>${s.hub}<span>${esc(pick(hubOf(s.hub)))}</span></b><em id="world-instruction">${tr('點建築開始操作 · 拖曳旋轉','Tap a building · drag to orbit')}</em></div><div class="flight-hud" id="flight-hud"></div><button type="button" class="mission-pin" id="mission-pin"></button><div class="world-controls"><button type="button" id="zin" aria-label="${tr('放大','Zoom in')}">＋</button><button type="button" id="zout" aria-label="${tr('縮小','Zoom out')}">−</button><button type="button" id="zfit" aria-label="${tr('回到基地','Recenter')}">⌖</button><button type="button" id="world-search" aria-label="${tr('搜尋目的地','Find destination')}">⌕</button></div><div class="play-feedback" id="play-feedback" role="status"></div><div class="maplegend"><span><i></i>${tr('獲利','Profit')}</span><span><i class="loss"></i>${tr('虧損','Loss')}</span><span><i class="r"></i>${tr('對手','Rivals')}</span></div><div class="game-bottom"><div class="clockbar"><div class="clock-label"><b id="clock-day"></b><small id="clock-status"></small></div><div class="time-track"><i id="clock-progress"></i></div><div class="time-controls"><button type="button" id="pause" aria-label="${tr('暫停／繼續','Pause / resume')}">▶</button>${[1,2,4].map(n=>`<button type="button" data-speed="${n}" aria-pressed="${app.clock.speed===n}">${n}×</button>`).join('')}<button type="button" id="skip" aria-label="${tr('直接結算','Jump to settlement')}">↦</button></div></div><nav class="game-dock" aria-label="${tr('遊戲操作','Game controls')}">${[['airport','⌂','機場','Airport'],['network','◎','航圖','World'],['routes','✈','航線','Routes'],['fleet','◒','機隊','Fleet'],['missions','⚑','任務','Missions'],['hub','⚒','建設','Build']].map(([id,icon,zh,en])=>`<button type="button" data-dock="${id}"><i aria-hidden="true">${gameIcon(id)}</i><span>${tr(zh,en)}</span></button>`).join('')}<button type="button" class="dock-run" id="world-run"><i>${gameIcon("play")}</i><span></span></button></nav><div class="world-runmsg" id="world-runmsg" role="alert"></div></div><aside class="panel game-drawer" id="panel" data-section="${app.tab}" hidden aria-label="${tr('操作面板','Control panel')}"><div class="drawer-heading"><small id="drawer-title"></small><button type="button" id="drawer-close" aria-label="${tr('關閉面板','Close panel')}">×</button></div><nav class="panel-tabs" aria-label="${tr('營運分類','Operations tabs')}">${[['routes','航線','Routes'],['missions','任務','Missions'],['fleet','機隊','Fleet'],['hub','建設','Build']].map(([id,zh,en])=>`<button type="button" data-tab="${id}" aria-pressed="${app.tab===id}">${tr(zh,en)}</button>`).join('')}</nav><div class="panel-scroll" id="pscroll"></div><div class="panel-foot" id="pfoot"></div></aside></div>`;
  mountWorld();
  $('#zin').onclick=()=>app.map?.zoomBy(1.2);$('#zout').onclick=()=>app.map?.zoomBy(1/1.2);$('#zfit').onclick=()=>app.map?.recenter();$('#world-search').onclick=destinationPicker;
  $('#drawer-close').onclick=closePanel;$('#mission-pin').onclick=showMissions;
  $$('[data-tab]').forEach(b=>b.onclick=()=>openPanel(b.dataset.tab));
  $$('[data-dock]').forEach(b=>b.onclick=()=>{const id=b.dataset.dock;if(['airport','network'].includes(id)){closePanel();setWorld(id);}else if(id==='missions')showMissions();else openPanel(id);});
  $('#world-run').onclick=()=>app.active?togglePlayback():runTurn();
  $('#pause').onclick=togglePlayback;$('#skip').onclick=()=>{if(app.active)settleTurn();else runTurn(true);};
  $$('[data-speed]').forEach(b=>b.onclick=()=>{app.clock.speed=Number(b.dataset.speed);syncClock();saveGame();});
  renderHud();renderPanel();syncClock();
  const ev=(B.pendingEvents(s)||[]).filter(e=>!(e.id in app.draft.eventChoices));if(!app.active&&ev.length)askEvents(ev);
}
function mountWorld(){
  app.map?.destroy();app.map=null;const box=$('#mapbox');box.replaceChildren();
  if(app.view==='network'){box.innerHTML=orbitBackdrop();app.map=createNetwork(box,{hubId:app.state.hub,onCityClick:selectCity});}
  else app.map=createAirport(box,{hubId:app.state.hub,onSelect:worldSelect});
  $('#play-game').dataset.view=app.view;$$('[data-dock]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.dock===app.view)));
  $('#world-instruction').textContent=app.view==='airport'?tr('點建築開始操作 · 拖曳旋轉','Tap a building · drag to orbit'):tr('點城市開航線 · 搜尋 180 個航點','Tap a city to plan · 180 airports');
  refreshMap();app.map.setTime({elapsed:app.clock.elapsed,speed:app.clock.running?app.clock.speed:0});
}
function setWorld(view){if(app.view===view)return;app.view=view;mountWorld();}
function worldSelect(id,type){
  if(id==='terminal'){setWorld('network');destinationPicker();}
  else if(id==='tower')showMissions();
  else if(id==='fleet')showAircraft(type||'MQ-320');
  else showHub(id);
}
function openPanel(tab){app.tab=tab;app.city=null;app.tmp=null;app.panelOpen=true;app.panelMin=false;refreshMap();renderPanel();$('#drawer-close').focus({preventScroll:true});}
function closePanel(){app.panelOpen=false;syncPanelMin();app.map?.focus('');const b=$(`[data-dock="${app.tab}"]`);b?.focus({preventScroll:true});}
function syncPanelMin(){const p=$('#panel');if(!p)return;p.hidden=!app.panelOpen;p.dataset.section=app.tab;$('#play-game').classList.toggle('drawer-open',app.panelOpen);$('#drawer-title').textContent=app.city?`${app.state.hub} → ${app.city}`:tr({routes:'航線調度',fleet:'機隊與燃油',missions:'任務板',hub:'基地建設'}[app.tab],{routes:'ROUTE CONTROL',fleet:'FLEET & FUEL',missions:'DISPATCH',hub:'CONSTRUCTION'}[app.tab]);}
function showAircraft(type){
  const a=AIRCRAFT[type];if(!a)return;
  const m=overlay(`<div class="career-dialog-top"><small>${tr('你的機隊','YOUR FLEET')}</small><button type="button" class="ghost" id="plane-close" aria-label="${tr('關閉','Close')}">×</button></div><div class="plane-showcase">${aircraftArt(type)}<span>SKYGLAZE / ${type.replace('MQ-','')}</span></div><h2>${esc(pick(a))}</h2>${aircraftStats(type,bizModel())}<p class="hint">${tr('先用航程確認飛得到，再依市場客量選擇座位數。數值為遊戲簡化設定。','Check range first, then match capacity to market demand. Figures are simplified game profiles.')}</p><button type="button" class="btn block" id="plane-fleet">${tr('管理機隊與燃油','Manage fleet and fuel')} →</button>`,{label:pick(a)});m.classList.add('plane-dialog');$('#plane-close').onclick=closeOverlay;$('#plane-fleet').onclick=()=>{closeOverlay();openPanel('fleet');};
}
function mapMetrics(){
  if(app.active)return Object.fromEntries(app.active.report.routes.map(r=>[r.city,r]));
  return Object.fromEntries(draftRoutes().map(r=>[r.city,B.estimateRoute(planningState(),r.city,r.type,r.weekly,r.fare)]));
}
function refreshMap(){app.map?.update({routes:app.active?app.active.start.routes:draftRoutes(),rivals:rivalCities(app.state),selected:app.city,metrics:mapMetrics(),weeks:modeOf(app.state.mode).weeksPerTurn,active:!!app.active,fleet:app.state.fleet,facilities:app.state.facilities,queued:[...app.draft.facilities,...(app.state.facilityOrders||[]).map(o=>o.id)]});}
function selectCity(id){app.panelOpen=true;if(id===app.state.hub){app.city=null;app.tab='hub';app.panelMin=false;renderPanel();return;}app.tab='routes';app.city=id;app.tmp=null;app.panelMin=false;app.map?.focus(id);refreshMap();renderPanel();}
function renderPanel(){if(!$('#pscroll'))return;syncPanelMin();$$('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===app.tab)));(app.city?renderRoutePanel:app.tab==='hub'?renderFacilities:app.tab==='fleet'?renderFleet:app.tab==='missions'?renderMissions:renderOverview)();const key=app.city||app.tab;if(key!==app.panelKey)$('#pscroll').scrollTop=0;app.panelKey=key;if(!app.city)renderRunButton();saveGame();}
function renderRunButton(){
  syncWorldRun();$('#pfoot').innerHTML=`<p class="decision-timing">${app.active?tr('現在的調整，下一期生效。','Changes now take effect next turn.'):tr('飛機自動調度，月底統一結算。','Aircraft are assigned automatically. Accounts settle at turn end.')}</p><button type="button" class="btn block" id="run">${app.active?(app.clock.running?tr('Ⅱ 暫停營運','Ⅱ Pause operations'):tr('▶ 繼續營運','▶ Resume operations')):tr(`開始${turnWord(app.state)} ▶`,`Start ${turnWord(app.state)} ▶`)}</button><div class="hint" id="runmsg" role="alert"></div>`;
  $('#run').onclick=()=>app.active?togglePlayback():runTurn();
}
function syncWorldRun(){
  const b=$('#world-run');if(!b)return;
  $('i',b).innerHTML=gameIcon(app.active&&app.clock.running?'pause':'play');$('span',b).textContent=app.active?(app.clock.running?tr('暫停','Pause'):tr('繼續','Resume')):tr('開始營運','Depart');
  b.classList.toggle('running',!!app.active);b.setAttribute('aria-pressed',String(!!app.active&&app.clock.running));
}
function renderHud(){
  const s=app.state,margin=s.history.at(-1)?.margin,routes=app.active?.start.routes||draftRoutes(),co=app.active?.report.company,career=readCareer(s);
  $('#flight-hud').innerHTML=`<div class="resource-chip cash-chip"><i>${gameIcon("cash")}</i><span><small>${tr('現金','CASH')}</small><b>${esc(fmtUSD(s.cash))}</b></span></div><button type="button" class="resource-chip" id="hud-routes"><i>${gameIcon("routes")}</i><span><small>${tr('航線','ROUTES')}</small><b>${routes.length}</b></span></button><button type="button" class="resource-chip fleet-chip" id="hud-fleet" aria-label="${tr(`查看現有 ${s.fleet.length} 架飛機`,`View ${s.fleet.length} delivered aircraft`)}"><i>${gameIcon("fleet")}</i><span><small>${tr('現有飛機','AIRCRAFT')}</small><b>${s.fleet.length} <em>${tr('架','')}</em></b></span></button><div class="resource-chip margin-chip"><i>${gameIcon("margin")}</i><span><small>${tr('上期淨利率','LAST MARGIN')}</small><b class="${margin<0?'negative':''}">${margin==null?'—':fmtPct(margin)}</b></span></div><button type="button" class="resource-chip xp-chip" id="hud-career"><i>${gameIcon("xp")}</i><span><small>${tr('成長值','XP')}</small><b>${fmtNum(career.xp)}</b></span></button>`;
  $('#hud-routes').onclick=()=>openPanel('routes');$('#hud-fleet').onclick=()=>openPanel('fleet');$('#hud-career').onclick=showMissions;
  $('[data-dock="fleet"] span').textContent=tr(`機隊 ${s.fleet.length}`,`Fleet ${s.fleet.length}`);
  $('#mission-pin').innerHTML=missionPin(s);$('#play-feedback').innerHTML=co?`<span class="live-dot"></span><b>${tr('本期推估','TURN ESTIMATE')} ${co.profit>=0?'+':''}${esc(fmtUSD(co.profit))}</b><small>${tr('載客','Load')} ${fmtPct(co.loadFactor,0)} / ${tr('平衡','BE')} ${fmtPct(co.breakEvenLF,0)}</small>`:`<span>✈</span><b>${routes.length?tr('班表準備好了！','Ready for departure!'):tr('點航廈，安排第一條航線。','Tap the terminal to plan a flight.')}</b><small>${routes.length?tr(`${routes.length} 條航線，按開始營運讓機隊出發。`,`${routes.length} routes ready. Depart to start operations.`):tr('接任務、開航線，再按開始營運。','Choose a mission, plan routes, then depart.')}</small>`;
  syncWorldRun();refreshMap();
}
const fmtHours = n => n.toFixed(1).replace(/\.0$/,'');
function dispatchCapacity(routes,city=null,preview=null){
  const s=planningState(),available=B.fleetAvailability(s,routes),eligible=city?B.routeOptions(s,city).eligibleTypes:null;
  const types=Object.keys(available).filter(t=>available[t].delivered||available[t].pending||t===preview?.type);
  const after=preview?.type?B.fleetAvailability(s,routes.concat(preview))[preview.type]:null;
  return `<section class="dispatch-capacity" aria-label="${tr('可安排機隊與時數','Available aircraft and hours')}"><h3>${app.active?tr('下期可安排的機隊','Fleet available next turn'):tr('還能安排的機隊','Aircraft still available')}</h3>${types.map(t=>{
    const a=available[t],crew=B.crewAvailability(s,routes)[t],inRange=!eligible||eligible.includes(t);
    return `<div class="dispatch-aircraft ${inRange?'':'out-of-range'}" data-dispatch-type="${t}"><div><b>${esc(pick(AIRCRAFT[t]))}</b><strong>${tr('未排班','Unassigned')} <span data-dispatch-free>${a.unassigned}</span> ${tr('架','aircraft')}</strong></div><small>${tr('現有','Available')} ${a.delivered} ${tr('架','aircraft')} · ${tr('剩餘','Remaining')} <b data-dispatch-hours>${fmtHours(a.remainingHours)}</b> / ${fmtHours(a.totalHours)} h/${tr('週','wk')}${a.pending?` · ${tr('待交機','On order')} ${a.pending}`:''}${inRange?'':` · ${tr('航程不足','Out of range')}`}</small><small class="dispatch-crews" data-dispatch-crew="${t}">${tr(`合格機組 ${crew.ready} 組 · 尚可排 ${fmtHours(crew.remainingHours)} h／週`,`${crew.ready} qualified rosters · ${fmtHours(crew.remainingHours)} h/wk remaining`)}</small><div class="dispatch-hours" role="img" aria-label="${tr(`每週已用 ${fmtHours(a.usedHours)} 小時，上限 ${fmtHours(a.totalHours)} 小時`,`Used ${fmtHours(a.usedHours)} of ${fmtHours(a.totalHours)} hours per week`)}"><i style="width:${a.totalHours?Math.min(100,100*a.usedHours/a.totalHours):0}%"></i></div></div>`;
  }).join('')||`<p class="hint">${tr('目前沒有可用飛機，請先訂機並等待交付。','No aircraft available. Order and wait for delivery.')}</p>`}${after?`<div class="dispatch-preview ${after.missing?'shortage':''}" data-dispatch-preview><small>${esc(pick(AIRCRAFT[preview.type]))} · ${tr('這條航線需','This route needs')} ${fmtHours(after.usedHours-available[preview.type].usedHours)} h/${tr('週','wk')}</small><b>${after.missing?tr(`還缺 ${after.missing} 架，請減班或訂機。`,`${after.missing} more aircraft needed. Reduce flights or order.`):tr(`排入後剩 ${fmtHours(after.remainingHours)} h／週 · 未排班 ${after.unassigned} 架`,`After scheduling: ${fmtHours(after.remainingHours)} h/wk left · ${after.unassigned} unassigned`)}</b></div>`:''}<p class="dispatch-help">${app.active?tr('依下期班表計算，含本期結算交機。','Based on next turn, including aircraft delivered at this settlement.'):tr('飛機與該機型合格機組都要有時數；待交機與訓練中尚不能排班。','Both aircraft and type-qualified rosters need hours. Pending aircraft and trainees cannot be scheduled.')}</p></section>`;
}
function destinationPicker(){
  const s=planningState(),routes=draftRoutes(),have=fleetCounts(s);
  const destinations=Object.values(CITIES).filter(c=>c.id!==s.hub).map(c=>{
    const o=B.routeOptions(s,c.id),ready=o.eligibleTypes.filter(t=>have[t]>0),others=routes.filter(r=>r.city!==c.id);
    const status=app.draft.routes.has(c.id)?'open':!o.eligibleTypes.length?'range':!ready.length?'order':ready.some(type=>B.routeCapacity(s,others.concat({city:c.id,type,weekly:1,fare:'mid'})).fits)?'ready':'full';
    return {c,o,status};
  }).sort((a,b)=>a.o.distanceKm-b.o.distanceKm);
  const m=overlay(`<div class="kick">${tr('擴展你的航網','EXPAND YOUR NETWORK')}</div><h2>${tr('下一站，飛去哪裡？','Where will you fly next?')}</h2>${dispatchCapacity(routes)}<input class="city-search" id="city-search" type="search" placeholder="${tr('搜尋城市或機場代碼','Search city or airport code')}" aria-label="${tr('搜尋城市','Search cities')}"><div class="destination-filters"><select id="city-region" aria-label="${tr('航點區域','Airport region')}"><option value="all">${tr('全球航點','All regions')}</option>${Object.entries(CITY_REGIONS).map(([id,r])=>`<option value="${id}">${esc(pick(r))}</option>`).join('')}</select><label><input id="city-reachable" type="checkbox">${tr('機型航程內','Within aircraft range')}</label></div><p class="hint" id="city-count" role="status"></p><div class="destination-list" id="destination-list"></div><button type="button" class="btn sec block" id="city-cancel">${tr('返回','Back')}</button>`,{label:tr('選擇目的地','Choose destination')});
  m.classList.add('destination-dialog');
  const render=()=>{
    const q=$('#city-search').value.trim().toLowerCase(),region=$('#city-region').value,reachable=$('#city-reachable').checked;
    const found=destinations.filter(({c,o})=>(region==='all'||c.region===region)&&(!reachable||o.eligibleTypes.length)&&`${c.id} ${c.zh} ${c.en}`.toLowerCase().includes(q));
    $('#city-count').textContent=tr(`${found.length} 個目的地 · 依距離排列`,`${found.length} destinations · nearest first`);
    $('#destination-list').innerHTML=found.length?found.map(({c,o,status})=>`<button type="button" class="destination" data-destination="${c.id}" data-capacity-status="${status}">${regionalArt(c.region,"city-thumb")}<b>${c.id}</b><span>${esc(pick(c))}<em>${esc(pick(CITY_REGIONS[c.region]))}</em><em class="destination-capacity ${status==='ready'||status==='open'?'ready':'blocked'}">${tr({ready:'✓ 可排班',open:'已開航',range:'超出航程',order:'需先訂機',full:'需調整班表'}[status],{ready:'✓ Can schedule',open:'Route open',range:'Out of range',order:'Order aircraft first',full:'Adjust schedule'}[status])}</em></span><small>${fmtNum(o.distanceKm)} km</small></button>`).join(''):`<p class="destination-empty">${tr('沒有符合的航點，試試其他區域或關鍵字。','No airports match. Try another region or search.')}</p>`;
    $$('[data-destination]',m).forEach(b=>b.onclick=()=>{closeOverlay();selectCity(b.dataset.destination);});
  };
  $('#city-search').oninput=render;$('#city-region').onchange=render;$('#city-reachable').onchange=render;$('#city-cancel').onclick=closeOverlay;render();$('#city-search').focus();
}
/* ----- overview ----- */
function renderOverview(){
  const s=app.state,routes=draftRoutes(),metrics=Object.fromEntries(draftRoutes().map(r=>[r.city,B.estimateRoute(planningState(),r.city,r.type,r.weekly,r.fare)])),challenge=scenarioProgress(s,app.report);
  const suggestions=routes.length?[]:Object.keys(CITIES).filter(id=>id!==s.hub).map(id=>{const d=defaultChoice(id),e=B.estimateRoute(planningState(),id,d.type,d.weekly,'mid');return{id,...d,e};}).filter(r=>r.e).sort((a,b)=>b.e.profit-a.e.profit).slice(0,3);
  $('#pscroll').innerHTML=`<div class="section-eyebrow">${tr('航線規劃','ROUTE PLANNING')}<span>${app.active?tr('下一期','NEXT TURN'):tr('本期','THIS TURN')}</span></div><h2 class="panel-intro">${routes.length?tr('每條航線，都要算得過。','Make every route earn its place.'):tr('先開一條，讓機隊起飛。','Your fleet is ready. Open a route.')}</h2>
    <button type="button" class="dispatch-nudge" id="view-missions"><span>⚑</span><div><small>${tr('本期挑戰','YOUR CHALLENGE')}</small><b>${readCareer(s).active?esc(missionTitle(readCareer(s).active)):tr('選個任務，讓這趟更有目標。','Choose a mission for this adventure.')}</b></div><i>↗</i></button>
    <button type="button" class="aircraft-guide-link" id="aircraft-guide">✈ ${tr('機型圖鑑','Aircraft guide')}<small>${tr('比較航程與座位','Compare range & seats')} →</small></button>
    ${!routes.length?`<div class="onboarding"><img src="./art/v2/mascot.webp?v=22" width="84" height="84" alt=""><div><b>${tr('一起把第一條航線開起來！','Let’s open your first route!')}</b><p>${tr('先選城市，再看飛機能飛多遠、能坐幾人。','Pick a city, then compare aircraft range and seats.')}</p></div></div><p class="hint">${tr('可以先研究這三個市場：','Three markets to explore first:')}</p>${suggestions.map(r=>`<button type="button" class="suggestion" data-route="${r.id}"><b>${r.id} <span>${esc(pick(CITIES[r.id]))}</span></b><small>${esc(pick(AIRCRAFT[r.type]))} · ${tr('預估載客','Est. load')} ${fmtPct(r.e.lf,0)}</small><i>↗</i></button>`).join('')}`:''}
    <div class="rlist">${routes.map(r=>routeTicket(s,r,metrics[r.city],lfBar,!!app.active)).join('')}</div>
    <button type="button" class="add-route" id="add-route"><span>＋</span>${tr('新增航線','Add a route')}<small>${tr(`${Object.keys(CITIES).length} 個航點`,`${Object.keys(CITIES).length} airports`)}</small></button>
    <div class="psec scenario-status"><div class="goal-heading">${playIcon(challenge.id)}<div><small>${tr('本局目標','YOUR AMBITION')}</small><h3>${esc(pick(challenge.sc))}</h3></div></div>${goalList(challenge,s)}<p class="hint">${tr('依已結算結果更新，期末驗收。','Updated from settled results; checked at game end.')}</p></div>`;
  $$('[data-route]').forEach(b=>b.onclick=()=>selectCity(b.dataset.route));$('#add-route').onclick=destinationPicker;$('#aircraft-guide').onclick=aircraftGuide;
  $('#view-missions').onclick=showMissions;
}
function renderMissions(){
  $('#pscroll').innerHTML=dispatchView(app.state,B.careerBoard(app.state),!!app.active);bindCareer($('#pscroll'));
}
function showMissions(){
  const m=overlay(`<div class="career-dialog-top"><small>${tr('你的下一個目標','YOUR NEXT GOAL')}</small><button type="button" class="ghost" data-career-close>${tr('回航網','Back to network')} ×</button></div>${dispatchView(app.state,B.careerBoard(app.state),!!app.active)}`,{label:tr('天青任務板','Skyglaze dispatch board')});
  m.classList.add('dispatch-dialog');bindCareer(m);
}
function bindCareer(root){
  $$('[data-career-close]',root).forEach(b=>b.onclick=closeOverlay);
  $$('[data-passport]',root).forEach(b=>b.onclick=showPassport);
  $$('[data-rival-board]',root).forEach(b=>b.onclick=showRivals);
  $$('[data-mission-accept]',root).forEach(b=>b.onclick=()=>{
    if(app.active)return;
    const out=B.applyDecisions(app.state,{mission:b.dataset.missionAccept});
    if(out.errors.length)return;
    app.state=out.state;closeOverlay();renderHud();openMissionPlan();saveGame();
  });
  $$('[data-mission-plan]',root).forEach(b=>b.onclick=()=>{closeOverlay();openMissionPlan();});
  $$('[data-mission-abandon]',root).forEach(b=>b.onclick=()=>{
    if(app.active)return;
    app.state=B.applyDecisions(app.state,{mission:null}).state;renderHud();renderPanel();showMissions();saveGame();
  });
}
function openMissionPlan(){
  app.panelOpen=true;setWorld('network');const mission=readCareer(app.state).active;app.tab='routes';app.panelMin=false;
  if(mission?.city){
    app.city=mission.city;app.tmp=null;
    if(!app.draft.routes.has(mission.city))app.tmp={...mission.plan,defType:mission.plan.type,note:tr('任務班表建議，可自行調整。這是穩定期估計，首航與事件仍會影響實際結果。','Suggested mission schedule; edit it freely. This is a steady-state forecast; launch ramp-up and events affect the result.')};
    app.map?.focus(mission.city);
  }else{app.city=null;app.tmp=null;}
  refreshMap();renderPanel();
}
function showPassport(){
  const current=app.state?readCareer(app.state).stamps:{},stamps={...readPassport(),...current};
  const m=overlay(`<div class="career-dialog-top"><small>${tr('跨局收藏','LIFETIME COLLECTION')}</small><button type="button" class="ghost" data-career-close>${tr('關閉','Close')} ×</button></div>${passportView(stamps,current)}`,{label:tr('旅行手冊','Travel passport')});
  m.classList.add('passport-dialog');bindCareer(m);
}
function showRivals(){
  const m=overlay(`<div class="career-dialog-top"><small>${tr('對手雷達','RIVAL RADAR')}</small><button type="button" class="ghost" data-career-close>${tr('回航網','Back to network')} ×</button></div>${rivalView(planningState(),draftRoutes())}`,{label:tr('對手雷達','Rival radar')});
  m.classList.add('rival-dialog');bindCareer(m);$$('[data-rival-city]',m).forEach(b=>b.onclick=()=>{closeOverlay();selectCity(b.dataset.rivalCity);});
}
function aircraftGuide(){
  const o=app.city?B.routeOptions(planningState(),app.city):null,types=modeOf(app.state.mode).types,exact=o?B.distanceKm(CITIES[app.state.hub],CITIES[app.city]):0;
  const entries=Object.entries(AIRCRAFT).sort((a,b)=>o?(Number(b[1].rangeKm>=exact)*2+Number(types.includes(b[0])))-(Number(a[1].rangeKm>=exact)*2+Number(types.includes(a[0]))):0);
  const m=overlay(`<div class="guide-intro"><img src="./art/v2/mascot.webp?v=22" width="100" height="100" alt=""><div><div class="kick">${tr('天青機型圖鑑','SKYGLAZE AIRCRAFT GUIDE')}</div><h2>${tr('這一趟，誰來飛？','Who will fly this route?')}</h2><p class="hint">${o?tr(`航線距離 ${fmtNum(o.distanceKm)} km。先看航程，再看座位。`,`Route distance: ${fmtNum(o.distanceKm)} km. Check range, then seats.`):tr('先用航程篩選，再用客量決定大小。','Choose range first, then size for your demand.')}</p></div></div><div class="aircraft-guide-grid">${entries.map(([t,a])=>`<article class="guide-aircraft" data-guide-aircraft="${t}"><div class="guide-plane">${aircraftArt(t)}<span>${esc(pick(a,'classZh','classEn'))}</span></div><h3>${esc(pick(a))}</h3>${aircraftStats(t,bizModel())}${o?rangeComparison(t,o.distanceKm,a.rangeKm>=exact):''}<p class="guide-availability">${types.includes(t)?tr('本模式可使用','Available in this mode'):tr('十年模式可使用','Available in Ten Years')}</p></article>`).join('')}</div><p class="hint">${tr('座位數是每個單程航班的容量，不是一定會來的客人。載客率會隨需求、票價和班次改變。航程與座位採遊戲簡化設定。','Seats are capacity per one-way flight, not guaranteed passengers. Load depends on demand, fares and frequency. Range and capacity are simplified game settings.')}</p><button type="button" class="btn block" id="guide-close">${tr('知道了，回去排航線','Got it — back to planning')}</button>`,{label:tr('機型圖鑑','Aircraft guide')});
  m.classList.add('aircraft-guide-dialog');m.focus({preventScroll:true});m.scrollTop=0;$('#guide-close').onclick=closeOverlay;
}
function waitLabel(s,turns){return s.mode==='year'?tr(`${turns} 個月`,`${turns} month${turns===1?'':'s'}`):tr(`${turns} 季（${turns*6} 個月）`,`${turns} season${turns===1?'':'s'} (${turns*6} months)`);}
function fleetCare(type){
  const s=planningState(),r=B.fleetReadiness(s,draftRoutes())[type];if(!r)return '';
  return `<section class="fleet-care" data-care-type="${type}"><div><b>${tr('機隊狀態','Fleet condition')} ${Math.round(r.condition)} → ${Math.round(r.nextCondition)}</b><small>${tr('結算預估','After-turn forecast')} · ${tr('使用率','Utilisation')} ${fmtPct(r.utilisation,0)}</small></div><meter min="50" max="100" low="80" high="90" optimum="100" value="${r.condition}"></meter><div class="care-options">${Object.entries(B.MAINTENANCE).map(([policy,c])=>`<button type="button" data-care="${type}" data-policy="${policy}" aria-pressed="${r.policy===policy}"><b>${esc(pick(c))}</b><small>${tr('時數','Hours')} ${Math.round(c.hours*100)}% · ${tr('保養費','Care cost')} ${Math.round(c.cost*100)}%</small></button>`).join('')}</div><p>${r.cancel>0?tr(`${app.active?'下期':'本期'}預估技術停飛 ${fmtPct(r.cancel,1)}%，另有旅客補償。`,`Estimated technical cancellations ${fmtPct(r.cancel,1)}, plus passenger compensation.`):tr('留排班餘裕可恢復狀態。密集運轉多飛、省保養費，但狀態下降較快。','Schedule slack restores condition. Intensive flying adds hours and cuts care costs, but condition wears faster.')}</p></section>`;
}
function logisticsBoard(s){
  const c=B.cashCommitments(s);
  return `<section class="logistics-board"><small>${tr('公司資金調度','COMPANY TREASURY')}</small><b>${tr('每月固定現金支出','Monthly fixed cash commitments')}</b><div><span>${tr('現在','Current')} <strong data-fixed-current>${fmtUSD(c.current)}</strong></span><span>${tr('訂單與訓練全數完成後','After orders & training')} <strong>${fmtUSD(c.future)}</strong></span></div><p>${tr(`其中機隊 ${fmtUSD(c.aircraft)}、機組固定薪資 ${fmtUSD(c.staff)}；另含管理、已啟用設施及債務支出。`,`Includes fleet ${fmtUSD(c.aircraft)}, fixed crew pay ${fmtUSD(c.staff)}, administration, active facilities and debt.`)}</p><p data-cash-runway>${tr(`現金可支應 ${c.months.toFixed(1)} 個月固定支出。飛行燃油、地勤與旅客服務另計。`,`Cash covers ${c.months.toFixed(1)} months of fixed bills. Fuel, ground handling and passenger service are extra.`)}</p>${c.committedRent?`<p>${tr('現有租約剩餘租金承諾','Remaining contracted rent')} ${fmtUSD(c.committedRent)}</p>`:''}${(s.facilityOrders||[]).map(o=>`<p data-construction="${o.id}">⚒ ${esc(pick(FACILITIES[o.id]))} · ${tr('施工中','Building')} · ${waitLabel(s,Math.max(0,o.readyTurn-s.turn))}</p>`).join('')}</section>`;
}
function personnelCard(type){
  const s=planningState(),c=B.crewAvailability(s,draftRoutes())[type],q=B.crewQuote(s,type),orders=(s.crewOrders||[]).filter(o=>o.type===type);
  const capacity=Math.max(B.fleetLimits(s).maxFleet+4,Object.values(s.crews||{}).reduce((n,k)=>n+k,0));
  const total=Object.values(B.crewAvailability(s,[])).reduce((n,c)=>n+c.ready+c.pending,0),release=2*q.monthly*s.labourMult;
  return `<section class="personnel-card ${c.missing?'shortage':''}" data-crew-type="${type}"><div class="crew-heading"><b>◉ ${app.active?tr('下期合格機組','NEXT-TURN ROSTERS'):tr('合格機組','QUALIFIED ROSTERS')}</b><span>${tr('每組是一套輪班人力','One roster = rotating staff')}</span></div><div class="crew-counts"><span>${tr('可用','Ready')} <b data-crew-ready>${c.ready}</b></span><span>${tr('班表需要','Needed')} <b>${c.required}</b></span><span>${tr('訓練中','Training')} <b data-crew-pending>${orders.length}</b></span></div><p>${tr(`剩餘 ${fmtHours(c.remainingHours)} / ${fmtHours(c.totalHours)} h／週；每組固定月薪 ${fmtUSD(q.monthly*s.labourMult)}，飛行津貼另計。`,`Remaining ${fmtHours(c.remainingHours)} / ${fmtHours(c.totalHours)} h/wk; fixed pay ${fmtUSD(q.monthly*s.labourMult)}/roster/mo, plus flying allowances.`)}</p>${c.missing?`<p class="crew-shortage">${tr(`還缺 ${c.missing} 組。飛機到了，也要等機組訓練完成才能排班。`,`${c.missing} more rosters needed. Delivery alone does not make an aircraft ready to fly.`)}</p>`:''}<div class="fleet-actions"><button type="button" class="btn sec" data-hire="${type}" ${app.active||total>=capacity||q.readyTurn>=modeOf(s.mode).turns||s.cash<q.fee?'disabled':''}>${tr('招募訓練 1 組','Train 1 roster')} · ${waitLabel(s,q.trainingTurns)}</button><button type="button" class="ghost" data-release-crew="${type}" ${app.active||c.ready<=c.required||s.cash<release?'disabled':''}>${tr('裁撤 1 組','Release 1')} · ${fmtUSD(release)}</button></div><small>${tr(`招募訓練先付 ${fmtUSD(q.fee)}；完成後開始付薪。不同機型編制分開；薪資不隨停飛消失。`,`Training costs ${fmtUSD(q.fee)} upfront; payroll begins on completion. Rosters are specific to each model and remain paid while idle.`)}</small>${orders.map(o=>`<div class="crew-training"><span>${tr('訓練完成','Ready')} · ${esc(turnLabel(s,o.readyTurn))} · ${waitLabel(s,Math.max(0,o.readyTurn-s.turn))}</span><button type="button" class="ghost" data-cancel-crew="${o.id}" ${app.active?'disabled':''}>${tr('取消退 50%','Cancel · 50% refund')}</button></div>`).join('')}</section>`;
}
function leaseContracts(s,type){
  const planes=s.fleet.filter(a=>a.type===type&&a.kind==='lease');if(!planes.length)return '';
  return `<details class="lease-contracts"><summary>${tr('逐架租約與退租費','Individual leases & return fees')}</summary>${planes.map(a=>{const q=B.leaseReturnQuote(s,a);return `<div><b>TQ-${String(a.id).padStart(3,'0')}</b><span>${q.remainingMonths?tr(`剩餘 ${q.remainingMonths} 個月`,`Remaining ${q.remainingMonths} months`):tr('無剩餘承諾','No remaining commitment')} · ${tr('解約費','Return fee')} ${fmtUSD(q.fee)}</span></div>`;}).join('')}</details>`;
}
function cashFlowReport(co){
  const f=co.cashFlow;if(!f)return '';
  const rows=[['operating','營運收支','Operating cash'],['aircraft','訂機、設施與退售','Aircraft, facilities & disposals'],['staff','招募、裁撤與訓練退款','Recruitment, severance & refunds'],['fuel','預付燃油','Fuel prepayments'],['financing','新增貸款','New borrowing'],['debtPayments','償還貸款本金','Loan principal'],['leaseDeferral','租金遞延／補繳','Lease deferral / repayment']];
  return `<section class="cash-flow-report"><h3>${tr('現金去向','CASH MOVEMENTS')}</h3><p>${tr('獲利和現金是兩回事：訂機先付款，折舊不付現，貸款本金也不算營運成本。','Profit and cash differ: aircraft orders use cash upfront, depreciation uses no cash, and principal repayment is not an operating expense.')}</p><div class="cash-flow-row"><span>${tr('期初現金','Opening cash')}</span><b>${fmtUSD(f.opening)}</b></div>${rows.filter(([k])=>Math.abs(f[k]||0)>.5).map(([k,zh,en])=>`<div class="cash-flow-row" data-cash-movement="${k}"><span>${tr(zh,en)}</span><b class="${f[k]<0?'negative':''}">${f[k]>0?'+':''}${fmtUSD(f[k])}</b></div>`).join('')}<div class="cash-flow-row closing"><span>${tr('期末現金','Closing cash')}</span><b>${fmtUSD(f.closing)}</b></div><p>${tr(`本期固定機組薪資 ${fmtUSD(co.fixedPayroll)}，已包含在人事成本中。`,`Fixed roster pay this turn ${fmtUSD(co.fixedPayroll)}, already included in labour costs.`)}</p></section>`;
}
function operationsReport(rep){
  if(!rep.operations?.length&&!rep.facilityCompletions?.length&&!rep.crewCompletions?.length)return '';
  return `<section class="card operations-report"><h2>${tr('營運調度','Operations desk')}</h2>${(rep.crewCompletions||[]).map(o=>`<p class="construction-complete" data-crew-complete="${o.type}">✓ ${esc(pick(AIRCRAFT[o.type]))} ${tr('機組訓練完成，下期可以排班。','roster training complete. Available next turn.')}</p>`).join('')}${(rep.facilityCompletions||[]).map(id=>`<p class="construction-complete">✓ ${esc(pick(FACILITIES[id]))} ${tr('已完工，下期開始生效。','completed. Benefits start next turn.')}</p>`).join('')}${(rep.personnel||[]).map(c=>`<div data-personnel-type="${c.type}"><b>${esc(pick(AIRCRAFT[c.type]))} · ${tr('機組','Rosters')}</b><strong>${c.ready} / ${c.required}</strong><span>${tr('合格編制／班表需要','Qualified / needed')} · ${tr('固定薪資','Fixed payroll')} ${fmtUSD(c.payroll)}</span><small>${tr(`每週剩餘 ${fmtHours(c.remainingHours)} h，停飛仍需支付固定薪資。`,`${fmtHours(c.remainingHours)} h/wk remain; idle staff still receive fixed pay.`)}</small></div>`).join('')}${(rep.operations||[]).map(r=>`<div data-operation-type="${r.type}"><b>${esc(pick(AIRCRAFT[r.type]))}</b><span>${esc(pick(B.MAINTENANCE[r.policy]))} · ${tr('使用率','Utilisation')} ${fmtPct(r.utilisation,0)}</span><strong>${tr('狀態','Condition')} ${Math.round(r.condition)} → ${Math.round(r.nextCondition)}</strong><small>${r.cancel>0?tr(`技術停飛 ${fmtPct(r.cancel,1)}%；損失收入與旅客補償已計入航線損益。`,`Technical cancellations ${fmtPct(r.cancel,1)}; lost revenue and compensation are included in route profit.`):tr('無技術停飛；可用排班餘裕或加強保養恢復狀態。','No technical cancellations. Slack or extra care restores condition.')}</small></div>`).join('')}${!isOver(app.state)?`<button type="button" class="btn sec" id="result-fleet">${tr('機隊、機組與下期保養','Fleet, crew & next-turn care')} →</button>`:''}</section>`;
}
function fleetInventory(s){
  const flying=app.active?.start||planningState(),routes=app.active?.start.routes||draftRoutes(),need=B.fleetNeeded(flying,routes),have=fleetCounts(s);
  const types=Object.keys(have).filter(t=>have[t]>0).sort((a,b)=>have[b]-have[a]);
  const used=types.reduce((n,t)=>n+Math.min(have[t],need[t]||0),0),pending=s.fleetOrders||[];
  return `<section class="fleet-inventory" aria-label="${tr('我的現有機隊','My delivered fleet')}"><h2 class="fleet-heading">${tr(`我的機隊 · ${s.fleet.length} 架`,`My fleet · ${s.fleet.length} aircraft`)}</h2><div class="fleet-summary"><div><b data-fleet-total>${s.fleet.length}</b><small>${tr('已交機','Delivered')}</small></div><div><b data-fleet-used>${used}</b><small>${app.active?tr('本期使用','Flying this turn'):tr('班表占用','Scheduled')}</small></div><div><b data-fleet-idle>${s.fleet.length-used}</b><small>${tr('閒置','Idle')}</small></div><div><b data-fleet-pending>${pending.length}</b><small>${tr('待交機','On order')}</small></div></div><p class="hint">${app.active?tr('本期機隊與使用情況；下期班表另行規劃。','Current fleet and assignments; plan next turn separately.'):tr('同一機型的現有飛機、訂單與租購放在一起。','Aircraft, orders and lease or purchase controls are grouped by model.')}</p></section>`;
}
function renderFleet(){
  const s=app.state,d=app.draft,routes=draftRoutes(),need=needMap(B.fleetNeeded(planningState(),routes)),have=fleetCounts(s);
  const pending=s.fleetOrders||[],types=[...new Set([...modeOf(s.mode).types,...Object.keys(have)])].sort((a,b)=>(have[b]||0)-(have[a]||0)||pending.filter(o=>o.type===b).length-pending.filter(o=>o.type===a).length);
  const flying=app.active?.start||planningState(),availability=B.fleetAvailability(flying,app.active?.start.routes||routes);
  const order=fuelOrder({...s,routes,hedge:{...s.hedge,frac:d.hedge}}),limits=B.fleetLimits(s);
  const hedgePct=Math.round(d.hedge*100),hedgeOk=hedgeAllowed(s),hasTank=planningState().facilities?.tank;
  $('#pscroll').innerHTML=`${fleetInventory(s)}${logisticsBoard(s)}<div id="fleetmsg" role="status" class="hint"></div><div class="fleet-cards">${types.map(t=>{
      const a=AIRCRAFT[t],n=need[t]||0,h=have[t]||0,q=B.aircraftQuote(s,t),buy=B.aircraftQuote(s,t,'own'),fast=B.aircraftQuote(s,t,'lease',true);
      const spare=Math.max(0,h-Math.max(n,B.fleetNeeded(s,s.routes)[t]||0)),leased=s.fleet.filter(a=>a.type===t&&a.kind==='lease').length,owned=h-leased;
      const returnQuote=s.fleet.find(a=>a.type===t&&a.kind==='lease');
      const returnFee=returnQuote?B.leaseReturnQuote(s,returnQuote).fee:0;
      const closed=app.active||!modeOf(s.mode).types.includes(t)||limits.ordersLeft<1||limits.committed>=limits.maxFleet||s.turn>=modeOf(s.mode).turns-1;
      const space=availability[t],waiting=pending.filter(o=>o.type===t);
      return `<article class="fleet-card fleet-order-card fleet-integrated" data-fleet-model="${t}" ${h?`data-fleet-type="${t}"`:''}><header>${aircraftArt(t)}<div><h3>${esc(pick(a))}</h3><small>${tr(`租賃 ${leased} 架 · 自有 ${owned} 架`,`Leased ${leased} · owned ${owned}`)}</small></div><strong data-fleet-count>${h}<small>${tr('現有架數','in fleet')}</small></strong></header><div class="fleet-status"><span>${app.active?tr('本期使用','Flying'):tr('已排班','Scheduled')} <b>${space.scheduled}</b></span><span>${tr('未排班','Unassigned')} <b>${space.unassigned}</b></span><span>${tr('待交機','On order')} <b>${waiting.length}</b></span></div><small class="fleet-spare-hours">${tr(`剩餘 ${fmtHours(space.remainingHours)} / ${fmtHours(space.totalHours)} h／週`,`Remaining ${fmtHours(space.remainingHours)} / ${fmtHours(space.totalHours)} h/wk`)}</small>${aircraftStats(t,flying.model)}${h?fleetCare(t):''}${personnelCard(t)}${leaseContracts(s,t)}<small>${tr('新租月租','New lease/mo')} ${fmtUSD(q.rate)} · ${tr('押金','Deposit')} ${fmtUSD(q.upfront)}</small><small class="order-terms">${tr(`標準租約承諾 ${q.leaseMonths} 個月；加急租約 3 個月。`,`Standard lease commitment ${q.leaseMonths} months; express 3 months.`)} ${q.deliveryTurns>1?tr(`加急：首付 ${fmtUSD(fast.upfront)}，月租 ${fmtUSD(fast.rate)}（+20%）；含不退手續費 ${fmtUSD(fast.bookingFee)}。`,`Express: upfront ${fmtUSD(fast.upfront)}, rent ${fmtUSD(fast.rate)}/mo (+20%); includes non-refundable ${fmtUSD(fast.bookingFee)} fee.`):tr('此機型標準租賃已是最快交機方案。','The standard lease is already the fastest delivery for this type.')}${modeOf(s.mode).buy?' '+tr(`購買頭期 ${fmtUSD(buy.upfront)}，其餘貸款。`,`Purchase down payment ${fmtUSD(buy.upfront)}; balance financed.`):''}</small><div class="fleet-actions"><button type="button" class="btn sec" data-lease="${t}" ${closed||q.readyTurn>=modeOf(s.mode).turns||s.cash<q.upfront?'disabled':''}>${tr('租 1 架','Lease 1')} · ${waitLabel(s,q.deliveryTurns)}</button><button type="button" class="btn sec" data-express="${t}" ${closed||q.deliveryTurns===1||fast.readyTurn>=modeOf(s.mode).turns||s.cash<fast.upfront?'disabled':''}>${q.deliveryTurns===1?tr('無需加急','No express needed'):tr('加急租 1 架','Express lease')} · ${waitLabel(s,1)}</button>${modeOf(s.mode).buy?`<button type="button" class="btn sec" data-buy="${t}" ${closed||buy.readyTurn>=modeOf(s.mode).turns||s.cash<buy.upfront?'disabled':''}>${tr('買 1 架','Buy 1')} · ${waitLabel(s,buy.deliveryTurns)}</button>`:''}<button type="button" class="ghost" data-return="${t}" ${app.active||!spare||!leased?'disabled':''}>${tr('退租 1 架','Return 1')} · ${fmtUSD(returnFee)}</button>${owned?`<button type="button" class="ghost" data-sell="${t}" ${app.active||!spare?'disabled':''}>${tr('出售 1 架','Sell 1')}</button>`:''}</div>${waiting.length?`<div class="fleet-model-orders">${waiting.map(o=>`<div class="fleet-pending"><div><b>${tr('待交機','On order')} · ${waitLabel(s,Math.max(0,o.readyTurn-s.turn))}</b><small>${o.kind==='own'?tr('購買','Purchase'):tr('租賃','Lease')} · ${tr('已付','Paid')} ${fmtUSD(o.upfront)}</small><small>${tr('到期','Due')} ${esc(turnLabel(s,o.readyTurn))} · ${tr('取消可退','Cancel refund')} ${fmtUSD(o.upfront-(o.bookingFee||0)-(o.cancelFee||0))}</small></div><button type="button" class="ghost" data-cancel-order="${o.id}" ${app.active?'disabled':''}>${tr('取消','Cancel')}</button></div>`).join('')}</div>`:''}</article>`;
    }).join('')}</div><button type="button" class="aircraft-guide-link" id="aircraft-guide">✈ ${tr('機型圖鑑','Aircraft guide')}<small>${tr('比較航程與座位','Compare range & seats')} →</small></button><div class="callout fleet-limits"><b>${tr(`機隊容量 ${limits.committed}/${limits.maxFleet} 架（含待交機） · 航點 ${routes.length}/${limits.maxRoutes}`,`Fleet capacity ${limits.committed}/${limits.maxFleet} (including orders) · destinations ${routes.length}/${limits.maxRoutes}`)}</b><p>${tr(`本回合還能訂 ${limits.ordersLeft} 架 / 上限 ${limits.ordersPerTurn} 架`,`Orders left this turn: ${limits.ordersLeft} / ${limits.ordersPerTurn}`)}</p></div><p class="hint">${app.active?tr('本期營運中，結算後才能訂機或退租；可先規劃下期班表。','Operations are running. Order or retire aircraft after settlement; plan next-turn schedules now.'):tr('先付押金或頭期款，依方案等待交機。加急租賃較快但月租高；待交機尚無運能，閒置飛機照付租金。','Pay the deposit or down payment, then wait for delivery. Express leases arrive faster with higher rent. Pending aircraft add no capacity; idle aircraft still cost rent.')}</p><p class="hint">${tr('退租會退回押金；解約費取剩餘承諾租金的 25% 與 2 個月租金較高者，於下次營運扣款。新租約到期後續租按月計費，可免解約費退租；創業與舊合約保留原 2 個月費用。新訂單取消扣押金或頭期款的 15%，加急手續費不退；本回合額度不返還。維修基地完工後才擴容。以上為遊戲規則。','Returns refund the deposit; the higher of 25% of remaining contracted rent or two months’ rent is charged at the next operation. New leases continue monthly after commitment expires and can then be returned without a termination fee; starter and legacy terms retain their two-month fee. New order cancellations forfeit 15% of the deposit or down payment and any express fee; quota is not restored. Depot capacity opens only after construction. These are game rules.')}</p>
    ${isSeasonMode(s.mode)?`<div class="psec"><h3>${tr('經營模式','Business model')}</h3><div class="seg"><button type="button" data-bm="fsc" aria-pressed="${d.businessModel==='fsc'}">${tr('全服務','Full-service')}</button><button type="button" data-bm="lcc" aria-pressed="${d.businessModel==='lcc'}">${tr('廉價航空','Low-cost')}</button></div><p class="hint">${tr('廉航增加座位、降低成本，另收行李與餐飲費。中途轉型需要改裝費。','Low-cost adds seats, cuts cost and charges for bags and meals. Switching needs a refit.')}</p></div>`:''}
    <div class="fuel-market psec"><div class="section-eyebrow">${tr('燃油市場','FUEL MARKET')}</div><div class="fuel-price"><b>×${s.fuelSpot.toFixed(2)}</b><span>${tr('相對基準油價','relative to baseline')}</span></div><h3>${term('避險',tr('鎖定燃油價格','Lock fuel prices'))}<b id="hedgeval">${hedgePct}%</b></h3><input type="range" id="hedge" min="0" max="100" step="10" value="${hedgePct}" ${hedgeOk?'':'disabled'} aria-label="${tr('避險比例','Hedge share')}"><p class="hint">${hedgeOk?tr('鎖價要付保費。油價漲了少賠，跌了也少賺。','Locking has a premium. It protects against rises but limits gains from falls.'):tr(`第 ${modeOf(s.mode).hedgeFromTurn+1} 個月起開放避險。`,`Hedging opens in month ${modeOf(s.mode).hedgeFromTurn+1}.`)}</p>
    ${hasTank?`<div class="fuel-reserve"><b>${tr('儲油','Fuel in storage')} ${fmtNum((s.reserve?.kg||0)/1000)} t</b><p class="hint">${tr('本次預購','This order')} ${fmtNum(order.kg/1000)} t · ${esc(fmtUSD(order.cost))}</p><button type="button" class="btn sec block" id="buy-fuel" ${s.reserve?.kg>1||!routes.length?'disabled':''}>${d.buyFuel?tr('取消預購','Cancel order'):tr('預購 3 個月燃油','Prebuy 3 months')}</button><p class="hint">${tr('預購未避險部分的 30%，費用在下一次開始營運時扣除。','Prebuy 30% of unhedged fuel; cash is charged at the next start.')}</p></div>`:''}</div>`;
  $('#aircraft-guide').onclick=aircraftGuide;
  $$('[data-hire]').forEach(b=>b.onclick=()=>commitPersonnel({hire:{[b.dataset.hire]:1}}));
  $$('[data-release-crew]').forEach(b=>b.onclick=()=>commitPersonnel({release:{[b.dataset.releaseCrew]:1}}));
  $$('[data-cancel-crew]').forEach(b=>b.onclick=()=>commitPersonnel({cancelOrders:[Number(b.dataset.cancelCrew)]}));
  $$('[data-lease]').forEach(b=>b.onclick=()=>commitFleet({lease:{[b.dataset.lease]:1}}));
  $$('[data-express]').forEach(b=>b.onclick=()=>commitFleet({expressLease:{[b.dataset.express]:1}}));
  $$('[data-care]').forEach(b=>b.onclick=()=>{const type=b.dataset.care,policy=b.dataset.policy,trial={...planningState(),maintenance:{...(d.maintenance||{}),[type]:policy}};if(!B.routeCapacity(trial,routes).fits){$('#fleetmsg').textContent=tr('加強保養需預留時數，請先減班或換機型。','Extra care needs reserved hours. Reduce flights or change aircraft first.');return;}d.maintenance=trial.maintenance;renderPanel();refreshMap();});
  $$('[data-buy]').forEach(b=>b.onclick=()=>commitFleet({buy:{[b.dataset.buy]:1}}));
  $$('[data-return]').forEach(b=>b.onclick=()=>commitFleet({returnLease:{[b.dataset.return]:1}}));
  $$('[data-sell]').forEach(b=>b.onclick=()=>commitFleet({sell:{[b.dataset.sell]:1}}));
  $$('[data-cancel-order]').forEach(b=>b.onclick=()=>commitFleet({cancelOrders:[Number(b.dataset.cancelOrder)]}));
  $$('[data-bm]').forEach(b=>b.onclick=()=>{d.businessModel=b.dataset.bm;if('b-model' in d.eventChoices)d.eventChoices['b-model']=b.dataset.bm;renderPanel();});
  $('#hedge').oninput=()=>{d.hedge=Number($('#hedge').value)/100;$('#hedgeval').textContent=`${$('#hedge').value}%`;saveGame();};
  $('#buy-fuel')?.addEventListener('click',()=>{d.buyFuel=!d.buyFuel;renderPanel();});
}
function renderFacilities(){
  $('#pscroll').innerHTML=`<div class="section-eyebrow">${app.state.hub} / ${tr('基地建設','CONSTRUCTION')}</div><h2 class="panel-intro">${tr('擴建你的機場。','Grow your airport.')}</h2><p class="hint">${tr('點場景裡的建築，也能查看設施。興建先付現金，每期另有營運費與折舊。','Buildings in the world open these controls. Construction costs cash; running costs and depreciation recur.')}</p><div class="facility-list">${Object.entries(FACILITIES).map(([id,f])=>facilityCard(id,f)).join('')}</div>`;bindFacilities($('#pscroll'));
}
function facilityCard(id,f){
  const s=planningState(),built=!!s.facilities?.[id],order=s.facilityOrders?.find(o=>o.id===id),queued=app.draft.facilities.has(id),q=B.facilityQuote(s,id),late=q.readyTurn>=modeOf(s.mode).turns;
  return `<article class="facility-card ${built?'built':order||queued?'queued':''}">${facilityArt(id)}<div class="facility-title"><h3>${esc(pick(f))}</h3><span>${built?tr('已啟用','ACTIVE'):order?tr('施工中','BUILDING'):queued?tr('已排定','PLANNED'):esc(fmtUSD(f.cost))}</span></div><b class="facility-effect">${esc(pick(f,'effectZh','effectEn'))}</b><p>${esc(pick(f,'lessonZh','lessonEn'))}</p><small>${order?tr('距離完工','Until completion'):tr('施工時間','Build time')} ${waitLabel(s,order?Math.max(0,order.readyTurn-s.turn):q.constructionTurns)} · ${tr('完工後才生效並計營運費與折舊。','Benefits, running costs and depreciation start after completion.')}</small><small>${tr('每月營運費','Running cost/mo')} ${fmtUSD(f.monthly)} · ${tr('折舊','Depreciation')} ${f.years} ${tr('年','years')}</small><button type="button" class="btn sec block" data-facility="${id}" ${built||order||late?'disabled':''}>${built?'✓ '+tr('營運中','Operating'):order?tr('等待完工','Awaiting completion'):late?tr('來不及完工','Too late to complete'):queued?tr('取消興建','Cancel build'):tr('興建','Build')}</button></article>`;
}
function bindFacilities(root,after){$$('[data-facility]',root).forEach(b=>b.onclick=()=>{const id=b.dataset.facility;if(app.draft.facilities.has(id))app.draft.facilities.delete(id);else app.draft.facilities.add(id);renderPanel();refreshMap();after?.(id);});}
function showHub(id){
  if(!FACILITIES[id])return;setWorld('airport');app.tab='hub';app.city=null;app.panelOpen=true;syncPanelMin();app.map?.focus(id);
  $('#pscroll').innerHTML=`<div class="section-eyebrow">${app.state.hub} / ${tr('基地設施','AIRPORT FACILITY')}</div>${facilityCard(id,FACILITIES[id])}<p class="hint">${app.active?tr('下一期開工，先付建設費；完工後才啟用。','Construction begins next turn. Pay upfront; benefits start after completion.'):tr('開始營運時開工，先扣建設費；施工期間尚無效果。','Construction starts with operations. Capital is charged upfront; no benefit while building.')}</p><button type="button" class="ghost block" id="all-facilities">${tr('查看全部設施','All facilities')} →</button>`;$('#pfoot').innerHTML=`<button type="button" class="btn block" id="facility-done">${tr('返回機場','Back to airport')} ✓</button>`;$('#facility-done').onclick=closePanel;$('#all-facilities').onclick=()=>openPanel('hub');bindFacilities($('#pscroll'),showHub);saveGame();
}
let toastTimer;
function routeOpened(r){
  const box=$('#mapbox');if(!box)return;clearTimeout(toastTimer);box.querySelector('.route-toast')?.remove();
  const toast=document.createElement('div');toast.className='route-toast';toast.setAttribute('role','status');toast.innerHTML=`<span class="toast-plane">✈</span><div><small>${app.active?tr('已加入下期班表','ADDED TO NEXT TURN'):tr('新航線準備完成','NEW ROUTE READY')}</small><b>${app.state.hub} → ${r.city}</b><p>${esc(pick(AIRCRAFT[r.type]))} · ${tr(`每週 ${r.weekly} 班`,`${r.weekly}/wk`)}</p></div><span class="toast-stamp">✓</span>`;box.append(toast);toastTimer=setTimeout(()=>toast.remove(),3500);
}

const fareName = (f) => ({ low: tr('低價', 'Low'), mid: tr('中價', 'Mid'), high: tr('高價', 'High') }[f] || f);

/* ----- route panel ----- */
/** Default aircraft for a new route: never a widebody when a narrower type can fly it; among those, the type the model's own
 *  estimate says fits the market best at a normal frequency (7/week). Widebody-only routes start at a lower frequency. */
function defaultChoice(city) {
  const s = app.state, o = B.routeOptions(planningState(), city), el = o.eligibleTypes;
  if(!el.length)return {type:null,weekly:3,note:tr('此模式沒有航程足夠的機型。','No aircraft in this mode has enough range.')};
  const ready = el.filter(t => B.routeCapacity(planningState(),draftRoutes().concat({city,type:t,weekly:1,fare:'mid'})).fits), available = ready.length ? ready : el;
  const narrow = available.filter((t) => !AIRCRAFT[t].widebody), pool = narrow.length ? narrow : available;
  const est = (t, w) => { try { return B.estimateRoute(planningState(), city, t, w, 'mid')?.profit ?? -Infinity; } catch { return -Infinity; } };
  const asc = [...pool].sort((a, b) => seatsOf(a) - seatsOf(b));
  const choices = asc.map(type => [1,2,3,4,5,7,10,14].filter(w=>w<=o.maxWeekly&&(!ready.length||B.routeCapacity(planningState(),draftRoutes().concat({city,type,weekly:w,fare:'mid'})).fits)).map(weekly=>({type,weekly,profit:est(type,weekly)})).sort((a,b)=>b.profit-a.profit)[0]);
  const ps = choices.map(x=>x.profit), top = Math.max(...ps), tol = Math.max(0.1 * Math.abs(top), 30000);
  const type = asc[ps.findIndex((p) => p >= top - tol)] || asc[0];   // smallest type within 10% of the best estimate
  const weekly = choices.find(x=>x.type===type).weekly;
  const wide = el.some((t) => AIRCRAFT[t].widebody), small = pool.length > 1 || (pool.length === 1 && wide && narrow.length);
  const note = !narrow.length ? tr('這個距離只有寬體機飛得到，先從較少的班次開始。', 'Only widebodies reach this far, so it starts with fewer flights.')
    : wide ? tr('預設用能飛到、又和市場大小合得來的最小機型。寬體機座位多、租金貴，這個距離用不到。', 'Default: the smallest type that fits this market. A widebody is too big and costly for this distance.')
    : small ? tr('預設用能飛到、又和市場大小合得來的機型。想坐滿就換小一點的，想多載就換大一點的。', 'Default: the type that best fits this market size. Go smaller to fill seats, bigger to carry more.') : '';
  return { type, weekly: Math.min(weekly, o.maxWeekly || 28), note };
}
function renderRoutePanel() {
  const s = app.state, city = app.city, c = CITIES[city], o = B.routeOptions(planningState(), city);
  const open = app.draft.routes.has(city);
  if (!open && !app.tmp) { const d = defaultChoice(city); app.tmp = { city, type: d.type, weekly: d.weekly, fare: 'mid', defType: d.type, note: d.note }; }
  const r = { ...(open ? app.draft.routes.get(city) : app.tmp) };
  if (!o.eligibleTypes.includes(r.type)) r.type = o.eligibleTypes[0];
  const others = draftRoutes().filter(x => x.city !== city), routes = others.concat(r);
  const capacity = B.routeCapacity(planningState(),routes), plusFits = B.routeCapacity(planningState(),others.concat({...r,weekly:r.weekly+1})).fits;
  const available=B.fleetAvailability(planningState(),others),after=B.fleetAvailability(planningState(),routes)[r.type];
  const need = needMap(B.fleetNeeded(planningState(), routes)), have = fleetCounts(planningState());
  const activeRoute=app.active?.report.routes.find(x=>x.city===city);
  const ac = AIRCRAFT[r.type];
  const bh = o.blockHoursByType?.[r.type] ?? o.blockHours, hrsWeek = r.weekly * 2 * bh;
  const acOpts = o.eligibleTypes.length ? o.eligibleTypes.map((t) => { const a = AIRCRAFT[t],space=available[t],fits=B.routeCapacity(planningState(),others.concat({...r,type:t,weekly:1})).fits; return `
    <button type="button" class="ac-opt" role="radio" aria-checked="${r.type === t}" data-type="${esc(t)}" ${open&&!fits?'disabled':''}>${aircraftArt(t)}<div class="t"><b>${esc(pick(a))}</b>${aircraftStats(t,bizModel())}<small>${tr(`未排班 ${space.unassigned} 架／現有 ${space.delivered} 架 · 可用 ${fmtHours(space.remainingHours)} h／週`,`${space.unassigned} unassigned / ${space.delivered} available · ${fmtHours(space.remainingHours)} h/wk left`)}${open&&!fits?' · '+tr('運能不足','No spare capacity'):''}</small><small>${tr(`租金約 ${fmtUSD(a.leasePerMonth)}／月`, `Lease ≈ ${fmtUSD(a.leasePerMonth)}/mo`)}</small></div></button>`; }).join('') : `<div class="callout warn">${tr('目前沒有任何機型飛得到這麼遠。', 'No aircraft type can fly this far.')}</div>`;
  $('#pscroll').innerHTML = `
    <button type="button" class="back-sm" id="back">‹ ${tr('回總覽', 'Overview')}</button>
    <h2 class="route-planning-heading">${esc(pick(hubOf(s.hub)))} → ${esc(pick(c))} <small class="hint">${esc(pick(c, 'en', 'zh'))}</small></h2>
    ${dispatchCapacity(others,city,r)}
    <p class="decision-timing">${app.active?tr('修改下期航線，本期班表已確定。','Planning next turn; the current schedule is fixed.'):tr('先看估計損益，再決定班表。','Review estimated profit before setting the schedule.')}</p>
    ${readCareer(s).active?.city===city?`<div class="mission-route-note">⚑ <b>${esc(missionTitle(readCareer(s).active))}</b><span>${tr(`剩 ${Math.max(0,readCareer(s).active.deadline-s.turn)} 回合 · 完成可獲 ${readCareer(s).active.xp} 成長值`,`${Math.max(0,readCareer(s).active.deadline-s.turn)} turns left · ${readCareer(s).active.xp} XP reward`)}</span></div>`:''}
    ${activeRoute?`<div class="active-route-note"><small>${tr('本期營運','CURRENT OPERATIONS')}</small><b>${activeRoute.profit>=0?'+':''}${esc(fmtUSD(activeRoute.profit))}</b><p>${esc(pick(activeRoute,'reasonZh','reasonEn'))}</p></div>`:''}
    ${c.blurbZh ? `<p class="hint">${esc(pick(c, 'blurbZh', 'blurbEn'))}</p>` : ''}
    <div class="psec"><div class="kv three"><div><small>${tr('距離', 'Distance')}</small><b>${fmtNum(o.distanceKm)} km</b></div><div><small>${tr('單程飛行', 'Block time')}</small><b>${(o.blockHoursByType?.[r.type] ?? o.blockHours).toFixed(1)} h</b></div><div><small>${tr('每週市場', 'Market/wk')}</small><b>${fmtNum(o.estMarketPaxPerWeek)}</b></div></div>
      ${marketNote(o)}<p class="hint" style="margin-top:6px">${tr('其他航空每週座位', 'Other airlines’ seats/week')}：<b>${fmtNum(o.otherSeatsPerWeek)}</b> · ${tr('你的每週座位', 'Your seats/week')}：<b id="your-seats">${fmtNum(2*r.weekly*seatsOf(r.type))}</b>。${tr('增班會分走客人；其他航空在後續回合逐步調整運力。','More flights split demand; other airlines adjust capacity in later turns.')} ${o.rivalsOnRoute ? `<span class="pill warn">${tr(`${o.rivalsOnRoute} 家主要對手`, `${o.rivalsOnRoute} named rival(s)`)}</span>` : ''} ${o.slotLimited ? `<span class="pill warn">${tr('機場時段有限', 'Slot-limited')}</span>` : ''}</p></div>
    <div class="psec"><h3><span>${tr('機型', 'Aircraft')}</span><button type="button" class="ghost" id="aircraft-guide">${tr('比較全部機型','Compare all aircraft')}</button></h3>${rangeComparison(r.type,o.distanceKm,!!r.type&&o.eligibleTypes.includes(r.type))}${!open && r.note && r.type === r.defType ? `<p class="hint" style="margin-bottom:6px">${esc(r.note)}</p>` : ''}<div role="radiogroup" aria-label="${tr('機型', 'Aircraft')}">${acOpts}</div></div>
    <div class="psec"><h3><span>${term('週班次', tr('每週班次', 'Flights per week'))}</span><span class="hint">${tr('一班＝來回一趟', 'one = one round trip')}</span></h3>
      <div class="stepper"><button type="button" id="wm" aria-label="${tr('減少班次', 'Fewer')}" ${r.weekly <= 1 ? 'disabled' : ''}>−</button><output id="wv" aria-live="polite">${r.weekly}</output><button type="button" id="wp" aria-label="${tr('增加班次', 'More')}" ${r.weekly >= (o.maxWeekly || 28) || !plusFits ? 'disabled' : ''}>＋</button><small>${tr(`每週約 ${fmtNum(r.weekly * 2 * seatsOf(r.type))} 個單程座位`, `≈ ${fmtNum(r.weekly * 2 * seatsOf(r.type))} one-way seats/wk`)}</small></div></div>
    <div class="psec"><h3><span>${tr('票價水準', 'Fare level')}</span></h3><div class="seg" role="group" aria-label="${tr('票價水準', 'Fare level')}">${['low', 'mid', 'high'].map((f) => `<button type="button" class="fare-btn" aria-pressed="${r.fare === f}" data-fare="${f}"><b>${esc(fareName(f))}</b><small>${esc(fmtFare(o.refFare[f]))}</small></button>`).join('')}</div>
      <p class="hint" style="margin-top:6px">${tr('價格低，客人多但每人賺得少。價格高，客人少。', 'Lower fares fill seats but earn less per passenger.')}</p></div>
    <div class="psec"><div class="callout">${tr(`這條航線每週飛行約 ${hrsWeek.toFixed(0)} 小時，全公司需要 ${esc(pick(ac))} ${need[r.type] ?? '—'} 架，目前有 ${have[r.type] || 0} 架。`, `About ${hrsWeek.toFixed(0)} block hours/week. Fleet need: ${need[r.type] ?? '—'} × ${esc(pick(ac))}, you own ${have[r.type] || 0}.`)}</div></div>
    ${!capacity.fits?`<div class="callout warn" id="route-capacity">${capacity.routeLimit?tr(`航點容量已滿（${B.fleetLimits(planningState()).maxRoutes} 個），請關閉航線或興建維修基地。`,`Destination capacity is full (${B.fleetLimits(planningState()).maxRoutes}). Close a route or build a depot.`):capacity.slotsExhausted?tr('基地起降時段已滿，請減少其他航線的班次。','Hub slots are full. Reduce frequency on other routes.'):!Object.keys(capacity.missing).length&&Object.keys(capacity.crewMissing).length?tr('合格機組不足，請到機隊招募並等待訓練完成，或減少班次。','Not enough qualified rosters. Recruit in Fleet and wait for training, or reduce flights.'):tr('機隊運能不足，請減少班次、調整其他航線，或先訂機並等待交付。','Insufficient aircraft hours. Reduce frequency, adjust other routes, or order aircraft and wait for delivery.')}</div>`:''}<button type="button" class="ghost block" id="route-fleet">${tr('前往機隊訂機或查看運能','Order aircraft or check capacity')} →</button><div class="psec" id="estbox"></div>`;
  $('#pfoot').innerHTML = open
    ? `<div style="display:flex;gap:10px"><button type="button" class="btn block" id="done">${tr('完成', 'Done')}</button><button type="button" class="btn sec" id="close">${tr('關閉航線', 'Close route')}</button></div>`
    : `<button type="button" class="btn block" id="open" ${o.eligibleTypes.length && capacity.fits ? '' : 'disabled'}>${capacity.fits?tr('開這條航線','Open this route'):capacity.routeLimit?tr('航點容量已滿','Destination capacity full'):capacity.slotsExhausted?tr('基地時段已滿','Hub slots full'):!Object.keys(capacity.missing).length&&Object.keys(capacity.crewMissing).length?tr('合格機組不足','Qualified crew shortage'):tr('機隊運能不足','Insufficient aircraft capacity')}</button>`;
  if(after)$('#pfoot').insertAdjacentHTML('afterbegin',`<p class="route-space-footer ${after.missing?'shortage':''}">${after.missing?tr(`機隊還缺 ${after.missing} 架`,`${after.missing} more aircraft needed`):tr(`排入後剩 ${fmtHours(after.remainingHours)} h／週 · 未排班 ${after.unassigned} 架`,`${fmtHours(after.remainingHours)} h/wk left after scheduling · ${after.unassigned} unassigned`)}</p>`);
  const upd = next => {
    if (open) {
      while (next.weekly>1 && !B.routeCapacity(planningState(),others.concat(next)).fits) next.weekly--;
      if (!B.routeCapacity(planningState(),others.concat(next)).fits) return;
      app.draft.routes.set(city,next); refreshMap();
    } else app.tmp=next;
    renderRoutePanel(); saveGame();
  };
  $('#back').onclick = () => { app.city = null; app.tmp = null; refreshMap(); renderPanel(); };
  $$('[data-type]').forEach(b => b.onclick = () => upd({...r,type:b.dataset.type}));
  $('#wm').onclick = () => upd({...r,weekly:Math.max(1,r.weekly-1)});
  $('#wp').onclick = () => upd({...r,weekly:Math.min(o.maxWeekly||28,r.weekly+1)});
  $$('[data-fare]').forEach(b => b.onclick = () => upd({...r,fare:b.dataset.fare}));
  $('#route-fleet')?.addEventListener('click',()=>openPanel('fleet'));
  if (open) { $('#done').onclick = $('#back').onclick; $('#close').onclick = () => { app.draft.routes.delete(city); app.city = null; refreshMap(); renderPanel(); renderHud(); }; }
  else $('#open')?.addEventListener('click', () => { if(!B.routeCapacity(planningState(),others.concat(r)).fits)return; app.draft.routes.set(city, { city: r.city, type: r.type, weekly: r.weekly, fare: r.fare }); app.tmp = null; app.city = null; refreshMap(); renderPanel(); renderHud(); routeOpened(r); });
  $('#aircraft-guide').onclick=aircraftGuide;
  renderEstimate(r);
}
/** Dry run of the real model for this route under current conditions. Skipped quietly if the model cannot run it. */
function marketNote(o) {
  const m = o.market;
  if (m.kind === 'estimated') return `<p class="hint" data-market-kind="estimated">${tr('估算市場：每週雙向航段旅客，由官方航線客量校準。這組航點沒有實測資料，誤差可能較大；不代表已有直飛航班。','Estimated weekly flight-leg passengers in both directions, fitted to official traffic. This pair has no observations and may differ substantially; it does not imply an existing nonstop service.')}</p>`;
  const src = B.DEMAND_SOURCES[m.source];
  return `<p class="hint" data-market-kind="observed"><a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(pick(src))} ${m.year}</a> · ${tr('全年雙向旅客','Annual passengers, both directions')} ${fmtNum(m.annualPax)}${m.historicalLF!=null?` · ${tr('歷史載客率','Historical load')} ${fmtPct(m.historicalLF,0)}`:''}。${tr('每週市場含兩個方向，會隨季節與事件變化；歷史載客率不等於你的預估。','Weekly demand includes both directions and changes with seasons and events; historical load is not your forecast.')}${m.capacityEstimated?tr('座位數另行估算。','Seat capacity is estimated separately.'):''}</p>`;
}
function renderEstimate(r) {
  const own = $('#your-seats'); if (own && r.type) own.textContent = fmtNum(2*r.weekly*seatsOf(r.type));
  const box = $('#estbox'); if (!box) return;
  let e = null;
  try { e = B.estimateRoute ? B.estimateRoute(planningState(), r.city, r.type, r.weekly, r.fare) : null; } catch { e = null; }
  if (!e) { box.innerHTML = ''; return; }
  const ok = e.profit >= 0, be = e.revenue > 0 ? Math.min(1.5, e.lf * e.cost / e.revenue) : null;
  box.innerHTML = `<div class="est"><div class="lfrow"><span>${tr('載客率','Load')}</span>${lfBar(e.lf,be,e.lf<be)}<b>${fmtPct(e.lf,0)}</b></div><b>${tr('預估', 'Estimate')}</b>：${term('載客率')} <b>${fmtPct(e.lf, 0)}</b>${be != null ? `（${tr('損益平衡', 'break-even')} ${fmtPct(be, 0)}）` : ''} · ${tr(`${turnWord(app.state)}損益`, 'profit')} <b style="color:${ok ? 'var(--good)' : 'var(--warn)'}">${esc(fmtUSD(e.profit))}</b>
    <p class="hint" style="margin-top:4px">${tr('依本期供需估算穩定客量，首航還有客源累積期。飛機成本按使用比例攤；轉機客、未來事件、設施固定費和下回合的對手調整不在內。', 'Steady demand at current market conditions; new routes still ramp up. Aircraft costs are pro rata; transfers, future events, fixed facility costs and next-turn rival changes are excluded.')}</p></div>`;
}

/* ----- events ----- */
function overlay(html, { label, dismiss = true } = {}) {
  const ov = $('#overlay'); ov.hidden = false; ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(label || '')}" tabindex="-1">${html}</div>`;
  const m = $('.modal', ov); (m.querySelector('button') || m).focus();
  ov.onkeydown = (e) => { if (e.key === 'Escape' && dismiss) closeOverlay(); if (e.key === 'Tab') { const f = $$('button,[href],input,select', m).filter(el=>!el.disabled&&el.getClientRects().length); if (!f.length) return; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } };
  if (dismiss) ov.onclick = (e) => { if (e.target === ov) closeOverlay(); }; else ov.onclick = null;
  return m;
}
function closeOverlay() { const ov = $('#overlay'); if (ov) { ov.hidden = true; ov.innerHTML = ''; } }
function askEvents(queue) {
  const ev = queue[0];
  const body = pick(ev, 'bodyZh', 'bodyEn') || pick(LESSONS[ev.lesson], 'explainZh', 'explainEn');
  const m = overlay(`<div class="kick">${tr('本回合要決定', 'A DECISION')}</div><h2>${esc(pick(ev))}</h2>${body ? `<p class="body">${withTerms(body)}</p>` : ''}
    <div class="opts">${(ev.options || []).map((o) => `<button type="button" class="opt" data-opt="${esc(o.id)}"><b>${esc(pick(o))}</b>${pick(o, 'hintZh', 'hintEn') ? `<small>${esc(pick(o, 'hintZh', 'hintEn'))}</small>` : ''}</button>`).join('')}</div>`, { label: pick(ev), dismiss: false });
  m.classList.add('event-dialog');
  $$('[data-opt]', m).forEach((b) => b.addEventListener('click', () => {
    app.draft.eventChoices[ev.id] = b.dataset.opt; closeOverlay();
    if(ev.id==='a-model'||ev.id==='b-model')app.draft.businessModel=b.dataset.opt;
    if (queue.length > 1) askEvents(queue.slice(1)); else renderPanel();
  }));
}

/* ----- run turn ----- */
function runTurn(immediate = false) {
  const s=app.state,msg=$('#runmsg');
  const pend=(B.pendingEvents(s)||[]).filter(e=>!(e.id in app.draft.eventChoices));
  if(pend.length){askEvents(pend);return;}
  const res=B.applyDecisions(s,buildDecisions());
  if(res.errors.length){if(msg)msg.innerHTML=res.errors.map(e=>`<span style="color:var(--warn)">${esc(pick(e))}</span>`).join('<br>');if($('#world-runmsg'))$('#world-runmsg').textContent=res.errors.map(e=>pick(e)).join(' · ');return;}
  if($('#world-runmsg'))$('#world-runmsg').textContent='';
  const out=B.simulateTurn(res.state);
  app.active={start:res.state,state:out.state,report:out.report,turn:s.turn};
  app.state=res.state;app.clock={...newClock(),speed:app.clock.speed,running:true};
  initDraft();app.draft.forTurn=s.turn;app.draft.forNext=true;
  refreshMap();renderHud();renderPanel();syncClock();saveGame();if(!immediate)closePanel();
  if(immediate)settleTurn();
}
function settleTurn(){
  if(!app.active)return;
  const active=app.active,queued=app.draft;
  app.state=active.state;app.report=active.report;app.reportTurn=active.turn;app.lastMargin=active.report.company.margin;
  app.reportPlans={};
  app.state.career=readCareer(app.state);syncPassport();
  app.active=null;app.clock=newClock();
  app.draft=queued;app.draft.forTurn=app.state.turn;app.draft.forNext=false;app.draft.eventChoices={};
  saveGame();go('results');
  if(app.report.deliveries?.length)showAircraftDelivery();
}
function togglePlayback(){if(!app.active){runTurn();return;}app.clock.running=!app.clock.running;syncClock();syncWorldRun();if(!app.city)renderRunButton();saveGame();}
function syncClock(){
  if(!$('#clock-day'))return;syncWorldRun();
  const frac=app.clock.elapsed/turnSeconds(app.state.mode),day=1+Math.floor(frac*(isSeasonMode(app.state.mode)?179:29));
  $('#clock-day').textContent=app.active?tr(`${isSeasonMode(app.state.mode)?'季內':'月內'}第 ${day} 天`, `Day ${day} of ${isSeasonMode(app.state.mode)?'season':'month'}`):tr('規劃中','Planning');
  $('#clock-status').textContent=app.active?(app.clock.running?tr('航班自動營運','Automatic departures'):tr('已暫停','Paused')):tr(`${turnSeconds(app.state.mode)} 秒跑完本期，可直接結算。`,`${turnSeconds(app.state.mode)} seconds per turn. Settlement can be skipped to.`);
  const delivery=$('#mission-delivery'),mission=readCareer(app.state).active;
  if(delivery){
    const route=app.active?.report.routes.find(r=>r.city===mission?.city);delivery.hidden=!route;
    if(route){const carried=Math.floor(route.pax*frac);$('em',delivery).textContent=tr(`本期運送示意 ${fmtNum(carried)} 人`, `Turn delivery preview: ${fmtNum(carried)}`);$('i',delivery).style.width=`${Math.min(100,(mission.pax+carried)/mission.targetPax*100)}%`;}
  }
  $('#clock-progress').style.width=`${frac*100}%`;$('#pause').textContent=app.clock.running?'Ⅱ':'▶';
  $('#pause').setAttribute('aria-pressed',String(app.clock.running));$$('[data-speed]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.speed)===app.clock.speed)));
}
let previousFrame=0,lastSave=0,lastTick=0;
function tick(now){
  requestAnimationFrame(tick);
  const dt=previousFrame?Math.min(.25,(now-previousFrame)/1000):0;previousFrame=now;
  if(app.screen!=='main'||!app.active)return;
  const suspended=document.hidden||!$('#overlay').hidden||!$('#term-pop').hidden;
  app.clock=advanceClock(app.clock,dt,app.state.mode,suspended);
  app.map?.setTime({elapsed:app.clock.elapsed,speed:app.clock.running&&!suspended?app.clock.speed:0});
  if(now-lastTick>200){syncClock();lastTick=now;}
  if(now-lastSave>3000){saveGame();lastSave=now;}
  if(!app.active.newsSeen && app.clock.elapsed>turnSeconds(app.state.mode)*.4 && !suspended){
    app.active.newsSeen=true;const events=app.active.report.events.filter(e=>e.id && !B.EVENTS.find(x=>x.id===e.id)?.choices);
    if(events.length){const e=events[0],lesson=LESSONS[B.EVENTS.find(x=>x.id===e.id)?.lesson];
      overlay(`<div class="kick">${tr('航網快訊','NETWORK BULLETIN')}</div><h2>${esc(pick(e))}</h2><p class="body">${withTerms(pick(lesson,'explainZh','explainEn'))}</p><p class="hint">${tr('本期影響已計入。現在調整航線與避險，下一期生效。','This turn’s effect is included. Route and hedge changes take effect next turn.')}</p><button type="button" class="btn block" id="news-close">${tr('繼續營運','Resume operations')}</button>`,{label:tr('航網快訊','Network bulletin')});$('#news-close').onclick=()=>{closeOverlay();saveGame();};}
  }
  if(app.clock.elapsed>=turnSeconds(app.state.mode))settleTurn();
}
requestAnimationFrame(tick);
window.addEventListener('pagehide',saveGame);

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
  if(co.facilityRunning||co.facilityDep)out.push(tr(`樞紐設施營運費 ${fmtUSD(co.facilityRunning)}、折舊 ${fmtUSD(co.facilityDep)}，已計入管理費用。`, `Hub running costs ${fmtUSD(co.facilityRunning)} and depreciation ${fmtUSD(co.facilityDep)} are included in overheads.`));
  if(co.fuelPrepaid)out.push(tr(`本期使用已預付燃油 ${fmtUSD(co.fuelPrepaid)}。成本照列，現金不重複扣除。`, `Prepaid fuel used this turn: ${fmtUSD(co.fuelPrepaid)}. It is expensed without charging cash again.`));
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
function aircraftDelivery(s,rep){
  const deliveries=rep.deliveries||[],types=[...new Set(deliveries.map(o=>o.type))];
  return `<div class="kick">${tr('交機通知','AIRCRAFT DELIVERY')} · ${s.hub}</div><h2>${tr(`新機抵達！共交付 ${deliveries.length} 架`,`New arrivals! ${deliveries.length} aircraft delivered`)}</h2><div class="delivered-aircraft-list">${types.map(type=>{
    const orders=deliveries.filter(o=>o.type===type),leased=orders.filter(o=>o.kind==='lease').length,owned=orders.length-leased;
    return `<div class="delivered-aircraft" data-delivered-type="${type}">${aircraftArt(type)}<div><b>${esc(pick(AIRCRAFT[type]))}</b><small>${[leased?tr(`租賃 ${leased} 架`,`${leased} leased`):'',owned?tr(`自有 ${owned} 架`,`${owned} owned`):''].filter(Boolean).join(' · ')}</small></div><strong>${orders.length}<small>${tr('架','aircraft')}</small></strong><p class="delivery-crew-status">${tr('合格機組','Qualified rosters')} ${B.crewAvailability(s,[])[type].ready} · ${tr('訓練中','Training')} ${B.crewAvailability(s,[])[type].pending}</p></div>`;
  }).join('')}</div><p class="delivery-ready">${isOver(s)?tr('已加入機隊，本局已結束。','Added to your fleet. This game has ended.'):tr('已加入機隊；搭配合格機組才能安排下一回合航線。','Added to your fleet. Qualified rosters are also required before scheduling next turn.')}</p><p class="hint">${tr(`現有機隊 ${s.fleet.length} 架 · 待交機 ${s.fleetOrders.length} 架`,`${s.fleet.length} aircraft in fleet · ${s.fleetOrders.length} still on order`)}</p><p class="hint">${tr('交機後的下一營運回合開始支付租金或貸款成本，即使沒有排班也會計費。','Rent or financing starts in the next operating turn after delivery, including idle aircraft.')}</p>`;
}
function showAircraftDelivery(){
  const m=overlay(`${aircraftDelivery(app.state,app.report)}<button type="button" class="btn block" id="delivery-confirm">${tr('收到，查看本期結算','Got it · View settlement')} ✓</button>`,{label:tr('新機交付通知','New aircraft delivery')});
  m.classList.add('aircraft-delivery-dialog');$('#delivery-confirm').onclick=closeOverlay;
}
function resultRoutePlan(row){
  const city=row.city,s=planningState(),open=app.draft.routes.has(city),r=app.draft.routes.get(city)||app.reportPlans?.[city]||row;
  const others=draftRoutes().filter(x=>x.city!==city),o=B.routeOptions(s,city),routes=open?others.concat(r):others;
  const space=B.fleetAvailability(s,routes)[r.type],plus=B.routeCapacity(s,others.concat({...r,weekly:r.weekly+1})).fits;
  const estimate=open?B.estimateRoute(s,city,r.type,r.weekly,r.fare):null;
  return `<div class="result-plan-heading"><b>${tr('調整下期班表','Plan next turn')}</b><span>${open?tr('已排入','Scheduled'):tr('下期停飛','Paused next turn')}</span></div><div class="result-plan-controls"><label><span>${tr('機型','Aircraft')}</span><select data-result-type aria-label="${tr('下期機型','Next-turn aircraft')}" ${open?'':'disabled'}>${o.eligibleTypes.map(t=>`<option value="${t}" ${t===r.type?'selected':''} ${B.routeCapacity(s,others.concat({...r,type:t,weekly:1})).fits?'':'disabled'}>${esc(pick(AIRCRAFT[t]))} · ${seatsOf(t)} ${tr('座','seats')}</option>`).join('')}</select></label><div class="result-frequency"><span>${tr('每週往返班次','Round trips / week')}</span><div><button type="button" data-result-delta="-1" aria-label="${tr('下期減一班','One fewer weekly round trip')}" ${!open||r.weekly<=1?'disabled':''}>−</button><output>${r.weekly}</output><button type="button" data-result-delta="1" aria-label="${tr('下期加一班','One more weekly round trip')}" ${!open||r.weekly>=o.maxWeekly||!plus?'disabled':''}>＋</button></div></div><label><span>${tr('票價','Fare')}</span><select data-result-fare aria-label="${tr('下期票價','Next-turn fare')}" ${open?'':'disabled'}>${['low','mid','high'].map(f=>`<option value="${f}" ${r.fare===f?'selected':''}>${fareName(f)}</option>`).join('')}</select></label></div><p class="result-plan-capacity">${tr(`${esc(pick(AIRCRAFT[r.type]))} · 排班後剩 ${fmtHours(space.remainingHours)} h／週 · 未排班 ${space.unassigned} 架`,`${esc(pick(AIRCRAFT[r.type]))} · ${fmtHours(space.remainingHours)} h/wk left · ${space.unassigned} unassigned`)}</p>${estimate?`<p class="result-plan-estimate">${tr('調整後推估','Estimate after changes')}：${tr('載客率','Load')} ${fmtPct(estimate.lf,0)} · ${estimate.profit>=0?'+':''}${esc(fmtUSD(estimate.profit))}<small>${tr('依目前供需推估穩定客量，未計事件、轉機客及設施固定費。','Steady demand estimate, excluding events, transfers and fixed facility costs.')}</small></p>`:''}<div class="result-plan-footer"><small>${tr('調整自動儲存，下期生效。','Autosaved. Takes effect next turn.')}</small><button type="button" class="ghost" data-result-toggle>${open?tr('下期停飛','Pause route'):tr('恢復下期航線','Resume route')}</button></div><p class="result-plan-message" role="status"></p>`;
}
function renderResultPlans(){
  $$('.result-route-planner').forEach(box=>{
    const row=app.report.routes.find(r=>r.city===box.dataset.resultCity);box.innerHTML=resultRoutePlan(row);
    const update=(change,focus)=>{
      const city=row.city,wasOpen=app.draft.routes.has(city),r={...(app.draft.routes.get(city)||app.reportPlans?.[city]||row)},others=draftRoutes().filter(x=>x.city!==city);
      let reduced=false;
      app.reportPlans||={};
      if(change.close){app.reportPlans[city]=r;app.draft.routes.delete(city);}
      else{
        const maxWeekly=B.routeOptions(planningState(),city).maxWeekly;
        const next={city,type:change.type||r.type,weekly:Math.min(change.weekly??r.weekly,maxWeekly),fare:change.fare||r.fare};
        const fits=()=>B.routeCapacity(planningState(),others.concat(next)).fits;
        if(change.type||!wasOpen)while(next.weekly>1&&!fits())next.weekly--;
        if(!fits()){renderResultPlans();$('.result-plan-message',box).textContent=tr('飛機、合格機組時數或基地時段不足，請先減班，或到機隊安排擴張。','Aircraft hours, qualified roster hours or hub slots are full. Reduce flights or plan expansion in Fleet.');return;}
        reduced=next.weekly<r.weekly&&(change.type||!wasOpen||r.weekly>maxWeekly);
        app.draft.routes.set(city,next);
      }
      saveGame();renderResultPlans();
      const updated=$(`[data-result-city="${city}"]`);$(focus,updated)?.focus({preventScroll:true});
      $('.result-plan-message',updated).textContent=reduced?tr(`已儲存，配合運能與時段上限減為每週 ${app.draft.routes.get(city).weekly} 班。`,`Saved. Reduced to ${app.draft.routes.get(city).weekly} weekly round trips to fit capacity and slots.`):tr('已儲存，下期開始使用新班表。','Saved. The new schedule starts next turn.');
    };
    $('[data-result-type]',box).onchange=e=>update({type:e.target.value},'[data-result-type]');
    $('[data-result-fare]',box).onchange=e=>update({fare:e.target.value},'[data-result-fare]');
    $$('[data-result-delta]',box).forEach(b=>b.onclick=()=>{const r=app.draft.routes.get(row.city);update({weekly:r.weekly+Number(b.dataset.resultDelta)},`[data-result-delta="${b.dataset.resultDelta}"]`);});
    $('[data-result-toggle]',box).onclick=()=>update({close:app.draft.routes.has(row.city)},'[data-result-toggle]');
  });
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
      ${r.costs ? `<details class="cb"><summary>${tr('成本拆開看', 'Cost breakdown')}</summary>${costBlock(r.costs, r.cost)}</details>` : ''}${last?'':`<div class="result-route-planner" data-result-city="${r.city}"></div>`}</article>`; }).join('');
  appEl.innerHTML = `<div class="rwrap">
    <div class="rhead"><div><small>${esc(turnLabel(s, app.reportTurn))}</small><h1>${tr('本期結算', 'TURN COMPLETE')}</h1></div></div>
    ${rep.deliveries?.length?`<section class="fleet-delivered">${aircraftDelivery(s,rep)}</section>`:''}${careerResult(s,rep)}${resultBadges(s,rep)}${operationsReport(rep)}
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
      <p class="hint">${co.revenue <= 0 ? tr('沒有航線收入，租金與固定費用仍要支付。','No route revenue; leases and fixed costs still need to be paid.') : co.loadFactor >= co.breakEvenLF ? tr('座位賣得比損益平衡點多，公司賺錢。', 'Seats sold exceed the break-even point.') : tr('座位賣得比損益平衡點少，每飛一班就多賠一點。', 'Seats sold are below break-even.')}</p></div>
      ${companyNotes(co)}${cashFlowReport(co)}
    </section>
    ${rivalLine(rep, s)}
    ${lessons.length ? `<section class="card"><h2>${tr('這回合學到的事', 'What this turn taught')}</h2>${lessons.map((l) => `<div class="lesson"><b>${esc(pick(l))}</b><p>${withTerms(pick(l, 'explainZh', 'explainEn'))}</p></div>`).join('')}</section>` : ''}
    ${warns.length ? `<section class="card warnbox"><h2>${tr('預警', 'Heads-up')}</h2>${warns.map((e) => `<div class="ev"><b>${esc(pick(e))}</b></div>`).join('')}</section>` : ''}
    ${happened.length ? `<section class="card"><h2>${tr('發生的事', 'What happened')}</h2>${happened.map((e) => `<div class="ev"><b>${esc(pick(e))}</b>${pick(e, 'explainZh', 'explainEn') ? `<div class="hint">${esc(pick(e, 'explainZh', 'explainEn'))}</div>` : ''}</div>`).join('')}</section>` : ''}
    <h2 style="margin:18px 0 10px;font-size:18px">${tr('各條航線', 'Routes')}</h2>
    ${routeCards || `<div class="card"><p class="hint">${tr('這回合沒有航線，只付了租金和管理費用。', 'No routes this turn. Only fixed costs were paid.')}</p></div>`}
    <div class="sticky-next"><button type="button" class="btn block" id="next">${last ? tr('看總成績', 'See final report') : tr(`下一${isSeasonMode(s.mode) ? '季' : '個月'}`, 'Next turn')} →</button></div></div>`;
  $('#next').addEventListener('click', () => { if (last) { store.del(SAVE_KEY(s.mode)); go('end'); } else go('main'); });
  $('#result-fleet')?.addEventListener('click',()=>{go('main');openPanel('fleet');});
  renderResultPlans();bindCareer(appEl);reportWorld();
}
function reportWorld(){
  const box=document.createElement('div');box.className='settlement-world';box.setAttribute('aria-hidden','true');appEl.prepend(box);
  app.map=createAirport(box,{hubId:app.state.hub,preview:true,still:true});app.map.update({fleet:app.state.fleet,routes:app.state.routes,facilities:app.state.facilities});
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
    ${scenarioReport(s)}
    <section class="card career-final"><h2>${tr('你建立的航空公司','The airline you built')}</h2>${careerHeader(s)}<div class="career-final-stats"><span><b>${readCareer(s).completed.length}</b>${tr('任務完成','Missions completed')}</span><span><b>${Object.keys(readCareer(s).stamps).length}</b>${tr('城市首航','Cities flown')}</span><span><b>${readCareer(s).bestStreak}</b>${tr('最長連續獲利','Best profit streak')}</span></div><button type="button" class="btn sec block" data-passport>▣ ${tr('看看收集的城市章','View your city stamps')}</button></section>
    ${routeCards2}
    <section class="card"><h2>${tr('你遇到的課題', 'Lessons you met')}</h2>${seen.length ? seen.map((id) => { const l = LESSONS[id] || {}; return `<div class="lesson"><b>${handled.has(id) ? '✓ ' : '· '}${esc(pick(l) || id)}</b><p>${withTerms(pick(l, 'explainZh', 'explainEn'))}</p><p class="hint">${handled.has(id) ? tr('你處理得不錯。', 'You handled this well.') : tr('這次沒有處理好，下次可以留意。', 'Not handled this time.')}</p></div>`; }).join('') : `<p class="hint">${tr('這次沒有遇到課題。', 'None this time.')}</p>`}${(rep.lessonsUnseen || []).length ? `<p class="hint" style="margin-top:12px">${tr('這局沒遇到', 'Not met this game')}：${(rep.lessonsUnseen || []).map((id) => esc(pick(LESSONS[id] || {}) || id)).join(tr('、', ', '))}</p>` : ''}</section>
    ${tips.length ? `<section class="card"><h2>${tr('換一種走法再玩', 'Try a different line')}</h2><ul class="tips">${tips.map((t) => `<li>${withTerms(t)}</li>`).join('')}</ul></section>` : ''}
    <div class="cta-row"><button type="button" class="btn" id="again">${tr('再玩一次', 'Play again')}</button><button type="button" class="btn sec" id="change">${tr('換基地或模式', 'Change hub or mode')}</button><button type="button" class="link" id="src">${tr('資料來源', 'Data sources')}</button></div></div>`;
  $('#again').onclick = () => newGame(); $('#change').onclick = () => go('start'); $('#src').onclick = () => go('sources');
  bindCareer(appEl);reportWorld();
}

function scenarioReport(s){
  if(!s.scenario||s.scenario==='free')return '';
  const c=scenarioProgress(s,app.report);
  return `<section class="card scenario-final"><small class="hint">${tr('情境挑戰','SCENARIO CHALLENGE')}</small><h2>${esc(pick(c.sc))} · ${c.complete?tr('完成','Completed'):tr('未達標','Not completed')}</h2><p>${esc(pick(c.sc,'descZh','descEn'))}</p><p class="hint">${tr('累計淨利率','Total margin')} ${fmtPct(c.margin)} · ${tr('航線','Routes')} ${s.routes.length} · ${tr('轉機占比','Connections')} ${fmtPct(c.transfer,0)}</p></section>`;
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
    <section class="card" style="margin-top:16px"><h2>${tr('全航點重算與動態供需','All-pair audit and dynamic markets')}</h2><p>${tr('180 個航點、16,110 組配對。1,493 組有官方客量，其餘為校準估算。季節、事件與班次會改變供需，其他航空在結算後逐步調整運力。','180 airports, 16,110 pairs. 1,493 have official traffic; others are fitted estimates. Seasons, events and frequency change the market; incumbents adjust capacity after settlement.')}</p><p><a href="./design/demand/all-pairs.csv" download>${tr('下載全部方向的重算表（CSV）','Download all directions (CSV)')}</a> · <a href="./design/demand/README.md">${tr('資料定義、誤差與授權','Definitions, uncertainty and credits')}</a></p></section>
    <section class="card" style="margin-top:16px"><h2>${tr('v2 機型、美術與設施','v2 aircraft, art and facilities')}</h2><p>${tr('機型採實際名稱，遊戲航程、座位、租金與耗油為簡化設定。交機與施工期、加急溢價、取消費和保養狀態也是配合遊戲節奏的設計值，並非現實航空作業規範。設施的費用、商務吸引力與儲油容量為設計值；維修減少 30% 參考 AirTycoon 4。','Real aircraft names; game range, seats, rent and fuel burn are simplified assumptions. Delivery and construction times, express premiums, cancellation fees and care scores are gameplay values, not real aviation procedures. Facility costs, appeal and storage are design values. The 30% maintenance reduction references AirTycoon 4.')}</p><p class="hint">${tr('地球影像：NASA Earth Observatory，Blue Marble: Next Generation（Reto Stöckli）。海岸線：Natural Earth，公有領域。機型展示、設施、旅行手冊明信片與海灣背景：OpenAI imagegen 原創美術；為遊戲示意，非原廠模型或實際城市照片。立體機場、建築與小飛機：本站自製程序美術。備用機場插畫與吉祥物：OpenAI imagegen 原創美術。各基地共用示意場景，非實際機場建築。配樂：本站原創和弦與旋律，以 Web Audio 合成。three.js：MIT 授權。','Earth imagery: NASA Earth Observatory, Blue Marble: Next Generation (Reto Stöckli). Coastlines: Natural Earth, public domain. Aircraft portraits, facility portraits, regional postcards and the coastal backdrop: original OpenAI imagegen art; illustrative, not manufacturer models or real city photographs. 3D airport, buildings and miniature aircraft: original procedural art. Fallback airport illustrations and mascot: original art generated with OpenAI imagegen. Airports share an illustrative scene, not a replica of each real airport. Music: original chords and melody synthesised with Web Audio. three.js: MIT.')}</p><p><a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/" target="_blank" rel="noopener">NASA Earth Observatory</a> · <a href="https://apps.apple.com/us/app/airtycoon-4/id989733380" target="_blank" rel="noopener">AirTycoon 4</a> · <a href="./design/LICENSES.md">${tr('美術授權','Asset licences')}</a></p><p style="margin-top:10px">${tr('原廠機型資料','Manufacturer references')}：${B.AIRCRAFT_REFERENCES.map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>`).join(' · ')}</p></section>
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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideTerm(); if($('#overlay').hidden&&app.screen==='main'&&app.panelOpen)closePanel(); } });

/* ---------- chrome wiring ---------- */
$('#lang-btn').addEventListener('click', () => { setLocale(locale === 'zh' ? 'en' : 'zh'); chrome(); go(app.screen === 'main' && !app.draft ? 'main' : app.screen); });
$('#menu-btn').addEventListener('click', () => {
  const m = overlay(`<h2>${tr('選單', 'Menu')}</h2><div class="opts" style="margin-top:12px"><button type="button" class="opt" data-m="fullscreen"><b>${tr('全螢幕遊玩', 'Fullscreen')}</b></button><button type="button" class="opt" data-m="help"><b>${tr('怎麼玩', 'How to play')}</b></button><button type="button" class="opt" data-m="src"><b>${tr('資料來源', 'Data sources')}</b></button><button type="button" class="opt" data-m="home"><b>${tr('回到開始畫面', 'Back to start')}</b><small>${tr('航班進度與下期規劃會自動存檔，可從開始畫面繼續。', 'Playback and next-turn plans autosave. Continue from the start screen.')}</small></button><button type="button" class="opt" data-m="clear"><b>${tr('清除存檔', 'Clear saves')}</b><small>${tr('清除兩種模式的進度，回到開始畫面；可還原上次清除的存檔。', 'Clear both modes and return to start. Cleared saves can be restored.')}</small></button><button type="button" class="opt" data-m="x"><b>${tr('關閉', 'Close')}</b></button></div>`, { label: tr('選單', 'Menu') });
  $$('[data-m]', m).forEach((b) => b.addEventListener('click', () => { closeOverlay();if(b.dataset.m==='fullscreen'){if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});}if(b.dataset.m==='help')showHow(); if (b.dataset.m === 'src') go('sources'); if (b.dataset.m === 'home') go('start'); if (b.dataset.m === 'clear') clearSaves(); }));
});

/* ---------- debug hook (?debug) ---------- */
if (new URLSearchParams(location.search).has('debug')) {
  window.__tq = {
    music,
    app, B,
    /** run n turns with the current draft (auto-answering events with the first option) */
    ff(n = 1) { for (let i = 0; i < n && !isOver(app.state); i++) { if(app.active){settleTurn();continue;} if (app.screen !== 'main') go('main'); if (!app.draft) initDraft(); for (const e of B.pendingEvents(app.state)) app.draft.eventChoices[e.id] = e.options[0].id; runTurn(true); } return app.state.turn; },
    end() { while (!isOver(app.state)) this.ff(1); if (app.screen !== 'end') { go('end'); } },
  };
}

chrome(); go('start');
