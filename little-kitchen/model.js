// One order, two ingredients, two cooking actions, one happy customer.
export const foods = {
  carrot: ['🥕', '紅蘿蔔', 'carrot'], broccoli: ['🥦', '花椰菜', 'broccoli'],
  rice: ['🍚', '白飯', 'rice'], seaweed: ['🌿', '海苔', 'seaweed'],
  bread: ['🍞', '麵包', 'bread'], tomato: ['🍅', '番茄', 'tomato'],
  flour: ['🌾', '麵粉', 'flour'], milk: ['🥛', '牛奶', 'milk'],
  strawberry: ['🍓', '草莓', 'strawberry'], fish: ['🐟', '魚', 'fish']
};
export const recipes = [
  {icon:'🍙', name:'小飯糰', en:'a rice ball', items:['rice','seaweed'], steps:['shape','plate']},
  {icon:'🍲', name:'蔬菜湯', en:'some soup', items:['carrot','broccoli'], steps:['chop','mix']},
  {icon:'🥪', name:'三明治', en:'a sandwich', items:['bread','tomato'], steps:['chop','plate']},
  {icon:'🥞', name:'小鬆餅', en:'some pancakes', items:['flour','milk'], steps:['mix','heat']},
  {icon:'🍹', name:'草莓牛奶', en:'strawberry milk', items:['strawberry','milk'], steps:['blend','plate']},
  {icon:'🍱', name:'小魚便當', en:'a lunch box', items:['fish','rice'], steps:['heat','plate']}
];
export const steps = {
  shape:['👐','捏一捏','Tap to make a rice ball.'],
  chop:['🔪','切一切','Tap to chop.'],
  mix:['🥄','攪一攪','Tap to stir.'],
  heat:['🍳','煮一煮','Tap to cook.'],
  blend:['🌀','打一打','Tap to blend.'],
  plate:['🍽️','裝盤囉','Tap to put it on the plate.']
};
export const guests = ['Bunny', 'Bear', 'Mia', 'Leo'];
export const phases = ['order','market','cook','serve','thanks'];
export function fresh() {
  return {version:2, phase:'order', recipe:0, ingredient:0, step:0, customer:0, served:0, sound:true};
}
export function current(s) { return recipes[s.recipe]; }
export function nextAction(s) {
  return {order:'accept',market:'buy',cook:'prepare',serve:'serve',thanks:'continue'}[s.phase];
}
export function advance(s, action) {
  if (action !== nextAction(s)) return false;
  switch (s.phase) {
    case 'order': s.phase='market'; s.ingredient=0; break;
    case 'market':
      s.ingredient++;
      if (s.ingredient===2) {s.phase='cook'; s.step=0;}
      break;
    case 'cook':
      s.step++;
      if (s.step===2) s.phase='serve';
      break;
    case 'serve': s.phase='thanks'; s.served++; break;
    case 'thanks':
      s.phase='order'; s.customer=(s.customer+1)%4;
      s.recipe=(s.recipe+1)%recipes.length; s.ingredient=0; s.step=0;
      break;
  }
  return true;
}
export function restore(raw, legacy) {
  const s=fresh();
  try {
    const x=JSON.parse(raw);
    if (x?.version===2) {
      const bounded=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max;
      if(bounded(x.recipe,5))s.recipe=x.recipe;
      if(bounded(x.customer,3))s.customer=x.customer;
      if(bounded(x.served,1000000))s.served=x.served;
      if(typeof x.sound==='boolean')s.sound=x.sound;
      if(phases.includes(x.phase))s.phase=x.phase;
      if(s.phase==='market')s.ingredient=x.ingredient===1?1:0;
      if(['cook','serve','thanks'].includes(s.phase))s.ingredient=2;
      if(s.phase==='cook')s.step=x.step===1?1:0;
      if(['serve','thanks'].includes(s.phase))s.step=2;
      return s;
    }
  } catch {}
  // Keep the old save intact; bring over preferences and completed meals.
  try {
    const x=JSON.parse(legacy);
    if(x?.version===1){
      if(typeof x.sound==='boolean')s.sound=x.sound;
      if(Number.isInteger(x.served)&&x.served>=0)s.served=Math.min(x.served,1000000);
      if(Number.isInteger(x.customer)&&x.customer>=0)s.customer=x.customer%4;
      if(Number.isInteger(x.recipe)&&x.recipe>=0)s.recipe=x.recipe%6;
    }
  } catch {}
  return s;
}
