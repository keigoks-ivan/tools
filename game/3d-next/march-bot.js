/**
 * Scripted autopilot for the march level. Reads only public director / Arena state and returns
 * the same input object a player would produce ({ x, y, attack, heavy, dodge, special }).
 * Used by the node test (the level must be finishable) and by march-preview.html (?bot=1).
 */
import { LEVEL, insideSegment, toPx, toWorld } from './march.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function insideHazard(hazard, p, margin) {
  if (hazard.shape === 'circle') return Math.hypot(p.x - hazard.x, p.y - hazard.y) <= hazard.radius + margin;
  const dx = p.x - hazard.x, dy = p.y - hazard.y;
  const along = dx * Math.cos(hazard.facing) + dy * Math.sin(hazard.facing);
  const across = -dx * Math.sin(hazard.facing) + dy * Math.cos(hazard.facing);
  return along >= -margin && along <= hazard.length + margin && Math.abs(across) <= hazard.width / 2 + margin;
}

/**
 * expert: reads telegraph timers exactly and always dodges (a lower bound on clear time).
 * casual: re-plans every 0.3 s and dodges only 45 % of threats (a rough human stand-in).
 */
export const BOT_SKILLS = {
  expert: { reaction: 0, dodgeChance: 1 },
  casual: { reaction: 0.3, dodgeChance: 0.45 },
};

export function createMarchBot({ skill = 'expert', seed = 7 } = {}) {
  const profile = BOT_SKILLS[skill] || BOT_SKILLS.expert;
  let randomState = seed >>> 0;
  const rand = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const decided = new Map();   // threat key → will this bot dodge it?
  const willDodge = key => {
    if (!decided.has(key)) decided.set(key, rand() < profile.dodgeChance);
    if (decided.size > 200) decided.delete(decided.keys().next().value);
    return decided.get(key);
  };
  let planAt = -Infinity, planned = null;

  function plan(march, live, fighters) {
    const hero = march.arena.hero, segment = march.segmentIndex;
    const nearest = (list, from = hero) => list.reduce((best, item) => !best || dist(item, from) < dist(best, from) ? item : best, null);
    let target = null, goal = null;
    const region = [LEVEL.segments[segment]];
    const wanted = march.pickups.filter(item => region.some(s => insideSegment(s, toWorld(item.x, item.y)))
      && (item.amount > 0 && hero.hp < hero.maxHp || item.energy > 0 && hero.energy < 100));
    const pickup = nearest(wanted);
    const crate = nearest(live.filter(enemy => enemy.kind === 'breakable'));
    const closeFoe = nearest(fighters);
    if (pickup && dist(pickup, hero) < 600) goal = pickup;
    else if (crate && hero.hp < hero.maxHp * 0.75 && dist(crate, hero) < 420 && !(closeFoe && dist(closeFoe, hero) < 150)) target = crate;
    else if (march.gates[segment]?.open) {
      const entry = LEVEL.segments[segment + 1].entry;
      goal = toPx(entry.x, entry.z - 2);
      const close = nearest(fighters);
      if (close && dist(close, hero) < 120) target = close;
    } else if (segment === 1 && live.some(enemy => enemy.kind === 'lantern')) {
      const close = nearest(fighters);
      target = close && dist(close, hero) < 150 ? close : nearest(live.filter(enemy => enemy.kind === 'lantern'));
    } else if (segment === 2 && march.hud().timer !== null) {
      const lamp = toPx(LEVEL.lamp.x, LEVEL.lamp.z);
      const raiders = fighters.filter(enemy => enemy.kind === 'raider');
      const close = nearest(fighters);
      target = raiders.length ? nearest(raiders, lamp) : close && dist(close, lamp) < 360 ? close : null;
      if (!target) goal = { x: lamp.x, y: lamp.y + 90 };
    } else {
      target = nearest(fighters);
    }
    if (!target && !goal) {
      const s = LEVEL.segments[segment];
      goal = toPx(s.shape === 'circle' ? s.cx : 0, s.shape === 'circle' ? s.cz : (s.minZ + s.maxZ) / 2);
    }
    return { targetId: target ? target.id : null, goal };
  }

  return function botInput(march) {
    const arena = march.arena, hero = arena.hero;
    if (march.state !== 'play' || hero.action === 'dead') return {};
    const live = arena.enemies.filter(enemy => enemy.action !== 'dead');
    const fighters = live.filter(enemy => !enemy.prop);

    // 1. Dodge out of ground telegraphs and enemy tells that are about to land.
    const canDodge = hero.dodgeCooldown <= 0 && hero.action !== 'dodge' && hero.action !== 'special';
    if (canDodge) {
      for (const hazard of march.hazards) {
        const left = hazard.until - march.time;
        if (left < 0 || left > 0.3 || !insideHazard(hazard, hero, 25) || !willDodge(`h${hazard.id}`)) continue;
        const away = hazard.shape === 'circle' ? Math.atan2(hero.y - hazard.y, hero.x - hazard.x) : hazard.facing + Math.PI / 2;
        return { x: Math.cos(away), y: Math.sin(away), dodge: true };
      }
      const tell = live.find(enemy => enemy.ai !== 'external' && enemy.action === 'telegraph' && enemy.telegraph < 0.2
        && dist(enemy, hero) <= enemy.range + 35);
      if (tell && willDodge(`t${tell.id}:${Math.round((march.time - tell.actionTime) * 10)}`)) {
        const away = Math.atan2(hero.y - tell.y, hero.x - tell.x);
        return { x: Math.cos(away), y: Math.sin(away), dodge: true };
      }
    }

    // Standing in a red telegraph that is still filling: walk out of it (after the reaction delay).
    const danger = march.hazards.find(hazard => march.time - hazard.start >= profile.reaction && insideHazard(hazard, hero, 30));
    if (danger) {
      const away = danger.shape === 'circle' ? Math.atan2(hero.y - danger.y, hero.x - danger.x) : danger.facing + Math.PI / 2;
      return { x: Math.cos(away), y: Math.sin(away) };
    }

    // 2. Goal: heal pickups, the next segment, the objective, then the nearest foe (re-planned
    //    every `reaction` seconds, or when the held target is gone).
    const held = planned?.targetId ? live.find(enemy => enemy.id === planned.targetId) : null;
    if (!planned || march.time >= planAt + profile.reaction || planned.targetId && !held) {
      planned = plan(march, live, fighters);
      planAt = march.time;
    }
    const target = planned.targetId ? live.find(enemy => enemy.id === planned.targetId) : null;
    const goal = planned.goal;

    // 3. Move and attack.
    const input = { x: 0, y: 0 };
    const steer = (tx, ty) => {
      const dx = tx - hero.x, dy = ty - hero.y, d = Math.hypot(dx, dy) || 1;
      input.x = dx / d; input.y = dy / d;
      return d;
    };
    if (target) {
      const d = steer(target.x, target.y);
      const reach = target.prop ? 120 : target.role === 'boss' ? 150 : 165;
      if (d < 110) { input.x *= 0.2; input.y *= 0.2; }
      // Guarded officers / boss: open with a heavy (guard break), then chain lights while they are stunned.
      const guarded = target.guard && !((target.guardBrokenUntil ?? -Infinity) > arena.time) && !((target.guardRearmUntil ?? -Infinity) > arena.time);
      if (d < reach) input[guarded ? 'heavy' : 'attack'] = true;
      const crowd = fighters.filter(enemy => dist(enemy, hero) < 260).length;
      if (hero.energy >= 100 && (crowd >= 4 || (target.role === 'boss' || target.role === 'officer') && d < 250)) input.special = true;
    } else if (goal) {
      steer(goal.x, goal.y);
    }
    return input;
  };
}

/** Runs a full level headlessly. Returns { state, time, frames, result, stats, trace, hero }. */
export function runMarchBot(march, { dt = 1 / 30, maxSeconds = 1500, onFrame = null, skill = 'expert' } = {}) {
  const bot = createMarchBot({ skill, seed: march.seed });
  let frames = 0;
  const trace = [];
  let lastSegment = march.segmentIndex;
  while (march.state === 'play' && march.time < maxSeconds) {
    march.update(dt, bot(march));
    const events = march.drainEvents();
    frames++;
    if (march.segmentIndex !== lastSegment) { trace.push({ segment: march.segmentIndex, at: march.time, hp: march.arena.hero.hp }); lastSegment = march.segmentIndex; }
    onFrame?.(march, frames, events);
  }
  return { state: march.state, time: march.time, frames, result: march.result, stats: march.stats, trace, hero: toWorld(march.arena.hero.x, march.arena.hero.y) };
}
