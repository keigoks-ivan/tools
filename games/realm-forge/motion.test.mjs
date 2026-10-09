import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothPath, segmentClear, animationPose, facingDirection } from './motion.mjs';
import { World, defaultProject, generateMap, setTile, findPath } from './core.mjs';

const setup=()=>{const p=defaultProject();p.rules.ai='off';p.map=generateMap(128,7);return new World(p);};
const until=(w,condition,seconds=180)=>{for(let i=0;i<seconds*10&&!condition();i++)w.tick(.1);assert.ok(condition(),`not reached after ${seconds}s`);};
test('open paths compress stair steps while avoiding blocked diagonal corners',()=>{
  const start={x:1,y:1},path=[{x:2,y:1},{x:3,y:2},{x:4,y:2},{x:5,y:3}];
  assert.deepEqual(smoothPath(start,path,()=>false),[path.at(-1)]);
  const blocked=(x,y)=>x===2&&y===1;
  assert.equal(segmentClear(start,{x:2,y:2},blocked),false);
  const around=[{x:1,y:2},{x:2,y:3},{x:3,y:3}];
  let point=start;for(const next of smoothPath(start,around,blocked)){assert.ok(segmentClear(point,next,blocked));point=next;}
});
test('walking updates facing and animation by distance, and reverses without stale combat facing',()=>{
  const w=setup(),u=w.units.find(u=>u.team===0&&u.blueprint.id==='scout');u.x=45;u.y=75;u.facing={x:0,y:1};
  for(let y=69;y<80;y++)for(let x=39;x<56;x++)setTile(w.map,x,y,'grass');
  w.command([u.id],{type:'move',x:53,y:74});w.tick(.1);
  assert.equal(u.moving,true);assert.equal(facingDirection(u),0);assert.ok(u.moveDistance>0);
  const pose=animationPose(u);assert.equal(pose.state,'walk');assert.deepEqual(animationPose(u),pose);
  until(w,()=>!u.order,20);assert.ok(Math.hypot(u.x-53,u.y-74)<.25);
  w.command([u.id],{type:'move',x:43,y:74});w.tick(.1);assert.equal(facingDirection(u),2);
});
test('wood chopping advances through all four frames and performs repeated unload-and-resume cycles',()=>{
  const w=setup(),u=w.units.find(u=>u.team===0&&u.blueprint.role==='worker'),s=w.map.spawns[0],before=w.stocks[0].wood;
  w.command([u.id],{type:'gather',x:s.x-8,y:s.y});const frames=new Set();
  for(let i=0;i<2400;i++){w.tick(.1);if(u.working==='wood')frames.add(animationPose(u).frame);}
  assert.deepEqual([...frames].sort(),[0,1,2,3]);assert.ok(w.stocks[0].wood>=before+100);assert.equal(u.failed,false);
  assert.ok(['gather','deliver'].includes(u.order.type));
});
test('manual dropoff preserves the gather task and Shift queue even after a save restore',()=>{
  let w=setup(),u=w.units.find(u=>u.team===0&&u.blueprint.role==='worker'),town=w.buildings.find(b=>b.team===0&&b.type==='town'),s=w.map.spawns[0];
  w.command([u.id],{type:'gather',x:s.x-8,y:s.y});until(w,()=>u.carried>5);
  const gather=structuredClone(u.order),next={type:'move',x:town.x+6,y:town.y+5};w.command([u.id],next,true);
  const before=w.stocks[0].wood,carried=u.carried;assert.equal(w.command([u.id],{type:'deliver',target:town.id}),null);
  w.tick(.1);const path=structuredClone(u.path);w.command([u.id],{type:'deliver',target:town.id});assert.deepEqual(u.path,path);
  const id=u.id;w=World.fromState(w.saveState());u=w.entity(id);
  until(w,()=>u.order?.type==='gather'&&u.carried===0,30);
  assert.deepEqual(u.order,gather);assert.deepEqual(u.queued,[next]);assert.ok(w.stocks[0].wood>=before+carried);
  until(w,()=>u.carried>1,30);assert.equal(u.carrying,'wood');
});
test('manual delivery resumes an interrupted building job',()=>{
  const w=setup(),u=w.units.find(u=>u.team===0&&u.blueprint.role==='worker'),town=w.buildings.find(b=>b.team===0&&b.type==='town'),site=w.nearestBuildingSite('house',{x:town.x+7,y:town.y+5});
  w.build([u.id],'house',site.x,site.y);const foundation=w.entity(u.order.target);u.carried=6;u.carrying='wood';
  w.command([u.id],{type:'deliver',target:town.id});until(w,()=>foundation.progress===1,90);assert.equal(u.carried,0);
});
test('a newly built wall interrupts a compressed route without walking through it',()=>{
  const w=setup(),u=w.units.find(u=>u.team===0&&u.blueprint.id==='scout');
  for(let y=16;y<25;y++)for(let x=16;x<55;x++)setTile(w.map,x,y,'grass');u.x=20;u.y=20;
  w.command([u.id],{type:'move',x:50,y:20});w.tick(.05);w.addBuilding('wall',1,25,20,true);
  for(let i=0;i<400&&u.order;i++){w.tick(.05);assert.equal(w.blocked(u.x,u.y),false);}
  assert.equal(u.order,null);assert.ok(Math.hypot(u.x-50,u.y-20)<.25);
});
for(const size of [128,1280])test(`fractional move goals remain reachable on a ${size} map`,()=>{
  const p=defaultProject();p.map=generateMap(size,7);p.rules.ai='off';if(p.map.tiles)p.map.tiles.fill('grass');else{p.map.template='grass';p.map.patches={};}
  const w=new World(p),u=w.spawn('swordsman',0,{x:20,y:20}),goal={x:80.8,y:60.8};
  assert.ok(findPath(u,goal,size,(x,y)=>w.blocked(x,y),.2));w.command([u.id],{type:'move',...goal});
  until(w,()=>!u.order,100);assert.equal(u.failed,false);assert.ok(Math.hypot(u.x-goal.x,u.y-goal.y)<.23);
});
