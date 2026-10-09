import test from 'node:test';
import assert from 'node:assert/strict';
import {World,defaultProject} from './core.mjs';

test('battle saves restore stocks, completed and unfinished buildings, orders and training',()=>{
 const p=defaultProject();p.rules.ai='off';p.map.template='grass';p.map.patches={};const w=new World(p);
 const worker=w.units.find(u=>u.team===0&&u.blueprint.role==='worker'),town=w.buildings.find(b=>b.team===0&&b.type==='town');
 w.train(town.id,'villager');w.build([worker.id],'house',worker.x+5,worker.y+3);
 for(let i=0;i<15;i++)w.tick(.1);
 const saved=JSON.parse(JSON.stringify(w.saveState())),restored=World.fromState(saved);
 assert.deepEqual(restored.stocks,w.stocks);assert.deepEqual(restored.units,w.units);assert.deepEqual(restored.buildings,w.buildings);assert.equal(restored.time,w.time);assert.equal(restored.nextId,w.nextId);
 const house=restored.buildings.find(b=>b.type==='house');assert.ok(restored.blocked(house.x,house.y));assert.equal(restored.entity(worker.id),restored.units.find(u=>u.id===worker.id));
 for(let i=0;i<500&&house.progress<1;i++)restored.tick(.1);
 assert.equal(house.progress,1);assert.ok(restored.units.filter(u=>u.team===0).length>4);
});
test('battle saves preserve harvested amounts and exploration without allocating a full JSON grid',()=>{
 const p=defaultProject();p.rules.ai='off';const w=new World(p);const point=w.closestResource(w.units.find(u=>u.team===0),'wood'),i=point.y*w.map.size+point.x;
 w.amounts[i]=123;const saved=w.saveState(),restored=World.fromState(saved);
 assert.equal(restored.amountAt(point.x,point.y),123);assert.ok(saved.explored.length<1000);assert.deepEqual(restored.explored,w.explored);
});
test('a damaged or duplicate-entity battle save cannot be loaded',()=>{
 assert.throws(()=>World.fromState(null));const saved=new World(defaultProject()).saveState();saved.units.push(saved.units[0]);assert.throws(()=>World.fromState(saved),/單位/);
});
test('loading an old battle preserves depleted stocks instead of granting the new starting amounts',()=>{
 const p=defaultProject();p.rules.ai='off';p.rules.population=500;delete p.rules.playerPopulationVersion;const w=new World(p);
 w.stocks[0]={wood:7,food:13,gold:0,stone:29};for(let team=1;team<w.teams;team++)w.stocks[team]={wood:2,food:3,gold:5,stone:8};
 const saved=JSON.parse(JSON.stringify(w.saveState()));
 delete saved.project.rules.playerStartingResources;delete saved.project.rules.playerEconomyVersion;delete saved.project.rules.aiEconomyVersion;delete saved.project.rules.freePlayerPopulation;delete saved.project.rules.enemyPopulation;delete saved.tradeEarned;
 saved.project.rules.starting=2000;
 const restored=World.fromState(saved);
 assert.deepEqual(restored.stocks,w.stocks);assert.equal(restored.capacity(0),500);assert.equal(restored.project.rules.enemyPopulation,300);
 assert.deepEqual(restored.tradeEarned,Array(restored.teams).fill(0));
 restored.tick(.1);assert.deepEqual(restored.stocks,w.stocks);
});
test('an in-progress legacy battle keeps its existing 200-person enemy cap',()=>{
 const p=defaultProject();p.rules.ai='off';p.rules.enemyPopulation=200;delete p.rules.enemyPopulationVersion;
 const saved=new World(p).saveState(),restored=World.fromState(JSON.parse(JSON.stringify(saved)));
 assert.equal(restored.project.rules.enemyPopulation,200);assert.deepEqual(restored.stocks,saved.stocks);
});
test('battle saves preserve the chosen housing model, stocks and stalled production',()=>{
 for(const freePlayerPopulation of [true,false]){
  const p=defaultProject();Object.assign(p.rules,{ai:'off',freePlayerPopulation});const w=new World(p);
  const town=w.buildings.find(b=>b.team===0&&b.type==='town');
  while(w.population(0)<w.capacity(0))w.spawn('villager',0,{x:town.x+5,y:town.y+5});
  assert.equal(w.train(town.id,'villager'),null);w.tradeEarned[1]=321;w.stocks[0].gold=4;
  const restored=World.fromState(JSON.parse(JSON.stringify(w.saveState()))),restoredTown=restored.entity(town.id);
  assert.equal(restored.project.rules.freePlayerPopulation,freePlayerPopulation);
  assert.equal(restored.capacity(0),freePlayerPopulation?300:5);assert.deepEqual(restored.stocks,w.stocks);
  assert.equal(restored.tradeEarned[1],321);const left=restoredTown.queue[0].left;
  restored.tick(1);assert.equal(restoredTown.queue[0].left,left);assert.equal(restored.stocks[0].gold,4);
 }
});
