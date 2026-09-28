// Fixed, locally hosted English female narration, with no per-device voice lottery.
export function createNarrator({allowed, getAudioContext, onStatus=()=>{}, fetcher=globalThis.fetch, synth=globalThis.speechSynthesis}) {
  const buffers=new Map();
  let active=null, request=0;
  function stop(){
    request++;
    try{active?.stop();}catch{}
    active=null;
    try{synth?.cancel();}catch{}
  }
  function fallback(text, token){
    if(token!==request||!allowed())return;
    const female=/Samantha|Ava|Allison|Victoria|Karen|Moira|Tessa|Zira|Jenny|Aria|Libby|Sonia|Susan|Hazel|Serena/i;
    const voice=synth?.getVoices().find(v=>/^en[-_]/i.test(v.lang)&&female.test(v.name));
    if(!voice){onStatus('unavailable');return;}
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang=voice.lang;utterance.voice=voice;utterance.rate=.78;utterance.pitch=1;
    synth.speak(utterance);onStatus('female-device-voice');
  }
  async function speak(key,text){
    stop();if(!allowed())return;
    const token=request;
    try{
      if(!/^[a-z0-9-]+$/.test(key))throw Error('Invalid voice clip');
      const context=getAudioContext();
      if(context.state==='suspended')await context.resume();
      if(token!==request||!allowed())return;
      let pending=buffers.get(key);
      if(!pending){
        pending=(async()=>{
          const response=await fetcher(new URL(`./assets/voice/${key}.wav`,import.meta.url));
          if(!response.ok)throw Error('Voice clip unavailable');
          return context.decodeAudioData(await response.arrayBuffer());
        })();
        buffers.set(key,pending);
        pending.catch(()=>buffers.delete(key));
      }
      const buffer=await pending;
      if(token!==request||!allowed())return;
      const source=context.createBufferSource();const gain=context.createGain();
      source.buffer=buffer;gain.gain.value=.95;
      source.connect(gain);gain.connect(context.destination);
      active=source;source.onended=()=>{if(active===source)active=null;source.disconnect();gain.disconnect();};
      source.start();onStatus('recorded-female');
    }catch{fallback(text,token);}
  }
  return {speak,stop};
}
