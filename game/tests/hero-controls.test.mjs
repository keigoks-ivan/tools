import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena } from '../2d/combat.js?v=20261002b';
import { HEROES } from '../3d-next/heroes.js?v=20261002b';
import { HoldRepeat } from '../3d-next/touch-input.js';
import { createHeroSpecialFx } from '../3d-next/hero-special-fx.js';
import * as THREE from 'three';

const arenaFor = heroProfile => new Arena({ heroProfile, musou: true, warriorMode: true, director: true, musouFlurry: true });
const advance = (arena, seconds) => { for (let t = 0; t < seconds; t += 1 / 120) arena.update(1 / 120); };

test('early taps link every hero through the whole chain using the public input API', () => {
  for (const profile of Object.values(HEROES)) {
    const arena = arenaFor(profile);
    arena.update(1 / 120, { attack: true });
    for (let i = 1; i < profile.chain.length; i++) {
      advance(arena, 0.045);
      arena.update(1 / 120, { attack: true });
      advance(arena, profile.chain[i - 1].cancel - 0.045);
      assert.equal(arena.hero.combo, i + 1, `${profile.id}: early input lost before link ${i + 1}`);
    }
  }
});

test('held attacks complete each chain; releasing the hold stops future attacks', () => {
  for (const profile of Object.values(HEROES)) {
    const arena = arenaFor(profile), holds = new HoldRepeat(); holds.press('attack', 'keyboard-j');
    const seen = new Set();
    for (let t = 0; t < 8; t += 1 / 60) {
      arena.update(1 / 60, { attack: holds.tick(1 / 60).includes('attack') });
      for (const event of arena.drainEvents()) if (event.type === 'slash') seen.add(event.combo);
    }
    assert.equal(seen.size, profile.chain.length);
    holds.release('keyboard-j');
    advance(arena, 3);
    arena.drainEvents(); advance(arena, 1);
    assert.equal(arena.drainEvents().filter(e => e.type === 'slash').length, 0);
  }
});

test('an early heavy branch takes priority over a held light attack', () => {
  for (const profile of Object.values(HEROES)) {
    const arena = arenaFor(profile);
    arena.update(1 / 120, { attack: true });
    arena.update(1 / 120, { heavy: true });
    for (let t = 0; t < profile.chain[0].cancel + 0.02; t += 1 / 120) arena.update(1 / 120, { attack: true });
    assert.equal(arena.attack.name, profile.charges[0].name);
    assert.equal(arena.attack.charge, 2);
  }
});

test('the combo survives a short recovery pause, then expires; resetting cannot retain it', () => {
  const arena = arenaFor(HEROES.violet);
  arena.update(1 / 120, { attack: true }); advance(arena, HEROES.violet.chain[0].duration + 0.1);
  arena.update(1 / 120, { attack: true }); assert.equal(arena.hero.combo, 2);
  advance(arena, HEROES.violet.chain[1].duration + 0.5);
  arena.update(1 / 120, { attack: true }); assert.equal(arena.hero.combo, 1);
  arena.reset(); arena.update(1 / 120, { attack: true }); assert.equal(arena.hero.combo, 1);
});

test('azure shockwaves expand while amber actually dashes, rather than sharing radial flurry damage', () => {
  const azure = arenaFor(HEROES.azure);
  const near = azure.spawn('grunt', azure.hero.x + 200, azure.hero.y, { hp: 200, fixed: true, ai: 'external' });
  const far = azure.spawn('grunt', azure.hero.x + 370, azure.hero.y, { hp: 200, fixed: true, ai: 'external' });
  azure.hero.energy = 100; azure.update(1 / 120, { special: true }); advance(azure, 1.0);
  assert.ok(near.hp < 200); assert.equal(far.hp, 200);
  advance(azure, 1.5); assert.ok(far.hp < 200);
  const amber = arenaFor(HEROES.amber), start = amber.hero.x;
  amber.spawn('grunt', start + 250, amber.hero.y, { hp: 200, fixed: true, ai: 'external' });
  amber.hero.energy = 100; amber.update(1 / 120, { special: true }); advance(amber, 0.5);
  assert.ok(amber.hero.x > start + 200);
  assert.ok(amber.drainEvents().some(e => e.type === 'swing' && e.from && e.hits > 0));
});

test('ultimate presentation uses a bounded pool and clears all effects on reset', () => {
  const scene = new THREE.Scene(), fx = createHeroSpecialFx(THREE, scene, () => 0), pos = new THREE.Vector3();
  for (const style of ['azure', 'amber']) {
    fx.setStyle(style);
    for (let i = 0; i < 50; i++) fx.onEvent({ type: 'musouFinish', radius: 400 }, pos);
    assert.ok(fx.stats().active <= fx.stats().capacity);
    fx.reset(); assert.equal(fx.stats().active, 0);
    fx.onEvent({ type: 'swing', flurry: true, index: 0, radius: 200, facing: 0 }, pos);
    fx.update(2); assert.equal(fx.stats().active, 0);
  }
  fx.dispose(); assert.equal(scene.children.length, 0);
});
