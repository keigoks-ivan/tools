import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Solid } from '../mech/zero/kit.js';
import { InfantryHUD } from './hud.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function context(){
  const state={fills:[],strokes:[],texts:[],path:[],stack:[],rotations:[],globalAlpha:1,lineWidth:1,textAlign:'left',
    save(){this.stack.push({globalAlpha:this.globalAlpha,lineWidth:this.lineWidth,textAlign:this.textAlign,fillStyle:this.fillStyle,strokeStyle:this.strokeStyle});},
    restore(){Object.assign(this,this.stack.pop());},beginPath(){this.path=[];},arc(...args){this.path.push({arc:args});},moveTo(...args){this.path.push({move:args});},lineTo(...args){this.path.push({line:args});},
    fillRect(x,y,w,h){this.fills.push({x,y,w,h,color:this.fillStyle,alpha:this.globalAlpha});},
    strokeRect(x,y,w,h){this.strokes.push({rect:[x,y,w,h],color:this.strokeStyle,width:this.lineWidth});},
    fill(){this.fills.push({path:[...this.path],color:this.fillStyle,alpha:this.globalAlpha});},
    stroke(){this.strokes.push({path:[...this.path],color:this.strokeStyle,width:this.lineWidth});},
    fillText(text,x,y){this.texts.push({text,x,y,color:this.fillStyle});},rotate(angle){this.rotations.push(angle);},measureText:text=>({width:text.length*6}),createRadialGradient:()=>({stops:[],addColorStop(offset,color){this.stops.push({offset,color});}}),
  };
  return new Proxy(state,{get:(o,k)=>k in o?o[k]:()=>{}});
}
function actor({id=1,x=0,y=0,z=14,type='line',hp=115,dead=false,deathAge=0,barT=0,headY=1.65}={}){
  const e={id,pos:V(x,y,z),type,hp,hp0:type==='heavy'?280:115,dead,deathAge,barT,T:type==='heavy'?{armor:.72}:{}};
  e.s={root:{scale:{y:1},visible:true},headPos(out){out.copy(e.pos).y+=headY;return out;},chestPos(out){out.copy(e.pos).y+=headY*.64;return out;}};
  return e;
}
function fixture({W=800,H=650,scoped=false,enemies=[actor()],cleanup=false,pending=0}={}){
  const x=context(),camera=new THREE.PerspectiveCamera(72,W/H,.05,400);camera.position.set(0,1.62,0);camera.lookAt(0,1.62,20);camera.updateMatrixWorld();
  const player={pos:V(),eye:V(0,1.62,0),hp:100,shield:60,yaw:0,sprintK:0,dead:false};
  const G={camera,player,vm:{scoped,cur:'smg',ads:0,spreadNow:.02,kick:V(),W:{mag:30,reload:2,fov:8,name:'SMG'},ammo:{smg:30},reloadT:-1,breath:1,holding:false},enemies,allies:[],cleanup,nades:3,hurt:0,
    map:{solid:new Solid(),ground:()=>0},mission:{target:{x:0,z:30,name:{zh:'目標',en:'OBJECTIVE'}},scenario:{code:'01 / TEST'},mode:'defend',phase:'attack',wave:1,pending,integrity:100,capture:0,rules:{capture:6}},noticeT:0,prompt:''};
  const hud=Object.assign(Object.create(InfantryHUD.prototype),{x,cam:camera,c:{width:W,height:H},d:1,hit:0,mk:'hit',feedback:null,dmg:[],clearAim:0});
  return {G,hud,x,W,H};
}
function bars(f){const contacts=f.hud._enemyContacts(1/60,f.W,f.H,f.G);f.hud._enemyBars(f.W,f.H,contacts,'en');return contacts;}
const enemyLabels=f=>f.x.texts.filter(t=>/RIFLEMAN|ASSAULT|SUPPORT|SNIPER|HEAVY|DOWN/.test(t.text));

test('visible infantry has a readable type, distance and health bar before the first hit',()=>{
  const f=fixture();const [c]=bars(f);assert(c.visible);assert.equal(enemyLabels(f).length,1);assert.match(enemyLabels(f)[0].text,/RIFLEMAN · 14 m/);
  assert(f.x.fills.some(r=>r.color==='#eef6f8'&&r.h===5&&r.w>40));assert(f.x.texts.some(t=>t.text==='115 / 115'));
});
test('actual wall geometry hides both wounded and unhurt bars, but exposed heads remain visible over cover',()=>{
  const f=fixture({enemies:[actor({hp:30,barT:2.6})]});f.G.map.solid.add({x0:-3,x1:3,y0:0,y1:3,z0:5,z1:6});
  const [hidden]=bars(f);assert(!hidden.visible);assert.equal(enemyLabels(f).length,0);assert.equal(f.G.enemies[0].barT,2.6,'HUD must not shorten the Combat-owned timer');
  const low=fixture();low.G.map.solid.add({x0:-3,x1:3,y0:0,y1:1.3,z0:5,z1:6});assert(bars(low)[0].visible);assert.equal(enemyLabels(low).length,1);
});
test('behind-camera, off-screen, hidden meshes and enemies outside the scope aperture never reveal bars',()=>{
  const hidden=actor({id:4,x:1});hidden.s.root.visible=false;
  const f=fixture({enemies:[actor({id:1,z:-10,barT:2.6}),actor({id:2,x:80,z:10}),hidden]});
  assert(bars(f).every(c=>!c.visible));assert.equal(enemyLabels(f).length,0);
  const scope=fixture({scoped:true,enemies:[actor({id:1,z:10}),actor({id:2,x:8,z:10})]});const contacts=bars(scope);assert(contacts[0].visible);assert(!contacts[1].visible);assert.equal(enemyLabels(scope).length,1);
});
test('blood bars follow the animated skeleton rather than a fixed standing height',()=>{
  const e=actor({headY:.9}),f=fixture({enemies:[e]});const [c]=bars(f);assert.equal(c.head.y,.9);
  const standing=e.s.headPos; e.s.headPos=out=>{out.copy(e.pos).y+=1.65;return out;};const [s]=f.hud._enemyContacts(0,f.W,f.H,f.G);assert(s.sy<c.sy,'a crouched head needs a lower screen anchor');e.s.headPos=standing;
});
test('heavy armor has a cold blue frame and damage trails recede independently of remaining HP',()=>{
  const e=actor({type:'heavy',hp:280}),f=fixture({enemies:[e]});bars(f);e.hp=90;e.barT=2.6;
  f.x.fills=[];f.x.strokes=[];const c=f.hud._enemyContacts(.1,f.W,f.H,f.G);f.hud._enemyBars(f.W,f.H,c,'en');
  const trail=f.x.fills.find(r=>r.color==='rgba(255,214,130,.95)'),life=f.x.fills.find(r=>r.color==='#ff4a4a'&&r.h===5);assert(trail.w>life.w);assert(f.x.strokes.some(r=>r.color==='#9ec3dc'&&r.rect));
  f.hud._enemyContacts(1,f.W,f.H,f.G);assert.equal(e.barG,e.hp/e.hp0);assert.equal(e.barT,2.6,'only Combat advances its damage timer');
});
test('downed bars fade over death age and never become live radar contacts',()=>{
  const e=actor({hp:0,dead:true,deathAge:.1,barT:2.6}),f=fixture({enemies:[e],cleanup:true});bars(f);assert(enemyLabels(f).some(t=>t.text==='DOWN'));assert(f.x.fills.some(r=>r.h===5&&r.alpha<1));
  e.deathAge=.41;f.x.texts=[];bars(f);assert.equal(enemyLabels(f).length,0);assert.deepEqual(f.hud._cleanupEnemies(f.G),[]);
});
test('hit, armor, head and kill confirmations retain series colors and kill priority',()=>{
  for(const [kind,color,text]of [['hit','#fff','HIT'],['armor','#9ec3dc','ARMOR HIT'],['head','#ffb347','HEADSHOT'],['kill','#ff4a4a','KILL CONFIRMED']]){
    const f=fixture();f.hud.marker(kind);if(kind==='kill'){f.hud.marker('hit');assert.equal(f.hud.mk,'kill');}
    f.hud._combatFeedback(.01,f.W,f.H,'en');assert(f.x.strokes.some(s=>s.color===color));assert(f.x.strokes.some(s=>s.color==='rgba(0,0,0,.55)'));assert(f.x.texts.some(t=>t.text===text));
  }
});
test('received-hit arcs show front, right and left directions and expire',()=>{
  for(const angle of [0,Math.PI/2,-Math.PI/2]){const f=fixture();f.hud.hurt(angle);f.hud._combatFeedback(.1,f.W,f.H,'en');const red=f.x.strokes.find(s=>s.color.startsWith('rgba(255,60,50,'));assert(red);const arc=red.path.find(p=>p.arc).arc;assert(Math.abs((arc[3]+arc[4])/2-(angle-Math.PI/2))<1e-9);f.hud._combatFeedback(1.2,f.W,f.H,'en');assert.equal(f.hud.dmg.length,0);}
});
test('shield and health direction arcs preserve the incoming angle and use distinct damage colors',()=>{
  for(const [kind,prefix,excluded]of [['shield','rgba(127,243,255,','rgba(255,60,50,'],['health','rgba(255,60,50,','rgba(127,243,255,']]){
    const f=fixture(),angle=-Math.PI/3;f.hud.hurt(angle,kind);assert.equal(f.hud.dmg[0].kind,kind);assert.equal(f.hud.dmg[0].a,angle);assert.equal(f.hud.dmg[0].t,1.2);
    f.hud._combatFeedback(.1,f.W,f.H,'en');const colored=f.x.strokes.find(s=>s.color.startsWith(prefix));assert(colored);assert(!f.x.strokes.some(s=>s.color.startsWith(excluded)));
    const arc=colored.path.find(p=>p.arc).arc;assert(Math.abs((arc[3]+arc[4])/2-(angle-Math.PI/2))<1e-9);
  }
});
test('last two show numbered roles, distance and floor guidance through cover without disclosing HP',()=>{
  const f=fixture({enemies:[actor({id:1,type:'heavy',hp:90,y:5,z:20}),actor({id:2,type:'sniper',y:-3,z:24})],cleanup:true});f.G.map.solid.add({x0:-8,x1:8,y0:-8,y1:10,z0:5,z1:6});
  f.hud.drawBattle(1/60,f.G,'en');assert(f.x.texts.some(t=>t.text==='LAST 1 · HEAVY'));assert(f.x.texts.some(t=>t.text==='LAST 2 · SNIPER'));assert(f.x.texts.some(t=>/▲ \+5 m · TRACKED/.test(t.text)));assert(f.x.texts.some(t=>/▼ -3 m · TRACKED/.test(t.text)));
  assert(!f.x.texts.some(t=>t.text==='90 / 280'));assert(f.x.texts.some(t=>t.text==='▲'));assert(f.x.texts.some(t=>t.text==='▼'));
  f.G.mission.pending=1;assert.deepEqual(f.hud._cleanupEnemies(f.G),[]);f.G.mission.pending=0;f.G.enemies.push(actor({id:3}));assert.deepEqual(f.hud._cleanupEnemies(f.G),[]);
});
test('scoped and phone HUD keeps last-enemy information and a replay clears all combat confirmations',()=>{
  const f=fixture({W:375,H:812,scoped:true,enemies:[actor({type:'sniper'})],cleanup:true});f.hud.drawBattle(1/60,f.G,'zh');assert(f.x.texts.some(t=>t.text==='殘敵 1 · 狙擊手'));assert(f.x.texts.some(t=>t.text==='殘敵定位 1'));
  f.hud.marker('kill');f.hud.hurt(.5);f.hud.resetBattle();assert.equal(f.hud.hit,0);assert.equal(f.hud.feedback,null);assert.equal(f.hud.dmg.length,0);assert.equal(f.hud.clearAim,0);
});
test('north-up radar mirrors the camera left/right convention and rotates the player arrow consistently',()=>{
  const f=fixture({enemies:[actor({x:6,z:14})]}),contacts=f.hud._enemyContacts(0,f.W,f.H,f.G);
  assert(contacts[0].sx<f.W/2,'world +X is on the camera left when facing +Z');
  f.G.player.yaw=Math.PI/2;f.hud._infantryRadar(f.W,f.H,f.G,contacts,'en');
  const red=f.x.fills.find(r=>r.color==='#ff4a4a'&&r.path?.some(p=>p.arc));assert(red.path[0].arc[0]<0,'the same enemy must be left on the north-up radar');assert(f.x.rotations.includes(-Math.PI/2));
});
test('shield-only impacts use a cyan vignette and break notice, while health impacts use red',()=>{
  const shield=fixture();shield.G.shieldHurt=.8;shield.G.player.shield=40;shield.hud.drawBattle(1/60,shield.G,'en');
  const gradients=shield.x.fills.filter(r=>r.color?.stops);assert(gradients.some(r=>r.color.stops.some(s=>s.color.startsWith('rgba(70,190,220,'))));assert(!gradients.some(r=>r.color.stops.some(s=>s.color.startsWith('rgba(210,40,25,'))));assert(shield.x.fills.some(r=>r.color==='#c9fbff'));
  shield.G.player.shield=0;shield.hud.drawBattle(1/60,shield.G,'en');assert(shield.x.texts.some(t=>t.text==='SHIELD BROKEN'));
  const health=fixture();health.G.hurt=.8;health.hud.drawBattle(1/60,health.G,'zh');assert(health.x.fills.some(r=>r.color?.stops?.some(s=>s.color.startsWith('rgba(210,40,25,'))));
});
