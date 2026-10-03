import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../model.js';
import * as art from '../art.js';
function setup(search='',saved=null,reduced=false){
  const elements=new Map(),timers=new Map(),said=[],storage=new Map(saved?[['little-bloom-v3',saved]]:[]);let tid=0,audioCreated=0,stops=0,loops=0;
  function element(id){
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',open:false,disabled:false,hidden:true,dataset:{},listeners:{},classList:{add(){},remove(){}},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;},append(){},remove(){},showModal(){this.open=true;},close(){this.open=false;},setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){},getBoundingClientRect(){return id==='guestTarget'?{left:300,right:450,top:50,bottom:250,width:150,height:200}:{left:50,right:250,top:150,bottom:350,width:200,height:200};},style:{setProperty(){}}});
    return elements.get(id);
  }
  const parameter=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
  function node(){let running=false;return {gain:parameter(),frequency:parameter(),connect(){},disconnect(){},start(){if(this.loop||this.type==='sawtooth'){running=true;loops++;}},stop(){if(running){running=false;loops--;}this.onended?.();}};}
  class AudioContext{constructor(){audioCreated++;this.state='running';this.currentTime=0;this.sampleRate=128;this.destination={};}resume(){this.state='running';}suspend(){this.state='suspended';}createGain(){return node();}createOscillator(){return node();}createBufferSource(){return node();}createBiquadFilter(){return node();}createBuffer(){return {getChannelData:()=>new Float32Array(128)};}}
  const context={...model,...art,console,URLSearchParams,location:{search},matchMedia:()=>({matches:reduced}),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{hidden:false,getElementById:element,addEventListener(type,fn){this[type]=fn;},createElement:()=>({style:{},remove(){}})},createNarrator:({allowed})=>({speak:(key,text)=>{if(allowed())said.push({key,text});},stop(){stops++;}}),window:{AudioContext},setTimeout:(fn,ms)=>{timers.set(++tid,{fn,ms});return tid;},clearTimeout:id=>timers.delete(id)};
  let source=readFileSync(new URL('../game.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'');
  source+='\n;globalThis.testApi={act,hint,read:()=>({state,stage,prepared,focusFood,stirs,tool,portions,liquid,holding})};';vm.runInNewContext(source,context);
  const flush=ms=>{const entry=[...timers].find(([,t])=>t.ms===ms);assert(entry,`missing ${ms}ms timer`);timers.delete(entry[0]);entry[1].fn();};
  const pointer=(type,action,x=100,y=200,extras={})=>element('game').listeners[type]({pointerId:1,isPrimary:true,button:0,clientX:x,clientY:y,target:{closest:()=>({dataset:{action}})},...extras});
  const tap=action=>{pointer('pointerdown',action);pointer('pointerup',action);element('game').listeners.click({detail:1,target:{closest:()=>({dataset:{action}})}});};
  const api={...context.testApi,read:()=>JSON.parse(JSON.stringify(context.testApi.read()))};
  const prepare=()=>{for(let n=0;api.read().stage==='prep'&&n<40;n++)tap('prep');assert.equal(api.read().stage,'tools');};
  const heat=tool=>{api.act(`tool:${tool}`);assert.equal(api.read().stage,'load');tap('load');assert.equal(api.read().stage,'heat');api.act('stir');assert.equal(api.read().stirs,0);if(tool!=='blender'){api.act('heat');assert.equal(api.read().stage,'heat','dry cookware cannot start cooking');api.act('liquid');}api.act('heat');assert.equal(api.read().stage,'cook');};
  return {element,context,said,storage,flush,pointer,tap,prepare,heat,api,audioCreated:()=>audioCreated,stops:()=>stops,loops:()=>loops,timers};
}
const q=setup('?muted=1');q.element('start').onclick();q.tap('food:carrot');q.tap('food:tomato');
assert.deepEqual(q.api.read().state.ingredients,['carrot','tomato'],'pointer taps pick once');assert.equal(q.api.read().focusFood,'tomato');
q.tap('prep');assert.equal(q.api.read().prepared.tomato,1,'no synthetic click double count');
q.pointer('pointerdown','prep');q.pointer('pointermove','prep',170,200);q.pointer('pointermove','prep',240,200);q.pointer('pointermove','prep',310,200);q.pointer('pointerup','prep',310,200);
assert.equal(q.api.read().prepared.tomato,3);assert.equal(q.api.read().focusFood,'carrot');assert.equal(q.api.read().prepared.carrot,undefined,'one held swipe must not cut the next food');
q.prepare();q.heat('pan');for(let i=0;i<3;i++)q.tap('stir');assert.equal(q.api.read().stage,'plate');assert.equal(q.api.read().state.method,'pan');
q.api.act('serve');assert.equal(q.api.read().state.served,0,'cooked food must be plated');for(let i=0;i<3;i++)q.tap('plate');assert.equal(q.api.read().stage,'serve');
q.pointer('pointerdown','serve');q.pointer('pointermove','serve',10,10);q.pointer('pointerup','serve',10,10);assert.equal(q.api.read().stage,'serve','missed drops retain the meal');
q.pointer('pointerdown','serve');q.pointer('pointermove','serve',350,150);q.pointer('pointercancel','serve',350,150);assert.equal(q.api.read().state.served,0);
q.pointer('pointerdown','serve');q.pointer('pointermove','serve',350,150);q.pointer('pointerup','serve',350,150);assert.equal(q.api.read().state.served,1);q.api.act('serve');q.api.act('food:fish');assert.equal(q.api.read().state.served,1);
q.element('voice').onclick();assert.equal(JSON.parse(q.storage.get('little-bloom-v3')).customer,1);q.element('voice').onclick();q.flush(1800);assert.equal(q.api.read().stage,'pick');assert.equal(q.api.read().state.ingredients.length,0);assert.equal(q.audioCreated(),0,'muted play never opens audio hardware');
const d=setup('?muted=1');d.element('start').onclick();d.pointer('pointerdown','food:fish',70,450);d.pointer('pointermove','food:fish',100,200,{pointerId:2});d.pointer('pointerup','food:fish',70,450);assert.deepEqual(d.api.read().state.ingredients,['fish']);
d.pointer('pointerdown','food:fish',70,450);d.pointer('pointermove','food:fish',100,200);d.pointer('pointerup','food:fish',100,200);assert.deepEqual(d.api.read().state.ingredients,['fish'],'dropping selected foods does not remove them');
d.pointer('pointerdown','food:rice',70,450);d.pointer('pointermove','food:rice',500,10);d.pointer('pointerup','food:rice',500,10);assert.deepEqual(d.api.read().state.ingredients,['fish']);
d.pointer('pointerdown','food:rice',70,450);d.pointer('pointermove','food:rice',100,200);d.pointer('pointerup','food:rice',100,200);assert.deepEqual(d.api.read().state.ingredients,['fish','rice']);
d.pointer('pointerdown','prep');d.pointer('pointermove','prep',120,200);d.pointer('pointerup','prep',120,200);assert.equal(d.api.read().prepared.rice,1,'short gestures advance once');d.api.act('food:fish');d.api.act('food:rice');assert.equal(d.api.read().stage,'pick');
for(const tool of Object.keys(model.methods)){
  const p=setup('?muted=1',null,true);p.element('start').onclick();for(const id of Object.keys(model.foods))p.api.act(`food:${id}`);p.prepare();p.heat(tool);
  const steps=tool==='pot'?5:3;for(let i=0;i<steps;i++)p.tap('stir');assert.equal(p.api.read().stage,'plate');p.api.act('ingredients');assert.equal(p.api.read().stage,'prep');assert.equal(p.api.read().state.method,null);p.prepare();p.heat(tool);for(let i=0;i<steps;i++)p.tap('stir');for(let i=0;i<3;i++)p.tap('plate');p.tap('serve');p.flush(1800);assert.equal(p.api.read().stage,'pick');assert.equal(p.api.read().state.served,1);
}
// Holding the blender is useful, but release, cancel, hidden page and guide stop it.
const h=setup('?muted=1');h.element('start').onclick();h.api.act('food:strawberry');h.prepare();h.heat('blender');h.pointer('pointerdown','stir');h.flush(420);assert.equal(h.api.read().stirs,1);h.flush(420);h.flush(420);assert.equal(h.api.read().stage,'plate');h.pointer('pointerup','stir');assert.equal(h.api.read().portions,0,'holding cannot accidentally plate');assert.equal(h.api.read().holding,false);
const a=setup();a.element('start').onclick();a.api.act('food:carrot');assert(a.said.some(x=>x.key==='word-carrot'));a.prepare();a.heat('pan');assert.equal(a.loops(),1,'sizzle starts with heat');a.element('voice').onclick();assert.equal(a.loops(),0,'mute stops sizzle');a.element('voice').onclick();assert.equal(a.loops(),1);a.element('parents').onclick();assert.equal(a.loops(),0);a.api.act('stir');assert.equal(a.api.read().stirs,0);a.element('closeGuide').onclick();assert.equal(a.loops(),1);a.context.document.hidden=true;a.context.document.visibilitychange();assert.equal(a.loops(),0);a.context.document.hidden=false;a.context.document.visibilitychange();assert.equal(a.loops(),1);for(let i=0;i<3;i++)a.api.act('stir');assert.equal(a.loops(),0,'finished cooking stops sizzle');assert(a.stops()>0);
const motor=setup();motor.element('start').onclick();motor.api.act('food:milk');motor.prepare();motor.heat('blender');assert.equal(motor.loops(),0,'idle blender is quiet');
motor.pointer('pointerdown','stir');assert.equal(motor.loops(),1);motor.pointer('pointercancel','stir');assert.equal(motor.loops(),0);assert.equal(motor.api.read().holding,false);
motor.pointer('pointerdown','stir');motor.context.document.hidden=true;motor.context.document.visibilitychange();assert.equal(motor.loops(),0);assert.equal(motor.api.read().holding,false);motor.context.document.hidden=false;motor.context.document.visibilitychange();assert.equal(motor.loops(),0,'returning does not restart an unheld blender');
motor.pointer('pointerdown','stir');motor.pointer('pointerup','stir');assert.equal(motor.loops(),0,'release stops the motor');
const legacy={...model.fresh(),scene:'market',ingredients:['rice'],method:'pan',sound:false,served:12,customer:2};const r=setup('',JSON.stringify(legacy));assert.equal(r.api.read().stage,'serve');assert.equal(r.api.read().state.scene,'kitchen');assert.equal(r.api.read().state.served,12);
for(const id of Object.keys(model.foods)){assert(art.foodDrawing(id));assert.notEqual(art.foodDrawing(id),art.foodDrawing(id,{piece:true}));assert(!/[\uD83C-\uDBFF]/u.test(art.foodDrawing(id)));for(let cut=1;cut<=3;cut++)assert(art.foodSVG(id,{cut}).includes('<svg'));}
assert.notEqual(art.plateArt(['carrot'],'pan',1),art.plateArt(['carrot'],'pan',3),'plating adds food in visible portions');
console.log('PASS: individual food prep, load/liquid/heat gates, all cookware, plating, blender hold, drag/cancel, rapid taps, all ten ingredients, save migration, mute/guide/background audio lifecycle. All audio mocked.');
