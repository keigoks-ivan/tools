// Original 16-bar composition: warm electric piano, soft bass and a quiet chord pad.
// Render once after a user gesture. The looping buffer needs no network asset or timer.
const TEMPO = 76, BEAT = 60 / TEMPO, BAR = 4 * BEAT;
export const SCORE = [
  { name:'Cmaj9', bass:48, notes:[64,67,71,74] },
  { name:'G/B', bass:47, notes:[62,67,69,71] },
  { name:'Am9', bass:45, notes:[60,64,67,71] },
  { name:'Em7', bass:40, notes:[59,62,64,67] },
  { name:'Fmaj9', bass:41, notes:[60,64,67,69] },
  { name:'C/E', bass:40, notes:[60,64,67,71] },
  { name:'Dm9', bass:38, notes:[60,64,65,69] },
  { name:'G13', bass:43, notes:[59,64,65,69] },
  { name:'Fmaj9', bass:41, notes:[60,64,67,69] },
  { name:'G13', bass:43, notes:[59,64,65,69] },
  { name:'Em7', bass:40, notes:[59,62,64,67] },
  { name:'Am9', bass:45, notes:[60,64,67,71] },
  { name:'Dm9', bass:38, notes:[60,64,65,69] },
  { name:'G13', bass:43, notes:[59,64,65,69] },
  { name:'Cmaj9', bass:48, notes:[64,67,71,74] },
  { name:'Cmaj9', bass:48, notes:[64,67,71,74] },
];
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
export async function renderScore(sampleRate = 44100) {
  const duration = SCORE.length * BAR, tail = 3;
  const ctx = new OfflineAudioContext(2, Math.ceil((duration + tail) * sampleRate), sampleRate);
  const bus = ctx.createGain();bus.gain.value=.62;
  const filter = ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=3100;filter.Q.value=.4;
  const compressor = ctx.createDynamicsCompressor();compressor.threshold.value=-20;compressor.knee.value=16;compressor.ratio.value=2;
  bus.connect(filter);filter.connect(compressor);compressor.connect(ctx.destination);
  const reverb = ctx.createConvolver(), wet = ctx.createGain();wet.gain.value=.16;
  const impulse=ctx.createBuffer(2,sampleRate*2.1,sampleRate);let seed=17;
  for(let c=0;c<2;c++){const d=impulse.getChannelData(c);for(let i=0;i<d.length;i++){seed=(seed*16807)%2147483647;d[i]=(seed/2147483647*2-1)*(1-i/d.length)**3*.3;}}
  reverb.buffer=impulse;bus.connect(reverb);reverb.connect(wet);wet.connect(compressor);
  const piano=ctx.createPeriodicWave(new Float32Array(8),new Float32Array([0,1,.2,.13,.045,.025,.012,.005]));
  function note(midi,at,length,volume,instrument='piano',pan=0){
    const osc=ctx.createOscillator(),gain=ctx.createGain(),stereo=ctx.createStereoPanner();
    if(instrument==='piano')osc.setPeriodicWave(piano);else osc.type='sine';
    osc.frequency.value=hz(midi);stereo.pan.value=pan;
    const attack=instrument==='pad'?.34:.015,release=instrument==='pad'?.8:instrument==='bass'?.22:1.15;
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*(instrument==='pad'?.72:.16)),at+length);
    gain.gain.exponentialRampToValueAtTime(.0001,at+length+release);
    osc.connect(gain);gain.connect(stereo);stereo.connect(bus);osc.start(at);osc.stop(at+length+release+.02);
  }
  SCORE.forEach((chord,i)=>{
    const at=i*BAR;
    // Close voicings keep seventh and ninth chords smooth between bars.
    chord.notes.forEach((n,j)=>{note(n,at+j*.04,BEAT*2.7,.064,'piano',(j-1.5)*.17);note(n,at+.08,BAR-.7,.013,'pad',(j-1.5)*.21);});
    note(chord.bass,at,BEAT*1.8,.095,'bass',-.08);note(chord.bass+7,at+BEAT*2.5,BEAT,.052,'bass',.08);
    [0,2,1,3].forEach((n,j)=>note(chord.notes[n]+12,at+BEAT*(.5+j*.75),BEAT*.48,.032,'piano',(j%2?1:-1)*.28));
    // A sparse original melody leaves room for decisions and route feedback.
    if(i%2===0){note(chord.notes[2]+12,at+BEAT*.06,BEAT*.85,.06);note(chord.notes[1]+12,at+BEAT*1.15,BEAT*.6,.042);note(chord.notes[3]+12,at+BEAT*2.12,BEAT*1.1,.052);}
  });
  const rendered=await ctx.startRendering(),frames=Math.round(duration*sampleRate),loop=ctx.createBuffer(2,frames,sampleRate);
  // Fold the final reverb tail into the opening, making the loop seamless.
  for(let c=0;c<2;c++){const src=rendered.getChannelData(c),dest=loop.getChannelData(c);dest.set(src.subarray(0,frames));for(let i=frames;i<src.length;i++)dest[i-frames]+=src[i];}
  return loop;
}

export function createSoundtrack(onChange = ()=>{}) {
  let ctx,master,analyser,source,buffer,preparing,muted=true,busy=false,unavailable=false,suspendTimer;
  const emit=()=>onChange({muted,busy,unavailable});
  async function prepare(){
    if(!ctx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Audio unavailable');ctx=new Audio();master=ctx.createGain();master.gain.value=0;analyser=ctx.createAnalyser();analyser.fftSize=1024;master.connect(analyser);analyser.connect(ctx.destination);}
    await ctx.resume();
    if(!buffer){preparing ||= renderScore(ctx.sampleRate);buffer=await preparing;source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(master);source.start();}
  }
  async function toggle(){
    if(busy)return;
    clearTimeout(suspendTimer);
    if(!muted){muted=true;master.gain.cancelScheduledValues(ctx.currentTime);master.gain.setTargetAtTime(0,ctx.currentTime,.03);master.gain.setValueAtTime(0,ctx.currentTime+.15);suspendTimer=setTimeout(()=>{if(muted)ctx.suspend();},180);emit();return;}
    busy=true;emit();
    try{await prepare();muted=false;master.gain.cancelScheduledValues(ctx.currentTime);master.gain.setTargetAtTime(.48,ctx.currentTime,.12);}
    catch{muted=true;unavailable=true;ctx?.suspend();}
    busy=false;emit();
    if(document.hidden)visibility();
  }
  function visibility(){
    if(!ctx||muted)return;
    if(document.hidden){master.gain.cancelScheduledValues(ctx.currentTime);master.gain.setValueAtTime(0,ctx.currentTime);ctx.suspend();}
    else ctx.resume().then(()=>{if(!muted)master.gain.setTargetAtTime(.48,ctx.currentTime,.12);}).catch(()=>{muted=true;emit();});
  }
  document.addEventListener('visibilitychange',visibility);
  return {toggle,stats(){const values=new Float32Array(1024);analyser?.getFloatTimeDomainData(values);return{muted,busy,unavailable,context:ctx?.state||'uncreated',gain:master?.gain.value||0,rms:ctx?.state==='running'?Math.sqrt(values.reduce((n,x)=>n+x*x,0)/values.length):0,duration:buffer?.duration||0,chords:SCORE.map(c=>c.name)};}};
}
