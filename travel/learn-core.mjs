// Which learning topics each day of a route shows. Pure functions over the rows planner.mjs already computes
// (date, city, travel, item, attending); the itinerary itself is never recomputed here.
import {tripLearn} from './learn-data.mjs?v=1';
// Topics are keyed by the base city: the resort stops share the city-level topics of their market town.
const group=city=>city==='penres'?'pen':city==='resort'?'kk':city;
export const cityTopic=city=>`city:${group(city)}`;
const poolSize=(pool,learn)=>{let n=0;while(learn[`${pool}#${n+1}`])n++;return n;};
// Topics about one activity of the base city, in data order (rest pools and city/holiday/move topics excluded).
const activityKeys=(city,learn)=>Object.keys(learn).filter(k=>k.startsWith(`${group(city)}:`)&&!k.includes('#'));
// rows[i] = {date, city, travel, item:[activityId,…], attending:[…]} → array of topic-key arrays, one per row.
export function assignLearn(rows,learn=tripLearn){
 const last=rows.length-1,out=rows.map(()=>[]),taken=new Set(),pending=[];
 rows.forEach((r,i)=>{
  const holiday=i>0&&i<last&&learn[`holiday:${r.date}`]?`holiday:${r.date}`:'';
  const act=r.item?.[0],camp=Boolean(r.attending?.length);
  let key='';
  if(i===0)key='move:arrive';
  else if(i===last)key='move:depart';
  else if(r.travel)key=`move:to:${r.city}`;
  else if(!camp&&act&&act!=='rest')key=`${group(r.city)}:${act}`;
  if(key&&!learn[key])key='';
  if(key){taken.add(key);out[i].push(...(holiday?[holiday]:[]),key);}
  else if(holiday)out[i].push(holiday);
  else pending.push({i,pool:camp?'kl:camp':`${r.city}:rest`,city:r.city});
 });
 const reuse={};
 for(const {i,pool,city} of pending){
  const n=poolSize(pool,learn);
  let key=Array.from({length:n},(_,k)=>`${pool}#${k+1}`).find(k=>!taken.has(k))||activityKeys(city,learn).find(k=>!taken.has(k));
  if(!key&&n){key=`${pool}#${(reuse[pool]=(reuse[pool]??-1)+1)%n+1}`;}
  if(key){taken.add(key);out[i].push(key);}
 }
 return out;
}
// Topics of the route's cities that no day picked (pools longer than the rest days); shown as extra reading.
export function extraTopics(rows,assigned,learn=tripLearn){
 const used=new Set(assigned.flat()),cities=new Set(rows.flatMap(r=>[r.city,group(r.city)]));
 return Object.keys(learn).filter(k=>cities.has(k.split(':')[0])&&!used.has(k));
}
// Distinct topics of a route: one city card per base city on the route (in route order), then the daily topics.
export function routeTopics(rows,assigned){
 const keys=[...rows.map(r=>cityTopic(r.city)),...assigned.flat()];
 return [...new Set(keys)];
}
