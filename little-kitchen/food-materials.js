const root=new URL('./assets/food-v11/',import.meta.url);
const clamp=n=>Math.max(0,Math.min(1,n));
export function appearance(p,method='raw'){
  const preparation=p.preparation||method;
  let base=p.cut||p.cracked||p.poured?'cut':'whole',id=p.id,finish=preparation==='pot'?'pot':'pan';
  if(p.pancake){base='cut';id='milk';finish='pancake';}
  else if(p.id==='egg'&&p.cracked&&p.mixed>.22){base='beaten';finish='curd';}
  else if(p.id==='flour'&&preparation!=='pot')finish='cut';
  const progress=clamp(((p.cooked||0)-.06)/.84);
  return {base,id,finish,progress:progress*progress*(3-2*progress),texture:p.cut>0};
}
function load(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=url;});}
export async function loadFoodMaterials(){
  const [frames,...atlases]=await Promise.all([fetch(new URL('frames.json',root)).then(r=>{if(!r.ok)throw new Error('Food frames unavailable');return r.json();}),...['cut','pan','pot','beaten','broth'].map(id=>load(new URL(`${id}.webp`,root)))]);
  const result={cut:{},pan:{},pot:{},beaten:null,broth:atlases[4]};
  function material(im,[x,y,w,h]){
    const sprite=document.createElement('canvas'),texture=document.createElement('canvas');sprite.width=sprite.height=texture.width=texture.height=200;
    // A full photo preserves natural contours; its interior supplies continuous flesh across repeated cuts.
    sprite.getContext('2d').drawImage(im,x,y,w,h,0,0,200,200);
    texture.getContext('2d').drawImage(im,x+w*.18,y+h*.18,w*.64,h*.64,0,0,200,200);
    texture.getContext('2d').drawImage(im,x,y,w,h,0,0,200,200);
    return {sprite,texture};
  }
  for(const [i,phase] of ['cut','pan','pot'].entries())for(const [id,frame] of Object.entries(frames[phase]))result[phase][id]=material(atlases[i],frame);
  result.beaten=material(atlases[3],[0,0,atlases[3].width,atlases[3].height]);
  return result;
}
