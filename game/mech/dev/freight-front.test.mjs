import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat, STAGES } from '../combat.js';
import { companionSpawn } from '../mech-companion.mjs';

test('allies can destroy ordinary defenders without taking credit from the player or finishing the boss', () => {
  const combat = Object.assign(Object.create(Combat.prototype), {
    stats:{hits:0,kills:0,score:0}, od:{gauge:0}, audio:{impact(){}}, notes:[],
  });
  const unit = () => ({ap:100,apMax:100,stag:0,stagT:0,K:{stag:100},m:{impact(){}}});
  const enemy=unit();
  combat.damageEnemy(enemy,110,1,null,null,false,'frontline');
  assert(enemy.dead);
  assert.deepEqual(combat.stats,{hits:0,kills:0,score:0});
  combat.boss=unit();
  combat.damageEnemy(combat.boss,110,1,null,null,false,'frontline');
  assert.equal(combat.boss.ap,25);
  assert(!combat.boss.dead);
});

test('the second companion on stage seven can deploy on the opposite side without overlapping', () => {
  assert.equal(STAGES[6].companion.second.name,'白隼');
  assert(STAGES[6].companion.second.aggressors);
  const player={pos:new THREE.Vector3(),yaw:0},world={support:()=>0,collide:()=>false};
  const first=companionSpawn(world,player);
  const second=companionSpawn(world,player,-first.side,first.position);
  assert.equal(second.side,-first.side);
  assert(second.position.distanceTo(first.position)>30);
});
