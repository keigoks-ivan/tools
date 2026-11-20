import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat, STAGES } from '../combat.js';
import { companionSpawn, MechCompanion } from '../mech-companion.mjs';

test('a companion walks along a wall and stops stepping when both axes are blocked', () => {
  const v=(x=0,z=0)=>new THREE.Vector3(x,0,z);
  const companion=Object.assign(Object.create(MechCompanion.prototype), {
    pos:v(),vel:v(28,8),move:v(28,8),pose:{vel:v()},aim:v(),mech:{animate(){}},
    face:0,heading:0,thinkIn:1,fireIn:1,
    combat:{world:{collide(pos){pos.x=0;},support:()=>0}},
  });
  companion.update(1/60);
  assert.deepEqual(companion.pose.vel.toArray(),[0,0,8]);
  assert.equal(companion.pose.boost,0);
  const lastZ=companion.pos.z;
  companion.combat.world.collide=pos=>pos.set(0,0,lastZ);
  companion.update(1/60);
  assert.equal(companion.pose.vel.lengthSq(),0);
  assert(companion.vel.x>25);
});

test('a companion joins on a clear flank and defers arrival if both sides and the route are blocked', () => {
  const player = { pos: new THREE.Vector3(), yaw: 0 };
  const world = { support: () => 2, collide: pos => pos.x >= 0 };
  const spawn = companionSpawn(world, player);
  assert.equal(spawn.side, -1);
  assert.deepEqual(spawn.position.toArray(), [-20, 2, 12]);
  assert.equal(companionSpawn({ ...world, collide: () => true }, player), null);
  player.flying = true; player.pos.y = 40;
  assert.equal(companionSpawn(world, player).position.y, 35);
});

test('support can interrupt normal enemies without awarding the player a hit, a kill or overdrive', () => {
  const combat = Object.assign(Object.create(Combat.prototype), {
    stats: { hits: 0, score: 0, kills: 0 }, od: { gauge: 0 }, notes: [],
    audio: { impact() {}, hitmarker() { assert.fail('ally hits are not player hits'); } },
  });
  const enemy = { ap: 100, apMax: 100, stag: 0, stagT: 0, K: { stag: 54 }, m: { impact() {} } };
  for (let i = 0; i < 5; i++) combat.damageEnemy(enemy, 30, 30, null, null, false, true);
  assert.equal(enemy.ap, 25);
  assert(enemy.stagT > 0);
  assert.deepEqual(combat.stats, { hits: 0, score: 0, kills: 0 });
  assert.equal(combat.od.gauge, 0);
  combat.boss = enemy;
  enemy.ap = 100;
  combat.damageEnemy(enemy, 50, 30, null, null, false, true);
  assert.equal(enemy.ap, 100);
});

test('the final mission waits for the bridge defense, and a saved checkpoint can rejoin afterward', () => {
  const combat = Object.assign(Object.create(Combat.prototype), {
    stage: 10, enc: { sec: 4 }, companionCheck: 0,
    world: { support: () => 0, collide: () => true }, player: { pos: new THREE.Vector3(), yaw: 0 },
  });
  combat.joinCompanion(1);
  assert.equal(combat.companionCheck, 0);
  combat.enc.sec = 5;
  combat.joinCompanion(0);
  assert(combat.companionCheck > 0, 'joining is attempted after the fifth sector');
  assert.deepEqual(STAGES.flatMap((stage, i) => stage.companion ? [i + 1] : []), [5, 7, 9, 10]);
  assert.equal(STAGES[4].companion.afterAreas, 8);
});
