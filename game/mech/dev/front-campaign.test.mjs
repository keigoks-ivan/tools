import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STAGES } from '../combat.js';
import { HillsideFront } from '../hillside-front.mjs';
import { HILL_LINES,HILL_EXIT,HILL_COVER } from '../hillside-layout.mjs';
import { buildHillside } from '../hillside-art.mjs';
import { BASE_OPS } from '../base-layout.mjs';
import { LandingFront } from '../landing-front.mjs';
import { buildLandingSite } from '../landing-art.mjs';
import { landingGround } from '../landing-layout.mjs';
import { World } from '../env.js';
import { BattleLine } from '../battle-line.mjs';

const pos=(x=0,z=0)=>new THREE.Vector3(x,0,z);
test('confirmed frontline hits push either team along the incoming shot; a miss has no reaction',()=>{
  const hits=[],C={player:{pos:pos()},world:{raycast:()=>-1},fx:{impact(){}},
    damageEnemy(entity,damage,stagger,point,travel){hits.push(travel.clone());}};
  const front=new BattleLine(C,{}),target={active:true,entity:{},pos:pos(),ap:2000,
    mech:{impact(power,travel){hits.push(travel.clone());}}};
  const end=pos();end.y=11;
  for(const [friendly,source] of [[true,-40],[false,40],[false,40]]){
    const from=end.clone();from.x=source;
    front.shots.push({t:0,from,end:end.clone(),target,damage:330,actor:{friendly,hits:0}});
    if(hits.length===2)target.pos.z=20;
    front.impacts(1/60);
  }
  assert.deepEqual(hits.map(v=>v.x),[1,-1]);assert.equal(target.ap,1670);
});

test('frontline mechs brake into a reversal on the first tick of a new waypoint',()=>{
  const front=new BattleLine({player:{pos:pos()},world:{height:()=>0,collide:()=>false}},{});
  for(const kind of ['ally','grunt','heavy']){
    const actor={kind,entity:{},pos:pos(),vel:pos(12),goal:pos(),route:[pos(-50)],weapon:{speed:12},
      face:0,pose:{vel:pos()},mech:{animate(){}},friendly:kind==='ally'};
    front.move(actor,1/60);assert(actor.vel.x<10 && actor.pose.vel.x===actor.vel.x);
    for(let i=0;i<5;i++)front.move(actor,1/60);
    assert(actor.vel.x<0);
    for(let i=0;i<30;i++)front.move(actor,1/60);
    assert(actor.vel.x >= -12 && actor.vel.x < -10);
  }
});

test('enemies approach in echelons, break through in person, and must reach an exposed convoy to damage it',()=>{
  const convoy=pos(-577,10),signals=[],site={convoyPosition:convoy,signal(...args){signals.push(args);},advance(){}};
  let blocked=false,ended=null;
  const C={world:{height:()=>0,raycast:()=>blocked?.4:-1,hillsideSite:site},events:[],player:{pos:pos(-560,10)},
    note(){},say(){},lines(){},onEnd:win=>{ended=win;}};
  const f=new HillsideFront(C,{sec:0});f.tanks=[{},{}];f.wing={};f.integrity=3;
  const orders=[];f.order=(a,goal)=>{a.goal=pos(...goal);orders.push(goal);};
  f.startLine(0);
  const queue=f.reinforcements.pending;
  assert.equal(f.foes.length,0);assert.equal(queue.length,6);
  for(const {def} of queue)assert(def.x>f.posts[def.post].x+180);
  f.pressure();assert.equal(f.echelon,0);
  const make=(x,z)=>({active:true,post:0,pos:pos(x,z),entity:{},weapon:{speed:19},marchSpeed:19,goal:pos(-406,68)});
  const foe=make(-300,68);f.foes=[foe];f.react(foe);assert(!foe.through);
  const march=foe.weapon.speed;foe.entity.stagT=1;f.react(foe);assert(foe.weapon.speed<march*.3);foe.entity.stagT=0;
  foe.pos.set(-410,0,68);f.react(foe);assert(foe.through);assert.equal(f.integrity,3);
  assert(f.waypoints.some(p=>p.name==='攔截'));assert(orders.at(-1)[0]===convoy.x);
  foe.pos.copy(convoy);blocked=true;f.react(foe);assert.equal(f.integrity,3);
  blocked=false;f.react(foe);f.react(foe);assert.equal(f.integrity,2);
  f.pressure();assert.equal(f.posts[0].breached,false);
  for(let i=0;i<2;i++){const a=make(-406,68);f.react(a);a.pos.copy(convoy);f.react(a);}
  assert.equal(f.phase,'lost');assert.equal(C.events.length,1);C.events[0].fn();assert.equal(ended,false);
});

test('each secured sector opens the next escort leg, saves remaining integrity, and the last opens the exit',()=>{
  let advanced,checkpoint;
  const site={signal(){},advance:n=>{advanced=n;},reset(){},update(){}};
  const C={world:{height:()=>0,hillsideSite:site},events:[],player:{pos:pos()},cp:{sec:2,integrity:2},say(){},lines(){},note(){}};
  const f=new HillsideFront(C,{sec:2});f.unit=()=>({});f.order=()=>{};f.begin();
  assert.equal(f.integrity,2);assert.equal(f.phase,'deploy');assert.equal(f.reinforcements.pending.length,0);
  f.resupply=()=>{};f.setCheckpoint=(sec,x,z,yaw,extra)=>{checkpoint={sec,...extra};};
  f.stepBattle=()=>true;
  for(let sec=2;sec<HILL_LINES.length;sec++){
    C.player.pos.copy(pos(...HILL_LINES[sec].posts[0]));f.update(.3);
    for(let wave=0;wave<4;wave++){
      assert.equal(f.echelon,wave);f.reinforcements.pending.length=0;
      f.foes=[{active:true,entity:{},pos:pos()}];
      if(wave===3){f.pressure();assert.equal(f.phase,'line');}
      f.foes=[];f.pressure();
    }
    assert.equal(advanced,sec+1);
    if(sec<5)assert.deepEqual(checkpoint,{sec:sec+1,integrity:2});
  }
  assert.equal(f.phase,'evacuate');C.player.pos.copy(pos(...HILL_EXIT));site.evacuated=true;
  assert.equal(f.update(.3),true);assert.equal(advanced,8);
});

test('all six hillside sectors offer shoot-through gaps beside solid mech-height cover',()=>{
  const w=Object.assign(Object.create(World.prototype),{boxes:[],grid:new Map(),cellSize:50,height:()=>0});
  const group=new THREE.Group(),site=buildHillside(w,group);
  assert.equal(HILL_COVER.length,30);
  for(const c of HILL_COVER){
    const from=pos(c.x+13,c.z),to=pos(c.x-13,c.z);from.y=to.y=12;
    assert(w.raycast(from,to,null)>=0,'cover at '+c.x+','+c.z);
    const pilot=pos(c.x,c.z);assert(w.collide(pilot,3,0));
    const beside=c.z+(c.z<0?1:-1)*(c.d/2+4);
    from.z=to.z=beside;assert(w.raycast(from,to,null)<0,'firing gap '+c.x+','+c.z);
  }
  const road=[[-577,10],...HILL_LINES.map(l=>l.posts[0]),HILL_EXIT,[688,10]];
  for(let i=1;i<road.length;i++){
    const [a,b]=road.slice(i-1,i+1);
    for(let n=0;n<=100;n++){
      const t=n/100,v=pos(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t);
      assert(!w.collide(v,2.4,0),'ambulance clearance in sector '+i);
    }
  }
  const f=new HillsideFront({player:{pos:pos()},world:w},{sec:3});
  // 配水池側翼入口在林道建物旁，確認預備隊及其第一步都在淨空處。
  const entry=f.entryPoint(371,-149,'grunt');
  assert(!w.collide(entry,4,0));entry.x-=7;assert(!w.collide(entry,4,0));
  site.dispose();
});

test('hillside convoy follows secured lines and the road is navigable',()=>{
  const group=new THREE.Group(),boxes=[],site=buildHillside({height:()=>0,addCollider:b=>boxes.push(b)},group);
  const convoy=group.children.find(o=>o.isGroup);
  const pilotFits=([x,z])=>boxes.every(b=>x<b.x0-3||x>b.x1+3||z<b.z0-3||z>b.z1+3);
  for(const l of HILL_LINES)assert(l.posts.every(pilotFits),l.name);
  assert(pilotFits(HILL_EXIT));site.reset(0);
  const start=convoy.position.x;site.update(1);assert.equal(convoy.position.x,start);
  site.advance(1);site.update(1);assert(convoy.position.x>start);
  for(let i=0;i<300;i++)site.update(.05);
  assert.deepEqual([convoy.position.x,convoy.position.z],HILL_LINES[0].posts[0].slice(0,2));
  assert.equal(site.evacuated,false);
  site.reset(5);site.advance(8);for(let i=0;i<1500;i++)site.update(.05);
  assert(site.evacuated&&!convoy.visible);site.dispose();
});
test('campaigns have comparable route lengths to adjoining chapters and finite, split reinforcements',()=>{
  const hill=STAGES[2],port=STAGES[6];
  assert.equal(hill.battlefield,'hillside');
  assert(hill.enc.len>STAGES[3].enc.len&&port.enc.len>STAGES[5].enc.len);
  assert.equal(hill.groups.flat().length,144);assert(BASE_OPS.flatMap(op=>op.waves.join(' ').split(' ')).length>=96);
  assert(![...hill.route.secs,...port.route.secs].some(s=>s.hold));
});
test('garage interiors can be occupied on foot after opening, and doors restore from captured facilities',()=>{
  const root=new THREE.Group(),boxes=[],site=buildLandingSite({height:landingGround,addCollider:b=>boxes.push(b)},root);
  for(const op of BASE_OPS.filter(op=>op.bay)){
    const [x,z]=op.bay.door,box=boxes.find(b=>b.x0<x&&b.x1>x&&b.z0===z-1);
    assert(box&&box.top>10,op.id);
    site.doors.open(op.id);site.doors.tick(.14);assert(box.top>10);
    site.doors.tick(2);assert(box.top<0);
    const [ix,iz]=op.bay.inside;
    assert(boxes.every(b=>b.top<0||ix<b.x0-3||ix>b.x1+3||iz<b.z0-3||iz>b.z1+3),op.id);
    site.doors.reset([]);assert(box.top>10);
    site.doors.reset([op.id]);assert(box.top<0);
    site.doors.reset([]);
  }
  site.dispose();
});
test('either base wing can be captured first and a checkpoint preserves its effect in the other wing',()=>{
  for(const first of ['power','motor']){
    const C={note(){},world:{height:()=>0},player:{pos:pos()},cp:{lane:'left',secured:['gate','apron',first]}};
    const front=new LandingFront(C,{sec:6});
    front.beginBase=op=>{front.op=op;};
    front.nextBase();assert.equal(front.op.id,first==='power'?'motor':'power');
    assert.notEqual(front.secured,C.cp.secured);
    const op=front.op,at=op.point;C.player.pos=pos(...at);front.wave=1;front.clock=12;front.repairAt=0;front.baseWave=()=>{};
    const u={pos:pos(...at),active:true,entity:{dead:false,ap:500,apMax:1000}};
    front.foes=[u];front.baseUpdate();
    assert.equal(front.reinforcements.pending.length,0);
    assert.equal(u.entity.ap,500);
    front.secured=['gate','apron'];front.sideSupport=false;
    front.baseUpdate();
    if(op.id==='motor')assert.equal(u.entity.ap,700);
    else assert.equal(front.reinforcements.pending.length,3);
  }
});
test('a visible, damaged guard takes verified cover and resumes its post, an unseen pilot cannot trigger a dash',()=>{
  const C={world:{height:()=>0},player:{pos:pos()},enemyCover:()=>pos(12,4)};
  const f=new BattleLine(C,{}),mech={friendly:false,kind:'grunt',entity:{id:2,ap:540,apMax:1200},
    garrison:true,post:0,weapon:{speed:19},pos:pos(),origin:pos(),goal:pos(1,3),route:[],target:f.player,
    maneuverAt:0,contact:pos(),contactAt:-100};
  f.clock=10;f.maneuver(mech);
  assert.equal(mech.maneuver.kind,'cover');assert.deepEqual(mech.goal,pos(12,4));
  f.clock=17;f.maneuver(mech);assert.equal(mech.maneuver,null);
  assert.deepEqual(mech.goal,pos(1,3));
  mech.target=null;mech.kind='brawler';mech.contactAt=-100;f.clock=26;
  f.maneuver(mech);assert.equal(mech.maneuver,null);
});

test('a command duel checkpoint rebuilds the commander and final six guards without replaying earlier companies',()=>{
  const hq=BASE_OPS.at(-1),cp={lane:'right',commandDuel:true,secured:BASE_OPS.slice(0,-1).map(o=>o.id)};
  const C={world:{height:()=>0},player:{pos:pos(...hq.point)},cp,say(){}};
  const front=new LandingFront(C,{sec:10});
  front.order=()=>{};front.unit=()=>({entity:{},weapon:{}});
  front.nextBase();
  assert.equal(front.wave,hq.waves.length);assert.equal(front.scorePart,4);
  assert.equal(front.reinforcements.pending.length,6);assert.equal(C.boss.bossName,'基地司令機・白夜');
  assert.equal(BASE_OPS.flatMap(op=>op.waves.join(' ').split(' ')).length,145);
});
