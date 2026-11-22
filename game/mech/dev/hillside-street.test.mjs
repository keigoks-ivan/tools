import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HillsideFront } from '../hillside-front.mjs';
import { chipAlleyFace, resetAlleyFaces, settleAlley } from '../hillside-street.mjs';

const vec=(x,y,z)=>new THREE.Vector3(x,y,z);
const segment=vertices=>{
  const a=new THREE.Float32BufferAttribute(vertices,3);
  return {a,s:0,o:a.array.slice()};
};

test('the struck panel stays chipped when the facade moves and restores on replay',()=>{
  const g=segment([0,10,0,3,10,0,3,14,0,0,14,0,3,10,0,6,10,0,6,14,0,3,14,0]);
  const face={x:1.5,y:12,z:0,nx:0,nz:1,width:3,height:4,at:0};
  const b={seg:[g],burn:{a:new THREE.Float32BufferAttribute(new Float32Array(48),1),s:16},alley:{faces:[face,{...face,x:4.5,at:4}]}};
  const intact=g.o.slice();
  chipAlleyFace(b,vec(1.5,12,0),vec(0,0,1),1);
  assert.notDeepEqual(g.o.slice(0,12),intact.slice(0,12));assert.deepEqual(g.o.slice(12),intact.slice(12));
  assert.deepEqual(g.a.array,g.o);
  chipAlleyFace(b,vec(4.5,12,0),vec(0,0,-1),1);assert(!b.alley.faces[1].savedPanel);
  resetAlleyFaces(b);assert.deepEqual(g.o,intact);
});

test('upper floors start falling later, collision follows their height, and original slabs settle above the terrain',()=>{
  const gy=17;
  const floors=[0,1,2].map(i=>({f0:i,f1:i+1,r0:i,r1:i+1,slab:i,pieces:[{begin:i,end:i+1,cx:0,cz:0,ground:gy,leanX:.2,leanZ:0,yaw:.06}],base:i*4,top:(i+1)*4}));
  const v=floors.flatMap(f=>[0,gy+f.top,0]);
  const b={cx:0,cz:0,alley:{floors,gy,hand:1},seg:[segment(v),segment(v)],box:{top:gy+12},top0:gy+12,rh:[gy+1.4]};
  settleAlley(b,.25);assert(b.seg[1].a.array[1]<gy+4);assert.equal(b.seg[1].a.array[7],gy+12);
  settleAlley(b,.9);assert(b.box.top<gy+12&&b.box.top>gy+4);
  settleAlley(b,3,true);
  for(let i=0;i<3;i++)assert(Math.abs(b.seg[1].a.array[i*3+1]-(gy+.46+i*.23))<.001);
});

test('a frontage shields a hidden pilot and takes the round fired at the last visible position',()=>{
  const player={pos:vec(24,0,0),vel:vec(0,0,0)};
  let blocked=false,wallDamage=0,playerDamage=0;
  const w={hillsideSite:{},height:()=>0,raycast:(a,b,n)=>{n?.set(-1,0,0);return blocked?.5:-1;},
    bldAt:()=>({alley:{}}),hitBuilding:(p,d)=>{assert.equal(p.x,12);wallDamage+=d;}};
  const c={player,world:w,fx:{muzzle(){},shellTracer(){},explosion(){},impact(){}},audio:{cannon(){},explosion(){}},hurt(){playerDamage++;}};
  const f=new HillsideFront(c,{sec:1}),a={kind:'heavy',active:true,entity:{},pos:vec(0,0,0),weapon:{range:260,cool:3,damage:480},shots:0};
  assert.equal(f.pick(a),f.player);blocked=true;player.pos.x=130;
  const wall=f.pick(a);assert(wall.wall);assert.equal(wall.pos.x,24);
  f.fire(a,wall);assert.equal(f.shots.length,1);f.impacts(1);
  assert(wallDamage>0);assert.equal(playerDamage,0);
  f.clock=5;assert.equal(f.pick(a),null);
});
