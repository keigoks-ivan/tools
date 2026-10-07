import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../game/lib/three.module.js';
import { PROFILES, createFlightState, stepFlight, getFlightData, runwayOf } from '../physics.mjs';
import { CARRIER, crossedArrestingWire } from '../carrier.mjs';
import { createLandingAssist } from '../landing-assist.mjs';
import { createHornetAircraft, createHornetCockpit } from '../aircraft.hornet.js';
import { createCarrierWorld } from '../carrier-world.js';
import { levelsFor, createLevelState } from '../challenge.mjs';
import { toursFor, tourById, createTourState } from '../tour.mjs';
import { flightAudioFrame } from '../audio.js';
const KT=1.943844, DT=1/120;
function run(s,seconds,control=()=>({})) {
  for(let i=0;i<seconds/DT&&!s.crashed;i++)stepFlight(s,control(s,getFlightData(s)),DT);
  return getFlightData(s);
}
test('real F-16C and F/A-18C identities keep distinct naval capabilities and handling',()=>{
  assert.equal(PROFILES.fighter.name,'F-16C');assert.equal(PROFILES.hornet.name,'F/A-18C');
  assert.equal(PROFILES.fighter.ui.engines,1);assert.equal(PROFILES.hornet.ui.engines,2);
  assert.equal(PROFILES.fighter.hasHook,undefined);assert.equal(PROFILES.hornet.hasHook,true);
  assert.equal(createFlightState('carrier','fighter').carrier,undefined);
  const rates=['fighter','hornet'].map(id=>{const s=createFlightState('cruise',id);run(s,1,()=>({roll:.6}));return Math.abs(s.angularVelocity.z);});
  assert.ok(rates[0]>rates[1]*1.25);
});
test('Hornet dry and afterburner takeoffs clear the runway with gear retraction',()=>{
  for(const ab of [false,true]){
    const s=createFlightState('runway','hornet');
    const d=run(s,40,(s,d)=>({throttle:1,afterburner:ab,pitch:s.onGround?(d.indicatedAirspeed*KT>130?.3:0):(12-d.pitch)*.03,gear:s.onGround||d.agl<20,flaps:d.indicatedAirspeed*KT>180?0:1}));
    assert.equal(s.crashed,false,s.crashReason);assert.equal(s.onGround,false);assert.ok(d.agl>150);assert.ok(s.gearPosition<.01);
  }
});
test('Hornet AP holds selected speed, heading and altitude; afterburner goes out',()=>{
  const s=createFlightState('cruise','hornet');s.autopilot={enabled:true,heading:20,altitude:2500,speed:280/KT};
  const d=run(s,120,()=>({afterburner:true}));
  assert.equal(s.crashed,false,s.crashReason);assert.equal(s.afterburner,false);
  assert.ok(Math.abs(d.heading-20)<3);assert.ok(Math.abs(d.altitude-2500)<35);assert.ok(Math.abs(d.indicatedAirspeed*KT-280)<5);
});
test('Hornet assisted runway landing remains separate from arrested recovery',()=>{
  const s=createFlightState('approach','hornet'),a=createLandingAssist();assert.equal(a.engage(s,getFlightData(s)).eligible,true);
  const d=run(s,140,(s,d)=>a.update(s,d)||{});
  assert.equal(s.crashed,false,s.crashReason);assert.ok(s.touchdown);assert.equal(s.arrested,null);assert.ok(d.groundSpeed<2.5);assert.ok(d.onRunway);
});
for(const o of [{name:'calm'},{name:'offset and high',x:70,above:25},{name:'15 kt crosswind',wind:{x:7.72,y:0,z:0}},{name:'light wind',wind:{x:1.7,y:0,z:2}}])test(`carrier assist catches a wire and stops: ${o.name}`,()=>{
  const s=createFlightState('carrier','hornet');s.position.x=o.x||0;s.position.y+=o.above||0;s.wind=o.wind||s.wind;
  assert.deepEqual(runwayOf(s),CARRIER);assert.equal(s.hook,true);assert.equal(s.gear,true);assert.equal(s.flaps,3);
  const a=createLandingAssist();assert.equal(a.engage(s,getFlightData(s)).eligible,true);
  const d=run(s,70,(s,d)=>a.update(s,d)||{});
  assert.equal(s.crashed,false,s.crashReason);assert.ok(s.touchdown);assert.ok(s.arrested);assert.ok(s.arrested.wire>=1&&s.arrested.wire<=4);
  assert.ok(Math.abs(s.touchdown.lateralOffset)<1);assert.ok(s.touchdown.sinkRate<7);
  assert.ok(d.groundSpeed<.1);assert.ok(d.onRunway);assert.ok(s.arrested.z-s.position.z<120);
});
test('raised hook misses every wire and allows a bolter instead of an instant overrun crash',()=>{
  const s=createFlightState('carrier','hornet'),a=createLandingAssist();a.engage(s,getFlightData(s));let bolter=false;
  run(s,70,(s,d)=>{
    if(s.bolter){bolter=true;return {throttle:1,hook:false,pitch:Math.max(0,Math.min(.5,(12-d.pitch)*.06)),flaps:3,gear:true};}
    return {...a.update(s,d),hook:false};
  });
  assert.equal(s.arrested,null);assert.equal(bolter,true);assert.equal(s.crashed,false,s.crashReason);assert.equal(s.onGround,false);assert.ok(s.position.y>50);
});
test('wire capture requires deployed gear/hook, deck contact, alignment and a physical crossing',()=>{
  const s=createFlightState('carrier','hornet');s.onGround=true;s.position={x:0,y:2.2,z:90};
  assert.equal(crossedArrestingWire(s,100,95,0),2);
  for(const patch of [{hookPosition:0},{gearPosition:0},{onGround:false},{position:{x:13,y:2.2,z:90}}])assert.equal(crossedArrestingWire({...s,...patch},100,95,0),null);
  assert.equal(crossedArrestingWire(s,100,95,20),null);assert.equal(crossedArrestingWire(s,95,100,0),null);
});
test('ocean outside the recovery deck never acts as an invisible runway',()=>{
  const s=createFlightState('carrier','hornet');s.position={x:80,y:1,z:120};s.velocity={x:0,y:-5,z:-72};
  run(s,8,()=>({throttle:.1}));assert.equal(s.crashed,true);assert.equal(s.arrested,null);assert.ok(s.position.y<0);
});
test('landing outside the recovery lane hits the visible deck rather than falling through it',()=>{
  const s=createFlightState('carrier','hornet');s.position={x:23,y:3,z:70};s.velocity={x:0,y:-3,z:-72};
  run(s,2,()=>({throttle:.1}));assert.equal(s.crashed,true);assert.equal(s.crashReason,'off-runway');assert.equal(s.position.y,PROFILES.hornet.gearHeight);
});
test('Hornet challenges and tour records keep their own aircraft identity',()=>{
  for(const l of levelsFor('hornet'))assert.equal(createLevelState(l).aircraft,'hornet');
  for(const t of toursFor('hornet')){assert.equal(tourById(t.id),t);assert.equal(createTourState(t).aircraft,'hornet');assert.ok(t.id.startsWith('hornet-'));}
});
test('Hornet model, naval cockpit and carrier animations keep finite transforms and release resources',()=>{
  const plane=createHornetAircraft(THREE),cockpit=createHornetCockpit(THREE),scene=new THREE.Scene(),world=createCarrierWorld(THREE,scene),s=createFlightState('carrier','hornet');
  let disposed=0;
  for(const root of [plane.group,cockpit,world.group])root.traverse(o=>{if(o.geometry)o.geometry.addEventListener('dispose',()=>disposed++);});
  for(const v of [0,.5,1]){
    Object.assign(s,{gearPosition:v,hookPosition:v,afterburnerLevel:v,spoilers:!!v,elapsed:v,arrested:v?{wire:3}:null});
    plane.update(s);cockpit.update(s,getFlightData(s));world.update(v,s,getFlightData(s));
    for(const root of [plane.group,cockpit,world.group])root.traverse(o=>assert.ok([...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()].every(Number.isFinite)));
  }
  plane.dispose();cockpit.dispose();world.dispose();assert.ok(disposed>100);assert.equal(scene.children.length,0);
});
test('Hornet audio uses two engines and a separate frequency; afterburner stays opt-in',()=>{
  const s=createFlightState('cruise','hornet');s.afterburnerLevel=1;
  const h=flightAudioFrame(s,getFlightData(s),{aircraft:PROFILES.hornet,active:true}),f=flightAudioFrame({...s,aircraft:'fighter'},getFlightData(s),{aircraft:PROFILES.fighter,active:true});
  assert.equal(h.id,'hornet');assert.equal(h.twin,true);assert.equal(h.afterburner,1);assert.notEqual(h.fanHz,f.fanHz);
  assert.equal(flightAudioFrame(s,getFlightData(s),{active:true,paused:true}).audible,false);
});
