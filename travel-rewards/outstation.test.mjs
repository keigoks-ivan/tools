import test from 'node:test';
import assert from 'node:assert/strict';
import {TRIP_CITIES} from './trip-cities.mjs';
import {outstationPlans,greatCircle,roundTrip} from './outstation-core.mjs';

const city=id=>TRIP_CITIES.find(c=>c.id===id);
const opt=(chart,Y,extra={})=>({options:[{chart,Y,...extra}]});
const rule=(program,chart,extra={})=>({program,chart,outstation_ok:'yes',stopovers:{roundtrip:2,cost_miles:0},pricing:'zone',outstation_note:'',...extra});
function data({rules,awards,outstation,distanceCharts}){return {stopoverRules:rules,awards,outstation:{awards:{HKG:outstation}},distanceCharts,transfers:[],routes:{HKG:{nonstop:{HKG:['CI','BR','SQ']}}}};}

test('great-circle distance and round-trip pricing',()=>{
  assert.ok(Math.abs(greatCircle(city('HKG'),{lat:25.0797,lng:121.2342})-500)<20);
  assert.equal(roundTrip(opt('partner',30000),'Y').miles,60000);
  assert.equal(roundTrip(opt('partner',50000,{roundtrip_only:true}),'Y').miles,50000);
  assert.equal(roundTrip(opt('own',30000),'Y','partner'),null);
});

test('one outstation ticket is compared with two separate round trips in the same programme',()=>{
  const d=data({rules:[rule('ana-miles','partner',{stopovers:{roundtrip:1,cost_miles:null}})],
    awards:[{id:'ana-miles',name:'ANA',cities:{LON:opt('partner',30000),HKG:opt('partner',10000)}}],
    outstation:{'ana-miles':{LON:opt('partner',30000)}}});
  const [p]=outstationPlans({data:d,cities:TRIP_CITIES,origin:'HKG',city:'LON',cabin:'Y'}).plans;
  assert.equal(p.total,60000);assert.equal(p.separate,80000);assert.equal(p.saving,20000);assert.equal(p.stops,1);
});

test('stopover fees are added per stop, up to two',()=>{
  const d=data({rules:[rule('sq-miles','own',{stopovers:{roundtrip:2,cost_miles:5000}})],
    awards:[{id:'sq-miles',name:'SQ',cities:{LON:opt('own',50000),HKG:opt('own',14500)}}],
    outstation:{'sq-miles':{LON:opt('own',50000)}}});
  const [p]=outstationPlans({data:d,cities:TRIP_CITIES,origin:'HKG',city:'LON',cabin:'Y'}).plans;
  assert.equal(p.fee,10000);assert.equal(p.total,110000);
});

test('distance-priced partner awards are repriced on the real routing via Taipei',()=>{
  const bands={'太平洋區內':[{lo:1001,hi:2000,Y:15000,C:30000},{lo:2001,hi:5000,Y:30000,C:52500}]};
  const d=data({rules:[rule('ap-account','partner',{pricing:'distance',stopovers:{roundtrip:2,cost_miles:5000}})],
    awards:[{id:'ap-account',name:'Aeroplan',cities:{BKK:opt('partner',15000),HKG:opt('partner',8000)}}],
    outstation:{'ap-account':{BKK:opt('partner',15000,{zone:'太平洋區內'})}},distanceCharts:{'ap-account':bands}});
  const [p]=outstationPlans({data:d,cities:TRIP_CITIES,origin:'HKG',city:'BKK',cabin:'Y'}).plans;
  // 香港直飛曼谷約 1,050 英里，經台北約 2,050 英里，跳到 2,001–5,000 級距
  assert.equal(p.total,30000*2+10000);assert.ok(p.saving<0);assert.ok(p.estimate);
});

test('rules that cannot stop in Taipei, or whose stopover leg costs more than the origin, are blocked',()=>{
  const d=data({rules:[rule('ci-miles','own',{outstation_ok:'no',outstation_note:'自家票不能停留'}),rule('eva-miles','partner')],
    awards:[{id:'ci-miles',name:'CI',cities:{}},{id:'eva-miles',name:'EVA',cities:{LON:opt('partner',60000),HKG:opt('partner',10000)}}],
    outstation:{'eva-miles':{LON:opt('partner',52500)}}});
  const r=outstationPlans({data:d,cities:TRIP_CITIES,origin:'HKG',city:'LON',cabin:'Y'});
  assert.equal(r.plans.length,0);
  assert.deepEqual(r.blocked.map(b=>b.program.id),['ci-miles','eva-miles']);
});

test('own-airline awards need that airline to fly Taoyuan to the outstation',()=>{
  const d=data({rules:[rule('sq-miles','own')],awards:[{id:'sq-miles',name:'SQ',cities:{LON:opt('own',50000),HKG:opt('own',14500)}}],outstation:{'sq-miles':{LON:opt('own',50000)}}});
  d.routes.HKG.nonstop.HKG=['CI','BR'];
  const r=outstationPlans({data:d,cities:TRIP_CITIES,origin:'HKG',city:'LON',cabin:'Y'});
  assert.equal(r.plans.length,0);assert.match(r.blocked[0].reason,/新航自家航班沒有飛/);
});
