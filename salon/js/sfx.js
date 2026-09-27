// Add filenames here when real recordings are placed in assets/sfx/.
// An empty directory remains completely silent and causes no file requests.
const available = new Set();
export function playSfx(name){
  if(!available.has(name))return;
  const audio=new Audio(`./assets/sfx/${name}.mp3`);
  audio.volume=.45;
  audio.play().catch(()=>{});
}
