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
