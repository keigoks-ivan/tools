import assert from 'node:assert/strict';
import test from 'node:test';
import { warriorFrameAt } from '../2d/warrior-animation.js';
import { Arena } from '../2d/combat.js';

test('third-person sword attacks visibly progress through windup, strike, follow-through and guard', () => {
  assert.deepEqual([0, 0.1, 0.2, 0.31].map(time => warriorFrameAt('attack', time)), [4, 5, 2, 7]);
  assert.deepEqual([0, 0.1, 0.25].map(time => warriorFrameAt('attack', time, 0, 3)), [3, 6, 7]);
  assert.deepEqual([0, 0.25, 0.5].map(time => warriorFrameAt('heavy', time)), [3, 6, 7]);
  assert.notEqual(warriorFrameAt('run', 0, 0), warriorFrameAt('run', 0, 0.12));
});

test('third-person combat starts with a smaller forward group and keeps momentum during a slash', () => {
  const arena = new Arena({ seed: 17, warriorMode: true });
  assert.equal(arena.waveGoal, 10);
  assert.equal(arena.enemies.length, 4);
  assert.ok(arena.enemies.every(enemy => enemy.y < arena.hero.y));
  const target = arena.enemies[0];
  target.x = arena.hero.x + 90;
  target.y = arena.hero.y;
  target.cooldown = 5;
  arena.enemies = [target];
  const before = arena.hero.x;
  arena.update(0.08, { attack: true });
  assert.equal(arena.hero.action, 'attack');
  assert.ok(arena.hero.x > before, 'sword attack lunges toward its chosen target');
  assert.equal(target.hp, 0, 'a clean light strike defeats a regular enemy');
  assert.ok(arena.drainEvents().some(event => event.type === 'kill'));
});

test('third-person encounter can be completed with movement, attacks and dodge inputs', () => {
  const arena = new Arena({ seed: 42, warriorMode: true });
  const dt = 0.05;
  let frames = 0;
  while (arena.state === 'play' && frames < 900) {
    const hero = arena.hero;
    const live = arena.enemies.filter(enemy => enemy.action !== 'dead');
    const target = live.reduce((best, enemy) => !best ||
      Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < Math.hypot(best.x - hero.x, best.y - hero.y)
      ? enemy : best, null);
    let dx = target ? target.x - hero.x : 0;
    let dy = target ? target.y - hero.y : 0;
    let length = Math.hypot(dx, dy) || 1;
    let x = dx / length, y = dy / length;
    const threat = live.find(enemy => enemy.action === 'telegraph' && enemy.telegraph < 0.18 &&
      Math.hypot(enemy.x - hero.x, enemy.y - hero.y) <= enemy.range + 35);
    const dodge = Boolean(threat && hero.dodgeCooldown <= 0 && hero.action !== 'dodge');
    if (dodge) {
      dx = hero.x - threat.x; dy = hero.y - threat.y;
      length = Math.hypot(dx, dy) || 1;
      x = dx / length; y = dy / length;
    }
    const special = hero.energy >= 100;
    const attack = !dodge && !special && (hero.action === 'idle' || hero.action === 'run' ||
      hero.action === 'attack' && hero.actionTime >= 0.15 && hero.actionTime <= 0.3);
    arena.update(dt, { x, y, dodge, special, attack });
    frames++;
  }
  assert.equal(arena.state, 'win');
  assert.equal(arena.wave, 2);
  assert.ok(arena.kills >= 20);
  assert.ok(frames * dt < 45);
});
