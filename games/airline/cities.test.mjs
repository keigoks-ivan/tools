import { deliverFor } from './tests/fleet-helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, CITY_REGIONS, HUBS, MODES, AIRCRAFT } from './data.mjs';
import * as M from './model.mjs';

test('expanded catalog covers every region with valid airport and demand inputs', () => {
  assert.equal(Object.keys(CITIES).length, 180);
  for (const region of Object.keys(CITY_REGIONS)) {
    assert.ok(Object.values(CITIES).filter(c => c.region === region).length >= 7, region);
  }
  for (const [id, c] of Object.entries(CITIES)) {
    assert.equal(id, c.id);
    assert.match(id, /^[A-Z]{3}$/);
    assert.ok(CITY_REGIONS[c.region], id);
    assert.ok(Number.isFinite(c.lat) && Math.abs(c.lat) <= 90, id);
    assert.ok(Number.isFinite(c.lon) && Math.abs(c.lon) <= 180, id);
    assert.ok(c.pop > 0 && c.feeLevel > 0, id);
    assert.ok(c.business >= 0 && c.business <= 1 && c.tourism >= 0 && c.tourism <= 1, id);
  }
});

test('all global routes expose correct aircraft range and finite forecasts from every hub', () => {
  for (const mode of Object.keys(MODES)) for (const hub of HUBS) {
    const state = M.newGame({ mode, hub, seed: 1 });
    for (const c of Object.values(CITIES)) {
      if (c.id === hub) continue;
      const options = M.routeOptions(state, c.id);
      assert.ok(options.distanceKm > 0 && Number.isFinite(options.estMarketPaxPerWeek), `${hub}/${c.id}`);
      const exact = M.distanceKm(CITIES[hub], c);
      assert.deepEqual(options.eligibleTypes, MODES[mode].types.filter(t => AIRCRAFT[t].rangeKm >= exact));
      for (const type of options.eligibleTypes) {
        const e = M.estimateRoute(state, c.id, type, 3, 'mid');
        for (const key of ['lf', 'pax', 'seats', 'profit', 'revenue', 'cost']) assert.ok(Number.isFinite(e[key]), `${hub}/${c.id}/${key}`);
        assert.ok(e.lf >= 0 && e.lf <= 1 && e.pax <= e.seats);
      }
    }
  }
});

test('new regional route operates, survives saving and retains deterministic settlement', () => {
  const routes=[{city:'KHH',type:'MQ-72',weekly:7,fare:'mid'}];
  const s = deliverFor(M.newGame({ mode: 'year', hub: 'TPE', seed: 1 }),routes);
  const plan = M.applyDecisions(s, {
    routes: [{ city: 'KHH', type: 'MQ-72', weekly: 7, fare: 'mid' }]
  });
  assert.deepEqual(plan.errors, []);
  const restored = M.deserialize(M.serialize(plan.state));
  const first = M.simulateTurn(plan.state), resumed = M.simulateTurn(restored);
  assert.deepEqual(first, resumed);
  assert.equal(first.report.routes[0].city, 'KHH');
  assert.ok(first.report.routes[0].pax > 0);
});

test('every catalog airport can be a base in both modes with local rivals, weather and restorable operation', () => {
  for (const mode of Object.keys(MODES)) for (const hub of Object.keys(CITIES)) {
    const s = M.newGame({ mode, hub, seed: 1 });
    assert.equal(s.hub, hub);
    assert.equal(s.cash, MODES[mode].startCash);
    assert.equal(M.routeOptions(s, hub), null);
    for (const rival of s.rivals) assert.ok(!rival.routes[hub]);
    // Events need text at every new base, including the disruption event.
    for (const turn of new Set(Object.values(s.plan))) {
      for (const e of M.pendingEvents({ ...s, turn })) {
        assert.ok(e.zh && e.en && !e.zh.includes('{weather}'));
      }
    }
    const city = Object.values(CITIES).filter(c => c.id !== hub).sort((a,b) => M.distanceKm(CITIES[hub],a)-M.distanceKm(CITIES[hub],b))[0].id;
    const o = M.routeOptions(s, city), type = o.eligibleTypes[0];
    assert.ok(type, `${hub}: nearest airport must be reachable`);
    const routes = [{ city, type, weekly: 3, fare: 'mid' }];
    const ready=deliverFor(s,routes);
    const planned = M.applyDecisions(ready, { routes });
    assert.deepEqual(planned.errors, [], `${mode}/${hub}`);
    const restored = M.deserialize(M.serialize(planned.state));
    assert.equal(restored.hub, hub);
    const run = M.simulateTurn(restored);
    assert.equal(run.state.hub, hub);
    for (const key of ['cash']) assert.ok(Number.isFinite(run.state[key]), `${mode}/${hub}/${key}`);
    for (const key of ['revenue','profit','loadFactor']) assert.ok(Number.isFinite(run.report.company[key]), `${mode}/${hub}/${key}`);
  }
});

test('unknown bases safely default for new games and are rejected in saves', () => {
  assert.equal(M.newGame({ hub: 'XXX' }).hub, 'TPE');
  assert.equal(M.newGame({ hub: '__proto__' }).hub, 'TPE');
  const s = M.newGame({ hub: 'LAX' });
  assert.throws(() => M.deserialize(JSON.stringify({ ...s, hub: 'XXX' })), /bad save/);
});
