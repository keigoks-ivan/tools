import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {World} from '../env.js';
import {buildTaipei101,TAIPEI_101} from '../taipei/landmark.mjs';
import {channelsAt,riverDepth} from '../taipei/rivers.mjs';
import {loadBasin} from '../taipei/basin.mjs';
import {FalconCombat,FALCON_WEAPONS} from '../taipei/falcon.mjs';
import {TAIPEI_STAGES} from '../taipei/campaign.mjs';
import {prepareStages} from '../combat.js';

test('each Taipei chapter has seven reachable sectors, recovery checkpoints and its own ending',()=>{
  assert.deepEqual(TAIPEI_STAGES.map(s=>s.route.district),['arcade','river','beitou','songyan','grassland','skyline']);
  for(const stage of prepareStages(TAIPEI_STAGES)){
    assert.equal(stage.enc.secs.length,7);
    assert.ok(stage.enc.len>=1000);
    assert.deepEqual(stage.enc.cp,[2,4,6]);
    assert.ok(stage.enc.secs.every((s,i,arr)=>s.waves.length && (!i || s.s>arr[i-1].s)));
    assert.ok(stage.enc.secs.at(-1).last);
    assert.equal(stage.enc.bars.length,0);
  }
  assert.ok(TAIPEI_STAGES[0].route.secs.find(s=>s.pickup?.portable).breakContact);
  assert.equal(TAIPEI_STAGES[1].route.secs.filter(s=>s.pickup?.releaseFerry).length,1);
  assert.ok(TAIPEI_STAGES[3].route.secs.some(s=>s.pickup?.travel>0&&s.breakContact));
  const finale=TAIPEI_STAGES.at(-1).route.secs;
  assert.ok(finale.some(s=>s.pickup?.pulse&&s.pickup.decoyX!==undefined));
  assert.ok(finale.at(-1).pickup.afterBoss&&finale.at(-1).boss);
  const aerial=finale.filter(s=>s.pickup?.alt);
  assert.equal(aerial.length,2);
  assert.ok(aerial.every(s=>s.pickup.alt<100));
});
test('surface water follows both upstream channels and leaves an exposed spit before the confluence',()=>{
  const [near,far]=channelsAt(-670);
  assert.ok(riverDepth(-670,(near[0]+near[1])/2)>3);
  assert.ok(riverDepth(-670,(far[0]+far[1])/2)>3);
  assert.equal(riverDepth(-670,(near[1]+far[0])/2),0);
  assert.ok(riverDepth(481,300)>3);
  assert.equal(riverDepth(481,8),0);
});
test('real terrain grid preserves a low Taipei basin and the northern mountain group',async t=>{
  const data=await readFile(new URL('../taipei/basin.bin',import.meta.url));
  t.mock.method(globalThis,'fetch',async()=>new Response(data));
  const sample=await loadBasin();
  assert.ok(sample(0,0,'arcade')<45);
  let highest=0;
  for(let z=2400;z<4000;z+=70)for(let x=-1500;x<380;x+=65)highest=Math.max(highest,sample(x,z,'arcade'));
  assert.ok(highest>600);
});
test('Taipei 101 stops player movement and fire while remaining outside the structural damage system',()=>{
  const w=Object.create(World.prototype);
  Object.assign(w,{boxes:[],grid:new Map(),cellSize:60,height:()=>0,blds:[],_nv:new THREE.Vector3(),_cv:new THREE.Vector3()});
  buildTaipei101(w,{quad(){},piece(){},glass:null,trim:null,paint:c=>c,glassUV:[],uv:[]});
  const {x,z,height}=TAIPEI_101;
  assert.equal(Math.max(...w.boxes.map(b=>b.top)),height);
  for(const y of [12,121,256,390,471]){
    const a=new THREE.Vector3(x,y,z-88),b=new THREE.Vector3(x,y,z),t=w.raycast(a,b,null);
    assert.ok(t>0&&t<1);
    const p=a.clone().lerp(b,t);
    assert.equal(w.hitBuilding(p,500),null);
    w.blast(p,48,500);
    assert.equal(w.raycast(a,b,null),t);
    assert.ok(w.collide(b.clone(),2,y));
  }
  assert.ok(w.boxes.every(b=>b.landmark==='台北101'&&!b.bld));
});
test('羽標 fires six missiles on release and marks only an unobstructed target',()=>{
  const c=Object.create(FalconCombat.prototype),e={los:true,chest:p=>p.set(0,10,50)};
  const salvos=[];
  Object.assign(c,{loadout:FALCON_WEAPONS,world:{raycast:()=>.45},hero:{designator:new THREE.Object3D()},msl:{cd:1},
    fx:{tracer(){}},audio:{ui(){}},note(){},cannon:{cd:1},fireTarget:()=>null,queueMissiles:(targets,n)=>salvos.push([targets,n])});
  c.launchSalvo([e]);assert.equal(c.marked,undefined);assert.deepEqual(salvos.pop(),[[],6]);
  c.world.raycast=()=>-1;c.launchSalvo([e]);assert.equal(c.marked,e);assert.equal(c.markFor,8);
  assert.deepEqual(salvos.pop(),[[e],6]);assert.equal(c.cannon.cd,1);assert.equal(c.msl.cd,0);
  c.launchSalvo([]);assert.deepEqual(salvos.pop(),[[],6]);
  c.enc={fightT:1};c.boss={ap:400,apMax:1000};assert.equal(c.echoActive,true);
  c.marked=c.boss;assert.equal(c.echoActive,false);
});
test('白夜羽陣 chains three times, stops at cover, and needs no missile mark',()=>{
  const c=Object.create(FalconCombat.prototype),damage=[];
  const target=z=>({z,chest:p=>p.set(0,2,z)}),enemies=[80,120,160,200].map(target);
  Object.assign(c,{loadout:FALCON_WEAPONS,enemies:[],phase:'fight',cannon:{cd:1},msl:{cd:.55},stats:{shots:0},
    aimDir:new THREE.Vector3(0,0,1),events:[],hero:{missilePorts:[new THREE.Object3D(),new THREE.Object3D()]},
    world:{raycast:()=>-1},cockpit:{kick(){}},fx:{wingArc(){}},audio:{ui(){},impact(){}},note(){},
    damageEnemy:e=>damage.push(e.z)});
  c.startCannon();assert.equal(c.cannon.cd,1);
  c.enemies=enemies;c.startCannon();assert.equal(c.cannon.cd,0);assert.equal(c.msl.cd,.55);
  assert.deepEqual(c.events.map(e=>e.t),[0,.36,.72]);
  c.events[0].fn();assert.deepEqual(damage,[80,120,160]);
  c.world.raycast=(a,b)=>b.z>100?.25:-1;
  c.events[1].fn();assert.deepEqual(damage,[80,120,160,80]);
  enemies[0].dead=true;c.events[2].fn();assert.equal(damage.length,4);
});
