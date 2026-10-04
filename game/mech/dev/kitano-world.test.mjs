import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../env.js';
import { Solid } from '../zero/kit.js';
import { Player } from '../player.js';
import { kitanoScenery } from '../kobe-kitano.js';

function fixture() {
  const W=Object.create(World.prototype);
  Object.assign(W,{battlefield:'city',terrain:{height:()=>0},kitanoSolid:new Solid(),nearBoxes:()=>[],stomp:()=>{}});
  W.kitano=kitanoScenery({face(){},solid:b=>W.kitanoSolid.add(b),floor:b=>W.kitanoSolid.add(b)}, {x:-800,z:-240,yaw:Math.PI});
  return W;
}
test('本篇機甲可從西側道路走完整北野坡道，城市邊界涵蓋新街區',()=>{
  const W=fixture(),P=new Player({root:new THREE.Group(),legYaw:0},W);
  const route=[[-720,.04,-240],...W.kitano.routes.walk];P.pos.set(...route[0]);
  for(const [x,y,z]of route.slice(1)) {
    let steps=0,limit=Math.ceil(Math.hypot(P.pos.x-x,P.pos.z-z)*15)+300;
    while(Math.hypot(P.pos.x-x,P.pos.z-z)>.5&&steps++<limit){P.yaw=Math.atan2(x-P.pos.x,z-P.pos.z);P.update(1/60,{mx:0,my:1,lookX:0,lookY:0});}
    assert(steps<limit,`機甲路徑被擋在 ${P.pos.toArray()}，目標 ${x},${z}`);
    assert(Math.abs(P.pos.y-y)<.7,`機甲沒有踩在坡面 ${P.pos.y}，目標 ${y}`);
  }
  assert(P.pos.x<-700,'機甲仍被舊城市邊界擋在北野之外');
});
test('北野外牆可擋射線與碰撞，切到其他戰場時不留下隱形街區',()=>{
  const W=fixture(),wall=W.kitano.solids.find(b=>b.y1-b.y0>5);
  assert(wall);const y=(wall.y0+wall.y1)/2,z=(wall.z0+wall.z1)/2;
  const start=new THREE.Vector3(wall.x0-3,y,z),end=new THREE.Vector3(wall.x1+3,y,z),normal=new THREE.Vector3();
  assert(W.raycast(start,end,normal)>=0);assert(normal.lengthSq()>.5);
  const point=new THREE.Vector3(wall.x0+.1,wall.y0,z);assert(W.collide(point,.35,point.y));
  W.battlefield='forest';assert.equal(W.raycast(start,end),-1);
  assert.equal(W.collide(new THREE.Vector3(wall.x0+.1,wall.y0,z),.35,wall.y0),false);
});
