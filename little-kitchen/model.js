export const foods={carrot:['🥕','紅蘿蔔'],tomato:['🍅','番茄'],broccoli:['🥦','花椰菜'],strawberry:['🍓','草莓'],banana:['🍌','香蕉'],apple:['🍎','蘋果'],bread:['🍞','麵包'],flour:['🌾','麵粉'],butter:['🧈','奶油'],egg:['🥚','雞蛋'],milk:['🥛','牛奶'],cheese:['🧀','起司'],rice:['🍚','白飯'],seaweed:['🌿','海苔'],corn:['🌽','玉米'],fish:['🐟','魚'],shrimp:['🦐','蝦子'],mushroom:['🍄','蘑菇']};
export const stalls=[{icon:'🥕',name:'蔬菜攤',items:['carrot','tomato','broccoli'],color:'#98b88a'},{icon:'🍓',name:'水果攤',items:['strawberry','banana','apple'],color:'#e9a29e'},{icon:'🍞',name:'麵包攤',items:['bread','flour','butter'],color:'#e7be76'},{icon:'🥛',name:'牛奶雞蛋攤',items:['egg','milk','cheese'],color:'#a2c4d3'},{icon:'🍚',name:'米和海苔攤',items:['rice','seaweed','corn'],color:'#b3be8c'},{icon:'🐟',name:'鮮魚攤',items:['fish','shrimp','mushroom'],color:'#b6afd1'}];
export const recipes=[{id:'riceball',icon:'🍙',name:'愛心飯糰',items:['rice','seaweed'],steps:['wash','shape','plate']},{id:'soup',icon:'🍲',name:'暖暖蔬菜湯',items:['carrot','broccoli'],steps:['wash','chop','mix']},{id:'sandwich',icon:'🥪',name:'花園三明治',items:['bread','tomato'],steps:['wash','chop','plate']},{id:'pancake',icon:'🥞',name:'草莓鬆餅',items:['flour','egg','strawberry'],steps:['wash','mix','plate']},{id:'juice',icon:'🍹',name:'水果牛奶',items:['strawberry','milk'],steps:['wash','blend','plate']},{id:'fishrice',icon:'🍱',name:'小魚便當',items:['fish','rice'],steps:['wash','mix','plate']}];
export const steps={wash:['🚿','洗一洗'],chop:['🔪','切一切'],mix:['🥄','攪一攪'],shape:['👐','捏飯糰'],blend:['🌀','打一打'],plate:['🍽️','擺盤']};
export function fresh(){return{scene:'shop',recipe:0,stall:0,pantry:{},loaded:[],step:0,taps:0,ready:false,paid:false,coins:3,served:0,customer:0,decor:0,apron:0,sound:true,free:false,method:'mix'};}
export function restore(raw){const s=fresh();try{const x=JSON.parse(raw);if(!x||x.version!==1)return s;
for(const key of ['coins','served','customer','decor','apron'])if(Number.isInteger(x[key])&&x[key]>=0)s[key]=Math.min(x[key],999);
s.coins=Math.min(s.coins,9);s.customer%=4;s.decor%=4;s.apron%=3;if(typeof x.sound==='boolean')s.sound=x.sound;
for(const key of Object.keys(foods))if(Number.isInteger(x.pantry?.[key]))s.pantry[key]=Math.max(0,Math.min(x.pantry[key],9));
if(['shop','market','kitchen'].includes(x.scene))s.scene=x.scene;
if(Number.isInteger(x.recipe)&&x.recipe>=0&&x.recipe<recipes.length)s.recipe=x.recipe;
if(Number.isInteger(x.stall)&&x.stall>=0&&x.stall<stalls.length)s.stall=x.stall;
s.free=x.free===true;s.method=x.method==='blend'?'blend':'mix';
if(Array.isArray(x.loaded))s.loaded=[...new Set(x.loaded)].filter(id=>foods[id]&&(s.free||recipes[s.recipe].items.includes(id))).slice(0,s.free?2:3);
if(canCook(s)){s.step=Number.isInteger(x.step)?Math.max(0,Math.min(3,x.step)):0;s.taps=Number.isInteger(x.taps)?Math.max(0,Math.min(2,x.taps)):0;s.ready=s.step===3;}
s.paid=x.paid===true&&!s.loaded.length;
}catch{}return s;}
export function current(s){return s.free?{id:'free',icon:s.method==='blend'?'🥤':'🥣',name:'我的創意料理',items:s.loaded,steps:['wash',s.method,'plate']}:recipes[s.recipe];}
export function missing(s){return s.free?[]:current(s).items.filter(id=>!s.loaded.includes(id)&&!s.pantry[id]);}
export function add(s,id){if(!foods[id]||(s.pantry[id]||0)>=9)return false;s.pantry[id]=(s.pantry[id]||0)+1;s.coins=Math.max(0,s.coins-1);return true;}
export function selectRecipe(s,index){resetCooking(s);s.free=index===-1;s.recipe=index===-1?0:index;s.paid=false;}
export function resetCooking(s){for(const id of s.loaded)s.pantry[id]=Math.min(9,(s.pantry[id]||0)+1);s.loaded=[];s.step=0;s.taps=0;s.ready=false;}
export function loadFood(s,id){if(s.ready||s.step>0||!s.pantry[id]||s.loaded.includes(id))return false;if(s.free?s.loaded.length>=2:!current(s).items.includes(id))return false;s.pantry[id]--;s.loaded.push(id);return true;}
export function canCook(s){return s.free?s.loaded.length===2:current(s).items.every(id=>s.loaded.includes(id));}
export function cook(s){if(!canCook(s)||s.ready||s.paid)return false;s.taps++;if(s.taps>=3){s.taps=0;s.step++;if(s.step>=current(s).steps.length)s.ready=true;}return true;}
export function serve(s){if(!s.ready||s.paid)return false;s.paid=true;s.ready=false;s.loaded=[];s.coins=Math.min(9,s.coins+3);s.served++;return true;}
export function nextGuest(s){s.customer=(s.customer+1)%4;s.recipe=(s.recipe+1)%recipes.length;s.free=false;s.loaded=[];s.step=0;s.taps=0;s.ready=false;s.paid=false;}
