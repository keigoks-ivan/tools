// Root MIDI note, start and playable duration in the mono VSCO CE sample bank.
const HORN=[[53,0,3.5],[60,3.625,3.5]];
const TROMBONE=[[46,7.25,3.5]];
const TRUMPET=[[74,10.875,3.5]];
const STRINGS=[[43,14.5,3],[57,17.625,3],[69,20.75,3.5],[79,24.375,3.5]];
const SPICCATO=[[43,28,.75],[57,28.875,.75]];
const TIMPANI=[[46.8,29.75,2],[52.4,31.875,2]];

export async function loadOrchestra(ctx) {
  const response=await fetch(new URL('./assets/chamber-orchestra.mp3',import.meta.url));
  if(!response.ok)throw new Error('Orchestra HTTP '+response.status);
  return ctx.decodeAudioData(await response.arrayBuffer());
}

function sample(audio,tr,desk,pitch,t,duration,level,dest,release,priority,section) {
  const voice=section??audio._mv(null,priority);
  if(!voice)return;
  let near=desk[0];
  for(const anchor of desk)if(Math.abs(pitch-anchor[0])<Math.abs(pitch-near[0]))near=anchor;
  const [root,start,length]=near,rate=2**((pitch-root)/12);
  const source=audio.ctx.createBufferSource();
  source.buffer=tr.bank;source.playbackRate.value=rate;
  const available=length/rate,hold=Math.min(duration,available*.89);
  const end=t+Math.min(available,hold+release);
  const envelope=voice.last?voice.add(audio.ctx.createGain()):voice.out;
  envelope.connect(dest);
  const gain=envelope.gain;
  gain.setValueAtTime(level,t);
  gain.setValueAtTime(level,t+hold);
  gain.exponentialRampToValueAtTime(.00001,end);
  source.connect(envelope);
  voice.play(source,t,end,start);
  if(!section)voice.done();
}

// Sampled desks use the same mixer and voice limiter as the synthesis fallback.
export function playOrchestra(audio,tr,e,t,transpose) {
  const v=e.v??1,d=(e.d??1)*tr.spb,m=e.m+transpose;
  switch(e.k){
    case 'str': case 'ctr':
      sample(audio,tr,STRINGS,m,t,d,.43*v,e.k==='str'?tr.violin:tr.cello,.19,1);
      return true;
    case 'horn': case 'brass': {
      const section=audio._mv(null,1);if(!section)return true;
      const notes=e.n||[e.m],gain=.67*v/Math.sqrt(notes.length);
      for(const [i,note] of notes.entries()){
        const pitch=note+transpose,low=pitch<53,high=pitch>=67;
        const dest=e.k==='horn'?tr.L.horn:low?tr.trombone:high?tr.trumpet:tr.L.brass;
        sample(audio,tr,low?TROMBONE:high?TRUMPET:HORN,pitch,t+i*.009,d,gain,dest,.16,1,section);
      }
      section.done();
      return true;
    }
    case 'pad': {
      const section=audio._mv(null,1);if(!section)return true;
      for(const [i,note] of e.n.entries())
        sample(audio,tr,STRINGS,note+transpose,t+i*.009,d,.16*v,i<2?tr.padR:tr.padL,.26,1,section);
      section.done();
      return true;
    }
    case 'ost':
      if(!e.bow)return false;
      sample(audio,tr,SPICCATO,m,t,d,.48*v,tr.L.ost,.12,0);
      return true;
    case 'ti':
      sample(audio,tr,TIMPANI,m,t,1.15,.82*v,tr.L.dr,.4,1);
      return true;
    default: return false;
  }
}
