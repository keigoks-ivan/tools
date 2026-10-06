import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './model.mjs';

const order = (s,type='MQ-320',n=1) => M.applyDecisions(s,{fleet:{lease:{[type]:n}}});
const codes = out => out.errors.map(e=>e.code);
test('availability matches shared scheduling hours, excludes pending orders and follows business model',()=>{
  const s=M.newGame(),before=M.serialize(s),type='MQ-320';
  const routes=['HKG','NRT','ICN'].map(city=>({city,type,weekly:3,fare:'mid'}));
  const a=M.fleetAvailability(s,routes)[type];
  const hours=routes.reduce((n,r)=>n+2*r.weekly*M.blockHoursFor(M.AIRCRAFT[type],M.distanceKm(M.CITIES[s.hub],M.CITIES[r.city])),0);
  assert.equal(a.totalHours,154);assert.equal(a.usedHours,hours);assert.equal(a.remainingHours,154-hours);
  assert.equal(a.unassigned,2-M.fleetNeeded(s,routes)[type]);assert.equal(a.missing,0);
  const queued=order(s,'MQ-350').state,waiting=M.fleetAvailability(queued,[])['MQ-350'];
  assert.equal(waiting.delivered,0);assert.equal(waiting.pending,1);assert.equal(waiting.totalHours,0);
  const overloaded=M.fleetAvailability(s,[{city:'NRT',type,weekly:28,fare:'mid'}])[type];
  assert.equal(overloaded.unassigned,0);assert.equal(overloaded.remainingHours,0);assert.ok(overloaded.missing>0);
  assert.equal(M.fleetAvailability({...s,model:'lcc'},[])[type].totalHours,175);
  assert.equal(M.fleetAvailability(s,[])[type].unassigned,2);assert.equal(M.serialize(s),before);
});
test('lease deposit reserves cash immediately; only delivered aircraft can fly',()=>{
  const s=M.newGame(),before=M.serialize(s),q=M.aircraftQuote(s,'MQ-350');
  const out=order(s,'MQ-350');assert.deepEqual(out.errors,[]);
  assert.equal(out.state.cash,s.cash-q.upfront);assert.equal(q.upfront,2*q.rate);
  assert.equal(out.state.fleet.length,2);assert.equal(out.state.fleetOrders.length,1);
  const routes=[{city:'LAX',type:'MQ-350',weekly:1,fare:'mid'}];
  assert.ok(codes(M.applyDecisions(out.state,{routes})).includes('INSUFFICIENT_FLEET'));
  const delivered=M.simulateTurn(out.state);
  assert.equal(delivered.report.company.costs.ownership,800000);
  assert.equal(delivered.state.fleet.length,3);assert.equal(delivered.state.fleetOrders.length,0);
  assert.equal(delivered.state.fleet.at(-1).deposit,q.upfront);
  assert.deepEqual(M.applyDecisions(delivered.state,{routes}).errors,[]);
  assert.equal(M.serialize(s),before);
});
test('quota spans separate decisions, survives cancellation and save, resets only on settlement',()=>{
  for(const mode of ['year','decade']){
    let s=M.newGame({mode}),limits=M.fleetLimits(s);
    s=order(s,'MQ-320',limits.ordersPerTurn).state;
    assert.ok(codes(order(M.deserialize(M.serialize(s)))).includes('ORDER_LIMIT'));
    const cash=s.cash,id=s.fleetOrders[0].id,upfront=s.fleetOrders[0].upfront;
    const cancelled=M.applyDecisions(s,{fleet:{cancelOrders:[id]}});
    assert.deepEqual(cancelled.errors,[]);assert.equal(cancelled.state.cash,cash+upfront);
    assert.equal(M.fleetLimits(cancelled.state).ordersLeft,0);
    assert.ok(codes(order(cancelled.state)).includes('ORDER_LIMIT'));
    s=M.simulateTurn(cancelled.state).state;assert.equal(M.fleetLimits(s).ordersLeft,limits.ordersPerTurn);
  }
});
test('pending orders consume fleet capacity; a completed depot expands both capacities',()=>{
  let s=M.newGame();s=order(s,'MQ-320',2).state;s=M.simulateTurn(s).state;
  s=order(s,'MQ-320',2).state;
  assert.equal(M.fleetLimits(s).committed,6);assert.ok(codes(order(s)).includes('FLEET_LIMIT'));
  s=M.simulateTurn(s).state;assert.ok(codes(order(s)).includes('FLEET_LIMIT'));
  const built=M.applyDecisions(s,{facilities:['depot']});assert.deepEqual(built.errors,[]);
  assert.equal(M.fleetLimits(built.state).maxFleet,10);assert.equal(M.fleetLimits(built.state).maxRoutes,12);
  assert.deepEqual(order(built.state).errors,[]);
  const d=M.newGame({mode:'decade'});assert.equal(M.fleetLimits(d).maxFleet,10);
  assert.equal(M.fleetLimits({...d,facilities:{depot:1}}).maxFleet,16);
});
test('destination cap and pooled flying hours apply even with abundant cash',()=>{
  const s=M.newGame();s.cash=1e12;
  const cities=['KHH','RMQ','HUN','MZG','KNH','HKG','MFM','XMN','FOC'];
  const routes=cities.map(city=>({city,type:'MQ-320',weekly:1,fare:'mid'}));
  assert.equal(M.routeCapacity(s,routes).routeLimit,true);
  assert.ok(codes(M.applyDecisions(s,{routes})).includes('ROUTE_LIMIT'));
  assert.deepEqual(M.applyDecisions(s,{routes:routes.slice(0,8)}).errors,[]);
  const busy=[{city:'NRT',type:'MQ-320',weekly:28,fare:'mid'}];
  assert.ok(codes(M.applyDecisions(s,{routes:busy})).includes('INSUFFICIENT_FLEET'));
  assert.equal(order(s,'MQ-350',3).state.fleetOrders.length,0);
});
test('purchases commit down payment now; loan and depreciation start after delivery',()=>{
  const s=M.newGame({mode:'decade'}),q=M.aircraftQuote(s,'MQ-320','own');
  const o=M.applyDecisions(s,{fleet:{buy:{'MQ-320':1}}});assert.deepEqual(o.errors,[]);
  assert.equal(o.state.cash,s.cash-q.upfront);assert.equal(o.state.fleet.filter(a=>a.kind==='own').length,0);
  const delivered=M.simulateTurn(o.state);assert.equal(delivered.report.company.costs.interest,0);
  const own=delivered.state.fleet.find(a=>a.kind==='own');assert.equal(own.loan,q.price-q.upfront);assert.equal(own.book,q.price);
  const running=M.simulateTurn(delivered.state);assert.ok(running.report.company.costs.interest>0);
  assert.ok(running.state.fleet.find(a=>a.kind==='own').book<q.price);
  const broke=order({...s,cash:1});assert.ok(codes(broke).includes('NO_CASH'));assert.equal(broke.state.cash,1);assert.equal(broke.state.fleetOrders.length,0);
});
test('return refunds exactly the paid deposit; cancellation cannot mint cash',()=>{
  const s=M.simulateTurn(order(M.newGame(),'MQ-350').state).state,a=s.fleet.at(-1);
  const returned=M.applyDecisions(s,{fleet:{returnLease:{'MQ-350':1}}});assert.deepEqual(returned.errors,[]);
  assert.equal(returned.state.cash,s.cash+a.deposit);assert.equal(returned.state.pending.ownershipCash,2*a.rate);
  const id=order(M.newGame()).state.fleetOrders[0].id;
  const queued=order(M.newGame()).state,cash=queued.cash,upfront=queued.fleetOrders[0].upfront;
  const cancelled=M.applyDecisions(queued,{fleet:{cancelOrders:[id,id]}});
  assert.ok(codes(cancelled).includes('BAD_ORDER'));assert.equal(cancelled.state.cash,cash+upfront);
});
test('legacy saves retain their fleet and routes; above-cap fleets cannot keep expanding',()=>{
  const legacy=M.newGame();delete legacy.fleetOrders;delete legacy.nextOrder;delete legacy.orderTurn;delete legacy.orderedThisTurn;
  legacy.fleet=Array.from({length:12},(_,i)=>({...legacy.fleet[0],id:i+1}));legacy.nextAc=13;
  legacy.routes=['HKG','MNL','NRT','KIX','ICN','PVG','PEK','SIN','BKK'].map(city=>({city,type:'MQ-320',weekly:1,fare:'mid',age:2}));
  const restored=M.deserialize(M.serialize(legacy));assert.deepEqual(restored.fleet,legacy.fleet);assert.deepEqual(restored.routes,legacy.routes);
  assert.deepEqual(restored.fleetOrders,[]);assert.ok(codes(order(restored)).includes('FLEET_LIMIT'));
  assert.deepEqual(M.applyDecisions(restored,{routes:restored.routes}).errors,[]);
  assert.ok(codes(M.applyDecisions(restored,{routes:restored.routes.concat({city:'CTS',type:'MQ-320',weekly:1,fare:'mid'})})).includes('ROUTE_LIMIT'));
});
test('final-turn orders are disabled because they cannot arrive during the game',()=>{
  for(const mode of ['year','decade']){const s=M.newGame({mode});s.turn=M.MODES[mode].turns-1;assert.ok(codes(order(s)).includes('NO_DELIVERY'));}
});
