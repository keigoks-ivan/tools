// MOCK of model.mjs + data.mjs + sources.mjs (same API), for building the UI before the real model lands.
// Numbers here are placeholders for UI testing only. Switch to the real model in backend.mjs.

export const MODES = {
  year: { id: 'year', turns: 12, zh: '一年', en: 'One year', unitZh: '月', unitEn: 'month', weeks: 4.33, minutes: '20–30',
       descZh: '12 個月，一個月一回合。三種機型、一家對手。', descEn: '12 months, one turn per month. Three aircraft types, one rival.' },
  decade: { id: 'decade', turns: 20, zh: '十年', en: 'Ten years', unitZh: '季', unitEn: 'season', weeks: 26, minutes: '40',
       descZh: '20 個航季，一季半年。六種機型、買或租、航權限制、景氣循環。', descEn: '20 seasons of half a year. Six types, buy or lease, slots, boom and bust.' },
};

export const HUBS = {
  TPE: { id: 'TPE', zh: '台北桃園', en: 'Taipei Taoyuan', lat: 25.08, lon: 121.23, teachZh: '夾在東北亞與東南亞中間，轉機客是機會。', teachEn: 'Between NE and SE Asia; transfer traffic is the opportunity.' },
  NRT: { id: 'NRT', zh: '東京成田', en: 'Tokyo Narita', lat: 35.77, lon: 140.39, teachZh: '本國市場大，先學會服務好自己人。', teachEn: 'A huge home market.' },
  SIN: { id: 'SIN', zh: '新加坡', en: 'Singapore', lat: 1.36, lon: 103.99, teachZh: '沒有國內線，每條航線都是國際線。', teachEn: 'No domestic market.' },
  DXB: { id: 'DXB', zh: '杜拜', en: 'Dubai', lat: 25.25, lon: 55.36, teachZh: '地理位置就是優勢，長程轉機是主力。', teachEn: 'Geography as an asset; long-haul transfers.' },
  ZRH: { id: 'ZRH', zh: '蘇黎世', en: 'Zurich', lat: 47.46, lon: 8.55, teachZh: '市場小但富裕，成本很高。', teachEn: 'Small, rich, expensive.' },
};

const C = (zh, en, lat, lon, pop, blurbZh) => ({ zh, en, lat, lon, pop, blurbZh });
export const CITIES = {
  TPE: C('台北', 'Taipei', 25.08, 121.23, 7.0, '科技業出差客多，也是轉機門戶。'),
  NRT: C('東京', 'Tokyo', 35.77, 140.39, 37, '全球最大都會區之一，商務與觀光都旺。'),
  KIX: C('大阪', 'Osaka', 34.43, 135.24, 19, '觀光客多，關西商務也穩。'),
  ICN: C('首爾', 'Seoul', 37.46, 126.44, 26, '商務與觀光並重。'),
  PVG: C('上海', 'Shanghai', 31.14, 121.8, 29, '商務量大，航權管制多。'),
  PEK: C('北京', 'Beijing', 40.08, 116.58, 21, '政商往來頻繁。'),
  HKG: C('香港', 'Hong Kong', 22.31, 113.91, 7.5, '短程密集航線，競爭激烈。'),
  MNL: C('馬尼拉', 'Manila', 14.51, 121.02, 14, '外勞與探親客為主。'),
  BKK: C('曼谷', 'Bangkok', 13.69, 100.75, 11, '觀光熱門，票價敏感。'),
  SIN: C('新加坡', 'Singapore', 1.36, 103.99, 5.9, '東南亞樞紐。'),
  KUL: C('吉隆坡', 'Kuala Lumpur', 2.75, 101.71, 8.5, '廉航大本營。'),
  SGN: C('胡志明市', 'Ho Chi Minh City', 10.82, 106.65, 9, '成長快的新興市場。'),
  CGK: C('雅加達', 'Jakarta', -6.13, 106.66, 11, '人口大，收入還在爬。'),
  DEL: C('德里', 'Delhi', 28.56, 77.1, 32, '人口龐大，距離遠。'),
  BOM: C('孟買', 'Mumbai', 19.09, 72.87, 21, '商務客多。'),
  DXB: C('杜拜', 'Dubai', 25.25, 55.36, 3.6, '全球轉機樞紐。'),
  DOH: C('杜哈', 'Doha', 25.27, 51.61, 2.4, '海灣航空公司集中地。'),
  IST: C('伊斯坦堡', 'Istanbul', 41.26, 28.74, 16, '連接歐亞。'),
  LHR: C('倫敦', 'London', 51.47, -0.45, 14, '全球最繁忙的長程市場之一，時段很緊。'),
  CDG: C('巴黎', 'Paris', 49.0, 2.55, 11, '觀光與商務都強。'),
  FRA: C('法蘭克福', 'Frankfurt', 50.04, 8.56, 5.6, '歐洲商務樞紐。'),
  AMS: C('阿姆斯特丹', 'Amsterdam', 52.31, 4.76, 2.5, '轉機客多。'),
  ZRH: C('蘇黎世', 'Zurich', 47.46, 8.55, 1.5, '小而富。'),
  FCO: C('羅馬', 'Rome', 41.8, 12.25, 4.3, '觀光為主，夏季旺。'),
  MAD: C('馬德里', 'Madrid', 40.49, -3.57, 6.7, '拉美與歐洲的門戶。'),
  LAX: C('洛杉磯', 'Los Angeles', 33.94, -118.41, 13, '跨太平洋第一站。'),
  SFO: C('舊金山', 'San Francisco', 37.62, -122.38, 7.7, '科技業商務客多。'),
  JFK: C('紐約', 'New York', 40.64, -73.78, 19, '最大的長程商務市場。'),
  YVR: C('溫哥華', 'Vancouver', 49.19, -123.18, 2.6, '亞裔客群穩定。'),
  SYD: C('雪梨', 'Sydney', -33.95, 151.18, 5.3, '南半球季節相反。'),
  MEL: C('墨爾本', 'Melbourne', -37.67, 144.84, 5.1, '留學生與探親客。'),
  AKL: C('奧克蘭', 'Auckland', -37.01, 174.79, 1.7, '距離遠、客量小。'),
};

export const AIRCRAFT = {
  'MQ-72':  { id: 'MQ-72',  zh: 'MQ-72 渦槳',  en: 'MQ-72 turboprop', modes: ['year', 'decade'], seats: { fsc: 70, lcc: 78 },   rangeKm: 1500,  leasePerMonth: 190000, price: 22e6, speed: 520 },
  'MQ-190': { id: 'MQ-190', zh: 'MQ-190 支線噴射', en: 'MQ-190 regional jet', modes: ['decade'], seats: { fsc: 100, lcc: 110 }, rangeKm: 3500, leasePerMonth: 290000, price: 38e6, speed: 790 },
  'MQ-320': { id: 'MQ-320', zh: 'MQ-320 窄體', en: 'MQ-320 narrowbody', modes: ['year', 'decade'], seats: { fsc: 180, lcc: 200 }, rangeKm: 6000, leasePerMonth: 380000, price: 50e6, speed: 830 },
  'MQ-321': { id: 'MQ-321', zh: 'MQ-321 長程窄體', en: 'MQ-321 long-range NB', modes: ['decade'], seats: { fsc: 200, lcc: 220 }, rangeKm: 7400, leasePerMonth: 450000, price: 60e6, speed: 830 },
  'MQ-350': { id: 'MQ-350', zh: 'MQ-350 寬體', en: 'MQ-350 widebody', modes: ['year', 'decade'], seats: { fsc: 320, lcc: 360 }, rangeKm: 14000, leasePerMonth: 1050000, price: 140e6, speed: 900 },
  'MQ-400': { id: 'MQ-400', zh: 'MQ-400 大型寬體', en: 'MQ-400 large widebody', modes: ['decade'], seats: { fsc: 400, lcc: 440 }, rangeKm: 13500, leasePerMonth: 1400000, price: 190e6, speed: 900 },
};

export const LESSONS = {
  loadfactor: { zh: '載客率比班次多寡重要', en: 'Load factor matters', explainZh: '飛機有一半是空的，成本還是照付。座位賣得出去的比例，決定一條航線賺不賺。', explainEn: 'Empty seats still cost money.' },
  widebody: { zh: '大飛機不等於賺錢', en: 'Bigger is not better', explainZh: '寬體機租金和油耗都高，在短而薄的航線上坐不滿，成本攤到每個座位更貴。', explainEn: 'Widebodies on thin routes lose money.' },
  fuel: { zh: '油價波動，避險買的是穩定', en: 'Fuel hedging', explainZh: '避險不保證賺錢，只是把油價先鎖住，讓成本好預測。', explainEn: 'Hedging buys stability, not profit.' },
  fare: { zh: '客滿但不賺錢', en: 'Full but unprofitable', explainZh: '票價定太低，即使坐滿，收入還是蓋不過成本。', explainEn: 'Full planes can still lose money.' },
};

export const GLOSSARY = {
  '載客率': { zh: '載客率', en: 'Load factor', explainZh: '賣出去的座位占全部座位的比例。', explainEn: 'Share of seats sold.' },
  '損益平衡載客率': { zh: '損益平衡載客率', en: 'Break-even load factor', explainZh: '載客率要到多少，這條航線才剛好不賠錢。', explainEn: 'Load factor needed to cover costs.' },
  'RASK': { zh: '每座位公里收入', en: 'RASK', explainZh: '每個座位飛一公里能收到多少錢，不管有沒有坐人。', explainEn: 'Revenue per available seat-km.' },
  'CASK': { zh: '每座位公里成本', en: 'CASK', explainZh: '每個座位飛一公里要花多少錢。RASK 高過 CASK 就賺錢。', explainEn: 'Cost per available seat-km.' },
  '避險': { zh: '燃油避險', en: 'Fuel hedge', explainZh: '先用固定價格買下一部分未來的油，油價漲跌都不影響這一部分。', explainEn: 'Lock in part of future fuel.' },
  '稼動率': { zh: '稼動率', en: 'Utilisation', explainZh: '飛機一天實際飛行的小時數。停在地上也要付租金。', explainEn: 'Flight hours per aircraft per day.' },
  '週班次': { zh: '週班次', en: 'Weekly frequency', explainZh: '一週飛幾個來回。班次多，客人方便，但每班坐得較空。', explainEn: 'Round trips per week.' },
};

export const EVENTS = {
  fuelspike: { zh: '油價大漲', en: 'Fuel spike' },
};

export const SOURCES = [
  { id: 'iata', zh: 'IATA 世界航空業財務預測', en: 'IATA industry outlook', noteZh: '行業淨利率 3.9%（示意）。', url: 'https://www.iata.org/' },
];

/* ---------- model ---------- */
const hav = (a, b) => {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const model = (s) => (s.businessModel === 'lcc' ? 'lcc' : 'fsc');

export function newGame({ mode = 'year', hub = 'TPE', seed = 1 } = {}) {
  const m = MODES[mode];
  return {
    mode, hub, seed, turn: 0, turns: m.turns, cash: 30e6, routes: [],
    fleet: { lease: {}, own: {} }, hedge: 0, businessModel: 'fsc', fuelIndex: 1, lessonsSeen: [], lessonsHandled: [],
    rivalRoutes: ['NRT', 'HKG', 'SIN'].filter((c) => c !== hub).slice(0, mode === 'year' ? 2 : 3), history: [], over: false, eventChoices: {},
  };
}

export function routeOptions(state, cityId) {
  const o = HUBS[state.hub], d = CITIES[cityId];
  const distanceKm = Math.round(hav(o, d));
  const blockHours = +(distanceKm / 780 + 0.6).toFixed(1);
  const base = 45 + distanceKm * 0.085;
  const eligibleTypes = Object.values(AIRCRAFT).filter((a) => a.modes.includes(state.mode) && a.rangeKm >= distanceKm).map((a) => a.id);
  const est = Math.round((CITIES[state.hub].pop * d.pop) ** 0.5 * 190 / (1 + distanceKm / 2500));
  return {
    distanceKm, blockHours,
    refFare: { low: Math.round(base * 0.8), mid: Math.round(base), high: Math.round(base * 1.25) },
    eligibleTypes, estMarketPaxPerWeek: est,
    rivalsOnRoute: state.rivalRoutes.includes(cityId) ? 1 : 0, slotLimited: state.mode === 'decade' && ['LHR', 'NRT'].includes(cityId),
  };
}

export function fleetNeeded(state, routes) {
  const need = {};
  for (const r of routes) {
    const o = routeOptions(state, r.city);
    const hrs = r.weekly * 2 * o.blockHours; // weekly block hours
    need[r.type] = (need[r.type] || 0) + hrs / (12 * 7 * 0.8);
  }
  for (const k in need) need[k] = Math.max(1, Math.ceil(need[k] - 1e-9));
  return need;
}

export function applyDecisions(state, dec) {
  const s = JSON.parse(JSON.stringify(state)), errors = [];
  if (dec.routes) {
    for (const r of dec.routes) {
      const o = routeOptions(s, r.city);
      if (!o.eligibleTypes.includes(r.type)) errors.push({ code: 'range', zh: `${CITIES[r.city].zh} 超出 ${AIRCRAFT[r.type].zh} 的航程。`, en: 'Out of range.' });
    }
    s.routes = dec.routes.map((r) => ({ ...r }));
  }
  if (dec.fleet) {
    for (const [t, n] of Object.entries(dec.fleet.lease || {})) s.fleet.lease[t] = (s.fleet.lease[t] || 0) + n;
    for (const [t, n] of Object.entries(dec.fleet.returnLease || {})) s.fleet.lease[t] = Math.max(0, (s.fleet.lease[t] || 0) - n);
  }
  const need = fleetNeeded(s, s.routes);
  for (const [t, n] of Object.entries(need)) if (((s.fleet.lease[t] || 0) + (s.fleet.own[t] || 0)) < n) errors.push({ code: 'fleet', zh: `${AIRCRAFT[t].zh} 還差 ${n - (s.fleet.lease[t] || 0)} 架。`, en: 'Not enough aircraft.' });
  if (dec.hedge != null) s.hedge = dec.hedge;
  if (dec.businessModel) s.businessModel = dec.businessModel;
  if (dec.eventChoices) Object.assign(s.eventChoices, dec.eventChoices);
  return { state: s, errors };
}

export function pendingEvents(state) {
  const out = [];
  if (state.turn === 2 && !(state.eventChoices.fuelspike)) out.push({ id: 'fuelspike', zh: '油價將大幅上漲', en: 'Fuel prices are about to spike', bodyZh: '分析師預期下個月油價漲三成。你可以現在鎖價，或賭它不會漲。', options: [{ id: 'hedge', zh: '鎖定一半用油', en: 'Hedge half', hintZh: '成本穩定，若油價沒漲就白花避險費。' }, { id: 'wait', zh: '不避險', en: 'No hedge', hintZh: '若油價真的漲了，成本會直接上升。' }] });
  if (state.mode === 'year' && state.turn === 5 && !state.eventChoices.model) out.push({ id: 'model', zh: '要不要改走廉價路線？', en: 'Go low-cost?', bodyZh: '廉航把座位排得更密、票價更低，另外賣行李和餐飲，人力與通路成本也低。', options: [{ id: 'lcc', zh: '改走廉價路線', en: 'Go LCC', hintZh: '座位多約一成、票價低、附加收入高。' }, { id: 'fsc', zh: '維持full-service', en: 'Stay full-service', hintZh: '票價高、成本高，服務完整。' }] });
  return out;
}

export function simulateTurn(state) {
  const s = JSON.parse(JSON.stringify(state));
  const m = MODES[s.mode], weeks = m.weeks, lcc = model(s) === 'lcc';
  const fuelP = s.turn >= 3 && s.turn <= 6 ? 1.3 : 1; const fuelEff = fuelP - (fuelP - 1) * s.hedge;
  const routes = s.routes.map((r) => {
    const o = routeOptions(s, r.city), ac = AIRCRAFT[r.type];
    const seats = Math.round(r.weekly * 2 * ac.seats[model(s)] * weeks);
    const fare = o.refFare[r.fare || 'mid'];
    const priceF = r.fare === 'low' ? 1.2 : r.fare === 'high' ? 0.75 : 1;
    const share = o.rivalsOnRoute ? 0.55 : 0.9;
    const demand = Math.round(o.estMarketPaxPerWeek * weeks * share * priceF * (0.9 + hash(s.seed + r.city + s.turn) * 0.2));
    const pax = Math.min(seats, demand), lf = seats ? pax / seats : 0;
    const avgFare = fare * (lcc ? 0.8 : 1);
    const revenue = pax * avgFare + (lcc ? pax * 18 : 0);
    const hrs = r.weekly * 2 * o.blockHours * weeks;
    const costs = {
      fuel: hrs * ac.seats.fsc * 14 * fuelEff,
      labour: hrs * (lcc ? 700 : 1000) * (ac.seats.fsc / 180 + 0.5),
      maintenance: hrs * 380 * (ac.seats.fsc / 180 + 0.4),
      airport: r.weekly * 2 * weeks * 900 + pax * 14,
      ownership: (s.fleet.lease[r.type] ? ac.leasePerMonth : 0) * (weeks / 4.33) * (hrs / Math.max(hrs, 1)) * (0.6),
      distribution: revenue * (lcc ? 0.03 : 0.08),
    };
    const cost = Object.values(costs).reduce((a, b) => a + b, 0);
    const rkm = seats * o.distanceKm;
    const be = Math.min(1.5, cost / Math.max(revenue / Math.max(lf, 0.01), 1) / Math.max(seats, 1));
    let reasonZh = '載客率高過損益平衡點，這條航線賺錢。', reasonEn = 'Load factor is above break-even.';
    if (lf < be) { reasonZh = lf < 0.6 ? '大飛機只坐了五成多，攤到每個座位的成本太高。' : '載客率低於損益平衡點，票價收入蓋不住成本。'; reasonEn = 'Load factor is below break-even.'; }
    if (r.fare === 'low' && lf > 0.9) { reasonZh = '客滿了，但票價太低，收入還是蓋不過成本。'; reasonEn = 'Full but fares too low.'; }
    return { city: r.city, type: r.type, weekly: r.weekly, fare, pax, seats, lf, breakEvenLF: be, revenue, cost, costs, profit: revenue - cost, rask: revenue / rkm, cask: cost / rkm, avgFare, transferPax: 0, reasonZh, reasonEn };
  });
  const sum = (f) => routes.reduce((a, r) => a + f(r), 0);
  const costs = { fuel: sum((r) => r.costs.fuel), labour: sum((r) => r.costs.labour), maintenance: sum((r) => r.costs.maintenance), airport: sum((r) => r.costs.airport), ownership: sum((r) => r.costs.ownership), distribution: sum((r) => r.costs.distribution), overhead: 600000 * weeks / 4.33, interest: 0 };
  const revenue = sum((r) => r.revenue), totalCost = Object.values(costs).reduce((a, b) => a + b, 0), profit = revenue - totalCost;
  const seats = sum((r) => r.seats), pax = sum((r) => r.pax);
  const lessons = [];
  if (s.turn === 0 && routes.length) lessons.push('loadfactor');
  if (s.turn === 3) lessons.push('fuel');
  lessons.forEach((l) => { if (!s.lessonsSeen.includes(l)) s.lessonsSeen.push(l); });
  const report = {
    turn: s.turn,
    company: { revenue, costs, profit, margin: revenue ? profit / revenue : -1, cash: s.cash + profit, loadFactor: seats ? pax / seats : 0, breakEvenLF: revenue ? Math.min(1.2, (seats ? pax / seats : 0) * totalCost / revenue) : 1, rask: 0.08, cask: 0.078, pax },
    routes, events: s.turn === 3 ? [{ id: 'fuelspike', zh: '油價上漲三成', en: 'Fuel +30%' }] : [], lessons, gameOver: false,
  };
  s.cash += profit; s.history.push({ revenue, profit }); s.turn += 1;
  if (s.cash < 0) { report.gameOver = true; s.over = true; }
  if (s.turn >= s.turns) { report.gameOver = true; s.over = true; }
  return { state: s, report };
}

export function endReport(state) {
  const rev = state.history.reduce((a, h) => a + h.revenue, 0), pr = state.history.reduce((a, h) => a + h.profit, 0);
  const m = rev ? pr / rev : -1;
  return { marginTotal: m, industryMargin: 0.039, cash: state.cash, bestRoute: { city: state.routes[0]?.city, reasonZh: '載客率穩定在八成以上。' }, worstRoute: { city: state.routes[1]?.city || state.routes[0]?.city, reasonZh: '班次排太多，每班都坐不滿。' },
    lessonsSeen: state.lessonsSeen, lessonsHandled: state.lessonsHandled, gradeZh: m > 0.05 ? '穩健經營' : m > 0 ? '勉強獲利' : '虧損收場', gradeEn: m > 0 ? 'Solid' : 'Loss', replayTipsZh: ['試試改走廉價路線。', '換一個基地看看。'] };
}

export const serialize = (state) => JSON.stringify(state);
export const deserialize = (str) => JSON.parse(str);
