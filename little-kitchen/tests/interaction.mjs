import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../model.js';
const elements=new Map();
function element(id){
  if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',open:false,disabled:false,classList:{add(){},remove(){}},setAttribute(){},focus(){},addEventListener(){},append(){},showModal(){this.open=true;},close(){this.open=false;},style:{}});
  return elements.get(id);
}
let timers=[],said=[],storage=new Map();
const voice={lang:'en-US',localService:true,name:'English'};
const context={...model,console,matchMedia:()=>({matches:false}),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{hidden:false,getElementById:element,addEventListener(){},createElement:()=>({style:{},remove(){}})},createNarrator:({allowed})=>({speak:(key,text)=>{if(allowed())said.push({key,text});},stop(){}}),window:{speechSynthesis:{}},speechSynthesis:{cancel(){},getVoices:()=>[{lang:'zh-TW'},voice],speak:u=>said.push(u)},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},requestAnimationFrame:fn=>fn()};
let source=readFileSync(new URL('../game.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'');
source+='\n;globalThis.testApi={act,hint,read:()=>({...state})};';
vm.runInNewContext(source,context);
element('start').onclick();
const flush=ms=>{const entry=timers.findIndex(t=>t.ms===ms);assert(entry>=0);timers.splice(entry,1)[0].fn();};
for(const action of ['accept','buy','buy','prepare','prepare','serve']){
  context.testApi.act(action);const after=context.testApi.read();
  context.testApi.act(action);assert.deepEqual(context.testApi.read(),after,'rapid second tap must not skip a step');
  flush(900);
}
assert.equal(context.testApi.read().phase,'thanks');assert.equal(context.testApi.read().served,1);
flush(2600);assert.equal(context.testApi.read().phase,'order');assert.equal(context.testApi.read().customer,1);
assert(said.length>=7);
for(const u of said){assert(/^[a-z0-9-]+$/.test(u.key));assert(!/[\u3400-\u9fff]/u.test(u.text));}
assert(said.some(u=>u.text==='Tap the rice.'));
assert(said.some(u=>u.text==='Yummy! Thank you!'));
const count=said.length;element('voice').onclick();context.testApi.hint();assert.equal(said.length,count);
element('voice').onclick();assert(said.length>count);
context.document.hidden=true;const hiddenCount=said.length;context.testApi.hint();assert.equal(said.length,hiddenCount);
console.log('PASS: real UI controller locks repeated taps, advances scenes, auto welcomes next guest, requests fixed English narration, and respects mute/background.');
