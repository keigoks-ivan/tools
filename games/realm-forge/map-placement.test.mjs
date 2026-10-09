import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, generateMap, validateProject, setTile, buildingBounds, heroPlacementKey, buildingPlacementKey } from './core.mjs';

function project(size = 64) {
  const p = defaultProject(); p.map = generateMap(size); p.map.tiles.fill('grass');
  Object.assign(p.rules, { ai: 'off', fog: false, startAge: 0 });
  p.units.push({ ...structuredClone(p.units.find(u => u.id === 'swordsman')), id: 'test-hero', name: '工坊英雄', hero: true, regen: 0, building: 'castle', age: 0, upgrades: [], time: 1 });
  return p;
}
function tick(w, seconds) { for (let i = 0; i < seconds * 10; i++) w.tick(.1); }
const heroes = w => w.units.filter(u => u.blueprint.id === 'test-hero');

test('one custom hero blueprint deploys several independently keyed copies', () => {
  const p = project(); p.map.heroPlacements = [20, 22, 24].map((x, i) => ({ id: `hero-${i}`, unitId: 'test-hero', x, y: 20 }));
  const w = new World(p);
  assert.deepEqual(w.deploymentErrors, []); assert.equal(heroes(w).length, 3);
  assert.deepEqual(heroes(w).map(u => [u.x, u.y, u.heroPlacementKey]), [[20, 20, 'hero-0'], [22, 20, 'hero-1'], [24, 20, 'hero-2']]);
  assert.equal(w.units.some(u => u.team > 0 && u.blueprint.hero), false);
  assert.equal(w.spawn('test-hero', 1, { x: 30, y: 30 }), null);
  const saved = World.fromState(w.saveState());
  assert.deepEqual(heroes(saved).map(u => u.heroPlacementKey), heroes(w).map(u => u.heroPlacementKey));
});

test('unplaced hero types each retain one automatic town-side copy', () => {
  const p = project(); p.units.push({ ...structuredClone(p.units.at(-1)), id: 'second-hero', name: '第二英雄' });
  const w = new World(p), all = w.units.filter(u => u.blueprint.hero);
  assert.equal(all.length, 2); assert.ok(all.every(u => u.heroAutoPlacement));
  assert.notDeepEqual([all[0].x, all[0].y], [all[1].x, all[1].y]); assert.deepEqual(w.deploymentErrors, []);
});

test('a castle repeatedly trains the same hero and pays each ordinary production cost', () => {
  const p = project(); p.map.buildingPlacements = [{ id: 'training-castle', type: 'castle', team: 0, x: 25, y: 25 }];
  const w = new World(p), castle = w.buildings.find(b => b.buildingPlacementKey === 'training-castle'), before = w.stocks[0].food;
  for (let i = 0; i < 3; i++) assert.equal(w.train(castle.id, 'test-hero'), null);
  assert.equal(castle.queue.length, 3); assert.equal(w.stocks[0].food, before - 3 * p.units.at(-1).food);
  tick(w, 4); assert.equal(heroes(w).length, 4); assert.equal(castle.queue.length, 0);
  assert.equal(w.train(w.buildings.find(b => b.team === 1 && b.type === 'town').id, 'test-hero'), '這棟建築無法訓練這個兵種。');
});

test('batch planning reclaims the replaced automatic copy and obeys the hard population cap', () => {
  const p = project(); p.rules.population = 50;
  const preview = new World(p), points = preview.planHeroPlacement('test-hero', { x: 25, y: 25 }, 100);
  assert.equal(points.length, 46, 'Four starting ordinary units leave 46 slots after the default hero is replaced');
  assert.equal(new Set(points.map(p => `${p.x}:${p.y}`)).size, 46);
  p.map.heroPlacements = points.map((p, i) => ({ ...p, id: `batch-${i}`, unitId: 'test-hero' }));
  const w = new World(p); assert.equal(w.population(0), 50); assert.equal(heroes(w).length, 46);
  assert.deepEqual(w.planHeroPlacement('test-hero', { x: 40, y: 35 }, 2), []);
  assert.equal(w.planHeroPlacement('test-hero', points[0], 1, 'batch-0').length, 1, 'Moving an existing slot works at capacity');
  const extra = w.spawn('test-hero', 0, { x: 40, y: 35 }); assert.equal(extra, null);
  p.map.heroPlacements.push({ id: 'over-cap', unitId: 'test-hero', x: 40, y: 35 });
  const over = new World(p); assert.equal(over.population(0), 50); assert.ok(over.deploymentErrors.some(e => /人口上限/.test(e)));
});

test('hero training waits at capacity and resumes when a population slot is freed', () => {
  const p = project(); p.rules.population = 50; p.map.buildingPlacements = [{ id: 'castle', type: 'castle', team: 0, x: 25, y: 25 }];
  const w = new World(p), castle = w.buildings.find(b => b.buildingPlacementKey === 'castle');
  while (w.population(0) < 50) w.spawn('scout', 0, { x: 40, y: 30 });
  assert.equal(w.train(castle.id, 'test-hero'), null); const left = castle.queue[0].left;
  tick(w, 2); assert.equal(castle.queue[0].left, left); assert.equal(w.population(0), 50);
  w.units.find(u => u.team === 0 && u.blueprint.id === 'scout').hp = 0;
  tick(w, 2); assert.equal(w.population(0), 50); assert.equal(heroes(w).length, 2);
});

test('single hero placement and moving use the clicked tile while batches stay nearby', () => {
  const w = new World(project()); setTile(w.map, 25, 25, 'water');
  assert.deepEqual(w.planHeroPlacement('test-hero', { x: 25, y: 25 }, 1), []);
  const points = w.planHeroPlacement('test-hero', { x: 25, y: 25 }, 50);
  assert.equal(points.length, 50); assert.ok(points.every(p => Math.max(Math.abs(p.x - 25), Math.abs(p.y - 25)) <= 12));
  assert.ok(points.every(p => !(p.x === 25 && p.y === 25)));
});

test('automatic starting towns and workers respect manually chosen hero tiles', () => {
  const p = project(), spawn = p.map.spawns[0];
  p.map.heroPlacements = [{ id: 'at-birthplace', unitId: 'test-hero', ...spawn }];
  const w = new World(p), hero = heroes(w)[0], town = w.buildings.find(b => b.team === 0 && b.type === 'town');
  assert.deepEqual(w.deploymentErrors, []); assert.deepEqual([hero.x, hero.y], [spawn.x, spawn.y]);
  const bounds = buildingBounds('town', town.x, town.y);
  assert.ok(hero.x < bounds.minX || hero.x > bounds.maxX || hero.y < bounds.minY || hero.y > bounds.maxY);
});

test('map buildings deploy complete without costs, age prerequisites or an exit requirement', () => {
  const p = project(); p.map.buildingPlacements = [{ id: 'castle', type: 'castle', team: 0, x: 25, y: 25 }, { id: 'tower', type: 'tower', team: 0, x: 32, y: 25 }, { id: 'wall', type: 'wall', team: 0, x: 35, y: 25 }, { id: 'gate', type: 'gate', team: 0, x: 38, y: 25 }];
  const w = new World(p); assert.deepEqual(w.deploymentErrors, []);
  assert.deepEqual(w.stocks[0], p.rules.playerStartingResources);
  for (const placement of p.map.buildingPlacements) {
    const b = w.buildings.find(b => b.buildingPlacementKey === placement.id);
    assert.ok(b); assert.equal(b.progress, 1); assert.equal(b.hp, b.maxHp);
  }
  assert.equal(w.blocked(35, 25), true); assert.equal(w.blocked(38, 25), false);
  const target = w.spawn('scout', 1, { x: 32, y: 29 }); target.stance = 'passive'; const before = target.hp;
  w.tick(.1); assert.ok(target.hp < before, 'The preplaced tower can attack on the first game tick even in Dark Age');
});

test('a preplaced town is reused for deployment and keeps clicked integer project coordinates', () => {
  const p = project(); p.map.buildingPlacements = [{ id: 'custom-town', type: 'town', team: 0, x: 25, y: 25 }];
  const w = new World(p), towns = w.buildings.filter(b => b.team === 0 && b.type === 'town');
  assert.equal(towns.length, 1); assert.equal(towns[0].buildingPlacementKey, 'custom-town');
  assert.deepEqual([towns[0].x, towns[0].y], [24.5, 24.5]);
  assert.deepEqual([w.map.buildingPlacements[0].x, w.map.buildingPlacements[0].y], [25, 25]);
  assert.ok(w.units.filter(u => u.team === 0).every(u => Math.hypot(u.x - 25, u.y - 25) < 8));
});

test('map placement rejects terrain and collisions while moving can exclude the selected copy', () => {
  const p = project(); p.map.heroPlacements = [{ id: 'placed-hero', unitId: 'test-hero', x: 20, y: 20 }];
  p.map.buildingPlacements = [{ id: 'castle', type: 'castle', team: 0, x: 25, y: 25 }];
  const w = new World(p);
  assert.equal(w.canPlaceMapBuilding('tower', 20, 20), false);
  assert.equal(w.canPlaceMapBuilding('castle', 25, 25), false);
  assert.equal(w.canPlaceMapBuilding('castle', 25, 25, 'castle'), true);
  assert.equal(w.canPlaceHero('test-hero', 20, 20), false);
  assert.equal(w.canPlaceHero('test-hero', 20, 20, 'placed-hero'), true);
  setTile(w.map, 35, 35, 'gold'); assert.equal(w.canPlaceMapBuilding('tower', 35, 35), false);
  assert.equal(w.canPlaceMapBuilding('castle', 0, 0), false);
  assert.equal(w.canPlaceMapBuilding('castle', 35.5, 35), false);
});

test('closed castle fortifications are legal editor placements and retain functional walls', () => {
  const p = project(); p.map.buildingPlacements = [{ id: 'fort', type: 'castle', team: 0, x: 25, y: 25 }];
  const bounds = buildingBounds('castle', 25, 25);
  for (let y = bounds.minY - 1; y <= bounds.maxY + 1; y++) for (let x = bounds.minX - 1; x <= bounds.maxX + 1; x++) {
    if (x === bounds.minX - 1 || x === bounds.maxX + 1 || y === bounds.minY - 1 || y === bounds.maxY + 1) p.map.buildingPlacements.push({ type: 'wall', team: 0, x, y });
  }
  const w = new World(p), castle = w.buildings.find(b => b.buildingPlacementKey === 'fort');
  assert.ok(castle); assert.equal(w.buildingExit(castle), null); assert.deepEqual(w.deploymentErrors, []);
});

test('map append operations immediately reserve new footprints without rebuilding the World', () => {
  const w = new World(project()), placement = { id: 'drag-wall', type: 'wall', team: 0, x: 25, y: 25 };
  assert.equal(w.canPlaceMapBuilding('wall', 25, 25), true);
  w.map.buildingPlacements.push(placement);
  assert.equal(w.canPlaceMapBuilding('wall', 25, 25), false);
  const b = w.addBuilding('wall', 0, 25, 25, true); b.buildingPlacementKey = 'drag-wall';
  assert.equal(w.canPlaceMapBuilding('wall', 25, 25, 'drag-wall'), true);
  assert.equal(w.canPlaceHero('test-hero', 25, 25), false);
});

test('structural schema checks types, teams, clicked integers, unique ids and the placement limit', () => {
  const p = project(); p.map.heroPlacements = [{ id: 'same', unitId: 'test-hero', x: 20, y: 20 }];
  p.map.buildingPlacements = [{ id: 'same', type: 'tower', team: 0, x: 25, y: 25 }];
  assert.throws(() => validateProject(p), /id/);
  for (const bad of [{ type: 'missing', team: 0, x: 25, y: 25 }, { type: 'wall', team: 9, x: 25, y: 25 }, { type: 'wall', team: 0, x: 25.5, y: 25 }]) {
    p.map.buildingPlacements = [bad]; assert.throws(() => validateProject(p), /預放建築/);
  }
  p.map.heroPlacements = [];
  p.map.buildingPlacements = Array.from({ length: 5000 }, (_, i) => ({ id: `wall-${i}`, type: 'wall', team: 0, x: i % 64, y: Math.floor(i / 64) % 64 }));
  assert.equal(validateProject(p).map.buildingPlacements.length, 5000);
  p.map.buildingPlacements.push({ id: 'too-many', type: 'wall', team: 0, x: 25, y: 25 }); assert.throws(() => validateProject(p), /5,000/);
});

test('valid schema with overlapping buildings or painted terrain remains editable and reports deployment errors', () => {
  const p = project(); p.map.buildingPlacements = [{ id: 'first', type: 'castle', team: 0, x: 25, y: 25 }, { id: 'overlap', type: 'tower', team: 1, x: 25, y: 25 }];
  p.map.heroPlacements = [{ id: 'bad-terrain', unitId: 'test-hero', x: 35, y: 35 }]; setTile(p.map, 35, 35, 'water');
  assert.doesNotThrow(() => validateProject(p)); const w = new World(p);
  assert.ok(w.deploymentErrors.length >= 2); assert.equal(heroes(w).length, 0);
});

test('legacy maps and coordinate keys remain compatible with save/load', () => {
  assert.equal(heroPlacementKey({ unitId: 'test-hero', x: 20, y: 20 }), 'test-hero:20:20');
  assert.equal(buildingPlacementKey({ type: 'castle', team: 0, x: 25, y: 25 }), '0:castle:25:25');
  const p = project(); p.map.heroPlacements = [{ unitId: 'test-hero', x: 20, y: 20 }]; p.map.buildingPlacements = [{ type: 'castle', team: 0, x: 25, y: 25 }];
  const w = new World(p), loaded = World.fromState(w.saveState());
  assert.equal(heroes(loaded)[0].heroPlacementKey, 'test-hero:20:20');
  const castle = loaded.buildings.find(b => b.buildingPlacementKey === '0:castle:25:25'); assert.ok(castle);
  assert.equal(loaded.blocked(25, 25), true); assert.deepEqual(loaded.stocks, w.stocks);
  const old = project(); delete old.map.heroPlacements; delete old.map.buildingPlacements;
  const legacy = new World(old); assert.equal(heroes(legacy).length, 1); assert.deepEqual(legacy.deploymentErrors, []);
});
