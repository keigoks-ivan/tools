import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_CAP, LAYOUT, LEVEL, MarchDirector, RANK_RULES, TUNING, heightAt, insideSegment, rankFor, toPx, toWorld } from '../3d-next/march.js';
import { runMarchBot } from '../3d-next/march-bot.js';

const STEP = 1 / 30;

function advance(march, seconds, { input = {}, each } = {}) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += STEP) {
    each?.(march);
    march.update(STEP, input);
    events.push(...march.drainEvents());
  }
  return events;
}

const heroZ = march => toWorld(march.arena.hero.x, march.arena.hero.y).z;
const godMode = march => { march.arena.hero.invulnerable = 10; };
const kill = (march, enemy) => march.arena._damageEnemy(enemy, 9999, 'heavy');
const fighters = march => march.arena.enemies.filter(enemy => !enemy.prop && enemy.action !== 'dead');

test('segment 1: killing the quota brings out officer 青牙; beating him opens the barrier; entering the plaza seals it and heals 10', () => {
  const march = new MarchDirector({ seed: 1 });
  assert.equal(march.segmentIndex, 0);
  assert.equal(march.hud().objective, `擊倒妖兵 0／${TUNING.market.goal}`);
  assert.equal(march.arena.musou, true);
  let events = [];
  let sawOfficer = false;
  while (!march.gates[0].open && march.time < 400) {
    if (march.hud().objective === `擊倒敵將 ${TUNING.officers.market.name}`) sawOfficer = true;
    events.push(...advance(march, 0.5, { each: godMode }));
    for (const enemy of fighters(march)) kill(march, enemy);
  }
  events.push(...advance(march, STEP));
  assert.equal(march.gates[0].open, true);
  assert.equal(march.seg.kills, TUNING.market.goal);
  assert.equal(march.stats.spawned.grunt + march.stats.spawned.runner, TUNING.market.goal, 'exactly the quota of grunts in the market');
  assert.ok(sawOfficer && events.some(event => event.type === 'officer' && event.variant === 'market'));
  assert.ok(events.some(event => event.type === 'officerDown' && event.name === TUNING.officers.market.name));
  assert.ok(events.some(event => event.type === 'gateOpen' && event.index === 0));
  assert.ok(events.filter(event => event.type === 'hint').length >= 3, 'light / heavy / dodge prompts');
  assert.equal(march.hud().objective, '前進：夜市廣場');
  march.arena.hero.hp = 50;
  march.pickups.length = 0;   // ignore the officer's heal drop here
  events = advance(march, 20, { input: { y: -1 }, each: m => { if (m.segmentIndex === 1) m.cap = 0; } });
  assert.equal(march.segmentIndex, 1);
  assert.equal(march.gates[0].open, false, 'barrier seals behind the hero');
  assert.equal(march.arena.hero.hp, 60);
  assert.ok(events.some(event => event.type === 'segment' && event.index === 1 && event.heal === 10));
  assert.ok(events.some(event => event.type === 'gateClose' && event.index === 0));
});

test('closed barriers and segment shapes keep the hero inside the current segment', () => {
  const march = new MarchDirector({ seed: 2, cap: 0 });
  advance(march, 15, { input: { y: -1 } });
  assert.ok(heroZ(march) >= LEVEL.gates[0].z - 1e-6, `crossed barrier 1 at z=${heroZ(march)}`);
  advance(march, 5, { input: { x: 1 } });
  assert.ok(toWorld(march.arena.hero.x, march.arena.hero.y).x <= 7 + 1e-6);
  march.skipTo(1);
  advance(march, 10, { input: { y: 1 } });
  assert.ok(heroZ(march) <= -30 + 1e-6, 'cannot walk back into the market');
  for (const [x, y] of [[1, 0], [-1, 0], [0, -1], [0.7, -0.7]]) {
    advance(march, 8, { input: { x, y } });
    const p = toWorld(march.arena.hero.x, march.arena.hero.y);
    assert.ok(Math.hypot(p.x - 0, p.z + 41) <= 12.5 + 1e-6, 'stays on the round plaza');
    assert.ok(p.z >= LEVEL.gates[1].z - 1e-6, 'barrier 2 holds');
  }
  // The fountain is solid.
  march.arena.hero.x = 640; march.arena.hero.y = 500 + -36 * 60;
  advance(march, 3, { input: { y: 1 } });
  const p = toWorld(march.arena.hero.x, march.arena.hero.y);
  assert.ok(Math.hypot(p.x - LEVEL.fountain.x, p.z - LEVEL.fountain.z) >= LEVEL.fountain.r);
  march.skipTo(3);
  advance(march, 12, { input: { y: 1 } });
  assert.ok(heroZ(march) <= LEVEL.segments[3].maxZ + 1e-6, 'no way back from the gate top');
});

test('segment 2: each demon lantern spawns a group every 6 s until it is broken', () => {
  const march = new MarchDirector({ seed: 3 });
  march.skipTo(1);
  const lanterns = march.arena.enemies.filter(enemy => enemy.kind === 'lantern');
  assert.equal(lanterns.length, 3);
  assert.ok(lanterns.every(lantern => lantern.hp === TUNING.plaza.lanternHp && lantern.fixed && lantern.prop));
  assert.equal(march.hud().objective, '打破妖燈 0／3');
  const spawns = [[], [], []];
  const clear = m => { godMode(m); m.arena.enemies = m.arena.enemies.filter(enemy => enemy.prop); };
  for (let t = 0; t < 14; t += STEP) {
    clear(march);
    march.update(STEP, {});
    for (const event of march.drainEvents()) if (event.type === 'lanternSpawn') {
      spawns[event.index].push(march.time);
      assert.equal(event.size, TUNING.plaza.groupSize);
    }
  }
  for (const times of spawns) {
    assert.ok(times.length >= 2);
    for (let i = 1; i < times.length; i++) assert.ok(Math.abs(times[i] - times[i - 1] - 6) < 0.05, `interval ${times[i] - times[i - 1]}`);
  }
  kill(march, lanterns[0]);
  const events = [];
  for (let t = 0; t < 13; t += STEP) { clear(march); march.update(STEP, {}); events.push(...march.drainEvents()); }
  assert.ok(events.some(event => event.type === 'lanternBroken' && event.index === 0 && event.broken === 1));
  assert.equal(events.filter(event => event.type === 'lanternSpawn' && event.index === 0).length, 0);
  assert.ok(events.filter(event => event.type === 'lanternSpawn' && event.index === 1).length >= 2);
  assert.equal(march.hud().objective, '打破妖燈 1／3');
});

test('officer 赤角 appears after the lanterns; defeating him staggers nearby grunts and drops +20 HP', () => {
  const march = new MarchDirector({ seed: 4 });
  march.skipTo(1);
  march.cap = 3;
  for (const lantern of march.arena.enemies.filter(enemy => enemy.kind === 'lantern')) kill(march, lantern);
  let events = advance(march, 1.5, { each: godMode });
  const appear = events.find(event => event.type === 'officer');
  assert.equal(appear.name, '赤角');
  const officer = march.arena.enemies.find(enemy => enemy.id === appear.enemyId);
  assert.equal(officer.hp, TUNING.officers.red.hp);
  assert.equal(officer.guard, true);
  assert.equal(march.hud().objective, '擊倒敵將 赤角');
  assert.equal(march.hud().foe.name, '赤角');
  march.arena.enemies = march.arena.enemies.filter(enemy => enemy === officer);
  const near = march.arena.spawn('grunt', officer.x + 200, officer.y, { kind: 'grunt', hp: 8 });
  const far = march.arena.spawn('grunt', 640, 500 + -33.5 * 60, { kind: 'grunt', hp: 8 });
  assert.ok(Math.hypot(far.x - officer.x, far.y - officer.y) > TUNING.staggerRadius * 60);
  kill(march, officer);
  events = advance(march, STEP);
  const stagger = events.find(event => event.type === 'stagger');
  assert.equal(stagger.count, 1);
  assert.equal(stagger.duration, 2);
  assert.equal(near.action, 'hit');
  assert.ok(near.hitStun > 1.9);
  assert.notEqual(far.action, 'hit');
  assert.ok(events.some(event => event.type === 'officerDown' && event.name === '赤角'));
  assert.equal(march.gates[1].open, true);
  assert.equal(march.pickups.length, 1);
  march.arena.hero.hp = 50;
  march.arena.hero.x = march.pickups[0].x; march.arena.hero.y = march.pickups[0].y;
  events = advance(march, STEP);
  assert.equal(march.arena.hero.hp, 70);
  assert.ok(events.some(event => event.type === 'pickup' && event.amount === 20));
});

test('segment 3: the lamp timer counts down, restarts when the lamp breaks, then 影爪 lunges', () => {
  const march = new MarchDirector({ seed: 5 });
  march.skipTo(2);
  const clock = seconds => `${Math.floor(Math.ceil(seconds) / 60)}:${String(Math.ceil(seconds) % 60).padStart(2, '0')}`;
  assert.equal(march.hud().objective, `守住魂燈 ${clock(TUNING.stairs.holdSeconds)}`);
  // Left alone, raiders climb the side stairs and hit the lamp.
  let events = advance(march, 8, { each: godMode });
  assert.ok(events.some(event => event.type === 'group' && event.side === -1) && events.some(event => event.type === 'group' && event.side === 1), 'both stairs');
  assert.ok(events.some(event => event.type === 'lampHit'), 'raiders reach the lamp');
  assert.ok(march.hud().timer < TUNING.stairs.holdSeconds - 6);
  // Nobody defends: the lamp breaks and the timer restarts.
  events = [];
  for (let t = 0; t < 30 && !events.some(event => event.type === 'lampBroken'); t += STEP) {
    godMode(march);
    march.update(STEP, {});
    events.push(...march.drainEvents());
  }
  assert.ok(events.some(event => event.type === 'lampBroken'));
  assert.equal(march.hud().timer, TUNING.stairs.holdSeconds);
  assert.equal(march.hud().objective, '魂燈重燃中…');
  advance(march, 2.5, { each: godMode });
  assert.ok(march.hud().timer < TUNING.stairs.holdSeconds && march.hud().timer > TUNING.stairs.holdSeconds - 1);
  assert.equal(march.hud().objective, `守住魂燈 ${clock(march.hud().timer)}`);
  // Hold for the full timer (clearing the field) → secured → 影爪.
  const clear = m => { godMode(m); m.arena.enemies = m.arena.enemies.filter(enemy => enemy.kind === 'officer'); };
  events = advance(march, TUNING.stairs.holdSeconds + 2, { each: clear });
  assert.ok(events.some(event => event.type === 'lampSecured'));
  const appear = events.find(event => event.type === 'officer');
  assert.equal(appear.name, '影爪');
  assert.equal(march.hud().objective, '擊倒敵將 影爪');
  const shadow = march.arena.enemies.find(enemy => enemy.id === appear.enemyId);
  events = advance(march, 12, { each: clear });
  const lunges = events.filter(event => event.type === 'groundTelegraph' && event.shape === 'line' && event.ownerId === shadow.id);
  assert.ok(lunges.length >= 3, `repeated lunges (${lunges.length})`);
  assert.ok(shadow.mode === 'recover' || lunges.length >= 3);
  kill(march, shadow);
  advance(march, STEP);
  assert.equal(march.gates[2].open, true);
});

test('boss: phase 1 slams with radius 3 m; at half hp it roars, summons 8, double-slams wider and follows with a sweep', () => {
  const march = new MarchDirector({ seed: 6 });
  march.skipTo(3);
  const boss = march.arena.enemies.find(enemy => enemy.kind === 'boss');
  assert.equal(boss.hp, TUNING.boss.hp);
  assert.equal(march.hud().foe.name, '鬼門守將');
  // Keep the hero across the platform from the boss (≥ 6 m) so it always chooses the jump slam.
  const keepAway = m => {
    godMode(m);
    const center = toPx(LEVEL.segments[3].cx, LEVEL.segments[3].cz);
    const dx = center.x - boss.x, dy = center.y - boss.y, d = Math.hypot(dx, dy);
    const ux = d > 1 ? dx / d : 0, uy = d > 1 ? dy / d : 1;
    m.arena.hero.x = center.x + ux * 7 * 60; m.arena.hero.y = center.y + uy * 7 * 60;
  };
  let events = advance(march, 5, { each: keepAway });
  const slam1 = events.find(event => event.type === 'groundTelegraph' && event.attack === 'slam');
  assert.equal(slam1.radius, 180);
  assert.ok(events.some(event => event.type === 'bossSlam'));
  assert.ok(events.some(event => event.type === 'bossJump'));
  boss.hp = boss.maxHp / 2 + 1;
  events = advance(march, 2, { each: keepAway });
  assert.ok(!events.some(event => event.type === 'bossPhase'));
  boss.hp = boss.maxHp / 2;
  events = advance(march, 4, { each: keepAway });
  assert.ok(events.some(event => event.type === 'bossPhase' && event.phase === 2));
  assert.ok(events.some(event => event.type === 'roar'));
  assert.equal(events.find(event => event.type === 'summon').count, TUNING.boss.summon);
  assert.equal(march.hud().foe.phase, 2);
  // Phase 2: the first landing immediately starts a second, wider telegraphed slam (same tick).
  const ticks = [];
  for (let t = 0; t < 8; t += STEP) {
    keepAway(march);
    march.arena.enemies = march.arena.enemies.filter(enemy => enemy === boss);
    march.update(STEP, {});
    ticks.push(march.drainEvents());
  }
  const wide = TUNING.boss.slamRadius[1] * 60;
  const landings = ticks.map((list, i) => list.some(event => event.type === 'bossSlam') ? i : -1).filter(i => i >= 0);
  assert.ok(landings.length >= 2);
  for (const i of landings) assert.equal(ticks[i].find(event => event.type === 'bossSlam').radius, wide);
  const landing = landings.find(i => ticks[i].some(event => event.type === 'groundTelegraph' && event.attack === 'slam'));
  const followUp = ticks[landing]?.find(event => event.type === 'groundTelegraph');
  assert.ok(followUp && followUp.attack === 'slam' && followUp.radius === wide, 'double jump slam');
  const secondLanding = landings.find(i => i > landing);
  assert.ok(secondLanding > landing);
  const after = ticks[secondLanding].find(event => event.type === 'groundTelegraph');
  assert.equal(after?.attack, 'sweep', 'the double slam ends in a follow-up sweep');
});

test('boss slam lands only when the hero stays in the red circle', () => {
  const march = new MarchDirector({ seed: 7 });
  march.skipTo(3);
  const hero = march.arena.hero;
  let hurt = 0;
  for (let t = 0; t < 6 && hurt === 0; t += STEP) {
    march.update(STEP, {});
    hurt += march.drainEvents().filter(event => event.type === 'hurt' && event.damage === TUNING.boss.slamDamage).length;
  }
  assert.equal(hurt, 1, 'standing still under the slam hurts');
  assert.ok(hero.hp <= 100 - TUNING.boss.slamDamage + TUNING.segmentHeal);
});

test('rank combines clear time, max combo and remaining hp', () => {
  assert.equal(rankFor({ time: 200, maxCombo: 70, hp: 90 }).rank, 'S');
  assert.equal(rankFor({ time: 300, maxCombo: 45, hp: 50 }).rank, 'A');
  assert.equal(rankFor({ time: 470, maxCombo: 30, hp: 45 }).rank, 'B');
  assert.equal(rankFor({ time: 900, maxCombo: 25, hp: 20 }).rank, 'C');
  assert.deepEqual(rankFor({ time: 450, maxCombo: 60, hp: 70 }).points, { time: 3, combo: 3, hp: 3 });
  assert.equal(rankFor({ time: 451, maxCombo: 59, hp: 69 }).total, 6);
  assert.equal(RANK_RULES.grades.at(-1)[1], 'C');
});

test('heightAt: flat street, three rising stair tiers, raised gate top', () => {
  assert.equal(heightAt(0, -10), 0);
  assert.equal(heightAt(0, -41), 0);
  const tiers = [-58, -67.5, -78].map(z => heightAt(0, z));
  assert.ok(tiers[0] > 0 && tiers[1] > tiers[0] && tiers[2] > tiers[1]);
  assert.equal(heightAt(0, -95), 3.6);
});

test('scripted bot clears the whole level within the enemy budget (desktop and mobile)', () => {
  for (const [seed, mobile] of [[17, false], [3, false], [17, true]]) {
    const march = new MarchDirector({ seed, mobile });
    let peak = 0, over = false, lastIndex = 0, backwards = false;
    const result = runMarchBot(march, {
      onFrame: m => {
        const alive = m.alive();
        peak = Math.max(peak, alive);
        if (alive > m.cap) over = true;
        if (m.segmentIndex < lastIndex) backwards = true;
        lastIndex = m.segmentIndex;
      },
    });
    assert.equal(result.state, 'clear', `seed ${seed} ${mobile ? 'mobile' : 'desktop'}: ${result.state} in segment ${march.segmentIndex}`);
    assert.equal(march.cap, mobile ? ENEMY_CAP.mobile : ENEMY_CAP.desktop);
    assert.ok(!over, `enemy cap exceeded (${peak})`);
    assert.ok(!backwards);
    assert.deepEqual(result.trace.map(entry => entry.segment), [1, 2, 3]);
    assert.ok(result.time > 360 && result.time < 540, `clear time ${result.time}`);
    assert.ok(['S', 'A', 'B', 'C'].includes(result.result.rank));
    assert.ok(result.result.kills >= 200);
    assert.equal(march.arena.state, 'win');
  }
});

test('LAYOUT is plain data the art scene can build from, and agrees with heightAt', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(LAYOUT)), LAYOUT);
  assert.equal(LEVEL, LAYOUT);
  for (const spot of LAYOUT.breakables) {
    assert.ok(['crate', 'jar', 'barrel'].includes(spot.type));
    assert.ok(insideSegment(LAYOUT.segments[spot.segment], spot), `breakable ${JSON.stringify(spot)} outside its segment`);
  }
  for (let i = 0; i < 4; i++) assert.ok(LAYOUT.breakables.filter(spot => spot.segment === i).length >= 3, `segment ${i} has a few breakables`);
  for (const lantern of LAYOUT.lanterns) assert.ok(insideSegment(LAYOUT.segments[1], lantern));
  for (const ramp of LAYOUT.stairs.ramps) {
    assert.ok(Math.abs(heightAt(0, ramp.z1) - ramp.h1) < 1e-9);
    assert.ok(Math.abs(heightAt(0, ramp.z0 + 0.5) - (ramp.h0)) < 1e-9 || ramp.h0 === 0);
  }
  assert.equal(heightAt(0, LAYOUT.segments[3].cz), LAYOUT.stairs.topHeight);
  assert.equal(LAYOUT.gates.length, LAYOUT.segments.length - 1);
});

test('breakables appear per segment, break into food / wine drops, and drops expire after 15 s', () => {
  const march = new MarchDirector({ seed: 8, cap: 0 });
  const props = () => march.arena.enemies.filter(enemy => enemy.kind === 'breakable');
  assert.equal(props().length, LAYOUT.breakables.filter(spot => spot.segment === 0).length);
  assert.ok(props().every(prop => prop.prop && prop.fixed && prop.hp === TUNING.breakables.hp[prop.breakType]));
  const events = [];
  for (const prop of props()) kill(march, prop);
  events.push(...advance(march, STEP));
  const broken = events.filter(event => event.type === 'breakableBroken');
  assert.equal(broken.length, LAYOUT.breakables.filter(spot => spot.segment === 0).length);
  const drops = events.filter(event => event.type === 'drop');
  assert.ok(drops.length >= 1);
  for (const drop of drops) assert.ok(['bun', 'bigBun', 'wine'].includes(drop.kind));
  assert.equal(march.arena.kills, 0, 'breaking props is not a kill');
  assert.ok(march.view().breakables.filter(state => state.broken).length === broken.length);
  // Touch collects: bun heals 15, wine fills 25 musou energy.
  const hero = march.arena.hero;
  march.pickups.length = 0;
  hero.hp = 50; hero.energy = 10;
  march._drop('bun', hero.x, hero.y);
  march._drop('wine', hero.x, hero.y);
  const got = advance(march, STEP).filter(event => event.type === 'pickup');
  assert.equal(got.length, 2);
  assert.equal(hero.hp, 50 + TUNING.drops.bun.heal);
  assert.equal(hero.energy, 10 + TUNING.drops.wine.energy);
  march._drop('bigBun', hero.x + 600, hero.y);
  const lost = advance(march, TUNING.pickupLife + 0.2).filter(event => event.type === 'pickupLost');
  assert.equal(lost.length, 1);
  assert.equal(march.pickups.length, 0);
  // Moving on: segment 2 spawns its own breakables; segment 1 props are gone.
  march.skipTo(1);
  assert.ok(props().every(prop => LAYOUT.breakables[prop.breakIndex].segment === 1));
});

test('harder march units: three attack tokens, faster grunt recovery, faster officer guard re-arm', () => {
  const march = new MarchDirector({ seed: 9 });
  assert.equal(march.arena.snapshot().maxAttackers, TUNING.attackers);
  advance(march, 3, { each: godMode });
  const grunt = fighters(march).find(enemy => enemy.role === 'grunt');
  assert.equal(grunt.recover, TUNING.units.recover.grunt);
  assert.ok(TUNING.units.recover.grunt < 2 && TUNING.units.recover.runner < 2);
  for (const variant of ['market', 'red', 'shadow']) assert.ok(TUNING.officers[variant].guardRearm < 3);
});

test('stairs: extra groups march down from the upper tier during the hold', () => {
  const march = new MarchDirector({ seed: 10 });
  march.skipTo(2);
  const events = advance(march, TUNING.stairs.topGroupEvery + 0.5, { each: m => { godMode(m); m.arena.enemies = m.arena.enemies.filter(enemy => enemy.prop); } });
  assert.ok(events.some(event => event.type === 'group' && event.side === 0 && event.size === TUNING.stairs.topGroupSize));
});

test('boss phase 2 keeps summoning grunts on a timer', () => {
  const march = new MarchDirector({ seed: 11 });
  march.skipTo(3);
  const boss = march.arena.enemies.find(enemy => enemy.kind === 'boss');
  boss.hp = boss.maxHp / 2;
  const clearGrunts = m => { godMode(m); m.arena.enemies = m.arena.enemies.filter(enemy => enemy.kind !== 'grunt'); };
  const events = advance(march, 4 + TUNING.boss.resummon.every, { each: clearGrunts });
  const summons = events.filter(event => event.type === 'summon');
  assert.equal(summons[0].count, TUNING.boss.summon);
  assert.ok(summons.some(event => event.count === TUNING.boss.resummon.count), 'periodic re-summon');
});

test('march: jumping clears the boss sweep; the musou stuns the boss; kills carry slow-mo hints', () => {
  const march = new MarchDirector({ seed: 12 });
  assert.equal(march.arena.jumpEnabled, true);
  assert.equal(march.arena.musouFlurry, true);
  march.skipTo(3);
  const boss = march.arena.enemies.find(enemy => enemy.kind === 'boss');
  assert.equal(boss.specialScale, 1, 'the boss takes full musou damage');
  // Stand next to the boss until a sweep is telegraphed, then jump so the hit lands mid-air.
  let events = [];
  let hpBefore = 0;
  for (let t = 0; t < 20 && !events.some(event => event.type === 'bossSweep'); t += STEP) {
    march.arena.hero.x = boss.x + 90; march.arena.hero.y = boss.y;
    march.arena.hero.invulnerable = 0;
    hpBefore = march.arena.hero.hp;
    const sweep = march.hazards.find(hazard => hazard.attack === 'sweep');
    const jump = sweep && sweep.until - march.time < 0.42 && march.arena.hero.action !== 'jump';
    march.update(STEP, jump ? { jump: true } : {});
    events.push(...march.drainEvents());
  }
  events.push(...advance(march, STEP));   // Arena events reach the director on the next tick
  assert.ok(events.some(event => event.type === 'bossSweep'));
  assert.ok(events.some(event => event.type === 'airEvade'), 'the sweep passes under the jump');
  assert.equal(march.arena.hero.hp, hpBefore);
  // Musou: the boss is held (director stun) for the whole move.
  advance(march, 1.5);
  march.arena.hero.x = boss.x + 150; march.arena.hero.y = boss.y;
  march.arena.hero.energy = 100;
  march.arena.hero.action = 'idle';
  advance(march, STEP, { input: { special: true } });
  assert.ok(boss.stunUntil > march.arena.time);
  advance(march, 1);
  assert.equal(boss.mode, 'broken');
  assert.equal(march.hazards.filter(hazard => hazard.ownerId === boss.id).length, 0);
  boss.hp = 1;
  kill(march, boss);
  events = advance(march, STEP);
  const down = events.find(event => event.type === 'bossDown');
  assert.ok(down && down.slowMo.scale === TUNING.killSlowMo.scale && down.banner.includes(TUNING.boss.name));
});
