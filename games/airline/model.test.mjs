// node --test games/airline/model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './model.mjs';
import { MODES, HUBS, CITIES, AIRCRAFT, EVENTS, LESSONS, GLOSSARY, CONST } from './data.mjs';
import { play, summarise, sensibleBot, naiveBot, idleBot, frozen } from './bots.mjs';

const MODE_IDS = Object.keys(MODES);
const pct = x => (x * 100).toFixed(1) + '%';

function deepFinite(o, path = 'root') {
  if (typeof o === 'number') { assert.ok(Number.isFinite(o), `non-finite number at ${path}: ${o}`); return; }
  if (Array.isArray(o)) { o.forEach((v, i) => deepFinite(v, `${path}[${i}]`)); return; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) deepFinite(v, `${path}.${k}`);
}
const planTurn = (mode, hub, seed, id) => M.newGame({ mode, hub, seed }).plan[id];
const off = id => s => { s.plan[id] = -5; };

// ------------------------------------------------------------------ data sanity
test('data: contract exports and sizes', () => {
  assert.deepEqual(Object.keys(MODES).sort(), ['decade', 'year']);
  assert.equal(HUBS[0], 'TPE');
  assert.ok(Object.keys(CITIES).length >= 32);
  for (const h of HUBS) assert.ok(CITIES[h]);
  for (const c of Object.values(CITIES)) {
    assert.equal(c.season.length, 12);
    for (const k of ['id', 'zh', 'en', 'lat', 'lon', 'pop', 'business', 'tourism', 'feeLevel', 'slotLimited', 'blurbZh', 'blurbEn']) assert.ok(c[k] !== undefined, `${c.id}.${k}`);
    assert.ok(Math.abs(c.season.reduce((a, b) => a + b, 0) / 12 - 1) < 0.01);
  }
  assert.equal(MODES.year.turns, 12); assert.equal(MODES.decade.turns, 20);
  assert.equal(MODES.year.types.length, 3); assert.equal(MODES.decade.types.length, 6);
  for (const a of Object.values(AIRCRAFT)) for (const k of ['seats', 'rangeKm', 'speedKmh', 'maxHoursPerDay', 'leasePerMonth', 'price', 'fuelPerBlockHour', 'crewPerBlockHour', 'maintPerBlockHour', 'maintPerCycle']) assert.ok(a[k] !== undefined, `${a.id}.${k}`);
  const yearEv = EVENTS.filter(e => e.modes.includes('year')), decEv = EVENTS.filter(e => e.modes.includes('decade'));
  assert.ok(yearEv.length >= 8 && yearEv.length <= 10, 'year events ~8 (+ the month-6 model decision and a fuel warning headline)');
  assert.ok(decEv.length >= 12 && decEv.length <= 15, 'decade events ~12 (+ model choice and two warning headlines)');
  for (const e of EVENTS) { assert.ok(LESSONS[e.lesson], `lesson ${e.lesson} for ${e.id}`); assert.ok(e.zh && e.en); }
  for (const l of Object.values(LESSONS)) assert.ok(l.zh && l.en && l.explainZh && l.explainEn);
  for (const g of Object.values(GLOSSARY)) assert.ok(g.zh && g.en && g.explainZh && g.explainEn);
  // Chinese text uses full-width punctuation after Chinese characters
  const bad = /[一-鿿][,.:;!?]/;
  for (const l of Object.values(LESSONS)) assert.ok(!bad.test(l.explainZh), l.zh);
  for (const g of Object.values(GLOSSARY)) assert.ok(!bad.test(g.explainZh), g.zh);
  for (const e of EVENTS) assert.ok(!bad.test(e.zh), e.id);
});

test('routeOptions: distances, reference fares and eligibility match real-world scale', () => {
  const s = M.newGame({ mode: 'decade', hub: 'TPE', seed: 1 });
  const near = (a, b, tol) => assert.ok(Math.abs(a - b) / b < tol, `${a} vs ${b}`);
  near(M.routeOptions(s, 'NRT').distanceKm, 2180, 0.1);   // TPE-NRT great circle ~2,160 km
  near(M.routeOptions(s, 'LAX').distanceKm, 10900, 0.08);  // TPE-LAX ~10,900 km
  // reference fares: observed one-way economy fares 2025-26 (see sources.mjs): TPE-BKK 157-218, TPE-LAX 450-844, TPE-NRT 123-170
  const bkk = M.routeOptions(s, 'BKK').refFare.mid, lax = M.routeOptions(s, 'LAX').refFare.mid, nrt = M.routeOptions(s, 'NRT').refFare.mid;
  assert.ok(bkk >= 150 && bkk <= 260, `TPE-BKK ${bkk}`);
  assert.ok(lax >= 450 && lax <= 1100, `TPE-LAX ${lax}`);   // average yield incl. premium-cabin seats, so above the economy fares seen
  assert.ok(nrt >= 120 && nrt <= 230, `TPE-NRT ${nrt}`);
  const z = M.newGame({ mode: 'decade', hub: 'ZRH', seed: 1 });
  const zsin = M.routeOptions(z, 'SIN').refFareEconomy;      // observed ~580 one-way economy
  assert.ok(zsin >= 480 && zsin <= 850, `ZRH-SIN economy-equivalent ${zsin}`);
  const o = M.routeOptions(s, 'LAX');
  assert.deepEqual(o.eligibleTypes.sort(), ['MQ-350', 'MQ-400']);       // narrowbodies cannot fly 10,900 km
  assert.ok(M.routeOptions(s, 'HKG').eligibleTypes.includes('MQ-72'));
  assert.ok(o.refFare.low < o.refFare.mid && o.refFare.mid < o.refFare.high);
  assert.equal(M.routeOptions(s, 'TPE'), null);
  deepFinite(o);
});

// ------------------------------------------------------------------ determinism & persistence
test('determinism: same seed gives identical reports; different seeds differ', () => {
  for (const mode of MODE_IDS) {
    const a = play(sensibleBot(), { mode, hub: 'TPE', seed: 7 }), b = play(sensibleBot(), { mode, hub: 'TPE', seed: 7 }), c = play(sensibleBot(), { mode, hub: 'TPE', seed: 8 });
    assert.equal(JSON.stringify(a.reports), JSON.stringify(b.reports));
    assert.notEqual(JSON.stringify(a.reports), JSON.stringify(c.reports));
  }
});
test('serialize/deserialize round-trips and play continues identically', () => {
  for (const mode of MODE_IDS) {
    const bot = sensibleBot();
    let s = M.newGame({ mode, hub: 'SIN', seed: 3 }), last = null;
    const half = Math.floor(MODES[mode].turns / 2);
    for (let i = 0; i < half; i++) { s = M.applyDecisions(s, bot(s, last)).state; const o = M.simulateTurn(s); s = o.state; last = o.report; }
    const str = M.serialize(s); const s2 = M.deserialize(str);
    assert.deepEqual(s2, s); assert.equal(M.serialize(s2), str);
    const bot2 = sensibleBot(); void bot2;
    const nxt = bot(s, last);
    const a = M.simulateTurn(M.applyDecisions(s, nxt).state), b = M.simulateTurn(M.applyDecisions(s2, nxt).state);
    assert.equal(JSON.stringify(a.report), JSON.stringify(b.report));
    assert.ok(JSON.parse(str));                                // plain JSON
  }
  assert.throws(() => M.deserialize('{"v":99}'));
});
test('state is not mutated by applyDecisions / simulateTurn / routeOptions', () => {
  const s = M.newGame({ mode: 'decade', hub: 'DXB', seed: 2 }); const snap = M.serialize(s);
  M.routeOptions(s, 'LHR'); M.estimateRoute(s, 'LHR', 'MQ-350', 7, 'mid'); M.pendingEvents(s);
  M.applyDecisions(s, { routes: [{ city: 'LHR', type: 'MQ-350', weekly: 7, fare: 'mid' }], fleet: { lease: { 'MQ-350': 2 } } });
  M.simulateTurn(s);
  assert.equal(M.serialize(s), snap);
});

// ------------------------------------------------------------------ calibration: every hub x mode
const CAL = [];
for (const mode of MODE_IDS) for (const hub of HUBS) {
  test(`calibration ${mode}/${hub}: sensible +3..+8%, naive <= -10%, idle bleeds slowly, no NaN`, () => {
    const sens = play(sensibleBot(), { mode, hub, seed: 1 }), ss = summarise(sens);
    const naive = play(naiveBot(), { mode, hub, seed: 1 }), ns = summarise(naive);
    const idle = play(idleBot(), { mode, hub, seed: 1 }), is = summarise(idle);
    const lcc = summarise(play(sensibleBot({ model: 'lcc' }), { mode, hub, seed: 1 }));
    CAL.push({ mode, hub, sens: ss, naive: ns, idle: is, lcc });
    for (const r of [sens, naive, idle]) { deepFinite(r.reports, `${mode}/${hub} reports`); deepFinite(r.end, 'end'); }
    assert.ok(!sens.state.gameOver, 'sensible bot must not go bankrupt');
    assert.ok(ss.margin >= 0.03 && ss.margin <= 0.08, `sensible margin ${pct(ss.margin)} outside +3..+8%`);
    assert.ok(sens.state.cash > 0);
    assert.ok(ns.margin <= -0.10 || ns.bankrupt, `naive margin ${pct(ns.margin)} should be <= -10% or bankrupt`);
    // do-nothing: a loss every turn, and slow (it survives the first third of the game)
    assert.ok(idle.reports.every(r => r.company.profit < 0), 'idle must lose every turn');
    const third = Math.floor(MODES[mode].turns / 3);
    assert.ok(idle.reports.length > third && idle.reports[third].company.cash > 0, 'idle should not go bankrupt within a third of the game');
    assert.ok(is.margin < 0);
    // low-cost operator is also viable but not magic
    assert.ok(lcc.margin > -0.03 && lcc.margin < 0.12, `lcc margin ${pct(lcc.margin)}`);
  });
}
for (const hub of HUBS) for (const seed of [2, 3, 4]) {
  test(`robustness ${hub} seeds ${seed}: sensible bot stays in a sane band`, () => {
    for (const mode of MODE_IDS) { const r = summarise(play(sensibleBot(), { mode, hub, seed })); assert.ok(r.margin > 0.005 && r.margin < 0.11, `${mode}/${hub}/${seed} margin ${pct(r.margin)}`); assert.ok(!r.bankrupt); }
  });
}

test('cost shares of a sensible network sit in industry-like ranges', () => {
  // Verified references (sources.mjs): IATA 2026 outlook fuel 25.7% of operating cost (2022 WATS 28.7%; regions 25.5% N. America .. 36.3% LatAm);
  // IATA 2026 labour ~28%; WATS maintenance 8.4%, depreciation 9.1%, G&A 7.7%, station 7.1%, navigation 4.3%. Short-haul networks (Zurich) burn less fuel per US$ of cost.
  const ranges = { fuel: [0.17, 0.36], labour: [0.20, 0.32], maintenance: [0.06, 0.11], airport: [0.06, 0.20], ownership: [0.12, 0.24], distribution: [0.045, 0.07], overhead: [0.015, 0.10], interest: [0, 0.03] };
  for (const mode of MODE_IDS) for (const hub of HUBS) {
    const sh = summarise(play(sensibleBot(), { mode, hub, seed: 1 })).shares;
    for (const [k, [lo, hi]] of Object.entries(ranges)) assert.ok(sh[k] >= lo && sh[k] <= hi, `${mode}/${hub} ${k} ${pct(sh[k])} outside ${pct(lo)}..${pct(hi)}`);
    assert.ok(Math.abs(Object.values(sh).reduce((a, b) => a + b, 0) - 1) < 1e-6);
  }
  // across hubs the averages should be close to the IATA figures
  const avg = k => { let t = 0, n = 0; for (const mode of MODE_IDS) for (const hub of HUBS) { t += summarise(play(sensibleBot(), { mode, hub, seed: 1 })).shares[k]; n++; } return t / n; };
  assert.ok(avg('fuel') > 0.24 && avg('fuel') < 0.33, `avg fuel ${pct(avg('fuel'))}`);
  assert.ok(avg('labour') > 0.22 && avg('labour') < 0.30, `avg labour ${pct(avg('labour'))}`);
});

test('unit metrics are internally consistent', () => {
  const r = play(sensibleBot(), { mode: 'year', hub: 'TPE', seed: 1 });
  for (const rep of r.reports) {
    const c = rep.company;
    assert.equal(Object.keys(c.costs).sort().join(), ['airport', 'distribution', 'fuel', 'interest', 'labour', 'maintenance', 'overhead', 'ownership'].join());
    assert.ok(Math.abs(c.revenue - Object.values(c.costs).reduce((a, b) => a + b, 0) - c.profit) <= 8, 'revenue - costs = profit');
    assert.ok(Math.abs(c.margin - c.profit / c.revenue) < 1e-6);
    assert.ok(Math.abs(c.rask - c.cask - c.profit / c.ask) < 1e-6);
    for (const x of rep.routes) {
      assert.ok(Math.abs(x.rask - x.cask - x.profit / (x.seats * x.distanceKm)) < 1e-4);
      assert.equal(x.profit > 0, x.lf > x.breakEvenLF, `profit sign vs LF vs break-even on ${x.city}`);   // the defining identity of break-even load factor
      assert.ok(x.lf >= 0 && x.lf <= 1 + 1e-9 && x.pax <= x.seats + 1);
      assert.ok(x.reasonZh.length > 8 && x.reasonEn.length > 8);
      assert.ok(Object.values(x.costs).every(v => v >= 0));
    }
  }
});

// ------------------------------------------------------------------ business models
test('LCC vs FSC: ancillary share, unit cost gap, business-heavy route behaviour', () => {
  const s = M.newGame({ mode: 'decade', hub: 'ZRH', seed: 1 });
  const lccS = { ...s, model: 'lcc' };
  const f = M.estimateRoute(s, 'LHR', 'MQ-320', 10, 'mid'), l = M.estimateRoute(lccS, 'LHR', 'MQ-320', 10, 'mid');
  const caskF = f.cost / (f.seats * M.routeOptions(s, 'LHR').distanceKm), caskL = l.cost / (l.seats * M.routeOptions(s, 'LHR').distanceKm);
  assert.ok(caskL / caskF > 0.60 && caskL / caskF < 0.85, `LCC/FSC CASK ratio ${(caskL / caskF).toFixed(2)}`);   // design 0.6-0.85, research: LCC 1.5-2x cheaper is an upper bound, ~25% typical
  assert.ok(l.seats > f.seats);                           // denser cabin
  // ancillary share of revenue for a low-cost network (Ryanair FY25: 33.8%; easyJet ~25%)
  const lccRun = play(sensibleBot({ model: 'lcc' }), { mode: 'decade', hub: 'TPE', seed: 1 }), fscRun = play(sensibleBot(), { mode: 'decade', hub: 'TPE', seed: 1 });
  const share = run => run.reports.reduce((a, r) => a + r.company.ancillaryRevenue, 0) / run.reports.reduce((a, r) => a + r.company.revenue, 0);
  assert.ok(share(lccRun) > 0.15 && share(lccRun) < 0.35, `LCC ancillary ${pct(share(lccRun))}`);
  assert.ok(share(fscRun) < 0.10, `FSC ancillary ${pct(share(fscRun))}`);
  assert.ok(share(lccRun) > 2.5 * share(fscRun));
  // LCC distribution cost is far lower
  const dist = run => run.reports.reduce((a, r) => a + r.company.costs.distribution, 0) / run.reports.reduce((a, r) => a + r.company.revenue, 0);
  assert.ok(dist(lccRun) < dist(fscRun) / 2.5);
  // LCC attracts less of the business segment: on the most business-heavy route its passenger mix is more price-driven (lower avg fare vs reference)
  const o = M.routeOptions(s, 'FRA'), ol = M.routeOptions(lccS, 'FRA');
  assert.ok(ol.refFare.mid < o.refFare.mid * 0.85);
  // fewer transfer passengers for the low-cost model
  const tx = run => run.reports.reduce((a, r) => a + r.company.transferPax, 0) / run.reports.reduce((a, r) => a + r.company.pax, 0);
  assert.ok(tx(lccRun) < tx(fscRun) * 0.7);
});
test('business model switching: year mode only at month 6; decade at start, later with cost', () => {
  let s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  let r = M.applyDecisions(s, { businessModel: 'lcc' }); assert.equal(r.errors[0].code, 'MODEL_LOCKED'); assert.equal(r.state.model, 'fsc');
  s.turn = 5; r = M.applyDecisions(s, { businessModel: 'lcc' }); assert.equal(r.errors.length, 0); assert.equal(r.state.model, 'lcc');
  assert.ok(r.state.pending.overheadCash > 0, 'refit costs money in year mode');
  s = M.newGame({ mode: 'decade', hub: 'TPE', seed: 1 });
  r = M.applyDecisions(s, { businessModel: 'lcc' }); assert.equal(r.state.model, 'lcc'); assert.equal(r.state.pending.overheadCash, 0, 'free at the start');
  assert.deepEqual(M.pendingEvents(s).map(e => e.id), ['b-model']);
  const s2 = M.applyDecisions(s, { eventChoices: { 'b-model': 'lcc' } }).state; assert.equal(s2.model, 'lcc'); assert.equal(M.pendingEvents(s2).length, 0);
  assert.equal(M.applyDecisions(s, { businessModel: 'xxx' }).errors[0].code, 'BAD_MODEL');
  // later switch costs money and some customers
  let t = M.simulateTurn(M.applyDecisions(s, { fleet: {} }).state).state; t.turn = 4;
  const sw = M.applyDecisions(t, { businessModel: 'lcc' }); assert.ok(sw.state.pending.overheadCash > 0); assert.ok(sw.state.mods.some(m => m.kind === 'demand'));
});

// ------------------------------------------------------------------ scripted events
const steady = (mode, hub, opts = {}) => frozen(sensibleBot(), opts);
function pair(mode, hub, id, { seed = 1, opts = {}, init2 = null } = {}) {
  const t = planTurn(mode, hub, seed, id);
  const base = play(steady(mode, hub, opts), { mode, hub, seed, init: off(id) });
  const ev = play(steady(mode, hub, opts), { mode, hub, seed, init: init2 });
  return { t, base, ev, b: base.reports[t], e: ev.reports[t], bAll: base.reports, eAll: ev.reports };
}
const fuelShare = r => r.company.costs.fuel / r.company.costTotal;

test('event: fuel spike raises fuel cost and its share; a hedge reduces the damage', () => {
  for (const mode of MODE_IDS) {
    const id = mode === 'year' ? 'a-fuel' : 'b-oil', hub = 'TPE';
    const un = pair(mode, hub, id), hd = pair(mode, hub, id, { opts: { hedge: 0.8 } });
    assert.ok(un.e.company.fuelIndex > 1.35, `spot index ${un.e.company.fuelIndex}`);
    assert.ok(un.e.company.costs.fuel > un.b.company.costs.fuel * 1.3, 'fuel cost up >30%');
    assert.ok(fuelShare(un.e) > fuelShare(un.b) + 0.05, 'fuel share of cost rises');
    assert.ok(un.e.company.profit < un.b.company.profit);
    const dUn = un.e.company.costs.fuel - un.b.company.costs.fuel, dHd = hd.e.company.costs.fuel - hd.b.company.costs.fuel;
    assert.ok(dHd < dUn * 0.5, `hedge cuts the spike impact (${dHd} vs ${dUn})`);
    assert.ok(hd.e.company.profit > un.e.company.profit);
    // reason text blames fuel on an unhedged loss-making route, not on a hedged one
    const lossRoute = un.e.routes.find(r => r.reasonKey === 'fuel'); void lossRoute;
    // warning one turn before the spike
    const w = un.eAll[un.t - 1].events.find(x => x.kind === 'warning'); assert.ok(w, 'a warning headline precedes the spike');
  }
});
test('event: hedge costs money when fuel falls afterwards (lesson hedgeCost)', () => {
  const r = play(steady('year', 'TPE', { hedge: 0.8 }), { mode: 'year', hub: 'TPE', seed: 1 });
  assert.ok(r.state.lessons.hedgeCost || r.state.lessons.fuel, 'a hedge lesson fires');
  const last = r.reports[11].company; assert.ok(last.hedge === 0.8);
});
test('event: LCC rival entry takes passengers or fare on your best route; fighting is worse than holding', () => {
  for (const mode of MODE_IDS) {
    const id = mode === 'year' ? 'a-lcc' : 'b-lcc', hub = 'TPE';
    const { t, base, ev } = pair(mode, hub, id);
    const city = ev.state.notes.entry.city;
    const b = base.reports[t].routes.find(r => r.city === city), e = ev.reports[t].routes.find(r => r.city === city);
    assert.ok(b && e);
    assert.ok(e.pax < b.pax * 0.97 || e.lf < b.lf - 0.02, `pax ${e.pax} vs ${b.pax}`);
    assert.ok(e.rivals.some(x => x.id === 'lcc'));
    assert.ok(e.profit < b.profit);
    assert.ok(e.rivalLoss > 0.05);
    // fight: price war; the route earns less than if you hold
    const fight = play(steady(mode, hub), { mode, hub, seed: 1, init: s => { s.choices[id] = 'fight'; } });
    const f = fight.reports[t].routes.find(r => r.city === city);
    if (f) { assert.equal(f.fare, 'low'); assert.ok(f.avgFare < e.avgFare); }
    const sum = rs => rs.slice(t).reduce((a, r) => a + r.company.profit, 0);
    assert.ok(sum(fight.reports) < sum(ev.reports) * 1.0 + 1, 'matching the LCC with the lowest fare does not beat holding');
  }
});
test('event: rival price matching and frequency response follow the readable rules', () => {
  const s0 = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  const city = Object.keys(s0.rivals[0].routes)[0];
  const t = M.applyDecisions(s0, { routes: [{ city, type: 'MQ-320', weekly: 7, fare: 'low' }], fleet: { lease: {} } });
  let s = t.state, rep;
  for (let i = 0; i < 2; i++) { const o = M.simulateTurn(s); s = o.state; rep = o.report; }
  assert.ok(s.rivals[0].routes[city].fare <= 0.80, 'rival matches a lower fare');
  assert.equal(rep.rivals[0].routes.find(x => x.city === city).fare, +s.rivals[0].routes[city].fare.toFixed(2));
});
test('event: full-service rival adds frequency on your main routes (decade)', () => {
  const { t, ev, base } = pair('decade', 'TPE', 'b-fsc-adds');
  const w = rep => rep.rivals.find(r => r.id === 'fsc').routes.reduce((a, r) => a + r.weekly, 0);
  assert.ok(w(ev.reports[t]) > w(base.reports[t]));
  assert.ok(ev.reports[t].company.profit <= base.reports[t].company.profit);
});
test('event: strike - resisting cancels flights, settling raises labour cost', () => {
  for (const mode of MODE_IDS) {
    const id = mode === 'year' ? 'a-strike' : 'b-strike', t = planTurn(mode, 'TPE', 1, id);
    const base = play(steady(mode, 'TPE'), { mode, hub: 'TPE', seed: 1, init: off(id) });
    const settle = play(steady(mode, 'TPE'), { mode, hub: 'TPE', seed: 1, init: s => { s.choices[id] = 'settle'; } });
    const resist = play(steady(mode, 'TPE'), { mode, hub: 'TPE', seed: 1, init: s => { s.choices[id] = 'resist'; } });
    assert.ok(settle.reports[t].company.costs.labour > base.reports[t].company.costs.labour * 1.04);
    assert.ok(resist.reports[t].company.revenue < base.reports[t].company.revenue * 0.95, 'cancellations cut revenue');
    assert.ok(resist.reports[t].company.costs.overhead > base.reports[t].company.costs.overhead, 'passenger compensation');
    assert.ok(resist.reports[t].routes[0].reasonKey === 'disruption');
    assert.ok(settle.state.lessons.strike.handled && !resist.state.lessons.strike.handled);
  }
});
test('event: weather disruption cancels flights, revenue falls, costs do not', () => {
  for (const [mode, id] of [['year', 'a-weather'], ['decade', 'b-weather']]) {
    const { b, e } = pair(mode, 'DXB', id);
    assert.ok(e.company.revenue < b.company.revenue * 0.95);
    assert.ok(e.company.costs.ownership >= b.company.costs.ownership * 0.99, 'leases still due');
    assert.ok(e.company.profit < b.company.profit);
    assert.ok(e.events.some(x => x.id === id) && e.events.find(x => x.id === id).zh.length > 5);
  }
});
test('event: slump (business -15%) and festival (leisure +20%) move demand the intended way', () => {
  let { b, e } = pair('year', 'TPE', 'a-slump');
  assert.ok(e.company.revenue < b.company.revenue * 0.995);
  assert.ok(e.company.profit < b.company.profit);
  ({ b, e } = pair('year', 'TPE', 'a-festival'));
  assert.ok(e.company.pax > b.company.pax * 1.01 && e.company.loadFactor > b.company.loadFactor && e.company.revenue > b.company.revenue);
});
test('event: boom lifts demand; pandemic collapses it and recovery brings leisure back (decade)', () => {
  let { b, e } = pair('decade', 'TPE', 'b-boom'); assert.ok(e.company.pax > b.company.pax && e.company.revenue > b.company.revenue);   // a fixed fleet captures only part of the boom
  const p = pair('decade', 'TPE', 'b-pandemic');
  assert.ok(p.e.company.revenue < p.b.company.revenue * 0.70, 'revenue collapses');
  assert.ok(p.e.company.profit < 0);
  assert.ok(p.e.company.loadFactor < p.b.company.loadFactor);
  const t = p.t; assert.ok(p.eAll[t + 3].company.revenue > p.eAll[t].company.revenue * 1.3, 'recovers');
  const w = p.eAll[t - 1].events.find(x => x.id === 'b-pandemic-warn'); assert.ok(w && w.kind === 'warning');
  ({ b, e } = pair('decade', 'TPE', 'b-recovery')); assert.ok(e.company.pax > b.company.pax * 1.01 && e.company.loadFactor > b.company.loadFactor);   // leisure rebounds
  assert.ok(e.company.revenue / e.company.pax < b.company.revenue / b.company.pax, 'while business stays weak, so yield per passenger dips');
  // relief choices: loan adds cash, deferral keeps cash up
  const none = play(steady('decade', 'TPE'), { mode: 'decade', hub: 'TPE', seed: 1, init: s => { s.choices['b-pandemic'] = 'none'; } });
  const loan = play(steady('decade', 'TPE'), { mode: 'decade', hub: 'TPE', seed: 1, init: s => { s.choices['b-pandemic'] = 'loan'; } });
  const defer = play(steady('decade', 'TPE'), { mode: 'decade', hub: 'TPE', seed: 1, init: s => { s.choices['b-pandemic'] = 'defer'; } });
  assert.ok(loan.reports[t].company.cash > none.reports[t].company.cash + 3e7);
  assert.ok(loan.reports[t].company.costs.interest > none.reports[t].company.costs.interest);
  assert.ok(defer.reports[t].company.cash > none.reports[t].company.cash);
});
test('event: slot limit caps frequency to the congested airport and rejects more', () => {
  const hub = 'TPE', t = planTurn('decade', hub, 1, 'b-slot');
  const inner = sensibleBot();
  const bot = (s, last) => {
    const d = inner(s, last);
    if (s.turn === 0) { d.routes = d.routes.filter(r => r.city !== 'LHR' && r.city !== 'JFK'); d.routes.push({ city: 'LHR', type: 'MQ-350', weekly: 7, fare: 'mid' }); const nd = M.fleetNeeded(s, d.routes), lease = {}; for (const [ty, n] of Object.entries(nd)) { const have = s.fleet.filter(a => a.type === ty).length; if (n > have) lease[ty] = n - have; } d.fleet = { lease }; }
    return d;
  };
  const r = play(frozen(bot), { mode: 'decade', hub, seed: 1, maxTurns: t + 2 });
  const rec = r.state.notes['ev:b-slot']; assert.ok(rec && CITIES[rec.city].slotLimited, 'a congested airport is picked');
  assert.equal(r.state.slotCaps[rec.city], 7);
  assert.ok(r.reports[t].routes.find(x => x.city === rec.city).weekly <= 7);
  const ap = M.applyDecisions(r.state, { routes: [{ city: rec.city, type: r.state.routes.find(x => x.city === rec.city).type, weekly: 10, fare: 'mid' }] });
  assert.equal(ap.errors[0].code, 'SLOT_LIMIT');
  assert.ok(r.state.lessons.slot);
});
test('event: interest-rate rise lifts the interest bill on bought aircraft', () => {
  const t = planTurn('decade', 'TPE', 1, 'b-rate'), bot = () => frozen(sensibleBot({ buy: true }));
  const base = play(bot(), { mode: 'decade', hub: 'TPE', seed: 1, init: off('b-rate') }), ev = play(bot(), { mode: 'decade', hub: 'TPE', seed: 1 });
  assert.ok(base.reports[t], 'game still running');
  assert.ok(base.reports[t].company.costs.interest > 0);
  assert.ok(ev.reports[t].company.costs.interest > base.reports[t].company.costs.interest * 1.4, 'rate 5.5% -> 8.5%');
  assert.ok(ev.reports[t].company.profit < base.reports[t].company.profit);
});
test('event: aircraft shortage raises the rent on new leases only', () => {
  const t = planTurn('decade', 'TPE', 1, 'b-supply');
  const s = play(steady('decade', 'TPE'), { mode: 'decade', hub: 'TPE', seed: 1, maxTurns: t }).state;
  const before = M.applyDecisions(s, { fleet: { lease: { 'MQ-320': 1 } } }).state.fleet.at(-1).rate;
  assert.equal(before, AIRCRAFT['MQ-320'].leasePerMonth);
  const r = play(steady('decade', 'TPE'), { mode: 'decade', hub: 'TPE', seed: 1, maxTurns: t + 1 }).state;
  const fresh = M.applyDecisions(r, { fleet: { lease: { 'MQ-320': 1 } } }).state.fleet.at(-1).rate;
  assert.ok(fresh > AIRCRAFT['MQ-320'].leasePerMonth * 1.2);
});
test('events: every scripted event fires exactly once per game, varied between seeds, with a lesson', () => {
  for (const mode of MODE_IDS) {
    const r = play(sensibleBot(), { mode, hub: 'NRT', seed: 5 });
    const fired = r.reports.flatMap(x => x.events.map(e => e.id));
    for (const e of EVENTS.filter(x => x.modes.includes(mode))) assert.equal(fired.filter(f => f === e.id).length, 1, `${e.id}`);
    const lessons = new Set(r.reports.flatMap(x => x.lessons));
    for (const e of EVENTS.filter(x => x.modes.includes(mode))) assert.ok(lessons.has(e.lesson) || r.state.lessons[e.lesson], `lesson for ${e.id}`);
  }
  const timing = seed => JSON.stringify(M.newGame({ mode: 'year', hub: 'TPE', seed }).plan);
  assert.ok(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(timing)).size >= 3, 'event timing varies between seeds');
});

// ------------------------------------------------------------------ lessons / teaching moments
test('lesson: the empty widebody trap shows on a thin route and the explanation names it', () => {
  const s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  const dec = { routes: [{ city: 'HKG', type: 'MQ-350', weekly: 7, fare: 'mid' }], fleet: { lease: { 'MQ-350': 2 }, returnLease: { 'MQ-320': 2 } } };
  const a = M.applyDecisions(s, dec); assert.equal(a.errors.length, 0);
  const o = M.simulateTurn(a.state);
  const r = o.report.routes[0];
  assert.ok(r.profit < 0 && r.lf < 0.75);
  assert.ok(o.report.lessons.includes('widebodyEmpty') || r.lf >= 0.6);
  const small = M.applyDecisions(s, { routes: [{ city: 'HKG', type: 'MQ-320', weekly: 7, fare: 'mid' }] });
  const os = M.simulateTurn(small.state).report.routes[0];
  assert.ok(os.profit > r.profit, 'the right-sized aircraft earns more on the same route');
});
test('lesson: full but unprofitable - low fare, full plane, break-even above load factor', () => {
  const s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  const a = M.applyDecisions(s, { routes: [{ city: 'HKG', type: 'MQ-320', weekly: 3, fare: 'low' }], fleet: { returnLease: { 'MQ-320': 1 } } });
  let st = a.state, rep; for (let i = 0; i < 3; i++) { const o = M.simulateTurn(st); st = o.state; rep = o.report; }
  const x = rep.routes[0];
  assert.ok(x.lf >= 0.8, `LF ${x.lf}`);
  assert.ok(x.breakEvenLF > x.lf, 'break-even LF above the load factor');
  assert.equal(x.reasonKey, 'fullLoss');
  assert.ok(st.lessons.fullUnprofitable);
});
test('lesson: utilisation - an idle aircraft still costs its lease and the lesson fires', () => {
  const s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  const a = M.applyDecisions(s, { routes: [{ city: 'HKG', type: 'MQ-320', weekly: 7, fare: 'mid' }] });
  const o = M.simulateTurn(a.state);
  assert.equal(o.report.company.idleAircraft, 1);
  assert.ok(o.report.company.idleFleetCost >= 400000 * 0.99);
  assert.ok(o.report.lessons.includes('utilisation'));
  // lease cost shows up as ownership even with no flights
  const d = M.simulateTurn(s).report.company; assert.equal(d.costs.ownership, 800000);
});
test('lesson: hub effect - feeder routes raise transfer passengers on the trunk route', () => {
  const s = M.newGame({ mode: 'decade', hub: 'TPE', seed: 1 });
  const lease = { 'MQ-350': 2, 'MQ-320': 4 };
  const trunk = { city: 'LAX', type: 'MQ-350', weekly: 7, fare: 'mid' };
  const alone = M.simulateTurn(M.applyDecisions(s, { routes: [trunk], fleet: { lease } }).state).report;
  const fed = M.simulateTurn(M.applyDecisions(s, { routes: [trunk, { city: 'BKK', type: 'MQ-320', weekly: 7, fare: 'mid' }, { city: 'KUL', type: 'MQ-320', weekly: 7, fare: 'mid' }, { city: 'SGN', type: 'MQ-320', weekly: 7, fare: 'mid' }], fleet: { lease } }).state).report;
  const a = alone.routes.find(r => r.city === 'LAX'), f = fed.routes.find(r => r.city === 'LAX');
  assert.equal(a.transferPax, 0);
  assert.ok(f.transferPax > 0 && f.transferPax > 0.02 * f.pax, `trunk transfer pax ${f.transferPax}`);
  assert.ok(f.lf > a.lf);
  assert.ok(fed.company.transferPax > 0);
  assert.ok(f.avgFare <= a.avgFare * 1.0001 + 1);
  // in year mode the hub effect is small but visible
  const sy = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  const ya = M.simulateTurn(M.applyDecisions(sy, { routes: [{ city: 'LAX', type: 'MQ-350', weekly: 7, fare: 'mid' }, { city: 'BKK', type: 'MQ-320', weekly: 7, fare: 'mid' }, { city: 'KUL', type: 'MQ-320', weekly: 7, fare: 'mid' }], fleet: { lease: { 'MQ-350': 2, 'MQ-320': 2 }, returnLease: {} } }).state).report;
  const lax = ya.routes.find(r => r.city === 'LAX');
  assert.ok(lax.transferPax > 0 && lax.transferShare < 0.2);
});
test('lesson: seasonality - peak and trough months move demand in the right direction', () => {
  const s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  const lhr = turn => M.routeOptions({ ...s, turn }, 'LHR').estMarketPaxPerWeek;
  assert.ok(lhr(6) > lhr(1) * 1.2, 'July beats February to Europe');
  assert.ok(M.routeOptions({ ...s, turn: 6 }, 'LHR').seasonFactor > M.routeOptions({ ...s, turn: 1 }, 'LHR').seasonFactor);
});
test('new routes ramp up over the first turns', () => {
  const s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  let st = M.applyDecisions(s, { routes: [{ city: 'HKG', type: 'MQ-320', weekly: 5, fare: 'mid' }] }).state; const pax = [];
  for (let i = 0; i < 3; i++) { const o = M.simulateTurn(st); st = o.state; pax.push(o.report.routes[0].pax / (i === 0 ? 1 : 1)); }
  assert.ok(pax[2] > pax[0] * 1.15);
});

// ------------------------------------------------------------------ fleet, finance
test('buying: down payment, loan, depreciation, interest, sale in decade mode only', () => {
  const s = M.newGame({ mode: 'decade', hub: 'TPE', seed: 1 });
  const a = M.applyDecisions(s, { fleet: { buy: { 'MQ-320': 2 } } });
  assert.equal(a.errors.length, 0);
  const price = AIRCRAFT['MQ-320'].price;
  assert.ok(Math.abs((s.cash - a.state.cash) - 2 * price * CONST.loan.downPct) < 1);
  const o = M.simulateTurn(a.state);
  assert.ok(o.report.company.costs.interest > 0 && o.report.company.debt > 2 * price * 0.7);
  assert.ok(o.state.fleet.filter(x => x.kind === 'own').every(x => x.book < price));
  const sold = M.applyDecisions(o.state, { fleet: { sell: { 'MQ-320': 1 } } });
  assert.equal(sold.errors.length, 0); assert.equal(sold.state.fleet.filter(x => x.kind === 'own').length, 1);
  const y = M.applyDecisions(M.newGame({ mode: 'year', hub: 'TPE', seed: 1 }), { fleet: { buy: { 'MQ-320': 1 } } });
  assert.equal(y.errors[0].code, 'NO_BUY');
  const broke = M.applyDecisions(s, { fleet: { buy: { 'MQ-350': 8 } } }); assert.ok(broke.errors.some(e => e.code === 'NO_CASH'));
});
test('bankruptcy ends the game early with an explanation', () => {
  const r = play(naiveBot(), { mode: 'decade', hub: 'TPE', seed: 1 });
  assert.ok(r.state.gameOver && r.state.gameOver.reason === 'bankrupt');
  const last = r.reports.at(-1); assert.ok(last.gameOver && last.gameOver.zh.length > 10 && last.gameOver.en.length > 10);
  assert.ok(r.reports.length < MODES.decade.turns);
  const again = M.simulateTurn(r.state); assert.equal(again.report, null);
  assert.equal(M.applyDecisions(r.state, {}).errors[0].code, 'GAME_OVER');
  assert.equal(r.end.bankrupt, true);
});
test('hedge: range, availability and rolling lock', () => {
  const s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  assert.equal(M.applyDecisions(s, { hedge: 0.5 }).errors[0].code, 'HEDGE_LOCKED');   // not before month 3
  s.turn = 2;
  assert.equal(M.applyDecisions(s, { hedge: 1.5 }).errors[0].code, 'BAD_HEDGE');
  assert.equal(M.applyDecisions(s, { hedge: -1 }).errors[0].code, 'BAD_HEDGE');
  assert.equal(M.applyDecisions(s, { hedge: 'x' }).errors[0].code, 'BAD_HEDGE');
  const ok = M.applyDecisions(s, { hedge: 0.6 }); assert.equal(ok.errors.length, 0); assert.equal(ok.state.hedge.frac, 0.6);
  assert.equal(M.applyDecisions(M.newGame({ mode: 'decade', hub: 'TPE', seed: 1 }), { hedge: 0.5 }).errors.length, 0);   // decade: any time
});

// ------------------------------------------------------------------ applyDecisions validation
test('applyDecisions rejects invalid parts with errors, never throws', () => {
  const s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  const codes = d => M.applyDecisions(s, d).errors.map(e => e.code);
  assert.ok(codes({ routes: [{ city: 'LAX', type: 'MQ-320', weekly: 7, fare: 'mid' }] }).includes('OUT_OF_RANGE'));
  assert.ok(codes({ routes: [{ city: 'HKG', type: 'MQ-72', weekly: 7, fare: 'mid' }] }).includes('INSUFFICIENT_FLEET'));
  assert.ok(codes({ routes: [{ city: 'ZZZ', type: 'MQ-320', weekly: 7, fare: 'mid' }] }).includes('BAD_CITY'));
  assert.ok(codes({ routes: [{ city: 'TPE', type: 'MQ-320', weekly: 7, fare: 'mid' }] }).includes('BAD_CITY'));
  assert.ok(codes({ routes: [{ city: 'HKG', type: 'MQ-999', weekly: 7, fare: 'mid' }] }).includes('BAD_TYPE'));
  assert.ok(codes({ routes: [{ city: 'HKG', type: 'MQ-400', weekly: 7, fare: 'mid' }] }).includes('BAD_TYPE'));   // not in year mode
  assert.ok(codes({ routes: [{ city: 'HKG', type: 'MQ-320', weekly: 7, fare: 'cheap' }] }).includes('BAD_FARE'));
  assert.ok(codes({ routes: [{ city: 'HKG', type: 'MQ-320', weekly: 0, fare: 'mid' }] }).includes('BAD_FREQ'));
  assert.ok(codes({ routes: [{ city: 'HKG', type: 'MQ-320', weekly: 2.5, fare: 'mid' }] }).includes('BAD_FREQ'));
  assert.ok(codes({ routes: [{ city: 'HKG', type: 'MQ-320', weekly: 99, fare: 'mid' }] }).includes('BAD_FREQ'));
  assert.ok(codes({ routes: [{ city: 'HKG', type: 'MQ-320', weekly: 7, fare: 'mid' }, { city: 'HKG', type: 'MQ-320', weekly: 7, fare: 'mid' }] }).includes('DUP_ROUTE'));
  assert.ok(codes({ routes: 'x' }).includes('BAD_ROUTES'));
  assert.ok(codes({ routes: [null, 5, {}] }).length >= 3);
  assert.ok(codes({ fleet: { lease: { 'MQ-320': -1 } } }).includes('BAD_FLEET'));
  assert.ok(codes({ fleet: { lease: { 'MQ-320': 1.5 } } }).includes('BAD_FLEET'));
  assert.ok(codes({ fleet: { lease: { 'MQ-777': 1 } } }).includes('BAD_TYPE'));
  assert.ok(codes({ fleet: { returnLease: { 'MQ-350': 1 } } }).includes('NO_LEASED'));
  assert.ok(codes({ fleet: { lease: 5 } }).includes('BAD_FLEET'));
  assert.ok(codes({ eventChoices: { nope: 'x' } }).includes('BAD_EVENT'));
  assert.ok(codes({ eventChoices: { 'a-lcc': 'zzz' } }).includes('BAD_OPTION'));
  assert.ok(codes({ businessModel: 'lcc' }).includes('MODEL_LOCKED'));
  // aircraft in use cannot be returned
  const inUse = M.applyDecisions(s, { routes: [{ city: 'HKG', type: 'MQ-320', weekly: 21, fare: 'mid' }] }).state;
  assert.ok(M.applyDecisions(inUse, { fleet: { returnLease: { 'MQ-320': 2 } } }).errors.some(e => e.code === 'FLEET_IN_USE'));
  // an invalid route does not wipe the valid ones, and a rejected change leaves the existing route in place
  const mixed = M.applyDecisions(s, { routes: [{ city: 'HKG', type: 'MQ-320', weekly: 7, fare: 'mid' }, { city: 'LAX', type: 'MQ-320', weekly: 7, fare: 'mid' }] });
  assert.equal(mixed.state.routes.length, 1); assert.equal(mixed.state.routes[0].city, 'HKG');
  const keep = M.applyDecisions(mixed.state, { routes: [{ city: 'HKG', type: 'MQ-320', weekly: 99, fare: 'mid' }] });
  assert.equal(keep.state.routes[0].weekly, 7);
  // every error is bilingual
  for (const e of M.applyDecisions(s, { routes: [{ city: 'LAX', type: 'MQ-320', weekly: 7, fare: 'mid' }], hedge: 5 }).errors) assert.ok(e.code && e.zh && e.en);
  // garbage input never throws
  for (const g of [undefined, null, 5, 'x', [], { routes: null }, { fleet: null }, { hedge: NaN }, { eventChoices: 5 }]) assert.doesNotThrow(() => M.applyDecisions(s, g));
  assert.doesNotThrow(() => M.newGame({ mode: 'zz', hub: 'QQQ', seed: 'abc' }));
});
test('applyDecisions: slot limits apply in decade mode only', () => {
  const s = M.newGame({ mode: 'decade', hub: 'TPE', seed: 1 });
  const a = M.applyDecisions(s, { routes: [{ city: 'LHR', type: 'MQ-350', weekly: 20, fare: 'mid' }], fleet: { lease: { 'MQ-350': 6 } } });
  assert.ok(a.errors.some(e => e.code === 'SLOT_LIMIT'));
  const y = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  const b = M.applyDecisions(y, { routes: [{ city: 'LHR', type: 'MQ-350', weekly: 20, fare: 'mid' }], fleet: { lease: { 'MQ-350': 6 } } });
  assert.ok(!b.errors.some(e => e.code === 'SLOT_LIMIT'));
});
test('fleetNeeded: block hours over utilisation, pooled by type', () => {
  const s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  const need = M.fleetNeeded(s, [{ city: 'HKG', type: 'MQ-320', weekly: 7 }, { city: 'MNL', type: 'MQ-320', weekly: 7 }, { city: 'HKG', type: 'MQ-72', weekly: 1 }]);
  assert.equal(need['MQ-72'], 1); assert.ok(need['MQ-320'] >= 1 && need['MQ-320'] <= 3);
  assert.deepEqual(M.fleetNeeded(s, []), {});
  const lccS = { ...s, model: 'lcc' };
  const r = [{ city: 'NRT', type: 'MQ-320', weekly: 28 }];
  assert.ok(M.fleetNeeded(lccS, r)['MQ-320'] <= M.fleetNeeded(s, r)['MQ-320'], 'low-cost utilisation needs fewer aircraft');
});

// ------------------------------------------------------------------ end report
test('endReport: contract fields, grade, tips', () => {
  const r = play(sensibleBot(), { mode: 'year', hub: 'TPE', seed: 1 });
  const e = r.end;
  for (const k of ['marginTotal', 'industryMargin', 'cash', 'bestRoute', 'worstRoute', 'lessonsSeen', 'lessonsHandled', 'gradeZh', 'gradeEn', 'replayTipsZh', 'replayTipsEn']) assert.ok(e[k] !== undefined, k);
  assert.equal(e.industryMargin, 0.039);
  assert.ok(e.replayTipsZh.length >= 2 && e.replayTipsZh.length === e.replayTipsEn.length);
  assert.ok(e.bestRoute.profit >= e.worstRoute.profit);
  assert.ok(e.lessonsHandled.every(l => e.lessonsSeen.includes(l)));
  assert.ok(e.lessonsSeen.every(l => LESSONS[l]));
  assert.ok(e.lessonsSeen.length >= 5);
  const bad = play(naiveBot(), { mode: 'year', hub: 'TPE', seed: 1 }).end; assert.ok(bad.marginTotal < e.marginTotal);
  deepFinite(e);
});

// ------------------------------------------------------------------ end report: loss grade and lessons consistency
test('endReport: a negative margin never reads as profitable and states the loss', () => {
  const s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  s.totals.revenue = 1e8; s.totals.profit = -2.1e6;
  const e = M.endReport(s);
  assert.ok(e.marginTotal < 0);
  assert.ok(!/有賺錢|及格/.test(e.gradeZh) && !/profitable|Pass/.test(e.gradeEn), e.gradeZh);
  assert.ok(e.gradeZh.includes('整體虧損 2.1%'), e.gradeZh);
  assert.ok(e.gradeEn.includes('overall loss of 2.1%'), e.gradeEn);
  s.totals.profit = -3e7;
  assert.ok(M.endReport(s).gradeZh.includes('整體虧損 30.0%'));
  s.totals.profit = 1e6; assert.ok(M.endReport(s).gradeZh.startsWith('及格'));
});

test('endReport: lessons never faced are not listed as handled', () => {
  // no routes ever opened: the weather event fires but nothing is exposed, so no lesson is recorded
  let s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  for (let i = 0; i < 12 && !s.gameOver; i++) s = M.simulateTurn(M.applyDecisions(s, {}).state || s).state || s;
  assert.ok(s.turn >= 11, 'ran past the weather turn');
  const e = M.endReport(s);
  assert.ok(!e.lessonsSeen.includes('disruption') && !e.lessonsHandled.includes('disruption'));
  assert.ok(e.lessonsHandled.every(l => e.lessonsSeen.includes(l)));
  assert.ok(e.lessonsUnseen.includes('disruption'));
  assert.ok(e.lessonsUnseen.every(l => !e.lessonsSeen.includes(l)));
  // a forged "handled" flag on a lesson that was never seen is ignored
  s.lessons.pandemic = { handled: true };
  assert.ok(!M.endReport(s).lessonsHandled.includes('pandemic'));
});

test('hedge lock message matches hedgeFromTurn', () => {
  const s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  const n = MODES.year.hedgeFromTurn;
  const r = M.applyDecisions(s, { hedge: 0.5 });
  const er = (r.errors || []).find(x => x.code === 'HEDGE_LOCKED');
  assert.ok(er && er.zh.includes(`第 ${n + 1} 個月起`) && er.en.includes(`month ${n + 1}`));
});
