import assert from 'node:assert/strict';
import test from 'node:test';
import { Arena, JUMP, MUSOU_FLURRY } from '../2d/combat.js';

// Opt-in jump and 無雙亂舞 (musouFlurry) used by the 3D musou mode.

const STEP = 1 / 60;
function arena3d(options = {}) {
  const arena = new Arena({ seed: 5, warriorMode: true, musou: true, director: true, jump: true, musouFlurry: true,
    bounds: { minX: -2000, maxX: 4000, minY: -2000, maxY: 3000 }, ...options });
  arena.drainEvents();
  return arena;
}
function run(arena, seconds, input = {}) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += STEP) { arena.update(STEP, input); events.push(...arena.drainEvents()); }
  return events;
}
const dummy = (arena, dx, dy, extra = {}) => arena.spawn('grunt', arena.hero.x + dx, arena.hero.y + dy, { hp: 500, cooldown: 99, fixed: true, ...extra });

test('default and plain musou Arenas have no jump state and ignore the jump input', () => {
  for (const options of [{}, { warriorMode: true, musou: true }]) {
    const arena = new Arena({ seed: 1, ...options });
    assert.equal('height' in arena.hero, false);
    arena.enemies = [];
    arena.update(0.05, { jump: true });
    assert.notEqual(arena.hero.action, 'jump');
    assert.equal(arena.timeScale(), 1);
  }
});

test('jump: 0.8 s arc to ~1.2 m, steerable, lands with an event; no dodge or musou in the air', () => {
  const arena = arena3d();
  arena.hero.energy = 100;
  const x0 = arena.hero.x;
  let events = run(arena, STEP, { jump: true });
  assert.equal(arena.hero.action, 'jump');
  assert.ok(events.some(event => event.type === 'jump' && event.duration === JUMP.duration));
  events = run(arena, 0.38, { x: 1 });
  assert.ok(Math.abs(arena.hero.height - JUMP.height) < 0.05, `peak ${arena.hero.height}`);
  assert.ok(arena.hero.x - x0 > 80, 'steers in the air');
  run(arena, STEP, { dodge: true });
  run(arena, STEP, { special: true });
  assert.equal(arena.hero.action, 'jump', 'dodge / musou ignored in the air');
  assert.equal(arena.hero.energy, 100);
  events = run(arena, 0.45);
  const land = events.find(event => event.type === 'land');
  assert.ok(land && land.plunge === false);
  assert.equal(arena.hero.height, 0);
  run(arena, 0.2);
  assert.equal(arena.hero.action, 'idle');
});

test('air slash: 180° in front, radius 150, at most two per jump', () => {
  const arena = arena3d();
  arena.hero.facing = 0;
  const front = dummy(arena, 120, 0);
  const behind = dummy(arena, -120, 0);
  const far = dummy(arena, 200, 0);
  run(arena, STEP, { jump: true });
  run(arena, 0.05);
  const events = [];
  for (let i = 0; i < 3; i++) {
    events.push(...run(arena, STEP, { attack: true }));
    events.push(...run(arena, JUMP.airSlash.duration));
  }
  const slashes = events.filter(event => event.type === 'airSlash');
  assert.equal(slashes.length, JUMP.airSlash.max);
  assert.deepEqual(slashes.map(event => event.index), [0, 1]);
  assert.equal(front.hp, 500 - JUMP.airSlash.max * JUMP.airSlash.damage);
  assert.equal(behind.hp, 500);
  assert.equal(far.hp, 500);
});

test('plunge: heavy in the air dives and lands with a 190 px shockwave', () => {
  const arena = arena3d();
  const near = dummy(arena, 150, 60);
  const outside = dummy(arena, 260, 0);
  run(arena, STEP, { jump: true });
  run(arena, 0.3);
  let events = run(arena, STEP, { heavy: true });
  assert.equal(arena.hero.action, 'plunge');
  assert.ok(events.some(event => event.type === 'plunge'));
  events = run(arena, JUMP.plunge.fall + 0.02);
  const land = events.find(event => event.type === 'land');
  assert.ok(land && land.plunge && land.radius === JUMP.plunge.radius);
  assert.equal(near.hp, 500 - JUMP.plunge.damage);
  assert.equal(outside.hp, 500);
  assert.ok(events.some(event => event.type === 'hit' && event.source === 'heavy'), 'heavy source → launch in the renderer');
  run(arena, JUMP.plunge.recover + 0.02);
  assert.equal(arena.hero.action, 'idle');
});

test('above 0.6 m the hero clears grunt claws and ground attacks; lower hits still land', () => {
  const arena = arena3d();
  run(arena, STEP, { jump: true });
  run(arena, 0.3);
  assert.ok(arena.hero.height > JUMP.evadeHeight);
  const grunt = arena.spawn('grunt', arena.hero.x + 60, arena.hero.y, { action: 'attack', attackResolved: false, cooldown: 0 });
  let events = run(arena, STEP);
  assert.equal(arena.hero.hp, 100);
  assert.ok(events.some(event => event.type === 'airEvade' && event.sourceId === grunt.id));
  assert.equal(arena.hurtHero(20, { id: 9, ground: true }), false, 'ground slam misses');
  assert.equal(arena.hurtHero(11, { id: 8 }), true, 'a lunge still connects in the air');
  const grounded = arena3d();
  assert.equal(grounded.hurtHero(20, { id: 9, ground: true }), true);
});

test('無雙亂舞: 4.2 s invulnerable, 10 swings 0.55–3.3 s, impact 3.6 s, timeline + time scale exposed', () => {
  const arena = arena3d();
  const F = MUSOU_FLURRY.standard;
  arena.hero.energy = 100;
  const close = dummy(arena, 150, 0);
  const ring = dummy(arena, 280, 0);
  const outside = dummy(arena, 420, 0, { ai: 'external' });   // stationary: an Arena-driven dummy would walk in
  let events = run(arena, STEP, { special: true });
  const start = events.find(event => event.type === 'musouStart');
  assert.ok(start && start.true === false && start.duration === F.duration && start.impact === F.impact);
  assert.equal(start.swings.length, F.swings);
  assert.equal(start.swings[0], F.swingStart);
  assert.ok(Math.abs(start.swings.at(-1) - F.swingEnd) < 1e-9);
  assert.ok(events.some(event => event.type === 'musouFreeze' && event.real === F.freezes[0].real));
  assert.deepEqual(start.stunned.sort(), [close.id, ring.id].sort(), 'enemies inside the musou radius are stunned');
  assert.equal(close.action, 'hit');
  let minInvulnerable = Infinity, scaleAtImpact = null;
  for (let t = 0; t < F.duration + 0.1; t += STEP) {
    if (Math.abs(arena.hero.actionTime - 3.6) < STEP && scaleAtImpact === null) scaleAtImpact = arena.timeScale();
    arena.update(STEP, {});
    events.push(...arena.drainEvents());
    if (arena.hero.action === 'special') minInvulnerable = Math.min(minInvulnerable, arena.hero.invulnerable);
  }
  assert.ok(minInvulnerable > 0);
  assert.equal(events.filter(event => event.type === 'swing' && event.flurry).length, F.swings);
  const finish = events.find(event => event.type === 'musouFinish');
  assert.ok(finish && finish.radius === F.finishRadius && finish.true === false);
  assert.ok(events.some(event => event.type === 'musouEnd'));
  assert.equal(arena.hero.action, 'idle');
  assert.equal(close.hp, 500 - F.swings * F.damage - F.finishDamage);
  assert.equal(ring.hp, 500 - F.finishDamage, 'outside the swing radius only the finisher reaches');
  assert.equal(outside.hp, 500);
  assert.ok(Math.abs(scaleAtImpact - 0.3) < 1e-9, `slow-mo around the impact (${scaleAtImpact})`);
  assert.equal(arena.hero.energy, 0, 'the flurry does not refill the gauge');
});

test('無雙亂舞 steers at ~80 px/s until the impact', () => {
  const arena = arena3d();
  arena.hero.energy = 100;
  run(arena, STEP, { special: true });
  const x0 = arena.hero.x;
  run(arena, 1, { x: 1 });
  assert.ok(Math.abs(arena.hero.x - x0 - MUSOU_FLURRY.standard.steer) < 3, `${arena.hero.x - x0}`);
});

test('真・無雙 at ≤ 30% hp: 5 s, 12 swings ×1.5, 400 px blast, events flagged true', () => {
  const arena = arena3d();
  const T = MUSOU_FLURRY.true;
  arena.hero.energy = 100;
  arena.hero.hp = 30;
  const close = dummy(arena, 150, 0);
  const wide = dummy(arena, 380, 0);
  const external = dummy(arena, -100, 0, { ai: 'external' });
  const events = run(arena, T.duration + 0.1, { special: true });
  const start = events.find(event => event.type === 'musouStart');
  assert.ok(start.true && start.duration === T.duration && start.swings.length === T.swings);
  assert.ok(external.stunUntil > 0, 'director-driven enemies get stunUntil');
  const swings = events.filter(event => event.type === 'swing' && event.flurry);
  assert.equal(swings.length, T.swings);
  assert.ok(swings.every(event => event.true === true));
  assert.equal(events.find(event => event.type === 'musouFinish').radius, T.finishRadius);
  assert.equal(close.hp, 500 - T.swings * T.damage * 1.5 - T.finishDamage * 1.5);
  assert.equal(wide.hp, 500 - T.finishDamage * 1.5);
});

test('taking damage fills the musou gauge only with musouFlurry', () => {
  const flurry = arena3d();
  flurry.hurtHero(10);
  assert.equal(flurry.hero.energy, MUSOU_FLURRY.energyOnHurt);
  const plain = new Arena({ seed: 1, warriorMode: true, musou: true, director: true });
  plain.hurtHero(10);
  assert.equal(plain.hero.energy, 0);
});
