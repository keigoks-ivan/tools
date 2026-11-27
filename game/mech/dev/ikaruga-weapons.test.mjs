import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Audio} from '../audio.js';
import {World} from '../env.js';
import {BattleLine} from '../battle-line.mjs';
import {Mech,initMechMaterials} from '../mechs.js';
import {IKARUGA_WEAPONS,IkarugaCombat,fitIkaruga} from '../ikaruga/loadout.mjs';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const noop=()=>{};
const silentAudio=new Proxy(Audio.prototype,{get:(methods,name)=>typeof methods[name]==='function'?noop:undefined});
const silent=new Proxy({},{get:()=>noop});
globalThis.document ||= {createElement:()=>({getContext:()=>({
  createRadialGradient:()=>({addColorStop:noop}),fillRect:noop,
  createImageData:(w,h)=>({data:new Uint8Array(w*h*4)}),putImageData:noop,
})})};
const A={wearM:null};
initMechMaterials(A);
const scene=new THREE.Scene();
const hero=new Mech('grunt','ally');
fitIkaruga(hero,A);
scene.add(hero.root);

function mission(){
  const world={A,height:()=>0,support:()=>0,raycast:()=>-1,collide:()=>false,hitBuilding:noop,stomp:noop};
  hero.root.position.set(0,0,0);
  const player={pos:hero.root.position,vel:V(),yaw:0,pitch:0,grounded:true,flying:false};
  const c=new IkarugaCombat({stage:1,stageDef:{},world,scene,hero,player,fx:silent,cockpit:silent,audio:silentAudio});
  c.phase='fight';c.aimDir.set(0,0,1);c.eye.set(0,10,0);
  return c;
}
function enemy(c,x,z,kind='grunt'){
  const e=c.spawn(kind,0,1,{x,z,ground:true,tx:0,tz:0});
  e.dropping=false;e.los=true;e.ap=e.apMax=18000;
  return e;
}

function lookAt(c,point){
  c.aimDir.copy(point).sub(c.eye).normalize();
  if(c.camera){c.camera.position.copy(c.eye);c.camera.lookAt(point);c.camera.updateMatrixWorld();}
}
function aimPart(c,part){
  part.mesh.getWorldPosition(part.position);
  lookAt(c,part.position);
}
function scopeShot(c){
  c.playerWeapons(.016,{lockHold:true});c.playerWeapons(.016,{lockRelease:true});
}

test('flat fire and the separate 1200 m scoped round use the exact sight, 36-round magazine and a single release',()=>{
  const c=mission(),near=enemy(c,0,120), far=enemy(c,0,1080);
  c.camera=new THREE.PerspectiveCamera();lookAt(c,near.chest(V()));
  c.playerWeapons(.016,{fire:true});
  assert.equal(near.ap,18000-IKARUGA_WEAPONS.rifle.dmg);
  assert.equal(c.rifle.ammo,35);
  near.dead=true;c.rifle.cd=0;c.playerWeapons(.016,{fire:true});assert.equal(far.ap,18000);
  c.playerWeapons(.016,{lockRelease:true});assert.equal(far.ap,18000);
  c.playerWeapons(.2,{lockHold:true,fire:true});assert.equal(c.scopeContact.enemy,far);
  assert.ok(c.scopeActive&&hero.railSlide.position.z>2);
  assert.equal(c.rifle.ammo,34);
  c.playerWeapons(.016,{lockRelease:true});
  assert.equal(far.ap,18000-IKARUGA_WEAPONS.msl.dmg);
  assert.equal(c.msl.cd,0);assert.equal(c.scopeActive,false);assert.equal(c.scopeContact,null);
  const count=c.stats.shots;c.playerWeapons(.016,{lockRelease:true});assert.equal(c.stats.shots,count);
  c.playerWeapons(2,{lockHold:true});c.playerWeapons(.016,{});c.playerWeapons(.016,{lockRelease:true});
  assert.equal(c.stats.shots,count);
  c.playerWeapons(.016,{lockPress:true,lockRelease:true});assert.equal(c.stats.shots,count+1);
  c.msl.cd=1;far.pos.z=1230;lookAt(c,far.chest(V()));scopeShot(c);
  assert.equal(far.ap,18000-2*IKARUGA_WEAPONS.msl.dmg);
  assert.equal(c.events.length,0);assert.equal(c.missiles.length,0);
  c.dispose();
});

test('hitting visible triangles on the shoulder breaks its weapon, the rear module slows the surviving mech',()=>{
  const c=mission(),e=enemy(c,0,920,'heavy');
  c.camera=new THREE.PerspectiveCamera();e.m.root.rotation.y=Math.PI;
  const {cannon,booster}=e.components;
  c.eye.set(0,15,0);aimPart(c,cannon);
  c.playerWeapons(.016,{lockHold:true});
  assert.equal(c.scopeContact.part,cannon);assert.ok(c.scopeContact.parts.includes(cannon));
  assert.ok(!c.scopeContact.parts.includes(booster),'hull hides the rear nozzle from the front');
  c.playerWeapons(.016,{lockRelease:true});
  assert.equal(cannon.disabled,true);assert.equal(cannon.mesh.visible,false);assert.equal(booster.hp,booster.maxHP);
  assert.equal(e.dead,false);
  e.burst=1;e.burstT=0;
  c.bullet=()=>assert.fail('shoulder weapon fired after destruction');c.enemyFire(e,.1,100,V());
  const line=new BattleLine(c,{});
  line.fire({entity:e,weapon:{},cool:0},{pos:V()});
  assert.equal(line.shots.length,0);
  e.m.root.rotation.y=0;aimPart(c,booster);c.msl.cd=1;
  c.playerWeapons(.016,{lockHold:true});assert.equal(c.scopeContact.part,booster);
  c.playerWeapons(.016,{lockRelease:true});assert.equal(booster.disabled,true);
  e.pos.z=600;e.vel.set(0,0,-80);const z=e.pos.z;c.moveEnemy(e,.1,false);
  assert.ok(z-e.pos.z<.6);e.qbCd=0;c.enemyQB(e,1);assert.equal(e.qbT,0);
  assert.equal(cannon.mesh.geometry,enemy(c,0,420).components.cannon.mesh.geometry);
  c.dispose();
});

test('equipment cannot be hit through a solid wall or by a miss with a soft lock',()=>{
  const c=mission(),e=enemy(c,0,900);
  c.camera=new THREE.PerspectiveCamera();c.lockTarget=e;
  const {cannon}=e.components;
  aimPart(c,cannon);c.world.raycast=()=>.2;
  c.playerWeapons(.016,{lockHold:true});assert.equal(c.scopeContact,null);
  c.playerWeapons(.016,{lockRelease:true});assert.equal(cannon.hp,cannon.maxHP);assert.equal(e.ap,18000);
  c.world.raycast=()=>-1;c.msl.cd=1;lookAt(c,V(10,11,900));
  scopeShot(c);assert.equal(e.ap,18000);assert.equal(cannon.hp,cannon.maxHP);
  c.dispose();
});

function coverWorld(c,boxes){
  c.world.nearBoxes=()=>boxes;c.world.raycast=World.prototype.raycast;
}
function wall(z,penetrable){
  return {x0:-20,x1:20,z0:z,z1:z+4,bottom:0,top:40,penetrable,hits:0,hit(amount){this.hits+=amount;}};
}

test('one chambered round pierces a destructible wall and up to three separate mechs; hard cover and second wall stop it',()=>{
  const c=mission(), row=[100,145,185,220].map(z=>enemy(c,0,z));
  const first=wall(48,true),second=wall(163,true);
  coverWorld(c,[first,second]);c.playerWeapons(.016,{cannon:true});
  assert.ok(c.penetratorArmed);assert.equal(c.stats.shots,0);
  c.playerWeapons(.016,{fire:true});
  assert.ok(!c.penetratorArmed);assert.ok(c.cannon.cd<.01);
  assert.equal(first.hits,4);assert.equal(second.hits,4);
  assert.ok(row[0].ap<18000&&row[1].ap<18000);
  assert.equal(row[2].ap,18000);assert.equal(row[3].ap,18000);
  c.playerWeapons(.3,{cannon:true});assert.equal(c.penetratorArmed,false);
  c.playerWeapons(12,{});c.playerWeapons(.016,{cannon:true});
  first.penetrable=false;scopeShot(c);
  assert.equal(first.hits,8);assert.equal(second.hits,4);assert.equal(row[2].ap,18000);
  c.cannon.cd=1;c.rifle.cd=0;coverWorld(c,[]);c.playerWeapons(.016,{cannon:true,fire:true});
  assert.ok(row[2].ap<18000);assert.equal(row[3].ap,18000);
  c.dispose();
});

test('the physical muzzle obstruction wins even when the camera sees a target; missed rounds consume penetration',()=>{
  const c=mission(),e=enemy(c,0,120);
  c.world.raycast=(a,b,n)=>{if(a.distanceTo(c.eye)<.01)return -1;n?.set(0,0,-1);return .01;};
  scopeShot(c);assert.equal(e.ap,18000);
  c.playerWeapons(.016,{cannon:true});lookAt(c,V(180,25,0));
  c.playerWeapons(.016,{fire:true});assert.equal(c.penetratorArmed,false);assert.equal(e.ap,18000);
  c.dispose();
});

test('solid rising terrain wins over a penetrable wall in the same terrain sample',()=>{
  const c=mission(),box=wall(50,true);
  coverWorld(c,[box]);
  c.world.height=(x,z)=>Math.max(0,(z-46)*4);
  const hit={},n=V(),fraction=c.world.raycast(V(0,10,0),V(0,10,192),n,null,hit);
  assert.equal(hit.box,null);assert.equal(n.y,1);
  assert.ok(fraction*192<50);
  c.dispose();
});
