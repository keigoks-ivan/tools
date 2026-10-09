import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat } from './combat.js';
import { Navigation } from './navigation.mjs';
import { Solid } from '../mech/zero/kit.js';
import { TacticalDirector, BATTLE_TACTICS } from './combat-tactics.mjs';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function world(boxes=[],bounds={x0:-24,x1:24,z0:-30,z1:30}) {
  const solid=new Solid();for(const b of boxes)solid.add({...b});const ground=()=>0;
  return {solid,bounds,ground,nav:new Navigation(solid,bounds,ground),cover:[]};
}
function fixture(map=world()) {
  const player={pos:V(0,0,-22),vel:V(),eyeH:1.58,dead:false};const hurts=[],kills=[];
  const combat=new Combat({scene:new THREE.Scene(),map,player,kit:{},audio:{},onPlayerHurt:(...args)=>hurts.push(args),onKill:a=>kills.push(a),difficulty:{damage:1}});
  return {combat,player,hurts,kills};
}
function actor(combat,p,id=1,type='line') {
  // Locomotion is tested separately from the already-shared captured animation system.
  const a={id,type,role:type,side:id%2?1:-1,pos:p.clone(),hp:100,hp0:100,dead:false,friendly:false,T:{run:4.6,walk:1.65,range:19,aim:99},guard:true,
    home:p.clone(),lastSeen:p.clone(),lastContact:-99,target:null,sees:false,senseT:0,goal:p.clone(),path:[],pathT:0,pathGoal:p.clone(),planT:0,aimT:0,ammo:24,burst:0,shotT:0,restT:0,suppression:0,stagger:0,phase:'advance',phaseT:1,cover:null,stuckT:0,progressPos:p.clone(),lastProgress:0,searchT:0,stepPhase:0,barT:0,contactRadioT:0,deathAge:0};
  a.s={pos:a.pos,vel:V(),yaw:Math.PI,aimYaw:Math.PI,aimPitch:0,mode:'patrol',crouchT:0,reloadT:-1,aimW:0,update:()=>{},headPos:out=>out.copy(a.pos).add(V(0,1.55,0)),chestPos:out=>out.copy(a.pos).add(V(0,1.2,0)),muzzle:out=>out.copy(a.pos).add(V(0,1.4,-.5))};
  a.hitTest=()=>null;a.damage=d=>{a.hp-=d;return a.hp<=0;};a.dispose=()=>{};return a;
}
test('last two attackers navigate around a long wall and guards advance without teleporting',()=>{
  const map=world([{x0:-14,x1:14,z0:-2,z1:2,y0:0,y1:4}]);const {combat,player}=fixture(map);
  combat.enemies=[actor(combat,V(-5,0,22),1),actor(combat,V(6,0,22),2,'sniper')];
  const dt=1/30,previous=combat.enemies.map(a=>a.pos.clone());
  for(let frame=0;frame<1800;frame++){
    combat.update(dt,{mode:'defend',target:{x:0,z:-25},cleanup:true});
    combat.enemies.forEach((a,i)=>{
      assert(a.pos.distanceTo(previous[i])<=4.6*dt+.00001,'cleanup movement exceeded walking/running speed');
      assert(!(a.pos.x>-14.34&&a.pos.x<14.34&&a.pos.z>-2.34&&a.pos.z<2.34),'walked through the wall');
      assert(!a.dead);previous[i].copy(a.pos);
    });
  }
  for(const a of combat.enemies){assert.equal(a.guard,false);assert(a.pos.distanceTo(player.pos)<2,`attacker ${a.id} remained at ${a.pos.toArray()}`);}
  combat.clear();
});
test('spawn never selects the nearest disconnected island',()=>{
  const map=world([{x0:-1,x1:1,z0:-31,z1:31,y0:0,y1:4}]);const {combat,player}=fixture(map);player.pos.set(-12,0,-20);
  const spawn=combat._spawnPosition({x:15,z:20});assert(spawn.x<-1);assert(map.nav.route(spawn,player.pos).length>0);combat.clear();
});
test('player shots stop at walls before applying damage or reporting a kill',()=>{
  const {combat}=fixture(world([{x0:-2,x1:2,z0:4,z1:5,y0:0,y1:4}]));let damage=0;
  const e={dead:false,friendly:false,hitTest:(_o,_d,max)=>max>10?{t:10,part:'head'}:null,damage:()=>{damage++;return true;},dispose:()=>{}};combat.enemies.push(e);
  const hit=combat.shoot(V(0,1.4,0),V(0,0,1),{dmg:50,head:2,range:40});assert.equal(hit.actor,null);assert.equal(hit.t,4);assert.equal(damage,0);assert.equal(hit.killed,false);combat.clear();
});
test('Iron Dusk absolute head/limb damage and nearest friend blocker are respected',()=>{
  const {combat}=fixture();const damage=[];
  const target={dead:false,friendly:false,hitTest:(_o,_d,max)=>max>12?{t:12,part:'head'}:null,damage:d=>{damage.push(d);return false;},dispose:()=>{}};
  combat.enemies.push(target);let hit=combat.shoot(V(0,1.4,0),V(0,0,1),{dmg:40,head:100,limb:30,range:50});assert.equal(hit.actor,target);assert.equal(damage[0],100);
  const friend={dead:false,friendly:true,hitTest:(_o,_d,max)=>max>5?{t:5,part:'limb'}:null,damage:d=>{damage.push(d);return false;},dispose:()=>{}};combat.allies.push(friend);
  hit=combat.shoot(V(0,1.4,0),V(0,0,1),{dmg:40,head:100,limb:30,range:50});assert.equal(hit.actor,friend);assert.equal(damage.length,2);assert(Math.abs(damage[1]-3.6)<1e-10);combat.clear();
});
test('enemy bullets have flight time and cannot pass through a wall or their own squad',()=>{
  const {combat,hurts}=fixture(world([{x0:-2,x1:2,z0:-10,z1:-9,y0:0,y1:4}]));
  combat._bolt(V(0,1.2,10),V(0,0,-1),60,8,{friendly:false,pos:V(0,0,10)});
  assert.equal(hurts.length,0);combat._projectiles(.1);assert.equal(combat.bolts.length,1);assert.equal(hurts.length,0);
  for(let i=0;i<6;i++)combat._projectiles(.1);assert.equal(combat.bolts.length,0);assert.equal(hurts.length,0);combat.clear();
  const open=fixture(),shooter={friendly:false,pos:V(0,0,10)},mate={dead:false,friendly:false,hitTest:(_o,_d,max)=>max>2?{t:2,part:'chest'}:null,damage:()=>{throw new Error('friendly unit harmed');},dispose:()=>{}};
  open.combat.enemies.push(mate);open.combat._bolt(V(0,1.2,10),V(0,0,-1),60,8,shooter);open.combat._projectiles(.1);assert.equal(open.combat.bolts.length,0);assert.equal(open.hurts.length,0);open.combat.clear();
});
test('grenade blast respects occlusion and scales friendly/player damage',()=>{
  const {combat,player,hurts}=fixture(world([{x0:-5,x1:5,z0:2,z1:3,y0:0,y1:4}]));const damage=[];
  const hidden=actor(combat,V(0,0,5)),exposed=actor(combat,V(2,0,-1),2),friend=actor(combat,V(-2,0,-1),3);friend.friendly=true;
  for(const a of [hidden,exposed,friend])a.damage=d=>damage.push([a.id,d]);combat.enemies=[hidden,exposed];combat.allies=[friend];player.pos.set(2,0,-1);
  combat.explode(V(0,.1,0),8);assert.equal(damage.some(([id])=>id===1),false);assert.equal(damage.length,2);assert(Math.abs(damage[1][1]/damage[0][1]-.3)<1e-10);assert.equal(hurts.length,1);assert(hurts[0][0]<75);combat.clear();
});
test('fourteen attackers and three squad members stay finite and inside physical bounds',()=>{
  const map=world([{x0:-13,x1:-5,z0:-3,z1:1,y0:0,y1:3},{x0:5,x1:13,z0:5,z1:9,y0:0,y1:3}]);const {combat}=fixture(map);
  combat.enemies=Array.from({length:14},(_,i)=>actor(combat,V(-19+(i%7)*6,0,18+Math.floor(i/7)*5),i+1));
  combat.allies=Array.from({length:3},(_,i)=>{const a=actor(combat,V((i-1)*3,0,-24),20+i);a.friendly=true;a.formationIndex=i;return a;});
  for(let frame=0;frame<900;frame++){
    combat.update(1/30,{target:{x:0,z:-25}});
    for(const a of [...combat.enemies,...combat.allies]){
      assert(a.pos.toArray().every(Number.isFinite));assert(a.s.vel.toArray().every(Number.isFinite));
      assert(a.pos.x>map.bounds.x0&&a.pos.x<map.bounds.x1&&a.pos.z>map.bounds.z0&&a.pos.z<map.bounds.z1);
    }
  }
  assert(combat.enemies.some(a=>a.pos.z<0),'squad never advanced past the obstruction');combat.clear();
});
test('enemy must finish raising the weapon and telegraphing aim before a projectile exists',()=>{
  const {combat,player}=fixture(),a=actor(combat,V(0,0,-12));a.target=player;a.sees=true;a.T={...a.T,aim:.55,burst:3,gap:.2,damage:7,speed:78,spread:.04,mag:24};a.s.mode='aim';a.s.aimW=1;
  for(let i=0;i<5;i++)combat._shootActor(a,.1);assert.equal(combat.bolts.length,0);
  combat._shootActor(a,.1);assert.equal(combat.bolts.length,1);combat.clear();
});
test('each wave cycles through readable advance, suppress, flank and regroup phases',()=>{
  const director=new TacticalDirector(),operation={sceneId:'pass',seed:19,variantId:'east-road'};
  const phases=[0,9,17,26,31].map(time=>director.update(time,1,operation).phase);
  assert.deepEqual(phases,['advance','suppress','flank','regroup','advance']);
  const side=director.side;director.update(34,2,operation);assert.equal(director.phase,'advance');assert.equal(director.epoch,34);assert.equal(director.side,-side);
  director.update(45,2,{...operation,sceneId:'underground'});assert.equal(director.profile,BATTLE_TACTICS.underground);assert.equal(director.phase,'advance');
  assert(BATTLE_TACTICS.airfield.flank>BATTLE_TACTICS.underground.flank*2);assert(BATTLE_TACTICS.dam.sniper>BATTLE_TACTICS.city.sniper);
});
test('physical routes reject thin wall shortcuts between otherwise free navigation nodes',()=>{
  const map=world([{x0:-12,x1:12,z0:.8,z1:1.2,y0:0,y1:4}]);const {combat}=fixture(map),from=V(0,0,10),goal=V(0,0,-10);
  const route=combat._routes().route(from,goal);assert(route.length>10);let previous=from;
  for(const p of route){assert(combat._clearSegment(previous,p),'graph edge crossed thin wall');previous=p;}
  assert(route.some(p=>Math.abs(p.x)>12));combat.clear();
});
test('scene-dependent flank plans split left and right while staying physically reachable',()=>{
  for(const sceneId of Object.keys(BATTLE_TACTICS)){
    const {combat,player}=fixture(),left=actor(combat,V(-2,0,8),2,'flank'),right=actor(combat,V(2,0,8),1,'flank');
    for(const a of [left,right]){a.guard=false;a.sees=true;a.target=player;a.lastSeen.copy(player.pos);a.lastContact=0;}
    combat.enemies=[left,right];combat.director.update(0,1,{sceneId});combat.director.phase=combat.tacticalPhase='flank';combat.director.progress=.6;combat._plan(left);combat._plan(right);
    assert.equal(left.intent,'flank');assert.equal(right.intent,'flank');assert(left.goal.x<0&&right.goal.x>0,sceneId);
    for(const a of [left,right]){const graph=combat._routes(),start=graph.nearest(a.pos,null,true),end=graph.nearest(a.goal);assert.equal(graph.components[start],graph.components[end]);}
    combat.clear();
  }
});
test('support holds a firing station, sniper relocates when its lane is blocked, heavy presses closer',()=>{
  const {combat,player}=fixture(),support=actor(combat,V(0,0,3),1,'support'),sniper=actor(combat,V(7,0,14),2,'sniper'),heavy=actor(combat,V(-6,0,8),3,'heavy');
  combat.enemies=[support,sniper,heavy];combat.director.update(0,1,{sceneId:'pass'});
  for(const a of combat.enemies){a.guard=false;a.sees=true;a.target=player;a.lastSeen.copy(player.pos);a.lastContact=0;a.stationContact=a.pos.clone();a.station=null;a.laneBlocked=0;combat._plan(a);}
  assert.equal(heavy.intent,'pressure');assert(heavy.goal.distanceTo(player.pos)<support.goal.distanceTo(player.pos));
  const stable=support.goal.clone();combat.time=3;combat._plan(support);assert(support.goal.equals(stable));
  sniper.stationUntil=999;sniper.laneBlocked=1;combat._plan(sniper);assert.equal(sniper.laneBlocked,0);assert.equal(sniper.stationUntil,12);
  combat.clear();
});
test('hold command keeps squad near saved cover while the player leaves',()=>{
  const {combat,player}=fixture(),anchor=V(0,0,-18);
  combat.allies=Array.from({length:3},(_,i)=>{const a=actor(combat,V((i-1)*3,0,-23),20+i);a.friendly=true;a.formationIndex=i;return a;});
  for(let frame=0;frame<300;frame++)combat.update(1/30,{squadCommand:{mode:'hold',target:anchor}});
  player.pos.set(18,0,20);
  for(let frame=0;frame<300;frame++)combat.update(1/30,{squadCommand:{mode:'hold',target:anchor}});
  assert.equal(combat.squadMode,'hold');for(const a of combat.allies)assert(a.pos.distanceTo(anchor)<6,'held soldier followed player away');combat.clear();
});
test('advance command leads the squad around an obstacle without teleporting',()=>{
  const map=world([{x0:-12,x1:12,z0:-2,z1:2,y0:0,y1:4}]);const {combat}=fixture(map),a=actor(combat,V(0,0,-24),20);a.friendly=true;a.formationIndex=1;combat.allies=[a];
  const command={mode:'advance',target:{x:0,z:20}},previous=a.pos.clone();
  for(let frame=0;frame<600;frame++){
    combat.update(1/30,{squadCommand:command});assert(a.pos.distanceTo(previous)<4.6/30+.00001);assert(!(a.pos.x>-12.34&&a.pos.x<12.34&&a.pos.z>-2.34&&a.pos.z<2.34));previous.copy(a.pos);
  }
  assert(a.pos.z>0,'advancing squad stalled behind obstacle');assert.equal(combat.squadMode,'advance');combat.clear();
});
test('a squad command aimed at a disconnected region resolves to the reachable side',()=>{
  const map=world([{x0:-1,x1:1,z0:-31,z1:31,y0:0,y1:4}]);const {combat,player}=fixture(map);player.pos.set(-12,0,-20);
  const a=actor(combat,V(-10,0,-22),20);a.friendly=true;a.formationIndex=1;combat.allies=[a];
  for(let frame=0;frame<300;frame++)combat.update(1/30,{squadCommand:{mode:'advance',target:{x:15,z:20}},operation:{sceneId:'city',seed:101},wave:2});
  assert(a.pos.x<-1.34);const graph=combat._routes();assert.equal(graph.components[graph.nearest(a.pos)],graph.components[graph.nearest(a.goal)]);combat.clear();
});
test('a full enemy roster rejects additional spawns without incrementing actor IDs',()=>{
  const {combat}=fixture();combat.enemies=Array.from({length:14},(_,i)=>actor(combat,V(i-7,0,15),i+1));
  const before=combat.nextId;assert.equal(combat.spawnEnemy({x:0,z:22}),null);assert.equal(combat.nextId,before);assert.equal(combat.enemies.length,14);combat.clear();
});
