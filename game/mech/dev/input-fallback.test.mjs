import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../input.js';

class Element extends EventTarget {
  style={};
  setPointerCapture(){}
  getBoundingClientRect(){return {left:0,top:0,width:1000,height:700};}
  querySelector(){return this.knob;}
}
function browser(t,{fallback=true,coarse=false,request}={}){
  const window=new EventTarget(),document=new EventTarget(),timers=new Map();let nextTimer=1;
  const nodes=Object.fromEntries(['touch','tPad','tLook','tFire','tMsl'].map(id=>[id,new Element()]));nodes.tPad.knob=new Element();
  document.getElementById=id=>nodes[id]||null;document.querySelector=()=>nodes.tPad.knob;document.hidden=false;document.pointerLockElement=null;
  document.exitPointerLock=()=>{document.pointerLockElement=null;document.dispatchEvent(new Event('pointerlockchange'));};
  const globals={document,addEventListener:window.addEventListener.bind(window),matchMedia:()=>({matches:coarse}),setTimeout:f=>{const id=nextTimer++;timers.set(id,f);return id;},clearTimeout:id=>timers.delete(id)};
  const original=Object.fromEntries(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,value});
  t.after(()=>{for(const key of Object.keys(globals)){if(original[key])Object.defineProperty(globalThis,key,original[key]);else delete globalThis[key];}});
  const canvas=new Element();if(request)canvas.requestPointerLock=request;
  const input=new Input(canvas,{mouseFallback:fallback});
  return {input,canvas,document,window,nodes,timers,runTimers:()=>{for(const callback of [...timers.values()])callback();}};
}
function emit(surface,type,values={}){const event=new Event(type,{cancelable:true});for(const [key,value]of Object.entries(values))Object.defineProperty(event,key,{configurable:true,value});surface.dispatchEvent(event);return event;}
function mouse(b,x,y,target=b.canvas){emit(b.window,'mousemove',{clientX:x,clientY:y,target,movementX:900,movementY:900});}
const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

test('missing pointer lock API falls back to canvas mouse aim, fire and right-button ADS',t=>{
  const b=browser(t),{input,canvas}=b,modes=[];input.onMouseModeChange=mode=>modes.push(mode);input.enabled=true;input.lock();
  assert.equal(input.mouseMode,'fallback');assert.equal(input.mouseFallbackReason,'unsupported');
  mouse(b,100,100);mouse(b,120,110);emit(canvas,'mousedown',{button:0,clientX:120,clientY:110});emit(canvas,'mousedown',{button:2,clientX:120,clientY:110});
  const state=input.state(1/60);assert.equal(state.lookX,20*.0022);assert.equal(state.lookY,10*.0022);assert.equal(state.fire,true);assert.equal(state.lockHold,true);assert.deepEqual(modes,['fallback']);
  emit(b.window,'mouseup',{button:0});emit(b.window,'mouseup',{button:2});assert.equal(input.state(1/60).fire,false);assert.equal(input.held('M2'),false);
});
test('rejected lock is tried at most twice, then firing does not repeat acquisition requests',async t=>{
  let calls=0;const b=browser(t,{request:()=>{calls++;return Promise.reject(new Error('Permission denied'));}});b.input.enabled=true;
  b.input.lock();b.input.lock();await settle();assert.equal(calls,2);assert.equal(b.input.mouseMode,'fallback');assert.equal(b.timers.size,0);
  for(let i=0;i<8;i++){emit(b.canvas,'mousedown',{button:0,clientX:100,clientY:100});emit(b.window,'mouseup',{button:0});}
  b.input.lock();await settle();assert.equal(calls,2);assert.equal(b.input.mouseMode,'fallback');
});
test('legacy void request that never resolves enters bounded fallback instead of freezing aim',t=>{
  let calls=0;const b=browser(t,{request:()=>{calls++;}});b.input.enabled=true;b.input.lock();b.input.lock();assert.equal(calls,1);assert.equal(b.input.mouseMode,'idle');
  b.runTimers();assert.equal(b.input.mouseMode,'fallback');assert.equal(b.input.mouseFallbackReason,'timeout');mouse(b,100,100);mouse(b,110,100);assert(b.input.state(1/60).lookX>0);
});
test('leaving, re-entering or moving over menus never turns the player across a cursor gap',t=>{
  const b=browser(t);b.input.enabled=true;b.input.lock();mouse(b,100,100);mouse(b,110,100);b.input.state(1/60);
  emit(b.canvas,'mousedown',{button:0,clientX:110,clientY:100});emit(b.canvas,'mouseleave');assert.equal(b.input.held('M0'),false);
  mouse(b,850,600,new Element());emit(b.canvas,'mouseenter');mouse(b,900,650);assert.equal(b.input.state(1/60).lookX,0);
  mouse(b,910,655);assert.equal(b.input.state(1/60).lookX,10*.0022);
  mouse(b,30,20);assert.equal(b.input.state(1/60).lookX,0,'large native cursor warps are rejected');
});
test('blur, hidden page and disabled menu clear firing, movement and aim baselines',t=>{
  const b=browser(t);b.input.enabled=true;b.input.lock();mouse(b,100,100);mouse(b,120,100);emit(b.canvas,'mousedown',{button:2,clientX:120,clientY:100});emit(b.window,'keydown',{code:'KeyW'});
  emit(b.window,'blur');mouse(b,180,100);emit(b.window,'keydown',{code:'KeyW'});assert.equal(b.input.mouseMode,'idle');assert.equal(b.input.keys.size,0);assert.equal(b.input.state(1/60).lookX,0);
  emit(b.window,'focus');assert.equal(b.input.mouseMode,'fallback');mouse(b,800,100);assert.equal(b.input.state(1/60).lookX,0);
  b.input.enabled=false;mouse(b,810,100);emit(b.canvas,'mousedown',{button:0,clientX:810,clientY:100});assert.equal(b.input.keys.size,0);assert.equal(b.input.state(1/60).lookX,0);
  b.input.enabled=true;mouse(b,900,100);assert.equal(b.input.state(1/60).lookX,0);b.document.hidden=true;emit(b.document,'visibilitychange');assert.equal(b.input.mouseMode,'idle');assert.equal(b.input.keys.size,0);
});
test('normal pointer lock uses native relative motion and real lock loss still notifies pause',t=>{
  const b=browser(t,{request:()=>undefined}),changes=[];b.input.onLockChange=locked=>changes.push(locked);b.input.enabled=true;b.input.lock();
  b.document.pointerLockElement=b.canvas;emit(b.document,'pointerlockchange');assert.equal(b.input.mouseMode,'locked');assert.equal(b.timers.size,0);
  emit(b.window,'mousemove',{movementX:12,movementY:-6,clientX:999,clientY:650,target:new Element()});const state=b.input.state(1/60);assert.equal(state.lookX,12*.0022);assert.equal(state.lookY,-6*.0022);
  emit(b.window,'mousemove',{movementX:600,movementY:0});assert.equal(b.input.state(1/60).lookX,0);
  emit(b.canvas,'mousedown',{button:0});b.document.pointerLockElement=null;emit(b.document,'pointerlockchange');assert.deepEqual(changes,[true,false]);assert.equal(b.input.keys.size,0);assert.equal(b.input.mouseMode,'idle');
  mouse(b,100,100);mouse(b,120,100);assert.equal(b.input.state(1/60).lookX,0,'Escape does not silently enable free mouse mode');
});
test('failed acquisition events do not look like Escape or trigger onLockChange(false)',t=>{
  let calls=0;const b=browser(t,{request:()=>{calls++;}}),changes=[];b.input.enabled=true;b.input.onLockChange=value=>changes.push(value);b.input.lock();
  emit(b.document,'pointerlockerror');emit(b.document,'pointerlockerror');assert.equal(calls,2);assert.equal(b.input.mouseMode,'fallback');emit(b.document,'pointerlockchange');assert.deepEqual(changes,[]);
});
test('cancelled acquisition rejects stale promise callbacks after opening a menu',async t=>{
  let reject,calls=0;const b=browser(t,{request:()=>{calls++;return new Promise((_resolve,no)=>{reject=no;});}});b.input.enabled=true;b.input.lock();b.input.enabled=false;reject(new Error('late rejection'));await settle();
  assert.equal(calls,1);assert.equal(b.input.mouseMode,'idle');assert.equal(b.timers.size,0);assert.equal(b.input.mouseFallbackReason,null);
});
test('touch and compatibility mouse events do not double-aim or activate mouse fallback',t=>{
  let calls=0;const b=browser(t,{coarse:true,request:()=>{calls++;}});b.input.enabled=true;b.input.lock();assert.equal(calls,0);assert.equal(b.input.mouseMode,'idle');
  emit(b.canvas,'mousedown',{button:0,clientX:100,clientY:100,sourceCapabilities:{firesTouchEvents:true}});mouse(b,100,100);mouse(b,150,100);assert.equal(b.input.state(1/60).lookX,0);assert.equal(b.input.held('M0'),false);
  emit(b.nodes.tLook,'pointerdown',{pointerId:1,clientX:100,clientY:100});emit(b.nodes.tLook,'pointermove',{pointerId:1,clientX:110,clientY:105});assert(b.input.state(1/60).lookX>0);
  b.input.enabled=false;emit(b.nodes.tLook,'pointerdown',{pointerId:1,clientX:110,clientY:105});emit(b.nodes.tLook,'pointermove',{pointerId:1,clientX:150,clientY:105});emit(b.nodes.tFire,'pointerdown',{pointerId:2});assert.equal(b.input.state(1/60).lookX,0);assert.equal(b.input.held('Tfire'),false);
});
test('the original series remains pointer-lock-only unless fallback is explicitly requested',t=>{
  const b=browser(t,{fallback:false});b.input.enabled=true;b.input.lock();mouse(b,100,100);mouse(b,150,100);assert.equal(b.input.state(1/60).lookX,0);assert.equal(b.input.mouseFallbackReason,null);
  b.document.pointerLockElement=b.canvas;emit(b.document,'pointerlockchange');emit(b.window,'mousemove',{movementX:10,movementY:0});assert.equal(b.input.state(1/60).lookX,10*.0022);
});
test('fallback edge turns cover the same angle at 30, 60 and 120 FPS in a narrow window',t=>{
  const b=browser(t);b.canvas.getBoundingClientRect=()=>({left:0,top:0,width:320,height:500});b.input.enabled=true;b.input.lock();
  const angles=[];
  for(const fps of [30,60,120]){
    b.input.reset();mouse(b,320,250);let angle=0;
    for(let frame=0;frame<fps*2;frame++)angle+=b.input.state(1/fps).lookX;
    angles.push(angle);assert(Math.abs(angle-3.7)<1e-10,'right edge did not permit a full turn toward the rear');
  }
  assert(Math.max(...angles)-Math.min(...angles)<1e-10);
  b.input.reset();mouse(b,160,0);assert.equal(b.input.state(1).lookY,-.8,'vertical edge rate must remain gentler than yaw');
  b.input.reset();mouse(b,288,250);assert.equal(b.input.state(1).lookX,0,'edge band must start smoothly at 32 pixels');
  b.input.reset();mouse(b,304,250);assert.equal(b.input.state(1).lookX,.925,'half penetration uses half the continuous yaw rate');
});
test('fallback edge turn is zero in the center and stops on leave, overlay, reset and pause',t=>{
  const b=browser(t);b.input.enabled=true;b.input.lock();mouse(b,500,350);assert.equal(b.input.state(1).lookX,0);assert.equal(b.input.state(1).lookY,0);
  emit(b.canvas,'mousedown',{button:0,clientX:1000,clientY:350});assert.equal(b.input.state(1).lookX,0,'a click alone cannot start edge steering');
  b.input.reset();mouse(b,1000,350);assert.equal(b.input.state(1).lookX,1.85);emit(b.canvas,'mouseleave');assert.equal(b.input.state(1).lookX,0);
  mouse(b,1000,350);emit(b.canvas,'mousedown',{button:0,clientX:1000,clientY:350});assert.equal(b.input.state(1).lookX,1.85,'firing at a confirmed edge does not interrupt turning');
  mouse(b,1000,350);mouse(b,1000,350,new Element());assert.equal(b.input.state(1).lookX,0);
  mouse(b,1000,350);b.input.reset();assert.equal(b.input.state(1).lookX,0);
  mouse(b,1000,350);b.input.enabled=false;assert.equal(b.input.state(1).lookX,0);
  b.input.enabled=true;mouse(b,1000,350);emit(b.window,'blur');assert.equal(b.input.state(1).lookX,0);
});
test('normal locked mouse motion has no edge drift and keeps native sensitivity',t=>{
  const b=browser(t,{request:()=>undefined});b.input.enabled=true;b.input.lock();b.document.pointerLockElement=b.canvas;emit(b.document,'pointerlockchange');
  b.input.sens=1.5;emit(b.window,'mousemove',{target:b.canvas,clientX:1000,clientY:700,movementX:12,movementY:3});
  const state=b.input.state(1/30);assert.equal(state.lookX,12*.0022*1.5);assert.equal(state.lookY,3*.0022*1.5);assert.equal(b.input.state(1).lookX,0);assert.equal(b.input.state(1).lookY,0);
});
