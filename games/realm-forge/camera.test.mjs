import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer, wheelZoomFactor} from './renderer.js';

function camera() {
  return Object.assign(Object.create(Renderer.prototype), {width:1280,height:460,tileW:42,tileH:21,zoom:1.1,pan:{x:0,y:0},project:{map:{size:1280}}});
}
function near(actual, expected) {assert.ok(Math.abs(actual-expected)<1e-8, `${actual} != ${expected}`);}
function atCenter(view, target) {
  const p = view.screen(target.x,target.y); near(p.x,view.width/2); near(p.y,view.height/2);
}

test('a hundred tiny trackpad events cause a small proportional zoom change', () => {
  const view = camera(); view.center({x:281,y:998});
  for (let i=0;i<100;i++) view.zoomBy(wheelZoomFactor(1));
  near(view.zoom,1.1*Math.exp(-.1));
  atCenter(view,{x:281,y:998});
});
test('wheel modes agree and a large wheel event cannot cause a large jump', () => {
  near(wheelZoomFactor(1,1),wheelZoomFactor(16,0));
  near(wheelZoomFactor(1,2,600),wheelZoomFactor(100000));
  assert.ok(wheelZoomFactor(-100000)<1.09);
  assert.equal(wheelZoomFactor(0),1);
});
test('repeated zoom cycles retain the world point at the screen center', () => {
  const view = camera(), target = {x:301.5,y:953.25}; view.center(target);
  for (let i=0;i<15;i++) {view.zoomBy(1.04);view.zoomBy(1/1.04);}
  near(view.zoom,1.1); atCenter(view,target);
});
test('even very long scrolling remains inside the gameplay zoom limits', () => {
  const view = camera(); view.center({x:281,y:998});
  for(let i=0;i<200;i++) view.zoomBy(wheelZoomFactor(-100000));
  assert.equal(view.zoom,1.8);
  for(let i=0;i<200;i++) view.zoomBy(wheelZoomFactor(100000));
  assert.equal(view.zoom,.55); atCenter(view,{x:281,y:998});
});
test('overview returns to the exact previous center and zoom after a viewport resize', () => {
  const view = camera(), target = {x:450,y:950}; view.center(target); view.zoomBy(1.1);
  const previous = view.zoom; view.fit(view.project.map);
  assert.ok(view.zoom<.05); view.width=1512;view.height=727;
  assert.equal(view.restoreView(),true); near(view.zoom,previous); atCenter(view,target);
  assert.equal(view.restoreView(),false);
});
test('scrolling from overview restores the prior battlefield before zooming', () => {
  const view = camera(), target = {x:281,y:998}; view.center(target); view.fit(view.project.map);
  view.zoomBy(1.1); near(view.zoom,1.21); atCenter(view,target); assert.equal(view.overviewView,null);
});
test('centering a town or a minimap point leaves overview at a usable zoom', () => {
  const view = camera(); view.fit(view.project.map); view.center({x:999,y:320});
  assert.equal(view.zoom,1.1); atCenter(view,{x:999,y:320}); assert.equal(view.overviewView,null);
});
test('panning cannot leave the camera center beyond the map', () => {
  const view = camera(); view.pan={x:1e8,y:-1e8}; view.constrainView();
  const p=view.world(view.width/2,view.height/2);
  assert.ok(p.x>=0&&p.x<=1279&&p.y>=0&&p.y<=1279);
});

test('clicking an enlarged unit near its head or feet works throughout gameplay zoom levels',()=>{
  const view=camera(),u={id:1,kind:'unit',hp:40,x:40,y:40,team:1,blueprint:{look:'worker'}};
  const world={units:[u],buildings:[],isVisible:()=>true};view.center(u);
  for(const zoom of [.55,1.1,1.8]){view.zoom=zoom;view.center(u);const p=view.screen(u.x,u.y);
    assert.equal(view.hit(p.x,p.y-31*zoom,world,false)?.id,u.id);
    assert.equal(view.hit(p.x+12*zoom,p.y+3,world,false)?.id,u.id);
    assert.equal(view.hit(p.x+60,p.y-20,world,false),null);
  }
});
test('overlapping units choose the visible foreground target and never hit a hidden enemy',()=>{
  const view=camera(),back={id:1,kind:'unit',hp:40,x:40,y:40,team:1,blueprint:{look:'soldier'}},front={...back,id:2,x:40.2,y:40.2};
  view.center(back);const p=view.screen(back.x,back.y),world={units:[back,front],buildings:[],isVisible:e=>e.id===1};
  assert.equal(view.hit(p.x,p.y-15,world,false)?.id,2);assert.equal(view.hit(p.x,p.y-15,world,true)?.id,1);
  world.isVisible=()=>false;assert.equal(view.hit(p.x,p.y-15,world,true),null);
});
test('right-clicking an enemy overlapped by the selected army keeps the enemy as the command target',()=>{
  const view=camera(),enemy={id:1,kind:'unit',hp:40,x:40,y:40,team:1,blueprint:{look:'soldier'}},own={...enemy,id:2,team:0,x:40.2,y:40.2};
  view.center(enemy);const p=view.screen(enemy.x,enemy.y),world={units:[own,enemy],buildings:[],isVisible:()=>true};
  assert.equal(view.hit(p.x,p.y-15,world,false)?.id,own.id);
  assert.equal(view.commandHit(p.x,p.y-15,world,false,new Set([own.id]))?.id,enemy.id);
  assert.equal(view.commandHit(p.x,p.y-15,world,false,new Set())?.id,own.id);
  world.isVisible=e=>e.team===0;assert.equal(view.commandHit(p.x,p.y-15,world,true,new Set([own.id]))?.id,own.id);
});
