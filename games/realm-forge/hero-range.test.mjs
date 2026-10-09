import test from 'node:test';
import assert from 'node:assert/strict';
import { World,defaultProject,validateProject,generateMap } from './core.mjs';

function setup(range=100) {
  const p=defaultProject();p.rules.ai='off';p.rules.fog=false;p.map=generateMap(128,7);p.map.tiles.fill('grass');
  const hero={...structuredClone(p.units.find(u=>u.id==='archer')),id:'long-range-hero',hero:true,name:'遠射英雄',range,regen:0,upgrades:[],building:'castle'};
  p.units.push(hero);const w=new World(p);for(const u of w.units)u.stance='passive';return {p,w,u:w.units.find(u=>u.blueprint.id===hero.id)};
}
test('heroes accept 100-tile range while ordinary troops keep the 20-tile limit',()=>{
  const {p}=setup();assert.equal(validateProject(p).units.at(-1).range,100);
  p.units.at(-1).range=100.05;assert.throws(()=>validateProject(p),/range/);
  p.units.at(-1).range=21;p.units.at(-1).hero=false;assert.throws(()=>validateProject(p),/range/);
  p.units.at(-1).range=20;assert.equal(validateProject(p).units.at(-1).range,20);
});
test('a 100-range hero attacks a distant target without moving and retains that range after save/load',()=>{
  const {w,u}=setup();u.x=20;u.y=30;const target=w.spawn('villager',1,{x:60,y:30}),hp=target.hp;
  w.command([u.id],{type:'attack',target:target.id});w.tick(.1);
  assert.ok(target.hp<hp);assert.equal(u.x,20);assert.equal(u.y,30);assert.equal(u.path.length,0);
  const restored=World.fromState(w.saveState());assert.equal(restored.entity(u.id).blueprint.range,100);
});
test('a long-range hero acquires visible distant enemies but does not shoot hidden targets automatically',()=>{
  const {w,u}=setup();u.x=20;u.y=30;u.stance='aggressive';const target=w.spawn('villager',1,{x:60,y:30}),hp=target.hp;
  w.setFog(true);w.updateVision();w.tick(.1);assert.equal(target.hp,hp);assert.ok(!u.autoTarget);
  w.setFog(false);u.autoTimer=0;w.tick(.1);assert.equal(u.autoTarget,target.id);assert.ok(target.hp<hp);
});
