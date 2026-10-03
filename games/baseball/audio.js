'use strict';
// Recorded effects and an original sampled-brass fanfare; gesture unlocks audio.
window.BaseballAudio=(()=>{
  let ctx=null, master=null, crowd=null, crowdSource=null, music=null, active=false, enabled=true, volume=0.65, decoding=false;
  const buffers={}, voices=new Set();
  const files={soft:'hit-soft.wav',line:'hit-line.wav',power:'hit-power.wav',mitt1:'mitt-1.wav',mitt2:'mitt-2.wav',step:'step.wav',bounce:'bounce.wav',cheer:'cheer.mp3',bed:'crowd-bed.mp3',homerun:'homerun.mp3'};
  const assets=Promise.all(Object.entries(files).map(async ([name,file])=>{
    try { const r=await fetch(`assets/audio/${file}?v=28`); return r.ok?[name,await r.arrayBuffer()]:null; } catch(e){ return null; }
  }));
  try { enabled=localStorage.getItem('baseball-sound')!=='off'; volume=Number(localStorage.getItem('baseball-volume')||0.65); } catch(e) {}
  volume=Math.max(0,Math.min(1,Number.isFinite(volume)?volume:0.65));
  const button=document.getElementById('soundToggle'), slider=document.getElementById('soundVolume');
  function controls(){
    button.setAttribute('aria-pressed',String(enabled));
    button.setAttribute('aria-label',enabled?'關閉音效':'開啟音效');
    button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${enabled?'<path d="M16 8q5 4 0 8M19 5q8 7 0 14"/>':'<path d="m17 9 5 6m0-6-5 6"/>'}</svg><span>音效${enabled?'開':'關'}</span>`;
    slider.value=String(Math.round(volume*100));
    if(master) master.gain.setTargetAtTime(enabled?volume:0,ctx.currentTime,0.035);
  }
  function noiseBuffer(seconds,loop=false){
    const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*seconds),ctx.sampleRate), a=b.getChannelData(0);
    let low=0;
    for(let i=0;i<a.length;i++){ low=low*0.97+(Math.random()*2-1)*0.03; a[i]=loop?low*5:Math.random()*2-1; }
    return b;
  }
  function crowdBed(){
    if(!ctx||!buffers.bed) return;
    if(crowdSource){ crowdSource.stop(); crowdSource.disconnect(); }
    crowdSource=ctx.createBufferSource(); crowdSource.buffer=buffers.bed; crowdSource.loop=true;
    crowdSource.connect(crowd); crowdSource.start();
    crowd.gain.setTargetAtTime(active?0.22:0,ctx.currentTime,.5);
  }
  function decode(){
    if(decoding) return; decoding=true;
    assets.then(rows=>Promise.all(rows.filter(Boolean).map(async ([name,data])=>{
      try { buffers[name]=await ctx.decodeAudioData(data); if(name==='bed') crowdBed(); } catch(e) {}
    })));
  }
  function sample(name,gain=1,rate=1,duration=0,bus=master){
    if(!ctx||ctx.state!=='running'||!buffers[name]||!enabled||document.hidden) return null;
    const s=ctx.createBufferSource(), g=ctx.createGain(); s.buffer=buffers[name]; s.playbackRate.value=rate;
    g.gain.value=gain; s.connect(g); g.connect(bus); voices.add(s);
    s.onended=()=>{ voices.delete(s); s.disconnect(); g.disconnect(); if(music?.source===s) music=null; };
    if(duration){
      const d=Math.min(duration,s.buffer.duration), t=ctx.currentTime;
      g.gain.setValueAtTime(gain,t+Math.max(0,d-.12)); g.gain.linearRampToValueAtTime(0,t+d); s.start(t,0,d);
    } else s.start();
    return {source:s,gain:g};
  }
  function stopMusic(){
    if(!music) return;
    const voice=music; music=null; voice.gain.gain.setTargetAtTime(0,ctx.currentTime,.07); voice.source.stop(ctx.currentTime+.3);
  }
  function duckMusic(){
    if(!music) return; const g=music.gain.gain, t=ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(.22,t,.025); g.setTargetAtTime(.8,t+.55,.18);
  }
  function homeRun(){
    stopMusic(); music=sample('homerun',.8);
    if(!music) fanfare();
  }
  function unlock(){
    if(!ctx){
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio){ button.disabled=true; button.title='此瀏覽器不支援音效'; return; }
      try {
        ctx=new Audio({latencyHint:'interactive'}); master=ctx.createGain(); master.gain.value=enabled?volume:0;
        const limiter=ctx.createDynamicsCompressor(); limiter.threshold.value=-3; limiter.knee.value=4; limiter.ratio.value=12; limiter.attack.value=.003; limiter.release.value=.12;
        master.connect(limiter); limiter.connect(ctx.destination);
        crowd=ctx.createGain(); crowd.gain.value=active?0.12:0; crowd.connect(master);
        const source=ctx.createBufferSource(), filter=ctx.createBiquadFilter();
        source.buffer=noiseBuffer(4,true); source.loop=true; filter.type='bandpass'; filter.frequency.value=680; filter.Q.value=0.6;
        source.connect(filter); filter.connect(crowd); source.start(); crowdSource=source; decode();
      } catch(e){ ctx=null; return; }
    }
    if(ctx.state==='suspended') ctx.resume().catch(()=>{});
  }
  function tone(freq,duration,gain=0.15,type='sine',delay=0,end=freq){
    if(!ctx||ctx.state!=='running'||!enabled) return;
    const t=ctx.currentTime+delay, o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t); o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(gain,t+0.008); g.gain.exponentialRampToValueAtTime(0.001,t+duration);
    o.connect(g); g.connect(master); o.start(t); o.stop(t+duration+0.02); o.onended=()=>{o.disconnect();g.disconnect();};
  }
  function noise(duration,gain,freq,q=0.7,delay=0,end=freq){
    if(!ctx||ctx.state!=='running'||!enabled) return;
    const t=ctx.currentTime+delay, s=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain();
    s.buffer=noiseBuffer(duration); f.type='bandpass'; f.frequency.setValueAtTime(freq,t); f.frequency.exponentialRampToValueAtTime(end,t+duration); f.Q.value=q;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(gain,t+0.005); g.gain.exponentialRampToValueAtTime(0.001,t+duration);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t+duration+0.02); s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};
  }
  function cheer(big=false){
    if(sample('cheer',big?0.42:0.25,1,big?5:2.6)) return;
    noise(big?2.5:1.2,big?0.6:0.3,1100,0.45,0,1600);
    for(let i=0;i<(big?12:5);i++) noise(0.055,0.11,1800,0.6,0.12+i*0.105);
    if(big){ tone(1900,0.7,0.028,'sine',0.4,2200); tone(1650,0.55,0.02,'sine',1,1950); }
  }
  function fanfare(){
    [392,523.25,659.25,783.99].forEach((f,i)=>{ tone(f,i===3?0.65:0.2,0.12,'triangle',i*0.16); tone(f*2,0.18,0.03,'sine',i*0.16); });
  }
  function play(name,power=0){
    if(!ctx||!enabled||document.hidden) return;
    if(['pitch','throw','swing','hit','mitt','strike'].includes(name)) duckMusic();
    if(name==='select') tone(740,0.065,0.055,'sine',0,1046);
    if(name==='start'){ stopMusic(); if(!sample('homerun',.4,1,1.9)) fanfare(); cheer(); }
    if(name==='pitch'||name==='throw') noise(0.17,name==='throw'?0.13:0.22,1700,0.8,0,450);
    if(name==='swing') noise(0.2,0.23,850,0.7,0,3000);
    if(name==='hit'){
      const p=Math.max(0,Math.min(1,power));
      if(!sample(p<.32?'soft':p>.72?'power':'line',.66+p*.28,.988+Math.random()*.024)){
        noise(0.075,0.7,2600+p*1400,0.5); tone(180+p*100,0.13,0.3,'triangle',0,65); tone(1500,0.045,0.13,'sine',0,700);
      }
    }
    if(name==='mitt'&&!sample(Math.random()<.5?'mitt1':'mitt2',.75)){ noise(0.065,0.38,480,0.6); tone(115,0.08,0.18,'sine',0,55); }
    if(name==='step'&&!sample('step',.3)) noise(0.09,0.09,420,0.7);
    if(name==='bounce'&&!sample('bounce',.45)){ noise(0.07,0.12,600); tone(90,0.06,0.08,'sine',0,50); }
    if(name==='strike'){ tone(440,0.09,0.08,'triangle'); tone(660,0.15,0.08,'triangle',0.08); }
    if(name==='out'){ tone(523,0.12,0.1,'triangle'); tone(392,0.23,0.1,'triangle',0.12); }
    if(name==='hitResult') cheer();
    if(name==='homerun'){ cheer(true); homeRun(); }
    if(name==='end'){ cheer(true); homeRun(); }
  }
  function setActive(value){
    active=value;
    if(crowd) crowd.gain.setTargetAtTime(active?(buffers.bed?0.22:0.12):0,ctx.currentTime,0.4);
    if(value) stopMusic();
  }
  button.onclick=()=>{ enabled=!enabled; unlock(); controls(); try {localStorage.setItem('baseball-sound',enabled?'on':'off');} catch(e) {} if(enabled) play('select'); };
  slider.addEventListener('input',()=>{ volume=Number(slider.value)/100; unlock(); controls(); try {localStorage.setItem('baseball-volume',String(volume));} catch(e) {} });
  document.addEventListener('pointerdown',unlock,{once:true});
  document.addEventListener('keydown',unlock,{once:true});
  document.addEventListener('visibilitychange',()=>{ if(!ctx) return; if(document.hidden) ctx.suspend().catch(()=>{}); else if(active||music) ctx.resume().catch(()=>{}); });
  controls();
  return {unlock,play,setActive,get state(){return {enabled,volume,active,context:ctx?.state||'locked',samples:Object.keys(buffers).length,voices:voices.size};}};
})();
