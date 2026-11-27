import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3,Matrix4} from 'three';
import {KL_STAGES} from '../kl/campaign.mjs';
import {buildKL} from '../kl/district.mjs';
import {prepareStages} from '../combat.js';
import {World} from '../env.js';

test('all seven Kuala Lumpur routes have seven reachable sectors and a convoy that resumes at checkpoints',()=>{
  const stages=prepareStages(KL_STAGES);
  assert.equal(new Set(stages.map(s=>s.route.district)).size,7);
  for(const stage of stages){
    const route=stage.route,enc=stage.enc,world=Object.create(World.prototype),root=new Group();
    Object.assign(world,{A:{},fieldRoute:route,height:()=>0,boxes:[],grid:new Map(),cellSize:60});
    buildKL(world,root);
    assert.ok(enc.len>=1500,stage.name);
    assert.equal(enc.secs.length,7);assert.deepEqual(enc.cp,[2,4,6]);
    assert.ok(enc.secs.every((s,i)=>s.waves.length && (!i || s.s>enc.secs[i-1].s)));
    assert.equal(enc.secs.at(-1).s,enc.len);
    assert.ok(root.children.length<32,stage.name+' static draw budget');
    for(let i=1;i<route.pts.length;i++){
      const [a,b]=route.pts[i-1],[x,z]=route.pts[i],steps=Math.ceil(Math.hypot(x-a,z-b)/4);
      for(let j=0;j<=steps;j++){
        const v=new Vector3(a+(x-a)*j/steps,0,b+(z-b)*j/steps);
        assert.ok(!world.collide(v,3,0),stage.name+' obstructed at '+v.toArray());
      }
    }
    const fleet=root.getObjectByName('末班車隊'),m=new Matrix4();
    assert.equal(fleet.count,4);fleet.getMatrixAt(0,m);const start=m.clone();
    world.klConvoy.update(12,0,false);fleet.getMatrixAt(0,m);assert.ok(m.equals(start));
    world.klConvoy.update(12,1,false);fleet.getMatrixAt(0,m);assert.ok(!m.equals(start));
    world.klConvoy.reset(0);fleet.getMatrixAt(0,m);assert.ok(m.equals(start));
  }
});
