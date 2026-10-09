import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, generateMap, validateProject } from './core.mjs';
import { actionReason, actionDescription, placementFeedback, productionStatus, selectionGroups, combatOrderHint, workerOrderHint, heroPlacementFeedback, mapBuildingPlacementFeedback, editorWallLine } from './ui-model.mjs';

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
  const p=defaultProject();p.rules.ai='off';p.rules.freePlayerPopulation=false;
  const w=new World(p),town=w.buildings.find(b=>b.team===0&&b.type==='town');
  assert.equal(w.train(town.id,'villager'),null);const q=town.queue[0];q.left=q.time/2;
  assert.equal(productionStatus(w,town,q).percent,50);
  while(w.population(0)<w.capacity(0))w.spawn('villager',0,{x:town.x+4,y:town.y+4});
  assert.match(productionStatus(w,town,q).label,/先蓋住宅/);
  town.research={id:'loom',left:2,time:25};assert.match(productionStatus(w,town,q).label,/等待研發/);
  assert.equal(productionStatus(w,town,town.research,true).blocked,false);
});
test('full starting population distinguishes the actual limit from the optional housing rule',()=>{
  const p=defaultProject();p.rules.ai='off';p.rules.population=50;
  const w=new World(p),town=w.buildings.find(b=>b.team===0&&b.type==='town');
  while(w.population(0)<50)w.spawn('villager',0,{x:town.x+4,y:town.y+4});
  assert.equal(w.capacity(0),50);assert.equal(w.train(town.id,'villager'),null);
  assert.equal(productionStatus(w,town,town.queue[0]).label,'已達人口上限');
});
test('worker feedback exposes load capacity and the work resumed after a manual deposit',()=>{
  const w=sandbox(),worker=w.units.find(u=>u.team===0&&u.blueprint.role==='worker'),town=w.buildings.find(b=>b.team===0&&b.type==='town'),tree=w.closestResource(worker,'wood');
  assert.equal(w.command([worker.id],{type:'gather',...tree}),null);
  worker.carried=12.6;worker.carrying='wood';worker.working='wood';
  const capacity=Math.round(10*w.modifiers(0).carry);
  assert.match(workerOrderHint(w,worker),new RegExp(`砍樹 · 搬運 12 / ${capacity} 木材 · 滿載後自動卸貨`));
  assert.equal(w.command([worker.id],{type:'deliver',target:town.id}),null);
  assert.match(combatOrderHint(w,worker),/卸貨後繼續砍樹/);
  assert.match(actionDescription(w,{id:'dropoff'}),/返回原本的採集、建造或修理/);
  worker.failed=true;assert.equal(combatOrderHint(w,worker),'無法到達目標');
});
test('the trade action explains missing markets and becomes usable when another realm completes one',()=>{
  const w=sandbox(),town=w.buildings.find(b=>b.team===0&&b.type==='town'),enemyTown=w.buildings.find(b=>b.team===1&&b.type==='town');
  assert.match(actionReason(w,{id:'start-trade'},[]),/我方市集/);
  const point=w.nearestBuildingSite('market',{x:town.x+7,y:town.y+5}),home=w.addBuilding('market',0,point.x,point.y,true);
  assert.match(actionReason(w,{id:'start-trade'},[]),/另一個勢力/);
  const targetPoint=w.nearestBuildingSite('market',{x:enemyTown.x+7,y:enemyTown.y+5}),target=w.addBuilding('market',1,targetPoint.x,targetPoint.y,true);
  const cart=w.spawn('trade-cart',0,w.buildingExit(home));
  assert.equal(actionReason(w,{id:'start-trade'},[cart]),'');
  assert.equal(w.startTrade(cart,target.id),null);assert.match(combatOrderHint(w,cart),/前往貿易市集/);
  cart.order.leg='return';cart.order.cargo=34;assert.match(combatOrderHint(w,cart),/運送 34 黃金/);
  assert.equal(w.isMilitary(cart),false);
});
test('selection type filters keep teams and buildings distinct and include every selected id',()=>{
  const w=sandbox(),entities=[...w.units,...w.buildings],groups=selectionGroups(entities);
  assert.equal(groups.reduce((n,g)=>n+g.ids.length,0),entities.length);
  const playerWorkers=groups.find(g=>g.key==='0:unit:villager');assert.equal(playerWorkers.ids.length,3);
  assert.ok(groups.some(g=>g.key==='1:unit:villager'));assert.ok(groups.some(g=>g.key==='0:building:town'));
});

test('attack feedback distinguishes pursuit from firing and identifies an automatically acquired enemy',()=>{
  const w=sandbox(),a=w.units.find(u=>u.team===0&&u.blueprint.role!=='worker'),t=w.units.find(u=>u.team===1);
  w.setFog(false);w.command([a.id],{type:'attack',target:t.id});assert.match(combatOrderHint(w,a),/前往攻擊 AI 1/);
  a.x=t.x-.5;a.y=t.y;assert.match(combatOrderHint(w,a),/攻擊中 AI 1/);
  w.command([a.id],null);a.autoTarget=t.id;assert.match(combatOrderHint(w,a),/攻擊中 AI 1/);
});
test('attack feedback does not disclose a target lost behind fog and preserves unreachable warnings',()=>{
  const w=sandbox(),a=w.units.find(u=>u.team===0),t=w.units.find(u=>u.team===1);w.command([a.id],{type:'attack',target:t.id});
  assert.equal(w.isVisible(t),false);assert.match(combatOrderHint(w,a),/敵方目標/);assert.doesNotMatch(combatOrderHint(w,a),/AI 1/);
  a.failed=true;assert.equal(combatOrderHint(w,a),'無法到達目標');
});
test('hero batch feedback reports partial capacity instead of silently placing only one',()=>{
  const p=defaultProject();p.rules.ai='off';p.rules.population=50;p.map.tiles.fill('grass');
  p.units.push({...structuredClone(p.units.find(u=>u.id==='scout')),id:'test-hero',name:'測試英雄',hero:true,building:'castle',age:0});
  const w=new World(p),town=w.buildings.find(b=>b.team===0&&b.type==='town');
  while(w.population(0)<49)w.spawn('villager',0,{x:town.x+5,y:town.y+5});
  const feedback=heroPlacementFeedback(w,'test-hero',{x:40,y:40},5);
  assert.equal(feedback.positions.length,2);assert.equal(feedback.valid,true);assert.match(feedback.reason,/可放 2 \/ 5 名/);
  assert.equal(new Set(feedback.positions.map(p=>`${p.x}:${p.y}`)).size,2);
});
test('free map building feedback ignores age and resources but rejects occupied footprints',()=>{
  const p=defaultProject();p.rules.ai='off';p.rules.startAge=0;p.map.tiles.fill('grass');
  const w=new World(p);w.stocks[0]={wood:0,food:0,gold:0,stone:0};
  const site=w.nearestBuildingSite('castle',{x:40,y:40}),point={x:Math.floor(site.x),y:Math.floor(site.y)};
  assert.equal(mapBuildingPlacementFeedback(w,'castle',point).valid,true);assert.ok(placementFeedback(w,'castle',point).reason);
  const building=w.addBuilding('castle',0,point.x,point.y,true);assert.ok(building);
  assert.equal(mapBuildingPlacementFeedback(w,'castle',point).valid,false);assert.deepEqual(w.stocks[0],{wood:0,food:0,gold:0,stone:0});
});
test('wall stroke interpolation covers rapid drags with connected cells in either direction',()=>{
  for(const end of [{x:18,y:4},{x:4,y:18},{x:-8,y:-5}]){
    const start={x:4,y:4},cells=editorWallLine(start,end);assert.deepEqual(cells[0],start);assert.deepEqual(cells.at(-1),end);
    assert.equal(cells.length,Math.max(Math.abs(end.x-start.x),Math.abs(end.y-start.y))+1);
    for(let i=1;i<cells.length;i++)assert.equal(Math.max(Math.abs(cells[i].x-cells[i-1].x),Math.abs(cells[i].y-cells[i-1].y)),1);
    assert.deepEqual(editorWallLine(end,start),cells.slice().reverse());
  }
});
