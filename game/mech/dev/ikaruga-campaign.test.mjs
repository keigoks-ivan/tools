import test from 'node:test';
import assert from 'node:assert/strict';
import {IKARUGA_STAGES} from '../ikaruga/campaign.mjs';
import {prepareStages} from '../combat.js';
import {fieldHeight} from '../battlefields.js';
import {STAGE_DATA} from '../stages.js';
import {LandingFront} from '../landing-front.mjs';
import {LANDING} from '../landing-layout.mjs';
import {World} from '../env.js';
import {Group,Vector3} from 'three';
import {buildTokyo} from '../ikaruga/tokyo.mjs';

test('Ikaruga visits six distinct Tokyo districts before joining the Kobe landing',()=>{
  const stages=prepareStages(IKARUGA_STAGES);
  assert.equal(stages.length,7);
  const districts=['lock','tsukuda','toyosu','rail','wakasu','aomi'];
  const routes=new Set();
  for(const [i,stage] of stages.slice(0,6).entries()){
    assert.equal(stage.battlefield,'tokyo');
    assert.equal(stage.route.district,districts[i]);
    assert.equal(stage.enc.secs.length,7);
    assert.deepEqual(stage.enc.cp,[2,4,6]);
    assert.ok(stage.enc.len>=1000);
    assert.ok(stage.enc.secs.every((s,i,all)=>s.waves.length && (!i || all[i-1].s<s.s)));
    assert.ok(stage.enc.secs.some(s=>s.boss));
    for(const [x,z] of stage.route.pts)if(z<=116)assert.equal(Math.abs(fieldHeight(x,z,'tokyo',stage.route)),0);
    routes.add(JSON.stringify(stage.route.pts));
  }
  assert.equal(routes.size,6);
  const last=stages.at(-1);
  assert.equal(last.frontline,'landing');
  assert.equal(last.route,STAGE_DATA.find(d=>d.frontline==='landing').route);
  assert.equal(last.pilot,'斑鳩');
});

test('Ikaruga leads the left breach while the Kobe pilot can choose either flank',()=>{
  for(const pilot of ['斑鳩','蒼焰']){
    const pos={x:-67,z:LANDING.southGap};
    const front=new LandingFront({player:{pos},def:{pilot}},{sec:1});
    front.phase='seawall';
    front.wallGuards={left:[],right:[]};
    front.wallMarkers=['left','right'];
    front.stepBattle=()=>{};
    front.crossWall=lane=>{front.lane=lane;};
    assert.deepEqual(front.waypoints,pilot==='斑鳩'?['left']:['left','right']);
    front.update(.016);
    assert.equal(front.lane,pilot==='斑鳩'?null:'right');
    pos.z=LANDING.northGap;
    front.update(.016);
    assert.equal(front.lane,'left');
  }
});


test('Tokyo firing lanes expose the posted machines, not scenery; the harbour route has a walkable floor',()=>{
  for(const stage of IKARUGA_STAGES.slice(0,6)){
    const r=stage.route,world=Object.create(World.prototype),group=new Group();
    Object.assign(world,{A:{},fieldRoute:r,height:(x,z)=>fieldHeight(x,z,'tokyo',r),boxes:[],grid:new Map(),cellSize:60,battlefield:'tokyo'});
    buildTokyo(world,group);
    for(const [i,sector] of r.secs.entries()){
      const [x,z]=r.pts[i===0?0:r.secs[i-1].at],eye=new Vector3(x,world.support(x,z,1,3)+13,z);
      const posts=[...(sector.posts||[])];
      if(sector.boss?.post)posts.push(sector.boss.post);
      if(!i)assert.ok(posts.length);
      for(const post of posts)for(const side of post.slide?[-1,0,1]:[0]){
        const aim=new Vector3(post.x+(post.slide||0)*side,(post.y??0)+12,post.z);
        assert.ok(eye.distanceTo(aim)>=600 && eye.distanceTo(aim)<=1200,stage.name);
        assert.equal(world.raycast(eye,aim,null),-1,stage.name);
      }
    }
    // Sample the whole walking route, including both ramps, the deck and its underside.
    if(r.district==='wakasu')for(let k=1;k<r.pts.length;k++){
      const [a,b]=r.pts[k-1],[x,z]=r.pts[k],steps=Math.ceil(Math.hypot(x-a,z-b)/2);
      for(let j=0;j<=steps;j++){
        const v=new Vector3(a+(x-a)*j/steps,0,b+(z-b)*j/steps);v.y=world.support(v.x,v.z,1,3);
        assert.ok(v.y>=0,'gap in maintenance platform');
        assert.ok(!world.collide(v,3,v.y),'obstructed platform');
      }
    }
    if(r.district==='lock'||r.district==='aomi'){
      const b=world.boxes.find(box=>box.penetrable);
      assert.ok(b?.top>10);
      b.hit(2);assert.ok(b.top>10);
      b.hit(2);assert.ok(b.top<0);
      world.tokyoTraffic.reset(0);assert.ok(b.top>10);
    }
  }
});

test('disabling the shore cannon releases Ikaruga’s following craft before destroying the machine',()=>{
  for(const pilot of ['斑鳩','蒼焰']){
    const f=new LandingFront({player:{pos:new Vector3()},def:{pilot},lines:()=>{}},{sec:0});
    f.site={fleetReleased:false,fleetRun:0};
    const cannon={disabled:false};
    f.shoreCannon={entity:{dead:false,components:{cannon}}};
    f.escortFire();assert.equal(f.site.fleetReleased,false);
    cannon.disabled=true;f.escortFire();assert.equal(f.site.fleetReleased,pilot==='斑鳩');
    f.shoreCannon.entity.dead=true;f.escortFire();assert.equal(f.site.fleetReleased,true);
  }
});
