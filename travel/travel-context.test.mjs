import test from 'node:test';
import assert from 'node:assert/strict';
import {CITIES,PRESETS,schedule} from './planner-core.mjs';
import {transportOptions,transferKey,chosenTransport,routeAssessment} from './travel-context.mjs';
test('cross-sea journeys never offer an all-road charter, in either direction',()=>{
 for(const mainland of ['kl','ipoh','pen'])for(const sabah of ['kk','resort','mountain'])for(const [a,b] of [[mainland,sabah],[sabah,mainland]]){
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
test('environment assessment responds to the chosen resort and mountain stop',()=>{
 assert.ok(routeAssessment([{city:'resort',hotel:'kk-rasa',nights:5}]).some(s=>s.includes('Tuaran')));
 assert.ok(routeAssessment([{city:'resort',hotel:'kk-tanjung',nights:5}]).some(s=>s.includes('工程')));
 assert.ok(routeAssessment([{city:'mountain',nights:2}]).some(s=>s.includes('山路')));
 assert.ok(routeAssessment([{city:'pen',nights:15}]).every(s=>!s.includes('工程')));
});
