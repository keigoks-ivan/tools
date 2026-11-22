import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HillsideFront } from '../hillside-front.mjs';
import { chipAlleyFace, resetAlleyFaces, settleAlley } from '../hillside-street.mjs';

const vec=(x,y,z)=>new THREE.Vector3(x,y,z);
const segment=vertices=>{
  const a=new THREE.Float32BufferAttribute(vertices,3);
  return {a,s:0,o:a.array.slice()};
};

test('repeated off-centre hits widen the aperture while its texture, other bays and replay stay aligned',()=>{
  const g=segment(new Float32Array(32*3));
  const uv=new THREE.Float32BufferAttribute(new Float32Array(32*2),2);
  const face={x:1.5,y:12,z:0,nx:0,nz:1,width:3,height:4,at:0,pu:.2,du:.15,pv:.4,dv:.25,seed:1};
  const faces=[face,{...face,x:4.5,at:16}];
  for(const f of faces)for(let k=0;k<16;k++){
    const idx=f.at+k,center=k>=8;
    g.o.set([f.x+(center?0:1.5),f.y+(center?0:2),0],idx*3);
    uv.setXY(idx,f.pu+f.du*(center?.5:1),f.pv+f.dv*(center?.5:1));
  }
  g.a.array.set(g.o);
  const b={seg:[g],burn:{a:new THREE.Float32BufferAttribute(new Float32Array(32),1),s:0},alley:{faces,uv}};
  const intact=g.o.slice(),tex=uv.array.slice(),hit=vec(.6,11,0),n=vec(0,0,1);
  chipAlleyFace(b,hit,n,1);
  assert.equal(face.hitV,.25);assert(Math.abs(face.hitU-.2)<1e-7);
  const vertices=()=>Array.from({length:8},(_,i)=>[g.o[(i+8)*3],g.o[(i+8)*3+1]]);
  const area=points=>.5*Math.abs(points.reduce((sum,[x,y],i)=>{const [u,v]=points[(i+1)%8];return sum+x*v-y*u;},0));
  const first=area(vertices());assert(first>0);chipAlleyFace(b,hit,n,1);assert(area(vertices())>first*1.8);
  assert.deepEqual(g.a.array,g.o);assert.deepEqual(g.o.slice(48),intact.slice(48));
  assert(Math.abs(uv.getX(8)-(face.pu+face.du*g.o[24]/3))<1e-6);
  chipAlleyFace(b,vec(4.5,12,0),vec(0,0,-1),1);assert(!faces[1].savedPanel);
  resetAlleyFaces(b);assert.deepEqual(g.o,intact);assert.deepEqual(uv.array,tex);
});

test('upper floors start falling later, collision follows their height, and original slabs settle above the terrain',()=>{
  const gy=17;
  const floors=[0,1,2].map(i=>({f0:i,f1:i+1,r0:i,r1:i+1,footing:i,slab:i,remnants:[],pieces:[{begin:i,end:i+1,cx:0,cz:0,ground:gy,leanX:.2,leanZ:0,yaw:.06}],base:i*4,top:(i+1)*4}));
  const v=floors.flatMap(f=>[0,gy+f.top,0]);
  const b={cx:0,cz:0,alley:{floors,gy,hand:1},seg:[segment(v),segment(v)],box:{top:gy+12},top0:gy+12,rh:[gy+1.4]};
  settleAlley(b,.25);assert(b.seg[1].a.array[1]<gy+4);assert.equal(b.seg[1].a.array[7],gy+12);
  settleAlley(b,.9);assert(b.box.top<gy+12&&b.box.top>gy+4);
  settleAlley(b,3,true);
  for(let i=0;i<3;i++)assert(Math.abs(b.seg[1].a.array[i*3+1]-(gy+.46+i*.23))<.001);
});

test('a falling window keeps a masonry edge and both surface normals reset on a retry',()=>{
  const skin=segment(Array.from({length:16},()=>[0,13,0]).flat());
  const detail=segment(Array.from({length:32},()=>[0,13,-.24]).flat());
  const normal=(count)=>new THREE.Float32BufferAttribute(new Float32Array(count*3),3);
  const face={x:0,y:12,z:0,nx:0,nz:1,width:3,height:4,at:0,edgeAt:0,seed:.17,
    edgeNormals:Array.from({length:8},()=>[0,1,0])};
  const floor={base:10,top:14,r0:0,f0:0,f1:16,r1:32,slab:32,footing:32,remnants:[face],pieces:[]};
  const b={cx:0,cz:0,gy:0,st:2,seg:[skin,detail],rh:[.65],alley:{floors:[floor],faces:[face],gy:0,hand:1,
    wallNormals:normal(16),normals:normal(32)},burn:{a:new THREE.Float32BufferAttribute(new Float32Array(16),1),s:0}};
  settleAlley(b,4,true);
  const f=vec().fromBufferAttribute(skin.a,8),e=vec().fromBufferAttribute(detail.a,1);
  // 第二段邊的內外頂點落定後仍有厚度，而且原本朝街的正面轉朝上。
  const inside=vec().fromBufferAttribute(detail.a,6);
  assert(Math.abs(f.distanceTo(inside)-.24)<1e-5);
  assert(f.y<4&&e.y<4);assert(b.alley.wallNormals.getY(8)>.8);assert(b.alley.normals.getZ(6)<-.8);
  resetAlleyFaces(b);
  assert.deepEqual(vec().fromBufferAttribute(b.alley.wallNormals,8).toArray(),[0,0,1]);
  assert.deepEqual(vec().fromBufferAttribute(b.alley.normals,6).toArray(),[0,1,0]);
});

test('a frontage shields a hidden pilot and takes the round fired at the last visible position',()=>{
  const player={pos:vec(24,0,0),vel:vec(0,0,0)};
  let blocked=false,wallDamage=0,playerDamage=0;
  const w={hillsideSite:{},height:()=>0,raycast:(a,b,n)=>{n?.set(-1,0,0);return blocked?.5:-1;},
    bldAt:()=>({alley:{}}),hitBuilding:(p,d)=>{assert.equal(p.x,12);wallDamage+=d;}};
  const c={player,world:w,fx:{muzzle(){},shellTracer(){},explosion(){},impact(){}},audio:{cannon(){},explosion(){}},hurt(){playerDamage++;}};
  const f=new HillsideFront(c,{sec:1}),a={kind:'heavy',active:true,entity:{},pos:vec(0,0,0),weapon:{range:260,cool:3,damage:480},shots:0};
  assert.equal(f.pick(a),f.player);blocked=true;player.pos.x=130;
  const wall=f.pick(a);assert(wall.wall);assert.equal(wall.pos.x,24);
  f.fire(a,wall);assert.equal(f.shots.length,1);f.impacts(1);
  assert(wallDamage>0);assert.equal(playerDamage,0);
  f.clock=5;assert.equal(f.pick(a),null);
});
