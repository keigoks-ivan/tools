import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EchoTape,echoFigure,replayShot} from '../sim/tape.mjs';
import {buildExercise} from '../sim/scenery.mjs';
import {World} from '../env.js';
import {foldedSolids} from '../sim/fold-architecture.mjs';
import {SIM_STAGES,HEIGHT,DECK} from '../sim/campaign.mjs';

test('five independent courses build their own collision and moving geometry',()=>{
  assert.deepEqual(SIM_STAGES.map(s=>s.route.district),['fold','echo','rail','dock','summit']);
  for(const stage of SIM_STAGES){
    const district=stage.route.district,root=new THREE.Group(),fixed=[];
    const site=buildExercise({fieldRoute:{district},addCollider:b=>fixed.push(b)},root);
    if(district==='fold'){
      site.setLayer(true);assert.equal(site.city.position.y,HEIGHT);
      assert.ok(fixed.some(b=>b.bottom>0));assert.equal(site.boxes.length,0);
      site.setLayer(false);assert.equal(site.city.rotation.z,0);
    }else if(district==='echo'){
      assert.equal(site.cells.length,2);assert.ok(fixed.some(b=>b.x0<0&&b.x1>0));
    }else if(district==='rail'){
      assert.equal(site.boxes.length,24);
      site.moveTrains(15);
      for(const train of site.trains){
        const {x,z}=train.train.position;
        assert.equal(site.deckAt(x,z+174),train);assert.equal(site.deckAt(x,z+203),undefined);
        assert.equal(train.boxes[0].top,DECK);
      }
    }else if(district==='dock'){
      assert.equal(site.boxes.length,3);assert.ok(fixed.length>0);
      const world=Object.create(World.prototype);
      Object.assign(world,{grid:new Map(),cellSize:60,boxes:[],height:()=>0,exerciseSite:site});
      const feet=new THREE.Vector3(-44,0,100);
      assert.equal(world.collide(feet,3,0),true);
      site.lift(1,21);feet.set(-44,0,100);assert.equal(world.collide(feet,3,0),false);
      assert.equal(site.gates[1].group.position.y,21);
      assert.deepEqual(site.boxes.map(b=>b.bottom),[0,21,0]);
      assert.ok(site.boxes.every(b=>!fixed.includes(b)));
    }else{
      assert.equal(site.boxes.length,0);
      assert.ok(fixed.some(b=>b.top===35&&b.x0<90&&b.x1>90&&b.z0<156&&b.z1>156));
      assert.ok(fixed.some(b=>b.top>80&&b.x0<0&&b.x1>0&&b.z0<132&&b.z1>132));
    }
    root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
  }
});
test('folded skybridge stays open below its deck and mirrors into the opposite grid cells',()=>{
  const site={boxes:[]},solids=foldedSolids(site),world=Object.create(World.prototype);
  Object.assign(world,{grid:new Map(),cellSize:60,boxes:[],height:()=>0});
  solids.register([
    {x0:80,x1:96,z0:20,z1:34,bottom:0,top:36},
    {x0:80,x1:96,z0:50,z1:64,bottom:0,top:31},
    {x0:85,x1:91,z0:32,z1:52,bottom:19,top:24},
  ],true);
  for(const b of site.boxes)world.addCollider(b);
  function ray(x1,x2,y,z){return world.raycast(new THREE.Vector3(x1,y,z),new THREE.Vector3(x2,y,z));}
  for(const upper of [true,false,true]){
    solids.orient(upper);
    const x=upper?1:-1,Y=y=>upper?y:HEIGHT-y;
    assert.equal(ray(64*x,110*x,Y(8),42),-1);
    assert.ok(ray(64*x,110*x,Y(21),42)>0);
    assert.ok(ray(64*x,110*x,Y(8),28)>0);
    assert.equal(ray(-64*x,-110*x,Y(21),42),-1);
  }
});
test('echo preserves both endpoints on long recordings and interpolates across yaw wrap',()=>{
  const tape=new EchoTape(),p={pos:new THREE.Vector3(),yaw:3.1};
  const rig=new THREE.Group(),hipL=new THREE.Group(),hipR=new THREE.Group();rig.add(hipL,hipR);
  const leg=new THREE.Mesh(new THREE.BoxGeometry());hipL.add(leg);
  const figure=echoFigure(new THREE.Group(),{root:rig,bones:{hipL,hipR},meshes:[leg]});
  tape.recordPose(0,p);p.pos.x=10;p.yaw=-3.1;tape.recordPose(1,p);
  tape.pose(.5,figure);assert.equal(figure.position.x,5);assert.ok(Math.abs(figure.rotation.y)>3);
  for(let i=2;i<18000;i++){p.pos.x=i;tape.recordPose(i*.14,p);}
  tape.recordPose(2600,p,true);
  assert.ok(tape.frames.length<=512);assert.equal(tape.frames[0].t,0);
  tape.pose(3100,figure);assert.equal(figure.position.x,17999);figure.userData.release();
});
test('echo replay intersects a live defender and respects the nearer wall',()=>{
  const dir=new THREE.Vector3(0,0,1),origin=new THREE.Vector3(0,8,0);
  const guard={m:{capsule:()=>({x:0,z:50,r:3,y0:4,y1:11})}};
  const damage=[];let blocked=false;
  const C={enc:{mine:[guard]},world:{raycast:()=>blocked?.01:-1},fx:{beam(){},impact(){}},damageEnemy:(target,hp)=>damage.push([target,hp])};
  replayShot(C,{origin,dir,damage:80});blocked=true;replayShot(C,{origin,dir,damage:80});
  assert.deepEqual(damage,[[guard,80]]);
});
