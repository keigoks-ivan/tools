/* 創業之城 第 1 步：經濟模擬核心。純邏輯，不碰 DOM，不用 Math.random。
 * 瀏覽器與 node 都能跑。金額一律整數「元」；門檻與取整一律在整數上比較。
 * 亂數：以 (seed, 標籤, 時間, 店號…) 雜湊出局部亂數流，同種子必得同結果，且玩家改設定不會擾動其他店的亂數。
 *
 * 用法：
 *   const world = createWorld({ mapData, distances, seed });  // distances[buildingId][lotId] 單位＝格
 *   const frame = stepHour(world);                            // 推進 1 遊戲小時
 */
import { P, unwrap } from './params.js';
import { E as EXP, FACILITY_KEYS, newExpansion, ready, effects } from './facilities.js';

export const V = unwrap(P);

// ───────────────────────── 常數與小工具 ─────────────────────────
const ITEMS = Object.keys(V.items);
const NI = ITEMS.length;
const ITEM_REF = ITEMS.map((k) => V.items[k].ref);
const ITEM_POP = ITEMS.map((k) => V.items[k].pop);
const ITEM_COST = ITEMS.map((k) => V.items[k].cost);
const MILK_IDX = ITEMS.indexOf('鮮奶茶');
const TYPE_KEY = { 住宅: '住宅', 辦公: '辦公', 學校: '學校', 捷運站: '捷運', 商業: '商圈' };
const POP_TYPES = Object.keys(TYPE_KEY);
const [OPEN_H, CLOSE_H] = [V.time.openHour, V.time.closeHour];
const NHOURS = CLOSE_H - OPEN_H;
const EMPLOYER_MILLI = Math.round(1000 + V.labor.employerPct * 10); // 1196
const SHIFTS = V.capacity.shifts;
const PLAYER = 'player';
const REF_AVG = ITEMS.reduce((a, _, i) => a + ITEM_POP[i] * ITEM_REF[i], 0) / ITEM_POP.reduce((a, b) => a + b, 0); // 菜單參考均價（用品項人氣加權）
const WAGE_LEVELS = ['basic', 'market', 'high'];

const T = { POIS: 1, LEAVE: 2, ITEM: 3, REV: 4, STAR: 5, EVT: 6, WEATHER: 7, QUIT: 8, MON: 9, ESTI: 10, LOT: 11, VIRAL: 12, FLAME: 13, SCOLD: 14, NOISE: 15, BATCH: 16 };

function h32(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h ^= x | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
  }
  return h >>> 0;
}
function stream(...keys) {
  let a = h32(...keys);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  const u = Math.max(rng(), 1e-12), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function poisson(rng, lam) {
  if (!(lam > 0)) return 0;
  if (lam < 30) {
    const L = Math.exp(-lam);
    let k = 0, p = 1;
    do { k++; p *= rng(); } while (p > L);
    return k - 1;
  }
  return Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss(rng)));
}
function stochRound(rng, x) {
  const f = Math.floor(x);
  return f + (rng() < x - f ? 1 : 0);
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const roundDiv = (a, b) => Math.floor((2 * a + b) / (2 * b)); // 整數四捨五入（a、b 皆正整數）

// ───────────────────────── 日期 ─────────────────────────
function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [y + (m <= 2 ? 1 : 0), m, d];
}
const [SY, SM, SD] = V.time.startDate.split('-').map(Number);
const EPOCH = daysFromCivil(SY, SM, SD);
const [EY, EM, ED] = V.time.endDate.split('-').map(Number);
const END_DAY = daysFromCivil(EY, EM, ED) - EPOCH;
const pad2 = (n) => String(n).padStart(2, '0');
const daysInMonth = (y, m) => daysFromCivil(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - daysFromCivil(y, m, 1);

const HOLI_SET = new Set();
const SPRING_SET = new Set();
(function buildHolidays() {
  const addRange = (a, b, set) => {
    const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
    for (let z = daysFromCivil(y1, m1, d1); z <= daysFromCivil(y2, m2, d2); z++) {
      const [y, m, d] = civilFromDays(z);
      const k = `${y}-${pad2(m)}-${pad2(d)}`;
      HOLI_SET.add(k);
      if (set) set.add(k);
    }
  };
  for (const r of V.time.holidays.springFestival) { const [a, b] = r.split('..'); addRange(a, b, SPRING_SET); }
  for (const s of V.time.holidays.other) HOLI_SET.add(s);
})();
export function dateOf(dayIdx) {
  const z = dayIdx + EPOCH;
  const [y, m, d] = civilFromDays(z);
  const dow = (((z + 4) % 7) + 7) % 7; // 0＝週日；1970-01-01 是週四
  const key = `${y}-${pad2(m)}-${pad2(d)}`;
  const spring = SPRING_SET.has(key);
  const holiday = spring || HOLI_SET.has(key) || V.time.holidays.fixed.includes(`${pad2(m)}-${pad2(d)}`);
  return { idx: dayIdx, y, m, d, dow, key, dim: daysInMonth(y, m), spring, holiday, weekend: dow === 0 || dow === 6 || holiday };
}
const ymOf = (di) => `${di.y}-${pad2(di.m)}`;

// ───────────────────────── 純函式（給測試用） ─────────────────────────
/** 營業稅（整數）。月含稅營業額未滿 20 萬元：按營業額 1%；20 萬元以上：（營業額 − 原料採購）× 5/105。 */
export function calcBusinessTax(turnover, purchases) {
  if (turnover < V.tax.bizThreshold) return Math.floor((turnover * V.tax.bizSmallRatePct) / 100);
  return Math.max(0, Math.floor(((turnover - purchases) * V.tax.bizVat[0]) / V.tax.bizVat[1]));
}
/** 年金法每月應繳（整數，無條件進位）。 */
export function annuityPayment(principal, annualRate = V.loan.rate, months = V.loan.termMonths) {
  const i = annualRate / 12;
  return Math.ceil((principal * i) / (1 - Math.pow(1 + i, -months)));
}
function costMultOfQuality(q) {
  const g = V.menu.grades;
  const pts = [g.平價, g.標準, g.講究].map((x) => [x.quality, x.cost]);
  if (q <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (q <= pts[i][0]) {
      const [q0, c0] = pts[i - 1], [q1, c1] = pts[i];
      return c0 + ((c1 - c0) * (q - q0)) / (q1 - q0);
    }
  }
  return pts[2][1];
}

// ───────────────────────── 建立世界 ─────────────────────────
const DERIVED = new WeakMap();
function derived(world) {
  let d = DERIVED.get(world);
  if (d) return d;
  const nb = world.bld.length, nl = world.lots.length;
  const aM = new Float64Array(nb * nl), passA = new Float64Array(nb * nl), ssF = new Float64Array(nb * nl), ssFbar = new Float64Array(nl);
  const coef = V.choice.distCoef;
  for (let b = 0; b < nb; b++)
    for (let l = 0; l < nl; l++) {
      const dm = world.dM[b * nl + l];
      aM[b * nl + l] = dm <= V.choice.walkRadiusM ? Math.exp((-coef * dm) / 100) : 0;
      const pa = V.familiarity.pass * Math.exp(-dm / V.familiarity.decayM);
      passA[b * nl + l] = pa;
      ssF[b * nl + l] = pa / (pa + V.familiarity.forget); // 擴張評估用：只算路過看到的穩態熟悉度
    }
  for (let l = 0; l < nl; l++) { let t = 0; for (let b = 0; b < nb; b++) t += ssF[b * nl + l]; ssFbar[l] = t / nb; }
  const lotIdx = {};
  world.lots.forEach((l, i) => (lotIdx[l.id] = i));
  const bldIdx = {};
  world.bld.forEach((b, i) => (bldIdx[b.id] = i));
  d = { aM, passA, ssF, ssFbar, lotIdx, bldIdx, nb, nl };
  DERIVED.set(world, d);
  return d;
}

export function createWorld({ mapData, distances, seed = 1, cal, playerName = '我的茶店', noRivals = false }) {
  const calv = { c: V.calibrated.c, r: V.calibrated.r, r_del: V.calibrated.r_del, c_del: V.calibrated.c_del, ...(cal || {}) };
  const mpt = V.people.metersPerTile;
  // 建築與人口
  const floorSum = {};
  for (const b of mapData.buildings) if (TYPE_KEY[b.type]) floorSum[b.type] = (floorSum[b.type] || 0) + b.floors;
  const bld = mapData.buildings
    .filter((b) => TYPE_KEY[b.type])
    .map((b) => ({ id: b.id, type: b.type, key: TYPE_KEY[b.type], x: b.x, z: b.z, pop: (V.people[TYPE_KEY[b.type]] * (mapData.populationMultiplier || 1) * b.floors) / floorSum[b.type] }));
  // 空店面
  const lots = mapData.lots.map((l, i) => {
    const rng = stream(seed, T.LOT, i);
    const ping = V.lots.areaMin + Math.floor(rng() * (V.lots.areaMax - V.lots.areaMin + 1));
    const zone = l.zone === '住宅' ? '住宅' : l.zone;
    const [lo, hi] = V.lots.rentPerPing[zone] || V.lots.rentPerPing.住宅;
    const perPing = Math.round((lo + rng() * (hi - lo)) / 100) * 100;
    const rent = ping * perPing;
    return { id: l.id, zone, district: l.district || '雲港舊城', building: l.building, x: l.x, z: l.z, ping, rentPerPing: perPing, rent, deposit: rent * V.startup.depositMonths, shopId: null };
  });
  const nl = lots.length;
  const dM = new Array(bld.length * nl).fill(1e9);
  bld.forEach((b, bi) => {
    const row = distances[b.id];
    if (row) lots.forEach((l, li) => { if (row[l.id] != null) dM[bi * nl + li] = Math.round(row[l.id] * mpt * 10) / 10; });
  });
  const ll = new Array(nl * nl).fill(1e9); // 店面到店面（用店面所屬建築中心到另一店門口近似）
  lots.forEach((la, i) => {
    const bi = bld.findIndex((b) => b.id === la.building);
    lots.forEach((_, j) => { ll[i * nl + j] = i === j ? 0 : bi >= 0 ? dM[bi * nl + j] : 1e9; });
  });

  const world = {
    v: 1, seed, t: 0, status: 'playing', endReason: null, playerName,
    cal: calv, wages: { ...V.labor.wages }, milkPct: 100, milkYears: {},
    lots, bld, dM, ll, nextShopN: 1, shops: [], companies: {}, day: null,
    events: { list: [], nextId: 1 }, eventLog: [], sched: { typhoon: null, cold: null, platformAt: -1e9 },
    popAll: bld.reduce((a, b) => a + b.pop, 0), monthly: [], stats: { wantWalk: 0, arrWalk: 0, wantDel: 0, ordDel: 0, cupsWalk: 0, cupsDel: 0, menuRev: 0 },
  };
  // 公司
  const mkCo = (id, name, cash, awareness) => ({
    id, name, cash, awareness, loans: [], adWan: 0, adDayUnits: 0, adBoostUntil: -1, nol: 0, yearProfit: 0,
    platformBoost: false, day30: [0], cm: newCM(), rows: [], promoUsed: false, borrowed: 0,
  });
  world.companies[PLAYER] = mkCo(PLAYER, playerName, V.startup.startCash, V.awareness.start.player);
  world.companies[PLAYER].expansion = newExpansion();
  if (!noRivals) {
    const R = V.rivals;
    world.companies.daji = mkCo('daji', R.daji.name, R.daji.cash, V.awareness.start.daji);
    world.companies.qingyou = mkCo('qingyou', R.qingyou.name, R.qingyou.cash, V.awareness.start.qingyou);
    R.road.names.forEach((n, i) => (world.companies['road' + (i + 1)] = mkCo('road' + (i + 1), n, R.road.cash, V.awareness.start.road)));
    const reserved = medianResidentialLot(world);
    // 開局位置（規格沒寫）：連鎖大吉進高租金的商圈與捷運站旁，青柚平價走學校與辦公，老字號小店在住宅巷弄與辦公區
    const plan = [['daji', '商圈'], ['daji', '捷運站旁'], ['qingyou', '學校'], ['qingyou', '辦公'], ['road1', '住宅'], ['road2', '住宅'], ['road3', '辦公']];
    plan.forEach(([co, zone], i) => {
      let free = lots.filter((l) => !l.shopId && l.zone === zone && l.id !== reserved);
      if (!free.length) free = lots.filter((l) => !l.shopId && l.id !== reserved);
      if (!free.length) return;
      const lot = free[Math.floor(stream(seed, T.LOT, 100 + i)() * free.length)];
      const sh = makeShop(world, { company: co, lot, name: rivalShopName(world, co, lot), rival: true });
      sh.status = 'open'; sh.openedT = 0; sh.createdT = -1;
      const [n0, m0] = V.reviews.rivalStartReviews[co.startsWith('road') ? 'road' : co];
      sh.revCnt = n0; sh.revSum = n0 * m0;
    });
    warmUp(world);
  }
  return world;
}

/** 住宅區店面裡，600 公尺內人口排中位數的那一間（規格 14.6）。 */
/** 開局暖機（規格 14.4）：在複本上照同樣規則跑 365 天（不記帳、不觸發事件、對手不調整），把各店的熟悉度寫回。 */
function warmUp(world) {
  const w = JSON.parse(JSON.stringify(world));
  w.warm = true;
  const days = V.familiarity.warmupDays;
  for (let i = 0; i < days * 24; i++) stepHour(w);
  for (const s of world.shops) { const x = w.shops.find((y) => y.id === s.id); if (x) { s.F = x.F; s.Fbar = x.Fbar; s.buyB = new Array(world.bld.length).fill(0); } }
}

export function medianResidentialLot(world) {
  const nl = world.lots.length;
  const pop = (li) => { let t = 0; for (let b = 0; b < world.bld.length; b++) if (world.dM[b * nl + li] <= V.choice.walkRadiusM) t += world.bld[b].pop; return t; };
  const r = world.lots.map((l, i) => ({ l, p: pop(i) })).filter((x) => x.l.zone === '住宅').sort((a, b) => a.p - b.p || (a.l.id < b.l.id ? -1 : 1));
  return r.length ? r[Math.floor((r.length - 1) / 2)].l.id : null;
}

function newCM() { return { cups: 0, walk: 0, del: 0, store: 0, gmv: 0, commission: 0, extraExpense: 0, researchExpense: 0, stockWriteOff: 0, facilityDayUnits: 0, chainDayUnits: 0, facilityCapex: 0, stockPurchases: 0, shopInvestment: 0, assetRecoveries: 0, earlyPrincipal: 0, earlyInterest: 0, warehouseSavings: 0, factorySavings: 0, factoryCups: 0, items: {} }; }
function newMTD() {
  return { walk: 0, del: 0, lost: 0, storeRev: 0, gmv: 0, commission: 0, cogs: 0, pack: 0, wasteMilli: 0, wageMilli: 0, openDays: 0, rentDays: 0, menuRev: 0, tradingDays: 0, waitSum: 0, waitCups: 0 };
}

const RIVAL_COLORS = { daji: '#c2413a', qingyou: '#2f9d5c', road1: '#d98a1f', road2: '#8a4fc2', road3: '#14919b' };
function rivalShopName(world, co, lot) {
  const base = world.companies[co].name;
  return co.startsWith('road') ? base : `${base}${lot.zone}店`;
}

function makeShop(world, { company, lot, name, color, rival }) {
  const n = world.nextShopN++;
  const co = world.companies[company];
  const R = V.rivals;
  const kind = company === PLAYER ? 'player' : company.startsWith('road') ? 'road' : company;
  const prices = {};
  const factor = rival ? R[kind].priceFactor : 1;
  ITEMS.forEach((k, i) => (prices[k] = Math.round(ITEM_REF[i] * factor)));
  const sh = {
    id: 'S' + n, n, lotId: lot.id, company, owner: rival ? 'rival' : 'player', name, color: color || RIVAL_COLORS[company] || '#1f9d5c',
    status: 'renovating', createdT: world.t, openAtT: world.t + V.startup.renovationDays * 24, openedT: null, closedT: null,
    rent: lot.rent, deposit: lot.deposit, inv: V.startup.firstStock,
    prices, markupPct: V.delivery.markupDefault, delivery: !rival && V.delivery.playerDefaultOn, staff: [...V.capacity.defaultStaff],
    wageLevel: rival ? R[kind].wage : 'market', grade: V.menu.defaultGrade, fixedQ: rival ? R[kind].quality : null,
    revSum: 0, revCnt: 0, quality: 60, costMult: 1, mix: [], avgPrice: 55, avgPlat: 63,
    Bw: 0, Bd: 0, waitMin: V.choice.waitBase, closedToday: false,
    today: newToday(), mtd: newMTD(), days: [], history: [], hourEMA: new Array(NHOURS).fill(0),
    promo: { kind: null, daysLeft: 0, num: 1, den: 1 }, promoPending: false, promoUsed: false, qPromoCount: 0, permCut: false, lastPromoEndIdx: -1,
    boostUntilT: -1, lossStreak: 0, shortage: { daysLeft: 0, shift: 1 }, shiftCups: [0, 0, 0], waitDay7: [],
    tot: { walk: 0, del: 0, rev: 0, menuRev: 0, lost: 0 }, lastMonthCups: 0,
    F: new Array(world.bld.length).fill(0), buyB: new Array(world.bld.length).fill(0), Fbar: 0,
  };
  if (rival) {
    sh.delivery = !!R[kind].delivery;
    if (kind === 'road') {
      sh.ownerWorks = true; sh.staff = [1, 1, 1];
      sh.rent = Math.round(lot.rent * R.road.rentFactor); sh.deposit = sh.rent * V.startup.depositMonths;
    }
  }
  recalcShop(world, sh);
  lot.shopId = sh.id;
  world.shops.push(sh);
  return sh;
}
function newToday() { return { hourly: new Array(NHOURS).fill(null).map(() => [0, 0]), walk: 0, del: 0, lost: 0, waitCups: 0, waitSum: 0, rev: 0 }; }

function platPrice(p, markup) { return roundDiv(p * (100 + markup), 100); }

/** 價格、等級、時薪改變後，重算混合比例、均價、品質、成本倍數。 */
function recalcShop(world, sh) {
  let tot = 0;
  const w = ITEMS.map((k, i) => { const x = ITEM_POP[i] * Math.pow(sh.prices[k] / ITEM_REF[i], -V.choice.mixPriceElasticity); tot += x; return x; });
  sh.mix = w.map((x) => x / tot);
  sh.avgPrice = ITEMS.reduce((s, k, i) => s + sh.mix[i] * sh.prices[k], 0);
  sh.avgPlat = ITEMS.reduce((s, k, i) => s + sh.mix[i] * platPrice(sh.prices[k], sh.markupPct), 0);
  if (sh.fixedQ != null) { sh.quality = sh.fixedQ; sh.costMult = costMultOfQuality(sh.fixedQ); }
  else { const g = V.menu.grades[sh.grade], fx = effects(world.companies[sh.company].expansion); sh.quality = g.quality + V.labor.qualityAdj[sh.wageLevel] + fx.quality; sh.costMult = g.cost * fx.material; }
}
const starOf = (sh) => (sh.revSum + V.reviews.priorStar * V.reviews.priorN) / (sh.revCnt + V.reviews.priorN);
function chainStarOf(world, sh) {
  const mine = world.shops.filter((s) => s.owner === 'player' && s.status === 'open');
  if (sh.owner !== 'player' || mine.length < 2) return starOf(sh);
  const brand = mine.reduce((a, s) => a + s.revSum + V.reviews.priorStar * V.reviews.priorN, 0) / mine.reduce((a, s) => a + s.revCnt + V.reviews.priorN, 0);
  return starOf(sh) * (1 - EXP.chain.ratingWeight) + brand * EXP.chain.ratingWeight;
}
const shopBy = (world, id) => world.shops.find((s) => s.id === id);
const liveShops = (world) => world.shops.filter((s) => s.status !== 'closed');

// ───────────────────────── 事件工具 ─────────────────────────
let CUR = null; // 本小時回傳的 frame
function logEvt(world, kind, text, extra) {
  world.eventLog.push({ t: world.t, kind, text, ...(extra || {}) });
  if (world.eventLog.length > 800) world.eventLog.splice(0, world.eventLog.length - 800);
}
function pushEvent(world, ev) {
  const e = { id: 'E' + world.events.nextId++, appearT: world.t, status: ev.choices && ev.choices.length ? 'pending' : 'info', choice: null, deadlineT: null, shopId: null, data: {}, ...ev };
  world.events.list.push(e);
  if (world.events.list.length > 300) world.events.list.splice(0, world.events.list.length - 300);
  logEvt(world, e.kind, e.title);
  if (CUR) CUR.newEvents.push({ id: e.id, kind: e.kind, title: e.title, needsChoice: e.status === 'pending' });
  return e;
}
const playerCo = (world) => world.companies[PLAYER];
function addProfit(world, co, amt) { co.yearProfit += amt; }
function charge(world, co, amt, category = 'extraExpense') { co.cash -= amt; co.yearProfit -= amt; co.cm[category] = (co.cm[category] || 0) + amt; }
// 玩家班表是總人數，老闆替代其中一位員工；路邊小店的既有班表是聘僱人數。
function hiredStaff(s, shift) { return s.staff[shift] - (s.owner === 'player' && s.ownerWorks ? 1 : 0); }

// ───────────────────────── 玩家動作 ─────────────────────────
const fail = (code, reason) => ({ ok: false, code, reason });
const okRes = (extra) => ({ ok: true, ...(extra || {}) });
function playing(world) { return world.status === 'playing' ? null : fail('ended', '遊戲已經結束'); }
function ownShop(world, id) {
  const s = shopBy(world, id);
  if (!s || s.owner !== 'player') return [null, fail('no_shop', '找不到這家店')];
  if (s.status === 'closed') return [null, fail('closed', '這家店已經關了')];
  return [s, null];
}

export function lotOpenCost(lot) {
  return V.startup.renovation + V.startup.equipment + V.startup.firstStock + lot.deposit;
}

export function openShop(world, lotId, { name, color, ownerWorks = false } = {}) {
  const e0 = playing(world); if (e0) return e0;
  const lot = world.lots.find((l) => l.id === lotId);
  if (!lot) return fail('no_lot', '找不到這個店面');
  if (lot.shopId) return fail('occupied', '這個店面已經有人租了');
  if (ownerWorks && liveShops(world).some((s) => s.owner === 'player' && s.ownerWorks)) return fail('owner_busy', '老闆一次只能顧一家店，請先關掉另一家店的自己顧店設定');
  const co = playerCo(world);
  const cost = lotOpenCost(lot);
  if (co.cash < cost) return fail('cash', `現金不夠：開店要 ${cost.toLocaleString()} 元（裝潢、設備、首批原料加押金），你只有 ${co.cash.toLocaleString()} 元`);
  co.cash -= cost;
  co.cm.shopInvestment = (co.cm.shopInvestment || 0) + cost;
  const n = world.shops.filter((s) => s.owner === 'player').length + 1;
  const sh = makeShop(world, { company: PLAYER, lot, name: name || `${co.name}${n}號店`, color, rival: false });
  sh.ownerWorks = !!ownerWorks;
  sh.mtd.rentDays = 1;
  logEvt(world, 'open', `玩家租下 ${lot.id}（${lot.zone}），開設「${sh.name}」`);
  // 大吉茶行的反擊：300 公尺內開店 → 社群廣告加到每月 8 萬，維持 3 個月
  const R = V.rivals.daji;
  const li = derived(world).lotIdx[lot.id], nl = derived(world).nl;
  if (world.companies.daji && world.shops.some((s) => s.company === 'daji' && s.status !== 'closed' && world.ll[derived(world).lotIdx[s.lotId] * nl + li] <= R.counterRadiusM)) {
    world.companies.daji.adBoostUntil = (world.t / 24) + R.counterMonths * 30;
    logEvt(world, 'rival', `大吉茶行：玩家在 ${R.counterRadiusM} 公尺內開店，社群廣告加到每月 ${R.counterAdWan} 萬`);
  }
  return okRes({ shopId: sh.id, cost, openAtT: sh.openAtT });
}

export function closeShop(world, shopId) {
  const e0 = playing(world); if (e0) return e0;
  const [s, e] = ownShop(world, shopId); if (e) return e;
  closeShopInternal(world, s, '玩家關店');
  return okRes({ refund: s.deposit, equipment: Math.round(V.startup.equipment * V.startup.equipmentRecovery) });
}

function closeShopInternal(world, s, why) {
  const co = world.companies[s.company];
  const di = world.day || dateOf(0);
  settleShop(world, s, di.dim, true);
  co.cash += s.deposit + Math.round(V.startup.equipment * V.startup.equipmentRecovery);
  co.cm.assetRecoveries = (co.cm.assetRecoveries || 0) + s.deposit + Math.round(V.startup.equipment * V.startup.equipmentRecovery);
  s.status = 'closed'; s.closedT = world.t;
  const lot = world.lots.find((l) => l.id === s.lotId); lot.shopId = null;
  s.Bw = 0; s.Bd = 0;
  logEvt(world, 'close', `「${s.name}」關店：${why}`);
}

export function setPrices(world, shopId, prices) {
  const [s, e] = ownShop(world, shopId); if (e) return e;
  for (const [k, p] of Object.entries(prices)) {
    const i = ITEMS.indexOf(k);
    if (i < 0) return fail('item', `沒有「${k}」這個品項`);
    const lo = ITEM_REF[i] + V.menu.priceMinOffset, hi = ITEM_REF[i] + V.menu.priceMaxOffset;
    if (!Number.isInteger(p) || p < lo || p > hi || (p - ITEM_REF[i]) % V.menu.priceStep !== 0)
      return fail('price', `「${k}」售價要在 ${lo} 到 ${hi} 元之間，每格 ${V.menu.priceStep} 元`);
  }
  Object.assign(s.prices, prices);
  recalcShop(world, s);
  return okRes();
}
export function setMarkup(world, shopId, pct) {
  const [s, e] = ownShop(world, shopId); if (e) return e;
  if (!Number.isInteger(pct) || pct < 0 || pct > V.delivery.markupMax) return fail('markup', `平台加價率要在 0 到 ${V.delivery.markupMax}% 之間的整數`);
  s.markupPct = pct; recalcShop(world, s);
  return okRes();
}
export function setStaffing(world, shopId, staff) {
  const [s, e] = ownShop(world, shopId); if (e) return e;
  if (!Array.isArray(staff) || staff.length !== 3 || staff.some((n) => !Number.isInteger(n) || n < V.capacity.staffMin || n > V.capacity.staffMax))
    return fail('staff', `三個班每班要 ${V.capacity.staffMin} 到 ${V.capacity.staffMax} 人`);
  s.staff = [...staff];
  return okRes();
}
export function setOwnerWorks(world, shopId, on) {
  const [s, e] = ownShop(world, shopId); if (e) return e;
  if (on && liveShops(world).some((x) => x.owner === 'player' && x.id !== shopId && x.ownerWorks)) return fail('owner_busy', '老闆一次只能顧一家店，請先關掉另一家店的自己顧店設定');
  s.ownerWorks = !!on;
  return okRes();
}

// ───────────────────────── 連鎖後勤與研發 ─────────────────────────
export function buildFacility(world, key) {
  const e = playing(world); if (e) return e;
  if (!FACILITY_KEYS.includes(key)) return fail('facility', '沒有這項後勤設施');
  const co = playerCo(world), exp = co.expansion, cfg = EXP.facilities[key], f = exp.facilities[key];
  if (f.status !== 'none') return fail('built', '這項設施已建置或施工中');
  if (co.cash < cfg.cost) return fail('cash', `現金不足：建置${cfg.name}需要 ${cfg.cost.toLocaleString()} 元`);
  co.cash -= cfg.cost; co.cm.facilityCapex = (co.cm.facilityCapex || 0) + cfg.cost;
  f.status = 'building'; f.active = true; f.completeAtT = (Math.floor(world.t / 24) + cfg.days) * 24;
  logEvt(world, 'facility', `開始建置${cfg.name}，${cfg.days} 天後啟用`);
  return okRes({ completeAtT: f.completeAtT, cost: cfg.cost });
}
export function orderWarehouseStock(world, value) {
  const e = playing(world); if (e) return e;
  const co = playerCo(world), exp = co.expansion, f = exp.facilities.warehouse, cfg = EXP.facilities.warehouse;
  if (!ready(exp, 'warehouse')) return fail('warehouse', '中央倉庫還沒啟用');
  if (!Number.isInteger(value) || value < 10000 || value % 10000 !== 0) return fail('stock', '進貨原價額度以 1 萬元為單位');
  if (f.stockValue + f.orders.reduce((a, o) => a + o.value, 0) + value > cfg.capacity) return fail('capacity', '已超過倉庫容量，包含在途進貨');
  const cost = Math.round(value * (1 - cfg.discount));
  if (co.cash < cost) return fail('cash', '現金不足以支付這批進貨');
  co.cash -= cost; co.cm.stockPurchases = (co.cm.stockPurchases || 0) + cost;
  const arriveT = (Math.floor(world.t / 24) + cfg.leadDays) * 24;
  f.orders.push({ value, cost, arriveT });
  return okRes({ cost, arriveT });
}
export function setWarehouseAuto(world, on, target = 200000) {
  const e = playing(world); if (e) return e;
  const co = playerCo(world), f = co.expansion.facilities.warehouse;
  if (!ready(co.expansion, 'warehouse')) return fail('warehouse', '中央倉庫還沒啟用');
  if (!Number.isInteger(target) || target < 20000 || target > EXP.facilities.warehouse.capacity || target % 10000 !== 0) return fail('target', '備貨目標必須在 2 萬到 80 萬元之間，以 1 萬元為單位');
  f.auto = !!on; f.target = target;
  return okRes();
}
export function setFacilityActive(world, key, on) {
  const e = playing(world); if (e) return e;
  const co = playerCo(world), exp = co.expansion;
  if (!['lab', 'factory'].includes(key) || !ready(exp, key)) return fail('facility', '設施尚未啟用');
  exp.facilities[key].active = !!on;
  if (key === 'factory' && !on) exp.factoryLeft = 0;
  return okRes();
}
export function startResearch(world, key) {
  const e = playing(world); if (e) return e;
  const co = playerCo(world), exp = co.expansion, p = EXP.projects[key];
  if (!p) return fail('project', '沒有這個研發專案');
  if (!ready(exp, 'lab') || !exp.facilities.lab.active) return fail('lab', '請先啟用研發室');
  if (exp.projects[key]) return fail('complete', '這個專案已經完成');
  if (exp.research) return fail('busy', '同一時間只能進行一個專案');
  if (co.cash < p.cost) return fail('cash', '現金不足以支付研發費');
  charge(world, co, p.cost, 'researchExpense');
  exp.research = { key, remainingDays: p.days, startedDay: Math.floor(world.t / 24) };
  logEvt(world, 'research', `開始研發「${p.name}」，預計 ${p.days} 天`);
  return okRes();
}
export function closeFacility(world, key) {
  const e = playing(world); if (e) return e;
  if (!FACILITY_KEYS.includes(key)) return fail('facility', '沒有這項後勤設施');
  const co = playerCo(world), exp = co.expansion, f = exp.facilities[key], cfg = EXP.facilities[key];
  if (!cfg || f.status === 'none') return fail('facility', '沒有可關閉的設施');
  const stockRefund = Math.floor(f.stockCost * 0.8), loss = f.stockCost - stockRefund;
  const refund = Math.round(cfg.cost * (f.status === 'building' ? 0.5 : 0.2)) + stockRefund + f.orders.reduce((a, o) => a + o.cost, 0);
  co.cash += refund; co.yearProfit -= loss; co.cm.stockWriteOff = (co.cm.stockWriteOff || 0) + loss;
  co.cm.assetRecoveries = (co.cm.assetRecoveries || 0) + refund;
  exp.facilities[key] = newExpansion().facilities[key];
  if (key === 'lab') exp.research = null;
  if (key === 'factory') exp.factoryLeft = 0;
  logEvt(world, 'facility', `關閉${cfg.name}，回收 ${refund.toLocaleString()} 元`);
  return okRes({ refund });
}
function expansionDay(world, di) {
  const co = playerCo(world), exp = co.expansion;
  if (!exp) return;
  for (const key of FACILITY_KEYS) {
    const f = exp.facilities[key], cfg = EXP.facilities[key];
    if (f.status === 'building' && f.completeAtT <= world.t) {
      f.status = 'ready'; pushEvent(world, { kind: 'info', title: `${cfg.name}啟用`, text: `${cfg.name}已完成建置。固定支出從今天起算。`, choices: [] });
    }
    if (f.status === 'ready') co.cm.facilityDayUnits = (co.cm.facilityDayUnits || 0) + (f.active ? cfg.monthly : cfg.standby);
  }
  const openCount = world.shops.filter((s) => s.owner === 'player' && s.status === 'open').length;
  co.cm.chainDayUnits = (co.cm.chainDayUnits || 0) + Math.max(0, openCount - 1) * EXP.chain.managementPerShop;
  const f = exp.facilities.warehouse;
  for (const o of f.orders.filter((o) => o.arriveT <= world.t)) { f.stockValue += o.value; f.stockCost += o.cost; }
  f.orders = f.orders.filter((o) => o.arriveT > world.t);
  if (ready(exp, 'warehouse') && f.auto) {
    const supply = f.stockValue + f.orders.reduce((a, o) => a + o.value, 0);
    if (supply < f.target / 2) {
      const value = Math.min(Math.floor((f.target - supply) / 10000) * 10000, Math.floor(co.cash / (10000 * (1 - EXP.facilities.warehouse.discount))) * 10000);
      if (value >= 10000) orderWarehouseStock(world, value);
    }
  }
  exp.factoryLeft = ready(exp, 'factory') && exp.facilities.factory.active && exp.batchUntilT <= world.t ? EXP.facilities.factory.cupsDaily : 0;
  if (exp.research && ready(exp, 'lab') && exp.facilities.lab.active && di.idx > exp.research.startedDay) {
    exp.research.remainingDays--;
    if (exp.research.remainingDays <= 0) {
      const key = exp.research.key; exp.projects[key] = true; exp.research = null;
      for (const s of world.shops) if (s.owner === 'player' && s.status !== 'closed') recalcShop(world, s);
      pushEvent(world, { kind: 'info', title: `研發完成：${EXP.projects[key].name}`, text: EXP.projects[key].note, choices: [] });
    }
  }

}
function warehouseSupply(world, nominal) {
  const co = playerCo(world), exp = co.expansion;
  if (!ready(exp, 'warehouse') || nominal <= 0) return { used: 0, cost: 0 };
  const f = exp.facilities.warehouse, used = Math.min(f.stockValue, nominal);
  const cost = f.stockValue ? Math.round(f.stockCost * used / f.stockValue) : 0;
  f.stockValue -= used; f.stockCost -= cost;
  co.cm.warehouseSavings = (co.cm.warehouseSavings || 0) + used - cost;
  return { used, cost };
}
export function setWageLevel(world, shopId, level) {
  const [s, e] = ownShop(world, shopId); if (e) return e;
  if (!WAGE_LEVELS.includes(level)) return fail('wage', '時薪等級只有 basic、market、high');
  s.wageLevel = level; recalcShop(world, s);
  return okRes();
}
export function setGrade(world, shopId, grade) {
  const [s, e] = ownShop(world, shopId); if (e) return e;
  if (!V.menu.grades[grade]) return fail('grade', '原料等級只有平價、標準、講究');
  s.grade = grade; recalcShop(world, s);
  return okRes();
}
export function setDelivery(world, shopId, on) {
  const [s, e] = ownShop(world, shopId); if (e) return e;
  s.delivery = !!on;
  return okRes();
}
export function setSocialAd(world, wan) {
  const e0 = playing(world); if (e0) return e0;
  if (!Number.isInteger(wan) || (wan !== 0 && (wan < V.awareness.socialMinWan || wan > V.awareness.socialMaxWan)))
    return fail('ad', `社群廣告每月要 ${V.awareness.socialMinWan} 到 ${V.awareness.socialMaxWan} 萬元，或填 0 關閉`);
  playerCo(world).adWan = wan;
  return okRes();
}
export function hireInfluencer(world, tier) {
  const e0 = playing(world); if (e0) return e0;
  const t = V.awareness.influencer[tier - 1];
  if (!t) return fail('tier', '網紅方案只有 1、2、3 三檔');
  const co = playerCo(world);
  if (co.cash < t.cost) return fail('cash', `現金不夠：這檔網紅合作要 ${t.cost.toLocaleString()} 元`);
  charge(world, co, t.cost);
  co.awareness = Math.min(1, co.awareness + t.aware);
  let viral = false;
  if (stream(world.seed, T.VIRAL, world.t, tier)() < t.viral) { viral = true; startViral(world, PLAYER, '網紅合作'); }
  return okRes({ viral });
}
function startViral(world, companyId, cause) {
  const until = world.t + V.events.viralDays * 24;
  const shops = world.shops.filter((s) => s.company === companyId && s.status !== 'closed');
  shops.forEach((s) => (s.boostUntilT = until));
  if (companyId === PLAYER) pushEvent(world, { kind: 'viral', title: '爆紅！', text: `${cause}帶來一波話題，未來 ${V.events.viralDays} 天客人是平常的 ${V.events.viralMult} 倍，小心產能。`, choices: [] });
  else logEvt(world, 'viral', `${world.companies[companyId].name} 爆紅（${cause}）`);
}
export function startOpeningPromo(world, shopId) {
  const [s, e] = ownShop(world, shopId); if (e) return e;
  if (s.promoUsed) return fail('used', '這家店的開幕買一送一已經用過了');
  s.promoUsed = true;
  if (s.status === 'open') beginOpeningPromo(s); else s.promoPending = true;
  return okRes({ startsOnOpening: s.status !== 'open' });
}
function beginOpeningPromo(s) {
  s.promoPending = false;
  s.promo = { kind: 'open1p1', daysLeft: V.awareness.openingPromoDays, num: V.awareness.openingPromoPriceNum[0], den: V.awareness.openingPromoPriceNum[1] };
}

export function takeLoan(world, kind, amount) {
  const e0 = playing(world); if (e0) return e0;
  const L = V.loan;
  if (kind !== 'start' && kind !== 'working') return fail('kind', '貸款只有開辦（start）和週轉（working）兩種');
  if (!Number.isInteger(amount) || amount <= 0 || amount % L.unit !== 0) return fail('amount', `貸款金額要是 ${L.unit.toLocaleString()} 元的整數倍`);
  const co = playerCo(world);
  const used = co.loans.filter((l) => l.kind === kind).reduce((s, l) => s + l.balance, 0);
  const max = kind === 'start' ? L.startMax : L.workingMax;
  if (used + amount > max) return fail('quota', `${kind === 'start' ? '開辦' : '週轉'}貸款額度 ${max.toLocaleString()} 元，已用 ${used.toLocaleString()} 元`);
  addLoan(co, kind, amount);
  return okRes({ payment: annuityPayment(amount) });
}
export function repayLoan(world, loanId, amount) {
  const e = playing(world); if (e) return e;
  const co = playerCo(world), loan = co.loans.find((l) => l.id === loanId);
  if (!loan) return fail('loan', '找不到這筆貸款');
  if (!Number.isInteger(amount) || amount <= 0 || amount > loan.balance) return fail('amount', '還款金額必須是正整數，且不能超過剩餘本金');
  if (amount > co.cash) return fail('cash', '現金不足以還款');
  const di = world.day || dateOf(Math.floor(world.t / 24));
  co.cm.earlyInterest = (co.cm.earlyInterest || 0) + Math.round(amount * V.loan.rate / 12 * di.d / di.dim);
  co.cash -= amount; loan.balance -= amount;
  co.cm.earlyPrincipal = (co.cm.earlyPrincipal || 0) + amount;
  if (loan.balance === 0) co.loans = co.loans.filter((l) => l !== loan);
  else loan.payment = annuityPayment(loan.balance, V.loan.rate, loan.left);
  logEvt(world, 'loan', `提前償還本金 ${amount.toLocaleString()} 元，未收提前還款費`);
  return okRes({ balance: loan.balance, payment: loan.balance ? loan.payment : 0 });
}
function addLoan(co, kind, amount) {
  co.cash += amount;
  co.borrowed = (co.borrowed || 0) + amount;
  const n = Math.max(co.nextLoanN || 1, ...co.loans.map((l) => +(l.id.match(/^L(\d+)/)?.[1] || 0) + 1));
  co.nextLoanN = n + 1;
  co.loans.push({ id: 'L' + n + '-' + kind, kind, principal: amount, balance: amount, payment: annuityPayment(amount), left: V.loan.termMonths });
}

export function setPlatformBoost(world, on) {
  const co = playerCo(world);
  if (on && !world.events.list.some((e) => e.kind === 'platform')) return fail('noffer', '平台還沒有推出付費曝光方案');
  co.platformBoost = !!on;
  return okRes();
}

export function respondEvent(world, eventId, choice) {
  const ev = world.events.list.find((e) => e.id === eventId);
  if (!ev) return fail('no_event', '找不到這個事件');
  if (ev.status !== 'pending') return fail('done', '這個事件已經處理過了');
  if (!ev.choices.some((c) => c.key === choice)) return fail('choice', '沒有這個選項');
  return applyChoice(world, ev, choice, false);
}
function applyChoice(world, ev, key, auto) {
  const co = playerCo(world);
  const cost = ev.choices.find((c) => c.key === key).cost || 0;
  if (cost && co.cash < cost && !auto) return fail('cash', `現金不夠：這個選項要 ${cost.toLocaleString()} 元`);
  if (cost && co.cash >= cost) charge(world, co, cost);
  ev.status = 'resolved'; ev.choice = key; ev.auto = auto;
  logEvt(world, 'decision', `${ev.title}：${ev.choices.find((c) => c.key === key).label}${auto ? '（到期自動套用）' : ''}`);
  if (ev.kind === 'typhoon' && world.sched.typhoon) world.sched.typhoon.choice = key;
  if (ev.kind === 'cold' && world.sched.cold) world.sched.cold.hot = key === 'A';
  if (ev.kind === 'milk' && key === 'A')
    for (const s of world.shops) if (s.owner === 'player' && s.status !== 'closed') {
      const hi = ITEM_REF[MILK_IDX] + V.menu.priceMaxOffset;
      s.prices.鮮奶茶 = Math.min(hi, s.prices.鮮奶茶 + V.events.milkPriceUp); recalcShop(world, s);
    }
  if (ev.kind === 'platform') co.platformBoost = key === 'A';
  if (ev.kind === 'batch') {
    const exp = co.expansion;
    if (key === 'A') {
      exp.batchUntilT = world.t + EXP.chain.batchDays * 24; exp.factoryLeft = 0;
      const f = exp.facilities.warehouse, loss = Math.round(f.stockCost * 0.1);
      f.stockValue -= Math.round(f.stockValue * 0.1); f.stockCost -= loss;
      co.yearProfit -= loss; co.cm.stockWriteOff = (co.cm.stockWriteOff || 0) + loss;
    } else {
      for (const s of liveShops(world)) if (s.owner === 'player' && s.status === 'open') { s.revCnt += EXP.chain.badReviews; s.revSum += EXP.chain.badReviews; }
    }
  }
  if (ev.kind === 'flame' && key === 'A') {
    const s = shopBy(world, ev.shopId);
    if (s) { const back = Math.floor(V.events.flameStars / 2); s.revCnt -= back; s.revSum -= back; }
  }
  return okRes();
}
/** 到期仍未回應的事件，套用預設（不動作）選項。 */
function expireEvents(world) {
  const defaults = { typhoon: 'A', cold: 'B', milk: 'B', platform: 'B', flame: 'B', batch: 'B' };
  for (const ev of world.events.list)
    if (ev.status === 'pending' && ev.deadlineT != null && world.t >= ev.deadlineT) applyChoice(world, ev, defaults[ev.kind], true);
}

// ───────────────────────── 每小時模擬 ─────────────────────────
export function clockOf(world, t = world.t) {
  const di = world.day && world.day.idx === Math.floor(t / 24) ? world.day : dateOf(Math.floor(t / 24));
  return { t, dayIndex: di.idx, year: di.y, month: di.m, day: di.d, hour: t % 24, dow: di.dow, dateStr: di.key, isWeekend: di.weekend, isHoliday: di.holiday };
}

export function stepHour(world) {
  const t = world.t, h = t % 24;
  const frame = { t, clock: null, weather: null, shops: [], newEvents: [], status: world.status };
  if (world.status !== 'playing') { frame.clock = clockOf(world); return frame; }
  CUR = frame;
  try {
    if (h === 0) startDay(world);
    if (world.status !== 'playing') { frame.clock = clockOf(world); frame.status = world.status; return frame; }
    for (const s of world.shops) if (s.status === 'renovating' && t >= s.openAtT) openForBusiness(world, s);
    frame.clock = clockOf(world);
    frame.weather = world.day.weather;
    simHour(world, frame, h);
    if (h === 23) endDay(world);
    world.t++;
    frame.status = world.status;
    return frame;
  } finally { CUR = null; }
}
function openForBusiness(world, s) {
  s.status = 'open'; s.openedT = world.t; s.mtd.openDays += 1; s.mtd.tradingDays += 1;
  if (s.promoPending) beginOpeningPromo(s);
  if (s.owner === 'player') pushEvent(world, { kind: 'info', title: `「${s.name}」裝修完成，開張了`, text: '店面已經裝修完，今天起對外營業。', choices: [] });
}

function simHour(world, frame, h) {
  const day = world.day;
  const inHours = h >= OPEN_H && h < CLOSE_H;
  const D = derived(world);
  const live = liveShops(world);
  const act = inHours ? live.filter((s) => s.status === 'open' && !s.closedToday) : [];
  if (!inHours || !act.length) {
    for (const s of live) frame.shops.push(frameEntry(s, { open: false }));
    return;
  }
  const col = h - OPEN_H;
  const si = SHIFTS.findIndex(([a, b]) => h >= a && h < b);
  const cal = world.cal;
  const nb = D.nb, nl = D.nl, na = act.length;
  const Ch = V.choice;
  // ── 需求 ──
  const Dm = new Float64Array(nb);
  let want = 0;
  for (let b = 0; b < nb; b++) {
    const bd = world.bld[b];
    const m = (V.demand.hourShare[bd.key][col] / 100) * cal.r * day.wk[bd.key] * day.season * day.walkW;
    Dm[b] = bd.pop * m; want += Dm[b];
  }
  const popAll = world.bld.reduce((s, b) => s + b.pop, 0);
  const dpool = popAll * V.people.deliveryPoolMult * cal.r_del * (V.demand.hourShare.外送[col] / 100) * day.wk.外送 * day.season * day.delW;
  // 各店靜態項
  const lotI = act.map((s) => D.lotIdx[s.lotId]);
  const Ew0 = new Float64Array(na), Ed0 = new Float64Array(na), cap = new Int32Array(na), boost = new Float64Array(na), staffNow = new Int32Array(na);
  const hasDel = new Uint8Array(na);
  act.forEach((s, j) => {
    const co = world.companies[s.company];
    const promoMult = s.promo.daysLeft > 0 ? s.promo.num / s.promo.den : 1;
    const star = chainStarOf(world, s);
    Ew0[j] = Math.exp(cal.c - Ch.priceCoef * Math.log((s.avgPrice * promoMult) / Ch.refPrice) + Ch.qualityCoef * (s.quality - Ch.qualityRef) + Ch.starCoef * (star - Ch.starRef));
    if (s.delivery) {
      hasDel[j] = 1;
      const k2 = Math.min(1, 1 - (1 - s.Fbar) * (1 - co.awareness) + (co.platformBoost ? V.delivery.boostAware : 0));
      Ed0[j] = Math.exp(cal.c_del - Ch.priceCoef * Math.log(s.avgPlat / V.delivery.refPrice) + Ch.qualityCoef * (s.quality - Ch.qualityRef) + V.delivery.starCoef * (star - Ch.starRef) + Ch.awareCoef * Math.log(Ch.awareFloor + (1 - Ch.awareFloor) * k2));
    }
    let hired = hiredStaff(s, si);
    if (s.shortage.daysLeft > 0 && s.shortage.shift === si) hired = Math.max(s.ownerWorks ? 0 : 1, hired - 1);
    staffNow[j] = hired;
    const n = hired + (s.ownerWorks ? 1 : 0);
    const sp = V.capacity.wageSpeed[s.wageLevel] * (s.owner === 'player' ? effects(co.expansion).speed : 1);
    cap[j] = Math.floor((n === 1 ? V.capacity.soloCups : (n - 1) * V.capacity.workerCups) * sp + 1e-6);
    boost[j] = t_boost(world, s) ? V.events.viralMult : 1;
  });
  // 每棟樓各自認識每家店：有效知名度 = 1 − (1 − F_sj) × (1 − 品牌名氣)；G＝距離衰減 × 知名度項
  const G = new Float64Array(nb * na);
  {
    const kA = act.map((s) => world.companies[s.company].awareness);
    for (let b = 0; b < nb; b++) for (let j = 0; j < na; j++) {
      const a = D.aM[b * nl + lotI[j]];
      if (a === 0) continue;
      const ke = 1 - (1 - act[j].F[b]) * (1 - kA[j]);
      G[b * na + j] = a * Math.pow(Ch.awareFloor + (1 - Ch.awareFloor) * ke, Ch.awareCoef);
    }
  }
  // ── 不動點：預期等候 ↔ 到店人數 ──
  const W = new Float64Array(na).fill(V.choice.waitBase);
  const lamW = new Float64Array(na), lamD = new Float64Array(na), E = new Float64Array(na), ea = new Float64Array(na);
  const leaveOf = (w) => (w > Ch.walkAwayAfterMin ? Math.min(Ch.walkAwayMax, (w - Ch.walkAwayAfterMin) / Ch.walkAwayFull) : 0);
  // 規格 15.2：客人記得要等——效用用上一小時的等候（每天開門第一小時重設為基本等候）；本小時的等候只決定有沒有人走掉
  const Wu = act.map((s) => (col === 0 ? V.choice.waitBase : s.waitMin));
  for (let j = 0; j < na; j++) E[j] = Ew0[j] * Math.exp(-Ch.waitCoef * Wu[j]);
  lamW.fill(0);
  for (let b = 0; b < nb; b++) {
    if (Dm[b] === 0) continue;
    let S = 0;
    for (let j = 0; j < na; j++) { ea[j] = E[j] * G[b * na + j]; S += ea[j]; }
    if (S === 0) continue;
    const f = Dm[b] / (1 + S);
    for (let j = 0; j < na; j++) lamW[j] += f * ea[j];
  }
  let SD = 0;
  for (let j = 0; j < na; j++) if (hasDel[j]) SD += Ed0[j] * Math.exp(-V.delivery.waitCoef * Wu[j]);
  for (let j = 0; j < na; j++) lamD[j] = hasDel[j] ? (dpool * Ed0[j] * Math.exp(-V.delivery.waitCoef * Wu[j])) / (1 + SD) : 0;
  for (let it = 0; it < 8; it++) {
    for (let j = 0; j < na; j++) {
      const s = act[j];
      const lw = lamW[j] * boost[j], ld = lamD[j] * boost[j];
      const joined = lw * (1 - leaveOf(W[j])) + ld;
      W[j] = 0.5 * W[j] + 0.5 * queueWait(s.Bw + s.Bd + joined, cap[j]);
    }
  }
  // 來源建築分配（畫面用）
  const origins = act.map(() => null);
  {
    const contrib = act.map(() => new Float64Array(nb));
    for (let b = 0; b < nb; b++) {
      if (Dm[b] === 0) continue;
      let S = 0;
      for (let j = 0; j < na; j++) { ea[j] = E[j] * G[b * na + j]; S += ea[j]; }
      if (S === 0) continue;
      const f = Dm[b] / (1 + S);
      for (let j = 0; j < na; j++) contrib[j][b] = f * ea[j];
    }
    act.forEach((s, j) => (origins[j] = contrib[j]));
  }
  world.stats.wantWalk += want; world.stats.wantDel += dpool;
  const dayBrand = {};
  // ── 抽樣與產出 ──
  act.forEach((s, j) => {
    const co = world.companies[s.company];
    const rngP = stream(world.seed, T.POIS, world.t, s.n);
    const arrW = poisson(rngP, lamW[j] * boost[j]);
    const arrD = poisson(rngP, lamD[j] * boost[j]);
    // 客人不是平均地來：用實際來客數重算本小時等候（規格 15.1 的「本小時來客」），再決定走掉多少
    let w = W[j];
    for (let it = 0; it < 4; it++) w = 0.5 * w + 0.5 * queueWait(s.Bw + s.Bd + arrW * (1 - leaveOf(w)) + arrD, cap[j]);
    const lostW = Math.min(arrW, stochRound(stream(world.seed, T.LEAVE, world.t, s.n), arrW * leaveOf(w)));
    const joinedW = arrW - lostW;
    const todoW = s.Bw + joinedW, todoD = s.Bd + arrD, todo = todoW + todoD;
    const served = Math.min(todo, cap[j]);
    let sW = todo ? Math.round((served * todoW) / todo) : 0;
    sW = Math.min(sW, todoW);
    let sD = served - sW;
    if (sD > todoD) { sD = todoD; sW = served - sD; }
    s.Bw = todoW - sW; s.Bd = todoD - sD;
    { const oc = origins[j]; let tc = 0; for (let b = 0; b < nb; b++) tc += oc[b];
      if (tc > 0 && sW > 0) { const k = sW / tc; for (let b = 0; b < nb; b++) s.buyB[b] += oc[b] * k; } }
    // 品項、營收、成本
    const rngI = stream(world.seed, T.ITEM, world.t, s.n);
    const nW = new Array(NI).fill(0), nD = new Array(NI).fill(0);
    for (let k = 0; k < sW; k++) nW[pick(s.mix, rngI())]++;
    for (let k = 0; k < sD; k++) nD[pick(s.mix, rngI())]++;
    const pm = s.promo.daysLeft > 0 ? s.promo : null;
    const commPct = V.delivery.commission + (co.platformBoost ? V.delivery.boostCommissionAdd : 0);
    const covered = s.owner === 'player' ? Math.min(served, co.expansion.factoryLeft) : 0;
    if (covered) { co.expansion.factoryLeft -= covered; co.cm.factoryCups += covered; }
    const factoryFactor = served ? 1 - EXP.facilities.factory.saving * covered / served : 1;
    const itemCosts = [];
    let storeRev = 0, gmv = 0, cogs = 0, menuRev = 0;
    for (let i = 0; i < NI; i++) {
      const nm = ITEMS[i];
      const rv = pm ? Math.floor((nW[i] * s.prices[nm] * pm.num) / pm.den) : nW[i] * s.prices[nm];
      const gv = nD[i] * platPrice(s.prices[nm], s.markupPct);
      const mp = i === MILK_IDX ? world.milkPct : 100;
      const baseCost = Math.round(((nW[i] + nD[i]) * ITEM_COST[i] * s.costMult * mp) / 100);
      const cg = Math.round(baseCost * factoryFactor); itemCosts.push(cg);
      if (s.owner === 'player') co.cm.factorySavings += baseCost - cg;
      storeRev += rv; gmv += gv; cogs += cg; menuRev += (nW[i] + nD[i]) * s.prices[nm];
      const it = co.cm.items[nm] || (co.cm.items[nm] = { cups: 0, rev: 0, cost: 0 });
      it.cups += nW[i] + nD[i]; it.rev += rv + gv; it.cost += cg;
    }
    const pack = V.menu.packagingPerCup * served;
    const commission = Math.round((gmv * commPct) / 100);
    co.cash += storeRev + gmv - commission;
    const buy = cogs + pack, fromInv = Math.min(s.inv, buy);
    const supply = s.owner === 'player' ? warehouseSupply(world, Math.max(0, cogs - fromInv)) : { used: 0, cost: 0 };
    s.inv -= fromInv; co.cash -= buy - fromInv - supply.used;
    const saving = supply.used - supply.cost, nominalCogs = cogs;
    cogs -= saving;
    let allocated = 0, runningCost = 0;
    for (let i = 0; i < NI; i++) {
      runningCost += itemCosts[i];
      const next = nominalCogs ? Math.round(saving * runningCost / nominalCogs) : 0;
      const it = co.cm.items[ITEMS[i]], actualCost = itemCosts[i] - next + allocated;
      it.cost -= next - allocated; allocated = next;
      it.wasteMilli = (it.wasteMilli || 0) + actualCost * Math.round((V.menu.wasteRate - (s.owner === 'player' ? effects(co.expansion).waste : 0)) * 1000);
    }
    // 人事（月底付）
    const wageH = world.wages[s.wageLevel];
    s.mtd.wageMilli += staffNow[j] * wageH * EMPLOYER_MILLI;
    // 累計
    const m = s.mtd;
    m.wasteMilli = (m.wasteMilli || 0) + cogs * Math.round((V.menu.wasteRate - (s.owner === 'player' ? effects(co.expansion).waste : 0)) * 1000);
    m.walk += sW; m.del += sD; m.storeRev += storeRev; m.gmv += gmv; m.commission += commission; m.cogs += cogs; m.pack += pack; m.menuRev += menuRev;
    const cm = co.cm;
    cm.cups += served; cm.walk += sW; cm.del += sD; cm.store += storeRev; cm.gmv += gmv; cm.commission += commission;
    co.day30[co.day30.length - 1] += served;
    const td = s.today;
    td.hourly[col][0] += sW; td.hourly[col][1] += sD; td.walk += sW; td.del += sD; td.lost += lostW; td.rev += storeRev + gmv - commission;
    td.waitSum += w * served; td.waitCups += served; s.mtd.waitSum += w * served; s.mtd.waitCups += served;
    s.waitMin = w;
    s.shiftCups[si] += served;
    s.tot.walk += sW; s.tot.del += sD; s.tot.rev += storeRev + gmv - commission; s.tot.menuRev += menuRev; s.tot.lost += lostW;
    world.stats.arrWalk += arrW; world.stats.ordDel += arrD; world.stats.cupsWalk += sW; world.stats.cupsDel += sD; world.stats.menuRev += menuRev;
    // 評價
    if (served > 0) {
      const rngR = stream(world.seed, T.STAR, world.t, s.n);
      const nr = poisson(rngR, served * V.reviews.rate);
      if (nr > 0) {
        const R = V.reviews;
        const sat = R.satBase + R.satQuality * (s.quality - 60) - R.satWait * Math.max(0, w - R.satWaitFree) - R.satPrice * Math.max(0, Math.log(s.avgPrice / REF_AVG));
        for (let k = 0; k < nr; k++) { const st = clamp(Math.round(sat + R.noiseSd * gauss(rngR)), 1, 5); s.revSum += st; s.revCnt++; }
      }
    }
    // 營業結束沒做完的訂單取消
    let cancelled = 0;
    if (h === CLOSE_H - 1) { cancelled = s.Bw + s.Bd; s.Bw = 0; s.Bd = 0; td.lost += cancelled; s.tot.lost += cancelled; }
    s.mtd.lost += lostW + cancelled;
    frame.shops.push(frameEntry(s, {
      open: true, walkOrders: joinedW, walkServed: sW, deliveryOrders: arrD, deliveryServed: sD, queue: s.Bw + s.Bd, waitMin: Math.round(w * 10) / 10, lost: lostW + cancelled,
      walkFrom: distributeOrigins(world, origins[j], joinedW), staffNow: staffNow[j],
    }));
  });
  for (const s of live) if (!act.includes(s)) frame.shops.push(frameEntry(s, { open: false }));
}
/** 規格 15.1：M/M/1 近似。total＝本小時來客＋上小時剩下，mu＝本小時產能（杯／小時）。 */
function queueWait(total, mu) {
  const Qc = V.queue, base = V.choice.waitBase;
  const rho = total / mu;
  const w1 = (r) => Math.min(Qc.maxMidMin, base + (r / (1 - r)) * (60 / mu));
  if (rho < Qc.rhoSwitch) return w1(rho);
  const conn = w1(Qc.rhoSwitch) - base; // 銜接值：兩段在 ρ = 0.95 連續
  return Math.min(Qc.maxHighMin, base + (Math.max(0, total - mu) / mu) * 60 + conn);
}
function t_boost(world, s) { return world.t < s.boostUntilT; }
function pick(mix, u) { let a = 0; for (let i = 0; i < mix.length; i++) { a += mix[i]; if (u < a) return i; } return mix.length - 1; }
function frameEntry(s, o) {
  return { shopId: s.id, lotId: s.lotId, owner: s.owner, company: s.company, name: s.name, open: false, status: s.status, walkOrders: 0, walkServed: 0, deliveryOrders: 0, deliveryServed: 0, queue: s.Bw + s.Bd, waitMin: 0, lost: 0, walkFrom: [], ...o };
}
function distributeOrigins(world, w, n) {
  if (n <= 0) return [];
  let tot = 0; for (let b = 0; b < w.length; b++) tot += w[b];
  if (!tot) return [];
  const raw = []; let used = 0;
  for (let b = 0; b < w.length; b++) if (w[b] > 0) { const x = (n * w[b]) / tot; raw.push([b, Math.floor(x), x - Math.floor(x)]); used += Math.floor(x); }
  raw.sort((a, b) => b[2] - a[2] || a[0] - b[0]);
  for (let i = 0; i < n - used; i++) raw[i % raw.length][1]++;
  return raw.filter((r) => r[1] > 0).sort((a, b) => a[0] - b[0]).map((r) => [world.bld[r[0]].id, r[1]]);
}

// ───────────────────────── 日的開始與結束 ─────────────────────────
function startDay(world) {
  const idx = world.t / 24;
  const di = dateOf(idx);
  const prevDay = world.day;
  // 月結與年結
  if (di.d === 1 && idx > 0 && !world.warm) {
    settleMonth(world, dateOf(idx - 1));
    if (di.m === 1) yearEnd(world, di);
    if (world.status !== 'playing') return;
  }
  // 目標日
  if (idx >= END_DAY) {
    const sh = marketShare30(world);
    const best = Object.entries(sh).sort((a, b) => b[1] - a[1])[0];
    world.status = best[0] === PLAYER ? 'won' : 'lost';
    world.endReason = best[0] === PLAYER ? '近 30 天全城杯數市占第一' : '到期時市占不是第一';
    return;
  }
  // 30 天滾動
  for (const co of Object.values(world.companies)) { if (prevDay) { co.day30.push(0); if (co.day30.length > 30) co.day30.shift(); } }
  // 天氣
  const rw = stream(world.seed, T.WEATHER, idx);
  const rain = rw() < V.demand.rainProb[di.m - 1];
  const weather = rain ? 'rain' : rw() < 0.5 ? 'sunny' : 'cloudy';
  world.day = { ...di, weather, rain, wk: {}, season: V.demand.seasonMult[di.m - 1], walkW: 1, delW: 1, eveBoost: false };
  if (!world.warm) {
    expansionDay(world, di);
    if (di.d === 1) monthStart(world, di);
    if (di.dow === 1 && idx > 0) weeklyChecks(world, di);
    dayEvents(world, di);
  }
  const dm = world.day;
  for (const k of ['住宅', '辦公', '學校', '捷運', '商圈', '外送']) {
    let m = 1;
    if (di.spring) m = k === '住宅' ? V.demand.springFestivalResidentMult : V.demand.weekendMult[k];
    else if (di.weekend) m = V.demand.weekendMult[k];
    dm.wk[k] = m;
  }
  if (rain && !dm.typhoonDay) { dm.walkW *= V.demand.rainWalkMult; dm.delW *= V.demand.rainDeliveryMult; }
  // 各店每日事項
  for (const s of liveShops(world)) {
    s.closedToday = dm.closeAllPlayer && s.owner === 'player';
    if (Math.floor(s.createdT / 24) !== idx) s.mtd.rentDays += 1;
    if (s.status === 'open') s.mtd.openDays += 1;
    if (s.status === 'open' && !s.closedToday) s.mtd.tradingDays += 1;
    if (s.promo.daysLeft > 0 && s.promo.kind === 'open1p1') world.companies[s.company].awareness = Math.min(1, world.companies[s.company].awareness + V.awareness.openingPromoPerDay);
    s.today = newToday();
    // 缺人
    if (s.shortage.daysLeft > 0) s.shortage.daysLeft--;
    else if (s.status === 'open' && s.wageLevel === 'basic' && (!s.ownerWorks || (s.owner === 'player' && s.staff.some((n) => n > 1)))) {
      const pd = 1 - Math.pow(1 - V.labor.quitProbMonthly, 1 / 30);
      if (stream(world.seed, T.QUIT, idx, s.n)() < pd) {
        const best = s.shiftCups.indexOf(Math.max(...s.shiftCups));
        s.shortage = { daysLeft: V.labor.quitDays, shift: best };
        if (s.owner === 'player') pushEvent(world, { kind: 'info', title: `「${s.name}」有人離職`, text: `基本時薪招不到人，未來 ${V.labor.quitDays} 天最忙的那一班少一人。`, choices: [] });
      }
    }
  }
  // 社群廣告每日效果
  for (const co of Object.values(world.companies)) {
    let wan = co.adWan;
    if (co.id === 'daji' && idx < co.adBoostUntil) wan = Math.max(wan, V.rivals.daji.counterAdWan);
    if (wan > 0) { co.awareness += (V.awareness.socialPerWan * wan * (1 - co.awareness)) / di.dim; co.adDayUnits += wan; }
  }
  expireEvents(world);
}

function updateFamiliarity(world, s) {
  const D = derived(world), Fm = V.familiarity, li = D.lotIdx[s.lotId], nl = D.nl;
  let tot = 0;
  for (let b = 0; b < D.nb; b++) {
    const pop = world.bld[b].pop;
    const inc = D.passA[b * nl + li] + Fm.word * (pop > 0 ? Math.min(1, s.buyB[b] / pop) : 0);
    let f = s.F[b];
    f += (1 - f) * Math.min(1, inc);
    f -= Fm.forget * f;
    s.F[b] = f; s.buyB[b] = 0; tot += f;
  }
  s.Fbar = tot / D.nb;
}
function endDay(world) {
  const idx = world.t / 24;
  for (const s of liveShops(world)) {
    if (s.status !== 'open') continue;
    updateFamiliarity(world, s);
    const td = s.today;
    const cups = td.walk + td.del;
    s.days.push({ cups, walk: td.walk, del: td.del, lost: td.lost, wait: td.waitCups ? td.waitSum / td.waitCups : 0, rev: td.rev });
    if (s.days.length > 130) s.days.shift();
    s.waitDay7.push(td.waitCups ? td.waitSum / td.waitCups : 0); if (s.waitDay7.length > 7) s.waitDay7.shift();
    for (let h = 0; h < NHOURS; h++) s.hourEMA[h] = s.hourEMA[h] * 0.93 + 0.07 * (td.hourly[h][0] + td.hourly[h][1]);
    s.shiftCups = s.shiftCups.map((x) => x * 0.9);
    if (s.promo.daysLeft > 0) { s.promo.daysLeft--; if (s.promo.daysLeft === 0) { s.lastPromoEndIdx = idx; s.promo.kind = null; s.promo.num = 1; s.promo.den = 1; } }
  }
}

function dayEvents(world, di) {
  const idx = di.idx, dm = world.day, sc = world.sched;
  // 颱風
  const ty = sc.typhoon;
  if (ty) {
    if (idx === ty.dayIdx - 1 && !ty.eventId) {
      const e = pushEvent(world, { kind: 'typhoon', title: '颱風明天登陸', text: '氣象署發布颱風警報。今天大家會囤飲料，客人增加；明天停班停課，門市客人幾乎歸零。', deadlineT: (idx + 1) * 24, choices: [{ key: 'A', label: '照常開外送（外送訂單 ×1.6，但有 10% 機率被罵）', cost: 0 }, { key: 'B', label: '全面停業一天', cost: 0 }] });
      ty.eventId = e.id;
    }
    if (idx === ty.dayIdx - 1) { dm.walkW *= V.events.typhoonEveWalkMult; dm.eveBoost = true; }
    if (idx === ty.dayIdx) {
      dm.typhoonDay = true; dm.weather = 'rain'; dm.walkW = V.events.typhoonDayWalkMult; dm.delW = V.events.typhoonDayDeliveryMult;
      const ev = world.events.list.find((e) => e.id === ty.eventId);
      if (ev && ev.status === 'pending') applyChoice(world, ev, 'A', true);
      if (ty.choice === 'B') dm.closeAllPlayer = true;
      else if (stream(world.seed, T.SCOLD, idx)() < V.events.typhoonScoldProb) {
        for (const s of world.shops) if (s.owner === 'player' && s.status === 'open') { s.revCnt += V.events.typhoonScoldStars; s.revSum += V.events.typhoonScoldStars; }
        pushEvent(world, { kind: 'info', title: '颱風天叫外送員出門，被罵了', text: `網路上有人批評，每家店多了 ${V.events.typhoonScoldStars} 則 1 星評價。`, choices: [] });
      }
    }
    if (idx > ty.dayIdx) sc.typhoon = null;
  }
  // 寒流
  const cd = sc.cold;
  if (cd) {
    if (idx === cd.start - 1 && !cd.eventId) {
      const e = pushEvent(world, { kind: 'cold', title: `寒流來襲，預計 ${cd.len} 天`, text: `明天起 ${cd.len} 天氣溫驟降，冷飲客人會少四分之一。`, deadlineT: (idx + 1) * 24, choices: [{ key: 'A', label: `推熱飲（花 ${V.events.coldHotDrinkCost.toLocaleString()} 元，跌幅減半）`, cost: V.events.coldHotDrinkCost }, { key: 'B', label: '不動', cost: 0 }] });
      cd.eventId = e.id;
    }
    if (idx >= cd.start && idx < cd.start + cd.len) dm.walkW *= cd.hot ? V.events.coldHotDrinkWalkMult : V.events.coldWalkMult;
    if (idx >= cd.start + cd.len) sc.cold = null;
  }
}

function weeklyChecks(world, di) {
  for (const s of liveShops(world)) {
    if (s.status !== 'open' || s.waitDay7.length < 7) continue;
    const avgWait = s.waitDay7.reduce((a, b) => a + b, 0) / s.waitDay7.length;
    if ((avgWait > V.events.flameWaitMin || s.quality < V.events.flameQuality) && stream(world.seed, T.FLAME, di.idx, s.n)() < V.events.flameProbWeekly) {
      s.revCnt += V.events.flameStars; s.revSum += V.events.flameStars;
      if (s.owner === 'player')
        pushEvent(world, { kind: 'flame', title: `「${s.name}」被寫了負評文`, text: `一篇負評文湧進 ${V.events.flameStars} 則 1 星。`, shopId: s.id, deadlineT: world.t + V.events.flameRespondDays * 24, choices: [{ key: 'A', label: `公開道歉並送飲料（花 ${V.events.flameApologyCost.toLocaleString()} 元，撤回一半 1 星）`, cost: V.events.flameApologyCost }, { key: 'B', label: '不回應', cost: 0 }] });
      else logEvt(world, 'flame', `「${s.name}」被寫了負評文`);
    }
  }
}

function monthStart(world, di) {
  const idx = di.idx, sc = world.sched;
  const ev = V.events;
  const r = (tag, k = 0) => stream(world.seed, T.MON, idx, tag, k);
  const exp = playerCo(world).expansion;
  if (ready(exp, 'factory') && exp.facilities.factory.active && stream(world.seed, T.BATCH, idx)() < EXP.chain.batchProb * (exp.projects.fresh ? 0.5 : 1)) {
    const shops = liveShops(world).filter((s) => s.owner === 'player' && s.status === 'open').length;
    const cost = EXP.chain.recallBase + EXP.chain.recallPerShop * shops;
    pushEvent(world, { kind: 'batch', title: '中央備料批次異常', text: `共用備料出現品質異常。回收會停中央供料 ${EXP.chain.batchDays} 天、報廢 10% 倉庫庫存；門店仍可自行備料。繼續供料會讓每家營業門店增加 ${EXP.chain.badReviews} 則 1 星，拖累全品牌客源。`, deadlineT: world.t + 24, choices: [{ key: 'A', label: `回收檢查（${cost.toLocaleString()} 元）`, cost }, { key: 'B', label: '繼續供料，承受全品牌負評', cost: 0 }] });
  }
  if (ev.typhoonMonths.includes(di.m) && !sc.typhoon && r(1)() < ev.typhoonProb) {
    const dom = 2 + Math.floor(r(1, 1)() * (di.dim - 2));
    sc.typhoon = { dayIdx: idx + dom - 1, eventId: null, choice: null };
  }
  if (ev.coldMonths.includes(di.m) && !sc.cold && r(2)() < ev.coldProb) {
    const dom = 2 + Math.floor(r(2, 1)() * (di.dim - 6));
    const len = ev.coldDays[0] + Math.floor(r(2, 2)() * (ev.coldDays[1] - ev.coldDays[0] + 1));
    sc.cold = { start: idx + dom - 1, len, eventId: null, hot: false };
  }
  const hz = 1 - Math.pow(1 - ev.milkProbYear, 1 / 12);
  if (!world.milkYears[di.y] && r(3)() < hz) {
    world.milkYears[di.y] = true;
    world.milkPct = Math.round((world.milkPct * ev.milkCostMult * 100)) / 100;
    world.milkPct = Math.round(world.milkPct);
    pushEvent(world, { kind: 'milk', title: '鮮奶漲價', text: `鮮奶批價上漲，鮮奶茶原料成本加 ${Math.round((ev.milkCostMult - 1) * 100)}%。`, deadlineT: world.t + ev.milkRespondDays * 24, choices: [{ key: 'A', label: `鮮奶茶漲 ${ev.milkPriceUp} 元`, cost: 0 }, { key: 'B', label: '自行吸收', cost: 0 }] });
  }
  if (idx >= 90 && idx - sc.platformAt >= 365 && r(4)() < ev.platformProbMonthly) {
    sc.platformAt = idx;
    pushEvent(world, { kind: 'platform', title: '外送平台推出付費曝光方案', text: `「隨送」推出付費排序：抽成再加 ${V.delivery.boostCommissionAdd} 個百分點，換平台上的知名度 +${V.delivery.boostAware}。可以隨時退出。`, deadlineT: world.t + ev.platformRespondDays * 24, choices: [{ key: 'A', label: '加入', cost: 0 }, { key: 'B', label: '不加入', cost: 0 }] });
  }
  for (const s of liveShops(world))
    if (s.status === 'open' && starOf(s) >= ev.viralStarMin && stream(world.seed, T.VIRAL, idx, s.n)() < ev.viralStarProbMonthly) startViral(world, s.company, '口碑好');
  if (idx > 0) rivalMonthly(world, di);
}

// ───────────────────────── 月結、年結 ─────────────────────────
function computePnL(world, s, dim) {
  const m = s.mtd, F = V.fixedCost;
  const wage = roundDiv(m.wageMilli, 1000);
  const rent = Math.floor((s.rent * m.rentDays) / dim);
  const util = Math.floor((F.utilityBase * m.openDays) / dim) + F.utilityPerCup * (m.walk + m.del);
  const pos = Math.floor((F.posMonthly * m.openDays) / dim);
  const waste = m.wasteMilli == null ? Math.round(m.cogs * V.menu.wasteRate) : roundDiv(m.wasteMilli, 1000);
  const cardFee = Math.floor((m.storeRev * V.tax.cardFeePct) / 100);
  const turnover = m.storeRev + m.gmv;
  const purchases = m.cogs + m.pack + waste;
  const bizTax = calcBusinessTax(turnover, purchases);
  const profit = turnover - m.commission - purchases - wage - rent - util - pos - cardFee - bizTax;
  return { turnover, storeRev: m.storeRev, gmv: m.gmv, commission: m.commission, cogs: m.cogs, pack: m.pack, waste, wage, rent, util, pos, cardFee, bizTax, profit, cups: m.walk + m.del, walk: m.walk, del: m.del, lost: m.lost, purchases };
}
/** 結一家店的當月帳（付費用現金、記入歷史）。final＝關店時的最後一筆。 */
function settleShop(world, s, dim, final) {
  const m = s.mtd;
  const empty = m.rentDays === 0 && m.walk + m.del === 0 && m.openDays === 0;
  if (empty) return null;
  const pnl = computePnL(world, s, dim);
  const co = world.companies[s.company];
  co.cash -= pnl.waste + pnl.wage + pnl.rent + pnl.util + pnl.pos + pnl.cardFee + pnl.bizTax;
  co.yearProfit += pnl.profit;
  const di = world.day || dateOf(0);
  const ym = final ? ymOf(di) : ymOf(dateOf(world.t / 24 - 1));
  s.history.push({ ym, partial: !!final, tradingDays: m.tradingDays, ...pnl, avgDaily: m.tradingDays ? (pnl.cups / m.tradingDays) : 0, avgWait: m.waitCups ? m.waitSum / m.waitCups : 0 });
  if (s.history.length > 48) s.history.shift();
  s.lastMonthCups = pnl.cups;
  s.lastPnL = pnl; s.lastTradingDays = m.tradingDays;
  s.mtd = newMTD();
  return pnl;
}

function monthlyFixed(world, s) {
  const wage = (s.staff.reduce((a, _, i) => a + hiredStaff(s, i), 0) * 4 * world.wages[s.wageLevel] * EMPLOYER_MILLI * 30) / 1000;
  return s.rent + V.fixedCost.utilityBase + V.fixedCost.posMonthly + wage;
}
function settleMonth(world, prev) {
  const dim = prev.dim, ym = ymOf(prev);
  const toClose = [];
  const R = V.rivals;
  for (const s of liveShops(world)) {
    const pnl = settleShop(world, s, dim, false);
    if (s.owner === 'rival' && pnl && s.status === 'open') {
      // 開幕前 N 個月不判斷關店，也不計入連續虧損
      const age = s.openedT == null ? 0 : (world.t - s.openedT) / 24;
      s.lossStreak = age >= (R.graceMonths * 365) / 12 && pnl.profit < 0 ? s.lossStreak + 1 : 0;
      if (s.lossStreak >= R.closeLossMonths) toClose.push(s);
    }
  }
  // 公司層
  const brandCups = {};
  for (const co of Object.values(world.companies)) {
    // 廣告費
    const adCost = Math.floor((co.adDayUnits * 10000) / dim);
    if (adCost) { co.cash -= adCost; co.yearProfit -= adCost; }
    const facilityCost = Math.floor((co.cm.facilityDayUnits || 0) / dim), chainCost = Math.floor((co.cm.chainDayUnits || 0) / dim);
    co.cash -= facilityCost + chainCost; co.yearProfit -= facilityCost + chainCost;
    co.adDayUnits = 0;
    // 知名度：口碑擴散與遺忘
    co.awareness += V.awareness.spread * Math.min(1, co.cm.cups / world.popAll) * (1 - co.awareness);
    co.awareness = clamp(co.awareness * (1 - V.awareness.forget), 0, 1);
    // 貸款攤還
    let loanInterest = co.cm.earlyInterest || 0, loanPrincipal = 0;
    co.cash -= loanInterest; co.yearProfit -= loanInterest;
    for (const l of co.loans) {
      if (l.left <= 0) continue;
      const interest = Math.round((l.balance * V.loan.rate) / 12);
      let principal = l.payment - interest;
      if (l.left === 1 || principal > l.balance) principal = l.balance;
      l.balance -= principal; l.left -= 1;
      co.cash -= principal + interest; co.yearProfit -= interest;
      l.lastInterest = interest; l.lastPrincipal = principal;
      loanInterest += interest; loanPrincipal += principal;
    }
    co.loans = co.loans.filter((l) => l.balance > 0);
    brandCups[co.id] = co.cm.cups;
    co.rows.push({ ym, adCost, facilityCost, chainCost, loanInterest, loanPrincipal, incomeTax: 0, ...co.cm });
    if (co.rows.length > 48) co.rows.shift();
    co.cm = newCM();
  }
  world.monthly.push({ ym, cups: brandCups, total: Object.values(brandCups).reduce((a, b) => a + b, 0) });
  if (world.monthly.length > 48) world.monthly.shift();
  // 連續虧損，而且品牌現金撐不過 N 個月固定成本，才關店
  for (const s of toClose) {
    const co = world.companies[s.company];
    const fixed = world.shops.filter((x) => x.company === s.company && x.status !== 'closed').reduce((a, x) => a + monthlyFixed(world, x), 0);
    if (co.cash < R.cashMonths * fixed) closeShopInternal(world, s, `連續 ${R.closeLossMonths} 個月虧損，現金撐不過 ${R.cashMonths} 個月固定成本`);
  }
  // 品牌現金為負：關掉上月虧最多的店
  for (const co of Object.values(world.companies)) {
    if (co.id === PLAYER || co.exited || co.cash >= 0) continue;
    const mine = world.shops.filter((x) => x.company === co.id && x.status !== 'closed');
    if (!mine.length) continue;
    mine.sort((a, b) => ((a.lastPnL && a.lastPnL.profit) || 0) - ((b.lastPnL && b.lastPnL.profit) || 0));
    closeShopInternal(world, mine[0], '品牌現金為負');
  }
  for (const co of Object.values(world.companies)) {
    if (co.id !== PLAYER && !co.exited && !world.shops.some((x) => x.company === co.id && x.status !== 'closed')) { co.exited = true; logEvt(world, 'rival', `${co.name}最後一家店關閉，退出市場`); }
  }
  // 破產判定
  const pc = playerCo(world);
  if (pc.cash < 0) {
    const out = pc.loans.filter((l) => l.kind === 'working').reduce((a, l) => a + l.balance, 0);
    const room = V.loan.workingMax - out;
    const need = Math.ceil(-pc.cash / V.loan.unit) * V.loan.unit;
    const draw = Math.min(room, need);
    if (draw > 0) { addLoan(pc, 'working', draw); logEvt(world, 'loan', `月結現金為負，自動動用週轉貸款 ${draw.toLocaleString()} 元`); }
    if (pc.cash < 0) { world.status = 'bankrupt'; world.endReason = '月結現金為負，週轉額度也用完了'; logEvt(world, 'bankrupt', world.endReason); }
  }
}

function yearEnd(world, di) {
  for (const co of Object.values(world.companies)) {
    const p = co.yearProfit;
    let tax = 0;
    if (p > 0) { const used = Math.min(co.nol, p); co.nol -= used; tax = Math.floor(((p - used) * V.tax.incomeTaxPct) / 100); }
    else co.nol += -p;
    if (tax) co.cash -= tax;
    const row = co.rows[co.rows.length - 1];
    if (row && row.ym === `${di.y - 1}-12`) row.incomeTax = tax;
    co.lastIncomeTax = tax; co.lastYearProfit = p; co.yearProfit = 0;
  }
  for (const k of WAGE_LEVELS) world.wages[k] = Math.round(world.wages[k] * V.labor.annualRaise);
  for (const s of world.shops) if (s.status !== 'closed') recalcShop(world, s);
  const pc = playerCo(world);
  pushEvent(world, { kind: 'info', title: `${di.y} 年基本工資調漲`, text: `三級時薪都調漲 ${Math.round((V.labor.annualRaise - 1) * 1000) / 10}%，基本時薪變成 ${world.wages.basic} 元。去年稅前淨利 ${pc.lastYearProfit.toLocaleString()} 元，已繳營所稅 ${pc.lastIncomeTax.toLocaleString()} 元。`, choices: [] });
  if (pc.cash < 0 && world.status === 'playing') { /* 由月結的破產判定處理；年稅造成的負數在下個月結檢查 */ }
}

// ───────────────────────── 對手 ─────────────────────────
function rivalMonthly(world, di) {
  const R = V.rivals;
  // 排班：依近期尖峰人數調整
  for (const s of liveShops(world)) {
    if (s.owner !== 'rival' || s.status !== 'open' || s.days.length < 20) continue;
    const sp = V.capacity.wageSpeed[s.wageLevel];
    s.staff = SHIFTS.map(([a, b]) => {
      let peak = 0;
      for (let h = a; h < b; h++) peak = Math.max(peak, s.hourEMA[h - OPEN_H]);
      // 規格 15.3：照該班尖峰小時 ρ ≈ 0.8 配人，1 人收銀、其餘做飲料
      // 取使用率最接近 0.8 的人數（不是「不超過」，否則每班都多請一個人）
      let kw = 1;
      for (let k = 2; k <= V.capacity.staffMax; k++) if (Math.abs(peak / (k * V.capacity.workerCups * sp) - V.queue.targetRho) < Math.abs(peak / (kw * V.capacity.workerCups * sp) - V.queue.targetRho)) kw = k;
      const need = kw + 1;
      if (s.ownerWorks) return clamp(need - 1, 0, R.road.maxHired); // 老闆本人算 1 人
      return clamp(need, 2, V.capacity.staffMax);
    });
  }
  // 青柚：第二杯半價與永久降價
  const Q = R.qingyou;
  for (const s of liveShops(world)) {
    if (s.company !== 'qingyou' || s.status !== 'open' || s.permCut) continue;
    if (s.days.length < 120 || s.promo.daysLeft > 0) continue;
    const last30 = avg(s.days.slice(-30).map((d) => d.cups));
    const prev90 = avg(s.days.slice(-120, -30).map((d) => d.cups));
    if (!(last30 < prev90 * (1 - Q.dropPct / 100))) continue;
    const li = derived(world).lotIdx[s.lotId], nl = derived(world).nl;
    const near = world.shops.some((o) => o.owner === 'player' && o.status !== 'closed' && world.ll[li * nl + derived(world).lotIdx[o.lotId]] <= Q.promoRadiusM);
    if (!near) continue;
    if (s.qPromoCount >= 2) {
      ITEMS.forEach((k) => (s.prices[k] -= Q.permCut)); s.permCut = true; recalcShop(world, s);
      logEvt(world, 'rival', `青柚手作「${s.name}」永久降價 ${Q.permCut} 元`);
    } else {
      s.qPromoCount++;
      s.promo = { kind: 'half2', daysLeft: Q.promoDays, num: Q.promoPriceMult[0], den: Q.promoPriceMult[1] };
      logEvt(world, 'rival', `青柚手作「${s.name}」推出第二杯半價 ${Q.promoDays} 天`);
    }
  }
  // 大吉、青柚：擴張（算整個品牌每月多賺多少，含租金、人力與搶走自己分店的客人）
  for (const co of ['daji', 'qingyou']) {
    const c = world.companies[co];
    if (!c || c.exited) continue;
    const cfg = R[co];
    const count = world.shops.filter((s) => s.company === co && s.status !== 'closed').length;
    if (count >= cfg.maxShops || c.cash <= cfg.expandCash) continue;
    const base = brandEstimate(world, co, null);
    let best = null;
    for (const lot of world.lots) {
      if (lot.shopId) continue;
      const gain = brandEstimate(world, co, lot) - base;
      if (!best || gain > best.gain) best = { lot, gain };
    }
    if (best && best.gain > cfg.expandGain) {
      const cost = lotOpenCost(best.lot);
      if (c.cash >= cost) {
        c.cash -= cost;
        const sh = makeShop(world, { company: co, lot: best.lot, name: rivalShopName(world, co, best.lot), rival: true });
        sh.openedT = null; sh.mtd.rentDays = 1;
        logEvt(world, 'rival', `${cfg.name}在 ${best.lot.id}（${best.lot.zone}）開新店，預估品牌每月多賺 ${Math.round(best.gain).toLocaleString()} 元`);
      }
    }
  }
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// ── 擴張評估：典型日（平日週末加權、全年平均雨天、季節 1.0、無排隊）預估各店杯數，再換算每月獲利 ──
function descOfShop(world, s) {
  const D = derived(world), co = world.companies[s.company];
  const hired = s.staff.reduce((a, _, i) => a + hiredStaff(s, i), 0) * 4;
  return mkDesc(world, { li: D.lotIdx[s.lotId], co, avgP: s.avgPrice * (s.promo.daysLeft > 0 ? s.promo.num / s.promo.den : 1), avgPlat: s.avgPlat, q: s.quality, star: chainStarOf(world, s), delivery: s.delivery, mix: s.mix, costMult: s.costMult, rent: s.rent, wageH: world.wages[s.wageLevel], sp: V.capacity.wageSpeed[s.wageLevel], ownerWorks: !!s.ownerWorks, hiredHours: hired, fixedStaff: s.owner === 'player', company: s.company });
}
function descOfCandidate(world, lot, companyId) {
  const D = derived(world), co = world.companies[companyId];
  const cfg = V.rivals[companyId];
  const prices = ITEMS.map((_, i) => Math.round(ITEM_REF[i] * cfg.priceFactor));
  const w = ITEMS.map((_, i) => ITEM_POP[i] * Math.pow(prices[i] / ITEM_REF[i], -Ch_().mixPriceElasticity));
  const tw = w.reduce((a, b) => a + b, 0), mix = w.map((x) => x / tw);
  const avgP = mix.reduce((a, m, i) => a + m * prices[i], 0), avgPlat = mix.reduce((a, m, i) => a + m * platPrice(prices[i], V.delivery.markupDefault), 0);
  return mkDesc(world, { li: D.lotIdx[lot.id], co, avgP, avgPlat, q: cfg.quality, star: V.reviews.priorStar, delivery: !!cfg.delivery, mix, costMult: costMultOfQuality(cfg.quality), rent: lot.rent, wageH: world.wages[cfg.wage], sp: V.capacity.wageSpeed[cfg.wage], hiredHours: 24, company: companyId });
}
const Ch_ = () => V.choice;
function mkDesc(world, o) {
  const Ch = V.choice, cal = world.cal;
  const unitIngr = o.mix.reduce((a, m, i) => a + m * ITEM_COST[i], 0) * o.costMult;
  const base = cal.c - Ch.priceCoef * Math.log(o.avgP / Ch.refPrice) + Ch.qualityCoef * (o.q - Ch.qualityRef) + Ch.starCoef * (o.star - Ch.starRef) - Ch.waitCoef * queueWait(V.queue.targetRho * V.capacity.workerCups, V.capacity.workerCups); // 尖峰預期等候（ρ≈0.8）
  const Ed = o.delivery ? Math.exp(cal.c_del - Ch.priceCoef * Math.log(o.avgPlat / V.delivery.refPrice) + Ch.qualityCoef * (o.q - Ch.qualityRef) + V.delivery.starCoef * (o.star - Ch.starRef) + Ch.awareCoef * Math.log(Ch.awareFloor + (1 - Ch.awareFloor) * (1 - (1 - derived(world).ssFbar[o.li]) * (1 - o.co.awareness))) - V.delivery.waitCoef * Ch.waitBase) : 0;
  return { ...o, k: o.co.awareness, Ew: Math.exp(base), Ed, unitIngr };
}
function estimateDay(world, descs) {
  const D = derived(world), Ch = V.choice, cal = world.cal;
  const avgRain = avg(V.demand.rainProb);
  const wkW = 1 - avgRain + avgRain * V.demand.rainWalkMult, wkD = 1 - avgRain + avgRain * V.demand.rainDeliveryMult;
  const n = descs.length, walk = new Array(n).fill(0), del = new Array(n).fill(0);
  const popAll = world.popAll;
  for (let col = 0; col < NHOURS; col++) {
    for (let b = 0; b < D.nb; b++) {
      const bd = world.bld[b];
      const wk = (5 + 2 * V.demand.weekendMult[bd.key]) / 7;
      const Dm = bd.pop * cal.r * (V.demand.hourShare[bd.key][col] / 100) * wk * wkW;
      let S = 0; const ea = new Array(n);
      for (let j = 0; j < n; j++) {
        const a = D.aM[b * D.nl + descs[j].li];
        ea[j] = a === 0 ? 0 : descs[j].Ew * a * Math.pow(Ch.awareFloor + (1 - Ch.awareFloor) * (1 - (1 - D.ssF[b * D.nl + descs[j].li]) * (1 - descs[j].k)), Ch.awareCoef);
        S += ea[j];
      }
      for (let j = 0; j < n; j++) walk[j] += (Dm * ea[j]) / (1 + S);
    }
    const wk = (5 + 2 * V.demand.weekendMult.外送) / 7;
    const dp = popAll * V.people.deliveryPoolMult * cal.r_del * (V.demand.hourShare.外送[col] / 100) * wk * wkD;
    let SD = 0; for (const x of descs) SD += x.Ed;
    if (SD > 0) for (let j = 0; j < n; j++) del[j] += (dp * descs[j].Ed) / (1 + SD);
  }
  return { walk, del };
}
function estProfit(d, walk, del) {
  const days = 30.4, w = walk * days, dl = del * days, c = w + dl;
  const revW = w * d.avgP, gmv = dl * d.avgPlat, comm = (gmv * V.delivery.commission) / 100;
  const ingr = c * d.unitIngr;
  const purchases = ingr * (1 + V.menu.wasteRate) + c * V.menu.packagingPerCup;
  const turn = revW + gmv;
  const tax = turn < V.tax.bizThreshold ? turn * 0.01 : Math.max(0, ((turn - purchases) * 5) / 105);
  // 人力：依 15.3 的排班規則（尖峰小時使用率最接近 0.8），尖峰小時 ≈ 1.25 × 平均每小時杯數；老闆自己上班的店照原本人數
  let hiredHours = d.hiredHours;
  if (!d.ownerWorks && !d.fixedStaff) {
    const peak = (1.25 * (walk + del)) / NHOURS;
    let kw = 1;
    for (let k = 2; k <= V.capacity.staffMax; k++) if (Math.abs(peak / (k * V.capacity.workerCups * d.sp) - V.queue.targetRho) < Math.abs(peak / (kw * V.capacity.workerCups * d.sp) - V.queue.targetRho)) kw = k;
    hiredHours = Math.max(d.hiredHours, (kw + 1) * 12);
  }
  const wage = (hiredHours * d.wageH * EMPLOYER_MILLI * days) / 1000;
  return turn - comm - purchases - wage - d.rent - (V.fixedCost.utilityBase + V.fixedCost.utilityPerCup * c) - V.fixedCost.posMonthly - revW * 0.01 - tax;
}
/** 品牌（現有店＋候選店面）預估每月總獲利；lot＝null 表示不開新店。 */
function brandEstimate(world, companyId, lot) {
  const descs = world.shops.filter((s) => s.status !== 'closed').map((s) => descOfShop(world, s));
  if (lot) descs.push(descOfCandidate(world, lot, companyId));
  const { walk, del } = estimateDay(world, descs);
  let tot = 0;
  descs.forEach((d, j) => { if (d.company === companyId) tot += estProfit(d, walk[j], del[j]); });
  return tot;
}

// ───────────────────────── 查詢（給介面） ─────────────────────────
function facilityMonthly(exp) { return FACILITY_KEYS.reduce((a, k) => a + (ready(exp, k) ? EXP.facilities[k][exp.facilities[k].active ? 'monthly' : 'standby'] : 0), 0); }

/** 同一需求池比較開店前後，將原分店被分走的銷量扣回。 */
export function getExpansionEstimate(world, lotId, { ownerWorks = false } = {}) {
  const lot = world.lots.find((l) => l.id === lotId);
  if (!lot || lot.shopId) return null;
  const co = playerCo(world), fx = effects(co.expansion), g = V.menu.grades.標準;
  const mix = ITEM_POP.map((p) => p / ITEM_POP.reduce((a, b) => a + b, 0));
  const candidate = mkDesc(world, { li: derived(world).lotIdx[lot.id], co, avgP: REF_AVG, avgPlat: mix.reduce((a, m, i) => a + m * platPrice(ITEM_REF[i], V.delivery.markupDefault), 0), q: g.quality + V.labor.qualityAdj.market + fx.quality, star: V.reviews.priorStar, delivery: true, mix, costMult: g.cost * fx.material, rent: lot.rent, wageH: world.wages.market, sp: V.capacity.wageSpeed.market, ownerWorks, hiredHours: ownerWorks ? 12 : 24, fixedStaff: true, company: PLAYER });
  const descs = liveShops(world).map((s) => descOfShop(world, s)), before = estimateDay(world, descs), after = estimateDay(world, [...descs, candidate]);
  let oldBefore = 0, oldAfter = 0, profitBefore = 0, profitAfter = 0;
  descs.forEach((d, i) => { if (d.company === PLAYER) { oldBefore += before.walk[i] + before.del[i]; oldAfter += after.walk[i] + after.del[i]; profitBefore += estProfit(d, before.walk[i], before.del[i]); profitAfter += estProfit(d, after.walk[i], after.del[i]); } });
  const i = descs.length, newDaily = after.walk[i] + after.del[i], lostDaily = Math.max(0, oldBefore - oldAfter);
  const management = descs.some((d) => d.company === PLAYER) ? EXP.chain.managementPerShop : 0;
  const incrementalProfit = Math.round(profitAfter + estProfit(candidate, after.walk[i], after.del[i]) - profitBefore - management);
  return { newDaily, lostDaily, netNewDaily: newDaily - lostDaily, cannibalization: newDaily ? lostDaily / newDaily : 0, incrementalProfit, management, openCost: lotOpenCost(lot), paybackMonths: incrementalProfit > 0 ? lotOpenCost(lot) / incrementalProfit : null };
}

export function getFacilities(world) {
  const co = playerCo(world), exp = co.expansion, di = world.day || dateOf(Math.floor(world.t / 24));
  const row = co.rows.at(-1) || co.cm, periodDays = co.rows.length ? daysInMonth(+row.ym.slice(0, 4), +row.ym.slice(5)) : Math.max(1, di.d);
  const pnl = companyPnL(world, co, co.rows.at(-1) || null, di), raw = pnl.cogs + (row.warehouseSavings || 0) + (row.factorySavings || 0);
  const daily = row.cups / periodDays, rawUnit = row.cups ? raw / row.cups : null;
  return { facilities: FACILITY_KEYS.map((key) => {
    const cfg = EXP.facilities[key], f = exp.facilities[key];
    const grossSaving = rawUnit == null || key === 'lab' ? null : key === 'warehouse' ? daily * di.dim * rawUnit * cfg.discount : Math.min(daily, cfg.cupsDaily) * di.dim * rawUnit * cfg.saving;
    return { key, ...cfg, ...JSON.parse(JSON.stringify(f)), monthly: cfg[f.active ? 'monthly' : 'standby'], daysLeft: f.status === 'building' ? Math.max(0, Math.ceil((f.completeAtT - world.t) / 24)) : 0, grossSaving, netSaving: grossSaving == null ? null : grossSaving - cfg.monthly, breakEvenDaily: rawUnit > 0 && key !== 'lab' ? Math.ceil(cfg.monthly / (rawUnit * (key === 'warehouse' ? cfg.discount : cfg.saving)) / di.dim) : null };
  }), projects: Object.entries(EXP.projects).map(([key, p]) => ({ key, ...p, done: !!exp.projects[key] })), research: exp.research ? { ...exp.research } : null, factoryLeft: exp.factoryLeft, batchDaysLeft: Math.max(0, Math.ceil((exp.batchUntilT - world.t) / 24)), monthly: facilityMonthly(exp) };
}

export function getMarketAnalysis(world) {
  const rain = avg(V.demand.rainProb);
  const walkPool = world.bld.reduce((a, b) => a + b.pop * world.cal.r * (5 + 2 * V.demand.weekendMult[b.key]) / 7 * (1 - rain + rain * V.demand.rainWalkMult), 0);
  const delPool = world.popAll * V.people.deliveryPoolMult * world.cal.r_del * (5 + 2 * V.demand.weekendMult.外送) / 7 * (1 - rain + rain * V.demand.rainDeliveryMult);
  const shops = liveShops(world).filter((s) => s.status === 'open'), est = estimateDay(world, shops.map((s) => descOfShop(world, s)));
  const sold = est.walk.reduce((a, b) => a + b, 0) + est.del.reduce((a, b) => a + b, 0);
  const capacity = shops.reduce((a, s) => a + s.staff.reduce((b, _, i) => { const n = hiredStaff(s, i) + (s.ownerWorks ? 1 : 0); return b + 4 * Math.floor((n === 1 ? V.capacity.soloCups : (n - 1) * V.capacity.workerCups) * V.capacity.wageSpeed[s.wageLevel] * (s.owner === 'player' ? effects(playerCo(world).expansion).speed : 1)); }, 0), 0);
  return { population: world.popAll, potentialDaily: walkPool + delPool, typicalOrders: sold, capacityDaily: capacity, openShops: shops.length, freeLots: world.lots.filter((l) => !l.shopId).length, lots: world.lots.length, saturation: (walkPool + delPool) ? sold / (walkPool + delPool) : 0 };
}

/** 結案資料使用整局月帳，包含已關閉的分店。 */
export function getFinalReport(world) {
  const co = playerCo(world), di = dateOf(Math.floor(world.t / 24));
  const months = co.rows.map((r) => companyPnL(world, co, r, di));
  if (!months.some((r) => r.ym === ymOf(di)) && (Object.values(co.cm).some((v) => typeof v === 'number' && v !== 0) || world.shops.some((s) => s.owner === 'player' && s.status !== 'closed' && s.mtd.rentDays))) months.push(companyPnL(world, co, null, di));
  const keys = [...PNL_SUM, 'totalCost', 'netProfit', 'adCost', 'extraExpense', 'facilityCost', 'chainCost', 'researchExpense', 'stockWriteOff', 'loanInterest', 'incomeTax', 'loanPrincipal', 'shopInvestment', 'facilityCapex', 'stockPurchases', 'assetRecoveries', 'warehouseSavings', 'factorySavings'];
  const totals = Object.fromEntries(keys.map((k) => [k, months.reduce((a, r) => a + (r[k] || 0), 0)]));
  const shops = world.shops.filter((s) => s.owner === 'player').map((s) => {
    const parts = [...s.history]; if (s.status !== 'closed' && s.mtd.rentDays) parts.push({ ...computePnL(world, s, di.dim), tradingDays: s.mtd.tradingDays });
    const cups = parts.reduce((a, h) => a + h.cups, 0), days = parts.reduce((a, h) => a + (h.tradingDays || 0), 0);
    return { name: s.name, status: s.status, cups, daily: days ? cups / days : 0, revenue: parts.reduce((a, h) => a + h.turnover, 0), profit: parts.reduce((a, h) => a + h.profit, 0), lost: parts.reduce((a, h) => a + h.lost, 0), star: starOf(s) };
  });
  const debt = co.loans.reduce((a, l) => a + l.balance, 0), findings = [];
  findings.push(totals.netProfit > 0 ? '整局營運淨利為正；再比較開店與後勤投入，判斷投資是否已回收。' : totals.netProfit === 0 ? '整局營運損益為零，尚未產生正收益。' : '整局營運仍虧損，應先改善單店損益，再增加分店。');
  if (totals.wage + totals.rent > totals.turnover * 0.5 && totals.turnover) findings.push('人事與租金超過營收一半，固定成本是主要壓力。');
  if (totals.facilityCost > totals.warehouseSavings + totals.factorySavings) findings.push('後勤固定費高於已實現的採購與備料節省；研發的品質與產能效益需另看杯數、等候和評價。');
  if (totals.lost > totals.cups * 0.05) findings.push('流失訂單超過成交杯數的 5%，尖峰產能與等候時間值得優先改善。');
  if (debt > co.cash) findings.push('剩餘貸款高於現金，後續仍有還款壓力。');
  if (world.status === 'won' && totals.netProfit < 0) findings.push('市占第一達成遊戲目標，但沒有同時達成獲利。');
  return { company: co.name, status: world.status, reason: world.endReason, startDate: V.time.startDate, endDate: di.key, initialCash: V.startup.startCash, cash: co.cash, debt, borrowed: co.fundingIncomplete ? null : co.borrowed ?? null, capitalIncomplete: !!co.capitalIncomplete, totals, months, shops, share: marketShare30(world), projects: Object.keys(co.expansion.projects).filter((k) => co.expansion.projects[k]).map((k) => EXP.projects[k].name), findings, events: world.eventLog.filter((e) => ['open', 'close', 'facility', 'research', 'loan', 'batch', 'decision', 'bankrupt'].includes(e.kind)).map((e) => ({ date: dateOf(Math.floor(e.t / 24)).key, text: e.text })), incomplete: months.some((r) => r.incomplete), market: getMarketAnalysis(world) };
}

export function marketShare30(world) {
  const sums = {}; let tot = 0;
  for (const co of Object.values(world.companies)) { const s = co.day30.reduce((a, b) => a + b, 0); sums[co.id] = s; tot += s; }
  const out = {};
  for (const k of Object.keys(sums)) out[k] = tot ? sums[k] / tot : 0;
  return out;
}
export function getKpi(world) {
  const co = playerCo(world), di = world.day || dateOf(world.t / 24);
  const mtd = companyPnL(world, co, null, di).netProfit;
  const sh = marketShare30(world);
  return { company: co.name, cash: co.cash, monthNetProfit: mtd, marketShare: sh[PLAYER], date: di.key, clock: clockOf(world), weather: di.weather || 'sunny', status: world.status, endReason: world.endReason, awareness: co.awareness, loanBalance: co.loans.reduce((a, l) => a + l.balance, 0), shops: world.shops.filter((s) => s.owner === 'player' && s.status !== 'closed').length };
}
export function getLots(world) {
  return world.lots.map((l) => {
    const s = l.shopId ? shopBy(world, l.shopId) : null;
    return { id: l.id, zone: l.zone, state: !s ? '空' : s.owner === 'player' ? '玩家' : '對手', owner: s ? s.owner : null, name: s ? s.name : '', color: s ? s.color : null, shopId: s ? s.id : null, status: s ? s.status : null };
  });
}
export function getLotInfo(world, lotId) {
  const D = derived(world);
  const li = D.lotIdx[lotId];
  if (li == null) return null;
  const lot = world.lots[li], nl = D.nl;
  let pop500 = 0;
  world.bld.forEach((b, bi) => { if (world.dM[bi * nl + li] <= 500) pop500 += b.pop; });
  const nearby = liveShops(world).filter((s) => s.id !== lot.shopId && world.ll[li * nl + D.lotIdx[s.lotId]] <= 500).length;
  return { id: lot.id, zone: lot.zone, ping: lot.ping, monthlyRent: lot.rent, rentPerPing: lot.rentPerPing, deposit: lot.deposit, openCost: lotOpenCost(lot), pop500: Math.round(pop500), nearbyShops: nearby, vacant: !lot.shopId, shopId: lot.shopId };
}
export function getShops(world, owner) {
  return world.shops.filter((s) => (!owner || s.owner === owner) && s.status !== 'closed').map((s) => shopSummary(world, s));
}
function shopSummary(world, s) {
  const co = world.companies[s.company];
  return { id: s.id, lotId: s.lotId, name: s.name, owner: s.owner, company: s.company, status: s.status, openAtT: s.openAtT, prices: { ...s.prices }, markupPct: s.markupPct, delivery: s.delivery, staff: [...s.staff], ownerWorks: !!s.ownerWorks, wageLevel: s.wageLevel, grade: s.grade, quality: s.quality, star: Math.round(starOf(s) * 10) / 10, reviews: s.revCnt, awareness: co.awareness, promo: s.promo.kind, shortage: s.shortage.daysLeft > 0, rent: s.rent, deposit: s.deposit };
}
export function getShopToday(world, shopId) {
  const s = shopBy(world, shopId);
  if (!s) return null;
  const td = s.today;
  return { shopId, hourly: td.hourly.map((x, i) => ({ hour: OPEN_H + i, walk: x[0], delivery: x[1] })), cups: td.walk + td.del, walk: td.walk, delivery: td.del, queue: s.Bw + s.Bd, waitMin: Math.round(s.waitMin * 10) / 10, lost: td.lost, revenue: td.rev };
}
export function getShopHistory(world, shopId) {
  const s = shopBy(world, shopId);
  if (!s) return null;
  return { shopId, months: s.history.map((h) => ({ ym: h.ym, partial: h.partial, avgDaily: Math.round(h.avgDaily), cups: h.cups, revenue: h.turnover, netProfit: h.profit })), days: s.days.map((d) => d.cups), mtdPnL: computePnL(world, s, (world.day || dateOf(0)).dim) };
}
/** 對手公開資訊：日銷只給估計值（真實近 7 日均值 ±20% 雜訊，同一天內固定）。 */
export function getRivalInfo(world, shopId) {
  const s = shopBy(world, shopId);
  if (!s || s.owner !== 'rival') return null;
  const recent = s.days.slice(-7).map((d) => d.cups);
  const trueAvg = avg(recent);
  const di = Math.floor(world.t / 24);
  const noise = (stream(world.seed, T.NOISE, di, s.n)() * 2 - 1) * V.rivals.estimateNoise;
  return { shopId, name: s.name, company: s.company, status: s.status, prices: { ...s.prices }, star: Math.round(starOf(s) * 10) / 10, reviews: s.revCnt, estDailyCups: s.status === 'open' && recent.length ? Math.round(trueAvg * (1 + noise)) : null, delivery: s.delivery };
}
export function getEvents(world) {
  const l = world.events.list;
  const sc = world.sched;
  const active = [];
  const day = world.day;
  if (day && day.typhoonDay) active.push({ kind: 'typhoon', text: '颱風當天' });
  if (sc.cold && day && day.idx >= sc.cold.start && day.idx < sc.cold.start + sc.cold.len) active.push({ kind: 'cold', text: '寒流期間' });
  for (const s of world.shops) if (s.status !== 'closed' && world.t < s.boostUntilT && s.owner === 'player') active.push({ kind: 'viral', shopId: s.id, text: '爆紅期間', untilT: s.boostUntilT });
  return { pending: l.filter((e) => e.status === 'pending'), active, recent: l.slice(-20), log: world.eventLog.slice(-60) };
}
const PNL_SUM = ['turnover', 'storeRev', 'gmv', 'commission', 'cogs', 'pack', 'waste', 'wage', 'rent', 'util', 'pos', 'cardFee', 'bizTax', 'profit', 'cups', 'walk', 'del', 'lost'];
function companyPnL(world, co, row, di) {
  const ym = row ? row.ym : ymOf(di);
  const pnl = Object.fromEntries(PNL_SUM.map((k) => [k, 0]));
  for (const s of world.shops.filter((s) => s.company === co.id)) {
    const parts = s.history.filter((h) => h.ym === ym);
    if (!row && s.status !== 'closed') parts.push(computePnL(world, s, di.dim));
    for (const h of parts) for (const k of PNL_SUM) pnl[k] += h[k] || 0;
  }
  const adCost = row ? row.adCost || 0 : Math.floor((co.adDayUnits * 10000) / di.dim);
  const source = row || co.cm, extraExpense = source.extraExpense || 0;
  const facilityCost = row ? row.facilityCost || 0 : Math.floor((co.cm.facilityDayUnits || 0) / di.dim);
  const chainCost = row ? row.chainCost || 0 : Math.floor((co.cm.chainDayUnits || 0) / di.dim);
  const researchExpense = source.researchExpense || 0, stockWriteOff = source.stockWriteOff || 0;
  const loanInterest = row ? row.loanInterest || 0 : (co.cm.earlyInterest || 0) + (world.status === 'playing' ? Math.round(co.loans.reduce((a, l) => a + Math.round(l.balance * V.loan.rate / 12), 0) * di.d / di.dim) : 0);
  const incomeTax = row ? row.incomeTax || 0 : 0;
  const loanPrincipal = (row ? row.loanPrincipal || 0 : 0) + (source.earlyPrincipal || 0);
  const totalCost = pnl.turnover - pnl.profit + adCost + extraExpense + facilityCost + chainCost + researchExpense + stockWriteOff + loanInterest + incomeTax;
  return { ym, ...pnl, adCost, extraExpense, facilityCost, chainCost, researchExpense, stockWriteOff, facilityCapex: source.facilityCapex || 0, stockPurchases: source.stockPurchases || 0, shopInvestment: source.shopInvestment || 0, assetRecoveries: source.assetRecoveries || 0, warehouseSavings: source.warehouseSavings || 0, factorySavings: source.factorySavings || 0, factoryCups: source.factoryCups || 0, loanInterest, incomeTax, loanPrincipal, totalCost, netProfit: pnl.turnover - totalCost, netMargin: pnl.turnover ? (pnl.turnover - totalCost) / pnl.turnover : null, incomplete: row ? !!row.reportingIncomplete || row.loanInterest == null || row.extraExpense == null : !!co.cm.reportingIncomplete || co.cm.extraExpense == null };
}

/** 門店診斷：按實際通路組合與每杯貢獻估算，不改變模擬狀態。 */
export function getShopAnalysis(world, shopId) {
  const s = shopBy(world, shopId);
  if (!s || s.owner !== 'player' || s.status === 'closed') return null;
  const di = world.day || dateOf(world.t / 24);
  const current = s.mtd.tradingDays >= 7 || !s.history.some((h) => h.cups > 0);
  const h = current ? { ...computePnL(world, s, di.dim), tradingDays: s.mtd.tradingDays, avgWait: s.mtd.waitCups ? s.mtd.waitSum / s.mtd.waitCups : 0, ym: ymOf(di) } : s.history.slice().reverse().find((h) => h.cups > 0);
  const contribution = h.cups ? (h.turnover - h.commission - h.cogs - h.pack - h.waste - V.fixedCost.utilityPerCup * h.cups - h.cardFee - h.bizTax) / h.cups : null;
  const monthlyWage = Math.round(s.staff.reduce((a, _, i) => a + hiredStaff(s, i) * (SHIFTS[i][1] - SHIFTS[i][0]), 0) * world.wages[s.wageLevel] * EMPLOYER_MILLI / 1000 * di.dim);
  const fixedMonthly = s.rent + monthlyWage + V.fixedCost.utilityBase + V.fixedCost.posMonthly;
  const breakEvenDaily = contribution > 0 ? Math.ceil(fixedMonthly / contribution / di.dim) : null;
  const co = playerCo(world), shopCount = liveShops(world).filter((x) => x.owner === 'player').length;
  const brandMonthly = Math.max(co.adWan * 10000, Math.floor(co.adDayUnits * 10000 / di.dim)) + (co.cm.extraExpense || 0) + (co.cm.researchExpense || 0) + (co.cm.stockWriteOff || 0) + facilityMonthly(co.expansion) + Math.max(0, shopCount - 1) * EXP.chain.managementPerShop + co.loans.reduce((a, l) => a + Math.round(l.balance * V.loan.rate / 12), 0);
  const brandAllocation = Math.round(brandMonthly / shopCount);
  const breakEvenWithBrandDaily = contribution > 0 ? Math.ceil((fixedMonthly + brandAllocation) / contribution / di.dim) : null;
  const capacityDaily = s.staff.reduce((a, n, i) => a + (SHIFTS[i][1] - SHIFTS[i][0]) * Math.floor((n === 1 ? V.capacity.soloCups : (n - 1) * V.capacity.workerCups) * V.capacity.wageSpeed[s.wageLevel] * effects(co.expansion).speed), 0);
  const dailyCups = h.tradingDays ? h.cups / h.tradingDays : 0;
  const lostRate = h.cups + h.lost ? h.lost / (h.cups + h.lost) : 0;
  return { shopId, name: s.name, status: s.status, ownerWorks: !!s.ownerWorks, ym: h.ym, current, sampleDays: h.tradingDays, pnl: h, dailyCups, contribution, fixedMonthly, monthlyWage, breakEvenDaily, breakEvenWithBrandDaily, brandAllocation, capacityDaily, lostRate, avgWait: h.avgWait, ownerSaving: Math.round(NHOURS * world.wages[s.wageLevel] * EMPLOYER_MILLI / 1000 * di.dim) };
}

/** 12 個月報表：通路、公司損益、市占率、商品與門店診斷。 */
export function getReport(world) {
  const co = playerCo(world);
  const di = world.status === 'playing' ? world.day || dateOf(Math.floor(world.t / 24)) : dateOf(Math.floor(world.t / 24));
  const rows = co.rows.slice(-12);
  const months = rows.map((r) => ({ ym: r.ym, storeRevenue: r.store, deliveryRevenue: r.gmv, deliveryNet: r.gmv - r.commission, cups: r.cups, walkCups: r.walk, deliveryCups: r.del }));
  const share = { months: [], player: [], daji: [], qingyou: [], other: [] };
  for (const m of world.monthly.slice(-12)) {
    share.months.push(m.ym);
    const t = m.total || 1;
    const pl = (m.cups.player || 0) / t, dj = (m.cups.daji || 0) / t, qy = (m.cups.qingyou || 0) / t;
    share.player.push(pl); share.daji.push(dj); share.qingyou.push(qy); share.other.push(1 - pl - dj - qy);
  }
  const items = {};
  for (const r of rows) for (const [k, it] of Object.entries(r.items)) { const x = items[k] || (items[k] = { cups: 0, rev: 0, cost: 0, wasteMilli: 0 }); x.cups += it.cups; x.rev += it.rev; x.cost += it.cost; x.wasteMilli += it.wasteMilli == null ? it.cost * Math.round(V.menu.wasteRate * 1000) : it.wasteMilli; }
  const products = ITEMS.map((k) => { const x = items[k] || { cups: 0, rev: 0, cost: 0, wasteMilli: 0 }; const directCost = x.cost + x.cups * V.menu.packagingPerCup + roundDiv(x.wasteMilli, 1000); return { name: k, cups: x.cups, revenue: x.rev, directCost, grossProfit: x.rev - directCost, avgPrice: x.cups ? x.rev / x.cups : 0, grossMargin: x.rev ? (x.rev - directCost) / x.rev : 0 }; });
  return { months, share, products, financials: rows.map((r) => companyPnL(world, co, r, di)), current: companyPnL(world, co, null, di), analysis: liveShops(world).filter((s) => s.owner === 'player').map((s) => getShopAnalysis(world, s.id)), facilities: getFacilities(world), market: getMarketAnalysis(world) };
}

// ───────────────────────── 存檔 ─────────────────────────
export function serialize(world) { return JSON.stringify(world); }
/** 補上新區域；原店面、租金、客源熟悉度與帳目保持原值。 */
export function expandMap(world, mapData, distances) {
  if (!mapData.lots.some((l) => !world.lots.some((x) => x.id === l.id))) return false;
  const fresh = createWorld({ mapData, distances, seed: world.seed, noRivals: true });
  const oldNb = world.bld.length;
  world.bld.push(...fresh.bld.filter((b) => !world.bld.some((x) => x.id === b.id)));
  world.lots.push(...fresh.lots.filter((l) => !world.lots.some((x) => x.id === l.id)));
  const nl = world.lots.length, mpt = V.people.metersPerTile;
  world.dM = world.bld.flatMap((b) => world.lots.map((l) => distances[b.id]?.[l.id] == null ? 1e9 : Math.round(distances[b.id][l.id] * mpt * 10) / 10));
  world.ll = world.lots.flatMap((la, i) => { const bi = world.bld.findIndex((b) => b.id === la.building); return world.lots.map((_, j) => i === j ? 0 : bi >= 0 ? world.dM[bi * nl + j] : 1e9); });
  for (const s of world.shops) { s.F.push(...new Array(world.bld.length - oldNb).fill(0)); s.buyB.push(...new Array(world.bld.length - oldNb).fill(0)); s.Fbar = avg(s.F); }
  world.popAll = world.bld.reduce((a, b) => a + b.pop, 0); DERIVED.delete(world);
  logEvt(world, 'info', '東城與南城開放，新增區域、店面與客源；原店帳目保留。');
  return true;
}
export function deserialize(json) {
  const w = typeof json === 'string' ? JSON.parse(json) : json;
  if (!w || w.v !== 1) throw new Error('存檔格式不符');
  for (const co of Object.values(w.companies)) if (co.cm.extraExpense == null) co.cm.reportingIncomplete = true;
  w.companies.player.expansion ||= newExpansion();
  const pc = w.companies.player;
  if (pc.borrowed == null) {
    pc.fundingIncomplete = pc.rows.some((r) => r.loanPrincipal == null);
    pc.capitalIncomplete = w.shops.some((s) => s.owner === 'player');
    pc.borrowed = pc.loans.reduce((a, l) => a + l.balance, 0) + pc.rows.reduce((a, r) => a + (r.loanPrincipal || 0) + (r.earlyPrincipal || 0), 0) + (pc.cm.earlyPrincipal || 0);
  }
  for (const co of Object.values(w.companies)) for (const [k, v] of Object.entries(newCM())) co.cm[k] ??= v;
  for (const s of w.shops) s.mtd.wasteMilli ??= s.mtd.cogs * Math.round(V.menu.wasteRate * 1000);
  return w;
}

// 給測試用
export const _internals = { queueWait, updateFamiliarity, computePnL, settleShop, settleMonth, derived, starOf, chainStarOf, recalcShop, closeShopInternal, dateOf, daysFromCivil, brandEstimate, ITEMS, END_DAY, yearEnd, startDay };
