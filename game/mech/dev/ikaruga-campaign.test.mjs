import test from 'node:test';
import assert from 'node:assert/strict';
import {IKARUGA_STAGES} from '../ikaruga/campaign.mjs';
import {prepareStages} from '../combat.js';
import {fieldHeight} from '../battlefields.js';
import {STAGE_DATA} from '../stages.js';
import {LandingFront} from '../landing-front.mjs';
import {LANDING} from '../landing-layout.mjs';

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
    for(const [x,z] of stage.route.pts)assert.equal(Math.abs(fieldHeight(x,z,'tokyo',stage.route)),0);
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
