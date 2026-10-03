// A toy kitchen: every ingredient works with every tool. No orders or recipes.
export const foods = {
  carrot:['🥕','紅蘿蔔','carrot','#ef9b45'], broccoli:['🥦','花椰菜','broccoli','#88ad58'],
  tomato:['🍅','番茄','tomato','#e77862'], potato:['🥔','馬鈴薯','potato','#e6cc97'],
  cucumber:['🥒','小黃瓜','cucumber','#a2bd79'], corn:['🌽','玉米','corn','#edcf68'],
  onion:['🧅','洋蔥','onion','#e4c6a2'], mushroom:['🍄','蘑菇','mushroom','#c5a68a'],
  pepper:['🫑','甜椒','bell pepper','#e76f58'], strawberry:['🍓','草莓','strawberry','#e99aab'],
  apple:['🍎','蘋果','apple','#edd2a0'], banana:['🍌','香蕉','banana','#f1dc9b'],
  orange:['🍊','柳橙','orange','#f2ad56'], egg:['🥚','雞蛋','egg','#efcf7b'],
  chicken:['🍗','雞肉','chicken','#e9c0b1'], fish:['🐟','鮭魚','salmon','#e6b59b'],
  shrimp:['🦐','蝦仁','shrimp','#edc2a8'], tofu:['⬜','豆腐','tofu','#eee3ca'],
  cheese:['🧀','起司','cheese','#edce7b'], bread:['🍞','麵包','bread','#d6a76b'],
  seaweed:['🌿','海苔','seaweed','#79975d'], rice:['🍚','白飯','rice','#ede0bb'],
  milk:['🥛','牛奶','milk','#f3e5d1'], flour:['🌾','麵粉','flour','#e8d4a2']
};
export const methods={pot:['🍲','煮湯'],pan:['🍳','平底鍋'],blender:['🥤','果汁機']};
export const guests=['Bunny','Bear','Mia','Leo'];
export function fresh(){return {version:3,scene:'kitchen',ingredients:[],method:null,customer:0,served:0,sound:true};}
export function toggleFood(s,id){
  if(!Object.hasOwn(foods,id))return false;
  const at=s.ingredients.indexOf(id);
  if(at<0)s.ingredients.push(id);else s.ingredients.splice(at,1);
  s.method=null;return true;
}
export function cook(s,method){
  if(!s.ingredients.length||!Object.hasOwn(methods,method))return false;
  s.method=method;return true;
}
export function dish(s){
  if(!s.method||!s.ingredients.length)return null;
  const has=id=>s.ingredients.includes(id);
  let icon='🍲',name='我的湯';
  if(s.method==='blender'){icon='🥤';name='我的飲料';}
  if(s.method==='pan'){
    if(has('flour')){icon='🥞';name='我的小鬆餅';}
    else if(has('rice')){icon='🍚';name='我的炒飯';}
    else if(has('bread')){icon='🥪';name='我的三明治';}
    else if(has('fish')){icon='🍱';name='我的小便當';}
    else{icon='🥘';name='我的香香料理';}
  }
  const colors=s.ingredients.map(id=>foods[id][3].slice(1).match(/../g).map(x=>parseInt(x,16)));
  const color='#'+[0,1,2].map(i=>Math.round(colors.reduce((sum,c)=>sum+c[i],0)/colors.length).toString(16).padStart(2,'0')).join('');
  return {icon,name,color,method:s.method,ingredients:[...s.ingredients]};
}
export function serve(s){
  const result=dish(s);if(!result||s.scene!=='kitchen')return false;
  s.served++;s.customer=(s.customer+1)%4;
  // Keep the chosen foods on the counter so the child can try another tool.
  s.method=null;return result;
}
export function restore(raw,legacy){
  const s=fresh();
  try{
    const x=JSON.parse(raw);
    if(x?.version===3){
      s.scene=x.scene==='market'?'market':'kitchen';
      if(Array.isArray(x.ingredients))s.ingredients=[...new Set(x.ingredients)].filter(id=>typeof id==='string'&&Object.hasOwn(foods,id));
      if(Object.hasOwn(methods,x.method)&&s.ingredients.length)s.method=x.method;
      if(Number.isInteger(x.customer)&&x.customer>=0)s.customer=x.customer%4;
      if(Number.isInteger(x.served)&&x.served>=0)s.served=Math.min(x.served,1000000);
      if(typeof x.sound==='boolean')s.sound=x.sound;
      return s;
    }
  }catch{}
  try{
    const x=JSON.parse(legacy);
    if([1,2].includes(x?.version)){
      if(typeof x.sound==='boolean')s.sound=x.sound;
      if(Number.isInteger(x.customer)&&x.customer>=0)s.customer=x.customer%4;
      if(Number.isInteger(x.served)&&x.served>=0)s.served=Math.min(x.served,1000000);
    }
  }catch{}
  return s;
}
