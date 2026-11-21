import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MechMotion } from '../anim.js';
import { Combat } from '../combat.js';

const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
function rig(kind='grunt') {
  const root = new THREE.Group(), bones = {};
  const bone = (name,parent,x,y,z=0) => { const b = bones[name] = new THREE.Group(); b.position.set(x,y,z); parent.add(b); return b; };
  const pelvis = bone('pelvis',root,0,9.75), torso = bone('torso',pelvis,0,.7);
  bone('head',torso,0,5.15,.55);
  for (const [n,s] of [['R',-1],['L',1]]) {
    const hip=bone('hip'+n,pelvis,s*1.55,-.55), knee=bone('knee'+n,hip,0,-4.15,.15);
    bone('ankle'+n,knee,0,-3.75,-.1);
    const shoulder=bone('shoulder'+n,torso,s*3.4,3.95,.05); shoulder.rotation.order='YXZ';
    bone('elbow'+n,shoulder,0,-2.9);
  }
  torso.rotation.order='YXZ';
  const m={root,bones,L:{pelvis:9.75},schemeKey:kind,scale:kind==='heavy'?1.25:1,pose:{boost:0,air:0},land:0,landV:0,legYaw:0,recoil:0,swing:0,thrust:0,flames:[]};
  root.scale.setScalar(m.scale); m.motion=new MechMotion(m); return m;
}
function tick(m,st,dt=1/60) { m.root.position.addScaledVector(st.vel,dt); m.motion.update(dt,st); m.root.updateMatrixWorld(true); }
const state = (vel=V()) => ({vel,grounded:true,boost:0,torsoYaw:0,aim:null});

test('cover, stagger and the advance gesture produce distinct poses and release the free arm',()=>{
  const m=rig('ally'),s=state();s.aim=V(0,12,90);
  const run=n=>{for(let i=0;i<n;i++)tick(m,s);};
  run(90);const b=m.bones,ready=b.shoulderL.rotation.x,hip=b.pelvis.position.y;
  s.guard=true;run(45);
  assert(b.shoulderL.rotation.x<ready-.5 && b.pelvis.position.y<hip-.55);
  s.guard=false;s.stagger=2;run(45);
  assert(b.shoulderL.rotation.z>.25 && b.pelvis.position.y<hip-.8);
  s.stagger=0;run(100);m.motion.signalAdvance();run(20);
  const raised=b.shoulderL.rotation.z;assert(raised>.4);
  run(30);assert(b.shoulderL.rotation.z<raised && b.shoulderL.rotation.x<-1.25);
  run(90);assert(Math.abs(b.shoulderL.rotation.x-ready)<.015);
});

test('hits roll with projectile travel in mech space and recoil returns the shoulder to its socket',()=>{
  for(const yaw of [0,Math.PI]){
    const m=rig('ace'),s=state();m.legYaw=s.torsoYaw=yaw;s.aim=V(0,12,80*Math.cos(yaw));
    for(let i=0;i<80;i++)tick(m,s);
    m.motion.impact(.95,V(1,0,0));m.recoil=1;
    for(let i=0;i<5;i++)tick(m,s);
    assert(m.bones.torso.rotation.z*Math.cos(yaw)<-.1);
    assert(m.bones.shoulderR.position.z<m.motion.shoulderZ-.2);
    for(let i=0;i<90;i++)tick(m,s);
    assert(Math.abs(m.bones.shoulderR.position.z-m.motion.shoulderZ)<.001);
    assert(Math.abs(m.bones.torso.rotation.z)<.005);
  }
});

test('walking and airborne mechs keep distinct foot lanes at both frame rates',()=>{
  for(const dt of [1/30,1/60])for(const kind of ['ally','ace','heavy']){
    const m=rig(kind),s=state(),left=V(),right=V();
    const span=()=>m.bones.ankleL.getWorldPosition(left).sub(m.bones.ankleR.getWorldPosition(right)).x/m.scale;
    tick(m,s,dt);assert(span()>4.65);
    s.vel.z=12;let low=Infinity,high=-Infinity;
    for(let i=0;i<3/dt;i++){
      tick(m,s,dt);if(i<1/dt)continue;
      low=Math.min(low,span());high=Math.max(high,span());
    }
    assert(low>4.05 && high-low>.24);
    s.grounded=false;for(let i=0;i<2/dt;i++)tick(m,s,dt);
    assert(span()>5 && m.bones.hipL.rotation.z>.15 && m.bones.hipR.rotation.z<-.15);
  }
});

test('descending mechs extend their legs near the surface, absorb contact and stand up again',()=>{
  const m=rig('grunt'),s=state();s.grounded=false;s.vel.y=-12;s.clearance=50;
  for(let i=0;i<60;i++)m.motion.update(1/60,s);
  const tucked=m.bones.kneeR.rotation.x;
  s.clearance=1;
  for(let i=0;i<30;i++)m.motion.update(1/60,s);
  assert(m.bones.kneeR.rotation.x<tucked-.45);
  s.grounded=true;s.vel.y=0;m.motion.update(1/60,s);
  const hip=m.bones.pelvis.position.y;assert(m.motion.touchdown>.5);
  for(let i=0;i<90;i++)m.motion.update(1/60,s);
  assert(m.motion.touchdown<.01 && m.bones.pelvis.position.y>hip+.25);
});

test('grounded mechs initiate a step from rest and finish sharp turns at their own pace',()=>{
  for(const dt of [1/30,1/60]){
    const times=[];
    for(const kind of ['ace','ally','heavy']){
      const m=rig(kind),st=state();tick(m,st,dt);
      st.torsoYaw=Math.PI/2;
      let turned=0;
      for(let i=1;i<=2/dt;i++){
        tick(m,st,dt);if(!turned && m.legYaw>=st.torsoYaw*.9)turned=i*dt;
      }
      assert(turned>0 && turned<.82);times.push(turned);
      const walk=rig(kind),start=state();tick(walk,start,dt);
      let first=0;
      for(let i=1;i<=.5/dt;i++){
        start.vel.z=Math.min(8,i*dt*20);tick(walk,start,dt);
        if(!walk.motion.st.R){first=i*dt;assert(walk.motion.st.L);break;}
      }
      assert(first>0 && first<.18);
    }
    assert(times[0]<times[1] && times[1]<times[2]);
  }
});

test('side boosts load opposite knees when changing direction and return to planted feet',()=>{
  for(const kind of ['ally','grunt','heavy']){
    const m=rig(kind),st=state();st.boost=1;
    for(const side of [1,-1,1]){
      st.vel.x=side*26;
      for(let i=0;i<30;i++)tick(m,st);
      const knees=m.bones.kneeL.rotation.x-m.bones.kneeR.rotation.x;
      assert(knees*side>.45);
      assert(m.bones.torso.rotation.z*side<-.1);
    }
    st.boost=0;st.vel.x=0;
    for(let i=0;i<180;i++)tick(m,st);
    assert(m.motion.st.L && m.motion.st.R && m.pose.boost<.001);
  }
});

test('level-ground thrust clears both soles through forward, reverse and lateral travel',()=>{
  for(const kind of ['ally','heavy'])for(const [x,z] of [[26,0],[-26,0],[0,26],[0,-26]]){
    const m=rig(kind),st=state(V(x,0,z));st.boost=1;
    for(let i=0;i<90;i++)tick(m,st);
    for(const n of ['R','L']){
      const ankle=m.bones['ankle'+n],motion=m.motion;
      const toe=ankle.localToWorld(V(0,-motion.ankleY,motion.toe));
      const heel=ankle.localToWorld(V(0,-motion.ankleY,-motion.heel));
      const clearance=Math.min(heel.y,toe.y)/m.scale;
      assert(clearance>=0 && clearance<1);
      assert(Math.abs(heel.y-toe.y)/m.scale<.55);
    }
  }
});

test('small aim changes keep both soles planted; a large turn repositions the feet and settles',()=>{
  for(const kind of ['ally','ace','heavy']) {
    const m=rig(kind), st=state(); tick(m,st);
    const start=m.motion.feet.R.anchor.clone();
    for(let i=0;i<120;i++){st.torsoYaw=.3*Math.sin(i/25);tick(m,st);}
    assert.equal(m.legYaw,0);assert.equal(m.stepCount,0);
    assert(m.motion.feet.R.anchor.distanceTo(start)<1e-6);
    assert(Math.abs(m.bones.torso.rotation.y)>.2);
    st.torsoYaw=2.1;
    for(let i=0;i<240;i++)tick(m,st);
    assert(Math.abs(m.legYaw-st.torsoYaw)<.04 && m.stepCount>0);
    assert(m.motion.feet.R.stance && m.motion.feet.L.stance);
    const steps=m.stepCount;for(let i=0;i<120;i++)tick(m,st);
    assert.equal(m.stepCount,steps);
  }
});

test('side steps leave space for both soles and keep the hips steady while tracking a flank',()=>{
  for(const dt of [1/30,1/60])for(const kind of ['ally','grunt','heavy']) {
    const m=rig(kind),st=state(),sep=V(),right=V();
    for(let i=0;i<240;i++){
      const angle=i<120?Math.PI/2:1.9+.025*Math.sin(i*.65);
      st.vel.set(10*Math.sin(angle),0,10*Math.cos(angle));
      const yaw=m.legYaw;tick(m,st,dt);
      if(i>30 && i<120){
        m.bones.ankleL.getWorldPosition(sep).sub(m.bones.ankleR.getWorldPosition(right));
        assert((sep.x*Math.cos(m.legYaw)-sep.z*Math.sin(m.legYaw))/m.scale>2.6);
      }
      if(i>150)assert(Math.abs(m.legYaw-yaw)/dt<.5);
    }
  }
});

test('an early swing redirects towards a new heading while the supporting foot stays put',()=>{
  const m=rig('ally'),st=state(V(0,0,8));let checked=false;
  for(let i=0;i<180&&!checked;i++) {
    const feet=m.motion.feet,wasPlanted=feet.L.stance;tick(m,st);
    if(i<80||!wasPlanted||feet.L.stance)continue;
    const old=feet.L.to.clone(),support=feet.R.anchor.clone();st.vel.set(8,0,0);
    for(let j=0;j<5;j++)tick(m,st);
    assert(!feet.L.stance && feet.L.to.x>old.x+.55 && feet.L.to.z<old.z-.55);
    assert(feet.R.stance && feet.R.anchor.distanceTo(support)<1e-6);checked=true;
  }
  assert(checked);
});

test('planted feet move with the deck without taking steps or sliding',()=>{
  const m=rig(), st=state();
  st.groundAt=()=>m.root.position.y;
  for(let i=0;i<20;i++)tick(m,st);
  const before=m.motion.feet.R.anchor.clone().sub(m.root.position);
  for(let i=0;i<90;i++){
    const dy=Math.cos(i*.2)*.018;
    m.root.position.x+=.23; m.root.position.y+=dy;
    m.motion.carry(.23,dy,0);
    tick(m,st);
    assert(m.motion.feet.R.anchor.clone().sub(m.root.position).distanceTo(before)<1e-5);
  }
  assert.equal(m.stepCount,0);
});

test('enemy support feet stay planted while the root advances; heavy cadence is slower',()=>{
  const counts=[];
  for(const kind of ['grunt','ace','heavy']) {
    const m=rig(kind), st=state(V(0,0,8)), motion=m.motion; let checked=0,heels=0,toes=0;
    for(let i=0;i<600;i++) {
      tick(m,st);
      for(const n of ['R','L']) {
        const f=m.motion.feet[n]; if(!f.stance||i<60) continue;
        const ankle=m.bones['ankle'+n],heel=ankle.localToWorld(V(0,-motion.ankleY,-motion.heel)),toe=ankle.localToWorld(V(0,-motion.ankleY,motion.toe));
        const atHeel=heel.y<toe.y,pivot=atHeel?-motion.heel:motion.toe;
        const expected=f.anchor.clone().add(V(Math.sin(f.yaw)*pivot,-motion.ankleY,Math.cos(f.yaw)*pivot).multiplyScalar(m.scale));
        const error=(atHeel?heel:toe).distanceTo(expected);
        assert(error<.06,`${kind} ${n} planted contact error ${error}`);checked++;
        if(toe.y-heel.y>.12)heels++;if(heel.y-toe.y>.12)toes++;
      }
    }
    assert(checked>400 && heels>20 && toes>20); counts.push(m.stepCount);
  }
  assert(counts[2]<counts[0] && counts[2]<counts[1],JSON.stringify(counts));
});

test('single support moves the pelvis toward the planted leg rather than the lifting leg',()=>{
  for(const kind of ['grunt','ace','heavy']) {
    const m=rig(kind),st=state(V(0,0,8)); let checked=0;
    for(let i=0;i<600;i++) {
      tick(m,st);const f=m.motion.feet;
      if(i<60||f.R.stance===f.L.stance)continue;
      const support=m.bones[f.R.stance?'hipR':'hipL'];
      assert(m.bones.pelvis.position.x*support.position.x>0);checked++;
    }
    assert(checked>100);
  }
});

test('feet adapt to slope and changed support with bounded height sampling',()=>{
  const m=rig('heavy'),st=state(V(0,0,5)); let calls=0,offset=0;
  st.groundAt=(x,z)=>{calls++; return z*.035+x*.06+offset;};
  for(let i=0;i<600;i++) {
    m.root.position.y=m.root.position.z*.035+offset; tick(m,st);
    for(const n of ['R','L']) {
      const f=m.motion.feet[n]; if(!f.stance||f.sampleT<.13) continue;
      const ground=f.anchor.z*.035+f.anchor.x*.06+offset;
      assert(Math.abs(f.anchor.y-ground-m.motion.ankleY*m.scale)<1e-6);
    }
  }
  assert(calls<160,`terrain queries ${calls}`);
  st.vel.set(0,0,0); for(let i=0;i<200;i++)tick(m,st);
  offset=-.7; m.root.position.y+=offset; for(let i=0;i<30;i++)tick(m,st);
  for(const n of ['R','L'])assert(Math.abs(m.motion.feet[n].anchor.y-(st.groundAt(m.motion.feet[n].anchor.x,m.motion.feet[n].anchor.z)+m.motion.ankleY*m.scale))<.02);
});
test('turn, reverse, stop, boost, flight, landing and teleport remain finite at 30/60 Hz',()=>{
  for(const kind of ['grunt','ace','heavy'])for(const dt of [1/30,1/60]) {
    const m=rig(kind),st=state();
    for(let i=0;i<800;i++) {
      const phase=Math.floor(i/100); st.vel.set(phase===2?8:0,phase===4?5:0,phase===0?12:phase===1?-7:0);
      st.torsoYaw=phase===3?i*dt:0; st.boost=phase===5?1:0; st.grounded=phase!==4;
      if(i===600) {m.motion.impact(1.3);m.landV=7;} if(i===700)m.root.position.set(500,0,-500);
      tick(m,st,dt);
      for(const b of Object.values(m.bones))assert([...b.position.toArray(),...b.quaternion.toArray()].every(Number.isFinite));
    }
  }
});
test('enemy recoil recovers between shots without accumulating shoulder offsets',()=>{
  const m=rig(),control=rig(),st=state(); st.aim=V(0,10,200); st.brace=1;
  for(let i=0;i<150;i++){tick(m,st);tick(control,st);}const base=m.bones.shoulderR.rotation.x;
  let peak=base;
  for(let i=0;i<300;i++){if(i%6===0)m.recoil=.5;tick(m,st);tick(control,st);peak=Math.max(peak,m.bones.shoulderR.rotation.x);}
  assert(peak>base+.015 && peak<base+.18);
  st.brace=0;for(let i=0;i<180;i++){tick(m,st);tick(control,st);}
  assert(Math.abs(m.bones.shoulderR.rotation.x-control.bones.shoulderR.rotation.x)<.015);assert(m.motion.brace<.01);
});
test('enemy melee winds the torso before the cut',()=>{
  const foe=rig('ace'); foe.swing=.9;tick(foe,state());const wind=foe.bones.torso.rotation.y;
  foe.swing=.45;tick(foe,state()); assert(wind<-.05 && foe.bones.torso.rotation.y>.25);
});
test('actual enemy bullet and cannon firing trigger recoil without changing their damage',()=>{
  const silent=new Proxy({}, {get:()=>()=>{}}); let damage=0;
  const C=Object.assign(Object.create(Combat.prototype),{enemies:[],player:{vel:V()},hero:{capsule:()=>({x:0,z:100,r:3.2,y0:1,y1:17})},world:{raycast:()=>-1},fx:silent,audio:silent,missiles:[]});
  Object.defineProperty(C,'tier',{value:{aim:1}});
  C.hurt=n=>{damage+=n;};
  const e={m:{recoil:0},pos:V()};C.bullet(e,V(),V(0,10,100),100);assert.equal(e.m.recoil,.5);assert.equal(damage,40);
  C.shell(e,V(),V(0,10,100),210,800);assert.equal(e.m.recoil,1.2);assert.equal(C.missiles[0].dmg,800);
});
