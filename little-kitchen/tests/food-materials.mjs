import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {foods} from '../model.js';
import {appearance} from '../food-materials.js';
import {createPlay,ingredients,chop,moveBoard,pour,tick} from '../play-state.js';
const frames=JSON.parse(readFileSync(new URL('../assets/food-v11/frames.json',import.meta.url)));
for(const phase of ['cut','pan','pot']){
  assert.deepEqual(Object.keys(frames[phase]).sort(),Object.keys(foods).sort(),'each cooking state covers every ingredient');
  assert(existsSync(new URL(`../assets/food-v11/${phase}.webp`,import.meta.url)));
  for(const [x,y,w,h] of Object.values(frames[phase]))assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=1536&&y+h<=1024,'photo stays within its atlas');
}
const s=createPlay();ingredients(s,'tomato');assert.equal(appearance(s.board[0]).base,'whole');chop(s,{x:120,y:270},{x:610,y:270});
assert(s.board.every(p=>appearance(p).base==='cut'&&appearance(p).texture));
const edgeY=p=>p.y+p.edges.at(-1).a.y*p.scale;
assert(edgeY(s.board[0])>edgeY(s.board[1]),'knife separates the exposed faces instead of pushing them together');
const speeds=s.board.map(p=>p.vy);assert(speeds[0]>0&&speeds[1]<0,'cut halves move away from the knife line');
moveBoard(s,'pan',s.board[0].uid);moveBoard(s,'pot');s.heat.pan=s.heat.pot=1;
const raw=appearance(s.vessels.pan[0]);for(let i=0;i<100;i++)tick(s,.05);const halfway=appearance(s.vessels.pan[0]);
assert.equal(raw.progress,0);assert(halfway.progress>0&&halfway.progress<1,'food changes while the stove is running');
for(let i=0;i<110;i++)tick(s,.05);assert.equal(appearance(s.vessels.pan[0]).progress,1);
assert.equal(appearance(s.vessels.pan[0]).finish,'pan');assert.equal(appearance(s.vessels.pot[0]).finish,'pot');
pour(s,'pan');pour(s,'pot');assert.deepEqual(s.plate.map(p=>appearance(p).finish),['pan','pot'],'serving a mixed plate preserves how each piece was cooked');
const egg={id:'egg',cracked:true,cooked:1,mixed:.7,preparation:'pan'};assert.equal(appearance(egg).finish,'curd');assert.equal(appearance({...egg,mixed:0}).finish,'pan');assert.equal(appearance({...egg,cooked:0}).base,'beaten');
assert.equal(appearance({id:'flour',poured:true,preparation:'pan'}).finish,'cut','dry flour alone does not become a pancake');
assert.equal(appearance({id:'flour',pancake:true,preparation:'pan',cooked:1}).finish,'pancake');
for(const method of ['pan','pot'])for(const id of Object.keys(foods)){
  const vessel=createPlay();ingredients(vessel,id,method);const p=vessel.vessels[method][0];p.x=490;p.y=160;p.angle=1.1;tick(vessel,.05);
  const [rx,ry]=method==='pan'?[161,115.5]:[136.5,83.85],cos=Math.cos(p.angle),sin=Math.sin(p.angle);
  for(const v of p.poly)assert(Math.hypot((p.x-350+(v.x*cos-v.y*sin)*p.scale)/rx,(p.y-245+(v.x*sin+v.y*cos)*p.scale)/ry)<=1.00001,'whole ingredient remains visible inside its cooker');
}
console.log('PASS: 72 food-state frames, visible cut separation, continuous raw-to-cooked progress, fried/boiled appearance retained on mixed plates, beaten/fried/scrambled eggs and batter.');
