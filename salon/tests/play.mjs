import assert from 'node:assert/strict';
import {surpriseWish,restoreInspiration,earnedSticker,stickerKeys} from '../js/play.js';
import {guests} from '../js/looks.js';
import {palette} from '../js/data.js';
import {HairSystem} from '../js/hair.js';
import {checkWish} from '../js/goals.js';
import {SalonMemory} from '../js/memory.js';
import {ReplayUI} from '../js/replay-ui.js';
import {ornament,createDecorate} from '../js/ornaments.js';
let seed=42;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296},seen=new Set();let previous=null;
for(let i=0;i<500;i++){const w=surpriseWish(random,previous);assert.notEqual(w.id,previous?.id);assert.deepEqual(restoreInspiration(JSON.parse(JSON.stringify(w))),w);seen.add(w.id);previous=w;}
assert.ok(seen.size>200,'surprise cards should offer varied combinations');
assert.notEqual(surpriseWish(()=>0,surpriseWish(()=>0)).id,surpriseWish(()=>0).id,'even repeated random values must change the challenge');
for(const color of [0,1,2,3,4,5])assert.equal(surpriseWish(random,null,color).colors[0],color);
for(const value of [{colors:[0,0],length:.52,accessory:'bow'},{colors:[99],length:.52,accessory:'bow'},{colors:[0],length:99,accessory:'bow'},{colors:[0],length:1,accessory:'unknown'}])assert.equal(restoreInspiration(value),null);
for(const guest of guests)for(let i=0;i<18;i++){const h=new HairSystem(guest),w=surpriseWish(random);if(w.length===1&&guest.id==='honey')for(let k=0;k<12;k++)for(const s of h.strands.filter(s=>!s.bang)){const p=s.nodes.at(-1);h.grow(p.x,p.y,.6)}h.cut({x:0,y:128+440*w.length*.92},{x:390,y:128+440*w.length*.92});h.strands.filter(s=>!s.bang).forEach((s,j)=>s.nodes.forEach(p=>p.c=[...palette[w.colors[j%w.colors.length]]]));const g=checkWish(h,[{kind:w.accessory}],w);assert.ok(g.colors&&g.accessory&&g.length,guest.id+' '+w.id+' must be achievable');assert.equal(earnedSticker(guest.id,w,g),guest.id+':'+w.colors[0]);assert.equal(earnedSticker(guest.id,w,{...g,accessory:false}),null);}
assert.equal(stickerKeys.length,18);assert.equal(new Set(stickerKeys).size,18);
const blueHair=new HairSystem();for(const s of blueHair.strands)for(const p of s.nodes)p.c=[...palette[4]];assert.equal(checkWish(blueHair,[],{colors:[4,3],length:1,accessory:'pearls'}).colors,false,'blue alone must not satisfy a blue and green wish');
// Existing settings migrate without a schema upgrade; bad or duplicate stickers are discarded.
const values=new Map([['stickers',['cocoa:0','unknown:9','cocoa:0']]]),database={close(){}};
globalThis.indexedDB={open(){const q={};queueMicrotask(()=>{q.result=database;q.onsuccess()});return q}};
const openMemory=async()=>{const m=new SalonMemory();m.request=async(store,mode,run)=>run({getAll:()=>[],get:key=>values.get(key),put:(value,key)=>{values.set(key,structuredClone(value));return key},delete(){}});await m.open();return m};
const memory=await openMemory();assert.deepEqual(memory.stickers,['cocoa:0']);assert.equal(await memory.collect('unknown:0'),false);assert.equal(await memory.collect('cocoa:0'),false);assert.deepEqual(await Promise.all([memory.collect('peach:5'),memory.collect('peach:5')]),[true,false]);
await memory.add({id:'photo',image:'x',created:1,state:{},sticker:'peach:5'});await memory.remove('photo');assert.deepEqual((await openMemory()).stickers,['cocoa:0','peach:5'],'deleting photos must not erase the collection');
let awarded=0;const replay=new ReplayUI({stop(){},react(){},capture:()=>({sticker:'honey:1'}),save(){},finishPhoto(){awarded++;return true},memory:{add:async()=>false}});await replay.snap();assert.equal(awarded,0,'full album does not award an unsaved photo');replay.api.memory.add=async()=>true;await replay.snap();assert.equal(awarded,1);assert.equal(replay.newSticker,true);
const pearls=[],gradient={addColorStop(){}};const context=new Proxy({ellipse:(x,y)=>pearls.push({x,y}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>o[k]||(()=>{})});ornament(context,'pearls',0,0);assert.ok(pearls[3].y>pearls[0].y&&pearls[3].y>pearls[6].y,'the necklace must hang down in the middle');
const items=[],decorate=createDecorate({ornament:'pearls',colorIndex:0,react(){}},items,()=>{});decorate.onDown({x:195,y:385});decorate.onUp();assert.equal(items[0].angle,0);decorate.onDown({x:195,y:385});decorate.onUp();assert.equal(items[0].angle,Math.PI/4,'manual rotation remains available');
console.log('PASS: varied and restorable surprises, targeted challenges, 18 permanent stickers, duplicate protection, photo-capacity handling, downward necklace and manual rotation');
