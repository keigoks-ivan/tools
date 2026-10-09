import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, generateMap, validateProject } from './core.mjs';
import { actionReason, placementFeedback, productionStatus, selectionGroups } from './ui-model.mjs';

const sandbox=()=>{const p=defaultProject();p.rules.ai='off';return new World(p);};
test('new worlds use a compact rich map while saved custom sizes are retained',()=>{
  const p=defaultProject(); assert.equal(p.map.size,128);assert.equal(p.map.spawns.length,3);
  const w=new World(p);assert.deepEqual(w.deploymentErrors,[]);
  p.map=generateMap(512);p.map.name='自訂大地圖';const restored=validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(restored.map.size,512);assert.equal(restored.map.name,'自訂大地圖');assert.deepEqual(restored.map,p.map);
});
test('fog can switch during a battle without restarting or revealing unexplored terrain permanently',()=>{
  const w=sandbox(), enemy=w.units.find(u=>u.team===1), worker=w.units.find(u=>u.team===0), i=Math.round(enemy.y)*w.map.size+Math.round(enemy.x);
  w.tick(2);const explored=w.explored.slice(),stocks=structuredClone(w.stocks),units=w.units.map(u=>u.id),time=w.time;
  assert.equal(w.visible[i],0);assert.equal(w.explored[i],0);
  w.setFog(false);assert.equal(w.visible[i],1);assert.deepEqual(w.explored,explored);
  w.setFog(true);assert.equal(w.visible[i],0);assert.deepEqual(w.explored,explored);
  assert.equal(w.time,time);assert.deepEqual(w.stocks,stocks);assert.deepEqual(w.units.map(u=>u.id),units);assert.ok(w.isVisible(worker));
});
test('actual exploration continues with full vision and survives save/load then fog restoration',()=>{
  const w=sandbox(), scout=w.units.find(u=>u.team===0&&u.blueprint.role!=='worker'), far={x:64,y:64},i=far.y*w.map.size+far.x;
  assert.equal(w.explored[i],0);w.setFog(false);scout.x=far.x;scout.y=far.y;w.updateVision();assert.equal(w.explored[i],1);
  const saved=w.saveState(),restored=World.fromState(JSON.parse(JSON.stringify(saved)));
  assert.ok(saved.explored.length<2000);assert.equal(restored.project.rules.fog,false);assert.deepEqual(restored.explored,w.explored);
  restored.setFog(true);assert.equal(restored.explored[i],1);const enemy=restored.units.find(u=>u.team===1);assert.equal(restored.isVisible(enemy),false);
});
test('unavailable commands explain resources, prerequisites and limits across selected buildings',()=>{
  const w=sandbox(),town=w.buildings.find(b=>b.team===0&&b.type==='town');
  w.stocks[0].wood=10;assert.match(actionReason(w,{id:'build:house'},[]),/木材還差 15/);
  assert.match(actionReason(w,{id:'build:stable'},[]),/先完成兵營/);
  w.stocks[0].food=0;assert.match(actionReason(w,{id:'train:villager'},[town]),/食物還差 50/);
  w.stocks[0].food=2000;town.queue=Array.from({length:30},()=>({unitId:'villager'}));assert.match(actionReason(w,{id:'train:villager'},[town]),/佇列已滿/);
  const site=w.nearestBuildingSite('town',{x:town.x+10,y:town.y}),another=w.addBuilding('town',0,site.x,site.y,true);assert.equal(actionReason(w,{id:'train:villager'},[town,another]),'');
});
test('placement feedback rejects occupied footprints and becomes valid after prerequisites or resources arrive',()=>{
  const w=sandbox(),town=w.buildings.find(b=>b.team===0&&b.type==='town');
  assert.match(placementFeedback(w,'house',town).reason,/占地被擋住/);
  const site=w.nearestBuildingSite('house',{x:town.x+6,y:town.y+3});
  assert.equal(placementFeedback(w,'house',site).valid,true);w.stocks[0].wood=0;
  assert.equal(placementFeedback(w,'house',site).valid,false);
});
test('watch towers stay locked until Feudal in both the command panel and actual construction',()=>{
  const p=defaultProject();p.rules.ai='off';p.rules.startAge=0;const w=new World(p),worker=w.units.find(u=>u.team===0);
  const site=w.nearestBuildingSite('tower',{x:worker.x+6,y:worker.y+3}),stocks=structuredClone(w.stocks[0]);
  assert.match(actionReason(w,{id:'build:tower'},[]),/封建/);assert.match(w.build([worker.id],'tower',site.x,site.y),/時代/);
  assert.deepEqual(w.stocks[0],stocks);w.completeResearch(0,'feudal');
  assert.equal(actionReason(w,{id:'build:tower'},[]),'');assert.equal(w.build([worker.id],'tower',site.x,site.y),null);
});
test('production feedback allows queues at capacity and explains why progress waits',()=>{
  const w=sandbox(),town=w.buildings.find(b=>b.team===0&&b.type==='town');
  assert.equal(w.train(town.id,'villager'),null);const q=town.queue[0];q.left=q.time/2;
  assert.equal(productionStatus(w,town,q).percent,50);
  while(w.population(0)<w.capacity(0))w.spawn('villager',0,{x:town.x+4,y:town.y+4});
  assert.match(productionStatus(w,town,q).label,/先蓋住宅/);
  town.research={id:'loom',left:2,time:25};assert.match(productionStatus(w,town,q).label,/等待研發/);
  assert.equal(productionStatus(w,town,town.research,true).blocked,false);
});
test('selection type filters keep teams and buildings distinct and include every selected id',()=>{
  const w=sandbox(),entities=[...w.units,...w.buildings],groups=selectionGroups(entities);
  assert.equal(groups.reduce((n,g)=>n+g.ids.length,0),entities.length);
  const playerWorkers=groups.find(g=>g.key==='0:unit:villager');assert.equal(playerWorkers.ids.length,3);
  assert.ok(groups.some(g=>g.key==='1:unit:villager'));assert.ok(groups.some(g=>g.key==='0:building:town'));
});
