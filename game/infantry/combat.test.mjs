import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat, InfantryActor } from './combat.js';
import { Navigation } from './navigation.mjs';
import { Solid, SURFACES } from '../mech/zero/kit.js';
import { TacticalDirector, BATTLE_TACTICS, aiMultiplier } from './combat-tactics.mjs';
import { DIFFICULTIES, SCENARIOS } from './scenarios.mjs';
import { WEAPONS } from '../mech/zero/viewmodel.js';
import { Pilot, P } from '../mech/zero/player.js';
import { buildBattlefield } from './map.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function assertCapsuleClear(map,p){const moved=p.clone();map.solid.pushOut(moved,P.r,p.y,p.y+1.7,P.step);assert(p.distanceTo(moved)<1.1e-5,'infantry capsule penetrated physical cover');}
function world(boxes=[],bounds={x0:-24,x1:24,z0:-30,z1:30}) {
  const solid=new Solid();for(const b of boxes)solid.add({...b});const ground=()=>0;
  return {solid,bounds,ground,nav:new Navigation(solid,bounds,ground),cover:[]};
}
function fixture(map=world(),difficulty={damage:1}) {
  const player={pos:V(0,0,-22),vel:V(),eyeH:1.58,dead:false};const hurts=[],kills=[];
  const combat=new Combat({scene:new THREE.Scene(),map,player,kit:{},audio:{},onPlayerHurt:(...args)=>hurts.push(args),onKill:a=>kills.push(a),difficulty});
  return {combat,player,hurts,kills};
}
function actor(combat,p,id=1,type='line') {
  // Locomotion is tested separately from the already-shared captured animation system.
  const a={id,type,role:type,side:id%2?1:-1,pos:p.clone(),hp:100,hp0:100,dead:false,friendly:false,T:{run:4.6,walk:1.65,range:19,aim:99},guard:true,
    home:p.clone(),lastSeen:p.clone(),lastContact:-99,target:null,sees:false,senseT:0,goal:p.clone(),path:[],pathT:0,pathGoal:p.clone(),planT:0,aimT:0,ammo:24,burst:0,shotT:0,restT:0,suppression:0,stagger:0,phase:'advance',phaseT:1,cover:null,stuckT:0,progressPos:p.clone(),lastProgress:0,searchT:0,stepPhase:0,barT:0,contactRadioT:0,deathAge:0,
    laneBlocked:0,firePressure:0,lastShotTime:-99,flankGoal:null,flankUntil:0,flankContact:p.clone(),boundPhase:'move',boundT:.45,staggerReadyAt:0};
  a.s={pos:a.pos,vel:V(),yaw:Math.PI,aimYaw:Math.PI,aimPitch:0,mode:'patrol',crouchT:0,reloadT:-1,aimW:0,update:()=>{},headPos:out=>out.copy(a.pos).add(V(0,1.55,0)),chestPos:out=>out.copy(a.pos).add(V(0,1.2,0)),muzzle:out=>out.copy(a.pos).add(V(0,1.4,-.5))};
  a.hitTest=()=>null;a.damage=d=>{a.hp-=d;return a.hp<=0;};a.dispose=()=>{};return a;
}
function gunner(combat,p=V(0,0,-10),type='line',friendly=false,id=1){
  const a=actor(combat,p,id,type);a.guard=false;a.friendly=friendly;a.T={...a.T,aim:type==='sniper'?1.3:.55,burst:type==='sniper'?1:3,gap:type==='sniper'?1.4:.2,damage:type==='sniper'?34:7,speed:78,spread:type==='sniper'?.009:.04,mag:240};
  a.target=combat.player;a.sees=true;a.lastSeen.copy(combat.player.pos);a.lastContact=0;a.s.mode='aim';a.s.aimW=1;a.s.runW=0;a.ammo=240;
  a.s.update=dt=>{a.s.aimW=THREE.MathUtils.damp(a.s.aimW,a.s.mode==='aim'?1:0,7,dt);a.s.runW=THREE.MathUtils.damp(a.s.runW,a.s.mode==='run'?1:0,6,dt);if(a.s.reloadT>=0){a.s.reloadT+=dt;if(a.s.reloadT>1.6)a.s.reloadT=-1;}};
  return a;
}
function fixedRandom(value,fn){const old=Math.random;Math.random=()=>value;try{return fn();}finally{Math.random=old;}}
function firingSample(difficulty,{fps=60,type='line',friendly=false,seconds=10}={}){
  return fixedRandom(.5,()=>{
    const {combat}=fixture(world(),difficulty),a=gunner(combat,V(0,0,-10),type,friendly),shots=[];
    combat._bolt=(_p,dir,_speed,damage)=>shots.push({time:combat.time,dir:dir.clone(),damage});
    for(let i=0;i<seconds*fps;i++){combat.time+=1/fps;a.s.update(1/fps);combat._shootActor(a,1/fps);}
    combat.clear();return shots;
  });
}
test('last two attackers navigate around a long wall and guards advance without teleporting',()=>{
  const map=world([{x0:-14,x1:14,z0:-2,z1:2,y0:0,y1:4}]);const {combat,player}=fixture(map);
  combat.enemies=[actor(combat,V(-5,0,22),1),actor(combat,V(6,0,22),2,'sniper')];
  const dt=1/30,previous=combat.enemies.map(a=>a.pos.clone());
  for(let frame=0;frame<1800;frame++){
    combat.update(dt,{mode:'defend',target:{x:0,z:-25},cleanup:true});
    combat.enemies.forEach((a,i)=>{
      assert(a.pos.distanceTo(previous[i])<=4.6*dt+.00001,'cleanup movement exceeded walking/running speed');
      assertCapsuleClear(map,a.pos);
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
    combat.update(1/30,{squadCommand:command});assert(a.pos.distanceTo(previous)<4.6/30+.00001);assertCapsuleClear(map,a.pos);previous.copy(a.pos);
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
test('series impact classification preserves heavy armor, absolute head damage and captured reactions',()=>{
  const {combat,kills}=fixture(),impacts=[],flashes=[],deaths=[],sounds=[],beams=[],muzzles=[];
  combat.fx={impact:(...args)=>impacts.push(args),beam:(...args)=>beams.push(args),muzzle:(...args)=>muzzles.push(args)};
  combat.audio={hit:(...args)=>sounds.push(args)};
  const a=actor(combat,V(0,0,12),1,'heavy');a.combat=combat;a.T.armor=.72;a.hp=a.hp0=280;a.stagV=V();
  a.s.impact=(...args)=>flashes.push(['motion',...args]);a.s.flash=armor=>flashes.push(['flash',armor]);a.s.die=(...args)=>deaths.push(args);
  a.damage=InfantryActor.prototype.damage.bind(a);let part='chest';a.hitTest=(_o,_d,max)=>!a.dead&&max>12?{t:12,part}:null;combat.enemies=[a];
  const origin=V(0,1.6,0),dir=V(0,0,1),muzzle=V(.25,1.25,.9),feedback={weapon:'rifle',muzzle};
  let hit=combat.shoot(origin,dir,{dmg:40,head:100},feedback);
  assert.equal(a.hp,280-40*.72);assert.equal(hit.armored,true);assert.equal(hit.markerKind,'armor');assert.equal(hit.impactKind,'armor');
  assert.equal(a.lastHitKind,'armor');assert.equal(a.hitFlash,.15);assert.equal(a.stagger,.12);assert.equal(a.stagV.z,1);
  assert.deepEqual(flashes.at(-1),['flash',true]);assert.equal(impacts[0][2],'armor');assert.deepEqual(impacts[0][3],[2.4,2.8,3.4]);
  assert(beams[0][0].equals(muzzle));assert(beams[0][1].equals(hit.point));assert.equal(beams[0][2],'rifle');assert(muzzles[0][0].equals(muzzle));
  assert.equal(hit.audioHandled,true);assert.equal(sounds[0][1],'armor');assert(sounds[0][0].equals(V(0,1.6,3)));assert(origin.equals(V(0,1.6,0)));
  part='head';const before=a.hp;hit=combat.shoot(origin,dir,{dmg:40,head:100},feedback);
  assert.equal(a.hp,before-100);assert.equal(hit.armored,false);assert.equal(hit.markerKind,'head');assert.equal(hit.impactKind,'body');
  assert.equal(sounds.at(-1)[1],'head');assert.deepEqual(flashes.at(-1),['flash',false]);assert.equal(impacts.at(-1)[2],'body');assert.deepEqual(impacts.at(-1)[3],[4,2.4,.9]);
  hit=combat.shoot(origin,dir,{dmg:40,head:180},feedback);assert.equal(a.hp,0);assert.equal(hit.killed,true);assert.equal(hit.markerKind,'kill');assert.equal(deaths.length,1);assert.equal(deaths[0][2],'head');assert.equal(kills.length,1);
  combat.clear();
});
test('surface effects use the actual wall material and misses produce no hit feedback',()=>{
  const {combat}=fixture(world([{x0:-2,x1:2,z0:4,z1:5,y0:0,y1:4,mat:'corr'}])),impacts=[],sounds=[];
  combat.fx={impact:(...args)=>impacts.push(args)};combat.audio={hit:(...args)=>sounds.push(args)};
  const hit=combat.shoot(V(0,1.4,0),V(0,0,1),{range:40});assert.equal(hit.impactKind,'metal');assert.equal(hit.markerKind,null);assert.equal(hit.armored,false);
  assert.equal(impacts.length,1);assert.equal(impacts[0][2],'metal');assert(impacts[0][1].z<0);assert.equal(sounds[0][1],'metal');assert(sounds[0][0].equals(hit.point));
  const miss=combat.shoot(V(0,1.4,0),V(1,0,0),{range:10});assert.equal(miss.impactKind,null);assert.equal(miss.markerKind,null);assert.equal(miss.audioHandled,false);assert.equal(impacts.length,1);assert.equal(sounds.length,1);
  combat.clear();
});
test('hit recoil visibly moves in open space and cannot push a soldier through a nearby wall',()=>{
  const {combat}=fixture(world([{x0:-2,x1:2,z0:.8,z1:1.2,y0:0,y1:4}])),a=actor(combat,V(0,0,.3));a.stagger=.27;a.stagV=V(0,0,2.4);combat.enemies=[a];
  combat._move(a,.1);assert(a.pos.z>.3,'impact had no physical response');assert(a.pos.z<=.46,'impact crossed the collision margin');assert(a.stagV.z<2.4);
  a.pos.set(5,0,0);a.goal.copy(a.pos);a.stagV.set(0,0,2.4);a.s.vel.set(0,0,0);combat._move(a,.1);assert(Math.abs(a.pos.z-.24)<1e-10);assert(a.s.vel.length()<=2.4+.00001);
  combat.clear();
});
test('corpse fade owns only material clones and preserves shared soldier, rifle and texture resources',()=>{
  const shared=new THREE.MeshStandardMaterial({color:0x445566,opacity:.8}),texture=new THREE.Texture(),geometry=new THREE.BoxGeometry();shared.map=texture;
  const soldier=new THREE.Mesh(geometry,shared),weapon=new THREE.Mesh(geometry,shared),root=new THREE.Group();root.add(soldier,weapon);
  let sharedDisposed=0,textureDisposed=0,geometryDisposed=0,clonesDisposed=0,skeletonDisposed=0;
  shared.addEventListener('dispose',()=>sharedDisposed++);texture.addEventListener('dispose',()=>textureDisposed++);geometry.addEventListener('dispose',()=>geometryDisposed++);
  const a=Object.create(InfantryActor.prototype);a.dead=true;a.s={root,weapon,model:root,mixer:{stopAllAction:()=>{},uncacheRoot:()=>{}},meshes:[{skeleton:{dispose:()=>skeletonDisposed++}}]};
  a.fade(.5);assert.equal(a.fadeMaterials.size,1);assert.notEqual(soldier.material,shared);assert.equal(weapon.material,soldier.material);assert.equal(soldier.material.map,texture);assert.equal(soldier.material.opacity,.4);assert.equal(shared.opacity,.8);assert.equal(shared.transparent,false);
  soldier.material.addEventListener('dispose',()=>clonesDisposed++);a.fade(1);assert.equal(soldier.material.opacity,0);assert.equal(shared.opacity,.8);a.dispose();
  assert.equal(clonesDisposed,1);assert.equal(skeletonDisposed,1);assert.equal(sharedDisposed,0);assert.equal(textureDisposed,0);assert.equal(geometryDisposed,0);
  shared.dispose();texture.dispose();geometry.dispose();
});

test('difficulty changes enemy acquisition and sustained fire while allied output stays constant',()=>{
  const samples=Object.values(DIFFICULTIES).map(d=>firingSample(d));
  assert(samples[0][0].time>samples[1][0].time&&samples[1][0].time>samples[2][0].time,'aim reaction did not scale');
  assert(samples[0][0].time>=.55*DIFFICULTIES.recruit.reaction);assert(samples[2][0].time>=.35);
  assert(samples[1].length>=samples[0].length+3,'regular did not apply sustained pressure');
  assert(samples[2].length>=samples[1].length+3,'veteran did not shorten firing gaps');
  for(let i=0;i<samples.length;i++)assert.equal(samples[i][0].damage,7*Object.values(DIFFICULTIES)[i].damage,'damage was multiplied more than once');
  const allySamples=Object.values(DIFFICULTIES).map(d=>firingSample(d,{friendly:true}));
  assert.deepEqual(allySamples[0],allySamples[1]);assert.deepEqual(allySamples[1],allySamples[2]);assert.equal(allySamples[0][0].damage,7);
  const at30=firingSample(DIFFICULTIES.veteran,{fps:30}),at120=firingSample(DIFFICULTIES.veteran,{fps:120});
  assert(Math.abs(at30[0].time-at120[0].time)<1/30);assert(Math.abs(at30.length-at120.length)<=2,'fire cadence varied materially with frame rate');
});
test('sniper retains at least a full second of warning and a soldier cannot fire before its pose faces the target',()=>{
  const shots=firingSample(DIFFICULTIES.veteran,{type:'sniper',seconds:5});assert(shots.length>0);assert(shots[0].time>=1.05);
  const {combat}=fixture(world(),DIFFICULTIES.veteran),a=gunner(combat);a.s.aimYaw=Math.PI/2;
  for(let i=0;i<100;i++){combat.time+=.01;combat._shootActor(a,.01);}assert.equal(combat.bolts.length,0,'shot while visibly aiming sideways');
  a.s.aimYaw=Math.PI;a.s.aimW=.7;combat._shootActor(a,.01);assert.equal(combat.bolts.length,0,'shot before the rifle was raised');
  a.s.aimW=1;combat._shootActor(a,.01);assert.equal(combat.bolts.length,1);combat.clear();
});
test('veteran accuracy improves real projectile direction without overriding sprint or incoming-fire penalties',()=>{
  const directions=Object.values(DIFFICULTIES).map(d=>fixedRandom(1,()=>{
    const {combat}=fixture(world(),d),a=gunner(combat),from=a.s.muzzle(V()),base=combat._aimPoint(combat.player).sub(from).normalize();
    a.aimT=2;combat._shootActor(a,.01);const shot=combat.bolts[0];assert(shot);const error=1-shot.dir.dot(base);
    combat.clear();return error;
  }));
  assert(directions[0]>directions[1]&&directions[1]>directions[2]);
  const plain=fixedRandom(1,()=>{
    const {combat,player}=fixture(world(),DIFFICULTIES.veteran),a=gunner(combat),from=a.s.muzzle(V()),base=combat._aimPoint(player).sub(from).normalize();a.aimT=2;
    combat._shootActor(a,.01);const error=1-combat.bolts[0].dir.dot(base);combat.bolts.length=0;a.burst=0;a.shotT=a.restT=0;a.aimT=2;a.suppression=2;player.sprintK=1;
    combat._shootActor(a,.01);assert(1-combat.bolts[0].dir.dot(base)>error*2);combat.clear();return error;
  });assert(plain>0);
});
test('target switches restart the warning and enemies still refuse blocked sight or allied firing lanes',()=>{
  const {combat,player}=fixture(world(),DIFFICULTIES.veteran),a=gunner(combat,V(0,0,0)),mate=actor(combat,V(0,0,-10),2);
  a.target=mate;a.aimT=2;a.burst=3;combat.enemies=[a,mate];combat._sense(a);
  assert.equal(a.target,player);assert.equal(a.aimT,0);assert.equal(a.burst,0);
  a.planT=2;a.pathT=2;
  for(let i=0;i<25;i++){combat.time+=.01;combat._shootActor(a,.01);}assert.equal(combat.bolts.length,0);assert.equal(a.planT,0);assert.equal(a.pathT,0);
  combat._plan(a);assert.equal(a.intent,'relocate');assert(Math.abs(a.goal.x)>1,'blocked rifleman did not open another lane');
  const graph=combat._routes();assert.equal(graph.components[graph.nearest(a.goal)],graph.components[graph.nearest(a.pos,null,true)]);
  a.target=null;a.sees=false;a.lastContact=combat.time-8;assert.doesNotThrow(()=>combat._plan(a));assert.equal(a.intent,'search','contact expiry dropped into a missing target');combat.clear();
  const behindWall=fixture(world([{x0:-5,x1:5,z0:-5,z1:-4,y0:0,y1:4}]),DIFFICULTIES.veteran),b=gunner(behindWall.combat,V(0,0,0));b.aimT=2;
  behindWall.combat._shootActor(b,.1);assert.equal(behindWall.combat.bolts.length,0);behindWall.combat.clear();
});
test('rapid SMG hits retain every impact but cannot permanently reset aim or extend physical stagger',()=>{
  fixedRandom(.5,()=>{
    const {combat}=fixture(world(),DIFFICULTIES.regular),a=gunner(combat),impacts=[],staggerTimes=[],shots=[];a.combat=combat;a.hp=a.hp0=10000;a.stagV=V();a.cover={};
    a.s.impact=()=>impacts.push(combat.time);a.s.flash=()=>{};a.damage=InfantryActor.prototype.damage.bind(a);combat._bolt=()=>shots.push(combat.time);
    let nextHit=0,previousCooldown=0;
    for(let frame=0;frame<240;frame++){
      const dt=1/60;combat.time+=dt;a.stagger=Math.max(0,a.stagger-dt);a.phaseT-=dt;
      if(a.phase==='hide'&&a.phaseT<=0){a.phase='aim';a.phaseT=2;}
      if(combat.time>=nextHit){a.damage(WEAPONS.smg.dmg,V(0,0,1));nextHit+=WEAPONS.smg.rof;if(a.staggerReadyAt!==previousCooldown){staggerTimes.push(combat.time);previousCooldown=a.staggerReadyAt;}}
      a.s.update(dt);combat._shootActor(a,dt);
    }
    assert(impacts.length>=44,'lost repeated hit animation');assert(staggerTimes.length<=6);
    for(let i=1;i<staggerTimes.length;i++)assert(staggerTimes[i]-staggerTimes[i-1]>=.7-1e-9);
    assert(shots.length>0,'continuous SMG hits permanently disabled return fire');assert.equal(a.dead,false);combat.clear();
  });
});
test('advancing infantry alternates physical bounds and visible aiming bursts instead of running silently to its goal',()=>{
  fixedRandom(.5,()=>{
    const {combat}=fixture(world(),DIFFICULTIES.regular),a=gunner(combat,V(0,0,18),'line',false,3),shots=[],phases=new Set();combat.enemies=[a];
    combat._bolt=()=>shots.push({mode:a.s.mode,weight:a.s.aimW,speed:a.s.vel.length()});const start=a.pos.clone();
    for(let frame=0;frame<600;frame++){combat.update(1/60,{target:{x:0,z:-26}});phases.add(a.boundPhase);}
    assert(phases.has('move')&&phases.has('fire'));assert(a.pos.distanceTo(start)>5);assert(shots.length>=3,'advancing unit offered no suppressive fire');
    for(const shot of shots){assert.equal(shot.mode,'aim');assert(shot.weight>.84);assert(shot.speed<a.T.walk,'fired at running speed');}
    assert.equal(a.intent,'breakthrough');combat.clear();
  });
});
test('suppression comes from actual firing and permits a committed flank even during the suppress phase',()=>{
  fixedRandom(.5,()=>{
    const {combat,player}=fixture(world(),DIFFICULTIES.regular),support=gunner(combat,V(0,0,8),'support',false,4),flanker=gunner(combat,V(4,0,10),'flank',false,1);combat.enemies=[support,flanker];
    support.s.aimW=0;
    for(let i=0;i<180;i++){combat.time+=1/60;combat._shootActor(support,1/60);}assert.equal(support.firePressure,0,'unraised weapon counted as suppression');
    support.s.aimW=1;
    for(let i=0;i<180;i++){combat.time+=1/60;combat._shootActor(support,1/60);}assert(support.firePressure>1.4/DIFFICULTIES.regular.tacticalTempo);
    combat.director.update(combat.time,1,{sceneId:'city'});combat.tacticalPhase='suppress';combat._plan(flanker);assert.equal(flanker.intent,'flank');const committed=flanker.goal.clone();
    flanker.pos.add(V(.8,0,-.4));combat.time+=.5;combat._plan(flanker);assert(flanker.goal.equals(committed),'flank destination drifted every plan');
    flanker.pos.copy(committed);combat._plan(flanker);assert.equal(flanker.intent,'crossfire');assert.equal(flanker.phase,'aim');assert(flanker.goal.equals(committed));
    const graph=combat._routes();assert.equal(graph.components[graph.nearest(flanker.goal)],graph.components[graph.nearest(player.pos,null,true)]);combat.clear();
  });
});
test('breakthrough riflemen and flankers physically reach the defended objective while support covers from range',()=>{
  const map=world([{x0:-12,x1:12,z0:-2,z1:2,y0:0,y1:4}]),{combat}=fixture(map,DIFFICULTIES.veteran);
  const line=actor(combat,V(-5,0,18),3),flank=actor(combat,V(7,0,20),6,'flank'),support=actor(combat,V(12,0,22),4,'support');combat.enemies=[line,flank,support];
  const previous=combat.enemies.map(a=>a.pos.clone()),target={x:0,z:-25};
  for(let frame=0;frame<1800;frame++){
    combat.update(1/30,{mode:'defend',target,operation:{sceneId:'city'}});
    combat.enemies.forEach((a,i)=>{assert(a.pos.distanceTo(previous[i])<=a.T.run/30+.00001);assertCapsuleClear(map,a.pos);previous[i].copy(a.pos);});
  }
  for(const a of [line,flank]){assert.equal(a.intent,'breakthrough');assert(a.pos.distanceTo(V(0,0,-25))<4,'mobile infantry never threatened the evacuation point');assert(!a.dead);}
  assert(support.pos.distanceTo(V(0,0,-25))>10,'support abandoned its firing station');combat.clear();
});
test('assault riflemen and heavy guards remain anchored to their sector with contact and cleanup overrides the post',()=>{
  const {combat,player}=fixture(world(),DIFFICULTIES.veteran),anchor=V(0,0,-5),line=actor(combat,V(0,0,12),1),heavy=actor(combat,V(8,0,12),2,'heavy');combat.enemies=[line,heavy];
  for(const a of combat.enemies){a.guard=true;a.guardAnchor=anchor.clone();}
  for(let frame=0;frame<900;frame++)combat.update(1/30,{mode:'assault',target:anchor});
  player.pos.set(20,0,20);
  for(let frame=0;frame<900;frame++)combat.update(1/30,{mode:'assault',target:anchor});
  assert(line.pos.distanceTo(anchor)<=7.7);assert(heavy.pos.distanceTo(anchor)<=9.7);
  for(const a of combat.enemies){assert.equal(a.intent,'guard');a.target=null;a.sees=false;a.lastContact=-99;combat._plan(a);assert(a.goal.distanceTo(anchor)<=9);}
  combat.update(1/30,{mode:'assault',target:anchor,cleanup:true});
  for(const a of combat.enemies){assert.equal(a.guard,false);assert.equal(a.intent,'pressure');assert(a.goal.distanceTo(player.pos)<2);}
  for(let frame=0;frame<600;frame++)combat.update(1/30,{mode:'assault',target:anchor,cleanup:true});
  for(const a of combat.enemies)assert(a.pos.distanceTo(player.pos)<2);combat.clear();
});
test('veteran replans and tactical phases accelerate without deleting regroup or complete reload windows',()=>{
  const director=new TacticalDirector(),operation={sceneId:'pass'};director.update(0,1,operation,'pass',DIFFICULTIES.veteran.tacticalTempo);
  assert.equal(director.update(9/DIFFICULTIES.veteran.tacticalTempo+.001,1,operation,'pass',DIFFICULTIES.veteran.tacticalTempo).phase,'suppress');
  assert.equal(director.update(26/DIFFICULTIES.veteran.tacticalTempo+.001,1,operation,'pass',DIFFICULTIES.veteran.tacticalTempo).phase,'regroup');
  assert.equal(director.update(31/DIFFICULTIES.veteran.tacticalTempo+.001,1,operation,'pass',DIFFICULTIES.veteran.tacticalTempo).phase,'advance');
  for(const difficulty of Object.values(DIFFICULTIES)){
    const {combat}=fixture(world(),difficulty),a=gunner(combat,V(0,0,8));combat.enemies=[a];combat.update(1/60);assert(Math.abs(a.senseT-.192*difficulty.reaction)<1e-9);assert(Math.abs(a.planT-difficulty.planInterval)<1e-9);combat.clear();
  }
  fixedRandom(0,()=>{
    const {combat}=fixture(world(),DIFFICULTIES.veteran),a=gunner(combat);a.T.burst=1;a.aimT=2;combat._shootActor(a,.01);assert.equal(a.restT,.38);
    a.T.mag=3;a.ammo=1;a.shotT=a.restT=0;a.aimT=2;combat._shootActor(a,.01);assert.equal(a.s.reloadT,0);assert.equal(a.restT,1.75);const before=combat.bolts.length;
    for(let i=0;i<96;i++){a.s.update(1/60);combat._shootActor(a,1/60);}assert.equal(combat.bolts.length,before,'difficulty skipped the captured reload animation');combat.clear();
  });
  assert.equal(aiMultiplier({reaction:NaN},'reaction'),1);assert.equal(aiMultiplier(DIFFICULTIES.veteran,'accuracy',true),1);
});

for(const scenario of SCENARIOS)test(`${scenario.id}: real Pilot at supply-crate faces and rounded corners keeps enemy spawns connected`,()=>{
  const scene=new THREE.Scene(),materials=Object.fromEntries([...SURFACES,'rock','asphalt','grass'].map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})]));
  const map=buildBattlefield(scene,materials,scenario),player=new Pilot(map.solid),start=map.starts.defend;
  player.reset(V(start.x,start.y,start.z),0);
  const combat=new Combat({scene,map,player,kit:{},audio:{}}),graph=combat._routes(),startNode=graph.nearest(player.pos,null,true),component=graph.components[startNode];assert(component>=0);
  // The exact live-game route that crashed on first-wave spawn while holding E.
  for(const [seconds,mx,my] of [[2.2,0,-1],[1.1,1,0],[2.6,0,0]])for(let frame=0;frame<Math.round(seconds*60);frame++)player.update(1/60,{mx,my,lookX:0,lookY:0,jump:false,sprint:false,crouch:false,ads:false});
  const box=map.solid.list.find(b=>Math.abs((b.x0+b.x1)/2-map.supply.x)<.01&&Math.abs((b.z0+b.z1)/2-map.supply.z)<.01&&Math.abs(b.y1-b.y0-.9)<.01);assert(box);
  const assertSpawn=()=>{
    const moved=player.pos.clone();map.solid.pushOut(moved,P.r,player.pos.y,player.pos.y+player.eyeH+P.head,P.step);assert(player.pos.distanceTo(moved)<1e-7,'probe was not a legal Pilot position');
    const node=graph.nearest(player.pos,null,true);assert(node>=0,`lost player component at ${player.pos.toArray()}`);assert.equal(graph.components[node],component);
    for(const wanted of map.spawns){const spawn=combat._spawnPosition(wanted),index=graph.nearest(spawn,null,true);assert(index>=0);assert.equal(graph.components[index],component);assert(combat._clearSegment(spawn,spawn));assert(graph.route(spawn,map.nav.nodes[node]).length>0,'spawn cannot reach player-side anchor');}
  };
  assertSpawn();assert(Math.hypot(player.pos.x-map.supply.x,player.pos.z-map.supply.z)<2.3,'replayed route missed the supply interaction area');
  const x=(box.x0+box.x1)/2,z=(box.z0+box.z1)/2,d=P.r/Math.sqrt(2);
  const positions=[[box.x0-P.r,z],[box.x1+P.r,z],[x,box.z0-P.r],[x,box.z1+P.r]];
  for(const [xx,sx] of [[box.x0,-1],[box.x1,1]])for(const [zz,sz] of [[box.z0,-1],[box.z1,1]])positions.push([xx+sx*d,zz+sz*d]);
  for(const [px,pz] of positions){player.reset(V(px,map.ground(px,pz),pz),0);player.update(1/60,{mx:0,my:0,lookX:0,lookY:0,jump:false,sprint:false,crouch:false,ads:false});assertSpawn();}
  combat.clear();map.dispose();for(const material of Object.values(materials))material.dispose();
});
test('legal contact still cannot connect spawns across a sealed thin wall or admit an embedded player',()=>{
  const map=world([{x0:-.05,x1:.05,z0:-31,z1:31,y0:0,y1:4}]),{combat,player}=fixture(map);
  for(const side of [-1,1]){
    player.pos.set(side*(.05+P.r),0,-10);const before=player.pos.clone();map.solid.pushOut(before,P.r,0,P.stand+P.head,P.step);assert(player.pos.distanceTo(before)<1e-9);
    const spawn=combat._spawnPosition({x:-side*15,z:20});assert(Math.sign(spawn.x)===side,'touch epsilon jumped into the opposite component');
    assert.equal(combat._clearSegment(player.pos,V(-player.pos.x,0,-10)),false,'swept circle passed through a thin wall');
    const penetrated=player.pos.clone().add(V(-side*.001,0,0));assert.equal(combat._clearSegment(penetrated,penetrated),false,'tolerance admitted actual penetration');
  }
  player.pos.set(0,0,-10);assert.throws(()=>combat._spawnPosition({x:15,z:20}),/no accessible infantry spawn/,'invalid player positions must not choose an arbitrary island');combat.clear();
});
