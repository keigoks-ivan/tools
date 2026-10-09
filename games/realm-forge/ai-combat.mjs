import { BUILDINGS, buildingDistance } from './core.mjs?v=20261009l';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fighter = e => e.kind === 'unit' && !['worker', 'trader', 'healer'].includes(e.blueprint.role);
const enemyAlive = (w, team, e) => e && e.hp > 0 && !e.garrison && w.isEnemy(team, e.team);
const activeFight = (w, u) => enemyAlive(w, u.team, w.entity(u.autoTarget)) || u.order?.type === 'attack' && enemyAlive(w, u.team, w.entity(u.order.target)) && w.entity(u.order.target).kind === 'unit';
const threat = e => fighter(e) || e.kind === 'building' && e.progress === 1 && (e.type === 'town' ? e.garrisoned?.length > 0 : BUILDINGS[e.type].attack > 0);
const rank = e => fighter(e) ? 0 : threat(e) ? 4 : e.kind === 'unit' ? 10 : 18;
const clone = value => value ? JSON.parse(JSON.stringify(value)) : null;

// Build one small spatial index per planning pass, not an all-pairs scan every tick.
function spatial(w) {
  const cells = new Map();
  for (const e of [...w.units, ...w.buildings]) if (e.hp > 0 && !e.garrison) {
    const key = `${Math.floor(e.x / 8)},${Math.floor(e.y / 8)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(e);
  }
  return (p, radius) => {
    const result = [];
    for (let y = Math.floor((p.y - radius) / 8); y <= Math.floor((p.y + radius) / 8); y++) for (let x = Math.floor((p.x - radius) / 8); x <= Math.floor((p.x + radius) / 8); x++) {
      for (const e of cells.get(`${x},${y}`) || []) if (distance(p, e) <= radius) result.push(e);
    }
    return result;
  };
}
function sameRoute(old, next) {
  return old?.type === next.type && old.aiObjective === next.aiObjective && old.aiTactic === next.aiTactic && old.aiThreat === next.aiThreat && (next.type === 'attack' ? old.target === next.target : distance(old, next) < 2);
}
function send(w, u, order) {
  const old = u.order;
  if (!u.failed && old?.type === 'attackMove' && order.type === 'attackMove' && old.aiObjective === order.aiObjective && !old.aiThreat && !order.aiThreat && (old.aiTactic || 'advance') === 'advance' && (order.aiTactic || 'advance') === 'advance') {
    // Progress metadata may advance without throwing away the walking route.
    for (const key of ['aiRallyReleased', 'aiFlankPassed']) if (order[key]) old[key] = order[key];
    return;
  }
  if (order.type === 'attackMove' && w.blocked(order.x, order.y)) { const point = w.nearestOpen(order); if (!point) return; order = { ...order, ...point }; }
  if (!sameRoute(old, order) || u.failed) w.command([u.id], order);
}
function mission(w, u, objective, suggestions) {
  if (!enemyAlive(w, u.team, objective)) return null;
  // Siege engines that reach the front keep a precise building objective.
  if (u.blueprint.family === 'siege' && objective.kind === 'building' && buildingDistance(u, objective) <= u.blueprint.range + 3) return { type: 'attack', target: objective.id, aiObjective: objective.id, aiTactic: 'siege' };
  return suggestions.get(u.id) || { type: 'attackMove', x: objective.x, y: objective.y, aiObjective: objective.id, aiTactic: 'advance' };
}
function restore(w, u, state, objective, suggestions) {
  u.stance = state.stance || 'aggressive';
  const saved = state.resume, savedGoal = w.entity(saved?.aiObjective);
  const order = saved?.type === 'attack' && enemyAlive(w, u.team, w.entity(saved.target)) || saved?.type === 'attackMove' && enemyAlive(w, u.team, savedGoal) ? saved : mission(w, u, objective, suggestions);
  if (order) w.command([u.id], order); else w.command([u.id], null);
  if (state.queued) u.queued = clone(state.queued);
}
function safeAnchor(w, u, local, allies) {
  const options = allies.filter(e => e.id !== u.id && (e.kind === 'unit' ? e.blueprint.role === 'healer' && e.hp >= e.maxHp * .5 : e.progress === 1 && ['town', 'castle', 'tower'].includes(e.type)) && distance(u, e) <= 16);
  return options.filter(e => !local(e, 12).some(t => enemyAlive(w, u.team, t) && threat(t) && distance(e, t) <= Math.max(6, (t.blueprint?.range || BUILDINGS[t.type]?.range || 0) + 2)))
    .sort((a, b) => (a.kind === 'unit' ? -5 : 0) + distance(u, a) - ((b.kind === 'unit' ? -5 : 0) + distance(u, b)))[0];
}
function tacticalMove(w, u, point, stateKey, state, marker) {
  const spot = w.nearestOpen(point);
  if (!spot || distance(u, spot) < .6 || distance(u, spot) > 18) return false;
  u[stateKey] = state;
  u.stance = 'passive';
  w.command([u.id], { type: 'move', ...spot, aiObjective: state.resume?.aiObjective, [marker]: true });
  return true;
}

export function directAICombat(w, team, army, origin, enemies, objective, attacking, suggestions = new Map()) {
  if (!attacking || ['off', 'calm'].includes(w.project.rules.ai)) return;
  w.aiCombatPlans ||= {};
  if (w.time - (w.aiCombatPlans[team] ?? -10) < 1) return;
  w.aiCombatPlans[team] = w.time;
  const fighters = army.filter(u => u.blueprint.role !== 'healer'), local = spatial(w), allies = [...w.units, ...w.buildings].filter(e => e.hp > 0 && !e.garrison && w.isAlly(team, e.team));
  const held = new Set();
  for (const u of fighters) {
    if (u.aiRetreat) {
      held.add(u.id);
      if (u.hp >= u.maxHp * .6) { const state = u.aiRetreat; delete u.aiRetreat; restore(w, u, state, objective, suggestions); }
      else {
        const anchor = w.entity(u.aiRetreat.anchor);
        if (!anchor || local(anchor, 12).some(e => enemyAlive(w, team, e) && threat(e) && distance(anchor, e) <= Math.max(6, (e.blueprint?.range || BUILDINGS[e.type]?.range || 0) + 2))) {
          const replacement = safeAnchor(w, u, local, allies);
          if (replacement) {
            const span = distance(u, replacement) || 1;
            tacticalMove(w, u, { x: replacement.x + (replacement.x - u.x) / span * (replacement.kind === 'unit' ? 0 : 3), y: replacement.y + (replacement.y - u.y) / span * (replacement.kind === 'unit' ? 0 : 3) }, 'aiRetreat', { ...u.aiRetreat, anchor: replacement.id, holding: false, started: w.time }, 'aiRetreat');
          } else if (!u.aiRetreat.holding) {
            // Losing the refuge must not leave a passive unit waiting in danger.
            u.aiRetreat.holding = true; u.stance = 'stand'; w.command([u.id], null);
          }
        } else if (!u.aiRetreat.holding && (!u.order || u.failed || w.time - u.aiRetreat.started > 25)) {
          // An unhealed soldier can defend its refuge while waiting for a monk.
          u.aiRetreat.holding = true; u.stance = 'stand'; w.command([u.id], null);
        }
      }
      continue;
    }
    if (u.aiKite) {
      held.add(u.id);
      if (w.time >= u.aiKite.until || u.failed || !u.order) { const state = u.aiKite; delete u.aiKite; restore(w, u, state, objective, suggestions); }
      continue;
    }
    const nearby = local(u, 8), hostiles = nearby.filter(e => enemyAlive(w, team, e) && threat(e)), friends = nearby.filter(e => e.id !== u.id && w.isAlly(team, e.team) && fighter(e));
    const recent = w.time - (u.recentAttackAt ?? -100) < 4, anchor = u.hp <= u.maxHp * .25 && hostiles.length ? safeAnchor(w, u, local, allies) : null;
    if (anchor && (hostiles.length > friends.length + 1 || anchor.kind === 'unit') && (recent || hostiles.length)) {
      const span = distance(u, anchor) || 1, point = { x: anchor.x + (anchor.x - u.x) / span * (anchor.kind === 'unit' ? 0 : 3), y: anchor.y + (anchor.y - u.y) / span * (anchor.kind === 'unit' ? 0 : 3) };
      if (tacticalMove(w, u, point, 'aiRetreat', { resume: clone(u.order) || mission(w, u, objective, suggestions), stance: u.stance, queued: clone(u.queued), anchor: anchor.id, started: w.time }, 'aiRetreat')) { held.add(u.id); continue; }
    }
    const melee = hostiles.filter(e => e.kind === 'unit' && e.blueprint.role === 'melee').sort((a, b) => distance(u, a) - distance(u, b))[0];
    if (melee && u.blueprint.role === 'ranged' && u.blueprint.range >= 3 && !u.blueprint.packed && !(u.packLeft > 0) && distance(u, melee) < Math.max(2.2, (u.blueprint.minRange || 0) + .6)) {
      const d = distance(u, melee) || 1, point = { x: u.x + (u.x - melee.x || 1) / d * 3, y: u.y + (u.y - melee.y) / d * 3 };
      if (!local(point, 3).some(e => enemyAlive(w, team, e) && threat(e) && e.id !== melee.id) && tacticalMove(w, u, point, 'aiKite', { resume: clone(u.order) || mission(w, u, objective, suggestions), stance: u.stance, queued: clone(u.queued), until: w.time + 1.2 }, 'aiKite')) { held.add(u.id); }
    }
  }
  // A small local response covers a raid without ordering the whole army home.
  const raids = allies.filter(e => w.time - (e.recentAttackAt ?? -100) < 4).map(e => ({ victim: e, attacker: w.entity(e.recentAttacker) })).filter(r => enemyAlive(w, team, r.attacker)).sort((a, b) => rank(a.attacker) - rank(b.attacker));
  let supportBudget = Math.min(6, Math.max(1, Math.ceil(fighters.length / 4)));
  for (const raid of raids) {
    const support = fighters.filter(u => !held.has(u.id) && !activeFight(w, u) && distance(u, raid.attacker) <= 12 && distance(u, raid.victim) <= 12).sort((a, b) => distance(a, raid.attacker) - distance(b, raid.attacker));
    for (const u of support.slice(0, supportBudget)) {
      send(w, u, { type: 'attackMove', x: raid.attacker.x, y: raid.attacker.y, aiObjective: objective.id, aiThreat: raid.attacker.id, aiTactic: 'intercept', ...(u.order?.aiObjective === objective.id ? { aiRallyReleased: u.order.aiRallyReleased, aiFlankPassed: u.order.aiFlankPassed } : {}) });
      held.add(u.id); supportBudget--;
    }
    if (!supportBudget) break;
  }
  for (const u of fighters) {
    if (held.has(u.id) || activeFight(w, u)) continue;
    const current = w.entity(u.order?.target), currentObjective = w.entity(u.order?.aiObjective), defending = u.order?.aiThreat && w.entity(u.order.aiThreat);
    if (u.order?.type === 'attack' && enemyAlive(w, team, current) && current.kind === 'building' && buildingDistance(u, current) <= u.blueprint.range + .3) { u.order.aiObjective ??= current.id; continue; }
    if (u.order?.type === 'attackMove' && enemyAlive(w, team, currentObjective) && defending && enemyAlive(w, team, defending) && distance(u, defending) < 14) continue;
    if (['guard', 'patrol'].includes(u.order?.type) && !u.failed) continue;
    const order = mission(w, u, objective, suggestions);
    if (order) send(w, u, order);
  }
}
