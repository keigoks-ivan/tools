import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, validateProject, generateMap, tileType, RESOURCE, enrichMapResources, RICH_RESOURCE_AMOUNTS } from './core.mjs';
import { upgradeDefaultUnits } from './project-upgrades.mjs';

test('a fresh match gives the player 200,000 of each resource and every enemy 20,000',()=>{
  const w=new World(defaultProject());
  assert.deepEqual(w.stocks[0],{wood:200000,food:200000,gold:200000,stone:200000});
  for(let team=1;team<w.teams;team++)assert.deepEqual(w.stocks[team],{wood:20000,food:20000,gold:20000,stone:20000});
});

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
test('legacy project economy upgrades once and later custom starting resources survive',()=>{
  const p=defaultProject();delete p.rules.playerEconomyVersion;delete p.rules.aiEconomyVersion;
  p.rules.starting=2000;p.rules.playerStartingResources={wood:1000,food:250000,gold:2000,stone:0};
  const next=validateProject(p);
  assert.equal(upgradeDefaultUnits(next),true);
  assert.deepEqual(next.rules.playerStartingResources,{wood:200000,food:250000,gold:200000,stone:200000});
  assert.equal(next.rules.starting,20000);
  assert.equal(next.rules.playerEconomyVersion,1);assert.equal(next.rules.aiEconomyVersion,1);
  next.rules.playerStartingResources={wood:12,food:0,gold:345,stone:678};next.rules.starting=750;
  const reopened=validateProject(JSON.parse(JSON.stringify(next)));
  assert.equal(upgradeDefaultUnits(reopened),false);
  assert.deepEqual(reopened.rules.playerStartingResources,next.rules.playerStartingResources);
  assert.equal(reopened.rules.starting,750);
  assert.deepEqual(p.rules.playerStartingResources,{wood:1000,food:250000,gold:2000,stone:0});
});
test('versioned customized projects keep small stocks while accepting rich enemy settings',()=>{
  const p=defaultProject();p.rules.playerStartingResources={wood:1,food:2,gold:3,stone:4};p.rules.starting=1000000;
  const next=validateProject(p);upgradeDefaultUnits(next);
  assert.deepEqual(next.rules.playerStartingResources,p.rules.playerStartingResources);
  assert.equal(next.rules.starting,1000000);
  const invalid=defaultProject();invalid.rules.starting=1000001;assert.throws(()=>validateProject(invalid));
});
test('legacy default enemy cap upgrades to 300 once and a later 200-person choice is preserved',()=>{
  const p=defaultProject();delete p.rules.enemyPopulationVersion;p.rules.enemyPopulation=200;
  const next=validateProject(p);assert.equal(upgradeDefaultUnits(next),true);
  assert.equal(next.rules.enemyPopulation,300);assert.equal(next.rules.enemyPopulationVersion,1);
  next.rules.enemyPopulation=200;
  const reopened=validateProject(JSON.parse(JSON.stringify(next)));
  assert.equal(upgradeDefaultUnits(reopened),false);assert.equal(reopened.rules.enemyPopulation,200);
  for(const customCap of [50,500]){
    const custom=defaultProject();delete custom.rules.enemyPopulationVersion;custom.rules.enemyPopulation=customCap;
    upgradeDefaultUnits(custom);assert.equal(custom.rules.enemyPopulation,customCap);assert.equal(custom.rules.enemyPopulationVersion,1);
  }
});
test('only the legacy default player cap migrates to 300 and a later 500-person choice survives',()=>{
  const p=defaultProject();delete p.rules.playerPopulationVersion;p.rules.population=500;
  const next=validateProject(p);assert.equal(upgradeDefaultUnits(next),true);
  assert.equal(next.rules.population,300);assert.equal(next.rules.playerPopulationVersion,1);
  next.rules.population=500;
  const reopened=validateProject(JSON.parse(JSON.stringify(next)));
  assert.equal(upgradeDefaultUnits(reopened),false);assert.equal(reopened.rules.population,500);
  for(const customCap of [50,300,750,2000]){
    const custom=defaultProject();delete custom.rules.playerPopulationVersion;custom.rules.population=customCap;
    assert.equal(upgradeDefaultUnits(custom),true);
    assert.equal(custom.rules.population,customCap);assert.equal(custom.rules.playerPopulationVersion,1);
  }
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
