import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './model.mjs';
import { sensibleBot, play, summarise } from './bots.mjs';
import { FACILITIES, newClock, advanceClock, turnSeconds, scenarioProgress, fuelOrder } from './v2.mjs';
import { HUBS, MODES } from './data.mjs';
const setup = () => {
  const s = M.newGame({ mode: 'decade', seed: 1 });
  const dec = sensibleBot()(s);
  return M.applyDecisions(s, dec).state;
};
test('playback speed, pause, frame partitioning and settlement boundaries', () => {
  const clock = { ...newClock(), running: true };
  assert.equal(advanceClock(clock, 15, 'year').elapsed, 15);
  assert.equal(advanceClock({ ...clock, speed: 4 }, 15, 'year').elapsed, 60);
  assert.equal(advanceClock({ ...clock, running: false }, 15, 'year').elapsed, 0);
  assert.equal(advanceClock(clock, 15, 'year', true).elapsed, 0);
  let c=clock;for(let i=0;i<600;i++)c=advanceClock(c,.1,'year');
  assert.ok(Math.abs(c.elapsed-60)<1e-9);
  assert.equal(advanceClock(clock,1000,'year').running,false);
  assert.equal(advanceClock(clock,NaN,'year').elapsed,0);
  assert.equal(turnSeconds('decade'),90);
});
const completed = (s,id) => {
  const ordered=M.applyDecisions(s,{facilities:[id]});assert.deepEqual(ordered.errors,[]);
  let built=ordered.state,normal=s;
  while(built.facilityOrders.length){
    assert.equal(built.facilities[id],undefined);
    const n=M.simulateTurn(normal),b=M.simulateTurn(built);
    assert.equal(b.report.company.facilityRunning,0);assert.equal(b.report.company.facilityDep,0);
    normal=n.state;built=b.state;
  }
  return {normal,built};
};
test('facilities: capital is paid once; benefits and depreciation wait until completion', () => {
  const s=setup(),before=M.serialize(s),r=M.applyDecisions(s,{facilities:['depot']});
  assert.equal(s.cash-r.state.cash,FACILITIES.depot.cost);assert.equal(M.serialize(s),before);
  assert.equal(M.applyDecisions(r.state,{facilities:['depot']}).state.cash,r.state.cash);
  const pair=completed(s,'depot'),normal=M.simulateTurn(pair.normal),built=M.simulateTurn(pair.built);
  assert.ok(Math.abs(built.report.company.costs.maintenance/normal.report.company.costs.maintenance-.7)<.001);
  assert.equal(built.report.company.facilityRunning,150000);assert.equal(built.report.company.facilityDep,300000);
  assert.equal(built.state.facilities.depot.book,5700000);
  assert.ok(M.applyDecisions(s,{facilities:['missing']}).errors.length);
  assert.ok(M.applyDecisions({...s,cash:0},{facilities:['depot']}).errors.length);
  const legacy=JSON.parse(before);delete legacy.facilities;delete legacy.reserve;delete legacy.scenario;
  const restored=M.deserialize(JSON.stringify(legacy));assert.deepEqual(restored.facilities,{});assert.equal(restored.reserve.kg,0);
});
test('completed lounge wins business passengers, with no low-cost demand bonus', () => {
  const {normal,built}=completed(setup(),'lounge'),plain=M.simulateTurn(normal).report,up=M.simulateTurn(built).report;
  assert.ok(up.company.revenue>plain.company.revenue);
  assert.equal(M.simulateTurn({...normal,model:'lcc'}).report.company.revenue,M.simulateTurn({...built,model:'lcc'}).report.company.revenue);
});
test('fuel storage cannot be used during construction; completed storage prepays only once', () => {
  const s=setup();s.hedge.frac=0;
  const pending=M.applyDecisions(s,{facilities:['tank']}).state;
  assert.ok(M.applyDecisions(pending,{buyFuel:true}).errors.some(e=>e.code==='NO_TANK'));
  const tank=completed(s,'tank').built,order=fuelOrder(tank),bought=M.applyDecisions(tank,{buyFuel:true});
  assert.equal(bought.errors.length,0);assert.ok(Math.abs(tank.cash-bought.state.cash-order.cost)<1e-6);
  assert.ok(M.applyDecisions(bought.state,{buyFuel:true}).errors.length);
  const report=M.simulateTurn(bought.state),plain=M.simulateTurn(tank);
  assert.ok(report.report.company.fuelPrepaid>0);assert.equal(report.state.reserve.kg,0);
  assert.ok(Math.abs((report.state.cash-plain.state.cash)-(report.report.company.profit-plain.report.company.profit))<2);
  const shock={kind:'fuel',start:tank.turn,seq:[2]};
  assert.ok(M.simulateTurn({...bought.state,mods:[...bought.state.mods,shock]}).report.company.costs.fuel<M.simulateTurn({...tank,mods:[...tank.mods,shock]}).report.company.costs.fuel);
});
test('optional facilities remain modest investments across hubs and both modes', () => {
  for(const mode of Object.keys(MODES))for(const hub of HUBS){
    const inner=sensibleBot();
    const bot=(s,last)=>({...inner(s,last),facilities:s.turn===0?['depot','lounge','tank']:[]});
    const result=summarise(play(bot,{mode,hub,seed:1}));
    assert.ok(result.margin>=.01&&result.margin<=.12,`${mode}/${hub}: ${result.margin}`);
    assert.ok(result.cash>0);
  }
  const idle=play(s=>({facilities:s.turn===0?['depot','lounge','tank']:[]}),{mode:'year',hub:'TPE',seed:1});
  assert.ok(idle.end.profit<0);
});
test('scenario goals use settled history and require a completed game', () => {
  const res=play(sensibleBot({budget:2,types:['MQ-320'],minLF:.62}),{mode:'year',hub:'TPE',seed:1});res.state.scenario='margin';
  assert.deepEqual(res.errors,[]); // The challenge is winnable through the delivery queue and fleet cap.
  assert.ok(scenarioProgress(res.state).complete);
  assert.equal(scenarioProgress({...res.state,finished:false}).complete,false);
  const state={...res.state,scenario:'network',mode:'decade',history:[{pax:1000,transferPax:80}],routes:Array(5).fill({}),totals:{revenue:100,profit:1},finished:true};
  assert.ok(scenarioProgress(state).complete);
  assert.equal(scenarioProgress({...state,gameOver:{}}).complete,false);
  assert.equal(scenarioProgress({...state,history:[{pax:1000,transferPax:0}]}).complete,false);
});
