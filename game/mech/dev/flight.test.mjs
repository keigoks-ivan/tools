import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Player } from '../player.js';
import { FLIGHT, airInterceptHeight, rayCapsule } from '../flight.mjs';
import { Input } from '../input.js';
import { Combat } from '../combat.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const idle={mx:0,my:0,lookX:0,lookY:0};
function fixture() {
  const mech={root:new T.Group(),legYaw:0};let land=0;
  const world={height:()=>0,support:()=>0,collide:()=>false,stomp:()=>{}};
  const p=new Player(mech,world,{land:()=>land++});
  return {p,world,land:()=>land};
}
const step=(p,seconds,input={},dt=1/60)=>{for(let i=0;i<Math.round(seconds/dt);i++)p.update(dt,{...idle,...input});};

test('T takes off; neutral flight holds altitude, climb and descent use separate controls at 30/60 Hz',()=>{
  for(const dt of [1/30,1/60]) {
    const {p,land}=fixture();p.update(dt,{...idle,flight:true});step(p,2,{},dt);
    assert(p.flying&&!p.grounded&&p.pos.y>6);const y=p.pos.y;step(p,3,{},dt);
    assert(Math.abs(p.pos.y-y)<.2&&Math.abs(p.vel.y)<.1,'定高不能持續漂移');
    step(p,1,{hover:true},dt);assert(p.pos.y>y+15);step(p,1,{},dt);
    step(p,4,{descend:true},dt);assert(p.grounded&&!p.flying&&land()===1);
    step(p,1,{},dt);assert(p.pos.y===0&&p.vel.y===0);
  }
});
test('legacy held jump enters flight, toggle cancels even while climb remains held',()=>{
  const {p}=fixture();p.update(1/60,{...idle,jump:true,hover:true});step(p,1,{hover:true});assert(p.flying);
  p.update(1/60,{...idle,flight:true,hover:true});assert(!p.flying);step(p,.1,{hover:true});assert(!p.flying);
});
test('boost drains EN and forces a descent; low EN cannot re-enable flight or climb immediately',()=>{
  const {p}=fixture();p.update(1/60,{...idle,flight:true});step(p,1,{hover:true});
  let peak=0;
  for(let i=0;i<720;i++){p.update(1/60,{...idle,my:1,boost:true,hover:true});peak=Math.max(peak,p.speed);}
  assert(peak>60&&p.en>=0&&p.en<=100&&p.flightCut&&!p.flying);
  p.en=2;p.overheat=0;p.update(1/60,{...idle,flight:true});assert(!p.flying);
});
test('stationary flight recovers EN, altitude has a ceiling, restart and blocked movement remain safe',()=>{
  const {p}=fixture();p.pos.y=200;p.grounded=false;p.airT=2;p.update(1/60,{...idle,flight:true});p.en=35;
  step(p,2);assert(p.en>40);
  p.odT=40;step(p,18,{hover:true});assert(p.pos.y<=FLIGHT.ceiling+.2&&p.pos.y>FLIGHT.ceiling-1);
  p.dash(V(0,1,1).normalize(),105,.4);step(p,.3);assert(p.pos.y<=FLIGHT.ceiling,'光劍追擊也遵守飛行高度上限');
  p.update(1/60,{...idle,flight:true,flightBlocked:true});assert(!p.flying);
  step(p,8);assert(p.grounded);
});
test('flight respects wall collision and roof landing; air saber dash follows height as well as horizontal direction',()=>{
  const {p,world}=fixture();world.collide=pos=>{if(pos.z>30){pos.z=30;return true;}return false;};
  world.support=(x,z)=>z>=20?12:0;p.pos.set(0,35,0);p.grounded=false;p.airT=2;p.update(1/60,{...idle,flight:true});
  step(p,3,{my:1});assert(p.pos.z<=30);
  p.dash(V(0,1,1).normalize(),105,.4);const y=p.pos.y;step(p,.2);assert(p.pos.y>y+10&&p.dashV.y>60);
  p.dashT=0;step(p,4,{descend:true});assert(p.grounded&&p.pos.y===12);
});
test('three-dimensional beam capsule intersection covers vertical fire without false hits beyond range',()=>{
  const cap={x:0,z:0,y0:100,y1:117,r:3};
  assert.equal(rayCapsule(V(0,0,0),V(0,1,0),cap,200),97);
  assert.equal(rayCapsule(V(0,200,0),V(0,-1,0),cap,200),80);
  assert.equal(rayCapsule(V(0,0,0),V(0,1,0),cap,90),-1);
  assert.equal(rayCapsule(V(4,0,0),V(0,1,0),cap,200),-1);
  assert.equal(rayCapsule(V(0,108,-30),V(0,0,1),cap,100),27);
  assert.equal(rayCapsule(V(0,108,0),V(0,1,0),cap,100),0);
});
test('air interception clears roofs, separates altitude bands and respects ceiling without terrain searches',()=>{
  const a=airInterceptHeight(0,20,100,-1,3),b=airInterceptHeight(0,20,100,1,3);
  assert(a>70&&b>100&&b-a>20);
  assert(airInterceptHeight(0,90,40,-1,0)>=112);
  assert(airInterceptHeight(200,600,900,1,0)<=450);
});
test('flight input uses one key edge; Ctrl/C descent does not become another jump',()=>{
  const i=Object.assign(Object.create(Input.prototype),{keys:new Set(['KeyT','ControlLeft']),down:new Set(['KeyT']),up:new Set(),touch:{on:false},mdx:0,mdy:0,shiftT:0,sens:1});
  assert(i.state(1/60).flight&&i.state(1/60).descend&&!i.state(1/60).jump);
  i.endFrame();assert(!i.state(1/60).flight&&i.state(1/60).descend);
});
test('air saber pursuit rotates aim toward the target height before the swing',()=>{
  const {p}=fixture();p.flying=true;p.grounded=false;p.dashT=1;
  const c=Object.assign(Object.create(Combat.prototype),{player:p,saber:{phase:'dash',t:0,target:{pos:V(0,80,0),dead:false}},hero:{swing:0,saber:{visible:false}}});
  c.updateSaber(.1);assert(p.pitch>.8&&p.pitch<=FLIGHT.pitch&&c.saber.phase==='dash');
});
