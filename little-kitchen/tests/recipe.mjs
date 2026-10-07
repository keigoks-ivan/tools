import assert from 'node:assert/strict';
import {area} from '../simulation.js';
import {createRecipe,ready,advance,pick,chop,crack,stir,pour,push,plate,feed,stepRecipe} from '../recipe-state.js';
const tick=(s,seconds)=>{for(let i=0;i<Math.ceil(seconds/.05);i++)stepRecipe(s,.05);};
const s=createRecipe();assert(!advance(s));assert(!pick(s,'fish'));assert(pick(s,'egg'));assert(!pick(s,'egg'));assert(pick(s,'tomato'));assert(ready(s));assert(advance(s));
const original=area(s.pieces[0].poly);assert.equal(chop(s,{x:200,y:0},{x:400,y:0}),0,'a stroke beyond the tomato cannot cut it');assert(!ready(s));
assert.equal(chop(s,{x:0,y:-180},{x:0,y:180}),1);assert.equal(s.pieces.length,2);assert(Math.abs(s.pieces.reduce((sum,p)=>sum+area(p.poly),0)-original)<1e-6);
const left=s.pieces.find(p=>p.x<0),right=s.pieces.find(p=>p.x>0);assert(Math.max(...left.poly.map(p=>p.x+left.x))<Math.min(...right.poly.map(p=>p.x+right.x)),'new halves must separate outward rather than overlap');
assert(advance(s));assert(crack(s));assert(!crack(s),'one shell can only be emptied once');assert(advance(s));stir(s,0);assert(!ready(s));stir(s,1000);assert.equal(s.mix,1);assert(advance(s));
assert(pour(s,'egg'));assert(!pour(s,'tomato'),'the second source waits while liquid is pouring');const eggs=s.food.length;tick(s,1.2);assert(!pour(s,'egg'));assert.equal(s.food.length,eggs,'pouring again cannot duplicate the egg');assert(pour(s,'tomato'));tick(s,1.2);assert.equal(s.food.length,eggs+2);assert(advance(s));
tick(s,20);assert.equal(s.cooked,0,'time alone cannot cook without heat');s.heat=true;tick(s,13);assert.equal(s.cooked,1);assert(!ready(s),'cooking the egg and scrambling it are different actions');
const before={x:s.food[0].x,y:s.food[0].y};push(s,{x:before.x-40,y:before.y},{x:before.x+50,y:before.y});tick(s,.2);assert.notEqual(s.food[0].x,before.x,'the spatula moves the actual food');push(s,{x:-50,y:0},{x:90,y:0});assert(ready(s));assert(advance(s));
assert(plate(s));assert(!s.heat);assert(!plate(s));assert(!advance(s),'food cannot be served before the pour animation completes');tick(s,1.2);assert(advance(s));
for(let bite=0;bite<3;bite++){assert(feed(s));assert(!feed(s),'repeated taps during a bite cannot eat extra portions');assert(!ready(s));tick(s,1.7);}assert.equal(s.bites,3);assert(!feed(s));assert(advance(s));assert.equal(s.stage,'done');assert(!advance(s));
for(const x of [-65,0,65]){const work=createRecipe();work.stage='chop';assert(chop(work,{x,y:-180},{x,y:180}));assert(Math.abs(work.pieces.reduce((sum,p)=>sum+area(p.poly),0)-original)<1e-6);if(x)assert.notEqual(area(work.pieces[0].poly),area(work.pieces[1].poly),'cut location changes portion sizes');}
const bounded=createRecipe();bounded.stage='chop';for(let i=0;i<100;i++){const p=bounded.pieces[i%bounded.pieces.length];chop(bounded,{x:p.x-160,y:p.y-160},{x:p.x+160,y:p.y+160});}assert(bounded.pieces.length<=12);assert(Math.abs(bounded.pieces.reduce((sum,p)=>sum+area(p.poly),0)-original)<1e-6);
const contact=createRecipe();contact.food=[{kind:'egg',x:0,y:0,vx:0,vy:0},{kind:'egg',x:0,y:0,vx:0,vy:0}];tick(contact,1);assert(Math.hypot(contact.food[0].x-contact.food[1].x,contact.food[0].y-contact.food[1].y)>40,'overlapping curds spread into readable separate pieces');
console.log('PASS: complete recipe, real cut position/area/separation, source conservation, heat and scrambling, actual food motion, guarded pours and bite cooldown.');
