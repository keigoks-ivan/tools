import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,planDays} from './planner-core.mjs?v=8';
import {tripRoutes} from './research-data.mjs?v=9';
import {tripLearn} from './learn-data.mjs?v=1';
import {assignLearn,routeTopics,extraTopics} from './learn-core.mjs?v=2';

const CAMP=['2027-01-18','2027-01-19','2027-01-20'];
// Same row shape as planner.mjs dailyRows: date, city, travel, item, attending.
function rowsFor(id,{camp=true}={}){
 const stops=PRESETS.find(p=>p[0]===id)[2].map(([city,nights])=>({city,nights}));
 const attendingCount=d=>camp&&CAMP.includes(d)?2:0;
 return planDays({stops,pace:'easy',attendingCount}).map(d=>({date:d.date,city:d.city,travel:d.travel,item:d.item,attending:attendingCount(d.date)&&d.leg.fixed&&!d.travel?[1,2]:[]}));
}
const routeIds=[...new Set([...tripRoutes.map(r=>r.id),...PRESETS.map(p=>p[0])])];

test('every day of every route gets existing topic keys', () => {
 for(const id of routeIds)for(const camp of [true,false]){
  const rows=rowsFor(id,{camp}),out=assignLearn(rows);
  assert.equal(out.length,23,id);
  out.forEach((keys,i)=>{
   assert.ok(keys.length>=1&&keys.length<=2,`${id} day ${i+1}: ${keys.length} topics`);
   for(const k of keys)assert.ok(tripLearn[k],`${id} day ${i+1}: missing ${k}`);
  });
  for(const k of routeTopics(rows,out))assert.ok(tripLearn[k],`${id}: missing ${k}`);
 }
});

test('default route: arrive, depart and the four festival days', () => {
 const rows=rowsFor('klpenkl'),out=assignLearn(rows),by=d=>out[rows.findIndex(r=>r.date===d)];
 assert.deepEqual(out[0],['move:arrive']);
 assert.deepEqual(out[22],['move:depart']);
 assert.ok(by('2027-01-22').includes('holiday:2027-01-22'));
 for(const d of ['2027-02-05','2027-02-06','2027-02-07'])assert.ok(by(d).includes(`holiday:${d}`),d);
 assert.deepEqual(by('2027-01-24'),['move:to:pen']);
 assert.deepEqual(by('2027-02-04'),['move:to:kl']);
});

test('pool topics do not repeat until the pool and unused activities run out', () => {
 for(const id of routeIds){
  const rows=rowsFor(id),out=assignLearn(rows);
  const seen=new Map();
  out.forEach((keys,i)=>keys.forEach(k=>{
   const pooled=k.includes('#'),reused=seen.has(k);
   if(pooled&&reused){
    // A pool topic may repeat only once every unused same-city activity topic is already taken.
    const city=k.split(':')[0].replace('penres','pen').replace('resort','kk').replace('kl','kl');
    const free=Object.keys(tripLearn).filter(x=>x.startsWith(city+':')&&!x.includes('#')&&!seen.has(x));
    assert.deepEqual(free,[],`${id}: ${k} repeated while ${free} unused`);
    const pool=k.split('#')[0];
    let n=0;while(tripLearn[`${pool}#${n+1}`])n++;
    for(let j=1;j<=n;j++)assert.ok(seen.has(`${pool}#${j}`),`${id}: ${k} repeated before ${pool}#${j}`);
   }
   seen.set(k,i);
  }));
 }
 // Default route, camp days: three different camp topics.
 const rows=rowsFor('klpenkl'),out=assignLearn(rows);
 assert.deepEqual(out.slice(1,4).flat(),['kl:camp#1','kl:camp#2','kl:camp#3']);
});

test('festival on an activity or move day shows both, festival first', () => {
 const rows=['2027-01-17','2027-01-18','2027-01-19','2027-01-20','2027-01-21','2027-01-22','2027-01-23','2027-01-24','2027-02-08']
  .map((date,i,a)=>({date,city:'kl',travel:i===0||i===a.length-1,item:['rest'],attending:[]}));
 rows[5].item=['science'];
 rows[7].travel=true;rows[7].city='pen';
 const out=assignLearn(rows);
 assert.deepEqual(out[5],['holiday:2027-01-22','kl:science']);
 assert.deepEqual(out[7],['move:to:pen']);
 // Festival on a move day.
 const mv=[{date:'2027-01-17',city:'kl',travel:true,item:['rest'],attending:[]},{date:'2027-02-05',city:'kl',travel:true,item:['rest'],attending:[]},{date:'2027-02-08',city:'kl',travel:true,item:['rest'],attending:[]}];
 assert.deepEqual(assignLearn(mv)[1],['holiday:2027-02-05','move:to:kl']);
 // Festival on a rest day replaces the pool topic and does not consume it.
 const rest=[{date:'2027-01-17',city:'kl',travel:true,item:['rest'],attending:[]},{date:'2027-01-22',city:'kl',travel:false,item:['rest'],attending:[]},{date:'2027-01-23',city:'kl',travel:false,item:['rest'],attending:[]},{date:'2027-02-08',city:'kl',travel:true,item:['rest'],attending:[]}];
 assert.deepEqual(assignLearn(rest).slice(1,3),[['holiday:2027-01-22'],['kl:rest#1']]);
});

test('pool falls back to unscheduled activities, then restarts from the pool head', () => {
 const row=(date,act)=>({date,city:'kl',travel:false,item:[act],attending:[]});
 const rows=[{date:'2027-01-17',city:'kl',travel:true,item:['rest'],attending:[]},...[18,19,20,21,23,24,25].map(d=>row(`2027-01-${d}`,'rest')),{date:'2027-02-08',city:'kl',travel:true,item:['rest'],attending:[]}];
 const out=assignLearn(rows).slice(1,-1).flat();
 assert.deepEqual(out,['kl:rest#1','kl:rest#2','kl:rest#3','kl:science','kl:kid','kl:aquaria','kl:rest#1']);
});

test('extra reading lists the route cities\' unassigned topics only', () => {
 const rows=rowsFor('klpenkl'),out=assignLearn(rows),extra=extraTopics(rows,out),used=new Set(out.flat());
 assert.ok(extra.includes('kl:rest#2')&&extra.includes('kl:rest#3'),extra.join());
 for(const k of extra){assert.ok(!used.has(k),k);assert.ok(!/^(city|move|holiday|ipoh|kk|resort):/.test(k),k);}
 const all=new Set();for(const id of routeIds){const r=rowsFor(id),o=assignLearn(r);[...o.flat(),...routeTopics(r,o),...extraTopics(r,o)].forEach(k=>all.add(k));}
 assert.deepEqual(Object.keys(tripLearn).filter(k=>!all.has(k)),[]);
});
