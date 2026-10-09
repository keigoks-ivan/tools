import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, generateMap, setTile } from './core.mjs';
import { setEnemyCount } from './project-upgrades.mjs';
import { AI_PROFILES } from './ai.mjs';

const isArmy = u => !['worker', 'trader'].includes(u.blueprint.role);
function simulate(w, seconds, check = () => {}) {
  for (let i = 0; i < seconds * 10; i++) { w.tick(.1); if (i % 10 === 9) check(); }
}
function until(w, predicate, seconds = 200) {
  for (let i = 0; i < seconds * 10 && !predicate(); i++) w.tick(.1);
  assert.ok(predicate(), `Condition not met after ${seconds} game seconds`);
}
function quietWorld() {
  const p = defaultProject();
  p.rules.ai = 'off'; p.rules.fog = false; p.map = generateMap(64);
  p.map.tiles.fill('grass');
  const w = new World(p);
  for (const u of w.units) u.stance = 'passive';
  return w;
}
function market(w, team, point) {
  const site = w.nearestBuildingSite('market', point, true, 1);
  assert.ok(site);
  return w.addBuilding('market', team, site.x, site.y, true);
}

test('enemy profiles accelerate real harvesting, building and training', () => {
  assert.equal(AI_PROFILES.normal.gather, 3);
  assert.equal(AI_PROFILES.normal.build, 3);
  assert.equal(AI_PROFILES.normal.train, 3);
  assert.equal(AI_PROFILES.hard.gather, 5);
  assert.equal(AI_PROFILES.hard.train, 4);
  const w = quietWorld();
  w.project.rules.ai = 'normal';
  const player = w.buildings.find(b => b.team === 0 && b.type === 'town'), enemy = w.buildings.find(b => b.team === 1 && b.type === 'town');
  assert.equal(w.train(player.id, 'villager'), null);
  assert.equal(w.train(enemy.id, 'villager'), null);
  const playerTime = player.queue[0].left, enemyTime = enemy.queue[0].left;
  w.tick(.1);
  assert.ok(Math.abs(playerTime - player.queue[0].left - .1) < 1e-8);
  assert.ok(Math.abs(enemyTime - enemy.queue[0].left - .3) < 1e-8);
  const own = w.spawn('villager', 0, { x: 20, y: 20 }), ai = w.spawn('villager', 1, { x: 40, y: 20 });
  setTile(w.map, 21, 20, 'forest'); setTile(w.map, 41, 20, 'forest');
  w.command([own.id], { type: 'gather', x: 21, y: 20 });
  w.command([ai.id], { type: 'gather', x: 41, y: 20 });
  w.tick(.1);
  assert.ok(own.carried > 0);
  assert.ok(Math.abs(ai.carried / own.carried - 3) < 1e-8);
  const ownHouse = w.addBuilding('house', 0, 20, 23), aiHouse = w.addBuilding('house', 1, 40, 23);
  Object.assign(own, { x: 20, y: 21 }); Object.assign(ai, { x: 40, y: 21 });
  w.command([own.id], { type: 'build', target: ownHouse.id });
  w.command([ai.id], { type: 'build', target: aiHouse.id });
  w.tick(.1);
  assert.ok(ownHouse.progress > 0);
  assert.ok(Math.abs(aiHouse.progress / ownHouse.progress - 3) < 1e-8);
});

test('three allied AIs reach their population caps, trade and replace military losses', t => {
  const p = defaultProject(); p.map = setEnemyCount(p, 3);
  const w = new World(p);
  // Keep the defender alive so the simulation can test a sustained economy.
  for (const e of [...w.units, ...w.buildings].filter(e => e.team === 0)) {
    e.hp = e.maxHp = 1e9;
    // Prevent conversions of this artificial defender from changing the role mix.
    if (e.kind === 'unit') { e.blueprint.hero = true; e.blueprint.regen = 0; e.stance = 'passive'; }
  }
  const started = performance.now(), reached = {};
  simulate(w, 900, () => {
    for (let team = 1; team < w.teams; team++) {
      assert.ok(w.population(team) <= p.rules.enemyPopulation);
      if (w.population(team) === p.rules.enemyPopulation && !reached[team]) reached[team] = Math.round(w.time);
    }
    for (const u of w.units.filter(u => u.team > 0 && ['attack', 'attackMove', 'convert'].includes(u.order?.type))) {
      const target = w.entity(u.order.target || u.order.aiObjective);
      if (target) assert.equal(target.team, 0, 'Allied enemies must never become direct attack targets');
    }
  });
  for (let team = 1; team < w.teams; team++) {
    assert.ok(reached[team], `AI ${team} must finish housing rather than retrying an unreachable site forever`);
    const us = w.units.filter(u => u.team === team);
    assert.equal(us.length, p.rules.enemyPopulation);
    assert.equal(us.filter(u => u.blueprint.role === 'worker').length, 80);
    assert.equal(us.filter(isArmy).length, 204);
    assert.ok(us.filter(u => isArmy(u) && u.blueprint.role !== 'healer').length >= Math.ceil(p.rules.enemyPopulation * .5));
    assert.ok(us.some(u => u.blueprint.role === 'healer'), 'Reserve support slots so late monastery production is not crowded out');
    assert.ok(us.some(u => u.blueprint.family === 'siege'), 'Reserve siege slots for actual attacks on buildings');
    assert.equal(us.filter(u => u.blueprint.role === 'trader').length, 16);
    assert.ok(w.tradeEarned[team] > 0, 'Trade carts must earn gold through completed round trips');
    const partners = us.filter(u => u.blueprint.role === 'trader').map(u => w.entity(u.order?.target));
    assert.ok(partners.every(b => b && b.team > 0 && b.team !== team));
  }
  const before = w.units.filter(u => u.team === 1 && isArmy(u)).length;
  w.units.filter(u => u.team === 1 && isArmy(u)).slice(0, 60).forEach(u => { u.hp = 0; });
  w.tick(.1);
  assert.equal(w.units.filter(u => u.team === 1 && isArmy(u)).length, before - 60);
  until(w, () => w.population(1) === p.rules.enemyPopulation && w.units.filter(u => u.team === 1 && isArmy(u)).length === before, 300);
  t.diagnostic(`Cap reached at ${JSON.stringify(reached)} game seconds; simulated ${Math.round(w.time)} seconds in ${Math.round(performance.now() - started)} ms`);
});

test('calm AI grows to the cap without issuing offensive orders', () => {
  const p = defaultProject(); p.rules.ai = 'calm'; p.map = setEnemyCount(p, 1);
  const w = new World(p);
  simulate(w, 1000);
  assert.equal(w.population(1), p.rules.enemyPopulation);
  assert.equal(w.units.filter(u => u.team === 1 && isArmy(u)).length, 220);
  assert.equal(w.units.some(u => u.team === 1 && ['attack', 'attackMove', 'convert'].includes(u.order?.type)), false);
});

test('AI monks heal allies, then escort soldiers instead of attacking buildings', () => {
  const w = quietWorld(), soldier = w.units.find(u => u.team === 1 && isArmy(u));
  const monk = w.spawn('monk', 1, { x: soldier.x + 1, y: soldier.y });
  const ally = w.spawn('scout', 2, { x: monk.x + 1, y: monk.y }); ally.hp -= 10;
  w.project.rules.ai = 'normal'; w.time = 200; monk.faith = 0;
  w.updateAI(1);
  assert.equal(monk.order?.type, 'heal'); assert.equal(monk.order.target, ally.id);
  ally.hp = ally.maxHp;
  w.updateAI(1);
  assert.equal(monk.order?.type, 'guard'); assert.equal(monk.order.target, soldier.id);
  assert.equal(soldier.order?.type, 'attackMove');
  assert.equal(w.entity(soldier.order.aiObjective)?.kind, 'building');
});

test('AI monks convert nearby enemy units only when faith is ready', () => {
  const w = quietWorld(), soldier = w.units.find(u => u.team === 1 && isArmy(u));
  const monk = w.spawn('monk', 1, { x: soldier.x + 2, y: soldier.y });
  const enemy = w.spawn('scout', 0, { x: monk.x + 3, y: monk.y });
  w.project.rules.ai = 'normal'; w.time = 200;
  w.updateAI(1);
  assert.equal(monk.order?.type, 'convert'); assert.equal(monk.order.target, enemy.id);
});

test('a trade cart prefers allied markets and deposits gold only after its return', () => {
  const w = quietWorld();
  const home = market(w, 1, { x: 43, y: 12 }), partner = market(w, 2, { x: 43, y: 43 });
  market(w, 0, { x: 5, y: 53 });
  const cart = w.spawn('trade-cart', 1, w.buildingExit(home));
  const before = w.stocks[1].gold;
  assert.equal(w.startTrade(cart), null); assert.equal(cart.order.target, partner.id);
  until(w, () => cart.order?.leg === 'return');
  const cargo = cart.order.cargo;
  assert.ok(cargo > 0); assert.equal(w.stocks[1].gold, before); assert.equal(w.tradeEarned[1], 0);
  until(w, () => w.tradeEarned[1] > 0);
  assert.equal(w.stocks[1].gold, before + cargo); assert.equal(w.tradeEarned[1], cargo);
  assert.equal(cart.order.leg, 'outbound'); assert.equal(cart.order.cargo, 0);
});

test('saving a loaded trade cart preserves its route and deposits its cargo once', () => {
  const w = quietWorld();
  const home = market(w, 1, { x: 43, y: 12 }); market(w, 2, { x: 43, y: 43 });
  const cart = w.spawn('trade-cart', 1, w.buildingExit(home));
  w.startTrade(cart); until(w, () => cart.order?.leg === 'return');
  const cargo = cart.order.cargo, before = w.stocks[1].gold;
  const restored = World.fromState(w.saveState());
  assert.equal(restored.entity(cart.id).order.cargo, cargo);
  until(restored, () => restored.tradeEarned[1] > 0);
  assert.equal(restored.stocks[1].gold, before + cargo); assert.equal(restored.tradeEarned[1], cargo);
  simulate(restored, .5);
  assert.equal(restored.tradeEarned[1], cargo);
});

test('a destroyed trading destination is rejected and AI restarts on a surviving allied market', () => {
  const w = quietWorld(), home = market(w, 1, { x: 43, y: 12 }), lost = market(w, 2, { x: 43, y: 43 });
  const cart = w.spawn('trade-cart', 1, w.buildingExit(home));
  w.startTrade(cart); lost.hp = 0; w.tick(.1);
  assert.equal(cart.order, null); assert.equal(w.tradeEarned[1], 0);
  const next = market(w, 2, { x: 35, y: 43 });
  w.project.rules.ai = 'normal'; w.updateAI(1);
  assert.equal(cart.order?.type, 'trade'); assert.equal(cart.order.target, next.id);
});

test('repeating a trade command preserves loaded cargo, return leg and route progress', () => {
  const w = quietWorld(), home = market(w, 1, { x: 43, y: 12 }), partner = market(w, 2, { x: 43, y: 43 });
  const cart = w.spawn('trade-cart', 1, w.buildingExit(home));
  w.startTrade(cart, partner.id); until(w, () => cart.order?.leg === 'return');
  w.tick(.1);
  const order = cart.order, path = cart.path, cargo = cart.order.cargo;
  assert.equal(w.startTrade(cart, partner.id), null);
  assert.equal(w.startTrade(cart, partner.id), null);
  assert.strictEqual(cart.order, order); assert.strictEqual(cart.path, path);
  assert.equal(cart.order.leg, 'return'); assert.equal(cart.order.cargo, cargo);
  cart.failed = true;
  assert.equal(w.startTrade(cart, partner.id), null);
  assert.strictEqual(cart.order, order); assert.equal(cart.order.cargo, cargo); assert.equal(cart.order.leg, 'return'); assert.equal(cart.failed, false);
  until(w, () => w.tradeEarned[1] > 0);
  assert.equal(w.tradeEarned[1], cargo);
});

test('a queued trade route starts after the existing cargo is deposited', () => {
  const w = quietWorld(), home = market(w, 1, { x: 43, y: 12 }), first = market(w, 2, { x: 43, y: 43 }), next = market(w, 2, { x: 35, y: 43 });
  const cart = w.spawn('trade-cart', 1, w.buildingExit(home));
  w.startTrade(cart, first.id); until(w, () => cart.order?.leg === 'return');
  const cargo = cart.order.cargo;
  assert.equal(w.startTrade(cart, next.id, true), null);
  assert.equal(cart.order.target, first.id); assert.equal(cart.queued[0].target, next.id);
  until(w, () => w.tradeEarned[1] > 0);
  assert.equal(w.tradeEarned[1], cargo);
  assert.equal(cart.order?.type, 'trade'); assert.equal(cart.order.target, next.id);
  assert.equal(cart.order.cargo, 0); assert.equal(cart.queued.length, 0);
});

test('an unfinished home market rejects trading without clearing the current move', () => {
  const w = quietWorld(), home = market(w, 1, { x: 43, y: 12 }), partner = market(w, 2, { x: 43, y: 43 });
  const cart = w.spawn('trade-cart', 1, w.buildingExit(home));
  w.command([cart.id], { type: 'move', x: 30, y: 10 });
  const prior = cart.order; home.progress = .5;
  assert.ok(w.command([cart.id], { type: 'trade', home: home.id, target: partner.id, leg: 'outbound', cargo: 0 }));
  assert.strictEqual(cart.order, prior); assert.equal(w.tradeEarned[1], 0);
});


test('a queued move waits for trade cargo to be deposited before leaving the route', () => {
  const w = quietWorld(), home = market(w, 1, { x: 43, y: 12 }), partner = market(w, 2, { x: 43, y: 43 });
  const cart = w.spawn('trade-cart', 1, w.buildingExit(home));
  w.startTrade(cart, partner.id); until(w, () => cart.order?.leg === 'return');
  const cargo = cart.order.cargo;
  w.command([cart.id], { type: 'move', x: 30, y: 10 }, true);
  until(w, () => w.tradeEarned[1] > 0);
  assert.equal(w.tradeEarned[1], cargo); assert.equal(cart.order?.type, 'move');
  until(w, () => !cart.order);
  assert.ok(Math.hypot(cart.x - 30, cart.y - 10) < .25);
});

test('conversion respects the hard population cap even when training takes the last slot first', () => {
  const w = quietWorld(), town = w.buildings.find(b => b.team === 1 && b.type === 'town');
  w.project.rules.enemyPopulation = 200;
  for (let i = 0; w.capacity(1) < 200 && i < 50; i++) {
    const site = w.nearestBuildingSite('house', { x: 5 + i % 12 * 5, y: 5 + Math.floor(i / 12) * 5 }, true, 1);
    assert.ok(site); assert.ok(w.addBuilding('house', 1, site.x, site.y, true));
  }
  assert.equal(w.capacity(1), 200);
  const monk = w.spawn('monk', 1, { x: 40, y: 35 }), enemy = w.spawn('scout', 0, { x: monk.x + 3, y: monk.y });
  enemy.stance = 'passive';
  while (w.population(1) < 200) w.spawn('scout', 1, { x: 30, y: 30 }).stance = 'passive';
  assert.equal(w.command([monk.id], { type: 'convert', target: enemy.id }), null);
  simulate(w, 14);
  assert.equal(enemy.team, 0); assert.equal(w.population(1), 200); assert.equal(monk.waitingPopulation, true);
  assert.equal(w.train(town.id, 'villager'), null); town.queue[0].left = 0;
  w.units.find(u => u.team === 1 && u.id !== monk.id && u.blueprint.id === 'scout').hp = 0;
  w.tick(.1);
  assert.equal(town.queue.length, 0, 'Training fills the available slot before conversion is processed');
  assert.equal(enemy.team, 0); assert.equal(w.population(1), 200);
  w.units.find(u => u.team === 1 && u.id !== monk.id && u.blueprint.id === 'scout').hp = 0;
  w.tick(.1);
  assert.equal(enemy.team, 1); assert.equal(w.population(1), 200); assert.equal(monk.faith, 0);
});


test('an army below half the current population receives scarce training resources first', () => {
  const w = quietWorld(), town = w.buildings.find(b => b.team === 1 && b.type === 'town');
  const site = w.nearestBuildingSite('barracks', { x: town.x - 6, y: town.y + 6 });
  const barracks = w.addBuilding('barracks', 1, site.x, site.y, true);
  for (let i = 0; i < 20; i++) w.spawn('villager', 1, w.buildingExit(town));
  Object.assign(w.stocks[1], { food: 60, gold: 20, wood: 0, stone: 0 });
  w.project.rules.ai = 'normal'; w.updateAI(1);
  assert.equal(town.queue.length, 0, 'Do not purchase villagers while a developed army needs recovery');
  assert.equal(barracks.queue.length, 1); assert.equal(barracks.queue[0].unitId, 'swordsman');
});

test('military priority does not stop the opening villagers from growing the economy', () => {
  const w = quietWorld(), town = w.buildings.find(b => b.team === 1 && b.type === 'town');
  const site = w.nearestBuildingSite('barracks', { x: town.x - 6, y: town.y + 6 });
  w.addBuilding('barracks', 1, site.x, site.y, true);
  Object.assign(w.stocks[1], { food: 50, gold: 0, wood: 0, stone: 0 });
  w.project.rules.ai = 'normal'; w.updateAI(1);
  assert.equal(town.queue.length, 1); assert.equal(town.queue[0].unitId, 'villager');
});

test('small and large configured enemy caps preserve at least half actual combat units', t => {
  for (const cap of [50, 500]) {
    const p = defaultProject(); p.rules.ai = 'calm'; p.rules.enemyPopulation = cap; p.map = setEnemyCount(p, 1);
    const w = new World(p);
    until(w, () => w.population(1) === cap, 1500);
    const fighters = w.units.filter(u => u.team === 1 && isArmy(u) && u.blueprint.role !== 'healer').length;
    assert.ok(fighters >= Math.ceil(cap * .5), `At cap ${cap}, ${fighters} actual fighters must meet the 50% minimum`);
    assert.equal(w.population(1), cap);
    t.diagnostic(`Enemy cap ${cap}: ${fighters} actual fighters at ${Math.round(w.time)} game seconds`);
  }
});
