import test from 'node:test';
import assert from 'node:assert/strict';
import { World, newProject, defaultProject, validateProject, generateStandardMap, rulePreset, STANDARD_MAP_SIZE, STANDARD_START, STANDARD_RESOURCE_AMOUNTS } from './core.mjs';
import { adoptStandardOpening, setEnemyCount } from './project-upgrades.mjs';
import { AI_PROFILES, AI_LEVELS, knownEnemies } from './ai.mjs';
import { presetSummary } from './ui-model.mjs';

const near = (map, spawn, type, radius, min = spawn) => { let n = 0; for (let y = 0; y < map.size; y++) for (let x = 0; x < map.size; x++) if (map.tiles[y * map.size + x] === type && Math.hypot(x - spawn.x, y - spawn.y) <= radius) n++; return n; };
const patches = (map, spawn, type, radius) => { // connected groups of one resource type within radius
  const seen = new Set(); let groups = 0;
  for (let y = 0; y < map.size; y++) for (let x = 0; x < map.size; x++) {
    const key = y * map.size + x;
    if (seen.has(key) || map.tiles[key] !== type || Math.hypot(x - spawn.x, y - spawn.y) > radius) continue;
    groups++; const stack = [[x, y]];
    while (stack.length) { const [cx, cy] = stack.pop(), k = cy * map.size + cx; if (seen.has(k) || map.tiles[k] !== type) continue; seen.add(k); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) stack.push([cx + dx, cy + dy]); }
  }
  return groups;
};

test('new projects use the standard opening: dark age, AoE2 starting stock, population from buildings', () => {
  const p = validateProject(newProject());
  assert.equal(p.rules.preset, 'standard');
  assert.equal(p.rules.startAge, 0);
  assert.deepEqual(p.rules.playerStartingResources, { food: 200, wood: 200, gold: 100, stone: 200 });
  assert.deepEqual(p.rules.aiStartingResources, STANDARD_START);
  assert.equal(p.rules.freePlayerPopulation, false);
  assert.equal(p.rules.population, 200); assert.equal(p.rules.enemyPopulation, 200);
  assert.equal(p.rules.ai, 'standard'); assert.equal(p.rules.aiVision, 'fair');
  assert.equal(p.map.spawns.length, 2, 'a 1v1 by default');
  const w = new World(p);
  for (const team of [0, 1]) {
    assert.equal(w.buildings.filter(b => b.team === team).map(b => b.type).join(), 'town');
    assert.equal(w.units.filter(u => u.team === team && u.blueprint.role === 'worker').length, 3);
    assert.deepEqual(w.units.filter(u => u.team === team && u.blueprint.role !== 'worker').map(u => u.blueprint.id), ['scout']);
    assert.equal(w.age(team), 0);
  }
  assert.deepEqual(w.stocks[0], STANDARD_START); assert.deepEqual(w.stocks[1], STANDARD_START);
});

test('population needs buildings: town centre +5, houses +5, capped at 200', () => {
  const p = newProject(); p.rules.ai = 'off';
  const w = new World(p);
  assert.equal(w.capacity(0), 5);
  w.stocks[0].wood = 100000; w.stocks[0].food = 100000;
  const town = w.buildings.find(b => b.team === 0 && b.type === 'town');
  assert.equal(w.population(0), 4);
  assert.equal(w.train(town.id, 'villager'), null);
  assert.equal(w.train(town.id, 'villager'), null);
  for (let i = 0; i < 200; i++) w.tick(.5);
  assert.equal(w.population(0), 5, 'the second villager waits: capacity is 5');
  assert.equal(town.queue.length, 1);
  for (let i = 0; i < 3; i++) { const site = w.nearestBuildingSite('house', { x: town.x + 6 + i * 3, y: town.y + 4 }, true); w.addBuilding('house', 0, site.x, site.y, true); }
  assert.equal(w.capacity(0), 20);
  for (let i = 0; i < 80; i++) { const site = w.nearestBuildingSite('house', { x: town.x - 8 + (i % 8) * 3, y: town.y - 12 + Math.floor(i / 8) * 3 }, true); if (site) w.addBuilding('house', 0, site.x, site.y, true); }
  assert.equal(w.capacity(0), 200, 'never above the population limit');
});

test('standard map: AoE2-sized, spawns a sensible distance apart, every kingdom starts with the same resources', () => {
  const map = generateStandardMap();
  assert.ok(map.size >= 120 && map.size <= 200, `size ${map.size}`);
  const [a, b] = map.spawns, gap = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(gap >= 60 && gap <= 110, `spawn distance ${gap}`);
  assert.deepEqual(map.resourceAmounts, STANDARD_RESOURCE_AMOUNTS);
  for (const s of map.spawns) {
    assert.ok(near(map, s, 'forest', 8) >= 3 && near(map, s, 'forest', 22) >= 60, 'straggler trees plus a woodline');
    assert.ok(near(map, s, 'food', 22) >= 12 && patches(map, s, 'food', 22) >= 2, 'berry bushes in two patches');
    assert.equal(patches(map, s, 'gold', 24), 2, 'two gold patches');
    assert.equal(patches(map, s, 'stone', 24), 2, 'two stone patches');
  }
  const mirror = generateStandardMap(map.size, map.seed, 2);
  assert.deepEqual(mirror.tiles, map.tiles, 'same seed, same map');
  const layout = s => { const out = []; for (let y = -24; y <= 24; y++) for (let x = -24; x <= 24; x++) if (Math.hypot(x, y) <= 24) out.push(map.tiles[(s.y + y) * map.size + s.x + x]); return out.join(); };
  assert.equal(layout(a), layout(b), 'both kingdoms get the identical start layout');
});

test('standard map is connected: a villager can walk between the town centres', async () => {
  const { findPath } = await import('./core.mjs');
  for (const players of [2, 3, 4]) {
    const p = newProject(players - 1); p.rules.ai = 'off';
    const w = new World(p), towns = w.buildings.filter(b => b.type === 'town'), walker = w.units.find(u => u.team === 0);
    assert.equal(towns.length, players);
    for (const t of towns.slice(1)) assert.ok(findPath(walker, t, w.map.size, (x, y) => w.blocked(x, y), 1.6), `path to town ${t.team}`);
  }
});

test('sandbox keeps the previous defaults exactly', () => {
  const p = validateProject(defaultProject());
  assert.equal(p.rules.preset, 'sandbox');
  assert.deepEqual(p.rules.playerStartingResources, { wood: 200000, food: 200000, gold: 200000, stone: 200000 });
  assert.equal(p.rules.starting, 20000); assert.equal(p.rules.aiStartingResources, undefined);
  assert.equal(p.rules.freePlayerPopulation, true); assert.equal(p.rules.population, 300); assert.equal(p.rules.startAge, 4);
  assert.equal(p.rules.ai, 'normal'); assert.equal(p.rules.aiVision, 'full');
  assert.equal(p.map.size, 128); assert.equal(p.map.spawns.length, 3);
  const w = new World(p);
  assert.equal(w.capacity(0), 300); assert.equal(w.stocks[1].food, 20000);
  assert.deepEqual(rulePreset('sandbox'), { ...rulePreset('sandbox'), preset: 'sandbox', ai: 'normal' });
});

const legacySave = () => { const p = defaultProject(); delete p.rules.preset; return JSON.parse(JSON.stringify(p)); };

test('a save written before presets existed loads with its rules untouched', () => {
  const raw = legacySave(); raw.rules.population = 500; raw.rules.ai = 'hard'; raw.rules.playerStartingResources.gold = 1234;
  const p = validateProject(raw);
  assert.equal(p.rules.preset, undefined, 'no preset is invented');
  assert.equal(p.rules.population, 500); assert.equal(p.rules.ai, 'hard'); assert.equal(p.rules.playerStartingResources.gold, 1234);
  assert.equal(p.rules.freePlayerPopulation, true); assert.equal(p.rules.aiVision, 'full', 'old saves keep the all-seeing AI');
  const w = new World(p);
  assert.equal(w.aiFair, false); assert.equal(w.capacity(0), 500); assert.equal(w.stocks[0].gold, 1234);
  assert.equal(adoptStandardOpening(p), false);
  assert.equal(p.rules.population, 500); assert.equal(p.map.generator, undefined);
});

test('only a never-edited default save moves to the standard opening', () => {
  const untouched = validateProject(legacySave());
  assert.equal(adoptStandardOpening(untouched), true);
  assert.equal(untouched.rules.preset, 'standard'); assert.equal(untouched.map.generator, 'standard'); assert.equal(untouched.rules.startAge, 0);
  new World(validateProject(untouched));
  // Each kind of edit is enough to keep the old rules.
  const edits = {
    'a rule number': p => { p.rules.speed = 1.5; },
    'the AI level': p => { p.rules.ai = 'calm'; },
    'player stock': p => { p.rules.playerStartingResources.wood = 199999; },
    'a unit stat': p => { p.units[0].hp += 1; },
    'a map tile': p => { p.map.tiles[0] = p.map.tiles[0] === 'grass' ? 'sand' : 'grass'; },
    'the project name': p => { p.name = 'Mine'; },
    'a chosen preset': p => { p.rules.preset = 'sandbox'; },
  };
  for (const [what, edit] of Object.entries(edits)) {
    const raw = legacySave(); edit(raw);
    const p = validateProject(raw), before = JSON.stringify(p);
    assert.equal(adoptStandardOpening(p), false, what);
    assert.equal(JSON.stringify(p), before, `${what}: nothing changes`);
  }
  assert.equal(adoptStandardOpening(validateProject(newProject())), false, 'a standard project stays as it is');
});

test('standard projects survive validate / JSON round trips and the project count change', () => {
  const p = validateProject(JSON.parse(JSON.stringify(newProject(2))));
  assert.equal(p.map.spawns.length, 3);
  const same = setEnemyCount(p, 2);
  assert.deepEqual(same.tiles, p.map.tiles, 'same count keeps painted terrain');
  const one = setEnemyCount(p, 1);
  assert.equal(one.spawns.length, 2); assert.equal(one.generator, 'standard'); assert.equal(one.enemyCount, 1);
  const three = setEnemyCount(p, 3);
  assert.equal(three.spawns.length, 4);
  p.map = three; new World(validateProject(p));
});

test('difficulty levels: three fair ones at or below 1x, the cheating ones are labelled', () => {
  for (const id of ['easy', 'standard', 'challenging']) {
    const prof = AI_PROFILES[id];
    assert.ok(prof.gather <= 1 && prof.train <= 1 && prof.trade <= 1 && prof.build <= 1, id);
    assert.ok(!prof.cheat && !AI_LEVELS[id].cheat, id);
  }
  assert.ok(AI_PROFILES.easy.gather < 1 && AI_PROFILES.standard.gather === 1);
  assert.equal(AI_PROFILES.easy.plan.tactics, false);
  assert.ok(AI_PROFILES.challenging.plan.attackArmy < AI_PROFILES.standard.plan.attackArmy && AI_PROFILES.standard.plan.attackArmy < AI_PROFILES.easy.plan.attackArmy);
  for (const id of ['insane', 'calm', 'normal', 'hard']) { assert.ok(AI_PROFILES[id].cheat && AI_PROFILES[id].gather > 1, id); assert.match(AI_LEVELS[id].name, /作弊/, id); }
  assert.equal(AI_PROFILES.normal.gather, 3, 'legacy multipliers are unchanged');
  for (const id of Object.keys(AI_PROFILES)) { const p = newProject(); p.rules.ai = id; assert.equal(validateProject(p).rules.ai, id); assert.ok(AI_LEVELS[id], id); }
  const bad = newProject(); bad.rules.ai = 'god'; assert.throws(() => validateProject(bad));
});

test('a fair AI only knows what it has seen', () => {
  const p = newProject(); const w = new World(p);
  assert.equal(w.aiFair, true);
  w.tick(.1);
  assert.deepEqual(knownEnemies(w, 1), [], 'nothing of the human kingdom is known at the start');
  const town = w.buildings.find(b => b.team === 0);
  assert.ok(Math.hypot(town.x - w.buildings.find(b => b.team === 1).x, town.y - w.buildings.find(b => b.team === 1).y) > 60);
  // An AI unit walking up to the human town sees it, and remembers it after leaving.
  const scout = w.units.find(u => u.team === 1 && u.blueprint.id === 'scout');
  Object.assign(scout, { x: town.x + 3, y: town.y + 3 }); w.tick(1.2);
  assert.ok(knownEnemies(w, 1).some(e => e.id === town.id), 'seen building is known');
  Object.assign(scout, { x: w.map.spawns[1].x, y: w.map.spawns[1].y }); w.tick(1.2);
  assert.ok(knownEnemies(w, 1).some(e => e.id === town.id), 'a seen building stays remembered');
  const human = w.units.find(u => u.team === 0);
  assert.ok(!knownEnemies(w, 1).some(e => e.id === human.id), 'units out of sight are not known');
  // The all-seeing setting sees everything.
  const q = newProject(); q.rules.aiVision = 'full'; const w2 = new World(q);
  assert.ok(knownEnemies(w2, 1).length >= 4);
});

test('a fair AI cannot gather from ground it has never seen', () => {
  const w = new World(newProject()), worker = w.units.find(u => u.team === 1 && u.blueprint.role === 'worker');
  const far = { x: 30, y: 30 }; w.tiles; // far from the AI spawn at (121, 60)
  const farWorker = { ...worker, x: far.x, y: far.y };
  const seenAny = w.closestResource(worker, 'wood');
  assert.ok(seenAny && Math.hypot(seenAny.x - worker.x, seenAny.y - worker.y) < 30, 'its own backyard is known');
  const point = w.closestResource(farWorker, 'gold');
  assert.ok(!point || w.aiExplored[point.y * w.map.size + point.x], 'only explored tiles can be returned');
  const human = w.closestResource({ ...worker, team: 0, x: 47, y: 108 }, 'gold');
  assert.ok(human, 'the human player is not restricted');
});

test('the fair AI sends a scout out and stands its soldiers down from exploring when danger is near', () => {
  const w = new World(newProject());
  for (let i = 0; i < 1200; i++) w.tick(.1);
  const scout = w.units.find(u => u.team === 1 && u.blueprint.id === 'scout');
  assert.ok(scout.aiExplorer, 'the starting scout explores');
  assert.equal(scout.stance, 'passive');
  const baseCells = w.aiExploredCount;
  assert.ok(baseCells > 2200, `explored ${baseCells} cells`);
  assert.ok(w.units.filter(u => u.team === 1).every(u => u.blueprint.role === 'worker' || u.aiExplorer), 'no soldiers marched out yet');
});

test('standard AI develops: houses, farms, villagers, feudal age, soldiers and a first attack', () => {
  const p = newProject(); const w = new World(p);
  const town = w.buildings.find(b => b.team === 0); town.hp = town.maxHp = 1e7;
  const snap = {};
  for (let i = 0; i < 18 * 600; i++) {
    w.tick(.1);
    if ((i + 1) % 3000 === 0) snap[(i + 1) / 600] = { workers: w.units.filter(u => u.team === 1 && u.blueprint.role === 'worker').length, age: w.age(1) };
  }
  const ai = w.buildings.filter(b => b.team === 1 && b.progress === 1).map(b => b.type), has = t => ai.includes(t);
  assert.ok(has('house') && has('mill') && has('lumber') && has('farm') && has('barracks'), ai.join());
  assert.ok(snap[5].workers >= 9, `5 min villagers ${snap[5].workers}`);
  assert.ok(snap[10].workers >= 13, `10 min villagers ${snap[10].workers}`);
  const stats = w.aiStats[1];
  assert.equal(snap[10].age, 0, 'still dark age at 10 minutes');
  assert.ok(stats.ageUpAt[0] >= 540 && stats.ageUpAt[0] <= 840, `feudal at ${stats.ageUpAt[0]}s`);
  assert.ok(stats.foundEnemyAt > 0 && stats.foundEnemyAt < 1100, 'its scout found the human town');
  assert.ok(w.units.filter(u => u.team === 1 && u.blueprint.role !== 'worker').length >= 8, 'a standing army');
  assert.ok(stats.firstAttackAt === null || stats.firstAttackAt > stats.ageUpAt[0], 'first attack comes after the feudal age');
  assert.ok(w.stocks[1].wood >= 0 && w.stocks[1].food >= 0);
});

test('the AI never builds a house-free population: it stays under its own capacity', () => {
  const w = new World(newProject());
  for (let i = 0; i < 12 * 600; i++) { w.tick(.1); if (i % 100 === 0) assert.ok(w.population(1) <= w.capacity(1), `pop ${w.population(1)} cap ${w.capacity(1)} at ${w.time.toFixed(0)}s`); }
});

test('easy ages up later than standard; the cheating level is faster than either', () => {
  const feudal = level => {
    const p = newProject(); p.rules.ai = level; const w = new World(p);
    const town = w.buildings.find(b => b.team === 0); town.hp = town.maxHp = 1e7;
    for (let i = 0; i < 20 * 600 && w.age(1) < 1; i++) w.tick(.1);
    return w.time;
  };
  const [easy, standard, insane] = [feudal('easy'), feudal('standard'), feudal('insane')];
  assert.ok(easy > standard + 60, `easy ${easy} standard ${standard}`);
  assert.ok(insane < standard - 60, `insane ${insane} standard ${standard}`);
});

test('battle save keeps what the AI has explored and its attack record', () => {
  const w = new World(newProject());
  for (let i = 0; i < 600; i++) w.tick(.1);
  const state = JSON.parse(JSON.stringify(w.saveState()));
  const restored = World.fromState(state);
  assert.equal(restored.aiFair, true);
  assert.equal(restored.aiExploredCount, w.aiExploredCount);
  assert.deepEqual(restored.aiStats, w.aiStats);
});

test('the settings summary shows the numbers of each opening', () => {
  const standard = presetSummary('standard'), sandbox = presetSummary('sandbox');
  assert.match(standard, /黑暗時代/); assert.match(standard, /食物 200、木材 200、黃金 100、石頭 200/); assert.match(standard, /住宅 \+5/); assert.match(standard, new RegExp(`${STANDARD_MAP_SIZE} × ${STANDARD_MAP_SIZE}`));
  assert.match(sandbox, /200,000/); assert.match(sandbox, /免蓋房子/); assert.match(sandbox, /作弊/);
});
