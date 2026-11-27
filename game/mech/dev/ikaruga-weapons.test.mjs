import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Mech,initMechMaterials} from '../mechs.js';
import {IKARUGA_WEAPONS,IkarugaCombat,fitIkaruga} from '../ikaruga/loadout.mjs';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const noop=()=>{};
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
  const world={A,height:()=>0,support:()=>0,raycast:()=>-1,collide:()=>false,hitBuilding:noop};
  hero.root.position.set(0,0,0);
  const player={pos:hero.root.position,vel:V(),yaw:0,pitch:0,grounded:true,flying:false};
  const c=new IkarugaCombat({stage:1,stageDef:{},world,scene,hero,player,fx:silent,cockpit:silent,audio:silent});
  c.phase='fight';c.aimDir.set(0,0,1);c.eye.set(0,10,0);
  return c;
}
function enemy(c,x,z,kind='grunt'){
  const e=c.spawn(kind,0,1,{x,z,ground:true,tx:0,tz:0});
  e.dropping=false;e.los=true;e.ap=e.apMax=18000;
  return e;
}

test('pile driver hits only the first capsule, uses proximity damage, and respects the actual muzzle path',()=>{
  const c=mission(),a=enemy(c,0,45),b=enemy(c,0,180);
  c.lockTarget=b;
  c.fireRifle();
  assert.equal(a.ap,18000-IKARUGA_WEAPONS.rifle.dmg*1.6);
  assert.equal(b.ap,18000);
  assert.equal(c.rifle.ammo,7);
  a.dead=true;
  c.rifle.cd=0;c.fireRifle();
  assert.equal(b.ap,18000-IKARUGA_WEAPONS.rifle.dmg);
  const previous=b.ap;
  c.world.raycast=(from,to,n)=>{n?.set(0,0,-1);return .05;};
  c.rifle.cd=0;c.fireRifle();assert.equal(b.ap,previous);
  assert.deepEqual(c.missiles,[]);
  assert.equal(c.events.length,0);
  assert.ok(c.hero.anchorPort.parent===c.hero.bones.handL);
  assert.ok(c.hero.muzzle.parent===c.hero.weapon);
  c.dispose();
});

test('releasing the native lock input reels a light mech and pulls the pilot toward a heavy mech',()=>{
  const c=mission(),p=c.player.pos,a=enemy(c,0,100);
  c.playerWeapons(.12,{lockHold:true});
  assert.equal(c.tow,null);assert.deepEqual(c.msl.locks,[a]);
  c.playerWeapons(.016,{lockRelease:true});
  assert.equal(c.tow.enemy,a);
  c.updateTow(.35);
  assert.ok(a.pos.z<55 && p.z===0);
  a.dead=true;c.updateTow(.016);
  assert.equal(c.cable.visible,false);
  const b=enemy(c,0,150,'heavy');c.lockTarget=b;c.msl.cd=1;
  c.playerWeapons(.016,{lockRelease:true});
  c.updateTow(.3);
  assert.ok(p.z>35 && b.pos.z===150);
  assert.equal(c.missiles.length,0);
  assert.equal(c.events.length,0);
  c.dispose();
});

test('winch stops ahead of hull collisions and refuses blocked anchors or premature landing departure',()=>{
  const c=mission(),e=enemy(c,0,180,'heavy');
  c.enc={front:{ashore:false},dispose:noop};
  c.launchSalvo([e]);assert.equal(c.tow,null);assert.equal(c.msl.cd,1);
  c.enc.front.ashore=true;c.world.raycast=()=>.5;
  c.launchSalvo([e]);assert.equal(c.tow,null);assert.equal(c.msl.cd,1);
  c.world.raycast=()=>-1;c.world.collide=p=>p.z>31;
  c.launchSalvo([e]);c.updateTow(.9);
  assert.ok(c.player.pos.z>=28 && c.player.pos.z<=31);
  assert.equal(c.tow,null);
  assert.equal(c.cable.visible,false);
  c.dispose();
});

test('directional shockwave staggers visible enemies in its cone and leaves enemies behind cover intact',()=>{
  const c=mission(),mid=enemy(c,0,50),left=enemy(c,-22,45),blocked=enemy(c,26,45),far=enemy(c,0,120),behind=enemy(c,0,-30);
  c.world.raycast=(from,to)=>to.x>20?.4:-1;
  c.playerWeapons(.016,{cannon:true});
  assert.equal(c.cannon.cd,0);
  assert.ok(c.wave.visible&&mid.ap<mid.apMax&&left.ap<left.apMax);
  for(const e of [far,blocked,behind])assert.equal(e.ap,e.apMax);
  const before=mid.ap;
  c.playerWeapons(.5,{cannon:true});
  assert.equal(mid.ap,before);
  c.dispose();
  assert.equal(c.wave.parent,null);assert.equal(c.cable.parent,null);
});
