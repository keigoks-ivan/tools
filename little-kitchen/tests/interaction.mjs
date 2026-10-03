import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../model.js';
function setup(search='',saved=null,reduced=false){
  const elements=new Map(),timers=new Map(),said=[],storage=new Map(saved?[['little-bloom-v3',saved]]:[]);let tid=0,audioCreated=0,stops=0;
  function element(id){
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',open:false,disabled:false,hidden:true,dataset:{},listeners:{},classList:{add(){},remove(){}},setAttribute(){},focus(){},addEventListener(type,fn){this.listeners[type]=fn;},append(){},remove(){},showModal(){this.open=true;},close(){this.open=false;},setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){},getBoundingClientRect(){return id==='guestTarget'?{left:300,right:450,top:50,bottom:250}:{left:50,right:250,top:150,bottom:350};},style:{}});
    return elements.get(id);
  }
  const context={...model,console,URLSearchParams,location:{search},matchMedia:()=>({matches:reduced}),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{hidden:false,getElementById:element,addEventListener(type,fn){this[type]=fn;},createElement:()=>({style:{},remove(){}})},createNarrator:({allowed})=>({speak:(key,text)=>{if(allowed())said.push({key,text});},stop(){stops++;}}),window:{AudioContext:class{constructor(){audioCreated++;throw Error('No real audio in tests');}}},setTimeout:(fn,ms)=>{timers.set(++tid,{fn,ms});return tid;}};
  let source=readFileSync(new URL('../game.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'');
  source+='\n;globalThis.testApi={act,hint,read:()=>JSON.parse(JSON.stringify({state,stage,prep,stirs,tool}))};';
  vm.runInNewContext(source,context);
  const flush=ms=>{const entry=[...timers].find(([,t])=>t.ms===ms);assert(entry,`missing ${ms}ms timer`);timers.delete(entry[0]);entry[1].fn();};
  const pointer=(type,action,x=100,y=200,extras={})=>element('game').listeners[type]({pointerId:1,isPrimary:true,button:0,clientX:x,clientY:y,target:{closest:()=>({dataset:{action}})},...extras});
  const tap=action=>{pointer('pointerdown',action);pointer('pointerup',action);element('game').listeners.click({detail:1,target:{closest:()=>({dataset:{action}})}});};
  const api={...context.testApi,read:()=>JSON.parse(JSON.stringify(context.testApi.read()))};
  return {element,context,said,storage,flush,pointer,tap,api,audioCreated:()=>audioCreated,stops:()=>stops};
}
const q=setup('?muted=1');q.element('start').onclick();assert.equal(q.api.read().state.sound,false);
q.api.act('stir');q.api.act('serve');assert.equal(q.api.read().stage,'pick');
q.tap('food:carrot');assert.deepEqual(q.api.read().state.ingredients,['carrot'],'captured pointer tap must pick exactly once');
q.tap('food:milk');assert.equal(q.api.read().stage,'prep');
q.tap('prep');assert.equal(q.api.read().prep,1,'synthetic click must not double count');
q.pointer('pointerdown','prep');q.pointer('pointermove','prep',160,200);q.pointer('pointermove','prep',220,200);q.pointer('pointerup','prep',220,200);
assert.equal(q.api.read().stage,'tools','swipes prepare ingredients');
q.api.act('serve');assert.equal(q.api.read().state.served,0,'uncooked food cannot be served');
q.api.act('tool:blender');assert.equal(q.api.read().stage,'cook');
for(let i=0;i<5;i++)q.tap('stir');assert.equal(q.api.read().stage,'serve');assert.equal(q.api.read().state.method,'blender');
q.pointer('pointerdown','serve');q.pointer('pointermove','serve',10,10);q.pointer('pointerup','serve',10,10);assert.equal(q.api.read().stage,'serve','missed drag keeps dish');
q.pointer('pointerdown','serve');q.pointer('pointermove','serve',350,150);q.pointer('pointercancel','serve',350,150);assert.equal(q.api.read().state.served,0,'cancelled gesture does not feed');
q.pointer('pointerdown','serve');q.pointer('pointermove','serve',350,150);q.pointer('pointerup','serve',350,150);
assert.equal(q.api.read().state.served,1);assert.equal(q.api.read().stage,'celebrate');
q.api.act('serve');q.api.act('food:fish');assert.equal(q.api.read().state.served,1,'rapid taps cannot repeat serving');
q.element('voice').onclick();assert.equal(JSON.parse(q.storage.get('little-bloom-v3')).customer,1,'preferences during celebration save next guest');q.element('voice').onclick();
q.flush(1800);assert.equal(q.api.read().stage,'pick');assert.equal(q.api.read().state.customer,1);assert.equal(q.api.read().state.ingredients.length,0);
assert.equal(q.audioCreated(),0,'muted play never creates audio');
// Dragging foods into the board adds them once; secondary pointers and missed drops do nothing.
const d=setup('?muted=1');d.element('start').onclick();
d.pointer('pointerdown','food:fish',70,450);d.pointer('pointermove','food:fish',100,200,{pointerId:2});d.pointer('pointerup','food:fish',70,450);assert.deepEqual(d.api.read().state.ingredients,['fish']);
d.pointer('pointerdown','food:fish',70,450);d.pointer('pointermove','food:fish',100,200);d.pointer('pointerup','food:fish',100,200);assert.deepEqual(d.api.read().state.ingredients,['fish'],'dragging chosen food does not remove it');
d.pointer('pointerdown','food:rice',70,450);d.pointer('pointermove','food:rice',500,10);d.pointer('pointerup','food:rice',500,10);assert.deepEqual(d.api.read().state.ingredients,['fish']);
d.pointer('pointerdown','food:rice',70,450);d.pointer('pointermove','food:rice',100,200);d.pointer('pointerup','food:rice',100,200);assert.deepEqual(d.api.read().state.ingredients,['fish','rice']);
d.pointer('pointerdown','prep');d.pointer('pointermove','prep',120,200);d.pointer('pointerup','prep',120,200);assert.equal(d.api.read().prep,1,'short swipes still make progress');
// Complete each tool with taps; ingredient changes return to a usable board.
for(const tool of Object.keys(model.methods)){
  const p=setup('?muted=1',null,true);p.element('start').onclick();p.api.act('food:milk');for(let i=0;i<3;i++)p.tap('prep');p.api.act(`tool:${tool}`);
  p.api.act('ingredients');assert.equal(p.api.read().stage,'prep');for(let i=0;i<3;i++)p.tap('prep');p.api.act(`tool:${tool}`);
  p.pointer('pointerdown','stir');for(let i=1;i<=5;i++)p.pointer('pointermove','stir',100+i*60,200);p.pointer('pointermove','stir',500,200);p.pointer('pointerup','stir',500,200);
  assert.equal(p.api.read().stage,'serve','one continuous stir can finish but cannot accidentally serve');p.api.act('serve');assert.equal(p.api.read().state.served,1);p.flush(1800);assert.equal(p.api.read().stage,'pick');
}
const v=setup();v.element('start').onclick();v.api.act('food:carrot');assert(v.said.some(x=>x.key==='word-carrot'&&x.text==='carrot. carrot.'));
const count=v.said.length;v.element('parents').onclick();v.api.act('food:fish');v.api.hint();assert.equal(v.said.length,count);assert.deepEqual(v.api.read().state.ingredients,['carrot']);
v.element('closeGuide').onclick();v.context.document.hidden=true;v.api.hint();assert.equal(v.said.length,count);v.context.document.visibilitychange();assert(v.stops()>0);
v.context.document.hidden=false;v.element('voice').onclick();v.api.hint();assert.equal(v.said.length,count);
const legacy={...model.fresh(),scene:'market',ingredients:['rice'],method:'pan',sound:false,served:12,customer:2};const r=setup('',JSON.stringify(legacy));assert.equal(r.api.read().stage,'serve');assert.equal(r.api.read().state.scene,'kitchen');assert.equal(r.api.read().state.served,12);
console.log('PASS: tap and swipe cooking; all tools; drag/drop and cancellation; rapid tap protection; repeat rounds; existing saves; mute and background silence. Audio mocked.');
