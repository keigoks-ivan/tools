import test from 'node:test';
import assert from 'node:assert/strict';
import {World,defaultProject,generateMap} from './core.mjs';
import {commandWaypoints} from './command-feedback.mjs';

function setup(){const p=defaultProject();p.rules.ai='off';p.rules.fog=false;p.map=generateMap(64,7);p.map.tiles.fill('grass');return new World(p);}
test('queued move destinations remain visible in order after restoring a battle',()=>{
  let w=setup(),u=w.spawn('swordsman',0,{x:30,y:30});
  w.command([u.id],{type:'move',x:35,y:30});w.command([u.id],{type:'attackMove',x:35,y:35},true);w.command([u.id],{type:'move',x:30,y:35},true);
  const expected=commandWaypoints(w,u);assert.deepEqual(expected.map(p=>[p.x,p.y,p.queued,p.index]),[[35,30,false,0],[35,35,true,1],[30,35,true,2]]);
  const id=u.id;w=World.fromState(w.saveState());assert.deepEqual(commandWaypoints(w,w.entity(id)),expected);
});
test('work and escort indicators use the current live target position and omit lost targets',()=>{
  const w=setup(),u=w.units.find(u=>u.team===0&&u.blueprint.role==='worker'),site=w.addBuilding('house',0,30,30);
  w.command([u.id],{type:'build',target:site.id});assert.deepEqual(commandWaypoints(w,u).map(p=>[p.x,p.y]),[[site.x,site.y]]);
  site.hp=0;assert.deepEqual(commandWaypoints(w,u),[]);
  const escort=w.spawn('swordsman',0,{x:35,y:35});w.command([u.id],{type:'follow',target:escort.id});escort.x=40;
  assert.equal(commandWaypoints(w,u)[0].x,40);escort.garrison=999;assert.deepEqual(commandWaypoints(w,u),[]);
});
test('indicators respect visibility, player ownership, map boundaries and display limits',()=>{
  const w=setup(),u=w.spawn('swordsman',0,{x:30,y:30}),enemy=w.spawn('swordsman',1,{x:40,y:40});
  u.order={type:'follow',target:enemy.id};w.project.rules.fog=true;w.visible.fill(0);assert.deepEqual(commandWaypoints(w,u),[]);
  u.order={type:'move',x:64,y:64};assert.deepEqual(commandWaypoints(w,u),[]);
  u.order={type:'move',x:40,y:40};u.queued=Array.from({length:40},(_,i)=>({type:'move',x:i,y:20}));assert.equal(commandWaypoints(w,u).length,8);
  assert.deepEqual(commandWaypoints(w,enemy),[]);u.garrison=999;assert.deepEqual(commandWaypoints(w,u),[]);
});
