import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../model.js';
function setup(search=''){
  const elements=new Map(),timers=new Map(),said=[],storage=new Map();let tid=0,audioCreated=0,stops=0;
  function element(id){
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',open:false,disabled:false,dataset:{},classList:{add(){},remove(){}},setAttribute(){},focus(){},addEventListener(){},append(){},remove(){},querySelector(){return null;},showModal(){this.open=true;},close(){this.open=false;},style:{}});
    return elements.get(id);
  }
  const context={...model,console,URLSearchParams,location:{search},matchMedia:()=>({matches:false}),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{hidden:false,getElementById:element,addEventListener(){},createElement:()=>({style:{},remove(){}})},createNarrator:({allowed})=>({speak:(key,text)=>{if(allowed())said.push({key,text});},stop(){stops++;}}),window:{AudioContext:class{constructor(){audioCreated++;throw Error('No real audio in tests');}}},setTimeout:(fn,ms)=>{timers.set(++tid,{fn,ms});return tid;},clearTimeout:id=>timers.delete(id)};
  let source=readFileSync(new URL('../game.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'');
  source+='\n;globalThis.testApi={act,hint,read:()=>JSON.parse(JSON.stringify(state))};';
  vm.runInNewContext(source,context);
  const flush=ms=>{const entry=[...timers].find(([,t])=>t.ms===ms);assert(entry,`missing ${ms}ms timer`);timers.delete(entry[0]);entry[1].fn();};
  return {element,context,said,flush,api:context.testApi,audioCreated:()=>audioCreated,stops:()=>stops};
}
const q=setup('?muted=1');q.element('start').onclick();assert.equal(q.api.read().sound,false);
q.api.act('cook:pot');assert.equal(q.api.read().scene,'kitchen');
q.api.act('scene:market');for(const id of ['fish','strawberry','milk'])q.api.act(`food:${id}`);
assert.equal(q.api.read().scene,'market','picking foods must not force a scene change');
assert.equal(q.api.read().ingredients.join(','),'fish,strawberry,milk');
q.api.act('scene:kitchen');q.api.act('cook:blender');q.api.act('serve');assert.equal(q.api.read().served,0,'animation prevents accidental serving');q.flush(750);
q.api.act('cook:pot');q.flush(750);assert.equal(q.api.read().method,'pot','same foods work with another tool');
q.api.act('serve');q.api.act('serve');assert.equal(q.api.read().served,1);q.flush(1600);
assert.equal(q.api.read().customer,1);assert.equal(q.api.read().ingredients.length,3,'retain choices after sharing');
for(const id of ['fish','strawberry','milk'])q.api.act(`food:${id}`);
assert.equal(q.api.read().ingredients.length,0);assert.equal(q.said.length,0);assert.equal(q.audioCreated(),0,'muted play never creates audio hardware context');
const v=setup();v.element('start').onclick();v.api.act('scene:market');v.api.act('food:carrot');
assert(v.said.some(x=>x.key==='word-carrot'&&x.text==='carrot. carrot.'));
for(const u of v.said){assert.match(u.key,/^[a-z0-9-]+$/);assert(!/[\u3400-\u9fff]/u.test(u.text));}
const count=v.said.length;v.element('parents').onclick();v.api.hint();assert.equal(v.said.length,count);
v.element('closeGuide').onclick();v.context.document.hidden=true;v.api.hint();assert.equal(v.said.length,count);
v.context.document.hidden=false;v.element('voice').onclick();v.api.hint();assert.equal(v.said.length,count);assert(v.stops()>0);
console.log('PASS: free scene/tool choices; retained foods; rapid taps; word requests; mute creates no audio; guide/background silence. All audio mocked.');
