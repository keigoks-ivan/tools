import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat, W } from '../combat.js';

const vector = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const noop = () => {};

function missileFixture() {
  const torso = new THREE.Object3D();
  const hits = [];
  const combat = Object.assign(Object.create(Combat.prototype), {
    hero: { bones: { torso } }, player: {}, msl: { cd: 1 }, aimDir: vector(0, 0, 1), eye: vector(),
    missiles: [], events: [], enemies: [], od: { active: false },
    fx: { missile: () => null, missileEnd: noop, explosion: noop },
    audio: { missileLaunch: noop, explosion: noop },
    world: { raycast: () => -1, blast: noop },
    damageEnemy: (enemy, damage) => hits.push({ enemy, damage }),
  });
  return { combat, hits };
}

test('the single-player salvo gets the new damage and tracking without spawning more projectiles', () => {
  const { combat } = missileFixture();
  const target = {};
  combat.launchSalvo([target]);
  assert.equal(combat.msl.cd, 0);
  for (const event of combat.events) event.fn();
  assert.equal(combat.missiles.length, 6);
  assert.equal(W.msl.cd, 5);
  assert(combat.missiles.every(m => m.target === target && m.dmg === 480 && m.vmax === 230 && m.turn === 6.6));
});

test('a fast missile hits the closest crossed mech and a solid wall blocks the remaining splash', () => {
  const gun = () => ({ own: 'player', pos: vector(), vel: vector(230, 0, 0), speed: 230,
    vmax: 230, acc: 320, turn: 6.6, t: 0, life: 6, dmg: 480 });
  const mech = x => ({ scale: 1, chest: out => out.set(x, 0, 0) });
  const near = mech(8), far = mech(34);
  const { combat, hits } = missileFixture();
  combat.enemies = [far, near];
  combat.missiles = [gun()];
  combat.updateMissiles(.12);
  assert.deepEqual(hits, [{ enemy: near, damage: 480 }]);
  assert.equal(combat.missiles.length, 0);

  const behindWall = mech(10);
  combat.enemies = [behindWall];
  combat.world.raycast = (from, to) => from.x < 2 && to.x > 2 ? (2 - from.x) / (to.x - from.x) : -1;
  hits.length = 0;
  combat.missiles = [gun()];
  combat.updateMissiles(.12);
  assert.deepEqual(hits, []);
  assert.equal(combat.missiles.length, 0);
});
