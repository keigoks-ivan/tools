import test from 'node:test';
import assert from 'node:assert/strict';
import {World,defaultProject,heroPlacementKey,buildingPlacementKey,setTile,buildingBounds} from './core.mjs';
import {Renderer} from './renderer.js';

function setup() {
  const p=defaultProject();p.map.tiles.fill('grass');p.rules.ai='off';
  const hero={...structuredClone(p.units.find(u=>u.id==='swordsman')),id:'editor-hero',hero:true,name:'編輯英雄',upgrades:[]};
  p.units.push(hero);p.map.heroPlacements=[{id:'first',unitId:hero.id,x:10,y:10},{id:'second',unitId:hero.id,x:16,y:10}];
  p.map.buildingPlacements=[{id:'keep',type:'castle',team:0,x:42,y:40},{id:'watch',type:'tower',team:1,x:51,y:40}];
  return p;
}
function view(project) { return Object.assign(Object.create(Renderer.prototype),{project,width:640,height:420,zoom:1,pan:{x:0,y:0},tileW:42,tileH:21}); }

test('editor picking distinguishes copies of the same hero and selects the precise placement',()=>{
  const p=setup(),w=new World(p),r=view(p);
  const picked=p.map.heroPlacements.map(point=>{const screen=r.screen(point.x,point.y);return r.heroHit(screen.x,screen.y-10,w);});
  assert.deepEqual(picked.map(e=>e.heroPlacementKey),p.map.heroPlacements.map(heroPlacementKey));
  assert.equal(new Set(picked.map(e=>e.id)).size,2);
});

test('editor buildings remain selectable at normalized centers even when terrain needs repair',()=>{
  const p=setup();setTile(p.map,41,39,'water');
  const w=new World(p),r=view(p);
  const picked=p.map.buildingPlacements.map(point=>{const bounds=buildingBounds(point.type,point.x,point.y),screen=r.screen(bounds.x,bounds.y);return r.buildingHit(screen.x,screen.y-10,w);});
  assert.deepEqual(picked.map(e=>e.buildingPlacementKey),p.map.buildingPlacements.map(buildingPlacementKey));
  assert.equal(picked[0].editorValid,false);
  assert.equal(picked[1].editorValid,true);
});
