import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNarrator} from '../voice.js';
const manifest=JSON.parse(readFileSync(new URL('../assets/voice/lines.json',import.meta.url)));
for(const[key,text] of Object.entries(manifest.lines)){
  const clip=readFileSync(new URL(`../assets/voice/${key}.wav`,import.meta.url));
  assert.equal(clip.toString('ascii',0,4),'RIFF');assert(clip.length>8000);assert(!/[\u3400-\u9fff]/u.test(text));
}
let enabled=true,starts=0,stops=0,fetches=0,status='';
const context={state:'running',destination:{},decodeAudioData:async data=>({length:data.byteLength}),createGain:()=>({gain:{},connect(){},disconnect(){}}),createBufferSource:()=>({connect(){},disconnect(){},start(){starts++;},stop(){stops++;}})};
const narration=createNarrator({allowed:()=>enabled,getAudioContext:()=>context,onStatus:x=>status=x,fetcher:async url=>{fetches++;const b=readFileSync(url);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}});
await narration.speak('food-carrot','Tap the carrot.');assert.equal(starts,1);assert.equal(status,'recorded-female');
await narration.speak('food-carrot','Tap the carrot.');assert.equal(starts,2);assert.equal(fetches,1,'replay uses cached audio');assert(stops>0);
enabled=false;await narration.speak('thanks','Yummy! Thank you!');assert.equal(starts,2);
let resolve;enabled=true;
const slow=createNarrator({allowed:()=>enabled,getAudioContext:()=>context,fetcher:()=>new Promise(r=>resolve=r)});
const pending=slow.speak('thanks','Yummy! Thank you!');slow.stop();resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)});await pending;assert.equal(starts,2,'cancelled loading clip cannot speak later');
console.log('PASS: 24 WAV clips; fixed female playback; replay cache; mute; stale audio cancellation.');
