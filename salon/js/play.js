import {accessories,guests} from './looks.js?v=17';
const lengths=[.52,.78,1],papers=['#fbe2ec','#ffe4d6','#fff0cf','#dff2f0','#e5e9fb','#ede5f8'];
export function restoreInspiration(value){
 if(!value||!Array.isArray(value.colors)||value.colors.length<1||value.colors.length>2||new Set(value.colors).size!==value.colors.length||!value.colors.every(i=>Number.isInteger(i)&&i>=0&&i<6)||!lengths.includes(value.length)||!accessories.includes(value.accessory))return null;
 const colors=[...value.colors],length=value.length,accessory=value.accessory;
 return {id:`surprise-${colors.join('-')}-${length}-${accessory}`,colors,length,accessory,paper:papers[colors[0]]};
}
export function surpriseWish(random=Math.random,previous=null,primary=null){
 const pick=n=>Math.min(n-1,Math.max(0,Math.floor(random()*n)));
 let wish;for(let i=0;i<8;i++){const first=Number.isInteger(primary)&&primary>=0&&primary<6?primary:pick(6),colors=[first];if(pick(2)){const others=[0,1,2,3,4,5].filter(c=>c!==first);colors.push(others[pick(5)])}wish=restoreInspiration({colors,length:lengths[pick(3)],accessory:accessories[pick(accessories.length)]});if(wish.id!==previous?.id)return wish;}
 return restoreInspiration({...wish,length:lengths[(lengths.indexOf(wish.length)+1)%lengths.length]});
}
export const stickerKeys=guests.flatMap(g=>Array.from({length:6},(_,i)=>g.id+':'+i));
export const validSticker=key=>stickerKeys.includes(key);
export function earnedSticker(guest,wish,progress){return Object.values(progress).length===3&&Object.values(progress).every(Boolean)&&validSticker(guest+':'+wish.colors[0])?guest+':'+wish.colors[0]:null;}
