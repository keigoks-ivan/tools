// 天青航空：航線經營 — economic model. Pure, deterministic given a seed, no DOM, no dependencies.
// Money: US$ (constant dollars). rask/cask: US$ per available seat-km. All state is plain JSON.
import { FACILITIES, fuelOrder } from './v2.mjs?v=23';
import { CONST, MODES, HUBS, CITIES, AIRCRAFT, EVENTS, LESSONS, RIVALS, HUB_WEATHER } from './data.mjs?v=22';
import { marketProfile } from './demand.mjs?v=22';
import { readCareer, missionOffers, settleCareer } from './career.mjs?v=24.1';
export { marketProfile, DEMAND_SOURCES } from './demand.mjs?v=22';

// ============================================================ utilities
const clone = o => JSON.parse(JSON.stringify(o));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
function hashStr(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function rngFor(seed, ...tags) {
  let a = hashStr(String(seed) + '|' + tags.join('|'));
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const KEYS = ['fuel', 'labour', 'maintenance', 'airport', 'ownership', 'distribution', 'overhead', 'interest'];
const zeroCosts = () => Object.fromEntries(KEYS.map(k => [k, 0]));
const sumCosts = c => KEYS.reduce((a, k) => a + c[k], 0);
const pct = x => Math.round(x * 100);
const err = (code, zh, en) => ({ code, zh, en });

export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x)) * CONST.routeFactor;
}
const distCache = new Map();
function dist(a, b) { const k = a.id + b.id; let v = distCache.get(k); if (v === undefined) { v = distanceKm(a, b); distCache.set(k, v); } return v; }

// reference fare (US$ one-way economy, full-service average) vs distance. Calibrated to fares seen in 2025-26 (see sources.mjs).
export function refFareMid(d) { return CONST.fareScale * (30 + 0.14 * Math.pow(d, 0.9)); }
function lccFactor(d) { const t = clamp((d - 2000) / 5000, 0, 1); return CONST.lcc.fareFactorShort + (CONST.lcc.fareFactorLong - CONST.lcc.fareFactorShort) * t; }
// full-service long-haul fares include premium-cabin seats (design: up to +25% at 8,000 km and beyond); low-cost long-haul is one cabin
const cabinMix = d => 1 + CONST.premiumUplift * clamp((d - 2000) / 6000, 0, 1);
// fares track local income and cost levels: dearer in Zurich/London/Tokyo, cheaper in Bangkok/Manila (design, via the airport fee level)
const plOf = (s, a, b) => (0.78 + 0.22 * (a.feeLevel + b.feeLevel) / 2) * (CONST.hubYield[s.hub]?.[s.mode] ?? 1);
const priceLevel = (d, model) => (model === 'lcc' ? lccFactor(d) : 1);
const fareLevel = (d, model) => (model === 'lcc' ? lccFactor(d) : cabinMix(d));
const seatsOf = (ac, model) => ac.seats[model === 'lcc' ? 'lcc' : 'fsc'];
const maxHours = (ac, model) => ac.maxHoursPerDay + (model === 'lcc' ? (ac.widebody ? 0.5 : CONST.lcc.extraHours) : 0);
export function blockHoursFor(ac, d) { return CONST.taxiClimbHours + d / ac.speedKmh; }
function ancillaryPerPax(d, model) { const a = CONST.ancillary[model === 'lcc' ? 'lcc' : 'fsc']; return a.base + a.pct * refFareMid(d) * (model === 'lcc' ? 1 : 1); }
const modeOf = s => MODES[s.mode];

// ============================================================ market
function pairBase(a, b) {
  return marketProfile(a, b, dist(a, b)).weeklyPax;
}
function backgroundSeats(s, ctx, city) {
  const h = CITIES[s.hub], c = CITIES[city];
  const baseline = marketProfile(h, c, dist(h, c)).weeklySeats * (CONST.hubDemand[s.hub] ?? 1) * ctx.m.demandScale;
  return Math.max(baseline * 0.2, baseline - (s.marketRivalBase?.[city] || 0)) * (s.marketSupply?.[city] ?? ctx.growth);
}
// Incumbents react after settlement. Historical traffic/capacity remains immutable.
function updateMarketSupply(s, ctx) {
  s.marketSupply ||= {};
  for (const city of new Set([...Object.keys(s.marketSupply), ...s.routes.map(r => r.city)])) {
    const h = CITIES[s.hub], c = CITIES[city], p = marketProfile(h, c, dist(h, c));
    const r = s.routes.find(r => r.city === city);
    const own = r ? 2 * r.weekly * seatsOf(AIRCRAFT[r.type], s.model) : 0;
    const allSeats = p.weeklySeats * (CONST.hubDemand[s.hub] ?? 1) * ctx.m.demandScale;
    const base = Math.max(allSeats * 0.2, allSeats - (s.marketRivalBase?.[city] || 0));
    const previous = s.marketSupply[city] ?? ctx.growth;
    const target = clamp(ctx.growth * ctx.demandAll - 0.5 * own / base, 0.4, 2.5);
    const response = 1 - Math.pow(0.85, ctx.mpt);
    s.marketSupply[city] = clamp(previous + clamp((target - previous) * response, -0.04 * ctx.mpt, 0.04 * ctx.mpt), 0.4, 2.5);
  }
}
const bizShare = (a, b) => clamp(0.10 + 0.38 * Math.sqrt(a.business * b.business), 0.1, 0.5);
const longhaulMult = d => 1 - 0.2 * clamp((d - 1500) / 2500, 0, 1);
function monthsOfTurn(s) {
  const m = modeOf(s);
  if (m.id === 'year') return [s.turn % 12];
  return s.turn % 2 === 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
}
function seasonOf(city, months) { return months.reduce((a, m) => a + city.season[m], 0) / months.length; }
function pairSeason(a, b, months) { return Math.sqrt(seasonOf(a, months) * seasonOf(b, months)); }

function modsFactor(s, kind, seg, t) {
  let f = 1;
  for (const m of s.mods) {
    if (m.kind !== kind) continue;
    if (seg && m.seg !== seg) continue;
    const i = t - m.start;
    if (i >= 0 && i < m.seq.length) f *= m.seq[i];
  }
  return f;
}

function buildCtx(s, { noise = true } = {}) {
  const m = modeOf(s), t = s.turn;
  const months = monthsOfTurn(s);
  const W = m.weeksPerTurn, mpt = m.monthsPerTurn;
  const baselineFuel = 1 + (noise ? (rngFor(s.seed, 'fuel', t)() - 0.5) * 0.06 : 0);
  const spot = baselineFuel * modsFactor(s, 'fuel', null, t);
  const h = s.hedge;
  let eff = (1 - h.frac) * spot + h.frac * h.lock * (1 + CONST.hedge.premium);
  const dis = s.mods.find(x => x.kind === 'disruption' && x.start === t);
  const leaseNew = s.mods.find(x => x.kind === 'leaseNew' && t >= x.start && t < x.start + x.turns);
  const kgTurn = s.routes.reduce((a, r) => a + 2 * r.weekly * W * (1 - (dis?.cancelPct || 0)) * blockHoursFor(AIRCRAFT[r.type], dist(CITIES[s.hub], CITIES[r.city])) * AIRCRAFT[r.type].fuelPerBlockHour, 0);
  const reserveFrac = s.reserve?.kg > 0 && kgTurn > 0 ? Math.min(0.3 * (1 - h.frac), s.reserve.kg / kgTurn) : 0;
  eff += reserveFrac * ((s.reserve?.unitPrice || 0) / CONST.fuelPriceUsdPerKg - spot);
  return {
    m, t, months, W, mpt, spot, eff, hedgeFrac: h.frac, reserveUsedKg: reserveFrac * kgTurn,
    growth: Math.pow(1 + m.growthPerYear, t * mpt / 12),
    demandAll: modsFactor(s, 'demand', 'all', t), demandBiz: modsFactor(s, 'demand', 'biz', t), demandLei: modsFactor(s, 'demand', 'lei', t),
    cancel: dis ? dis.cancelPct : 0, compPerPax: dis ? dis.compPerPax : 0,
    assetNow: modsFactor(s, 'asset', null, t),
    leaseNewMult: leaseNew ? leaseNew.mult : 1,
    noise
  };
}

// score of a carrier in a segment
function carrierScore(f, seats, fareRatio, quality, seg, e) {
  if (f <= 0) return 0;
  const frequency = Math.pow(clamp(f / 7, 0.15, 4), CONST.freqExp[seg] - 1);
  return f * seats / CONST.seatsRef * frequency * quality * Math.pow(fareRatio, -CONST.shareElasticityMult * e);
}
function rivalsAt(s, cityId) {
  const out = [];
  for (const r of s.rivals) { const x = r.routes[cityId]; if (x && x.weekly > 0) out.push({ id: r.id, kind: r.kind, weekly: x.weekly, fare: x.fare }); }
  return out;
}

// local (point-to-point) demand and passengers for one route
function evalLocal(s, ctx, r, { ramp = true, noRivals = false } = {}) {
  const h = CITIES[s.hub], c = CITIES[r.city], ac = AIRCRAFT[r.type];
  const d = dist(h, c), seats = seatsOf(ac, s.model);
  const technicalCancel = ctx.readiness?.[r.type]?.cancel || 0;
  const weeklyEff = r.weekly * (1 - ctx.cancel) * (1 - technicalCancel);
  const nz = ctx.noise ? 1 + (rngFor(s.seed, 'mk', ctx.t, r.city)() - 0.5) * 0.08 : 1;
  const sea = pairSeason(h, c, ctx.months);
  const profile = marketProfile(h, c, d);
  const scale = (CONST.hubDemand[s.hub] ?? 1) * ctx.m.demandScale * ctx.growth;
  const legMarket = profile.weeklyPax * scale * sea * ctx.demandAll * nz;
  // Flight-leg counts include connections. Reserve a design share for the separate transfer model.
  const M = legMarket * (1 - CONST.connectionReserve);
  const b = bizShare(h, c), lh = longhaulMult(d);
  const fareRatio = priceLevel(d, s.model) * CONST.fareTier[r.fare];
  const q = s.model === 'lcc' ? CONST.lcc.quality : CONST.fsc.quality;
  const rv = noRivals ? [] : rivalsAt(s, r.city);
  // Existing seats are annual-average capacity; demand shocks do not immediately remove schedules.
  const Fbg = backgroundSeats(s, ctx, r.city) * (1 - CONST.connectionReserve) / (2 * CONST.seatsRef);
  const out = { M, d, seats, sea, b, fareRatio, rivals: rv, transferReserve: legMarket * CONST.connectionReserve };
  const demandSeg = {};
  for (const seg of ['biz', 'lei']) {
    const e = CONST.elasticity[seg] * lh;
    const Mseg = M * (seg === 'biz' ? b * Math.pow(sea, 0.3 - 1) * ctx.demandBiz : (1 - b) * ctx.demandLei);
    const appeal = seg === 'biz' && s.model === 'fsc' && s.facilities?.lounge ? 1.08 : 1;
    const you = carrierScore(weeklyEff, seats, fareRatio, q[seg] * appeal, seg, e);
    let others = Fbg;
    for (const x of rv) others += carrierScore(x.weekly, x.kind === 'lcc' ? 186 : 168, x.fare, x.kind === 'lcc' ? CONST.lcc.quality[seg] : 1, seg, e);
    const share = you / (you + others);
    // share you would have without the named rivals (for the "rival took x%" explanation)
    let shareNo = you / (you + Fbg);
    demandSeg[seg] = { M: Mseg, share, shareNo };
  }
  const rampF = ramp ? CONST.ramp[s.mode][Math.min(r.age || 0, CONST.ramp[s.mode].length - 1)] : 1;
  const wantB = demandSeg.biz.M * demandSeg.biz.share * rampF;
  const wantL = demandSeg.lei.M * demandSeg.lei.share * rampF;
  const wantBno = demandSeg.biz.M * demandSeg.biz.shareNo * rampF, wantLno = demandSeg.lei.M * demandSeg.lei.shareNo * rampF;
  const seatsWeek = 2 * weeklyEff * seats;
  // soft capacity limit: demand is uneven across flights, so a route cannot fill every seat even when average demand exceeds capacity
  const wantT = wantB + wantL, soft = wantT > 0 ? wantT / Math.pow(1 + Math.pow(wantT / Math.max(1, seatsWeek), CONST.spillP), 1 / CONST.spillP) : 0;
  const scaleSoft = wantT > 0 ? soft / wantT : 0;
  const paxB = wantB * scaleSoft, paxL = wantL * scaleSoft;
  out.rampF = rampF; out.seatsWeek = seatsWeek; out.weeklyEff = weeklyEff; out.technicalCancel = technicalCancel;
  out.paxB = paxB; out.paxL = paxL; out.want = wantB + wantL; out.wantNoRival = wantBno + wantLno;
  return out;
}

// transfer demand between two spoke routes via the hub
function transferPairs(s, ctx, routes, locals) {
  const h = CITIES[s.hub], res = [];
  const K = ctx.m.transferK * (s.model === 'lcc' ? CONST.lcc.transferMult : 1);
  for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
    const ci = CITIES[routes[i].city], cj = CITIES[routes[j].city];
    const di = locals[i].d, dj = locals[j].d, dij = dist(ci, cj);
    const delta = (di + dj) / Math.max(dij, 300);
    if (delta > CONST.transferDetourMax) continue;
    const conn = clamp((CONST.transferDetourMax - delta) / 0.8, 0, 1);
    const fq = Math.min(1, Math.sqrt(routes[i].weekly * routes[j].weekly) / 12);
    const tier = Math.sqrt(CONST.fareTier[routes[i].fare] * CONST.fareTier[routes[j].fare]);
    const months = ctx.months;
    const M = pairBase(ci, cj) * ctx.m.demandScale * pairSeason(ci, cj, months) * ctx.growth * ctx.demandAll;
    const ramp = Math.min(locals[i].rampF, locals[j].rampF);
    const T = M * K * conn * fq * Math.pow(tier, -1.6) * ramp;
    if (T > 0.01) res.push({ i, j, T, dij, di, dj });
  }
  return res;
}

// ============================================================ fleet maths
// Compressed management rules, not maintenance instructions or real delivery forecasts.
export const MAINTENANCE = {
  balanced: { zh:'正常保養', en:'Regular care', hours:1, cost:1, repair:8 },
  push: { zh:'密集運轉', en:'Intensive flying', hours:1.08, cost:.85, repair:4 },
  care: { zh:'加強保養', en:'Extra care', hours:.88, cost:1.3, repair:14 }
};
const careOf = (s,type) => MAINTENANCE[s.maintenance?.[type]] || MAINTENANCE.balanced;
const weeklyHours = (s,type) => 7 * maxHours(AIRCRAFT[type],s.model) * careOf(s,type).hours;
export function fleetReadiness(s, routes = s.routes, counts = {}) {
  const hours = fleetHours(s,routes);
  return Object.fromEntries([...new Set([...s.fleet.map(a=>a.type),...Object.keys(counts)])].map(type=>{
    const count=counts[type]??fleetCount(s,type), care=careOf(s,type), condition=s.fleetCondition?.[type] ?? 100;
    const utilisation=(hours[type]||0)/(count*7*maxHours(AIRCRAFT[type],s.model));
    const delta=(care.repair+(s.facilities?.depot?2:0)-10*utilisation)*(s.mode==='decade'?2:1);
    const nextCondition=clamp(condition+delta,50,100);
    const cancel=clamp(Math.max(0,90-condition)*.004+Math.max(0,utilisation-.92)*.12,0,.2);
    return [type,{condition,nextCondition,utilisation,cancel,policy:s.maintenance?.[type]||'balanced',maintenanceMult:care.cost}];
  }));
}
function fleetHours(state, routes) {
  const h = CITIES[state.hub];
  const hours = {};
  for (const r of routes || []) {
    const ac = AIRCRAFT[r.type], c = CITIES[r.city];
    if (!ac || !c || !(r.weekly > 0)) continue;
    const bh = 2 * r.weekly * blockHoursFor(ac, dist(h, c));
    hours[r.type] = (hours[r.type] || 0) + bh;
  }
  return hours;
}
export function fleetNeeded(state, routes) {
  const hours = fleetHours(state, routes), need = {};
  for (const t of Object.keys(hours)) need[t] = Math.ceil(hours[t] / weeklyHours(state,t) - 1e-9);
  return need;
}
export function fleetAvailability(state, routes = state.routes) {
  const hours = fleetHours(state, routes), need = fleetNeeded(state, routes);
  return Object.fromEntries([...new Set([...modeOf(state).types, ...state.fleet.map(a=>a.type)])].map(type=>{
    const delivered = state.fleet.filter(a=>a.type===type).length, hoursPerAircraft = weeklyHours(state,type);
    const totalHours = delivered*hoursPerAircraft, usedHours = hours[type]||0;
    return [type, { delivered, scheduled:Math.min(delivered,need[type]||0), unassigned:Math.max(0,delivered-(need[type]||0)),
      hoursPerAircraft, totalHours, usedHours, remainingHours:Math.max(0,totalHours-usedHours),
      missing:Math.max(0,(need[type]||0)-delivered), pending:(state.fleetOrders||[]).filter(o=>o.type===type).length }];
  }));
}
const fleetCount = (s, type) => s.fleet.filter(a => a.type === type).length;
const rateNow = s => s.rate;

// A roster represents all pilots/cabin staff needed for a rotating schedule, not one flight crew.
// Qualifications, training and fixed payroll are modelled; roster sizes/times are compressed game rules.
export const CREW_FIXED_SHARE = .35;
export function crewQuote(s,type) {
  const ac=AIRCRAFT[type];if(!ac)return null;
  const hours=7*maxHours(ac,s.model),mult=s.model==='lcc'?1-(1-CONST.lcc.crewMult)*(ac.widebody?.5:1):1;
  const monthly=hours*52/12*ac.crewPerBlockHour*CONST.crewScale*mult*CREW_FIXED_SHARE;
  const trainingTurns=s.mode==='year'?(ac.widebody?2:1):1;
  return {type,hours,monthly,fee:monthly*.5,trainingTurns,readyTurn:s.turn+trainingTurns};
}
export function crewAvailability(s,routes=s.routes) {
  const hours=fleetHours(s,routes),legacyHours=s.crews?{}:fleetHours(s,s.routes);
  const legacy=Object.fromEntries(Object.keys(AIRCRAFT).map(t=>[t,Math.max(fleetCount(s,t),Math.ceil((legacyHours[t]||0)/crewQuote(s,t).hours-1e-9))]));
  const crews=s.crews??legacy;
  return Object.fromEntries(modeOf(s).types.map(type=>{
    const q=crewQuote(s,type),ready=crews[type]||0,usedHours=hours[type]||0,required=Math.ceil(usedHours/q.hours-1e-9);
    return [type,{ready,required,missing:Math.max(0,required-ready),pending:(s.crewOrders||[]).filter(o=>o.type===type).length,
      totalHours:ready*q.hours,usedHours,remainingHours:Math.max(0,ready*q.hours-usedHours),monthly:ready*q.monthly}];
  }));
}
function ensureManagement(s) {
  if(!s.crews){
    s.crews={};for(const a of s.fleet)s.crews[a.type]=(s.crews[a.type]||0)+1;
    const hours=fleetHours(s,s.routes);
    for(const [type,n]of Object.entries(hours))s.crews[type]=Math.max(s.crews[type]||0,Math.ceil(n/crewQuote(s,type).hours-1e-9));
    // Honour deliveries already ordered under the old rules without an unexpected staffing lock.
    s.crewOrders=(s.fleetOrders||[]).map((o,i)=>({id:i+1,type:o.type,readyTurn:o.readyTurn,fee:0}));
  }
  s.crewOrders||=[];s.nextCrewOrder??=1+Math.max(0,...s.crewOrders.map(o=>o.id));
  s.pending.staffPaid||=0;
  s.cashLedger||={opening:s.cash,aircraft:0,staff:0,fuel:0,financing:0};
}
function cashEntry(s,key,amount){s.cash+=amount;s.cashLedger[key]+=amount;}
export function leaseReturnQuote(s,a) {
  const remainingMonths=Math.max(0,(a.leaseUntilMonth||0)-s.turn*modeOf(s).monthsPerTurn);
  const fee=a.leaseUntilMonth&&remainingMonths===0?0:a.rate*Math.max(CONST.returnLeaseMonths,remainingMonths*.25);
  return {remainingMonths,fee,refund:a.deposit||0,net:(a.deposit||0)-fee};
}
export function cashCommitments(s) {
  const monthly=a=>a.kind==='lease'?a.rate:((a.loan??a.price-a.upfront)||0)*s.rate/12+Math.min(a.loan??Infinity,((a.loan0??a.price-a.upfront)||0)/144);
  const aircraft=s.fleet.reduce((n,a)=>n+monthly(a),0),orders=(s.fleetOrders||[]).reduce((n,o)=>n+monthly(o),0);
  const staff=Object.values(crewAvailability(s,[])).reduce((n,c)=>n+c.monthly*s.labourMult,0);
  const futureStaff=staff+(s.crewOrders||[]).reduce((n,o)=>n+crewQuote(s,o.type).monthly*s.labourMult,0);
  const overhead=(CONST.overhead.base+CONST.overhead.perAircraft*s.fleet.length)*(s.model==='lcc'?CONST.lcc.overheadMult:1);
  const facilities=Object.entries(s.facilities||{}).reduce((n,[id])=>n+(FACILITIES[id]?.monthly||0),0);
  const debt=s.debt.reduce((n,d)=>n+d.balance*d.rate/12,0),deferred=s.defer.after>0?s.deferred/s.defer.after/modeOf(s).monthsPerTurn:0;
  const current=aircraft+staff+overhead+facilities+debt+deferred;
  const future=current+orders+futureStaff-staff+(s.fleetOrders||[]).length*CONST.overhead.perAircraft*(s.model==='lcc'?CONST.lcc.overheadMult:1)
    +(s.facilityOrders||[]).reduce((n,o)=>n+(FACILITIES[o.id]?.monthly||0),0);
  return {aircraft,staff,current,future,months:current>0?s.cash/current:0,committedRent:s.fleet.filter(a=>a.kind==='lease').reduce((n,a)=>n+leaseReturnQuote(s,a).remainingMonths*a.rate,0)};
}

// Expansion limits and delivery times are gameplay assumptions, not airline market data.
export function fleetLimits(s) {
  const long = s.mode === 'decade', depot = !!s.facilities?.depot;
  const maxFleet = long ? (depot ? 16 : 10) : (depot ? 10 : 6);
  const maxRoutes = long ? (depot ? 20 : 12) : (depot ? 12 : 8);
  const ordersPerTurn = long ? 3 : 2;
  const orders = s.fleetOrders || [];
  return { maxFleet: Math.max(maxFleet, s.fleet.length), maxRoutes: Math.max(maxRoutes, s.routes.length), ordersPerTurn,
    ordersLeft: Math.max(0, ordersPerTurn - (s.orderTurn === s.turn ? s.orderedThisTurn || 0 : 0)),
    committed: s.fleet.length + orders.length, depositMonths: 2 };
}
export function aircraftQuote(s, type, kind = 'lease', express = false) {
  const ac = AIRCRAFT[type]; if (!ac) return null;
  const mult = buildCtx(s, { noise: false }).leaseNewMult;
  express = kind === 'lease' && express;
  const rate = ac.leasePerMonth * mult * (express ? 1.2 : 1), price = ac.price * mult;
  const deliveryTurns=express?1:kind==='own'?(ac.widebody?3:2):s.mode==='year'?(ac.widebody?3:2):(ac.widebody?2:1);
  const deposit=kind==='own'?price*CONST.loan.downPct:rate*fleetLimits(s).depositMonths;
  const bookingFee=express?ac.leasePerMonth*mult*.25:0;
  const leaseMonths=kind==='lease'?(express?3:s.mode==='year'?12:36):0;
  return { rate, price, deposit, bookingFee, upfront:deposit+bookingFee, cancelFee:deposit*.15,leaseMonths,
    deliveryTurns, orderedTurn:s.turn, readyTurn:s.turn+deliveryTurns, express };
}
export function facilityQuote(s,id) {
  if (!FACILITIES[id]) return null;
  const turns=s.mode==='year'?(id==='depot'?3:2):(id==='depot'?2:1);
  return { id, readyTurn:s.turn+turns, constructionTurns:turns, cost:FACILITIES[id].cost };
}
export function routeCapacity(s, routes) {
  const need = fleetNeeded(s, routes), limits = fleetLimits(s);
  const missing = Object.fromEntries(Object.entries(need).filter(([t,n]) => n > fleetCount(s,t)).map(([t,n]) => [t,n-fleetCount(s,t)]));
  const m=modeOf(s), slotsExhausted=m.slots&&CITIES[s.hub].slotLimited&&routes.reduce((n,r)=>n+r.weekly,0)>m.hubSlotCap;
  const crewMissing=Object.fromEntries(Object.entries(crewAvailability(s,routes)).filter(([,c])=>c.missing).map(([t,c])=>[t,c.missing]));
  return { need, missing, crewMissing, slotsExhausted, routeLimit: routes.length > limits.maxRoutes, fits: routes.length <= limits.maxRoutes && !slotsExhausted && !Object.keys(missing).length && !Object.keys(crewMissing).length };
}

// ============================================================ new game
export function newGame({ mode = 'year', hub = 'TPE', seed = 1 } = {}) {
  if (!MODES[mode]) mode = 'year';
  // HUBS remains the five calibrated recommendations; any catalog airport may be a base.
  if (!Object.hasOwn(CITIES, hub)) hub = 'TPE';
  seed = Number.isFinite(+seed) ? Math.floor(+seed) : 1;
  const m = MODES[mode];
  const s = {
    v: 1, facilities: {}, marketSupply: {}, marketRivalBase: {}, reserve: { kg: 0, unitPrice: 0 }, scenario: 'free', mode, hub, seed, turn: 0, cash: m.startCash, model: 'fsc', modelSwitches: 0,
    fleet: [], nextAc: 1, fleetOrders: [], nextOrder: 1, orderTurn: -1, orderedThisTurn: 0, maintenance: {}, fleetCondition: {}, facilityOrders: [], routes: [], hedge: { frac: 0, lock: 1, age: 0 }, fuelSpot: 1, rate: CONST.baseRate,
    rivals: [], plan: {}, choices: {}, mods: [], slotCaps: {}, labourMult: 1, lessons: {}, history: [], totals: { revenue: 0, profit: 0 },
    pending: { ownershipCash: 0, ownershipNonCash: 0, overheadCash: 0 }, debt: [], deferred: 0, defer: { pct: 0, turnsLeft: 0, after: 0 },
    routeStats: {}, lastRoutes: {}, notes: {}, everHedged: false, usedLcc: false, gameOver: null, finished: false, totalTurns: m.turns
  };
  for (const [type, n] of Object.entries(m.startFleet)) for (let i = 0; i < n; i++) addAircraft(s, type, 'lease', 1);
  s.crews={...m.startFleet};s.crewOrders=[];ensureManagement(s);
  // event plan
  for (const e of EVENTS) if (e.modes.includes(mode)) {
    const r = rngFor(seed, 'plan', e.id);
    s.plan[e.id] = e.turns[Math.floor(r() * e.turns.length)];
  }
  // rivals
  const h = CITIES[hub];
  const ranked = Object.values(CITIES).filter(c => c.id !== hub).map(c => ({ id: c.id, d: dist(h, c), M: pairBase(h, c) })).sort((a, b) => b.M - a.M);
  const rr = rngFor(seed, 'rivals', hub);
  const pick = (list, n) => { const pool = list.slice(); const out = []; while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rr() * Math.min(pool.length, 4)), 1)[0]); return out; };
  const mkRival = (def, cities, weekly) => ({ id: def.id, kind: def.kind, routes: Object.fromEntries(cities.map(c => [c.id, { weekly, fare: def.baseFare, cut: 0 }])) });
  if (mode === 'year') {
    s.rivals.push(mkRival(RIVALS.lcc, pick(ranked.filter(x => x.d < 4500 && x.d > 700).slice(0, 8), 2), 7));
  } else {
    s.rivals.push(mkRival(RIVALS.fsc, pick(ranked.slice(0, 10), 4), 10));
    s.rivals.push(mkRival(RIVALS.lcc, pick(ranked.filter(x => x.d < 5000 && x.d > 700).slice(0, 10), 3), 7));
  }
  // Initial named rivals are part of the observed total capacity, not seats added on top of it.
  for (const rv of s.rivals) for (const [city, x] of Object.entries(rv.routes)) {
    const seats = 2 * x.weekly * (rv.kind === 'lcc' ? 186 : 168);
    s.marketRivalBase[city] = (s.marketRivalBase[city] || 0) + seats;
  }
  for (const city of Object.keys(s.marketRivalBase)) {
    s.marketRivalBase[city] = Math.min(s.marketRivalBase[city], marketProfile(h, CITIES[city], dist(h, CITIES[city])).weeklySeats * 0.8);
  }
  s.career = readCareer(s);
  return s;
}
function addAircraft(s, type, kind, leaseMult) {
  const ac = AIRCRAFT[type];
  const a = { id: s.nextAc++, type, kind, rate: ac.leasePerMonth * (leaseMult || 1), price: ac.price, book: kind === 'own' ? ac.price : 0, loan: 0, loan0: 0, deposit: 0 };
  s.fleet.push(a); return a;
}

// ============================================================ route options (for the UI)
export function routeOptions(state, cityId) {
  const c = CITIES[cityId], h = CITIES[state.hub];
  if (!c || cityId === state.hub) return null;
  const m = modeOf(state), ctx = buildCtx(state, { noise: false });
  const d = dist(h, c), ref = refFareMid(d) * plOf(state, h, c), lf = fareLevel(d, state.model);
  const M = pairBase(h, c) * (CONST.hubDemand[state.hub] ?? 1) * ctx.m.demandScale * pairSeason(h, c, ctx.months) * ctx.growth * ctx.demandAll;
  const types = m.types.filter(t => AIRCRAFT[t].rangeKm >= d);
  const rv = rivalsAt(state, cityId);
  const cap = capFor(state, cityId);
  return {
    cityId, distanceKm: Math.round(d),
    blockHours: +blockHoursFor(AIRCRAFT[types[0] || 'MQ-320'], d).toFixed(2),
    blockHoursByType: Object.fromEntries(m.types.map(t => [t, +blockHoursFor(AIRCRAFT[t], d).toFixed(2)])),
    refFare: { low: Math.round(ref * lf * CONST.fareTier.low), mid: Math.round(ref * lf * CONST.fareTier.mid), high: Math.round(ref * lf * CONST.fareTier.high) },
    refFareFsc: Math.round(ref),
    refFareEconomy: Math.round(ref * lf * CONST.fareTier.mid / (state.model === 'lcc' ? 1 : cabinMix(d))),   // mid fare without the premium-cabin share, comparable with economy fares seen online
    ancillaryPerPax: Math.round(ancillaryPerPax(d, state.model)),
    eligibleTypes: types, estMarketPaxPerWeek: Math.round(M), market: marketProfile(h, c, d),
    otherSeatsPerWeek: Math.round(backgroundSeats(state, ctx, cityId) + rv.reduce((sum, x) => sum + 2 * x.weekly * (x.kind === 'lcc' ? 186 : 168), 0)),
    supplyIndex: state.marketSupply?.[cityId] ?? ctx.growth,
    rivalsOnRoute: rv.length, rivals: rv, slotLimited: !!c.slotLimited && m.slots, maxWeekly: cap,
    businessShare: +bizShare(h, c).toFixed(2), seasonFactor: +pairSeason(h, c, ctx.months).toFixed(3)
  };
}
function capFor(s, cityId) {
  const m = modeOf(s);
  let cap = m.maxWeekly;
  if (m.slots && CITIES[cityId].slotLimited) cap = Math.min(cap, s.slotCaps[cityId] ?? m.slotCap);
  return cap;
}

// ============================================================ business model switching
function switchModel(s, to, errors) {
  if (to === s.model) return;
  const m = modeOf(s);
  const first = s.turn === m.modelChoiceTurn && s.modelSwitches === 0 && s.turn === 0 && m.id === 'decade';
  if (!first) {
    s.pending.overheadCash += CONST.lcc.switchCostPerAircraft * s.fleet.length;
    s.mods.push({ kind: 'demand', seg: 'all', start: s.turn, seq: [CONST.lcc.switchDemandHit] });
    s.notes.switchTurn = s.turn;
  }
  s.model = to; s.modelSwitches++;
  if (to === 'lcc') s.usedLcc = true;
  void errors;
}
function modelChoiceOpen(s) {
  const m = modeOf(s);
  if (m.id === 'year') return s.turn === m.modelChoiceTurn;
  return true;
}

// ============================================================ events
function eventText(s, e, extra = '') {
  const w = HUB_WEATHER[s.hub] || { zh: '強風與低能見度', en: 'strong winds and low visibility' };
  return { zh: e.zh.replace('{weather}', w.zh) + extra, en: e.en.replace('{weather}', w.en) + extra };
}
export function pendingEvents(state) {
  const out = [];
  for (const e of EVENTS) {
    if (!e.modes.includes(state.mode) || !e.choices) continue;
    if (state.plan[e.id] !== state.turn || state.choices[e.id]) continue;
    const t = eventText(state, e);
    out.push({ id: e.id, zh: t.zh, en: t.en, lesson: e.lesson, options: e.choices.map(o => ({ id: o.id, zh: o.zh, en: o.en, default: !!o.default })) });
  }
  return out;
}

// ============================================================ decisions
export function applyDecisions(state, decisions = {}) {
  const s = clone(state), errors = [], d = decisions || {};
  const m = modeOf(s);
  if (s.finished || s.gameOver) { errors.push(err('GAME_OVER', '遊戲已經結束。', 'The game is over.')); return { state: s, errors }; }
  s.fleetOrders ||= []; s.nextOrder ||= 1; s.maintenance ||= {}; s.fleetCondition ||= {}; s.facilityOrders ||= [];
  ensureManagement(s);
  s.career = readCareer(s);
  if (d.mission === null) s.career.active = null;
  else if (d.mission !== undefined) {
    const offer = careerBoard(s).find(x => x.id === d.mission);
    if (!offer) errors.push(err('BAD_MISSION', '這個任務已無法接取，請回任務板重新選擇。', 'This mission is unavailable. Choose from the dispatch board.'));
    else s.career.active = { ...offer, startedTurn: s.turn, deadline: s.turn + offer.turns, pax: 0, profitable: false, checks: [] };
  }
  // 1. event choices
  if (d.eventChoices && typeof d.eventChoices === 'object') {
    for (const [id, opt] of Object.entries(d.eventChoices)) {
      const e = EVENTS.find(x => x.id === id && x.modes.includes(s.mode) && x.choices);
      if (!e) { errors.push(err('BAD_EVENT', `沒有這個事件：${id}`, `Unknown event: ${id}`)); continue; }
      const o = e.choices.find(x => x.id === opt);
      if (!o) { errors.push(err('BAD_OPTION', `事件 ${id} 沒有選項 ${opt}`, `Event ${id} has no option ${opt}`)); continue; }
      if (s.plan[id] !== s.turn) { errors.push(err('EVENT_NOT_NOW', `事件 ${id} 這回合沒有出現。`, `Event ${id} is not active this turn.`)); continue; }
      s.choices[id] = opt;
      if (o.effects && o.effects.switchModel) switchModel(s, o.effects.switchModel, errors);
    }
  }
  // 2. business model
  if (d.businessModel !== undefined) {
    if (!['fsc', 'lcc'].includes(d.businessModel)) errors.push(err('BAD_MODEL', '經營模式只能是 fsc 或 lcc。', 'Business model must be fsc or lcc.'));
    else if (d.businessModel !== s.model) {
      if (!modelChoiceOpen(s)) errors.push(err('MODEL_LOCKED', '現在不能改變經營模式（一年模式只在第 6 個月可以選擇）。', 'The business model cannot be changed now (Year mode: month 6 only).'));
      else { switchModel(s, d.businessModel, errors); if (s.turn === m.modelChoiceTurn) { const ev = EVENTS.find(x => x.id === (m.id === 'year' ? 'a-model' : 'b-model')); if (ev) s.choices[ev.id] = d.businessModel; } }
    } else { const ev = EVENTS.find(x => x.id === (m.id === 'year' ? 'a-model' : 'b-model')); if (ev && s.turn === m.modelChoiceTurn) s.choices[ev.id] = d.businessModel; }
  }
  // 3. hedge
  if (d.hedge !== undefined) {
    const f = d.hedge;
    if (typeof f !== 'number' || !Number.isFinite(f) || f < 0 || f > 1) errors.push(err('BAD_HEDGE', '避險比例必須介於 0 到 1。', 'Hedge ratio must be between 0 and 1.'));
    else if (f > 0 && s.turn < m.hedgeFromTurn) errors.push(err('HEDGE_LOCKED', `第 ${m.hedgeFromTurn + 1} 個月起才能避險。`, `Hedging opens in month ${m.hedgeFromTurn + 1}.`));
    else {
      const h = s.hedge;
      if (f > h.frac) { h.lock = (h.frac * h.lock + (f - h.frac) * s.fuelSpot) / f; h.age = 0; }
      h.frac = f; if (f > 0) s.everHedged = true;
    }
  }
  // 4. fleet acquisitions
  const fl = d.fleet || {};
  const cleanN = (v, label) => { if (v === undefined) return 0; if (!Number.isInteger(v) || v < 0 || v > 40) { errors.push(err('BAD_FLEET', `機隊數量不正確：${label}`, `Invalid fleet quantity: ${label}`)); return 0; } return v; };
  const ctxNow = buildCtx(s, { noise: false });
  const listOf = (obj, label) => { const out = []; if (obj === undefined) return out; if (typeof obj !== 'object' || obj === null) { errors.push(err('BAD_FLEET', `機隊欄位格式不正確：${label}`, `Invalid fleet field: ${label}`)); return out; } for (const [type, n] of Object.entries(obj)) { if (!AIRCRAFT[type] || !m.types.includes(type)) { errors.push(err('BAD_TYPE', `這個模式沒有機型 ${type}`, `Type ${type} is not available in this mode`)); continue; } const k = cleanN(n, `${label} ${type}`); if (k) out.push([type, k]); } return out; };
  if (fl.cancelOrders !== undefined) {
    if (!Array.isArray(fl.cancelOrders)) errors.push(err('BAD_FLEET', '取消訂單必須是陣列。', 'Cancelled orders must be an array.'));
    else for (const id of fl.cancelOrders) {
      const i = s.fleetOrders.findIndex(o => o.id === id);
      if (i < 0) errors.push(err('BAD_ORDER', '找不到這筆待交機訂單。', 'Pending order not found.'));
      else {
        const o=s.fleetOrders.splice(i,1)[0],fee=o.cancelFee||0;
        cashEntry(s,'aircraft',o.upfront-(o.bookingFee||0)-fee); s.pending.ownershipNonCash += fee;
      }
    }
  }
  const leases = listOf(fl.lease, 'lease');
  const express = listOf(fl.expressLease, 'expressLease');
  const buys = listOf(fl.buy, 'buy');
  if (buys.length && !m.buy) errors.push(err('NO_BUY', '一年模式只能租機，不能買機。', 'Year mode is lease-only.'));
  const requested = [...leases.map(([type,n]) => ({type,n,kind:'lease'})), ...express.map(([type,n])=>({type,n,kind:'lease',express:true})), ...(m.buy ? buys.map(([type,n]) => ({type,n,kind:'own'})) : [])];
  const limits = fleetLimits(s), quantity = requested.reduce((n,o) => n+o.n,0);
  const upfront = requested.reduce((n,o) => n+aircraftQuote(s,o.type,o.kind,o.express).upfront*o.n,0);
  if (quantity > limits.ordersLeft) errors.push(err('ORDER_LIMIT', `本回合還能訂 ${limits.ordersLeft} 架，請等下回合再擴張。`, `Only ${limits.ordersLeft} orders remain this turn. Expand next turn.`));
  if (limits.committed + quantity > limits.maxFleet) errors.push(err('FLEET_LIMIT', `機隊容量 ${limits.maxFleet} 架（含待交機）；興建維修基地可擴充。`, `Fleet capacity is ${limits.maxFleet}, including orders. Build a maintenance depot to expand.`));
  if (upfront > s.cash) errors.push(err('NO_CASH', '現金不夠支付租機押金或購機頭期款。', 'Not enough cash for lease deposits or purchase down payments.'));
  if (requested.some(o=>aircraftQuote(s,o.type,o.kind,o.express).readyTurn>=m.turns)) errors.push(err('NO_DELIVERY', '這筆訂單來不及在本局結束前投入營運；改選較快的交機方案。', 'This order would arrive too late to operate. Choose a faster delivery option.'));
  if (!errors.length) for (const o of requested) for (let i=0;i<o.n;i++) {
    const quote = aircraftQuote(s,o.type,o.kind,o.express);
    s.fleetOrders.push({ id:s.nextOrder++, type:o.type, kind:o.kind, ...quote }); cashEntry(s,'aircraft',-quote.upfront);
    s.pending.ownershipNonCash += quote.bookingFee;
    if (s.orderTurn !== s.turn) { s.orderTurn = s.turn; s.orderedThisTurn = 0; }
    s.orderedThisTurn++;
  }
  // Hiring is a separate commitment; a delivered aircraft does not include qualified staff.
  const personnel=d.personnel||{};
  const hires=listOf(personnel.hire,'crew hire'),hireCount=hires.reduce((n,[,k])=>n+k,0);
  const crewCap=Math.max(limits.maxFleet+4,Object.values(s.crews).reduce((n,k)=>n+k,0));
  const crewCount=Object.values(s.crews).reduce((n,k)=>n+k,0)+s.crewOrders.length;
  const trainingCost=hires.reduce((n,[type,k])=>n+crewQuote(s,type).fee*k,0);
  if(crewCount+hireCount>crewCap)errors.push(err('CREW_LIMIT',`機組編制上限 ${crewCap} 組（含訓練中）。`,`Roster capacity is ${crewCap}, including trainees.`));
  if(trainingCost>s.cash)errors.push(err('NO_CASH','現金不足以支付招募訓練費。','Not enough cash for recruitment and training.'));
  if(hires.some(([type])=>crewQuote(s,type).readyTurn>=m.turns))errors.push(err('NO_TRAINING','機組來不及在本局結束前完成訓練。','Training would finish too late to operate.'));
  if(!errors.length)for(const [type,k]of hires)for(let i=0;i<k;i++){
    const q=crewQuote(s,type);s.crewOrders.push({id:s.nextCrewOrder++,type,readyTurn:q.readyTurn,fee:q.fee});
    cashEntry(s,'staff',-q.fee);s.pending.staffPaid+=q.fee;
  }
  if(personnel.cancelOrders!==undefined){
    if(!Array.isArray(personnel.cancelOrders))errors.push(err('BAD_CREW','取消訓練清單格式不正確。','Invalid training cancellation list.'));
    else for(const id of personnel.cancelOrders){
      const idx=s.crewOrders.findIndex(o=>o.id===id);
      if(idx<0){errors.push(err('BAD_CREW','找不到這筆招募訓練。','Training order not found.'));continue;}
      const o=s.crewOrders.splice(idx,1)[0],refund=o.fee*.5;
      cashEntry(s,'staff',refund);s.pending.staffPaid-=refund;
    }
  }
  // Care policies and schedules are validated together; rejected policies keep the previous capacity.
  if (d.maintenance !== undefined) {
    if (!d.maintenance || typeof d.maintenance!=='object' || Array.isArray(d.maintenance)) errors.push(err('BAD_MAINTENANCE','保養方案格式不正確。','Invalid care policy.'));
    else for (const [type,policy] of Object.entries(d.maintenance)) {
      if (!m.types.includes(type) || !MAINTENANCE[policy]) { errors.push(err('BAD_MAINTENANCE','沒有這個機型或保養方案。','Unknown type or care policy.')); continue; }
      const trial={...s,maintenance:{...s.maintenance,[type]:policy}},routes=Array.isArray(d.routes)?d.routes:s.routes;
      if ((fleetNeeded(trial,routes)[type]||0)>fleetCount(s,type)) errors.push(err('CARE_CAPACITY','加強保養需要預留時數，請先減班或調整機型。','Extra care needs reserved hours. Reduce frequency or change aircraft first.'));
      else s.maintenance[type]=policy;
    }
  }
  // 5. routes
  if (d.routes !== undefined) {
    if (!Array.isArray(d.routes)) errors.push(err('BAD_ROUTES', '航線必須是陣列。', 'routes must be an array.'));
    else {
      const seen = new Set(), good = [], prev = Object.fromEntries(s.routes.map(r => [r.city, r]));
      for (const r of d.routes) {
        if (!r || typeof r !== 'object') { errors.push(err('BAD_ROUTE', '航線資料不正確。', 'Malformed route.')); continue; }
        const c = CITIES[r.city], ac = AIRCRAFT[r.type];
        const nm = c ? c.zh : String(r.city), nme = c ? c.en : String(r.city);
        if (!c || r.city === s.hub) { errors.push(err('BAD_CITY', `不能開航線：${nm}`, `Cannot open a route to ${nme}`)); continue; }
        if (seen.has(r.city)) { errors.push(err('DUP_ROUTE', `${nm} 重複了。`, `${nme} appears twice.`)); continue; }
        if (!ac || !m.types.includes(r.type)) { errors.push(err('BAD_TYPE', `這個模式沒有機型 ${r.type}。`, `Type ${r.type} is not available.`)); continue; }
        if (!CONST.tiers.includes(r.fare)) { errors.push(err('BAD_FARE', `票價等級必須是 low、mid 或 high。`, 'Fare must be low, mid or high.')); continue; }
        if (!Number.isInteger(r.weekly) || r.weekly < 1 || r.weekly > m.maxWeekly) { errors.push(err('BAD_FREQ', `${nm} 每週班次必須是 1 到 ${m.maxWeekly} 的整數。`, `Weekly flights to ${nme} must be an integer from 1 to ${m.maxWeekly}.`)); continue; }
        const dd = dist(CITIES[s.hub], c);
        if (dd > ac.rangeKm) { errors.push(err('OUT_OF_RANGE', `${ac.zh} 飛不到 ${nm}（${Math.round(dd)} 公里，航程 ${ac.rangeKm} 公里）。`, `${ac.en} cannot reach ${nme} (${Math.round(dd)} km, range ${ac.rangeKm} km).`)); continue; }
        if (r.weekly > capFor(s, r.city)) { errors.push(err('SLOT_LIMIT', `${nm} 機場時段有限，每週最多 ${capFor(s, r.city)} 班。`, `${nme} is slot-constrained: at most ${capFor(s, r.city)} flights a week.`)); continue; }
        seen.add(r.city); good.push({ city: r.city, type: r.type, weekly: r.weekly, fare: r.fare });
      }
      // keep previous version of a city whose new entry was rejected
      for (const r of d.routes) if (r && r.city && !seen.has(r.city) && prev[r.city]) { seen.add(r.city); good.push({ city: prev[r.city].city, type: prev[r.city].type, weekly: prev[r.city].weekly, fare: prev[r.city].fare }); }
      if (m.slots && CITIES[s.hub].slotLimited) {
        let tot = 0; for (const r of good) { tot += r.weekly; if (tot > m.hubSlotCap) { errors.push(err('SLOT_LIMIT_HUB', `樞紐機場時段用完了（每週 ${m.hubSlotCap} 班）。`, `Hub slots exhausted (${m.hubSlotCap} flights a week).`)); r.weekly = 0; } }
      }
      let final = good.filter(r => r.weekly > 0);
      if (final.length > limits.maxRoutes) {
        errors.push(err('ROUTE_LIMIT', `最多經營 ${limits.maxRoutes} 個航點；興建維修基地可擴充。`, `At most ${limits.maxRoutes} destinations. Build a maintenance depot to expand.`));
        final = final.slice(0, limits.maxRoutes);
      }
      // fleet sufficiency: drop trailing routes of any type that does not fit
      for (;;) {
        const need = fleetNeeded(s, final); let over = null;
        for (const t of Object.keys(need)) if (need[t] > fleetCount(s, t)) { over = t; break; }
        if (!over) break;
        const idx = final.map(r => r.type).lastIndexOf(over);
        const r = final[idx], c = CITIES[r.city];
        errors.push(err('INSUFFICIENT_FLEET', `${AIRCRAFT[over].zh} 機隊不夠飛 ${c.zh}（需要 ${need[over]} 架，現有 ${fleetCount(s, over)} 架）。`, `Not enough ${AIRCRAFT[over].en} for ${c.en} (need ${need[over]}, have ${fleetCount(s, over)}).`));
        final.splice(idx, 1);
      }
      for (;;) {
        const [over,c]=Object.entries(crewAvailability(s,final)).find(([,c])=>c.missing)||[];
        if(!over)break;
        const idx=final.map(r=>r.type).lastIndexOf(over);
        errors.push(err('INSUFFICIENT_CREW',`${AIRCRAFT[over].zh} 合格機組不足（需 ${c.required} 組，現有 ${c.ready} 組），請先完成招募訓練。`,`Insufficient qualified ${AIRCRAFT[over].en} rosters (need ${c.required}, ready ${c.ready}). Complete training first.`));
        final.splice(idx,1);
      }
      const newRoutes = final.map(r => { const p = prev[r.city]; return { ...r, age: p && p.type === r.type ? p.age : 0 }; });
      const opened = newRoutes.filter(r => !prev[r.city] || prev[r.city].type !== r.type).length;
      s.pending.overheadCash += opened * CONST.launchCostPerRoute * Math.sqrt(m.monthsPerTurn);
      s.routes = newRoutes;
    }
  }
  for(const [type,k]of listOf(personnel.release,'crew release'))for(let i=0;i<k;i++){
    const c=crewAvailability(s)[type],fee=2*crewQuote(s,type).monthly*s.labourMult;
    if(!c.ready||c.ready<=c.required){errors.push(err('CREW_IN_USE','沒有可裁撤的閒置機組，請先減班。','No spare rosters to release. Reduce schedules first.'));break;}
    if(s.cash<fee){errors.push(err('NO_CASH','現金不足以支付兩個月固定薪資的裁撤費。','Not enough cash for two months of severance.'));break;}
    s.crews[type]--;cashEntry(s,'staff',-fee);s.pending.staffPaid+=fee;
  }
  // 6. returns / sales (only aircraft not needed by the network)
  const need = fleetNeeded(s, s.routes);
  const retList = listOf(fl.returnLease, 'returnLease'), sellList = listOf(fl.sell, 'sell');
  for (const [type, n] of retList) for (let i = 0; i < n; i++) {
    const spare = fleetCount(s, type) - (need[type] || 0);
    const idx = s.fleet.findIndex(a => a.type === type && a.kind === 'lease');
    if (idx < 0) { errors.push(err('NO_LEASED', `沒有可退租的 ${AIRCRAFT[type].zh}。`, `No leased ${AIRCRAFT[type].en} to return.`)); break; }
    if (spare <= 0) { errors.push(err('FLEET_IN_USE', `${AIRCRAFT[type].zh} 還在航線上使用，不能退租。`, `${AIRCRAFT[type].en} is in use on routes and cannot be returned.`)); break; }
    const a = s.fleet.splice(idx, 1)[0],q=leaseReturnQuote(s,a);cashEntry(s,'aircraft',q.refund);s.pending.ownershipCash+=q.fee;
  }
  for (const [type, n] of sellList) for (let i = 0; i < n; i++) {
    if (!m.buy) { errors.push(err('NO_BUY', '一年模式沒有自己的飛機可賣。', 'Year mode has no owned aircraft to sell.')); break; }
    const spare = fleetCount(s, type) - (need[type] || 0);
    const idx = s.fleet.findIndex(a => a.type === type && a.kind === 'own');
    if (idx < 0) { errors.push(err('NO_OWNED', `沒有可賣的自有 ${AIRCRAFT[type].zh}。`, `No owned ${AIRCRAFT[type].en} to sell.`)); break; }
    if (spare <= 0) { errors.push(err('FLEET_IN_USE', `${AIRCRAFT[type].zh} 還在航線上使用，不能賣。`, `${AIRCRAFT[type].en} is in use and cannot be sold.`)); break; }
    const a = s.fleet.splice(idx, 1)[0], proceeds = a.book * CONST.resaleVsBook * ctxNow.assetNow;
    cashEntry(s,'aircraft',proceeds-a.loan); s.pending.ownershipNonCash += Math.max(0, a.book - proceeds);
  }
  // Optional hub facilities: capital is paid now and depreciated over ten years.
  s.facilities ||= {}; s.reserve ||= { kg: 0, unitPrice: 0 };
  if (d.facilities !== undefined && !Array.isArray(d.facilities)) errors.push(err('BAD_FACILITY', '設施清單格式不正確。', 'Invalid facility list.'));
  else for (const id of d.facilities || []) {
    const f = FACILITIES[id];
    if (!f) { errors.push(err('BAD_FACILITY', '沒有這項設施。', 'Unknown facility.')); continue; }
    if (s.facilities[id] || s.facilityOrders.some(o=>o.id===id)) continue;
    const quote=facilityQuote(s,id);
    if (quote.readyTurn>=m.turns) { errors.push(err('NO_COMPLETION','本局剩餘時間不足以完工並啟用。','Not enough time left to complete and use this facility.')); continue; }
    if (s.cash < f.cost) { errors.push(err('NO_CASH', '現金不足，不能興建設施。', 'Not enough cash to build.')); continue; }
    cashEntry(s,'aircraft',-f.cost); s.facilityOrders.push(quote);
  }
  if (d.buyFuel) {
    const order = fuelOrder(s);
    if (!s.facilities.tank || s.reserve.kg > 1 || order.kg <= 0) errors.push(err('NO_TANK', '需要燃油庫、航線與未使用的儲油空間。', 'Fuel storage, routes and empty storage are required.'));
    else if (s.cash < order.cost) errors.push(err('NO_CASH', '現金不足，不能預購燃油。', 'Not enough cash to prebuy fuel.'));
    else { cashEntry(s,'fuel',-order.cost); s.reserve = { kg: order.kg, unitPrice: CONST.fuelPriceUsdPerKg * s.fuelSpot }; }
  }
  return { state: s, errors };
}

// ============================================================ rival behaviour and event start-of-turn effects
function bestRouteCity(s) {
  let best = null, bp = -Infinity;
  for (const r of s.routes) { const x = s.lastRoutes[r.city]; const p = x ? x.profit : -1e12 + r.weekly; if (p > bp) { bp = p; best = r.city; } }
  return best;
}
function startTurn(s, ctx, report) {
  const t = s.turn;
  const fired = EVENTS.filter(e => e.modes.includes(s.mode) && s.plan[e.id] === t);
  for (const e of fired) {
    let o = null;
    if (e.choices) { const id = s.choices[e.id] || (e.choices.find(x => x.default) || e.choices[0]).id; s.choices[e.id] = id; o = e.choices.find(x => x.id === id); }
    let extra = '';
    const fx = e.effects || {};
    const rec = { id: e.id, lesson: e.lesson, turn: t };
    if (fx.fuel) s.mods.push({ kind: 'fuel', start: t, seq: fx.fuel });
    if (fx.demand) for (const [seg, seq] of Object.entries(fx.demand)) s.mods.push({ kind: 'demand', seg, start: t, seq });
    if (fx.disruption) s.mods.push({ kind: 'disruption', start: t, cancelPct: fx.disruption.cancelPct, compPerPax: fx.disruption.compPerPax });
    if (fx.assetMarket) s.mods.push({ kind: 'asset', start: t, seq: fx.assetMarket });
    if (fx.leaseMultNew) s.mods.push({ kind: 'leaseNew', start: t, turns: fx.leaseMultNew.turns, mult: fx.leaseMultNew.mult });
    if (fx.labourMult) s.labourMult *= fx.labourMult;
    if (fx.rate) s.rate += fx.rate;
    if (fx.slotCap) {
      const mine = s.routes.filter(r => CITIES[r.city].slotLimited).sort((a, b) => b.weekly - a.weekly)[0];
      const city = mine ? mine.city : ['LHR', 'JFK', 'NRT', 'FRA'].find(c => c !== s.hub);
      s.slotCaps[city] = fx.slotCap.cap; rec.city = city; rec.preSeats = mine ? mine.weekly * seatsOf(AIRCRAFT[mine.type], s.model) : 0;
      extra = `（${CITIES[city].zh}）`;
      const extraEn = ` (${CITIES[city].en})`;
      rec.extraEn = extraEn;
      for (const r of s.routes) if (r.city === city && r.weekly > fx.slotCap.cap) r.weekly = fx.slotCap.cap;
    }
    if (fx.rivalEntry) {
      const city = bestRouteCity(s);
      const rv = s.rivals.find(x => x.kind === fx.rivalEntry.rival) || s.rivals[0];
      if (city && rv) {
        rv.routes[city] = { weekly: fx.rivalEntry.weekly, fare: fx.rivalEntry.fareRatio, cut: 0 };
        rec.city = city; extra = `（${CITIES[city].zh}）`; rec.extraEn = ` (${CITIES[city].en})`;
        s.notes.entry = { city, turn: t, lf: (s.lastRoutes[city] || {}).lf };
      }
    }
    if (fx.rivalAdd) {
      const rv = s.rivals.find(x => x.kind === fx.rivalAdd.rival) || s.rivals[0];
      const top = s.routes.map(r => ({ r, rev: (s.lastRoutes[r.city] || {}).revenue || 0 })).sort((a, b) => b.rev - a.rev).slice(0, 3);
      for (const { r } of top) if (rv) { const x = rv.routes[r.city] || (rv.routes[r.city] = { weekly: 0, fare: RIVALS[rv.id].baseFare, cut: 0 }); x.weekly = Math.min(RIVALS[rv.id].maxWeekly, x.weekly + fx.rivalAdd.freqAdd); x.fare = Math.max(RIVALS[rv.id].fareFloor, x.fare - 0.05); }
    }
    const oe = (o && o.effects) || {};
    if (oe.cashLoan) { cashEntry(s,'financing',oe.cashLoan); s.debt.push({ balance: oe.cashLoan, rate: CONST.govLoanRate }); }
    if (oe.leaseDeferral) s.defer = { pct: oe.leaseDeferral.pct, turnsLeft: oe.leaseDeferral.turns, after: 0 };
    if (oe.labourMult) s.labourMult *= oe.labourMult;
    if (oe.disruption) s.mods.push({ kind: 'disruption', start: t, cancelPct: oe.disruption.cancelPct, compPerPax: oe.disruption.compPerPax });
    if (oe.forceFare && s.notes.entry && s.notes.entry.turn === t) { const r = s.routes.find(x => x.city === s.notes.entry.city); if (r) r.fare = oe.forceFare; }
    if (oe.dropRoute && s.notes.entry && s.notes.entry.turn === t) s.routes = s.routes.filter(x => x.city !== s.notes.entry.city);
    const txt = eventText(s, e, extra);
    report.events.push({ id: e.id, zh: txt.zh, en: txt.en + (rec.extraEn || ''), kind: e.warning ? 'warning' : 'event', lesson: e.lesson, choice: o ? o.id : null });
    s.notes['ev:' + e.id] = rec;
  }
  // rival rules (from the previous turn's results)
  if (t > 0) for (const rv of s.rivals) for (const [city, x] of Object.entries(rv.routes)) {
    const mine = s.routes.find(r => r.city === city);
    if (!mine) { if (x.fare < RIVALS[rv.id].baseFare) x.fare = Math.min(RIVALS[rv.id].baseFare, x.fare + 0.05); continue; }
    const yr = priceLevel(dist(CITIES[s.hub], CITIES[city]), s.model) * CONST.fareTier[mine.fare];
    const floor = RIVALS[rv.id].fareFloor;
    if (yr < x.fare - 0.05) { x.fare = Math.max(floor, yr + 0.02); x.cut = 1; s.notes.priceWarSeen = true; }
    else if (yr >= x.fare + 0.12 && x.fare < RIVALS[rv.id].baseFare) { x.fare = Math.min(RIVALS[rv.id].baseFare, x.fare + 0.04); x.cut = 0; }
    const last = s.lastRoutes[city];
    if (last && last.lf > 0.85 && x.weekly < RIVALS[rv.id].maxWeekly) x.weekly += 2;
  }
}

// ============================================================ simulate one turn
function costRoute(s, ctx, r, res, pax, rev, transferPax) {
  const ac = AIRCRAFT[r.type], d = res.d, f = res.weeklyEff;
  const deps = 2 * f * ctx.W, bh = deps * blockHoursFor(ac, d);
  const lcc = s.model === 'lcc';
  const scale = ac.widebody ? 0.5 : 1;
  const crewMult = lcc ? 1 - (1 - CONST.lcc.crewMult) * scale : 1;
  const groundMult = lcc ? 1 - (1 - CONST.lcc.groundMult) * scale : 1;
  const airportMult = lcc ? 1 - (1 - CONST.lcc.airportMult) * scale : 1;
  const feeAvg = (CITIES[s.hub].feeLevel + CITIES[r.city].feeLevel) / 2;
  const c = zeroCosts();
  c.fuel = bh * ac.fuelPerBlockHour * CONST.fuelPriceUsdPerKg * ctx.eff;
  const sizeF = Math.pow(ac.seats.fsc / 168, 0.7);
  c.labour = (bh * ac.crewPerBlockHour * CONST.crewScale * crewMult * (1-CREW_FIXED_SHARE) + (deps * CONST.groundLabourPerDep * sizeF + pax * CONST.groundLabourPerPax) * groundMult) * s.labourMult;
  c.maintenance = (bh * ac.maintPerBlockHour + deps * ac.maintPerCycle) * (s.facilities?.depot ? 0.7 : 1) * careOf(s,r.type).cost;
  c.airport = (deps * (ac.airportPerDep + ac.navPerKm * d) + pax * CONST.paxCharge) * CONST.airportScale * feeAvg * airportMult + transferPax * CONST.transferHandling * 0.5;
  c.distribution = rev * CONST.distribution[lcc ? 'lcc' : 'fsc'];
  return { c, bh, deps };
}

export function simulateTurn(state) {
  const s = clone(state);
  const m = modeOf(s);
  if (s.finished || s.gameOver) return { state: s, report: null };
  ensureManagement(s);
  s.career = readCareer(s);
  const t = s.turn;
  const ctx = buildCtx(s);
  const report = { turn: t, labelZh: '', labelEn: '', company: null, routes: [], events: [], lessons: [], rivals: [], gameOver: null };
  if (m.id === 'year') {
    const mn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'], me = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    report.labelZh = `第 ${t + 1} 個月（${mn[t % 12]}月）`; report.labelEn = `Month ${t + 1} (${me[t % 12]})`;
  } else {
    const y = Math.floor(t / 2) + 1, sm = t % 2 === 0;
    report.labelZh = `第 ${y} 年${sm ? '夏季' : '冬季'}`; report.labelEn = `Year ${y} ${sm ? 'Summer' : 'Winter'}`;
  }
  startTurn(s, ctx, report);
  const ctx2 = buildCtx(s); // pick up newly activated mods
  Object.assign(ctx, ctx2);
  // clip routes to slot caps
  for (const r of s.routes) { const cap = capFor(s, r.city); if (r.weekly > cap) r.weekly = cap; }
  // clip to fleet (defensive)
  for (;;) {
    const need = fleetNeeded(s, s.routes); let over = null;
    for (const ty of Object.keys(need)) if (need[ty] > fleetCount(s, ty)) { over = ty; break; }
    if (!over) break;
    const idx = s.routes.map(r => r.type).lastIndexOf(over);
    if (s.routes[idx].weekly > 1) s.routes[idx].weekly--; else s.routes.splice(idx, 1);
  }
  for (;;) {
    const [type]=Object.entries(crewAvailability(s)).find(([,c])=>c.missing)||[];
    if(!type)break;
    const idx=s.routes.map(r=>r.type).lastIndexOf(type);
    if(s.routes[idx].weekly>1)s.routes[idx].weekly--;else s.routes.splice(idx,1);
  }
  const routes = s.routes;
  ctx.readiness=fleetReadiness(s,routes);
  const locals = routes.map(r => evalLocal(s, ctx, r));
  // Consume prepaid fuel only for departures that actually operate, including technical cancellations.
  const fuelKg=locals.reduce((n,l,i)=>n+2*l.weeklyEff*ctx.W*blockHoursFor(AIRCRAFT[routes[i].type],l.d)*AIRCRAFT[routes[i].type].fuelPerBlockHour,0);
  ctx.reserveUsedKg=Math.min(s.reserve?.kg||0,.3*(1-s.hedge.frac)*fuelKg);
  ctx.eff=(1-s.hedge.frac)*ctx.spot+s.hedge.frac*s.hedge.lock*(1+CONST.hedge.premium);
  if(fuelKg>0) ctx.eff+=ctx.reserveUsedKg/fuelKg*((s.reserve?.unitPrice||0)/CONST.fuelPriceUsdPerKg-ctx.spot);
  const noRiv = routes.map(r => evalLocal(s, ctx, r, { noRivals: true }));
  // transfers
  const pairs = transferPairs(s, ctx, routes, locals);
  const spare = locals.map(l => Math.min(l.transferReserve, Math.max(0, l.seatsWeek - l.paxB - l.paxL) * CONST.transferSpareShare));
  const want = routes.map(() => 0);
  for (const p of pairs) { want[p.i] += p.T; want[p.j] += p.T; }
  const scl = want.map((w, i) => (w > 0 ? Math.min(1, spare[i] / w) : 1));
  const xferPax = routes.map(() => 0), xferRev = routes.map(() => 0);
  for (const p of pairs) {
    const k = Math.min(scl[p.i], scl[p.j]), T = p.T * k;
    if (T <= 0) continue;
    const ti = CONST.fareTier[routes[p.i].fare], tj = CONST.fareTier[routes[p.j].fare];
    const through = refFareMid(p.dij) * plOf(s, CITIES[routes[p.i].city], CITIES[routes[p.j].city]) * 0.92 * fareLevel(p.dij, s.model) * Math.sqrt(ti * tj) + ancillaryPerPax(p.dij, s.model);
    xferPax[p.i] += T; xferPax[p.j] += T;
    xferRev[p.i] += T * through * p.di / (p.di + p.dj); xferRev[p.j] += T * through * p.dj / (p.di + p.dj);
  }
  // per-route revenue and variable cost
  const W = ctx.W;
  const hubC0 = CITIES[s.hub];
  const rows = routes.map((r, i) => {
    const l = locals[i], d = l.d, ac = AIRCRAFT[r.type];
    const paxLocalWeek = l.paxB + l.paxL, paxWeek = paxLocalWeek + xferPax[i];
    const lf = l.seatsWeek > 0 ? paxWeek / l.seatsWeek : 0;
    const base = refFareMid(d) * plOf(s, hubC0, CITIES[r.city]) * fareLevel(d, s.model) * CONST.fareTier[r.fare];
    const norm = 1 / (l.b * CONST.segFare.biz + (1 - l.b) * CONST.segFare.lei);
    const fareB = base * CONST.segFare.biz * norm, fareL = base * CONST.segFare.lei * norm;
    const anc = ancillaryPerPax(d, s.model);
    const fareRevLocal = (l.paxB * fareB + l.paxL * fareL) * W;
    const xferTotal = xferRev[i] * W;
    const paxTurn = paxWeek * W, seatsTurn = l.seatsWeek * W;
    const revenue = fareRevLocal + paxLocalWeek * anc * W + xferTotal;
    const { c, bh, deps } = costRoute(s, ctx, r, l, paxTurn, revenue, xferPax[i] * W);
    // compensation for cancelled flights
    if (ctx.cancel > 0) c.overhead += ctx.cancel * 2 * r.weekly * ac.seats[s.model] * W * 0.78 * ctx.compPerPax;
    c.overhead += l.technicalCancel * (1-ctx.cancel) * 2*r.weekly*ac.seats[s.model]*W*.78*55;
    return { r, l, i, ac, d, paxWeek, paxTurn, seatsTurn, lf, revenue, c, bh, deps, fareRevLocal, xferTotal, anc, base, ancRev: paxLocalWeek * anc * W };
  });
  // fleet costs
  const mpt = ctx.mpt;
  const own = {}, intr = {}; let ownTotal = 0, intTotal = 0, depTotal = 0, principal = 0, leaseCash = 0;
  for (const a of s.fleet) {
    let oc = 0, ic = 0;
    if (a.kind === 'lease') { oc = a.rate * mpt; leaseCash += oc; }
    else {
      const dep = a.price * (1 - CONST.residualPct) / (CONST.deprYears * 12 / mpt); oc = Math.min(dep, Math.max(0, a.book)); a.book = Math.max(0, a.book - oc); depTotal += oc;
      ic = a.loan * rateNow(s) * W / 52;
      const pr = Math.min(a.loan, a.loan0 / (CONST.loan.termYears * 12 / mpt)); a.loan -= pr; principal += pr;
    }
    own[a.type] = (own[a.type] || 0) + oc; intr[a.type] = (intr[a.type] || 0) + ic; ownTotal += oc; intTotal += ic;
  }
  let govInterest = 0, govPrincipal = 0;
  for (const dbt of s.debt) { govInterest += dbt.balance * dbt.rate * W / 52; }
  intTotal += govInterest;
  const hoursByType = {}; let hoursAll = 0;
  for (const rw of rows) { hoursByType[rw.r.type] = (hoursByType[rw.r.type] || 0) + rw.bh; hoursAll += rw.bh; }
  const nAc = s.fleet.length;
  let facilityDep = 0, facilityRunning = 0;
  for (const [id, built] of Object.entries(s.facilities || {})) {
    const f = FACILITIES[id]; if (!f) continue;
    const dep = Math.min(built.book, f.cost / (f.years * 12) * mpt);
    built.book -= dep; facilityDep += dep; facilityRunning += f.monthly * mpt;
  }
  const ovh = facilityRunning + facilityDep + (CONST.overhead.base + CONST.overhead.perAircraft * nAc) * mpt * (s.model === 'lcc' ? CONST.lcc.overheadMult : 1) + s.pending.overheadCash;
  const rosters=crewAvailability(s,routes),payroll=Object.fromEntries(Object.entries(rosters).map(([ty,c])=>[ty,c.monthly*mpt*s.labourMult]));
  const staffTotal=Object.values(payroll).reduce((n,c)=>n+c,0)+s.pending.staffPaid;
  let allocatedStaff=0;
  let allocOwn = 0, allocInt = 0;
  for (const rw of rows) {
    const ty = rw.r.type, share = hoursByType[ty] > 0 ? rw.bh / hoursByType[ty] : 0;
    rw.c.ownership = (own[ty] || 0) * share; rw.c.interest = (intr[ty] || 0) * share;
    rw.c.overhead += ovh * (hoursAll > 0 ? rw.bh / hoursAll : 0);
    const staff=(payroll[ty]||0)*share+s.pending.staffPaid*(hoursAll>0?rw.bh/hoursAll:0);
    rw.c.labour+=staff;allocatedStaff+=staff;
    allocOwn += rw.c.ownership; allocInt += rw.c.interest;
  }
  // company
  const comp = zeroCosts(); let revenue = 0, pax = 0, seats = 0, rpk = 0, ask = 0;
  for (const rw of rows) { revenue += rw.revenue; pax += rw.paxTurn; seats += rw.seatsTurn; rpk += rw.paxTurn * rw.d; ask += rw.seatsTurn * rw.d; for (const k of KEYS) if (k !== 'ownership' && k !== 'interest' && k !== 'overhead') comp[k] += rw.c[k]; }
  // route-level overhead already includes cancellation compensation, launch and refit costs; with no routes the whole bill stays at company level
  comp.overhead = hoursAll > 0 ? rows.reduce((a, rw) => a + rw.c.overhead, 0) : ovh;
  comp.ownership = ownTotal + s.pending.ownershipCash + s.pending.ownershipNonCash;
  comp.interest = intTotal;
  comp.labour+=staffTotal-allocatedStaff;
  const idleOwn = comp.ownership - allocOwn, idleInt = intTotal - allocInt;
  // cost of the spare aircraft (count above what the network needs), even though it is spread over the routes of that type
  let spareCost = 0;
  { const nd = fleetNeeded(s, routes); for (const ty of Object.keys(own)) { const have = fleetCount(s, ty), extra = Math.max(0, have - (nd[ty] || 0)); if (extra > 0) spareCost += extra * ((own[ty] + (intr[ty] || 0)) / have); } }
  const costTotal = sumCosts(comp);
  const profit = revenue - costTotal;
  // cash flow
  let deferral = 0;
  if (s.defer.turnsLeft > 0) { deferral = leaseCash * s.defer.pct; s.deferred += deferral; s.defer.turnsLeft--; if (s.defer.turnsLeft === 0) s.defer.after = 2; }
  else if (s.defer.after > 0 && s.deferred > 0) { const pay = s.deferred / s.defer.after; deferral = -pay; s.deferred -= pay; s.defer.after--; }
  const fuelPrepaid = ctx.reserveUsedKg * (s.reserve?.unitPrice || 0);
  if (s.reserve) s.reserve.kg = Math.max(0, s.reserve.kg - ctx.reserveUsedKg);
  const operatingCash=profit+depTotal+facilityDep+fuelPrepaid+s.pending.ownershipNonCash+s.pending.staffPaid;
  s.cash+=operatingCash-principal-govPrincipal+deferral;
  const cashFlow={...s.cashLedger,operating:operatingCash,debtPayments:-principal-govPrincipal,leaseDeferral:deferral,closing:s.cash};
  s.cashLedger={opening:s.cash,aircraft:0,staff:0,fuel:0,financing:0};
  s.pending = { ownershipCash: 0, ownershipNonCash: 0, overheadCash: 0,staffPaid:0 };
  // company metrics
  const lfC = ask > 0 ? rpk / ask : 0;
  const belfOf = (cost, rev, lf) => (rev > 0 ? clamp(lf * cost / rev, 0, 3) : 0);
  const util = nAc > 0 ? hoursAll / (nAc * 7 * W * 8.5) : 0;
  const need = fleetNeeded(s, routes);
  const idleAc = s.fleet.length - Object.values(need).reduce((a, b) => a + b, 0);
  const company = {
    revenue: Math.round(revenue), costs: Object.fromEntries(KEYS.map(k => [k, Math.round(comp[k])])), costTotal: Math.round(costTotal),
    profit: Math.round(profit), margin: revenue > 1 ? clamp(profit / revenue, -9.99, 9.99) : (profit < 0 ? -1 : 0),
    cash: Math.round(s.cash), loadFactor: lfC, breakEvenLF: belfOf(costTotal, revenue, lfC),
    rask: ask > 0 ? revenue / ask : 0, cask: ask > 0 ? costTotal / ask : 0, pax: Math.round(pax), seats: Math.round(seats), ask: Math.round(ask), rpk: Math.round(rpk),
    costShares: Object.fromEntries(KEYS.map(k => [k, costTotal > 0 ? comp[k] / costTotal : 0])),
    fleet: s.fleet.length, idleAircraft: Math.max(0, idleAc), idleFleetCost: Math.round(Math.max(0, spareCost, idleOwn + idleInt)),
    fuelIndex: +ctx.spot.toFixed(3), fuelIndexEffective: +ctx.eff.toFixed(3), hedge: s.hedge.frac, model: s.model,
    debt: Math.round(s.fleet.reduce((a, x) => a + x.loan, 0) + s.debt.reduce((a, x) => a + x.balance, 0)),
    transferPax: Math.round(xferPax.reduce((a, b) => a + b, 0) * W),
    ancillaryRevenue: Math.round(rows.reduce((a, r) => a + r.ancRev, 0)),
    ancillaryShare: revenue > 1 ? rows.reduce((a, r) => a + r.ancRev, 0) / revenue : 0,
    facilityRunning: Math.round(facilityRunning), facilityDep: Math.round(facilityDep), fuelPrepaid: Math.round(fuelPrepaid), reserveKg: Math.round(s.reserve?.kg || 0),
    fixedPayroll:Math.round(Object.values(payroll).reduce((n,c)=>n+c,0)),idlePayroll:Math.round(Object.entries(rosters).reduce((n,[ty,c])=>n+Math.max(0,c.ready-c.required)*crewQuote(s,ty).monthly*mpt*s.labourMult,0)),
    cashFlow,commitments:cashCommitments(s)
  };
  for (const k of Object.keys(company)) if (typeof company[k] === 'number') company[k] = fin(company[k]);
  // route reports
  const hubC = CITIES[s.hub];
  const idxs = rows.map((_, i) => i);
  report.routes = idxs.map(i => {
    const rw = rows[i], l = rw.l, rcost = sumCosts(rw.c), profitR = rw.revenue - rcost;
    const askR = rw.seatsTurn * rw.d, rpkR = rw.paxTurn * rw.d;
    const belf = belfOf(rcost, rw.revenue, rw.lf);
    const paxLocalTurn = (l.paxB + l.paxL) * W;
    const avgFare = paxLocalTurn > 0 ? rw.fareRevLocal / paxLocalTurn : rw.base;
    const xshare = rw.paxTurn > 0 ? (xferPax[i] * W) / rw.paxTurn : 0;
    const rivalLoss = l.wantNoRival > 0 ? 1 - l.want / l.wantNoRival : 0;
    const row = {
      city: rw.r.city, type: rw.r.type, weekly: rw.r.weekly, fare: rw.r.fare, pax: Math.round(rw.paxTurn), seats: Math.round(rw.seatsTurn), lf: fin(rw.lf), breakEvenLF: fin(belf),
      revenue: Math.round(rw.revenue), cost: Math.round(rcost), costs: Object.fromEntries(KEYS.map(k => [k, Math.round(rw.c[k])])), profit: Math.round(profitR),
      rask: askR > 0 ? rw.revenue / askR : 0, cask: askR > 0 ? rcost / askR : 0, avgFare: fin(avgFare), transferPax: Math.round(xferPax[i] * W), transferShare: xshare,
      distanceKm: Math.round(rw.d), blockHours: +blockHoursFor(rw.ac, rw.d).toFixed(2), rivalLoss: fin(rivalLoss), marginRoute: rw.revenue > 1 ? clamp(profitR / rw.revenue, -9.99, 9.99) : 0,
      technicalCancel:l.technicalCancel, flownWeekly:rw.l.weeklyEff,
      seasonFactor: l.sea, rampFactor: l.rampF, rivals: l.rivals.map(x => ({ id: x.id, weekly: x.weekly, fare: +x.fare.toFixed(2) })), localPax: Math.round(paxLocalTurn), ancillary: Math.round(rw.ancRev), wantPax: Math.round(l.want * W)
    };
    const rs = reason(s, ctx, row, rw);
    row.reasonZh = rs.zh; row.reasonEn = rs.en; row.reasonKey = rs.key;
    return row;
  });
  // rivals report
  report.rivals = s.rivals.map(rv => ({ id: rv.id, zh: RIVALS[rv.id].zh, en: RIVALS[rv.id].en, kind: rv.kind, routes: Object.entries(rv.routes).map(([city, x]) => ({ city, weekly: x.weekly, fare: +x.fare.toFixed(2) })) }));
  report.company = company;
  report.personnel=Object.entries(rosters).filter(([,c])=>c.ready||c.required).map(([type,c])=>({type,...c,payroll:payroll[type]}));
  // stats for end report
  for (const r of report.routes) {
    const st = s.routeStats[r.city] || (s.routeStats[r.city] = { city: r.city, revenue: 0, profit: 0, turns: 0, lastReasonZh: '', lastReasonEn: '', types: {} });
    st.revenue += r.revenue; st.profit += r.profit; st.turns++; st.lastReasonZh = r.reasonZh; st.lastReasonEn = r.reasonEn; st.types[r.type] = (st.types[r.type] || 0) + 1;
    s.lastRoutes[r.city] = { lf: r.lf, profit: r.profit, revenue: r.revenue, fare: r.fare };
  }
  for (const k of Object.keys(s.lastRoutes)) if (!report.routes.find(r => r.city === k)) delete s.lastRoutes[k];
  s.totals.revenue += revenue; s.totals.profit += profit;
  s.fuelSpot = ctx.spot;
  s.hedge.age++;
  if (s.hedge.age >= CONST.hedge.tenor[s.mode]) { s.hedge.lock = ctx.spot; s.hedge.age = 0; }
  for (const r of s.routes) r.age = (r.age || 0) + 1;
  // lessons
  updateLessons(s, ctx, report, rows);
  report.lessons = Object.entries(s.lessons).filter(([, v]) => v.seen === t).map(([k]) => k);
  s.history.push({ turn: t, revenue: company.revenue, profit: company.profit, margin: company.margin, cash: company.cash, lf: company.loadFactor, fuelIndex: company.fuelIndex, aircraft: company.fleet, pax: company.pax, transferPax: company.transferPax });
  updateMarketSupply(s, ctx);
  s.fleetCondition ||= {};
  report.operations=Object.entries(ctx.readiness).map(([type,r])=>({type,...r}));
  for (const [type,r] of Object.entries(ctx.readiness)) s.fleetCondition[type]=r.nextCondition;
  s.turn++;
  const deliveries = (s.fleetOrders || []).filter(o => o.readyTurn <= s.turn);
  for (const o of deliveries) {
    const previous=fleetCount(s,o.type),condition=s.fleetCondition[o.type]??100;
    const a = addAircraft(s, o.type, o.kind, 1); a.rate = o.rate; a.price = o.price;
    s.fleetCondition[o.type]=(condition*previous+100)/(previous+1);
    if (o.kind === 'lease') { a.deposit = o.deposit ?? o.upfront;if(o.leaseMonths)a.leaseUntilMonth=o.readyTurn*m.monthsPerTurn+o.leaseMonths; }
    else { a.book = o.price; a.loan = a.loan0 = o.price-o.upfront; }
  }
  s.fleetOrders = (s.fleetOrders || []).filter(o => o.readyTurn > s.turn);
  report.deliveries = deliveries.map(o => ({ type:o.type, kind:o.kind }));
  const trained=s.crewOrders.filter(o=>o.readyTurn<=s.turn);
  for(const o of trained)s.crews[o.type]=(s.crews[o.type]||0)+1;
  s.crewOrders=s.crewOrders.filter(o=>o.readyTurn>s.turn);
  report.crewCompletions=trained.map(o=>({type:o.type}));
  const completed=(s.facilityOrders||[]).filter(o=>o.readyTurn<=s.turn);
  s.facilities ||= {};
  for (const o of completed) s.facilities[o.id]={book:o.cost};
  s.facilityOrders=(s.facilityOrders||[]).filter(o=>o.readyTurn>s.turn);
  report.facilityCompletions=completed.map(o=>o.id);
  company.commitments=cashCommitments(s);
  // game over
  if (s.cash < 0) {
    report.gameOver = { reason: 'bankrupt', zh: `現金見底（${Math.round(s.cash / 1e6)} 百萬美元），無法支付租金、薪水與貸款，公司倒閉。${bankruptWhy(s, company, report)}`, en: `Cash ran out (US$${(s.cash / 1e6).toFixed(1)}M); the company cannot pay leases, wages and loans and goes under.` };
    s.gameOver = report.gameOver;
  } else if (s.turn >= m.turns) s.finished = true;
  for (const k of ['revenue', 'profit', 'cash']) company[k] = fin(company[k]);
  const progression = settleCareer(s, report);
  s.career = progression.career; report.career = progression.result;
  return { state: s, report };
}

function bankruptWhy(s, company, report) {
  const worst = [...report.routes].sort((a, b) => a.profit - b.profit)[0];
  if (company.revenue < company.costTotal * 0.5) return '收入不到成本的一半，主要是飛機租金和人力成本沒有被收入蓋住。';
  if (company.idleAircraft > 0) return `有 ${company.idleAircraft} 架飛機閒置，租金照付。`;
  if (worst && worst.profit < 0) return `虧損最大的是 ${CITIES[worst.city].zh} 航線。`;
  return '連續虧損把現金耗盡。';
}

// ============================================================ explanations (one plain sentence per route)
function reason(s, ctx, row, rw) {
  const lf = row.lf, belf = row.breakEvenLF, loss = row.profit < 0;
  const L = pct(lf), B = pct(belf);
  const ac = rw.ac, seatsHere = seatsOf(ac, s.model);
  const fuelShare = row.cost > 0 ? row.costs.fuel / row.cost : 0;
  const hedgeLow = ctx.hedgeFrac < 0.3;
  const spotUp = pct(ctx.spot - 1);
  const dis = ctx.cancel > 0;
  const q = (zh, en, key) => ({ zh, en, key });
  if (dis) return q(`航班被取消了約 ${pct(ctx.cancel)}%，收入少了，租金和薪水照付。`, `About ${pct(ctx.cancel)}% of flights were cancelled; revenue fell while leases and wages did not.`, 'disruption');
  if (row.technicalCancel>.015) return q(`機隊狀態與密集排班使約 ${pct(row.technicalCancel)}% 航班無法執行，租金照付且要補償旅客。可減班或加強保養。`, `Fleet condition and tight schedules prevented about ${pct(row.technicalCancel)}% of flights. Rent and passenger compensation still apply. Reduce flying or increase care.`, 'maintenance');
  if (loss && seatsHere >= 250 && lf < 0.65) return q(`大飛機只坐了 ${L}%，攤到每個座位的成本太高。`, `The big aircraft is only ${L}% full, so cost per seat is too high.`, 'widebody');
  if (loss && ctx.spot >= 1.2 && hedgeLow && fuelShare > 0.3) return q(`油價漲了 ${spotUp}%，你沒有避險，燃油占了這條線成本的 ${pct(fuelShare)}%。`, `Fuel is up ${spotUp}% and you are not hedged; fuel is ${pct(fuelShare)}% of this route’s cost.`, 'fuel');
  if (loss && row.rivalLoss >= 0.08) return q(`對手降價或增班，你的客人被搶走約 ${pct(row.rivalLoss)}%。`, `A rival cut fares or added flights and took about ${pct(row.rivalLoss)}% of your passengers.`, 'rival');
  if (loss && lf >= 0.85) return q(`飛機坐滿了（${L}%），但票價低於每個座位的成本，客人越多虧越多。`, `The plane is full (${L}%) but the fare is below the cost per seat, so more passengers means a bigger loss.`, 'fullLoss');
  if (loss && row.seasonFactor < 0.9) return q(`淡季，這條線的客人比平常少了約 ${pct(1 - row.seasonFactor)}%。`, `Low season: this route has about ${pct(1 - row.seasonFactor)}% fewer passengers than usual.`, 'season');
  if (loss && row.costs.airport / Math.max(1, row.cost) > 0.2) return q(`航程短，每趟起降費占成本的 ${pct(row.costs.airport / row.cost)}%，成本偏高。`, `A short sector: landing and navigation fees are ${pct(row.costs.airport / row.cost)}% of cost per trip.`, 'airport');
  if (loss && row.rampFactor < 1) return q(`新航線，客人還在累積，這個月只拿到潛在客源的 ${pct(row.rampFactor)}%。`, `A new route: passengers are still building and you only won ${pct(row.rampFactor)}% of the potential this turn.`, 'ramp');
  if (loss && lf < 0.7) return q(`客源不夠，只坐了 ${L}%，低於損益平衡的 ${B}%。`, `Not enough demand: only ${L}% full against a break-even of ${B}%.`, 'thin');
  if (loss) return q(`載客率 ${L}%，低於損益平衡的 ${B}%，票價收入不夠攤平成本。`, `Load factor ${L}% is below the ${B}% break-even; fares do not cover cost.`, 'belowBE');
  if (ctx.spot >= 1.2 && ctx.hedgeFrac >= 0.5) return q(`油價漲了 ${spotUp}%，但你鎖定了大部分價格，傷害有限，這條線仍有賺。`, `Fuel is up ${spotUp}% but you locked in most of the price, so the damage is limited and the route still earns.`, 'hedged');
  if (row.transferShare >= 0.15) return q(`轉機旅客占了 ${pct(row.transferShare)}%，把座位填到 ${L}%，這條線賺錢。`, `Connecting passengers are ${pct(row.transferShare)}% of the load, lifting it to ${L}%; the route earns.`, 'hub');
  if (row.rivalLoss >= 0.08) return q(`對手搶走約 ${pct(row.rivalLoss)}% 的客人，但載客率 ${L}% 仍高於損益平衡的 ${B}%。`, `A rival took about ${pct(row.rivalLoss)}% of your passengers, but ${L}% load still beats the ${B}% break-even.`, 'rivalOk');
  return q(`載客率 ${L}%，高於損益平衡的 ${B}%，這條線有賺。`, `Load factor ${L}% beats the ${B}% break-even; the route earns.`, 'profit');
}

// ============================================================ lessons
function updateLessons(s, ctx, report, rows) {
  const t = s.turn, m = modeOf(s);
  // event lessons
  for (const e of EVENTS) {
    if (!e.modes.includes(s.mode) || s.plan[e.id] !== t || !e.lesson) continue;
    if (!s.routes.length) continue; // no route flying: the situation did not actually reach the player
    const o = e.choices ? e.choices.find(x => x.id === s.choices[e.id]) : null;
    let handled = o ? o.handled !== false : true;
    if (e.id.includes('fuel') && !e.id.includes('warn')) handled = s.hedge.frac >= 0.5;
    if (e.id === 'b-oil') handled = s.hedge.frac >= 0.5;
    if (e.id === 'a-weather' || e.id === 'b-weather') handled = report.company.cash > 0;
    if (e.id === 'a-season' || e.id === 'b-season' || e.id === 'a-festival') handled = true;
    if (e.id === 'a-slump') handled = true;
    if (e.id === 'b-fsc-adds') handled = true;
    if (e.warning) handled = s.hedge.frac >= 0.3 || e.id === 'b-pandemic-warn';
    if (!s.lessons[e.lesson]) s.lessons[e.lesson] = { seen: t, handled, first: t, ev: e.id };
    else { s.lessons[e.lesson].seen = t; s.lessons[e.lesson].handled = s.lessons[e.lesson].handled && handled || (e.lesson === 'fuel' && handled); }
  }
  // deferred evaluations
  const L = s.lessons;
  if (L.pandemic && s.plan['b-pandemic'] !== undefined && t >= s.plan['b-pandemic'] + 2 && !L.pandemic.final) { L.pandemic.final = true; L.pandemic.handled = report.company.cash >= 0; }
  if (L.recovery && !L.recovery.final && s.plan['b-recovery'] !== undefined && t >= s.plan['b-recovery'] + 1) { L.recovery.final = true; const pre = s.history.length > 12 ? s.history[11].aircraft : 0; L.recovery.handled = report.company.fleet >= Math.max(1, pre * 0.7); }
  if (L.interest && !L.interest.final && t >= s.plan['b-rate'] + 1) { L.interest.final = true; const own = s.fleet.filter(a => a.kind === 'own').length; L.interest.handled = own <= Math.ceil(s.fleet.length * 0.5) || report.company.debt < 0.3 * 1e8; }
  if (L.slot && !L.slot.final && s.plan['b-slot'] !== undefined && t >= s.plan['b-slot'] + 1) { L.slot.final = true; const rec = s.notes['ev:b-slot']; const mine = rec && s.routes.find(r => r.city === rec.city); const seatsNow = mine ? mine.weekly * seatsOf(AIRCRAFT[mine.type], s.model) : 0; L.slot.handled = !mine || seatsNow >= (rec.preSeats || 0) * 0.9; }
  if (L.boom && !L.boom.final && s.plan['b-boom'] !== undefined && t >= s.plan['b-boom'] + 3) { L.boom.final = true; const startN = (s.history[s.plan['b-boom']] || {}).aircraft || 0; L.boom.handled = report.company.fleet <= startN + 3; }
  if (L.leaseMarket && !L.leaseMarket.final && s.plan['b-supply'] !== undefined && t >= s.plan['b-supply'] + 2) { L.leaseMarket.final = true; L.leaseMarket.handled = report.company.fleet <= ((s.history[s.plan['b-supply']] || {}).aircraft || report.company.fleet) + 1; }
  if (L.lccEntry && s.notes.entry && !L.lccEntry.final && t >= s.notes.entry.turn + 1) { L.lccEntry.final = true; const r = report.routes.find(x => x.city === s.notes.entry.city); L.lccEntry.handled = L.lccEntry.handled && (!r || r.profit > -0.05 * Math.max(1, r.revenue)); if (!r) L.lccEntry.handled = true; }
  // state-based lessons
  const wb = report.routes.find(r => seatsOf(AIRCRAFT[r.type], s.model) >= 300 && r.lf < 0.6);
  if (wb) { if (!L.widebodyEmpty) L.widebodyEmpty = { seen: t, handled: false, first: t }; L.widebodyEmpty.cond = true; }
  else if (L.widebodyEmpty && L.widebodyEmpty.cond) { L.widebodyEmpty.handled = true; L.widebodyEmpty.cond = false; }
  const fu = report.routes.find(r => r.lf >= 0.85 && r.profit < 0);
  if (fu) { if (!L.fullUnprofitable) L.fullUnprofitable = { seen: t, handled: false, first: t }; L.fullUnprofitable.cond = true; }
  else if (L.fullUnprofitable && L.fullUnprofitable.cond) { L.fullUnprofitable.handled = true; L.fullUnprofitable.cond = false; }
  const hubR = report.routes.find(r => r.transferShare >= 0.08);
  if (hubR && !L.hubEffect) L.hubEffect = { seen: t, handled: true, first: t };
  const idle = report.company.idleAircraft >= 1 || (report.routes.length && report.company.fleet > 0 && rows.reduce((a, r) => a + r.bh, 0) / (report.company.fleet * 7 * ctx.W * 8.5) < 0.55);
  if (idle) { if (!L.utilisation) L.utilisation = { seen: t, handled: false, first: t }; L.utilisation.cond = true; }
  else if (L.utilisation && L.utilisation.cond) { L.utilisation.handled = true; L.utilisation.cond = false; }
  if (s.hedge.frac >= 0.3 && ctx.spot < s.hedge.lock * 0.95 && !L.hedgeCost) L.hedgeCost = { seen: t, handled: true, first: t };
  if (s.notes.priceWarSeen && !L.priceWar) L.priceWar = { seen: t, handled: s.choices['a-lcc'] !== 'fight' && s.choices['b-lcc'] !== 'fight', first: t };
  if (report.routes.some(r => r.rampFactor < 1) && !L.newRoute) L.newRoute = { seen: t, handled: true, first: t };
  if (m.id === 'year' && t === m.modelChoiceTurn && !L.businessModel) L.businessModel = { seen: t, handled: true, first: t };
  if (m.id === 'decade' && t === 0 && !L.businessModel) L.businessModel = { seen: t, handled: true, first: t };
}

// ============================================================ estimate (extra for the UI/bots)
// Steady-state estimate of one isolated route (no transfers, no noise, no ramp-up) using the same engine. Ownership counted as the share of an aircraft used.
export function estimateRoute(state, city, type, weekly, fare = 'mid') {
  const s = state; // read-only use
  if (!CITIES[city] || !AIRCRAFT[type] || city === s.hub) return null;
  const ctx = buildCtx(s, { noise: false });
  const r = { city, type, weekly, fare, age: 9 };
  const trial=s.routes.filter(x=>x.city!==city).concat(r),need=fleetNeeded(s,trial);
  ctx.readiness=fleetReadiness(s,trial,{[type]:Math.max(need[type]||1,fleetCount(s,type))});
  const l = evalLocal(s, ctx, r, { ramp: false });
  const ac = AIRCRAFT[type], d = l.d, W = ctx.W;
  const paxWeek = l.paxB + l.paxL, lf = l.seatsWeek > 0 ? paxWeek / l.seatsWeek : 0;
  const base = refFareMid(d) * plOf(s, CITIES[s.hub], CITIES[city]) * fareLevel(d, s.model) * CONST.fareTier[fare];
  const norm = 1 / (l.b * CONST.segFare.biz + (1 - l.b) * CONST.segFare.lei);
  const anc = ancillaryPerPax(d, s.model);
  const revenue = (l.paxB * base * CONST.segFare.biz * norm + l.paxL * base * CONST.segFare.lei * norm + paxWeek * anc) * W;
  const { c, bh } = costRoute(s, ctx, r, l, paxWeek * W, revenue, 0);
  c.labour+=crewQuote(s,type).monthly*ctx.mpt*(2*weekly*blockHoursFor(ac,d)/crewQuote(s,type).hours)*s.labourMult;
  const frac = 2*weekly*blockHoursFor(ac,d) / weeklyHours(s,type);
  c.ownership = ac.leasePerMonth * ctx.mpt * frac;
  c.overhead += l.technicalCancel*(1-ctx.cancel)*2*weekly*seatsOf(ac,s.model)*W*.78*55;
  const cost = sumCosts(c) + (CONST.overhead.perAircraft * ctx.mpt * frac);
  return { pax: Math.round(paxWeek * W), seats: Math.round(l.seatsWeek * W), lf, revenue: Math.round(revenue), cost: Math.round(cost), profit: Math.round(revenue - cost), technicalCancel:l.technicalCancel, aircraftFraction: frac, marketPaxPerWeek: Math.round(l.M), costs: Object.fromEntries(KEYS.map(k => [k, Math.round(c[k])])) };
}

// ============================================================ end report
// A dispatch board uses forecasts available to the player, never future events or noise.
export function careerBoard(state) {
  if (readCareer(state).active || state.finished || state.gameOver) return [];
  const stamps = readCareer(state).stamps;
  const markets = Object.keys(CITIES).filter(city => city !== state.hub).map(city => ({ city, o: routeOptions(state, city) }))
    .filter(x => x.o.eligibleTypes.length).sort((a, b) => b.o.estMarketPaxPerWeek / Math.sqrt(b.o.distanceKm + 500) - a.o.estMarketPaxPerWeek / Math.sqrt(a.o.distanceKm + 500));
  const pool = new Map();
  const add = x => { if (x) pool.set(x.city, x); };
  markets.filter(x => !stamps[x.city]).slice(0, 20).forEach(add);
  markets.filter(x => x.o.rivalsOnRoute > 0).forEach(add);
  // Include new regions even when their markets are smaller than the nearest cities.
  for (const region of new Set(markets.map(x => CITIES[x.city].region))) markets.filter(x => !stamps[x.city] && CITIES[x.city].region === region).slice(0, 2).forEach(add);
  const candidates = [...pool.values()].map(({ city, o }) => {
    const types = o.eligibleTypes;
    const rivalSeats = o.rivals.reduce((n, r) => n + r.weekly * 2 * (r.kind === 'lcc' ? 186 : 168), 0);
    let best = null, rivalBest = null;
    for (const type of types) for (const weekly of [1, 2, 3, 5, 7, 10, 14].filter(w => w <= o.maxWeekly)) for (const fare of ['mid', 'high']) {
      const trial = state.routes.filter(r=>r.city!==city).concat({city,type,weekly,fare}), capacity=routeCapacity(state,trial), limits=fleetLimits(state);
      const missing=Object.values(capacity.missing).reduce((n,v)=>n+v,0);
      if (capacity.routeLimit || missing>limits.ordersLeft || limits.committed+missing>limits.maxFleet || (missing && state.turn>=modeOf(state).turns-2)) continue;
      const e = estimateRoute(state, city, type, weekly, fare);
      // An isolated contract must cover whole aircraft and company overhead, not just pro-rata flight costs.
      const frac=e.aircraftFraction,n=Math.ceil(frac-1e-9),mpt=modeOf(state).monthsPerTurn;
      const overhead=(CONST.overhead.base+CONST.overhead.perAircraft*n)*(state.model==='lcc'?CONST.lcc.overheadMult:1);
      const profit=e.profit-((n-frac)*AIRCRAFT[type].leasePerMonth+overhead-CONST.overhead.perAircraft*frac)*mpt;
      if (!best || profit > best.profit) best = { city, profit, pax: e.pax, plan: { city, type, weekly, fare } };
      if (rivalSeats > 0 && weekly * 2 * AIRCRAFT[type].seats[state.model] >= rivalSeats * .7 && (!rivalBest || profit > rivalBest.profit)) rivalBest = { profit, plan: { city, type, weekly, fare } };
    }
    const waitTurns=plan=>{
      if(!plan||routeCapacity(state,state.routes.filter(r=>r.city!==city).concat(plan)).fits)return 0;
      const trial=state.routes.filter(r=>r.city!==city).concat(plan),capacity=routeCapacity(state,trial);
      const waitFor=(count,orders,fallback)=>count?Array.from({length:count},(_,i)=>orders.slice().sort((a,b)=>a.readyTurn-b.readyTurn)[i]?.readyTurn-state.turn||fallback).reduce((n,t)=>Math.max(n,t),0):0;
      return Math.max(waitFor(capacity.missing[plan.type]||0,(state.fleetOrders||[]).filter(o=>o.type===plan.type),aircraftQuote(state,plan.type).deliveryTurns),
        waitFor(capacity.crewMissing[plan.type]||0,(state.crewOrders||[]).filter(o=>o.type===plan.type),crewQuote(state,plan.type).trainingTurns));
    };
    return { ...best, waitTurns:waitTurns(best?.plan), rivalWaitTurns:waitTurns(rivalBest?.plan), rivalSeats, rivalPlan: rivalBest?.profit > 0 ? rivalBest.plan : null };
  }).filter(c=>c.plan).sort((a, b) => b.profit - a.profit);
  const ready = candidates.filter(c=>c.profit>0&&routeCapacity(state,state.routes.filter(r=>r.city!==c.city).concat(c.plan)).fits);
  return missionOffers(state, ready.length>=2 ? ready : candidates);
}

export function endReport(state) {
  const s = state;
  const rev = s.totals.revenue, marginTotal = rev > 1 ? clamp(s.totals.profit / rev, -9.99, 9.99) : -1;
  const stats = Object.values(s.routeStats).filter(x => x.turns > 0);
  const rank = [...stats].sort((a, b) => b.profit - a.profit);
  const mkR = x => x && ({ city: x.city, zh: CITIES[x.city].zh, en: CITIES[x.city].en, profit: Math.round(x.profit), revenue: Math.round(x.revenue), turns: x.turns, reasonZh: x.lastReasonZh, reasonEn: x.lastReasonEn });
  const seen = Object.keys(s.lessons).filter(k => s.lessons[k].seen !== undefined && LESSONS[k]), handled = seen.filter(k => s.lessons[k].handled === true);
  // lessons that can occur in this mode but never did this game (shown separately, never as "handled")
  const modeEventLessons = new Set(EVENTS.filter(e => e.modes.includes(s.mode) && e.lesson).map(e => e.lesson)), otherModeOnly = new Set(EVENTS.filter(e => e.lesson && !e.modes.includes(s.mode)).map(e => e.lesson));
  const unseen = Object.keys(LESSONS).filter(k => !seen.includes(k) && (modeEventLessons.has(k) || !otherModeOnly.has(k)));
  const bankrupt = !!(s.gameOver && s.gameOver.reason === 'bankrupt');
  let gradeZh, gradeEn;
  const lossPct = Math.max(0.1, Math.round(-marginTotal * 1000) / 10).toFixed(1);
  const losers = stats.filter(x => x.profit < 0).length;
  if (bankrupt) { gradeZh = '破產：現金耗盡'; gradeEn = 'Bankrupt: cash ran out'; }
  else if (!stats.length && rev <= 1) { gradeZh = '沒有開航線：飛機停在地上，租金和管理費照付'; gradeEn = 'No routes flown: idle aircraft still cost their lease and overhead'; }
  else if (marginTotal >= 0.06) { gradeZh = '優等：淨利率明顯高於產業平均'; gradeEn = 'Distinction: net margin well above the industry average'; }
  else if (marginTotal >= CONST.industryMargin) { gradeZh = '良好：淨利率達到產業平均'; gradeEn = 'Good: net margin at or above the industry average'; }
  else if (marginTotal >= 0) { gradeZh = '及格：有賺錢，但低於產業平均'; gradeEn = 'Pass: profitable, but below the industry average'; }
  else if (marginTotal >= -0.1) { gradeZh = `虧損：整體虧損 ${lossPct}%，成本高過收入`; gradeEn = `Loss-making: overall loss of ${lossPct}%, costs exceeded revenue`; }
  else if (losers * 2 > stats.length) { gradeZh = `嚴重虧損：整體虧損 ${lossPct}%，多數航線賠錢`; gradeEn = `Heavy losses: overall loss of ${lossPct}%, most routes lost money`; }
  else { gradeZh = `嚴重虧損：整體虧損 ${lossPct}%，賺錢的航線補不回固定成本`; gradeEn = `Heavy losses: overall loss of ${lossPct}%, profitable routes could not cover fixed costs`; }
  const tz = [], te = [];
  const add = (z, e) => { tz.push(z); te.push(e); };
  if (!s.usedLcc && s.model === 'fsc') add('這次走傳統航空。換成廉價航空再玩一次，看座位密度、輔助收入和低成本怎麼改變每條航線的損益。', 'You ran a full-service airline. Replay as a low-cost carrier and see how dense seating, ancillaries and lower costs change each route.');
  if (s.usedLcc || s.model === 'lcc') add('這次試了廉價航空。換回傳統航空，看看商務客和轉機旅客能帶來多少收入。', 'You tried low-cost. Switch to full-service and see how much business and connecting passengers add.');
  if (!s.everHedged) add('這次完全沒有避險。下次在油價警訊出現時鎖定五成以上，比較差別。', 'You never hedged. Next time lock in half or more when the fuel warning appears and compare.');
  for (const k of seen) if (!s.lessons[k].handled && LESSONS[k]) add(`「${LESSONS[k].zh}」這次沒處理好：${LESSONS[k].explainZh}`, `“${LESSONS[k].en}” was not handled well: ${LESSONS[k].explainEn}`);
  add(`換一個樞紐（${HUBS.filter(h => h !== s.hub).map(h => CITIES[h].zh).slice(0, 2).join('、')}）再玩一次，看市場大小與成本水準怎麼改變最適合的航線組合。`, `Try another hub (${HUBS.filter(h => h !== s.hub).map(h => CITIES[h].en).slice(0, 2).join(', ')}) and see how market size and cost level change the best network.`);
  return {
    marginTotal, industryMargin: CONST.industryMargin, cash: Math.round(s.cash), revenue: Math.round(rev), profit: Math.round(s.totals.profit),
    bestRoute: mkR(rank[0]), worstRoute: mkR(rank[rank.length - 1]), lessonsSeen: seen, lessonsHandled: handled, lessonsUnseen: unseen,
    gradeZh, gradeEn, replayTipsZh: tz, replayTipsEn: te, bankrupt, turnsPlayed: s.history.length
  };
}

// ============================================================ persistence
export function serialize(state) { return JSON.stringify(state); }
export function deserialize(str) {
  const o = JSON.parse(str);
  if (!o || o.v !== 1 || !MODES[o.mode] || !Object.hasOwn(CITIES, o.hub)) throw new Error('bad save');
  o.facilities ||= {}; o.marketSupply ||= {}; o.reserve ||= { kg: 0, unitPrice: 0 }; o.scenario ||= 'free';
  o.fleetOrders ||= []; o.nextOrder ||= 1; o.orderTurn ??= -1; o.orderedThisTurn ??= 0;
  o.maintenance ||= {}; o.fleetCondition ||= {}; o.facilityOrders ||= [];
  ensureManagement(o);
  o.marketRivalBase ||= newGame({ mode: o.mode, hub: o.hub, seed: o.seed }).marketRivalBase;
  o.career = readCareer(o);
  return o;
}

export { CITIES, AIRCRAFT, MODES, HUBS, EVENTS, LESSONS };
export const _internals = { pairBase, bizShare, dist, maxHours, seatsOf, fareLevel, ancillaryPerPax, buildCtx, evalLocal };
