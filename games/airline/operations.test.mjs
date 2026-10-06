import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './model.mjs';
import { CONST } from './data.mjs';
const route=(weekly=20)=>({city:'NRT',type:'MQ-320',weekly,fare:'mid'});
test('delivery varies by mode, size and financing; express rent stays higher after arrival',()=>{
  for(const mode of ['year','decade']){
    const s=M.newGame({mode}),before=M.serialize(s),q=M.aircraftQuote(s,'MQ-350'),fast=M.aircraftQuote(s,'MQ-350','lease',true);
    assert.equal(q.deliveryTurns,mode==='year'?3:2);assert.equal(fast.deliveryTurns,1);
    assert.equal(M.aircraftQuote(s,'MQ-320').deliveryTurns,mode==='year'?2:1);
    assert.equal(M.aircraftQuote(s,'MQ-320','own').deliveryTurns,2);assert.equal(M.aircraftQuote(s,'MQ-350','own').deliveryTurns,3);
    const out=M.applyDecisions(s,{fleet:{expressLease:{'MQ-350':1}}});assert.deepEqual(out.errors,[]);
    assert.equal(out.state.cash,s.cash-fast.upfront);
    const done=M.simulateTurn(out.state),a=done.state.fleet.at(-1);
    assert.equal(a.rate,fast.rate);assert.equal(a.deposit,fast.deposit);assert.equal(a.deposit+fast.bookingFee,fast.upfront);
    assert.equal(done.report.company.costs.ownership, s.fleet.reduce((n,a)=>n+a.rate,0)*M.MODES[mode].monthsPerTurn+fast.bookingFee);
    assert.equal(M.serialize(s),before);
  }
});
test('standard orders stay unavailable through every waiting turn and persist their promised date',()=>{
  let s=M.applyDecisions(M.newGame(),{fleet:{lease:{'MQ-350':1}}}).state;
  const ready=s.fleetOrders[0].readyTurn;
  for(let t=1;t<=ready;t++){
    s=M.deserialize(M.serialize(s));const out=M.simulateTurn(s);s=out.state;
    assert.equal(s.fleet.filter(a=>a.type==='MQ-350').length,t===ready?1:0);
    assert.equal(out.report.deliveries.length,t===ready?1:0);
    if(t<ready){assert.equal(s.fleetOrders[0].readyTurn,ready);assert.ok(!M.routeCapacity(s,[{city:'LAX',type:'MQ-350',weekly:1,fare:'mid'}]).fits);}
  }
});
test('cancellation accounts for forfeiture once; express handling fee is not refundable',()=>{
  const s=M.newGame(),q=M.aircraftQuote(s,'MQ-320','lease',true);
  const ordered=M.applyDecisions(s,{fleet:{expressLease:{'MQ-320':1}}}).state;
  const cancelled=M.applyDecisions(ordered,{fleet:{cancelOrders:[ordered.fleetOrders[0].id]}}).state;
  assert.equal(cancelled.cash,s.cash-q.bookingFee-q.cancelFee);
  const plain=M.simulateTurn(s),out=M.simulateTurn(cancelled);
  assert.equal(out.report.company.costs.ownership-plain.report.company.costs.ownership,q.bookingFee+q.cancelFee);
  assert.equal(out.state.cash-plain.state.cash,-q.bookingFee-q.cancelFee);
  const legacy={...ordered,fleetOrders:[{...ordered.fleetOrders[0],cancelFee:undefined,bookingFee:undefined,upfront:800000}]};
  assert.equal(M.applyDecisions(legacy,{fleet:{cancelOrders:[legacy.fleetOrders[0].id]}}).state.cash,legacy.cash+800000);
});
test('late standard orders cannot be used; faster leases remain a choice before the final turn',()=>{
  const s=M.newGame();s.turn=9;
  assert.ok(M.applyDecisions(s,{fleet:{lease:{'MQ-350':1}}}).errors.some(e=>e.code==='NO_DELIVERY'));
  assert.deepEqual(M.applyDecisions(s,{fleet:{expressLease:{'MQ-350':1}}}).errors,[]);
  assert.ok(M.applyDecisions({...s,turn:11},{fleet:{expressLease:{'MQ-350':1}}}).errors.some(e=>e.code==='NO_DELIVERY'));
});
test('care changes shared hours and wear; reduced care capacity cannot silently erase schedules',()=>{
  let s=M.applyDecisions(M.newGame(),{routes:[route(23)]}).state;
  const regular=M.fleetReadiness(s)['MQ-320'];assert.ok(regular.nextCondition<regular.condition);
  const aggressive=M.applyDecisions(s,{maintenance:{'MQ-320':'push'}});assert.deepEqual(aggressive.errors,[]);
  assert.ok(M.fleetAvailability(aggressive.state)['MQ-320'].totalHours>M.fleetAvailability(s)['MQ-320'].totalHours);
  assert.ok(M.fleetReadiness(aggressive.state)['MQ-320'].nextCondition<regular.nextCondition);
  const refused=M.applyDecisions(s,{maintenance:{'MQ-320':'care'}});
  assert.ok(refused.errors.some(e=>e.code==='CARE_CAPACITY'));assert.deepEqual(refused.state.routes,s.routes);assert.equal(refused.state.maintenance['MQ-320'],undefined);
  const cared=M.applyDecisions(s,{routes:[route(14)],maintenance:{'MQ-320':'care'}});assert.deepEqual(cared.errors,[]);
  assert.equal(M.fleetAvailability(cared.state)['MQ-320'].totalHours,154*.88);
  assert.ok(M.fleetReadiness(cared.state)['MQ-320'].nextCondition>=regular.condition);
});
test('worn fleets lose departures and pay compensation; care repairs them without rewriting the report',()=>{
  const s=M.applyDecisions(M.newGame(),{routes:[route(20)]}).state;s.fleetCondition['MQ-320']=70;
  const before=M.serialize(s),worn=M.simulateTurn(s),fresh=M.simulateTurn({...s,fleetCondition:{'MQ-320':100}});
  assert.ok(worn.report.routes[0].technicalCancel>.05);assert.ok(worn.report.routes[0].flownWeekly<20);
  assert.ok(worn.report.company.revenue<fresh.report.company.revenue);
  assert.ok(worn.report.company.costs.overhead>fresh.report.company.costs.overhead);
  assert.equal(worn.report.routes[0].reasonKey,'maintenance');assert.equal(M.serialize(s),before);
  const cared=M.applyDecisions(s,{maintenance:{'MQ-320':'care'},routes:[route(14)]}).state;
  assert.ok(M.simulateTurn(cared).state.fleetCondition['MQ-320']>70);
  assert.ok(M.estimateRoute(s,'NRT','MQ-320',20).technicalCancel>.05);
});
test('construction dates survive reload, activate once, and reject projects too late to use',()=>{
  let s=M.newGame(),cash=s.cash;s=M.applyDecisions(s,{facilities:['depot']}).state;
  assert.equal(s.cash,cash-6000000);assert.equal(M.fleetLimits(s).maxFleet,6);
  for(let i=1;i<=3;i++){
    s=M.deserialize(M.serialize(s));const out=M.simulateTurn(s);s=out.state;
    assert.equal(M.fleetLimits(s).maxFleet,i===3?10:6);assert.deepEqual(out.report.facilityCompletions,i===3?['depot']:[]);
    assert.equal(out.report.company.facilityRunning,0);
  }
  const duplicate=M.applyDecisions(s,{facilities:['depot']});assert.equal(duplicate.state.cash,s.cash);
  const out=M.simulateTurn(s);assert.deepEqual(out.report.facilityCompletions,[]);assert.equal(out.report.company.facilityRunning,25000);
  const late=M.newGame();late.turn=10;
  assert.ok(M.applyDecisions(late,{facilities:['lounge']}).errors.some(e=>e.code==='NO_COMPLETION'));
});
test('technical cancellations conserve prepaid fuel rather than consuming cancelled departures',()=>{
  const s=M.applyDecisions(M.newGame(),{routes:[route(20)]}).state;
  s.reserve={kg:1e9,unitPrice:CONST.fuelPriceUsdPerKg};s.fleetCondition['MQ-320']=70;
  const fresh=M.simulateTurn({...s,fleetCondition:{'MQ-320':100}}),worn=M.simulateTurn(s);
  assert.ok(worn.state.reserve.kg>fresh.state.reserve.kg);
  const actualKg=worn.report.routes[0].flownWeekly*2*M.MODES.year.weeksPerTurn*M.blockHoursFor(M.AIRCRAFT['MQ-320'],M.distanceKm(M.CITIES.TPE,M.CITIES.NRT))*M.AIRCRAFT['MQ-320'].fuelPerBlockHour;
  assert.ok(Math.abs(s.reserve.kg-worn.state.reserve.kg-.3*actualKg)<1e-6);
});
