import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, validateProject } from './core.mjs';

function setup(freePlayerPopulation=true) {
  const p=defaultProject();Object.assign(p.rules,{ai:'off',freePlayerPopulation});
  p.map.template='grass';p.map.patches={};
  const w=new World(p);for(const u of w.units)u.stance='passive';return w;
}
function run(w,seconds){for(let i=0;i<seconds*10;i++)w.tick(.1);}
function house(w,team,point){const site=w.nearestBuildingSite('house',point,true);assert.ok(site);const b=w.addBuilding('house',team,site.x,site.y,true);assert.ok(b);return b;}

test('default player capacity is the full 500 and housing still limits every enemy',()=>{
  const w=setup();assert.equal(w.buildings.some(b=>b.type==='house'),false);
  assert.equal(w.capacity(0),500);assert.equal(w.project.rules.enemyPopulation,300);
  for(let team=1;team<w.teams;team++)assert.equal(w.capacity(team),5);
  const b=house(w,0,{x:8,y:8});assert.equal(w.capacity(0),500);b.hp=0;assert.equal(w.capacity(0),500);
});
test('player training crosses the initial town capacity while enemy training waits for a house',()=>{
  const w=setup(),towns=[0,1].map(team=>w.buildings.find(b=>b.team===team&&b.type==='town'));
  for(const town of towns)for(let i=0;i<3;i++)assert.equal(w.train(town.id,'villager'),null);
  run(w,80);
  assert.equal(w.population(0),7);assert.equal(towns[0].queue.length,0);
  assert.equal(w.population(1),5);assert.equal(towns[1].queue.length,2);
  const left=towns[1].queue[0].left;run(w,10);assert.equal(towns[1].queue[0].left,left);
  house(w,1,{x:8,y:8});run(w,55);
  assert.equal(w.population(1),7);assert.equal(towns[1].queue.length,0);
});
test('the optional housing model blocks player production and resumes after construction',()=>{
  const w=setup(false),town=w.buildings.find(b=>b.team===0&&b.type==='town');
  assert.equal(w.capacity(0),5);for(let i=0;i<2;i++)assert.equal(w.train(town.id,'villager'),null);
  run(w,60);assert.equal(w.population(0),5);assert.equal(town.queue.length,1);
  const b=house(w,0,{x:8,y:8});run(w,30);
  assert.equal(w.capacity(0),10);assert.equal(w.population(0),6);assert.equal(town.queue.length,0);
  b.hp=0;assert.equal(w.capacity(0),5);
  assert.equal(w.train(town.id,'villager'),null);const left=town.queue[0].left;run(w,2);assert.equal(town.queue[0].left,left);
});
test('free housing never permits training above the configured population cap',()=>{
  const w=setup();w.project.rules.population=50;const town=w.buildings.find(b=>b.team===0&&b.type==='town');
  while(w.population(0)<50)w.spawn('villager',0,{x:town.x+5,y:town.y+5});
  assert.equal(w.train(town.id,'villager'),null);const left=town.queue[0].left;run(w,30);
  assert.equal(w.population(0),50);assert.equal(town.queue[0].left,left);
  w.units.find(u=>u.team===0).hp=0;run(w,30);
  assert.equal(w.population(0),50);assert.equal(town.queue.length,0);
});
test('enemy housing and training respect the independent default 300-person cap',()=>{
  const w=setup();for(let i=0;i<65;i++)house(w,1,{x:5+(i%10)*5,y:5+Math.floor(i/10)*5});
  assert.equal(w.capacity(1),300);assert.equal(w.capacity(0),500);
  const town=w.buildings.find(b=>b.team===1&&b.type==='town');
  while(w.population(1)<300)w.spawn('villager',1,{x:town.x+5,y:town.y+5});
  assert.equal(w.train(town.id,'villager'),null);const left=town.queue[0].left;run(w,30);
  assert.equal(w.population(1),300);assert.equal(town.queue[0].left,left);
  w.units.find(u=>u.team===1).hp=0;run(w,30);
  assert.equal(w.population(1),300);assert.equal(town.queue.length,0);
  w.project.rules.enemyPopulation=200;assert.equal(w.capacity(1),200);assert.equal(w.capacity(0),500);
});
test('missing enemy cap adopts 300 while an explicit 200-person setting survives validation',()=>{
  const p=defaultProject();delete p.rules.enemyPopulation;
  assert.equal(validateProject(p).rules.enemyPopulation,300);
  p.rules.enemyPopulation=200;assert.equal(validateProject(p).rules.enemyPopulation,200);
});
test('the free-population rule survives project serialization and rejects non-boolean values',()=>{
  const p=defaultProject();p.rules.freePlayerPopulation=false;
  assert.equal(validateProject(JSON.parse(JSON.stringify(p))).rules.freePlayerPopulation,false);
  delete p.rules.freePlayerPopulation;assert.equal(validateProject(p).rules.freePlayerPopulation,true);
  for(const value of ['false',0,1,null]){p.rules.freePlayerPopulation=value;assert.throws(()=>validateProject(p),/人口容量/);}
});
