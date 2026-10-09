import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, generateMap, setTile, clone } from './core.mjs';
import { applyContextCommand, selectionAfterClick, readControlPreferences, applySelectionStance } from './player-interaction.mjs';
import { leftDragMode } from './interaction.mjs';

function setup() {
  const p=defaultProject();p.map=generateMap(128);p.map.tiles.fill('grass');Object.assign(p.rules,{ai:'off',fog:false,startAge:3});
  const w=new World(p);for(const u of w.units)u.stance='passive';return w;
}
function unit(w,id='swordsman',team=0,x=20,y=20) {const u=w.spawn(id,team,{x,y});assert.ok(u);u.stance='passive';return u;}
function building(w,type,x=35,y=25,team=0) {const site=w.nearestBuildingSite(type,{x,y});assert.ok(site);return w.addBuilding(type,team,site.x,site.y,true);}
function run(w,seconds) {for(let i=0;i<seconds*20;i++)w.tick(.05);}
const click=(w,units,p,options={})=>applyContextCommand(w,units,p,options);

test('unconfigured players box-select while an explicit drag-camera preference survives reload',()=>{
  assert.equal(readControlPreferences(null).leftDragPan,false);
  assert.equal(leftDragMode({mode:'play',enabled:readControlPreferences(null).leftDragPan}),'select');
  for(const leftDragPan of [true,false])assert.equal(readControlPreferences(JSON.stringify({leftDragPan})).leftDragPan,leftDragPan);
  for(const value of ['broken','null','{"leftDragPan":"true"}'])assert.equal(readControlPreferences(value).leftDragPan,false);
  const prefs=readControlPreferences('{"leftDragPan":true}');
  assert.equal(leftDragMode({mode:'play',enabled:prefs.leftDragPan}),'panPending');
  assert.equal(leftDragMode({mode:'play',enabled:prefs.leftDragPan,shift:true}),'select');
  assert.equal(leftDragMode({mode:'play',enabled:prefs.leftDragPan,hit:{kind:'unit'}}),'select');
});

test('Shift toggles single units and adds a selection box without deselecting existing units',()=>{
  const w=setup(),a=unit(w),b=unit(w,'archer',0,21,20),c=unit(w,'villager',0,22,20);
  let selection=selectionAfterClick(w,new Set(),[a.id]);
  selection=selectionAfterClick(w,selection,[b.id],{append:true});assert.deepEqual([...selection],[a.id,b.id]);
  selection=selectionAfterClick(w,selection,[a.id,c.id],{append:true,toggle:false});assert.deepEqual([...selection],[a.id,b.id,c.id]);
  selection=selectionAfterClick(w,selection,[b.id],{append:true});assert.deepEqual([...selection],[a.id,c.id]);
  assert.deepEqual([...selectionAfterClick(w,selection,[],{append:true})],[a.id,c.id]);
  assert.equal(selectionAfterClick(w,selection,[]).size,0);
});

test('enemy inspection and own group selection never become a mixed command selection',()=>{
  const w=setup(),own=unit(w),enemy=unit(w,'swordsman',1,25,20);
  const inspection=selectionAfterClick(w,new Set([own.id]),[enemy.id],{append:true});assert.deepEqual([...inspection],[enemy.id]);
  assert.deepEqual([...selectionAfterClick(w,inspection,[own.id],{append:true})],[own.id]);
  own.hp=0;assert.equal(selectionAfterClick(w,inspection,[own.id]).size,0);
  enemy.garrison=1;assert.equal(selectionAfterClick(w,inspection,[enemy.id]).size,0);
});

test('one resource click starts worker harvesting and moves mixed soldiers beside it',()=>{
  const w=setup(),worker=unit(w,'villager'),soldier=unit(w,'swordsman',0,21,20);setTile(w.map,30,20,'forest');
  const result=click(w,[worker,soldier],{x:30,y:20});assert.equal(result.sent,2);assert.deepEqual(result.errors,[]);
  assert.equal(worker.order.type,'gather');assert.equal(soldier.order.type,'move');assert.match(result.summary,/採集.*移動/);
  run(w,12);assert.ok(worker.carried>0||worker.order.type==='deliver');assert.ok(soldier.x>25);
});

test('right-clicking a foundation or damaged building assigns workers and moves the rest',()=>{
  for(const type of ['build','repair']) {
    const w=setup(),worker=unit(w,'villager'),soldier=unit(w),b=building(w,'house');
    if(type==='build')b.progress=.1;else b.hp-=100;
    const previous=b.progress===1?b.hp:b.progress,result=click(w,[worker,soldier],{x:b.x,y:b.y,target:b});
    assert.equal(result.sent,2);assert.equal(worker.order.type,type);assert.equal(soldier.order.type,'move');
    run(w,20);assert.ok(type==='build'?b.progress>previous:b.hp>previous);assert.ok(soldier.x>25);
  }
});

test('a farm click assigns one farmer and moves excess selected workers instead of doing nothing',()=>{
  const w=setup(),a=unit(w,'villager'),b=unit(w,'villager',0,21,20),farm=building(w,'farm');
  const result=click(w,[a,b],{x:farm.x,y:farm.y,target:farm});assert.equal(result.sent,2);
  assert.equal([a,b].filter(u=>u.order.type==='gather'&&u.order.target===farm.id).length,1);
  assert.equal([a,b].filter(u=>u.order.type==='move').length,1);
});

test('mixed attackers, monks and carts all receive valid contextual orders',()=>{
  const w=setup(),soldier=unit(w),monk=unit(w,'monk',0,20,21),cart=unit(w,'trade-cart',0,20,22),enemy=unit(w,'knight',1,28,20);
  const result=click(w,[soldier,monk,cart],{x:enemy.x,y:enemy.y,target:enemy});
  assert.equal(result.sent,3);assert.equal(soldier.order.type,'attack');assert.equal(monk.order.type,'convert');assert.equal(cart.order.type,'move');
  assert.match(result.errors[0],/商隊/);assert.equal(result.attack,true);
  run(w,8);assert.ok(enemy.hp<enemy.maxHp||enemy.team===0);
});

test('monks move to enemy buildings instead of inflicting healing-strength attack damage',()=>{
  const w=setup(),monk=unit(w,'monk'),enemy=building(w,'house',30,20,1);
  const result=click(w,[monk],{x:enemy.x,y:enemy.y,target:enemy});
  assert.equal(result.sent,1);assert.equal(monk.order.type,'move');run(w,10);assert.equal(enemy.hp,enemy.maxHp);
});

test('friendly unit context clicks heal with monks and move the other selected troops',()=>{
  const w=setup(),monk=unit(w,'monk'),soldier=unit(w,'swordsman',0,20,21),hurt=unit(w,'knight',0,27,20);hurt.hp-=40;
  const result=click(w,[monk,soldier],{x:hurt.x,y:hurt.y,target:hurt});assert.equal(result.sent,2);
  assert.equal(monk.order.type,'heal');assert.equal(soldier.order.type,'move');const hp=hurt.hp;run(w,10);assert.ok(hurt.hp>hp);
});

test('explicit repair targeting only changes compatible units and explains the rest',()=>{
  const w=setup(),worker=unit(w,'villager'),soldier=unit(w),b=building(w,'house');b.hp-=100;
  w.command([soldier.id],{type:'move',x:25,y:35});const old=clone(soldier.order);
  const result=click(w,[worker,soldier],{x:b.x,y:b.y,target:b},{mode:'repair'});
  assert.equal(result.sent,1);assert.equal(worker.order.type,'repair');assert.deepEqual(soldier.order,old);assert.match(result.errors[0],/部分單位/);
});

test('Shift resource commands preserve current work and append both mixed-unit jobs',()=>{
  const w=setup(),worker=unit(w,'villager'),soldier=unit(w);setTile(w.map,30,20,'forest');
  w.command([worker.id,soldier.id],{type:'move',x:25,y:20});const previous=[worker,soldier].map(u=>clone(u.order));
  const result=click(w,[worker,soldier],{x:30,y:20},{shift:true});assert.equal(result.sent,2);
  assert.deepEqual([worker,soldier].map(u=>u.order),previous);assert.equal(worker.queued[0].type,'gather');assert.equal(soldier.queued[0].type,'move');
});

test('a full movement queue is rejected with feedback instead of showing a successful marker',()=>{
  const w=setup(),soldier=unit(w);w.command([soldier.id],{type:'move',x:25,y:20});
  for(let i=0;i<40;i++)w.command([soldier.id],{type:'move',x:30,y:20},true);
  const result=click(w,[soldier],{x:40,y:20},{shift:true});assert.equal(result.sent,0);assert.match(result.errors[0],/佇列已滿/);
});

test('production buildings receive rally points while houses explain why they cannot',()=>{
  const w=setup(),town=w.buildings.find(b=>b.team===0&&b.type==='town'),house=building(w,'house'),soldier=unit(w);
  const mixed=click(w,[town,soldier],{x:40,y:30});assert.equal(mixed.sent,2);assert.equal(town.rally.type,'move');assert.equal(soldier.order.type,'move');
  const unsupported=click(w,[house],{x:40,y:30});assert.equal(unsupported.sent,0);assert.match(unsupported.errors[0],/生產建築/);assert.ok(house.rally==null);
});

test('attack move keeps merchants moving and force move clears combat intentions',()=>{
  const w=setup(),soldier=unit(w),cart=unit(w,'trade-cart',0,20,21),enemy=unit(w,'knight',1,35,20);
  const advancing=click(w,[soldier,cart],{x:40,y:30},{attackMove:true});assert.equal(advancing.sent,2);assert.equal(soldier.order.type,'attackMove');assert.equal(cart.order.type,'move');
  const moving=click(w,[soldier,cart],{x:enemy.x,y:enemy.y,target:enemy},{forceMove:true});assert.equal(moving.sent,2);assert.equal(soldier.order.type,'move');assert.equal(moving.attack,false);
});

test('changing stance clears the old automatic pursuit search and resumes the original movement',()=>{
  const w=setup(),soldier=unit(w),enemy=unit(w,'knight',1,30,20);
  w.command([soldier.id],{type:'attackMove',x:40,y:30});soldier.autoTarget=enemy.id;soldier.pathGoal={x:30,y:20,radius:1};
  w.routeSearches=new Map([[soldier.id,{step(){assert.fail('Old pursuit route survived a stance change');}}]]);
  applySelectionStance(w,[soldier],'passive');assert.equal(w.routeSearches.has(soldier.id),false);
  w.tick(.05);assert.equal(soldier.autoTarget,null);assert.equal(soldier.order.type,'attackMove');assert.ok(soldier.moving);
  assert.deepEqual(soldier.pathGoal,{x:40,y:30,radius:.2});
});
