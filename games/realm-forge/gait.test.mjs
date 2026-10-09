import test from 'node:test';
import assert from 'node:assert/strict';
import { gaitPose } from './gait.mjs';
import { animationPose } from './motion.mjs';
import { World, defaultProject, generateMap } from './core.mjs';

test('infantry feet alternate and mounted troops move diagonal leg pairs in every direction',()=>{
  for(let direction=0;direction<4;direction++){
    const a=gaitPose('soldier',.25,direction),b=gaitPose('soldier',.75,direction);
    assert.equal(a.limbs.length,2);assert.ok(a.limbs[0].swing*a.limbs[1].swing<0);
    assert.ok(a.limbs[0].swing*b.limbs[0].swing<0);
    assert.ok(a.limbs.some(l=>l.lift>=1.8));
    const horse=gaitPose('knight',.25,direction);
    assert.equal(horse.limbs.length,4);assert.equal(horse.limbs[0].swing,horse.limbs[3].swing);
    assert.equal(horse.limbs[1].swing,horse.limbs[2].swing);
    assert.ok(horse.limbs[0].swing*horse.limbs[1].swing<0);
    assert.ok(horse.cut<.7,'animate the horse legs rather than only lifting its hooves');
  }
});
test('a completed cycle is continuous and monks have a separate robe stride',()=>{
  assert.deepEqual(gaitPose('soldier',0),gaitPose('soldier',1));
  const robe=gaitPose('mage',.25),soldier=gaitPose('soldier',.25);
  assert.ok(robe.cut>soldier.cut);assert.ok(Math.abs(robe.limbs[0].swing)<Math.abs(soldier.limbs[0].swing));
  assert.ok(robe.bob<0);assert.ok(robe.limbs.some(l=>l.lift>0));
});
test('every infantry and cavalry direction advances walking frames and stops its gait at arrival',()=>{
  const p=defaultProject();p.rules.ai='off';p.rules.fog=false;p.map=generateMap(64,7);p.map.tiles.fill('grass');
  const w=new World(p);
  for(const id of ['swordsman','archer','knight','monk'])for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
    const u=w.spawn(id,0,{x:30,y:30});u.stance='passive';
    w.command([u.id],{type:'move',x:30+dx*4,y:30+dy*4});
    const frames=new Set();let distance=0;
    for(let i=0;i<120&&u.order;i++){
      w.tick(.05);if(u.moving){const pose=animationPose(u);frames.add(pose.frame);assert.equal(pose.state,'walk');assert.ok(u.moveDistance>=distance);distance=u.moveDistance;}
    }
    assert.ok(frames.size>=3,`${id} ${dx}/${dy} has a visible stride cycle`);
    assert.equal(u.order,null);w.tick(.05);assert.equal(animationPose(u).moving,false);
  }
});
