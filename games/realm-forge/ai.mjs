import { BUILDINGS, RESOURCE } from './core.mjs?v=20261009l';
import { directAICombat } from './ai-combat.mjs?v=20261009l';
import { strategicOrders } from './ai-strategy.mjs?v=20261009l';

// Decision plans of the fair levels. Legacy levels have no plan and keep the original behaviour.
// ageUpWorkers / ageUpAt are indexed by the current age (dark, feudal, castle): the AI clicks the next age
// only with that many villagers and not before that game time. armyAfterWorkers holds soldier production
// back until the economy stands; attackArmy is the fighter count that launches an attack.
const PLAN = {
  easy: { think: 3, workers: .6, ageUpWorkers: [22, 32, 36], ageUpAt: [780, 1500, 2400], armyAfterWorkers: 24, darkArmy: 4, attackArmy: 18, attackAge: 1, retreatArmy: 6, tactics: false },
  standard: { think: 1.5, workers: 1, ageUpWorkers: [20, 50, 60], ageUpAt: [0, 1100, 1700], armyAfterWorkers: 20, darkArmy: 6, attackArmy: 10, attackAge: 1, retreatArmy: 5, tactics: true },
  challenging: { think: 1.5, workers: 1, ageUpWorkers: [17, 44, 56], ageUpAt: [0, 1000, 1500], armyAfterWorkers: 16, darkArmy: 10, attackArmy: 8, attackAge: 1, retreatArmy: 4, tactics: true },
};
// Fair levels (easy, standard, challenging) never exceed 1x. insane and the three legacy levels multiply rates: they cheat.
export const AI_PROFILES = {
  off: { gather: 1, build: 1, train: 1, trade: 1 },
  calm: { gather: 2, build: 2, train: 2, trade: 1.5, cheat: true },
  normal: { gather: 3, build: 3, train: 3, trade: 2, cheat: true },
  hard: { gather: 5, build: 4, train: 4, trade: 3, cheat: true },
  easy: { gather: .8, build: 1, train: .9, trade: 1, plan: PLAN.easy },
  standard: { gather: 1, build: 1, train: 1, trade: 1, plan: PLAN.standard },
  challenging: { gather: 1, build: 1, train: 1, trade: 1, plan: PLAN.challenging },
  insane: { gather: 1.5, build: 1.5, train: 1.5, trade: 1.5, cheat: true, plan: PLAN.challenging },
};
/** Names and one-line explanations for the settings dialog. */
export const AI_LEVELS = {
  easy: { name: '簡單', note: '採集 0.8 倍、決策慢、不會側翼與拉扯、晚出兵', cheat: false },
  standard: { name: '標準', note: '1 倍資源與速度，不作弊', cheat: false },
  challenging: { name: '困難', note: '1 倍資源與速度，不作弊；升級與出兵更積極', cheat: false },
  insane: { name: '極難（作弊）', note: '作弊：採集、生產、研發、貿易 1.5 倍', cheat: true },
  calm: { name: '和平建設（作弊）', note: '作弊：2 倍採集與生產，不主動進攻', cheat: true },
  normal: { name: '舊版標準（作弊）', note: '作弊：3 倍採集與生產', cheat: true },
  hard: { name: '舊版積極（作弊）', note: '作弊：5 倍採集、4 倍生產', cheat: true },
  off: { name: '沙盒 · 不出兵', note: 'AI 不行動', cheat: false },
};
const cavalry = u => u.blueprint.family === 'cavalry' || u.blueprint.look === 'knight';
const military = u => u?.blueprint && !['worker', 'trader'].includes(u.blueprint.role);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const armyClass = bp => bp.role === 'healer' ? 'support' : bp.family === 'siege' ? 'siege' : 'troops';
const MILITARY_BUILDINGS = ['barracks', 'archery', 'stable', 'siege', 'castle', 'monastery'];

// Rotate construction searches after a failure. A locally valid clearing may be
// disconnected from the builder; continually choosing it used to stop housing.
function buildNext(w, team, workers, sites, origin, priorities, plan = null) {
  const pool = workers.filter(u => u.order?.type !== 'build' && u.order?.type !== 'deliver');
  if (!pool.length) return;
  w.aiConstruction ||= {};
  const attempt = w.aiConstruction[team] || 0;
  const anchor = pool[attempt % pool.length];
  let searches = 0;
  for (const type of priorities) {
    const spec = BUILDINGS[type];
    if ((spec.age || 0) > w.age(team) || !w.buildRequirements(team, type)) continue;
    // Fair levels queue like a build order: a cheap wood building at the head of the list is saved for, not skipped.
    if (!w.canPay(team, spec.cost)) { if (plan && type === priorities[0] && Object.entries(spec.cost).every(([r, v]) => r === 'wood' || w.stocks[team][r] >= v)) return; continue; }
    let near = { x: origin.x + 8 + sites.length % 5 * 4, y: origin.y - 8 + Math.floor(sites.length / 5) % 6 * 4 };
    if (['lumber', 'mill', 'mining'].includes(type)) {
      const resource = { lumber: 'wood', mill: 'food', mining: 'gold' }[type];
      near = (plan ? campSite(w, team, origin, resource) : null) || w.closestResource(anchor, resource) || near;
    } else if (type === 'farm') near = sites.find(b => b.type === 'mill' && b.progress === 1) || origin;
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
        // Fair levels restart at the preferred site after a success; only a failed search rotates the anchors.
        if (!w.build([worker.id], type, point.x, point.y)) { w.aiConstruction[team] = plan ? 0 : attempt + 1; return; }
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

// ---- What the AI may know -------------------------------------------------------------
// With rules.aiVision === 'fair' the AI sees what its own units and buildings see (same radii as the
// player) and remembers enemy buildings it has seen; it does not read the world state.
const disc = r => { const cells = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) cells.push([dx, dy]); return cells; };
const SIGHT = { 5: disc(5), 7: disc(7), 8: disc(8), 22: disc(22) };
export function initAIKnowledge(w) {
  const n = w.map.size;
  Object.assign(w, { aiExplored: new Uint8Array(n * n), aiSeen: new Uint8Array(n * n), aiSeenList: [], aiRemembered: new Set(), aiExploredCount: 0, aiKnowAt: -10, aiStats: {} });
  // A kingdom knows its own backyard from the start; everything else has to be discovered.
  for (let team = 1; team < w.teams; team++) { const s = w.map.spawns[team]; for (const [dx, dy] of SIGHT[22]) reveal(w, Math.round(s.x) + dx, Math.round(s.y) + dy, false); }
  refreshAIKnowledge(w, true);
}
function reveal(w, x, y, seen) {
  const n = w.map.size; if (x < 0 || y < 0 || x >= n || y >= n) return;
  const i = y * n + x; if (!w.aiExplored[i]) { w.aiExplored[i] = 1; w.aiExploredCount++; }
  if (seen && !w.aiSeen[i]) { w.aiSeen[i] = 1; w.aiSeenList.push(i); }
}
export function refreshAIKnowledge(w, force = false) {
  if (!w.aiFair || !force && w.time - w.aiKnowAt < .5) return;
  w.aiKnowAt = w.time;
  for (const i of w.aiSeenList) w.aiSeen[i] = 0;
  w.aiSeenList = [];
  for (const e of w.units) if (e.team > 0 && e.hp > 0 && !e.garrison) { const x0 = Math.round(e.x), y0 = Math.round(e.y); for (const [dx, dy] of SIGHT[e.blueprint.id === 'scout' ? 8 : 5]) reveal(w, x0 + dx, y0 + dy, true); }
  for (const b of w.buildings) if (b.team > 0 && b.hp > 0) { const x0 = Math.round(b.x), y0 = Math.round(b.y); for (const [dx, dy] of SIGHT[7]) reveal(w, x0 + dx, y0 + dy, true); }
  for (const b of w.buildings) if (b.team === 0 && b.hp > 0 && !w.aiRemembered.has(b.id) && seenNow(w, b)) w.aiRemembered.add(b.id);
}
const seenNow = (w, e) => Boolean(w.aiSeen[clamp(Math.round(e.y), 0, w.map.size - 1) * w.map.size + clamp(Math.round(e.x), 0, w.map.size - 1)]);
/** Enemy units in sight right now plus enemy buildings seen at least once. Everything, when the AI is not fair. */
export function knownEnemies(w, team) {
  const all = [...w.buildings, ...w.units].filter(e => e.hp > 0 && !e.garrison && w.isEnemy(team, e.team));
  return w.aiFair ? all.filter(e => e.kind === 'building' ? w.aiRemembered.has(e.id) : seenNow(w, e)) : all;
}
const stats = (w, team) => (w.aiStats ||= {})[team] ||= { firstAttackAt: null, foundEnemyAt: null, launched: false, ageUpAt: [] };

// A resource tile is worth working only when a finished drop-off for it stands close by (walking back and forth
// across the map wastes most of the 0.3-0.4/s gather rate). The town centre takes every resource.
function usableResource(w, team, u, type) {
  const drops = w.buildings.filter(b => b.team === team && b.hp > 0 && b.progress === 1 && BUILDINGS[b.type].dropoff?.includes(type));
  if (!drops.length) return null;
  const n = w.map.size, r = 55; let best = null, d = Infinity;
  for (let y = Math.max(0, Math.round(u.y) - r); y <= Math.min(n - 1, Math.round(u.y) + r); y++) for (let x = Math.max(0, Math.round(u.x) - r); x <= Math.min(n - 1, Math.round(u.x) + r); x++) {
    if (w.amountAt(x, y) <= 0 || RESOURCE[w.tile(x, y)] !== type || w.aiFair && !w.aiExplored[y * n + x]) continue;
    const dd = Math.hypot(u.x - x, u.y - y);
    if (dd < d && drops.some(b => distance(b, { x, y }) <= 7)) { d = dd; best = { x, y }; }
  }
  return best;
}
// Pick a farm-free camp spot: the resource tile with the densest same-type neighbourhood among the known ones.
function campSite(w, team, origin, type) {
  w.aiCamps ||= {}; const key = `${team}:${type}`, cached = w.aiCamps[key];
  if (cached && w.time - cached.at < 10) return cached.point;
  const drops = w.buildings.filter(b => b.team === team && b.hp > 0 && BUILDINGS[b.type].dropoff?.includes(type) && b.type !== 'town');
  const n = w.map.size, r = 40; let best = null, bestScore = -Infinity;
  for (let y = Math.max(0, Math.round(origin.y) - r); y <= Math.min(n - 1, Math.round(origin.y) + r); y++) for (let x = Math.max(0, Math.round(origin.x) - r); x <= Math.min(n - 1, Math.round(origin.x) + r); x++) {
    if (w.amountAt(x, y) <= 0 || RESOURCE[w.tile(x, y)] !== type || w.aiFair && !w.aiExplored[y * n + x] || drops.some(b => distance(b, { x, y }) <= 7)) continue;
    let dense = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (w.amountAt(x + dx, y + dy) > 0 && RESOURCE[w.tile(x + dx, y + dy)] === type) dense++;
    const score = Math.min(dense, 20) - distance(origin, { x, y }) * .4;
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  w.aiCamps[key] = { at: w.time, point: best };
  return best;
}

export function updateAI(w, team) {
  if (w.project.rules.ai === 'off') return;
  refreshAIKnowledge(w);
  const plan = AI_PROFILES[w.project.rules.ai]?.plan || null;
  if (plan) { w.aiThinkAt ||= {}; if (w.time < (w.aiThinkAt[team] ?? 0)) return; w.aiThinkAt[team] = w.time + plan.think; }
  const units = w.units.filter(u => u.team === team && u.hp > 0 && !u.garrison);
  const workers = units.filter(u => u.blueprint.role === 'worker'), carts = units.filter(u => u.blueprint.role === 'trader');
  const sites = w.buildings.filter(b => b.team === team && b.hp > 0), town = sites.find(b => b.type === 'town'), origin = town || workers[0] || sites[0];
  if (!origin) return;
  const age = w.age(team), st = stats(w, team), known = knownEnemies(w, team), threats = known.filter(e => distance(e, origin) < 18);
  for (let a = 1; a <= age; a++) st.ageUpAt[a - 1] ??= Math.round(w.time);
  if (st.foundEnemyAt === null && known.some(e => e.kind === 'building')) st.foundEnemyAt = Math.round(w.time);
  const explorers = plan && w.aiFair ? directExplorers(w, team, units.filter(military), known, threats, origin) : [];
  const army = units.filter(u => military(u) && !explorers.includes(u));
  const workerId = w.project.units.find(u => u.role === 'worker' && !u.hero)?.id, market = sites.find(b => b.type === 'market' && b.progress === 1);
  const cap = w.project.rules.enemyPopulation, minimumCombat = Math.ceil(cap * .5), economicBudget = cap - minimumCombat;
  const workerLimit = Math.min(80, Math.max(10, Math.floor(cap * .3)), economicBudget) * (plan?.workers ?? 1) | 0;
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
  const militaryPriority = (plan ? threats.length > 0 : units.length >= 20) && army.filter(u => u.blueprint.role !== 'healer').length < Math.ceil(units.length * .5) && hasCombatProduction;
  // Fair levels: next age click, and the food it needs. The AI waits for villagers and game time, then saves up.
  const ageTech = plan && ['feudal', 'castle-age', 'imperial'][age] && w.availableTech(team, 'town').find(t => t.id === ['feudal', 'castle-age', 'imperial'][age]);
  const ageDue = Boolean(ageTech) && workers.length >= plan.ageUpWorkers[age] && w.time >= plan.ageUpAt[age] && w.ageRequirements(team, ageTech.id);
  // Held from the moment the age is due until the research starts, so the food is never spent on villagers in between.
  const saving = ageDue;
  const holdArmy = Boolean(plan) && !threats.length && (workers.length < plan.armyAfterWorkers || saving || age === 0 && plannedArmy >= plan.darkArmy);
  // Recover a damaged army before purchasing more civilians. Startup villagers
  // can still grow the economy until production and a substantial population exist.
  if (militaryPriority && !holdArmy) ready.sort((a, b) => Number(MILITARY_BUILDINGS.includes(b.type)) - Number(MILITARY_BUILDINGS.includes(a.type)));
  for (const b of ready) {
    const available = w.availableUnits(team, b.type);
    if (b.type === 'town' && !(militaryPriority && !holdArmy) && !saving) while (plannedWorkers < workerLimit && b.queue.length < (plan ? 2 : 5)) { if (w.train(b.id, workerId)) break; plannedWorkers++; }
    else if (b.type === 'market' && !militaryPriority && w.tradePartner(team, b)) while (plannedCarts < cartLimit && b.queue.length < 3) { if (w.train(b.id, 'trade-cart')) break; plannedCarts++; }
    else if (MILITARY_BUILDINGS.includes(b.type) && !holdArmy) {
      const choices = available.filter(u => military({ blueprint: u }) && (!militaryPriority || u.role !== 'healer'));
      while (choices.length && plannedArmy < armyLimit && b.queue.length < 4) {
        const affordable = choices.filter(u => composition[armyClass(u)] < limits[armyClass(u)] && w.canPay(team, { food: u.food, gold: u.gold, wood: u.wood || 0 }));
        if (!affordable.length) break;
        const bp = affordable[(b.queue.length + Math.floor(w.time / 20) + team) % affordable.length];
        if (w.train(b.id, bp.id)) break;
        plannedArmy++; composition[armyClass(bp)]++;
        if (plan && age === 0 && plannedArmy >= plan.darkArmy && !threats.length) break;
      }
    }
  }
  for (const cart of carts) if (!cart.order || cart.failed) w.startTrade(cart);
  const allocation = { food: 0, wood: 0, gold: 0, stone: 0 };
  // Food is the bottleneck of the early ramp (every villager costs 50), so the dark age leans on food and wood only.
  const desired = !plan ? { food: .4, wood: .34, gold: .22, stone: .04 } : age === 0 ? (workers.length < 10 ? { food: .75, wood: .25, gold: 0, stone: 0 } : workers.length < 20 ? { food: .5, wood: .5, gold: 0, stone: 0 } : { food: .5, wood: .42, gold: .06, stone: .02 }) : { food: .32, wood: .46, gold: .18, stone: .04 };
  for (const u of workers) {
    const job = u.order?.type === 'deliver' ? u.order.resume : u.order;
    if (job?.type === 'gather') { const resource = job.target ? 'food' : job.resource || RESOURCE[w.tile(job.x, job.y)]; if (resource) allocation[resource]++; }
  }
  const farms = sites.filter(b => b.type === 'farm' && b.progress === 1);
  for (const u of workers) if (!u.order || u.failed) {
    const types = Object.keys(desired).filter(t => !plan || desired[t] > 0).sort(plan ? (a, b) => (desired[b] * (workers.length + 1) - allocation[b]) - (desired[a] * (workers.length + 1) - allocation[a]) : (a, b) => allocation[a] / desired[a] - allocation[b] / desired[b]);
    for (const type of plan ? types : types.slice(0, 1)) {
      const point = plan ? usableResource(w, team, u, type) : w.closestResource(u, type);
      if (type === 'food' && plan && !point) {
        // Berries are gone or far away: work a free farm instead.
        const farm = farms.filter(f => !w.farmWorker(f, u.id)).sort((a, b) => distance(u, a) - distance(u, b))[0];
        if (farm) { w.command([u.id], { type: 'gather', target: farm.id }); allocation.food++; break; }
      }
      if (point) { w.command([u.id], { type: 'gather', ...point }); allocation[type]++; break; }
    }
    // Nothing near a drop-off yet (e.g. before the first camp): walk to the closest wood or food rather than stand idle.
    if (plan && (!u.order || u.failed)) for (const type of ['wood', 'food']) { const point = w.closestResource(u, type); if (point) { w.command([u.id], { type: 'gather', ...point }); allocation[type]++; break; } }
  }
  // Shift one villager per pass from an over-staffed resource to the most under-staffed one.
  if (plan) {
    const total = workers.length, gap = t => allocation[t] - desired[t] * total, give = Object.keys(desired).sort((a, b) => gap(b) - gap(a))[0], take = Object.keys(desired).sort((a, b) => gap(a) - gap(b))[0];
    if (gap(give) >= 2.5 && gap(take) <= -1.5) {
      const mover = workers.find(u => u.order?.type === 'gather' && !u.carried && (u.order.target ? 'food' : u.order.resource || RESOURCE[w.tile(u.order.x, u.order.y)]) === give);
      if (mover) w.command([mover.id], null);
    }
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
        const spare = w.capacity(team) + homes * 5 - w.population(team), room = w.capacity(team) + homes * 5 < cap;
        if (!town) priorities.push('town');
        if (!plan) {
          if (room && spare < Math.max(20, plannedWorkers - workers.length + plannedArmy - army.length)) priorities.push('house');
          for (const type of ['lumber', 'mill', 'mining', 'barracks', 'archery', 'stable', 'market']) if (!count(type)) priorities.push(type);
        } else {
          // Build order: house before the cap, wood line and mill first, farms once the berries thin out, then the rest.
          if (room && spare < Math.min(20, 5 + Math.floor(w.population(team) / 8))) priorities.push('house');
          if (age >= 1 && !count('barracks')) priorities.push('barracks');
          // A second town centre doubles villager output; it comes before the cheaper buildings so they cannot starve it.
          if (workers.length >= (count('town') < 2 ? 12 : 35) && (age >= 1 || count('town') < 2) && count('town') < Math.min(3, Math.ceil(workerLimit / 24))) priorities.push('town');
          for (const type of ['mill', 'lumber']) if (!count(type)) priorities.push(type);
          // Berries out of reach of any mill: a second mill is cheaper than farms (no wood for reseeding).
          if (count('mill') && count('mill') < 2 && !usableResource(w, team, origin, 'food')) { const patch = campSite(w, team, origin, 'food'); if (patch && distance(patch, origin) < 30) priorities.push('mill'); }
          const berries = usableResource(w, team, origin, 'food'), foodJobs = Math.round(workers.length * desired.food);
          if (count('mill') && count('farm') < (berries ? Math.max(0, foodJobs - 8) : foodJobs)) priorities.push('farm');
          // Dark age: mill + wood line already meet the feudal requirement, so nothing else is built unless the base is attacked.
          if (age === 0 && threats.length && !count('barracks')) priorities.push('barracks');
          // Trees next to a camp run out: when no tree stands within reach of any camp, put a new one beside the next grove.
          if (count('lumber') < 5 && !usableResource(w, team, origin, 'wood') && campSite(w, team, origin, 'wood')) priorities.push('lumber');
          if (age >= 1) {
            if (count('mining') < 3 && !usableResource(w, team, origin, 'gold') && campSite(w, team, origin, 'gold')) priorities.push('mining');
            if (!count('barracks')) priorities.push('barracks');
            for (const type of ['archery', 'stable', 'market']) if (!count(type)) priorities.push(type);
          }
        }
        if (!plan && workers.length > 12 && count('town') < Math.min(3, Math.ceil(workerLimit / 24))) priorities.push('town');
        for (const type of ['blacksmith', 'siege', 'monastery', 'castle']) if (!count(type)) priorities.push(type);
        if (!plan || age >= 1) for (const type of ['barracks', 'archery', 'stable']) if (count(type) < militaryGoal) priorities.push(type);
        if (!count('university')) priorities.push('university');
        buildNext(w, team, workers, sites, origin, priorities, plan);
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
    const options = w.availableTech(team, b.type).filter(t => w.canPay(team, t.cost) && w.ageRequirements(team, t.id));
    const tech = !plan ? options[0] : options.find(t => t.effect.age !== undefined ? ageDue && t.id === ageTech.id : !(saving && Object.keys(t.cost).some(r => ageTech.cost[r])) && (holdArmy ? ['town', 'lumber', 'mining', 'mill', 'market'].includes(b.type) : true));
    if (tech) w.research(b.id, tech.id);
  }
  const enemies = known;
  const rank = e => (e.type === 'town' ? -200 : 0) + distance(e, origin);
  let target, attacking;
  if (plan) {
    const fighters = army.filter(u => u.blueprint.role !== 'healer');
    if (!st.launched && fighters.length >= plan.attackArmy && age >= plan.attackAge && known.some(e => e.kind === 'building')) st.launched = true;
    else if (st.launched && fighters.length < plan.retreatArmy) st.launched = false;
    target = (threats.length && !st.launched ? threats : known).sort((a, b) => rank(a) - rank(b))[0];
    attacking = Boolean(target) && (threats.length > 0 || st.launched);
    if (st.launched && attacking && st.firstAttackAt === null) st.firstAttackAt = Math.round(w.time);
  } else {
    target = known.sort((a, b) => rank(a) - rank(b))[0];
    attacking = w.project.rules.ai !== 'calm' && target && (threats.length || army.length >= 6 || !town || w.time > 120);
    if (attacking && !threats.length && st.firstAttackAt === null) st.firstAttackAt = Math.round(w.time);
  }
  directHealers(w, army, enemies, attacking);
  directAICombat(w, team, army, origin, enemies, target, attacking, attacking && plan?.tactics !== false ? strategicOrders(w, team, army, target) : new Map(), plan?.tactics !== false);
}

// Fast riders explore (preferring ground far from home, where rivals usually are, and away from each other) until a
// good share of the map is known or the base is threatened. Passive stance keeps them out of fights; they rejoin afterwards.
function directExplorers(w, team, soldiers, known, threats, origin) {
  const current = soldiers.filter(u => u.aiExplorer);
  const baseKnown = known.some(e => e.kind === 'building');
  const wanted = !threats.length && w.aiExploredCount < w.map.size ** 2 * .6;
  if (!wanted) { for (const u of current) { delete u.aiExplorer; u.stance = 'aggressive'; if (u.order?.type === 'move') w.command([u.id], null); } return []; }
  const slots = baseKnown ? 1 : 2;
  const riders = soldiers.filter(u => !u.aiExplorer && cavalry(u) && u.blueprint.role !== 'healer').sort((a, b) => b.blueprint.speed - a.blueprint.speed);
  while (current.length < slots && riders.length) current.push(riders.shift());
  if (!current.length && !baseKnown) { const foot = soldiers.filter(u => u.blueprint.role !== 'healer' && u.blueprint.family !== 'siege'); if (foot.length >= 4) current.push(foot[0]); }
  for (const u of current.splice(slots)) { delete u.aiExplorer; u.stance = 'aggressive'; }
  const n = w.map.size, edge = v => clamp(Math.round(v), 4, n - 5);
  current.forEach((u, index) => {
    u.aiExplorer = true; u.stance = 'passive';
    if (u.order && !u.failed && u.order.type === 'move') return;
    // Route: first a loop around home (its own resources and the nearby ground), then the map centre and the far side,
    // which is where a rival usually starts on a symmetric map; after that the nearest unseen ground.
    if (!u.aiRoute) {
      u.aiRoute = [];
      if (index === 0) for (let k = 0; k < 6; k++) { const a = Math.PI * 2 * k / 6; u.aiRoute.push({ x: edge(origin.x + Math.cos(a) * 30), y: edge(origin.y + Math.sin(a) * 30) }); }
      const centre = { x: n / 2, y: n / 2 }, far = { x: edge(n - origin.x), y: edge(n - origin.y) };
      u.aiRoute.push(...(index === 0 ? [centre, far] : [far, { x: edge(n - origin.x), y: edge(origin.y) }, { x: edge(origin.x), y: edge(n - origin.y) }]));
      if (index === 0) { // start the loop at the point nearest to where the scout stands
        const ring = u.aiRoute.splice(0, 6), start = ring.reduce((best, p, i) => distance(u, p) < distance(u, ring[best]) ? i : best, 0);
        u.aiRoute.unshift(...ring.slice(start), ...ring.slice(0, start));
      }
    }
    let goal = null;
    while (u.aiRoute.length && !goal) { const p = u.aiRoute.shift(), spot = w.nearestOpen(p); if (spot && !w.aiExplored[spot.y * n + spot.x]) goal = spot; }
    if (!goal) {
      // Visit the best coarse grid point nobody has seen yet, so the sweep covers the map instead of hugging an edge.
      let best = Infinity;
      for (let y = 6; y < n - 3; y += 10) for (let x = 6; x < n - 3; x += 10) {
        if (w.aiExplored[y * n + x]) continue;
        const g = { x, y }, d = distance(u, g), score = d - .6 * distance(origin, g) + current.reduce((sum, o) => o === u ? sum : sum - .5 * Math.min(40, distance(o.order?.type === 'move' ? o.order : o, g)), 0);
        if (d > 4 && score < best && !w.blocked(x, y)) { best = score; goal = g; }
      }
    }
    if (goal) w.command([u.id], { type: 'move', ...goal });
  });
  return current;
}
