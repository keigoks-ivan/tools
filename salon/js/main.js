import {guests,wishes} from './looks.js?v=6';
import {SalonMemory} from './memory.js?v=6';
import {ReplayUI} from './replay-ui.js?v=6';
import {ornament,createDecorate} from './ornaments.js?v=6';
import {createLayout,toWorld,inStage} from './layout.js?v=6';
import {HairSystem,setHairTexture,setHairPlate} from './hair.js?v=6';
import {guest,palette} from './data.js?v=6';
import {createCut} from './tools/cut.js?v=6';
import {createGrow} from './tools/grow.js?v=6';
import {createColor} from './tools/color.js?v=6';
import {createComb} from './tools/comb.js?v=6';
const canvas=document.getElementById('scene'),box=document.getElementById('game'),ctx=canvas.getContext('2d',{alpha:false});
canvas.width=box.clientWidth;canvas.height=box.clientHeight;ctx.fillStyle='#fff2db';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#efadc0';for(let i=0;i<5;i++){let a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(canvas.width/2+Math.cos(a)*14,canvas.height/2+Math.sin(a)*14,11,0,Math.PI*2);ctx.fill()}ctx.fillStyle='#f9d37b';ctx.beginPath();ctx.arc(canvas.width/2,canvas.height/2,8,0,Math.PI*2);ctx.fill();
let art={};const artSets=new Map();
await Promise.all(Object.entries(guest.art).map(([name,url])=>new Promise(resolve=>{const img=new Image();img.onload=()=>{art[name]=img;resolve()};img.onerror=()=>resolve();img.src=url})));
artSets.set('cocoa',art);
const loadImage=url=>new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>resolve(null);im.src=url});
await Promise.all(guests.filter(g=>g.atlas).map(async g=>{const atlas=await loadImage(g.atlas);if(!atlas)return;const set={offsets:g.artOffsets||{}};['normal','blink','happy','surprise'].forEach((name,i)=>{const cell=document.createElement('canvas');cell.width=Math.round(atlas.width/2);cell.height=Math.round(atlas.height/2);cell.getContext('2d').drawImage(atlas,(i%2)*atlas.width/2,Math.floor(i/2)*atlas.height/2,atlas.width/2,atlas.height/2,0,0,cell.width,cell.height);set[name]=cell});artSets.set(g.id,set)}));
const memory=await new SalonMemory().open();
let currentGuest=guests[0],wishIndex=0;const ornaments=[],history=[],drafts={};let saveTimer;
const textureImage=new Image();textureImage.onload=()=>setHairTexture(textureImage);textureImage.src='./assets/art/hair-texture.png';
const paintedHair=new Image();await new Promise(resolve=>{paintedHair.onload=()=>{setHairPlate(paintedHair);resolve()};paintedHair.onerror=resolve;paintedHair.src='./assets/art/hair-plate.png'});
const env={hair:new HairSystem(),H:844,colorIndex:0,react,drawTool};
const tools={cut:createCut(env),grow:createGrow(env),color:createColor(env),comb:createComb(env),decorate:createDecorate(env,ornaments,save)};env.ornament='bow';
const names=['cut','grow','color','comb','reset'],atlasButtons=[{x:42,y:676},{x:119,y:676},{x:197,y:676},{x:275,y:676},{x:353,y:676}];
let selected='cut',pointer=null,expression='normal',reactionUntil=0,nextExpression=null,blinkAt=performance.now()+4200,blinkUntil=0,last=performance.now(),popAt=0,headDx=0;
function state(){return {version:1,guest:currentGuest.id,hair:env.hair.snapshot(),ornaments:structuredClone(ornaments),wish:wishIndex};}
function bookmark(){history.push(state());if(history.length>8)history.shift()}
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{drafts[currentGuest.id]=state();memory.draft({active:currentGuest.id,drafts})},350)}
function stop(){if(pointer){if(!pointer.ui)tools[selected].onUp();pointer=null}}
function restore(snapshot){
 const profile=guests.find(g=>g.id===snapshot?.guest);if(!profile)return false;
 stop();currentGuest=profile;art=artSets.get(profile.id)||artSets.get('cocoa');env.hair.reset(profile);
 if(!env.hair.restore(snapshot.hair))env.hair.reset(profile);
 ornaments.splice(0,ornaments.length,...(Array.isArray(snapshot.ornaments)?snapshot.ornaments.filter(a=>Number.isFinite(a.x)&&Number.isFinite(a.y)).slice(0,12):[]));wishIndex=Number.isInteger(snapshot.wish)?Math.max(0,Math.min(wishes.length-1,snapshot.wish)):0;save();return true;
}
function chooseGuest(id){
 stop();drafts[currentGuest.id]=state();history.length=0;
 if(drafts[id])restore(drafts[id]);else{currentGuest=guests.find(g=>g.id===id)||guests[0];art=artSets.get(id)||artSets.get('cocoa');env.hair.reset(currentGuest);ornaments.length=0;wishIndex=(wishIndex+1)%wishes.length;save()}
 react('happy');
}
function photoCanvas(hair=env.hair,set=art,items=ornaments,expression='happy'){
 const c=document.createElement('canvas');c.width=640;c.height=860;const p=c.getContext('2d');p.scale(640/390,640/390);p.translate(0,-86.5);paintGuest(p,hair,set,expression,items,0);return c;
}
function capture(){const image=photoCanvas().toDataURL('image/jpeg',.88);return {id:globalThis.crypto?.randomUUID?.()||Date.now().toString(36),created:Date.now(),image,state:state()}}
const previews=new Map();
const replay=new ReplayUI({memory,guests:guests.filter(g=>artSets.has(g.id)),stop,react,save,capture,restore:s=>{bookmark();restore(s)},
 guestId:()=>currentGuest.id,wish:()=>wishIndex,selected:()=>selected,ornament:()=>env.ornament,color:()=>env.colorIndex,
 chooseGuest,chooseWish:i=>{wishIndex=i;save()},chooseOrnament:kind=>{env.ornament=kind;selected='decorate'},
 tie:mode=>{bookmark();const count=env.hair.tie(mode,env.colorIndex);if(!count&&mode!=='loose'){selected='grow';popAt=performance.now()}react('happy');save()},
 canUndo:()=>history.length>0,undo:()=>{const previous=history.pop();if(previous)restore(previous)},
 preview:id=>{if(!previews.has(id)){const profile=guests.find(g=>g.id===id);previews.set(id,photoCanvas(new HairSystem(profile),artSets.get(id),[],'normal'))}return previews.get(id)}
});
if(memory.current?.drafts){Object.assign(drafts,memory.current.drafts);restore(drafts[memory.current.active])}
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);drafts[currentGuest.id]=state();memory.draft({active:currentGuest.id,drafts})});
function react(type){expression=type;reactionUntil=performance.now()+(type==='surprise'?500:1200);nextExpression=type==='surprise'?'happy':null}
let layout, background;
const coarsePointer=matchMedia('(pointer: coarse)');
function size(){
 const r=box.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);
 if(r.width<1||r.height<1)return;
 if(layout&&layout.width===r.width&&layout.height===r.height&&canvas.width===Math.round(r.width*d))return;
 // A rotation ends the gesture, but never resets the haircut or color.
 if(pointer){const old=pointer;pointer=null;if(!old.ui)tools[selected].onUp();if(canvas.hasPointerCapture(old.id))canvas.releasePointerCapture(old.id)}
 layout=createLayout(r.width,r.height,coarsePointer.matches);
 canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);
 ctx.setTransform(canvas.width/r.width,0,0,canvas.height/r.height,0,0);
 canvas.dataset.layout=JSON.stringify(layout);
 box.dataset.orientation=layout.landscape?'landscape':'portrait';
 background=ctx.createLinearGradient(0,0,r.width,r.height);background.addColorStop(0,'#b5d0bc');background.addColorStop(.6,'#97b8a4');background.addColorStop(1,'#c3d6ba');
}
new ResizeObserver(size).observe(box);
window.visualViewport?.addEventListener('resize',size);
window.addEventListener('resize',size);
coarsePointer.addEventListener('change',size);
size();
function pos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function uiDown(p){
 if(replay.hit(p))return true;
 for(let i=0;i<6;i++){const c=layout.colors[i];if(Math.hypot(p.x-c.x,p.y-c.y)<c.r+5){if(selected!=='decorate')selected='color';env.colorIndex=i;popAt=performance.now();return true}}
 for(let i=0;i<5;i++){const b=layout.buttons[i];if(Math.hypot(p.x-b.x,p.y-b.y)<b.r+4){if(i===4){bookmark();env.hair.reset();ornaments.length=0;react('happy');save()}else selected=names[i];popAt=performance.now();return true}}
 return !inStage(p,layout);
}
canvas.addEventListener('pointerdown',e=>{
 e.preventDefault();if(pointer)return;const p=pos(e);canvas.setPointerCapture(e.pointerId);
 pointer={id:e.pointerId,ui:uiDown(p)};if(!pointer.ui){bookmark();tools[selected].onDown(toWorld(p,layout));}
});
canvas.addEventListener('pointermove',e=>{
 if(!pointer||pointer.id!==e.pointerId||pointer.ui)return;e.preventDefault();
 const coalesced=e.getCoalescedEvents?.(),events=coalesced?.length?coalesced:[e];
 for(const q of events){const p=pos(q);if(!inStage(p,layout)){end(e);break}tools[selected].onMove(toWorld(p,layout))}
});
function end(e){if(!pointer||pointer.id!==e.pointerId)return;if(!pointer.ui){tools[selected].onUp();save()}pointer=null}
canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
function plate(target,img,dy=0){if(img)target.drawImage(img,0,0,img.width,img.height*611/844,0,dy,390,611)}
function head(target,img,dx=0,dy=0){target.save();target.translate(dx,0);target.beginPath();target.moveTo(194,176);target.bezierCurveTo(145,174,117,218,121,280);target.bezierCurveTo(109,275,111,319,141,330);target.quadraticCurveTo(157,348,180,355);target.lineTo(178,376);target.quadraticCurveTo(202,390,225,377);target.lineTo(224,350);target.quadraticCurveTo(249,339,260,314);target.bezierCurveTo(280,312,280,267,266,270);target.bezierCurveTo(269,221,242,175,194,176);target.closePath();target.clip();plate(target,img,dy);target.restore()}
function paintGuest(target,hair,set,show='normal',items=[],dx=0){plate(target,set.normal);hair.draw(target,false);head(target,set[show]||set.normal,dx,set.offsets?.[show]||0);hair.draw(target,true);
 for(const band of hair.activeTies())ornament(target,'bow',band.x+dx,band.y,29,band.color??0);
 for(const a of items)ornament(target,a.kind,a.x+dx,a.y,45,a.color,a.angle);
}
function drawTool(context,type,x,y,size=44){const b=atlasButtons[names.indexOf(type)]||atlasButtons[0],r=36;context.save();context.beginPath();context.arc(x,y,size/2,0,Math.PI*2);context.clip();const im=artSets.get('cocoa').normal;if(im)context.drawImage(im,(b.x-r)/390*im.width,(b.y-r)/844*im.height,r*2/390*im.width,r*2/844*im.height,x-size/2,y-size/2,size,size);context.restore()}
function drawBackdrop(){
 ctx.fillStyle=background;ctx.fillRect(0,0,layout.width,layout.height);
 // Quiet wall pattern fills the extra tablet/desktop room without stretching the guest.
 ctx.save();ctx.globalAlpha=.24;
 for(let y=35;y<layout.stage.h-40;y+=122)for(let x=35;x<layout.stage.w;x+=156){
  const px=x+(Math.round(y/122)%2)*35;ctx.fillStyle='#fff0cf';
  for(let i=0;i<5;i++){let a=i*Math.PI*2/5;ctx.beginPath();ctx.ellipse(px+Math.cos(a)*7,y+Math.sin(a)*7,5,6,a,0,Math.PI*2);ctx.fill()}
  ctx.fillStyle='#e9b67d';ctx.beginPath();ctx.arc(px,y,3,0,Math.PI*2);ctx.fill();
 }ctx.restore();
}
function drawUI(now){
 const d=layout.dock,g=ctx.createLinearGradient(d.x,d.y,d.x+d.w,d.y+d.h);
 g.addColorStop(0,'#fff6e3');g.addColorStop(1,'#f2dfbd');
 ctx.save();ctx.shadowColor='#805e4b38';ctx.shadowBlur=18;ctx.shadowOffsetY=-3;
 ctx.beginPath();ctx.roundRect(d.x+1,d.y+1,d.w-2,d.h+28,28);ctx.fillStyle=g;ctx.fill();ctx.shadowBlur=0;
 ctx.strokeStyle='#fffaf0';ctx.lineWidth=3;ctx.stroke();ctx.restore();
 for(let i=0;i<5;i++){
  const b=layout.buttons[i],active=names[i]===selected,age=(now-popAt)/360;
  const lift=active?1.03+(age>=0&&age<1?Math.sin(age*Math.PI)*.045:0):1;
  ctx.save();ctx.shadowColor='#94674c44';ctx.shadowBlur=active?10:4;ctx.shadowOffsetY=active?4:2;
  drawTool(ctx,names[i],b.x,b.y-(active?2:0),b.r*2*lift);ctx.restore();
  if(active){ctx.beginPath();ctx.arc(b.x,b.y-2,b.r*lift+2,0,Math.PI*2);ctx.strokeStyle='#fffdf1';ctx.lineWidth=3;ctx.stroke()}
 }
 for(let i=0;i<6;i++){
  const {x,y,r}=layout.colors[i],c=palette[i],gradient=ctx.createLinearGradient(x-r,y-r,x+r,y+r);
  gradient.addColorStop(0,`rgb(${c.map(v=>Math.round(v+(255-v)*.32)).join(',')})`);gradient.addColorStop(.45,`rgb(${c.join(',')})`);gradient.addColorStop(1,`rgb(${c.map(v=>Math.round(v*.79)).join(',')})`);
  ctx.save();ctx.shadowColor='#90654944';ctx.shadowBlur=4;ctx.shadowOffsetY=2;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=gradient;ctx.fill();ctx.restore();
  ctx.strokeStyle='#fffaf0';ctx.lineWidth=3;ctx.stroke();ctx.save();ctx.translate(x-r*.32,y-r*.4);ctx.rotate(-.6);ctx.beginPath();ctx.ellipse(0,0,r*.34,r*.15,0,0,Math.PI*2);ctx.fillStyle='#ffffffaa';ctx.fill();ctx.restore();
  if(selected==='color'&&env.colorIndex===i){ctx.beginPath();ctx.arc(x,y,r+5,0,Math.PI*2);ctx.strokeStyle='#a76c91';ctx.lineWidth=2.5;ctx.stroke()}
 }
}
let frameCount=0,lastReport=performance.now();
function render(now){const rawDt=(now-last)/1000,dt=Math.min(.034,rawDt);last=now;
 frameCount++; if(now-lastReport>1000){canvas.dataset.stats=JSON.stringify({...env.hair.stats(),guest:currentGuest.id,mode:replay.mode,photos:memory.photos.length,persistent:memory.persistent,ornaments:ornaments.length,ties:env.hair.activeTies().length,wish:wishIndex,selected,colorIndex:env.colorIndex,fps:Math.round(frameCount*1000/(now-lastReport)),artReady:Object.keys(art).length});lastReport=now;frameCount=0;}
 if(now>reactionUntil){if(nextExpression){expression=nextExpression;nextExpression=null;reactionUntil=now+1100}else expression='normal'}
 if(now>blinkAt&&expression==='normal'){blinkUntil=now+150;blinkAt=now+3000+Math.random()*3000}
 const show=now<blinkUntil?'blink':expression;headDx=Math.sin(now*.0008)*.24;
 if(!replay.mode){tools[selected].update?.(dt);env.hair.step(dt,844,headDx);}
 ctx.setTransform(canvas.width/layout.width,0,0,canvas.height/layout.height,0,0);drawBackdrop();
 ctx.save();ctx.beginPath();ctx.rect(layout.stage.x,layout.stage.y,layout.stage.w,layout.stage.h);ctx.clip();
 ctx.translate(layout.world.x,layout.world.y);ctx.scale(layout.world.scale,layout.world.scale);
 paintGuest(ctx,env.hair,art,show,ornaments,headDx);env.hair.drawFallen(ctx);if(!replay.mode)tools[selected].drawOverlay(ctx);ctx.restore();
 drawUI(now);replay.draw(ctx,layout,now);requestAnimationFrame(render)
}
requestAnimationFrame(render);
// Diagnostics are only exposed to local developer inspection; no text is drawn in the game.
window.__salon={hair:env.hair,stats:()=>env.hair.stats(),get selected(){return selected},artReady:Object.keys(art).length};
