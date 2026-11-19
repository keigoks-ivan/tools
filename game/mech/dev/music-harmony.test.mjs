import test from 'node:test';
import assert from 'node:assert/strict';
import { Audio, chordOf, voiceLeadChord, musicScore } from '../audio.js';
import { ZeroAudio } from '../zero/sfx.js';

test('七和弦、附加九度與掛留和弦有正確音程，大七和弦不會誤判成小調',()=>{
  assert.deepEqual(chordOf('Bbmaj7'),{r:10,iv:[0,4,7,11]});
  assert.deepEqual(chordOf('Dm7'),{r:2,iv:[0,3,7,10]});
  assert.deepEqual(chordOf('A7'),{r:9,iv:[0,4,7,10]});
  assert.deepEqual(chordOf('Dmadd9'),{r:2,iv:[0,3,7,2]});
  assert.deepEqual(chordOf('Asus'),{r:9,iv:[0,5,7]});
});

test('四聲部保留和弦內音與共同音，不交叉或擠成低音半音團',()=>{
  const names=['Dmadd9','Bbmaj7','Gm7','Asus','A7','Dmadd9','Cadd9','Am7','Dm7'];let previous=null;
  for(const name of names) {
    const c=chordOf(name),notes=voiceLeadChord(c,previous);
    assert.equal(notes.length,4);assert.equal(new Set(notes).size,4);
    for(const m of notes)assert(m>=52&&m<=76&&c.iv.some(iv=>(c.r+iv)%12===m%12));
    for(const iv of c.iv)assert(notes.some(m=>m%12===(c.r+iv)%12));
    assert(notes[1]-notes[0]>=3&&notes[2]-notes[1]>=2&&notes[3]-notes[2]>=2);
    assert(notes[3]-notes[0]>=12);
    if(previous)assert(Math.max(...notes.map((m,i)=>Math.abs(m-previous[i])))<=5,'和弦銜接出現過大的聲部跳進');
    previous=notes;
  }
});

test('原曲與北野新曲長音固定四聲部，循環接點平順且事件皆為有效音符',()=>{
  for(const key of ['title','kitano','battle1','battle2','battle3','battle4','battle5','final']) {
    const s=musicScore(key),events=s.ev.flat(),pads=events.filter(e=>e.k==='pad');
    assert.strictEqual(s,musicScore(key));assert(s.loop&&s.bpm>0&&s.ev.length===s.len);
    for(const e of events) {
      if(e.m!==undefined)assert(Number.isFinite(e.m));
      if(e.n)assert(e.n.length<=4&&e.n.every(m=>Number.isFinite(m)&&m>=28&&m<=96));
      if(e.d!==undefined)assert(e.d>0&&Number.isFinite(e.d));
      if(e.k==='pad')assert.equal(e.n.length,4);
    }
    const first=pads[s.from?2:0].n,last=pads.at(-1).n;
    assert(Math.max(...last.map((m,i)=>Math.abs(m-first[i])))<=2,'循環接點跳回另一個音域');
  }
  const k=musicScore('kitano');assert(k.flat&&k.bpm<90);
  assert(!k.ev.flat().some(e=>['k','s','h','t','c','b','ti','lead','stab'].includes(e.k)),'觀景曲混進戰鼓或銅管重擊');
});

test('低高強度有不同編制與低音節奏，沒有只靠加音量區分',()=>{
  const s=musicScore('battle1'),events=s.ev.slice(s.from*16).flat();
  const at=I=>events.filter(e=>I>=(e.min||0)&&I<(e.max??9)),low=at(.2),high=at(.9);
  assert(low.some(e=>e.k==='pno')&&!high.some(e=>e.k==='pno'));
  assert(low.some(e=>e.k==='bass'&&e.d>3)&&!high.some(e=>e.k==='bass'&&e.d>3));
  assert(!low.some(e=>e.k==='ost'||e.k==='h'||e.k==='s'));
  assert(high.some(e=>e.k==='ost')&&high.some(e=>e.k==='lead')&&high.some(e=>e.k==='h'));
});

test('兩種 Audio 在解鎖前接受北野曲，音量、暫停、切曲與關閉不會建立音訊',()=>{
  for(const Type of [Audio,ZeroAudio]) {
    const a=new Type();a.setVolume(0);a.setMusicVolume(0);a.setPaused(true);a.music('kitano');
    assert.equal(a._musWant,'kitano');assert.equal(a.vol,0);assert.equal(a.musVol,0);
    a.setPaused(false);a.music('battle',{stage:6});assert.equal(a._musWant,'final');
    a.music('off');assert.equal(a._musWant,null);assert.equal(a.ctx,null);assert.equal(a.lastError,null);
  }
});

test('chapter themes have complete eight-beat phrases, four-part harmony and separate bass and inner parts', async()=>{
  const {CHAPTER_SCORES}=await import('../chapter-scores.mjs');
  const melodies=new Set();
  for(const [key,cue] of Object.entries(CHAPTER_SCORES)){
    const s=musicScore(key);
    assert(s.loop&&s.len===24*16,key);
    for(const phrase of cue.theme)assert.equal(phrase.reduce((sum,[,beats])=>sum+beats,0),8,key);
    melodies.add(JSON.stringify(cue.theme));
    for(let bar=0;bar<24;bar++){
      const ch=chordOf(cue.harmony.split(' ')[bar%16]);
      const events=s.ev.slice(bar*16,(bar+1)*16).flat(),pad=events.find(e=>e.k==='pad');
      assert.equal(pad.n.length,4);
      assert(pad.n.every(m=>ch.iv.some(iv=>(ch.r+iv)%12===m%12)),key);
      assert(events.some(e=>e.k==='bass')&&events.filter(e=>e.k==='pno').length>=2,key);
    }
  }
  assert.equal(melodies.size,Object.keys(CHAPTER_SCORES).length);
});

test('the landing score changes section on a downbeat, reuses its track, and resolves with its own cadence',()=>{
  const a=new Audio(),s=musicScore('landing'),tr={S:s},played=[];
  a._mPlay=(track,event)=>played.push(event);
  function step(i){played.length=0;a._mStep(tr,i,0);}
  a.music('landing',{part:0});step(0);assert.equal(tr.part,0);
  a.music('landing',{part:4});step(15);assert.equal(tr.part,0);
  step(16);assert.equal(tr.part,4);assert.equal(tr.partAt,16);
  const opening=played.slice();
  assert(opening.some(e=>e.k==='choir')&&opening.some(e=>e.k==='pad'&&e.n.length===4));
  step(16+s.partSteps);assert.deepEqual(played,opening);
  a.music('landing',{part:2});step(32+s.partSteps);
  assert.equal(tr.part,2);assert(played.some(e=>e.k==='pno'));
  assert(!musicScore('landingHome').loop);
});
