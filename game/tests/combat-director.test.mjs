import assert from 'node:assert/strict';
import test from 'node:test';
import { Arena, GUARD, MUSOU_AIM, MUSOU_CHAIN, MUSOU_HEAVY, MUSOU_SPECIAL, SIDESTEP } from '../2d/combat.js';

// Opt-in Arena options used by the 3D march level (game/3d-next/march.js). The default Arena is
// covered by combat-2d.test.mjs; these tests pin every new option.

function directorArena(options = {}) {
  const arena = new Arena({ seed: 9, warriorMode: true, musou: true, director: true, bounds: { minX: 0, maxX: 2000, minY: -2000, maxY: 1000 }, ...options });
  arena.drainEvents();
  return arena;
}

test('default Arena keeps its bounds and wave start; custom bounds clamp the hero', () => {
  const plain = new Arena({ seed: 1 });
  assert.equal(plain.director, false);
  assert.deepEqual(plain.snapshot().bounds, { minX: 90, maxX: 1190, minY: 210, maxY: 625 });
  assert.equal(plain.enemies.length, 5);
  const boxed = new Arena({ seed: 1, bounds: { minX: 500, maxX: 700, minY: 400, maxY: 520 } });
  boxed.enemies = [];
  for (let i = 0; i < 30; i++) boxed.update(0.05, { x: 1, y: 1 });
  assert.equal(boxed.hero.x, 700);
  assert.equal(boxed.hero.y, 520);
  boxed.setBounds({ minX: 0, maxX: 2000, minY: 0, maxY: 1000 });
  boxed.update(0.05, { x: 1 });
  assert.ok(boxed.hero.x > 700);
});

test('director mode spawns nothing by itself and a boss kill does not win', () => {
  const arena = directorArena();
  assert.equal(arena.enemies.length, 0);
  for (let i = 0; i < 200; i++) arena.update(0.05);
  assert.equal(arena.enemies.length, 0);
  assert.equal(arena.drainEvents().filter(event => event.type === 'wave').length, 0);
  const boss = arena.spawn('boss', 700, 400, { hp: 30 });
  const prop = arena.spawn('grunt', 900, 400, { prop: true, hp: 1 });
  assert.equal(boss.maxHp, 30);
  assert.equal(arena.enemies.length, 2);
  arena._damageEnemy(boss, 99, 'heavy');
  arena._damageEnemy(prop, 99, 'heavy');
  arena.update(0.02);
  assert.equal(arena.state, 'play');
  assert.equal(arena.kills, 1, 'props are not counted as kills');
  arena.win();
  assert.equal(arena.state, 'win');
});

test('spawn overrides speed, damage, telegraph and recovery of Arena-driven enemies', () => {
  const arena = directorArena();
  const fast = arena.spawn('grunt', arena.hero.x + 400, arena.hero.y, { speed: 300, cooldown: 99 });
  const slow = arena.spawn('grunt', arena.hero.x - 400, arena.hero.y, { cooldown: 99 });
  arena.update(0.1);
  assert.ok(Math.abs(fast.x - (arena.hero.x + 400)) > 25, 'custom speed moves further');
  assert.ok(Math.abs(slow.x - (arena.hero.x - 400)) < 10);
  const hitter = arena.spawn('grunt', arena.hero.x + 60, arena.hero.y, { damage: 33, telegraphTime: 0.2, recover: 4, cooldown: 0 });
  arena.enemies = [hitter];
  let events = [];
  for (let i = 0; i < 30 && arena.hero.hp === 100; i++) { arena.update(0.02); events = events.concat(arena.drainEvents()); }
  const tell = events.find(event => event.type === 'telegraph');
  assert.ok(Math.abs(tell.duration - 0.2) < 1e-9);
  assert.equal(arena.hero.hp, 67);
  for (let i = 0; i < 20; i++) arena.update(0.02);
  assert.ok(hitter.cooldown > 3, 'recover override sets the post-attack cooldown');
});

test('external enemies are not moved or interrupted by the Arena and only die from damage', () => {
  const arena = directorArena();
  const scripted = arena.spawn('boss', arena.hero.x + 100, arena.hero.y, { ai: 'external', hp: 40, action: 'telegraph' });
  const before = { x: scripted.x, y: scripted.y };
  arena.hero.facing = 0;
  arena._damageEnemy(scripted, 12, 'heavy');
  for (let i = 0; i < 10; i++) arena.update(0.05);
  assert.equal(scripted.hp, 28);
  assert.equal(scripted.action, 'telegraph');
  assert.deepEqual({ x: scripted.x, y: scripted.y }, before);
  arena._damageEnemy(scripted, 99, 'attack');
  assert.equal(scripted.action, 'dead');
  assert.ok(arena.drainEvents().some(event => event.type === 'kill' && event.enemyId === scripted.id));
});

test('fixed enemies take no knockback and are never pushed by separation', () => {
  const arena = directorArena();
  const post = arena.spawn('grunt', arena.hero.x + 90, arena.hero.y, { fixed: true, hp: 50, cooldown: 99 });
  const other = arena.spawn('grunt', arena.hero.x + 100, arena.hero.y, { cooldown: 99 });
  arena._damageEnemy(post, 12, 'heavy');
  assert.equal(post.x, arena.hero.x + 90);
  arena.update(0.02);
  assert.equal(post.x, arena.hero.x + 90);
  assert.equal(post.y, arena.hero.y);
  assert.ok(Math.hypot(other.x - post.x, other.y - post.y) >= 144, 'the free enemy took the whole push');
});

test('specialScale halves special damage and intangible enemies cannot be hit', () => {
  const arena = directorArena();
  const officer = arena.spawn('officer', 700, 400, { hp: 60, specialScale: 0.5 });
  arena._damageEnemy(officer, 12, 'special');
  assert.equal(officer.hp, 54);
  const flying = arena.spawn('boss', 800, 400, { hp: 60, intangible: true });
  arena._damageEnemy(flying, 50, 'heavy');
  assert.equal(flying.hp, 60);
});

test('stagger holds hit stun for its full duration even when hit again', () => {
  const arena = directorArena();
  const grunt = arena.spawn('grunt', arena.hero.x + 100, arena.hero.y, { hp: 50 });
  assert.equal(arena.stagger(grunt, 2), true);
  for (let i = 0; i < 5; i++) arena.update(0.1);   // Arena steps are capped at 0.1 s
  arena._damageEnemy(grunt, 1, 'attack');
  assert.ok(grunt.hitStun > 1.4, `a later hit must not shorten the stagger (${grunt.hitStun})`);
  for (let i = 0; i < 28; i++) arena.update(0.05);
  assert.equal(grunt.action, 'hit');
  for (let i = 0; i < 6; i++) arena.update(0.05);
  assert.notEqual(grunt.action, 'hit');
  const external = arena.spawn('boss', 700, 400, { ai: 'external' });
  assert.equal(arena.stagger(external, 2), false);
});

test('hurtHero respects invulnerability and can kill the hero', () => {
  const arena = directorArena();
  assert.equal(arena.hurtHero(20, { id: 5 }), true);
  assert.equal(arena.hero.hp, 80);
  assert.equal(arena.hurtHero(20), false, 'post-hit invulnerability');
  arena.hero.invulnerable = 0;
  arena.hurtHero(200);
  assert.equal(arena.state, 'dead');
});

test('musou attacks use the tuned reach, arcs and auto-aim window', () => {
  assert.deepEqual(MUSOU_CHAIN.map(step => step.radius), [150, 150, 160, 180, 195]);
  for (const step of MUSOU_CHAIN.slice(0, 3)) assert.equal(step.arc, Math.PI * 0.75);
  for (const step of MUSOU_CHAIN.slice(3)) assert.equal(step.arc, Math.PI * 2);
  assert.equal(MUSOU_HEAVY.radius, 200);
  assert.equal(MUSOU_SPECIAL.radius, 280);
  assert.deepEqual(MUSOU_AIM, { range: 170, arc: 0.6 });
  const aim = (dx, dy, musou) => {
    const arena = new Arena({ seed: 2, warriorMode: true, musou });
    arena.enemies = [];
    arena.hero.x = 640; arena.hero.y = 400; arena.hero.facing = 0;
    arena._spawn('grunt');
    Object.assign(arena.enemies[0], { x: 640 + dx, y: 400 + dy, cooldown: 9 });
    arena.update(0.01, { attack: true });
    return arena.hero.facing;
  };
  assert.equal(aim(0, 200, true), 0, 'musou: 200 px is out of snap range');
  assert.equal(aim(150 * Math.cos(1), 150 * Math.sin(1), true), 0, 'musou: 1 rad off-axis does not snap');
  assert.ok(Math.abs(aim(150 * Math.cos(0.5), 150 * Math.sin(0.5), true) - 0.5) < 1e-6, 'musou: close and in front snaps');
  assert.ok(Math.abs(aim(0, 200, false) - Math.PI / 2) < 1e-6, 'non-musou warrior aim is unchanged (230 px, any angle while idle)');
});

test('guard: frontal lights chip, heavy breaks guard for a stun, then the guard re-arms', () => {
  const arena = directorArena();
  const officer = arena.spawn('officer', arena.hero.x + 120, arena.hero.y, { hp: 60, guard: true, facing: Math.PI, cooldown: 99 });
  arena._damageEnemy(officer, 5, 'attack');
  assert.equal(officer.hp, 60 - 5 * GUARD.chip);
  assert.notEqual(officer.action, 'hit', 'a guarded hit does not flinch');
  let events = arena.drainEvents();
  assert.ok(events.some(event => event.type === 'guard'));
  assert.ok(!events.some(event => event.type === 'hit'));
  officer.facing = 0;   // back to the hero
  arena._damageEnemy(officer, 5, 'attack');
  assert.equal(officer.hp, 60 - 5 * GUARD.chip - 5, 'hits from behind deal full damage');
  officer.facing = Math.PI;
  officer.action = 'chase';
  const hp = officer.hp;
  arena._damageEnemy(officer, 12, 'heavy');
  assert.equal(officer.hp, hp - 12);
  events = arena.drainEvents();
  assert.ok(events.some(event => event.type === 'guardBreak' && event.duration === GUARD.breakSeconds));
  assert.equal(officer.action, 'hit');
  arena._damageEnemy(officer, 5, 'attack');
  assert.equal(officer.hp, hp - 17, 'full damage while guard-broken');
  assert.ok(officer.hitStun > 1.4, 'guard break stun lasts ~1.5 s');
  for (let i = 0; i < 16; i++) arena.update(0.1);
  officer.facing = Math.atan2(arena.hero.y - officer.y, arena.hero.x - officer.x);
  const before = officer.hp;
  arena._damageEnemy(officer, 12, 'heavy');
  assert.equal(officer.hp, before - 12 * GUARD.chip, 'during re-arm a frontal heavy is only chip damage');
  assert.ok(!arena.drainEvents().some(event => event.type === 'guardBreak'));
});

test('guard super armour: a light hit from behind lands without interrupting a wind-up', () => {
  const arena = directorArena();
  const officer = arena.spawn('officer', arena.hero.x + 80, arena.hero.y, { hp: 60, guard: true, facing: 0, action: 'telegraph', telegraph: 0.8 });
  arena._damageEnemy(officer, 5, 'attack');
  assert.equal(officer.hp, 55);
  assert.equal(officer.action, 'telegraph');
  assert.ok(arena.drainEvents().some(event => event.type === 'hit' && event.armored));
  arena._damageEnemy(officer, 12, 'special');
  assert.equal(officer.action, 'hit', 'special breaks the guard and interrupts');
});

test('evade: runners sidestep light attacks but not heavies, and never while staggered', () => {
  const arena = directorArena();
  const runner = arena.spawn('runner', arena.hero.x + 100, arena.hero.y, { hp: 6, evade: 1, cooldown: 99 });
  const x = runner.x;
  arena._damageEnemy(runner, 5, 'attack');
  assert.equal(runner.hp, 6);
  const hop = arena.drainEvents().find(event => event.type === 'sidestep');
  assert.ok(hop && Math.abs(Math.hypot(hop.dx, hop.dy) - SIDESTEP.distance) < 1e-6);
  assert.ok(runner.x !== x || runner.y !== arena.hero.y);
  arena._damageEnemy(runner, 5, 'attack');
  assert.equal(runner.hp, 6, 'still mid-hop');
  arena._damageEnemy(runner, 5, 'heavy');
  assert.equal(runner.hp, 1);
  runner.evade = 1;
  assert.equal(runner.action, 'hit');
  arena._damageEnemy(runner, 5, 'attack');
  assert.equal(runner.hp, 0, 'a staggered runner cannot sidestep');
});

test('turnRate turns an officer gradually and locks its facing while winding up', () => {
  const arena = directorArena();
  const officer = arena.spawn('officer', arena.hero.x, arena.hero.y - 300, { turnRate: 2, facing: -Math.PI / 2, cooldown: 99 });
  arena.update(0.1);
  assert.ok(Math.abs(officer.facing - (-Math.PI / 2 + 0.2)) < 1e-9 || Math.abs(officer.facing - (-Math.PI / 2 - 0.2)) < 1e-9);
  officer.action = 'telegraph'; officer.telegraph = 5;
  const locked = officer.facing;
  arena.update(0.1);
  assert.equal(officer.facing, locked);
});

test('maxAttackers raises the attack-token budget; default warrior budget stays 2', () => {
  assert.equal(new Arena({ seed: 3, warriorMode: true }).snapshot().maxAttackers, 2);
  assert.equal(new Arena({ seed: 3 }).snapshot().maxAttackers, 3);
  const engagedPeak = budget => {
    const arena = directorArena({ maxAttackers: budget });
    for (let i = 0; i < 6; i++) arena.spawn('grunt', arena.hero.x + Math.cos(i) * 200, arena.hero.y + Math.sin(i) * 200, { cooldown: 0 });
    let peak = 0;
    for (let i = 0; i < 60; i++) { arena.hero.invulnerable = 5; arena.update(0.05); peak = Math.max(peak, arena.attackerTokens); }
    return peak;
  };
  assert.equal(engagedPeak(3), 3);
  assert.equal(engagedPeak(null), 2);
});

test('guardRearm overrides the default guard re-arm window per enemy', () => {
  const arena = directorArena();
  const quick = arena.spawn('officer', arena.hero.x + 120, arena.hero.y, { hp: 99, guard: true, guardRearm: 1, facing: Math.PI, cooldown: 99 });
  arena._damageEnemy(quick, 12, 'heavy');
  assert.ok(Math.abs(quick.guardRearmUntil - quick.guardBrokenUntil - 1) < 1e-9);
  const plain = arena.spawn('officer', arena.hero.x - 120, arena.hero.y, { hp: 99, guard: true, facing: 0, cooldown: 99 });
  arena._damageEnemy(plain, 12, 'heavy');
  assert.ok(Math.abs(plain.guardRearmUntil - plain.guardBrokenUntil - GUARD.rearm) < 1e-9);
});
