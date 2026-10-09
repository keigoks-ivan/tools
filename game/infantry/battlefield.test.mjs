import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Solid, SURFACES } from '../mech/zero/kit.js';
import { Pilot } from '../mech/zero/player.js';
import { buildBattlefield } from './map.js';
import { Navigation } from './navigation.mjs';
import { SCENARIOS, Mission, selection } from './scenarios.mjs';
const mats=()=>Object.fromEntries([...SURFACES,'rock','asphalt','grass'].map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})]));
for(const scenario of SCENARIOS)test(`${scenario.id}: every spawn, start and objective is clear and connected`,()=>{
  const scene=new THREE.Scene(),map=buildBattlefield(scene,mats(),scenario);
  for(const p of [...Object.values(map.starts),...map.spawns,...scenario.targets]){
    const pos=new THREE.Vector3(p.x,map.ground(p.x,p.z),p.z),copy=pos.clone();
    map.solid.pushOut(copy,.35,pos.y,pos.y+1.76,.48);assert(pos.distanceTo(copy)<.02,`${scenario.id} blocked point ${p.x},${p.z}`);
    const route=map.nav.route(map.starts.assault,pos);assert(route.length>0||pos.distanceTo(new THREE.Vector3(map.starts.assault.x,map.starts.assault.y,map.starts.assault.z))<3,`disconnected point ${p.x},${p.z}`);
    for(const node of route){const probe=new THREE.Vector3(node.x,node.y,node.z),moved=probe.clone();map.solid.pushOut(moved,.34,node.y,node.y+1.7,.48);assert(probe.distanceTo(moved)<.02,'navigation entered a collider');}
  }
  const player=new Pilot(map.solid),start=map.starts.assault;player.reset(new THREE.Vector3(start.x,start.y,start.z),0);
  for(let i=0;i<180;i++)player.update(1/60,{mx:0,my:1,lookX:0,lookY:0,jump:false,sprint:false,crouch:false,ads:false});
  assert(player.pos.z>start.z+10,'starting route must actually be walkable');assert(Number.isFinite(player.pos.y));map.dispose();assert.equal(scene.children.length,0);
});
test('navigation routes around a long wall and never invents a path between disconnected spaces',()=>{
  const solid=new Solid();solid.add({x0:-1,x1:1,y0:0,y1:4,z0:-8,z1:8});
  const nav=new Navigation(solid,{x0:-12,x1:12,z0:-12,z1:12},()=>0),route=nav.route({x:-8,z:0},{x:8,z:0});assert(route.length>10);assert(route.some(p=>Math.abs(p.z)>=10));
  const sealed=new Solid();sealed.add({x0:-1,x1:1,y0:0,y1:4,z0:-20,z1:20});assert.deepEqual(new Navigation(sealed,{x0:-12,x1:12,z0:-12,z1:12},()=>0).route({x:-8,z:0},{x:8,z:0}),[]);
});
test('mission options reject malformed saved values',()=>{assert.deepEqual(selection({scene:'__proto__',mode:'toString',difficulty:NaN}),{scene:'pass',mode:'defend',difficulty:'regular'});});
test('a thin wall between otherwise clear grid cells cannot create an imaginary route',()=>{
  const solid=new Solid();solid.add({x0:-1.05,x1:-.95,y0:0,y1:3,z0:-20,z1:20});
  const nav=new Navigation(solid,{x0:-8,x1:8,z0:-8,z1:8},()=>0);assert.deepEqual(nav.route({x:-6,z:0},{x:6,z:0}),[]);
});
test('defense needs all four waves cleared, including every scheduled reinforcement',()=>{
  const m=new Mission({mode:'defend'});for(let wave=1;wave<=4;wave++){
    while(m.phase==='prepare')m.update(.1);assert.equal(m.wave,wave);
    for(let i=0;i<300;i++)m.update(.1,{alive:0});assert.equal(m.status,'playing','pending enemies cannot count as cleared');
    while(m.pending)m.spawned();m.update(.1,{alive:1});assert.equal(m.status,'playing');m.update(.1,{alive:0});
  }assert.equal(m.status,'won');assert.deepEqual(m.update(.1,{dead:true}),[]);
});
test('capture requires proximity, a clear sector and holding E; death always fails immediately',()=>{
  const m=new Mission({mode:'assault',difficulty:'recruit'});for(let i=0;i<80;i++)m.update(.1,{near:true,interact:true,contested:true});assert.equal(m.capture,0);
  for(let i=0;i<80;i++)m.update(.1,{near:true,interact:false});assert.equal(m.capture,0);
  for(let stage=0;stage<3;stage++){const expected=stage+1;while(m.objective<expected)m.update(.1,{near:true,interact:true,contested:false});}assert.equal(m.status,'won');
  const lost=new Mission({mode:'assault'});assert.deepEqual(lost.update(.1,{near:true,interact:true,dead:true}),['lost']);assert.equal(lost.status,'lost');
});
