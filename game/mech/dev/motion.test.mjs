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

test('enemy support feet stay planted while the root advances; heavy cadence is slower',()=>{
  const counts=[];
  for(const kind of ['grunt','ace','heavy']) {
    const m=rig(kind), st=state(V(0,0,8)); let checked=0;
    for(let i=0;i<600;i++) {
      tick(m,st);
      for(const n of ['R','L']) {
        const f=m.motion.feet[n]; if(!f.stance||i<60) continue;
        const actual=m.bones['ankle'+n].getWorldPosition(V());
        assert(actual.distanceTo(f.anchor)<.06, `${kind} ${n} planted error ${actual.distanceTo(f.anchor)}`); checked++;
      }
    }
    assert(checked>400); counts.push(m.stepCount);
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
