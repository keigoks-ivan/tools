// Scripted strategies used by the tests and for calibration. Pure functions of (state, lastReport) -> decisions.
import { newGame, applyDecisions, simulateTurn, pendingEvents, fleetNeeded, estimateRoute, routeOptions, endReport } from './model.mjs';
import { CITIES, AIRCRAFT, MODES, EVENTS } from './data.mjs';

const FREQS = [1, 2, 3, 4, 5, 7, 10, 14, 21, 28];

function candidates(state, { minLF = 0.7, types = null, minMargin = 0.07 } = {}) {
  const m = MODES[state.mode], out = [];
  for (const id of Object.keys(CITIES)) {
    if (id === state.hub) continue;
    const o = routeOptions(state, id); if (!o) continue;
    let best = null;
    for (const ty of o.eligibleTypes) {
      if (types && !types.includes(ty)) continue;
      for (const w of FREQS) {
        if (w > o.maxWeekly) continue;
        const e = estimateRoute(state, id, ty, w, 'mid'); if (!e) continue;
        if (e.lf < minLF || (minMargin > 0 && e.profit <= 0) || e.profit / Math.max(1, e.revenue) < minMargin) continue;
        const score = e.profit / Math.max(0.05, e.aircraftFraction);
        if (!best || score > best.score) best = { city: id, type: ty, weekly: w, fare: 'mid', score, frac: e.aircraftFraction, e };
      }
    }
    if (best) out.push(best);
  }
  void m;
  return out;
}

function fleetMoves(state, routes) {
  const need = fleetNeeded(state, routes), lease = {}, ret = {};
  const types = new Set([...Object.keys(need), ...state.fleet.map(a => a.type)]);
  for (const t of types) {
    const have = state.fleet.filter(a => a.type === t).length, n = need[t] || 0;
    if (n > have) lease[t] = n - have;
    if (have > n) ret[t] = have - n;
  }
  return { lease, returnLease: ret };
}

// A sensible operator: greedy network planner. Starting from nothing, it repeatedly adds the next frequency step (or a new route) with the best
// extra profit per extra aircraft until its fleet budget is used, hedges half, holds fares in a price war, settles a strike, takes relief
// in a pandemic, and keeps running routes unless they clearly lose money. It only uses public API (estimateRoute) and ignores transfer traffic.
export function sensibleBot({ model = 'fsc', budget = null, hedge = 0.5, minLF = 0.62, buy = false } = {}) {
  let mem = { planTurn: -99 };
  return function (state, last) {
    const m = MODES[state.mode];
    if (state.turn === 0) mem = { planTurn: -99 };
    const bud = budget ?? (buy ? 4 : state.mode === 'year' ? 5 : 9);
    const every = state.mode === 'year' ? 6 : 6;
    const dec = { routes: [], fleet: {}, eventChoices: {} };
    for (const e of pendingEvents(state)) {
      if (e.id === 'a-model' || e.id === 'b-model') dec.eventChoices[e.id] = model;
      else if (e.id.includes('strike')) dec.eventChoices[e.id] = 'settle';
      else if (e.id.includes('lcc')) dec.eventChoices[e.id] = 'hold';
      else if (e.id.includes('pandemic')) dec.eventChoices[e.id] = 'loan';
    }
    if (state.mode === 'decade' && state.turn === 0 && model !== state.model) dec.businessModel = model;
    if (state.mode === 'year' && state.turn === m.modelChoiceTurn && model !== state.model) dec.businessModel = model;
    if (state.turn >= m.hedgeFromTurn && hedge > 0 && state.hedge.frac < hedge) dec.hedge = hedge;
    const st = (dec.businessModel || dec.eventChoices['a-model'] || dec.eventChoices['b-model']) ? { ...state, model } : state;
    const have = Object.fromEntries(state.routes.map(r => [r.city, r]));
    const shock = state.mods.some(x => x.kind === 'demand' && x.seg === 'all' && x.seq[state.turn-x.start] < 0.7);
    const replan = state.turn - mem.planTurn >= every || state.routes.length === 0 || dec.businessModel || shock;
    if (!replan) {
      // hold the network; nudge frequencies from last turn's load factors and keep the fleet in step
      const routes = state.routes.map(r => ({ city: r.city, type: r.type, weekly: r.weekly, fare: r.fare }));
      if (last) for (const r of routes) {
        const x = last.routes.find(y => y.city === r.city);
        if (!x || state.turn - mem.planTurn < 2) continue;
        if (x.lf < 0.6 && r.weekly > 2) r.weekly = Math.max(2, Math.floor(r.weekly * 0.8));
        else if (x.lf > 0.9 && x.profit > 0 && r.weekly < 21) { const weekly = Math.min(routeOptions(state,r.city).maxWeekly,Math.ceil(r.weekly * 1.2)); const t = routes.map(q => q === r ? { ...q, weekly } : q); const nd = Object.values(fleetNeeded(state, t)).reduce((a, b) => a + b, 0); if (nd <= bud + 1) r.weekly = weekly; }
      }
      dec.routes = routes; const mv0 = fleetMoves(state, routes); dec.fleet = { lease: mv0.lease, returnLease: mv0.returnLease };
      return dec;
    }
    mem.planTurn = state.turn;
    // estimates per city/type/level
    const table = {};
    for (const id of Object.keys(CITIES)) {
      if (id === st.hub) continue;
      const o = routeOptions(st, id); if (!o) continue;
      for (const ty of o.eligibleTypes) {
        const lv = [];
        for (const w of FREQS) {
          if (w > o.maxWeekly) break;
          // A low-cost operator must compare fares too; its base fare is already discounted.
          for (const fare of st.model === 'lcc' ? ['mid', 'high'] : ['mid']) {
            const e = estimateRoute(st, id, ty, w, fare); if (e) lv.push({ w, fare, e });
          }
        }
        if (lv.length) table[id + '|' + ty] = lv;
      }
    }
    const cur = {}; let used = 0;
    // per city: the aircraft type and weekly frequency with the best estimated profit per aircraft among options that fill at least minLF
    const opts = [];
    for (const key of Object.keys(table)) {
      const [id, ty] = key.split('|');
      for (let k = 0; k < table[key].length; k++) {
        const { w, e } = table[key][k];
        if (e.lf < minLF) continue;
        opts.push({ id, ty, w, e, key, k, score: e.profit / Math.max(0.05, e.aircraftFraction) * (have[id] && have[id].type === ty ? 1.1 : 1) });
      }
    }
    const bestPer = {};
    for (const o of opts) if (!bestPer[o.id] || o.score > bestPer[o.id].score) bestPer[o.id] = o;
    const ranked = Object.values(bestPer).sort((a, b) => b.score - a.score);
    const maxRoutes = model === 'lcc' ? (state.mode === 'year' ? 10 : 16) : (state.mode === 'year' ? 5 : 8);
    for (const o of ranked) {
      if (Object.keys(cur).length >= maxRoutes) break;
      if (used + o.e.aircraftFraction > bud + 0.3) continue;
      cur[o.id] = { key: o.key, lv: o.k }; used += o.e.aircraftFraction;
    }
    // sticky: keep running routes that are not clearly losing (never wipe the network on a one-turn shock)
    for (const r of state.routes) if (!cur[r.city]) {
      const e = estimateRoute(st, r.city, r.type, r.weekly, r.fare);
      if (e && e.profit > -0.1 * e.revenue && used + e.aircraftFraction <= bud + 0.3) {
        const key = r.city + '|' + r.type; if (!table[key]) continue;
        const lvIdx = Math.max(0, table[key].findIndex(x => x.w >= r.weekly && x.fare === r.fare));
        cur[r.city] = { key, lv: lvIdx }; used += e.aircraftFraction;
      }
    }
    // Fill the available aircraft hours with profitable frequency increases before leasing more.
    for (;;) {
      let best = null;
      for (const [id, c] of Object.entries(cur)) {
        const now = table[c.key][c.lv];
        for (let k = 0; k < table[c.key].length; k++) {
          const next = table[c.key][k], extra = next.e.aircraftFraction - now.e.aircraftFraction, gain = next.e.profit - now.e.profit;
          if (next.w <= now.w || next.fare !== now.fare || gain <= 0 || used + extra > bud + 0.3) continue;
          const score = gain / Math.max(0.05, extra);
          if (!best || score > best.score) best = { id, k, extra, score };
        }
      }
      if (!best) break;
      cur[best.id].lv = best.k; used += best.extra;
    }
    dec.routes = Object.entries(cur).map(([id, c]) => ({ city: id, type: c.key.split('|')[1], weekly: table[c.key][c.lv].w, fare: table[c.key][c.lv].fare }));
    if (last) for (const r of dec.routes) {
      const x = last.routes.find(y => y.city === r.city && y.type === r.type);
      if (x && x.lf < 0.5 && r.weekly > 2) r.weekly = Math.max(2, Math.round(r.weekly * Math.max(0.5, x.lf / 0.72)));
    }
    const mv = fleetMoves(st, dec.routes);
    dec.fleet = buy && state.mode === 'decade' ? { buy: mv.lease, returnLease: mv.returnLease } : { lease: mv.lease, returnLease: mv.returnLease };
    return dec;
  };
}

// Naive: biggest aircraft on the nearest cities, lowest fares, no hedge, never adapts, ignores events (default options).
export function naiveBot() {
  return function (state) {
    const m = MODES[state.mode];
    const big = m.types.includes('MQ-400') ? 'MQ-400' : 'MQ-350';
    const near = Object.keys(CITIES).filter(c => c !== state.hub).map(c => ({ c, o: routeOptions(state, c) })).filter(x => x.o.eligibleTypes.includes(big)).sort((a, b) => a.o.distanceKm - b.o.distanceKm).slice(0, 3);
    const routes = near.map(x => ({ city: x.c, type: big, weekly: 7, fare: 'low' }));
    const need = fleetNeeded(state, routes), lease = {};
    for (const [t, n] of Object.entries(need)) { const have = state.fleet.filter(a => a.type === t).length; if (n > have) lease[t] = n - have; }
    return { routes, fleet: { lease }, eventChoices: {} };
  };
}
export function idleBot() { return () => ({}); }

export function play(bot, { mode, hub, seed = 1, maxTurns = 99, init = null }) {
  let s = newGame({ mode, hub, seed }); if (init) init(s); const reports = [], errors = []; let last = null;
  while (!s.finished && !s.gameOver && reports.length < maxTurns) {
    const dec = bot(s, last);
    const r = applyDecisions(s, dec); errors.push(...r.errors); s = r.state;
    const out = simulateTurn(s); s = out.state; last = out.report; reports.push(last);
  }
  return { state: s, reports, errors, end: endReport(s) };
}

export function summarise(res) {
  const R = res.reports, rev = R.reduce((a, r) => a + r.company.revenue, 0), prof = R.reduce((a, r) => a + r.company.profit, 0);
  const costs = {}; let ct = 0;
  for (const r of R) for (const [k, v] of Object.entries(r.company.costs)) { costs[k] = (costs[k] || 0) + v; ct += v; }
  const ask = R.reduce((a, r) => a + r.company.ask, 0), rpk = R.reduce((a, r) => a + r.company.rpk, 0);
  const tx = R.reduce((a, r) => a + r.company.transferPax, 0), px = R.reduce((a, r) => a + r.company.pax, 0);
  return { tx: px ? tx / px : 0, margin: rev > 0 ? prof / rev : -1, cash: res.state.cash, lf: ask ? rpk / ask : 0, shares: Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, ct ? v / ct : 0])), revenue: rev, profit: prof, turns: R.length, bankrupt: !!res.state.gameOver, rask: ask ? rev / ask : 0, cask: ask ? ct / ask : 0 };
}

// Holds the network chosen by `inner` on turn 0 for the rest of the game (no adaptation), so tests can compare one event against a control run.
export function frozen(inner, { hedgeFrom = null, hedge = 0 } = {}) {
  let first = null;
  return function (state, last) {
    if (state.turn === 0) first = inner(state, last);
    const dec = { routes: first.routes, fleet: state.turn === 0 ? first.fleet : {}, eventChoices: {} };
    if (state.turn === 0 && first.businessModel) dec.businessModel = first.businessModel;
    if (hedge > 0 && state.turn >= (hedgeFrom ?? MODES[state.mode].hedgeFromTurn) && state.hedge.frac < hedge) dec.hedge = hedge;
    return dec;
  };
}
