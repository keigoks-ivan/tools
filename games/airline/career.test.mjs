import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './model.mjs';
import { HUBS, MODES } from './data.mjs';
import { sensibleBot } from './bots.mjs';
import { readCareer, settleCareer, missionChecks, albums, tierProgress } from './career.mjs';

const fake = (routes = [], extra = {}) => ({ routes, company: { pax: routes.reduce((n,r)=>n+r.pax,0), profit: 1, model: 'fsc', idleAircraft: 0, transferPax: 0, ...extra } });
const row = (city='HKG', extra={}) => ({ city, type:'MQ-320', weekly:7, pax:100, profit:1, ...extra });
function settle(state, report) {
  const s=structuredClone(state);s.turn++;
  const out=settleCareer(s,report);s.career=out.career;return {state:s,result:out.result};
}
function planFleet(s, routes) {
  const needed=M.fleetNeeded(s,routes),have=Object.fromEntries(Object.keys(M.AIRCRAFT).map(t=>[t,s.fleet.filter(a=>a.type===t).length]));
  let left=M.fleetLimits(s).ordersLeft;const lease={};
  for(const [t,n] of Object.entries(needed)){const count=Math.min(Math.max(0,n-have[t]),left);if(count){lease[t]=count;left-=count;}}
  return { lease, returnLease:Object.fromEntries(Object.entries(have).filter(([t,n])=>n>(needed[t]||0)).map(([t,n])=>[t,n-(needed[t]||0)])) };
}
test('dispatch boards are deterministic, read only and use legal reachable schedules at every hub',()=>{
  for(const mode of Object.keys(MODES))for(const hub of HUBS){
    const s=M.newGame({mode,hub,seed:1}),before=M.serialize(s),board=M.careerBoard(s);
    assert.equal(board.length,3,`${mode}/${hub}`);assert.deepEqual(board,M.careerBoard(s));assert.equal(M.serialize(s),before);
    for(const m of board){assert.ok(m.turns>0&&m.turns<=3);if(m.plan){const o=M.routeOptions(s,m.city);assert.ok(o.eligibleTypes.includes(m.plan.type));assert.ok(m.plan.weekly<=o.maxWeekly);assert.ok(M.estimateRoute(s,m.city,m.plan.type,m.plan.weekly,m.plan.fare).profit>0);}}
    const late={...s,turn:MODES[mode].turns-1};assert.ok(M.careerBoard(late).every(m=>m.turns===1));
  }
});
test('accept, busy board, invalid offer and abandonment preserve the economic state',()=>{
  const s=M.newGame({seed:1}),offer=M.careerBoard(s)[0],before=M.serialize(s);
  const accepted=M.applyDecisions(s,{mission:offer.id});assert.equal(accepted.errors.length,0);assert.equal(M.serialize(s),before);
  assert.equal(accepted.state.career.active.deadline,3);assert.deepEqual(M.careerBoard(accepted.state),[]);
  assert.ok(M.applyDecisions(accepted.state,{mission:offer.id}).errors.length);assert.ok(M.applyDecisions(s,{mission:'missing'}).errors.length);
  const abandoned=M.applyDecisions(accepted.state,{mission:null});assert.equal(abandoned.errors.length,0);assert.equal(abandoned.state.career.active,null);
  assert.equal(accepted.state.cash,s.cash);assert.deepEqual(accepted.state.fleet,s.fleet);assert.deepEqual(accepted.state.routes,s.routes);
});
test('exploration requires delivered passengers and a profitable route, not a forecast or an empty schedule',()=>{
  let s=M.newGame();s.career.active={kind:'explore',id:'e',city:'HKG',plan:row(),targetPax:250,xp:160,deadline:3,pax:0,profitable:false};
  let out=settle(s,fake([row('HKG',{pax:150,profit:-1})]));s=out.state;
  assert.deepEqual(s.career.active.checks,[false,false]);assert.equal(out.result.mission,null);assert.deepEqual(Object.keys(s.career.stamps),['HKG']);
  out=settle(s,fake([row('HKG',{pax:100,profit:1})]));s=out.state;
  assert.equal(out.result.mission.success,true);assert.equal(s.career.active,null);assert.equal(s.career.completed.length,1);assert.equal(out.result.xp,175);
  const repeat=settleCareer(s,fake([row()]));assert.equal(repeat.result,null);assert.deepEqual(repeat.career,s.career);
});
test('rival missions require seats and profit together, using actual cabin capacity',()=>{
  const m={kind:'rival',city:'HKG',targetSeats:2500},s=M.newGame();
  assert.deepEqual(missionChecks(m,s,fake([row('HKG',{weekly:7,profit:1})])),[false,true]);
  assert.deepEqual(missionChecks(m,s,fake([row('HKG',{weekly:7,profit:-1})],{model:'lcc'})),[true,false]);
  assert.deepEqual(missionChecks(m,s,fake([row('HKG',{weekly:7,profit:1})],{model:'lcc'})),[true,true]);
});
test('network and efficiency goals use one settled turn and require company profit',()=>{
  const s=M.newGame(),m={kind:'network',targetRoutes:2,targetRegions:2,targetTransfer:.05},routes=[row('HKG'),row('LAX')];
  assert.deepEqual(missionChecks(m,s,fake(routes,{transferPax:20,profit:-1})),[true,true,true,false]);
  assert.ok(missionChecks(m,s,fake(routes,{transferPax:20})).every(Boolean));
  assert.deepEqual(missionChecks({kind:'efficiency',targetRoutes:2},s,fake(routes,{idleAircraft:1})),[true,false,true]);
  assert.ok(missionChecks({kind:'efficiency',targetRoutes:2},s,fake(routes)).every(Boolean));
});
test('expiry, last-turn wins and bankruptcy cannot award an unfinished contract',()=>{
  const base=M.newGame();base.career.active={kind:'explore',id:'e',city:'HKG',plan:row(),targetPax:500,xp:160,deadline:1,pax:0,profitable:false};
  let out=settle(base,fake([row()]));assert.equal(out.result.mission.success,false);assert.equal(out.state.career.completed.length,0);assert.equal(out.state.career.active,null);
  out=settle({...base,gameOver:{reason:'bankrupt'}},fake([row('HKG',{pax:1000})]));assert.equal(out.result.mission.success,false);
  out=settle({...base,finished:true},fake([row('HKG',{pax:1000})]));assert.equal(out.result.mission.success,true);
});
test('loss-making companies receive a cash preservation mission with a real loss limit',()=>{
  const s=M.newGame();s.turn=1;s.history=[{profit:-2000000}];
  const m=M.careerBoard(s).find(m=>m.kind==='recovery');assert.ok(m);assert.equal(m.targetLoss,1000000);
  assert.deepEqual(missionChecks(m,s,fake([],{profit:-1500000,cash:1000000})),[false,true,true]);
  assert.deepEqual(missionChecks(m,s,fake([],{profit:-500000,cash:0})),[true,false,true]);
  assert.ok(missionChecks(m,s,fake([],{profit:-500000,cash:1000000})).every(Boolean));
});
test('stamps, album rewards and levels are earned once; no passengers means no stamp',()=>{
  let s=M.newGame();let out=settle(s,fake([row('HKG',{pax:0})],{profit:-1}));s=out.state;assert.equal(out.result.xp,0);assert.deepEqual(s.career.stamps,{});
  out=settle(s,fake([row('HKG'),row('KIX'),row('ICN')]));s=out.state;
  assert.deepEqual(out.result.newAlbums,['asia']);assert.equal(out.result.xp,230);assert.equal(out.result.levelUp,true);assert.equal(albums(s.career.stamps)[0].complete,true);
  out=settle(s,fake([row('HKG'),row('KIX'),row('ICN')]));assert.deepEqual(out.result.newStamps,[]);assert.deepEqual(out.result.newAlbums,[]);assert.equal(out.result.xp,25);
  assert.equal(tierProgress(out.state.career.xp).index,1);assert.equal(tierProgress(5000).progress,1);
});
test('old saves retain flown cities and active mission saves round-trip',()=>{
  const s=M.newGame();delete s.career;s.turn=2;s.history=[{pax:100}];s.routeStats={HKG:{turns:1},BAD:{turns:1}};
  const restored=M.deserialize(M.serialize(s));assert.deepEqual(Object.keys(restored.career.stamps),['HKG']);assert.equal(restored.career.settledTurn,2);assert.equal(readCareer(restored).completed.length,0);
  const fresh=M.newGame(),offer=M.careerBoard(fresh)[0],accepted=M.applyDecisions(fresh,{mission:offer.id}).state;
  assert.deepEqual(M.deserialize(M.serialize(accepted)),accepted);
  const damaged={...accepted,career:{...accepted.career,stamps:true,active:{kind:'broken'}}};
  const repaired=M.deserialize(M.serialize(damaged));assert.equal(repaired.career.active,null);assert.deepEqual(repaired.career.stamps,{});
});
test('optional missions never change passenger demand, revenue, costs or cash at any hub',()=>{
  for(const mode of Object.keys(MODES))for(const hub of HUBS){
    const s=M.newGame({mode,hub,seed:1}),d=sensibleBot()(s),offer=M.careerBoard(s)[0];
    const plain=M.simulateTurn(M.applyDecisions(s,d).state);
    const quest=M.simulateTurn(M.applyDecisions(M.applyDecisions(s,{mission:offer.id}).state,d).state);
    assert.deepEqual(plain.report.company,quest.report.company);assert.deepEqual(plain.report.routes,quest.report.routes);assert.equal(plain.state.cash,quest.state.cash);
  }
});
test('recommended first-flight schedules can complete the contract within its deadline at every hub',()=>{
  for(const mode of Object.keys(MODES))for(const hub of HUBS){
    let s=M.newGame({mode,hub,seed:1});const offer=M.careerBoard(s).find(m=>m.kind==='explore');
    s=M.applyDecisions(s,{mission:offer.id}).state;
    for(let i=0;i<3&&s.career.active;i++){
      const wanted=[offer.plan],fleet=planFleet(s,wanted);
      const routes=M.routeCapacity(s,wanted).fits?wanted:[];
      // Keep existing aircraft during the waiting turn; this contract can still finish before its deadline.
      const out=M.applyDecisions(s,{routes,fleet:routes.length?fleet:{lease:fleet.lease}});assert.equal(out.errors.length,0);
      s=M.simulateTurn(out.state).state;
    }
    assert.ok(s.career.completed.some(m=>m.id===offer.id),`${mode}/${hub}: ${JSON.stringify(s.career)}`);
  }
});
