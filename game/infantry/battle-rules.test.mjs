import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Pilot, P } from '../mech/zero/player.js';
import { Solid } from '../mech/zero/kit.js';
import { DIFFICULTIES } from './scenarios.mjs';
import { captureThreat, resupplyBlocked, resupplyVitals } from './battle-rules.mjs';

const target={x:0,y:0,z:0};
const enemy=(x,z,y=0)=>({pos:{x,y,z},dead:false,friendly:false});
const controls={mx:0,my:0,lookX:0,lookY:0,jump:false,sprint:false,crouch:false,ads:false};
const advance=(player,seconds,fps=60)=>{for(let frame=0;frame<Math.round(seconds*fps);frame++)player.update(1/fps,controls);};

test('capture waits for scheduled troops and recovery from incoming fire',()=>{
  assert(captureThreat([],target,{pending:5}));
  assert(captureThreat([],target,{hurtT:2.4}));
  assert.equal(captureThreat([],target,{pending:0,hurtT:2.5}),false);
});
test('sector defenders and visible firing lanes contest capture without a global kill requirement',()=>{
  assert(captureThreat([enemy(14,0)],target));
  assert(captureThreat([enemy(23,0)],target,{visible:()=>true}));
  assert.equal(captureThreat([enemy(23,0)],target,{visible:()=>false}),false);
  assert.equal(captureThreat([enemy(40,0)],target,{visible:()=>true}),false);
  assert.equal(captureThreat([enemy(5,0,8)],target,{visible:()=>false}),false);
  assert.equal(captureThreat([{...enemy(5,0),dead:true}],target),false);
});
test('resupply cannot complete through damage or nearby visible enemies, but cover is useful',()=>{
  const player={pos:target,hurtT:10,dead:false};
  assert(resupplyBlocked({...player,hurtT:1},[]));
  assert(resupplyBlocked(player,[enemy(10,0)],()=>true));
  assert.equal(resupplyBlocked(player,[enemy(10,0)],()=>false),false);
  assert.equal(resupplyBlocked(player,[enemy(20,0)],()=>true),false);
  assert(resupplyBlocked({...player,dead:true},[]));
});
test('field regrouping preserves injuries; stations restore bounded amounts and one grenade',()=>{
  const vitals={hp:25,shield:0,nades:0};
  assert.deepEqual(resupplyVitals(vitals,DIFFICULTIES.regular,true),{hp:35,shield:20,nades:1});
  assert.deepEqual(resupplyVitals(vitals,DIFFICULTIES.regular),{hp:70,shield:35,nades:1});
  assert.deepEqual(resupplyVitals(vitals,DIFFICULTIES.veteran),{hp:55,shield:20,nades:1});
  assert.deepEqual(resupplyVitals({hp:95,shield:55,nades:3},DIFFICULTIES.recruit),{hp:100,shield:60,nades:3});
});
test('classic series recovery stays unchanged and infantry profiles are per player',()=>{
  const classic=new Pilot(new Solid()),veteran=new Pilot(new Solid(),DIFFICULTIES.veteran);
  classic.damage(70);veteran.damage(70);
  advance(classic,5);advance(veteran,5);
  assert(classic.shield>20);assert.equal(veteran.shield,0);
  assert.equal(P.regen,4.2);assert.equal(P.shieldRate,30);
  classic.reset(new THREE.Vector3(),0);assert.equal(classic.recovery.shieldDelay,4.2);
  veteran.reset(new THREE.Vector3(),0);assert.equal(veteran.recovery.shieldDelay,8);
});
test('all three infantry shield profiles delay, recharge and bound health consistently across frame rates',()=>{
  for(const rules of Object.values(DIFFICULTIES))for(const fps of [30,60,120]){
    const player=new Pilot(new Solid(),rules);player.damage(150);
    advance(player,rules.shieldDelay-.2,fps);assert.equal(player.shield,0);
    advance(player,2.2,fps);
    assert(player.shield>rules.shieldRate*1.85&&player.shield<rules.shieldRate*2.1);
    advance(player,12,fps);assert.equal(player.shield,60);assert.equal(player.hp,rules.healthFloor);
    player.damage(200);const deadHp=player.hp;advance(player,20,fps);assert.equal(player.hp,deadHp);assert.equal(player.shield,0);
  }
});
test('a fresh hit restarts delayed recharge and changing difficulty does not change movement',()=>{
  const player=new Pilot(new Solid(),DIFFICULTIES.regular);player.damage(60);advance(player,7);
  assert(player.shield>0);player.damage(1);const shield=player.shield;advance(player,6);assert.equal(player.shield,shield);
  player.setRecovery(DIFFICULTIES.veteran);assert.equal(player.recovery.shieldDelay,8);
  const classic=new Pilot(new Solid());player.reset(new THREE.Vector3(),0);classic.reset(new THREE.Vector3(),0);
  for(let i=0;i<120;i++){player.update(1/60,{...controls,my:1,sprint:true});classic.update(1/60,{...controls,my:1,sprint:true});}
  assert(player.pos.equals(classic.pos));assert.equal(player.moveK,classic.moveK);
});
