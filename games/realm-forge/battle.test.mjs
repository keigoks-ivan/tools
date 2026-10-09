import test from 'node:test';
import assert from 'node:assert/strict';
import {World, defaultProject, generateMap, setTile, findPath, BUILDINGS, clone} from './core.mjs';
import {setEnemyCount, upgradeDefaultUnits, preserveCustomStats} from './project-upgrades.mjs';
import {LEGACY_UNIT_STATS} from './balance.mjs';

function setup(age=4,size=64) {
  const p=defaultProject();p.map=generateMap(size);if(p.map.tiles)p.map.tiles.fill('grass');else{p.map.template='grass';p.map.patches={};}
  Object.assign(p.rules,{ai:'off',fog:false,startAge:age});const world=new World(p);
  for(const u of world.units)u.stance='passive';
  return world;
}
function until(w, condition, seconds=150) {for(let i=0;i<seconds*20&&!condition();i++)w.tick(.05);assert.ok(condition(),`Not reached after ${seconds}s`);}

test('one, two or three enemies deploy independently and remain allies after a save',()=>{
  for(const size of [64,128,1280])for(const count of [1,2,3]) {
    const p=defaultProject();p.map=generateMap(size);p.map=setEnemyCount(p,count);const w=new World(p);
    assert.equal(w.teams,count+1);assert.deepEqual(w.deploymentErrors,[]);
    for(let a=1;a<w.teams;a++)for(let b=1;b<w.teams;b++){assert.equal(w.isAlly(a,b),true);assert.equal(w.isEnemy(0,b),true);}
    assert.equal(World.fromState(w.saveState()).teams,count+1);
    const town=w.buildings.find(b=>b.team===0&&b.type==='town');
    if(size<=128)for(const t of w.buildings.filter(b=>b.team>0&&b.type==='town'))assert.ok(findPath(w.buildingExit(town),t,size,(x,y)=>w.blocked(x,y),1.6));
  }
});
test('changing enemy count preserves retained spawns and ordinary edited terrain',()=>{
  const p=defaultProject();p.map=generateMap(64);setTile(p.map,2,2,'gold');const original=clone(p.map.spawns);
  p.map=setEnemyCount(p,3);assert.deepEqual(p.map.spawns.slice(0,3),original);assert.equal(p.map.tiles[130],'gold');
  p.map=setEnemyCount(p,1);assert.equal(p.map.spawns.length,2);assert.deepEqual(p.map.spawns[0],original[0]);
});
test('enemy population is separate from the player and counts units in training',()=>{
  const w=setup();w.project.rules.population=500;w.project.rules.enemyPopulation=50;
  for(let team=0;team<w.teams;team++)for(let i=0;i<12;i++)w.addBuilding('house',team,3+i*4,3+team*6,true);
  assert.ok(w.capacity(0)>50);assert.equal(w.capacity(1),50);
  const town=w.buildings.find(b=>b.team===1&&b.type==='town');
  while(w.population(1)<50)w.spawn('villager',1,{x:20,y:20});
  assert.equal(w.train(town.id,'villager'),null);const left=town.queue[0].left;w.tick(1);assert.equal(town.queue[0].left,left);
});
test('a full villager without a drop site stops harvesting and resumes after one is built',()=>{
  const w=setup(0),u=w.units.find(u=>u.team===0),p={x:u.x+5,y:u.y};setTile(w.map,p.x,p.y,'forest');
  for(const b of w.buildings.filter(b=>b.team===0))b.hp=0;w.tick(.05);w.command([u.id],{type:'gather',...p});
  until(w,()=>u.carried>=9.999);const remaining=w.amountAt(p.x,p.y);for(let i=0;i<200;i++)w.tick(.05);
  assert.ok(u.carried<=10.001);assert.equal(w.amountAt(p.x,p.y),remaining);
  const site=w.nearestBuildingSite('lumber',{x:p.x+4,y:p.y+4});w.addBuilding('lumber',0,site.x,site.y,true);
  const stock=w.stocks[0].wood;until(w,()=>w.stocks[0].wood>stock);assert.equal(u.order?.type,'gather');
});
test('a destroyed drop site redirects the carried load and keeps the gathering order',()=>{
  const w=setup(),u=w.units.find(u=>u.team===0),old=w.buildings.find(b=>b.team===0);const p=w.nearestBuildingSite('lumber',{x:u.x+7,y:u.y+7});const next=w.addBuilding('lumber',0,p.x,p.y,true);
  const resource={x:u.x+5,y:u.y};setTile(w.map,resource.x,resource.y,'forest');u.carried=10;u.carrying='wood';
  w.command([u.id],{type:'deliver',target:old.id,resume:{type:'gather',...resource}});old.hp=0;w.tick(.05);
  assert.equal(u.order.target,next.id);const before=w.stocks[0].wood;until(w,()=>w.stocks[0].wood>before);assert.equal(u.order.type,'gather');
});
test('archers use pierce armor while melee units use melee armor against rams',()=>{
  const w=setup(2),ram=w.spawn('ram',1,{x:20,y:20}),archer=w.spawn('archer',0,{x:25,y:20}),militia=w.spawn('swordsman',0,{x:19,y:20});
  assert.equal(w.damage(archer,ram),1);assert.equal(w.damage(militia,ram),militia.blueprint.attack-ram.blueprint.armor);
});
test('blacksmith armor and weapon upgrades exclude siege engines, monks and villagers',()=>{
  const w=setup(0),ids=['villager','swordsman','archer','scout','ram','mangonel','monk'];const before=Object.fromEntries(ids.map(id=>[id,w.effectiveBlueprint(id,0)]));
  for(const t of ['melee-1','arrows-1','armor-1','archer-armor-1','cavalry-armor-1'])w.completeResearch(0,t);
  for(const id of ['ram','mangonel','monk','villager'])assert.deepEqual(w.effectiveBlueprint(id,0),before[id]);
  assert.equal(w.effectiveBlueprint('swordsman',0).armor,before.swordsman.armor+1);
  assert.equal(w.effectiveBlueprint('archer',0).pierceArmor,before.archer.pierceArmor+1);
});
test('siege splash includes friendly units and minimum range prevents firing at adjacent targets',()=>{
  const w=setup(2),m=w.spawn('mangonel',0,{x:20,y:20}),enemy=w.spawn('knight',1,{x:25,y:20}),ally=w.spawn('knight',0,{x:25,y:20.4});
  w.command([m.id],{type:'attack',target:enemy.id});w.tick(.05);assert.ok(enemy.hp<enemy.maxHp);assert.ok(ally.hp<ally.maxHp);
  const close=w.spawn('knight',1,{x:m.x+1,y:m.y});m.cooldown=0;m.stance='stand';w.command([m.id],{type:'attack',target:close.id});w.tick(.05);assert.equal(close.hp,close.maxHp);
});
test('trebuchets unpack before ground attacks and pack before moving',()=>{
  const w=setup(3),t=w.spawn('trebuchet',0,{x:20,y:20}),enemy=w.spawn('knight',1,{x:26,y:20});
  w.command([t.id],{type:'attackGround',x:26,y:20});w.tick(.05);assert.ok(t.packLeft>0);assert.equal(enemy.hp,enemy.maxHp);
  until(w,()=>enemy.hp<enemy.maxHp,10);assert.equal(t.packed,false);
  w.command([t.id],{type:'move',x:20,y:25});w.tick(.05);assert.equal(t.packed,true);assert.ok(t.packLeft>0);
});
test('changing a formation acts immediately and preserves queued destinations',()=>{
  const w=setup(),units=[0,1,2,3].map(i=>w.spawn('swordsman',0,{x:20+i,y:20})),ids=units.map(u=>u.id);
  w.moveFormation(ids,{x:35,y:30});w.moveFormation(ids,{x:45,y:40},'line',true);const queued=units.map(u=>clone(u.queued));
  w.reformFormation(ids,'spread');assert.deepEqual(units.map(u=>u.queued),queued);assert.ok(units.every(u=>u.formation==='spread'));
});
test('monks must recover faith after conversion',()=>{
  const w=setup(2),monk=w.spawn('monk',0,{x:20,y:20}),first=w.spawn('scout',1,{x:23,y:20}),second=w.spawn('scout',1,{x:24,y:20});
  w.command([monk.id],{type:'convert',target:first.id});until(w,()=>first.team===0,10);assert.equal(monk.faith,0);
  w.command([monk.id],{type:'convert',target:second.id});for(let i=0;i<200;i++)w.tick(.05);assert.equal(second.team,1);
});
test('AI continues fighting and trains survivors after its town center is destroyed',()=>{
  const w=setup(),town=w.buildings.find(b=>b.team===1),p=w.nearestBuildingSite('barracks',{x:town.x-8,y:town.y+8});const barracks=w.addBuilding('barracks',1,p.x,p.y,true);
  const soldier=w.units.find(u=>u.team===1&&u.blueprint.role!=='worker');town.hp=0;w.time=200;w.tick(.05);w.project.rules.ai='normal';w.updateAI(1);
  assert.equal(soldier.order?.type,'attack');assert.ok(barracks.queue.length);assert.ok(w.entity(soldier.order.target));
});
test('AI changes its target after destroying the player town center',()=>{
  const w=setup();const town=w.buildings.find(b=>b.team===0),soldier=w.units.find(u=>u.team===1&&u.blueprint.role!=='worker');town.hp=0;w.time=200;w.tick(.05);w.project.rules.ai='normal';w.updateAI(1);
  assert.equal(soldier.order?.type,'attack');assert.notEqual(soldier.order.target,town.id);assert.equal(w.entity(soldier.order.target).team,0);
});
test('cancelling a foundation refunds the unused cost once',()=>{
  const w=setup(),worker=w.units.find(u=>u.team===0);const site=w.nearestBuildingSite('house',{x:worker.x+5,y:worker.y+5});const before=w.stocks[0].wood;
  w.build([worker.id],'house',site.x,site.y);const b=w.buildings.at(-1);b.progress=.4;
  w.deleteEntity(b.id);assert.equal(w.stocks[0].wood,before-BUILDINGS.house.cost.wood*.4);w.deleteEntity(b.id);assert.equal(w.stocks[0].wood,before-BUILDINGS.house.cost.wood*.4);
});
test('stock blueprints update but edited hero and combat statistics survive migration',()=>{
  const p=defaultProject();for(const u of p.units)Object.assign(u,LEGACY_UNIT_STATS[u.id]);p.units.find(u=>u.id==='knight').attack=99;
  assert.equal(upgradeDefaultUnits(p),true);assert.equal(p.units.find(u=>u.id==='villager').hp,25);assert.equal(p.units.find(u=>u.id==='knight').attack,99);
});
test('long paths can detour outside the old local window without a large blocking search',()=>{
  const w=setup(0,256),u=w.units.find(u=>u.team===0);Object.assign(u,{x:100,y:100});
  for(let y=0;y<225;y++)setTile(w.map,128,y,'water');w.command([u.id],{type:'move',x:160,y:100});
  until(w,()=>!u.order,420);assert.ok(Math.hypot(u.x-160,u.y-100)<.25);assert.equal(w.routeSearches?.size,0);
});
test('four full kingdoms have connecting paths for several river seeds',()=>{
  for(const size of [64,128])for(const seed of [7,42,719]) {
    const p=defaultProject();p.map=setEnemyCount({...p,map:generateMap(size,seed)},3);p.rules.startingBase='full';p.rules.ai='off';const w=new World(p),town=w.buildings.find(b=>b.team===0&&b.type==='town');
    assert.deepEqual(w.deploymentErrors,[]);for(const t of w.buildings.filter(b=>b.type==='town'))assert.ok(findPath(w.buildingExit(town),t,size,(x,y)=>w.blocked(x,y),1.6));
  }
});
test('allied enemies cannot inflict a direct attack on each other',()=>{
  const w=setup(),a=w.spawn('knight',1,{x:20,y:20}),b=w.spawn('knight',2,{x:20.5,y:20});
  w.command([a.id],{type:'attack',target:b.id});w.tick(.05);assert.equal(b.hp,b.maxHp);assert.equal(a.order,null);
});
test('a packed trebuchet resists arrows and loses that protection once unpacked',()=>{
  const w=setup(3),t=w.spawn('trebuchet',1,{x:20,y:20}),a=w.spawn('archer',0,{x:25,y:20});
  assert.equal(w.damage(a,t,30),1);t.packed=false;assert.equal(w.damage(a,t,30),22);
});
test('town bell reserves garrison spaces and restores queued work',()=>{
  const w=setup(),town=w.buildings.find(b=>b.team===0),p=w.nearestBuildingSite('tower',{x:town.x+8,y:town.y+8});w.addBuilding('tower',0,p.x,p.y,true);
  for(let i=0;i<17;i++)w.spawn('villager',0,{x:town.x+3,y:town.y+3});
  const workers=w.units.filter(u=>u.team===0&&u.blueprint.role==='worker'),u=workers[0];
  w.command([u.id],{type:'move',x:20,y:40});w.command([u.id],{type:'move',x:25,y:40},true);const queued=clone(u.queued);
  w.townBell(0);assert.equal(workers.filter(u=>u.order?.target===town.id).length,15);assert.equal(workers.filter(u=>u.order?.type==='garrison').length,20);
  w.townBell(0);assert.deepEqual(u.queued,queued);assert.equal(u.order.type,'move');assert.equal(u.order.x,20);
});
test('editing stock troops keeps custom combat values after post-imperial research',()=>{
  const p=defaultProject(),original=p.units.find(u=>u.id==='knight');Object.assign(original,preserveCustomStats(original,{...clone(original),attack:99,hp:300,color:'#ffbb22'}));
  const w=new World(p);assert.equal(w.effectiveBlueprint('knight',0).attack,103);assert.equal(w.effectiveBlueprint('knight',0).hp,320);assert.equal(original.customColor,true);
});
test('advancing ages requires distinct completed buildings; a castle can unlock Imperial',()=>{
  const w=setup(0);assert.equal(w.ageRequirements(0,'feudal'),false);
  const add=type=>{const p=w.nearestBuildingSite(type,{x:20,y:30});return w.addBuilding(type,0,p.x,p.y,true);};
  add('lumber');add('lumber');assert.equal(w.ageRequirements(0,'feudal'),false);const mill=add('mill');mill.progress=.5;assert.equal(w.ageRequirements(0,'feudal'),false);mill.progress=1;assert.equal(w.ageRequirements(0,'feudal'),true);
  assert.equal(w.ageRequirements(0,'imperial'),false);add('castle');assert.equal(w.ageRequirements(0,'imperial'),true);
});
test('production uses the researched training time and refunds the price paid',()=>{
  const w=setup(),p=w.nearestBuildingSite('archery',{x:20,y:30}),b=w.addBuilding('archery',0,p.x,p.y,true),gold=w.stocks[0].gold;
  w.train(b.id,'archer');assert.equal(b.queue[0].time,w.effectiveBlueprint('archer',0).time);
  w.project.units.find(u=>u.id==='archer').gold=99;w.cancelTrain(b.id,0);assert.equal(w.stocks[0].gold,gold);
});
test('farms and military production buildings require their completed prerequisites',()=>{
  const w=setup(),u=w.units.find(u=>u.team===0);for(const type of ['farm','archery','stable','siege'])assert.equal(w.buildRequirements(0,type),false);
  for(const type of ['mill','barracks','blacksmith']) {const site=w.nearestBuildingSite(type,{x:25,y:35});w.addBuilding(type,0,site.x,site.y,true);}
  for(const type of ['farm','archery','stable','siege'])assert.equal(w.buildRequirements(0,type),true);
});
test('fast direct paths still avoid diagonal corners and stop at the edge of a building',()=>{
  const block=(x,y)=>x===2&&y===1||x===1&&y===2;
  const path=findPath({x:1,y:1},{x:3,y:3},20,block);
  assert.ok(path);assert.notDeepEqual(path[0],{x:2,y:2});
  const w=setup(),town=w.buildings.find(b=>b.team===0);const approach=findPath({x:town.x+8,y:town.y},town,w.map.size,(x,y)=>w.blocked(x,y),1.6);
  assert.ok(approach);for(const p of approach)assert.equal(w.blocked(p.x,p.y),false);
});

test('one attack command routes into actual range of a fractional moving target beside an obstacle',()=>{
  const w=setup(0),archer=w.spawn('archer',0,{x:16,y:20}),target=w.spawn('villager',1,{x:20,y:20});
  Object.assign(target,{x:20.4,y:20.4});setTile(w.map,17,20,'water');
  assert.equal(w.command([archer.id],{type:'attack',target:target.id}),null);
  until(w,()=>target.hp<target.maxHp,10);assert.ok(Math.hypot(archer.x-target.x,archer.y-target.y)<=archer.blueprint.range+.03);
});
test('repeating an attack preserves pursuit while a different enemy replaces the target',()=>{
  const w=setup(0),scout=w.spawn('scout',0,{x:16,y:20}),target=w.spawn('villager',1,{x:24,y:20}),next=w.spawn('villager',1,{x:24,y:22});
  w.command([scout.id],{type:'attack',target:target.id});w.tick(.1);assert.ok(scout.path.length);
  const path=scout.path,goal=scout.pathGoal;w.command([scout.id],{type:'move',x:30,y:30},true);
  w.command([scout.id],{type:'attack',target:target.id});assert.equal(scout.path,path);assert.equal(scout.pathGoal,goal);assert.equal(scout.queued.length,0);
  w.command([scout.id],{type:'attack',target:next.id});assert.equal(scout.order.target,next.id);assert.equal(scout.path.length,0);
  until(w,()=>next.hp<next.maxHp,15);
});
test('repeating a conversion target keeps progress instead of restarting the conversion',()=>{
  const w=setup(2),monk=w.spawn('monk',0,{x:16,y:20}),target=w.spawn('scout',1,{x:20,y:20});
  w.command([monk.id],{type:'convert',target:target.id});w.tick(2);const work=monk.work;assert.ok(work>0);
  w.command([monk.id],{type:'convert',target:target.id});assert.equal(monk.work,work);until(w,()=>target.team===0,10);
});
test('automatically fighting units are busy and become idle after their target disappears',()=>{
  const w=setup(0),scout=w.spawn('scout',0,{x:16,y:20}),target=w.spawn('villager',1,{x:16.5,y:20});
  scout.stance='aggressive';assert.equal(w.isIdle(scout),true);until(w,()=>scout.autoTarget===target.id,2);
  assert.equal(scout.autoTarget,target.id);assert.equal(w.isIdle(scout),false);
  target.hp=0;scout.stance='passive';w.tick(.1);assert.equal(w.isIdle(scout),true);
});
