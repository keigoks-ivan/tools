import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat, STAGES } from '../combat.js';
import { FreightFront } from '../freight-front.mjs';
import { buildFreightYard } from '../freight-yard.mjs';
import { companionSpawn } from '../mech-companion.mjs';

test('the station combines static props into at most ten draws and shares the existing material inputs', () => {
  const boxes = [], scene = new THREE.Scene();
  const world = { height: () => 0, addCollider: box => boxes.push(box) };
  const yard = buildFreightYard(world, scene);
  const triangles = yard.children.reduce((total, mesh) => total + mesh.geometry.index.count / 3, 0);
  assert(triangles > 10000 && triangles < 23000);
  assert(yard.children.length <= 10);
  assert(boxes.length >= 30 && boxes.every(box => box.x0 < box.x1 && box.z0 < box.z1));
  assert(yard.children.every(mesh => mesh.isMesh && mesh.userData.fieldGeometry));
});

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

test('the third stage branch assigns different advance orders and remembers its checkpoint lane', () => {
  const D=STAGES[2];
  assert(D.frontline && D.battlefield==='freight');
  assert(D.route.secs.every(s=>!s.hold));
  const combat={
    world:{height:()=>0},player:{pos:new THREE.Vector3(),ap:8000,apMax:9000},
    rifle:{mag:40},stats:{time:5},say(){},lines(){},
  };
  const actor=()=>({pos:new THREE.Vector3(-385,0,0),goal:new THREE.Vector3(),route:[]});
  for (const lane of ['main','flank']) {
    combat.cp=null;
    const front=new FreightFront(combat,{sec:0});
    front.lane=lane;front.wing=actor();front.tanks=[actor(),actor()];
    front.advance('approach');
    assert.equal(combat.cp.lane,lane);
    assert.equal(front.enc.sec,1);
    assert.equal(front.tanks[0].goal.x,lane==='main'?-83:-201);
    assert.equal(front.wing.route.at(-1).z,lane==='main'?6:-82);
    assert.equal(new FreightFront(combat,{sec:1}).lane,lane);
  }
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
