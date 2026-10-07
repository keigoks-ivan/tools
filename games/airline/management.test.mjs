import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './model.mjs';
const codes=out=>out.errors.map(e=>e.code);
const settle=s=>M.simulateTurn(s);
const orderCrew=(s,type,n=1)=>M.applyDecisions(s,{personnel:{hire:{[type]:n}}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<.01,`${a} != ${b}`);
function reconciles(co){
  const f=co.cashFlow;
  near(f.opening+f.aircraft+f.staff+f.fuel+f.financing+f.operating+f.debtPayments+f.leaseDeferral,f.closing);
  near(Math.round(f.closing),co.cash);
}

test('starter fleet is staffed; three routes share two aircraft and two qualified rotating rosters',()=>{
  for(const mode of ['year','decade']){
    const s=M.newGame({mode}),before=M.serialize(s),routes=['HKG','NRT','ICN'].map(city=>({city,type:'MQ-320',weekly:3,fare:'mid'}));
    assert.equal(M.crewAvailability(s)['MQ-320'].ready,2);
    assert.equal(M.routeCapacity(s,routes).fits,true);
    assert.deepEqual(M.applyDecisions(s,{routes}).errors,[]);
    assert.equal(M.serialize(s),before);
  }
});
test('an express delivered aircraft cannot fly without its own completed type training',()=>{
  let s=M.newGame(),q=M.crewQuote(s,'MQ-350');
  s=M.applyDecisions(s,{fleet:{expressLease:{'MQ-350':1}}}).state;
  s=orderCrew(s,'MQ-350').state;
  assert.equal(s.crewOrders[0].readyTurn,2);assert.equal(s.crews['MQ-350']||0,0);
  const first=settle(s);s=first.state;assert.equal(s.fleet.length,3);assert.equal(first.report.crewCompletions.length,0);
  const routes=[{city:'LAX',type:'MQ-350',weekly:1,fare:'mid'}];
  const blocked=M.applyDecisions(s,{routes});assert.ok(codes(blocked).includes('INSUFFICIENT_CREW'));
  assert.deepEqual(blocked.state.routes,[]);assert.equal(M.routeCapacity(s,routes).crewMissing['MQ-350'],1);
  assert.equal(M.crewAvailability(s,routes)['MQ-320'].ready,2,'narrowbody staff cannot cover widebody');
  const next=settle(s);s=next.state;assert.equal(next.report.crewCompletions[0].type,'MQ-350');
  assert.equal(s.crews['MQ-350'],1);assert.equal(s.crewOrders.length,0);
  assert.deepEqual(M.applyDecisions(s,{routes}).errors,[]);assert.equal(q.trainingTurns,2);
});
test('fixed salaries remain while idle; training cash is expensed once and starts payroll after completion',()=>{
  const s=M.newGame(),q=M.crewQuote(s,'MQ-350'),ordered=orderCrew(s,'MQ-350');
  const control=settle(s),first=settle(ordered.state);
  near(ordered.state.cash,s.cash-q.fee);
  near(first.state.cash,control.state.cash-q.fee);
  near(first.report.company.costs.labour-control.report.company.costs.labour,Math.round(q.fee));
  assert.ok(control.report.company.costs.labour>0);assert.equal(control.report.company.fixedPayroll,control.report.company.costs.labour);
  const second=settle(first.state),third=settle(second.state);
  assert.equal(second.report.company.fixedPayroll,control.report.company.fixedPayroll);
  assert.equal(third.report.company.fixedPayroll,Math.round(control.report.company.fixedPayroll+q.monthly));
  reconciles(first.report.company);reconciles(second.report.company);reconciles(third.report.company);
});
test('intensive aircraft scheduling still needs sufficient crew hours',()=>{
  const s=M.newGame();s.maintenance['MQ-320']='push';
  const route=Array.from({length:28},(_,i)=>({city:'NRT',type:'MQ-320',weekly:i+1,fare:'mid'})).find(r=>{
    const c=M.routeCapacity(s,[r]);return !Object.keys(c.missing).length&&c.crewMissing['MQ-320'];
  });
  assert.ok(route);assert.equal(M.routeCapacity(s,[route]).fits,false);
  assert.ok(codes(M.applyDecisions(s,{routes:[route]})).includes('INSUFFICIENT_CREW'));
  const trained=settle(orderCrew(s,'MQ-320').state).state;
  assert.equal(M.routeCapacity(trained,[route]).fits,true);
});
test('release requires spare staff, charges severance once and removes future payroll',()=>{
  const s=M.newGame(),busy=M.applyDecisions(s,{routes:[{city:'NRT',type:'MQ-320',weekly:23,fare:'mid'}]}).state;
  assert.ok(codes(M.applyDecisions(busy,{personnel:{release:{'MQ-320':1}}})).includes('CREW_IN_USE'));
  const q=M.crewQuote(s,'MQ-320'),out=M.applyDecisions(s,{personnel:{release:{'MQ-320':1}}});
  assert.deepEqual(out.errors,[]);assert.equal(out.state.crews['MQ-320'],1);near(out.state.cash,s.cash-2*q.monthly);
  const rep=settle(out.state);near(rep.report.company.fixedPayroll,Math.round(q.monthly));
  near(rep.state.cash,s.cash-2*q.monthly-q.monthly-800000-470000);reconciles(rep.report.company);
});
test('training cancellations cannot refund twice or create money; dates and quotas cannot be bypassed',()=>{
  const s=M.newGame(),q=M.crewQuote(s,'MQ-350'),o=orderCrew(s,'MQ-350'),id=o.state.crewOrders[0].id;
  const out=M.applyDecisions(o.state,{personnel:{cancelOrders:[id,id]}});
  assert.ok(codes(out).includes('BAD_CREW'));near(out.state.cash,s.cash-q.fee*.5);assert.equal(out.state.crewOrders.length,0);
  reconciles(settle(out.state).report.company);
  assert.ok(codes(orderCrew({...s,cash:1},'MQ-350')).includes('NO_CASH'));
  assert.ok(codes(orderCrew(s,'MQ-350',40)).includes('CREW_LIMIT'));
  for(const mode of ['year','decade']){const late=M.newGame({mode});late.turn=M.MODES[mode].turns-1;assert.ok(codes(orderCrew(late,'MQ-320')).includes('NO_TRAINING'));}
});
test('defensive simulation cannot operate crewless schedules loaded or injected outside the decision API',()=>{
  const s=M.newGame();s.crews['MQ-320']=0;s.routes=[{city:'HKG',type:'MQ-320',weekly:7,fare:'mid',age:2}];
  const out=settle(s);assert.equal(out.report.company.revenue,0);assert.deepEqual(out.report.routes,[]);
  assert.ok(out.report.company.costs.ownership>0);reconciles(out.report.company);
});
test('new lease commitments shorten over time; old contracts are not retroactively lengthened',()=>{
  for(const mode of ['year','decade']){
    let s=M.newGame({mode});const q=M.aircraftQuote(s,'MQ-320');
    s=M.applyDecisions(s,{fleet:{lease:{'MQ-320':1}}}).state;
    for(let i=0;i<q.deliveryTurns;i++)s=settle(s).state;
    const a=s.fleet.at(-1),early=M.leaseReturnQuote(s,a);
    assert.equal(early.remainingMonths,mode==='year'?12:36);near(early.fee,a.rate*early.remainingMonths*.25);
    const later=M.leaseReturnQuote({...s,turn:s.turn+1},a);assert.ok(later.remainingMonths<early.remainingMonths);
    near(M.leaseReturnQuote({...s,turn:Math.ceil(a.leaseUntilMonth/M.MODES[mode].monthsPerTurn)},a).fee,0);
    const legacy={...a};delete legacy.leaseUntilMonth;near(M.leaseReturnQuote(s,legacy).fee,2*a.rate);
    assert.equal(M.aircraftQuote(s,'MQ-350','lease',true).leaseMonths,3);
  }
});
test('legacy saves honour delivered and already ordered aircraft with free roster migration',()=>{
  const s=M.applyDecisions(M.newGame(),{fleet:{lease:{'MQ-350':1}}}).state;
  delete s.crews;delete s.crewOrders;delete s.nextCrewOrder;delete s.cashLedger;delete s.pending.staffPaid;
  const restored=M.deserialize(M.serialize(s));assert.deepEqual(restored.fleet,s.fleet);assert.deepEqual(restored.routes,s.routes);
  assert.equal(restored.cash,s.cash);assert.equal(restored.crews['MQ-320'],2);assert.equal(restored.crewOrders[0].fee,0);
  let ready=restored;for(let i=0;i<3;i++)ready=settle(ready).state;
  assert.equal(ready.crews['MQ-350'],1);assert.equal(ready.fleet.length,3);
  assert.deepEqual(M.deserialize(M.serialize(ready)),ready);
});
test('cash movements reconcile order deposits, construction, staffing, operations and loan principal',()=>{
  let s=M.newGame({mode:'decade'});
  const d={fleet:{buy:{'MQ-320':1}},personnel:{hire:{'MQ-320':1}},facilities:['depot'],routes:[{city:'HKG',type:'MQ-320',weekly:7,fare:'mid'}]};
  s=M.applyDecisions(s,d).state;assert.ok(M.cashCommitments(s).future>M.cashCommitments(s).current);
  for(let i=0;i<4;i++){const out=settle(s);s=out.state;reconciles(out.report.company);near(out.report.company.commitments.current,M.cashCommitments(s).current);if(i===0){assert.ok(out.report.company.cashFlow.aircraft<0);assert.ok(out.report.company.cashFlow.staff<0);}if(i===3)assert.ok(out.report.company.cashFlow.debtPayments<0);}
});
test('legacy intensive schedules receive enough roster hours to preserve their committed flights',()=>{
  const s=M.newGame();s.maintenance['MQ-320']='push';
  s.routes=[{city:'NRT',type:'MQ-320',weekly:24,fare:'mid',age:2}];delete s.crews;delete s.crewOrders;
  assert.equal(M.routeCapacity(s,s.routes).fits,true,'read-only legacy planning is staffed');
  const restored=M.deserialize(M.serialize(s));assert.equal(restored.crews['MQ-320'],3);
  assert.deepEqual(restored.routes,s.routes);assert.deepEqual(M.applyDecisions(restored,{routes:restored.routes}).errors,[]);
  assert.equal(settle(restored).report.routes[0].weekly,24);
});
