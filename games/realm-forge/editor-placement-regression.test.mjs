import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, validateProject, generateMap, setTile, tileType, enrichMapResources, buildingBounds } from './core.mjs';

function project() {
  const p=defaultProject();p.map=generateMap(128,7);p.map.tiles.fill('grass');p.rules.ai='off';
  return p;
}
function exported(p){return validateProject(JSON.parse(JSON.stringify(p)));}
function placed(w,entry){const b=buildingBounds(entry.type,entry.x,entry.y);return w.buildings.find(e=>e.type===entry.type&&e.team===entry.team&&e.x===b.x&&e.y===b.y);}
function hero(p){const u={...structuredClone(p.units.find(u=>u.id==='archer')),id:'editor-hero',name:'地圖英雄',hero:true,regen:0,building:'castle',upgrades:[]};p.units.push(u);return u;}

test('painting under a placed building keeps the project editable and moving it restores deployment',()=>{
  const p=project(),entry={id:'map-fort',type:'castle',team:0,x:15,y:15};p.map.buildingPlacements=[entry];
  assert.ok(placed(new World(p),entry));setTile(p.map,15,15,'water');
  const imported=exported(p),invalid=new World(imported);
  assert.deepEqual(imported.map.buildingPlacements,[entry]);assert.ok(invalid.deploymentErrors.length);assert.equal(placed(invalid,entry),undefined);
  assert.equal(invalid.canPlaceMapBuilding('castle',15,15),false);
  imported.map.buildingPlacements[0]={...entry,x:22,y:15};
  const repaired=new World(exported(imported));assert.deepEqual(repaired.deploymentErrors,[]);assert.ok(placed(repaired,imported.map.buildingPlacements[0]));
  assert.deepEqual(repaired.stocks[0],p.rules.playerStartingResources);
});

test('enriching resources preserves placed footprints and supplies surrounding reserves',()=>{
  const p=project(),s=p.map.spawns[0],entry={id:'forest-fort',type:'castle',team:0,x:s.x-10,y:s.y};p.map.buildingPlacements=[entry];
  assert.ok(placed(new World(p),entry));enrichMapResources(p.map);
  const enriched=exported(p),w=new World(enriched),bounds=buildingBounds(entry.type,entry.x,entry.y);
  assert.deepEqual(enriched.map.buildingPlacements,[entry]);assert.deepEqual(w.deploymentErrors,[]);assert.ok(placed(w,entry));
  for(let y=bounds.minY;y<=bounds.maxY;y++)for(let x=bounds.minX;x<=bounds.maxX;x++)assert.equal(tileType(enriched.map,x,y),'grass');
  for(const [x,y,type] of [[s.x-7,s.y,'forest'],[s.x,s.y+8,'food'],[s.x+8,s.y,'gold'],[s.x,s.y-8,'stone']]){
    assert.equal(tileType(enriched.map,x,y),type);assert.ok(w.amountAt(x,y)>0);
  }
});

test('loading a battle does not resurrect a destroyed placed building or change gate passability',()=>{
  const p=project();p.map.buildingPlacements=[{id:'fort',type:'castle',team:0,x:15,y:15},{id:'wall',type:'wall',team:0,x:24,y:15},{id:'gate',type:'gate',team:0,x:27,y:15}];
  const w=new World(exported(p)),fort=placed(w,p.map.buildingPlacements[0]),wall=placed(w,p.map.buildingPlacements[1]),gate=placed(w,p.map.buildingPlacements[2]);
  assert.ok(fort&&wall&&gate);const stocks=structuredClone(w.stocks);w.deleteEntity(fort.id);w.tick(.1);
  const restored=World.fromState(JSON.parse(JSON.stringify(w.saveState())));
  assert.equal(restored.entity(fort.id),null);assert.equal(placed(restored,p.map.buildingPlacements[0]),undefined);assert.equal(restored.blocked(15,15),false);
  assert.equal(restored.blocked(wall.x,wall.y),true);assert.equal(restored.blocked(gate.x,gate.y),false);
  assert.ok(restored.occupiedCells.has(15*restored.map.size+27));assert.deepEqual(restored.stocks,stocks);
  assert.deepEqual(restored.project.map.buildingPlacements,p.map.buildingPlacements);
  const restarted=new World(exported(restored.project));assert.ok(placed(restarted,p.map.buildingPlacements[0]));
  assert.equal(placed(restarted,p.map.buildingPlacements[0]).x,14.5);
});

test('same-blueprint hero slots survive terrain edits and battle loading preserves only survivors',()=>{
  const p=project(),bp=hero(p);p.map.heroPlacements=[{id:'hero-a',unitId:bp.id,x:40,y:40},{id:'hero-b',unitId:bp.id,x:40,y:41},{id:'hero-c',unitId:bp.id,x:41,y:40}];
  setTile(p.map,40,41,'water');const invalid=new World(exported(p));assert.ok(invalid.deploymentErrors.length);assert.equal(invalid.units.filter(u=>u.blueprint.id===bp.id).length,2);
  assert.deepEqual(invalid.project.map.heroPlacements,p.map.heroPlacements);
  setTile(p.map,40,41,'grass');const w=new World(exported(p)),heroes=w.units.filter(u=>u.blueprint.id===bp.id);assert.equal(heroes.length,3);assert.equal(new Set(heroes.map(u=>u.id)).size,3);
  heroes[1].hp=0;w.tick(.1);const ids=w.units.filter(u=>u.blueprint.id===bp.id).map(u=>u.id);
  const restored=World.fromState(JSON.parse(JSON.stringify(w.saveState())));
  assert.deepEqual(restored.units.filter(u=>u.blueprint.id===bp.id).map(u=>u.id),ids);
  assert.equal(restored.map.heroPlacements.length,3);
  assert.equal(restored.units.filter(u=>u.blueprint.id===bp.id).length,2);
  const next=restored.spawn(bp.id,0,{x:45,y:45});assert.ok(next.id>Math.max(...ids));assert.equal(new Set(restored.units.map(u=>u.id)).size,restored.units.length);
});

test('overlapping legacy placements without explicit ids report errors rather than sharing an ignored slot',()=>{
  const p=project(),bp=hero(p);p.map.heroPlacements=[{unitId:bp.id,x:40,y:40},{unitId:bp.id,x:40,y:40}];
  const heroes=new World(exported(p));assert.ok(heroes.deploymentErrors.length);assert.ok(heroes.units.filter(u=>u.blueprint.id===bp.id).length<=1);
  const buildings=project();buildings.map.buildingPlacements=[{type:'castle',team:0,x:15,y:15},{type:'castle',team:0,x:15,y:15}];
  const w=new World(exported(buildings));assert.ok(w.deploymentErrors.length);assert.ok(w.buildings.filter(b=>b.type==='castle').length<=1);
});
