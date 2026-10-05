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
test('facilities: capital, depreciation, running costs, pure state and old saves', () => {
  const s = setup(), before = M.serialize(s);
  const r=M.applyDecisions(s,{facilities:['depot']});assert.equal(r.errors.length,0);
  assert.equal(s.cash-r.state.cash,FACILITIES.depot.cost);assert.equal(M.serialize(s),before);
  const normal=M.simulateTurn(s),built=M.simulateTurn(r.state);
  assert.ok(Math.abs(built.report.company.costs.maintenance/normal.report.company.costs.maintenance-.7)<.001);
  assert.equal(built.report.company.facilityRunning,150000);
  assert.equal(built.report.company.facilityDep,300000);
  assert.equal(built.state.facilities.depot.book,5700000);
  assert.equal(M.applyDecisions(r.state,{facilities:['depot']}).state.cash,r.state.cash);
  assert.ok(M.applyDecisions(s,{facilities:['missing']}).errors.length);
  assert.ok(M.applyDecisions({...s,cash:0},{facilities:['depot']}).errors.length);
  const legacy=JSON.parse(before);delete legacy.facilities;delete legacy.reserve;delete legacy.scenario;
  const restored=M.deserialize(JSON.stringify(legacy));assert.deepEqual(restored.facilities,{});assert.equal(restored.reserve.kg,0);
});
test('lounge wins more business passengers, but does not increase low-cost demand', () => {
  const s=setup(),built=M.applyDecisions(s,{facilities:['lounge']}).state;
  const normal=M.simulateTurn(s).report,up=M.simulateTurn(built).report;
  assert.ok(up.company.revenue>normal.company.revenue);
  const lcc={...s,model:'lcc'},lccBuilt={...built,model:'lcc'};
  assert.equal(M.simulateTurn(lcc).report.company.revenue,M.simulateTurn(lccBuilt).report.company.revenue);
});
test('fuel storage: prepayment is spent once, capacity is finite, and higher spot price is cushioned', () => {
  const s=setup();s.hedge.frac=0;
  const tank=M.applyDecisions(s,{facilities:['tank']}).state,order=fuelOrder(tank);
  const bought=M.applyDecisions(tank,{buyFuel:true});assert.equal(bought.errors.length,0);
  assert.ok(Math.abs(tank.cash-bought.state.cash-order.cost)<1e-6);
  assert.ok(M.applyDecisions(bought.state,{buyFuel:true}).errors.length);
  assert.ok(M.applyDecisions(s,{buyFuel:true}).errors.length);
  const report=M.simulateTurn(bought.state);
  assert.ok(report.report.company.fuelPrepaid>0);assert.equal(report.state.reserve.kg,0);
  const plain=M.simulateTurn(tank);
  // Once the prepaid stock is consumed, the cash difference equals the profit difference.
  // The spot price has deterministic noise; stored fuel remains at the purchase price.
  assert.ok(Math.abs((report.state.cash-plain.state.cash)-(report.report.company.profit-plain.report.company.profit))<2);
  const shock={kind:'fuel',start:0,seq:[2]};
  const low=M.simulateTurn({...bought.state,mods:[...bought.state.mods,shock]}).report;
  const high=M.simulateTurn({...tank,mods:[...tank.mods,shock]}).report;
  assert.ok(low.company.costs.fuel<high.company.costs.fuel);
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
  const res=play(sensibleBot(),{mode:'year',hub:'TPE',seed:1});res.state.scenario='margin';
  assert.ok(scenarioProgress(res.state).complete);
  assert.equal(scenarioProgress({...res.state,finished:false}).complete,false);
  const state={...res.state,scenario:'network',mode:'decade',history:[{pax:1000,transferPax:80}],routes:Array(5).fill({}),totals:{revenue:100,profit:1},finished:true};
  assert.ok(scenarioProgress(state).complete);
  assert.equal(scenarioProgress({...state,gameOver:{}}).complete,false);
  assert.equal(scenarioProgress({...state,history:[{pax:1000,transferPax:0}]}).complete,false);
});
