import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,presetForStops,schedule,validRoute,ageFit,evidence,commuteHours,quotedBudget,routeWarnings,restrictSabahScope} from './planner-core.mjs';
import {joinCampData} from './camp-options.mjs';
import {readFileSync} from 'node:fs';
test('all supported presets preserve the fixed week, total 22 nights and Feb 8 checkout',()=>{
 for(const [id,,rows] of PRESETS){const stops=rows.map(([city,nights],i)=>({id:String(i),city,nights}));assert.equal(validRoute(stops),true,id);const legs=schedule(stops);assert.equal(legs[0].start,'2027-01-17');assert.equal(legs[0].end,'2027-01-24');assert.equal(legs.at(-1).end,'2027-02-08',id);assert.equal(legs.reduce((n,s)=>n+s.nights,0),22);}
});
test('excess nights are reported, not silently truncated',()=>{const stops=[{city:'pen',nights:10},{city:'resort',nights:8}];assert.equal(validRoute(stops),false);assert.equal(schedule(stops).at(-1).end,'2027-02-11');assert.match(routeWarnings(schedule(stops))[0],/25 晚/);});
test('age boundaries separate siblings and preserve unknown ages',()=>{assert.equal(ageFit({age_min:7,age_max:16},6),'no');assert.equal(ageFit({age_min:4,age_max:10},10),'yes');assert.equal(ageFit({age_min:5,age_max:7},10),'no');assert.equal(ageFit({},6),'unknown');});
test('official season and aggregator weekly dates are not confirmed bookings',()=>{assert.equal(evidence({start_date:'2026-11-23',end_date:'2027-01-29',source_url:'https://newtonshow.my/winter-camp',date_status:'confirmed_target_year'}),'season');assert.equal(evidence({start_date:'2027-01-18',end_date:'2027-01-22',source_url:'https://www.languagecourse.net/school',date_status:'confirmed_target_year'}),'aggregator');assert.equal(evidence({start_date:'2026-12-14',end_date:'2026-12-18',source_url:'https://example.com',date_status:'confirmed_target_year'}),'outside');assert.equal(evidence({}),'unknown');});
test('blank budget items stay missing, quoted zero stays zero; split dates count correctly',()=>{const legs=schedule([{id:'p',city:'pen',nights:7},{id:'s',city:'resort',nights:8}]);assert.deepEqual(quotedBudget(legs,{fixed:500,p:600,s:''},{flights:0,camps:''}),{total:7700,missing:2});});
test('commute accounts for parent returning to hotel and selected day count',()=>{assert.equal(commuteHours(30,3,false),3);assert.equal(commuteHours(30,5,true),10);});
test('every curated camp joins existing database; younger child excluded from Active',()=>{const raw=Object.fromEntries(['programs','providers','locations','sessions'].map(f=>[f,JSON.parse(readFileSync(new URL(`../camps/data/${f}.json`,import.meta.url)))]));const camps=joinCampData(raw);assert.equal(camps.length,11);for(const c of camps){assert.ok(c.programData,c.id);assert.ok(c.locationData,c.id);assert.ok(c.providerData,c.id);}assert.equal(ageFit(camps.find(c=>c.id==='beaumont-active').programData,6),'no');assert.equal(camps.find(c=>c.id==='ace').status,'aggregator');});

test('current preset follows actual route after applying, restoring, or editing stops',()=>{
 for(const [id,,rows] of PRESETS){const stops=rows.map(([city,nights],i)=>({id:`saved-${i}`,city,nights,hotel:'user-choice'}));assert.equal(presetForStops(stops),id);assert.equal(presetForStops(JSON.parse(JSON.stringify(stops))),id);}
 assert.equal(presetForStops([{city:'pen',nights:8},{city:'resort',nights:7}]),'');
 assert.equal(presetForStops([{city:'pen',nights:7},{city:'resort',nights:8}].reverse()),'reverse');
});

test('old far-away Sabah choices keep nights and notes but require nearby hotel requotes',()=>{
 const old={stops:[{id:'m',city:'mountain',nights:2,hotel:''},{id:'r',city:'resort',nights:5,hotel:'kk-rasa'},{id:'p',city:'pen',nights:8,hotel:'pen-mea'}],rates:{m:100,r:200,p:300,fixed:500},notes:{'2027-01-31':'keep my note'},transfers:{'pen:resort:r':'flight'}};
 const updated=restrictSabahScope(old);assert.equal(updated.stops.reduce((n,s)=>n+s.nights,0),15);assert.equal(updated.stops[0].city,'kk');assert.equal(updated.stops[1].hotel,'');assert.deepEqual(updated.rates,{p:300,fixed:500});assert.deepEqual(updated.notes,old.notes);assert.equal(old.stops[0].city,'mountain');assert.equal(updated.scopeAdjusted,true);assert.deepEqual(restrictSabahScope(updated),updated);
});
