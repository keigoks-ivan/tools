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
import { createIndustry, industryEffects, industryDay, industryAction } from './industry-sim.js';
import { BUSINESSES, businessOf, freshBusiness, retailBusiness, premises, assetMonthly, stockLimit, priceBounds, initialOperations, experience, hourlyCapacity } from './businesses.js';
import { MARKET_VERSION, configureMarket, districtAt, districtOf, updatePopulation, incomeOf, reach, deliveryReach, shareWallet, marketDistricts, walletAt } from './market.js';
import { PROFILES, MANAGERS, strategyOf, managerOf, strategyEffects, customerFit, strategyValid, managerValid } from './strategy.js';
import { projectCash } from './forecast.js';
export { PROFILES, MANAGERS } from './strategy.js';
export { BUSINESSES, businessOf, retailBusiness, premises, assetMonthly, stockLimit, priceBounds } from './businesses.js';

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
  d = { aM, passA, ssF, ssFbar, lotIdx, bldIdx, nb, nl, sectorReach: {}, deliveryReach: world.market ? Float64Array.from(world.dM, deliveryReach) : null };
  DERIVED.set(world, d);
  return d;
}
function walkAttraction(world, id, D = derived(world)) {
  if (!world.market) return D.aM;
  return D.sectorReach[id || 'tea'] ||= Float64Array.from(world.dM, (m) => reach(world, id, m));
}

export function createWorld({ mapData, distances, seed = 1, cal, playerName = '我的茶店', noRivals = false, multiBusiness = false, campaignBusiness = null }) {
  const calv = { c: V.calibrated.c, r: V.calibrated.r, r_del: V.calibrated.r_del, c_del: V.calibrated.c_del, ...(cal || {}) };
  const mpt = V.people.metersPerTile;
  // 建築與人口
  const floorSum = {};
  for (const b of mapData.buildings) if (TYPE_KEY[b.type]) floorSum[b.type] = (floorSum[b.type] || 0) + b.floors;
  const bld = mapData.buildings
    .filter((b) => TYPE_KEY[b.type])
    .map((b) => ({ id: b.id, type: b.type, key: TYPE_KEY[b.type], x: b.x, z: b.z, floors: b.floors, pop: (V.people[TYPE_KEY[b.type]] * (mapData.populationMultiplier || 1) * b.floors) / floorSum[b.type] }));
  // 空店面
  const lots = mapData.lots.map((l, i) => {
    const rng = stream(seed, T.LOT, i);
    const ping = V.lots.areaMin + Math.floor(rng() * (V.lots.areaMax - V.lots.areaMin + 1));
    const zone = l.zone === '住宅' ? '住宅' : l.zone;
    const [lo, hi] = V.lots.rentPerPing[zone] || V.lots.rentPerPing.住宅;
    const perPing = Math.round((lo + rng() * (hi - lo)) * (mapData.marketVersion ? districtOf(l.districtId || districtAt(l.x, l.z)).rent : 1) / 100) * 100;
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
    v: 1, seed, multiBusiness, noRivals, campaignBusiness, t: 0, status: 'playing', endReason: null, playerName,
    cal: calv, wages: { ...V.labor.wages }, milkPct: 100, milkYears: {},
    lots, bld, dM, ll, nextShopN: 1, shops: [], companies: {}, day: null,
    events: { list: [], nextId: 1 }, eventLog: [], sched: { typhoon: null, cold: null, platformAt: -1e9 },
    popAll: bld.reduce((a, b) => a + b.pop, 0), monthly: [], stats: { wantWalk: 0, arrWalk: 0, wantDel: 0, ordDel: 0, cupsWalk: 0, cupsDel: 0, menuRev: 0 },
  };
  if (mapData.marketVersion === MARKET_VERSION) configureMarket(world, 0, (mapData.bounds.maxX - mapData.bounds.minX) * (mapData.bounds.maxZ - mapData.bounds.minZ) * mpt * mpt / 1e6);
  // 公司
  const mkCo = (id, name, cash, awareness) => ({
    id, name, cash, awareness, loans: [], adWan: 0, adDayUnits: 0, adBoostUntil: -1, nol: 0, yearProfit: 0,
    platformBoost: false, day30: [0], revenue30: [0], cm: newCM(), rows: [], promoUsed: false, borrowed: 0,
  });
  world.companies[PLAYER] = mkCo(PLAYER, playerName, V.startup.startCash, V.awareness.start.player);
  world.companies[PLAYER].expansion = newExpansion();
  if (campaignBusiness) {
    if (!Object.hasOwn(BUSINESSES,campaignBusiness)) throw new Error('未知門店劇本');
    world.campaignInitialCash = {tea:2000000,cafe:3000000,bento:2000000,bakery:3000000,convenience:3000000,salon:2000000,restaurant:8000000,supermarket:14000000,fitness:20000000}[campaignBusiness];
    world.companies[PLAYER].cash = world.campaignInitialCash;
  }
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
    if (multiBusiness) seedBusinesses(world);
  }
  enablePressure(world);
  return world;
}

// 新城的競爭與租約；舊版小城與已結案存檔仍使用原規則。
function enablePressure(world) {
  if (!world.market || world.status !== 'playing' || world.warm) return;
  if (!world.pressure) {
    const occupancy = {}, population = {};
    for (const d of V.market.districts) {
      const lots = world.lots.filter((l) => l.districtId === d.id);
      occupancy[d.id] = lots.length ? lots.filter((l) => l.shopId).length / lots.length : 0;
      population[d.id] = world.bld.filter((b) => b.districtId === d.id).reduce((a, b) => a + b.pop, 0);
    }
    world.pressure = { version: 1, startT: world.t, occupancy, population };
  }
  for (const l of world.lots) l.baseRent ??= l.rent;
  for (const s of liveShops(world)) initLease(world, s);
}
function initLease(world, s) {
  if (!world.pressure) return;
  s.lease ||= { startT: world.t, endT: (Math.floor(world.t / 24) + V.leases.termDays) * 24, termDays: V.leases.termDays, noticeAtT: (Math.floor(world.t / 24) + V.leases.termDays - V.leases.noticeDays) * 24, offer: null, plan: null };
  s.mtd.rentUnits ??= s.rent * s.mtd.rentDays;
}
function updateAskingRents(world) {
  if (!world.pressure) return;
  const years = (world.t - world.pressure.startT) / 24 / 365;
  for (const d of V.market.districts) {
    const lots = world.lots.filter((l) => l.districtId === d.id), buildings = world.bld.filter((b) => b.districtId === d.id);
    const basePop = world.pressure.population[d.id], population = buildings.reduce((a, b) => a + b.pop, 0);
    const occupancy = lots.filter((l) => l.shopId).length / Math.max(1, lots.length);
    const factor = clamp(Math.pow(1 + V.leases.annualGrowth, years) * (basePop ? population / basePop : 1) * (1 + V.leases.occupancyWeight * (occupancy - world.pressure.occupancy[d.id])), 0.8, 1.6);
    for (const l of lots) {
      l.rent = Math.round(l.baseRent * factor); l.rentPerPing = Math.round(l.rent / l.ping); l.deposit = l.rent * V.startup.depositMonths;
    }
  }
}
function leaseOffer(world, s) {
  const quoted = premises(world.lots.find((l) => l.id === s.lotId), s.businessId).rent;
  const rent = Math.round(clamp(quoted, s.rent * (1 - V.leases.renewalLimit), s.rent * (1 + V.leases.renewalLimit)));
  return { rent, longRent: Math.round(rent * (1 - V.leases.longDiscount)) };
}
function leaseBreakFee(world, s) {
  return s.lease ? Math.round(s.rent * Math.min(V.leases.breakMonths, Math.max(0, s.lease.endT - world.t) / 24 / 30)) : 0;
}
export function getLeaseInfo(world, shopId, { includeAnalysis = true } = {}) {
  const s = shopBy(world, shopId);
  if (!s || s.status === 'closed' || !s.lease) return null;
  const lease = s.lease, offer = lease.offer || leaseOffer(world, s), analysis = includeAnalysis ? getShopAnalysis(world, s.id) : null;
  const dim = (world.day || dateOf(Math.floor(world.t / 24))).dim;
  const option = (rent, termDays, months) => ({ rent, termDays, deposit: rent * months, cashDelta: rent * months - s.deposit, breakEvenDaily: analysis?.contribution > 0 ? Math.ceil((analysis.fixedMonthly + rent - s.rent) / analysis.contribution / dim) : null });
  return { endDate: dateOf(lease.endT / 24).key, daysLeft: Math.max(0, Math.ceil((lease.endT - world.t) / 24)), rent: s.rent, deposit: s.deposit, one: option(offer.rent, V.leases.termDays, 2), long: option(offer.longRent, V.leases.termDays * 2, 3), quoted: !!lease.offer, canReview: world.status === 'playing' && world.t >= lease.endT - V.leases.noticeDays * 24, plan: lease.plan ? { ...lease.plan } : null, breakFee: leaseBreakFee(world, s) };
}
function leaseNotice(world, s) {
  if (world.events.list.some((e) => e.kind === 'lease' && e.shopId === s.id && e.status === 'pending')) return;
  s.lease.offer ||= leaseOffer(world, s);
  const info = getLeaseInfo(world, s.id), delta = (o) => o.cashDelta >= 0 ? `補押金 ${o.cashDelta.toLocaleString()} 元` : `退押金 ${(-o.cashDelta).toLocaleString()} 元`;
  pushEvent(world, { kind: 'lease', shopId: s.id, leaseEndT: s.lease.endT, title: `「${s.name}」續租決策`, text: `租約 ${info.endDate} 到期。目前月租 ${s.rent.toLocaleString()} 元。新租金從到期日生效；押金現在補退、不列費用。一年方案損平 ${info.one.breakEvenDaily == null ? '待累積成交資料' : info.one.breakEvenDaily + ' ' + businessOf(s.businessId).unit + '／天'}。兩年鎖租便宜 3%，但押金較多；提早退租最多付兩個月租金。可先延後，查月報或籌措資金。未決定預設續一年，補不起押金則到期退租。`, deadlineT: s.lease.endT, choices: [
    { key: 'A', label: `續租一年（月租 ${info.one.rent.toLocaleString()} 元；${delta(info.one)}）` },
    { key: 'B', label: `鎖租兩年（月租 ${info.long.rent.toLocaleString()} 元；${delta(info.long)}）` },
    { key: 'C', label: '到期退租（繼續營業到租期結束，屆時結清存貨並退押金）' },
    ...(world.t < s.lease.endT ? [{ key: 'D', label: '延後再談（7 天後提醒，可先看報表或借款）' }] : []),
  ] });
}
export function reviewLease(world, shopId) {
  const e0 = playing(world); if (e0) return e0;
  const [s, e] = ownShop(world, shopId); if (e) return e;
  if (!getLeaseInfo(world, shopId, { includeAnalysis: false })?.canReview) return fail('lease', '到期前 30 天才能處理續租');
  leaseNotice(world, s); return okRes();
}
function chooseLease(world, s, key, auto) {
  if (key === 'D') { s.lease.plan = null; s.lease.noticeAtT = Math.min(s.lease.endT, world.t + 7 * 24); return okRes(); }
  if (key === 'C') { s.lease.plan = { key: 'C' }; return okRes(); }
  const offer = s.lease.offer || leaseOffer(world, s), rent = key === 'B' ? offer.longRent : offer.rent;
  const deposit = rent * (key === 'B' ? 3 : 2), delta = deposit - s.deposit, co = world.companies[s.company];
  if (delta > co.cash) {
    if (auto) return chooseLease(world, s, 'C', false);
    return fail('cash', `補押金需要 ${Math.max(0, delta).toLocaleString()} 元。可先延後，再查看貸款與月報。`);
  }
  co.cash -= delta;
  if (delta > 0) co.cm.shopInvestment += delta; else co.cm.assetRecoveries -= delta;
  s.deposit = deposit; s.lease.plan = { key, rent, deposit, termDays: V.leases.termDays * (key === 'B' ? 2 : 1) };
  return okRes();
}
function leaseDay(world) {
  if (!world.pressure) return;
  for (const s of [...liveShops(world)]) {
    const lease = s.lease;
    if (world.t >= lease.endT) {
      if (!lease.plan) {
        const ev = world.events.list.find((e) => e.kind === 'lease' && e.shopId === s.id && e.status === 'pending');
        if (ev) applyChoice(world, ev, 'A', true); else chooseLease(world, s, 'A', true);
      }
      const plan = lease.plan;
      if (plan.key === 'C') { closeShopInternal(world, s, '租約到期，不再續租'); continue; }
      s.rent = plan.rent;
      s.lease = { startT: lease.endT, endT: lease.endT + plan.termDays * 24, termDays: plan.termDays, noticeAtT: lease.endT + (plan.termDays - V.leases.noticeDays) * 24, offer: null, plan: null };
      logEvt(world, 'decision', `「${s.name}」續租生效，月租 ${s.rent.toLocaleString()} 元，租期 ${plan.termDays} 天`);
    } else if (world.t >= lease.noticeAtT && !lease.plan) {
      if (s.owner === 'player') leaseNotice(world, s);
      else {
        lease.offer ||= leaseOffer(world, s);
        const profit = s.lastPnL?.profit;
        const leaving = profit != null && profit - (lease.offer.rent - s.rent) < 0 && s.lossStreak >= 3;
        chooseLease(world, s, leaving ? 'C' : 'A', true);
        logEvt(world, 'rival', `「${s.name}」${s.lease.plan.key === 'C' ? '決定到期退租' : '決定續租一年'}`);
      }
    }
  }
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
  return { walk: 0, del: 0, lost: 0, storeRev: 0, gmv: 0, commission: 0, cogs: 0, pack: 0, wasteMilli: 0, prepaidWaste: 0, prepared: 0, unsold: 0, stockLost: 0, wageMilli: 0, openDays: 0, rentDays: 0, menuRev: 0, tradingDays: 0, waitSum: 0, waitCups: 0 };
}

const RIVAL_COLORS = { daji: '#c2413a', qingyou: '#2f9d5c', road1: '#d98a1f', road2: '#8a4fc2', road3: '#14919b' };
function rivalShopName(world, co, lot) {
  const base = world.companies[co].name;
  return co.startsWith('road') ? base : `${base}${lot.zone}店`;
}

function makeShop(world, { company, lot, name, color, rival, businessId = 'tea' }) {
  const n = world.nextShopN++;
  const co = world.companies[company];
  const R = V.rivals;
  const kind = company === PLAYER ? 'player' : company.startsWith('road') ? 'road' : company;
  const prices = {};
  const biz = businessOf(businessId), cfg = R[kind] || { priceFactor: 1, wage: 'market', quality: 65, delivery: biz.delivery };
  const factor = rival ? cfg.priceFactor : 1;
  Object.entries(biz.items).forEach(([k, it]) => (prices[k] = Math.round(it.ref * factor)));
  const sh = {
    id: 'S' + n, n, lotId: lot.id, company, owner: rival ? 'rival' : 'player', name, businessId, assetLevel: 0, assetInvestment: 0, leasedPing: premises(lot, businessId).ping, operations: initialOperations(businessId, premises(lot, businessId).ping), stock: { day: -1, qty: 0, value: 0, prepared: 0 }, color: color || RIVAL_COLORS[company] || biz.color,
    status: 'renovating', createdT: world.t, openAtT: world.t + biz.renovationDays * 24, openedT: null, closedT: null,
    rent: premises(lot, businessId).rent, deposit: premises(lot, businessId).deposit, inv: biz.firstStock,
    prices, strategy: { profile: 'balanced', weights: {} }, manager: { ...managerOf({}) }, markupPct: V.delivery.markupDefault, delivery: !rival && biz.delivery && V.delivery.playerDefaultOn, staff: [...biz.staff],
    wageLevel: rival ? cfg.wage : 'market', grade: V.menu.defaultGrade, fixedQ: rival ? cfg.quality : null,
    revSum: 0, revCnt: 0, quality: 60, costMult: 1, mix: [], avgPrice: 55, avgPlat: 63,
    Bw: 0, Bd: 0, waitMin: V.choice.waitBase, closedToday: false,
    today: newToday(), mtd: newMTD(), days: [], history: [], hourEMA: new Array(NHOURS).fill(0),
    promo: { kind: null, daysLeft: 0, num: 1, den: 1 }, promoPending: false, promoUsed: false, qPromoCount: 0, permCut: false, lastPromoEndIdx: -1,
    boostUntilT: -1, lossStreak: 0, shortage: { daysLeft: 0, shift: 1 }, shiftCups: [0, 0, 0], waitDay7: [],
    tot: { walk: 0, del: 0, rev: 0, menuRev: 0, lost: 0 }, lastMonthCups: 0,
    F: new Array(world.bld.length).fill(0), buyB: new Array(world.bld.length).fill(0), Fbar: 0,
  };
  if (rival) {
    sh.delivery = !!cfg.delivery;
    if (kind === 'road') {
      sh.ownerWorks = true; sh.staff = [1, 1, 1];
      sh.rent = Math.round(lot.rent * R.road.rentFactor); sh.deposit = sh.rent * V.startup.depositMonths;
    }
  }
  if (!rival && world.campaignBusiness) sh.industry = createIndustry(businessId);
  recalcShop(world, sh);
  lot.shopId = sh.id;
  world.shops.push(sh);
  initLease(world, sh);
  return sh;
}
function newToday() { return { hourly: new Array(NHOURS).fill(null).map(() => [0, 0]), walk: 0, del: 0, lost: 0, waitCups: 0, waitSum: 0, rev: 0, prepared: 0, unsold: 0, waste: 0, stockLost: 0 }; }

function seedBusinesses(world) {
  const names = { cafe: '街角咖啡', bento: '好食便當', bakery: '晨光烘焙', convenience: '鄰里便利', salon: '巷口造型', restaurant: '家宴餐廳', supermarket: '好鄰超市', fitness: '活力健身' };
  for (const [id, name] of Object.entries(names)) {
    if (world.companies[id]) continue;
    const biz = businessOf(id), free = world.lots.filter((l) => !l.shopId && l.id !== medianResidentialLot(world));
    if (!free.length) break;
    free.sort((a, b) => (biz.affinity[b.zone === '捷運站旁' ? '捷運' : b.zone] || 1) - (biz.affinity[a.zone === '捷運站旁' ? '捷運' : a.zone] || 1) || a.id.localeCompare(b.id));
    const co = world.companies[id] = { id, name, cash: Math.max(8000000, lotOpenCost(free[0], id) + 2000000), awareness: 0.55, loans: [], adWan: 0, adDayUnits: 0, adBoostUntil: -1, nol: 0, yearProfit: 0, platformBoost: false, day30: [0], revenue30: [0], cm: newCM(), rows: [], borrowed: 0 };
    const sh = makeShop(world, { company: id, lot: free[0], name, rival: true, businessId: id });
    sh.status = 'open'; sh.openedT = 0; sh.createdT = -1; sh.revCnt = 200; sh.revSum = 800;
    sh.F = sh.F.map(() => 0.35); sh.Fbar = 0.35;
    co.cash -= lotOpenCost(free[0], id);
  }
}

export function syncBusinesses(world) {
  if (world.status === 'playing' && world.multiBusiness && !world.noRivals && Object.keys(world.companies).length > 1) seedBusinesses(world);
}

export function setOperations(world, shopId, changes) {
  const e0 = playing(world); if (e0) return e0;
  const [s, e] = ownShop(world, shopId); if (e) return e;
  const allowed = {
    cafe: { mode: ['takeaway', 'balanced', 'dinein'] },
    bento: { prep: [40, 600, 20], markdown: [0, 15, 30] },
    bakery: { prep: [40, 600, 20], markdown: [0, 20, 35] },
    convenience: { stockTarget: [20000, 300000, 10000], autoStock: [true, false] },
    salon: { service: ['quick', 'standard', 'premium'] },
    restaurant: { mode: ['takeaway', 'balanced', 'dinein'] },
    supermarket: { stockTarget: [100000, stockLimit(s), 100000], autoStock: [true, false] },
    fitness: { focus: ['open', 'coached', 'classes'] },
  }[s.businessId] || {};
  for (const [key, value] of Object.entries(changes)) {
    const rule = allowed[key];
    const range = key === 'prep' || key === 'stockTarget';
    if (!rule || (range ? !Number.isInteger(value) || value < rule[0] || value > rule[1] || (value - rule[0]) % rule[2] : !rule.includes(value))) return fail('operations', '經營設定不在允許範圍內');
  }
  Object.assign(s.operations, changes); recalcShop(world, s);
  logEvt(world, 'decision', `「${s.name}」調整經營：${Object.entries(changes).map(([k, v]) => `${k}=${v}`).join('、')}`);
  return okRes();
}

export function setStrategy(world, shopId, changes) {
  const e0 = playing(world); if (e0) return e0;
  const [s, e] = ownShop(world, shopId); if (e) return e;
  if (!changes || typeof changes !== 'object' || Object.keys(changes).some((k) => !['profile', 'weights'].includes(k)) || Object.hasOwn(changes, 'weights') && (!changes.weights || typeof changes.weights !== 'object' || Array.isArray(changes.weights))) return fail('strategy', '無效的定位或商品組合');
  const next = { ...strategyOf(s), ...changes, weights: { ...strategyOf(s).weights, ...(changes.weights || {}) } };
  if (!strategyValid(s, next)) return fail('strategy', '品項比重只能是 0–3，至少保留一種商品');
  s.strategy = next; recalcShop(world, s);
  logEvt(world, 'decision', `「${s.name}」調整定位／商品組合：${PROFILES[next.profile].name}`);
  return okRes({ pendingBatch: freshBusiness(s.businessId) && s.stock.day === Math.floor(world.t / 24) });
}
export function setManager(world, shopId, changes) {
  const e0 = playing(world); if (e0) return e0;
  const [s, e] = ownShop(world, shopId); if (e) return e;
  if (!changes || typeof changes !== 'object' || Object.keys(changes).some((k) => !['tier', 'goal', 'reserveMonths', 'staffing', 'purchasing'].includes(k))) return fail('manager', '無效的委任設定');
  const old = managerOf(s), next = { ...old, ...changes };
  if (!managerValid(next)) return fail('manager', '委任設定不在允許範圍內');
  const cost = next.tier !== old.tier ? MANAGERS[next.tier].hiring : 0;
  const co = playerCo(world); if (cost > 0 && co.cash < cost) return fail('cash', `招募與交接需要 ${cost.toLocaleString()} 元`);
  if (cost) charge(world, co, cost);
  if (next.tier !== old.tier) { next.lastReviewT = null; next.note = next.tier === 'none' ? '已停止委任' : '等待營業資料；每週檢視一次，不代替門店員工'; }
  s.manager = next;
  logEvt(world, 'decision', `「${s.name}」委任：${MANAGERS[next.tier].name}，目標${next.goal === 'profit' ? '控制成本' : '降低流失'}`);
  return okRes({ cost });
}
function activeStrategy(world, s) {
  const x = strategyOf(s);
  return freshBusiness(s.businessId) && s.stock.day === Math.floor(world.t / 24) && s.stock.weights ? { ...x, weights: s.stock.weights } : x;
}
function customerFits(world, s) {
  const D = derived(world), x = activeStrategy(world, s), key = JSON.stringify(x) + ':' + world.bld.length;
  D.customerFits ||= new Map();
  const old = D.customerFits.get(s.id); if (old?.key === key) return old.values;
  const fx = strategyEffects(s, x), values = Float64Array.from(world.bld, (b) => customerFit(s, b.key, incomeOf(world, b), x, fx));
  D.customerFits.set(s.id, { key, values }); return values;
}
function delegatedReserve(world, s) {
  const m = managerOf(s), co = world.companies[s.company];
  if (m.tier === 'none' || !m.purchasing) return 0;
  const shops = liveShops(world).filter((x) => x.company === s.company);
  return m.reserveMonths * (shops.reduce((a, x) => a + monthlyFixed(world, x), 0) + Math.max(0, shops.filter((x) => x.status === 'open').length - 1) * EXP.chain.managementPerShop + co.adWan * 10000 + facilityMonthly(co.expansion) + co.loans.reduce((a, l) => a + l.payment, 0));
}
function managerReview(world, s) {
  const m = managerOf(s); if (s.owner !== 'player' || s.status !== 'open' || m.tier === 'none' || m.lastReviewT != null && world.t - m.lastReviewT < 7 * 24) return;
  const recent = s.days.slice(-MANAGERS[m.tier].sample);
  if (recent.length < 3) return;
  const mean = avg(recent.map((d) => d.cups)), lost = avg(recent.map((d) => d.lost));
  const queueLost = avg(recent.map((d) => Math.max(0, d.lost - (d.stockLost || 0))));
  const changes = [], sp = V.capacity.wageSpeed[s.wageLevel] * effects(playerCo(world).expansion).speed * strategyEffects(s, activeStrategy(world, s)).speed;
  if (m.staffing) {
    const ratio = m.goal === 'service' ? 0.65 : 0.85;
    const demandMult = 1 + Math.min(0.5, queueLost / Math.max(1, mean));
    s.staff = s.staff.map((n, i) => {
      const peak = Math.max(...s.hourEMA.slice(i * 4, i * 4 + 4)) * demandMult;
      let target = V.capacity.staffMax;
      for (let k = 1; k <= V.capacity.staffMax; k++) if (hourlyCapacity(s, k, sp) * ratio >= peak) { target = k; break; }
      const next = clamp(target, n - 1, n + 1);
      if (next !== n) changes.push(`${SHIFTS[i][0]} 點班 ${n}→${next} 人`);
      return next;
    });
  }
  if (m.purchasing) {
    const biz = businessOf(s.businessId), unit = s.mix.reduce((a, n, i) => a + n * Object.values(biz.items)[i].cost * s.costMult, 0);
    if (freshBusiness(s.businessId)) {
      const target = clamp(Math.ceil((mean + Math.min(lost, mean * 0.25)) * (m.goal === 'service' ? 1.15 : 1.03) / 20) * 20, 40, 600);
      if (target !== s.operations.prep) { changes.push(`備貨 ${s.operations.prep}→${target}`); s.operations.prep = target; }
    } else if (retailBusiness(s.businessId)) {
      const step = s.businessId === 'supermarket' ? 100000 : 10000, min = s.businessId === 'supermarket' ? 100000 : 20000;
      const target = clamp(Math.ceil(mean * (unit + biz.packaging) * (m.goal === 'service' ? 4 : 2) / step) * step, min, stockLimit(s));
      if (target !== s.operations.stockTarget) { changes.push(`目標庫存 ${s.operations.stockTarget.toLocaleString()}→${target.toLocaleString()} 元`); s.operations.stockTarget = target; }
      // 尊重玩家的自動補貨開關。
    }
  }
  m.lastReviewT = world.t; m.note = `依近 ${recent.length} 天日均 ${Math.round(mean)} 筆、流失 ${Math.round(lost)} 筆：${changes.join('；') || '維持設定'}。${m.purchasing ? `補貨保留 ${m.reserveMonths} 個月固定支出。` : '未委任採購，補貨按你的原設定執行。'}`;
  if (changes.length) logEvt(world, 'manager', `「${s.name}」${m.note}`);
  recalcShop(world, s);
}
function replenishShop(world, s, target, delegated = false) {
  const co = world.companies[s.company], buy = Math.min(Math.max(0, target - s.inv), Math.max(0, co.cash - (delegated ? delegatedReserve(world, s) : 0)));
  s.inv += buy; co.cash -= buy; co.cm.stockPurchases += buy;
  return buy;
}
export function restockShop(world, shopId) {
  const e0 = playing(world); if (e0) return e0;
  const [s, e] = ownShop(world, shopId); if (e) return e;
  if (!retailBusiness(s.businessId)) return fail('business', '只有便利商店與超市使用商品補貨');
  const cost = replenishShop(world, s, s.operations.stockTarget);
  if (!cost) return fail('stock', '已達目標庫存，或沒有可用現金');
  logEvt(world, 'decision', `「${s.name}」補貨 ${cost.toLocaleString()} 元`);
  return okRes({ cost });
}

function prepareDaily(world, s) {
  if (!freshBusiness(s.businessId) || s.stock.day === world.day.idx) return;
  recalcShop(world, s);
  const co = world.companies[s.company], biz = businessOf(s.businessId);
  const rawUnit = Object.keys(biz.items).reduce((a, k, i) => a + s.mix[i] * biz.items[k].cost * s.costMult, 0);
  const qty = Math.min(s.operations.prep, Math.floor((Math.max(0, co.cash - delegatedReserve(world, s)) + s.inv) / rawUnit));
  const covered = s.owner === 'player' ? Math.min(qty, co.expansion.factoryLeft) : 0;
  const nominal = Math.round(rawUnit * qty), cost = Math.round(nominal * (qty ? 1 - EXP.facilities.factory.saving * covered / qty : 1));
  if (covered) { co.expansion.factoryLeft -= covered; co.cm.factoryCups += covered; co.cm.factorySavings += nominal - cost; }
  const fromInv = Math.min(s.inv, cost), supply = s.owner === 'player' ? warehouseSupply(world, cost - fromInv) : { used: 0, cost: 0 };
  s.inv -= fromInv; co.cash -= cost - fromInv - supply.used;
  s.stock = { day: world.day.idx, qty, value: cost - supply.used + supply.cost, prepared: qty, mix: [...s.mix], weights: { ...strategyOf(s).weights }, grade: s.grade };
  s.today.prepared = qty; s.mtd.prepared += qty;
}
function writeOffFresh(world, s) {
  if (!freshBusiness(s.businessId) || !s.stock.qty) return;
  s.today.unsold += s.stock.qty; s.today.waste += s.stock.value;
  s.mtd.unsold += s.stock.qty; s.mtd.wasteMilli += s.stock.value * 1000; s.mtd.prepaidWaste += s.stock.value;
  const keys = Object.keys(businessOf(s.businessId).items); let allocated = 0;
  keys.forEach((key, i) => {
    const amount = i === keys.length - 1 ? s.stock.value - allocated : Math.floor(s.stock.value * s.mix[i]); allocated += amount;
    const it = world.companies[s.company].cm.items[key] ||= { cups: 0, rev: 0, cost: 0 };
    it.wasteMilli = (it.wasteMilli || 0) + amount * 1000;
  });
  s.stock.qty = 0; s.stock.value = 0;
}

function demandAt(world, id, col, typical = false) {
  const D = typical && derived(world), key = typical && `${world.t}:${world.popAll}:${world.cal.r}:${world.cal.r_del}`;
  if (typical) {
    if (D.typical?.key !== key) D.typical = { key, pools: {} };
    if (D.typical.pools[id]?.[col]) return D.typical.pools[id][col];
  }
  const biz = businessOf(id), day = world.day, rain = avg(V.demand.rainProb);
  const weather = typical ? 1 - rain + rain * V.demand.rainWalkMult : day.walkW / (id !== 'tea' ? day.coldWalkFactor || 1 : 1);
  const season = id === 'tea' ? (typical ? 1 : day.season) : 1;
  const rule = world.market && V.market.sectors[id];
  const walk = world.bld.map((bd) => bd.pop * world.cal.r * (rule ? rule.rate : biz.rate) * biz.affinity[bd.key] * (rule ? Math.pow(incomeOf(world, bd), rule.incomeElasticity) : 1) * (biz.hours || V.demand.hourShare[bd.key])[col] / 100 * (typical ? (5 + 2 * V.demand.weekendMult[bd.key]) / 7 : day.wk[bd.key]) * season * weather);
  const deliveryRate = rule ? biz.delRate * rule.rate / biz.rate : biz.delRate;
  const del = world.popAll * V.people.deliveryPoolMult * world.cal.r_del * deliveryRate * (biz.hours || V.demand.hourShare.外送)[col] / 100 * (typical ? (5 + 2 * V.demand.weekendMult.外送) / 7 : day.wk.外送) * season * (typical ? 1 - rain + rain * V.demand.rainDeliveryMult : day.delW);
  const pool = { walk, del };
  if (typical) { D.typical.pools[id] ||= []; D.typical.pools[id][col] = pool; }
  return pool;
}
function referencePrice(id) {
  if (!id || id === 'tea') return V.choice.refPrice;
  const items = Object.values(businessOf(id).items); return items.reduce((a, it) => a + it.ref * it.pop, 0) / items.reduce((a, it) => a + it.pop, 0);
}
function markdownOf(s, h) { return freshBusiness(s.businessId) && h >= 18 ? 1 - s.operations.markdown / 100 : 1; }

function platPrice(p, markup) { return roundDiv(p * (100 + markup), 100); }

/** 價格、等級、時薪改變後，重算混合比例、均價、品質、成本倍數。 */
function recalcShop(world, sh) {
  const biz = businessOf(sh.businessId), keys = Object.keys(biz.items);
  let tot = 0;
  const w = keys.map((k, i) => { const x = biz.items[k].pop * (strategyOf(sh).weights[k] ?? 1) * Math.pow(sh.prices[k] / biz.items[k].ref, -V.choice.mixPriceElasticity); tot += x; return x; });
  const batch = freshBusiness(sh.businessId) && sh.stock.day === Math.floor(world.t / 24) && sh.stock.mix ? sh.stock : null;
  sh.mix = batch ? [...batch.mix] : w.map((x) => x / tot);
  sh.avgPrice = keys.reduce((s, k, i) => s + sh.mix[i] * sh.prices[k], 0);
  sh.avgPlat = keys.reduce((s, k, i) => s + sh.mix[i] * platPrice(sh.prices[k], sh.markupPct), 0);
  if (sh.fixedQ != null) { sh.quality = sh.fixedQ; sh.costMult = costMultOfQuality(sh.fixedQ); }
  else { const g = V.menu.grades[batch?.grade || sh.grade], fx = effects(world.companies[sh.company].expansion); sh.quality = g.quality + V.labor.qualityAdj[sh.wageLevel] + fx.quality + experience(sh) + strategyEffects(sh).quality; sh.costMult = g.cost * (biz.warehouse ? fx.material : 1) * industryEffects(sh).cost; }
}
const starOf = (sh) => (sh.revSum + V.reviews.priorStar * V.reviews.priorN) / (sh.revCnt + V.reviews.priorN);
function chainStarOf(world, sh) {
  const mine = world.shops.filter((s) => s.owner === 'player' && s.status === 'open' && (s.businessId || 'tea') === (sh.businessId || 'tea'));
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
  const e = playing(world); if (e) return [null, e];
  const s = shopBy(world, id);
  if (!s || s.owner !== 'player') return [null, fail('no_shop', '找不到這家店')];
  if (s.status === 'closed') return [null, fail('closed', '這家店已經關了')];
  return [s, null];
}

export function lotOpenCost(lot, businessId = 'tea') {
  const b = businessOf(businessId);
  return b.renovation + b.equipment + b.firstStock + premises(lot, businessId).deposit;
}

export function upgradeShop(world, shopId) {
  const e0 = playing(world); if (e0) return e0;
  const [s, e] = ownShop(world, shopId); if (e) return e;
  const upgrade = businessOf(s.businessId).upgrades?.[s.assetLevel || 0];
  if (!upgrade) return fail('upgrade', '此店沒有可用的設備升級');
  if (s.status !== 'open') return fail('renovating', '開張後才能擴充設備');
  const co = playerCo(world);
  if (co.cash < upgrade.cost) return fail('cash', `設備升級需要 ${upgrade.cost.toLocaleString()} 元`);
  co.cash -= upgrade.cost; co.cm.shopInvestment += upgrade.cost;
  s.assetLevel = (s.assetLevel || 0) + 1; s.assetInvestment = (s.assetInvestment || 0) + upgrade.cost;
  logEvt(world, 'decision', `「${s.name}」${upgrade.name}，投入 ${upgrade.cost.toLocaleString()} 元，每月新增維護 ${upgrade.monthly.toLocaleString()} 元`);
  return okRes({ cost: upgrade.cost, level: s.assetLevel });
}

export function storeIndustryAction(world,id,data) {
  const s = shopBy(world,id);
  if (!s || s.owner !== 'player' || s.status === 'closed') return fail('shop','沒有這家營業門店。');
  const co=playerCo(world),r=industryAction(s,data,{playing:world.status==='playing',cash:co.cash,pay:n=>{co.cash-=n;s.mtd.industryPaid=(s.mtd.industryPaid||0)+n;},note:t=>logEvt(world,'decision',s.name+'：'+t)});
  if(r.ok)recalcShop(world,s);
  return r;
}
export function openShop(world, lotId, { name, color, ownerWorks = false, businessId = 'tea' } = {}) {
  const e0 = playing(world); if (e0) return e0;
  const lot = world.lots.find((l) => l.id === lotId);
  if (!lot) return fail('no_lot', '找不到這個店面');
  if (lot.shopId) return fail('occupied', '這個店面已經有人租了');
  if (ownerWorks && liveShops(world).some((s) => s.owner === 'player' && s.ownerWorks)) return fail('owner_busy', '老闆一次只能顧一家店，請先關掉另一家店的自己顧店設定');
  const co = playerCo(world);
  if (world.campaignBusiness && businessId !== world.campaignBusiness) return fail('business','此劇本只經營所選業態；其他業態有獨立進度。');
  if (!BUSINESSES[businessId]) return fail('business', '找不到這個業態');
  const cost = lotOpenCost(lot, businessId);
  if (co.cash < cost) return fail('cash', `現金不夠：開店要 ${cost.toLocaleString()} 元（裝潢、設備、首批原料加押金），你只有 ${co.cash.toLocaleString()} 元`);
  co.cash -= cost;
  co.cm.shopInvestment = (co.cm.shopInvestment || 0) + cost;
  const n = world.shops.filter((s) => s.owner === 'player').length + 1;
  const sh = makeShop(world, { company: PLAYER, lot, name: name || `${co.name}${n}號店`, color, rival: false, businessId });
  sh.ownerWorks = !!ownerWorks;
  if (businessId !== 'tea' && !world.multiBusiness) { world.multiBusiness = true; if (!world.noRivals && Object.keys(world.companies).length > 1) seedBusinesses(world); }
  sh.mtd.rentDays = 1;
  if (world.pressure) sh.mtd.rentUnits = sh.rent;
  logEvt(world, 'open', `玩家租下 ${lot.id}（${lot.zone}），開設${businessOf(businessId).name}「${sh.name}」`);
  // 大吉茶行的反擊：300 公尺內開店 → 社群廣告加到每月 8 萬，維持 3 個月
  const R = V.rivals.daji;
  const li = derived(world).lotIdx[lot.id], nl = derived(world).nl;
  if (businessId === 'tea' && world.companies.daji && world.shops.some((s) => s.company === 'daji' && s.status !== 'closed' && world.ll[derived(world).lotIdx[s.lotId] * nl + li] <= R.counterRadiusM)) {
    world.companies.daji.adBoostUntil = (world.t / 24) + R.counterMonths * 30;
    logEvt(world, 'rival', `大吉茶行：玩家在 ${R.counterRadiusM} 公尺內開店，社群廣告加到每月 ${R.counterAdWan} 萬`);
  }
  return okRes({ shopId: sh.id, cost, openAtT: sh.openAtT });
}

export function closeShop(world, shopId) {
  const e0 = playing(world); if (e0) return e0;
  const [s, e] = ownShop(world, shopId); if (e) return e;
  const stockRecovery = retailBusiness(s.businessId) ? Math.floor(s.inv * 0.5) : 0;
  const breakFee = leaseBreakFee(world, s);
  closeShopInternal(world, s, '玩家關店');
  return okRes({ breakFee, stockRecovery, refund: s.deposit, equipment: Math.round((businessOf(s.businessId).equipment + (s.assetInvestment || 0)) * V.startup.equipmentRecovery) });
}

function closeShopInternal(world, s, why) {
  if (s.status === 'closed') return;
  const co = world.companies[s.company];
  const di = world.day || dateOf(0);
  const breakFee = leaseBreakFee(world, s);
  if (breakFee) charge(world, co, breakFee);
  for (const ev of world.events.list) if (ev.kind === 'lease' && ev.shopId === s.id && ev.status === 'pending') { ev.status = 'resolved'; ev.choice = 'C'; ev.auto = true; }
  for (const ev of world.events.list) if (ev.kind==='industry' && ev.shopId===s.id && ev.status==='pending') { ev.status='resolved';ev.choice='B';ev.auto=true; }
  if(s.industry){if(s.industry.work||s.industry.recovery)logEvt(world,'decision',s.name+'：門店關閉，專屬改善中止；已付費用不退回。');s.industry.work=null;s.industry.recovery=null;s.industry.situation=null;}
  if (s.inv > 0 || s.stock.qty > 0) {
    writeOffFresh(world, s);
    const recovered = retailBusiness(s.businessId) ? Math.floor(s.inv * 0.5) : 0;
    const loss = s.inv - recovered;
    s.mtd.wasteMilli += loss * 1000; s.mtd.prepaidWaste += loss;
    const keys = Object.keys(businessOf(s.businessId).items); let allocated = 0;
    keys.forEach((key, i) => {
      const amount = i === keys.length - 1 ? loss - allocated : Math.floor(loss * s.mix[i]); allocated += amount;
      const it = co.cm.items[key] ||= { cups: 0, rev: 0, cost: 0 };
      it.wasteMilli = (it.wasteMilli || 0) + amount * 1000;
    });
    co.cash += recovered; co.cm.assetRecoveries += recovered; s.inv = 0;
  }
  settleShop(world, s, di.dim, true);
  co.cash += s.deposit + Math.round((businessOf(s.businessId).equipment + (s.assetInvestment || 0)) * V.startup.equipmentRecovery);
  co.cm.assetRecoveries = (co.cm.assetRecoveries || 0) + s.deposit + Math.round((businessOf(s.businessId).equipment + (s.assetInvestment || 0)) * V.startup.equipmentRecovery);
  s.status = 'closed'; s.closedT = world.t;
  const lot = world.lots.find((l) => l.id === s.lotId); lot.shopId = null;
  s.Bw = 0; s.Bd = 0;
  logEvt(world, 'close', `「${s.name}」關店：${why}${breakFee ? `；提前退租違約金 ${breakFee.toLocaleString()} 元` : ''}`);
}

export function setPrices(world, shopId, prices) {
  const [s, e] = ownShop(world, shopId); if (e) return e;
  for (const [k, p] of Object.entries(prices)) {
    if (!businessOf(s.businessId).items[k]) return fail('item', `沒有「${k}」這個品項`);
    const { min: lo, max: hi, step } = priceBounds(s.businessId, k);
    if (!Number.isInteger(p) || p < lo || p > hi || (p - lo) % step !== 0)
      return fail('price', `「${k}」售價要在 ${lo} 到 ${hi} 元之間，每格 ${step} 元`);
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
  if (on && !businessOf(s.businessId).delivery) return fail('delivery', '這個業態沒有外送服務');
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
  const e = playing(world); if (e) return e;
  const co = playerCo(world);
  if (on && !world.events.list.some((e) => e.kind === 'platform')) return fail('noffer', '平台還沒有推出付費曝光方案');
  co.platformBoost = !!on;
  return okRes();
}

export function respondEvent(world, eventId, choice) {
  const e = playing(world); if (e) return e;
  const ev = world.events.list.find((e) => e.id === eventId);
  if (!ev) return fail('no_event', '找不到這個事件');
  if (ev.status !== 'pending') return fail('done', '這個事件已經處理過了');
  if (!ev.choices.some((c) => c.key === choice)) return fail('choice', '沒有這個選項');
  return applyChoice(world, ev, choice, false);
}
function applyChoice(world, ev, key, auto) {
  if (ev.kind === 'lease') {
    const s = shopBy(world, ev.shopId);
    if (!s || s.status === 'closed' || s.lease?.endT !== ev.leaseEndT) { ev.status = 'resolved'; return okRes(); }
    const r = chooseLease(world, s, key, auto); if (!r.ok) return r;
    ev.status = 'resolved'; ev.choice = key === 'D' ? key : s.lease.plan.key; ev.auto = auto;
    logEvt(world, 'decision', `${ev.title}：${ev.choices.find((c) => c.key === ev.choice).label}${auto ? '（到期自動套用）' : ''}`);
    return r;
  }
  if(ev.kind==='industry'){const r=storeIndustryAction(world,ev.shopId,{kind:'event',choice:key==='A'?'protect':'accept'});if(!r.ok)return r;ev.status='resolved';ev.choice=key;return okRes();}
  const co = playerCo(world);
  const cost = ev.choices.find((c) => c.key === key).cost || 0;
  if (cost && co.cash < cost && !auto) return fail('cash', `現金不夠：這個選項要 ${cost.toLocaleString()} 元`);
  if (cost && co.cash >= cost) charge(world, co, cost);
  ev.status = 'resolved'; ev.choice = key; ev.auto = auto;
  logEvt(world, 'decision', `${ev.title}：${ev.choices.find((c) => c.key === key).label}${auto ? '（到期自動套用）' : ''}`);
  if (ev.kind === 'typhoon' && world.sched.typhoon) world.sched.typhoon.choice = key;
  if (ev.kind === 'cold' && world.sched.cold) world.sched.cold.hot = key === 'A';
  if (ev.kind === 'milk' && key === 'A')
    for (const s of world.shops) if (s.owner === 'player' && s.status !== 'closed' && s.businessId === 'tea') {
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
      for (const s of liveShops(world)) if (s.owner === 'player' && s.status === 'open' && businessOf(s.businessId).factory) { s.revCnt += EXP.chain.badReviews; s.revSum += EXP.chain.badReviews; }
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
  const defaults = { industry:'B', typhoon: 'A', cold: 'B', milk: 'B', platform: 'B', flame: 'B', batch: 'B', lease: 'A' };
  for (const ev of world.events.list)
    if (ev.status === 'pending' && ev.deadlineT != null && world.t >= ev.deadlineT) applyChoice(world, ev, defaults[ev.kind], true);
}

// ───────────────────────── 每小時模擬 ─────────────────────────
export function clockOf(world, t = world.t) {
  const di = world.day && world.day.idx === Math.floor(t / 24) ? world.day : dateOf(Math.floor(t / 24));
  return { t, dayIndex: di.idx, year: di.y, month: di.m, day: di.d, hour: t % 24, dow: di.dow, dateStr: di.key, isWeekend: di.weekend, isHoliday: di.holiday };
}

export function fastForwardTarget(world, period) {
  if (period === 'week') return world.t + 7 * 24;
  if (period !== 'month') throw new Error('快進單位不符');
  const di = dateOf(Math.floor(world.t / 24));
  return (di.idx + di.dim - di.d + 1) * 24 + 1; // 推進到下月 1 日完成月結後。
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
  accrueManagement(s);
  s.mtd.maintenanceMilli = (s.mtd.maintenanceMilli || 0) + assetMonthly(s) * 1000;
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
  const groups = [...new Set(act.map((s) => s.businessId || 'tea'))].map((id) => ({ id, members: act.map((s, j) => (s.businessId || 'tea') === id ? j : -1).filter((j) => j >= 0), demand: demandAt(world, id, col) }));
  const want = groups.reduce((a, g) => a + g.demand.walk.reduce((t, n) => t + n, 0), 0), dpool = groups.reduce((a, g) => a + g.demand.del, 0);
  // 各店靜態項
  const lotI = act.map((s) => D.lotIdx[s.lotId]);
  const Ew0 = new Float64Array(na), Ed0 = new Float64Array(na), cap = new Int32Array(na), serviceCapacity = new Int32Array(na), boost = new Float64Array(na), staffNow = new Int32Array(na);
  const hasDel = new Uint8Array(na);
  act.forEach((s, j) => {
    prepareDaily(world, s);
    const co = world.companies[s.company];
    const sf = strategyEffects(s, activeStrategy(world, s));
    const promoMult = (s.promo.daysLeft > 0 ? s.promo.num / s.promo.den : 1) * markdownOf(s, h);
    const star = chainStarOf(world, s);
    Ew0[j] = Math.exp(cal.c - Ch.priceCoef * sf.priceSensitivity * Math.log((s.avgPrice * promoMult) / referencePrice(s.businessId)) + Ch.qualityCoef * (s.quality - Ch.qualityRef) + Ch.starCoef * (star - Ch.starRef));
    if (s.delivery) {
      hasDel[j] = 1;
      const k2 = Math.min(1, 1 - (1 - s.Fbar) * (1 - co.awareness) + (co.platformBoost ? V.delivery.boostAware : 0));
      Ed0[j] = Math.exp(cal.c_del - Ch.priceCoef * sf.priceSensitivity * Math.log(s.avgPlat * markdownOf(s, h) / (s.businessId === 'tea' ? V.delivery.refPrice : referencePrice(s.businessId) * 1.15)) + Ch.qualityCoef * (s.quality - Ch.qualityRef) + V.delivery.starCoef * (star - Ch.starRef) + Ch.awareCoef * Math.log(Ch.awareFloor + (1 - Ch.awareFloor) * k2));
    }
    let hired = hiredStaff(s, si);
    if (s.shortage.daysLeft > 0 && s.shortage.shift === si) hired = Math.max(s.ownerWorks ? 0 : 1, hired - 1);
    staffNow[j] = hired;
    const n = hired + (s.ownerWorks ? 1 : 0);
    const sp = V.capacity.wageSpeed[s.wageLevel] * (s.owner === 'player' ? effects(co.expansion).speed : 1) * sf.speed;
    const industry = industryEffects(s);
    Ew0[j] *= industry.demand; Ed0[j] *= industry.demand;
    cap[j] = Math.floor(hourlyCapacity(s, n, sp) * industry.capacity);
    serviceCapacity[j] = cap[j];
    if (freshBusiness(s.businessId)) cap[j] = Math.min(cap[j], s.stock.qty);
    if (retailBusiness(s.businessId)) { const biz = businessOf(s.businessId), unit = Math.max(...Object.values(biz.items).map((it, i) => s.mix[i] > 0 ? it.cost * s.costMult : 0)) + biz.packaging; cap[j] = Math.min(cap[j], Math.floor(s.inv / unit)); }
    boost[j] = t_boost(world, s) ? V.events.viralMult : 1;
  });
  // 每棟樓各自認識每家店：有效知名度 = 1 − (1 − F_sj) × (1 − 品牌名氣)；G＝距離衰減 × 知名度項
  const G = new Float64Array(nb * na);
  const fits = act.map((s) => customerFits(world, s));
  {
    const kA = act.map((s) => world.companies[s.company].awareness);
    const distances = act.map((s) => walkAttraction(world, s.businessId, D));
    for (let b = 0; b < nb; b++) for (let j = 0; j < na; j++) {
      const a = distances[j][b * nl + lotI[j]];
      if (a === 0) continue;
      const ke = 1 - (1 - act[j].F[b]) * (1 - kA[j]);
      G[b * na + j] = a * Math.pow(Ch.awareFloor + (1 - Ch.awareFloor) * ke, Ch.awareCoef) * fits[j][b];
    }
  }
  // ── 不動點：預期等候 ↔ 到店人數 ──
  const W = new Float64Array(na).fill(V.choice.waitBase);
  const lamW = new Float64Array(na), lamD = new Float64Array(na), E = new Float64Array(na), ea = new Float64Array(na);
  const leaveOf = (w) => (w > Ch.walkAwayAfterMin ? Math.min(Ch.walkAwayMax, (w - Ch.walkAwayAfterMin) / Ch.walkAwayFull) : 0);
  // 規格 15.2：客人記得要等——效用用上一小時的等候（每天開門第一小時重設為基本等候）；本小時的等候只決定有沒有人走掉
  const Wu = act.map((s) => (col === 0 ? V.choice.waitBase : s.waitMin));
  for (let j = 0; j < na; j++) E[j] = Ew0[j] * Math.exp(-Ch.waitCoef * Wu[j]);
  const origins = act.map(() => new Float64Array(nb)), deliveryOrigins = act.map(() => new Float64Array(nb));
  lamW.fill(0);
  for (const g of groups) {
    for (let b = 0; b < nb; b++) {
      let S = 0;
      for (const j of g.members) { ea[j] = E[j] * G[b * na + j]; S += ea[j]; }
      const f = g.demand.walk[b] / (1 + S);
      for (const j of g.members) { origins[j][b] = f * ea[j]; lamW[j] += origins[j][b]; }
    }
    let SD = 0;
    for (const j of g.members) if (hasDel[j]) SD += Ed0[j] * Math.exp(-V.delivery.waitCoef * Wu[j]);
    for (const j of g.members) lamD[j] = hasDel[j] ? g.demand.del * Ed0[j] * Math.exp(-V.delivery.waitCoef * Wu[j]) / (1 + SD) : 0;
    if (world.market) for (let b = 0; b < nb; b++) {
      let sum = 0;
      for (const j of g.members) { ea[j] = hasDel[j] ? Ed0[j] * Math.exp(-V.delivery.waitCoef * Wu[j]) * D.deliveryReach[b * nl + lotI[j]] * fits[j][b] : 0; sum += ea[j]; }
      for (const j of g.members) deliveryOrigins[j][b] = g.demand.del * world.bld[b].pop / world.popAll * ea[j] / (1 + sum);
    }
  }
  if (world.market) {
    const prices = act.map((s) => s.avgPrice * markdownOf(s, h) * (s.promo.daysLeft > 0 ? s.promo.num / s.promo.den : 1));
    shareWallet(world, origins, deliveryOrigins, prices, act.map((s) => s.avgPlat * markdownOf(s, h)), col, (key) => day.wk[key], boost, act.map((s) => s.businessId));
    act.forEach((s, j) => { lamW[j] = origins[j].reduce((a, n) => a + n, 0); lamD[j] = deliveryOrigins[j].reduce((a, n) => a + n, 0); });
  }
  for (let it = 0; it < 8; it++) {
    for (let j = 0; j < na; j++) {
      const s = act[j];
      const lw = lamW[j] * boost[j], ld = lamD[j] * boost[j];
      const joined = lw * (1 - leaveOf(W[j])) + ld;
      W[j] = 0.5 * W[j] + 0.5 * queueWait(s.Bw + s.Bd + joined, cap[j]);
    }
  }
  world.stats.wantWalk += want; world.stats.wantDel += dpool;
  const dayBrand = {};
  // ── 抽樣與產出 ──
  act.forEach((s, j) => {
    const co = world.companies[s.company], biz = businessOf(s.businessId), keys = Object.keys(biz.items), ni = keys.length;
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
    const nW = new Array(ni).fill(0), nD = new Array(ni).fill(0);
    for (let k = 0; k < sW; k++) nW[pick(s.mix, rngI())]++;
    for (let k = 0; k < sD; k++) nD[pick(s.mix, rngI())]++;
    const pm = s.promo.daysLeft > 0 ? s.promo : null;
    const commPct = V.delivery.commission + (co.platformBoost ? V.delivery.boostCommissionAdd : 0);
    const covered = s.owner === 'player' && biz.factory && !freshBusiness(s.businessId) ? Math.min(served, co.expansion.factoryLeft) : 0;
    if (covered) { co.expansion.factoryLeft -= covered; co.cm.factoryCups += covered; }
    const factoryFactor = served ? 1 - EXP.facilities.factory.saving * covered / served : 1;
    const itemCosts = [];
    let storeRev = 0, gmv = 0, cogs = 0, menuRev = 0;
    const preparedCost = freshBusiness(s.businessId) && s.stock.qty ? Math.round(s.stock.value * served / s.stock.qty) : 0;
    for (let i = 0; i < ni; i++) {
      const nm = keys[i], discount = markdownOf(s, h);
      const rv = Math.floor(nW[i] * s.prices[nm] * discount * (pm ? pm.num / pm.den : 1));
      const gv = Math.floor(nD[i] * platPrice(s.prices[nm], s.markupPct) * discount);
      const mp = nm === '鮮奶茶' ? world.milkPct : 100;
      const baseCost = Math.round(((nW[i] + nD[i]) * biz.items[nm].cost * s.costMult * mp) / 100);
      const cg = freshBusiness(s.businessId) ? Math.round(preparedCost * (nW.slice(0, i + 1).reduce((a, v) => a + v, 0) + nD.slice(0, i + 1).reduce((a, v) => a + v, 0)) / Math.max(1, served)) - itemCosts.reduce((a, v) => a + v, 0) : Math.round(baseCost * factoryFactor); itemCosts.push(cg);
      if (s.owner === 'player' && !freshBusiness(s.businessId)) co.cm.factorySavings += baseCost - cg;
      storeRev += rv; gmv += gv; cogs += cg; menuRev += (nW[i] + nD[i]) * s.prices[nm];
      const it = co.cm.items[nm] || (co.cm.items[nm] = { cups: 0, rev: 0, cost: 0 });
      it.cups += nW[i] + nD[i]; it.rev += rv + gv; it.cost += cg;
    }
    const pack = biz.packaging * served;
    const commission = Math.round((gmv * commPct) / 100);
    co.cash += storeRev + gmv - commission;
    const buy = (freshBusiness(s.businessId) ? 0 : cogs) + pack, fromInv = Math.min(s.inv, buy);
    const supply = s.owner === 'player' && biz.warehouse && !freshBusiness(s.businessId) ? warehouseSupply(world, Math.max(0, cogs - fromInv)) : { used: 0, cost: 0 };
    if (freshBusiness(s.businessId)) { s.stock.qty -= served; s.stock.value -= preparedCost; }
    s.inv -= fromInv; co.cash -= buy - fromInv - supply.used;
    const saving = supply.used - supply.cost, nominalCogs = cogs;
    cogs -= saving;
    let allocated = 0, runningCost = 0;
    for (let i = 0; i < ni; i++) {
      runningCost += itemCosts[i];
      const next = nominalCogs ? Math.round(saving * runningCost / nominalCogs) : 0;
      const it = co.cm.items[keys[i]], actualCost = itemCosts[i] - next + allocated;
      it.cost -= next - allocated; allocated = next;
      it.wasteMilli = (it.wasteMilli || 0) + actualCost * Math.round(Math.max(0, biz.waste - (s.owner === 'player' && biz.warehouse && !freshBusiness(s.businessId) ? effects(co.expansion).waste : 0)) * 1000);
    }
    // 人事（月底付）
    const wageH = world.wages[s.wageLevel];
    s.mtd.wageMilli += Math.round(staffNow[j] * wageH * biz.wageMult * EMPLOYER_MILLI);
    // 累計
    const m = s.mtd;
    m.wasteMilli = (m.wasteMilli || 0) + cogs * Math.round(Math.max(0, biz.waste - (s.owner === 'player' && biz.warehouse && !freshBusiness(s.businessId) ? effects(co.expansion).waste : 0)) * 1000);
    m.walk += sW; m.del += sD; m.storeRev += storeRev; m.gmv += gmv; m.commission += commission; m.cogs += cogs; m.pack += pack; m.menuRev += menuRev;
    const cm = co.cm;
    cm.cups += served; cm.walk += sW; cm.del += sD; cm.store += storeRev; cm.gmv += gmv; cm.commission += commission;
    co.day30[co.day30.length - 1] += served;
    co.revenue30 ||= [0]; co.revenue30[co.revenue30.length - 1] += storeRev + gmv;
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
        const sat = R.satBase + R.satQuality * (s.quality - 60) - R.satWait * Math.max(0, w - R.satWaitFree) - R.satPrice * Math.max(0, Math.log(s.avgPrice / (s.businessId === 'tea' ? REF_AVG : referencePrice(s.businessId))));
        for (let k = 0; k < nr; k++) { const st = clamp(Math.round(sat + R.noiseSd * gauss(rngR)), 1, 5); s.revSum += st; s.revCnt++; }
      }
    }
    // 售罄訂單立即流失，不留到隔日；產能不足仍按原排隊規則。
    let cancelled = 0;
    if ((freshBusiness(s.businessId) && !s.stock.qty) || (retailBusiness(s.businessId) && cap[j] < serviceCapacity[j])) {
      cancelled = s.Bw + s.Bd; s.Bw = 0; s.Bd = 0; td.stockLost += cancelled + lostW; s.mtd.stockLost += cancelled + lostW; td.lost += cancelled; s.tot.lost += cancelled;
    }
    if (h === CLOSE_H - 1) { cancelled += s.Bw + s.Bd; td.lost += s.Bw + s.Bd; s.tot.lost += s.Bw + s.Bd; s.Bw = 0; s.Bd = 0; }
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
  if (mu <= 0) return Qc.maxHighMin;
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
function accrueManagement(s) {
  s.mtd.strategyDayUnits = (s.mtd.strategyDayUnits || 0) + strategyEffects(s).monthly;
  s.mtd.industryDayUnits = (s.mtd.industryDayUnits || 0) + industryEffects(s).monthly;
  s.mtd.managerDayUnits = (s.mtd.managerDayUnits || 0) + MANAGERS[managerOf(s).tier].monthly;
}
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
    if (world.campaignBusiness) {
      const shops=world.shops.filter(s=>s.owner==='player'&&s.status==='open'), months=getMonthlyReport(world).financials.slice(-3);
      const mastered=shops.some(s=>s.industry?.milestones.length===3), profitable=months.length===3&&months.every(m=>m.netProfit>0);
      world.status=mastered&&profitable&&playerCo(world).cash>0?'won':'lost';
      world.endReason=`${businessOf(world.campaignBusiness).name}三年挑戰：${mastered?'完成業態里程碑':'尚未完成業態里程碑'}，${profitable?'最近三月獲利':'最近三月尚未穩定獲利'}`;
      return;
    }
    const sh = marketShare30(world);
    const best = Object.entries(sh).sort((a, b) => b[1] - a[1])[0];
    world.status = best[0] === PLAYER ? 'won' : 'lost';
    world.endReason = best[0] === PLAYER ? (world.multiBusiness ? '近 30 天全城營收市占第一' : '近 30 天全城杯數市占第一') : '到期時市占不是第一';
    return;
  }
  // 30 天滾動
  for (const co of Object.values(world.companies)) { if (prevDay) { co.day30.push(0); if (co.day30.length > 30) co.day30.shift(); co.revenue30 ||= [0]; co.revenue30.push(0); if (co.revenue30.length > 30) co.revenue30.shift(); } }
  // 天氣
  const rw = stream(world.seed, T.WEATHER, idx);
  const rain = rw() < V.demand.rainProb[di.m - 1];
  const weather = rain ? 'rain' : rw() < 0.5 ? 'sunny' : 'cloudy';
  world.day = { ...di, weather, rain, wk: {}, season: V.demand.seasonMult[di.m - 1], walkW: 1, delW: 1, eveBoost: false };
  updatePopulation(world);
  if (!world.warm) {
    if (di.d === 1) updateAskingRents(world);
    leaseDay(world);
    expansionDay(world, di);
    if (world.pressure) for (const co of Object.values(world.companies)) if (co.id !== PLAYER) {
      const count = liveShops(world).filter((s) => s.company === co.id && s.status === 'open').length;
      co.cm.chainDayUnits += Math.max(0, count - 1) * EXP.chain.managementPerShop;
    }
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
    if (Math.floor(s.createdT / 24) !== idx) {
      if (world.pressure) s.mtd.rentUnits = (s.mtd.rentUnits ?? s.rent * s.mtd.rentDays) + s.rent;
      s.mtd.rentDays += 1;
    }
    if (s.status === 'open') { s.mtd.openDays += 1; s.mtd.maintenanceMilli = (s.mtd.maintenanceMilli || 0) + assetMonthly(s) * 1000; accrueManagement(s); }
    if (s.status === 'open' && !s.closedToday) s.mtd.tradingDays += 1;
    if (s.promo.daysLeft > 0 && s.promo.kind === 'open1p1') world.companies[s.company].awareness = Math.min(1, world.companies[s.company].awareness + V.awareness.openingPromoPerDay);
    s.today = newToday();
    if (!world.warm) managerReview(world, s);
    if (s.status === 'open' && !s.closedToday && retailBusiness(s.businessId) && s.operations.autoStock) replenishShop(world, s, s.operations.stockTarget, true);
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
    f -= Fm.forget * (s.businessId === 'salon' ? 0.5 : 1) * f;
    s.F[b] = f; s.buyB[b] = 0; tot += f;
  }
  s.Fbar = tot / D.nb;
}
function endDay(world) {
  const idx = world.t / 24;
  for (const s of liveShops(world)) {
    if (s.status !== 'open') continue;
    writeOffFresh(world, s);
    updateFamiliarity(world, s);
    const td = s.today;
    const cups = td.walk + td.del;
    if (s.industry && !world.warm) {
      const fee=Math.round(td.rev*industryEffects(s).risk);
      world.companies[s.company].cash-=fee;s.mtd.industryPaid=(s.mtd.industryPaid||0)+fee;
      const event=industryDay(s,Math.floor(world.t/24),{volume:cups,utilization:cups/Math.max(1,dailyCapacity(world,s)),lost:td.lost,prepared:td.prepared,unsold:td.unsold,revenue:td.rev,shops:getShops(world,'player').filter(x=>x.businessId===s.businessId).length},t=>logEvt(world,'decision',s.name+'：'+t),getShops(world,'player').find(x=>x.status==='open'&&x.businessId===s.businessId)?.id===s.id);
      if(event)pushEvent(world,{kind:'industry',title:s.name+'：'+event.title,text:event.text+' 改善需七個營運日，期間能力保留 8%。',shopId:s.id,deadlineT:world.t+10*24,choices:[{key:'A',label:event.protect+'（'+event.cost.toLocaleString()+' 元）'},{key:'B',label:event.accept}]});
      recalcShop(world,s);
    }
    s.days.push({ day: Math.floor(world.t / 24), cups, walk: td.walk, del: td.del, lost: td.lost, stockLost: td.stockLost, prepared: td.prepared, unsold: td.unsold, wait: td.waitCups ? td.waitSum / td.waitCups : 0, rev: td.rev });
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
      const e = pushEvent(world, { kind: 'typhoon', title: '颱風明天登陸', text: '氣象署發布颱風警報。今天大家會囤貨，客人增加；明天停班停課，門市客人幾乎歸零。', deadlineT: (idx + 1) * 24, choices: [{ key: 'A', label: '照常開外送（外送訂單 ×1.6，但有 10% 機率被罵）', cost: 0 }, { key: 'B', label: '全面停業一天', cost: 0 }] });
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
    if (idx >= cd.start && idx < cd.start + cd.len) { dm.coldWalkFactor = cd.hot ? V.events.coldHotDrinkWalkMult : V.events.coldWalkMult; dm.walkW *= dm.coldWalkFactor; }
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
        pushEvent(world, { kind: 'flame', title: `「${s.name}」被寫了負評文`, text: `一篇負評文湧進 ${V.events.flameStars} 則 1 星。`, shopId: s.id, deadlineT: world.t + V.events.flameRespondDays * 24, choices: [{ key: 'A', label: `公開道歉並提供體驗折扣（花 ${V.events.flameApologyCost.toLocaleString()} 元，撤回一半 1 星）`, cost: V.events.flameApologyCost }, { key: 'B', label: '不回應', cost: 0 }] });
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
    const shops = liveShops(world).filter((s) => s.owner === 'player' && s.status === 'open' && businessOf(s.businessId).factory).length;
    const cost = EXP.chain.recallBase + EXP.chain.recallPerShop * shops;
    pushEvent(world, { kind: 'batch', title: '中央備料批次異常', text: `共用備料出現品質異常。回收會停中央供料 ${EXP.chain.batchDays} 天、報廢 10% 倉庫庫存；門店仍可自行備料。繼續供料會讓每家使用中央備料的營業門店增加 ${EXP.chain.badReviews} 則 1 星，拖累全品牌客源。`, deadlineT: world.t + 24, choices: [{ key: 'A', label: `回收檢查（${cost.toLocaleString()} 元）`, cost }, { key: 'B', label: '繼續供料，承受餐飲分店負評', cost: 0 }] });
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
  const m = s.mtd, F = V.fixedCost, biz = businessOf(s.businessId);
  const wage = roundDiv(m.wageMilli, 1000);
  const rent = Math.floor((m.rentUnits ?? s.rent * m.rentDays) / dim);
  const util = Math.floor((biz.utility * m.openDays) / dim) + biz.utilityUnit * (m.walk + m.del);
  const maintenance = Math.floor((m.maintenanceMilli || 0) / 1000 / dim);
  const pos = Math.floor((F.posMonthly * m.openDays) / dim);
  const waste = m.wasteMilli == null ? Math.round(m.cogs * V.menu.wasteRate) : roundDiv(m.wasteMilli, 1000);
  const cardFee = Math.floor((m.storeRev * V.tax.cardFeePct) / 100);
  const turnover = m.storeRev + m.gmv;
  const purchases = m.cogs + m.pack + waste;
  const bizTax = calcBusinessTax(turnover, purchases);
  const strategyCost = Math.floor((m.strategyDayUnits || 0) / dim), managerCost = Math.floor((m.managerDayUnits || 0) / dim);
  const industryCost = Math.floor((m.industryDayUnits || 0)/dim) + (m.industryPaid || 0);
  const profit = turnover - industryCost - m.commission - purchases - wage - rent - util - maintenance - pos - cardFee - bizTax - strategyCost - managerCost;
  return { industryCost, turnover, storeRev: m.storeRev, gmv: m.gmv, commission: m.commission, cogs: m.cogs, pack: m.pack, waste, wage, rent, util, maintenance, pos, cardFee, bizTax, strategyCost, managerCost, profit, cups: m.walk + m.del, walk: m.walk, del: m.del, lost: m.lost, purchases };
}
/** 結一家店的當月帳（付費用現金、記入歷史）。final＝關店時的最後一筆。 */
function settleShop(world, s, dim, final) {
  const m = s.mtd;
  const empty = m.rentDays === 0 && m.walk + m.del === 0 && m.openDays === 0 && !m.wasteMilli;
  if (empty) return null;
  const pnl = computePnL(world, s, dim);
  const co = world.companies[s.company];
  co.cash -= pnl.industryCost - (m.industryPaid || 0) + pnl.waste - (m.prepaidWaste || 0) + pnl.wage + pnl.rent + pnl.util + pnl.maintenance + pnl.pos + pnl.cardFee + pnl.bizTax + pnl.strategyCost + pnl.managerCost;
  co.yearProfit += pnl.profit;
  const di = world.day || dateOf(0);
  const ym = final ? ymOf(di) : ymOf(dateOf(world.t / 24 - 1));
  s.history.push({ ym, partial: !!final, tradingDays: m.tradingDays, prepared: m.prepared, unsold: m.unsold, stockLost: m.stockLost, ...pnl, avgDaily: m.tradingDays ? (pnl.cups / m.tradingDays) : 0, avgWait: m.waitCups ? m.waitSum / m.waitCups : 0 });
  if (s.history.length > 48) s.history.shift();
  s.lastMonthCups = pnl.cups;
  s.lastPnL = pnl; s.lastTradingDays = m.tradingDays;
  s.mtd = newMTD();
  return pnl;
}

function monthlyFixed(world, s) {
  const wage = (s.staff.reduce((a, _, i) => a + hiredStaff(s, i), 0) * 4 * world.wages[s.wageLevel] * businessOf(s.businessId).wageMult * EMPLOYER_MILLI * 30) / 1000;
  return s.rent + businessOf(s.businessId).utility + assetMonthly(s) + V.fixedCost.posMonthly + wage + strategyEffects(s).monthly + MANAGERS[managerOf(s).tier].monthly + industryEffects(s).monthly;
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
  const brandCups = {}, brandRevenue = {};
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
    brandCups[co.id] = co.cm.cups; brandRevenue[co.id] = co.cm.store + co.cm.gmv;
    co.rows.push({ ym, adCost, facilityCost, chainCost, loanInterest, loanPrincipal, incomeTax: 0, ...co.cm });
    if (co.rows.length > 48) co.rows.shift();
    co.cm = newCM();
  }
  world.monthly.push({ ym, revenue: brandRevenue, cups: brandCups, total: Object.values(brandCups).reduce((a, b) => a + b, 0) });
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
  // 新業態依最近客流調整供給，成本與缺貨仍照相同規則結算。
  for (const s of liveShops(world)) {
    if (s.owner !== 'rival' || s.businessId === 'tea' || s.status !== 'open' || s.days.length < 20) continue;
    const recent = s.days.slice(-14), daily = avg(recent.map((d) => d.cups)), lost = avg(recent.map((d) => d.lost));
    if (freshBusiness(s.businessId)) s.operations.prep = clamp(Math.ceil((daily + lost * 0.25) * 1.05 / 20) * 20, 40, 600);
    if (retailBusiness(s.businessId)) { const step = s.businessId === 'supermarket' ? 100000 : 10000; s.operations.stockTarget = clamp(Math.ceil(daily * 3 * Object.values(businessOf(s.businessId).items).reduce((a, it) => a + it.cost * it.pop / 100, 0) / step) * step, step * 2, stockLimit(s)); }
    if (s.businessId === 'cafe' && avg(recent.map((d) => d.wait)) > 12) s.operations.mode = 'takeaway';
    if (s.businessId === 'salon' && avg(recent.map((d) => d.wait)) > 12) s.operations.service = 'quick';
    s.staff = SHIFTS.map(([a, b]) => {
      const peak = Math.max(...s.hourEMA.slice(a - OPEN_H, b - OPEN_H));
      const capacities = Array.from({ length: V.capacity.staffMax }, (_, i) => hourlyCapacity(s, i + 1, V.capacity.wageSpeed[s.wageLevel]));
      const target = Math.min(peak / V.queue.targetRho, Math.max(...capacities));
      for (let n = 1; n <= V.capacity.staffMax; n++) if (capacities[n - 1] >= target) return n;
      return V.capacity.staffMax;
    });
    recalcShop(world, s);
  }
  // 排班：依近期尖峰人數調整
  for (const s of liveShops(world)) {
    if (s.owner !== 'rival' || s.status !== 'open' || s.days.length < 20 || s.businessId !== 'tea') continue;
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
    if (world.pressure) break;
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
  if (world.pressure) { pressureRivalMonthly(world, di); return; }
  // 大吉、青柚：擴張（算整個品牌每月多賺多少，含租金、人力與搶走自己分店的客人）
  for (const co of ['daji', 'qingyou']) {
    const c = world.companies[co];
    if (!c || c.exited) continue;
    const cfg = R[co];
    const count = world.shops.filter((s) => s.company === co && s.status !== 'closed').length;
    if (count >= cfg.maxShops || c.cash <= cfg.expandCash) continue;
    const descs = world.shops.filter((s) => s.status !== 'closed').map((s) => descOfShop(world, s)), base = brandEstimate(world, co, null, descs);
    let candidates = world.lots.filter((l) => !l.shopId);
    if (world.market) {
      const D = derived(world), a = walkAttraction(world, 'tea', D), rivals = descs.filter((d) => !d.businessId || d.businessId === 'tea');
      const competition = world.bld.map((_, b) => 1 + rivals.reduce((sum, d) => sum + d.walkG[b], 0));
      const scored = candidates.map((lot) => {
        const li = D.lotIdx[lot.id], demand = world.bld.reduce((sum, b, bi) => sum + b.pop * a[bi * D.nl + li] / competition[bi], 0);
        return { lot, score: demand * world.cal.r - lot.rent / 30.4 / 35 };
      });
      candidates = V.market.districts.flatMap((d) => scored.filter((x) => x.lot.districtId === d.id).sort((a, b) => b.score - a.score || a.lot.id.localeCompare(b.lot.id)).slice(0, V.market.rivalCandidates).map((x) => x.lot));
    }
    let best = null;
    for (const lot of candidates) {
      const gain = brandEstimate(world, co, lot, descs) - base;
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

function rivalCandidate(world, lot, co, businessId) {
  const biz = businessOf(businessId), cfg = V.rivals[co.id] || { priceFactor: 1, quality: 65, wage: 'market', delivery: biz.delivery };
  const items = Object.values(biz.items), prices = items.map((it) => Math.round(it.ref * cfg.priceFactor));
  const weights = items.map((it, i) => it.pop * Math.pow(prices[i] / it.ref, -V.choice.mixPriceElasticity)), total = weights.reduce((a, n) => a + n, 0);
  const mix = weights.map((n) => n / total), leased = premises(lot, businessId), operations = initialOperations(businessId, leased.ping);
  let staff = [...biz.staff];
  if (freshBusiness(businessId)) {
    const template = liveShops(world).filter((s) => s.company === co.id && s.status === 'open' && s.days.length >= 20).sort((a, b) => (b.lastPnL?.profit || 0) - (a.lastPnL?.profit || 0))[0];
    if (template) { operations.prep = template.operations.prep; operations.markdown = template.operations.markdown; staff = [...template.staff]; }
  }
  return mkDesc(world, { businessId, operations, staff, li: derived(world).lotIdx[lot.id], co, avgP: mix.reduce((a, m, i) => a + m * prices[i], 0), avgPlat: mix.reduce((a, m, i) => a + m * platPrice(prices[i], V.delivery.markupDefault), 0), q: cfg.quality + V.labor.qualityAdj[cfg.wage] + experience({ businessId, operations }), star: V.reviews.priorStar, delivery: cfg.delivery, mix, costMult: V.menu.grades.標準.cost, rent: leased.rent, wageH: world.wages[cfg.wage] * biz.wageMult, sp: V.capacity.wageSpeed[cfg.wage], hiredHours: staff.reduce((a, n) => a + n, 0) * 4, fixedStaff: true, company: co.id });
}
function pressureRivalMonthly(world, di) {
  const cfg = V.competition;
  if (world.noRivals || world.t < world.pressure.startT + cfg.graceDays * 24) return;
  const D = derived(world);
  // 短期促銷依客流下滑觸發；薄毛利商品不能無限降價。
  for (const s of liveShops(world)) {
    if (s.owner !== 'rival' || s.company.startsWith('road') || s.status !== 'open' || s.days.length < 90 || s.promo.daysLeft > 0 || world.t < (s.lastPressurePromoT ?? -1e9) + cfg.cooldownDays * 24) continue;
    const recent = avg(s.days.slice(-30).map((d) => d.cups)), previous = avg(s.days.slice(-90, -30).map((d) => d.cups));
    const radius = V.market.sectors[s.businessId].radius, li = D.lotIdx[s.lotId];
    if (recent >= previous * 0.85 || !liveShops(world).some((p) => p.owner === 'player' && p.businessId === s.businessId && p.status === 'open' && world.ll[li * D.nl + D.lotIdx[p.lotId]] <= radius)) continue;
    const biz = businessOf(s.businessId), co = world.companies[s.company];
    if (co.cash < monthlyFixed(world, s)) continue;
    const floor = Math.max(...Object.entries(biz.items).map(([key, it]) => (it.cost * s.costMult * (1 + biz.waste) + biz.packaging + biz.utilityUnit) * 1.1 / s.prices[key]));
    const percent = Math.ceil(Math.max(1 - cfg.promoPct / 100, floor) * 100);
    if (percent >= 100) continue;
    s.promo = { kind: 'competitive', daysLeft: 14, num: percent, den: 100 }; s.lastPressurePromoT = world.t;
    logEvt(world, 'rival', `「${s.name}」因客流下降推出 ${percent}% 售價促銷，持續 14 天`);
  }
  let openings = 0;
  const brands = Object.values(world.companies).filter((co) => co.id !== PLAYER && !co.id.startsWith('road') && !co.exited).sort((a, b) => a.id.localeCompare(b.id));
  const offset = (di.y * 12 + di.m) % Math.max(1, brands.length), order = [...brands.slice(offset), ...brands.slice(0, offset)];
  let descs = liveShops(world).map((s) => descOfShop(world, s)), before = estimateDay(world, descs);
  for (const co of order) {
    if (openings >= cfg.maxOpenings) break;
    const own = liveShops(world).filter((s) => s.company === co.id), id = own[0]?.businessId;
    if (!id || own.some((s) => s.status === 'renovating') || world.t < (co.lastExpansionT ?? world.pressure.startT) + cfg.cooldownDays * 24) continue;
    if (own.some((s) => s.lastPnL) && own.reduce((a, s) => a + (s.lastPnL?.profit || 0), 0) <= Math.max(0, own.length - 1) * EXP.chain.managementPerShop) continue;
    const cap = Math.max(2, Math.round(cfg.cityCaps[id] * world.lots.length / 101));
    if (own.length >= cap) continue;
    const fixed = own.reduce((a, s) => a + monthlyFixed(world, s), 0), baseProfit = descs.reduce((a, d, i) => a + (d.company === co.id ? estProfit(d, before.walk[i], before.del[i]) : 0), 0);
    const competition = world.bld.map((_, b) => 1 + descs.reduce((a, d) => a + (d.businessId === id ? d.walkG[b] : 0), 0)), attraction = walkAttraction(world, id, D);
    const items = Object.values(businessOf(id).items), margin = items.reduce((a, it) => a + it.pop * (it.ref - it.cost), 0) / items.reduce((a, it) => a + it.pop, 0);
    const scored = world.lots.filter((l) => !l.shopId).map((lot) => {
      const li = D.lotIdx[lot.id], demand = world.bld.reduce((a, b, i) => a + b.pop * attraction[i * D.nl + li] / competition[i], 0);
      return { lot, score: demand * businessOf(id).rate - premises(lot, id).rent / 30.4 / Math.max(1, margin) };
    });
    // 每區先保留最佳店面，再取全城前四名，避免對 101 個店面重跑需求池。
    const candidates = V.market.districts.flatMap((d) => scored.filter((x) => x.lot.districtId === d.id).sort((a, b) => b.score - a.score || a.lot.id.localeCompare(b.lot.id)).slice(0, 1)).sort((a, b) => b.score - a.score || a.lot.id.localeCompare(b.lot.id)).slice(0, cfg.candidates);
    let best = null;
    for (const { lot } of candidates) {
      const candidate = rivalCandidate(world, lot, co, id), cost = lotOpenCost(lot, id);
      const candidateFixed = candidate.rent + businessOf(id).utility + V.fixedCost.posMonthly + candidate.hiredHours * candidate.wageH * EMPLOYER_MILLI / 1000 * 30.4;
      const reserve = Math.ceil((fixed + candidateFixed + own.length * EXP.chain.managementPerShop) * cfg.reserveMonths + candidate.rent * businessOf(id).renovationDays / 30.4);
      if (co.cash < cost + reserve) continue;
      const all = [...descs, candidate], after = estimateDay(world, all);
      const profit = all.reduce((a, d, i) => a + (d.company === co.id ? estProfit(d, after.walk[i], after.del[i]) : 0), 0);
      const gain = profit - baseProfit - EXP.chain.managementPerShop;
      if (gain <= 0 || cost / gain > cfg.paybackMonths) continue;
      if (!best || gain > best.gain) best = { lot, gain, cost, reserve, candidate };
    }
    if (best) {
      co.cash -= best.cost; co.cm.shopInvestment += best.cost; co.lastExpansionT = world.t;
      const s = makeShop(world, { company: co.id, lot: best.lot, name: `${co.name}・${best.lot.district}店`, rival: true, businessId: id });
      if (freshBusiness(id)) { s.operations.prep = best.candidate.operations.prep; s.operations.markdown = best.candidate.operations.markdown; s.staff = [...best.candidate.staff]; recalcShop(world, s); }
      s.mtd.rentDays = 1; s.mtd.rentUnits = s.rent; openings++;
      logEvt(world, 'rival', `${co.name}在 ${best.lot.id}（${best.lot.district}）簽約展店，裝修 ${businessOf(id).renovationDays} 天；預估品牌每月多賺 ${Math.round(best.gain).toLocaleString()} 元，保留現金緩衝 ${best.reserve.toLocaleString()} 元`);
      descs = liveShops(world).map((s) => descOfShop(world, s)); before = estimateDay(world, descs);
    }
  }
}

// ── 擴張評估：典型日（平日週末加權、全年平均雨天、季節 1.0、無排隊）預估各店杯數，再換算每月獲利 ──
function descOfShop(world, s) {
  const D = derived(world), co = world.companies[s.company];
  const hired = s.staff.reduce((a, _, i) => a + hiredStaff(s, i), 0) * 4, biz = businessOf(s.businessId);
  return mkDesc(world, { businessId: s.businessId, industry: s.industry, strategy: activeStrategy(world, s), manager: managerOf(s), assetLevel: s.assetLevel, operations: s.operations, staff: s.staff.map((_, i) => hiredStaff(s, i) + (s.ownerWorks ? 1 : 0)), li: D.lotIdx[s.lotId], co, avgP: s.avgPrice * (s.promo.daysLeft > 0 ? s.promo.num / s.promo.den : 1), avgPlat: s.avgPlat, q: s.quality, star: chainStarOf(world, s), delivery: s.delivery, mix: s.mix, costMult: s.costMult, rent: s.rent, wageH: world.wages[s.wageLevel] * biz.wageMult, sp: V.capacity.wageSpeed[s.wageLevel] * (s.owner === 'player' ? effects(co.expansion).speed : 1) * strategyEffects(s, activeStrategy(world, s)).speed, ownerWorks: !!s.ownerWorks, hiredHours: hired, fixedStaff: s.owner === 'player' || s.businessId !== 'tea', company: s.company });
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
  const Ch = V.choice, cal = world.cal, biz = businessOf(o.businessId);
  const sf = strategyEffects(o);
  const unitIngr = o.mix.reduce((a, m, i) => a + m * Object.values(biz.items)[i].cost, 0) * o.costMult;
  const base = cal.c - Ch.priceCoef * sf.priceSensitivity * Math.log(o.avgP / referencePrice(o.businessId)) + Ch.qualityCoef * (o.q - Ch.qualityRef) + Ch.starCoef * (o.star - Ch.starRef) - Ch.waitCoef * queueWait(V.queue.targetRho * V.capacity.workerCups, V.capacity.workerCups); // 尖峰預期等候（ρ≈0.8）
  const Ed = o.delivery ? Math.exp(cal.c_del - Ch.priceCoef * sf.priceSensitivity * Math.log(o.avgPlat / (!o.businessId || o.businessId === 'tea' ? V.delivery.refPrice : referencePrice(o.businessId) * 1.15)) + Ch.qualityCoef * (o.q - Ch.qualityRef) + V.delivery.starCoef * (o.star - Ch.starRef) + Ch.awareCoef * Math.log(Ch.awareFloor + (1 - Ch.awareFloor) * (1 - (1 - derived(world).ssFbar[o.li]) * (1 - o.co.awareness))) - V.delivery.waitCoef * Ch.waitBase) : 0;
  const industry = industryEffects(o), D = derived(world), distances = walkAttraction(world, o.businessId, D), Ew = Math.exp(base)*industry.demand;
  const walkG = Float64Array.from({ length: D.nb }, (_, b) => Ew * distances[b * D.nl + o.li] * Math.pow(Ch.awareFloor + (1 - Ch.awareFloor) * (1 - (1 - D.ssF[b * D.nl + o.li]) * (1 - o.co.awareness)), Ch.awareCoef) * customerFit(o, world.bld[b].key, incomeOf(world, world.bld[b])));
  const delG = world.market ? Float64Array.from({ length: D.nb }, (_, b) => Ed * industry.demand * D.deliveryReach[b * D.nl + o.li] * customerFit(o, world.bld[b].key, incomeOf(world, world.bld[b]))) : null;
  return { ...o, k: o.co.awareness, Ew, Ed:Ed*industry.demand, unitIngr, walkG, delG, priceSensitivity: sf.priceSensitivity };
}
function estimateDay(world, descs) {
  const D = derived(world), Ch = V.choice, n = descs.length, walk = new Array(n).fill(0), del = new Array(n).fill(0); let spend = 0;
  const groups = [...new Set(descs.map((d) => d.businessId || 'tea'))].map((id) => ({ id, members: descs.map((d, i) => (d.businessId || 'tea') === id ? i : -1).filter((i) => i >= 0) }));
  const origins = descs.map(() => new Float64Array(D.nb)), deliveryOrigins = descs.map(() => new Float64Array(D.nb)), ea = new Float64Array(n), ed = new Float64Array(n);
  for (let col = 0; col < NHOURS; col++) {
    const dh = new Array(n).fill(0);
    for (const group of groups) {
      const pool = demandAt(world, group.id, col, true), sd = group.members.reduce((a, j) => a + descs[j].Ed, 0);
      for (const j of group.members) dh[j] = pool.del * descs[j].Ed / (1 + sd);
      for (let b = 0; b < D.nb; b++) {
        let sum = 0, sumD = 0;
        for (const j of group.members) {
          const d = descs[j];
          const markdown = d.operations ? markdownOf(d, col + OPEN_H) : 1;
          ea[j] = d.walkG[b] * Math.pow(markdown, -Ch.priceCoef * d.priceSensitivity);
          sum += ea[j];
          if (world.market) { ed[j] = d.delG[b] * Math.pow(markdown, -Ch.priceCoef * d.priceSensitivity); sumD += ed[j]; }
        }
        for (const j of group.members) {
          origins[j][b] = pool.walk[b] * ea[j] / (1 + sum);
          if (world.market) deliveryOrigins[j][b] = pool.del * world.bld[b].pop / world.popAll * ed[j] / (1 + sumD);
        }
      }
    }
    if (world.market) {
      shareWallet(world, origins, deliveryOrigins, descs.map((d) => d.avgP * (d.operations ? markdownOf(d, col + OPEN_H) : 1)), descs.map((d) => d.avgPlat * (d.operations ? markdownOf(d, col + OPEN_H) : 1)), col, (key) => (5 + 2 * V.demand.weekendMult[key]) / 7, [], descs.map((d) => d.businessId));
      for (let j = 0; j < n; j++) dh[j] = deliveryOrigins[j].reduce((a, v) => a + v, 0);
    }
    for (let j = 0; j < n; j++) {
      const d = descs[j], biz = businessOf(d.businessId); let wh = origins[j].reduce((a, v) => a + v, 0);
      if (world.market || d.businessId && d.businessId !== 'tea') {
        const shift = Math.floor(col / 4), capacity = Math.floor(hourlyCapacity(d, (d.staff || biz.staff)[shift], d.sp)*industryEffects(d).capacity);
        const limit = freshBusiness(d.businessId) ? Math.max(0, d.operations.prep - walk[j] - del[j]) : retailBusiness(d.businessId) ? Math.max(0, d.operations.stockTarget / (d.unitIngr + biz.packaging) - walk[j] - del[j]) : Infinity;
        const ratio = wh + dh[j] ? Math.min(1, capacity / (wh + dh[j]), limit / (wh + dh[j])) : 0;
        wh *= ratio; dh[j] *= ratio;
      }
      walk[j] += wh; del[j] += dh[j];
      const markdown = d.operations ? markdownOf(d, col + OPEN_H) : 1;
      spend += (wh * d.avgP + dh[j] * d.avgPlat) * markdown;
    }
  }
  return { walk, del, spend };
}
function estProfit(d, walk, del) {
  const biz = businessOf(d.businessId), days = 30.4, w = walk * days, dl = del * days, c = w + dl;
  const discount = freshBusiness(d.businessId) ? 1 - d.operations.markdown / 100 * 0.3 : 1;
  const revW = w * d.avgP * discount, gmv = dl * d.avgPlat * discount, comm = (gmv * V.delivery.commission) / 100;
  const ingr = c * d.unitIngr;
  const purchases = (freshBusiness(d.businessId) ? Math.max(c, d.operations.prep * days) * d.unitIngr : ingr * (1 + biz.waste)) + c * biz.packaging;
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
  return turn - comm - purchases - wage - d.rent - (biz.utility + assetMonthly(d) + biz.utilityUnit * c) - V.fixedCost.posMonthly - revW * 0.01 - tax - strategyEffects(d).monthly - MANAGERS[managerOf(d).tier].monthly - industryEffects(d).monthly - Math.round(turn * industryEffects(d).risk);
}
/** 品牌（現有店＋候選店面）預估每月總獲利；lot＝null 表示不開新店。 */
function brandEstimate(world, companyId, lot, existing) {
  const descs = existing ? [...existing] : world.shops.filter((s) => s.status !== 'closed').map((s) => descOfShop(world, s));
  if (lot) descs.push(descOfCandidate(world, lot, companyId));
  const { walk, del } = estimateDay(world, descs);
  let tot = 0;
  descs.forEach((d, j) => { if (d.company === companyId) tot += estProfit(d, walk[j], del[j]); });
  return tot;
}

// ───────────────────────── 查詢（給介面） ─────────────────────────
function facilityMonthly(exp) { return FACILITY_KEYS.reduce((a, k) => a + (ready(exp, k) ? EXP.facilities[k][exp.facilities[k].active ? 'monthly' : 'standby'] : 0), 0); }

/** 同一需求池比較開店前後，將原分店被分走的銷量扣回。 */
export function getExpansionEstimate(world, lotId, { ownerWorks = false, businessId = 'tea' } = {}) {
  const lot = world.lots.find((l) => l.id === lotId);
  if (!lot || lot.shopId) return null;
  const co = playerCo(world), fx = effects(co.expansion), g = V.menu.grades.標準, biz = businessOf(businessId), items = Object.values(biz.items);
  const mix = items.map((it) => it.pop / items.reduce((a, x) => a + x.pop, 0));
  const avgPrice = mix.reduce((a, m, i) => a + m * items[i].ref, 0);
  const leased = premises(lot, businessId), operations = initialOperations(businessId, leased.ping);
  const candidate = mkDesc(world, { businessId, operations, staff: biz.staff, li: derived(world).lotIdx[lot.id], co, avgP: avgPrice, avgPlat: mix.reduce((a, m, i) => a + m * platPrice(items[i].ref, V.delivery.markupDefault), 0), q: g.quality + V.labor.qualityAdj.market + fx.quality, star: V.reviews.priorStar, delivery: biz.delivery, mix, costMult: g.cost * (biz.warehouse ? fx.material : 1), rent: leased.rent, wageH: world.wages.market * biz.wageMult, sp: V.capacity.wageSpeed.market, ownerWorks, hiredHours: (biz.staff.reduce((a, n) => a + n, 0) - (ownerWorks ? 3 : 0)) * 4, fixedStaff: true, company: PLAYER });
  const descs = liveShops(world).map((s) => descOfShop(world, s)), before = estimateDay(world, descs), after = estimateDay(world, [...descs, candidate]);
  let oldBefore = 0, oldAfter = 0, profitBefore = 0, profitAfter = 0, crossSectorRevenueLostDaily = 0;
  descs.forEach((d, i) => { if (d.company === PLAYER) {
    if ((d.businessId || 'tea') === businessId) { oldBefore += before.walk[i] + before.del[i]; oldAfter += after.walk[i] + after.del[i]; }
    else crossSectorRevenueLostDaily += Math.max(0, (before.walk[i] - after.walk[i]) * d.avgP + (before.del[i] - after.del[i]) * d.avgPlat);
    profitBefore += estProfit(d, before.walk[i], before.del[i]); profitAfter += estProfit(d, after.walk[i], after.del[i]);
  } });
  const i = descs.length, newDaily = after.walk[i] + after.del[i], lostDaily = Math.max(0, oldBefore - oldAfter);
  const management = descs.some((d) => d.company === PLAYER) ? EXP.chain.managementPerShop : 0;
  const incrementalProfit = Math.round(profitAfter + estProfit(candidate, after.walk[i], after.del[i]) - profitBefore - management);
  return { newDaily, lostDaily, netNewDaily: newDaily - lostDaily, cannibalization: newDaily ? lostDaily / newDaily : 0, crossSectorRevenueLostDaily, incrementalProfit, management, businessId, unit: biz.unit, radius: world.market ? V.market.sectors[businessId].radius : V.choice.walkRadiusM, openCost: lotOpenCost(lot, businessId), paybackMonths: incrementalProfit > 0 ? lotOpenCost(lot, businessId) / incrementalProfit : null };
}

export function getFacilities(world) {
  const co = playerCo(world), exp = co.expansion, di = world.day || dateOf(Math.floor(world.t / 24));
  const row = co.rows.at(-1) || co.cm, periodDays = co.rows.length ? daysInMonth(+row.ym.slice(0, 4), +row.ym.slice(5)) : Math.max(1, di.d);
  return { facilities: FACILITY_KEYS.map((key) => {
    const cfg = EXP.facilities[key], f = exp.facilities[key];
    const eligible = world.shops.filter((s) => s.owner === 'player' && businessOf(s.businessId)[key === 'factory' ? 'factory' : 'warehouse']);
    const parts = eligible.flatMap((s) => co.rows.length ? s.history.filter((h) => h.ym === row.ym) : [{ ...computePnL(world, s, di.dim), prepared: s.mtd.prepared, businessId: s.businessId }]);
    const raw = parts.reduce((a, h) => a + h.cogs + (h.prepared ? h.waste : 0), 0) + (row.warehouseSavings || 0) + (row.factorySavings || 0);
    const units = parts.reduce((a, h) => a + (h.prepared || h.cups), 0), daily = units / periodDays, rawUnit = units ? raw / units : null;
    const grossSaving = rawUnit == null || key === 'lab' ? null : key === 'warehouse' ? daily * di.dim * rawUnit * cfg.discount : Math.min(daily, cfg.cupsDaily) * di.dim * rawUnit * cfg.saving;
    return { key, ...cfg, ...JSON.parse(JSON.stringify(f)), monthly: cfg[f.active ? 'monthly' : 'standby'], daysLeft: f.status === 'building' ? Math.max(0, Math.ceil((f.completeAtT - world.t) / 24)) : 0, grossSaving, netSaving: grossSaving == null ? null : grossSaving - cfg.monthly, breakEvenDaily: rawUnit > 0 && key !== 'lab' ? Math.ceil(cfg.monthly / (rawUnit * (key === 'warehouse' ? cfg.discount : cfg.saving)) / di.dim) : null };
  }), projects: Object.entries(EXP.projects).map(([key, p]) => ({ key, ...p, done: !!exp.projects[key] })), research: exp.research ? { ...exp.research } : null, factoryLeft: exp.factoryLeft, batchDaysLeft: Math.max(0, Math.ceil((exp.batchUntilT - world.t) / 24)), monthly: facilityMonthly(exp) };
}

export function getMarketAnalysis(world) {
  const ids = world.multiBusiness ? Object.keys(BUSINESSES) : ['tea'];
  const allShops = liveShops(world).filter((s) => s.status === 'open'), allEst = estimateDay(world, allShops.map((s) => descOfShop(world, s)));
  const sectors = ids.map((id) => {
    const indices = allShops.map((s, i) => (s.businessId || 'tea') === id ? i : -1).filter((i) => i >= 0), shops = indices.map((i) => allShops[i]);
    let potentialDaily = 0;
    for (let col = 0; col < NHOURS; col++) { const pool = demandAt(world, id, col, true); potentialDaily += pool.walk.reduce((a, n) => a + n, 0) + pool.del; }
    const typicalOrders = indices.reduce((a, i) => a + allEst.walk[i] + allEst.del[i], 0);
    const capacityDaily = shops.reduce((a, s) => a + dailyCapacity(world, s), 0);
    return { businessId: id, name: businessOf(id).name, unit: businessOf(id).unit, radius: world.market ? V.market.sectors[id].radius : V.choice.walkRadiusM, potentialDaily, typicalOrders, capacityDaily, openShops: shops.length, saturation: potentialDaily ? typicalOrders / potentialDaily : 0 };
  });
  const districts = marketDistricts(world), residents = world.bld.filter((b) => b.key === '住宅').reduce((a, b) => a + b.pop, 0);
  const budgetDaily = world.market ? world.bld.reduce((a, b) => a + walletAt(world, b, 0, (5 + 2 * V.demand.weekendMult[b.key]) / 7) * 100 / V.market.hours[0], 0) : null;
  return { population: world.popAll, residents, districts, marketVersion: world.market?.version, areaKm2: world.market?.areaKm2, budgetDaily, estimatedSpendDaily: allEst.spend, budgetUse: budgetDaily ? allEst.spend / budgetDaily : null, growth: world.market ? world.popAll / world.bld.reduce((a, b) => a + b.basePop, 0) - 1 : 0, potentialDaily: sectors.reduce((a, s) => a + s.potentialDaily, 0), typicalOrders: sectors.reduce((a, s) => a + s.typicalOrders, 0), capacityDaily: sectors.reduce((a, s) => a + s.capacityDaily, 0), openShops: sectors.reduce((a, s) => a + s.openShops, 0), freeLots: world.lots.filter((l) => !l.shopId).length, lots: world.lots.length, saturation: sectors.reduce((a, s) => a + s.typicalOrders, 0) / Math.max(1, sectors.reduce((a, s) => a + s.potentialDaily, 0)), sectors };
}
function dailyCapacity(world, s) {
  const speed = V.capacity.wageSpeed[s.wageLevel] * (s.owner === 'player' ? effects(playerCo(world).expansion).speed : 1) * strategyEffects(s, activeStrategy(world, s)).speed;
  const capacity = s.staff.reduce((a, _, i) => a + 4 * Math.floor(hourlyCapacity(s, hiredStaff(s, i) + (s.ownerWorks ? 1 : 0), speed)*industryEffects(s).capacity), 0);
  return freshBusiness(s.businessId) ? Math.min(capacity, s.operations.prep) : capacity;
}

/** 結案資料使用整局月帳，包含已關閉的分店。 */
export function getFinalReport(world) {
  const co = playerCo(world), di = dateOf(Math.floor(world.t / 24));
  const months = co.rows.map((r) => companyPnL(world, co, r, di));
  if (!months.some((r) => r.ym === ymOf(di)) && (Object.values(co.cm).some((v) => typeof v === 'number' && v !== 0) || world.shops.some((s) => s.owner === 'player' && s.status !== 'closed' && s.mtd.rentDays))) months.push(companyPnL(world, co, null, di));
  const keys = [...PNL_SUM, 'totalCost', 'netProfit', 'adCost', 'extraExpense', 'facilityCost', 'chainCost', 'researchExpense', 'stockWriteOff', 'loanInterest', 'incomeTax', 'loanPrincipal', 'shopInvestment', 'facilityCapex', 'stockPurchases', 'assetRecoveries', 'warehouseSavings', 'factorySavings'];
  const totals = Object.fromEntries(keys.map((k) => [k, months.reduce((a, r) => a + (r[k] || 0), 0)]));
  const shops = world.shops.filter((s) => s.owner === 'player').map((s) => {
    const parts = [...s.history]; if (s.status !== 'closed' && s.mtd.rentDays) parts.push({ ...computePnL(world, s, di.dim), prepared: s.mtd.prepared, unsold: s.mtd.unsold, stockLost: s.mtd.stockLost, tradingDays: s.mtd.tradingDays });
    const cups = parts.reduce((a, h) => a + h.cups, 0), days = parts.reduce((a, h) => a + (h.tradingDays || 0), 0);
    return { businessId: s.businessId, business: businessOf(s.businessId).name, unit: businessOf(s.businessId).unit, prepared: parts.reduce((a, h) => a + (h.prepared || 0), 0), unsold: parts.reduce((a, h) => a + (h.unsold || 0), 0), name: s.name, status: s.status, cups, daily: days ? cups / days : 0, revenue: parts.reduce((a, h) => a + h.turnover, 0), profit: parts.reduce((a, h) => a + h.profit, 0), lost: parts.reduce((a, h) => a + h.lost, 0), star: starOf(s) };
  });
  const debt = co.loans.reduce((a, l) => a + l.balance, 0), findings = [];
  findings.push(totals.netProfit > 0 ? '整局營運淨利為正；再比較開店與後勤投入，判斷投資是否已回收。' : totals.netProfit === 0 ? '整局營運損益為零，尚未產生正收益。' : '整局營運仍虧損，應先改善單店損益，再增加分店。');
  if (totals.wage + totals.rent > totals.turnover * 0.5 && totals.turnover) findings.push('人事與租金超過營收一半，固定成本是主要壓力。');
  if (totals.facilityCost > totals.warehouseSavings + totals.factorySavings) findings.push('後勤固定費高於已實現的採購與備料節省；研發的品質與產能效益需另看成交量、等候和評價。');
  if (totals.lost > totals.cups * 0.05) findings.push('流失訂單超過成交量的 5%，尖峰產能與等候時間值得優先改善。');
  if (debt > co.cash) findings.push('剩餘貸款高於現金，後續仍有還款壓力。');
  if (world.status === 'won' && totals.netProfit < 0) findings.push('市占第一達成遊戲目標，但沒有同時達成獲利。');
  const businesses = Object.keys(BUSINESSES).map((id) => { const stores = shops.filter((s) => s.businessId === id); return { id, name: businessOf(id).name, unit: businessOf(id).unit, stores: stores.length, revenue: stores.reduce((a, s) => a + s.revenue, 0), profit: stores.reduce((a, s) => a + s.profit, 0), volume: stores.reduce((a, s) => a + s.cups, 0), unsold: stores.reduce((a, s) => a + s.unsold, 0) }; }).filter((b) => b.stores);
  return { campaignBusiness: world.campaignBusiness || null, industries: world.shops.filter(s=>s.owner==='player'&&s.industry).map(s=>({name:s.name,businessId:s.businessId,industry:structuredClone(s.industry)})), businesses, multiBusiness: world.multiBusiness, company: co.name, status: world.status, reason: world.endReason, startDate: V.time.startDate, endDate: di.key, initialCash: world.campaignInitialCash || V.startup.startCash, cash: co.cash, debt, borrowed: co.fundingIncomplete ? null : co.borrowed ?? null, capitalIncomplete: !!co.capitalIncomplete, totals, months, shops, share: marketShare30(world), projects: Object.keys(co.expansion.projects).filter((k) => co.expansion.projects[k]).map((k) => EXP.projects[k].name), findings, events: world.eventLog.filter((e) => ['open', 'close', 'facility', 'research', 'loan', 'batch', 'decision', 'bankrupt'].includes(e.kind)).map((e) => ({ date: dateOf(Math.floor(e.t / 24)).key, text: e.text })), incomplete: months.some((r) => r.incomplete), market: getMarketAnalysis(world) };
}

export function marketShare30(world) {
  const sums = {}; let tot = 0;
  for (const co of Object.values(world.companies)) { const s = (world.multiBusiness ? co.revenue30 || [0] : co.day30).reduce((a, b) => a + b, 0); sums[co.id] = s; tot += s; }
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
    return { id: l.id, zone: l.zone, state: !s ? '空' : s.owner === 'player' ? '玩家' : '對手', owner: s ? s.owner : null, businessId: s ? s.businessId : null, name: s ? s.name : '', color: s ? s.color : null, shopId: s ? s.id : null, status: s ? s.status : null };
  });
}
export function getLotInfo(world, lotId, businessId = 'tea') {
  const D = derived(world);
  const li = D.lotIdx[lotId];
  if (li == null) return null;
  const lot = world.lots[li], nl = D.nl;
  let pop500 = 0;
  world.bld.forEach((b, bi) => { if (world.dM[bi * nl + li] <= 500) pop500 += b.pop; });
  const nearby = liveShops(world).filter((s) => s.id !== lot.shopId && world.ll[li * nl + D.lotIdx[s.lotId]] <= 500).length;
  const radius = world.market ? V.market.sectors[businessId].radius : V.choice.walkRadiusM, catchment = world.bld.filter((b, bi) => world.dM[bi * nl + li] <= radius);
  return { id: lot.id, zone: lot.zone, district: lot.district, income: world.market ? incomeOf(world, { districtId: lot.districtId }) : 1, radius, catchmentPopulation: catchment.reduce((a, b) => a + b.pop, 0), catchmentBudgetDaily: world.market ? catchment.reduce((a, b) => a + b.pop * incomeOf(world, b) * V.market.wallet[b.key], 0) : null, ping: lot.ping, monthlyRent: lot.rent, rentPerPing: lot.rentPerPing, deposit: lot.deposit, openCost: lotOpenCost(lot), pop500: Math.round(pop500), nearbyShops: nearby, vacant: !lot.shopId, shopId: lot.shopId };
}
export function getShops(world, owner) {
  return world.shops.filter((s) => (!owner || s.owner === owner) && s.status !== 'closed').map((s) => shopSummary(world, s));
}
function shopSummary(world, s) {
  const co = world.companies[s.company];
  return { id: s.id, lotId: s.lotId, businessId: s.businessId, assetLevel: s.assetLevel || 0, assetInvestment: s.assetInvestment || 0, leasedPing: s.leasedPing, operations: { ...s.operations }, strategy: structuredClone(strategyOf(s)), strategyEffects: strategyEffects(s), manager: { ...managerOf(s) }, inventory: s.inv, stock: { ...s.stock }, name: s.name, owner: s.owner, company: s.company, status: s.status, openAtT: s.openAtT, prices: { ...s.prices }, markupPct: s.markupPct, delivery: s.delivery, staff: [...s.staff], ownerWorks: !!s.ownerWorks, wageLevel: s.wageLevel, grade: s.grade, quality: s.quality, star: Math.round(starOf(s) * 10) / 10, reviews: s.revCnt, awareness: co.awareness, promo: s.promo.kind, shortage: s.shortage.daysLeft > 0, rent: s.rent, deposit: s.deposit };
}
export function getShopToday(world, shopId) {
  const s = shopBy(world, shopId);
  if (!s) return null;
  const td = s.today;
  return { shopId, prepared: td.prepared, unsold: td.unsold, waste: td.waste, stockLost: td.stockLost, hourly: td.hourly.map((x, i) => ({ hour: OPEN_H + i, walk: x[0], delivery: x[1] })), cups: td.walk + td.del, walk: td.walk, delivery: td.del, queue: s.Bw + s.Bd, waitMin: Math.round(s.waitMin * 10) / 10, lost: td.lost, revenue: td.rev };
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
  return { shopId, businessId: s.businessId, name: s.name, company: s.company, status: s.status, prices: { ...s.prices }, star: Math.round(starOf(s) * 10) / 10, reviews: s.revCnt, estDailyCups: s.status === 'open' && recent.length ? Math.round(trueAvg * (1 + noise)) : null, delivery: s.delivery, promoPct: s.promo.daysLeft > 0 ? Math.round(s.promo.num / s.promo.den * 100) : null, promoDays: s.promo.daysLeft, renovationDays: s.status === 'renovating' ? Math.max(0, Math.ceil((s.openAtT - world.t) / 24)) : 0 };
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
const PNL_SUM = ['industryCost', 'strategyCost', 'managerCost', 'turnover', 'storeRev', 'gmv', 'commission', 'cogs', 'pack', 'waste', 'wage', 'rent', 'util', 'maintenance', 'pos', 'cardFee', 'bizTax', 'profit', 'cups', 'walk', 'del', 'lost'];
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

/** 月報沿用已結帳的門店歷史；同月關店的最後帳仍保留在原店。 */
export function getMonthlyReport(world, shopId = null) {
  const co = playerCo(world), di = world.status === 'playing' ? world.day || dateOf(Math.floor(world.t / 24)) : dateOf(Math.floor(world.t / 24)), ym = ymOf(di);
  const rows = co.rows.slice(-48);
  const shops = world.shops.filter((s) => s.owner === 'player').map((s) => {
    const month = (key, current = false) => {
      const parts = s.history.filter((h) => h.ym === key);
      if (current && s.status !== 'closed') parts.push({ ...computePnL(world, s, di.dim), tradingDays: s.mtd.tradingDays, stockLost: s.mtd.stockLost });
      const pnl = Object.fromEntries(PNL_SUM.map((k) => [k, parts.reduce((a, h) => a + (h[k] || 0), 0)]));
      const tradingDays = parts.reduce((a, h) => a + (h.tradingDays || 0), 0);
      return { ym: key, ...pnl, totalCost: pnl.turnover - pnl.profit, netProfit: pnl.profit, netMargin: pnl.turnover ? pnl.profit / pnl.turnover : null, tradingDays, daily: tradingDays ? pnl.cups / tradingDays : null, stockLost: parts.reduce((a, h) => a + (h.stockLost || 0), 0), partial: parts.some((h) => h.partial), active: parts.length > 0 };
    };
    return { id: s.id, name: s.name, lotId: s.lotId, status: s.status, businessId: s.businessId, unit: businessOf(s.businessId).unit, ownerWorks: !!s.ownerWorks, current: month(ym, true), financials: rows.map((r) => month(r.ym)) };
  });
  const shop = shopId == null ? null : shops.find((s) => s.id === shopId);
  if (shopId != null && !shop) return null;
  return { shopId, name: shop ? shop.name : co.name, unit: shop ? shop.unit : '成交單位', shops, analysis: shop ? [shop] : shops, current: shop ? shop.current : companyPnL(world, co, null, di), financials: shop ? shop.financials : rows.map((r) => companyPnL(world, co, r, di)) };
}

/** 門店診斷：按實際通路組合與每杯貢獻估算，不改變模擬狀態。 */
export function getShopAnalysis(world, shopId) {
  const s = shopBy(world, shopId);
  if (!s || s.owner !== 'player' || s.status === 'closed') return null;
  const di = world.day || dateOf(world.t / 24);
  const current = s.mtd.tradingDays >= 7 || !s.history.some((h) => h.cups > 0);
  const h = current ? { ...computePnL(world, s, di.dim), prepared: s.mtd.prepared, unsold: s.mtd.unsold, stockLost: s.mtd.stockLost, tradingDays: s.mtd.tradingDays, avgWait: s.mtd.waitCups ? s.mtd.waitSum / s.mtd.waitCups : 0, ym: ymOf(di) } : s.history.slice().reverse().find((h) => h.cups > 0);
  const biz = businessOf(s.businessId);
  const contribution = h.cups ? (h.turnover - h.commission - h.cogs - h.pack - h.waste - biz.utilityUnit * h.cups - h.cardFee - h.bizTax) / h.cups : null;
  const monthlyWage = Math.round(s.staff.reduce((a, _, i) => a + hiredStaff(s, i) * (SHIFTS[i][1] - SHIFTS[i][0]), 0) * world.wages[s.wageLevel] * biz.wageMult * EMPLOYER_MILLI / 1000 * di.dim);
  const strategyMonthly = strategyEffects(s).monthly, managerMonthly = MANAGERS[managerOf(s).tier].monthly;
  const fixedMonthly = s.rent + monthlyWage + biz.utility + assetMonthly(s) + V.fixedCost.posMonthly + strategyMonthly + managerMonthly + industryEffects(s).monthly;
  const breakEvenDaily = contribution > 0 ? Math.ceil(fixedMonthly / contribution / di.dim) : null;
  const co = playerCo(world), shopCount = liveShops(world).filter((x) => x.owner === 'player').length;
  const brandMonthly = Math.max(co.adWan * 10000, Math.floor(co.adDayUnits * 10000 / di.dim)) + (co.cm.extraExpense || 0) + (co.cm.researchExpense || 0) + (co.cm.stockWriteOff || 0) + facilityMonthly(co.expansion) + Math.max(0, shopCount - 1) * EXP.chain.managementPerShop + co.loans.reduce((a, l) => a + Math.round(l.balance * V.loan.rate / 12), 0);
  const brandAllocation = Math.round(brandMonthly / shopCount);
  const breakEvenWithBrandDaily = contribution > 0 ? Math.ceil((fixedMonthly + brandAllocation) / contribution / di.dim) : null;
  const capacityDaily = dailyCapacity(world, s);
  const dailyCups = h.tradingDays ? h.cups / h.tradingDays : 0;
  const lostRate = h.cups + h.lost ? h.lost / (h.cups + h.lost) : 0;
  return { shopId, businessId: s.businessId, unit: biz.unit, operations: { ...s.operations }, inventory: s.inv, prepared: h.prepared || 0, unsold: h.unsold || 0, stockLost: h.stockLost || 0, name: s.name, status: s.status, ownerWorks: !!s.ownerWorks, ym: h.ym, current, sampleDays: h.tradingDays, pnl: h, dailyCups, contribution, fixedMonthly, monthlyWage, strategyMonthly, managerMonthly, breakEvenDaily, breakEvenWithBrandDaily, brandAllocation, capacityDaily, lostRate, avgWait: h.avgWait, ownerSaving: Math.round(NHOURS * world.wages[s.wageLevel] * biz.wageMult * EMPLOYER_MILLI / 1000 * di.dim) };
}

/** 在報表被要求時才計算；典型日只算一次，之後按天彙總收付。 */
export function getCashForecast(world) {
  if (world.status !== 'playing') return null;
  const live = liveShops(world);
  const future = live.map((s) => { const x = structuredClone(s); x.stock.day = -1; recalcShop(world, x); return x; });
  const descs = future.map((s) => descOfShop(world, s)), typical = estimateDay(world, descs);
  const plans = live.flatMap((s, i) => {
    if (s.owner !== 'player') return [];
    const recent = s.days.slice(-14), samples = recent.length, d = descs[i], biz = businessOf(s.businessId);
    const weight = samples >= 7 ? 0.75 : 0;
    const walk = avg(recent.map((x) => x.walk)) * weight + typical.walk[i] * (1 - weight);
    const del = avg(recent.map((x) => x.del)) * weight + typical.del[i] * (1 - weight);
    return [{ shop: s, samples, walk, del, unit: d.unitIngr, price: future[i].avgPrice, plat: future[i].avgPlat, capacity: dailyCapacity(world, future[i]), dailyWage: d.hiredHours * d.wageH * EMPLOYER_MILLI / 1000, wasteRate: Math.max(0, biz.waste - (biz.warehouse ? effects(playerCo(world).expansion).waste : 0)), renewal: getLeaseInfo(world, s.id, { includeAnalysis: false })?.one || null }];
  });
  const args = { world, plans, dateOf, computePnL, newMTD, monthlyFixed, V, EXP, endDay: END_DAY };
  return { base: projectCash(args), stress: projectCash(args, true), sampleDays: plans.map((p) => ({ shopId: p.shop.id, name: p.shop.name, days: p.samples })), assumptions: [
    '從目前現金起算六個月份，首月只列剩餘收付；未繳的本月薪資、店租和稅仍會在月結支付。',
    '有 7 天以上資料的店，以近 14 天成交占 75%、目前設定的典型日占 25%；新店使用典型日與開幕爬坡。茶飲另計季節。',
    '維持目前售價、班表、商品組合、廣告及補貨政策；含既有裝修、已付庫存、中央庫存與在途訂單、設施啟用、貸款攤還、年結稅與工資調漲。店長未來調整與尚未完成的研發效益未納入。',
    '已選續租或退租照方案投影；尚未選擇的租約假設按目前報價續一年、到期補退押金。未簽報價之後仍可能變動。',
    '專屬能力、施工及情境修復依目前狀態固定估算；包含目前制度月費和風險費，未納入完成改善的效益或之後的能力演變。',
    '壓力情境為成交需求減少 20%、新採購成本增加 10%。不預知未來競爭、事件或新的展店，也不假設自動借款救援。',
    '本版仍以成本金額彙總庫存，未模擬每個 SKU 或會員續約；預測為近似收付，結案前最多投影到遊戲期限。',
  ] };
}

/** 可驗證的經營取捨，用現有帳目說明而非給保證獲利的配方。 */
export function getLearningReview(world, shopId) {
  const a = getShopAnalysis(world, shopId); if (!a) return null;
  const s = shopBy(world, shopId), fx = strategyEffects(s), co = playerCo(world);
  const unitReceipt = a.pnl.cups ? (a.pnl.turnover - a.pnl.commission) / a.pnl.cups : null;
  const afterCut = a.contribution == null ? null : a.contribution - unitReceipt * 0.05;
  const priceCutExtra = afterCut > 0 ? Math.max(0, a.contribution / afterCut - 1) : null;
  const ownerCost = s.ownerWorks ? a.ownerSaving : 0;
  const shops = liveShops(world).filter((x) => x.owner === 'player');
  const spareCash = co.cash - shops.reduce((total, x) => total + monthlyFixed(world, x), 0) - Math.max(0, shops.filter((x) => x.status === 'open').length - 1) * EXP.chain.managementPerShop - co.adWan * 10000 - facilityMonthly(co.expansion) - co.loans.reduce((total, l) => total + l.payment, 0);
  return { shopId, name: s.name, profile: PROFILES[strategyOf(s).profile].name, profileEffects: fx, sampleDays: a.sampleDays, contribution: a.contribution, priceCutExtra, ownerCost, economicBreakEven: a.contribution > 0 ? Math.ceil((a.fixedMonthly + a.brandAllocation + ownerCost) / a.contribution / (world.day || dateOf(0)).dim) : null, spareCash, lessons: [
    { skill: '定位與客群', fact: `${PROFILES[strategyOf(s).profile].name}影響來源客群、價格敏感度與服務速度；目前定位及主推商品每月費用 ${fx.monthly.toLocaleString()} 元。`, action: '比較店面周邊的學校、通勤、住宅與商圈客源，再選擇定位。高品質也要有願意付費的客人。' },
    { skill: '單筆貢獻與定價', fact: a.contribution == null ? '尚無成交資料，還不能用實際毛利判斷降價。' : `每筆貢獻約 ${a.contribution.toFixed(1)} 元；若各通路售價都降 5%，${afterCut > 0 ? `成交至少須增加 ${(priceCutExtra * 100).toFixed(1)}% 才能維持原貢獻總額` : '每筆貢獻將不再為正'}。`, action: '先調一項設定，觀察至少 7 個營業日；把成交、貢獻與淨利一起比較。這裡的降價計算固定商品及通路組合，未預測會增加多少客人。' },
    { skill: freshBusiness(s.businessId) ? '備料與報廢' : retailBusiness(s.businessId) ? '庫存與週轉' : '排班與產能', fact: freshBusiness(s.businessId) ? `分析期備貨 ${a.prepared}、未售 ${a.unsold}；未售出的備料也是成本。` : retailBusiness(s.businessId) ? `庫存占用現金 ${s.inv.toLocaleString()} 元，分析期缺貨流失 ${a.stockLost} 筆。` : `每日上限 ${Math.round(a.capacityDaily)} 筆，實際日均 ${Math.round(a.dailyCups)} 筆；流失 ${(a.lostRate * 100).toFixed(1)}%。`, action: '分清楚客源不足、排隊和缺貨。增加供給只有在需求被阻擋時才可能有效，否則會增加薪資、庫存或報廢。' },
    { skill: '管理與機會成本', fact: `委任每月 ${a.managerMonthly.toLocaleString()} 元，計入損平；${ownerCost ? `老闆每天顧店 12 小時，報表省下約 ${ownerCost.toLocaleString()} 元月薪資` : '目前班表均按支薪員工計算'}。${managerOf(s).tier !== 'none' ? `店長紀錄：${managerOf(s).note}` : ''}`, action: ownerCost ? '另看含老闆工時價值的損平點，確認生意能否支付替代人力。店長負責檢視與決策，不增加櫃檯人手。' : '衡量管理費能否換來更好的排班和備貨；只委任你需要的項目，並檢查店長決策紀錄。' },
    { skill: '現金與擴張', fact: `扣除全品牌一個月固定支出與貸款期款後，現金餘額約 ${Math.round(spareCash).toLocaleString()} 元。此數還未扣下一批進貨及未付月結變動費。`, action: '展店前同時看正常與壓力現金預測，再評估裝修期、押金和互搶客源；營收成長不等於有足夠現金。' },
  ] };
}

/** 12 個月報表：通路、公司損益、市占率、商品與門店診斷。 */
export function getReport(world, { includeMarket = true } = {}) {
  const co = playerCo(world);
  const di = world.status === 'playing' ? world.day || dateOf(Math.floor(world.t / 24)) : dateOf(Math.floor(world.t / 24));
  const rows = co.rows.slice(-12);
  const months = rows.map((r) => ({ ym: r.ym, storeRevenue: r.store, deliveryRevenue: r.gmv, deliveryNet: r.gmv - r.commission, cups: r.cups, walkCups: r.walk, deliveryCups: r.del }));
  const share = { months: [], player: [], daji: [], qingyou: [], other: [] };
  for (const m of world.monthly.slice(-12)) {
    share.months.push(m.ym);
    const values = world.multiBusiness ? m.revenue || Object.fromEntries(Object.values(world.companies).map((co) => { const r = co.rows.find((r) => r.ym === m.ym); return [co.id, r ? r.store + r.gmv : 0]; })) : m.cups;
    const t = Object.values(values).reduce((a, v) => a + v, 0) || 1;
    const pl = (values.player || 0) / t, dj = (values.daji || 0) / t, qy = (values.qingyou || 0) / t;
    share.player.push(pl); share.daji.push(dj); share.qingyou.push(qy); share.other.push(1 - pl - dj - qy);
  }
  const items = {};
  for (const r of rows) for (const [k, it] of Object.entries(r.items)) { const x = items[k] || (items[k] = { cups: 0, rev: 0, cost: 0, wasteMilli: 0 }); x.cups += it.cups; x.rev += it.rev; x.cost += it.cost; x.wasteMilli += it.wasteMilli == null ? it.cost * Math.round(V.menu.wasteRate * 1000) : it.wasteMilli; }
  const catalogue = Object.entries(BUSINESSES).flatMap(([businessId, b]) => Object.keys(b.items).map((name) => ({ name, businessId, unit: b.unit, packaging: b.packaging })));
  const products = catalogue.filter((p) => items[p.name] || world.shops.some((s) => s.company === PLAYER && s.businessId === p.businessId)).map((p) => { const x = items[p.name] || { cups: 0, rev: 0, cost: 0, wasteMilli: 0 }; const directCost = x.cost + x.cups * p.packaging + roundDiv(x.wasteMilli, 1000); return { ...p, cups: x.cups, revenue: x.rev, directCost, grossProfit: x.rev - directCost, avgPrice: x.cups ? x.rev / x.cups : 0, grossMargin: x.rev ? (x.rev - directCost) / x.rev : 0 }; });

  return { months, share, products, financials: rows.map((r) => companyPnL(world, co, r, di)), current: companyPnL(world, co, null, di), analysis: liveShops(world).filter((s) => s.owner === 'player').map((s) => getShopAnalysis(world, s.id)), facilities: getFacilities(world), market: includeMarket ? getMarketAnalysis(world) : null };
}

// ───────────────────────── 存檔 ─────────────────────────
export function serialize(world) { return JSON.stringify(world); }
/** 補上新區域；原店面、租金、客源熟悉度與帳目保持原值。 */
export function expandMap(world, mapData, distances) {
  if (world.status !== 'playing') return false;
  const upgrade = mapData.marketVersion === MARKET_VERSION && world.market?.version !== MARKET_VERSION;
  if (!upgrade && !mapData.lots.some((l) => !world.lots.some((x) => x.id === l.id))) return false;
  const fresh = createWorld({ mapData, distances, seed: world.seed, noRivals: true });
  const oldNb = world.bld.length;
  world.bld.push(...fresh.bld.filter((b) => !world.bld.some((x) => x.id === b.id)));
  world.lots.push(...fresh.lots.filter((l) => !world.lots.some((x) => x.id === l.id)));
  if (mapData.marketVersion === MARKET_VERSION) {
    const byId = new Map(mapData.buildings.map((b) => [b.id, b]));
    for (const b of world.bld) b.floors = byId.get(b.id)?.floors || b.floors || 1;
    configureMarket(world, world.market?.startT ?? world.t, (mapData.bounds.maxX - mapData.bounds.minX) * (mapData.bounds.maxZ - mapData.bounds.minZ) * V.people.metersPerTile ** 2 / 1e6);
  }
  const nl = world.lots.length, mpt = V.people.metersPerTile;
  world.dM = world.bld.flatMap((b) => world.lots.map((l) => distances[b.id]?.[l.id] == null ? 1e9 : Math.round(distances[b.id][l.id] * mpt * 10) / 10));
  world.ll = world.lots.flatMap((la, i) => { const bi = world.bld.findIndex((b) => b.id === la.building); return world.lots.map((_, j) => i === j ? 0 : bi >= 0 ? world.dM[bi * nl + j] : 1e9); });
  for (const s of world.shops) { s.F.push(...new Array(world.bld.length - oldNb).fill(0)); s.buyB.push(...new Array(world.bld.length - oldNb).fill(0)); s.Fbar = avg(s.F); }
  world.popAll = world.bld.reduce((a, b) => a + b.pop, 0); DERIVED.delete(world);
  enablePressure(world);
  logEvt(world, 'info', world.market ? '六個生活圈開放；新版區域客源、所得、共同消費預算與成長開始生效。原店租金、現金、貸款與歷史帳目保留。' : '東城與南城開放，新增區域、店面與客源；原店帳目保留。');
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
  for (const co of Object.values(w.companies)) co.revenue30 ||= [0];
  for (const s of w.shops) {
    s.businessId ||= 'tea'; s.assetLevel ||= 0; s.assetInvestment ||= 0; s.leasedPing ||= premises(w.lots.find((l) => l.id === s.lotId), s.businessId).ping; s.operations ||= initialOperations(s.businessId, s.leasedPing); s.stock ||= { day: -1, qty: 0, value: 0, prepared: 0 };
    if (w.status === 'playing' && freshBusiness(s.businessId) && s.stock.day === Math.floor(w.t / 24) && !s.stock.mix) { s.stock.mix = [...s.mix]; s.stock.weights = { ...strategyOf(s).weights }; s.stock.grade = s.grade; }
    for (const k of ['prepaidWaste', 'prepared', 'unsold', 'stockLost']) s.mtd[k] ??= 0;
    s.mtd.wasteMilli ??= s.mtd.cogs * Math.round(V.menu.wasteRate * 1000);
    for (const k of ['prepared', 'unsold', 'waste', 'stockLost']) s.today[k] ??= 0;
  }
  enablePressure(w);
  return w;
}

// 給測試用
export const _internals = { queueWait, updateFamiliarity, computePnL, settleShop, settleMonth, derived, starOf, chainStarOf, recalcShop, closeShopInternal, dateOf, daysFromCivil, brandEstimate, ITEMS, END_DAY, yearEnd, startDay, rivalMonthly, leaseDay, updateAskingRents };
