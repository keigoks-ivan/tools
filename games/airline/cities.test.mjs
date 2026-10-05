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
  const s = M.newGame({ mode: 'year', hub: 'TPE', seed: 1 });
  const plan = M.applyDecisions(s, {
    routes: [{ city: 'KHH', type: 'MQ-72', weekly: 7, fare: 'mid' }],
    fleet: { lease: { 'MQ-72': 1 } }
  });
  assert.deepEqual(plan.errors, []);
  const restored = M.deserialize(M.serialize(plan.state));
  const first = M.simulateTurn(plan.state), resumed = M.simulateTurn(restored);
  assert.deepEqual(first, resumed);
  assert.equal(first.report.routes[0].city, 'KHH');
  assert.ok(first.report.routes[0].pax > 0);
});
