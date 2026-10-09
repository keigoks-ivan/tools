import { BUILDINGS, RESOURCE } from './core.mjs?v=20261009l';
import { directAICombat } from './ai-combat.mjs?v=20261009l';
import { strategicOrders } from './ai-strategy.mjs?v=20261009l';

export const AI_PROFILES = {
  off: { gather: 1, build: 1, train: 1, trade: 1 },
  calm: { gather: 2, build: 2, train: 2, trade: 1.5 },
  normal: { gather: 3, build: 3, train: 3, trade: 2 },
  hard: { gather: 5, build: 4, train: 4, trade: 3 },
};
const military = u => u?.blueprint && !['worker', 'trader'].includes(u.blueprint.role);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const armyClass = bp => bp.role === 'healer' ? 'support' : bp.family === 'siege' ? 'siege' : 'troops';
const MILITARY_BUILDINGS = ['barracks', 'archery', 'stable', 'siege', 'castle', 'monastery'];

// Rotate construction searches after a failure. A locally valid clearing may be
// disconnected from the builder; continually choosing it used to stop housing.
function buildNext(w, team, workers, sites, origin, priorities) {
  const pool = workers.filter(u => u.order?.type !== 'build' && u.order?.type !== 'deliver');
  if (!pool.length) return;
  w.aiConstruction ||= {};
  const attempt = w.aiConstruction[team] || 0;
  const anchor = pool[attempt % pool.length];
  let searches = 0;
  for (const type of priorities) {
    const spec = BUILDINGS[type];
    if ((spec.age || 0) > w.age(team) || !w.buildRequirements(team, type) || !w.canPay(team, spec.cost)) continue;
    let near = { x: origin.x + 8 + sites.length % 5 * 4, y: origin.y - 8 + Math.floor(sites.length / 5) % 6 * 4 };
    if (['lumber', 'mill', 'mining'].includes(type)) {
      near = w.closestResource(anchor, { lumber: 'wood', mill: 'food', mining: 'gold' }[type]) || near;
    }
    const centers = [near, anchor, ...sites.filter(b => b.type === 'town' && b.progress === 1)];
    // At most four synchronous path checks per planning pass keeps a crowded
    // base from turning an inaccessible site into an unbounded frame cost.
    for (let i = 0; i < Math.min(2, centers.length); i++) {
      const center = centers[(attempt + i) % centers.length];
      const point = w.nearestBuildingSite(type, center, true, 1);
      if (!point) continue;
      const builders = [...pool].sort((a, b) => distance(a, point) - distance(b, point));
      for (const worker of builders.slice(0, 2)) {
        searches++;
        if (!w.build([worker.id], type, point.x, point.y)) { w.aiConstruction[team] = attempt + 1; return; }
        if (searches >= 4) { w.aiConstruction[team] = attempt + 1; return; }
      }
    }
  }
  w.aiConstruction[team] = attempt + 1;
}

function directHealers(w, army, enemies, attacking) {
  const fighters = army.filter(u => u.blueprint.role !== 'healer');
  for (const monk of army.filter(u => u.blueprint.role === 'healer')) {
    const current = w.entity(monk.order?.target);
    if (monk.order?.type === 'convert' && current && w.isEnemy(monk.team, current.team) && !monk.failed && w.population(monk.team) < w.project.rules.enemyPopulation) continue;
    const hurt = w.units.filter(u => u.id !== monk.id && u.hp > 0 && u.hp < u.maxHp && !u.garrison && w.isAlly(monk.team, u.team) && distance(monk, u) < 16)
      .sort((a, b) => distance(monk, a) - distance(monk, b))[0];
    if (hurt) { w.command([monk.id], { type: 'heal', target: hurt.id }); continue; }
    const convert = attacking && w.population(monk.team) < w.project.rules.enemyPopulation && monk.blueprint.canConvert && (monk.faith ?? 100) >= 99.99 && enemies.find(u => u.kind === 'unit' && !u.blueprint.hero && distance(monk, u) <= monk.blueprint.range + 2);
    if (convert) { w.command([monk.id], { type: 'convert', target: convert.id }); continue; }
    if (monk.order?.type === 'guard' && current?.kind === 'unit' && current.blueprint.role !== 'healer' && w.isAlly(monk.team, current.team) && !monk.failed) continue;
    const escort = fighters.filter(u => u.hp > 0).sort((a, b) => distance(monk, a) - distance(monk, b))[0];
    if (escort) {
      if (monk.order?.type !== 'guard' || monk.order.target !== escort.id || monk.failed) w.command([monk.id], { type: 'guard', target: escort.id });
    } else if (monk.order?.type === 'attack' || monk.failed || monk.order?.type === 'heal' && (!current || current.hp >= current.maxHp)) w.command([monk.id], null);
  }
}

export function updateAI(w, team) {
  if (w.project.rules.ai === 'off') return;
  const units = w.units.filter(u => u.team === team && u.hp > 0 && !u.garrison);
  const workers = units.filter(u => u.blueprint.role === 'worker'), army = units.filter(military), carts = units.filter(u => u.blueprint.role === 'trader');
  const sites = w.buildings.filter(b => b.team === team && b.hp > 0), town = sites.find(b => b.type === 'town'), origin = town || workers[0] || sites[0];
  if (!origin) return;
  const workerId = w.project.units.find(u => u.role === 'worker' && !u.hero)?.id, market = sites.find(b => b.type === 'market' && b.progress === 1);
  const cap = w.project.rules.enemyPopulation, minimumCombat = Math.ceil(cap * .5), economicBudget = cap - minimumCombat;
  const workerLimit = Math.min(80, Math.max(10, Math.floor(cap * .3)), economicBudget);
  const cartLimit = market && w.tradePartner(team, market) ? Math.min(16, Math.floor(cap * .07), economicBudget - workerLimit) : 0, armyLimit = cap - workerLimit - cartLimit;
  const queued = id => sites.reduce((n, b) => n + b.queue.filter(q => q.unitId === id).length, 0);
  const militaryQueued = sites.reduce((n, b) => n + b.queue.filter(q => military({ blueprint: w.project.units.find(u => u.id === q.unitId) })).length, 0);
  const supported = role => w.project.units.some(bp => armyClass(bp) === role && (bp.age || 0) <= w.age(team) && !bp.hero);
  const limits = { support: supported('support') ? Math.min(6, Math.floor(armyLimit * .04), armyLimit - minimumCombat) : 0, siege: supported('siege') ? Math.min(20, Math.ceil(armyLimit * .12)) : 0 };
  limits.troops = armyLimit - limits.support - limits.siege;
  const composition = { support: 0, siege: 0, troops: 0 };
  for (const u of army) composition[armyClass(u.blueprint)]++;
  for (const b of sites) for (const q of b.queue) { const bp = w.project.units.find(u => u.id === q.unitId); if (military({ blueprint: bp })) composition[armyClass(bp)]++; }
  let plannedWorkers = workers.length + queued(workerId), plannedArmy = army.length + militaryQueued, plannedCarts = carts.length + queued('trade-cart');
  const ready = sites.filter(b => b.progress === 1);
  const hasCombatProduction = ready.some(b => MILITARY_BUILDINGS.includes(b.type) && w.availableUnits(team, b.type).some(bp => military({ blueprint: bp }) && bp.role !== 'healer'));
  const militaryPriority = units.length >= 20 && army.filter(u => u.blueprint.role !== 'healer').length < Math.ceil(units.length * .5) && hasCombatProduction;
  // Recover a damaged army before purchasing more civilians. Startup villagers
  // can still grow the economy until production and a substantial population exist.
  if (militaryPriority) ready.sort((a, b) => Number(MILITARY_BUILDINGS.includes(b.type)) - Number(MILITARY_BUILDINGS.includes(a.type)));
  for (const b of ready) {
    const available = w.availableUnits(team, b.type);
    if (b.type === 'town' && !militaryPriority) while (plannedWorkers < workerLimit && b.queue.length < 5) { if (w.train(b.id, workerId)) break; plannedWorkers++; }
    else if (b.type === 'market' && !militaryPriority && w.tradePartner(team, b)) while (plannedCarts < cartLimit && b.queue.length < 3) { if (w.train(b.id, 'trade-cart')) break; plannedCarts++; }
    else if (MILITARY_BUILDINGS.includes(b.type)) {
      const choices = available.filter(u => military({ blueprint: u }) && (!militaryPriority || u.role !== 'healer'));
      while (choices.length && plannedArmy < armyLimit && b.queue.length < 4) {
        const affordable = choices.filter(u => composition[armyClass(u)] < limits[armyClass(u)] && w.canPay(team, { food: u.food, gold: u.gold, wood: u.wood || 0 }));
        if (!affordable.length) break;
        const bp = affordable[(b.queue.length + Math.floor(w.time / 20) + team) % affordable.length];
        if (w.train(b.id, bp.id)) break;
        plannedArmy++; composition[armyClass(bp)]++;
      }
    }
  }
  for (const cart of carts) if (!cart.order || cart.failed) w.startTrade(cart);
  const allocation = { food: 0, wood: 0, gold: 0, stone: 0 }, desired = { food: .4, wood: .34, gold: .22, stone: .04 };
  for (const u of workers) {
    const job = u.order?.type === 'deliver' ? u.order.resume : u.order;
    if (job?.type === 'gather') { const resource = job.target ? 'food' : job.resource || RESOURCE[w.tile(job.x, job.y)]; if (resource) allocation[resource]++; }
  }
  for (const u of workers) if (!u.order || u.failed) {
    const type = Object.keys(desired).sort((a, b) => allocation[a] / desired[a] - allocation[b] / desired[b])[0], point = w.closestResource(u, type);
    if (point) { w.command([u.id], { type: 'gather', ...point }); allocation[type]++; }
  }
  w.aiPlans ||= {};
  if (w.time - (w.aiPlans[team] ?? -10) >= 1) {
    w.aiPlans[team] = w.time;
    const builders = workers.filter(u => u.order?.type === 'build' && !u.failed).length, builderLimit = Math.min(6, Math.max(2, Math.floor(workers.length / 8)));
    const foundation = sites.find(b => b.progress < 1 && !workers.some(u => u.order?.type === 'build' && u.order.target === b.id && !u.failed));
    const pool = workers.filter(u => u.order?.type !== 'build' && u.order?.type !== 'deliver');
    if (pool.length && builders < builderLimit) {
      if (foundation) {
        const worker = pool.sort((a, b) => distance(a, foundation) - distance(b, foundation))[0];
        w.command([worker.id], { type: 'build', target: foundation.id });
      } else {
        const count = type => sites.filter(b => b.type === type).length;
        const homes = sites.filter(b => b.type === 'house' && b.progress < 1).length;
        const militaryGoal = Math.min(4, Math.max(2, Math.ceil(Math.max(army.length, plannedArmy) / 32))), priorities = [];
        if (!town) priorities.push('town');
        if (w.capacity(team) + homes * 5 < cap && w.capacity(team) + homes * 5 - w.population(team) < Math.max(20, plannedWorkers - workers.length + plannedArmy - army.length)) priorities.push('house');
        for (const type of ['lumber', 'mill', 'mining', 'barracks', 'archery', 'stable', 'market']) if (!count(type)) priorities.push(type);
        if (workers.length > 12 && count('town') < Math.min(3, Math.ceil(workerLimit / 24))) priorities.push('town');
        for (const type of ['blacksmith', 'siege', 'monastery', 'castle']) if (!count(type)) priorities.push(type);
        for (const type of ['barracks', 'archery', 'stable']) if (count(type) < militaryGoal) priorities.push(type);
        if (!count('university')) priorities.push('university');
        buildNext(w, team, workers, sites, origin, priorities);
      }
    }
    if (sites.some(b => b.type === 'market' && b.progress === 1)) for (const resource of ['food', 'wood', 'gold']) {
      if (w.stocks[team][resource] >= 400) continue;
      if (resource === 'gold') {
        const surplus = ['wood', 'food', 'stone'].find(r => w.stocks[team][r] > 1500);
        if (surplus) for (let i = 0; i < 5 && w.stocks[team][surplus] > 1500; i++) w.trade(team, surplus, false);
      } else for (let i = 0; i < 5 && w.stocks[team].gold > 800 && w.stocks[team][resource] < 800; i++) w.trade(team, resource, true);
    }
  }
  for (const b of sites.filter(b => b.progress === 1 && !b.research)) {
    const tech = w.availableTech(team, b.type).find(t => w.canPay(team, t.cost) && w.ageRequirements(team, t.id));
    if (tech) w.research(b.id, tech.id);
  }
  const enemies = [...w.buildings, ...w.units].filter(e => e.hp > 0 && !e.garrison && w.isEnemy(team, e.team));
  const threats = enemies.filter(e => distance(e, origin) < 18), targets = enemies;
  const target = targets.sort((a, b) => (a.type === 'town' ? -200 : 0) + distance(a, origin) - ((b.type === 'town' ? -200 : 0) + distance(b, origin)))[0];
  const attacking = w.project.rules.ai !== 'calm' && target && (threats.length || army.length >= 6 || !town || w.time > 120);
  directHealers(w, army, enemies, attacking);
  directAICombat(w, team, army, origin, enemies, target, attacking, attacking ? strategicOrders(w, team, army, target) : new Map());
}
