import test from 'node:test';
import assert from 'node:assert/strict';
import {World,defaultProject,generateMap,enrichMapResources,findPath} from './core.mjs';

test('full starting towns leave routes out for all starting units and production buildings', () => {
  for (const size of [64,128,1280]) {
    const p=defaultProject();p.map=generateMap(size,123);
    if(p.map.tiles)p.map.tiles.fill('grass');else{p.map.template='grass';p.map.patches={};}
    enrichMapResources(p.map);
    Object.assign(p.rules,{startingBase:'full',fog:false,ai:'off'});
    const world=new World(p),goal={x:size/2,y:size/2};
    assert.deepEqual(world.deploymentErrors,[]);
    for (const unit of world.units) assert.ok(findPath(unit,goal,size,(x,y)=>world.blocked(x,y),.2),`${size}: unit ${unit.id} is trapped`);
    for (const b of world.buildings.filter(b=>world.availableUnits(b.team,b.type).length)) {
      const exit=world.buildingExit(b);
      assert.ok(exit,`${size}: ${b.type} has no exit`);
      assert.ok(findPath(exit,goal,size,(x,y)=>world.blocked(x,y),.2),`${size}: ${b.type} produces trapped units`);
    }
  }
});

test('generated small river valleys connect every kingdom even with full starting towns', () => {
  for (const size of [64,128]) for (const seed of [1,7,42,123]) for (const startingBase of ['town','full']) {
    const p=defaultProject();p.map=generateMap(size,seed);Object.assign(p.rules,{startingBase,ai:'off'});
    const world=new World(p);assert.deepEqual(world.deploymentErrors,[]);
    for(const unit of world.units) {
      const town=world.buildings.find(b=>b.type==='town'&&b.team===(unit.team+1)%world.teams);
      assert.ok(findPath(unit,town,size,(x,y)=>world.blocked(x,y),1.6),`${size}/${seed}/${startingBase}: unit ${unit.id} cannot leave its valley`);
    }
  }
});
