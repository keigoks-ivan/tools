import assert from 'node:assert/strict';
import {foods,methods,fresh,toggleFood,cook,dish,serve,restore} from '../model.js';
const ids=Object.keys(foods),original=['carrot','broccoli','rice','seaweed','bread','tomato','flour','milk','strawberry','fish'],sets=[];let combinations=0;
// Retain exhaustive coverage of the original ten foods, then cover every new food and pair.
for(let mask=1;mask<2**original.length;mask++)sets.push(original.filter((_,i)=>mask&(1<<i)));
for(let i=0;i<ids.length;i++){sets.push([ids[i]]);for(let j=i+1;j<ids.length;j++)sets.push([ids[i],ids[j]]);}
sets.push(ids);
for(const selected of sets){
  const s=fresh();for(const id of selected)toggleFood(s,id);
  const chosen=[...s.ingredients];
  for(const tool of Object.keys(methods)){
    assert(cook(s,tool));const meal=dish(s);assert.equal(meal.method,tool);
    assert.deepEqual(meal.ingredients,chosen);assert.match(meal.color,/^#[0-9a-f]{6}$/);
    assert.deepEqual(restore(JSON.stringify(s)),s);
    assert(serve(s));assert.deepEqual(s.ingredients,chosen);assert.equal(serve(s),false);
    combinations++;
  }
  assert.equal(s.served,3);assert.equal(s.customer,3);
}
const s=fresh();assert.equal(cook(s,'pan'),false);assert.equal(serve(s),false);
assert.equal(toggleFood(s,'__proto__'),false);toggleFood(s,'fish');cook(s,'blender');toggleFood(s,'fish');
assert.equal(s.ingredients.length,0);assert.equal(dish(s),null);
toggleFood(s,'rice');assert.equal(cook(s,'invalid'),false);cook(s,'pan');s.scene='market';assert.equal(serve(s),false);
const recovered=restore(JSON.stringify({version:3,scene:'bad',ingredients:['rice','rice','__proto__',{},'bad'],method:'pan',customer:9,served:-1,sound:false}));
assert.deepEqual(recovered,{version:3,scene:'kitchen',ingredients:['rice'],method:'pan',customer:1,served:0,sound:false});
assert.deepEqual(restore('{'),fresh());
for(const version of [1,2])assert.deepEqual(restore(null,JSON.stringify({version,sound:false,served:7,customer:5})),{...fresh(),sound:false,served:7,customer:1});
console.log(`PASS: ${combinations} ingredient/tool combinations; repeat play; state recovery; invalid inputs; legacy migration.`);
