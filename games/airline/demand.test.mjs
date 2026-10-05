import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, CONST, MODES, AIRCRAFT, HUBS } from './data.mjs';
import { OBSERVED_MARKETS } from './demand-data.mjs';
import * as M from './model.mjs';

test('official traffic: exact totals, capacity, source, symmetry, no double counting', () => {
  const d=M.distanceKm(CITIES.TPE,CITIES.LAX), p=M.marketProfile(CITIES.TPE,CITIES.LAX,d);
  assert.equal(p.annualPax,995840);assert.equal(p.annualSeats,1365065);
  assert.equal(p.year,2025);assert.equal(p.source,'tw-caa');assert.equal(p.kind,'observed');
  assert.equal(p.weeklyPax,995840/52);assert.equal(p.weeklySeats,1365065/52);
  assert.equal(p,M.marketProfile(CITIES.LAX,CITIES.TPE,d));
  assert.ok(Math.abs(p.historicalLF-.73)<.001);
  assert.equal(Object.keys(OBSERVED_MARKETS).length,1493);
  for(const [key,[pax,seats,year,source]] of Object.entries(OBSERVED_MARKETS)){
    assert.ok(pax>0 && (!seats || seats>=pax),key);
    assert.ok([2024,2025].includes(year));assert.ok(M.DEMAND_SOURCES[source]);
    assert.equal(key,key.split('-').sort().join('-'));
  }
});

test('all 16,110 airport pairs have finite symmetric baselines and exact range eligibility', () => {
  const cities=Object.values(CITIES);let count=0;
  for(let i=0;i<cities.length;i++)for(let j=i+1;j<cities.length;j++){
    const a=cities[i],b=cities[j],d=M.distanceKm(a,b),p=M.marketProfile(a,b,d);
    assert.ok(Number.isFinite(p.weeklyPax)&&p.weeklyPax>0,`${a.id}/${b.id}`);
    assert.ok(Number.isFinite(p.weeklySeats)&&p.weeklySeats>=p.weeklyPax);
    assert.equal(p,M.marketProfile(b,a,d));
    if(p.kind==='estimated'){assert.equal(p.annualPax,null);assert.equal(p.source,null);assert.equal(p.historicalLF,null);}
    for(const [from,to] of [[a,b],[b,a]])for(const mode of Object.keys(MODES)){
      const s={...M.newGame({mode,seed:1}),hub:from.id,rivals:[],marketRivalBase:{}};
      const o=M.routeOptions(s,to.id);
      assert.deepEqual(o.eligibleTypes,MODES[mode].types.filter(t=>AIRCRAFT[t].rangeKm>=d));
      for(const model of ['fsc','lcc']){
        for(const type of o.eligibleTypes){
          const e=M.estimateRoute({...s,model},to.id,type,3,'mid');
          for(const k of ['lf','pax','seats','revenue','cost','profit'])assert.ok(Number.isFinite(e[k]),`${from.id}/${to.id}/${model}/${k}`);
          assert.ok(e.lf>=0&&e.lf<=1&&e.pax<=e.seats);
        }
      }
    }
    count++;
  }
  assert.equal(count,16110);
});

test('capacity changes reduce load; historical occupancy is not a player load floor', () => {
  const s=M.newGame({mode:'year',hub:'TPE',seed:1});s.rivals=[];
  const a=M.estimateRoute(s,'LAX','MQ-350',3,'mid'),b=M.estimateRoute(s,'LAX','MQ-350',14,'mid');
  assert.ok(b.pax>a.pax);assert.ok(b.lf<a.lf);
  assert.ok(M.estimateRoute(s,'LAX','MQ-350',3,'high').lf<a.lf);
  assert.ok(M.estimateRoute(s,'LAX','MQ-350',3,'low').lf>a.lf);
  const tiny=Object.entries(OBSERVED_MARKETS).find(([key,v])=>key.includes('TPE')&&v[1]&&v[0]/v[1]<.4);
  if(tiny){const city=tiny[0].split('-').find(id=>id!=='TPE');assert.ok(M.estimateRoute(s,city,'MQ-350',28,'mid').lf<.4);}
});

test('initial named rivals share the historical capacity rather than duplicating it', () => {
  for(const hub of HUBS)for(const mode of Object.keys(MODES)){
    const s=M.newGame({hub,mode,seed:1});
    for(const city of Object.keys(s.marketRivalBase)){
      const o=M.routeOptions(s,city);
      assert.equal(o.otherSeatsPerWeek,Math.round(o.market.weeklySeats),`${hub}/${mode}/${city}`);
    }
  }
});

test('demand shocks act immediately, incumbent supply responds later and persists through saves', () => {
  const s=M.newGame({mode:'year',hub:'TPE',seed:1});s.plan={};s.rivals=[];
  const st=M.applyDecisions(s,{routes:[{city:'NRT',type:'MQ-320',weekly:7,fare:'mid'}]}).state;
  const before=M.routeOptions(st,'NRT');
  const shocked=structuredClone(st);shocked.mods.push({kind:'demand',seg:'all',start:0,seq:[.4,.4,.4]});
  const current=M.routeOptions(shocked,'NRT');
  assert.equal(current.otherSeatsPerWeek,before.otherSeatsPerWeek);
  assert.ok(Math.abs(current.estMarketPaxPerWeek/before.estMarketPaxPerWeek-.4)<.001);
  const snap=M.serialize(shocked),out=M.simulateTurn(shocked);
  assert.equal(M.serialize(shocked),snap);
  assert.ok(out.state.marketSupply.NRT<1&&out.state.marketSupply.NRT>=.96);
  assert.ok(M.routeOptions(out.state,'NRT').otherSeatsPerWeek<current.otherSeatsPerWeek);
  assert.deepEqual(M.simulateTurn(M.deserialize(M.serialize(out.state))),M.simulateTurn(out.state));
  assert.deepEqual(M.deserialize(JSON.stringify({...s,marketSupply:undefined})).marketSupply,{});
  // A half-year compounds monthly response; output remains bounded.
  const decade={...shocked,mode:'decade',totalTurns:20};
  const next=M.simulateTurn(decade).state;
  assert.ok(next.marketSupply.NRT>=.76&&next.marketSupply.NRT<out.state.marketSupply.NRT);
});

test('separate connecting traffic stays inside its reserved historical market and spare seats', () => {
  const s=M.newGame({mode:'decade',hub:'TPE',seed:1});s.plan={};s.rivals=[];
  const st=M.applyDecisions(s,{routes:[{city:'LAX',type:'MQ-350',weekly:7,fare:'mid'},{city:'BKK',type:'MQ-320',weekly:7,fare:'mid'},{city:'KUL',type:'MQ-320',weekly:7,fare:'mid'}],fleet:{lease:{'MQ-350':3,'MQ-320':2}}}).state;
  const out=M.simulateTurn(st).report;
  for(const r of out.routes){
    const l=M._internals.evalLocal(st,M._internals.buildCtx(st),st.routes.find(x=>x.city===r.city));
    assert.ok(r.transferPax<=Math.ceil(l.transferReserve*MODES.decade.weeksPerTurn));
    assert.ok(r.lf<=1);assert.ok(r.pax<=r.seats);
  }
  assert.ok(out.company.transferPax>0);assert.equal(CONST.connectionReserve,.15);
});
