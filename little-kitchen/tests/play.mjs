import assert from 'node:assert/strict';
import {foods} from '../model.js';
import {area} from '../simulation.js';
import {createPlay,shelves,ingredients,chop,moveBoard,pour,stir,tick,describe,taste,feed,season,clearPlace} from '../play-state.js';
import {view,toFood,onFood} from '../play-art.js';
assert.deepEqual(shelves.flat().sort(),Object.keys(foods).sort());
for(const method of ['pan','pot','blender','plate'])for(const id of Object.keys(foods)){
  const s=createPlay();assert(ingredients(s,id,method));assert.equal(s.station,'board','taking ingredients does not force a station');
  assert.equal(method==='plate'?s.plate.length:s.vessels[method].length,1);
  if(method!=='plate'){s.method=method;assert(pour(s));assert.equal(s.plate[0].id,id);assert.equal(s.vessels[method].length,0);assert(!pour(s),'an empty vessel cannot duplicate food');}
}
const s=createPlay();ingredients(s,'tomato');const before=area(s.board[0].poly);assert.equal(chop(s,{x:120,y:270},{x:610,y:270}),1);assert.equal(s.board.length,2);assert(Math.abs(s.board.reduce((n,p)=>n+area(p.poly),0)-before)<1e-6);
const color=describe(s.board).color;assert.equal(color,foods.tomato[3],'chopping cannot change the mixture color');
assert.equal(moveBoard(s,'pot',s.board[0].uid),1);assert.equal(s.board.length,1);assert.equal(s.vessels.pot.length,1);assert.equal(moveBoard(s,'pan'),1);ingredients(s,'egg','pan');ingredients(s,'carrot');s.heat.pan=1;s.heat.pot=.65;
for(let i=0;i<230;i++)tick(s,.05);assert.equal(s.station,'board');assert(s.vessels.pan.every(p=>p.cooked>=.99));assert(s.vessels.pot[0].cooked>.7,'other pots continue while cutting');assert.equal(s.board.length,1);
assert.equal(describe(s.vessels.pan,'pan').kind,'fried-egg');for(let i=0;i<4;i++)stir(s,{x:235,y:245},{x:350,y:245});assert.equal(describe(s.vessels.pan,'pan').kind,'scrambled-egg');
const soupAmount=s.vessels.pot.length;assert(pour(s,'pan'));const first=s.plate.length;s.method='pot';assert(pour(s));assert.equal(s.plate.length,first+soupAmount,'separate cooking rounds can share one plate');assert.equal(s.board.length,1,'serving does not clear the cutting board');
const bite=feed(s);assert(bite);assert.equal(feed(s),false,'chewing blocks repeated feed events');const remaining=s.plate.length;for(let i=0;i<40;i++)tick(s,.05);assert.equal(s.chew,0);if(remaining)assert(feed(s));assert.equal(s.station,'serve');
const fruit=createPlay();fruit.method='blender';ingredients(fruit,'strawberry','blender');ingredients(fruit,'milk','blender');for(let i=0;i<100;i++)tick(fruit,.05);assert.equal(fruit.blend,0);fruit.blending=true;for(let i=0;i<62;i++)tick(fruit,.05);assert(fruit.blend>.99);fruit.blending=false;const level=fruit.blend;for(let i=0;i<40;i++)tick(fruit,.05);assert.equal(fruit.blend,level);assert.equal(describe(fruit.vessels.blender,'blender').kind,'smoothie');const pink=describe(fruit.vessels.blender,'blender').color;ingredients(fruit,'banana','blender');assert.notEqual(describe(fruit.vessels.blender,'blender').color,pink);tick(fruit,.05);assert(fruit.blend<level,'freshly added fruit must still be blended');
const cake=createPlay();ingredients(cake,'flour','pan');ingredients(cake,'milk','pan');assert.equal(describe(cake.vessels.pan,'pan').kind,'pancake');assert(cake.vessels.pan.every(p=>p.pancake));
const rice=createPlay();ingredients(rice,'rice','pan');ingredients(rice,'shrimp','pan');assert.equal(describe(rice.vessels.pan,'pan').kind,'fried-rice');
const sandwich=createPlay();ingredients(sandwich,'bread','pan');ingredients(sandwich,'cheese','pan');assert.equal(describe(sandwich.vessels.pan,'pan').kind,'sandwich');
const preferences=createPlay();ingredients(preferences,'carrot','pot');const d=describe(preferences.vessels.pot,'pot');assert.equal(taste(d,0),'yum');assert.equal(taste(d,1),'love');
assert.equal(taste({...d,spices:{pepper:.7}},0),'spicy');assert.equal(taste({...d,spices:{lemon:.7}},1),'sour');assert.equal(taste({...d,spices:{salt:1.05}},1),'salty');
const odd=createPlay();odd.method='blender';ingredients(odd,'fish','blender');odd.blending=true;for(let i=0;i<62;i++)tick(odd,.05);assert.equal(taste(describe(odd.vessels.blender,'blender'),0),'surprise');
cake.station='stove';cake.method='pan';season(cake,'pepper');season(cake,'pepper');assert(pour(cake));assert.equal(cake.plateSpices.pepper,.7);assert.equal(cake.spices.pan.pepper,0,'a new pan does not inherit the old seasoning');assert.equal(feed(cake),'spicy');
preferences.station='stove';preferences.method='pot';ingredients(preferences,'egg','pan');clearPlace(preferences);assert.equal(preferences.vessels.pot.length,0);assert.equal(preferences.vessels.pan.length,1,'clearing one container preserves the others');
for(const [w,h] of [[390,517],[320,292],[844,196],[1280,414]]){
  const l=view(w,h);for(const station of ['board','stove']){const point={x:375,y:290};const screen=onFood(point,l,station),back=toFood(screen,l,station);assert(Math.abs(back.x-point.x)<1e-8&&Math.abs(back.y-point.y)<1e-8);}
  assert(l.transfer.x+l.transfer.r<w);assert(l.transfer.y+l.transfer.r<=h+.1,'serving target remains in the viewport');
}
console.log('PASS: 24 ingredients × 4 destinations, independent workspaces, real cut conservation, cooking without stage advancement, eggs/pancakes/rice/sandwiches/smoothies, adding mid-cook, portion consumption, guest preferences, spices, motor stop, selective clearing and responsive input coordinates.');
