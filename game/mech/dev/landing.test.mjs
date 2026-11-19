import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STAGES } from '../combat.js';
import { buildLandingSite } from '../landing-art.mjs';
import { LANDING, landingGround, landingShore } from '../landing-layout.mjs';

test('the bow ramp moves with the boat and becomes walkable after it lowers', () => {
  const root=new THREE.Group(), colliders=[];
  const world={height:landingGround,addCollider:o=>colliders.push(o)};
  const site=buildLandingSite(world,root);
  const bow=LANDING.departure;
  assert(site.boxes.some(b=>b.x0<=bow&&b.x1>=bow&&b.top>LANDING.deck+12));
  assert.equal(site.floorAt(bow-20,0,LANDING.deck),LANDING.deck);
  assert.equal(site.floorAt(bow+8,0,LANDING.deck),-Infinity);
  site.setPose(1,1,.5);
  assert.equal(site.ship.position.x,LANDING.berth);
  assert(site.boxes.every(b=>b.top<LANDING.deck+6));
  for(let dx=2;dx<26;dx+=3) assert(Number.isFinite(site.floorAt(LANDING.berth+dx,0,LANDING.deck)));
  assert(Math.abs(landingShore(0)-(LANDING.berth+LANDING.ramp))<2);
  assert(landingGround(landingShore(0)-50,0)<0);
  assert(landingGround(landingShore(0)+60,0)>0);
  assert(colliders.filter(c=>c.x0<LANDING.seawall&&c.x1>LANDING.seawall).every(c=>
    [LANDING.northGap,LANDING.southGap].every(gap=>c.z0>gap||c.z1<gap)));
  site.dispose();
});

test('stage seven uses advancement checkpoints and a capped static landing scene', () => {
  const d=STAGES[6];
  assert.equal(d.frontline,'landing');
  assert.equal(d.battlefield,'landing');
  assert.deepEqual(d.route.cp,[1,2,3,4,5,6,7,8,9,10]);
  assert(d.route.secs.every(s=>!s.hold));
  const root=new THREE.Group(),site=buildLandingSite({height:()=>0,addCollider(){}},root);
  let meshes=0,triangles=0;
  root.traverse(o=>{
    assert(!o.isLight);
    if(!o.isMesh)return;
    meshes++;
    triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
  });
  assert(meshes<=25);
  assert(triangles<44000);
  assert.equal(site.water.material.transparent,false);
  site.dispose();
});

test('the following craft hold offshore until release, then move independently of the ramp',()=>{
  const root=new THREE.Group(),site=buildLandingSite({height:landingGround,addCollider(){}},root);
  site.setPose(1,1);const hold=site.flotilla.position.x;
  site.setPose(1,1,8);assert.equal(site.flotilla.position.x,hold);
  site.fleetReleased=true;site.setPose(1,1,3);
  assert(site.flotilla.position.x>hold&&site.flotilla.position.x<hold+60);
  site.setPose(1,1,9);assert.equal(site.flotilla.position.x,hold+60);
  assert.equal(site.ship.position.x,LANDING.berth);
  site.dispose();
});
