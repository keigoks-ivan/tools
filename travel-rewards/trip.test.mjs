import test from 'node:test';
import assert from 'node:assert/strict';
import {usableTransfers,transferInput,transferOutput,combineTransfers,cashValue,flightOptions,hotelOptions,fillTemplate} from './trip-core.mjs';

const cube={from:'cube-credit',to:'asia-miles',in:360,out:1000,min:360,unit:360};
const awards=[
  {id:'asia-miles',cities:{TYO:{Y:9000,C:20000}}},
  {id:'ci-miles',cities:{TYO:{Y:7500,C:15000},LON:null}},
  {id:'ana-miles',cities:{TYO:{Y:12000,C:25000,roundtrip_only:true}}}
];

test('transfer input rounds up to the unit and respects the minimum',()=>{
  assert.equal(transferInput(1000,cube),360);
  assert.equal(transferInput(1001,cube),720);
  assert.equal(transferInput(100,cube),360);
  assert.equal(transferInput(0,cube),0);
  assert.equal(transferOutput(720,cube),2000);
  assert.equal(transferInput(3000,{in:1,out:1,min:3000,unit:500}),3000);
  assert.equal(transferInput(3001,{in:1,out:1,min:3000,unit:500}),3500);
});

test('miles needed scale with passengers and trip type; round-trip-only charts are not doubled',()=>{
  const list=flightOptions({awards,transfers:[],inventory:{resources:[]},city:'TYO',cabin:'Y',pax:2,trip:'roundtrip',today:'2026-10-30'});
  const get=id=>list.find(item=>item.program.id===id);
  assert.equal(get('asia-miles').need.total,36000);
  assert.equal(get('ana-miles').need.total,24000);
  assert.equal(list.every(item=>item.state==='none'),true);
  assert.equal(flightOptions({awards,transfers:[],inventory:{resources:[]},city:'LON',today:'2026-10-30'}).length,0);
});

test('balance decides enough, top-up, or transfer; expired transfers are ignored',()=>{
  const base={awards,city:'TYO',cabin:'Y',pax:1,trip:'oneway',today:'2026-10-30'};
  const enough=flightOptions({...base,transfers:[],inventory:{resources:['ci-miles'],balances:{'ci-miles':8000}}}).find(item=>item.program.id==='ci-miles');
  assert.equal(enough.state,'enough');
  const topup=flightOptions({...base,transfers:[cube],inventory:{resources:['asia-miles','cube-credit'],balances:{'asia-miles':5000,'cube-credit':2000}}}).find(item=>item.program.id==='asia-miles');
  assert.equal(topup.state,'topup');assert.equal(topup.shortfall,4000);assert.equal(topup.routes[0].input,1440);
  const viaBank=flightOptions({...base,transfers:[cube],inventory:{resources:['cube-credit']}}).find(item=>item.program.id==='asia-miles');
  assert.equal(viaBank.state,'transfer');assert.equal(viaBank.routes[0].input,3240);
  const expired=flightOptions({...base,transfers:[{...cube,valid_until:'2026-10-29'}],inventory:{resources:['cube-credit']}}).find(item=>item.program.id==='asia-miles');
  assert.equal(expired.state,'none');
});

test('hotel access uses the highest tier held and points before membership',()=>{
  const list=hotelOptions({programs:[{id:'hilton'},{id:'marriott'},{id:'hyatt'}],transfers:[],inventory:{resources:['hh-silver','marriott-points'],balances:{'marriott-points':50000}},today:'2026-10-30'});
  assert.deepEqual(list.map(item=>[item.program.id,item.state,item.tier]),[['marriott','points',null],['hilton','member','hh-silver'],['hyatt','none',null]]);
  assert.equal(list[0].balance,50000);
});

test('own and partner charts: the cheaper one for the chosen cabin wins',()=>{
  const two=[{id:'ana-miles',cities:{TYO:{options:[{chart:'own',Y:8500,C:24000},{chart:'partner',Y:10000,C:20000}]}}}];
  const base={awards:two,transfers:[],inventory:{resources:[]},city:'TYO',pax:1,trip:'oneway',today:'2026-10-30'};
  const y=flightOptions({...base,cabin:'Y'})[0].need,c=flightOptions({...base,cabin:'C'})[0].need;
  assert.equal(y.option.chart,'own');assert.equal(y.total,8500);assert.equal(y.alts[0].each,10000);
  assert.equal(c.option.chart,'partner');assert.equal(c.total,20000);
});

test('future and card-specific transfer rows are filtered',()=>{
  const rows=[{from:'cube-credit',to:'eva-miles',in:360,out:1000,tier:'normal'},{from:'cube-credit',to:'eva-miles',in:300,out:1000,tier:'world'},{from:'cube-credit',to:'eva-miles',in:400,out:1000,valid_from:'2027-01-01'}];
  assert.deepEqual(usableTransfers(rows,new Set(['cube-credit']),'2026-10-30','eva-miles').map(r=>r.in),[360]);
  assert.deepEqual(usableTransfers(rows,new Set(['cube-credit','cube-world']),'2026-10-30','eva-miles').map(r=>r.in),[300]);
  assert.deepEqual(usableTransfers(rows,new Set(['cube-credit']),'2027-01-02','eva-miles').map(r=>r.in),[360,400]);
});

test('templates drop empty date parameters',()=>{
  const url=fillTemplate('https://example.com/s?q={query}&in={checkin}&out={checkout}',{query:'Tokyo, Japan',checkin:'',checkout:''});
  assert.equal(url,'https://example.com/s?q=Tokyo%2C+Japan');
});

test('several point sources combine when none is enough alone; cheaper ratio goes first',()=>{
  const hsbc={from:'hsbc-travel',to:'eva-miles',in:1,out:1,min:3000,unit:500,sourceBalance:12300};
  const ctbc={from:'ctbc-points',to:'eva-miles',in:5,out:1,min:3000,unit:5,sourceBalance:100000};
  const combo=combineTransfers(20000,[ctbc,hsbc]);
  assert.deepEqual(combo.parts.map(p=>[p.from,p.input,p.output]),[['hsbc-travel',12000,12000],['ctbc-points',40000,8000]]);
  assert.equal(combo.left,0);
  assert.equal(combineTransfers(50000,[ctbc,hsbc]).left,50000-12000-20000);
  const awardsEva=[{id:'eva-miles',cities:{HKT:{Y:20000}}}];
  const item=flightOptions({awards:awardsEva,transfers:[{...hsbc,sourceBalance:undefined},{...ctbc,sourceBalance:undefined}],inventory:{resources:['hsbc-travel','ctbc-points'],balances:{'hsbc-travel':12300,'ctbc-points':60000}},city:'HKT',cabin:'Y',pax:1,trip:'oneway',today:'2026-10-30'})[0];
  assert.equal(item.state,'combo');assert.equal(item.combo.parts.length,2);
});

test('cash value subtracts taxes and divides by miles',()=>{
  assert.equal(cashValue(12000,2000,20000),0.5);
  assert.equal(cashValue(0,0,20000),null);
  assert.equal(cashValue(1000,2000,20000),0);
});
