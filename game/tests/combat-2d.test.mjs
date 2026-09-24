import assert from 'node:assert/strict';
import test from 'node:test';
import { Arena } from '../2d/combat.js';

function closeEnemy(arena, index = 0, { x = arena.hero.x + 90, y = arena.hero.y, hp } = {}) {
  const enemy = arena.enemies[index];
  enemy.x = x;
  enemy.y = y;
  enemy.action = 'chase';
  enemy.cooldown = 5;
  if (hp !== undefined) enemy.hp = enemy.maxHp = hp;
  return enemy;
}

// Advances the musou light chain past the current step's cancel window, then
// presses attack again to consume it (matching a player buffering the next hit).
function advanceMusouChain(arena) {
  while (arena.hero.action === 'attack' && arena.hero.actionTime < arena.attack.cancel) {
    arena.update(0.02);
  }
  arena.update(0.02, { attack: true });
}

test('reset is seeded, bounded and begins with a readable small group', () => {
  const a = new Arena({ seed: 42 });
  const b = new Arena({ seed: 42 });
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal(a.state, 'play');
  assert.equal(a.wave, 1);
  assert.equal(a.enemies.length, 5);
  assert.ok(a.enemies.some(enemy => enemy.role === 'runner'));
  assert.ok(a.enemies.every(enemy => ['grunt', 'runner', 'elite'].includes(enemy.role)));
  assert.deepEqual(a.snapshot().bounds, { minX: 90, maxX: 1190, minY: 210, maxY: 625 });
});

test('movement normalizes diagonals and clamps the hero to the arena', () => {
  const arena = new Arena({ seed: 3 });
  arena.hero.x = 1189;
  arena.hero.y = 624;
  arena.update(0.1, { x: 1, y: 1 });
  assert.equal(arena.hero.x, 1190);
  assert.equal(arena.hero.y, 625);
  assert.equal(arena.hero.action, 'run');
  const moved = new Arena({ seed: 3 });
  moved.update(0.1, { x: 1 });
  const diagonal = new Arena({ seed: 3 });
  diagonal.update(0.1, { x: 1, y: 1 });
  assert.ok(Math.abs(diagonal.hero.x - 640) < Math.abs(moved.hero.x - 640));
});

test('light slash hits once in its forward arc and chains three light attacks', () => {
  const arena = new Arena({ seed: 4 });
  arena.hero.x = 640; arena.hero.y = 400; arena.hero.facing = 0;
  const target = closeEnemy(arena, 0, { x: 740, y: 400, hp: 30 });
  const behind = closeEnemy(arena, 1, { x: 530, y: 400, hp: 30 });
  arena.update(0.1, { attack: true });
  arena.update(0.02);
  assert.equal(target.hp, 27);
  assert.equal(behind.hp, 30);
  assert.equal(arena.hero.combo, 1);
  arena.update(0.1);
  arena.update(0.1, { attack: true });
  assert.equal(arena.hero.action, 'attack');
  assert.equal(arena.hero.combo, 2);
  arena.update(0.16);
  arena.update(0.1, { attack: true });
  assert.equal(arena.hero.combo, 3);
  const events = arena.drainEvents();
  const slashes = events.filter(event => event.type === 'slash');
  assert.equal(slashes.length, 3);
  assert.equal(slashes[2].combo, 3);
  assert.ok(events.some(event => event.type === 'hitstop' && event.duration > 0));
  assert.equal(arena.drainEvents().length, 0, 'draining events consumes them once');
});

test('heavy attack can branch from a live light chain and has larger damage', () => {
  const arena = new Arena({ seed: 5 });
  arena.hero.x = 640; arena.hero.y = 400; arena.hero.facing = 0;
  const target = closeEnemy(arena, 0, { x: 740, y: 400, hp: 30 });
  arena.update(0.1, { attack: true });
  arena.update(0.1);
  arena.update(0.1, { attack: true });
  assert.equal(arena.hero.combo, 2);
  target.x = 1000;
  arena.update(0.17);
  target.x = 740;
  arena.update(0.1, { heavy: true });
  assert.equal(arena.hero.action, 'heavy');
  assert.equal(arena.attack.branch, true);
  assert.equal(target.hp, 27);
  arena.update(0.1);
  arena.update(0.1);
  assert.equal(target.hp, 17);
  assert.ok(target.x > 740, 'heavy branch knocks its target back');
});

test('dodge grants invulnerability through a telegraphed enemy strike', () => {
  const arena = new Arena({ seed: 6 });
  const attacker = closeEnemy(arena, 0, { x: arena.hero.x + 50, y: arena.hero.y });
  attacker.action = 'telegraph';
  attacker.telegraph = 0.01;
  attacker.range = 100;
  attacker.cooldown = 0;
  const hp = arena.hero.hp;
  arena.update(0.1, { dodge: true, x: 1 });
  assert.equal(arena.hero.action, 'dodge');
  assert.ok(arena.hero.invulnerable > 0.3);
  assert.ok(arena.hero.dodgeCooldown > 0.5);
  const dodgeX = arena.hero.x;
  arena.update(0.1, { dodge: true, x: 1 });
  assert.equal(arena.hero.x, dodgeX, 'a press during cooldown must not restart dodge');
  arena.update(0.1);
  assert.equal(arena.hero.hp, hp);
  assert.ok(arena.drainEvents().some(event => event.type === 'dodge'));
});

test('attack input buffers briefly through hurt recovery and fires once', () => {
  const arena = new Arena({ seed: 12 });
  arena.enemies = [];
  arena.hero.action = 'hurt';
  arena.hero.actionTime = 0.2;
  arena.update(0.1, { attack: true });
  assert.equal(arena.hero.action, 'idle');
  assert.equal(arena.inputBuffer.kind, 'attack');
  arena.update(0.01);
  assert.equal(arena.hero.action, 'attack');
  assert.equal(arena.inputBuffer, null);
  for (let i = 0; i < 5; i++) arena.update(0.1);
  assert.equal(arena.hero.action, 'idle');
  assert.equal(arena.drainEvents().filter(event => event.type === 'slash').length, 1,
    'one buffered edge creates one attack');
});

test('attack buffer expires rather than firing after a longer recovery', () => {
  const arena = new Arena({ seed: 13 });
  arena.enemies = [];
  arena.hero.action = 'hurt';
  arena.hero.actionTime = 0;
  arena.update(0.1, { attack: true });
  arena.update(0.1);
  assert.ok(arena.inputBuffer);
  arena.update(0.1);
  assert.equal(arena.hero.action, 'idle');
  assert.equal(arena.inputBuffer, null);
  arena.update(0.05);
  assert.equal(arena.hero.action, 'idle');
  assert.equal(arena.drainEvents().filter(event => event.type === 'slash').length, 0);
});

test('dodge clears buffered attacks and special has the same priority', () => {
  const arena = new Arena({ seed: 14 });
  arena.enemies = [];
  arena.hero.action = 'hurt';
  arena.hero.actionTime = 0.1;
  arena.update(0.02, { attack: true });
  assert.ok(arena.inputBuffer);
  arena.update(0.02, { dodge: true, x: 1 });
  assert.equal(arena.inputBuffer, null);
  assert.equal(arena.hero.action, 'dodge');
  for (let i = 0; i < 5; i++) arena.update(0.1);
  assert.equal(arena.hero.action, 'idle');
  assert.equal(arena.drainEvents().filter(event => event.type === 'slash').length, 0);

  arena.hero.energy = 100;
  arena.hero.action = 'hurt';
  arena.hero.actionTime = 0.1;
  arena.update(0.02, { heavy: true });
  assert.ok(arena.inputBuffer);
  arena.update(0.02, { special: true });
  assert.equal(arena.inputBuffer, null);
  assert.equal(arena.hero.action, 'special');
});

test('attacker tokens reserve existing tells before earlier chase enemies', () => {
  const arena = new Arena({ seed: 7 });
  arena.enemies = arena.enemies.slice(0, 10);
  while (arena.enemies.length < 10) arena._spawn('grunt');
  for (let i = 0; i < arena.enemies.length; i++) {
    const enemy = arena.enemies[i];
    enemy.x = arena.hero.x + (i % 2 ? -55 : 55);
    enemy.y = arena.hero.y + (i - 5) * 5;
    enemy.range = 200;
    enemy.cooldown = 0;
    enemy.action = 'chase';
  }
  for (const enemy of arena.enemies.slice(7)) {
    enemy.action = 'telegraph';
    enemy.telegraph = 0.5;
  }
  arena.update(0.1);
  assert.equal(arena.attackerTokens, 3);
  assert.equal(arena.enemies.filter(enemy => enemy.action === 'telegraph' || enemy.action === 'attack').length, 3);
  assert.ok(arena.enemies.slice(0, 7).every(enemy => enemy.action !== 'telegraph'),
    'new tells must not exceed reserved attacker slots');
});

test('special consumes full energy, damages nearby enemies and preserves distant targets', () => {
  const arena = new Arena({ seed: 8 });
  arena.hero.energy = 100;
  arena.hero.x = 640; arena.hero.y = 400;
  const near = closeEnemy(arena, 0, { x: 700, y: 400, hp: 30 });
  const far = closeEnemy(arena, 1, { x: 1050, y: 400, hp: 30 });
  arena.update(0.05, { special: true });
  assert.equal(arena.hero.energy, 2);
  assert.equal(arena.hero.action, 'special');
  assert.equal(near.hp, 6);
  assert.ok(near.x > 700, 'special applies light outward knockback');
  assert.equal(far.hp, 30);
  assert.ok(arena.hero.invulnerable > 0.6);
  assert.ok(arena.drainEvents().some(event => event.type === 'special'));
});

test('wave objective advances to a queued boss, then boss defeat wins', () => {
  const arena = new Arena({ seed: 9 });
  arena.hero.hp = 80;
  for (const nextWave of [2, 3]) {
    arena.waveKills = 19;
    arena.enemies = [];
    arena._spawn('grunt');
    closeEnemy(arena, 0, { x: arena.hero.x + 60, y: arena.hero.y, hp: 1 });
    arena.hero.energy = 100;
    arena.update(0.05, { special: true });
    assert.equal(arena.wave, nextWave);
    assert.equal(arena.waveKills, 0);
    assert.ok(arena.hero.hp >= 88);
    assert.ok(arena.drainEvents().some(event => event.type === 'heal' && event.amount === 8));
  }
  arena.waveKills = 19;
  arena.enemies = [];
  arena._spawn('grunt');
  closeEnemy(arena, 0, { x: arena.hero.x + 60, y: arena.hero.y, hp: 1 });
  arena.hero.energy = 100;
  arena.update(0.05, { special: true });
  assert.equal(arena.bossQueued, false);
  assert.equal(arena.enemies.length, 1);
  assert.equal(arena.enemies[0].role, 'boss');
  const bossWaveEvents = arena.drainEvents().filter(event => event.type === 'wave' && event.wave === 'boss');
  arena._countWaveKill();
  assert.equal(arena.waveKills, 20);
  assert.equal(arena.drainEvents().filter(event => event.type === 'wave' && event.wave === 'boss').length, 0);
  assert.equal(bossWaveEvents.length, 1);
  arena.enemies[0].x = arena.hero.x + 60;
  arena.enemies[0].y = arena.hero.y;
  arena.enemies[0].hp = 1;
  arena.hero.energy = 100;
  arena.update(0.05, { special: true });
  assert.equal(arena.state, 'win');
  assert.equal(arena.hero.action, 'win');
  assert.ok(arena.drainEvents().some(event => event.type === 'win'));
});

test('enemy tell resolves damage and can end in death; reset restores play', () => {
  const arena = new Arena({ seed: 10 });
  const attacker = closeEnemy(arena, 0, { x: arena.hero.x + 30, y: arena.hero.y });
  attacker.action = 'telegraph';
  attacker.telegraph = 0.01;
  attacker.range = 100;
  attacker.role = 'grunt';
  arena.hero.hp = 9;
  arena.update(0.1);
  arena.update(0.1);
  assert.equal(arena.state, 'dead');
  assert.equal(arena.hero.hp, 0);
  assert.equal(arena.hero.action, 'dead');
  assert.ok(arena.drainEvents().some(event => event.type === 'dead'));
  arena.reset();
  assert.equal(arena.state, 'play');
  assert.equal(arena.hero.hp, 100);
  assert.equal(arena.wave, 1);
  assert.equal(arena.enemies.length, 5);
});

test('event queue is bounded and drain clears it; snapshots do not alias state', () => {
  const arena = new Arena({ seed: 11 });
  const snapshot = arena.snapshot();
  snapshot.hero.hp = -1;
  snapshot.enemies[0].hp = -1;
  assert.equal(arena.hero.hp, 100);
  assert.notEqual(arena.enemies[0].hp, -1);
  for (let i = 0; i < 150; i++) arena._emit('probe', { i });
  const drained = arena.drainEvents();
  assert.equal(drained.length, 96);
  assert.equal(drained[0].i, 54);
  assert.equal(arena.drainEvents().length, 0);
});

test('seeded public-input playthrough reaches and defeats the boss', () => {
  const arena = new Arena({ seed: 42 });
  arena.drainEvents();
  const dt = 0.05;
  let frames = 0;
  while (arena.state === 'play' && frames < 24000) {
    const hero = arena.hero;
    const live = arena.enemies.filter(enemy => enemy.action !== 'dead');
    const target = live.reduce((best, enemy) => !best
      || Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < Math.hypot(best.x - hero.x, best.y - hero.y)
      ? enemy : best, null);
    let dx = target ? target.x - hero.x : 0;
    let dy = target ? target.y - hero.y : 0;
    let length = Math.hypot(dx, dy) || 1;
    let x = dx / length, y = dy / length;
    const threat = live.find(enemy => enemy.action === 'telegraph' && enemy.telegraph < 0.18
      && Math.hypot(enemy.x - hero.x, enemy.y - hero.y) <= enemy.range + 35);
    const dodge = Boolean(threat && hero.dodgeCooldown <= 0 && hero.action !== 'dodge');
    if (dodge) {
      dx = hero.x - threat.x;
      dy = hero.y - threat.y;
      length = Math.hypot(dx, dy) || 1;
      x = dx / length; y = dy / length;
    }
    const special = hero.energy >= 100;
    const heavy = !dodge && !special && (
      hero.action === 'idle' || hero.action === 'run'
      || (hero.action === 'attack' && hero.actionTime >= 0.16 && hero.actionTime <= 0.34)
    );
    arena.update(dt, { x, y, dodge, special, heavy });
    frames++;
  }
  assert.equal(arena.state, 'win');
  assert.equal(arena.wave, 3);
  assert.equal(arena.waveKills, 20);
  assert.ok(arena.kills >= 60);
  assert.ok(arena.hero.hp > 0);
  assert.ok(frames * dt < 90, 'the encounter should finish within a reasonable simulated time');
});

test('musou light chain advances through all five steps and restarts at 1', () => {
  const arena = new Arena({ seed: 20, musou: true });
  arena.enemies = [];
  arena.hero.x = 640; arena.hero.y = 400; arena.hero.facing = 0;
  arena.update(0.02, { attack: true });
  const combos = [arena.hero.combo];
  for (let i = 0; i < 5; i++) {
    advanceMusouChain(arena);
    combos.push(arena.hero.combo);
  }
  assert.deepEqual(combos, [1, 2, 3, 4, 5, 1]);
});

test('musou combo 4 has a 360 degree arc and lands both hits on an enemy behind the hero', () => {
  const arena = new Arena({ seed: 21, musou: true });
  arena.enemies = [];
  arena.hero.x = 640; arena.hero.y = 400; arena.hero.facing = 0;
  arena.update(0.02, { attack: true }); // combo 1
  advanceMusouChain(arena); // combo 2
  advanceMusouChain(arena); // combo 3
  advanceMusouChain(arena); // combo 4
  assert.equal(arena.hero.combo, 4);
  assert.equal(arena.attack.arc, Math.PI * 2);
  arena._spawn('grunt');
  // Keep the enemy directly behind the hero's facing as the step's forward
  // dash moves the hero, so both hits stay in range regardless of drift.
  const enemy = closeEnemy(arena, 0, { x: arena.hero.x - 120, y: arena.hero.y, hp: 50 });
  arena.drainEvents();
  while (arena.hero.action === 'attack') {
    enemy.x = arena.hero.x - 120 * Math.cos(arena.hero.facing);
    enemy.y = arena.hero.y - 120 * Math.sin(arena.hero.facing);
    arena.update(0.02);
  }
  const swings = arena.drainEvents().filter(event => event.type === 'swing' && event.combo === 4);
  assert.equal(swings.length, 2);
  assert.equal(enemy.hp, 50 - 4 - 4);
});

test('musou special lasts ~2s, hits three times, keeps the hero invulnerable and only reaches radius 300', () => {
  const arena = new Arena({ seed: 22, musou: true });
  arena.enemies = [];
  arena.hero.x = 640; arena.hero.y = 400; arena.hero.facing = 0;
  arena.hero.energy = 100;
  arena._spawn('grunt');
  const near = closeEnemy(arena, 0, { x: 850, y: 400, hp: 80 }); // distance 210 < 300
  arena._spawn('grunt');
  const far = closeEnemy(arena, 1, { x: 1050, y: 400, hp: 80 }); // distance 410 > 300
  // A 2s special gives normal chase AI time to close distance; hold both enemies
  // still so the radius check is what's actually being tested here.
  near.range = far.range = 999;
  arena.update(0.02, { special: true });
  assert.equal(arena.hero.action, 'special');
  let elapsed = 0.02;
  let minInvulnerable = arena.hero.invulnerable;
  while (arena.hero.action === 'special') {
    arena.update(0.02);
    elapsed += 0.02;
    minInvulnerable = Math.min(minInvulnerable, arena.hero.invulnerable);
  }
  assert.ok(elapsed > 1.9 && elapsed < 2.1, `special should last ~2.0s, was ${elapsed}`);
  assert.ok(minInvulnerable > 0, 'hero must stay invulnerable for the whole special');
  const swings = arena.drainEvents().filter(event => event.type === 'swing' && event.kind === 'special');
  assert.equal(swings.length, 3);
  assert.equal(near.hp, 80 - 36);
  assert.equal(far.hp, 80);
});

test('a non-musou Arena never emits swing events for a light attack', () => {
  const arena = new Arena({ seed: 23 });
  arena.enemies = [];
  arena.hero.x = 640; arena.hero.y = 400; arena.hero.facing = 0;
  arena.update(0.05, { attack: true });
  for (let i = 0; i < 10; i++) arena.update(0.05);
  assert.equal(arena.drainEvents().filter(event => event.type === 'swing').length, 0);
});
