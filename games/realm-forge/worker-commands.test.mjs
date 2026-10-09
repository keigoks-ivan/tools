import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, generateMap, BUILDINGS, setTile } from './core.mjs';
import { actionReason } from './ui-model.mjs';
import { orderHint } from './controls.mjs';

function setup(grass = true) {
  const p=defaultProject();p.map=generateMap(128,7);p.rules.ai='off';
  if(grass){if(p.map.tiles)p.map.tiles.fill('grass');else{p.map.template='grass';p.map.patches={};}}
  const w=new World(p),worker=w.units.find(u=>u.team===0&&u.blueprint.role==='worker'),town=w.buildings.find(b=>b.team===0&&b.type==='town');
  return {w,worker,town};
}
function until(w,predicate,seconds=180){for(let i=0;i<seconds*10&&!predicate();i++)w.tick(.1);assert.ok(predicate(),`Condition not met in ${seconds} game seconds`);}

for(const [type,resource,dx,dy] of [['forest','wood',-8,0],['food','food',0,8],['gold','gold',8,0],['stone','stone',0,-8]]) {
  test(`clicking the center of a rich ${type} deposit harvests and deposits ${resource}`,()=>{
    const {w,worker}=setup(false),spawn=w.map.spawns[0],point={x:spawn.x+dx,y:spawn.y+dy},before=w.stocks[0][resource];
    assert.equal(w.tile(point.x,point.y),type);assert.equal(w.command([worker.id],{type:'gather',...point}),null);
    until(w,()=>w.stocks[0][resource]>before);
    assert.ok(worker.carrying===null||worker.carrying===resource);assert.equal(worker.failed,false);
  });
}
test('an old gather order aimed inside a resource cluster recovers without another click',()=>{
  const {w,worker}=setup(false),spawn=w.map.spawns[0],before=w.stocks[0].wood;
  worker.order={type:'gather',x:spawn.x-8,y:spawn.y};w.resetOrder(worker);
  until(w,()=>w.stocks[0].wood>before);
});
for (const restore of [false,true]) test(`exhausted wood resumes the same resource after delivery${restore?' and a saved-game restore':''}`,()=>{
  const initial=setup();let w=initial.w,worker=initial.worker;
  const start={x:Math.round(initial.town.x)+7,y:Math.round(initial.town.y)},wood={x:start.x+5,y:start.y},food={x:start.x-2,y:start.y+2};
  for(const [point,tile] of [[start,'forest'],[wood,'forest'],[food,'food']])setTile(w.map,point.x,point.y,tile);
  w.amounts[start.y*w.map.size+start.x]=.04;worker.x=start.x-1;worker.y=start.y;
  const before=w.stocks[0].wood;assert.equal(w.command([worker.id],{type:'gather',...start}),null);
  until(w,()=>worker.order?.type==='deliver'&&w.tile(start.x,start.y)==='grass',20);
  if(restore){const id=worker.id;w=World.fromState(w.saveState());worker=w.entity(id);}
  until(w,()=>worker.order?.type==='gather'&&worker.order.x===wood.x&&worker.order.y===wood.y,30);
  assert.ok(w.stocks[0].wood>before);assert.equal(worker.order.resource,'wood');
  until(w,()=>worker.carrying==='wood'&&worker.carried>0,30);assert.equal(w.tile(food.x,food.y),'food');
});
test('a newly trained villager keeps a wood rally assignment when its original tree was exhausted',()=>{
  const {w,town}=setup(),wood={x:Math.round(town.x)+8,y:Math.round(town.y)};
  setTile(w.map,wood.x,wood.y,'forest');setTile(w.map,Math.round(town.x)+5,Math.round(town.y)+2,'food');
  town.rally={type:'gather',x:wood.x-2,y:wood.y,resource:'wood'};
  const initialIds=new Set(w.units.map(u=>u.id));assert.equal(w.train(town.id,'villager'),null);
  until(w,()=>w.units.some(u=>u.team===0&&!initialIds.has(u.id)&&u.carrying==='wood'&&u.carried>0),90);
  const trained=w.units.find(u=>u.team===0&&!initialIds.has(u.id));assert.equal(trained.order.resource,'wood');
});
test('invalid worker targets explain the problem and preserve the previous command',()=>{
  const {w,worker}=setup(),scout=w.units.find(u=>u.team===0&&u.blueprint.id==='scout');
  const destination={x:worker.x+5,y:worker.y+3};w.command([worker.id],{type:'move',...destination});
  for(const type of ['garrison','repair','build','deliver','gather']) {
    assert.match(w.command([worker.id],{type,target:scout.id}),/建築|農田/);
    assert.equal(worker.order.type,'move');
  }
  until(w,()=>!worker.order);assert.ok(Math.hypot(worker.x-destination.x,worker.y-destination.y)<.25);
});
test('invalid targets restored from a save cannot crash the simulation or repair a unit',()=>{
  for(const type of ['garrison','repair','build','deliver','gather']) {
    const {w,worker}=setup(),scout=w.units.find(u=>u.team===0&&u.blueprint.id==='scout');
    scout.hp-=10;const hp=scout.hp;worker.order={type,target:scout.id};
    assert.doesNotThrow(()=>{for(let i=0;i<20;i++)w.tick(.1);});
    assert.equal(scout.hp,hp);assert.ok(w.time>1);
  }
});
test('repair waits visibly for wood and resumes as soon as wood arrives',()=>{
  const {w,worker,town}=setup();town.hp-=100;w.stocks[0].wood=0;
  assert.equal(w.command([worker.id],{type:'repair',target:town.id}),null);
  until(w,()=>worker.waitingResources);const hp=town.hp;
  assert.match(orderHint(worker),/木材不足/);w.tick(.1);assert.equal(town.hp,hp);
  w.stocks[0].wood=20;until(w,()=>town.hp===town.maxHp);
  assert.ok(w.stocks[0].wood<20);assert.equal(worker.waitingResources,false);
});
test('repairing a healthy building reports the reason and keeps the current task',()=>{
  const {w,worker,town}=setup();w.command([worker.id],{type:'move',x:worker.x+4,y:worker.y});
  assert.match(w.command([worker.id],{type:'repair',target:town.id}),/不需要修理/);assert.equal(worker.order.type,'move');
});
function fillTown(w,town,count=BUILDINGS.town.garrison) {
  for(let i=0;i<count;i++){const u=w.spawn('villager',0,town);u.garrison=town.id;town.garrisoned.push(u.id);}
}
test('shelter skips the nearest full town and unfinished buildings for a free reachable tower',()=>{
  const {w,worker,town}=setup();fillTown(w,town);
  const a=w.nearestBuildingSite('tower',{x:town.x+6,y:town.y}),unfinished=w.addBuilding('tower',0,a.x,a.y);
  const b=w.nearestBuildingSite('tower',{x:town.x+10,y:town.y}),tower=w.addBuilding('tower',0,b.x,b.y,true);
  assert.equal(w.seekShelter([worker.id]),null);assert.equal(worker.order.target,tower.id);
  until(w,()=>worker.garrison===tower.id);assert.equal(unfinished.garrisoned.length,0);
});
test('shelter reserves capacity for incoming and Shift queued villagers',()=>{
  const {w,worker,town}=setup();fillTown(w,town,BUILDINGS.town.garrison-1);
  const second=w.units.find(u=>u.team===0&&u.blueprint.role==='worker'&&u!==worker&&!u.garrison);
  w.command([worker.id],{type:'move',x:worker.x+2,y:worker.y});
  assert.equal(w.seekShelter([worker.id],true),null);assert.equal(worker.queued[0].target,town.id);
  assert.match(w.seekShelter([second.id]),/空位/);assert.equal(second.order,null);
  assert.match(actionReason(w,{id:'shelter'},[second]),/空位/);
  until(w,()=>worker.garrison===town.id);assert.equal(town.garrisoned.length,BUILDINGS.town.garrison);
});
test('shelter reports a full command queue rather than claiming that the order was sent',()=>{
  const {w,worker}=setup();w.command([worker.id],{type:'move',x:worker.x+2,y:worker.y});
  worker.queued=Array.from({length:40},()=>({type:'move',x:worker.x+3,y:worker.y}));
  assert.match(w.seekShelter([worker.id],true),/佇列已滿/);assert.equal(worker.queued.length,40);
});
test('empty loads and absent damaged buildings explain unavailable worker actions',()=>{
  const {w,worker,town}=setup();assert.match(actionReason(w,{id:'dropoff'},[worker]),/沒有攜帶資源/);
  assert.match(actionReason(w,{id:'repair'},[worker]),/沒有受損/);
  worker.carried=12;worker.carrying='gold';assert.equal(actionReason(w,{id:'dropoff'},[worker]),'');
  assert.equal(w.command([worker.id],{type:'deliver',target:town.id}),null);
  const before=w.stocks[0].gold;until(w,()=>worker.carried===0);assert.equal(w.stocks[0].gold,before+12);
});
