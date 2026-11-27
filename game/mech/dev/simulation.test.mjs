import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EchoTape,echoFigure,replayShot} from '../sim/tape.mjs';
import {buildExercise} from '../sim/scenery.mjs';
import {SIM_STAGES,HEIGHT,DECK} from '../sim/campaign.mjs';

test('three independent courses build their own collision and moving geometry',()=>{
  for(const stage of SIM_STAGES){
    const district=stage.route.district,root=new THREE.Group(),fixed=[];
    const site=buildExercise({fieldRoute:{district},addCollider:b=>fixed.push(b)},root);
    if(district==='fold'){
      site.setLayer(true);assert.equal(site.city.position.y,HEIGHT);
      assert.ok(fixed.some(b=>b.bottom>0));assert.equal(site.boxes.length,0);
      site.setLayer(false);assert.equal(site.city.rotation.z,0);
    }else if(district==='echo'){
      assert.equal(site.cells.length,2);assert.ok(fixed.some(b=>b.x0<0&&b.x1>0));
    }else{
      assert.equal(site.boxes.length,24);
      site.moveTrains(15);
      for(const train of site.trains){
        const {x,z}=train.train.position;
        assert.equal(site.deckAt(x,z+174),train);assert.equal(site.deckAt(x,z+203),undefined);
        assert.equal(train.boxes[0].top,DECK);
      }
    }
    root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
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
