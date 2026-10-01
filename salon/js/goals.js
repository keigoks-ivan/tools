import {palette} from './data.js?v=14';
export const wishNames=['玫瑰派對','海洋精靈','陽光花園','彩虹夢想','月光仙子','蜜桃蝴蝶'];
export const colorNames=['玫瑰粉','蜜桃橘','陽光金','薄荷綠','天空藍','薰衣草紫'];
export function checkWish(hair,items,wish){
 const strands=hair.strands.filter(s=>!s.bang),nodes=strands.flatMap(s=>s.nodes.slice(1));
 const colors=wish.colors.map(index=>{const target=palette[index];return nodes.filter(p=>Math.hypot(...p.c.map((v,i)=>v-target[i]))<72).length/Math.max(1,nodes.length)>=.08});
 const length=strands.reduce((sum,s)=>sum+s.rest.reduce((a,b)=>a+b,0),0)/Math.max(1,strands.length);
 // Arc length still works when the hair is tied or curled into a bun.
 const target=440*wish.length;
 return {colors:colors.every(Boolean),length:Math.abs(length-target)<=65,accessory:items.some(a=>a.kind===wish.accessory)};
}
