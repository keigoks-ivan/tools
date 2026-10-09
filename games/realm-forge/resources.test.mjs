import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, validateProject, generateMap, tileType, RESOURCE, enrichMapResources, RICH_RESOURCE_AMOUNTS } from './core.mjs';

test('four player starting stocks are independent of every AI kingdom',()=>{
  const p=defaultProject(); p.rules.playerStartingResources={wood:12345,food:0,gold:67890,stone:456}; p.rules.starting=3000;
  const w=new World(p);
  assert.deepEqual(w.stocks[0],p.rules.playerStartingResources);
  for(let i=1;i<w.teams;i++) assert.deepEqual(w.stocks[i],{wood:3000,food:3000,gold:3000,stone:3000});
  w.stocks[0].wood++; assert.equal(w.stocks[1].wood,3000);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).rules.playerStartingResources,p.rules.playerStartingResources);
});
test('old projects retain their player stocks and adopt the Definitive controls',()=>{
  const p=defaultProject(); delete p.rules.playerStartingResources; delete p.rules.hotkeys; delete p.map.resourceAmounts; p.rules.starting=750;
  const next=validateProject(p);
  assert.deepEqual(next.rules.playerStartingResources,{wood:750,food:750,gold:750,stone:750});
  assert.equal(next.rules.hotkeys,'definitive'); assert.deepEqual(next.map.resourceAmounts,RICH_RESOURCE_AMOUNTS);
});
test('every generated kingdom has abundant deposits of all four resources',()=>{
  for(const size of [64,128,256,1280,2048]) for(const seed of [7,42]) {
    const map=generateMap(size,seed), w=new World({...defaultProject(),map});
    assert.deepEqual(w.deploymentErrors,[]);
    for(const spawn of map.spawns) {
      const counts={wood:0,food:0,gold:0,stone:0};
      for(let y=Math.max(0,spawn.y-12);y<Math.min(size,spawn.y+13);y++) for(let x=Math.max(0,spawn.x-12);x<Math.min(size,spawn.x+13);x++) { const r=RESOURCE[tileType(map,x,y)]; if(r) counts[r]+=w.amountAt(x,y); }
      for(const r of Object.keys(counts)) assert.ok(counts[r]>=RICH_RESOURCE_AMOUNTS[r]*4,`${size} ${seed} ${r}: ${counts[r]}`);
    }
  }
});
test('AI workers can collect and deposit map resources without player stocks',()=>{
  const p=defaultProject();p.rules.ai='off';p.rules.playerStartingResources={wood:0,food:0,gold:0,stone:0};
  const w=new World(p), worker=w.units.find(u=>u.team===1&&u.blueprint.role==='worker'), point=w.closestResource(worker,'wood');
  assert.ok(point);w.command([worker.id],{type:'gather',...point});const before=w.stocks[1].wood;
  for(let i=0;i<800&&w.stocks[1].wood===before;i++) w.tick(.1);
  assert.ok(w.stocks[1].wood>before);assert.equal(w.stocks[0].wood,0);
});
test('enriching edited maps supplies both teams and keeps the town site clear',()=>{
  const p=defaultProject();p.map=generateMap(1280);p.map.template='grass';p.map.patches={};enrichMapResources(p.map);
  const w=new World(p);assert.deepEqual(w.deploymentErrors,[]);
  for(const spawn of p.map.spawns) assert.equal(tileType(p.map,spawn.x,spawn.y),'grass');
});
test('starting amounts reject invalid or missing resource values and accept the upper limit',()=>{
  for(const value of [-1,1.5,1000001]) {const p=defaultProject();p.rules.playerStartingResources.wood=value;assert.throws(()=>validateProject(p));}
  const p=defaultProject();p.rules.playerStartingResources.wood=1000000;assert.equal(validateProject(p).rules.playerStartingResources.wood,1000000);
});
