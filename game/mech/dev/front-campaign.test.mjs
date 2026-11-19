import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STAGES } from '../combat.js';
import { HillsideFront } from '../hillside-front.mjs';
import { HILL_LINES,HILL_EXIT } from '../hillside-layout.mjs';
import { buildHillside } from '../hillside-art.mjs';
import { BASE_OPS } from '../base-layout.mjs';
import { LandingFront } from '../landing-front.mjs';
import { buildLandingSite } from '../landing-art.mjs';
import { landingGround } from '../landing-layout.mjs';
import { BattleLine } from '../battle-line.mjs';

const pos=(x=0,z=0)=>new THREE.Vector3(x,0,z);
test('a hillside post changes hands by local presence, and the convoy follows secured lines',()=>{
  const C={player:{pos:pos(-400,68)},world:{height:()=>0},note(){},say(){}};
  const front=new HillsideFront(C,{sec:0});
  front.posts=HILL_LINES[0].posts.map(([x,z,name],i)=>({x,z,name,i,owned:false,taken:false,waypoint:{}}));
  front.first=null;front.reserve=false;
  // Keep the rear echelon in play while challenging this position.
  const foe=(x,z)=>({active:true,entity:{dead:false},pos:pos(x,z)});
  front.foes=Array.from({length:5},()=>foe(-280,5));
  front.pressure();assert.equal(front.posts[0].owned,true);
  C.player.pos.set(-280,0,-80);
  front.foes[0].pos.set(-406,0,68);
  front.pressure();assert.equal(front.posts[0].owned,false);
  front.foes[0].entity.dead=true;
  C.player.pos.set(-406,0,68);front.pressure();assert.equal(front.posts[0].owned,true);
  assert.equal(front.enc.sec,0);
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
