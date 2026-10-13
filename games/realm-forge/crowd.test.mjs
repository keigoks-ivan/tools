import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, generateMap, setTile } from './core.mjs';
import { unitRadius } from './crowd.mjs';

function arena(size = 64) {
  const p = defaultProject(); p.rules.ai = 'off'; p.rules.fog = false; p.rules.population = 400; p.map = generateMap(size); p.map.tiles.fill('grass');
  const w = new World(p);
  for (const u of w.units) w.entities.delete(u.id);
  w.units = [];
  return w;
}
const run = (w, seconds, each = () => {}, dt = .05) => { for (let i = 0; i < seconds / dt; i++) { w.tick(dt); each(i); } };
const alive = w => w.units.filter(u => u.hp > 0);
// Smallest gap between two bodies as a share of the sum of their radii (1 = just touching).
function worstContact(units) {
  let worst = Infinity;
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
    const a = units[i], b = units[j]; worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y) / (unitRadius(a.blueprint) + unitRadius(b.blueprint)));
  }
  return worst;
}
const inBlocked = w => alive(w).filter(u => w.blocked(u.x, u.y));

test('bodies are sized by unit class: infantry smaller than cavalry smaller than siege', () => {
  const w = arena(), r = id => unitRadius(w.spawn(id, 0, { x: 10, y: 10 }).blueprint);
  assert.ok(r('villager') <= r('swordsman'));
  assert.ok(r('swordsman') < r('knight'));
  assert.ok(r('knight') < r('ram'));
  assert.ok(r('ram') <= .5 && r('villager') >= .2);
});

test('20 units ordered to one point end up side by side, not stacked', () => {
  const w = arena(); const ids = [];
  for (let i = 0; i < 20; i++) ids.push(w.spawn(i % 4 ? 'swordsman' : 'knight', 0, { x: 8 + i % 5, y: 10 + Math.floor(i / 5) }).id);
  w.command(ids, { type: 'move', x: 40, y: 30 });
  run(w, 70);
  const units = alive(w);
  assert.equal(units.length, 20);
  assert.ok(worstContact(units) >= .8, `closest pair is only ${worstContact(units).toFixed(2)} of touching distance`);
  assert.ok(units.every(u => !u.order), 'every marcher settles instead of pressing on the pile forever');
  assert.ok(units.every(u => Math.hypot(u.x - 40, u.y - 30) < 4), 'the group stays around the target');
  assert.equal(inBlocked(w).length, 0);
});

test('units spawned on the very same spot are pushed apart', () => {
  const w = arena(); for (let i = 0; i < 20; i++) w.spawn('archer', 0, { x: 30, y: 30 });
  run(w, 5);
  assert.ok(worstContact(alive(w)) >= .8);
});

test('idle units give way to a column marching through them; the column keeps its pace', () => {
  const w = arena(); const idle = []; for (let i = 0; i < 12; i++) idle.push(w.spawn('swordsman', 0, { x: 30 + i % 3, y: 28 + Math.floor(i / 3) }));
  const walker = w.spawn('knight', 0, { x: 22, y: 30 }); w.command([walker.id], { type: 'move', x: 50, y: 30 });
  run(w, 4); const early = walker.x; assert.ok(early > 22);
  run(w, 30);
  assert.ok(walker.x >= 50 - 4, `walker was held up at x=${walker.x.toFixed(1)}`);
  assert.ok(worstContact(alive(w)) >= .8);
});

test('formation orders still land every unit on its own slot', () => {
  const w = arena(); const ids = [];
  for (let i = 0; i < 25; i++) ids.push(w.spawn(i % 2 ? 'swordsman' : 'archer', 0, { x: 5 + i % 5 * 2, y: 20 + Math.floor(i / 5) * 2 }).id);
  w.moveFormation(ids, { x: 30, y: 25 }, 'line');
  const slot = new Map(ids.map(id => [id, { ...w.entity(id).order }]));
  run(w, 90);
  const drift = ids.map(id => { const u = w.entity(id), s = slot.get(id); return Math.hypot(u.x - s.x, u.y - s.y); });
  assert.ok(drift.filter(d => d < .3).length >= 15, 'most units stand on their slot');
  assert.ok(Math.max(...drift) < 1.5, `a unit ended ${Math.max(...drift).toFixed(2)} tiles from its slot`);
  assert.ok(worstContact(alive(w)) >= .8);
});

test('villagers building one house spread around it and finish it', () => {
  const w = arena(); const workers = [];
  for (let i = 0; i < 8; i++) workers.push(w.spawn('villager', 0, { x: 20 + i % 4, y: 20 + Math.floor(i / 4) }));
  w.stocks[0].wood = 5000;
  assert.equal(w.build([workers[0].id], 'house', 30, 30), null);
  const house = w.buildings.find(b => b.type === 'house' && b.team === 0 && b.progress < 1);
  w.command(workers.map(u => u.id), { type: 'build', target: house.id });
  let lastProgress = 0, settledSamples = 0, minContact = Infinity;
  run(w, 60, () => {
    assert.ok(house.progress >= lastProgress); lastProgress = house.progress;
    const building = workers.filter(u => u.working === 'build');
    if (building.length >= 6 && house.progress > .75) { settledSamples++; minContact = Math.min(minContact, worstContact(building)); }
    assert.equal(inBlocked(w).length, 0);
    for (const u of workers) if (u.order?.type === 'build') assert.ok(u.hp > 0 && u.failed !== true);
  });
  assert.equal(house.progress, 1);
  assert.ok(settledSamples >= 5, 'most of the crew was at work together');
  assert.ok(minContact >= .8, `builders overlapped (${minContact.toFixed(2)})`);
});

test('workers pushed by neighbours keep working within reach of a tree', () => {
  const w = arena(); setTile(w.map, 30, 30, 'forest'); w.amounts[30 * 64 + 30] = 5000; w.blockedCells.add(30 * 64 + 30);
  const dropoff = w.addBuilding('lumber', 0, 24, 30, true); assert.ok(dropoff);
  const workers = []; for (let i = 0; i < 10; i++) workers.push(w.spawn('villager', 0, { x: 34 + i % 3, y: 26 + Math.floor(i / 3) }));
  // An idle crowd standing right where the workers want to be.
  for (let i = 0; i < 10; i++) w.spawn('swordsman', 0, { x: 31 + i % 3, y: 31 + Math.floor(i / 3) });
  w.command(workers.map(u => u.id), { type: 'gather', x: 30, y: 30 });
  const before = w.stocks[0].wood, wasWorking = new Map(workers.map(u => [u.id, 0]));
  run(w, 90, () => {
    for (const u of workers) if (u.working) { wasWorking.set(u.id, wasWorking.get(u.id) + 1); assert.ok(Math.hypot(u.x - 30, u.y - 30) <= 1.5 + .04, 'a working villager was shoved out of reach'); }
    assert.equal(inBlocked(w).length, 0);
  });
  assert.ok(w.stocks[0].wood > before + 20, 'wood keeps flowing');
  for (const u of workers) { assert.ok(u.order?.type === 'gather' || u.order?.type === 'deliver', `villager lost its job (${u.order?.type})`); assert.ok(wasWorking.get(u.id) > 20, 'every villager got a turn at the tree'); }
});

test('two marchers meeting head-on against a wall pass each other instead of locking', () => {
  const w = arena(); assert.ok(w.addBuilding('town', 0, 30, 30, true));
  const a = w.spawn('villager', 0, { x: 28.3, y: 32 }), b = w.spawn('villager', 0, { x: 28.7, y: 32 });
  w.command([a.id], { type: 'move', x: 36, y: 32 }); w.command([b.id], { type: 'move', x: 22, y: 32 });
  run(w, 12);
  assert.ok(a.x > 35 && b.x < 23, `they never got past each other (${a.x.toFixed(1)}, ${b.x.toFixed(1)})`);
});

test('villagers carrying wood, berries and gold keep at least 97% of their pace with separation on', () => {
  const rate = on => {
    const w = arena(); for (const [x, y, wd, ht, t] of [[38, 20, 3, 12, 'forest'], [20, 40, 2, 3, 'food'], [40, 40, 2, 2, 'gold']]) for (let j = y; j < y + ht; j++) for (let i = x; i < x + wd; i++) { setTile(w.map, i, j, t); w.blockedCells.add(j * 64 + i); }
    w.addBuilding('lumber', 0, 36, 26, true); w.addBuilding('mill', 0, 24, 41, true); w.addBuilding('mining', 0, 38, 41, true); w.addBuilding('town', 0, 30, 30, true);
    const spots = [[38, 24], [20, 41], [40, 40], [38, 28]];
    for (let i = 0; i < 24; i++) { const u = w.spawn('villager', 0, { x: 26 + i % 6, y: 26 + Math.floor(i / 6) * 1.5 }); w.command([u.id], { type: 'gather', x: spots[i % 4][0], y: spots[i % 4][1] }); }
    for (const r of ['wood', 'food', 'gold', 'stone']) w.stocks[0][r] = 0;
    for (let i = 0; i < 2400; i++) { if (!on) w.sepSkips = -1e12; w.tick(.1); }
    return w.stocks[0].wood + w.stocks[0].food + w.stocks[0].gold;
  };
  const off = rate(false), on = rate(true);
  assert.ok(off > 1000 && on >= off * .97, `with separation ${on} vs ${off} without`);
});

test('nobody is shoved into water, forest or a wall of buildings', () => {
  const w = arena();
  for (let y = 0; y < 64; y++) { setTile(w.map, 33, y, 'water'); setTile(w.map, 34, y, 'forest'); }
  const crowd = []; for (let i = 0; i < 60; i++) crowd.push(w.spawn(i % 3 ? 'swordsman' : 'knight', 0, { x: 28 + i % 5, y: 20 + Math.floor(i / 5) }));
  w.command(crowd.map(u => u.id), { type: 'move', x: 36, y: 30 });
  run(w, 25, () => assert.equal(inBlocked(w).length, 0));
  assert.ok(crowd.every(u => u.x < 33.5));
});

test('a stationary crowd squeezed against a house is never pushed inside it', () => {
  const w = arena(); const house = w.addBuilding('barracks', 0, 30, 30, true); assert.ok(house);
  const crowd = []; for (let i = 0; i < 40; i++) crowd.push(w.spawn('swordsman', 0, { x: 30 + (i % 8) - 3, y: 33 + Math.floor(i / 8) * 0 }));
  run(w, 15, () => assert.equal(inBlocked(w).length, 0));
  assert.ok(worstContact(alive(w)) >= .6);
});

test('melee attackers spread along the wall and around the corner instead of piling on one spot', () => {
  const w = arena(); const target = w.addBuilding('barracks', 1, 32, 32, true); assert.ok(target);
  target.hp = target.maxHp = 1e7;
  const army = []; for (let i = 0; i < 24; i++) army.push(w.spawn('swordsman', 0, { x: 10 + i % 6, y: 28 + Math.floor(i / 6) }));
  w.command(army.map(u => u.id), { type: 'attack', target: target.id });
  run(w, 40);
  const around = army.filter(u => u.hp > 0 && Math.hypot(u.x - target.x, u.y - target.y) < 8);
  assert.equal(around.length, 24);
  assert.ok(worstContact(around) >= .75, `attackers overlap (${worstContact(around).toFixed(2)})`);
  const face = u => { const dx = u.x - target.x, dy = u.y - target.y; return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'west' : 'east') : (dy < 0 ? 'north' : 'south'); };
  assert.ok(new Set(around.map(face)).size >= 2, 'they come from the west, so wrapping means reaching a second face of the building');
  assert.ok(target.hp < target.maxHp, 'the blows actually land');
  assert.ok(around.every(u => u.order?.type === 'attack'), 'nobody lost the attack order');
});

test('saving and loading keeps units separate', () => {
  const w = arena(); for (let i = 0; i < 10; i++) w.spawn('archer', 0, { x: 30, y: 30 });
  run(w, 1);
  const loaded = World.fromState(w.saveState()); run(loaded, 4);
  assert.ok(worstContact(alive(loaded)) >= .8);
});

test('2,000 units resolve in a handful of milliseconds per tick', () => {
  const w = arena(128); w.project.rules.population = 2500;
  for (let i = 0; i < 2000; i++) { const u = w.spawn('swordsman', 0, { x: 40 + i % 40, y: 30 + Math.floor(i / 40) }); u.stance = 'passive'; }
  for (const u of w.units) { u.x = 60 + (u.id % 10) * .2; u.y = 60 + (Math.floor(u.id / 10) % 10) * .2; }
  const start = performance.now(); run(w, 3); const per = (performance.now() - start) / 60;
  assert.ok(per < 40, `${per.toFixed(1)} ms per tick`);
  assert.ok(alive(w).every(u => Number.isFinite(u.x) && Number.isFinite(u.y) && u.x >= 0 && u.y >= 0 && u.x < 128 && u.y < 128 && !w.blocked(u.x, u.y)));
});
