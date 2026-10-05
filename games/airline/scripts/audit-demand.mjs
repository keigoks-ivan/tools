// Exhaustive airport-pair audit. Run from the repository: node games/airline/scripts/audit-demand.mjs
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { CITIES, MODES, AIRCRAFT, HUBS } from '../data.mjs';
import { newGame, routeOptions, estimateRoute, distanceKm, marketProfile } from '../model.mjs';
import { sensibleBot, naiveBot, idleBot, play, summarise } from '../bots.mjs';

const ids = Object.keys(CITIES).sort(), rows = [];
const configs = ['year-fsc','year-lcc','decade-fsc','decade-lcc'];
const head = ['from','to','distance_km','traffic_basis','year','source','annual_pax_both_directions','annual_seats_both_directions','historical_load',
  'baseline_weekly_pax','baseline_weekly_seats',...configs.flatMap(c=>['type','weekly_roundtrips','estimated_load','profit_usd_per_turn'].map(k=>c+'_'+k))];
const stats = Object.fromEntries(configs.map(c=>[c,{reachable:0,profitable:0,loads:[]}])) ;
let checks = 0, observed = 0;
for (const from of ids) {
  const states = configs.map(c=>{const [mode,model]=c.split('-');return {...newGame({mode,hub:HUBS.includes(from)?from:'TPE',seed:1}),hub:from,model,rivals:[],routes:[],marketSupply:{},marketRivalBase:{}};});
  for (const to of ids) {
    if (from === to) continue;
    const d = distanceKm(CITIES[from],CITIES[to]), p = marketProfile(CITIES[from],CITIES[to],d);
    assert.equal(p, marketProfile(CITIES[to],CITIES[from],d));
    assert.ok(Number.isFinite(p.weeklyPax) && p.weeklyPax>0 && Number.isFinite(p.weeklySeats) && p.weeklySeats>=p.weeklyPax);
    if(p.kind==='observed')observed++;
    const row = [from,to,Math.round(d),p.kind,p.year??'',p.source??'',p.annualPax??'',p.annualSeats??'',p.historicalLF?.toFixed(5)??'',p.weeklyPax.toFixed(2),p.weeklySeats.toFixed(2)];
    states.forEach((s,index)=>{
      const o=routeOptions(s,to);assert.deepEqual(o.eligibleTypes,MODES[s.mode].types.filter(t=>AIRCRAFT[t].rangeKm>=d));
      let best=null;
      for(const type of o.eligibleTypes)for(const weekly of [1,2,3,4,5,7,10,14,21,28]){
        if(weekly>o.maxWeekly)continue;
        const e=estimateRoute(s,to,type,weekly,'mid');checks++;
        for(const k of ['lf','pax','seats','revenue','cost','profit'])assert.ok(Number.isFinite(e[k]),`${from}/${to}/${k}`);
        assert.ok(e.lf>=0&&e.lf<=1&&e.pax<=e.seats);
        if(!best||e.profit>best.profit)best={type,weekly,...e};
      }
      if(best){
        const stat=stats[configs[index]];stat.reachable++;stat.profitable+=best.profit>0;stat.loads.push(best.lf);
        row.push(best.type,best.weekly,best.lf.toFixed(5),Math.round(best.profit));
      }else row.push('unreachable','','','');
    });
    rows.push(row);
  }
}
assert.equal(rows.length,32220);
for(const s of Object.values(stats)){s.loads.sort((a,b)=>a-b);s.medianLoad=s.loads[Math.floor(s.loads.length/2)];delete s.loads;}
const calibration=[];
for(const hub of HUBS)for(const mode of Object.keys(MODES))for(const seed of [1,2,3,4]){
  const sensible=summarise(play(sensibleBot(),{hub,mode,seed}));
  const r={hub,mode,seed,sensible};
  if(seed===1){r.naive=summarise(play(naiveBot(),{hub,mode,seed}));r.idle=summarise(play(idleBot(),{hub,mode,seed}));r.lcc=summarise(play(sensibleBot({model:'lcc'}),{hub,mode,seed}));}
  calibration.push(r);
}
const summary={version:17,pairs:rows.length/2,directions:rows.length,observedPairs:observed/2,estimatedPairs:(rows.length-observed)/2,forecastsChecked:checks,
  conditions:'Turn 0, seed 1, mid fare, no named rivals, no transfer traffic, empty network; best profit among eligible types and sampled frequencies. Both directions and four mode/model combinations. Non-playable hubs are hypothetical with neutral yield. Not an exhaustive fare/frequency optimisation or proof of existing service/traffic rights.',stats,calibration};
const out=new URL('../design/demand/',import.meta.url);
writeFileSync(new URL('all-pairs.csv',out),'\uFEFF'+[head,...rows].map(r=>r.join(',')).join('\n')+'\n');
writeFileSync(new URL('audit.json',out),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({pairs:summary.pairs,directions:summary.directions,observedPairs:summary.observedPairs,forecastsChecked:checks,stats},null,2));
