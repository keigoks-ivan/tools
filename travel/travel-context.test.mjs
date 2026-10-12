import test from 'node:test';
import assert from 'node:assert/strict';
import {CITIES,PRESETS,schedule} from './planner-core.mjs';
import {transportOptions,transferKey,chosenTransport,routeAssessment,suggestedTransfers,cityContext} from './travel-context.mjs';
test('cross-sea journeys never offer an all-road charter, in either direction',()=>{
 for(const mainland of ['kl','ipoh','pen','penres'])for(const sabah of ['kk','resort'])for(const [a,b] of [[mainland,sabah],[sabah,mainland]]){
  const options=transportOptions(a,b);assert.ok(options.length);assert.ok(options.every(o=>o.id!=='alphard'&&o.id!=='rail'&&o.id!=='ferry'));
 }
});
test('all presets and reverse inland journeys have usable transport comparisons',()=>{
 for(const [, ,rows] of PRESETS){const legs=schedule(rows.map(([city,nights],i)=>({id:String(i),city,nights})));for(let i=1;i<legs.length;i++)assert.ok(transportOptions(legs[i-1].city,legs[i].city).length);}
 for(const a of Object.keys(CITIES))for(const b of Object.keys(CITIES))assert.deepEqual(transportOptions(a,b).map(o=>o.id),transportOptions(b,a).map(o=>o.id));
});
test('a saved transport follows its leg but cannot leak into a changed origin or destination',()=>{
 const previous={city:'kl'},leg={id:'same-stop',city:'pen'},choices={[transferKey(previous,leg)]:'alphard'};
 assert.equal(chosenTransport(previous,leg,choices).id,'alphard');
 assert.equal(chosenTransport({city:'resort'},leg,choices),null);
 assert.equal(chosenTransport(previous,{...leg,city:'resort'},choices),null);
 assert.equal(chosenTransport(previous,leg),null);
 assert.equal(chosenTransport(previous,leg,{[transferKey(previous,leg)]:'unsupported'}),null);
});
test('environment assessment responds to the chosen nearby resort',()=>{
 assert.ok(routeAssessment([{city:'resort',hotel:'kk-magellan',nights:5}]).some(s=>s.includes('泳池')));
 assert.ok(routeAssessment([{city:'resort',hotel:'kk-tanjung',nights:5}]).some(s=>/施工|工程/.test(s)&&s.includes('2027/7')));

 assert.ok(routeAssessment([{city:'pen',nights:15}]).every(s=>!s.includes('工程')));
});

test('the Teluk Bahang resort stop has context, usable transport and a suggested Alphard in both directions',()=>{
 for(const c of Object.keys(CITIES))assert.ok(cityContext[c]?.season&&cityContext[c].infrastructure&&cityContext[c].decision,c);
 for(const [a,b] of [['pen','penres'],['kl','penres'],['penres','kl'],['penres','kk']])assert.ok(transportOptions(a,b).length,`${a}-${b}`);
 assert.match(transportOptions('penres','kl')[0].detail,/Angsana/);assert.match(transportOptions('penres','kl')[1].detail,/約 1 小時，飛的話要多轉一次車/);assert.equal(transportOptions('kl','pen')[0].id,'alphard');assert.match(transportOptions('kl','pen')[0].time,/4\.5 小時/);
 const legs=schedule([{id:'a',city:'pen',nights:7},{id:'b',city:'penres',nights:4},{id:'c',city:'kl',nights:4}]);
 assert.deepEqual(suggestedTransfers(legs),{'kl:pen:a':'alphard','pen:penres:b':'alphard','penres:kl:c':'alphard'});
 const sabah=schedule([{id:'a',city:'kk',nights:7},{id:'b',city:'resort',nights:4},{id:'c',city:'kl',nights:4}]);
 assert.deepEqual(suggestedTransfers(sabah),{'kl:kk:a':'flight','resort:kl:c':'flight'});
 assert.ok(routeAssessment(legs.map(l=>({...l,hotel:l.fixed?'kl-mea':'pen-angsana'}))).some(s=>s.includes('Teluk Bahang')));
 assert.ok(routeAssessment([{city:'penres',hotel:'pen-hardrock',nights:4}]).some(s=>s.includes('2027/2/15')));
});
