import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, generateMap } from './core.mjs';
import { directAICombat } from './ai-combat.mjs';
import { strategicOrders } from './ai-strategy.mjs';

function setup() {
  const p = defaultProject(); p.map = generateMap(128); p.map.tiles.fill('grass');
  Object.assign(p.rules, { ai: 'off', fog: false, startAge: 2 });
  p.map.buildingPlacements = [{ id: 'objective', type: 'town', team: 0, x: 60, y: 25 }, { id: 'home', type: 'town', team: 1, x: 12, y: 25 }];
  const w = new World(p); for (const u of w.units) u.stance = 'passive';
  w.project.rules.ai = 'normal'; w.time = 200;
  return { w, target: w.buildings.find(b => b.buildingPlacementKey === 'objective'), home: w.buildings.find(b => b.buildingPlacementKey === 'home') };
}
function plan(w, units, home, target, suggestions = new Map()) {
  const enemies = [...w.units, ...w.buildings].filter(e => e.hp > 0 && w.isEnemy(1, e.team));
  directAICombat(w, 1, units, home, enemies, target, true, suggestions);
}
function advance(w, predicate, seconds = 120) {
  for (let i = 0; i < seconds * 10 && !predicate(); i++) w.tick(.1);
  assert.ok(predicate(), `Not reached after ${seconds} game seconds`);
}
function order(w, u, target) { w.command([u.id], { type: 'attackMove', x: target.x, y: target.y, aiObjective: target.id, aiTactic: 'advance' }); }

test('advancing AI soldiers fight encountered troops and continue toward the town afterward', () => {
  const { w, target, home } = setup(), u = w.spawn('swordsman', 1, { x: 20, y: 25 }), obstacle = w.spawn('swordsman', 0, { x: 26, y: 25 });
  obstacle.hp = 12; obstacle.stance = 'passive';
  plan(w, [u], home, target);
  assert.equal(u.order.type, 'attackMove'); assert.equal(u.order.aiObjective, target.id);
  const strategic = u.order; w.project.rules.ai = 'off';
  advance(w, () => obstacle.hp <= 0);
  assert.strictEqual(u.order, strategic, 'Temporary combat keeps the strategic order');
  const hp = target.hp; advance(w, () => target.hp < hp);
  assert.equal(u.order?.aiObjective, target.id);
});

test('repeated planner passes keep a live objective route and its current battle target intact', () => {
  const { w, target, home } = setup(), u = w.spawn('swordsman', 1, { x: 20, y: 25 }), enemy = w.spawn('swordsman', 0, { x: 25, y: 25 });
  order(w, u, target); u.path = [{ x: 30, y: 25 }]; u.pathGoal = { x: 58, y: 23, radius: .2 };
  const original = u.order, path = u.path, pathGoal = u.pathGoal;
  plan(w, [u], home, target); w.time += 1.1; plan(w, [u], home, target);
  assert.strictEqual(u.order, original); assert.strictEqual(u.path, path); assert.strictEqual(u.pathGoal, pathGoal);
  u.autoTarget = enemy.id; w.time += 1.1; plan(w, [u], home, target);
  assert.equal(u.autoTarget, enemy.id); assert.strictEqual(u.order, original); assert.strictEqual(u.path, path);
});

test('legacy direct building orders migrate while valid direct pursuits remain unchanged', () => {
  const { w, target, home } = setup(), marching = w.spawn('swordsman', 1, { x: 20, y: 25 }), chasing = w.spawn('scout', 1, { x: 21, y: 30 }), enemy = w.spawn('swordsman', 0, { x: 26, y: 30 });
  w.command([marching.id], { type: 'attack', target: target.id });
  w.command([chasing.id], { type: 'attack', target: enemy.id }); const pursuit = chasing.order;
  plan(w, [marching, chasing], home, target);
  assert.equal(marching.order.type, 'attackMove'); assert.equal(marching.order.aiObjective, target.id);
  assert.strictEqual(chasing.order, pursuit);
});

test('siege engines at the front preserve a precise building mission', () => {
  const { w, target, home } = setup(), ram = w.spawn('ram', 1, { x: 56, y: 25 });
  plan(w, [ram], home, target);
  assert.equal(ram.order.type, 'attack'); assert.equal(ram.order.target, target.id); assert.equal(ram.order.aiObjective, target.id);
  const original = ram.order; w.time += 1.1; plan(w, [ram], home, target); assert.strictEqual(ram.order, original);
});

test('a local raid gets nearby support while distant advancing troops keep their route', () => {
  const { w, target, home } = setup(), victim = w.spawn('villager', 2, { x: 20, y: 40 }), attacker = w.spawn('archer', 0, { x: 23, y: 40 });
  const near = w.spawn('swordsman', 1, { x: 22, y: 40 }), another = w.spawn('swordsman', 1, { x: 20, y: 44 }), far = w.spawn('swordsman', 1, { x: 65, y: 50 });
  for (const u of [near, another, far]) order(w, u, target);
  const distant = far.order; victim.recentAttacker = attacker.id; victim.recentAttackAt = w.time;
  plan(w, [near, another, far], home, target);
  assert.equal(near.order.aiTactic, 'intercept'); assert.equal(near.order.aiThreat, attacker.id); assert.equal(near.order.aiObjective, target.id);
  assert.strictEqual(far.order, distant); assert.notEqual(another.order.aiTactic, 'intercept', 'Response stays bounded to a small local group');
});

test('allied damage is never treated as an enemy raid', () => {
  const { w, target, home } = setup(), u = w.spawn('swordsman', 1, { x: 20, y: 40 }), ally = w.spawn('mangonel', 2, { x: 23, y: 40 });
  order(w, u, target); const original = u.order; u.recentAttacker = ally.id; u.recentAttackAt = w.time;
  plan(w, [u], home, target);
  assert.strictEqual(u.order, original); assert.equal(u.order.aiThreat, undefined);
});

test('outnumbered wounded troops withdraw toward a safe monk and rejoin after healing', () => {
  const { w, target, home } = setup(), u = w.spawn('swordsman', 1, { x: 22, y: 25 }), monk = w.spawn('monk', 1, { x: 14, y: 24 });
  for (const x of [25, 26, 27]) w.spawn('swordsman', 0, { x, y: 25 });
  order(w, u, target); w.command([u.id], { type: 'move', x: 40, y: 25 }, true); const queued = structuredClone(u.queued);
  u.hp = u.maxHp * .2; u.recentAttackAt = w.time;
  plan(w, [u, monk], home, target);
  assert.ok(u.aiRetreat); assert.equal(u.aiRetreat.anchor, monk.id); assert.equal(u.stance, 'passive'); assert.equal(u.order.type, 'move');
  u.hp = u.maxHp * .59; w.time += 1.1; plan(w, [u, monk], home, target); assert.ok(u.aiRetreat);
  u.hp = u.maxHp * .6; w.time += 1.1; plan(w, [u, monk], home, target);
  assert.equal(u.aiRetreat, undefined); assert.equal(u.stance, 'aggressive'); assert.equal(u.order.type, 'attackMove'); assert.deepEqual(u.queued, queued);
});

test('losing a refuge or waiting without healing lets a wounded unit defend instead of remaining passive', () => {
  const { w, target, home } = setup(), u = w.spawn('swordsman', 1, { x: 30, y: 40 }), monk = w.spawn('monk', 1, { x: 24, y: 40 });
  for (const x of [33, 34, 35]) w.spawn('swordsman', 0, { x, y: 40 });
  order(w, u, target); u.hp = u.maxHp * .2;
  plan(w, [u, monk], home, target); assert.ok(u.aiRetreat);
  monk.hp = 0; w.time += 1.1; plan(w, [u], home, target);
  assert.equal(u.stance, 'stand'); assert.equal(u.aiRetreat.holding, true); assert.equal(u.order, null);
  u.hp = u.maxHp * .6; w.time += 1.1; plan(w, [u], home, target); assert.equal(u.aiRetreat, undefined);
});

test('ranged troops make a short safe separation step and recover their mission after failure', () => {
  const { w, target, home } = setup(), archer = w.spawn('archer', 1, { x: 25, y: 40 }), melee = w.spawn('swordsman', 0, { x: 26, y: 40 });
  order(w, archer, target); plan(w, [archer], home, target);
  assert.ok(archer.aiKite); assert.equal(archer.order.type, 'move'); assert.equal(archer.stance, 'passive'); assert.ok(archer.order.x < archer.x);
  const first = archer.order; w.time += .2; plan(w, [archer], home, target); assert.strictEqual(archer.order, first, 'Tactics are rate limited');
  archer.failed = true; w.time += 1.1; plan(w, [archer], home, target);
  assert.equal(archer.aiKite, undefined); assert.equal(archer.stance, 'aggressive'); assert.equal(archer.order.type, 'attackMove'); assert.equal(archer.order.aiObjective, target.id);
});

test('calm and disabled planners issue no new offensive routes', () => {
  for (const ai of ['calm', 'off']) {
    const { w, target, home } = setup(), u = w.spawn('swordsman', 1, { x: 20, y: 25 }); w.project.rules.ai = ai;
    plan(w, [u], home, target); assert.equal(u.order, null);
  }
});

test('dispatcher keeps cavalry flank waypoints stable and advances after reaching that stage', () => {
  const { w, target, home } = setup(), riders = [20, 21, 22].map(x => w.spawn('scout', 1, { x, y: 30 }));
  plan(w, riders, home, target, strategicOrders(w, 1, riders, target));
  const first = riders[0], flank = first.order;
  assert.equal(flank.aiTactic, 'flank'); assert.equal(flank.aiObjective, target.id);
  first.path = [{ x: 30, y: 31 }]; const path = first.path;
  w.time += 1.1; plan(w, riders, home, target, strategicOrders(w, 1, riders, target));
  assert.strictEqual(first.order, flank); assert.strictEqual(first.path, path);
  Object.assign(first, { x: flank.x, y: flank.y });
  w.time += 1.1; plan(w, riders, home, target, strategicOrders(w, 1, riders, target));
  assert.equal(first.order.aiTactic, 'advance'); assert.equal(first.order.aiFlankPassed, true);
  const advancing = first.order; first.path = [{ x: 45, y: 25 }]; const onward = first.path;
  w.time += 1.1; plan(w, riders, home, target, strategicOrders(w, 1, riders, target));
  assert.strictEqual(first.order, advancing); assert.strictEqual(first.path, onward);
});

test('dispatcher preserves rally timing, releases isolated reinforcements and keeps siege behind the front', () => {
  const { w, target, home } = setup(), recruit = w.spawn('swordsman', 1, { x: 15, y: 32 }), fronts = [35, 36].map(x => w.spawn('swordsman', 1, { x, y: 25 })), ram = w.spawn('ram', 1, { x: 18, y: 25 });
  const army = [recruit, ...fronts, ram];
  plan(w, army, home, target, strategicOrders(w, 1, army, target));
  assert.equal(recruit.order.aiTactic, 'rally'); assert.equal(recruit.order.aiRallySince, 192);
  assert.equal(ram.order.aiTactic, 'escort'); assert.ok(ram.order.x < fronts[0].x);
  const rally = recruit.order; recruit.path = [{ x: 17, y: 28 }]; const path = recruit.path;
  w.time += 1.1; plan(w, army, home, target, strategicOrders(w, 1, army, target));
  assert.strictEqual(recruit.order, rally); assert.strictEqual(recruit.path, path);
  w.time = 204.1; plan(w, army, home, target, strategicOrders(w, 1, army, target));
  assert.equal(recruit.order.aiTactic, 'advance'); assert.equal(recruit.order.aiRallyReleased, true);
  w.time = 208; plan(w, army, home, target, strategicOrders(w, 1, army, target));
  assert.equal(recruit.order.aiTactic, 'advance', 'Released reinforcements do not return to rally on the next window');
});
