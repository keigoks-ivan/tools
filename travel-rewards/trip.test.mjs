import test from 'node:test';
import assert from 'node:assert/strict';
import {usableTransfers,transferInput,transferOutput,combineTransfers,cashValue,flightOptions,hotelOptions,fillTemplate,findCashFee,cashFeeTotals,valueTier,earliestBooking,referencePointCents,hyattNightPoints,tripTotals} from './trip-core.mjs';

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

const fees=[
  {program:'ap-account',chart:'partner',region:'歐洲',cabin:'C',total_twd:5000},
  {program:'ap-account',chart:'own',region:'歐洲',cabin:'C',total_twd:900},
  {program:'sq-miles',chart:'own',region:'歐洲',cabin:'Y',total_twd:null},
  {program:'sq-miles',chart:'partner',region:'歐洲',cabin:'Y',total_twd:4000},
  {program:'ci-miles',chart:'own',region:'東北亞',cabin:'Y',total_twd:1971}
];

test('cash fee follows program, region, cabin and chart; falls back only when the chart has no row',()=>{
  assert.equal(findCashFee(fees,{program:'ap-account',region:'歐洲',cabin:'C',chart:'partner'}).amount,5000);
  assert.equal(findCashFee(fees,{program:'ap-account',region:'歐洲',cabin:'C',chart:'own'}).amount,900);
  const nullOwn=findCashFee(fees,{program:'sq-miles',region:'歐洲',cabin:'Y',chart:'own'});
  assert.equal(nullOwn.amount,null);assert.equal(nullOwn.fallback,false);
  const fallback=findCashFee(fees,{program:'ci-miles',region:'東北亞',cabin:'Y',chart:'partner'});
  assert.equal(fallback.amount,1971);assert.equal(fallback.fallback,true);
  assert.equal(findCashFee(fees,{program:'ci-miles',region:'歐洲',cabin:'Y',chart:'own'}),null);
  assert.equal(findCashFee(fees,{program:'ci-miles',region:'東北亞',cabin:'Y'}).amount,1971);
});

test('cash fee doubles for round trips and multiplies by passengers',()=>{
  assert.deepEqual(cashFeeTotals(1971,{trip:'oneway',roundtripOnly:false,pax:1}),{legs:1,perPerson:1971,total:1971});
  assert.deepEqual(cashFeeTotals(1971,{trip:'roundtrip',roundtripOnly:false,pax:3}),{legs:2,perPerson:3942,total:11826});
  assert.equal(cashFeeTotals(1000,{trip:'oneway',roundtripOnly:true,pax:2}).total,4000);
  assert.equal(cashFeeTotals(null,{trip:'oneway',pax:1}),null);
});

test('value tier compares in whole cents: below cost, up to double, double or more',()=>{
  assert.equal(valueTier(0.24,0.25).tier,'bad');
  assert.equal(valueTier(0.25,0.25).tier,'neutral');
  assert.equal(valueTier(0.49,0.25).tier,'neutral');
  assert.equal(valueTier(0.5,0.25).tier,'ok');
  // 0.1+0.2 一類的浮點誤差不影響邊界
  assert.equal(valueTier(0.1+0.2,0.15).tier,'ok');
  assert.equal(valueTier(0.30000000000000004,0.3).tier,'neutral');
  assert.equal(valueTier(2,0),null);
  assert.equal(valueTier(null,0.25),null);
});

test('earliest booking day uses calendar days of the right chart',()=>{
  const window={own_days:355,partner_days:null};
  assert.deepEqual(earliestBooking({depart:'2027-12-31',chart:'own',window,today:'2026-10-31'}),{kind:'date',date:'2027-01-10',days:355});
  assert.equal(earliestBooking({depart:'2027-03-01',chart:'own',window,today:'2026-10-31'}).kind,'open');
  assert.equal(earliestBooking({depart:'2027-10-31',chart:'own',window:{own_days:365},today:'2026-10-31'}).kind,'open');
  assert.equal(earliestBooking({depart:'2027-11-01',chart:'own',window:{own_days:365},today:'2026-10-31'}).kind,'date');
  assert.equal(earliestBooking({depart:'2027-12-31',chart:'partner',window,today:'2026-10-31'}).kind,'partner-later');
  assert.equal(earliestBooking({depart:'2027-12-31',chart:'own',window:{own_days:null,partner_days:null},today:'2026-10-31'}).kind,'unknown');
  assert.equal(earliestBooking({depart:'2027-12-31',chart:'partner',window:{own_days:360,partner_days:300},today:'2026-10-31'}).days,300);
  assert.equal(earliestBooking({depart:'',chart:'own',window,today:'2026-10-31'}),null);
  // 跨閏日：2028-03-01 往前 360 天
  assert.equal(earliestBooking({depart:'2028-03-01',chart:'own',window:{own_days:360},today:'2026-01-01'}).date,'2027-03-07');
});

test('hotel reference value converts tenths of a US cent to cents of NT$; Hyatt table is category by level',()=>{
  assert.equal(referencePointCents(7,32.555),23);
  assert.equal(referencePointCents(5,32.555),16);
  assert.equal(referencePointCents(7,0),null);
  const table={c1:[3000,4500,6000,7500,9000],c8:[35000,45000,55000,65000,75000]};
  assert.equal(hyattNightPoints(table,8,4),75000);
  assert.equal(hyattNightPoints(table,1,0),3000);
  assert.equal(hyattNightPoints(table,2,0),null);
});

const bankRows=[
  {from:'bank-a',to:'air',in:1,out:1,min:1000,unit:1000,tier:'normal'},
  {from:'bank-a',to:'hotel',in:1,out:1,min:1000,unit:1000,tier:'normal'},
  {from:'bank-b',to:'hotel',in:1,out:1,min:1000,unit:1000,tier:'normal'}
];
const tripReqs=(air,hotel,own={})=>[{key:'flight',label:'機票',target:'air',need:air,own:own.air||0},{key:'hotel',label:'飯店',target:'hotel',need:hotel,own:own.hotel||0}];

test('one bank feeding both flight and hotel is deducted twice',()=>{
  const result=tripTotals({reqs:tripReqs(60000,40000),transfers:bankRows.filter(r=>r.from==='bank-a'),owned:new Set(['bank-a']),balances:{'bank-a':100000},today:'2026-10-31'});
  assert.equal(result.allMet,true);
  const bank=result.banks.find(b=>b.id==='bank-a');
  assert.deepEqual(bank.usedBy,{flight:60000,hotel:40000});
  assert.equal(bank.used,100000);assert.equal(bank.remaining,0);
});

test('shared balance that is not enough reports the gap, flight first, and suggests another bank',()=>{
  const result=tripTotals({reqs:tripReqs(60000,40000),transfers:bankRows.filter(r=>r.from==='bank-a'),owned:new Set(['bank-a']),balances:{'bank-a':80000},today:'2026-10-31'});
  assert.equal(result.allMet,false);
  const [flight,hotel]=result.items;
  assert.equal(flight.left,0);
  assert.equal(hotel.left,20000);
  assert.equal(hotel.parts[0].input,20000);
  assert.equal(hotel.suggest[0].from,'bank-a');
  assert.equal(hotel.suggest[0].gap,20000);
  // 另一家銀行有餘額：飯店改從 bank-b 補，不再差
  const rescued=tripTotals({reqs:tripReqs(60000,40000),transfers:bankRows,owned:new Set(['bank-a','bank-b']),balances:{'bank-a':80000,'bank-b':20000},today:'2026-10-31'});
  assert.equal(rescued.allMet,true);
  assert.equal(rescued.items[1].parts.reduce((n,p)=>n+p.output,0),40000);
});

test('contested bank: the hotel moves to the other bank so both are met',()=>{
  const result=tripTotals({reqs:tripReqs(60000,40000),transfers:bankRows,owned:new Set(['bank-a','bank-b']),balances:{'bank-a':60000,'bank-b':40000},today:'2026-10-31'});
  assert.equal(result.allMet,true);
  assert.equal(result.items[0].parts[0].from,'bank-a');
  assert.equal(result.items[1].parts[0].from,'bank-b');
  assert.equal(result.banks.find(b=>b.id==='bank-a').remaining,0);
});

test('points already in the target account are used before any transfer; no route means the whole need is left',()=>{
  const result=tripTotals({reqs:tripReqs(60000,40000,{air:60000,hotel:15000}),transfers:bankRows.filter(r=>r.from==='bank-a'),owned:new Set(['bank-a']),balances:{'bank-a':30000},today:'2026-10-31'});
  assert.equal(result.items[0].parts.length,0);
  assert.equal(result.items[1].parts[0].input,25000);
  assert.equal(result.banks[0].remaining,5000);
  const none=tripTotals({reqs:tripReqs(10000,0),transfers:[],owned:new Set(),balances:{},today:'2026-10-31'});
  assert.equal(none.items[0].left,10000);assert.equal(none.items[0].hasRoute,false);assert.equal(none.allMet,false);
});
